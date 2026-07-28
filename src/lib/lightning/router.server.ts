import type { LightningProvider, LightningStrike } from "./types";
import { OpenWeatherLightningProvider } from "./openweather.server";
import { BlitzortungLightningProvider } from "./blitzortung.server";

class DisabledProvider implements LightningProvider {
  name = "disabled";
  async fetchRecentStrikes() {
    return [];
  }
  async healthCheck() {
    return { ok: false, message: "Fonte de raios não configurada. Painel meteorológico continua ativo." };
  }
}

// Compõe múltiplos provedores em paralelo. Mescla resultados e deduplica
// strikes muito próximos no espaço e tempo (mesmo evento capturado por
// fontes diferentes).
class MultiLightningProvider implements LightningProvider {
  name: string;
  constructor(private providers: LightningProvider[]) {
    this.name = providers.map((p) => p.name).join("+");
  }
  async healthCheck() {
    const results = await Promise.all(this.providers.map((p) => p.healthCheck().catch(() => ({ ok: false, message: "erro" }))));
    const ok = results.some((r) => r.ok);
    const message = results.map((r, i) => `${this.providers[i].name}: ${r.message}`).join(" | ");
    return { ok, message };
  }
  async fetchRecentStrikes(params: { latitude: number; longitude: number; radiusKm: number; minutes: number }) {
    const settled = await Promise.allSettled(this.providers.map((p) => p.fetchRecentStrikes(params)));
    const all: LightningStrike[] = [];
    for (const r of settled) if (r.status === "fulfilled") all.push(...r.value);
    // Dedup: mesmo minuto e < 2km => mesmo evento; prioriza fonte com maior "quality".
    all.sort((a, b) => (b.quality ?? 0) - (a.quality ?? 0));
    const kept: LightningStrike[] = [];
    for (const s of all) {
      const near = kept.find(
        (k) =>
          Math.abs(new Date(k.occurredAt).getTime() - new Date(s.occurredAt).getTime()) < 60_000 &&
          Math.abs(k.latitude - s.latitude) < 0.02 &&
          Math.abs(k.longitude - s.longitude) < 0.02,
      );
      if (!near) kept.push(s);
    }
    return kept;
  }
}

function build(name: string): LightningProvider | null {
  switch (name) {
    case "openweather": return new OpenWeatherLightningProvider();
    case "blitzortung": return new BlitzortungLightningProvider();
    default: return null;
  }
}

export function getLightningProvider(): LightningProvider {
  const raw = (process.env.LIGHTNING_PROVIDER || "disabled").toLowerCase();
  const names = raw.split(/[,+\s]+/).map((s) => s.trim()).filter(Boolean);
  const providers = names.map(build).filter((p): p is LightningProvider => !!p);
  if (providers.length === 0) return new DisabledProvider();
  if (providers.length === 1) return providers[0];
  return new MultiLightningProvider(providers);
}
