import { AIChatPanel } from "@/components/live/AIChatPanel";
import { EvidenceTable } from "@/components/live/EvidenceTable";
import { ManagementPanel } from "@/components/live/ManagementPanel";
import { TradeManagementCard } from "@/components/live/TradeManagementCard";
import { T4ProgressCard } from "@/components/t4/T4ProgressCard";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { DecisionObject } from "@/lib/engines/backtestDecisionEngine";
import type { AnalysisResult, Candle, ChatEntry } from "@/lib/engines/types";
import type { LivePriceInfo } from "@/lib/t4/managementView";
import type { T4Progress } from "@/lib/t4/progress";
import type { TradeSignalSnapshot } from "@/lib/t4/signalSnapshot";

/**
 * COCKPIT ÚNICO DE ANÁLISE — replay e ao vivo usam a MESMA leitura.
 *
 * O preview/gráfico grande foi removido da UI (comando §6): o processamento
 * (captura→OCR→chartClock→candles→T4→gravação) continua rodando no serviço
 * global; a UI mostra o painel T4 — LEITURA TÉCNICA 0–100%, cujo percentual
 * vem exclusivamente do estado REAL do pipeline. Nada aqui inventa dados — o
 * que não existe aparece como AGUARDANDO.
 */
export interface AnalysisCockpitProps {
  asset: string;
  candles: Candle[];
  analysis: AnalysisResult | null;
  decision: DecisionObject | null;
  entryState?: string;
  operationStatus?: string | null;
  operationDetail?: string | null;
  /** Progresso 0–100 da leitura técnica, derivado do estado real. */
  progress: T4Progress;
  /** Snapshot congelado do sinal confirmado — única fonte dos níveis em 100%. */
  snapshot: TradeSignalSnapshot | null;
  chat: ChatEntry[];
  aiProvider: { configured: boolean; model: string; provider: string };
  /** Rótulo do pregão em revisão; ao vivo é a data de hoje. */
  tradingDateLabel?: string;
  /**
   * Conversão pixel→preço confiável. FALSE não significa "sem análise": a
   * leitura estrutural roda igual e só os números de preço ficam indisponíveis.
   */
  priceScaleReady?: boolean;
  /** Linha única e consolidada do estado da calibração. */
  calibrationSummary?: string;
  /** Preço vivo (fonte única do gerenciamento). Ausente: derivado da análise. */
  priceInfo?: LivePriceInfo;
  /** Incremento real do ativo lido na escala — arredondamento único (§9). */
  tickSize?: number | null;
  /** Casas decimais reconhecidas na escala. */
  decimals?: number;
  sessionActive?: boolean;
  /** Motivo real quando a gestão da operação confirmada está pausada. */
  managementPaused?: string | null;
}

export function AnalysisCockpit({
  asset,
  candles,
  analysis,
  decision,
  entryState,
  operationStatus,
  operationDetail,
  progress,
  snapshot,
  chat,
  aiProvider,
  tradingDateLabel,
  priceScaleReady = true,
  calibrationSummary,
  priceInfo,
  tickSize = null,
  decimals = 0,
  sessionActive = false,
  managementPaused = null,
}: AnalysisCockpitProps) {
  // Replay: sem feed de preço vivo dedicado, o preço do último candle fechado
  // cumpre o papel — mesma fonte que alimentou o motor.
  const effectivePriceInfo: LivePriceInfo = priceInfo ?? {
    price: priceScaleReady ? (analysis?.price ?? null) : null,
    trusted: priceScaleReady && analysis !== null,
    reason: priceScaleReady
      ? analysis
        ? null
        : "Aguardando primeiro candle fechado."
      : (calibrationSummary ?? "Escala de preços em calibração."),
    at: analysis?.t ?? null,
  };
  return (
    // COCKPIT NEXUS: contexto | leitura T4 dominante | decisão. Empilha no mobile.
    <div className="grid gap-3 xl:grid-cols-[250px_minmax(0,1fr)_350px]">
      {/* Coluna esquerda — CONTEXTO DO MERCADO */}
      <div className="flex flex-col gap-3 xl:order-1">
        <Card className="nexus-card nexus-enter gap-2 p-3">
          <p className="nexus-eyebrow">Contexto do mercado</p>
          {/* DOIS ESTADOS INDEPENDENTES: análise ≠ calibração de preço. */}
          <div className="flex flex-wrap gap-1.5">
            <Badge
              variant="outline"
              className={analysis ? "border-bull text-bull" : "border-border text-muted-foreground"}
            >
              {analysis ? "ANÁLISE ATIVA" : "AGUARDANDO GRÁFICO"}
            </Badge>
            <Badge
              variant="outline"
              className={priceScaleReady ? "border-bull text-bull" : "border-warn text-warn"}
            >
              {priceScaleReady ? "PREÇOS DISPONÍVEIS" : "PREÇOS INDISPONÍVEIS (CALIBRANDO)"}
            </Badge>
          </div>
          {!priceScaleReady && calibrationSummary && (
            <p className="text-[10px] leading-snug text-warn">{calibrationSummary}</p>
          )}
          <div className="flex flex-col gap-1.5 text-xs">
            <ContextRow label="ATIVO" value={asset} accent />
            <ContextRow label="REGIME" value={analysis?.regime.regime ?? "—"} />
            <ContextRow label="LEITURA" value={analysis?.reading.label ?? "AGUARDANDO"} />
            <ContextRow label="ESCALA" value={priceScaleReady ? "CALIBRADA" : "CALIBRANDO"} />
            <ContextRow label="CANDLES FECHADOS" value={String(candles.length)} />
            <ContextRow label="DERIVA" value={decision?.marketDrift ?? "—"} />
            <ContextRow label="SAÚDE DA TÉCNICA" value={decision?.strategyHealth ?? "—"} />
            <ContextRow
              label="PREGÃO"
              value={tradingDateLabel ?? new Date().toLocaleDateString("pt-BR")}
            />
          </div>
        </Card>
        {analysis && (
          <Card className="nexus-card gap-2 p-3">
            <p className="nexus-eyebrow">Sequência causal — {analysis.sequence.label}</p>
            <div className="flex flex-col gap-1 font-mono text-[11px]">
              {analysis.sequence.stages.map((stage) => (
                <span
                  key={stage.stage}
                  title={stage.note}
                  className={stage.met ? "text-bull" : "text-muted-foreground"}
                >
                  {stage.met ? "✓" : "·"} {stage.stage}
                </span>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Coluna central — T4 LEITURA TÉCNICA (substitui o gráfico grande) */}
      <div className="flex min-w-0 flex-col gap-3 xl:order-2">
        <T4ProgressCard asset={asset} progress={progress} snapshot={snapshot} />
        <EvidenceTable evidences={analysis?.evidences ?? []} />
        <ManagementPanel
          analysis={analysis}
          asset={asset}
          snapshot={snapshot}
          priceInfo={effectivePriceInfo}
          tickSize={tickSize}
          decimals={decimals}
          sessionActive={sessionActive}
          managementPaused={managementPaused}
        />
      </div>

      {/* Coluna direita — DECISÃO + ADVERSARIAL + IA */}
      <div className="flex flex-col gap-3 xl:order-3">
        <div className="nexus-enter">
          <TradeManagementCard
            decision={decision}
            entryState={entryState}
            operationStatus={operationStatus ?? null}
            operationDetail={operationDetail ?? null}
          />
        </div>
        {analysis && analysis.contradictions.length > 0 && (
          <Card className="nexus-card gap-2 p-3">
            <p className="nexus-eyebrow">
              Motor adversarial — por que não operar ({analysis.regime.regime})
            </p>
            <ul className="flex flex-col gap-1 text-xs">
              {analysis.contradictions.map((item) => (
                <li key={item.id} className="flex items-start gap-2">
                  <Badge
                    variant="outline"
                    className={
                      item.severity === "bloqueia"
                        ? "border-bear text-bear"
                        : item.severity === "alerta"
                          ? "border-warn text-warn"
                          : "border-border text-muted-foreground"
                    }
                  >
                    {item.severity}
                  </Badge>
                  <span>
                    {item.description}{" "}
                    <span className="font-mono text-[10px] text-muted-foreground">
                      [{item.evidence}]
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <Card className="nexus-card h-64 overflow-hidden p-0">
          <AIChatPanel entries={chat} provider={aiProvider} />
        </Card>
      </div>
    </div>
  );
}

function ContextRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="nexus-eyebrow">{label}</span>
      <span
        className={
          "nexus-value text-right " + (accent ? "font-bold text-primary" : "text-foreground")
        }
      >
        {value}
      </span>
    </div>
  );
}
