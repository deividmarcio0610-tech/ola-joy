import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  Siren,
  Phone,
  Flame,
  Heart,
  Shield,
  Cloud,
  Loader2,
  Sparkles,
  Camera,
  Video,
  Mic,
  Square,
  X,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ModuleShell } from "@/components/module-shell";
import {
  EquipAreaFields,
  emptyEquipArea,
  equipAreaPromptSuffix,
} from "@/components/equip-area-fields";
import { toast } from "sonner";
import { chamarIrisChat, transcreverAudioComIris } from "@/lib/iris-analyze";
import { handleAiError } from "@/lib/ai-credits-error";

export const Route = createFileRoute("/_authenticated/emergencia")({
  head: () => ({ meta: [{ title: "Emergência · VisionGuard AI" }] }),
  component: EmergenciaPage,
});

const EMERGENCY_NUMBERS = [
  {
    label: "Bombeiros",
    number: "193",
    icon: Flame,
    color: "text-red-400",
    ring: "ring-red-400/40",
  },
  { label: "SAMU", number: "192", icon: Heart, color: "text-pink-400", ring: "ring-pink-400/40" },
  {
    label: "Polícia Militar",
    number: "190",
    icon: Shield,
    color: "text-blue-400",
    ring: "ring-blue-400/40",
  },

  {
    label: "CECOM Vale",
    number: "0800 285 0193",
    icon: Phone,
    color: "text-neon",
    ring: "ring-neon/40",
  },
  {
    label: "Brigada Interna",
    number: "Ramal 2000",
    icon: Siren,
    color: "text-orange-400",
    ring: "ring-orange-400/40",
  },
];

function EmergenciaPage() {
  return (
    <ModuleShell
      icon={Siren}
      title="Emergência"
      subtitle="Acionamento rápido, dados de local e primeiros socorros por IA."
      status="operacional"
    >
      {/* Números fixos */}
      <section>
        <h2 className="mb-3 font-display text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Acionamento rápido
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {EMERGENCY_NUMBERS.map((e) => (
            <a
              key={e.label}
              href={`tel:${e.number.replace(/\D/g, "")}`}
              className={`flex items-center gap-3 rounded-xl border border-border bg-card/60 p-4 ring-1 ${e.ring} transition hover:bg-card`}
            >
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-lg bg-black/40 ${e.color}`}
              >
                <e.icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  {e.label}
                </div>
                <div className={`font-display text-lg font-semibold ${e.color}`}>{e.number}</div>
              </div>
              <Phone className="h-4 w-4 text-muted-foreground" />
            </a>
          ))}
        </div>
      </section>

      {/* Primeiros socorros IA */}
      <FirstAidAI />
    </ModuleShell>
  );
}

function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("read_fail"));
    r.readAsDataURL(file);
  });
}

async function extractVideoFrame(videoBlob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(videoBlob);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.src = url;
    video.onloadeddata = () => {
      try {
        video.currentTime = Math.min(0.1, (video.duration || 1) / 2);
      } catch {
        resolve(null);
      }
    };
    video.onseeked = () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 360;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
  });
}

function FirstAidAI() {
  const [symptoms, setSymptoms] = useState("");
  const [ctx, setCtx] = useState(emptyEquipArea);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string>("");
  const [transcribing, setTranscribing] = useState(false);

  const [recording, setRecording] = useState<"audio" | "video" | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  const quick = [
    "Vítima inconsciente, respirando",
    "Sangramento intenso em membro",
    "Queimadura por vapor",
    "Suspeita de fratura em perna",
    "Choque elétrico",
    "Inalação de gás/pó",
  ];

  async function onPhotoFile(f: File | null) {
    if (!f) return;
    setPhotoUrl(await fileToDataUrl(f));
  }

  async function onVideoFile(f: File | null) {
    if (!f) return;
    setVideoBlob(f);
    setVideoUrl(URL.createObjectURL(f));
  }

  async function startAudio() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setRecording(null);
      };
      recorderRef.current = mr;
      mr.start();
      setRecording("audio");
    } catch {
      toast.error("Não foi possível acessar o microfone");
    }
  }

  async function startVideo() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: true,
      });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("video/webm") ? "video/webm" : "";
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(chunks, { type: mr.mimeType || "video/webm" });
        setVideoBlob(blob);
        setVideoUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setRecording(null);
      };
      recorderRef.current = mr;
      mr.start();
      setRecording("video");
    } catch {
      toast.error("Não foi possível acessar a câmera");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
  }

  async function transcribeAudio(blob: Blob): Promise<string> {
    return transcreverAudioComIris(blob);
  }

  async function transcribeNow() {
    if (!audioBlob) return;
    setTranscribing(true);
    try {
      const text = await transcribeAudio(audioBlob);
      setTranscript(text);
      if (!text) toast.warning("Nenhum texto reconhecido no áudio.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na transcrição");
    } finally {
      setTranscribing(false);
    }
  }

  function clearPhoto() {
    setPhotoUrl(null);
  }
  function clearVideo() {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoBlob(null);
    setVideoUrl(null);
  }
  function clearAudio() {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setTranscript("");
  }

  async function analyze() {
    const hasEvidence = symptoms.trim() || photoUrl || videoBlob || audioBlob || transcript.trim();
    if (!hasEvidence) {
      toast.error("Descreva a situação, tire uma foto, grave um vídeo ou áudio.");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      // 1) Ensure we have audio transcript if the user recorded audio and didn't transcribe yet
      let audioText = transcript;
      if (audioBlob && !audioText) {
        try {
          audioText = await transcribeAudio(audioBlob);
          setTranscript(audioText);
        } catch {
          audioText = "";
        }
      }

      // 2) Frame from video (if any) as extra visual context
      let videoFrame: string | null = null;
      if (videoBlob) {
        videoFrame = await extractVideoFrame(videoBlob);
      }

      // 3) Build multimodal user content
      const parts: Array<
        { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
      > = [];

      const textBlocks: string[] = [];
      if (symptoms.trim()) textBlocks.push(`Descrição digitada:\n${symptoms.trim()}`);
      if (audioText.trim())
        textBlocks.push(`Relato falado pela pessoa (transcrição do áudio):\n${audioText.trim()}`);
      if (photoUrl) textBlocks.push("Foto da vítima/cena em anexo.");
      if (videoBlob)
        textBlocks.push("Vídeo curto da ocorrência anexado (frame representativo enviado).");
      textBlocks.push(equipAreaPromptSuffix(ctx));

      parts.push({ type: "text", text: textBlocks.join("\n\n") });
      if (photoUrl) parts.push({ type: "image_url", image_url: { url: photoUrl } });
      if (videoFrame) parts.push({ type: "image_url", image_url: { url: videoFrame } });

      const data = await chamarIrisChat({
        messages: [
          {
            role: "system",
            content:
              "Você é IA, IA de primeiros socorros para ambiente industrial pesado (mineração/siderurgia). Baseie-se estritamente em protocolos ABCDE, SAMU (192), Bombeiros (193), NR-7, NR-5 e diretrizes do Ministério da Saúde. Analise foto/frame de vídeo e o relato falado transcrito quando disponíveis. Responda em português, tom técnico, direto e passos numerados. SEMPRE inclua: 1) SITUAÇÃO IDENTIFICADA (o que a IA observou nas evidências, com nível de confiança), 2) AÇÃO IMEDIATA (primeiros 60s), 3) SINAIS VITAIS a checar (ABCDE), 4) O QUE NÃO FAZER, 5) NORMAS APLICÁVEIS (NR/procedimento), 6) QUANDO ACIONAR 192/193/CECOM. Se as evidências forem insuficientes ou ambíguas, declare explicitamente e peça a informação faltante. NUNCA invente lesões que não estejam nas evidências. Termine com: 'AVISO: Primeiros socorros não substituem atendimento profissional. Acione 192 imediatamente em casos graves.'",
          },
          { role: "user", content: parts },
        ],
      });
      setResult(data.choices?.[0]?.message?.content ?? "(sem resposta)");
    } catch (e) {
      handleAiError(e, "Erro de rede");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-xl border border-red-500/40 bg-red-500/5 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Heart className="h-4 w-4 text-red-400" />
        <h2 className="font-display text-[11px] font-semibold uppercase tracking-widest text-red-300">
          Primeiros socorros · IA
        </h2>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Registre a ocorrência com foto, vídeo, áudio ou texto. A IA analisa as evidências e orienta
        conforme normas e procedimentos enquanto o socorro chega.
      </p>

      <Tabs defaultValue="foto" className="mb-3">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="foto" className="gap-1 text-xs">
            <Camera className="h-3.5 w-3.5" /> Foto
          </TabsTrigger>
          <TabsTrigger value="video" className="gap-1 text-xs">
            <Video className="h-3.5 w-3.5" /> Vídeo
          </TabsTrigger>
          <TabsTrigger value="audio" className="gap-1 text-xs">
            <Mic className="h-3.5 w-3.5" /> Áudio
          </TabsTrigger>
          <TabsTrigger value="texto" className="gap-1 text-xs">
            <FileText className="h-3.5 w-3.5" /> Texto
          </TabsTrigger>
        </TabsList>

        <TabsContent value="foto" className="mt-3">
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => onPhotoFile(e.target.files?.[0] ?? null)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => photoInputRef.current?.click()}
              className="gap-2"
            >
              <Camera className="h-4 w-4" /> Bater foto
            </Button>
            {photoUrl && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearPhoto}
                className="gap-1 text-xs"
              >
                <X className="h-3 w-3" /> Remover
              </Button>
            )}
          </div>
          {photoUrl && (
            <img
              src={photoUrl}
              alt="Foto da ocorrência"
              className="mt-2 max-h-56 rounded-lg border border-border object-cover"
            />
          )}
        </TabsContent>

        <TabsContent value="video" className="mt-3">
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            capture="environment"
            className="hidden"
            onChange={(e) => onVideoFile(e.target.files?.[0] ?? null)}
          />
          <div className="flex flex-wrap items-center gap-2">
            {recording !== "video" ? (
              <>
                <Button type="button" variant="outline" onClick={startVideo} className="gap-2">
                  <Video className="h-4 w-4" /> Gravar vídeo
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => videoInputRef.current?.click()}
                  className="gap-2 text-xs"
                >
                  Enviar arquivo
                </Button>
              </>
            ) : (
              <Button type="button" variant="destructive" onClick={stopRecording} className="gap-2">
                <Square className="h-4 w-4" /> Parar gravação
              </Button>
            )}
            {videoUrl && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearVideo}
                className="gap-1 text-xs"
              >
                <X className="h-3 w-3" /> Remover
              </Button>
            )}
          </div>
          {videoUrl && (
            <video
              src={videoUrl}
              controls
              className="mt-2 max-h-56 w-full rounded-lg border border-border"
            />
          )}
        </TabsContent>

        <TabsContent value="audio" className="mt-3">
          <div className="flex flex-wrap items-center gap-2">
            {recording !== "audio" ? (
              <Button type="button" variant="outline" onClick={startAudio} className="gap-2">
                <Mic className="h-4 w-4" /> Gravar relato
              </Button>
            ) : (
              <Button type="button" variant="destructive" onClick={stopRecording} className="gap-2">
                <Square className="h-4 w-4" /> Parar gravação
              </Button>
            )}
            {audioBlob && (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={transcribing}
                  onClick={transcribeNow}
                  className="gap-1 text-xs"
                >
                  {transcribing ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <FileText className="h-3 w-3" />
                  )}
                  Transcrever
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearAudio}
                  className="gap-1 text-xs"
                >
                  <X className="h-3 w-3" /> Remover
                </Button>
              </>
            )}
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Peça para a pessoa descrever o ocorrido. A IA transcreve o áudio e usa o relato na
            análise.
          </p>
          {audioUrl && <audio src={audioUrl} controls className="mt-2 w-full" />}
          {transcript && (
            <div className="mt-2 rounded-md border border-border bg-background/60 p-2 text-xs text-foreground/90">
              <div className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                Transcrição
              </div>
              {transcript}
            </div>
          )}
        </TabsContent>

        <TabsContent value="texto" className="mt-3">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {quick.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setSymptoms(q)}
                className="rounded-full border border-border bg-background/60 px-2.5 py-1 text-[10px] text-muted-foreground hover:border-red-400/50 hover:text-foreground"
              >
                {q}
              </button>
            ))}
          </div>
          <Textarea
            rows={3}
            value={symptoms}
            onChange={(e) => setSymptoms(e.target.value)}
            placeholder="Ex.: Trabalhador caiu de andaime, consciente, dor forte no ombro direito, sem sangramento visível…"
          />
        </TabsContent>
      </Tabs>

      <EquipAreaFields value={ctx} onChange={setCtx} className="mb-2" />

      <div className="mt-3 flex justify-end">
        <Button onClick={analyze} disabled={loading} className="gap-2 bg-red-500 hover:bg-red-600">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Orientar primeiros socorros
        </Button>
      </div>
      {result && (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-black/40 p-5">
          <div className="mb-4 flex items-center gap-2 font-display text-[10px] uppercase tracking-widest text-red-300">
            <Sparkles className="h-3.5 w-3.5" />
            Protocolo sugerido conforme normas
          </div>
          <FormattedProtocol text={result} />
        </div>
      )}
    </section>
  );
}

function renderInline(text: string, keyBase: string) {
  // parse **bold**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) {
      return (
        <strong key={`${keyBase}-b-${i}`} className="font-semibold text-foreground">
          {p.slice(2, -2)}
        </strong>
      );
    }
    return <span key={`${keyBase}-t-${i}`}>{p}</span>;
  });
}

function FormattedProtocol({ text }: { text: string }) {
  // Normalize: strip stray leading "* " bullets, collapse spaces
  const clean = text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^[ \t]*\*[ \t]+/gm, "• ")
    .replace(/^---+$/gm, "");

  const blocks = clean
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  return (
    <div className="space-y-4 text-sm leading-relaxed text-foreground/90">
      {blocks.map((block, bi) => {
        const lines = block
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);

        // Heading detection: "**1) TÍTULO**" or "1) TÍTULO"
        const headingMatch = lines[0]?.match(/^\*\*(.+?)\*\*$/);
        const numHeading = lines[0]?.match(/^(\d+\))\s+(.+)$/i);
        const isHeading =
          lines.length === 1 &&
          (headingMatch || (numHeading && numHeading[2] === numHeading[2].toUpperCase()));

        if (isHeading) {
          const title = headingMatch ? headingMatch[1] : lines[0];
          return (
            <h3
              key={`h-${bi}`}
              className="pt-1 font-display text-[13px] font-semibold uppercase tracking-wider text-red-300"
            >
              {title}
            </h3>
          );
        }

        // Ordered list?
        const isOrdered = lines.every((l) => /^\d+[.)]\s+/.test(l));
        if (isOrdered && lines.length > 1) {
          return (
            <ol key={`ol-${bi}`} className="space-y-2 pl-1">
              {lines.map((l, i) => {
                const m = l.match(/^(\d+)[.)]\s+(.*)$/);
                return (
                  <li key={i} className="flex gap-3">
                    <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500/20 text-[11px] font-semibold text-red-300">
                      {m?.[1] ?? i + 1}
                    </span>
                    <span className="flex-1">{renderInline(m?.[2] ?? l, `ol-${bi}-${i}`)}</span>
                  </li>
                );
              })}
            </ol>
          );
        }

        // Bullet list?
        const isBullet = lines.every((l) => /^[•-]\s+/.test(l));
        if (isBullet && lines.length > 1) {
          return (
            <ul key={`ul-${bi}`} className="space-y-1.5 pl-1">
              {lines.map((l, i) => (
                <li key={i} className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400/70" />
                  <span className="flex-1">
                    {renderInline(l.replace(/^[•-]\s+/, ""), `ul-${bi}-${i}`)}
                  </span>
                </li>
              ))}
            </ul>
          );
        }

        // Paragraph
        return (
          <p key={`p-${bi}`} className="text-foreground/85">
            {lines.map((l, i) => (
              <span key={i}>
                {renderInline(l, `p-${bi}-${i}`)}
                {i < lines.length - 1 && <br />}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
