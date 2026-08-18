import { ZERO_COSTS, type DatasetSplit, type T4Trade, type TradeCosts } from "./types";

/**
 * FÁBRICA DE TRADES PARA TESTE.
 *
 * Determinística por construção: nenhum `Math.random`, nenhum `Date.now`.
 * Dois testes com as mesmas entradas produzem exatamente a mesma amostra.
 */

const BASE_AT = 1_700_000_000_000;
const MINUTE = 60_000;

export function makeTrade(index: number, overrides: Partial<T4Trade> = {}): T4Trade {
  const decidedAt = BASE_AT + index * 30 * MINUTE;
  const riskPoints = 100;
  const resultR = overrides.resultR ?? 1;
  return {
    tradeId: `t${index}`,
    signalId: `s${index}`,
    strategyVersion: "T4 v1.0",
    configHash: "cfg_test",
    symbol: "WIN",
    timeframe: "1m",
    direction: index % 2 === 0 ? "COMPRA" : "VENDA",
    setupStartedAt: decidedAt - MINUTE,
    decidedAt,
    entryAt: decidedAt + MINUTE,
    exitAt: decidedAt + 10 * MINUTE,
    entryPrice: 130000,
    stopPrice: 129900,
    targetPrice: 130300,
    exitPrice: 130000 + resultR * riskPoints,
    confluenceAtEntry: 75,
    criteria: [
      {
        id: "structure",
        label: "Estrutura",
        weight: 60,
        confirmed: true,
        pendingClose: false,
        detail: null,
      },
      {
        id: "reaction",
        label: "Reação",
        weight: 40,
        confirmed: true,
        pendingClose: false,
        detail: null,
      },
    ],
    regime: "TREND_UP",
    session: "ABERTURA",
    entryReason: "teste",
    exitReason: "ALVO",
    outcome: "EXECUTED",
    result: resultR > 0.05 ? "WIN" : resultR < -0.05 ? "LOSS" : "BREAKEVEN",
    grossPoints: resultR * riskPoints,
    netPoints: resultR * riskPoints,
    resultR,
    riskPoints,
    mfePoints: Math.max(0, resultR) * riskPoints,
    maePoints: Math.max(0, -resultR) * riskPoints,
    mfeR: Math.max(0, resultR),
    maeR: Math.max(0, -resultR),
    costs: ZERO_COSTS as TradeCosts,
    dataset: "TRAIN" as DatasetSplit,
    ...overrides,
  };
}

/** Amostra com padrão fixo de R — sempre a mesma sequência. */
export function makeTrades(
  count: number,
  rAt: (index: number) => number,
  overrides: (index: number) => Partial<T4Trade> = () => ({}),
): T4Trade[] {
  return Array.from({ length: count }, (_, index) =>
    makeTrade(index, { resultR: rAt(index), ...overrides(index) }),
  );
}

/** Padrão vencedor moderado: 2 de cada 5 são ganhos de 3R, o resto −1R. */
export function winningPattern(index: number): number {
  return index % 5 < 2 ? 3 : -1;
}

/** Padrão perdedor: 1 de cada 5 ganha 1R, o resto perde 1R. */
export function losingPattern(index: number): number {
  return index % 5 === 0 ? 1 : -1;
}
