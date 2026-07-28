// Gera "Foto Corrigida" no chat do Kaizen usando OpenAI Images Edit (gpt-image-2).
// Requer OPENAI_API_KEY no backend. Nunca expõe a chave ao frontend.

import { createFileRoute } from "@tanstack/react-router";

type Correction = { standard?: string; description: string };

type Payload = {
  imageBase64: string; // sem prefixo data:
  mimeType: string;
  corrections: Correction[];
  instructions?: string; // últimas instruções do usuário no chat
  sceneDescription?: string;
};

const ALLOWED_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const MAX_BYTES = 15 * 1024 * 1024;

function buildPrompt(p: Payload): string {
  const list = p.corrections
    .filter((c) => c.description?.trim())
    .map((c) => `- ${c.standard ? `[${c.standard}] ` : ""}${c.description.trim()}`)
    .join("\n");
  return [
    "Edite a fotografia original e produza uma versão fotorrealista do MESMO ambiente após as correções de segurança listadas.",
    "",
    "CORREÇÕES OBRIGATÓRIAS:",
    list || "- Aplicar boas práticas gerais de segurança do trabalho.",
    "",
    p.instructions ? `INSTRUÇÕES DO USUÁRIO:\n${p.instructions}` : "",
    "",
    "PRESERVAR: mesmo ambiente, enquadramento, ângulo, paredes, piso, portas, máquinas, equipamentos fixos, iluminação geral, proporções e identidade visual.",
    "ALTERAR APENAS: os elementos diretamente relacionados às correções (riscos, desorganização, obstruções, EPIs, sinalização, proteções).",
    "PROIBIDO: trocar de sala, transformar em desenho/ilustração, trocar máquinas, inventar estruturas, adicionar pessoas, adicionar textos legíveis, mudar iluminação drasticamente.",
    "",
    "Devolva SOMENTE a imagem editada fotorrealista.",
    p.sceneDescription ? `\nCENA:\n${p.sceneDescription}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

export const Route = createFileRoute("/api/iris/generate-corrected")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization");
        if (!auth?.startsWith("Bearer ")) {
          return Response.json({ error: "Não autenticado." }, { status: 401 });
        }
        const token = auth.slice(7);

        let body: Payload;
        try {
          body = (await request.json()) as Payload;
        } catch {
          return Response.json({ error: "Corpo JSON inválido." }, { status: 400 });
        }

        if (!body.imageBase64 || !body.mimeType) {
          return Response.json({ error: "Envie uma fotografia antes de gerar a correção." }, { status: 400 });
        }
        const mime = body.mimeType.toLowerCase();
        if (!ALLOWED_MIME.has(mime)) {
          return Response.json({ error: "Formato inválido. Use JPG, PNG ou WEBP." }, { status: 400 });
        }
        const approxBytes = Math.floor((body.imageBase64.length * 3) / 4);
        if (approxBytes > MAX_BYTES) {
          return Response.json({ error: "Imagem excede 15 MB." }, { status: 413 });
        }
        const corrections = (body.corrections ?? []).filter((c) => c.description?.trim());
        if (corrections.length === 0 && !body.instructions?.trim()) {
          return Response.json({ error: "Descreva ou selecione pelo menos uma correção." }, { status: 400 });
        }

        // Valida sessão Supabase
        const { createClient } = await import("@supabase/supabase-js");
        const url = process.env.SUPABASE_URL;
        const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!url || !publishableKey) {
          return Response.json({ error: "Backend indisponível." }, { status: 500 });
        }
        const userClient = createClient(url, publishableKey, {
          auth: { persistSession: false },
          global: { headers: { Authorization: `Bearer ${token}` } },
        });
        const { data: userData, error: userErr } = await userClient.auth.getUser();
        if (userErr || !userData?.user) {
          return Response.json({ error: "Sessão inválida." }, { status: 401 });
        }

        const key = process.env.OPENAI_API_KEY;
        if (!key) {
          return Response.json(
            { error: "O serviço de geração de imagens ainda não foi configurado." },
            { status: 503 },
          );
        }

        const prompt = buildPrompt({ ...body, corrections });
        const form = new FormData();
        const bytes = base64ToBytes(body.imageBase64);
        form.append("image", new Blob([bytes.buffer as ArrayBuffer], { type: mime }), "input.png");
        form.append("prompt", prompt);
        form.append("model", "gpt-image-2");
        form.append("size", "1024x1024");
        form.append("n", "1");

        const t0 = Date.now();
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 110_000);
          const res = await fetch("https://api.openai.com/v1/images/edits", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}` },
            body: form,
            signal: controller.signal,
          });
          clearTimeout(timer);
          const text = await res.text();

          if (!res.ok) {
            let msg = "Não foi possível gerar esta versão.";
            if (res.status === 401) msg = "Serviço de imagens não autenticado. Verifique a chave.";
            else if (res.status === 402 || /billing|quota|insufficient/i.test(text))
              msg = "O saldo do serviço de geração foi atingido.";
            else if (res.status === 429) msg = "O serviço está com muitas solicitações. Tente novamente em instantes.";
            return Response.json(
              {
                success: false,
                error: msg,
                httpStatus: res.status,
                detail: text.slice(0, 500),
                durationMs: Date.now() - t0,
              },
              { status: 200 },
            );
          }

          const json = JSON.parse(text) as { data?: Array<{ b64_json?: string; url?: string }> };
          const item = json.data?.[0];
          let imageBase64 = item?.b64_json;
          let imageMimeType = "image/png";
          if (!imageBase64 && item?.url) {
            const dl = await fetch(item.url);
            const buf = new Uint8Array(await dl.arrayBuffer());
            imageBase64 = bytesToBase64(buf);
            imageMimeType = dl.headers.get("Content-Type") ?? "image/png";
          }
          if (!imageBase64) {
            return Response.json(
              { success: false, error: "OpenAI não retornou imagem." },
              { status: 200 },
            );
          }

          return Response.json({
            success: true,
            imageBase64,
            imageMimeType,
            model: "gpt-image-2",
            durationMs: Date.now() - t0,
          });
        } catch (e) {
          const isAbort = e instanceof Error && e.name === "AbortError";
          return Response.json(
            {
              success: false,
              error: isAbort
                ? "A geração demorou além do limite."
                : "Não foi possível gerar esta versão. Sua fotografia e suas correções foram preservadas.",
              detail: e instanceof Error ? e.message : String(e),
              durationMs: Date.now() - t0,
            },
            { status: 200 },
          );
        }
      },
    },
  },
});
