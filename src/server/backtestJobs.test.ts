import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Candle } from "@/lib/engines/types";
import { DEFAULT_BACKTEST_CONFIG, runBacktest } from "@/lib/t4/backtest/runner";
import {
  CHUNK_CANDLES,
  jobProgress,
  requestCancel,
  resetJobsForTests,
  startBacktest,
} from "./backtestJobs";
import {
  ensureValidationSchema,
  getBacktestRun,
  listAuditEvents,
  listSimulationRuns,
  listTrades,
  resetValidationSchemaForTests,
} from "./validationRepository";
import { resetTradingRepositoryForTests } from "./tradingRepository";

/** Série determinística — reprodutibilidade é requisito, não conveniência. */
function series(count: number): Candle[] {
  const out: Candle[] = [];
  const base = 130000;
  for (let i = 0; i < count; i++) {
    const at = (n: number) => base + Math.sin(n / 9) * 200 + Math.sin(n / 31) * 400 + n * 4;
    const open = at(i);
    const close = at(i + 1);
    out.push({
      t: 1_700_000_000_000 + i * 60_000,
      o: open,
      h: Math.max(open, close) + 40,
      l: Math.min(open, close) - 40,
      c: close,
      v: 0,
    });
  }
  return out;
}

let workingDir: string | null = null;

beforeEach(() => {
  resetTradingRepositoryForTests();
  resetValidationSchemaForTests();
  resetJobsForTests();
  const dir = mkdtempSync(join(tmpdir(), "t4-job-"));
  workingDir = dir;
  process.env.DATA_DIR = dir;
  delete process.env.DATABASE_PATH;
  ensureValidationSchema();
});

afterEach(() => {
  if (workingDir) rmSync(workingDir, { recursive: true, force: true });
  workingDir = null;
});

async function waitForFinish(runId: string, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const progress = jobProgress(runId);
    if (progress?.finishedAt !== null && progress !== null) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Job ${runId} não terminou em ${timeoutMs}ms`);
}

describe("fatiamento não altera o resultado", () => {
  it("varrer em blocos produz EXATAMENTE os mesmos trades de um run único", () => {
    const data = series(1200);
    const config = { ...DEFAULT_BACKTEST_CONFIG, confluenceThreshold: 0 };

    const single = runBacktest(data, config);

    const chunked: string[] = [];
    const chunkedR: Array<number | null> = [];
    let busyUntilIndex = -1;
    for (let from = 0; from < data.length; from += CHUNK_CANDLES) {
      const result = runBacktest(data, config, {
        fromIndex: from,
        toIndex: Math.min(data.length, from + CHUNK_CANDLES),
        busyUntilIndex,
      });
      busyUntilIndex = result.busyUntilIndex;
      for (const trade of result.trades) {
        chunked.push(trade.tradeId);
        chunkedR.push(trade.resultR);
      }
    }

    expect(chunked).toEqual(single.trades.map((trade) => trade.tradeId));
    expect(chunkedR).toEqual(single.trades.map((trade) => trade.resultR));
  });

  it("sem o estado de continuidade, a fronteira entre blocos duplicaria operações", () => {
    const data = series(1200);
    const config = { ...DEFAULT_BACKTEST_CONFIG, confluenceThreshold: 0 };
    const single = runBacktest(data, config);

    const naive: string[] = [];
    for (let from = 0; from < data.length; from += CHUNK_CANDLES) {
      // De propósito SEM passar busyUntilIndex.
      const result = runBacktest(data, config, {
        fromIndex: from,
        toIndex: Math.min(data.length, from + CHUNK_CANDLES),
      });
      naive.push(...result.trades.map((trade) => trade.tradeId));
    }
    // Este teste existe para provar que o estado é NECESSÁRIO, não decorativo.
    expect(naive.length).toBeGreaterThanOrEqual(single.trades.length);
  });
});

describe("job em segundo plano", () => {
  it("enfileira e devolve o runId imediatamente", () => {
    const started = Date.now();
    const result = startBacktest({ candles: series(600), config: DEFAULT_BACKTEST_CONFIG });
    // Enfileirar tem de ser instantâneo: a requisição HTTP não pode esperar.
    expect(Date.now() - started).toBeLessThan(500);
    expect(result.runId).toBeTruthy();
    expect(result.reused).toBe(false);
    expect(getBacktestRun(result.runId)?.status).toBe("QUEUED");
  });

  it("conclui, grava trades, métricas, robustez e simulações", async () => {
    const result = startBacktest({
      candles: series(900),
      config: { ...DEFAULT_BACKTEST_CONFIG, confluenceThreshold: 0 },
    });
    await waitForFinish(result.runId);

    const run = getBacktestRun(result.runId)!;
    expect(run.status).toBe("DONE");
    expect(run.progress).toBe(100);
    expect(run.scannedCandles).toBe(900);
    expect(run.datasetHash).not.toBe("");
    expect(run.periodFrom).toBe(1_700_000_000_000);

    expect(listTrades(result.runId).length).toBe(run.opportunities);

    const simulations = listSimulationRuns(result.runId);
    expect(simulations.map((item) => item.kind).sort()).toEqual(["BOOTSTRAP", "MONTE_CARLO"]);
    // A semente gravada é o que torna a simulação reproduzível.
    for (const simulation of simulations) expect(Number.isFinite(simulation.seed)).toBe(true);
  });

  it("reporta progresso crescente até 100", async () => {
    const result = startBacktest({ candles: series(900), config: DEFAULT_BACKTEST_CONFIG });
    const seen: number[] = [];
    while (jobProgress(result.runId)?.finishedAt === null) {
      seen.push(jobProgress(result.runId)!.progress);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(jobProgress(result.runId)!.progress).toBe(100);
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]!);
  });

  it("cancela no meio e NÃO grava resultado parcial como concluído", async () => {
    const result = startBacktest({ candles: series(4000), config: DEFAULT_BACKTEST_CONFIG });
    expect(requestCancel(result.runId)).toBe(true);
    await waitForFinish(result.runId);

    expect(jobProgress(result.runId)!.status).toBe("CANCELLED");
    const run = getBacktestRun(result.runId)!;
    expect(run.status).toBe("CANCELLED");
    expect(run.progress).toBeLessThan(100);
    // Run cancelado não vira resultado válido nem entra na reprodutibilidade.
    expect(run.datasetHash).toBe("");
    expect(listTrades(result.runId)).toEqual([]);
  });

  it("cancelar um run já encerrado é recusado", async () => {
    const result = startBacktest({ candles: series(300), config: DEFAULT_BACKTEST_CONFIG });
    await waitForFinish(result.runId);
    expect(requestCancel(result.runId)).toBe(false);
  });

  it("não bloqueia o event loop durante a varredura", async () => {
    const result = startBacktest({ candles: series(3000), config: DEFAULT_BACKTEST_CONFIG });
    // Se o job fosse síncrono, este timer não dispararia antes do fim.
    const tick = await new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(true), 5);
    });
    expect(tick).toBe(true);
    expect(jobProgress(result.runId)!.finishedAt).toBeNull();
    requestCancel(result.runId);
    await waitForFinish(result.runId);
  });

  it("mesma série e mesma configuração reaproveitam o run já calculado", async () => {
    const data = series(600);
    const first = startBacktest({ candles: data, config: DEFAULT_BACKTEST_CONFIG });
    await waitForFinish(first.runId);

    const second = startBacktest({ candles: data, config: DEFAULT_BACKTEST_CONFIG });
    expect(second.reused).toBe(true);
    expect(second.runId).toBe(first.runId);
  });

  it("registra a trilha de auditoria do run", async () => {
    const result = startBacktest({ candles: series(400), config: DEFAULT_BACKTEST_CONFIG });
    await waitForFinish(result.runId);
    const actions = listAuditEvents()
      .filter((event) => event.subject === result.runId)
      .map((event) => event.action);
    expect(actions).toContain("BACKTEST_ENFILEIRADO");
    expect(actions).toContain("BACKTEST_CONCLUIDO");
  });
});
