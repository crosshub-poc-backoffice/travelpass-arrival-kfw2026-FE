"use client";

import { useEffect, useRef, useState } from "react";
import { hhmm } from "@/lib/config";
import { cells, emojiSrc } from "@/lib/glyphs";
import { MESSAGES, fmt, rankLabel } from "@/lib/i18n";
import { ORIGIN_MAP } from "@/lib/origins";
import Reveal from "@/components/register/Reveal";
import s from "@/components/register/register.module.css";
import k from "./king.module.css";
import { useKing } from "./useKing";

/** 도장이 찍혀 있는 시간. 실제 등록 화면과 같은 값 */
const STAMP_MS = 1700;
const t = MESSAGES.ko;
const h = t.home;

/** 이름을 글자와 그림 이모지로 (전광판과 같은 그림) */
function Name({ text }: { text: string }) {
  return <>{cells(text).map((g, i) => {
    const src = emojiSrc(g);
    // eslint-disable-next-line @next/next/no-img-element
    return src ? <img key={i} className={s.emojiImg} src={src} alt={g} draggable={false} /> : g;
  })}</>;
}

/**
 * 시연용 등록 화면. 실제 완료 화면과 같은 모양·문구를 쓰되, 서버 응답을 기다리지 않고 누르는 즉시 넘어간다.
 * 손님이 누르는 것은 [등록하기]와 [결과 보기] 두 번. 추첨은 직원 화면에서 넘긴다.
 */
export default function KingPhone() {
  const { guest, step, state, seq, advance, told } = useKing("phone");
  const [stamping, setStamping] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [localAt, setLocalAt] = useState<string | null>(null);
  const taps = useRef<number[]>([]);

  // 화면이 꺼지지 않게 (기다리는 동안 잠기면 곤란하다)
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } };
    const on = async () => { try { lock = (await nav.wakeLock?.request("screen")) ?? null; } catch {} };
    const onVis = () => { if (document.visibilityState === "visible") on(); };
    on();
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); lock?.release().catch(() => {}); };
  }, []);

  useEffect(() => {
    if (!stamping) return;
    const id = setTimeout(() => setStamping(false), STAMP_MS);
    return () => clearTimeout(id);
  }, [stamping]);

  // 결과가 나온 순간 진동으로 알린다 (실제 화면과 같다)
  const prev = useRef(step);
  useEffect(() => {
    if (step === 0 && prev.current !== 0) { setRevealing(false); setStamping(false); setLocalAt(null); }
    prev.current = step;
  }, [step]);
  // 전광판 발표가 끝난 순간에 진동. 이미 발표된 상태로 화면을 열었을 때는 울리지 않는다
  const waited = useRef(false);
  useEffect(() => {
    if (step < 2) { waited.current = false; return; }
    if (!told) { waited.current = true; return; }
    if (waited.current) { waited.current = false; try { navigator.vibrate?.([200, 100, 200]); } catch {} }
  }, [step, told]);

  if (!guest) return <div className="card"><p className="lead" style={{ margin: 0 }}>준비 중이에요</p></div>;

  const seq4 = String(seq).padStart(4, "0");
  const origin = ORIGIN_MAP.get(guest.origin)?.label ?? guest.origin;
  const name = guest.name;
  const rank = rankLabel("ko", guest.rank);
  const prize = t.prize[`rank${guest.rank}` as const];
  const at = state?.at ?? localAt ?? new Date().toISOString();

  const register = () => {
    setLocalAt(new Date().toISOString());
    setStamping(true);
    advance(1);
  };
  /** 연결이 끊겨 추첨 신호를 못 받을 때: 로고를 빠르게 세 번 누르면 이 화면만 다음으로 넘어간다 */
  const logoTap = () => {
    const now = Date.now();
    taps.current = [...taps.current.filter((x) => now - x < 900), now];
    if (taps.current.length >= 3 && step === 1) { taps.current = []; advance(2); }
  };
  const logo = (
    <div className={s.homeTop} onClick={logoTap}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/travelpass-white.svg" alt="Travel Pass" />
    </div>
  );

  if (step === 0) return (
    <>
      {logo}
      <div className={`card ${s.hero} ${s.rise}`}>
        <p className={s.boardName}><Name text={name} /></p>
        <p className={s.sub}>출발지 · {origin}</p>
        <button type="button" className={`btn ${s.cta} ${k.big}`} onClick={register}>등록하기</button>
      </div>
    </>
  );

  if (stamping) return (
    <div className="card">
      <div className={s.stampStage} role="status">
        <div className={s.stamp}>
          <small>{t.wizard.stamp}</small>
          <b>ARRIVED</b>
          <em>KOREA · {hhmm(at)}</em>
          <small>NO. {seq4}</small>
        </div>
      </div>
    </div>
  );

  // 추첨을 눌렀어도 전광판이 발표를 마칠 때까지는 결과를 띄우지 않는다
  if (step === 1 || (step === 2 && !told)) return (
    <>
      {logo}
      <div className={`${s.board} ${s.rise}`}>
        <h1 className={s.h}>{h.boardTitle}</h1>
        <p className={s.boardName}><Name text={name} /></p>
        <p className={s.sub}>{h.boardTop}</p>
      </div>
      <div className={`card ${s.hero} ${s.rise} ${s.underBoard}`}>
        <p className={s.raffleNo}>{h.raffleNo}<b>{seq4}</b></p>
        <h1 className={s.h}>{step === 1 ? "곧 추첨이 시작돼요" : "지금 추첨하고 있어요"}</h1>
        <p className={s.sub}>{step === 1 ? "결과가 나오면 여기에 바로 알려드려요" : "전광판을 봐 주세요"}</p>
      </div>
    </>
  );

  if (step === 2) return (
    <>
      {logo}
      <div className={`card ${s.hero} ${s.rise}`}>
        <p className={s.raffleNo}>{h.raffleNo}<b>{seq4}</b></p>
        <h1 className={s.h}>{h.revealReady}</h1>
        <button type="button" className={`btn ${s.cta} ${k.big}`} onClick={() => setRevealing(true)}>{h.revealButton}</button>
      </div>
      {revealing && (
        <Reveal rank={guest.rank} okLabel={h.revealOk} title={h.revealCongrats} line={`${rank} · ${prize}`}
          onDone={() => { setRevealing(false); advance(3); }} />
      )}
    </>
  );

  return (
    <>
      {logo}
      <div className={`card ${s.hero} ${s.rise}`}>
        <h1 className={s.wonBig}>{fmt(h.wonBig, { rank })}</h1>
        <p className={s.wonLine}>부스에서 바로 받아 가세요</p>
        <dl className={s.facts}>
          <div><dt>{h.factPrize}</dt><dd>{prize}</dd></div>
          <div style={{ paddingTop: 10 }}><dt>{h.factPlace}</dt><dd>{h.factPlaceValue}</dd></div>
        </dl>
      </div>
    </>
  );
}
