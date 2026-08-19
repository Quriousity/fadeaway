import { supabase } from "./supabase";
import type { Attachment } from "./attachments";

/** DB messages 한 행. kind='text'면 body만, 아니면 path 이하가 채워진다. */
export type ChatMsg = {
  id: string;
  sender: string;
  body: string;
  created_at: string;
  kind: "text" | "image" | "audio" | "file";
  path: string | null;
  file_name: string | null;
  mime: string | null;
  byte_size: number | null;
  duration_ms: number | null;
};

const COLS =
  "id, sender, body, created_at, kind, path, file_name, mime, byte_size, duration_ms";

/**
 * 채널의 메시지 히스토리 (오래된→최신, 최대 200개).
 * 14일 넘은 메시지는 RLS가 걸러서 애초에 안 온다.
 */
export async function loadMessages(channel: string): Promise<ChatMsg[]> {
  const { data, error } = await supabase
    .from("messages")
    .select(COLS)
    .eq("channel", channel)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) {
    console.error("[messages] 로드 실패", error.message);
    return [];
  }
  return (data ?? []) as ChatMsg[];
}

/** 텍스트 메시지 저장 (sender는 RLS/기본값으로 본인) */
export async function sendMessage(
  channel: string,
  body: string
): Promise<ChatMsg | null> {
  return insertRow({ channel, body, kind: "text" });
}

/**
 * 첨부 메시지 저장. body는 캡션(없으면 빈 문자열).
 * 업로드가 끝난 뒤에만 호출할 것 — path가 유효해야 한다.
 */
export async function sendAttachmentMessage(
  channel: string,
  attachment: Attachment,
  body = ""
): Promise<ChatMsg | null> {
  return insertRow({
    channel,
    body,
    kind: attachment.kind,
    path: attachment.path,
    file_name: attachment.file_name,
    mime: attachment.mime,
    byte_size: attachment.byte_size,
    duration_ms: attachment.duration_ms ?? null,
  });
}

async function insertRow(row: Record<string, unknown>): Promise<ChatMsg | null> {
  const { data, error } = await supabase
    .from("messages")
    .insert(row)
    .select(COLS)
    .single();
  if (error) {
    console.error("[messages] 전송 실패", error.message);
    return null;
  }
  return data as ChatMsg;
}
