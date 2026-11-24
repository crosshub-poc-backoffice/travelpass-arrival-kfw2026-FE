/**
 * 시연 모드의 가짜 승객. 전광판 도착 목록과 가짜 당첨자가 모두 여기서 나온다.
 * 화면에만 뜨고 어디에도 저장되지 않는다. 실제 등록자는 시연 전광판에 올리지 않는다:
 * 가짜 당첨 발표에 실제 등록자 이름이 섞이면 본인이 진짜 당첨으로 알 수 있어서다.
 * 목록이 코드에 있어서 폰·전광판·직원 화면이 저장소 없이도 같은 사람들을 본다.
 */
import type { Rank } from "@/lib/config";

/** [전광판 이름, 출발지 코드]. 위에서부터 가장 최근 도착 */
export const MOCKS: [string, string][] = [
  ["JIWOO ✨", "SEOUL"], ["HARUTO 🗼", "JAPAN"], ["MINSEO 💜", "GYEONGGI"], ["EMILY ✈️", "USA"],
  ["DOHYUN 😎", "BUSAN"], ["LINH 🌸", "VIETNAM"], ["SEOYEON 🍀", "SEOUL"], ["OLIVER 🌏", "UK"],
  ["JUNHO 🔥", "INCHEON"], ["WEI 🐼", "CHINA"], ["YUNA ⭐", "DAEJEON"], ["LUCAS 🚀", "FRANCE"],
  ["HAEUN 💛", "SEOUL"], ["SAKURA 🌸", "JAPAN"], ["TAEYANG 🙌", "DAEGU"], ["AISHA ✨", "UAE"],
  ["SUBIN 🐱", "GYEONGGI"], ["NOAH 🧳", "CANADA"], ["CHAEWON 💙", "SEOUL"], ["ARJUN 📸", "INDIA"],
  ["HYUNWOO 🤩", "GWANGJU"], ["MEI 🌈", "TAIWAN"], ["SOYEON ❤️", "JEJU"], ["LIAM 🏝️", "AUSTRALIA"],
  ["JIHO 🐶", "SEOUL"], ["SOMCHAI 😀", "THAILAND"], ["NAYEON 🦄", "SEJONG"], ["HANNAH 🗺️", "GERMANY"],
  ["SIWOO 🥳", "ULSAN"], ["CHLOE 💳", "SINGAPORE"], ["EUNJI ✨", "GANGWON"], ["KENJI 😜", "JAPAN"],
  ["YEJIN 🤗", "SEOUL"], ["DANIEL ✈️", "USA"], ["GAEUN 🐻", "CHUNGNAM"], ["PUTRI 🌸", "INDONESIA"],
  ["MINJAE 🔥", "GYEONGNAM"], ["SOFIA 😍", "FRANCE"], ["DAEUN ⭐", "JEONBUK"], ["ETHAN 🌏", "HONG KONG"],
];

/** 번호가 이보다 작으면 가짜 승객에게 줄 앞 번호가 모자란다. 실제 등록자가 아직 적을 때만 쓰이는 하한 */
export const MIN_SEQ = MOCKS.length + 1;

/** 도착 간격(분). 순서대로 돌려 써서 들쭉날쭉하게 */
const GAPS = [2, 1, 4, 3, 1, 6, 2, 5, 3, 1, 7, 2];

export interface MockRow { seq: number; display_name: string; origin_code: string; created_at: string }

/** top = 가장 최근 가짜 승객의 번호, latest = 그 사람의 도착 시각(ms). 번호가 1 아래로 내려가면 거기서 끊는다 */
export function mockRows(top: number, latest: number): MockRow[] {
  const out: MockRow[] = [];
  let at = latest;
  for (let i = 0; i < MOCKS.length && top - i >= 1; i++) {
    out.push({ seq: top - i, display_name: MOCKS[i][0], origin_code: MOCKS[i][1], created_at: new Date(at).toISOString() });
    at -= GAPS[i % GAPS.length] * 60000;
  }
  return out;
}

/** 당첨자 화면 한 장(전광판 줄 수)에 들어가는 등수 배치: 1등 1 · 2등 3 · 3등 5 */
const RANKS: Rank[] = [1, 2, 2, 2, 3, 3, 3, 3, 3];

export interface MockWinner { rank: Rank; seq: number; display_name: string; origin_code: string; guest: boolean }

/** 같은 회차면 어느 화면에서나 같은 순서가 나오는 섞기 */
function shuffled<T>(list: T[], seed: number): T[] {
  const a = [...list];
  let s = (seed >>> 0) || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 가짜 당첨자 화면. 손님은 직원 화면에서 정한 등수 그대로 들어가고(그 등수의 첫 줄),
 * 나머지 자리는 가짜 승객에서 회차마다 다르게 뽑는다. 진짜 추첨은 어디에서도 일어나지 않는다.
 */
export function mockWinners(guest: { name: string; origin: string; rank: Rank; seq: number }, pool: MockRow[], epoch: number): MockWinner[] {
  const picks = shuffled(pool, epoch);
  let used = false;
  return RANKS.flatMap((rank): MockWinner[] => {
    if (rank === guest.rank && !used) {
      used = true;
      return [{ rank, seq: guest.seq, display_name: guest.name, origin_code: guest.origin, guest: true }];
    }
    const p = picks.shift();
    return p ? [{ rank, seq: p.seq, display_name: p.display_name, origin_code: p.origin_code, guest: false }] : [];
  });
}
