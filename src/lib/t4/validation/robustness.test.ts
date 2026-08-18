import { describe, expect, it } from "vitest";

import { splitDatasets } from "./datasets";
import { makeTrades, losingPattern, winningPattern } from "./fixtures";
import {
  MAX_ROBUSTNESS,
  MIN_BACKTEST_SAMPLE,
  MIN_FORWARD_SAMPLE,
  ROBUSTNESS_WEIGHTS,
  STATUS_LABEL,
  computeRobustness,
} from "./robustness";
import type { DatasetSplitResult } from "./datasets";
import type { T4Trade } from "./types";

function split(train: T4Trade[], oos: T4Trade[] = [], forward: T4Trade[] = []): DatasetSplitResult {
  return {
    train: train.map((t) => ({ ...t, dataset: "TRAIN" as const })),
    outOfSample: oos.map((t) => ({ ...t, dataset: "OUT_OF_SAMPLE" as const })),
    forward: forward.map((t) => ({ ...t, dataset: "FORWARD" as const })),
  };
}

function ids(list: T4Trade[], prefix: string): T4Trade[] {
  return list.map((trade, index) => ({
    ...trade,
    tradeId: `${prefix}${index}`,
    signalId: `${prefix}${index}`,
  }));
}

describe("pesos da robustez", () => {
  it("a soma dos pesos é exatamente 100", () => {
    expect(MAX_ROBUSTNESS).toBe(100);
  });

  it("todo componente declarado tem peso positivo", () => {
    for (const [id, weight] of Object.entries(ROBUSTNESS_WEIGHTS)) {
      expect(weight, id).toBeGreaterThan(0);
    }
  });
});

describe("computeRobustness — determinismo e decomposição", () => {
  const sample = split(
    ids(makeTrades(120, winningPattern), "tr"),
    ids(makeTrades(60, winningPattern), "oo"),
    ids(makeTrades(40, winningPattern), "fw"),
  );

  it("é determinística: mesma amostra, mesma nota", () => {
    const a = computeRobustness(sample);
    const b = computeRobustness(sample);
    expect(a.score).toBe(b.score);
    expect(a.components).toEqual(b.components);
    expect(a.status).toBe(b.status);
  });

  it("a nota é exatamente a soma dos componentes", () => {
    const report = computeRobustness(sample);
    const sum = report.components.reduce((total, item) => total + item.points, 0);
    expect(report.score).toBeCloseTo(sum, 1);
  });

  it("nenhum componente ultrapassa o próprio teto", () => {
    const report = computeRobustness(sample);
    for (const component of report.components) {
      expect(component.points, component.id).toBeLessThanOrEqual(component.maxPoints);
      expect(component.points, component.id).toBeGreaterThanOrEqual(0);
    }
  });

  it("cobre os oito eixos exigidos", () => {
    const report = computeRobustness(sample);
    expect(report.components.map((c) => c.id)).toEqual([
      "amostra",
      "outOfSample",
      "forward",
      "estabilidade",
      "risco",
      "walkForward",
      "bootstrap",
      "sensibilidade",
    ]);
  });

  it("todo componente traz o MOTIVO da pontuação", () => {
    for (const component of computeRobustness(sample).components) {
      expect(component.reason.length, component.id).toBeGreaterThan(10);
    }
  });

  it("a nota fica entre 0 e 100", () => {
    const report = computeRobustness(sample);
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThanOrEqual(100);
  });
});

describe("computeRobustness — linguagem honesta", () => {
  it("NUNCA apresenta a nota como chance de funcionar", () => {
    const report = computeRobustness(
      split(
        ids(makeTrades(120, winningPattern), "t"),
        ids(makeTrades(60, winningPattern), "o"),
        ids(makeTrades(40, winningPattern), "f"),
      ),
    );
    const text = `${report.headline} ${report.limitations.join(" ")} ${report.components.map((c) => c.reason).join(" ")}`;
    // A frase só pode aparecer NEGADA ("não é chance de lucro").
    expect(text).not.toMatch(/(?<!não é )chance de (funcionar|ganhar|lucro)/i);
    // "não é garantia" é EXATAMENTE o que deve aparecer; o que não pode
    // existir é uma promessa de garantia.
    expect(text).not.toMatch(/(?<!não é )garantia de/i);
    expect(text).not.toMatch(/\bgarantid[oa]\b/i);
    expect(text).not.toMatch(/100% lucrativ/i);
    expect(report.headline).toContain("não é chance de lucro");
  });
});

describe("ciclo de vida do STATUS", () => {
  it("sem trades: NÃO TESTADA", () => {
    const report = computeRobustness(split([]));
    expect(report.status).toBe("NAO_TESTADA");
    expect(report.statusLabel).toBe("NÃO TESTADA");
  });

  it("amostra pequena: AGUARDANDO DADOS SUFICIENTES", () => {
    const report = computeRobustness(split(ids(makeTrades(10, winningPattern), "t")));
    expect(report.status).toBe("AGUARDANDO_DADOS_SUFICIENTES");
    expect(report.limitations.join(" ")).toContain(String(MIN_BACKTEST_SAMPLE));
  });

  it("só backtest, sem OOS: BACKTEST", () => {
    const report = computeRobustness(split(ids(makeTrades(120, winningPattern), "t")));
    expect(report.status).toBe("BACKTEST");
    expect(report.limitations.join(" ")).toContain("out-of-sample");
  });

  it("com OOS positivo e sem forward: OOS", () => {
    const report = computeRobustness(
      split(ids(makeTrades(120, winningPattern), "t"), ids(makeTrades(60, winningPattern), "o")),
    );
    expect(report.status).toBe("OOS");
    expect(report.limitations.join(" ")).toContain("forward");
  });

  it("OOS claramente perdedor fecha em VALIDAÇÃO ESTATÍSTICA NEGATIVA", () => {
    const report = computeRobustness(
      split(ids(makeTrades(120, winningPattern), "t"), ids(makeTrades(80, losingPattern), "o")),
    );
    expect(report.status).toBe("VALIDACAO_ESTATISTICA_NEGATIVA");
  });

  it("amostra completa e consistente chega a VALIDAÇÃO ESTATÍSTICA POSITIVA", () => {
    const report = computeRobustness(
      split(
        ids(makeTrades(150, winningPattern), "t"),
        ids(makeTrades(100, winningPattern), "o"),
        ids(makeTrades(80, winningPattern), "f"),
      ),
    );
    expect(report.status).toBe("VALIDACAO_ESTATISTICA_POSITIVA");
    expect(report.headline).toContain("não é garantia");
  });

  it("todo status tem rótulo em português", () => {
    for (const [status, label] of Object.entries(STATUS_LABEL)) {
      expect(label.length, status).toBeGreaterThan(3);
    }
  });

  it("forward pequeno demais não conta como forward", () => {
    const report = computeRobustness(
      split(
        ids(makeTrades(120, winningPattern), "t"),
        ids(makeTrades(60, winningPattern), "o"),
        ids(makeTrades(MIN_FORWARD_SAMPLE - 1, winningPattern), "f"),
      ),
    );
    expect(report.status).toBe("OOS");
    const forwardComponent = report.components.find((c) => c.id === "forward")!;
    expect(forwardComponent.points).toBe(0);
    expect(forwardComponent.unavailable).toBe(true);
  });
});

describe("componentes indisponíveis pontuam zero e dizem por quê", () => {
  it("sem OOS, o componente OOS é 0 e explicado", () => {
    const report = computeRobustness(split(ids(makeTrades(120, winningPattern), "t")));
    const oos = report.components.find((c) => c.id === "outOfSample")!;
    expect(oos.points).toBe(0);
    expect(oos.unavailable).toBe(true);
    expect(oos.reason).toContain("teste cego");
  });

  it("IC 95% inteiramente NEGATIVO não vale ponto — significância não é vantagem", () => {
    const report = computeRobustness(
      split(ids(makeTrades(120, losingPattern), "t"), ids(makeTrades(80, losingPattern), "o")),
    );
    const bootstrap = report.components.find((c) => c.id === "bootstrap")!;
    expect(bootstrap.points).toBe(0);
  });

  it("amostra vencedora e grande obtém nota substancialmente maior que a perdedora", () => {
    const good = computeRobustness(
      split(
        ids(makeTrades(150, winningPattern), "t"),
        ids(makeTrades(100, winningPattern), "o"),
        ids(makeTrades(80, winningPattern), "f"),
      ),
    );
    const bad = computeRobustness(
      split(
        ids(makeTrades(150, losingPattern), "t"),
        ids(makeTrades(100, losingPattern), "o"),
        ids(makeTrades(80, losingPattern), "f"),
      ),
    );
    expect(good.score).toBeGreaterThan(bad.score + 20);
  });
});

describe("integração com splitDatasets", () => {
  it("o split cronológico alimenta a robustez sem misturar FORWARD", () => {
    const historical = ids(makeTrades(100, winningPattern), "h");
    const forward = ids(makeTrades(40, winningPattern), "f").map((t) => ({
      ...t,
      dataset: "FORWARD" as const,
    }));
    const result = splitDatasets([...historical, ...forward]);
    expect(result.forward).toHaveLength(40);
    const report = computeRobustness(result);
    expect(report.metrics.forward.trades).toBe(40);
    expect(report.metrics.train.trades + report.metrics.outOfSample.trades).toBe(100);
  });
});
