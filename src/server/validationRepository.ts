import type { DatabaseSync } from "node:sqlite";

import type { ForwardSnapshot, T4Trade, ValidationStatus } from "@/lib/t4/validation/types";
import type { RobustnessReport } from "@/lib/t4/validation/robustness";
import { getDatabase } from "./tradingRepository";

/**
 * PERSISTÊNCIA DA VALIDAÇÃO ESTATÍSTICA (requisitos 16, 18 e 9).
 *
 * A migração é ADITIVA: só `CREATE TABLE IF NOT EXISTS` e `CREATE INDEX IF
 * NOT EXISTS`. Nenhuma tabela existente é alterada, renomeada ou apagada —
 * um banco em produção com histórico do operador atravessa esta migração sem
 * perder um registro.
 *
 * PREFIXO `t4_` EM TODAS AS TABELAS, E O MOTIVO É CONCRETO: o schema legado
 * já tem `backtest_runs` e `validation_results` com OUTRAS colunas. Sem o
 * prefixo, o `CREATE TABLE IF NOT EXISTS` viraria um no-op silencioso e toda
 * escrita seguinte falharia com `no such column` — ou, pior, gravaria em cima
 * de dados que não são deste subsistema.
 *
 * IMUTABILIDADE DO SNAPSHOT (requisito 9): `t4_trade_snapshots` só aceita
 * INSERT. `saveForwardSnapshot` recusa sobrescrever um signalId já gravado —
 * um snapshot que pudesse ser reescrito depois do resultado não provaria
 * anterioridade nenhuma, que é a única razão de ele existir.
 */

let migrated = false;

function db(): DatabaseSync {
  const database = getDatabase();
  if (!migrated) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS t4_strategy_versions (
        version TEXT PRIMARY KEY,
        config_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        frozen INTEGER NOT NULL DEFAULT 0,
        config_json TEXT NOT NULL,
        notes TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_strategy_versions_hash ON t4_strategy_versions(config_hash);

      CREATE TABLE IF NOT EXISTS t4_backtest_runs (
        run_id TEXT PRIMARY KEY,
        strategy_version TEXT NOT NULL,
        config_hash TEXT NOT NULL,
        dataset_hash TEXT NOT NULL,
        series_hash TEXT NOT NULL,
        symbol TEXT NOT NULL,
        timeframe TEXT NOT NULL,
        period_from INTEGER,
        period_to INTEGER,
        costs_json TEXT NOT NULL,
        slippage_points REAL NOT NULL DEFAULT 0,
        confluence_threshold REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL,
        progress REAL NOT NULL DEFAULT 0,
        scanned_candles INTEGER NOT NULL DEFAULT 0,
        opportunities INTEGER NOT NULL DEFAULT 0,
        executed INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        created_at INTEGER NOT NULL,
        finished_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_backtest_runs_created ON t4_backtest_runs(created_at);
      CREATE INDEX IF NOT EXISTS idx_backtest_runs_repro
        ON t4_backtest_runs(config_hash, series_hash);

      CREATE TABLE IF NOT EXISTS t4_trades (
        trade_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        signal_id TEXT NOT NULL,
        strategy_version TEXT NOT NULL,
        config_hash TEXT NOT NULL,
        symbol TEXT NOT NULL,
        timeframe TEXT NOT NULL,
        direction TEXT NOT NULL,
        decided_at INTEGER NOT NULL,
        entry_at INTEGER,
        exit_at INTEGER,
        confluence REAL NOT NULL,
        outcome TEXT NOT NULL,
        result TEXT,
        result_r REAL,
        risk_points REAL NOT NULL,
        dataset TEXT NOT NULL,
        regime TEXT,
        session TEXT,
        payload_json TEXT NOT NULL,
        PRIMARY KEY (run_id, trade_id),
        FOREIGN KEY(run_id) REFERENCES t4_backtest_runs(run_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_t4_trades_run ON t4_trades(run_id, decided_at);
      CREATE INDEX IF NOT EXISTS idx_t4_trades_dataset ON t4_trades(run_id, dataset);

      CREATE TABLE IF NOT EXISTS t4_trade_snapshots (
        signal_id TEXT PRIMARY KEY,
        strategy_version TEXT NOT NULL,
        config_hash TEXT NOT NULL,
        symbol TEXT NOT NULL,
        timeframe TEXT NOT NULL,
        chart_time INTEGER NOT NULL,
        recorded_at INTEGER NOT NULL,
        direction TEXT NOT NULL,
        price REAL NOT NULL,
        confluence REAL NOT NULL,
        candle_closed INTEGER NOT NULL,
        time_sync TEXT NOT NULL,
        stop_price REAL NOT NULL,
        target_price REAL NOT NULL,
        payload_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_snapshots_recorded ON t4_trade_snapshots(recorded_at);

      CREATE TABLE IF NOT EXISTS t4_metrics (
        run_id TEXT NOT NULL,
        dataset TEXT NOT NULL,
        computed_at INTEGER NOT NULL,
        trades INTEGER NOT NULL,
        expectancy REAL NOT NULL,
        profit_factor REAL,
        payoff REAL,
        win_rate REAL NOT NULL,
        total_r REAL NOT NULL,
        max_drawdown_r REAL NOT NULL,
        metrics_json TEXT NOT NULL,
        PRIMARY KEY (run_id, dataset),
        FOREIGN KEY(run_id) REFERENCES t4_backtest_runs(run_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS t4_forward_sessions (
        session_id TEXT PRIMARY KEY,
        strategy_version TEXT NOT NULL,
        config_hash TEXT NOT NULL,
        symbol TEXT NOT NULL,
        timeframe TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        snapshots INTEGER NOT NULL DEFAULT 0,
        resolved INTEGER NOT NULL DEFAULT 0,
        notes TEXT
      );

      CREATE TABLE IF NOT EXISTS t4_validation_results (
        result_id TEXT PRIMARY KEY,
        run_id TEXT,
        strategy_version TEXT NOT NULL,
        config_hash TEXT NOT NULL,
        computed_at INTEGER NOT NULL,
        status TEXT NOT NULL,
        robustness REAL NOT NULL,
        report_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_validation_results_run ON t4_validation_results(run_id);

      CREATE TABLE IF NOT EXISTS t4_simulation_runs (
        simulation_id TEXT PRIMARY KEY,
        run_id TEXT,
        kind TEXT NOT NULL,
        seed INTEGER NOT NULL,
        iterations INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        result_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_simulation_runs_run ON t4_simulation_runs(run_id);

      CREATE TABLE IF NOT EXISTS t4_audit_events (
        event_id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        subject TEXT,
        detail_json TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_audit_events_created ON t4_audit_events(created_at);
    `);
    migrated = true;
  }
  return database;
}

/** Força a migração — usada no boot e pelos testes. */
export function ensureValidationSchema(): void {
  db();
}

// ───────────────────────────────────────────────────────── versões

export interface StrategyVersionRecord {
  version: string;
  configHash: string;
  createdAt: number;
  frozen: boolean;
  config: unknown;
  notes: string | null;
}

/**
 * Registra a versão. Se a versão já existe com OUTRO configHash, a mudança de
 * regra/peso/parâmetro exige NOVA VERSÃO — sobrescrever apagaria a
 * rastreabilidade de qual configuração gerou quais trades.
 */
export function registerStrategyVersion(input: {
  version: string;
  configHash: string;
  config: unknown;
  notes?: string | null;
  createdAt?: number;
}): { created: boolean; conflict: string | null } {
  const existing = db()
    .prepare("SELECT config_hash FROM t4_strategy_versions WHERE version = ?")
    .get(input.version) as { config_hash: string } | undefined;

  if (existing) {
    if (existing.config_hash !== input.configHash) {
      return {
        created: false,
        conflict: `A versão ${input.version} já existe com configuração ${existing.config_hash}. Mudança de regra/peso/parâmetro exige NOVA versão.`,
      };
    }
    return { created: false, conflict: null };
  }

  db()
    .prepare(
      `INSERT INTO t4_strategy_versions (version, config_hash, created_at, frozen, config_json, notes)
       VALUES (?,?,?,?,?,?)`,
    )
    .run(
      input.version,
      input.configHash,
      input.createdAt ?? Date.now(),
      0,
      JSON.stringify(input.config),
      input.notes ?? null,
    );
  return { created: true, conflict: null };
}

/** Congela a versão: a partir daqui OOS/FORWARD rodam com regra fixa. */
export function freezeStrategyVersion(version: string): boolean {
  const result = db()
    .prepare("UPDATE t4_strategy_versions SET frozen = 1 WHERE version = ?")
    .run(version);
  return Number(result.changes) > 0;
}

export function getStrategyVersion(version: string): StrategyVersionRecord | null {
  const row = db().prepare("SELECT * FROM t4_strategy_versions WHERE version = ?").get(version) as
    | {
        version: string;
        config_hash: string;
        created_at: number;
        frozen: number;
        config_json: string;
        notes: string | null;
      }
    | undefined;
  if (!row) return null;
  return {
    version: row.version,
    configHash: row.config_hash,
    createdAt: row.created_at,
    frozen: row.frozen === 1,
    config: JSON.parse(row.config_json),
    notes: row.notes,
  };
}

export function listStrategyVersions(): StrategyVersionRecord[] {
  const rows = db()
    .prepare("SELECT version FROM t4_strategy_versions ORDER BY created_at DESC")
    .all() as Array<{ version: string }>;
  return rows.map((row) => getStrategyVersion(row.version)!).filter(Boolean);
}

// ───────────────────────────────────────────────────────── runs

export type RunStatus = "QUEUED" | "RUNNING" | "DONE" | "CANCELLED" | "ERROR";

export interface BacktestRunRecord {
  runId: string;
  strategyVersion: string;
  configHash: string;
  datasetHash: string;
  seriesHash: string;
  symbol: string;
  timeframe: string;
  periodFrom: number | null;
  periodTo: number | null;
  costs: unknown;
  slippagePoints: number;
  confluenceThreshold: number;
  status: RunStatus;
  progress: number;
  scannedCandles: number;
  opportunities: number;
  executed: number;
  error: string | null;
  createdAt: number;
  finishedAt: number | null;
}

export function createBacktestRun(input: {
  runId: string;
  strategyVersion: string;
  configHash: string;
  symbol: string;
  timeframe: string;
  costs: unknown;
  slippagePoints: number;
  confluenceThreshold: number;
  createdAt?: number;
}): void {
  db()
    .prepare(
      `INSERT INTO t4_backtest_runs
       (run_id, strategy_version, config_hash, dataset_hash, series_hash, symbol, timeframe,
        period_from, period_to, costs_json, slippage_points, confluence_threshold,
        status, progress, scanned_candles, opportunities, executed, error, created_at, finished_at)
       VALUES (?,?,?,'','',?,?,NULL,NULL,?,?,?,'QUEUED',0,0,0,0,NULL,?,NULL)`,
    )
    .run(
      input.runId,
      input.strategyVersion,
      input.configHash,
      input.symbol,
      input.timeframe,
      JSON.stringify(input.costs),
      input.slippagePoints,
      input.confluenceThreshold,
      input.createdAt ?? Date.now(),
    );
}

export function updateBacktestRun(
  runId: string,
  patch: Partial<{
    status: RunStatus;
    progress: number;
    scannedCandles: number;
    opportunities: number;
    executed: number;
    datasetHash: string;
    seriesHash: string;
    periodFrom: number | null;
    periodTo: number | null;
    error: string | null;
    finishedAt: number | null;
  }>,
): void {
  const columns: Record<string, string> = {
    status: "status",
    progress: "progress",
    scannedCandles: "scanned_candles",
    opportunities: "opportunities",
    executed: "executed",
    datasetHash: "dataset_hash",
    seriesHash: "series_hash",
    periodFrom: "period_from",
    periodTo: "period_to",
    error: "error",
    finishedAt: "finished_at",
  };
  const sets: string[] = [];
  const values: Array<string | number | null> = [];
  for (const [key, column] of Object.entries(columns)) {
    const value = (patch as Record<string, unknown>)[key];
    if (value === undefined) continue;
    sets.push(`${column} = ?`);
    values.push(value as string | number | null);
  }
  if (sets.length === 0) return;
  values.push(runId);
  db()
    .prepare(`UPDATE t4_backtest_runs SET ${sets.join(", ")} WHERE run_id = ?`)
    .run(...values);
}

function mapRun(row: Record<string, unknown>): BacktestRunRecord {
  return {
    runId: row.run_id as string,
    strategyVersion: row.strategy_version as string,
    configHash: row.config_hash as string,
    datasetHash: row.dataset_hash as string,
    seriesHash: row.series_hash as string,
    symbol: row.symbol as string,
    timeframe: row.timeframe as string,
    periodFrom: (row.period_from as number | null) ?? null,
    periodTo: (row.period_to as number | null) ?? null,
    costs: JSON.parse(row.costs_json as string),
    slippagePoints: row.slippage_points as number,
    confluenceThreshold: row.confluence_threshold as number,
    status: row.status as RunStatus,
    progress: row.progress as number,
    scannedCandles: row.scanned_candles as number,
    opportunities: row.opportunities as number,
    executed: row.executed as number,
    error: (row.error as string | null) ?? null,
    createdAt: row.created_at as number,
    finishedAt: (row.finished_at as number | null) ?? null,
  };
}

export function getBacktestRun(runId: string): BacktestRunRecord | null {
  const row = db().prepare("SELECT * FROM t4_backtest_runs WHERE run_id = ?").get(runId) as
    Record<string, unknown> | undefined;
  return row ? mapRun(row) : null;
}

export function listBacktestRuns(limit = 30): BacktestRunRecord[] {
  const rows = db()
    .prepare("SELECT * FROM t4_backtest_runs ORDER BY created_at DESC LIMIT ?")
    .all(Math.max(1, Math.min(200, limit))) as Array<Record<string, unknown>>;
  return rows.map(mapRun);
}

/**
 * REPRODUTIBILIDADE (requisito 18): mesma configuração + MESMA SÉRIE DE
 * ENTRADA devem devolver o mesmo run.
 *
 * A chave é o `seriesHash` (a ENTRADA), não o `datasetHash` (o resultado):
 * procurar pelo hash dos trades exigiria já ter rodado o backtest para
 * descobrir se era preciso rodá-lo — a busca nunca encontraria nada.
 */
export function findReproducibleRun(
  configHash: string,
  seriesHash: string,
): BacktestRunRecord | null {
  const row = db()
    .prepare(
      `SELECT * FROM t4_backtest_runs
       WHERE config_hash = ? AND series_hash = ? AND status = 'DONE'
       ORDER BY created_at ASC LIMIT 1`,
    )
    .get(configHash, seriesHash) as Record<string, unknown> | undefined;
  return row ? mapRun(row) : null;
}

// ───────────────────────────────────────────────────────── trades

export function saveTrades(runId: string, trades: T4Trade[]): void {
  const database = db();
  const statement = database.prepare(
    `INSERT OR REPLACE INTO t4_trades
     (trade_id, run_id, signal_id, strategy_version, config_hash, symbol, timeframe, direction,
      decided_at, entry_at, exit_at, confluence, outcome, result, result_r, risk_points,
      dataset, regime, session, payload_json)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  database.exec("BEGIN");
  try {
    for (const trade of trades) {
      statement.run(
        trade.tradeId,
        runId,
        trade.signalId,
        trade.strategyVersion,
        trade.configHash,
        trade.symbol,
        trade.timeframe,
        trade.direction,
        trade.decidedAt,
        trade.entryAt,
        trade.exitAt,
        trade.confluenceAtEntry,
        trade.outcome,
        trade.result,
        trade.resultR,
        trade.riskPoints,
        trade.dataset,
        trade.regime,
        trade.session,
        JSON.stringify(trade),
      );
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function listTrades(runId: string): T4Trade[] {
  const rows = db()
    .prepare("SELECT payload_json FROM t4_trades WHERE run_id = ? ORDER BY decided_at ASC")
    .all(runId) as Array<{ payload_json: string }>;
  return rows.map((row) => JSON.parse(row.payload_json) as T4Trade);
}

// ───────────────────────────────────────────── snapshots imutáveis

export class SnapshotImmutabilityError extends Error {
  constructor(signalId: string) {
    super(
      `O snapshot ${signalId} já existe e é IMUTÁVEL: reescrevê-lo destruiria a prova de que a decisão foi gravada antes do resultado.`,
    );
    this.name = "SnapshotImmutabilityError";
  }
}

export function saveForwardSnapshot(snapshot: ForwardSnapshot): void {
  const exists = db()
    .prepare("SELECT 1 FROM t4_trade_snapshots WHERE signal_id = ?")
    .get(snapshot.signalId);
  if (exists) throw new SnapshotImmutabilityError(snapshot.signalId);

  db()
    .prepare(
      `INSERT INTO t4_trade_snapshots
       (signal_id, strategy_version, config_hash, symbol, timeframe, chart_time, recorded_at,
        direction, price, confluence, candle_closed, time_sync, stop_price, target_price, payload_json)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      snapshot.signalId,
      snapshot.strategyVersion,
      snapshot.configHash,
      snapshot.symbol,
      snapshot.timeframe,
      snapshot.chartTime,
      snapshot.recordedAt,
      snapshot.direction,
      snapshot.price,
      snapshot.confluence,
      snapshot.candleClosed ? 1 : 0,
      snapshot.timeSync,
      snapshot.stopPrice,
      snapshot.targetPrice,
      JSON.stringify(snapshot),
    );
}

export function getForwardSnapshot(signalId: string): ForwardSnapshot | null {
  const row = db()
    .prepare("SELECT payload_json FROM t4_trade_snapshots WHERE signal_id = ?")
    .get(signalId) as { payload_json: string } | undefined;
  return row ? (JSON.parse(row.payload_json) as ForwardSnapshot) : null;
}

export function listForwardSnapshots(limit = 200): ForwardSnapshot[] {
  const rows = db()
    .prepare("SELECT payload_json FROM t4_trade_snapshots ORDER BY recorded_at DESC LIMIT ?")
    .all(Math.max(1, Math.min(1000, limit))) as Array<{ payload_json: string }>;
  return rows.map((row) => JSON.parse(row.payload_json) as ForwardSnapshot);
}

// ───────────────────────────────────────────────────────── métricas e resultados

export function saveMetrics(input: {
  runId: string;
  dataset: string;
  metrics: {
    trades: number;
    expectancy: number;
    profitFactor: number | null;
    payoff: number | null;
    winRate: number;
    totalR: number;
    maxDrawdownR: number;
  };
  computedAt?: number;
}): void {
  const m = input.metrics;
  db()
    .prepare(
      `INSERT OR REPLACE INTO t4_metrics
       (run_id, dataset, computed_at, trades, expectancy, profit_factor, payoff, win_rate,
        total_r, max_drawdown_r, metrics_json)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      input.runId,
      input.dataset,
      input.computedAt ?? Date.now(),
      m.trades,
      m.expectancy,
      m.profitFactor,
      m.payoff,
      m.winRate,
      m.totalR,
      m.maxDrawdownR,
      JSON.stringify(m),
    );
}

export function saveValidationResult(input: {
  resultId: string;
  runId: string | null;
  strategyVersion: string;
  configHash: string;
  status: ValidationStatus;
  robustness: number;
  report: RobustnessReport;
  computedAt?: number;
}): void {
  db()
    .prepare(
      `INSERT OR REPLACE INTO t4_validation_results
       (result_id, run_id, strategy_version, config_hash, computed_at, status, robustness, report_json)
       VALUES (?,?,?,?,?,?,?,?)`,
    )
    .run(
      input.resultId,
      input.runId,
      input.strategyVersion,
      input.configHash,
      input.computedAt ?? Date.now(),
      input.status,
      input.robustness,
      JSON.stringify(input.report),
    );
}

export function getValidationResultForRun(runId: string): RobustnessReport | null {
  const row = db()
    .prepare(
      "SELECT report_json FROM t4_validation_results WHERE run_id = ? ORDER BY computed_at DESC LIMIT 1",
    )
    .get(runId) as { report_json: string } | undefined;
  return row ? (JSON.parse(row.report_json) as RobustnessReport) : null;
}

export function saveSimulationRun(input: {
  simulationId: string;
  runId: string | null;
  kind: "BOOTSTRAP" | "MONTE_CARLO" | "WALK_FORWARD" | "ABLATION";
  seed: number;
  iterations: number;
  result: unknown;
  createdAt?: number;
}): void {
  db()
    .prepare(
      `INSERT OR REPLACE INTO t4_simulation_runs
       (simulation_id, run_id, kind, seed, iterations, created_at, result_json)
       VALUES (?,?,?,?,?,?,?)`,
    )
    .run(
      input.simulationId,
      input.runId,
      input.kind,
      input.seed,
      input.iterations,
      input.createdAt ?? Date.now(),
      JSON.stringify(input.result),
    );
}

export function listSimulationRuns(runId: string): Array<{
  simulationId: string;
  kind: string;
  seed: number;
  iterations: number;
  createdAt: number;
  result: unknown;
}> {
  const rows = db()
    .prepare("SELECT * FROM t4_simulation_runs WHERE run_id = ? ORDER BY created_at DESC")
    .all(runId) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    simulationId: row.simulation_id as string,
    kind: row.kind as string,
    seed: row.seed as number,
    iterations: row.iterations as number,
    createdAt: row.created_at as number,
    result: JSON.parse(row.result_json as string),
  }));
}

// ───────────────────────────────────────────────────────── forward sessions e auditoria

export function startForwardSession(input: {
  sessionId: string;
  strategyVersion: string;
  configHash: string;
  symbol: string;
  timeframe: string;
  startedAt?: number;
  notes?: string | null;
}): void {
  db()
    .prepare(
      `INSERT OR REPLACE INTO t4_forward_sessions
       (session_id, strategy_version, config_hash, symbol, timeframe, started_at, ended_at, snapshots, resolved, notes)
       VALUES (?,?,?,?,?,?,NULL,0,0,?)`,
    )
    .run(
      input.sessionId,
      input.strategyVersion,
      input.configHash,
      input.symbol,
      input.timeframe,
      input.startedAt ?? Date.now(),
      input.notes ?? null,
    );
}

export function recordAuditEvent(input: {
  eventId: string;
  actor: string;
  action: string;
  subject?: string | null;
  detail?: unknown;
  createdAt?: number;
}): void {
  db()
    .prepare(
      `INSERT OR REPLACE INTO t4_audit_events (event_id, created_at, actor, action, subject, detail_json)
       VALUES (?,?,?,?,?,?)`,
    )
    .run(
      input.eventId,
      input.createdAt ?? Date.now(),
      input.actor,
      input.action,
      input.subject ?? null,
      input.detail === undefined ? null : JSON.stringify(input.detail),
    );
}

export function listAuditEvents(limit = 100): Array<{
  eventId: string;
  createdAt: number;
  actor: string;
  action: string;
  subject: string | null;
  detail: unknown;
}> {
  const rows = db()
    .prepare("SELECT * FROM t4_audit_events ORDER BY created_at DESC LIMIT ?")
    .all(Math.max(1, Math.min(500, limit))) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    eventId: row.event_id as string,
    createdAt: row.created_at as number,
    actor: row.actor as string,
    action: row.action as string,
    subject: (row.subject as string | null) ?? null,
    detail: row.detail_json ? JSON.parse(row.detail_json as string) : null,
  }));
}

/** Usado apenas por testes que trocam o banco. */
export function resetValidationSchemaForTests(): void {
  migrated = false;
}
