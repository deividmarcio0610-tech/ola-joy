import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { AnalysisResult } from "@/lib/engines/types";
import {
  buildManagementView,
  type LivePriceInfo,
  type ManagementLevel,
} from "@/lib/t4/managementView";
import type { TradeSignalSnapshot } from "@/lib/t4/signalSnapshot";
import { cn } from "@/lib/utils";

function Field({
  label,
  text,
  tone,
  highlight,
}: {
  label: string;
  text: string;
  tone?: "bull" | "bear" | "warn" | "neutral";
  highlight?: boolean;
}) {
  return (
    <div className={cn(highlight && "rounded-md border border-bull/60 bg-bull/10 px-2 py-1")}>
      <p className="text-[9px] tracking-widest text-muted-foreground">{label}</p>
      <p
        className={cn(
          "font-mono text-sm font-semibold",
          tone === "bull" && "text-bull",
          tone === "bear" && "text-bear",
          tone === "warn" && "text-warn",
        )}
      >
        {text}
      </p>
    </div>
  );
}

function levelText(level: ManagementLevel | null): string {
  return level ? level.value : "OCULTO ATÉ CONFIRMAR";
}

/**
 * GERENCIAMENTO AO VIVO (comando gerenciamento §1–§10).
 *
 * Usa o view-model puro `buildManagementView` — o MESMO consumido pela aba
 * Gerenciamento, então os valores são idênticos por construção:
 *
 * - <100%: "PREÇO ATUAL: xxxxxx / STATUS: ANALISANDO" em tempo real (nunca
 *   "AGUARDANDO DADOS" no preço durante a análise); a entrada candidata segue
 *   o mercado em tom neutro; stop/3R/5R/runner OCULTOS.
 * - 100% + snapshot + signalId: entrada CONGELADA (destaque verde) e níveis
 *   exclusivamente do snapshot; o mercado segue em "MERCADO AGORA".
 * - Preço/calibração não confiável: "PREÇO NÃO CONFIÁVEL" — nada congela
 *   errado, nenhum número é inventado nem interpolado.
 */
export function ManagementPanel({
  analysis,
  asset,
  snapshot = null,
  priceInfo,
  tickSize = null,
  decimals = 0,
  sessionActive = false,
  managementPaused = null,
}: {
  analysis: AnalysisResult | null;
  asset: string;
  snapshot?: TradeSignalSnapshot | null;
  priceInfo: LivePriceInfo;
  tickSize?: number | null;
  decimals?: number;
  sessionActive?: boolean;
  managementPaused?: string | null;
}) {
  const view = buildManagementView({
    sessionActive,
    analysis,
    snapshot,
    priceInfo,
    tickSize,
    decimals,
    managementPaused,
  });
  const confirmed = view.status === "CONFIRMADO";
  const directionTone = view.direction === "COMPRA" ? "bull" : "bear";

  return (
    <Card
      className={cn(
        "border-border/70 bg-panel p-3",
        confirmed && view.direction === "COMPRA" && "border-bull/60",
        confirmed && view.direction === "VENDA" && "border-bear/60",
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-[10px] font-medium tracking-widest text-muted-foreground">
          T4 — GERENCIAMENTO AO VIVO · REPLAY E AO VIVO USAM O MESMO MOTOR
        </p>
        <Badge
          variant="outline"
          className={cn(
            "text-[10px]",
            confirmed
              ? view.direction === "COMPRA"
                ? "border-bull text-bull"
                : "border-bear text-bear"
              : view.status === "ANALISANDO"
                ? "border-primary text-primary"
                : "border-border text-muted-foreground",
          )}
        >
          {confirmed ? `CONFIRMADO — ${view.direction}` : `STATUS: ${view.status}`}
        </Badge>
      </div>

      {/* Campo principal contínuo: preço vivo + status, sem recarregar a página. */}
      <div className="mb-3 flex flex-wrap items-baseline gap-x-6 gap-y-1 rounded-md border border-border/60 bg-background/60 p-2">
        <div>
          <p className="text-[9px] tracking-widest text-muted-foreground">{view.livePriceLabel}</p>
          <p
            className={cn(
              "font-mono text-xl font-bold",
              view.livePriceTrusted ? "text-foreground" : "text-warn",
            )}
          >
            {view.livePrice}
          </p>
        </div>
        <div>
          <p className="text-[9px] tracking-widest text-muted-foreground">STATUS</p>
          <p
            className={cn(
              "font-mono text-sm font-semibold",
              confirmed
                ? view.direction === "COMPRA"
                  ? "text-bull"
                  : "text-bear"
                : "text-primary",
            )}
          >
            {view.status}
          </p>
        </div>
        {!view.livePriceTrusted && view.priceReason && (
          <p className="basis-full text-[10px] text-warn">{view.priceReason}</p>
        )}
        {/* Gestão parada nunca fica muda: o card diria "operação em curso" e
            estaria congelado sem explicar por quê. */}
        {view.managementPausedReason && (
          <p className="basis-full rounded border border-bear/50 bg-bear/10 px-2 py-1 text-[11px] font-semibold text-bear">
            GESTÃO PAUSADA — stop, 3R e 5R não estão sendo avaliados. {view.managementPausedReason}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-6">
        <Field label="ATIVO" text={asset} />
        <Field label="PERÍODO" text="1 minuto" />
        {confirmed ? (
          <>
            <Field label="DIREÇÃO" text={view.direction ?? "—"} tone={directionTone} />
            <Field label="SETUP T4" text={view.setup ?? "—"} />
            {/* §4: entrada congelada EXATA do snapshot, destacada em verde. */}
            <Field
              label="ENTRADA CONFIRMADA"
              text={view.entry?.value ?? "—"}
              tone="bull"
              highlight
            />
            <Field label="STOP" text={levelText(view.stop)} tone="bear" />
            <Field label="1º CONTRATO · 3R" text={levelText(view.threeR)} tone="bull" />
            <Field label="2º CONTRATO · 5R" text={levelText(view.fiveR)} tone="bull" />
            <Field label="3º CONTRATO" text={view.runner ?? "RUNNER ESTRUTURAL"} tone="bull" />
            <Field label="SIGNAL ID" text={view.signalId ?? "—"} />
          </>
        ) : (
          <>
            {/* §3: a entrada candidata segue o mercado — neutra, nunca congelada. */}
            <Field
              label="ENTRADA (EM FORMAÇÃO)"
              text={view.entry ? view.entry.value : view.livePriceTrusted ? "—" : "BLOQUEADA"}
              tone="neutral"
            />
            <Field label="STOP" text="OCULTO ATÉ CONFIRMAR" tone="neutral" />
            <Field label="3R / 5R" text="OCULTOS ATÉ CONFIRMAR" tone="neutral" />
            <Field label="RUNNER" text="OCULTO ATÉ CONFIRMAR" tone="neutral" />
          </>
        )}
        <Field
          label="ESTADO DA LEITURA"
          text={analysis?.reading.label ?? "AGUARDANDO"}
          tone={analysis?.reading.sufficient ? "bull" : "warn"}
        />
      </div>

      {!confirmed && analysis?.blockers.length ? (
        <ul className="mt-3 space-y-1 rounded-md border border-warn/40 bg-warn/10 p-2 text-[11px] text-warn">
          {analysis.blockers.map((blocker) => (
            <li key={blocker}>• {blocker}</li>
          ))}
        </ul>
      ) : null}
      <p className="mt-3 text-[10px] text-muted-foreground">
        Quantidade de contratos é calculada somente por risco financeiro configurado, stop, valor do
        ponto, limites operacionais e drawdown. O sistema não executa ordens.
      </p>
    </Card>
  );
}
