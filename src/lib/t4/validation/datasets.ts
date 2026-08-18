import type { DatasetSplit, T4Trade } from "./types";

/**
 * PARTIÇÃO DOS DADOS.
 *
 * TRAIN é onde se estuda. OUT_OF_SAMPLE é o teste cego: dados que a estratégia
 * NUNCA viu durante o ajuste. FORWARD é o que veio depois da versão ter sido
 * congelada — decisões gravadas antes de o resultado existir.
 *
 * REGRA DURA: OOS e FORWARD não retroalimentam TRAIN. Este módulo não expõe
 * nenhuma função que otimize parâmetros; ele apenas particiona e mede.
 */

export interface DatasetSplitResult {
  train: T4Trade[];
  outOfSample: T4Trade[];
  forward: T4Trade[];
}

/** Fração da série histórica reservada ao treino. O resto vira OOS. */
export const DEFAULT_TRAIN_FRACTION = 0.7;

/**
 * Separação CRONOLÓGICA — nunca aleatória. Embaralhar séries temporais
 * vazaria futuro para dentro do treino.
 *
 * Trades já marcados como FORWARD (gravados ao vivo, com snapshot anterior ao
 * resultado) permanecem em FORWARD independentemente da data.
 */
export function splitDatasets(
  trades: T4Trade[],
  trainFraction = DEFAULT_TRAIN_FRACTION,
): DatasetSplitResult {
  const forward = trades.filter((trade) => trade.dataset === "FORWARD");
  const historical = trades
    .filter((trade) => trade.dataset !== "FORWARD")
    .slice()
    .sort((a, b) => a.decidedAt - b.decidedAt);

  const fraction = Math.min(0.95, Math.max(0.05, trainFraction));
  const cut = Math.floor(historical.length * fraction);
  return {
    train: historical.slice(0, cut).map((trade) => ({ ...trade, dataset: "TRAIN" as const })),
    outOfSample: historical
      .slice(cut)
      .map((trade) => ({ ...trade, dataset: "OUT_OF_SAMPLE" as const })),
    forward,
  };
}

/** Rótulo legível do split, usado no painel. */
export const SPLIT_LABEL: Record<DatasetSplit, string> = {
  TRAIN: "TREINO",
  OUT_OF_SAMPLE: "OUT-OF-SAMPLE",
  FORWARD: "FORWARD",
};

/**
 * Hash do dataset — dois runs sobre o MESMO conjunto precisam produzir o mesmo
 * hash, e qualquer alteração de dado precisa mudá-lo. Sem isso não existe
 * reprodutibilidade auditável.
 */
export function datasetHash(trades: T4Trade[]): string {
  const canonical = trades
    .map((trade) => `${trade.tradeId}:${trade.decidedAt}:${trade.resultR ?? "x"}`)
    .sort()
    .join("|");
  let hash = 2166136261;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `ds_${(hash >>> 0).toString(36)}_${trades.length}`;
}
