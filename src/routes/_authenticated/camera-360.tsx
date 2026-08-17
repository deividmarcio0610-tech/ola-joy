import { validateFile } from "@/lib/validation";
import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  Video,
  Upload,
  Loader2,
  Sparkles,
  Play,
  AlertTriangle,
  CheckCircle2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ModuleShell } from "@/components/module-shell";
import {
  EquipAreaFields,
  emptyEquipArea,
  equipAreaPromptSuffix,
} from "@/components/equip-area-fields";
import { toast } from "sonner";
import { chamarIrisChat } from "@/lib/iris-analyze";
import { handleAiError } from "@/lib/ai-credits-error";

export const Route = createFileRoute("/_authenticated/camera-360")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Câmera 360° · VisionGuard AI" },
      {
        name: "description",
        content:
          "Envie um vídeo de até 1 minuto. A IA analisa todos os itens e gera um plano de melhorias completo.",
      },
    ],
  }),
  component: Camera360Page,
});

type Finding = {
  id: number;
  severity: "critical" | "warning" | "info";
  timestamp: string;
  title: string;
  description: string;
  correction: string;
};
type VideoReport = {
  score: number;
  summary: string;
  improvements: string[];
  findings: Finding[];
};

const MAX_DURATION = 60; // seconds
const MAX_SIZE = 60 * 1024 * 1024; // 60MB

function Camera360Page() {
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [note, setNote] = useState("");
  const [ctx, setCtx] = useState(emptyEquipArea);
  const [frames, setFrames] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [report, setReport] = useState<VideoReport | null>(null);

  function reset() {
    if (url) URL.revokeObjectURL(url);
    setFile(null);
    setUrl(null);
    setDuration(0);
    setFrames([]);
    setReport(null);
    setNote("");
  }

  async function onPick(f: File | undefined) {
    if (!f) return;
    const v = validateFile(f, "video");
    if (!v.ok) return toast.error(v.error);
    const u = URL.createObjectURL(f);
    // pre-check duration
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.src = u;
    await new Promise<void>((res) => {
      probe.onloadedmetadata = () => res();
      probe.onerror = () => res();
    });
    if (probe.duration > MAX_DURATION + 0.5) {
      URL.revokeObjectURL(u);
      return toast.error(`Vídeo excede 1 minuto (${probe.duration.toFixed(1)}s).`);
    }
    setFile(f);
    setUrl(u);
    setDuration(probe.duration);
    setReport(null);
    setFrames([]);
  }

  async function extractFrames(v: HTMLVideoElement, count = 4): Promise<string[]> {
    const out: string[] = [];
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return out;
    const w = Math.min(v.videoWidth, 720);
    const scale = w / v.videoWidth;
    canvas.width = w;
    canvas.height = Math.round(v.videoHeight * scale);
    for (let i = 0; i < count; i++) {
      const t = (duration * (i + 0.5)) / count;
      await new Promise<void>((res) => {
        const onSeek = () => {
          v.removeEventListener("seeked", onSeek);
          res();
        };
        v.addEventListener("seeked", onSeek);
        v.currentTime = t;
      });
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      out.push(canvas.toDataURL("image/jpeg", 0.7));
    }
    return out;
  }

  async function analyze() {
    const v = videoRef.current;
    if (!v || !url) return toast.error("Envie um vídeo primeiro.");
    setLoading(true);
    setReport(null);
    try {
      setProgress("Extraindo frames…");
      v.muted = true;
      await v.play().catch(() => {});
      v.pause();
      const shots = await extractFrames(v, 4);
      setFrames(shots);

      setProgress("Analisando cena com IA…");
      const data = await chamarIrisChat({
        messages: [
          {
            role: "system",
            content:
              'Você é IA, IA de análise de vídeo operacional em ambientes industriais (mineração/siderurgia). Você recebe 4 frames sequenciais de um vídeo de até 60s. Analise TODOS os itens visíveis (EPI, 5S, vazamentos, sujeira, cabos, obstruções, sinalização, riscos ergonômicos, meio ambiente, procedimentos). Retorne EXCLUSIVAMENTE JSON: {"score":0-100,"summary":"resumo geral","improvements":["frase de melhoria 1","frase 2",...],"findings":[{"id":1,"severity":"critical|warning|info","timestamp":"0:15","title":"...","description":"...","correction":"..."}]}. Máx 10 achados, mín 3 melhorias. Sem texto fora do JSON.',
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Duração: ${duration.toFixed(1)}s. Frames em t=${(duration * 0.125).toFixed(1)}s, ${(duration * 0.375).toFixed(1)}s, ${(duration * 0.625).toFixed(1)}s, ${(duration * 0.875).toFixed(1)}s.${note ? "\nContexto: " + note : ""}${equipAreaPromptSuffix(ctx)}`,
              },
              ...shots.map((f) => ({ type: "image_url" as const, image_url: { url: f } })),
            ],
          },
        ],
        response_format: { type: "json_object" },
      });
      const text = (data.choices?.[0]?.message?.content ?? "{}").replace(/```json|```/g, "").trim();
      setReport(JSON.parse(text) as VideoReport);
    } catch (e) {
      handleAiError(e, "Erro ao analisar");
    } finally {
      setLoading(false);
      setProgress("");
    }
  }

  return (
    <ModuleShell
      icon={Video}
      title="Câmera 360°"
      subtitle="Envie um vídeo de até 1 minuto. A IA analisa todos os itens e gera o plano de melhorias."
      status="operacional"
    >
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Upload / preview */}
        <section className="rounded-xl border border-border bg-card/40 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Vídeo da operação (máx 1 min)
            </h2>
            {file && (
              <button
                type="button"
                onClick={reset}
                className="text-muted-foreground hover:text-neon"
                title="Novo vídeo"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {!url ? (
            <label className="flex h-56 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-black/30 text-sm text-muted-foreground hover:border-neon/50 hover:text-foreground">
              <Upload className="h-8 w-8" />
              <span>Enviar / gravar vídeo</span>
              <span className="text-[10px] text-muted-foreground">
                MP4, MOV, WEBM · até 60s · 60MB
              </span>
              <input
                ref={inputRef}
                type="file"
                accept="video/*"
                capture="environment"
                className="hidden"
                onChange={(e) => onPick(e.target.files?.[0])}
              />
            </label>
          ) : (
            <div>
              <video
                ref={videoRef}
                src={url}
                controls
                playsInline
                className="w-full rounded-lg border border-border bg-black"
              />
              <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{file?.name}</span>
                <span>{duration.toFixed(1)}s</span>
              </div>
            </div>
          )}

          <EquipAreaFields value={ctx} onChange={setCtx} className="mt-3" />
          <Textarea
            className="mt-3"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Contexto adicional (turno, observações…) — opcional"
          />
          <Button onClick={analyze} disabled={loading || !url} className="mt-3 w-full gap-2">
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> {progress || "Analisando…"}
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> Analisar todos os itens
              </>
            )}
          </Button>

          {frames.length > 0 && (
            <div className="mt-4">
              <div className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                Frames analisados
              </div>
              <div className="grid grid-cols-4 gap-2">
                {frames.map((f, i) => (
                  <img
                    key={i}
                    src={f}
                    alt={`frame-${i}`}
                    className="rounded border border-border object-cover"
                  />
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Report */}
        <section className="rounded-xl border border-border bg-card/40 p-5">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-neon" />
            <h2 className="font-display text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Plano de melhorias · IA
            </h2>
          </div>
          {!report && !loading && (
            <div className="flex h-56 items-center justify-center text-center text-xs text-muted-foreground">
              <div>
                <Play className="mx-auto mb-2 h-6 w-6" />
                Envie um vídeo e clique em "Analisar" para gerar o relatório completo.
              </div>
            </div>
          )}
          {loading && (
            <div className="flex h-56 items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-neon" /> {progress}
            </div>
          )}
          {report && (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-border bg-black/30 p-3">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    Score consolidado
                  </div>
                  <div
                    className={`font-display text-3xl font-semibold ${
                      report.score >= 70
                        ? "text-neon"
                        : report.score >= 40
                          ? "text-yellow-400"
                          : "text-red-400"
                    }`}
                  >
                    {report.score}
                    <span className="text-sm text-muted-foreground">/100</span>
                  </div>
                </div>
                <p className="max-w-[60%] text-xs text-foreground/80">{report.summary}</p>
              </div>

              <div>
                <h3 className="mb-2 flex items-center gap-2 font-display text-[10px] font-semibold uppercase tracking-widest text-neon">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Melhorias propostas
                </h3>
                <ul className="space-y-1.5">
                  {report.improvements.map((imp, i) => (
                    <li
                      key={i}
                      className="flex gap-2 rounded-md border border-neon/30 bg-neon/5 px-3 py-1.5 text-xs"
                    >
                      <span className="text-neon">✓</span>
                      <span className="text-foreground/90">{imp}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="mb-2 flex items-center gap-2 font-display text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  <AlertTriangle className="h-3.5 w-3.5" /> Achados ({report.findings.length})
                </h3>
                <ul className="space-y-2">
                  {report.findings.map((f) => {
                    const color =
                      f.severity === "critical"
                        ? "border-red-500/50 bg-red-500/10"
                        : f.severity === "warning"
                          ? "border-yellow-400/50 bg-yellow-500/10"
                          : "border-neon/40 bg-neon/5";
                    return (
                      <li key={f.id} className={`rounded-lg border p-3 ${color}`}>
                        <div className="flex items-center gap-2">
                          <span className="font-display text-[10px] font-bold uppercase tracking-widest">
                            #{f.id} · {f.severity}
                          </span>
                          <span className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                            {f.timestamp}
                          </span>
                          <span className="text-sm font-semibold">{f.title}</span>
                        </div>
                        <p className="mt-1 text-xs text-foreground/80">{f.description}</p>
                        <p className="mt-1 text-xs">
                          <span className="font-semibold">Correção:</span>{" "}
                          <span className="text-foreground/80">{f.correction}</span>
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <p className="text-[10px] italic text-muted-foreground">
                AVISO: As ações propostas pela IA devem ser validadas pelos responsáveis antes da
                execução.
              </p>
            </div>
          )}
        </section>
      </div>
    </ModuleShell>
  );
}
