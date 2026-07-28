import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Hamming distance between two hex strings (matched-length).
function hamming(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

type Candidate = {
  id: string;
  internal_code: string | null;
  vale_protocol: string | null;
  vale_status: string | null;
  title: string | null;
  description: string | null;
  area: string | null;
  location: string | null;
  equipment: string | null;
  status: string | null;
  photo_url: string | null;
  image_hash: string | null;
  image_phash: string | null;
  user_id: string | null;
  created_at: string;
  module: string;
};

const FindSimilarInput = z.object({
  imageHash: z.string().nullable().optional(),
  imagePhash: z.string().nullable().optional(),
  area: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  equipment: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  module: z.enum(["n3", "crm", "kaizen", "environment", "emergency", "gain", "supervision"]).optional(),
  onlySent: z.boolean().optional(),
  excludeId: z.string().uuid().optional(),
});

export const findSimilar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => FindSimilarInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("records")
      .select("id, internal_code, vale_protocol, vale_status, title, description, area, location, equipment, status, photo_url, image_hash, image_phash, user_id, created_at, module")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.module) q = q.eq("module", data.module);
    if (data.onlySent) q = q.in("vale_status", ["sent", "awaiting_return", "accepted"]);
    if (data.excludeId) q = q.neq("id", data.excludeId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const cand = (rows ?? []) as Candidate[];

    const desc = (data.description ?? "").toLowerCase();
    const area = (data.area ?? "").toLowerCase();
    const loc = (data.location ?? "").toLowerCase();
    const equip = (data.equipment ?? "").toLowerCase();

    function textSim(a: string, b: string): number {
      if (!a || !b) return 0;
      const A = new Set(a.split(/\W+/).filter((t) => t.length >= 3));
      const B = new Set(b.split(/\W+/).filter((t) => t.length >= 3));
      if (!A.size || !B.size) return 0;
      let inter = 0;
      for (const t of A) if (B.has(t)) inter++;
      return inter / Math.max(A.size, B.size);
    }

    const scored = cand.map((r) => {
      // image score
      let imgScore = 0;
      if (data.imageHash && r.image_hash && data.imageHash === r.image_hash) imgScore = 1;
      else if (data.imagePhash && r.image_phash) {
        const h = hamming(data.imagePhash, r.image_phash);
        imgScore = Math.max(0, 1 - h / 16); // 0 dist → 1; ≥16 → 0
      }
      // context score
      const areaScore = area && r.area ? (area === r.area.toLowerCase() ? 1 : 0) : 0;
      const locScore = loc && r.location ? textSim(loc, r.location.toLowerCase()) : 0;
      const equipScore = equip && r.equipment ? textSim(equip, r.equipment.toLowerCase()) : 0;
      const ctxScore = Math.max(areaScore * 0.5 + locScore * 0.3 + equipScore * 0.2, 0);
      const descScore = desc && r.description ? textSim(desc, r.description.toLowerCase()) : 0;
      const score = imgScore * 0.5 + ctxScore * 0.25 + descScore * 0.25;
      return { record: r, score, imgScore, ctxScore, descScore };
    })
      .filter((s) => s.score >= 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((s) => ({
        ...s.record,
        similarity: Math.round(s.score * 100),
        breakdown: {
          image: Math.round(s.imgScore * 100),
          context: Math.round(s.ctxScore * 100),
          description: Math.round(s.descScore * 100),
        },
      }));

    return { results: scored };
  });

const CreateInput = z.object({
  module: z.enum(["n3", "crm", "kaizen", "environment", "emergency", "gain", "inspecao"]),
  title: z.string().min(1),
  description: z.string().default(""),
  area: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  equipment: z.string().nullable().optional(),
  equipment_number: z.string().nullable().optional(),
  priority: z.string().default("media"),
  financial_value: z.number().nullable().optional(),
  photo_url: z.string().nullable().optional(),
  image_hash: z.string().nullable().optional(),
  image_phash: z.string().nullable().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
  parent_record_id: z.string().uuid().nullable().optional(),
  kind: z.enum(["new", "complement", "recurrence"]).default("new"),
  similarity_meta: z.record(z.string(), z.unknown()).nullable().optional(),
  justification: z.string().nullable().optional(),
});

export const createRecordWithCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => CreateInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Fetch parent for recurrence numbering
    let recurrenceIndex = 0;
    let parentCode: string | null = null;
    if (data.parent_record_id && data.kind === "recurrence") {
      const { data: parent } = await supabase
        .from("records")
        .select("internal_code, recurrence_index")
        .eq("id", data.parent_record_id)
        .maybeSingle();
      if (parent) {
        parentCode = (parent as { internal_code: string | null }).internal_code;
        recurrenceIndex = ((parent as { recurrence_index: number | null }).recurrence_index ?? 0) + 1;
      }
    }

    let internalCode: string;
    if (data.kind === "recurrence" && parentCode) {
      internalCode = `${parentCode}-R${String(recurrenceIndex).padStart(2, "0")}`;
    } else {
      const { data: codeRes, error: codeErr } = await supabase.rpc("next_internal_code", {
        _type: data.module.toUpperCase(),
        _area: data.area ?? "",
      });
      if (codeErr) throw new Error(codeErr.message);
      internalCode = codeRes as string;
    }

    const insertRow = {
      user_id: userId,
      module: data.module,
      title: data.title,
      description: data.description,
      area: data.area ?? null,
      location: data.location ?? null,
      equipment: data.equipment ?? null,
      equipment_number: data.equipment_number ?? null,
      status: "aberto" as never,
      priority: data.priority as never,
      financial_value: data.financial_value ?? null,
      photo_url: data.photo_url ?? null,
      image_hash: data.image_hash ?? null,
      image_phash: data.image_phash ?? null,
      internal_code: internalCode,
      // Registro com foto/análise entra pendente de revisão → Monitoramento Vale
      vale_status: (data.photo_url ? "awaiting_review" : "draft") as never,
      parent_record_id: data.parent_record_id ?? null,
      recurrence_index: recurrenceIndex,
      similarity_meta: data.similarity_meta ?? null,
      meta: (data.meta ?? {}) as never,
    };

    const { data: inserted, error } = await supabase
      .from("records")
      .insert(insertRow as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    const insertedRow = inserted as { id: string };

    await supabase.from("record_history").insert({
      record_id: insertedRow.id,
      user_id: userId,
      action: data.kind === "recurrence" ? "recurrence_created" : "record_created",
      to_status: "draft",
      justification: data.justification ?? null,
      meta: (data.similarity_meta ?? null) as never,
    } as never);

    if (data.parent_record_id && data.kind !== "new") {
      await supabase.from("record_links").insert({
        origin_id: data.parent_record_id,
        related_id: insertedRow.id,
        kind: data.kind,
        similarity: null,
        created_by: userId,
      } as never);
    }

    return { id: insertedRow.id, internal_code: internalCode, recurrence_index: recurrenceIndex };
  });

const ConfirmSendInput = z.object({
  record_id: z.string().uuid(),
  vale_protocol: z.string().min(1),
  vale_code: z.string().nullable().optional(),
  sent_at: z.string(),
  sent_channel: z.string().nullable().optional(),
  send_proof_url: z.string().nullable().optional(),
  send_note: z.string().nullable().optional(),
  override_duplicate: z.boolean().optional(),
  duplicate_justification: z.string().nullable().optional(),
});

export const confirmValeSend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => ConfirmSendInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Duplicate protocol check
    const { data: dupProto } = await supabase
      .from("records")
      .select("id, internal_code")
      .eq("vale_protocol", data.vale_protocol)
      .neq("id", data.record_id)
      .limit(1);
    if (dupProto && dupProto.length && !data.override_duplicate) {
      throw new Error(`Protocolo já usado no registro ${(dupProto[0] as { internal_code: string }).internal_code}`);
    }

    const { data: prev } = await supabase
      .from("records")
      .select("vale_status")
      .eq("id", data.record_id)
      .single();

    const { error } = await supabase
      .from("records")
      .update({
        vale_protocol: data.vale_protocol,
        vale_code: data.vale_code ?? null,
        vale_status: "sent",
        sent_at: data.sent_at,
        sent_by: userId,
        sent_channel: data.sent_channel ?? null,
        send_proof_url: data.send_proof_url ?? null,
        send_note: data.send_note ?? null,
      } as never)
      .eq("id", data.record_id);
    if (error) throw new Error(error.message);

    await supabase.from("record_history").insert({
      record_id: data.record_id,
      user_id: userId,
      action: "vale_send_confirmed",
      from_status: (prev as { vale_status: string } | null)?.vale_status ?? null,
      to_status: "sent",
      justification: data.duplicate_justification ?? data.send_note ?? null,
      proof_url: data.send_proof_url ?? null,
      meta: { vale_protocol: data.vale_protocol, vale_code: data.vale_code, channel: data.sent_channel } as never,
    } as never);

    return { ok: true };
  });

const UpdateValeStatusInput = z.object({
  record_id: z.string().uuid(),
  vale_status: z.enum([
    "draft", "awaiting_review", "ready", "sent", "awaiting_return",
    "accepted", "rejected", "needs_fix", "in_treatment",
    "awaiting_evidence", "awaiting_validation", "closed",
  ]),
  justification: z.string().nullable().optional(),
});

export const updateValeStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => UpdateValeStatusInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: prev } = await supabase.from("records").select("vale_status").eq("id", data.record_id).single();
    const { error } = await supabase
      .from("records")
      .update({ vale_status: data.vale_status } as never)
      .eq("id", data.record_id);
    if (error) throw new Error(error.message);
    await supabase.from("record_history").insert({
      record_id: data.record_id,
      user_id: userId,
      action: "vale_status_changed",
      from_status: (prev as { vale_status: string } | null)?.vale_status ?? null,
      to_status: data.vale_status,
      justification: data.justification ?? null,
    } as never);
    return { ok: true };
  });

// Dashboard-oriented listing: retorna TODOS os módulos e todos os campos usados no painel
export const listMonitoring = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("records")
      .select(
        "id, internal_code, vale_protocol, vale_code, vale_status, vale_result, vale_result_at, vale_result_note, vale_reject_category, vale_reject_reason, vale_result_proof_url, vale_result_document_url, vale_version, vale_root_id, vale_channel, vale_deadline, module, title, description, area, location, equipment, status, priority, financial_value, photo_url, sent_at, sent_channel, send_proof_url, parent_record_id, recurrence_index, created_at, updated_at, user_id, meta"
      )
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);
    return { records: data ?? [] };
  });

const HistoryInput = z.object({ record_id: z.string().uuid() });
export const listHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => HistoryInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("record_history")
      .select("*")
      .eq("record_id", data.record_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { history: rows ?? [] };
  });

// ============================================================
// Monitoramento Vale — extensões
// ============================================================

const RegisterResultInput = z.object({
  record_id: z.string().uuid(),
  result: z.enum([
    "approved",
    "approved_pending_exec",
    "approved_done",
    "rejected",
    "returned",
    "awaiting_complement",
    "canceled",
  ]),
  result_at: z.string(),
  protocol: z.string().nullable().optional(),
  vale_code: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  reject_category: z.string().nullable().optional(),
  reject_reason: z.string().nullable().optional(),
  proof_url: z.string().nullable().optional(),
  document_url: z.string().nullable().optional(),
  deadline: z.string().nullable().optional(),
});

const RESULT_TO_STATUS: Record<string, string> = {
  approved: "accepted",
  approved_pending_exec: "awaiting_evidence",
  approved_done: "closed",
  rejected: "rejected",
  returned: "needs_fix",
  awaiting_complement: "awaiting_evidence",
  canceled: "closed",
};

export const registerValeResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => RegisterResultInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.result === "rejected" && !data.reject_category) {
      throw new Error("Motivo (categoria) obrigatório para reprovação.");
    }
    const newStatus = RESULT_TO_STATUS[data.result] ?? "awaiting_return";
    const { data: prev } = await supabase
      .from("records")
      .select("vale_status, vale_result")
      .eq("id", data.record_id)
      .single();

    const patch: Record<string, unknown> = {
      vale_result: data.result,
      vale_result_at: data.result_at,
      vale_result_by: userId,
      vale_result_note: data.note ?? null,
      vale_reject_category: data.reject_category ?? null,
      vale_reject_reason: data.reject_reason ?? null,
      vale_result_proof_url: data.proof_url ?? null,
      vale_result_document_url: data.document_url ?? null,
      vale_status: newStatus,
    };
    if (data.protocol) patch.vale_protocol = data.protocol;
    if (data.vale_code) patch.vale_code = data.vale_code;
    if (data.deadline) patch.vale_deadline = data.deadline;

    const { error } = await supabase
      .from("records")
      .update(patch as never)
      .eq("id", data.record_id);
    if (error) throw new Error(error.message);

    await supabase.from("record_history").insert({
      record_id: data.record_id,
      user_id: userId,
      action: "vale_result_registered",
      from_status: (prev as { vale_status: string } | null)?.vale_status ?? null,
      to_status: newStatus,
      justification: data.note ?? data.reject_reason ?? null,
      proof_url: data.proof_url ?? null,
      meta: {
        result: data.result,
        reject_category: data.reject_category,
        vale_protocol: data.protocol,
      } as never,
    } as never);

    return { ok: true, status: newStatus };
  });

const CreateRevisionInput = z.object({
  record_id: z.string().uuid(),
  changes_note: z.string().min(3),
});

export const createValeRevision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => CreateRevisionInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Load current record
    const { data: current, error: e1 } = await supabase
      .from("records")
      .select("*")
      .eq("id", data.record_id)
      .single();
    if (e1 || !current) throw new Error(e1?.message ?? "Registro não encontrado.");
    const cur = current as Record<string, unknown>;
    const rootId = (cur.vale_root_id as string | null) ?? (cur.id as string);
    const nextVersion = ((cur.vale_version as number | null) ?? 1) + 1;

    // Snapshot current version into record_versions
    await supabase.from("record_versions").insert({
      record_id: cur.id as string,
      root_id: rootId,
      version: (cur.vale_version as number | null) ?? 1,
      snapshot: {
        title: cur.title,
        description: cur.description,
        area: cur.area,
        location: cur.location,
        equipment: cur.equipment,
        photo_url: cur.photo_url,
        vale_result: cur.vale_result,
        vale_reject_category: cur.vale_reject_category,
        vale_reject_reason: cur.vale_reject_reason,
        vale_protocol: cur.vale_protocol,
        vale_code: cur.vale_code,
      } as never,
      sent_at: (cur.sent_at as string | null) ?? null,
      sent_by: (cur.sent_by as string | null) ?? null,
      channel: (cur.sent_channel as string | null) ?? null,
      protocol: (cur.vale_protocol as string | null) ?? null,
      vale_code: (cur.vale_code as string | null) ?? null,
      report_url: (cur.send_proof_url as string | null) ?? null,
      result: (cur.vale_result as string | null) ?? null,
      result_at: (cur.vale_result_at as string | null) ?? null,
      result_note: (cur.vale_result_note as string | null) ?? null,
      reject_category: (cur.vale_reject_category as string | null) ?? null,
      reject_reason: (cur.vale_reject_reason as string | null) ?? null,
      changes_note: data.changes_note,
    } as never);

    // Update record to a new revision — reset submission fields, keep history
    const { error: e2 } = await supabase
      .from("records")
      .update({
        vale_version: nextVersion,
        vale_root_id: rootId,
        vale_status: "awaiting_review",
        vale_result: null,
        vale_result_at: null,
        vale_result_note: null,
        vale_reject_category: null,
        vale_reject_reason: null,
        vale_result_proof_url: null,
        vale_result_document_url: null,
        sent_at: null,
        sent_by: null,
        sent_channel: null,
        send_proof_url: null,
        send_note: null,
      } as never)
      .eq("id", cur.id as string);
    if (e2) throw new Error(e2.message);

    await supabase.from("record_history").insert({
      record_id: cur.id as string,
      user_id: userId,
      action: "vale_revision_created",
      to_status: "awaiting_review",
      justification: data.changes_note,
      meta: { version: nextVersion } as never,
    } as never);

    return { ok: true, version: nextVersion };
  });

const VersionsInput = z.object({ root_id: z.string().uuid() });
export const listValeVersions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => VersionsInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("record_versions")
      .select("*")
      .eq("root_id", data.root_id)
      .order("version", { ascending: true });
    if (error) throw new Error(error.message);
    return { versions: rows ?? [] };
  });

// Análise da IA sobre os dados agregados do painel (usa somente estatísticas reais)
const InsightsInput = z.object({
  period_from: z.string().nullable().optional(),
  period_to: z.string().nullable().optional(),
  stats: z.object({
    total: z.number(),
    sent: z.number(),
    pending_result: z.number(),
    approved: z.number(),
    rejected: z.number(),
    returned: z.number(),
    reject_by_category: z.record(z.string(), z.number()).optional(),
    approval_by_module: z.record(z.string(), z.number()).optional(),
    pendings_by_area: z.record(z.string(), z.number()).optional(),
    avg_response_days: z.number().nullable().optional(),
    reincidences: z.number().optional(),
  }),
  filters_applied: z.string().nullable().optional(),
});

export const generateValeInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => InsightsInput.parse(v))
  .handler(async ({ data }) => {
    if (data.stats.total === 0) {
      return {
        text:
          "Dados insuficientes para gerar insights no período selecionado. Ajuste os filtros ou registre mais eventos.",
        base: data.stats,
      };
    }
    const rejectEntries = Object.entries(data.stats.reject_by_category ?? {}).sort((a, b) => b[1] - a[1]);
    const approvalEntries = Object.entries(data.stats.approval_by_module ?? {}).sort((a, b) => b[1] - a[1]);
    const pendingEntries = Object.entries(data.stats.pendings_by_area ?? {}).sort((a, b) => b[1] - a[1]);
    const approvalRate = data.stats.sent > 0 ? Math.round((data.stats.approved / data.stats.sent) * 100) : null;
    const rejectionRate = data.stats.sent > 0 ? Math.round((data.stats.rejected / data.stats.sent) * 100) : null;
    const confidence = data.stats.total >= 100 ? "Alta" : data.stats.total >= 30 ? "Média" : "Baixa";
    const text = [
      `Período analisado: ${data.period_from ?? "—"} a ${data.period_to ?? "—"}`,
      `Base: ${data.stats.total} registro(s); ${data.stats.sent} enviado(s); ${data.stats.pending_result} aguardando retorno.`,
      approvalRate == null
        ? "Taxa de aprovação: sem dados suficientes."
        : `Taxa de aprovação: ${approvalRate}% (${data.stats.approved} aprovado(s) de ${data.stats.sent} enviado(s)).`,
      rejectionRate == null
        ? "Reprovação: sem dados suficientes."
        : `Reprovação: ${rejectionRate}% (${data.stats.rejected} reprovado(s)).`,
      `Principais motivos de reprovação: ${rejectEntries.length ? rejectEntries.slice(0, 3).map(([k, v]) => `${k} (${v})`).join(", ") : "sem dados suficientes"}.`,
      `Módulos com maior aprovação: ${approvalEntries.length ? approvalEntries.slice(0, 3).map(([k, v]) => `${k} (${v}%)`).join(", ") : "sem dados suficientes"}.`,
      `Áreas com mais pendências: ${pendingEntries.length ? pendingEntries.slice(0, 3).map(([k, v]) => `${k} (${v})`).join(", ") : "sem dados suficientes"}.`,
      data.stats.avg_response_days == null
        ? "Tempo médio de resposta: sem dados suficientes."
        : `Tempo médio de resposta: ${data.stats.avg_response_days.toFixed(1)} dia(s).`,
      `Reincidências/tendências: ${data.stats.reincidences ? `${data.stats.reincidences} ocorrência(s) vinculada(s)` : "sem dados suficientes"}.`,
      `Oportunidade operacional: priorizar registros pendentes, revisar causas recorrentes de reprovação e reforçar evidências fotográficas antes do envio.`,
      `Nível de confiança: ${confidence}, conforme volume de dados disponível.`,
    ].join("\n");
    return { text, base: data.stats };
  });

// ============= Análise IA v2 — status, feedback, análise-v2 =============

const UpdateStatusInput = z.object({
  record_id: z.string().uuid(),
  status: z.enum([
    "rascunho",
    "pendente",
    "aguardando_analise",
    "aguardando_aprovacao",
    "aprovado",
    "reprovado",
    "em_tratamento",
    "aguardando_evidencia",
    "concluido",
    "vencido",
    "cancelado",
  ]),
  note: z.string().max(2000).optional().nullable(),
});

export const updateRecordStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => UpdateStatusInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: prev, error: e0 } = await supabase
      .from("records")
      .select("status_history, meta")
      .eq("id", data.record_id)
      .single();
    if (e0) throw new Error(e0.message);

    const history = Array.isArray((prev as { status_history?: unknown } | null)?.status_history)
      ? ((prev as { status_history: unknown[] }).status_history as unknown[])
      : [];
    const meta = ((prev as { meta?: Record<string, unknown> } | null)?.meta ?? {}) as Record<string, unknown>;
    const fromStatus = (meta.status_v2 as string | undefined) ?? null;

    const entry = {
      from: fromStatus,
      to: data.status,
      at: new Date().toISOString(),
      by: userId,
      note: data.note ?? null,
    };

    const { error } = await supabase
      .from("records")
      .update({
        status_history: [...history, entry],
        meta: { ...meta, status_v2: data.status },
      } as never)
      .eq("id", data.record_id);
    if (error) throw new Error(error.message);
    return { ok: true, entry };
  });

const AiCorrectionInput = z.object({
  record_id: z.string().uuid(),
  action: z.enum([
    "aprovada",
    "editada",
    "reclassificada",
    "nova_analise_solicitada",
    "erro_reportado",
    "encaminhada",
  ]),
  note: z.string().max(2000).optional().nullable(),
  corrections: z.record(z.string(), z.unknown()).optional(),
});

export const submitAiCorrection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => AiCorrectionInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: prev, error: e0 } = await supabase
      .from("records")
      .select("ai_feedback, human_review")
      .eq("id", data.record_id)
      .single();
    if (e0) throw new Error(e0.message);

    const feedback = Array.isArray((prev as { ai_feedback?: unknown } | null)?.ai_feedback)
      ? ((prev as { ai_feedback: unknown[] }).ai_feedback as unknown[])
      : [];

    const entry = {
      action: data.action,
      by: userId,
      at: new Date().toISOString(),
      note: data.note ?? null,
      corrections: data.corrections ?? null,
    };

    const { error } = await supabase
      .from("records")
      .update({
        ai_feedback: [...feedback, entry],
        human_review: entry,
      } as never)
      .eq("id", data.record_id);
    if (error) throw new Error(error.message);
    return { ok: true, at: entry.at, action: entry.action };
  });

const SaveAnalysisV2Input = z.object({
  record_id: z.string().uuid(),
  analysis_v2: z.record(z.string(), z.unknown()),
});

export const saveAnalysisV2 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => SaveAnalysisV2Input.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("records")
      .update({ analysis_v2: data.analysis_v2 } as never)
      .eq("id", data.record_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
