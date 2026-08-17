// Wrapper client-side: chama uma rota same-origin com Bearer da Supabase.
import { supabase } from "@/integrations/supabase/client";

export async function callVpsRoute<T = unknown>(
  path: string,
  body?: unknown,
  init?: { method?: string; signal?: AbortSignal },
): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Você precisa estar logado. Faça login e tente novamente.");
  const res = await fetch(path, {
    method: init?.method ?? "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: init?.signal,
    credentials: "same-origin",
  });
  const text = await res.text();
  let parsed: unknown = undefined;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    /* ignore */
  }
  const structuredError = parsed as
    | { ok?: boolean; message?: string; error?: string; code?: string; upstreamStatus?: number }
    | undefined;
  if (!res.ok) {
    const msg = structuredError?.message ?? structuredError?.error ?? `Erro ${res.status}`;
    throw new Error(msg);
  }
  if (structuredError?.ok === false) {
    const msg =
      structuredError.message ??
      structuredError.error ??
      `IA indisponível${structuredError.upstreamStatus ? ` (HTTP ${structuredError.upstreamStatus})` : ""}`;
    throw new Error(msg);
  }
  return parsed as T;
}
