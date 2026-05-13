import type { Metadata } from "next";
import { AuthSessionProvider } from "@/components/auth/AuthSessionProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tritree",
  description: "从一个 seed 念头开始，通过 AI 决定的一选三完成社交媒体内容。"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <AuthSessionProvider>{children}</AuthSessionProvider>
      </body>
    </html>
  );
}
