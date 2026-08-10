import type { AnalysisResult } from "@/lib/engines/types";
import type { PipelineDiagnostics } from "./diagnostics";
import type { TradeSignalSnapshot } from "./signalSnapshot";

/**
 * PROGRESSO T4 0–100% — DINÂMICO E REAL (comando ao-vivo §3).
 *
 * O percentual mede a COMPLETUDE DA LEITURA TÉCNICA, nunca chance de gain e
 * nunca timer/animação artificial. Ele é RECALCULADO do zero a cada frame /
 * candle / evidência, então PODE SUBIR E PODE CAIR: uma contradição
 * bloqueadora nova, liquidez que deixou de ser mapeada ou preço que perdeu a
 * confiabilidade derrubam o número na hora.
 *
 *   0%  = não iniciado
 *  10%  = captura ativa
 *  20%  = Profit detectado
 *  30%  = gráfico detectado
 *  40%  = preços/escala calibrados E CONFIÁVEIS (plausibilidade aprovada)
 *  50%  = chartClock resolvido (válido, ou fallback declarado com motivo)
 *  60%  = estrutura lida no candle fechado (evidência presente AGORA)
 *  70%  = liquidez efetivamente mapeada (níveis reais OU varredura na sequência)
 *  80%  = contraponto avaliado SEM contradição bloqueadora ativa
 *  90%  = gates oficiais avaliados com setup T4 identificado (não NONE)
 * 100%  = sinal CONFIRMADO: TradeSignalSnapshot imutável + signalId válido
 *
 * Etapas da sequência causal ainda pendentes (liquiditySweep, reaction,
 * confirmationClose, structureShift, poi, retest, entryConfirmation) aparecem
 * como bloqueios reais — o painel nunca fica "parado em 90%" sem explicar o
 * que falta.
 */

export type T4Stage = "ESTRUTURA" | "LIQUIDEZ" | "CONTRAPONTO" | "CONFLUENCIAS" | "ENTRADA";

export interface T4Progress {
  percent: 0 | 10 | 20 | 30 | 40 | 50 | 60 | 70 | 80 | 90 | 100;
  status: "AGUARDAR" | "ANALISANDO" | "CONFIRMADO";
  stages: Record<T4Stage, boolean>;
  /** Bloqueios reais exibidos enquanto <100%. */
  blockers: string[];
  /** Rótulo do degrau atual, para a UI explicar o que falta. */
  currentStepLabel: string;
}

export interface ProgressInput {
  sessionActive: boolean;
  diagnostics: PipelineDiagnostics;
  analysis: AnalysisResult | null;
  /** Gates/confluências oficiais avaliados (DecisionObject calculado). */
  decisionEvaluated: boolean;
  snapshot: TradeSignalSnapshot | null;
  /**
   * Preço aprovado na plausibilidade (comando ao-vivo §1). FALSE trava o
   * progresso em 30% — sem preço confiável não existe escala, nível ou gate.
   */
  priceTrusted?: boolean;
  /** Motivo exibido quando o preço não é confiável. */
  priceTrustReason?: string | null;
}

const STEP_LABELS: Record<number, string> = {
  0: "NÃO INICIADO",
  10: "CAPTURA DE TELA",
  20: "DETECÇÃO DO PROFIT",
  30: "DETECÇÃO DO GRÁFICO",
  40: "PREÇOS / ESCALA",
  50: "CHART CLOCK",
  60: "ESTRUTURA",
  70: "LIQUIDEZ",
  80: "CONTRAPONTO",
  90: "CONFLUÊNCIAS / GATES",
  100: "ENTRADA CONFIRMADA",
};

const SEQUENCE_LABELS: Record<string, string> = {
  liquiditySweep: "varredura de liquidez",
  reaction: "reação",
  confirmationClose: "fechamento de confirmação",
  structureShift: "quebra de estrutura",
  poi: "POI",
  retest: "reteste",
  entryConfirmation: "confirmação da entrada",
};

export function computeT4Progress(input: ProgressInput): T4Progress {
  const { diagnostics, analysis, snapshot } = input;
  const priceTrusted = input.priceTrusted ?? true;

  const structureRead =
    analysis !== null &&
    analysis.evidences.some((item) => item.group === "estrutura" && item.state !== "ausente");
  const sequenceStages = analysis?.sequence?.stages ?? [];
  const stageMet = (stage: string) =>
    sequenceStages.some((item) => item.stage === stage && item.met);
  // Liquidez MAPEADA de fato: níveis reais no mapa ou varredura já observada.
  const liquidityMapped =
    analysis !== null &&
    structureRead &&
    ((analysis.liquidity?.levels?.length ?? 0) > 0 || stageMet("liquiditySweep"));
  const blockingContradiction =
    analysis?.contradictions?.some((item) => item.severity === "bloqueia") ?? false;
  const contrapontoClear =
    analysis !== null && Array.isArray(analysis.contradictions) && !blockingContradiction;
  const setupIdentified = analysis !== null && analysis.t4 != null && analysis.t4.setup !== "NONE";
  const gatesEvaluated = analysis !== null && input.decisionEvaluated && setupIdentified;
  const confirmed = snapshot !== null && snapshot.signalId.length > 0;

  const steps: Array<[number, boolean]> = [
    [10, input.sessionActive && diagnostics.CAPTURE_ACTIVE],
    [20, diagnostics.PROFIT_DETECTED],
    [30, diagnostics.GRAPH_DETECTED],
    // Escala calibrada NÃO basta: a plausibilidade do preço precisa estar
    // aprovada (comando ao-vivo §1) — divergência derruba o degrau na hora.
    [40, diagnostics.PRICE_AXIS && priceTrusted],
    // chartClock: válido, OU fallback realtime DECLARADO com motivo registrado.
    [
      50,
      diagnostics.CHART_CLOCK === "VALID" ||
        (diagnostics.CHART_CLOCK === "FALLBACK_REALTIME" && diagnostics.chartClockReason !== null),
    ],
    [60, structureRead],
    [70, liquidityMapped],
    [80, contrapontoClear],
    [90, gatesEvaluated],
    [100, confirmed],
  ];

  let percent: T4Progress["percent"] = 0;
  for (const [value, met] of steps) {
    if (!met) break;
    percent = value as T4Progress["percent"];
  }
  // O snapshot congelado é um FATO: uma vez confirmado, a leitura está em
  // 100% enquanto a operação existir, mesmo que a análise corrente do próximo
  // candle já esteja recomeçando a sequência.
  if (confirmed) percent = 100;

  const stages: Record<T4Stage, boolean> = {
    ESTRUTURA: percent >= 60,
    LIQUIDEZ: percent >= 70,
    CONTRAPONTO: percent >= 80,
    CONFLUENCIAS: percent >= 90,
    ENTRADA: percent >= 100,
  };

  const blockers: string[] = [];
  if (percent < 100) {
    if (!priceTrusted) {
      blockers.push(
        input.priceTrustReason ??
          "PREÇO NÃO CONFIÁVEL — entrada, stop e alvos bloqueados até a escala revalidar.",
      );
    }
    if (diagnostics.parseError) blockers.push(diagnostics.parseError);
    if (diagnostics.BLOCK_REASON) blockers.push(diagnostics.BLOCK_REASON);
    for (const blocker of analysis?.blockers ?? []) blockers.push(blocker);
    // Etapas da sequência causal ainda não cumpridas = motivos reais de o
    // percentual não avançar. Nunca um "aguardando" genérico.
    if (percent >= 60 && analysis) {
      for (const stage of sequenceStages) {
        if (!stage.met) {
          blockers.push(`Sequência T4 pendente: ${SEQUENCE_LABELS[stage.stage] ?? stage.stage}.`);
        }
      }
    }
  }

  const nextStep = steps.find(([value]) => value > percent);
  return {
    percent,
    status: percent >= 100 ? "CONFIRMADO" : percent === 0 ? "AGUARDAR" : "ANALISANDO",
    stages,
    blockers: [...new Set(blockers)].slice(0, 8),
    currentStepLabel:
      percent >= 100 ? STEP_LABELS[100]! : (STEP_LABELS[nextStep ? nextStep[0] : 0] ?? ""),
  };
}
