// fal.ai — usa nano-banana/edit para preservar a cena da foto original.
// Requer FAL_API_KEY. Docs: https://fal.ai/models

import {
  DEFAULT_PROVIDER_TIMEOUT_MS,
  classifyHttpError,
  fetchWithTimeout,
  type ImageGenerationRequest,
  type ImageProvider,
  type ImageProviderResult,
} from "./types";
import { buildEditPrompt } from "./prompt.server";

const DEFAULT_MODEL = "fal-ai/nano-banana/edit";

export class FalImageProvider implements ImageProvider {
  readonly name = "fal";

  isConfigured(): boolean {
    return !!process.env.FAL_API_KEY;
  }

  async generateAfterImage(req: ImageGenerationRequest): Promise<ImageProviderResult> {
    const t0 = Date.now();
    const model = req.modelHint || DEFAULT_MODEL;
    const key = process.env.FAL_API_KEY;
    if (!key) {
      return {
        provider: this.name, model, success: false,
        errorType: "AUTHENTICATION_ERROR",
        errorMessage: "FAL_API_KEY não configurado.",
        durationMs: Date.now() - t0,
      };
    }

    const prompt = buildEditPrompt(req);
    const dataUrl = `data:${req.mimeType};base64,${req.originalImageBase64}`;

    try {
      // fal usa fila; para simplicidade usamos endpoint sync (`/fal-ai/…`)
      const url = `https://fal.run/${model}`;
      const res = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: {
            Authorization: `Key ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prompt,
            image_urls: [dataUrl],
            num_images: 1,
          }),
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
          durationMs: Date.now() - t0,
        };
      }

      const json = JSON.parse(text) as { images?: Array<{ url?: string }>; image?: { url?: string } };
      const outUrl = json.images?.[0]?.url ?? json.image?.url;
      if (!outUrl) {
        return {
          provider: this.name, model, success: false,
          errorType: "UNKNOWN_ERROR",
          errorMessage: "fal.ai não retornou URL de imagem.",
          durationMs: Date.now() - t0,
        };
      }

      const dl = await fetch(outUrl);
      if (!dl.ok) {
        return {
          provider: this.name, model, success: false,
          errorType: "UNKNOWN_ERROR",
          errorMessage: `Falha ao baixar imagem do fal.ai (${dl.status}).`,
          durationMs: Date.now() - t0,
        };
      }
      const buf = new Uint8Array(await dl.arrayBuffer());
      return {
        provider: this.name, model, success: true,
        imageBase64: bytesToBase64(buf),
        imageMimeType: dl.headers.get("Content-Type") ?? "image/png",
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

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
