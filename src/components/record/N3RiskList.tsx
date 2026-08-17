import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertTriangle, ShieldAlert, ChevronRight } from "lucide-react";
import type { N3Result, N3Risk } from "@/lib/n3-kaizen";
import { categoriaLabel, criticidadeColor } from "@/lib/n3-kaizen";

interface Props {
  result: N3Result;
  selectedId?: string | null;
  onSelect: (risk: N3Risk) => void;
}

export function N3RiskList({ result, selectedId, onSelect }: Props) {
  const order = result.priorizacao?.length
    ? result.priorizacao
    : result.riscos
        .slice()
        .sort((a, b) => b.score - a.score)
        .map((r) => r.id);
  const byId = new Map(result.riscos.map((r) => [r.id, r]));
  const ordered = order.map((id) => byId.get(id)).filter((r): r is N3Risk => Boolean(r));

  return (
    <Card className="p-4 space-y-3 border-2 border-red-500/30 bg-red-50/40 dark:bg-red-950/20">
      <div className="flex items-center gap-2">
        <ShieldAlert className="w-5 h-5 text-red-600" />
        <div className="flex-1">
          <div className="font-bold text-sm">N3 · Auditoria de Riscos</div>
          <div className="text-xs text-muted-foreground">
            Diagnóstico — o auditor identifica, não propõe solução.
          </div>
        </div>
        {result.necessita_interdicao && (
          <Badge className="bg-red-600 text-white">INTERDIÇÃO SUGERIDA</Badge>
        )}
      </div>

      {result.resumo_auditoria && (
        <p className="text-sm bg-background/60 rounded-md p-2 border">{result.resumo_auditoria}</p>
      )}

      {ordered.length === 0 ? (
        <div className="text-sm text-muted-foreground italic">
          Nenhum risco visível identificado.
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
            {ordered.length} risco(s) identificado(s) — selecione um para gerar Kaizen
          </div>
          {ordered.map((r, idx) => {
            const selected = selectedId === r.id;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => onSelect(r)}
                className={`w-full text-left border rounded-md p-3 transition ${
                  selected
                    ? "border-primary ring-2 ring-primary/40 bg-primary/5"
                    : "hover:border-primary/50 bg-background"
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className="text-lg font-bold text-muted-foreground w-6">{idx + 1}</div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap gap-1 items-center">
                      <Badge className={`text-[10px] ${criticidadeColor(r.criticidade)}`}>
                        {r.criticidade.toUpperCase()}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {categoriaLabel(r.categoria)}
                      </Badge>
                      {r.norma && (
                        <Badge variant="outline" className="text-[10px]">
                          {r.norma}
                        </Badge>
                      )}
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        P{r.probabilidade}×S{r.severidade}={r.score}
                      </span>
                    </div>
                    <div className="text-sm font-semibold flex items-start gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-red-600" />
                      <span>{r.perigo}</span>
                    </div>
                    {r.risco && (
                      <div className="text-xs text-muted-foreground">Consequência: {r.risco}</div>
                    )}
                    {r.evidencia && (
                      <div className="text-[11px] text-muted-foreground italic">
                        Evidência: {r.evidencia}
                      </div>
                    )}
                  </div>
                  <ChevronRight
                    className={`w-4 h-4 mt-1 ${selected ? "text-primary" : "text-muted-foreground"}`}
                  />
                </div>
                {selected && (
                  <Button
                    size="sm"
                    className="w-full mt-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(r);
                    }}
                  >
                    Continuar com este risco
                  </Button>
                )}
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}
