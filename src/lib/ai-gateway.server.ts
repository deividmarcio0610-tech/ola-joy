/**
 * Ponte real com o Lovable AI Gateway (API compatível com OpenAI).
 * Usada por todas as funções de IA do app: copiloto, detecção de perguntas,
 * extração de decisões/ações/pendências e geração de ata.
 */
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export const DEFAULT_MODEL = "google/gemini-2.5-flash";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Quando true, exige que o modelo responda com um objeto JSON. */
  json?: boolean;
}

export interface ChatResult {
  text: string;
  model: string;
  serverMs: number;
}

export class AiGatewayError extends Error {
  readonly status: number;
  readonly code: "NO_KEY" | "NO_CREDITS" | "RATE_LIMIT" | "UPSTREAM" | "EMPTY";

  constructor(code: AiGatewayError["code"], message: string, status = 500) {
    super(message);
    this.name = "AiGatewayError";
    this.code = code;
    this.status = status;
  }
}

export function isAiConfigured(): boolean {
  return Boolean(process.env["LOVABLE_API_KEY"]);
}

function resolveModel(model?: string): string {
  return model ?? process.env["LOVABLE_AI_MODEL"] ?? DEFAULT_MODEL;
}

/**
 * Chama o gateway e devolve o texto da resposta.
 * Lança AiGatewayError com códigos estáveis para a UI diferenciar
 * falta de chave, falta de créditos e limite de requisições.
 */
export async function chat(options: ChatOptions): Promise<ChatResult> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) {
    throw new AiGatewayError(
      "NO_KEY",
      "IA não configurada: defina LOVABLE_API_KEY nas variáveis de ambiente do servidor.",
      503,
    );
  }

  const model = resolveModel(options.model);
  const started = Date.now();

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: options.messages,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens ?? 900,
      ...(options.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  const raw = await res.text();

  if (res.status === 402) {
    throw new AiGatewayError(
      "NO_CREDITS",
      "Créditos de IA esgotados no workspace Lovable. Recarregue para continuar usando o copiloto.",
      402,
    );
  }
  if (res.status === 429) {
    throw new AiGatewayError(
      "RATE_LIMIT",
      "Muitas requisições à IA em sequência. Aguarde alguns segundos e tente novamente.",
      429,
    );
  }
  if (!res.ok) {
    throw new AiGatewayError("UPSTREAM", `IA_${res.status}: ${raw.slice(0, 400)}`, res.status);
  }

  let text = "";
  try {
    const parsed = JSON.parse(raw);
    text = (parsed?.choices?.[0]?.message?.content ?? "").toString();
  } catch {
    throw new AiGatewayError("UPSTREAM", "Resposta da IA em formato inesperado.", 502);
  }

  if (!text.trim()) {
    throw new AiGatewayError("EMPTY", "A IA retornou uma resposta vazia.", 502);
  }

  return { text: text.trim(), model, serverMs: Date.now() - started };
}

/**
 * Igual a chat(), porém já devolve o JSON desserializado.
 * Modelos às vezes embrulham o objeto em cercas markdown — isso é tolerado aqui.
 */
export async function chatJson<T>(options: ChatOptions): Promise<T> {
  const { text } = await chat({ ...options, json: true });
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
      return JSON.parse(cleaned.slice(start, end + 1)) as T;
    }
    throw new AiGatewayError("UPSTREAM", "A IA não devolveu um JSON válido.", 502);
  }
}
