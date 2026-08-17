import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { AnalysisResult } from "@/lib/engines/types";
import type { LiveOperationResult } from "@/lib/engines/liveOutcome";
import { formatManagedPrice } from "@/lib/t4/managementView";
import type { T4Progress } from "@/lib/t4/progress";
import type { TradeSignalSnapshot } from "@/lib/t4/signalSnapshot";
import { cn } from "@/lib/utils";

/**
 * PAINEL DE ENTRADA DO COMMAND CENTER (coluna direita do dashboard).
 *
 * <100%: "SEM ENTRADA — AGUARDANDO CONDIÇÕES" + CONDIÇÕES DE CONFIRMAÇÃO
 * reais (bloqueios do motor + etapas pendentes da sequência causal).
 *
 * 100% + snapshot: ORDEM SIMULADA POSICIONADA — níveis EXCLUSIVAMENTE do
 * snapshot congelado, e o status vivo do LiveOutcomeTracker mostrando a
 * espera do preço bater a entrada (AGUARDANDO GATILHO → ENTRADA ATINGIDA →
 * PARCIAL 3R → ALVO 5R/RUNNER ou STOP). Nenhuma ordem real é enviada.
 */
export function OrderTicket({
  progress,
  snapshot,
  analysis,
  operation,
  tickSize,
  decimals,
}: {
  progress: T4Progress;
  snapshot: TradeSignalSnapshot | null;
  analysis: AnalysisResult | null;
  operation: LiveOperationResult | null;
  tickSize: number | null;
  decimals: number;
}) {
  const price = (value: number) => formatManagedPrice(value, tickSize, decimals);
  const poi = analysis?.mainPoi ?? null;

  return (
    <div className="flex flex-col gap-3">
      {/* ZONA / POI — dados reais do motor de POI. */}
      <Card className="border-border/70 bg-panel p-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-medium tracking-widest text-muted-foreground">
            ZONA / POI
          </p>
          {poi && (
            <Badge variant="outline" className="font-mono text-[10px] text-primary">
              FORÇA {Math.round(poi.strength)}
            </Badge>
          )}
        </div>
        {poi ? (
          <div className="mt-2 font-mono text-sm">
            <p className="font-semibold text-foreground">
              {price(poi.lower)} – {price(poi.upper)}
            </p>
            <p className="mt-0.5 text-[10px] uppercase text-muted-foreground">{poi.kind}</p>
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            Nenhum POI dominante mapeado neste momento.
          </p>
        )}
      </Card>

      {snapshot ? (
        <Card
          className={cn(
            "border-2 p-3",
            snapshot.direction === "COMPRA" ? "border-bull/70" : "border-bear/70",
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="font-display text-sm font-bold">
              ORDEM SIMULADA POSICIONADA —{" "}
              <span className={snapshot.direction === "COMPRA" ? "text-bull" : "text-bear"}>
                {snapshot.direction}
              </span>
            </p>
            <Badge
              variant="outline"
              className={cn(
                "font-mono text-[10px]",
                operation?.filled ? "border-bull text-bull" : "border-warn text-warn",
              )}
            >
              {operation?.status ?? "AGUARDANDO ENTRADA"}
            </Badge>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {operation?.filled
              ? "Preço bateu a entrada — gestão 3R/5R/runner ativa."
              : "Aguardando o preço bater a entrada. Níveis congelados do snapshot; nenhuma ordem real é enviada."}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 font-mono text-sm">
            <Row label="ENTRADA" value={price(snapshot.entry)} tone="bull" strong />
            <Row label="STOP" value={price(snapshot.initialStop)} tone="bear" strong />
            <Row label="1º CONTRATO · 3R" value={price(snapshot.threeR)} tone="bull" />
            <Row label="2º CONTRATO · 5R" value={price(snapshot.fiveR)} tone="bull" />
            <Row label="3º CONTRATO" value="RUNNER" tone="bull" />
            <Row label="SETUP" value={snapshot.setup} />
          </div>
          {operation?.detail && (
            <p className="mt-2 border-t border-border/40 pt-2 font-mono text-[10px] text-muted-foreground">
              {operation.detail}
            </p>
          )}
        </Card>
      ) : (
        <Card className="border-border/70 bg-panel p-3">
          <p className="font-display text-sm font-bold text-warn">
            SEM ENTRADA — AGUARDANDO CONDIÇÕES
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            A ordem simulada só é posicionada com a técnica em 100% + snapshot validado. Sem setup
            válido = SEM ENTRADA.
          </p>
          <p className="mt-3 text-[9px] font-medium tracking-widest text-muted-foreground">
            CONDIÇÕES DE CONFIRMAÇÃO
          </p>
          {progress.blockers.length > 0 ? (
            <ul className="mt-1 flex flex-col gap-1 text-[11px] text-warn">
              {progress.blockers.map((blocker) => (
                <li key={blocker}>— {blocker}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[11px] text-muted-foreground">— aguardando leitura do motor</p>
          )}
        </Card>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  tone,
  strong,
}: {
  label: string;
  value: string;
  tone?: "bull" | "bear";
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[9px] tracking-widest text-muted-foreground">{label}</span>
      <span
        className={cn(
          strong && "font-bold",
          tone === "bull" && "text-bull",
          tone === "bear" && "text-bear",
        )}
      >
        {value}
      </span>
    </div>
  );
}
