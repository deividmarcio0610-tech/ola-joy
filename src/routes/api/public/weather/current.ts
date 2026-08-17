import { createFileRoute } from "@tanstack/react-router";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Cache em memória por (lat,lon) arredondados a 3 casas (~110m).
 * Compartilhado entre requisições concorrentes no mesmo worker.
 * - freshMs: enquanto isso, respondemos direto do cache sem tocar no provedor.
 * - staleMs: quando o provedor falhar (429/5xx/timeout) devolvemos o último payload válido
 *   marcado como stale, até esse limite.
 */
type CacheEntry = {
  key: string;
  fetchedAt: number;
  payload: unknown;
};
const CACHE = new Map<string, CacheEntry>();
const IN_FLIGHT = new Map<string, Promise<unknown>>();
const RATE_LIMIT_UNTIL = new Map<string, number>();

const FRESH_MS = 90_000; // 90s: dedup e cache "fresco"
const STALE_MS = 30 * 60_000; // 30min: janela de fallback com dado antigo
// A rota é pública e a chave vem de lat/lon arbitrários: sem teto, um cliente
// enumerando coordenadas faz o Map crescer até estourar a memória do processo.
const MAX_CACHE_ENTRIES = 500;

function rememberPayload(key: string, payload: unknown) {
  const now = Date.now();
  // Descarta o que já passou da janela stale — não serve nem como fallback.
  for (const [k, entry] of CACHE) {
    if (now - entry.fetchedAt > STALE_MS) CACHE.delete(k);
  }
  // Ainda cheio: remove as entradas mais antigas (Map preserva ordem de inserção).
  while (CACHE.size >= MAX_CACHE_ENTRIES) {
    const oldest = CACHE.keys().next();
    if (oldest.done) break;
    CACHE.delete(oldest.value);
  }
  CACHE.delete(key); // reinsere no fim para que a ordem reflita o uso recente
  CACHE.set(key, { key, fetchedAt: now, payload });
}

// Marca erros de entrada para responder 400 em vez de 502 (falha do provedor).
class BadRequestError extends Error {}

function cacheKey(lat: number, lon: number) {
  return `${lat.toFixed(3)}:${lon.toFixed(3)}`;
}

async function fetchWithTimeout(url: string, timeoutMs = 12000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
  } finally {
    clearTimeout(timer);
  }
}

function parseRetryAfter(h: string | null): number | null {
  if (!h) return null;
  const n = Number(h);
  if (Number.isFinite(n)) return Math.max(0, n * 1000);
  const t = Date.parse(h);
  if (!Number.isNaN(t)) return Math.max(0, t - Date.now());
  return null;
}

async function fetchOpenMeteo(latitude: number, longitude: number): Promise<unknown> {
  const key = cacheKey(latitude, longitude);
  const bannedUntil = RATE_LIMIT_UNTIL.get("global") ?? 0;
  if (Date.now() < bannedUntil) {
    throw new Error("RATE_LIMITED");
  }

  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    timezone: "auto",
    forecast_days: "7",
    current: [
      "temperature_2m",
      "relative_humidity_2m",
      "apparent_temperature",
      "is_day",
      "precipitation",
      "rain",
      "showers",
      "weather_code",
      "cloud_cover",
      "pressure_msl",
      "surface_pressure",
      "wind_speed_10m",
      "wind_direction_10m",
      "wind_gusts_10m",
    ].join(","),
    hourly: [
      "temperature_2m",
      "relative_humidity_2m",
      "apparent_temperature",
      "precipitation_probability",
      "precipitation",
      "rain",
      "showers",
      "weather_code",
      "cloud_cover",
      "visibility",
      "wind_speed_10m",
      "wind_direction_10m",
      "wind_gusts_10m",
      "uv_index",
      "cape",
      "lifted_index",
    ].join(","),
    models: "best_match",
    daily: [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "apparent_temperature_max",
      "apparent_temperature_min",
      "sunrise",
      "sunset",
      "uv_index_max",
      "precipitation_sum",
      "rain_sum",
      "showers_sum",
      "precipitation_probability_max",
      "wind_speed_10m_max",
      "wind_gusts_10m_max",
    ].join(","),
  });

  const base = process.env.OPEN_METEO_BASE_URL || "https://api.open-meteo.com";
  const endpoint = `${base}/v1/forecast?${params}`;

  // Retry com backoff exponencial (1s, 3s, 7s). 429 respeita Retry-After.
  const delays = [0, 1000, 3000, 7000];
  let lastErr: unknown = null;
  for (let i = 0; i < delays.length; i++) {
    if (delays[i]) await new Promise((r) => setTimeout(r, delays[i]));
    try {
      const res = await fetchWithTimeout(endpoint);
      if (res.status === 429) {
        const wait = parseRetryAfter(res.headers.get("retry-after")) ?? 60_000;
        RATE_LIMIT_UNTIL.set("global", Date.now() + wait);
        // Não vale a pena continuar tentando dentro do mesmo request.
        throw new Error("RATE_LIMITED");
      }
      if (!res.ok) {
        lastErr = new Error(`Open-Meteo HTTP ${res.status}`);
        if (res.status >= 500) continue;
        throw lastErr;
      }
      const json = await res.json();
      rememberPayload(key, json);
      return json;
    } catch (e) {
      lastErr = e;
      if (e instanceof Error && e.message === "RATE_LIMITED") break;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Open-Meteo indisponível");
}

function buildResponsePayload(
  latitude: number,
  longitude: number,
  data: {
    timezone?: string;
    current?: unknown;
    current_units?: unknown;
    hourly?: unknown;
    hourly_units?: unknown;
    daily?: unknown;
    daily_units?: unknown;
  },
  meta: { fetchedAt: string; responseMs: number; stale?: boolean; staleReason?: string },
) {
  return {
    success: true,
    provider: "open-meteo",
    fetchedAt: meta.fetchedAt,
    responseMs: meta.responseMs,
    stale: meta.stale ?? false,
    staleReason: meta.staleReason,
    location: { latitude, longitude, timezone: data.timezone },
    current: data.current,
    currentUnits: data.current_units,
    hourly: data.hourly,
    hourlyUnits: data.hourly_units,
    daily: data.daily,
    dailyUnits: data.daily_units,
  };
}

export const Route = createFileRoute("/api/public/weather/current")({
  server: {
    handlers: {
      OPTIONS: async () => new Response("ok", { headers: cors }),
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const latitude = Number(url.searchParams.get("latitude"));
          const longitude = Number(url.searchParams.get("longitude"));
          if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)
            throw new BadRequestError("latitude inválida");
          if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)
            throw new BadRequestError("longitude inválida");

          const key = cacheKey(latitude, longitude);
          const cached = CACHE.get(key);
          const now = Date.now();

          // 1) Cache fresco → responde direto.
          if (cached && now - cached.fetchedAt < FRESH_MS) {
            const data = cached.payload as Record<string, unknown>;
            const payload = buildResponsePayload(latitude, longitude, data, {
              fetchedAt: new Date(cached.fetchedAt).toISOString(),
              responseMs: 0,
            });
            return new Response(JSON.stringify(payload), {
              status: 200,
              headers: {
                ...cors,
                "Content-Type": "application/json",
                "Cache-Control": "public, max-age=30",
              },
            });
          }

          // 2) Dedupe: se já há requisição em voo para essa chave, espera ela.
          let promise = IN_FLIGHT.get(key);
          if (!promise) {
            promise = fetchOpenMeteo(latitude, longitude).finally(() => IN_FLIGHT.delete(key));
            IN_FLIGHT.set(key, promise);
          }

          const started = Date.now();
          try {
            const data = (await promise) as Record<string, unknown>;
            const payload = buildResponsePayload(latitude, longitude, data, {
              fetchedAt: new Date().toISOString(),
              responseMs: Date.now() - started,
            });
            return new Response(JSON.stringify(payload), {
              status: 200,
              headers: {
                ...cors,
                "Content-Type": "application/json",
                "Cache-Control": "public, max-age=30",
              },
            });
          } catch (err) {
            // 3) Falhou o provedor. Se temos dado antigo dentro da janela stale, servimos com aviso.
            if (cached && now - cached.fetchedAt < STALE_MS) {
              const data = cached.payload as Record<string, unknown>;
              const isRate = err instanceof Error && err.message === "RATE_LIMITED";
              const payload = buildResponsePayload(latitude, longitude, data, {
                fetchedAt: new Date(cached.fetchedAt).toISOString(),
                responseMs: Date.now() - started,
                stale: true,
                staleReason: isRate
                  ? "O serviço meteorológico atingiu temporariamente o limite de consultas. Os últimos dados válidos continuam disponíveis. Nova tentativa será realizada automaticamente."
                  : "Falha temporária no provedor meteorológico. Exibindo últimos dados válidos.",
              });
              return new Response(JSON.stringify(payload), {
                status: 200,
                headers: {
                  ...cors,
                  "Content-Type": "application/json",
                  "Cache-Control": "no-store",
                },
              });
            }
            throw err;
          }
        } catch (err) {
          const isRate = err instanceof Error && err.message === "RATE_LIMITED";
          const isBadRequest = err instanceof BadRequestError;
          return new Response(
            JSON.stringify({
              success: false,
              provider: "open-meteo",
              error: isRate
                ? "O serviço meteorológico atingiu temporariamente o limite de consultas. Os últimos dados válidos continuam disponíveis. Nova tentativa será realizada automaticamente."
                : err instanceof Error
                  ? err.message
                  : "Erro desconhecido",
              rateLimited: isRate,
              fetchedAt: new Date().toISOString(),
            }),
            {
              status: isRate ? 429 : isBadRequest ? 400 : 502,
              headers: { ...cors, "Content-Type": "application/json" },
            },
          );
        }
      },
    },
  },
});
