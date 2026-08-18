import { analyze } from "@/lib/engines/analysisPipeline";
import {
  DEFAULT_RISK_PARAMS,
  ENTRY_CHASE_TOLERANCE_ATR,
  MAX_REVERSAL_RISK,
  MIN_RISK_REWARD_FINAL,
  MIN_RISK_REWARD_PARTIAL,
  MIN_RISK_REWARD_PLAN,
  PROFIT_LOCK_R,
  PROTECT_AFTER_R,
  READING_GATES,
  RUNNER_TRAIL_START_R,
  type RiskParams,
} from "@/lib/engines/strategy";
import type { AnalysisResult, Candle, Direction, ReadingState } from "@/lib/engines/types";
import { CausalWindow, evaluateSignal, type CriterionCheck } from "@/lib/t4/backtest/lookahead";
import { stableHash } from "@/lib/t4/validation/hash";
import type { CriterionState, SignalLifecycle } from "@/lib/t4/validation/types";

/**
 * MOTOR ÚNICO DA TÉCNICA T4 (requisito 2).
 *
 * Existe UMA implementação das regras, dos pesos e dos critérios. LIVE e
 * BACKTEST chamam esta mesma função: se o histórico usasse uma lógica e a
 * operação ao vivo usasse outra, o backtest não provaria nada sobre a
 * operação real. Aqui isso é impossível por construção — os dois caminhos
 * entram por `evaluateT4Core`, que por sua vez chama o mesmo `analyze()` do
 * pipeline de produção.
 *
 * DUAS ESCALAS QUE NUNCA SE MISTURAM (requisito 1):
 * - CONFLUÊNCIA T4 0–100%: quanto do SETUP está confirmado agora. É contagem
 *   ponderada de critérios objetivos. NÃO é probabilidade de lucro.
 * - ROBUSTEZ / EVIDÊNCIA ESTATÍSTICA 0–100: qualidade da VALIDAÇÃO histórica
 *   (amostra, OOS, forward, estabilidade, risco). Vive em `robustness.ts`.
 */

export const T4_CORE_VERSION = "T4 v1.0";

/**
 * Critérios da técnica com seus pesos. A soma é exatamente 100 — validada em
 * teste. Mudou peso, id ou `requiresClose`? O `configHash` muda, e por
 * contrato isso exige NOVA VERSÃO da estratégia (requisito 8).
 */
export const T4_CRITERIA_CONFIG = [
  { id: "direction", label: "Direção técnica definida", weight: 10, requiresClose: false },
  { id: "structure", label: "Estrutura / CHoCH alinhada", weight: 16, requiresClose: true },
  { id: "liquidity", label: "Captura de liquidez válida", weight: 14, requiresClose: false },
  { id: "poi", label: "POI dominante válido", weight: 12, requiresClose: false },
  { id: "reaction", label: "Reação no candle fechado", weight: 12, requiresClose: true },
  { id: "retest", label: "Reteste da zona", weight: 10, requiresClose: false },
  { id: "expansion", label: "Expansão / deslocamento a favor", weight: 8, requiresClose: false },
  { id: "sequence", label: "Sequência causal completa", weight: 10, requiresClose: true },
  { id: "noContradiction", label: "Sem contradição bloqueante", weight: 5, requiresClose: false },
  { id: "riskReward", label: "Espaço técnico real >= 3R", weight: 3, requiresClose: false },
] as const;

export type T4CriterionId = (typeof T4_CRITERIA_CONFIG)[number]["id"];

/** Limiares objetivos usados pelos critérios. Fazem parte do configHash. */
export const T4_CORE_THRESHOLDS = {
  minStructureConviction: 30,
  minStructureRegimeStrength: 50,
  minReactionImbalance: 8,
  minReactionConviction: 30,
  minPoiStrength: 55,
  minExpansionDisplacement: 0.35,
  maxLocationInTrend: 0.82,
  maxReversalRisk: MAX_REVERSAL_RISK,
  minClosedCandles: READING_GATES.minClosedCandles,
  minRiskReward: MIN_RISK_REWARD_PLAN,
} as const;

/**
 * CONFIGURAÇÃO CONGELADA da versão. Tudo que altera uma decisão está aqui —
 * pesos, limiares e os parâmetros de gestão. É o insumo do `configHash`.
 */
export const T4_CORE_CONFIG = {
  version: T4_CORE_VERSION,
  criteria: T4_CRITERIA_CONFIG,
  thresholds: T4_CORE_THRESHOLDS,
  management: {
    firstContractR: MIN_RISK_REWARD_PARTIAL,
    secondContractR: 5,
    protectAfterR: PROTECT_AFTER_R,
    profitLockR: PROFIT_LOCK_R,
    runnerTrailStartR: RUNNER_TRAIL_START_R,
    minRiskRewardFinal: MIN_RISK_REWARD_FINAL,
    entryChaseToleranceAtr: ENTRY_CHASE_TOLERANCE_ATR,
  },
} as const;

/**
 * Hash da configuração (requisito 8/18). Determinístico e sensível a qualquer
 * mudança de regra, peso ou parâmetro.
 */
export function t4ConfigHash(config: unknown = T4_CORE_CONFIG): string {
  return stableHash("cfg", config);
}

export const T4_CONFIG_HASH = t4ConfigHash();

/** Soma dos pesos — precisa ser 100 para a confluência ser lida como %. */
export const T4_TOTAL_WEIGHT = T4_CRITERIA_CONFIG.reduce((sum, item) => sum + item.weight, 0);

/**
 * Leitura de mercado usada para decidir. Construída EXCLUSIVAMENTE a partir
 * de `window.visible()` (passado + candle atual).
 */
export interface T4CoreContext {
  analysis: AnalysisResult;
  candleClosed: boolean;
}

/** Leitura mínima para o backtest, onde não existe captura visual de tela. */
export function backtestReading(window: Candle[], lastCandleClosed: boolean): ReadingState {
  return {
    sufficient: window.length >= READING_GATES.minClosedCandles,
    timeframeConfirmed: true,
    // Dados históricos vêm com preço numérico exato: não há conversão
    // pixel→preço para calibrar, então a escala é confiável por definição.
    priceScaleReady: true,
    calibrationConfidence: 100,
    candleQuality: 100,
    closedCandles: window.length,
    lastCandleClosed,
    issues:
      window.length >= READING_GATES.minClosedCandles ? [] : ["Histórico fechado insuficiente."],
    label: "SÉRIE HISTÓRICA",
  };
}

/**
 * Os critérios T4. Cada `evaluate` lê apenas o contexto causal já construído
 * — nenhum deles pode tocar a série completa.
 */
export function buildT4Criteria(context: T4CoreContext): CriterionCheck[] {
  const { analysis } = context;
  const t = T4_CORE_THRESHOLDS;
  const direction = analysis.direction;
  const pa = analysis.priceAction;
  const capture = analysis.internalConfirmation.capture;
  const sms = analysis.internalConfirmation.sms;
  const poi = analysis.mainPoi;
  const plan = analysis.plan;

  const evaluators: Record<T4CriterionId, () => { met: boolean; detail: string | null }> = {
    direction: () => ({
      met: direction !== "NEUTRO",
      detail: `direção=${direction}`,
    }),
    structure: () => {
      // Estrutura confirmada = mudança estrutural (SMS/CHoCH) na direção OU
      // regime de tendência claramente a favor com convicção mínima.
      const smsAligned = sms.confirmed && sms.direction === direction;
      const trendRegimeAligned =
        (direction === "COMPRA" && analysis.regime.regime === "TREND_UP") ||
        (direction === "VENDA" && analysis.regime.regime === "TREND_DOWN");
      const trendConfirmed =
        trendRegimeAligned &&
        analysis.regime.strength >= t.minStructureRegimeStrength &&
        pa.conviction >= t.minStructureConviction;
      return {
        met: smsAligned || trendConfirmed,
        detail: `sms=${sms.confirmed ? sms.direction : "não"} regime=${analysis.regime.regime}(${Math.round(analysis.regime.strength)})`,
      };
    },
    liquidity: () => ({
      met: capture.valid && capture.direction === direction,
      detail: `captura=${capture.detail.status} lado=${capture.detail.side ?? "—"}`,
    }),
    poi: () => ({
      met: poi !== null && poi.condition !== "invalidado" && poi.strength >= t.minPoiStrength,
      detail: poi ? `${poi.kind} força=${Math.round(poi.strength)} ${poi.condition}` : "sem POI",
    }),
    reaction: () => {
      const met =
        direction === "COMPRA"
          ? pa.imbalance >= t.minReactionImbalance && pa.conviction >= t.minReactionConviction
          : direction === "VENDA"
            ? pa.imbalance <= -t.minReactionImbalance && pa.conviction >= t.minReactionConviction
            : false;
      return {
        met,
        detail: `imbalance=${pa.imbalance.toFixed(0)} convicção=${pa.conviction.toFixed(0)}`,
      };
    },
    retest: () => {
      const inPoi = poi !== null && analysis.price >= poi.lower && analysis.price <= poi.upper;
      const tested = poi !== null && (poi.condition === "testado" || poi.condition === "mitigado");
      const stage = analysis.sequence.stages.find((item) => item.stage === "retest");
      return {
        met: inPoi || tested || Boolean(stage?.met),
        detail: inPoi ? "preço dentro do POI" : tested ? `POI ${poi?.condition}` : "sem reteste",
      };
    },
    expansion: () => {
      const stage = analysis.sequence.stages.find((item) => item.stage === "structureShift");
      const displaced = sms.confirmed && sms.direction === direction;
      return {
        met: displaced || Boolean(stage?.met),
        detail: `deslocamento=${displaced ? "sim" : "não"}`,
      };
    },
    sequence: () => ({
      met:
        analysis.sequence.complete &&
        !analysis.sequence.staleSweep &&
        !analysis.sequence.orderViolated,
      detail: analysis.sequence.complete
        ? "sequência completa"
        : `faltando: ${analysis.sequence.missing.join(", ") || "—"}`,
    }),
    noContradiction: () => {
      const blocking = analysis.contradictions.filter((item) => item.severity === "bloqueia");
      return {
        met: blocking.length === 0,
        detail: blocking.length === 0 ? "sem contradição bloqueante" : blocking[0]!.description,
      };
    },
    riskReward: () => ({
      met: plan !== null && plan.stopDistance > 0 && plan.riskRewardPlan >= t.minRiskReward,
      detail: plan ? `RR=${plan.riskRewardPlan.toFixed(2)}` : "sem plano",
    }),
  };

  return T4_CRITERIA_CONFIG.map((item) => ({
    id: item.id,
    label: item.label,
    weight: item.weight,
    requiresClose: item.requiresClose,
    evaluate: () => evaluators[item.id](),
  }));
}

/** Decisão completa do motor no instante de um candle. */
export interface T4CoreDecision {
  /** Instante do candle atual (chartClock). */
  at: number;
  strategyVersion: string;
  configHash: string;
  direction: Direction;
  lifecycle: SignalLifecycle;
  /** Confluência 0–100: critérios CONFIRMADOS. Não é chance de lucro. */
  confluence: number;
  /** Confluência incluindo o que aguarda fechamento de candle. */
  potentialConfluence: number;
  criteria: CriterionState[];
  setup: string;
  quality: string;
  regime: string;
  price: number;
  /** Gates duros: se houver algum, a oportunidade é REJECTED_BY_GATES. */
  gateBlockers: string[];
  gatesPassed: boolean;
  plan: AnalysisResult["plan"];
  reason: string;
  analysis: AnalysisResult;
}

export interface T4CoreOptions {
  riskParams?: RiskParams;
  /** Sobrescreve a leitura (LIVE passa a leitura real da captura de tela). */
  reading?: ReadingState;
}

/**
 * PONTO ÚNICO DE DECISÃO.
 *
 * Recebe a janela causal — nunca a série inteira — e devolve a decisão do T4
 * naquele candle. Chamado igualmente pelo backtest (varredura histórica) e
 * pela operação ao vivo (candle corrente).
 */
export function evaluateT4Core(
  window: CausalWindow,
  candleClosed: boolean,
  options: T4CoreOptions = {},
): T4CoreDecision | null {
  const visible = window.visible();
  if (visible.length < READING_GATES.minClosedCandles) return null;

  const reading = options.reading ?? backtestReading(visible, candleClosed);
  const analysis = analyze(visible, {
    reading,
    riskParams: options.riskParams ?? DEFAULT_RISK_PARAMS,
  });
  if (!analysis) return null;

  const context: T4CoreContext = { analysis, candleClosed };
  const signal = evaluateSignal(window, buildT4Criteria(context), candleClosed);

  const gateBlockers = [...analysis.t4.blockers, ...analysis.blockers];
  return {
    at: analysis.t,
    strategyVersion: T4_CORE_VERSION,
    configHash: T4_CONFIG_HASH,
    direction: analysis.direction,
    lifecycle: signal.lifecycle,
    confluence: signal.confirmedConfluence,
    potentialConfluence: signal.potentialConfluence,
    criteria: signal.criteria,
    setup: analysis.t4.setup,
    quality: analysis.t4.quality,
    regime: analysis.regime.regime,
    price: analysis.price,
    gateBlockers: [...new Set(gateBlockers)],
    gatesPassed: gateBlockers.length === 0 && analysis.t4.productionReady,
    plan: analysis.plan,
    reason: signal.reason,
    analysis,
  };
}

/**
 * Atalho para a operação AO VIVO: a série é a janela de candles já lida da
 * tela, e o candle atual é o último. Mesmo motor, mesmos pesos, mesmo hash.
 */
export function evaluateT4Live(
  window: Candle[],
  reading: ReadingState,
  riskParams?: RiskParams,
): T4CoreDecision | null {
  if (window.length === 0) return null;
  const ordered = window.slice().sort((a, b) => a.t - b.t);
  return evaluateT4Core(new CausalWindow(ordered, ordered.length - 1), reading.lastCandleClosed, {
    reading,
    riskParams,
  });
}
