import { describe, expect, it } from "vitest";

import { PrintStore, qualityLabel } from "../printStore";

/** Store sem canvas: o teste é sobre carimbo de hora e dedupe, não sobre imagem. */
function store() {
  return new PrintStore(() => "data:image/jpeg;base64,FAKE");
}

const MINUTE = 60_000;
const T0 = 1_700_000_000_000;

describe("prints automáticos — horário do gráfico, nunca congelado", () => {
  it("cada print carrega o horário do SEU evento (o bug do painel antigo)", () => {
    const printStore = store();
    printStore.capture({ chartTime: T0, asset: "WINFUT", kind: "SWEEP" });
    printStore.capture({ chartTime: T0 + MINUTE, asset: "WINFUT", kind: "CHOCH" });
    printStore.capture({ chartTime: T0 + 2 * MINUTE, asset: "WINFUT", kind: "POI" });

    const horarios = printStore.list().map((print) => print.chartTime);
    // Painel antigo repetia o MESMO timestamp em todas as linhas (12:06:40 ×6).
    expect(new Set(horarios).size).toBe(3);
    expect(horarios).toEqual([T0 + 2 * MINUTE, T0 + MINUTE, T0]); // mais novo primeiro
  });

  it("o horário vem do GRÁFICO, não do relógio da máquina", () => {
    const printStore = store();
    // Um pregão histórico de 2024 continua carimbado em 2024.
    const historico = new Date("2024-03-18T13:45:00Z").getTime();
    printStore.capture({ chartTime: historico, asset: "WINFUT", kind: "POI" });
    expect(printStore.list()[0]!.chartTime).toBe(historico);
  });

  it("dedupe por tipo+minuto+direção: reavaliar o mesmo evento não vira spam", () => {
    const printStore = store();
    const first = printStore.capture({
      chartTime: T0,
      asset: "WINFUT",
      kind: "SWEEP",
      direction: "COMPRA",
    });
    const repeat = printStore.capture({
      chartTime: T0 + 5_000, // mesmo minuto do gráfico
      asset: "WINFUT",
      kind: "SWEEP",
      direction: "COMPRA",
    });
    expect(first).not.toBeNull();
    expect(repeat).toBeNull();
    expect(printStore.list()).toHaveLength(1);
  });

  it("mesmo minuto com tipo ou direção diferente são prints distintos", () => {
    const printStore = store();
    printStore.capture({ chartTime: T0, asset: "WINFUT", kind: "SWEEP", direction: "COMPRA" });
    printStore.capture({ chartTime: T0, asset: "WINFUT", kind: "POI", direction: "COMPRA" });
    printStore.capture({ chartTime: T0, asset: "WINFUT", kind: "SWEEP", direction: "VENDA" });
    expect(printStore.list()).toHaveLength(3);
  });

  it("mantém no máximo 24 prints, descartando os mais antigos", () => {
    const printStore = store();
    for (let i = 0; i < 30; i++) {
      printStore.capture({ chartTime: T0 + i * MINUTE, asset: "WINFUT", kind: "POI" });
    }
    const list = printStore.list();
    expect(list).toHaveLength(24);
    expect(list[0]!.chartTime).toBe(T0 + 29 * MINUTE);
  });

  it("qualidade vem da leitura visual REAL, não de rótulo fixo", () => {
    expect(qualityLabel(90)).toBe("ALTA");
    expect(qualityLabel(60)).toBe("MÉDIA");
    expect(qualityLabel(20)).toBe("BAIXA");
    const printStore = store();
    printStore.capture({ chartTime: T0, asset: "WINFUT", kind: "POI", candleQuality: 88 });
    expect(printStore.list()[0]!.quality).toBe("ALTA");
  });

  it("notifica assinantes a cada print (a UI não faz polling)", () => {
    const printStore = store();
    let notifications = 0;
    const unsubscribe = printStore.subscribe(() => notifications++);
    printStore.capture({ chartTime: T0, asset: "WINFUT", kind: "SESSAO" });
    printStore.capture({ chartTime: T0 + MINUTE, asset: "WINFUT", kind: "POI" });
    unsubscribe();
    printStore.capture({ chartTime: T0 + 2 * MINUTE, asset: "WINFUT", kind: "CHOCH" });
    expect(notifications).toBe(2);
  });
});
