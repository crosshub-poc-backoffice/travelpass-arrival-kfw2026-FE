"use client";

import { useEffect, useState } from "react";
import { api } from "./api";
import Participants from "./Participants";
import Rounds from "./Rounds";
import Claims from "./Claims";
import Stats from "./Stats";
import Logs from "./Logs";
import LiveBar from "./LiveBar";
import AdPlayer from "./AdPlayer";

type Tab = "participants" | "rounds" | "claims" | "stats" | "logs" | "video";

export default function AdminConsole() {
  const [loggedIn, setLoggedIn] = useState<boolean | undefined>(undefined);
  const [me, setMe] = useState<string>("");
  const [name, setName] = useState("");
  const [allowReset, setAllowReset] = useState(false);
  const [tab, setTab] = useState<Tab>("claims");
  const [key, setKey] = useState("");
  const [err, setErr] = useState<string | null>(null);
  /** 참가자 수령 QR 을 스캔해 들어온 경우 (/admin?qr=토큰). 주소에서는 바로 지우고, 로그인 뒤 수령 탭에서 쓴다 */
  const [scan, setScan] = useState<string | null>(null);

  useEffect(() => {
    const qr = new URLSearchParams(window.location.search).get("qr");
    if (qr) { setScan(qr); window.history.replaceState(null, "", window.location.pathname); }
    api<{ loggedIn: boolean; name: string | null; allowReset: boolean }>("/api/auth/me").then((d) => { setLoggedIn(d.loggedIn); setMe(d.name ?? ""); setAllowReset(d.allowReset); if (d.loggedIn && !qr) setTab("participants"); }).catch(() => setLoggedIn(false));
  }, []);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      const d = await api<{ name: string }>("/api/auth/login", { method: "POST", body: JSON.stringify({ key, name }) });
      setLoggedIn(true);
      setMe(d.name);
      setTab(scan ? "claims" : "participants");
      setKey("");
    } catch (e) { setErr((e as Error).message); }
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    setLoggedIn(false);
  }

  if (loggedIn === undefined) return <div className="card"><p className="lead">확인 중…</p></div>;
  if (!loggedIn) {
    return (
      <form className="card" onSubmit={login}>
        <h1 className="title" style={{ marginBottom: scan ? undefined : 24 }}>콘솔 로그인</h1>
        {scan && <p className="lead">로그인하면 스캔한 참가자의 수령 화면이 바로 열려요.</p>}
        {err && <div className="alert">{err}</div>}
        <div className="field"><label htmlFor="staff-name">이름</label><input id="staff-name" className="input" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} placeholder="예: 이선용" autoFocus /></div>
        <div className="field"><label htmlFor="staff-key">비밀번호</label><input id="staff-key" className="input" type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="공용 비밀번호" /></div>
        <button className="btn" type="submit" disabled={!key || !name.trim()}>로그인</button>
      </form>
    );
  }

  return (
    <div className="admin">
      <div className="tabs">
        <button className={tab === "claims" ? "on" : ""} onClick={() => setTab("claims")}>경품 수령</button>
        <button className={tab === "participants" ? "on" : ""} onClick={() => setTab("participants")}>참가자</button>
        <button className={tab === "rounds" ? "on" : ""} onClick={() => setTab("rounds")}>추첨·설정</button>
        <button className={tab === "stats" ? "on" : ""} onClick={() => setTab("stats")}>통계</button>
        <button className={tab === "logs" ? "on" : ""} onClick={() => setTab("logs")}>로그</button>
        <button className={tab === "video" ? "on" : ""} onClick={() => setTab("video")}>영상</button>
        <div className="tabs-side">
          {/* TV·발표 화면은 노트북에서 띄우는 것이라 폰에서는 숨긴다 */}
          <a className="btn ghost sm wide-only" href="/board" target="_blank" style={{ textDecoration: "none" }}>TV 보드 ↗</a>
          <a className="btn ghost sm wide-only" href="/results" target="_blank" style={{ textDecoration: "none" }}>발표 화면 ↗</a>
          <button className="btn ghost sm" onClick={logout}>{me} · 로그아웃</button>
        </div>
      </div>
      <LiveBar />
      {tab === "claims" && <Claims scan={scan} />}
      {tab === "participants" && <Participants allowReset={allowReset} />}
      {tab === "rounds" && <Rounds />}
      {tab === "stats" && <Stats />}
      {tab === "logs" && <Logs />}
      {tab === "video" && <AdPlayer />}
    </div>
  );
}
