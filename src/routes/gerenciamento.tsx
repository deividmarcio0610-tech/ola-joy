import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { useAnalyzer } from "@/components/analyzerContext";
import { ManagementPanel } from "@/components/live/ManagementPanel";
import { TradeManagementCard } from "@/components/live/TradeManagementCard";
import { Card } from "@/components/ui/card";
import type { DecisionObject } from "@/lib/engines/backtestDecisionEngine";
import { store } from "@/lib/storage";

export const Route = createFileRoute("/gerenciamento")({
  component: ManagementPage,
  head: () => ({ meta: [{ title: "Gerenciamento — Analisador Visual T4" }] }),
});

/**
 * Aba GERENCIAMENTO (comando gerenciamento §11–§12.h).
 *
 * Consome o MESMO estado vivo do AnalyzerProvider que a Operação ao Vivo —
 * snapshot, signalId, análise, decisão e preço vivo persistem ao navegar
 * entre as rotas e os valores exibidos são idênticos por construção (mesmo
 * view-model, mesma fonte de preço, mesmo arredondamento pelo incremento).
 * A última decisão persistida no banco só aparece como fallback histórico
 * quando não há sessão viva.
 */
function ManagementPage() {
  const { live, liveAsset } = useAnalyzer();
  const [persistedDecision, setPersistedDecision] = useState<DecisionObject | null>(null);

  useEffect(() => {
    let active = true;
    void store.hydrate().then(() => {
      if (active) setPersistedDecision(store.lastDecision<DecisionObject>());
    });
    const timer = setInterval(
      () => setPersistedDecision(store.lastDecision<DecisionObject>()),
      2_000,
    );
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const decision = live.decision ?? persistedDecision;

  return (
    <div className="flex flex-col gap-3">
      <header>
        <h1 className="font-display text-2xl font-bold">Gerenciamento</h1>
        <p className="text-xs text-muted-foreground">
          Mesmo estado vivo da Operação ao Vivo: preço atual em tempo real, entrada congelada
          somente no sinal confirmado (snapshot imutável) e confirmação vinda da evidência histórica
          validada — nunca de um indicador arbitrário.
        </p>
      </header>

      <ManagementPanel
        analysis={live.analysis}
        asset={liveAsset}
        snapshot={live.signalSnapshot}
        priceInfo={live.priceInfo}
        tickSize={live.calibration.tickSize}
        decimals={live.calibration.decimals}
        sessionActive={live.sessionActive}
        managementPaused={live.managementPaused}
      />

      <TradeManagementCard
        decision={decision}
        entryState={live.entryState}
        operationStatus={
          live.operation?.done
            ? `ENCERRADA · ${live.operation.status}`
            : (live.operation?.status ?? null)
        }
        operationDetail={live.operation?.detail ?? null}
      />
      {!decision && (
        <Card className="border-border/70 bg-panel p-3 text-xs text-muted-foreground">
          Inicie uma sessão na Operação ao Vivo para o motor de decisão produzir a primeira
          avaliação, e alimente o Backtest pela observação contínua do gráfico para construir a base
          de evidências.
        </Card>
      )}
    </div>
  );
}
