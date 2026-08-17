import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { vpsAI, type VpsHealth } from "@/lib/vps-ai/api";
import { vpsAuthFetch } from "@/lib/vps-ai/hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2, PlayCircle, XCircle, AlertCircle } from "lucide-react";

type CheckStatus = "pending" | "running" | "ok" | "fail" | "warn";

type CheckResult = {
  id: string;
  label: string;
  description: string;
  status: CheckStatus;
  durationMs?: number;
  detail?: string;
  error?: string;
};

const INITIAL: CheckResult[] = [
  {
    id: "session",
    label: "Sessão Supabase",
    description: "Token de autenticação disponível no browser.",
    status: "pending",
  },
  {
    id: "proxy",
    label: "Proxy /api/vps/status",
    description: "Rota same-origin do Worker responde e faz proxy pra VPS.",
    status: "pending",
  },
  {
    id: "vps",
    label: "API VPS online",
    description: "Health check reporta online:true.",
    status: "pending",
  },
  {
    id: "ollama",
    label: "Ollama (LLM)",
    description: "Servidor Ollama respondendo com modelo carregado.",
    status: "pending",
  },
  {
    id: "imagegen",
    label: "Gerador de imagens",
    description: "Serviço de geração (ComfyUI/Gerador) online.",
    status: "pending",
  },
  {
    id: "models",
    label: "Lista de modelos",
    description: "GET /api/vps/modelos retorna ao menos 1 modelo.",
    status: "pending",
  },
  {
    id: "analyze",
    label: "Inferência de texto (ping)",
    description: "POST /api/vps/analisar (modo texto) responde em <30s.",
    status: "pending",
  },
];

function StatusIcon({ status }: { status: CheckStatus }) {
  if (status === "running")
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  if (status === "ok") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === "fail") return <XCircle className="h-4 w-4 text-destructive" />;
  if (status === "warn") return <AlertCircle className="h-4 w-4 text-amber-500" />;
  return <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/40" />;
}

export function VpsDiagnosticsPanel() {
  const [checks, setChecks] = useState<CheckResult[]>(INITIAL);
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState<Date | null>(null);

  function update(id: string, patch: Partial<CheckResult>) {
    setChecks((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  async function timed<T>(
    id: string,
    fn: () => Promise<T>,
  ): Promise<{ ok: true; value: T; ms: number } | { ok: false; error: string; ms: number }> {
    update(id, { status: "running", error: undefined, detail: undefined, durationMs: undefined });
    const t0 = performance.now();
    try {
      const value = await fn();
      return { ok: true, value, ms: Math.round(performance.now() - t0) };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        ms: Math.round(performance.now() - t0),
      };
    }
  }

  async function runAll() {
    setRunning(true);
    setStartedAt(new Date());
    setChecks(INITIAL.map((c) => ({ ...c })));

    // 1. Sessão
    const sess = await timed("session", async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) throw new Error("Nenhuma sessão ativa. Faça login.");
      return data.session;
    });
    if (!sess.ok) {
      update("session", { status: "fail", error: sess.error, durationMs: sess.ms });
      ["proxy", "vps", "ollama", "imagegen", "models", "analyze"].forEach((id) =>
        update(id, { status: "warn", detail: "Ignorado: sem sessão." }),
      );
      setRunning(false);
      return;
    }
    update("session", {
      status: "ok",
      durationMs: sess.ms,
      detail: `user: ${sess.value.user.email ?? sess.value.user.id}`,
    });

    // 2. Proxy + 3/4/5. Health
    const health = await timed("proxy", () => vpsAI.getHealth());
    if (!health.ok) {
      update("proxy", { status: "fail", error: health.error, durationMs: health.ms });
      ["vps", "ollama", "imagegen"].forEach((id) =>
        update(id, { status: "warn", detail: "Ignorado: proxy falhou." }),
      );
    } else {
      const h = health.value as VpsHealth;
      update("proxy", { status: "ok", durationMs: health.ms });
      update("vps", {
        status: h.online ? "ok" : "fail",
        detail: h.online ? "online:true" : "online:false",
        error: h.online ? undefined : "VPS reportou offline",
        durationMs: h.tempoResposta,
      });
      update("ollama", {
        status: h.ollama?.online ? "ok" : "fail",
        detail: h.ollama?.model ? `modelo: ${h.ollama.model}` : undefined,
        error: h.ollama?.online ? undefined : "Ollama offline ou sem modelo",
      });
      update("imagegen", {
        status: h.imageGenerator?.online ? "ok" : "warn",
        detail: h.imageGenerator?.mode ? `modo: ${h.imageGenerator.mode}` : undefined,
        error: h.imageGenerator?.online ? undefined : "Gerador de imagens offline",
      });
    }

    // 6. Modelos
    const models = await timed("models", () => vpsAuthFetch(() => vpsAI.listModels()));
    if (!models.ok) {
      update("models", { status: "fail", error: models.error, durationMs: models.ms });
    } else {
      const list = models.value.models ?? [];
      update("models", {
        status: list.length > 0 ? "ok" : "warn",
        durationMs: models.ms,
        detail: list.length
          ? `${list.length} modelo(s): ${list.slice(0, 3).join(", ")}${list.length > 3 ? "…" : ""}`
          : "Nenhum modelo retornado",
        error: list.length ? undefined : "Lista vazia",
      });
    }

    // 7. Ping de análise (texto curto)
    const ping = await timed("analyze", () =>
      vpsAuthFetch(() =>
        vpsAI.analyzeText({
          prompt: "ping de diagnóstico — responda apenas OK.",
          context: { diagnostics: true },
        }),
      ),
    );
    if (!ping.ok) {
      update("analyze", { status: "fail", error: ping.error, durationMs: ping.ms });
    } else {
      update("analyze", {
        status: "ok",
        durationMs: ping.ms,
        detail: ping.value?.justificativa
          ? String(ping.value.justificativa).slice(0, 120)
          : "resposta recebida",
      });
    }

    setRunning(false);
  }

  const okCount = checks.filter((c) => c.status === "ok").length;
  const failCount = checks.filter((c) => c.status === "fail").length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Diagnóstico completo</CardTitle>
          {startedAt && (
            <p className="text-xs text-muted-foreground mt-1">
              Última execução: {startedAt.toLocaleTimeString()} — {okCount} ok, {failCount} falha(s)
            </p>
          )}
        </div>
        <Button onClick={runAll} disabled={running} size="sm" className="gap-2">
          {running ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <PlayCircle className="h-4 w-4" />
          )}
          {running ? "Executando…" : "Executar diagnóstico"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {checks.map((c) => (
          <div key={c.id} className="border rounded-md p-3">
            <div className="flex items-start gap-3">
              <div className="pt-0.5">
                <StatusIcon status={c.status} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm">{c.label}</span>
                  <div className="flex items-center gap-2">
                    {c.durationMs != null && (
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {c.durationMs} ms
                      </span>
                    )}
                    <Badge
                      variant={
                        c.status === "ok"
                          ? "default"
                          : c.status === "fail"
                            ? "destructive"
                            : "secondary"
                      }
                      className="text-[10px] uppercase"
                    >
                      {c.status}
                    </Badge>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>
                {c.detail && (
                  <p className="text-xs mt-1 text-foreground/80 break-words">{c.detail}</p>
                )}
                {c.error && (
                  <pre className="text-xs mt-1 text-destructive whitespace-pre-wrap break-words bg-destructive/5 border border-destructive/20 rounded p-2">
                    {c.error}
                  </pre>
                )}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
