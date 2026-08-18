import { Card } from "@/components/ui/card";
import type { T4Metrics } from "@/lib/t4/validation/metrics";
import { cn } from "@/lib/utils";

/**
 * CURVAS DA VALIDAÇÃO — equity, drawdown e distribuição de R.
 *
 * SVG puro com viewBox: escala com o container, não depende de biblioteca de
 * gráfico e não inventa ponto nenhum — cada vértice é um trade real.
 */

export function EquityCurve({ metrics }: { metrics: T4Metrics }) {
  const points = metrics.equityCurve;
  return (
    <Card className="border-border/70 bg-panel p-3">
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] font-medium tracking-widest text-muted-foreground">
          CURVA DE CAPITAL (R ACUMULADO)
        </p>
        <span
          className={cn(
            "font-mono text-xs font-bold",
            metrics.totalR > 0
              ? "text-bull"
              : metrics.totalR < 0
                ? "text-bear"
                : "text-muted-foreground",
          )}
        >
          {metrics.totalR.toFixed(2)}R
        </span>
      </div>
      {points.length < 2 ? (
        <EmptyChart />
      ) : (
        <LineChart
          values={points.map((point) => point.cumulativeR)}
          color={metrics.totalR >= 0 ? "var(--color-bull, #22c55e)" : "var(--color-bear, #ef4444)"}
          zeroLine
        />
      )}
    </Card>
  );
}

export function DrawdownCurve({ metrics }: { metrics: T4Metrics }) {
  const points = metrics.drawdownCurve;
  return (
    <Card className="border-border/70 bg-panel p-3">
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] font-medium tracking-widest text-muted-foreground">
          CURVA DE DRAWDOWN (R)
        </p>
        <span className="font-mono text-xs font-bold text-bear">
          −{metrics.maxDrawdownR.toFixed(2)}R
        </span>
      </div>
      {points.length < 2 ? (
        <EmptyChart />
      ) : (
        <LineChart
          values={points.map((point) => -Math.abs(point.drawdownR))}
          color="var(--color-bear, #ef4444)"
          zeroLine
          fill
        />
      )}
    </Card>
  );
}

export function RDistribution({ metrics }: { metrics: T4Metrics }) {
  const buckets = metrics.rDistribution;
  const max = Math.max(1, ...buckets.map((bucket) => bucket.count));
  return (
    <Card className="border-border/70 bg-panel p-3">
      <p className="text-[10px] font-medium tracking-widest text-muted-foreground">
        DISTRIBUIÇÃO DE R
      </p>
      {buckets.length === 0 ? (
        <EmptyChart />
      ) : (
        <div className="mt-2 flex items-end gap-1" style={{ height: 96 }}>
          {buckets.map((bucket) => {
            const negative = bucket.bucket.trim().startsWith("-");
            return (
              <div key={bucket.bucket} className="flex flex-1 flex-col items-center gap-1">
                <span className="font-mono text-[9px] text-muted-foreground">{bucket.count}</span>
                <div
                  className={cn("w-full rounded-t", negative ? "bg-bear/70" : "bg-bull/70")}
                  style={{ height: `${(bucket.count / max) * 70}px` }}
                />
                <span className="font-mono text-[8px] text-muted-foreground">{bucket.bucket}</span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export function MfeMaePanel({ metrics }: { metrics: T4Metrics }) {
  return (
    <Card className="border-border/70 bg-panel p-3">
      <p className="text-[10px] font-medium tracking-widest text-muted-foreground">MFE / MAE</p>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 font-mono text-xs">
        <Field
          label="MFE MÉDIO"
          value={metrics.avgMfeR === null ? "—" : `${metrics.avgMfeR.toFixed(2)}R`}
          tone="bull"
        />
        <Field
          label="MAE MÉDIO"
          value={metrics.avgMaeR === null ? "—" : `${metrics.avgMaeR.toFixed(2)}R`}
          tone="bear"
        />
        <Field label="GANHOS SEGUIDOS" value={String(metrics.maxConsecutiveWins)} />
        <Field label="PERDAS SEGUIDAS" value={String(metrics.maxConsecutiveLosses)} />
        <Field
          label="FATOR RECUPERAÇÃO"
          value={
            metrics.recoveryFactor === null ? "INDISPONÍVEL" : metrics.recoveryFactor.toFixed(2)
          }
        />
        <Field label="R MÉDIO" value={metrics.trades ? `${metrics.avgR.toFixed(3)}R` : "—"} />
      </dl>
      {metrics.ratiosUnavailableReason && (
        <p className="mt-2 text-[10px] text-muted-foreground">{metrics.ratiosUnavailableReason}</p>
      )}
    </Card>
  );
}

function Field({ label, value, tone }: { label: string; value: string; tone?: "bull" | "bear" }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-[9px] tracking-widest text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          value === "INDISPONÍVEL" ? "text-[9px] text-muted-foreground" : "font-semibold",
          value !== "INDISPONÍVEL" && tone === "bull" && "text-bull",
          value !== "INDISPONÍVEL" && tone === "bear" && "text-bear",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function EmptyChart() {
  return (
    <p className="py-8 text-center text-[11px] text-muted-foreground">
      AGUARDANDO DADOS SUFICIENTES para desenhar a curva.
    </p>
  );
}

function LineChart({
  values,
  color,
  zeroLine,
  fill,
}: {
  values: number[];
  color: string;
  zeroLine?: boolean;
  fill?: boolean;
}) {
  const width = 600;
  const height = 120;
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const x = (index: number) => (index / Math.max(1, values.length - 1)) * width;
  const y = (value: number) => height - ((value - min) / span) * height;
  const path = values
    .map((value, index) => `${index === 0 ? "M" : "L"}${x(index)},${y(value)}`)
    .join(" ");
  const area = `${path} L${width},${y(0)} L0,${y(0)} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="mt-2 h-24 w-full"
      role="img"
      aria-label="Curva da validação"
    >
      {zeroLine && (
        <line
          x1={0}
          y1={y(0)}
          x2={width}
          y2={y(0)}
          stroke="currentColor"
          className="text-border"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      )}
      {fill && <path d={area} fill={color} fillOpacity={0.18} />}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  );
}
