"use client";

import { useEffect, useState } from "react";
import { FileText, Download, ImageOff } from "lucide-react";
import type { Message } from "../data";
import { signedUrl, formatBytes, formatDuration } from "../lib/attachments";

/**
 * 메시지 첨부 렌더링.
 * 버킷이 비공개라 표시 직전에 서명 URL을 받아온다(50분 캐시).
 * 업로드 중인 메시지는 로컬 objectURL로 먼저 보여준다 — 왕복 대기 없이 즉시 뜬다.
 */
export default function Attachment({ msg }: { msg: Message }) {
  const [url, setUrl] = useState<string | null>(msg.localUrl ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (msg.localUrl) {
      setUrl(msg.localUrl);
      return;
    }
    if (!msg.path) return;
    let alive = true;
    signedUrl(msg.path).then((u) => {
      if (!alive) return;
      if (u) setUrl(u);
      else setFailed(true);
    });
    return () => {
      alive = false;
    };
  }, [msg.path, msg.localUrl]);

  if (failed) {
    return (
      <div className="att att-gone">
        <ImageOff size={16} />
        <span>더 이상 볼 수 없는 첨부예요 (보관 기간 종료)</span>
      </div>
    );
  }

  if (msg.kind === "image") {
    return (
      <div className={"att att-image" + (msg.pending ? " uploading" : "")}>
        {url ? (
          <a href={url} target="_blank" rel="noreferrer">
            <img src={url} alt={msg.fileName ?? "이미지"} />
          </a>
        ) : (
          <div className="att-skeleton" />
        )}
        {msg.pending && <span className="att-progress">보내는 중…</span>}
      </div>
    );
  }

  if (msg.kind === "audio") {
    return (
      <div className={"att att-audio" + (msg.pending ? " uploading" : "")}>
        {url ? (
          <audio src={url} controls preload="none" />
        ) : (
          <div className="att-skeleton short" />
        )}
        {!!msg.durationMs && (
          <span className="att-dur">{formatDuration(msg.durationMs)}</span>
        )}
      </div>
    );
  }

  // file
  return (
    <a
      className={"att att-file" + (msg.pending ? " uploading" : "")}
      href={url ?? undefined}
      target="_blank"
      rel="noreferrer"
      download={msg.fileName ?? undefined}
    >
      <FileText size={18} />
      <span className="att-file-main">
        <span className="att-file-name">{msg.fileName ?? "파일"}</span>
        <span className="att-file-size">
          {msg.pending
            ? "보내는 중…"
            : msg.byteSize
            ? formatBytes(msg.byteSize)
            : ""}
        </span>
      </span>
      <Download size={16} />
    </a>
  );
}
