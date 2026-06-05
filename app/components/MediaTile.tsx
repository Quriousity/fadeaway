"use client";

import { useEffect, useReducer, useRef } from "react";
import { User } from "lucide-react";

/**
 * 참가자 1명의 미디어 타일. 스트림에 켜진 비디오 트랙이 있으면 영상을, 없으면 아바타를 표시.
 * 통화 중 트랙이 추가/제거될 때(add/removetrack) 강제 리렌더해 영상↔아바타 전환을 반영.
 * self 타일은 음소거(에코 방지)로 자기 영상만 미리보기.
 */
export default function MediaTile({
  stream,
  label,
  self = false,
  muted = false,
}: {
  stream: MediaStream | null;
  label: string;
  self?: boolean;
  muted?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [, force] = useReducer((x) => x + 1, 0);

  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
    if (!stream) return;
    const on = () => force();
    stream.addEventListener("addtrack", on);
    stream.addEventListener("removetrack", on);
    return () => {
      stream.removeEventListener("addtrack", on);
      stream.removeEventListener("removetrack", on);
    };
  }, [stream]);

  const hasVideo =
    !!stream && stream.getVideoTracks().some((t) => t.readyState === "live");

  return (
    <div className="tile">
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={self || muted}
        className={"tile-video" + (hasVideo ? "" : " hidden")}
      />
      {!hasVideo && (
        <div className="tile-avatar">
          <User size={36} />
        </div>
      )}
      <span className="tile-label">
        {label}
        {self && <span className="me-tag">나</span>}
      </span>
    </div>
  );
}
