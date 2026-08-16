import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { handleRecordingRequest } from "./recordingEndpoints";
import { handleTradingRequest } from "./tradingEndpoints";
import { getRecordingStatus } from "./recordingRepository";
import { resetTradingRepositoryForTests } from "./tradingRepository";
import { resetTradingAuthRateLimitForTests } from "./tradingAuth";

/**
 * A API de gravação usa a MESMA autorização do trading: sem sessão, um cliente
 * externo não pode criar sessões de gravação nem despejar chunks binários no
 * disco da VPS (vetor de flood).
 */

const HOST = "analisador.local";
let workingDir: string | null = null;

function freshDatabase(): void {
  resetTradingRepositoryForTests();
  const dir = mkdtempSync(join(tmpdir(), "t4-rec-http-"));
  workingDir = dir;
  process.env.DATA_DIR = dir;
  delete process.env.DATABASE_PATH;
}

function request(
  path: string,
  init: {
    method?: string;
    payload?: unknown;
    binary?: Uint8Array;
    cookie?: string | null;
    csrf?: string | null;
    origin?: string | null;
  } = {},
): Request {
  const headers = new Headers({ host: HOST });
  if (init.payload !== undefined) headers.set("content-type", "application/json");
  if (init.binary) headers.set("content-type", "application/octet-stream");
  if (init.cookie) headers.set("cookie", init.cookie);
  if (init.csrf) headers.set("x-t4-csrf", init.csrf);
  if (init.origin) headers.set("origin", init.origin);
  return new Request(`http://${HOST}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.binary
      ? (init.binary.slice().buffer as ArrayBuffer)
      : init.payload === undefined
        ? undefined
        : JSON.stringify(init.payload),
  });
}

async function login(token: string): Promise<{ cookie: string; csrf: string }> {
  const response = await handleTradingRequest(
    new Request(`http://${HOST}/api/trading/auth/login`, {
      method: "POST",
      headers: { host: HOST, "content-type": "application/json", origin: `http://${HOST}` },
      body: JSON.stringify({ token }),
    }),
  );
  expect(response?.status).toBe(200);
  const payload = (await response!.json()) as { csrf: string };
  return { cookie: response!.headers.get("set-cookie")!.split(";")[0]!, csrf: payload.csrf };
}

beforeEach(() => {
  freshDatabase();
  resetTradingAuthRateLimitForTests();
  process.env.OPERATOR_TOKEN = "operador-forte";
});

afterEach(() => {
  resetTradingRepositoryForTests();
  if (workingDir) rmSync(workingDir, { recursive: true, force: true });
  workingDir = null;
  delete process.env.DATA_DIR;
  delete process.env.DATABASE_PATH;
  delete process.env.OPERATOR_TOKEN;
  delete process.env.ADMIN_TOKEN;
});

describe.sequential("gravação exige a mesma sessão do trading", () => {
  it("criar sessão de gravação sem autenticação = 401 e nada no banco", async () => {
    const response = await handleRecordingRequest(
      request("/api/recording/sessions", {
        method: "POST",
        payload: { sessionId: "rec_forjada", startedAt: 1 },
      }),
    );
    expect(response?.status).toBe(401);
    expect(getRecordingStatus("rec_forjada")).toBeNull();
  });

  it("chunk binário anônimo = 401 (nenhum byte vai para o disco)", async () => {
    const response = await handleRecordingRequest(
      request("/api/recording/chunks?sessionId=rec_x&index=0", {
        method: "POST",
        binary: new Uint8Array([1, 2, 3, 4]),
      }),
    );
    expect(response?.status).toBe(401);
  });

  it("operador autenticado grava sessão + chunk e o status reflete", async () => {
    const { cookie, csrf } = await login("operador-forte");
    const created = await handleRecordingRequest(
      request("/api/recording/sessions", {
        method: "POST",
        payload: { sessionId: "rec_ok", startedAt: 1 },
        cookie,
        csrf,
        origin: `http://${HOST}`,
      }),
    );
    expect(created?.status).toBe(200);
    const chunk = await handleRecordingRequest(
      request("/api/recording/chunks?sessionId=rec_ok&index=0&segment=0&startedAt=1&endedAt=2", {
        method: "POST",
        binary: new Uint8Array([9, 9, 9]),
        cookie,
        csrf,
        origin: `http://${HOST}`,
      }),
    );
    expect(chunk?.status).toBe(200);
    const status = await handleRecordingRequest(
      request("/api/recording/status/rec_ok", { cookie }),
    );
    expect(status?.status).toBe(200);
    const payload = (await status!.json()) as { chunksSaved: number };
    expect(payload.chunksSaved).toBe(1);
  });

  it("status (leitura) sem sessão também é negado com token configurado", async () => {
    const response = await handleRecordingRequest(request("/api/recording/status/qualquer"));
    expect(response?.status).toBe(401);
  });
});
