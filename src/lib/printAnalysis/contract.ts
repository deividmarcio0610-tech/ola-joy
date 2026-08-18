import * as z from "zod";

/**
 * CONTRATO DA ANÁLISE POR PRINT.
 *
 * O desenho NUNCA nasce de texto livre. A IA responde um JSON estruturado,
 * o backend valida cada campo e só então o frontend desenha. Se a IA inventar
 * um preço, sair do intervalo de coordenadas ou devolver um estado que não
 * existe, o backend recusa — é melhor não desenhar nada do que desenhar uma
 * operação imaginária sobre o gráfico de alguém.
 *
 * REGRA CENTRAL (anti-alucinação): todo número lido do gráfico é um
 * `ReadableNumber`. Ele só carrega valor quando `visible === true`. Quando o
 * número não está legível no print, `value` é null e a interface mostra
 * "NÃO LEGÍVEL NO PRINT" — nunca uma aproximação silenciosa.
 */

/** Estados possíveis do diagnóstico T4. Nenhum outro é aceito. */
export const PRINT_T4_STATUSES = [
  "SEM_T4",
  "T4_EM_FORMACAO",
  "APROXIMACAO_T4",
  "PRE_ENTRADA",
  "ENTRADA_CONFIRMADA",
  "T4_INVALIDADA",
  "INCONCLUSIVO",
] as const;
export type PrintT4Status = (typeof PRINT_T4_STATUSES)[number];

export const PRINT_T4_STATUS_LABEL: Record<PrintT4Status, string> = {
  SEM_T4: "SEM T4",
  T4_EM_FORMACAO: "T4 EM FORMAÇÃO",
  APROXIMACAO_T4: "APROXIMAÇÃO T4",
  PRE_ENTRADA: "PRÉ-ENTRADA",
  ENTRADA_CONFIRMADA: "ENTRADA CONFIRMADA",
  T4_INVALIDADA: "T4 INVALIDADA",
  INCONCLUSIVO: "INCONCLUSIVO",
};

/** Só estes estados autorizam mostrar níveis de operação. */
export const OPERATIONAL_STATUSES: readonly PrintT4Status[] = [
  "APROXIMACAO_T4",
  "PRE_ENTRADA",
  "ENTRADA_CONFIRMADA",
];

export const NOT_READABLE = "NÃO LEGÍVEL NO PRINT";
export const NOT_IDENTIFIED = "NÃO IDENTIFICADO";

export type PrintDirection = "COMPRA" | "VENDA" | "NEUTRO";

/**
 * Papéis de anotação. A COR é derivada do papel no cliente — a IA não escolhe
 * cor, para o padrão visual nunca depender do humor do modelo.
 */
export const ANNOTATION_ROLES = [
  "ENTRY",
  "ENTRY_ZONE",
  "STOP",
  "TARGET_1",
  "TARGET_2",
  "TARGET_EXTRA",
  "INVALIDATION",
  "SUPPORT",
  "RESISTANCE",
  "BREAKOUT",
  "PULLBACK",
  "SCENARIO_UP",
  "SCENARIO_DOWN",
  "T4_PAST",
  "NOTE",
] as const;
export type AnnotationRole = (typeof ANNOTATION_ROLES)[number];

export const ANNOTATION_SHAPES = ["LINE", "ZONE", "ARROW", "MARKER"] as const;
export type AnnotationShape = (typeof ANNOTATION_SHAPES)[number];

/** Número lido do gráfico. Sem `visible`, não existe valor. */
const ReadableNumber = z
  .object({
    value: z.number().finite().nullable().default(null),
    visible: z.boolean().default(false),
  })
  .transform((item) => ({
    // Contradição resolvida a favor da prudência: "não visível" apaga o valor.
    value: item.visible && item.value !== null ? item.value : null,
    visible: item.visible && item.value !== null,
  }));

export type ReadableNumberValue = { value: number | null; visible: boolean };

const unit = z.number().finite().min(0).max(1);

const Annotation = z.object({
  id: z.string().min(1).max(60),
  role: z.enum(ANNOTATION_ROLES),
  shape: z.enum(ANNOTATION_SHAPES),
  /** Coordenadas NORMALIZADAS 0..1 sobre o print original. */
  x1: unit,
  y1: unit,
  x2: unit,
  y2: unit,
  label: z.string().min(1).max(60),
  /** Motivo curto — exibido ao clicar na marcação. */
  reason: z.string().max(400).nullable().default(null),
  /** Numeração das ocorrências T4 passadas: T4 #1, T4 #2... */
  index: z.number().int().min(1).max(99).nullable().default(null),
});
export type PrintAnnotation = z.infer<typeof Annotation>;

const Criterion = z.object({
  id: z.string().min(1).max(60),
  label: z.string().min(1).max(80),
  met: z.boolean(),
  /** Por que o critério foi considerado atendido/ausente. */
  note: z.string().max(300).nullable().default(null),
});
export type PrintCriterion = z.infer<typeof Criterion>;

const Scenario = z.object({
  condition: z.string().min(1).max(240),
  consequence: z.string().min(1).max(240),
  direction: z.enum(["COMPRA", "VENDA", "NEUTRO"]).default("NEUTRO"),
});
export type PrintScenario = z.infer<typeof Scenario>;

/**
 * Payload cru esperado da IA. Tolerante em campos opcionais, rígido em tipos,
 * estados e limites de coordenada.
 */
export const PrintAnalysisPayload = z.object({
  status: z.enum(PRINT_T4_STATUSES),
  direction: z.enum(["COMPRA", "VENDA", "NEUTRO"]).default("NEUTRO"),
  /** Confiança da LEITURA VISUAL (0–100). Não é chance de lucro. */
  confidence: z.number().finite().min(0).max(100),
  confidenceFactors: z.array(z.string().max(200)).max(12).default([]),
  symbol: z.string().max(24).nullable().default(null),
  timeframe: z.string().max(16).nullable().default(null),
  entry: ReadableNumber.default({ value: null, visible: false }),
  entryZone: z
    .object({ low: ReadableNumber, high: ReadableNumber })
    .default({ low: { value: null, visible: false }, high: { value: null, visible: false } }),
  stop: ReadableNumber.default({ value: null, visible: false }),
  targets: z.array(ReadableNumber).max(4).default([]),
  invalidation: z.string().max(240).nullable().default(null),
  support: z.array(ReadableNumber).max(6).default([]),
  resistance: z.array(ReadableNumber).max(6).default([]),
  structure: z.string().max(240).nullable().default(null),
  trend: z.string().max(120).nullable().default(null),
  breakout: z.string().max(240).nullable().default(null),
  pullback: z.string().max(240).nullable().default(null),
  criteria: z.array(Criterion).max(20).default([]),
  annotations: z.array(Annotation).max(40).default([]),
  scenarios: z.array(Scenario).max(6).default([]),
  pastT4Count: z.number().int().min(0).max(99).default(0),
  explanation: z.string().max(1600).default(""),
  missingCriteria: z.array(z.string().max(120)).max(20).default([]),
  /** A IA declara quando a imagem não permite análise confiável. */
  imageIssues: z.array(z.string().max(200)).max(8).default([]),
});

export type PrintAnalysisPayloadInput = z.input<typeof PrintAnalysisPayload>;
export type PrintAnalysis = z.infer<typeof PrintAnalysisPayload>;

export interface PrintAnalysisValidation {
  ok: boolean;
  analysis: PrintAnalysis | null;
  /** Problemas que impediram a validação. */
  errors: string[];
  /** Ajustes aplicados — visíveis ao operador, nunca silenciosos. */
  corrections: string[];
}

/** Papéis que representam níveis de operação. */
const OPERATIONAL_ROLES: readonly AnnotationRole[] = [
  "ENTRY",
  "ENTRY_ZONE",
  "STOP",
  "TARGET_1",
  "TARGET_2",
  "TARGET_EXTRA",
];

/**
 * Valida e SANEIA a resposta da IA.
 *
 * O que é recusado por inteiro: JSON fora do schema, estado inexistente,
 * confiança fora de 0–100, coordenada fora de 0..1.
 *
 * O que é corrigido com registro: operação exibida sem status operacional,
 * nível "visível" sem número, ordem invertida de zona, T4 passadas numeradas
 * fora de sequência.
 */
export function validatePrintAnalysis(raw: unknown): PrintAnalysisValidation {
  const parsed = PrintAnalysisPayload.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      analysis: null,
      errors: parsed.error.issues
        .slice(0, 8)
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`),
      corrections: [],
    };
  }

  const analysis = parsed.data;
  const corrections: string[] = [];

  // 1. Estado não operacional não pode carregar entrada/stop/alvo.
  const operational = OPERATIONAL_STATUSES.includes(analysis.status);
  if (!operational) {
    const hadLevels =
      analysis.entry.visible ||
      analysis.stop.visible ||
      analysis.targets.some((item) => item.visible);
    if (hadLevels) {
      corrections.push(
        `Status ${PRINT_T4_STATUS_LABEL[analysis.status]} não autoriza níveis de operação — entrada/stop/alvos descartados.`,
      );
    }
    analysis.entry = { value: null, visible: false };
    analysis.stop = { value: null, visible: false };
    analysis.entryZone = {
      low: { value: null, visible: false },
      high: { value: null, visible: false },
    };
    analysis.targets = [];
    analysis.annotations = analysis.annotations.filter(
      (item) => !OPERATIONAL_ROLES.includes(item.role),
    );
  }

  // 2. Zona invertida: normaliza e registra.
  const { low, high } = analysis.entryZone;
  if (
    low.visible &&
    high.visible &&
    low.value !== null &&
    high.value !== null &&
    low.value > high.value
  ) {
    analysis.entryZone = { low: high, high: low };
    corrections.push("Zona de entrada veio invertida e foi reordenada.");
  }

  // 3. Direção coerente com stop e entrada quando ambos são legíveis.
  const entry = analysis.entry.value;
  const stop = analysis.stop.value;
  if (entry !== null && stop !== null) {
    const impliesBuy = stop < entry;
    const impliesSell = stop > entry;
    if (analysis.direction === "COMPRA" && !impliesBuy) {
      return {
        ok: false,
        analysis: null,
        errors: [
          "Direção COMPRA com stop acima da entrada — leitura incoerente, análise recusada.",
        ],
        corrections,
      };
    }
    if (analysis.direction === "VENDA" && !impliesSell) {
      return {
        ok: false,
        analysis: null,
        errors: [
          "Direção VENDA com stop abaixo da entrada — leitura incoerente, análise recusada.",
        ],
        corrections,
      };
    }
  }

  // 4. Anotações com área nula viram marcadores; zona precisa de área.
  analysis.annotations = analysis.annotations.filter((item) => {
    if (item.shape !== "ZONE") return true;
    const area = Math.abs(item.x2 - item.x1) * Math.abs(item.y2 - item.y1);
    if (area <= 0) {
      corrections.push(`Zona "${item.label}" sem área foi descartada.`);
      return false;
    }
    return true;
  });

  // 5. T4 passadas: renumera em sequência e sincroniza a contagem exibida.
  const past = analysis.annotations.filter((item) => item.role === "T4_PAST");
  past.forEach((item, position) => {
    item.index = position + 1;
  });
  if (analysis.pastT4Count !== past.length) {
    corrections.push(
      `Contagem de T4 anteriores ajustada de ${analysis.pastT4Count} para ${past.length} (marcações realmente desenhadas).`,
    );
    analysis.pastT4Count = past.length;
  }

  // 6. Ativo/timeframe ausentes viram NÃO IDENTIFICADO na exibição.
  if (!analysis.symbol?.trim()) analysis.symbol = null;
  if (!analysis.timeframe?.trim()) analysis.timeframe = null;

  return { ok: true, analysis, errors: [], corrections };
}

/** Formata um número lido do gráfico para exibição, sem inventar dígitos. */
export function formatReadable(item: ReadableNumberValue, decimals = 0): string {
  if (!item.visible || item.value === null) return NOT_READABLE;
  return item.value.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Cor por papel (requisito 9) — decidida pelo sistema, nunca pela IA. */
export const ROLE_COLOR: Record<AnnotationRole, string> = {
  ENTRY: "#22c55e",
  ENTRY_ZONE: "#22c55e",
  STOP: "#ef4444",
  TARGET_1: "#22c55e",
  TARGET_2: "#22c55e",
  TARGET_EXTRA: "#22c55e",
  INVALIDATION: "#ef4444",
  SUPPORT: "#3b82f6",
  RESISTANCE: "#3b82f6",
  BREAKOUT: "#eab308",
  PULLBACK: "#eab308",
  SCENARIO_UP: "#22c55e",
  SCENARIO_DOWN: "#ef4444",
  T4_PAST: "#a855f7",
  NOTE: "#e5e7eb",
};
