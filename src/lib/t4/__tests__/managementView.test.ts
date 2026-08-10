import { describe, expect, it } from "vitest";

import { buildManagementView, UNTRUSTED_PRICE_LABEL, type LivePriceInfo } from "../managementView";
import { createSignalSnapshot } from "../signalSnapshot";
import type { AnalysisResult, Candle } from "@/lib/engines/types";

const candle: Candle = {
  t: 1_700_000_000_000,
  o: 173_200,
  h: 173_400,
  l: 173_100,
  c: 173_270,
  v: 0,
};

function trusted(price: number): LivePriceInfo {
  return { price, trusted: true, reason: null, at: candle.t };
}

const UNTRUSTED: LivePriceInfo = {
  price: null,
  trusted: false,
  reason: "PREÇO NÃO CONFIÁVEL — divergência de escala.",
  at: candle.t,
};

function analysisWithPlan(entry: number): AnalysisResult {
  return {
    reading: { label: "LEITURA SUFICIENTE", sufficient: true },
    blockers: [],
    plan: { entry, stop: entry - 200, target1: entry + 600, target2: entry + 1000 },
  } as unknown as AnalysisResult;
}

function frozenSnapshot() {
  return createSignalSnapshot({
    asset: "WINFUT",
    chartTimestamp: candle.t,
    direction: "COMPRA",
    entry: 173_270,
    initialStop: 173_070,
    threeR: 173_870,
    fiveR: 174_270,
    setup: "TREND_FIRST_PULLBACK",
    confirmationCandle: candle,
  });
}

describe("gerenciamento ao vivo — view-model (comando gerenciamento §12)", () => {
  it("a) preço atual VARIA em tempo real durante a análise, sem AGUARDANDO DADOS", () => {
    const first = buildManagementView({
      sessionActive: true,
      analysis: analysisWithPlan(173_250),
      snapshot: null,
      priceInfo: trusted(173_250),
      tickSize: 5,
      decimals: 0,
    });
    const second = buildManagementView({
      sessionActive: true,
      analysis: analysisWithPlan(173_310),
      snapshot: null,
      priceInfo: trusted(173_310),
      tickSize: 5,
      decimals: 0,
    });
    expect(first.livePriceLabel).toBe("PREÇO ATUAL");
    expect(first.status).toBe("ANALISANDO");
    expect(first.livePrice).toBe("173250");
    expect(second.livePrice).toBe("173310");
    expect(first.livePrice).not.toContain("AGUARDANDO");
  });

  it("b) antes do 100% a entrada NÃO congela: segue o mercado, neutra, sem stop/alvos", () => {
    const view = buildManagementView({
      sessionActive: true,
      analysis: analysisWithPlan(173_250),
      snapshot: null,
      priceInfo: trusted(173_250),
      tickSize: 5,
      decimals: 0,
    });
    expect(view.entry?.frozen).toBe(false);
    expect(view.entry?.tone).toBe("neutral");
    expect(view.stop).toBeNull();
    expect(view.threeR).toBeNull();
    expect(view.fiveR).toBeNull();
    expect(view.runner).toBeNull();

    const moved = buildManagementView({
      sessionActive: true,
      analysis: analysisWithPlan(173_400),
      snapshot: null,
      priceInfo: trusted(173_400),
      tickSize: 5,
      decimals: 0,
    });
    expect(moved.entry?.value).not.toBe(view.entry?.value); // acompanha o mercado
  });

  it("c) no 100% congela EXATAMENTE no snapshot, entrada verde, níveis do snapshot", () => {
    const snapshot = frozenSnapshot();
    const view = buildManagementView({
      sessionActive: true,
      analysis: analysisWithPlan(173_500),
      snapshot,
      priceInfo: trusted(173_500),
      tickSize: 5,
      decimals: 0,
    });
    expect(view.status).toBe("CONFIRMADO");
    expect(view.direction).toBe("COMPRA");
    expect(view.entry).toEqual({ value: "173270", frozen: true, tone: "bull" });
    expect(view.stop?.value).toBe("173070");
    expect(view.threeR?.value).toBe("173870");
    expect(view.fiveR?.value).toBe("174270");
    expect(view.runner).toBe("ESTRUTURAL");
    expect(view.signalId).toBe(snapshot.signalId);
  });

  it("f) mudança posterior do mercado NÃO altera entrada/stop/alvos congelados; MERCADO AGORA segue", () => {
    const snapshot = frozenSnapshot();
    const later = buildManagementView({
      sessionActive: true,
      // Análise nova com plano completamente diferente…
      analysis: analysisWithPlan(174_800),
      snapshot,
      priceInfo: trusted(174_800),
      tickSize: 5,
      decimals: 0,
    });
    // …mas os níveis continuam EXCLUSIVAMENTE do snapshot congelado.
    expect(later.entry?.value).toBe("173270");
    expect(later.stop?.value).toBe("173070");
    expect(later.livePriceLabel).toBe("MERCADO AGORA");
    expect(later.livePrice).toBe("174800");
  });

  it("g) perda de calibração antes do 100%: PREÇO NÃO CONFIÁVEL e nada congela", () => {
    const view = buildManagementView({
      sessionActive: true,
      analysis: analysisWithPlan(173_250),
      snapshot: null,
      priceInfo: UNTRUSTED,
      tickSize: 5,
      decimals: 0,
    });
    expect(view.livePrice).toBe(UNTRUSTED_PRICE_LABEL);
    expect(view.priceReason).toContain("divergência");
    expect(view.entry).toBeNull(); // nenhuma candidata com preço não confiável
    expect(view.status).toBe("ANALISANDO");
  });

  it("h) Operação ao Vivo e Gerenciamento exibem valores IDÊNTICOS (mesma função, mesmos insumos)", () => {
    const input = {
      sessionActive: true,
      analysis: analysisWithPlan(173_250),
      snapshot: frozenSnapshot(),
      priceInfo: trusted(173_255),
      tickSize: 5,
      decimals: 0,
    };
    expect(buildManagementView(input)).toEqual(buildManagementView(input));
  });

  it("arredondamento pelo incremento real: engine e gerenciamento batem (§9)", () => {
    const view = buildManagementView({
      sessionActive: true,
      analysis: null,
      snapshot: null,
      priceInfo: trusted(173_272.4),
      tickSize: 5,
      decimals: 0,
    });
    expect(view.livePrice).toBe("173270");
  });
});
