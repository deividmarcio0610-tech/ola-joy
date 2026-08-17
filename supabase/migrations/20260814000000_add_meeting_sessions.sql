create table if not exists public.meeting_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  start_time timestamp with time zone default now(),
  end_time timestamp with time zone,
  transcription jsonb default '[]'::jsonb,
  decisions jsonb default '[]'::jsonb,
  actions jsonb default '[]'::jsonb,
  pending jsonb default '[]'::jsonb,
  summary text,
  metadata jsonb default '{}'::jsonb
);

grant select, insert, update, delete on public.meeting_sessions to authenticated;
grant all on public.meeting_sessions to service_role;

alter table public.meeting_sessions enable row level security;

create policy "Users can select their own meeting sessions" 
on public.meeting_sessions for select to authenticated using (auth.uid() = user_id);
create policy "Users can insert their own meeting sessions" 
on public.meeting_sessions for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can update their own meeting sessions" 
on public.meeting_sessions for update to authenticated using (auth.uid() = user_id);
