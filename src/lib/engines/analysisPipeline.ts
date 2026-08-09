import { analyzeHSS } from "./hssEngine";
import { buildCaptureResult } from "./liquidityCaptureGate";
import { buildLiquidityMap } from "./liquidityEngine";
import { assessDataQuality, extractFeatures, type Features } from "./marketFeatures";
import { detectMarketState } from "./marketStateEngine";
import { buildPOIs, selectMainPoi } from "./poiEngine";
import { readPriceAction } from "./priceActionEngine";
import { assessRisk, buildPlan } from "./riskEngine";
import { analyzeSMS } from "./smsEngine";
import { detectRegime } from "./regimeEngine";
import { buildContradictions } from "./contradictionEngine";
import { evaluateCausalSequence } from "./causalSequence";
import { volatilityContext } from "./marketBehavior";
import { evaluateT4 } from "./t4Engine";
import {
  DEFAULT_RISK_PARAMS,
  MAX_REVERSAL_RISK,
  MIN_RISK_REWARD_FINAL,
  MIN_RISK_REWARD_PARTIAL,
  MIN_RISK_REWARD_PLAN,
  POI_CONFIG,
  STRATEGY_VERSION,
  type RiskParams,
} from "./strategy";
import type {
  AnalysisResult,
  Candle,
  Direction,
  LiquidityMap,
  ReadingState,
  TechnicalEvidence,
  TechnicalEvidenceState,
  WyckoffRead,
} from "./types";
import { analyzeWyckoff } from "./wyckoffAnalyzer";

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function stateFromQuality(quality: number, invalidated = false): TechnicalEvidenceState {
  if (invalidated) return "invalidada";
  if (quality >= 70) return "confirmada";
  if (quality > 0) return "parcial";
  return "ausente";
}

function evidence(
  input: Omit<TechnicalEvidence, "state"> & { state?: TechnicalEvidenceState },
): TechnicalEvidence {
  return { ...input, state: input.state ?? stateFromQuality(input.measuredValue ?? 0) };
}

function isReactionConfirmedFor(
  direction: Direction,
  priceAction: ReturnType<typeof readPriceAction>,
): boolean {
  if (direction === "COMPRA") {
    return priceAction.imbalance >= 10 && priceAction.conviction >= 35;
  }
  if (direction === "VENDA") {
    return priceAction.imbalance <= -10 && priceAction.conviction >= 35;
  }
  return false;
}

function deriveDirection(
  f: Features,
  wyckoff: WyckoffRead,
  captureDirection: Direction | null,
): Direction {
  if (captureDirection && captureDirection !== "NEUTRO") return captureDirection;
  if (wyckoff.confidence >= 0.35) {
    if (wyckoff.schema === "Acumulação") return "COMPRA";
    if (wyckoff.schema === "Distribuição") return "VENDA";
  }
  if (f.trend >= 0.35) return "COMPRA";
  if (f.trend <= -0.35) return "VENDA";
  return "NEUTRO";
}

/** Liquidez-alvo correta: compra mira liquidez acima; venda mira liquidez abaixo. */
export function pickTargetLiquidity(
  liquidity: LiquidityMap,
  direction: Direction,
  price: number,
): number | null {
  if (direction === "COMPRA") {
    const candidates = liquidity.levels
      .filter((level) => level.kind === "compradora" && level.price > price)
      .sort((a, b) => a.price - b.price);
    return candidates[0]?.price ?? null;
  }
  if (direction === "VENDA") {
    const candidates = liquidity.levels
      .filter((level) => level.kind === "vendedora" && level.price < price)
      .sort((a, b) => b.price - a.price);
    return candidates[0]?.price ?? null;
  }
  return null;
}

function contextQuality(f: Features, wyckoff: WyckoffRead, direction: Direction): number {
  if (direction === "NEUTRO") return 0;
  const schemaAligned =
    (direction === "COMPRA" && wyckoff.schema === "Acumulação") ||
    (direction === "VENDA" && wyckoff.schema === "Distribuição");
  const locationQuality =
    direction === "COMPRA" ? (1 - f.positionInRange) * 100 : f.positionInRange * 100;
  return clamp(wyckoff.confidence * 65 + locationQuality * 0.25 + (schemaAligned ? 10 : 0));
}

/**
 * Bloqueio EXCLUSIVO de preço: a estrutura foi lida, o setup pode estar
 * formado, mas os níveis exatos dependem da escala calibrada. Nunca significa
 * "não analisar" — significa "aguardando preço".
 */
export const PRICE_SCALE_BLOCKER =
  "Preços exatos indisponíveis: escala de preços ainda em calibração automática.";

function unique(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}

/**
 * Análise técnica baseada em fatos observáveis. O motor produz fatos, evidências e gates
 * objetivos; a autorização operacional é feita depois pelo motor histórico.
 */
export function analyze(
  window: Candle[],
  options: { reading: ReadingState; riskParams?: RiskParams },
): AnalysisResult | null {
  const closedWindow = window.slice().sort((a, b) => a.t - b.t);
  const f = extractFeatures(closedWindow);
  if (!f) return null;

  const lastAt = closedWindow[closedWindow.length - 1]!.t;
  const priceAction = readPriceAction(closedWindow, f);
  const wyckoff = analyzeWyckoff(closedWindow, f, priceAction);
  const marketState = detectMarketState(f, priceAction, wyckoff);
  const dataQuality = assessDataQuality(closedWindow);
  const liquidity = buildLiquidityMap(closedWindow, f);
  const preliminaryPois = buildPOIs(closedWindow, f, wyckoff, priceAction, liquidity);
  const hss = analyzeHSS(closedWindow, f, liquidity, preliminaryPois);
  const capture = buildCaptureResult(liquidity, hss, f);
  const direction = deriveDirection(f, wyckoff, capture.direction);
  const pois = buildPOIs(closedWindow, f, wyckoff, priceAction, liquidity);
  const mainPoi = selectMainPoi(pois, f.price, direction);
  const sms = analyzeSMS(closedWindow, f, priceAction, hss);
  const regime = detectRegime(f, priceAction);
  const risk = assessRisk(f, priceAction, wyckoff, direction, liquidity, mainPoi, dataQuality);
  const targetLiquidityPrice = pickTargetLiquidity(liquidity, direction, f.price);
  const plan = buildPlan(
    f,
    priceAction,
    risk,
    direction,
    mainPoi,
    sms,
    targetLiquidityPrice,
    options.riskParams ?? DEFAULT_RISK_PARAMS,
  );

  const contradictions = buildContradictions({
    direction,
    regime: regime.regime,
    f,
    priceAction,
    capture,
    mainPoi,
    plan,
    sms,
    targetLiquidityPrice,
    lastCandleAt: lastAt,
  });

  const reactionConfirmed = isReactionConfirmedFor(direction, priceAction);
  const volatility = volatilityContext(closedWindow);
  if (volatility?.abnormal) {
    contradictions.push({
      id: "volatilidade-anormal",
      severity: "informativa",
      description: volatility.note,
      evidence: `ratio=${volatility.ratio.toFixed(1)}x mediana`,
      region: "candle atual",
      candleAt: lastAt,
    });
  }

  const structureQuality = clamp(
    wyckoff.confidence * 45 +
      Math.abs(f.trend) * 25 +
      priceAction.conviction * 0.2 +
      (sms.confirmed && sms.direction === direction ? 10 : 0),
  );
  const ctxQuality = contextQuality(f, wyckoff, direction);
  const priceInEntryZone =
    plan !== null &&
    (plan.mode === "ENTRADA DIRETA PROVÁVEL" ||
      (mainPoi !== null && f.price >= mainPoi.lower && f.price <= mainPoi.upper));

  const sequence = evaluateCausalSequence({
    direction,
    capture,
    reactionConfirmed,
    sms,
    mainPoi,
    plan,
    priceInEntryZone,
    price: f.price,
    lastCandleAt: lastAt,
  });

  const t4 = evaluateT4({
    windowLength: closedWindow.length,
    direction,
    f,
    priceAction,
    regime,
    capture,
    mainPoi,
    sms,
    plan,
    risk,
    contradictions,
  });

  // Sem escala calibrada a qualidade visual é a qualidade GEOMÉTRICA dos
  // candles — a calibração não deve zerar a leitura estrutural.
  const visualQuality = options.reading.priceScaleReady
    ? Math.min(options.reading.calibrationConfidence, options.reading.candleQuality)
    : options.reading.candleQuality;
  const riskQuality = plan
    ? clamp((plan.riskRewardPlan / MIN_RISK_REWARD_PLAN) * 70 + (risk.stopQuality / 100) * 30)
    : 0;

  const evidences: TechnicalEvidence[] = [
    evidence({
      id: "estrutura",
      label: "Estrutura e reação do candle",
      group: "estrutura",
      measuredValue: structureQuality,
      occurredAt: lastAt,
      chartRegion: "candles fechados recentes",
      visualQuality,
      justification: reactionConfirmed
        ? "Estrutura e reação do preço alinhadas no candle fechado."
        : "Aguardando reação suficiente no candle fechado.",
    }),
    evidence({
      id: "captura-liquidez",
      label: "Captura de liquidez",
      group: "captura_liquidez",
      measuredValue: capture.valid ? capture.quality : null,
      occurredAt: capture.detail.at,
      chartRegion: capture.detail.side === "compradora" ? "liquidez acima" : "liquidez abaixo",
      visualQuality,
      state:
        capture.detail.status === "invalidada"
          ? "invalidada"
          : capture.valid
            ? "confirmada"
            : "ausente",
      justification: capture.valid
        ? "Varredura, rejeição e deslocamento confirmados."
        : "A sequência de captura de liquidez ainda não foi confirmada.",
    }),
    evidence({
      id: "poi-reteste",
      label: "POI e reteste",
      group: "poi_reteste",
      measuredValue: mainPoi?.strength ?? null,
      occurredAt: mainPoi?.originAt ?? null,
      chartRegion: mainPoi
        ? `${mainPoi.lower.toFixed(2)}–${mainPoi.upper.toFixed(2)}`
        : "sem POI válido",
      visualQuality,
      state: !mainPoi
        ? "ausente"
        : mainPoi.condition === "invalidado"
          ? "invalidada"
          : stateFromQuality(mainPoi.strength),
      justification: mainPoi
        ? `POI ${mainPoi.kind.replace(/_/g, " ")} em estado ${mainPoi.condition}.`
        : "Nenhum POI válido e alinhado foi encontrado.",
    }),
    evidence({
      id: "contexto-wyckoff",
      label: "Contexto Wyckoff e localização",
      group: "contexto_wyckoff",
      measuredValue: ctxQuality,
      occurredAt: lastAt,
      chartRegion: "faixa e estrutura visíveis",
      visualQuality,
      justification:
        wyckoff.schema === "Indefinido"
          ? "Contexto Wyckoff ainda indefinido."
          : `${wyckoff.label}; eventos: ${wyckoff.events.join(", ") || "nenhum confirmado"}.`,
    }),
    evidence({
      id: "risco-retorno",
      label: "Risco, stop e espaço até o alvo",
      group: "risco_retorno",
      measuredValue: plan ? riskQuality : null,
      occurredAt: lastAt,
      chartRegion: "entrada, invalidação e liquidez-alvo",
      visualQuality,
      state: plan ? "confirmada" : "ausente",
      justification: plan
        ? `Parcial ${plan.riskReward.toFixed(2)}R, alvo ${plan.riskRewardFinal.toFixed(2)}R e plano ${plan.riskRewardPlan.toFixed(2)}R.`
        : "Sem plano tecnicamente válido.",
    }),
  ];

  const blockers: string[] = [...options.reading.issues];
  if (!options.reading.sufficient) blockers.push("Leitura visual insuficiente.");
  // A escala bloqueia SOMENTE a decisão (preços exatos), nunca a leitura.
  if (!options.reading.priceScaleReady) {
    blockers.push(PRICE_SCALE_BLOCKER);
  }
  if (!options.reading.timeframeConfirmed) blockers.push("Gráfico de 1 minuto não confirmado.");
  if (!options.reading.lastCandleClosed) blockers.push("Último candle ainda está em formação.");
  if (direction === "NEUTRO") blockers.push("Direção técnica ainda indefinida.");
  // T4 usa um roteador por regime. Tendência não precisa inventar sweep; range/reversão
  // continuam exigindo captura/estrutura. Isso é o que aumenta cobertura sem abrir gate genérico.
  blockers.push(...t4.blockers);
  for (const contradiction of contradictions.filter((item) => item.severity === "bloqueia")) {
    blockers.push(contradiction.description);
  }
  if (!plan) {
    blockers.push("Plano técnico indisponível.");
  } else {
    if (plan.riskReward < MIN_RISK_REWARD_PARTIAL)
      blockers.push(`Parcial abaixo de ${MIN_RISK_REWARD_PARTIAL}R.`);
    if (plan.riskRewardFinal < MIN_RISK_REWARD_FINAL)
      blockers.push(`Alvo final abaixo de ${MIN_RISK_REWARD_FINAL}R.`);
    if (plan.riskRewardPlan < MIN_RISK_REWARD_PLAN)
      blockers.push(`Plano completo abaixo de ${MIN_RISK_REWARD_PLAN}R.`);
  }
  if (risk.reversalRisk > MAX_REVERSAL_RISK) {
    blockers.push(`Risco de reversão ${Math.round(risk.reversalRisk)}% acima do limite.`);
  }

  const uniqueBlockers = unique(blockers);
  const technicalReady = uniqueBlockers.length === 0;
  const explanation = [
    `T4 ${t4.quality} · ${t4.setup}. ${t4.reasons.join(" ")}`,
    wyckoff.label,
    capture.valid
      ? `Captura de liquidez confirmada em ${capture.detail.price?.toFixed(2) ?? "nível identificado"}.`
      : "Captura de liquidez ainda pendente.",
    mainPoi
      ? `POI ${mainPoi.kind.replace(/_/g, " ")} ${mainPoi.condition}, força visual ${mainPoi.strength}/100.`
      : "Nenhum POI válido alinhado.",
    plan
      ? `Entrada ${plan.entry.toFixed(2)}, stop ${plan.stop.toFixed(2)}, parcial ${plan.target1.toFixed(2)} e alvo ${plan.target2.toFixed(2)}.`
      : "Sem plano operacional válido.",
  ].join(" ");

  return {
    t: lastAt,
    strategyVersion: STRATEGY_VERSION,
    price: f.price,
    direction,
    technicalReady,
    reason: t4.productionReady
      ? `T4 ${t4.quality} · ${t4.setup} — ${t4.reasons.join(" ")}`
      : evidences
          .filter((item) => item.state === "confirmada")
          .map((item) => item.label)
          .join(" • ") || "Aguardando evidências técnicas confirmadas.",
    blockers: uniqueBlockers,
    reading: options.reading,
    priceAction,
    wyckoff,
    marketState,
    regime,
    contradictions,
    sequence,
    volatility,
    t4,
    versions: { strategyVersion: STRATEGY_VERSION },
    risk,
    plan,
    liquidity,
    mainPoi,
    pois,
    internalConfirmation: { capture, sms },
    evidences,
    explanation,
  };
}
