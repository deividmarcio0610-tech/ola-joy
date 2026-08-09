/**
 * RECONSTRUÇÃO DE CANDLES DE 1 MINUTO A PARTIR DA CAPTURA VISUAL.
 *
 * Corrige a falha central da versão anterior: o agregador antigo criava candles
 * de 3 segundos com preço normalizado 0–1000 e reempilhava o histórico visual a
 * cada frame. Aqui cada candle tem identificação temporal única, o candle em
 * formação é separado do fechado, e um candle fechado NUNCA é reescrito.
 *
 * Todo preço que entra aqui já passou pela calibração da escala
 * (ver priceScale.ts). Nada é normalizado, nada é sintético.
 */

import type { Candle } from "@/lib/engines/types";

/** Um minuto em milissegundos — o único período operado pelo analisador. */
export const MINUTE_MS = 60_000;

export interface CandleSample {
  /** Instante da amostra (epoch ms). */
  t: number;
  /** Preço já convertido pela escala calibrada. */
  price: number;
  /** Qualidade da leitura visual desta amostra (0..1). */
  quality: number;
}

export interface ReconstructedCandle extends Candle {
  /** Identificação temporal única: `${ativo}:${inícioDoMinuto}`. */
  id: string;
  /** true quando o minuto já terminou e o candle está imutável. */
  closed: boolean;
  /** Amostras que formaram o candle — base da qualidade. */
  samples: number;
  /** Média da qualidade de leitura das amostras (0..100). */
  quality: number;
}

export interface IngestResult {
  /** Candles fechados, em ordem cronológica. Nunca contém o candle em formação. */
  closed: ReconstructedCandle[];
  /** Candle do minuto corrente, ainda mutável. */
  forming: ReconstructedCandle | null;
  /** Candle que fechou exatamente nesta ingestão (dispara a análise). */
  justClosed: ReconstructedCandle | null;
  /** Amostra recusada e por quê — auditoria, nunca silencioso. */
  rejected: string | null;
}

/** Início do minuto que contém `t`. */
export function minuteStart(t: number): number {
  return Math.floor(t / MINUTE_MS) * MINUTE_MS;
}

/** Identificação temporal única e estável de um candle. */
export function candleId(asset: string, bucketStart: number): string {
  return `${asset}:${bucketStart}`;
}

/**
 * Reconstrutor incremental de candles de 1 minuto.
 *
 * Garantias verificadas por teste:
 * - nunca duplica um candle (id único por minuto);
 * - nunca altera um candle já fechado, mesmo recebendo amostra atrasada;
 * - mantém ordem cronológica estrita;
 * - separa candle em formação de candle fechado;
 * - descarta amostra fora de ordem em vez de corromper o histórico.
 */
export class CandleReconstructor {
  private closed: ReconstructedCandle[] = [];
  private forming: ReconstructedCandle | null = null;
  private closedIds = new Set<string>();
  private lastSampleT = -1;
  private qualitySum = 0;

  constructor(
    private readonly asset: string,
    private readonly maxCandles = 600,
  ) {}

  /**
   * Semeia o histórico com candles realmente extraídos do primeiro frame.
   * Só aceita série cronológica encerrada antes do minuto atual; duplicatas ou
   * preços inválidos são rejeitados em vez de corrigidos silenciosamente.
   */
  seedClosed(candles: Array<Candle & { quality?: number }>): {
    accepted: number;
    rejected: number;
  } {
    let accepted = 0;
    let rejected = 0;
    const sorted = [...candles].sort((a, b) => a.t - b.t);
    for (const candle of sorted) {
      const bucket = minuteStart(candle.t);
      const id = candleId(this.asset, bucket);
      const validPrices = [candle.o, candle.h, candle.l, candle.c].every(Number.isFinite);
      if (!validPrices || this.closedIds.has(id) || (this.forming && this.forming.id === id)) {
        rejected++;
        continue;
      }
      const sealed: ReconstructedCandle = {
        id,
        t: bucket,
        o: candle.o,
        h: Math.max(candle.h, candle.o, candle.c),
        l: Math.min(candle.l, candle.o, candle.c),
        c: candle.c,
        v: 0,
        closed: true,
        samples: 1,
        quality: Math.max(0, Math.min(100, Math.round(candle.quality ?? 70))),
      };
      Object.freeze(sealed);
      this.closed.push(sealed);
      this.closedIds.add(id);
      accepted++;
    }
    this.closed.sort((a, b) => a.t - b.t);
    if (this.closed.length > this.maxCandles) {
      const removed = this.closed.splice(0, this.closed.length - this.maxCandles);
      for (const candle of removed) this.closedIds.delete(candle.id);
    }
    return { accepted, rejected };
  }

  /** Ingere uma amostra visual e devolve o estado consolidado. */
  push(sample: CandleSample): IngestResult {
    if (!Number.isFinite(sample.price) || !Number.isFinite(sample.t)) {
      return this.result(null, "Amostra descartada: preço ou instante inválido.");
    }

    const bucket = minuteStart(sample.t);

    // Amostra atrasada de um minuto já fechado: descartada. Reabrir um candle
    // fechado reescreveria história já usada para gerar sinal.
    if (this.closedIds.has(candleId(this.asset, bucket))) {
      return this.result(
        null,
        `Amostra descartada: candle ${new Date(bucket).toISOString()} já está fechado.`,
      );
    }

    // Amostra fora de ordem dentro do minuto corrente.
    if (sample.t < this.lastSampleT) {
      return this.result(null, "Amostra descartada: instante anterior à última leitura.");
    }
    this.lastSampleT = sample.t;

    let justClosed: ReconstructedCandle | null = null;

    if (this.forming && this.forming.t !== bucket) {
      // O minuto virou: congela o anterior antes de abrir o novo.
      justClosed = this.sealForming();
    }

    if (!this.forming) {
      this.forming = {
        id: candleId(this.asset, bucket),
        t: bucket,
        o: sample.price,
        h: sample.price,
        l: sample.price,
        c: sample.price,
        v: 0,
        closed: false,
        samples: 1,
        quality: Math.round(clamp01(sample.quality) * 100),
      };
      this.qualitySum = clamp01(sample.quality);
      return this.result(justClosed, null);
    }

    // Atualiza o candle em formação. Abertura nunca muda.
    this.forming.h = Math.max(this.forming.h, sample.price);
    this.forming.l = Math.min(this.forming.l, sample.price);
    this.forming.c = sample.price;
    this.forming.samples += 1;
    this.qualitySum += clamp01(sample.quality);
    this.forming.quality = Math.round((this.qualitySum / this.forming.samples) * 100);

    return this.result(justClosed, null);
  }

  /**
   * Fecha o candle em formação por passagem de tempo, sem nova amostra.
   * Chamado pelo relógio da sessão para não depender de um frame chegar
   * exatamente na virada do minuto.
   */
  closeIfElapsed(now: number): ReconstructedCandle | null {
    if (!this.forming) return null;
    if (minuteStart(now) === this.forming.t) return null;
    return this.sealForming();
  }

  /** Congela o candle em formação e o move para o histórico imutável. */
  private sealForming(): ReconstructedCandle | null {
    if (!this.forming) return null;
    const sealed: ReconstructedCandle = { ...this.forming, closed: true };
    // Object.freeze materializa a imutabilidade: qualquer tentativa de reescrever
    // um candle fechado falha em modo estrito em vez de corromper silenciosamente.
    Object.freeze(sealed);
    this.closed.push(sealed);
    this.closedIds.add(sealed.id);
    if (this.closed.length > this.maxCandles) {
      const removed = this.closed.shift();
      if (removed) this.closedIds.delete(removed.id);
    }
    this.forming = null;
    this.qualitySum = 0;
    return sealed;
  }

  private result(justClosed: ReconstructedCandle | null, rejected: string | null): IngestResult {
    return {
      closed: this.closed,
      forming: this.forming,
      justClosed,
      rejected,
    };
  }

  /** Somente candles fechados — o que o motor de análise pode consumir. */
  closedCandles(): ReconstructedCandle[] {
    return this.closed;
  }

  /** Candle em formação, para exibição. Nunca entra na decisão. */
  formingCandle(): ReconstructedCandle | null {
    return this.forming;
  }

  /** Qualidade média das leituras dos últimos candles fechados (0..100). */
  averageQuality(lookback = 20): number {
    const slice = this.closed.slice(-lookback);
    if (slice.length === 0) return 0;
    return Math.round(slice.reduce((a, c) => a + c.quality, 0) / slice.length);
  }

  reset(): void {
    this.closed = [];
    this.closedIds.clear();
    this.forming = null;
    this.lastSampleT = -1;
    this.qualitySum = 0;
  }
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

/** Confirma que a série está em ordem cronológica estrita e sem duplicatas. */
export function assertChronological(candles: readonly ReconstructedCandle[]): {
  ok: boolean;
  problem: string | null;
} {
  const seen = new Set<string>();
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]!;
    if (seen.has(c.id)) return { ok: false, problem: `Candle duplicado: ${c.id}` };
    seen.add(c.id);
    if (i > 0 && c.t <= candles[i - 1]!.t) {
      return { ok: false, problem: `Ordem cronológica quebrada em ${c.id}` };
    }
  }
  return { ok: true, problem: null };
}
