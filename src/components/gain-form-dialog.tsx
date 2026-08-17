import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles, TrendingUp, Info, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { handleAiError } from "@/lib/ai-credits-error";
import type { Database } from "@/integrations/supabase/types";
import { chamarIrisChat } from "@/lib/iris-analyze";

type GainType = Database["public"]["Enums"]["gain_type"];
type GainStatus = Database["public"]["Enums"]["gain_status"];
type RecordModule = Database["public"]["Enums"]["record_module"];

export const GAIN_TYPES: { v: GainType; l: string; hint?: string }[] = [
  { v: "tempo", l: "Ganho de tempo" },
  { v: "financeiro", l: "Ganho financeiro" },
  { v: "produtividade", l: "Ganho de produtividade" },
  { v: "reducao_custo", l: "Redução de custo" },
  { v: "reducao_retrabalho", l: "Redução de retrabalho" },
  { v: "prevencao_perda", l: "Prevenção de perda" },
  { v: "reducao_parada", l: "Redução de parada" },
  { v: "reducao_consumo", l: "Redução de consumo" },
  { v: "ambiental", l: "Ganho ambiental" },
  { v: "seguranca", l: "Ganho de segurança", hint: "Não converte automaticamente em R$" },
  { v: "disponibilidade", l: "Ganho de disponibilidade" },
  { v: "qualidade", l: "Ganho de qualidade" },
  { v: "operacional", l: "Ganho operacional" },
];

export const GAIN_STATUSES: { v: GainStatus; l: string }[] = [
  { v: "estimado", l: "Estimado" },
  { v: "em_medicao", l: "Em medição" },
  { v: "realizado", l: "Realizado" },
  { v: "validado", l: "Validado" },
  { v: "rejeitado", l: "Rejeitado" },
  { v: "suspenso", l: "Suspenso" },
];

const PERIOD_KINDS = [
  { v: "diario", l: "Diário" },
  { v: "semanal", l: "Semanal" },
  { v: "mensal", l: "Mensal" },
  { v: "trimestral", l: "Trimestral" },
  { v: "anual", l: "Anual" },
  { v: "personalizado", l: "Personalizado" },
];

type SourceRecord = {
  id: string;
  module: RecordModule;
  title: string;
  description: string | null;
  area: string | null;
  equipment: string | null;
  photo_url: string | null;
};

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  record: SourceRecord;
}

type InputsShape = {
  time_before_min?: number;
  time_after_min?: number;
  executions_per_month?: number;
  people_count?: number;
  hourly_cost?: number;
  material_cost_before?: number;
  material_cost_after?: number;
  downtime_hours_avoided?: number;
  downtime_hourly_cost?: number;
  notes?: string;
  // safety
  risks_eliminated?: number;
  people_exposed_before?: number;
  people_exposed_after?: number;
  criticality_before?: string;
  criticality_after?: string;
  recurrences_avoided?: number;
};

function fmtBRL(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function GainFormDialog({ open, onOpenChange, record }: Props) {
  const qc = useQueryClient();

  const [gainType, setGainType] = useState<GainType>("tempo");
  const [status, setStatus] = useState<GainStatus>("estimado");
  const [title, setTitle] = useState(`Ganho — ${record.title}`);
  const [description, setDescription] = useState("");
  const [area, setArea] = useState(record.area ?? "");
  const [equipment, setEquipment] = useState(record.equipment ?? "");
  const [responsible, setResponsible] = useState("");
  const [periodKind, setPeriodKind] = useState("mensal");
  const [periodStart, setPeriodStart] = useState<string>("");
  const [periodEnd, setPeriodEnd] = useState<string>("");
  const [implementationCost, setImplementationCost] = useState<string>("");
  const [validationNote, setValidationNote] = useState("");
  const [inputs, setInputs] = useState<InputsShape>({});
  const [irisLoading, setIrisLoading] = useState(false);
  const [irisResult, setIrisResult] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(`Ganho — ${record.title}`);
    setArea(record.area ?? "");
    setEquipment(record.equipment ?? "");
    setInputs({});
    setIrisResult(null);
  }, [open, record]);

  // Duplicate detection
  const { data: existingGains } = useQuery({
    queryKey: ["gains-by-record", record.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gains")
        .select(
          "id, code, gain_type, period_start, period_end, status, value_estimated, value_validated",
        )
        .eq("record_id", record.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const duplicateCandidate = useMemo(() => {
    if (!existingGains) return null;
    return existingGains.find(
      (g) =>
        g.gain_type === gainType &&
        String(g.period_start ?? "") === periodStart &&
        String(g.period_end ?? "") === periodEnd,
    );
  }, [existingGains, gainType, periodStart, periodEnd]);

  // Calculations
  const calc = useMemo(() => {
    const {
      time_before_min = 0,
      time_after_min = 0,
      executions_per_month = 0,
      people_count = 1,
      hourly_cost = 0,
      material_cost_before = 0,
      material_cost_after = 0,
      downtime_hours_avoided = 0,
      downtime_hourly_cost = 0,
    } = inputs;

    const savedMinPerExec = Math.max(time_before_min - time_after_min, 0);
    const savedMinMonth = savedMinPerExec * executions_per_month;
    const hoursMonth = savedMinMonth / 60;
    const manHoursMonth = hoursMonth * people_count;

    let valueMonth = 0;
    let formula = "";
    let memory = "";

    if (gainType === "tempo") {
      valueMonth = manHoursMonth * hourly_cost;
      formula =
        "Economia mensal = (Tempo antes - Tempo depois) × execuções/mês × pessoas ÷ 60 × valor/hora";
      memory = [
        `Tempo economizado por execução: ${savedMinPerExec} min`,
        `Execuções/mês: ${executions_per_month}`,
        `Pessoas envolvidas: ${people_count}`,
        `Horas economizadas/mês: ${hoursMonth.toFixed(2)} h`,
        `Horas-homem/mês: ${manHoursMonth.toFixed(2)} HH`,
        `Valor da hora: ${fmtBRL(hourly_cost)}`,
        `Ganho mensal: ${fmtBRL(valueMonth)}`,
      ].join("\n");
    } else if (gainType === "reducao_parada") {
      valueMonth = downtime_hours_avoided * downtime_hourly_cost;
      formula = "Ganho = horas de parada evitadas × custo médio por hora parada";
      memory = [
        `Horas de parada evitadas: ${downtime_hours_avoided} h`,
        `Custo/hora parada: ${fmtBRL(downtime_hourly_cost)}`,
        `Ganho: ${fmtBRL(valueMonth)}`,
      ].join("\n");
    } else if (
      gainType === "reducao_custo" ||
      gainType === "reducao_consumo" ||
      gainType === "reducao_retrabalho" ||
      gainType === "prevencao_perda"
    ) {
      valueMonth = Math.max(material_cost_before - material_cost_after, 0);
      formula = "Ganho = custo/consumo anterior - custo/consumo atual";
      memory = [
        `Custo/consumo anterior: ${fmtBRL(material_cost_before)}`,
        `Custo/consumo atual: ${fmtBRL(material_cost_after)}`,
        `Economia: ${fmtBRL(valueMonth)}`,
      ].join("\n");
    } else if (
      gainType === "financeiro" ||
      gainType === "operacional" ||
      gainType === "produtividade" ||
      gainType === "qualidade" ||
      gainType === "disponibilidade"
    ) {
      valueMonth =
        manHoursMonth * hourly_cost + Math.max(material_cost_before - material_cost_after, 0);
      formula = "Ganho = horas-homem economizadas × valor/hora + (custo anterior - custo atual)";
      memory = [
        `Horas-homem/mês: ${manHoursMonth.toFixed(2)} HH`,
        `Valor da hora: ${fmtBRL(hourly_cost)}`,
        `Custo anterior: ${fmtBRL(material_cost_before)}`,
        `Custo atual: ${fmtBRL(material_cost_after)}`,
        `Ganho mensal: ${fmtBRL(valueMonth)}`,
      ].join("\n");
    } else if (gainType === "ambiental") {
      valueMonth = Math.max(material_cost_before - material_cost_after, 0);
      formula = "Ganho ambiental = redução de consumo/resíduo (valorada quando houver base)";
      memory = [
        `Consumo/descarte anterior: ${fmtBRL(material_cost_before)}`,
        `Consumo/descarte atual: ${fmtBRL(material_cost_after)}`,
        `Economia: ${fmtBRL(valueMonth)}`,
      ].join("\n");
    } else if (gainType === "seguranca") {
      valueMonth = 0;
      formula =
        "Segurança: métricas físicas obrigatórias. Sem metodologia aprovada não converte em R$.";
      memory = [
        `Riscos eliminados: ${inputs.risks_eliminated ?? 0}`,
        `Pessoas expostas antes: ${inputs.people_exposed_before ?? 0}`,
        `Pessoas expostas depois: ${inputs.people_exposed_after ?? 0}`,
        `Criticidade antes: ${inputs.criticality_before ?? "-"}`,
        `Criticidade depois: ${inputs.criticality_after ?? "-"}`,
        `Reincidências evitadas: ${inputs.recurrences_avoided ?? 0}`,
      ].join("\n");
    }

    const valueYear = valueMonth * 12;
    const cost = Number(implementationCost || 0);
    const netReturn = valueYear - cost;
    const roi = cost > 0 ? (netReturn / cost) * 100 : null;
    const payback = cost > 0 && valueMonth > 0 ? cost / valueMonth : null;

    return {
      savedMinPerExec,
      savedMinMonth,
      hoursMonth,
      manHoursMonth,
      valueMonth,
      valueYear,
      cost,
      netReturn,
      roi,
      payback,
      formula,
      memory,
    };
  }, [gainType, inputs, implementationCost]);

  const irisAnalyze = async () => {
    setIrisLoading(true);
    setIrisResult(null);
    try {
      const prompt = `Registro vinculado:
Módulo: ${record.module}
Título: ${record.title}
Descrição: ${record.description ?? "-"}
Área: ${record.area ?? "-"}
Equipamento: ${record.equipment ?? "-"}

Tipo de ganho selecionado: ${GAIN_TYPES.find((g) => g.v === gainType)?.l}

Dados atuais informados:
${JSON.stringify(inputs, null, 2)}

Como Engenheiro de Segurança / Especialista em Produtividade, analise o registro e responda:

1. Este tipo de ganho é coerente com o registro? (sim/parcialmente/não - justifique)
2. Quais DADOS faltam para um cálculo confiável?
3. Qual FÓRMULA recomendada?
4. Quais EVIDÊNCIAS obrigatórias devem ser anexadas?
5. Qual PERÍODO de apuração é adequado?
6. Este ganho é ESTIMADO, REALIZADO ou REQUER MEDIÇÃO?
7. Risco de DUPLA CONTABILIZAÇÃO neste registro?
8. NÍVEL DE CONFIABILIDADE do cálculo com os dados atuais: Baixa / Média / Alta.

IMPORTANTE: NÃO invente custos, salários, produção, tempos ou valores de parada. Onde faltar dado, escreva "Dado necessário não informado".
Termine com: "AVISO: Validação humana obrigatória antes de contabilizar o ganho."`;

      const data = await chamarIrisChat({
        messages: [
          {
            role: "system",
            content:
              "Você é IA, IA técnica do VisionGuard AI em Controle de Ganhos. Age como Engenheiro de Segurança, Especialista em Produtividade e Controller. Nunca inventa dados de custo, salário, produção ou tempo. Português técnico e objetivo.",
          },
          { role: "user", content: prompt },
        ],
      });
      setIrisResult(data.choices?.[0]?.message?.content ?? "(sem resposta)");
    } catch (e) {
      handleAiError(e, "Erro de rede na IA");
    } finally {
      setIrisLoading(false);
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) throw new Error("Sessão expirada");

      const isEstimated = status === "estimado";
      const isValidated = status === "validado";

      const payload = {
        record_id: record.id,
        source_module: record.module,
        gain_type: gainType,
        status,
        title,
        description: description || null,
        area: area || null,
        equipment: equipment || null,
        responsible: responsible || null,
        period_kind: periodKind,
        period_start: periodStart || null,
        period_end: periodEnd || null,
        inputs: inputs as unknown as Database["public"]["Tables"]["gains"]["Insert"]["inputs"],
        formula: calc.formula,
        calc_memory: calc.memory,
        value_estimated: isEstimated ? calc.valueMonth : null,
        value_realized: !isEstimated && !isValidated ? calc.valueMonth : null,
        value_validated: isValidated ? calc.valueMonth : null,
        hours_saved: calc.hoursMonth || null,
        manhours_saved: calc.manHoursMonth || null,
        implementation_cost: calc.cost || null,
        roi: calc.roi,
        payback_months: calc.payback,
        confidence: irisResult ? "Média" : "Baixa",
        iris_analysis: irisResult ? { text: irisResult } : null,
        safety_metrics:
          gainType === "seguranca"
            ? {
                risks_eliminated: inputs.risks_eliminated ?? 0,
                people_exposed_before: inputs.people_exposed_before ?? 0,
                people_exposed_after: inputs.people_exposed_after ?? 0,
                criticality_before: inputs.criticality_before ?? null,
                criticality_after: inputs.criticality_after ?? null,
                recurrences_avoided: inputs.recurrences_avoided ?? 0,
              }
            : {},
        validation_note: validationNote || null,
        validated_by: isValidated ? uid : null,
        validated_at: isValidated ? new Date().toISOString() : null,
        created_by: uid,
      };

      const { error, data } = await supabase.from("gains").insert(payload).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Ganho registrado com sucesso");
      qc.invalidateQueries({ queryKey: ["gains"] });
      qc.invalidateQueries({ queryKey: ["gains-by-record", record.id] });
      onOpenChange(false);
    },
    onError: (e: Error) => {
      toast.error(e.message ?? "Falha ao salvar ganho");
    },
  });

  const setI = (k: keyof InputsShape, v: string) => {
    const num = v === "" ? undefined : Number(v);
    setInputs((s) => ({ ...s, [k]: num }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-neon">
            <TrendingUp className="h-5 w-5" />
            Registrar ganho — vinculado a "{record.title}"
          </DialogTitle>
          <DialogDescription>
            Ganho obrigatoriamente vinculado ao registro de origem. Somente ganhos validados entram
            no total oficial.
          </DialogDescription>
        </DialogHeader>

        {duplicateCandidate && (
          <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 text-xs text-yellow-200">
            <div className="flex items-center gap-2 font-medium">
              <Info className="h-4 w-4" /> Já existe um ganho vinculado a este registro com mesmo
              tipo e período ({duplicateCandidate.code}).
            </div>
            <div className="mt-1 text-yellow-100/80">
              Prefira atualizar a medição existente ou registrar um período/complemento diferente
              para evitar dupla contabilização.
            </div>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Título">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Tipo de ganho">
            <Select value={gainType} onValueChange={(v) => setGainType(v as GainType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GAIN_TYPES.map((t) => (
                  <SelectItem key={t.v} value={t.v}>
                    {t.l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Área">
            <Input value={area} onChange={(e) => setArea(e.target.value)} />
          </Field>
          <Field label="Equipamento">
            <Input value={equipment} onChange={(e) => setEquipment(e.target.value)} />
          </Field>
          <Field label="Responsável pela ação">
            <Input value={responsible} onChange={(e) => setResponsible(e.target.value)} />
          </Field>
          <Field label="Situação">
            <Select value={status} onValueChange={(v) => setStatus(v as GainStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GAIN_STATUSES.map((s) => (
                  <SelectItem key={s.v} value={s.v}>
                    {s.l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Período">
            <Select value={periodKind} onValueChange={setPeriodKind}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_KINDS.map((p) => (
                  <SelectItem key={p.v} value={p.v}>
                    {p.l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Início">
              <Input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </Field>
            <Field label="Fim">
              <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </Field>
          </div>
        </div>

        <Field label="Descrição da melhoria / situação antes → depois">
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>

        <div className="rounded-lg border border-neon/25 bg-card/40 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-neon">
            <TrendingUp className="h-3 w-3" /> Dados de entrada — cálculo real
          </div>

          {gainType === "seguranca" ? (
            <div className="grid gap-2 md:grid-cols-3">
              <NumField label="Riscos eliminados" onChange={(v) => setI("risks_eliminated", v)} />
              <NumField
                label="Pessoas expostas (antes)"
                onChange={(v) => setI("people_exposed_before", v)}
              />
              <NumField
                label="Pessoas expostas (depois)"
                onChange={(v) => setI("people_exposed_after", v)}
              />
              <Field label="Criticidade antes">
                <Input
                  onChange={(e) => setInputs((s) => ({ ...s, criticality_before: e.target.value }))}
                />
              </Field>
              <Field label="Criticidade depois">
                <Input
                  onChange={(e) => setInputs((s) => ({ ...s, criticality_after: e.target.value }))}
                />
              </Field>
              <NumField
                label="Reincidências evitadas"
                onChange={(v) => setI("recurrences_avoided", v)}
              />
            </div>
          ) : (
            <div className="grid gap-2 md:grid-cols-3">
              <NumField
                label="Tempo antes (min/exec)"
                onChange={(v) => setI("time_before_min", v)}
              />
              <NumField
                label="Tempo depois (min/exec)"
                onChange={(v) => setI("time_after_min", v)}
              />
              <NumField
                label="Execuções por mês"
                onChange={(v) => setI("executions_per_month", v)}
              />
              <NumField label="Pessoas envolvidas" onChange={(v) => setI("people_count", v)} />
              <NumField label="Valor da hora (R$)" onChange={(v) => setI("hourly_cost", v)} />
              <NumField
                label="Custo/consumo anterior (R$)"
                onChange={(v) => setI("material_cost_before", v)}
              />
              <NumField
                label="Custo/consumo atual (R$)"
                onChange={(v) => setI("material_cost_after", v)}
              />
              <NumField
                label="Horas de parada evitadas"
                onChange={(v) => setI("downtime_hours_avoided", v)}
              />
              <NumField
                label="Custo por hora parada (R$)"
                onChange={(v) => setI("downtime_hourly_cost", v)}
              />
            </div>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Custo da implementação (R$)">
            <Input
              type="number"
              step="0.01"
              value={implementationCost}
              onChange={(e) => setImplementationCost(e.target.value)}
            />
          </Field>
          <Field label="Observação da validação (obrigatória para Validado)">
            <Input value={validationNote} onChange={(e) => setValidationNote(e.target.value)} />
          </Field>
        </div>

        {gainType === "seguranca" ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-200">
            <div className="flex items-center gap-2 font-medium">
              <ShieldCheck className="h-4 w-4" /> Ganho de segurança
            </div>
            <div className="mt-1 text-amber-100/80">
              Métricas físicas exibidas separadamente. Não há conversão automática em R$ sem
              metodologia cadastrada e validada.
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card/40 p-3 text-sm">
            <div className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
              Memória de cálculo
            </div>
            <pre className="whitespace-pre-wrap font-mono text-xs text-foreground">
              {calc.memory || "(informe os dados)"}
            </pre>
            <div className="mt-2 text-[11px] italic text-muted-foreground">
              Fórmula: {calc.formula || "-"}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
              <Stat label="Mensal" value={fmtBRL(calc.valueMonth)} />
              <Stat label="Anual (projeção)" value={fmtBRL(calc.valueYear)} highlight />
              <Stat label="Retorno líquido" value={fmtBRL(calc.netReturn)} />
              <Stat label="ROI" value={calc.roi != null ? `${calc.roi.toFixed(1)}%` : "—"} />
              <Stat
                label="Payback (meses)"
                value={calc.payback != null ? calc.payback.toFixed(1) : "—"}
              />
              <Stat
                label="HH/mês"
                value={calc.manHoursMonth ? calc.manHoursMonth.toFixed(1) : "—"}
              />
            </div>
            <div className="mt-2 text-[10px] text-muted-foreground">
              Projeção anual = média do período medido × 12. Valores só entram no dashboard oficial
              quando o status for "Validado".
            </div>
          </div>
        )}

        <div className="rounded-lg border border-neon/30 bg-neon/5 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-neon">
              <Sparkles className="h-3 w-3" /> Análise IA
            </div>
            <Button size="sm" variant="outline" onClick={irisAnalyze} disabled={irisLoading}>
              {irisLoading && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              {irisResult ? "Reanalisar" : "Analisar coerência do ganho"}
            </Button>
          </div>
          {irisResult && (
            <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap text-xs text-foreground">
              {irisResult}
            </pre>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              if (status === "validado" && !validationNote) {
                toast.error("Informe a observação de validação");
                return;
              }
              save.mutate();
            }}
            disabled={save.isPending}
            className="gap-2"
          >
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar ganho
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function NumField({ label, onChange }: { label: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <Input type="number" step="0.01" onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-background/40 p-2">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div
        className={`mt-1 font-display text-sm font-semibold ${highlight ? "text-neon" : "text-foreground"}`}
      >
        {value}
      </div>
    </div>
  );
}
