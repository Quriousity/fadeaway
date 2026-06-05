import { supabase } from "./supabase";

/** sessions 테이블 한 행 */
export type SessionRow = {
  id: string;
  user_id: string;
  session_id: string;
  name: string | null;
  role: "owner" | "member";
  created_at: string;
};

/** 내 세션 목록 (최신순) */
export async function listMySessions(): Promise<SessionRow[]> {
  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[sessions] list 실패", error.message);
    return [];
  }
  return (data ?? []) as SessionRow[];
}

/**
 * 세션을 내 목록에 저장.
 * 같은 session_id가 이미 있으면(unique 충돌) 기존 행을 반환.
 */
export async function saveSession(
  sessionId: string,
  role: "owner" | "member",
  name?: string
): Promise<SessionRow | null> {
  const { data, error } = await supabase
    .from("sessions")
    .insert({ session_id: sessionId, role, name: name ?? null })
    .select()
    .single();

  if (error) {
    // 23505 = unique_violation → 이미 참여한 세션
    if ((error as any).code === "23505") {
      const { data: existing } = await supabase
        .from("sessions")
        .select("*")
        .eq("session_id", sessionId)
        .single();
      return (existing as SessionRow) ?? null;
    }
    console.error("[sessions] save 실패", error.message);
    return null;
  }
  return data as SessionRow;
}

/** 세션 나가기 (내 행만 삭제) */
export async function leaveSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from("sessions")
    .delete()
    .eq("session_id", sessionId);
  if (error) console.error("[sessions] leave 실패", error.message);
}

/** 세션 이름(내 라벨) 수정 */
export async function renameSession(
  sessionId: string,
  name: string
): Promise<boolean> {
  const { error } = await supabase
    .from("sessions")
    .update({ name })
    .eq("session_id", sessionId);
  if (error) {
    console.error("[sessions] 이름 수정 실패", error.message);
    return false;
  }
  return true;
}
