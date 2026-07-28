import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ProjectIntervention, SafetyPlanState } from "./types";

export interface SavePlanInput {
  id?: string;
  recordId?: string | null;
  moduleKey?: string | null;
  title: string;
  photoUrl: string;
  interventions: ProjectIntervention[];
  state: SafetyPlanState;
  status?: string;
}

export const saveSafetyPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: SavePlanInput) => d)
  .handler(async ({ data, context }) => {
    const payload = {
      record_id: data.recordId ?? null,
      module_key: data.moduleKey ?? null,
      title: data.title || "Projeto Executivo",
      photo_url: data.photoUrl,
      interventions: JSON.parse(JSON.stringify(data.interventions)),
      svg_state: JSON.parse(JSON.stringify(data.state)),
      status: data.status ?? "rascunho",
      created_by: context.userId,
    };
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("safety_plans")
        .update(payload)
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await context.supabase
      .from("safety_plans")
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listSafetyPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { recordId?: string | null; moduleKey?: string | null }) => d)
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("safety_plans")
      .select("id,title,record_id,module_key,status,updated_at,photo_url")
      .order("updated_at", { ascending: false });
    if (data.recordId) q = q.eq("record_id", data.recordId);
    if (data.moduleKey) q = q.eq("module_key", data.moduleKey);
    const { data: rows, error } = await q.limit(50);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const loadSafetyPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("safety_plans")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    return row;
  });
