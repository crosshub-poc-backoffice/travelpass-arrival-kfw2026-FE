"use client";

import { useEffect, useRef } from "react";

/** 당첨 발표 연출: 꽃가루와 효과음. 실제 전광판과 시연 전광판이 같이 쓴다 */
const CONFETTI = ["#f5c400", "#ff682c", "#fb0046", "#ffffff", "#5aa9ff", "#35d07f"];
interface Bit { x: number; y: number; vx: number; vy: number; w: number; h: number; rot: number; vr: number; color: string; tilt: number; vt: number }

/** 양옆 아래에서 위로 쏘는 꽃가루. fire 값이 바뀔 때마다 몇 번 연달아 터진다 */
export function Confetti({ fire }: { fire: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!fire || !cv || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = window.innerWidth, H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const unit = Math.max(1, W / 1280);
    const bits: Bit[] = [];
    const shoot = (x: number, angle: number, n: number) => {
      for (let i = 0; i < n; i++) {
        const a = angle + (Math.random() - 0.5) * 0.9, v = H * 0.034 * (0.5 + Math.random() * 0.75);
        bits.push({ x, y: H * 0.92, vx: Math.cos(a) * v, vy: Math.sin(a) * v, w: (8 + Math.random() * 8) * unit, h: (5 + Math.random() * 6) * unit, rot: Math.random() * 6.3, vr: (Math.random() - 0.5) * 0.4, color: CONFETTI[(Math.random() * CONFETTI.length) | 0], tilt: Math.random() * 6.3, vt: 0.1 + Math.random() * 0.15 });
      }
    };
    const volley = () => { shoot(-10, -1.05, 110); shoot(W + 10, -Math.PI + 1.05, 110); };
    const timers = [0, 450, 1000, 1700, 2500].map((ms) => window.setTimeout(volley, ms));
    let raf = 0, last = performance.now();
    const frame = (now: number) => {
      const k = Math.min(2.5, (now - last) / 16.7);
      last = now;
      ctx.clearRect(0, 0, W, H);
      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i];
        b.vx *= Math.pow(0.988, k); b.vy = b.vy * Math.pow(0.988, k) + H * 0.00055 * k;
        b.x += b.vx * k; b.y += b.vy * k; b.rot += b.vr * k; b.tilt += b.vt * k;
        if (b.y > H + 40) { bits.splice(i, 1); continue; }
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot);
        ctx.scale(1, Math.cos(b.tilt));
        ctx.fillStyle = b.color;
        ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
        ctx.restore();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); timers.forEach(clearTimeout); ctx.clearRect(0, 0, W, H); };
  }, [fire]);
  return <canvas ref={ref} aria-hidden="true" style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", pointerEvents: "none", zIndex: 5 }} />;
}

/** 당첨 효과음: 올라가는 네 음 뒤에 화음 한 번. 파일 없이 합성한다. 화면을 한 번 누른 뒤에만 소리가 난다 */
export function fanfare(ctx: AudioContext | null) {
  if (!ctx || ctx.state !== "running") return;
  const t0 = ctx.currentTime + 0.05;
  const tone = (freq: number, at: number, dur: number, vol: number) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "triangle";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(ctx.destination);
    o.start(at);
    o.stop(at + dur + 0.05);
  };
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((f, i) => tone(f, t0 + i * 0.13, 0.3, 0.22));
  notes.forEach((f) => tone(f, t0 + 0.6, 1.4, 0.16));
}
