import { Check, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  NOT_IDENTIFIED,
  NOT_READABLE,
  OPERATIONAL_STATUSES,
  PRINT_T4_STATUS_LABEL,
  formatReadable,
  type PrintAnalysis,
} from "@/lib/printAnalysis/contract";
import { cn } from "@/lib/utils";

/**
 * PAINEL LATERAL DA ANÁLISE.
 *
 * Todo campo que a IA não conseguiu ler aparece como "NÃO LEGÍVEL NO PRINT"
 * — nunca em branco e nunca aproximado. A confiança é rotulada como
 * "confiança da leitura", jamais como chance de ganho.
 */

const STATUS_TONE: Record<string, string> = {
  ENTRADA_CONFIRMADA: "border-bull text-bull",
  PRE_ENTRADA: "border-warn text-warn",
  APROXIMACAO_T4: "border-warn text-warn",
  T4_EM_FORMACAO: "border-primary text-primary",
  SEM_T4: "border-border text-muted-foreground",
  T4_INVALIDADA: "border-bear text-bear",
  INCONCLUSIVO: "border-border text-muted-foreground",
};

export function PrintDiagnosticPanel({
  analysis,
  corrections,
  model,
  repaired,
}: {
  analysis: PrintAnalysis;
  corrections: string[];
  model: string;
  repaired: boolean;
}) {
  const operational = OPERATIONAL_STATUSES.includes(analysis.status);
  const met = analysis.criteria.filter((item) => item.met);
  const missing = analysis.criteria.filter((item) => !item.met);

  return (
    <div className="flex flex-col gap-3">
      {/* ── DIAGNÓSTICO */}
      <Card className="border-border/70 bg-panel p-3">
        <p className="text-[10px] font-medium tracking-widest text-muted-foreground">DIAGNÓSTICO</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={cn("font-mono text-[11px]", STATUS_TONE[analysis.status])}
          >
            {PRINT_T4_STATUS_LABEL[analysis.status]}
          </Badge>
          <Badge
            variant="outline"
            className={cn(
              "font-mono text-[11px]",
              analysis.direction === "COMPRA" && "border-bull text-bull",
              analysis.direction === "VENDA" && "border-bear text-bear",
            )}
          >
            {analysis.direction}
          </Badge>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 font-mono text-xs">
          <Field label="ATIVO" value={analysis.symbol ?? NOT_IDENTIFIED} />
          <Field label="TIMEFRAME" value={analysis.timeframe ?? NOT_IDENTIFIED} />
        </dl>
        <div className="mt-3">
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] tracking-widest text-muted-foreground">
              CONFIANÇA DA LEITURA
            </span>
            <span className="font-mono text-sm font-bold text-foreground">
              {Math.round(analysis.confidence)}%
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${Math.max(0, Math.min(100, analysis.confidence))}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
            Mede a qualidade da leitura visual desta imagem. Não é probabilidade de lucro.
          </p>
          {analysis.confidenceFactors.length > 0 && (
            <ul className="mt-1.5 flex flex-col gap-0.5 text-[11px] text-muted-foreground">
              {analysis.confidenceFactors.map((factor) => (
                <li key={factor}>— {factor}</li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {/* ── CONFLUÊNCIAS */}
      <Card className="border-border/70 bg-panel p-3">
        <p className="text-[10px] font-medium tracking-widest text-muted-foreground">
          CONFLUÊNCIAS
        </p>
        {analysis.criteria.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            A IA não avaliou critérios nesta imagem.
          </p>
        ) : (
          <div className="mt-2 flex flex-col gap-2">
            <CriteriaGroup title={`CRITÉRIOS ATENDIDOS (${met.length})`} items={met} met />
            <CriteriaGroup
              title={`CRITÉRIOS AUSENTES (${missing.length})`}
              items={missing}
              met={false}
            />
          </div>
        )}
      </Card>

      {/* ── OPERAÇÃO */}
      <Card className="border-border/70 bg-panel p-3">
        <p className="text-[10px] font-medium tracking-widest text-muted-foreground">OPERAÇÃO</p>
        {!operational ? (
          <p className="mt-2 text-xs text-warn">
            {PRINT_T4_STATUS_LABEL[analysis.status]} — sem níveis de operação. Nada é sugerido
            enquanto o setup não existir no gráfico.
          </p>
        ) : (
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 font-mono text-xs">
            <Field label="ENTRADA" value={formatReadable(analysis.entry)} strong />
            <Field
              label="ZONA"
              value={
                analysis.entryZone.low.visible && analysis.entryZone.high.visible
                  ? `${formatReadable(analysis.entryZone.low)} – ${formatReadable(analysis.entryZone.high)}`
                  : NOT_READABLE
              }
            />
            <Field label="STOP" value={formatReadable(analysis.stop)} strong tone="bear" />
            <Field
              label="ALVO 1"
              value={formatReadable(analysis.targets[0] ?? { value: null, visible: false })}
              tone="bull"
            />
            <Field
              label="ALVO 2"
              value={formatReadable(analysis.targets[1] ?? { value: null, visible: false })}
              tone="bull"
            />
            <Field label="RISCO/RETORNO" value={riskReward(analysis)} />
          </dl>
        )}
        <p className="mt-2 border-t border-border/40 pt-2 text-[11px] text-muted-foreground">
          <span className="tracking-widest">INVALIDAÇÃO:</span>{" "}
          {analysis.invalidation ?? NOT_READABLE}
        </p>
      </Card>

      {/* ── ESTRUTURA */}
      <Card className="border-border/70 bg-panel p-3">
        <p className="text-[10px] font-medium tracking-widest text-muted-foreground">ESTRUTURA</p>
        <dl className="mt-2 flex flex-col gap-1.5 text-xs">
          <TextField label="ESTRUTURA" value={analysis.structure} />
          <TextField label="TENDÊNCIA" value={analysis.trend} />
          <TextField label="ROMPIMENTO" value={analysis.breakout} />
          <TextField label="PULLBACK" value={analysis.pullback} />
          <TextField
            label="SUPORTE"
            value={
              analysis.support.length
                ? analysis.support.map((item) => formatReadable(item)).join(" · ")
                : null
            }
          />
          <TextField
            label="RESISTÊNCIA"
            value={
              analysis.resistance.length
                ? analysis.resistance.map((item) => formatReadable(item)).join(" · ")
                : null
            }
          />
        </dl>
      </Card>

      {/* ── CENÁRIO CONDICIONAL */}
      {analysis.scenarios.length > 0 && (
        <Card className="border-border/70 bg-panel p-3">
          <p className="text-[10px] font-medium tracking-widest text-muted-foreground">
            O QUE PRECISA ACONTECER AGORA
          </p>
          <ul className="mt-2 flex flex-col gap-2 text-xs">
            {analysis.scenarios.map((scenario, index) => (
              <li key={`${scenario.condition}-${index}`} className="leading-snug">
                <span
                  className={cn(
                    "font-semibold",
                    scenario.direction === "COMPRA" && "text-bull",
                    scenario.direction === "VENDA" && "text-bear",
                    scenario.direction === "NEUTRO" && "text-muted-foreground",
                  )}
                >
                  Se {scenario.condition}
                </span>{" "}
                → {scenario.consequence}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Cenários condicionais. O preço não é obrigado a seguir nenhuma seta.
          </p>
        </Card>
      )}

      {/* ── EXPLICAÇÃO */}
      <Card className="border-border/70 bg-panel p-3">
        <p className="text-[10px] font-medium tracking-widest text-muted-foreground">EXPLICAÇÃO</p>
        <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-foreground">
          {analysis.explanation || "A IA não devolveu explicação para esta leitura."}
        </p>
        {analysis.imageIssues.length > 0 && (
          <ul className="mt-2 flex flex-col gap-0.5 text-[11px] text-warn">
            {analysis.imageIssues.map((issue) => (
              <li key={issue}>— {issue}</li>
            ))}
          </ul>
        )}
        {corrections.length > 0 && (
          <div className="mt-2 border-t border-border/40 pt-2">
            <p className="text-[10px] tracking-widest text-warn">AJUSTES DA VALIDAÇÃO</p>
            <ul className="mt-1 flex flex-col gap-0.5 text-[11px] text-muted-foreground">
              {corrections.map((item) => (
                <li key={item}>— {item}</li>
              ))}
            </ul>
          </div>
        )}
        <p className="mt-2 font-mono text-[10px] text-muted-foreground">
          modelo: {model}
          {repaired ? " · resposta corrigida em 1 rodada de reparo" : ""}
        </p>
      </Card>
    </div>
  );
}

function riskReward(analysis: PrintAnalysis): string {
  const entry = analysis.entry.value;
  const stop = analysis.stop.value;
  const target = analysis.targets[0]?.value ?? null;
  if (entry === null || stop === null || target === null) return NOT_READABLE;
  const risk = Math.abs(entry - stop);
  if (risk <= 0) return NOT_READABLE;
  return `${(Math.abs(target - entry) / risk).toFixed(2)} : 1`;
}

function CriteriaGroup({
  title,
  items,
  met,
}: {
  title: string;
  items: PrintAnalysis["criteria"];
  met: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className={cn("text-[10px] tracking-widest", met ? "text-bull" : "text-muted-foreground")}>
        {title}
      </p>
      <ul className="mt-1 flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-1.5 text-[11px]">
            {met ? (
              <Check className="mt-0.5 h-3 w-3 shrink-0 text-bull" />
            ) : (
              <X className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
            )}
            <span className={met ? "text-foreground" : "text-muted-foreground"}>
              {item.label}
              {item.note ? <span className="text-muted-foreground"> — {item.note}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Field({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "bull" | "bear";
}) {
  const unavailable = value === NOT_READABLE || value === NOT_IDENTIFIED;
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-[9px] tracking-widest text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "text-right",
          strong && !unavailable && "font-bold",
          unavailable && "text-[10px] text-muted-foreground",
          !unavailable && tone === "bull" && "text-bull",
          !unavailable && tone === "bear" && "text-bear",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function TextField({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-[9px] tracking-widest text-muted-foreground">{label}</dt>
      <dd className={cn("leading-snug", value ? "text-foreground" : "text-muted-foreground")}>
        {value ?? NOT_READABLE}
      </dd>
    </div>
  );
}
