import { useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { sendPrintFeedback } from "@/lib/printAnalysis/client";
import { cn } from "@/lib/utils";

/**
 * FEEDBACK DO OPERADOR (requisito 20). Serve para calibrar o prompt e as
 * regras depois — nunca para reescrever a análise já gravada.
 */

const REASONS = [
  "Entrada errada",
  "Stop errado",
  "A técnica não era T4",
  "Região errada",
  "Leitura do preço errada",
  "Outro",
];

export function PrintFeedback({
  analysisId,
  initial,
}: {
  analysisId: string;
  initial?: { correct: boolean; reasons: string[]; comment: string | null } | null;
}) {
  const [sent, setSent] = useState<boolean | null>(initial ? initial.correct : null);
  const [asking, setAsking] = useState(false);
  const [reasons, setReasons] = useState<string[]>(initial?.reasons ?? []);
  const [comment, setComment] = useState(initial?.comment ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(correct: boolean, chosen: string[], text: string) {
    setBusy(true);
    setError(null);
    try {
      await sendPrintFeedback({
        analysisId,
        correct,
        reasons: chosen,
        comment: text.trim() ? text.trim() : null,
      });
      setSent(correct);
      setAsking(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao registrar o feedback.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-border/70 bg-panel p-3">
      <p className="text-[10px] font-medium tracking-widest text-muted-foreground">
        ESTA ANÁLISE ESTAVA CORRETA?
      </p>
      <div className="mt-2 flex gap-2">
        <Button
          size="sm"
          variant={sent === true ? "default" : "outline"}
          className="h-7 text-[11px]"
          disabled={busy}
          onClick={() => void submit(true, [], "")}
        >
          <ThumbsUp className="mr-1.5 h-3.5 w-3.5" /> Correta
        </Button>
        <Button
          size="sm"
          variant={sent === false ? "default" : "outline"}
          className={cn("h-7 text-[11px]", sent === false && "bg-bear text-white hover:bg-bear/90")}
          disabled={busy}
          onClick={() => setAsking(true)}
        >
          <ThumbsDown className="mr-1.5 h-3.5 w-3.5" /> Incorreta
        </Button>
      </div>

      {asking && (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-[10px] tracking-widest text-muted-foreground">O QUE ESTAVA ERRADO?</p>
          <div className="flex flex-wrap gap-1">
            {REASONS.map((reason) => {
              const active = reasons.includes(reason);
              return (
                <button
                  key={reason}
                  type="button"
                  onClick={() =>
                    setReasons((current) =>
                      active ? current.filter((item) => item !== reason) : [...current, reason],
                    )
                  }
                  className={cn(
                    "rounded border px-1.5 py-0.5 text-[10px] transition-colors",
                    active
                      ? "border-bear text-bear"
                      : "border-border/60 text-muted-foreground hover:border-primary hover:text-primary",
                  )}
                >
                  {reason}
                </button>
              );
            })}
          </div>
          <Input
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Detalhe (opcional)"
            className="h-8 text-xs"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-7 text-[11px]"
              disabled={busy || reasons.length === 0}
              onClick={() => void submit(false, reasons, comment)}
            >
              Enviar
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              onClick={() => setAsking(false)}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {sent !== null && !asking && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Feedback registrado{sent ? "" : ` (${reasons.join(", ")})`}. Ele alimenta a calibração
          futura e não altera a análise já gravada.
        </p>
      )}
      {error && <p className="mt-2 text-[11px] text-bear">{error}</p>}
    </Card>
  );
}
