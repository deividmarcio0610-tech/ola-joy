import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Download,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Clock,
  Gavel,
  ListChecks,
  CircleDashed,
  Users,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { listMeetingSessions, type MeetingSession } from "@/lib/meetings.functions";

export const Route = createFileRoute("/_authenticated/relatorios")({
  component: RelatoriosPage,
});

type PeriodValue = "7" | "30" | "90" | "all";

const PERIOD_OPTIONS: ReadonlyArray<{ value: PeriodValue; label: string; days: number | null }> = [
  { value: "7", label: "Últimos 7 dias", days: 7 },
  { value: "30", label: "Últimos 30 dias", days: 30 },
  { value: "90", label: "Últimos 90 dias", days: 90 },
  { value: "all", label: "Tudo", days: null },
];

function sessionDurationMs(session: MeetingSession): number {
  if (!session.endTime) return 0;
  const start = new Date(session.startTime).getTime();
  const end = new Date(session.endTime).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 0;
  return end - start;
}

function formatDuration(totalMs: number): string {
  const totalMinutes = Math.round(totalMs / 60000);
  if (totalMinutes <= 0) return "0min";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}min`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}min`;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDateOnly(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

interface ResponsibleRow {
  responsible: string;
  total: number;
  meetings: number;
  nextDeadline: string;
}

function RelatoriosPage() {
  const listSessions = useServerFn(listMeetingSessions);
  const [period, setPeriod] = useState<PeriodValue>("30");

  const { data, isPending, isError, error, refetch, isFetching } = useQuery<MeetingSession[]>({
    queryKey: ["meeting-sessions", "relatorios"],
    queryFn: async () => (await listSessions()) as unknown as MeetingSession[],
  });

  const sessions = useMemo<MeetingSession[]>(() => data ?? [], [data]);

  const selectedPeriod =
    PERIOD_OPTIONS.find((option) => option.value === period) ?? PERIOD_OPTIONS[1];

  const filtered = useMemo(() => {
    if (selectedPeriod.days === null) return sessions;
    const threshold = Date.now() - selectedPeriod.days * 24 * 60 * 60 * 1000;
    return sessions.filter((session) => {
      const start = new Date(session.startTime).getTime();
      return !Number.isNaN(start) && start >= threshold;
    });
  }, [sessions, selectedPeriod]);

  const metrics = useMemo(() => {
    const totalMeetings = filtered.length;
    const totalMs = filtered.reduce((sum, session) => sum + sessionDurationMs(session), 0);
    const totalDecisions = filtered.reduce((sum, session) => sum + session.decisions.length, 0);
    const totalActions = filtered.reduce((sum, session) => sum + session.actions.length, 0);
    const totalPending = filtered.reduce((sum, session) => sum + session.pending.length, 0);
    const averageActions = totalMeetings === 0 ? 0 : totalActions / totalMeetings;

    return { totalMeetings, totalMs, totalDecisions, totalActions, totalPending, averageActions };
  }, [filtered]);

  const responsibles = useMemo<ResponsibleRow[]>(() => {
    const map = new Map<string, { total: number; meetings: Set<string>; deadlines: string[] }>();

    for (const session of filtered) {
      for (const action of session.actions) {
        const name = action.responsible?.trim() || "Não atribuído";
        const entry = map.get(name) ?? { total: 0, meetings: new Set<string>(), deadlines: [] };
        entry.total += 1;
        entry.meetings.add(session.id);
        if (action.deadline?.trim()) entry.deadlines.push(action.deadline.trim());
        map.set(name, entry);
      }
    }

    return Array.from(map.entries())
      .map(([responsible, entry]) => ({
        responsible,
        total: entry.total,
        meetings: entry.meetings.size,
        nextDeadline: entry.deadlines.sort()[0] ?? "—",
      }))
      .sort((a, b) => b.total - a.total || a.responsible.localeCompare(b.responsible, "pt-BR"));
  }, [filtered]);

  const buildMarkdown = (): string => {
    const generatedAt = formatDateTime(new Date().toISOString());
    const lines: string[] = [];

    lines.push("# Relatório de Reuniões");
    lines.push("");
    lines.push(`- Período: ${selectedPeriod.label}`);
    lines.push(`- Gerado em: ${generatedAt}`);
    lines.push("");
    lines.push("## Indicadores");
    lines.push("");
    lines.push("| Indicador | Valor |");
    lines.push("| --- | --- |");
    lines.push(`| Total de reuniões | ${metrics.totalMeetings} |`);
    lines.push(`| Tempo total em reunião | ${formatDuration(metrics.totalMs)} |`);
    lines.push(`| Total de decisões | ${metrics.totalDecisions} |`);
    lines.push(`| Total de ações | ${metrics.totalActions} |`);
    lines.push(`| Total de pendências | ${metrics.totalPending} |`);
    lines.push(
      `| Média de ações por reunião | ${metrics.averageActions.toFixed(1).replace(".", ",")} |`,
    );
    lines.push("");

    lines.push("## Ações por responsável");
    lines.push("");
    if (responsibles.length === 0) {
      lines.push("Nenhuma ação registrada no período.");
    } else {
      lines.push("| Responsável | Ações | Reuniões | Prazo mais próximo |");
      lines.push("| --- | --- | --- | --- |");
      for (const row of responsibles) {
        lines.push(`| ${row.responsible} | ${row.total} | ${row.meetings} | ${row.nextDeadline} |`);
      }
    }
    lines.push("");

    lines.push("## Reuniões do período");
    lines.push("");
    if (filtered.length === 0) {
      lines.push("Nenhuma reunião registrada no período.");
    } else {
      for (const session of filtered) {
        lines.push(`### ${session.title}`);
        lines.push("");
        lines.push(`- Início: ${formatDateTime(session.startTime)}`);
        lines.push(`- Duração: ${formatDuration(sessionDurationMs(session))}`);
        lines.push(`- Decisões: ${session.decisions.length}`);
        lines.push(`- Ações: ${session.actions.length}`);
        lines.push(`- Pendências: ${session.pending.length}`);
        lines.push("");

        if (session.summary.trim()) {
          lines.push("**Resumo**");
          lines.push("");
          lines.push(session.summary.trim());
          lines.push("");
        }

        if (session.decisions.length > 0) {
          lines.push("**Decisões**");
          lines.push("");
          for (const decision of session.decisions) lines.push(`- ${decision}`);
          lines.push("");
        }

        if (session.actions.length > 0) {
          lines.push("**Ações**");
          lines.push("");
          for (const action of session.actions) {
            const responsible = action.responsible?.trim() || "Não atribuído";
            const deadline = action.deadline?.trim() || "sem prazo";
            lines.push(`- ${responsible}: ${action.task} (${deadline})`);
          }
          lines.push("");
        }

        if (session.pending.length > 0) {
          lines.push("**Pendências**");
          lines.push("");
          for (const item of session.pending) lines.push(`- ${item}`);
          lines.push("");
        }
      }
    }

    return lines.join("\n");
  };

  const handleExport = () => {
    if (filtered.length === 0) {
      toast.error("Não há reuniões no período selecionado para exportar.");
      return;
    }

    const markdown = buildMarkdown();
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().slice(0, 10);
    const link = document.createElement("a");

    link.href = url;
    link.download = `relatorio-reunioes-${period}-${stamp}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success("Relatório .md exportado.");
  };

  const kpis = [
    { label: "Reuniões", value: String(metrics.totalMeetings), icon: Video },
    { label: "Tempo em reunião", value: formatDuration(metrics.totalMs), icon: Clock },
    { label: "Decisões", value: String(metrics.totalDecisions), icon: Gavel },
    { label: "Ações", value: String(metrics.totalActions), icon: ListChecks },
    { label: "Pendências", value: String(metrics.totalPending), icon: CircleDashed },
    {
      label: "Média de ações/reunião",
      value: metrics.averageActions.toFixed(1).replace(".", ","),
      icon: Users,
    },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-white">Relatórios de Sessões</h1>
          <p className="text-white/40 text-sm">
            Indicadores calculados a partir das reuniões salvas na sua conta.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="rounded-full border-white/10 bg-transparent text-white/60 hover:text-white hover:bg-white/5"
          >
            <RefreshCw className={cn("w-4 h-4 mr-2", isFetching && "animate-spin")} />
            Atualizar
          </Button>
          <Button
            onClick={handleExport}
            disabled={isPending || isError || filtered.length === 0}
            className="bg-white hover:bg-white/90 text-black rounded-full font-bold h-11 px-6 disabled:opacity-40"
          >
            <Download className="w-4 h-4 mr-2" /> Exportar relatório (.md)
          </Button>
        </div>
      </div>

      <Card className="p-4 bg-white/[0.02] border-white/5 rounded-2xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-1 bg-white/5 p-1 rounded-full">
            {PERIOD_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setPeriod(option.value)}
                className={cn(
                  "px-4 py-1.5 rounded-full text-xs font-bold transition-all",
                  period === option.value
                    ? "bg-white text-black"
                    : "text-white/40 hover:text-white",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-white/40">
            {isPending
              ? "Carregando reuniões..."
              : isError
                ? "Falha ao carregar os dados."
                : `${filtered.length} de ${sessions.length} ${sessions.length === 1 ? "reunião" : "reuniões"} no período`}
          </p>
        </div>
      </Card>

      {isPending ? (
        <Card className="p-12 bg-white/[0.02] border-white/5 rounded-2xl flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-6 h-6 text-white/40 animate-spin" />
          <p className="text-xs text-white/40">Carregando suas reuniões...</p>
        </Card>
      ) : isError ? (
        <Card className="p-12 bg-white/[0.02] border-white/5 rounded-2xl flex flex-col items-center justify-center text-center space-y-4">
          <div className="w-12 h-12 bg-rose-500/10 rounded-full flex items-center justify-center text-rose-500">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h4 className="font-bold text-sm text-white/60">
              Não foi possível carregar os relatórios
            </h4>
            <p className="text-xs text-white/20 mt-1 max-w-md mx-auto">
              {error instanceof Error ? error.message : "Erro inesperado ao consultar as reuniões."}
            </p>
          </div>
          <Button
            onClick={() => void refetch()}
            className="bg-white hover:bg-white/90 text-black rounded-full font-bold"
          >
            <RefreshCw className="w-4 h-4 mr-2" /> Tentar novamente
          </Button>
        </Card>
      ) : sessions.length === 0 ? (
        <Card className="p-12 bg-white/[0.02] border-white/5 border-dashed rounded-2xl flex flex-col items-center justify-center text-center space-y-4">
          <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center text-white/20">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div>
            <h4 className="font-bold text-sm text-white/60">Nenhuma reunião registrada ainda</h4>
            <p className="text-xs text-white/20 mt-1 max-w-xs mx-auto">
              Inicie uma sessão com o Copilot ao Vivo para que decisões, ações e pendências apareçam
              aqui.
            </p>
          </div>
          <Button asChild className="bg-white hover:bg-white/90 text-black rounded-full font-bold">
            <Link to="/copiloto">Iniciar uma reunião</Link>
          </Button>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {kpis.map((kpi) => (
              <Card key={kpi.label} className="p-6 bg-white/[0.02] border-white/5 rounded-2xl">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/20">
                    {kpi.label}
                  </span>
                  <kpi.icon className="w-4 h-4 text-white/20" />
                </div>
                <p className="text-2xl font-bold text-white">{kpi.value}</p>
              </Card>
            ))}
          </div>

          {filtered.length === 0 ? (
            <Card className="p-12 bg-white/[0.02] border-white/5 border-dashed rounded-2xl flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center text-white/20">
                <BarChart3 className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-white/60">
                  Nenhuma reunião em {selectedPeriod.label.toLowerCase()}
                </h4>
                <p className="text-xs text-white/20 mt-1">
                  Amplie o período para ver as reuniões mais antigas.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => setPeriod("all")}
                className="rounded-full border-white/10 bg-transparent text-white/60 hover:text-white hover:bg-white/5"
              >
                Ver tudo
              </Button>
            </Card>
          ) : (
            <>
              <Card className="bg-white/[0.02] border-white/5 rounded-2xl overflow-hidden">
                <div className="p-6 border-b border-white/5">
                  <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <Users className="w-4 h-4 text-white/40" /> Ações por responsável
                  </h2>
                  <p className="text-xs text-white/40 mt-1">
                    Distribuição das ações registradas em {selectedPeriod.label.toLowerCase()}.
                  </p>
                </div>
                {responsibles.length === 0 ? (
                  <p className="p-6 text-xs text-white/20">
                    Nenhuma ação foi registrada nas reuniões deste período.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/5 text-[10px] uppercase tracking-widest text-white/20">
                          <th className="text-left font-bold px-6 py-3">Responsável</th>
                          <th className="text-right font-bold px-6 py-3">Ações</th>
                          <th className="text-right font-bold px-6 py-3">Reuniões</th>
                          <th className="text-right font-bold px-6 py-3">Prazo mais próximo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {responsibles.map((row) => (
                          <tr
                            key={row.responsible}
                            className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors"
                          >
                            <td className="px-6 py-3 text-white/80">{row.responsible}</td>
                            <td className="px-6 py-3 text-right font-bold text-emerald-500">
                              {row.total}
                            </td>
                            <td className="px-6 py-3 text-right text-white/40">{row.meetings}</td>
                            <td className="px-6 py-3 text-right text-white/40">
                              {row.nextDeadline}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              <Card className="bg-white/[0.02] border-white/5 rounded-2xl overflow-hidden">
                <div className="p-6 border-b border-white/5">
                  <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <Video className="w-4 h-4 text-white/40" /> Reuniões do período
                  </h2>
                  <p className="text-xs text-white/40 mt-1">
                    {filtered.length} {filtered.length === 1 ? "reunião" : "reuniões"} em{" "}
                    {selectedPeriod.label.toLowerCase()}.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/5 text-[10px] uppercase tracking-widest text-white/20">
                        <th className="text-left font-bold px-6 py-3">Reunião</th>
                        <th className="text-left font-bold px-6 py-3">Data</th>
                        <th className="text-right font-bold px-6 py-3">Duração</th>
                        <th className="text-right font-bold px-6 py-3">Decisões</th>
                        <th className="text-right font-bold px-6 py-3">Ações</th>
                        <th className="text-right font-bold px-6 py-3">Pendências</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((session) => (
                        <tr
                          key={session.id}
                          className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors"
                        >
                          <td className="px-6 py-3 text-white/80 max-w-xs truncate">
                            {session.title}
                          </td>
                          <td className="px-6 py-3 text-white/40">
                            {formatDateOnly(session.startTime)}
                          </td>
                          <td className="px-6 py-3 text-right text-white/40">
                            {session.endTime
                              ? formatDuration(sessionDurationMs(session))
                              : "Em aberto"}
                          </td>
                          <td className="px-6 py-3 text-right text-white/60">
                            {session.decisions.length}
                          </td>
                          <td className="px-6 py-3 text-right font-bold text-emerald-500">
                            {session.actions.length}
                          </td>
                          <td className="px-6 py-3 text-right text-white/60">
                            {session.pending.length}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
