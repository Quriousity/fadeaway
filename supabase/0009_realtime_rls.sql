-- 0009_realtime_rls.sql
-- Realtime broadcast 를 RLS 로 막는다 (Realtime Authorization).
-- 적용: Supabase 대시보드 → SQL Editor → 붙여넣고 Run.
--
-- [문제]
--   messages 테이블에는 RLS 를 걸었지만, 실시간 전달은 Realtime broadcast 로 흐른다.
--   broadcast 채널은 기본이 '공개'다. anon key 만 있으면 누구나 임의 토픽을 구독할 수 있고
--   가짜 메시지를 밀어넣을 수도 있다. 즉 저장 경로에 건 RLS 를 실시간 경로가 우회한다.
--
-- [해결]
--   클라이언트가 채널을 private 으로 열면(config.private = true) Realtime 이 접속 시
--   JWT 로 인가를 검사하고, 그 판단을 realtime.messages 의 RLS 정책에 위임한다.
--   여기서 public.is_channel_member() 를 그대로 쓰므로 DB 와 실시간이 같은 규칙을 공유한다.
--
-- [주의] 이 SQL 과 클라이언트의 private:true 는 짝이다.
--        SQL 만 적용하고 앱이 옛 버전이면 채널이 안 열려 실시간 메시지가 끊긴다.
--        (새로고침하면 DB 히스토리는 그대로 보인다 — 저장은 별개 경로라서)

-- 토픽 형식: 'chat:<directs.id>'  → 콜론 뒤가 채널 식별자
drop policy if exists "realtime read own channels"  on realtime.messages;
drop policy if exists "realtime write own channels" on realtime.messages;

create policy "realtime read own channels" on realtime.messages
  for select to authenticated
  using (
    extension in ('broadcast', 'presence')
    and public.is_channel_member(split_part(realtime.topic(), ':', 2))
  );

create policy "realtime write own channels" on realtime.messages
  for insert to authenticated
  with check (
    extension in ('broadcast', 'presence')
    and public.is_channel_member(split_part(realtime.topic(), ':', 2))
  );

-- 확인
select policyname, cmd from pg_policies
where schemaname = 'realtime' and tablename = 'messages';

-- ---------------------------------------------------------------------------
-- 되돌리기 (실시간이 안 되면 이걸로 원복하고 알려줄 것)
-- ---------------------------------------------------------------------------
-- drop policy if exists "realtime read own channels"  on realtime.messages;
-- drop policy if exists "realtime write own channels" on realtime.messages;
-- → 그리고 앱의 signaling.ts 에서 private: true 를 제거
