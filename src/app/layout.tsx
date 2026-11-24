import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Outfit } from "next/font/google";
// 한글 본문 글꼴. 쓰인 글자가 든 조각만 내려받는다 (기기마다 다른 기본 글꼴 대신 어디서나 같은 모양)
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";
import { I18nProvider } from "@/components/i18n-client";

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

/** 큰 숫자(카운트다운)용. TravelPass 로고와 같은 계열의 둥근 산세리프 */
const display = Outfit({ variable: "--font-display", subsets: ["latin"], weight: ["500", "600"] });

export const metadata: Metadata = {
  title: "TravelPass Arrival",
  description: "Put your name on the airport arrivals board · Korea Fintech Week 2026",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b0b0d",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${mono.variable} ${display.variable}`}>
      <body><I18nProvider>{children}</I18nProvider></body>
    </html>
  );
}
