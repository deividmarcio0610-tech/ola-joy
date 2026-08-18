import { AlertTriangle } from "lucide-react";

import { Card } from "@/components/ui/card";
import type { SegmentationResult } from "@/lib/t4/validation/segmentation";
import type { ThresholdAnalysis } from "@/lib/t4/validation/threshold";
import type {
  AblationResult,
  CriterionContribution,
  DegradationReport,
} from "@/lib/t4/validation/contribution";
import { cn } from "@/lib/utils";

/**
 * TABELAS SEGMENTADAS.
 *
 * Todo recorte com amostra pequena aparece marcado — a linha existe, mas a
 * interface avisa que ela não sustenta conclusão. Esconder o recorte seria
 * pior: o operador não saberia que a técnica nunca operou naquela faixa.
 */

export function SegmentTable({ result, title }: { result: SegmentationResult; title: string }) {
  return (
    <Card className="border-border/70 bg-panel p-3">
      <p className="text-[10px] font-medium tracking-widest text-muted-foreground">{title}</p>
      {result.segments.length === 0 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Nenhum trade executado neste recorte.
        </p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full font-mono text-[11px]">
            <thead>
              <tr className="border-b border-border/50 text-left text-muted-foreground">
                <th className="py-1 pr-3">SEGMENTO</th>
                <th className="py-1 pr-3 text-right">TRADES</th>
                <th className="py-1 pr-3 text-right">ACERTO</th>
                <th className="py-1 pr-3 text-right">R MÉDIO</th>
                <th className="py-1 pr-3 text-right">EXPECT.</th>
                <th className="py-1 pr-3 text-right">PF</th>
                <th className="py-1 text-right">DD</th>
              </tr>
            </thead>
            <tbody>
              {result.segments.map((segment) => (
                <tr
                  key={segment.key}
                  className={cn("border-b border-border/30", !segment.reliable && "opacity-60")}
                  title={segment.note ?? undefined}
                >
                  <td className="py-1 pr-3">
                    {segment.label}
                    {!segment.reliable && (
                      <AlertTriangle
                        className="ml-1 inline h-3 w-3 text-warn"
                        aria-label="amostra insuficiente"
                      />
                    )}
                  </td>
                  <td className="py-1 pr-3 text-right">{segment.trades}</td>
                  <td className="py-1 pr-3 text-right">{segment.metrics.winRate.toFixed(1)}%</td>
                  <td
                    className={cn(
                      "py-1 pr-3 text-right",
                      segment.metrics.avgR > 0
                        ? "text-bull"
                        : segment.metrics.avgR < 0
                          ? "text-bear"
                          : "",
                    )}
                  >
                    {segment.metrics.avgR.toFixed(3)}
                  </td>
                  <td
                    className={cn(
                      "py-1 pr-3 text-right",
                      segment.metrics.expectancy > 0
                        ? "text-bull"
                        : segment.metrics.expectancy < 0
                          ? "text-bear"
                          : "",
                    )}
                  >
                    {segment.metrics.expectancy.toFixed(3)}
                  </td>
                  <td className="py-1 pr-3 text-right">
                    {segment.metrics.profitFactor === null
                      ? "—"
                      : segment.metrics.profitFactor.toFixed(2)}
                  </td>
                  <td className="py-1 text-right">{segment.metrics.maxDrawdownR.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {result.emptyKeys.length > 0 && (
        <p className="mt-2 text-[10px] text-muted-foreground">
          Sem nenhum trade em: {result.emptyKeys.join(", ")}.
        </p>
      )}
      {result.segments.some((segment) => !segment.reliable) && (
        <p className="mt-1 flex items-center gap-1 text-[10px] text-warn">
          <AlertTriangle className="h-3 w-3" /> Linhas marcadas têm amostra pequena demais para
          sustentar conclusão.
        </p>
      )}
    </Card>
  );
}

export function ThresholdPanel({ analysis }: { analysis: ThresholdAnalysis }) {
  return (
    <Card className="border-border/70 bg-panel p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[10px] font-medium tracking-widest text-muted-foreground">
          LIMIAR DE CONFLUÊNCIA (MEDIDO, NÃO APLICADO)
        </p>
        <span className="font-mono text-[11px] text-muted-foreground">
          estabilidade {Math.round(analysis.stability)}/100
        </span>
      </div>

      {analysis.bestThreshold === null ? (
        <p className="mt-2 text-[11px] text-warn">{analysis.note}</p>
      ) : (
        <p className="mt-2 font-mono text-sm">
          melhor corte histórico:{" "}
          <span className="font-bold text-primary">{analysis.bestThreshold}%</span>{" "}
          <span className="text-muted-foreground">
            (expectativa {analysis.bestExpectancy!.toFixed(3)}R)
          </span>
        </p>
      )}

      {analysis.points.length > 0 && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full font-mono text-[11px]">
            <thead>
              <tr className="border-b border-border/50 text-left text-muted-foreground">
                <th className="py-1 pr-3">CORTE</th>
                <th className="py-1 pr-3 text-right">TRADES</th>
                <th className="py-1 pr-3 text-right">ACERTO</th>
                <th className="py-1 pr-3 text-right">EXPECT.</th>
                <th className="py-1 pr-3 text-right">TOTAL R</th>
                <th className="py-1 text-right">DD</th>
              </tr>
            </thead>
            <tbody>
              {analysis.points.map((point) => (
                <tr
                  key={point.threshold}
                  className={cn(
                    "border-b border-border/30",
                    !point.reliable && "opacity-60",
                    point.threshold === analysis.bestThreshold && "bg-primary/10",
                  )}
                >
                  <td className="py-1 pr-3">≥ {point.threshold}%</td>
                  <td className="py-1 pr-3 text-right">{point.trades}</td>
                  <td className="py-1 pr-3 text-right">{point.winRate.toFixed(1)}%</td>
                  <td
                    className={cn(
                      "py-1 pr-3 text-right",
                      point.expectancy > 0 ? "text-bull" : point.expectancy < 0 ? "text-bear" : "",
                    )}
                  >
                    {point.expectancy.toFixed(3)}
                  </td>
                  <td className="py-1 pr-3 text-right">{point.totalR.toFixed(2)}</td>
                  <td className="py-1 text-right">{point.maxDrawdownR.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {analysis.overfittingAlerts.length > 0 && (
        <div className="mt-2 rounded border border-warn/50 bg-warn/5 p-2">
          <p className="flex items-center gap-1 text-[10px] tracking-widest text-warn">
            <AlertTriangle className="h-3 w-3" /> ALERTA DE SOBREAJUSTE
          </p>
          <ul className="mt-1 flex flex-col gap-0.5 text-[11px] text-muted-foreground">
            {analysis.overfittingAlerts.map((alert) => (
              <li key={alert}>— {alert}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-2 text-[10px] text-muted-foreground">{analysis.note}</p>
    </Card>
  );
}

export function ContributionTable({ rows }: { rows: CriterionContribution[] }) {
  return (
    <Card className="border-border/70 bg-panel p-3">
      <p className="text-[10px] font-medium tracking-widest text-muted-foreground">
        MATRIZ DE CONTRIBUIÇÃO DOS CRITÉRIOS
      </p>
      {rows.length === 0 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">Sem trades para comparar.</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full font-mono text-[11px]">
            <thead>
              <tr className="border-b border-border/50 text-left text-muted-foreground">
                <th className="py-1 pr-3">CRITÉRIO</th>
                <th className="py-1 pr-3 text-right">PESO</th>
                <th className="py-1 pr-3 text-right">COM</th>
                <th className="py-1 pr-3 text-right">SEM</th>
                <th className="py-1 pr-3 text-right">EXP. COM</th>
                <th className="py-1 pr-3 text-right">EXP. SEM</th>
                <th className="py-1 text-right">Δ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className={cn("border-b border-border/30", !row.reliable && "opacity-60")}
                  title={row.note ?? undefined}
                >
                  <td className="py-1 pr-3">
                    {row.label}
                    {!row.reliable && <AlertTriangle className="ml-1 inline h-3 w-3 text-warn" />}
                  </td>
                  <td className="py-1 pr-3 text-right">{row.weight}</td>
                  <td className="py-1 pr-3 text-right">{row.withCount}</td>
                  <td className="py-1 pr-3 text-right">{row.withoutCount}</td>
                  <td className="py-1 pr-3 text-right">
                    {row.withExpectancy === null ? "—" : row.withExpectancy.toFixed(3)}
                  </td>
                  <td className="py-1 pr-3 text-right">
                    {row.withoutExpectancy === null ? "—" : row.withoutExpectancy.toFixed(3)}
                  </td>
                  <td
                    className={cn(
                      "py-1 text-right",
                      row.delta !== null && row.delta > 0 && "text-bull",
                      row.delta !== null && row.delta < 0 && "text-bear",
                    )}
                  >
                    {row.delta === null ? "—" : row.delta.toFixed(3)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

const ABLATION_TONE: Record<AblationResult["verdict"], string> = {
  CRITICO: "text-bull",
  UTIL: "text-primary",
  NEUTRO: "text-muted-foreground",
  PREJUDICIAL: "text-bear",
  INDISPONIVEL: "text-muted-foreground",
};

export function AblationTable({ rows }: { rows: AblationResult[] }) {
  return (
    <Card className="border-border/70 bg-panel p-3">
      <p className="text-[10px] font-medium tracking-widest text-muted-foreground">
        TESTE DE ABLAÇÃO
      </p>
      {rows.length === 0 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">Sem trades para ablacionar.</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full font-mono text-[11px]">
            <thead>
              <tr className="border-b border-border/50 text-left text-muted-foreground">
                <th className="py-1 pr-3">SEM O CRITÉRIO</th>
                <th className="py-1 pr-3 text-right">TRADES</th>
                <th className="py-1 pr-3 text-right">EXP. ANTES</th>
                <th className="py-1 pr-3 text-right">EXP. DEPOIS</th>
                <th className="py-1 pr-3 text-right">Δ</th>
                <th className="py-1">VEREDITO</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.removedCriterionId}
                  className="border-b border-border/30"
                  title={row.note}
                >
                  <td className="py-1 pr-3">{row.label}</td>
                  <td className="py-1 pr-3 text-right">{row.tradesAfter}</td>
                  <td className="py-1 pr-3 text-right">{row.expectancyBefore.toFixed(3)}</td>
                  <td className="py-1 pr-3 text-right">
                    {row.expectancyAfter === null ? "—" : row.expectancyAfter.toFixed(3)}
                  </td>
                  <td className="py-1 pr-3 text-right">
                    {row.deltaExpectancy === null ? "—" : row.deltaExpectancy.toFixed(3)}
                  </td>
                  <td className={cn("py-1", ABLATION_TONE[row.verdict])}>{row.verdict}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-[10px] text-muted-foreground">
        Mede o efeito sobre a amostra existente. Trades que teriam NASCIDO sem a exigência não podem
        ser simulados sem reprocessar a série.
      </p>
    </Card>
  );
}

export function DegradationPanel({ report }: { report: DegradationReport }) {
  return (
    <Card
      className={cn(
        "border p-3",
        report.degrading ? "border-warn/60 bg-warn/5" : "border-border/70 bg-panel",
      )}
    >
      <p className="text-[10px] font-medium tracking-widest text-muted-foreground">
        DEGRADAÇÃO 30 / 60 / 90 DIAS
      </p>
      {report.windows.length === 0 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">{report.note}</p>
      ) : (
        <>
          <div className="mt-2 grid grid-cols-3 gap-2 font-mono text-[11px]">
            {report.windows.map((window) => (
              <div
                key={window.days}
                className={cn(
                  "rounded border border-border/50 p-2",
                  !window.reliable && "opacity-60",
                )}
              >
                <p className="text-[9px] tracking-widest text-muted-foreground">
                  {window.days} DIAS
                </p>
                <p className="mt-0.5">{window.trades} trades</p>
                <p
                  className={cn(
                    window.expectancy !== null && window.expectancy > 0 && "text-bull",
                    window.expectancy !== null && window.expectancy < 0 && "text-bear",
                  )}
                >
                  {window.expectancy === null ? "—" : `${window.expectancy.toFixed(3)}R`}
                </p>
              </div>
            ))}
          </div>
          <p
            className={cn(
              "mt-2 text-[11px]",
              report.degrading ? "text-warn" : "text-muted-foreground",
            )}
          >
            {report.note}
          </p>
        </>
      )}
    </Card>
  );
}
