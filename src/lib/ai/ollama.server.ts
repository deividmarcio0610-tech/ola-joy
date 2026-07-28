/**
 * Ollama server helpers.
 * The instance exposes an OpenAI-compatible API at `${OLLAMA_BASE_URL}/v1`.
 */
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export function getOllamaConfig() {
  const baseURL = (process.env.OLLAMA_BASE_URL ?? "").replace(/\/+$/, "");
  const model = process.env.OLLAMA_MODEL ?? "qwen3:8b";
  const visionModel = process.env.OLLAMA_VISION_MODEL ?? "qwen2.5vl:7b";
  return { baseURL, model, visionModel };
}

export function createOllamaProvider(baseURL: string) {
  return createOpenAICompatible({
    name: "ollama",
    baseURL: `${baseURL}/v1`,
    apiKey: "ollama",
  });
}

/** Remove os blocos <think>…</think> emitidos por modelos de raciocínio. */
export function stripThinking(text: string) {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/i, "")
    .trim();
}

/** Chamada simples de chat completions (não-streaming). */
export async function ollamaChat(options: {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  model?: string;
  temperature?: number;
  json?: boolean;
}): Promise<{ ok: true; text: string } | { ok: false; error: string; status?: number }> {
  const { baseURL, model } = getOllamaConfig();
  if (!baseURL) return { ok: false, error: "OLLAMA_BASE_URL não configurado." };

  try {
    const res = await fetch(`${baseURL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: options.model ?? model,
        messages: options.messages,
        temperature: options.temperature ?? 0.4,
        stream: false,
        ...(options.json ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    const raw = await res.text();
    if (!res.ok) {
      return { ok: false, error: raw.slice(0, 400), status: res.status };
    }
    const json = JSON.parse(raw) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return { ok: true, text: stripThinking(json.choices?.[0]?.message?.content ?? "") };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
