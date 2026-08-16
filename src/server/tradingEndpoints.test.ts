import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { BacktestRecord } from "@/lib/storage";
import { handleTradingRequest } from "./tradingEndpoints";
import { getSnapshot, resetTradingRepositoryForTests } from "./tradingRepository";
import { resetTradingAuthRateLimitForTests } from "./tradingAuth";

/**
 * TESTES DE INTEGRAÇÃO REAIS da superfície HTTP: o handler verdadeiro contra o
 * SQLite verdadeiro. Nada é mockado — quando o teste diz que a escrita foi
 * bloqueada, ele confere no BANCO que nada entrou.
 */

const HOST = "analisador.local";
let workingDir: string | null = null;

function freshDatabase(): void {
  resetTradingRepositoryForTests();
  const dir = mkdtempSync(join(tmpdir(), "t4-http-"));
  workingDir = dir;
  process.env.DATA_DIR = dir;
  delete process.env.DATABASE_PATH;
}

function request(
  path: string,
  init: {
    method?: string;
    payload?: unknown;
    cookie?: string | null;
    csrf?: string | null;
    origin?: string | null;
    headers?: Record<string, string>;
  } = {},
): Request {
  const headers = new Headers({ host: HOST, ...(init.headers ?? {}) });
  if (init.payload !== undefined) headers.set("content-type", "application/json");
  if (init.cookie) headers.set("cookie", init.cookie);
  if (init.csrf) headers.set("x-t4-csrf", init.csrf);
  if (init.origin) headers.set("origin", init.origin);
  return new Request(`http://${HOST}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.payload === undefined ? undefined : JSON.stringify(init.payload),
  });
}

function backtestPayload(id: string): BacktestRecord {
  return {
    id,
    strategyVersion: "T4.0.0",
    asset: "WINFUT",
    timeframe: "1m",
    createdAt: 1_700_000_000_000,
    sourceCaptureId: `cap_${id}`,
    origin: "VIDEO_REPLAY",
    trades: [],
  } as unknown as BacktestRecord;
}

/** Autentica de verdade pelo endpoint e devolve cookie + csrf da sessão. */
async function login(token: string): Promise<{ cookie: string; csrf: string }> {
  const response = await handleTradingRequest(
    request("/api/trading/auth/login", {
      method: "POST",
      payload: { token },
      origin: `http://${HOST}`,
    }),
  );
  expect(response?.status).toBe(200);
  const setCookie = response!.headers.get("set-cookie")!;
  const payload = (await response!.json()) as { csrf: string };
  return { cookie: setCookie.split(";")[0]!, csrf: payload.csrf };
}

beforeEach(() => {
  freshDatabase();
  resetTradingAuthRateLimitForTests();
  process.env.OPERATOR_TOKEN = "operador-forte";
  process.env.ADMIN_TOKEN = "admin-forte";
});

afterEach(() => {
  resetTradingRepositoryForTests();
  if (workingDir) rmSync(workingDir, { recursive: true, force: true });
  workingDir = null;
  delete process.env.DATA_DIR;
  delete process.env.DATABASE_PATH;
  delete process.env.OPERATOR_TOKEN;
  delete process.env.ADMIN_TOKEN;
  delete process.env.TRADING_SESSION_SECRET;
});

describe.sequential("escrita de trading exige autorização", () => {
  it("POST /backtests sem sessão devolve 401 e NÃO altera o banco", async () => {
    const before = getSnapshot().backtests.length;
    const response = await handleTradingRequest(
      request("/api/trading/backtests", { method: "POST", payload: backtestPayload("forjado_1") }),
    );
    expect(response?.status).toBe(401);
    // A prova que importa: o banco continua igual.
    expect(getSnapshot().backtests.length).toBe(before);
    expect(getSnapshot().backtests.find((item) => item.id === "forjado_1")).toBeUndefined();
  });

  it("evidência FALSA de terceiro não entra na base que autoriza entradas", async () => {
    // O decide() só considera trades vindos de store.backtests(); se o
    // atacante não consegue gravar, não consegue fabricar evidência.
    for (const path of ["/api/trading/backtests", "/api/trading/replay-batch"]) {
      const response = await handleTradingRequest(
        request(path, { method: "POST", payload: backtestPayload("evidencia_falsa") }),
      );
      expect(response?.status).toBe(401);
    }
    expect(getSnapshot().backtests).toHaveLength(0);
  });

  it("credencial inválida devolve 401 e não cria sessão", async () => {
    const response = await handleTradingRequest(
      request("/api/trading/auth/login", {
        method: "POST",
        payload: { token: "errado" },
        origin: `http://${HOST}`,
      }),
    );
    expect(response?.status).toBe(401);
    expect(response!.headers.get("set-cookie")).toBeNull();
  });

  it("operador autenticado grava normalmente", async () => {
    const { cookie, csrf } = await login("operador-forte");
    const response = await handleTradingRequest(
      request("/api/trading/backtests", {
        method: "POST",
        payload: backtestPayload("legitimo_1"),
        cookie,
        csrf,
        origin: `http://${HOST}`,
      }),
    );
    expect(response?.status).toBe(200);
    expect(getSnapshot().backtests.find((item) => item.id === "legitimo_1")).toBeDefined();
  });

  it("sessão válida SEM header CSRF é recusada com 403", async () => {
    const { cookie } = await login("operador-forte");
    const response = await handleTradingRequest(
      request("/api/trading/backtests", {
        method: "POST",
        payload: backtestPayload("sem_csrf"),
        cookie,
        origin: `http://${HOST}`,
      }),
    );
    expect(response?.status).toBe(403);
    expect(getSnapshot().backtests).toHaveLength(0);
  });

  it("cookie adulterado é rejeitado (assinatura HMAC)", async () => {
    const { cookie, csrf } = await login("operador-forte");
    const forged = `${cookie.slice(0, -3)}xyz`;
    const response = await handleTradingRequest(
      request("/api/trading/backtests", {
        method: "POST",
        payload: backtestPayload("adulterado"),
        cookie: forged,
        csrf,
        origin: `http://${HOST}`,
      }),
    );
    expect(response?.status).toBe(401);
    expect(getSnapshot().backtests).toHaveLength(0);
  });

  it("todas as rotas de escrita estão cobertas — nenhuma sobrou anônima", async () => {
    const writePaths = [
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
      "/api/trading/technique-promote",
      "/api/trading/technique-rollback",
    ];
    for (const path of writePaths) {
      const response = await handleTradingRequest(request(path, { method: "POST", payload: {} }));
      expect([401, 403], `${path} deveria exigir autorização`).toContain(response!.status);
    }
  });
});

describe.sequential("origem cruzada (CORS/CSRF)", () => {
  it("origem diferente do host é bloqueada com 403 mesmo com sessão válida", async () => {
    const { cookie, csrf } = await login("operador-forte");
    const response = await handleTradingRequest(
      request("/api/trading/backtests", {
        method: "POST",
        payload: backtestPayload("cross_origin"),
        cookie,
        csrf,
        origin: "https://site-malicioso.example",
      }),
    );
    expect(response?.status).toBe(403);
    expect(getSnapshot().backtests).toHaveLength(0);
  });

  it("sec-fetch-site cross-site é bloqueado", async () => {
    const { cookie, csrf } = await login("operador-forte");
    const response = await handleTradingRequest(
      request("/api/trading/backtests", {
        method: "POST",
        payload: backtestPayload("cross_site"),
        cookie,
        csrf,
        headers: { "sec-fetch-site": "cross-site" },
      }),
    );
    expect(response?.status).toBe(403);
  });

  it("nenhuma resposta libera CORS para terceiros", async () => {
    const response = await handleTradingRequest(request("/api/trading/snapshot"));
    expect(response!.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe.sequential("leitura autenticada × escrita protegida", () => {
  it("com token configurado, GETs de dados exigem sessão (401 sem ela)", async () => {
    for (const path of [
      "/api/trading/snapshot",
      "/api/trading/technique-current",
      "/api/trading/technique-candidates",
      "/api/trading/technique-history",
    ]) {
      const response = await handleTradingRequest(request(path));
      expect(response?.status, path).toBe(401);
    }
  });

  it("GETs de dados funcionam para o operador autenticado (sem exigir CSRF)", async () => {
    const { cookie } = await login("operador-forte");
    for (const path of [
      "/api/trading/snapshot",
      "/api/trading/technique-current",
      "/api/trading/technique-candidates",
      "/api/trading/technique-history",
    ]) {
      const response = await handleTradingRequest(request(path, { cookie }));
      expect(response?.status, path).toBe(200);
    }
  });

  it("sem token configurado, GET local continua aberto (modo desktop)", async () => {
    delete process.env.OPERATOR_TOKEN;
    delete process.env.ADMIN_TOKEN;
    const response = await handleTradingRequest(request("/api/trading/snapshot"));
    // host analisador.local sem token: authRequired=false → leitura liberada.
    expect(response?.status).toBe(200);
  });

  it("status de auth informa que a credencial é exigida, sem vazá-la", async () => {
    const response = await handleTradingRequest(request("/api/trading/auth/status"));
    const payload = (await response!.json()) as Record<string, unknown>;
    expect(payload.authRequired).toBe(true);
    expect(payload.authenticated).toBe(false);
    expect(JSON.stringify(payload)).not.toContain("operador-forte");
    expect(JSON.stringify(payload)).not.toContain("admin-forte");
  });

  it("cookie é HttpOnly, SameSite=Strict e não carrega o token", async () => {
    const response = await handleTradingRequest(
      request("/api/trading/auth/login", {
        method: "POST",
        payload: { token: "operador-forte" },
        origin: `http://${HOST}`,
      }),
    );
    const cookie = response!.headers.get("set-cookie")!;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).not.toContain("operador-forte");
  });
});

describe.sequential("promoção e rollback exigem ADMIN", () => {
  it("sessão de OPERADOR não promove técnica (403)", async () => {
    const { cookie, csrf } = await login("operador-forte");
    const response = await handleTradingRequest(
      request("/api/trading/technique-promote", {
        method: "POST",
        payload: { candidateId: "qualquer" },
        cookie,
        csrf,
        origin: `http://${HOST}`,
      }),
    );
    expect(response?.status).toBe(403);
  });

  it("sessão ADMIN promove e o rollback exige motivo", async () => {
    const admin = await login("admin-forte");
    await handleTradingRequest(
      request("/api/trading/technique-candidates", {
        method: "POST",
        payload: {
          id: "cand_http",
          version: "T4.10.0",
          baseVersion: "T4.0.0",
          hypothesis: "teste http",
          status: "VALIDATED",
          rules: { marker: "http" },
          createdAt: 1,
          updatedAt: 1,
        },
        cookie: admin.cookie,
        csrf: admin.csrf,
        origin: `http://${HOST}`,
      }),
    );
    const promoted = await handleTradingRequest(
      request("/api/trading/technique-promote", {
        method: "POST",
        payload: { candidateId: "cand_http" },
        cookie: admin.cookie,
        csrf: admin.csrf,
        origin: `http://${HOST}`,
      }),
    );
    expect(promoted?.status).toBe(200);
    const body = (await promoted!.json()) as { technique: { version: string } };
    expect(body.technique.version).toBe("T4.10.0");

    const semMotivo = await handleTradingRequest(
      request("/api/trading/technique-rollback", {
        method: "POST",
        payload: { version: "T4.0.0" },
        cookie: admin.cookie,
        csrf: admin.csrf,
        origin: `http://${HOST}`,
      }),
    );
    expect(semMotivo?.status).toBe(400);
  });
});

describe.sequential("instalação sem token configurado", () => {
  it("escrita remota é bloqueada mesmo sem credencial definida", async () => {
    delete process.env.OPERATOR_TOKEN;
    delete process.env.ADMIN_TOKEN;
    const response = await handleTradingRequest(
      request("/api/trading/backtests", {
        method: "POST",
        payload: backtestPayload("remoto"),
        headers: { "x-forwarded-for": "203.0.113.10" },
      }),
    );
    expect(response?.status).toBe(401);
    expect(getSnapshot().backtests).toHaveLength(0);
  });

  it("escrita local (loopback) continua funcionando para uso em desktop", async () => {
    delete process.env.OPERATOR_TOKEN;
    delete process.env.ADMIN_TOKEN;
    const local = new Request("http://localhost:8081/api/trading/backtests", {
      method: "POST",
      headers: { host: "localhost:8081", "content-type": "application/json" },
      body: JSON.stringify(backtestPayload("local_1")),
    });
    const response = await handleTradingRequest(local);
    expect(response?.status).toBe(200);
    expect(getSnapshot().backtests.find((item) => item.id === "local_1")).toBeDefined();
  });
});
