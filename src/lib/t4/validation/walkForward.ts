import { computeT4Metrics, executedTrades } from "./metrics";
import type { T4Trade } from "./types";

/**
 * WALK-FORWARD sobre T4Trade (requisito 13).
 *
 * Divide a amostra em janelas CRONOLÓGICAS e mede cada janela de teste com a
 * regra congelada. Não existe reotimização entre janelas — se houvesse, o
 * walk-forward viraria mais um jeito de sobreajustar.
 *
 * O que ele responde: o desempenho se manteve ao longo do tempo, ou existiu
 * um trecho bom que carregou o resto?
 */

export interface WalkForwardFold {
  index: number;
  fromAt: number;
  toAt: number;
  trades: number;
  expectancy: number;
  winRate: number;
  totalR: number;
  maxDrawdownR: number;
  positive: boolean;
}

export interface WalkForwardResult {
  available: boolean;
  unavailableReason: string | null;
  folds: WalkForwardFold[];
  positiveFolds: number;
  /** Fração de janelas positivas, 0..1. */
  consistency: number;
  /** true quando alguma janela foi catastrófica (expectativa < -0.5R). */
  hasCatastrophicFold: boolean;
  stable: boolean;
}

export const DEFAULT_FOLDS = 5;
export const MIN_TRADES_PER_FOLD = 15;

export function walkForwardT4(trades: T4Trade[], folds = DEFAULT_FOLDS): WalkForwardResult {
  const executed = executedTrades(trades).sort((a, b) => a.decidedAt - b.decidedAt);
  const empty: WalkForwardResult = {
    available: false,
    unavailableReason: null,
    folds: [],
    positiveFolds: 0,
    consistency: 0,
    hasCatastrophicFold: false,
    stable: false,
  };

  if (executed.length < folds * MIN_TRADES_PER_FOLD) {
    return {
      ...empty,
      unavailableReason: `Walk-forward exige ao menos ${folds * MIN_TRADES_PER_FOLD} trades (${folds} janelas × ${MIN_TRADES_PER_FOLD}); a amostra tem ${executed.length}.`,
    };
  }

  const size = Math.floor(executed.length / folds);
  const result: WalkForwardFold[] = [];
  for (let index = 0; index < folds; index++) {
    // A última janela absorve o resto para nenhum trade ficar de fora.
    const slice =
      index === folds - 1
        ? executed.slice(index * size)
        : executed.slice(index * size, (index + 1) * size);
    const metrics = computeT4Metrics(slice);
    result.push({
      index: index + 1,
      fromAt: slice[0]!.decidedAt,
      toAt: slice[slice.length - 1]!.decidedAt,
      trades: metrics.trades,
      expectancy: metrics.expectancy,
      winRate: metrics.winRate,
      totalR: metrics.totalR,
      maxDrawdownR: metrics.maxDrawdownR,
      positive: metrics.expectancy > 0,
    });
  }

  const positiveFolds = result.filter((fold) => fold.positive).length;
  const hasCatastrophicFold = result.some((fold) => fold.expectancy < -0.5);
  const consistency = positiveFolds / result.length;

  return {
    available: true,
    unavailableReason: null,
    folds: result,
    positiveFolds,
    consistency,
    hasCatastrophicFold,
    // Maioria positiva E nenhuma janela catastrófica.
    stable: consistency >= 0.6 && !hasCatastrophicFold,
  };
}
