import { Card } from "@/components/ui/card";
import type { PipelineDiagnostics } from "@/lib/t4/diagnostics";
import { cn } from "@/lib/utils";

function timeLabel(t: number | null): string {
  return t ? new Date(t).toLocaleTimeString("pt-BR", { hour12: false }) : "—";
}

/** Estado REAL de cada etapa do pipeline (comando §5) — nada de status genérico. */
export function PipelineDiagnosticsCard({ diagnostics }: { diagnostics: PipelineDiagnostics }) {
  const rows: Array<{ label: string; value: string; ok: boolean | null }> = [
    {
      label: "CAPTURE_ACTIVE",
      value: diagnostics.CAPTURE_ACTIVE ? "SIM" : "NÃO",
      ok: diagnostics.CAPTURE_ACTIVE,
    },
    {
      label: "PROFIT_DETECTED",
      value: diagnostics.PROFIT_DETECTED ? "SIM" : "NÃO",
      ok: diagnostics.PROFIT_DETECTED,
    },
    {
      label: "GRAPH_DETECTED",
      value: diagnostics.GRAPH_DETECTED ? "SIM" : "NÃO",
      ok: diagnostics.GRAPH_DETECTED,
    },
    {
      label: "PRICE_AXIS",
      value: diagnostics.PRICE_AXIS ? "CALIBRADO" : "PENDENTE",
      ok: diagnostics.PRICE_AXIS,
    },
    {
      label: "TIME_AXIS",
      value: diagnostics.TIME_AXIS ? "LIDO" : "PENDENTE",
      ok: diagnostics.TIME_AXIS,
    },
    {
      label: "CHART_CLOCK",
      value:
        diagnostics.CHART_CLOCK === "VALID"
          ? "VÁLIDO"
          : diagnostics.CHART_CLOCK === "FALLBACK_REALTIME"
            ? `FALLBACK · ${diagnostics.chartClockReason ?? ""}`
            : "INDISPONÍVEL",
      ok:
        diagnostics.CHART_CLOCK === "VALID"
          ? true
          : diagnostics.CHART_CLOCK === "FALLBACK_REALTIME"
            ? null
            : false,
    },
    {
      label: "CANDLES_VISIBLE",
      value: String(diagnostics.CANDLES_VISIBLE),
      ok: diagnostics.CANDLES_VISIBLE > 0,
    },
    {
      label: "CANDLES_PARSED",
      value: String(diagnostics.CANDLES_PARSED),
      ok: diagnostics.CANDLES_PARSED > 0,
    },
    {
      label: "CANDLES_SENT_TO_T4",
      value: String(diagnostics.CANDLES_SENT_TO_T4),
      ok: diagnostics.CANDLES_SENT_TO_T4 > 0,
    },
    { label: "LAST_FRAME", value: timeLabel(diagnostics.LAST_FRAME), ok: null },
    { label: "LAST_CANDLE", value: timeLabel(diagnostics.LAST_CANDLE), ok: null },
    {
      label: "LATENCY",
      value: diagnostics.LATENCY === null ? "—" : `${diagnostics.LATENCY} ms`,
      ok: null,
    },
    { label: "T4_STATE", value: diagnostics.T4_STATE, ok: null },
    {
      label: "BLOCK_REASON",
      value: diagnostics.BLOCK_REASON ?? "—",
      ok: diagnostics.BLOCK_REASON ? false : null,
    },
    {
      label: "OLLAMA_STATUS",
      value: diagnostics.OLLAMA_STATUS,
      ok: diagnostics.OLLAMA_STATUS.startsWith("ONLINE"),
    },
  ];
  return (
    <Card className="nexus-card gap-2 p-3">
      <p className="nexus-eyebrow">DIAGNÓSTICO DO PIPELINE</p>
      {diagnostics.parseError && (
        <p className="rounded border border-bear/50 bg-bear/10 p-2 text-[11px] text-bear">
          {diagnostics.parseError}
        </p>
      )}
      <div className="grid gap-x-4 gap-y-1 font-mono text-[11px] sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-2">
            <span className="text-muted-foreground">{row.label}</span>
            <span
              className={cn(
                "truncate text-right",
                row.ok === true && "text-bull",
                row.ok === false && "text-bear",
              )}
              title={row.value}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
