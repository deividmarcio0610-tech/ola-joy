import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ActionPlan5W2H as PlanType, Priority, RecordStatusV2 } from "@/lib/analysis-v2";

const PRIORITIES: Priority[] = ["baixa", "media", "alta", "critica"];
const STATUSES: RecordStatusV2[] = [
  "rascunho",
  "pendente",
  "aguardando_analise",
  "aguardando_aprovacao",
  "em_tratamento",
  "aguardando_evidencia",
  "concluido",
];

export function ActionPlan5W2H({
  plan,
  onChange,
  disabled,
}: {
  plan: PlanType;
  onChange: (p: PlanType) => void;
  disabled?: boolean;
}) {
  function upd<K extends keyof PlanType>(k: K, v: PlanType[K]) {
    onChange({ ...plan, [k]: v });
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="O que será feito">
            <Textarea rows={2} value={plan.o_que} onChange={(e) => upd("o_que", e.target.value)} disabled={disabled} />
          </Field>
          <Field label="Por que será feito">
            <Textarea rows={2} value={plan.por_que} onChange={(e) => upd("por_que", e.target.value)} disabled={disabled} />
          </Field>
          <Field label="Onde">
            <Input value={plan.onde} onChange={(e) => upd("onde", e.target.value)} disabled={disabled} />
          </Field>
          <Field label="Quando (prazo)">
            <Input value={plan.quando} onChange={(e) => upd("quando", e.target.value)} disabled={disabled} />
          </Field>
          <Field label="Quem (responsável)">
            <Input value={plan.quem} onChange={(e) => upd("quem", e.target.value)} disabled={disabled} />
          </Field>
          <Field label="Como será executado">
            <Textarea rows={2} value={plan.como} onChange={(e) => upd("como", e.target.value)} disabled={disabled} />
          </Field>
          <Field label="Quanto (custo estimado)">
            <Input value={plan.quanto} onChange={(e) => upd("quanto", e.target.value)} disabled={disabled} />
          </Field>
          <Field label="Equipe">
            <Input value={plan.equipe} onChange={(e) => upd("equipe", e.target.value)} disabled={disabled} />
          </Field>
          <Field label="Data de início">
            <Input type="date" value={plan.data_inicio ?? ""} onChange={(e) => upd("data_inicio", e.target.value || null)} disabled={disabled} />
          </Field>
          <Field label="Data limite">
            <Input type="date" value={plan.data_limite ?? ""} onChange={(e) => upd("data_limite", e.target.value || null)} disabled={disabled} />
          </Field>
          <Field label="Prioridade">
            <Select value={plan.prioridade} onValueChange={(v) => upd("prioridade", v as Priority)} disabled={disabled}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Situação">
            <Select value={plan.situacao} onValueChange={(v) => upd("situacao", v as RecordStatusV2)} disabled={disabled}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Evidência necessária para encerramento">
          <Textarea rows={2} value={plan.evidencia_necessaria} onChange={(e) => upd("evidencia_necessaria", e.target.value)} disabled={disabled} />
        </Field>
        <Field label="Observações">
          <Textarea rows={2} value={plan.observacoes} onChange={(e) => upd("observacoes", e.target.value)} disabled={disabled} />
        </Field>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
