// Probes leves de autenticação por provedor — NÃO gera imagem, NÃO consome créditos
// (exceto listagens gratuitas de conta/modelos). Server-only.

import { fetchWithTimeout } from "./types";

export type ProbeResult = {
  provider: string;
  configured: boolean;
  ok: boolean;
  httpStatus?: number;
  message: string;
  durationMs: number;
};

const TIMEOUT = 10_000;

async function probeGemini(): Promise<ProbeResult> {
  const t0 = Date.now();
  const key = process.env.GEMINI_API_KEY;
  if (!key)
    return {
      provider: "gemini",
      configured: false,
      ok: false,
      message: "GEMINI_API_KEY ausente.",
      durationMs: 0,
    };
  try {
    const res = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
      { method: "GET" },
      TIMEOUT,
    );
    const text = await res.text();
    return {
      provider: "gemini",
      configured: true,
      ok: res.ok,
      httpStatus: res.status,
      message: res.ok ? "Autenticado." : text.slice(0, 300),
      durationMs: Date.now() - t0,
    };
  } catch (e) {
    return {
      provider: "gemini",
      configured: true,
      ok: false,
      message: e instanceof Error ? e.message : String(e),
      durationMs: Date.now() - t0,
    };
  }
}

async function probeStability(): Promise<ProbeResult> {
  const t0 = Date.now();
  const key = process.env.STABILITY_API_KEY;
  if (!key)
    return {
      provider: "stability",
      configured: false,
      ok: false,
      message: "STABILITY_API_KEY ausente.",
      durationMs: 0,
    };
  try {
    const res = await fetchWithTimeout(
      "https://api.stability.ai/v1/user/account",
      {
        method: "GET",
        headers: { Authorization: `Bearer ${key}` },
      },
      TIMEOUT,
    );
    const text = await res.text();
    return {
      provider: "stability",
      configured: true,
      ok: res.ok,
      httpStatus: res.status,
      message: res.ok ? "Autenticado." : text.slice(0, 300),
      durationMs: Date.now() - t0,
    };
  } catch (e) {
    return {
      provider: "stability",
      configured: true,
      ok: false,
      message: e instanceof Error ? e.message : String(e),
      durationMs: Date.now() - t0,
    };
  }
}

async function probeReplicate(): Promise<ProbeResult> {
  const t0 = Date.now();
  const key = process.env.REPLICATE_API_TOKEN;
  if (!key)
    return {
      provider: "replicate",
      configured: false,
      ok: false,
      message: "REPLICATE_API_TOKEN ausente.",
      durationMs: 0,
    };
  try {
    const res = await fetchWithTimeout(
      "https://api.replicate.com/v1/account",
      {
        method: "GET",
        headers: { Authorization: `Token ${key}` },
      },
      TIMEOUT,
    );
    const text = await res.text();
    return {
      provider: "replicate",
      configured: true,
      ok: res.ok,
      httpStatus: res.status,
      message: res.ok ? "Autenticado." : text.slice(0, 300),
      durationMs: Date.now() - t0,
    };
  } catch (e) {
    return {
      provider: "replicate",
      configured: true,
      ok: false,
      message: e instanceof Error ? e.message : String(e),
      durationMs: Date.now() - t0,
    };
  }
}

async function probeOpenAI(): Promise<ProbeResult> {
  const t0 = Date.now();
  const key = process.env.OPENAI_API_KEY;
  if (!key)
    return {
      provider: "openai",
      configured: false,
      ok: false,
      message: "OPENAI_API_KEY ausente.",
      durationMs: 0,
    };
  try {
    const res = await fetchWithTimeout(
      "https://api.openai.com/v1/models",
      {
        method: "GET",
        headers: { Authorization: `Bearer ${key}` },
      },
      TIMEOUT,
    );
    const text = await res.text();
    return {
      provider: "openai",
      configured: true,
      ok: res.ok,
      httpStatus: res.status,
      message: res.ok ? "Autenticado." : text.slice(0, 300),
      durationMs: Date.now() - t0,
    };
  } catch (e) {
    return {
      provider: "openai",
      configured: true,
      ok: false,
      message: e instanceof Error ? e.message : String(e),
      durationMs: Date.now() - t0,
    };
  }
}

async function probeFal(): Promise<ProbeResult> {
  const t0 = Date.now();
  const key = process.env.FAL_API_KEY;
  if (!key)
    return {
      provider: "fal",
      configured: false,
      ok: false,
      message: "FAL_API_KEY ausente.",
      durationMs: 0,
    };
  // fal.ai não expõe endpoint público de verificação sem custo; validamos apenas a presença da chave.
  return {
    provider: "fal",
    configured: true,
    ok: true,
    message: "Chave presente (fal não expõe endpoint público de verificação).",
    durationMs: Date.now() - t0,
  };
}

export async function probeProvider(name: string): Promise<ProbeResult> {
  switch (name) {
    case "gemini":
      return probeGemini();
    case "stability":
      return probeStability();
    case "replicate":
      return probeReplicate();
    case "openai":
      return probeOpenAI();
    case "fal":
      return probeFal();
    default:
      return {
        provider: name,
        configured: false,
        ok: false,
        message: "Provedor desconhecido.",
        durationMs: 0,
      };
  }
}

export async function probeAll(names: string[]): Promise<ProbeResult[]> {
  return Promise.all(names.map(probeProvider));
}
