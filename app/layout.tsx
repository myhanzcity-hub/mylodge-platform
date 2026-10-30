import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "마이롯지 | 나의 휴식이 돌아올 곳", template: "%s · 마이롯지" },
  description: "취향에 맞는 별장을 발견하고, 공동소유의 조건부터 이용 방식까지. 마이롯지의 새로운 휴식을 만나보세요.",
  robots: { index: false, follow: false },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
