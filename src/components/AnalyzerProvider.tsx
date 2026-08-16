import { useEffect, useState, type ReactNode } from "react";

import { AnalyzerContext } from "@/components/analyzerContext";
import { useContinuousBacktest } from "@/hooks/useContinuousBacktest";
import { useLiveSession } from "@/hooks/useLiveSession";
import { installGlobalErrorCapture } from "@/lib/errors/errorReporter";
import { refreshTradingAuth } from "@/lib/tradingSession";

/**
 * ANALYZER PROVIDER — o runtime do analisador vive AQUI, no layout raiz.
 *
 * As sessões (Operação ao Vivo e Backtest) são criadas uma única vez no shell
 * da aplicação e apenas CONSUMIDAS pelas rotas. Combinado com o
 * ScreenCaptureManager singleton, isso garante o requisito do comando §3:
 * navegar entre / /backtest /operacao-ao-vivo /gerenciamento /aprendizado
 * /biblioteca /configuracoes NÃO para a captura, NÃO zera candles/contexto e
 * NÃO reinicia o T4 — as páginas são apenas janelas para o mesmo estado.
 */
export function AnalyzerProvider({ children }: { children: ReactNode }) {
  const [liveAsset, setLiveAsset] = useState("WINFUT");
  const [timeframeConfirmed, setTimeframeConfirmed] = useState(false);
  const [backtestAsset, setBacktestAsset] = useState("WINFUT");
  const live = useLiveSession(liveAsset, timeframeConfirmed);
  const backtest = useContinuousBacktest(backtestAsset);

  useEffect(() => {
    installGlobalErrorCapture();
    // Descobre cedo se a leitura/escrita exigem sessão — o gate de
    // desbloqueio aparece antes da primeira falha de persistência.
    void refreshTradingAuth();
  }, []);

  return (
    <AnalyzerContext.Provider
      value={{
        liveAsset,
        setLiveAsset,
        timeframeConfirmed,
        setTimeframeConfirmed,
        live,
        backtestAsset,
        setBacktestAsset,
        backtest,
      }}
    >
      {children}
    </AnalyzerContext.Provider>
  );
}
