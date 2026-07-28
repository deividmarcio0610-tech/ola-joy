import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { WeatherStatus } from "@/lib/weather/types";

export type WeatherAlertRow = {
  id: string;
  location_id: string | null;
  severity: WeatherStatus;
  title: string;
  message: string | null;
  metadata: Record<string, unknown>;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  resolved_at: string | null;
  expires_at: string | null;
  created_at: string;
  created_by: string;
};

const SEVERITY_ORDER: WeatherStatus[] = [
  "NORMAL",
  "ATENCAO",
  "ALERTA",
  "SUSPENSAO",
  "EMERGENCIA",
  "INDISPONIVEL",
];

function rank(s: WeatherStatus) {
  return SEVERITY_ORDER.indexOf(s);
}

/**
 * Realtime hook: subscreve alterações em weather_alerts do usuário,
 * mantém a lista ativa e expõe funções de reconhecimento/resolução.
 */
export function useWeatherAlerts() {
  const [alerts, setAlerts] = useState<WeatherAlertRow[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user || cancelled) return;

      const { data } = await supabase
        .from("weather_alerts")
        .select("*")
        .is("resolved_at", null)
        .order("created_at", { ascending: false })
        .limit(50);
      if (cancelled) return;
      setAlerts((data as unknown as WeatherAlertRow[]) ?? []);
      setReady(true);
    })();

    const channel = supabase
      .channel("weather_alerts_stream")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "weather_alerts" },
        (payload) => {
          const row = (payload.new ?? payload.old) as WeatherAlertRow;
          if (!row) return;
          setAlerts((prev) => {
            if (payload.eventType === "DELETE") {
              return prev.filter((a) => a.id !== row.id);
            }
            const filtered = prev.filter((a) => a.id !== row.id);
            if ((row as WeatherAlertRow).resolved_at) return filtered;
            return [row as WeatherAlertRow, ...filtered].slice(0, 50);
          });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  const acknowledge = useCallback(async (id: string) => {
    const { data: user } = await supabase.auth.getUser();
    await supabase
      .from("weather_alerts")
      .update({
        acknowledged_at: new Date().toISOString(),
        acknowledged_by: user.user?.id ?? null,
        decision: "acknowledged",
      })
      .eq("id", id);
    setAlerts((prev) =>
      prev.map((a) =>
        a.id === id
          ? {
              ...a,
              acknowledged_at: new Date().toISOString(),
              acknowledged_by: user.user?.id ?? null,
            }
          : a,
      ),
    );
  }, []);

  const resolve = useCallback(async (id: string) => {
    await supabase
      .from("weather_alerts")
      .update({ resolved_at: new Date().toISOString() })
      .eq("id", id);
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  return { alerts, ready, acknowledge, resolve };
}

/**
 * Motor de decisão: dado o status atual + histórico recente, decide se um
 * novo alerta precisa ser criado. Regra: só criam-se alertas ALERTA+.
 * Dedupe por (location, severity) em janela de 30 min.
 */
export function shouldEmitAlert(params: {
  currentStatus: WeatherStatus;
  locationId: string | null;
  existing: WeatherAlertRow[];
  windowMinutes?: number;
}): boolean {
  const { currentStatus, locationId, existing, windowMinutes = 30 } = params;
  if (rank(currentStatus) < rank("ALERTA")) return false;
  const cutoff = Date.now() - windowMinutes * 60_000;
  const dupe = existing.find(
    (a) =>
      a.location_id === locationId &&
      a.severity === currentStatus &&
      new Date(a.created_at).getTime() >= cutoff &&
      !a.resolved_at,
  );
  return !dupe;
}
