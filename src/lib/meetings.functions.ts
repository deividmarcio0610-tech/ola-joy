import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Persistência das sessões de reunião (tabela public.meeting_sessions).
 * Tudo passa por requireSupabaseAuth: o RLS garante que cada usuário só
 * enxerga as próprias sessões.
 */

export type TranscriptBlock = {
  id: string;
  timestamp: string;
  speaker: string;
  text: string;
};

export type SessionAction = {
  responsible: string;
  task: string;
  deadline: string;
};

export type MeetingMetadata = {
  theme?: string;
  mode?: string;
  durationSeconds?: number;
};

export type MeetingSession = {
  id: string;
  title: string;
  startTime: string;
  endTime: string | null;
  transcription: TranscriptBlock[];
  decisions: string[];
  actions: SessionAction[];
  pending: string[];
  summary: string;
  metadata: MeetingMetadata;
};

const blockSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  speaker: z.string(),
  text: z.string(),
});

const actionSchema = z.object({
  responsible: z.string(),
  task: z.string(),
  deadline: z.string(),
});

interface SessionRow {
  id: string;
  title: string;
  start_time: string | null;
  end_time: string | null;
  transcription: unknown;
  decisions: unknown;
  actions: unknown;
  pending: unknown;
  summary: string | null;
  metadata: unknown;
}

function toSession(row: SessionRow): MeetingSession {
  const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
  return {
    id: row.id,
    title: row.title,
    startTime: row.start_time ?? new Date().toISOString(),
    endTime: row.end_time,
    transcription: asArray<TranscriptBlock>(row.transcription),
    decisions: asArray<string>(row.decisions),
    actions: asArray<SessionAction>(row.actions),
    pending: asArray<string>(row.pending),
    summary: row.summary ?? "",
    metadata: (row.metadata as MeetingMetadata | null) ?? {},
  };
}

const SELECT_COLUMNS =
  "id, title, start_time, end_time, transcription, decisions, actions, pending, summary, metadata";

export const listMeetingSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("meeting_sessions")
      .select(SELECT_COLUMNS)
      .order("start_time", { ascending: false });

    if (error) throw new Error(`Falha ao carregar reuniões: ${error.message}`);
    return (data ?? []).map((row) => toSession(row as unknown as SessionRow));
  });

export const getMeetingSession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("meeting_sessions")
      .select(SELECT_COLUMNS)
      .eq("id", data.id)
      .maybeSingle();

    if (error) throw new Error(`Falha ao carregar a reunião: ${error.message}`);
    return row ? toSession(row as unknown as SessionRow) : null;
  });

export const saveMeetingSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        id: z.string().uuid().optional(),
        title: z.string().min(1).default("Reunião"),
        startTime: z.string().optional(),
        endTime: z.string().nullable().optional(),
        transcription: z.array(blockSchema).default([]),
        decisions: z.array(z.string()).default([]),
        actions: z.array(actionSchema).default([]),
        pending: z.array(z.string()).default([]),
        summary: z.string().default(""),
        metadata: z
          .object({
            theme: z.string().optional(),
            mode: z.string().optional(),
            durationSeconds: z.number().optional(),
          })
          .default({}),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const payload = {
      user_id: context.userId,
      title: data.title,
      start_time: data.startTime ?? new Date().toISOString(),
      end_time: data.endTime ?? null,
      transcription: data.transcription,
      decisions: data.decisions,
      actions: data.actions,
      pending: data.pending,
      summary: data.summary,
      metadata: data.metadata,
    };

    const query = data.id
      ? context.supabase.from("meeting_sessions").update(payload).eq("id", data.id)
      : context.supabase.from("meeting_sessions").insert(payload);

    const { data: row, error } = await query.select(SELECT_COLUMNS).single();
    if (error) throw new Error(`Falha ao salvar a reunião: ${error.message}`);
    return toSession(row as unknown as SessionRow);
  });

export const deleteMeetingSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("meeting_sessions").delete().eq("id", data.id);
    if (error) throw new Error(`Falha ao excluir a reunião: ${error.message}`);
    return { ok: true as const };
  });
