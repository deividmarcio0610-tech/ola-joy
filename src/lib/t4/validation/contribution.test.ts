import { describe, expect, it } from "vitest";

import { makeTrade, makeTrades, winningPattern } from "./fixtures";
import {
  MIN_SIDE_SAMPLE,
  ablationTest,
  criteriaContribution,
  degradationReport,
} from "./contribution";
import type { T4Trade } from "./types";

const DAY = 86_400_000;

/**
 * Amostra onde "reaction" É QUEM CARREGA os vencedores.
 *
 * Grupo A: só `reaction` confirmada (confluência 40) e resultado +2R.
 * Grupo B: só `structure` confirmada (confluência 60) e resultado −1R.
 *
 * Com limiar 30 os dois grupos operam. Retirando `reaction` do cálculo, o
 * grupo A deixa de qualificar e sobra só o grupo B — é exatamente esse efeito
 * que a ablação mede.
 */
function reactionCarriesSample(): T4Trade[] {
  const carried = makeTrades(40, () => 2).map((trade, index) => ({
    ...trade,
    tradeId: `w${index}`,
    confluenceAtEntry: 40,
    criteria: [
      {
        id: "structure",
        label: "Estrutura",
        weight: 60,
        confirmed: false,
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
  }));
  const withoutReaction = makeTrades(40, () => -1).map((trade, index) => ({
    ...trade,
    tradeId: `o${index}`,
    confluenceAtEntry: 60,
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
        confirmed: false,
        pendingClose: false,
        detail: null,
      },
    ],
  }));
  return [...carried, ...withoutReaction];
}

/** Amostra em que `structure` está SEMPRE confirmada — sem lado de comparação. */
function alwaysConfirmedSample(): T4Trade[] {
  return makeTrades(40, winningPattern).map((trade, index) => ({
    ...trade,
    tradeId: `a${index}`,
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
        confirmed: index % 2 === 0,
        pendingClose: false,
        detail: null,
      },
    ],
  }));
}

describe("criteriaContribution", () => {
  it("mostra que o critério decisivo separa os resultados", () => {
    const rows = criteriaContribution(reactionCarriesSample());
    const reaction = rows.find((row) => row.id === "reaction")!;
    expect(reaction.withCount).toBe(40);
    expect(reaction.withoutCount).toBe(40);
    expect(reaction.withExpectancy!).toBeGreaterThan(0);
    expect(reaction.withoutExpectancy!).toBeLessThan(0);
    expect(reaction.delta!).toBeGreaterThan(0);
    expect(reaction.reliable).toBe(true);
  });

  it("critério sempre confirmado não tem lado de comparação e vira NÃO confiável", () => {
    const rows = criteriaContribution(alwaysConfirmedSample());
    const structure = rows.find((row) => row.id === "structure")!;
    expect(structure.withoutCount).toBe(0);
    expect(structure.reliable).toBe(false);
    expect(structure.note).toContain(String(MIN_SIDE_SAMPLE));
    expect(structure.delta).toBeNull();
  });

  it("o catálogo vem dos trades, não da configuração atual do código", () => {
    const trades = makeTrades(20, winningPattern).map((trade) => ({
      ...trade,
      criteria: [
        {
          id: "criterio_antigo",
          label: "Critério de uma versão antiga",
          weight: 100,
          confirmed: true,
          pendingClose: false,
          detail: null,
        },
      ],
    }));
    const rows = criteriaContribution(trades);
    expect(rows.map((row) => row.id)).toEqual(["criterio_antigo"]);
  });

  it("amostra vazia devolve lista vazia", () => {
    expect(criteriaContribution([])).toEqual([]);
  });
});

describe("ablationTest", () => {
  it("remover um critério exigido reduz a amostra e é declarado", () => {
    const results = ablationTest(reactionCarriesSample(), 30);
    const reaction = results.find((row) => row.removedCriterionId === "reaction")!;
    expect(reaction.note).toContain("não podem ser simulados");
    expect(reaction.tradesAfter).toBeGreaterThan(0);
  });

  it("classifica como CRÍTICO o critério cuja remoção derruba a expectativa", () => {
    // Sem 'reaction' no cálculo, os +2R deixam de qualificar e sobram os −1R.
    const results = ablationTest(reactionCarriesSample(), 30);
    const reaction = results.find((row) => row.removedCriterionId === "reaction")!;
    expect(reaction.deltaExpectancy).not.toBeNull();
    expect(reaction.deltaExpectancy!).toBeLessThan(0);
    expect(reaction.verdict).toBe("CRITICO");
  });

  it("amostra pequena após a remoção devolve INDISPONIVEL em vez de palpite", () => {
    const tiny = makeTrades(5, () => 1);
    const results = ablationTest(tiny, 50);
    for (const row of results) {
      expect(row.verdict).toBe("INDISPONIVEL");
      expect(row.note).toContain("insuficiente");
    }
  });

  it("é determinístico", () => {
    const sample = reactionCarriesSample();
    expect(ablationTest(sample, 70)).toEqual(ablationTest(sample, 70));
  });
});

describe("degradationReport", () => {
  it("usa o ÚLTIMO trade como referência, não o relógio", () => {
    const trades = makeTrades(30, winningPattern);
    const report = degradationReport(trades);
    expect(report.referenceAt).toBe(Math.max(...trades.map((t) => t.decidedAt)));
    // Rodar de novo amanhã daria o mesmo número.
    expect(degradationReport(trades)).toEqual(report);
  });

  it("detecta degradação quando os 30 dias recentes estão piores", () => {
    const base = 1_700_000_000_000;
    const old = makeTrades(40, () => 2).map((trade, index) => ({
      ...trade,
      tradeId: `old${index}`,
      decidedAt: base - 85 * DAY + index * 60_000,
    }));
    const recent = makeTrades(40, () => -1).map((trade, index) => ({
      ...trade,
      tradeId: `new${index}`,
      decidedAt: base - 5 * DAY + index * 60_000,
    }));
    const report = degradationReport([...old, ...recent]);
    expect(report.degrading).toBe(true);
    expect(report.note).toContain("degradação");
  });

  it("não acusa degradação quando o desempenho é estável", () => {
    const base = 1_700_000_000_000;
    const trades = makeTrades(90, winningPattern).map((trade, index) => ({
      ...trade,
      tradeId: `st${index}`,
      decidedAt: base - 89 * DAY + index * DAY,
    }));
    expect(degradationReport(trades).degrading).toBe(false);
  });

  it("sem trades devolve AGUARDANDO DADOS SUFICIENTES", () => {
    const report = degradationReport([]);
    expect(report.referenceAt).toBeNull();
    expect(report.note).toContain("AGUARDANDO DADOS SUFICIENTES");
  });

  it("janela com poucos trades é marcada como não confiável", () => {
    const report = degradationReport(makeTrades(6, winningPattern));
    for (const window of report.windows) expect(window.reliable).toBe(false);
  });
});

describe("ablação sem limiar", () => {
  it("com corte 0 declara INDISPONIVEL em vez de uma parede de NEUTRO", () => {
    const results = ablationTest(reactionCarriesSample(), 0);
    expect(results.length).toBeGreaterThan(0);
    for (const row of results) {
      expect(row.verdict).toBe("INDISPONIVEL");
      expect(row.deltaExpectancy).toBeNull();
      expect(row.note).toContain("não se aplica com limiar de confluência 0");
    }
  });
});
