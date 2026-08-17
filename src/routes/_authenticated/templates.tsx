import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Sparkles,
  Plus,
  Search,
  Copy,
  Pencil,
  CopyPlus,
  Trash2,
  FileText,
  RotateCcw,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/templates")({
  component: TemplatesPage,
});

const STORAGE_KEY = "deividtech:templates";

interface AgendaTemplate {
  id: string;
  title: string;
  description: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

const DEFAULT_TEMPLATES: ReadonlyArray<Pick<AgendaTemplate, "title" | "description" | "body">> = [
  {
    title: "Reunião de Alinhamento Semanal",
    description: "Ritual de time para revisar entregas da semana, riscos e prioridades.",
    body: `PAUTA — REUNIÃO DE ALINHAMENTO SEMANAL
Duração sugerida: 30 minutos

1. Abertura (3 min)
   - Objetivo do encontro e resultado esperado
   - Confirmação dos participantes presentes

2. Revisão da semana anterior (8 min)
   - O que foi concluído
   - O que ficou pendente e por quê
   - Ações combinadas na última reunião: status de cada uma

3. Indicadores e riscos (7 min)
   - Números que mudaram desde a última reunião
   - Bloqueios ativos e quem depende de quem
   - Riscos novos identificados

4. Prioridades da próxima semana (8 min)
   - Top 3 entregas por responsável
   - Prazos comprometidos
   - Recursos ou aprovações necessárias

5. Encerramento (4 min)
   - Decisões tomadas
   - Ações com responsável e prazo
   - Pendências levadas para a próxima reunião

DECISÕES
-

AÇÕES (responsável — tarefa — prazo)
-

PENDÊNCIAS
-`,
  },
  {
    title: "Reunião Técnica de Projeto",
    description:
      "Discussão de arquitetura, débito técnico e plano de entrega com o time de engenharia.",
    body: `PAUTA — REUNIÃO TÉCNICA DE PROJETO
Duração sugerida: 60 minutos

1. Contexto (5 min)
   - Problema técnico em pauta
   - Restrições de prazo, custo e time

2. Situação atual da arquitetura (10 min)
   - Componentes envolvidos
   - Pontos de acoplamento e gargalos conhecidos
   - Métricas de performance e erros recentes

3. Alternativas de solução (20 min)
   - Opção A: escopo, esforço, riscos
   - Opção B: escopo, esforço, riscos
   - Critérios de comparação (custo, prazo, manutenção, risco)

4. Débito técnico (10 min)
   - Itens críticos que precisam entrar no roadmap
   - Impacto de adiar cada item

5. Plano de entrega (10 min)
   - Divisão em etapas verificáveis
   - Responsáveis por etapa
   - Critérios de aceite e plano de rollback

6. Encerramento (5 min)
   - Decisão técnica registrada e justificada
   - Ações com responsável e prazo
   - Assuntos que ficam para uma próxima sessão

DECISÕES
-

AÇÕES (responsável — tarefa — prazo)
-

PENDÊNCIAS
-`,
  },
  {
    title: "Entrevista de Contratação",
    description:
      "Roteiro estruturado com perguntas comportamentais e técnicas para avaliação de candidatos.",
    body: `ROTEIRO — ENTREVISTA DE CONTRATAÇÃO
Duração sugerida: 45 minutos

1. Abertura (5 min)
   - Apresentação do entrevistador e da empresa
   - Explicação do formato da conversa e das próximas etapas

2. Trajetória do candidato (10 min)
   - Resumo da carreira em até 3 minutos
   - Motivo da mudança e expectativas
   - Principal entrega dos últimos 12 meses

3. Perguntas comportamentais — formato STAR (15 min)
   - Conte uma situação em que você discordou de uma decisão do time. O que você fez?
   - Descreva um projeto que atrasou. Qual foi sua parte no problema e na solução?
   - Fale de uma vez em que você precisou aprender algo novo sob pressão.

4. Avaliação técnica (10 min)
   - Pergunta prática sobre o dia a dia da vaga
   - Como o candidato explica uma decisão técnica para alguém não técnico
   - Ferramentas e rotinas de trabalho

5. Perguntas do candidato (3 min)

6. Encerramento (2 min)
   - Próximos passos e prazo de retorno

AVALIAÇÃO (1 a 5)
- Comunicação:
- Conhecimento técnico:
- Autonomia:
- Aderência cultural:

DECISÕES
-

AÇÕES (responsável — tarefa — prazo)
-

PENDÊNCIAS
-`,
  },
];

function seedTemplates(): AgendaTemplate[] {
  const now = new Date().toISOString();
  return DEFAULT_TEMPLATES.map((template) => ({
    id: createId(),
    title: template.title,
    description: template.description,
    body: template.body,
    createdAt: now,
    updatedAt: now,
  }));
}

function isTemplate(value: unknown): value is AgendaTemplate {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.description === "string" &&
    typeof candidate.body === "string"
  );
}

function readStoredTemplates(): AgendaTemplate[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      const seeded = seedTemplates();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(isTemplate).map((template) => ({
      ...template,
      createdAt: template.createdAt ?? new Date().toISOString(),
      updatedAt: template.updatedAt ?? new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}

function writeStoredTemplates(templates: AgendaTemplate[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  } catch {
    toast.error("Não foi possível salvar no armazenamento do navegador.");
  }
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

interface EditorState {
  id: string | null;
  title: string;
  description: string;
  body: string;
}

const EMPTY_EDITOR: EditorState = { id: null, title: "", description: "", body: "" };

function TemplatesPage() {
  const [templates, setTemplates] = useState<AgendaTemplate[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AgendaTemplate | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    setTemplates(readStoredTemplates());
    setIsReady(true);
  }, []);

  const persist = (next: AgendaTemplate[]) => {
    setTemplates(next);
    writeStoredTemplates(next);
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return templates;
    return templates.filter(
      (template) =>
        template.title.toLowerCase().includes(term) ||
        template.description.toLowerCase().includes(term),
    );
  }, [templates, search]);

  const handleOpenCreate = () => setEditor({ ...EMPTY_EDITOR });

  const handleOpenEdit = (template: AgendaTemplate) =>
    setEditor({
      id: template.id,
      title: template.title,
      description: template.description,
      body: template.body,
    });

  const handleSubmitEditor = () => {
    if (!editor) return;

    const title = editor.title.trim();
    const description = editor.description.trim();
    const body = editor.body.trim();

    if (!title) {
      toast.error("Informe um título para o modelo.");
      return;
    }
    if (!body) {
      toast.error("Escreva o corpo da pauta antes de salvar.");
      return;
    }

    const now = new Date().toISOString();

    if (editor.id) {
      const next = templates.map((template) =>
        template.id === editor.id
          ? { ...template, title, description, body, updatedAt: now }
          : template,
      );
      persist(next);
      toast.success("Modelo atualizado.");
    } else {
      const created: AgendaTemplate = {
        id: createId(),
        title,
        description,
        body,
        createdAt: now,
        updatedAt: now,
      };
      persist([created, ...templates]);
      toast.success("Modelo criado.");
    }

    setEditor(null);
  };

  const handleDuplicate = (template: AgendaTemplate) => {
    const now = new Date().toISOString();
    const copy: AgendaTemplate = {
      id: createId(),
      title: `${template.title} (cópia)`,
      description: template.description,
      body: template.body,
      createdAt: now,
      updatedAt: now,
    };
    const index = templates.findIndex((item) => item.id === template.id);
    const next = [...templates];
    next.splice(index + 1, 0, copy);
    persist(next);
    toast.success("Modelo duplicado.");
  };

  const handleConfirmDelete = () => {
    if (!pendingDelete) return;
    persist(templates.filter((template) => template.id !== pendingDelete.id));
    if (expandedId === pendingDelete.id) setExpandedId(null);
    toast.success("Modelo excluído.");
    setPendingDelete(null);
  };

  const handleCopy = async (template: AgendaTemplate) => {
    try {
      await navigator.clipboard.writeText(template.body);
      toast.success(`Pauta de "${template.title}" copiada.`);
    } catch {
      toast.error("Não foi possível copiar. Verifique as permissões do navegador.");
    }
  };

  const handleRestoreDefaults = () => {
    const seeded = seedTemplates();
    persist([...seeded, ...templates]);
    toast.success("Modelos padrão restaurados.");
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-white">Templates de IA</h1>
          <p className="text-white/40 text-sm">
            Biblioteca de modelos de pauta e ata para suas reuniões e entrevistas.
          </p>
        </div>
        <Button
          onClick={handleOpenCreate}
          className="bg-white hover:bg-white/90 text-black rounded-full font-bold h-11 px-6"
        >
          <Plus className="w-4 h-4 mr-2" /> Novo modelo
        </Button>
      </div>

      <Card className="p-4 bg-white/[0.02] border-white/5 rounded-2xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por título ou descrição..."
              className="pl-10 pr-10 h-10 rounded-full border-white/10 bg-white/5 text-white placeholder:text-white/20 focus-visible:ring-white/20"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Limpar busca"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <p className="text-xs text-white/40">
            {isReady
              ? `${filtered.length} de ${templates.length} ${templates.length === 1 ? "modelo" : "modelos"}`
              : "Carregando modelos..."}
          </p>
        </div>
      </Card>

      {!isReady ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((item) => (
            <Card
              key={item}
              className="h-44 bg-white/[0.02] border-white/5 rounded-2xl animate-pulse"
            />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <Card className="p-12 bg-white/[0.02] border-white/5 border-dashed rounded-2xl flex flex-col items-center justify-center text-center space-y-4">
          <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center text-white/20">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h4 className="font-bold text-sm text-white/60">Nenhum modelo salvo</h4>
            <p className="text-xs text-white/20 mt-1 max-w-xs mx-auto">
              Crie um modelo do zero ou restaure os modelos padrão da biblioteca.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 justify-center">
            <Button
              onClick={handleOpenCreate}
              className="bg-white hover:bg-white/90 text-black rounded-full font-bold"
            >
              <Plus className="w-4 h-4 mr-2" /> Criar modelo
            </Button>
            <Button
              variant="outline"
              onClick={handleRestoreDefaults}
              className="rounded-full border-white/10 bg-transparent text-white/60 hover:text-white hover:bg-white/5"
            >
              <RotateCcw className="w-4 h-4 mr-2" /> Restaurar modelos padrão
            </Button>
          </div>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="p-12 bg-white/[0.02] border-white/5 border-dashed rounded-2xl flex flex-col items-center justify-center text-center space-y-4">
          <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center text-white/20">
            <Search className="w-6 h-6" />
          </div>
          <div>
            <h4 className="font-bold text-sm text-white/60">Nenhum modelo encontrado</h4>
            <p className="text-xs text-white/20 mt-1">
              Nenhum resultado para "{search.trim()}". Ajuste a busca e tente novamente.
            </p>
          </div>
          <Button
            variant="ghost"
            onClick={() => setSearch("")}
            className="rounded-full text-white/40 hover:text-white hover:bg-white/5"
          >
            Limpar busca
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((template) => {
            const isExpanded = expandedId === template.id;
            const lineCount = template.body.split("\n").length;

            return (
              <Card
                key={template.id}
                className="p-6 bg-white/[0.02] border-white/5 rounded-2xl flex flex-col gap-4 hover:border-white/10 transition-colors"
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white/40 shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-sm text-white truncate">{template.title}</h3>
                    <p className="text-xs text-white/40 mt-1 line-clamp-2">
                      {template.description || "Sem descrição."}
                    </p>
                    <p className="text-[10px] uppercase tracking-widest text-white/20 mt-2">
                      {lineCount} linhas · atualizado em {formatDate(template.updatedAt)}
                    </p>
                  </div>
                </div>

                <div
                  className={cn(
                    "rounded-xl bg-black/40 border border-white/5 p-4 text-xs text-white/50 whitespace-pre-wrap font-mono leading-relaxed",
                    isExpanded ? "max-h-96 overflow-y-auto" : "max-h-28 overflow-hidden",
                  )}
                >
                  {template.body}
                </div>

                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : template.id)}
                  className="self-start text-[10px] font-bold uppercase tracking-widest text-white/30 hover:text-white transition-colors"
                >
                  {isExpanded ? "Recolher pauta" : "Ver pauta completa"}
                </button>

                <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
                  <Button
                    size="sm"
                    onClick={() => void handleCopy(template)}
                    className="rounded-full bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 font-bold"
                  >
                    <Copy className="w-3.5 h-3.5 mr-2" /> Copiar pauta
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleOpenEdit(template)}
                    className="rounded-full text-white/40 hover:text-white hover:bg-white/5"
                  >
                    <Pencil className="w-3.5 h-3.5 mr-2" /> Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDuplicate(template)}
                    className="rounded-full text-white/40 hover:text-white hover:bg-white/5"
                  >
                    <CopyPlus className="w-3.5 h-3.5 mr-2" /> Duplicar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setPendingDelete(template)}
                    className="rounded-full text-rose-500/70 hover:text-rose-500 hover:bg-rose-500/10 ml-auto"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-2" /> Excluir
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={editor !== null} onOpenChange={(open) => !open && setEditor(null)}>
        <DialogContent className="bg-black border-white/10 text-white rounded-2xl max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white">
              {editor?.id ? "Editar modelo" : "Novo modelo"}
            </DialogTitle>
            <DialogDescription className="text-white/40">
              Os modelos ficam salvos neste navegador e podem ser copiados para qualquer reunião.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="template-title" className="text-xs text-white/40">
                Título
              </Label>
              <Input
                id="template-title"
                value={editor?.title ?? ""}
                onChange={(event) =>
                  setEditor((current) =>
                    current ? { ...current, title: event.target.value } : current,
                  )
                }
                placeholder="Ex.: Reunião de Kickoff de Projeto"
                className="border-white/10 bg-white/5 text-white placeholder:text-white/20 focus-visible:ring-white/20 rounded-xl h-10"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="template-description" className="text-xs text-white/40">
                Descrição
              </Label>
              <Input
                id="template-description"
                value={editor?.description ?? ""}
                onChange={(event) =>
                  setEditor((current) =>
                    current ? { ...current, description: event.target.value } : current,
                  )
                }
                placeholder="Para que serve este modelo?"
                className="border-white/10 bg-white/5 text-white placeholder:text-white/20 focus-visible:ring-white/20 rounded-xl h-10"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="template-body" className="text-xs text-white/40">
                Corpo da pauta
              </Label>
              <Textarea
                id="template-body"
                value={editor?.body ?? ""}
                onChange={(event) =>
                  setEditor((current) =>
                    current ? { ...current, body: event.target.value } : current,
                  )
                }
                placeholder={"1. Abertura\n2. Pontos principais\n3. Decisões\n4. Ações"}
                className="min-h-64 border-white/10 bg-white/5 text-white placeholder:text-white/20 focus-visible:ring-white/20 rounded-xl font-mono text-xs leading-relaxed"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setEditor(null)}
              className="rounded-full text-white/40 hover:text-white hover:bg-white/5"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSubmitEditor}
              className="bg-white hover:bg-white/90 text-black rounded-full font-bold"
            >
              {editor?.id ? "Salvar alterações" : "Criar modelo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent className="bg-black border-white/10 text-white rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Excluir modelo?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/40">
              O modelo "{pendingDelete?.title}" será removido deste navegador. Esta ação não pode
              ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full border-white/10 bg-transparent text-white/60 hover:bg-white/5 hover:text-white">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="rounded-full bg-rose-500 text-white hover:bg-rose-500/90 font-bold"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
