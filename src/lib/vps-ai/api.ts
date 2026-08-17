// Cliente browser (same-origin) para as rotas /api/vps/*.
// NÃO importar nada de *.server.ts aqui.
import { supabase } from "@/integrations/supabase/client";
export type VpsHealth = {
  online: boolean;
  ollama: { online: boolean; model?: string };
  imageGenerator: { online: boolean; mode?: "cpu" | "gpu" | string };
  tempoResposta?: number;
  raw?: unknown;
};

export type VpsAnalysisResult = {
  score?: number;
  autorizada?: boolean;
  probabilidade?: number;
  direcao?: string;
  stop?: number;
  parcial1?: number;
  parcial2?: number;
  alvoFinal?: number;
  justificativa?: string;
  fluxoInstitucional?: string;
  reversao?: string;
  rompimentoFalso?: string;
  [k: string]: unknown;
};

export type VpsJob = {
  jobId: string;
  status:
    | "queued"
    | "preparing"
    | "analyzing"
    | "generating"
    | "uploading"
    | "completed"
    | "failed"
    | "cancelled";
  progress?: number;
  message?: string;
  resultUrl?: string;
  beforeUrl?: string;
  error?: string;
};

/**
 * Bearer da sessão Supabase para as rotas /api/vps/*, que autenticam via
 * `Authorization` (requireUser). Anexado só nestas chamadas same-origin —
 * nunca por patch global de `fetch`, que vazaria o token para qualquer
 * requisição concorrente, inclusive para hosts de terceiros.
 */
async function authHeaders(): Promise<Record<string, string>> {
  if (typeof window === "undefined") return {};
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

async function jfetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(await authHeaders()),
      ...(init?.headers ?? {}),
    },
    credentials: "same-origin",
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as T) : (undefined as T);
  const structuredError = data as
    | { ok?: boolean; error?: string; message?: string; upstreamStatus?: number }
    | undefined;
  if (!res.ok) {
    const msg = structuredError?.message ?? structuredError?.error ?? `Erro ${res.status}`;
    throw new Error(msg);
  }
  if (structuredError?.ok === false) {
    const msg =
      structuredError.message ??
      structuredError.error ??
      `IA indisponível${structuredError.upstreamStatus ? ` (HTTP ${structuredError.upstreamStatus})` : ""}`;
    throw new Error(msg);
  }
  return data;
}

export const vpsAI = {
  getHealth: () => jfetch<VpsHealth>("/api/vps/status"),
  listModels: () => jfetch<{ models: string[] }>("/api/vps/modelos"),

  analyzeImage: (payload: {
    imageUrl?: string;
    imageBase64?: string;
    prompt?: string;
    tecnica?: string;
    timeframe?: string;
    context?: Record<string, unknown>;
  }) =>
    jfetch<VpsAnalysisResult>("/api/vps/analisar", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  analyzeText: (payload: { prompt: string; context?: Record<string, unknown> }) =>
    jfetch<VpsAnalysisResult>("/api/vps/analisar", {
      method: "POST",
      body: JSON.stringify({ ...payload, mode: "text" }),
    }),

  backtest: (payload: Record<string, unknown>) =>
    jfetch<Record<string, unknown>>("/api/vps/backtest", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  video: (payload: Record<string, unknown>) =>
    jfetch<Record<string, unknown>>("/api/vps/video", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  startGenerateAfter: (payload: {
    analysisId: string;
    imageUrl: string;
    corrections?: string[];
    prompt?: string;
  }) =>
    jfetch<{ success: true; jobId: string; status: VpsJob["status"] }>("/api/vps/generate-after", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getJob: (jobId: string) => jfetch<VpsJob>(`/api/vps/jobs/${jobId}`),
  cancelJob: (jobId: string) => jfetch<VpsJob>(`/api/vps/jobs/${jobId}/cancel`, { method: "POST" }),
  retryJob: (jobId: string) => jfetch<VpsJob>(`/api/vps/jobs/${jobId}/retry`, { method: "POST" }),
};
