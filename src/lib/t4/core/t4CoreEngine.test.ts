import { describe, expect, it } from "vitest";

import type { Candle } from "@/lib/engines/types";
import { CausalWindow } from "@/lib/t4/backtest/lookahead";
import {
  T4_CONFIG_HASH,
  T4_CORE_CONFIG,
  T4_CRITERIA_CONFIG,
  T4_TOTAL_WEIGHT,
  backtestReading,
  evaluateT4Core,
  evaluateT4Live,
  t4ConfigHash,
} from "./t4CoreEngine";

/** Série sintética determinística — sem Math.random, para o teste reproduzir. */
function series(count: number, seedPrice = 130000): Candle[] {
  const out: Candle[] = [];
  let price = seedPrice;
  for (let i = 0; i < count; i++) {
    // Onda: alta, correção, alta — gera estrutura, POI e reteste reais.
    const wave = Math.sin(i / 7) * 120 + i * 8;
    const open = price;
    const close = seedPrice + wave;
    const high = Math.max(open, close) + 25;
    const low = Math.min(open, close) - 25;
    out.push({ t: 1_700_000_000_000 + i * 60_000, o: open, h: high, l: low, c: close, v: 0 });
    price = close;
  }
  return out;
}

describe("t4CoreEngine — configuração e versionamento", () => {
  it("a soma dos pesos dos critérios é exatamente 100", () => {
    expect(T4_TOTAL_WEIGHT).toBe(100);
  });

  it("não existe critério duplicado", () => {
    const ids = T4_CRITERIA_CONFIG.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("o configHash é determinístico para a mesma configuração", () => {
    expect(t4ConfigHash(T4_CORE_CONFIG)).toBe(T4_CONFIG_HASH);
    expect(t4ConfigHash(T4_CORE_CONFIG)).toBe(t4ConfigHash(T4_CORE_CONFIG));
  });

  it("mudar um peso muda o configHash (exige nova versão da estratégia)", () => {
    const mutated = {
      ...T4_CORE_CONFIG,
      criteria: T4_CORE_CONFIG.criteria.map((item, index) =>
        index === 0 ? { ...item, weight: item.weight + 1 } : item,
      ),
    };
    expect(t4ConfigHash(mutated)).not.toBe(T4_CONFIG_HASH);
  });

  it("mudar um limiar muda o configHash", () => {
    const mutated = {
      ...T4_CORE_CONFIG,
      thresholds: { ...T4_CORE_CONFIG.thresholds, minPoiStrength: 999 },
    };
    expect(t4ConfigHash(mutated)).not.toBe(T4_CONFIG_HASH);
  });

  it("ordem das chaves não altera o hash (serialização canônica)", () => {
    const reordered = {
      thresholds: T4_CORE_CONFIG.thresholds,
      management: T4_CORE_CONFIG.management,
      criteria: T4_CORE_CONFIG.criteria,
      version: T4_CORE_CONFIG.version,
    };
    expect(t4ConfigHash(reordered)).toBe(T4_CONFIG_HASH);
  });
});

describe("t4CoreEngine — decisão", () => {
  const data = series(80);

  it("devolve null sem histórico fechado suficiente", () => {
    const short = series(6);
    expect(evaluateT4Core(new CausalWindow(short, short.length - 1), true)).toBeNull();
  });

  it("produz confluência entre 0 e 100 e critérios com pesos somando 100", () => {
    const decision = evaluateT4Core(new CausalWindow(data, data.length - 1), true);
    expect(decision).not.toBeNull();
    expect(decision!.confluence).toBeGreaterThanOrEqual(0);
    expect(decision!.confluence).toBeLessThanOrEqual(100);
    expect(decision!.criteria.reduce((sum, item) => sum + item.weight, 0)).toBe(100);
    expect(decision!.strategyVersion).toBe(T4_CORE_CONFIG.version);
    expect(decision!.configHash).toBe(T4_CONFIG_HASH);
  });

  it("candle ABERTO nunca confirma critério que exige fechamento", () => {
    const index = data.length - 1;
    const closed = evaluateT4Core(new CausalWindow(data, index), true)!;
    const open = evaluateT4Core(new CausalWindow(data, index), false)!;

    for (const config of T4_CRITERIA_CONFIG) {
      if (!config.requiresClose) continue;
      const item = open.criteria.find((c) => c.id === config.id)!;
      expect(item.confirmed).toBe(false);
    }
    // Com o candle aberto a confluência confirmada nunca pode ser MAIOR.
    expect(open.confluence).toBeLessThanOrEqual(closed.confluence);
    // O potencial, sim, reflete o que está esperando o fechamento.
    expect(open.potentialConfluence).toBeGreaterThanOrEqual(open.confluence);
  });

  it("é determinístico: mesma janela, mesma decisão", () => {
    const a = evaluateT4Core(new CausalWindow(data, 60), true)!;
    const b = evaluateT4Core(new CausalWindow(data, 60), true)!;
    expect(a.confluence).toBe(b.confluence);
    expect(a.lifecycle).toBe(b.lifecycle);
    expect(a.criteria.map((c) => c.confirmed)).toEqual(b.criteria.map((c) => c.confirmed));
  });

  it("PROVA MOTOR ÚNICO: LIVE e BACKTEST produzem decisão idêntica", () => {
    // BACKTEST: janela causal em um índice do meio da série.
    const index = 55;
    const backtest = evaluateT4Core(new CausalWindow(data, index), true)!;
    // LIVE: o mesmo instante chegando como "últimos candles lidos da tela".
    const liveWindow = data.slice(0, index + 1);
    const live = evaluateT4Live(liveWindow, backtestReading(liveWindow, true))!;

    expect(live.at).toBe(backtest.at);
    expect(live.direction).toBe(backtest.direction);
    expect(live.confluence).toBe(backtest.confluence);
    expect(live.lifecycle).toBe(backtest.lifecycle);
    expect(live.setup).toBe(backtest.setup);
    expect(live.gatesPassed).toBe(backtest.gatesPassed);
    expect(live.configHash).toBe(backtest.configHash);
    expect(live.criteria).toEqual(backtest.criteria);
  });

  it("a decisão em T não muda quando candles futuros são acrescentados", () => {
    const index = 50;
    const truncated = data.slice(0, index + 1);
    const withFuture = evaluateT4Core(new CausalWindow(data, index), true)!;
    const withoutFuture = evaluateT4Core(new CausalWindow(truncated, index), true)!;
    expect(withoutFuture.confluence).toBe(withFuture.confluence);
    expect(withoutFuture.criteria).toEqual(withFuture.criteria);
    expect(withoutFuture.gateBlockers).toEqual(withFuture.gateBlockers);
  });

  it("gates reprovados aparecem como bloqueios explícitos, não como confluência baixa", () => {
    const decision = evaluateT4Core(new CausalWindow(data, 30), true)!;
    if (!decision.gatesPassed) {
      expect(decision.gateBlockers.length).toBeGreaterThan(0);
    }
    // Confluência e gates são independentes: gate reprovado não zera a leitura.
    expect(typeof decision.confluence).toBe("number");
  });
});
