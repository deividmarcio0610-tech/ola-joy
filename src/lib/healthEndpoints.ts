import { checkAI, checkApp } from "@/services/ai";

/**
 * Endpoints de saúde servidos ANTES do handler do TanStack Start
 * (ver `src/server.ts`).
 *
 * Ficam aqui, e não em rotas de arquivo, por três motivos práticos:
 *  - precisam responder mesmo que o SSR do aplicativo esteja quebrado — é assim
 *    que o `docker healthcheck` e o nginx descobrem que a aplicação subiu
 *    quebrada em vez de deixá-la "no ar" silenciosamente;
 *  - `curl`/monitoramento externo precisa de HTTP puro, não de server function;
 *  - não dependem da regeneração do routeTree.
 *
 * Nenhuma resposta expõe host, IP, token ou chave.
 */

export const HEALTH_PATHS = [
  "/api/health",
  "/api/health/ai",
  "/api/ai/health",
  "/api/health/ollama",
] as const;

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // Monitoramento não pode receber resposta de cache.
      "cache-control": "no-store, no-cache, must-revalidate",
    },
  });
}

/**
 * Trata a requisição se ela for de health check; devolve `null` para que o
 * processamento normal do aplicativo continue.
 *
 * Códigos: 200 quando o ANALISADOR está de pé (mesmo com IA desligada ou
 * degradada — o analisador não depende de IA); 503 apenas quando o caminho
 * verificado está de fato quebrado.
 */
export async function handleHealthRequest(request: Request): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  const path = pathname.replace(/\/+$/, "") || "/";

  if (!(HEALTH_PATHS as readonly string[]).includes(path)) {
    return null;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return json({ error: "Método não permitido — use GET." }, 405);
  }

  try {
    if (path === "/api/health") {
      const app = await checkApp();
      // 200 mesmo com a IA degradada: derrubar o container por causa da GPU
      // tiraria do ar o analisador, que funciona sem ela.
      return json(app, 200);
    }

    // /api/ai/health e /api/health/ollama são aliases do mesmo check de IA —
    // o primeiro é o caminho validado no runbook de deploy; o segundo
    // permanece para instalações antigas.
    const ai = await checkAI();
    const httpStatus = ai.status === "falha" ? 503 : 200;
    return json(ai, httpStatus);
  } catch (e) {
    // Nunca "erro genérico": diz o que falhou e o que fazer.
    return json(
      {
        status: "falha",
        message: "O próprio health check falhou ao executar.",
        hint: "Verifique os logs do processo Node — provavelmente uma variável de ambiente inválida.",
        detail: e instanceof Error ? e.message : String(e),
      },
      503,
    );
  }
}
