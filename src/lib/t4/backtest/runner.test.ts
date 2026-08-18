import { describe, expect, it } from "vitest";

import type { Candle } from "@/lib/engines/types";
import { DEFAULT_BACKTEST_CONFIG, runBacktest, seriesHash } from "./runner";

/** Série determinística — reprodutibilidade é requisito, não conveniência. */
function series(count: number): Candle[] {
  const out: Candle[] = [];
  const base = 130000;
  for (let i = 0; i < count; i++) {
    const wave = Math.sin(i / 9) * 200 + Math.sin(i / 31) * 400 + i * 4;
    const open = base + wave;
    const close = base + Math.sin((i + 1) / 9) * 200 + Math.sin((i + 1) / 31) * 400 + (i + 1) * 4;
    out.push({
      t: 1_700_000_000_000 + i * 60_000,
      o: open,
      h: Math.max(open, close) + 40,
      l: Math.min(open, close) - 40,
      c: close,
      v: 0,
    });
  }
  return out;
}

const data = series(400);

describe("runBacktest", () => {
  it("é reprodutível: mesma série e mesma config produzem o mesmo resultado", () => {
    const a = runBacktest(data, DEFAULT_BACKTEST_CONFIG);
    const b = runBacktest(data, DEFAULT_BACKTEST_CONFIG);
    expect(a.seriesHash).toBe(b.seriesHash);
    expect(a.trades.length).toBe(b.trades.length);
    expect(a.trades.map((t) => t.tradeId)).toEqual(b.trades.map((t) => t.tradeId));
    expect(a.trades.map((t) => t.resultR)).toEqual(b.trades.map((t) => t.resultR));
  });

  it("mudar um candle muda o hash da série", () => {
    const mutated = data.map((c, i) => (i === 10 ? { ...c, c: c.c + 1 } : c));
    expect(seriesHash(mutated)).not.toBe(seriesHash(data));
  });

  it("registra oportunidades reprovadas e filtradas — nunca só as vencedoras", () => {
    const result = runBacktest(data, { ...DEFAULT_BACKTEST_CONFIG, confluenceThreshold: 95 });
    const outcomes = new Set(result.trades.map((trade) => trade.outcome));
    // Com limiar alto, tem de sobrar registro de rejeição/filtragem.
    expect(result.trades.length).toBeGreaterThan(0);
    expect(
      [...outcomes].some((outcome) =>
        ["REJECTED_BY_GATES", "FILTERED_BY_THRESHOLD"].includes(outcome),
      ),
    ).toBe(true);
  });

  it("toda oportunidade executada tem R, risco positivo e MFE/MAE apurados", () => {
    const result = runBacktest(data, { ...DEFAULT_BACKTEST_CONFIG, confluenceThreshold: 0 });
    for (const trade of result.trades.filter((item) => item.outcome === "EXECUTED")) {
      expect(trade.riskPoints).toBeGreaterThan(0);
      expect(trade.entryAt).not.toBeNull();
      expect(trade.exitAt).not.toBeNull();
      expect(trade.resultR).not.toBeNull();
      expect(trade.mfePoints).toBeGreaterThanOrEqual(0);
      expect(trade.maePoints).toBeGreaterThanOrEqual(0);
      expect(trade.result).not.toBeNull();
    }
  });

  it("oportunidade não executada NÃO recebe resultado inventado", () => {
    const result = runBacktest(data, { ...DEFAULT_BACKTEST_CONFIG, confluenceThreshold: 90 });
    for (const trade of result.trades.filter((item) => item.outcome !== "EXECUTED")) {
      expect(trade.resultR).toBeNull();
      expect(trade.result).toBeNull();
      expect(trade.netPoints).toBeNull();
    }
  });

  it("custos e slippage pioram o resultado líquido — nunca melhoram", () => {
    const free = runBacktest(data, { ...DEFAULT_BACKTEST_CONFIG, confluenceThreshold: 0 });
    const costly = runBacktest(data, {
      ...DEFAULT_BACKTEST_CONFIG,
      confluenceThreshold: 0,
      costs: { brokerage: 2, exchangeFees: 1, slippagePoints: 5, pointValue: 0.2 },
    });
    const sum = (list: typeof free.trades) =>
      list.filter((t) => t.resultR !== null).reduce((acc, t) => acc + t.resultR!, 0);
    expect(free.trades.length).toBe(costly.trades.length);
    if (free.trades.some((t) => t.outcome === "EXECUTED")) {
      expect(sum(costly.trades)).toBeLessThan(sum(free.trades));
    }
  });

  it("ambiguidade intrabar é resolvida pelo stop e declarada no motivo da saída", () => {
    const result = runBacktest(data, { ...DEFAULT_BACKTEST_CONFIG, confluenceThreshold: 0 });
    for (const trade of result.trades) {
      if (trade.exitReason?.includes("ambiguidade intrabar")) {
        expect(trade.exitPrice).toBe(trade.stopPrice);
      }
    }
  });

  it("pode ser cancelado no meio da varredura", () => {
    let seen = 0;
    const result = runBacktest(data, DEFAULT_BACKTEST_CONFIG, {
      shouldCancel: () => ++seen > 50,
      progressEvery: 1,
    });
    expect(result.cancelled).toBe(true);
    expect(result.scannedCandles).toBe(data.length);
  });

  it("reporta progresso monotônico até o total", () => {
    const seen: number[] = [];
    runBacktest(data, DEFAULT_BACKTEST_CONFIG, {
      onProgress: (p) => seen.push(p.processed),
      progressEvery: 25,
    });
    expect(seen.length).toBeGreaterThan(1);
    expect(seen[seen.length - 1]).toBe(data.length);
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]!);
  });

  it("nenhuma operação decide com dado posterior: truncar a série no ponto da decisão não muda a decisão", () => {
    const full = runBacktest(data, { ...DEFAULT_BACKTEST_CONFIG, confluenceThreshold: 0 });
    const first = full.trades[0];
    expect(first).toBeDefined();
    // Recorta a série até o candle da decisão: a MESMA oportunidade tem de
    // nascer com a MESMA confluência e os MESMOS critérios.
    const cutIndex = data.findIndex((candle) => candle.t === first!.decidedAt);
    const truncated = runBacktest(data.slice(0, cutIndex + 1), {
      ...DEFAULT_BACKTEST_CONFIG,
      confluenceThreshold: 0,
    });
    const same = truncated.trades.find((trade) => trade.decidedAt === first!.decidedAt);
    expect(same).toBeDefined();
    expect(same!.confluenceAtEntry).toBe(first!.confluenceAtEntry);
    expect(same!.criteria).toEqual(first!.criteria);
    expect(same!.entryPrice).toBe(first!.entryPrice);
    expect(same!.stopPrice).toBe(first!.stopPrice);
  });
});
