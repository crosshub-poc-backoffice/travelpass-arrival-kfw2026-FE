"use client";

import { useEffect, useRef, useState } from "react";
import { CLAIM_MIN_MAX, fmtDateTime, hhmm } from "@/lib/config";
import ShowOptions, { type ShowChoice } from "./ShowOptions";

export interface DrawPreview { n: number; from_seq: number | null; to_seq: number | null; last: boolean }

interface Props {
  name: string;
  cutoffAt: string;
  /** 추첨 시각 (등록 마감보다 늦을 수 있다. 그 사이는 추가 질문을 마무리하는 시간) */
  drawAt: string;
  qty: [number, number, number];
  /** null = 대상 확인 중 */
  preview: DrawPreview | null;
  /** 참가자에게 미리 안내한 수령 시간(분). null = 수령 기한 없음 */
  plannedMin: number | null;
  /** 이번 추첨에 쓸 수령 시간(분). 안내한 시간에서 5분 단위로 늘리기만 한다 */
  claimMin: string;
  onClaimMin: (v: string) => void;
  /** 전광판 연출: 추첨 전 광고 · 당첨자 화면 방식 · 표시 시간 */
  show: ShowChoice;
  onShow: (c: ShowChoice) => void;
  /** 전광판에 광고가 나가는 중이면 광고가 끝나는(= 추첨이 실행되는) 시각(ms). 아니면 null */
  adUntil: number | null;
  /** 광고를 끊고 지금 추첨 */
  onDrawNow: () => void;
  /** 광고를 내리고 추첨하지 않는다 */
  onCancelAd: () => void;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * 추첨 실행 확인. 누른 순간 받아 온 대상 인원을 크게 보여 주고, 실행·오류까지 이 창 안에서 끝낸다.
 * 네이티브 <dialog> 라 Esc·포커스 가두기를 브라우저가 해 준다. 실행 중에는 닫히지 않는다.
 */
export default function DrawDialog({ name, cutoffAt, drawAt, qty, preview, plannedMin, claimMin, onClaimMin, show, onShow, adUntil, onDrawNow, onCancelAd, busy, error, onConfirm, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (adUntil === null) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [adUntil]);
  useEffect(() => {
    const d = ref.current!;
    if (!d.open) d.showModal();
    return () => d.close();
  }, []);

  const before = new Date(cutoffAt).getTime() > Date.now();
  const early = new Date(drawAt).getTime() > Date.now();
  const empty = preview?.n === 0;
  const close = () => { if (!busy && adUntil === null) onClose(); };
  const n = parseInt(claimMin, 10);

  // 전광판에 광고가 나가는 동안: 남은 시간만 크게 보여 주고, 끝나면 추첨이 저절로 실행된다
  if (adUntil !== null) {
    const left = Math.max(0, Math.ceil((adUntil - now) / 1000));
    return (
      <dialog ref={ref} className="draw-dlg" aria-labelledby="draw-dlg-title" onCancel={(e) => e.preventDefault()}>
        <div className="draw-dlg-body">
          <div className="draw-dlg-kicker">전광판 광고 중</div>
          <h2 id="draw-dlg-title">{name}</h2>
          <div className="draw-dlg-n"><b>{left}</b><span>초 뒤 추첨</span></div>
          <p className="draw-dlg-note">이 창을 열어 두세요. 광고가 끝나면 추첨이 바로 실행돼요.</p>
          {error && <p className="draw-dlg-note err" role="alert">{error}</p>}
        </div>
        <div className="draw-dlg-foot">
          <div className="draw-dlg-btns">
            <button className="btn ghost sm" type="button" onClick={onCancelAd} disabled={busy}>광고 내리고 취소</button>
            <button className="btn sm" type="button" onClick={onDrawNow} disabled={busy}>{busy ? "추첨 중…" : "지금 바로 추첨"}</button>
          </div>
        </div>
      </dialog>
    );
  }

  return (
    <dialog ref={ref} className="draw-dlg" aria-labelledby="draw-dlg-title"
      onCancel={(e) => { e.preventDefault(); close(); }}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="draw-dlg-body">
        <div className="draw-dlg-kicker">추첨 실행</div>
        <h2 id="draw-dlg-title">{name}</h2>

        <div className="draw-dlg-n">
          {preview ? <><b>{preview.n.toLocaleString()}</b><span>명 대상</span></> : <span className="draw-dlg-loading">대상 확인 중…</span>}
        </div>
        {preview && !empty && <div className="draw-dlg-sub">번호 {preview.from_seq}–{preview.to_seq} · 지금 기준</div>}
        <div className="draw-dlg-prizes">1등 {qty[0]} · 2등 {qty[1]} · 3등 {qty[2]}</div>
        {!empty && plannedMin !== null && (
          <div className="draw-dlg-claim">
            <div className="draw-dlg-claim-k">수령 시간</div>
            <div className="draw-dlg-claim-row">
              <div className="draw-dlg-step">
                <button type="button" aria-label="5분 줄이기" disabled={busy || n - 5 < plannedMin} onClick={() => onClaimMin(String(n - 5))}>−</button>
                <span>{n}분</span>
                <button type="button" aria-label="5분 늘리기" disabled={busy || n + 5 > CLAIM_MIN_MAX} onClick={() => onClaimMin(String(n + 5))}>+</button>
              </div>
              <div className="draw-dlg-until"><b>{hhmm(new Date(Date.now() + n * 60000))}</b>까지</div>
            </div>
          </div>
        )}

        {preview && !empty && <ShowOptions value={show} disabled={busy} onChange={onShow} />}

        {empty && (
          <p className="draw-dlg-note">
            아직 추첨 대상이 없어요. 직전 회차 마감 이후부터 이 회차 마감({fmtDateTime(cutoffAt)}) 전까지 등록한 사람이 대상이에요.
          </p>
        )}
        {preview && !empty && before && (
          <p className="draw-dlg-note warn">
            마감({fmtDateTime(cutoffAt)}) 전이에요. 지금까지 등록한 {preview.n.toLocaleString()}명으로 확정되고,{" "}
            {preview.last ? "이후 등록자는 남은 회차가 없어 추첨에서 빠져요." : "이후 등록자는 다음 회차 대상이 돼요."}
          </p>
        )}
        {preview && !empty && early && (
          <p className="draw-dlg-note warn">
            추첨 시각({fmtDateTime(drawAt)}) 전이에요. 지금 추가 질문에 답하고 있는 사람은 당첨 확률 2배를 받지 못해요.
          </p>
        )}
        {error && <p className="draw-dlg-note err" role="alert">{error}</p>}
      </div>

      <div className="draw-dlg-foot">
        {!empty && <span className="draw-dlg-final">실행 후에는 결과를 바꿀 수 없어요</span>}
        <div className="draw-dlg-btns">
          <button className="btn ghost sm" type="button" onClick={close} disabled={busy}>{empty ? "닫기" : "취소"}</button>
          {!empty && (
            <button className="btn sm" type="button" onClick={onConfirm} disabled={!preview || busy} autoFocus>
              {busy ? "추첨 중…" : show.ad ? "광고 틀고 추첨" : early ? "지금 추첨" : "추첨 실행"}
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}
