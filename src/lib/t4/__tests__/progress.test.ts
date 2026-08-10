import { describe, expect, it } from "vitest";

import { EMPTY_DIAGNOSTICS, candleParseError, type PipelineDiagnostics } from "../diagnostics";
import { computeT4Progress } from "../progress";
import { createSignalSnapshot } from "../signalSnapshot";
import type { AnalysisResult, Candle } from "@/lib/engines/types";

const candle: Candle = { t: 1_700_000_000_000, o: 100, h: 105, l: 99, c: 104, v: 0 };

function diagnostics(overrides: Partial<PipelineDiagnostics>): PipelineDiagnostics {
  return { ...EMPTY_DIAGNOSTICS, ...overrides };
}

const SEQUENCE_STAGES = [
  "liquiditySweep",
  "reaction",
  "confirmationClose",
  "structureShift",
  "poi",
  "retest",
  "entryConfirmation",
] as const;

function fakeAnalysis(overrides?: {
  liquidityLevels?: number;
  blockingContradiction?: boolean;
  setup?: string;
  metStages?: string[];
  structureState?: string;
}): AnalysisResult {
  const met = new Set(overrides?.metStages ?? []);
  return {
    evidences: [{ group: "estrutura", state: overrides?.structureState ?? "parcial" }],
    liquidity: { levels: Array.from({ length: overrides?.liquidityLevels ?? 1 }, (_, i) => i) },
    contradictions: overrides?.blockingContradiction
      ? [{ id: "c1", severity: "bloqueia", description: "x", evidence: "y" }]
      : [],
    t4: { setup: overrides?.setup ?? "NONE", quality: "A" },
    sequence: {
      complete: SEQUENCE_STAGES.every((stage) => met.has(stage)),
      stages: SEQUENCE_STAGES.map((stage) => ({ stage, met: met.has(stage), at: null, note: "" })),
    },
    blockers: ["T4: aguardando setup A/A+."],
  } as unknown as AnalysisResult;
}

const FULL_DIAG = diagnostics({
  CAPTURE_ACTIVE: true,
  PROFIT_DETECTED: true,
  GRAPH_DETECTED: true,
  PRICE_AXIS: true,
  CHART_CLOCK: "VALID",
});

function snapshot() {
  return createSignalSnapshot({
    asset: "WINFUT",
    chartTimestamp: candle.t,
    direction: "COMPRA",
    entry: 100,
    initialStop: 95,
    threeR: 115,
    fiveR: 125,
    setup: "TREND_FIRST_PULLBACK",
    confirmationCandle: candle,
  });
}

describe("progresso T4 0–100 dinâmico (comando ao-vivo §3)", () => {
  it("0% quando a sessão não iniciou — nunca timer fake", () => {
    const progress = computeT4Progress({
      sessionActive: false,
      diagnostics: EMPTY_DIAGNOSTICS,
      analysis: null,
      decisionEvaluated: false,
      snapshot: null,
    });
    expect(progress.percent).toBe(0);
    expect(progress.status).toBe("AGUARDAR");
  });

  it("degraus são monotônicos: gráfico detectado sem Profit não pula etapas", () => {
    const progress = computeT4Progress({
      sessionActive: true,
      diagnostics: diagnostics({ CAPTURE_ACTIVE: true, GRAPH_DETECTED: true }),
      analysis: null,
      decisionEvaluated: false,
      snapshot: null,
    });
    expect(progress.percent).toBe(10); // PROFIT_DETECTED=false trava em 10
  });

  it("50% exige chartClock válido OU fallback declarado com motivo", () => {
    const base = { sessionActive: true, analysis: null, decisionEvaluated: false, snapshot: null };
    const withoutClock = computeT4Progress({
      ...base,
      diagnostics: diagnostics({
        CAPTURE_ACTIVE: true,
        PROFIT_DETECTED: true,
        GRAPH_DETECTED: true,
        PRICE_AXIS: true,
        CHART_CLOCK: "UNAVAILABLE",
        chartClockReason: null,
      }),
    });
    expect(withoutClock.percent).toBe(40);
    const withFallback = computeT4Progress({
      ...base,
      diagnostics: diagnostics({
        CAPTURE_ACTIVE: true,
        PROFIT_DETECTED: true,
        GRAPH_DETECTED: true,
        PRICE_AXIS: true,
        CHART_CLOCK: "FALLBACK_REALTIME",
        chartClockReason: "chartClock ilegível",
      }),
    });
    expect(withFallback.percent).toBe(50);
  });

  it("preço NÃO confiável trava em 30% com o motivo como bloqueio (§1)", () => {
    const progress = computeT4Progress({
      sessionActive: true,
      diagnostics: FULL_DIAG,
      analysis: fakeAnalysis(),
      decisionEvaluated: true,
      snapshot: null,
      priceTrusted: false,
      priceTrustReason: "PREÇO NÃO CONFIÁVEL — salto de 16% entre leituras.",
    });
    expect(progress.percent).toBe(30);
    expect(progress.blockers.some((b) => b.includes("PREÇO NÃO CONFIÁVEL"))).toBe(true);
  });

  it("60% quando estrutura lida mas liquidez ainda não mapeada", () => {
    const progress = computeT4Progress({
      sessionActive: true,
      diagnostics: FULL_DIAG,
      analysis: fakeAnalysis({ liquidityLevels: 0 }),
      decisionEvaluated: true,
      snapshot: null,
    });
    expect(progress.percent).toBe(60);
  });

  it("liquidez por varredura na sequência também conta como mapeada", () => {
    const progress = computeT4Progress({
      sessionActive: true,
      diagnostics: FULL_DIAG,
      analysis: fakeAnalysis({ liquidityLevels: 0, metStages: ["liquiditySweep"] }),
      decisionEvaluated: false,
      snapshot: null,
    });
    expect(progress.percent).toBe(80); // liquidez OK + contraponto limpo, sem setup
  });

  it("contradição BLOQUEADORA derruba o percentual para 70 (pode CAIR)", () => {
    const before = computeT4Progress({
      sessionActive: true,
      diagnostics: FULL_DIAG,
      analysis: fakeAnalysis({ setup: "TREND_FIRST_PULLBACK" }),
      decisionEvaluated: true,
      snapshot: null,
    });
    expect(before.percent).toBe(90);
    const after = computeT4Progress({
      sessionActive: true,
      diagnostics: FULL_DIAG,
      analysis: fakeAnalysis({ setup: "TREND_FIRST_PULLBACK", blockingContradiction: true }),
      decisionEvaluated: true,
      snapshot: null,
    });
    expect(after.percent).toBe(70);
  });

  it("nunca parado em 90 sem explicação: setup NONE segura em 80 e lista a sequência pendente", () => {
    const progress = computeT4Progress({
      sessionActive: true,
      diagnostics: FULL_DIAG,
      analysis: fakeAnalysis({ setup: "NONE" }),
      decisionEvaluated: true,
      snapshot: null,
    });
    expect(progress.percent).toBe(80);
    expect(progress.blockers.some((b) => b.includes("Sequência T4 pendente"))).toBe(true);
  });

  it("90% com gates avaliados + setup identificado; 100% SOMENTE com snapshot/signalId", () => {
    const ninety = computeT4Progress({
      sessionActive: true,
      diagnostics: FULL_DIAG,
      analysis: fakeAnalysis({ setup: "TREND_FIRST_PULLBACK" }),
      decisionEvaluated: true,
      snapshot: null,
    });
    expect(ninety.percent).toBe(90);
    expect(ninety.status).toBe("ANALISANDO");

    const hundred = computeT4Progress({
      sessionActive: true,
      diagnostics: FULL_DIAG,
      analysis: fakeAnalysis({ setup: "TREND_FIRST_PULLBACK", metStages: [...SEQUENCE_STAGES] }),
      decisionEvaluated: true,
      snapshot: snapshot(),
    });
    expect(hundred.percent).toBe(100);
    expect(hundred.status).toBe("CONFIRMADO");
    expect(hundred.stages.ENTRADA).toBe(true);
  });

  it("snapshot confirmado mantém 100% mesmo com a análise do candle seguinte recomeçando", () => {
    const progress = computeT4Progress({
      sessionActive: true,
      diagnostics: FULL_DIAG,
      analysis: fakeAnalysis({ liquidityLevels: 0, setup: "NONE" }),
      decisionEvaluated: false,
      snapshot: snapshot(),
    });
    expect(progress.percent).toBe(100);
  });
});

describe("erro específico de parsing (comando §5)", () => {
  it("gráfico visível com candles=0 tem erro específico, nunca genérico", () => {
    expect(
      candleParseError({ GRAPH_DETECTED: true, CANDLES_VISIBLE: 0, CANDLES_PARSED: 0 }),
    ).toContain("NENHUMA COLUNA");
    expect(
      candleParseError({ GRAPH_DETECTED: true, CANDLES_VISIBLE: 12, CANDLES_PARSED: 0 }),
    ).toContain("NENHUM FOI PARSEADO");
    expect(
      candleParseError({ GRAPH_DETECTED: true, CANDLES_VISIBLE: 12, CANDLES_PARSED: 20 }),
    ).toBeNull();
    expect(
      candleParseError({ GRAPH_DETECTED: false, CANDLES_VISIBLE: 0, CANDLES_PARSED: 0 }),
    ).toBeNull();
  });
});
