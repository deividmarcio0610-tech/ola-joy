import type { Candle } from "@/lib/engines/types";
import { DEFAULT_BACKTEST_CONFIG, type BacktestConfig } from "@/lib/t4/backtest/runner";
import { T4_CONFIG_HASH, T4_CORE_CONFIG, T4_CORE_VERSION } from "@/lib/t4/core/t4CoreEngine";
import { splitDatasets } from "@/lib/t4/validation/datasets";
import {
  criteriaContribution,
  ablationTest,
  degradationReport,
} from "@/lib/t4/validation/contribution";
import { computeRobustness } from "@/lib/t4/validation/robustness";
import { segmentAll } from "@/lib/t4/validation/segmentation";
import { analyzeThreshold } from "@/lib/t4/validation/threshold";
import { ZERO_COSTS } from "@/lib/t4/validation/types";
import { jobProgress, listJobs, requestCancel, startBacktest } from "./backtestJobs";
import {
  ensureValidationSchema,
  getBacktestRun,
  listBacktestRuns,
  listForwardSnapshots,
  listSimulationRuns,
  listStrategyVersions,
  listTrades,
  saveForwardSnapshot,
  SnapshotImmutabilityError,
} from "./validationRepository";
import { authorizeRead, authorizeWrite } from "./tradingAuth";

/**
 * SUPERFÍCIE HTTP DA VALIDAÇÃO ESTATÍSTICA.
 *
 * O backtest pesado NÃO roda dentro da requisição: `POST /runs` enfileira e
 * devolve o `runId` imediatamente; a UI acompanha por `GET /runs/:id/progress`
 * e pode abortar com `POST /runs/:id/cancel`.
 *
 * Mesma porteira do resto do analisador: leitura e escrita exigem a sessão de
 * operador quando há token configurado.
 */

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function parseCandles(raw: unknown): Candle[] | string {
  if (!Array.isArray(raw)) return "Envie `candles` como lista.";
  if (raw.length < 30) return "São necessários ao menos 30 candles para qualquer varredura.";
  if (raw.length > 500_000) return "Série acima de 500.000 candles.";
  const out: Candle[] = [];
  for (const item of raw) {
    const candle = item as Partial<Candle>;
    if (
      typeof candle.t !== "number" ||
      typeof candle.o !== "number" ||
      typeof candle.h !== "number" ||
      typeof candle.l !== "number" ||
      typeof candle.c !== "number" ||
      !Number.isFinite(candle.t)
    ) {
      return "Candle inválido: t/o/h/l/c precisam ser números finitos.";
    }
    out.push({ t: candle.t, o: candle.o, h: candle.h, l: candle.l, c: candle.c, v: candle.v ?? 0 });
  }
  return out;
}

function buildConfig(raw: unknown): BacktestConfig {
  const input = (raw ?? {}) as Partial<BacktestConfig> & { costs?: Partial<typeof ZERO_COSTS> };
  return {
    ...DEFAULT_BACKTEST_CONFIG,
    ...input,
    costs: { ...ZERO_COSTS, ...(input.costs ?? {}) },
  };
}

export async function handleValidationRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (!path.startsWith("/api/validation")) return null;

  try {
    ensureValidationSchema();

    if (request.method === "GET") {
      const denied = authorizeRead(request);
      if (denied) return json({ error: denied.error }, denied.status);
    } else if (request.method === "POST") {
      const denied = authorizeWrite(request);
      if (denied) return json({ error: denied.error }, denied.status);
    } else {
      return json({ error: "Método não suportado." }, 405);
    }

    // ── versão e configuração congelada
    if (path === "/api/validation/strategy" && request.method === "GET") {
      return json({
        version: T4_CORE_VERSION,
        configHash: T4_CONFIG_HASH,
        config: T4_CORE_CONFIG,
        registered: listStrategyVersions(),
      });
    }

    // ── enfileirar backtest
    if (path === "/api/validation/runs" && request.method === "POST") {
      const body = (await request.json()) as { candles?: unknown; config?: unknown };
      const candles = parseCandles(body.candles);
      if (typeof candles === "string") return json({ error: candles }, 400);
      const result = startBacktest({ candles, config: buildConfig(body.config) });
      return json(
        {
          runId: result.runId,
          reused: result.reused,
          // Reaproveitar é uma AFIRMAÇÃO de reprodutibilidade, não um atalho:
          // mesma configuração e mesmo dataset já produziram este resultado.
          note: result.reused
            ? "Mesma configuração e mesmo dataset já haviam sido processados: resultado reaproveitado."
            : "Backtest enfileirado. Acompanhe o progresso em /api/validation/runs/{runId}/progress.",
        },
        result.reused ? 200 : 202,
      );
    }

    if (path === "/api/validation/runs" && request.method === "GET") {
      return json({ runs: listBacktestRuns(50), jobs: listJobs() });
    }

    // ── progresso e cancelamento
    const progressMatch = /^\/api\/validation\/runs\/([^/]+)\/progress$/.exec(path);
    if (progressMatch && request.method === "GET") {
      const runId = decodeURIComponent(progressMatch[1]!);
      const live = jobProgress(runId);
      const stored = getBacktestRun(runId);
      if (!live && !stored) return json({ error: "Run não encontrado." }, 404);
      return json({ live, run: stored });
    }

    const cancelMatch = /^\/api\/validation\/runs\/([^/]+)\/cancel$/.exec(path);
    if (cancelMatch && request.method === "POST") {
      const runId = decodeURIComponent(cancelMatch[1]!);
      const cancelled = requestCancel(runId);
      return cancelled
        ? json({ ok: true, note: "Cancelamento solicitado; o job para no próximo bloco." })
        : json({ error: "Run não está em execução." }, 409);
    }

    // ── relatório completo de um run
    const reportMatch = /^\/api\/validation\/runs\/([^/]+)$/.exec(path);
    if (reportMatch && request.method === "GET") {
      const runId = decodeURIComponent(reportMatch[1]!);
      const run = getBacktestRun(runId);
      if (!run) return json({ error: "Run não encontrado." }, 404);
      const trades = listTrades(runId);
      const split = splitDatasets(trades);
      const all = [...split.train, ...split.outOfSample, ...split.forward];

      return json({
        run,
        robustness: computeRobustness(split),
        segmentation: segmentAll(all),
        threshold: analyzeThreshold(all),
        contribution: criteriaContribution(all),
        ablation: ablationTest(all, run.confluenceThreshold),
        degradation: degradationReport(all),
        simulations: listSimulationRuns(runId),
        tradeCount: trades.length,
      });
    }

    // ── trades de um run (para o replay e a tabela)
    const tradesMatch = /^\/api\/validation\/runs\/([^/]+)\/trades$/.exec(path);
    if (tradesMatch && request.method === "GET") {
      const runId = decodeURIComponent(tradesMatch[1]!);
      if (!getBacktestRun(runId)) return json({ error: "Run não encontrado." }, 404);
      return json({ trades: listTrades(runId) });
    }

    // ── snapshots forward (imutáveis)
    if (path === "/api/validation/forward-snapshots" && request.method === "GET") {
      return json({ snapshots: listForwardSnapshots(200) });
    }

    if (path === "/api/validation/forward-snapshots" && request.method === "POST") {
      const body = (await request.json()) as Record<string, unknown>;
      try {
        saveForwardSnapshot(body as never);
        return json({ ok: true }, 201);
      } catch (error) {
        if (error instanceof SnapshotImmutabilityError) {
          return json({ error: error.message }, 409);
        }
        throw error;
      }
    }

    return json({ error: "Endpoint não encontrado." }, 404);
  } catch (error) {
    console.error("Erro na validação estatística:", error);
    return json(
      { error: error instanceof Error ? error.message : "Falha inesperada na validação." },
      500,
    );
  }
}
