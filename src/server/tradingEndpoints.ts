import {
  databaseInfo,
  getProductionTechnique,
  getSnapshot,
  listTechniqueCandidates,
  promoteTechniqueCandidate,
  runDailyLearning,
  saveLastDecision,
  saveReplayBatch,
  upsertBacktest,
  upsertLiveSession,
  upsertMarketEvent,
  upsertReplaySession,
  upsertSegment,
  upsertTechniqueCandidate,
  upsertTradingSession,
} from "./tradingRepository";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function body<T>(request: Request): Promise<T> {
  return (await request.json()) as T;
}

export async function handleTradingRequest(request: Request): Promise<Response | null> {
  const path = new URL(request.url).pathname.replace(/\/+$/, "") || "/";
  if (!path.startsWith("/api/trading/") && path !== "/api/trading") return null;

  try {
    if (request.method === "GET" && path === "/api/trading/snapshot") {
      return json({ ...getSnapshot(), database: databaseInfo() });
    }
    if (request.method === "GET" && path === "/api/trading/technique-current") {
      return json({ technique: getProductionTechnique() });
    }
    if (request.method === "GET" && path === "/api/trading/technique-candidates") {
      return json({ candidates: listTechniqueCandidates() });
    }
    if (request.method === "POST" && path === "/api/trading/technique-candidates") {
      upsertTechniqueCandidate(await body(request));
      return json({ ok: true });
    }
    if (request.method === "POST" && path === "/api/trading/technique-promote") {
      const payload = await body<{ candidateId?: string }>(request);
      if (!payload.candidateId) return json({ error: "candidateId é obrigatório." }, 400);
      return json({ ok: true, technique: promoteTechniqueCandidate(payload.candidateId) });
    }
    if (request.method === "POST" && path === "/api/trading/learning-daily") {
      const payload = await body<{ tradingDate?: string; baseVersion?: string }>(request);
      if (!payload.tradingDate) return json({ error: "tradingDate é obrigatório." }, 400);
      return json({ ok: true, report: runDailyLearning(payload.tradingDate, payload.baseVersion) });
    }
    if (request.method === "POST" && path === "/api/trading/live-sessions") {
      upsertLiveSession(await body(request));
      return json({ ok: true });
    }
    if (request.method === "POST" && path === "/api/trading/trading-sessions") {
      upsertTradingSession(await body(request));
      return json({ ok: true });
    }
    if (request.method === "POST" && path === "/api/trading/segments") {
      upsertSegment(await body(request));
      return json({ ok: true });
    }
    if (request.method === "POST" && path === "/api/trading/replay-batch") {
      saveReplayBatch(await body(request));
      return json({ ok: true });
    }
    if (request.method === "POST" && path === "/api/trading/replay-sessions") {
      upsertReplaySession(await body(request));
      return json({ ok: true });
    }
    if (request.method === "POST" && path === "/api/trading/backtests") {
      upsertBacktest(await body(request));
      return json({ ok: true });
    }
    if (request.method === "POST" && path === "/api/trading/decision") {
      saveLastDecision(await body(request));
      return json({ ok: true });
    }
    if (request.method === "POST" && path === "/api/trading/events") {
      upsertMarketEvent(await body(request));
      return json({ ok: true });
    }
    return json({ error: "Endpoint de persistência não encontrado." }, 404);
  } catch (error) {
    console.error("trading persistence error", error);
    return json(
      {
        error: "Falha na persistência do analisador.",
        detail: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
}
