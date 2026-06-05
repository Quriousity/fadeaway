"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

type AuthCtx = { user: User; signOut: () => Promise<void> };
const Ctx = createContext<AuthCtx | null>(null);

/** 로그인된 컴포넌트 안에서 현재 유저/로그아웃 접근 */
export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthGate");
  return v;
}

export default function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (loading) {
    return <div className="auth-loading">불러오는 중…</div>;
  }

  if (!session) {
    return <LoginScreen />;
  }

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <Ctx.Provider value={{ user: session.user, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

function LoginScreen() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMsg("가입 완료! 이메일 인증이 필요할 수 있어요.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
    } catch (e: any) {
      setMsg(e?.message ?? "오류가 발생했어요");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      setMsg(error.message);
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <img src="/logo.svg" alt="Fadeaway" />
          <h1>Fadeaway</h1>
        </div>
        <p className="auth-sub">
          {mode === "signin" ? "로그인하고 연결하세요" : "계정을 만드세요"}
        </p>

        <input
          className="auth-input"
          type="email"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <input
          className="auth-input"
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
        />

        <button className="auth-primary" onClick={submit} disabled={busy}>
          {mode === "signin" ? "로그인" : "가입하기"}
        </button>

        <div className="auth-divider">
          <span>또는</span>
        </div>

        <button className="auth-google" onClick={google} disabled={busy}>
          Google로 계속하기
        </button>

        {msg && <p className="auth-msg">{msg}</p>}

        <button
          className="auth-toggle"
          onClick={() => {
            setMode((m) => (m === "signin" ? "signup" : "signin"));
            setMsg(null);
          }}
        >
          {mode === "signin"
            ? "계정이 없나요? 가입하기"
            : "이미 계정이 있나요? 로그인"}
        </button>
      </div>
    </div>
  );
}
