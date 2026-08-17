import { createFileRoute, Link } from "@tanstack/react-router";
import { Brain, Sparkles, Loader2, Save, X, Database, Tag } from "lucide-react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { APP_CONFIG } from "@/lib/app-config";
import {
  analyzeMemory,
  listMemories,
  saveMemory,
  MEMORY_CATEGORIES,
  type MemoryCategory,
} from "@/lib/memory.functions";

export const Route = createFileRoute("/_authenticated/minha-ia")({
  component: MinhaIAPage,
});

interface DraftMemory {
  category: MemoryCategory;
  content: string;
  summary: string;
  keywords: string[];
}

function MinhaIAPage() {
  const queryClient = useQueryClient();
  const [userInput, setUserInput] = useState("");
  const [draft, setDraft] = useState<DraftMemory | null>(null);

  const listMemoriesFn = useServerFn(listMemories);
  const analyzeMemoryFn = useServerFn(analyzeMemory);
  const saveMemoryFn = useServerFn(saveMemory);

  const memoriesQuery = useQuery({
    queryKey: ["memories"],
    queryFn: () => listMemoriesFn(),
  });

  const analyzeMutation = useMutation({
    mutationFn: (content: string) => analyzeMemoryFn({ data: { content } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.error);
        // Sem IA o usuário ainda consegue registrar: entra em edição manual.
        setDraft({
          category: "HISTÓRIA PROFISSIONAL",
          content: userInput.trim(),
          summary: "",
          keywords: [],
        });
        return;
      }
      setDraft({
        category: result.category,
        content: userInput.trim(),
        summary: result.summary,
        keywords: result.keywords,
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveMutation = useMutation({
    mutationFn: (memory: DraftMemory) =>
      saveMemoryFn({
        data: {
          category: memory.category,
          content: memory.content,
          summary: memory.summary,
          keywords: memory.keywords,
        },
      }),
    onSuccess: () => {
      toast.success("Memória profissional salva.");
      setDraft(null);
      setUserInput("");
      queryClient.invalidateQueries({ queryKey: ["memories"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const memories = memoriesQuery.data ?? [];

  return (
    <div className="flex flex-col h-full space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Minha IA Profissional</h1>
        <p className="text-white/40">
          Alimente a memória que o {APP_CONFIG.name} usa para sugerir suas respostas nas reuniões.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 overflow-hidden">
        <div className="lg:col-span-7 flex flex-col space-y-6 h-full overflow-hidden">
          <Card className="p-6 border-white/5 space-y-6 bg-white/[0.02] flex flex-col">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-white/40" />
              <h2 className="text-lg font-bold text-white">O que você fez ou aprendeu?</h2>
            </div>

            <Textarea
              placeholder="Ex.: Liderei a migração do banco na TechX usando Python e AWS, reduzindo a latência em 40%."
              className="min-h-[180px] bg-white/5 border-white/10 text-base p-4 resize-none text-white placeholder:text-white/20"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
            />

            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/20">
                {userInput.trim().length} caracteres
              </span>
              <Button
                onClick={() => analyzeMutation.mutate(userInput.trim())}
                disabled={userInput.trim().length < 10 || analyzeMutation.isPending}
                className="bg-white text-black hover:bg-white/90 rounded-full font-bold px-6"
              >
                {analyzeMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> ANALISANDO...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" /> ANALISAR COM IA
                  </>
                )}
              </Button>
            </div>
          </Card>

          {draft && (
            <Card className="p-6 border-emerald-500/20 bg-emerald-500/5 space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">Revise antes de salvar</h3>
                <button
                  onClick={() => setDraft(null)}
                  title="Descartar análise"
                  className="text-white/20 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="memory-category"
                  className="text-[10px] font-bold uppercase tracking-widest text-white/40"
                >
                  Categoria
                </label>
                <select
                  id="memory-category"
                  value={draft.category}
                  onChange={(e) =>
                    setDraft({ ...draft, category: e.target.value as MemoryCategory })
                  }
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-white/20"
                >
                  {MEMORY_CATEGORIES.map((category) => (
                    <option key={category} value={category} className="bg-black">
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="memory-summary"
                  className="text-[10px] font-bold uppercase tracking-widest text-white/40"
                >
                  Resumo
                </label>
                <Textarea
                  id="memory-summary"
                  value={draft.summary}
                  onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
                  placeholder="Uma frase que resume este registro."
                  className="bg-white/5 border-white/10 text-sm text-white resize-none min-h-[70px]"
                />
              </div>

              {draft.keywords.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {draft.keywords.map((keyword) => (
                    <Badge
                      key={keyword}
                      variant="outline"
                      className="border-white/10 bg-white/5 text-[10px] text-white/60"
                    >
                      <Tag className="w-2.5 h-2.5 mr-1" />
                      {keyword}
                    </Badge>
                  ))}
                </div>
              )}

              <Button
                onClick={() => saveMutation.mutate(draft)}
                disabled={saveMutation.isPending}
                className="w-full bg-emerald-500 text-black hover:bg-emerald-400 rounded-full font-bold"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" /> SALVAR NA MEMÓRIA
                  </>
                )}
              </Button>
            </Card>
          )}
        </div>

        <div className="lg:col-span-5 h-full overflow-hidden">
          <Card className="p-6 border-white/5 bg-white/[0.02] h-full flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-white/40" />
                <h2 className="text-sm font-bold text-white">Memória Profissional</h2>
              </div>
              <Link
                to="/memoria"
                className="text-[10px] font-bold uppercase text-white/40 hover:text-white"
              >
                Gerenciar
              </Link>
            </div>

            <ScrollArea className="flex-1 -mr-4 pr-4">
              {memoriesQuery.isLoading && (
                <div className="flex items-center justify-center py-16 text-white/20">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              )}

              {memoriesQuery.isError && (
                <p className="py-16 text-center text-xs text-rose-400">
                  {(memoriesQuery.error as Error).message}
                </p>
              )}

              {!memoriesQuery.isLoading && !memoriesQuery.isError && memories.length === 0 && (
                <p className="py-16 text-center text-[10px] font-bold uppercase tracking-widest text-white/20">
                  Sua memória está vazia.
                </p>
              )}

              <div className="space-y-3">
                {memories.map((memory) => (
                  <div
                    key={memory.id}
                    className="p-3 rounded-xl border border-white/5 bg-white/[0.02] space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <Badge className="bg-white/10 text-white text-[9px] font-bold">
                        {memory.category}
                      </Badge>
                      <span className="text-[9px] text-white/20">
                        {new Date(memory.createdAt).toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                    <p className="text-xs text-white/60 line-clamp-3">
                      {memory.summary || memory.content}
                    </p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </Card>
        </div>
      </div>
    </div>
  );
}
