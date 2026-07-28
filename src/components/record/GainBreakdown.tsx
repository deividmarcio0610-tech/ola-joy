import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { GainBreakdown as GainType } from "@/lib/analysis-v2";

function fmt(n: number | null, kind: "money" | "hours") {
  if (n == null) return "—";
  if (kind === "money") {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
  }
  return `${n}h`;
}

export function GainBreakdown({ gains }: { gains: GainType }) {
  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        {!gains.dados_suficientes_financeiro && (
          <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">
            Dados insuficientes para estimar o ganho financeiro
          </Badge>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Row title="Redução de risco" desc={gains.reducao_risco.descricao} />
          <Row title="Tempo economizado" desc={gains.tempo_economizado.descricao} value={fmt(gains.tempo_economizado.horas, "hours")} />
          <Row title="Custo evitado" desc={gains.custo_evitado.descricao} value={fmt(gains.custo_evitado.valor, "money")} />
          <Row title="Melhoria operacional" desc={gains.melhoria_operacional} />
          <Row title="Redução de retrabalho" desc={gains.reducao_retrabalho} />
          <Row title="Redução de exposição" desc={gains.reducao_exposicao} />
          <Row title="Ganho ambiental" desc={gains.ganho_ambiental} />
          <Row title="Ganho de produtividade" desc={gains.ganho_produtividade} />
        </div>

        {gains.memoria_calculo.length > 0 && (
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Memória de cálculo
            </div>
            <ul className="list-inside list-disc text-sm">
              {gains.memoria_calculo.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ title, desc, value }: { title: string; desc: string; value?: string }) {
  return (
    <div className="rounded-lg border p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </span>
        {value && <span className="text-sm font-semibold">{value}</span>}
      </div>
      <p className="mt-1 text-sm">{desc || "—"}</p>
    </div>
  );
}
