import type { Metadata } from "next";
import "./globals.css";
import AuthGate from "./components/AuthGate";

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
    <html lang="ko">
      <body>
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
