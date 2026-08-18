import { computeT4Metrics } from "./metrics";
import { mulberry32, randomIndex, seedFromString } from "./rng";
import type { T4Trade } from "./types";
import { executedTrades } from "./metrics";

/**
 * REAMOSTRAGEM — quantifica INCERTEZA, não promete resultado.
 *
 * Bootstrap: reamostra os trades REAIS com reposição para estimar o intervalo
 * de confiança da expectância. Um IC 95% que cruza zero significa que a
 * vantagem observada é indistinguível de sorte na amostra disponível.
 *
 * Monte Carlo: embaralha a ORDEM dos mesmos resultados reais para medir a
 * distribuição de drawdown. Não inventa trades e não altera as magnitudes —
 * responde "que sequência de azar essa estratégia toleraria?".
 *
 * Ambos são semeados: mesma seed + mesmo dataset ⇒ mesmo resultado, sempre.
 */

export const DEFAULT_BOOTSTRAP_ITERATIONS = 2_000;
export const DEFAULT_MONTE_CARLO_ITERATIONS = 2_000;
/** Abaixo disso a reamostragem não tem base — melhor declarar indisponível. */
export const MIN_TRADES_FOR_RESAMPLING = 20;

export interface BootstrapResult {
  available: boolean;
  unavailableReason: string | null;
  iterations: number;
  seed: number;
  observedExpectancy: number;
  meanExpectancy: number;
  /** Intervalo de confiança 95% (percentis 2,5 e 97,5). */
  ci95Low: number;
  ci95High: number;
  /** Fração das reamostragens com expectância > 0. */
  probabilityPositive: number;
  /** true quando o IC 95% NÃO cruza zero (para qualquer um dos lados). */
  significant: boolean;
  /**
   * true SOMENTE quando o IC 95% inteiro está acima de zero — evidência de
   * vantagem POSITIVA. `significant` sozinho não serve para premiar uma
   * estratégia: um IC inteiramente NEGATIVO também é significativo, e
   * significa que a técnica perde de forma consistente.
   */
  significantlyPositive: boolean;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = (sorted.length - 1) * p;
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  if (low === high) return sorted[low]!;
  return sorted[low]! + (sorted[high]! - sorted[low]!) * (rank - low);
}

export function bootstrapExpectancy(
  trades: T4Trade[],
  options?: { iterations?: number; seed?: number | string },
): BootstrapResult {
  const executed = executedTrades(trades);
  const iterations = options?.iterations ?? DEFAULT_BOOTSTRAP_ITERATIONS;
  const seed =
    typeof options?.seed === "string"
      ? seedFromString(options.seed)
      : (options?.seed ?? seedFromString("t4-bootstrap"));

  const observed = computeT4Metrics(executed).expectancy;
  if (executed.length < MIN_TRADES_FOR_RESAMPLING) {
    return {
      available: false,
      unavailableReason: `Bootstrap exige ao menos ${MIN_TRADES_FOR_RESAMPLING} trades (${executed.length} disponíveis).`,
      iterations: 0,
      seed,
      observedExpectancy: observed,
      meanExpectancy: observed,
      ci95Low: 0,
      ci95High: 0,
      probabilityPositive: 0,
      significant: false,
      significantlyPositive: false,
    };
  }

  const values = executed.map((trade) => trade.resultR!);
  const next = mulberry32(seed);
  const samples: number[] = [];
  let positives = 0;

  for (let iteration = 0; iteration < iterations; iteration++) {
    let sum = 0;
    for (let draw = 0; draw < values.length; draw++) {
      sum += values[randomIndex(next, values.length)]!;
    }
    const expectancy = sum / values.length;
    samples.push(expectancy);
    if (expectancy > 0) positives++;
  }

  samples.sort((a, b) => a - b);
  const ci95Low = percentile(samples, 0.025);
  const ci95High = percentile(samples, 0.975);

  return {
    available: true,
    unavailableReason: null,
    iterations,
    seed,
    observedExpectancy: observed,
    meanExpectancy: samples.reduce((sum, value) => sum + value, 0) / samples.length,
    ci95Low,
    ci95High,
    probabilityPositive: positives / iterations,
    // Significativo = o intervalo inteiro fica de um lado do zero.
    significant: ci95Low > 0 || ci95High < 0,
    significantlyPositive: ci95Low > 0,
  };
}

export interface MonteCarloResult {
  available: boolean;
  unavailableReason: string | null;
  iterations: number;
  seed: number;
  /** Percentis do drawdown máximo (em R) sobre as permutações. */
  drawdownP50: number;
  drawdownP95: number;
  drawdownWorst: number;
  /** Percentis do resultado final acumulado. */
  finalRP05: number;
  finalRP50: number;
  finalRP95: number;
  /** Fração das permutações que terminaram positivas. */
  probabilityProfitable: number;
}

export function monteCarloSequences(
  trades: T4Trade[],
  options?: { iterations?: number; seed?: number | string },
): MonteCarloResult {
  const executed = executedTrades(trades);
  const iterations = options?.iterations ?? DEFAULT_MONTE_CARLO_ITERATIONS;
  const seed =
    typeof options?.seed === "string"
      ? seedFromString(options.seed)
      : (options?.seed ?? seedFromString("t4-montecarlo"));

  if (executed.length < MIN_TRADES_FOR_RESAMPLING) {
    return {
      available: false,
      unavailableReason: `Monte Carlo exige ao menos ${MIN_TRADES_FOR_RESAMPLING} trades (${executed.length} disponíveis).`,
      iterations: 0,
      seed,
      drawdownP50: 0,
      drawdownP95: 0,
      drawdownWorst: 0,
      finalRP05: 0,
      finalRP50: 0,
      finalRP95: 0,
      probabilityProfitable: 0,
    };
  }

  const base = executed.map((trade) => trade.resultR!);
  const next = mulberry32(seed);
  const drawdowns: number[] = [];
  const finals: number[] = [];
  let profitable = 0;

  for (let iteration = 0; iteration < iterations; iteration++) {
    // Fisher-Yates sobre uma cópia: permuta a ORDEM, preserva os valores.
    const shuffled = base.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = randomIndex(next, i + 1);
      const swap = shuffled[i]!;
      shuffled[i] = shuffled[j]!;
      shuffled[j] = swap;
    }
    let equity = 0;
    let peak = 0;
    let maxDrawdown = 0;
    for (const value of shuffled) {
      equity += value;
      peak = Math.max(peak, equity);
      maxDrawdown = Math.max(maxDrawdown, peak - equity);
    }
    drawdowns.push(maxDrawdown);
    finals.push(equity);
    if (equity > 0) profitable++;
  }

  drawdowns.sort((a, b) => a - b);
  finals.sort((a, b) => a - b);

  return {
    available: true,
    unavailableReason: null,
    iterations,
    seed,
    drawdownP50: percentile(drawdowns, 0.5),
    drawdownP95: percentile(drawdowns, 0.95),
    drawdownWorst: drawdowns[drawdowns.length - 1]!,
    finalRP05: percentile(finals, 0.05),
    finalRP50: percentile(finals, 0.5),
    finalRP95: percentile(finals, 0.95),
    probabilityProfitable: profitable / iterations,
  };
}

/**
 * ANÁLISE DE TAMANHO DE AMOSTRA. Responde: quantos trades faltam para o
 * intervalo de confiança ficar estreito o bastante para decidir algo?
 * Usa o erro-padrão observado — não uma tabela mágica.
 */
export interface SampleSizeAnalysis {
  currentTrades: number;
  standardError: number | null;
  /** Trades necessários para o IC 95% ter meia-largura <= alvo. */
  tradesForTargetPrecision: number | null;
  targetHalfWidthR: number;
  sufficient: boolean;
  note: string;
}

export function analyzeSampleSize(trades: T4Trade[], targetHalfWidthR = 0.1): SampleSizeAnalysis {
  const executed = executedTrades(trades);
  const n = executed.length;
  if (n < 2) {
    return {
      currentTrades: n,
      standardError: null,
      tradesForTargetPrecision: null,
      targetHalfWidthR,
      sufficient: false,
      note: "Amostra insuficiente para estimar erro-padrão.",
    };
  }
  const values = executed.map((trade) => trade.resultR!);
  const mean = values.reduce((sum, value) => sum + value, 0) / n;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1);
  const standardDeviation = Math.sqrt(variance);
  const standardError = standardDeviation / Math.sqrt(n);
  const halfWidth = 1.96 * standardError;
  // n necessário para 1,96 * s/√n <= alvo  →  n >= (1,96*s/alvo)²
  const required =
    targetHalfWidthR > 0 && standardDeviation > 0
      ? Math.ceil(((1.96 * standardDeviation) / targetHalfWidthR) ** 2)
      : null;
  return {
    currentTrades: n,
    standardError,
    tradesForTargetPrecision: required,
    targetHalfWidthR,
    sufficient: halfWidth <= targetHalfWidthR,
    note:
      halfWidth <= targetHalfWidthR
        ? `Precisão alcançada: ±${halfWidth.toFixed(3)}R.`
        : `Precisão atual ±${halfWidth.toFixed(3)}R; alvo ±${targetHalfWidthR}R.`,
  };
}
