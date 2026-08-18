import { describe, expect, it } from "vitest";

import type { Candle } from "@/lib/engines/types";
import {
  CausalWindow,
  LookAheadViolation,
  evaluateSignal,
  futureAfterEntry,
  type CriterionCheck,
} from "./lookahead";

const MINUTE = 60_000;

function series(closes: number[]): Candle[] {
  return closes.map((close, index) => ({
    t: 1_700_000_000_000 + index * MINUTE,
    o: close - 1,
    h: close + 2,
    l: close - 2,
    c: close,
    v: 0,
  }));
}

describe("PROVA ANTI-LOOK-AHEAD: a janela causal não entrega o futuro", () => {
  const data = series([100, 101, 102, 103, 104, 105]);

  it("visible() termina EXATAMENTE no candle atual", () => {
    const window = new CausalWindow(data, 2);
    const visible = window.visible();
    expect(visible).toHaveLength(3);
    expect(visible[visible.length - 1]!.c).toBe(102);
    // O candle 103 (futuro) não pode estar acessível de forma alguma.
    expect(visible.some((candle) => candle.c > 102)).toBe(false);
  });

  it("past() exclui o candle atual", () => {
    const window = new CausalWindow(data, 3);
    expect(window.past().map((c) => c.c)).toEqual([100, 101, 102]);
  });

  it("qualquer tentativa de ler o futuro LANÇA em vez de devolver dado", () => {
    const window = new CausalWindow(data, 1);
    expect(() => window.future()).toThrow(LookAheadViolation);
  });

  it("índice fora da série é recusado", () => {
    expect(() => new CausalWindow(data, 99)).toThrow(LookAheadViolation);
    expect(() => new CausalWindow(data, -1)).toThrow(LookAheadViolation);
  });

  it("a decisão em cada índice é IDÊNTICA com ou sem candles futuros na série", () => {
    // Este é o teste que mata look-ahead de verdade: rodar a mesma avaliação
    // sobre a série truncada e sobre a série completa tem de dar o MESMO
    // resultado. Se o futuro vazasse, os dois divergiriam.
    const checks: CriterionCheck[] = [
      {
        id: "alta",
        label: "fechamento acima do anterior",
        weight: 100,
        requiresClose: true,
        evaluate: (window) => {
          const visible = window.visible();
          const current = visible[visible.length - 1]!;
          const previous = visible[visible.length - 2];
          return {
            met: previous !== undefined && current.c > previous.c,
            detail: `c=${current.c}`,
          };
        },
      },
    ];

    for (let index = 1; index < data.length; index++) {
      const truncated = data.slice(0, index + 1); // sem NENHUM candle futuro
      const comFuturo = evaluateSignal(new CausalWindow(data, index), checks, true);
      const semFuturo = evaluateSignal(new CausalWindow(truncated, index), checks, true);
      expect(semFuturo.lifecycle).toBe(comFuturo.lifecycle);
      expect(semFuturo.confirmedConfluence).toBe(comFuturo.confirmedConfluence);
      expect(semFuturo.criteria).toEqual(comFuturo.criteria);
    }
  });
});

describe("ciclo DETECTED → PENDING_CLOSE → CONFIRMED/INVALIDATED", () => {
  const data = series([100, 105]);
  const precisaFechar: CriterionCheck = {
    id: "fechamento",
    label: "candle de confirmação",
    weight: 60,
    requiresClose: true,
    evaluate: () => ({ met: true, detail: "fechou acima" }),
  };
  const naoPrecisaFechar: CriterionCheck = {
    id: "estrutura",
    label: "estrutura rompida",
    weight: 40,
    requiresClose: false,
    evaluate: () => ({ met: true, detail: "BOS" }),
  };

  it("candle ABERTO: critério que exige fechamento fica PENDING_CLOSE e NÃO conta", () => {
    const state = evaluateSignal(
      new CausalWindow(data, 1),
      [precisaFechar, naoPrecisaFechar],
      false,
    );
    expect(state.lifecycle).toBe("PENDING_CLOSE");
    // Só o critério que não depende de fechamento entra na confluência.
    expect(state.confirmedConfluence).toBe(40);
    // O potencial mostra onde CHEGARIA se o candle fechasse assim.
    expect(state.potentialConfluence).toBe(100);
    expect(state.criteria.find((c) => c.id === "fechamento")!.pendingClose).toBe(true);
    expect(state.criteria.find((c) => c.id === "fechamento")!.confirmed).toBe(false);
  });

  it("candle FECHADO: o mesmo cenário confirma e atinge 100", () => {
    const state = evaluateSignal(
      new CausalWindow(data, 1),
      [precisaFechar, naoPrecisaFechar],
      true,
    );
    expect(state.lifecycle).toBe("CONFIRMED");
    expect(state.confirmedConfluence).toBe(100);
  });

  it("nenhum critério atendido = INVALIDATED (não 'aguardando' eterno)", () => {
    const nenhum: CriterionCheck = {
      id: "x",
      label: "x",
      weight: 100,
      requiresClose: false,
      evaluate: () => ({ met: false, detail: null }),
    };
    const state = evaluateSignal(new CausalWindow(data, 1), [nenhum], true);
    expect(state.lifecycle).toBe("INVALIDATED");
    expect(state.confirmedConfluence).toBe(0);
  });

  it("parcialmente atendido sem pendência = DETECTED", () => {
    const parcial: CriterionCheck = {
      id: "y",
      label: "y",
      weight: 50,
      requiresClose: false,
      evaluate: () => ({ met: false, detail: null }),
    };
    const state = evaluateSignal(new CausalWindow(data, 1), [naoPrecisaFechar, parcial], true);
    expect(state.lifecycle).toBe("DETECTED");
  });
});

describe("o futuro só é liberado DEPOIS da entrada", () => {
  const data = series([100, 101, 102, 103, 104]);

  it("futureAfterEntry começa no candle SEGUINTE à entrada", () => {
    const future = futureAfterEntry(data, 1);
    expect(future.map((c) => c.c)).toEqual([102, 103, 104]);
  });

  it("respeita o limite de candles para apuração", () => {
    expect(futureAfterEntry(data, 0, 2).map((c) => c.c)).toEqual([101, 102]);
  });

  it("entrada no último candle não tem futuro para apurar", () => {
    expect(futureAfterEntry(data, data.length - 1)).toEqual([]);
  });
});
