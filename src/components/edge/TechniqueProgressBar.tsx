import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { T4Progress } from "@/lib/t4/progress";
import type { TradeSignalSnapshot } from "@/lib/t4/signalSnapshot";
import { cn } from "@/lib/utils";

/**
 * BARRA DA TÉCNICA — 0 → 100% em destaque no topo do Command Center.
 *
 * O percentual é o `computeT4Progress` REAL (recalculado por frame/candle/
 * evidência; sobe e desce). Em 100% + snapshot válido, a barra vira verde e
 * declara a ENTRADA VALIDADA — a ordem simulada é posicionada e o sistema
 * passa a esperar o preço bater (LiveOutcomeTracker). Nunca timer/animação.
 */
export function TechniqueProgressBar({
  progress,
  snapshot,
}: {
  progress: T4Progress;
  snapshot: TradeSignalSnapshot | null;
}) {
  const confirmed = progress.percent === 100 && snapshot !== null;
  return (
    <Card className="border-border/70 bg-panel p-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-[10px] font-medium tracking-widest text-muted-foreground">
          TÉCNICA T4 — CARREGAMENTO REAL
        </p>
        <Badge
          variant="outline"
          className={cn(
            "font-mono text-[10px]",
            confirmed
              ? "border-bull text-bull"
              : progress.status === "ANALISANDO"
                ? "border-primary text-primary"
                : "border-border text-muted-foreground",
          )}
        >
          {confirmed ? "100% — ENTRADA VALIDADA" : `PRÓXIMO PASSO: ${progress.currentStepLabel}`}
        </Badge>
        <span
          className={cn(
            "ml-auto font-display text-2xl font-bold",
            confirmed ? "text-bull" : "text-primary",
          )}
        >
          {progress.percent}%
        </span>
      </div>
      <div className="mt-2 h-3 overflow-hidden rounded-full bg-border/40">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            confirmed ? "animate-pulse bg-bull" : "bg-primary",
          )}
          style={{ width: `${progress.percent}%` }}
        />
      </div>
      {/* Réguas dos degraus: cada marco é um fato do pipeline, não decoração. */}
      <div className="mt-1 flex justify-between font-mono text-[8px] tracking-wide text-muted-foreground">
        <span>CAPTURA</span>
        <span>PROFIT</span>
        <span>GRÁFICO</span>
        <span>PREÇOS</span>
        <span>CLOCK</span>
        <span>ESTRUTURA</span>
        <span>LIQUIDEZ</span>
        <span>CONTRAPONTO</span>
        <span>GATES</span>
        <span className={confirmed ? "font-bold text-bull" : ""}>ENTRADA</span>
      </div>
    </Card>
  );
}
