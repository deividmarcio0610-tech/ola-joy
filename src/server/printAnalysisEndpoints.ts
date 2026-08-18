import { randomUUID } from "node:crypto";

import { MAX_IMAGE_BYTES, parseImageDataUrl } from "@/lib/printAnalysis/imageQuality";
import { analyzePrintWithVision, askAboutPrint, visionConfigured } from "@/services/ai/printVision";
import { aiConfig } from "@/services/ai/config";
import {
  deletePrintAnalysis,
  getPrintAnalysis,
  listPrintAnalyses,
  savePrintAnalysis,
  savePrintFeedback,
} from "./printAnalysisRepository";
import { authorizeRead, authorizeWrite } from "./tradingAuth";

/**
 * SUPERFÍCIE HTTP DA ANÁLISE POR PRINT.
 *
 * A imagem do operador e o histórico das análises são dados dele: leitura e
 * escrita passam pelo mesmo porteiro do resto do analisador (cookie HttpOnly
 * assinado + CSRF + mesma origem). Nenhuma credencial de IA chega ao
 * navegador — quem fala com o modelo multimodal é sempre o servidor.
 */

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

const WRITE_PATHS = new Set([
  "/api/print-analysis/analyze",
  "/api/print-analysis/ask",
  "/api/print-analysis/feedback",
]);

export async function handlePrintAnalysisRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (!path.startsWith("/api/print-analysis")) return null;

  try {
    if (request.method === "GET") {
      const denied = authorizeRead(request);
      if (denied) return json({ error: denied.error }, denied.status);
    } else if (request.method === "POST" || request.method === "DELETE") {
      const writePath = WRITE_PATHS.has(path) || path.startsWith("/api/print-analysis/history/");
      if (!writePath) return json({ error: "Endpoint não encontrado." }, 404);
      const denied = authorizeWrite(request);
      if (denied) return json({ error: denied.error }, denied.status);
    } else {
      return json({ error: "Método não suportado." }, 405);
    }

    // ── status: a UI precisa saber ANTES de deixar o operador esperar.
    if (path === "/api/print-analysis/status" && request.method === "GET") {
      const config = aiConfig();
      return json({
        available: visionConfigured(),
        model: config.visionModel || null,
        provider: config.provider,
        timeoutMs: config.timeoutMs,
        maxImageBytes: MAX_IMAGE_BYTES,
        reason: visionConfigured()
          ? null
          : config.baseUrl
            ? "Nenhum modelo multimodal configurado. Defina OLLAMA_VISION_MODEL com um modelo que tenha capacidade de visão."
            : "Servidor de IA não configurado. Defina OLLAMA_BASE_URL/AI_BASE_URL.",
      });
    }

    // ── análise
    if (path === "/api/print-analysis/analyze" && request.method === "POST") {
      const payload = (await request.json()) as {
        imageDataUrl?: string;
        width?: number;
        height?: number;
        persist?: boolean;
      };
      const dataUrl = payload.imageDataUrl ?? "";
      const parsed = parseImageDataUrl(dataUrl);
      if (!parsed) {
        return json({ error: "Imagem inválida. Envie PNG, JPG ou WebP." }, 400);
      }
      if (parsed.bytes > MAX_IMAGE_BYTES) {
        return json(
          {
            error: `Imagem de ${(parsed.bytes / 1024 / 1024).toFixed(1)} MB acima do limite de ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`,
          },
          413,
        );
      }

      const result = await analyzePrintWithVision(dataUrl);
      if (!result.analysis) {
        return json({ error: result.error, model: result.model }, 503);
      }

      const id = randomUUID();
      const createdAt = Date.now();
      let persisted = false;
      if (payload.persist !== false) {
        try {
          savePrintAnalysis({
            id,
            createdAt,
            analysis: result.analysis,
            model: result.model,
            repaired: result.repaired,
            corrections: result.corrections,
            imageDataUrl: dataUrl,
            imageWidth: Math.max(0, Math.round(payload.width ?? 0)),
            imageHeight: Math.max(0, Math.round(payload.height ?? 0)),
          });
          persisted = true;
        } catch (error) {
          // Falha ao gravar histórico NÃO invalida a análise já produzida.
          console.error("Falha ao salvar análise por print:", error);
        }
      }

      return json({
        id,
        createdAt,
        analysis: result.analysis,
        model: result.model,
        repaired: result.repaired,
        corrections: result.corrections,
        elapsedMs: result.elapsedMs,
        persisted,
      });
    }

    // ── chat contextual
    if (path === "/api/print-analysis/ask" && request.method === "POST") {
      const payload = (await request.json()) as {
        analysisId?: string;
        question?: string;
        history?: Array<{ role: "user" | "assistant"; content: string }>;
      };
      const question = (payload.question ?? "").trim();
      if (!question) return json({ error: "Pergunta vazia." }, 400);
      if (question.length > 800) return json({ error: "Pergunta longa demais." }, 400);

      const record = payload.analysisId ? getPrintAnalysis(payload.analysisId) : null;
      if (!record) {
        return json(
          { error: "Análise não encontrada. Reanalise o print antes de perguntar." },
          404,
        );
      }

      const answer = await askAboutPrint({
        dataUrl: record.imageDataUrl,
        analysis: record.analysis,
        question,
        history: Array.isArray(payload.history) ? payload.history.slice(-8) : [],
      });
      if (answer.error) return json({ error: answer.error }, 503);
      return json({ answer: answer.answer });
    }

    // ── feedback
    if (path === "/api/print-analysis/feedback" && request.method === "POST") {
      const payload = (await request.json()) as {
        analysisId?: string;
        correct?: boolean;
        reasons?: string[];
        comment?: string | null;
      };
      if (!payload.analysisId || typeof payload.correct !== "boolean") {
        return json({ error: "Informe analysisId e correct." }, 400);
      }
      const saved = savePrintFeedback({
        analysisId: payload.analysisId,
        correct: payload.correct,
        reasons: (payload.reasons ?? []).slice(0, 8).map((item) => String(item).slice(0, 80)),
        comment: payload.comment ? String(payload.comment).slice(0, 500) : null,
        createdAt: Date.now(),
      });
      if (!saved) return json({ error: "Análise não encontrada." }, 404);
      return json({ ok: true });
    }

    // ── histórico
    if (path === "/api/print-analysis/history" && request.method === "GET") {
      const limit = Number(url.searchParams.get("limit") ?? 50);
      return json({ analyses: listPrintAnalyses(Number.isFinite(limit) ? limit : 50) });
    }

    if (path.startsWith("/api/print-analysis/history/")) {
      const id = decodeURIComponent(path.slice("/api/print-analysis/history/".length));
      if (request.method === "GET") {
        const record = getPrintAnalysis(id);
        if (!record) return json({ error: "Análise não encontrada." }, 404);
        return json(record);
      }
      if (request.method === "DELETE") {
        return deletePrintAnalysis(id)
          ? json({ ok: true })
          : json({ error: "Análise não encontrada." }, 404);
      }
    }

    return json({ error: "Endpoint não encontrado." }, 404);
  } catch (error) {
    console.error("Erro na análise por print:", error);
    return json(
      { error: error instanceof Error ? error.message : "Falha inesperada na análise por print." },
      500,
    );
  }
}
