"use client";

import { useEffect, useRef } from "react";
import type { Rank } from "@/lib/config";
import s from "./reveal.module.css";

/** 상자가 열리는 순간 (ms). reveal.module.css 의 --open 과 같은 값 */
const OPEN_MS = 1100;
const COLORS = ["#f5c400", "#ff682c", "#fb0046", "#ffffff", "#5aa9ff", "#35d07f"];

/** 경품 그림: 1등 캐리어 · 2등 수면안대 · 3등 목베개 · 그 밖 마스크팩 */
function Prize({ rank }: { rank: Rank | "mask" }) {
  if (rank === "mask") return (
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <rect x="28" y="14" width="64" height="92" rx="8" fill="#ff8fb1" />
      <path d="M28 26h64" stroke="#e86d93" strokeWidth="4" strokeDasharray="5 4" />
      <path d="M60 44c-12 0-20 9-20 22s9 24 20 24 20-11 20-24-8-22-20-22z" fill="#fff" opacity="0.92" />
      <circle cx="52" cy="62" r="3" fill="#ff8fb1" /><circle cx="68" cy="62" r="3" fill="#ff8fb1" />
      <path d="M53 74q7 6 14 0" fill="none" stroke="#ff8fb1" strokeWidth="3" strokeLinecap="round" />
      <rect x="34" y="32" width="4" height="30" rx="2" fill="#fff" opacity="0.5" />
    </svg>
  );
  if (rank === 1) return (
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <path d="M46 30V17a7 7 0 0 1 7-7h14a7 7 0 0 1 7 7v13" fill="none" stroke="#c9cbd3" strokeWidth="6" strokeLinecap="round" />
      <rect x="35" y="104" width="12" height="9" rx="3" fill="#3a3a42" /><rect x="73" y="104" width="12" height="9" rx="3" fill="#3a3a42" />
      <rect x="24" y="28" width="72" height="78" rx="13" fill="#f5c400" />
      <rect x="40" y="38" width="6" height="58" rx="3" fill="#d6a700" /><rect x="57" y="38" width="6" height="58" rx="3" fill="#d6a700" /><rect x="74" y="38" width="6" height="58" rx="3" fill="#d6a700" />
      <rect x="30" y="36" width="4" height="26" rx="2" fill="#fff" opacity="0.55" />
    </svg>
  );
  if (rank === 2) return (
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <path d="M10 56Q60 26 110 56" fill="none" stroke="#8d8d97" strokeWidth="5" strokeLinecap="round" />
      <path d="M12 58c0-16 18-20 32-16 8 2 12 6 16 6s8-4 16-6c14-4 32 0 32 16 0 20-14 32-28 32-10 0-14-10-20-10s-10 10-20 10c-14 0-28-12-28-32z" fill="#6f7dff" />
      <path d="M22 52c2-7 10-9 18-8" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" opacity="0.5" />
      <path d="M30 64q10 9 20 0M70 64q10 9 20 0" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
  return (
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <path d="M32 30c-8 8-12 19-12 31 0 23 18 41 40 41s40-18 40-41c0-12-4-23-12-31" fill="none" stroke="#2fc4a8" strokeWidth="26" strokeLinecap="round" />
      <path d="M24 44c-2 6-3 11-3 17 0 14 7 26 18 33" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity="0.5" />
      <circle cx="32" cy="30" r="4" fill="#1d8f7a" /><circle cx="88" cy="30" r="4" fill="#1d8f7a" />
    </svg>
  );
}

interface Bit { x: number; y: number; vx: number; vy: number; w: number; h: number; rot: number; vr: number; color: string; tilt: number; vt: number }

/** 꽃가루. 상자가 열리는 자리에서 위로 한 번 터지고, 조금 뒤 양옆 아래에서 한 번씩 더 쏜다 */
function useConfetti(ref: React.RefObject<HTMLCanvasElement | null>, on: boolean) {
  useEffect(() => {
    const cv = ref.current;
    if (!on || !cv || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = cv.clientWidth, H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.scale(dpr, dpr);
    const bits: Bit[] = [];
    const burst = (x: number, y: number, n: number, angle: number, spread: number, speed: number) => {
      for (let i = 0; i < n; i++) {
        const a = angle + (Math.random() - 0.5) * spread, v = speed * (0.45 + Math.random() * 0.75);
        bits.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, w: 6 + Math.random() * 6, h: 4 + Math.random() * 5, rot: Math.random() * 6.3, vr: (Math.random() - 0.5) * 0.4, color: COLORS[(Math.random() * COLORS.length) | 0], tilt: Math.random() * 6.3, vt: 0.1 + Math.random() * 0.15 });
      }
    };
    const timers = [
      window.setTimeout(() => burst(W / 2, H * 0.46, 150, -Math.PI / 2, 2.2, 17), OPEN_MS + 40),
      window.setTimeout(() => { burst(-10, H * 0.72, 70, -1.0, 0.9, 19); burst(W + 10, H * 0.72, 70, -Math.PI + 1.0, 0.9, 19); }, OPEN_MS + 520),
    ];
    let raf = 0, last = performance.now();
    const frame = (now: number) => {
      const k = Math.min(2.5, (now - last) / 16.7);
      last = now;
      ctx.clearRect(0, 0, W, H);
      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i];
        b.vx *= Math.pow(0.985, k); b.vy = b.vy * Math.pow(0.985, k) + 0.32 * k;
        b.x += b.vx * k; b.y += b.vy * k; b.rot += b.vr * k; b.tilt += b.vt * k;
        if (b.y > H + 30) { bits.splice(i, 1); continue; }
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot);
        ctx.scale(1, Math.cos(b.tilt)); // 팔랑거림
        ctx.fillStyle = b.color;
        ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
        ctx.restore();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); timers.forEach(clearTimeout); };
  }, [ref, on]);
}

interface RevealProps {
  /** 당첨 등수. 1~3등이 아니면 "mask"(마스크팩 당첨). null 이면 조용히 열리는 미당첨 연출 */
  rank: Rank | "mask" | null;
  /** 큰 글자 ("축하해요!")와 그 아래 한 줄 ("1등 · 캐리어" / "마스크팩 당첨") */
  title: string; line: string;
  okLabel: string;
  onDone: () => void;
}

/**
 * 추첨 결과 공개. 선물 상자가 떨다가 빛을 내며 열리고, 당첨이면 경품이 솟아오르며 꽃가루가 터진다.
 * 미당첨이면 같은 상자가 조용히 열리고 위로 문구만 나온다 (빛줄기·꽃가루 없음). 누르기 전에는 당첨 여부를 알 수 없게 시작은 똑같다.
 */
export default function Reveal({ rank, title, line, okLabel, onDone }: RevealProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const won = rank !== null;
  useConfetti(canvas, won);
  useEffect(() => {
    if (!won) return;
    const id = window.setTimeout(() => { try { navigator.vibrate?.([120, 60, 240]); } catch {} }, OPEN_MS);
    return () => clearTimeout(id);
  }, [won]);

  return (
    <div className={`${s.reveal} ${won ? s.win : s.lose}`} role="dialog" aria-modal="true" aria-label={title}>
      {/* 캡처해서 가져가는 화면이라 맨 위에 로고를 둔다 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={s.logo} src="/brand/travelpass-white.svg" alt="Travel Pass" />
      <div className={s.stage} aria-hidden="true">
        {won && <div className={s.rays} />}
        <div className={s.flash} />
        {won && <div className={s.prize}><Prize rank={rank} /></div>}
        <div className={s.box}>
          <div className={s.lid}><i /><b /></div>
          <div className={s.seam} />
          <div className={s.body}><i /></div>
        </div>
      </div>
      <div className={s.text} aria-live="polite">
        <h1>{title}</h1>
        <p>{line}</p>
      </div>
      <button type="button" className={`btn ${s.ok}`} onClick={onDone}>{okLabel}</button>
      <canvas ref={canvas} className={s.confetti} aria-hidden="true" />
    </div>
  );
}
