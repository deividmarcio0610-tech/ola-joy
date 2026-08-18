import { markTradingUnauthorized, writeHeaders } from "@/lib/tradingSession";
import type { PrintAnalysis } from "./contract";

/**
 * CLIENTE DA ANÁLISE POR PRINT.
 *
 * Toda escrita leva o CSRF da sessão já provada; o cookie HttpOnly viaja
 * sozinho. Nenhuma chave de IA existe no navegador.
 */

export interface PrintAnalysisStatus {
  available: boolean;
  model: string | null;
  provider: string;
  timeoutMs: number;
  maxImageBytes: number;
  reason: string | null;
}

export interface PrintAnalysisResponse {
  id: string;
  createdAt: number;
  analysis: PrintAnalysis;
  model: string;
  repaired: boolean;
  corrections: string[];
  elapsedMs: number;
  persisted: boolean;
}

export interface PrintHistoryItem {
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
  feedback: { correct: boolean; reasons: string[]; comment: string | null } | null;
}

export interface PrintHistoryRecord extends PrintHistoryItem {
  model: string;
  repaired: boolean;
  imageDataUrl: string;
  imageWidth: number;
  imageHeight: number;
  analysis: PrintAnalysis;
  corrections: string[];
}

export class PrintAnalysisError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PrintAnalysisError";
  }
}

async function readError(response: Response): Promise<never> {
  if (response.status === 401 || response.status === 403) markTradingUnauthorized();
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  throw new PrintAnalysisError(payload.error ?? `HTTP ${response.status}`, response.status);
}

export async function fetchPrintAnalysisStatus(): Promise<PrintAnalysisStatus> {
  const response = await fetch("/api/print-analysis/status", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) await readError(response);
  return (await response.json()) as PrintAnalysisStatus;
}

export async function requestPrintAnalysis(input: {
  imageDataUrl: string;
  width: number;
  height: number;
  signal?: AbortSignal;
}): Promise<PrintAnalysisResponse> {
  const response = await fetch("/api/print-analysis/analyze", {
    method: "POST",
    credentials: "same-origin",
    signal: input.signal,
    headers: writeHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({
      imageDataUrl: input.imageDataUrl,
      width: input.width,
      height: input.height,
    }),
  });
  if (!response.ok) await readError(response);
  return (await response.json()) as PrintAnalysisResponse;
}

export async function askPrintQuestion(input: {
  analysisId: string;
  question: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  signal?: AbortSignal;
}): Promise<string> {
  const response = await fetch("/api/print-analysis/ask", {
    method: "POST",
    credentials: "same-origin",
    signal: input.signal,
    headers: writeHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({
      analysisId: input.analysisId,
      question: input.question,
      history: input.history,
    }),
  });
  if (!response.ok) await readError(response);
  const payload = (await response.json()) as { answer: string };
  return payload.answer;
}

export async function sendPrintFeedback(input: {
  analysisId: string;
  correct: boolean;
  reasons: string[];
  comment: string | null;
}): Promise<void> {
  const response = await fetch("/api/print-analysis/feedback", {
    method: "POST",
    credentials: "same-origin",
    headers: writeHeaders({ "content-type": "application/json" }),
    body: JSON.stringify(input),
  });
  if (!response.ok) await readError(response);
}

export async function fetchPrintHistory(limit = 50): Promise<PrintHistoryItem[]> {
  const response = await fetch(`/api/print-analysis/history?limit=${limit}`, {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) await readError(response);
  const payload = (await response.json()) as { analyses: PrintHistoryItem[] };
  return payload.analyses;
}

export async function fetchPrintAnalysisById(id: string): Promise<PrintHistoryRecord> {
  const response = await fetch(`/api/print-analysis/history/${encodeURIComponent(id)}`, {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) await readError(response);
  return (await response.json()) as PrintHistoryRecord;
}

export async function deletePrintAnalysisById(id: string): Promise<void> {
  const response = await fetch(`/api/print-analysis/history/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "same-origin",
    headers: writeHeaders(),
  });
  if (!response.ok) await readError(response);
}
