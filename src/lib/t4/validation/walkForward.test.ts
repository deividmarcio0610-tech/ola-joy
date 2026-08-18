import { describe, expect, it } from "vitest";

import { makeTrade, makeTrades, losingPattern, winningPattern } from "./fixtures";
import { MIN_TRADES_PER_FOLD, walkForwardT4 } from "./walkForward";

describe("walkForwardT4", () => {
  it("recusa amostra pequena com o motivo explícito", () => {
    const result = walkForwardT4(makeTrades(20, winningPattern));
    expect(result.available).toBe(false);
    expect(result.unavailableReason).toContain(String(MIN_TRADES_PER_FOLD));
    expect(result.folds).toEqual([]);
  });

  it("divide em janelas cronológicas sem perder nenhum trade", () => {
    const trades = makeTrades(103, winningPattern);
    const result = walkForwardT4(trades, 5);
    expect(result.available).toBe(true);
    expect(result.folds).toHaveLength(5);
    expect(result.folds.reduce((sum, fold) => sum + fold.trades, 0)).toBe(103);
  });

  it("as janelas são cronológicas e não se sobrepõem", () => {
    const result = walkForwardT4(makeTrades(120, winningPattern), 4);
    for (let i = 1; i < result.folds.length; i++) {
      expect(result.folds[i]!.fromAt).toBeGreaterThan(result.folds[i - 1]!.toAt);
    }
  });

  it("amostra consistentemente vencedora é estável", () => {
    const result = walkForwardT4(makeTrades(150, winningPattern));
    expect(result.positiveFolds).toBe(result.folds.length);
    expect(result.consistency).toBe(1);
    expect(result.stable).toBe(true);
    expect(result.hasCatastrophicFold).toBe(false);
  });

  it("amostra perdedora não é estável e acusa janela catastrófica", () => {
    const result = walkForwardT4(makeTrades(150, losingPattern));
    expect(result.stable).toBe(false);
    expect(result.hasCatastrophicFold).toBe(true);
  });

  it("um trecho bom carregando o resto derruba a consistência", () => {
    // Primeira metade excelente, segunda metade ruim.
    const good = makeTrades(75, () => 3).map((trade, index) => ({
      ...trade,
      tradeId: `g${index}`,
      decidedAt: 1_700_000_000_000 + index * 60_000,
    }));
    const bad = makeTrades(75, () => -1).map((trade, index) => ({
      ...trade,
      tradeId: `b${index}`,
      decidedAt: 1_700_000_000_000 + (75 + index) * 60_000,
    }));
    const result = walkForwardT4([...good, ...bad], 5);
    expect(result.consistency).toBeLessThan(1);
    expect(result.stable).toBe(false);
  });

  it("ignora oportunidades não executadas", () => {
    const executed = makeTrades(100, winningPattern);
    const noise = Array.from({ length: 30 }, (_, index) =>
      makeTrade(500 + index, { outcome: "FILTERED_BY_THRESHOLD", resultR: null, result: null }),
    );
    const a = walkForwardT4(executed);
    const b = walkForwardT4([...executed, ...noise]);
    expect(b.folds.map((f) => f.trades)).toEqual(a.folds.map((f) => f.trades));
  });

  it("é determinístico", () => {
    const sample = makeTrades(120, winningPattern);
    expect(walkForwardT4(sample)).toEqual(walkForwardT4(sample));
  });
});
