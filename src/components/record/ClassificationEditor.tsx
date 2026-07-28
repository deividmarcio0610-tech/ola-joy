import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { AnalysisV2, ClassificationType } from "@/lib/analysis-v2";
import { classificationLabel } from "@/lib/analysis-v2";
import { useState } from "react";

const OPTIONS: ClassificationType[] = [
  "n3",
  "inspecao",
  "kaizen",
  "meio_ambiente",
  "condicao_insegura",
  "ato_inseguro",
  "desvio_operacional",
  "oportunidade_melhoria",
  "quase_acidente",
];

export function ClassificationEditor({
  analysis,
  onChange,
  disabled,
}: {
  analysis: AnalysisV2;
  onChange: (next: AnalysisV2["classification"] & { summary_type?: ClassificationType }) => void;
  disabled?: boolean;
}) {
  const [tipo, setTipo] = useState<ClassificationType>(analysis.classification.principal);
  const [justificativa, setJustificativa] = useState(analysis.classification.justificativa);
  const [confianca, setConfianca] = useState(String(analysis.classification.confianca));

  function apply() {
    onChange({
      ...analysis.classification,
      principal: tipo,
      principal_label: classificationLabel(tipo),
      justificativa,
      confianca: Math.min(100, Math.max(0, Number(confianca) || 0)),
      summary_type: tipo,
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Classificação principal</Badge>
          <span className="text-sm text-muted-foreground">
            Confiança da IA: {analysis.classification.confianca}%
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Tipo do registro</label>
            <Select
              value={tipo}
              onValueChange={(v) => setTipo(v as ClassificationType)}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPTIONS.map((o) => (
                  <SelectItem key={o} value={o}>
                    {classificationLabel(o)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Confiança (0–100)</label>
            <Input
              inputMode="numeric"
              value={confianca}
              onChange={(e) => setConfianca(e.target.value.replace(/\D/g, ""))}
              disabled={disabled}
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Justificativa</label>
          <Textarea
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value)}
            rows={3}
            disabled={disabled}
          />
        </div>

        {analysis.classification.criterios_atendidos.length > 0 && (
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
              Critérios atendidos
            </div>
            <ul className="list-inside list-disc text-sm">
              {analysis.classification.criterios_atendidos.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        )}
        {analysis.classification.criterios_nao_atendidos.length > 0 && (
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400">
              Critérios não atendidos
            </div>
            <ul className="list-inside list-disc text-sm">
              {analysis.classification.criterios_nao_atendidos.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        )}

        {analysis.classification.secundarias.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {analysis.classification.secundarias.map((s, i) => (
              <Badge key={i} variant="secondary">
                {s.label} · {s.confianca}%
              </Badge>
            ))}
          </div>
        )}

        <div className="flex justify-end">
          <Button size="sm" onClick={apply} disabled={disabled}>
            Aplicar classificação
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
