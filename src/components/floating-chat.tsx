import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { chamarIrisChat } from "@/lib/iris-analyze";
import { handleAiError } from "@/lib/ai-credits-error";

type Msg = { role: "user" | "assistant"; content: string };

const SYSTEM_PROMPT = `Você é NOVA, a IA assistente do VisionGuard AI — plataforma corporativa para mineração, siderurgia, energia e indústria pesada.
Diferente da IA (especialista técnica de visão/segurança), a NOVA responde dúvidas sobre COMO USAR o aplicativo VisionGuard AI, seus módulos e recursos.

Módulos disponíveis:
- Dashboard: visão geral, KPIs e cards rápidos
- Vision: scanner 5S com câmera e análise em tempo real
- Câmera 360°: envio de vídeo até 1 minuto, análise completa por IA e plano de melhorias
- Histórico de Scans: relatórios de inspeções passadas, exportação em PDF
- N3: não conformidades e desvios operacionais
- Inspeção 5S: registros e checklist 5S
- Kaizen: ideias de melhoria contínua
- Meio Ambiente: eventos ambientais e ISO 14001 (somente visualização e análise por IA)
- Supervisão: registros de supervisão operacional
- Emergência: números fixos (193/192/190/199/CECOM/brigada), dados ambientais do local e primeiros socorros por IA
- CRM: fotos de OMs, análise de riscos por IA e oportunidades
- Auditoria, Relatórios, Controle de Ganhos, Usuários, Notificações, Configurações

Responda em português do Brasil, objetivo e curto. Cite o nome exato do menu quando indicar caminhos. Se a pergunta for técnica de campo (EPI, plano de ação, análise de imagem), sugira usar a IA no módulo correspondente.`;

export function FloatingChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, open]);

  async function send() {
    if (!input.trim() || loading) return;
    const next = [...messages, { role: "user" as const, content: input.trim() }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const data = await chamarIrisChat({
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...next],
      });
      const reply = data.choices?.[0]?.message?.content ?? "(sem resposta)";
      setMessages([...next, { role: "assistant", content: reply }]);
    } catch (e) {
      handleAiError(e, "Erro de rede");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir assistente NOVA"
          className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-neon text-primary-foreground shadow-[0_0_24px_var(--neon)] transition hover:scale-105"
        >
          <MessageCircle className="h-6 w-6" />
          <span className="absolute -top-1 -right-1 h-3 w-3 animate-pulse rounded-full bg-neon ring-2 ring-background" />
        </button>
      )}

      {open && (
        <div className="fixed bottom-5 right-5 z-50 flex h-[520px] w-[min(92vw,380px)] flex-col rounded-2xl border border-border bg-card/95 shadow-2xl backdrop-blur">
          <header className="flex items-center gap-2 border-b border-border p-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neon/10 ring-1 ring-neon/40">
              <Sparkles className="h-4 w-4 text-neon" />
            </div>
            <div className="flex-1 min-w-0 leading-tight">
              <div className="font-display text-sm font-semibold">NOVA</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Assistente do app
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-muted-foreground hover:text-neon"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {messages.length === 0 && (
              <div className="rounded-lg border border-dashed border-border bg-background/40 p-3 text-xs text-muted-foreground">
                Sou a <span className="text-neon">NOVA</span>. Pergunte como usar qualquer módulo do
                VisionGuard AI — Vision, Câmera 360°, Emergência, CRM…
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                    m.role === "user"
                      ? "bg-neon/15 text-foreground ring-1 ring-neon/40"
                      : "bg-background/60 text-foreground ring-1 ring-border"
                  }`}
                >
                  <div className="whitespace-pre-wrap">{m.content}</div>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-neon" /> NOVA pensando…
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="border-t border-border p-2">
            <div className="flex gap-2">
              <Textarea
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Como usar…"
                className="min-h-[38px] resize-none text-xs"
                disabled={loading}
              />
              <Button size="icon" onClick={send} disabled={loading || !input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
