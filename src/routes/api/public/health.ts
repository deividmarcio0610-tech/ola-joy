import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** Tempo máximo que a verificação do banco pode levar antes de ser considerada falha. */
const DB_TIMEOUT_MS = 5000;

type ServiceLevel = "ok" | "warn" | "error";

type ServiceReport = {
  /** Nome legível do serviço, exibido na tela de diagnóstico. */
  label: string;
  /** Situação apurada (ONLINE, OFFLINE, NÃO CONFIGURADO...). */
  status: string;
  /** `true` somente quando o serviço passou na verificação real. */
  ok: boolean;
  /** Severidade usada apenas para apresentação. */
  level: ServiceLevel;
  /** Explicação em pt-BR do que foi verificado. Nunca contém segredos. */
  detail: string;
  /** Latência medida, quando a verificação envolve rede. */
  latencyMs: number | null;
};

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    // As novas chaves de API do Supabase são strings opacas, não JWTs de bearer.
    if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }

    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

let cachedClient: ReturnType<typeof createClient<Database>> | undefined;

function getSupabaseClient(url: string, key: string) {
  if (!cachedClient) {
    cachedClient = createClient<Database>(url, key, {
      global: { fetch: createSupabaseFetch(key) },
      auth: {
        storage: undefined,
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return cachedClient;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Consulta leve e com limite de tempo no banco. Basta uma linha (ou nenhuma):
 * o que se verifica é se o PostgREST responde sem erro.
 */
async function checkDatabase(): Promise<ServiceReport> {
  const label = "Banco de dados";
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    const missing = [
      ...(!supabaseUrl ? ["SUPABASE_URL"] : []),
      ...(!supabaseKey ? ["SUPABASE_PUBLISHABLE_KEY"] : []),
    ];
    return {
      label,
      status: "NÃO CONFIGURADO",
      ok: false,
      level: "error",
      detail: `Variável(is) de ambiente ausente(s) no servidor: ${missing.join(", ")}.`,
      latencyMs: null,
    };
  }

  const startedAt = Date.now();
  try {
    const { error } = await getSupabaseClient(supabaseUrl, supabaseKey)
      .from("professional_memories")
      .select("id")
      .limit(1)
      .abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS));

    const latencyMs = Date.now() - startedAt;

    if (error) {
      return {
        label,
        status: "OFFLINE",
        ok: false,
        level: "error",
        detail: `A consulta de verificação falhou: ${error.message}`,
        latencyMs,
      };
    }

    return {
      label,
      status: "ONLINE",
      ok: true,
      level: "ok",
      detail: `Consulta de verificação respondida em ${latencyMs}ms.`,
      latencyMs,
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const name = error instanceof Error ? error.name : "";
    const timedOut = name === "TimeoutError" || name === "AbortError";
    return {
      label,
      status: "OFFLINE",
      ok: false,
      level: "error",
      detail: timedOut
        ? `O banco não respondeu dentro de ${DB_TIMEOUT_MS}ms.`
        : `Falha de conexão com o banco: ${describeError(error)}`,
      latencyMs,
    };
  }
}

/**
 * Verifica apenas a PRESENÇA da credencial de IA/STT no servidor.
 * O valor da chave nunca é lido, registrado ou devolvido na resposta.
 */
function checkAiConfig(): ServiceReport {
  const label = "Motor de IA / STT";
  const configured = Boolean(process.env.LOVABLE_API_KEY);

  return configured
    ? {
        label,
        status: "CONFIGURADO",
        ok: true,
        level: "ok",
        detail: "A credencial LOVABLE_API_KEY está presente no servidor.",
        latencyMs: null,
      }
    : {
        label,
        status: "NÃO CONFIGURADO",
        ok: false,
        level: "warn",
        detail: "A variável de ambiente LOVABLE_API_KEY não está definida no servidor.",
        latencyMs: null,
      };
}

export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        const startedAt = Date.now();

        const services: Record<string, ServiceReport> = {
          database: await checkDatabase(),
          ia: checkAiConfig(),
        };

        const reports = Object.values(services);
        const failing = reports.filter((service) => !service.ok);

        const status =
          failing.length === 0
            ? "OPERACIONAL"
            : failing.length === reports.length
              ? "FORA DO AR"
              : "DEGRADADO";

        const body = {
          status,
          timestamp: new Date().toISOString(),
          services,
          durationMs: Date.now() - startedAt,
        };

        return new Response(JSON.stringify(body), {
          status: failing.length === 0 ? 200 : 503,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
