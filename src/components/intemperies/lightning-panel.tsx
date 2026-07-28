import { useEffect, useState } from "react";
import { CloudLightning, Zap, ShieldAlert, Activity } from "lucide-react";
import type { WeatherLocation, WeatherCurrent, WeatherHourly } from "@/lib/weather/types";
import { computeLightningRisk } from "@/lib/weather/lightning-risk";

type Strike = {
  id: string;
  latitude: number;
  longitude: number;
  occurredAt: string;
  distanceKm: number;
  bearingDegrees?: number;
};
type LightningResp = { success: boolean; provider: string; enabled: boolean; message?: string; strikes: Strike[] };

function formatDuration(ms: number) {
  if (!isFinite(ms) || ms < 0) return "—";
  const total = Math.floor(ms / 1000);
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export function LightningPanel({
  location,
  current,
  hourly,
}: {
  location: WeatherLocation;
  current?: WeatherCurrent | null;
  hourly?: WeatherHourly | null;
}) {
  const [data, setData] = useState<LightningResp | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/public/lightning/recent?latitude=${location.latitude}&longitude=${location.longitude}&radiusKm=${Math.max(location.warning_radius_km, 50)}&minutes=60`);
        const j = await res.json();
        if (alive) setData(j);
      } catch { /* ignore */ }
    };
    load();
    const id = setInterval(load, 15_000); // tempo real: 15s
    return () => { alive = false; clearInterval(id); };
  }, [location.latitude, location.longitude, location.warning_radius_km]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  void tick;

  const risk = computeLightningRisk({ current: current ?? null, hourly: hourly ?? null });

  const strikes = (data?.strikes ?? []).slice().sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  const now = Date.now();
  const last10 = strikes.filter((s) => now - new Date(s.occurredAt).getTime() < 10 * 60_000).length;
  const last30 = strikes.filter((s) => now - new Date(s.occurredAt).getTime() < 30 * 60_000).length;
  const last60 = strikes.length;
  const nearest = strikes.reduce((min, s) => (s.distanceKm < min ? s.distanceKm : min), Infinity);
  const lastStrike = strikes[0];
  const sinceLastMs = lastStrike ? now - new Date(lastStrike.occurredAt).getTime() : Infinity;

  const zone = data?.enabled
    ? nearest <= 10 ? { color: "rose", label: "EMERGÊNCIA" }
    : nearest <= 20 ? { color: "red", label: "SUSPENSÃO" }
    : nearest <= 30 ? { color: "orange", label: "ALERTA" }
    : nearest <= 50 ? { color: "amber", label: "ATENÇÃO" }
    : { color: "emerald", label: "SEM RAIOS PRÓXIMOS" }
    : null;

  return (
    <div className="space-y-3">
      {/* Análise de risco em tempo real via Open-Meteo — sempre ativa */}
      <div className={`rounded-xl border p-3 border-${risk.color}-500/40 bg-${risk.color}-500/10`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
              <Activity className="h-3 w-3 animate-pulse" /> Análise de raios em tempo real
            </div>
            <div className={`mt-1 text-2xl font-bold text-${risk.color}-300`}>
              {risk.label} <span className="text-sm font-normal text-muted-foreground">· índice {risk.score}/100</span>
            </div>
            {risk.reasons.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-[11px] text-foreground/80">
                {risk.reasons.slice(0, 3).map((r, i) => <li key={i}>• {r}</li>)}
              </ul>
            )}
          </div>
          <Zap className={`h-8 w-8 text-${risk.color}-300`} />
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
          <div className="rounded bg-black/30 p-2">
            <div className="text-muted-foreground">CAPE</div>
            <div className="font-bold text-foreground">{risk.cape !== null ? `${risk.cape.toFixed(0)} J/kg` : "—"}</div>
          </div>
          <div className="rounded bg-black/30 p-2">
            <div className="text-muted-foreground">Lifted Index</div>
            <div className="font-bold text-foreground">{risk.liftedIndex !== null ? risk.liftedIndex.toFixed(1) : "—"}</div>
          </div>
          <div className="rounded bg-black/30 p-2">
            <div className="text-muted-foreground">Prob. 3h</div>
            <div className="font-bold text-foreground">{risk.probNext3h}%</div>
          </div>
        </div>
      </div>

      {!data ? (
        <div className="rounded-xl border border-border bg-black/30 p-3 text-xs text-muted-foreground">Carregando detecção de raios…</div>
      ) : !data.enabled ? (
        <div className="flex items-start gap-2 rounded-xl border border-slate-500/40 bg-slate-500/10 p-3 text-xs text-slate-100">
          <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            <p className="font-semibold">Detecção de descargas físicas não configurada.</p>
            <p className="text-slate-300">
              A análise de risco acima (CAPE/LI) opera em tempo real com dados do Open-Meteo. Para contagem de raios reais, configure LIGHTNING_PROVIDER + LIGHTNING_API_KEY.
            </p>
          </div>
        </div>
      ) : (
        <>
          {zone && (
            <div className={`rounded-xl border p-3 border-${zone.color}-500/40 bg-${zone.color}-500/10`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Descargas detectadas</div>
                  <div className={`text-2xl font-bold text-${zone.color}-300`}>{zone.label}</div>
                </div>
                <Zap className={`h-8 w-8 text-${zone.color}-300`} />
              </div>
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-4">
            <Stat label="Tempo desde o último raio" value={formatDuration(sinceLastMs)} />
            <Stat label="Raio mais próximo" value={isFinite(nearest) ? `${nearest.toFixed(1)} km` : "—"} sub={lastStrike?.bearingDegrees != null ? `${lastStrike.bearingDegrees.toFixed(0)}°` : undefined} />
            <Stat label="Últimos 10 min" value={String(last10)} />
            <Stat label="Últimos 30 / 60 min" value={`${last30} / ${last60}`} />
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-black/30 p-3">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        <CloudLightning className="h-3 w-3" /> {label}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-foreground">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
