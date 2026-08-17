import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { useVpsHealth } from "@/lib/vps-ai/hooks";
import { vpsAI } from "@/lib/vps-ai/api";
import { vpsAuthFetch } from "@/lib/vps-ai/hooks";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VpsDiagnosticsPanel } from "@/components/vps/VpsDiagnosticsPanel";

const getMaskedConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Painel administrativo: só admin vê a URL da API e o sufixo da chave.
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Apenas administradores podem ver a configuração da IA.");
    // Nomes novos com fallback para os antigos — igual a getVpsAiConfig().
    const url = process.env.VISION_AI_API_URL ?? process.env.VALETECH_AI_API_URL ?? "";
    const key = process.env.VISION_AI_API_KEY ?? process.env.VALETECH_AI_API_KEY ?? "";
    return {
      apiUrl: url,
      apiKeyMasked: key ? `••••••••${key.slice(-4)}` : "não configurada",
    };
  });

export const Route = createFileRoute("/_authenticated/admin/ia-vps")({
  head: () => ({
    meta: [
      { title: "Admin • IA VPS" },
      { name: "description", content: "Status e configuração da API de IA hospedada na VPS." },
    ],
  }),
  loader: () => getMaskedConfig(),
  component: IaVpsAdmin,
});

function IaVpsAdmin() {
  const cfg = Route.useLoaderData();
  const { health } = useVpsHealth(15_000);
  const { data: models } = useQuery({
    queryKey: ["vps-models"],
    queryFn: () => vpsAuthFetch(() => vpsAI.listModels()),
    refetchInterval: 60_000,
  });

  return (
    <div className="p-6 space-y-4 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold">IA da VPS</h1>

      <Card>
        <CardHeader>
          <CardTitle>Configuração</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>
            <span className="text-muted-foreground">URL:</span> {cfg.apiUrl || "não configurada"}
          </div>
          <div>
            <span className="text-muted-foreground">Chave:</span> {cfg.apiKeyMasked}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <StatusRow label="Servidor de IA" ok={health?.online ?? false} />
          <StatusRow
            label="Ollama"
            ok={health?.ollama.online ?? false}
            extra={health?.ollama.model}
          />
          <StatusRow
            label="Gerador de imagens"
            ok={health?.imageGenerator.online ?? false}
            extra={`modo ${health?.imageGenerator.mode ?? "?"}`}
          />
          {health?.tempoResposta != null && (
            <div className="text-muted-foreground">Tempo de resposta: {health.tempoResposta}ms</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Modelos instalados</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {(models?.models ?? []).map((m) => (
            <Badge key={m} variant="secondary">
              {m}
            </Badge>
          ))}
          {!models?.models?.length && (
            <span className="text-muted-foreground text-sm">Nenhum modelo listado.</span>
          )}
        </CardContent>
      </Card>

      <VpsDiagnosticsPanel />
    </div>
  );
}

function StatusRow({ label, ok, extra }: { label: string; ok: boolean; extra?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${ok ? "bg-emerald-500" : "bg-destructive"}`} />
      <span>{label}:</span>
      <span className={ok ? "text-emerald-500" : "text-destructive"}>
        {ok ? "Online" : "Offline"}
      </span>
      {extra && <span className="text-muted-foreground">— {extra}</span>}
    </div>
  );
}
