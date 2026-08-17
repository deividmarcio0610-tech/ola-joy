import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ActionItemSchema = z.object({
  description: z.string().default(""),
  responsible: z.string().default(""),
  deadline: z.string().default(""),
  priority: z.enum(["baixa", "media", "alta", "critica"]).default("media"),
  evidence_required: z.string().default(""),
});

const SaveEnvironmentalRecordInput = z.object({
  title: z.string().min(1).max(300),
  description: z.string().default(""),
  area: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  equipment: z.string().nullable().optional(),
  priority: z.enum(["baixa", "media", "alta", "critica"]),
  photoUrl: z.string().nullable().optional(),
  categories: z.array(z.string()).default([]),
  aspect: z.string().nullable().optional(),
  impactDirect: z.string().nullable().optional(),
  impactIndirect: z.string().nullable().optional(),
  medium: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  material: z.string().nullable().optional(),
  severity: z.number().int().min(1).max(5),
  probability: z.number().int().min(1).max(5),
  scope: z.number().int().min(1).max(5),
  persistence: z.number().int().min(1).max(5),
  sensitivity: z.number().int().min(1).max(5),
  control: z.number().int().min(1).max(5),
  scoreBefore: z.number().int().min(6).max(30),
  levelBefore: z.string().min(1),
  actions: z.object({
    immediate: z.array(ActionItemSchema).default([]),
    corrective: z.array(ActionItemSchema).default([]),
    preventive: z.array(ActionItemSchema).default([]),
  }),
  aiBefore: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const saveEnvironmentalRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SaveEnvironmentalRecordInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: codeRes, error: codeError } = await supabase.rpc("next_internal_code", {
      _type: "AMB",
      _area: data.area ?? "",
    });
    if (codeError) throw new Error(codeError.message);

    const { data: inserted, error } = await supabase
      .from("records")
      .insert({
        user_id: userId,
        module: "environment",
        title: data.title,
        description: data.description,
        area: data.area ?? null,
        location: data.location ?? null,
        equipment: data.equipment ?? null,
        priority: data.priority,
        status: "aberto",
        photo_url: data.photoUrl ?? null,
        internal_code: (codeRes as string | null) ?? null,
        env_categories: data.categories,
        env_aspect: data.aspect ?? null,
        env_impact_direct: data.impactDirect ?? null,
        env_impact_indirect: data.impactIndirect ?? null,
        env_medium: data.medium ?? null,
        env_source: data.source ?? null,
        env_material: data.material ?? null,
        env_severity: data.severity,
        env_probability: data.probability,
        env_scope: data.scope,
        env_persistence: data.persistence,
        env_sensitivity: data.sensitivity,
        env_control: data.control,
        env_score_before: data.scoreBefore,
        env_level_before: data.levelBefore,
        env_actions: data.actions,
        env_ai_before: data.aiBefore ?? null,
      } as never)
      .select("id, internal_code")
      .single();

    if (error) throw new Error(error.message);
    return inserted;
  });
