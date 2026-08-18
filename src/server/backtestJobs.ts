import { randomUUID } from "node:crypto";

import type { Candle } from "@/lib/engines/types";
import { runBacktest, seriesHash, type BacktestConfig } from "@/lib/t4/backtest/runner";
import { T4_CONFIG_HASH, T4_CORE_CONFIG, T4_CORE_VERSION } from "@/lib/t4/core/t4CoreEngine";
import { datasetHash, splitDatasets } from "@/lib/t4/validation/datasets";
import { computeT4Metrics } from "@/lib/t4/validation/metrics";
import { computeRobustness } from "@/lib/t4/validation/robustness";
import { bootstrapExpectancy, monteCarloSequences } from "@/lib/t4/validation/resampling";
import type { T4Trade } from "@/lib/t4/validation/types";
import {
  createBacktestRun,
  ensureValidationSchema,
  findReproducibleRun,
  recordAuditEvent,
  registerStrategyVersion,
  saveMetrics,
  saveSimulationRun,
  saveTrades,
  saveValidationResult,
  updateBacktestRun,
  type BacktestRunRecord,
} from "./validationRepository";

/**
 * JOB DE BACKTEST EM SEGUNDO PLANO (requisito 17).
 *
 * A varredura histórica pode levar minutos. Rodá-la dentro do handler HTTP
 * deixaria a interface travada e o navegador estouraria o timeout. Aqui o
 * endpoint só ENFILEIRA: devolve o `runId` na hora, e o progresso é
 * consultado depois.
 *
 * COOPERATIVO, NÃO PREEMPTIVO: o runner devolve o controle ao event loop a
 * cada bloco de candles (`await yieldToEventLoop`). Sem isso, um laço síncrono
 * de 200 mil candles bloquearia o processo inteiro — inclusive o
 * `/api/health` — e o cancelamento nunca seria lido.
 */

export interface JobProgress {
  runId: string;
  status: BacktestRunRecord["status"];
  progress: number;
  processed: number;
  total: number;
  opportunities: number;
  executed: number;
  error: string | null;
  startedAt: number;
  finishedAt: number | null;
}

interface Job {
  progress: JobProgress;
  cancelRequested: boolean;
}

const jobs = new Map<string, Job>();

/** Runs mantidos em memória para consulta de progresso. */
const MAX_TRACKED_JOBS = 50;

function trackJob(runId: string, startedAt: number): Job {
  const job: Job = {
    progress: {
      runId,
      status: "QUEUED",
      progress: 0,
      processed: 0,
      total: 0,
      opportunities: 0,
      executed: 0,
      error: null,
      startedAt,
      finishedAt: null,
    },
    cancelRequested: false,
  };
  jobs.set(runId, job);
  // Descarta os mais antigos já encerrados, nunca um job vivo.
  if (jobs.size > MAX_TRACKED_JOBS) {
    for (const [key, value] of jobs) {
      if (jobs.size <= MAX_TRACKED_JOBS) break;
      if (value.progress.finishedAt !== null) jobs.delete(key);
    }
  }
  return job;
}

export function jobProgress(runId: string): JobProgress | null {
  return jobs.get(runId)?.progress ?? null;
}

export function listJobs(): JobProgress[] {
  return [...jobs.values()].map((job) => job.progress).sort((a, b) => b.startedAt - a.startedAt);
}

/** Pedido de cancelamento. O runner lê a bandeira no próximo candle. */
export function requestCancel(runId: string): boolean {
  const job = jobs.get(runId);
  if (!job || job.progress.finishedAt !== null) return false;
  job.cancelRequested = true;
  return true;
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

export interface StartBacktestInput {
  candles: Candle[];
  config: BacktestConfig;
  actor?: string;
  /** Quando true, um run já calculado com a mesma config+dataset é reaproveitado. */
  reuseReproducible?: boolean;
}

export interface StartBacktestResult {
  runId: string;
  reused: boolean;
  /** Preenchido quando o run foi reaproveitado. */
  existing: BacktestRunRecord | null;
}

/**
 * Enfileira o backtest e devolve imediatamente. O trabalho pesado roda depois,
 * fora do caminho da requisição.
 */
export function startBacktest(input: StartBacktestInput): StartBacktestResult {
  ensureValidationSchema();
  registerStrategyVersion({
    version: T4_CORE_VERSION,
    configHash: T4_CONFIG_HASH,
    config: T4_CORE_CONFIG,
    notes: "Registrada automaticamente ao enfileirar um backtest.",
  });

  const series = input.candles.slice().sort((a, b) => a.t - b.t);
  const hash = seriesHash(series);

  if (input.reuseReproducible !== false) {
    const existing = findReproducibleRun(T4_CONFIG_HASH, hash);
    if (existing) {
      return { runId: existing.runId, reused: true, existing };
    }
  }

  const runId = randomUUID();
  const startedAt = Date.now();
  createBacktestRun({
    runId,
    strategyVersion: T4_CORE_VERSION,
    configHash: T4_CONFIG_HASH,
    symbol: input.config.symbol,
    timeframe: input.config.timeframe,
    costs: input.config.costs,
    slippagePoints: input.config.costs.slippagePoints,
    confluenceThreshold: input.config.confluenceThreshold,
    createdAt: startedAt,
  });
  recordAuditEvent({
    eventId: randomUUID(),
    actor: input.actor ?? "operador",
    action: "BACKTEST_ENFILEIRADO",
    subject: runId,
    detail: {
      symbol: input.config.symbol,
      timeframe: input.config.timeframe,
      candles: series.length,
      confluenceThreshold: input.config.confluenceThreshold,
      seriesHash: hash,
    },
    createdAt: startedAt,
  });

  const job = trackJob(runId, startedAt);
  job.progress.total = series.length;

  // Dispara sem await: a requisição HTTP não espera o backtest terminar.
  void executeJob(runId, job, series, input.config, hash);

  return { runId, reused: false, existing: null };
}

async function executeJob(
  runId: string,
  job: Job,
  series: Candle[],
  config: BacktestConfig,
  hash: string,
): Promise<void> {
  // Devolve o controle ANTES de qualquer trabalho: `startBacktest` precisa
  // retornar com o run ainda em QUEUED, sem que nada pesado tenha rodado
  // dentro da requisição HTTP.
  await yieldToEventLoop();
  job.progress.status = "RUNNING";
  updateBacktestRun(runId, { status: "RUNNING", seriesHash: hash });

  try {
    // O runner é síncrono; a devolução de controle acontece nos blocos abaixo.
    const result = await runInChunks(series, config, job);

    if (job.cancelRequested) {
      job.progress.status = "CANCELLED";
      job.progress.finishedAt = Date.now();
      updateBacktestRun(runId, {
        status: "CANCELLED",
        progress: job.progress.progress,
        finishedAt: job.progress.finishedAt,
      });
      recordAuditEvent({
        eventId: randomUUID(),
        actor: "sistema",
        action: "BACKTEST_CANCELADO",
        subject: runId,
      });
      return;
    }

    finalizeRun(runId, result.trades, series, hash, job);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    job.progress.status = "ERROR";
    job.progress.error = message;
    job.progress.finishedAt = Date.now();
    updateBacktestRun(runId, {
      status: "ERROR",
      error: message,
      finishedAt: job.progress.finishedAt,
    });
    recordAuditEvent({
      eventId: randomUUID(),
      actor: "sistema",
      action: "BACKTEST_ERRO",
      subject: runId,
      detail: { message },
    });
  }
}

/** Tamanho do bloco entre devoluções de controle ao event loop. */
export const CHUNK_CANDLES = 500;

async function runInChunks(
  series: Candle[],
  config: BacktestConfig,
  job: Job,
): Promise<{ trades: T4Trade[] }> {
  // Cada bloco decide apenas os candles NOVOS, mas a janela causal enxerga a
  // série inteira até ali — a decisão é idêntica à de um run único. Entre
  // blocos o controle volta ao event loop, então /api/health continua
  // respondendo e o cancelamento é lido.
  const trades: T4Trade[] = [];
  let processed = 0;
  let busyUntilIndex = -1;

  while (processed < series.length && !job.cancelRequested) {
    const end = Math.min(series.length, processed + CHUNK_CANDLES);
    const result = runBacktest(series, config, {
      fromIndex: processed,
      toIndex: end,
      busyUntilIndex,
      shouldCancel: () => job.cancelRequested,
      progressEvery: CHUNK_CANDLES,
    });
    trades.push(...result.trades);
    busyUntilIndex = result.busyUntilIndex;
    processed = end;

    job.progress.processed = processed;
    job.progress.progress = Math.round((processed / series.length) * 1000) / 10;
    job.progress.opportunities = trades.length;
    job.progress.executed = trades.filter((trade) => trade.outcome === "EXECUTED").length;

    await yieldToEventLoop();
  }

  return { trades };
}

function finalizeRun(
  runId: string,
  trades: T4Trade[],
  series: Candle[],
  hash: string,
  job: Job,
): void {
  const split = splitDatasets(trades);
  const allSplit = [...split.train, ...split.outOfSample, ...split.forward];
  const dataset = datasetHash(allSplit);

  saveTrades(runId, allSplit);

  for (const [name, list] of [
    ["ALL", allSplit],
    ["TRAIN", split.train],
    ["OUT_OF_SAMPLE", split.outOfSample],
    ["FORWARD", split.forward],
  ] as const) {
    const metrics = computeT4Metrics(list);
    saveMetrics({ runId, dataset: name, metrics });
  }

  const report = computeRobustness(split);
  saveValidationResult({
    resultId: randomUUID(),
    runId,
    strategyVersion: T4_CORE_VERSION,
    configHash: T4_CONFIG_HASH,
    status: report.status,
    robustness: report.score,
    report,
  });

  // Simulações com semente registrada — reprodutíveis por definição.
  const boot = bootstrapExpectancy(allSplit);
  saveSimulationRun({
    simulationId: randomUUID(),
    runId,
    kind: "BOOTSTRAP",
    seed: boot.seed,
    iterations: boot.iterations,
    result: boot,
  });
  const monteCarlo = monteCarloSequences(allSplit);
  saveSimulationRun({
    simulationId: randomUUID(),
    runId,
    kind: "MONTE_CARLO",
    seed: monteCarlo.seed,
    iterations: monteCarlo.iterations,
    result: monteCarlo,
  });

  const finishedAt = Date.now();
  job.progress.status = "DONE";
  job.progress.progress = 100;
  job.progress.finishedAt = finishedAt;
  job.progress.opportunities = trades.length;
  job.progress.executed = trades.filter((trade) => trade.outcome === "EXECUTED").length;

  updateBacktestRun(runId, {
    status: "DONE",
    progress: 100,
    scannedCandles: series.length,
    opportunities: trades.length,
    executed: job.progress.executed,
    datasetHash: dataset,
    seriesHash: hash,
    periodFrom: series[0]?.t ?? null,
    periodTo: series[series.length - 1]?.t ?? null,
    finishedAt,
  });
  recordAuditEvent({
    eventId: randomUUID(),
    actor: "sistema",
    action: "BACKTEST_CONCLUIDO",
    subject: runId,
    detail: {
      trades: trades.length,
      executed: job.progress.executed,
      status: report.status,
      robustness: report.score,
      datasetHash: dataset,
    },
    createdAt: finishedAt,
  });
}

/** Usado apenas por testes. */
export function resetJobsForTests(): void {
  jobs.clear();
}
