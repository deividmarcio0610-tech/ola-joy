import type { WeatherCurrent, WeatherHourly } from "./types";

export type LightningRisk = {
  score: number; // 0-100
  level: "MUITO_BAIXO" | "BAIXO" | "MODERADO" | "ALTO" | "EXTREMO";
  label: string;
  color: string;
  cape: number | null;
  liftedIndex: number | null;
  stormNow: boolean;
  probNext3h: number;
  reasons: string[];
};

const LEVELS: Record<LightningRisk["level"], { label: string; color: string }> = {
  MUITO_BAIXO: { label: "Muito baixo", color: "emerald" },
  BAIXO: { label: "Baixo", color: "emerald" },
  MODERADO: { label: "Moderado", color: "amber" },
  ALTO: { label: "Alto", color: "orange" },
  EXTREMO: { label: "Extremo", color: "red" },
};

/**
 * Análise de risco de raios em tempo real baseada em variáveis do Open-Meteo:
 * - CAPE (Convective Available Potential Energy, J/kg)
 * - Lifted Index (quanto mais negativo, mais instável)
 * - Weather code (95/96/99 = trovoada em curso)
 * - Probabilidade de precipitação próximas 3h
 */
export function computeLightningRisk(input: {
  current: WeatherCurrent | null;
  hourly: WeatherHourly | null;
}): LightningRisk {
  const now = Date.now();
  const h = input.hourly;
  let idx = -1;
  if (h) idx = h.time.findIndex((t) => new Date(t).getTime() >= now);
  const cape = h?.cape && idx >= 0 ? (h.cape[idx] ?? null) : null;
  const li = h?.lifted_index && idx >= 0 ? (h.lifted_index[idx] ?? null) : null;
  const stormNow = input.current ? [95, 96, 99].includes(input.current.weather_code) : false;

  const probs = h && idx >= 0 ? h.precipitation_probability.slice(idx, idx + 3) : [];
  const probNext3h = probs.length ? Math.max(...probs) : 0;

  const reasons: string[] = [];
  let score = 0;

  if (stormNow) {
    score += 60;
    reasons.push("Trovoada em curso (modelo Open-Meteo).");
  }
  if (cape !== null) {
    if (cape >= 2500) {
      score += 40;
      reasons.push(`CAPE muito alta (${cape.toFixed(0)} J/kg).`);
    } else if (cape >= 1500) {
      score += 28;
      reasons.push(`CAPE alta (${cape.toFixed(0)} J/kg).`);
    } else if (cape >= 800) {
      score += 16;
      reasons.push(`CAPE moderada (${cape.toFixed(0)} J/kg).`);
    } else if (cape >= 300) {
      score += 6;
      reasons.push(`CAPE fraca (${cape.toFixed(0)} J/kg).`);
    }
  }
  if (li !== null) {
    if (li <= -6) {
      score += 20;
      reasons.push(`Lifted Index ${li.toFixed(1)} (instabilidade extrema).`);
    } else if (li <= -3) {
      score += 12;
      reasons.push(`Lifted Index ${li.toFixed(1)} (instabilidade forte).`);
    } else if (li <= 0) {
      score += 5;
      reasons.push(`Lifted Index ${li.toFixed(1)} (instabilidade leve).`);
    }
  }
  if (probNext3h >= 80) {
    score += 10;
    reasons.push(`Prob. de chuva ${probNext3h}% nas próximas 3h.`);
  } else if (probNext3h >= 60) {
    score += 5;
  }

  if (score > 100) score = 100;

  const level: LightningRisk["level"] =
    score >= 75
      ? "EXTREMO"
      : score >= 55
        ? "ALTO"
        : score >= 30
          ? "MODERADO"
          : score >= 10
            ? "BAIXO"
            : "MUITO_BAIXO";

  return {
    score,
    level,
    label: LEVELS[level].label,
    color: LEVELS[level].color,
    cape,
    liftedIndex: li,
    stormNow,
    probNext3h,
    reasons,
  };
}
