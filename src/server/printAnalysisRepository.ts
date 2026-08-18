import type { DatabaseSync } from "node:sqlite";

import type { PrintAnalysis } from "@/lib/printAnalysis/contract";
import { getDatabase } from "./tradingRepository";

/**
 * PERSISTÊNCIA DAS ANÁLISES POR PRINT.
 *
 * Migração ADITIVA no mesmo banco: nenhuma tabela existente é alterada ou
 * apagada. As imagens ficam no banco como dataURL porque o histórico só tem
 * valor se o print original puder ser reaberto exatamente como foi analisado.
 */

let migrated = false;

function db(): DatabaseSync {
  const database = getDatabase();
  if (!migrated) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS print_analyses (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        symbol TEXT,
        timeframe TEXT,
        status TEXT NOT NULL,
        direction TEXT NOT NULL,
        confidence REAL NOT NULL,
        entry REAL,
        stop REAL,
        target1 REAL,
        target2 REAL,
        model TEXT NOT NULL,
        repaired INTEGER NOT NULL DEFAULT 0,
        image_data_url TEXT NOT NULL,
        image_width INTEGER NOT NULL,
        image_height INTEGER NOT NULL,
        analysis_json TEXT NOT NULL,
        corrections_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_print_analyses_created ON print_analyses(created_at);

      CREATE TABLE IF NOT EXISTS print_analysis_feedback (
        analysis_id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        correct INTEGER NOT NULL,
        reasons_json TEXT NOT NULL,
        comment TEXT,
        FOREIGN KEY(analysis_id) REFERENCES print_analyses(id) ON DELETE CASCADE
      );
    `);
    migrated = true;
  }
  return database;
}

export interface PrintAnalysisRecord {
  id: string;
  createdAt: number;
  symbol: string | null;
  timeframe: string | null;
  status: string;
  direction: string;
  confidence: number;
  model: string;
  repaired: boolean;
  imageDataUrl: string;
  imageWidth: number;
  imageHeight: number;
  analysis: PrintAnalysis;
  corrections: string[];
  feedback: PrintFeedbackRecord | null;
}

export interface PrintFeedbackRecord {
  correct: boolean;
  reasons: string[];
  comment: string | null;
  createdAt: number;
}

export interface PrintAnalysisSummary {
  id: string;
  createdAt: number;
  symbol: string | null;
  timeframe: string | null;
  status: string;
  direction: string;
  confidence: number;
  entry: number | null;
  stop: number | null;
  target1: number | null;
  feedback: PrintFeedbackRecord | null;
}

export function savePrintAnalysis(input: {
  id: string;
  createdAt: number;
  analysis: PrintAnalysis;
  model: string;
  repaired: boolean;
  corrections: string[];
  imageDataUrl: string;
  imageWidth: number;
  imageHeight: number;
}): void {
  const { analysis } = input;
  db()
    .prepare(
      `INSERT OR REPLACE INTO print_analyses
       (id, created_at, symbol, timeframe, status, direction, confidence, entry, stop,
        target1, target2, model, repaired, image_data_url, image_width, image_height,
        analysis_json, corrections_json)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      input.id,
      input.createdAt,
      analysis.symbol,
      analysis.timeframe,
      analysis.status,
      analysis.direction,
      analysis.confidence,
      analysis.entry.value,
      analysis.stop.value,
      analysis.targets[0]?.value ?? null,
      analysis.targets[1]?.value ?? null,
      input.model,
      input.repaired ? 1 : 0,
      input.imageDataUrl,
      input.imageWidth,
      input.imageHeight,
      JSON.stringify(analysis),
      JSON.stringify(input.corrections),
    );
}

type FeedbackRow = {
  analysis_id: string;
  created_at: number;
  correct: number;
  reasons_json: string;
  comment: string | null;
};

function feedbackFor(id: string): PrintFeedbackRecord | null {
  const row = db()
    .prepare("SELECT * FROM print_analysis_feedback WHERE analysis_id = ?")
    .get(id) as FeedbackRow | undefined;
  if (!row) return null;
  return {
    correct: row.correct === 1,
    reasons: JSON.parse(row.reasons_json) as string[],
    comment: row.comment,
    createdAt: row.created_at,
  };
}

export function listPrintAnalyses(limit = 50): PrintAnalysisSummary[] {
  const rows = db()
    .prepare(
      `SELECT id, created_at, symbol, timeframe, status, direction, confidence, entry, stop, target1
       FROM print_analyses ORDER BY created_at DESC LIMIT ?`,
    )
    .all(Math.max(1, Math.min(200, limit))) as Array<{
    id: string;
    created_at: number;
    symbol: string | null;
    timeframe: string | null;
    status: string;
    direction: string;
    confidence: number;
    entry: number | null;
    stop: number | null;
    target1: number | null;
  }>;
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    symbol: row.symbol,
    timeframe: row.timeframe,
    status: row.status,
    direction: row.direction,
    confidence: row.confidence,
    entry: row.entry,
    stop: row.stop,
    target1: row.target1,
    feedback: feedbackFor(row.id),
  }));
}

export function getPrintAnalysis(id: string): PrintAnalysisRecord | null {
  const row = db().prepare("SELECT * FROM print_analyses WHERE id = ?").get(id) as
    | {
        id: string;
        created_at: number;
        symbol: string | null;
        timeframe: string | null;
        status: string;
        direction: string;
        confidence: number;
        model: string;
        repaired: number;
        image_data_url: string;
        image_width: number;
        image_height: number;
        analysis_json: string;
        corrections_json: string;
      }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    createdAt: row.created_at,
    symbol: row.symbol,
    timeframe: row.timeframe,
    status: row.status,
    direction: row.direction,
    confidence: row.confidence,
    model: row.model,
    repaired: row.repaired === 1,
    imageDataUrl: row.image_data_url,
    imageWidth: row.image_width,
    imageHeight: row.image_height,
    analysis: JSON.parse(row.analysis_json) as PrintAnalysis,
    corrections: JSON.parse(row.corrections_json) as string[],
    feedback: feedbackFor(row.id),
  };
}

export function deletePrintAnalysis(id: string): boolean {
  const result = db().prepare("DELETE FROM print_analyses WHERE id = ?").run(id);
  return Number(result.changes) > 0;
}

export function savePrintFeedback(input: {
  analysisId: string;
  correct: boolean;
  reasons: string[];
  comment: string | null;
  createdAt: number;
}): boolean {
  const exists = db().prepare("SELECT 1 FROM print_analyses WHERE id = ?").get(input.analysisId);
  if (!exists) return false;
  db()
    .prepare(
      `INSERT OR REPLACE INTO print_analysis_feedback
       (analysis_id, created_at, correct, reasons_json, comment) VALUES (?,?,?,?,?)`,
    )
    .run(
      input.analysisId,
      input.createdAt,
      input.correct ? 1 : 0,
      JSON.stringify(input.reasons),
      input.comment,
    );
  return true;
}

/** Usado apenas por testes que trocam o banco em memória. */
export function resetPrintAnalysisMigrationForTests(): void {
  migrated = false;
}
