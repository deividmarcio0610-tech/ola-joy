import type { Candle } from "@/lib/engines/types";
import type { Calibration } from "@/lib/vision/priceScale";
import { isReadable, priceAt } from "@/lib/vision/priceScale";

export interface PixelFrame {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface FrameRead {
  t: number;
  /** Linha do preço visual mais à direita, no mesmo eixo usado pela calibração. */
  priceY: number | null;
  bullMass: number;
  bearMass: number;
  activity: number;
  quality: number;
  width: number;
  height: number;
  /** Colunas/candles coloridos visíveis no frame — base do diagnóstico. */
  candleColumns: number;
}

export interface ExtractedCandle extends Candle {
  quality: number;
}

type PixelSide = "bull" | "bear" | null;

function pixelSide(r: number, g: number, b: number): PixelSide {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max < 55 || max - min < 38) return null;
  if (g > r + 20 && g > b + 8) return "bull";
  if (r > g + 20 && r >= b - 8) return "bear";
  return null;
}

function coloredAt(frame: PixelFrame, x: number, y: number): PixelSide {
  const i = (y * frame.width + x) * 4;
  return pixelSide(frame.data[i]!, frame.data[i + 1]!, frame.data[i + 2]!);
}

/**
 * Faixa vertical preferencial do gráfico. Os vídeos reais do Profit incluem
 * toolbar no topo, eixo/abas embaixo e às vezes a barra do Windows; pixels
 * verdes/vermelhos dessas áreas não podem virar candles falsos. Mantemos uma
 * margem pequena, sem depender da resolução.
 */
function graphVerticalBounds(height: number): { top: number; bottom: number } {
  const safeHeight = Math.max(1, Math.round(height));
  const top = Math.max(0, Math.floor(safeHeight * 0.13));
  const bottom = Math.min(safeHeight, Math.max(top + 1, Math.ceil(safeHeight * 0.86)));
  return { top, bottom };
}

/** Leitura puramente visual do frame. Não converte pixel em preço. */
export function inspectPixelFrame(frame: PixelFrame): Omit<FrameRead, "t" | "activity"> {
  const graphLeft = Math.floor(frame.width * 0.02);
  const graphRight = Math.floor(frame.width * 0.88);
  const { top: graphTop, bottom: graphBottom } = graphVerticalBounds(frame.height);
  const columnMass = new Uint16Array(frame.width);
  let bullPixels = 0;
  let bearPixels = 0;

  for (let x = graphLeft; x < graphRight; x++) {
    for (let y = graphTop; y < graphBottom; y++) {
      const side = coloredAt(frame, x, y);
      if (!side) continue;
      columnMass[x]++;
      if (side === "bull") bullPixels++;
      else bearPixels++;
    }
  }

  let rightmost = -1;
  for (let x = graphRight - 1; x >= graphLeft; x--) {
    if (columnMass[x]! >= 2) {
      rightmost = x;
      break;
    }
  }

  // Contagem de clusters de colunas coloridas ≈ candles visíveis no frame.
  let candleColumns = 0;
  let previousActive = -10;
  for (let x = graphLeft; x < graphRight; x++) {
    if (columnMass[x]! < 1) continue;
    if (x - previousActive > 2) candleColumns++;
    previousActive = x;
  }

  let closeY: number | null = null;
  let localMass = 0;
  if (rightmost >= 0) {
    let from = rightmost;
    let emptyColumns = 0;
    for (let x = rightmost - 1; x >= graphLeft; x--) {
      if (columnMass[x]! > 0) {
        from = x;
        emptyColumns = 0;
      } else if (++emptyColumns > 2) {
        break;
      }
    }
    const rowMass = new Uint16Array(frame.height);
    let localBull = 0;
    let localBear = 0;
    let activeColumns = 0;
    for (let x = from; x <= rightmost; x++) {
      if (columnMass[x]! > 0) activeColumns++;
      for (let y = graphTop; y < graphBottom; y++) {
        const side = coloredAt(frame, x, y);
        if (!side) continue;
        rowMass[y]++;
        localMass++;
        if (side === "bull") localBull++;
        else localBear++;
      }
    }
    const bodyThreshold = Math.max(2, Math.ceil(activeColumns * 0.45));
    const bodyRows: number[] = [];
    for (let y = graphTop; y < graphBottom; y++) {
      if (rowMass[y]! >= bodyThreshold) bodyRows.push(y);
    }
    if (bodyRows.length) {
      closeY = localBull >= localBear ? bodyRows[0]! : bodyRows[bodyRows.length - 1]!;
    }
  }

  const totalGraphPixels = Math.max(1, (graphRight - graphLeft) * (graphBottom - graphTop));
  const colored = bullPixels + bearPixels;
  const colorDensity = colored / totalGraphPixels;
  const quality = Math.max(
    0,
    Math.min(
      1,
      (localMass / Math.max(12, frame.height * 0.08)) * 0.7 + Math.min(1, colorDensity * 80) * 0.3,
    ),
  );

  return {
    priceY: closeY,
    bullMass: bullPixels / totalGraphPixels,
    bearMass: bearPixels / totalGraphPixels,
    quality,
    width: frame.width,
    height: frame.height,
    candleColumns,
  };
}

interface XCluster {
  from: number;
  to: number;
}

/**
 * Extrai candles visíveis de um frame de vídeo usando somente pixels verdes e
 * vermelhos. O candle mais à direita é excluído por estar provavelmente em
 * formação. Nenhum candle futuro é criado e volume permanece zero.
 */
export function extractCandlesFromPixels(
  frame: PixelFrame,
  calibration: Calibration,
  lastClosedAt: number,
): ExtractedCandle[] {
  // Gráfico visível = candles extraídos. Sem escala calibrada a geometria é
  // lida em unidades relativas (modo geométrico); só o preço exato espera.
  if (!isReadable(calibration)) return [];
  const graphLeft = Math.floor(frame.width * 0.02);
  const graphRight = Math.floor(frame.width * 0.88);
  const { top: graphTop, bottom: graphBottom } = graphVerticalBounds(frame.height);
  const active: number[] = [];

  for (let x = graphLeft; x < graphRight; x++) {
    let count = 0;
    for (let y = graphTop; y < graphBottom; y++) if (coloredAt(frame, x, y)) count++;
    // Em histórico comprimido do Profit, candles FECHADOS podem ter corpo de
    // apenas 1 px. O candle em formação já é removido POSICIONALMENTE abaixo,
    // então não descartamos dados reais só por largura/densidade mínima.
    if (count >= 1) active.push(x);
  }

  const clusters: XCluster[] = [];
  for (const x of active) {
    const current = clusters[clusters.length - 1];
    if (!current || x - current.to > 2) clusters.push({ from: x, to: x });
    else current.to = x;
  }

  // Ordem importa: primeiro remove o cluster mais à direita (candle em
  // formação, POSICIONAL), depois filtra por largura. Na ordem inversa, um
  // candle em formação estreito (<2px) era removido pelo filtro e o slice
  // descartava o último candle FECHADO — perdendo dado real e deslocando
  // todos os timestamps em 1 minuto.
  const usableClusters = clusters.slice(0, -1);
  const out: ExtractedCandle[] = [];

  for (const cluster of usableClusters) {
    const width = cluster.to - cluster.from + 1;
    const rowMass = new Uint16Array(frame.height);
    let bull = 0;
    let bear = 0;
    let highY = frame.height;
    let lowY = -1;

    for (let x = cluster.from; x <= cluster.to; x++) {
      for (let y = graphTop; y < graphBottom; y++) {
        const side = coloredAt(frame, x, y);
        if (!side) continue;
        rowMass[y]++;
        highY = Math.min(highY, y);
        lowY = Math.max(lowY, y);
        if (side === "bull") bull++;
        else bear++;
      }
    }
    // lowY === highY é um candle FECHADO de 1 linha de pixels (histórico
    // comprimido): descartá-lo deslocaria o timestamp de todos os anteriores.
    if (lowY < highY) continue;

    const bodyRows: number[] = [];
    const bodyThreshold = Math.max(1, Math.ceil(width * 0.45));
    for (let y = highY; y <= lowY; y++) if (rowMass[y]! >= bodyThreshold) bodyRows.push(y);
    if (bodyRows.length === 0) continue;

    const bodyTop = bodyRows[0]!;
    const bodyBottom = bodyRows[bodyRows.length - 1]!;
    const high = priceAt(calibration, highY);
    const low = priceAt(calibration, lowY);
    const top = priceAt(calibration, bodyTop);
    const bottom = priceAt(calibration, bodyBottom);
    if ([high, low, top, bottom].some((value) => value === null)) continue;

    const bullish = bull >= bear;
    const open = bullish ? bottom! : top!;
    const close = bullish ? top! : bottom!;
    const candleHigh = Math.max(high!, low!, open, close);
    const candleLow = Math.min(high!, low!, open, close);
    const quality = Math.round(
      Math.max(0, Math.min(100, 45 + Math.min(30, width * 3) + Math.min(25, bodyRows.length * 2))),
    );
    out.push({ t: 0, o: open, h: candleHigh, l: candleLow, c: close, v: 0, quality });
  }

  const minute = 60_000;
  const firstAt = lastClosedAt - Math.max(0, out.length - 1) * minute;
  return out.map((candle, index) => ({ ...candle, t: firstAt + index * minute }));
}

function drawSource(source: CanvasImageSource): { frame: PixelFrame; canvas: HTMLCanvasElement } {
  const sourceWidth =
    source instanceof HTMLVideoElement
      ? source.videoWidth
      : source instanceof HTMLImageElement
        ? source.naturalWidth
        : "width" in source
          ? Number(source.width)
          : 0;
  const sourceHeight =
    source instanceof HTMLVideoElement
      ? source.videoHeight
      : source instanceof HTMLImageElement
        ? source.naturalHeight
        : "height" in source
          ? Number(source.height)
          : 0;
  if (!sourceWidth || !sourceHeight) throw new Error("Fonte visual ainda sem dimensões válidas.");
  const width = Math.min(1280, sourceWidth);
  const height = Math.max(1, Math.round((sourceHeight / sourceWidth) * width));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas 2D indisponível.");
  context.drawImage(source, 0, 0, width, height);
  const image = context.getImageData(0, 0, width, height);
  return { frame: { data: image.data, width, height }, canvas };
}

export interface CropRect {
  /** Frações 0..1 da largura/altura do frame — independentes de resolução/DPI. */
  x: number;
  y: number;
  w: number;
  h: number;
}

function drawSourceCropped(
  source: CanvasImageSource,
  crop: CropRect | null,
): { frame: PixelFrame; canvas: HTMLCanvasElement } {
  if (!crop) return drawSource(source);
  const full = drawSource(source);
  const sx = Math.max(0, Math.floor(crop.x * full.canvas.width));
  const sy = Math.max(0, Math.floor(crop.y * full.canvas.height));
  const sw = Math.max(8, Math.floor(crop.w * full.canvas.width));
  const sh = Math.max(8, Math.floor(crop.h * full.canvas.height));
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas 2D indisponível.");
  context.drawImage(full.canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  const image = context.getImageData(0, 0, sw, sh);
  return { frame: { data: image.data, width: sw, height: sh }, canvas };
}

// O "capture mode" antigo (captureReplayFrame/capturePriceScaleImageCropped)
// foi removido junto com o replay por vídeo: T4 contínuo é o único caminho.

/**
 * Banda do eixo de tempo observada no Profit. O eixo fica acima das abas/status
 * inferiores; usar apenas os últimos 8% fazia a ROI cair justamente nas abas
 * (e, quando o usuário compartilhava a tela inteira, até na barra do Windows).
 * Mantemos a banda entre ~82% e 95% da altura e removemos a extrema direita,
 * onde normalmente ficam a escala de preço e relógios externos ao gráfico.
 */
export function timeAxisCropBounds(
  width: number,
  height: number,
): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const y = Math.min(safeHeight - 1, Math.max(0, Math.floor(safeHeight * 0.82)));
  const wantedBottom = Math.max(y + 1, Math.floor(safeHeight * 0.95));
  const bottom = Math.min(safeHeight, Math.max(wantedBottom, Math.min(safeHeight, y + 28)));
  return {
    x: 0,
    y,
    width: Math.max(1, Math.min(safeWidth, Math.floor(safeWidth * 0.92))),
    height: Math.max(1, bottom - y),
  };
}

/** Recorte da faixa inferior do gráfico (eixo de tempo/barra de informações) para OCR do pregão. */
export function captureTimeAxisImage(source: CanvasImageSource, crop: CropRect | null): string {
  const { canvas } = drawSourceCropped(source, crop);
  const band = timeAxisCropBounds(canvas.width, canvas.height);
  const output = document.createElement("canvas");
  output.width = band.width;
  output.height = band.height;
  const context = output.getContext("2d");
  if (!context) throw new Error("Canvas 2D indisponível.");
  context.drawImage(canvas, band.x, band.y, band.width, band.height, 0, 0, band.width, band.height);
  return output.toDataURL("image/jpeg", 0.85);
}

export function extractVisibleCandles(
  source: CanvasImageSource,
  calibration: Calibration,
  lastClosedAt: number,
): ExtractedCandle[] {
  return extractCandlesFromPixels(drawSource(source).frame, calibration, lastClosedAt);
}

/**
 * Recorta a escala de preços e desenha uma régua vertical explícita para o
 * Qwen-VL devolver a posição de cada rótulo sem depender de coordenada vaga.
 */
export function capturePriceScaleImage(
  source: CanvasImageSource,
  /** Início horizontal da ROI da escala (fração da largura). Autoajustável. */
  roiFromFraction = 0.76,
): {
  imageDataUrl: string;
  frameWidth: number;
  frameHeight: number;
} {
  const { canvas } = drawSource(source);
  const fraction = Math.min(0.94, Math.max(0.4, roiFromFraction));
  const fromX = Math.min(canvas.width - 8, Math.floor(canvas.width * fraction));
  const rulerWidth = 64;
  const cropWidth = canvas.width - fromX;
  const output = document.createElement("canvas");
  output.width = rulerWidth + cropWidth;
  output.height = canvas.height;
  const context = output.getContext("2d");
  if (!context) throw new Error("Canvas 2D indisponível para OCR da escala.");

  context.fillStyle = "#05080d";
  context.fillRect(0, 0, output.width, output.height);
  context.drawImage(
    canvas,
    fromX,
    0,
    cropWidth,
    canvas.height,
    rulerWidth,
    0,
    cropWidth,
    canvas.height,
  );
  context.font = "bold 12px monospace";
  context.textBaseline = "middle";
  for (let percent = 0; percent <= 100; percent += 5) {
    const y = Math.min(output.height - 1, (percent / 100) * output.height);
    context.strokeStyle = percent % 10 === 0 ? "#22d3ee" : "#155e75";
    context.beginPath();
    context.moveTo(rulerWidth - (percent % 10 === 0 ? 14 : 8), y);
    context.lineTo(rulerWidth, y);
    context.stroke();
    if (percent % 10 === 0) {
      context.fillStyle = "#67e8f9";
      context.fillText(String(percent), 2, y);
    }
  }
  return {
    imageDataUrl: output.toDataURL("image/jpeg", 0.9),
    frameWidth: canvas.width,
    frameHeight: canvas.height,
  };
}

/** Hash barato do frame (amostragem fixa) — detecta frame idêntico ao anterior. */
export function frameHash(data: Uint8ClampedArray): number {
  let hash = 2166136261;
  for (let i = 0; i < data.length; i += 512) {
    hash ^= data[i]!;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export class FrameProcessor {
  private previous: Uint8ClampedArray | null = null;
  private previousHash: number | null = null;

  process(video: HTMLVideoElement): FrameRead | null {
    if (!video.videoWidth || !video.videoHeight) return null;
    const { frame } = drawSource(video);
    // Frame idêntico ao anterior (spec V5 §8): não reprocessa nem gera amostra.
    const hash = frameHash(frame.data);
    if (this.previousHash !== null && hash === this.previousHash) return null;
    this.previousHash = hash;
    const current = inspectPixelFrame(frame);
    let activity = 0;
    if (this.previous && this.previous.length === frame.data.length) {
      let sum = 0;
      let samples = 0;
      for (let i = 0; i < frame.data.length; i += 128) {
        sum += Math.abs(frame.data[i]! - this.previous[i]!);
        samples++;
      }
      activity = Math.min(1, sum / Math.max(1, samples * 40));
    }
    this.previous = frame.data.slice();
    return { ...current, t: Date.now(), activity };
  }
}
