// Payload universal para o Relatório Técnico Kaisen.
// Serializável (sem funções / classes) para permitir versionamento e comparação.

export type BudgetTier = "muito_baixo" | "baixo" | "medio" | "alto" | "estrategico";

export const BUDGET_TIER_LABEL: Record<BudgetTier, string> = {
  muito_baixo: "Muito Baixo (< R$ 5 mil)",
  baixo: "Baixo (R$ 5–20 mil)",
  medio: "Médio (R$ 20–100 mil)",
  alto: "Alto (R$ 100–500 mil)",
  estrategico: "Projeto Estratégico (> R$ 500 mil)",
};

export type Specialty =
  | "seguranca"
  | "mecanica"
  | "eletrica"
  | "civil"
  | "estrutural"
  | "producao"
  | "automacao"
  | "instrumentacao"
  | "ergonomia"
  | "meio_ambiente"
  | "qualidade"
  | "financeiro"
  | "lean"
  | "kaisen";

export const SPECIALTY_LABEL: Record<Specialty, string> = {
  seguranca: "Engenharia de Segurança",
  mecanica: "Engenharia Mecânica",
  eletrica: "Engenharia Elétrica",
  civil: "Engenharia Civil",
  estrutural: "Engenharia Estrutural",
  producao: "Engenharia de Produção",
  automacao: "Automação",
  instrumentacao: "Instrumentação",
  ergonomia: "Ergonomia",
  meio_ambiente: "Meio Ambiente",
  qualidade: "Qualidade",
  financeiro: "Financeiro",
  lean: "Lean Manufacturing",
  kaisen: "Kaisen",
};

export interface SpecialtyAnalysis {
  specialty: Specialty;
  observacoes: string;
  evidencias: string[];
  limitacoes: string[];
  riscos: string[];
  oportunidades: string[];
  recomendacoes: string[];
}

export interface InnovativeIdea {
  conceito: string;
  funcionamento: string;
  beneficios: string[];
  riscos: string[];
  dificuldade: "baixa" | "media" | "alta";
  replicacao: "baixa" | "media" | "alta";
  investimento: BudgetTier;
  retorno_esperado: string;
}

export interface AlternativeComparison {
  criterio: string;
  economico: string;
  recomendado: string;
  ideal: string;
}

export interface PriorityMatrixRow {
  item: string;
  impacto: number; // 1-5
  urgencia: number;
  esforco: number;
  custo: number;
  beneficio: number;
  roi: number;
  seguranca: number;
  replicacao: number;
}

export interface AIScores {
  seguranca: number; // 0-100
  financeiro: number;
  robustez: number;
  engenharia: number;
  inovacao: number;
  confiabilidade: number;
  dependencia_humana: number; // menor é melhor
  replicacao: number;
  confianca_geral: number;
}

export interface ActionItem5W2H {
  what: string;
  why: string;
  where: string;
  when: string; // prazo
  who: string;
  how: string;
  how_much: BudgetTier;
  priority: "baixa" | "media" | "alta" | "critica";
  resources?: string;
  obs?: string;
}

export interface PDCA {
  plan: string[];
  do: string[];
  check: string[];
  act: string[];
}

export interface RiskItem {
  risco: string;
  consequencia: string;
  probabilidade: 1 | 2 | 3 | 4 | 5;
  severidade: 1 | 2 | 3 | 4 | 5;
  criticidade: number; // p*s
  controles_existentes: string;
  controles_sugeridos: string;
}

export interface BenefitGroup {
  seguranca: string[];
  financeiros: string[];
  operacionais: string[];
  ambientais: string[];
  ergonomicos: string[];
  manutencao: string[];
}

export interface ScheduleItem {
  fase: string;
  inicio: string;
  duracao: string;
  responsavel?: string;
}

export interface ImageMarking {
  id: number;
  x: number; // 0-100 %
  y: number; // 0-100 %
  label: string;
  specialty?: Specialty;
  severity?: "baixa" | "media" | "alta" | "critica";
  ref_section?: string;
}

export interface ReportSignature {
  role: "solicitante" | "supervisor" | "seguranca" | "engenharia" | "gerencia" | "diretoria";
  name?: string;
  signed_at?: string;
  digital_hash?: string;
}

export interface ReportVersionEntry {
  version: number;
  changed_by: string;
  changed_at: string;
  changes: string[];
  reason?: string;
}

export interface ReportIdentification {
  empresa: string;
  unidade: string;
  setor: string;
  equipamento?: string;
  local?: string;
  solicitante: string;
  responsavel_validacao?: string;
  data: string;
  hora: string;
  tipo_analise: string;
}

export interface ExecutiveSummary {
  ambiente_identificado: string;
  principais_oportunidades: string[];
  riscos_prioritarios: string[];
  melhorias_sugeridas: string[];
  economia_potencial: string;
  prioridade_geral: "baixa" | "media" | "alta" | "critica";
  nivel_confianca_ia: number; // 0-100
  limitacoes: string[];
}

export interface TechnicalReport {
  // capa
  code: string; // número único
  version: number; // 1, 2, 3...
  title: string;
  status: "rascunho" | "revisao" | "aprovado" | "arquivado";
  company_logo_url?: string;
  qr_target_url?: string;

  identification: ReportIdentification;
  executive_summary: ExecutiveSummary;

  original_image_url?: string;
  marked_image_url?: string; // mesma imagem com marcações renderizadas
  markings: ImageMarking[];

  specialties: SpecialtyAnalysis[]; // até 14
  innovative_ideas: InnovativeIdea[];
  alternatives: AlternativeComparison[];
  priority_matrix: PriorityMatrixRow[];
  scores: AIScores;
  action_plan: ActionItem5W2H[];
  pdca: PDCA;
  risks: RiskItem[];
  benefits: BenefitGroup;
  schedule: ScheduleItem[];
  budget: {
    tier: BudgetTier;
    breakdown: { item: string; tier: BudgetTier }[];
  };

  attachments: {
    name: string;
    kind: "foto" | "doc" | "checklist" | "comentario" | "historico";
    url?: string;
    note?: string;
  }[];
  signatures: ReportSignature[];

  history: ReportVersionEntry[];

  generated_at: string;
  disclaimer: string;
}

export const DEFAULT_DISCLAIMER =
  "Este relatório é uma ferramenta de apoio à decisão. Conclusões que exigem validação em campo ou projeto executivo devem ser assinadas por profissional habilitado. Marcações com ⚠ indicam pontos que dependem de verificação presencial.";
