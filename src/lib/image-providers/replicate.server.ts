// Replicate — usa Flux Kontext Pro (image edit preservando cena).
// Requer REPLICATE_API_TOKEN.

import {
  DEFAULT_PROVIDER_TIMEOUT_MS,
  classifyHttpError,
  fetchWithTimeout,
  type ImageGenerationRequest,
  type ImageProvider,
  type ImageProviderResult,
} from "./types";
import { buildEditPrompt } from "./prompt.server";

const DEFAULT_MODEL = "black-forest-labs/flux-kontext-pro";

export class ReplicateImageProvider implements ImageProvider {
  readonly name = "replicate";

  isConfigured(): boolean {
    return !!process.env.REPLICATE_API_TOKEN;
  }

  async generateAfterImage(req: ImageGenerationRequest): Promise<ImageProviderResult> {
    const t0 = Date.now();
    const model = req.modelHint || DEFAULT_MODEL;
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) {
      return {
        provider: this.name, model, success: false,
        errorType: "AUTHENTICATION_ERROR",
        errorMessage: "REPLICATE_API_TOKEN não configurado.",
        durationMs: Date.now() - t0,
      };
    }

    const prompt = buildEditPrompt(req);
    const dataUrl = `data:${req.mimeType};base64,${req.originalImageBase64}`;
    const [owner, name] = model.split("/");

    try {
      const create = await fetchWithTimeout(
        `https://api.replicate.com/v1/models/${owner}/${name}/predictions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Prefer: "wait=60",
          },
          body: JSON.stringify({
            input: { prompt, input_image: dataUrl, output_format: "png" },
          }),
        },
        DEFAULT_PROVIDER_TIMEOUT_MS,
      );

      const createText = await create.text();
      if (!create.ok) {
        return {
          provider: this.name, model, success: false,
          httpStatus: create.status,
          errorType: classifyHttpError(create.status, createText),
          errorMessage: createText.slice(0, 500),
          durationMs: Date.now() - t0,
        };
      }

      let pred = JSON.parse(createText) as {
        id?: string; status?: string; output?: unknown; error?: string;
      };

      // Polling se ainda não estiver concluído.
      const deadline = t0 + DEFAULT_PROVIDER_TIMEOUT_MS;
      while (pred.status && pred.status !== "succeeded" && pred.status !== "failed" && pred.status !== "canceled") {
        if (Date.now() > deadline) {
          return {
            provider: this.name, model, success: false,
            errorType: "TIMEOUT",
            errorMessage: "Replicate demorou além do limite.",
            durationMs: Date.now() - t0,
          };
        }
        await new Promise((r) => setTimeout(r, 2000));
        const poll = await fetch(`https://api.replicate.com/v1/predictions/${pred.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        pred = (await poll.json()) as typeof pred;
      }

      if (pred.status !== "succeeded") {
        return {
          provider: this.name, model, success: false,
          errorType: "UNKNOWN_ERROR",
          errorMessage: pred.error || `Replicate status=${pred.status}`,
          durationMs: Date.now() - t0,
        };
      }

      const outUrl = Array.isArray(pred.output)
        ? (pred.output[0] as string)
        : (pred.output as string);
      if (typeof outUrl !== "string" || !outUrl.startsWith("http")) {
        return {
          provider: this.name, model, success: false,
          errorType: "UNKNOWN_ERROR",
          errorMessage: "Replicate não retornou URL de imagem.",
          durationMs: Date.now() - t0,
        };
      }
      const dl = await fetch(outUrl);
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
