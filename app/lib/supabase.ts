import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** 환경변수가 제대로 들어왔는지. false면 앱은 설정 안내 화면을 띄운다. */
export const isSupabaseConfigured = Boolean(url && anonKey);

if (!isSupabaseConfigured) {
  console.warn(
    "[supabase] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 미설정 — .env.local(로컬) 또는 배포처 환경변수 확인"
  );
}

/**
 * 브라우저용 단일 Supabase 클라이언트 (auth 세션 유지 + Realtime).
 *
 * 자리표시자를 쓰는 이유: createClient 는 빈 URL 을 받으면 즉시 throw 한다.
 * 그러면 Next.js 프리렌더 단계에서 터져 **빌드 전체가 실패**한다
 * ("Error: supabaseUrl is required" — 원인과 한참 떨어진 메시지가 나온다).
 * 환경변수 누락은 런타임에 안내할 문제지 빌드를 깨뜨릴 문제가 아니므로,
 * 여기서는 형식만 맞는 값으로 넘기고 isSupabaseConfigured 로 걸러낸다.
 */
export const supabase = createClient(
  url || "https://placeholder.supabase.co",
  anonKey || "placeholder-anon-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);
