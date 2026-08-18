import type { T4Trade, TradeCosts, TradeResult } from "./types";

/**
 * MÉTRICAS SOBRE DADOS REAIS. Nenhum número aqui é estimado, suavizado ou
 * inventado: tudo sai dos trades registrados. Quando a matemática não sustenta
 * uma métrica (amostra insuficiente, desvio zero), ela volta `null` e a UI
 * mostra INDISPONÍVEL — nunca um placeholder plausível.
 */

/** Amostra mínima para estatísticas de dispersão terem algum sentido. */
export const MIN_SAMPLE_FOR_RATIOS = 30;

export interface T4Metrics {
  trades: number;
  wins: number;
  losses: number;
  breakevens: number;
  /** PERCENTUAL 0–100 (não fração). Ex.: 67.14 significa 67,14% de acerto. */
  winRate: number;
  /** PERCENTUAL 0–100. */
  lossRate: number;
  /** PERCENTUAL 0–100. */
  breakevenRate: number;
  avgWinR: number;
  avgLossR: number;
  payoff: number | null;
  expectancy: number;
  profitFactor: number | null;
  totalR: number;
  avgR: number;
  maxDrawdownR: number;
  recoveryFactor: number | null;
  avgMfeR: number | null;
  avgMaeR: number | null;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  sharpe: number | null;
  sortino: number | null;
  /** Motivo textual quando sharpe/sortino ficam indisponíveis. */
  ratiosUnavailableReason: string | null;
  equityCurve: Array<{ index: number; cumulativeR: number }>;
  drawdownCurve: Array<{ index: number; drawdownR: number }>;
  /** Histograma de R para a distribuição exibida no painel. */
  rDistribution: Array<{ bucket: string; count: number }>;
}

export const EMPTY_METRICS: T4Metrics = {
  trades: 0,
  wins: 0,
  losses: 0,
  breakevens: 0,
  winRate: 0,
  lossRate: 0,
  breakevenRate: 0,
  avgWinR: 0,
  avgLossR: 0,
  payoff: null,
  expectancy: 0,
  profitFactor: null,
  totalR: 0,
  avgR: 0,
  maxDrawdownR: 0,
  recoveryFactor: null,
  avgMfeR: null,
  avgMaeR: null,
  maxConsecutiveWins: 0,
  maxConsecutiveLosses: 0,
  sharpe: null,
  sortino: null,
  ratiosUnavailableReason: "Sem trades executados.",
  equityCurve: [],
  drawdownCurve: [],
  rDistribution: [],
};

/** Só trades EXECUTADOS com resultado fechado entram nas métricas. */
export function executedTrades(trades: T4Trade[]): T4Trade[] {
  return trades.filter(
    (trade) => trade.outcome === "EXECUTED" && trade.resultR !== null && trade.result !== null,
  );
}

/**
 * CUSTOS REAIS → R. O custo entra em PONTOS e depois é dividido pelo risco
 * inicial, que é a unidade de R. Slippage conta DUAS vezes (entrada e saída),
 * porque escorrega nas duas pernas.
 */
export function costInPoints(costs: TradeCosts, contracts = 1): number {
  const moneyPerContract = costs.brokerage + costs.exchangeFees;
  const pointValue = costs.pointValue > 0 ? costs.pointValue : 1;
  const moneyInPoints = (moneyPerContract * contracts) / pointValue;
  return moneyInPoints + costs.slippagePoints * 2;
}

/**
 * Resultado líquido em R a partir do bruto em pontos. Esta é a ÚNICA função
 * que converte pontos→R no subsistema: manter isso centralizado impede que
 * uma tela mostre R com custo e outra sem.
 */
export function netResultR(input: {
  grossPoints: number;
  riskPoints: number;
  costs: TradeCosts;
  contracts?: number;
}): { netPoints: number; resultR: number } | null {
  if (!Number.isFinite(input.grossPoints) || input.riskPoints <= 0) return null;
  const netPoints = input.grossPoints - costInPoints(input.costs, input.contracts ?? 1);
  return { netPoints, resultR: netPoints / input.riskPoints };
}

/** Classificação do resultado com tolerância de breakeven em R. */
export function classifyResult(resultR: number, breakevenBandR = 0.05): TradeResult {
  if (Math.abs(resultR) <= breakevenBandR) return "BREAKEVEN";
  return resultR > 0 ? "WIN" : "LOSS";
}

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const average = mean(values);
  // Amostral (n-1): estamos estimando a dispersão de uma população maior.
  const variance =
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function bucketLabel(r: number): string {
  if (r <= -3) return "≤ -3R";
  if (r <= -2) return "-3R a -2R";
  if (r <= -1) return "-2R a -1R";
  if (r < 0) return "-1R a 0";
  if (r === 0) return "0";
  if (r < 1) return "0 a 1R";
  if (r < 2) return "1R a 2R";
  if (r < 3) return "2R a 3R";
  if (r < 5) return "3R a 5R";
  return "≥ 5R";
}

const BUCKET_ORDER = [
  "≤ -3R",
  "-3R a -2R",
  "-2R a -1R",
  "-1R a 0",
  "0",
  "0 a 1R",
  "1R a 2R",
  "2R a 3R",
  "3R a 5R",
  "≥ 5R",
];

/**
 * FÓRMULAS (todas sobre R líquido, já com custos):
 *   winRate      = wins / trades
 *   avgWinR      = média dos R > 0
 *   avgLossR     = média do |R| dos R < 0
 *   expectancy   = winRate*avgWinR − lossRate*avgLossR
 *   payoff       = avgWinR / avgLossR
 *   profitFactor = Σ ganhos / |Σ perdas|
 *   maxDrawdown  = máx(pico acumulado − equity)
 *   recovery     = totalR / maxDrawdownR
 *   sharpe       = média(R) / desvio(R)          [por trade, n ≥ 30]
 *   sortino      = média(R) / downsideDeviation  [MAR=0, n ≥ 30]
 *                  downsideDeviation = √( Σ min(0,R)² / n )
 */
export function computeT4Metrics(input: T4Trade[]): T4Metrics {
  const trades = executedTrades(input);
  if (trades.length === 0) return EMPTY_METRICS;

  const rValues = trades.map((trade) => trade.resultR!);
  const wins = trades.filter((trade) => trade.result === "WIN");
  const losses = trades.filter((trade) => trade.result === "LOSS");
  const breakevens = trades.filter((trade) => trade.result === "BREAKEVEN");

  const winRate = wins.length / trades.length;
  const lossRate = losses.length / trades.length;
  const breakevenRate = breakevens.length / trades.length;

  const avgWinR = wins.length ? mean(wins.map((trade) => trade.resultR!)) : 0;
  const avgLossR = losses.length ? Math.abs(mean(losses.map((trade) => trade.resultR!))) : 0;

  const grossWin = wins.reduce((sum, trade) => sum + trade.resultR!, 0);
  const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.resultR!, 0));

  // Expectancy pela fórmula exigida — não é a média simples quando há
  // breakevens, porque estes entram no denominador das taxas.
  const expectancy = winRate * avgWinR - lossRate * avgLossR;

  let equity = 0;
  let peak = 0;
  let maxDrawdownR = 0;
  let winStreak = 0;
  let lossStreak = 0;
  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;
  const equityCurve: Array<{ index: number; cumulativeR: number }> = [];
  const drawdownCurve: Array<{ index: number; drawdownR: number }> = [];

  trades.forEach((trade, index) => {
    equity += trade.resultR!;
    peak = Math.max(peak, equity);
    const drawdown = peak - equity;
    maxDrawdownR = Math.max(maxDrawdownR, drawdown);
    equityCurve.push({ index: index + 1, cumulativeR: Number(equity.toFixed(4)) });
    drawdownCurve.push({ index: index + 1, drawdownR: Number(drawdown.toFixed(4)) });
    if (trade.result === "WIN") {
      winStreak++;
      lossStreak = 0;
      maxConsecutiveWins = Math.max(maxConsecutiveWins, winStreak);
    } else if (trade.result === "LOSS") {
      lossStreak++;
      winStreak = 0;
      maxConsecutiveLosses = Math.max(maxConsecutiveLosses, lossStreak);
    } else {
      // Breakeven não quebra nem alimenta sequência.
    }
  });

  const mfe = trades.map((trade) => trade.mfeR).filter((value): value is number => value !== null);
  const mae = trades.map((trade) => trade.maeR).filter((value): value is number => value !== null);

  const deviation = standardDeviation(rValues);
  // Downside deviation PADRÃO (MAR = 0): raiz da média dos desvios negativos
  // ao quadrado sobre TODAS as observações — não o desvio-padrão do
  // subconjunto de perdas, que zeraria sempre que as perdas fossem iguais
  // (caso comum quando o stop é fixo em 1R) e esconderia o Sortino.
  const downside = Math.sqrt(
    rValues.reduce((sum, value) => sum + Math.min(0, value) ** 2, 0) / rValues.length,
  );
  const enoughSample = trades.length >= MIN_SAMPLE_FOR_RATIOS;
  const ratiosUnavailableReason = !enoughSample
    ? `Amostra insuficiente para Sharpe/Sortino (${trades.length}/${MIN_SAMPLE_FOR_RATIOS} trades).`
    : deviation === 0
      ? "Desvio-padrão zero — razões indefinidas."
      : null;

  const counts = new Map<string, number>();
  for (const value of rValues) {
    const label = bucketLabel(value);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return {
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    breakevens: breakevens.length,
    // Publicados em PERCENTUAL 0–100; internamente as taxas são frações,
    // porque a fórmula da expectância exige fração.
    winRate: winRate * 100,
    lossRate: lossRate * 100,
    breakevenRate: breakevenRate * 100,
    avgWinR,
    avgLossR,
    payoff: avgLossR > 0 ? avgWinR / avgLossR : null,
    expectancy,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
    totalR: equity,
    avgR: equity / trades.length,
    maxDrawdownR,
    recoveryFactor: maxDrawdownR > 0 ? equity / maxDrawdownR : null,
    avgMfeR: mfe.length ? mean(mfe) : null,
    avgMaeR: mae.length ? mean(mae) : null,
    maxConsecutiveWins,
    maxConsecutiveLosses,
    sharpe: enoughSample && deviation > 0 ? mean(rValues) / deviation : null,
    sortino: enoughSample && downside > 0 ? mean(rValues) / downside : null,
    ratiosUnavailableReason,
    equityCurve,
    drawdownCurve,
    rDistribution: BUCKET_ORDER.filter((bucket) => counts.has(bucket)).map((bucket) => ({
      bucket,
      count: counts.get(bucket)!,
    })),
  };
}
