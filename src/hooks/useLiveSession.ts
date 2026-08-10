import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";

import {
  capturePriceScaleImage,
  captureTimeAxisImage,
  extractVisibleCandles,
  type FrameRead,
} from "@/lib/capture/frameProcessor";
import { askMarketAssistant, getAssistantProviders } from "@/lib/analyst.functions";
import { calibratePriceScale } from "@/lib/calibration.functions";
import { readChartClock } from "@/lib/chartClock.functions";
import { screenCaptureManager } from "@/lib/capture/screenCaptureManager";
import { screenRecordingManager } from "@/lib/recording/screenRecordingManager";
import { reportError } from "@/lib/errors/errorReporter";
import { PipelineErrorGate } from "@/lib/errors/pipelineErrors";
import { MarketClock } from "@/lib/vision/marketClock";
import type { LivePriceInfo } from "@/lib/t4/managementView";
import {
  EMPTY_DIAGNOSTICS,
  candleParseError,
  type PipelineDiagnostics,
} from "@/lib/t4/diagnostics";
import { createSignalSnapshot, type TradeSignalSnapshot } from "@/lib/t4/signalSnapshot";
import { playConfirmationOnce } from "@/lib/t4/signalSound";
import { analyze } from "@/lib/engines/analysisPipeline";
import { READING_GATES, STRATEGY_VERSION } from "@/lib/engines/strategy";
import type { AnalysisResult, Candle, ChatEntry, ReadingState } from "@/lib/engines/types";
import { store } from "@/lib/storage";
import { resolveInstrument } from "@/lib/engines/instruments";
import { EventStore } from "@/lib/engines/eventStore";
import {
  decide,
  EntryStateMachine,
  type DecisionObject,
} from "@/lib/engines/backtestDecisionEngine";
import { LiveOutcomeTracker, type LiveOperationResult } from "@/lib/engines/liveOutcome";
import { filterEvidenceTrades } from "@/lib/engines/evidenceFilter";
import { detectTechniqueSnapshot } from "@/lib/knowledge/techniqueDetector";
import { createBacktestTrade, type BacktestTrade } from "@/lib/engines/backtestEngine";
import {
  CandleReconstructor,
  MINUTE_MS,
  minuteStart,
  type ReconstructedCandle,
} from "@/lib/vision/candleReconstruction";
import {
  assetScaleIssue,
  calibrateFromAnchors,
  emptyCalibration,
  geometricCalibration,
  normalizeScaleAnchorsForAsset,
  priceAt,
  pricePlausibility,
  visibleRange,
  type ScaleAnchor,
} from "@/lib/vision/priceScale";
import {
  CalibrationScheduler,
  calibrationSummary,
  type CalibrationSchedulerState,
} from "@/lib/vision/calibrationScheduler";

import { useContinuousChartCapture } from "./useContinuousChartCapture";

function createPersistentEventStore(asset: string): EventStore {
  return new EventStore(asset, 1, 400, (event) => {
    store.saveMarketEvent({ ...event, id: event.eventId });
  });
}

/**
 * Relógio do mercado AO VIVO — singleton de módulo (comando §4).
 * Quando o OCR do eixo de tempo confirma o chartClock, marketTime=chartClock:
 * os candles do Profit são bucketizados pelo horário do GRÁFICO, nunca por
 * Date.now(). Fallback realtime só sem chartClock, com motivo registrado.
 */
const liveMarketClock = new MarketClock();
const CLOCK_EVERY_FRAMES = 4;

function localTradingDate(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * LEITURA ESTRUTURAL ≠ CALIBRAÇÃO DE PREÇO.
 *
 * `issues`/`sufficient` medem apenas o que a geometria do frame permite ler.
 * A escala aparece como `priceScaleReady` — estado paralelo que libera preço
 * exato e NUNCA impede a análise de estrutura, eventos e memória temporal.
 */
function readingState(
  timeframeConfirmed: boolean,
  calibrationConfidence: number,
  calibrationUsable: boolean,
  candleQuality: number,
  closedCandles: number,
): ReadingState {
  const issues: string[] = [];
  if (!timeframeConfirmed) issues.push("Gráfico de 1 minuto não confirmado.");
  if (candleQuality < READING_GATES.minCandleReadQuality) {
    issues.push(`Qualidade visual abaixo de ${READING_GATES.minCandleReadQuality}%.`);
  }
  if (closedCandles < READING_GATES.minClosedCandles) {
    issues.push(`Aguardando candles fechados: ${closedCandles}/${READING_GATES.minClosedCandles}.`);
  }
  return {
    sufficient: issues.length === 0,
    timeframeConfirmed,
    priceScaleReady: calibrationUsable,
    calibrationConfidence,
    candleQuality,
    closedCandles,
    lastCandleClosed: closedCandles > 0,
    issues,
    label: issues.length === 0 ? "LEITURA SUFICIENTE" : "LEITURA INSUFICIENTE",
  };
}

/** Sessão única baseada exclusivamente na janela visual selecionada. */
export function useLiveSession(asset: string, timeframeConfirmed: boolean) {
  const askMarket = useServerFn(askMarketAssistant);
  const loadProviders = useServerFn(getAssistantProviders);
  const calibrateScale = useServerFn(calibratePriceScale);
  const readClock = useServerFn(readChartClock);
  const reconstructorRef = useRef(new CandleReconstructor(asset));
  // Memória temporal (spec V5 §21–§23): eventos estruturais vivem no código,
  // nunca na memória interna da IA. Balde de dedupe recalculado pelo ATR.
  const eventStoreRef = useRef(createPersistentEventStore(asset));
  // §55: máquina de estados da entrada — depois de CONFIRMED, só regra objetiva muda.
  const entryMachineRef = useRef(new EntryStateMachine());
  // Ciclo completo: decisão confirmada → desfecho REAL observado → banco.
  const outcomeTrackerRef = useRef<LiveOutcomeTracker | null>(null);
  const confirmedAnalysisRef = useRef<AnalysisResult | null>(null);
  const sessionTradesRef = useRef<BacktestTrade[]>([]);
  const liveRecordIdRef = useRef<string>(`live_${Date.now()}`);
  // §17: versão da técnica congelada no início da sessão — o Laboratório pode
  // validar candidatas em paralelo sem afetar a sessão em andamento.
  const techniqueSnapshotRef = useRef<string>(STRATEGY_VERSION);
  const lastOperationStatusRef = useRef<string | null>(null);
  const frameSizeRef = useRef<{ width: number; height: number } | null>(null);
  const lastFrameReadRef = useRef<FrameRead | null>(null);
  const analysisRef = useRef<AnalysisResult | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const segmentIdRef = useRef<string | null>(null);
  const aiRequestSequenceRef = useRef(0);

  const clockBusyRef = useRef(false);
  const framesSinceClockRef = useRef(0);
  const clockSourceRef = useRef<"CHART_CLOCK" | "REALTIME_FALLBACK" | null>(null);
  const timeAxisOkRef = useRef(false);
  const snapshotRef = useRef<TradeSignalSnapshot | null>(null);
  const lastCandleColumnsRef = useRef(0);
  // §2: dedupe por sessão+código com evento de recuperação. Timeouts da IA no
  // OCR do relógio viram AI_TIMEOUT (OLLAMA), nunca CHART_CLOCK duplicado.
  const clockErrorGateRef = useRef(new PipelineErrorGate());
  const priceErrorGateRef = useRef(new PipelineErrorGate());
  // §1: preço do Profit é soberano — confiança corrente da conversão pixel→preço.
  const priceTrustRef = useRef<{ trusted: boolean; reason: string | null }>({
    trusted: false,
    reason: "Escala ainda não calibrada.",
  });
  const lastTrustedPriceRef = useRef<number | null>(null);
  const lastComputedPriceRef = useRef<number | null>(null);
  const divergenceStreakRef = useRef(0);

  const [sessionActive, setSessionActive] = useState(false);
  const [signalSnapshot, setSignalSnapshot] = useState<TradeSignalSnapshot | null>(null);
  const [priceInfo, setPriceInfoState] = useState<LivePriceInfo>({
    price: null,
    trusted: false,
    reason: "Escala ainda não calibrada.",
    at: null,
  });
  const [diagnostics, setDiagnostics] = useState<PipelineDiagnostics>(EMPTY_DIAGNOSTICS);
  const [anchors, setAnchors] = useState<ScaleAnchor[]>([]);
  const [frameSize, setFrameSize] = useState<{ width: number; height: number } | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [formingCandle, setFormingCandle] = useState<ReconstructedCandle | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [decision, setDecision] = useState<DecisionObject | null>(null);
  const [entryState, setEntryState] = useState<string>("SCANNING");
  const [operation, setOperation] = useState<LiveOperationResult | null>(null);
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const [lastAnalysisAt, setLastAnalysisAt] = useState<number | null>(null);
  const [lastRejectedRead, setLastRejectedRead] = useState<string | null>(null);
  const [autoCalibrating, setAutoCalibrating] = useState(false);
  const [autoCalibrationError, setAutoCalibrationError] = useState<string | null>(null);
  const [autoStartRequested, setAutoStartRequested] = useState(false);
  const schedulerRef = useRef(new CalibrationScheduler());
  const calibrationBusyRef = useRef(false);
  const calibrationLogRef = useRef<string | null>(null);
  const [calibrationState, setCalibrationState] = useState<CalibrationSchedulerState>(() =>
    schedulerRef.current.state(),
  );
  const [aiProvider, setAIProvider] = useState({
    configured: false,
    model: "",
    provider: "",
  });
  const [storageReady, setStorageReady] = useState(store.isHydrated());
  const [storageError, setStorageError] = useState<string | null>(null);

  const calibration = useMemo(
    () => (anchors.length ? calibrateFromAnchors(anchors) : emptyCalibration()),
    [anchors],
  );

  const appendLog = useCallback((text: string, tone: ChatEntry["tone"] = "info") => {
    setChat((previous) => [...previous, { t: Date.now(), text, tone }].slice(-120));
  }, []);

  useEffect(() => {
    let active = true;
    void store
      .hydrate()
      .then(() => {
        if (active) {
          setStorageReady(true);
          setStorageError(null);
        }
      })
      .catch((error) => {
        if (active) {
          setStorageReady(false);
          setStorageError(error instanceof Error ? error.message : String(error));
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void loadProviders({})
      .then((provider) => {
        if (active) setAIProvider(provider);
      })
      .catch(() => {
        if (active) setAIProvider({ configured: false, model: "", provider: "" });
      });
    return () => {
      active = false;
    };
  }, [loadProviders]);

  const buildReading = useCallback(() => {
    const reconstructor = reconstructorRef.current;
    return readingState(
      timeframeConfirmed,
      calibration.confidence,
      calibration.usable,
      reconstructor.averageQuality(),
      reconstructor.closedCandles().length,
    );
  }, [calibration.confidence, calibration.usable, timeframeConfirmed]);

  const decisionRef = useRef<DecisionObject | null>(null);
  const sessionActiveRef = useRef(false);
  sessionActiveRef.current = sessionActive;
  const calibrationRefUsable = useRef(false);
  calibrationRefUsable.current = calibration.usable;
  const calibrationRefFull = useRef(calibration);
  calibrationRefFull.current = calibration;

  /** Publica o preço vivo (ref imperativa para o motor + estado para a UI). */
  const publishPriceInfo = useCallback((next: LivePriceInfo) => {
    priceTrustRef.current = { trusted: next.trusted, reason: next.reason };
    setPriceInfoState(next);
  }, []);
  const aiProviderRef = useRef(aiProvider);
  aiProviderRef.current = aiProvider;
  const ollamaStatusRef = useRef("DESCONHECIDO");

  // OLLAMA_STATUS do diagnóstico vem do health REAL do backend, nunca de
  // estado otimista da UI (comando §10).
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/health/ai", { headers: { accept: "application/json" } });
        const payload = (await response.json()) as {
          status?: string;
          latencyMs?: number | null;
          message?: string;
        };
        if (!active) return;
        ollamaStatusRef.current =
          payload.status === "ok"
            ? `ONLINE${payload.latencyMs != null ? ` · ${payload.latencyMs}ms` : ""}`
            : `${(payload.status ?? "falha").toUpperCase()}${payload.message ? ` · ${payload.message}` : ""}`;
      } catch {
        if (active) ollamaStatusRef.current = "BACKEND INDISPONÍVEL";
      }
    };
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  /** Diagnóstico REAL do pipeline FRAME→PROFIT→CHART_CLOCK→CANDLES→CONTEXTO→T4. */
  const refreshDiagnostics = useCallback(() => {
    const captureState = screenCaptureManager.getState();
    const read = lastFrameReadRef.current;
    const clock = liveMarketClock.snapshot();
    const clockValid = liveMarketClock.valid();
    const closed = reconstructorRef.current.closedCandles();
    const analysisNow = analysisRef.current;
    const captureActive = captureState.status === "capturando";
    const profitDetected = captureActive && read !== null && read.bullMass + read.bearMass > 0.0004;
    const graphDetected = profitDetected && (read?.candleColumns ?? 0) > 0;
    const partial = {
      GRAPH_DETECTED: graphDetected,
      CANDLES_VISIBLE: read?.candleColumns ?? 0,
      CANDLES_PARSED: closed.length,
    };
    const next: PipelineDiagnostics = {
      CAPTURE_ACTIVE: captureActive,
      PROFIT_DETECTED: profitDetected,
      GRAPH_DETECTED: graphDetected,
      PRICE_AXIS: calibrationRefUsable.current,
      TIME_AXIS: timeAxisOkRef.current,
      CHART_CLOCK: clockValid ? "VALID" : captureActive ? "FALLBACK_REALTIME" : "UNAVAILABLE",
      chartClockSource: clock.source,
      chartClockReason: clock.fallbackReason,
      CANDLES_VISIBLE: read?.candleColumns ?? 0,
      CANDLES_PARSED: closed.length,
      CANDLES_SENT_TO_T4: analysisNow ? Math.min(closed.length, 160) : 0,
      LAST_FRAME: read?.t ?? null,
      LAST_CANDLE: closed.length ? closed[closed.length - 1]!.t : null,
      LATENCY: read ? Math.max(0, Date.now() - read.t) : null,
      T4_STATE: snapshotRef.current
        ? "CONFIRMADO"
        : analysisNow
          ? analysisNow.t4.setup === "NONE"
            ? "AGUARDANDO SETUP"
            : `${analysisNow.t4.setup} · ${analysisNow.t4.quality}`
          : sessionActiveRef.current
            ? "LENDO CONTEXTO"
            : "IDLE",
      BLOCK_REASON: analysisNow?.blockers[0] ?? null,
      OLLAMA_STATUS: ollamaStatusRef.current,
      parseError: sessionActiveRef.current ? candleParseError(partial) : null,
      // §6: preço visual bruto → processado → confiável, com faixa/incremento/R²
      // da calibração vigente. Nunca liberar níveis com calibração inválida.
      PRICE_RAW_Y: read?.priceY ?? null,
      PRICE_PROCESSED: lastComputedPriceRef.current,
      PRICE_TRUSTED: priceTrustRef.current.trusted,
      PRICE_SOURCE: calibrationRefFull.current.usable
        ? "CALIBRADA"
        : read !== null && captureActive
          ? "GEOMETRICA"
          : "AUSENTE",
      PRICE_RANGE:
        calibrationRefFull.current.usable && frameSizeRef.current
          ? visibleRange(calibrationRefFull.current, frameSizeRef.current.height)
          : null,
      PRICE_INCREMENT: calibrationRefFull.current.tickSize,
      PRICE_R2: calibrationRefFull.current.usable ? calibrationRefFull.current.r2 : null,
    };
    setDiagnostics(next);
  }, []);

  const requestAIValidation = useCallback(
    async (result: AnalysisResult, liveDecision: DecisionObject) => {
      if (!aiProvider.configured) return;
      const sequence = ++aiRequestSequenceRef.current;
      appendLog(`Qwen (${aiProvider.model}) revisando a leitura fechada…`, "info");
      const context = JSON.stringify({
        ativo: asset,
        timeframe: "1 minuto",
        estrategia: result.strategyVersion,
        preco: result.price,
        direcao: result.direction,
        evidenciaHistorica: {
          amostra: liveDecision.sampleSize,
          casosSemelhantes: liveDecision.similarCases,
          winRate: liveDecision.winRate,
          profitFactor: liveDecision.profitFactor,
          expectanciaR: liveDecision.expectancyR,
          drawdownMaxR: liveDecision.maxDrawdown,
          oos: liveDecision.outOfSampleValidated,
          walkForward: liveDecision.walkForwardStable,
          confiancaDaEvidencia: liveDecision.evidenceConfidence,
        },
        decisao: liveDecision.decision,
        prontoTecnicamente: result.technicalReady,
        estadoMercado: result.marketState,
        regime: { classificacao: result.regime.regime, evidencias: result.regime.evidences },
        sequenciaCausal: {
          completa: result.sequence.complete,
          rotulo: result.sequence.label,
          etapas: result.sequence.stages.map((stage) => ({
            etapa: stage.stage,
            cumprida: stage.met,
            nota: stage.note,
          })),
        },
        contradicoes: result.contradictions.map((item) => ({
          id: item.id,
          severidade: item.severity,
          descricao: item.description,
          evidencia: item.evidence,
        })),
        memoriaTemporal: eventStoreRef.current.recent(8).map((event) => ({
          tipo: event.type,
          preco: event.price,
          grupo: event.evidenceGroupId,
          evidencia: event.evidence,
        })),
        leitura: result.reading,
        wyckoff: result.wyckoff,
        poiPrincipal: result.mainPoi,
        plano: result.plan,
        bloqueios: result.blockers,
        evidencias: result.evidences.map((evidence) => ({
          grupo: evidence.group,
          rotulo: evidence.label,
          estado: evidence.state,
          valorMedido: evidence.measuredValue,
          justificativa: evidence.justification,
        })),
      });
      const response = await askMarket({
        data: {
          context,
          messages: [
            {
              role: "user",
              content:
                "Revise esta leitura fechada. Confirme o que os dados sustentam, destaque bloqueios e não invente preços nem sinais.",
            },
          ],
        },
      });
      if (sequence !== aiRequestSequenceRef.current) return;
      if (response.error) {
        appendLog(`Qwen indisponível: ${response.error}`, "warn");
        return;
      }
      appendLog(
        `Qwen: ${response.text}`,
        liveDecision.decision.startsWith("ENTER_") ? "alert" : "info",
      );
    },
    [aiProvider.configured, aiProvider.model, appendLog, askMarket, asset],
  );

  const runAnalysis = useCallback(
    (closed: ReconstructedCandle[]) => {
      if (closed.length < 12) return;
      const result = analyze(closed.slice(-160), {
        reading: buildReading(),
        riskParams: store.riskParams(),
      });
      if (!result) return;
      const settings = store.settings();
      const instrument = resolveInstrument(asset, {
        tickSize: settings.tickSize > 0 ? settings.tickSize : undefined,
        pointValue: settings.pointValue > 0 ? settings.pointValue : undefined,
      });
      const adjusted: AnalysisResult = result;
      // Linha do tempo de eventos (dedupe semântico) alimentada pelo motor.
      const events = eventStoreRef.current;
      // Balde de dedupe derivado de medida real (stop estrutural ≈ escala do ATR).
      if (adjusted.plan) events.setPriceBucket(adjusted.plan.stopDistance / 2);
      const captureId = `an_${adjusted.t}`;
      // Paridade com o backtest: enquanto a escala é geométrica (unidades de
      // pixel) OU o preço reprovou na plausibilidade (comando ao-vivo §1),
      // nenhum "preço" é persistido como evento no banco.
      const priceTrustworthy = adjusted.reading.priceScaleReady && priceTrustRef.current.trusted;
      if (priceTrustworthy && adjusted.internalConfirmation.capture.valid) {
        const detail = adjusted.internalConfirmation.capture.detail;
        if (detail.price !== null) {
          events.add({
            timestamp: adjusted.t,
            candleId: `${asset}:${adjusted.t}`,
            type: "liquiditySweep",
            price: detail.price,
            region: detail.side === "compradora" ? "liquidez acima" : "liquidez abaixo",
            evidence: `captura qualidade ${Math.round(adjusted.internalConfirmation.capture.quality)}`,
            confidenceVisual: Math.min(1, adjusted.reading.candleQuality / 100),
            sourceCaptureId: captureId,
            sessionId: sessionIdRef.current,
            source: "LIVE",
            techniqueVersion: techniqueSnapshotRef.current,
            direction: adjusted.direction,
          });
        }
      }
      if (
        priceTrustworthy &&
        adjusted.internalConfirmation.sms.confirmed &&
        adjusted.internalConfirmation.sms.brokenLevel !== null
      ) {
        events.add({
          timestamp: adjusted.t,
          candleId: `${asset}:${adjusted.t}`,
          type: "CHOCH",
          price: adjusted.internalConfirmation.sms.brokenLevel,
          region: "estrutura interna",
          evidence: adjusted.internalConfirmation.sms.label,
          confidenceVisual: Math.min(1, adjusted.internalConfirmation.sms.confidence / 100),
          sourceCaptureId: captureId,
          sessionId: sessionIdRef.current,
          source: "LIVE",
          techniqueVersion: techniqueSnapshotRef.current,
          direction: adjusted.direction,
        });
      }
      if (priceTrustworthy && adjusted.mainPoi) {
        events.add({
          timestamp: adjusted.t,
          candleId: `${asset}:${adjusted.t}`,
          type: "POI",
          price: (adjusted.mainPoi.lower + adjusted.mainPoi.upper) / 2,
          region: `${adjusted.mainPoi.lower.toFixed(2)}–${adjusted.mainPoi.upper.toFixed(2)}`,
          evidence: `POI ${adjusted.mainPoi.kind} força ${adjusted.mainPoi.strength}`,
          confidenceVisual: Math.min(1, adjusted.mainPoi.strength / 100),
          sourceCaptureId: captureId,
          sessionId: sessionIdRef.current,
          source: "LIVE",
          techniqueVersion: techniqueSnapshotRef.current,
          direction: adjusted.direction,
        });
      }
      analysisRef.current = adjusted;
      // PREÇO DO PROFIT É SOBERANO (comando ao-vivo §1) — paridade com o
      // backtest (`if (!calibrated) return;`): sem escala calibrada E plausível,
      // NENHUMA decisão operacional roda. Era exatamente este gate que faltava
      // ao vivo: o decide() recebia preços em unidade de pixel (~202xxx) e a UI
      // publicava entrada/stop/alvos fictícios enquanto o gráfico mostrava
      // ~173270. A leitura estrutural continua; entrada/stop/alvos ficam
      // bloqueados com o motivo real exposto na UI ("PREÇO NÃO CONFIÁVEL").
      if (!priceTrustworthy) {
        setAnalysis(adjusted);
        setDecision(null);
        decisionRef.current = null;
        setLastAnalysisAt(Date.now());
        refreshDiagnostics();
        return;
      }
      // §29/§63: a AUTORIDADE operacional é o BacktestDecisionEngine baseado em evidência histórica.
      const liveDecision = decide({
        analysis: adjusted,
        asset,
        // §28: LEGACY_IMAGE fora da evidência por padrão; §17: técnica congelada.
        trades: filterEvidenceTrades(store.backtests()),
        techniqueSnapshot: techniqueSnapshotRef.current,
        instrument,
        riskConfig: {
          accountBalance: settings.accountBalance,
          maxRiskPercent: settings.maxRiskPercent,
          maxRiskMoney: settings.maxRiskMoney,
          contractsLimit: settings.maxContracts,
        },
      });
      // Desfecho real: o candle recém-fechado avança a operação confirmada.
      const lastClosed = closed[closed.length - 1];
      if (outcomeTrackerRef.current && lastClosed) {
        const progressed = outcomeTrackerRef.current.push(lastClosed);
        setOperation(progressed);
        // §10: transições de gestão viram eventos estruturados na memória temporal.
        if (progressed.status !== lastOperationStatusRef.current) {
          lastOperationStatusRef.current = progressed.status;
          const managementType =
            progressed.status === "ENTRADA ATINGIDA"
              ? "ENTRY_HIT"
              : progressed.status === "PARCIAL ATINGIDA"
                ? "PARTIAL_HIT"
                : progressed.status === "RUNNER ATIVO"
                  ? "TARGET2_HIT"
                  : progressed.status === "RUNNER ENCERRADO"
                    ? "RUNNER_STOP"
                    : progressed.status === "ALVO ATINGIDO"
                      ? "TARGET_HIT"
                      : progressed.status === "STOP ATINGIDO"
                        ? "STOP_HIT"
                        : null;
          if (managementType) {
            screenRecordingManager.logEvent(managementType, lastClosed.t, {
              signalId: snapshotRef.current?.signalId ?? null,
              status: progressed.status,
              detail: progressed.detail,
              exit: progressed.exit,
              rMultiple: progressed.rMultiple,
            });
            eventStoreRef.current.add({
              timestamp: lastClosed.t,
              candleId: `${asset}:${lastClosed.t}`,
              type: managementType,
              price: progressed.exit ?? lastClosed.c,
              region: "gestão da operação",
              evidence: progressed.detail,
              confidenceVisual: 1,
              sourceCaptureId: liveRecordIdRef.current,
              sessionId: sessionIdRef.current,
              segmentId: segmentIdRef.current,
              source: "LIVE",
              techniqueVersion: techniqueSnapshotRef.current,
              direction: adjusted.direction,
            });
          }
        }
        if (progressed.done) {
          const frozenAnalysis = confirmedAnalysisRef.current;
          if (
            frozenAnalysis &&
            progressed.filled &&
            progressed.result &&
            progressed.rMultiple !== null
          ) {
            const trade = createBacktestTrade({
              analysis: frozenAnalysis,
              asset,
              sourceCaptureId: liveRecordIdRef.current,
              tradingSessionId: sessionIdRef.current,
              segmentId: segmentIdRef.current,
              origin: "LIVE_REPLAY",
              closedAt: progressed.exitAt ?? lastClosed.t,
              entryHitAt: progressed.entryHitAt,
              partialHitAt: progressed.partialHitAt,
              exitAt: progressed.exitAt,
              exit: progressed.exit ?? frozenAnalysis.price,
              result: progressed.result,
              rMultiple: progressed.rMultiple,
              mfeMae:
                progressed.mfePoints !== null && progressed.maePoints !== null
                  ? {
                      mfePoints: progressed.mfePoints,
                      maePoints: progressed.maePoints,
                      mfeR: progressed.mfeR,
                      maeR: progressed.maeR,
                    }
                  : null,
              exitReason: progressed.exitReason,
              ambiguousIntrabar: progressed.ambiguousIntrabar,
              // Ao vivo o pregão é a data real local — não precisa de OCR.
              tradingDate: localTradingDate(progressed.entryHitAt ?? lastClosed.t),
              // Snapshot da biblioteca no mesmo instante congelado da decisão.
              ...detectTechniqueSnapshot(frozenAnalysis),
              productionTechniqueVersion: techniqueSnapshotRef.current,
            });
            if (trade) {
              sessionTradesRef.current = [...sessionTradesRef.current, trade];
              // Resultado REAL alimenta o mesmo banco do backtest (origem ao vivo).
              store.upsertBacktest({
                id: liveRecordIdRef.current,
                strategyVersion: frozenAnalysis.strategyVersion,
                asset,
                timeframe: "1m",
                createdAt: Date.now(),
                sourceCaptureId: liveRecordIdRef.current,
                origin: "LIVE_REPLAY",
                trades: sessionTradesRef.current,
              });
              appendLog(
                `Operação encerrada (${progressed.status}) — resultado ${progressed.rMultiple.toFixed(2)}R salvo na base histórica.`,
                "info",
              );
            }
          }
          outcomeTrackerRef.current = null;
          confirmedAnalysisRef.current = null;
          entryMachineRef.current.reset();
          // Operação encerrada: o snapshot congelado sai de cena; o próximo
          // sinal terá um signalId novo (e um novo som único).
          snapshotRef.current = null;
          setSignalSnapshot(null);
        }
      }

      const wasConfirmed =
        entryMachineRef.current.current() === "CONFIRMED" ||
        entryMachineRef.current.current() === "MANAGING";
      entryMachineRef.current.onDecision(liveDecision);
      if (!wasConfirmed && entryMachineRef.current.current() === "CONFIRMED") {
        const frozen = entryMachineRef.current.frozenEntry();
        if (frozen && adjusted.direction !== "NEUTRO") {
          outcomeTrackerRef.current = new LiveOutcomeTracker(
            adjusted.direction,
            frozen.confirmedEntryPrice,
            frozen.stopPrice,
            frozen.partialPrice,
            frozen.targetPrice,
            10,
            { threeContractRunner: true },
          );
          confirmedAnalysisRef.current = adjusted;
          // §7: SNAPSHOT IMUTÁVEL no CONFIRMADO — depois disso, direção,
          // entrada, stop inicial, 3R e 5R NUNCA são recalculados. Somente o
          // gerenciamento T4 existente evolui o currentStop.
          const confirmationCandle = lastClosed ?? closed[closed.length - 1]!;
          const snapshot = createSignalSnapshot({
            asset,
            chartTimestamp: confirmationCandle.t,
            direction: adjusted.direction,
            entry: frozen.confirmedEntryPrice,
            initialStop: frozen.stopPrice,
            threeR: frozen.partialPrice,
            fiveR: frozen.targetPrice,
            setup: adjusted.t4.setup,
            confirmationCandle,
          });
          snapshotRef.current = snapshot;
          setSignalSnapshot(snapshot);
          // §8: alerta forte UMA vez por signalId, nunca por frame.
          playConfirmationOnce(snapshot.signalId, adjusted.direction, store.settings().sound);
          // §9: evento sincronizado (tempo real + tempo do gráfico) na gravação.
          screenRecordingManager.logEvent("SIGNAL_CONFIRMED", snapshot.chartTimestamp, {
            signalId: snapshot.signalId,
            direction: snapshot.direction,
            entry: snapshot.entry,
            initialStop: snapshot.initialStop,
            threeR: snapshot.threeR,
            fiveR: snapshot.fiveR,
            setup: snapshot.setup,
          });
          eventStoreRef.current.add({
            timestamp: lastClosed?.t ?? adjusted.t,
            candleId: `${asset}:${lastClosed?.t ?? adjusted.t}`,
            type: "ENTRY_CONFIRMED",
            price: frozen.confirmedEntryPrice,
            region: "confirmação da operação",
            evidence: liveDecision.decisionReasons.join(" | "),
            confidenceVisual: 1,
            sourceCaptureId: liveRecordIdRef.current,
            sessionId: sessionIdRef.current,
            segmentId: segmentIdRef.current,
            source: "LIVE",
            techniqueVersion: techniqueSnapshotRef.current,
            direction: adjusted.direction,
          });
          setOperation(outcomeTrackerRef.current.current());
        }
      }
      entryMachineRef.current.onPrice(
        adjusted.price,
        adjusted.direction === "VENDA" ? "VENDA" : "COMPRA",
      );
      setDecision(liveDecision);
      decisionRef.current = liveDecision;
      setEntryState(entryMachineRef.current.current());
      store.saveLastDecision(liveDecision);
      setAnalysis(adjusted);
      setLastAnalysisAt(Date.now());
      // Evento sincronizado da leitura fechada: tempo real + tempo do gráfico.
      screenRecordingManager.logEvent("T4_DECISION", adjusted.t, {
        decision: liveDecision.decision,
        regime: adjusted.regime.regime,
        setup: adjusted.t4.setup,
        quality: adjusted.t4.quality,
        blockers: adjusted.blockers.length,
        signalId: snapshotRef.current?.signalId ?? null,
      });
      refreshDiagnostics();
      appendLog(
        adjusted.explanation,
        liveDecision.decision.startsWith("ENTER_") ? "alert" : "info",
      );
      if (adjusted.blockers.length) appendLog(adjusted.blockers[0]!, "warn");
      // Falha de rede na revisão da IA não pode virar unhandled rejection.
      void requestAIValidation(adjusted, liveDecision).catch((error) => {
        appendLog(
          `Revisão da IA indisponível: ${error instanceof Error ? error.message : String(error)}`,
          "warn",
        );
      });
    },
    [appendLog, asset, buildReading, refreshDiagnostics, requestAIValidation],
  );

  const handleFrame = useCallback(
    (read: FrameRead) => {
      lastFrameReadRef.current = read;
      const previousSize = frameSizeRef.current;
      const changed =
        previousSize &&
        (Math.abs(previousSize.width - read.width) > 2 ||
          Math.abs(previousSize.height - read.height) > 2);
      frameSizeRef.current = { width: read.width, height: read.height };
      // Evita re-render a cada frame: só publica quando a dimensão realmente muda.
      if (
        !previousSize ||
        previousSize.width !== read.width ||
        previousSize.height !== read.height
      ) {
        setFrameSize({ width: read.width, height: read.height });
      }
      // Zoom/resolução mudou: a ESCALA morre, a ANÁLISE continua. O que já foi
      // lido permanece; a calibração volta a procurar âncoras em paralelo.
      if (changed && anchors.length > 0) {
        setAnchors([]);
        setCalibrationState(schedulerRef.current.invalidate("zoom/resolução alterada"));
        // A série NÃO pode misturar preços reais com o modo geométrico (pixel)
        // que assume até a recalibração: os candles reais já lidos são
        // preservados no banco, mas a reconstrução recomeça — exatamente como
        // na primeira calibração. Sem isso, uma operação aberta receberia
        // STOP/ALVO comparados contra números em unidade de pixel.
        reconstructorRef.current = new CandleReconstructor(asset);
        setCandles([]);
        setFormingCandle(null);
        lastTrustedPriceRef.current = null;
        divergenceStreakRef.current = 0;
        publishPriceInfo({
          price: null,
          trusted: false,
          reason: "Zoom/resolução alterada — escala recalibrando.",
          at: null,
        });
        appendLog(
          "Zoom/resolução mudou: escala invalidada, série reiniciada e recalibrando em paralelo. A análise estrutural segue ativa.",
          "warn",
        );
      }
      if (!sessionActive || !timeframeConfirmed) {
        refreshDiagnostics();
        return;
      }

      // CHART_CLOCK ao vivo (comando §4): OCR assíncrono da faixa de tempo do
      // Profit — nunca bloqueia o loop de frames (latest-frame-wins).
      const video = screenCaptureManager.videoRef.current;
      if (
        video?.videoWidth &&
        ++framesSinceClockRef.current >= CLOCK_EVERY_FRAMES &&
        !clockBusyRef.current
      ) {
        framesSinceClockRef.current = 0;
        clockBusyRef.current = true;
        try {
          const imageDataUrl = captureTimeAxisImage(video, null);
          void readClock({ data: { imageDataUrl } })
            .then((clock) => {
              timeAxisOkRef.current = clock.read !== null;
              // Timeout da IA NÃO destrói estado: relógio, candles e
              // calibração seguem intactos; só o refresh desta leitura falhou.
              liveMarketClock.update(clock.read, Date.now());
              if (clock.error) {
                // §2: timeout da IA → AI_TIMEOUT (OLLAMA); falha real de
                // leitura → CHART_CLOCK. Dedupe por sessão+código.
                clockErrorGateRef.current.reportOnce("CHART_CLOCK", clock.error, {
                  sessionId: sessionIdRef.current,
                });
              } else if (clock.read) {
                // Leitura voltou: um único INFO de recuperação limpa o aviso.
                clockErrorGateRef.current.recover(
                  sessionIdRef.current,
                  "Leitura do chartClock recuperada — pipeline normalizado.",
                );
              }
            })
            .catch((error) => {
              timeAxisOkRef.current = false;
              clockErrorGateRef.current.reportOnce(
                "CHART_CLOCK",
                error instanceof Error ? error.message : String(error),
                { sessionId: sessionIdRef.current },
              );
            })
            .finally(() => {
              clockBusyRef.current = false;
            });
        } catch {
          clockBusyRef.current = false;
        }
      }

      if (read.priceY === null || read.quality < 0.2) {
        setLastRejectedRead("Não foi possível localizar o preço atual no frame.");
        refreshDiagnostics();
        return;
      }
      // Sem escala calibrada a leitura roda em modo geométrico (unidades
      // relativas) — estrutura idêntica, preço exato ainda indisponível.
      const scale = calibration.usable ? calibration : geometricCalibration(read.height);
      const price = priceAt(scale, read.priceY);
      lastComputedPriceRef.current = price;
      if (price === null) {
        setLastRejectedRead("Frame ilegível para reconstrução de candles.");
        refreshDiagnostics();
        return;
      }
      // Tempo oficial do candle: chartClock quando válido; fallback realtime
      // registrado no diagnóstico. Nunca Date.now() "cru" com relógio válido.
      const market = liveMarketClock.now();

      // PREÇO SOBERANO (comando ao-vivo §1): mesmo com calibração aprovada, a
      // amostra só vira candle/nível se o preço convertido for plausível contra
      // o próprio frame (faixa do ativo, faixa visível, salto máximo de 2%).
      if (calibration.usable) {
        const plausibility = pricePlausibility({
          asset,
          calibration,
          price,
          frameHeight: read.height,
          lastPrice: lastTrustedPriceRef.current,
        });
        if (!plausibility.ok) {
          divergenceStreakRef.current++;
          publishPriceInfo({
            price: null,
            trusted: false,
            reason: plausibility.reason,
            at: market.t,
          });
          setLastRejectedRead(plausibility.reason);
          priceErrorGateRef.current.reportOnce(
            "CAPTURA",
            plausibility.reason ?? "Preço implausível.",
            {
              sessionId: sessionIdRef.current,
              severity: "ERROR",
              context: { price, priceY: read.priceY },
            },
          );
          // Divergência persistente = calibração vencida de verdade (não um
          // frame ruidoso isolado): a escala é invalidada e recalibra em
          // paralelo; a série reinicia para nunca misturar referenciais.
          if (divergenceStreakRef.current >= 3) {
            divergenceStreakRef.current = 0;
            lastTrustedPriceRef.current = null;
            setAnchors([]);
            setCalibrationState(schedulerRef.current.invalidate("preço divergente da escala"));
            reconstructorRef.current = new CandleReconstructor(asset);
            setCandles([]);
            setFormingCandle(null);
            appendLog(
              "PREÇO NÃO CONFIÁVEL: leituras divergentes da escala calibrada. Escala invalidada, série reiniciada e recalibração automática em andamento. Entrada, stop e alvos permanecem bloqueados.",
              "warn",
            );
          }
          refreshDiagnostics();
          return;
        }
        divergenceStreakRef.current = 0;
        lastTrustedPriceRef.current = price;
        publishPriceInfo({ price, trusted: true, reason: null, at: market.t });
        priceErrorGateRef.current.recover(
          sessionIdRef.current,
          "Preço voltou a bater com a escala calibrada — leitura confiável novamente.",
        );
      } else {
        // Modo geométrico: NUNCA publicado como preço real (comando §1 —
        // nenhum preço fictício/normalizado chega à UI de gerenciamento).
        lastTrustedPriceRef.current = null;
        publishPriceInfo({
          price: null,
          trusted: false,
          reason: calibration.reason,
          at: market.t,
        });
      }
      // Troca de fonte do relógio = descontinuidade legítima da linha do
      // tempo: a série recomeça no novo referencial em vez de rejeitar todas
      // as amostras "fora de ordem" para sempre.
      if (clockSourceRef.current !== null && clockSourceRef.current !== market.source) {
        reconstructorRef.current = new CandleReconstructor(asset);
        setCandles([]);
        setFormingCandle(null);
        appendLog(
          `Relógio da sessão mudou para ${market.source === "CHART_CLOCK" ? "o horário do gráfico" : "o relógio local (fallback)"} — série reiniciada no novo referencial.`,
          "warn",
        );
      }
      clockSourceRef.current = market.source;
      const result = reconstructorRef.current.push({
        t: market.t,
        price,
        quality: read.quality,
      });
      lastCandleColumnsRef.current = read.candleColumns;
      setLastRejectedRead(result.rejected);
      setCandles([...result.closed, ...(result.forming ? [result.forming] : [])]);
      setFormingCandle(result.forming);
      if (result.justClosed) runAnalysis(result.closed);
      refreshDiagnostics();
    },
    [
      anchors.length,
      appendLog,
      asset,
      calibration,
      publishPriceInfo,
      readClock,
      refreshDiagnostics,
      runAnalysis,
      sessionActive,
      timeframeConfirmed,
    ],
  );

  const chart = useContinuousChartCapture(handleFrame);

  // Relógio da sessão: fecha o candle em formação na virada do minuto mesmo sem
  // nova amostra válida (mercado parado, leitura rejeitada ou aba oculta).
  // Sem isso, closeIfElapsed nunca é chamado e a análise trava esperando um
  // frame que só chegaria com o preço se movendo.
  useEffect(() => {
    if (!sessionActive) return;
    const timer = setInterval(() => {
      // O relógio da sessão também segue o marketClock: no replay acelerado o
      // minuto do GRÁFICO vira antes do minuto real e o candle fecha junto.
      const sealed = reconstructorRef.current.closeIfElapsed(liveMarketClock.now().t);
      if (!sealed) return;
      const closed = reconstructorRef.current.closedCandles();
      setCandles([...closed]);
      setFormingCandle(null);
      runAnalysis(closed);
    }, 1_000);
    return () => clearInterval(timer);
  }, [sessionActive, runAnalysis]);

  useEffect(() => {
    reconstructorRef.current = new CandleReconstructor(asset);
    eventStoreRef.current = createPersistentEventStore(asset);
    entryMachineRef.current.reset();
    // A escala calibrada do ativo anterior não vale para o novo ativo.
    setAnchors([]);
    clockSourceRef.current = null;
    clockErrorGateRef.current.reset();
    priceErrorGateRef.current.reset();
    lastTrustedPriceRef.current = null;
    lastComputedPriceRef.current = null;
    divergenceStreakRef.current = 0;
    publishPriceInfo({
      price: null,
      trusted: false,
      reason: "Escala ainda não calibrada.",
      at: null,
    });
    outcomeTrackerRef.current = null;
    confirmedAnalysisRef.current = null;
    sessionTradesRef.current = [];
    liveRecordIdRef.current = `live_${Date.now()}`;
    techniqueSnapshotRef.current = STRATEGY_VERSION;
    lastOperationStatusRef.current = null;
    setOperation(null);
    setCandles([]);
    setFormingCandle(null);
    setAnalysis(null);
    analysisRef.current = null;
    snapshotRef.current = null;
    setSignalSnapshot(null);
    setSessionActive(false);
  }, [asset, publishPriceInfo]);

  const startSession = useCallback((): string[] => {
    const errors: string[] = [];
    if (!storageReady)
      errors.push(
        storageError
          ? `Banco persistente indisponível: ${storageError}`
          : "Aguardando banco persistente.",
      );
    if (chart.status !== "capturando")
      errors.push("Confirme a janela do gráfico antes de iniciar.");
    if (!timeframeConfirmed) errors.push("Confirme que o gráfico está em 1 minuto.");
    if (!chart.videoRef.current) errors.push("Prévia de vídeo indisponível.");
    if (errors.length) return errors;

    reconstructorRef.current.reset();
    eventStoreRef.current.reset();
    entryMachineRef.current.reset();
    // Nada da sessão anterior pode vazar para a nova: operação em curso,
    // análise congelada, trades acumulados e o id do registro histórico.
    outcomeTrackerRef.current = null;
    confirmedAnalysisRef.current = null;
    sessionTradesRef.current = [];
    liveRecordIdRef.current = `live_${Date.now()}`;
    lastOperationStatusRef.current = null;
    clockSourceRef.current = null;
    clockErrorGateRef.current.reset();
    priceErrorGateRef.current.reset();
    lastTrustedPriceRef.current = null;
    divergenceStreakRef.current = 0;
    setOperation(null);
    // Snapshot da técnica em produção: qualquer promoção posterior só vale na
    // próxima sessão, nunca no meio de uma operação.
    techniqueSnapshotRef.current = store.productionTechnique()?.version ?? STRATEGY_VERSION;
    const lastClosedAt = minuteStart(Date.now()) - MINUTE_MS;
    const video = chart.videoRef.current!;
    const startScale = calibration.usable
      ? calibration
      : geometricCalibration(video.videoHeight || 720);
    const initial = extractVisibleCandles(video, startScale, lastClosedAt);
    const seeded = reconstructorRef.current.seedClosed(initial);
    const closed = reconstructorRef.current.closedCandles();
    setCandles([...closed]);
    setFormingCandle(null);
    setSessionActive(true);
    snapshotRef.current = null;
    setSignalSnapshot(null);
    liveMarketClock.reset();
    const sessionStartedAt = Date.now();
    sessionIdRef.current = `visual_${sessionStartedAt}`;
    segmentIdRef.current = `${sessionIdRef.current}_segment_1`;
    // §9: ao iniciar a análise, inicia SEPARADAMENTE MediaStream (já ativo),
    // T4 (esta sessão), MediaRecorder e a sessão de gravação no banco.
    screenRecordingManager.setAnalysisActive(true);
    const captureStream = screenCaptureManager.stream();
    if (captureStream) {
      void screenRecordingManager
        .start({
          stream: captureStream,
          sessionId: `rec_${sessionStartedAt}`,
          liveSessionId: sessionIdRef.current,
          asset,
        })
        .catch((error) => {
          reportError("GRAVACAO", error instanceof Error ? error.message : String(error), {
            severity: "ERROR",
            sessionId: sessionIdRef.current,
          });
        });
    } else {
      reportError("GRAVACAO", "Análise iniciada sem MediaStream ativo para gravar.", {
        severity: "WARNING",
        sessionId: sessionIdRef.current,
      });
    }
    store.saveSession({
      id: sessionIdRef.current,
      asset,
      strategyVersion: techniqueSnapshotRef.current,
      startedAt: sessionStartedAt,
      endedAt: null,
      status: "ativa",
      finalAnalysis: null,
    });
    store.upsertTradingSession({
      id: sessionIdRef.current,
      source: "LIVE",
      symbol: asset,
      tradingDate: localTradingDate(sessionStartedAt),
      timeframe: "1m",
      techniqueVersion: techniqueSnapshotRef.current,
      startedAt: sessionStartedAt,
      endedAt: null,
      segmentCount: 1,
      eventCount: 1,
      tradeCount: 0,
      createdAt: sessionStartedAt,
    });
    store.saveSegment({
      id: segmentIdRef.current,
      sessionId: sessionIdRef.current,
      startedAt: sessionStartedAt,
      endedAt: null,
      reason: "live_continuous_capture",
      tradingDate: localTradingDate(sessionStartedAt),
      createdAt: sessionStartedAt,
    });
    eventStoreRef.current.add({
      timestamp: Date.now(),
      candleId: `${asset}:session-open`,
      type: "SESSION_OPEN",
      price: closed[closed.length - 1]?.c ?? 0,
      region: "sessão ao vivo",
      evidence: "Sessão de observação contínua iniciada.",
      confidenceVisual: 1,
      sourceCaptureId: liveRecordIdRef.current,
      sessionId: sessionIdRef.current,
      segmentId: segmentIdRef.current,
      source: "LIVE",
      techniqueVersion: techniqueSnapshotRef.current,
    });
    appendLog(
      `Sessão iniciada com ${seeded.accepted} candle(s) reais extraídos da janela. O candle em formação nunca entra na decisão.`,
      "info",
    );
    if (seeded.accepted < READING_GATES.minClosedCandles) {
      appendLog(
        `Leitura inicial curta: o motor aguardará ${READING_GATES.minClosedCandles - seeded.accepted} candle(s) fechado(s).`,
        "warn",
      );
    }
    runAnalysis(closed);
    return [];
  }, [
    appendLog,
    asset,
    calibration,
    chart.status,
    chart.videoRef,
    runAnalysis,
    storageError,
    storageReady,
    timeframeConfirmed,
  ]);

  /**
   * Uma tentativa de calibração. Roda EM PARALELO à análise: falhar aqui só
   * mantém os preços indisponíveis, nunca interrompe a leitura estrutural.
   */
  const attemptCalibration = useCallback(async () => {
    if (calibrationBusyRef.current) return;
    const video = chart.videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) return;
    const scheduler = schedulerRef.current;
    calibrationBusyRef.current = true;
    scheduler.markAttempt(Date.now());
    setAutoCalibrating(true);
    const report = (next: CalibrationSchedulerState) => {
      setCalibrationState(next);
      const summary = calibrationSummary(next);
      // Uma linha CONSOLIDADA: só registra quando o estado realmente muda.
      if (calibrationLogRef.current !== next.status) {
        calibrationLogRef.current = next.status;
        appendLog(summary, next.status === "CALIBRATED" ? "info" : "warn");
      }
    };
    try {
      const snapshot = capturePriceScaleImage(video, scheduler.roi());
      const size = { width: snapshot.frameWidth, height: snapshot.frameHeight };
      frameSizeRef.current = size;
      setFrameSize(size);
      const response = await calibrateScale({
        data: { imageDataUrl: snapshot.imageDataUrl, frameHeight: snapshot.frameHeight },
      });
      if (response.error) {
        setAutoCalibrationError(response.error);
        report(scheduler.fail(response.error));
        return;
      }
      const normalizedAnchors = normalizeScaleAnchorsForAsset(asset, response.anchors);
      const next = calibrateFromAnchors(normalizedAnchors);
      if (!next.usable) {
        setAutoCalibrationError(next.reason);
        report(scheduler.fail(next.reason, normalizedAnchors.length));
        return;
      }
      const scaleIssue = assetScaleIssue(asset, normalizedAnchors);
      if (scaleIssue) {
        setAutoCalibrationError(scaleIssue);
        report(scheduler.fail(scaleIssue, normalizedAnchors.length));
        return;
      }
      // A escala real entra em vigor DAQUI PARA FRENTE. Os candles lidos em
      // modo geométrico não viram preço retroativo e nada é confirmado
      // retroativamente: a série de preço recomeça neste instante.
      reconstructorRef.current = new CandleReconstructor(asset);
      entryMachineRef.current.reset();
      setCandles([]);
      setFormingCandle(null);
      // Escala nova = referencial novo: a continuidade de preço recomeça e a
      // primeira leitura não é comparada com a escala anterior.
      lastTrustedPriceRef.current = null;
      divergenceStreakRef.current = 0;
      setAnchors(next.anchors);
      setAutoCalibrationError(null);
      report(scheduler.succeed(next.anchors.length));
      appendLog(
        `Escala calibrada por ${response.model}: ${next.anchors
          .map((anchor) => anchor.raw)
          .join(" → ")}. Preços exatos liberados a partir de agora.`,
        "info",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha na calibração automática.";
      setAutoCalibrationError(message);
      report(scheduler.fail(message));
    } finally {
      calibrationBusyRef.current = false;
      setAutoCalibrating(false);
    }
  }, [appendLog, asset, calibrateScale, chart.videoRef]);

  /**
   * GRÁFICO VISÍVEL = ANÁLISE ATIVA. A sessão sobe na hora e a calibração
   * entra numa fila lateral de tentativas com backoff.
   */
  const autoCalibrateAndStart = useCallback(async () => {
    setAutoCalibrationError(null);
    if (!timeframeConfirmed) {
      setAutoCalibrationError("Confirme primeiro que a janela mostra o gráfico de 1 minuto.");
      return;
    }
    const video = chart.videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) {
      setAutoCalibrationError("A janela selecionada ainda não forneceu uma imagem válida.");
      return;
    }
    schedulerRef.current = new CalibrationScheduler();
    calibrationLogRef.current = null;
    setCalibrationState(schedulerRef.current.state());
    setSessionActive(false);
    setAnchors([]);
    setAnalysis(null);
    analysisRef.current = null;
    setCandles([]);
    setFormingCandle(null);
    setLastAnalysisAt(null);
    appendLog(
      "Gráfico visível no analisador: leitura estrutural iniciada. A escala de preços calibra em paralelo.",
      "info",
    );
    setAutoStartRequested(true);
    void attemptCalibration();
  }, [appendLog, attemptCalibration, chart.videoRef, timeframeConfirmed]);

  /** Fila paralela de recalibração — nunca para até conseguir. */
  useEffect(() => {
    if (chart.status !== "capturando" || calibration.usable) return;
    const timer = setInterval(() => {
      if (schedulerRef.current.shouldAttempt(Date.now())) void attemptCalibration();
    }, 1_000);
    return () => clearInterval(timer);
  }, [attemptCalibration, calibration.usable, chart.status]);

  /** Ajuste manual da região da escala (fallback, sem travar a análise). */
  const adjustScaleRegion = useCallback(
    (fraction: number | null) => {
      schedulerRef.current.setManualRoi(fraction);
      setCalibrationState(schedulerRef.current.state());
      void attemptCalibration();
    },
    [attemptCalibration],
  );

  const selectSourceAndStart = useCallback(async () => {
    setAutoCalibrationError(null);
    await chart.selectSource();
    chart.confirmPreview();
    await autoCalibrateAndStart();
  }, [autoCalibrateAndStart, chart]);

  const confirmPreviewAndStart = useCallback(async () => {
    chart.confirmPreview();
    await autoCalibrateAndStart();
  }, [autoCalibrateAndStart, chart]);

  const switchSourceAndStart = useCallback(async () => {
    setAutoCalibrationError(null);
    await chart.switchSource();
    chart.confirmPreview();
    await autoCalibrateAndStart();
  }, [autoCalibrateAndStart, chart]);

  useEffect(() => {
    // Gráfico visível = análise ativa. Não espera calibração para começar.
    if (!autoStartRequested || chart.status !== "capturando") return;
    const errors = startSession();
    setAutoStartRequested(false);
    if (errors.length) setAutoCalibrationError(errors.join(" "));
  }, [autoStartRequested, chart.status, startSession]);

  const endSession = useCallback(() => {
    aiRequestSequenceRef.current++;
    setAutoStartRequested(false);
    setSessionActive(false);
    // Gravação: STOP dispara o último dataavailable, finaliza o manifesto no
    // banco e valida bytes>0 — nada disso depende da UI continuar montada.
    screenRecordingManager.setAnalysisActive(false);
    void screenRecordingManager.finish();
    if (sessionIdRef.current) {
      eventStoreRef.current.add({
        timestamp: Date.now(),
        candleId: `${asset}:session-close`,
        type: "SESSION_CLOSE",
        price: analysisRef.current?.price ?? 0,
        region: "sessão ao vivo",
        evidence: "Sessão de observação contínua encerrada.",
        confidenceVisual: 1,
        sourceCaptureId: liveRecordIdRef.current,
        sessionId: sessionIdRef.current,
        segmentId: segmentIdRef.current,
        source: "LIVE",
        techniqueVersion: techniqueSnapshotRef.current,
      });
      const endedAt = Date.now();
      const startedAt = Number(sessionIdRef.current.split("_")[1]) || endedAt;
      if (segmentIdRef.current) {
        store.saveSegment({
          id: segmentIdRef.current,
          sessionId: sessionIdRef.current,
          startedAt,
          endedAt,
          reason: "live_continuous_capture",
          tradingDate: localTradingDate(startedAt),
          createdAt: startedAt,
        });
      }
      store.saveSession({
        id: sessionIdRef.current,
        asset,
        strategyVersion: techniqueSnapshotRef.current,
        startedAt,
        endedAt,
        status: "encerrada",
        finalAnalysis: analysisRef.current,
      });
      const learningDate = localTradingDate(startedAt);
      store.upsertTradingSession({
        id: sessionIdRef.current,
        source: "LIVE",
        symbol: asset,
        tradingDate: learningDate,
        timeframe: "1m",
        techniqueVersion: techniqueSnapshotRef.current,
        startedAt,
        endedAt,
        segmentCount: 1,
        eventCount: eventStoreRef.current.timeline().length,
        tradeCount: sessionTradesRef.current.length,
        createdAt: startedAt,
      });
      store.runDailyLearning(learningDate, techniqueSnapshotRef.current);
    }
    appendLog("Sessão encerrada. Nenhuma ordem foi enviada à corretora.", "info");
    sessionIdRef.current = null;
    segmentIdRef.current = null;
  }, [appendLog, asset]);

  const calibrationMarks = frameSize
    ? anchors.map((anchor) => anchor.y / Math.max(1, frameSize.height))
    : [];

  return {
    chart,
    sessionActive,
    candles,
    formingCandle,
    analysis,
    decision,
    entryState,
    operation,
    signalSnapshot,
    diagnostics,
    /** Preço vivo (única fonte para Gerenciamento, preview e motor — §9). */
    priceInfo,
    marketClock: liveMarketClock.snapshot(),
    frozenEntry: entryMachineRef.current.frozenEntry(),
    chat,
    aiProvider,
    autoCalibrating,
    autoCalibrationError,
    lastAnalysisAt,
    lastRejectedRead,
    frameSize,
    anchors,
    calibration,
    calibrationMarks,
    calibrationState,
    calibrationSummary: calibrationSummary(calibrationState),
    priceScaleReady: calibration.usable,
    adjustScaleRegion,
    retryCalibration: attemptCalibration,
    startSession,
    autoCalibrateAndStart,
    selectSourceAndStart,
    confirmPreviewAndStart,
    switchSourceAndStart,
    endSession,
    storageReady,
    storageError,
  };
}
