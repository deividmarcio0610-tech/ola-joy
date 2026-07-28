// Contrato compartilhado entre todos os adaptadores de geração de imagem.

export type ProviderErrorType =
  | "NO_CREDITS"
  | "DAILY_LIMIT"
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "TEMPORARY_UNAVAILABLE"
  | "AUTHENTICATION_ERROR"
  | "INVALID_REQUEST"
  | "CONTENT_REJECTED"
  | "UNKNOWN_ERROR";

export type ImageGenerationRequest = {
  userId: string;
  originalImageBase64: string; // base64 sem prefixo data:
  mimeType: string; // image/jpeg | image/png | image/webp
  sceneDescription: string;
  detectedRisks: string[];
  selectedCorrections: string[];
  generationMode: "preview" | "final";
  modelHint?: string; // provedor pode sobrescrever com o modelo configurado no DB
};

export type ImageProviderResult = {
  provider: string;
  model: string;
  success: boolean;
  imageBase64?: string;
  imageMimeType?: string;
  estimatedCostCents?: number;
  errorType?: ProviderErrorType;
  errorMessage?: string;
  httpStatus?: number;
  retryAfterSeconds?: number;
  durationMs: number;
};

export type ProviderAvailability = {
  available: boolean;
  reason?: string;
  retryAfterSeconds?: number;
};

export interface ImageProvider {
  readonly name: string;
  isConfigured(): boolean;
  generateAfterImage(request: ImageGenerationRequest): Promise<ImageProviderResult>;
}

// Classifica erros HTTP e mensagens em ProviderErrorType.
export function classifyHttpError(
  status: number | undefined,
  bodyText: string,
): ProviderErrorType {
  const t = bodyText.toLowerCase();
  if (
    t.includes("content_moderation") ||
    t.includes("content moderation") ||
    t.includes("moderation") ||
    t.includes("flagged") ||
    t.includes("safety") ||
    t.includes("content policy") ||
    t.includes("blocked") ||
    t.includes("policy")
  ) {
    return "CONTENT_REJECTED";
  }
  if (status === 401 || status === 403) return "AUTHENTICATION_ERROR";
  if (status === 402 || t.includes("insufficient credit") || t.includes("no credits"))
    return "NO_CREDITS";
  if (status === 408) return "TIMEOUT";
  if (status === 429 || t.includes("rate limit") || t.includes("too many requests"))
    return "RATE_LIMIT";
  if (t.includes("daily limit") || t.includes("quota") || t.includes("cota")) return "DAILY_LIMIT";
  if (status && status >= 500) return "TEMPORARY_UNAVAILABLE";
  if (status && status >= 400) return "INVALID_REQUEST";
  return "UNKNOWN_ERROR";
}

export function isRecoverableError(type: ProviderErrorType | undefined): boolean {
  if (!type) return false;
  return (
    type === "NO_CREDITS" ||
    type === "DAILY_LIMIT" ||
    type === "RATE_LIMIT" ||
    type === "TIMEOUT" ||
    type === "TEMPORARY_UNAVAILABLE" ||
    type === "CONTENT_REJECTED" ||
    type === "UNKNOWN_ERROR"
  );
}

// Fetch com timeout em ms; sinaliza AbortError no estouro.
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export const DEFAULT_PROVIDER_TIMEOUT_MS = 90_000;
