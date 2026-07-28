import { createFileRoute } from "@tanstack/react-router";
import { UserCog, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ModuleShell } from "@/components/module-shell";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({ meta: [{ title: "Usuários · VALETECH" }] }),
  component: Usuarios,
});

function Usuarios() {
  const { data, isLoading } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, full_name, role_title, created_at");
      if (error) throw error;
      const { data: roles } = await supabase.from("user_roles").select("user_id, role");
      const rolesByUser = new Map<string, string[]>();
      roles?.forEach((r) => {
        const arr = rolesByUser.get(r.user_id) ?? [];
        arr.push(r.role);
        rolesByUser.set(r.user_id, arr);
      });
      return profiles?.map((p) => ({ ...p, roles: rolesByUser.get(p.id) ?? [] })) ?? [];
    },
  });

  return (
    <ModuleShell icon={UserCog} title="Usuários" subtitle="Perfis e papéis do sistema." status="operacional">
      <div className="rounded-xl border border-border bg-card/40">
        {isLoading ? (
          <div className="flex items-center justify-center p-10 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />Carregando…
          </div>
        ) : !data || data.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Nenhum usuário visível.</div>
        ) : (
          <ul className="divide-y divide-border">
            {data.map((u) => (
              <li key={u.id} className="flex items-center justify-between p-4">
                <div>
                  <div className="font-medium">{u.full_name ?? "(sem nome)"}</div>
                  <div className="text-xs text-muted-foreground">{u.role_title ?? "—"}</div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {u.roles.length === 0 ? (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">sem papel</span>
                  ) : (
                    u.roles.map((r: string) => (
                      <span key={r} className="rounded-full bg-neon/15 px-2 py-0.5 text-[10px] uppercase tracking-widest text-neon ring-1 ring-neon/30">
                        {r}
                      </span>
                    ))
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Somente administradores visualizam todos os usuários. Operadores veem apenas o próprio perfil.
      </p>
    </ModuleShell>
  );
}
