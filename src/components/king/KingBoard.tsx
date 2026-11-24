"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlipEngine } from "@/components/board/flipEngine";
import { FlapSound } from "@/components/board/sound";
import { BOARD_ROWS, EVENT_NAME, flightCode, hhmm } from "@/lib/config";
import { FROM_WIDTH } from "@/lib/origins";
import { cells, originFlag } from "@/lib/glyphs";
import type { BoardPin } from "@/lib/api-types";
import { KING_FX } from "@/lib/king";
import styles from "@/components/board/board.module.css";
import { useKing } from "./useKing";

/**
 * 시연용 전광판. 평소 전광판(components/board/FlipBoard)과 같은 모양이고 실제 등록자 목록을 읽기만 한다.
 * 다른 점은 하나: 시연 상태가 "등록됨"이면 손님 줄을 맨 위에 얹고, "추첨됨"이면 그 줄의 REMARK 만 등수로 넘긴다.
 * 다른 줄과 하단 "다음 추첨" 안내는 그대로라, 본 추첨이 아직이라는 것이 화면에 계속 보인다.
 * 신호가 안 올 때는 → · 스페이스 · PageDown 으로 직접 넘긴다 (S 소리, F 전체 화면).
 */
interface Row { seq: number; display_name: string; origin_code: string; created_at: string }

const COLS = [
  { key: "time", label: "TIME", width: 5 },
  { key: "flag", label: "FROM", width: 1 },
  { key: "from", label: "", width: FROM_WIDTH },
  { key: "name", label: "PASSENGER", width: 12 },
  { key: "flight", label: "FLIGHT", width: 7 },
  { key: "remark", label: "REMARK", width: 6 },
] as const;

const POLL_MS = 2000;
const IDLE_MS = 2500;
const RANK_LABEL: Record<number, string> = { 1: "🏆 1ST", 2: "2ND", 3: "3RD" };

/** 실제 등록자가 아직 적을 때만 빈 줄을 채우는 예시 승객 (화면에만 뜨고 어디에도 저장되지 않는다) */
const FILL: [string, string][] = [
  ["MINJI ✨", "BUSAN"], ["ALEX ✈️", "USA"], ["YUKI ⭐", "JAPAN"], ["SOPHIA 💜", "FRANCE"],
  ["JUN 🙌", "INCHEON"], ["EMMA 🌏", "UK"], ["LEO 🔥", "SINGAPORE"], ["HANA 💛", "JEJU"], ["DAVID 🚀", "AUSTRALIA"],
];

function fit(parts: string[]): string[] {
  return parts.flatMap((p, i) => {
    const c = cells(p.toUpperCase()).slice(0, COLS[i].width);
    return [...c, ...Array(COLS[i].width - c.length).fill(" ")];
  });
}

function rowCells(r: Row | undefined, remark = "LANDED"): string[] {
  return fit(r ? [hhmm(r.created_at), originFlag(r.origin_code), r.origin_code, r.display_name, flightCode(r.seq), remark] : COLS.map(() => ""));
}

function pinCells(pin: BoardPin | null): string[] {
  if (!pin || pin.kind !== "next") return fit(COLS.map(() => ""));
  return fit([pin.at ? hhmm(pin.at) : "--:--", "🧳", "NEXT DRAW", "COULD BE YOU", "", "SOON"]);
}

const CONFETTI = ["#f5c400", "#ff682c", "#fb0046", "#ffffff", "#5aa9ff", "#35d07f"];
interface Bit { x: number; y: number; vx: number; vy: number; w: number; h: number; rot: number; vr: number; color: string; tilt: number; vt: number }

/** 양옆 아래에서 위로 쏘는 꽃가루. fire 값이 바뀔 때마다 몇 번 연달아 터진다 */
function Confetti({ fire }: { fire: number }) {
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
function fanfare(ctx: AudioContext | null) {
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

export default function KingBoard() {
  const { guest, step, state, seq: guestSeq, advance } = useKing("board");
  const fx = state?.fx ?? KING_FX;
  const gridRef = useRef<HTMLDivElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const engine = useRef<FlipEngine | null>(null);
  const pinEngine = useRef<FlipEngine | null>(null);
  const sound = useRef<FlapSound | null>(null);
  const [real, setReal] = useState<Row[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [pin, setPin] = useState<BoardPin | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [clock, setClock] = useState("");
  const [pointer, setPointer] = useState(false);
  const idleTimer = useRef<number | null>(null);
  const [mounted] = useState(() => Date.now());
  /** 신호 없이 키보드로 넘겼을 때 쓸 등록 시각 */
  const [localAt, setLocalAt] = useState<string | null>(null);

  const wake = useCallback(() => {
    setPointer(true);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setPointer(false), IDLE_MS);
  }, []);
  useEffect(() => () => { if (idleTimer.current) clearTimeout(idleTimer.current); }, []);

  useEffect(() => {
    sound.current = new FlapSound();
    engine.current = new FlipEngine(gridRef.current!, () => sound.current?.tick());
    pinEngine.current = new FlipEngine(pinRef.current!, () => sound.current?.tick());
    return () => { engine.current?.destroy(); pinEngine.current?.destroy(); };
  }, []);

  useEffect(() => {
    const fmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Asia/Seoul" });
    const id = setInterval(() => setClock(fmt.format(new Date())), 500);
    return () => clearInterval(id);
  }, []);

  // 실제 등록자 목록 (읽기 전용). 끊기면 마지막으로 받은 목록을 그대로 둔다
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastSig = "";
    async function poll() {
      try {
        const r = await fetch(`/api/board?limit=${BOARD_ROWS}`, { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const data = (await r.json()) as { rows: Row[]; total: number; pin?: BoardPin };
        if (stop) return;
        const sig = data.rows.map((x) => `${x.seq}:${x.display_name}`).join("|");
        if (sig !== lastSig) { lastSig = sig; setReal(data.rows); }
        setTotal(data.total);
        const nextPin = data.pin ?? null;
        setPin((prev) => (JSON.stringify(prev) === JSON.stringify(nextPin) ? prev : nextPin));
      } catch {}
      if (!stop) timer = setTimeout(poll, POLL_MS);
    }
    poll();
    return () => { stop = true; clearTimeout(timer); };
  }, []);

  useEffect(() => { if (step === 0) setLocalAt(null); }, [step]);

  const onBoard = step >= 1 && !!guest;
  const drawn = step >= 2 && !!guest;
  const guestAt = state?.at ?? localAt;

  /** 화면에 올릴 줄: (손님) + 실제 등록자 + (모자라면 예시 승객) */
  const rows = useMemo(() => {
    const out: Row[] = [];
    if (onBoard && guest) out.push({ seq: guestSeq, display_name: guest.name, origin_code: guest.origin, created_at: guestAt ?? new Date(mounted).toISOString() });
    // 발표 순간 손님만 보여주기: 다른 줄은 비워서 한 줄만 남긴다
    if (drawn && fx.solo) return out;
    out.push(...real);
    const oldest = real.length ? Date.parse(real[real.length - 1].created_at) : mounted;
    let seq = real.length ? Math.min(...real.map((r) => r.seq)) : guestSeq;
    for (let i = 0; out.length < BOARD_ROWS && i < FILL.length; i++) {
      seq -= 1;
      if (seq < 1) break;
      out.push({ seq, display_name: FILL[i][0], origin_code: FILL[i][1], created_at: new Date(oldest - (i + 1) * 4 * 60000).toISOString() });
    }
    return out.slice(0, BOARD_ROWS);
  }, [onBoard, drawn, fx.solo, guest, guestSeq, guestAt, real, mounted]);

  // 바뀐 줄만 넘긴다. 처음 그릴 때는 바로 표시
  const shown = useRef<string[] | null>(null);
  useEffect(() => {
    const eng = engine.current;
    if (!eng) return;
    const first = shown.current === null;
    const prev = shown.current ?? [];
    const next: string[] = [];
    for (let i = 0; i < BOARD_ROWS; i++) {
      const c = rowCells(rows[i], i === 0 && drawn && guest ? RANK_LABEL[guest.rank] : "LANDED");
      next.push(c.join(""));
      if (first || prev[i] !== next[i]) eng.setRow(i, c, { instant: first, baseDelay: i * 25 });
    }
    shown.current = next;
  }, [rows, drawn, guest]);

  // 당첨 발표 순간(등록됨 → 추첨됨)에 한 번: 꽃가루와 효과음. 이미 발표된 상태로 화면을 열었을 때는 터뜨리지 않는다
  const audio = useRef<AudioContext | null>(null);
  const fxRef = useRef(fx);
  fxRef.current = fx;
  const prevStep = useRef(step);
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    if (prevStep.current === 1 && step === 2) {
      if (fxRef.current.confetti) setBurst((n) => n + 1);
      if (fxRef.current.sound) fanfare(audio.current);
    }
    prevStep.current = step;
  }, [step]);

  const pinShown = useRef(false);
  useEffect(() => {
    pinEngine.current?.setRow(0, pinCells(pin), { instant: !pinShown.current });
    pinShown.current = true;
  }, [pin]);

  const toggleSound = useCallback(async () => {
    const snd = sound.current!;
    if (snd.enabled) { snd.disable(); setSoundOn(false); }
    else { await snd.enable(); setSoundOn(true); snd.tick(); }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "s" || e.key === "S") toggleSound();
      if (e.key === "f" || e.key === "F") document.documentElement.requestFullscreen?.().catch(() => {});
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        if (!guest || step >= 2) return;
        if (step === 0) setLocalAt(new Date().toISOString());
        advance(step === 0 ? 1 : 2);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSound, guest, step, advance]);

  const cellEls = (width: number) => Array.from({ length: width }, (_, i) => (
    <div key={i} className={`cell ${styles.cell}`}>
      <div className={`${styles.half} ${styles.top} st`} />
      <div className={`${styles.half} ${styles.bottom} sb`} />
      <div className={`${styles.half} ${styles.top} ${styles.flapTop} ft`} />
      <div className={`${styles.half} ${styles.bottom} ${styles.flapBottom} fb`} />
    </div>
  ));

  return (
    <div className={`${styles.stage} ${pointer ? styles.pointer : ""}`} onMouseMove={wake} onMouseDown={wake}
      onClick={() => {
        // 브라우저는 화면을 한 번 눌러야 소리를 허락한다. 플랩 소리와 당첨 효과음을 같이 켠다
        try { audio.current ??= new AudioContext(); audio.current.resume().catch(() => {}); } catch {}
        if (!sound.current?.enabled) toggleSound();
      }}>
      <Confetti fire={burst} />
      <div className={styles.frame}>
        <header className={styles.head}>
          <div className={styles.titleWrap}>
            <svg className={styles.plane} viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>
            <h1 className={styles.title}>Arrivals</h1>
          </div>
          <div className={styles.meta}>
            <div className={styles.event}>{EVENT_NAME}</div>
            <div className={styles.clock}>{clock}</div>
          </div>
        </header>

        <div className={styles.colHead}>
          {COLS.map((c) => <div key={c.key} className={`${styles.colLabel} ${styles[c.key] ?? ""}`} style={{ ["--w" as string]: c.width }}>{c.label}</div>)}
        </div>

        <div className={styles.grid} ref={gridRef}>
          {Array.from({ length: BOARD_ROWS }, (_, r) => (
            <div key={r} className={`row ${styles.row} ${r === 0 && onBoard ? (drawn ? styles.gold : styles.fresh) : ""}`}>
              {COLS.map((c) => <div key={c.key} className={`${styles.group} ${styles[c.key]}`}>{cellEls(c.width)}</div>)}
            </div>
          ))}
        </div>

        <div className={styles.pin}>
          <div ref={pinRef}>
            <div className={`row ${styles.row} ${styles.pinRow}`}>
              {COLS.map((c) => <div key={c.key} className={`${styles.group} ${styles[c.key]}`}>{cellEls(c.width)}</div>)}
            </div>
          </div>
        </div>

        <footer className={styles.foot}>
          <div className={styles.total}>
            <span className={styles.totalLabel}>TOTAL ARRIVALS</span>
            <span className={styles.totalNum}>{total === null ? "----" : String(total + (onBoard ? 1 : 0)).padStart(4, "0")}</span>
          </div>
          <div className={styles.cta}>SCAN THE QR ON YOUR TICKET · 티켓 뒷면 QR을 찍고 입국하세요</div>
          <div className={styles.brand}>
            {!soundOn ? <span className={styles.status}>SOUND OFF</span> : null}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.logo} src="/brand/travelpass-dark.svg" alt="Travel Pass" />
          </div>
        </footer>
      </div>
    </div>
  );
}
