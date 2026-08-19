-- ===========================================================================
-- Fadeaway — 마스터 스키마
--
-- 이 파일 하나만 실행하면 DB가 완성된다.
-- 적용: Supabase 대시보드 → SQL Editor → 전체 붙여넣고 Run.
-- 여러 번 실행해도 안전하다 (idempotent).
--
-- 구성
--   0. 확장
--   1. profiles   — 닉네임
--   2. sessions   — 코드로 참여하는 방
--   3. directs    — 1:1
--   4. is_channel_member()  — 모든 접근 제어의 단일 기준
--   5. messages   — 텍스트 + 첨부
--   6. storage    — attachments 버킷 (비공개)
--   7. 14일 보관  — RLS 컷오프 + pg_cron 삭제
--   8. 검증
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 0. 확장
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto;   -- gen_random_uuid()


-- ---------------------------------------------------------------------------
-- 1. profiles — 닉네임
--    친구 추가가 "닉네임으로 상대 찾기" 구조라 닉네임이 사실상 아이디다.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  nickname    text unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.profiles drop constraint if exists nickname_len;
alter table public.profiles
  add constraint nickname_len check (
    nickname is null or char_length(nickname) between 2 and 20
  );

alter table public.profiles enable row level security;

drop policy if exists "profiles read"       on public.profiles;
drop policy if exists "profiles insert own" on public.profiles;
drop policy if exists "profiles update own" on public.profiles;

-- 닉네임으로 상대를 검색해야 하므로 로그인 유저에게는 읽기 허용
create policy "profiles read" on public.profiles
  for select using (auth.uid() is not null);

create policy "profiles insert own" on public.profiles
  for insert with check (id = auth.uid());

-- [주의] 닉네임은 한 번 정하면 못 바꾼다 (using 절의 nickname is null).
--        변경을 허용하려면 아래 정책의 "and nickname is null" 을 지울 것.
create policy "profiles update own" on public.profiles
  for update using (id = auth.uid() and nickname is null)
  with check (id = auth.uid());


-- ---------------------------------------------------------------------------
-- 2. sessions — 유저별 "내가 참여 중인 방" 목록
--    session_id(코드)를 아는 사람은 누구나 참여할 수 있다. 이게 세션의 정의다.
-- ---------------------------------------------------------------------------
create table if not exists public.sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  session_id  text not null,                    -- 공유용 코드 (예: 7K2P-9QXM)
  name        text,
  role        text not null default 'member',   -- 'owner'(내가 만듦) | 'member'(참여)
  created_at  timestamptz not null default now(),
  unique (user_id, session_id)
);

alter table public.sessions enable row level security;

drop policy if exists "own select" on public.sessions;
drop policy if exists "own insert" on public.sessions;
drop policy if exists "own update" on public.sessions;
drop policy if exists "own delete" on public.sessions;

create policy "own select" on public.sessions
  for select using (user_id = auth.uid());
create policy "own insert" on public.sessions
  for insert with check (user_id = auth.uid());
create policy "own update" on public.sessions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own delete" on public.sessions
  for delete using (user_id = auth.uid());


-- ---------------------------------------------------------------------------
-- 3. directs — 1:1 다이렉트
--    pair 생성 컬럼으로 (A,B)와 (B,A)를 같은 것으로 취급해 중복 생성을 막는다.
-- ---------------------------------------------------------------------------
create table if not exists public.directs (
  id          uuid primary key default gen_random_uuid(),
  user_a      uuid not null references auth.users on delete cascade,
  user_b      uuid not null references auth.users on delete cascade,
  pair        text generated always as (
                least(user_a::text, user_b::text) || ':' ||
                greatest(user_a::text, user_b::text)
              ) stored,
  created_at  timestamptz not null default now(),
  unique (pair),
  check (user_a <> user_b)
);

alter table public.directs enable row level security;

drop policy if exists "directs read"   on public.directs;
drop policy if exists "directs insert" on public.directs;

create policy "directs read" on public.directs
  for select using (auth.uid() = user_a or auth.uid() = user_b);
create policy "directs insert" on public.directs
  for insert with check (auth.uid() = user_a or auth.uid() = user_b);


-- ---------------------------------------------------------------------------
-- 4. is_channel_member() — 접근 제어의 단일 기준
--
--    messages RLS와 storage.objects RLS가 같은 규칙을 써야 한다.
--    규칙이 두 벌이 되는 순간 반드시 어긋나고, 어긋난 쪽이 구멍이 된다.
--
--    security definer 인 이유: storage 정책이 실행될 때도
--    public.sessions / public.directs 를 읽을 수 있어야 하기 때문.
-- ---------------------------------------------------------------------------
create or replace function public.is_channel_member(ch text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.sessions s
    where s.session_id = ch and s.user_id = auth.uid()
  ) or exists (
    select 1 from public.directs d
    where d.id::text = ch and (d.user_a = auth.uid() or d.user_b = auth.uid())
  );
$$;

grant execute on function public.is_channel_member(text) to authenticated;


-- ---------------------------------------------------------------------------
-- 5. messages — 텍스트 + 첨부
--    channel = 세션 코드(sessions.session_id) 또는 다이렉트 id(directs.id)
--    kind='text' 면 body만, 그 외는 path(Storage 경로)를 본다.
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  channel     text not null,
  sender      uuid not null default auth.uid() references auth.users on delete cascade,
  body        text not null default '',
  created_at  timestamptz not null default now(),
  kind        text not null default 'text',
  path        text,          -- attachments 버킷 내 경로
  file_name   text,          -- 원본 파일명 (표시용)
  mime        text,
  byte_size   integer,
  duration_ms integer        -- 음성 메모 길이
);

-- 기존 프로젝트에서 올라온 경우를 위한 보정
alter table public.messages alter column body set default '';
alter table public.messages
  add column if not exists kind        text not null default 'text',
  add column if not exists path        text,
  add column if not exists file_name   text,
  add column if not exists mime        text,
  add column if not exists byte_size   integer,
  add column if not exists duration_ms integer;

alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages
  add constraint messages_kind_check check (kind in ('text', 'image', 'audio', 'file'));

-- 첨부 메시지는 path가 반드시 있어야 한다 (path 없는 image 행 = 깨진 말풍선)
alter table public.messages drop constraint if exists messages_path_check;
alter table public.messages
  add constraint messages_path_check check (kind = 'text' or path is not null);

create index if not exists messages_channel_time on public.messages (channel, created_at);
create index if not exists messages_created_at   on public.messages (created_at);

alter table public.messages enable row level security;

drop policy if exists "messages read"   on public.messages;
drop policy if exists "messages insert" on public.messages;

-- 14일 컷오프가 여기 들어있는 게 핵심이다. §7 참조.
create policy "messages read" on public.messages
  for select using (
    created_at > now() - interval '14 days'
    and public.is_channel_member(channel)
  );

create policy "messages insert" on public.messages
  for insert with check (
    sender = auth.uid() and public.is_channel_member(channel)
  );

-- update/delete 정책 없음 → 사용자는 메시지를 수정·삭제할 수 없다.
-- 삭제는 오직 보관 정책(§7)만 한다.


-- ---------------------------------------------------------------------------
-- 6. Storage — attachments 버킷 (비공개)
--    경로 규칙: <channel>/<uuid>.<ext>
--    첫 폴더가 채널이라 is_channel_member() 로 그대로 막을 수 있다.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 10485760)   -- 10MB
on conflict (id) do update
  set public = false, file_size_limit = 10485760;

drop policy if exists "attachments read"   on storage.objects;
drop policy if exists "attachments insert" on storage.objects;

create policy "attachments read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'attachments'
    and public.is_channel_member((storage.foldername(name))[1])
  );

create policy "attachments insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and public.is_channel_member((storage.foldername(name))[1])
  );

-- update/delete 정책 없음 → 사용자는 올린 파일을 지울 수 없다.
-- 보관 정책이 사용자 조작에 흔들리지 않게 하기 위함.


-- ---------------------------------------------------------------------------
-- 7. 14일 보관
--
--    2단 구조다. 크론 주기에 "2주 뒤 사라진다"가 인질로 잡히지 않게 하려는 것.
--
--      (1) 노출 차단 — messages RLS의 created_at 컷오프 (§5)
--          14일 되는 순간 즉시. 크론이 죽어 있어도 아무도 못 읽는다.
--      (2) 실제 삭제 — 아래
--          DB 행     : pg_cron 이 Postgres 안에서 직접 삭제. 키 불필요.
--          Storage   : Edge Function 'purge' 를 pg_cron 이 호출.
--                      키는 플랫폼이 함수에 자동 주입하므로 어디에도 저장하지 않는다.
-- ---------------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_cron;

  -- 같은 이름으로 다시 부르면 갱신된다 (중복 등록 안 됨)
  perform cron.schedule(
    'fadeaway-purge-messages',
    '17 * * * *',                              -- 매시 17분
    $cmd$delete from public.messages where created_at < now() - interval '14 days'$cmd$
  );
  raise notice 'pg_cron 등록 완료 — 메시지 행은 매시간 실제 삭제됩니다';
exception when others then
  raise notice 'pg_cron 등록 실패(%). 대시보드 Database → Extensions 에서 pg_cron 을 켠 뒤 이 DO 블록만 다시 실행하세요.', sqlerrm;
end $$;


-- 만료된 첨부 파일 경로 조회 — Edge Function 'purge' 가 호출한다.
--
-- [왜 SQL만으로 못 지우나]
--   storage.objects 의 행을 지워도 실제 파일은 S3에 남는다.
--   진짜 삭제는 Storage API(remove)를 거쳐야 하고, 그건 service_role 권한이 필요하다.
--   그래서 Edge Function 을 쓴다 — 그쪽은 키를 플랫폼이 자동 주입하므로
--   우리가 키를 복사하거나 저장할 일이 없다. (supabase/functions/purge/index.ts)
--
-- 파일 수명 = 메시지 수명이므로 14일 지난 객체는 전부 대상.
-- (업로드는 됐는데 메시지 insert 가 실패해 남은 고아 파일도 같이 정리된다)
create or replace function public.expired_attachment_paths(
  older_than interval default interval '14 days'
)
returns table (name text)
language sql
stable
security definer
set search_path = public, storage
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'attachments'
    and o.created_at < now() - older_than;
$$;

revoke execute on function public.expired_attachment_paths(interval) from public, anon, authenticated;
grant   execute on function public.expired_attachment_paths(interval) to service_role;


-- ---------------------------------------------------------------------------
-- 7-b. Storage 원본 삭제 스케줄 (첨부를 쓴다면 필수)
--
--  먼저 Edge Function 을 배포할 것:
--    대시보드 → Edge Functions → Deploy a new function → 이름 'purge'
--    → supabase/functions/purge/index.ts 내용 붙여넣고 Deploy
--
--    이름(name) 이 아니라 slug 가 URL 이 된다. slug 는 생성 후 변경 불가이므로
--    생성 화면의 이름 입력칸에 처음부터 'purge' 를 넣을 것.
--
--  그리고 그 함수의 Settings 에서 Verify JWT 를 끈다.
--    이 함수는 14일 지난 것만 지운다 — 이미 아무도 못 읽는 데이터라
--    누가 호출해도 피해가 없다. 그래서 인증을 붙이지 않는다.
--    대신 키 관리가 통째로 사라져서, 나중에 키를 교체해도 안 깨진다.
--
--  스케줄 등록: <PROJECT_REF> 를 채우고 주석 해제 후 실행.
--  (대시보드 Integrations → Cron 으로 해도 되지만, 거기서 만든 job 은
--   Authorization 헤더가 비어 있어 Verify JWT 가 켜져 있으면 401 이 난다)
-- ---------------------------------------------------------------------------
-- create extension if not exists pg_net;
--
-- select cron.schedule(
--   'fadeaway-purge-attachments',
--   '23 3 * * *',                              -- 매일 03:23 UTC
--   $cmd$
--     select net.http_post(
--       url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/purge',
--       headers := '{"Content-Type":"application/json"}'::jsonb
--     );
--   $cmd$
-- );
--
-- 확인:
--   select net.http_post(url := 'https://<PROJECT_REF>.supabase.co/functions/v1/purge',
--                        headers := '{"Content-Type":"application/json"}'::jsonb);
--   select status_code, content from net._http_response order by id desc limit 1;
--   → 200 {"ok":true,"cutoff":"...","filesRemoved":0,"messagesDeleted":0}


-- ---------------------------------------------------------------------------
-- 8. 검증 — 아래 결과가 기대와 같은지 확인
-- ---------------------------------------------------------------------------
select 'tables' as check, string_agg(tablename, ', ' order by tablename) as result
from pg_tables where schemaname = 'public'
union all
select 'bucket', coalesce(
         (select id || ' / public=' || public::text || ' / limit=' || file_size_limit
          from storage.buckets where id = 'attachments'), '없음')
union all
select 'cron', coalesce(
         (select string_agg(jobname || ' @ ' || schedule, ' | ' order by jobname)
          from cron.job where jobname like 'fadeaway-%'), '미등록 — pg_cron 확인');
