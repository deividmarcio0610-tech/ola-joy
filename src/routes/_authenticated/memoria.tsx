import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Search,
  Sparkles,
  Trash2,
  Loader2,
  Database,
  AlertTriangle,
  RefreshCw,
  Plus,
  X,
  Tag,
} from "lucide-react";
import { toast } from "sonner";
import {
  MEMORY_CATEGORIES,
  analyzeMemory,
  deleteMemory,
  listMemories,
  saveMemory,
  type MemoryCategory,
} from "@/lib/memory.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/memoria")({
  component: MemoriaPage,
});

const MEMORIES_QUERY_KEY = ["professional-memories"] as const;

const ALL_CATEGORIES = "TODAS" as const;
type CategoryFilter = typeof ALL_CATEGORIES | MemoryCategory;

const inputClasses =
  "w-full rounded-xl border border-white/5 bg-black/40 px-4 py-2.5 text-[13px] text-white outline-none transition-colors placeholder:text-white/20 focus:border-emerald-500/40";

function formatDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function parseKeywords(raw: string): string[] {
  return raw
    .split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error ?? "Erro desconhecido.");
}

function MemoriaPage() {
  const queryClient = useQueryClient();

  const listMemoriesFn = useServerFn(listMemories);
  const saveMemoryFn = useServerFn(saveMemory);
  const deleteMemoryFn = useServerFn(deleteMemory);
  const analyzeMemoryFn = useServerFn(analyzeMemory);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>(ALL_CATEGORIES);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  // Formulário de criação
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<MemoryCategory>("HISTÓRIA PROFISSIONAL");
  const [summary, setSummary] = useState("");
  const [keywordsText, setKeywordsText] = useState("");

  const memoriesQuery = useQuery({
    queryKey: MEMORIES_QUERY_KEY,
    queryFn: () => listMemoriesFn(),
  });

  const memories = useMemo(() => memoriesQuery.data ?? [], [memoriesQuery.data]);

  const resetForm = () => {
    setContent("");
    setCategory("HISTÓRIA PROFISSIONAL");
    setSummary("");
    setKeywordsText("");
  };

  const analyzeMutation = useMutation({
    mutationFn: (text: string) => analyzeMemoryFn({ data: { content: text } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error("Não foi possível analisar com IA.", {
          description: `${result.error} Escolha a categoria manualmente e salve normalmente.`,
        });
        return;
      }
      setCategory(result.category);
      setSummary(result.summary);
      setKeywordsText(result.keywords.join(", "));
      toast.success("Análise concluída.", {
        description: "Revise categoria, resumo e palavras-chave antes de salvar.",
      });
    },
    onError: (error) => {
      toast.error("Falha ao analisar o texto.", { description: errorMessage(error) });
    },
  });

  const saveMutation = useMutation({
    mutationFn: (input: {
      category: MemoryCategory;
      content: string;
      summary: string;
      keywords: string[];
    }) => saveMemoryFn({ data: input }),
    onSuccess: async () => {
      resetForm();
      await queryClient.invalidateQueries({ queryKey: MEMORIES_QUERY_KEY });
      toast.success("Memória salva.");
    },
    onError: (error) => {
      toast.error("Falha ao salvar a memória.", { description: errorMessage(error) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMemoryFn({ data: { id } }),
    onSuccess: async () => {
      setConfirmingId(null);
      await queryClient.invalidateQueries({ queryKey: MEMORIES_QUERY_KEY });
      toast.success("Memória excluída.");
    },
    onError: (error) => {
      toast.error("Falha ao excluir a memória.", { description: errorMessage(error) });
    },
  });

  const filteredMemories = useMemo(() => {
    const term = search.trim().toLowerCase();
    return memories.filter((memory) => {
      if (categoryFilter !== ALL_CATEGORIES && memory.category !== categoryFilter) return false;
      if (!term) return true;
      return (
        memory.content.toLowerCase().includes(term) ||
        memory.summary.toLowerCase().includes(term) ||
        memory.category.toLowerCase().includes(term) ||
        memory.keywords.some((keyword) => keyword.toLowerCase().includes(term))
      );
    });
  }, [memories, search, categoryFilter]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const memory of memories) {
      counts.set(memory.category, (counts.get(memory.category) ?? 0) + 1);
    }
    return counts;
  }, [memories]);

  const handleAnalyze = () => {
    const text = content.trim();
    if (text.length < 10) {
      toast.error("Escreva pelo menos 10 caracteres para a IA analisar.");
      return;
    }
    analyzeMutation.mutate(text);
  };

  const handleSave = () => {
    const text = content.trim();
    if (!text) {
      toast.error("Escreva o conteúdo da memória antes de salvar.");
      return;
    }
    saveMutation.mutate({
      category,
      content: text,
      summary: summary.trim(),
      keywords: parseKeywords(keywordsText),
    });
  };

  const hasActiveFilters = search.trim() !== "" || categoryFilter !== ALL_CATEGORIES;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-white">Gerenciador de Memória</h1>
        <p className="text-sm text-white/40">
          Sua base de conhecimento profissional. O copiloto usa estas memórias para responder como
          você.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* ------------------------------- Lista ------------------------------- */}
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/20" />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por conteúdo, resumo, categoria ou palavra-chave..."
                className={cn(inputClasses, "pl-10")}
                aria-label="Buscar memórias"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Limpar busca"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 transition-colors hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 text-[11px] font-bold text-white/40">
              <Database className="h-3.5 w-3.5" />
              {filteredMemories.length} de {memories.length}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCategoryFilter(ALL_CATEGORIES)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors",
                categoryFilter === ALL_CATEGORIES
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                  : "border-white/5 text-white/40 hover:border-white/10 hover:text-white",
              )}
            >
              Todas ({memories.length})
            </button>
            {MEMORY_CATEGORIES.map((item) => {
              const count = categoryCounts.get(item) ?? 0;
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => setCategoryFilter(item)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors",
                    categoryFilter === item
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                      : "border-white/5 text-white/40 hover:border-white/10 hover:text-white",
                    count === 0 && categoryFilter !== item && "opacity-40",
                  )}
                >
                  {item} ({count})
                </button>
              );
            })}
          </div>

          {memoriesQuery.isPending && (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] p-16">
              <Loader2 className="h-5 w-5 animate-spin text-white/40" />
              <p className="text-[11px] font-bold uppercase tracking-widest text-white/20">
                Carregando memórias...
              </p>
            </div>
          )}

          {memoriesQuery.isError && (
            <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-rose-500/20 bg-rose-500/[0.04] p-12 text-center">
              <AlertTriangle className="h-6 w-6 text-rose-500" />
              <div className="space-y-1">
                <p className="text-sm font-bold text-white">
                  Não foi possível carregar sua memória
                </p>
                <p className="max-w-md text-[11px] text-white/40">
                  {errorMessage(memoriesQuery.error)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void memoriesQuery.refetch()}
                disabled={memoriesQuery.isFetching}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-white/10 px-6 text-[11px] font-bold text-white/60 transition-colors hover:text-white disabled:opacity-40"
              >
                <RefreshCw
                  className={cn("h-3.5 w-3.5", memoriesQuery.isFetching && "animate-spin")}
                />
                TENTAR NOVAMENTE
              </button>
            </div>
          )}

          {memoriesQuery.isSuccess && memories.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-white/5 bg-white/[0.02] p-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5 text-white/20">
                <Database className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-white/60">Sua memória está vazia</p>
                <p className="mx-auto max-w-xs text-[11px] text-white/20">
                  Registre experiências, projetos e competências no painel ao lado. A IA organiza
                  tudo para você.
                </p>
              </div>
            </div>
          )}

          {memoriesQuery.isSuccess && memories.length > 0 && filteredMemories.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-white/5 bg-white/[0.02] p-16 text-center">
              <Search className="h-6 w-6 text-white/20" />
              <p className="text-sm font-bold text-white/60">Nenhuma memória encontrada</p>
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setCategoryFilter(ALL_CATEGORIES);
                }}
                className="inline-flex h-9 items-center gap-2 rounded-full border border-white/10 px-5 text-[11px] font-bold text-white/60 transition-colors hover:text-white"
              >
                LIMPAR FILTROS
              </button>
            </div>
          )}

          {filteredMemories.length > 0 && (
            <div className="space-y-3">
              {filteredMemories.map((memory) => {
                const isConfirming = confirmingId === memory.id;
                const isDeleting =
                  deleteMutation.isPending && deleteMutation.variables === memory.id;

                return (
                  <div
                    key={memory.id}
                    className="space-y-3 rounded-2xl border border-white/5 bg-white/[0.02] p-5 transition-colors hover:bg-white/[0.04]"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[9px] font-bold uppercase tracking-widest text-emerald-400">
                          {memory.category}
                        </span>
                        <span className="text-[10px] text-white/20">
                          {formatDate(memory.createdAt)}
                        </span>
                      </div>

                      {isConfirming ? (
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            onClick={() => deleteMutation.mutate(memory.id)}
                            disabled={isDeleting}
                            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-rose-500 px-4 text-[10px] font-bold text-white transition-colors hover:bg-rose-500/90 disabled:opacity-50"
                          >
                            {isDeleting ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="h-3 w-3" />
                            )}
                            CONFIRMAR
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmingId(null)}
                            disabled={isDeleting}
                            className="inline-flex h-8 items-center rounded-full border border-white/10 px-4 text-[10px] font-bold text-white/40 transition-colors hover:text-white disabled:opacity-50"
                          >
                            CANCELAR
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmingId(memory.id)}
                          aria-label="Excluir memória"
                          title="Excluir memória"
                          className="shrink-0 text-white/20 transition-colors hover:text-rose-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    {memory.summary && (
                      <p className="text-[13px] font-bold leading-relaxed text-white">
                        {memory.summary}
                      </p>
                    )}

                    <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-white/40">
                      {memory.content}
                    </p>

                    {memory.keywords.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <Tag className="h-3 w-3 text-white/20" />
                        {memory.keywords.map((keyword) => (
                          <span
                            key={keyword}
                            className="rounded-md border border-white/5 bg-white/5 px-2 py-0.5 text-[10px] text-white/40"
                          >
                            {keyword}
                          </span>
                        ))}
                      </div>
                    )}

                    {isConfirming && (
                      <p className="text-[10px] font-bold uppercase tracking-widest text-rose-400">
                        Esta ação não pode ser desfeita.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ------------------------------ Formulário ---------------------------- */}
        <div className="space-y-4 lg:sticky lg:top-0 lg:self-start">
          <div className="space-y-4 rounded-2xl border border-white/5 bg-white/[0.02] p-6">
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-white/40" />
              <h2 className="text-sm font-bold text-white">Nova memória</h2>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="memory-content"
                className="text-[10px] font-bold uppercase tracking-widest text-white/20"
              >
                Conteúdo
              </label>
              <textarea
                id="memory-content"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="Ex.: Liderei a migração do sistema de manutenção da mina para SAP PM, reduzindo em 30% o tempo de parada."
                className={cn(inputClasses, "min-h-[140px] resize-y leading-relaxed")}
              />
              <p className="text-[10px] text-white/20">{content.trim().length} caracteres</p>
            </div>

            <button
              type="button"
              onClick={handleAnalyze}
              disabled={analyzeMutation.isPending || content.trim().length < 10}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-[11px] font-bold text-emerald-400 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {analyzeMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {analyzeMutation.isPending ? "ANALISANDO..." : "ANALISAR COM IA"}
            </button>

            <div className="space-y-2">
              <label
                htmlFor="memory-category"
                className="text-[10px] font-bold uppercase tracking-widest text-white/20"
              >
                Categoria
              </label>
              <select
                id="memory-category"
                value={category}
                onChange={(event) => setCategory(event.target.value as MemoryCategory)}
                className={cn(inputClasses, "cursor-pointer appearance-none")}
              >
                {MEMORY_CATEGORIES.map((item) => (
                  <option key={item} value={item} className="bg-[#0A0A0A] text-white">
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="memory-summary"
                className="text-[10px] font-bold uppercase tracking-widest text-white/20"
              >
                Resumo
              </label>
              <input
                id="memory-summary"
                type="text"
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                placeholder="Uma frase que identifica esta memória"
                className={inputClasses}
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="memory-keywords"
                className="text-[10px] font-bold uppercase tracking-widest text-white/20"
              >
                Palavras-chave
              </label>
              <input
                id="memory-keywords"
                type="text"
                value={keywordsText}
                onChange={(event) => setKeywordsText(event.target.value)}
                placeholder="separadas, por, vírgula"
                className={inputClasses}
              />
              {parseKeywords(keywordsText).length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {parseKeywords(keywordsText).map((keyword) => (
                    <span
                      key={keyword}
                      className="rounded-md border border-white/5 bg-white/5 px-2 py-0.5 text-[10px] text-white/40"
                    >
                      {keyword}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleSave}
                disabled={saveMutation.isPending || !content.trim()}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-white text-[11px] font-bold text-black transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-30"
              >
                {saveMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {saveMutation.isPending ? "SALVANDO..." : "SALVAR MEMÓRIA"}
              </button>
              <button
                type="button"
                onClick={resetForm}
                disabled={saveMutation.isPending}
                className="inline-flex h-11 items-center rounded-full border border-white/10 px-5 text-[11px] font-bold text-white/40 transition-colors hover:text-white disabled:opacity-40"
              >
                LIMPAR
              </button>
            </div>

            <p className="text-[10px] leading-relaxed text-white/20">
              A análise da IA é opcional: se ela estiver indisponível, escolha a categoria e salve
              manualmente.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
