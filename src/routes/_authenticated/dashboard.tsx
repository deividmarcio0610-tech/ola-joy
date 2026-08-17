import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Zap,
  Brain,
  Briefcase,
  History,
  Activity,
  Sparkles,
  Mic,
  Globe,
  Database,
  Loader2,
  ListChecks,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { APP_CONFIG } from "@/lib/app-config";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listMeetingSessions } from "@/lib/meetings.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

type StatusValue = "AGUARDANDO" | "ONLINE" | "OFFLINE" | "ERRO" | "NÃO CONFIGURADO";

interface HealthResponse {
  services?: Record<string, { ok?: boolean; status?: string }>;
}

function DashboardPage() {
  const [systemStatus, setSystemStatus] = useState<Record<string, StatusValue>>({
    Microfone: "AGUARDANDO",
    "Transcrição (STT)": "AGUARDANDO",
    Memória: "AGUARDANDO",
  });

  const listSessionsFn = useServerFn(listMeetingSessions);
  const sessionsQuery = useQuery({
    queryKey: ["meeting-sessions"],
    queryFn: () => listSessionsFn(),
  });

  useEffect(() => {
    let active = true;

    const checkStatus = async () => {
      try {
        const permissions = await navigator.permissions.query({
          name: "microphone" as PermissionName,
        });
        if (!active) return;
        setSystemStatus((prev) => ({
          ...prev,
          Microfone:
            permissions.state === "granted"
              ? "ONLINE"
              : permissions.state === "denied"
                ? "OFFLINE"
                : "AGUARDANDO",
        }));
      } catch {
        if (active) setSystemStatus((prev) => ({ ...prev, Microfone: "AGUARDANDO" }));
      }

      try {
        const { error } = await supabase.from("professional_memories").select("id").limit(1);
        if (active) setSystemStatus((prev) => ({ ...prev, Memória: error ? "ERRO" : "ONLINE" }));
      } catch {
        if (active) setSystemStatus((prev) => ({ ...prev, Memória: "ERRO" }));
      }

      // O estado do STT vem do health check do servidor, que verifica a chave da IA.
      try {
        const res = await fetch("/api/public/health");
        const health = (await res.json()) as HealthResponse;
        const ia = health.services?.ia;
        if (active) {
          setSystemStatus((prev) => ({
            ...prev,
            "Transcrição (STT)": ia?.ok ? "ONLINE" : ((ia?.status as StatusValue) ?? "OFFLINE"),
          }));
        }
      } catch {
        if (active) setSystemStatus((prev) => ({ ...prev, "Transcrição (STT)": "OFFLINE" }));
      }
    };

    void checkStatus();
    return () => {
      active = false;
    };
  }, []);

  const insights = useMemo(() => {
    const sessions = sessionsQuery.data ?? [];
    if (sessions.length === 0) return null;

    const totalActions = sessions.reduce((sum, s) => sum + s.actions.length, 0);
    const totalPending = sessions.reduce((sum, s) => sum + s.pending.length, 0);
    const totalDecisions = sessions.reduce((sum, s) => sum + s.decisions.length, 0);

    return { sessions, totalActions, totalPending, totalDecisions, last: sessions[0] };
  }, [sessionsQuery.data]);

  const primaryActions = [
    { label: "Copilot ao Vivo", icon: Zap, to: "/copiloto", desc: "Assistência em tempo real" },
    { label: "Minha IA", icon: Brain, to: "/minha-ia", desc: "Sua memória profissional" },
    { label: "Treino STAR", icon: History, to: "/simulador", desc: "Simulador de entrevista" },
    { label: "Currículo IA", icon: Briefcase, to: "/curriculo", desc: "Gestão inteligente" },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ONLINE":
        return "text-emerald-500";
      case "OFFLINE":
        return "text-rose-500";
      case "ERRO":
      case "NÃO CONFIGURADO":
        return "text-amber-500";
      default:
        return "text-white/20";
    }
  };

  return (
    <div className="space-y-12 animate-in fade-in duration-700">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-white">Bem-vindo ao {APP_CONFIG.name}</h1>
        <p className="text-white/40 text-sm">&ldquo;{APP_CONFIG.motto}&rdquo;</p>
      </div>

      <div className="flex gap-4">
        <Button
          size="lg"
          asChild
          className="bg-white hover:bg-white/90 text-black rounded-full h-14 px-8 font-bold text-sm shadow-[0_0_20px_rgba(255,255,255,0.15)]"
        >
          <Link to="/copiloto">
            <Zap className="w-4 h-4 mr-2" /> INICIAR COPILOT
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {primaryActions.map((action) => (
          <Link key={action.label} to={action.to} className="group">
            <Card className="p-6 bg-white/[0.02] border-white/5 hover:bg-white/[0.05] transition-all h-full rounded-2xl">
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center mb-4 group-hover:bg-white group-hover:text-black transition-colors">
                <action.icon className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-sm mb-1">{action.label}</h3>
              <p className="text-white/40 text-xs">{action.desc}</p>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-white/50" /> Insights
            </h2>
            {insights && (
              <Link
                to="/relatorios"
                className="text-[10px] font-bold uppercase text-white/40 hover:text-white"
              >
                Ver relatórios
              </Link>
            )}
          </div>

          {sessionsQuery.isLoading && (
            <Card className="p-12 bg-white/[0.02] border-white/5 rounded-2xl flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-white/20" />
            </Card>
          )}

          {sessionsQuery.isError && (
            <Card className="p-6 bg-rose-500/5 border-rose-500/20 rounded-2xl">
              <p className="text-xs text-rose-400">{(sessionsQuery.error as Error).message}</p>
            </Card>
          )}

          {!sessionsQuery.isLoading && !sessionsQuery.isError && !insights && (
            <Card className="p-12 bg-white/[0.02] border-white/5 border-dashed rounded-2xl flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center text-white/20">
                <Activity className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-white/60">Nenhuma reunião registrada</h4>
                <p className="text-xs text-white/20 mt-1 max-w-xs mx-auto">
                  Inicie uma reunião com o Copilot: a transcrição, as decisões e a ata ficam salvas
                  na sua conta.
                </p>
              </div>
            </Card>
          )}

          {insights && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Reuniões", value: insights.sessions.length, icon: Activity },
                  { label: "Decisões", value: insights.totalDecisions, icon: CheckCircle2 },
                  { label: "Ações", value: insights.totalActions, icon: ListChecks },
                  { label: "Pendências", value: insights.totalPending, icon: AlertTriangle },
                ].map((stat) => (
                  <Card key={stat.label} className="p-4 bg-white/[0.02] border-white/5 rounded-2xl">
                    <stat.icon className="w-4 h-4 text-white/20 mb-2" />
                    <p className="text-2xl font-bold text-white">{stat.value}</p>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/20">
                      {stat.label}
                    </p>
                  </Card>
                ))}
              </div>

              <Card className="p-6 bg-white/[0.02] border-white/5 rounded-2xl space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/20">
                  Última reunião
                </p>
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-bold text-white truncate">{insights.last.title}</p>
                    <p className="text-xs text-white/40">
                      {new Date(insights.last.startTime).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <Link
                    to="/atas"
                    search={{ id: insights.last.id }}
                    className="text-[10px] font-bold uppercase text-white/40 hover:text-white whitespace-nowrap"
                  >
                    Abrir ata
                  </Link>
                </div>
                {insights.last.summary && (
                  <p className="text-xs text-white/60 leading-relaxed line-clamp-3 pt-2">
                    {insights.last.summary}
                  </p>
                )}
              </Card>
            </div>
          )}
        </div>

        <Card className="p-6 bg-gradient-to-br from-white/5 to-transparent border-white/5 rounded-2xl h-fit">
          <h4 className="font-bold text-sm mb-6">Status do Sistema</h4>
          <div className="space-y-5">
            {Object.entries(systemStatus).map(([item, status]) => (
              <div key={item} className="flex justify-between text-xs items-center gap-3">
                <span className="text-white/40 flex items-center gap-2">
                  {item === "Microfone" && <Mic className="w-3 h-3" />}
                  {item === "Transcrição (STT)" && <Globe className="w-3 h-3" />}
                  {item === "Memória" && <Database className="w-3 h-3" />}
                  {item}
                </span>
                <span
                  className={cn(
                    "font-bold flex items-center gap-1.5 text-right",
                    getStatusColor(status),
                  )}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                  {status}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-8 pt-6 border-t border-white/5">
            <Button
              variant="ghost"
              asChild
              className="w-full text-[10px] font-bold uppercase tracking-widest text-white/20 hover:text-white hover:bg-white/5 rounded-xl"
            >
              <Link to="/diagnostico">Ver Diagnóstico Completo</Link>
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
