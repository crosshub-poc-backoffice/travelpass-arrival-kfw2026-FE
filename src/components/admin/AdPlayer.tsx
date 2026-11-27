"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { fanfare } from "@/components/board/celebrate";
import { FlapSound } from "@/components/board/sound";
import { DRAW_SPIN_MS, SPIN_VOLUME } from "@/components/board/FlipBoard";
import { AD_SEC, BUILTIN_ADS, type AdFile, type AdList, type ShowState } from "@/lib/show";

/**
 * 영상 바로 재생 (소리 점검용). 추첨 없이 광고 영상을 전광판(/board)에 바로 띄운다.
 * 전광판 PC(윈도우 크롬 등)에서 영상·효과음이 안 날 때, 추첨을 돌리지 않고 소리를 확인하는 데 쓴다.
 * 전광판은 화면을 한 번 누르거나 S 키를 눌러 소리를 켜 둬야 영상 소리가 난다 (SOUND OFF 표시가 없어야 한다).
 * 추첨 소리는 이 기기에서 전광판과 같은 순서로 낸다: 뜸 들이는 동안 낮은 볼륨의 플랩 소리 → 당첨 순간 효과음 + 당첨자 줄이 넘어가는 플랩 소리.
 */
/** 당첨 순간 당첨자 줄이 넘어가는 시간 (전광판에서 9줄이 60ms 간격으로 넘어가는 정도) */
const LAND_MS = 1200;
export default function AdPlayer() {
  const [ads, setAds] = useState<AdFile[]>([]);
  const [src, setSrc] = useState("");
  const [state, setState] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const [sec, setSec] = useState<number>(AD_SEC.initial);
  /** 전광판에 광고만 틀어 둔 경우 끝나는 시각 (서버 시계 기준 ms 와 서버-이 기기 시계 차) */
  const [onBoard, setOnBoard] = useState<{ until: number; skew: number; name: string } | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const flap = useRef<FlapSound | null>(null);
  const timers = useRef<number[]>([]);
  const [drawing, setDrawing] = useState(false);

  useEffect(() => {
    api<AdList>("/board/ads")
      .then((d) => d.items, () => BUILTIN_ADS)
      .then((items) => { setAds(items); setSrc(items.find((f) => f.video)?.url ?? items[0]?.url ?? ""); });
  }, []);

  const clearTimers = () => { timers.current.forEach((t) => { clearInterval(t); clearTimeout(t); }); timers.current = []; };
  useEffect(() => () => { clearTimers(); audio.current?.close().catch(() => {}); }, []);

  const cur = ads.find((f) => f.url === src);

  // 고른 영상 길이로 트는 시간을 맞춘다 (추첨 창과 같은 범위로 자른다)
  useEffect(() => {
    if (!cur) return;
    if (!cur.video) { setSec(AD_SEC.initial); return; }
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => { if (Number.isFinite(v.duration)) setSec(Math.min(AD_SEC.max, Math.max(AD_SEC.min, Math.ceil(v.duration)))); v.removeAttribute("src"); };
    v.src = cur.url;
    return () => { v.onloadedmetadata = null; v.removeAttribute("src"); };
  }, [cur]);

  // 전광판 상태: 지금 광고만 틀어 둔 게 있는지
  const readBoard = (st: ShowState) => {
    const sh = st.show;
    const skew = st.now - Date.now();
    if (sh?.adOnly && sh.ad) setOnBoard({ until: sh.startAt + sh.ad.sec * 1000, skew, name: ads.find((f) => f.url === sh.ad!.src)?.name ?? sh.ad.src });
    else setOnBoard(null);
  };
  useEffect(() => {
    let stop = false;
    const poll = () => api<ShowState>("/board/sync").then((st) => { if (!stop) readBoard(st); }).catch(() => {});
    poll();
    const t = window.setInterval(() => { poll(); }, 3000);
    const c = window.setInterval(() => setNowMs(Date.now()), 500);
    return () => { stop = true; clearInterval(t); clearInterval(c); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ads]);
  const left = onBoard ? Math.max(0, Math.ceil((onBoard.until - (nowMs + onBoard.skew)) / 1000)) : 0;
  const playing = !!onBoard && left > 0;

  async function playOnBoard() {
    if (!cur) return;
    setErr(null); setBusy(true);
    try { readBoard(await api<ShowState>("/board/sync", { method: "POST", body: JSON.stringify({ action: "adOnly", ad: { src: cur.url, video: cur.video, sec } }) })); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  async function stopOnBoard() {
    setErr(null); setBusy(true);
    try { readBoard(await api<ShowState>("/board/sync", { method: "POST", body: JSON.stringify({ action: "adOnlyStop" }) })); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  async function fanfareOnBoard() {
    setErr(null); setBusy(true);
    try {
      await api<ShowState>("/board/sync", { method: "POST", body: JSON.stringify({ action: "fanfare" }) });
      setState("전광판에 빵빠레를 보냈어요. 3초 안에 전광판에서 꽃가루와 효과음이 나와요.");
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  /** 플랩 소리를 ms 동안 계속 낸다. 판이 쉬지 않고 넘어갈 때처럼 tick 을 촘촘히 부르고, 25ms 제한은 FlapSound 가 건다 */
  function flapFor(snd: FlapSound, ms: number) {
    const iv = window.setInterval(() => snd.tick(), 12);
    timers.current.push(iv, window.setTimeout(() => clearInterval(iv), ms));
  }

  /** 실제 추첨 소리: 전광판처럼 클릭 순간에 소리 두 개(플랩·효과음)를 모두 켜 두고 순서대로 낸다 */
  async function drawSound() {
    setErr(null);
    clearTimers();
    try {
      flap.current ??= new FlapSound();
      const snd = flap.current;
      await snd.enable();
      audio.current ??= new AudioContext();
      await audio.current.resume();
      const ctx = audio.current;

      setDrawing(true);
      setState(`추첨 중… (${DRAW_SPIN_MS / 1000}초) · AudioContext ${ctx.state} · ${ctx.sampleRate}Hz`);
      snd.volume = SPIN_VOLUME;
      flapFor(snd, DRAW_SPIN_MS);
      timers.current.push(window.setTimeout(() => {
        snd.volume = 1;
        fanfare(ctx);
        flapFor(snd, LAND_MS);
        setState(`당첨 발표 · 효과음 재생 · AudioContext ${ctx.state}`);
      }, DRAW_SPIN_MS));
      timers.current.push(window.setTimeout(() => setDrawing(false), DRAW_SPIN_MS + LAND_MS + 1500));
    } catch (e) { setDrawing(false); setErr(`추첨 소리 실패: ${(e as Error).message}`); }
  }

  function stopDraw() {
    clearTimers();
    if (flap.current) flap.current.volume = 1;
    setDrawing(false);
    setState("추첨 소리 멈춤");
  }

  return (
    <div className="card">
      <h2 className="title" style={{ fontSize: 20 }}>전광판에 영상 띄우기</h2>
      <p className="sub">추첨 없이 광고 영상을 TV 보드(/board)에 바로 틀어요. 전광판에서 화면을 한 번 눌러 소리를 켜 둬야 영상 소리가 나요 (오른쪽 아래 SOUND OFF가 없어야 해요).</p>

      <div className="field" style={{ marginTop: 14 }}>
        <label htmlFor="ad-pick">광고</label>
        <select id="ad-pick" className="input" value={src} disabled={busy} onChange={(e) => setSrc(e.target.value)}>
          {ads.map((f) => <option key={f.url} value={f.url}>{f.video ? "영상" : "사진"} · {f.name}</option>)}
        </select>
      </div>
      <p className="sub">트는 시간 {sec}초{cur?.video ? " (영상 길이)" : ""}</p>

      <div className="row-btns">
        <button className="btn" onClick={playOnBoard} disabled={!cur || busy}>{playing ? "처음부터 다시 틀기" : "전광판에서 재생"}</button>
        <button className="btn ghost" onClick={stopOnBoard} disabled={!playing || busy}>전광판 영상 내리기</button>
      </div>
      <p className="sub" style={{ marginTop: 8 }}>{playing ? `전광판 재생 중 · ${onBoard!.name} · ${left}초 남음` : "전광판: 광고 없음"}</p>

      <h2 className="title" style={{ fontSize: 20, marginTop: 24 }}>전광판 빵빠레</h2>
      <p className="sub">당첨 발표 순간처럼 TV 보드(/board)에서 꽃가루와 당첨 효과음을 내요. 효과음은 전광판 소리가 켜져 있어야 나요 (SOUND OFF가 없어야 해요).</p>
      <div className="row-btns">
        <button className="btn ghost" onClick={fanfareOnBoard} disabled={busy}>전광판에서 빵빠레</button>
      </div>

      <h2 className="title" style={{ fontSize: 20, marginTop: 24 }}>추첨 소리 테스트 (이 기기)</h2>
      <p className="sub">전광판이 실제 추첨 때 내는 소리를 이 기기에서 같은 순서로 내요.</p>
      <div className="row-btns">
        {drawing
          ? <button className="btn ghost" onClick={stopDraw}>추첨 소리 멈춤</button>
          : <button className="btn ghost" onClick={drawSound}>추첨 소리 ({DRAW_SPIN_MS / 1000}초)</button>}
      </div>
      {state && <p className="sub" style={{ marginTop: 8 }}>{state}</p>}
      {err && <div className="alert" style={{ marginTop: 8 }}>{err}</div>}
    </div>
  );
}
