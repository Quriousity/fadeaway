-- 0008_id_editable.sql
-- 이미 schema.sql 을 적용한 DB용 패치. 아이디(닉네임) 변경을 허용한다.
-- 새로 구축하는 경우엔 schema.sql 에 이미 반영돼 있어 실행할 필요 없다.
-- 적용: Supabase 대시보드 → SQL Editor → 붙여넣고 Run.

drop policy if exists "profiles update own" on public.profiles;

create policy "profiles update own" on public.profiles
  for update using (id = auth.uid())
  with check (id = auth.uid());
