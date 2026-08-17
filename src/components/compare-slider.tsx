import { useRef, useState } from "react";

// Slider de comparação Antes/Depois via clip-path.
export function CompareSlider({
  beforeSrc,
  afterSrc,
  beforeLabel = "Antes",
  afterLabel = "Depois",
  className = "",
}: {
  beforeSrc: string;
  afterSrc: string;
  beforeLabel?: string;
  afterLabel?: string;
  className?: string;
}) {
  const [pct, setPct] = useState(50);
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  function onMove(clientX: number) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const p = Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100));
    setPct(p);
  }

  return (
    <div
      ref={ref}
      className={`relative select-none overflow-hidden rounded-md border border-border ${className}`}
      onMouseDown={(e) => {
        dragging.current = true;
        onMove(e.clientX);
      }}
      onMouseMove={(e) => dragging.current && onMove(e.clientX)}
      onMouseUp={() => (dragging.current = false)}
      onMouseLeave={() => (dragging.current = false)}
      onTouchStart={(e) => {
        dragging.current = true;
        onMove(e.touches[0].clientX);
      }}
      onTouchMove={(e) => dragging.current && onMove(e.touches[0].clientX)}
      onTouchEnd={() => (dragging.current = false)}
    >
      <img
        src={afterSrc}
        alt={afterLabel}
        className="block w-full object-cover"
        draggable={false}
      />
      <img
        src={beforeSrc}
        alt={beforeLabel}
        className="absolute inset-0 block h-full w-full object-cover"
        style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }}
        draggable={false}
      />
      <div
        className="pointer-events-none absolute top-0 h-full w-0.5 bg-neon shadow-[0_0_10px_var(--neon,#00ff88)]"
        style={{ left: `calc(${pct}% - 1px)` }}
      />
      <div
        className="pointer-events-none absolute top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-neon text-black shadow-lg"
        style={{ left: `${pct}%` }}
      >
        <span className="text-[10px] font-bold">◄►</span>
      </div>
      <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 font-display text-[10px] uppercase tracking-widest text-white">
        {beforeLabel}
      </span>
      <span className="absolute right-2 top-2 rounded bg-black/70 px-1.5 py-0.5 font-display text-[10px] uppercase tracking-widest text-neon">
        {afterLabel}
      </span>
    </div>
  );
}
