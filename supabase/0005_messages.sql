-- 0005_messages.sql
-- 채팅 메시지. channel = 세션ID(코드) 또는 다이렉트 id.
-- 멤버십(세션 참여 or 다이렉트 참여)이 있어야 읽기/쓰기 가능.
-- 적용: Supabase 대시보드 → SQL Editor → 붙여넣고 Run.

create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  channel     text not null,
  sender      uuid not null default auth.uid() references auth.users on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now()
);

create index messages_channel_time on public.messages (channel, created_at);

alter table public.messages enable row level security;

-- 채널 멤버 여부: 세션 참여자이거나 다이렉트 참여자
create policy "messages read" on public.messages
  for select using (
    exists (
      select 1 from public.sessions s
      where s.session_id = messages.channel and s.user_id = auth.uid()
    )
    or exists (
      select 1 from public.directs d
      where d.id::text = messages.channel
        and (d.user_a = auth.uid() or d.user_b = auth.uid())
    )
  );

create policy "messages insert" on public.messages
  for insert with check (
    sender = auth.uid() and (
      exists (
        select 1 from public.sessions s
        where s.session_id = messages.channel and s.user_id = auth.uid()
      )
      or exists (
        select 1 from public.directs d
        where d.id::text = messages.channel
          and (d.user_a = auth.uid() or d.user_b = auth.uid())
      )
    )
  );
