// Chat conversacional da ValeTech IA no Kaizen.
// Recebe histórico + correções + foto opcional, chama Gemini (GEMINI_API_KEY) e retorna
// resposta em português + ações estruturadas para atualizar a lista de correções.

import { createFileRoute } from "@tanstack/react-router";

type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

type Correction = { id?: string; standard?: string; description: string };

type Payload = {
  messages: ChatMessage[];
  corrections: Correction[];
  hasImage: boolean;
  sceneDescription?: string;
};

type ChatAction =
  | { type: "ADD_CORRECTION"; correction: Correction }
  | { type: "REMOVE_CORRECTION"; description: string }
  | { type: "GENERATE_NOW" };

const SYSTEM = `Você é a ValeTech IA, uma assistente conversacional especializada em segurança do trabalho.
- Responda SEMPRE em português, direto e objetivo.
- Ajude o usuário a refinar correções de segurança para gerar uma "Foto Corrigida" a partir de uma fotografia enviada.
- Nunca gere a imagem automaticamente. Apenas gere se o usuário pedir explicitamente ("gera", "gerar", "cria a foto").
- Se identificar uma nova correção, retorne uma ação ADD_CORRECTION.
- Se o usuário pedir para remover, retorne REMOVE_CORRECTION com a descrição.
- Se o usuário pedir para gerar a imagem, retorne GENERATE_NOW.
- Formate a saída como JSON válido com esta estrutura:
{
  "assistantMessage": "string em português",
  "actions": [ { "type": "ADD_CORRECTION", "correction": { "standard": "NR-XX", "description": "..." } } ]
}
Não inclua nada além desse JSON.`;

export const Route = createFileRoute("/api/iris/kaizen-chat")({
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
        if (!Array.isArray(body.messages) || body.messages.length === 0) {
          return Response.json({ error: "Envie ao menos uma mensagem." }, { status: 400 });
        }

        // Valida sessão
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

        const geminiKey = process.env.GEMINI_API_KEY;
        if (!geminiKey) {
          return Response.json({ error: "GEMINI_API_KEY não configurado." }, { status: 503 });
        }

        const stateSummary = [
          body.hasImage ? "Uma fotografia já foi enviada." : "Nenhuma fotografia foi enviada ainda.",
          `Correções atuais (${body.corrections.length}):`,
          ...body.corrections.map(
            (c, i) => `${i + 1}. ${c.standard ? `[${c.standard}] ` : ""}${c.description}`,
          ),
        ].join("\n");

        const geminiContents = [
          { role: "user", parts: [{ text: `${SYSTEM}\n\nESTADO ATUAL:\n${stateSummary}` }] },
          { role: "model", parts: [{ text: "Entendido. Vou responder em JSON como pedido." }] },
          ...body.messages.slice(-12).map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
          })),
        ];

        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: geminiContents,
                generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
              }),
            },
          );
          const raw = await res.text();
          if (!res.ok) {
            return Response.json(
              { error: "Falha na IA.", detail: raw.slice(0, 400), httpStatus: res.status },
              { status: 200 },
            );
          }
          const json = JSON.parse(raw) as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
          };
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
          let parsed: { assistantMessage: string; actions?: ChatAction[] };
          try {
            parsed = JSON.parse(text);
          } catch {
            parsed = { assistantMessage: text || "Certo.", actions: [] };
          }
          return Response.json({
            success: true,
            assistantMessage: parsed.assistantMessage ?? "Certo.",
            actions: parsed.actions ?? [],
          });
        } catch (e) {
          return Response.json(
            { error: "Erro na IA.", detail: e instanceof Error ? e.message : String(e) },
            { status: 200 },
          );
        }
      },
    },
  },
});
