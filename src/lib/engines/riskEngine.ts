import { distanceToNearestLiquidity } from "./liquidityEngine";
import type { Features } from "./marketFeatures";
import {
  DEFAULT_RISK_PARAMS,
  PARTIAL_EXIT_FRACTION,
  roundToTick,
  type RiskParams,
} from "./strategy";
import type {
  DataQuality,
  Direction,
  PriceActionRead,
  LiquidityMap,
  POI,
  RiskRead,
  SMSRead,
  TradePlan,
  WyckoffRead,
} from "./types";

/**
 * RiskEngine — risco de reversão, qualidade de stop, espaço até alvo e plano.
 * Uma entrada nunca é aprovada só porque existe tendência.
 *
 * Stop e alvo agora usam POI/liquidez como referência quando disponíveis
 * (mais informativo que só ATR); sem POI/liquidez relevante, cai exatamente
 * no comportamento anterior (só ATR) — nenhuma funcionalidade existente foi
 * removida.
 */
export function assessRisk(
  f: Features,
  pa: PriceActionRead,
  wy: WyckoffRead,
  direction: Direction,
  liquidity: LiquidityMap,
  mainPoi: POI | null,
  dataQuality: DataQuality,
): RiskRead {
  const dir = direction === "VENDA" ? -1 : 1;

  const factors = [
    { label: "Exaustão", value: pa.exhaustion },
    { label: "Divergência", value: Math.abs(f.divergence) * 100 },
    {
      label: "Absorção contrária",
      value:
        f.positionInRange > 0.7 && dir > 0
          ? pa.stall
          : f.positionInRange < 0.3 && dir < 0
            ? pa.stall
            : pa.stall * 0.3,
    },
    {
      label: "Falha de continuidade",
      value: Math.max(0, (1 - Math.abs(f.momentum)) * 60 - (1 - f.locationInTrend) * 20),
    },
    { label: "Rejeição (pavio contra)", value: (dir > 0 ? f.upperWick : f.lowerWick) * 100 },
    { label: "Perda de momentum", value: Math.max(0, -f.acceleration * dir) * 80 },
    { label: "Preço esticado", value: f.locationInTrend * 70 },
    {
      label: "Contexto Wyckoff contrário",
      value:
        (wy.schema === "Distribuição" && dir > 0) || (wy.schema === "Acumulação" && dir < 0)
          ? wy.confidence * 80
          : 0,
    },
  ];

  const reversalRisk = Math.max(
    0,
    Math.min(100, factors.reduce((a, x) => a + x.value, 0) / factors.length),
  );

  // Stop técnico: usa o extremo de invalidação do POI principal quando alinhado
  // e ainda válido; caso contrário, mesma heurística de swing ± ATR de sempre.
  const poiAligned =
    mainPoi && mainPoi.direction === direction && mainPoi.condition !== "invalidado";
  const swingRef = dir > 0 ? f.swingLow - f.atr * 0.2 : f.swingHigh + f.atr * 0.2;
  const ref = poiAligned ? mainPoi!.invalidation : swingRef;
  const rawDistance = Math.abs(f.price - ref);
  const stopDistance = Math.min(
    Math.max(rawDistance, f.atr * 0.8),
    f.atr * (poiAligned ? 2.4 : 1.8),
  );
  const stopInAtr = stopDistance / f.atr;
  const stopQuality = Math.max(0, Math.min(100, 100 - Math.abs(stopInAtr - 1.4) * 38));

  // Espaço até o alvo: liquidez oposta relevante como obstáculo/alvo; sem
  // liquidez utilizável, cai na heurística estrutural anterior.
  // Em compra o alvo está na liquidez compradora acima; em venda, na
  // liquidez vendedora abaixo. A versão anterior usava os lados invertidos.
  const oppositeLiquidity = dir > 0 ? liquidity.nearestBuy : liquidity.nearestSell;
  const liquidityObstacle =
    oppositeLiquidity && Math.sign(oppositeLiquidity.price - f.price) === Math.sign(dir)
      ? oppositeLiquidity.price
      : null;
  const structuralObstacle =
    dir > 0
      ? Math.max(f.rangeHigh, f.price + f.atr * 2)
      : Math.min(f.rangeLow, f.price - f.atr * 2);
  const obstacle = liquidityObstacle ?? structuralObstacle;

  // ESPAÇO REAL ATÉ O ALVO — sem piso artificial.
  //
  // v4.0.0: removido o `Math.max(..., f.atr * 3)` que existia aqui. Aquele piso
  // fazia um alvo colado no preço parecer ter 3 ATR de espaço, inflando
  // `targetRoom` e `riskReward` justamente nos casos em que a liquidez oposta
  // está próxima demais e a operação deveria ser BLOQUEADA. Agora o espaço é o
  // que o gráfico mostra; quando ele não comporta o risco, os gates de R:R
  // reprovam o plano e o motivo aparece nos blockers.
  const room = Math.abs(obstacle - f.price);
  const targetRoom = Math.max(0, Math.min(100, (room / f.atr) * 22));

  const riskReward = stopDistance > 0 ? room / stopDistance : 0;

  const qualityFactors = buildQualityFactors(f, wy, liquidity, mainPoi, dataQuality, stopInAtr);

  return {
    reversalRisk,
    stopQuality,
    targetRoom,
    riskReward,
    factors,
    qualityFactors,
  };
}

/**
 * Penalidades de QUALIDADE DE ENTRADA — distintas do risco de reversão.
 * "Sinal contra fase Wyckoff" já é coberto por `factors` (Contexto Wyckoff
 * contrário); "risco/retorno ruim" já é coberto pelo MIN_RISK_REWARD em
 * analysisPipeline. O motor puro não usa latência de interface como evidência de
 * mercado.
 */
function buildQualityFactors(
  f: Features,
  wy: WyckoffRead,
  liquidity: LiquidityMap,
  mainPoi: POI | null,
  dataQuality: DataQuality,
  stopInAtr: number,
): RiskRead["qualityFactors"] {
  const out: RiskRead["qualityFactors"] = [];

  out.push({
    label: "Entrada atrasada",
    value: Math.round(Math.max(0, f.locationInTrend - 0.6) * 250),
    note: "Preço já esticado das médias — miolo do movimento pode já ter passado",
  });

  if (mainPoi) {
    const mid = (mainPoi.upper + mainPoi.lower) / 2;
    const distAtr = Math.abs(f.price - mid) / Math.max(f.atr, 1e-9);
    out.push({
      label: "Distância do POI",
      value: Math.round(Math.min(100, Math.max(0, (distAtr - 1) * 40))),
    });
  } else {
    out.push({ label: "Distância do POI", value: 0, note: "Sem POI de referência no momento" });
  }

  out.push({
    label: "Stop excessivo",
    value: Math.round(Math.max(0, stopInAtr - 1.8) * 60),
  });

  const liqDistAtr = distanceToNearestLiquidity(liquidity, f.price, f.atr);
  out.push({
    label: "Baixa liquidez",
    value:
      liquidity.levels.length === 0
        ? 70
        : Math.round(Math.min(60, Math.max(0, (liqDistAtr - 3) * 15))),
  });

  out.push({
    label: "Conflito entre tempos gráficos",
    value: 0,
    note: "Indisponível — este sistema captura apenas um timeframe",
  });

  out.push({
    label: "Dados incompletos",
    value: Math.round(100 - dataQuality.quality),
    note: dataQuality.issues.join("; ") || undefined,
  });

  out.push({
    label: "Range sem direção",
    value: Math.abs(f.trend) < 0.28 && wy.schema === "Indefinido" ? 55 : 0,
  });

  out.push({
    label: "Rompimento sem fechamento",
    value: (f.brokeHigh || f.brokeLow) && f.bodyRatio < 0.35 ? 45 : 0,
  });

  out.push({
    label: "POI já mitigado",
    value: mainPoi?.condition === "mitigado" ? 35 : mainPoi?.condition === "invalidado" ? 60 : 0,
  });

  return out;
}

/**
 * TESTE OU ENTRADA DIRETA + "pegar o miolo do movimento".
 * Não busca fundo/topo exato nem persegue candle atrasado. Prioriza reteste
 * do POI principal quando o SMS já está confirmado; evita perseguir preço
 * muito esticado.
 */
export function buildPlan(
  f: Features,
  pa: PriceActionRead,
  risk: RiskRead,
  direction: Direction,
  mainPoi: POI | null,
  sms: SMSRead,
  targetLiquidityPrice: number | null,
  params: RiskParams = DEFAULT_RISK_PARAMS,
): TradePlan | null {
  if (direction === "NEUTRO") return null;
  const dir = direction === "COMPRA" ? 1 : -1;

  const breakoutStrength = pa.conviction * 0.4 + pa.thrust * 0.3 + f.displacement * 30;
  const retestChance = 100 - Math.min(100, breakoutStrength) + pa.stall * 0.25;
  let directEntry = breakoutStrength > 62 && retestChance < 55;

  // Evita perseguir o preço depois de deslocamento muito estendido.
  if (f.locationInTrend > 0.8) directEntry = false;

  // stopMethod "somente_atr" (spec §7) ignora o POI como referência do stop
  // mesmo quando haveria um alinhado — só afeta a REFERÊNCIA do stop, nunca a
  // lógica de entrada por reteste (que continua usando o POI normalmente).
  const poiAligned =
    params.stopMethod === "combinado" &&
    mainPoi &&
    mainPoi.direction === direction &&
    mainPoi.condition !== "invalidado";
  const smsConfirmedHere = sms.confirmed && sms.direction === direction;

  let entry: number;
  let entryPoiId: string | null = null;
  if (
    smsConfirmedHere &&
    mainPoi &&
    mainPoi.direction === direction &&
    mainPoi.condition !== "invalidado"
  ) {
    // Reteste do POI após SMS confirmado — prioridade explícita da metodologia.
    const edge = dir > 0 ? mainPoi.upper : mainPoi.lower;
    const alreadyInside = dir > 0 ? f.price <= mainPoi.upper : f.price >= mainPoi.lower;
    entry = alreadyInside ? f.price : edge;
    entryPoiId = mainPoi.id;
    directEntry = false;
  } else {
    const level = f.retestingLevel ?? (dir > 0 ? f.swingHigh : f.swingLow);
    entry = directEntry ? f.price : level + dir * f.atr * 0.12;
  }

  const swingRef = dir > 0 ? f.swingLow - f.atr * 0.2 : f.swingHigh + f.atr * 0.2;
  const ref = poiAligned ? mainPoi!.invalidation : swingRef;
  const stopDistance = Math.min(
    Math.max(Math.abs(entry - ref), f.atr * 0.8),
    f.atr * (poiAligned ? 2.4 : 1.8),
  );

  // Distância mínima/máxima do stop (spec §7) — fora dos limites configurados,
  // nenhum plano é liberado (nunca "força" um stop fora do que foi configurado).
  if (stopDistance < params.minStopDistance || stopDistance > params.maxStopDistance) return null;

  const stop = entry - dir * stopDistance;
  const target1 = entry + dir * stopDistance * params.partialTargetMultiple;
  let target2 = entry + dir * stopDistance * params.finalTargetMultiple;

  // Liquidez usada como alvo: se houver liquidez oposta relevante mais perto que a
  // projeção padrão, o alvo final respeita essa liquidez em vez de ultrapassá-la.
  //
  // A referência é `target1`, NÃO `entry`: liquidez situada entre a entrada e a
  // parcial não pode puxar a saída final para aquém da parcial. Nesse caso, o
  // alvo final mantém a projeção padrão e `risk.targetRoom` registra o espaço.
  if (targetLiquidityPrice !== null) {
    const beyondPartial = dir > 0 ? targetLiquidityPrice > target1 : targetLiquidityPrice < target1;
    if (beyondPartial)
      target2 =
        dir > 0 ? Math.min(target2, targetLiquidityPrice) : Math.max(target2, targetLiquidityPrice);
  }

  // Arredondamento para o tick mínimo do ativo (spec §7) — sempre por último,
  // depois de toda a matemática do plano já ter sido feita com preços exatos.
  const tick = params.tickSize;
  const roundedEntry = roundToTick(entry, tick);
  const roundedStop = roundToTick(stop, tick);
  const roundedTarget1 = roundToTick(target1, tick);
  const roundedTarget2 = roundToTick(target2, tick);

  // Distância real do stop DEPOIS do arredondamento: é ela que o operador vive.
  const roundedStopDistance = Math.abs(roundedEntry - roundedStop);
  if (roundedStopDistance <= 0) return null;

  // Os três R:R, calculados separadamente (ver a contradição corrigida em
  // strategy.ts). O do plano pondera parcial e alvo final pela fração realizada.
  const rrPartial = Math.abs(roundedTarget1 - roundedEntry) / roundedStopDistance;
  const rrFinal = Math.abs(roundedTarget2 - roundedEntry) / roundedStopDistance;
  const rrPlan = rrPartial * PARTIAL_EXIT_FRACTION + rrFinal * (1 - PARTIAL_EXIT_FRACTION);

  return {
    direction,
    entry: roundedEntry,
    stop: roundedStop,
    target1: roundedTarget1,
    target2: roundedTarget2,
    riskReward: rrPartial,
    riskRewardFinal: rrFinal,
    riskRewardPlan: rrPlan,
    stopDistance: roundedStopDistance,
    mode: directEntry ? "ENTRADA DIRETA PROVÁVEL" : "AGUARDANDO RETESTE",
    entryPoiId,
    targetLiquidityPrice,
  };
}
