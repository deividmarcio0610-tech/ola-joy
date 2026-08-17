/**
 * Ponte com o servidor vLLM próprio (GPU na VPS, exposta por túnel).
 * vLLM fala o protocolo da OpenAI, então usamos /v1/chat/completions e
 * /v1/models diretamente — sem nenhuma API de terceiros no caminho.
 *
 * Variáveis de ambiente (todas no servidor, nunca com prefixo VITE_):
 *   VLLM_BASE_URL      obrigatória. Ex.: https://gpu.suavps.com/v1
 *   VLLM_API_KEY       opcional. Só se o vLLM subiu com --api-key.
 *   VLLM_MODEL         opcional. Sem ela, o primeiro modelo de /v1/models é usado.
 *   VLLM_TIMEOUT_MS    opcional. Padrão 120000 (geração na GPU pode demorar).
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Quando true, pede ao vLLM uma resposta em JSON (guided decoding). */
  json?: boolean;
}

export interface ChatResult {
  text: string;
  model: string;
  serverMs: number;
}

export type AiErrorCode =
  | "NO_ENDPOINT"
  | "OFFLINE"
  | "TIMEOUT"
  | "UNAUTHORIZED"
  | "MODEL_NOT_FOUND"
  | "OVERLOADED"
  | "UPSTREAM"
  | "EMPTY";

export class AiError extends Error {
  readonly status: number;
  readonly code: AiErrorCode;

  constructor(code: AiErrorCode, message: string, status = 500) {
    super(message);
    this.name = "AiError";
    this.code = code;
    this.status = status;
  }
}

const DEFAULT_TIMEOUT_MS = 120_000;

/** Aceita a URL com ou sem `/v1` no fim e devolve sempre a raiz sem barra final. */
export function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "").replace(/\/v1$/, "");
}

export function getBaseUrl(): string | null {
  const raw = process.env["VLLM_BASE_URL"];
  return raw ? normalizeBaseUrl(raw) : null;
}

function requireBaseUrl(): string {
  const base = getBaseUrl();
  if (!base) {
    throw new AiError(
      "NO_ENDPOINT",
      "IA não configurada: defina VLLM_BASE_URL apontando para o seu servidor vLLM (ex.: https://gpu.suavps.com/v1).",
      503,
    );
  }
  return base;
}

export function isAiConfigured(): boolean {
  return Boolean(getBaseUrl());
}

export function authHeaders(): Record<string, string> {
  const key = process.env["VLLM_API_KEY"];
  return key ? { Authorization: `Bearer ${key}` } : {};
}

export function timeoutMs(): number {
  const raw = Number(process.env["VLLM_TIMEOUT_MS"]);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}

/** Traduz falhas de fetch/timeout em erros com mensagem útil sobre o túnel. */
export function toAiError(error: unknown, base: string): AiError {
  if (error instanceof AiError) return error;
  const name = error instanceof Error ? error.name : "";
  if (name === "TimeoutError" || name === "AbortError") {
    return new AiError(
      "TIMEOUT",
      `O servidor de IA em ${base} não respondeu dentro de ${timeoutMs()}ms. A GPU pode estar ocupada ou o túnel lento.`,
      504,
    );
  }
  return new AiError(
    "OFFLINE",
    `Não foi possível falar com o servidor de IA em ${base}: ${String((error as Error)?.message ?? error)}. Verifique se o vLLM está rodando e se o túnel está de pé.`,
    503,
  );
}

/** Erro de HTTP do vLLM traduzido para um código estável. */
export function httpToAiError(status: number, body: string, base: string): AiError {
  const snippet = body.slice(0, 400);
  if (status === 401 || status === 403) {
    return new AiError(
      "UNAUTHORIZED",
      `O servidor vLLM em ${base} recusou a credencial. Confira VLLM_API_KEY (ou o token exigido pelo túnel).`,
      status,
    );
  }
  if (status === 404) {
    return new AiError(
      "MODEL_NOT_FOUND",
      `Rota ou modelo não encontrado em ${base} (HTTP 404). Confira VLLM_BASE_URL e VLLM_MODEL: ${snippet}`,
      404,
    );
  }
  if (status === 429 || status === 503) {
    return new AiError(
      "OVERLOADED",
      `O servidor vLLM está sem capacidade no momento (HTTP ${status}). Aguarde a fila da GPU esvaziar: ${snippet}`,
      status,
    );
  }
  return new AiError("UPSTREAM", `IA_${status}: ${snippet}`, status);
}

interface ModelsResponse {
  data?: Array<{ id?: string }>;
}

/** Lista os modelos servidos pelo vLLM. Usada no health check e no diagnóstico. */
export async function listModels(baseUrl?: string): Promise<string[]> {
  const base = baseUrl ? normalizeBaseUrl(baseUrl) : requireBaseUrl();
  try {
    const res = await fetch(`${base}/v1/models`, {
      headers: authHeaders(),
      signal: AbortSignal.timeout(Math.min(timeoutMs(), 15_000)),
    });
    const raw = await res.text();
    if (!res.ok) throw httpToAiError(res.status, raw, base);

    const parsed = JSON.parse(raw) as ModelsResponse;
    return (parsed.data ?? []).map((m) => m.id ?? "").filter(Boolean);
  } catch (error) {
    throw toAiError(error, base);
  }
}

// vLLM normalmente serve um modelo só; descobrimos o id uma vez e reaproveitamos.
let cachedModel: string | null = null;

async function resolveModel(model?: string): Promise<string> {
  if (model) return model;
  const configured = process.env["VLLM_MODEL"];
  if (configured) return configured;
  if (cachedModel) return cachedModel;

  const models = await listModels();
  if (models.length === 0) {
    throw new AiError(
      "MODEL_NOT_FOUND",
      "O servidor vLLM não anunciou nenhum modelo em /v1/models. Suba o vLLM com um modelo ou defina VLLM_MODEL.",
      503,
    );
  }
  cachedModel = models[0];
  return cachedModel;
}

/** Alguns modelos/builds não aceitam guided decoding; nesse caso repetimos sem. */
function rejectsJsonMode(status: number, body: string): boolean {
  if (status !== 400 && status !== 422 && status !== 500) return false;
  return /response_format|guided|json_object|json_schema|structured/i.test(body);
}

async function postChat(base: string, payload: Record<string, unknown>) {
  const res = await fetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs()),
  });
  return { res, raw: await res.text() };
}

/**
 * Chama o vLLM e devolve o texto gerado.
 * Lança AiError com códigos estáveis para a interface distinguir servidor fora
 * do ar, timeout, credencial recusada e fila cheia.
 */
export async function chat(options: ChatOptions): Promise<ChatResult> {
  const base = requireBaseUrl();
  const model = await resolveModel(options.model);
  const started = Date.now();

  const payload: Record<string, unknown> = {
    model,
    messages: options.messages,
    temperature: options.temperature ?? 0.3,
    max_tokens: options.maxTokens ?? 900,
    stream: false,
  };
  if (options.json) payload.response_format = { type: "json_object" };

  let res: Response;
  let raw: string;
  try {
    ({ res, raw } = await postChat(base, payload));

    if (!res.ok && options.json && rejectsJsonMode(res.status, raw)) {
      // Sem guided decoding: pedimos JSON no prompt e validamos depois.
      delete payload.response_format;
      ({ res, raw } = await postChat(base, payload));
    }
  } catch (error) {
    throw toAiError(error, base);
  }

  if (!res.ok) throw httpToAiError(res.status, raw, base);

  let text = "";
  try {
    const parsed = JSON.parse(raw);
    text = (parsed?.choices?.[0]?.message?.content ?? "").toString();
  } catch {
    throw new AiError("UPSTREAM", "Resposta do vLLM em formato inesperado.", 502);
  }

  if (!text.trim()) {
    throw new AiError("EMPTY", "O modelo retornou uma resposta vazia.", 502);
  }

  return { text: text.trim(), model, serverMs: Date.now() - started };
}

/**
 * Igual a chat(), porém já devolve o JSON desserializado.
 * Modelos abertos costumam embrulhar o objeto em cercas markdown ou emendar
 * um comentário antes/depois — os dois casos são tolerados aqui.
 */
export async function chatJson<T>(options: ChatOptions): Promise<T> {
  const { text } = await chat({
    ...options,
    json: true,
    messages: options.messages.map((message, index) =>
      index === 0 && message.role === "system"
        ? {
            ...message,
            content: `${message.content}\n\nResponda SOMENTE com o JSON, sem cercas de código e sem texto fora do objeto.`,
          }
        : message,
    ),
  });

  const cleaned = text
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/, "")
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
      } catch {
        // cai no erro abaixo
      }
    }
    throw new AiError("UPSTREAM", "O modelo não devolveu um JSON válido.", 502);
  }
}
