import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { askPrintQuestion } from "@/lib/printAnalysis/client";
import { cn } from "@/lib/utils";

/**
 * CHAT CONTEXTUAL sobre a análise (requisito 18).
 *
 * O servidor reenvia a MESMA imagem e a MESMA análise validada ao modelo. O
 * chat explica o que já foi decidido — não cria entrada, stop ou alvo novos.
 */

const SUGGESTIONS = [
  "Por que você marcou essa entrada?",
  "Onde essa T4 invalida?",
  "Vale esperar pullback?",
  "Qual candle confirmou?",
  "Por que não é compra ainda?",
];

interface Turn {
  role: "user" | "assistant";
  content: string;
}

export function PrintChat({ analysisId }: { analysisId: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Trocou de análise: o histórico anterior não pertence a este print.
  useEffect(() => {
    setTurns([]);
    setError(null);
  }, [analysisId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [turns]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setQuestion("");
    setError(null);
    setBusy(true);
    const history = turns.slice(-8);
    setTurns((current) => [...current, { role: "user", content: trimmed }]);
    try {
      const answer = await askPrintQuestion({ analysisId, question: trimmed, history });
      setTurns((current) => [...current, { role: "assistant", content: answer }]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao consultar a IA.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-border/70 bg-panel p-3">
      <p className="text-[10px] font-medium tracking-widest text-muted-foreground">
        PERGUNTAR SOBRE ESTE PRINT
      </p>

      <div ref={listRef} className="mt-2 flex max-h-64 flex-col gap-2 overflow-y-auto">
        {turns.length === 0 && (
          <p className="text-xs text-muted-foreground">
            A IA responde usando esta imagem e esta análise. Ela não cria níveis novos.
          </p>
        )}
        {turns.map((turn, index) => (
          <div
            key={`${turn.role}-${index}`}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-xs leading-relaxed",
              turn.role === "user"
                ? "self-end bg-primary/15 text-foreground"
                : "self-start bg-muted/60 text-foreground",
            )}
          >
            {turn.content}
          </div>
        ))}
        {busy && <p className="text-[11px] text-muted-foreground">Consultando a IA…</p>}
      </div>

      {error && (
        <p className="mt-2 rounded border border-bear/50 bg-bear/10 px-2 py-1 text-[11px] text-bear">
          {error}
        </p>
      )}

      <div className="mt-2 flex flex-wrap gap-1">
        {SUGGESTIONS.map((item) => (
          <button
            key={item}
            type="button"
            disabled={busy}
            onClick={() => void send(item)}
            className="rounded border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
          >
            {item}
          </button>
        ))}
      </div>

      <form
        className="mt-2 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send(question);
        }}
      >
        <Input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Pergunte sobre esta análise…"
          className="h-8 text-xs"
          disabled={busy}
        />
        <Button type="submit" size="sm" className="h-8" disabled={busy || !question.trim()}>
          <Send className="h-3.5 w-3.5" />
        </Button>
      </form>
    </Card>
  );
}
