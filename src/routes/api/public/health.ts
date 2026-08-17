import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getBaseUrl, listModels } from "@/lib/vllm.server";
import { getSttBaseUrl, resolveSttModel } from "@/lib/stt.server";

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

/** Tempo máximo que a verificação do servidor de IA pode levar. */
const AI_TIMEOUT_MS = 8000;

/**
 * Verificação real do servidor vLLM: consulta /v1/models pelo túnel.
 * Nenhuma credencial é lida, registrada ou devolvida na resposta.
 */
async function checkInference(): Promise<ServiceReport> {
  const label = "Servidor vLLM (GPU)";
  const base = getBaseUrl();

  if (!base) {
    return {
      label,
      status: "NÃO CONFIGURADO",
      ok: false,
      level: "error",
      detail:
        "Defina VLLM_BASE_URL apontando para o seu servidor vLLM (ex.: https://gpu.suavps.com/v1).",
      latencyMs: null,
    };
  }

  const startedAt = Date.now();
  try {
    const models = await Promise.race([
      listModels(base),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("TIMEOUT")), AI_TIMEOUT_MS),
      ),
    ]);
    const latencyMs = Date.now() - startedAt;
    const configured = process.env.VLLM_MODEL;

    if (models.length === 0) {
      return {
        label,
        status: "SEM MODELO",
        ok: false,
        level: "error",
        detail: `${base} respondeu em ${latencyMs}ms, mas não anunciou nenhum modelo em /v1/models.`,
        latencyMs,
      };
    }

    if (configured && !models.includes(configured)) {
      return {
        label,
        status: "MODELO DIVERGENTE",
        ok: false,
        level: "warn",
        detail: `VLLM_MODEL="${configured}" não está entre os modelos servidos (${models.join(", ")}).`,
        latencyMs,
      };
    }

    return {
      label,
      status: "ONLINE",
      ok: true,
      level: "ok",
      detail: `Respondeu em ${latencyMs}ms servindo: ${models.join(", ")}.`,
      latencyMs,
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const message = describeError(error);
    return {
      label,
      status: "OFFLINE",
      ok: false,
      level: "error",
      detail:
        message === "TIMEOUT"
          ? `${base} não respondeu dentro de ${AI_TIMEOUT_MS}ms. A GPU pode estar ocupada ou o túnel fora do ar.`
          : `Falha ao falar com ${base}: ${message}`,
      latencyMs,
    };
  }
}

/** Verificação real do servidor de transcrição (Whisper na GPU). */
async function checkStt(): Promise<ServiceReport> {
  const label = "Transcrição (STT)";
  const base = getSttBaseUrl();

  if (!base) {
    return {
      label,
      status: "NÃO CONFIGURADO",
      ok: false,
      level: "error",
      detail: "Defina VLLM_STT_BASE_URL (ou VLLM_BASE_URL) para o servidor de transcrição.",
      latencyMs: null,
    };
  }

  const startedAt = Date.now();
  try {
    const model = await Promise.race([
      resolveSttModel(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("TIMEOUT")), AI_TIMEOUT_MS),
      ),
    ]);
    const latencyMs = Date.now() - startedAt;
    return {
      label,
      status: "ONLINE",
      ok: true,
      level: "ok",
      detail: `Modelo de transcrição disponível em ${base}: ${model}.`,
      latencyMs,
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const message = describeError(error);
    return {
      label,
      status: "OFFLINE",
      ok: false,
      level: "error",
      detail:
        message === "TIMEOUT"
          ? `${base} não respondeu dentro de ${AI_TIMEOUT_MS}ms.`
          : `Falha ao verificar a transcrição em ${base}: ${message}`,
      latencyMs,
    };
  }
}

export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        const startedAt = Date.now();

        // As três verificações vão juntas: o health check não deve somar latências.
        const [database, ia, stt] = await Promise.all([
          checkDatabase(),
          checkInference(),
          checkStt(),
        ]);

        const services: Record<string, ServiceReport> = { database, ia, stt };

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
