// Cliente da IA 5S — módulo Inspeção do ValeTech IA.
// Auditoria EXCLUSIVA dos 5 sensos: Seiri, Seiton, Seiso, Seiketsu, Shitsuke.
// Não avalia segurança, NRs, meio ambiente, Kaizen, N3 ou riscos.

import { ensureFreshSession } from "@/lib/iris-analyze";
import { callVpsRoute } from "@/lib/vps-ai/call";

export type Senso5SKey = "seiri" | "seiton" | "seiso" | "seiketsu" | "shitsuke";

export type Senso5S = {
  nota: number;
  observacoes: string;
  problemas: string[];
  melhorias: string[];
};

export type Inspecao5SResult = {
  resumo_executivo: string;
  sensos: Record<Senso5SKey, Senso5S>;
  nota_final: number;
  classificacao: string;
  problemas_gerais: string[];
  melhorias_gerais: string[];
  checklist: { item: string; conforme: boolean }[];
};

export const SENSO_LABEL: Record<Senso5SKey, { nome: string; jp: string; desc: string }> = {
  seiri: { nome: "Utilização", jp: "Seiri", desc: "Separar o necessário do desnecessário" },
  seiton: { nome: "Organização", jp: "Seiton", desc: "Um lugar para cada coisa" },
  seiso: { nome: "Limpeza", jp: "Seiso", desc: "Ambiente limpo e conservado" },
  seiketsu: { nome: "Padronização", jp: "Seiketsu", desc: "Padrões visuais e procedimentos" },
  shitsuke: { nome: "Disciplina", jp: "Shitsuke", desc: "Manter o padrão continuamente" },
};

export function corDaNota(nota: number): string {
  if (nota >= 85) return "bg-emerald-500 text-white border-emerald-600";
  if (nota >= 70) return "bg-lime-500 text-black border-lime-600";
  if (nota >= 50) return "bg-amber-400 text-black border-amber-500";
  return "bg-red-600 text-white border-red-700";
}

export async function auditar5S(input: {
  images: string[];
  context?: string;
}): Promise<Inspecao5SResult> {
  await ensureFreshSession();
  const data = await callVpsRoute<Inspecao5SResult | { error: string }>("/api/vps/analisar", {
    mode: "5s",
    images: input.images,
    context: input.context,
  });
  if (!data || typeof data !== "object" || "error" in data) {
    throw new Error((data as { error?: string })?.error ?? "Resposta inválida da IA (5S).");
  }
  return data as Inspecao5SResult;
}
