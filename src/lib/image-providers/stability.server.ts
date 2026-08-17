// Stability AI — image edit via /v2beta/stable-image/edit/inpaint (usa a foto original).
// Requer STABILITY_API_KEY. Documentação: https://platform.stability.ai

import {
  DEFAULT_PROVIDER_TIMEOUT_MS,
  classifyHttpError,
  fetchWithTimeout,
  type ImageGenerationRequest,
  type ImageProvider,
  type ImageProviderResult,
} from "./types";
import { buildEditPrompt } from "./prompt.server";

const DEFAULT_MODEL = "stable-image-edit";

export class StabilityImageProvider implements ImageProvider {
  readonly name = "stability";

  isConfigured(): boolean {
    return !!process.env.STABILITY_API_KEY;
  }

  async generateAfterImage(req: ImageGenerationRequest): Promise<ImageProviderResult> {
    const t0 = Date.now();
    const model = req.modelHint || DEFAULT_MODEL;
    const key = process.env.STABILITY_API_KEY;
    if (!key) {
      return {
        provider: this.name,
        model,
        success: false,
        errorType: "AUTHENTICATION_ERROR",
        errorMessage: "STABILITY_API_KEY não configurado.",
        durationMs: Date.now() - t0,
      };
    }

    const prompt = buildEditPrompt(req);
    // Usa /v2beta/stable-image/edit/search-and-replace-like flow? A rota mais próxima de
    // "editar preservando cena" via image-to-image é /v2beta/stable-image/generate/sd3
    // com parâmetro `image` + strength baixa. Aqui usamos essa rota.
    const url = "https://api.stability.ai/v2beta/stable-image/generate/sd3";

    const form = new FormData();
    const bytes = base64ToBytes(req.originalImageBase64);
    form.append(
      "image",
      new Blob([bytes.buffer as ArrayBuffer], { type: req.mimeType }),
      "input.png",
    );
    form.append("prompt", prompt);
    form.append("mode", "image-to-image");
    form.append("strength", "0.55");
    form.append("output_format", "png");
    form.append("model", "sd3.5-large");

    try {
      const res = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            Accept: "image/*",
          },
          body: form,
        },
        DEFAULT_PROVIDER_TIMEOUT_MS,
      );

      if (!res.ok) {
        const errText = await res.text();
        return {
          provider: this.name,
          model,
          success: false,
          httpStatus: res.status,
          errorType: classifyHttpError(res.status, errText),
          errorMessage: errText.slice(0, 500),
          retryAfterSeconds: numOrUndef(res.headers.get("Retry-After")),
          durationMs: Date.now() - t0,
        };
      }

      const buf = new Uint8Array(await res.arrayBuffer());
      if (!buf.byteLength) {
        return {
          provider: this.name,
          model,
          success: false,
          errorType: "UNKNOWN_ERROR",
          errorMessage: "Stability retornou corpo vazio.",
          durationMs: Date.now() - t0,
        };
      }

      return {
        provider: this.name,
        model,
        success: true,
        imageBase64: bytesToBase64(buf),
        imageMimeType: res.headers.get("Content-Type") ?? "image/png",
        durationMs: Date.now() - t0,
      };
    } catch (e) {
      const isAbort = e instanceof Error && e.name === "AbortError";
      return {
        provider: this.name,
        model,
        success: false,
        errorType: isAbort ? "TIMEOUT" : "UNKNOWN_ERROR",
        errorMessage: e instanceof Error ? e.message : String(e),
        durationMs: Date.now() - t0,
      };
    }
  }
}

function numOrUndef(v: string | null) {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
