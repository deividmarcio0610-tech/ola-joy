import { createFileRoute } from "@tanstack/react-router";
import { callVpsAI } from "@/lib/vps-ai/client.server";
import { requireUser, jsonError } from "@/lib/vps-ai/auth.server";

const MAX_BODY_BYTES = 12 * 1024 * 1024; // 12 MB

function upstreamFailure(res: {
  status: number;
  errorMessage?: string;
  errorCode?: string;
}): Response {
  return Response.json(
    {
      ok: false,
      error: res.errorMessage ?? "IA da VPS indisponível no momento.",
      code: res.errorCode ?? `HTTP_${res.status}`,
      upstreamStatus: res.status,
      retriable: res.status === 502 || res.status === 503 || res.status === 504,
    },
    {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export const Route = createFileRoute("/api/vps/analisar")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireUser(request);
        if (!auth.ok) return jsonError(auth.status, auth.message);

        let payload: Record<string, unknown>;
        try {
          const raw = await request.text();
          if (raw.length > MAX_BODY_BYTES) {
            return jsonError(413, "Payload muito grande.", "PAYLOAD_TOO_LARGE");
          }
          payload = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        } catch {
          return jsonError(400, "JSON inválido.", "BAD_JSON");
        }

        // Se veio imageBase64, valida MIME
        const b64 = payload.imageBase64;
        if (typeof b64 === "string" && b64.startsWith("data:")) {
          const m = /^data:(image\/(?:jpeg|png|webp));base64,/.exec(b64);
          if (!m) return jsonError(415, "MIME de imagem inválido.", "UNSUPPORTED_MEDIA");
        }

        payload.userId = auth.userId;

        const res = await callVpsAI<Record<string, unknown>>("/api/analisar", {
          method: "POST",
          body: payload,
          timeoutMs: 110_000,
        });
        if (!res.ok) return upstreamFailure(res);
        return Response.json(res.data ?? {});
      },
    },
  },
});
