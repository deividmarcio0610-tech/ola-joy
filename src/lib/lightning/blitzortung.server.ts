import type { LightningProvider, LightningStrike } from "./types";
import { calculateDistanceKm } from "./distance";

// Decodifica payload LZW usado pelo Blitzortung (compat com o cliente oficial).
function lzwDecode(s: string): string {
  const dict: Record<number, string> = {};
  const data = s.split("");
  let currChar = data[0];
  let oldPhrase = currChar;
  const out: string[] = [currChar];
  let code = 256;
  let phrase: string;
  for (let i = 1; i < data.length; i++) {
    const currCode = data[i].charCodeAt(0);
    if (currCode < 256) phrase = data[i];
    else phrase = dict[currCode] ? dict[currCode] : oldPhrase + currChar;
    out.push(phrase);
    currChar = phrase.charAt(0);
    dict[code] = oldPhrase + currChar;
    code++;
    oldPhrase = phrase;
  }
  return out.join("");
}

type BlitzMsg = {
  time?: number; // nanoseconds since epoch
  lat?: number;
  lon?: number;
  pol?: number;
  mds?: number;
  status?: number;
};

const SERVERS = ["wss://ws1.blitzortung.org/", "wss://ws7.blitzortung.org/", "wss://ws8.blitzortung.org/"];

// Coleta strikes por ~2.5s numa janela ao redor do ponto. Best-effort:
// se o WebSocket não estiver disponível no runtime, retorna [] sem erro.
export class BlitzortungLightningProvider implements LightningProvider {
  name = "blitzortung";

  async healthCheck() {
    if (typeof WebSocket === "undefined") {
      return { ok: false, message: "WebSocket indisponível neste runtime." };
    }
    return { ok: true, message: "Blitzortung ativo (rede comunitária, uso não-comercial)." };
  }

  async fetchRecentStrikes(params: {
    latitude: number;
    longitude: number;
    radiusKm: number;
    minutes: number;
  }): Promise<LightningStrike[]> {
    if (typeof WebSocket === "undefined") return [];
    const { latitude, longitude, radiusKm } = params;

    const strikes: LightningStrike[] = [];
    const now = new Date();

    const collect = (server: string) =>
      new Promise<void>((resolve) => {
        let ws: WebSocket;
        try {
          ws = new WebSocket(server);
        } catch {
          resolve();
          return;
        }
        const done = () => {
          try { ws.close(); } catch { /* ignore */ }
          resolve();
        };
        const timer = setTimeout(done, 2500);
        ws.onopen = () => {
          try {
            // Área geográfica: bbox aproximada ao redor do ponto.
            const dLat = radiusKm / 111;
            const dLon = radiusKm / (111 * Math.cos((latitude * Math.PI) / 180));
            ws.send(JSON.stringify({
              west: longitude - dLon,
              east: longitude + dLon,
              north: latitude + dLat,
              south: latitude - dLat,
            }));
          } catch { /* ignore */ }
        };
        ws.onmessage = (ev: MessageEvent) => {
          try {
            const raw = typeof ev.data === "string" ? ev.data : "";
            if (!raw) return;
            const decoded = lzwDecode(raw);
            const msg = JSON.parse(decoded) as BlitzMsg;
            if (typeof msg.lat !== "number" || typeof msg.lon !== "number" || typeof msg.time !== "number") return;
            const dist = calculateDistanceKm(latitude, longitude, msg.lat, msg.lon);
            if (dist > radiusKm) return;
            const occurredAtMs = Math.floor(msg.time / 1_000_000);
            strikes.push({
              id: `bz-${msg.time}-${msg.lat.toFixed(4)}-${msg.lon.toFixed(4)}`,
              provider: "blitzortung",
              latitude: msg.lat,
              longitude: msg.lon,
              occurredAt: new Date(occurredAtMs).toISOString(),
              receivedAt: now.toISOString(),
              distanceKm: dist,
              type: "unknown",
              polarity: msg.pol === 1 ? "positive" : msg.pol === -1 ? "negative" : "unknown",
              quality: typeof msg.mds === "number" ? Math.min(1, msg.mds / 10000) : 0.7,
            });
          } catch { /* ignore malformed frame */ }
        };
        ws.onerror = () => { clearTimeout(timer); done(); };
        ws.onclose = () => { clearTimeout(timer); resolve(); };
      });

    // Tenta apenas um servidor por request para minimizar latência.
    const server = SERVERS[Math.floor(Math.random() * SERVERS.length)];
    await collect(server);
    return strikes;
  }
}
