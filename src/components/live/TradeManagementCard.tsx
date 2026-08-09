import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { DecisionObject } from "@/lib/engines/backtestDecisionEngine";
import { cn } from "@/lib/utils";

/**
 * TradeManagementCard (comando master §52–§54, §64, §98).
 *
 * A CONFIRMAÇÃO vem do BacktestDecisionEngine (evidência histórica validada),
 * nunca de uma nota agregada. Valores ausentes mostram AGUARDANDO DADOS — jamais
 * um número inventado (§53). O painel de evidências é secundário (§64).
 */

function price(value: number | null): string {
  return value !== null && Number.isFinite(value) ? value.toFixed(2) : "AGUARDANDO DADOS";
}

const DECISION_LABEL: Record<DecisionObject["decision"], string> = {
  ENTER_LONG: "ENTRADA CONFIRMADA — COMPRA",
  ENTER_SHORT: "ENTRADA CONFIRMADA — VENDA",
  WAIT: "AGUARDAR",
  REJECT: "ENTRADA REJEITADA",
};

export function TradeManagementCard({
  decision,
  entryState,
  operationStatus,
  operationDetail,
}: {
  decision: DecisionObject | null;
  entryState?: string;
  operationStatus?: string | null;
  operationDetail?: string | null;
}) {
  if (!decision) {
    return (
      <Card className="border-border/70 bg-panel p-3">
        <p className="text-[10px] font-medium tracking-widest text-muted-foreground">
          GERENCIAMENTO
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          AGUARDANDO DADOS — nenhuma análise ainda.
        </p>
      </Card>
    );
  }

  const confirmed = decision.decision === "ENTER_LONG" || decision.decision === "ENTER_SHORT";
  const condition = confirmed
    ? "VALIDADA"
    : decision.evidenceConfidence === "INSUFFICIENT"
      ? "AMOSTRA INSUFICIENTE"
      : "NÃO VALIDADA";
  const tone = confirmed
    ? decision.decision === "ENTER_LONG"
      ? "text-bull"
      : "text-bear"
    : decision.decision === "REJECT"
      ? "text-bear"
      : "text-muted-foreground";

  const stateGlow = confirmed
    ? "nexus-glow-bull"
    : decision.decision === "REJECT"
      ? "nexus-glow-bear"
      : "";

  return (
    <Card className={"nexus-card flex flex-col gap-2 p-3 transition-shadow " + stateGlow}>
      <div className="flex items-center justify-between">
        <p className="nexus-eyebrow">GERENCIAMENTO — {decision.instrument}</p>
        <div className="flex items-center gap-1">
          {operationStatus && (
            <Badge variant="outline" className="border-primary/60 text-primary">
              {operationStatus}
            </Badge>
          )}
          {entryState && (
            <Badge variant="outline" className="border-border text-muted-foreground">
              {entryState}
            </Badge>
          )}
        </div>
      </div>

      <p className={cn("font-display text-xl font-bold tracking-wide", tone)}>
        {DECISION_LABEL[decision.decision]}
      </p>
      {operationDetail && <p className="text-[10px] text-muted-foreground">{operationDetail}</p>}
      {confirmed && (
        <p className="text-[10px] text-muted-foreground">
          Confirmada PELOS CRITÉRIOS DO SISTEMA (evidência histórica validada) — resultado nunca é
          garantido.
        </p>
      )}

      <div className="nexus-value grid grid-cols-2 gap-x-4 gap-y-1.5 text-[15px]">
        <Row label="ENTRADA" value={price(decision.entryPrice)} strong />
        <Row label="STOP" value={price(decision.stopPrice)} strong />
        <Row label="1º CONTRATO · 3R" value={price(decision.partialPrice)} />
        <Row label="2º CONTRATO · 5R" value={price(decision.targetPrice)} />
        <Row label="3º CONTRATO" value="RUNNER ESTRUTURAL" />
        <Row
          label="RISCO"
          value={
            decision.riskPoints !== null
              ? `${decision.riskPoints.toFixed(0)} pts`
              : "AGUARDANDO DADOS"
          }
        />
        <Row
          label="RETORNO"
          value={
            decision.rewardPoints !== null
              ? `${decision.rewardPoints.toFixed(0)} pts`
              : "AGUARDANDO DADOS"
          }
        />
        <Row
          label="RR"
          value={
            decision.riskRewardRatio !== null ? `1:${decision.riskRewardRatio.toFixed(1)}` : "—"
          }
        />
        <Row
          label="CONTRATOS"
          value={
            decision.recommendedContracts !== null
              ? String(decision.recommendedContracts)
              : "AGUARDANDO DADOS"
          }
          strong
        />
      </div>
      {decision.strategyId && (
        <p className="font-mono text-[10px] text-muted-foreground">
          Técnica: {decision.strategyId} · {decision.strategyVersion} · regime{" "}
          {decision.marketRegime}
        </p>
      )}

      {/* §74: motivos explícitos da decisão/rejeição. */}
      <div className="flex flex-col gap-0.5 text-[11px]">
        {(confirmed ? decision.decisionReasons : decision.rejectionReasons)
          .slice(0, 6)
          .map((reason, i) => (
            <p key={i} className={confirmed ? "text-muted-foreground" : "text-warn"}>
              • {reason}
            </p>
          ))}
      </div>

      {/* Painel de evidências — SECUNDÁRIO: CONFIGURAÇÃO IDENTIFICADA vs base histórica. */}
      <p className="border-t border-border/40 pt-2 text-[9px] tracking-widest text-muted-foreground">
        CONFIGURAÇÃO IDENTIFICADA — CONDIÇÃO ATUAL: {condition}
      </p>
      <div className="grid grid-cols-3 gap-1 text-center font-mono text-[10px] text-muted-foreground sm:grid-cols-8">
        <Cell label="CASOS" value={String(decision.similarCases)} />
        <Cell
          label="WIN RATE"
          value={decision.winRate !== null ? `${decision.winRate.toFixed(0)}%` : "—"}
        />
        <Cell
          label="PF"
          value={decision.profitFactor !== null ? decision.profitFactor.toFixed(2) : "—"}
        />
        <Cell
          label="EXPECT."
          value={decision.expectancyR !== null ? `${decision.expectancyR.toFixed(2)}R` : "—"}
        />
        <Cell label="OOS" value={decision.outOfSampleValidated ? "OK" : "—"} />
        <Cell label="WALK-FWD" value={decision.walkForwardStable ? "OK" : "—"} />
        <Cell
          label="MFE MÉD."
          value={decision.averageMfeR !== null ? `${decision.averageMfeR.toFixed(2)}R` : "—"}
        />
        <Cell
          label="MAE MÉD."
          value={decision.averageMaeR !== null ? `${decision.averageMaeR.toFixed(2)}R` : "—"}
        />
      </div>
      <p className="font-mono text-[9px] text-muted-foreground">
        Drawdown histórico:{" "}
        {decision.maxDrawdown !== null ? `${decision.maxDrawdown.toFixed(2)}R` : "—"} · Deriva:{" "}
        {decision.marketDrift} · Saúde da técnica: {decision.strategyHealth}
      </p>
    </Card>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className={cn(strong && "font-bold")}>{value}</span>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[8px] tracking-widest">{label}</p>
      <p className="font-bold text-foreground">{value}</p>
    </div>
  );
}
