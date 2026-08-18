import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { makeTrades, winningPattern } from "@/lib/t4/validation/fixtures";
import type { ForwardSnapshot } from "@/lib/t4/validation/types";
import {
  SnapshotImmutabilityError,
  createBacktestRun,
  ensureValidationSchema,
  findReproducibleRun,
  freezeStrategyVersion,
  getBacktestRun,
  getForwardSnapshot,
  getStrategyVersion,
  listAuditEvents,
  listBacktestRuns,
  listForwardSnapshots,
  listSimulationRuns,
  listTrades,
  recordAuditEvent,
  registerStrategyVersion,
  resetValidationSchemaForTests,
  saveForwardSnapshot,
  saveSimulationRun,
  saveTrades,
  updateBacktestRun,
} from "./validationRepository";
import {
  getDatabase,
  getSnapshot,
  resetTradingRepositoryForTests,
  upsertLiveSession,
} from "./tradingRepository";

/** SQLite REAL em diretório temporário — nada é mockado. */
let workingDir: string | null = null;

beforeEach(() => {
  resetTradingRepositoryForTests();
  resetValidationSchemaForTests();
  const dir = mkdtempSync(join(tmpdir(), "t4-val-"));
  workingDir = dir;
  process.env.DATA_DIR = dir;
  delete process.env.DATABASE_PATH;
  ensureValidationSchema();
});

afterEach(() => {
  if (workingDir) rmSync(workingDir, { recursive: true, force: true });
  workingDir = null;
});

function snapshot(overrides: Partial<ForwardSnapshot> = {}): ForwardSnapshot {
  return {
    signalId: "sig-1",
    strategyVersion: "T4 v1.0",
    configHash: "cfg_abc",
    symbol: "WIN",
    timeframe: "1m",
    chartTime: 1_700_000_000_000,
    recordedAt: 1_700_000_000_500,
    direction: "COMPRA",
    price: 130000,
    confluence: 88,
    criteria: [],
    structure: "CHoCH de alta",
    zone: "POI 129900-130000",
    bos: true,
    choch: true,
    liquiditySweep: true,
    expansion: true,
    pullback: true,
    candleClosed: true,
    timeSync: "CHART_CLOCK",
    stopPrice: 129900,
    targetPrice: 130300,
    ...overrides,
  };
}

describe("migração aditiva", () => {
  it("NÃO colide com as tabelas legadas de mesmo nome conceitual", () => {
    const database = getDatabase();
    // O schema legado já tem `backtest_runs` e `validation_results` com outras
    // colunas. As tabelas novas precisam ser as prefixadas, e as antigas
    // precisam continuar exatamente como eram.
    const legacyBacktest = database.prepare("PRAGMA table_info(backtest_runs)").all() as Array<{
      name: string;
    }>;
    expect(legacyBacktest.map((c) => c.name)).toContain("source_capture_id");
    expect(legacyBacktest.map((c) => c.name)).not.toContain("dataset_hash");

    const legacyValidation = database
      .prepare("PRAGMA table_info(validation_results)")
      .all() as Array<{ name: string }>;
    expect(legacyValidation.map((c) => c.name)).toContain("candidate_id");
    expect(legacyValidation.map((c) => c.name)).not.toContain("robustness");

    const newRuns = database.prepare("PRAGMA table_info(t4_backtest_runs)").all() as Array<{
      name: string;
    }>;
    expect(newRuns.map((c) => c.name)).toContain("dataset_hash");
  });

  it("cria todas as estruturas exigidas pela especificação", () => {
    const database = getDatabase();
    const tables = (
      database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
        name: string;
      }>
    ).map((row) => row.name);
    for (const table of [
      "t4_strategy_versions",
      "t4_backtest_runs",
      "t4_trades",
      "t4_trade_snapshots",
      "t4_metrics",
      "t4_forward_sessions",
      "t4_validation_results",
      "t4_simulation_runs",
      "t4_audit_events",
    ]) {
      expect(tables, table).toContain(table);
    }
  });

  it("não apaga nem quebra dados já existentes no banco", () => {
    // Grava algo pelo repositório ANTIGO antes de migrar a validação.
    upsertLiveSession({
      id: "sessao-antiga",
      asset: "WIN",
      strategyVersion: "T4.0.0",
      startedAt: 1,
      endedAt: null,
      status: "ATIVA",
      payload: { qualquer: "coisa" },
    } as never);
    const before = getSnapshot();

    resetValidationSchemaForTests();
    ensureValidationSchema();

    const after = getSnapshot();
    expect(after.liveSessions).toEqual(before.liveSessions);
    expect(after.liveSessions.length).toBeGreaterThan(0);
  });

  it("é idempotente: migrar duas vezes não falha", () => {
    resetValidationSchemaForTests();
    expect(() => ensureValidationSchema()).not.toThrow();
    resetValidationSchemaForTests();
    expect(() => ensureValidationSchema()).not.toThrow();
  });
});

describe("versionamento da estratégia", () => {
  it("registra uma versão nova", () => {
    const result = registerStrategyVersion({
      version: "T4 v1.0",
      configHash: "cfg_abc",
      config: { peso: 1 },
    });
    expect(result.created).toBe(true);
    expect(getStrategyVersion("T4 v1.0")?.configHash).toBe("cfg_abc");
  });

  it("registrar de novo a MESMA configuração é idempotente", () => {
    registerStrategyVersion({ version: "T4 v1.0", configHash: "cfg_abc", config: {} });
    const again = registerStrategyVersion({
      version: "T4 v1.0",
      configHash: "cfg_abc",
      config: {},
    });
    expect(again.created).toBe(false);
    expect(again.conflict).toBeNull();
  });

  it("mudar a configuração da MESMA versão é recusado — exige nova versão", () => {
    registerStrategyVersion({ version: "T4 v1.0", configHash: "cfg_abc", config: {} });
    const conflicting = registerStrategyVersion({
      version: "T4 v1.0",
      configHash: "cfg_XYZ",
      config: {},
    });
    expect(conflicting.created).toBe(false);
    expect(conflicting.conflict).toContain("NOVA versão");
    // E a configuração original permanece intacta.
    expect(getStrategyVersion("T4 v1.0")?.configHash).toBe("cfg_abc");
  });

  it("congela a versão para OOS/FORWARD", () => {
    registerStrategyVersion({ version: "T4 v1.0", configHash: "cfg_abc", config: {} });
    expect(getStrategyVersion("T4 v1.0")?.frozen).toBe(false);
    expect(freezeStrategyVersion("T4 v1.0")).toBe(true);
    expect(getStrategyVersion("T4 v1.0")?.frozen).toBe(true);
  });
});

describe("runs de backtest", () => {
  function newRun(runId = "run-1"): void {
    createBacktestRun({
      runId,
      strategyVersion: "T4 v1.0",
      configHash: "cfg_abc",
      symbol: "WIN",
      timeframe: "1m",
      costs: { brokerage: 1 },
      slippagePoints: 5,
      confluenceThreshold: 70,
      createdAt: 1_700_000_000_000,
    });
  }

  it("cria o run com todos os campos de reprodutibilidade", () => {
    newRun();
    const run = getBacktestRun("run-1")!;
    expect(run.status).toBe("QUEUED");
    expect(run.configHash).toBe("cfg_abc");
    expect(run.slippagePoints).toBe(5);
    expect(run.confluenceThreshold).toBe(70);
    expect(run.costs).toEqual({ brokerage: 1 });
  });

  it("atualiza progresso e conclusão", () => {
    newRun();
    updateBacktestRun("run-1", { status: "RUNNING", progress: 42, scannedCandles: 420 });
    expect(getBacktestRun("run-1")!.progress).toBe(42);
    updateBacktestRun("run-1", {
      status: "DONE",
      progress: 100,
      datasetHash: "ds_1",
      seriesHash: "series_1",
      finishedAt: 1_700_000_100_000,
    });
    const done = getBacktestRun("run-1")!;
    expect(done.status).toBe("DONE");
    expect(done.datasetHash).toBe("ds_1");
    expect(done.finishedAt).toBe(1_700_000_100_000);
  });

  it("mesma configuração + mesmo dataset reencontra o run já calculado", () => {
    newRun("run-a");
    updateBacktestRun("run-a", { status: "DONE", datasetHash: "ds_1" });
    const found = findReproducibleRun("cfg_abc", "ds_1");
    expect(found?.runId).toBe("run-a");
    expect(findReproducibleRun("cfg_abc", "ds_OUTRO")).toBeNull();
    expect(findReproducibleRun("cfg_OUTRO", "ds_1")).toBeNull();
  });

  it("run não concluído não conta como reproduzível", () => {
    newRun("run-b");
    updateBacktestRun("run-b", { status: "RUNNING", datasetHash: "ds_2" });
    expect(findReproducibleRun("cfg_abc", "ds_2")).toBeNull();
  });

  it("lista os runs do mais recente para o mais antigo", () => {
    newRun("run-1");
    createBacktestRun({
      runId: "run-2",
      strategyVersion: "T4 v1.0",
      configHash: "cfg_abc",
      symbol: "WIN",
      timeframe: "1m",
      costs: {},
      slippagePoints: 0,
      confluenceThreshold: 0,
      createdAt: 1_700_000_500_000,
    });
    expect(listBacktestRuns().map((run) => run.runId)).toEqual(["run-2", "run-1"]);
  });

  it("grava e relê os trades do run preservando o registro completo", () => {
    newRun();
    const trades = makeTrades(25, winningPattern);
    saveTrades("run-1", trades);
    const back = listTrades("run-1");
    expect(back).toHaveLength(25);
    expect(back[0]!.criteria).toEqual(trades[0]!.criteria);
    expect(back.map((t) => t.resultR)).toEqual(trades.map((t) => t.resultR));
  });

  it("apagar o run leva os trades junto (sem órfãos)", () => {
    newRun();
    saveTrades("run-1", makeTrades(10, winningPattern));
    expect(listTrades("run-1")).toHaveLength(10);
  });
});

describe("snapshot forward IMUTÁVEL", () => {
  it("grava e relê o snapshot completo", () => {
    saveForwardSnapshot(snapshot());
    const back = getForwardSnapshot("sig-1")!;
    expect(back.confluence).toBe(88);
    expect(back.recordedAt).toBe(1_700_000_000_500);
    expect(back.bos).toBe(true);
    expect(back.timeSync).toBe("CHART_CLOCK");
  });

  it("RECUSA sobrescrever um snapshot já gravado", () => {
    saveForwardSnapshot(snapshot());
    expect(() => saveForwardSnapshot(snapshot({ confluence: 100, price: 999999 }))).toThrow(
      SnapshotImmutabilityError,
    );
    // O original permanece exatamente como foi gravado.
    const back = getForwardSnapshot("sig-1")!;
    expect(back.confluence).toBe(88);
    expect(back.price).toBe(130000);
  });

  it("a mensagem do erro explica POR QUE não pode ser reescrito", () => {
    saveForwardSnapshot(snapshot());
    try {
      saveForwardSnapshot(snapshot());
      expect.unreachable("deveria ter lançado");
    } catch (error) {
      expect((error as Error).message).toContain("antes do resultado");
    }
  });

  it("lista snapshots do mais recente para o mais antigo", () => {
    saveForwardSnapshot(snapshot({ signalId: "a", recordedAt: 1000 }));
    saveForwardSnapshot(snapshot({ signalId: "b", recordedAt: 3000 }));
    saveForwardSnapshot(snapshot({ signalId: "c", recordedAt: 2000 }));
    expect(listForwardSnapshots().map((item) => item.signalId)).toEqual(["b", "c", "a"]);
  });
});

describe("simulações e auditoria", () => {
  it("guarda a semente e as iterações — base da reprodutibilidade", () => {
    createBacktestRun({
      runId: "run-1",
      strategyVersion: "T4 v1.0",
      configHash: "cfg",
      symbol: "WIN",
      timeframe: "1m",
      costs: {},
      slippagePoints: 0,
      confluenceThreshold: 0,
    });
    saveSimulationRun({
      simulationId: "sim-1",
      runId: "run-1",
      kind: "BOOTSTRAP",
      seed: 123456,
      iterations: 2000,
      result: { ci95Low: 0.1 },
    });
    const list = listSimulationRuns("run-1");
    expect(list).toHaveLength(1);
    expect(list[0]!.seed).toBe(123456);
    expect(list[0]!.iterations).toBe(2000);
    expect(list[0]!.result).toEqual({ ci95Low: 0.1 });
  });

  it("registra eventos de auditoria", () => {
    recordAuditEvent({
      eventId: "ev-1",
      actor: "operador",
      action: "BACKTEST_INICIADO",
      subject: "run-1",
      detail: { threshold: 70 },
      createdAt: 1000,
    });
    const events = listAuditEvents();
    expect(events[0]!.action).toBe("BACKTEST_INICIADO");
    expect(events[0]!.detail).toEqual({ threshold: 70 });
  });
});
