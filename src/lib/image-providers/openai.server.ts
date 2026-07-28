// OpenAI Images — /v1/images/edits com gpt-image-2 usando a foto original.
// Requer OPENAI_API_KEY.

import {
  DEFAULT_PROVIDER_TIMEOUT_MS,
  classifyHttpError,
  fetchWithTimeout,
  type ImageGenerationRequest,
  type ImageProvider,
  type ImageProviderResult,
} from "./types";
import { buildEditPrompt } from "./prompt.server";

const DEFAULT_MODEL = "gpt-image-2";

export class OpenAIImageProvider implements ImageProvider {
  readonly name = "openai";

  isConfigured(): boolean {
    return !!process.env.OPENAI_API_KEY;
  }

  async generateAfterImage(req: ImageGenerationRequest): Promise<ImageProviderResult> {
    const t0 = Date.now();
    const model = req.modelHint || DEFAULT_MODEL;
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      return {
        provider: this.name, model, success: false,
        errorType: "AUTHENTICATION_ERROR",
        errorMessage: "OPENAI_API_KEY não configurado.",
        durationMs: Date.now() - t0,
      };
    }

    const prompt = buildEditPrompt(req);
    const form = new FormData();
    const bytes = base64ToBytes(req.originalImageBase64);
    form.append("image", new Blob([bytes.buffer as ArrayBuffer], { type: req.mimeType }), "input.png");
    form.append("prompt", prompt);
    form.append("model", model);
    form.append("size", "1024x1024");
    form.append("n", "1");

    try {
      const res = await fetchWithTimeout(
        "https://api.openai.com/v1/images/edits",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${key}` },
          body: form,
        },
        DEFAULT_PROVIDER_TIMEOUT_MS,
      );
      const text = await res.text();
      if (!res.ok) {
        return {
          provider: this.name, model, success: false,
          httpStatus: res.status,
          errorType: classifyHttpError(res.status, text),
          errorMessage: text.slice(0, 500),
          retryAfterSeconds: numOrUndef(res.headers.get("Retry-After")),
          durationMs: Date.now() - t0,
        };
      }
      const json = JSON.parse(text) as { data?: Array<{ b64_json?: string; url?: string }> };
      const item = json.data?.[0];
      if (item?.b64_json) {
        return {
          provider: this.name, model, success: true,
          imageBase64: item.b64_json,
          imageMimeType: "image/png",
          durationMs: Date.now() - t0,
        };
      }
      if (item?.url) {
        const dl = await fetch(item.url);
        const buf = new Uint8Array(await dl.arrayBuffer());
        return {
          provider: this.name, model, success: true,
          imageBase64: bytesToBase64(buf),
          imageMimeType: dl.headers.get("Content-Type") ?? "image/png",
          durationMs: Date.now() - t0,
        };
      }
      return {
        provider: this.name, model, success: false,
        errorType: "UNKNOWN_ERROR",
        errorMessage: "OpenAI não retornou imagem.",
        durationMs: Date.now() - t0,
      };
    } catch (e) {
      const isAbort = e instanceof Error && e.name === "AbortError";
      return {
        provider: this.name, model, success: false,
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
