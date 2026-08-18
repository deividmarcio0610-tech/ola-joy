import { describe, expect, it } from "vitest";

import { analyzeSampleSize, bootstrapExpectancy, monteCarloSequences } from "./resampling";
import { datasetHash, splitDatasets } from "./datasets";
import { classifyResult } from "./metrics";
import type { T4Trade } from "./types";
import { ZERO_COSTS } from "./types";

function trade(
  resultR: number | null,
  index: number,
  dataset: T4Trade["dataset"] = "TRAIN",
): T4Trade {
  return {
    tradeId: `t${index}`,
    signalId: `s${index}`,
    strategyVersion: "T4.0.0",
    configHash: "cfg",
    symbol: "WINFUT",
    timeframe: "1m",
    direction: index % 2 === 0 ? "COMPRA" : "VENDA",
    setupStartedAt: index,
    decidedAt: 1_700_000_000_000 + index * 60_000,
    entryAt: 1_700_000_000_000 + index * 60_000,
    exitAt: 1_700_000_000_000 + index * 60_000 + 300_000,
    entryPrice: 100,
    stopPrice: 95,
    targetPrice: 115,
    exitPrice: 100,
    confluenceAtEntry: 100,
    criteria: [],
    regime: "TENDENCIA",
    session: "MANHA",
    entryReason: "t",
    exitReason: "t",
    outcome: "EXECUTED",
    result: resultR === null ? null : classifyResult(resultR),
    grossPoints: resultR === null ? null : resultR * 5,
    netPoints: resultR === null ? null : resultR * 5,
    resultR,
    riskPoints: 5,
    mfePoints: null,
    maePoints: null,
    mfeR: null,
    maeR: null,
    costs: ZERO_COSTS,
    dataset,
  };
}

// Amostra com vantagem real: 60% de ganhos de 2R contra perdas de 1R.
const amostraComVantagem = Array.from({ length: 60 }, (_, i) => trade(i % 5 < 3 ? 2 : -1, i));
// Amostra sem vantagem: simétrica.
const amostraSemVantagem = Array.from({ length: 60 }, (_, i) => trade(i % 2 === 0 ? 1 : -1, i));

describe("bootstrap com IC 95% — reprodutível e honesto", () => {
  it("mesma seed produz EXATAMENTE o mesmo IC", () => {
    const a = bootstrapExpectancy(amostraComVantagem, { seed: 42, iterations: 500 });
    const b = bootstrapExpectancy(amostraComVantagem, { seed: 42, iterations: 500 });
    expect(a.ci95Low).toBe(b.ci95Low);
    expect(a.ci95High).toBe(b.ci95High);
    expect(a.probabilityPositive).toBe(b.probabilityPositive);
  });

  it("seeds diferentes convergem para a mesma estimativa (estabilidade estatística)", () => {
    // Não se exige que os percentis DIFIRAM: com poucos valores distintos de R
    // a expectância reamostrada é discreta e dois seeds podem cair no mesmo
    // ponto. O que precisa valer é a convergência — seeds independentes
    // estimando a mesma quantidade.
    const a = bootstrapExpectancy(amostraComVantagem, { seed: 1, iterations: 2000 });
    const b = bootstrapExpectancy(amostraComVantagem, { seed: 2, iterations: 2000 });
    expect(Math.abs(a.meanExpectancy - b.meanExpectancy)).toBeLessThan(0.05);
    expect(Math.abs(a.ci95Low - b.ci95Low)).toBeLessThan(0.15);
    expect(a.significant).toBe(b.significant);
  });

  it("o seed usado fica registrado no resultado (auditoria da reprodução)", () => {
    const result = bootstrapExpectancy(amostraComVantagem, { seed: "run-42", iterations: 200 });
    expect(result.seed).toBe(bootstrapExpectancy(amostraComVantagem, { seed: "run-42" }).seed);
    expect(result.iterations).toBe(200);
  });

  it("o IC contém a expectância observada", () => {
    const result = bootstrapExpectancy(amostraComVantagem, { seed: 7, iterations: 1000 });
    expect(result.observedExpectancy).toBeGreaterThan(result.ci95Low);
    expect(result.observedExpectancy).toBeLessThan(result.ci95High);
  });

  it("vantagem real: IC não cruza zero → significativo", () => {
    const result = bootstrapExpectancy(amostraComVantagem, { seed: 7, iterations: 1000 });
    expect(result.ci95Low).toBeGreaterThan(0);
    expect(result.significant).toBe(true);
  });

  it("SEM vantagem: IC cruza zero e o resultado NÃO é declarado significativo", () => {
    const result = bootstrapExpectancy(amostraSemVantagem, { seed: 7, iterations: 1000 });
    expect(result.ci95Low).toBeLessThanOrEqual(0);
    expect(result.significant).toBe(false);
  });

  it("amostra pequena fica INDISPONÍVEL em vez de fabricar IC", () => {
    const result = bootstrapExpectancy(amostraComVantagem.slice(0, 5), { seed: 1 });
    expect(result.available).toBe(false);
    expect(result.unavailableReason).toContain("ao menos");
  });
});

describe("Monte Carlo sobre resultados REAIS — só a ordem muda", () => {
  it("mesma seed reproduz os mesmos percentis", () => {
    const a = monteCarloSequences(amostraComVantagem, { seed: 99, iterations: 500 });
    const b = monteCarloSequences(amostraComVantagem, { seed: 99, iterations: 500 });
    expect(a.drawdownP95).toBe(b.drawdownP95);
    expect(a.finalRP05).toBe(b.finalRP05);
  });

  it("o resultado final é IDÊNTICO em toda permutação (soma não muda com a ordem)", () => {
    const result = monteCarloSequences(amostraComVantagem, { seed: 5, iterations: 300 });
    // 36 ganhos de 2R + 24 perdas de 1R = 48R, sempre.
    expect(result.finalRP05).toBeCloseTo(48, 6);
    expect(result.finalRP95).toBeCloseTo(48, 6);
    expect(result.probabilityProfitable).toBe(1);
  });

  it("o drawdown VARIA com a ordem — é isso que o Monte Carlo mede", () => {
    const result = monteCarloSequences(amostraComVantagem, { seed: 5, iterations: 500 });
    expect(result.drawdownWorst).toBeGreaterThan(result.drawdownP50);
    expect(result.drawdownP95).toBeGreaterThanOrEqual(result.drawdownP50);
  });

  it("amostra pequena fica INDISPONÍVEL", () => {
    expect(monteCarloSequences(amostraComVantagem.slice(0, 3)).available).toBe(false);
  });
});

describe("tamanho de amostra", () => {
  it("informa quantos trades faltam para a precisão alvo", () => {
    const analysis = analyzeSampleSize(amostraComVantagem, 0.05);
    expect(analysis.currentTrades).toBe(60);
    expect(analysis.tradesForTargetPrecision).toBeGreaterThan(60);
    expect(analysis.sufficient).toBe(false);
  });

  it("amostra minúscula não estima erro-padrão", () => {
    expect(analyzeSampleSize([trade(1, 0)]).standardError).toBeNull();
  });
});

describe("partição cronológica TRAIN/OOS/FORWARD", () => {
  it("separa por TEMPO, nunca aleatoriamente", () => {
    const split = splitDatasets(amostraComVantagem, 0.7);
    expect(split.train).toHaveLength(42);
    expect(split.outOfSample).toHaveLength(18);
    const ultimoTreino = Math.max(...split.train.map((t) => t.decidedAt));
    const primeiroOos = Math.min(...split.outOfSample.map((t) => t.decidedAt));
    expect(primeiroOos).toBeGreaterThan(ultimoTreino);
  });

  it("FORWARD permanece FORWARD e nunca é reclassificado", () => {
    const comForward = [...amostraComVantagem, trade(3, 999, "FORWARD")];
    const split = splitDatasets(comForward);
    expect(split.forward).toHaveLength(1);
    expect(split.train.some((t) => t.tradeId === "t999")).toBe(false);
    expect(split.outOfSample.some((t) => t.tradeId === "t999")).toBe(false);
  });

  it("datasetHash é estável e muda quando o dado muda", () => {
    expect(datasetHash(amostraComVantagem)).toBe(datasetHash(amostraComVantagem.slice()));
    expect(datasetHash(amostraComVantagem)).not.toBe(datasetHash(amostraSemVantagem));
  });
});
