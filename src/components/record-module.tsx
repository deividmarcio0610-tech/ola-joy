import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2, Sparkles, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ModuleShell } from "./module-shell";
import { PhotoRecordDialog } from "./photo-record-dialog";
import { GainFormDialog } from "./gain-form-dialog";
import { analisarComIris, toReadableReport, urlToDataUrl } from "@/lib/iris-analyze";
import { handleAiError } from "@/lib/ai-credits-error";


export type ModuleKey =
  | "n3"
  | "kaizen"
  | "inspection"
  | "environment"
  | "emergency"
  | "supervision"
  | "crm"
  | "gain";

const statusOptions = [
  { v: "aberto", l: "Aberto" },
  { v: "em_andamento", l: "Em andamento" },
  { v: "concluido", l: "Concluído" },
  { v: "cancelado", l: "Cancelado" },
];
const priorityOptions = [
  { v: "baixa", l: "Baixa" },
  { v: "media", l: "Média" },
  { v: "alta", l: "Alta" },
  { v: "critica", l: "Crítica" },
];

const statusColor: Record<string, string> = {
  aberto: "bg-blue-500/15 text-blue-300 ring-blue-400/40",
  em_andamento: "bg-yellow-500/15 text-yellow-300 ring-yellow-400/40",
  concluido: "bg-neon/15 text-neon ring-neon/40",
  cancelado: "bg-muted text-muted-foreground ring-border",
};
const priorityColor: Record<string, string> = {
  baixa: "bg-muted text-muted-foreground",
  media: "bg-blue-500/15 text-blue-300",
  alta: "bg-orange-500/15 text-orange-300",
  critica: "bg-red-500/15 text-red-300",
};

interface Props {
  moduleKey: ModuleKey;
  moduleKeys?: ModuleKey[]; // optional multi-module query (e.g. n3 + crm)
  icon: LucideIcon;
  title: string;
  subtitle: string;
  showFinancial?: boolean;
  createLabel?: string;
  hideCreate?: boolean;
  allowCategoryOverride?: boolean;
  extendedKpis?: boolean;
}

export function RecordModule({
  moduleKey,
  moduleKeys,
  icon,
  title,
  subtitle,
  showFinancial = false,
  createLabel = "Novo registro",
  hideCreate = false,
  allowCategoryOverride = false,
  extendedKpis = false,
}: Props) {
  const qc = useQueryClient();
  const queryModules = moduleKeys ?? [moduleKey];

  const { data: records, isLoading } = useQuery({
    queryKey: ["records", queryModules.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("records")
        .select("*")
        .in("module", queryModules)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("records").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removido");
      qc.invalidateQueries({ queryKey: ["records"] });
    },
  });

  const total = records?.length ?? 0;
  const abertos = records?.filter((r) => r.status === "aberto").length ?? 0;
  const emAndamento = records?.filter((r) => r.status === "em_andamento").length ?? 0;
  const concluidos = records?.filter((r) => r.status === "concluido").length ?? 0;
  const n3Count = records?.filter((r) => r.module === "n3").length ?? 0;
  const crmCount = records?.filter((r) => r.module === "crm").length ?? 0;
  const criticos = records?.filter((r) => r.priority === "critica").length ?? 0;
  const aguardando = records?.filter((r) => r.status === "em_andamento").length ?? 0;
  const totalValor = showFinancial
    ? (records?.reduce((s, r) => s + Number(r.financial_value ?? 0), 0) ?? 0)
    : 0;

  return (
    <ModuleShell icon={icon} title={title} subtitle={subtitle} status="operacional">
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
          <Kpi label="Total" value={total} />
          <Kpi label="Abertos" value={abertos} />
          <Kpi label="Em andamento" value={emAndamento} />
          <Kpi label="Concluídos" value={concluidos} highlight />
          {extendedKpis && (
            <>
              <Kpi label="N3" value={n3Count} />
              <Kpi label="CRM" value={crmCount} />
              <Kpi label="Críticos" value={criticos} />
              <Kpi label="Aguardando" value={aguardando} />
            </>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          {!hideCreate && (
            <PhotoRecordDialog
              moduleKey={moduleKey}
              defaultModule={moduleKey}
              allowCategoryOverride={allowCategoryOverride}
              triggerLabel={createLabel}
              showFinancial={showFinancial}
            />
          )}
        </div>
      </div>

      {showFinancial && (
        <div className="rounded-lg border border-neon/30 bg-neon/5 p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Ganho consolidado
          </div>
          <div className="mt-1 font-display text-2xl font-semibold text-neon">
            R$ {totalValor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card/40">
        {isLoading ? (
          <div className="flex items-center justify-center p-10 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : !records || records.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Nenhum registro. Crie o primeiro com "{createLabel}".
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {records.map((r) => (
              <li key={r.id} className="flex items-start gap-4 p-4">
                {r.photo_url && (
                  <img src={r.photo_url} alt="" className="h-20 w-20 shrink-0 rounded-md border border-border object-cover" />
                )}
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {queryModules.length > 1 && (
                      <span className="rounded-full bg-neon/15 px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-widest text-neon">
                        {r.module}
                      </span>
                    )}
                    <h3 className="font-medium text-foreground">{r.title}</h3>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-widest ring-1 ${statusColor[r.status]}`}
                    >
                      {r.status.replace("_", " ")}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-widest ${priorityColor[r.priority]}`}
                    >
                      {r.priority}
                    </span>
                  </div>
                  {r.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {r.description}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                    {r.area && <span>Área: {r.area}</span>}
                    {r.location && <span>Local: {r.location}</span>}
                    {showFinancial && r.financial_value != null && (
                      <span className="text-neon">
                        R$ {Number(r.financial_value).toLocaleString("pt-BR")}
                      </span>
                    )}
                    <span>{new Date(r.created_at).toLocaleString("pt-BR")}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  
                  {moduleKey !== "gain" && <RegisterGainButton record={r} />}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (confirm("Excluir este registro?")) del.mutate(r.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground hover:text-red-400" />
                  </Button>
                </div>

              </li>
            ))}
          </ul>
        )}
      </div>
    </ModuleShell>
  );
}

function Kpi({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card/60 p-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div
        className={`mt-1 font-display text-xl font-semibold ${highlight ? "text-neon" : "text-foreground"}`}
      >
        {value}
      </div>
    </div>
  );
}


type RecordRow = {
  id: string;
  module: ModuleKey;
  title: string;
  description: string | null;
  area: string | null;
  location: string | null;
  status: string;
  priority: string;
  photo_url: string | null;
  financial_value: number | null;
  equipment: string | null;
  created_at: string;
};


const MODULE_LABEL: Record<ModuleKey, string> = {
  n3: "N3 – Não Conformidade",
  kaizen: "Kaizen / Melhoria Contínua",
  inspection: "Inspeção 5S",
  environment: "Meio Ambiente",
  emergency: "Emergência",
  supervision: "Supervisão Operacional",
  crm: "CRM Interno",
  gain: "Controle de Ganhos",
};

function IrisAnalyzeButton({ record, moduleKey }: { record: RecordRow; moduleKey: ModuleKey }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);

  async function analyze() {
    setLoading(true);
    setAnalysis(null);
    try {
      if (!record.photo_url) {
        toast.error(
          "Este registro não tem foto anexada. A análise externa da IA exige uma imagem.",
        );
        setAnalysis(
          "Sem foto anexada — a análise externa (Gemini) requer uma imagem para operar. Anexe uma foto ao registro para reanalisar.",
        );
        return;
      }
      const dataUrl = await urlToDataUrl(record.photo_url);
      const context = `Módulo: ${MODULE_LABEL[moduleKey]}
Título: ${record.title}
Descrição: ${record.description ?? "(sem descrição)"}
Área: ${record.area ?? "-"}
Local: ${record.location ?? "-"}
Status: ${record.status}
Prioridade: ${record.priority}`;
      const raw = await analisarComIris({ image: dataUrl, context });
      setAnalysis(toReadableReport(raw));
    } catch (e) {
      handleAiError(e, "Erro ao analisar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o && !analysis && !loading) analyze();
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          title="Analisar com IA"
          className="text-neon hover:bg-neon/10"
        >
          <Sparkles className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-neon" />
            Análise IA — {record.title}
          </DialogTitle>
          <DialogDescription>Diagnóstico técnico e plano de ação sugerido pela IA.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-border bg-card/40 p-4 text-sm">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-neon" />
              IA analisando registro…
            </div>
          ) : analysis ? (
            <div className="whitespace-pre-wrap leading-relaxed text-foreground">{analysis}</div>
          ) : (
            <div className="text-muted-foreground">Preparando análise…</div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => analyze()} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Reanalisar
          </Button>
          <Button onClick={() => setOpen(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IrisModuleAnalyzeButton({
  moduleKey,
  records,
}: {
  moduleKey: ModuleKey;
  records: RecordRow[];
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);

  async function analyze() {
    setLoading(true);
    setAnalysis(null);
    try {
      const withPhoto = records.find((r) => r.photo_url);
      if (!withPhoto?.photo_url) {
        setAnalysis(
          `PANORAMA GERAL\nMódulo ${MODULE_LABEL[moduleKey]} — ${records.length} registro(s), ${records.filter(
            (r) => r.status === "aberto",
          ).length} aberto(s), ${records.filter((r) => r.priority === "critica").length} crítico(s).\n\nOBSERVAÇÃO\nA análise externa (Gemini) exige uma imagem. Abra um registro com foto e use “Analisar com IA” no card para obter o parecer detalhado.\n\nAVISO: As ações propostas pela IA devem ser avaliadas e validadas pelos responsáveis antes da execução.`,
        );
        return;
      }
      const dataUrl = await urlToDataUrl(withPhoto.photo_url);
      const summary = records
        .slice(0, 20)
        .map(
          (r, i) =>
            `#${i + 1} [${r.status}/${r.priority}] ${r.title}${r.area ? ` — Área: ${r.area}` : ""}`,
        )
        .join("\n");
      const context = `Módulo: ${MODULE_LABEL[moduleKey]}\nTotal: ${records.length} · Abertos: ${records.filter((r) => r.status === "aberto").length} · Críticos: ${records.filter((r) => r.priority === "critica").length}\n\nAmostra:\n${summary}`;
      const raw = await analisarComIris({ image: dataUrl, context });
      setAnalysis(toReadableReport(raw));
    } catch (e) {
      handleAiError(e, "Erro ao analisar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o && !analysis && !loading) analyze();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2 border-neon/40 text-neon hover:bg-neon/10">
          <Sparkles className="h-4 w-4" /> Analisar com IA
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-neon" />
            Análise IA — {MODULE_LABEL[moduleKey]}
          </DialogTitle>
          <DialogDescription>
            Diagnóstico consolidado do módulo e plano de ação sugerido pela IA.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-border bg-card/40 p-4 text-sm">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-neon" />
              IA analisando módulo…
            </div>
          ) : analysis ? (
            <div className="whitespace-pre-wrap leading-relaxed text-foreground">
              {analysis}
            </div>
          ) : (
            <div className="text-muted-foreground">Preparando análise…</div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => analyze()} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Reanalisar
          </Button>
          <Button onClick={() => setOpen(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RegisterGainButton({ record }: { record: RecordRow }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        title="Registrar ganho desta ação"
        className="text-neon hover:bg-neon/10"
        onClick={() => setOpen(true)}
      >
        <TrendingUp className="h-4 w-4" />
      </Button>
      {open && (
        <GainFormDialog
          open={open}
          onOpenChange={setOpen}
          record={{
            id: record.id,
            module: record.module,
            title: record.title,
            description: record.description,
            area: record.area,
            equipment: record.equipment,
            photo_url: record.photo_url,
          }}
        />
      )}
    </>
  );
}


