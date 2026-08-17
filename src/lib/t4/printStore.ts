import { screenCaptureManager } from "@/lib/capture/screenCaptureManager";

/**
 * PRINTS AUTOMÁTICOS — capturas reais do gráfico nos momentos que importam.
 *
 * Cada print nasce de um EVENTO REAL do motor (varredura de liquidez, quebra
 * de estrutura, POI, entrada validada, gatilho atingido) e é carimbado com o
 * HORÁRIO DO GRÁFICO (marketClock/candle) — nunca com um timestamp congelado
 * de criação de lote, que era exatamente o defeito visto no painel antigo
 * (seis linhas com o mesmo 12:06:40).
 *
 * A imagem é o frame corrente da MESMA MediaStream global, reduzida para
 * ~560px e mantida só em memória (últimos 24) — nada vai para o servidor.
 */

export type PrintKind =
  | "SESSAO"
  | "SWEEP"
  | "CHOCH"
  | "POI"
  | "ENTRADA VALIDADA"
  | "GATILHO"
  | "PARCIAL"
  | "ALVO"
  | "STOP";

export interface AutoPrint {
  id: string;
  /** Horário DO GRÁFICO (epoch ms) do evento que gerou o print. */
  chartTime: number;
  asset: string;
  timeframe: "1m";
  direction: "COMPRA" | "VENDA" | null;
  kind: PrintKind;
  /** ALTA / MÉDIA / BAIXA — derivada da qualidade visual real da leitura. */
  quality: "ALTA" | "MÉDIA" | "BAIXA";
  /** Rótulo da zona/região do evento (ex.: faixa do POI). */
  zone: string | null;
  /** JPEG dataURL reduzido do frame no instante do evento. */
  imageDataUrl: string | null;
}

const MAX_PRINTS = 24;
const PRINT_WIDTH = 560;

type CaptureFrame = () => string | null;

/** Captura o frame corrente do <video> global, reduzido. Client-only. */
function defaultCaptureFrame(): string | null {
  if (typeof document === "undefined") return null;
  const video = screenCaptureManager.videoRef.current;
  if (!video?.videoWidth || !video.videoHeight) return null;
  const scale = Math.min(1, PRINT_WIDTH / video.videoWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  try {
    return canvas.toDataURL("image/jpeg", 0.72);
  } catch {
    return null;
  }
}

export function qualityLabel(candleQuality: number): AutoPrint["quality"] {
  if (candleQuality >= 75) return "ALTA";
  if (candleQuality >= 50) return "MÉDIA";
  return "BAIXA";
}

export class PrintStore {
  private prints: AutoPrint[] = [];
  private listeners = new Set<() => void>();
  private sequence = 0;

  constructor(private readonly captureFrame: CaptureFrame = defaultCaptureFrame) {}

  list(): AutoPrint[] {
    return this.prints;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Registra um print. Dedupe por (kind + minuto do gráfico + direção): o
   * mesmo evento reavaliado em frames seguidos não vira spam de linhas.
   */
  capture(input: {
    chartTime: number;
    asset: string;
    kind: PrintKind;
    direction?: "COMPRA" | "VENDA" | null;
    candleQuality?: number;
    zone?: string | null;
  }): AutoPrint | null {
    const minute = Math.floor(input.chartTime / 60_000);
    const direction = input.direction ?? null;
    const duplicate = this.prints.some(
      (print) =>
        print.kind === input.kind &&
        print.direction === direction &&
        Math.floor(print.chartTime / 60_000) === minute,
    );
    if (duplicate) return null;
    const print: AutoPrint = {
      id: `print_${++this.sequence}_${input.chartTime.toString(36)}`,
      chartTime: input.chartTime,
      asset: input.asset,
      timeframe: "1m",
      direction,
      kind: input.kind,
      quality: qualityLabel(input.candleQuality ?? 0),
      zone: input.zone ?? null,
      imageDataUrl: this.captureFrame(),
    };
    this.prints = [print, ...this.prints].slice(0, MAX_PRINTS);
    for (const listener of this.listeners) listener();
    return print;
  }

  clear(): void {
    this.prints = [];
    for (const listener of this.listeners) listener();
  }
}

/** Singleton global — sobrevive à troca de rotas, como os demais managers. */
export const printStore = new PrintStore();
