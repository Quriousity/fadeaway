-- 0002_profiles.sql
-- 유저 프로필 (닉네임). 친구 추가는 닉네임으로 상대를 찾는 구조라 닉네임이 필수.
-- 적용: Supabase 대시보드 → SQL Editor → 붙여넣고 Run.

create table public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  nickname    text unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 닉네임 길이 제약 (2~20자)
alter table public.profiles
  add constraint nickname_len check (
    nickname is null or char_length(nickname) between 2 and 20
  );

alter table public.profiles enable row level security;

-- 로그인 유저는 닉네임으로 상대를 검색할 수 있어야 함 → 읽기 허용
create policy "profiles read" on public.profiles
  for select using (auth.uid() is not null);

-- 본인 행만 생성/수정
create policy "profiles insert own" on public.profiles
  for insert with check (id = auth.uid());
create policy "profiles update own" on public.profiles
  for update using (id = auth.uid());

drop policy "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles
  for update using (id = auth.uid() and nickname is null)
  with check (id = auth.uid());