import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { BacktestTrade } from "@/lib/engines/backtestEngine";
import { STRATEGY_VERSION, T4_PROFILE } from "@/lib/engines/strategy";
import { learnFromDay, type DailyLearningReport } from "@/lib/engines/dailyLearning";
import type {
  BacktestRecord,
  LiveSessionRecord,
  MarketEventRecord,
  ReplayRecordingRecord,
  SegmentRecord,
  TechniqueCandidateRecord,
  TechniqueRecord,
  TradingSessionRecord,
} from "@/lib/storage";

const SCHEMA_VERSION = 4;

function dataDir(): string {
  return resolve(process.env["DATA_DIR"]?.trim() || "./data");
}

function dbPath(): string {
  return process.env["DATABASE_PATH"]?.trim() || join(dataDir(), "analisador.sqlite");
}

let singleton: DatabaseSync | null = null;

function db(): DatabaseSync {
  if (singleton) return singleton;
  mkdirSync(dataDir(), { recursive: true });
  singleton = new DatabaseSync(dbPath());
  singleton.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
  migrate(singleton);
  return singleton;
}

function migrate(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS live_sessions (
      id TEXT PRIMARY KEY,
      asset TEXT NOT NULL,
      strategy_version TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      status TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trading_sessions (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      symbol TEXT NOT NULL,
      trading_date TEXT,
      timeframe TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      technique_version TEXT,
      segment_count INTEGER NOT NULL DEFAULT 0,
      event_count INTEGER NOT NULL DEFAULT 0,
      trade_count INTEGER NOT NULL DEFAULT 0,
      payload_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS segments (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      reason TEXT,
      trading_date TEXT,
      payload_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(session_id) REFERENCES trading_sessions(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS market_events (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      segment_id TEXT,
      timestamp INTEGER NOT NULL,
      market_time TEXT,
      type TEXT NOT NULL,
      direction TEXT,
      price REAL,
      source TEXT,
      model_version TEXT,
      technique_version TEXT,
      payload_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(session_id) REFERENCES trading_sessions(id) ON DELETE SET NULL,
      FOREIGN KEY(segment_id) REFERENCES segments(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS backtest_runs (
      id TEXT PRIMARY KEY,
      strategy_version TEXT NOT NULL,
      asset TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      source_capture_id TEXT NOT NULL,
      origin TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trades (
      id TEXT PRIMARY KEY,
      backtest_id TEXT,
      session_id TEXT,
      segment_id TEXT,
      origin TEXT NOT NULL,
      symbol TEXT NOT NULL,
      trading_date TEXT,
      timeframe TEXT NOT NULL,
      direction TEXT NOT NULL,
      setup TEXT NOT NULL,
      strategy_version TEXT NOT NULL,
      opened_at INTEGER NOT NULL,
      closed_at INTEGER NOT NULL,
      result_r REAL NOT NULL,
      payload_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(backtest_id) REFERENCES backtest_runs(id) ON DELETE CASCADE,
      FOREIGN KEY(session_id) REFERENCES trading_sessions(id) ON DELETE SET NULL,
      FOREIGN KEY(segment_id) REFERENCES segments(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_trades_strategy_setup ON trades(strategy_version, setup);
    CREATE INDEX IF NOT EXISTS idx_trades_date ON trades(trading_date, opened_at);
    CREATE INDEX IF NOT EXISTS idx_events_session_time ON market_events(session_id, timestamp);

    CREATE TABLE IF NOT EXISTS replay_sessions (
      session_id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      strategy_version TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS techniques (
      version TEXT PRIMARY KEY,
      status TEXT NOT NULL CHECK(status IN ('PRODUCTION','ARCHIVED')),
      rules_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      promoted_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS technique_candidates (
      id TEXT PRIMARY KEY,
      version TEXT NOT NULL,
      base_version TEXT NOT NULL,
      hypothesis TEXT NOT NULL,
      status TEXT NOT NULL,
      rules_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS validation_results (
      id TEXT PRIMARY KEY,
      candidate_id TEXT,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      metrics_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(candidate_id) REFERENCES technique_candidates(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS daily_learning_reports (
      id TEXT PRIMARY KEY,
      trading_date TEXT NOT NULL,
      base_version TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_daily_learning_date ON daily_learning_reports(trading_date, created_at);

    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recording_sessions (
      session_id TEXT PRIMARY KEY,
      live_session_id TEXT,
      asset TEXT,
      mime_type TEXT,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      status TEXT NOT NULL,
      segment INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      recorder_state TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recording_chunks (
      session_id TEXT NOT NULL,
      idx INTEGER NOT NULL,
      segment INTEGER NOT NULL DEFAULT 0,
      started_at INTEGER NOT NULL,
      ended_at INTEGER NOT NULL,
      mime_type TEXT,
      size INTEGER NOT NULL,
      status TEXT NOT NULL,
      file_path TEXT,
      created_at INTEGER NOT NULL,
      PRIMARY KEY(session_id, idx),
      FOREIGN KEY(session_id) REFERENCES recording_sessions(session_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS recording_events (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      real_timestamp INTEGER NOT NULL,
      chart_timestamp INTEGER,
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(session_id) REFERENCES recording_sessions(session_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_recording_events_session ON recording_events(session_id, real_timestamp);

    CREATE TABLE IF NOT EXISTS error_events (
      id TEXT PRIMARY KEY,
      group_key TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      severity TEXT NOT NULL,
      source TEXT NOT NULL,
      route TEXT,
      message TEXT NOT NULL,
      stack TEXT,
      context_json TEXT,
      session_id TEXT,
      signal_id TEXT,
      resolved INTEGER NOT NULL DEFAULT 0,
      occurrences INTEGER NOT NULL DEFAULT 1,
      first_seen INTEGER NOT NULL,
      last_seen INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_error_events_group ON error_events(group_key);
    CREATE INDEX IF NOT EXISTS idx_error_events_seen ON error_events(last_seen);

    CREATE TABLE IF NOT EXISTS admin_changes (
      change_id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL,
      files_json TEXT NOT NULL,
      tests_json TEXT,
      updated_at INTEGER NOT NULL
    );
  `);
  migrateTradeAuditColumns(database);
  database
    .prepare("INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (?, ?)")
    .run(SCHEMA_VERSION, Date.now());
  const now = Date.now();
  const current = database
    .prepare(
      "SELECT version FROM techniques WHERE status='PRODUCTION' ORDER BY promoted_at DESC, created_at DESC LIMIT 1",
    )
    .get() as { version: string } | undefined;
  if (current?.version !== STRATEGY_VERSION) {
    database.exec("BEGIN IMMEDIATE");
    try {
      database.prepare("UPDATE techniques SET status='ARCHIVED' WHERE status='PRODUCTION'").run();
      database
        .prepare(
          `
        INSERT INTO techniques(version, status, rules_json, created_at, promoted_at)
        VALUES (?, 'PRODUCTION', ?, ?, ?)
        ON CONFLICT(version) DO UPDATE SET status='PRODUCTION', rules_json=excluded.rules_json, promoted_at=excluded.promoted_at
      `,
        )
        .run(STRATEGY_VERSION, JSON.stringify(T4_PROFILE), now, now);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  } else {
    database
      .prepare("UPDATE techniques SET rules_json=? WHERE version=?")
      .run(JSON.stringify(T4_PROFILE), STRATEGY_VERSION);
  }
}

function migrateTradeAuditColumns(database: DatabaseSync): void {
  const existing = new Set(
    (database.prepare("PRAGMA table_info(trades)").all() as Array<{ name: string }>).map(
      (column) => column.name,
    ),
  );
  const additions: Array<[string, string]> = [
    ["entry", "REAL"],
    ["stop", "REAL"],
    ["partial", "REAL"],
    ["target", "REAL"],
    ["entry_hit_at", "INTEGER"],
    ["partial_hit_at", "INTEGER"],
    ["exit_at", "INTEGER"],
    ["exit_reason", "TEXT"],
    ["mfe", "REAL"],
    ["mae", "REAL"],
    ["ambiguous_intrabar", "INTEGER NOT NULL DEFAULT 0"],
  ];
  for (const [name, type] of additions) {
    if (!existing.has(name)) database.exec(`ALTER TABLE trades ADD COLUMN ${name} ${type}`);
  }
}

function parse<T>(raw: unknown): T {
  return JSON.parse(String(raw)) as T;
}

function payloadRows<T>(sql: string): T[] {
  return db()
    .prepare(sql)
    .all()
    .map((row) => parse<T>((row as { payload_json: string }).payload_json));
}

export interface PersistentSnapshot {
  liveSessions: LiveSessionRecord[];
  tradingSessions: TradingSessionRecord[];
  backtests: BacktestRecord[];
  replaySessions: ReplayRecordingRecord[];
  lastDecision: unknown | null;
  productionTechnique: TechniqueRecord | null;
  techniqueCandidates: TechniqueCandidateRecord[];
  dailyLearningReports: DailyLearningReport[];
}

export function getSnapshot(): PersistentSnapshot {
  const database = db();
  const decision = database
    .prepare("SELECT payload_json FROM app_state WHERE key='last_decision'")
    .get() as { payload_json: string } | undefined;
  return {
    liveSessions: payloadRows<LiveSessionRecord>(
      "SELECT payload_json FROM live_sessions ORDER BY started_at ASC LIMIT 500",
    ),
    tradingSessions: payloadRows<TradingSessionRecord>(
      "SELECT payload_json FROM trading_sessions ORDER BY started_at ASC LIMIT 2000",
    ),
    backtests: payloadRows<BacktestRecord>(
      "SELECT payload_json FROM backtest_runs ORDER BY created_at ASC LIMIT 1000",
    ),
    replaySessions: payloadRows<ReplayRecordingRecord>(
      "SELECT payload_json FROM replay_sessions ORDER BY created_at ASC LIMIT 1000",
    ),
    lastDecision: decision ? parse(decision.payload_json) : null,
    productionTechnique: getProductionTechnique(),
    techniqueCandidates: listTechniqueCandidates(),
    dailyLearningReports: listDailyLearningReports(),
  };
}

export function upsertLiveSession(record: LiveSessionRecord): void {
  db()
    .prepare(
      `
    INSERT INTO live_sessions(id, asset, strategy_version, started_at, ended_at, status, payload_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      asset=excluded.asset, strategy_version=excluded.strategy_version, started_at=excluded.started_at,
      ended_at=excluded.ended_at, status=excluded.status, payload_json=excluded.payload_json,
      updated_at=excluded.updated_at
  `,
    )
    .run(
      record.id,
      record.asset,
      record.strategyVersion,
      record.startedAt,
      record.endedAt,
      record.status,
      JSON.stringify(record),
      Date.now(),
    );
}

export function upsertTradingSession(record: TradingSessionRecord): void {
  db()
    .prepare(
      `
    INSERT INTO trading_sessions(
      id, source, symbol, trading_date, timeframe, started_at, ended_at, technique_version,
      segment_count, event_count, trade_count, payload_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      source=excluded.source, symbol=excluded.symbol, trading_date=excluded.trading_date,
      timeframe=excluded.timeframe, started_at=excluded.started_at, ended_at=excluded.ended_at,
      technique_version=excluded.technique_version, segment_count=excluded.segment_count,
      event_count=excluded.event_count, trade_count=excluded.trade_count,
      payload_json=excluded.payload_json, updated_at=excluded.updated_at
  `,
    )
    .run(
      record.id,
      record.source,
      record.symbol,
      record.tradingDate,
      record.timeframe,
      record.startedAt,
      record.endedAt,
      record.techniqueVersion ?? null,
      record.segmentCount,
      record.eventCount,
      record.tradeCount,
      JSON.stringify(record),
      record.createdAt,
      Date.now(),
    );
}

export function upsertSegment(record: SegmentRecord): void {
  db()
    .prepare(
      `
    INSERT INTO segments(id, session_id, started_at, ended_at, reason, trading_date, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      session_id=excluded.session_id, started_at=excluded.started_at, ended_at=excluded.ended_at,
      reason=excluded.reason, trading_date=excluded.trading_date, payload_json=excluded.payload_json
  `,
    )
    .run(
      record.id,
      record.sessionId,
      record.startedAt,
      record.endedAt,
      record.reason,
      record.tradingDate,
      JSON.stringify(record),
      record.createdAt,
    );
}

export function upsertReplaySession(record: ReplayRecordingRecord): void {
  db()
    .prepare(
      `
    INSERT INTO replay_sessions(session_id, created_at, symbol, timeframe, strategy_version, payload_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET payload_json=excluded.payload_json, updated_at=excluded.updated_at
  `,
    )
    .run(
      record.sessionId,
      record.createdAt,
      record.symbol,
      record.timeframe,
      record.strategyVersion,
      JSON.stringify(record),
      Date.now(),
    );
}

export function upsertBacktest(record: BacktestRecord): void {
  const database = db();
  database.exec("BEGIN IMMEDIATE");
  try {
    database
      .prepare(
        `
      INSERT INTO backtest_runs(id, strategy_version, asset, timeframe, source_capture_id, origin, created_at, payload_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        strategy_version=excluded.strategy_version, asset=excluded.asset, timeframe=excluded.timeframe,
        source_capture_id=excluded.source_capture_id, origin=excluded.origin,
        payload_json=excluded.payload_json, updated_at=excluded.updated_at
    `,
      )
      .run(
        record.id,
        record.strategyVersion,
        record.asset,
        record.timeframe,
        record.sourceCaptureId,
        record.origin,
        record.createdAt,
        JSON.stringify(record),
        Date.now(),
      );
    database.prepare("DELETE FROM trades WHERE backtest_id=?").run(record.id);
    const insert = database.prepare(`
      INSERT INTO trades(
        id, backtest_id, session_id, segment_id, origin, symbol, trading_date, timeframe,
        direction, setup, strategy_version, opened_at, closed_at, result_r,
        entry, stop, partial, target, entry_hit_at, partial_hit_at, exit_at, exit_reason, mfe, mae,
        ambiguous_intrabar, payload_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const trade of record.trades) {
      insert.run(
        trade.id,
        record.id,
        trade.tradingSessionId ?? null,
        trade.segmentId ?? null,
        trade.origin,
        trade.asset,
        trade.tradingDate ?? null,
        trade.timeframe,
        trade.direction,
        trade.setup,
        trade.strategyVersion,
        trade.openedAt,
        trade.closedAt,
        trade.rMultiple,
        trade.entry,
        trade.stop,
        trade.target1,
        trade.target2,
        trade.entryHitAt ?? null,
        trade.partialHitAt ?? null,
        trade.exitAt ?? trade.closedAt,
        trade.exitReason ?? null,
        trade.mfePoints,
        trade.maePoints,
        trade.ambiguousIntrabar ? 1 : 0,
        JSON.stringify(trade),
        Date.now(),
      );
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function saveLastDecision(value: unknown): void {
  db()
    .prepare(
      `
    INSERT INTO app_state(key, payload_json, updated_at) VALUES ('last_decision', ?, ?)
    ON CONFLICT(key) DO UPDATE SET payload_json=excluded.payload_json, updated_at=excluded.updated_at
  `,
    )
    .run(JSON.stringify(value), Date.now());
}

export function upsertMarketEvent(event: MarketEventRecord): void {
  const eventId = event.id ?? event.eventId;
  if (!eventId) throw new Error("Evento sem identificador persistente.");
  db()
    .prepare(
      `
    INSERT INTO market_events(
      id, session_id, segment_id, timestamp, market_time, type, direction, price,
      source, model_version, technique_version, payload_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET payload_json=excluded.payload_json
  `,
    )
    .run(
      eventId,
      event.sessionId ?? null,
      event.segmentId ?? null,
      event.timestamp,
      event.marketTime ?? null,
      event.type,
      event.direction ?? null,
      event.price ?? null,
      event.source ?? null,
      event.modelVersion ?? null,
      event.techniqueVersion ?? null,
      JSON.stringify(event),
      Date.now(),
    );
}

export function getProductionTechnique(): TechniqueRecord | null {
  const row = db()
    .prepare(
      "SELECT version, status, rules_json, created_at, promoted_at FROM techniques WHERE status='PRODUCTION' ORDER BY promoted_at DESC, created_at DESC LIMIT 1",
    )
    .get() as
    | {
        version: string;
        status: "PRODUCTION";
        rules_json: string;
        created_at: number;
        promoted_at: number | null;
      }
    | undefined;
  if (!row) return null;
  return {
    version: row.version,
    status: row.status,
    rules: parse<Record<string, unknown>>(row.rules_json),
    createdAt: row.created_at,
    promotedAt: row.promoted_at,
  };
}

export function listTechniqueCandidates(): TechniqueCandidateRecord[] {
  const rows = db()
    .prepare(
      "SELECT id, version, base_version, hypothesis, status, rules_json, created_at, updated_at FROM technique_candidates ORDER BY created_at DESC LIMIT 500",
    )
    .all() as Array<{
    id: string;
    version: string;
    base_version: string;
    hypothesis: string;
    status: TechniqueCandidateRecord["status"];
    rules_json: string;
    created_at: number;
    updated_at: number;
  }>;
  return rows.map((row) => ({
    id: row.id,
    version: row.version,
    baseVersion: row.base_version,
    hypothesis: row.hypothesis,
    status: row.status,
    rules: parse<Record<string, unknown>>(row.rules_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function upsertTechniqueCandidate(record: TechniqueCandidateRecord): void {
  db()
    .prepare(
      `
    INSERT INTO technique_candidates(id, version, base_version, hypothesis, status, rules_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      version=excluded.version, base_version=excluded.base_version, hypothesis=excluded.hypothesis,
      status=excluded.status, rules_json=excluded.rules_json, updated_at=excluded.updated_at
  `,
    )
    .run(
      record.id,
      record.version,
      record.baseVersion,
      record.hypothesis,
      record.status,
      JSON.stringify(record.rules),
      record.createdAt,
      record.updatedAt,
    );
}

export function promoteTechniqueCandidate(candidateId: string): TechniqueRecord {
  const database = db();
  const candidate = database
    .prepare(
      "SELECT id, version, status, rules_json, created_at FROM technique_candidates WHERE id=?",
    )
    .get(candidateId) as
    | {
        id: string;
        version: string;
        status: TechniqueCandidateRecord["status"];
        rules_json: string;
        created_at: number;
      }
    | undefined;
  if (!candidate) throw new Error("Técnica candidata não encontrada.");
  if (candidate.status !== "VALIDATED") {
    throw new Error("Somente uma candidata VALIDATED pode ser promovida.");
  }
  const now = Date.now();
  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare("UPDATE techniques SET status='ARCHIVED' WHERE status='PRODUCTION'").run();
    database
      .prepare(
        `
      INSERT INTO techniques(version, status, rules_json, created_at, promoted_at)
      VALUES (?, 'PRODUCTION', ?, ?, ?)
      ON CONFLICT(version) DO UPDATE SET status='PRODUCTION', rules_json=excluded.rules_json, promoted_at=excluded.promoted_at
    `,
      )
      .run(candidate.version, candidate.rules_json, candidate.created_at, now);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return getProductionTechnique()!;
}

export function listDailyLearningReports(): DailyLearningReport[] {
  return payloadRows<DailyLearningReport>(
    "SELECT payload_json FROM daily_learning_reports ORDER BY created_at DESC LIMIT 500",
  );
}

export function runDailyLearning(
  tradingDate: string,
  baseVersion = STRATEGY_VERSION,
): DailyLearningReport {
  if (!tradingDate?.trim()) throw new Error("tradingDate é obrigatório para o aprendizado diário.");
  const records = payloadRows<BacktestRecord>(
    "SELECT payload_json FROM backtest_runs ORDER BY created_at ASC LIMIT 2000",
  );
  const trades = records.flatMap((record) => record.trades ?? []);
  const { report, candidate } = learnFromDay({ tradingDate, baseVersion, trades });
  if (candidate) upsertTechniqueCandidate(candidate);
  db()
    .prepare(
      `
    INSERT INTO daily_learning_reports(id, trading_date, base_version, payload_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET payload_json=excluded.payload_json, updated_at=excluded.updated_at
  `,
    )
    .run(
      report.id,
      report.tradingDate,
      report.baseVersion,
      JSON.stringify(report),
      report.createdAt,
      Date.now(),
    );
  return report;
}

export function saveReplayBatch(input: {
  tradingSessions: TradingSessionRecord[];
  segments: SegmentRecord[];
  marketEvents: MarketEventRecord[];
  backtest: BacktestRecord | null;
  replaySession: ReplayRecordingRecord;
}): void {
  // TRANSAÇÃO ÚNICA: ou o lote inteiro entra (pregões → trechos →
  // trades/backtest → resumo da gravação), ou nada entra. Uma falha no meio
  // não pode deixar estado parcial referenciando registros ausentes.
  const database = db();
  database.exec("BEGIN IMMEDIATE");
  try {
    for (const record of input.tradingSessions) upsertTradingSession(record);
    for (const record of input.segments) upsertSegment(record);
    for (const event of input.marketEvents) upsertMarketEvent(event);
    if (input.backtest) upsertBacktest(input.backtest);
    upsertReplaySession(input.replaySession);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

/** Handle compartilhado do banco para os repositórios auxiliares. */
export function getDatabase(): DatabaseSync {
  return db();
}

/** Diretório oficial de dados (gravações, backups do admin, sqlite). */
export function getDataDir(): string {
  return dataDir();
}

export function databaseInfo(): { path: string; schemaVersion: number } {
  db();
  return { path: dbPath(), schemaVersion: SCHEMA_VERSION };
}

// Type-only assertion keeps the persisted trade shape coupled to the domain.
const _tradeShapeCheck: BacktestTrade | null = null;
void _tradeShapeCheck;

/** Fecha o SQLite singleton para testes/reabertura controlada. */
export function resetTradingRepositoryForTests(): void {
  singleton?.close();
  singleton = null;
}
