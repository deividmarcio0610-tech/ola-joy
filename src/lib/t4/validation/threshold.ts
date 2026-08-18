import { computeT4Metrics, executedTrades } from "./metrics";
import type { T4Trade } from "./types";

/**
 * LIMIAR DE CONFLUÊNCIA — MEDIDO, NUNCA APLICADO SOZINHO (requisito 12).
 *
 * Este módulo encontra qual corte de confluência teria produzido a melhor
 * expectativa no histórico e mostra a CURVA inteira. O que ele NÃO faz, por
 * decisão explícita: alterar a estratégia. Nenhuma função aqui escreve
 * configuração — quem muda o limiar é uma pessoa, com uma versão nova.
 *
 * Um pico isolado é o sintoma clássico de overfitting: o corte "ótimo" só
 * funciona porque pegou dois trades sortudos. Por isso cada ponto carrega o
 * tamanho da amostra e o resultado é acompanhado de uma medida de
 * ESTABILIDADE — o quanto a vizinhança do pico concorda com ele.
 */

export interface ThresholdPoint {
  threshold: number;
  trades: number;
  winRate: number;
  expectancy: number;
  profitFactor: number | null;
  totalR: number;
  maxDrawdownR: number;
  /** false = amostra pequena demais para o ponto significar algo. */
  reliable: boolean;
}

export interface ThresholdAnalysis {
  points: ThresholdPoint[];
  /** Melhor corte observado NO HISTÓRICO. Sugestão, não aplicação. */
  bestThreshold: number | null;
  bestExpectancy: number | null;
  /**
   * 0–100. Alta = a vizinhança do pico tem desempenho parecido (platô).
   * Baixa = o pico é isolado e provavelmente é ruído.
   */
  stability: number;
  /** Alertas de possível overfitting, em português, com o motivo real. */
  overfittingAlerts: string[];
  /** true quando o pico NÃO deve ser levado a sério. */
  suspectedOverfitting: boolean;
  applied: false;
  note: string;
}

export const DEFAULT_THRESHOLD_STEP = 5;
export const MIN_TRADES_PER_THRESHOLD = 20;

/** Amostra mínima para o exercício de limiar fazer algum sentido. */
export const MIN_TRADES_FOR_THRESHOLD_SEARCH = 40;

export function analyzeThreshold(
  trades: T4Trade[],
  step = DEFAULT_THRESHOLD_STEP,
): ThresholdAnalysis {
  const executed = executedTrades(trades);
  const points: ThresholdPoint[] = [];

  for (let threshold = 0; threshold <= 100; threshold += step) {
    const subset = executed.filter((trade) => trade.confluenceAtEntry >= threshold);
    if (subset.length === 0) continue;
    const metrics = computeT4Metrics(subset);
    points.push({
      threshold,
      trades: metrics.trades,
      winRate: metrics.winRate,
      expectancy: metrics.expectancy,
      profitFactor: metrics.profitFactor,
      totalR: metrics.totalR,
      maxDrawdownR: metrics.maxDrawdownR,
      reliable: metrics.trades >= MIN_TRADES_PER_THRESHOLD,
    });
  }

  if (executed.length < MIN_TRADES_FOR_THRESHOLD_SEARCH) {
    return {
      points,
      bestThreshold: null,
      bestExpectancy: null,
      stability: 0,
      overfittingAlerts: [
        `Amostra de ${executed.length} trades: abaixo de ${MIN_TRADES_FOR_THRESHOLD_SEARCH} qualquer "limiar ótimo" é ruído.`,
      ],
      suspectedOverfitting: true,
      applied: false,
      note: "AGUARDANDO DADOS SUFICIENTES para procurar limiar.",
    };
  }

  // O melhor ponto só pode sair de cortes com amostra suficiente.
  const usable = points.filter((point) => point.reliable);
  if (usable.length === 0) {
    return {
      points,
      bestThreshold: null,
      bestExpectancy: null,
      stability: 0,
      overfittingAlerts: [
        `Nenhum corte de confluência reúne ${MIN_TRADES_PER_THRESHOLD} trades — não há limiar mensurável.`,
      ],
      suspectedOverfitting: true,
      applied: false,
      note: "AGUARDANDO DADOS SUFICIENTES para procurar limiar.",
    };
  }

  const best = usable.reduce((top, point) => (point.expectancy > top.expectancy ? point : top));

  // ESTABILIDADE: quanto os cortes vizinhos concordam com o pico. Um platô
  // largo é evidência; um pico solitário é sorte.
  const neighbours = usable.filter(
    (point) => Math.abs(point.threshold - best.threshold) <= step * 2 && point !== best,
  );
  const stability = computeStability(
    best.expectancy,
    neighbours.map((p) => p.expectancy),
  );

  const alerts: string[] = [];
  if (neighbours.length === 0) {
    alerts.push(
      `O corte ${best.threshold}% não tem vizinhos com amostra suficiente: impossível distinguir platô de pico isolado.`,
    );
  }
  if (stability < 50 && neighbours.length > 0) {
    alerts.push(
      `Pico isolado em ${best.threshold}%: os cortes vizinhos entregam expectativa bem diferente (estabilidade ${Math.round(stability)}/100). Sinal clássico de sobreajuste ao histórico.`,
    );
  }
  if (best.trades < MIN_TRADES_PER_THRESHOLD * 2) {
    alerts.push(
      `O corte ótimo sobrevive com apenas ${best.trades} trades — poucos eventos para sustentar a escolha.`,
    );
  }
  const spread =
    usable.length > 1
      ? Math.max(...usable.map((p) => p.expectancy)) - Math.min(...usable.map((p) => p.expectancy))
      : 0;
  if (spread > 1) {
    alerts.push(
      `A expectativa varia ${spread.toFixed(2)}R entre os cortes testados: o resultado depende demais do limiar escolhido.`,
    );
  }

  return {
    points,
    bestThreshold: best.threshold,
    bestExpectancy: best.expectancy,
    stability,
    overfittingAlerts: alerts,
    suspectedOverfitting: alerts.length > 0,
    applied: false,
    note: "Limiar apenas MEDIDO no histórico. A estratégia não foi alterada — mudar o corte exige nova versão, com OOS e forward próprios.",
  };
}

/**
 * 0–100. Compara a expectativa do pico com a dos vizinhos: quanto menor o
 * desvio relativo, mais o pico é um platô.
 */
function computeStability(bestExpectancy: number, neighbours: number[]): number {
  if (neighbours.length === 0) return 0;
  const scale = Math.max(Math.abs(bestExpectancy), 0.1);
  const meanDeviation =
    neighbours.reduce((sum, value) => sum + Math.abs(value - bestExpectancy), 0) /
    neighbours.length;
  return Math.max(0, Math.min(100, (1 - meanDeviation / scale) * 100));
}
