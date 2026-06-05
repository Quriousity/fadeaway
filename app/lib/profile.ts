import { supabase } from "./supabase";

export type Profile = { id: string; nickname: string | null };

/** 내 프로필 조회 (없으면 null) */
export async function getMyProfile(): Promise<Profile | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, nickname")
    .eq("id", user.id)
    .maybeSingle();
  if (error) {
    console.error("[profile] 조회 실패", error.message);
    return null;
  }
  return (data as Profile) ?? null;
}

/** 닉네임이 (나 말고) 다른 사람에게 이미 쓰이는지 확인 */
export async function isNicknameTaken(
  nickname: string,
  selfId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("nickname", nickname)
    .maybeSingle();
  if (error) {
    console.error("[profile] 중복확인 실패", error.message);
    return false;
  }
  return !!data && data.id !== selfId;
}

/** 닉네임 설정/변경 (본인 프로필 upsert) */
export async function setNickname(
  nickname: string
): Promise<{ ok: boolean; error?: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요해요" };

  const { error } = await supabase.from("profiles").upsert(
    { id: user.id, nickname, updated_at: new Date().toISOString() },
    { onConflict: "id" }
  );
  if (error) {
    if ((error as any).code === "23505")
      return { ok: false, error: "이미 사용 중인 닉네임이에요" };
    if ((error as any).code === "23514")
      return { ok: false, error: "닉네임은 2~20자여야 해요" };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
