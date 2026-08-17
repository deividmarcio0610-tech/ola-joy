import { validateFile } from "@/lib/validation";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ScanLine,
  LayoutGrid,
  Bell,
  LogOut,
  X,
  Loader2,
  RotateCcw,
  Camera as CameraIcon,
  FileDown,
} from "lucide-react";
import { exportVisionReportPdf } from "@/lib/vision-pdf";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  EquipAreaFields,
  emptyEquipArea,
  equipAreaPromptSuffix,
} from "@/components/equip-area-fields";
import { toast } from "sonner";
import { chamarIrisChat } from "@/lib/iris-analyze";
import { handleAiError } from "@/lib/ai-credits-error";

export const Route = createFileRoute("/_authenticated/vision")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "VisionGuard AI · Vision AI IA" },
      {
        name: "description",
        content:
          "Scanner 5S com IA. Aponte a câmera, analise riscos e receba plano de ação em segundos.",
      },
    ],
  }),
  component: VisionScan,
});

type Detection = {
  id: number;
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  correction: string;
  confidence: number; // 0-100
  // bounding box in %
  x: number;
  y: number;
  w: number;
  h: number;
};
type Report = {
  score: number; // 0-100
  s: { seiri: number; seiton: number; seiso: number; seiketsu: number; shitsuke: number };
  detections: Detection[];
};

type Phase = "camera" | "scanning" | "result-overlay" | "report";

function VisionScan() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>("camera");
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [note, setNote] = useState("");
  const [ctx, setCtx] = useState(emptyEquipArea);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 1280 },
          },
          audio: false,
        });
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          await videoRef.current.play().catch(() => {});
        }
      } catch {
        setCameraError("Não foi possível acessar a câmera. Use o botão para enviar uma foto.");
      }
    }
    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function captureFromVideo(): string | null {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return null;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(v, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.85);
  }

  async function handleScan() {
    let img = snapshot;
    if (!img) img = captureFromVideo();
    if (!img) {
      toast.error("Sem imagem para analisar.");
      return;
    }
    setSnapshot(img);
    setPhase("scanning");
    setProgress(0);
    const t = setInterval(() => setProgress((p) => Math.min(95, p + Math.random() * 12)), 250);

    try {
      const data = await chamarIrisChat({
        messages: [
          {
            role: "system",
            content:
              'Você é IA, IA de visão industrial (mineração/siderurgia). Analise a foto e retorne EXCLUSIVAMENTE JSON com o formato: {"score":0-100,"s":{"seiri":0-100,"seiton":0-100,"seiso":0-100,"seiketsu":0-100,"shitsuke":0-100},"detections":[{"id":1,"severity":"critical|warning|info","title":"...","description":"...","correction":"...","confidence":0-100,"x":0-100,"y":0-100,"w":0-100,"h":0-100}]}. As coordenadas x,y,w,h são porcentagem da imagem (canto sup-esq + largura/altura). Detecte vazamentos, sujeira, cabos no chão, desorganização, EPI, obstruções, falhas 5S. Máx 6 detecções. Sem texto fora do JSON.',
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analise esta cena operacional 5S." + equipAreaPromptSuffix(ctx),
              },
              { type: "image_url", image_url: { url: img } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      });
      const text = (data.choices?.[0]?.message?.content ?? "{}").replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(text) as Report;
      setReport(parsed);
      setProgress(100);
      setTimeout(() => setPhase("result-overlay"), 250);
    } catch (e) {
      handleAiError(e, "Erro ao analisar. Tente novamente.");
      setPhase("camera");
    } finally {
      clearInterval(t);
    }
  }

  function reset() {
    setSnapshot(null);
    setReport(null);
    setNote("");
    setPhase("camera");
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    location.href = "/auth";
  }

  async function onPickFile(f: File) {
    const v = validateFile(f, "image");
    if (!v.ok) {
      toast.error(v.error);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setSnapshot(reader.result as string);
      setTimeout(handleScan, 50);
    };
    reader.readAsDataURL(f);
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-black text-foreground">
      {/* Header */}
      <header className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-7 w-7 items-center justify-center rounded-md bg-neon/10 ring-1 ring-neon/50">
            <span className="font-display text-xs font-bold text-neon">V</span>
            <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 animate-pulse rounded-full bg-neon" />
          </div>
          <div className="leading-tight">
            <div className="font-display text-[13px] font-semibold tracking-widest">
              VisionGuard AI.
            </div>
            <div className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
              Vision AI · IA
            </div>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="rounded-md p-1.5 text-muted-foreground hover:text-neon"
          aria-label="Sair"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      {/* Viewport */}
      <div className="relative flex-1 overflow-hidden px-3">
        <div
          className="relative h-full w-full overflow-hidden rounded-2xl border-2 border-neon"
          style={{
            boxShadow:
              "0 0 20px 2px oklch(0.87 0.27 145 / 0.35), inset 0 0 30px oklch(0.87 0.27 145 / 0.15)",
          }}
        >
          {/* Video / snapshot */}
          {snapshot ? (
            <img src={snapshot} alt="scan" className="h-full w-full object-cover" />
          ) : (
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="h-full w-full object-cover"
            />
          )}

          {/* Corner reticles */}
          <Reticles />

          {/* Camera error */}
          {cameraError && !snapshot && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 p-6 text-center">
              <CameraIcon className="h-8 w-8 text-neon" />
              <p className="text-sm text-muted-foreground">{cameraError}</p>
              <label className="cursor-pointer rounded-md bg-neon px-4 py-2 text-xs font-semibold text-primary-foreground">
                Enviar foto
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && onPickFile(e.target.files[0])}
                />
              </label>
            </div>
          )}

          {/* Scanning overlay */}
          {phase === "scanning" && (
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute inset-x-0 top-0 h-1 bg-neon shadow-[0_0_20px_var(--neon)] animate-[scanline_1.8s_linear_infinite]" />
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full border border-neon/50 bg-black/60 px-3 py-1 font-display text-[10px] uppercase tracking-widest text-neon backdrop-blur">
                Analisando · {Math.round(progress)}%
              </div>
            </div>
          )}

          {/* Result overlay: detection boxes + radar */}
          {phase === "result-overlay" && report && (
            <>
              <div className="absolute inset-x-0 top-0 flex items-center gap-2 bg-gradient-to-b from-black/80 to-transparent p-3">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-neon text-primary-foreground">
                  ✓
                </div>
                <div className="font-display text-xs tracking-widest">
                  Análise concluída · <span className="text-neon">Score {report.score}/100</span>
                </div>
              </div>
              {report.detections.slice(0, 6).map((d) => (
                <DetectionBox key={d.id} d={d} />
              ))}
              <RadarRings score={report.score} />
              <button
                onClick={() => setPhase("report")}
                className="absolute inset-x-3 bottom-3 rounded-lg bg-neon py-2.5 text-center font-display text-xs font-semibold uppercase tracking-widest text-primary-foreground shadow-[0_0_24px_var(--neon)]"
              >
                Ver relatório completo
              </button>
            </>
          )}
        </div>
      </div>

      {/* Equipment/area fields on camera phase */}
      {phase === "camera" && (
        <div className="px-3 pt-3">
          <EquipAreaFields value={ctx} onChange={setCtx} />
        </div>
      )}

      {/* Note field on result overlay */}
      {phase === "result-overlay" && (
        <div className="px-3 pt-3">
          <Textarea
            rows={1}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Observações do inspetor (opcional)"
            className="resize-none border-border/60 bg-card/50 text-sm"
          />
        </div>
      )}

      {/* Full report screen */}
      {phase === "report" && report && (
        <ReportScreen
          report={report}
          image={snapshot ?? undefined}
          note={[
            ctx.equipamento && `Equipamento/TAG: ${ctx.equipamento}`,
            ctx.area && `Área/Local: ${ctx.area}`,
            note,
          ]
            .filter(Boolean)
            .join(" · ")}
          onClose={reset}
        />
      )}

      {/* Bottom nav */}
      <nav className="relative mt-3 flex items-end justify-between border-t border-border/60 bg-black/80 px-4 pb-6 pt-3 backdrop-blur">
        <NavItem to="/dashboard" label="PAINEL" icon={LayoutGrid} />
        <NavItem to="/notificacoes" label="CAMPO" icon={Bell} />
        <div className="-mt-8 flex flex-col items-center">
          <button
            onClick={phase === "camera" ? handleScan : reset}
            aria-label="Escanear"
            className="relative flex h-16 w-16 items-center justify-center rounded-full bg-neon text-primary-foreground shadow-[0_0_35px_var(--neon)] transition active:scale-95"
          >
            {phase === "scanning" ? (
              <Loader2 className="h-7 w-7 animate-spin" />
            ) : phase === "camera" ? (
              <ScanLine className="h-7 w-7" />
            ) : (
              <RotateCcw className="h-7 w-7" />
            )}
            <span className="absolute inset-0 -z-10 animate-ping rounded-full bg-neon/40" />
          </button>
        </div>
      </nav>

      <style>{`
        @keyframes scanline {
          0% { transform: translateY(0); opacity: 1; }
          50% { transform: translateY(100%); opacity: 1; }
          51% { opacity: 0; }
          100% { transform: translateY(0); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function NavItem({
  to,
  label,
  icon: Icon,
}: {
  to: string;
  label: string;
  icon: typeof LayoutGrid;
}) {
  return (
    <Link
      to={to}
      className="flex w-14 flex-col items-center gap-1 text-muted-foreground hover:text-neon"
    >
      <Icon className="h-5 w-5" />
      <span className="font-display text-[9px] tracking-[0.2em]">{label}</span>
    </Link>
  );
}

function Reticles() {
  const cls = "absolute h-5 w-5 border-neon";
  return (
    <>
      <span className={`${cls} left-2 top-2 border-l-2 border-t-2`} />
      <span className={`${cls} right-2 top-2 border-r-2 border-t-2`} />
      <span className={`${cls} bottom-2 left-2 border-b-2 border-l-2`} />
      <span className={`${cls} bottom-2 right-2 border-b-2 border-r-2`} />
    </>
  );
}

function DetectionBox({ d }: { d: Detection }) {
  const color =
    d.severity === "critical"
      ? "border-red-500 text-red-100 bg-red-500"
      : d.severity === "warning"
        ? "border-yellow-400 text-black bg-yellow-400"
        : "border-neon text-primary-foreground bg-neon";
  const strokeCls =
    d.severity === "critical"
      ? "border-red-500 shadow-[0_0_12px_rgba(239,68,68,0.6)]"
      : d.severity === "warning"
        ? "border-yellow-400 shadow-[0_0_12px_rgba(250,204,21,0.6)]"
        : "border-neon shadow-[0_0_12px_var(--neon)]";
  return (
    <div
      className={`absolute rounded border-2 ${strokeCls}`}
      style={{
        left: `${clamp(d.x)}%`,
        top: `${clamp(d.y)}%`,
        width: `${clamp(d.w, 5, 100 - d.x)}%`,
        height: `${clamp(d.h, 5, 100 - d.y)}%`,
      }}
    >
      <div
        className={`absolute -top-5 left-0 rounded-sm px-1.5 py-0.5 font-display text-[9px] font-semibold tracking-widest ${color}`}
      >
        #{d.id} · {d.confidence}%
      </div>
    </div>
  );
}

function clamp(v: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v));
}

function RadarRings({ score }: { score: number }) {
  const color = score >= 70 ? "var(--neon)" : score >= 40 ? "#facc15" : "#ef4444";
  return (
    <div className="pointer-events-none absolute bottom-16 left-1/2 h-40 w-40 -translate-x-1/2 opacity-70">
      <div
        className="absolute inset-0 rounded-full border-2 animate-ping"
        style={{ borderColor: color }}
      />
      <div
        className="absolute inset-4 rounded-full border"
        style={{ borderColor: color, opacity: 0.7 }}
      />
      <div
        className="absolute inset-10 rounded-full border"
        style={{ borderColor: color, opacity: 0.5 }}
      />
    </div>
  );
}

function ReportScreen({
  report,
  image,
  note,
  onClose,
}: {
  report: Report;
  image?: string;
  note: string;
  onClose: () => void;
}) {
  const items = report.detections;
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error("Sessão expirada");
      let photo_path: string | null = null;
      if (image?.startsWith("data:")) {
        const blob = await (await fetch(image)).blob();
        photo_path = `${uid}/${Date.now()}-vision.jpg`;
        const up = await supabase.storage
          .from("inspections")
          .upload(photo_path, blob, { contentType: "image/jpeg" });
        if (up.error) throw up.error;
      }
      const risk_level = report.score >= 70 ? "verde" : report.score >= 40 ? "amarelo" : "vermelho";
      await supabase.from("inspections").insert({
        user_id: uid,
        area: "Vision AI",
        location: note || null,
        photo_before_url: photo_path,
        risk_level: risk_level as never,
        ai_analysis: report as unknown as never,
        action_plan: null as never,
        status: "aberta",
      });
      toast.success("Relatório salvo.");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-black">
      <header className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-neon/10 ring-1 ring-neon/50">
            <span className="font-display text-[10px] font-bold text-neon">V</span>
          </div>
          <div>
            <div className="font-display text-[12px] font-semibold tracking-widest">
              VisionGuard AI.
            </div>
            <div className="text-[8px] uppercase tracking-[0.25em] text-muted-foreground">
              Vision AI · IA
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1.5 text-muted-foreground hover:text-neon"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mb-4 rounded-xl border border-border bg-card/40 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Score consolidado
              </div>
              <div className="mt-1 font-display text-4xl font-semibold text-neon">
                {report.score}
                <span className="text-lg text-muted-foreground">/100</span>
              </div>
            </div>
            <ScoreRing value={report.score} />
          </div>
        </div>

        {/* 5S bars */}
        <div className="mb-5 grid grid-cols-5 gap-2">
          {(
            [
              ["seiri", "SENSO UTIL."],
              ["seiton", "SEITON ORDEM"],
              ["seiso", "SEISO LIMPEZ."],
              ["seiketsu", "SEIKETSU PADR."],
              ["shitsuke", "SHITSUKE DISC."],
            ] as const
          ).map(([k, l]) => {
            const v = report.s?.[k] ?? 0;
            const color = v >= 70 ? "bg-neon" : v >= 40 ? "bg-yellow-400" : "bg-red-500";
            return (
              <div key={k} className="rounded-md border border-border bg-card/40 p-2">
                <div className="mb-1 h-16 w-full items-end overflow-hidden rounded bg-black/60">
                  <div
                    className={`${color} ml-0 mt-auto w-full`}
                    style={{ height: `${clamp(v)}%`, marginTop: `${100 - clamp(v)}%` }}
                  />
                </div>
                <div className="font-display text-[10px] font-semibold text-foreground">{v}</div>
                <div className="mt-0.5 truncate font-display text-[8px] tracking-widest text-muted-foreground">
                  {l}
                </div>
              </div>
            );
          })}
        </div>

        <h3 className="mb-2 font-display text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Riscos identificados
        </h3>

        <div className="space-y-2.5 pb-6">
          {items.map((d) => (
            <FindingCard key={d.id} d={d} />
          ))}
          {items.length === 0 && (
            <div className="rounded-lg border border-neon/30 bg-neon/5 p-4 text-center text-sm text-neon">
              Nenhum risco identificado. Ambiente conforme.
            </div>
          )}
        </div>

        <p className="pb-2 text-[10px] italic text-muted-foreground">
          AVISO: As ações propostas pela IA devem ser avaliadas e validadas pelos responsáveis antes
          da execução.
        </p>
      </div>

      <div className="border-t border-border/60 bg-black/80 p-3">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="flex-1 min-w-[100px]" onClick={onClose}>
            Novo scan
          </Button>
          <Button
            variant="outline"
            className="flex-1 min-w-[120px] gap-2 border-neon/50 text-neon hover:bg-neon/10"
            onClick={() => exportVisionReportPdf({ report, image, note })}
          >
            <FileDown className="h-4 w-4" />
            Exportar PDF
          </Button>
          <Button className="flex-1 min-w-[120px]" onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </div>
      </div>
    </div>
  );
}

function FindingCard({ d }: { d: Detection }) {
  const badge =
    d.severity === "critical"
      ? "bg-red-500 text-white"
      : d.severity === "warning"
        ? "bg-yellow-400 text-black"
        : "bg-neon text-primary-foreground";
  const label =
    d.severity === "critical" ? "CRITICAL" : d.severity === "warning" ? "WARNING" : "INFO";
  return (
    <div className="rounded-lg border border-border bg-card/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`rounded px-1.5 py-0.5 font-display text-[9px] font-bold tracking-widest ${badge}`}
          >
            #{d.id} {label}
          </span>
          <h4 className="text-sm font-semibold text-foreground">{d.title}</h4>
        </div>
        <span className="font-display text-[11px] text-muted-foreground">{d.confidence}%</span>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{d.description}</p>
      <div className="mt-2 rounded border-l-2 border-neon/60 bg-neon/5 px-2 py-1.5 text-xs leading-relaxed">
        <span className="font-display text-[10px] font-semibold tracking-widest text-neon">
          CORREÇÃO:
        </span>{" "}
        <span className="text-foreground/90">{d.correction}</span>
      </div>
    </div>
  );
}

function ScoreRing({ value }: { value: number }) {
  const v = clamp(value);
  const color = v >= 70 ? "var(--neon)" : v >= 40 ? "#facc15" : "#ef4444";
  const dash = (v / 100) * 251.2;
  return (
    <svg width="72" height="72" viewBox="0 0 90 90" className="-rotate-90">
      <circle cx="45" cy="45" r="40" stroke="oklch(0.25 0 0)" strokeWidth="6" fill="none" />
      <circle
        cx="45"
        cy="45"
        r="40"
        stroke={color}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${dash} 251.2`}
        fill="none"
        style={{ filter: `drop-shadow(0 0 6px ${color})` }}
      />
    </svg>
  );
}
