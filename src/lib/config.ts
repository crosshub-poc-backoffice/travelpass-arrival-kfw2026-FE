export const TZ = "Asia/Seoul";
export const FLIGHT_PREFIX = process.env.NEXT_PUBLIC_FLIGHT_PREFIX ?? "TP";
export const EVENT_NAME = process.env.NEXT_PUBLIC_EVENT_NAME ?? "KOREA FINTECH WEEK 2026";

/** 행사일 (KST, YYYY-MM-DD). 추첨 회차는 이 날짜 중 하루를 골라 시각만 정한다 */
export const EVENT_DAYS = (process.env.NEXT_PUBLIC_EVENT_DAYS ?? "2026-11-25,2026-11-26,2026-11-27").split(",").map((d) => d.trim()).filter(Boolean);

/** 전광판 도착 목록 줄 수 (상단 1등 고정 줄 제외) */
export const BOARD_ROWS = 9;
export const NAME_MIN = 2;
export const NAME_MAX = 12;

/** 동의 문구가 바뀌면 버전을 올린다. participants.consent_version 에 저장됨 */
export const CONSENT_VERSION = "2026-11-v4";

export type Rank = 1 | 2 | 3;
export type PrizeType = "mask" | "rank1" | "rank2" | "rank3";

function parseStock(): Record<Rank, number> {
  const raw = (process.env.PRIZE_STOCK ?? "6,100,200").split(",").map((s) => parseInt(s.trim(), 10));
  return { 1: raw[0] || 6, 2: raw[1] || 100, 3: raw[2] || 200 };
}

export const PRIZES: Record<Rank, { name: string; stock: number }> = {
  1: { name: "캐리어", stock: parseStock()[1] },
  2: { name: "수면안대", stock: parseStock()[2] },
  3: { name: "목베개", stock: parseStock()[3] },
};
/**
 * 행사 고정 추첨 일정: 행사일마다 DRAW_TIMES 에 마감·추첨, 회차마다 DRAW_QTY 만큼.
 * 3일 × 2회 = 6회차, 6/96/198개라 전체 수량 안에 든다. 대상은 직전 회차 이후 등록자 (raffle.drawRound)
 */
export const DRAW_TIMES = ["13:00", "17:00"];
/** 추첨 후 전광판이 당첨자 화면으로 바뀌어 있는 시간 */
export const WINNERS_SHOW_MS = 10 * 60 * 1000;

/** 1~3등 수령 기한 = 발표 후 이 시간. 현장에 있는 사람만 받게 짧게 둔다 (회차별로 콘솔에서 고칠 수 있다) */
export const CLAIM_WINDOW_MIN = 30;

/** 회차에 미리 안내한 수령 시간(분) = 수령 기한 − 추첨 예정 시각. 수령 기한이 없으면 null.
 *  추첨할 때 수령 기한을 "실제 추첨 순간 + 이 시간(이상)"으로 다시 잡는다 (raffle.drawRound) */
export function plannedClaimMin(r: { cutoff_at: string; announce_at: string | null; claim_until: string | null }) {
  if (!r.claim_until) return null;
  return Math.max(0, Math.round((new Date(r.claim_until).getTime() - new Date(r.announce_at ?? r.cutoff_at).getTime()) / 60000));
}
export const CLAIM_MIN_MAX = 240;

export const DRAW_QTY: Record<Rank, number> = { 1: 1, 2: 16, 3: 33 };

/** 추가 질문(설문) 문항 수. 모두 답하면 당첨 확률 2배 */
export const SURVEY_COUNT = 7;
/** 등록 마감 = 추첨 이만큼 전. 그 사이는 등록 없이 설문만 마무리하는 시간 */
export const REG_CLOSE_MIN = 5;
/** 설문을 새로 시작할 수 있는 기한 = 추첨 이만큼 전 (이후엔 버튼을 내린다. 이미 시작한 사람은 추첨 시각까지) */
export const BONUS_CLOSE_MIN = 2;

/**
 * 일정 회차 목록. 이름은 "수요일 오전 / 수요일 오후" (그날 첫 회차가 오전, 둘째가 오후. 13:00 추첨이어도 오전 회차).
 * DRAW_TIMES 정각에 추첨·발표, 등록 마감은 그 REG_CLOSE_MIN 분 전, 수령 기한은 발표 후 CLAIM_WINDOW_MIN 분 (콘솔에서 고칠 수 있다)
 */
export function scheduleRounds() {
  const kst = (day: string, hm: string) => new Date(`${day}T${hm}:00+09:00`);
  const weekday = (day: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: TZ, weekday: "long" }).format(kst(day, "12:00"));
  return EVENT_DAYS.flatMap((day) => DRAW_TIMES.map((t, i) => {
    const announce = kst(day, t);
    return { name: `${weekday(day)} ${i === 0 ? "오전" : "오후"}`, cutoff: new Date(announce.getTime() - REG_CLOSE_MIN * 60000), announce, claimUntil: new Date(announce.getTime() + CLAIM_WINDOW_MIN * 60000) };
  }));
}

export const PRIZE_LABEL: Record<PrizeType, string> = {
  // 마스크팩은 이제 화면에서 다루지 않는다. 백엔드 기록에 남은 옛 값을 읽을 때만 쓰는 이름
  mask: "마스크팩",
  rank1: `1등 · ${PRIZES[1].name}`,
  rank2: `2등 · ${PRIZES[2].name}`,
  rank3: `3등 · ${PRIZES[3].name}`,
};

export function flightCode(seq: number) {
  return `${FLIGHT_PREFIX} ${String(seq).padStart(4, "0")}`;
}

export function hhmm(iso: string | Date) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TZ,
  }).format(new Date(iso));
}

export function fmtDateTime(iso: string | Date | null | undefined) {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TZ,
  }).format(new Date(iso));
}
