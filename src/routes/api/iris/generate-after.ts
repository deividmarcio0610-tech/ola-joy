// Server route TanStack — autenticado.
// Recebe a foto ANTES + correções selecionadas e roda o roteador multiprovedor.

import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "crypto";

type Payload = {
  imageBase64: string; // base64 sem prefixo data:
  mimeType: string;
  sceneDescription?: string;
  detectedRisks?: string[];
  selectedCorrections?: string[];
  generationMode?: "preview" | "final";
};

const ALLOWED_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const MAX_BYTES = 15 * 1024 * 1024;

export const Route = createFileRoute("/api/iris/generate-after")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization");
        if (!auth?.startsWith("Bearer ")) {
          return Response.json({ error: "Não autenticado." }, { status: 401 });
        }
        const token = auth.slice("Bearer ".length);

        let body: Payload;
        try {
          body = (await request.json()) as Payload;
        } catch {
          return Response.json({ error: "Corpo JSON inválido." }, { status: 400 });
        }

        if (!body.imageBase64 || !body.mimeType) {
          return Response.json({ error: "Envie a foto Antes." }, { status: 400 });
        }
        const mime = body.mimeType.toLowerCase();
        if (!ALLOWED_MIME.has(mime)) {
          return Response.json(
            { error: "Formato inválido. Use JPG, PNG ou WEBP." },
            { status: 400 },
          );
        }
        // Verifica tamanho aproximado do base64 (~ 4/3 * bytes).
        const approxBytes = Math.floor((body.imageBase64.length * 3) / 4);
        if (approxBytes > MAX_BYTES) {
          return Response.json(
            { error: "Imagem excede 15 MB." },
            { status: 413 },
          );
        }

        const corrections = (body.selectedCorrections ?? []).filter((s) => s && s.trim());
        if (corrections.length === 0) {
          return Response.json(
            { error: "Selecione ao menos uma correção antes de gerar a Foto Depois." },
            { status: 400 },
          );
        }

        // Cliente admin (service role) — carrega dentro do handler.
        const { createClient } = await import("@supabase/supabase-js");
        const url = process.env.SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!url || !serviceKey || !publishableKey) {
          return Response.json(
            { error: "Backend indisponível: variáveis do Supabase ausentes." },
            { status: 500 },
          );
        }

        // Valida o usuário com a chave pública + bearer.
        const userClient = createClient(url, publishableKey, {
          auth: { persistSession: false },
          global: { headers: { Authorization: `Bearer ${token}` } },
        });
        const { data: userData, error: userErr } = await userClient.auth.getUser();
        if (userErr || !userData?.user) {
          return Response.json({ error: "Sessão inválida." }, { status: 401 });
        }
        const userId = userData.user.id;

        const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

        const imageHash = createHash("sha256").update(body.imageBase64).digest("hex");
        const correctionsHash = createHash("sha256")
          .update(JSON.stringify(corrections))
          .digest("hex");

        const { runImageRouter } = await import("@/lib/image-providers/router.server");
        try {
          const result = await runImageRouter(admin, {
            userId,
            originalImageBase64: body.imageBase64,
            mimeType: mime,
            sceneDescription: body.sceneDescription ?? "",
            detectedRisks: body.detectedRisks ?? [],
            selectedCorrections: corrections,
            generationMode: body.generationMode ?? "final",
            originalImageHash: imageHash,
            correctionsHash,
          });

          if (!result.success) {
            return Response.json(
              {
                success: false,
                error:
                  "Os serviços de geração de imagem estão temporariamente indisponíveis. Nenhum crédito foi descontado. Tente novamente mais tarde.",
                jobId: result.jobId,
                statusCode: 503,
                totalAttempts: result.totalAttempts,
                lastError: result.errorMessage,
                attempts: result.attempts ?? [],
                skipped: result.skipped ?? [],
              },
              { status: 200 },
            );
          }

          return Response.json({
            success: true,
            jobId: result.jobId,
            imageBase64: result.imageBase64,
            imageMimeType: result.imageMimeType,
            totalAttempts: result.totalAttempts,
            successfulProvider: result.successfulProvider,
            successfulModel: result.successfulModel,
          });
        } catch (e) {
          console.error("[generate-after] erro fatal", e);
          return Response.json(
            { error: e instanceof Error ? e.message : String(e) },
            { status: 500 },
          );
        }
      },
    },
  },
});
