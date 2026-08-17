// Fluxo 5S do módulo Inspeção — auditoria EXCLUSIVA dos 5 sensos.
// Não avalia segurança, NRs, meio ambiente, Kaizen ou N3.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Loader2, Sparkles, Download, CheckCircle2, XCircle, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import {
  auditar5S,
  corDaNota,
  SENSO_LABEL,
  type Inspecao5SResult,
  type Senso5SKey,
} from "@/lib/inspecao-5s";
import { gerarPdf5S, downloadPdf5S } from "@/lib/inspecao-5s-pdf";

interface Props {
  images: string[];
  context?: string;
  initial?: Inspecao5SResult | null;
  onChange?: (r: Inspecao5SResult | null) => void;
}

const ORDEM: Senso5SKey[] = ["seiri", "seiton", "seiso", "seiketsu", "shitsuke"];

export function Inspecao5SFlow({ images, context, initial = null, onChange }: Props) {
  const [result, setResult] = useState<Inspecao5SResult | null>(initial);
  const [running, setRunning] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  async function analisar() {
    if (images.length === 0) {
      toast.error("Anexe pelo menos uma foto.");
      return;
    }
    setRunning(true);
    try {
      const r = await auditar5S({ images, context });
      setResult(r);
      onChange?.(r);
      toast.success(`Auditoria 5S concluída — ${r.classificacao} (${r.nota_final}/100)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na auditoria 5S.");
    } finally {
      setRunning(false);
    }
  }

  async function baixarPdf() {
    if (!result) return;
    setPdfBusy(true);
    try {
      const blob = await gerarPdf5S({ result, images });
      downloadPdf5S(blob, `auditoria-5s-${Date.now()}.pdf`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar PDF.");
    } finally {
      setPdfBusy(false);
    }
  }

  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-6 border-2 border-dashed rounded-lg bg-muted/30">
        <ClipboardCheck className="w-8 h-8 text-primary" />
        <div className="text-center">
          <div className="font-bold">Inspeção 5S</div>
          <div className="text-xs text-muted-foreground">
            Auditoria exclusiva dos 5 sensos (Seiri, Seiton, Seiso, Seiketsu, Shitsuke).
          </div>
        </div>
        <Button size="lg" disabled={running || images.length === 0} onClick={analisar}>
          {running ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Auditando 5S…
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" /> Analisar 5S
            </>
          )}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Cabeçalho: nota final */}
      <Card className="p-4 border-2 border-primary/30 bg-primary/5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">
              Nota Final 5S
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold">{result.nota_final}</span>
              <span className="text-muted-foreground">/100</span>
              <Badge className={`ml-2 ${corDaNota(result.nota_final)}`}>
                {result.classificacao}
              </Badge>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={analisar} disabled={running}>
              {running ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
              Reauditar
            </Button>
            <Button size="sm" onClick={baixarPdf} disabled={pdfBusy}>
              {pdfBusy ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <Download className="w-3 h-3 mr-1" />
              )}
              PDF
            </Button>
          </div>
        </div>
        {result.resumo_executivo && (
          <p className="mt-3 text-sm bg-background/60 rounded-md p-2 border">
            {result.resumo_executivo}
          </p>
        )}
      </Card>

      {/* Sensos */}
      <div className="grid gap-2 md:grid-cols-2">
        {ORDEM.map((key) => {
          const s = result.sensos[key];
          const meta = SENSO_LABEL[key];
          return (
            <Card key={key} className="p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="font-bold text-sm">
                    {meta.jp} — {meta.nome}
                  </div>
                  <div className="text-[11px] text-muted-foreground italic">{meta.desc}</div>
                </div>
                <Badge className={corDaNota(s.nota)}>{s.nota}/100</Badge>
              </div>
              <Progress value={s.nota} className="h-1.5" />
              {s.observacoes && <p className="text-xs text-muted-foreground">{s.observacoes}</p>}
              {s.problemas.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide font-semibold text-red-600">
                    Problemas
                  </div>
                  <ul className="text-xs list-disc pl-4 space-y-0.5">
                    {s.problemas.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
              {s.melhorias.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide font-semibold text-emerald-600">
                    Melhorias
                  </div>
                  <ul className="text-xs list-disc pl-4 space-y-0.5">
                    {s.melhorias.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Checklist */}
      {result.checklist.length > 0 && (
        <Card className="p-3">
          <div className="font-bold text-sm mb-2">Checklist de Conformidade 5S</div>
          <ul className="grid gap-1 md:grid-cols-2">
            {result.checklist.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                {c.conforme ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                )}
                <span className={c.conforme ? "" : "text-muted-foreground"}>{c.item}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
