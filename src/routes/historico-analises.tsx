import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PrintChat } from "@/components/print/PrintChat";
import { PrintComparison } from "@/components/print/PrintComparison";
import { PrintDiagnosticPanel } from "@/components/print/PrintDiagnosticPanel";
import { PrintFeedback } from "@/components/print/PrintFeedback";
import {
  deletePrintAnalysisById,
  fetchPrintAnalysisById,
  fetchPrintHistory,
  type PrintHistoryItem,
  type PrintHistoryRecord,
} from "@/lib/printAnalysis/client";
import { PRINT_T4_STATUS_LABEL, type PrintT4Status } from "@/lib/printAnalysis/contract";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/historico-analises")({
  component: PrintHistoryPage,
  head: () => ({ meta: [{ title: "Histórico de Análises — Analisador T4" }] }),
});

/**
 * HISTÓRICO DE ANÁLISES POR PRINT.
 *
 * Cada linha reabre a análise EXATAMENTE como foi gravada: o print original,
 * as marcações validadas e o feedback. Nada é recalculado — o histórico é
 * registro, não reinterpretação.
 */
function PrintHistoryPage() {
  const [items, setItems] = useState<PrintHistoryItem[]>([]);
  const [selected, setSelected] = useState<PrintHistoryRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await fetchPrintHistory(100));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar o histórico.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function open(id: string) {
    try {
      setSelected(await fetchPrintAnalysisById(id));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao abrir a análise.");
    }
  }

  async function remove(id: string) {
    try {
      await deletePrintAnalysisById(id);
      if (selected?.id === id) setSelected(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao excluir a análise.");
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight">HISTÓRICO DE ANÁLISES</h1>
          <p className="text-xs text-muted-foreground">
            {items.length} análise(s) por print gravada(s).
          </p>
        </div>
        <Button size="sm" variant="outline" className="h-7" onClick={() => void load()}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Atualizar
        </Button>
      </header>

      {error && (
        <Card className="border-bear/50 bg-bear/5 p-3">
          <p className="text-xs text-bear">{error}</p>
        </Card>
      )}

      <Card className="border-border/70 bg-panel p-0">
        {loading ? (
          <p className="p-4 text-xs text-muted-foreground">Carregando…</p>
        ) : items.length === 0 ? (
          <p className="p-4 text-xs text-muted-foreground">
            Nenhuma análise gravada ainda. Analise um print para começar o histórico.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full font-mono text-[11px]">
              <thead>
                <tr className="border-b border-border/50 text-left text-muted-foreground">
                  <th className="p-2">DATA</th>
                  <th className="p-2">ATIVO</th>
                  <th className="p-2">TF</th>
                  <th className="p-2">STATUS T4</th>
                  <th className="p-2">DIREÇÃO</th>
                  <th className="p-2 text-right">CONFIANÇA</th>
                  <th className="p-2 text-right">ENTRADA</th>
                  <th className="p-2 text-right">STOP</th>
                  <th className="p-2 text-right">ALVO 1</th>
                  <th className="p-2">FEEDBACK</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className={cn(
                      "cursor-pointer border-b border-border/30 transition-colors hover:bg-primary/5",
                      selected?.id === item.id && "bg-primary/10",
                    )}
                    onClick={() => void open(item.id)}
                  >
                    <td className="p-2">{new Date(item.createdAt).toLocaleString("pt-BR")}</td>
                    <td className="p-2">{item.symbol ?? "—"}</td>
                    <td className="p-2">{item.timeframe ?? "—"}</td>
                    <td className="p-2">
                      {PRINT_T4_STATUS_LABEL[item.status as PrintT4Status] ?? item.status}
                    </td>
                    <td
                      className={cn(
                        "p-2 font-semibold",
                        item.direction === "COMPRA" && "text-bull",
                        item.direction === "VENDA" && "text-bear",
                      )}
                    >
                      {item.direction}
                    </td>
                    <td className="p-2 text-right">{Math.round(item.confidence)}%</td>
                    <td className="p-2 text-right">{item.entry?.toLocaleString("pt-BR") ?? "—"}</td>
                    <td className="p-2 text-right">{item.stop?.toLocaleString("pt-BR") ?? "—"}</td>
                    <td className="p-2 text-right">
                      {item.target1?.toLocaleString("pt-BR") ?? "—"}
                    </td>
                    <td className="p-2">
                      {item.feedback === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : item.feedback.correct ? (
                        <ThumbsUp className="h-3.5 w-3.5 text-bull" />
                      ) : (
                        <ThumbsDown className="h-3.5 w-3.5 text-bear" />
                      )}
                    </td>
                    <td className="p-2 text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        aria-label="Excluir análise"
                        onClick={(event) => {
                          event.stopPropagation();
                          void remove(item.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selected && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono text-[10px]">
                {new Date(selected.createdAt).toLocaleString("pt-BR")}
              </Badge>
              <Button size="sm" variant="outline" className="h-7" onClick={() => setSelected(null)}>
                Fechar
              </Button>
            </div>
            <PrintComparison
              imageDataUrl={selected.imageDataUrl}
              naturalWidth={selected.imageWidth || 1280}
              naturalHeight={selected.imageHeight || 720}
              annotations={selected.analysis.annotations}
            />
          </div>
          <div className="flex flex-col gap-3">
            <PrintDiagnosticPanel
              analysis={selected.analysis}
              corrections={selected.corrections}
              model={selected.model}
              repaired={selected.repaired}
            />
            <PrintFeedback analysisId={selected.id} initial={selected.feedback} />
            <PrintChat analysisId={selected.id} />
          </div>
        </div>
      )}
    </div>
  );
}
