import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { AnalysisV2, Priority, RiskLevel } from "@/lib/analysis-v2";
import { AlertTriangle, CalendarDays, MapPin, ShieldCheck, User } from "lucide-react";
import { RiskScoreLegend } from "./RiskScoreLegend";

const RISK_LABEL: Record<RiskLevel, string> = {
  baixo: "Baixo",
  medio: "Médio",
  alto: "Alto",
  critico: "Crítico",
};

const RISK_TONE: Record<RiskLevel, string> = {
  baixo: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  medio: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300",
  alto: "border-orange-500/40 bg-orange-500/10 text-orange-600 dark:text-orange-300",
  critico: "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-300",
};

const PRIORITY_LABEL: Record<Priority, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  critica: "Crítica",
};

export function ExecutiveSummaryCard({ analysis }: { analysis: AnalysisV2 }) {
  const s = analysis.summary;
  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="text-xs uppercase tracking-wide">
            Resumo executivo
          </Badge>
          <Badge className="border" variant="outline">
            {s.classificacao_sugerida}
          </Badge>
          <Badge className={`border ${RISK_TONE[s.nivel_risco]}`} variant="outline">
            <ShieldCheck className="mr-1 h-3 w-3" />
            Risco {RISK_LABEL[s.nivel_risco]}
          </Badge>
          <Badge variant="outline">Prioridade {PRIORITY_LABEL[s.prioridade]}</Badge>
        </div>

        {(() => {
          const riskScore = Math.min(100, Math.max(0, 100 - s.probabilidade_aprovacao));
          const riskAfter = Math.min(
            100,
            Math.max(0, 100 - analysis.approval.estimado_apos_correcoes),
          );
          return (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">
                  Score de risco (quanto maior, mais crítico)
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-rose-600 dark:text-rose-400">
                    {riskScore}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    → {riskAfter} após correções
                  </span>
                </div>
                <Progress value={riskScore} className="h-2 [&>div]:bg-rose-500" />
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Pontuação geral</div>
                <div className="text-3xl font-bold">{s.pontuacao_geral}</div>
                <Progress value={s.pontuacao_geral} className="h-2" />
              </div>
            </div>
          );
        })()}

        <RiskScoreLegend />

        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="truncate">
              {[s.area, s.local].filter(Boolean).join(" — ") || "Área/local não informados"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="truncate">{s.responsavel || "Responsável a definir"}</span>
          </div>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
            <span>Prazo: {s.prazo_recomendado}</span>
          </div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-muted-foreground shrink-0" />
            <span>Status: {s.status_atual.replace(/_/g, " ")}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
