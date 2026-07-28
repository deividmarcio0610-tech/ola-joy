import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { CloudLightning, RefreshCw, Loader2, BellRing, BellOff } from "lucide-react";
import { ModuleShell } from "@/components/module-shell";
import { Button } from "@/components/ui/button";

import { supabase } from "@/integrations/supabase/client";

import type { WeatherLocation, WeatherResponse } from "@/lib/weather/types";
import { evaluateStatus, statusMeta } from "@/lib/weather/status";
import { LegalDisclaimer } from "@/components/intemperies/legal-disclaimer";
import { StatusBadge } from "@/components/intemperies/status-badge";
import { WeatherCards } from "@/components/intemperies/weather-cards";
import { HourlyChart, DailyForecast } from "@/components/intemperies/forecast-charts";
import { LocationsManager } from "@/components/intemperies/locations-manager";
import { LightningPanel } from "@/components/intemperies/lightning-panel";
import { HistoryList } from "@/components/intemperies/history-list";
import { useWeatherNotifier } from "@/hooks/use-weather-notifier";
import { computeLightningRisk } from "@/lib/weather/lightning-risk";
import { EnablePushButton } from "@/components/push/enable-push-button";
import { Link } from "@tanstack/react-router";
import { useWeatherAlerts, shouldEmitAlert, type WeatherAlertRow } from "@/hooks/use-weather-alerts";
import { CriticalAlertModal } from "@/components/intemperies/critical-alert-modal";
import { AlertList } from "@/components/intemperies/alert-list";


function IntemperiesPage() {
  const [location, setLocation] = useState<WeatherLocation | null>(null);
  const [weather, setWeather] = useState<WeatherResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [staleWarning, setStaleWarning] = useState<string | null>(null);
  const [geoState, setGeoState] = useState<"idle" | "requesting" | "denied" | "unsupported">("idle");
  const snapshotSaved = useRef<string | null>(null);
  const notifier = useWeatherNotifier();
  const lastStatusRef = useRef<string | null>(null);
  const lastReasonsRef = useRef<string>("");
  const { alerts, acknowledge, resolve } = useWeatherAlerts();
  const [criticalOpen, setCriticalOpen] = useState<WeatherAlertRow | null>(null);

  // Dedupe / anti-thrash no cliente.
  const abortRef = useRef<AbortController | null>(null);
  const lastFetchAtRef = useRef<number>(0);
  const MIN_INTERVAL_MS = 45_000; // não bate no backend com menos de 45s entre chamadas

  const refresh = async (loc: WeatherLocation, opts: { force?: boolean } = {}) => {
    // Anti-thrash: se acabou de buscar, ignora.
    if (!opts.force && Date.now() - lastFetchAtRef.current < MIN_INTERVAL_MS) return;

    // Cancela request anterior em voo.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const res = await fetch(
        `/api/public/weather/current?latitude=${loc.latitude}&longitude=${loc.longitude}`,
        { signal: controller.signal },
      );
      const data: WeatherResponse & { rateLimited?: boolean } = await res.json();

      if (!data.success) {
        // Mantém o último dado válido; só mostra aviso amigável.
        setStaleWarning(
          data.error ||
            "Serviço meteorológico temporariamente indisponível. Última leitura preservada.",
        );
        return;
      }

      lastFetchAtRef.current = Date.now();
      setWeather(data);
      setStaleWarning(data.stale ? data.staleReason ?? null : null);

      // Não persiste snapshot quando é dado antigo (stale) — evita duplicar histórico.
      const isPersisted = loc.id && loc.id !== "current";
      if (!data.stale && isPersisted && snapshotSaved.current !== data.fetchedAt) {
        snapshotSaved.current = data.fetchedAt;
        const { data: user } = await supabase.auth.getUser();
        await supabase.from("weather_snapshots").insert({
          location_id: loc.id,
          latitude: loc.latitude,
          longitude: loc.longitude,
          provider: "open-meteo",
          status: "ok",
          normalized: data as never,
          fetched_at: data.fetchedAt,
          created_by: user.user?.id ?? null,
        });
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      // Silencioso: não bloqueia o app; mantém último dado.
      if (import.meta.env.DEV) console.warn("[weather] refresh error", e);
      setStaleWarning("Falha temporária ao consultar o clima. Última leitura preservada.");
    } finally {
      setLoading(false);
    }
  };


  const buildCurrentLocation = (lat: number, lon: number): WeatherLocation => ({
    id: "current",
    name: "Minha localização",
    contract: null,
    unit: null,
    latitude: lat,
    longitude: lon,
    lightning_radius_km: 15,
    warning_radius_km: 30,
    responsible_name: null,
    responsible_phone: null,
    responsible_email: null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "America/Sao_Paulo",
    is_primary: false,
    enabled: true,
    created_by: "",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // Fallback: São Paulo — Brasil (usado se o usuário negar GPS).
  const FALLBACK_LAT = -23.5505;
  const FALLBACK_LON = -46.6333;

  const requestGeolocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoState("unsupported");
      setLocation({ ...buildCurrentLocation(FALLBACK_LAT, FALLBACK_LON), name: "Localização padrão (São Paulo)" });
      return;
    }
    setGeoState("requesting");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation(buildCurrentLocation(pos.coords.latitude, pos.coords.longitude));
        setGeoState("idle");
      },
      () => {
        // Sem alertas, sem botão: cai no fallback silenciosamente.
        setGeoState("denied");
        setLocation({ ...buildCurrentLocation(FALLBACK_LAT, FALLBACK_LON), name: "Localização padrão (São Paulo)" });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60_000 },
    );
  };

  // Auto: ao abrir, tenta pegar local salvo (primário), depois GPS, depois fallback.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) {
        requestGeolocation();
        return;
      }
      const { data: locs } = await supabase
        .from("weather_locations")
        .select("*")
        .eq("enabled", true)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(1);
      if (cancelled) return;
      if (locs && locs.length > 0) {
        setLocation(locs[0] as unknown as WeatherLocation);
      } else {
        requestGeolocation();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-ativar notificações silenciosamente quando permissão já concedida.
  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "granted" && !notifier.enabled) {
      notifier.enable();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  useEffect(() => {
    if (!location) return;
    refresh(location, { force: true });
    // Polling menos agressivo (2min). O backend faz cache de 90s e serve stale em caso de 429.
    const id = setInterval(() => refresh(location), 120_000);
    return () => {
      clearInterval(id);
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location?.id]);


  const risk = useMemo(
    () => (weather ? computeLightningRisk({ current: weather.current, hourly: weather.hourly }) : null),
    [weather],
  );

  const status = useMemo(
    () =>
      evaluateStatus({
        current: weather?.current ?? null,
        hourly: weather?.hourly ?? null,
        fetchedAt: weather?.fetchedAt ?? null,
        lightningEnabled: false,
        lightningRiskScore: risk?.score ?? null,
      }),
    [weather, risk],
  );

  // Notifica mudanças de clima: som + vibração + notificação do sistema
  useEffect(() => {
    if (!location || !weather) return;
    const meta = statusMeta(status.status);
    const reasonsStr = status.reasons.join(" | ");
    const prev = lastStatusRef.current;
    const prevReasons = lastReasonsRef.current;
    if (prev === null) {
      lastStatusRef.current = status.status;
      lastReasonsRef.current = reasonsStr;
      return;
    }
    const changed = prev !== status.status || (status.status !== "NORMAL" && prevReasons !== reasonsStr);
    if (changed) {
      const severity: "info" | "warn" | "critical" =
        status.status === "EMERGENCIA" || status.status === "SUSPENSAO"
          ? "critical"
          : status.status === "ALERTA" || status.status === "ATENCAO"
            ? "warn"
            : "info";
      notifier.notify({
        title: `Clima: ${meta.label} — ${location.name}`,
        body: status.reasons[0] ?? "Condições atualizadas.",
        severity,
        tag: `weather-${location.id}`,
      });
    }
    lastStatusRef.current = status.status;
    lastReasonsRef.current = reasonsStr;
  }, [status.status, status.reasons, weather, location, notifier]);

  // Motor de alertas: persiste no banco quando status escala para ALERTA+
  // e abre modal crítico automaticamente para SUSPENSAO/EMERGENCIA.
  useEffect(() => {
    if (!location || !weather) return;
    if (!["ALERTA", "SUSPENSAO", "EMERGENCIA"].includes(status.status)) return;
    const isPersisted = location.id && location.id !== "current";
    if (!isPersisted) return; // GPS efêmero: apenas notificação, sem persistir
    if (!shouldEmitAlert({ currentStatus: status.status, locationId: location.id, existing: alerts })) return;

    (async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;
      await supabase.from("weather_alerts").insert({
        location_id: location.id,
        severity: status.status,
        title: `${statusMeta(status.status).label} — ${location.name}`,
        message: status.reasons.join(" · "),
        metadata: { reasons: status.reasons, risk_score: risk?.score ?? null } as never,
        created_by: user.user.id,
      });
    })();
  }, [status.status, location, weather, alerts, risk]);

  // Abre modal crítico automaticamente para o alerta ativo mais grave e não reconhecido
  useEffect(() => {
    if (criticalOpen) return;
    const critical = alerts.find(
      (a) => !a.acknowledged_at && (a.severity === "EMERGENCIA" || a.severity === "SUSPENSAO"),
    );
    if (critical) setCriticalOpen(critical);
  }, [alerts, criticalOpen]);



  return (
    <ModuleShell
      icon={CloudLightning}
      title="Intempéries — Central de Monitoramento"
      subtitle="Clima, chuva, vento, tempestades e raios com apoio à decisão operacional."
      status="operacional"
    >
      <div className="space-y-3 p-3 sm:p-4">
        <LegalDisclaimer />

        {!location ? (
          <div className="rounded-xl border border-border bg-black/30 p-6 text-center text-sm text-muted-foreground">
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Iniciando monitoramento automático…
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                  Local monitorado
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-300">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> AO VIVO
                  </span>
                </div>
                <div className="text-lg font-bold text-foreground">{location.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
                  {weather && (
                    <>
                      {" · última leitura "}
                      {new Date(weather.fetchedAt).toLocaleTimeString("pt-BR")}
                      {weather.stale && (
                        <span className="ml-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">
                          CACHE
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={notifier.enabled ? "default" : "outline"}
                  onClick={() => (notifier.enabled ? notifier.disable() : notifier.enable())}
                  title="Ativa notificação do sistema, som e vibração ao mudar o clima"
                >
                  {notifier.enabled ? (
                    <BellRing className="mr-1 h-3.5 w-3.5" />
                  ) : (
                    <BellOff className="mr-1 h-3.5 w-3.5" />
                  )}
                  {notifier.enabled ? "Alertas ON" : "Ativar alertas"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => refresh(location, { force: true })} disabled={loading}>
                  {loading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
                  Atualizar
                </Button>
              </div>
            </div>
            {staleWarning && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200">
                {staleWarning}
              </div>
            )}


            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <div className="text-xs text-amber-200">
                <div className="font-bold">Alertas de raios no telefone (Push)</div>
                <div className="text-[11px] text-amber-200/80">
                  Funciona com o app fechado. Requer HTTPS + permissão de notificação. <Link to="/intemperies/notificacoes" className="underline">Diagnóstico</Link>
                </div>
              </div>
              <EnablePushButton compact />
            </div>

            <StatusBadge status={status.status} reasons={status.reasons} />

            <AlertList
              alerts={alerts}
              onAcknowledge={acknowledge}
              onResolve={resolve}
              onOpen={(a) => setCriticalOpen(a)}
            />

            {weather?.current && <WeatherCards current={weather.current} hourly={weather.hourly ?? null} />}

            <LightningPanel location={location} current={weather?.current ?? null} hourly={weather?.hourly ?? null} />

            {weather?.hourly && <HourlyChart hourly={weather.hourly} />}
            {weather?.daily && <DailyForecast daily={weather.daily} />}

            <LocationsManager selectedId={location?.id ?? null} onSelect={setLocation} />

            <HistoryList locationId={location?.id ?? null} />
          </div>
        )}

      </div>
      <CriticalAlertModal
        alert={criticalOpen}
        onAcknowledge={acknowledge}
        onResolve={async (id) => {
          await resolve(id);
          setCriticalOpen(null);
        }}
        onDismiss={() => setCriticalOpen(null)}
      />
    </ModuleShell>
  );
}


export const Route = createFileRoute("/_authenticated/intemperies")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Intempéries · Central Meteorológica · VALETECH" },
      {
        name: "description",
        content:
          "Central operacional de intempéries: clima, chuva, vento, trovoadas e raios com apoio à decisão de segurança do trabalho.",
      },
    ],
  }),
  component: IntemperiesPage,
});
