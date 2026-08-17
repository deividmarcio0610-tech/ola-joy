import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Languages,
  MessageSquare,
  Presentation,
  Video,
  HelpCircle,
  RotateCcw,
  Save,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  component: ConfiguracoesPage,
});

/* -------------------------------------------------------------------------- */
/*  Preferências do app — helper reutilizável                                  */
/* -------------------------------------------------------------------------- */

/** Chave única das preferências no localStorage. */
export const PREFERENCES_STORAGE_KEY = "deividtech:preferencias";

/**
 * Evento disparado no `window` sempre que as preferências são salvas.
 * Telas já montadas podem ouvir para reagir sem recarregar a página:
 *
 *   window.addEventListener(PREFERENCES_EVENT, () => setPrefs(loadPreferences()));
 */
export const PREFERENCES_EVENT = "deividtech:preferencias-alteradas";

export const TRANSCRIPTION_LANGUAGES = [
  { value: "pt", label: "Português (Brasil)", locale: "pt-BR" },
  { value: "en", label: "Inglês", locale: "en-US" },
  { value: "es", label: "Espanhol", locale: "es-ES" },
] as const;

export type TranscriptionLanguage = (typeof TRANSCRIPTION_LANGUAGES)[number]["value"];

export const RESPONSE_MODES = [
  "Curta",
  "Profissional",
  "Técnica",
  "Executiva",
  "Didática",
  "Persuasiva",
] as const;

export type ResponseMode = (typeof RESPONSE_MODES)[number];

export const MEETING_THEMES = [
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
] as const;

export type MeetingTheme = (typeof MEETING_THEMES)[number];

export interface AppPreferences {
  /** Idioma enviado ao serviço de transcrição (STT). */
  transcriptionLanguage: TranscriptionLanguage;
  /** Estilo padrão das respostas geradas pelo copiloto. */
  responseMode: ResponseMode;
  /** Tema pré-selecionado ao abrir o copiloto. */
  meetingTheme: MeetingTheme;
  /** Exibir o vídeo capturado durante a sessão. */
  showVideo: boolean;
  /** Detectar perguntas na transcrição e sugerir resposta automaticamente. */
  autoDetectQuestions: boolean;
}

export const DEFAULT_PREFERENCES: AppPreferences = {
  transcriptionLanguage: "pt",
  responseMode: "Profissional",
  meetingTheme: "REUNIÃO",
  showVideo: true,
  autoDetectQuestions: true,
};

function isOneOf<T extends readonly string[]>(list: T, value: unknown): value is T[number] {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}

/**
 * Lê as preferências salvas. Seguro para SSR: fora do browser devolve o padrão.
 * Valores desconhecidos ou corrompidos caem no padrão campo a campo.
 */
export function loadPreferences(): AppPreferences {
  if (typeof window === "undefined") return { ...DEFAULT_PREFERENCES };

  try {
    const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };

    const parsed = JSON.parse(raw) as Partial<AppPreferences>;
    const languages = TRANSCRIPTION_LANGUAGES.map((item) => item.value);

    return {
      transcriptionLanguage: isOneOf(languages, parsed.transcriptionLanguage)
        ? parsed.transcriptionLanguage
        : DEFAULT_PREFERENCES.transcriptionLanguage,
      responseMode: isOneOf(RESPONSE_MODES, parsed.responseMode)
        ? parsed.responseMode
        : DEFAULT_PREFERENCES.responseMode,
      meetingTheme: isOneOf(MEETING_THEMES, parsed.meetingTheme)
        ? parsed.meetingTheme
        : DEFAULT_PREFERENCES.meetingTheme,
      showVideo:
        typeof parsed.showVideo === "boolean" ? parsed.showVideo : DEFAULT_PREFERENCES.showVideo,
      autoDetectQuestions:
        typeof parsed.autoDetectQuestions === "boolean"
          ? parsed.autoDetectQuestions
          : DEFAULT_PREFERENCES.autoDetectQuestions,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

/** Grava as preferências e avisa o resto do app via `PREFERENCES_EVENT`. */
export function savePreferences(p: AppPreferences): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(p));
    window.dispatchEvent(new CustomEvent<AppPreferences>(PREFERENCES_EVENT, { detail: p }));
  } catch {
    // Armazenamento indisponível (modo privado / cota cheia).
  }
}

/** Locale completo (ex.: "pt-BR") do idioma escolhido — usado pelo STT. */
export function getTranscriptionLocale(p: AppPreferences): string {
  return (
    TRANSCRIPTION_LANGUAGES.find((item) => item.value === p.transcriptionLanguage)?.locale ??
    "pt-BR"
  );
}

/* -------------------------------------------------------------------------- */
/*  Tela                                                                       */
/* -------------------------------------------------------------------------- */

interface FieldProps {
  icon: typeof Languages;
  title: string;
  description: string;
  children: ReactNode;
}

function Field({ icon: Icon, title, description, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-4 border-b border-white/5 py-6 last:border-none last:pb-0 md:flex-row md:items-center md:justify-between">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-white/40">
          <Icon className="h-4 w-4" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-bold text-white">{title}</p>
          <p className="max-w-md text-[11px] leading-relaxed text-white/40">{description}</p>
        </div>
      </div>
      <div className="shrink-0 md:w-64">{children}</div>
    </div>
  );
}

const selectClasses =
  "w-full cursor-pointer appearance-none rounded-xl border border-white/5 bg-black/40 px-4 py-2.5 text-[13px] font-medium text-white outline-none transition-colors hover:border-white/10 focus:border-emerald-500/40";

interface ToggleProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}

function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/5 bg-black/40 px-4 py-2.5 transition-colors hover:border-white/10"
    >
      <span className={cn("text-[13px] font-bold", checked ? "text-emerald-500" : "text-white/40")}>
        {checked ? "Ativado" : "Desativado"}
      </span>
      <span
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          checked ? "bg-emerald-500" : "bg-white/10",
        )}
      >
        <span
          className={cn(
            "absolute top-[2px] h-4 w-4 rounded-full bg-white transition-transform",
            checked ? "translate-x-[18px]" : "translate-x-[2px]",
          )}
        />
      </span>
    </button>
  );
}

function ConfiguracoesPage() {
  const [preferences, setPreferences] = useState<AppPreferences>(DEFAULT_PREFERENCES);
  const [savedSnapshot, setSavedSnapshot] = useState<AppPreferences>(DEFAULT_PREFERENCES);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const stored = loadPreferences();
    setPreferences(stored);
    setSavedSnapshot(stored);
    setIsReady(true);
  }, []);

  const isDirty = useMemo(
    () => JSON.stringify(preferences) !== JSON.stringify(savedSnapshot),
    [preferences, savedSnapshot],
  );

  const update = <K extends keyof AppPreferences>(key: K, value: AppPreferences[K]) => {
    setPreferences((current) => ({ ...current, [key]: value }));
  };

  const handleSave = () => {
    savePreferences(preferences);
    setSavedSnapshot(preferences);
    toast.success("Preferências salvas.", {
      description: "As telas do app já usam a nova configuração.",
    });
  };

  const handleRestoreDefaults = () => {
    setPreferences(DEFAULT_PREFERENCES);
    setSavedSnapshot(DEFAULT_PREFERENCES);
    savePreferences(DEFAULT_PREFERENCES);
    toast.success("Padrões restaurados.", {
      description: "Voltamos à configuração original do DEIVIDTECH AI.",
    });
  };

  const handleDiscard = () => {
    setPreferences(savedSnapshot);
    toast.info("Alterações descartadas.");
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-white">Configurações</h1>
          <p className="text-sm text-white/40">
            Preferências de transcrição, copiloto e captura. Ficam salvas neste navegador e valem
            para todas as telas.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isDirty && (
            <button
              type="button"
              onClick={handleDiscard}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-white/10 px-5 text-[11px] font-bold text-white/40 transition-colors hover:text-white"
            >
              Descartar
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={!isReady || !isDirty}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-6 text-[11px] font-bold text-black transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-30"
          >
            {isDirty ? <Save className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
            {isDirty ? "SALVAR PREFERÊNCIAS" : "TUDO SALVO"}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-6 py-2">
        <Field
          icon={Languages}
          title="Idioma da transcrição"
          description="Idioma enviado ao serviço de STT durante a captura de áudio das reuniões."
        >
          <select
            value={preferences.transcriptionLanguage}
            onChange={(event) =>
              update("transcriptionLanguage", event.target.value as TranscriptionLanguage)
            }
            className={selectClasses}
            aria-label="Idioma da transcrição"
          >
            {TRANSCRIPTION_LANGUAGES.map((language) => (
              <option
                key={language.value}
                value={language.value}
                className="bg-[#0A0A0A] text-white"
              >
                {language.label} ({language.locale})
              </option>
            ))}
          </select>
        </Field>

        <Field
          icon={MessageSquare}
          title="Modo de resposta padrão"
          description="Estilo usado pelo copiloto ao redigir a fala sugerida quando você não muda o modo na sessão."
        >
          <select
            value={preferences.responseMode}
            onChange={(event) => update("responseMode", event.target.value as ResponseMode)}
            className={selectClasses}
            aria-label="Modo de resposta padrão"
          >
            {RESPONSE_MODES.map((mode) => (
              <option key={mode} value={mode} className="bg-[#0A0A0A] text-white">
                {mode}
              </option>
            ))}
          </select>
        </Field>

        <Field
          icon={Presentation}
          title="Tema padrão de reunião"
          description="Contexto pré-selecionado ao abrir o Copilot ao Vivo, usado para calibrar o vocabulário da IA."
        >
          <select
            value={preferences.meetingTheme}
            onChange={(event) => update("meetingTheme", event.target.value as MeetingTheme)}
            className={selectClasses}
            aria-label="Tema padrão de reunião"
          >
            {MEETING_THEMES.map((theme) => (
              <option key={theme} value={theme} className="bg-[#0A0A0A] text-white">
                {theme}
              </option>
            ))}
          </select>
        </Field>

        <Field
          icon={Video}
          title="Mostrar vídeo na captura"
          description="Exibe a prévia da tela ou câmera compartilhada enquanto a sessão está ativa. Desligue para economizar recursos."
        >
          <Toggle
            checked={preferences.showVideo}
            onChange={(value) => update("showVideo", value)}
            label="Mostrar vídeo na captura"
          />
        </Field>

        <Field
          icon={HelpCircle}
          title="Detectar perguntas automaticamente"
          description="Identifica perguntas na transcrição e pede uma resposta ao copiloto sem você precisar acionar nada."
        >
          <Toggle
            checked={preferences.autoDetectQuestions}
            onChange={(value) => update("autoDetectQuestions", value)}
            label="Detectar perguntas automaticamente"
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/5 bg-white/[0.02] p-6">
        <div className="space-y-1">
          <p className="text-sm font-bold text-white">Restaurar padrões</p>
          <p className="text-[11px] text-white/40">
            Volta idioma, modo de resposta, tema e toggles à configuração original e salva
            imediatamente.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRestoreDefaults}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-white/10 px-6 text-[11px] font-bold text-white/60 transition-colors hover:border-white/20 hover:text-white"
        >
          <RotateCcw className="h-3.5 w-3.5" /> RESTAURAR PADRÕES
        </button>
      </div>

      <p className="text-[11px] text-white/20">
        Configuração ativa: {getTranscriptionLocale(savedSnapshot)} · modo{" "}
        {savedSnapshot.responseMode} · tema {savedSnapshot.meetingTheme} · vídeo{" "}
        {savedSnapshot.showVideo ? "ligado" : "desligado"} · detecção de perguntas{" "}
        {savedSnapshot.autoDetectQuestions ? "ligada" : "desligada"}
      </p>
    </div>
  );
}
