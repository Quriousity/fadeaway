import { supabase } from "./supabase";

/**
 * 첨부(이미지/음성/파일) 업로드 & 열람.
 *
 * 버킷은 비공개다. 따라서 URL을 그냥 못 만들고 매번 서명 URL을 받아야 한다.
 * (공개 버킷이면 링크 아는 사람 누구나 열 수 있어 "휘발" 약속과 충돌)
 * 경로는 <channel>/<uuid>.<ext> — 첫 폴더가 채널이라 Storage RLS가 멤버십으로 막는다.
 */

export const BUCKET = "attachments";
export const MAX_BYTES = 10 * 1024 * 1024; // 10MB — 버킷 설정과 동일

export type AttachKind = "image" | "audio" | "file";

export type Attachment = {
  kind: AttachKind;
  path: string;
  file_name: string;
  mime: string;
  byte_size: number;
  duration_ms?: number;
};

/** mime/파일명으로 메시지 종류 판정 */
export function kindOf(mime: string, name = ""): AttachKind {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (/\.(png|jpe?g|gif|webp|avif)$/i.test(name)) return "image";
  return "file";
}

function extOf(name: string, mime: string) {
  const m = name.match(/\.([a-z0-9]{1,8})$/i);
  if (m) return m[1].toLowerCase();
  const sub = mime.split("/")[1] ?? "bin";
  return sub.split(";")[0].replace(/[^a-z0-9]/gi, "") || "bin";
}

function uuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

export function formatDuration(ms: number) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * 파일을 채널 폴더에 올린다. 성공하면 messages에 넣을 메타데이터를 돌려준다.
 * 여기서 DB에 쓰지는 않는다 — 호출부가 업로드 성공 후에 메시지를 만든다.
 */
export async function uploadAttachment(
  channel: string,
  file: Blob,
  opts: { name: string; kind?: AttachKind; durationMs?: number }
): Promise<{ ok: true; attachment: Attachment } | { ok: false; error: string }> {
  if (file.size > MAX_BYTES)
    return { ok: false, error: `파일이 너무 커요 (최대 ${formatBytes(MAX_BYTES)})` };
  if (file.size === 0) return { ok: false, error: "빈 파일이에요" };

  const mime = file.type || "application/octet-stream";
  const kind = opts.kind ?? kindOf(mime, opts.name);
  const path = `${channel}/${uuid()}.${extOf(opts.name, mime)}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: mime, upsert: false });

  if (error) {
    console.error("[attachments] 업로드 실패", error.message);
    return { ok: false, error: "업로드 실패 — " + error.message };
  }

  return {
    ok: true,
    attachment: {
      kind,
      path,
      file_name: opts.name,
      mime,
      byte_size: file.size,
      ...(opts.durationMs ? { duration_ms: Math.round(opts.durationMs) } : {}),
    },
  };
}

/**
 * 서명 URL — 1시간짜리를 받아 50분간 캐시한다.
 * 같은 이미지를 리렌더마다 새로 서명하지 않기 위한 최소 캐시.
 */
const SIGN_TTL_SEC = 3600;
const CACHE_MS = 50 * 60 * 1000;
const cache = new Map<string, { url: string; at: number }>();
const inflight = new Map<string, Promise<string | null>>();

export async function signedUrl(path: string): Promise<string | null> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.url;

  const pending = inflight.get(path);
  if (pending) return pending;

  const p = (async () => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGN_TTL_SEC);
    if (error || !data) {
      // 14일이 지나 purge 됐거나 채널 멤버가 아님 — 조용히 실패시키고 UI에서 안내
      console.warn("[attachments] 서명 URL 실패", path, error?.message);
      return null;
    }
    cache.set(path, { url: data.signedUrl, at: Date.now() });
    return data.signedUrl;
  })().finally(() => inflight.delete(path));

  inflight.set(path, p);
  return p;
}
