/**
 * Real speech-to-text bridge (Lovable AI Gateway).
 * Receives a complete WAV file (base64) and returns the transcript text.
 */
const STT_MODEL = "openai/gpt-4o-mini-transcribe";
const STT_URL = "https://ai.gateway.lovable.dev/v1/audio/transcriptions";

export interface SttResult {
  text: string;
  model: string;
  bytes: number;
  serverMs: number;
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export async function transcribeWavBase64(
  wavBase64: string,
  language?: string,
): Promise<SttResult> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("STT_CONFIG: LOVABLE_API_KEY ausente no servidor.");

  const bytes = base64ToBytes(wavBase64);
  if (bytes.byteLength < 2048) {
    throw new Error("STT_INPUT: áudio vazio ou muito curto (WAV apenas com header).");
  }
  if (bytes.byteLength > 24 * 1024 * 1024) {
    throw new Error("STT_INPUT: áudio acima do limite de 24 MiB.");
  }

  const form = new FormData();
  form.append("model", STT_MODEL);
  const blob = new Blob([bytes.buffer.slice(0) as ArrayBuffer], { type: "audio/wav" });
  form.append("file", blob, "chunk.wav");
  if (language) form.append("language", language);

  const started = Date.now();
  const res = await fetch(STT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`STT_${res.status}: ${raw.slice(0, 400)}`);
  }

  let text = "";
  try {
    text = (JSON.parse(raw)?.text ?? "").toString();
  } catch {
    text = raw;
  }

  return {
    text: text.trim(),
    model: STT_MODEL,
    bytes: bytes.byteLength,
    serverMs: Date.now() - started,
  };
}
