// Client-side image fingerprinting: SHA-256 + perceptual dHash (64 bits).

export async function sha256OfFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// dHash: reduce to 9x8 grayscale, compare adjacent pixels → 64 bits.
export async function dHashOfFile(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Falha ao ler imagem"));
      el.src = url;
    });
    const w = 9,
      h = 8;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    const gray: number[] = [];
    for (let i = 0; i < data.length; i += 4) {
      gray.push((data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0);
    }
    let bits = "";
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w - 1; x++) {
        bits += gray[y * w + x] > gray[y * w + x + 1] ? "1" : "0";
      }
    }
    // 64 bits → hex 16 chars
    let hex = "";
    for (let i = 0; i < bits.length; i += 4) {
      hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
    }
    return hex;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function hammingHex(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}
