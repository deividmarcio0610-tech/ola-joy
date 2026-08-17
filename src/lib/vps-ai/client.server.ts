// Server-only: helper único para chamar a API de IA da VPS.
// Impõe host allowlist (anti-SSRF), Bearer, timeout e content-type.
import { getVpsAiConfig, type VpsAiConfig } from "./config.server";

export const DEFAULT_TIMEOUT_MS = 110_000; // < limite prático do Worker

export type CallVpsOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown; // objeto JSON ou FormData
  timeoutMs?: number;
  extraHeaders?: Record<string, string>;
  passthrough?: boolean; // se true, devolve Response bruta
};

export type VpsCallResult<T = unknown> = {
  ok: boolean;
  status: number;
  data?: T;
  errorCode?: string;
  errorMessage?: string;
};

function buildUrl(path: string, cfg: VpsAiConfig): string {
  const { baseUrl, allowedHost } = cfg;
  const url = new URL(
    path.startsWith("http") ? path : `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`,
  );
  if (url.host !== allowedHost) {
    throw new Error(`Host não permitido: ${url.host}`);
  }
  return url.toString();
}

export async function callVpsAI<T = unknown>(
  path: string,
  opts: CallVpsOptions = {},
): Promise<VpsCallResult<T>> {
  // Variável de ambiente ausente/inválida não pode virar exceção: o middleware de erro
  // do TanStack transforma throw em página HTML 500, e as rotas /api/vps/* precisam
  // responder JSON para a UI mostrar "IA indisponível" em vez de quebrar a tela.
  let cfg: VpsAiConfig;
  try {
    cfg = getVpsAiConfig();
  } catch (err) {
    return {
      ok: false,
      status: 503,
      errorCode: "CONFIG_MISSING",
      errorMessage: err instanceof Error ? err.message : "IA da VPS não configurada",
    };
  }
  const { apiKey } = cfg;
  const method = opts.method ?? "GET";
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      ...(opts.extraHeaders ?? {}),
    };

    let body: BodyInit | undefined;
    if (opts.body instanceof FormData) {
      body = opts.body;
    } else if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.body);
    }

    const res = await fetch(buildUrl(path, cfg), {
      method,
      headers,
      body,
      signal: controller.signal,
    });

    const status = res.status;
    const contentType = res.headers.get("content-type") ?? "";
    if (!res.ok) {
      let msg = `Erro ${status}`;
      let code = `HTTP_${status}`;
      try {
        if (contentType.includes("application/json")) {
          const j = (await res.json()) as { error?: string; message?: string; code?: string };
          msg = j.message ?? j.error ?? msg;
          code = j.code ?? code;
        } else {
          msg = (await res.text()).slice(0, 300) || msg;
        }
      } catch {
        /* ignore */
      }
      return { ok: false, status, errorCode: code, errorMessage: msg };
    }

    if (contentType.includes("application/json")) {
      const data = (await res.json()) as T;
      return { ok: true, status, data };
    }
    // texto ou binário — devolve texto por padrão
    const text = await res.text();
    return { ok: true, status, data: text as unknown as T };
  } catch (err) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      status: isAbort ? 504 : 502,
      errorCode: isAbort ? "TIMEOUT" : "NETWORK_ERROR",
      errorMessage:
        err instanceof Error
          ? isAbort
            ? `Tempo esgotado após ${timeoutMs}ms`
            : err.message
          : "Falha ao contatar API de IA",
    };
  } finally {
    clearTimeout(timer);
  }
}
