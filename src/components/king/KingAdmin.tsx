"use client";

import { useEffect, useState } from "react";
import type { Rank } from "@/lib/config";
import { KING_FX, type KingFx } from "@/lib/king";
import { ORIGINS } from "@/lib/origins";
import { nameLength, normalizeName } from "@/lib/validation";
import k from "./king.module.css";
import KingName from "./KingName";
import { useKing } from "./useKing";

const STEP_LABEL = ["대기 중", "등록됨 · 전광판에 떠 있음", "추첨됨 · 결과 보기 대기", "결과 확인함"];
/** 이 시간 안에 상태를 물어봤으면 연결된 것으로 본다 */
const ALIVE_MS = 5000;

/**
 * 시연 직원 화면. 손님 정보를 넣고, 추첨을 넘기고, 처음으로 되돌린다.
 * 실제 운영 콘솔(/admin)과는 별개라 여기서 누르는 것은 실제 추첨·DB 에 아무 영향이 없다.
 */
export default function KingAdmin() {
  const { state, guest, step, epoch, online, advance, send } = useKing("admin");
  const [name, setName] = useState("");
  const [origin, setOrigin] = useState("SEOUL");
  const [rank, setRank] = useState<Rank>(2);
  const [msg, setMsg] = useState("");
  const [loaded, setLoaded] = useState(false);

  // 저장된 손님 정보가 있으면 한 번만 폼에 채운다
  useEffect(() => {
    if (loaded || !state) return;
    setLoaded(true);
    if (!state.guest) return;
    setName(state.guest.name); setOrigin(state.guest.origin); setRank(state.guest.rank);
  }, [state, loaded]);

  async function save() {
    setMsg("");
    if (nameLength(normalizeName(name)) < 2) { setMsg("전광판 이름을 2칸 이상 넣어 주세요"); return; }
    try {
      await send({ action: "setup", guest: { name, origin, rank } });
      setMsg("저장했어요");
    } catch { setMsg("저장하지 못했어요. 연결을 확인해 주세요"); }
  }

  async function reset() {
    setMsg("");
    try { await send({ action: "reset" }); setMsg("초기화했어요"); } catch { setMsg("초기화하지 못했어요. 연결을 확인해 주세요"); }
  }

  const fx = state?.fx ?? KING_FX;
  /** 연출 선택은 누르는 즉시 저장한다 */
  async function toggle(key: keyof KingFx) {
    setMsg("");
    try { await send({ action: "fx", fx: { ...fx, [key]: !fx[key] } }); } catch { setMsg("바꾸지 못했어요. 연결을 확인해 주세요"); }
  }
  const FX_ROWS: [keyof KingFx, string][] = [["solo", "발표할 때 손님만 보여주기"], ["confetti", "꽃가루"], ["sound", "당첨 효과음"]];

  const alive = (at: number | null | undefined) => !!state && !!at && state.now - at < ALIVE_MS;
  const boardOn = online && alive(state?.beats.board);
  const phoneOn = online && alive(state?.beats.phone);

  return (
    <div className={k.admin}>
      <h1 className={k.title}>시연 진행</h1>

      <div className="card">
        <p className={k.now}>{STEP_LABEL[step]}</p>
        <div className={k.status} style={{ marginTop: 14 }}>
          <div><span>서버</span><span className={online ? k.ok : k.bad}>{online ? "연결됨" : "끊김"}</span></div>
          <div><span>전광판</span><span className={boardOn ? k.ok : k.bad}>{boardOn ? "연결됨" : "안 보임"}</span></div>
          <div><span>손님 폰</span><span className={phoneOn ? k.ok : k.bad}>{phoneOn ? "연결됨" : "안 보임"}</span></div>
        </div>
      </div>

      <div className={`card ${k.actions}`}>
        <button type="button" className="btn" disabled={!guest || step !== 1} onClick={() => advance(2)}>추첨</button>
        <div className={k.two}>
          <button type="button" className="btn ghost" disabled={!guest || step !== 0} onClick={() => advance(1)}>대신 등록하기</button>
          <button type="button" className="btn ghost" onClick={reset}>초기화하기</button>
        </div>
      </div>

      <div className="card">
        <p className={k.group}>당첨 발표 연출</p>
        {FX_ROWS.map(([key, label]) => (
          <label key={key} className={k.opt}>
            <input type="checkbox" checked={fx[key]} onChange={() => toggle(key)} />
            <span>{label}</span>
          </label>
        ))}
      </div>

      <div className="card">
        {/* 실제 등록의 이름 단계와 같은 입력: 전광판 12칸 줄에 바로 치고, 이모지는 목록에서 */}
        <div style={{ marginBottom: 20 }}>
          <KingName value={name} origin={origin} onChange={setName} />
        </div>
        <div className="field">
          <label htmlFor="korigin">출발지</label>
          <select id="korigin" className="select" value={origin} onChange={(e) => setOrigin(e.target.value)}>
            {ORIGINS.map((o) => <option key={o.code} value={o.code}>{o.label} · {o.code}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="krank">등수</label>
          <select id="krank" className="select" value={rank} onChange={(e) => setRank(Number(e.target.value) as Rank)}>
            <option value={1}>1등</option><option value={2}>2등</option><option value={3}>3등</option>
          </select>
        </div>
        <button type="button" className="btn ghost" onClick={save}>손님 정보 저장</button>
        {msg && <p className={k.note} style={{ marginTop: 10 }} role="status">{msg}</p>}
        <p className={k.note} style={{ marginTop: 10 }}>회차 {epoch ? String(epoch).slice(-4) : "-"} · 여기서 누르는 것은 실제 추첨과 무관해요</p>
      </div>
    </div>
  );
}
