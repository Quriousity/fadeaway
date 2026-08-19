"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Paperclip, Mic, Square } from "lucide-react";
import { formatDuration } from "../lib/attachments";

/**
 * 입력창 — 텍스트 + 이미지 + 파일 + 음성 메모.
 *
 * 음성 메모는 MediaRecorder로 브라우저에서 바로 녹음한다(서버 부담 0).
 * 코덱은 브라우저마다 다르므로 지원되는 것 중 첫 번째를 고른다
 * (크롬/파폭: webm+opus, 사파리: mp4/aac).
 */

const AUDIO_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

function pickAudioType() {
  if (typeof MediaRecorder === "undefined") return "";
  return AUDIO_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

export default function Composer({
  placeholder,
  canAttach,
  onSendText,
  onSendFile,
  onError,
}: {
  placeholder: string;
  canAttach: boolean;
  onSendText: (text: string) => void;
  onSendFile: (
    file: Blob,
    name: string,
    kind: "image" | "audio" | "file",
    durationMs?: number
  ) => void;
  onError: (msg: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const imgRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedRef = useRef(0);

  // 녹음 중 경과 시간 표시
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setElapsed(Date.now() - startedRef.current), 200);
    return () => clearInterval(t);
  }, [recording]);

  // 언마운트 시 녹음 중이면 정리 (마이크 LED 켜진 채 남지 않게)
  useEffect(() => {
    return () => {
      const r = recRef.current;
      if (r && r.state !== "inactive") r.stop();
      r?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    onSendText(text);
  };

  const pick = (
    e: React.ChangeEvent<HTMLInputElement>,
    kind: "image" | "file"
  ) => {
    const files = Array.from(e.target.files ?? []);
    files.forEach((f) => onSendFile(f, f.name, kind === "image" ? "image" : "file"));
    e.target.value = ""; // 같은 파일 다시 고를 수 있게
  };

  // 이미지 붙여넣기 (스크린샷 Ctrl+V)
  const onPaste = (e: React.ClipboardEvent) => {
    if (!canAttach) return;
    const items = Array.from(e.clipboardData.items).filter((i) =>
      i.type.startsWith("image/")
    );
    if (!items.length) return;
    e.preventDefault();
    items.forEach((i) => {
      const f = i.getAsFile();
      if (f) onSendFile(f, f.name || "붙여넣은 이미지.png", "image");
    });
  };

  const startRec = async () => {
    const type = pickAudioType();
    if (typeof MediaRecorder === "undefined") {
      onError("이 브라우저는 음성 메모를 지원하지 않아요");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      onError("마이크 권한이 필요해요");
      return;
    }

    const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const ms = Date.now() - startedRef.current;
      const blob = new Blob(chunksRef.current, {
        type: rec.mimeType || type || "audio/webm",
      });
      chunksRef.current = [];
      recRef.current = null;
      setRecording(false);
      setElapsed(0);
      if (ms < 700 || !blob.size) {
        onError("너무 짧아요 — 길게 눌러 녹음하세요");
        return;
      }
      const ext = (rec.mimeType || "audio/webm").includes("mp4") ? "m4a" : "webm";
      onSendFile(blob, `음성메모.${ext}`, "audio", ms);
    };

    recRef.current = rec;
    startedRef.current = Date.now();
    setElapsed(0);
    setRecording(true);
    rec.start();
  };

  const stopRec = () => recRef.current?.stop();

  return (
    <div className="composer">
      {canAttach && (
        <>
          <input
            ref={imgRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => pick(e, "image")}
          />
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            onChange={(e) => pick(e, "file")}
          />
          <button
            className="attach-btn"
            title="이미지 보내기"
            onClick={() => imgRef.current?.click()}
            disabled={recording}
          >
            <ImagePlus size={20} />
          </button>
          <button
            className="attach-btn"
            title="파일 보내기"
            onClick={() => fileRef.current?.click()}
            disabled={recording}
          >
            <Paperclip size={20} />
          </button>
        </>
      )}

      {recording ? (
        <div className="rec-bar">
          <span className="rec-dot" />
          <span className="rec-time">{formatDuration(elapsed)}</span>
          <span className="rec-hint">녹음 중 · 정지를 누르면 전송돼요</span>
        </div>
      ) : (
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          onPaste={onPaste}
          placeholder={placeholder}
        />
      )}

      {canAttach && (
        <button
          className={"attach-btn" + (recording ? " recording" : "")}
          title={recording ? "녹음 정지 후 전송" : "음성 메모"}
          onClick={() => (recording ? stopRec() : startRec())}
        >
          {recording ? <Square size={18} /> : <Mic size={20} />}
        </button>
      )}

      <button className="send" onClick={send} disabled={recording}>
        전송
      </button>
    </div>
  );
}
