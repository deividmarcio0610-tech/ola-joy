// Diagnóstico dos provedores de imagem (admin).
// GET  → lista provedores com status, chave configurada, últimas tentativas.
// POST → { provider: string } roda probe leve de autenticação.

import { createFileRoute } from "@tanstack/react-router";

async function authorize(request: Request) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return { error: Response.json({ error: "Não autenticado." }, { status: 401 }) };
  const token = auth.slice("Bearer ".length);

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !serviceKey || !publishableKey) {
    return { error: Response.json({ error: "Backend indisponível." }, { status: 500 }) };
  }
  const { createClient } = await import("@supabase/supabase-js");
  const userClient = createClient(url, publishableKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error } = await userClient.auth.getUser();
  if (error || !userData?.user) return { error: Response.json({ error: "Sessão inválida." }, { status: 401 }) };

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  // Verifica admin via has_role.
  const { data: isAdmin } = await userClient.rpc("has_role", { _user_id: userData.user.id, _role: "admin" });
  if (!isAdmin) return { error: Response.json({ error: "Acesso restrito ao administrador." }, { status: 403 }) };

  return { admin };
}

export const Route = createFileRoute("/api/iris/providers-diagnostic")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const a = await authorize(request);
        if ("error" in a) return a.error;
        const admin = a.admin;

        const { data: providers } = await admin
          .from("image_providers")
          .select("*")
          .order("priority", { ascending: true });

        const { probeAll } = await import("@/lib/image-providers/probe.server");
        const probes = await probeAll((providers ?? []).map((p) => p.provider_name));
        const byName = new Map(probes.map((p) => [p.provider, p]));

        // Últimas 3 tentativas por provedor.
        const lastAttempts: Record<string, unknown[]> = {};
        for (const p of providers ?? []) {
          const { data } = await admin
            .from("image_generation_attempts")
            .select("provider_name, model, status, http_status, error_type, sanitized_error_message, duration_ms, started_at")
            .eq("provider_name", p.provider_name)
            .order("started_at", { ascending: false })
            .limit(3);
          lastAttempts[p.provider_name] = data ?? [];
        }

        return Response.json({
          providers: (providers ?? []).map((p) => ({
            ...p,
            probe: byName.get(p.provider_name) ?? null,
            recentAttempts: lastAttempts[p.provider_name] ?? [],
          })),
        });
      },
      POST: async ({ request }) => {
        const a = await authorize(request);
        if ("error" in a) return a.error;

        let body: { provider?: string } = {};
        try { body = await request.json(); } catch { /* ignore */ }
        if (!body.provider) return Response.json({ error: "Informe o provider." }, { status: 400 });

        const { probeProvider } = await import("@/lib/image-providers/probe.server");
        const result = await probeProvider(body.provider);
        return Response.json(result);
      },
    },
  },
});
