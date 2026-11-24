import { NextResponse, type NextRequest } from "next/server";
import { FROM_WIDTH } from "@/lib/origins";
import { normalizeName, normalizeText } from "@/lib/validation";
import { KING_FX, type KingGuest, type KingState, type KingStep } from "@/lib/king";

/**
 * 시연 모드 상태 저장소. 폰·전광판·직원 화면이 이 주소 하나만 본다.
 * 백엔드와 DB 는 쓰지 않는다. 배포판은 Upstash Redis(REST)에 적고, 주소가 없으면 서버 메모리에 둔다(로컬 개발용).
 * 서버리스에서는 요청마다 메모리가 다를 수 있으므로 배포판에는 KV_REST_API_URL · KV_REST_API_TOKEN 을 넣는다.
 * KING_KEY 를 넣으면 상태를 바꾸는 요청에 같은 값이 있어야 한다.
 */
export const dynamic = "force-dynamic";

const KV_URL = (process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL ?? "").replace(/\/$/, "");
const KV_TOKEN = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? "";
const KING_KEY = process.env.KING_KEY ?? "";
const K_STATE = "king:state";
const K_BOARD = "king:beat:board";
const K_PHONE = "king:beat:phone";

type Cmd = (string | number)[];
const g = globalThis as unknown as { __king?: Map<string, string> };
const mem = (g.__king ??= new Map<string, string>());

/** GET · SET 만 쓴다. 결과는 명령 순서대로 */
async function run(cmds: Cmd[]): Promise<(string | null)[]> {
  if (!KV_URL || !KV_TOKEN) {
    return cmds.map(([op, key, val]) => {
      if (op === "SET") { mem.set(String(key), String(val)); return "OK"; }
      return mem.get(String(key)) ?? null;
    });
  }
  const r = await fetch(`${KV_URL}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KV_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmds),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`kv ${r.status}`);
  return ((await r.json()) as { result: string | null }[]).map((x) => x.result ?? null);
}

type Stored = Pick<KingState, "epoch" | "step" | "guest" | "fx" | "at">;

/** 저장소가 비어 있을 때 쓸 기본 손님. 환경변수 KING_NAME · KING_ORIGIN · KING_RANK 로 바꿀 수 있다 */
const DEFAULT_NAME = "LEE EOGWEON✨";
function defaultGuest(): KingGuest | null {
  const name = normalizeName(process.env.KING_NAME || DEFAULT_NAME);
  if (name.length < 2) return null;
  const rank = Number(process.env.KING_RANK ?? 2);
  return { name, origin: normalizeText(process.env.KING_ORIGIN ?? "SEOUL").slice(0, FROM_WIDTH) || "SEOUL", rank: ([1, 2, 3].includes(rank) ? rank : 2) as KingGuest["rank"], seq: 1 };
}
const EMPTY: Stored = { epoch: 0, step: 0, guest: defaultGuest(), fx: KING_FX, at: null };

function parse(raw: string | null): Stored {
  if (!raw) return EMPTY;
  try {
    const s = JSON.parse(raw) as Partial<Stored>;
    return { ...EMPTY, ...s, guest: s.guest ?? EMPTY.guest, fx: { ...KING_FX, ...s.fx } };
  } catch { return EMPTY; }
}
const num = (raw: string | null) => (raw && Number.isFinite(Number(raw)) ? Number(raw) : null);

function reply(s: Stored, board: string | null, phone: string | null) {
  const body: KingState = { ...s, beats: { board: num(board), phone: num(phone) }, now: Date.now() };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(req: NextRequest) {
  const who = req.nextUrl.searchParams.get("who");
  const now = String(Date.now());
  try {
    const beat: Cmd[] = who === "board" ? [["SET", K_BOARD, now]] : who === "phone" ? [["SET", K_PHONE, now]] : [];
    const out = await run([...beat, ["GET", K_STATE], ["GET", K_BOARD], ["GET", K_PHONE]]);
    const [state, board, phone] = out.slice(beat.length);
    return reply(parse(state), board, phone);
  } catch {
    return fail(503, "store");
  }
}

function toGuest(raw: unknown, seq: number): KingGuest | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const name = normalizeName(String(b.name ?? ""));
  const origin = normalizeText(String(b.origin ?? "")).slice(0, FROM_WIDTH);
  const rank = Number(b.rank);
  if (name.length < 2 || !origin || ![1, 2, 3].includes(rank)) return null;
  return { name, origin, rank: rank as KingGuest["rank"], seq };
}

export async function POST(req: NextRequest) {
  let b: Record<string, unknown>;
  try { b = (await req.json()) as Record<string, unknown>; } catch { return fail(400, "json"); }
  if (KING_KEY && b.key !== KING_KEY) return fail(403, "key");
  try {
    const [raw, board, phone] = await run([["GET", K_STATE], ["GET", K_BOARD], ["GET", K_PHONE]]);
    const cur = parse(raw);
    let next: Stored = cur;
    if (b.action === "setup") {
      const guest = toGuest(b.guest, cur.guest?.seq ?? 1);
      if (!guest) return fail(400, "guest");
      next = { ...cur, guest };
    } else if (b.action === "step") {
      const step = Number(b.step);
      // 같은 회차에서 앞으로만 간다. 늦게 도착한 옛 요청이 화면을 되돌리지 못하게
      if (Number(b.epoch) === cur.epoch && [1, 2, 3].includes(step) && step > cur.step) {
        // 등록되는 순간 화면이 같이 보낸 번호(실제 마지막 번호 + 1)를 한 번에 적는다. 따로 보내면 두 요청이 서로 덮어쓸 수 있다
        const seq = Math.floor(Number(b.seq));
        const guest = cur.guest && step === 1 && seq >= 1 && seq <= 9999 ? { ...cur.guest, seq } : cur.guest;
        next = { ...cur, guest, step: step as KingStep, at: cur.at ?? new Date().toISOString() };
      }
    } else if (b.action === "fx") {
      const f = (b.fx ?? {}) as Record<string, unknown>;
      next = { ...cur, fx: { solo: f.solo === true, confetti: f.confetti === true, sound: f.sound === true } };
    } else if (b.action === "reset") {
      next = { ...cur, epoch: Date.now(), step: 0, at: null };
    } else {
      return fail(400, "action");
    }
    if (next !== cur) await run([["SET", K_STATE, JSON.stringify(next)]]);
    return reply(next, board, phone);
  } catch {
    return fail(503, "store");
  }
}
