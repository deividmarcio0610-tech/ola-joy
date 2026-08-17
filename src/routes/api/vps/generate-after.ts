import { createFileRoute } from "@tanstack/react-router";
import { callVpsAI } from "@/lib/vps-ai/client.server";
import { requireUser, jsonError } from "@/lib/vps-ai/auth.server";

// Cria um job assíncrono na VPS. Retorna rápido; frontend faz polling em /jobs/:id.
export const Route = createFileRoute("/api/vps/generate-after")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireUser(request);
        if (!auth.ok) return jsonError(auth.status, auth.message);
        let payload: Record<string, unknown> = {};
        try {
          payload = (await request.json()) as Record<string, unknown>;
        } catch {
          return jsonError(400, "JSON inválido.");
        }
        payload.userId = auth.userId;

        const res = await callVpsAI<{
          success?: boolean;
          jobId?: string;
          status?: string;
        }>("/v1/generate-after", {
          method: "POST",
          body: payload,
          timeoutMs: 20_000,
        });
        if (!res.ok) {
          return Response.json(
            {
              ok: false,
              error: res.errorMessage ?? "IA da VPS indisponível no momento.",
              code: res.errorCode ?? `HTTP_${res.status}`,
              upstreamStatus: res.status,
              retriable: res.status === 502 || res.status === 503 || res.status === 504,
            },
            { status: 200, headers: { "Cache-Control": "no-store" } },
          );
        }
        const d = res.data ?? {};
        if (!d.jobId) {
          return Response.json(
            {
              ok: false,
              error: "Resposta sem jobId da API.",
              code: "BAD_UPSTREAM",
              upstreamStatus: 502,
              retriable: true,
            },
            { status: 200, headers: { "Cache-Control": "no-store" } },
          );
        }
        return Response.json({
          success: true,
          jobId: d.jobId,
          status: d.status ?? "queued",
        });
      },
    },
  },
});
