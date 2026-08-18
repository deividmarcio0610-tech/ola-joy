import { computeT4Metrics, executedTrades } from "./metrics";
import type { T4Trade } from "./types";

/**
 * MATRIZ DE CONTRIBUIÇÃO E TESTE DE ABLAÇÃO (requisito 13).
 *
 * Duas perguntas diferentes:
 *
 * 1. CONTRIBUIÇÃO — quando este critério estava confirmado, o resultado foi
 *    melhor do que quando não estava? É observação sobre os trades que já
 *    aconteceram.
 * 2. ABLAÇÃO — se este critério fosse REMOVIDO da técnica, o que teria
 *    acontecido? Aqui há um limite honesto: sem reprocessar a série inteira
 *    não é possível saber quais NOVOS trades teriam surgido. O que este
 *    módulo mede é o efeito sobre a amostra EXISTENTE, e diz isso.
 *
 * Nenhuma função altera peso ou critério. Medir não é otimizar.
 */

export interface CriterionContribution {
  id: string;
  label: string;
  weight: number;
  /** Trades em que o critério estava confirmado no momento da decisão. */
  withCount: number;
  withoutCount: number;
  withExpectancy: number | null;
  withoutExpectancy: number | null;
  withWinRate: number | null;
  withoutWinRate: number | null;
  /** Diferença de expectativa (com − sem). Positivo = o critério ajudou. */
  delta: number | null;
  /** false quando algum dos lados tem amostra pequena demais. */
  reliable: boolean;
  note: string | null;
}

export const MIN_SIDE_SAMPLE = 15;

export function criteriaContribution(trades: T4Trade[]): CriterionContribution[] {
  const executed = executedTrades(trades);
  if (executed.length === 0) return [];

  // O catálogo de critérios vem dos PRÓPRIOS trades: assim a matriz reflete a
  // versão que gerou a amostra, e não a configuração atual do código.
  const catalog = new Map<string, { label: string; weight: number }>();
  for (const trade of executed) {
    for (const criterion of trade.criteria) {
      if (!catalog.has(criterion.id)) {
        catalog.set(criterion.id, { label: criterion.label, weight: criterion.weight });
      }
    }
  }

  return [...catalog.entries()].map(([id, meta]) => {
    const withList = executed.filter(
      (trade) => trade.criteria.find((item) => item.id === id)?.confirmed === true,
    );
    const withoutList = executed.filter(
      (trade) => trade.criteria.find((item) => item.id === id)?.confirmed !== true,
    );
    const withMetrics = withList.length > 0 ? computeT4Metrics(withList) : null;
    const withoutMetrics = withoutList.length > 0 ? computeT4Metrics(withoutList) : null;
    const reliable = withList.length >= MIN_SIDE_SAMPLE && withoutList.length >= MIN_SIDE_SAMPLE;

    return {
      id,
      label: meta.label,
      weight: meta.weight,
      withCount: withList.length,
      withoutCount: withoutList.length,
      withExpectancy: withMetrics?.expectancy ?? null,
      withoutExpectancy: withoutMetrics?.expectancy ?? null,
      withWinRate: withMetrics?.winRate ?? null,
      withoutWinRate: withoutMetrics?.winRate ?? null,
      delta:
        withMetrics && withoutMetrics ? withMetrics.expectancy - withoutMetrics.expectancy : null,
      reliable,
      note: reliable
        ? null
        : `Comparação sem base: ${withList.length} trade(s) com o critério e ${withoutList.length} sem (mínimo ${MIN_SIDE_SAMPLE} de cada lado).`,
    };
  });
}

export interface AblationResult {
  removedCriterionId: string;
  label: string;
  /** Trades que sobrariam se este critério deixasse de ser exigido. */
  tradesAfter: number;
  expectancyAfter: number | null;
  expectancyBefore: number;
  deltaExpectancy: number | null;
  totalRAfter: number | null;
  verdict: "CRITICO" | "UTIL" | "NEUTRO" | "PREJUDICIAL" | "INDISPONIVEL";
  note: string;
}

/**
 * ABLAÇÃO sobre a amostra existente.
 *
 * `baselineThreshold` é o corte de confluência em vigor. Ao "remover" um
 * critério, o peso dele sai do denominador e do numerador: trades que só
 * passavam por causa dele deixam de passar. O que NÃO dá para simular sem
 * reprocessar a série é o inverso — trades que teriam nascido sem a exigência.
 * O `note` declara essa limitação em cada linha.
 */
export function ablationTest(trades: T4Trade[], baselineThreshold = 0): AblationResult[] {
  const executed = executedTrades(trades).filter(
    (trade) => trade.confluenceAtEntry >= baselineThreshold,
  );
  if (executed.length === 0) return [];
  const before = computeT4Metrics(executed);

  const catalog = new Map<string, string>();
  for (const trade of executed) {
    for (const criterion of trade.criteria) {
      if (!catalog.has(criterion.id)) catalog.set(criterion.id, criterion.label);
    }
  }

  return [...catalog.entries()].map(([id, label]) => {
    const kept = executed.filter((trade) => {
      const criteria = trade.criteria;
      const removed = criteria.find((item) => item.id === id);
      if (!removed) return true;
      const totalWeight = criteria.reduce((sum, item) => sum + item.weight, 0) - removed.weight;
      if (totalWeight <= 0) return false;
      const confirmedWeight = criteria
        .filter((item) => item.id !== id && item.confirmed)
        .reduce((sum, item) => sum + item.weight, 0);
      return (confirmedWeight / totalWeight) * 100 >= baselineThreshold;
    });

    const after = kept.length > 0 ? computeT4Metrics(kept) : null;
    const delta = after ? after.expectancy - before.expectancy : null;

    let verdict: AblationResult["verdict"];
    if (after === null || kept.length < MIN_SIDE_SAMPLE) verdict = "INDISPONIVEL";
    else if (delta === null) verdict = "INDISPONIVEL";
    else if (delta <= -0.15) verdict = "CRITICO";
    else if (delta < -0.05) verdict = "UTIL";
    else if (delta <= 0.05) verdict = "NEUTRO";
    else verdict = "PREJUDICIAL";

    return {
      removedCriterionId: id,
      label,
      tradesAfter: kept.length,
      expectancyAfter: after?.expectancy ?? null,
      expectancyBefore: before.expectancy,
      deltaExpectancy: delta,
      totalRAfter: after?.totalR ?? null,
      verdict,
      note:
        verdict === "INDISPONIVEL"
          ? `Restariam ${kept.length} trade(s): amostra insuficiente para julgar.`
          : "Mede o efeito sobre a amostra existente. Trades que teriam NASCIDO sem esta exigência não podem ser simulados sem reprocessar a série.",
    };
  });
}

export interface DegradationWindow {
  days: 30 | 60 | 90;
  trades: number;
  expectancy: number | null;
  winRate: number | null;
  totalR: number | null;
  reliable: boolean;
}

export interface DegradationReport {
  /** Fim da janela — o trade mais recente da amostra, não a hora do relógio. */
  referenceAt: number | null;
  windows: DegradationWindow[];
  /** true quando a janela recente está claramente pior que a antiga. */
  degrading: boolean;
  note: string;
}

const DAY_MS = 86_400_000;

/**
 * DEGRADAÇÃO 30/60/90 DIAS.
 *
 * A referência é o ÚLTIMO trade da amostra, nunca `Date.now()`: um relatório
 * sobre dados históricos não pode mudar de resultado só porque foi aberto em
 * outro dia.
 */
export function degradationReport(trades: T4Trade[]): DegradationReport {
  const executed = executedTrades(trades).sort((a, b) => a.decidedAt - b.decidedAt);
  if (executed.length === 0) {
    return {
      referenceAt: null,
      windows: [],
      degrading: false,
      note: "AGUARDANDO DADOS SUFICIENTES: nenhum trade executado.",
    };
  }
  const referenceAt = executed[executed.length - 1]!.decidedAt;

  const windows = ([30, 60, 90] as const).map((days) => {
    const from = referenceAt - days * DAY_MS;
    const subset = executed.filter((trade) => trade.decidedAt >= from);
    const metrics = subset.length > 0 ? computeT4Metrics(subset) : null;
    return {
      days,
      trades: subset.length,
      expectancy: metrics?.expectancy ?? null,
      winRate: metrics?.winRate ?? null,
      totalR: metrics?.totalR ?? null,
      reliable: subset.length >= MIN_SIDE_SAMPLE,
    };
  });

  const recent = windows.find((window) => window.days === 30);
  const wide = windows.find((window) => window.days === 90);
  const degrading =
    Boolean(recent?.reliable && wide?.reliable) &&
    recent!.expectancy !== null &&
    wide!.expectancy !== null &&
    recent!.expectancy < wide!.expectancy - 0.15;

  return {
    referenceAt,
    windows,
    degrading,
    note: degrading
      ? "A janela de 30 dias está materialmente pior que a de 90: sinal de degradação, não prova de quebra."
      : "Sem degradação evidente entre as janelas medidas.",
  };
}
