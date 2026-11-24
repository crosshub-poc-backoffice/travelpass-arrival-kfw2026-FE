"use client";

import { useEffect, useState } from "react";
import s from "./register.module.css";

const pad = (n: number) => String(n).padStart(2, "0");

/** 목표 시각까지 남은 시간을 큰 숫자로. 하루가 넘으면 앞에 일수를 붙이고, 지나면 00:00:00 에서 멈춘다 */
export default function Countdown({ target }: { target: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  let sec = Math.max(0, Math.floor((new Date(target).getTime() - now) / 1000));
  const d = Math.floor(sec / 86400);
  sec %= 86400;
  const parts = [...(d > 0 ? [String(d)] : []), pad(Math.floor(sec / 3600)), pad(Math.floor((sec % 3600) / 60)), pad(sec % 60)];
  // 숫자를 한 글자씩 나눠 두고 고정폭 숫자(tabular-nums)로 그려서, 초가 바뀌어도 좌우로 흔들리지 않는다
  return (
    <div className={s.count} role="timer" aria-live="off" aria-label={parts.join(":")}>
      {parts.map((part, i) => (
        <span key={i} aria-hidden="true">
          {i > 0 && <em>:</em>}
          {[...part].map((ch, k) => <b key={k}>{ch}</b>)}
        </span>
      ))}
    </div>
  );
}
