import type { PrintAnnotation } from "./contract";

/**
 * GEOMETRIA DO OVERLAY.
 *
 * As coordenadas chegam NORMALIZADAS (0..1) e são convertidas para o espaço
 * de pixels da imagem ORIGINAL. Como o SVG usa o mesmo viewBox das dimensões
 * naturais, o desenho fica ancorado ao pixel do gráfico: redimensionar a
 * janela escala imagem e overlay juntos, sem deslocar candle, preço ou zona.
 */

export interface OverlayBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OverlaySegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Converte a anotação normalizada para o espaço de pixels da imagem. */
export function annotationToPixels(
  annotation: Pick<PrintAnnotation, "x1" | "y1" | "x2" | "y2">,
  naturalWidth: number,
  naturalHeight: number,
): OverlaySegment {
  return {
    x1: annotation.x1 * naturalWidth,
    y1: annotation.y1 * naturalHeight,
    x2: annotation.x2 * naturalWidth,
    y2: annotation.y2 * naturalHeight,
  };
}

/** Retângulo normalizado (canto superior esquerdo + tamanho positivo). */
export function annotationToBox(
  annotation: Pick<PrintAnnotation, "x1" | "y1" | "x2" | "y2">,
  naturalWidth: number,
  naturalHeight: number,
): OverlayBox {
  const segment = annotationToPixels(annotation, naturalWidth, naturalHeight);
  return {
    x: Math.min(segment.x1, segment.x2),
    y: Math.min(segment.y1, segment.y2),
    width: Math.abs(segment.x2 - segment.x1),
    height: Math.abs(segment.y2 - segment.y1),
  };
}

/**
 * Fator de escala entre unidades do viewBox e pixels de tela. Usado para
 * manter texto e traço com tamanho constante em qualquer largura renderizada.
 */
export function unitsPerRenderedPixel(naturalWidth: number, renderedWidth: number): number {
  if (!(renderedWidth > 0) || !(naturalWidth > 0)) return 1;
  return naturalWidth / renderedWidth;
}
