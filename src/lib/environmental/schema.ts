// Tipos e enums do módulo de Auditoria Ambiental N3.
// Alinhado com as tabelas environmental_audits / _findings / _actions / _attachments.

export type EnvSeverity = "muito_baixo" | "baixo" | "moderado" | "alto" | "critico";

export type EnvFindingLevel = "N1" | "N2" | "N3";

export type EnvControlLevel =
  | "eliminacao"
  | "substituicao"
  | "engenharia"
  | "administrativo"
  | "epi";

export type EnvMedium = "solo" | "agua" | "ar" | "flora_fauna" | "misto" | "nao_identificado";

export type EnvActionPriority = "baixa" | "media" | "alta" | "critica";
export type EnvActionStatus = "pendente" | "em_andamento" | "concluida" | "cancelada";

// Especialistas do Conselho (Fase 2). Já declarados para uso da Fase 1 no prompt.
export const ENV_SPECIALISTS = [
  "engenheiro_ambiental",
  "biologo",
  "quimico",
  "geologo_hidrogeologo",
  "engenheiro_florestal",
  "advogado_ambiental",
  "auditor_iso_14001",
  "gestor_residuos",
  "cetico",
] as const;
export type EnvSpecialist = (typeof ENV_SPECIALISTS)[number];

// Categorias de aspecto/impacto ambiental usadas em findings.
export const ENV_CATEGORIES = [
  "vazamento",
  "derramamento",
  "contaminacao_solo",
  "contaminacao_agua",
  "emissao_atmosferica",
  "poeira",
  "fumaca",
  "gases",
  "ruido",
  "vibracao",
  "residuo_perigoso",
  "residuo_nao_perigoso",
  "segregacao_incorreta",
  "armazenamento_inadequado",
  "descarte_irregular",
  "falha_contencao",
  "falha_drenagem",
  "efluente",
  "produto_quimico",
  "oleo",
  "combustivel",
  "material_contaminado",
  "supressao_vegetal",
  "danos_fauna",
  "danos_flora",
  "assoreamento",
  "erosao",
  "obstrucao_canaleta",
  "desperdicio_agua",
  "desperdicio_energia",
  "falha_organizacao",
  "falha_documental",
  "nao_conformidade",
  "oportunidade_melhoria",
  "boa_pratica",
  "emergencia_ambiental",
  "outro",
] as const;
export type EnvCategory = (typeof ENV_CATEGORIES)[number];

// Payload retornado pela análise multidisciplinar (Fase 1 - análise única).
export type EnvAnalysisResult = {
  titulo: string;
  resumo_executivo: string;
  confianca: "baixa" | "media" | "alta";
  necessita_mais_evidencia: boolean;
  motivo_evidencia_insuficiente?: string | null;
  categorias: EnvCategory[];
  aspecto_principal: string;
  aspectos_secundarios: string[];
  impacto_direto: string;
  impacto_indireto: string;
  meio_afetado: EnvMedium;
  fonte: string;
  material: string;
  nivel: EnvFindingLevel;
  severidade: EnvSeverity;
  score: number; // 0-100 (100 = risco máximo)
  matriz: {
    severidade: number;
    probabilidade: number;
    abrangencia: number;
    persistencia: number;
    sensibilidade: number;
    controle: number;
    justificativa: string;
  };
  requisitos_legais: Array<{
    norma: string;
    artigo?: string;
    descricao: string;
  }>;
  acoes_imediatas: EnvActionDraft[];
  acoes_corretivas: EnvActionDraft[];
  acoes_preventivas: EnvActionDraft[];
  melhor_solucao: string;
  parecer_auditoria: {
    observado: string;
    criterio: string;
    tipo_achado:
      | "conforme"
      | "conforme_com_observacao"
      | "oportunidade_melhoria"
      | "nc_menor"
      | "nc_maior"
      | "critica"
      | "emergencia_ambiental";
    consequencia: string;
    recomendacao: string;
    prioridade: EnvActionPriority;
  };
  aspectos_impactos?: Array<{
    atividade: string;
    aspecto: string;
    impacto: string;
    condicao: "normal" | "anormal" | "emergencia";
    frequencia: "rara" | "ocasional" | "frequente" | "continua";
    severidade: 1 | 2 | 3 | 4 | 5;
    abrangencia: "pontual" | "local" | "regional" | "global";
    controle: string;
    significancia: "baixa" | "media" | "alta";
    indicador: string;
  }>;
  cenarios?: {
    economica: EnvScenario;
    recomendada: EnvScenario;
    ideal: EnvScenario;
  };
  pdca?: {
    planejar: string;
    executar: string;
    verificar: string;
    agir: string;
  };
};

export type EnvScenario = {
  titulo: string;
  descricao: string;
  custo_estimado: string;
  prazo: string;
  eficiencia: string;
  risco_residual: string;
  manutencao: string;
  beneficio: string;
  vida_util: string;
  replicacao: string;
};

export type EnvActionDraft = {
  descricao: string;
  o_que: string;
  por_que: string;
  onde: string;
  quando: string;
  quem: string;
  como: string;
  quanto?: string;
  controle: EnvControlLevel;
  prioridade: EnvActionPriority;
  evidencia_requerida: string;
};

export type EnvAttachmentKind = "image" | "pdf" | "spreadsheet" | "video" | "audio" | "other";

export type EnvAttachmentInput = {
  file: File;
  kind: EnvAttachmentKind;
};

export const MAX_ATTACHMENT_MB = 25;
export const ACCEPTED_MIME: Record<EnvAttachmentKind, string[]> = {
  image: ["image/jpeg", "image/png", "image/webp"],
  pdf: ["application/pdf"],
  spreadsheet: [
    "text/csv",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
  video: ["video/mp4", "video/webm", "video/quicktime"],
  audio: ["audio/mpeg", "audio/mp3", "audio/wav", "audio/webm", "audio/mp4", "audio/ogg"],
  other: [],
};

export function classifyAttachment(file: File): EnvAttachmentKind {
  const mt = (file.type || "").toLowerCase();
  if (mt.startsWith("image/")) return "image";
  if (mt === "application/pdf") return "pdf";
  if (mt.startsWith("video/")) return "video";
  if (mt.startsWith("audio/")) return "audio";
  if (
    mt.includes("spreadsheet") ||
    mt.includes("excel") ||
    mt === "text/csv" ||
    file.name.toLowerCase().endsWith(".csv") ||
    file.name.toLowerCase().endsWith(".xlsx")
  )
    return "spreadsheet";
  return "other";
}
