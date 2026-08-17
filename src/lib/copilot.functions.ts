import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { AiGatewayError, chat } from "./ai-gateway.server";

/**
 * Resposta do copiloto para uma pauta/contexto informado pelo usuário,
 * gerada pelo Lovable AI Gateway.
 */
export const getCopilotResponse = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        transcription: z.string().min(1),
        theme: z.string().default("Livre"),
        mode: z.string().default("Profissional"),
        memory: z.array(z.string()).default([]),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const memoryBlock = data.memory.length
      ? `\n\nMemória profissional do usuário (use quando for relevante):\n- ${data.memory.join("\n- ")}`
      : "";

    try {
      const { text, model, serverMs } = await chat({
        temperature: 0.4,
        maxTokens: 800,
        messages: [
          {
            role: "system",
            content:
              "Você é um copiloto de reuniões em português do Brasil. A partir do contexto e da pauta, escreva a fala " +
              `pronta para o usuário usar, em primeira pessoa, no estilo "${data.mode}", sem markdown e sem se identificar como IA.`,
          },
          {
            role: "user",
            content: `Tema: ${data.theme}\n\nPauta/contexto:\n${data.transcription}${memoryBlock}`,
          },
        ],
      });

      return { ok: true as const, text, model, serverMs, timestamp: Date.now() };
    } catch (err) {
      return {
        ok: false as const,
        text: "",
        timestamp: Date.now(),
        error: err instanceof AiGatewayError ? err.message : String((err as Error)?.message ?? err),
      };
    }
  });
