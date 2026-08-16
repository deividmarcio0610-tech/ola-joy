/**
 * SESSÃO DE OPERADOR NO NAVEGADOR.
 *
 * O que fica aqui é APENAS o token CSRF devolvido pelo servidor depois que a
 * sessão já foi provada — ele não autentica nada sozinho e não é credencial.
 * O segredo do operador é digitado em runtime, enviado uma única vez no login
 * e imediatamente descartado: quem autentica as requisições seguintes é o
 * cookie HttpOnly assinado, que o JavaScript não consegue ler nem exfiltrar.
 *
 * NADA disso vai para o bundle, localStorage ou sessionStorage.
 */

export interface TradingAuthState {
  authRequired: boolean;
  authenticated: boolean;
  role: "operator" | "admin" | null;
}

let csrfToken: string | null = null;
let state: TradingAuthState = { authRequired: false, authenticated: false, role: null };
const listeners = new Set<(state: TradingAuthState) => void>();

function publish(next: TradingAuthState): void {
  state = next;
  for (const listener of listeners) listener(next);
}

export function tradingAuthState(): TradingAuthState {
  return state;
}

export function subscribeTradingAuth(listener: (state: TradingAuthState) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Cabeçalhos das escritas: CSRF quando existe sessão. */
export function writeHeaders(base?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...base };
  if (csrfToken) headers["x-t4-csrf"] = csrfToken;
  return headers;
}

export async function refreshTradingAuth(): Promise<TradingAuthState> {
  if (typeof window === "undefined") return state;
  try {
    const response = await fetch("/api/trading/auth/status", {
      credentials: "same-origin",
      cache: "no-store",
    });
    const payload = (await response.json()) as {
      authRequired?: boolean;
      authenticated?: boolean;
      role?: TradingAuthState["role"];
      csrf?: string | null;
    };
    csrfToken = payload.csrf ?? null;
    publish({
      authRequired: Boolean(payload.authRequired),
      authenticated: Boolean(payload.authenticated),
      role: payload.role ?? null,
    });
  } catch {
    // Backend fora do ar não pode derrubar a interface; o estado anterior vale.
  }
  return state;
}

/**
 * Login do operador. O token vai UMA vez ao servidor e não é guardado em
 * lugar nenhum do cliente — o retorno é apenas o CSRF da sessão criada.
 */
export async function loginTradingOperator(
  token: string,
): Promise<{ ok: boolean; error?: string }> {
  const response = await fetch("/api/trading/auth/login", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    csrf?: string;
    role?: TradingAuthState["role"];
  };
  if (!response.ok) return { ok: false, error: payload.error ?? `HTTP ${response.status}` };
  csrfToken = payload.csrf ?? null;
  publish({ authRequired: true, authenticated: true, role: payload.role ?? "operator" });
  return { ok: true };
}

export async function logoutTradingOperator(): Promise<void> {
  await fetch("/api/trading/auth/logout", {
    method: "POST",
    credentials: "same-origin",
    headers: writeHeaders(),
  }).catch(() => undefined);
  csrfToken = null;
  publish({ ...state, authenticated: false, role: null });
}

/** Uma escrita foi recusada: marca a sessão como não autenticada para a UI. */
export function markTradingUnauthorized(): void {
  csrfToken = null;
  publish({ ...state, authRequired: true, authenticated: false, role: null });
}
