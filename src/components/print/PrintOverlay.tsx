import { useEffect, useId, useMemo, useRef, useState } from "react";

import {
  ROLE_COLOR,
  type AnnotationRole,
  type PrintAnnotation,
} from "@/lib/printAnalysis/contract";
import {
  annotationToBox,
  annotationToPixels,
  unitsPerRenderedPixel,
} from "@/lib/printAnalysis/geometry";
import { cn } from "@/lib/utils";

/**
 * OVERLAY SVG SOBRE O PRINT.
 *
 * A imagem original NUNCA é alterada: ela fica em uma <img> intacta e o SVG
 * vive por cima, no mesmo box, com o MESMO viewBox das dimensões naturais da
 * imagem. As coordenadas chegam normalizadas (0..1) e são multiplicadas por
 * largura/altura reais — o desenho cai exatamente sobre o candle, e continua
 * caindo depois de qualquer resize, porque o viewBox escala junto.
 *
 * Traços e textos usam `non-scaling-stroke` e um fator de escala medido em
 * tempo real, para permanecerem legíveis tanto em 4K quanto no celular sem
 * engordar sobre o gráfico.
 */

const LABEL: Record<AnnotationRole, string> = {
  ENTRY: "ENTRADA",
  ENTRY_ZONE: "ZONA",
  STOP: "STOP",
  TARGET_1: "ALVO 1",
  TARGET_2: "ALVO 2",
  TARGET_EXTRA: "ALVO",
  INVALIDATION: "INVALIDAÇÃO",
  SUPPORT: "SUPORTE",
  RESISTANCE: "RESISTÊNCIA",
  BREAKOUT: "ROMPIMENTO",
  PULLBACK: "PULLBACK",
  SCENARIO_UP: "CENÁRIO ALTA",
  SCENARIO_DOWN: "CENÁRIO BAIXA",
  T4_PAST: "T4",
  NOTE: "NOTA",
};

export { LABEL as ANNOTATION_ROLE_LABEL };

export interface PrintOverlayProps {
  annotations: PrintAnnotation[];
  /** Dimensões naturais da imagem — base do viewBox. */
  naturalWidth: number;
  naturalHeight: number;
  hiddenRoles?: Set<AnnotationRole>;
  selectedId?: string | null;
  onSelect?: (annotation: PrintAnnotation) => void;
  className?: string;
}

export function PrintOverlay({
  annotations,
  naturalWidth,
  naturalHeight,
  hiddenRoles,
  selectedId,
  onSelect,
  className,
}: PrintOverlayProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const ref = useRef<SVGSVGElement | null>(null);
  const width = Math.max(1, naturalWidth);
  const height = Math.max(1, naturalHeight);
  // Escala = unidades de usuário por pixel na tela. Mantém texto com tamanho
  // constante mesmo com a imagem reduzida.
  const [unitsPerPixel, setUnitsPerPixel] = useState(1);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const rendered = entries[0]?.contentRect.width ?? 0;
      if (rendered > 0) setUnitsPerPixel(unitsPerRenderedPixel(width, rendered));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [width]);

  const visible = useMemo(
    () => annotations.filter((item) => !hiddenRoles?.has(item.role)),
    [annotations, hiddenRoles],
  );
  const roles = useMemo(() => [...new Set(visible.map((item) => item.role))], [visible]);
  const fontSize = 12 * unitsPerPixel;

  return (
    <svg
      ref={ref}
      className={cn("pointer-events-none absolute inset-0 h-full w-full", className)}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Marcações da análise T4 sobre o print"
    >
      <defs>
        {roles.map((role) => (
          <marker
            key={role}
            id={`arrow-${uid}-${role}`}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={ROLE_COLOR[role]} />
          </marker>
        ))}
      </defs>

      {visible.map((item) => (
        <Shape
          key={item.id}
          annotation={item}
          uid={uid}
          width={width}
          height={height}
          fontSize={fontSize}
          unitsPerPixel={unitsPerPixel}
          selected={selectedId === item.id}
          onSelect={onSelect}
        />
      ))}
    </svg>
  );
}

function Shape({
  annotation,
  uid,
  width,
  height,
  fontSize,
  unitsPerPixel,
  selected,
  onSelect,
}: {
  annotation: PrintAnnotation;
  uid: string;
  width: number;
  height: number;
  fontSize: number;
  unitsPerPixel: number;
  selected: boolean;
  onSelect?: (annotation: PrintAnnotation) => void;
}) {
  const color = ROLE_COLOR[annotation.role];
  const stroke = selected ? 3 : 2;
  const dashed = annotation.role === "INVALIDATION" || annotation.role.startsWith("SCENARIO");
  const handlers = onSelect
    ? { className: "pointer-events-auto cursor-pointer", onClick: () => onSelect(annotation) }
    : {};

  const { x1, y1, x2, y2 } = annotationToPixels(annotation, width, height);
  const text = annotation.index
    ? `${LABEL[annotation.role]} #${annotation.index}`
    : annotation.label;

  if (annotation.shape === "ZONE") {
    const box = annotationToBox(annotation, width, height);
    const { x, y } = box;
    return (
      <g {...handlers}>
        <rect
          x={box.x}
          y={box.y}
          width={box.width}
          height={box.height}
          fill={color}
          fillOpacity={selected ? 0.3 : 0.16}
          stroke={color}
          strokeWidth={stroke}
          vectorEffect="non-scaling-stroke"
        />
        <OverlayText x={x} y={y} text={text} color={color} anchor="start" fontSize={fontSize} />
      </g>
    );
  }

  if (annotation.shape === "MARKER") {
    // Triângulo — usado para as ocorrências T4 anteriores (roxo).
    const size = 10 * unitsPerPixel;
    const points = `${x1},${y1 - size} ${x1 - size},${y1 + size} ${x1 + size},${y1 + size}`;
    return (
      <g {...handlers}>
        <polygon
          points={points}
          fill={color}
          fillOpacity={selected ? 1 : 0.9}
          stroke="rgba(0,0,0,0.7)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        <OverlayText
          x={x1}
          y={y1 - size}
          text={text}
          color={color}
          anchor="middle"
          fontSize={fontSize}
        />
      </g>
    );
  }

  return (
    <g {...handlers}>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={dashed ? `${8 * unitsPerPixel} ${6 * unitsPerPixel}` : undefined}
        vectorEffect="non-scaling-stroke"
        markerEnd={
          annotation.shape === "ARROW" ? `url(#arrow-${uid}-${annotation.role})` : undefined
        }
      />
      <OverlayText
        x={Math.min(x1, x2)}
        y={Math.min(y1, y2)}
        text={text}
        color={color}
        anchor="start"
        fontSize={fontSize}
      />
    </g>
  );
}

/**
 * Texto com halo escuro — legível sobre qualquer cor de gráfico (requisito 9).
 * `paint-order: stroke` desenha o contorno antes do preenchimento, então o
 * halo nunca come a letra.
 */
function OverlayText({
  x,
  y,
  text,
  color,
  anchor,
  fontSize,
}: {
  x: number;
  y: number;
  text: string;
  color: string;
  anchor: "start" | "middle";
  fontSize: number;
}) {
  const clipped = text.length > 30 ? `${text.slice(0, 29)}…` : text;
  return (
    <text
      x={x}
      y={Math.max(fontSize, y - fontSize * 0.4)}
      textAnchor={anchor}
      fill={color}
      stroke="rgba(0,0,0,0.75)"
      strokeWidth={3}
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
      style={{ fontSize, fontWeight: 700, paintOrder: "stroke", fontFamily: "inherit" }}
    >
      {clipped}
    </text>
  );
}
