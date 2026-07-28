import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, Loader2, ShieldCheck, Filter, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ModuleShell } from "@/components/module-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GAIN_TYPES, GAIN_STATUSES } from "@/components/gain-form-dialog";
import type { Database } from "@/integrations/supabase/types";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/controle-ganhos")({
  head: () => ({
    meta: [
      { title: "Controle de Ganhos · VALETECH" },
      {
        name: "description",
        content:
          "Sistema real de medição de ganhos vinculados a registros de N3, CRM, Inspeção, Kaizen, Meio Ambiente e APR — com validação, evidências e ROI.",
      },
    ],
  }),
  component: ControleGanhosPage,
});

type GainRow = Database["public"]["Tables"]["gains"]["Row"];

const STATUS_COLOR: Record<string, string> = {
  estimado: "bg-blue-500/15 text-blue-300 ring-blue-400/40",
  em_medicao: "bg-yellow-500/15 text-yellow-300 ring-yellow-400/40",
  realizado: "bg-cyan-500/15 text-cyan-300 ring-cyan-400/40",
  validado: "bg-neon/15 text-neon ring-neon/40",
  rejeitado: "bg-red-500/15 text-red-300 ring-red-400/40",
  suspenso: "bg-muted text-muted-foreground ring-border",
};

function fmt(v: number | null | undefined) {
  if (v == null) return "R$ 0,00";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function ControleGanhosPage() {
  const [q, setQ] = useState("");
  const [fArea, setFArea] = useState("all");
  const [fType, setFType] = useState("all");
  const [fModule, setFModule] = useState("all");
  const [fStatus, setFStatus] = useState("all");
  const [detail, setDetail] = useState<GainRow | null>(null);

  const { data: gains, isLoading } = useQuery({
    queryKey: ["gains"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gains")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as GainRow[];
    },
  });

  const areas = useMemo(
    () => Array.from(new Set((gains ?? []).map((g) => g.area).filter(Boolean))) as string[],
    [gains],
  );

  const filtered = useMemo(() => {
    return (gains ?? []).filter((g) => {
      if (q && !`${g.title} ${g.code} ${g.description ?? ""}`.toLowerCase().includes(q.toLowerCase()))
        return false;
      if (fArea !== "all" && g.area !== fArea) return false;
      if (fType !== "all" && g.gain_type !== fType) return false;
      if (fModule !== "all" && g.source_module !== fModule) return false;
      if (fStatus !== "all" && g.status !== fStatus) return false;
      return true;
    });
  }, [gains, q, fArea, fType, fModule, fStatus]);

  const totals = useMemo(() => {
    const sum = (list: GainRow[], k: keyof GainRow) =>
      list.reduce((s, g) => s + Number((g[k] as number | null) ?? 0), 0);
    const validados = filtered.filter((g) => g.status === "validado");
    const realizados = filtered.filter((g) => g.status === "realizado");
    const emMedicao = filtered.filter((g) => g.status === "em_medicao");
    const estimados = filtered.filter((g) => g.status === "estimado");
    return {
      potencial: sum(estimados, "value_estimated"),
      emMedicao: sum(emMedicao, "value_realized"),
      realizado: sum(realizados, "value_realized"),
      validado: sum(validados, "value_validated"),
      hh: sum(validados, "manhours_saved"),
      hoursSaved: sum(validados, "hours_saved"),
      cost: sum(filtered, "implementation_cost"),
      countTotal: filtered.length,
      countValidados: validados.length,
      countPendentesValidacao: realizados.length,
      countSemMedicao: filtered.filter((g) => !g.value_realized && !g.value_validated).length,
    };
  }, [filtered]);

  const rankingArea = useMemo(() => {
    const map = new Map<string, number>();
    filtered
      .filter((g) => g.status === "validado")
      .forEach((g) => {
        const k = g.area ?? "Sem área";
        map.set(k, (map.get(k) ?? 0) + Number(g.value_validated ?? 0));
      });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [filtered]);

  const byMonth = useMemo(() => {
    const map = new Map<string, number>();
    filtered
      .filter((g) => g.status === "validado")
      .forEach((g) => {
        const d = new Date(g.validated_at ?? g.created_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        map.set(key, (map.get(key) ?? 0) + Number(g.value_validated ?? 0));
      });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  return (
    <ModuleShell
      icon={TrendingUp}
      title="Controle de Ganhos"
      subtitle="Ganhos reais vinculados a registros. Apenas validados entram no total oficial."
      status="operacional"
    >
      {/* KPIs — 4 categorias separadas */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Potencial (estimado)" value={fmt(totals.potencial)} tone="blue" />
        <Kpi label="Em medição" value={fmt(totals.emMedicao)} tone="yellow" />
        <Kpi label="Realizado" value={fmt(totals.realizado)} tone="cyan" />
        <Kpi label="Validado (oficial)" value={fmt(totals.validado)} tone="neon" />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Horas economizadas" value={totals.hoursSaved.toFixed(1)} tone="muted" />
        <Kpi label="Horas-homem" value={totals.hh.toFixed(1)} tone="muted" />
        <Kpi label="Custo implementação" value={fmt(totals.cost)} tone="muted" />
        <Kpi label="Aguardando validação" value={String(totals.countPendentesValidacao)} tone="muted" />
        <Kpi label="Sem medição" value={String(totals.countSemMedicao)} tone="muted" />
      </div>

      {/* Filtros */}
      <div className="rounded-xl border border-border bg-card/40 p-3">
        <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
          <Filter className="h-3 w-3" /> Filtros
        </div>
        <div className="grid gap-2 md:grid-cols-5">
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Buscar</Label>
            <Input placeholder="código, título, descrição…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <FilterSelect label="Área" value={fArea} onChange={setFArea}
            options={[{ v: "all", l: "Todas" }, ...areas.map((a) => ({ v: a, l: a }))]} />
          <FilterSelect label="Tipo de ganho" value={fType} onChange={setFType}
            options={[{ v: "all", l: "Todos" }, ...GAIN_TYPES.map((t) => ({ v: t.v, l: t.l }))]} />
          <FilterSelect label="Módulo de origem" value={fModule} onChange={setFModule}
            options={[
              { v: "all", l: "Todos" },
              { v: "n3", l: "N3" }, { v: "crm", l: "CRM" }, { v: "kaizen", l: "Kaizen" },
              { v: "environment", l: "Meio Ambiente" }, { v: "supervision", l: "Supervisão" },
              { v: "emergency", l: "Emergência" },
            ]} />
          <FilterSelect label="Situação" value={fStatus} onChange={setFStatus}
            options={[{ v: "all", l: "Todas" }, ...GAIN_STATUSES.map((s) => ({ v: s.v, l: s.l }))]} />
        </div>
      </div>

      {/* Abas */}
      <Tabs defaultValue="vinculados" className="w-full">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="vinculados">Vinculados ({filtered.length})</TabsTrigger>
          <TabsTrigger value="em_medicao">Em medição</TabsTrigger>
          <TabsTrigger value="aguardando">Aguardando validação</TabsTrigger>
          <TabsTrigger value="validados">Validados</TabsTrigger>
          <TabsTrigger value="rejeitados">Rejeitados</TabsTrigger>
          <TabsTrigger value="ranking">Ranking por área</TabsTrigger>
          <TabsTrigger value="evolucao">Evolução mensal</TabsTrigger>
        </TabsList>

        <TabsContent value="vinculados"><GainList items={filtered} onOpen={setDetail} isLoading={isLoading} /></TabsContent>
        <TabsContent value="em_medicao"><GainList items={filtered.filter((g) => g.status === "em_medicao")} onOpen={setDetail} /></TabsContent>
        <TabsContent value="aguardando"><GainList items={filtered.filter((g) => g.status === "realizado")} onOpen={setDetail} /></TabsContent>
        <TabsContent value="validados"><GainList items={filtered.filter((g) => g.status === "validado")} onOpen={setDetail} /></TabsContent>
        <TabsContent value="rejeitados"><GainList items={filtered.filter((g) => g.status === "rejeitado")} onOpen={setDetail} /></TabsContent>
        <TabsContent value="ranking">
          <div className="rounded-xl border border-border bg-card/40 p-4">
            {rankingArea.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Sem ganhos validados para ranquear.</div>
            ) : (
              <ul className="space-y-2">
                {rankingArea.map(([area, val], i) => {
                  const max = rankingArea[0][1] || 1;
                  return (
                    <li key={area}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="font-medium">{i + 1}. {area}</span>
                        <span className="text-neon">{fmt(val)}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-background/50">
                        <div className="h-full bg-neon" style={{ width: `${(val / max) * 100}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </TabsContent>
        <TabsContent value="evolucao">
          <div className="rounded-xl border border-border bg-card/40 p-4">
            {byMonth.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Sem histórico validado.</div>
            ) : (
              <ul className="space-y-2">
                {byMonth.map(([m, v]) => {
                  const max = Math.max(...byMonth.map((x) => x[1]));
                  return (
                    <li key={m}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="font-mono text-muted-foreground">{m}</span>
                        <span className="text-neon">{fmt(v)}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-background/50">
                        <div className="h-full bg-neon" style={{ width: `${(v / max) * 100}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">
        <div className="flex items-center gap-2 font-medium">
          <ShieldCheck className="h-4 w-4" /> Regras oficiais
        </div>
        <ul className="mt-1 list-disc pl-5 text-amber-100/80">
          <li>Todo ganho precisa estar vinculado a um registro real (N3, CRM, Inspeção, Kaizen, Meio Ambiente, APR).</li>
          <li>Somente ganhos <strong>Validados</strong> compõem o total oficial. Estimados e em medição são exibidos separadamente.</li>
          <li>Ganho de segurança não é convertido em R$ automaticamente.</li>
          <li>Duplicidade por registro + tipo + período é bloqueada no formulário.</li>
        </ul>
      </div>

      {detail && <GainDetailDialog gain={detail} onClose={() => setDetail(null)} />}
    </ModuleShell>
  );
}

function Kpi({ label, value, tone = "muted" }: { label: string; value: string; tone?: "neon" | "blue" | "yellow" | "cyan" | "muted" }) {
  const cls = {
    neon: "border-neon/40 bg-neon/5 text-neon",
    blue: "border-blue-400/30 bg-blue-400/5 text-blue-300",
    yellow: "border-yellow-400/30 bg-yellow-400/5 text-yellow-200",
    cyan: "border-cyan-400/30 bg-cyan-400/5 text-cyan-300",
    muted: "border-border bg-card/60 text-foreground",
  }[tone];
  return (
    <div className={`rounded-lg border p-3 ${cls}`}>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-lg font-semibold">{value}</div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { v: string; l: string }[];
}) {
  return (
    <div>
      <Label className="text-[10px] uppercase text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function GainList({
  items,
  onOpen,
  isLoading,
}: {
  items: GainRow[];
  onOpen: (g: GainRow) => void;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card/40 p-10 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card/40 p-10 text-center text-sm text-muted-foreground">
        Nenhum ganho encontrado. Abra um registro (N3, Kaizen, Inspeção…) e use o botão
        "Registrar ganho desta ação".
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-card/40">
      {items.map((g) => {
        const typeLabel = GAIN_TYPES.find((t) => t.v === g.gain_type)?.l ?? g.gain_type;
        const statusLabel = GAIN_STATUSES.find((s) => s.v === g.status)?.l ?? g.status;
        const displayValue =
          g.status === "validado" ? g.value_validated :
          g.status === "estimado" ? g.value_estimated :
          g.value_realized;
        return (
          <li key={g.id} className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[10px] text-muted-foreground">{g.code}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-widest ring-1 ${STATUS_COLOR[g.status]}`}>
                  {statusLabel}
                </span>
                <span className="rounded-full bg-neon/15 px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-widest text-neon">
                  {typeLabel}
                </span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                  {g.source_module}
                </span>
              </div>
              <div className="mt-1 font-medium text-foreground">{g.title}</div>
              <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                {g.area && <span>Área: {g.area}</span>}
                {g.equipment && <span>Equip.: {g.equipment}</span>}
                {g.period_kind && <span>Período: {g.period_kind}</span>}
                {g.responsible && <span>Resp.: {g.responsible}</span>}
                <span>{new Date(g.created_at).toLocaleDateString("pt-BR")}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-[10px] uppercase text-muted-foreground">Valor</div>
                <div className={`font-display text-lg font-semibold ${g.status === "validado" ? "text-neon" : "text-foreground"}`}>
                  {g.gain_type === "seguranca" ? "—" : fmt(displayValue)}
                </div>
                {g.roi != null && <div className="text-[10px] text-muted-foreground">ROI {Number(g.roi).toFixed(1)}%</div>}
              </div>
              <Button size="sm" variant="outline" onClick={() => onOpen(g)}>Detalhes</Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function GainDetailDialog({ gain, onClose }: { gain: GainRow; onClose: () => void }) {
  const { data: origin } = useQuery({
    queryKey: ["gain-origin", gain.record_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("records")
        .select("id, title, description, area, equipment, status, priority, photo_url, internal_code, module")
        .eq("id", gain.record_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: history } = useQuery({
    queryKey: ["gain-history", gain.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gain_history")
        .select("*")
        .eq("gain_id", gain.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const [validationNote, setValidationNote] = useState("");
  const [saving, setSaving] = useState(false);

  const validate = async () => {
    if (!validationNote.trim()) {
      toast.error("Justificativa da validação é obrigatória");
      return;
    }
    setSaving(true);
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    const { error } = await supabase
      .from("gains")
      .update({
        status: "validado",
        value_validated: gain.value_realized ?? gain.value_estimated ?? 0,
        validated_by: uid,
        validated_at: new Date().toISOString(),
        validation_note: validationNote,
      })
      .eq("id", gain.id);
    setSaving(false);
    if (error) {
      toast.error(error.message.includes("row-level")
        ? "Somente supervisor/admin pode validar."
        : error.message);
      return;
    }
    toast.success("Ganho validado");
    onClose();
  };

  const reject = async () => {
    if (!validationNote.trim()) {
      toast.error("Informe o motivo da rejeição");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("gains")
      .update({ status: "rejeitado", rejection_reason: validationNote })
      .eq("id", gain.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Ganho rejeitado");
    onClose();
  };

  const iris = gain.iris_analysis as { text?: string } | null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-neon">
            <TrendingUp className="h-5 w-5" /> {gain.code} — {gain.title}
          </DialogTitle>
          <DialogDescription>Detalhes, memória de cálculo, evidências e histórico.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-2">
          <Info label="Tipo de ganho" value={GAIN_TYPES.find((t) => t.v === gain.gain_type)?.l ?? gain.gain_type} />
          <Info label="Situação" value={GAIN_STATUSES.find((s) => s.v === gain.status)?.l ?? gain.status} />
          <Info label="Área" value={gain.area ?? "—"} />
          <Info label="Equipamento" value={gain.equipment ?? "—"} />
          <Info label="Responsável" value={gain.responsible ?? "—"} />
          <Info label="Período" value={`${gain.period_kind} — ${gain.period_start ?? "?"} → ${gain.period_end ?? "?"}`} />
        </div>

        <div className="rounded-lg border border-border bg-card/40 p-3">
          <div className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">Registro de origem</div>
          {origin ? (
            <div className="space-y-1 text-sm">
              <div className="flex items-center gap-2">
                <span className="rounded bg-neon/15 px-2 py-0.5 font-mono text-[10px] text-neon">{origin.internal_code ?? origin.module}</span>
                <span className="font-medium">{origin.title}</span>
              </div>
              {origin.description && <p className="text-muted-foreground">{origin.description}</p>}
              <div className="text-[11px] text-muted-foreground">
                {origin.area && `Área: ${origin.area} · `}
                {origin.equipment && `Equip.: ${origin.equipment} · `}
                Status: {origin.status} · Prioridade: {origin.priority}
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Registro não encontrado ou sem acesso.</div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card/40 p-3">
          <div className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">Memória de cálculo</div>
          <pre className="whitespace-pre-wrap font-mono text-xs text-foreground">{gain.calc_memory ?? "—"}</pre>
          <div className="mt-2 text-[11px] italic text-muted-foreground">Fórmula: {gain.formula ?? "—"}</div>
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Info label="Estimado" value={fmt(gain.value_estimated)} />
          <Info label="Realizado" value={fmt(gain.value_realized)} />
          <Info label="Validado" value={fmt(gain.value_validated)} />
          <Info label="Custo implementação" value={fmt(gain.implementation_cost)} />
          <Info label="ROI" value={gain.roi != null ? `${Number(gain.roi).toFixed(1)}%` : "—"} />
          <Info label="Payback (meses)" value={gain.payback_months != null ? Number(gain.payback_months).toFixed(1) : "—"} />
          <Info label="Horas economizadas" value={gain.hours_saved != null ? `${Number(gain.hours_saved).toFixed(1)} h` : "—"} />
          <Info label="Horas-homem" value={gain.manhours_saved != null ? `${Number(gain.manhours_saved).toFixed(1)} HH` : "—"} />
        </div>

        {iris?.text && (
          <div className="rounded-lg border border-neon/30 bg-neon/5 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-neon">
              <Sparkles className="h-3 w-3" /> Análise IA
            </div>
            <pre className="whitespace-pre-wrap text-xs text-foreground">{iris.text}</pre>
          </div>
        )}

        <div className="rounded-lg border border-border bg-card/40 p-3">
          <div className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">Histórico</div>
          {!history || history.length === 0 ? (
            <div className="text-sm text-muted-foreground">Sem alterações registradas.</div>
          ) : (
            <ul className="space-y-1 text-xs">
              {history.map((h) => (
                <li key={h.id} className="flex items-start gap-2">
                  <span className="font-mono text-muted-foreground">{new Date(h.created_at).toLocaleString("pt-BR")}</span>
                  <span className="font-medium">{h.action}</span>
                  {h.field && <span className="text-muted-foreground">campo: {h.field}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        {gain.status !== "validado" && gain.status !== "rejeitado" && (
          <div className="rounded-lg border border-neon/30 bg-card/40 p-3">
            <div className="mb-2 text-xs uppercase tracking-widest text-neon">Validação (supervisor / admin)</div>
            <Input
              placeholder="Justificativa da validação ou motivo de rejeição"
              value={validationNote}
              onChange={(e) => setValidationNote(e.target.value)}
            />
            <div className="mt-2 flex gap-2">
              <Button onClick={validate} disabled={saving} className="gap-2">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Validar
              </Button>
              <Button variant="outline" onClick={reject} disabled={saving}>Rejeitar</Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background/40 p-2">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}
