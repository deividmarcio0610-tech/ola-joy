import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  Globe,
  HeartPulse,
  Lock,
  Mic,
  Monitor,
  RefreshCw,
  Server,
  XCircle,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { APP_CONFIG } from "@/lib/app-config";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/diagnostico")({
  component: DiagnosticoPage,
});

type IconComponent = typeof Activity;

type CheckLevel = "ok" | "warn" | "error";

type CheckResult = {
  /** Situação apurada, exibida como está (ONLINE, SEM SESSÃO, BLOQUEADO...). */
  status: string;
  level: CheckLevel;
  /** Explicação do que foi realmente verificado. */
  detail: string;
  /** Latência medida de verdade; `null` quando a verificação não envolve rede. */
  latencyMs: number | null;
};

type ServiceCard = CheckResult & {
  key: string;
  label: string;
  icon: IconComponent;
};

type CheckOutcome = {
  result: CheckResult;
  /** Serviços reportados pelo próprio endpoint verificado. */
  services?: ServiceCard[];
};

type DiagnosticCheck = {
  id: string;
  label: string;
  icon: IconComponent;
  run: () => Promise<CheckOutcome>;
};

/** Formato tolerante: o endpoint pode evoluir sem quebrar esta tela. */
type HealthServicePayload = {
  label?: unknown;
  status?: unknown;
  ok?: unknown;
  level?: unknown;
  detail?: unknown;
  latencyMs?: unknown;
};

type HealthPayload = {
  status?: unknown;
  timestamp?: unknown;
  durationMs?: unknown;
  services?: Record<string, HealthServicePayload>;
};

const LEVEL_STYLES: Record<CheckLevel, { icon: IconComponent; text: string; tile: string }> = {
  ok: { icon: CheckCircle2, text: "text-emerald-500", tile: "bg-emerald-500/10 text-emerald-500" },
  warn: { icon: AlertTriangle, text: "text-amber-500", tile: "bg-amber-500/10 text-amber-500" },
  error: { icon: XCircle, text: "text-rose-500", tile: "bg-rose-500/10 text-rose-500" },
};

function isCheckLevel(value: unknown): value is CheckLevel {
  return value === "ok" || value === "warn" || value === "error";
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  return String(error);
}

function serviceIcon(key: string): IconComponent {
  if (key === "database") return Database;
  if (key === "ia" || key === "stt") return Zap;
  return Globe;
}

async function checkBackend(): Promise<CheckOutcome> {
  const startedAt = performance.now();
  const { error, count } = await supabase
    .from("professional_memories")
    .select("id", { count: "exact", head: true });
  const latencyMs = Math.round(performance.now() - startedAt);

  if (error) {
    return {
      result: {
        status: "ERRO",
        level: "error",
        detail: `A consulta ao Supabase falhou: ${error.message}`,
        latencyMs,
      },
    };
  }

  // Sem sessão a consulta responde sem erro, mas o RLS não devolve linha alguma:
  // a conexão está de pé, e isso precisa ficar explícito.
  const { data } = await supabase.auth.getSession();

  return {
    result: {
      status: "ONLINE",
      level: "ok",
      detail: data.session
        ? `Consulta respondida sem erro — ${count ?? 0} memória(s) visível(is) para a sua conta.`
        : "Consulta respondida sem erro, mas sem sessão ativa o RLS não devolve linhas.",
      latencyMs,
    },
  };
}

async function checkSession(): Promise<CheckOutcome> {
  const startedAt = performance.now();
  const { data, error } = await supabase.auth.getSession();
  const latencyMs = Math.round(performance.now() - startedAt);

  if (error) {
    return {
      result: {
        status: "ERRO",
        level: "error",
        detail: `Não foi possível ler a sessão: ${error.message}`,
        latencyMs,
      },
    };
  }

  const session = data.session;
  if (!session) {
    return {
      result: {
        status: "SEM SESSÃO",
        level: "error",
        detail: "Nenhuma sessão do Supabase encontrada neste navegador.",
        latencyMs,
      },
    };
  }

  const expiresAt = session.expires_at
    ? new Date(session.expires_at * 1000).toLocaleString("pt-BR")
    : null;

  return {
    result: {
      status: "AUTENTICADO",
      level: "ok",
      detail: [
        `Sessão de ${session.user.email ?? session.user.id}`,
        expiresAt ? `expira em ${expiresAt}` : null,
      ]
        .filter(Boolean)
        .join(" — "),
      latencyMs,
    },
  };
}

async function checkMicrophone(): Promise<CheckOutcome> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return {
      result: {
        status: "INDISPONÍVEL",
        level: "error",
        detail: "Este navegador não expõe navigator.mediaDevices.getUserMedia.",
        latencyMs: null,
      },
    };
  }

  const startedAt = performance.now();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const latencyMs = Math.round(performance.now() - startedAt);
    const deviceLabel = stream.getAudioTracks()[0]?.label;
    stream.getTracks().forEach((track) => track.stop());

    return {
      result: {
        status: "ONLINE",
        level: "ok",
        detail: deviceLabel
          ? `Permissão concedida — dispositivo: ${deviceLabel}.`
          : "Permissão concedida e captura encerrada em seguida.",
        latencyMs,
      },
    };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    const detail =
      name === "NotAllowedError"
        ? "Permissão de microfone negada no navegador."
        : name === "NotFoundError"
          ? "Nenhum microfone foi encontrado neste dispositivo."
          : `Falha ao acessar o microfone: ${describeError(error)}`;

    return {
      result: {
        status: name === "NotAllowedError" ? "BLOQUEADO" : "ERRO",
        level: "error",
        detail,
        latencyMs: null,
      },
    };
  }
}

async function checkScreenCapture(): Promise<CheckOutcome> {
  // Apenas checagem de suporte: pedir a permissão aqui abriria um seletor de janela.
  const supported =
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getDisplayMedia === "function";

  return {
    result: {
      status: supported ? "DISPONÍVEL" : "INDISPONÍVEL",
      level: supported ? "ok" : "error",
      detail: supported
        ? "API getDisplayMedia disponível — a permissão é solicitada só ao iniciar a captura."
        : "Este navegador não suporta captura de tela (getDisplayMedia).",
      latencyMs: null,
    },
  };
}

async function checkHealthEndpoint(): Promise<CheckOutcome> {
  const startedAt = performance.now();
  let response: Response;

  try {
    response = await fetch("/api/public/health", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
  } catch (error) {
    return {
      result: {
        status: "INDISPONÍVEL",
        level: "error",
        detail: `Não foi possível alcançar /api/public/health: ${describeError(error)}`,
        latencyMs: Math.round(performance.now() - startedAt),
      },
    };
  }

  const latencyMs = Math.round(performance.now() - startedAt);

  let payload: HealthPayload | null = null;
  try {
    payload = (await response.json()) as HealthPayload;
  } catch {
    payload = null;
  }

  if (!payload || typeof payload !== "object") {
    return {
      result: {
        status: `HTTP ${response.status}`,
        level: "error",
        detail: "O endpoint respondeu, mas o corpo não é um JSON válido.",
        latencyMs,
      },
    };
  }

  const services: ServiceCard[] = Object.entries(payload.services ?? {}).map(([key, raw]) => {
    const level: CheckLevel = isCheckLevel(raw?.level)
      ? raw.level
      : raw?.ok === true
        ? "ok"
        : "error";

    return {
      key,
      label: typeof raw?.label === "string" ? raw.label : key,
      icon: serviceIcon(key),
      status: typeof raw?.status === "string" ? raw.status : "DESCONHECIDO",
      level,
      detail:
        typeof raw?.detail === "string" ? raw.detail : "Sem detalhes informados pelo servidor.",
      latencyMs: typeof raw?.latencyMs === "number" ? raw.latencyMs : null,
    };
  });

  const declaredStatus = typeof payload.status === "string" ? payload.status : "DESCONHECIDO";

  return {
    result: {
      status: response.ok ? "ONLINE" : `HTTP ${response.status}`,
      level: response.ok ? "ok" : "error",
      detail: `Resposta em ${latencyMs}ms — situação declarada pelo servidor: ${declaredStatus}.`,
      latencyMs,
    },
    services,
  };
}

const CHECKS: DiagnosticCheck[] = [
  { id: "backend", label: "Conexão com o Backend", icon: Server, run: checkBackend },
  { id: "auth", label: "Sessão / Autenticação", icon: Lock, run: checkSession },
  { id: "mic", label: "Microfone / Áudio", icon: Mic, run: checkMicrophone },
  { id: "capture", label: "Captura de Tela", icon: Monitor, run: checkScreenCapture },
  { id: "health", label: "Endpoint de Saúde", icon: HeartPulse, run: checkHealthEndpoint },
];

function StatusBadge({ level, status }: { level: CheckLevel; status: string }) {
  const style = LEVEL_STYLES[level];
  const Icon = style.icon;

  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      <span className={cn("text-xs font-bold", style.text)}>{status}</span>
      <Icon className={cn("w-5 h-5", style.text)} />
    </div>
  );
}

function ResultCard({
  icon: Icon,
  label,
  result,
}: {
  icon: IconComponent;
  label: string;
  result?: CheckResult;
}) {
  return (
    <Card className="p-6 border-white/5 bg-white/[0.02] shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4 min-w-0">
          <div
            className={cn(
              "w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all",
              result ? LEVEL_STYLES[result.level].tile : "bg-white/5 text-white/10",
            )}
          >
            <Icon className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-white">{label}</h3>
            {result ? (
              <>
                {result.latencyMs !== null && (
                  <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest">
                    {result.latencyMs}ms de latência
                  </p>
                )}
                <p className="mt-2 text-xs text-white/40 leading-relaxed">{result.detail}</p>
              </>
            ) : (
              <p className="mt-2 text-xs text-white/20">Aguardando execução.</p>
            )}
          </div>
        </div>

        {result && <StatusBadge level={result.level} status={result.status} />}
      </div>
    </Card>
  );
}

function DiagnosticoPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<Record<string, CheckResult>>({});
  const [services, setServices] = useState<ServiceCard[]>([]);
  const [progress, setProgress] = useState(0);
  const [finishedAt, setFinishedAt] = useState<Date | null>(null);

  const runDiagnostics = async () => {
    setIsRunning(true);
    setResults({});
    setServices([]);
    setProgress(0);
    setFinishedAt(null);

    const collectedServices: ServiceCard[] = [];

    for (let i = 0; i < CHECKS.length; i++) {
      const check = CHECKS[i];
      let outcome: CheckOutcome;

      try {
        outcome = await check.run();
      } catch (error) {
        outcome = {
          result: {
            status: "ERRO",
            level: "error",
            detail: `A verificação lançou uma exceção: ${describeError(error)}`,
            latencyMs: null,
          },
        };
      }

      setResults((prev) => ({ ...prev, [check.id]: outcome.result }));

      if (outcome.services?.length) {
        collectedServices.push(...outcome.services);
        setServices([...collectedServices]);
      }

      setProgress(((i + 1) / CHECKS.length) * 100);
    }

    setIsRunning(false);
    setFinishedAt(new Date());
  };

  const executed = CHECKS.filter((check) => results[check.id]).map((check) => ({
    key: check.id,
    label: check.label,
    ...results[check.id],
  }));
  const everything = [...executed, ...services];
  const failures = everything.filter((item) => item.level !== "ok");
  const isComplete = !isRunning && finishedAt !== null;
  const allPassed = isComplete && everything.length > 0 && failures.length === 0;

  return (
    <div className="min-h-screen bg-black p-8 space-y-8 max-w-4xl mx-auto animate-in fade-in duration-700 text-white">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            Diagnóstico do Sistema
          </h1>
          <p className="text-white/40 font-medium">
            Verificações reais de infraestrutura do {APP_CONFIG.name}
          </p>
          {finishedAt && (
            <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-white/20">
              Última execução: {finishedAt.toLocaleString("pt-BR")}
            </p>
          )}
        </div>
        <Button
          onClick={runDiagnostics}
          disabled={isRunning}
          className="bg-white hover:bg-white/90 text-black rounded-full px-8 gap-2 font-bold shadow-xl shadow-white/10"
        >
          {isRunning ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Activity className="w-4 h-4" />
          )}
          {isRunning ? "EXECUTANDO..." : "EXECUTAR TESTES"}
        </Button>
      </div>

      {isRunning && (
        <div className="space-y-2">
          <Progress value={progress} className="h-2 bg-white/5" />
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest text-center">
            Verificando infraestrutura...
          </p>
        </div>
      )}

      {!isRunning && finishedAt === null && (
        <Card className="p-6 border-white/5 bg-white/[0.02] text-sm text-white/40">
          Nenhuma verificação executada ainda. O teste de microfone pede permissão ao navegador.
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {CHECKS.map((check) => (
          <ResultCard
            key={check.id}
            icon={check.icon}
            label={check.label}
            result={results[check.id]}
          />
        ))}
      </div>

      {services.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/20">
            Serviços reportados pelo endpoint de saúde
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {services.map((service) => (
              <ResultCard
                key={service.key}
                icon={service.icon}
                label={service.label}
                result={service}
              />
            ))}
          </div>
        </div>
      )}

      {isComplete && (
        <Card className="p-8 border-white/5 bg-white/[0.02] text-center space-y-4">
          <div
            className={cn(
              "w-16 h-16 rounded-full flex items-center justify-center mx-auto shadow-inner",
              allPassed ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500",
            )}
          >
            {allPassed ? <CheckCircle2 className="w-8 h-8" /> : <XCircle className="w-8 h-8" />}
          </div>

          {allPassed ? (
            <>
              <div>
                <h2 className="text-xl font-bold text-white">SISTEMA OPERACIONAL</h2>
                <p className="text-sm text-white/40 font-medium">
                  As {everything.length} verificações passaram. O Copiloto do {APP_CONFIG.name} está
                  pronto para uso.
                </p>
              </div>
              <Button
                asChild
                className="bg-white hover:bg-white/90 text-black rounded-full px-10 font-bold"
              >
                <Link to="/copiloto">INICIAR AGORA</Link>
              </Button>
            </>
          ) : (
            <>
              <div className="space-y-3">
                <h2 className="text-xl font-bold text-white">FALHAS DETECTADAS</h2>
                <p className="text-sm text-white/40 font-medium">
                  {failures.length} de {everything.length} verificações não passaram.
                </p>
                <ul className="text-left text-xs text-white/40 space-y-2 max-w-md mx-auto">
                  {failures.map((failure) => (
                    <li key={failure.key} className="flex gap-2">
                      <span
                        className={cn("font-bold flex-shrink-0", LEVEL_STYLES[failure.level].text)}
                      >
                        {failure.label}:
                      </span>
                      <span>{failure.detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <Button
                onClick={runDiagnostics}
                disabled={isRunning}
                className="bg-white hover:bg-white/90 text-black rounded-full px-10 font-bold"
              >
                EXECUTAR NOVAMENTE
              </Button>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
