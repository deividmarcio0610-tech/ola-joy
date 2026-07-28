import { createFileRoute } from "@tanstack/react-router";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  convertToModelMessages,
  streamText,
  type UIMessage,
} from "ai";
import { createClient } from "@supabase/supabase-js";

type ChatRequestBody = {
  messages?: unknown;
  conversationId?: string;
};

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return new Response("Unauthorized", { status: 401 });
        }
        const token = authHeader.slice(7);

        const supabaseUrl = process.env.SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY!;
        const authClient = createClient(supabaseUrl, supabaseKey, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${token}` } },
        });
        const { data: userData, error: userErr } = await authClient.auth.getUser(token);
        if (userErr || !userData.user) {
          return new Response("Unauthorized", { status: 401 });
        }
        const userId = userData.user.id;

        const { messages, conversationId } =
          (await request.json()) as ChatRequestBody;
        if (!Array.isArray(messages) || !conversationId) {
          return new Response("Missing messages or conversationId", {
            status: 400,
          });
        }

        // Verify conversation ownership
        const { data: conv } = await authClient
          .from("chat_conversations")
          .select("id, user_id")
          .eq("id", conversationId)
          .maybeSingle();
        if (!conv || conv.user_id !== userId) {
          return new Response("Forbidden", { status: 403 });
        }

        const geminiKey = process.env.GEMINI_API_KEY;
        if (!geminiKey) {
          return new Response("Missing GEMINI_API_KEY", { status: 500 });
        }

        const uiMessages = messages as UIMessage[];

        // Persist the latest user message
        const lastUser = [...uiMessages].reverse().find((m) => m.role === "user");
        if (lastUser) {
          const text = lastUser.parts
            .map((p) => (p.type === "text" ? p.text : ""))
            .join("");
          await authClient.from("chat_messages").insert({
            conversation_id: conversationId,
            user_id: userId,
            role: "user",
            content: text,
            parts: lastUser.parts as unknown as object[],
          });
          // Auto-title
          const { data: convFull } = await authClient
            .from("chat_conversations")
            .select("title")
            .eq("id", conversationId)
            .maybeSingle();
          if (convFull?.title === "Nova conversa" && text.trim()) {
            await authClient
              .from("chat_conversations")
              .update({ title: text.slice(0, 60) })
              .eq("id", conversationId);
          }
        }

        const gateway = createOpenAICompatible({
          name: "gemini",
          baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
          apiKey: geminiKey,
        });
        const model = gateway.chatModel(
          process.env.GEMINI_CHAT_MODEL ?? "gemini-2.5-flash",
        );

        const result = streamText({
          model,
          system:
            "Você é um assistente conversacional útil e direto. Responda em português quando o usuário escrever em português. Formate respostas em markdown quando adequado.",
          messages: await convertToModelMessages(uiMessages),
        });

        return result.toUIMessageStreamResponse({
          originalMessages: uiMessages,
          onFinish: async ({ messages: finalMessages }) => {
            const last = finalMessages[finalMessages.length - 1];
            if (!last || last.role !== "assistant") return;
            const text = last.parts
              .map((p) => (p.type === "text" ? p.text : ""))
              .join("");
            await authClient.from("chat_messages").insert({
              conversation_id: conversationId,
              user_id: userId,
              role: "assistant",
              content: text,
              parts: last.parts as unknown as object[],
            });
            await authClient
              .from("chat_conversations")
              .update({ updated_at: new Date().toISOString() })
              .eq("id", conversationId);
          },
        });
      },
    },
  },
});
