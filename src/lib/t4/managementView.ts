import type { AnalysisResult } from "@/lib/engines/types";
import { roundToTick } from "@/lib/vision/priceScale";

import type { TradeSignalSnapshot } from "./signalSnapshot";

/**
 * GERENCIAMENTO AO VIVO — view-model puro (comando gerenciamento §1–§10).
 *
 * A Operação ao Vivo e a aba Gerenciamento renderizam EXATAMENTE esta mesma
 * estrutura a partir dos mesmos insumos, então os valores exibidos são
 * idênticos por construção (§12.h). Regras:
 *
 * - Enquanto T4 <100%: "PREÇO ATUAL" segue o mercado em tempo real (nunca
 *   "AGUARDANDO DADOS" durante a análise); a ENTRADA candidata acompanha o
 *   mercado em tom NEUTRO e stop/3R/5R/runner ficam OCULTOS.
 * - Em 100% (snapshot + signalId): a entrada CONGELA no valor exato do
 *   snapshot (destaque verde), stop/3R/5R/runner saem EXCLUSIVAMENTE do
 *   snapshot e o preço vivo migra para o campo separado "MERCADO AGORA".
 * - Preço/calibração não confiável: "PREÇO NÃO CONFIÁVEL" no lugar do número;
 *   antes do 100% nada congela com preço errado.
 * - Todos os números passam pelo MESMO arredondamento (incremento real do
 *   ativo) — Gerenciamento, preview e motor T4 batem após o arredondamento.
 */

export interface LivePriceInfo {
  /** Último preço lido e aprovado na plausibilidade (null = indisponível). */
  price: number | null;
  /** true somente quando a calibração está válida E a plausibilidade passou. */
  trusted: boolean;
  /** Motivo legível quando não confiável. */
  reason: string | null;
  /** chartClock (tempo do gráfico) da leitura. */
  at: number | null;
}

export const UNTRUSTED_PRICE_LABEL = "PREÇO NÃO CONFIÁVEL";

export interface ManagementViewInput {
  sessionActive: boolean;
  analysis: AnalysisResult | null;
  snapshot: TradeSignalSnapshot | null;
  priceInfo: LivePriceInfo;
  tickSize: number | null;
  decimals: number;
  /**
   * Motivo real quando a GESTÃO da operação confirmada está pausada (preço não
   * confiável). Enquanto pausada, o rastreador não avalia stop/3R/5R — a UI
   * precisa dizer isso em vez de parecer uma gestão saudável.
   */
  managementPaused?: string | null;
}

export interface ManagementLevel {
  value: string;
  /** true quando o número vem do snapshot congelado. */
  frozen: boolean;
  tone: "neutral" | "bull" | "bear";
}

export interface ManagementView {
  status: "AGUARDAR" | "ANALISANDO" | "CONFIRMADO";
  /** Rótulo do campo de preço vivo: PREÇO ATUAL antes, MERCADO AGORA depois. */
  livePriceLabel: "PREÇO ATUAL" | "MERCADO AGORA";
  /** Número formatado ou PREÇO NÃO CONFIÁVEL. */
  livePrice: string;
  livePriceTrusted: boolean;
  priceReason: string | null;
  direction: "COMPRA" | "VENDA" | null;
  /** Entrada: candidata (neutra, segue o mercado) ou congelada (verde). */
  entry: ManagementLevel | null;
  /** Ocultos até a confirmação real; depois, exclusivamente do snapshot. */
  stop: ManagementLevel | null;
  threeR: ManagementLevel | null;
  fiveR: ManagementLevel | null;
  runner: string | null;
  signalId: string | null;
  setup: string | null;
  /** Preenchido só quando existe operação confirmada com gestão pausada. */
  managementPausedReason: string | null;
}

export function formatManagedPrice(
  value: number | null | undefined,
  tickSize: number | null,
  decimals: number,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const rounded = roundToTick(value, tickSize, decimals);
  return rounded.toFixed(Math.max(0, decimals));
}

export function buildManagementView(input: ManagementViewInput): ManagementView {
  const { analysis, snapshot, priceInfo, tickSize, decimals } = input;
  const format = (value: number | null | undefined) =>
    formatManagedPrice(value, tickSize, decimals);
  const livePrice =
    priceInfo.trusted && priceInfo.price !== null ? format(priceInfo.price) : UNTRUSTED_PRICE_LABEL;

  if (snapshot) {
    // §4/§10: entrada congelada EXATA do snapshot; mercado segue em campo
    // separado. Nada aqui relê a análise corrente para os níveis.
    return {
      status: "CONFIRMADO",
      livePriceLabel: "MERCADO AGORA",
      livePrice,
      livePriceTrusted: priceInfo.trusted,
      priceReason: priceInfo.trusted ? null : priceInfo.reason,
      direction: snapshot.direction,
      entry: { value: format(snapshot.entry), frozen: true, tone: "bull" },
      stop: { value: format(snapshot.initialStop), frozen: true, tone: "bear" },
      threeR: { value: format(snapshot.threeR), frozen: true, tone: "bull" },
      fiveR: { value: format(snapshot.fiveR), frozen: true, tone: "bull" },
      runner: "ESTRUTURAL",
      signalId: snapshot.signalId,
      setup: snapshot.setup,
      managementPausedReason: input.managementPaused ?? null,
    };
  }

  const status: ManagementView["status"] = input.sessionActive ? "ANALISANDO" : "AGUARDAR";
  // §3: antes do 100% a entrada candidata SEGUE o mercado (nunca congela) e é
  // visualmente neutra. Sem preço confiável não existe candidata (§8).
  const candidateEntry = priceInfo.trusted && analysis?.plan ? format(analysis.plan.entry) : null;
  return {
    status,
    livePriceLabel: "PREÇO ATUAL",
    livePrice,
    livePriceTrusted: priceInfo.trusted,
    priceReason: priceInfo.trusted ? null : priceInfo.reason,
    direction: null,
    entry: candidateEntry ? { value: candidateEntry, frozen: false, tone: "neutral" } : null,
    stop: null,
    threeR: null,
    fiveR: null,
    runner: null,
    signalId: null,
    setup: null,
    // Sem sinal confirmado não existe gestão para pausar.
    managementPausedReason: null,
  };
}
