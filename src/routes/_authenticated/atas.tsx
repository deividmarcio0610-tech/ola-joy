import { createFileRoute, Link } from "@tanstack/react-router";
import {
  FileText,
  Search,
  Loader2,
  CheckCircle2,
  ListChecks,
  AlertTriangle,
  Copy,
  Download,
  Trash2,
  Pencil,
  Save,
  X,
  Clock,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  deleteMeetingSession,
  listMeetingSessions,
  saveMeetingSession,
  type MeetingSession,
} from "@/lib/meetings.functions";

export const Route = createFileRoute("/_authenticated/atas")({
  validateSearch: (search: Record<string, unknown>): { id?: string } => ({
    id: typeof search.id === "string" ? search.id : undefined,
  }),
  component: AtasPage,
});

function buildMarkdown(session: MeetingSession): string {
  const lines: string[] = [
    `# ${session.title}`,
    "",
    `Data: ${new Date(session.startTime).toLocaleString("pt-BR")}`,
    "",
  ];

  if (session.summary) lines.push("## Resumo", "", session.summary, "");

  if (session.decisions.length) {
    lines.push("## Decisões", "");
    session.decisions.forEach((decision) => lines.push(`- ${decision}`));
    lines.push("");
  }

  if (session.actions.length) {
    lines.push("## Plano de ação", "", "| Responsável | Tarefa | Prazo |", "| --- | --- | --- |");
    session.actions.forEach((action) =>
      lines.push(`| ${action.responsible} | ${action.task} | ${action.deadline} |`),
    );
    lines.push("");
  }

  if (session.pending.length) {
    lines.push("## Pendências", "");
    session.pending.forEach((item) => lines.push(`- ${item}`));
    lines.push("");
  }

  if (session.transcription.length) {
    lines.push("## Transcrição", "");
    session.transcription.forEach((block) =>
      lines.push(`**${block.timestamp} — ${block.speaker}:** ${block.text}`, ""),
    );
  }

  return lines.join("\n");
}

function downloadMarkdown(session: MeetingSession) {
  const blob = new Blob([buildMarkdown(session)], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${session.title.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase()}.md`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function AtasPage() {
  const { id: initialId } = Route.useSearch();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(initialId ?? null);
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftSummary, setDraftSummary] = useState("");

  const listFn = useServerFn(listMeetingSessions);
  const saveFn = useServerFn(saveMeetingSession);
  const deleteFn = useServerFn(deleteMeetingSession);

  const sessionsQuery = useQuery({
    queryKey: ["meeting-sessions"],
    queryFn: () => listFn(),
  });

  const sessions = sessionsQuery.data ?? [];

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return sessions;
    return sessions.filter(
      (session) =>
        session.title.toLowerCase().includes(term) || session.summary.toLowerCase().includes(term),
    );
  }, [sessions, query]);

  const selected = useMemo(
    () => sessions.find((session) => session.id === selectedId) ?? filtered[0] ?? null,
    [sessions, filtered, selectedId],
  );

  useEffect(() => {
    if (selected) {
      setDraftTitle(selected.title);
      setDraftSummary(selected.summary);
    }
  }, [selected]);

  const saveMutation = useMutation({
    mutationFn: (session: MeetingSession) =>
      saveFn({
        data: {
          id: session.id,
          title: draftTitle.trim() || session.title,
          startTime: session.startTime,
          endTime: session.endTime,
          transcription: session.transcription,
          decisions: session.decisions,
          actions: session.actions,
          pending: session.pending,
          summary: draftSummary,
          metadata: session.metadata,
        },
      }),
    onSuccess: () => {
      toast.success("Ata atualizada.");
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ["meeting-sessions"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Ata excluída.");
      setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: ["meeting-sessions"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const handleCopy = async (session: MeetingSession) => {
    try {
      await navigator.clipboard.writeText(buildMarkdown(session));
      toast.success("Ata copiada para a área de transferência.");
    } catch {
      toast.error("Não foi possível copiar. Verifique as permissões do navegador.");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Atas e Ações</h1>
        <p className="text-white/40">Geradas a partir das transcrições reais das suas reuniões.</p>
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
          <FileText className="w-12 h-12 text-white/10 mx-auto" />
          <p className="text-sm text-white/40">
            Nenhuma ata ainda. Ao finalizar uma reunião no copiloto, a ata é gerada e salva aqui.
          </p>
          <Link
            to="/copiloto"
            className="inline-flex items-center justify-center rounded-full bg-white px-6 py-2 text-xs font-bold text-black hover:bg-white/90"
          >
            INICIAR COPILOT
          </Link>
        </Card>
      )}

      {sessions.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <Card className="lg:col-span-4 p-4 border-white/5 bg-white/[0.02] flex flex-col max-h-[70vh]">
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar ata..."
                className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/20"
              />
            </div>

            <ScrollArea className="flex-1 -mr-2 pr-2">
              <div className="space-y-2">
                {filtered.map((session) => (
                  <button
                    key={session.id}
                    onClick={() => {
                      setSelectedId(session.id);
                      setIsEditing(false);
                    }}
                    className={cn(
                      "w-full text-left p-3 rounded-xl border transition-colors",
                      selected?.id === session.id
                        ? "border-white/20 bg-white/10"
                        : "border-white/5 bg-white/[0.02] hover:bg-white/5",
                    )}
                  >
                    <p className="text-sm font-bold text-white truncate">{session.title}</p>
                    <p className="text-[10px] text-white/20 flex items-center gap-1 mt-1">
                      <Clock className="w-3 h-3" />
                      {new Date(session.startTime).toLocaleDateString("pt-BR")}
                    </p>
                  </button>
                ))}
                {filtered.length === 0 && (
                  <p className="py-10 text-center text-[10px] font-bold uppercase tracking-widest text-white/20">
                    Nada encontrado.
                  </p>
                )}
              </div>
            </ScrollArea>
          </Card>

          {selected && (
            <Card className="lg:col-span-8 p-6 border-white/5 bg-[#0A0A0A] space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2 flex-1 min-w-0">
                  {isEditing ? (
                    <Input
                      value={draftTitle}
                      onChange={(e) => setDraftTitle(e.target.value)}
                      className="bg-white/5 border-white/10 text-white text-lg font-bold"
                    />
                  ) : (
                    <h2 className="text-xl font-bold text-white">{selected.title}</h2>
                  )}
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/20">
                    {new Date(selected.startTime).toLocaleString("pt-BR")}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {isEditing ? (
                    <>
                      <Button
                        size="sm"
                        onClick={() => saveMutation.mutate(selected)}
                        disabled={saveMutation.isPending}
                        className="rounded-full bg-emerald-500 text-black hover:bg-emerald-400 text-[10px] font-bold"
                      >
                        {saveMutation.isPending ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <>
                            <Save className="w-3 h-3 mr-1" /> SALVAR
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setIsEditing(false);
                          setDraftTitle(selected.title);
                          setDraftSummary(selected.summary);
                        }}
                        className="rounded-full text-[10px] font-bold text-white/40"
                      >
                        <X className="w-3 h-3 mr-1" /> CANCELAR
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIsEditing(true)}
                        className="rounded-full border-white/10 text-[10px] font-bold text-white/60"
                      >
                        <Pencil className="w-3 h-3 mr-1" /> EDITAR
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCopy(selected)}
                        className="rounded-full border-white/10 text-[10px] font-bold text-white/60"
                      >
                        <Copy className="w-3 h-3 mr-1" /> COPIAR
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => downloadMarkdown(selected)}
                        className="rounded-full border-white/10 text-[10px] font-bold text-white/60"
                      >
                        <Download className="w-3 h-3 mr-1" /> BAIXAR .MD
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={deleteMutation.isPending}
                        onClick={() => {
                          if (window.confirm(`Excluir a ata "${selected.title}"?`)) {
                            deleteMutation.mutate(selected.id);
                          }
                        }}
                        className="rounded-full border-rose-500/20 text-[10px] font-bold text-rose-500 hover:bg-rose-500/10"
                      >
                        <Trash2 className="w-3 h-3 mr-1" /> EXCLUIR
                      </Button>
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                  Resumo
                </h3>
                {isEditing ? (
                  <Textarea
                    value={draftSummary}
                    onChange={(e) => setDraftSummary(e.target.value)}
                    className="bg-white/5 border-white/10 text-sm text-white min-h-[120px]"
                  />
                ) : (
                  <p className="text-sm text-white/60 leading-relaxed">
                    {selected.summary || "Sem resumo registrado."}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                  Decisões
                </h3>
                {selected.decisions.length === 0 && (
                  <p className="text-xs text-white/20">Nenhuma decisão registrada.</p>
                )}
                {selected.decisions.map((decision, index) => (
                  <div
                    key={index}
                    className="p-3 bg-blue-500/5 border border-blue-500/10 rounded-xl flex items-start gap-3"
                  >
                    <CheckCircle2 size={14} className="text-blue-500 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-white/80">{decision}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                  Plano de ação
                </h3>
                {selected.actions.length === 0 && (
                  <p className="text-xs text-white/20">Nenhuma ação definida.</p>
                )}
                {selected.actions.map((action, index) => (
                  <div
                    key={index}
                    className="p-3 bg-purple-500/5 border border-purple-500/10 rounded-xl space-y-1"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-purple-400">
                        <ListChecks className="w-3 h-3 inline mr-1" />
                        {action.responsible}
                      </span>
                      <span className="text-[9px] text-white/20">Prazo: {action.deadline}</span>
                    </div>
                    <p className="text-xs text-white/80 font-bold">{action.task}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                  Pendências
                </h3>
                {selected.pending.length === 0 && (
                  <p className="text-xs text-white/20">Sem pendências registradas.</p>
                )}
                {selected.pending.map((item, index) => (
                  <div
                    key={index}
                    className="p-3 bg-yellow-500/5 border border-yellow-500/10 rounded-xl flex items-start gap-3"
                  >
                    <AlertTriangle size={14} className="text-yellow-500 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-white/80">{item}</p>
                  </div>
                ))}
              </div>

              {selected.transcription.length > 0 && (
                <details className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                  <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-widest text-white/40">
                    Transcrição completa ({selected.transcription.length} blocos)
                  </summary>
                  <div className="mt-4 space-y-3 max-h-80 overflow-y-auto">
                    {selected.transcription.map((block) => (
                      <div key={block.id} className="space-y-1">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-white/20">
                          {block.timestamp} · {block.speaker}
                        </p>
                        <p className="text-xs text-white/60">{block.text}</p>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
