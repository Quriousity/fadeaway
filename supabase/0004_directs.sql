-- 0004_directs.sql
-- 1:1 다이렉트 (친구/DM). 닉네임으로 상대를 찾아 양쪽이 보는 행을 만든다.
-- 적용: Supabase 대시보드 → SQL Editor → 붙여넣고 Run.

create table public.directs (
  id          uuid primary key default gen_random_uuid(),
  user_a      uuid not null references auth.users on delete cascade,
  user_b      uuid not null references auth.users on delete cascade,
  -- 순서 무관 유니크 키 (중복 생성 방지)
  pair        text generated always as (
                least(user_a::text, user_b::text) || ':' ||
                greatest(user_a::text, user_b::text)
              ) stored,
  created_at  timestamptz not null default now(),
  unique (pair),
  check (user_a <> user_b)
);

alter table public.directs enable row level security;

-- 참여자(둘 중 하나)만 읽기/생성
create policy "directs read" on public.directs
  for select using (auth.uid() = user_a or auth.uid() = user_b);
create policy "directs insert" on public.directs
  for insert with check (auth.uid() = user_a or auth.uid() = user_b);
