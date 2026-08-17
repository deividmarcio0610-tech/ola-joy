import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, Loader2 } from "lucide-react";
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
import { callVpsRoute } from "@/lib/vps-ai/call";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/chat/")({
  head: () => ({ meta: [{ title: "Chat IA · VisionGuard AI" }] }),
  component: ChatIndex,
});

type UIMsg = { id: string; role: "user" | "assistant" | "system"; content: string };

type DbMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
};

function ChatIndex() {
  const { data: conversationId, isLoading: loadingConv } = useQuery({
    queryKey: ["chat_single_conversation"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      const { data: existing } = await supabase
        .from("chat_conversations")
        .select("id")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
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
        .select("id, role, content, created_at")
        .eq("conversation_id", conversationId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data as DbMessage[]).map(
        (r) => ({ id: r.id, role: r.role, content: r.content }) as UIMsg,
      );
    },
  });

  if (loadingConv || loadingMessages || !conversationId) {
    return (
      <ModuleShell icon={MessageSquare} title="Chat IA" subtitle="Carregando…" status="operacional">
        <div className="flex items-center justify-center gap-2 p-10 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      </ModuleShell>
    );
  }

  return <ChatBody conversationId={conversationId} initialMessages={initialMessages ?? []} />;
}

function ChatBody({
  conversationId,
  initialMessages,
}: {
  conversationId: string;
  initialMessages: UIMsg[];
}) {
  const [messages, setMessages] = useState<UIMsg[]>(initialMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const idRef = useRef(0);
  const nextId = () => `local-${++idRef.current}`;

  async function handleSubmit() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const userMsg: UIMsg = { id: nextId(), role: "user", content: text };
    const nextMsgs = [...messages, userMsg];
    setMessages(nextMsgs);
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("chat_messages").insert({
          conversation_id: conversationId,
          user_id: user.id,
          role: "user",
          content: text,
        });
      }
      const resp = await callVpsRoute<{
        text?: string;
        content?: string;
        message?: string;
        choices?: Array<{ message: { content?: string } }>;
      }>("/api/vps/analisar", {
        mode: "chat",
        messages: nextMsgs.map((m) => ({ role: m.role, content: m.content })),
      });
      const answer =
        resp.text ?? resp.content ?? resp.choices?.[0]?.message?.content ?? resp.message ?? "";
      const asstMsg: UIMsg = { id: nextId(), role: "assistant", content: answer };
      setMessages((prev) => [...prev, asstMsg]);
      if (user && answer) {
        await supabase.from("chat_messages").insert({
          conversation_id: conversationId,
          user_id: user.id,
          role: "assistant",
          content: answer,
        });
        await supabase
          .from("chat_conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", conversationId);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro no chat");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    /* keep hook stable */
  }, []);

  const canSend = useMemo(() => input.trim().length > 0 && !loading, [input, loading]);

  return (
    <ModuleShell icon={MessageSquare} title="Chat IA" subtitle="VPS · Ollama" status="operacional">
      <div className="flex flex-col h-[70vh]">
        <Conversation className="flex-1 overflow-y-auto">
          <ConversationContent>
            {messages.map((m) => (
              <Message key={m.id} from={m.role}>
                <MessageContent>
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </MessageContent>
              </Message>
            ))}
            {loading && <Shimmer>Pensando…</Shimmer>}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
        <PromptInput
          onSubmit={() => {
            void handleSubmit();
          }}
        >
          <PromptInputTextarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pergunte à IA..."
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSubmit();
              }
            }}
          />
          <PromptInputFooter>
            <PromptInputSubmit disabled={!canSend} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </ModuleShell>
  );
}
