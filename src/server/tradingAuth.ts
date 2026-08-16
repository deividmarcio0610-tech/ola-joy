import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * AUTORIZAÇÃO DAS ESCRITAS DE TRADING.
 *
 * CAUSA RAIZ CORRIGIDA: todo `/api/trading/*` era anônimo. Qualquer cliente que
 * alcançasse a porta podia gravar `POST /backtests` — e é essa base histórica
 * que `filterEvidenceTrades()` entrega ao `decide()`, ou seja, evidência
 * fabricada por terceiros podia AUTORIZAR entradas.
 *
 * ARQUITETURA (nenhum segredo no bundle):
 *
 *  1. O operador digita o token UMA vez na interface (runtime, nunca embutido).
 *  2. `POST /api/trading/auth/login` valida o token no SERVIDOR e devolve um
 *     cookie de sessão `t4_op` — HttpOnly (JS não lê), SameSite=Strict, Secure
 *     sob HTTPS, assinado por HMAC-SHA256 com segredo que só existe no .env.
 *     O token digitado é descartado; o navegador passa a portar apenas a
 *     sessão assinada, que expira.
 *  3. Toda escrita exige: assinatura válida + não expirada + CSRF em header
 *     (double-submit) + MESMA ORIGEM (Origin/Referer conferidos contra o Host,
 *     além de Sec-Fetch-Site quando o navegador envia).
 *
 * Sem token configurado (dev/local), escrever só é permitido a partir do
 * loopback — política explícita, não "esconder a porta": qualquer requisição
 * remota recebe 401 com a instrução de configurar o token.
 */

const COOKIE_NAME = "t4_op";
const SESSION_TTL_MS = 12 * 60 * 60 * 1_000;

export type TradingRole = "operator" | "admin";

export interface TradingSession {
  role: TradingRole;
  issuedAt: number;
  expiresAt: number;
  csrf: string;
}

/** Token exigido do operador. OPERATOR_TOKEN tem precedência; ADMIN_TOKEN serve. */
export function operatorToken(): string | null {
  return process.env["OPERATOR_TOKEN"]?.trim() || process.env["ADMIN_TOKEN"]?.trim() || null;
}

export function adminToken(): string | null {
  return process.env["ADMIN_TOKEN"]?.trim() || null;
}

export function authRequired(): boolean {
  return operatorToken() !== null;
}

/**
 * Segredo de assinatura. TRADING_SESSION_SECRET é o ideal; sem ele derivamos
 * do token configurado (também secreto e presente só no servidor), de modo que
 * a instalação funcione sem uma variável extra obrigatória.
 */
function signingSecret(): string {
  const explicit = process.env["TRADING_SESSION_SECRET"]?.trim();
  if (explicit) return explicit;
  const derived = operatorToken();
  if (derived) return `derived:${derived}`;
  // Sem credencial configurada não existe sessão assinada — o modo loopback
  // não usa cookie. Este valor nunca autoriza nada sozinho.
  return "unconfigured";
}

function sign(payload: string): string {
  return createHmac("sha256", signingSecret()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function createSessionCookieValue(role: TradingRole): {
  value: string;
  session: TradingSession;
} {
  const issuedAt = Date.now();
  const session: TradingSession = {
    role,
    issuedAt,
    expiresAt: issuedAt + SESSION_TTL_MS,
    csrf: randomBytes(18).toString("base64url"),
  };
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return { value: `${payload}.${sign(payload)}`, session };
}

export function parseSessionCookie(raw: string | null | undefined): TradingSession | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);
  if (!safeEqual(signature, sign(payload))) return null;
  try {
    const session = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as TradingSession;
    if (!session?.expiresAt || Date.now() > session.expiresAt) return null;
    if (session.role !== "operator" && session.role !== "admin") return null;
    return session;
  } catch {
    return null;
  }
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name)
      return decodeURIComponent(part.slice(index + 1).trim());
  }
  return null;
}

function isSecureRequest(request: Request): boolean {
  if (request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https") return true;
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

export function sessionCookieHeader(request: Request, value: string | null): string {
  const attributes = [
    `${COOKIE_NAME}=${value ?? ""}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    value ? `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}` : "Max-Age=0",
  ];
  if (isSecureRequest(request)) attributes.push("Secure");
  return attributes.join("; ");
}

export function currentSession(request: Request): TradingSession | null {
  return parseSessionCookie(readCookie(request, COOKIE_NAME));
}

/**
 * MESMA ORIGEM. Um site de terceiros não pode disparar escritas no analisador:
 * `Origin`/`Referer` precisam bater com o host servido, e `Sec-Fetch-Site`
 * (quando o navegador envia) precisa ser same-origin/none.
 */
export function sameOriginViolation(request: Request): string | null {
  const host = request.headers.get("host");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return `Requisição cross-site bloqueada (sec-fetch-site=${fetchSite}).`;
  }
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const candidate = origin ?? referer;
  if (!candidate) return null; // curl/servidor: sem origem de navegador para violar
  try {
    const url = new URL(candidate);
    if (host && url.host !== host) {
      return `Origem ${url.host} não corresponde ao host ${host} — escrita bloqueada.`;
    }
  } catch {
    return "Cabeçalho de origem inválido — escrita bloqueada.";
  }
  return null;
}

function remoteAddress(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  return request.headers.get("x-real-ip")?.trim() ?? null;
}

/** Loopback: sem proxy declarando IP remoto, ou IP local explícito. */
export function isLoopback(request: Request): boolean {
  const address = remoteAddress(request);
  if (!address) {
    const host = request.headers.get("host") ?? "";
    return /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host);
  }
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

export interface AuthorizationResult {
  ok: boolean;
  status: 401 | 403;
  error: string;
}

/**
 * Autoriza uma ESCRITA. `requireAdmin` eleva a exigência para o ADMIN_TOKEN
 * (promoção/rollback de técnica), que muda o que autoriza entradas.
 */
export function authorizeWrite(
  request: Request,
  { requireAdmin = false } = {},
): AuthorizationResult | null {
  const origin = sameOriginViolation(request);
  if (origin) return { ok: false, status: 403, error: origin };

  if (!authRequired()) {
    // Instalação sem credencial: escrita apenas local, nunca pela rede.
    if (isLoopback(request)) return null;
    return {
      ok: false,
      status: 401,
      error:
        "Escrita remota bloqueada: defina OPERATOR_TOKEN (ou ADMIN_TOKEN) no .env do servidor e autentique-se no analisador.",
    };
  }

  const session = currentSession(request);
  if (!session) {
    return {
      ok: false,
      status: 401,
      error: "Sessão de operador ausente ou expirada. Autentique-se para gravar dados do T4.",
    };
  }
  const csrf = request.headers.get("x-t4-csrf")?.trim();
  if (!csrf || !safeEqual(csrf, session.csrf)) {
    return { ok: false, status: 403, error: "Token CSRF ausente ou inválido." };
  }
  if (requireAdmin && session.role !== "admin") {
    return {
      ok: false,
      status: 403,
      error: "Esta operação exige sessão de ADMIN (ADMIN_TOKEN).",
    };
  }
  return null;
}

/** Valida o token digitado e decide o papel da sessão. */
export function resolveRole(provided: string): TradingRole | null {
  const admin = adminToken();
  const operator = operatorToken();
  if (admin && safeEqual(provided, admin)) return "admin";
  if (operator && safeEqual(provided, operator)) return "operator";
  return null;
}

// --- rate limit do login (brute-force do token) ----------------------------

const loginBuckets = new Map<string, number[]>();

export function loginRateLimited(request: Request, maxPerMinute = 10): boolean {
  const key = remoteAddress(request) ?? "local";
  const now = Date.now();
  if (loginBuckets.size > 1_000) loginBuckets.clear();
  const bucket = (loginBuckets.get(key) ?? []).filter((at) => now - at < 60_000);
  if (bucket.length >= maxPerMinute) {
    loginBuckets.set(key, bucket);
    return true;
  }
  bucket.push(now);
  loginBuckets.set(key, bucket);
  return false;
}

export function resetTradingAuthRateLimitForTests(): void {
  loginBuckets.clear();
}
