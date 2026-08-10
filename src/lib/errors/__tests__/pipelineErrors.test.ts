import { describe, expect, it, vi } from "vitest";

import { PipelineErrorGate, classifyPipelineError, isAITimeoutMessage } from "../pipelineErrors";

describe("classificação de erros do pipeline (comando ao-vivo §2)", () => {
  it("timeout da IA no OCR do relógio vira AI_TIMEOUT (OLLAMA), nunca CHART_CLOCK", () => {
    const timeoutMessage =
      "A IA não respondeu em 300s. Ajuste OLLAMA_TIMEOUT_MS/AI_TIMEOUT_MS ou verifique o provedor.";
    expect(isAITimeoutMessage(timeoutMessage)).toBe(true);
    const classified = classifyPipelineError("CHART_CLOCK", timeoutMessage);
    expect(classified.source).toBe("OLLAMA");
    expect(classified.code).toBe("AI_TIMEOUT");
  });

  it("variações da mensagem de timeout classificam igual (120s vs 300s, TimeoutError)", () => {
    expect(classifyPipelineError("CHART_CLOCK", "A IA não respondeu em 120s.").code).toBe(
      "AI_TIMEOUT",
    );
    expect(classifyPipelineError("OCR", "TimeoutError: request timed out").code).toBe("AI_TIMEOUT");
  });

  it("falha REAL de leitura do relógio mantém a fonte CHART_CLOCK", () => {
    const classified = classifyPipelineError(
      "CHART_CLOCK",
      "Nenhum horário legível na faixa de tempo.",
    );
    expect(classified.source).toBe("CHART_CLOCK");
    expect(classified.code).toBe("CHART_CLOCK_READ");
  });

  it("IA indisponível (circuito/conexão) vira AI_UNAVAILABLE (OLLAMA)", () => {
    expect(classifyPipelineError("CHART_CLOCK", "fetch failed").code).toBe("AI_UNAVAILABLE");
    expect(classifyPipelineError("CHART_CLOCK", "fetch failed").source).toBe("OLLAMA");
  });
});

describe("PipelineErrorGate — dedupe por sessão+código e recuperação", () => {
  it("reporta UMA vez por sessão+código; repetições não duplicam (o bug ×2)", () => {
    const reporter = vi.fn();
    const gate = new PipelineErrorGate(reporter);
    const first = gate.reportOnce("CHART_CLOCK", "A IA não respondeu em 120s.", {
      sessionId: "s1",
    });
    const second = gate.reportOnce("CHART_CLOCK", "A IA não respondeu em 300s.", {
      sessionId: "s1",
    });
    expect(first.reported).toBe(true);
    expect(second.reported).toBe(false);
    expect(reporter).toHaveBeenCalledTimes(1);
    expect(reporter).toHaveBeenCalledWith(
      "OLLAMA",
      expect.stringContaining("não respondeu"),
      expect.objectContaining({ sessionId: "s1" }),
    );
  });

  it("sessões diferentes têm dedupe independente", () => {
    const reporter = vi.fn();
    const gate = new PipelineErrorGate(reporter);
    gate.reportOnce("CHART_CLOCK", "timeout", { sessionId: "s1" });
    gate.reportOnce("CHART_CLOCK", "timeout", { sessionId: "s2" });
    expect(reporter).toHaveBeenCalledTimes(2);
  });

  it("códigos diferentes na mesma sessão são reportados separadamente", () => {
    const reporter = vi.fn();
    const gate = new PipelineErrorGate(reporter);
    gate.reportOnce("CHART_CLOCK", "A IA não respondeu em 120s.", { sessionId: "s1" });
    gate.reportOnce("CHART_CLOCK", "Faixa de tempo ilegível.", { sessionId: "s1" });
    expect(reporter).toHaveBeenCalledTimes(2);
    expect(gate.activeCodes("s1").sort()).toEqual(["AI_TIMEOUT", "CHART_CLOCK_READ"]);
  });

  it("recuperação emite UM INFO, limpa o aviso e reabre o dedupe", () => {
    const reporter = vi.fn();
    const gate = new PipelineErrorGate(reporter);
    gate.reportOnce("CHART_CLOCK", "A IA não respondeu em 120s.", { sessionId: "s1" });
    expect(gate.recover("s1", "chartClock recuperado")).toBe(true);
    expect(reporter).toHaveBeenLastCalledWith(
      "OLLAMA",
      "chartClock recuperado",
      expect.objectContaining({ severity: "INFO" }),
    );
    // Sem erro ativo, recuperar de novo não emite nada.
    expect(gate.recover("s1", "chartClock recuperado")).toBe(false);
    // Um novo erro depois da recuperação volta a ser reportado.
    const again = gate.reportOnce("CHART_CLOCK", "A IA não respondeu em 120s.", {
      sessionId: "s1",
    });
    expect(again.reported).toBe(true);
  });

  it("o código e a etapa original viajam no contexto do reporte", () => {
    const reporter = vi.fn();
    const gate = new PipelineErrorGate(reporter);
    gate.reportOnce("CHART_CLOCK", "A IA não respondeu em 120s.", { sessionId: "s1" });
    const context = (reporter.mock.calls[0]![2] as { context: { code: string; stage: string } })
      .context;
    expect(context.code).toBe("AI_TIMEOUT");
    expect(context.stage).toBe("CHART_CLOCK");
  });
});
