import { extractJsonObject } from "@/lib/jsonExtract";
import { parseImageDataUrl } from "@/lib/printAnalysis/imageQuality";
import {
  buildPrintAnalysisPrompt,
  buildRepairPrompt,
  printAnalysisJsonSchema,
} from "@/lib/printAnalysis/prompt";
import { validatePrintAnalysis, type PrintAnalysis } from "@/lib/printAnalysis/contract";

import { aiConfig } from "./config";
import { aiBreaker, describeAIError } from "./gateway";

/**
 * ANÁLISE VISUAL DO PRINT — chamada REAL ao modelo multimodal.
 *
 * Sem modelo de visão configurado, esta função devolve
 * "ANÁLISE IA INDISPONÍVEL". Ela nunca fabrica um resultado: um diagnóstico
 * falso desenhado sobre o gráfico do operador é pior do que nenhum.
 *
 * O fluxo de proteção contra alucinação tem três camadas:
 * 1. saída estruturada pedida ao provedor (`format` no Ollama);
 * 2. extração tolerante do JSON (cercas markdown, texto ao redor);
 * 3. validação/saneamento do contrato — e UMA tentativa de reparo guiada
 *    pelos erros. Se a segunda também falhar, é erro controlado.
 */

export interface PrintVisionResult {
  analysis: PrintAnalysis | null;
  model: string;
  error: string | null;
  /** Ajustes aplicados pela validação — mostrados ao operador. */
  corrections: string[];
  /** true quando a resposta precisou de uma rodada de reparo. */
  repaired: boolean;
  elapsedMs: number;
}

export const AI_UNAVAILABLE = "ANÁLISE IA INDISPONÍVEL";

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  images?: string[];
}

async function callVision(
  config: ReturnType<typeof aiConfig>,
  messages: ChatTurn[],
): Promise<string> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (config.apiKey && config.apiKey !== "not-required") {
    headers.authorization = `Bearer ${config.apiKey}`;
  }
  const response = await fetch(`${config.baseUrl}/api/chat`, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(config.timeoutMs),
    body: JSON.stringify({
      model: config.visionModel,
      stream: false,
      think: false,
      format: printAnalysisJsonSchema(),
      options: { temperature: 0 },
      messages,
    }),
  });
  if (!response.ok) throw new Error(`status ${response.status}`);
  const payload = (await response.json()) as { message?: { content?: string } };
  return payload.message?.content?.trim() ?? "";
}

export function visionConfigured(): boolean {
  const config = aiConfig();
  return Boolean(config.baseUrl) && Boolean(config.visionModel);
}

export async function analyzePrintWithVision(dataUrl: string): Promise<PrintVisionResult> {
  const started = Date.now();
  const config = aiConfig();
  const fail = (error: string): PrintVisionResult => ({
    analysis: null,
    model: config.visionModel,
    error,
    corrections: [],
    repaired: false,
    elapsedMs: Date.now() - started,
  });

  if (!config.baseUrl) {
    return fail(`${AI_UNAVAILABLE}: configure OLLAMA_BASE_URL/AI_BASE_URL no servidor.`);
  }
  if (!config.visionModel) {
    return fail(
      `${AI_UNAVAILABLE}: nenhum modelo multimodal configurado. Defina OLLAMA_VISION_MODEL com um modelo que tenha capacidade de visão.`,
    );
  }
  const image = parseImageDataUrl(dataUrl);
  if (!image) return fail("Imagem inválida: envie PNG, JPG ou WebP.");

  const prompt = buildPrintAnalysisPrompt();
  const conversation: ChatTurn[] = [{ role: "user", content: prompt, images: [image.base64] }];

  try {
    const first = await aiBreaker.run(() => callVision(config, conversation));
    const firstJson = extractJsonObject(first);
    const firstCheck =
      firstJson === null
        ? {
            ok: false as const,
            analysis: null,
            errors: ["A resposta não contém JSON válido."],
            corrections: [],
          }
        : validatePrintAnalysis(firstJson);

    if (firstCheck.ok && firstCheck.analysis) {
      return {
        analysis: firstCheck.analysis,
        model: config.visionModel,
        error: null,
        corrections: firstCheck.corrections,
        repaired: false,
        elapsedMs: Date.now() - started,
      };
    }

    // ── REPARO: uma única tentativa, com os erros reais no contexto.
    conversation.push({ role: "assistant", content: first });
    conversation.push({ role: "user", content: buildRepairPrompt(firstCheck.errors) });
    const second = await aiBreaker.run(() => callVision(config, conversation));
    const secondJson = extractJsonObject(second);
    const secondCheck =
      secondJson === null
        ? {
            ok: false as const,
            analysis: null,
            errors: ["A resposta corrigida também não contém JSON válido."],
            corrections: [],
          }
        : validatePrintAnalysis(secondJson);

    if (secondCheck.ok && secondCheck.analysis) {
      return {
        analysis: secondCheck.analysis,
        model: config.visionModel,
        error: null,
        corrections: secondCheck.corrections,
        repaired: true,
        elapsedMs: Date.now() - started,
      };
    }

    return fail(
      `A IA não devolveu uma análise válida mesmo após correção: ${secondCheck.errors.slice(0, 3).join(" · ")}`,
    );
  } catch (error) {
    return fail(describeAIError(error, config.visionModel, config.timeoutMs));
  }
}

/**
 * CHAT CONTEXTUAL sobre a análise (requisito 18). O modelo recebe a MESMA
 * imagem e a análise já validada — ele explica o que foi decidido, e é
 * instruído a não criar níveis novos.
 */
export async function askAboutPrint(input: {
  dataUrl: string;
  analysis: PrintAnalysis;
  question: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<{ answer: string; error: string | null }> {
  const config = aiConfig();
  if (!config.baseUrl || !config.visionModel) {
    return { answer: "", error: `${AI_UNAVAILABLE}: modelo multimodal não configurado.` };
  }
  const image = parseImageDataUrl(input.dataUrl);
  if (!image) return { answer: "", error: "Imagem inválida para o chat." };

  const system = `Você explica a análise T4 já realizada sobre ESTE print. Regras:
- Responda em português, curto e objetivo.
- Use SOMENTE os dados da análise abaixo e o que é visível na imagem.
- Não crie entrada, stop ou alvo novos. Se algo não foi identificado, diga que não está legível no print.
- Se a pergunta pedir algo que a análise não cobre, diga isso claramente.

ANÁLISE VALIDADA (JSON):
${JSON.stringify(input.analysis)}`;

  const messages: ChatTurn[] = [
    { role: "user", content: system, images: [image.base64] },
    ...input.history.slice(-8).map((turn) => ({ role: turn.role, content: turn.content })),
    { role: "user", content: input.question },
  ];

  try {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (config.apiKey && config.apiKey !== "not-required") {
      headers.authorization = `Bearer ${config.apiKey}`;
    }
    const answer = await aiBreaker.run(async () => {
      const response = await fetch(`${config.baseUrl}/api/chat`, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(config.timeoutMs),
        body: JSON.stringify({
          model: config.visionModel,
          stream: false,
          think: false,
          options: { temperature: 0.2 },
          messages,
        }),
      });
      if (!response.ok) throw new Error(`status ${response.status}`);
      const payload = (await response.json()) as { message?: { content?: string } };
      return payload.message?.content?.trim() ?? "";
    });
    if (!answer) return { answer: "", error: "A IA respondeu vazio." };
    return { answer, error: null };
  } catch (error) {
    return { answer: "", error: describeAIError(error, config.visionModel, config.timeoutMs) };
  }
}
