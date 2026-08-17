/**
 * Client-side audio pipeline helpers.
 * Float32 (48k, mono já baixado do downmix) -> 16k PCM16 -> WAV completo.
 * Nada aqui depende de React: pode rodar em callbacks de áudio.
 */

export interface PcmValidation {
  valid: boolean;
  nonZeroPercent: number;
  clipping: boolean;
  peak: number;
  durationMs: number;
  samples: number;
  hasNaN: boolean;
}

export function downmixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const len = channels[0].length;
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    let sum = 0;
    for (let c = 0; c < channels.length; c++) sum += channels[c][i];
    out[i] = sum / channels.length;
  }
  return out;
}

/** Resample linear-interpolado (não descarta amostras como o decimate simples). */
export function resample(input: Float32Array, inputRate: number, outputRate: number): Float32Array {
  if (inputRate === outputRate) return input;
  const ratio = inputRate / outputRate;
  const outLength = Math.floor(input.length / ratio);
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = input[idx] ?? 0;
    const b = input[idx + 1] ?? a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

export function validatePcm(samples: Float32Array, sampleRate: number): PcmValidation {
  let nonZero = 0;
  let peak = 0;
  let hasNaN = false;
  let clipped = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i];
    if (Number.isNaN(v)) {
      hasNaN = true;
      continue;
    }
    const abs = Math.abs(v);
    if (abs > 1e-5) nonZero++;
    if (abs > peak) peak = abs;
    if (abs >= 0.999) clipped++;
  }
  const nonZeroPercent = samples.length ? (nonZero / samples.length) * 100 : 0;
  return {
    valid: samples.length > 0 && !hasNaN && nonZeroPercent > 1,
    nonZeroPercent,
    clipping: clipped / Math.max(1, samples.length) > 0.01,
    peak,
    durationMs: (samples.length / sampleRate) * 1000,
    samples: samples.length,
    hasNaN,
  };
}

/** WAV 16-bit mono completo (header + samples). Cada chunk é um arquivo válido. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] || 0));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Uint8Array(buffer);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function median(values: number[]): number {
  if (!values.length) return -60;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Detector de pergunta direcionada ao Deivid (executa sobre transcrição final). */
export function detectQuestionForDeivid(text: string): string | null {
  const normalized = text.toLowerCase();
  if (!/\bdeivid\b|\bdavid\b|\bdeividtech\b/.test(normalized)) return null;
  const sentences = text.split(/(?<=[?.!])\s+/).filter(Boolean);
  const hit = sentences.find((s) => /deivid|david/i.test(s));
  return (hit ?? text).trim();
}
