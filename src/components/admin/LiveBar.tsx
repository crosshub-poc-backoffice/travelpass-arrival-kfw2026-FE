"use client";

import { useEffect, useState } from "react";
import { api } from "./api";

type Live =
  | { connected: true; active: number; registering: number; errorExitRecent: number; updatedAt: string }
  | { connected: false; reason?: string };

const POLL_MS = 5000;

/** 탭 아래 한 줄: 지금 접속 기기 · 등록 진행 중 (Kafka 실시간 집계). 어느 탭에서나 보인다 */
export default function LiveBar() {
  const [live, setLive] = useState<Live | null>(null);
  const [at, setAt] = useState(0);
  const [, tick] = useState(0);

  useEffect(() => {
    let stop = false;
    const load = () => {
      if (document.hidden) return;
      api<Live>("/api/admin/live")
        .then((d) => { if (!stop) { setLive(d); setAt(Date.now()); } })
        .catch(() => { if (!stop) setLive({ connected: false }); });
    };
    load();
    const t = setInterval(load, POLL_MS);
    const s = setInterval(() => tick((n) => n + 1), 1000);
    const vis = () => { if (!document.hidden) load(); };
    document.addEventListener("visibilitychange", vis);
    return () => { stop = true; clearInterval(t); clearInterval(s); document.removeEventListener("visibilitychange", vis); };
  }, []);

  if (!live) return null;
  if (!live.connected) {
    if (live.reason === "off") return null; // 설정 안 됨 → 아예 숨김
    return <div className="livebar off"><span className="dot" />실시간 연결 끊김 <span className="muted">· 다른 화면은 정상</span></div>;
  }
  const ago = Math.max(0, Math.round((Date.now() - at) / 1000));
  const warn = live.errorExitRecent > 0;
  return (
    <div className={`livebar${warn ? " warn" : ""}`}>
      <span className="dot" />
      <span>지금 접속 <b>{live.active}</b>대</span>
      <span className="sep">·</span>
      <span>등록 진행 중 <b>{live.registering}</b>명</span>
      {warn && (<><span className="sep">·</span><span className="alert">최근 5분 에러 후 이탈 <b>{live.errorExitRecent}</b>건</span></>)}
      <span className="ago">{ago}초 전</span>
    </div>
  );
}
