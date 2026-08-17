import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { AiGatewayError, chatJson, isAiConfigured } from "./ai-gateway.server";

/**
 * Funções de servidor do simulador de entrevistas.
 *
 * Duas responsabilidades, ambas apoiadas no Lovable AI Gateway:
 *  1. gerar perguntas específicas para a vaga/área/nível informados;
 *  2. avaliar as RESPOSTAS REAIS digitadas/ditadas pelo candidato.
 *
 * Regra do módulo: nenhuma nota, percentual ou comentário é fabricado aqui.
 * Se a IA não estiver disponível, o retorno diz isso de forma explícita —
 * a UI mostra o erro em vez de inventar números.
 */

export interface InterviewPerQuestionFeedback {
  question: string;
  comment: string;
  score: number;
}

/** Origem das perguntas exibidas ao usuário. */
export type InterviewQuestionSource = "ia" | "padrao" | "erro";

/** Traduz erros do gateway em mensagens que a UI pode exibir direto ao usuário. */
function aiErrorMessage(err: unknown): string {
  if (err instanceof AiGatewayError) return err.message;
  return String((err as Error)?.message ?? err);
}

function clampNumber(value: unknown, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function toStringList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter((item) => item.length > 0)
    .slice(0, limit);
}

/**
 * Roteiro genérico usado somente quando a IA não está configurada.
 * São perguntas de entrevista clássicas parametrizadas pelo cargo — nunca
 * são apresentadas como se tivessem sido geradas pela IA (ver campo `source`).
 */
function fallbackQuestions(
  vaga: string,
  area: string,
  nivel: string,
  quantidade: number,
): string[] {
  const cargo = vaga.trim() || "a vaga";
  const setor = area.trim() || "sua área";
  const base = [
    `Conte sua trajetória profissional e por que ela faz sentido para a vaga de ${cargo}.`,
    `Descreva um projeto de ${setor} do qual você participou: qual era o problema, o que você fez e qual foi o resultado?`,
    "Fale sobre uma situação em que algo deu errado sob sua responsabilidade. Como você reagiu e o que mudou depois?",
    `Quais conhecimentos técnicos você considera indispensáveis para atuar como ${cargo} no nível ${nivel}?`,
    "Descreva um conflito com um colega ou cliente e como você chegou a um desfecho.",
    "Conte uma situação em que você precisou decidir com informação incompleta e prazo curto.",
    `Como você se mantém atualizado em ${setor} e como aplicou algo novo recentemente no trabalho?`,
    `Onde você quer estar profissionalmente em dois anos e como a vaga de ${cargo} entra nesse plano?`,
  ];
  return base.slice(0, Math.max(1, Math.min(quantidade, base.length)));
}

// 1. Geração das perguntas da entrevista.
export const generateInterviewQuestions = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        area: z.string().default(""),
        vaga: z.string().default(""),
        nivel: z.string().default("Pleno"),
        quantidade: z.number().int().min(1).max(10).default(5),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { area, vaga, nivel, quantidade } = data;

    if (!isAiConfigured()) {
      return {
        ok: true as const,
        source: "padrao" as InterviewQuestionSource,
        questions: fallbackQuestions(vaga, area, nivel, quantidade),
        notice:
          "IA não configurada no servidor (LOVABLE_API_KEY ausente). Estas são perguntas padrão, " +
          "não foram geradas para a sua vaga.",
      };
    }

    try {
      const result = await chatJson<{ perguntas: string[] }>({
        temperature: 0.6,
        maxTokens: 900,
        messages: [
          {
            role: "system",
            content:
              "Você é um entrevistador sênior brasileiro. Gere perguntas de entrevista em português do Brasil, " +
              "específicas para o cargo, a área e o nível de senioridade informados. " +
              `Gere exatamente ${quantidade} perguntas, uma por item. ` +
              "Misture perguntas comportamentais (que peçam situações reais, no formato STAR) e perguntas técnicas do domínio. " +
              "Cada pergunta deve ser uma única frase clara, sem numeração, sem markdown e sem comentários. " +
              'Responda APENAS com JSON no formato {"perguntas": string[]}.',
          },
          {
            role: "user",
            content:
              `Cargo/Vaga: ${vaga || "não informado"}\n` +
              `Área de atuação: ${area || "não informada"}\n` +
              `Nível de senioridade: ${nivel}\n` +
              `Quantidade de perguntas: ${quantidade}`,
          },
        ],
      });

      const questions = toStringList(result?.perguntas, quantidade);

      if (questions.length === 0) {
        return {
          ok: false as const,
          source: "erro" as InterviewQuestionSource,
          questions: [] as string[],
          notice: "",
          error: "A IA não devolveu nenhuma pergunta utilizável. Tente novamente.",
        };
      }

      return {
        ok: true as const,
        source: "ia" as InterviewQuestionSource,
        questions,
        notice: "",
      };
    } catch (err) {
      return {
        ok: false as const,
        source: "erro" as InterviewQuestionSource,
        questions: [] as string[],
        notice: "",
        error: aiErrorMessage(err),
      };
    }
  });

// 2. Avaliação das respostas reais do candidato.
export const evaluateInterviewAnswers = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        area: z.string().default(""),
        vaga: z.string().default(""),
        nivel: z.string().default("Pleno"),
        answers: z
          .array(
            z.object({
              question: z.string().default(""),
              answer: z.string().default(""),
            }),
          )
          .min(1),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { area, vaga, nivel } = data;

    const answered = data.answers.filter((item) => item.answer.trim().length > 0);

    if (answered.length === 0) {
      return {
        ok: false as const,
        error:
          "Nenhuma resposta foi registrada. Grave ou digite pelo menos uma resposta antes de pedir a análise.",
      };
    }

    if (!isAiConfigured()) {
      return {
        ok: false as const,
        error:
          "IA não configurada no servidor (LOVABLE_API_KEY ausente). Sem ela não há como avaliar as respostas — " +
          "nenhuma nota será exibida.",
      };
    }

    const transcript = data.answers
      .map(
        (item, i) =>
          `PERGUNTA ${i + 1}: ${item.question}\nRESPOSTA ${i + 1}: ${
            item.answer.trim() || "(sem resposta)"
          }`,
      )
      .join("\n\n");

    try {
      const result = await chatJson<{
        nota_geral: number;
        aderencia_star: number;
        pontos_fortes: string[];
        pontos_a_melhorar: string[];
        resumo: string;
        por_pergunta: Array<{ pergunta: string; comentario: string; nota: number }>;
      }>({
        temperature: 0.2,
        maxTokens: 2000,
        messages: [
          {
            role: "system",
            content:
              "Você é um avaliador de entrevistas de emprego, brasileiro, rigoroso e honesto. " +
              "Avalie EXCLUSIVAMENTE o conteúdo literal das respostas transcritas que receber.\n" +
              "REGRAS ABSOLUTAS:\n" +
              "1. É PROIBIDO inventar experiências, empresas, ferramentas, métricas, números ou resultados que não " +
              "estejam escritos na resposta do candidato. Se não está no texto, não existe.\n" +
              "2. É PROIBIDO avaliar tom de voz, hesitação, nervosismo, linguagem corporal ou qualquer sinal " +
              "não textual: você recebe apenas texto transcrito.\n" +
              "3. Respostas vazias, muito curtas, genéricas ou fora do tema devem receber nota baixa, e o comentário " +
              "deve dizer exatamente isso, sem suavizar.\n" +
              "4. A aderência ao método STAR (0 a 100) deve refletir a presença EXPLÍCITA de Situação, Tarefa, " +
              "Ação e Resultado no texto. Se o candidato não citou resultado, a aderência não pode ser alta.\n" +
              "5. Pontos fortes e pontos a melhorar devem citar trechos ou fatos presentes nas respostas.\n" +
              "Responda APENAS com JSON no formato " +
              '{"nota_geral": number de 0 a 10, "aderencia_star": number de 0 a 100, "pontos_fortes": string[], ' +
              '"pontos_a_melhorar": string[], "resumo": string, ' +
              '"por_pergunta": [{"pergunta": string, "comentario": string, "nota": number de 0 a 10}]}. ' +
              "O array por_pergunta deve ter um item para CADA pergunta recebida, na mesma ordem.",
          },
          {
            role: "user",
            content:
              `Vaga: ${vaga || "não informada"}\n` +
              `Área: ${area || "não informada"}\n` +
              `Nível esperado: ${nivel}\n\n` +
              `Transcrição da entrevista (${answered.length} de ${data.answers.length} perguntas respondidas):\n\n${transcript}`,
          },
        ],
      });

      const perQuestion: InterviewPerQuestionFeedback[] = data.answers.map((item, i) => {
        const raw = Array.isArray(result?.por_pergunta) ? result.por_pergunta[i] : undefined;
        const hasAnswer = item.answer.trim().length > 0;
        return {
          question: item.question,
          comment: hasAnswer
            ? String(raw?.comentario ?? "").trim() || "A IA não comentou esta resposta."
            : "Pergunta não respondida.",
          score: hasAnswer ? clampNumber(raw?.nota, 0, 10) : 0,
        };
      });

      return {
        ok: true as const,
        score: Math.round(clampNumber(result?.nota_geral, 0, 10) * 10) / 10,
        starAdherence: Math.round(clampNumber(result?.aderencia_star, 0, 100)),
        strengths: toStringList(result?.pontos_fortes, 8),
        improvements: toStringList(result?.pontos_a_melhorar, 8),
        summary: String(result?.resumo ?? "").trim(),
        answeredCount: answered.length,
        totalQuestions: data.answers.length,
        perQuestion,
      };
    } catch (err) {
      return { ok: false as const, error: aiErrorMessage(err) };
    }
  });
