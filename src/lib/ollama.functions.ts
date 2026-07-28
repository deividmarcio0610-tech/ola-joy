import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const AskInput = z.object({
  prompt: z.string().trim().min(1).max(2000),
});

export const askOllama = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => AskInput.parse(input))
  .handler(async ({ data }) => {
    const baseUrl = (process.env.OLLAMA_BASE_URL ?? "").replace(/\/+$/, "");
    const model = process.env.OLLAMA_MODEL ?? "qwen3:8b";

    if (!baseUrl) {
      throw new Error("OLLAMA_BASE_URL não configurado.");
    }

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        think: false,
        messages: [
          {
            role: "system",
            content:
              "Você é um assistente de matemática. Responda de forma curta e direta, em português, mostrando o resultado do cálculo.",
          },
          { role: "user", content: data.prompt },
        ],
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `Ollama respondeu ${response.status}. ${detail.slice(0, 200)}`.trim(),
      );
    }

    const json = (await response.json()) as {
      message?: { content?: string };
      error?: string;
    };

    if (json.error) throw new Error(json.error);

    const text = (json.message?.content ?? "")
      .replace(/<think>[\s\S]*?<\/think>/g, "")
      .trim();

    return { text: text || "Sem resposta do modelo.", model };
  });
