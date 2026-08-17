// Constrói um TechnicalReport a partir de uma análise da IA + dados do registro.
// Preenche defaults conservadores; nunca inventa valores absolutos.

import {
  DEFAULT_DISCLAIMER,
  SPECIALTY_LABEL,
  type AIScores,
  type ActionItem5W2H,
  type AlternativeComparison,
  type BenefitGroup,
  type BudgetTier,
  type ExecutiveSummary,
  type ImageMarking,
  type InnovativeIdea,
  type PDCA,
  type PriorityMatrixRow,
  type ReportIdentification,
  type ReportSignature,
  type RiskItem,
  type ScheduleItem,
  type SpecialtyAnalysis,
  type TechnicalReport,
  type Specialty,
} from "./technical-report.types";

interface AnalysisLike {
  category?: string;
  confidence?: "alta" | "media" | "baixa";
  title?: string;
  description?: string;
  area?: string;
  location?: string;
  equipment?: string;
  risk?: string;
  exposed_people?: string;
  consequence?: string;
  criticality?: "baixa" | "media" | "alta" | "critica";
  priority?: "baixa" | "media" | "alta" | "critica";
  immediate_action?: string;
  final_action?: string;
  suggested_responsible?: string;
  suggested_deadline?: string;
  report_text?: string;
  norms_violated?: string;
  root_cause?: string;
  consequences_list?: string[];
  probability?: number;
  severity?: number;
  risk_score?: number;
  risk_class?: string;
  preventive_action?: string;
  resources?: string;
  expected_gain?: string;
  technical_opinion?: string;
  changes_applied?: string[];
  improvement?: {
    risk_reduction?: number;
    organization?: number;
    compliance?: number;
    operational_safety?: number;
  };
}

interface BuildArgs {
  analysis: AnalysisLike;
  moduleKey: string;
  empresa?: string;
  unidade?: string;
  solicitante: string;
  original_image_url?: string;
  marked_image_url?: string;
  markings?: ImageMarking[];
  code?: string;
  version?: number;
  qr_target_url?: string;
}

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));
const confToNumber = (c?: string) =>
  c === "alta" ? 90 : c === "media" ? 65 : c === "baixa" ? 40 : 60;
const critToNumber = (c?: string) =>
  c === "critica" ? 95 : c === "alta" ? 80 : c === "media" ? 55 : c === "baixa" ? 30 : 50;

function budgetFromCriticality(c?: string): BudgetTier {
  switch (c) {
    case "critica":
      return "alto";
    case "alta":
      return "medio";
    case "media":
      return "baixo";
    default:
      return "muito_baixo";
  }
}

function buildSpecialties(a: AnalysisLike): SpecialtyAnalysis[] {
  const base = (specialty: Specialty, focus: string): SpecialtyAnalysis => ({
    specialty,
    observacoes: `${SPECIALTY_LABEL[specialty]} — foco em: ${focus}. Baseado na análise "${a.title ?? "cena"}".`,
    evidencias: [a.description ?? a.report_text ?? ""].filter(Boolean),
    limitacoes: [
      "Análise remota por imagem. Requer inspeção presencial para conclusões definitivas.",
    ],
    riscos: a.risk ? [a.risk] : [],
    oportunidades: a.expected_gain ? [a.expected_gain] : [],
    recomendacoes: a.final_action
      ? [a.final_action]
      : a.preventive_action
        ? [a.preventive_action]
        : [],
  });
  return [
    base("seguranca", "riscos ocupacionais, EPI, EPC, hierarquia de controles"),
    base("mecanica", "integridade de máquinas, transmissões, lubrificação"),
    base("eletrica", "aterramento, dispositivos de proteção, quadros"),
    base("civil", "pisos, estruturas de apoio, sinalização"),
    base("estrutural", "cargas, apoios, deformações aparentes"),
    base("producao", "fluxo, gargalos, tempos, layout"),
    base("automacao", "intertravamentos, sensores de segurança"),
    base("instrumentacao", "medição, calibração, alarmes"),
    base("ergonomia", "posturas, esforços, alcance visual"),
    base("meio_ambiente", "resíduos, vazamentos, emissões"),
    base("qualidade", "conformidade de processo e produto"),
    base("financeiro", "custo evitado, retorno, capex/opex"),
    base("lean", "desperdícios, 5S, padronização"),
    base("kaisen", "melhoria contínua, replicabilidade, engajamento"),
  ];
}

function buildScores(a: AnalysisLike): AIScores {
  const conf = confToNumber(a.confidence);
  const crit = critToNumber(a.criticality);
  const imp = a.improvement ?? {};
  return {
    seguranca: clamp(100 - crit + (imp.operational_safety ?? 0) * 0.2),
    financeiro: clamp(60 + (a.expected_gain ? 15 : 0)),
    robustez: clamp(55 + (imp.compliance ?? 0) * 0.2),
    engenharia: clamp(60 + (a.technical_opinion ? 15 : 0)),
    inovacao: 50,
    confiabilidade: clamp(50 + (imp.compliance ?? 0) * 0.25),
    dependencia_humana: clamp(70 - (imp.organization ?? 0) * 0.3),
    replicacao: 65,
    confianca_geral: conf,
  };
}

function buildRisks(a: AnalysisLike): RiskItem[] {
  if (!a.risk) return [];
  const p = (a.probability ?? 3) as 1 | 2 | 3 | 4 | 5;
  const s = (a.severity ?? 3) as 1 | 2 | 3 | 4 | 5;
  return [
    {
      risco: a.risk,
      consequencia: a.consequence ?? "Não especificada",
      probabilidade: p,
      severidade: s,
      criticidade: p * s,
      controles_existentes: "A verificar em campo",
      controles_sugeridos:
        a.preventive_action ??
        a.final_action ??
        "Definir controles conforme hierarquia (eliminar → EPI).",
    },
  ];
}

function buildActionPlan(a: AnalysisLike): ActionItem5W2H[] {
  const items: ActionItem5W2H[] = [];
  const push = (what: string, why: string) =>
    items.push({
      what,
      why,
      where: a.location ?? a.area ?? "A definir",
      when: a.suggested_deadline ?? "7 dias",
      who: a.suggested_responsible ?? "A designar",
      how: a.resources ?? "Conforme procedimento aplicável",
      how_much: budgetFromCriticality(a.criticality),
      priority: a.priority ?? "media",
      resources: a.resources,
    });
  if (a.immediate_action)
    push(a.immediate_action, "Ação imediata para conter o risco identificado");
  if (a.final_action) push(a.final_action, "Ação definitiva para eliminar a causa raiz");
  if (a.preventive_action) push(a.preventive_action, "Prevenção da recorrência");
  return items;
}

function buildBenefits(a: AnalysisLike): BenefitGroup {
  return {
    seguranca: a.risk ? [`Redução do risco: ${a.risk}`] : [],
    financeiros: a.expected_gain ? [a.expected_gain] : [],
    operacionais: [],
    ambientais: [],
    ergonomicos: [],
    manutencao: [],
  };
}

function buildAlternatives(a: AnalysisLike): AlternativeComparison[] {
  const rec = a.final_action ?? "Solução conforme análise técnica";
  return [
    {
      criterio: "Ação principal",
      economico: a.immediate_action ?? "Contenção temporária",
      recomendado: rec,
      ideal: "Eliminação da fonte do risco (nível 1 da hierarquia)",
    },
    {
      criterio: "Custo",
      economico: "Muito Baixo",
      recomendado: "Baixo–Médio",
      ideal: "Médio–Alto",
    },
    { criterio: "Prazo", economico: "Imediato", recomendado: "Curto prazo", ideal: "Médio prazo" },
    { criterio: "Risco residual", economico: "Alto", recomendado: "Médio", ideal: "Baixo" },
  ];
}

function buildInnovation(a: AnalysisLike): InnovativeIdea[] {
  return [
    {
      conceito: `Sensorização e monitoramento contínuo aplicado a: ${a.title ?? "cena analisada"}`,
      funcionamento:
        "IoT + dashboards com alertas automáticos quando parâmetros saem da faixa segura.",
      beneficios: ["Detecção precoce", "Rastreabilidade", "Base de dados para análises futuras"],
      riscos: ["Dependência de conectividade", "Manutenção dos sensores"],
      dificuldade: "media",
      replicacao: "alta",
      investimento: "medio",
      retorno_esperado: "Redução de eventos não-planejados e ganho em disponibilidade.",
    },
  ];
}

function buildPriorityMatrix(a: AnalysisLike): PriorityMatrixRow[] {
  const item = a.title ?? a.final_action ?? "Item principal";
  const c = a.criticality;
  const s = c === "critica" ? 5 : c === "alta" ? 4 : c === "media" ? 3 : 2;
  return [
    {
      item,
      impacto: s,
      urgencia: s,
      esforco: 3,
      custo: 3,
      beneficio: s,
      roi: 4,
      seguranca: s,
      replicacao: 3,
    },
  ];
}

function buildSchedule(a: AnalysisLike): ScheduleItem[] {
  return [
    {
      fase: "Ação imediata / contenção",
      inicio: "Dia 0",
      duracao: "24–72h",
      responsavel: a.suggested_responsible,
    },
    {
      fase: "Ação corretiva definitiva",
      inicio: "Dia 3",
      duracao: a.suggested_deadline ?? "7–15 dias",
    },
    { fase: "Verificação de eficácia", inicio: "Após ação", duracao: "7 dias" },
    { fase: "Padronização / replicação", inicio: "+15 dias", duracao: "30 dias" },
  ];
}

export function buildTechnicalReport(args: BuildArgs): TechnicalReport {
  const { analysis: a } = args;
  const now = new Date();
  const code =
    args.code ??
    `RT-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const identification: ReportIdentification = {
    empresa: args.empresa ?? "Vale S.A.",
    unidade: args.unidade ?? "Unidade Operacional",
    setor: a.area ?? "Não informado",
    equipamento: a.equipment,
    local: a.location,
    solicitante: args.solicitante,
    responsavel_validacao: undefined,
    data: now.toLocaleDateString("pt-BR"),
    hora: now.toLocaleTimeString("pt-BR"),
    tipo_analise: `Análise ${args.moduleKey.toUpperCase()} — ${a.title ?? "sem título"}`,
  };
  const executive_summary: ExecutiveSummary = {
    ambiente_identificado: a.description ?? a.report_text ?? a.title ?? "Ambiente não descrito",
    principais_oportunidades: a.expected_gain ? [a.expected_gain] : [],
    riscos_prioritarios: a.risk ? [a.risk] : [],
    melhorias_sugeridas: [a.final_action, a.preventive_action].filter(Boolean) as string[],
    economia_potencial: a.expected_gain ?? "A quantificar em campo",
    prioridade_geral: a.priority ?? "media",
    nivel_confianca_ia: confToNumber(a.confidence),
    limitacoes: [
      "Análise baseada em imagem — sem medições instrumentais.",
      "Requer validação de profissional habilitado antes de ações de engenharia.",
    ],
  };
  const signatures: ReportSignature[] = (
    ["solicitante", "supervisor", "seguranca", "engenharia", "gerencia", "diretoria"] as const
  ).map((role) => ({ role }));
  return {
    code,
    version: args.version ?? 1,
    title: a.title ?? "Relatório Técnico de Análise",
    status: "rascunho",
    qr_target_url: args.qr_target_url,
    identification,
    executive_summary,
    original_image_url: args.original_image_url,
    marked_image_url: args.marked_image_url,
    markings: args.markings ?? [],
    specialties: buildSpecialties(a),
    innovative_ideas: buildInnovation(a),
    alternatives: buildAlternatives(a),
    priority_matrix: buildPriorityMatrix(a),
    scores: buildScores(a),
    action_plan: buildActionPlan(a),
    pdca: {
      plan: ["Detalhar escopo e responsáveis", "Levantar recursos necessários"],
      do: [a.final_action ?? a.immediate_action ?? "Executar ação principal"],
      check: ["Auditar execução e medir KPIs de segurança/operação"],
      act: ["Padronizar procedimento", "Replicar para áreas similares"],
    } satisfies PDCA,
    risks: buildRisks(a),
    benefits: buildBenefits(a),
    schedule: buildSchedule(a),
    budget: { tier: budgetFromCriticality(a.criticality), breakdown: [] },
    attachments: [],
    signatures,
    history: [
      {
        version: args.version ?? 1,
        changed_by: args.solicitante,
        changed_at: now.toISOString(),
        changes: ["Versão inicial gerada automaticamente pela IA Kaisen"],
      },
    ],
    generated_at: now.toISOString(),
    disclaimer: DEFAULT_DISCLAIMER,
  };
}

interface IrisResultInput {
  result: AnalysisLike;
  moduleKey: string;
  originalImageUrl?: string;
  markedImageUrl?: string;
  requester: string;
  company?: string;
  unit?: string;
  area?: string;
  equipment?: string;
  qrTargetUrl?: string;
}

export function buildFromIrisResult(input: IrisResultInput): TechnicalReport {
  return buildTechnicalReport({
    analysis: input.result,
    moduleKey: input.moduleKey,
    empresa: input.company,
    unidade: input.unit,
    solicitante: input.requester,
    original_image_url: input.originalImageUrl,
    marked_image_url: input.markedImageUrl,
    qr_target_url: input.qrTargetUrl,
  });
}
