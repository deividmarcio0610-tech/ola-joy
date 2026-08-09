import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { useContinuousBacktest } from "@/hooks/useContinuousBacktest";
import { useLiveSession } from "@/hooks/useLiveSession";
import { installGlobalErrorCapture } from "@/lib/errors/errorReporter";

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

interface AnalyzerContextValue {
  liveAsset: string;
  setLiveAsset: (asset: string) => void;
  timeframeConfirmed: boolean;
  setTimeframeConfirmed: (confirmed: boolean) => void;
  live: ReturnType<typeof useLiveSession>;
  backtestAsset: string;
  setBacktestAsset: (asset: string) => void;
  backtest: ReturnType<typeof useContinuousBacktest>;
}

const AnalyzerContext = createContext<AnalyzerContextValue | null>(null);

export function AnalyzerProvider({ children }: { children: ReactNode }) {
  const [liveAsset, setLiveAsset] = useState("WINFUT");
  const [timeframeConfirmed, setTimeframeConfirmed] = useState(false);
  const [backtestAsset, setBacktestAsset] = useState("WINFUT");
  const live = useLiveSession(liveAsset, timeframeConfirmed);
  const backtest = useContinuousBacktest(backtestAsset);

  useEffect(() => installGlobalErrorCapture(), []);

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

export function useAnalyzer(): AnalyzerContextValue {
  const context = useContext(AnalyzerContext);
  if (!context) throw new Error("useAnalyzer precisa do AnalyzerProvider no layout raiz.");
  return context;
}
