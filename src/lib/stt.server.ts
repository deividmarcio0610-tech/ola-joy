/**
 * Transcrição de áudio (STT) no servidor próprio, com GPU.
 * Recebe um WAV completo em base64 e devolve o texto.
 *
 * Fala o mesmo protocolo da OpenAI (/v1/audio/transcriptions), então serve
 * tanto para o vLLM com um modelo Whisper quanto para faster-whisper-server,
 * whisper.cpp --server ou qualquer outro compatível rodando na sua VPS.
 *
 * Variáveis de ambiente (servidor, nunca com prefixo VITE_):
 *   VLLM_STT_BASE_URL  opcional. Padrão: VLLM_BASE_URL.
 *   VLLM_STT_MODEL     opcional. Padrão: descobre um modelo com "whisper" no nome.
 *   VLLM_STT_API_KEY   opcional. Padrão: VLLM_API_KEY.
 */
import { listModels, normalizeBaseUrl, timeoutMs } from "./vllm.server";

const MIN_WAV_BYTES = 2048;
const MAX_WAV_BYTES = 24 * 1024 * 1024;

export interface SttResult {
  text: string;
  model: string;
  bytes: number;
  serverMs: number;
}

export function getSttBaseUrl(): string | null {
  const raw = process.env["VLLM_STT_BASE_URL"] ?? process.env["VLLM_BASE_URL"];
  return raw ? normalizeBaseUrl(raw) : null;
}

function sttAuthHeaders(): Record<string, string> {
  const key = process.env["VLLM_STT_API_KEY"] ?? process.env["VLLM_API_KEY"];
  return key ? { Authorization: `Bearer ${key}` } : {};
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

// O id do modelo de transcrição é descoberto uma vez e reaproveitado.
let cachedSttModel: string | null = null;

export async function resolveSttModel(): Promise<string> {
  const configured = process.env["VLLM_STT_MODEL"];
  if (configured) return configured;
  if (cachedSttModel) return cachedSttModel;

  const base = getSttBaseUrl();
  if (!base) throw new Error("STT_CONFIG: defina VLLM_STT_BASE_URL ou VLLM_BASE_URL no servidor.");

  const models = await listModels(base);
  const whisper = models.find((id) => /whisper/i.test(id)) ?? models[0];
  if (!whisper) {
    throw new Error(
      `STT_CONFIG: o servidor em ${base} não anunciou nenhum modelo. Defina VLLM_STT_MODEL com o id do modelo de transcrição.`,
    );
  }

  cachedSttModel = whisper;
  return whisper;
}

export async function transcribeWavBase64(
  wavBase64: string,
  language?: string,
): Promise<SttResult> {
  const base = getSttBaseUrl();
  if (!base) {
    throw new Error(
      "STT_CONFIG: defina VLLM_STT_BASE_URL (ou VLLM_BASE_URL) apontando para o seu servidor de transcrição na GPU.",
    );
  }

  const bytes = base64ToBytes(wavBase64);
  if (bytes.byteLength < MIN_WAV_BYTES) {
    throw new Error("STT_INPUT: áudio vazio ou muito curto (WAV apenas com header).");
  }
  if (bytes.byteLength > MAX_WAV_BYTES) {
    throw new Error("STT_INPUT: áudio acima do limite de 24 MiB.");
  }

  const model = await resolveSttModel();

  const form = new FormData();
  form.append("model", model);
  const blob = new Blob([bytes.buffer.slice(0) as ArrayBuffer], { type: "audio/wav" });
  form.append("file", blob, "chunk.wav");
  form.append("response_format", "json");
  if (language) form.append("language", language);

  const started = Date.now();

  let res: Response;
  let raw: string;
  try {
    res = await fetch(`${base}/v1/audio/transcriptions`, {
      method: "POST",
      headers: sttAuthHeaders(),
      body: form,
      signal: AbortSignal.timeout(timeoutMs()),
    });
    raw = await res.text();
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new Error(`STT_TIMEOUT: ${base} não respondeu dentro de ${timeoutMs()}ms.`);
    }
    throw new Error(
      `STT_OFFLINE: não foi possível falar com ${base} (${String((error as Error)?.message ?? error)}). Verifique o servidor de transcrição e o túnel.`,
    );
  }

  if (res.status === 404) {
    throw new Error(
      `STT_404: ${base} não expõe /v1/audio/transcriptions. Suba um servidor de transcrição compatível (vLLM com Whisper, faster-whisper-server, whisper.cpp) e aponte VLLM_STT_BASE_URL para ele.`,
    );
  }
  if (!res.ok) {
    throw new Error(`STT_${res.status}: ${raw.slice(0, 400)}`);
  }

  let text = "";
  try {
    const parsed = JSON.parse(raw);
    text = (parsed?.text ?? parsed?.results?.[0]?.text ?? "").toString();
  } catch {
    // Servidores em modo texto puro devolvem a transcrição sem JSON.
    text = raw;
  }

  return {
    text: text.trim(),
    model,
    bytes: bytes.byteLength,
    serverMs: Date.now() - started,
  };
}
