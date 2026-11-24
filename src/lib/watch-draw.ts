"use client";

/** 추첨 버전 감시 (Results 화면도 사용). cleanup 함수를 돌려준다 */
export function watchDraw(onChange: () => void, intervalMs = 15000) {
  let stop = false;
  let last: string | null = null;
  let tick = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const check = async () => {
    if (stop) return;
    if (document.visibilityState === "visible") {
      tick++;
      try {
        const r = await fetch("/api/status", { cache: "no-store" });
        const v = r.ok ? ((await r.json()).drawVersion as string) : null;
        if (v && last !== null && v !== last) onChange();
        else if (tick % 4 === 0) onChange();
        if (v) last = v;
      } catch {}
    }
    if (!stop) timer = setTimeout(check, intervalMs * (0.8 + Math.random() * 0.4));
  };
  const onVis = () => { if (document.visibilityState === "visible") { onChange(); } };
  document.addEventListener("visibilitychange", onVis);
  check();
  return () => { stop = true; clearTimeout(timer); document.removeEventListener("visibilitychange", onVis); };
}
