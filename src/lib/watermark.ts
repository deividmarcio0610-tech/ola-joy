// Adiciona um selo discreto "SIMULAÇÃO GERADA POR IA" a uma imagem (data URL / URL).
// Retorna um novo data URL PNG.
export async function watermarkSimulation(imageUrl: string): Promise<string> {
  const img = await loadImage(imageUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return imageUrl;
  ctx.drawImage(img, 0, 0);

  const label = "SIMULAÇÃO GERADA POR IA · VisionGuard AI";
  const padding = Math.round(canvas.width * 0.012);
  const fontSize = Math.max(12, Math.round(canvas.width * 0.022));
  ctx.font = `bold ${fontSize}px "Helvetica","Arial",sans-serif`;
  const metrics = ctx.measureText(label);
  const bw = metrics.width + padding * 2;
  const bh = fontSize + padding;
  const x = canvas.width - bw - padding;
  const y = canvas.height - bh - padding;

  // Fundo semitransparente preto
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  roundRect(ctx, x, y, bw, bh, Math.min(10, bh / 4));
  ctx.fill();

  // Borda neon discreta
  ctx.strokeStyle = "rgba(0, 255, 128, 0.55)";
  ctx.lineWidth = Math.max(1, Math.round(fontSize / 14));
  roundRect(ctx, x, y, bw, bh, Math.min(10, bh / 4));
  ctx.stroke();

  // Texto verde neon
  ctx.fillStyle = "#00ff88";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + padding, y + bh / 2);

  return canvas.toDataURL("image/png");
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Falha ao carregar imagem"));
    img.src = src;
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
