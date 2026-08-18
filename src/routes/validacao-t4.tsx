import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ban, Play, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  AblationTable,
  ContributionTable,
  DegradationPanel,
  SegmentTable,
  ThresholdPanel,
} from "@/components/validation/SegmentationTables";
import {
  DrawdownCurve,
  EquityCurve,
  MfeMaePanel,
  RDistribution,
} from "@/components/validation/ValidationCurves";
import { SplitComparison, ValidationSummary } from "@/components/validation/ValidationSummary";
import { TradeReplay } from "@/components/validation/TradeReplay";
import type { Candle } from "@/lib/engines/types";
import {
  cancelRun,
  fetchRunProgress,
  fetchRunTrades,
  fetchRuns,
  fetchValidationReport,
  startValidationRun,
  type JobProgressView,
  type RunRecord,
  type ValidationReport,
} from "@/lib/t4/validation/client";
import type { T4Trade } from "@/lib/t4/validation/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/validacao-t4")({
  component: ValidationPage,
  head: () => ({ meta: [{ title: "Validação T4 — Analisador" }] }),
});

/**
 * PAINEL VALIDAÇÃO T4.
 *
 * Mostra o que os dados sustentam e, com o mesmo destaque, o que eles NÃO
 * sustentam. Duas escalas separadas o tempo todo: confluência (setup
 * confirmado) e robustez (qualidade da validação). Nenhuma das duas é
 * apresentada como probabilidade de lucro.
 *
 * O backtest roda em segundo plano no servidor: aqui só se enfileira,
 * acompanha o progresso e cancela.
 */
function ValidationPage() {
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [jobs, setJobs] = useState<JobProgressView[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [trades, setTrades] = useState<T4Trade[]>([]);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<JobProgressView | null>(null);
  const pollRef = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const refreshRuns = useCallback(async () => {
    try {
      const data = await fetchRuns();
      setRuns(data.runs);
      setJobs(data.jobs);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao listar os runs.");
    }
  }, []);

  useEffect(() => {
    void refreshRuns();
  }, [refreshRuns]);

  const loadReport = useCallback(async (runId: string) => {
    setBusy(true);
    try {
      const [data, tradeList] = await Promise.all([
        fetchValidationReport(runId),
        fetchRunTrades(runId),
      ]);
      setReport(data);
      setTrades(tradeList);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar o relatório.");
    } finally {
      setBusy(false);
    }
  }, []);

  // Acompanhamento do job: pára sozinho quando o run termina.
  useEffect(() => {
    if (!selectedRunId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const data = await fetchRunProgress(selectedRunId);
        if (cancelled) return;
        setLive(data.live);
        if (data.live === null || data.live.finishedAt !== null) {
          if (pollRef.current !== null) window.clearInterval(pollRef.current);
          pollRef.current = null;
          await refreshRuns();
          if (data.run?.status === "DONE") await loadReport(selectedRunId);
        }
      } catch {
        // Falha transitória de rede não pode derrubar a tela.
      }
    };
    void tick();
    pollRef.current = window.setInterval(() => void tick(), 800);
    return () => {
      cancelled = true;
      if (pollRef.current !== null) window.clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [selectedRunId, refreshRuns, loadReport]);

  const importCandles = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      const list = Array.isArray(parsed) ? parsed : (parsed as { candles?: unknown }).candles;
      if (!Array.isArray(list)) throw new Error("O arquivo precisa ser uma lista de candles.");
      const normalized: Candle[] = list.map((item) => {
        const candle = item as Partial<Candle>;
        if (
          typeof candle.t !== "number" ||
          typeof candle.o !== "number" ||
          typeof candle.h !== "number" ||
          typeof candle.l !== "number" ||
          typeof candle.c !== "number"
        ) {
          throw new Error("Candle inválido: t/o/h/l/c precisam ser números.");
        }
        return {
          t: candle.t,
          o: candle.o,
          h: candle.h,
          l: candle.l,
          c: candle.c,
          v: candle.v ?? 0,
        };
      });
      setCandles(normalized);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Arquivo inválido.");
    }
  }, []);

  const start = useCallback(async () => {
    if (candles.length === 0) {
      setError("Carregue uma série de candles antes de rodar o backtest.");
      return;
    }
    setBusy(true);
    try {
      const result = await startValidationRun({ candles });
      setSelectedRunId(result.runId);
      setError(null);
      await refreshRuns();
      if (result.reused) await loadReport(result.runId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao iniciar o backtest.");
    } finally {
      setBusy(false);
    }
  }, [candles, refreshRuns, loadReport]);

  const runningJob = useMemo(() => jobs.find((job) => job.finishedAt === null) ?? null, [jobs]);

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight">VALIDAÇÃO T4</h1>
          <p className="text-xs text-muted-foreground">
            Confluência mede setup confirmado. Robustez mede a qualidade da validação. Nenhuma das
            duas é probabilidade de lucro.
          </p>
        </div>
        <Button size="sm" variant="outline" className="h-7" onClick={() => void refreshRuns()}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Atualizar
        </Button>
      </header>

      {error && (
        <Card className="border-bear/50 bg-bear/5 p-3">
          <p className="text-xs text-bear">{error}</p>
        </Card>
      )}

      {/* ── EXECUÇÃO */}
      <Card className="border-border/70 bg-panel p-3">
        <p className="text-[10px] font-medium tracking-widest text-muted-foreground">
          RODAR BACKTEST (EM SEGUNDO PLANO)
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importCandles(file);
              event.target.value = "";
            }}
          />
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            Carregar série (JSON)
          </Button>
          <span className="font-mono text-[11px] text-muted-foreground">
            {candles.length > 0
              ? `${candles.length} candles carregados`
              : "nenhuma série carregada"}
          </span>
          <Button size="sm" onClick={() => void start()} disabled={busy || candles.length === 0}>
            <Play className="mr-1.5 h-3.5 w-3.5" /> RODAR
          </Button>
          {runningJob && (
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await cancelRun(runningJob.runId).catch(() => undefined);
                await refreshRuns();
              }}
            >
              <Ban className="mr-1.5 h-3.5 w-3.5" /> Cancelar
            </Button>
          )}
        </div>

        {live && live.finishedAt === null && (
          <div className="mt-3">
            <div className="flex items-baseline justify-between font-mono text-[11px]">
              <span className="text-primary">{live.status}</span>
              <span className="text-muted-foreground">
                {live.processed}/{live.total} candles · {live.opportunities} oportunidade(s) ·{" "}
                {live.executed} executada(s)
              </span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${live.progress}%` }}
              />
            </div>
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">
              {live.progress.toFixed(1)}% — a interface segue livre; o trabalho roda no servidor.
            </p>
          </div>
        )}
      </Card>

      {/* ── RUNS */}
      <Card className="border-border/70 bg-panel p-0">
        <p className="p-3 pb-1 text-[10px] font-medium tracking-widest text-muted-foreground">
          RUNS ({runs.length})
        </p>
        {runs.length === 0 ? (
          <p className="p-3 pt-1 text-[11px] text-muted-foreground">
            Nenhum run gravado. Carregue uma série e rode o backtest.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full font-mono text-[11px]">
              <thead>
                <tr className="border-b border-border/50 text-left text-muted-foreground">
                  <th className="p-2">DATA</th>
                  <th className="p-2">ATIVO / TF</th>
                  <th className="p-2">STATUS</th>
                  <th className="p-2 text-right">CANDLES</th>
                  <th className="p-2 text-right">OPORTUN.</th>
                  <th className="p-2 text-right">EXECUT.</th>
                  <th className="p-2">CONFIG</th>
                  <th className="p-2">DATASET</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr
                    key={run.runId}
                    className={cn(
                      "cursor-pointer border-b border-border/30 transition-colors hover:bg-primary/5",
                      selectedRunId === run.runId && "bg-primary/10",
                    )}
                    onClick={() => {
                      setSelectedRunId(run.runId);
                      if (run.status === "DONE") void loadReport(run.runId);
                    }}
                  >
                    <td className="p-2">{new Date(run.createdAt).toLocaleString("pt-BR")}</td>
                    <td className="p-2">
                      {run.symbol} {run.timeframe}
                    </td>
                    <td
                      className={cn(
                        "p-2",
                        run.status === "DONE" && "text-bull",
                        run.status === "ERROR" && "text-bear",
                        run.status === "CANCELLED" && "text-warn",
                      )}
                    >
                      {run.status}
                    </td>
                    <td className="p-2 text-right">{run.scannedCandles}</td>
                    <td className="p-2 text-right">{run.opportunities}</td>
                    <td className="p-2 text-right">{run.executed}</td>
                    <td className="p-2 text-muted-foreground">{run.configHash}</td>
                    <td className="p-2 text-muted-foreground">{run.datasetHash || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── RELATÓRIO */}
      {report && (
        <>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
            <ValidationSummary
              report={report.robustness}
              version={report.run.strategyVersion}
              configHash={report.run.configHash}
            />
            <div className="flex flex-col gap-3">
              <SplitComparison report={report.robustness} />
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <EquityCurve metrics={report.robustness.metrics.all} />
                <DrawdownCurve metrics={report.robustness.metrics.all} />
                <RDistribution metrics={report.robustness.metrics.all} />
                <MfeMaePanel metrics={report.robustness.metrics.all} />
              </div>
            </div>
          </div>

          <Card className="border-border/70 bg-panel p-3">
            <p className="text-[10px] font-medium tracking-widest text-muted-foreground">
              WALK-FORWARD E REAMOSTRAGEM
            </p>
            <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="font-mono text-[11px]">
                <p className="text-muted-foreground">WALK-FORWARD</p>
                {report.robustness.walkForward.available ? (
                  <>
                    <p className="mt-1">
                      {report.robustness.walkForward.positiveFolds}/
                      {report.robustness.walkForward.folds.length} janelas positivas ·{" "}
                      {report.robustness.walkForward.stable ? (
                        <span className="text-bull">estável</span>
                      ) : (
                        <span className="text-bear">instável</span>
                      )}
                    </p>
                    <ul className="mt-1 flex flex-col gap-0.5 text-muted-foreground">
                      {report.robustness.walkForward.folds.map((fold) => (
                        <li key={fold.index}>
                          janela {fold.index}: {fold.trades} trades ·{" "}
                          <span className={fold.positive ? "text-bull" : "text-bear"}>
                            {fold.expectancy.toFixed(3)}R
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="mt-1 text-muted-foreground">
                    {report.robustness.walkForward.unavailableReason}
                  </p>
                )}
              </div>
              <div className="font-mono text-[11px]">
                <p className="text-muted-foreground">BOOTSTRAP · MONTE CARLO</p>
                {report.robustness.bootstrap.available ? (
                  <p className="mt-1">
                    IC 95%: [{report.robustness.bootstrap.ci95Low.toFixed(3)}R,{" "}
                    {report.robustness.bootstrap.ci95High.toFixed(3)}R] ·{" "}
                    {report.robustness.bootstrap.iterations} reamostragens · semente{" "}
                    {report.robustness.bootstrap.seed}
                  </p>
                ) : (
                  <p className="mt-1 text-muted-foreground">
                    {report.robustness.bootstrap.unavailableReason}
                  </p>
                )}
                <ul className="mt-1 flex flex-col gap-0.5 text-muted-foreground">
                  {report.simulations.map((simulation) => (
                    <li key={simulation.simulationId}>
                      {simulation.kind}: {simulation.iterations} iterações · semente{" "}
                      {simulation.seed}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Semente registrada = a mesma simulação pode ser refeita e conferida.
                </p>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <SegmentTable
              result={report.segmentation.confluence}
              title="POR FAIXA DE CONFLUÊNCIA"
            />
            <SegmentTable result={report.segmentation.direction} title="POR DIREÇÃO" />
            <SegmentTable result={report.segmentation.regime} title="POR REGIME" />
            <SegmentTable result={report.segmentation.hour} title="POR HORA (UTC)" />
            <SegmentTable result={report.segmentation.asset} title="POR ATIVO" />
            <SegmentTable result={report.segmentation.timeframe} title="POR TIMEFRAME" />
          </div>

          <ThresholdPanel analysis={report.threshold} />
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <ContributionTable rows={report.contribution} />
            <AblationTable rows={report.ablation} />
          </div>
          <DegradationPanel report={report.degradation} />

          <TradeReplay candles={candles} trades={trades} />
          {candles.length === 0 && (
            <Card className="border-border/70 bg-panel p-3">
              <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground">
                REPLAY
              </Badge>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Carregue a MESMA série usada no run para reproduzir a leitura candle a candle com as
                entradas históricas marcadas em roxo.
              </p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
