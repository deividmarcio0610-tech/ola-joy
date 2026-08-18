import { describe, expect, it } from "vitest";

import { makeTrade, makeTrades, winningPattern } from "./fixtures";
import {
  MIN_TRADES_FOR_THRESHOLD_SEARCH,
  MIN_TRADES_PER_THRESHOLD,
  analyzeThreshold,
} from "./threshold";

/** Amostra em que confluência alta REALMENTE vale mais — platô legítimo. */
function plateauSample() {
  const low = makeTrades(
    60,
    () => -1,
    (i) => ({ confluenceAtEntry: 50 + (i % 5) }),
  );
  const high = makeTrades(
    60,
    () => 2,
    (i) => ({ confluenceAtEntry: 85 + (i % 10) }),
  );
  return [...low, ...high].map((trade, index) => ({ ...trade, tradeId: `p${index}` }));
}

describe("analyzeThreshold", () => {
  it("NUNCA aplica o limiar — só mede", () => {
    const result = analyzeThreshold(plateauSample());
    expect(result.applied).toBe(false);
    expect(result.note).toContain("não foi alterada");
  });

  it("com amostra pequena recusa procurar limiar", () => {
    const result = analyzeThreshold(makeTrades(10, winningPattern));
    expect(result.bestThreshold).toBeNull();
    expect(result.suspectedOverfitting).toBe(true);
    expect(result.note).toContain("AGUARDANDO DADOS SUFICIENTES");
    expect(result.overfittingAlerts[0]).toContain(String(MIN_TRADES_FOR_THRESHOLD_SEARCH));
  });

  it("encontra o corte que separa o lixo do bom", () => {
    const result = analyzeThreshold(plateauSample());
    expect(result.bestThreshold).not.toBeNull();
    // O corte tem de estar acima da faixa perdedora (50–54).
    expect(result.bestThreshold!).toBeGreaterThan(54);
    expect(result.bestExpectancy!).toBeGreaterThan(0);
  });

  it("um platô largo produz estabilidade alta", () => {
    const result = analyzeThreshold(plateauSample());
    expect(result.stability).toBeGreaterThan(50);
  });

  it("pico isolado dispara alerta de sobreajuste", () => {
    // Só UMA faixa estreita ganha muito; o resto perde.
    const noise = makeTrades(
      80,
      () => -1,
      (i) => ({ confluenceAtEntry: 50 + (i % 30) }),
    );
    const spike = makeTrades(
      25,
      () => 8,
      () => ({ confluenceAtEntry: 92 }),
    );
    const result = analyzeThreshold(
      [...noise, ...spike].map((trade, index) => ({ ...trade, tradeId: `s${index}` })),
    );
    expect(result.suspectedOverfitting).toBe(true);
    expect(result.overfittingAlerts.join(" ")).toMatch(/pico isolado|varia|vizinhos/i);
  });

  it("só considera cortes com amostra mínima", () => {
    const result = analyzeThreshold(plateauSample());
    const best = result.points.find((point) => point.threshold === result.bestThreshold)!;
    expect(best.trades).toBeGreaterThanOrEqual(MIN_TRADES_PER_THRESHOLD);
  });

  it("a curva é monotonicamente decrescente em número de trades", () => {
    const result = analyzeThreshold(plateauSample());
    for (let i = 1; i < result.points.length; i++) {
      expect(result.points[i]!.trades).toBeLessThanOrEqual(result.points[i - 1]!.trades);
    }
  });

  it("é determinístico: duas execuções dão o mesmo resultado", () => {
    const sample = plateauSample();
    const a = analyzeThreshold(sample);
    const b = analyzeThreshold(sample);
    expect(a.bestThreshold).toBe(b.bestThreshold);
    expect(a.stability).toBe(b.stability);
    expect(a.points).toEqual(b.points);
  });

  it("oportunidades não executadas não entram na curva", () => {
    const sample = [
      ...plateauSample(),
      makeTrade(999, {
        outcome: "REJECTED_BY_GATES",
        resultR: null,
        result: null,
        confluenceAtEntry: 99,
      }),
    ];
    const withRejected = analyzeThreshold(sample);
    const withoutRejected = analyzeThreshold(plateauSample());
    expect(withRejected.points).toEqual(withoutRejected.points);
  });
});
