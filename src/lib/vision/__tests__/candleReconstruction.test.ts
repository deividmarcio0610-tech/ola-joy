import { describe, expect, it } from "vitest";

import {
  assertChronological,
  CandleReconstructor,
  candleId,
  MINUTE_MS,
  minuteStart,
} from "../candleReconstruction";

const T0 = Date.UTC(2026, 7, 6, 13, 0, 0); // início exato de um minuto

function reconstructor() {
  return new CandleReconstructor("WDO");
}

describe("minuteStart / candleId", () => {
  it("agrupa qualquer instante no início do seu minuto", () => {
    expect(minuteStart(T0)).toBe(T0);
    expect(minuteStart(T0 + 59_999)).toBe(T0);
    expect(minuteStart(T0 + MINUTE_MS)).toBe(T0 + MINUTE_MS);
  });

  it("gera identificação temporal única por minuto", () => {
    expect(candleId("WDO", T0)).toBe(`WDO:${T0}`);
    expect(candleId("WDO", T0)).not.toBe(candleId("WDO", T0 + MINUTE_MS));
  });
});

describe("CandleReconstructor — não duplicar candles", () => {
  it("mantém um único candle por minuto mesmo com muitas amostras", () => {
    const r = reconstructor();
    for (let i = 0; i < 120; i++) {
      r.push({ t: T0 + i * 500, price: 5000 + (i % 5), quality: 0.9 });
    }
    r.closeIfElapsed(T0 + MINUTE_MS);
    expect(r.closedCandles()).toHaveLength(1);
    expect(assertChronological(r.closedCandles()).ok).toBe(true);
  });

  it("não reempilha o histórico a cada frame (falha da versão anterior)", () => {
    const r = reconstructor();
    for (let m = 0; m < 5; m++) {
      for (let i = 0; i < 10; i++) {
        r.push({ t: T0 + m * MINUTE_MS + i * 1000, price: 5000 + m, quality: 0.9 });
      }
    }
    // 5 minutos percorridos = 4 fechados + 1 em formação.
    expect(r.closedCandles()).toHaveLength(4);
    expect(r.formingCandle()).not.toBeNull();
    const ids = r.closedCandles().map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("CandleReconstructor — candle aberto versus fechado", () => {
  it("separa o candle em formação dos fechados", () => {
    const r = reconstructor();
    r.push({ t: T0, price: 5000, quality: 1 });
    expect(r.closedCandles()).toHaveLength(0);
    expect(r.formingCandle()?.closed).toBe(false);

    const res = r.push({ t: T0 + MINUTE_MS, price: 5010, quality: 1 });
    expect(res.justClosed?.closed).toBe(true);
    expect(r.closedCandles()).toHaveLength(1);
    expect(r.formingCandle()?.t).toBe(T0 + MINUTE_MS);
  });

  it("fecha por passagem de tempo mesmo sem nova amostra", () => {
    const r = reconstructor();
    r.push({ t: T0, price: 5000, quality: 1 });
    const closed = r.closeIfElapsed(T0 + MINUTE_MS + 1);
    expect(closed?.closed).toBe(true);
    expect(r.formingCandle()).toBeNull();
  });

  it("não fecha antes do minuto virar", () => {
    const r = reconstructor();
    r.push({ t: T0, price: 5000, quality: 1 });
    expect(r.closeIfElapsed(T0 + 59_000)).toBeNull();
  });
});

describe("CandleReconstructor — candle fechado é imutável", () => {
  it("descarta amostra atrasada de minuto já fechado", () => {
    const r = reconstructor();
    r.push({ t: T0, price: 5000, quality: 1 });
    r.push({ t: T0 + MINUTE_MS, price: 5010, quality: 1 });

    const snapshot = { ...r.closedCandles()[0]! };
    const res = r.push({ t: T0 + 30_000, price: 9999, quality: 1 });

    expect(res.rejected).toContain("já está fechado");
    expect(r.closedCandles()[0]).toEqual(snapshot);
  });

  it("congela o objeto do candle fechado", () => {
    const r = reconstructor();
    r.push({ t: T0, price: 5000, quality: 1 });
    r.push({ t: T0 + MINUTE_MS, price: 5010, quality: 1 });
    expect(Object.isFrozen(r.closedCandles()[0])).toBe(true);
  });

  it("preserva OHLC correto do candle fechado", () => {
    const r = reconstructor();
    r.push({ t: T0 + 1_000, price: 5000, quality: 1 });
    r.push({ t: T0 + 10_000, price: 5020, quality: 1 });
    r.push({ t: T0 + 20_000, price: 4990, quality: 1 });
    r.push({ t: T0 + 50_000, price: 5005, quality: 1 });
    r.closeIfElapsed(T0 + MINUTE_MS);

    const c = r.closedCandles()[0]!;
    expect(c.o).toBe(5000);
    expect(c.h).toBe(5020);
    expect(c.l).toBe(4990);
    expect(c.c).toBe(5005);
  });
});

describe("CandleReconstructor — ordenação e amostras inválidas", () => {
  it("mantém ordem cronológica estrita", () => {
    const r = reconstructor();
    for (let m = 0; m < 10; m++) {
      r.push({ t: T0 + m * MINUTE_MS, price: 5000 + m, quality: 0.9 });
    }
    const check = assertChronological(r.closedCandles());
    expect(check.ok).toBe(true);
    expect(check.problem).toBeNull();
  });

  it("descarta amostra fora de ordem dentro do minuto", () => {
    const r = reconstructor();
    r.push({ t: T0 + 30_000, price: 5000, quality: 1 });
    const res = r.push({ t: T0 + 10_000, price: 4000, quality: 1 });
    expect(res.rejected).toContain("instante anterior");
    expect(r.formingCandle()?.l).toBe(5000);
  });

  it("descarta preço inválido em vez de corromper o candle", () => {
    const r = reconstructor();
    r.push({ t: T0, price: 5000, quality: 1 });
    const res = r.push({ t: T0 + 1_000, price: Number.NaN, quality: 1 });
    expect(res.rejected).toContain("inválido");
    expect(r.formingCandle()?.c).toBe(5000);
  });

  it("assertChronological detecta duplicata", () => {
    const r = reconstructor();
    r.push({ t: T0, price: 5000, quality: 1 });
    r.push({ t: T0 + MINUTE_MS, price: 5010, quality: 1 });
    const list = r.closedCandles();
    const check = assertChronological([...list, list[0]!]);
    expect(check.ok).toBe(false);
    expect(check.problem).toContain("duplicado");
  });
});

describe("CandleReconstructor — qualidade de leitura", () => {
  it("registra a qualidade média das amostras do candle", () => {
    const r = reconstructor();
    r.push({ t: T0, price: 5000, quality: 1 });
    r.push({ t: T0 + 1_000, price: 5001, quality: 0.5 });
    r.closeIfElapsed(T0 + MINUTE_MS);
    expect(r.closedCandles()[0]!.quality).toBe(75);
  });

  it("expõe qualidade média da janela recente", () => {
    const r = reconstructor();
    for (let m = 0; m < 4; m++) {
      r.push({ t: T0 + m * MINUTE_MS, price: 5000, quality: 0.8 });
    }
    expect(r.averageQuality()).toBe(80);
  });
});

describe("CandleReconstructor — ausência de dados fabricados", () => {
  it("não gera candle nenhum sem amostra", () => {
    const r = reconstructor();
    expect(r.closedCandles()).toHaveLength(0);
    expect(r.formingCandle()).toBeNull();
    expect(r.averageQuality()).toBe(0);
  });

  it("volume permanece zero: não existe volume sintético", () => {
    const r = reconstructor();
    r.push({ t: T0, price: 5000, quality: 1 });
    r.push({ t: T0 + MINUTE_MS, price: 5010, quality: 1 });
    expect(r.closedCandles()[0]!.v).toBe(0);
  });

  it("reset limpa todo o estado", () => {
    const r = reconstructor();
    r.push({ t: T0, price: 5000, quality: 1 });
    r.push({ t: T0 + MINUTE_MS, price: 5010, quality: 1 });
    r.reset();
    expect(r.closedCandles()).toHaveLength(0);
    expect(r.formingCandle()).toBeNull();
    // Após reset o mesmo minuto pode ser reconstruído do zero.
    expect(r.push({ t: T0, price: 5000, quality: 1 }).rejected).toBeNull();
  });
});
