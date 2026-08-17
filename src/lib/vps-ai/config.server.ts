// Server-only: config da API de IA hospedada na VPS.
// NUNCA importar do client.
export type VpsAiConfig = {
  baseUrl: string;
  apiKey: string;
  allowedHost: string;
};

export function getVpsAiConfig(): VpsAiConfig {
  // Nomes novos (VISION_*) com fallback para os antigos (VALETECH_*), para que a
  // renomeação não derrube a IA em ambientes que ainda usam as variáveis antigas.
  const baseUrl = process.env.VISION_AI_API_URL || process.env.VALETECH_AI_API_URL;
  const apiKey = process.env.VISION_AI_API_KEY || process.env.VALETECH_AI_API_KEY;
  if (!baseUrl) throw new Error("VISION_AI_API_URL não configurada");
  if (!apiKey) throw new Error("VISION_AI_API_KEY não configurada");
  let allowedHost: string;
  try {
    allowedHost = new URL(baseUrl).host;
  } catch {
    throw new Error("VISION_AI_API_URL inválida");
  }
  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey, allowedHost };
}

export function maskKey(key: string): string {
  if (!key) return "";
  const tail = key.slice(-4);
  return `••••••••${tail}`;
}
