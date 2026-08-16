import { createContext, useContext } from "react";

import type { useContinuousBacktest } from "@/hooks/useContinuousBacktest";
import type { useLiveSession } from "@/hooks/useLiveSession";

/**
 * Contexto do runtime do analisador — separado do componente Provider para o
 * arquivo de componente exportar SOMENTE componente (Fast Refresh íntegro).
 */
export interface AnalyzerContextValue {
  liveAsset: string;
  setLiveAsset: (asset: string) => void;
  timeframeConfirmed: boolean;
  setTimeframeConfirmed: (confirmed: boolean) => void;
  live: ReturnType<typeof useLiveSession>;
  backtestAsset: string;
  setBacktestAsset: (asset: string) => void;
  backtest: ReturnType<typeof useContinuousBacktest>;
}

export const AnalyzerContext = createContext<AnalyzerContextValue | null>(null);

export function useAnalyzer(): AnalyzerContextValue {
  const context = useContext(AnalyzerContext);
  if (!context) throw new Error("useAnalyzer precisa do AnalyzerProvider no layout raiz.");
  return context;
}
