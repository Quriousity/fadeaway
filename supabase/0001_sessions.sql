-- 0001_sessions.sql
-- 유저별 "내 세션 목록" 저장 테이블.
-- 적용: Supabase 대시보드 → SQL Editor → 붙여넣고 Run.

create table public.sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  session_id  text not null,                    -- 공유용 코드 (예: 7K2P-9QXM)
  name        text,
  role        text not null default 'member',   -- 'owner'(내가 만듦) | 'member'(참여)
  created_at  timestamptz not null default now(),
  unique (user_id, session_id)
);

alter table public.sessions enable row level security;

-- 본인 행만 조회/생성/삭제 가능
create policy "own select" on public.sessions
  for select using (user_id = auth.uid());
create policy "own insert" on public.sessions
  for insert with check (user_id = auth.uid());
create policy "own delete" on public.sessions
  for delete using (user_id = auth.uid());
