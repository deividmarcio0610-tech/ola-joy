import { createFileRoute } from "@tanstack/react-router";
import { callVpsAI } from "@/lib/vps-ai/client.server";
import { requireUser, jsonError } from "@/lib/vps-ai/auth.server";

export const Route = createFileRoute("/api/vps/video")({
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
        const res = await callVpsAI<Record<string, unknown>>("/api/video", {
          method: "POST",
          body: payload,
          timeoutMs: 110_000,
        });
        if (!res.ok) return jsonError(res.status, res.errorMessage ?? "Falha", res.errorCode);
        return Response.json(res.data ?? {});
      },
    },
  },
});
