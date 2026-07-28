// Adaptador Google Gemini / Imagen (image edit via inline_data).
// Usa GEMINI_API_KEY diretamente — não passa pelo gateway Lovable.

import {
  DEFAULT_PROVIDER_TIMEOUT_MS,
  classifyHttpError,
  fetchWithTimeout,
  type ImageGenerationRequest,
  type ImageProvider,
  type ImageProviderResult,
} from "./types";
import { buildEditPrompt } from "./prompt.server";

const DEFAULT_MODEL = "gemini-3-pro-image";

export class GeminiImageProvider implements ImageProvider {
  readonly name = "gemini";

  isConfigured(): boolean {
    return !!process.env.GEMINI_API_KEY;
  }

  async generateAfterImage(req: ImageGenerationRequest): Promise<ImageProviderResult> {
    const t0 = Date.now();
    const model = req.modelHint || DEFAULT_MODEL;
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      return {
        provider: this.name,
        model,
        success: false,
        errorType: "AUTHENTICATION_ERROR",
        errorMessage: "GEMINI_API_KEY não configurado.",
        durationMs: Date.now() - t0,
      };
    }

    const prompt = buildEditPrompt(req);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;

    const body = {
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: req.mimeType,
                data: req.originalImageBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ["IMAGE"],
      },
    };

    try {
      const res = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        DEFAULT_PROVIDER_TIMEOUT_MS,
      );

      const text = await res.text();
      if (!res.ok) {
        return {
          provider: this.name,
          model,
          success: false,
          httpStatus: res.status,
          errorType: classifyHttpError(res.status, text),
          errorMessage: safeSlice(text),
          retryAfterSeconds: parseRetryAfter(res.headers.get("Retry-After")),
          durationMs: Date.now() - t0,
        };
      }

      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        return {
          provider: this.name,
          model,
          success: false,
          errorType: "UNKNOWN_ERROR",
          errorMessage: "Resposta não-JSON do Gemini.",
          durationMs: Date.now() - t0,
        };
      }

      const parts = (json as { candidates?: Array<{ content?: { parts?: Array<Record<string, unknown>> } }> })
        ?.candidates?.[0]?.content?.parts ?? [];
      const imagePart = parts.find(
        (p) =>
          (p as { inline_data?: { data?: string } }).inline_data?.data ||
          (p as { inlineData?: { data?: string } }).inlineData?.data,
      );
      const inline =
        (imagePart as { inline_data?: { data?: string; mime_type?: string } })?.inline_data ??
        (imagePart as { inlineData?: { data?: string; mimeType?: string } })?.inlineData;
      const data = (inline as { data?: string } | undefined)?.data;
      const mime =
        (inline as { mime_type?: string; mimeType?: string } | undefined)?.mime_type ??
        (inline as { mimeType?: string } | undefined)?.mimeType ??
        "image/png";

      if (!data) {
        return {
          provider: this.name,
          model,
          success: false,
          errorType: "CONTENT_REJECTED",
          errorMessage: "Gemini não retornou imagem (bloqueio de política ou saída textual).",
          durationMs: Date.now() - t0,
        };
      }

      return {
        provider: this.name,
        model,
        success: true,
        imageBase64: data,
        imageMimeType: mime,
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

function parseRetryAfter(v: string | null): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
function safeSlice(s: string) {
  return s.length > 500 ? s.slice(0, 500) + "…" : s;
}
