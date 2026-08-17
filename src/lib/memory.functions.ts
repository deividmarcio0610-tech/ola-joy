import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AiError, chatJson, isAiConfigured } from "./vllm.server";

/**
 * Memória profissional do usuário (tabela public.professional_memories):
 * análise do texto pela IA, gravação, listagem e exclusão.
 */

export const MEMORY_CATEGORIES = [
  "PERFIL",
  "FORMAÇÃO",
  "EXPERIÊNCIA",
  "EMPRESA",
  "CARGO",
  "PROJETO",
  "COMPETÊNCIA",
  "CERTIFICAÇÃO",
  "CURSO",
  "RESULTADO",
  "CONHECIMENTO TÉCNICO",
  "HISTÓRIA PROFISSIONAL",
  "RESPOSTA PREFERIDA",
] as const;

export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export interface ProfessionalMemory {
  id: string;
  category: MemoryCategory;
  content: string;
  summary: string;
  keywords: string[];
  createdAt: string;
}

const categorySchema = z.enum(MEMORY_CATEGORIES);

interface MemoryRow {
  id: string;
  category: string;
  content: string;
  summary: string | null;
  keywords: string[] | null;
  created_at: string;
}

function toMemory(row: MemoryRow): ProfessionalMemory {
  return {
    id: row.id,
    category: row.category as MemoryCategory,
    content: row.content,
    summary: row.summary ?? "",
    keywords: row.keywords ?? [],
    createdAt: row.created_at,
  };
}

/** Classificação e resumo do texto livre digitado pelo usuário. */
export const analyzeMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ content: z.string().min(10) }).parse(data))
  .handler(async ({ data }) => {
    if (!isAiConfigured()) {
      return {
        ok: false as const,
        error: "IA não configurada: defina VLLM_BASE_URL apontando para o seu servidor vLLM.",
      };
    }

    try {
      const result = await chatJson<{
        categoria: string;
        resumo: string;
        palavras_chave: string[];
      }>({
        temperature: 0.1,
        maxTokens: 500,
        messages: [
          {
            role: "system",
            content:
              "Você organiza a memória profissional de um usuário em português. Classifique o texto em UMA categoria " +
              `da lista: ${MEMORY_CATEGORIES.join(", ")}. Responda apenas com JSON ` +
              '{"categoria": string, "resumo": string (1 frase), "palavras_chave": string[] (3 a 6 termos extraídos do próprio texto)}.',
          },
          { role: "user", content: data.content },
        ],
      });

      const parsedCategory = categorySchema.safeParse((result.categoria ?? "").toUpperCase());

      return {
        ok: true as const,
        category: parsedCategory.success
          ? parsedCategory.data
          : ("HISTÓRIA PROFISSIONAL" as MemoryCategory),
        summary: result.resumo ?? "",
        keywords: (result.palavras_chave ?? []).slice(0, 6),
      };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof AiError ? err.message : String((err as Error)?.message ?? err),
      };
    }
  });

export const listMemories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("professional_memories")
      .select("id, category, content, summary, keywords, created_at")
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Falha ao carregar a memória: ${error.message}`);
    return (data ?? []).map((row) => toMemory(row as unknown as MemoryRow));
  });

export const saveMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        category: categorySchema,
        content: z.string().min(1),
        summary: z.string().default(""),
        keywords: z.array(z.string()).default([]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("professional_memories")
      .insert({
        user_id: context.userId,
        category: data.category,
        content: data.content,
        summary: data.summary,
        keywords: data.keywords,
      })
      .select("id, category, content, summary, keywords, created_at")
      .single();

    if (error) throw new Error(`Falha ao salvar a memória: ${error.message}`);
    return toMemory(row as unknown as MemoryRow);
  });

export const deleteMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("professional_memories")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(`Falha ao excluir a memória: ${error.message}`);
    return { ok: true as const };
  });

/**
 * Currículo: recebe o texto extraído do arquivo no browser, estrutura com IA
 * e grava em public.resumes.
 */
export const parseResume = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        fileName: z.string().min(1),
        contentText: z.string().min(30, "Texto do currículo curto demais para análise."),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    if (!isAiConfigured()) {
      return {
        ok: false as const,
        error: "IA não configurada: defina VLLM_BASE_URL apontando para o seu servidor vLLM.",
      };
    }

    let parsed: {
      nome: string;
      cargo: string;
      anos_experiencia: number;
      competencias: string[];
      resumo: string;
      experiencias: Array<{ empresa: string; cargo: string; periodo: string }>;
    };

    try {
      parsed = await chatJson({
        temperature: 0.1,
        maxTokens: 1500,
        messages: [
          {
            role: "system",
            content:
              "Você extrai dados estruturados de currículos em português. Responda apenas com JSON " +
              '{"nome": string, "cargo": string, "anos_experiencia": number, "competencias": string[], "resumo": string, ' +
              '"experiencias": [{"empresa": string, "cargo": string, "periodo": string}]}. ' +
              'Use "" ou [] quando a informação não estiver no currículo; nunca invente dados.',
          },
          { role: "user", content: data.contentText.slice(0, 20000) },
        ],
      });
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof AiError ? err.message : String((err as Error)?.message ?? err),
      };
    }

    const parsedData = {
      name: parsed.nome ?? "",
      role: parsed.cargo ?? "",
      experienceYears: Number(parsed.anos_experiencia ?? 0),
      skills: parsed.competencias ?? [],
      summary: parsed.resumo ?? "",
      experiences: parsed.experiencias ?? [],
    };

    // Só um currículo fica ativo por usuário.
    await context.supabase
      .from("resumes")
      .update({ is_active: false })
      .eq("user_id", context.userId)
      .eq("is_active", true);

    const { data: row, error } = await context.supabase
      .from("resumes")
      .insert({
        user_id: context.userId,
        file_path: data.fileName,
        content_text: data.contentText.slice(0, 100000),
        parsed_data: parsedData,
        is_active: true,
      })
      .select("id, file_path, parsed_data, created_at")
      .single();

    if (error) throw new Error(`Falha ao salvar o currículo: ${error.message}`);

    return {
      ok: true as const,
      id: (row as { id: string }).id,
      fileName: data.fileName,
      parsed: parsedData,
    };
  });

export const getActiveResume = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("resumes")
      .select("id, file_path, parsed_data, created_at")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(`Falha ao carregar o currículo: ${error.message}`);
    if (!data) return null;

    const row = data as { id: string; file_path: string; parsed_data: unknown; created_at: string };
    return {
      id: row.id,
      fileName: row.file_path,
      createdAt: row.created_at,
      parsed: (row.parsed_data ?? {}) as {
        name?: string;
        role?: string;
        experienceYears?: number;
        skills?: string[];
        summary?: string;
        experiences?: Array<{ empresa: string; cargo: string; periodo: string }>;
      },
    };
  });
