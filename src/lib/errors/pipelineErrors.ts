import { reportError, type ClientErrorSource } from "./errorReporter";

/**
 * CLASSIFICAÇÃO DE ERROS DO PIPELINE (comando ao-vivo §2).
 *
 * Um timeout da IA durante o OCR do chartClock NÃO é um erro de CHART_CLOCK:
 * o relógio do gráfico continua legível — quem falhou foi o provedor de IA.
 * Antes desta correção, "A IA não respondeu em Xs" aparecia na Central de
 * Erros como CHART_CLOCK (duplicado), escondendo a causa real.
 *
 * Regras:
 * - timeout/aborto/indisponibilidade da IA → source OLLAMA, código AI_TIMEOUT;
 * - demais falhas mantêm o source da etapa, com código derivado da etapa;
 * - dedupe por sessão+código (não por mensagem): variações do mesmo timeout
 *   ("em 120s", "em 300s") não viram N erros distintos;
 * - recuperação emite um INFO único e reabre o dedupe — o próximo erro real
 *   volta a ser reportado.
 */

const AI_TIMEOUT_PATTERNS: RegExp[] = [
  /não respondeu/i,
  /timeout/i,
  /timed?\s*out/i,
  /abort/i,
  /AI_TIMEOUT_MS/i,
  /OLLAMA_TIMEOUT_MS/i,
];

const AI_UNAVAILABLE_PATTERNS: RegExp[] = [
  /circuito aberto/i,
  /fetch failed/i,
  /ECONNREFUSED/i,
  /indispon[ií]vel/i,
];

export interface ClassifiedPipelineError {
  source: ClientErrorSource;
  code: string;
}

/** Timeout/aborto da IA — a mensagem vem de describeAIError ou de exceções fetch. */
export function isAITimeoutMessage(message: string): boolean {
  return AI_TIMEOUT_PATTERNS.some((pattern) => pattern.test(message));
}

export function classifyPipelineError(
  stage: ClientErrorSource,
  message: string,
): ClassifiedPipelineError {
  if (isAITimeoutMessage(message)) return { source: "OLLAMA", code: "AI_TIMEOUT" };
  if (AI_UNAVAILABLE_PATTERNS.some((pattern) => pattern.test(message))) {
    return { source: "OLLAMA", code: "AI_UNAVAILABLE" };
  }
  return { source: stage, code: `${stage}_READ` };
}

type Reporter = typeof reportError;

/**
 * Porteiro com dedupe por sessão+código e evento único de recuperação.
 * Reset de sessão = novo espaço de dedupe (o Map é chaveado pela sessão).
 */
export class PipelineErrorGate {
  private active = new Map<string, { source: ClientErrorSource; code: string; count: number }>();

  constructor(private readonly reporter: Reporter = reportError) {}

  private key(sessionId: string | null | undefined, code: string): string {
    return `${sessionId ?? "global"}|${code}`;
  }

  /** Reporta uma única vez por sessão+código até a recuperação correspondente. */
  reportOnce(
    stage: ClientErrorSource,
    message: string,
    options?: {
      sessionId?: string | null;
      severity?: "INFO" | "WARNING" | "ERROR" | "CRITICAL";
      context?: unknown;
    },
  ): ClassifiedPipelineError & { reported: boolean } {
    const classified = classifyPipelineError(stage, message);
    const key = this.key(options?.sessionId, classified.code);
    const existing = this.active.get(key);
    if (existing) {
      existing.count++;
      return { ...classified, reported: false };
    }
    this.active.set(key, { ...classified, count: 1 });
    this.reporter(classified.source, message, {
      severity: options?.severity ?? "WARNING",
      sessionId: options?.sessionId ?? null,
      context: {
        code: classified.code,
        stage,
        ...(options?.context ? { extra: options.context } : {}),
      },
    });
    return { ...classified, reported: true };
  }

  /**
   * Etapa voltou a funcionar: limpa o dedupe da sessão e, se havia erro ativo,
   * emite UM INFO de recuperação (o aviso não fica "pendurado" para sempre).
   */
  recover(sessionId: string | null | undefined, message: string): boolean {
    const prefix = `${sessionId ?? "global"}|`;
    const recovered: string[] = [];
    let source: ClientErrorSource | null = null;
    for (const [key, value] of this.active) {
      if (!key.startsWith(prefix)) continue;
      recovered.push(`${value.code}×${value.count}`);
      source = source ?? value.source;
      this.active.delete(key);
    }
    if (recovered.length === 0) return false;
    this.reporter(source ?? "T4", message, {
      severity: "INFO",
      sessionId: sessionId ?? null,
      context: { recovered },
    });
    return true;
  }

  /** Sessão encerrada/trocada: zera o dedupe sem emitir nada. */
  reset(): void {
    this.active.clear();
  }

  /** Exposto para testes. */
  activeCodes(sessionId?: string | null): string[] {
    const prefix = `${sessionId ?? "global"}|`;
    return [...this.active.keys()]
      .filter((key) => key.startsWith(prefix))
      .map((key) => key.slice(prefix.length));
  }
}
