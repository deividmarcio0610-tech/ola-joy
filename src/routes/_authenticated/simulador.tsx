import { createFileRoute } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowRight,
  Briefcase,
  Brain,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  Keyboard,
  Loader2,
  Mic,
  RefreshCcw,
  Sparkles,
  Square,
  Target,
  Timer,
  TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { APP_CONFIG } from "@/lib/app-config";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  evaluateInterviewAnswers,
  generateInterviewQuestions,
  type InterviewPerQuestionFeedback,
} from "@/lib/interview.functions";
import { transcribeChunk } from "@/lib/stt.functions";
import {
  bytesToBase64,
  downmixToMono,
  encodeWav,
  resample,
  validatePcm,
} from "@/lib/audio-pipeline";

export const Route = createFileRoute("/_authenticated/simulador")({
  component: InterviewSimulatorPage,
});

type Step = "setup" | "interview" | "feedback";

interface Evaluation {
  score: number;
  starAdherence: number;
  strengths: string[];
  improvements: string[];
  summary: string;
  answeredCount: number;
  totalQuestions: number;
  perQuestion: InterviewPerQuestionFeedback[];
}

const LEVELS = ["Júnior", "Pleno", "Sênior", "Especialista", "Gestão"];
const AREAS = [
  "Tecnologia",
  "Engenharia",
  "Manutenção",
  "Comercial",
  "RH",
  "Financeiro",
  "Operações",
];
const AMOUNTS = [3, 5, 8];

/** Taxa de amostragem exigida pelo STT do app. */
const STT_SAMPLE_RATE = 16000;
/** Janela de envio durante a gravação (segundos de áudio acumulado). */
const FLUSH_WINDOW_SECONDS = 4;
/** Mínimo de áudio para valer um envio ao encerrar a gravação. */
const FINAL_FLUSH_MIN_SECONDS = 0.5;

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function errorMessage(err: unknown): string {
  return String((err as Error)?.message ?? err);
}

function slugify(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "entrevista"
  );
}

function InterviewSimulatorPage() {
  const [step, setStep] = useState<Step>("setup");
  const [config, setConfig] = useState({ area: "", vaga: "", nivel: "Pleno" });
  const [amount, setAmount] = useState(5);

  // Etapa 1 — geração das perguntas
  const [questions, setQuestions] = useState<string[]>([]);
  const [questionsSource, setQuestionsSource] = useState<string>("");
  const [questionsNotice, setQuestionsNotice] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  // Etapa 2 — entrevista
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [timer, setTimer] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [sttStatus, setSttStatus] = useState("");
  const [sttError, setSttError] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [partialText, setPartialText] = useState("");

  // Etapa 3 — feedback
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);

  // Server functions reais
  const generateQuestionsFn = useServerFn(generateInterviewQuestions);
  const evaluateAnswersFn = useServerFn(evaluateInterviewAnswers);
  const transcribeChunkFn = useServerFn(transcribeChunk);

  // Recursos de áudio mantidos em refs (não devem provocar re-render)
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sinkRef = useRef<GainNode | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pcmBufferRef = useRef<Float32Array[]>([]);
  const bufferedSamplesRef = useRef(0);
  const inputRateRef = useRef(48000);
  const isSendingRef = useRef(false);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const questionIndexRef = useRef(0);

  useEffect(() => {
    questionIndexRef.current = currentQuestionIndex;
  }, [currentQuestionIndex]);

  /** Anexa um trecho transcrito à resposta da pergunta atual (sem apagar o que o usuário digitou). */
  const appendToAnswer = useCallback((text: string) => {
    const clean = text.trim();
    if (!clean) return;
    const index = questionIndexRef.current;
    setAnswers((prev) => {
      const next = [...prev];
      const base = (next[index] ?? "").trim();
      next[index] = base ? `${base} ${clean}` : clean;
      return next;
    });
  }, []);

  /** Desliga nós de áudio, para as tracks do microfone e fecha o AudioContext. */
  const releaseAudioResources = useCallback(() => {
    if (flushTimerRef.current) {
      clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    const processor = processorRef.current;
    if (processor) {
      processor.onaudioprocess = null;
      processor.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (sinkRef.current) {
      sinkRef.current.disconnect();
      sinkRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    const ctx = audioContextRef.current;
    audioContextRef.current = null;
    if (ctx && ctx.state !== "closed") {
      void ctx.close().catch(() => undefined);
    }
  }, []);

  /**
   * Converte o áudio acumulado (Float32 na taxa do dispositivo) em WAV 16 kHz
   * e envia ao STT real. `force` permite enviar o resto ao encerrar a gravação.
   */
  const flushAudioBuffer = useCallback(
    async (force: boolean) => {
      if (isSendingRef.current) return;

      const rate = inputRateRef.current;
      const count = bufferedSamplesRef.current;
      const minSamples = Math.floor(
        rate * (force ? FINAL_FLUSH_MIN_SECONDS : FLUSH_WINDOW_SECONDS),
      );
      if (count < minSamples) return;

      const chunks = pcmBufferRef.current;
      pcmBufferRef.current = [];
      bufferedSamplesRef.current = 0;

      const merged = new Float32Array(count);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }

      const resampled = resample(merged, rate, STT_SAMPLE_RATE);
      const validation = validatePcm(resampled, STT_SAMPLE_RATE);
      if (!validation.valid) {
        setSttStatus("Trecho sem fala audível — nada foi enviado.");
        return;
      }

      const wav = encodeWav(resampled, STT_SAMPLE_RATE);
      isSendingRef.current = true;
      setSttStatus("Transcrevendo trecho...");

      const send = (async () => {
        try {
          const res = await transcribeChunkFn({
            data: { wavBase64: bytesToBase64(wav), language: "pt" },
          });

          if (!res.ok) {
            throw new Error(res.error || "O serviço de transcrição não respondeu.");
          }

          if (res.text) {
            setSttError(null);
            setPartialText(res.text);
            appendToAnswer(res.text);
            setSttStatus("Trecho transcrito.");
          } else {
            setSttStatus("Nenhuma palavra reconhecida neste trecho.");
          }
        } catch (err) {
          setSttError(errorMessage(err));
          setSttStatus("Falha na transcrição — use o campo de texto abaixo.");
        } finally {
          isSendingRef.current = false;
        }
      })();

      inFlightRef.current = send;
      await send;
    },
    [appendToAnswer, transcribeChunkFn],
  );

  // Referência estável usada pelo intervalo de envio (evita closure obsoleta).
  const flushRef = useRef(flushAudioBuffer);
  useEffect(() => {
    flushRef.current = flushAudioBuffer;
  }, [flushAudioBuffer]);

  const stopRecording = useCallback(async () => {
    releaseAudioResources();
    setIsRecording(false);
    setAudioLevel(0);
    // Espera o envio em curso terminar e só então despacha o áudio restante,
    // para não descartar o final da resposta.
    if (inFlightRef.current) await inFlightRef.current.catch(() => undefined);
    await flushRef.current(true);
  }, [releaseAudioResources]);

  const startRecording = useCallback(async () => {
    setMicError(null);
    setSttError(null);
    setPartialText("");

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setMicError(
        "Este navegador não permite acesso ao microfone. Digite sua resposta no campo abaixo.",
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioContextCtor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) throw new Error("AudioContext indisponível neste navegador.");

      const ctx = new AudioContextCtor();
      audioContextRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();

      inputRateRef.current = ctx.sampleRate;
      pcmBufferRef.current = [];
      bufferedSamplesRef.current = 0;
      isSendingRef.current = false;
      inFlightRef.current = null;

      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      // Saída muda: mantém o processor rodando sem devolver o áudio ao usuário.
      const sink = ctx.createGain();
      sink.gain.value = 0;
      source.connect(processor);
      processor.connect(sink);
      sink.connect(ctx.destination);

      sourceRef.current = source;
      processorRef.current = processor;
      sinkRef.current = sink;

      let lastUiUpdate = 0;

      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer;
        const channels: Float32Array[] = [];
        for (let c = 0; c < input.numberOfChannels; c++) {
          channels.push(input.getChannelData(c));
        }
        const mono = downmixToMono(channels);

        pcmBufferRef.current.push(new Float32Array(mono));
        bufferedSamplesRef.current += mono.length;

        let sum = 0;
        for (let i = 0; i < mono.length; i++) sum += mono[i] * mono[i];
        const rms = Math.sqrt(sum / Math.max(1, mono.length));

        const now = Date.now();
        if (now - lastUiUpdate > 150) {
          lastUiUpdate = now;
          setAudioLevel(Math.min(100, rms * 400));
        }
      };

      flushTimerRef.current = setInterval(() => {
        void flushRef.current(false);
      }, 500);

      setTimer(0);
      setIsRecording(true);
      setSttStatus("Microfone ativo. Fale sua resposta.");
    } catch (err) {
      releaseAudioResources();
      setIsRecording(false);
      setAudioLevel(0);
      setMicError(
        `Não foi possível acessar o microfone (${errorMessage(err)}). Digite sua resposta no campo abaixo.`,
      );
    }
  }, [releaseAudioResources]);

  // Cronômetro real da resposta em curso.
  useEffect(() => {
    if (!isRecording) return;
    const id = setInterval(() => setTimer((prev) => prev + 1), 1000);
    return () => clearInterval(id);
  }, [isRecording]);

  // Nada de stream nem AudioContext sobrevive à saída da tela.
  useEffect(() => {
    return () => releaseAudioResources();
  }, [releaseAudioResources]);

  const setAnswerAt = useCallback((index: number, value: string) => {
    setAnswers((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  const resetInterviewState = useCallback(() => {
    setCurrentQuestionIndex(0);
    setTimer(0);
    setIsRecording(false);
    setAudioLevel(0);
    setPartialText("");
    setSttStatus("");
    setSttError(null);
    setMicError(null);
  }, []);

  const handleStartInterview = useCallback(async () => {
    if (!config.area || !config.vaga.trim()) return;
    setIsGenerating(true);
    setSetupError(null);
    try {
      const res = await generateQuestionsFn({
        data: {
          area: config.area,
          vaga: config.vaga.trim(),
          nivel: config.nivel,
          quantidade: amount,
        },
      });

      if (!res.ok) {
        setSetupError(res.error);
        return;
      }

      setQuestions(res.questions);
      setQuestionsSource(res.source);
      setQuestionsNotice(res.notice);
      setAnswers(res.questions.map(() => ""));
      setEvaluation(null);
      setEvaluationError(null);
      setShowTranscript(false);
      resetInterviewState();
      setStep("interview");
    } catch (err) {
      setSetupError(errorMessage(err));
    } finally {
      setIsGenerating(false);
    }
  }, [amount, config, generateQuestionsFn, resetInterviewState]);

  const runEvaluation = useCallback(
    async (pairs: Array<{ question: string; answer: string }>) => {
      setIsEvaluating(true);
      setEvaluationError(null);
      setEvaluation(null);
      try {
        const res = await evaluateAnswersFn({
          data: {
            area: config.area,
            vaga: config.vaga.trim(),
            nivel: config.nivel,
            answers: pairs,
          },
        });

        if (!res.ok) {
          setEvaluationError(res.error);
          return;
        }

        setEvaluation({
          score: res.score,
          starAdherence: res.starAdherence,
          strengths: res.strengths,
          improvements: res.improvements,
          summary: res.summary,
          answeredCount: res.answeredCount,
          totalQuestions: res.totalQuestions,
          perQuestion: res.perQuestion,
        });
      } catch (err) {
        setEvaluationError(errorMessage(err));
      } finally {
        setIsEvaluating(false);
      }
    },
    [config, evaluateAnswersFn],
  );

  const buildPairs = useCallback(
    () => questions.map((question, i) => ({ question, answer: answers[i] ?? "" })),
    [answers, questions],
  );

  const handleFinishInterview = useCallback(async () => {
    if (isRecording) await stopRecording();
    else releaseAudioResources();
    const pairs = buildPairs();
    setStep("feedback");
    setShowTranscript(false);
    await runEvaluation(pairs);
  }, [buildPairs, isRecording, releaseAudioResources, runEvaluation, stopRecording]);

  const handleCancelInterview = useCallback(async () => {
    if (isRecording) await stopRecording();
    else releaseAudioResources();
    resetInterviewState();
    setAnswers(questions.map(() => ""));
    setStep("setup");
  }, [isRecording, questions, releaseAudioResources, resetInterviewState, stopRecording]);

  const handleChangeQuestion = useCallback(
    async (nextIndex: number) => {
      if (isRecording) await stopRecording();
      setPartialText("");
      setSttStatus("");
      setTimer(0);
      setCurrentQuestionIndex(nextIndex);
    },
    [isRecording, stopRecording],
  );

  const handleNewTraining = useCallback(() => {
    releaseAudioResources();
    resetInterviewState();
    setQuestions([]);
    setAnswers([]);
    setQuestionsSource("");
    setQuestionsNotice("");
    setEvaluation(null);
    setEvaluationError(null);
    setShowTranscript(false);
    setStep("setup");
  }, [releaseAudioResources, resetInterviewState]);

  /** Exporta o relatório real em Markdown (nada é impresso na tela do navegador). */
  const handleDownloadReport = useCallback(() => {
    if (!evaluation) return;

    const lines: string[] = [
      `# Relatório de Simulação de Entrevista — ${APP_CONFIG.name}`,
      "",
      `- **Vaga:** ${config.vaga || "não informada"}`,
      `- **Área:** ${config.area || "não informada"}`,
      `- **Nível:** ${config.nivel}`,
      `- **Data:** ${new Date().toLocaleString("pt-BR")}`,
      `- **Perguntas respondidas:** ${evaluation.answeredCount} de ${evaluation.totalQuestions}`,
      `- **Origem das perguntas:** ${questionsSource === "ia" ? "geradas por IA" : "roteiro padrão"}`,
      "",
      "## Resultado",
      "",
      `- **Score geral:** ${evaluation.score.toFixed(1)} / 10`,
      `- **Aderência ao método STAR:** ${evaluation.starAdherence}%`,
      "",
    ];

    if (evaluation.summary) {
      lines.push("## Resumo da análise", "", evaluation.summary, "");
    }

    lines.push("## Pontos fortes", "");
    lines.push(
      ...(evaluation.strengths.length
        ? evaluation.strengths.map((item) => `- ${item}`)
        : ["- Nenhum ponto forte foi apontado pela análise."]),
    );
    lines.push("", "## Pontos a melhorar", "");
    lines.push(
      ...(evaluation.improvements.length
        ? evaluation.improvements.map((item) => `- ${item}`)
        : ["- Nenhum ponto de melhoria foi apontado pela análise."]),
    );

    lines.push("", "## Perguntas, respostas e comentários", "");
    evaluation.perQuestion.forEach((item, i) => {
      lines.push(
        `### ${i + 1}. ${item.question}`,
        "",
        `**Sua resposta:** ${answers[i]?.trim() || "(não respondida)"}`,
        "",
        `**Comentário da IA:** ${item.comment}`,
        "",
        `**Nota:** ${item.score.toFixed(1)} / 10`,
        "",
      );
    });

    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `relatorio-entrevista-${slugify(config.vaga)}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }, [answers, config, evaluation, questionsSource]);

  // ===================== ETAPA 1 — SETUP =====================
  if (step === "setup") {
    const canStart = Boolean(config.area && config.vaga.trim()) && !isGenerating;

    return (
      <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
        <div className="space-y-2">
          <Badge
            variant="outline"
            className="bg-white/5 text-white/40 border-white/10 uppercase tracking-widest text-[10px] font-bold"
          >
            Preparação STAR
          </Badge>
          <h1 className="text-4xl font-extrabold tracking-tight text-white">
            Simulador de Entrevista
          </h1>
          <p className="text-white/40 font-medium">
            Configure o cenário. A IA gera as perguntas e depois avalia as suas respostas reais.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="p-6 border-white/5 bg-white/[0.02] shadow-sm space-y-4">
            <div className="w-10 h-10 rounded-xl bg-white/5 text-white/40 flex items-center justify-center">
              <Briefcase className="w-5 h-5" />
            </div>
            <div className="space-y-2">
              <label
                htmlFor="sim-area"
                className="text-xs font-bold text-white/20 uppercase tracking-widest"
              >
                Área de Atuação
              </label>
              <select
                id="sim-area"
                className="w-full bg-white/5 border border-white/10 rounded-lg text-sm p-2 outline-none focus:ring-1 focus:ring-emerald-500/40 text-white"
                value={config.area}
                onChange={(e) => setConfig({ ...config, area: e.target.value })}
              >
                <option value="">Selecione...</option>
                {AREAS.map((a) => (
                  <option key={a} value={a} className="bg-black">
                    {a}
                  </option>
                ))}
              </select>
            </div>
          </Card>

          <Card className="p-6 border-white/5 bg-white/[0.02] shadow-sm space-y-4">
            <div className="w-10 h-10 rounded-xl bg-white/5 text-white/40 flex items-center justify-center">
              <Target className="w-5 h-5" />
            </div>
            <div className="space-y-2">
              <label
                htmlFor="sim-vaga"
                className="text-xs font-bold text-white/20 uppercase tracking-widest"
              >
                Cargo / Vaga
              </label>
              <input
                id="sim-vaga"
                type="text"
                placeholder="Ex.: Engenheiro de Dados"
                className="w-full bg-white/5 border border-white/10 rounded-lg text-sm p-2 outline-none focus:ring-1 focus:ring-emerald-500/40 text-white placeholder:text-white/20"
                value={config.vaga}
                onChange={(e) => setConfig({ ...config, vaga: e.target.value })}
              />
            </div>
          </Card>

          <Card className="p-6 border-white/5 bg-white/[0.02] shadow-sm space-y-4">
            <div className="w-10 h-10 rounded-xl bg-white/5 text-white/40 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div className="space-y-2">
              <span className="block text-xs font-bold text-white/20 uppercase tracking-widest">
                Nível
              </span>
              <div className="flex flex-wrap gap-2">
                {LEVELS.map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setConfig({ ...config, nivel: l })}
                    className={cn(
                      "px-3 py-1 text-[10px] font-bold rounded-full border transition-all",
                      config.nivel === l
                        ? "bg-emerald-500 text-black border-emerald-500 shadow-lg shadow-emerald-500/10"
                        : "bg-white/5 text-white/40 border-white/10 hover:border-white/20",
                    )}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </Card>
        </div>

        <Card className="p-6 border-white/5 bg-white/[0.02] shadow-sm space-y-3">
          <span className="block text-xs font-bold text-white/20 uppercase tracking-widest">
            Quantidade de perguntas
          </span>
          <div className="flex flex-wrap gap-2">
            {AMOUNTS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setAmount(n)}
                className={cn(
                  "px-4 py-1.5 text-[11px] font-bold rounded-full border transition-all",
                  amount === n
                    ? "bg-emerald-500 text-black border-emerald-500"
                    : "bg-white/5 text-white/40 border-white/10 hover:border-white/20",
                )}
              >
                {n} perguntas
              </button>
            ))}
          </div>
        </Card>

        <div className="bg-[#0A0A0A] border border-white/5 rounded-[2rem] p-8 text-white relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-all">
            <Brain className="w-24 h-24 rotate-12" />
          </div>
          <div className="relative z-10 space-y-6">
            <div className="flex items-center gap-3 text-white/40">
              <Sparkles className="w-6 h-6" />
              <span className="font-bold tracking-widest text-xs uppercase text-white/40">
                Inteligência {APP_CONFIG.name}
              </span>
            </div>
            <h2 className="text-2xl font-bold max-w-lg">
              A IA gera perguntas específicas para a vaga e avalia somente o que você realmente
              responder.
            </h2>
            <ul className="space-y-3">
              <li className="flex items-center gap-3 text-sm text-white/70">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Perguntas geradas para o
                cargo, a área e o nível informados
              </li>
              <li className="flex items-center gap-3 text-sm text-white/70">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Resposta por voz transcrita de
                verdade, com edição por texto
              </li>
              <li className="flex items-center gap-3 text-sm text-white/70">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Feedback STAR baseado apenas
                no conteúdo das suas respostas
              </li>
            </ul>

            {setupError && (
              <div className="flex items-start gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4">
                <AlertCircle className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="text-xs font-bold uppercase tracking-widest text-rose-500">
                    Falha ao gerar as perguntas
                  </p>
                  <p className="text-sm text-white/60">{setupError}</p>
                </div>
              </div>
            )}

            <Button
              size="lg"
              onClick={() => void handleStartInterview()}
              disabled={!canStart}
              className="bg-emerald-500 hover:bg-emerald-400 text-black rounded-full px-12 h-14 text-lg font-bold shadow-2xl shadow-emerald-500/10 disabled:opacity-40"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" /> GERANDO PERGUNTAS...
                </>
              ) : (
                <>
                  INICIAR TREINAMENTO <ArrowRight className="w-5 h-5 ml-2" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ===================== ETAPA 2 — ENTREVISTA =====================
  if (step === "interview") {
    const total = questions.length;
    const isLast = currentQuestionIndex >= total - 1;
    const currentAnswer = answers[currentQuestionIndex] ?? "";
    const progress = total > 0 ? ((currentQuestionIndex + 1) / total) * 100 : 0;
    const answeredCount = answers.filter((a) => a.trim().length > 0).length;

    return (
      <div className="max-w-4xl mx-auto space-y-8 animate-in zoom-in-95 duration-500">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-white">
              <Timer className="w-6 h-6" />
            </div>
            <div>
              <h2 className="font-bold text-white">
                Questão {currentQuestionIndex + 1} de {total}
              </h2>
              <p className="text-xs text-white/40 font-bold uppercase tracking-widest">
                {config.vaga} • {config.nivel} • {answeredCount} respondida(s)
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-mono font-bold text-white">{formatTime(timer)}</div>
            <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest">
              Tempo de gravação
            </p>
          </div>
        </div>

        <div className="h-2 w-full rounded-full bg-white/5 overflow-hidden">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {questionsSource === "padrao" && questionsNotice && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
            <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-white/60">{questionsNotice}</p>
          </div>
        )}

        <Card className="p-8 md:p-12 border-white/5 shadow-xl bg-[#0A0A0A] space-y-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500/40" />

          <div className="space-y-4 text-center">
            <Badge
              variant="outline"
              className="bg-white/5 text-white/40 border-white/10 uppercase tracking-widest text-[10px] font-bold"
            >
              {questionsSource === "ia" ? "Pergunta gerada pela IA" : "Pergunta do roteiro padrão"}
            </Badge>
            <h3 className="text-2xl md:text-3xl font-bold text-white leading-tight italic">
              “{questions[currentQuestionIndex]}”
            </h3>
          </div>

          <div className="flex flex-col items-center gap-5">
            <button
              type="button"
              onClick={() => void (isRecording ? stopRecording() : startRecording())}
              className={cn(
                "w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 relative shadow-2xl",
                isRecording
                  ? "bg-rose-500 text-white hover:bg-rose-600 scale-110"
                  : "bg-emerald-500 text-black hover:bg-emerald-400 hover:scale-105",
              )}
            >
              {isRecording ? (
                <>
                  <Square className="w-8 h-8 fill-current" />
                  <span className="absolute -inset-4 rounded-full border-2 border-rose-500 animate-ping opacity-25" />
                </>
              ) : (
                <Mic className="w-10 h-10" />
              )}
            </button>

            <p
              className={cn(
                "text-sm font-bold uppercase tracking-widest transition-colors",
                isRecording ? "text-rose-500" : "text-white/20",
              )}
            >
              {isRecording ? "Gravando — clique para parar" : "Clique no microfone para responder"}
            </p>

            {isRecording && (
              <div className="w-full max-w-xs h-1.5 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-150"
                  style={{ width: `${Math.max(2, audioLevel)}%` }}
                />
              </div>
            )}

            {sttStatus && (
              <p className="text-[11px] font-medium text-white/40 text-center">{sttStatus}</p>
            )}

            {partialText && (
              <div className="w-full rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 mb-1">
                  Transcrição parcial
                </p>
                <p className="text-sm text-white/70 italic">“{partialText}”</p>
              </div>
            )}

            {micError && (
              <div className="w-full flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
                <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <p className="text-xs text-white/60">{micError}</p>
              </div>
            )}

            {sttError && (
              <div className="w-full flex items-start gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4">
                <AlertCircle className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
                <p className="text-xs text-white/60">
                  Erro na transcrição: {sttError}. Você pode digitar a resposta abaixo.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-white/40">
                <Keyboard className="w-3.5 h-3.5" /> Sua resposta (edite livremente)
              </span>
              <span className="text-[10px] font-mono text-white/20">
                {currentAnswer.trim().length} caracteres
              </span>
            </div>
            <Textarea
              value={currentAnswer}
              onChange={(e) => setAnswerAt(currentQuestionIndex, e.target.value)}
              placeholder="A transcrição do seu áudio aparece aqui. Sem microfone, digite a resposta diretamente."
              className="min-h-[160px] bg-white/[0.02] border-white/5 text-white placeholder:text-white/20 focus-visible:ring-emerald-500/30 rounded-2xl"
            />
          </div>
        </Card>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => void handleCancelInterview()}
            className="text-xs font-bold uppercase tracking-widest text-white/20 hover:text-white flex items-center gap-2 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Cancelar treinamento
          </button>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              disabled={currentQuestionIndex === 0}
              onClick={() => void handleChangeQuestion(currentQuestionIndex - 1)}
              className="rounded-full border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4 mr-1" /> Anterior
            </Button>

            {isLast ? (
              <Button
                onClick={() => void handleFinishInterview()}
                className="rounded-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold px-8"
              >
                Finalizar e analisar <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button
                onClick={() => void handleChangeQuestion(currentQuestionIndex + 1)}
                className="rounded-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold px-8"
              >
                Próxima <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ===================== ETAPA 3 — FEEDBACK =====================
  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
      <div className="text-center space-y-4">
        <div
          className={cn(
            "w-20 h-20 rounded-3xl flex items-center justify-center mx-auto shadow-xl mb-6",
            evaluation
              ? "bg-emerald-500/10 text-emerald-500 shadow-emerald-500/5"
              : "bg-white/5 text-white/40",
          )}
        >
          {isEvaluating ? (
            <Loader2 className="w-10 h-10 animate-spin" />
          ) : evaluation ? (
            <CheckCircle2 className="w-10 h-10" />
          ) : (
            <AlertCircle className="w-10 h-10 text-rose-500" />
          )}
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight text-white">
          Análise de Performance {APP_CONFIG.name}
        </h1>
        <p className="text-white/40 font-medium">
          Treinamento concluído para a vaga de <strong className="text-white">{config.vaga}</strong>
          .
        </p>
      </div>

      {isEvaluating && (
        <Card className="p-10 border-white/5 bg-white/[0.02] text-center space-y-3">
          <Loader2 className="w-6 h-6 text-emerald-500 animate-spin mx-auto" />
          <p className="text-sm text-white/60 font-medium">
            A IA está lendo as suas respostas e montando o diagnóstico...
          </p>
        </Card>
      )}

      {!isEvaluating && evaluationError && (
        <Card className="p-8 border-rose-500/20 bg-rose-500/5 space-y-4">
          <h3 className="font-bold text-rose-500 text-sm flex items-center gap-2 uppercase tracking-widest">
            <AlertCircle className="w-4 h-4" /> A análise não pôde ser gerada
          </h3>
          <p className="text-sm text-white/70 leading-relaxed">{evaluationError}</p>
          <p className="text-xs text-white/40">
            Nenhuma nota é exibida sem uma avaliação real das suas respostas.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button
              onClick={() => void runEvaluation(buildPairs())}
              className="rounded-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold px-6"
            >
              <RefreshCcw className="w-4 h-4 mr-2" /> Tentar novamente
            </Button>
            <Button
              variant="outline"
              onClick={() => setStep("interview")}
              className="rounded-full border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
            >
              <ChevronLeft className="w-4 h-4 mr-2" /> Voltar e revisar respostas
            </Button>
          </div>
        </Card>
      )}

      {!isEvaluating && evaluation && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="p-6 border-white/5 bg-white/[0.02] shadow-sm text-center space-y-2">
              <div className="text-3xl font-black text-white">{evaluation.score.toFixed(1)}</div>
              <div className="text-[10px] font-bold text-white/20 uppercase tracking-widest">
                Score Geral (0–10)
              </div>
            </Card>
            <Card className="p-6 border-white/5 bg-white/[0.02] shadow-sm text-center space-y-2">
              <div className="text-3xl font-black text-emerald-500">
                {evaluation.starAdherence}%
              </div>
              <div className="text-[10px] font-bold text-white/20 uppercase tracking-widest">
                Aderência STAR
              </div>
            </Card>
            <Card className="p-6 border-white/5 bg-white/[0.02] shadow-sm text-center space-y-2">
              <div className="text-3xl font-black text-white">
                {evaluation.answeredCount}/{evaluation.totalQuestions}
              </div>
              <div className="text-[10px] font-bold text-white/20 uppercase tracking-widest">
                Perguntas Respondidas
              </div>
            </Card>
          </div>

          {evaluation.summary && (
            <Card className="p-6 border-white/5 bg-white/[0.02] shadow-sm space-y-2">
              <h3 className="text-[10px] font-bold text-white/20 uppercase tracking-widest">
                Resumo da análise
              </h3>
              <p className="text-sm text-white/70 leading-relaxed">{evaluation.summary}</p>
            </Card>
          )}

          <div className="space-y-6">
            <h3 className="font-bold text-xl text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-white/40" /> Diagnóstico da IA
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="p-6 border-white/5 bg-white/[0.02] space-y-4 shadow-sm">
                <h4 className="font-bold text-emerald-500 text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> Pontos Fortes
                </h4>
                <ul className="space-y-3 text-sm text-white/60 font-medium">
                  {evaluation.strengths.length > 0 ? (
                    evaluation.strengths.map((item, i) => <li key={i}>• {item}</li>)
                  ) : (
                    <li className="text-white/30">
                      A análise não identificou pontos fortes nas respostas enviadas.
                    </li>
                  )}
                </ul>
              </Card>

              <Card className="p-6 border-white/5 bg-white/[0.02] space-y-4 shadow-sm">
                <h4 className="font-bold text-amber-500 text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> A Melhorar
                </h4>
                <ul className="space-y-3 text-sm text-white/60 font-medium">
                  {evaluation.improvements.length > 0 ? (
                    evaluation.improvements.map((item, i) => <li key={i}>• {item}</li>)
                  ) : (
                    <li className="text-white/30">
                      A análise não apontou pontos de melhoria nas respostas enviadas.
                    </li>
                  )}
                </ul>
              </Card>
            </div>
          </div>

          <Card className="p-8 border-white/5 shadow-sm bg-white/[0.02] space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-bold text-white">Respostas & Comentários</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowTranscript((prev) => !prev)}
                className="text-white/40 font-bold text-xs uppercase tracking-widest hover:text-white hover:bg-white/5"
              >
                {showTranscript ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5 mr-2" /> Ocultar transcrição
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5 mr-2" /> Ver transcrição completa
                  </>
                )}
              </Button>
            </div>

            <div className="space-y-4">
              {evaluation.perQuestion.map((item, i) => (
                <div key={i} className="rounded-2xl border border-white/5 bg-black p-5 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <p className="text-sm font-bold text-white leading-snug">
                      {i + 1}. {item.question}
                    </p>
                    <span className="shrink-0 text-xs font-mono font-bold text-emerald-500">
                      {item.score.toFixed(1)}/10
                    </span>
                  </div>

                  {showTranscript && (
                    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-white/20 mb-1">
                        Sua resposta
                      </p>
                      <p className="text-sm text-white/60 leading-relaxed italic">
                        {answers[i]?.trim() ? `“${answers[i].trim()}”` : "Não respondida."}
                      </p>
                    </div>
                  )}

                  <p className="text-sm text-white/50 leading-relaxed">{item.comment}</p>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      <div className="flex flex-col sm:flex-row gap-4 pt-4">
        <Button
          onClick={handleNewTraining}
          className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-black rounded-full h-14 font-bold text-lg shadow-xl shadow-emerald-500/10"
        >
          Novo Treinamento
        </Button>
        <Button
          variant="outline"
          onClick={handleDownloadReport}
          disabled={!evaluation}
          className="flex-1 rounded-full h-14 font-bold border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-30"
        >
          <Download className="w-4 h-4 mr-2" /> Baixar Relatório (.md)
        </Button>
      </div>
    </div>
  );
}
