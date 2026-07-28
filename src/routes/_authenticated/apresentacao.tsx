import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import cenaRealAsset from "@/assets/cena-real.jpg.asset.json";

import {
  Play,
  Pause,
  RotateCcw,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Film,
  Square as SquareIcon,
  Smartphone,
  Monitor,
  Sparkles,
  Loader2,
  Check,
  ClipboardList,
  AlertTriangle,
  LayoutGrid,
  ShieldCheck,
  BarChart3,
  FileSpreadsheet,
  FileImage,
  FileDown,
  Filter,
  Building2,
  Users,
  Calendar,
  MapPin,
  History,
  Upload,
  Camera,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/apresentacao")({
  head: () => ({
    meta: [
      { title: "Vídeo de Apresentação · ValeTech IA" },
      {
        name: "description",
        content:
          "Apresentação cinematográfica da plataforma ValeTech IA — inteligência artificial para engenharia e segurança do trabalho.",
      },
    ],
  }),
  component: ApresentacaoPage,
});

// ==========================================================
// Roteiro em 15 cenas — padrão multinacional (Autodesk/Siemens)
// ==========================================================
type Scene = {
  id: string;
  title: string;
  narration: string;
  duration: number;
};

const SCENES: Scene[] = [
  {
    id: "abertura",
    title: "Abertura",
    narration:
      "ValeTech IA. Inteligência artificial para engenharia e segurança do trabalho.",
    duration: 7.4,
  },
  {
    id: "dashboard",
    title: "Dashboard Executivo",
    narration:
      "Toda a gestão das inspeções começa em um único painel: inspeções, pendências, projetos, relatórios, conformidade e indicadores.",
    duration: 9.2,
  },
  {
    id: "nova-inspecao",
    title: "Nova Inspeção",
    narration:
      "Basta abrir uma nova inspeção em N3, Meio Ambiente, Kaizen ou Inspeção. Empresa, contrato, unidade, setor, responsável, data e turno são preenchidos automaticamente.",
    duration: 8.3,
  },
  {
    id: "upload",
    title: "Upload Inteligente",
    narration:
      "Selecione as fotografias. O upload é rápido, seguro e preparado para análise em lote.",
    duration: 6.5,
  },
  {
    id: "ia-analisando",
    title: "IA Analisando",
    narration:
      "Visão computacional analisando a foto real — cruzando NRs, riscos e prioridades em segundos, em N3, Meio Ambiente, Kaizen e Inspeção.",
    duration: 7.4,
  },
  {
    id: "resultado",
    title: "Resultado da Análise",
    narration:
      "Criticidade, score de risco, NRs envolvidas e tabela consolidada — tudo pronto para decisão. Quanto mais próximo de 100, maior o risco.",
    duration: 8.3,
  },
  {
    id: "projeto",
    title: "Melhorias Indicadas",
    narration:
      "A ValeTech IA não desenha o projeto — ela indica, sobre a foto, as melhorias necessárias: guarda-corpo, cones, área isolada, extintor, linha de vida, placa, demarcação e rota de fuga.",
    duration: 11.1,
  },

  {
    id: "memorial",
    title: "Memorial de Intervenções",
    narration:
      "Cada intervenção recebe número, norma, prioridade, responsável e prazo — memorial gerado automaticamente.",
    duration: 8.3,
  },
  {
    id: "relatorio",
    title: "Relatório PDF",
    narration:
      "Foto, projeto, intervenções, responsáveis e evidências consolidadas em um relatório rastreável — arquivo enviado com um clique.",
    duration: 7.4,
  },
  {
    id: "antes-executado",
    title: "Antes · Projeto · Executado",
    narration:
      "Comparação real entre a condição inicial, o projeto proposto e a evidência de execução.",
    duration: 9.2,
  },
  {
    id: "historico",
    title: "Histórico e Revisões",
    narration:
      "Cada projeto mantém suas revisões — Rev00, Rev01, Rev02 — com rastreabilidade completa.",
    duration: 6.5,
  },
  {
    id: "indicadores",
    title: "Indicadores de Segurança",
    narration:
      "NRs mais recorrentes, áreas críticas, tempo médio, correções executadas e evolução mensal — em gráficos animados.",
    duration: 9.2,
  },
  {
    id: "exportacoes",
    title: "Exportações",
    narration:
      "PDF, PNG, Excel, checklist e projeto executivo — em um clique.",
    duration: 6.5,
  },
  {
    id: "gestao",
    title: "Gestão e Filtros",
    narration:
      "Filtre por empresa, contrato, área, data e responsável. Governança de ponta a ponta.",
    duration: 7.4,
  },
  {
    id: "encerramento",
    title: "Encerramento",
    narration:
      "ValeTech IA. Muito mais do que inspeções — transformamos fotografias em projetos executivos. Segurança, engenharia e conformidade em uma única plataforma — N3, Meio Ambiente, Kaizen e Inspeção.",
    duration: 7.4,
  },
];

type Format = "16:9" | "9:16" | "1:1";
type Preset = 60 | 90 | 120 | 0;

function totalDuration(scenes: Scene[]) {
  return scenes.reduce((s, x) => s + x.duration, 0);
}

function scaledScenes(preset: Preset): Scene[] {
  const base = SCENES;
  if (preset === 0) return base;
  const total = totalDuration(base);
  const factor = preset / total;
  return base.map((s) => ({
    ...s,
    duration: Math.max(2, +(s.duration * factor).toFixed(2)),
  }));
}

function ApresentacaoPage() {
  const [preset, setPreset] = useState<Preset>(0);
  const [format, setFormat] = useState<Format>("16:9");
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [showScript, setShowScript] = useState(false);
  const [showSubs, setShowSubs] = useState(true);
  const [speak, setSpeak] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  const scenes = useMemo(() => scaledScenes(preset), [preset]);
  const total = useMemo(() => totalDuration(scenes), [scenes]);

  const { sceneIndex, sceneElapsed } = useMemo(() => {
    let acc = 0;
    for (let i = 0; i < scenes.length; i++) {
      if (elapsed < acc + scenes[i].duration) {
        return { sceneIndex: i, sceneElapsed: elapsed - acc };
      }
      acc += scenes[i].duration;
    }
    return {
      sceneIndex: scenes.length - 1,
      sceneElapsed: scenes[scenes.length - 1].duration,
    };
  }, [elapsed, scenes]);

  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTsRef.current = null;
      return;
    }
    const tick = (ts: number) => {
      if (lastTsRef.current == null) lastTsRef.current = ts;
      const dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      setElapsed((e) => {
        const next = e + dt;
        if (next >= total) {
          setPlaying(false);
          return total;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, total]);

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Narração falada sincronizada com a cena atual (Web Speech API)
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    if (!speak || !playing) {
      synth.cancel();
      return;
    }
    const scene = scenes[sceneIndex];
    if (!scene) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(scene.narration);
    u.lang = "pt-BR";
    const voices = synth.getVoices();
    const pt = voices.find((v) => /pt[-_]BR/i.test(v.lang)) || voices.find((v) => /^pt/i.test(v.lang));
    if (pt) u.voice = pt;
    // Ajusta a velocidade para caber na duração da cena
    const words = scene.narration.trim().split(/\s+/).length;
    const wps = words / Math.max(1, scene.duration);
    u.rate = Math.max(0.8, Math.min(1.4, wps / 2.6));
    u.pitch = 1;
    u.volume = 1;
    synth.speak(u);
    return () => {
      synth.cancel();
    };
  }, [sceneIndex, speak, playing, scenes]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const jumpScene = useCallback(
    (delta: number) => {
      let acc = 0;
      let cur = 0;
      for (let i = 0; i < scenes.length; i++) {
        if (elapsed < acc + scenes[i].duration) {
          cur = i;
          break;
        }
        acc += scenes[i].duration;
      }
      const target = Math.max(0, Math.min(scenes.length - 1, cur + delta));
      let start = 0;
      for (let i = 0; i < target; i++) start += scenes[i].duration;
      setElapsed(start + 0.01);
    },
    [elapsed, scenes]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === "ArrowRight") {
        jumpScene(1);
      } else if (e.key === "ArrowLeft") {
        jumpScene(-1);
      } else if (e.key === "Escape" && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [jumpScene]);

  const restart = () => {
    setElapsed(0);
    setPlaying(true);
  };

  const enterFullscreen = () => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      containerRef.current.requestFullscreen().catch(() => {});
    }
  };

  const scriptText = useMemo(
    () =>
      scenes
        .map(
          (s, i) =>
            `Cena ${i + 1} — ${s.title} (${s.duration.toFixed(1)}s)\n${s.narration}\n`
        )
        .join("\n"),
    [scenes]
  );

  const srtText = useMemo(() => {
    const fmt = (t: number) => {
      const h = Math.floor(t / 3600).toString().padStart(2, "0");
      const m = Math.floor((t % 3600) / 60).toString().padStart(2, "0");
      const s = Math.floor(t % 60).toString().padStart(2, "0");
      const ms = Math.floor((t - Math.floor(t)) * 1000)
        .toString()
        .padStart(3, "0");
      return `${h}:${m}:${s},${ms}`;
    };
    let acc = 0;
    return scenes
      .map((s, i) => {
        const start = acc;
        acc += s.duration;
        return `${i + 1}\n${fmt(start)} --> ${fmt(acc)}\n${s.narration}\n`;
      })
      .join("\n");
  }, [scenes]);

  const download = (filename: string, content: string, mime = "text/plain") => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const [recording, setRecording] = useState(false);
  const recordVideo = useCallback(async (format: "webm" | "mp4" = "webm") => {
    if (recording) return;
    if (typeof MediaRecorder === "undefined") {
      toast.error("Seu navegador não suporta gravação de vídeo. Use Chrome/Edge no desktop.");
      return;
    }

    // Preferência: captura de tela nativa (getDisplayMedia) — grava frames reais em 30fps.
    const hasDisplayMedia =
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices &&
      typeof navigator.mediaDevices.getDisplayMedia === "function";

    const candidates = format === "mp4"
      ? ["video/mp4;codecs=avc1", "video/mp4;codecs=h264", "video/mp4"]
      : ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
    const mime = candidates.find((m) => MediaRecorder.isTypeSupported(m));
    if (!mime) {
      toast.error(
        format === "mp4"
          ? "Este navegador não grava MP4. Use 'Baixar WebM' ou abra no Chrome/Edge."
          : "Este navegador não suporta gravação WebM.",
      );
      return;
    }

    const finalize = (chunks: BlobPart[], mimeOut: string, ext: string) => {
      const blob = new Blob(chunks, { type: mimeOut });
      if (blob.size === 0) {
        toast.error("Gravação vazia — tente novamente.");
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `valetech-apresentacao.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success("Vídeo baixado.");
    };

    // Caminho A: captura de tela (recomendado, funciona no desktop)
    if (hasDisplayMedia) {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 30 } as MediaTrackConstraints,
          audio: false,
        });
        const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
        const chunks: BlobPart[] = [];
        rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
        rec.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          finalize(chunks, format === "mp4" ? "video/mp4" : "video/webm", format);
          setRecording(false);
        };
        stream.getVideoTracks()[0].addEventListener("ended", () => {
          if (rec.state !== "inactive") rec.stop();
        });

        setRecording(true);
        setElapsed(0);
        setPlaying(true);
        rec.start(1000);
        toast.info("Gravando… selecione a aba da apresentação. Não feche esta janela.");

        const stopAt = total * 1000 + 500;
        setTimeout(() => {
          if (rec.state !== "inactive") rec.stop();
        }, stopAt);
        return;
      } catch (err) {
        console.warn("getDisplayMedia falhou, tentando fallback:", err);
        // usuário cancelou ou não permitiu — cai para fallback
      }
    }

    // Caminho B (fallback): canvas + html2canvas (mais lento, pode falhar em mobile)
    const stage = stageRef.current;
    if (!stage) {
      toast.error("Palco não encontrado.");
      return;
    }
    let cancelled = false;
    try {
      const { default: html2canvas } = await import("html2canvas");
      const rect = stage.getBoundingClientRect();
      const scale = Math.min(2, Math.max(1, 1280 / Math.max(1, rect.width)));
      const W = Math.round(rect.width * scale);
      const H = Math.round(rect.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas 2d");
      const stream = (canvas as HTMLCanvasElement).captureStream(30);
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        finalize(chunks, format === "mp4" ? "video/mp4" : "video/webm", format);
        setRecording(false);
      };

      setRecording(true);
      setElapsed(0);
      setPlaying(true);

      try {
        const first = await html2canvas(stage, { backgroundColor: "#050810", scale, logging: false, useCORS: true, allowTaint: true });
        ctx.drawImage(first, 0, 0, W, H);
      } catch {
        ctx.fillStyle = "#050810";
        ctx.fillRect(0, 0, W, H);
      }

      rec.start(1000);
      toast.info("Gerando vídeo… mantenha esta aba visível.");

      const started = performance.now();
      const stopAt = total * 1000 + 400;
      const tick = async () => {
        if (cancelled) return;
        try {
          const snap = await html2canvas(stage, { backgroundColor: "#050810", scale, logging: false, useCORS: true, allowTaint: true });
          ctx.drawImage(snap, 0, 0, W, H);
        } catch { /* mantém último frame */ }
        if (performance.now() - started >= stopAt) {
          setTimeout(() => { if (rec.state !== "inactive") rec.stop(); }, 300);
          return;
        }
        setTimeout(tick, 100);
      };
      tick();
    } catch (err) {
      cancelled = true;
      console.error(err);
      toast.error("Falha ao gerar vídeo. Tente em Chrome/Edge no desktop.");
      setRecording(false);
    }
  }, [recording, total]);

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copiado`);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const aspectClass =
    format === "16:9"
      ? "aspect-video"
      : format === "9:16"
        ? "aspect-[9/16]"
        : "aspect-square";

  const currentScene = scenes[sceneIndex];
  const sceneProgress = currentScene ? sceneElapsed / currentScene.duration : 0;

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      {!fullscreen && (
        <header className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neon/10 ring-1 ring-neon/40">
            <Film className="h-5 w-5 text-neon" />
          </div>
          <div className="flex-1">
            <h1 className="font-display text-xl font-semibold">
              Vídeo de Apresentação · ValeTech IA
            </h1>
            <p className="text-xs text-muted-foreground">
              15 cenas cinematográficas — padrão multinacional. Grave em tela
              cheia com OBS ou CapCut para exportar em 1920×1080.
            </p>
          </div>
        </header>
      )}

      {!fullscreen && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/50 bg-card/50 p-3">
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant={playing ? "secondary" : "default"}
              onClick={() => setPlaying((p) => !p)}
            >
              {playing ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              <span className="ml-1">{playing ? "Pausar" : "Iniciar"}</span>
            </Button>
            <Button size="sm" variant="outline" onClick={restart}>
              <RotateCcw className="h-4 w-4" />
              <span className="ml-1">Reiniciar</span>
            </Button>
            <Button size="sm" variant="outline" onClick={() => jumpScene(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => jumpScene(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={enterFullscreen}>
              {fullscreen ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
              <span className="ml-1">Tela cheia</span>
            </Button>
          </div>

          <div className="mx-2 h-6 w-px bg-border" />

          <div className="flex items-center gap-1">
            {([60, 90, 120, 0] as Preset[]).map((p) => (
              <Button
                key={p}
                size="sm"
                variant={preset === p ? "default" : "outline"}
                onClick={() => {
                  setPreset(p);
                  setElapsed(0);
                }}
              >
                {p === 0 ? "Completo" : `${p}s`}
              </Button>
            ))}
          </div>

          <div className="mx-2 h-6 w-px bg-border" />

          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant={format === "16:9" ? "default" : "outline"}
              onClick={() => setFormat("16:9")}
            >
              <Monitor className="h-4 w-4" />
              <span className="ml-1">16:9</span>
            </Button>
            <Button
              size="sm"
              variant={format === "9:16" ? "default" : "outline"}
              onClick={() => setFormat("9:16")}
            >
              <Smartphone className="h-4 w-4" />
              <span className="ml-1">9:16</span>
            </Button>
            <Button
              size="sm"
              variant={format === "1:1" ? "default" : "outline"}
              onClick={() => setFormat("1:1")}
            >
              <SquareIcon className="h-4 w-4" />
              <span className="ml-1">1:1</span>
            </Button>
          </div>

          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              {elapsed.toFixed(1)}s / {total.toFixed(1)}s
            </span>
            <Badge variant="outline">
              Cena {sceneIndex + 1}/{scenes.length}
            </Badge>
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        className={`relative mx-auto w-full ${
          fullscreen ? "h-screen max-w-none bg-black" : "max-w-6xl"
        }`}
      >
        <div
          ref={stageRef}
          className={`${aspectClass} relative w-full overflow-hidden rounded-xl bg-[#050810] ring-1 ring-white/10 ${
            fullscreen ? "rounded-none ring-0" : ""
          }`}
          onClick={() => fullscreen && setPlaying((p) => !p)}
        >
          {/* Background cinematográfico */}
          <CinematicBackdrop />
          <Particles />

          <Stage
            scene={currentScene}
            progress={sceneProgress}
            index={sceneIndex}
            format={format}
          />

          {/* Vinheta */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_50%,rgba(0,0,0,0.55)_100%)]" />

          {/* Marca */}
          <div className="pointer-events-none absolute right-4 top-4 flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-white/70 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-neon shadow-[0_0_10px_var(--neon)]" />
            ValeTech IA
          </div>

          {/* Legendas */}
          {showSubs && currentScene && (
            <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center px-6">
              <div className="max-w-3xl rounded-lg border border-white/10 bg-black/50 px-4 py-2 text-center text-sm text-white shadow-2xl backdrop-blur-xl md:text-base">
                {currentScene.narration}
              </div>
            </div>
          )}

          {fullscreen && (
            <div className="pointer-events-none absolute left-4 top-4 rounded bg-black/40 px-2 py-1 text-[10px] uppercase tracking-widest text-white/60">
              Space · ← → · Esc
            </div>
          )}
        </div>

        {!fullscreen && (
          <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-muted">
            {scenes.map((s, i) => {
              const w = (s.duration / total) * 100;
              const active = i === sceneIndex;
              const done = i < sceneIndex;
              return (
                <button
                  key={s.id}
                  title={`${s.title} · ${s.duration.toFixed(1)}s`}
                  onClick={() => {
                    let start = 0;
                    for (let k = 0; k < i; k++) start += scenes[k].duration;
                    setElapsed(start + 0.01);
                  }}
                  className={`h-full border-r border-black/40 last:border-r-0 transition-colors ${
                    active
                      ? "bg-neon"
                      : done
                        ? "bg-neon/50"
                        : "bg-muted-foreground/20 hover:bg-muted-foreground/40"
                  }`}
                  style={{ width: `${w}%` }}
                />
              );
            })}
          </div>
        )}
      </div>

      {!fullscreen && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-border/50 bg-card/50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                Cenas
              </h2>
              <Badge variant="outline">{scenes.length} cenas</Badge>
            </div>
            <ol className="max-h-80 space-y-1 overflow-y-auto pr-2">
              {scenes.map((s, i) => (
                <li
                  key={s.id}
                  className={`flex items-center justify-between rounded px-2 py-1.5 text-sm ${
                    i === sceneIndex ? "bg-neon/10 text-neon" : "hover:bg-muted/30"
                  }`}
                >
                  <span className="font-mono text-xs opacity-60">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="ml-3 flex-1">{s.title}</span>
                  <span className="text-xs opacity-60">
                    {s.duration.toFixed(1)}s
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-xl border border-border/50 bg-card/50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                Roteiro & Exportação
              </h2>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowSubs((v) => !v)}
              >
                {showSubs ? "Ocultar legendas" : "Mostrar legendas"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSpeak((v) => !v)}
              >
                {speak ? "Silenciar narração" : "Ativar narração"}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowScript((v) => !v)}
              >
                <FileText className="h-4 w-4" />
                <span className="ml-1">
                  {showScript ? "Ocultar" : "Ver"} roteiro
                </span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => copyText(scriptText, "Roteiro")}
              >
                <Copy className="h-4 w-4" />
                <span className="ml-1">Copiar roteiro</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => download("valetech-roteiro.txt", scriptText)}
              >
                <Download className="h-4 w-4" />
                <span className="ml-1">TXT</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => download("valetech-legendas.srt", srtText)}
              >
                <Download className="h-4 w-4" />
                <span className="ml-1">SRT</span>
              </Button>
              <Button
                size="sm"
                variant="default"
                onClick={() => recordVideo("webm")}
                disabled={recording}
              >
                <Download className="h-4 w-4" />
                <span className="ml-1">
                  {recording ? "Gerando…" : "Baixar WebM"}
                </span>
              </Button>
              <Button
                size="sm"
                variant="default"
                onClick={() => recordVideo("mp4")}
                disabled={recording}
              >
                <Download className="h-4 w-4" />
                <span className="ml-1">
                  {recording ? "Gerando…" : "Baixar MP4"}
                </span>
              </Button>
            </div>
            {showScript && (
              <pre className="mt-3 max-h-64 overflow-auto rounded bg-black/40 p-3 text-xs whitespace-pre-wrap text-muted-foreground">
                {scriptText}
              </pre>
            )}
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
              Grave em tela cheia com OBS ou CapCut. Formato 16:9 para YouTube /
              LinkedIn; 9:16 para Reels e Shorts. Adicione trilha corporativa e
              locução profissional na edição.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================================
// STAGE
// ==========================================================
function Stage({
  scene,
  progress,
  index,
  format,
}: {
  scene: Scene | undefined;
  progress: number;
  index: number;
  format: Format;
}) {
  if (!scene) return null;
  const scenes = [
    SceneAbertura,
    SceneDashboard,
    SceneNovaInspecao,
    SceneUpload,
    SceneAnalisando,
    SceneResultado,
    SceneProjetoExecutivo,
    SceneMemorial,
    SceneRelatorio,
    SceneAntesExecutado,
    SceneHistorico,
    SceneIndicadores,
    SceneExportacoes,
    SceneGestao,
    SceneEncerramento,
  ];
  const Comp = scenes[index] ?? SceneAbertura;
  return (
    <div className="absolute inset-0">
      <Comp progress={progress} format={format} />
    </div>
  );
}

// ==========================================================
// Backdrop cinematográfico + partículas
// ==========================================================
function CinematicBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(72,255,120,0.12),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(56,189,248,0.10),transparent_50%)]" />
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
    </div>
  );
}

function Particles() {
  const dots = useMemo(
    () =>
      Array.from({ length: 30 }).map((_, i) => ({
        x: (i * 37) % 100,
        y: (i * 71) % 100,
        d: (i % 6) * 0.3,
        s: 1 + (i % 4) * 0.5,
      })),
    []
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {dots.map((d, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-white/40"
          style={{
            left: `${d.x}%`,
            top: `${d.y}%`,
            width: d.s,
            height: d.s,
            animation: `iris-float ${6 + d.d * 4}s ease-in-out ${d.d}s infinite alternate`,
            boxShadow: "0 0 6px rgba(255,255,255,0.6)",
          }}
        />
      ))}
      <style>{`
        @keyframes iris-float {
          from { transform: translateY(0) translateX(0); opacity: 0.2; }
          to { transform: translateY(-24px) translateX(12px); opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}

// Utilitário glass card
function Glass({
  className = "",
  children,
  style,
}: {
  className?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-2xl ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

// Fade helper
function fadeIn(progress: number, start = 0, dur = 0.3) {
  return Math.min(1, Math.max(0, (progress - start) / dur));
}

// Legenda das faixas de score de risco (reutilizada em cenas com donut/barra)
function RiskBandsLegend({
  progress,
  start = 0.2,
  compact = false,
  className = "",
}: {
  progress: number;
  start?: number;
  compact?: boolean;
  className?: string;
}) {
  const bands = [
    { l: "Baixo", r: "0–24", c: "bg-emerald-400", t: "text-emerald-300" },
    { l: "Médio", r: "25–49", c: "bg-amber-400", t: "text-amber-300" },
    { l: "Alto", r: "50–74", c: "bg-orange-400", t: "text-orange-300" },
    { l: "Crítico", r: "75–100", c: "bg-rose-500", t: "text-rose-300" },
  ];
  return (
    <div
      className={`rounded-md border border-white/10 bg-white/[0.03] p-2 ${className}`}
      style={{ opacity: fadeIn(progress, start, 0.3) }}
    >
      <div
        className={`mb-1.5 font-semibold uppercase tracking-[0.25em] text-white/60 ${compact ? "text-[8px]" : "text-[9px]"}`}
      >
        Score de risco — quanto maior, mais crítico
      </div>
      <div
        className={`grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-4 ${compact ? "text-[9px]" : "text-[10px]"}`}
      >
        {bands.map((b) => (
          <div key={b.l} className="flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-sm ${b.c}`} />
            <span className={`font-semibold ${b.t}`}>{b.l}</span>
            <span className="font-mono text-white/50">{b.r}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==========================================================
// CENA 1 — Abertura
// ==========================================================
function SceneAbertura({ progress }: { progress: number; format: Format }) {
  const t = fadeIn(progress, 0, 0.3);
  const t2 = fadeIn(progress, 0.4, 0.3);
  const t3 = fadeIn(progress, 0.75, 0.25);
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
      <div
        className="flex flex-col items-center gap-4"
        style={{ opacity: t, transform: `translateY(${(1 - t) * 20}px)` }}
      >
        <div className="relative flex h-28 w-28 items-center justify-center rounded-full">
          <div className="absolute inset-0 animate-pulse rounded-full bg-neon/20 blur-2xl" />
          <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-neon/10 ring-2 ring-neon/70">
            <div
              className="h-10 w-10 rounded-full bg-neon shadow-[0_0_80px_rgba(72,255,120,0.9)]"
              style={{ transform: `scale(${0.6 + 0.4 * t})` }}
            />
          </div>
        </div>
        <h1 className="font-display text-6xl font-black tracking-tight md:text-8xl">
          ValeTech IA
        </h1>
        <div
          className="text-center"
          style={{ opacity: t2, transform: `translateY(${(1 - t2) * 10}px)` }}
        >
          <p className="text-xs uppercase tracking-[0.5em] text-white/60">
            Inteligência Artificial
          </p>
          <p className="mt-2 max-w-xl text-lg text-white/80 md:text-xl">
            para Engenharia e Segurança do Trabalho
          </p>
        </div>
      </div>
      <div
        className="absolute bottom-16 flex items-center gap-3 text-[10px] uppercase tracking-[0.4em] text-white/40"
        style={{ opacity: t3 }}
      >
        <span className="h-px w-8 bg-white/30" />
        Presented by ValeTech IA Studio
        <span className="h-px w-8 bg-white/30" />
      </div>
    </div>
  );
}

// ==========================================================
// CENA 2 — Dashboard
// ==========================================================
function SceneDashboard({ progress }: { progress: number; format: Format }) {
  const cards = [
    { label: "Inspeções", value: "1.248", icon: ClipboardList, hue: "text-sky-300", tone: "from-sky-500/20 to-transparent" },
    { label: "Pendências", value: "37", icon: AlertTriangle, hue: "text-amber-300", tone: "from-amber-500/20 to-transparent" },
    { label: "Projetos", value: "82", icon: LayoutGrid, hue: "text-neon", tone: "from-emerald-500/20 to-transparent" },
    { label: "Relatórios", value: "312", icon: FileText, hue: "text-violet-300", tone: "from-violet-500/20 to-transparent" },
    { label: "Conformidade", value: "94%", icon: ShieldCheck, hue: "text-neon", tone: "from-emerald-500/20 to-transparent" },
    { label: "Indicadores", value: "18", icon: BarChart3, hue: "text-cyan-300", tone: "from-cyan-500/20 to-transparent" },
  ];
  return (
    <div className="absolute inset-0 flex flex-col p-8 md:p-14">
      <div style={{ opacity: fadeIn(progress, 0, 0.2) }}>
        <div className="text-[10px] uppercase tracking-[0.4em] text-neon/80">
          Dashboard executivo
        </div>
        <h2 className="mt-1 font-display text-3xl font-bold text-white md:text-5xl">
          Toda a operação em um só painel
        </h2>
      </div>
      <div className="mt-6 grid flex-1 grid-cols-2 gap-3 md:grid-cols-3 md:gap-5">
        {cards.map((c, i) => {
          const t = fadeIn(progress, 0.15 + i * 0.1, 0.3);
          const Icon = c.icon;
          return (
            <Glass
              key={c.label}
              className={`relative overflow-hidden p-4 md:p-6`}
              style={{
                opacity: t,
                transform: `translateY(${(1 - t) * 30}px) scale(${0.95 + 0.05 * t})`,
              }}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${c.tone}`} />
              <div className="relative">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-widest text-white/50">
                    {c.label}
                  </span>
                  <Icon className={`h-4 w-4 ${c.hue}`} />
                </div>
                <div className="mt-4 font-display text-3xl font-bold text-white md:text-5xl">
                  {c.value}
                </div>
                <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full bg-white/60"
                    style={{ width: `${Math.min(100, t * 100)}%` }}
                  />
                </div>
              </div>
            </Glass>
          );
        })}
      </div>
    </div>
  );
}

// ==========================================================
// CENA 3 — Nova Inspeção (form auto-preenchendo)
// ==========================================================
function SceneNovaInspecao({ progress }: { progress: number; format: Format }) {
  const fields = [
    { label: "Empresa", value: "Vale S.A.", icon: Building2 },
    { label: "Unidade", value: "Mina de Carajás — S11D", icon: MapPin },
    { label: "Setor", value: "Logística · Correia CR-104", icon: LayoutGrid },
    { label: "Responsável", value: "Eng. Márcia Pereira", icon: Users },
    { label: "Data", value: "21 · 07 · 2026", icon: Calendar },
    { label: "Turno", value: "Diurno", icon: Calendar },
  ];
  return (
    <div className="absolute inset-0 flex items-center justify-center p-8 md:p-14">
      <Glass
        className="w-full max-w-3xl p-6 md:p-10"
        style={{
          opacity: fadeIn(progress, 0, 0.2),
          transform: `translateY(${(1 - fadeIn(progress, 0, 0.2)) * 20}px)`,
        }}
      >
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.4em] text-neon/80">
              Nova inspeção
            </div>
            <div className="mt-1 font-display text-2xl font-bold text-white md:text-3xl">
              Preenchimento automático
            </div>
          </div>
          <div className="rounded-full border border-neon/40 bg-neon/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-neon">
            AI · Ativa
          </div>
        </div>
        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
          {fields.map((f, i) => {
            const t = fadeIn(progress, 0.15 + i * 0.09, 0.3);
            const filled = progress > 0.15 + i * 0.09 + 0.15;
            const Icon = f.icon;
            return (
              <div
                key={f.label}
                className="rounded-lg border border-white/10 bg-black/30 p-3"
                style={{
                  opacity: 0.4 + 0.6 * t,
                  transform: `translateX(${(1 - t) * -12}px)`,
                }}
              >
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-white/50">
                  <Icon className="h-3 w-3" />
                  {f.label}
                </div>
                <div className="mt-1.5 flex h-6 items-center text-sm text-white">
                  {filled ? (
                    <span className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-neon" />
                      {f.value}
                    </span>
                  ) : (
                    <span className="inline-block h-3 w-40 animate-pulse rounded bg-white/10" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div
          className="mt-6 flex items-center justify-between rounded-lg border border-neon/30 bg-neon/5 p-3"
          style={{ opacity: fadeIn(progress, 0.75, 0.2) }}
        >
          <div className="flex items-center gap-2 text-sm text-white/80">
            <Camera className="h-4 w-4 text-neon" />
            Próximo passo — selecionar fotografias
          </div>
          <ChevronRight className="h-4 w-4 text-neon" />
        </div>
      </Glass>
    </div>
  );
}

// ==========================================================
// CENA 4 — Upload
// ==========================================================
function SceneUpload({ progress }: { progress: number; format: Format }) {
  const pct = Math.min(100, Math.floor(progress * 130));
  const loaded = Math.min(9, Math.floor((progress * 130) / 12));
  return (
    <div className="absolute inset-0 flex items-center justify-center p-8 md:p-14">
      <Glass className="w-full max-w-3xl p-6 md:p-10">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neon/10 ring-1 ring-neon/40">
            <Upload className="h-5 w-5 text-neon" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.4em] text-neon/80">
              Upload inteligente
            </div>
            <div className="font-display text-2xl font-bold text-white md:text-3xl">
              {pct < 100 ? "Carregando fotografias..." : "9 imagens carregadas"}
            </div>
          </div>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between text-xs text-white/60">
            <span>{loaded} / 9 imagens</span>
            <span className="font-mono text-neon">{pct}%</span>
          </div>
          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-neon/60 to-neon shadow-[0_0_20px_rgba(72,255,120,0.6)] transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-2 md:grid-cols-9">
          {Array.from({ length: 9 }).map((_, i) => {
            const done = i < loaded;
            return (
              <div
                key={i}
                className={`relative aspect-square overflow-hidden rounded-md border transition-all ${
                  done
                    ? "border-neon/40 bg-neon/5"
                    : "border-white/10 bg-white/[0.02]"
                }`}
              >
                <MiniIndustrial hue={i % 3} />
                {!done && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                    <Loader2 className="h-4 w-4 animate-spin text-white/60" />
                  </div>
                )}
                {done && (
                  <div className="absolute right-1 top-1 rounded-full bg-neon p-0.5 text-black">
                    <Check className="h-2.5 w-2.5" strokeWidth={4} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Glass>
    </div>
  );
}

// ==========================================================
// CENA 5 — IA Analisando
// ==========================================================
function SceneAnalisando({ progress }: { progress: number; format: Format }) {
  const boxes = [
    { x: 18, y: 44, w: 22, h: 26, label: "Rota obstruída", nr: "NR-11", d: 0.15 },
    { x: 48, y: 30, w: 18, h: 22, label: "Fiação exposta", nr: "NR-10", d: 0.35 },
    { x: 70, y: 52, w: 20, h: 24, label: "Piso molhado", nr: "NR-01", d: 0.55 },
    { x: 30, y: 66, w: 14, h: 16, label: "Sem EPI", nr: "NR-06", d: 0.72 },
  ];
  const tags = ["Visão Computacional", "NRs", "Riscos", "Prioridades"];
  return (
    <div className="absolute inset-0">
      <IndustrialScene opacity={0.55} />
      <div className="absolute inset-0 bg-black/40" />

      {/* Scanning laser */}
      <div
        className="absolute inset-x-0 h-1 bg-neon/70 shadow-[0_0_30px_rgba(72,255,120,0.9)]"
        style={{ top: `${(progress * 100) % 100}%` }}
      />

      {/* Bounding boxes */}
      {boxes.map((b, i) => {
        const local = fadeIn(progress, b.d, 0.15);
        return (
          <div
            key={i}
            className="absolute rounded-md border-2 border-red-500/90 shadow-[0_0_20px_rgba(255,60,60,0.5)]"
            style={{
              left: `${b.x}%`,
              top: `${b.y}%`,
              width: `${b.w}%`,
              height: `${b.h}%`,
              opacity: local,
              transform: `scale(${0.9 + 0.1 * local})`,
            }}
          >
            <div className="absolute -top-7 left-0 flex items-center gap-1 whitespace-nowrap rounded bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">
              <span className="font-mono">{String(i + 1).padStart(2, "0")}</span>
              · {b.label}
              <span className="ml-1 rounded bg-black/40 px-1 font-mono">
                {b.nr}
              </span>
            </div>
          </div>
        );
      })}

      {/* HUD */}
      <div className="absolute left-8 top-8 md:left-14 md:top-14">
        <Glass className="px-5 py-3">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-neon" />
            <span className="font-display text-lg font-bold text-white">
              Analisando<span className="text-neon">...</span>
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tags.map((t, i) => {
              const active = progress > 0.15 + i * 0.15;
              return (
                <span
                  key={t}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest transition-all ${
                    active
                      ? "bg-neon/20 text-neon ring-1 ring-neon/50"
                      : "bg-white/5 text-white/40"
                  }`}
                >
                  {t}
                </span>
              );
            })}
          </div>
        </Glass>
      </div>
    </div>
  );
}

// ==========================================================
// CENA 6 — Diagnóstico (idêntico à tela real do app)
// ==========================================================
function SceneResultado({ progress }: { progress: number; format: Format }) {
  const donut = fadeIn(progress, 0.15, 0.45);
  const value = Math.floor(donut * 95);
  const C = 2 * Math.PI * 42;

  const descricao =
    "A imagem mostra uma área industrial com um trator de esteira, máquina de solda e carrinhos obstruindo a passagem. Cabos elétricos estão espalhados pelo chão molhado, próximo a um painel de 440V.";

  const consequencias = [
    "Eletrocussão (440V) com fiação exposta e desorganizada (NR-10)",
    "Piso molhado e escorregadio (NR-01)",
    "Obstrução de rota de fuga e passagem (NR-11, NR-17)",
    "Operação de equipamento pesado em área de circulação (NR-11)",
  ];

  // P × S = Score (idêntico ao app: 4 × 5 = 20 · CRÍTICO)
  const P = 4;
  const S = 5;
  const score = P * S;

  const badgeFade = (d: number) => fadeIn(progress, d, 0.2);

  return (
    <div className="absolute inset-0 grid grid-cols-1 gap-4 p-6 md:grid-cols-3 md:gap-5 md:p-12">
      {/* Coluna 1 — Cabeçalho, donut e classificação */}
      <Glass
        className="p-5 md:p-6"
        style={{
          opacity: fadeIn(progress, 0, 0.3),
          transform: `translateY(${(1 - fadeIn(progress, 0, 0.3)) * 20}px)`,
        }}
      >
        {/* Badges do topo do diagnóstico */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className="rounded-md bg-neon/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-neon ring-1 ring-neon/40"
            style={{ opacity: badgeFade(0) }}
          >
            N3
          </span>
          <span
            className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-300 ring-1 ring-emerald-400/40"
            style={{ opacity: badgeFade(0.08) }}
          >
            ● Confiança alta
          </span>
          <span
            className="rounded-md bg-red-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-red-300 ring-1 ring-red-500/50"
            style={{ opacity: badgeFade(0.16) }}
          >
            Crit: Crítica
          </span>
        </div>

        {/* Donut */}
        <div className="mt-3 flex items-center gap-4">
          <svg width="150" height="150" viewBox="0 0 120 120" className="shrink-0">
            <circle
              cx="60"
              cy="60"
              r="42"
              fill="none"
              stroke="#ffffff10"
              strokeWidth="10"
            />
            <circle
              cx="60"
              cy="60"
              r="42"
              fill="none"
              stroke="url(#gradR)"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C - C * (value / 100)}
              transform="rotate(-90 60 60)"
            />
            <defs>
              <linearGradient id="gradR" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#f43f5e" />
                <stop offset="100%" stopColor="#fb923c" />
              </linearGradient>
            </defs>
            <text
              x="60"
              y="58"
              textAnchor="middle"
              fill="#fff"
              fontSize="22"
              fontWeight="800"
            >
              {value}
            </text>
            <text
              x="60"
              y="74"
              textAnchor="middle"
              fill="#ffffff90"
              fontSize="7"
              fontWeight="700"
              letterSpacing="1.5"
            >
              NÍVEL DE RISCO
            </text>
          </svg>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.35em] text-white/60">
              Nível de Risco
            </div>
            <div className="mt-1 text-[11px] leading-snug text-white/80">
              Score de risco calculado pela IA — quanto maior, mais crítico.
            </div>
            <div className="mt-2 flex items-center gap-3 text-[10px] font-mono">
              <span className="flex items-center gap-1 text-red-300">
                <span className="h-2 w-2 rounded-full bg-red-400" /> Risco {value}
              </span>
              <span className="flex items-center gap-1 text-white/50">
                <span className="h-2 w-2 rounded-full bg-white/30" /> Margem{" "}
                {100 - value}
              </span>
            </div>
          </div>
        </div>

        {/* Legenda das faixas de risco */}
        <RiskBandsLegend progress={progress} start={0.22} className="mt-3" />


        {/* Título e descrição gerados pela IA */}
        <div
          className="mt-4"
          style={{ opacity: fadeIn(progress, 0.3, 0.3) }}
        >
          <div className="text-[10px] uppercase tracking-[0.35em] text-neon/80">
            Título (IA)
          </div>
          <div className="mt-1 font-display text-base font-bold text-white">
            Riscos Elétricos, Obstrução e Piso Molhado em Área Industrial
          </div>
        </div>
        <div
          className="mt-3"
          style={{ opacity: fadeIn(progress, 0.4, 0.3) }}
        >
          <div className="text-[10px] uppercase tracking-[0.35em] text-neon/80">
            Descrição (IA)
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-white/80">
            {descricao}
          </p>
        </div>

        {/* Área / Local / Prioridade */}
        <div
          className="mt-4 grid grid-cols-3 gap-2 text-[10px]"
          style={{ opacity: fadeIn(progress, 0.5, 0.3) }}
        >
          <div className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5">
            <div className="uppercase tracking-widest text-white/50">Área</div>
            <div className="mt-0.5 text-white/90">Pátio industrial</div>
          </div>
          <div className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5">
            <div className="uppercase tracking-widest text-white/50">Local</div>
            <div className="mt-0.5 text-white/90">Painel 440V</div>
          </div>
          <div className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1.5">
            <div className="uppercase tracking-widest text-red-300/80">
              Prioridade
            </div>
            <div className="mt-0.5 font-bold text-red-300">Crítica</div>
          </div>
        </div>
      </Glass>

      {/* Coluna 2 — Ação Imediata + Ação Definitiva */}
      <Glass
        className="p-5 md:p-6"
        style={{
          opacity: fadeIn(progress, 0.1, 0.3),
          transform: `translateY(${(1 - fadeIn(progress, 0.1, 0.3)) * 20}px)`,
        }}
      >
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-amber-300">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          Ação imediata
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-white/80">
          Interromper imediatamente as atividades na área, desenergizar o painel
          e a máquina de solda, remover todos os cabos do chão, limpar e secar o
          piso e sinalizar a área.
        </p>

        <div className="mt-5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-sky-300">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
          Ação definitiva
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-white/80">
          Implementar sistema de gerenciamento de cabos (calhas, bandejas) para
          evitar fiação no chão (NR-10). Criar rotas de passagem exclusivas e
          sinalizadas para pedestres e veículos (NR-11). Instalar proteções
          físicas para equipamentos elétricos e máquinas de solda (NR-10, NR-12).
          Garantir drenagem adequada do piso e limpeza constante.
        </p>

        <div className="mt-4 rounded-md border border-white/10 bg-white/[0.03] p-2 text-[10px] text-white/70">
          <span className="uppercase tracking-widest text-white/50">
            Responsável:
          </span>{" "}
          Supervisor de Operações
        </div>
      </Glass>

      {/* Coluna 3 — Parecer Técnico */}
      <Glass
        className="p-5 md:p-6"
        style={{
          opacity: fadeIn(progress, 0.2, 0.3),
          transform: `translateY(${(1 - fadeIn(progress, 0.2, 0.3)) * 20}px)`,
        }}
      >
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-red-300">
          <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
          Parecer técnico — Eng. de Segurança
        </div>

        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-widest text-white/50">
            Causa raiz
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-white/80">
            Fiação elétrica desorganizada sobre piso molhado, obstrução de
            passagem e equipamento pesado em área de trânsito.
          </p>
        </div>

        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-widest text-white/50">
            Consequências
          </div>
          <ul className="mt-1 space-y-1">
            {consequencias.map((c, i) => {
              const t = fadeIn(progress, 0.35 + i * 0.06, 0.2);
              return (
                <li
                  key={i}
                  className="flex gap-1.5 text-[10.5px] leading-snug text-white/80"
                  style={{
                    opacity: t,
                    transform: `translateX(${(1 - t) * -8}px)`,
                  }}
                >
                  <span className="text-red-400">•</span>
                  <span>{c}</span>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Tabela P × S = Score */}
        <div
          className="mt-4 overflow-hidden rounded-lg border border-white/10 bg-black/30"
          style={{ opacity: fadeIn(progress, 0.55, 0.3) }}
        >
          <div className="grid grid-cols-4 divide-x divide-white/10 text-center text-[10px] uppercase tracking-widest text-white/50">
            <div className="py-1.5">Prob.</div>
            <div className="py-1.5">Sev.</div>
            <div className="py-1.5">Score</div>
            <div className="py-1.5">Classe</div>
          </div>
          <div className="grid grid-cols-4 divide-x divide-white/10 text-center font-mono text-lg font-black">
            <div className="py-2 text-white">{P}</div>
            <div className="py-2 text-white">{S}</div>
            <div className="py-2 text-red-400">{score}</div>
            <div className="py-2 text-red-400">CRÍTICO</div>
          </div>
        </div>

        <div
          className="mt-3 text-[10.5px] leading-snug text-white/80"
          style={{ opacity: fadeIn(progress, 0.65, 0.3) }}
        >
          <span className="font-bold text-white/95">Justificativa: </span>
          Score {score} (P{P}×S{S}). Quanto mais próximo de 100, maior o nível
          de risco.
        </div>
      </Glass>
    </div>
  );
}


// ==========================================================
// CENA 7 — Projeto Executivo (checkmarks desenhando)
// ==========================================================
function SceneProjetoExecutivo({ progress }: { progress: number; format: Format }) {
  const items = [
    "Guarda-corpo",
    "Cones",
    "Área isolada",
    "Extintor",
    "Linha de vida",
    "Placa",
    "Demarcação",
    "Rota de fuga",
    "Área proibida",
    "Faixa de circulação",
  ];
  return (
    <div className="absolute inset-0 flex">
      <div className="relative flex-1">
        <IndustrialScene opacity={0.55} />
        {/* CAD-like drawing overlay */}
        <svg viewBox="0 0 800 500" className="absolute inset-0 h-full w-full">
          {/* Área isolada */}
          <rect
            x="380"
            y="200"
            width="260"
            height="140"
            fill="#facc1520"
            stroke="#facc15"
            strokeWidth="3"
            strokeDasharray="10 6"
            style={{
              strokeDashoffset: (1 - fadeIn(progress, 0.05, 0.15)) * 800,
              opacity: fadeIn(progress, 0.05, 0.15),
            }}
          />
          {/* Cones */}
          {[380, 445, 510, 575, 640].map((cx, i) => {
            const t = fadeIn(progress, 0.15 + i * 0.03, 0.15);
            return (
              <g key={cx} style={{ opacity: t, transform: `translateY(${(1 - t) * 15}px)` }}>
                <polygon
                  points={`${cx},340 ${cx - 10},365 ${cx + 10},365`}
                  fill="#f97316"
                />
                <rect x={cx - 12} y="363" width="24" height="4" fill="#111" />
              </g>
            );
          })}
          {/* Rota de fuga (linha verde animada) */}
          <path
            d="M 40 420 L 300 420 L 300 380 L 380 380"
            fill="none"
            stroke="#22c55e"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray="700"
            strokeDashoffset={(1 - fadeIn(progress, 0.35, 0.25)) * 700}
          />
          <polygon
            points="380,380 365,372 365,388"
            fill="#22c55e"
            style={{ opacity: fadeIn(progress, 0.55, 0.1) }}
          />
          {/* Extintor */}
          <g style={{ opacity: fadeIn(progress, 0.5, 0.15), transform: "translate(700px, 250px)" }}>
            <rect x="-10" y="0" width="20" height="30" fill="#dc2626" />
            <rect x="-4" y="-6" width="8" height="8" fill="#111" />
          </g>
          {/* Guarda-corpo */}
          <g style={{ opacity: fadeIn(progress, 0.25, 0.2) }}>
            <line x1="60" y1="200" x2="360" y2="200" stroke="#38bdf8" strokeWidth="4" />
            <line x1="60" y1="230" x2="360" y2="230" stroke="#38bdf8" strokeWidth="4" />
            {[60, 140, 220, 300, 360].map((x) => (
              <line key={x} x1={x} y1="200" x2={x} y2="260" stroke="#38bdf8" strokeWidth="4" />
            ))}
          </g>
          {/* Faixa de circulação */}
          <g style={{ opacity: fadeIn(progress, 0.7, 0.2) }}>
            {Array.from({ length: 12 }).map((_, i) => (
              <rect
                key={i}
                x={40 + i * 30}
                y="450"
                width="20"
                height="6"
                fill="#ffffff90"
              />
            ))}
          </g>
          {/* Placa */}
          <g style={{ opacity: fadeIn(progress, 0.65, 0.2) }}>
            <rect x="120" y="140" width="30" height="30" fill="#facc15" stroke="#111" strokeWidth="2" />
            <text x="135" y="160" textAnchor="middle" fontSize="14" fontWeight="800">!</text>
            <line x1="135" y1="170" x2="135" y2="200" stroke="#111" strokeWidth="3" />
          </g>
          {/* Numeração */}
          {[
            { x: 510, y: 220, n: "01" },
            { x: 445, y: 355, n: "02" },
            { x: 180, y: 420, n: "03" },
            { x: 700, y: 250, n: "04" },
            { x: 140, y: 155, n: "05" },
          ].map((m, i) => {
            const t = fadeIn(progress, 0.55 + i * 0.05, 0.15);
            return (
              <g key={m.n} style={{ opacity: t }}>
                <circle cx={m.x} cy={m.y} r="14" fill="#0ea5e9" stroke="#fff" strokeWidth="2" />
                <text x={m.x} y={m.y + 4} textAnchor="middle" fill="#fff" fontSize="12" fontWeight="800">
                  {m.n}
                </text>
              </g>
            );
          })}
        </svg>
        <div className="absolute left-6 top-6 rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-white backdrop-blur">
          Melhorias indicadas sobre a foto
        </div>
      </div>
      <div className="hidden w-72 flex-col border-l border-white/10 bg-black/60 p-5 backdrop-blur-xl md:flex">
        <div className="text-[10px] uppercase tracking-[0.4em] text-neon/80">
          Melhorias sugeridas
        </div>

        <ul className="mt-4 space-y-1.5">
          {items.map((it, i) => {
            const t = fadeIn(progress, 0.05 + i * 0.08, 0.15);
            return (
              <li
                key={it}
                className="flex items-center gap-2 text-sm text-white"
                style={{ opacity: t, transform: `translateX(${(1 - t) * -10}px)` }}
              >
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-neon/20 ring-1 ring-neon/50">
                  <Check className="h-3 w-3 text-neon" strokeWidth={3} />
                </div>
                <span>{it}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

// ==========================================================
// CENA 8 — Memorial
// ==========================================================
function SceneMemorial({ progress }: { progress: number; format: Format }) {
  const items = [
    { n: "01", label: "Instalar guarda-corpo", nr: "NR-35", crit: "Alta", resp: "SESMT" },
    { n: "02", label: "Remover materiais e liberar rota", nr: "NR-11", crit: "Alta", resp: "Logística" },
    { n: "03", label: "Sinalizar área com placa", nr: "NR-26", crit: "Média", resp: "Manutenção" },
    { n: "04", label: "Posicionar extintor Classe C", nr: "NR-23", crit: "Alta", resp: "Brigada" },
    { n: "05", label: "Aterramento e organização de cabos", nr: "NR-10", crit: "Crítica", resp: "Elétrica" },
    { n: "06", label: "Demarcar faixa de circulação", nr: "NR-12", crit: "Média", resp: "SESMT" },
  ];
  return (
    <div className="absolute inset-0 flex">
      <div className="relative flex-1">
        <IndustrialScene opacity={0.45} />
      </div>
      <div className="flex w-full max-w-md flex-col border-l border-white/10 bg-black/70 p-6 backdrop-blur-xl">
        <div className="text-[10px] uppercase tracking-[0.4em] text-neon/80">
          Memorial de intervenções
        </div>
        <div className="mt-1 font-display text-2xl font-bold text-white">
          Rev. 00 · {items.length} ações
        </div>
        <ul className="mt-5 space-y-2.5">
          {items.map((it, i) => {
            const t = fadeIn(progress, i * 0.14, 0.25);
            const active =
              Math.floor(progress * items.length) === i && progress < 1;
            return (
              <li
                key={it.n}
                className={`rounded-xl border p-3 transition-all ${
                  active
                    ? "border-neon/60 bg-neon/10 shadow-[0_0_25px_rgba(72,255,120,0.15)]"
                    : "border-white/10 bg-white/[0.03]"
                }`}
                style={{
                  opacity: t,
                  transform: `translateY(${(1 - t) * 15}px)`,
                }}
              >
                <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-white/60">
                  <span className="font-mono text-white/90">{it.n}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                      it.crit === "Crítica"
                        ? "bg-red-500/20 text-red-300"
                        : it.crit === "Alta"
                          ? "bg-orange-500/20 text-orange-300"
                          : "bg-yellow-500/20 text-yellow-200"
                    }`}
                  >
                    {it.crit}
                  </span>
                </div>
                <div className="mt-1 text-sm font-medium text-white">
                  {it.label}
                </div>
                <div className="mt-1 flex items-center gap-3 text-[10px] text-white/50">
                  <span className="font-mono">{it.nr}</span>
                  <span>·</span>
                  <span>Resp.: {it.resp}</span>
                  <span>·</span>
                  <span>Prazo: 7 dias</span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

// ==========================================================
// CENA 9 — Relatório PDF
// ==========================================================
function SceneRelatorio({ progress }: { progress: number; format: Format }) {
  const pages = [0, 1, 2, 3];
  return (
    <div className="absolute inset-0 flex items-center justify-center p-6 md:p-12">
      <div className="relative flex h-full max-h-[85%] w-full max-w-4xl items-center justify-center perspective-[1200px]">
        {pages.map((p) => {
          const localStart = p * 0.22;
          const t = fadeIn(progress, localStart, 0.25);
          const flipped = progress > localStart + 0.28 && p < pages.length - 1;
          const rot = flipped ? -170 : 0;
          const z = pages.length - p;
          return (
            <div
              key={p}
              className="absolute left-1/2 top-1/2 aspect-[3/4] h-full max-h-full origin-left"
              style={{
                width: "min(100%, 55vh)",
                transform: `translate(-50%, -50%) rotateY(${rot}deg)`,
                transition: "transform 0.6s ease",
                zIndex: z,
                transformStyle: "preserve-3d",
                opacity: t,
              }}
            >
              <div className="relative h-full w-full overflow-hidden rounded-xl bg-white text-slate-900 shadow-2xl ring-1 ring-black/20">
                <ReportPage page={p} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReportPage({ page }: { page: number }) {
  if (page === 0) {
    return (
      <div className="flex h-full flex-col p-6">
        <div className="flex items-center justify-between border-b border-slate-200 pb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
          <span>Relatório · ValeTech IA</span>
          <span>Página 1 / 4</span>
        </div>
        <div className="mt-4 font-display text-xl font-bold">
          Inspeção Executiva de Segurança
        </div>
        <div className="text-xs text-slate-500">
          Vale · Mina S11D · Correia CR-104
        </div>
        <div className="mt-3 grid flex-1 grid-cols-2 gap-2">
          <div className="rounded bg-slate-100" />
          <div className="rounded bg-slate-100" />
        </div>
        <div className="mt-3 h-3 rounded bg-slate-100" />
        <div className="mt-1 h-3 w-2/3 rounded bg-slate-100" />
        <div className="absolute inset-x-6 bottom-4 flex items-center justify-between text-[9px] text-slate-400">
          <span>Assinado digitalmente</span>
          <span>ValeTech IA · Rastreável</span>
        </div>
      </div>
    );
  }
  if (page === 1) {
    return (
      <div className="flex h-full flex-col p-6">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          Página 2 · Foto e análise
        </div>
        <div className="mt-2 flex-1 rounded bg-slate-100" />
        <div className="mt-3 space-y-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-2 rounded bg-slate-100" />
          ))}
        </div>
      </div>
    );
  }
  if (page === 2) {
    return (
      <div className="flex h-full flex-col p-6">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          Página 3 · Projeto executivo
        </div>
        <div className="mt-2 flex-1 rounded bg-slate-100" />
        <div className="mt-3 grid grid-cols-4 gap-1.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-3 rounded bg-slate-100" />
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col p-6">
      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
        Página 4 · Intervenções e evidências
      </div>
      <div className="mt-3 space-y-1.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded border border-slate-200 px-2 py-1 text-[10px]"
          >
            <span className="font-mono">
              {String(i + 1).padStart(2, "0")} · NR-{10 + i}
            </span>
            <span className="text-slate-500">Ação {i + 1}</span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5">Alta</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==========================================================
// CENA 10 — Antes · Projeto · Executado (slider)
// ==========================================================
function SceneAntesExecutado({ progress }: { progress: number; format: Format }) {
  // Slider vai de 0 -> 100 durante a cena
  const pos = Math.min(100, Math.max(0, progress * 130 - 15));
  return (
    <div className="absolute inset-0 flex flex-col p-6 md:p-12">
      <div className="mb-4 flex items-center justify-center gap-2">
        {["Antes", "Projeto", "Executado"].map((l, i) => {
          const stage = pos < 33 ? 0 : pos < 66 ? 1 : 2;
          return (
            <div
              key={l}
              className={`rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-widest transition-all ${
                i === stage
                  ? "bg-neon text-black shadow-[0_0_20px_rgba(72,255,120,0.5)]"
                  : i < stage
                    ? "bg-neon/30 text-white"
                    : "bg-white/10 text-white/50"
              }`}
            >
              {l}
            </div>
          );
        })}
      </div>
      <div className="relative flex-1 overflow-hidden rounded-xl ring-1 ring-white/10">
        {/* Antes */}
        <div className="absolute inset-0">
          <IndustrialScene opacity={1} />
        </div>
        {/* Projeto */}
        <div
          className="absolute inset-0"
          style={{ clipPath: `inset(0 ${100 - Math.min(100, pos * 1.5)}% 0 0)` }}
        >
          <IndustrialScene opacity={0.6} />
          <svg viewBox="0 0 800 500" className="absolute inset-0 h-full w-full">
            <rect
              x="380"
              y="200"
              width="260"
              height="140"
              fill="#facc1530"
              stroke="#facc15"
              strokeWidth="3"
              strokeDasharray="10 6"
            />
            {[380, 445, 510, 575, 640].map((cx) => (
              <polygon
                key={cx}
                points={`${cx},340 ${cx - 10},365 ${cx + 10},365`}
                fill="#f97316"
              />
            ))}
            <path
              d="M 40 420 L 300 420 L 300 380 L 380 380"
              fill="none"
              stroke="#22c55e"
              strokeWidth="6"
              strokeLinecap="round"
            />
          </svg>
        </div>
        {/* Executado */}
        <div
          className="absolute inset-0"
          style={{ clipPath: `inset(0 0 0 ${Math.max(0, pos - 33) * 1.5}%)` }}
        >
          <IndustrialScene opacity={0.85} clean />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/20 px-6 py-3 backdrop-blur-xl">
              <div className="text-[10px] uppercase tracking-[0.4em] text-emerald-300">
                Executado
              </div>
              <div className="mt-1 font-display text-2xl font-bold text-white">
                Correção comprovada
              </div>
            </div>
          </div>
        </div>

        {/* Divisor 1 */}
        <div
          className="absolute inset-y-0 w-0.5 bg-white shadow-[0_0_20px_rgba(255,255,255,0.8)]"
          style={{ left: `${Math.min(100, pos * 1.5)}%` }}
        >
          <div className="absolute left-1/2 top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-black shadow-xl">
            <ChevronLeft className="h-3 w-3" />
            <ChevronRight className="h-3 w-3" />
          </div>
        </div>
        {/* Divisor 2 */}
        <div
          className="absolute inset-y-0 w-0.5 bg-neon shadow-[0_0_20px_rgba(72,255,120,0.8)]"
          style={{ left: `${Math.max(0, pos - 33) * 1.5}%`, opacity: pos > 33 ? 1 : 0 }}
        />
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full bg-gradient-to-r from-white via-neon to-emerald-400"
          style={{ width: `${pos}%` }}
        />
      </div>
      <RiskBandsLegend progress={progress} start={0.35} compact className="mt-3" />
    </div>
  );
}

// ==========================================================
// CENA 11 — Histórico
// ==========================================================
function SceneHistorico({ progress }: { progress: number; format: Format }) {
  const revs = [
    { r: "Rev 00", d: "Análise inicial", date: "12 · 07 · 2026", by: "IA" },
    { r: "Rev 01", d: "Ajuste do memorial", date: "14 · 07 · 2026", by: "Márcia P." },
    { r: "Rev 02", d: "Aprovação SESMT", date: "17 · 07 · 2026", by: "Coord." },
    { r: "Rev 03", d: "Execução comprovada", date: "20 · 07 · 2026", by: "Campo" },
  ];
  const openIdx = Math.min(revs.length - 1, Math.floor(progress * revs.length));
  return (
    <div className="absolute inset-0 flex gap-4 p-6 md:p-12">
      <Glass className="w-full max-w-xs p-5">
        <div className="text-[10px] uppercase tracking-[0.4em] text-neon/80">
          Histórico
        </div>
        <ul className="mt-4 space-y-1">
          {revs.map((r, i) => {
            const t = fadeIn(progress, i * 0.15, 0.2);
            const active = i === openIdx;
            return (
              <li
                key={r.r}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-all ${
                  active
                    ? "bg-neon/15 text-neon ring-1 ring-neon/40"
                    : "text-white/80 hover:bg-white/5"
                }`}
                style={{ opacity: t }}
              >
                <span className="flex items-center gap-2">
                  <History className="h-3.5 w-3.5" />
                  <span className="font-mono">{r.r}</span>
                </span>
                <span className="text-[10px] text-white/50">{r.date}</span>
              </li>
            );
          })}
        </ul>
      </Glass>
      <Glass className="flex-1 p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.4em] text-neon/80">
              Revisão aberta
            </div>
            <div className="mt-1 font-display text-2xl font-bold text-white">
              {revs[openIdx].r} · {revs[openIdx].d}
            </div>
          </div>
          <div className="rounded-full border border-white/15 px-3 py-1 text-[10px] uppercase tracking-widest text-white/70">
            por {revs[openIdx].by}
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4">
          <div className="aspect-video overflow-hidden rounded-lg ring-1 ring-white/10">
            <IndustrialScene opacity={0.9} />
          </div>
          <div className="aspect-video overflow-hidden rounded-lg ring-1 ring-white/10">
            <IndustrialScene opacity={0.6} clean={openIdx >= 3} />
          </div>
        </div>
        <div className="mt-4 space-y-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-2 rounded bg-white/10"
              style={{ width: `${90 - i * 20}%` }}
            />
          ))}
        </div>
      </Glass>
    </div>
  );
}

// ==========================================================
// CENA 12 — Indicadores
// ==========================================================
function SceneIndicadores({ progress }: { progress: number; format: Format }) {
  return (
    <div className="absolute inset-0 grid grid-cols-2 gap-4 p-6 md:grid-cols-3 md:gap-5 md:p-12">
      {/* Barras */}
      <Glass className="col-span-2 p-5">
        <div className="text-[10px] uppercase tracking-[0.4em] text-neon/80">
          NRs mais recorrentes
        </div>
        <div className="mt-4 flex h-40 items-end gap-3">
          {[
            { n: "NR-10", v: 85 },
            { n: "NR-11", v: 70 },
            { n: "NR-06", v: 55 },
            { n: "NR-35", v: 45 },
            { n: "NR-17", v: 38 },
            { n: "NR-23", v: 30 },
            { n: "NR-01", v: 22 },
          ].map((b, i) => {
            const t = fadeIn(progress, 0.05 + i * 0.05, 0.25);
            return (
              <div key={b.n} className="flex flex-1 flex-col items-center gap-2">
                <div
                  className="w-full rounded-t-md bg-gradient-to-t from-neon/40 to-neon"
                  style={{
                    height: `${b.v * t}%`,
                    boxShadow: "0 0 15px rgba(72,255,120,0.4)",
                  }}
                />
                <span className="font-mono text-[10px] text-white/60">{b.n}</span>
              </div>
            );
          })}
        </div>
      </Glass>

      {/* Donut áreas críticas */}
      <Glass className="p-5">
        <div className="text-[10px] uppercase tracking-[0.4em] text-neon/80">
          Áreas críticas
        </div>
        <div className="mt-3 flex items-center justify-center">
          <svg width="140" height="140" viewBox="0 0 100 100">
            {[
              { c: "#22d3ee", s: 0, e: 30 },
              { c: "#f43f5e", s: 30, e: 55 },
              { c: "#facc15", s: 55, e: 80 },
              { c: "#a78bfa", s: 80, e: 100 },
            ].map((seg, i) => {
              const t = fadeIn(progress, 0.2 + i * 0.1, 0.2);
              const dash = (seg.e - seg.s) * 2.51 * t;
              const off = -seg.s * 2.51;
              return (
                <circle
                  key={i}
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke={seg.c}
                  strokeWidth="14"
                  strokeDasharray={`${dash} 251`}
                  strokeDashoffset={off}
                  transform="rotate(-90 50 50)"
                />
              );
            })}
          </svg>
        </div>
        <RiskBandsLegend progress={progress} start={0.55} compact className="mt-3" />
      </Glass>

      {/* Stats */}
      <Glass className="p-5">
        <div className="text-[10px] uppercase tracking-[0.4em] text-neon/80">
          Tempo médio
        </div>
        <div className="mt-2 font-display text-4xl font-black text-white">
          4,2 <span className="text-lg text-white/50">dias</span>
        </div>
        <div className="mt-1 text-[11px] text-neon">▲ 18% mais rápido</div>
      </Glass>

      {/* Correções */}
      <Glass className="p-5">
        <div className="text-[10px] uppercase tracking-[0.4em] text-neon/80">
          Correções executadas
        </div>
        <div className="mt-2 font-display text-4xl font-black text-white">
          312
        </div>
        <div className="mt-1 text-[11px] text-white/60">
          Pendências: <span className="text-amber-300">37</span>
        </div>
      </Glass>

      {/* Linha evolução */}
      <Glass className="col-span-2 p-5">
        <div className="text-[10px] uppercase tracking-[0.4em] text-neon/80">
          Evolução mensal
        </div>
        <svg viewBox="0 0 300 100" className="mt-2 h-24 w-full">
          <polyline
            points="0,80 40,70 80,55 120,45 160,50 200,30 240,20 300,10"
            fill="none"
            stroke="#48ff78"
            strokeWidth="2.5"
            strokeDasharray="500"
            strokeDashoffset={(1 - fadeIn(progress, 0.3, 0.4)) * 500}
          />
          <polyline
            points="0,80 40,70 80,55 120,45 160,50 200,30 240,20 300,10 300,100 0,100"
            fill="url(#gradL)"
            opacity={fadeIn(progress, 0.5, 0.3)}
          />
          <defs>
            <linearGradient id="gradL" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#48ff78" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#48ff78" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </Glass>
    </div>
  );
}

// ==========================================================
// CENA 13 — Exportações
// ==========================================================
function SceneExportacoes({ progress }: { progress: number; format: Format }) {
  const exports = [
    { label: "PDF Executivo", icon: FileDown, color: "text-red-300", bg: "from-red-500/20 to-transparent" },
    { label: "PNG", icon: FileImage, color: "text-sky-300", bg: "from-sky-500/20 to-transparent" },
    { label: "Excel", icon: FileSpreadsheet, color: "text-emerald-300", bg: "from-emerald-500/20 to-transparent" },
    { label: "Checklist", icon: ClipboardList, color: "text-yellow-300", bg: "from-yellow-500/20 to-transparent" },
    { label: "Projeto Executivo", icon: LayoutGrid, color: "text-violet-300", bg: "from-violet-500/20 to-transparent" },
  ];
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center p-6 md:p-12">
      <div
        className="text-center"
        style={{ opacity: fadeIn(progress, 0, 0.2) }}
      >
        <div className="text-[10px] uppercase tracking-[0.4em] text-neon/80">
          Exportações
        </div>
        <div className="mt-1 font-display text-3xl font-bold text-white md:text-5xl">
          Tudo pronto em um clique
        </div>
      </div>
      <div className="mt-8 grid w-full max-w-4xl grid-cols-2 gap-4 md:grid-cols-5">
        {exports.map((e, i) => {
          const t = fadeIn(progress, 0.1 + i * 0.1, 0.25);
          const Icon = e.icon;
          return (
            <Glass
              key={e.label}
              className="relative overflow-hidden p-5"
              style={{
                opacity: t,
                transform: `translateY(${(1 - t) * 30}px) scale(${0.9 + 0.1 * t})`,
              }}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${e.bg}`} />
              <div className="relative flex flex-col items-center gap-3 text-center">
                <Icon className={`h-8 w-8 ${e.color}`} />
                <div className="text-xs font-semibold uppercase tracking-widest text-white">
                  {e.label}
                </div>
                <div className="flex items-center gap-1 text-[10px] text-neon">
                  <Check className="h-3 w-3" strokeWidth={3} />
                  Gerado
                </div>
              </div>
            </Glass>
          );
        })}
      </div>
    </div>
  );
}

// ==========================================================
// CENA 14 — Gestão / filtros
// ==========================================================
function SceneGestao({ progress }: { progress: number; format: Format }) {
  const filters = [
    { label: "Empresa", value: "Vale S.A.", icon: Building2 },
    { label: "Contrato", value: "CT-2026-118", icon: FileText },
    { label: "Área", value: "Logística", icon: MapPin },
    { label: "Data", value: "Jul / 2026", icon: Calendar },
    { label: "Responsável", value: "SESMT", icon: Users },
  ];
  return (
    <div className="absolute inset-0 flex flex-col p-6 md:p-12">
      <div
        className="flex items-center gap-3"
        style={{ opacity: fadeIn(progress, 0, 0.2) }}
      >
        <Filter className="h-5 w-5 text-neon" />
        <div>
          <div className="text-[10px] uppercase tracking-[0.4em] text-neon/80">
            Gestão
          </div>
          <div className="font-display text-2xl font-bold text-white md:text-3xl">
            Filtros e governança
          </div>
        </div>
      </div>
      <Glass className="mt-6 flex flex-wrap gap-2 p-4">
        {filters.map((f, i) => {
          const t = fadeIn(progress, 0.15 + i * 0.1, 0.2);
          const Icon = f.icon;
          return (
            <div
              key={f.label}
              className="flex items-center gap-2 rounded-full border border-neon/30 bg-neon/5 px-3 py-1.5 text-xs text-white"
              style={{
                opacity: t,
                transform: `translateY(${(1 - t) * 10}px)`,
              }}
            >
              <Icon className="h-3.5 w-3.5 text-neon" />
              <span className="text-white/60">{f.label}:</span>
              <span className="font-semibold">{f.value}</span>
            </div>
          );
        })}
      </Glass>
      <Glass className="mt-4 flex-1 overflow-hidden p-4">
        <div className="grid grid-cols-6 gap-2 border-b border-white/10 pb-2 text-[10px] uppercase tracking-widest text-white/50">
          <span>ID</span>
          <span className="col-span-2">Título</span>
          <span>Área</span>
          <span>NR</span>
          <span>Status</span>
        </div>
        <ul className="mt-2 space-y-1.5">
          {Array.from({ length: 6 }).map((_, i) => {
            const t = fadeIn(progress, 0.55 + i * 0.06, 0.2);
            return (
              <li
                key={i}
                className="grid grid-cols-6 items-center gap-2 rounded-md border border-white/5 bg-white/[0.02] px-2 py-2 text-xs text-white/80"
                style={{ opacity: t, transform: `translateX(${(1 - t) * -10}px)` }}
              >
                <span className="font-mono text-white/50">
                  #{2101 + i}
                </span>
                <span className="col-span-2 truncate">
                  {[
                    "Correia CR-104 · fiação exposta",
                    "Silo S-07 · guarda-corpo",
                    "Pátio B · rota obstruída",
                    "Oficina · piso molhado",
                    "Portaria · sinalização",
                    "Túnel L2 · linha de vida",
                  ][i]}
                </span>
                <span className="text-white/70">
                  {["Logística", "Processo", "Pátio", "Manut.", "Adm.", "Túneis"][i]}
                </span>
                <span className="font-mono">NR-{[10, 35, 11, 1, 26, 35][i]}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-center text-[10px] font-bold ${
                    i % 3 === 0
                      ? "bg-emerald-500/20 text-emerald-300"
                      : i % 3 === 1
                        ? "bg-yellow-500/20 text-yellow-200"
                        : "bg-sky-500/20 text-sky-300"
                  }`}
                >
                  {["Concluído", "Em andamento", "Aberto"][i % 3]}
                </span>
              </li>
            );
          })}
        </ul>
      </Glass>
    </div>
  );
}

// ==========================================================
// CENA 15 — Encerramento
// ==========================================================
function SceneEncerramento({ progress }: { progress: number; format: Format }) {
  const t1 = fadeIn(progress, 0, 0.25);
  const t2 = fadeIn(progress, 0.3, 0.25);
  const t3 = fadeIn(progress, 0.55, 0.25);
  const t4 = fadeIn(progress, 0.75, 0.2);
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
      <div
        className="flex flex-col items-center gap-3"
        style={{ opacity: t1, transform: `translateY(${(1 - t1) * 15}px)` }}
      >
        <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-neon/10 ring-2 ring-neon/60">
          <div className="absolute inset-0 animate-pulse rounded-full bg-neon/20 blur-2xl" />
          <div className="h-9 w-9 rounded-full bg-neon shadow-[0_0_60px_rgba(72,255,120,0.9)]" />
        </div>
        <h2 className="font-display text-5xl font-black md:text-7xl">
          ValeTech IA
        </h2>
      </div>
      <div
        className="mt-6 max-w-2xl text-center"
        style={{ opacity: t2 }}
      >
        <p className="text-lg text-white/80 md:text-2xl">
          Muito mais do que inspeções.
        </p>
        <p className="mt-1 text-sm text-white/60 md:text-lg">
          Transformamos fotografias em projetos executivos.
        </p>
      </div>
      <div
        className="mt-6 flex flex-wrap items-center justify-center gap-2"
        style={{ opacity: t3 }}
      >
        {["Segurança", "Engenharia", "Conformidade"].map((w) => (
          <span
            key={w}
            className="rounded-full border border-neon/40 bg-neon/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-neon"
          >
            {w}
          </span>
        ))}
      </div>
      <div
        className="mt-8 flex flex-col items-center gap-2"
        style={{ opacity: t4 }}
      >
        <div className="text-xs uppercase tracking-[0.4em] text-white/50">
          www.valetech.ai
        </div>
        <div className="rounded-full bg-neon px-6 py-2.5 text-sm font-bold text-black shadow-[0_0_30px_rgba(72,255,120,0.4)]">
          Solicite uma demonstração
        </div>
      </div>
    </div>
  );
}

// ==========================================================
// Cenário industrial — foto real (asset)
// ==========================================================


function IndustrialScene({
  opacity = 1,
  clean = false,
}: {
  opacity?: number;
  clean?: boolean;
}) {
  return (
    <div
      className="absolute inset-0 h-full w-full overflow-hidden"
      style={{ opacity }}
    >
      <img
        src={cenaRealAsset.url}
        alt="Cena industrial real"
        className="absolute inset-0 h-full w-full object-cover"
        style={{
          filter: clean
            ? "saturate(1.05) brightness(1.05) contrast(1.02)"
            : "saturate(0.95) contrast(1.05)",
        }}
      />
      {/* Leve gradiente para integrar com o tema escuro */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/40" />
      {clean && (
        <div className="pointer-events-none absolute inset-0 bg-emerald-500/5" />
      )}
    </div>
  );
}


function MiniIndustrial({ hue }: { hue: number }) {
  const cols = ["#1e2a3a", "#2a1e2a", "#1e2a1e"];
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full">
      <rect width="100" height="60" fill={cols[hue]} />
      <rect y="60" width="100" height="40" fill="#0a0d11" />
      <polygon points="10,60 10,30 40,20 70,30 70,60" fill="#141a22" />
      <rect x="25" y="45" width="10" height="15" fill="#000" />
      <rect x="45" y="45" width="10" height="15" fill="#000" />
      <rect x="75" y="70" width="18" height="20" fill="#8a5a2b" />
      <path d="M 5 40 Q 40 55 70 35 T 100 45" fill="none" stroke="#facc15" strokeWidth="1" />
    </svg>
  );
}
