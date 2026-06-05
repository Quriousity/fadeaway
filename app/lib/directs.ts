import { supabase } from "./supabase";

export type Direct = { id: string; otherId: string; otherNick: string };

/** 닉네임으로 사용자 찾기 (없으면 null) */
export async function findUserByNickname(
  nickname: string
): Promise<{ id: string; nickname: string } | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, nickname")
    .eq("nickname", nickname)
    .maybeSingle();
  if (error) {
    console.error("[directs] 닉네임 조회 실패", error.message);
    return null;
  }
  return (data as { id: string; nickname: string }) ?? null;
}

/** 상대와의 다이렉트 생성(있으면 기존 것 반환) */
export async function startDirect(
  otherId: string
): Promise<{ id: string } | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("directs")
    .insert({ user_a: user.id, user_b: otherId })
    .select("id")
    .single();

  if (error) {
    if ((error as any).code === "23505") {
      // 이미 존재 → pair로 조회
      const pair = [user.id, otherId].sort().join(":");
      const { data: ex } = await supabase
        .from("directs")
        .select("id")
        .eq("pair", pair)
        .single();
      return ex ? { id: (ex as any).id } : null;
    }
    console.error("[directs] 생성 실패", error.message);
    return null;
  }
  return data as { id: string };
}

/** 내 다이렉트 목록 (상대 닉네임 포함) */
export async function listMyDirects(): Promise<Direct[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("directs")
    .select("id, user_a, user_b")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[directs] 목록 실패", error.message);
    return [];
  }
  const rows = (data ?? []) as { id: string; user_a: string; user_b: string }[];
  const otherIds = rows.map((r) => (r.user_a === user.id ? r.user_b : r.user_a));

  const nickMap = new Map<string, string>();
  if (otherIds.length) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, nickname")
      .in("id", otherIds);
    (profs ?? []).forEach((p: any) => nickMap.set(p.id, p.nickname));
  }

  return rows.map((r) => {
    const otherId = r.user_a === user.id ? r.user_b : r.user_a;
    return { id: r.id, otherId, otherNick: nickMap.get(otherId) ?? "사용자" };
  });
}
