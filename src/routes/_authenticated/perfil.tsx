import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import {
  LogOut,
  Shield,
  Download,
  Trash2,
  Activity,
  Settings,
  Loader2,
  FileText,
} from "lucide-react";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { APP_CONFIG } from "@/lib/app-config";
import { deleteMemory, listMemories } from "@/lib/memory.functions";
import { listMeetingSessions } from "@/lib/meetings.functions";

export const Route = createFileRoute("/_authenticated/perfil")({
  component: PerfilPage,
});

function PerfilPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [isExporting, setIsExporting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const listMemoriesFn = useServerFn(listMemories);
  const listSessionsFn = useServerFn(listMeetingSessions);
  const deleteMemoryFn = useServerFn(deleteMemory);

  const memoriesQuery = useQuery({ queryKey: ["memories"], queryFn: () => listMemoriesFn() });
  const sessionsQuery = useQuery({
    queryKey: ["meeting-sessions"],
    queryFn: () => listSessionsFn(),
  });

  const displayName = user?.user_metadata?.full_name ?? user?.email?.split("@")[0] ?? "Usuário";
  const avatarUrl = (user?.user_metadata?.avatar_url as string | undefined) ?? undefined;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    await router.invalidate();
    navigate({ to: "/auth" });
  };

  /** Exportação real dos dados do usuário (LGPD): baixa um JSON com tudo. */
  const handleExport = async () => {
    setIsExporting(true);
    try {
      const [memories, sessions] = await Promise.all([listMemoriesFn(), listSessionsFn()]);
      const payload = {
        exportedAt: new Date().toISOString(),
        account: { id: user?.id, email: user?.email },
        professionalMemories: memories,
        meetingSessions: sessions,
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `deividtech-dados-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success("Seus dados foram exportados em JSON.");
    } catch (err) {
      toast.error(`Falha ao exportar: ${String((err as Error)?.message ?? err)}`);
    } finally {
      setIsExporting(false);
    }
  };

  /** Exclusão real de toda a memória profissional. */
  const handleClearMemory = async () => {
    const memories = memoriesQuery.data ?? [];
    if (memories.length === 0) {
      toast.info("Sua memória já está vazia.");
      return;
    }
    if (
      !window.confirm(
        `Excluir permanentemente ${memories.length} registro(s) da sua memória profissional?`,
      )
    ) {
      return;
    }

    setIsClearing(true);
    try {
      for (const memory of memories) {
        await deleteMemoryFn({ data: { id: memory.id } });
      }
      await queryClient.invalidateQueries({ queryKey: ["memories"] });
      toast.success("Memória profissional apagada.");
    } catch (err) {
      toast.error(`Falha ao limpar a memória: ${String((err as Error)?.message ?? err)}`);
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Meu perfil</h1>
        <p className="text-white/40">Sua conta, seus dados e seus atalhos no {APP_CONFIG.name}.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-6 border-white/5 bg-white/[0.02] space-y-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14 border border-white/10">
              <AvatarImage src={avatarUrl} />
              <AvatarFallback className="bg-white text-black font-bold">
                {displayName.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="font-bold text-white truncate">{displayName}</p>
              <p className="text-xs text-white/40 truncate">{user?.email}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge
              variant="outline"
              className="border-emerald-500/30 bg-emerald-500/10 text-[9px] text-emerald-500"
            >
              CONTA ATIVA
            </Badge>
            {user?.app_metadata?.provider && (
              <Badge
                variant="outline"
                className="border-white/10 bg-white/5 text-[9px] text-white/60"
              >
                LOGIN VIA {String(user.app_metadata.provider).toUpperCase()}
              </Badge>
            )}
          </div>

          <Button
            onClick={handleLogout}
            variant="outline"
            className="w-full rounded-full border-rose-500/20 text-rose-500 hover:bg-rose-500/10 font-bold"
          >
            <LogOut className="w-4 h-4 mr-2" /> SAIR DA CONTA
          </Button>
        </Card>

        <Card className="p-6 border-white/5 bg-white/[0.02] space-y-4">
          <h2 className="text-sm font-bold text-white">Seus números</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-white/5 p-4">
              <p className="text-2xl font-bold text-white">
                {sessionsQuery.isLoading ? "—" : (sessionsQuery.data?.length ?? 0)}
              </p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/20">
                Reuniões
              </p>
            </div>
            <div className="rounded-xl border border-white/5 p-4">
              <p className="text-2xl font-bold text-white">
                {memoriesQuery.isLoading ? "—" : (memoriesQuery.data?.length ?? 0)}
              </p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/20">
                Memórias
              </p>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <Link
              to="/configuracoes"
              className="flex items-center gap-3 rounded-xl border border-white/5 p-3 text-sm text-white/60 hover:bg-white/5 hover:text-white transition-colors"
            >
              <Settings className="w-4 h-4" /> Configurações
            </Link>
            <Link
              to="/diagnostico"
              className="flex items-center gap-3 rounded-xl border border-white/5 p-3 text-sm text-white/60 hover:bg-white/5 hover:text-white transition-colors"
            >
              <Activity className="w-4 h-4" /> Diagnóstico do sistema
            </Link>
            <Link
              to="/relatorios"
              className="flex items-center gap-3 rounded-xl border border-white/5 p-3 text-sm text-white/60 hover:bg-white/5 hover:text-white transition-colors"
            >
              <FileText className="w-4 h-4" /> Relatórios
            </Link>
          </div>
        </Card>

        <Card className="p-6 border-white/5 bg-white/[0.02] space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-500" />
            <h2 className="text-sm font-bold text-white">Seus dados</h2>
          </div>
          <p className="text-xs text-white/40 leading-relaxed">
            Reuniões e memória ficam isoladas por conta via Row-Level Security. Você pode exportar
            ou apagar tudo a qualquer momento.
          </p>

          <div className="space-y-2">
            <Button
              onClick={handleExport}
              disabled={isExporting}
              variant="outline"
              className="w-full rounded-full border-white/10 text-white/60 hover:text-white text-xs font-bold"
            >
              {isExporting ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <>
                  <Download className="w-3 h-3 mr-2" /> EXPORTAR TUDO (.JSON)
                </>
              )}
            </Button>
            <Button
              onClick={handleClearMemory}
              disabled={isClearing}
              variant="outline"
              className="w-full rounded-full border-rose-500/20 text-rose-500 hover:bg-rose-500/10 text-xs font-bold"
            >
              {isClearing ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <>
                  <Trash2 className="w-3 h-3 mr-2" /> LIMPAR MEMÓRIA
                </>
              )}
            </Button>
          </div>

          <div className="flex gap-4 pt-2 text-[10px] text-white/20">
            <Link to="/privacy" className="hover:text-white/60 underline">
              Privacidade
            </Link>
            <Link to="/terms" className="hover:text-white/60 underline">
              Termos
            </Link>
            <Link to="/security" className="hover:text-white/60 underline">
              Segurança
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
