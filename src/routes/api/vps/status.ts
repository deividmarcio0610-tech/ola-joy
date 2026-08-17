import { createFileRoute } from "@tanstack/react-router";
import { callVpsAI } from "@/lib/vps-ai/client.server";

// Health check público (mesmo assim exige sessão para não expor status a estranhos).
export const Route = createFileRoute("/api/vps/status")({
  server: {
    handlers: {
      GET: async () => {
        const res = await callVpsAI<Record<string, unknown>>("/api/status", {
          method: "GET",
          timeoutMs: 10_000,
        });
        if (!res.ok) {
          return Response.json(
            {
              online: false,
              ollama: { online: false },
              imageGenerator: { online: false },
              error: res.errorMessage,
              code: res.errorCode,
            },
            { status: 200 },
          );
        }
        const raw = (res.data ?? {}) as Record<string, unknown>;
        const ollamaOnline = Boolean(
          (raw as { ollama?: boolean | { online?: boolean } }).ollama === true ||
          (typeof raw.ollama === "object" && (raw.ollama as { online?: boolean })?.online),
        );
        const gen = (raw as { imageGenerator?: { online?: boolean; mode?: string } })
          .imageGenerator;
        return Response.json({
          online: Boolean((raw as { online?: boolean }).online ?? true),
          ollama: {
            online: ollamaOnline,
            model:
              (raw as { modelo?: string }).modelo ??
              (typeof raw.ollama === "object"
                ? (raw.ollama as { model?: string }).model
                : undefined),
          },
          imageGenerator: {
            online: Boolean(gen?.online ?? false),
            mode: gen?.mode ?? "cpu",
          },
          tempoResposta: (raw as { tempoResposta?: number }).tempoResposta,
          raw,
        });
      },
    },
  },
});
