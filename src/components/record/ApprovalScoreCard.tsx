import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Check, X } from "lucide-react";
import type { AnalysisV2 } from "@/lib/analysis-v2";
import { RiskScoreLegend } from "./RiskScoreLegend";

export function ApprovalScoreCard({ analysis }: { analysis: AnalysisV2 }) {
  const a = analysis.approval;
  const riskNow = Math.min(100, Math.max(0, 100 - a.atual));
  const riskAfter = Math.min(100, Math.max(0, 100 - a.estimado_apos_correcoes));
  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="text-xs text-muted-foreground">
              Score de risco atual (quanto maior, mais crítico)
            </div>
            <div className="text-3xl font-bold text-rose-600 dark:text-rose-400">{riskNow}</div>
            <Progress value={riskNow} className="mt-1 h-2 [&>div]:bg-rose-500" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Score de risco após correções</div>
            <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
              {riskAfter}
            </div>
            <Progress value={riskAfter} className="mt-1 h-2 [&>div]:bg-emerald-500" />
          </div>
        </div>

        <RiskScoreLegend />

        {a.justificativa && <p className="text-sm text-muted-foreground">{a.justificativa}</p>}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
              Pontos fortes
            </div>
            <ul className="space-y-1 text-sm">
              {a.pontos_fortes.length === 0 && <li className="text-muted-foreground">—</li>}
              {a.pontos_fortes.map((p, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400">
              Pendências
            </div>
            <ul className="space-y-1 text-sm">
              {a.pendencias.length === 0 && (
                <li className="text-muted-foreground">Nenhuma pendência identificada.</li>
              )}
              {a.pendencias.map((p, i) => (
                <li key={i} className="flex items-start gap-2">
                  <X className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {a.evidencias_ausentes.length > 0 && (
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Evidências ausentes
            </div>
            <ul className="list-inside list-disc text-sm">
              {a.evidencias_ausentes.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        {a.acoes_necessarias.length > 0 && (
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Ações necessárias para elevar a chance
            </div>
            <ul className="list-inside list-disc text-sm">
              {a.acoes_necessarias.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
