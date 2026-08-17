import { createFileRoute } from "@tanstack/react-router";
import { callVpsAI } from "@/lib/vps-ai/client.server";
import { requireUser, jsonError } from "@/lib/vps-ai/auth.server";

export const Route = createFileRoute("/api/vps/modelos")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireUser(request);
        if (!auth.ok) return jsonError(auth.status, auth.message);
        const res = await callVpsAI<{ models?: string[] } | string[]>("/api/modelos", {
          method: "GET",
          timeoutMs: 15_000,
        });
        if (!res.ok) return jsonError(res.status, res.errorMessage ?? "Falha", res.errorCode);
        const models = Array.isArray(res.data)
          ? res.data
          : ((res.data as { models?: string[] })?.models ?? []);
        return Response.json({ models });
      },
    },
  },
});
