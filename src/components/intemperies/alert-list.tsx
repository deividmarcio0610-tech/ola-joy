import { AlertTriangle, Check, X, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WeatherAlertRow } from "@/hooks/use-weather-alerts";
import { statusMeta } from "@/lib/weather/status";

type Props = {
  alerts: WeatherAlertRow[];
  onAcknowledge: (id: string) => void | Promise<void>;
  onResolve: (id: string) => void | Promise<void>;
  onOpen: (a: WeatherAlertRow) => void;
};

const severityBadge: Record<string, string> = {
  EMERGENCIA: "border-rose-500 bg-rose-500/20 text-rose-200",
  SUSPENSAO: "border-red-500 bg-red-500/15 text-red-200",
  ALERTA: "border-orange-500 bg-orange-500/15 text-orange-200",
  ATENCAO: "border-amber-500 bg-amber-500/10 text-amber-200",
};

export function AlertList({ alerts, onAcknowledge, onResolve, onOpen }: Props) {
  if (alerts.length === 0) {
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-200">
        Sem alertas ativos. Monitorando em tempo real.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        <AlertTriangle className="h-3.5 w-3.5" /> Alertas ativos ({alerts.length})
      </div>
      {alerts.map((a) => {
        const meta = statusMeta(a.severity);
        const cls = severityBadge[a.severity] ?? "border-slate-500 bg-slate-500/10 text-slate-200";
        const acked = !!a.acknowledged_at;
        return (
          <div
            key={a.id}
            className={`rounded-lg border p-3 text-xs ${cls} cursor-pointer transition hover:brightness-125`}
            onClick={() => onOpen(a)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="rounded border border-current/40 bg-black/30 px-1.5 py-0.5 text-[9px] font-black">
                    {meta.label.toUpperCase()}
                  </span>
                  {acked && (
                    <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-200">
                      RECONHECIDO
                    </span>
                  )}
                </div>
                <div className="mt-1 font-bold text-foreground truncate">{a.title}</div>
                {a.message && <div className="text-[11px] opacity-80 line-clamp-2">{a.message}</div>}
                <div className="mt-1 flex items-center gap-1 text-[10px] opacity-70">
                  <Clock className="h-3 w-3" />
                  {new Date(a.created_at).toLocaleTimeString("pt-BR")}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                {!acked ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[10px]"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAcknowledge(a.id);
                    }}
                  >
                    <Check className="mr-0.5 h-3 w-3" /> OK
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[10px]"
                    onClick={(e) => {
                      e.stopPropagation();
                      onResolve(a.id);
                    }}
                  >
                    <X className="mr-0.5 h-3 w-3" /> Encerrar
                  </Button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
