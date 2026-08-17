import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ModuleShell } from "@/components/module-shell";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sparkles, RefreshCw, Loader2, Activity, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/image-providers")({
  head: () => ({ meta: [{ title: "Provedores de Imagem · VisionGuard AI" }] }),
  component: ImageProvidersAdmin,
});

type ProbeInfo = {
  provider: string;
  configured: boolean;
  ok: boolean;
  httpStatus?: number;
  message: string;
  durationMs: number;
};

type Attempt = {
  provider_name: string;
  model: string | null;
  status: string;
  http_status: number | null;
  error_type: string | null;
  sanitized_error_message: string | null;
  duration_ms: number | null;
  started_at: string;
};

type DiagnosticRow = {
  id: string;
  provider_name: string;
  priority: number;
  enabled: boolean;
  current_status: string;
  blocked_until: string | null;
  default_model: string | null;
  preview_model: string | null;
  final_model: string | null;
  total_success: number | null;
  total_failure: number | null;
  last_error_type: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  notes: string | null;
  probe: ProbeInfo | null;
  recentAttempts: Attempt[];
};

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessão expirada.");
  return { Authorization: `Bearer ${token}` };
}

function ImageProvidersAdmin() {
  const qc = useQueryClient();

  const {
    data: diag,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["image_providers_diagnostic"],
    queryFn: async () => {
      // Diagnóstico agora vive em /admin/ia-vps (arquitetura VPS).
      // Mantemos a listagem local via Supabase para configuração dos provedores.
      const { data, error } = await supabase.from("image_providers").select("*");
      if (error) throw error;
      return (data ?? []) as unknown as DiagnosticRow[];
    },
  });

  const update = useMutation({
    mutationFn: async (p: {
      id: string;
      patch: Partial<Record<string, string | number | boolean | null>>;
    }) => {
      const { error } = await supabase
        .from("image_providers")
        .update(p.patch as never)
        .eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["image_providers_diagnostic"] });
      toast.success("Provedor atualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const test = useMutation({
    mutationFn: async (providerName: string): Promise<ProbeInfo> => {
      const { callVpsRoute } = await import("@/lib/vps-ai/call");
      return await callVpsRoute<ProbeInfo>("/api/vps/status", { provider: providerName });
    },
    onSuccess: (r) => {
      if (r.ok) toast.success(`${r.provider.toUpperCase()}: ${r.message} (${r.durationMs}ms)`);
      else toast.error(`${r.provider.toUpperCase()} · HTTP ${r.httpStatus ?? "?"} · ${r.message}`);
      qc.invalidateQueries({ queryKey: ["image_providers_diagnostic"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetBreaker = (id: string) =>
    update.mutate({
      id,
      patch: {
        current_status: "closed",
        consecutive_failures: 0,
        blocked_until: null,
        last_error_type: null,
      },
    });

  return (
    <ModuleShell
      icon={Sparkles}
      title="Provedores de Imagem"
      subtitle="Diagnóstico e roteador multiprovedor da 'Foto Depois'."
      status="operacional"
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Status em tempo real das APIs de geração de imagem.
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-1"
        >
          <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 p-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : (
        <div className="space-y-3">
          {diag?.map((p) => {
            const probe = p.probe;
            const configured = probe?.configured ?? false;
            const online = probe?.ok ?? false;
            return (
              <div key={p.id} className="rounded-xl border border-border bg-card/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="font-semibold uppercase">{p.provider_name}</div>
                    {configured ? (
                      online ? (
                        <Badge className="gap-1 bg-emerald-600 text-white">
                          <CheckCircle2 className="h-3 w-3" /> Online
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="gap-1">
                          <XCircle className="h-3 w-3" /> Falhando
                        </Badge>
                      )
                    ) : (
                      <Badge variant="secondary">Sem API key</Badge>
                    )}
                    <Badge variant={p.current_status === "closed" ? "default" : "destructive"}>
                      breaker: {p.current_status}
                    </Badge>
                    {p.blocked_until && (
                      <span className="text-xs text-muted-foreground">
                        bloqueado até {new Date(p.blocked_until).toLocaleString("pt-BR")}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-xs">
                      Prioridade
                      <Input
                        className="h-8 w-16"
                        type="number"
                        defaultValue={p.priority}
                        onBlur={(e) =>
                          update.mutate({
                            id: p.id,
                            patch: { priority: Number(e.target.value) || 100 },
                          })
                        }
                      />
                    </label>
                    <label className="flex items-center gap-2 text-xs">
                      Ativo
                      <Switch
                        checked={p.enabled}
                        onCheckedChange={(v) => update.mutate({ id: p.id, patch: { enabled: v } })}
                      />
                    </label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => test.mutate(p.provider_name)}
                      disabled={test.isPending}
                      className="gap-1"
                    >
                      <Activity className="h-3 w-3" /> Testar conexão
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => resetBreaker(p.id)}
                      className="gap-1"
                    >
                      <RefreshCw className="h-3 w-3" /> Reset
                    </Button>
                  </div>
                </div>

                {probe && (
                  <div className="mt-3 rounded-lg border border-border/60 bg-background/40 p-2 text-xs">
                    <span className="text-muted-foreground">Última verificação: </span>
                    HTTP {probe.httpStatus ?? "—"} · {probe.durationMs}ms · {probe.message}
                  </div>
                )}

                <div className="mt-3 grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
                  <Field label="Modelo padrão" value={p.default_model} />
                  <Field label="Prévia" value={p.preview_model} />
                  <Field label="Final" value={p.final_model} />
                  <Field
                    label="Sucessos / Falhas"
                    value={`${p.total_success ?? 0} / ${p.total_failure ?? 0}`}
                  />
                  <Field label="Último erro" value={p.last_error_type ?? "—"} />
                  <Field
                    label="Último sucesso"
                    value={
                      p.last_success_at ? new Date(p.last_success_at).toLocaleString("pt-BR") : "—"
                    }
                  />
                  <Field
                    label="Última falha"
                    value={
                      p.last_failure_at ? new Date(p.last_failure_at).toLocaleString("pt-BR") : "—"
                    }
                  />
                  <Field label="Notas" value={p.notes ?? "—"} />
                </div>

                {p.recentAttempts?.length > 0 && (
                  <div className="mt-3">
                    <div className="mb-1 text-xs font-semibold text-muted-foreground">
                      Últimas tentativas
                    </div>
                    <div className="space-y-1">
                      {p.recentAttempts.map((a, i) => (
                        <div
                          key={i}
                          className="rounded-md border border-border/40 bg-background/30 p-2 text-xs"
                        >
                          <div className="flex flex-wrap gap-2">
                            <Badge variant={a.status === "success" ? "default" : "destructive"}>
                              {a.status}
                            </Badge>
                            <span>HTTP {a.http_status ?? "?"}</span>
                            <span>{a.error_type ?? "—"}</span>
                            <span>{a.duration_ms ?? "?"}ms</span>
                            <span className="text-muted-foreground">
                              {new Date(a.started_at).toLocaleString("pt-BR")}
                            </span>
                          </div>
                          {a.sanitized_error_message && (
                            <div className="mt-1 whitespace-pre-wrap text-muted-foreground">
                              {a.sanitized_error_message}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 rounded-xl border border-border bg-card/30 p-4 text-xs text-muted-foreground">
        Para ativar Stability, fal.ai, Replicate ou OpenAI, adicione a chave correspondente nos
        segredos do backend (STABILITY_API_KEY, FAL_API_KEY, REPLICATE_API_TOKEN, OPENAI_API_KEY) e
        ligue o switch acima.
      </div>
    </ModuleShell>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="font-medium">{value ?? "—"}</div>
    </div>
  );
}
