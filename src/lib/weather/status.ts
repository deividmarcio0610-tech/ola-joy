import type { WeatherCurrent, WeatherHourly, WeatherStatus } from "./types";

export type StatusResult = {
  status: WeatherStatus;
  reasons: string[];
  color: string;
  label: string;
};

const STATUS_META: Record<WeatherStatus, { color: string; label: string }> = {
  NORMAL: { color: "emerald", label: "Normal" },
  ATENCAO: { color: "amber", label: "Atenção" },
  ALERTA: { color: "orange", label: "Alerta" },
  SUSPENSAO: { color: "red", label: "Suspensão" },
  EMERGENCIA: { color: "rose", label: "Emergência" },
  INDISPONIVEL: { color: "slate", label: "Dados indisponíveis" },
};

const STORM_CODES = new Set([95, 96, 99]);

export function evaluateStatus(input: {
  current: WeatherCurrent | null;
  hourly?: WeatherHourly | null;
  fetchedAt: string | null;
  nearestLightningKm?: number | null;
  minutesSinceLastStrike?: number | null;
  lightningEnabled?: boolean;
  lightningRiskScore?: number | null;
}): StatusResult {
  const now = Date.now();
  const fetched = input.fetchedAt ? new Date(input.fetchedAt).getTime() : 0;
  const ageMin = fetched ? (now - fetched) / 60000 : Infinity;

  if (!input.current || ageMin > 15) {
    return {
      status: "INDISPONIVEL",
      reasons: ["Dados meteorológicos indisponíveis ou vencidos (>15 min)."],
      ...STATUS_META.INDISPONIVEL,
    };
  }

  const reasons: string[] = [];
  let level: WeatherStatus = "NORMAL";
  const bump = (target: WeatherStatus, reason: string) => {
    const order: WeatherStatus[] = ["NORMAL", "ATENCAO", "ALERTA", "SUSPENSAO", "EMERGENCIA"];
    if (order.indexOf(target) > order.indexOf(level)) level = target;
    reasons.push(reason);
  };

  const c = input.current;

  // Raios (quando fonte ativa)
  if (input.lightningEnabled && typeof input.nearestLightningKm === "number") {
    if (input.nearestLightningKm <= 10)
      bump("EMERGENCIA", `Raio a ${input.nearestLightningKm.toFixed(1)} km.`);
    else if (input.nearestLightningKm <= 20)
      bump("SUSPENSAO", `Raio a ${input.nearestLightningKm.toFixed(1)} km.`);
    else if (input.nearestLightningKm <= 30)
      bump("ALERTA", `Raio a ${input.nearestLightningKm.toFixed(1)} km.`);
    else bump("ATENCAO", `Raio a ${input.nearestLightningKm.toFixed(1)} km.`);
  }

  // Risco de raios calculado a partir de CAPE/LI (sem provedor de strikes)
  const risk = input.lightningRiskScore ?? null;
  if (risk !== null) {
    if (risk >= 75) bump("ALERTA", `Risco extremo de raios (índice ${risk}).`);
    else if (risk >= 55) bump("ATENCAO", `Risco alto de raios (índice ${risk}).`);
    else if (risk >= 30) bump("ATENCAO", `Risco moderado de raios (índice ${risk}).`);
  }

  if (STORM_CODES.has(c.weather_code))
    bump("ALERTA", "Trovoada em curso segundo modelo Open-Meteo.");

  const gust = c.wind_gusts_10m;
  if (gust >= 90) bump("EMERGENCIA", `Rajadas de ${gust.toFixed(0)} km/h.`);
  else if (gust >= 70) bump("SUSPENSAO", `Rajadas de ${gust.toFixed(0)} km/h.`);
  else if (gust >= 50) bump("ALERTA", `Rajadas de ${gust.toFixed(0)} km/h.`);
  else if (gust >= 40) bump("ATENCAO", `Rajadas de ${gust.toFixed(0)} km/h.`);

  if (c.precipitation >= 25)
    bump("SUSPENSAO", `Chuva intensa (${c.precipitation.toFixed(1)} mm/h).`);
  else if (c.precipitation >= 10)
    bump("ALERTA", `Chuva forte (${c.precipitation.toFixed(1)} mm/h).`);
  else if (c.precipitation >= 2)
    bump("ATENCAO", `Chuva moderada (${c.precipitation.toFixed(1)} mm/h).`);

  // Probabilidade próxima 3h
  if (input.hourly) {
    const idx = input.hourly.time.findIndex((t) => new Date(t).getTime() >= now);
    if (idx >= 0) {
      const window = input.hourly.precipitation_probability.slice(idx, idx + 3);
      const maxProb = window.length ? Math.max(...window) : 0;
      if (maxProb >= 80) bump("ATENCAO", `Probabilidade de chuva ${maxProb}% nas próximas 3h.`);
    }
  }

  return { status: level, reasons, ...STATUS_META[level] };
}

export function statusMeta(status: WeatherStatus) {
  return STATUS_META[status];
}
