import { describe, expect, it } from "vitest";

import { annotationToBox, annotationToPixels, unitsPerRenderedPixel } from "./geometry";

/**
 * Requisito central do overlay: o desenho não pode deslocar o gráfico. Se a
 * marcação está em 62% da largura, ela precisa cair em 62% da largura da
 * imagem ORIGINAL — em qualquer resolução e depois de qualquer resize.
 */

const A = { x1: 0.62, y1: 0.4, x2: 0.89, y2: 0.46 };

describe("annotationToPixels", () => {
  it("converte proporção em pixel da imagem original", () => {
    const result = annotationToPixels(A, 1000, 500);
    expect(result).toEqual({ x1: 620, y1: 200, x2: 890, y2: 230 });
  });

  it("mantém a MESMA proporção em qualquer resolução", () => {
    for (const [width, height] of [
      [800, 600],
      [1920, 1080],
      [3840, 2160],
      [360, 640],
    ]) {
      const result = annotationToPixels(A, width!, height!);
      expect(result.x1 / width!).toBeCloseTo(A.x1, 10);
      expect(result.y1 / height!).toBeCloseTo(A.y1, 10);
      expect(result.x2 / width!).toBeCloseTo(A.x2, 10);
      expect(result.y2 / height!).toBeCloseTo(A.y2, 10);
    }
  });

  it("uma linha horizontal continua horizontal (não deforma o preço)", () => {
    const line = { x1: 0, y1: 0.35, x2: 1, y2: 0.35 };
    const result = annotationToPixels(line, 1920, 1080);
    expect(result.y1).toBe(result.y2);
    expect(result.x1).toBe(0);
    expect(result.x2).toBe(1920);
  });

  it("os extremos 0 e 1 caem exatamente nas bordas", () => {
    const full = { x1: 0, y1: 0, x2: 1, y2: 1 };
    expect(annotationToPixels(full, 1280, 720)).toEqual({ x1: 0, y1: 0, x2: 1280, y2: 720 });
  });
});

describe("annotationToBox", () => {
  it("normaliza retângulo invertido em canto + tamanho positivo", () => {
    const inverted = { x1: 0.9, y1: 0.8, x2: 0.4, y2: 0.2 };
    expect(annotationToBox(inverted, 1000, 1000)).toEqual({
      x: 400,
      y: 200,
      width: 500,
      height: 600,
    });
  });

  it("retângulo já orientado permanece igual", () => {
    expect(annotationToBox(A, 1000, 1000)).toEqual({ x: 620, y: 400, width: 270, height: 60 });
  });
});

describe("unitsPerRenderedPixel", () => {
  it("é 1 quando a imagem é exibida no tamanho natural", () => {
    expect(unitsPerRenderedPixel(1920, 1920)).toBe(1);
  });

  it("cresce quando a imagem é reduzida — texto mantém tamanho na tela", () => {
    expect(unitsPerRenderedPixel(1920, 960)).toBe(2);
    expect(unitsPerRenderedPixel(1920, 480)).toBe(4);
  });

  it("degrada para 1 com medidas inválidas em vez de gerar NaN/Infinity", () => {
    expect(unitsPerRenderedPixel(1920, 0)).toBe(1);
    expect(unitsPerRenderedPixel(0, 800)).toBe(1);
    expect(unitsPerRenderedPixel(Number.NaN, 800)).toBe(1);
  });
});
