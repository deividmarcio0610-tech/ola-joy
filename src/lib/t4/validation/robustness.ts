import { computeT4Metrics, executedTrades, type T4Metrics } from "./metrics";
import { bootstrapExpectancy, type BootstrapResult } from "./resampling";
import { segmentByConfluence, segmentByRegime } from "./segmentation";
import { walkForwardT4, type WalkForwardResult } from "./walkForward";
import type { DatasetSplitResult } from "./datasets";
import type { T4Trade, ValidationStatus } from "./types";

/**
 * ROBUSTEZ / EVIDÊNCIA ESTATÍSTICA 0–100 (requisito 14).
 *
 * ESTA ESCALA NÃO É CONFLUÊNCIA E NÃO É PROBABILIDADE DE LUCRO.
 * Ela mede a QUALIDADE DA VALIDAÇÃO: o quanto se pode confiar no que foi
 * medido. Uma técnica pode ter 95 de robustez e ainda perder dinheiro amanhã;
 * o que 95 diz é "o que foi medido foi medido direito, com amostra, com dados
 * cegos e com estabilidade" — nunca "95% de chance de funcionar".
 *
 * DETERMINÍSTICA E DECOMPONÍVEL: a nota é a soma de sete componentes com
 * pesos fixos, cada um com seu próprio motivo em texto. Mesma amostra ⇒ mesma
 * nota, sempre (o bootstrap usa semente derivada dos próprios dados).
 */

export interface RobustnessComponent {
  id:
    | "amostra"
    | "outOfSample"
    | "forward"
    | "estabilidade"
    | "risco"
    | "walkForward"
    | "bootstrap"
    | "sensibilidade";
  label: string;
  /** Peso máximo do componente na nota final. */
  maxPoints: number;
  points: number;
  /** Por que o componente recebeu esta pontuação. */
  reason: string;
  /** true quando não havia dado suficiente para avaliar (pontua 0). */
  unavailable: boolean;
}

export interface RobustnessReport {
  /** 0–100. Qualidade da VALIDAÇÃO, não chance de lucro. */
  score: number;
  components: RobustnessComponent[];
  status: ValidationStatus;
  statusLabel: string;
  /** Frases que a interface pode exibir; nenhuma promete resultado. */
  headline: string;
  limitations: string[];
  metrics: {
    all: T4Metrics;
    train: T4Metrics;
    outOfSample: T4Metrics;
    forward: T4Metrics;
  };
  walkForward: WalkForwardResult;
  bootstrap: BootstrapResult;
}

/** Pesos fixos. Mudá-los muda a nota — por isso ficam visíveis e testados. */
export const ROBUSTNESS_WEIGHTS = {
  amostra: 20,
  outOfSample: 18,
  forward: 15,
  estabilidade: 12,
  risco: 12,
  walkForward: 11,
  bootstrap: 7,
  sensibilidade: 5,
} as const;

export const MAX_ROBUSTNESS = Object.values(ROBUSTNESS_WEIGHTS).reduce(
  (sum, value) => sum + value,
  0,
);

export const STATUS_LABEL: Record<ValidationStatus, string> = {
  NAO_TESTADA: "NÃO TESTADA",
  BACKTEST: "BACKTEST",
  OOS: "OUT-OF-SAMPLE",
  FORWARD: "FORWARD",
  VALIDACAO_ESTATISTICA_POSITIVA: "VALIDAÇÃO ESTATÍSTICA POSITIVA",
  VALIDACAO_ESTATISTICA_NEGATIVA: "VALIDAÇÃO ESTATÍSTICA NEGATIVA",
  AGUARDANDO_DADOS_SUFICIENTES: "AGUARDANDO DADOS SUFICIENTES",
};

/** Amostras mínimas de cada etapa para a nota reconhecer o degrau. */
export const MIN_BACKTEST_SAMPLE = 30;
export const MIN_OOS_SAMPLE = 30;
export const MIN_FORWARD_SAMPLE = 20;

function clampPoints(fraction: number, max: number): number {
  return Math.round(Math.max(0, Math.min(1, fraction)) * max * 100) / 100;
}

export function computeRobustness(split: DatasetSplitResult): RobustnessReport {
  const train = executedTrades(split.train);
  const oos = executedTrades(split.outOfSample);
  const forward = executedTrades(split.forward);
  const all = [...train, ...oos, ...forward];

  const metricsAll = computeT4Metrics(all);
  const metricsTrain = computeT4Metrics(train);
  const metricsOos = computeT4Metrics(oos);
  const metricsForward = computeT4Metrics(forward);

  const walk = walkForwardT4(all);
  const boot = bootstrapExpectancy(all);

  const components: RobustnessComponent[] = [];
  const limitations: string[] = [];

  // ── 1. AMOSTRA: quantidade de eventos independentes medidos.
  const sampleTarget = 200;
  components.push({
    id: "amostra",
    label: "Amostra",
    maxPoints: ROBUSTNESS_WEIGHTS.amostra,
    points: clampPoints(metricsAll.trades / sampleTarget, ROBUSTNESS_WEIGHTS.amostra),
    reason: `${metricsAll.trades} trade(s) executado(s); a pontuação cheia exige ${sampleTarget}.`,
    unavailable: metricsAll.trades === 0,
  });
  if (metricsAll.trades < MIN_BACKTEST_SAMPLE) {
    limitations.push(
      `Amostra de ${metricsAll.trades} trades está abaixo do mínimo de ${MIN_BACKTEST_SAMPLE} para qualquer conclusão estatística.`,
    );
  }

  // ── 2. OUT-OF-SAMPLE: dado que a estratégia não viu durante o estudo.
  if (metricsOos.trades < MIN_OOS_SAMPLE) {
    components.push({
      id: "outOfSample",
      label: "Out-of-sample",
      maxPoints: ROBUSTNESS_WEIGHTS.outOfSample,
      points: 0,
      reason: `OOS com ${metricsOos.trades} trade(s): abaixo de ${MIN_OOS_SAMPLE}, o teste cego não existe.`,
      unavailable: true,
    });
    limitations.push(
      "Sem out-of-sample suficiente: o resultado ainda é apenas ajuste ao histórico.",
    );
  } else {
    // Pontua por resultado positivo E por não desabar em relação ao treino.
    const positive = metricsOos.expectancy > 0 ? 0.6 : 0;
    const retention =
      metricsTrain.expectancy > 0
        ? Math.min(1, metricsOos.expectancy / metricsTrain.expectancy)
        : metricsOos.expectancy > 0
          ? 1
          : 0;
    components.push({
      id: "outOfSample",
      label: "Out-of-sample",
      maxPoints: ROBUSTNESS_WEIGHTS.outOfSample,
      points: clampPoints(positive + 0.4 * Math.max(0, retention), ROBUSTNESS_WEIGHTS.outOfSample),
      reason: `OOS: ${metricsOos.trades} trades, expectativa ${metricsOos.expectancy.toFixed(3)}R contra ${metricsTrain.expectancy.toFixed(3)}R no treino.`,
      unavailable: false,
    });
    if (metricsOos.expectancy <= 0) {
      limitations.push(
        "A expectativa fora da amostra é negativa ou nula — a vantagem não se repetiu no dado cego.",
      );
    }
  }

  // ── 3. FORWARD: decisões gravadas ANTES do resultado existir.
  if (metricsForward.trades < MIN_FORWARD_SAMPLE) {
    components.push({
      id: "forward",
      label: "Forward real",
      maxPoints: ROBUSTNESS_WEIGHTS.forward,
      points: 0,
      reason: `Forward com ${metricsForward.trades} trade(s): abaixo de ${MIN_FORWARD_SAMPLE}, não há prova de anterioridade suficiente.`,
      unavailable: true,
    });
    limitations.push(
      "Sem forward suficiente: nenhuma decisão foi verificada com snapshot gravado antes do resultado.",
    );
  } else {
    components.push({
      id: "forward",
      label: "Forward real",
      maxPoints: ROBUSTNESS_WEIGHTS.forward,
      points: clampPoints(
        (metricsForward.expectancy > 0 ? 0.7 : 0) +
          0.3 * Math.min(1, metricsForward.trades / (MIN_FORWARD_SAMPLE * 3)),
        ROBUSTNESS_WEIGHTS.forward,
      ),
      reason: `Forward: ${metricsForward.trades} trades, expectativa ${metricsForward.expectancy.toFixed(3)}R.`,
      unavailable: false,
    });
  }

  // ── 4. ESTABILIDADE entre treino e OOS: a vantagem sobreviveu à troca de dado?
  if (metricsTrain.trades < MIN_BACKTEST_SAMPLE || metricsOos.trades < MIN_OOS_SAMPLE) {
    components.push({
      id: "estabilidade",
      label: "Estabilidade treino × OOS",
      maxPoints: ROBUSTNESS_WEIGHTS.estabilidade,
      points: 0,
      reason: "Não há treino e OOS com amostra suficiente para comparar.",
      unavailable: true,
    });
  } else {
    const scale = Math.max(Math.abs(metricsTrain.expectancy), 0.1);
    const drift = Math.abs(metricsTrain.expectancy - metricsOos.expectancy) / scale;
    components.push({
      id: "estabilidade",
      label: "Estabilidade treino × OOS",
      maxPoints: ROBUSTNESS_WEIGHTS.estabilidade,
      points: clampPoints(1 - drift, ROBUSTNESS_WEIGHTS.estabilidade),
      reason: `Variação relativa de ${(drift * 100).toFixed(0)}% entre treino e OOS.`,
      unavailable: false,
    });
    if (drift > 0.6) {
      limitations.push(
        "Treino e OOS divergem muito: a estratégia provavelmente está sobreajustada.",
      );
    }
  }

  // ── 5. RISCO / DRAWDOWN: quanto do ganho é devolvido no pior trecho.
  if (metricsAll.trades < MIN_BACKTEST_SAMPLE) {
    components.push({
      id: "risco",
      label: "Risco e drawdown",
      maxPoints: ROBUSTNESS_WEIGHTS.risco,
      points: 0,
      reason: "Amostra insuficiente para medir drawdown com significado.",
      unavailable: true,
    });
  } else {
    const recovery = metricsAll.recoveryFactor;
    const points =
      recovery === null ? 0 : clampPoints(Math.min(1, recovery / 3), ROBUSTNESS_WEIGHTS.risco);
    components.push({
      id: "risco",
      label: "Risco e drawdown",
      maxPoints: ROBUSTNESS_WEIGHTS.risco,
      points,
      reason:
        recovery === null
          ? `Drawdown máximo de ${metricsAll.maxDrawdownR.toFixed(2)}R sem ganho líquido a recuperar.`
          : `Fator de recuperação ${recovery.toFixed(2)} (resultado ${metricsAll.totalR.toFixed(2)}R contra drawdown de ${metricsAll.maxDrawdownR.toFixed(2)}R).`,
      unavailable: recovery === null,
    });
  }

  // ── 6. WALK-FORWARD: o desempenho se manteve ao longo do tempo?
  components.push({
    id: "walkForward",
    label: "Walk-forward",
    maxPoints: ROBUSTNESS_WEIGHTS.walkForward,
    points: walk.available
      ? clampPoints(
          walk.consistency * (walk.hasCatastrophicFold ? 0.5 : 1),
          ROBUSTNESS_WEIGHTS.walkForward,
        )
      : 0,
    reason: walk.available
      ? `${walk.positiveFolds}/${walk.folds.length} janelas positivas${walk.hasCatastrophicFold ? "; houve janela catastrófica" : ""}.`
      : (walk.unavailableReason ?? "Walk-forward indisponível."),
    unavailable: !walk.available,
  });
  if (walk.available && walk.hasCatastrophicFold) {
    limitations.push(
      "Ao menos uma janela do walk-forward foi catastrófica (expectativa abaixo de −0,5R).",
    );
  }

  // ── 7. BOOTSTRAP: o intervalo de confiança exclui o zero?
  components.push({
    id: "bootstrap",
    label: "Bootstrap IC 95%",
    maxPoints: ROBUSTNESS_WEIGHTS.bootstrap,
    // Só pontua com o IC INTEIRO acima de zero. Um IC inteiramente negativo
    // também "exclui o zero" — e é evidência de que a técnica PERDE.
    points: boot.available && boot.significantlyPositive ? ROBUSTNESS_WEIGHTS.bootstrap : 0,
    reason: boot.available
      ? `IC 95% da expectativa: [${boot.ci95Low.toFixed(3)}R, ${boot.ci95High.toFixed(3)}R]${
          boot.significantlyPositive
            ? " — inteiramente acima de zero."
            : boot.significant
              ? " — inteiramente ABAIXO de zero: evidência de desvantagem consistente."
              : " — inclui o zero, a vantagem não é distinguível de acaso."
        }`
      : (boot.unavailableReason ?? "Bootstrap indisponível."),
    unavailable: !boot.available,
  });
  if (boot.available && !boot.significantlyPositive) {
    limitations.push(
      boot.significant
        ? "O intervalo de confiança de 95% está inteiramente abaixo de zero: os dados indicam desvantagem, não vantagem."
        : "O intervalo de confiança de 95% da expectativa inclui zero: não é possível afirmar que existe vantagem.",
    );
  }

  // ── 8. SENSIBILIDADE: a vantagem depende de uma faixa ou de um regime só?
  const bands = segmentByConfluence(all).segments.filter((segment) => segment.reliable);
  const regimes = segmentByRegime(all).segments.filter((segment) => segment.reliable);
  const diversified = bands.length + regimes.length;
  const positiveBands = bands.filter((segment) => segment.metrics.expectancy > 0).length;
  if (diversified === 0) {
    components.push({
      id: "sensibilidade",
      label: "Sensibilidade a faixas e regimes",
      maxPoints: ROBUSTNESS_WEIGHTS.sensibilidade,
      points: 0,
      reason:
        "Nenhuma faixa de confluência ou regime reúne amostra suficiente para o teste de sensibilidade.",
      unavailable: true,
    });
    limitations.push(
      "Não foi possível verificar se a vantagem sobrevive fora de uma faixa/regime específico.",
    );
  } else {
    const share = bands.length > 0 ? positiveBands / bands.length : 0;
    components.push({
      id: "sensibilidade",
      label: "Sensibilidade a faixas e regimes",
      maxPoints: ROBUSTNESS_WEIGHTS.sensibilidade,
      points: clampPoints(share, ROBUSTNESS_WEIGHTS.sensibilidade),
      reason: `${positiveBands}/${bands.length} faixa(s) de confluência com expectativa positiva; ${regimes.length} regime(s) com amostra suficiente.`,
      unavailable: false,
    });
  }

  const score =
    Math.round(components.reduce((sum, component) => sum + component.points, 0) * 10) / 10;

  const status = resolveStatus({
    metricsAll,
    metricsOos,
    metricsForward,
    boot,
    walk,
  });

  return {
    score,
    components,
    status,
    statusLabel: STATUS_LABEL[status],
    headline: headlineFor(status, score),
    limitations,
    metrics: {
      all: metricsAll,
      train: metricsTrain,
      outOfSample: metricsOos,
      forward: metricsForward,
    },
    walkForward: walk,
    bootstrap: boot,
  };
}

/**
 * CICLO DE VIDA DA VALIDAÇÃO (requisito 20).
 *
 * NÃO TESTADA → BACKTEST → OOS → FORWARD → VALIDAÇÃO ESTATÍSTICA
 * POSITIVA/NEGATIVA. Nunca "garantido" e nunca "100% lucrativo". Dado
 * insuficiente devolve AGUARDANDO DADOS SUFICIENTES.
 */
function resolveStatus(input: {
  metricsAll: T4Metrics;
  metricsOos: T4Metrics;
  metricsForward: T4Metrics;
  boot: BootstrapResult;
  walk: WalkForwardResult;
}): ValidationStatus {
  const { metricsAll, metricsOos, metricsForward, boot, walk } = input;

  if (metricsAll.trades === 0) return "NAO_TESTADA";
  if (metricsAll.trades < MIN_BACKTEST_SAMPLE) return "AGUARDANDO_DADOS_SUFICIENTES";
  if (metricsOos.trades < MIN_OOS_SAMPLE) return "BACKTEST";

  // Com OOS medido, um resultado claramente negativo já fecha o veredito.
  if (metricsOos.expectancy <= 0 && boot.available && !boot.significantlyPositive) {
    return "VALIDACAO_ESTATISTICA_NEGATIVA";
  }
  if (metricsForward.trades < MIN_FORWARD_SAMPLE) return "OOS";

  const positive =
    metricsForward.expectancy > 0 &&
    metricsOos.expectancy > 0 &&
    boot.available &&
    boot.significantlyPositive &&
    walk.available &&
    walk.stable;
  if (positive) return "VALIDACAO_ESTATISTICA_POSITIVA";

  const negative =
    metricsForward.expectancy <= 0 ||
    (boot.available && !boot.significantlyPositive && walk.available);
  return negative ? "VALIDACAO_ESTATISTICA_NEGATIVA" : "FORWARD";
}

function headlineFor(status: ValidationStatus, score: number): string {
  const suffix = `Robustez ${score.toFixed(1)}/100 mede a QUALIDADE DA VALIDAÇÃO; não é chance de lucro.`;
  switch (status) {
    case "NAO_TESTADA":
      return `A técnica ainda não foi testada. ${suffix}`;
    case "AGUARDANDO_DADOS_SUFICIENTES":
      return `Amostra insuficiente para concluir qualquer coisa. ${suffix}`;
    case "BACKTEST":
      return `Medida apenas em backtest, sem teste cego. ${suffix}`;
    case "OOS":
      return `Testada fora da amostra; falta forward com snapshot anterior ao resultado. ${suffix}`;
    case "FORWARD":
      return `Em forward, sem veredito estatístico fechado. ${suffix}`;
    case "VALIDACAO_ESTATISTICA_POSITIVA":
      return `Validação estatística POSITIVA nos dados medidos — não é garantia de resultado futuro. ${suffix}`;
    case "VALIDACAO_ESTATISTICA_NEGATIVA":
      return `Validação estatística NEGATIVA: os dados não sustentam vantagem reproduzível. ${suffix}`;
  }
}
