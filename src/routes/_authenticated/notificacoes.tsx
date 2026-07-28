import { createFileRoute } from "@tanstack/react-router";
import { Bell, Loader2, Check } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ModuleShell } from "@/components/module-shell";

export const Route = createFileRoute("/_authenticated/notificacoes")({
  head: () => ({ meta: [{ title: "Notificações · VALETECH" }] }),
  component: Notifs,
});

function Notifs() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  return (
    <ModuleShell icon={Bell} title="Notificações" subtitle="Central de avisos do sistema." status="operacional">
      <div className="rounded-xl border border-border bg-card/40">
        {isLoading ? (
          <div className="flex items-center justify-center p-10 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />Carregando…
          </div>
        ) : !data || data.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Sem notificações no momento.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {data.map((n) => (
              <li key={n.id} className={`flex items-start gap-3 p-4 ${n.read_at ? "opacity-60" : ""}`}>
                <div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? "bg-muted-foreground" : "bg-neon shadow-[0_0_8px_var(--neon)]"}`} />
                <div className="flex-1">
                  <div className="font-medium">{n.title}</div>
                  {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {new Date(n.created_at).toLocaleString("pt-BR")}
                  </div>
                </div>
                {!n.read_at && (
                  <Button size="sm" variant="ghost" onClick={() => markRead.mutate(n.id)}>
                    <Check className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </ModuleShell>
  );
}
