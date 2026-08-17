import { createFileRoute } from "@tanstack/react-router";
import { ScrollText, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ModuleShell } from "@/components/module-shell";

export const Route = createFileRoute("/_authenticated/auditoria")({
  head: () => ({ meta: [{ title: "Auditoria · VisionGuard AI" }] }),
  component: Audit,
});

function Audit() {
  const { data, isLoading } = useQuery({
    queryKey: ["audit-records"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("records")
        .select("id, module, title, status, priority, created_at, updated_at, user_id")
        .order("updated_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  return (
    <ModuleShell
      icon={ScrollText}
      title="Auditoria"
      subtitle="Trilha de eventos e alterações recentes."
      status="operacional"
    >
      <div className="rounded-xl border border-border bg-card/40">
        {isLoading ? (
          <div className="flex items-center justify-center p-10 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Carregando…
          </div>
        ) : !data || data.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Sem eventos.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Módulo</th>
                <th className="px-4 py-3 text-left">Título</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Prioridade</th>
                <th className="px-4 py-3 text-left">Atualizado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 uppercase text-[11px] text-neon">{r.module}</td>
                  <td className="px-4 py-2">{r.title}</td>
                  <td className="px-4 py-2 text-muted-foreground">{r.status}</td>
                  <td className="px-4 py-2 text-muted-foreground">{r.priority}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {new Date(r.updated_at).toLocaleString("pt-BR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </ModuleShell>
  );
}
