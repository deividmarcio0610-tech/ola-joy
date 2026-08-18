import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Eye,
  EyeOff,
  RefreshCw,
  ScanSearch,
  Sparkles,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PrintChat } from "@/components/print/PrintChat";
import { PrintComparison } from "@/components/print/PrintComparison";
import { PrintDiagnosticPanel } from "@/components/print/PrintDiagnosticPanel";
import { PrintDropzone, type LoadedPrint } from "@/components/print/PrintDropzone";
import { PrintFeedback } from "@/components/print/PrintFeedback";
import { ANNOTATION_ROLE_LABEL } from "@/components/print/PrintOverlay";
import {
  fetchPrintAnalysisStatus,
  requestPrintAnalysis,
  type PrintAnalysisResponse,
  type PrintAnalysisStatus,
} from "@/lib/printAnalysis/client";
import {
  ROLE_COLOR,
  type AnnotationRole,
  type PrintAnnotation,
} from "@/lib/printAnalysis/contract";
import { inspectImageInBrowser, type ImageQualityReport } from "@/lib/printAnalysis/imageQuality";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/analisar-print")({
  component: AnalyzePrintPage,
  head: () => ({ meta: [{ title: "Analisar Print — Analisador T4" }] }),
});

/**
 * ANALISAR PRINT — análise manual por captura.
 *
 * Fluxo: colar/arrastar o print → checar QUALIDADE DA IMAGEM no navegador →
 * enviar ao modelo multimodal no servidor → validar o JSON → desenhar o
 * overlay sobre a imagem ORIGINAL INTACTA.
 *
 * Nada aqui é simulado: sem modelo de visão configurado, a tela diz
 * "ANÁLISE IA INDISPONÍVEL" e o botão de analisar fica bloqueado. Um
 * resultado falso desenhado sobre o gráfico do operador seria pior que nada.
 */

type Phase = "IDLE" | "LOADING_IMAGE" | "CHECKING_QUALITY" | "ANALYZING" | "DONE" | "ERROR";

const PHASE_STEPS: Array<{ phase: Phase; label: string }> = [
  { phase: "LOADING_IMAGE", label: "Carregando imagem" },
  { phase: "CHECKING_QUALITY", label: "Validando qualidade" },
  { phase: "ANALYZING", label: "Identificando estrutura e aplicando regras T4" },
  { phase: "DONE", label: "Análise concluída" },
];

function AnalyzePrintPage() {
  const [status, setStatus] = useState<PrintAnalysisStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [print, setPrint] = useState<LoadedPrint | null>(null);
  const [quality, setQuality] = useState<ImageQualityReport | null>(null);
  const [phase, setPhase] = useState<Phase>("IDLE");
  const [result, setResult] = useState<PrintAnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hiddenRoles, setHiddenRoles] = useState<Set<AnnotationRole>>(new Set());
  const [selected, setSelected] = useState<PrintAnnotation | null>(null);
  const [zoom, setZoom] = useState(1);

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await fetchPrintAnalysisStatus());
      setStatusError(null);
    } catch (cause) {
      setStatusError(cause instanceof Error ? cause.message : "Falha ao consultar o status da IA.");
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const loadPrint = useCallback(async (loaded: LoadedPrint) => {
    setPrint(loaded);
    setResult(null);
    setSelected(null);
    setError(null);
    setPhase("CHECKING_QUALITY");
    try {
      const report = await inspectImageInBrowser(loaded.dataUrl);
      setQuality(report);
      setPhase("IDLE");
    } catch (cause) {
      setQuality(null);
      setPhase("ERROR");
      setError(cause instanceof Error ? cause.message : "Falha ao inspecionar a imagem.");
    }
  }, []);

  const clearPrint = useCallback(() => {
    setPrint(null);
    setQuality(null);
    setResult(null);
    setSelected(null);
    setError(null);
    setPhase("IDLE");
  }, []);

  const analyze = useCallback(async () => {
    if (!print) return;
    setPhase("ANALYZING");
    setError(null);
    setSelected(null);
    try {
      const response = await requestPrintAnalysis({
        imageDataUrl: print.dataUrl,
        width: print.width,
        height: print.height,
      });
      setResult(response);
      setPhase("DONE");
    } catch (cause) {
      setPhase("ERROR");
      setError(cause instanceof Error ? cause.message : "Falha ao analisar o print.");
    }
  }, [print]);

  const roles = useMemo(
    () => [...new Set((result?.analysis.annotations ?? []).map((item) => item.role))],
    [result],
  );
  const pastT4 = useMemo(
    () => (result?.analysis.annotations ?? []).filter((item) => item.role === "T4_PAST"),
    [result],
  );

  const aiAvailable = status?.available ?? false;
  const qualityBlocked = quality !== null && !quality.ok;
  const canAnalyze =
    print !== null &&
    aiAvailable &&
    !qualityBlocked &&
    phase !== "ANALYZING" &&
    phase !== "CHECKING_QUALITY";

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight">ANALISAR PRINT</h1>
          <p className="text-xs text-muted-foreground">
            Cole a captura do gráfico e a IA devolve a leitura T4 desenhada sobre o seu próprio
            print.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {status && (
            <Badge
              variant="outline"
              className={cn(
                "font-mono text-[10px]",
                aiAvailable ? "border-bull text-bull" : "border-bear text-bear",
              )}
            >
              {aiAvailable ? `IA VISUAL: ${status.model}` : "ANÁLISE IA INDISPONÍVEL"}
            </Badge>
          )}
          <Button size="sm" variant="outline" className="h-7" onClick={() => void refreshStatus()}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Status
          </Button>
        </div>
      </header>

      {!aiAvailable && status && (
        <Card className="border-bear/50 bg-bear/5 p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-bear">
            <AlertTriangle className="h-4 w-4" /> ANÁLISE IA INDISPONÍVEL
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{status.reason}</p>
        </Card>
      )}
      {statusError && (
        <Card className="border-bear/50 bg-bear/5 p-3">
          <p className="text-xs text-bear">{statusError}</p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* ── COLUNA PRINCIPAL */}
        <div className="flex flex-col gap-3">
          {!print && (
            <PrintDropzone
              value={print}
              onLoad={(loaded) => void loadPrint(loaded)}
              onClear={clearPrint}
              onError={setError}
            />
          )}

          {print && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => void analyze()}
                  disabled={!canAnalyze}
                  className="font-display font-bold"
                >
                  <Sparkles className="mr-1.5 h-4 w-4" />
                  {result ? "REANALISAR" : "ANALISAR T4"}
                </Button>
                <Button size="sm" variant="outline" onClick={clearPrint}>
                  NOVA IMAGEM
                </Button>
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-7 w-7"
                    aria-label="Reduzir"
                    onClick={() => setZoom((z) => Math.max(1, Number((z - 0.25).toFixed(2))))}
                  >
                    <ZoomOut className="h-3.5 w-3.5" />
                  </Button>
                  <span className="w-10 text-center font-mono text-[10px] text-muted-foreground">
                    {Math.round(zoom * 100)}%
                  </span>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-7 w-7"
                    aria-label="Ampliar"
                    onClick={() => setZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))))}
                  >
                    <ZoomIn className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Estado do processamento — nunca uma tela congelada. */}
              <ProcessingTrail phase={phase} />

              {quality && !quality.ok && (
                <Card className="border-warn/60 bg-warn/5 p-3">
                  <p className="flex items-center gap-1.5 text-sm font-bold text-warn">
                    <AlertTriangle className="h-4 w-4" /> PRINT INSUFICIENTE
                  </p>
                  <ul className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
                    {quality.reasons.map((reason) => (
                      <li key={reason}>— {reason}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Nenhuma operação é gerada a partir de uma imagem que não permite leitura
                    confiável. Recapture o gráfico com mais resolução ou recorte apenas a área do
                    preço.
                  </p>
                </Card>
              )}

              {error && (
                <Card className="border-bear/50 bg-bear/5 p-3">
                  <p className="text-sm font-semibold text-bear">Não foi possível concluir</p>
                  <p className="mt-1 text-xs text-muted-foreground">{error}</p>
                  <Button
                    size="sm"
                    className="mt-2 h-7"
                    onClick={() => void analyze()}
                    disabled={!canAnalyze}
                  >
                    TENTAR NOVAMENTE
                  </Button>
                </Card>
              )}

              <div className="overflow-x-auto">
                {result ? (
                  <PrintComparison
                    imageDataUrl={print.dataUrl}
                    naturalWidth={print.width}
                    naturalHeight={print.height}
                    annotations={result.analysis.annotations}
                    hiddenRoles={hiddenRoles}
                    selectedId={selected?.id ?? null}
                    onSelect={setSelected}
                    zoom={zoom}
                  />
                ) : (
                  <div style={{ width: `${zoom * 100}%`, maxWidth: zoom > 1 ? "none" : "100%" }}>
                    <div
                      className="relative overflow-hidden rounded-md border border-border/60 bg-black"
                      style={{ aspectRatio: `${print.width} / ${print.height}` }}
                    >
                      <img
                        src={print.dataUrl}
                        alt="Print carregado"
                        className="absolute inset-0 h-full w-full object-contain"
                      />
                    </div>
                  </div>
                )}
              </div>

              <PrintDropzone
                value={print}
                onLoad={(loaded) => void loadPrint(loaded)}
                onClear={clearPrint}
                onError={setError}
              />

              {result && roles.length > 0 && (
                <Card className="border-border/70 bg-panel p-3">
                  <p className="text-[10px] font-medium tracking-widest text-muted-foreground">
                    MARCAÇÕES ({result.analysis.annotations.length})
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {roles.map((role) => {
                      const hidden = hiddenRoles.has(role);
                      return (
                        <button
                          key={role}
                          type="button"
                          onClick={() =>
                            setHiddenRoles((current) => {
                              const next = new Set(current);
                              if (next.has(role)) next.delete(role);
                              else next.add(role);
                              return next;
                            })
                          }
                          className={cn(
                            "flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] transition-opacity",
                            hidden && "opacity-40",
                          )}
                          style={{ borderColor: ROLE_COLOR[role], color: ROLE_COLOR[role] }}
                        >
                          {hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                          {ANNOTATION_ROLE_LABEL[role]}
                        </button>
                      );
                    })}
                  </div>

                  {pastT4.length > 0 && (
                    <div className="mt-3">
                      <p
                        className="text-[10px] tracking-widest"
                        style={{ color: ROLE_COLOR.T4_PAST }}
                      >
                        POSSÍVEIS T4 ANTERIORES IDENTIFICADAS NO PRINT: {pastT4.length}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {pastT4.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setSelected(item)}
                            className="rounded border px-1.5 py-0.5 font-mono text-[10px]"
                            style={{ borderColor: ROLE_COLOR.T4_PAST, color: ROLE_COLOR.T4_PAST }}
                          >
                            T4 #{item.index}
                          </button>
                        ))}
                      </div>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        Identificação visual dentro deste print. Não é backtest estatístico.
                      </p>
                    </div>
                  )}

                  {selected && (
                    <div className="mt-3 rounded border border-border/60 bg-muted/30 p-2">
                      <p
                        className="font-mono text-[11px]"
                        style={{ color: ROLE_COLOR[selected.role] }}
                      >
                        {ANNOTATION_ROLE_LABEL[selected.role]}
                        {selected.index ? ` #${selected.index}` : ""} — {selected.label}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {selected.reason ?? "A IA não informou o motivo desta marcação."}
                      </p>
                    </div>
                  )}
                </Card>
              )}
            </>
          )}
        </div>

        {/* ── PAINEL LATERAL */}
        <div className="flex flex-col gap-3">
          {result ? (
            <>
              <PrintDiagnosticPanel
                analysis={result.analysis}
                corrections={result.corrections}
                model={result.model}
                repaired={result.repaired}
              />
              {result.persisted && (
                <>
                  <PrintFeedback analysisId={result.id} />
                  <PrintChat analysisId={result.id} />
                </>
              )}
            </>
          ) : (
            <Card className="border-border/70 bg-panel p-4">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                <ScanSearch className="h-4 w-4" /> Nenhuma análise ainda
              </p>
              <ol className="mt-2 flex list-decimal flex-col gap-1 pl-4 text-xs text-muted-foreground">
                <li>Tire o print do gráfico no Profit.</li>
                <li>
                  Cole aqui com <kbd className="rounded bg-muted px-1 font-mono">Ctrl+V</kbd>.
                </li>
                <li>Clique em ANALISAR T4.</li>
              </ol>
              <p className="mt-3 text-[11px] text-muted-foreground">
                A IA só usa os critérios T4 cadastrados no sistema e nunca inventa preço, ativo,
                horário ou nível: o que não estiver legível no print aparece como{" "}
                <span className="font-mono">NÃO LEGÍVEL NO PRINT</span>.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function ProcessingTrail({ phase }: { phase: Phase }) {
  if (phase === "IDLE" || phase === "ERROR") return null;
  const activeIndex = PHASE_STEPS.findIndex((step) => step.phase === phase);
  return (
    <Card className="border-border/70 bg-panel p-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {PHASE_STEPS.map((step, index) => {
          const done = activeIndex > index || phase === "DONE";
          const active = activeIndex === index && phase !== "DONE";
          return (
            <span
              key={step.phase}
              className={cn(
                "flex items-center gap-1 font-mono text-[10px]",
                done ? "text-bull" : active ? "text-primary" : "text-muted-foreground",
              )}
            >
              {active && (
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              )}
              {done && <span className="inline-block h-1.5 w-1.5 rounded-full bg-bull" />}
              {step.label}
            </span>
          );
        })}
      </div>
    </Card>
  );
}
