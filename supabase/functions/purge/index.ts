// Fadeaway — 보관 기간(14일) 만료분 실제 삭제
//
// [왜 Edge Function인가]
//   Storage 원본 파일은 Storage API를 거쳐야 진짜 지워진다.
//   (storage.objects 의 행만 SQL로 지우면 실제 파일은 S3에 남는다)
//   그 API는 service_role 권한이 필요한데 —
//   Edge Function 은 SUPABASE_SERVICE_ROLE_KEY 를 플랫폼이 자동 주입한다.
//   → 키를 코드/저장소/환경변수 어디에도 두지 않고 쓸 수 있다.
//
// [배포]
//   대시보드 → Edge Functions → Deploy a new function → 이 파일 붙여넣기
//   생성 화면의 이름 입력칸에 반드시 'purge' 를 넣을 것 — 그 값이 URL(slug)이 되고
//   slug 는 나중에 변경할 수 없다. (표시 이름만 바꾸면 URL 은 그대로다)
//   또는  supabase functions deploy purge
//
// [설정]
//   Settings → Verify JWT 를 끈다. 그러면 크론이 헤더 없이 부를 수 있다.
//
// [스케줄]
//   schema.sql §7-b 의 cron.schedule 블록 참조.
//
// [보안]
//   누가 호출하든 14일 지난 것만 지운다. 이미 아무도 못 읽는 데이터라
//   임의 호출로 생기는 피해가 없다. 그래서 별도 시크릿을 두지 않았다.
//   (남는 위험은 무료 호출량 낭비뿐 — 데이터 피해는 없다)

import { createClient } from "jsr:@supabase/supabase-js@2";

const RETENTION_DAYS = 14;
const BUCKET = "attachments";
const REMOVE_CHUNK = 100; // Storage remove 한 번에 보낼 경로 수

Deno.serve(async () => {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // 1) 만료 첨부 파일
  //    파일 수명 = 메시지 수명이라 14일 지난 객체는 전부 대상.
  //    업로드는 됐는데 메시지 insert 가 실패해 남은 고아 파일도 같이 정리된다.
  const { data: expired, error: listErr } = await admin.rpc(
    "expired_attachment_paths",
  );
  if (listErr) return json(500, { step: "list", error: listErr.message });

  const paths = (expired ?? []).map((r: { name: string }) => r.name);
  let filesRemoved = 0;
  for (let i = 0; i < paths.length; i += REMOVE_CHUNK) {
    const chunk = paths.slice(i, i + REMOVE_CHUNK);
    const { error } = await admin.storage.from(BUCKET).remove(chunk);
    if (error) {
      return json(500, { step: "remove", error: error.message, filesRemoved });
    }
    filesRemoved += chunk.length;
  }

  // 2) 만료 메시지 행
  //    pg_cron 도 매시간 같은 일을 한다(schema.sql §7). 여기 것은 이중 안전장치.
  const cutoff = new Date(
    Date.now() - RETENTION_DAYS * 86400_000,
  ).toISOString();
  const { data: deleted, error: delErr } = await admin
    .from("messages")
    .delete()
    .lt("created_at", cutoff)
    .select("id");
  if (delErr) {
    return json(500, { step: "messages", error: delErr.message, filesRemoved });
  }

  return json(200, {
    ok: true,
    cutoff,
    filesRemoved,
    messagesDeleted: deleted?.length ?? 0,
  });
});

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
