import type { Candle } from "@/lib/engines/types";
import { evaluateT4Core, type T4CoreDecision } from "@/lib/t4/core/t4CoreEngine";
import { CausalWindow, futureAfterEntry } from "./lookahead";
import { classifyResult, netResultR } from "@/lib/t4/validation/metrics";
import { stableHash } from "@/lib/t4/validation/hash";
import {
  ZERO_COSTS,
  type DatasetSplit,
  type OpportunityOutcome,
  type T4Trade,
  type TradeCosts,
} from "@/lib/t4/validation/types";

/**
 * RUNNER DE BACKTEST CAUSAL (requisitos 3, 4 e 6).
 *
 * A varredura anda candle a candle. Em cada instante:
 *
 * 1. a DECISÃO é tomada com uma `CausalWindow` — passado + candle atual, nada
 *    mais. O futuro é fisicamente inacessível ali;
 * 2. o FUTURO só é liberado DEPOIS da decisão, via `futureAfterEntry`, e
 *    exclusivamente para apurar gatilho, stop, alvo, MFE e MAE.
 *
 * TODA oportunidade é registrada — executada, invalidada antes da entrada,
 * reprovada nos gates, filtrada pelo limiar de confluência ou expirada sem
 * gatilho. Não existe cherry-picking: quem escolhe o que registrar depois do
 * resultado não está medindo vantagem, está contando história.
 *
 * AMBIGUIDADE INTRABAR: quando o mesmo candle toca stop e alvo, a série de
 * OHLC não diz qual veio primeiro. O runner assume STOP (pessimista) e marca
 * o motivo — inflar o resultado nesse caso é a forma mais comum de backtest
 * mentiroso.
 */

export interface BacktestConfig {
  symbol: string;
  timeframe: string;
  costs: TradeCosts;
  /** Confluência mínima para a oportunidade virar ordem. */
  confluenceThreshold: number;
  /** Candles de espera pelo gatilho antes de expirar a oportunidade. */
  maxBarsToTrigger: number;
  /** Candles máximos dentro da operação antes do encerramento por tempo. */
  maxBarsInTrade: number;
  /** Alvo em múltiplos de risco. O primeiro contrato T4 sai em 3R. */
  targetR: number;
  dataset: DatasetSplit;
  /** Contratos por operação (afeta corretagem/emolumentos). */
  contracts: number;
}

export const DEFAULT_BACKTEST_CONFIG: BacktestConfig = {
  symbol: "WIN",
  timeframe: "1m",
  costs: ZERO_COSTS,
  confluenceThreshold: 70,
  maxBarsToTrigger: 10,
  maxBarsInTrade: 120,
  targetR: 3,
  dataset: "TRAIN",
  contracts: 1,
};

export interface BacktestProgress {
  processed: number;
  total: number;
  opportunities: number;
  executed: number;
}

export interface BacktestHooks {
  onProgress?: (progress: BacktestProgress) => void;
  /** Consultado a cada candle — permite cancelar um run pesado. */
  shouldCancel?: () => boolean;
  /** Frequência (em candles) das notificações de progresso. */
  progressEvery?: number;
  /**
   * FATIAMENTO RETOMÁVEL. O job em segundo plano precisa devolver o controle
   * ao event loop de tempos em tempos; para isso ele varre a série em blocos.
   *
   * `fromIndex`/`toIndex` limitam apenas os candles DECIDIDOS neste bloco — a
   * janela causal continua enxergando todo o passado, então a decisão de um
   * candle é idêntica à de um run inteiro. Reprocessar o prefixo a cada bloco
   * daria o mesmo resultado, mas em tempo quadrático.
   */
  fromIndex?: number;
  toIndex?: number;
  /** Estado de continuidade devolvido pelo bloco anterior. */
  busyUntilIndex?: number;
}

export interface BacktestRunResult {
  trades: T4Trade[];
  /**
   * Índice até o qual o mercado segue ocupado por uma operação aberta. O bloco
   * seguinte precisa recebê-lo de volta, senão a mesma operação viraria dois
   * trades na fronteira entre blocos.
   */
  busyUntilIndex: number;
  scannedCandles: number;
  decisionsEvaluated: number;
  cancelled: boolean;
  /** Hash da série processada — a mesma série produz o mesmo hash. */
  seriesHash: string;
  configHash: string;
  strategyVersion: string;
  firstCandleAt: number | null;
  lastCandleAt: number | null;
}

/** Hash da série de candles — insumo do `datasetHash` de um run. */
export function seriesHash(series: readonly Candle[]): string {
  const canonical = series.map((c) => `${c.t}:${c.o}:${c.h}:${c.l}:${c.c}`).join("|");
  return stableHash("series", { n: series.length, canonical });
}

function sessionLabel(at: number): string {
  const hour = new Date(at).getUTCHours();
  if (hour < 11) return "ABERTURA";
  if (hour < 15) return "MEIO";
  if (hour < 19) return "TARDE";
  return "FORA_DE_PREGAO";
}

function tradeIdFor(decision: T4CoreDecision, symbol: string, index: number): string {
  return stableHash("t4", {
    symbol,
    at: decision.at,
    index,
    direction: decision.direction,
    configHash: decision.configHash,
  });
}

function baseTrade(
  decision: T4CoreDecision,
  config: BacktestConfig,
  index: number,
  entry: number,
  stop: number,
  target: number,
  riskPoints: number,
  outcome: OpportunityOutcome,
  entryReason: string,
): T4Trade {
  const tradeId = tradeIdFor(decision, config.symbol, index);
  return {
    tradeId,
    signalId: `${tradeId}:${decision.at}`,
    strategyVersion: decision.strategyVersion,
    configHash: decision.configHash,
    symbol: config.symbol,
    timeframe: config.timeframe,
    direction: decision.direction === "VENDA" ? "VENDA" : "COMPRA",
    setupStartedAt: decision.at,
    decidedAt: decision.at,
    entryAt: null,
    exitAt: null,
    entryPrice: entry,
    stopPrice: stop,
    targetPrice: target,
    exitPrice: null,
    confluenceAtEntry: decision.confluence,
    criteria: decision.criteria,
    regime: decision.regime,
    session: sessionLabel(decision.at),
    entryReason,
    exitReason: null,
    outcome,
    result: null,
    grossPoints: null,
    netPoints: null,
    resultR: null,
    riskPoints,
    mfePoints: null,
    maePoints: null,
    mfeR: null,
    maeR: null,
    costs: config.costs,
    dataset: config.dataset,
  };
}

/**
 * Executa a varredura histórica. `series` precisa estar em ordem cronológica;
 * o runner ordena defensivamente antes de começar.
 */
export function runBacktest(
  input: readonly Candle[],
  config: BacktestConfig = DEFAULT_BACKTEST_CONFIG,
  hooks: BacktestHooks = {},
): BacktestRunResult {
  const series = input.slice().sort((a, b) => a.t - b.t);
  const trades: T4Trade[] = [];
  const progressEvery = Math.max(1, hooks.progressEvery ?? 50);
  let decisionsEvaluated = 0;
  let cancelled = false;
  // Índice até o qual o mercado já está "ocupado" por uma operação anterior.
  // Sem isso o mesmo setup viraria dezenas de trades sobrepostos e as
  // métricas contariam o mesmo movimento várias vezes.
  let busyUntilIndex = hooks.busyUntilIndex ?? -1;

  const from = Math.max(0, hooks.fromIndex ?? 0);
  const to = Math.min(series.length, hooks.toIndex ?? series.length);

  for (let index = from; index < to; index++) {
    if (hooks.shouldCancel?.()) {
      cancelled = true;
      break;
    }
    if (index % progressEvery === 0) {
      hooks.onProgress?.({
        processed: index,
        total: series.length,
        opportunities: trades.length,
        executed: trades.filter((trade) => trade.outcome === "EXECUTED").length,
      });
    }
    if (index <= busyUntilIndex) continue;

    // ── DECISÃO: apenas passado + candle atual. Candle histórico está fechado.
    const window = new CausalWindow(series, index);
    const decision = evaluateT4Core(window, true);
    if (!decision) continue;
    decisionsEvaluated++;

    if (decision.direction === "NEUTRO") continue;
    const plan = decision.plan;

    // Gates reprovados: registra e segue. O registro é o que impede
    // cherry-picking — sabemos quantas vezes o motor disse NÃO.
    if (!decision.gatesPassed || !plan || plan.stopDistance <= 0) {
      if (decision.confluence > 0) {
        trades.push(
          baseTrade(
            decision,
            config,
            index,
            plan?.entry ?? decision.price,
            plan?.stop ?? decision.price,
            plan?.target1 ?? decision.price,
            plan?.stopDistance ?? 0,
            "REJECTED_BY_GATES",
            decision.gateBlockers[0] ?? "Gates T4 reprovados.",
          ),
        );
      }
      continue;
    }

    const riskPoints = plan.stopDistance;
    const sign = decision.direction === "COMPRA" ? 1 : -1;
    const entry = plan.entry;
    const stop = plan.stop;
    const target = entry + sign * riskPoints * config.targetR;

    // Filtro de confluência: também vira registro, nunca sumiço silencioso.
    if (decision.confluence < config.confluenceThreshold) {
      trades.push(
        baseTrade(
          decision,
          config,
          index,
          entry,
          stop,
          target,
          riskPoints,
          "FILTERED_BY_THRESHOLD",
          `Confluência ${decision.confluence.toFixed(0)}% < limiar ${config.confluenceThreshold}%.`,
        ),
      );
      continue;
    }

    const trade = baseTrade(
      decision,
      config,
      index,
      entry,
      stop,
      target,
      riskPoints,
      "EXPIRED_NO_TRIGGER",
      `${decision.setup} · ${decision.quality} · confluência ${decision.confluence.toFixed(0)}%`,
    );

    // ── APURAÇÃO: só agora o futuro é liberado, e nunca para decidir.
    const future = futureAfterEntry(series, index, config.maxBarsToTrigger + config.maxBarsInTrade);
    let entryIndexOffset = -1;
    for (let step = 0; step < Math.min(future.length, config.maxBarsToTrigger); step++) {
      const candle = future[step]!;
      const touchedEntry = candle.l <= entry && candle.h >= entry;
      const brokeStopFirst = decision.direction === "COMPRA" ? candle.l <= stop : candle.h >= stop;
      if (touchedEntry) {
        entryIndexOffset = step;
        break;
      }
      if (brokeStopFirst) {
        trade.outcome = "INVALIDATED_BEFORE_ENTRY";
        trade.exitReason = "Stop estrutural perdido antes de o preço acionar a entrada.";
        trade.exitAt = candle.t;
        break;
      }
    }

    if (entryIndexOffset < 0) {
      if (trade.outcome === "EXPIRED_NO_TRIGGER") {
        trade.exitReason = `Entrada não acionada em ${config.maxBarsToTrigger} candles.`;
      }
      trades.push(trade);
      continue;
    }

    const entryCandle = future[entryIndexOffset]!;
    trade.outcome = "EXECUTED";
    trade.entryAt = entryCandle.t;

    let mfe = 0;
    let mae = 0;
    let exitPrice: number | null = null;
    let exitAt: number | null = null;
    let exitReason = "";
    let lastIndexOffset = entryIndexOffset;

    for (
      let step = entryIndexOffset;
      step < Math.min(future.length, entryIndexOffset + config.maxBarsInTrade);
      step++
    ) {
      const candle = future[step]!;
      lastIndexOffset = step;
      const favourable = sign === 1 ? candle.h - entry : entry - candle.l;
      const adverse = sign === 1 ? entry - candle.l : candle.h - entry;
      mfe = Math.max(mfe, favourable);
      mae = Math.max(mae, adverse);

      const hitStop = sign === 1 ? candle.l <= stop : candle.h >= stop;
      const hitTarget = sign === 1 ? candle.h >= target : candle.l <= target;

      if (hitStop && hitTarget) {
        // Ambiguidade intrabar: o OHLC não revela a ordem dos toques.
        exitPrice = stop;
        exitAt = candle.t;
        exitReason = "STOP (ambiguidade intrabar resolvida de forma pessimista)";
        break;
      }
      if (hitStop) {
        exitPrice = stop;
        exitAt = candle.t;
        exitReason = "STOP";
        break;
      }
      if (hitTarget) {
        exitPrice = target;
        exitAt = candle.t;
        exitReason = `ALVO ${config.targetR}R`;
        break;
      }
    }

    if (exitPrice === null) {
      const last = future[lastIndexOffset]!;
      exitPrice = last.c;
      exitAt = last.t;
      exitReason = "ENCERRAMENTO POR TEMPO (dados insuficientes para stop/alvo)";
    }

    const grossPoints = (exitPrice - entry) * sign;
    const net = netResultR({
      grossPoints,
      riskPoints,
      costs: config.costs,
      contracts: config.contracts,
    });

    trade.exitPrice = exitPrice;
    trade.exitAt = exitAt;
    trade.exitReason = exitReason;
    trade.grossPoints = grossPoints;
    trade.netPoints = net?.netPoints ?? null;
    trade.resultR = net?.resultR ?? null;
    trade.result = net ? classifyResult(net.resultR) : null;
    trade.mfePoints = mfe;
    trade.maePoints = mae;
    trade.mfeR = riskPoints > 0 ? mfe / riskPoints : null;
    trade.maeR = riskPoints > 0 ? mae / riskPoints : null;

    trades.push(trade);
    busyUntilIndex = index + 1 + lastIndexOffset;
  }

  hooks.onProgress?.({
    processed: to,
    total: series.length,
    opportunities: trades.length,
    executed: trades.filter((trade) => trade.outcome === "EXECUTED").length,
  });

  return {
    trades,
    busyUntilIndex,
    scannedCandles: series.length,
    decisionsEvaluated,
    cancelled,
    seriesHash: seriesHash(series),
    configHash:
      trades[0]?.configHash ??
      evaluateT4Core(new CausalWindow(series, series.length - 1), true)?.configHash ??
      "",
    strategyVersion: trades[0]?.strategyVersion ?? "",
    firstCandleAt: series[0]?.t ?? null,
    lastCandleAt: series[series.length - 1]?.t ?? null,
  };
}
