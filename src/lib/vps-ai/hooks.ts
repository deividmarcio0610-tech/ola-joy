import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { vpsAI, type VpsHealth, type VpsJob } from "@/lib/vps-ai/api";

/**
 * Guarda de sessão: falha cedo, com mensagem legível, quando não há login.
 * O header `Authorization` em si é anexado por `jfetch` em @/lib/vps-ai/api,
 * requisição a requisição.
 */
async function authFetch<T>(fn: () => Promise<T>): Promise<T> {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) throw new Error("Faça login para continuar.");
  return await fn();
}

export function useVpsHealth(pollMs = 30_000) {
  const [health, setHealth] = useState<VpsHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      try {
        const h = await vpsAI.getHealth();
        if (mounted) {
          setHealth(h);
          setError(null);
        }
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : "Erro");
      } finally {
        if (mounted) setLoading(false);
        if (mounted) timer = setTimeout(tick, pollMs);
      }
    }
    void tick();
    return () => {
      mounted = false;
      clearTimeout(timer!);
    };
  }, [pollMs]);

  return { health, error, loading };
}

export function useVpsJob(jobId: string | null) {
  const [job, setJob] = useState<VpsJob | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;
    let mounted = true;
    let delay = 1500;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const j = await authFetch(() => vpsAI.getJob(jobId!));
        if (!mounted) return;
        setJob(j);
        if (["completed", "failed", "cancelled"].includes(j.status)) return;
        delay = Math.min(delay * 1.4, 8000);
        timer = setTimeout(poll, delay);
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : "Erro");
        timer = setTimeout(poll, 5000);
      }
    }
    void poll();
    return () => {
      mounted = false;
      clearTimeout(timer!);
    };
  }, [jobId]);

  return { job, error };
}

export { authFetch as vpsAuthFetch };
