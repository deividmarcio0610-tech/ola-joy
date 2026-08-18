import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, SkipBack } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Candle } from "@/lib/engines/types";
import type { T4Trade } from "@/lib/t4/validation/types";
import { cn } from "@/lib/utils";

/**
 * REPLAY CANDLE A CANDLE (requisito 15).
 *
 * O gráfico desenha SOMENTE os candles até o cursor. O futuro não é
 * renderizado com opacidade baixa nem "esmaecido" — ele simplesmente não
 * existe na tela, porque um replay que deixa o futuro visível não é replay,
 * é conferência de gabarito.
 *
 * Entradas históricas reais aparecem como TRIÂNGULO ROXO no candle da decisão,
 * e só a partir do momento em que a decisão aconteceu. Clicar abre os detalhes
 * completos da operação.
 */

export const T4_PAST_COLOR = "#a855f7";

export function TradeReplay({
  candles,
  trades,
  onSelectTrade,
}: {
  candles: Candle[];
  trades: T4Trade[];
  onSelectTrade?: (trade: T4Trade) => void;
}) {
  const ordered = useMemo(() => candles.slice().sort((a, b) => a.t - b.t), [candles]);
  const [cursor, setCursor] = useState(Math.min(60, Math.max(0, ordered.length - 1)));
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(8);
  const [selected, setSelected] = useState<T4Trade | null>(null);
  const timer = useRef<number | null>(null);

  // Série trocou: o cursor antigo não corresponde mais a nada.
  useEffect(() => {
    setCursor(Math.min(60, Math.max(0, ordered.length - 1)));
    setPlaying(false);
    setSelected(null);
  }, [ordered]);

  useEffect(() => {
    if (!playing) return;
    timer.current = window.setInterval(
      () => {
        setCursor((current) => {
          if (current >= ordered.length - 1) {
            setPlaying(false);
            return current;
          }
          return current + 1;
        });
      },
      Math.max(16, 1000 / speed),
    );
    return () => {
      if (timer.current !== null) window.clearInterval(timer.current);
    };
  }, [playing, speed, ordered.length]);

  const visible = ordered.slice(0, cursor + 1);
  const currentAt = ordered[cursor]?.t ?? 0;

  // Só as entradas JÁ decididas até o cursor. Mostrar as futuras revelaria o
  // gabarito e destruiria o sentido do replay.
  const revealed = useMemo(
    () => trades.filter((trade) => trade.outcome === "EXECUTED" && trade.decidedAt <= currentAt),
    [trades, currentAt],
  );

  if (ordered.length === 0) {
    return (
      <Card className="border-border/70 bg-panel p-6">
        <p className="text-center text-xs text-muted-foreground">
          Carregue a série de candles do run para reproduzir a leitura.
        </p>
      </Card>
    );
  }

  return (
    <Card className="border-border/70 bg-panel p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-medium tracking-widest text-muted-foreground">
          REPLAY CANDLE A CANDLE
        </p>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="font-mono text-[10px]"
            style={{ borderColor: T4_PAST_COLOR, color: T4_PAST_COLOR }}
          >
            ▲ {revealed.length} ENTRADA(S) REAL(IS)
          </Badge>
          <span className="font-mono text-[10px] text-muted-foreground">
            {cursor + 1} / {ordered.length}
          </span>
        </div>
      </div>

      <CandleChart
        candles={visible}
        trades={revealed}
        selectedId={selected?.tradeId ?? null}
        onSelect={(trade) => {
          setSelected(trade);
          onSelectTrade?.(trade);
        }}
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          size="icon"
          variant="outline"
          className="h-7 w-7"
          aria-label="Voltar ao início"
          onClick={() => {
            setPlaying(false);
            setCursor(0);
          }}
        >
          <SkipBack className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="outline"
          className="h-7 w-7"
          aria-label="Candle anterior"
          onClick={() => {
            setPlaying(false);
            setCursor((current) => Math.max(0, current - 1));
          }}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant={playing ? "default" : "outline"}
          className="h-7 w-7"
          aria-label={playing ? "Pausar" : "Reproduzir"}
          onClick={() => setPlaying((value) => !value)}
        >
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </Button>
        <Button
          size="icon"
          variant="outline"
          className="h-7 w-7"
          aria-label="Próximo candle"
          onClick={() => {
            setPlaying(false);
            setCursor((current) => Math.min(ordered.length - 1, current + 1));
          }}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>

        <input
          type="range"
          min={0}
          max={ordered.length - 1}
          value={cursor}
          aria-label="Posição do replay"
          onChange={(event) => {
            setPlaying(false);
            setCursor(Number(event.target.value));
          }}
          className="min-w-40 flex-1 accent-primary"
        />

        <select
          value={speed}
          onChange={(event) => setSpeed(Number(event.target.value))}
          aria-label="Velocidade do replay"
          className="h-7 rounded border border-border bg-background px-1 font-mono text-[10px]"
        >
          {[2, 4, 8, 16, 32].map((value) => (
            <option key={value} value={value}>
              {value}x
            </option>
          ))}
        </select>
      </div>

      <p className="mt-1 font-mono text-[10px] text-muted-foreground">
        {new Date(currentAt).toLocaleString("pt-BR")} · o gráfico mostra apenas o que já aconteceu
        até este candle.
      </p>

      {selected && <TradeDetail trade={selected} onClose={() => setSelected(null)} />}
    </Card>
  );
}

function CandleChart({
  candles,
  trades,
  selectedId,
  onSelect,
}: {
  candles: Candle[];
  trades: T4Trade[];
  selectedId: string | null;
  onSelect: (trade: T4Trade) => void;
}) {
  const width = 900;
  const height = 260;
  // Janela deslizante: os últimos 120 candles ficam legíveis mesmo em séries
  // longas, sem esconder que o passado existe.
  const window = candles.slice(-120);
  if (window.length === 0) return null;

  const high = Math.max(...window.map((candle) => candle.h));
  const low = Math.min(...window.map((candle) => candle.l));
  const span = high - low || 1;
  const step = width / Math.max(1, window.length);
  const bodyWidth = Math.max(1, step * 0.6);
  const x = (index: number) => index * step + step / 2;
  const y = (price: number) => height - ((price - low) / span) * height;

  const indexByTime = new Map(window.map((candle, index) => [candle.t, index]));

  return (
    <div className="mt-2 overflow-x-auto rounded border border-border/60 bg-black/40">
      <svg
        viewBox={`0 0 ${width} ${height + 26}`}
        className="h-64 w-full"
        role="img"
        aria-label="Replay do gráfico"
      >
        {window.map((candle, index) => {
          const bull = candle.c >= candle.o;
          const color = bull ? "#22c55e" : "#ef4444";
          return (
            <g key={candle.t}>
              <line
                x1={x(index)}
                y1={y(candle.h)}
                x2={x(index)}
                y2={y(candle.l)}
                stroke={color}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <rect
                x={x(index) - bodyWidth / 2}
                y={y(Math.max(candle.o, candle.c))}
                width={bodyWidth}
                height={Math.max(1, Math.abs(y(candle.o) - y(candle.c)))}
                fill={color}
              />
            </g>
          );
        })}

        {/* TRIÂNGULO ROXO — entrada histórica real da técnica. */}
        {trades.map((trade) => {
          const index = indexByTime.get(trade.decidedAt);
          if (index === undefined) return null;
          const px = x(index);
          const py = y(trade.entryPrice);
          const size = 7;
          const up = trade.direction === "COMPRA";
          const points = up
            ? `${px},${py + size + 6} ${px - size},${py + size * 2 + 6} ${px + size},${py + size * 2 + 6}`
            : `${px},${py - size - 6} ${px - size},${py - size * 2 - 6} ${px + size},${py - size * 2 - 6}`;
          return (
            <polygon
              key={trade.tradeId}
              points={points}
              fill={T4_PAST_COLOR}
              fillOpacity={selectedId === trade.tradeId ? 1 : 0.85}
              stroke={selectedId === trade.tradeId ? "#ffffff" : "rgba(0,0,0,0.6)"}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              className="cursor-pointer"
              onClick={() => onSelect(trade)}
            >
              <title>
                {`${trade.direction} · ${new Date(trade.decidedAt).toLocaleString("pt-BR")} · confluência ${trade.confluenceAtEntry.toFixed(0)}%`}
              </title>
            </polygon>
          );
        })}
      </svg>
    </div>
  );
}

/** DETALHES COMPLETOS da operação — tudo que foi registrado, nada resumido. */
function TradeDetail({ trade, onClose }: { trade: T4Trade; onClose: () => void }) {
  return (
    <div className="mt-3 rounded border border-border/60 bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-display text-sm font-bold">
          <span style={{ color: T4_PAST_COLOR }}>▲</span>{" "}
          <span className={trade.direction === "COMPRA" ? "text-bull" : "text-bear"}>
            {trade.direction}
          </span>{" "}
          · {new Date(trade.decidedAt).toLocaleString("pt-BR")}
        </p>
        <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={onClose}>
          Fechar
        </Button>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px] md:grid-cols-4">
        <Field label="CONFLUÊNCIA" value={`${trade.confluenceAtEntry.toFixed(0)}%`} />
        <Field
          label="RESULTADO"
          value={trade.result ?? "—"}
          tone={trade.result === "WIN" ? "bull" : trade.result === "LOSS" ? "bear" : undefined}
        />
        <Field
          label="R LÍQUIDO"
          value={trade.resultR === null ? "—" : `${trade.resultR.toFixed(3)}R`}
          tone={trade.resultR && trade.resultR > 0 ? "bull" : "bear"}
        />
        <Field label="SPLIT" value={trade.dataset} />
        <Field label="ENTRADA" value={trade.entryPrice.toFixed(1)} />
        <Field label="STOP" value={trade.stopPrice.toFixed(1)} tone="bear" />
        <Field label="ALVO" value={trade.targetPrice.toFixed(1)} tone="bull" />
        <Field label="SAÍDA" value={trade.exitPrice === null ? "—" : trade.exitPrice.toFixed(1)} />
        <Field label="RISCO (pts)" value={trade.riskPoints.toFixed(1)} />
        <Field label="MFE" value={trade.mfeR === null ? "—" : `${trade.mfeR.toFixed(2)}R`} />
        <Field label="MAE" value={trade.maeR === null ? "—" : `${trade.maeR.toFixed(2)}R`} />
        <Field label="REGIME" value={trade.regime} />
        <Field label="SESSÃO" value={trade.session} />
        <Field label="ATIVO / TF" value={`${trade.symbol} ${trade.timeframe}`} />
        <Field label="VERSÃO" value={trade.strategyVersion} />
        <Field label="CONFIG" value={trade.configHash} />
      </div>

      <div className="mt-2 border-t border-border/40 pt-2">
        <p className="text-[9px] tracking-widest text-muted-foreground">CRITÉRIOS NA DECISÃO</p>
        <ul className="mt-1 flex flex-wrap gap-1">
          {trade.criteria.map((criterion) => (
            <li
              key={criterion.id}
              className={cn(
                "rounded border px-1.5 py-0.5 font-mono text-[10px]",
                criterion.confirmed
                  ? "border-bull/60 text-bull"
                  : criterion.pendingClose
                    ? "border-warn/60 text-warn"
                    : "border-border/60 text-muted-foreground",
              )}
              title={criterion.detail ?? undefined}
            >
              {criterion.confirmed ? "✓" : criterion.pendingClose ? "…" : "✗"} {criterion.label} (
              {criterion.weight})
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-2 text-[10px] text-muted-foreground">
        <span className="tracking-widest">ENTRADA:</span> {trade.entryReason}
      </p>
      {trade.exitReason && (
        <p className="text-[10px] text-muted-foreground">
          <span className="tracking-widest">SAÍDA:</span> {trade.exitReason}
        </p>
      )}
    </div>
  );
}

function Field({ label, value, tone }: { label: string; value: string; tone?: "bull" | "bear" }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[9px] tracking-widest text-muted-foreground">{label}</span>
      <span className={cn(tone === "bull" && "text-bull", tone === "bear" && "text-bear")}>
        {value}
      </span>
    </div>
  );
}
