import type { LiquidityCaptureResult, POI, SMSRead, TradePlan, Direction } from "./types";

/**
 * MOTOR DE SEQUÊNCIA CAUSAL (spec finalíssimo §23–§25).
 *
 * Detectar eventos não basta: eles precisam ocorrer em ORDEM coerente e dentro
 * de uma JANELA temporal. Compra: sweep abaixo → reação → fechamento de
 * confirmação → mudança estrutural → POI → reteste → confirmação de entrada.
 * Venda: espelhado.
 *
 * Regras do spec:
 * - sequência incompleta = WAIT (§25) — nunca preencher evento inexistente;
 * - sweep antigo demais não é gatilho novo (§24): fora da janela, a sequência
 *   volta para o início;
 * - este motor não agrega pontuação: ele é um GATE (§38 sequenceValid).
 */

export type CausalStage =
  | "liquiditySweep"
  | "reaction"
  | "confirmationClose"
  | "structureShift"
  | "poi"
  | "retest"
  | "entryConfirmation";

export const CAUSAL_ORDER: CausalStage[] = [
  "liquiditySweep",
  "reaction",
  "confirmationClose",
  "structureShift",
  "poi",
  "retest",
  "entryConfirmation",
];

/** Janela máxima entre o sweep e o candle atual, em candles de 1 minuto. */
export const SEQUENCE_WINDOW_BARS = 30;

export interface CausalStageState {
  stage: CausalStage;
  met: boolean;
  /** Instante do evento quando conhecido (epoch ms); null quando derivado do estado atual. */
  at: number | null;
  note: string;
}

export interface CausalSequenceRead {
  direction: Direction;
  stages: CausalStageState[];
  complete: boolean;
  missing: CausalStage[];
  /** true quando o sweep existe mas está velho demais para ancorar a sequência. */
  staleSweep: boolean;
  /** true quando eventos datados aparecem em ordem incoerente. */
  orderViolated: boolean;
  label: string;
}

export interface CausalSequenceInput {
  direction: Direction;
  capture: LiquidityCaptureResult;
  reactionConfirmed: boolean;
  sms: SMSRead;
  mainPoi: POI | null;
  plan: TradePlan | null;
  priceInEntryZone: boolean;
  price: number;
  lastCandleAt: number;
  barMs?: number;
  windowBars?: number;
}

export function evaluateCausalSequence(input: CausalSequenceInput): CausalSequenceRead {
  const barMs = input.barMs ?? 60_000;
  const windowBars = input.windowBars ?? SEQUENCE_WINDOW_BARS;
  const { direction } = input;

  if (direction === "NEUTRO") {
    return {
      direction,
      stages: CAUSAL_ORDER.map((stage) => ({ stage, met: false, at: null, note: "sem direção" })),
      complete: false,
      missing: [...CAUSAL_ORDER],
      staleSweep: false,
      orderViolated: false,
      label: "Sequência causal não avaliada: direção indefinida.",
    };
  }

  // 1. Sweep de liquidez na direção certa: compra varre liquidez ABAIXO
  // (vendedora); venda varre liquidez ACIMA (compradora).
  const expectedSide = direction === "COMPRA" ? "vendedora" : "compradora";
  const sweepAt = input.capture.detail.at;
  const sweepDetected =
    input.capture.valid &&
    input.capture.direction === direction &&
    input.capture.detail.side === expectedSide;
  const sweepAgeBars = sweepAt !== null ? (input.lastCandleAt - sweepAt) / barMs : null;
  const staleSweep = sweepDetected && sweepAgeBars !== null && sweepAgeBars > windowBars;
  const sweepMet = sweepDetected && !staleSweep;

  // 2. Reação na direção do setup, já medida pelo motor de price action.
  const reactionMet = sweepMet && input.reactionConfirmed;

  // 3. Fechamento de confirmação além do nível (nunca pavio isolado).
  const closeMet = reactionMet && input.capture.detail.closeConfirmed;

  // 4. Mudança estrutural (SMS/CHoCH) na MESMA direção.
  const smsMet = closeMet && input.sms.confirmed && input.sms.direction === direction;

  // 5. POI alinhado e não invalidado.
  const poiMet =
    smsMet &&
    input.mainPoi !== null &&
    input.mainPoi.direction === direction &&
    input.mainPoi.condition !== "invalidado";

  // 6. Reteste: preço dentro do POI ou POI já testado.
  const retestMet =
    poiMet &&
    input.mainPoi !== null &&
    (input.mainPoi.condition === "testado" ||
      (input.price >= input.mainPoi.lower && input.price <= input.mainPoi.upper));

  // 7. Confirmação de entrada: plano válido com preço na zona de entrada.
  const entryMet = retestMet && input.plan !== null && input.priceInEntryZone;

  // Coerência de ordem entre os eventos que TÊM timestamp (sweep, POI).
  const poiAt = input.mainPoi?.originAt ?? null;
  const orderViolated =
    sweepMet && poiMet && sweepAt !== null && poiAt !== null ? poiAt < sweepAt : false;

  const stages: CausalStageState[] = [
    {
      stage: "liquiditySweep",
      met: sweepMet,
      at: sweepAt,
      note: staleSweep
        ? `Sweep detectado há ${Math.round(sweepAgeBars!)} candles — fora da janela de ${windowBars}; contexto mudou.`
        : sweepMet
          ? `Liquidez ${expectedSide} varrida.`
          : "Aguardando varredura de liquidez na direção do setup.",
    },
    {
      stage: "reaction",
      met: reactionMet,
      at: null,
      note: reactionMet
        ? "Reação confirmada no candle fechado."
        : "Aguardando reação após o sweep.",
    },
    {
      stage: "confirmationClose",
      met: closeMet,
      at: null,
      note: closeMet
        ? "Fechamento confirmou o movimento."
        : "Aguardando fechamento de confirmação.",
    },
    {
      stage: "structureShift",
      met: smsMet,
      at: null,
      note: smsMet ? input.sms.label : "Aguardando mudança estrutural na direção do setup.",
    },
    {
      stage: "poi",
      met: poiMet && !orderViolated,
      at: poiAt,
      note: orderViolated
        ? "POI anterior ao sweep — ordem causal incoerente; POI pertence a outro contexto."
        : poiMet
          ? "POI alinhado e válido."
          : "Aguardando POI válido na direção do setup.",
    },
    {
      stage: "retest",
      met: retestMet && !orderViolated,
      at: null,
      note: retestMet ? "Reteste em andamento ou concluído." : "Aguardando reteste do POI.",
    },
    {
      stage: "entryConfirmation",
      met: entryMet && !orderViolated,
      at: null,
      note: entryMet ? "Entrada tecnicamente confirmada." : "Aguardando confirmação de entrada.",
    },
  ];

  const missing = stages.filter((stage) => !stage.met).map((stage) => stage.stage);
  const complete = missing.length === 0;
  const label = complete
    ? `Sequência causal completa (${direction}).`
    : staleSweep
      ? "WAIT — sweep fora da janela temporal; sequência reiniciada."
      : orderViolated
        ? "WAIT — ordem causal incoerente entre sweep e POI."
        : `WAIT — sequência causal incompleta: falta ${missing[0]}.`;

  return { direction, stages, complete, missing, staleSweep, orderViolated, label };
}
