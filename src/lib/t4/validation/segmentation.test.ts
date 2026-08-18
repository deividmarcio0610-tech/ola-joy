import { describe, expect, it } from "vitest";

import { makeTrade, makeTrades, winningPattern } from "./fixtures";
import {
  CONFLUENCE_BANDS,
  MIN_SEGMENT_SAMPLE,
  confluenceBandOf,
  segmentAll,
  segmentByConfluence,
  segmentByDirection,
  segmentByHour,
} from "./segmentation";

describe("faixas de confluência", () => {
  it("as faixas cobrem 0–100 sem buraco nem sobreposição", () => {
    for (let value = 0; value <= 100; value++) {
      const matches = CONFLUENCE_BANDS.filter((band) => value >= band.min && value <= band.max);
      expect(matches).toHaveLength(1);
    }
  });

  it("confluenceBandOf devolve a faixa correta nas bordas", () => {
    expect(confluenceBandOf(0)).toBe("0-59");
    expect(confluenceBandOf(59.9)).toBe("0-59");
    expect(confluenceBandOf(60)).toBe("60-69");
    expect(confluenceBandOf(84.99)).toBe("80-84");
    expect(confluenceBandOf(85)).toBe("85-89");
    expect(confluenceBandOf(100)).toBe("100");
  });
});

describe("segmentByConfluence", () => {
  it("separa os trades por faixa e mantém a contagem total", () => {
    const trades = [
      ...makeTrades(
        10,
        () => 1,
        () => ({ confluenceAtEntry: 55 }),
      ),
      ...makeTrades(
        10,
        () => -1,
        () => ({ confluenceAtEntry: 72 }),
      ),
      ...makeTrades(
        10,
        () => 3,
        () => ({ confluenceAtEntry: 97 }),
      ),
    ].map((trade, index) => ({ ...trade, tradeId: `x${index}` }));

    const result = segmentByConfluence(trades);
    const keys = result.segments.map((segment) => segment.key);
    expect(keys).toEqual(["0-59", "70-79", "95-99"]);
    expect(result.segments.reduce((sum, s) => sum + s.trades, 0)).toBe(30);
    // Faixas sem nenhum trade são declaradas, não escondidas.
    expect(result.emptyKeys).toContain("100");
  });

  it("marca segmento com amostra pequena como NÃO confiável e explica", () => {
    const trades = makeTrades(
      5,
      () => 3,
      () => ({ confluenceAtEntry: 88 }),
    );
    const segment = segmentByConfluence(trades).segments[0]!;
    expect(segment.trades).toBe(5);
    expect(segment.reliable).toBe(false);
    expect(segment.note).toContain(String(MIN_SEGMENT_SAMPLE));
  });

  it("segmento com amostra suficiente é marcado como confiável", () => {
    const trades = makeTrades(MIN_SEGMENT_SAMPLE, winningPattern, () => ({
      confluenceAtEntry: 88,
    }));
    const segment = segmentByConfluence(trades).segments[0]!;
    expect(segment.reliable).toBe(true);
    expect(segment.note).toBeNull();
  });

  it("ignora oportunidades não executadas — elas não têm resultado", () => {
    const trades = [
      ...makeTrades(10, () => 1),
      makeTrade(99, { outcome: "FILTERED_BY_THRESHOLD", resultR: null, result: null }),
      makeTrade(98, { outcome: "REJECTED_BY_GATES", resultR: null, result: null }),
    ];
    const total = segmentByConfluence(trades).segments.reduce((sum, s) => sum + s.trades, 0);
    expect(total).toBe(10);
  });
});

describe("outras dimensões", () => {
  it("segmenta por direção", () => {
    const result = segmentByDirection(makeTrades(20, winningPattern));
    expect(result.segments.map((s) => s.key).sort()).toEqual(["COMPRA", "VENDA"]);
  });

  it("segmenta por hora em UTC — independente do fuso da máquina", () => {
    const trades = makeTrades(4, () => 1);
    const result = segmentByHour(trades);
    const expected = [
      ...new Set(trades.map((t) => String(new Date(t.decidedAt).getUTCHours()).padStart(2, "0"))),
    ].sort();
    expect(result.segments.map((s) => s.key)).toEqual(expected);
    expect(result.segments[0]!.label).toMatch(/UTC$/);
  });

  it("segmentAll cobre todas as dimensões exigidas", () => {
    const result = segmentAll(makeTrades(30, winningPattern));
    expect(Object.keys(result).sort()).toEqual(
      ["asset", "confluence", "direction", "hour", "regime", "session", "timeframe"].sort(),
    );
    expect(result.asset.segments[0]!.key).toBe("WIN");
    expect(result.timeframe.segments[0]!.key).toBe("1m");
    expect(result.regime.segments[0]!.key).toBe("TREND_UP");
  });

  it("amostra vazia devolve segmentos vazios, sem quebrar", () => {
    const result = segmentAll([]);
    expect(result.confluence.segments).toEqual([]);
    expect(result.direction.segments).toEqual([]);
  });
});
