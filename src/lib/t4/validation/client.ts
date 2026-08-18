import { writeHeaders } from "@/lib/tradingSession";
import type { Candle } from "@/lib/engines/types";
import type { BacktestConfig } from "@/lib/t4/backtest/runner";
import type { T4Trade } from "./types";
import type { RobustnessReport } from "./robustness";
import type { FullSegmentation } from "./segmentation";
import type { ThresholdAnalysis } from "./threshold";
import type { AblationResult, CriterionContribution, DegradationReport } from "./contribution";

/** Cliente da API de validação estatística. Nenhum segredo vive no navegador. */

export interface RunRecord {
  runId: string;
  strategyVersion: string;
  configHash: string;
  datasetHash: string;
  seriesHash: string;
  symbol: string;
  timeframe: string;
  periodFrom: number | null;
  periodTo: number | null;
  slippagePoints: number;
  confluenceThreshold: number;
  status: "QUEUED" | "RUNNING" | "DONE" | "CANCELLED" | "ERROR";
  progress: number;
  scannedCandles: number;
  opportunities: number;
  executed: number;
  error: string | null;
  createdAt: number;
  finishedAt: number | null;
}

export interface JobProgressView {
  runId: string;
  status: RunRecord["status"];
  progress: number;
  processed: number;
  total: number;
  opportunities: number;
  executed: number;
  error: string | null;
  finishedAt: number | null;
}

export interface ValidationReport {
  run: RunRecord;
  robustness: RobustnessReport;
  segmentation: FullSegmentation;
  threshold: ThresholdAnalysis;
  contribution: CriterionContribution[];
  ablation: AblationResult[];
  degradation: DegradationReport;
  simulations: Array<{
    simulationId: string;
    kind: string;
    seed: number;
    iterations: number;
    result: unknown;
  }>;
  tradeCount: number;
}

async function readError(response: Response): Promise<never> {
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  throw new Error(payload.error ?? `HTTP ${response.status}`);
}

export async function startValidationRun(input: {
  candles: Candle[];
  config?: Partial<BacktestConfig>;
}): Promise<{ runId: string; reused: boolean; note: string }> {
  const response = await fetch("/api/validation/runs", {
    method: "POST",
    credentials: "same-origin",
    headers: writeHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ candles: input.candles, config: input.config ?? {} }),
  });
  if (!response.ok) await readError(response);
  return (await response.json()) as { runId: string; reused: boolean; note: string };
}

export async function fetchRuns(): Promise<{ runs: RunRecord[]; jobs: JobProgressView[] }> {
  const response = await fetch("/api/validation/runs", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) await readError(response);
  return (await response.json()) as { runs: RunRecord[]; jobs: JobProgressView[] };
}

export async function fetchRunProgress(
  runId: string,
): Promise<{ live: JobProgressView | null; run: RunRecord | null }> {
  const response = await fetch(`/api/validation/runs/${encodeURIComponent(runId)}/progress`, {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) await readError(response);
  return (await response.json()) as { live: JobProgressView | null; run: RunRecord | null };
}

export async function cancelRun(runId: string): Promise<void> {
  const response = await fetch(`/api/validation/runs/${encodeURIComponent(runId)}/cancel`, {
    method: "POST",
    credentials: "same-origin",
    headers: writeHeaders(),
  });
  if (!response.ok) await readError(response);
}

export async function fetchValidationReport(runId: string): Promise<ValidationReport> {
  const response = await fetch(`/api/validation/runs/${encodeURIComponent(runId)}`, {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) await readError(response);
  return (await response.json()) as ValidationReport;
}

export async function fetchRunTrades(runId: string): Promise<T4Trade[]> {
  const response = await fetch(`/api/validation/runs/${encodeURIComponent(runId)}/trades`, {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) await readError(response);
  return ((await response.json()) as { trades: T4Trade[] }).trades;
}
