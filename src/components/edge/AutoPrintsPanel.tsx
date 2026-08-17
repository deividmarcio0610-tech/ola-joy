import { useEffect, useState, useSyncExternalStore } from "react";
import { Camera, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { printStore, type AutoPrint } from "@/lib/t4/printStore";
import { cn } from "@/lib/utils";

function chartHour(t: number): string {
  return new Date(t).toLocaleTimeString("pt-BR", { hour12: false });
}

/**
 * PRINTS AUTOMÁTICOS — cada linha é um evento REAL do motor com o frame
 * capturado naquele instante e o HORÁRIO DO GRÁFICO correto (nunca um
 * timestamp de lote repetido). Clique na linha para ver a imagem.
 */
export function AutoPrintsPanel() {
  const prints = useSyncExternalStore(
    (listener) => printStore.subscribe(listener),
    () => printStore.list(),
    () => printStore.list(),
  );
  const [selected, setSelected] = useState<AutoPrint | null>(null);

  // Print removido do buffer (cap 24) não pode ficar aberto no visualizador.
  useEffect(() => {
    if (selected && !prints.includes(selected)) setSelected(null);
  }, [prints, selected]);

  return (
    <Card className="border-border/70 bg-panel p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[10px] font-medium tracking-widest text-muted-foreground">
          <Camera className="h-3.5 w-3.5" /> PRINTS AUTOMÁTICOS
        </p>
        <span className="font-mono text-[10px] text-muted-foreground">
          {prints.length} capturado(s) · hora do gráfico
        </span>
      </div>

      {prints.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">
          Sem prints ainda — eles nascem dos eventos reais do motor (varredura, quebra de estrutura,
          POI, entrada validada, gatilho).
        </p>
      ) : (
        <div className="max-h-56 overflow-y-auto">
          <table className="w-full font-mono text-[11px]">
            <tbody>
              {prints.map((print) => (
                <tr
                  key={print.id}
                  className="cursor-pointer border-b border-border/30 transition-colors hover:bg-primary/5"
                  onClick={() => setSelected(print)}
                >
                  <td className="py-1.5 pr-3 text-foreground">{chartHour(print.chartTime)}</td>
                  <td className="pr-3">{print.asset}</td>
                  <td className="pr-3 text-muted-foreground">{print.timeframe}</td>
                  <td
                    className={cn(
                      "pr-3 font-semibold",
                      print.direction === "COMPRA" && "text-bull",
                      print.direction === "VENDA" && "text-bear",
                    )}
                  >
                    {print.direction ?? "—"}
                  </td>
                  <td className="pr-3 text-primary">{print.kind}</td>
                  <td
                    className={cn(
                      "pr-3",
                      print.quality === "ALTA"
                        ? "text-bull"
                        : print.quality === "MÉDIA"
                          ? "text-warn"
                          : "text-muted-foreground",
                    )}
                  >
                    {print.quality}
                  </td>
                  <td className="text-right">
                    {print.zone && (
                      <Badge variant="outline" className="font-mono text-[9px] text-primary">
                        {print.zone}
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="max-w-2xl rounded-lg border border-border bg-panel p-3"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="font-mono text-xs">
                {chartHour(selected.chartTime)} · {selected.asset} · {selected.kind}
                {selected.zone ? ` · ${selected.zone}` : ""}
              </p>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={() => setSelected(null)}
                aria-label="Fechar print"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {selected.imageDataUrl ? (
              <img
                src={selected.imageDataUrl}
                alt={`Print ${selected.kind} ${chartHour(selected.chartTime)}`}
                className="max-h-[70vh] w-full rounded object-contain"
              />
            ) : (
              <p className="p-6 text-center text-xs text-muted-foreground">
                Frame indisponível no instante do evento.
              </p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
