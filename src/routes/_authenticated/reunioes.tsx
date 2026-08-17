import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Video,
  Plus,
  Search,
  Clock,
  FileText,
  Trash2,
  Loader2,
  ListChecks,
  AlertTriangle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  deleteMeetingSession,
  listMeetingSessions,
  type MeetingSession,
} from "@/lib/meetings.functions";

export const Route = createFileRoute("/_authenticated/reunioes")({
  component: ReunioesPage,
});

type Filter = "todas" | "concluidas" | "em-andamento";

function formatDuration(session: MeetingSession): string {
  if (!session.endTime) return "Em andamento";
  const ms = new Date(session.endTime).getTime() - new Date(session.startTime).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}min`;
}

function ReunioesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("todas");
  const [query, setQuery] = useState("");

  const listFn = useServerFn(listMeetingSessions);
  const deleteFn = useServerFn(deleteMeetingSession);

  const sessionsQuery = useQuery({
    queryKey: ["meeting-sessions"],
    queryFn: () => listFn(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Reunião excluída.");
      queryClient.invalidateQueries({ queryKey: ["meeting-sessions"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const sessions = useMemo(() => {
    const all = sessionsQuery.data ?? [];
    const term = query.trim().toLowerCase();

    return all
      .filter((session) => {
        if (filter === "concluidas") return Boolean(session.endTime);
        if (filter === "em-andamento") return !session.endTime;
        return true;
      })
      .filter((session) => (term ? session.title.toLowerCase().includes(term) : true));
  }, [sessionsQuery.data, filter, query]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Reuniões</h1>
          <p className="text-white/40">Tudo que o copiloto transcreveu e organizou para você.</p>
        </div>
        <Button
          onClick={() => navigate({ to: "/copiloto" })}
          className="bg-white text-black hover:bg-white/90 rounded-full font-bold px-6"
        >
          <Plus className="w-4 h-4 mr-2" /> NOVA REUNIÃO
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
          <TabsList className="bg-white/5 border border-white/5">
            <TabsTrigger value="todas" className="text-[10px] font-bold uppercase">
              Todas
            </TabsTrigger>
            <TabsTrigger value="em-andamento" className="text-[10px] font-bold uppercase">
              Em andamento
            </TabsTrigger>
            <TabsTrigger value="concluidas" className="text-[10px] font-bold uppercase">
              Concluídas
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrar reuniões..."
            className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/20"
          />
        </div>
      </div>

      {sessionsQuery.isLoading && (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-white/20" />
        </div>
      )}

      {sessionsQuery.isError && (
        <Card className="p-6 border-rose-500/20 bg-rose-500/5">
          <p className="text-sm text-rose-400">{(sessionsQuery.error as Error).message}</p>
        </Card>
      )}

      {!sessionsQuery.isLoading && !sessionsQuery.isError && sessions.length === 0 && (
        <Card className="p-12 border-white/5 bg-white/[0.02] text-center space-y-4">
          <Video className="w-12 h-12 text-white/10 mx-auto" />
          <p className="text-sm text-white/40">
            {query || filter !== "todas"
              ? "Nenhuma reunião corresponde ao filtro."
              : "Nenhuma reunião registrada ainda."}
          </p>
          <Link
            to="/copiloto"
            className="inline-flex items-center justify-center rounded-full bg-white px-6 py-2 text-xs font-bold text-black hover:bg-white/90"
          >
            INICIAR COPILOT
          </Link>
        </Card>
      )}

      <div className="space-y-3">
        {sessions.map((session) => (
          <Card
            key={session.id}
            className="p-5 border-white/5 bg-white/[0.02] hover:bg-white/5 transition-colors"
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-2 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-white truncate">{session.title}</h3>
                  <Badge
                    variant="outline"
                    className={
                      session.endTime
                        ? "border-white/10 bg-white/5 text-[9px] font-bold text-white/60"
                        : "border-emerald-500/30 bg-emerald-500/10 text-[9px] font-bold text-emerald-500"
                    }
                  >
                    {session.endTime ? "CONCLUÍDA" : "EM ANDAMENTO"}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-white/20">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(session.startTime).toLocaleString("pt-BR")}
                  </span>
                  <span>{formatDuration(session)}</span>
                  <span className="flex items-center gap-1">
                    <ListChecks className="w-3 h-3" /> {session.actions.length} ações
                  </span>
                  <span className="flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> {session.pending.length} pendências
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Link
                  to="/atas"
                  search={{ id: session.id }}
                  className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-[10px] font-bold uppercase text-white/60 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <FileText className="w-3 h-3 mr-1" /> Ver ata
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Excluir reunião"
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Excluir a reunião "${session.title}"? Esta ação não pode ser desfeita.`,
                      )
                    ) {
                      deleteMutation.mutate(session.id);
                    }
                  }}
                  className="text-white/20 hover:text-rose-500"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
