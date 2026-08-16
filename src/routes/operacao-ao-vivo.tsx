import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bot, Play, Power, RotateCcw, ShieldAlert } from "lucide-react";

import { AnalysisCockpit } from "@/components/analysis/AnalysisCockpit";
import { useAnalyzer } from "@/components/AnalyzerProvider";
import { CaptureConsole } from "@/components/live/CaptureConsole";
import { LivePreview } from "@/components/live/LivePreview";
import { PipelineDiagnosticsCard } from "@/components/t4/PipelineDiagnosticsCard";
import { RecordingStatusCard } from "@/components/t4/RecordingStatusCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isSecureContextAvailable } from "@/lib/capture/screenCapture";
import { computeT4Progress } from "@/lib/t4/progress";
import { unlockAudio } from "@/lib/t4/signalSound";
import { visibleRange } from "@/lib/vision/priceScale";

export const Route = createFileRoute("/operacao-ao-vivo")({
  component: LivePage,
  head: () => ({ meta: [{ title: "Operação ao Vivo — Analisador Visual T4" }] }),
});

function LivePage() {
  // Sessão vive no AnalyzerProvider (layout raiz): sair desta rota NÃO
  // interrompe captura, candles, contexto, T4 nem gravação.
  const { live, liveAsset, setLiveAsset, timeframeConfirmed, setTimeframeConfirmed } =
    useAnalyzer();
  const [startErrors, setStartErrors] = useState<string[]>([]);
  const [insecureContext, setInsecureContext] = useState(false);
  const range = live.frameSize ? visibleRange(live.calibration, live.frameSize.height) : null;

  const progress = computeT4Progress({
    sessionActive: live.sessionActive,
    diagnostics: live.diagnostics,
    analysis: live.analysis,
    decisionEvaluated: live.decision !== null,
    snapshot: live.signalSnapshot,
    // §1: preço reprovado na plausibilidade trava o progresso e expõe o motivo.
    priceTrusted: live.priceInfo.trusted,
    priceTrustReason: live.priceInfo.reason,
  });

  const chartClockLabel =
    live.diagnostics.CHART_CLOCK === "VALID"
      ? live.priceInfo.at
        ? new Date(live.priceInfo.at).toLocaleTimeString("pt-BR", { hour12: false })
        : "VÁLIDO"
      : live.diagnostics.CHART_CLOCK === "FALLBACK_REALTIME"
        ? "FALLBACK (relógio local)"
        : "INDISPONÍVEL";

  const start = async () => {
    // §6 (gerenciamento): o clique de iniciar é o GESTO que desbloqueia o
    // AudioContext — o som da confirmação chega minutos depois, sem gesto.
    unlockAudio();
    setStartErrors([]);
    if (live.chart.status === "sem-fonte") {
      await live.selectSourceAndStart();
      return;
    }
    if (live.chart.status === "aguardando-confirmacao") {
      await live.confirmPreviewAndStart();
      return;
    }
    if (!live.sessionActive) {
      // Gráfico visível = análise imediata. A escala calibra em paralelo.
      await live.autoCalibrateAndStart();
      return;
    }
    setStartErrors(live.startSession());
  };

  useEffect(() => setInsecureContext(!isSecureContextAvailable()), []);

  return (
    <div className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Operação ao Vivo</h1>
          <p className="text-xs text-muted-foreground">
            Uma janela real · gráfico de 1 minuto · técnica T4 · somente preço e geometria dos
            candles.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button asChild size="sm" variant="outline" className="font-mono text-xs">
            <Link to="/claude">
              <Bot className="mr-1 h-3.5 w-3.5" />
              CLAUDE
            </Link>
          </Button>
          <Badge variant="outline" className="font-mono">
            T4.0.0
          </Badge>
        </div>
      </header>

      {insecureContext && (
        <Card className="flex gap-2 border-bear/50 bg-bear/10 p-3 text-xs text-bear">
          <ShieldAlert className="h-4 w-4 shrink-0" />A captura exige HTTPS ou localhost. Hospede
          atrás do nginx com certificado válido.
        </Card>
      )}

      <Card className="grid gap-3 border-border/70 bg-panel p-3 md:grid-cols-[180px_1fr_auto]">
        <div>
          <Label htmlFor="asset">Ativo</Label>
          <Input
            id="asset"
            value={liveAsset}
            disabled={live.sessionActive}
            onChange={(event) => setLiveAsset(event.target.value.toUpperCase())}
          />
        </div>
        <label className="flex items-center gap-2 rounded-md border border-border/70 px-3 text-sm">
          <input
            type="checkbox"
            checked={timeframeConfirmed}
            disabled={live.sessionActive}
            onChange={(event) => setTimeframeConfirmed(event.target.checked)}
          />
          <span>
            Confirmo que a janela mostra o gráfico de <strong>1 minuto</strong>
          </span>
        </label>
        <div className="flex items-end gap-2">
          {!live.sessionActive ? (
            <Button disabled={live.autoCalibrating} onClick={() => void start()}>
              <Play className="mr-1.5 h-4 w-4" />
              {live.autoCalibrating
                ? "Lendo escala…"
                : live.chart.status === "sem-fonte"
                  ? "Selecionar e analisar"
                  : "Iniciar análise"}
            </Button>
          ) : (
            <Button variant="destructive" onClick={live.endSession}>
              <Power className="mr-1.5 h-4 w-4" />
              Encerrar
            </Button>
          )}
        </div>
      </Card>

      <CaptureConsole
        status={live.chart.status}
        fps={live.chart.fps}
        resolution={live.chart.resolution}
        lastFrameAt={live.chart.lastFrameAt}
        error={live.chart.error}
        sourceLabel={live.chart.sourceLabel}
        onSelectSource={() => void live.selectSourceAndStart()}
        onConfirmPreview={() => void live.confirmPreviewAndStart()}
        onPause={live.chart.pause}
        onResume={live.chart.resume}
        onSwitchSource={() => void live.switchSourceAndStart()}
      />

      {live.chart.status !== "sem-fonte" && (
        <LivePreview
          status={live.chart.status}
          sourceLabel={live.chart.sourceLabel}
          fps={live.chart.fps}
          resolution={live.chart.resolution}
          error={live.chart.error}
          lastFrameAt={live.chart.lastFrameAt}
          chartClockLabel={chartClockLabel}
          priceInfo={live.priceInfo}
          tickSize={live.calibration.tickSize}
          decimals={live.calibration.decimals}
          snapshot={live.signalSnapshot}
        />
      )}

      <Card className="border-border/70 bg-panel p-3">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-[220px] flex-1">
            <p className="text-[10px] font-medium tracking-widest text-muted-foreground">
              CALIBRAÇÃO AUTOMÁTICA DA ESCALA
            </p>
            <p className="mt-1 text-xs">
              A análise estrutural começa assim que o gráfico aparece no analisador. Em paralelo, o
              Qwen-VL procura dois rótulos reais da escala para liberar os preços exatos — falhar
              aqui nunca interrompe a leitura.
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground">{live.calibrationSummary}</p>
          </div>
          <Badge
            variant="outline"
            className={live.calibration.usable ? "border-bull text-bull" : "border-warn text-warn"}
          >
            {live.calibration.usable
              ? `PREÇOS DISPONÍVEIS · ${live.calibration.confidence}%`
              : "PREÇOS EM CALIBRAÇÃO · ANÁLISE ATIVA"}
          </Badge>
          <Button
            size="sm"
            variant="outline"
            disabled={live.autoCalibrating || live.chart.status === "sem-fonte"}
            onClick={() => void live.autoCalibrateAndStart()}
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Recalibrar automaticamente
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={live.chart.status === "sem-fonte"}
            onClick={() => live.adjustScaleRegion(0.62)}
          >
            Ajustar região da escala
          </Button>
        </div>
        <div className="mt-3 grid gap-2 text-[11px] sm:grid-cols-4">
          <span>
            Pontos: <strong>{live.anchors.length}</strong>
          </span>
          <span>
            R²:{" "}
            <strong>
              {Number.isFinite(live.calibration.r2) ? live.calibration.r2.toFixed(5) : "—"}
            </strong>
          </span>
          <span>
            Faixa: <strong>{range ? `${range.min}–${range.max}` : "—"}</strong>
          </span>
          <span>
            Incremento: <strong>{live.calibration.tickSize ?? "—"}</strong>
          </span>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">{live.calibration.reason}</p>
      </Card>

      {(startErrors.length > 0 || live.lastRejectedRead || live.autoCalibrationError) && (
        <Card className="border-warn/50 bg-warn/10 p-3 text-xs text-warn">
          {startErrors.map((error) => (
            <p key={error}>• {error}</p>
          ))}
          {live.lastRejectedRead && <p>• {live.lastRejectedRead}</p>}
          {live.autoCalibrationError && !live.priceScaleReady && <p>• {live.calibrationSummary}</p>}
        </Card>
      )}

      <AnalysisCockpit
        asset={liveAsset}
        candles={live.candles}
        analysis={live.analysis}
        decision={live.decision}
        entryState={live.entryState}
        operationStatus={
          live.operation?.done
            ? `ENCERRADA · ${live.operation.status}`
            : (live.operation?.status ?? null)
        }
        operationDetail={live.operation?.detail ?? null}
        progress={progress}
        snapshot={live.signalSnapshot}
        priceScaleReady={live.priceScaleReady}
        calibrationSummary={live.calibrationSummary}
        priceInfo={live.priceInfo}
        tickSize={live.calibration.tickSize}
        decimals={live.calibration.decimals}
        sessionActive={live.sessionActive}
        managementPaused={live.managementPaused}
        chat={live.chat}
        aiProvider={live.aiProvider}
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <PipelineDiagnosticsCard diagnostics={live.diagnostics} />
        <RecordingStatusCard />
      </div>
    </div>
  );
}
