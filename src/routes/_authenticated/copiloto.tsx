/**
 * '''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''
                                        
                                            
                                            Adicionar um painel de diagnóstico em tempo real com AUDIO TRACK ID, METER TRACK ID, STT TRACK ID, RMS, PEAK, DBFS, VAD e contadores reais de frames/chunks/bytes.
 */

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Zap,
  Mic,
  Play,
  Square,
  Maximize2,
  Minimize2,
  Brain,
  Sparkles,
  AlertTriangle,
  Monitor,
  Settings,
  RefreshCw,
  XCircle,
  Volume2,
  Eye,
  EyeOff,
  Terminal,
  Activity,
  Gauge,
  FileText,
  CheckCircle2,
  ListChecks,
  HelpCircle,
  Layout,
  Clock as ClockIcon,
  Crown,
} from "lucide-react";
import { APP_CONFIG } from "@/lib/app-config";
import React, { useState, useEffect, useRef, useCallback, memo, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  extractMeetingIntelligence,
  generateMeetingMinutes,
  getSuggestedResponse,
} from "@/lib/meeting.functions";
import { saveMeetingSession } from "@/lib/meetings.functions";
import { transcribeChunk } from "@/lib/stt.functions";
import {
  bytesToBase64,
  detectQuestionForDeivid,
  downmixToMono,
  encodeWav,
  median,
  resample,
  validatePcm,
} from "@/lib/audio-pipeline";
import { useServerFn } from "@tanstack/react-start";
import {
  DEFAULT_PREFERENCES,
  getTranscriptionLocale,
  loadPreferences,
  PREFERENCES_EVENT,
} from "@/routes/_authenticated/configuracoes";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/copiloto")({
  component: CopilotoPage,
});

const TEMAS = [
  "REUNIÃO",
  "REUNIÃO TÉCNICA",
  "ENTREVISTA",
  "APRESENTAÇÃO",
  "LIVRE",
  "Engenharia elétrica",
  "Automação e instrumentação",
  "Manutenção industrial",
  "Mineração",
  "Gestão/Liderança",
  "RH",
  "Comercial/Vendas",
  "Atendimento ao cliente",
  "Negociação",
  "Treinamento",
  "Personalizado",
];

const MODOS_RESPOSTA = ["Curta", "Profissional", "Técnica", "Executiva", "Didática", "Persuasiva"];

// --- Memoized Components for Performance ---

/** Métricas do preview de vídeo reportadas ao painel de diagnóstico. */
interface VideoDetails {
  width?: number;
  height?: number;
  fps?: number;
  label?: string;
  readyState?: MediaStreamTrack["readyState"];
}

/** Estado por subsistema exibido na barra de status e na telemetria. */
type SystemStatus = Record<string, string>;

interface VideoPreviewProps {
  stream: MediaStream | null;
  showVideo: boolean;
  onStatusChange?: (status: string, details?: VideoDetails) => void;
}

const CapturedVideoPreview = memo(({ stream, showVideo, onStatusChange }: VideoPreviewProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameCountRef = useRef(0);
  const lastCheckRef = useRef(0);

  useEffect(() => {
    if (!stream || !videoRef.current) {
      if (onStatusChange) onStatusChange("OFFLINE");
      return;
    }

    const videoElement = videoRef.current;
    videoElement.srcObject = stream;

    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) {
      if (onStatusChange) onStatusChange("SEM VÍDEO");
      return;
    }

    let animationFrame: number;

    const checkFrames = () => {
      if (videoElement.readyState >= 2) {
        frameCountRef.current++;
      }
      animationFrame = requestAnimationFrame(checkFrames);
    };
    animationFrame = requestAnimationFrame(checkFrames);

    const statusInterval = setInterval(() => {
      const now = Date.now();
      const frames = frameCountRef.current;
      const fps = Math.round((frames * 1000) / (now - lastCheckRef.current || 1000));

      let status = "LIVE";
      if (videoTrack.readyState === "ended") status = "ENCERRA";
      else if (videoTrack.muted) status = "MUTADO";
      else if (videoElement.videoWidth === 0) status = "SEM IMAGEM";
      else if (frames === 0) status = "SEM FRAMES";

      if (onStatusChange) {
        onStatusChange(status, {
          width: videoElement.videoWidth,
          height: videoElement.videoHeight,
          fps,
          label: videoTrack.label,
          readyState: videoTrack.readyState,
        });
      }

      frameCountRef.current = 0;
      lastCheckRef.current = now;
    }, 2000);

    videoElement.onloadedmetadata = async () => {
      try {
        await videoElement.play();
      } catch (err) {
        console.error("Falha ao reproduzir preview:", err);
      }
    };

    return () => {
      cancelAnimationFrame(animationFrame);
      clearInterval(statusInterval);
      videoElement.srcObject = null;
    };
  }, [stream, onStatusChange]);

  if (!showVideo) return null;

  return (
    <div className="flex-1 flex items-center justify-center bg-black relative">
      {stream ? (
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-contain" />
      ) : (
        <div className="flex flex-col items-center gap-4 text-white/10">
          <Monitor size={64} />
          <p className="text-[10px] font-bold tracking-[0.2em] uppercase">Aguardando fonte...</p>
        </div>
      )}
    </div>
  );
});

const AudioLevelMeter = memo(({ level, status }: { level: number; status: string }) => {
  const bars = Math.max(1, Math.min(10, Math.ceil(level / 10)));
  const isActive = level > 1 && status === "ONLINE";
  return (
    <span>
      🔊 ÁUDIO:{" "}
      <span className={cn(isActive ? "text-emerald-500" : "text-rose-500")}>
        {"█".repeat(bars)}
      </span>
    </span>
  );
});

function CopilotoPage() {
  const navigate = useNavigate();
  const [isActive, setIsActive] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [showVideo, setShowVideo] = useState(DEFAULT_PREFERENCES.showVideo);
  const [temaAtivo, setTemaAtivo] = useState<string>(DEFAULT_PREFERENCES.meetingTheme);
  const [modoAtivo, setModoAtivo] = useState<string>(DEFAULT_PREFERENCES.responseMode);
  const [performanceMode, setPerformanceMode] = useState<"latency" | "balanced" | "quality">(
    "latency",
  );
  const [customDescription, setCustomDescription] = useState("");
  const [isAutoDetectEnabled, setIsAutoDetectEnabled] = useState(
    DEFAULT_PREFERENCES.autoDetectQuestions,
  );
  const [activeTab, setActiveTab] = useState("transcricao");
  const [meetingDuration, setMeetingDuration] = useState(0);
  const [detectedQuestion, setDetectedQuestion] = useState<string | null>(null);
  const [isGeneratingResponse, setIsGeneratingResponse] = useState(false);
  const [decisions, setDecisions] = useState<string[]>([]);
  const [actions, setActions] = useState<
    Array<{ responsible: string; task: string; deadline: string }>
  >([]);
  const [pending, setPending] = useState<string[]>([]);
  const [fullTranscript, setFullTranscript] = useState<
    Array<{ id: string; timestamp: string; speaker: string; text: string }>
  >([]);
  const [isFinishing, setIsFinishing] = useState(false);

  // Server functions hooks
  const getResponseFn = useServerFn(getSuggestedResponse);
  const extractIntelligenceFn = useServerFn(extractMeetingIntelligence);
  const generateMinutesFn = useServerFn(generateMeetingMinutes);
  const saveSessionFn = useServerFn(saveMeetingSession);

  // Início da reunião: usado como start_time ao persistir a sessão.
  const sessionStartRef = useRef<string | null>(null);

  // Use Refs for heavy objects to prevent re-renders
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [audioLevel, setAudioLevel] = useState(0);
  const [audioSource, setAudioSource] = useState<"system" | "mic" | "both">("system");
  const [lastAudioTime, setLastAudioTime] = useState(Date.now());
  // Use local state for UI and refs for logic/streaming
  const [transcription, setTranscription] = useState<string[]>([]);
  const [aiResponse, setAiResponse] = useState<string>("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const transcriptionRef = useRef<string[]>([]);
  const aiResponseRef = useRef<string>("");

  const [partialText, setPartialText] = useState("");
  const [pipelineError, setPipelineError] = useState<string | null>(null);

  const [telemetry, setTelemetry] = useState({
    chunks: 0,
    chunksProduced: 0,
    bytes: 0,
    frames: 0,
    captureLatency: 0,
    rtt: 0,
    aiTtft: 0,
    lastTranscript: 0,
    lastChunkAt: 0,
    fps: 0,
    rms: 0,
    peak: 0,
    dbfs: -Infinity,
    noiseFloor: -60,
    threshold: -50,
    gain: 1,
    isSpeech: false,
    calibrating: true,
    sampleRateIn: 0,
    channelsIn: 0,
    sttResponses: 0,
    sttModel: "---",
    pcmValid: "---",
    pcmNonZero: 0,
    pcmClipping: "NO",
    lastSent: "---",
    lastReceived: "---",
    lastText: "",
    lastError: "",
    audioTrackId: "---",
    audioTrackLabel: "---",
    audioTrackState: "---",
    audioTrackEnabled: false,
    audioTrackMuted: false,
    audioTracksLength: 0,
  });

  const [systemStatus, setSystemStatus] = useState<SystemStatus>({
    JANELA: "OFFLINE",
    ÁUDIO: "OFFLINE",
    STT: "OFFLINE",
    IA: "OFFLINE",
    VÍDEO: "OFFLINE",
  });

  // Real-time Metrics and Pipeline State
  const [videoDetails, setVideoDetails] = useState<VideoDetails>({});
  const sttMetricsRef = useRef({
    chunksSent: 0,
    chunksProduced: 0,
    bytesSent: 0,
    framesProduced: 0,
    lastChunkTime: 0,
    sttResponses: 0,
    noiseValues: [] as number[],
    isCalibrating: true,
    threshold: -50,
    noiseFloor: -60,
    gain: 1,
  });

  // Buffer contínuo de áudio (independente do VAD)
  const pcmBufferRef = useRef<Float32Array[]>([]);
  const bufferedSamplesRef = useRef(0);
  const speechInWindowRef = useRef(false);
  const lastSpeechAtRef = useRef(0);
  const isSendingRef = useRef(false);
  const inputRateRef = useRef(48000);
  const transcribeChunkFn = useServerFn(transcribeChunk);

  const transcriptionLanguage = preferences.transcriptionLanguage;
  const transcriptionLocale = getTranscriptionLocale(preferences);

  // Preferências de /configuracoes: aplicadas ao entrar e sempre que forem alteradas.
  useEffect(() => {
    const apply = () => {
      const prefs = loadPreferences();
      setPreferences(prefs);
      setShowVideo(prefs.showVideo);
      setTemaAtivo(prefs.meetingTheme);
      setModoAtivo(prefs.responseMode);
      setIsAutoDetectEnabled(prefs.autoDetectQuestions);
    };

    apply();
    window.addEventListener(PREFERENCES_EVENT, apply);
    return () => window.removeEventListener(PREFERENCES_EVENT, apply);
  }, []);

  // Timer for meeting duration
  useEffect(() => {
    if (isActive) {
      durationIntervalRef.current = setInterval(() => {
        setMeetingDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
      setMeetingDuration(0);
    }
    return () => {
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
    };
  }, [isActive]);

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleVideoStatus = useCallback((status: string, details?: VideoDetails) => {
    setSystemStatus((prev) => ({ ...prev, VÍDEO: status }));
    if (details) setVideoDetails(details);
  }, []);

  // ==== Transcrição final -> timeline, detector de pergunta, extração ====
  const ingestFinalText = useCallback(
    (text: string) => {
      const clean = text.trim();
      if (!clean) return;

      const block = {
        id: crypto.randomUUID(),
        timestamp: new Date().toLocaleTimeString(transcriptionLocale),
        speaker: "Participante",
        text: clean,
      };
      setFullTranscript((prev) => [...prev, block]);
      transcriptionRef.current = [...transcriptionRef.current, clean];
      setTranscription((prev) => [...prev, clean]);

      // Extração leve sobre fala REAL (nunca sobre sugestões da IA)
      const lower = clean.toLowerCase();
      if (/(ficou|está|esta) pendente|pend(ê|e)ncia/.test(lower)) {
        setPending((prev) => [...prev, clean]);
      }
      if (/decidimos|ficou decidido|vamos manter|aprovado/.test(lower)) {
        setDecisions((prev) => [...prev, clean]);
      }
      const actionMatch = clean.match(
        /([A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-zá-úâêôãõç]+)\s+(vai|ir(á)?|deve)\s+([^.?!]+)/,
      );
      if (actionMatch) {
        const deadline = clean.match(/at(é|e)\s+([^.,!?]+)/i)?.[2]?.trim() ?? "A definir";
        setActions((prev) => [
          ...prev,
          { responsible: actionMatch[1], task: actionMatch[4].trim(), deadline },
        ]);
      }

      // Detector de pergunta (etapa POSTERIOR à transcrição; nunca bloqueia o STT).
      // Respeita a preferência "detectar perguntas automaticamente" de /configuracoes.
      const question = isAutoDetectEnabled ? detectQuestionForDeivid(clean) : null;
      if (question) {
        setDetectedQuestion(question);
        setIsGeneratingResponse(true);
        const started = Date.now();
        getResponseFn({
          data: {
            question,
            context: `${temaAtivo}${customDescription ? " — " + customDescription : ""}`,
            mode: modoAtivo,
            transcript: transcriptionRef.current.slice(-8).join("\n"),
          },
        })
          .then((res) => {
            if (!res.ok) {
              // Erro da IA aparece na telemetria e como aviso, sem derrubar a transcrição.
              setTelemetry((prev) => ({ ...prev, lastError: `IA: ${res.error}` }));
              setSystemStatus((prev) => ({ ...prev, IA: "ERRO" }));
              toast.error(res.error);
              return;
            }
            setAiResponse(res.text);
            setSystemStatus((prev) => ({ ...prev, IA: "READY" }));
            setTelemetry((prev) => ({ ...prev, aiTtft: Date.now() - started }));
          })
          .catch((err: unknown) => {
            setTelemetry((prev) => ({
              ...prev,
              lastError: `IA: ${String((err as Error)?.message ?? err)}`,
            }));
          })
          .finally(() => setIsGeneratingResponse(false));
      }
    },
    [
      getResponseFn,
      temaAtivo,
      modoAtivo,
      customDescription,
      isAutoDetectEnabled,
      transcriptionLocale,
    ],
  );

  // ==== Envio real ao STT: 48k float -> mono 16k -> PCM16 -> WAV completo ====
  const flushAudioBuffer = useCallback(
    async (force = false) => {
      if (isSendingRef.current) return;

      const rate = inputRateRef.current;
      const count = bufferedSamplesRef.current;
      const minSamples = Math.floor(rate * (force ? 0.4 : 1.0));
      if (count < minSamples) return;

      const chunks = pcmBufferRef.current;
      pcmBufferRef.current = [];
      bufferedSamplesRef.current = 0;
      const hadSpeech = speechInWindowRef.current;
      speechInWindowRef.current = false;

      const merged = new Float32Array(count);
      let offset = 0;
      for (const c of chunks) {
        merged.set(c, offset);
        offset += c.length;
      }

      const resampled = resample(merged, rate, 16000);
      // Ganho APENAS no caminho do STT (não altera o que o usuário escuta)
      const gain = sttMetricsRef.current.gain;
      const boosted = new Float32Array(resampled.length);
      for (let i = 0; i < resampled.length; i++) {
        boosted[i] = Math.max(-1, Math.min(1, (resampled[i] || 0) * gain));
      }

      const validation = validatePcm(boosted, 16000);
      sttMetricsRef.current.chunksProduced++;

      setTelemetry((prev) => ({
        ...prev,
        chunksProduced: sttMetricsRef.current.chunksProduced,
        pcmValid: validation.valid ? "YES" : "NO",
        pcmNonZero: validation.nonZeroPercent,
        pcmClipping: validation.clipping ? "YES" : "NO",
        lastSent: "audio_chunk",
      }));

      if (!validation.valid) {
        setSystemStatus((prev) => ({ ...prev, STT: "PCM INVÁLIDO" }));
        return;
      }

      const wav = encodeWav(boosted, 16000);
      isSendingRef.current = true;
      const started = Date.now();
      setSystemStatus((prev) => ({ ...prev, STT: "ENVIANDO ÁUDIO" }));

      try {
        const res = await transcribeChunkFn({
          data: { wavBase64: bytesToBase64(wav), language: transcriptionLanguage },
        });
        const rtt = Date.now() - started;
        sttMetricsRef.current.chunksSent++;
        sttMetricsRef.current.bytesSent += wav.byteLength;
        sttMetricsRef.current.lastChunkTime = Date.now();

        if (!res?.ok) throw new Error(res?.error || "STT não retornou resposta.");

        sttMetricsRef.current.sttResponses++;
        setTelemetry((prev) => ({
          ...prev,
          chunks: sttMetricsRef.current.chunksSent,
          bytes: sttMetricsRef.current.bytesSent,
          rtt,
          lastChunkAt: sttMetricsRef.current.lastChunkTime,
          sttResponses: sttMetricsRef.current.sttResponses,
          sttModel: res.model || prev.sttModel,
          lastReceived: "transcript.text.done",
          lastText: res.text || prev.lastText,
          lastTranscript: res.text ? Date.now() : prev.lastTranscript,
          lastError: "",
        }));

        if (res.text) {
          setPipelineError(null);
          setPartialText("");
          ingestFinalText(res.text);
          setSystemStatus((prev) => ({ ...prev, STT: "TRANSCRIBING", IA: "READY" }));
        } else {
          setSystemStatus((prev) => ({
            ...prev,
            STT: hadSpeech ? "SEM TEXTO NO TRECHO" : "AGUARDANDO FALA",
          }));
        }
      } catch (err: unknown) {
        const message = String((err as Error)?.message ?? err);
        setTelemetry((prev) => ({ ...prev, lastError: message }));
        setPipelineError(message);
        setSystemStatus((prev) => ({ ...prev, STT: "ERRO" }));
        console.error("[STT]", message);
      } finally {
        isSendingRef.current = false;
      }
    },
    [transcribeChunkFn, ingestFinalText, transcriptionLanguage],
  );

  const flushRef = useRef(flushAudioBuffer);
  useEffect(() => {
    flushRef.current = flushAudioBuffer;
  }, [flushAudioBuffer]);

  // ==== Pipeline único: MESMA AudioTrack alimenta medidor, VAD e STT ====
  useEffect(() => {
    if (!isActive) return;
    const currentStream = streamRef.current;
    if (!currentStream) return;

    const audioTracks = currentStream.getAudioTracks();
    if (audioTracks.length === 0) {
      setPipelineError("ÁUDIO DA FONTE NÃO FOI COMPARTILHADO");
      setSystemStatus((prev) => ({
        ...prev,
        ÁUDIO: "SEM TRACK",
        STT: "BLOQUEADO (SEM ÁUDIO)",
      }));
      setTelemetry((prev) => ({ ...prev, audioTracksLength: 0 }));
      return; // NÃO inicia STT sem áudio
    }

    const audioTrack = audioTracks[0];
    const settings: MediaTrackSettings = audioTrack.getSettings?.() ?? {};
    let audioContext: AudioContext;
    let source: MediaStreamAudioSourceNode | null = null;
    let processor: ScriptProcessorNode | null = null;
    let sink: GainNode | null = null;
    let flushTimer: ReturnType<typeof setInterval> | null = null;

    try {
      audioContext = new (
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      )();
      audioContextRef.current = audioContext;
      if (audioContext.state === "suspended") audioContext.resume().catch(() => {});

      inputRateRef.current = audioContext.sampleRate;
      pcmBufferRef.current = [];
      bufferedSamplesRef.current = 0;
      speechInWindowRef.current = false;
      lastSpeechAtRef.current = 0;
      Object.assign(sttMetricsRef.current, {
        chunksSent: 0,
        chunksProduced: 0,
        bytesSent: 0,
        framesProduced: 0,
        lastChunkTime: 0,
        sttResponses: 0,
        noiseValues: [],
        isCalibrating: true,
        threshold: -50,
        noiseFloor: -60,
        gain: 1,
      });

      source = audioContext.createMediaStreamSource(new MediaStream([audioTrack]));
      processor = audioContext.createScriptProcessor(4096, 2, 1);
      // Sink silencioso: mantém o processor rodando sem devolver áudio ao usuário
      sink = audioContext.createGain();
      sink.gain.value = 0;
      source.connect(processor);
      processor.connect(sink);
      sink.connect(audioContext.destination);

      setTelemetry((prev) => ({
        ...prev,
        audioTracksLength: audioTracks.length,
        audioTrackId: audioTrack.id,
        audioTrackLabel: audioTrack.label || "display-audio",
        audioTrackState: audioTrack.readyState,
        audioTrackEnabled: audioTrack.enabled,
        audioTrackMuted: audioTrack.muted,
        sampleRateIn: audioContext.sampleRate,
        channelsIn: settings.channelCount ?? 2,
        calibrating: true,
      }));

      let lastUiUpdate = 0;

      processor.onaudioprocess = (e) => {
        const inputBuffer = e.inputBuffer;
        const channels: Float32Array[] = [];
        for (let c = 0; c < inputBuffer.numberOfChannels; c++) {
          channels.push(inputBuffer.getChannelData(c));
        }
        const mono = downmixToMono(channels);

        // 1) CAPTURA — sempre acumula, independente do VAD
        pcmBufferRef.current.push(new Float32Array(mono));
        bufferedSamplesRef.current += mono.length;
        sttMetricsRef.current.framesProduced += mono.length;

        // 2) MEDIÇÃO real
        let sum = 0;
        let peak = 0;
        for (let i = 0; i < mono.length; i++) {
          const v = mono[i];
          sum += v * v;
          const abs = Math.abs(v);
          if (abs > peak) peak = abs;
        }
        const rms = Math.sqrt(sum / mono.length);
        const dbfs = 20 * Math.log10(rms || 1e-8);
        const now = Date.now();

        // 3) VAD com limiar ADAPTATIVO (mediana do ruído, não o pico)
        const metrics = sttMetricsRef.current;
        if (metrics.isCalibrating) {
          metrics.noiseValues.push(dbfs);
          if (metrics.noiseValues.length >= 35) {
            metrics.isCalibrating = false;
            metrics.noiseFloor = median(metrics.noiseValues);
            metrics.threshold = Math.min(-25, Math.max(-70, metrics.noiseFloor + 8));
            metrics.gain = peak > 0.001 && peak < 0.2 ? Math.min(8, 0.35 / peak) : 1;
          }
        } else if (dbfs < metrics.noiseFloor) {
          // recalibração conservadora do piso de ruído
          metrics.noiseFloor = metrics.noiseFloor * 0.95 + dbfs * 0.05;
          metrics.threshold = Math.min(-25, Math.max(-70, metrics.noiseFloor + 8));
        }

        const isSpeech = !metrics.isCalibrating && dbfs > metrics.threshold;
        if (isSpeech) {
          speechInWindowRef.current = true;
          lastSpeechAtRef.current = now;
        }

        if (now - lastUiUpdate > 120) {
          lastUiUpdate = now;
          setAudioLevel(rms * 100);
          setTelemetry((prev) => ({
            ...prev,
            frames: metrics.framesProduced,
            rms,
            peak,
            dbfs,
            noiseFloor: metrics.noiseFloor,
            threshold: metrics.threshold,
            gain: metrics.gain,
            isSpeech,
            calibrating: metrics.isCalibrating,
            audioTrackState: audioTrack.readyState,
            audioTrackMuted: audioTrack.muted,
            fps: videoDetails.fps || prev.fps,
          }));

          setSystemStatus((prev) => {
            const audioLabel = metrics.isCalibrating
              ? "CALIBRANDO"
              : isSpeech
                ? `RECEBENDO (${dbfs.toFixed(0)} dB)`
                : rms > 0.00005
                  ? `ABAIXO DO LIMIAR (${dbfs.toFixed(0)} dB)`
                  : "SILÊNCIO";
            if (prev.ÁUDIO === audioLabel) return prev;
            return { ...prev, ÁUDIO: audioLabel };
          });
        }
      };

      // 4) Janela de envio: fim de fala (silêncio) ou janela máxima
      flushTimer = setInterval(() => {
        const rate = inputRateRef.current;
        const bufferedMs = (bufferedSamplesRef.current / rate) * 1000;
        const silenceMs = Date.now() - (lastSpeechAtRef.current || 0);
        const endOfSpeech = speechInWindowRef.current && silenceMs > 700 && bufferedMs > 1000;
        const maxWindow = bufferedMs >= 6000;
        if (endOfSpeech || maxWindow) {
          flushRef.current(false);
        }
      }, 250);

      setSystemStatus((prev) => ({ ...prev, STT: "CALIBRANDO ÁUDIO" }));
      setPipelineError(null);
    } catch (err: unknown) {
      const message = String((err as Error)?.message ?? err);
      console.error("Falha ao iniciar pipeline de áudio:", message);
      setPipelineError(message);
      setTelemetry((prev) => ({ ...prev, lastError: message }));
      setSystemStatus((prev) => ({ ...prev, ÁUDIO: "ERRO", STT: "ERRO" }));
    }

    return () => {
      if (flushTimer) clearInterval(flushTimer);
      if (processor) {
        processor.onaudioprocess = null;
        processor.disconnect();
      }
      if (source) source.disconnect();
      if (sink) sink.disconnect();
      pcmBufferRef.current = [];
      bufferedSamplesRef.current = 0;
    };
  }, [isActive, audioSource]);

  useEffect(() => {
    const currentStream = streamRef.current;
    if (isActive && currentStream) {
      const videoTrack = currentStream.getVideoTracks()[0];
      const audioTrack = currentStream.getAudioTracks()[0];

      const handleEnded = async () => {
        console.log("Fonte desconectada, tentando reconectar mantendo a sessão...");
        setSystemStatus((prev) => ({
          ...prev,
          JANELA: "RECONECTANDO",
          ÁUDIO: "RECONECTANDO",
          VÍDEO: "DESCONECTADO",
        }));

        try {
          await handleCaptureWindow(true);
          toast.success("Fonte reconectada automaticamente!");
        } catch (err) {
          toast.error("Falha ao reconectar automaticamente. Selecione a fonte novamente.");
          setSystemStatus((prev) => ({
            ...prev,
            JANELA: "DESCONECTADO",
            ÁUDIO: "DESCONECTADO",
            VÍDEO: "DESCONECTADO",
          }));
          setIsActive(false);
          setIsCapturing(false);
        }
      };

      if (videoTrack) videoTrack.onended = handleEnded;
      if (audioTrack) audioTrack.onended = handleEnded;

      return () => {
        if (videoTrack) videoTrack.onended = null;
        if (audioTrack) audioTrack.onended = null;
      };
    }
  }, [isActive]);

  const handleCaptureWindow = async (isReconnecting = false) => {
    try {
      // Optimized capture settings to reduce CPU/GPU load
      const videoConstraints: MediaTrackConstraints = {
        frameRate: { ideal: performanceMode === "latency" ? 15 : 30, max: 30 },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      };

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      }

      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: videoConstraints,
        // systemAudio/windowAudio ainda não constam no lib.dom, daí o cast abaixo.
        audio: {
          systemAudio: "include",
          windowAudio: "system",
        },
      } as DisplayMediaStreamOptions);

      const videoTracks = displayStream.getVideoTracks();
      const audioTracks = displayStream.getAudioTracks();

      if (videoTracks.length === 0) {
        toast.error("VÍDEO NÃO RECEBIDO");
        displayStream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
        return;
      }

      if (audioTracks.length === 0 && audioSource !== "mic") {
        toast.warning(
          "Áudio da fonte não detectado. Tente marcar 'Compartilhar áudio da guia/janela' ao selecionar a fonte.",
        );
      }

      let finalStream = displayStream;

      if (audioSource === "mic" || audioSource === "both") {
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (audioSource === "both") {
          const audioContext = new AudioContext();
          const destination = audioContext.createMediaStreamDestination();
          audioContext.createMediaStreamSource(displayStream).connect(destination);
          audioContext.createMediaStreamSource(micStream).connect(destination);

          finalStream = new MediaStream([
            ...displayStream.getVideoTracks(),
            ...destination.stream.getAudioTracks(),
          ]);
        } else {
          finalStream = new MediaStream([
            ...displayStream.getVideoTracks(),
            ...micStream.getAudioTracks(),
          ]);
        }
      }

      const settings = videoTracks[0].getSettings();
      const surface = settings.displaySurface || "unknown";

      const newSessionId = crypto.randomUUID();
      setSessionId(newSessionId);
      if (!isReconnecting) sessionStartRef.current = new Date().toISOString();
      setTranscription([]);
      setFullTranscript([]);
      setAiResponse("");
      setDecisions([]);
      setActions([]);
      setPending([]);
      setDetectedQuestion(null);
      setMeetingDuration(0);

      setTelemetry((prev) => ({
        ...prev,
        chunks: 0,
        bytes: 0,
        frames: 0,
        captureLatency: 0,
        rtt: 0,
        aiTtft: 0,
        lastTranscript: 0,
        fps: settings.frameRate || 0,
        rms: 0,
        peak: 0,
        dbfs: -Infinity,
        isSpeech: false,
        audioTrackId: audioTracks[0]?.id || "---",
        audioTrackLabel: audioTracks[0]?.label || "---",
        audioTrackState: audioTracks[0]?.readyState || "---",
      }));

      transcriptionRef.current = [];
      aiResponseRef.current = "";

      streamRef.current = finalStream;
      if (videoRef.current) {
        videoRef.current.srcObject = finalStream;
      }

      setIsCapturing(true);
      if (!isReconnecting) {
        setIsActive(true);
      }
      setSystemStatus((prev) => ({
        ...prev,
        JANELA: "ONLINE",
        ÁUDIO: "CONECTANDO",
        VÍDEO: "CONECTADO",
        STT: "AGUARDANDO",
        FONTE: surface,
      }));
    } catch (err) {
      console.error("Erro ao capturar janela:", err);
      if (!isReconnecting) {
        toast.error("Falha ao capturar janela ou áudio.");
      }
      throw err;
    }
  };

  const handleStopCapture = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    // Cleanup Audio
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;

    setIsCapturing(false);
    setIsActive(false);
    setSessionId(null);
    setSystemStatus({
      JANELA: "OFFLINE",
      ÁUDIO: "OFFLINE",
      STT: "OFFLINE",
      IA: "OFFLINE",
      VÍDEO: "OFFLINE",
    });
    toast.info("Captura encerrada.");
  }, []);

  /**
   * Encerramento real da reunião: para a captura, consolida a inteligência da
   * conversa com a IA, salva a sessão no banco e abre a ata gerada.
   */
  const handleFinishMeeting = useCallback(async () => {
    if (isFinishing) return;

    const blocks = fullTranscript;
    const startedAt = sessionStartRef.current ?? new Date().toISOString();
    const title = `${temaAtivo === "Personalizado" && customDescription ? customDescription.slice(0, 60) : temaAtivo} — ${new Date(startedAt).toLocaleDateString("pt-BR")}`;

    handleStopCapture();

    if (blocks.length === 0) {
      toast.warning("Nada foi transcrito nesta reunião, então não há ata para gerar.");
      return;
    }

    setIsFinishing(true);
    const toastId = toast.loading("Gerando ata da reunião...");

    // A ata é o caminho preferido; se a IA falhar, cai para a extração incremental
    // e, em último caso, salva a transcrição bruta — a reunião nunca se perde.
    let summary = "";
    let finalDecisions = decisions;
    let finalActions = actions;
    let finalPending = pending;
    let aiError: string | null = null;

    try {
      const minutes = await generateMinutesFn({
        data: {
          sessionId: sessionId ?? crypto.randomUUID(),
          title,
          theme: temaAtivo,
          transcription: blocks,
        },
      });

      if (minutes.ok) {
        summary = minutes.summary || minutes.objective || "";
        finalDecisions = minutes.decisions.length ? minutes.decisions : decisions;
        finalActions = minutes.actions.length ? minutes.actions : actions;
        finalPending = minutes.pending.length ? minutes.pending : pending;
      } else {
        aiError = minutes.error;
        const intelligence = await extractIntelligenceFn({ data: { blocks } });
        if (intelligence.ok) {
          summary = intelligence.summary;
          finalDecisions = intelligence.decisions.length ? intelligence.decisions : decisions;
          finalActions = intelligence.actions.length ? intelligence.actions : actions;
          finalPending = intelligence.pending.length ? intelligence.pending : pending;
        }
      }
    } catch (err: unknown) {
      aiError = String((err as Error)?.message ?? err);
    }

    try {
      const saved = await saveSessionFn({
        data: {
          title,
          startTime: startedAt,
          endTime: new Date().toISOString(),
          transcription: blocks,
          decisions: finalDecisions,
          actions: finalActions,
          pending: finalPending,
          summary,
          metadata: { theme: temaAtivo, mode: modoAtivo, durationSeconds: meetingDuration },
        },
      });

      toast.dismiss(toastId);
      if (aiError) {
        toast.warning(`Reunião salva, mas a IA falhou: ${aiError}`);
      } else {
        toast.success("Ata gerada e salva.");
      }
      navigate({ to: "/atas", search: { id: saved.id } });
    } catch (err: unknown) {
      toast.dismiss(toastId);
      toast.error(`Falha ao salvar a reunião: ${String((err as Error)?.message ?? err)}`);
    } finally {
      setIsFinishing(false);
    }
  }, [
    isFinishing,
    fullTranscript,
    decisions,
    actions,
    pending,
    sessionId,
    temaAtivo,
    modoAtivo,
    customDescription,
    meetingDuration,
    handleStopCapture,
    generateMinutesFn,
    extractIntelligenceFn,
    saveSessionFn,
    navigate,
  ]);

  const testAudio = () => {
    if (!streamRef.current) return toast.error("Selecione uma fonte primeiro.");
    const track = streamRef.current.getAudioTracks()[0];
    if (!track) return toast.error("Nenhuma trilha de áudio detectada.");

    sttMetricsRef.current.isCalibrating = true;
    sttMetricsRef.current.noiseValues = [];
    toast.info(`Calibrando áudio...\nFonte: ${track.label}\nStatus: ${track.readyState}`);
  };

  return (
    <div
      className={cn(
        "flex flex-col h-full gap-6",
        isFullscreen && "fixed inset-0 z-50 bg-black p-6",
      )}
    >
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="font-bold text-xl tracking-tight">COPILOT AO VIVO</h1>
          <div className="flex gap-2">
            <Badge
              variant="outline"
              className="bg-white/5 border-emerald-500/30 text-[9px] uppercase font-bold text-emerald-500"
            >
              MODO: {temaAtivo.toUpperCase()}
            </Badge>
            <Badge
              variant="outline"
              className="bg-white/5 border-white/5 text-[9px] uppercase font-bold text-white/60"
            >
              STATUS: {isActive ? "ESCUTANDO" : "OFFLINE"}
            </Badge>
            {isActive && (
              <Badge
                variant="outline"
                className="bg-emerald-500/10 border-emerald-500/20 text-[9px] uppercase font-bold text-emerald-500"
              >
                DURAÇÃO: {formatDuration(meetingDuration)}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                className="rounded-full border-white/10 text-white gap-2 bg-white/5 hover:bg-white/10"
              >
                <Settings className="w-4 h-4" />
                SELECIONAR TEMA
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-black border-white/10 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold tracking-tight">
                  AJUSTES DO COPILOT
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-8 py-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                      Escolha o Tema / Contexto
                    </Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "text-[9px] font-bold h-7 rounded-full",
                        isAutoDetectEnabled
                          ? "bg-emerald-500/10 text-emerald-500"
                          : "text-white/40",
                      )}
                      onClick={() => setIsAutoDetectEnabled(!isAutoDetectEnabled)}
                    >
                      AUTO DETECTAR TEMA {isAutoDetectEnabled ? "ATIVO" : ""}
                    </Button>
                  </div>
                  <RadioGroup
                    value={temaAtivo}
                    onValueChange={setTemaAtivo}
                    className="grid grid-cols-2 md:grid-cols-3 gap-2"
                  >
                    {TEMAS.map((t) => (
                      <div
                        key={t}
                        className="flex items-center space-x-2 rounded-xl border border-white/5 p-3 hover:bg-white/5 transition-colors"
                      >
                        <RadioGroupItem value={t} id={`tema-${t}`} className="border-white/20" />
                        <Label
                          htmlFor={`tema-${t}`}
                          className="text-xs font-medium cursor-pointer flex-1"
                        >
                          {t}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>

                {temaAtivo === "Personalizado" && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                    <Label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                      Sobre o que será a conversa?
                    </Label>
                    <textarea
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-sm focus:outline-none focus:border-white/20 transition-colors min-h-[100px]"
                      placeholder="Ex.: entrevista para Engenheiro de Automação na mineração."
                      value={customDescription}
                      onChange={(e) => setCustomDescription(e.target.value)}
                    />
                  </div>
                )}

                <div className="space-y-4">
                  <Label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                    Modo de Resposta
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {MODOS_RESPOSTA.map((m) => (
                      <Button
                        key={m}
                        variant="outline"
                        size="sm"
                        className={cn(
                          "rounded-full text-[10px] font-bold border-white/10",
                          modoAtivo === m
                            ? "bg-white text-black border-white"
                            : "bg-white/5 text-white/40 hover:text-white",
                        )}
                        onClick={() => setModoAtivo(m)}
                      >
                        {m.toUpperCase()}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="pt-4 flex justify-end">
                  <Button
                    className="bg-white text-black font-bold rounded-full px-8"
                    onClick={() => {
                      // Here we would sync with backend
                      console.log("Configuração salva:", {
                        temaAtivo,
                        modoAtivo,
                        customDescription,
                      });
                    }}
                  >
                    APLICAR CONFIGURAÇÃO
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Button
            variant="outline"
            onClick={() => handleCaptureWindow()}
            className={cn(
              "rounded-full border-white/10 text-white gap-2",
              isCapturing && "border-emerald-500 text-emerald-500",
            )}
          >
            <Monitor className="w-4 h-4" />
            {isCapturing ? "JANELA CAPTURADA" : "SELECIONAR JANELA (TEAMS/CHROME)"}
          </Button>
          <Button
            variant="ghost"
            className="text-white/40"
            onClick={() => setIsFullscreen(!isFullscreen)}
          >
            {isFullscreen ? <Minimize2 /> : <Maximize2 />}
          </Button>
          <Button
            disabled={isFinishing}
            onClick={() => {
              if (isActive) {
                // Para a captura, gera a ata com IA, salva no banco e abre a ata.
                void handleFinishMeeting();
              } else {
                void handleCaptureWindow();
              }
            }}
            className={cn(
              "rounded-full px-8 font-bold",
              isActive ? "bg-rose-600 hover:bg-rose-700" : "bg-white text-black hover:bg-white/90",
            )}
          >
            {isFinishing ? (
              <RefreshCw className="mr-2 w-3 h-3 animate-spin" />
            ) : isActive ? (
              <Square className="fill-white mr-2 w-3 h-3" />
            ) : (
              <Play className="fill-black mr-2 w-3 h-3" />
            )}
            {isFinishing ? "GERANDO ATA..." : isActive ? "FINALIZAR REUNIÃO" : "INICIAR"}
          </Button>
        </div>
      </header>

      <div
        className={cn(
          "grid gap-6 flex-1",
          isFullscreen ? "grid-cols-1" : "lg:grid-cols-[45%_55%] grid-cols-1",
        )}
      >
        <Card className="bg-white/[0.02] border-white/5 rounded-2xl flex flex-col overflow-hidden relative group">
          <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
            <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest bg-black/60 backdrop-blur px-2 py-1 rounded">
              FONTE CAPTURADA
            </div>
            {systemStatus.VÍDEO === "LIVE" && (
              <div className="flex items-center gap-1 text-[9px] font-bold text-emerald-500 bg-emerald-500/10 backdrop-blur px-2 py-1 rounded border border-emerald-500/20">
                <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse"></span>
                LIVE
              </div>
            )}
            {systemStatus.VÍDEO !== "LIVE" && systemStatus.VÍDEO !== "OFFLINE" && (
              <div className="flex items-center gap-1 text-[9px] font-bold text-yellow-500 bg-yellow-500/10 backdrop-blur px-2 py-1 rounded border border-yellow-500/20">
                {systemStatus.VÍDEO}
              </div>
            )}
          </div>

          <div className="absolute top-4 right-4 z-10 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              size="icon"
              variant="secondary"
              className="w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 text-white border-white/10"
              onClick={() => setShowVideo(!showVideo)}
            >
              {showVideo ? <EyeOff size={14} /> : <Eye size={14} />}
            </Button>
          </div>

          <CapturedVideoPreview
            stream={streamRef.current}
            showVideo={showVideo}
            onStatusChange={handleVideoStatus}
          />

          {!showVideo && isCapturing && (
            <div className="flex-1 flex items-center justify-center text-white/20 bg-black/40">
              <div className="flex flex-col items-center gap-2">
                <EyeOff size={48} />
                <p className="text-[10px] font-bold tracking-[0.2em] uppercase">
                  VÍDEO OCULTO (CAPTURA ATIVA)
                </p>
              </div>
            </div>
          )}

          <div className="p-4 bg-black/40 border-t border-white/5 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-col gap-1 text-[9px] font-bold text-white/40 uppercase">
                <div className="flex items-center gap-4">
                  <AudioLevelMeter level={audioLevel} status={systemStatus.ÁUDIO} />
                  <span className="flex items-center gap-1">
                    <div
                      className={cn(
                        "w-1 h-1 rounded-full",
                        systemStatus.STT.includes("RECEBENDO")
                          ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                          : "bg-white/20",
                      )}
                    ></div>
                    STT: {systemStatus.STT}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <div
                      className={cn(
                        "w-1 h-1 rounded-full",
                        systemStatus.IA === "READY"
                          ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                          : "bg-white/20",
                      )}
                    ></div>
                    IA: {systemStatus.IA}
                  </span>
                  {systemStatus.FONTE && <span>FONTE: {systemStatus.FONTE}</span>}
                  {(videoDetails.fps ?? 0) > 0 && (
                    <span className="text-yellow-500/60">FPS: {videoDetails.fps}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-white/5 pt-3">
              <div className="flex items-center gap-2">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[9px] font-bold rounded-full border-white/10 hover:bg-white/5 text-white/40"
                    >
                      <Terminal size={10} className="mr-1" /> DIAGNÓSTICO
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-black border-white/10 text-white max-w-md">
                    <DialogHeader>
                      <DialogTitle className="text-xl font-bold flex items-center gap-2">
                        <Activity className="w-5 h-5 text-emerald-500" />
                        TELEMETRIA EM TEMPO REAL
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4 font-mono text-xs">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <p className="text-white/40 uppercase text-[10px]">Media Pipeline</p>
                          <div className="flex justify-between">
                            <span>VIDEO:</span>{" "}
                            <span
                              className={cn(
                                systemStatus.VÍDEO === "LIVE"
                                  ? "text-emerald-500"
                                  : "text-yellow-500",
                              )}
                            >
                              {systemStatus.VÍDEO}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>AUDIO:</span>{" "}
                            <span
                              className={cn(
                                systemStatus.ÁUDIO === "ONLINE"
                                  ? "text-emerald-500"
                                  : "text-rose-500",
                              )}
                            >
                              {systemStatus.ÁUDIO}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>FPS:</span> <span className="text-white">{telemetry.fps}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>TRACK ID:</span>{" "}
                            <span className="text-white/60 text-[8px] truncate max-w-[80px]">
                              {telemetry.audioTrackId}
                            </span>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <p className="text-white/40 uppercase text-[10px]">STT Metrics</p>
                          <div className="flex justify-between">
                            <span>FRAMES:</span>{" "}
                            <span className="text-white">{telemetry.frames.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>CHUNKS:</span>{" "}
                            <span className="text-white">{telemetry.chunks}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>BYTES:</span>{" "}
                            <span className="text-white">
                              {(telemetry.bytes / 1024).toFixed(1)} KB
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>RTT:</span>{" "}
                            <span className="text-white">{telemetry.rtt.toFixed(0)}ms</span>
                          </div>
                        </div>
                      </div>

                      <div className="pt-4 border-t border-white/10 space-y-2">
                        <p className="text-white/40 uppercase text-[10px]">Audio Analysis (VAD)</p>
                        <div className="grid grid-cols-2 gap-x-4">
                          <div className="flex justify-between">
                            <span>RMS:</span>{" "}
                            <span className="text-white">{telemetry.rms.toFixed(4)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>PEAK:</span>{" "}
                            <span className="text-white">{telemetry.peak.toFixed(4)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>DBFS:</span>{" "}
                            <span
                              className={cn(telemetry.isSpeech ? "text-emerald-500" : "text-white")}
                            >
                              {telemetry.dbfs.toFixed(1)} dB
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>NOISE:</span>{" "}
                            <span className="text-white">{telemetry.noiseFloor.toFixed(1)} dB</span>
                          </div>
                          <div className="flex justify-between">
                            <span>SPEECH:</span>{" "}
                            <span
                              className={cn(
                                telemetry.isSpeech ? "text-emerald-500" : "text-white/20",
                              )}
                            >
                              {telemetry.isSpeech ? "DETECTADA" : "SILÊNCIO"}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>CALIB:</span>{" "}
                            <span className="text-white">
                              {sttMetricsRef.current.isCalibrating ? "ATIVO" : "OK"}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="pt-4 border-t border-white/10 space-y-2">
                        <p className="text-white/40 uppercase text-[10px] mb-2">Últimos Eventos</p>
                        <div className="space-y-1 text-[10px]">
                          <p>
                            <span className="text-emerald-500">[STT]</span>{" "}
                            {telemetry.lastTranscript
                              ? new Date(telemetry.lastTranscript).toLocaleTimeString()
                              : "---"}{" "}
                            - Fluxo de áudio ativo
                          </p>
                          <p>
                            <span className="text-blue-500">[IA]</span> Prompt contextualizado com
                            tema: {temaAtivo}
                          </p>
                        </div>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>

                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[9px] font-bold rounded-full border-rose-500/20 text-rose-500 hover:bg-rose-500/10"
                  onClick={handleStopCapture}
                >
                  <XCircle size={10} className="mr-1" /> PARAR
                </Button>
              </div>

              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[9px] font-bold rounded-full border-white/10 hover:bg-white/5 text-white/40"
                onClick={testAudio}
              >
                <Volume2 size={10} className="mr-1" /> TESTAR
              </Button>
            </div>
          </div>
        </Card>
        <Card className="bg-[#0A0A0A] border-white/5 rounded-2xl flex flex-col overflow-hidden">
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full flex flex-col h-full"
          >
            <div className="px-6 pt-6 border-b border-white/5">
              <TabsList className="bg-white/5 border-white/10 w-full justify-start gap-2 h-10 p-1">
                <TabsTrigger
                  value="transcricao"
                  className="text-[10px] font-bold uppercase data-[state=active]:bg-white data-[state=active]:text-black"
                >
                  <Mic size={12} className="mr-2" /> TRANSCRIÇÃO
                </TabsTrigger>
                <TabsTrigger
                  value="perguntas"
                  className="text-[10px] font-bold uppercase data-[state=active]:bg-white data-[state=active]:text-black"
                >
                  <HelpCircle size={12} className="mr-2" /> PERGUNTAS
                </TabsTrigger>
                <TabsTrigger
                  value="decisoes"
                  className="text-[10px] font-bold uppercase data-[state=active]:bg-white data-[state=active]:text-black"
                >
                  <CheckCircle2 size={12} className="mr-2" /> DECISÕES
                </TabsTrigger>
                <TabsTrigger
                  value="acoes"
                  className="text-[10px] font-bold uppercase data-[state=active]:bg-white data-[state=active]:text-black"
                >
                  <ListChecks size={12} className="mr-2" /> AÇÕES
                </TabsTrigger>
                <TabsTrigger
                  value="pendencias"
                  className="text-[10px] font-bold uppercase data-[state=active]:bg-white data-[state=active]:text-black"
                >
                  <AlertTriangle size={12} className="mr-2" /> PENDÊNCIAS
                </TabsTrigger>
                <TabsTrigger
                  value="ata"
                  className="text-[10px] font-bold uppercase data-[state=active]:bg-white data-[state=active]:text-black"
                >
                  <FileText size={12} className="mr-2" /> ATA
                </TabsTrigger>
              </TabsList>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-6">
                <TabsContent value="transcricao" className="mt-0 space-y-4">
                  {fullTranscript.length === 0 ? (
                    <div className="text-center py-20 text-white/10 uppercase text-[10px] font-bold tracking-widest">
                      Aguardando áudio real para transcrição...
                    </div>
                  ) : (
                    fullTranscript
                      .slice()
                      .reverse()
                      .map((block, i) => (
                        <div
                          key={i}
                          className="space-y-1 animate-in fade-in slide-in-from-left-2 duration-300"
                        >
                          <div className="flex items-center gap-2 text-[9px] font-bold text-white/20">
                            <ClockIcon size={10} /> {block.timestamp}
                            <span
                              className={cn(
                                "px-1.5 py-0.5 rounded flex items-center gap-1",
                                block.speaker === "Deivid"
                                  ? "bg-emerald-500/10 text-emerald-500"
                                  : "bg-blue-500/10 text-blue-500",
                              )}
                            >
                              {block.speaker === "Deivid" && <Crown size={8} />}
                              {block.speaker?.toUpperCase()}
                            </span>
                          </div>
                          <p
                            className={cn(
                              "text-sm leading-relaxed",
                              block.speaker === "Deivid" ? "text-white" : "text-white/60",
                            )}
                          >
                            {block.text}
                          </p>
                        </div>
                      ))
                  )}
                </TabsContent>

                <TabsContent value="perguntas" className="mt-0 space-y-4">
                  {detectedQuestion && (
                    <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl space-y-4 animate-in zoom-in-95 duration-300">
                      <div className="flex items-center justify-between">
                        <Badge className="bg-emerald-500 text-black font-black text-[9px]">
                          ⚡ PERGUNTA PARA VOCÊ
                        </Badge>
                        {isGeneratingResponse && (
                          <span className="text-[9px] font-bold text-emerald-500 animate-pulse">
                            GERANDO RESPOSTA...
                          </span>
                        )}
                      </div>
                      <p className="text-lg font-bold text-white leading-tight italic">
                        "{detectedQuestion}"
                      </p>
                      {aiResponse && (
                        <div className="pt-4 border-t border-white/10 space-y-2">
                          <div className="text-[9px] font-bold text-white/40 uppercase">
                            Resposta Sugerida ({modoAtivo})
                          </div>
                          <p className="text-emerald-500 text-sm leading-relaxed">{aiResponse}</p>
                          <div className="flex gap-2 pt-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[9px] font-bold rounded-full border-white/10"
                              onClick={() => {
                                const block = {
                                  id: crypto.randomUUID(),
                                  timestamp: new Date().toLocaleTimeString(transcriptionLocale),
                                  speaker: "Deivid",
                                  text: aiResponse,
                                };
                                setFullTranscript((prev) => [...prev, block]);
                                setAiResponse("");
                                setDetectedQuestion(null);
                              }}
                            >
                              USAR RESPOSTA
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-[9px] font-bold rounded-full text-white/40"
                              onClick={() => setAiResponse("")}
                            >
                              DESCARTAR
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {!detectedQuestion && (
                    <div className="text-center py-20 text-white/10 uppercase text-[10px] font-bold tracking-widest">
                      Nenhuma pergunta detectada ainda.
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="decisoes" className="mt-0 space-y-3">
                  {decisions.map((d, i) => (
                    <div
                      key={i}
                      className="p-3 bg-blue-500/5 border border-blue-500/10 rounded-xl flex items-start gap-3"
                    >
                      <CheckCircle2 size={14} className="text-blue-500 mt-0.5" />
                      <p className="text-xs text-white/80">{d}</p>
                    </div>
                  ))}
                  {decisions.length === 0 && (
                    <div className="text-center py-20 text-white/10 uppercase text-[10px] font-bold tracking-widest">
                      Nenhuma decisão registrada.
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="acoes" className="mt-0 space-y-3">
                  {actions.map((a, i) => (
                    <div
                      key={i}
                      className="p-3 bg-purple-500/5 border border-purple-500/10 rounded-xl space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-bold text-purple-500 uppercase tracking-widest">
                          {a.responsible}
                        </span>
                        <span className="text-[9px] text-white/20">Prazo: {a.deadline}</span>
                      </div>
                      <p className="text-xs text-white/80 font-bold">{a.task}</p>
                    </div>
                  ))}
                  {actions.length === 0 && (
                    <div className="text-center py-20 text-white/10 uppercase text-[10px] font-bold tracking-widest">
                      Nenhuma ação definida.
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="pendencias" className="mt-0 space-y-3">
                  {pending.map((p, i) => (
                    <div
                      key={i}
                      className="p-3 bg-yellow-500/5 border border-yellow-500/10 rounded-xl flex items-start gap-3"
                    >
                      <AlertTriangle size={14} className="text-yellow-500 mt-0.5" />
                      <p className="text-xs text-white/80">{p}</p>
                    </div>
                  ))}
                  {pending.length === 0 && (
                    <div className="text-center py-20 text-white/10 uppercase text-[10px] font-bold tracking-widest">
                      Sem pendências no momento.
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="ata" className="mt-0 text-center py-20">
                  <FileText className="w-12 h-12 text-white/5 mx-auto mb-4" />
                  <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest max-w-[200px] mx-auto">
                    A ata final será gerada automaticamente ao encerrar a reunião.
                  </p>
                </TabsContent>
              </div>
            </ScrollArea>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
