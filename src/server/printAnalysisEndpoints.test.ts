import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { handlePrintAnalysisRequest } from "./printAnalysisEndpoints";
import { resetPrintAnalysisMigrationForTests } from "./printAnalysisRepository";
import { resetTradingRepositoryForTests } from "./tradingRepository";

/**
 * TESTES DE INTEGRAÇÃO REAIS: handler verdadeiro contra SQLite verdadeiro.
 *
 * O provedor de IA é o único ponto substituído — por `fetch`, no limite do
 * processo — porque não há Ollama nesta máquina. Tudo o que o sistema faz com
 * a resposta (extração, validação, saneamento, persistência, erro controlado)
 * roda de verdade.
 */

const HOST = "localhost";
// PNG 1×1 real — base64 válido, formato aceito.
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

let workingDir: string | null = null;
const originalFetch = globalThis.fetch;

function freshDatabase(): void {
  resetTradingRepositoryForTests();
  resetPrintAnalysisMigrationForTests();
  const dir = mkdtempSync(join(tmpdir(), "t4-print-"));
  workingDir = dir;
  process.env.DATA_DIR = dir;
  delete process.env.DATABASE_PATH;
}

function request(path: string, init: { method?: string; payload?: unknown } = {}): Request {
  const headers = new Headers({ host: HOST, origin: `http://${HOST}` });
  if (init.payload !== undefined) headers.set("content-type", "application/json");
  return new Request(`http://${HOST}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.payload === undefined ? undefined : JSON.stringify(init.payload),
  });
}

/** Responde como o Ollama responderia, com o conteúdo dado. */
function mockAI(...contents: string[]): void {
  let call = 0;
  globalThis.fetch = vi.fn(async () => {
    const content = contents[Math.min(call++, contents.length - 1)] ?? "";
    return new Response(JSON.stringify({ message: { content } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

const VALID_ANALYSIS = JSON.stringify({
  status: "PRE_ENTRADA",
  direction: "COMPRA",
  confidence: 82,
  symbol: "WIN",
  timeframe: "5m",
  entry: { value: 141385, visible: true },
  stop: { value: 141250, visible: true },
  targets: [{ value: 141470, visible: true }],
  explanation: "Pullback ao POI depois de rompimento com força.",
  annotations: [
    {
      id: "e1",
      role: "ENTRY",
      shape: "LINE",
      x1: 0.1,
      y1: 0.4,
      x2: 0.95,
      y2: 0.4,
      label: "Entrada",
    },
    { id: "p1", role: "T4_PAST", shape: "MARKER", x1: 0.3, y1: 0.6, x2: 0.3, y2: 0.6, label: "T4" },
  ],
  pastT4Count: 1,
});

beforeEach(() => {
  freshDatabase();
  delete process.env.OPERATOR_TOKEN;
  delete process.env.ADMIN_TOKEN;
  process.env.OLLAMA_BASE_URL = "http://127.0.0.1:11435";
  process.env.OLLAMA_VISION_MODEL = "qwen3.5:35b";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  if (workingDir) rmSync(workingDir, { recursive: true, force: true });
  workingDir = null;
});

describe("status da análise por print", () => {
  it("informa disponível quando há base e modelo visual", async () => {
    const response = await handlePrintAnalysisRequest(request("/api/print-analysis/status"));
    const payload = (await response!.json()) as { available: boolean; model: string };
    expect(response!.status).toBe(200);
    expect(payload.available).toBe(true);
    expect(payload.model).toBe("qwen3.5:35b");
  });

  it("informa INDISPONÍVEL e o motivo quando não há modelo visual", async () => {
    delete process.env.OLLAMA_VISION_MODEL;
    delete process.env.AI_VISION_MODEL;
    const response = await handlePrintAnalysisRequest(request("/api/print-analysis/status"));
    const payload = (await response!.json()) as { available: boolean; reason: string };
    expect(payload.available).toBe(false);
    expect(payload.reason).toContain("multimodal");
  });
});

describe("análise", () => {
  it("recusa arquivo que não é imagem aceita", async () => {
    const response = await handlePrintAnalysisRequest(
      request("/api/print-analysis/analyze", {
        method: "POST",
        payload: { imageDataUrl: "data:application/pdf;base64,QUJD" },
      }),
    );
    expect(response!.status).toBe(400);
  });

  it("recusa imagem acima do limite de tamanho", async () => {
    const huge = `data:image/png;base64,${"A".repeat(12 * 1024 * 1024)}`;
    const response = await handlePrintAnalysisRequest(
      request("/api/print-analysis/analyze", { method: "POST", payload: { imageDataUrl: huge } }),
    );
    expect(response!.status).toBe(413);
  });

  it("com IA fora do ar devolve 503 e NENHUMA análise inventada", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("fetch failed");
    }) as unknown as typeof fetch;
    const response = await handlePrintAnalysisRequest(
      request("/api/print-analysis/analyze", { method: "POST", payload: { imageDataUrl: PNG } }),
    );
    const payload = (await response!.json()) as { error: string; analysis?: unknown };
    expect(response!.status).toBe(503);
    expect(payload.analysis).toBeUndefined();
    expect(payload.error).toContain("conectar ao servidor de IA");
  });

  it("sem modelo visual configurado responde ANÁLISE IA INDISPONÍVEL", async () => {
    delete process.env.OLLAMA_VISION_MODEL;
    delete process.env.AI_VISION_MODEL;
    const response = await handlePrintAnalysisRequest(
      request("/api/print-analysis/analyze", { method: "POST", payload: { imageDataUrl: PNG } }),
    );
    const payload = (await response!.json()) as { error: string };
    expect(response!.status).toBe(503);
    expect(payload.error).toContain("ANÁLISE IA INDISPONÍVEL");
  });

  it("JSON malformado nas DUAS tentativas vira erro controlado, não operação falsa", async () => {
    mockAI("isso não é json", "continua não sendo json");
    const response = await handlePrintAnalysisRequest(
      request("/api/print-analysis/analyze", { method: "POST", payload: { imageDataUrl: PNG } }),
    );
    const payload = (await response!.json()) as { error: string; analysis?: unknown };
    expect(response!.status).toBe(503);
    expect(payload.analysis).toBeUndefined();
  });

  it("JSON inválido na primeira e válido no reparo: aproveita e marca repaired", async () => {
    mockAI(JSON.stringify({ status: "INVENTADO", confidence: 999 }), VALID_ANALYSIS);
    const response = await handlePrintAnalysisRequest(
      request("/api/print-analysis/analyze", { method: "POST", payload: { imageDataUrl: PNG } }),
    );
    const payload = (await response!.json()) as { repaired: boolean; analysis: { status: string } };
    expect(response!.status).toBe(200);
    expect(payload.repaired).toBe(true);
    expect(payload.analysis.status).toBe("PRE_ENTRADA");
  });

  it("análise válida é devolvida, saneada e persistida", async () => {
    mockAI(VALID_ANALYSIS);
    const response = await handlePrintAnalysisRequest(
      request("/api/print-analysis/analyze", {
        method: "POST",
        payload: { imageDataUrl: PNG, width: 1920, height: 1080 },
      }),
    );
    const payload = (await response!.json()) as {
      id: string;
      persisted: boolean;
      analysis: { status: string; entry: { value: number }; pastT4Count: number };
    };
    expect(response!.status).toBe(200);
    expect(payload.persisted).toBe(true);
    expect(payload.analysis.entry.value).toBe(141385);
    expect(payload.analysis.pastT4Count).toBe(1);

    // O histórico enxerga o que foi gravado — no BANCO, não em memória.
    const history = await handlePrintAnalysisRequest(request("/api/print-analysis/history"));
    const list = (await history!.json()) as { analyses: Array<{ id: string; entry: number }> };
    expect(list.analyses).toHaveLength(1);
    expect(list.analyses[0]!.id).toBe(payload.id);
    expect(list.analyses[0]!.entry).toBe(141385);
  });

  it("números marcados como não visíveis NÃO são gravados como preço", async () => {
    mockAI(
      JSON.stringify({
        status: "PRE_ENTRADA",
        direction: "COMPRA",
        confidence: 60,
        explanation: "Escala de preço cortada.",
        entry: { value: 141385, visible: false },
        imageIssues: ["A escala de preço está cortada."],
      }),
    );
    const response = await handlePrintAnalysisRequest(
      request("/api/print-analysis/analyze", { method: "POST", payload: { imageDataUrl: PNG } }),
    );
    const payload = (await response!.json()) as { analysis: { entry: { value: number | null } } };
    expect(payload.analysis.entry.value).toBeNull();
  });
});

describe("histórico, feedback e chat", () => {
  async function createAnalysis(): Promise<string> {
    mockAI(VALID_ANALYSIS);
    const response = await handlePrintAnalysisRequest(
      request("/api/print-analysis/analyze", {
        method: "POST",
        payload: { imageDataUrl: PNG, width: 1280, height: 720 },
      }),
    );
    return ((await response!.json()) as { id: string }).id;
  }

  it("reabre uma análise gravada com o print original intacto", async () => {
    const id = await createAnalysis();
    const response = await handlePrintAnalysisRequest(request(`/api/print-analysis/history/${id}`));
    const record = (await response!.json()) as {
      imageDataUrl: string;
      imageWidth: number;
      analysis: { status: string };
    };
    expect(record.imageDataUrl).toBe(PNG);
    expect(record.imageWidth).toBe(1280);
    expect(record.analysis.status).toBe("PRE_ENTRADA");
  });

  it("grava feedback e o devolve na listagem", async () => {
    const id = await createAnalysis();
    const saved = await handlePrintAnalysisRequest(
      request("/api/print-analysis/feedback", {
        method: "POST",
        payload: {
          analysisId: id,
          correct: false,
          reasons: ["Stop errado"],
          comment: "muito curto",
        },
      }),
    );
    expect(saved!.status).toBe(200);

    const history = await handlePrintAnalysisRequest(request("/api/print-analysis/history"));
    const list = (await history!.json()) as {
      analyses: Array<{ feedback: { correct: boolean; reasons: string[] } | null }>;
    };
    expect(list.analyses[0]!.feedback?.correct).toBe(false);
    expect(list.analyses[0]!.feedback?.reasons).toEqual(["Stop errado"]);
  });

  it("feedback de análise inexistente responde 404", async () => {
    const response = await handlePrintAnalysisRequest(
      request("/api/print-analysis/feedback", {
        method: "POST",
        payload: { analysisId: "não-existe", correct: true },
      }),
    );
    expect(response!.status).toBe(404);
  });

  it("chat exige uma análise existente", async () => {
    const response = await handlePrintAnalysisRequest(
      request("/api/print-analysis/ask", {
        method: "POST",
        payload: { analysisId: "sumiu", question: "Por que essa entrada?" },
      }),
    );
    expect(response!.status).toBe(404);
  });

  it("chat responde usando a análise gravada", async () => {
    const id = await createAnalysis();
    mockAI("A entrada foi marcada no reteste do POI, com stop na perda da estrutura.");
    const response = await handlePrintAnalysisRequest(
      request("/api/print-analysis/ask", {
        method: "POST",
        payload: { analysisId: id, question: "Por que você marcou essa entrada?" },
      }),
    );
    const payload = (await response!.json()) as { answer: string };
    expect(response!.status).toBe(200);
    expect(payload.answer).toContain("reteste do POI");
  });

  it("pergunta vazia é recusada antes de gastar chamada de IA", async () => {
    const response = await handlePrintAnalysisRequest(
      request("/api/print-analysis/ask", { method: "POST", payload: { question: "   " } }),
    );
    expect(response!.status).toBe(400);
  });

  it("exclui a análise do histórico", async () => {
    const id = await createAnalysis();
    const removed = await handlePrintAnalysisRequest(
      request(`/api/print-analysis/history/${id}`, { method: "DELETE" }),
    );
    expect(removed!.status).toBe(200);
    const history = await handlePrintAnalysisRequest(request("/api/print-analysis/history"));
    const list = (await history!.json()) as { analyses: unknown[] };
    expect(list.analyses).toHaveLength(0);
  });

  it("rota de escrita desconhecida é negada, não cai em 404 depois de executar", async () => {
    const response = await handlePrintAnalysisRequest(
      request("/api/print-analysis/qualquer-coisa", { method: "POST", payload: {} }),
    );
    expect(response!.status).toBe(404);
  });
});

describe("porteiro de autenticação", () => {
  it("com token configurado, leitura remota anônima é bloqueada", async () => {
    process.env.OPERATOR_TOKEN = "segredo-forte";
    const remote = new Request(`http://${HOST}/api/print-analysis/history`, {
      headers: new Headers({ host: HOST, "x-forwarded-for": "203.0.113.10" }),
    });
    const response = await handlePrintAnalysisRequest(remote);
    expect(response!.status).toBe(401);
  });

  it("com token configurado, escrita remota anônima é bloqueada", async () => {
    process.env.OPERATOR_TOKEN = "segredo-forte";
    const remote = new Request(`http://${HOST}/api/print-analysis/analyze`, {
      method: "POST",
      headers: new Headers({
        host: HOST,
        origin: `http://${HOST}`,
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.10",
      }),
      body: JSON.stringify({ imageDataUrl: PNG }),
    });
    const response = await handlePrintAnalysisRequest(remote);
    expect([401, 403]).toContain(response!.status);
  });
});
