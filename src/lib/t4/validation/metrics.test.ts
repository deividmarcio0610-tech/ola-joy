import { describe, expect, it } from "vitest";

import {
  classifyResult,
  computeT4Metrics,
  costInPoints,
  executedTrades,
  netResultR,
} from "./metrics";
import type { T4Trade, TradeCosts } from "./types";
import { ZERO_COSTS } from "./types";

function trade(overrides: Partial<T4Trade> & { resultR: number | null }): T4Trade {
  const resultR = overrides.resultR;
  return {
    tradeId: overrides.tradeId ?? `t_${Math.abs(resultR ?? 0)}_${Math.random()}`,
    signalId: "sig",
    strategyVersion: "T4.0.0",
    configHash: "hash",
    symbol: "WINFUT",
    timeframe: "1m",
    direction: "COMPRA",
    setupStartedAt: 0,
    decidedAt: 0,
    entryAt: 0,
    exitAt: 0,
    entryPrice: 100,
    stopPrice: 95,
    targetPrice: 115,
    exitPrice: 100,
    confluenceAtEntry: 100,
    criteria: [],
    regime: "TENDENCIA",
    session: "MANHA",
    entryReason: "teste",
    exitReason: "teste",
    outcome: "EXECUTED",
    result: resultR === null ? null : classifyResult(resultR),
    grossPoints: resultR === null ? null : resultR * 5,
    netPoints: resultR === null ? null : resultR * 5,
    riskPoints: 5,
    mfePoints: null,
    maePoints: null,
    mfeR: null,
    maeR: null,
    costs: ZERO_COSTS,
    dataset: "TRAIN",
    ...overrides,
    resultR,
  };
}

describe("custos reais entram no R", () => {
  it("converte corretagem, emolumentos e slippage (duas pernas) em pontos", () => {
    const costs: TradeCosts = {
      brokerage: 2,
      exchangeFees: 1,
      slippagePoints: 1,
      pointValue: 0.2, // WIN: R$0,20 por ponto
    };
    // (2+1)/0,2 = 15 pontos de custo monetário + 1*2 = 2 de slippage = 17
    expect(costInPoints(costs)).toBeCloseTo(17, 6);
  });

  it("o mesmo trade bruto vira R MENOR depois dos custos", () => {
    const gross = 30;
    const semCusto = netResultR({ grossPoints: gross, riskPoints: 10, costs: ZERO_COSTS })!;
    const comCusto = netResultR({
      grossPoints: gross,
      riskPoints: 10,
      costs: { brokerage: 2, exchangeFees: 1, slippagePoints: 1, pointValue: 0.2 },
    })!;
    expect(semCusto.resultR).toBeCloseTo(3, 6);
    expect(comCusto.resultR).toBeCloseTo(1.3, 6); // (30-17)/10
    expect(comCusto.resultR).toBeLessThan(semCusto.resultR);
  });

  it("um ganho pequeno pode virar PERDA depois dos custos — e isso precisa aparecer", () => {
    const resultado = netResultR({
      grossPoints: 10,
      riskPoints: 10,
      costs: { brokerage: 2, exchangeFees: 1, slippagePoints: 1, pointValue: 0.2 },
    })!;
    expect(resultado.resultR).toBeLessThan(0);
    expect(classifyResult(resultado.resultR)).toBe("LOSS");
  });

  it("risco inválido não produz R inventado", () => {
    expect(netResultR({ grossPoints: 10, riskPoints: 0, costs: ZERO_COSTS })).toBeNull();
  });
});

describe("fórmulas das métricas", () => {
  it("expectancy = winRate*avgWinR - lossRate*avgLossR", () => {
    // 3 ganhos de 2R, 2 perdas de 1R → 0,6*2 - 0,4*1 = 0,8
    const metrics = computeT4Metrics([
      trade({ resultR: 2 }),
      trade({ resultR: 2 }),
      trade({ resultR: 2 }),
      trade({ resultR: -1 }),
      trade({ resultR: -1 }),
    ]);
    expect(metrics.winRate).toBeCloseTo(60, 6);
    expect(metrics.avgWinR).toBeCloseTo(2, 6);
    expect(metrics.avgLossR).toBeCloseTo(1, 6);
    expect(metrics.expectancy).toBeCloseTo(0.8, 6);
    expect(metrics.payoff).toBeCloseTo(2, 6);
    expect(metrics.profitFactor).toBeCloseTo(3, 6); // 6 / 2
    expect(metrics.totalR).toBeCloseTo(4, 6);
  });

  it("drawdown máximo e recovery factor sobre a curva real", () => {
    // +2, -1, -1, +3 → equity 2,1,0,3 ; pico 2 → DD máx = 2
    const metrics = computeT4Metrics([
      trade({ resultR: 2 }),
      trade({ resultR: -1 }),
      trade({ resultR: -1 }),
      trade({ resultR: 3 }),
    ]);
    expect(metrics.maxDrawdownR).toBeCloseTo(2, 6);
    expect(metrics.totalR).toBeCloseTo(3, 6);
    expect(metrics.recoveryFactor).toBeCloseTo(1.5, 6);
    expect(metrics.equityCurve.map((p) => p.cumulativeR)).toEqual([2, 1, 0, 3]);
    expect(metrics.drawdownCurve.map((p) => p.drawdownR)).toEqual([0, 1, 2, 0]);
  });

  it("sequências máximas de ganho e perda", () => {
    const metrics = computeT4Metrics([
      trade({ resultR: 1 }),
      trade({ resultR: 1 }),
      trade({ resultR: -1 }),
      trade({ resultR: -1 }),
      trade({ resultR: -1 }),
      trade({ resultR: 1 }),
    ]);
    expect(metrics.maxConsecutiveWins).toBe(2);
    expect(metrics.maxConsecutiveLosses).toBe(3);
  });

  it("breakeven é categoria própria e não vira ganho nem perda", () => {
    const metrics = computeT4Metrics([
      trade({ resultR: 0.01 }),
      trade({ resultR: 2 }),
      trade({ resultR: -1 }),
    ]);
    expect(metrics.breakevens).toBe(1);
    expect(metrics.wins).toBe(1);
    expect(metrics.losses).toBe(1);
    expect(metrics.breakevenRate).toBeCloseTo(33.333, 2);
  });

  it("Sharpe/Sortino ficam INDISPONÍVEIS com amostra pequena — nunca inventados", () => {
    const metrics = computeT4Metrics([trade({ resultR: 1 }), trade({ resultR: -1 })]);
    expect(metrics.sharpe).toBeNull();
    expect(metrics.sortino).toBeNull();
    expect(metrics.ratiosUnavailableReason).toContain("Amostra insuficiente");
  });

  it("Sharpe/Sortino são calculados quando a amostra sustenta", () => {
    const many = Array.from({ length: 40 }, (_, i) => trade({ resultR: i % 3 === 0 ? -1 : 1.5 }));
    const metrics = computeT4Metrics(many);
    expect(metrics.sharpe).not.toBeNull();
    expect(metrics.sortino).not.toBeNull();
    expect(metrics.ratiosUnavailableReason).toBeNull();
  });

  it("Sortino usa downside deviation padrão: perdas de mesmo tamanho NÃO o anulam", () => {
    // Stop fixo em 1R faz todas as perdas idênticas; o desvio do subconjunto
    // de perdas seria 0 e o Sortino sumiria — a fórmula padrão (MAR=0) não.
    const many = Array.from({ length: 40 }, (_, i) => trade({ resultR: i % 4 === 0 ? -1 : 2 }));
    const metrics = computeT4Metrics(many);
    expect(metrics.sortino).not.toBeNull();
    // √(10 perdas × 1² / 40) = 0,5 ; média = (30×2 − 10)/40 = 1,25 → 2,5
    expect(metrics.sortino).toBeCloseTo(2.5, 6);
  });

  it("sem nenhuma perda, o Sortino fica INDISPONÍVEL em vez de Infinity", () => {
    const many = Array.from({ length: 40 }, () => trade({ resultR: 1.5 }));
    const metrics = computeT4Metrics(many);
    expect(metrics.sortino).toBeNull();
  });

  it("profitFactor sem perdas é INDISPONÍVEL, não Infinity mascarado", () => {
    const metrics = computeT4Metrics([trade({ resultR: 1 }), trade({ resultR: 2 })]);
    expect(metrics.profitFactor).toBeNull();
    expect(metrics.payoff).toBeNull();
  });

  it("somente trades EXECUTADOS entram nas métricas (sem cherry-picking ao contrário)", () => {
    const all = [
      trade({ resultR: 2 }),
      trade({ resultR: null, outcome: "REJECTED_BY_GATES", result: null }),
      trade({ resultR: null, outcome: "INVALIDATED_BEFORE_ENTRY", result: null }),
    ];
    expect(all).toHaveLength(3); // as três ficam registradas
    expect(executedTrades(all)).toHaveLength(1); // só uma entra na métrica
    expect(computeT4Metrics(all).trades).toBe(1);
  });

  it("conjunto vazio devolve métricas zeradas, não NaN", () => {
    const metrics = computeT4Metrics([]);
    expect(metrics.trades).toBe(0);
    expect(Number.isNaN(metrics.expectancy)).toBe(false);
    expect(metrics.profitFactor).toBeNull();
  });
});
