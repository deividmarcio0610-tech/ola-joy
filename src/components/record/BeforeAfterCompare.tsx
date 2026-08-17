import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { BeforeAfterComparison } from "@/lib/analysis-v2";
import { AlertTriangle, CheckCircle2, HelpCircle, MinusCircle } from "lucide-react";

const VERDICT_META: Record<
  BeforeAfterComparison["verdict"],
  { label: string; tone: string; icon: React.ComponentType<{ className?: string }> }
> = {
  validada: {
    label: "Correção validada",
    tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
    icon: CheckCircle2,
  },
  parcial: {
    label: "Correção parcialmente validada",
    tone: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300",
    icon: MinusCircle,
  },
  nao_validada: {
    label: "Correção não validada",
    tone: "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-300",
    icon: AlertTriangle,
  },
  insuficiente: {
    label: "Evidência insuficiente",
    tone: "border-muted-foreground/30 bg-muted text-muted-foreground",
    icon: HelpCircle,
  },
};

export function BeforeAfterCompare({
  comparison,
  simulated,
}: {
  comparison: BeforeAfterComparison | null;
  simulated?: boolean;
}) {
  if (!comparison) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          Adicione uma foto do antes e outra do depois para gerar a comparação.
        </CardContent>
      </Card>
    );
  }

  const meta = VERDICT_META[comparison.verdict];
  const Icon = meta.icon;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        {simulated && (
          <Badge
            variant="outline"
            className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
          >
            Imagem ilustrativa — não constitui evidência de execução.
          </Badge>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={`border ${meta.tone}`}>
            <Icon className="mr-1 h-3 w-3" />
            {meta.label}
          </Badge>
          <Badge variant="secondary">
            Mesmo local: {comparison.mesmo_local_provavel ? "provável" : "duvidoso"}
          </Badge>
          <Badge variant="secondary">
            Risco eliminado: {comparison.risco_eliminado ? "sim" : "não"}
          </Badge>
          {comparison.necessita_nova_acao && <Badge variant="destructive">Requer nova ação</Badge>}
        </div>

        <div>
          <div className="mb-1 text-xs text-muted-foreground">Efetividade da correção</div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold">{comparison.efetividade_pct}%</span>
          </div>
          <Progress value={comparison.efetividade_pct} className="mt-1 h-2" />
        </div>

        {comparison.elementos_alterados.length > 0 && (
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Elementos alterados
            </div>
            <ul className="list-inside list-disc text-sm">
              {comparison.elementos_alterados.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        {comparison.risco_residual && (
          <div className="text-sm">
            <span className="font-semibold">Risco residual: </span>
            <span className="text-muted-foreground">{comparison.risco_residual}</span>
          </div>
        )}
        {comparison.recomendacao_final && (
          <div className="text-sm">
            <span className="font-semibold">Recomendação final: </span>
            <span className="text-muted-foreground">{comparison.recomendacao_final}</span>
          </div>
        )}
        {comparison.observacoes && (
          <p className="text-sm text-muted-foreground">{comparison.observacoes}</p>
        )}
      </CardContent>
    </Card>
  );
}
