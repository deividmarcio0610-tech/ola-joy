import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// ---- Salvar auditoria completa (Fase 1: análise única) ----

const SaveAuditInput = z.object({
  title: z.string().min(1).max(300),
  area: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  scope: z.array(z.string()).default([]),
  environmentType: z.string().nullable().optional(),
  criticality: z
    .enum(["controlada", "baixa", "moderada", "alta", "muito_alta", "critica"])
    .nullable()
    .optional(),
  overallConfidence: z.number().int().min(0).max(100).nullable().optional(),
  summary: z.string().nullable().optional(),
  aiPayload: z.record(z.string(), z.unknown()).nullable().optional(),
  originalPhotoUrl: z.string().url().nullable().optional(),
  findings: z
    .array(
      z.object({
        sortIndex: z.number().int().default(0),
        l1: z.string().nullable().optional(),
        l2: z.string().nullable().optional(),
        l3: z.string().nullable().optional(),
        aspect: z.string().nullable().optional(),
        impact: z.string().nullable().optional(),
        mediumAffected: z.array(z.string()).default([]),
        classification: z.string().nullable().optional(),
        criticality: z.string().nullable().optional(),
        evidenceType: z.string().nullable().optional(),
        severity: z.number().int().min(1).max(5).nullable().optional(),
        probability: z.number().int().min(1).max(5).nullable().optional(),
        controlHierarchy: z.string().nullable().optional(),
        proposals: z.array(z.unknown()).default([]),
        skepticNotes: z.string().nullable().optional(),
        indicators: z.array(z.string()).default([]),
        requires: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  actions: z
    .array(
      z.object({
        tier: z.enum(["imediata", "kaisen", "engenharia", "inovacao"]).default("kaisen"),
        what: z.string().min(1),
        why: z.string().nullable().optional(),
        where_: z.string().nullable().optional(),
        when_: z.string().nullable().optional(),
        who: z.string().nullable().optional(),
        how: z.string().nullable().optional(),
        howMuch: z
          .enum(["muito_baixo", "baixo", "medio", "alto", "estrategico"])
          .nullable()
          .optional(),
        priority: z.enum(["baixa", "media", "alta", "critica"]).default("media"),
        indicator: z.string().nullable().optional(),
      }),
    )
    .default([]),
  attachments: z
    .array(
      z.object({
        kind: z.enum(["image", "pdf", "spreadsheet", "video", "audio", "other"]),
        path: z.string(),
        signedUrl: z.string().nullable().optional(),
        filename: z.string(),
        mime: z.string().nullable().optional(),
        size: z.number().int().nullable().optional(),
      }),
    )
    .default([]),
});

export const saveEnvAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => SaveAuditInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const code = `AMB-${new Date().toISOString().slice(0, 7)}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const { data: audit, error: e1 } = await supabase
      .from("environmental_audits")
      .insert({
        code,
        user_id: userId,
        title: data.title,
        area: data.area ?? null,
        location: data.location ?? null,
        scope: data.scope,
        environment_type: data.environmentType ?? null,
        criticality: data.criticality ?? null,
        overall_confidence: data.overallConfidence ?? null,
        summary: data.summary ?? null,
        ai_payload: (data.aiPayload ?? null) as never,
        original_photo_url: data.originalPhotoUrl ?? null,
        status: "concluida",
      })
      .select()
      .single();
    if (e1 || !audit) throw new Error(e1?.message ?? "Falha ao criar auditoria.");

    if (data.findings.length) {
      const rows = data.findings.map((f) => ({
        audit_id: audit.id,
        user_id: userId,
        sort_index: f.sortIndex,
        level_1_observation: f.l1 ?? null,
        level_2_interpretation: f.l2 ?? null,
        level_3_analysis: f.l3 ?? null,
        aspect: f.aspect ?? null,
        impact: f.impact ?? null,
        medium_affected: f.mediumAffected,
        classification: f.classification ?? null,
        criticality: f.criticality ?? null,
        evidence_type: f.evidenceType ?? null,
        severity: f.severity ?? null,
        probability: f.probability ?? null,
        control_hierarchy: f.controlHierarchy ?? null,
        proposals: f.proposals as never,
        skeptic_notes: f.skepticNotes ?? null,
        indicators: f.indicators,
        requires: f.requires,
      }));
      const { error: e2 } = await supabase.from("environmental_findings").insert(rows as never);
      if (e2) throw new Error(e2.message);
    }

    if (data.actions.length) {
      const rows = data.actions.map((a) => ({
        audit_id: audit.id,
        user_id: userId,
        tier: a.tier,
        what: a.what,
        why: a.why ?? null,
        where_: a.where_ ?? null,
        when_: a.when_ ?? null,
        who: a.who ?? null,
        how: a.how ?? null,
        how_much: a.howMuch ?? null,
        priority: a.priority,
        indicator: a.indicator ?? null,
      }));
      const { error: e3 } = await supabase.from("environmental_actions").insert(rows);
      if (e3) throw new Error(e3.message);
    }

    if (data.attachments.length) {
      const kindMap: Record<string, string> = {
        image: "foto",
        pdf: "pdf",
        spreadsheet: "planilha",
        video: "video",
        audio: "audio",
        other: "outro",
      };
      const rows = data.attachments.map((att) => ({
        audit_id: audit.id,
        user_id: userId,
        kind: kindMap[att.kind] ?? "outro",
        storage_path: att.path,
        public_url: att.signedUrl ?? null,
        filename: att.filename,
        mime_type: att.mime ?? null,
        size_bytes: att.size ?? null,
      }));
      const { error: e4 } = await supabase.from("environmental_attachments").insert(rows as never);
      if (e4) throw new Error(e4.message);
    }

    return { id: audit.id, code: audit.code };
  });

export const listEnvAudits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("environmental_audits")
      .select(
        "id, code, title, area, location, status, criticality, overall_confidence, summary, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getEnvAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const [audit, findings, actions, attachments] = await Promise.all([
      context.supabase.from("environmental_audits").select("*").eq("id", data.id).single(),
      context.supabase
        .from("environmental_findings")
        .select("*")
        .eq("audit_id", data.id)
        .order("sort_index"),
      context.supabase
        .from("environmental_actions")
        .select("*")
        .eq("audit_id", data.id)
        .order("created_at"),
      context.supabase
        .from("environmental_attachments")
        .select("*")
        .eq("audit_id", data.id)
        .order("created_at"),
    ]);
    if (audit.error) throw new Error(audit.error.message);
    return {
      audit: audit.data,
      findings: findings.data ?? [],
      actions: actions.data ?? [],
      attachments: attachments.data ?? [],
    };
  });
