import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "小数数学辅导",
  description: "初中数学智能辅导助手",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
