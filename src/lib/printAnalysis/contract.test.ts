import { describe, expect, it } from "vitest";

import {
  NOT_READABLE,
  formatReadable,
  validatePrintAnalysis,
  type PrintAnalysisPayloadInput,
} from "./contract";

/**
 * A proteção contra alucinação é o coração deste módulo: cada teste abaixo
 * descreve um jeito real de o modelo inventar informação sobre o gráfico de
 * alguém, e prova que o sistema recusa ou sanea.
 */

function payload(overrides: Partial<PrintAnalysisPayloadInput> = {}): PrintAnalysisPayloadInput {
  return {
    status: "PRE_ENTRADA",
    direction: "COMPRA",
    confidence: 80,
    explanation: "Estrutura de alta com pullback ao POI.",
    ...overrides,
  };
}

describe("validatePrintAnalysis", () => {
  it("aceita um payload mínimo válido e preenche os defaults", () => {
    const result = validatePrintAnalysis(payload());
    expect(result.ok).toBe(true);
    expect(result.analysis?.annotations).toEqual([]);
    expect(result.analysis?.targets).toEqual([]);
    expect(result.analysis?.entry.visible).toBe(false);
  });

  it("recusa status inexistente", () => {
    const result = validatePrintAnalysis(payload({ status: "COMPRA_AGORA" as never }));
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("status");
  });

  it("recusa confiança fora de 0–100", () => {
    expect(validatePrintAnalysis(payload({ confidence: 150 })).ok).toBe(false);
    expect(validatePrintAnalysis(payload({ confidence: -1 })).ok).toBe(false);
  });

  it("recusa coordenada fora de 0..1 — o desenho sairia da imagem", () => {
    const result = validatePrintAnalysis(
      payload({
        annotations: [
          {
            id: "a",
            role: "ENTRY",
            shape: "LINE",
            x1: 0,
            y1: 0.5,
            x2: 1.4,
            y2: 0.5,
            label: "Entrada",
          },
        ],
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("NUNCA aceita valor sem visible: o número é apagado", () => {
    const result = validatePrintAnalysis(payload({ entry: { value: 141385, visible: false } }));
    expect(result.ok).toBe(true);
    expect(result.analysis?.entry.value).toBeNull();
    expect(formatReadable(result.analysis!.entry)).toBe(NOT_READABLE);
  });

  it("visible sem número também não vira valor", () => {
    const result = validatePrintAnalysis(payload({ entry: { value: null, visible: true } }));
    expect(result.analysis?.entry.visible).toBe(false);
  });

  it("status não operacional perde entrada, stop e alvos", () => {
    const result = validatePrintAnalysis(
      payload({
        status: "SEM_T4",
        entry: { value: 141385, visible: true },
        stop: { value: 141250, visible: true },
        targets: [{ value: 141470, visible: true }],
        annotations: [
          {
            id: "e",
            role: "ENTRY",
            shape: "LINE",
            x1: 0,
            y1: 0.5,
            x2: 1,
            y2: 0.5,
            label: "Entrada",
          },
          {
            id: "s",
            role: "SUPPORT",
            shape: "LINE",
            x1: 0,
            y1: 0.8,
            x2: 1,
            y2: 0.8,
            label: "Suporte",
          },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.analysis?.entry.value).toBeNull();
    expect(result.analysis?.stop.value).toBeNull();
    expect(result.analysis?.targets).toEqual([]);
    // A marcação de contexto sobrevive; a de operação não.
    expect(result.analysis?.annotations.map((item) => item.role)).toEqual(["SUPPORT"]);
    expect(result.corrections.join(" ")).toContain("não autoriza níveis de operação");
  });

  it("recusa COMPRA com stop acima da entrada", () => {
    const result = validatePrintAnalysis(
      payload({
        direction: "COMPRA",
        entry: { value: 141000, visible: true },
        stop: { value: 141500, visible: true },
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("COMPRA");
  });

  it("recusa VENDA com stop abaixo da entrada", () => {
    const result = validatePrintAnalysis(
      payload({
        direction: "VENDA",
        entry: { value: 141500, visible: true },
        stop: { value: 141000, visible: true },
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("reordena zona invertida e registra o ajuste", () => {
    const result = validatePrintAnalysis(
      payload({
        entryZone: {
          low: { value: 141400, visible: true },
          high: { value: 141350, visible: true },
        },
      }),
    );
    expect(result.analysis?.entryZone.low.value).toBe(141350);
    expect(result.analysis?.entryZone.high.value).toBe(141400);
    expect(result.corrections.join(" ")).toContain("invertida");
  });

  it("descarta zona sem área — não daria para desenhar", () => {
    const result = validatePrintAnalysis(
      payload({
        annotations: [
          {
            id: "z",
            role: "ENTRY_ZONE",
            shape: "ZONE",
            x1: 0.4,
            y1: 0.5,
            x2: 0.4,
            y2: 0.5,
            label: "Zona",
          },
        ],
      }),
    );
    expect(result.analysis?.annotations).toEqual([]);
    expect(result.corrections.join(" ")).toContain("sem área");
  });

  it("renumera T4 anteriores e corrige a contagem declarada", () => {
    const result = validatePrintAnalysis(
      payload({
        pastT4Count: 7,
        annotations: [
          {
            id: "p1",
            role: "T4_PAST",
            shape: "MARKER",
            x1: 0.2,
            y1: 0.6,
            x2: 0.2,
            y2: 0.6,
            label: "T4",
            index: 9,
          },
          {
            id: "p2",
            role: "T4_PAST",
            shape: "MARKER",
            x1: 0.5,
            y1: 0.4,
            x2: 0.5,
            y2: 0.4,
            label: "T4",
            index: 3,
          },
        ],
      }),
    );
    expect(result.analysis?.pastT4Count).toBe(2);
    expect(result.analysis?.annotations.map((item) => item.index)).toEqual([1, 2]);
    expect(result.corrections.join(" ")).toContain("ajustada de 7 para 2");
  });

  it("ativo e timeframe em branco viram null (NÃO IDENTIFICADO na tela)", () => {
    const result = validatePrintAnalysis(payload({ symbol: "  ", timeframe: "" }));
    expect(result.analysis?.symbol).toBeNull();
    expect(result.analysis?.timeframe).toBeNull();
  });

  it("recusa entrada que não é objeto", () => {
    expect(validatePrintAnalysis("não é json").ok).toBe(false);
    expect(validatePrintAnalysis(null).ok).toBe(false);
    expect(validatePrintAnalysis({}).ok).toBe(false);
  });
});

describe("formatReadable", () => {
  it("mostra NÃO LEGÍVEL NO PRINT quando não há leitura", () => {
    expect(formatReadable({ value: null, visible: false })).toBe(NOT_READABLE);
    expect(formatReadable({ value: 100, visible: false })).toBe(NOT_READABLE);
  });

  it("formata número legível em pt-BR", () => {
    expect(formatReadable({ value: 141385, visible: true })).toBe("141.385");
  });
});
