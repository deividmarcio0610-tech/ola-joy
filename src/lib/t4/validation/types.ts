/**
 * REGISTRO CANÔNICO DE OPORTUNIDADE T4.
 *
 * Toda oportunidade entra aqui — vencedora, perdedora, invalidada, rejeitada
 * ou filtrada. Sem cherry-picking: métricas calculadas sobre um subconjunto
 * escolhido a posteriori não provam vantagem nenhuma.
 *
 * DUAS ESCALAS QUE NUNCA SE MISTURAM:
 * - `confluence` (0–100): quanto do SETUP T4 está confirmado agora.
 * - robustez estatística (0–100, em robustness.ts): qualidade da VALIDAÇÃO
 *   histórica. Confluência NÃO é probabilidade de lucro.
 */

/** Partição temporal do dado. OOS/FORWARD jamais retroalimentam TRAIN. */
export type DatasetSplit = "TRAIN" | "OUT_OF_SAMPLE" | "FORWARD";

/**
 * Ciclo de vida do sinal — o coração da defesa anti-look-ahead. Um critério
 * que exige fechamento de candle NÃO pode ser dado como confirmado enquanto o
 * candle está aberto.
 */
export type SignalLifecycle = "DETECTED" | "PENDING_CLOSE" | "CONFIRMED" | "INVALIDATED";

/** Por que a oportunidade não virou trade — auditável, nunca descartada. */
export type OpportunityOutcome =
  | "EXECUTED"
  | "INVALIDATED_BEFORE_ENTRY"
  | "REJECTED_BY_GATES"
  | "FILTERED_BY_THRESHOLD"
  | "EXPIRED_NO_TRIGGER";

export type TradeResult = "WIN" | "LOSS" | "BREAKEVEN";

/** Estado de um critério no instante da decisão. */
export interface CriterionState {
  id: string;
  label: string;
  /** Peso do critério na confluência (soma dos pesos = 100). */
  weight: number;
  confirmed: boolean;
  /** true quando depende de fechamento de candle ainda em curso. */
  pendingClose: boolean;
  detail: string | null;
}

/** Custos operacionais reais aplicados ao resultado. */
export interface TradeCosts {
  /** Corretagem por contrato, em moeda. */
  brokerage: number;
  /** Emolumentos/taxas, em moeda. */
  exchangeFees: number;
  /** Derrapagem assumida, em PONTOS por perna (entrada e saída). */
  slippagePoints: number;
  /** Valor do ponto, para converter moeda ↔ pontos. */
  pointValue: number;
}

export const ZERO_COSTS: TradeCosts = {
  brokerage: 0,
  exchangeFees: 0,
  slippagePoints: 0,
  pointValue: 1,
};

/**
 * Uma oportunidade completa. Campos de resultado ficam null enquanto ela não
 * é executada/encerrada — nunca preenchidos com estimativa.
 */
export interface T4Trade {
  tradeId: string;
  signalId: string;
  strategyVersion: string;
  /** Hash da configuração congelada que produziu esta decisão. */
  configHash: string;
  symbol: string;
  timeframe: string;
  direction: "COMPRA" | "VENDA";

  /** Instante em que o setup começou a se formar (chartClock). */
  setupStartedAt: number;
  /** Instante da DECISÃO (candle fechado). Nada do futuro é conhecido aqui. */
  decidedAt: number;
  entryAt: number | null;
  exitAt: number | null;

  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  exitPrice: number | null;

  /** Confluência 0–100 no instante da decisão. NÃO é chance de lucro. */
  confluenceAtEntry: number;
  criteria: CriterionState[];

  regime: string;
  session: string;
  entryReason: string;
  exitReason: string | null;

  outcome: OpportunityOutcome;
  result: TradeResult | null;
  /** Resultado bruto em pontos, antes dos custos. */
  grossPoints: number | null;
  /** Resultado líquido em pontos, após custos e slippage. */
  netPoints: number | null;
  /** Resultado líquido em múltiplos de risco (R). */
  resultR: number | null;
  /** Risco inicial em pontos (entrada → stop). Base de todo R. */
  riskPoints: number;

  mfePoints: number | null;
  maePoints: number | null;
  mfeR: number | null;
  maeR: number | null;

  costs: TradeCosts;
  dataset: DatasetSplit;
}

/** Snapshot IMUTÁVEL gravado ANTES de o resultado ser conhecido (forward). */
export interface ForwardSnapshot {
  signalId: string;
  strategyVersion: string;
  configHash: string;
  symbol: string;
  timeframe: string;
  /** Instante do gráfico no momento da decisão. */
  chartTime: number;
  /** Instante real (parede) da gravação — prova de anterioridade. */
  recordedAt: number;
  direction: "COMPRA" | "VENDA";
  price: number;
  confluence: number;
  criteria: CriterionState[];
  structure: string;
  zone: string | null;
  bos: boolean;
  choch: boolean;
  liquiditySweep: boolean;
  expansion: boolean;
  pullback: boolean;
  candleClosed: boolean;
  timeSync: "CHART_CLOCK" | "REALTIME_FALLBACK";
  stopPrice: number;
  targetPrice: number;
}

/** Ciclo de vida da VALIDAÇÃO da estratégia (nunca "garantido"). */
export type ValidationStatus =
  | "NAO_TESTADA"
  | "BACKTEST"
  | "OOS"
  | "FORWARD"
  | "VALIDACAO_ESTATISTICA_POSITIVA"
  | "VALIDACAO_ESTATISTICA_NEGATIVA"
  | "AGUARDANDO_DADOS_SUFICIENTES";
