import { NextResponse, type NextRequest } from "next/server";

/**
 * 방문객 페이지를 열 때 기기 쿠키(tp_dev)를 심는다.
 * 행사장 와이파이는 방문객 전원이 같은 공인 IP 라서, 요청 제한을 IP 가 아니라 기기 단위로 세기 위함 (lib/ratelimit.ts).
 * 개인정보·식별 정보는 없는 랜덤 값.
 */
const COOKIE = "tp_dev";
const TTL_SEC = 60 * 60 * 24 * 90;

export function proxy(req: NextRequest) {
  const res = NextResponse.next();
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(req.cookies.get(COOKIE)?.value ?? "")) {
    res.cookies.set(COOKIE, crypto.randomUUID().replace(/-/g, ""), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: TTL_SEC,
    });
  }
  return res;
}

export const config = {
  // 방문객 페이지에서만 (API·정적 파일 제외)
  matcher: ["/", "/results", "/board", "/admin"],
};
