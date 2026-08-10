/**
 * ALERTA VISUAL "ENTRADA CONFIRMADA" (comando gerenciamento §5).
 *
 * O overlay grande sobre o preview do Profit dispara EXATAMENTE uma vez por
 * signalId — no primeiro instante da confirmação — nunca por frame nem por
 * re-render. O dedupe é de módulo (sobrevive a troca de rota) e é o mesmo
 * princípio do som único por signalId.
 */

const shown = new Set<string>();

/** true somente na PRIMEIRA chamada para este signalId. */
export function shouldShowConfirmationOverlay(signalId: string | null | undefined): boolean {
  if (!signalId) return false;
  if (shown.has(signalId)) return false;
  shown.add(signalId);
  return true;
}

/** Já disparou para este sinal? (consulta sem consumir) */
export function overlayAlreadyShown(signalId: string): boolean {
  return shown.has(signalId);
}

/** Exposto para testes unitários. */
export function resetOverlayGateForTests(): void {
  shown.clear();
}

/** Tempo padrão de exibição do alerta central (fechável manualmente). */
export const CONFIRMATION_OVERLAY_MS = 6_000;

/**
 * MOTIVO DE PAUSA DA ANÁLISE (comando ao-vivo §4): quando a stream para,
 * minimiza ou degrada, o preview mostra o motivo real — nunca congela mudo.
 */
export function captureDegradationReason(state: {
  status: "sem-fonte" | "aguardando-confirmacao" | "capturando" | "pausado";
  error: string | null;
  lastFrameAt: number | null;
  now?: number;
}): string | null {
  if (state.status === "sem-fonte") {
    return state.error ?? "Nenhuma janela do Profit selecionada — análise pausada.";
  }
  if (state.status === "aguardando-confirmacao") {
    return "Confirme a janela selecionada para iniciar a leitura.";
  }
  if (state.status === "pausado") {
    return state.error ?? "Captura pausada — análise pausada.";
  }
  // Capturando, mas sem frame novo há mais de 5 s = stream degradada
  // (janela minimizada em alguns SOs continua "ativa" sem fornecer frames).
  const now = state.now ?? Date.now();
  if (state.lastFrameAt !== null && now - state.lastFrameAt > 5_000) {
    return "A janela parou de fornecer frames (minimizada/oculta?) — análise pausada até novos frames.";
  }
  return null;
}
