"use client";

import { useState } from "react";
import QrCode from "./QrCode";
import s from "./register.module.css";

interface QrSheetProps {
  value: string;
  label: string; closeLabel: string;
  /** QR 위의 번호 이름표("추첨번호")와 번호(0049), 아래 한 줄("1등 · 캐리어"). 직원이 스캔 전에 누구 것인지 알 수 있게 */
  noLabel: string; no: string; caption: string;
  /** true 가 되면 스스로 닫힌다 (수령 처리됐을 때) */
  closing?: boolean;
  onClose: () => void;
}

/** 경품 수령 QR. 당첨자가 직원에게 내미는 화면이라 흰 바탕에 번호 · QR · 등수만 둔다. 어디를 눌러도 닫힌다 */
export default function QrSheet({ value, label, closeLabel, noLabel, no, caption, closing, onClose }: QrSheetProps) {
  const [out, setOut] = useState(false);
  const leaving = out || !!closing;
  return (
    <div className={`${s.qrSheet} ${leaving ? s.qrSheetOut : ""}`} role="dialog" aria-modal="true" aria-label={label}
      onClick={() => setOut(true)} onAnimationEnd={(e) => { if (e.target === e.currentTarget && leaving) onClose(); }}>
      <div className={s.qrNo}><small>{noLabel}</small>{no}</div>
      <QrCode value={value} label={label} size="min(88vw, 54dvh, 520px)" />
      <div className={s.qrWho}>{caption}</div>
      <button type="button" className={s.qrClose}>{closeLabel}</button>
    </div>
  );
}
