import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type AppVersion = {
  id: string;
  version: string;
  title: string;
  description: string;
  release_notes: string[];
  is_mandatory: boolean;
  minimum_supported_version: string | null;
  rollout_percent: number;
  is_active: boolean;
  published_at: string;
};

/** Busca a versão publicada mais recente e ativa. */
export const getLatestVersion = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AppVersion | null> => {
    const { data, error } = await context.supabase
      .from("app_versions")
      .select(
        "id, version, title, description, release_notes, is_mandatory, minimum_supported_version, rollout_percent, is_active, published_at",
      )
      .eq("is_active", true)
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return {
      ...data,
      release_notes: Array.isArray(data.release_notes)
        ? (data.release_notes as string[])
        : [],
    } as AppVersion;
  });

/** Histórico completo de versões (para tela Novidades). */
export const listVersions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AppVersion[]> => {
    const { data, error } = await context.supabase
      .from("app_versions")
      .select(
        "id, version, title, description, release_notes, is_mandatory, minimum_supported_version, rollout_percent, is_active, published_at",
      )
      .order("published_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((d) => ({
      ...d,
      release_notes: Array.isArray(d.release_notes)
        ? (d.release_notes as string[])
        : [],
    })) as AppVersion[];
  });

/** Registra a versão carregada por este usuário (telemetria). */
export const recordInstall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { version: string; userAgent?: string }) =>
    z.object({ version: z.string().min(1), userAgent: z.string().optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("app_version_installs")
      .upsert(
        {
          user_id: context.userId,
          version: data.version,
          user_agent: data.userAgent ?? null,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const versionInput = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "Formato semver esperado (ex: 1.2.3)"),
  title: z.string().min(1),
  description: z.string().default(""),
  release_notes: z.array(z.string()).default([]),
  is_mandatory: z.boolean().default(false),
  minimum_supported_version: z.string().nullable().optional(),
  rollout_percent: z.number().int().min(0).max(100).default(100),
  is_active: z.boolean().default(true),
});

export const createVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => versionInput.parse(data))
  .handler(async ({ data, context }) => {
    // Checa role admin
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Apenas administradores podem publicar versões.");
    const { error } = await context.supabase.from("app_versions").insert({
      version: data.version,
      title: data.title,
      description: data.description,
      release_notes: data.release_notes,
      is_mandatory: data.is_mandatory,
      minimum_supported_version: data.minimum_supported_version ?? null,
      rollout_percent: data.rollout_percent,
      is_active: data.is_active,
      published_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({
      id: z.string().uuid(),
      is_active: z.boolean().optional(),
      is_mandatory: z.boolean().optional(),
      rollout_percent: z.number().int().min(0).max(100).optional(),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase
      .from("app_versions")
      .update(patch)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getInstallStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("app_version_installs")
      .select("version, last_seen_at");
    if (error) throw new Error(error.message);
    const now = Date.now();
    const byVersion = new Map<string, { total: number; active24h: number }>();
    for (const row of data ?? []) {
      const bucket = byVersion.get(row.version) ?? { total: 0, active24h: 0 };
      bucket.total += 1;
      if (row.last_seen_at && now - new Date(row.last_seen_at).getTime() < 86_400_000) {
        bucket.active24h += 1;
      }
      byVersion.set(row.version, bucket);
    }
    return Array.from(byVersion.entries()).map(([version, v]) => ({ version, ...v }));
  });
