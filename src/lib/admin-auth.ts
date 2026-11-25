import type { NextRequest } from "next/server";

const BACKEND = (process.env.BACKEND_URL ?? "").replace(/\/$/, "") || "http://localhost:8080";

/** 요청을 보낸 브라우저가 운영 콘솔에 로그인돼 있는지 백엔드에 물어본다 (쿠키 tp_console 을 그대로 넘긴다) */
export async function isAdmin(req: NextRequest): Promise<boolean> {
  const cookie = req.headers.get("cookie");
  if (!cookie) return false;
  try {
    const r = await fetch(`${BACKEND}/api/auth/me`, { headers: { cookie }, cache: "no-store" });
    if (!r.ok) return false;
    return ((await r.json()) as { loggedIn?: boolean }).loggedIn === true;
  } catch {
    return false;
  }
}
