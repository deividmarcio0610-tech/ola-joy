import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { AiGatewayError, chat, chatJson, isAiConfigured } from "./ai-gateway.server";
import { detectQuestionForDeivid } from "./audio-pipeline";

/**
 * Funções de servidor da reunião: detecção de perguntas, resposta sugerida,
 * extração incremental de decisões/ações/pendências e geração da ata final.
 * Toda a inteligência roda no Lovable AI Gateway (ver ai-gateway.server.ts).
 */

// Bloco de transcrição produzido pelo pipeline de áudio do copiloto.
export interface TranscriptionBlock {
  id: string;
  sessionId: string;
  timestamp: string;
  speaker?: string;
  text: string;
  confidence?: number;
  isFinal: boolean;
}

export interface MeetingAction {
  responsible: string;
  task: string;
  deadline: string;
}

export interface MeetingIntelligence {
  decisions: string[];
  actions: MeetingAction[];
  pending: string[];
  summary: string;
}

const blockSchema = z.object({
  text: z.string().default(""),
  speaker: z.string().optional(),
  timestamp: z.string().optional(),
});

/** Converte blocos heterogêneos em um texto simples "FALANTE: fala". */
function blocksToTranscript(blocks: Array<z.infer<typeof blockSchema>>): string {
  return blocks
    .map((b) => (b.speaker ? `${b.speaker}: ${b.text}` : b.text))
    .filter((line) => line.trim().length > 0)
    .join("\n");
}

/** Traduz erros do gateway em mensagens que a UI pode exibir direto ao usuário. */
function aiErrorMessage(err: unknown): string {
  if (err instanceof AiGatewayError) return err.message;
  return String((err as Error)?.message ?? err);
}

// 1. Detector de perguntas dirigidas ao usuário.
export const analyzeMeetingContext = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        sessionId: z.string(),
        recentBlocks: z.array(blockSchema),
        theme: z.string(),
        userName: z.string().default("Deivid"),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { recentBlocks, theme, userName } = data;
    const lastBlock = recentBlocks[recentBlocks.length - 1]?.text ?? "";

    if (!lastBlock.trim()) {
      return { isQuestionForUser: false, detectedQuestion: null, confidence: 0, source: "vazio" };
    }

    // Heurística local: instantânea e sempre disponível, mesmo sem IA configurada.
    const heuristic = detectQuestionForDeivid(lastBlock);

    if (!isAiConfigured()) {
      return {
        isQuestionForUser: Boolean(heuristic),
        detectedQuestion: heuristic,
        confidence: heuristic ? 0.6 : 0.1,
        source: "heuristica",
      };
    }

    try {
      const verdict = await chatJson<{
        pergunta_para_o_usuario: boolean;
        pergunta: string | null;
        confianca: number;
      }>({
        temperature: 0,
        maxTokens: 200,
        messages: [
          {
            role: "system",
            content:
              "Você analisa transcrições de reuniões em português. Decida se a ÚLTIMA fala contém uma pergunta " +
              `dirigida a ${userName}. Responda apenas com JSON no formato ` +
              '{"pergunta_para_o_usuario": boolean, "pergunta": string|null, "confianca": number entre 0 e 1}.',
          },
          {
            role: "user",
            content: `Tema da reunião: ${theme}\n\nTranscrição recente:\n${blocksToTranscript(recentBlocks)}\n\nÚltima fala: "${lastBlock}"`,
          },
        ],
      });

      return {
        isQuestionForUser: Boolean(verdict.pergunta_para_o_usuario),
        detectedQuestion: verdict.pergunta_para_o_usuario ? (verdict.pergunta ?? lastBlock) : null,
        confidence: Number(verdict.confianca ?? 0.5),
        source: "ia",
      };
    } catch {
      // A IA nunca pode derrubar a reunião: cai para a heurística local.
      return {
        isQuestionForUser: Boolean(heuristic),
        detectedQuestion: heuristic,
        confidence: heuristic ? 0.6 : 0.1,
        source: "heuristica",
      };
    }
  });

// 2. Gerador de resposta sugerida para a pergunta detectada.
export const getSuggestedResponse = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        question: z.string().min(1),
        context: z.string().default(""),
        mode: z.string().default("Profissional"),
        transcript: z.string().default(""),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const estilos: Record<string, string> = {
      Curta: "Responda em no máximo 2 frases curtas e diretas.",
      Profissional: "Responda em tom profissional e cordial, em até 4 frases.",
      Técnica:
        "Responda com precisão técnica, citando termos e critérios do domínio, em até 5 frases.",
      Executiva: "Responda no formato executivo: conclusão primeiro, depois 2 pontos de apoio.",
      Objetiva: "Responda de forma objetiva, sem rodeios, em até 3 frases.",
      Detalhada: "Responda de forma detalhada, cobrindo contexto, ação e prazo.",
      Didática: "Responda de forma didática, explicando o raciocínio passo a passo.",
      Persuasiva: "Responda de forma persuasiva, destacando benefícios e evidências.",
    };

    try {
      const { text, model, serverMs } = await chat({
        temperature: 0.4,
        maxTokens: 500,
        messages: [
          {
            role: "system",
            content:
              "Você é um copiloto que sugere, em português do Brasil, o que a pessoa deve responder AGORA numa reunião ao vivo. " +
              "Escreva a resposta pronta para ser falada, em primeira pessoa, sem preâmbulos, sem markdown e sem se identificar como IA. " +
              (estilos[data.mode] ?? estilos.Profissional),
          },
          {
            role: "user",
            content:
              `Contexto da reunião: ${data.context || "não informado"}\n` +
              (data.transcript ? `\nTranscrição recente:\n${data.transcript}\n` : "") +
              `\nPergunta feita a você: "${data.question}"`,
          },
        ],
      });

      return { ok: true as const, text, model, serverMs, timestamp: Date.now() };
    } catch (err) {
      return {
        ok: false as const,
        text: "",
        model: "",
        serverMs: 0,
        timestamp: Date.now(),
        error: aiErrorMessage(err),
      };
    }
  });

// 3. Extração incremental de decisões, ações e pendências.
export const extractMeetingIntelligence = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        blocks: z.array(blockSchema),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const transcript = blocksToTranscript(data.blocks);

    if (!transcript.trim()) {
      return {
        ok: true as const,
        decisions: [],
        actions: [],
        pending: [],
        summary: "",
      };
    }

    try {
      const result = await chatJson<{
        decisoes: string[];
        acoes: Array<{ responsavel: string; tarefa: string; prazo: string }>;
        pendencias: string[];
        resumo: string;
      }>({
        temperature: 0.1,
        maxTokens: 1200,
        messages: [
          {
            role: "system",
            content:
              "Você extrai inteligência de transcrições de reuniões em português. Analise a transcrição e devolva APENAS JSON " +
              '{"decisoes": string[], "acoes": [{"responsavel": string, "tarefa": string, "prazo": string}], "pendencias": string[], "resumo": string}. ' +
              'Use "A definir" quando o prazo ou responsável não estiver explícito. Não invente itens que não estejam na transcrição.',
          },
          { role: "user", content: transcript },
        ],
      });

      return {
        ok: true as const,
        decisions: result.decisoes ?? [],
        actions: (result.acoes ?? []).map((a) => ({
          responsible: a.responsavel || "A definir",
          task: a.tarefa,
          deadline: a.prazo || "A definir",
        })),
        pending: result.pendencias ?? [],
        summary: result.resumo ?? "",
      };
    } catch (err) {
      return {
        ok: false as const,
        decisions: [],
        actions: [],
        pending: [],
        summary: "",
        error: aiErrorMessage(err),
      };
    }
  });

// 4. Geração da ata final estruturada.
export const generateMeetingMinutes = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        sessionId: z.string(),
        title: z.string().default("Reunião"),
        theme: z.string().default(""),
        transcription: z.array(blockSchema),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const transcript = blocksToTranscript(data.transcription);

    if (!transcript.trim()) {
      return {
        ok: false as const,
        error: "Não há transcrição suficiente para gerar a ata.",
      };
    }

    try {
      const ata = await chatJson<{
        titulo: string;
        objetivo: string;
        resumo: string;
        participantes: string[];
        decisoes: string[];
        acoes: Array<{ responsavel: string; tarefa: string; prazo: string }>;
        pendencias: string[];
      }>({
        temperature: 0.2,
        maxTokens: 2000,
        messages: [
          {
            role: "system",
            content:
              "Você redige atas de reunião em português do Brasil a partir da transcrição. Devolva APENAS JSON no formato " +
              '{"titulo": string, "objetivo": string, "resumo": string, "participantes": string[], "decisoes": string[], ' +
              '"acoes": [{"responsavel": string, "tarefa": string, "prazo": string}], "pendencias": string[]}. ' +
              "Baseie-se somente no que foi dito; não invente participantes nem decisões.",
          },
          {
            role: "user",
            content: `Título sugerido: ${data.title}\nTema: ${data.theme || "não informado"}\n\nTranscrição:\n${transcript}`,
          },
        ],
      });

      return {
        ok: true as const,
        id: crypto.randomUUID(),
        sessionId: data.sessionId,
        title: ata.titulo || data.title,
        date: new Date().toISOString(),
        objective: ata.objetivo ?? "",
        summary: ata.resumo ?? "",
        participants: ata.participantes ?? [],
        decisions: ata.decisoes ?? [],
        actions: (ata.acoes ?? []).map((a) => ({
          responsible: a.responsavel || "A definir",
          task: a.tarefa,
          deadline: a.prazo || "A definir",
        })),
        pending: ata.pendencias ?? [],
        transcript: data.transcription,
      };
    } catch (err) {
      return { ok: false as const, error: aiErrorMessage(err) };
    }
  });
