"use client";

import { useEffect, useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";

/**
 * 테마 전환 — 시스템 / 라이트 / 다크 3단.
 *
 * 선택값은 <html data-theme>로 나가고 CSS 토큰이 그걸 보고 바뀐다.
 * '시스템'은 속성을 지우는 것이라 prefers-color-scheme 로 되돌아간다.
 *
 * 첫 페인트 전 적용은 layout.tsx 의 인라인 스크립트가 한다.
 * 여기서 하면 다크로 한 번 그렸다가 라이트로 바뀌는 깜빡임이 보인다.
 */

export const THEME_KEY = "fadeaway-theme";
type Theme = "system" | "light" | "dark";

const NEXT: Record<Theme, Theme> = {
  system: "light",
  light: "dark",
  dark: "system",
};
const LABEL: Record<Theme, string> = {
  system: "시스템 설정",
  light: "라이트",
  dark: "다크",
};

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY) as Theme | null;
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch {
      /* 시크릿 모드 등에서 localStorage 접근이 막힐 수 있다 */
    }
  }, []);

  const apply = (t: Theme) => {
    setTheme(t);
    const root = document.documentElement;
    try {
      if (t === "system") {
        localStorage.removeItem(THEME_KEY);
        root.removeAttribute("data-theme");
      } else {
        localStorage.setItem(THEME_KEY, t);
        root.setAttribute("data-theme", t);
      }
    } catch {
      if (t === "system") root.removeAttribute("data-theme");
      else root.setAttribute("data-theme", t);
    }
  };

  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;

  return (
    <button
      className="theme-btn"
      onClick={() => apply(NEXT[theme])}
      title={`테마: ${LABEL[theme]} — 눌러서 ${LABEL[NEXT[theme]]}로`}
      aria-label={`테마 ${LABEL[theme]}`}
    >
      <Icon size={18} />
    </button>
  );
}
