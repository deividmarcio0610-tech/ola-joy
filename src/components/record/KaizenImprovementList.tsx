import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Lightbulb, Wrench, TrendingUp, Clock, DollarSign } from "lucide-react";
import type { KaizenResult } from "@/lib/n3-kaizen";
import { eixoLabel } from "@/lib/n3-kaizen";

interface Props {
  result: KaizenResult;
}

function custoBadge(c: string): string {
  if (c === "alto") return "bg-red-100 text-red-700 border-red-300";
  if (c === "medio") return "bg-amber-100 text-amber-700 border-amber-300";
  return "bg-emerald-100 text-emerald-700 border-emerald-300";
}

export function KaizenImprovementList({ result }: Props) {
  return (
    <Card className="p-4 space-y-3 border-2 border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/20">
      <div className="flex items-center gap-2">
        <Lightbulb className="w-5 h-5 text-emerald-600" />
        <div className="flex-1">
          <div className="font-bold text-sm">Kaizen · Melhoria Contínua</div>
          <div className="text-xs text-muted-foreground">
            Engenharia — como isso pode ficar muito melhor.
          </div>
        </div>
        <Badge variant="outline">{result.melhorias.length} melhorias</Badge>
      </div>

      {result.resumo_engenharia && (
        <p className="text-sm bg-background/60 rounded-md p-2 border">{result.resumo_engenharia}</p>
      )}

      <div className="space-y-2">
        {result.melhorias.map((m) => {
          const principal = m.id === result.recomendacao_principal;
          return (
            <div
              key={m.id}
              className={`border rounded-md p-3 space-y-2 bg-background ${principal ? "border-emerald-500 ring-1 ring-emerald-400/40" : ""}`}
            >
              <div className="flex flex-wrap gap-1 items-center">
                {principal && (
                  <Badge className="bg-emerald-600 text-white text-[10px]">
                    RECOMENDAÇÃO PRINCIPAL
                  </Badge>
                )}
                <Badge variant="outline" className="text-[10px]">
                  <Wrench className="w-3 h-3 mr-1" />
                  {eixoLabel(m.eixo)}
                </Badge>
                <Badge variant="outline" className={`text-[10px] ${custoBadge(m.custo_estimado)}`}>
                  <DollarSign className="w-3 h-3 mr-0.5" /> {m.custo_estimado}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  <Clock className="w-3 h-3 mr-0.5" /> {m.prazo_dias}d
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  Prioridade {m.prioridade}
                </Badge>
              </div>

              <div className="text-sm font-semibold">{m.problema}</div>

              {m.causa_raiz && (
                <div className="text-xs">
                  <span className="font-semibold text-muted-foreground">Causa raiz: </span>
                  {m.causa_raiz}
                </div>
              )}

              <div className="text-sm bg-emerald-50 dark:bg-emerald-950/40 rounded p-2 border border-emerald-200 dark:border-emerald-800">
                <span className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400 block mb-1">
                  Solução
                </span>
                {m.solucao}
              </div>

              {m.beneficio && (
                <div className="text-xs flex items-start gap-1">
                  <TrendingUp className="w-3 h-3 mt-0.5 text-emerald-600" />
                  <span>
                    <span className="font-semibold">Benefício:</span> {m.beneficio}
                  </span>
                </div>
              )}

              {m.antes_depois && (
                <div className="text-xs text-muted-foreground italic">
                  Antes → Depois: {m.antes_depois}
                </div>
              )}

              {(m.roi_qualitativo || m.impacto) && (
                <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t">
                  {m.roi_qualitativo && (
                    <div>
                      <span className="font-semibold">ROI:</span> {m.roi_qualitativo}
                    </div>
                  )}
                  {m.impacto && (
                    <div>
                      <span className="font-semibold">Impacto:</span> {m.impacto}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
