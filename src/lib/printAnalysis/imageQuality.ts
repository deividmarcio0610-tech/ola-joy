/**
 * QUALIDADE DO PRINT (requisito 24).
 *
 * Um gráfico borrado, cortado ou minúsculo não vira operação — vira
 * "PRINT INSUFICIENTE" com o motivo real. Analisar uma imagem ruim e devolver
 * entrada/stop é exatamente onde um modelo visual inventa número.
 *
 * A checagem roda no NAVEGADOR (tem canvas e os pixels reais) antes do envio,
 * e o backend revalida o que consegue sem canvas (tamanho e dimensões).
 */

export interface ImageQualityReport {
  ok: boolean;
  width: number;
  height: number;
  /** 0–100: nitidez estimada por variância do laplaciano normalizada. */
  sharpness: number;
  /** 0–100: quanto da imagem tem conteúdo (não é fundo chapado). */
  contentRatio: number;
  issues: string[];
  /** Mensagens exibidas ao operador. */
  reasons: string[];
}

export const MIN_IMAGE_WIDTH = 640;
export const MIN_IMAGE_HEIGHT = 360;
export const MIN_SHARPNESS = 8;
export const MIN_CONTENT_RATIO = 3;
/** Limite de payload: base64 cresce ~33% sobre o binário. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export const ACCEPTED_MIME = ["image/png", "image/jpeg", "image/webp"] as const;

/** Aceita apenas dataURL de imagem em formato conhecido. */
export function parseImageDataUrl(
  dataUrl: string,
): { mime: string; base64: string; bytes: number } | null {
  const match = /^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return null;
  const mime = match[1] === "image/jpg" ? "image/jpeg" : match[1]!;
  const base64 = match[2]!;
  // 4 caracteres base64 = 3 bytes; desconta o padding.
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return { mime, base64, bytes: (base64.length / 4) * 3 - padding };
}

/**
 * Análise de pixels. Recebe os dados já extraídos do canvas para poder ser
 * testada sem DOM.
 */
export function analyzePixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): { sharpness: number; contentRatio: number } {
  if (width < 3 || height < 3) return { sharpness: 0, contentRatio: 0 };

  const gray = new Float32Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
  }

  // Laplaciano 4-vizinhos: variância alta = bordas nítidas (candles legíveis).
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const index = y * width + x;
      const value =
        4 * gray[index]! -
        gray[index - 1]! -
        gray[index + 1]! -
        gray[index - width]! -
        gray[index + width]!;
      sum += value;
      sumSq += value * value;
      count++;
    }
  }
  const mean = sum / count;
  const variance = sumSq / count - mean * mean;
  // Normalização empírica: variância ~250 já é um gráfico bem nítido.
  const sharpness = Math.max(0, Math.min(100, (Math.sqrt(Math.max(0, variance)) / 16) * 100));

  // Conteúdo: proporção de pixels que destoam do tom dominante (fundo).
  const histogram = new Uint32Array(32);
  for (let p = 0; p < gray.length; p++) histogram[Math.min(31, gray[p]! >> 3)]!++;
  let dominant = 0;
  for (let bucket = 1; bucket < histogram.length; bucket++) {
    if (histogram[bucket]! > histogram[dominant]!) dominant = bucket;
  }
  const contentRatio = ((gray.length - histogram[dominant]!) / gray.length) * 100;

  return { sharpness, contentRatio };
}

export function judgeImageQuality(input: {
  width: number;
  height: number;
  sharpness: number;
  contentRatio: number;
  bytes?: number;
}): ImageQualityReport {
  const issues: string[] = [];
  const reasons: string[] = [];

  if (input.width < MIN_IMAGE_WIDTH || input.height < MIN_IMAGE_HEIGHT) {
    issues.push("RESOLUCAO_BAIXA");
    reasons.push(
      `Resolução ${input.width}×${input.height} abaixo do mínimo ${MIN_IMAGE_WIDTH}×${MIN_IMAGE_HEIGHT}: os candles ficam pequenos demais para análise confiável.`,
    );
  }
  if (input.sharpness < MIN_SHARPNESS) {
    issues.push("BORRADA");
    reasons.push("A imagem está borrada ou reescalada — as bordas dos candles não estão nítidas.");
  }
  if (input.contentRatio < MIN_CONTENT_RATIO) {
    issues.push("SEM_CONTEUDO");
    reasons.push("A imagem é quase toda fundo — não há gráfico suficiente para ler.");
  }
  if (input.bytes !== undefined && input.bytes > MAX_IMAGE_BYTES) {
    issues.push("GRANDE_DEMAIS");
    reasons.push(
      `Imagem de ${(input.bytes / 1024 / 1024).toFixed(1)} MB acima do limite de ${MAX_IMAGE_BYTES / 1024 / 1024} MB. Recorte o gráfico ou reduza a resolução.`,
    );
  }

  return {
    ok: issues.length === 0,
    width: input.width,
    height: input.height,
    sharpness: input.sharpness,
    contentRatio: input.contentRatio,
    issues,
    reasons,
  };
}

/** Checagem do navegador: desenha em canvas e mede os pixels reais. */
export async function inspectImageInBrowser(dataUrl: string): Promise<ImageQualityReport> {
  const parsed = parseImageDataUrl(dataUrl);
  if (!parsed) {
    return {
      ok: false,
      width: 0,
      height: 0,
      sharpness: 0,
      contentRatio: 0,
      issues: ["FORMATO_INVALIDO"],
      reasons: ["Arquivo inválido: aceite apenas PNG, JPG ou WebP."],
    };
  }

  const image = await loadImage(dataUrl);
  // Amostragem em no máximo 1024 px de largura: medir nitidez não exige o
  // frame inteiro e mantém a checagem instantânea em prints 4K.
  const scale = Math.min(1, 1024 / Math.max(1, image.width));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return judgeImageQuality({
      width: image.width,
      height: image.height,
      // Sem canvas não há como medir nitidez: não reprova por isso.
      sharpness: 100,
      contentRatio: 100,
      bytes: parsed.bytes,
    });
  }
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  const measured = analyzePixels(pixels.data, width, height);
  return judgeImageQuality({
    width: image.width,
    height: image.height,
    ...measured,
    bytes: parsed.bytes,
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Não foi possível decodificar a imagem."));
    image.src = dataUrl;
  });
}

/** Dimensões naturais da imagem — base do viewBox do overlay. */
export function imageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return loadImage(dataUrl).then((image) => ({
    width: image.naturalWidth,
    height: image.naturalHeight,
  }));
}
