import type { LightningProvider, LightningStrike } from "./types";

// OpenWeather não fornece coordenadas de descargas individuais.
// Usamos o Current Weather API para detectar condições de trovoada
// (códigos 200-232) e emitir um indicador de tempestade próximo.
export class OpenWeatherLightningProvider implements LightningProvider {
  name = "openweather";

  private get apiKey() {
    return process.env.OPENWEATHER_API_KEY || "";
  }

  async healthCheck() {
    if (!this.apiKey) {
      return { ok: false, message: "OPENWEATHER_API_KEY ausente." };
    }
    return {
      ok: true,
      message:
        "OpenWeather ativo. Detecta trovoadas via códigos meteorológicos (200-232); não fornece coordenadas exatas de descargas.",
    };
  }

  async fetchRecentStrikes(params: {
    latitude: number;
    longitude: number;
    radiusKm: number;
    minutes: number;
  }): Promise<LightningStrike[]> {
    if (!this.apiKey) return [];

    const { latitude, longitude, radiusKm } = params;
    // Amostragem em cruz: centro + 4 pontos ao redor até o raio de alerta.
    const offsets: Array<[number, number]> = [
      [0, 0],
      [radiusKm * 0.6, 0],
      [-radiusKm * 0.6, 0],
      [0, radiusKm * 0.6],
      [0, -radiusKm * 0.6],
    ];

    const strikes: LightningStrike[] = [];
    const now = new Date();

    await Promise.all(
      offsets.map(async ([dLatKm, dLonKm]) => {
        const dLat = dLatKm / 111;
        const dLon = dLonKm / (111 * Math.cos((latitude * Math.PI) / 180));
        const lat = latitude + dLat;
        const lon = longitude + dLon;
        try {
          const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${this.apiKey}&units=metric`;
          const res = await fetch(url);
          if (!res.ok) return;
          const data = (await res.json()) as {
            weather?: Array<{ id: number; main: string; description: string }>;
            dt?: number;
            name?: string;
          };
          const storm = data.weather?.find((w) => w.id >= 200 && w.id <= 232);
          if (storm) {
            const severity = storm.id === 202 || storm.id === 212 || storm.id === 221 || storm.id === 232 ? "severe" : "storm";
            strikes.push({
              id: `ow-${lat.toFixed(3)}-${lon.toFixed(3)}-${data.dt ?? Date.now()}`,
              provider: "openweather",
              latitude: lat,
              longitude: lon,
              occurredAt: new Date((data.dt ?? Math.floor(now.getTime() / 1000)) * 1000).toISOString(),
              receivedAt: now.toISOString(),
              distanceKm: 0,
              type: severity === "severe" ? "cloud_ground" : "unknown",
              polarity: "unknown",
              quality: severity === "severe" ? 0.9 : 0.6,
            });
          }
        } catch {
          // ignora falha pontual
        }
      }),
    );

    return strikes;
  }
}
