// Cliente para os dois modos separados de IA:
//   • N3 (auditor): identifica riscos, NÃO propõe solução.
//   • Kaizen (engenharia): recebe 1 risco e propõe melhorias.

import { supabase } from "@/integrations/supabase/client";
import { ensureFreshSession } from "@/lib/iris-analyze";

export type N3Risk = {
  id: string;
  categoria:
    | "mecanico"
    | "eletrico"
    | "estrutural"
    | "ergonomico"
    | "ambiental"
    | "quimico"
    | "operacional"
    | "ato_inseguro"
    | "condicao_insegura"
    | string;
  perigo: string;
  risco: string;
  evidencia: string;
  norma: string;
  ato_ou_condicao: string;
  probabilidade: number;
  severidade: number;
  criticidade: "baixo" | "medio" | "alto" | "critico" | string;
  conformidade: "conforme" | "nao_conforme" | "nao_aplicavel" | string;
  score: number;
};

export type N3Result = {
  resumo_auditoria: string;
  necessita_interdicao: boolean;
  score_confianca: number;
  riscos: N3Risk[];
  priorizacao: string[];
};

export type KaizenImprovement = {
  id: string;
  eixo:
    | "seguranca"
    | "mecanica"
    | "eletrica"
    | "civil"
    | "estrutural"
    | "ambiental"
    | "operacional"
    | "ergonomia"
    | "financeiro"
    | "produtividade"
    | "qualidade"
    | "confiabilidade"
    | "manutencao"
    | string;
  problema: string;
  causa_raiz: string;
  solucao: string;
  beneficio: string;
  custo_estimado: "baixo" | "medio" | "alto" | string;
  prioridade: number;
  prazo_dias: number;
  roi_qualitativo: string;
  impacto: string;
  antes_depois: string;
};

export type KaizenResult = {
  recomendacao_principal: string;
  resumo_engenharia: string;
  melhorias: KaizenImprovement[];
};

function extractErrMsg(error: unknown, fallback: string): string {
  const anyErr = error as { message?: string; context?: { body?: unknown } } | null;
  const body = anyErr?.context?.body;
  try {
    if (typeof body === "string" && body) {
      const j = JSON.parse(body) as { error?: string };
      if (j?.error) return j.error;
    } else if (body && typeof body === "object" && "error" in body) {
      return String((body as { error: string }).error);
    }
  } catch {
    /* ignore */
  }
  return anyErr?.message ?? fallback;
}

export async function analisarN3(input: {
  image?: string;
  images?: string[];
  context?: string;
}): Promise<N3Result> {
  await ensureFreshSession();
  const { data, error } = await supabase.functions.invoke<N3Result | { error: string }>(
    "analisar-com-iris",
    { body: { mode: "n3", ...input } },
  );
  if (error) throw new Error(extractErrMsg(error, "Falha ao executar auditoria N3."));
  if (!data || typeof data !== "object" || "error" in (data as object)) {
    throw new Error((data as { error?: string })?.error ?? "Resposta inválida da IA (N3).");
  }
  return data as N3Result;
}

export async function gerarKaizen(input: {
  risco: N3Risk;
  image?: string;
  images?: string[];
  context?: string;
}): Promise<KaizenResult> {
  await ensureFreshSession();
  const { data, error } = await supabase.functions.invoke<KaizenResult | { error: string }>(
    "analisar-com-iris",
    { body: { mode: "kaizen", ...input } },
  );
  if (error) throw new Error(extractErrMsg(error, "Falha ao gerar Kaizen."));
  if (!data || typeof data !== "object" || "error" in (data as object)) {
    throw new Error((data as { error?: string })?.error ?? "Resposta inválida da IA (Kaizen).");
  }
  return data as KaizenResult;
}

export function criticidadeColor(c: string): string {
  switch (c) {
    case "critico":
      return "bg-red-600 text-white border-red-700";
    case "alto":
      return "bg-orange-500 text-white border-orange-600";
    case "medio":
      return "bg-amber-400 text-black border-amber-500";
    default:
      return "bg-emerald-500 text-white border-emerald-600";
  }
}

export function eixoLabel(e: string): string {
  const map: Record<string, string> = {
    seguranca: "Segurança",
    mecanica: "Mecânica",
    eletrica: "Elétrica",
    civil: "Civil",
    estrutural: "Estrutural",
    ambiental: "Ambiental",
    operacional: "Operacional",
    ergonomia: "Ergonomia",
    financeiro: "Financeiro",
    produtividade: "Produtividade",
    qualidade: "Qualidade",
    confiabilidade: "Confiabilidade",
    manutencao: "Manutenção",
  };
  return map[e] ?? e;
}

export function categoriaLabel(c: string): string {
  const map: Record<string, string> = {
    mecanico: "Mecânico",
    eletrico: "Elétrico",
    estrutural: "Estrutural",
    ergonomico: "Ergonômico",
    ambiental: "Ambiental",
    quimico: "Químico",
    operacional: "Operacional",
    ato_inseguro: "Ato Inseguro",
    condicao_insegura: "Condição Insegura",
  };
  return map[c] ?? c;
}
