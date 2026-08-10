import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { GRAPH_ROI } from "@/lib/capture/frameProcessor";
import { screenCaptureManager } from "@/lib/capture/screenCaptureManager";
import type { ChartCaptureStatus } from "@/hooks/useContinuousChartCapture";
import type { LivePriceInfo } from "@/lib/t4/managementView";
import { UNTRUSTED_PRICE_LABEL, formatManagedPrice } from "@/lib/t4/managementView";
import {
  CONFIRMATION_OVERLAY_MS,
  captureDegradationReason,
  shouldShowConfirmationOverlay,
} from "@/lib/t4/overlayGate";
import type { TradeSignalSnapshot } from "@/lib/t4/signalSnapshot";
import { cn } from "@/lib/utils";

/**
 * PREVIEW DA JANELA DO PROFIT (comando ao-vivo §4 + gerenciamento §5).
 *
 * O <video> daqui recebe a MESMA MediaStream global via
 * screenCaptureManager.attachPreview() — nenhuma segunda captura, nenhum
 * processamento duplicado. Sobre o preview ficam: fonte, FPS, resolução,
 * chartClock, preço vivo e o retângulo da ROI analisada. Se a stream para,
 * minimiza ou degrada, o motivo REAL aparece por cima e a análise pausa.
 *
 * O alerta central "ENTRADA CONFIRMADA" dispara UMA vez por signalId, dura
 * ~6 s, é fechável e desenha SOMENTE sobre o preview capturado dentro do site
 * — nunca sobre o aplicativo Profit externo.
 */
export function LivePreview({
  status,
  sourceLabel,
  fps,
  resolution,
  error,
  lastFrameAt,
  chartClockLabel,
  priceInfo,
  tickSize,
  decimals,
  snapshot,
}: {
  status: ChartCaptureStatus;
  sourceLabel: string | null;
  fps: number;
  resolution: string | null;
  error: string | null;
  lastFrameAt: number | null;
  chartClockLabel: string;
  priceInfo: LivePriceInfo;
  tickSize: number | null;
  decimals: number;
  snapshot: TradeSignalSnapshot | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [overlaySignal, setOverlaySignal] = useState<TradeSignalSnapshot | null>(null);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    return screenCaptureManager.attachPreview(element);
  }, []);

  // Alerta central 1×/signalId no instante exato da primeira confirmação.
  useEffect(() => {
    if (!snapshot) return;
    if (!shouldShowConfirmationOverlay(snapshot.signalId)) return;
    setOverlaySignal(snapshot);
    const timer = setTimeout(() => {
      setOverlaySignal((current) => (current?.signalId === snapshot.signalId ? null : current));
    }, CONFIRMATION_OVERLAY_MS);
    return () => clearTimeout(timer);
  }, [snapshot]);

  const degradation = captureDegradationReason({ status, error, lastFrameAt });
  const priceText =
    priceInfo.trusted && priceInfo.price !== null
      ? formatManagedPrice(priceInfo.price, tickSize, decimals)
      : UNTRUSTED_PRICE_LABEL;

  return (
    <Card className="relative overflow-hidden border-border/70 bg-panel p-0">
      <div className="relative aspect-video max-h-[420px] w-full bg-black/80">
        {/* Mesma MediaStream global — nunca uma segunda captura. */}
        <video ref={videoRef} muted playsInline className="h-full w-full object-contain" />

        {/* ROI analisada pelo motor — exatamente as frações usadas na leitura. */}
        <div
          className="pointer-events-none absolute border border-primary/50"
          style={{
            left: `${GRAPH_ROI.left * 100}%`,
            top: `${GRAPH_ROI.top * 100}%`,
            width: `${(GRAPH_ROI.right - GRAPH_ROI.left) * 100}%`,
            height: `${(GRAPH_ROI.bottom - GRAPH_ROI.top) * 100}%`,
          }}
        >
          <span className="absolute -top-4 left-0 font-mono text-[9px] text-primary/80">
            ROI ANALISADA
          </span>
        </div>

        {/* Chips reais: fonte · FPS · resolução · chartClock · preço vivo. */}
        <div className="pointer-events-none absolute left-2 top-2 flex max-w-[95%] flex-wrap gap-1">
          <Chip>{sourceLabel ?? "sem fonte"}</Chip>
          <Chip>FPS {fps}</Chip>
          <Chip>{resolution ?? "—"}</Chip>
          <Chip>CHART CLOCK: {chartClockLabel}</Chip>
          <Chip tone={priceInfo.trusted ? "bull" : "warn"}>
            {priceInfo.trusted ? `PREÇO ${priceText}` : UNTRUSTED_PRICE_LABEL}
          </Chip>
        </div>

        {/* Stream parada/minimizada/degradada: motivo REAL + análise pausada. */}
        {degradation && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-4">
            <div className="max-w-md rounded-md border border-warn/60 bg-warn/10 p-3 text-center">
              <p className="font-display text-sm font-bold text-warn">ANÁLISE PAUSADA</p>
              <p className="mt-1 text-xs text-warn">{degradation}</p>
            </div>
          </div>
        )}

        {/* ENTRADA CONFIRMADA — overlay central, 1×/signalId, ~6 s, fechável. */}
        {overlaySignal && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
            <div
              className={cn(
                "pointer-events-auto w-full max-w-lg rounded-lg border-2 bg-background/95 p-4 shadow-2xl",
                overlaySignal.direction === "COMPRA" ? "border-bull" : "border-bear",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-display text-2xl font-bold">
                  ENTRADA CONFIRMADA —{" "}
                  <span
                    className={overlaySignal.direction === "COMPRA" ? "text-bull" : "text-bear"}
                  >
                    {overlaySignal.direction}
                  </span>
                </p>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={() => setOverlaySignal(null)}
                  aria-label="Fechar alerta"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm sm:grid-cols-5">
                <OverlayField
                  label="ENTRADA"
                  value={formatManagedPrice(overlaySignal.entry, tickSize, decimals)}
                  tone="bull"
                />
                <OverlayField
                  label="STOP"
                  value={formatManagedPrice(overlaySignal.initialStop, tickSize, decimals)}
                  tone="bear"
                />
                <OverlayField
                  label="3R"
                  value={formatManagedPrice(overlaySignal.threeR, tickSize, decimals)}
                  tone="bull"
                />
                <OverlayField
                  label="5R"
                  value={formatManagedPrice(overlaySignal.fiveR, tickSize, decimals)}
                  tone="bull"
                />
                <OverlayField label="RUNNER" value="ESTRUTURAL" />
              </div>
              <p className="mt-2 font-mono text-[10px] text-muted-foreground">
                {overlaySignal.signalId} · snapshot congelado
              </p>
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-1.5">
        <p className="text-[10px] text-muted-foreground">
          Preview da janela selecionada — mesma stream global; trocar de rota não interrompe a
          leitura.
        </p>
        <Badge variant="outline" className="font-mono text-[10px]">
          {status === "capturando" ? "AO VIVO" : status.toUpperCase()}
        </Badge>
      </div>
    </Card>
  );
}

function Chip({ children, tone }: { children: React.ReactNode; tone?: "bull" | "warn" }) {
  return (
    <span
      className={cn(
        "rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white/90",
        tone === "bull" && "text-bull",
        tone === "warn" && "bg-warn/30 text-warn",
      )}
    >
      {children}
    </span>
  );
}

function OverlayField({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "bull" | "bear";
}) {
  return (
    <div>
      <p className="text-[9px] tracking-widest text-muted-foreground">{label}</p>
      <p
        className={cn("font-bold", tone === "bull" && "text-bull", tone === "bear" && "text-bear")}
      >
        {value}
      </p>
    </div>
  );
}
