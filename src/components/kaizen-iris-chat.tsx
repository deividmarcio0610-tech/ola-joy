// Chat da ValeTech IA no Kaizen — Fase 1:
// - Envia foto
// - Conversa (Gemini) para refinar correções
// - Botão "Gerar imagem Depois" (OpenAI Images Edit via /api/iris/generate-corrected)
// - Mostra Antes/Depois no próprio chat com CompareSlider
// Sem versionamento múltiplo, sem storage persistente. Erros nunca derrubam a página.

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import {
  ImagePlus,
  Send,
  Sparkles,
  Trash2,
  Download,
  RefreshCw,
  Loader2,
  X,
} from "lucide-react";
import { CompareSlider } from "@/components/compare-slider";
import { cn } from "@/lib/utils";

type SafetyCorrection = {
  id: string;
  standard?: string;
  description: string;
  selected: boolean;
  source: "iris" | "user";
};

type ChatMsg = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  imagePreview?: string;
  generatedImage?: { dataUrl: string; corrections: SafetyCorrection[] };
};

const uuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

async function fileToBase64(file: File): Promise<{ base64: string; mimeType: string; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const dataUrl = String(r.result);
      const base64 = dataUrl.split(",")[1] ?? "";
      resolve({ base64, mimeType: file.type || "image/jpeg", dataUrl });
    };
    r.onerror = () => reject(new Error("Falha ao ler o arquivo."));
    r.readAsDataURL(file);
  });
}

export function KaizenIrisChat({ onClose }: { onClose?: () => void }) {
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      id: uuid(),
      role: "assistant",
      content:
        "Olá! Envie uma fotografia do local e me diga quais correções de segurança quer aplicar. Quando estiver pronto, clique em **Gerar imagem Depois**.",
    },
  ]);
  const [input, setInput] = useState("");
  const [photo, setPhoto] = useState<{ base64: string; mimeType: string; dataUrl: string } | null>(null);
  const [corrections, setCorrections] = useState<SafetyCorrection[]>([]);
  const [sending, setSending] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, generating]);

  const selectedCorrections = useMemo(() => corrections.filter((c) => c.selected), [corrections]);

  function pushMsg(m: Omit<ChatMsg, "id">) {
    setMessages((prev) => [...prev, { id: uuid(), ...m }]);
  }

  async function handleAttach(file: File) {
    try {
      const p = await fileToBase64(file);
      setPhoto(p);
      pushMsg({ role: "user", content: "📎 Fotografia enviada.", imagePreview: p.dataUrl });
      pushMsg({
        role: "assistant",
        content:
          "Fotografia recebida. Descreva as correções desejadas ou selecione as recomendações de segurança identificadas.",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao ler a imagem.");
    }
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || sending) return;
    pushMsg({ role: "user", content: text });
    setInput("");
    setSending(true);

    // Detecta pedido explícito de geração
    if (/(gerar|gera|cria|criar|refaz)\s+(a\s+)?(foto|imagem)/i.test(text)) {
      setSending(false);
      await generate(text);
      return;
    }

    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Faça login novamente.");

      const res = await fetch("/api/iris/kaizen-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          messages: [...messages, { role: "user", content: text }].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          corrections: corrections.map((c) => ({ standard: c.standard, description: c.description })),
          hasImage: !!photo,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        assistantMessage?: string;
        actions?: Array<{ type: string; correction?: { standard?: string; description: string }; description?: string }>;
        error?: string;
      };
      if (data.error) {
        pushMsg({ role: "assistant", content: `⚠️ ${data.error}` });
      } else {
        pushMsg({ role: "assistant", content: data.assistantMessage ?? "Certo." });

        // Aplica ações
        setCorrections((prev) => {
          let next = [...prev];
          let triggerGenerate = false;
          for (const a of data.actions ?? []) {
            if (a.type === "ADD_CORRECTION" && a.correction?.description) {
              next.push({
                id: uuid(),
                standard: a.correction.standard,
                description: a.correction.description,
                selected: true,
                source: "iris",
              });
            } else if (a.type === "REMOVE_CORRECTION" && a.description) {
              next = next.filter(
                (c) => c.description.toLowerCase() !== (a.description ?? "").toLowerCase(),
              );
            } else if (a.type === "GENERATE_NOW") {
              triggerGenerate = true;
            }
          }
          if (triggerGenerate) setTimeout(() => generate(text), 100);
          return next;
        });
      }
    } catch (e) {
      pushMsg({
        role: "assistant",
        content: `⚠️ ${e instanceof Error ? e.message : "Não foi possível responder agora."}`,
      });
    } finally {
      setSending(false);
    }
  }

  async function generate(userInstruction?: string) {
    if (generating) return;
    if (!photo) {
      pushMsg({ role: "assistant", content: "Envie uma fotografia antes de gerar a correção." });
      return;
    }
    if (selectedCorrections.length === 0 && !userInstruction?.trim()) {
      pushMsg({ role: "assistant", content: "Descreva ou selecione pelo menos uma correção." });
      return;
    }

    setGenerating(true);
    setProgress(0);
    setProgressLabel("Preparando a fotografia…");
    abortRef.current = new AbortController();

    const steps = [
      { p: 15, l: "Interpretando as correções…" },
      { p: 35, l: "Montando o pedido de edição…" },
      { p: 60, l: "Gerando imagem…" },
      { p: 85, l: "Validando resultado…" },
    ];
    let stepIdx = 0;
    const interval = setInterval(() => {
      if (stepIdx < steps.length) {
        setProgress(steps[stepIdx].p);
        setProgressLabel(steps[stepIdx].l);
        stepIdx++;
      }
    }, 3500);

    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Faça login novamente.");

      const res = await fetch("/api/iris/generate-corrected", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        signal: abortRef.current.signal,
        body: JSON.stringify({
          imageBase64: photo.base64,
          mimeType: photo.mimeType,
          corrections: selectedCorrections.map((c) => ({
            standard: c.standard,
            description: c.description,
          })),
          instructions: userInstruction,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        imageBase64?: string;
        imageMimeType?: string;
        error?: string;
        detail?: string;
      };
      clearInterval(interval);

      if (!data.success || !data.imageBase64) {
        setProgress(0);
        setProgressLabel("");
        pushMsg({
          role: "assistant",
          content: `⚠️ ${data.error ?? "Não foi possível gerar esta versão. Sua fotografia e suas correções foram preservadas."}`,
        });
        return;
      }

      setProgress(100);
      setProgressLabel("Concluído");
      const dataUrl = `data:${data.imageMimeType ?? "image/png"};base64,${data.imageBase64}`;
      setLastGenerated(dataUrl);
      pushMsg({
        role: "assistant",
        content: "Imagem corrigida gerada com sucesso.",
        generatedImage: { dataUrl, corrections: selectedCorrections },
      });
    } catch (e) {
      clearInterval(interval);
      setProgress(0);
      setProgressLabel("");
      const isAbort = e instanceof Error && e.name === "AbortError";
      pushMsg({
        role: "assistant",
        content: `⚠️ ${isAbort ? "Geração cancelada." : e instanceof Error ? e.message : "Falha na geração."}`,
      });
    } finally {
      setGenerating(false);
      abortRef.current = null;
    }
  }

  function toggleCorrection(id: string) {
    setCorrections((prev) => prev.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c)));
  }
  function removeCorrection(id: string) {
    setCorrections((prev) => prev.filter((c) => c.id !== id));
  }
  function addManualCorrection(standard: string, description: string) {
    if (!description.trim()) return;
    setCorrections((prev) => [
      ...prev,
      { id: uuid(), standard: standard.trim() || undefined, description: description.trim(), selected: true, source: "user" },
    ]);
  }

  return (
    <div className="flex h-[80vh] flex-col overflow-hidden rounded-lg border border-border bg-background">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-neon" />
          <div>
            <h2 className="font-display text-sm uppercase tracking-widest">Chat de IA — Foto Corrigida</h2>
            <p className="text-xs text-muted-foreground">Kaizen · gera imagem via OpenAI</p>
          </div>
        </div>
        {onClose && (
          <Button size="icon" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </header>

      <div className="grid flex-1 grid-cols-1 gap-0 overflow-hidden md:grid-cols-[1fr_320px]">
        {/* Coluna do chat */}
        <div className="flex flex-col overflow-hidden">
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "flex w-full",
                  m.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground",
                  )}
                >
                  <div className="whitespace-pre-wrap">{m.content}</div>
                  {m.imagePreview && (
                    <img
                      src={m.imagePreview}
                      alt="Fotografia enviada"
                      className="mt-2 max-h-48 rounded border border-border"
                    />
                  )}
                  {m.generatedImage && photo && (
                    <div className="mt-3 space-y-2">
                      <CompareSlider
                        beforeSrc={photo.dataUrl}
                        afterSrc={m.generatedImage.dataUrl}
                        className="max-h-72"
                      />
                      <div className="flex flex-wrap gap-2">
                        <a
                          href={m.generatedImage.dataUrl}
                          download="foto-corrigida.png"
                          className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-muted"
                        >
                          <Download className="h-3 w-3" /> Baixar
                        </a>
                        <button
                          className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-muted"
                          onClick={() => generate("Refazer com as mesmas correções, melhorando fidelidade ao ambiente.")}
                        >
                          <RefreshCw className="h-3 w-3" /> Refazer
                        </button>
                      </div>
                      {m.generatedImage.corrections.length > 0 && (
                        <div className="text-[10px] text-muted-foreground">
                          Aplicadas: {m.generatedImage.corrections.map((c) => c.standard ?? "livre").join(", ")}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> ValeTech IA está analisando…
              </div>
            )}
            {generating && (
              <Card className="p-3">
                <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> {progressLabel || "Gerando imagem Depois…"}
                </div>
                <div className="h-2 w-full overflow-hidden rounded bg-muted">
                  <div
                    className="h-full bg-neon transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </Card>
            )}
          </div>

          <div className="border-t border-border p-3">
            <div className="flex items-end gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleAttach(f);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={() => fileRef.current?.click()}
                title="Anexar fotografia"
              >
                <ImagePlus className="h-4 w-4" />
              </Button>
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Descreva a correção, ex.: 'Organize os cabos e aplique NR-10.'"
                className="min-h-[44px] max-h-32 flex-1 resize-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
              />
              <Button type="button" size="icon" onClick={sendMessage} disabled={sending || !input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => generate()}
                disabled={generating || !photo}
                className="bg-neon text-black hover:bg-neon/90"
              >
                <Sparkles className="mr-1 h-3 w-3" />
                {generating ? "Gerando…" : "Gerar imagem Depois"}
              </Button>
              {lastGenerated && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setLastGenerated(null);
                    setMessages([
                      {
                        id: uuid(),
                        role: "assistant",
                        content: "Nova análise iniciada. Envie uma nova fotografia se necessário.",
                      },
                    ]);
                    setCorrections([]);
                    setPhoto(null);
                  }}
                >
                  Nova análise
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Coluna lateral de correções */}
        <aside className="hidden flex-col border-l border-border md:flex">
          <div className="border-b border-border px-3 py-2">
            <h3 className="font-display text-xs uppercase tracking-widest">Correções</h3>
            <p className="text-[10px] text-muted-foreground">
              Marque as que devem ser aplicadas na Foto Depois.
            </p>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {corrections.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Nenhuma correção ainda. Peça sugestões à IA ou adicione manualmente abaixo.
              </p>
            )}
            {corrections.map((c) => (
              <div
                key={c.id}
                className={cn(
                  "rounded border p-2 text-xs",
                  c.selected ? "border-neon/50 bg-neon/5" : "border-border bg-muted/30",
                )}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={c.selected}
                      onChange={() => toggleCorrection(c.id)}
                    />
                    {c.standard && <Badge variant="outline" className="text-[10px]">{c.standard}</Badge>}
                    <span className="text-[10px] text-muted-foreground">
                      {c.source === "iris" ? "IA" : "Manual"}
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => removeCorrection(c.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                <div>{c.description}</div>
              </div>
            ))}
          </div>
          <ManualAdder onAdd={addManualCorrection} />
        </aside>
      </div>
    </div>
  );
}

function ManualAdder({ onAdd }: { onAdd: (standard: string, description: string) => void }) {
  const [standard, setStandard] = useState("");
  const [description, setDescription] = useState("");
  return (
    <div className="border-t border-border p-3 space-y-2">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Adicionar correção</div>
      <Input
        placeholder="Norma (ex.: NR-10, 5S)"
        value={standard}
        onChange={(e) => setStandard(e.target.value)}
        className="h-8 text-xs"
        maxLength={20}
      />
      <Textarea
        placeholder="Descrição (10-600 caracteres)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="min-h-[60px] text-xs"
        maxLength={600}
      />
      <Button
        size="sm"
        className="w-full"
        disabled={description.trim().length < 5}
        onClick={() => {
          onAdd(standard, description);
          setStandard("");
          setDescription("");
        }}
      >
        Adicionar
      </Button>
    </div>
  );
}
