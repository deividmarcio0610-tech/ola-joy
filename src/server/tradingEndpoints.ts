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
import { rollbackTechnique, techniqueHistory } from "./techniqueRegistry";
import {
  authRequired,
  authorizeWrite,
  createSessionCookieValue,
  currentSession,
  loginRateLimited,
  resolveRole,
  sameOriginViolation,
  sessionCookieHeader,
} from "./tradingAuth";

function json(payload: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

async function body<T>(request: Request): Promise<T> {
  return (await request.json()) as T;
}

/**
 * SUPERFÍCIE HTTP DO ANALISADOR.
 *
 * LEITURA PÚBLICA (GET): snapshot, técnica ativa, candidatas e histórico. São
 * os próprios dados do operador, não carregam segredo e não alteram estado.
 *
 * ESCRITA (POST): exige sessão de operador — cookie HttpOnly assinado +
 * CSRF + mesma origem (ver tradingAuth.ts). Vale para TODOS os endpoints que
 * gravam: sessões, segmentos, candles/replay, eventos, backtests, decisão,
 * candidatas e aprendizado diário.
 *
 * ADMIN: promoção e rollback de técnica exigem ADMIN_TOKEN, porque trocam a
 * técnica que autoriza entradas.
 */
const WRITE_PATHS = new Set([
  "/api/trading/technique-candidates",
  "/api/trading/learning-daily",
  "/api/trading/live-sessions",
  "/api/trading/trading-sessions",
  "/api/trading/segments",
  "/api/trading/replay-batch",
  "/api/trading/replay-sessions",
  "/api/trading/backtests",
  "/api/trading/decision",
  "/api/trading/events",
]);

const ADMIN_PATHS = new Set(["/api/trading/technique-promote", "/api/trading/technique-rollback"]);

export async function handleTradingRequest(request: Request): Promise<Response | null> {
  const path = new URL(request.url).pathname.replace(/\/+$/, "") || "/";
  if (!path.startsWith("/api/trading/") && path !== "/api/trading") return null;

  try {
    // ---------------------------------------------------------------- auth
    if (path === "/api/trading/auth/status" && request.method === "GET") {
      const session = currentSession(request);
      return json({
        authRequired: authRequired(),
        authenticated: session !== null,
        role: session?.role ?? null,
        // O CSRF só existe para quem JÁ provou a sessão — não é credencial.
        csrf: session?.csrf ?? null,
      });
    }

    if (path === "/api/trading/auth/login" && request.method === "POST") {
      const violation = sameOriginViolation(request);
      if (violation) return json({ error: violation }, 403);
      if (loginRateLimited(request)) {
        return json({ error: "Muitas tentativas. Aguarde um minuto." }, 429);
      }
      if (!authRequired()) {
        return json(
          {
            error:
              "Nenhum token configurado no servidor. Defina OPERATOR_TOKEN (ou ADMIN_TOKEN) no .env para habilitar a autenticação.",
          },
          503,
        );
      }
      const payload = await body<{ token?: string }>(request);
      const role = payload.token ? resolveRole(payload.token) : null;
      if (!role) return json({ error: "Token inválido." }, 401);
      const { value, session } = createSessionCookieValue(role);
      return json({ ok: true, role, csrf: session.csrf, expiresAt: session.expiresAt }, 200, {
        "set-cookie": sessionCookieHeader(request, value),
      });
    }

    if (path === "/api/trading/auth/logout" && request.method === "POST") {
      return json({ ok: true }, 200, { "set-cookie": sessionCookieHeader(request, null) });
    }

    // ------------------------------------------------------- porteiro geral
    if (request.method !== "GET") {
      const isAdminPath = ADMIN_PATHS.has(path);
      if (isAdminPath || WRITE_PATHS.has(path)) {
        const denied = authorizeWrite(request, { requireAdmin: isAdminPath });
        if (denied) return json({ error: denied.error }, denied.status);
      } else {
        // Rota de escrita desconhecida: nega por padrão em vez de cair no 404
        // depois de já ter executado algo.
        return json({ error: "Endpoint de persistência não encontrado." }, 404);
      }
    }

    // -------------------------------------------------------------- leitura
    if (request.method === "GET" && path === "/api/trading/snapshot") {
      return json({ ...getSnapshot(), database: databaseInfo() });
    }
    if (request.method === "GET" && path === "/api/trading/technique-current") {
      return json({ technique: getProductionTechnique() });
    }
    if (request.method === "GET" && path === "/api/trading/technique-history") {
      return json({ history: techniqueHistory() });
    }
    if (request.method === "GET" && path === "/api/trading/technique-candidates") {
      return json({ candidates: listTechniqueCandidates() });
    }

    // -------------------------------------------------------------- escrita
    if (request.method === "POST" && path === "/api/trading/technique-candidates") {
      upsertTechniqueCandidate(await body(request));
      return json({ ok: true });
    }
    if (request.method === "POST" && path === "/api/trading/technique-promote") {
      const payload = await body<{ candidateId?: string; notes?: string }>(request);
      if (!payload.candidateId) return json({ error: "candidateId é obrigatório." }, 400);
      const session = currentSession(request);
      return json({
        ok: true,
        technique: promoteTechniqueCandidate(payload.candidateId, {
          actor: session?.role ?? "local",
          notes: payload.notes ?? null,
        }),
      });
    }
    if (request.method === "POST" && path === "/api/trading/technique-rollback") {
      const payload = await body<{ version?: string; reason?: string }>(request);
      if (!payload.version) return json({ error: "version é obrigatório." }, 400);
      if (!payload.reason?.trim()) {
        return json({ error: "reason é obrigatório para a auditoria do rollback." }, 400);
      }
      const session = currentSession(request);
      return json({
        ok: true,
        technique: rollbackTechnique({
          version: payload.version,
          reason: payload.reason,
          actor: session?.role ?? "local",
        }),
      });
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
