// Server-only: valida o Bearer token Supabase de uma Request e devolve userId.
import { createClient } from "@supabase/supabase-js";

export type AuthOk = { ok: true; userId: string; token: string };
export type AuthErr = { ok: false; status: number; message: string };

export async function requireUser(request: Request): Promise<AuthOk | AuthErr> {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return { ok: false, status: 401, message: "Não autenticado." };
  }
  const token = auth.slice(7);
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return { ok: false, status: 500, message: "Backend indisponível." };
  }
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) {
    return { ok: false, status: 401, message: "Sessão inválida." };
  }
  return { ok: true, userId: data.user.id, token };
}

export function jsonError(status: number, message: string, code?: string): Response {
  return Response.json({ error: message, code: code ?? `HTTP_${status}` }, { status });
}
