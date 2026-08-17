import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  X,
  FlipHorizontal2,
  Type,
  Gauge,
  Trash2,
  Maximize2,
  Keyboard,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/teleprompter")({
  component: TeleprompterPage,
});

const STORAGE_KEY = "deividtech:teleprompter";

/** Palavras por minuto usadas para estimar a duração da leitura. */
const WORDS_PER_MINUTE = 150;

const SPEED_MIN = 10;
const SPEED_MAX = 220;
const FONT_MIN = 24;
const FONT_MAX = 96;

interface TeleprompterSettings {
  /** Texto do roteiro. */
  script: string;
  /** Velocidade da rolagem automática em pixels por segundo. */
  speed: number;
  /** Tamanho da fonte no modo apresentação, em pixels. */
  fontSize: number;
  /** Espelhamento horizontal (para uso com vidro/beam splitter). */
  mirrored: boolean;
}

const DEFAULT_SETTINGS: TeleprompterSettings = {
  script: "",
  speed: 45,
  fontSize: 52,
  mirrored: false,
};

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Lê o roteiro salvo. Aceita o formato antigo (texto puro) e o atual (JSON). */
function loadSettings(): TeleprompterSettings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };

    if (!raw.trimStart().startsWith("{")) {
      return { ...DEFAULT_SETTINGS, script: raw };
    }

    const parsed = JSON.parse(raw) as Partial<TeleprompterSettings>;
    return {
      script: typeof parsed.script === "string" ? parsed.script : DEFAULT_SETTINGS.script,
      speed: clamp(Number(parsed.speed ?? DEFAULT_SETTINGS.speed), SPEED_MIN, SPEED_MAX),
      fontSize: clamp(Number(parsed.fontSize ?? DEFAULT_SETTINGS.fontSize), FONT_MIN, FONT_MAX),
      mirrored: parsed.mirrored === true,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings: TeleprompterSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Armazenamento indisponível (modo privado / cota cheia): o app segue funcionando em memória.
  }
}

function formatDuration(totalSeconds: number) {
  const safe = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function TeleprompterPage() {
  const [script, setScript] = useState(DEFAULT_SETTINGS.script);
  const [speed, setSpeed] = useState(DEFAULT_SETTINGS.speed);
  const [fontSize, setFontSize] = useState(DEFAULT_SETTINGS.fontSize);
  const [mirrored, setMirrored] = useState(DEFAULT_SETTINGS.mirrored);

  const [isPresenting, setIsPresenting] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRestored, setIsRestored] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const offsetRef = useRef(0);
  const userScrolledRef = useRef(false);
  const hasRestoredRef = useRef(false);

  // Restaura o roteiro e as preferências salvas (somente no cliente).
  useEffect(() => {
    const stored = loadSettings();
    setScript(stored.script);
    setSpeed(stored.speed);
    setFontSize(stored.fontSize);
    setMirrored(stored.mirrored);
    hasRestoredRef.current = true;
    setIsRestored(true);
  }, []);

  // Persiste qualquer alteração depois que o estado inicial foi restaurado.
  useEffect(() => {
    if (!hasRestoredRef.current) return;
    saveSettings({ script, speed, fontSize, mirrored });
  }, [script, speed, fontSize, mirrored]);

  const stats = useMemo(() => {
    const trimmed = script.trim();
    const words = trimmed ? trimmed.split(/\s+/).length : 0;
    return {
      words,
      chars: script.length,
      lines: trimmed ? trimmed.split(/\n/).length : 0,
      seconds: (words / WORDS_PER_MINUTE) * 60,
    };
  }, [script]);

  const updateProgressBar = useCallback(() => {
    const el = scrollRef.current;
    const bar = progressRef.current;
    if (!el || !bar) return;
    const max = el.scrollHeight - el.clientHeight;
    const pct = max > 0 ? (el.scrollTop / max) * 100 : 0;
    bar.style.width = `${clamp(pct, 0, 100)}%`;
  }, []);

  const stopPresentation = useCallback(() => {
    setIsPresenting(false);
    setIsPlaying(false);
    if (typeof document !== "undefined" && document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {
        // Sair da tela cheia pode ser negado pelo navegador; o overlay já foi fechado.
      });
    }
  }, []);

  const startPresentation = useCallback(async () => {
    if (!script.trim()) {
      toast.error("Escreva o roteiro antes de iniciar a apresentação.");
      return;
    }
    offsetRef.current = 0;
    lastFrameRef.current = null;
    setIsPresenting(true);
    setIsPlaying(true);

    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Tela cheia nativa negada: o modo apresentação continua em overlay sobre a página.
    }
  }, [script]);

  const restart = useCallback(() => {
    offsetRef.current = 0;
    lastFrameRef.current = null;
    userScrolledRef.current = false;
    const el = scrollRef.current;
    if (el) el.scrollTop = 0;
    updateProgressBar();
  }, [updateProgressBar]);

  // Rolagem automática: um único requestAnimationFrame por ciclo play/velocidade.
  useEffect(() => {
    if (!isPresenting || !isPlaying) return;

    const step = (timestamp: number) => {
      const el = scrollRef.current;
      if (!el) {
        rafRef.current = requestAnimationFrame(step);
        return;
      }

      if (lastFrameRef.current === null) lastFrameRef.current = timestamp;
      const delta = (timestamp - lastFrameRef.current) / 1000;
      lastFrameRef.current = timestamp;

      // Se o usuário rolou manualmente, o acumulador assume a posição real.
      if (userScrolledRef.current) {
        offsetRef.current = el.scrollTop;
        userScrolledRef.current = false;
      }

      const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
      offsetRef.current = Math.min(offsetRef.current + speed * delta, maxScroll);
      el.scrollTop = offsetRef.current;
      updateProgressBar();

      if (maxScroll > 0 && offsetRef.current >= maxScroll - 0.5) {
        setIsPlaying(false);
        return;
      }

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastFrameRef.current = null;
    };
  }, [isPresenting, isPlaying, speed, updateProgressBar]);

  // Atalhos de teclado do modo apresentação.
  useEffect(() => {
    if (!isPresenting) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        event.preventDefault();
        setIsPlaying((playing) => !playing);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        stopPresentation();
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSpeed((current) => clamp(current + 5, SPEED_MIN, SPEED_MAX));
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSpeed((current) => clamp(current - 5, SPEED_MIN, SPEED_MAX));
        return;
      }
      if (event.key === "r" || event.key === "R") {
        event.preventDefault();
        restart();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPresenting, stopPresentation, restart]);

  // Sair da tela cheia pelo navegador (Esc nativo / F11) encerra o modo apresentação.
  useEffect(() => {
    if (!isPresenting) return;

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setIsPresenting(false);
        setIsPlaying(false);
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [isPresenting]);

  // Ao abrir o overlay, começa do topo e zera a barra de progresso.
  useEffect(() => {
    if (!isPresenting) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = 0;
    offsetRef.current = 0;
    updateProgressBar();
  }, [isPresenting, updateProgressBar]);

  const handleClearScript = () => {
    if (!script) {
      toast.info("O roteiro já está vazio.");
      return;
    }
    setScript("");
    toast.success("Roteiro apagado.");
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-white">Teleprompter</h1>
        <p className="text-white/40 text-sm">
          Escreva o roteiro, ajuste ritmo e tipografia e apresente em tela cheia com rolagem
          automática.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-bold text-white">Roteiro</h2>
                <p className="text-[11px] text-white/40">
                  {isRestored
                    ? "Salvo automaticamente neste navegador."
                    : "Carregando roteiro salvo..."}
                </p>
              </div>
              <button
                type="button"
                onClick={handleClearScript}
                className="inline-flex items-center gap-2 rounded-full border border-white/5 px-4 py-2 text-[11px] font-bold text-white/40 transition-colors hover:border-rose-500/30 hover:text-rose-400"
              >
                <Trash2 className="h-3 w-3" /> Limpar
              </button>
            </div>

            <textarea
              value={script}
              onChange={(event) => setScript(event.target.value)}
              placeholder="Cole ou escreva aqui o texto que você vai ler durante a reunião..."
              spellCheck
              className="min-h-[380px] w-full resize-y rounded-xl border border-white/5 bg-black/40 p-4 text-sm leading-relaxed text-white outline-none transition-colors placeholder:text-white/20 focus:border-emerald-500/40"
            />

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] text-white/40">
              <span>{stats.words} palavras</span>
              <span>{stats.chars} caracteres</span>
              <span>{stats.lines} linhas</span>
              <span className="flex items-center gap-1.5 text-white/60">
                <Clock className="h-3 w-3" />
                {formatDuration(stats.seconds)} de leitura estimada
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void startPresentation()}
            disabled={!script.trim()}
            className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-white px-8 text-sm font-bold text-black shadow-[0_0_20px_rgba(255,255,255,0.12)] transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Maximize2 className="h-4 w-4" /> INICIAR APRESENTAÇÃO
          </button>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 space-y-6">
            <h2 className="text-sm font-bold text-white">Ajustes</h2>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-2 font-bold uppercase tracking-widest text-white/40">
                  <Gauge className="h-3 w-3" /> Velocidade
                </span>
                <span className="font-bold text-emerald-500">{speed} px/s</span>
              </div>
              <input
                type="range"
                min={SPEED_MIN}
                max={SPEED_MAX}
                step={5}
                value={speed}
                onChange={(event) => setSpeed(Number(event.target.value))}
                className="w-full accent-emerald-500"
                aria-label="Velocidade da rolagem"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-2 font-bold uppercase tracking-widest text-white/40">
                  <Type className="h-3 w-3" /> Tamanho da fonte
                </span>
                <span className="font-bold text-emerald-500">{fontSize} px</span>
              </div>
              <input
                type="range"
                min={FONT_MIN}
                max={FONT_MAX}
                step={2}
                value={fontSize}
                onChange={(event) => setFontSize(Number(event.target.value))}
                className="w-full accent-emerald-500"
                aria-label="Tamanho da fonte"
              />
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={mirrored}
              onClick={() => setMirrored((current) => !current)}
              className="flex w-full items-center justify-between rounded-xl border border-white/5 bg-black/30 p-3 text-left transition-colors hover:bg-white/[0.04]"
            >
              <span className="flex items-center gap-2 text-[12px] font-medium text-white">
                <FlipHorizontal2 className="h-3.5 w-3.5 text-white/40" /> Espelhar texto
              </span>
              <span
                className={cn(
                  "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                  mirrored ? "bg-emerald-500" : "bg-white/10",
                )}
              >
                <span
                  className={cn(
                    "absolute top-[2px] h-4 w-4 rounded-full bg-white transition-transform",
                    mirrored ? "translate-x-[18px]" : "translate-x-[2px]",
                  )}
                />
              </span>
            </button>
          </div>

          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-bold text-white">
              <Keyboard className="h-3.5 w-3.5 text-white/40" /> Atalhos
            </h2>
            <ul className="space-y-2 text-[11px] text-white/40">
              {[
                ["Espaço", "Iniciar / pausar"],
                ["Esc", "Sair da apresentação"],
                ["↑ / ↓", "Ajustar velocidade"],
                ["R", "Reiniciar do topo"],
              ].map(([key, description]) => (
                <li key={key} className="flex items-center justify-between gap-3">
                  <kbd className="rounded-md border border-white/10 bg-white/5 px-2 py-1 font-mono text-[10px] text-white/60">
                    {key}
                  </kbd>
                  <span>{description}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {isPresenting && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-black">
          <div className="h-0.5 w-full bg-white/5">
            <div ref={progressRef} className="h-full bg-emerald-500" style={{ width: "0%" }} />
          </div>

          <div
            ref={scrollRef}
            onWheel={() => {
              userScrolledRef.current = true;
            }}
            onScroll={updateProgressBar}
            className="relative flex-1 overflow-y-auto px-6 md:px-20"
            style={{ scrollbarWidth: "none" }}
          >
            {/* Guia de leitura fixa a ~35% da altura da tela. */}
            <div
              className="pointer-events-none fixed inset-x-0 top-[35vh] z-10 border-t border-emerald-500/20"
              aria-hidden
            />

            <div
              className="mx-auto max-w-5xl"
              style={{ transform: mirrored ? "scaleX(-1)" : undefined }}
            >
              <div style={{ height: "40vh" }} aria-hidden />
              <p
                className="whitespace-pre-wrap font-bold leading-[1.5] text-white"
                style={{ fontSize: `${fontSize}px` }}
              >
                {script}
              </p>
              <div style={{ height: "60vh" }} aria-hidden />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 border-t border-white/5 bg-black/90 px-6 py-4 backdrop-blur">
            <button
              type="button"
              onClick={() => setIsPlaying((playing) => !playing)}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-6 text-xs font-bold text-black transition-colors hover:bg-white/90"
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {isPlaying ? "PAUSAR" : "REPRODUZIR"}
            </button>

            <button
              type="button"
              onClick={restart}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-white/10 px-5 text-xs font-bold text-white/60 transition-colors hover:bg-white/5 hover:text-white"
            >
              <RotateCcw className="h-3.5 w-3.5" /> REINICIAR
            </button>

            <div className="flex items-center gap-2 rounded-full border border-white/10 px-4 py-2">
              <Gauge className="h-3.5 w-3.5 text-white/40" />
              <input
                type="range"
                min={SPEED_MIN}
                max={SPEED_MAX}
                step={5}
                value={speed}
                onChange={(event) => setSpeed(Number(event.target.value))}
                className="w-28 accent-emerald-500"
                aria-label="Velocidade da rolagem"
              />
              <span className="w-14 text-[11px] font-bold text-white/60">{speed} px/s</span>
            </div>

            <div className="flex items-center gap-2 rounded-full border border-white/10 px-4 py-2">
              <Type className="h-3.5 w-3.5 text-white/40" />
              <input
                type="range"
                min={FONT_MIN}
                max={FONT_MAX}
                step={2}
                value={fontSize}
                onChange={(event) => setFontSize(Number(event.target.value))}
                className="w-24 accent-emerald-500"
                aria-label="Tamanho da fonte"
              />
              <span className="w-12 text-[11px] font-bold text-white/60">{fontSize}px</span>
            </div>

            <button
              type="button"
              onClick={() => setMirrored((current) => !current)}
              aria-pressed={mirrored}
              className={cn(
                "inline-flex h-11 items-center gap-2 rounded-full border px-5 text-xs font-bold transition-colors",
                mirrored
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                  : "border-white/10 text-white/60 hover:bg-white/5 hover:text-white",
              )}
            >
              <FlipHorizontal2 className="h-3.5 w-3.5" /> ESPELHAR
            </button>

            <button
              type="button"
              onClick={stopPresentation}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-white/10 px-5 text-xs font-bold text-white/60 transition-colors hover:border-rose-500/30 hover:text-rose-400"
            >
              <X className="h-3.5 w-3.5" /> SAIR (ESC)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
