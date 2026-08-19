"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getMyProfile, setNickname, isNicknameTaken } from "../lib/profile";
import { useAuth } from "./AuthGate";

/**
 * 아이디 게이트 — 로그인 다음 단계.
 *
 * 이 앱에서 아이디는 곧 주소다. 친구를 아이디로 찾기 때문에,
 * 아이디가 없으면 상대가 나를 찾을 수 없고 나도 아무것도 못 한다.
 * 그래서 프로필에 숨겨두지 않고 진입 조건으로 못박는다.
 */

type IdCtx = {
  myId: string;
  /** 아이디 변경. 성공하면 컨텍스트 값도 갱신된다 */
  changeId: (next: string) => Promise<{ ok: boolean; error?: string }>;
};
const Ctx = createContext<IdCtx | null>(null);

export function useMyId() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useMyId must be used inside IdGate");
  return v;
}

export default function IdGate({ children }: { children: ReactNode }) {
  const [myId, setMyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMyProfile().then((p) => {
      setMyId(p?.nickname ?? null);
      setLoading(false);
    });
  }, []);

  const changeId = async (next: string) => {
    const res = await setNickname(next);
    if (res.ok) setMyId(next);
    return res;
  };

  if (loading) return <div className="auth-loading">불러오는 중…</div>;

  if (!myId) {
    return <IdSetup onDone={(v) => setMyId(v)} />;
  }

  return <Ctx.Provider value={{ myId, changeId }}>{children}</Ctx.Provider>;
}

/** 아이디 입력 화면. 중복확인을 입력 중에 미리 해서 저장 실패를 없앤다. */
export function IdSetup({
  current,
  onDone,
  onCancel,
}: {
  current?: string;
  onDone: (value: string) => void;
  onCancel?: () => void;
}) {
  const { user } = useAuth();
  const [value, setValue] = useState(current ?? "");
  const [status, setStatus] = useState<
    "idle" | "checking" | "ok" | "taken" | "invalid"
  >("idle");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const v = value.trim();
    setError(null);
    if (!v || v === current) return setStatus("idle");
    if (v.length < 2 || v.length > 20) return setStatus("invalid");
    if (!/^[a-zA-Z0-9가-힣_.]+$/.test(v)) return setStatus("invalid");
    setStatus("checking");
    const t = setTimeout(async () => {
      const taken = await isNicknameTaken(v, user.id);
      setStatus(taken ? "taken" : "ok");
    }, 400);
    return () => clearTimeout(t);
  }, [value, current, user.id]);

  const save = async () => {
    if (status !== "ok" || saving) return;
    setSaving(true);
    const res = await setNickname(value.trim());
    setSaving(false);
    if (res.ok) onDone(value.trim());
    else setError(res.error ?? "저장 실패");
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <img src="/logo.svg" alt="Fadeaway" />
          <h1>Fadeaway</h1>
        </div>
        <p className="auth-sub">
          {current ? "아이디 변경" : "쓸 아이디를 정하세요"}
        </p>

        <input
          className="auth-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder="2~20자 · 한글/영문/숫자/_/."
          maxLength={20}
          autoFocus
        />

        <p className={"id-status " + (status === "ok" ? "ok" : "bad")}>
          {status === "checking" && "확인 중…"}
          {status === "ok" && "✓ 사용할 수 있어요"}
          {status === "taken" && "이미 누가 쓰고 있어요"}
          {status === "invalid" && "2~20자, 한글/영문/숫자/_/. 만 돼요"}
          {status === "idle" && " "}
        </p>

        <button
          className="auth-primary"
          onClick={save}
          disabled={saving || status !== "ok"}
        >
          {saving ? "저장 중…" : current ? "변경하기" : "시작하기"}
        </button>

        {onCancel && (
          <button className="auth-toggle" onClick={onCancel}>
            취소
          </button>
        )}

        {error && <p className="auth-msg">{error}</p>}

        <p className="auth-note">
          친구는 이 아이디로 나를 찾습니다. 나중에 바꿀 수 있어요.
        </p>
      </div>
    </div>
  );
}
