import type { MarketClockSource } from "@/lib/vision/marketClock";

/**
 * DIAGNÓSTICO REAL DO PIPELINE (comando §5).
 *
 * Cada campo reflete o estado VERDADEIRO de uma etapa:
 * FRAME → PROFIT → CHART_CLOCK → CANDLES → CONTEXTO → T4.
 * Nada aqui é derivado de timer ou de score inventado. Se o gráfico está
 * visível mas nenhum candle foi parseado, o erro específico aparece em
 * `parseError` — nunca um genérico "AGUARDANDO GRÁFICO".
 */
export interface PipelineDiagnostics {
  CAPTURE_ACTIVE: boolean;
  PROFIT_DETECTED: boolean;
  GRAPH_DETECTED: boolean;
  PRICE_AXIS: boolean;
  TIME_AXIS: boolean;
  CHART_CLOCK: "VALID" | "FALLBACK_REALTIME" | "UNAVAILABLE";
  chartClockSource: MarketClockSource;
  chartClockReason: string | null;
  CANDLES_VISIBLE: number;
  CANDLES_PARSED: number;
  CANDLES_SENT_TO_T4: number;
  LAST_FRAME: number | null;
  LAST_CANDLE: number | null;
  /** Latência captura→leitura do último frame processado (ms). */
  LATENCY: number | null;
  T4_STATE: string;
  BLOCK_REASON: string | null;
  OLLAMA_STATUS: string;
  /** Erro específico quando gráfico visível e candles=0. */
  parseError: string | null;

  // ── PREÇO VISUAL (comando ao-vivo §6): bruto → processado → confiável ──
  /** Linha de pixel BRUTA do marcador de preço no último frame (Y). */
  PRICE_RAW_Y: number | null;
  /** Preço processado da última leitura (real quando PRICE_TRUSTED). */
  PRICE_PROCESSED: number | null;
  /** Preço aprovado na plausibilidade — só então níveis são liberados. */
  PRICE_TRUSTED: boolean;
  /** Origem da conversão pixel→preço. */
  PRICE_SOURCE: "CALIBRADA" | "GEOMETRICA" | "AUSENTE";
  /** Faixa de preços visível no recorte segundo a calibração vigente. */
  PRICE_RANGE: { min: number; max: number } | null;
  /** Incremento (tick) reconhecido na escala. */
  PRICE_INCREMENT: number | null;
  /** Qualidade do ajuste linear da calibração. */
  PRICE_R2: number | null;
}

export const EMPTY_DIAGNOSTICS: PipelineDiagnostics = {
  CAPTURE_ACTIVE: false,
  PROFIT_DETECTED: false,
  GRAPH_DETECTED: false,
  PRICE_AXIS: false,
  TIME_AXIS: false,
  CHART_CLOCK: "UNAVAILABLE",
  chartClockSource: "REALTIME_FALLBACK",
  chartClockReason: "captura não iniciada",
  CANDLES_VISIBLE: 0,
  CANDLES_PARSED: 0,
  CANDLES_SENT_TO_T4: 0,
  LAST_FRAME: null,
  LAST_CANDLE: null,
  LATENCY: null,
  T4_STATE: "IDLE",
  BLOCK_REASON: null,
  OLLAMA_STATUS: "DESCONHECIDO",
  parseError: null,
  PRICE_RAW_Y: null,
  PRICE_PROCESSED: null,
  PRICE_TRUSTED: false,
  PRICE_SOURCE: "AUSENTE",
  PRICE_RANGE: null,
  PRICE_INCREMENT: null,
  PRICE_R2: null,
};

/** Erro específico exigido pelo comando quando gráfico visível e candles=0. */
export function candleParseError(diag: {
  GRAPH_DETECTED: boolean;
  CANDLES_VISIBLE: number;
  CANDLES_PARSED: number;
}): string | null {
  if (!diag.GRAPH_DETECTED) return null;
  if (diag.CANDLES_VISIBLE === 0) {
    return "GRÁFICO DETECTADO, MAS NENHUMA COLUNA DE CANDLE COLORIDA FOI ENCONTRADA — verifique zoom/cores do Profit.";
  }
  if (diag.CANDLES_PARSED === 0) {
    return "CANDLES VISÍVEIS, MAS NENHUM FOI PARSEADO PARA A SÉRIE — reconstrução rejeitando amostras (veja o motivo da última rejeição).";
  }
  return null;
}
