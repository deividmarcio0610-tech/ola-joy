import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { MessageSquare, Loader2, Send } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { ModuleShell } from "@/components/module-shell";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { handleAiError } from "@/lib/ai-credits-error";

export const Route = createFileRoute("/_authenticated/chat/")({
  head: () => ({ meta: [{ title: "Chat IA · VALETECH" }] }),
  component: ChatIndex,
});

type DbMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  parts: unknown;
  created_at: string;
};

function dbToUIMessage(row: DbMessage): UIMessage {
  const parts =
    Array.isArray(row.parts) && row.parts.length
      ? (row.parts as UIMessage["parts"])
      : [{ type: "text" as const, text: row.content }];
  return { id: row.id, role: row.role, parts } as UIMessage;
}

function ChatIndex() {
  const { data: conversationId, isLoading: loadingConv } = useQuery({
    queryKey: ["chat_single_conversation"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const { data: existing, error: selErr } = await supabase
        .from("chat_conversations")
        .select("id")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (selErr) throw selErr;
      if (existing?.id) return existing.id as string;

      const { data: created, error: insErr } = await supabase
        .from("chat_conversations")
        .insert({ user_id: user.id, title: "Chat IA" })
        .select("id")
        .single();
      if (insErr) throw insErr;
      return created.id as string;
    },
  });

  const { data: initialMessages, isLoading: loadingMessages } = useQuery({
    queryKey: ["chat_messages", conversationId],
    enabled: !!conversationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("id, role, content, parts, created_at")
        .eq("conversation_id", conversationId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data as DbMessage[]).map(dbToUIMessage);
    },
  });

  if (loadingConv || loadingMessages || !conversationId) {
    return (
      <ModuleShell
        icon={MessageSquare}
        title="Chat IA"
        subtitle="Carregando…"
        status="operacional"
      >
        <div className="flex items-center justify-center gap-2 p-10 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando…
        </div>
      </ModuleShell>
    );
  }

  return (
    <ChatBody
      conversationId={conversationId}
      initialMessages={initialMessages ?? []}
    />
  );
}

function ChatBody({
  conversationId,
  initialMessages,
}: {
  conversationId: string;
  initialMessages: UIMessage[];
}) {
  const [input, setInput] = useState("");

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: async ({ messages, body }) => {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          const headers: Record<string, string> = {};
          if (token) headers.Authorization = `Bearer ${token}`;
          return {
            body: { ...(body ?? {}), messages, conversationId },
            headers,
          };
        },
      }),
    [conversationId],
  );

  const { messages, sendMessage, status, error } = useChat({
    id: conversationId,
    messages: initialMessages,
    transport,
    onError: (e) => handleAiError(e, "Erro no chat"),
  });

  const isLoading = status === "submitted" || status === "streaming";

  async function handleSubmit() {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    await sendMessage({ text });
  }

  useEffect(() => {
    // keep textarea focused after sends
  }, [status]);

  return (
    <ModuleShell
      icon={MessageSquare}
      title="Chat IA"
      subtitle="Assistente conversacional com IA"
      status="operacional"
    >
      <div className="flex h-[calc(100vh-14rem)] flex-col gap-3 rounded-xl border border-border bg-card/40 p-3">
        <Conversation className="flex-1 overflow-hidden">
          <ConversationContent>
            {messages.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                <MessageSquare className="h-10 w-10 text-neon/50" />
                <div>Envie a primeira mensagem para começar.</div>
              </div>
            )}
            {messages.map((m) => {
              const text = m.parts
                .map((p) => (p.type === "text" ? p.text : ""))
                .join("");
              if (m.role === "user") {
                return (
                  <Message key={m.id} from="user">
                    <MessageContent className="bg-primary text-primary-foreground">
                      <div className="whitespace-pre-wrap">{text}</div>
                    </MessageContent>
                  </Message>
                );
              }
              return (
                <Message key={m.id} from="assistant">
                  <MessageContent className="bg-transparent">
                    <div className="prose prose-sm prose-invert max-w-none">
                      <ReactMarkdown>{text || " "}</ReactMarkdown>
                    </div>
                  </MessageContent>
                </Message>
              );
            })}
            {status === "submitted" && (
              <Message from="assistant">
                <MessageContent className="bg-transparent">
                  <Shimmer>Pensando…</Shimmer>
                </MessageContent>
              </Message>
            )}
            {error && (
              <div className="text-xs text-red-400">
                {error.message ?? String(error)}
              </div>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <PromptInput
          onSubmit={async (m) => {
            const text = (m.text ?? input).trim();
            if (!text || isLoading) return;
            setInput("");
            await sendMessage({ text });
          }}
        >
          <PromptInputTextarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escreva sua mensagem…"
            autoFocus
          />
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit
              status={status}
              disabled={!input.trim() || isLoading}
              onClick={(e) => {
                e.preventDefault();
                handleSubmit();
              }}
            >
              <Send className="h-4 w-4" />
            </PromptInputSubmit>
          </PromptInputFooter>
        </PromptInput>
      </div>
    </ModuleShell>
  );
}
