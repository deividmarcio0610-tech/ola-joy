import { statusMeta } from "@/lib/weather/status";
import type { WeatherStatus } from "@/lib/weather/types";

export function StatusBadge({ status, reasons }: { status: WeatherStatus; reasons: string[] }) {
  const meta = statusMeta(status);
  return (
    <div className={`rounded-xl border p-4 border-${meta.color}-500/40 bg-${meta.color}-500/10`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Situação operacional
          </div>
          <div className={`text-3xl font-black uppercase tracking-wide text-${meta.color}-300`}>
            {meta.label}
          </div>
        </div>
      </div>
      {reasons.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-foreground/80">
          {reasons.map((r, i) => (
            <li key={i}>• {r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
