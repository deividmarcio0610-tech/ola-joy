import { createFileRoute } from "@tanstack/react-router";
import { callVpsAI } from "@/lib/vps-ai/client.server";
import { requireUser, jsonError } from "@/lib/vps-ai/auth.server";

export const Route = createFileRoute("/api/vps/jobs/$jobId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireUser(request);
        if (!auth.ok) return jsonError(auth.status, auth.message);
        const res = await callVpsAI<Record<string, unknown>>(
          `/v1/jobs/${encodeURIComponent(params.jobId)}`,
          { method: "GET", timeoutMs: 15_000 },
        );
        if (!res.ok) return jsonError(res.status, res.errorMessage ?? "Falha", res.errorCode);
        return Response.json(res.data ?? {});
      },
    },
  },
});
