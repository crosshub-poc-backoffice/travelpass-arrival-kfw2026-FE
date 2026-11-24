"use client";

/**
 * 분석 이벤트 전송 (page_view, result_seen, register_error). 실패해도 화면엔 영향 없음.
 * 누가 보냈는지는 서버가 쿠키로 판단한다.
 *
 * - 바로 보내지 않고 잠깐 모았다가 한 번에 보낸다 (최대 FLUSH_MS 또는 MAX_BATCH 건).
 *   피크 때 요청 수·DB INSERT 수가 이벤트 수만큼 늘지 않게 해서, 저장 대기로 버려지는 이벤트를 줄인다.
 * - 화면을 떠나거나 숨길 때는 남은 것을 sendBeacon 으로 보낸다 (페이지가 닫혀도 전송).
 * - 각 이벤트에 "보내는 시점 기준 몇 ms 전에 일어났는지(ago)"를 붙인다.
 *   서버는 DB 시계에서 그만큼 빼서 기록하므로, 모아 보내도 발생 시각이 밀리지 않는다 (기기 시계는 쓰지 않음).
 */
type Page = "register" | "done" | "results";
type Name = "page_view" | "result_seen" | "register_error" | "step_view";
type Pending = { name: Name; page: Page; props?: Record<string, unknown>; at: number };

const FLUSH_MS = 1500;
const MAX_BATCH = 20; // 서버가 한 요청에서 받는 최대 건수와 같게
const ENDPOINT = "/api/events";

let queue: Pending[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let hooked = false;

function payload(list: Pending[]) {
  const now = Date.now();
  return JSON.stringify({ events: list.map(({ name, page, props, at }) => ({ name, page, props, ago: Math.max(0, now - at) })) });
}

/** 모아둔 이벤트 전송. beacon=true 면 페이지가 닫히는 중이라 sendBeacon 우선 */
function flush(beacon = false) {
  if (timer) { clearTimeout(timer); timer = null; }
  while (queue.length) {
    const batch = queue.splice(0, MAX_BATCH);
    const body = payload(batch);
    try {
      if (beacon && typeof navigator !== "undefined" && navigator.sendBeacon?.(ENDPOINT, new Blob([body], { type: "application/json" }))) continue;
      void fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true, credentials: "same-origin" }).catch(() => {});
    } catch {}
  }
}

/** 화면을 숨기거나 떠날 때 남은 이벤트를 바로 보낸다 (한 번만 등록) */
function hook() {
  if (hooked || typeof window === "undefined") return;
  hooked = true;
  window.addEventListener("pagehide", () => flush(true));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(true); });
}

export function track(name: Name, page: Page, props?: Record<string, unknown>) {
  try {
    hook();
    queue.push({ name, page, props, at: Date.now() });
    if (queue.length >= MAX_BATCH) flush();
    else if (!timer) timer = setTimeout(() => flush(), FLUSH_MS);
  } catch {}
}

/** 탭 복귀 page_view 최소 간격. 앱 전환을 빠르게 반복해도 이 안에선 한 번만 센다 */
const RESUME_GAP_MS = 60_000;

/**
 * 화면이 열렸을 때 page_view, 숨겨졌던 탭이 다시 보일 때는 resume 표시를 붙인 page_view. cleanup 함수를 돌려준다.
 * 탭 복귀도 재방문 집계(30분 세션)에 쓰이므로 버리지 않고, 1분 안의 연속 복귀만 묶는다.
 */
export function trackViews(page: Page, props: () => Record<string, unknown> | undefined) {
  let last = Date.now();
  track("page_view", page, props());
  const onVis = () => {
    if (document.visibilityState !== "visible") return;
    if (Date.now() - last < RESUME_GAP_MS) return;
    last = Date.now();
    track("page_view", page, { ...props(), resume: true });
  };
  document.addEventListener("visibilitychange", onVis);
  return () => document.removeEventListener("visibilitychange", onVis);
}

/** 같은 브라우저에서 한 번만 (당첨 결과를 처음 본 순간) */
export function trackOnce(key: string, name: "result_seen", page: Page, props?: Record<string, unknown>) {
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
  } catch {}
  track(name, page, props);
}

const INVALID = /^(NAME_|ORIGIN_|PHONE_|EMAIL_|CONSENT_|BAD_)/;
const KNOWN = ["DUPLICATE", "BUSY", "UNAVAILABLE", "REGISTRATION_PAUSED", "RATE_LIMITED", "IDEMPOTENCY_MISMATCH", "SERVER", "LOOKUP_NOT_FOUND"];

/** 등록 중 사용자가 에러를 본 순간 (이탈 분석용). code: 서버 에러 코드, 없으면 NETWORK */
export function trackRegisterError(stage: "precheck" | "submit" | "lookup", code?: string | null) {
  const c = !code ? "NETWORK" : INVALID.test(code) ? "INVALID" : KNOWN.includes(code) ? code : "OTHER";
  track("register_error", "register", { code: c, stage });
}
