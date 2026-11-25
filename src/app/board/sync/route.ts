import { NextResponse, type NextRequest } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { AD_SEC, SHOW_MIN, type DrawShow, type ShowState } from "@/lib/show";

/**
 * 추첨 연출 설정 저장소. 직원 화면(추첨 실행 창)이 적고 전광판이 읽는다.
 * 백엔드와 DB 는 쓰지 않는다. 배포판은 Upstash Redis(REST)에, 주소가 없으면 서버 메모리에 둔다(로컬 개발용).
 * 읽기는 누구나(전광판은 로그인하지 않는다), 쓰기는 운영 콘솔에 로그인한 사람만.
 */
export const dynamic = "force-dynamic";

const KV_URL = (process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL ?? "").replace(/\/$/, "");
const KV_TOKEN = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? "";
const KEY = "board:show";

const g = globalThis as unknown as { __show?: { raw: string | null } };
const mem = (g.__show ??= { raw: null });

async function kv(cmd: string[]): Promise<string | null> {
  const r = await fetch(KV_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${KV_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`kv ${r.status}`);
  return ((await r.json()) as { result: string | null }).result ?? null;
}
async function read(): Promise<DrawShow | null> {
  const raw = KV_URL && KV_TOKEN ? await kv(["GET", KEY]) : mem.raw;
  if (!raw) return null;
  try { return JSON.parse(raw) as DrawShow; } catch { return null; }
}
async function write(show: DrawShow | null) {
  const raw = show ? JSON.stringify(show) : "";
  if (KV_URL && KV_TOKEN) await kv(["SET", KEY, raw]);
  else mem.raw = raw || null;
}

const reply = (show: DrawShow | null) => NextResponse.json({ show, now: Date.now() } satisfies ShowState, { headers: { "Cache-Control": "no-store" } });
const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
const clamp = (v: unknown, min: number, max: number, fallback: number) => (Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Math.round(Number(v)))) : fallback);

export async function GET() {
  try { return reply(await read()); } catch { return fail(503, "연출 설정 저장소에 연결하지 못했어요."); }
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin(req))) return fail(401, "로그인이 필요해요.");
  let b: Record<string, unknown>;
  try { b = (await req.json()) as Record<string, unknown>; } catch { return fail(400, "요청을 읽지 못했어요."); }
  try {
    if (b.action === "start") {
      const a = (b.ad ?? null) as Record<string, unknown> | null;
      const src = typeof a?.src === "string" ? a.src : "";
      // 광고 주소는 같은 사이트 경로나 https 주소만 받는다
      const ad = src && (/^https:\/\//.test(src) || /^\/[^/]/.test(src)) ? { src, video: a?.video === true, sec: clamp(a?.sec, AD_SEC.min, AD_SEC.max, AD_SEC.initial) } : null;
      const show: DrawShow = { startAt: Date.now(), ad, view: b.view === "pages" ? "pages" : "summary", showSec: clamp(b.showSec, SHOW_MIN.min * 60, SHOW_MIN.max * 60, SHOW_MIN.initial * 60) };
      await write(show);
      return reply(show);
    }
    const cur = await read();
    if (b.action === "skip") {
      // 광고를 지금 끝낸다 (직원이 "지금 바로 추첨"을 눌렀을 때)
      if (!cur?.ad) return reply(cur);
      const show: DrawShow = { ...cur, ad: { ...cur.ad, sec: Math.max(0, Math.min(cur.ad.sec, (Date.now() - cur.startAt) / 1000)) } };
      await write(show);
      return reply(show);
    }
    if (b.action === "cancel") {
      await write(null);
      return reply(null);
    }
    return fail(400, "알 수 없는 요청이에요.");
  } catch {
    return fail(503, "연출 설정 저장소에 연결하지 못했어요.");
  }
}
