import type { Candle } from "@/lib/engines/types";
import type { SignalLifecycle } from "@/lib/t4/validation/types";

/**
 * BARREIRA ANTI-LOOK-AHEAD.
 *
 * O erro que invalida qualquer backtest é deixar a decisão de T enxergar
 * dados de T+1. Aqui isso é estrutural, não uma convenção:
 *
 * - `CausalWindow` entrega SOMENTE passado + candle atual. Pedir qualquer
 *   coisa além disso lança — não devolve undefined silencioso.
 * - `SignalStateMachine` implementa DETECTED → PENDING_CLOSE →
 *   CONFIRMED/INVALIDATED. Um critério que exige fechamento não confirma com
 *   o candle aberto; ele espera o candle FECHAR.
 * - O futuro só é liberado DEPOIS da entrada, e apenas para apurar
 *   stop/alvo/MFE/MAE — nunca para decidir.
 */

export class LookAheadViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LookAheadViolation";
  }
}

/**
 * Janela causal sobre a série. `index` é o candle ATUAL (já fechado quando
 * `closed` é true). Nada além de `index` é acessível.
 */
export class CausalWindow {
  constructor(
    private readonly series: readonly Candle[],
    private readonly index: number,
  ) {
    if (index < 0 || index >= series.length) {
      throw new LookAheadViolation(`Índice ${index} fora da série (${series.length}).`);
    }
  }

  /** Candle atual — o mais novo que a decisão pode conhecer. */
  current(): Candle {
    return this.series[this.index]!;
  }

  /** Histórico fechado ANTES do candle atual. */
  past(limit = Number.POSITIVE_INFINITY): Candle[] {
    const from = Number.isFinite(limit) ? Math.max(0, this.index - limit) : 0;
    return this.series.slice(from, this.index);
  }

  /** Passado + atual: exatamente o que a técnica pode ler para decidir. */
  visible(limit = Number.POSITIVE_INFINITY): Candle[] {
    const from = Number.isFinite(limit) ? Math.max(0, this.index + 1 - limit) : 0;
    return this.series.slice(from, this.index + 1);
  }

  /**
   * Tentativa de olhar o futuro. Existe para PROVAR que o caminho de decisão
   * não o usa: qualquer chamada lança e o teste anti-look-ahead depende disso.
   */
  future(): never {
    throw new LookAheadViolation(
      "Acesso ao futuro negado durante a decisão. O futuro só é liberado após a entrada, para apurar desfecho.",
    );
  }

  at(): number {
    return this.index;
  }

  size(): number {
    return this.series.length;
  }
}

export interface CriterionCheck {
  id: string;
  label: string;
  weight: number;
  /** true = o critério exige o candle FECHADO para valer. */
  requiresClose: boolean;
  /** Avaliado apenas com a janela causal. */
  evaluate: (window: CausalWindow) => { met: boolean; detail: string | null };
}

export interface SignalState {
  lifecycle: SignalLifecycle;
  /** Confluência 0–100 considerando somente o que já está CONFIRMADO. */
  confirmedConfluence: number;
  /** Confluência potencial, incluindo o que aguarda fechamento. */
  potentialConfluence: number;
  criteria: Array<{
    id: string;
    label: string;
    weight: number;
    confirmed: boolean;
    pendingClose: boolean;
    detail: string | null;
  }>;
  reason: string;
}

/**
 * Avalia os critérios respeitando o fechamento do candle.
 *
 * `candleClosed=false` (candle em formação) força todo critério com
 * `requiresClose` a ficar PENDING_CLOSE, por mais "óbvio" que pareça no
 * gráfico. É o que impede o backtest de contar um fechamento que, ao vivo,
 * ainda poderia se desfazer.
 */
export function evaluateSignal(
  window: CausalWindow,
  checks: readonly CriterionCheck[],
  candleClosed: boolean,
): SignalState {
  const criteria = checks.map((check) => {
    const result = check.evaluate(window);
    const pendingClose = check.requiresClose && !candleClosed && result.met;
    return {
      id: check.id,
      label: check.label,
      weight: check.weight,
      // Só conta como confirmado quando NÃO depende de um fechamento futuro.
      confirmed: result.met && !pendingClose,
      pendingClose,
      detail: result.detail,
    };
  });

  const totalWeight = checks.reduce((sum, check) => sum + check.weight, 0) || 1;
  const confirmedWeight = criteria
    .filter((item) => item.confirmed)
    .reduce((sum, item) => sum + item.weight, 0);
  const potentialWeight = criteria
    .filter((item) => item.confirmed || item.pendingClose)
    .reduce((sum, item) => sum + item.weight, 0);

  const confirmedConfluence = (confirmedWeight / totalWeight) * 100;
  const potentialConfluence = (potentialWeight / totalWeight) * 100;
  const anyPending = criteria.some((item) => item.pendingClose);
  const allConfirmed = criteria.every((item) => item.confirmed);

  let lifecycle: SignalLifecycle;
  let reason: string;
  if (allConfirmed) {
    lifecycle = "CONFIRMED";
    reason = "Todos os critérios confirmados em candle fechado.";
  } else if (anyPending) {
    lifecycle = "PENDING_CLOSE";
    reason = `Aguardando fechamento do candle para ${criteria.filter((c) => c.pendingClose).length} critério(s).`;
  } else if (confirmedWeight > 0) {
    lifecycle = "DETECTED";
    reason = "Setup em formação; critérios ainda incompletos.";
  } else {
    lifecycle = "INVALIDATED";
    reason = "Nenhum critério confirmado.";
  }

  return { lifecycle, confirmedConfluence, potentialConfluence, criteria, reason };
}

/**
 * LIBERAÇÃO DO FUTURO — só depois da entrada, e explicitamente.
 *
 * Separar isto do caminho de decisão é o que torna a regra verificável: quem
 * apura desfecho chama esta função; quem decide usa apenas a CausalWindow.
 */
export function futureAfterEntry(
  series: readonly Candle[],
  entryIndex: number,
  maxCandles = Number.POSITIVE_INFINITY,
): Candle[] {
  const from = entryIndex + 1;
  const to = Number.isFinite(maxCandles) ? Math.min(series.length, from + maxCandles) : series.length;
  return series.slice(from, to);
}
