// Schema estruturado v2 para "Registro Inteligente com IA".
// Aditivo: convive com IrisAnalysis legada via `fromLegacyAnalysis`.
//
// O payload v2 fica em records.analysis_v2 (jsonb). Todos os campos são
// opcionais para permitir preencher progressivamente.

import type { IrisAnalysis } from "./iris-analyze";

export type ClassificationType =
  | "n3"
  | "inspecao"
  | "kaizen"
  | "meio_ambiente"
  | "condicao_insegura"
  | "ato_inseguro"
  | "desvio_operacional"
  | "oportunidade_melhoria"
  | "quase_acidente";

export type RiskLevel = "baixo" | "medio" | "alto" | "critico";
export type Priority = "baixa" | "media" | "alta" | "critica";

export type RecordStatusV2 =
  | "rascunho"
  | "pendente"
  | "aguardando_analise"
  | "aguardando_aprovacao"
  | "aprovado"
  | "reprovado"
  | "em_tratamento"
  | "aguardando_evidencia"
  | "concluido"
  | "vencido"
  | "cancelado";

export type Classification = {
  principal: ClassificationType;
  principal_label: string;
  secundarias: Array<{ tipo: ClassificationType; label: string; confianca: number }>;
  confianca: number; // 0..100
  justificativa: string;
  criterios_atendidos: string[];
  criterios_nao_atendidos: string[];
};

export type ApprovalScore = {
  atual: number; // 0..100
  estimado_apos_correcoes: number; // 0..100
  pontos_fortes: string[];
  pendencias: string[];
  evidencias_ausentes: string[];
  acoes_necessarias: string[];
  justificativa: string;
};

export type ActionPlan5W2H = {
  o_que: string;
  por_que: string;
  onde: string;
  quando: string; // texto ou ISO
  quem: string;
  como: string;
  quanto: string;
  data_inicio: string | null;
  data_limite: string | null;
  responsavel: string;
  equipe: string;
  prioridade: Priority;
  situacao: RecordStatusV2;
  observacoes: string;
  evidencia_necessaria: string;
};

export type BeforeAfterComparison = {
  mesmo_local_provavel: boolean;
  elementos_alterados: string[];
  risco_eliminado: boolean;
  melhoria_parcial: boolean;
  risco_residual: string;
  efetividade_pct: number; // 0..100
  necessita_nova_acao: boolean;
  recomendacao_final: string;
  verdict: "validada" | "parcial" | "nao_validada" | "insuficiente";
  observacoes: string;
};

export type TechnicalOpinion = {
  contexto: string;
  evidencia_observada: string;
  risco_identificado: string;
  consequencias_possiveis: string;
  requisitos_aplicaveis: string;
  acao_imediata: string;
  recomendacao_definitiva: string;
  risco_residual: string;
  conclusao: string;
};

export type GainBreakdown = {
  reducao_risco: { descricao: string; valor: number | null };
  tempo_economizado: { descricao: string; horas: number | null };
  custo_evitado: { descricao: string; valor: number | null };
  melhoria_operacional: string;
  reducao_retrabalho: string;
  reducao_exposicao: string;
  ganho_ambiental: string;
  ganho_produtividade: string;
  memoria_calculo: string[]; // linhas
  dados_suficientes_financeiro: boolean;
};

export type ExecutiveSummary = {
  classificacao_sugerida: string;
  tipo_registro: ClassificationType;
  probabilidade_aprovacao: number;
  nivel_risco: RiskLevel;
  prioridade: Priority;
  area: string;
  local: string;
  responsavel: string;
  prazo_recomendado: string;
  status_atual: RecordStatusV2;
  pontuacao_geral: number; // 0..100
};

export type HumanReview = {
  action:
    | "aprovada"
    | "editada"
    | "reclassificada"
    | "nova_analise_solicitada"
    | "erro_reportado"
    | "encaminhada";
  by: string | null;
  at: string;
  note: string | null;
  before?: Partial<AnalysisV2>;
  after?: Partial<AnalysisV2>;
};

export type StatusHistoryEntry = {
  from: RecordStatusV2 | null;
  to: RecordStatusV2;
  at: string;
  by: string | null;
  note: string | null;
};

export type AnalysisV2 = {
  version: 2;
  summary: ExecutiveSummary;
  classification: Classification;
  approval: ApprovalScore;
  risks: string[];
  hazards: string[];
  immediate_action: string;
  action_plan: ActionPlan5W2H;
  before_after: BeforeAfterComparison | null;
  technical_opinion: TechnicalOpinion;
  gains: GainBreakdown;
  is_simulated_image: boolean; // marca "Imagem ilustrativa" no PDF
  raw_legacy?: IrisAnalysis;
};

// ---------- Adaptador do payload legado ----------

const LEGACY_TYPE_TO_V2: Record<string, ClassificationType> = {
  N3: "n3",
  NaoConformidade: "n3",
  Kaizen: "kaizen",
  Inspecao: "inspecao",
  CondicaoSegura: "inspecao",
  MeioAmbiente: "meio_ambiente",
};

const V2_LABELS: Record<ClassificationType, string> = {
  n3: "N3",
  inspecao: "Inspeção",
  kaizen: "Kaizen",
  meio_ambiente: "Meio Ambiente",
  condicao_insegura: "Condição Insegura",
  ato_inseguro: "Ato Inseguro",
  desvio_operacional: "Desvio Operacional",
  oportunidade_melhoria: "Oportunidade de Melhoria",
  quase_acidente: "Quase Acidente",
};

export function classificationLabel(t: ClassificationType): string {
  return V2_LABELS[t] ?? t;
}

function toRiskLevel(n: string): RiskLevel {
  const s = (n || "").toLowerCase();
  if (s === "critico" || s === "crítico") return "critico";
  if (s === "alto") return "alto";
  if (s === "medio" || s === "médio") return "medio";
  return "baixo";
}

function toPriority(r: RiskLevel): Priority {
  return r === "critico" ? "critica" : r === "alto" ? "alta" : r === "medio" ? "media" : "baixa";
}

export function fromLegacyAnalysis(
  a: IrisAnalysis,
  ctx?: {
    area?: string;
    local?: string;
    responsavel?: string;
    hasBefore?: boolean;
    hasAfter?: boolean;
    simulated?: boolean;
  },
): AnalysisV2 {
  const tipo: ClassificationType = LEGACY_TYPE_TO_V2[a.tipo_registro] ?? "n3";
  const risco = toRiskLevel(a.nivel_risco);
  const prioridade = toPriority(risco);
  const prazo = a.necessita_interdicao ? "Imediato" : "7 dias";
  const approvalNow = Math.min(100, Math.max(0, Math.round(a.score_confianca ?? 0)));
  const potentialGain = Math.min(100 - approvalNow, 25);

  return {
    version: 2,
    summary: {
      classificacao_sugerida: V2_LABELS[tipo],
      tipo_registro: tipo,
      probabilidade_aprovacao: approvalNow,
      nivel_risco: risco,
      prioridade,
      area: ctx?.area ?? "",
      local: ctx?.local ?? "",
      responsavel: ctx?.responsavel ?? "Supervisor de Operações",
      prazo_recomendado: prazo,
      status_atual: "rascunho",
      pontuacao_geral: approvalNow,
    },
    classification: {
      principal: tipo,
      principal_label: V2_LABELS[tipo],
      secundarias: [],
      confianca: approvalNow,
      justificativa:
        a.condicao_observada ||
        `Classificação sugerida a partir do tipo detectado: ${a.tipo_registro}.`,
      criterios_atendidos: (a.riscos ?? []).slice(0, 3).map((r) => `Risco descrito: ${r}`),
      criterios_nao_atendidos: [],
    },
    approval: {
      atual: approvalNow,
      estimado_apos_correcoes: Math.min(100, approvalNow + potentialGain),
      pontos_fortes: (a.riscos ?? []).slice(0, 2),
      pendencias: [
        !ctx?.responsavel ? "Definir responsável" : "",
        !ctx?.area ? "Informar área" : "",
      ].filter(Boolean) as string[],
      evidencias_ausentes: ctx?.hasAfter ? [] : ["Foto do depois (comprovação da correção)"],
      acoes_necessarias: [a.acao_imediata, a.acao_corretiva].filter(Boolean),
      justificativa:
        "Pontuação inicial baseada na confiança da análise. Preencher responsável, prazo, foto final e evidências para elevar a chance.",
    },
    risks: a.riscos ?? [],
    hazards: a.perigos ?? [],
    immediate_action: a.acao_imediata ?? "",
    action_plan: {
      o_que: a.acao_corretiva || a.titulo || "",
      por_que: (a.riscos ?? []).join("; "),
      onde: [ctx?.area, ctx?.local].filter(Boolean).join(" - "),
      quando: prazo,
      quem: ctx?.responsavel ?? "Supervisor de Operações",
      como: a.acao_preventiva || "",
      quanto: "",
      data_inicio: null,
      data_limite: null,
      responsavel: ctx?.responsavel ?? "Supervisor de Operações",
      equipe: "",
      prioridade,
      situacao: "rascunho",
      observacoes: "",
      evidencia_necessaria: "Foto após correção e parecer do responsável.",
    },
    before_after:
      ctx?.hasBefore && ctx?.hasAfter
        ? {
            mesmo_local_provavel: true,
            elementos_alterados: [],
            risco_eliminado: false,
            melhoria_parcial: true,
            risco_residual: "A ser confirmado após inspeção humana.",
            efetividade_pct: 0,
            necessita_nova_acao: false,
            recomendacao_final:
              "Comparação estruturada será gerada após a IA processar o par de imagens.",
            verdict: "insuficiente",
            observacoes: "",
          }
        : null,
    technical_opinion: {
      contexto: a.condicao_observada || "",
      evidencia_observada: a.descricao || "",
      risco_identificado: (a.riscos ?? []).join("; "),
      consequencias_possiveis: (a.perigos ?? []).join("; "),
      requisitos_aplicaveis: "",
      acao_imediata: a.acao_imediata || "",
      recomendacao_definitiva: a.acao_corretiva || "",
      risco_residual: "",
      conclusao: a.relatorio_proposto || "",
    },
    gains: {
      reducao_risco: {
        descricao: `Redução do nível de risco: ${a.nivel_risco}.`,
        valor: null,
      },
      tempo_economizado: { descricao: "", horas: null },
      custo_evitado: { descricao: "", valor: null },
      melhoria_operacional: "",
      reducao_retrabalho: "",
      reducao_exposicao: (a.perigos ?? []).join("; "),
      ganho_ambiental: "",
      ganho_produtividade: "",
      memoria_calculo: [
        "Ganhos financeiros não estimados automaticamente.",
        "Informe valor confirmado para calcular custo evitado e produtividade.",
      ],
      dados_suficientes_financeiro: false,
    },
    is_simulated_image: !!ctx?.simulated,
    raw_legacy: a,
  };
}
