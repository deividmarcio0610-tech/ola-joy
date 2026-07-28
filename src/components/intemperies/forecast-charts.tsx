import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, ComposedChart, Bar, Legend } from "recharts";
import type { WeatherHourly, WeatherDaily } from "@/lib/weather/types";
import { WEATHER_CODE_LABEL } from "@/lib/weather/types";

export function HourlyChart({ hourly }: { hourly: WeatherHourly }) {
  const now = Date.now();
  const startIdx = Math.max(0, hourly.time.findIndex((t) => new Date(t).getTime() >= now));
  const slice = 24;
  const data = hourly.time.slice(startIdx, startIdx + slice).map((t, i) => {
    const k = startIdx + i;
    return {
      hour: new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit" }) + "h",
      temp: hourly.temperature_2m[k],
      prob: hourly.precipitation_probability[k],
      chuva: hourly.precipitation[k],
      vento: hourly.wind_speed_10m[k],
    };
  });

  return (
    <div className="rounded-xl border border-border bg-black/30 p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Próximas 24 horas</div>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "#94a3b8" }} />
          <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "#94a3b8" }} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "#94a3b8" }} />
          <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar yAxisId="right" dataKey="prob" name="Prob. chuva %" fill="#3b82f6" opacity={0.4} />
          <Bar yAxisId="left" dataKey="chuva" name="Chuva mm" fill="#0ea5e9" />
          <Line yAxisId="left" dataKey="temp" name="Temp °C" stroke="#f97316" dot={false} strokeWidth={2} />
          <Line yAxisId="left" dataKey="vento" name="Vento km/h" stroke="#10b981" dot={false} strokeWidth={2} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DailyForecast({ daily }: { daily: WeatherDaily }) {
  return (
    <div className="rounded-xl border border-border bg-black/30 p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Próximos 7 dias</div>
      <div className="grid gap-2 sm:grid-cols-7">
        {daily.time.map((t, i) => {
          const d = new Date(t);
          const isStorm = [95, 96, 99].includes(daily.weather_code[i]);
          return (
            <div key={t} className={`rounded-lg border p-2 text-center ${isStorm ? "border-red-500/50 bg-red-500/10" : "border-border bg-black/20"}`}>
              <div className="text-[10px] uppercase text-muted-foreground">
                {d.toLocaleDateString("pt-BR", { weekday: "short" })}
              </div>
              <div className="text-[11px] text-muted-foreground">{d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</div>
              <div className="mt-1 text-sm font-bold text-foreground">
                {daily.temperature_2m_min[i].toFixed(0)}° / {daily.temperature_2m_max[i].toFixed(0)}°
              </div>
              <div className="text-[10px] text-cyan-300">{daily.precipitation_sum[i].toFixed(1)} mm</div>
              <div className="text-[10px] text-blue-300">{daily.precipitation_probability_max[i]}%</div>
              <div className="mt-1 text-[10px] leading-tight text-muted-foreground">{WEATHER_CODE_LABEL[daily.weather_code[i]] ?? "—"}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
