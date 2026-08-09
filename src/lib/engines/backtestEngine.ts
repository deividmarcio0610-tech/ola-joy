import type { AnalysisResult, Direction } from "./types";

export type TradeOrigin = "LIVE" | "LIVE_REPLAY" | "VIDEO_REPLAY" | "BACKTEST" | "LEGACY_IMAGE";

export interface BacktestTrade {
  id: string;
  setupId: string;
  strategyVersion: string;
  asset: string;
  timeframe: "1m";
  /** Instante da decisão; útil para auditoria anti-look-ahead. */
  signalAt?: number;
  /** Instante real/simulado de execução da entrada. */
  openedAt: number;
  closedAt: number;
  entryHitAt?: number | null;
  partialHitAt?: number | null;
  exitAt?: number | null;
  direction: Exclude<Direction, "NEUTRO">;
  setup: string;
  context: string;
  entry: number;
  stop: number;
  target1: number;
  target2: number;
  riskReward: number;
  reversalRisk: number;
  exit: number;
  result: "GANHO" | "PERDA" | "NEUTRO";
  rMultiple: number;
  mfePoints: number | null;
  maePoints: number | null;
  mfeR: number | null;
  maeR: number | null;
  exitReason?: string | null;
  ambiguousIntrabar?: boolean;
  tradingDate?: string | null;
  /** IDs das técnicas detectadas no snapshot da decisão. */
  techniqueIds?: string[];
  /** Versão do detector usada para cada técnica no instante da decisão. */
  techniqueDetectorVersions?: Record<string, string>;
  /** Versão da técnica de produção congelada para esta decisão/sessão. */
  productionTechniqueVersion?: string;
  /** @deprecated Compatibilidade com registros anteriores; prefira techniqueIds. */
  techniques?: string[];
  hour: number;
  wyckoffPhase: string;
  poiKind: string;
  regime: string;
  /** Identificador da captura/sessão contínua que originou o trade. */
  sourceCaptureId: string;
  /** Segmento cronológico da gravação/replay, quando disponível. */
  segmentId?: string | null;
  /** Sessão/pregão persistente, quando disponível. */
  tradingSessionId?: string | null;
  origin: TradeOrigin;
  /** Snapshot congelado: dados futuros nunca recalculam esta decisão. */
  frozenAnalysis: AnalysisResult;
}

export function createBacktestTrade(input: {
  analysis: AnalysisResult;
  asset: string;
  sourceCaptureId: string;
  segmentId?: string | null;
  tradingSessionId?: string | null;
  origin?: TradeOrigin;
  closedAt: number;
  entryHitAt?: number | null;
  partialHitAt?: number | null;
  exitAt?: number | null;
  exit: number;
  result: BacktestTrade["result"];
  rMultiple: number;
  mfeMae?: {
    mfePoints: number;
    maePoints: number;
    mfeR: number | null;
    maeR: number | null;
  } | null;
  exitReason?: string | null;
  ambiguousIntrabar?: boolean;
  tradingDate?: string | null;
  techniqueIds?: string[];
  techniqueDetectorVersions?: Record<string, string>;
  productionTechniqueVersion?: string;
  /** @deprecated Compatibilidade de chamada antiga. */
  techniques?: string[];
}): BacktestTrade | null {
  const { analysis } = input;
  if (!analysis.plan || analysis.direction === "NEUTRO") return null;
  return {
    id: `trade_${analysis.t}_${input.closedAt}`,
    setupId: `T4|${analysis.t4.setup}|${analysis.regime.regime}`,
    strategyVersion: analysis.strategyVersion,
    asset: input.asset,
    timeframe: "1m",
    signalAt: analysis.t,
    openedAt: input.entryHitAt ?? analysis.t,
    closedAt: input.exitAt ?? input.closedAt,
    entryHitAt: input.entryHitAt ?? null,
    partialHitAt: input.partialHitAt ?? null,
    exitAt: input.exitAt ?? input.closedAt,
    direction: analysis.direction,
    setup:
      analysis.t4.setup !== "NONE"
        ? analysis.t4.setup
        : analysis.wyckoff.events.join("+") || analysis.wyckoff.schema,
    context: analysis.marketState,
    entry: analysis.plan.entry,
    stop: analysis.plan.stop,
    target1: analysis.plan.target1,
    target2: analysis.plan.target2,
    riskReward: analysis.plan.riskRewardPlan,
    reversalRisk: analysis.risk.reversalRisk,
    exit: input.exit,
    result: input.result,
    rMultiple: input.rMultiple,
    mfePoints: input.mfeMae?.mfePoints ?? null,
    maePoints: input.mfeMae?.maePoints ?? null,
    mfeR: input.mfeMae?.mfeR ?? null,
    maeR: input.mfeMae?.maeR ?? null,
    exitReason: input.exitReason ?? null,
    ambiguousIntrabar: input.ambiguousIntrabar ?? false,
    tradingDate: input.tradingDate ?? null,
    techniqueIds: input.techniqueIds ?? input.techniques ?? [],
    techniqueDetectorVersions: input.techniqueDetectorVersions ?? {},
    productionTechniqueVersion: input.productionTechniqueVersion ?? analysis.strategyVersion,
    techniques: input.techniques ?? input.techniqueIds ?? [],
    regime: analysis.regime?.regime ?? "UNCLEAR",
    hour: new Date(analysis.t).getHours(),
    wyckoffPhase: analysis.wyckoff.phase ?? "indefinida",
    poiKind: analysis.mainPoi?.kind ?? "sem_poi",
    sourceCaptureId: input.sourceCaptureId,
    segmentId: input.segmentId ?? null,
    tradingSessionId: input.tradingSessionId ?? null,
    origin: input.origin ?? "BACKTEST",
    frozenAnalysis: structuredClone(analysis),
  };
}
