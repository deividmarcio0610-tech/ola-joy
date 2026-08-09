import type { Candle } from "@/lib/engines/types";

/**
 * Costura cronológica das séries de candles entre frames (§9–§10).
 *
 * Enquanto o usuário arrasta o Profit, cada frame mostra uma janela da mesma
 * história. Este módulo une essas janelas em UMA sequência por sobreposição:
 * o final da sequência mestre deve reaparecer no frame novo; os candles à
 * direita da sobreposição são os candles novos revelados.
 *
 * RETROCESSO (§10): se o frame novo não estende a sequência (usuário voltou no
 * tempo, pulou de data, trocou de ativo/zoom), NUNCA se cria continuidade
 * falsa — a sequência atual é encerrada e um novo segmento começa.
 */

export interface StitchResult {
  /** Candles novos adicionados à sequência mestre. */
  appended: number;
  /** true quando o frame não estende a sequência — novo segmento é necessário. */
  discontinuity: boolean;
  reason: string;
}

/** Igualdade de candle com tolerância real (fração da amplitude média). */
function candlesMatch(a: Candle, b: Candle, tolerance: number): boolean {
  return (
    Math.abs(a.o - b.o) <= tolerance &&
    Math.abs(a.h - b.h) <= tolerance &&
    Math.abs(a.l - b.l) <= tolerance &&
    Math.abs(a.c - b.c) <= tolerance
  );
}

/**
 * Com escala ainda não calibrada, o mesmo trecho pode mudar de Y quando o
 * Profit aplica autoescala. Em unidades geométricas isso aparece como uma
 * transformação linear (escala + deslocamento) em TODOS os OHLC. Ajustamos a
 * transformação pelos fechamentos e validamos os quatro preços dos candles.
 *
 * Só é usado quando o chamador declara `allowAffine=true`; com preço real
 * calibrado continuamos exigindo igualdade absoluta para não confundir um
 * salto de período com um trecho visualmente parecido.
 */
function affineWindowsMatch(a: Candle[], b: Candle[]): boolean {
  if (a.length !== b.length || a.length < 4) return false;
  const meanA = a.reduce((sum, candle) => sum + candle.c, 0) / a.length;
  const meanB = b.reduce((sum, candle) => sum + candle.c, 0) / b.length;
  let covariance = 0;
  let varianceA = 0;
  for (let i = 0; i < a.length; i++) {
    const da = a[i]!.c - meanA;
    covariance += da * (b[i]!.c - meanB);
    varianceA += da * da;
  }
  if (varianceA <= 1e-9) return false;
  const scale = covariance / varianceA;
  if (!Number.isFinite(scale) || scale <= 0 || scale < 0.08 || scale > 12) return false;
  const offset = meanB - scale * meanA;
  const meanRangeB =
    b.reduce((sum, candle) => sum + Math.max(1e-9, candle.h - candle.l), 0) / b.length;
  const tolerance = Math.max(1e-6, meanRangeB * 0.28);
  let directionMatches = 0;
  let error = 0;
  let samples = 0;

  for (let i = 0; i < a.length; i++) {
    const ca = a[i]!;
    const cb = b[i]!;
    if (Math.sign(ca.c - ca.o) === Math.sign(cb.c - cb.o)) directionMatches++;
    for (const key of ["o", "h", "l", "c"] as const) {
      error += Math.abs(scale * ca[key] + offset - cb[key]);
      samples++;
    }
  }
  const meanError = error / Math.max(1, samples);
  return directionMatches / a.length >= 0.75 && meanError <= tolerance;
}

function windowsMatch(a: Candle[], b: Candle[], tolerance: number, allowAffine: boolean): boolean {
  let absolute = true;
  for (let i = 0; i < a.length; i++) {
    if (!candlesMatch(a[i]!, b[i]!, tolerance)) {
      absolute = false;
      break;
    }
  }
  return absolute || (allowAffine && affineWindowsMatch(a, b));
}

/** Tolerância derivada dos próprios dados: 15% da amplitude média dos candles. */
export function matchTolerance(candles: Candle[]): number {
  if (candles.length === 0) return 0;
  const meanRange =
    candles.reduce((sum, candle) => sum + Math.max(0, candle.h - candle.l), 0) / candles.length;
  return Math.max(1e-9, meanRange * 0.15);
}

export class CandleStitcher {
  private master: Candle[] = [];
  private segmentIndex = 0;

  /** Sequência mestre do segmento atual, em ordem cronológica de revelação. */
  sequence(): readonly Candle[] {
    return this.master;
  }

  currentSegment(): number {
    return this.segmentIndex;
  }

  /**
   * Ingere a série visível de um frame.
   * - Primeiro frame do segmento: vira a sequência inicial.
   * - Frames seguintes: procura a MAIOR sobreposição entre o fim da sequência
   *   mestre e o início/meio da série nova; anexa somente o que vem depois.
   * - Sem sobreposição válida => descontinuidade (retrocesso/salto): encerra o
   *   segmento e começa outro com a série nova.
   */
  ingest(frameCandles: Candle[], options: { allowAffine?: boolean } = {}): StitchResult {
    if (frameCandles.length === 0) {
      return { appended: 0, discontinuity: false, reason: "Frame sem candles — ignorado." };
    }
    if (this.master.length === 0) {
      this.master = [...frameCandles];
      return {
        appended: frameCandles.length,
        discontinuity: false,
        reason: "Primeiro frame do segmento.",
      };
    }

    const tolerance = matchTolerance([...this.master.slice(-20), ...frameCandles]);

    // Procura a maior sobreposição: sufixo da mestre == janela da série nova.
    const maxOverlap = Math.min(this.master.length, frameCandles.length);
    for (let overlap = maxOverlap; overlap >= 2; overlap--) {
      const masterSuffix = this.master.slice(this.master.length - overlap);
      // A sobreposição pode terminar em qualquer posição da série nova
      // (candles antigos saem pela esquerda conforme o gráfico anda).
      for (let end = frameCandles.length; end >= overlap; end--) {
        const window = frameCandles.slice(end - overlap, end);
        const matched = windowsMatch(masterSuffix, window, tolerance, options.allowAffine === true);
        if (!matched) continue;
        const fresh = frameCandles.slice(end);
        if (fresh.length === 0 && end < frameCandles.length) continue;
        // RETROCESSO: a sobreposição termina antes do fim da série nova só
        // acontece quando fresh > 0; se o casamento é no MEIO da mestre o
        // usuário voltou — coberto pelo caso sem-extensão abaixo.
        this.master.push(...fresh);
        return {
          appended: fresh.length,
          discontinuity: false,
          reason:
            fresh.length > 0
              ? `Sobreposição de ${overlap} candles; ${fresh.length} novo(s) revelado(s).`
              : `Frame contido na sequência (sobreposição de ${overlap}); nada novo.`,
        };
      }
    }

    // Nenhuma sobreposição com o FIM da sequência. Se a série nova casa com um
    // trecho ANTERIOR da mestre, o usuário retrocedeu; se não casa com nada,
    // houve salto (data/ativo/zoom). Ambos exigem novo segmento (§10).
    const backwards = this.matchesEarlierPortion(
      frameCandles,
      tolerance,
      options.allowAffine === true,
    );
    this.master = [...frameCandles];
    this.segmentIndex++;
    return {
      appended: frameCandles.length,
      discontinuity: true,
      reason: backwards
        ? "RETROCESSO DETECTADO: o frame mostra trecho anterior da história — novo segmento iniciado."
        : "Descontinuidade detectada (salto de período/escala) — novo segmento iniciado.",
    };
  }

  private matchesEarlierPortion(
    frameCandles: Candle[],
    tolerance: number,
    allowAffine: boolean,
  ): boolean {
    const probeLength = Math.min(4, frameCandles.length);
    const probe = frameCandles.slice(0, probeLength);
    const searchEnd = this.master.length - probeLength - 1;
    for (let start = 0; start <= searchEnd; start++) {
      const matched = windowsMatch(
        this.master.slice(start, start + probeLength),
        probe,
        tolerance,
        allowAffine,
      );
      if (matched) return true;
    }
    return false;
  }

  reset(): void {
    this.master = [];
    this.segmentIndex = 0;
  }
}

/**
 * Constrói os segmentos cronológicos finais a partir dos keyframes gravados.
 * Cada segmento recebe timestamps sintéticos sequenciais (1 candle = 1 minuto
 * de história) — a ORDEM é real; o relógio absoluto do passado não é
 * conhecível a partir de um replay arrastado, e não é inventado.
 */
export function buildSegments(
  keyframeSeries: Candle[][],
  minuteMs = 60_000,
  baseT = 1_700_000_000_000,
): { segments: Candle[][]; discontinuities: string[]; segmentStartFrames: number[] } {
  const stitcher = new CandleStitcher();
  const segments: Candle[][] = [];
  const discontinuities: string[] = [];
  // Índice do keyframe que INICIOU cada segmento — permite rotular o pregão
  // pela leitura de data mais próxima daquele frame (comando §16).
  const segmentStartFrames: number[] = [];
  let currentStartFrame = 0;

  const flush = (upTo: Candle[]) => {
    if (upTo.length > 0) {
      segments.push([...upTo]);
      segmentStartFrames.push(currentStartFrame);
    }
  };

  let previousSequence: Candle[] = [];
  keyframeSeries.forEach((series, frameIndex) => {
    const result = stitcher.ingest(series);
    if (result.discontinuity) {
      flush(previousSequence);
      discontinuities.push(result.reason);
      currentStartFrame = frameIndex;
    }
    previousSequence = [...stitcher.sequence()];
  });
  flush(previousSequence);

  return {
    segments: segments.map((segment, segmentIndex) =>
      segment.map((candle, i) => ({
        ...candle,
        t: baseT + segmentIndex * 10_000 * minuteMs + i * minuteMs,
      })),
    ),
    discontinuities,
    segmentStartFrames,
  };
}
