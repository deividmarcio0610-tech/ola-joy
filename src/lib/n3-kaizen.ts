// Cliente para os dois modos de IA: N3 (auditor) e Kaizen (engenharia).
// Toda inferência passa pela API da VPS via /api/vps/analisar.

import { ensureFreshSession } from "@/lib/iris-analyze";
import { callVpsRoute } from "@/lib/vps-ai/call";

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
  eixo: string;
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

export async function analisarN3(input: {
  image?: string;
  images?: string[];
  context?: string;
}): Promise<N3Result> {
  await ensureFreshSession();
  const data = await callVpsRoute<N3Result | { error: string }>("/api/vps/analisar", {
    mode: "n3",
    ...input,
  });
  if (!data || typeof data !== "object" || "error" in data) {
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
  const data = await callVpsRoute<KaizenResult | { error: string }>("/api/vps/analisar", {
    mode: "kaizen",
    ...input,
  });
  if (!data || typeof data !== "object" || "error" in data) {
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
