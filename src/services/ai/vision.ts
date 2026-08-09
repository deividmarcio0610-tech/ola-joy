import * as z from "zod";

import type { ScaleAnchor } from "@/lib/vision/priceScale";
import { validateYPercent } from "@/lib/vision/yPercent";
import { extractJsonObject } from "@/lib/jsonExtract";

import { aiConfig } from "./config";
import { aiBreaker, describeAIError } from "./gateway";

const VisionPayload = z.object({
  labels: z
    .array(
      z.object({
        raw: z.string().min(1).max(40),
        price: z.number().finite(),
        // Validação fina label a label em selectScaleAnchors (spec V5 §12) —
        // uma label fisicamente impossível é descartada com motivo, sem
        // derrubar a leitura inteira das demais.
        yPercent: z.number().finite(),
        confidence: z.number().min(0).max(1),
      }),
    )
    .max(20),
  linearScale: z.boolean().default(true),
});

export interface VisionScaleResult {
  anchors: ScaleAnchor[];
  model: string;
  error: string | null;
}

function imageBase64(dataUrl: string): string | null {
  const match = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  return match?.[1] ?? null;
}

type VisionLabel = z.infer<typeof VisionPayload>["labels"][number];

/**
 * Seleciona TODAS as âncoras consistentes da leitura do Qwen-VL — não apenas
 * um par. Motivos:
 *
 * 1. Com apenas 2 âncoras o R² da regressão é sempre 1, então a proteção
 *    contra escala não linear / dígito trocado pelo OCR (priceScale.ts) fica
 *    inoperante. Com 3+ âncoras a validação de linearidade volta a funcionar.
 * 2. `calibrateFromAnchors` dá bônus de robustez a partir de 3 âncoras
 *    (preferredAnchors); descartar rótulos válidos reprovava calibrações boas.
 *
 * Consistência exigida: preço estritamente decrescente conforme y cresce
 * (escala de preço normal). Rótulos que quebram a monotonicidade (horários,
 * indicadores, dígito trocado) são descartados via maior cadeia consistente.
 */
export function selectScaleAnchors(labels: VisionLabel[], frameHeight: number): ScaleAnchor[] {
  const sorted = labels
    .filter(
      (label) =>
        Number.isFinite(label.price) &&
        validateYPercent(label.yPercent).valid &&
        label.confidence >= 0.7,
    )
    .sort((a, b) => a.yPercent - b.yPercent);

  // Dedupe por altura (~1.5% do frame): mantém a leitura mais confiável.
  const deduped: VisionLabel[] = [];
  for (const label of sorted) {
    const previous = deduped[deduped.length - 1];
    if (previous && label.yPercent - previous.yPercent < 1.5) {
      if (label.confidence > previous.confidence) deduped[deduped.length - 1] = label;
      continue;
    }
    deduped.push(label);
  }

  // Maior cadeia com preço estritamente decrescente (O(n²), n ≤ 20).
  const chains: VisionLabel[][] = deduped.map((label) => [label]);
  let best: VisionLabel[] = [];
  for (let i = 0; i < deduped.length; i++) {
    for (let j = 0; j < i; j++) {
      if (deduped[j]!.price > deduped[i]!.price && chains[j]!.length + 1 > chains[i]!.length) {
        chains[i] = [...chains[j]!, deduped[i]!];
      }
    }
    const candidate = chains[i]!;
    const candidateSpan =
      candidate.length < 2 ? 0 : candidate[candidate.length - 1]!.yPercent - candidate[0]!.yPercent;
    const bestSpan = best.length < 2 ? 0 : best[best.length - 1]!.yPercent - best[0]!.yPercent;
    if (
      candidate.length > best.length ||
      (candidate.length === best.length && candidateSpan > bestSpan)
    ) {
      best = candidate;
    }
  }

  // Mesmas exigências mínimas de antes: 2 âncoras bem separadas verticalmente.
  if (best.length < 2) return [];
  const span = best[best.length - 1]!.yPercent - best[0]!.yPercent;
  if (span < 18) return [];

  return best.slice(0, 12).map((label) => ({
    y: (label.yPercent / 100) * frameHeight,
    price: label.price,
    raw: label.raw,
    source: "ocr" as const,
    confidence: label.confidence,
  }));
}

/** Nome antigo mantido por compatibilidade — hoje devolve todas as âncoras consistentes. */
export const selectBestScalePair = selectScaleAnchors;

export async function readPriceScaleWithVision(
  dataUrl: string,
  frameHeight: number,
): Promise<VisionScaleResult> {
  const config = aiConfig();
  const image = imageBase64(dataUrl);
  if (!config.baseUrl || config.provider !== "ollama") {
    return { anchors: [], model: config.visionModel, error: "O OCR automático exige Ollama." };
  }
  if (!config.visionModel) {
    return {
      anchors: [],
      model: "",
      error: "Modelo visual não configurado. Defina OLLAMA_VISION_MODEL.",
    };
  }
  if (!image) {
    return { anchors: [], model: config.visionModel, error: "Imagem de escala inválida." };
  }

  try {
    const response = await aiBreaker.run(() =>
      fetch(`${config.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(config.timeoutMs),
        body: JSON.stringify({
          model: config.visionModel,
          stream: false,
          think: false,
          format: {
            type: "object",
            properties: {
              labels: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    raw: { type: "string" },
                    price: { type: "number" },
                    yPercent: { type: "number" },
                    confidence: { type: "number" },
                  },
                  required: ["raw", "price", "yPercent", "confidence"],
                },
              },
              linearScale: { type: "boolean" },
            },
            required: ["labels", "linearScale"],
          },
          options: { temperature: 0 },
          messages: [
            {
              role: "user",
              content:
                "Faça somente OCR da escala vertical de PREÇOS deste gráfico do Profit. O recorte contém uma régua percentual à esquerda. Copie os rótulos numéricos da escala de preços à direita e informe o centro vertical de cada rótulo usando a régua (0 no topo, 100 na base). Ignore horários, indicadores, volume, contadores de candle e números fora da escala. Atenção ao formato brasileiro: em contratos como WIN, um rótulo visual 203.625 representa 203625 pontos (ponto de milhar), não o decimal 203.625. Preserve também o texto original em raw. O preço deve diminuir de cima para baixo. Retorne preferencialmente três ou mais rótulos bem separados; dois são o mínimo. Não estime número ilegível.",
              images: [image],
            },
          ],
        }),
      }).then(async (result) => {
        if (!result.ok) throw new Error(`status ${result.status}`);
        return result;
      }),
    );
    const payload = (await response.json()) as { message?: { content?: string } };
    const raw = payload.message?.content?.trim() ?? "";
    // Extração robusta (spec §92): tolera cercas markdown e texto ao redor;
    // sem objeto válido, falha controlada — nunca palpite.
    const extracted = extractJsonObject(raw);
    if (extracted === null) {
      return {
        anchors: [],
        model: config.visionModel,
        error: "A resposta da IA não contém JSON válido de escala.",
      };
    }
    const parsed = VisionPayload.parse(extracted);
    if (!parsed.linearScale) {
      return {
        anchors: [],
        model: config.visionModel,
        error: "A escala visual não parece linear.",
      };
    }
    const anchors = selectScaleAnchors(parsed.labels, frameHeight);
    return {
      anchors,
      model: config.visionModel,
      error:
        anchors.length >= 2
          ? null
          : "O Qwen-VL não encontrou dois preços legíveis e suficientemente separados.",
    };
  } catch (error) {
    return {
      anchors: [],
      model: config.visionModel,
      error: describeAIError(error, config.visionModel, config.timeoutMs),
    };
  }
}
