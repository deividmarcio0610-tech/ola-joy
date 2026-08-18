import { computeT4Metrics, executedTrades, type T4Metrics } from "./metrics";
import type { T4Trade } from "./types";

/**
 * DESEMPENHO SEGMENTADO (requisito 11).
 *
 * Um número agregado esconde tudo o que importa: a técnica pode ser lucrativa
 * na média e destruidora numa faixa de confluência, num horário ou num
 * regime. Aqui a mesma métrica é recalculada por recorte, SEM reescrever
 * nenhuma regra — é sempre `computeT4Metrics` sobre um subconjunto.
 *
 * AVISO DE AMOSTRA: cada segmento carrega `reliable`. Um recorte com 4 trades
 * pode exibir 100% de acerto e não significar nada; o painel precisa dizer
 * isso em vez de deixar o operador tirar a conclusão errada.
 */

/** Faixas de confluência pedidas na especificação. */
export const CONFLUENCE_BANDS = [
  { id: "0-59", label: "0–59%", min: 0, max: 59.999999 },
  { id: "60-69", label: "60–69%", min: 60, max: 69.999999 },
  { id: "70-79", label: "70–79%", min: 70, max: 79.999999 },
  { id: "80-84", label: "80–84%", min: 80, max: 84.999999 },
  { id: "85-89", label: "85–89%", min: 85, max: 89.999999 },
  { id: "90-94", label: "90–94%", min: 90, max: 94.999999 },
  { id: "95-99", label: "95–99%", min: 95, max: 99.999999 },
  { id: "100", label: "100%", min: 100, max: 100 },
] as const;

/** Abaixo disso o segmento é exibido, mas marcado como não confiável. */
export const MIN_SEGMENT_SAMPLE = 20;

export interface Segment {
  key: string;
  label: string;
  trades: number;
  metrics: T4Metrics;
  /** false = amostra pequena demais para concluir qualquer coisa. */
  reliable: boolean;
  note: string | null;
}

export interface SegmentationResult {
  dimension: string;
  segments: Segment[];
  /** Segmentos descartados por não terem nenhum trade executado. */
  emptyKeys: string[];
}

function buildSegment(key: string, label: string, trades: T4Trade[]): Segment {
  const metrics = computeT4Metrics(trades);
  const reliable = metrics.trades >= MIN_SEGMENT_SAMPLE;
  return {
    key,
    label,
    trades: metrics.trades,
    metrics,
    reliable,
    note: reliable
      ? null
      : `Amostra de ${metrics.trades} trade(s): abaixo de ${MIN_SEGMENT_SAMPLE} nenhuma conclusão é estatisticamente sustentável.`,
  };
}

/** Agrupa por uma chave qualquer derivada do trade. */
export function segmentBy(
  trades: T4Trade[],
  dimension: string,
  keyOf: (trade: T4Trade) => string | null,
  labelOf: (key: string) => string = (key) => key,
): SegmentationResult {
  const executed = executedTrades(trades);
  const groups = new Map<string, T4Trade[]>();
  for (const trade of executed) {
    const key = keyOf(trade);
    if (key === null) continue;
    const bucket = groups.get(key);
    if (bucket) bucket.push(trade);
    else groups.set(key, [trade]);
  }
  const segments = [...groups.entries()]
    .map(([key, list]) => buildSegment(key, labelOf(key), list))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return { dimension, segments, emptyKeys: [] };
}

/** Faixa de confluência a que um trade pertence. */
export function confluenceBandOf(confluence: number): string {
  const band = CONFLUENCE_BANDS.find((item) => confluence >= item.min && confluence <= item.max);
  return band?.id ?? CONFLUENCE_BANDS[0]!.id;
}

export function segmentByConfluence(trades: T4Trade[]): SegmentationResult {
  const executed = executedTrades(trades);
  const segments: Segment[] = [];
  const emptyKeys: string[] = [];
  for (const band of CONFLUENCE_BANDS) {
    const list = executed.filter(
      (trade) => trade.confluenceAtEntry >= band.min && trade.confluenceAtEntry <= band.max,
    );
    // Faixa vazia é INFORMAÇÃO: a técnica nunca operou ali.
    if (list.length === 0) {
      emptyKeys.push(band.id);
      continue;
    }
    segments.push(buildSegment(band.id, band.label, list));
  }
  return { dimension: "CONFLUENCIA", segments, emptyKeys };
}

export function segmentByDirection(trades: T4Trade[]): SegmentationResult {
  return segmentBy(trades, "DIRECAO", (trade) => trade.direction);
}

export function segmentByAsset(trades: T4Trade[]): SegmentationResult {
  return segmentBy(trades, "ATIVO", (trade) => trade.symbol);
}

export function segmentByTimeframe(trades: T4Trade[]): SegmentationResult {
  return segmentBy(trades, "TIMEFRAME", (trade) => trade.timeframe);
}

export function segmentByRegime(trades: T4Trade[]): SegmentationResult {
  return segmentBy(trades, "REGIME", (trade) => trade.regime);
}

export function segmentBySession(trades: T4Trade[]): SegmentationResult {
  return segmentBy(trades, "SESSAO", (trade) => trade.session);
}

/**
 * Hora do dia da DECISÃO. Usa UTC de propósito: o fuso do servidor não pode
 * mudar o resultado de um relatório estatístico entre duas máquinas.
 */
export function segmentByHour(trades: T4Trade[]): SegmentationResult {
  return segmentBy(
    trades,
    "HORA",
    (trade) => String(new Date(trade.decidedAt).getUTCHours()).padStart(2, "0"),
    (key) => `${key}:00 UTC`,
  );
}

export interface FullSegmentation {
  confluence: SegmentationResult;
  direction: SegmentationResult;
  asset: SegmentationResult;
  timeframe: SegmentationResult;
  hour: SegmentationResult;
  regime: SegmentationResult;
  session: SegmentationResult;
}

export function segmentAll(trades: T4Trade[]): FullSegmentation {
  return {
    confluence: segmentByConfluence(trades),
    direction: segmentByDirection(trades),
    asset: segmentByAsset(trades),
    timeframe: segmentByTimeframe(trades),
    hour: segmentByHour(trades),
    regime: segmentByRegime(trades),
    session: segmentBySession(trades),
  };
}
