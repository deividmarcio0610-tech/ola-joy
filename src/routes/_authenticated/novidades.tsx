import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Package, Sparkles } from "lucide-react";
import { listVersions } from "@/lib/version.functions";
import { APP_VERSION } from "@/lib/version";

export const Route = createFileRoute("/_authenticated/novidades")({
  head: () => ({
    meta: [
      { title: "Novidades e Atualizações · VisionGuard AI" },
      {
        name: "description",
        content: "Histórico completo de versões do sistema com correções, melhorias e novidades.",
      },
    ],
  }),
  component: NovidadesPage,
});

function NovidadesPage() {
  const list = useServerFn(listVersions);
  const { data, isLoading } = useQuery({
    queryKey: ["app-versions"],
    queryFn: () => list(),
  });

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-glow">Novidades e Atualizações</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Versão instalada neste navegador:{" "}
          <span className="rounded bg-neon/10 px-1.5 py-0.5 font-mono text-neon">
            v{APP_VERSION}
          </span>
        </p>
      </header>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando histórico…</p>}
      {!isLoading && (data?.length ?? 0) === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma versão registrada ainda.</p>
      )}

      <ol className="space-y-4">
        {data?.map((v) => (
          <li key={v.id} className="rounded-lg border border-border bg-card/50 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Package className="h-4 w-4 text-neon" />
              <span className="font-mono text-lg font-semibold">v{v.version}</span>
              {v.version === APP_VERSION && (
                <span className="rounded bg-neon/10 px-2 py-0.5 text-xs text-neon">atual</span>
              )}
              {v.is_mandatory && (
                <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 text-xs text-amber-500">
                  <AlertTriangle className="h-3 w-3" />
                  obrigatória
                </span>
              )}
              {!v.is_active && (
                <span className="rounded bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
                  retirada
                </span>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                {new Date(v.published_at).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              </span>
            </div>
            <h3 className="mt-2 flex items-center gap-2 font-semibold">
              <Sparkles className="h-4 w-4 text-neon" />
              {v.title}
            </h3>
            {v.description && <p className="mt-1 text-sm text-muted-foreground">{v.description}</p>}
            {v.release_notes.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm">
                {v.release_notes.map((n, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-neon">•</span>
                    <span>{n}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
