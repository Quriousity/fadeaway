import { supabase } from "./supabase";

export type ChatMsg = {
  id: string;
  sender: string;
  body: string;
  created_at: string;
};

/** 채널의 메시지 히스토리 (오래된→최신, 최대 200개) */
export async function loadMessages(channel: string): Promise<ChatMsg[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("id, sender, body, created_at")
    .eq("channel", channel)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) {
    console.error("[messages] 로드 실패", error.message);
    return [];
  }
  return (data ?? []) as ChatMsg[];
}

/** 메시지 저장 (sender는 RLS/기본값으로 본인) */
export async function sendMessage(
  channel: string,
  body: string
): Promise<ChatMsg | null> {
  const { data, error } = await supabase
    .from("messages")
    .insert({ channel, body })
    .select("id, sender, body, created_at")
    .single();
  if (error) {
    console.error("[messages] 전송 실패", error.message);
    return null;
  }
  return data as ChatMsg;
}
