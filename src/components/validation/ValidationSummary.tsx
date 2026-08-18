import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { RobustnessReport } from "@/lib/t4/validation/robustness";
import type { T4Metrics } from "@/lib/t4/validation/metrics";
import { SPLIT_LABEL } from "@/lib/t4/validation/datasets";
import { cn } from "@/lib/utils";

/**
 * CABEÇALHO DO PAINEL VALIDAÇÃO T4.
 *
 * Duas escalas separadas e rotuladas: a CONFLUÊNCIA vive nos trades e mede
 * setup confirmado; a ROBUSTEZ mede a qualidade da validação. Nenhuma das
 * duas é apresentada como chance de lucro — a legenda diz isso na tela, não
 * só no código.
 */

const STATUS_TONE: Record<string, string> = {
  VALIDACAO_ESTATISTICA_POSITIVA: "border-bull text-bull",
  VALIDACAO_ESTATISTICA_NEGATIVA: "border-bear text-bear",
  FORWARD: "border-primary text-primary",
  OOS: "border-primary text-primary",
  BACKTEST: "border-warn text-warn",
  NAO_TESTADA: "border-border text-muted-foreground",
  AGUARDANDO_DADOS_SUFICIENTES: "border-warn text-warn",
};

export function ValidationSummary({
  report,
  version,
  configHash,
}: {
  report: RobustnessReport;
  version: string;
  configHash: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Card className="border-border/70 bg-panel p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-mono text-[10px]">
              {version}
            </Badge>
            <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground">
              {configHash}
            </Badge>
            <Badge
              variant="outline"
              className={cn("font-mono text-[11px]", STATUS_TONE[report.status])}
            >
              {report.statusLabel}
            </Badge>
          </div>
          <div className="text-right">
            <p className="text-[9px] tracking-widest text-muted-foreground">
              ROBUSTEZ / EVIDÊNCIA ESTATÍSTICA
            </p>
            <p className="font-mono text-2xl font-bold text-foreground">
              {report.score.toFixed(1)}
              <span className="text-sm text-muted-foreground">/100</span>
            </p>
          </div>
        </div>
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{report.headline}</p>
      </Card>

      {/* Decomposição — a nota nunca é um número solto. */}
      <Card className="border-border/70 bg-panel p-3">
        <p className="text-[10px] font-medium tracking-widest text-muted-foreground">
          COMPOSIÇÃO DA ROBUSTEZ
        </p>
        <div className="mt-2 flex flex-col gap-2">
          {report.components.map((component) => (
            <div key={component.id}>
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className={cn(
                    "text-[11px]",
                    component.unavailable ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {component.label}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {component.points.toFixed(1)} / {component.maxPoints}
                </span>
              </div>
              <div className="mt-0.5 h-1 w-full overflow-hidden rounded bg-muted">
                <div
                  className={cn(
                    "h-full",
                    component.unavailable ? "bg-muted-foreground/40" : "bg-primary",
                  )}
                  style={{ width: `${(component.points / component.maxPoints) * 100}%` }}
                />
              </div>
              <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
                {component.reason}
              </p>
            </div>
          ))}
        </div>
      </Card>

      {report.limitations.length > 0 && (
        <Card className="border-warn/50 bg-warn/5 p-3">
          <p className="text-[10px] font-medium tracking-widest text-warn">LIMITAÇÕES REAIS</p>
          <ul className="mt-1 flex flex-col gap-1 text-[11px] text-muted-foreground">
            {report.limitations.map((item) => (
              <li key={item}>— {item}</li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/** Comparação TRAIN × OOS × FORWARD lado a lado. */
export function SplitComparison({ report }: { report: RobustnessReport }) {
  const columns: Array<{ key: string; label: string; metrics: T4Metrics }> = [
    { key: "TRAIN", label: SPLIT_LABEL.TRAIN, metrics: report.metrics.train },
    { key: "OUT_OF_SAMPLE", label: SPLIT_LABEL.OUT_OF_SAMPLE, metrics: report.metrics.outOfSample },
    { key: "FORWARD", label: SPLIT_LABEL.FORWARD, metrics: report.metrics.forward },
  ];

  return (
    <Card className="border-border/70 bg-panel p-3">
      <p className="text-[10px] font-medium tracking-widest text-muted-foreground">
        TREINO × OUT-OF-SAMPLE × FORWARD
      </p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full font-mono text-[11px]">
          <thead>
            <tr className="border-b border-border/50 text-left text-muted-foreground">
              <th className="py-1 pr-3">MÉTRICA</th>
              {columns.map((column) => (
                <th key={column.key} className="py-1 pr-3 text-right">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <MetricRow label="TRADES" columns={columns} pick={(m) => String(m.trades)} />
            <MetricRow
              label="ACERTO"
              columns={columns}
              pick={(m) => (m.trades ? `${m.winRate.toFixed(1)}%` : "—")}
            />
            <MetricRow
              label="EXPECTATIVA (R)"
              columns={columns}
              pick={(m) => (m.trades ? m.expectancy.toFixed(3) : "—")}
              tone
            />
            <MetricRow
              label="PROFIT FACTOR"
              columns={columns}
              pick={(m) => (m.profitFactor === null ? "INDISPONÍVEL" : m.profitFactor.toFixed(2))}
            />
            <MetricRow
              label="PAYOFF"
              columns={columns}
              pick={(m) => (m.payoff === null ? "INDISPONÍVEL" : m.payoff.toFixed(2))}
            />
            <MetricRow
              label="RESULTADO (R)"
              columns={columns}
              pick={(m) => (m.trades ? m.totalR.toFixed(2) : "—")}
              tone
            />
            <MetricRow
              label="DRAWDOWN (R)"
              columns={columns}
              pick={(m) => (m.trades ? m.maxDrawdownR.toFixed(2) : "—")}
            />
            <MetricRow
              label="MFE MÉDIO (R)"
              columns={columns}
              pick={(m) => (m.avgMfeR === null ? "—" : m.avgMfeR.toFixed(2))}
            />
            <MetricRow
              label="MAE MÉDIO (R)"
              columns={columns}
              pick={(m) => (m.avgMaeR === null ? "—" : m.avgMaeR.toFixed(2))}
            />
            <MetricRow
              label="SHARPE"
              columns={columns}
              pick={(m) => (m.sharpe === null ? "INDISPONÍVEL" : m.sharpe.toFixed(2))}
            />
            <MetricRow
              label="SORTINO"
              columns={columns}
              pick={(m) => (m.sortino === null ? "INDISPONÍVEL" : m.sortino.toFixed(2))}
            />
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        INDISPONÍVEL significa que a matemática não sustenta a métrica nesta amostra — não é zero
        nem valor omitido.
      </p>
    </Card>
  );
}

function MetricRow({
  label,
  columns,
  pick,
  tone,
}: {
  label: string;
  columns: Array<{ key: string; label: string; metrics: T4Metrics }>;
  pick: (metrics: T4Metrics) => string;
  tone?: boolean;
}) {
  return (
    <tr className="border-b border-border/30">
      <td className="py-1 pr-3 text-muted-foreground">{label}</td>
      {columns.map((column) => {
        const value = pick(column.metrics);
        const numeric = Number(value);
        return (
          <td
            key={column.key}
            className={cn(
              "py-1 pr-3 text-right",
              tone && Number.isFinite(numeric) && numeric > 0 && "text-bull",
              tone && Number.isFinite(numeric) && numeric < 0 && "text-bear",
              value === "INDISPONÍVEL" && "text-[9px] text-muted-foreground",
            )}
          >
            {value}
          </td>
        );
      })}
    </tr>
  );
}
