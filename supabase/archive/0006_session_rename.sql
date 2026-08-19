-- 0006_session_rename.sql
-- 세션 이름(라벨) 수정을 위해 본인 행 update 허용.
-- 적용: Supabase 대시보드 → SQL Editor → 붙여넣고 Run.

create policy "own update" on public.sessions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
