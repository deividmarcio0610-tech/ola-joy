import { CloudRain, Thermometer, Droplets, Wind, Gauge, Eye, Sun, Cloud, CloudLightning } from "lucide-react";
import type { WeatherCurrent, WeatherHourly } from "@/lib/weather/types";
import { WEATHER_CODE_LABEL } from "@/lib/weather/types";

type Card = { icon: React.ComponentType<{ className?: string }>; label: string; value: string; sub?: string; tone?: string };

export function WeatherCards({ current, hourly }: { current: WeatherCurrent; hourly: WeatherHourly | null }) {
  const now = Date.now();
  const idx = hourly ? hourly.time.findIndex((t) => new Date(t).getTime() >= now) : -1;
  const nextProb = idx >= 0 ? hourly!.precipitation_probability[idx] : null;
  const uv = idx >= 0 ? hourly!.uv_index[idx] : null;
  const visibility = idx >= 0 ? hourly!.visibility[idx] : null;

  const cards: Card[] = [
    { icon: Thermometer, label: "Temperatura", value: `${current.temperature_2m.toFixed(1)}°C`, sub: `Sensação ${current.apparent_temperature.toFixed(1)}°C` },
    { icon: Droplets, label: "Umidade", value: `${current.relative_humidity_2m}%` },
    { icon: CloudRain, label: "Chuva agora", value: `${current.precipitation.toFixed(1)} mm/h`, sub: nextProb !== null ? `Prob. próx. hora: ${nextProb}%` : undefined, tone: current.precipitation >= 2 ? "text-orange-300" : undefined },
    { icon: Wind, label: "Vento", value: `${current.wind_speed_10m.toFixed(0)} km/h`, sub: `Rajada ${current.wind_gusts_10m.toFixed(0)} km/h · ${current.wind_direction_10m.toFixed(0)}°`, tone: current.wind_gusts_10m >= 50 ? "text-orange-300" : undefined },
    { icon: Gauge, label: "Pressão", value: `${current.pressure_msl.toFixed(0)} hPa` },
    { icon: Cloud, label: "Nebulosidade", value: `${current.cloud_cover}%` },
    { icon: Eye, label: "Visibilidade", value: visibility !== null ? `${(visibility / 1000).toFixed(1)} km` : "—" },
    { icon: Sun, label: "Índice UV", value: uv !== null ? uv.toFixed(1) : "—", tone: uv !== null && uv >= 8 ? "text-orange-300" : undefined },
    { icon: CloudLightning, label: "Condição", value: WEATHER_CODE_LABEL[current.weather_code] ?? `Código ${current.weather_code}`, tone: [95, 96, 99].includes(current.weather_code) ? "text-red-300" : undefined },
  ];

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl border border-border bg-black/30 p-3">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
            <c.icon className="h-3.5 w-3.5" /> {c.label}
          </div>
          <div className={`mt-1 text-2xl font-bold ${c.tone ?? "text-foreground"}`}>{c.value}</div>
          {c.sub && <div className="text-[11px] text-muted-foreground">{c.sub}</div>}
        </div>
      ))}
    </div>
  );
}
