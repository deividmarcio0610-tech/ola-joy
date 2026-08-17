import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AnalysisV2, StatusHistoryEntry } from "@/lib/analysis-v2";
import { ExecutiveSummaryCard } from "./ExecutiveSummaryCard";
import { ClassificationEditor } from "./ClassificationEditor";
import { ApprovalScoreCard } from "./ApprovalScoreCard";
import { ActionPlan5W2H } from "./ActionPlan5W2H";
import { BeforeAfterCompare } from "./BeforeAfterCompare";
import { GainBreakdown } from "./GainBreakdown";
import { StatusTimeline } from "./StatusTimeline";

export function AnalysisTabs({
  analysis,
  onChange,
  history,
  disabled,
  extras,
}: {
  analysis: AnalysisV2;
  onChange: (a: AnalysisV2) => void;
  history: StatusHistoryEntry[];
  disabled?: boolean;
  /** Slot para renderizar o bloco "Detalhes" da UI existente (legado). */
  extras?: React.ReactNode;
}) {
  return (
    <Tabs defaultValue="resumo" className="w-full">
      <TabsList className="flex w-full flex-wrap gap-1 overflow-x-auto">
        <TabsTrigger value="resumo">Resumo</TabsTrigger>
        <TabsTrigger value="classificacao">Classificação</TabsTrigger>
        <TabsTrigger value="aprovacao">Aprovação</TabsTrigger>
        <TabsTrigger value="riscos">Riscos</TabsTrigger>
        <TabsTrigger value="plano">Plano 5W2H</TabsTrigger>
        <TabsTrigger value="antes_depois">Antes/Depois</TabsTrigger>
        <TabsTrigger value="parecer">Parecer</TabsTrigger>
        <TabsTrigger value="ganhos">Ganhos</TabsTrigger>
        <TabsTrigger value="historico">Histórico</TabsTrigger>
        {extras && <TabsTrigger value="detalhes">Detalhes</TabsTrigger>}
      </TabsList>

      <TabsContent value="resumo" className="mt-3">
        <ExecutiveSummaryCard analysis={analysis} />
      </TabsContent>

      <TabsContent value="classificacao" className="mt-3">
        <ClassificationEditor
          analysis={analysis}
          disabled={disabled}
          onChange={(next) => {
            const summary = next.summary_type
              ? {
                  ...analysis.summary,
                  tipo_registro: next.summary_type,
                  classificacao_sugerida: next.principal_label,
                }
              : analysis.summary;
            onChange({
              ...analysis,
              classification: {
                principal: next.principal,
                principal_label: next.principal_label,
                secundarias: next.secundarias,
                confianca: next.confianca,
                justificativa: next.justificativa,
                criterios_atendidos: next.criterios_atendidos,
                criterios_nao_atendidos: next.criterios_nao_atendidos,
              },
              summary,
            });
          }}
        />
      </TabsContent>

      <TabsContent value="aprovacao" className="mt-3">
        <ApprovalScoreCard analysis={analysis} />
      </TabsContent>

      <TabsContent value="riscos" className="mt-3 space-y-3">
        <Card>
          <CardContent className="space-y-3 p-4">
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Riscos identificados
              </div>
              {analysis.risks.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum risco relevante identificado.
                </p>
              ) : (
                <ul className="list-inside list-disc text-sm">
                  {analysis.risks.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}
            </div>
            {analysis.hazards.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Perigos / consequências
                </div>
                <div className="flex flex-wrap gap-2">
                  {analysis.hazards.map((h, i) => (
                    <Badge key={i} variant="secondary">
                      {h}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Ação imediata
              </div>
              <p className="text-sm">{analysis.immediate_action || "—"}</p>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="plano" className="mt-3">
        <ActionPlan5W2H
          plan={analysis.action_plan}
          disabled={disabled}
          onChange={(p) => onChange({ ...analysis, action_plan: p })}
        />
      </TabsContent>

      <TabsContent value="antes_depois" className="mt-3">
        <BeforeAfterCompare
          comparison={analysis.before_after}
          simulated={analysis.is_simulated_image}
        />
      </TabsContent>

      <TabsContent value="parecer" className="mt-3">
        <Card>
          <CardContent className="space-y-3 p-4 text-sm">
            <Section title="Contexto" body={analysis.technical_opinion.contexto} />
            <Section
              title="Evidência observada"
              body={analysis.technical_opinion.evidencia_observada}
            />
            <Section
              title="Risco identificado"
              body={analysis.technical_opinion.risco_identificado}
            />
            <Section
              title="Consequências possíveis"
              body={analysis.technical_opinion.consequencias_possiveis}
            />
            <Section
              title="Requisitos aplicáveis"
              body={analysis.technical_opinion.requisitos_aplicaveis}
            />
            <Section title="Ação imediata" body={analysis.technical_opinion.acao_imediata} />
            <Section
              title="Recomendação definitiva"
              body={analysis.technical_opinion.recomendacao_definitiva}
            />
            <Section title="Risco residual" body={analysis.technical_opinion.risco_residual} />
            <Section title="Conclusão" body={analysis.technical_opinion.conclusao} />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="ganhos" className="mt-3">
        <GainBreakdown gains={analysis.gains} />
      </TabsContent>

      <TabsContent value="historico" className="mt-3">
        <StatusTimeline entries={history} />
      </TabsContent>

      {extras && (
        <TabsContent value="detalhes" className="mt-3">
          {extras}
        </TabsContent>
      )}
    </Tabs>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  if (!body) return null;
  return (
    <div>
      <div className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <p className="whitespace-pre-line">{body}</p>
    </div>
  );
}
