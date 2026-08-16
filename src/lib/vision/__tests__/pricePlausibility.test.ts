import { describe, expect, it } from "vitest";

import {
  calibrateFromAnchors,
  calibrationDrift,
  geometricCalibration,
  priceAt,
  pricePlausibility,
  roundToTick,
  type ScaleAnchor,
} from "../priceScale";

/** Escala real do WIN: 173.900 no topo do recorte, 172.900 mais abaixo. */
function winCalibration() {
  const anchors: ScaleAnchor[] = [
    { y: 100, price: 173_900, raw: "173.900", source: "ocr", confidence: 0.95 },
    { y: 300, price: 173_400, raw: "173.400", source: "ocr", confidence: 0.95 },
    { y: 500, price: 172_900, raw: "172.900", source: "ocr", confidence: 0.95 },
  ];
  const calibration = calibrateFromAnchors(anchors);
  expect(calibration.usable).toBe(true);
  return calibration;
}

describe("plausibilidade do preço (comando ao-vivo §1 — escala errada)", () => {
  it("aceita preço dentro da faixa visível e contínuo", () => {
    const result = pricePlausibility({
      asset: "WINFUT",
      calibration: winCalibration(),
      price: 173_270,
      frameHeight: 600,
      lastPrice: 173_250,
    });
    expect(result.ok).toBe(true);
    expect(result.reason).toBeNull();
  });

  it("rejeita marcador de preço lido FORA do frame (leitura corrompida)", () => {
    const result = pricePlausibility({
      asset: "WINFUT",
      calibration: winCalibration(),
      price: 173_270,
      frameHeight: 600,
      priceY: 1_400, // muito além da altura do recorte
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("fora do frame");
  });

  /**
   * REGRESSÃO DA AUDITORIA: a antiga checagem contra `visibleRange` era
   * TAUTOLÓGICA — como `price = priceAt(y)` é linear na MESMA calibração,
   * todo y dentro do frame cai dentro da faixa dessa calibração. Ela nunca
   * reprovava nada em produção (o teste antigo só passava porque injetava um
   * preço que aquele caminho jamais produziria). A defesa real contra escala
   * vencida é `calibrationDrift` com âncoras OCR NOVAS — medição independente.
   */
  it("preço derivado da própria régua está sempre na faixa dela — por isso a checagem antiga era inerte", () => {
    const calibration = winCalibration();
    for (const y of [0, 150, 300, 450, 600]) {
      const price = priceAt(calibration, y)!;
      expect(pricePlausibility({ asset: "WINFUT", calibration, price, frameHeight: 600 }).ok).toBe(
        true,
      );
    }
  });

  it("DETECTA escala vencida: âncoras novas do Profit não batem com a régua antiga", () => {
    const antiga = winCalibration();
    // O Profit autoescalou: os mesmos preços agora aparecem em outras linhas.
    const frescas: ScaleAnchor[] = [
      { y: 100, price: 176_000, raw: "176.000", source: "ocr", confidence: 0.95 },
      { y: 300, price: 175_500, raw: "175.500", source: "ocr", confidence: 0.95 },
      { y: 500, price: 175_000, raw: "175.000", source: "ocr", confidence: 0.95 },
    ];
    const drift = calibrationDrift(antiga, frescas);
    expect(drift.stale).toBe(true);
    expect(drift.maxDriftPx).toBeGreaterThan(2.5);
  });

  it("escala ESTÁVEL não é marcada como vencida — refresh não pode reiniciar a série à toa", () => {
    const antiga = winCalibration();
    const frescas: ScaleAnchor[] = [
      { y: 100.4, price: 173_900, raw: "173.900", source: "ocr", confidence: 0.95 },
      { y: 300.2, price: 173_400, raw: "173.400", source: "ocr", confidence: 0.95 },
      { y: 499.7, price: 172_900, raw: "172.900", source: "ocr", confidence: 0.95 },
    ];
    expect(calibrationDrift(antiga, frescas).stale).toBe(false);
  });

  it("rejeita preço fora da faixa plausível do ativo (escala de outro painel)", () => {
    const result = pricePlausibility({
      asset: "WINFUT",
      calibration: winCalibration(),
      price: 700_000,
      frameHeight: 600,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("faixa plausível");
  });

  it("rejeita salto de >2% entre leituras consecutivas (divergência, não mercado)", () => {
    // Dentro da margem da faixa visível, mas 2,4% acima da última leitura:
    // nenhum WIN anda 4.100 pontos entre dois frames de 500 ms.
    const wide = calibrateFromAnchors([
      { y: 50, price: 180_000, raw: "180.000", source: "ocr", confidence: 0.95 },
      { y: 300, price: 175_000, raw: "175.000", source: "ocr", confidence: 0.95 },
      { y: 550, price: 170_000, raw: "170.000", source: "ocr", confidence: 0.95 },
    ]);
    expect(wide.usable).toBe(true);
    const result = pricePlausibility({
      asset: "WINFUT",
      calibration: wide,
      price: 177_400,
      frameHeight: 600,
      lastPrice: 173_270,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("Salto");
  });

  it("modo geométrico não é avaliado: não é preço real por definição", () => {
    const result = pricePlausibility({
      asset: "WINFUT",
      calibration: geometricCalibration(600),
      price: 412, // unidade de pixel
      frameHeight: 600,
    });
    expect(result.ok).toBe(true);
  });
});

describe("arredondamento pelo incremento real (comando gerenciamento §9)", () => {
  it("arredonda pelo tick do WIN (5 pontos)", () => {
    expect(roundToTick(173_272, 5, 0)).toBe(173_270);
    expect(roundToTick(173_273, 5, 0)).toBe(173_275);
  });

  it("sem tick conhecido, respeita as casas decimais da escala", () => {
    expect(roundToTick(5_432.567, null, 2)).toBe(5_432.57);
  });

  it("valores idênticos após o arredondamento — mesma fonte, mesmo número", () => {
    const enginePrice = roundToTick(173_271.9, 5, 0);
    const managementPrice = roundToTick(173_272.2, 5, 0);
    expect(enginePrice).toBe(managementPrice);
  });
});
