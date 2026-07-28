import { toast } from "sonner";

const CREDITS_URL = "https://lovable.dev/settings/plans";

export function isAiCreditsError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  return (
    msg.includes("créditos") ||
    msg.includes("creditos") ||
    msg.includes("creditos_esgotados") ||
    msg.includes("credit") ||
    msg.includes("payment required") ||
    msg.includes("402")
  );
}

/**
 * Exibe um aviso claro quando os créditos de IA da workspace estão esgotados,
 * com um botão que leva o usuário para a página de créditos/planos.
 * Retorna true se tratou como erro de créditos, false caso contrário.
 */
export function notifyIfAiCreditsError(err: unknown): boolean {
  if (!isAiCreditsError(err)) return false;
  toast.error("Créditos de IA esgotados", {
    description:
      "Sua workspace está sem créditos de IA. Adicione créditos ao plano para continuar usando a análise, o chat e a geração de imagens.",
    duration: 12000,
    action: {
      label: "Adicionar créditos",
      onClick: () => window.open(CREDITS_URL, "_blank", "noopener,noreferrer"),
    },
  });
  return true;
}

/**
 * Se o erro for de créditos, mostra o aviso rico; caso contrário exibe um toast padrão.
 */
export function handleAiError(err: unknown, fallback = "Erro ao processar com a IA") {
  if (notifyIfAiCreditsError(err)) return;
  const msg = err instanceof Error ? err.message : String(err ?? fallback);
  toast.error(msg || fallback);
}
