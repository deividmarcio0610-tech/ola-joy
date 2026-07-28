import { AlertTriangle, Zap, Wind, CloudRain, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { statusMeta } from "@/lib/weather/status";
import type { WeatherAlertRow } from "@/hooks/use-weather-alerts";
import { useEffect, useState } from "react";

type Props = {
  alert: WeatherAlertRow | null;
  onAcknowledge: (id: string) => void | Promise<void>;
  onResolve: (id: string) => void | Promise<void>;
  onDismiss: () => void;
};

const severityStyles: Record<string, string> = {
  EMERGENCIA: "bg-rose-950/95 border-rose-500 text-rose-50",
  SUSPENSAO: "bg-red-950/95 border-red-500 text-red-50",
  ALERTA: "bg-orange-950/95 border-orange-500 text-orange-50",
};

function pickIcon(severity: string, title: string) {
  const t = title.toLowerCase();
  if (t.includes("raio")) return Zap;
  if (t.includes("vento") || t.includes("rajada")) return Wind;
  if (t.includes("chuva")) return CloudRain;
  return severity === "EMERGENCIA" ? Zap : AlertTriangle;
}

/**
 * Modal fullscreen para alertas críticos (ALERTA/SUSPENSAO/EMERGENCIA).
 * Requer reconhecimento explícito antes de fechar.
 */
export function CriticalAlertModal({ alert, onAcknowledge, onResolve, onDismiss }: Props) {
  const [pulse, setPulse] = useState(true);

  useEffect(() => {
    if (!alert) return;
    // vibração contínua enquanto o modal está aberto (severidade ≥ ALERTA)
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      const pattern =
        alert.severity === "EMERGENCIA"
          ? [400, 120, 400, 120, 800]
          : alert.severity === "SUSPENSAO"
            ? [300, 150, 300]
            : [200, 200, 200];
      navigator.vibrate(pattern);
    }
    setPulse(true);
    const id = window.setInterval(() => setPulse((p) => !p), 700);
    return () => window.clearInterval(id);
  }, [alert]);

  if (!alert) return null;

  const meta = statusMeta(alert.severity);
  const Icon = pickIcon(alert.severity, alert.title);
  const style = severityStyles[alert.severity] ?? severityStyles.ALERTA;
  const acknowledged = !!alert.acknowledged_at;

  return (
    <Dialog open={!!alert} onOpenChange={(open) => !open && onDismiss()}>
      <DialogContent
        className={`max-w-lg border-2 ${style} shadow-[0_0_60px_rgba(255,60,60,0.5)]`}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => !acknowledged && e.preventDefault()}
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div
              className={`rounded-full p-3 transition-all ${
                pulse ? "scale-110 bg-white/20" : "scale-100 bg-white/10"
              }`}
            >
              <Icon className="h-8 w-8" />
            </div>
            <div className="flex-1">
              <div className="text-[10px] font-black uppercase tracking-widest opacity-80">
                {meta.label}
              </div>
              <div className="text-xl font-black leading-tight">{alert.title}</div>
              <div className="mt-1 text-[11px] opacity-70">
                Emitido {new Date(alert.created_at).toLocaleTimeString("pt-BR")}
              </div>
            </div>
          </div>

          {alert.message && (
            <div className="rounded-lg border border-white/20 bg-black/30 p-3 text-sm leading-relaxed">
              {alert.message}
            </div>
          )}

          <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 p-3 text-xs">
            <div className="font-bold text-amber-200 mb-1">Ação operacional recomendada</div>
            <ul className="list-disc space-y-1 pl-4 text-amber-100/90">
              {alert.severity === "EMERGENCIA" && (
                <>
                  <li>Interromper todas as atividades ao ar livre imediatamente.</li>
                  <li>Recolher equipe em abrigo estruturado.</li>
                  <li>Só retomar 30 min após o último raio próximo.</li>
                </>
              )}
              {alert.severity === "SUSPENSAO" && (
                <>
                  <li>Suspender operações críticas expostas.</li>
                  <li>Notificar liderança da área.</li>
                  <li>Reavaliar em 15 min.</li>
                </>
              )}
              {alert.severity === "ALERTA" && (
                <>
                  <li>Reavaliar plano de trabalho ao ar livre.</li>
                  <li>Monitorar evolução das próximas 3h.</li>
                </>
              )}
            </ul>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            {!acknowledged ? (
              <Button
                className="flex-1 bg-white text-black hover:bg-white/90 font-bold"
                onClick={() => onAcknowledge(alert.id)}
              >
                <Check className="mr-1 h-4 w-4" /> Reconhecer ciência
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  className="flex-1 border-white/40 bg-white/10 text-white hover:bg-white/20"
                  onClick={onDismiss}
                >
                  Manter em vigilância
                </Button>
                <Button
                  className="flex-1 bg-emerald-500 text-white hover:bg-emerald-600"
                  onClick={() => onResolve(alert.id)}
                >
                  <X className="mr-1 h-4 w-4" /> Encerrar alerta
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
