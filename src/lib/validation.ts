import { z } from "zod";

// Reusable validation schemas for forms across the app
export const safeText = (max = 500) => z.string().trim().max(max, `Máximo ${max} caracteres`);

export const requiredText = (max = 500) =>
  z.string().trim().min(1, "Campo obrigatório").max(max, `Máximo ${max} caracteres`);

export const emailSchema = z.string().trim().email("E-mail inválido").max(255);

export const equipAreaSchema = z.object({
  equipamento: safeText(120).optional(),
  area: safeText(120).optional(),
});

// File upload validation
export const MAX_IMAGE_MB = 10;
export const MAX_VIDEO_MB = 60;
export const ALLOWED_IMAGE = ["image/jpeg", "image/png", "image/webp", "image/heic"];
export const ALLOWED_VIDEO = ["video/mp4", "video/webm", "video/quicktime"];

export function validateFile(
  file: File,
  kind: "image" | "video",
): { ok: true } | { ok: false; error: string } {
  const allowed = kind === "image" ? ALLOWED_IMAGE : ALLOWED_VIDEO;
  const maxMb = kind === "image" ? MAX_IMAGE_MB : MAX_VIDEO_MB;
  if (!allowed.includes(file.type)) {
    return { ok: false, error: `Tipo não permitido (${file.type || "desconhecido"})` };
  }
  if (file.size > maxMb * 1024 * 1024) {
    return { ok: false, error: `Arquivo maior que ${maxMb}MB` };
  }
  return { ok: true };
}

// Sanitize plain text to strip HTML/script chars before sending to AI or DB
export function sanitizeText(input: string, max = 2000): string {
  return (
    input
      .replace(/<[^>]*>/g, "")
      // Os caracteres de controle são exatamente o alvo desta sanitização; remover a classe
      // quebraria a limpeza antes de gravar no banco ou enviar para a IA.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001F\u007F]/g, "")
      .trim()
      .slice(0, max)
  );
}
