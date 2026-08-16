import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Bot, Copy, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useAnalyzer } from "@/components/analyzerContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { adminFetch, getAdminToken, setAdminToken } from "@/lib/adminSession";
import { screenRecordingManager } from "@/lib/recording/screenRecordingManager";
import type { ErrorEventRecord } from "@/server/errorRepository";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/erros")({
  component: ErrorCenterPage,
  head: () => ({ meta: [{ title: "Erros / Diagnóstico — Analisador T4" }] }),
});

const FILTERS: Array<{ key: string; label: string; params: Record<string, string> }> = [
  { key: "todos", label: "TODOS", params: {} },
  { key: "criticos", label: "CRÍTICOS", params: { severity: "CRITICAL" } },
  { key: "t4", label: "T4", params: { source: "T4" } },
  { key: "captura", label: "CAPTURA", params: { source: "CAPTURA" } },
  { key: "ollama", label: "OLLAMA", params: { source: "OLLAMA" } },
  { key: "gravacao", label: "GRAVAÇÃO", params: { source: "GRAVACAO" } },
  { key: "api", label: "API", params: { source: "API" } },
  { key: "db", label: "DB", params: { source: "DB" } },
];

interface Summary {
  today: number;
  critical: number;
  warnings: number;
  resolved: number;
  open: number;
}

function ErrorCenterPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [errors, setErrors] = useState<ErrorEventRecord[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [filter, setFilter] = useState("todos");
  const [expanded, setExpanded] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    const params = new URLSearchParams(FILTERS.find((f) => f.key === filter)?.params ?? {});
    const response = await adminFetch(`/api/errors/list?${params.toString()}`);
    if (response.status === 401) {
      setAuthorized(false);
      return;
    }
    const payload = (await response.json()) as { errors: ErrorEventRecord[]; summary: Summary };
    setErrors(payload.errors ?? []);
    setSummary(payload.summary ?? null);
    setAuthorized(true);
  }, [filter]);

  useEffect(() => {
    void load().catch(() => setAuthorized(true));
    const timer = setInterval(() => void load().catch(() => undefined), 10_000);
    return () => clearInterval(timer);
  }, [load]);

  const resolve = async (id: string, resolved: boolean) => {
    await adminFetch("/api/errors/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, resolved }),
    });
    await load();
  };

  const clearResolved = async () => {
    await adminFetch("/api/errors/clear-resolved", { method: "POST" });
    toast.success("Erros resolvidos removidos.");
    await load();
  };

  const copyError = (error: ErrorEventRecord) => {
    void navigator.clipboard.writeText(JSON.stringify(error, null, 2));
    toast.success("Erro copiado.");
  };

  const sendToClaude = (error: ErrorEventRecord) => {
    // Handoff em memória de sessão APENAS do texto do erro (já sanitizado no
    // backend) — nunca tokens/segredos.
    window.sessionStorage.setItem(
      "claude.prefill",
      [
        "Investigue este erro registrado na Central de Erros e localize a CAUSA RAIZ antes de propor qualquer patch.",
        `id: ${error.id}`,
        `source: ${error.source} · severity: ${error.severity} · occurrences: ${error.occurrences}`,
        `route: ${error.route ?? "—"} · sessionId: ${error.sessionId ?? "—"} · signalId: ${error.signalId ?? "—"}`,
        `message: ${error.message}`,
        error.stack ? `stack:\n${error.stack}` : "",
        error.context ? `context:\n${error.context}` : "",
        "Depois: proponha o patch, mostre o diff e rode os testes.",
      ]
        .filter(Boolean)
        .join("\n"),
    );
    void navigate({ to: "/claude" });
  };

  if (authorized === false) {
    return (
      <Card className="mx-auto mt-10 flex max-w-md flex-col gap-3 p-4">
        <p className="nexus-eyebrow">ERROS / DIAGNÓSTICO — ÁREA ADMIN</p>
        <p className="text-xs text-muted-foreground">
          Informe o token de admin (ADMIN_TOKEN do .env da VPS). Ele fica somente em memória.
        </p>
        <Input
          type="password"
          value={tokenInput}
          placeholder="token de admin"
          onChange={(event) => setTokenInput(event.target.value)}
        />
        <Button
          onClick={() => {
            setAdminToken(tokenInput);
            setAuthorized(null);
            void load().catch(() => undefined);
          }}
        >
          Entrar
        </Button>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Erros / Diagnóstico</h1>
          <p className="text-xs text-muted-foreground">
            Central de erros com sanitização de segredos + Health Center com estado real.
          </p>
        </div>
        <Button size="sm" variant="outline" className="ml-auto" onClick={() => void load()}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Atualizar
        </Button>
      </header>

      <HealthCenter />

      {summary && (
        <div className="grid gap-2 text-center sm:grid-cols-5">
          <Metric label="HOJE" value={summary.today} />
          <Metric
            label="CRÍTICOS"
            value={summary.critical}
            tone={summary.critical ? "bear" : undefined}
          />
          <Metric
            label="WARNINGS"
            value={summary.warnings}
            tone={summary.warnings ? "warn" : undefined}
          />
          <Metric label="ABERTOS" value={summary.open} />
          <Metric label="RESOLVIDOS" value={summary.resolved} tone="bull" />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map((item) => (
          <Button
            key={item.key}
            size="sm"
            variant={filter === item.key ? "default" : "outline"}
            className="font-mono text-[10px]"
            onClick={() => setFilter(item.key)}
          >
            {item.label}
          </Button>
        ))}
        <Button
          size="sm"
          variant="outline"
          className="ml-auto text-[10px]"
          onClick={() => void clearResolved()}
        >
          <Trash2 className="mr-1 h-3 w-3" />
          LIMPAR RESOLVIDOS
        </Button>
      </div>

      <Card className="flex flex-col gap-1 border-border/70 bg-panel p-3">
        {errors.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum erro registrado neste filtro.</p>
        ) : (
          errors.map((error) => (
            <div key={error.id} className="border-b border-border/40 py-1.5 last:border-b-0">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge
                  variant="outline"
                  className={cn(
                    "font-mono text-[9px]",
                    error.severity === "CRITICAL" && "border-bear text-bear",
                    error.severity === "ERROR" && "border-bear/60 text-bear",
                    error.severity === "WARNING" && "border-warn text-warn",
                  )}
                >
                  {error.severity}
                </Badge>
                <Badge variant="outline" className="font-mono text-[9px]">
                  {error.source}
                </Badge>
                {error.occurrences > 1 && (
                  <Badge variant="outline" className="font-mono text-[9px] text-warn">
                    ×{error.occurrences}
                  </Badge>
                )}
                {error.resolved && (
                  <Badge variant="outline" className="border-bull font-mono text-[9px] text-bull">
                    RESOLVIDO
                  </Badge>
                )}
                <span className="min-w-0 flex-1 truncate" title={error.message}>
                  {error.message}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {new Date(error.lastSeen).toLocaleTimeString("pt-BR")}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => setExpanded(expanded === error.id ? null : error.id)}
                >
                  VER DETALHES
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => copyError(error)}
                >
                  <Copy className="mr-1 h-3 w-3" />
                  COPIAR
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => void resolve(error.id, !error.resolved)}
                >
                  {error.resolved ? "REABRIR" : "MARCAR RESOLVIDO"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[10px] text-primary"
                  onClick={() => sendToClaude(error)}
                >
                  <Bot className="mr-1 h-3 w-3" />
                  CORRIGIR COM CLAUDE
                </Button>
              </div>
              {expanded === error.id && (
                <pre className="mt-1 max-h-64 overflow-auto rounded bg-background/70 p-2 font-mono text-[10px] leading-snug">
                  {JSON.stringify(
                    {
                      id: error.id,
                      route: error.route,
                      sessionId: error.sessionId,
                      signalId: error.signalId,
                      firstSeen: new Date(error.firstSeen).toLocaleString("pt-BR"),
                      lastSeen: new Date(error.lastSeen).toLocaleString("pt-BR"),
                      stack: error.stack,
                      context: error.context,
                    },
                    null,
                    2,
                  )}
                </pre>
              )}
            </div>
          ))
        )}
      </Card>
    </div>
  );
}

type HealthState = "ONLINE" | "DEGRADADO" | "OFFLINE" | "—";

function HealthCenter() {
  const { live } = useAnalyzer();
  const recording = useSyncExternalStore(
    (listener) => screenRecordingManager.subscribe(listener),
    () => screenRecordingManager.getState(),
    () => null,
  );
  const [api, setApi] = useState<{ state: HealthState; latency: number | null }>({
    state: "—",
    latency: null,
  });
  const [ai, setAi] = useState<{ state: HealthState; detail: string }>({ state: "—", detail: "" });
  const [db, setDb] = useState<HealthState>("—");
  const [claudeApi, setClaudeApi] = useState<HealthState>("—");

  useEffect(() => {
    let active = true;
    const check = async () => {
      const startedAt = Date.now();
      try {
        const response = await fetch("/api/health");
        const payload = (await response.json()) as { status?: string };
        if (!active) return;
        setApi({
          state: payload.status === "ok" ? "ONLINE" : "DEGRADADO",
          latency: Date.now() - startedAt,
        });
      } catch {
        if (active) setApi({ state: "OFFLINE", latency: null });
      }
      try {
        const response = await fetch("/api/health/ai");
        const payload = (await response.json()) as {
          status?: string;
          message?: string;
          latencyMs?: number;
        };
        if (!active) return;
        setAi({
          state:
            payload.status === "ok"
              ? "ONLINE"
              : payload.status === "falha"
                ? "OFFLINE"
                : "DEGRADADO",
          detail: payload.message ?? "",
        });
      } catch {
        if (active) setAi({ state: "OFFLINE", detail: "backend inacessível" });
      }
      try {
        const response = await adminFetch("/api/errors/list?limit=1");
        if (active) setDb(response.ok ? "ONLINE" : response.status === 401 ? "—" : "OFFLINE");
      } catch {
        if (active) setDb("OFFLINE");
      }
      try {
        const headers: Record<string, string> = {};
        const token = getAdminToken();
        if (token) headers["x-admin-token"] = token;
        const response = await fetch("/api/admin/claude/status", { headers });
        const payload = (await response.json()) as { anthropicConfigured?: boolean };
        if (active) setClaudeApi(payload.anthropicConfigured ? "ONLINE" : "OFFLINE");
      } catch {
        if (active) setClaudeApi("OFFLINE");
      }
    };
    void check();
    const timer = setInterval(() => void check(), 20_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const diag = live.diagnostics;
  const items: Array<{ label: string; state: HealthState; detail?: string }> = [
    { label: "SITE", state: "ONLINE" },
    {
      label: "API",
      state: api.state,
      detail: api.latency !== null ? `${api.latency} ms` : undefined,
    },
    { label: "DB", state: db },
    {
      label: "T4",
      state: diag.T4_STATE === "IDLE" ? "—" : "ONLINE",
      detail: diag.T4_STATE,
    },
    { label: "CAPTURA", state: diag.CAPTURE_ACTIVE ? "ONLINE" : "—" },
    {
      label: "PROFIT",
      state: diag.CAPTURE_ACTIVE ? (diag.PROFIT_DETECTED ? "ONLINE" : "OFFLINE") : "—",
    },
    {
      label: "GRÁFICO",
      state: diag.CAPTURE_ACTIVE ? (diag.GRAPH_DETECTED ? "ONLINE" : "OFFLINE") : "—",
    },
    {
      label: "CHART_CLOCK",
      state:
        diag.CHART_CLOCK === "VALID"
          ? "ONLINE"
          : diag.CHART_CLOCK === "FALLBACK_REALTIME"
            ? "DEGRADADO"
            : "—",
      detail: diag.chartClockReason ?? undefined,
    },
    {
      label: "GRAVAÇÃO",
      state:
        recording === null || recording.status === "IDLE"
          ? "—"
          : recording.status === "GRAVANDO" || recording.status === "FINALIZADA"
            ? "ONLINE"
            : recording.status === "STARTING" || recording.status === "FINALIZANDO"
              ? "DEGRADADO"
              : "OFFLINE",
      detail: recording?.status,
    },
    { label: "OLLAMA/QWEN", state: ai.state, detail: ai.detail },
    { label: "CLAUDE API", state: claudeApi },
  ];
  return (
    <Card className="nexus-card gap-2 p-3">
      <p className="nexus-eyebrow">HEALTH CENTER — estado real, nunca estado de UI</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {items.map((item) => (
          <div key={item.label} className="rounded border border-border/50 p-2">
            <p className="text-[9px] tracking-widest text-muted-foreground">{item.label}</p>
            <p
              className={cn(
                "font-mono text-xs font-bold",
                item.state === "ONLINE" && "text-bull",
                item.state === "DEGRADADO" && "text-warn",
                item.state === "OFFLINE" && "text-bear",
              )}
            >
              {item.state}
            </p>
            {item.detail && (
              <p className="truncate text-[9px] text-muted-foreground" title={item.detail}>
                {item.detail}
              </p>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "bull" | "bear" | "warn";
}) {
  return (
    <Card className="gap-0.5 border-border/70 bg-background p-2">
      <p className="text-[9px] tracking-widest text-muted-foreground">{label}</p>
      <p
        className={cn(
          "font-mono text-sm font-bold",
          tone === "bull" && "text-bull",
          tone === "bear" && "text-bear",
          tone === "warn" && "text-warn",
        )}
      >
        {value}
      </p>
    </Card>
  );
}
