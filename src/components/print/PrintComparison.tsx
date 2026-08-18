import { useRef, useState } from "react";
import { Columns2, Layers, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PrintOverlay } from "./PrintOverlay";
import type { AnnotationRole, PrintAnnotation } from "@/lib/printAnalysis/contract";
import { cn } from "@/lib/utils";

/**
 * ORIGINAL × ANALISADO.
 *
 * Três modos: lado a lado, alternar e slider antes/depois. Em todos eles o
 * print original permanece intacto — o que muda é apenas a visibilidade do
 * overlay SVG desenhado por cima. O zoom é sincronizado por construção: as
 * duas visões usam a mesma imagem e o mesmo box, então ampliar o container
 * amplia as duas juntas.
 */

export type ComparisonMode = "SIDE" | "TOGGLE" | "SLIDER";

export function PrintComparison({
  imageDataUrl,
  naturalWidth,
  naturalHeight,
  annotations,
  hiddenRoles,
  selectedId,
  onSelect,
  zoom = 1,
}: {
  imageDataUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  annotations: PrintAnnotation[];
  hiddenRoles?: Set<AnnotationRole>;
  selectedId?: string | null;
  onSelect?: (annotation: PrintAnnotation) => void;
  zoom?: number;
}) {
  const [mode, setMode] = useState<ComparisonMode>("SLIDER");
  const [showOverlay, setShowOverlay] = useState(true);
  const [split, setSplit] = useState(55);
  const sliderRef = useRef<HTMLDivElement | null>(null);

  const frame = (children: React.ReactNode, key?: string) => (
    <div
      key={key}
      className="relative w-full overflow-hidden rounded-md border border-border/60 bg-black"
      style={{ aspectRatio: `${naturalWidth} / ${naturalHeight}` }}
    >
      {children}
    </div>
  );

  const image = (label: string) => (
    <>
      <img
        src={imageDataUrl}
        alt={label}
        className="absolute inset-0 h-full w-full object-contain"
        draggable={false}
      />
      <span className="absolute left-2 top-2 z-10 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] tracking-widest text-white">
        {label}
      </span>
    </>
  );

  const overlay = (
    <PrintOverlay
      annotations={annotations}
      naturalWidth={naturalWidth}
      naturalHeight={naturalHeight}
      hiddenRoles={hiddenRoles}
      selectedId={selectedId}
      onSelect={onSelect}
    />
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <ModeButton
          active={mode === "SIDE"}
          onClick={() => setMode("SIDE")}
          icon={<Columns2 className="h-3.5 w-3.5" />}
        >
          Lado a lado
        </ModeButton>
        <ModeButton
          active={mode === "TOGGLE"}
          onClick={() => setMode("TOGGLE")}
          icon={<Layers className="h-3.5 w-3.5" />}
        >
          Alternar
        </ModeButton>
        <ModeButton
          active={mode === "SLIDER"}
          onClick={() => setMode("SLIDER")}
          icon={<SlidersHorizontal className="h-3.5 w-3.5" />}
        >
          Antes/depois
        </ModeButton>
        {mode === "TOGGLE" && (
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            onClick={() => setShowOverlay((v) => !v)}
          >
            {showOverlay ? "Ver original" : "Ver analisado"}
          </Button>
        )}
      </div>

      <div style={{ width: `${zoom * 100}%`, maxWidth: zoom > 1 ? "none" : "100%" }}>
        {mode === "SIDE" && (
          // Empilha no celular (abas visuais) e divide no desktop.
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {frame(image("ORIGINAL"), "orig")}
            {frame(
              <>
                {image("ANALISADO")}
                {overlay}
              </>,
              "an",
            )}
          </div>
        )}

        {mode === "TOGGLE" &&
          frame(
            <>
              {image(showOverlay ? "ANALISADO" : "ORIGINAL")}
              {showOverlay && overlay}
            </>,
          )}

        {mode === "SLIDER" && (
          <div ref={sliderRef} className="relative">
            {frame(
              <>
                {image("ORIGINAL")}
                {/* Metade direita revelada com o overlay, recortada pelo split. */}
                <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${split}%)` }}>
                  <img
                    src={imageDataUrl}
                    alt="Print analisado"
                    className="absolute inset-0 h-full w-full object-contain"
                    draggable={false}
                  />
                  {overlay}
                  <span className="absolute right-2 top-2 z-10 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] tracking-widest text-white">
                    ANALISADO
                  </span>
                </div>
                <div
                  className="pointer-events-none absolute inset-y-0 z-20 w-0.5 bg-primary"
                  style={{ left: `${split}%` }}
                />
              </>,
            )}
            <input
              type="range"
              min={0}
              max={100}
              value={split}
              aria-label="Comparar original e analisado"
              onChange={(event) => setSplit(Number(event.target.value))}
              className="mt-2 w-full accent-primary"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Button
      size="sm"
      variant={active ? "default" : "outline"}
      className={cn("h-7 text-[11px]", active && "font-semibold")}
      onClick={onClick}
    >
      <span className="mr-1.5">{icon}</span>
      {children}
    </Button>
  );
}
