// Reduz e comprime imagens antes de enviar para a IA.
// Fotos de celular em base64 (5-15MB) estouram o limite de requisição da função
// e resultam em "Failed to send a request to the Edge Function".

const MAX_SIDE = 1600;
const QUALITY = 0.8;

export async function fileToCompressedDataURL(
  file: File,
  maxSide = MAX_SIDE,
  quality = QUALITY,
): Promise<string> {
  const raw = await readAsDataURL(file);
  try {
    return await compressDataURL(raw, maxSide, quality);
  } catch {
    return raw;
  }
}

export async function compressDataURL(
  dataUrl: string,
  maxSide = MAX_SIDE,
  quality = QUALITY,
): Promise<string> {
  const img = await loadImage(dataUrl);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return dataUrl;

  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const out = canvas.toDataURL("image/jpeg", quality);
  return out.length < dataUrl.length ? out : dataUrl;
}

function readAsDataURL(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error ?? new Error("Falha ao ler arquivo"));
    r.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Falha ao carregar imagem"));
    img.src = src;
  });
}
