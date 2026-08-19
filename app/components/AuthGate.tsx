"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "../lib/supabase";

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
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const stored = data.session;

        // 저장된 세션이 아직 쓸 수 있는지 확인한다.
        // getSession() 은 localStorage 값을 검증 없이 돌려준다. 그래서 Supabase
        // 프로젝트를 갈아끼우면 옛 토큰이 계속 '로그인된 세션'처럼 보이고,
        // 이후 모든 요청이 조용히 실패해 화면이 로딩에서 멈춘다.
        if (stored) {
          const { error } = await supabase.auth.getUser();
          if (error) {
            await supabase.auth.signOut();
            if (alive) setSession(null);
            return;
          }
        }
        if (alive) setSession(stored);
      } catch (e) {
        console.error("[auth] 세션 확인 실패", e);
        if (alive) setSession(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      // private Realtime 채널은 JWT 로 인가된다 → 토큰이 바뀌면 실시간 쪽도 갱신해야
      // 만료 후 재구독이 인가 실패로 떨어지지 않는다.
      supabase.realtime.setAuth(s?.access_token ?? null);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);



  if (!isSupabaseConfigured) {
    return <ConfigMissing />;
  }

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
          <svg className="auth-google-icon" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
            <path fill="#FBBC05" d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
          </svg>
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

/** 환경변수 누락 — 로그인 화면 대신 무엇이 빠졌는지 알려준다 */
function ConfigMissing() {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <img src="/logo.svg" alt="Fadeaway" />
          <h1>Fadeaway</h1>
        </div>
        <p className="auth-sub">환경변수가 설정되지 않았어요</p>
        <p className="auth-msg">
          <code>NEXT_PUBLIC_SUPABASE_URL</code> 과{" "}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> 를 설정한 뒤 다시
          빌드해주세요. 이 값들은 빌드 시점에 번들에 포함되므로, 나중에
          추가했다면 재배포가 필요합니다.
        </p>
      </div>
    </div>
  );
}
