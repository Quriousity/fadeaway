import type { Metadata } from "next";
import "./globals.css";
import AuthGate from "./components/AuthGate";
import IdGate from "./components/IdGate";

export const metadata: Metadata = {
  title: "Fadeaway",
  description: "2주 뒤 사라지는 메신저",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/*
          첫 페인트 전에 저장된 테마를 적용한다.
          React 렌더를 기다리면 다크로 한 번 그렸다가 라이트로 바뀌는 깜빡임이 보인다.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('fadeaway-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`,
          }}
        />
      </head>
      <body>
        <AuthGate>
          <IdGate>{children}</IdGate>
        </AuthGate>
      </body>
    </html>
  );
}
