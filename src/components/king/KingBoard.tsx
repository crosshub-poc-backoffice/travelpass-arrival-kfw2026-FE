"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlipEngine } from "@/components/board/flipEngine";
import { FlapSound } from "./sound";
import { BOARD_ROWS, EVENT_NAME, flightCode, hhmm } from "@/lib/config";
import { FROM_WIDTH } from "@/lib/origins";
import { cells, originFlag } from "@/lib/glyphs";
import type { BoardPin } from "@/lib/api-types";
import { KING_FX } from "@/lib/king";
import { mockRows, mockWinners, type MockRow } from "./mock";
import styles from "@/components/board/board.module.css";
import { useKing } from "./useKing";

/**
 * 시연용 전광판. 평소 전광판(components/board/FlipBoard)과 같은 모양이지만 줄은 모두 가짜 승객(mock.ts)이다.
 * 등록됨: 손님 줄을 맨 위에 얹는다.
 * 추첨됨: 몇 초 동안 모든 줄의 이름을 돌리며 뜸을 들이다가, 실제 당첨자 화면(Winners)과 같은 모양으로 멈춘다.
 *   손님은 직원 화면에서 정한 등수로 들어가고 나머지 당첨자는 가짜다. 손님 줄이 마지막에 멈춘다.
 * 실제 추첨은 일어나지 않고 실제 등록자·DB 는 건드리지 않는다 (하단 "다음 추첨" 시각만 읽는다).
 * 신호가 안 올 때는 → · 스페이스 · PageDown 으로 직접 넘긴다 (S 소리, F 전체 화면).
 */
type Row = MockRow;

const COLS = [
  { key: "time", label: "TIME", width: 5 },
  { key: "flag", label: "FROM", width: 1 },
  { key: "from", label: "", width: FROM_WIDTH },
  { key: "name", label: "PASSENGER", width: 12 },
  { key: "flight", label: "FLIGHT", width: 7 },
  { key: "remark", label: "REMARK", width: 6 },
] as const;

const POLL_MS = 5000;
const IDLE_MS = 2500;
/** 뜸 들이는 동안 줄을 새 이름으로 다시 돌리는 간격. 한 줄이 끝 칸까지 넘어가기 시작하는 시간보다 길어야 끝 칸도 돈다 */
const SPIN_MS = 680;
/** 발표 때 줄이 멈추는 순서: 다른 당첨자는 위에서부터 이 간격으로, 손님 줄은 맨 마지막에 */
const LAND_STEP_MS = 90;
const LAND_GUEST_MS = 900;
/** 추첨 중 플랩 소리 크기 (평소의 몇 배). 모든 줄이 계속 돌아서 평소 음량이면 너무 크다 */
const SPIN_VOLUME = 0.3;
const RANK_LABEL: Record<number, string> = { 1: "🏆 1ST", 2: "2ND", 3: "3RD" };

function fit(parts: string[]): string[] {
  return parts.flatMap((p, i) => {
    const c = cells(p.toUpperCase()).slice(0, COLS[i].width);
    return [...c, ...Array(COLS[i].width - c.length).fill(" ")];
  });
}

function rowCells(r: Row | undefined, remark = "LANDED"): string[] {
  return fit(r ? [hhmm(r.created_at), originFlag(r.origin_code), r.origin_code, r.display_name, flightCode(r.seq), remark] : COLS.map(() => ""));
}

type Mode = "arrivals" | "drawing" | "winners";

function pinCells(pin: BoardPin | null, mode: Mode, drawnAt: number): string[] {
  if (mode === "drawing") return fit([hhmm(new Date(drawnAt)), "🏆", "LUCKY DRAW", "DRAWING...", "", ""]);
  if (mode === "winners") return fit([hhmm(new Date(drawnAt)), "🏆", "LUCKY DRAW", "WINNERS", "", "1/1"]);
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
  const { guest, step, state, seq: guestSeq, epoch, next, advance, drawing, landed } = useKing("board");
  const fx = { ...KING_FX, ...state?.fx };
  const gridRef = useRef<HTMLDivElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const engine = useRef<FlipEngine | null>(null);
  const pinEngine = useRef<FlipEngine | null>(null);
  const sound = useRef<FlapSound | null>(null);
  const [pin, setPin] = useState<BoardPin | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [clock, setClock] = useState("");
  const [pointer, setPointer] = useState(false);
  const idleTimer = useRef<number | null>(null);
  const [mounted] = useState(() => Date.now());
  /** 신호 없이 키보드로 넘겼을 때 쓸 등록 시각 · 추첨 시각 */
  const [localAt, setLocalAt] = useState<string | null>(null);
  const [localDraw, setLocalDraw] = useState<number | null>(null);

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

  // 하단 "다음 추첨" 시각만 실제 값을 읽는다 (읽기 전용). 끊기면 마지막 값을 그대로 둔다
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      try {
        const r = await fetch("/api/board?limit=1", { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const data = (await r.json()) as { pin?: BoardPin };
        if (stop) return;
        const nextPin = data.pin ?? null;
        setPin((prev) => (JSON.stringify(prev) === JSON.stringify(nextPin) ? prev : nextPin));
      } catch {}
      if (!stop) timer = setTimeout(poll, POLL_MS);
    }
    poll();
    return () => { stop = true; clearTimeout(timer); };
  }, []);

  useEffect(() => { if (step === 0) { setLocalAt(null); setLocalDraw(null); } }, [step]);

  const onBoard = step >= 1 && !!guest;
  const mode: Mode = !onBoard || step < 2 ? "arrivals" : drawing ? "drawing" : "winners";
  const guestAt = state?.at ?? localAt;
  const drawnAt = state?.drawAt ?? localDraw ?? mounted;

  /**
   * 가짜 승객 줄의 맨 위 번호와 도착 시각. 회차마다 한 번 정해 두고 그동안은 바꾸지 않는다
   * (기다리는 사이 실제 등록이 늘어도 화면의 번호가 한꺼번에 다시 넘어가지 않게).
   */
  const [top, setTop] = useState<{ epoch: number; seq: number; at: number } | null>(null);
  useEffect(() => {
    if (next === null) return;
    setTop((prev) => (prev && prev.epoch === epoch ? prev : { epoch, seq: next - 1, at: Date.now() - 2 * 60000 }));
  }, [next, epoch]);

  const topSeq = top ? (onBoard ? Math.min(top.seq, guestSeq - 1) : top.seq) : null;
  const topAt = top?.at ?? mounted;
  const pool = useMemo(() => (topSeq === null ? [] : mockRows(topSeq, topAt)), [topSeq, topAt]);
  const poolRef = useRef(pool);
  poolRef.current = pool;

  const gName = guest?.name, gOrigin = guest?.origin, gRank = guest?.rank;
  /** 도착 목록: (손님) + 가짜 승객 */
  const rows = useMemo(() => {
    const out: Row[] = [];
    if (onBoard && gName && gOrigin) out.push({ seq: guestSeq, display_name: gName, origin_code: gOrigin, created_at: guestAt ?? new Date(mounted).toISOString() });
    return [...out, ...pool].slice(0, BOARD_ROWS);
  }, [onBoard, gName, gOrigin, guestSeq, guestAt, pool, mounted]);
  /** 당첨자 화면 한 장: 손님(정해 둔 등수) + 가짜 당첨자 */
  const winners = useMemo(
    () => (onBoard && gName && gOrigin && gRank ? mockWinners({ name: gName, origin: gOrigin, rank: gRank, seq: guestSeq }, pool, epoch) : []),
    [onBoard, gName, gOrigin, gRank, guestSeq, pool, epoch],
  );
  const guestRow = winners.findIndex((w) => w.guest);

  /** 지금 판에 떠 있는 줄 (같은 줄은 다시 넘기지 않는다). null 이면 아직 아무것도 안 그렸다 */
  const shown = useRef<string[] | null>(null);

  // 뜸 들이기: 모든 줄에 가짜 승객을 계속 바꿔 넣어 판이 쉬지 않고 돈다
  useEffect(() => {
    const eng = engine.current;
    if (mode !== "drawing" || !eng) return;
    shown.current = [];
    const snd = sound.current;
    if (snd) snd.volume = SPIN_VOLUME;
    const spin = () => {
      const list = poolRef.current;
      if (!list.length) return;
      for (let i = 0; i < BOARD_ROWS; i++) eng.setRow(i, rowCells(list[Math.floor(Math.random() * list.length)], ""));
    };
    spin();
    const id = setInterval(spin, SPIN_MS);
    // 당첨자 줄이 멈출 때는 평소 소리로
    return () => { clearInterval(id); if (snd) snd.volume = 1; };
  }, [mode]);

  // 도착 목록 · 당첨자 화면: 바뀐 줄만 넘긴다. 처음 그릴 때는 바로 표시
  useEffect(() => {
    const eng = engine.current;
    if (mode === "drawing" || !eng || topSeq === null) return;
    const first = shown.current === null;
    const prev = shown.current ?? [];
    const now: string[] = [];
    let order = 0;
    for (let i = 0; i < BOARD_ROWS; i++) {
      const w = winners[i];
      const c = mode === "winners"
        ? (w ? fit([hhmm(new Date(drawnAt)), originFlag(w.origin_code), w.origin_code, w.display_name, flightCode(w.seq), RANK_LABEL[w.rank]]) : rowCells(undefined))
        : rowCells(rows[i]);
      now.push(c.join(""));
      if (!first && prev[i] === now[i]) continue;
      const baseDelay = mode === "winners" ? (w?.guest ? LAND_GUEST_MS : order++ * LAND_STEP_MS) : i * 25;
      eng.setRow(i, c, { instant: first, baseDelay });
    }
    shown.current = now;
  }, [mode, rows, winners, drawnAt, topSeq]);

  // 당첨자 줄이 다 멈춘 순간에 한 번: 꽃가루와 효과음. 이미 발표된 상태로 화면을 열었을 때는 터뜨리지 않는다
  const audio = useRef<AudioContext | null>(null);
  const fxRef = useRef(fx);
  fxRef.current = fx;
  const sawDraw = useRef(false);
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    if (step < 2) { sawDraw.current = false; return; }
    if (!landed) { sawDraw.current = true; return; }
    if (!sawDraw.current) return;
    sawDraw.current = false;
    if (fxRef.current.confetti) setBurst((n) => n + 1);
    if (fxRef.current.sound) fanfare(audio.current);
  }, [step, landed]);

  const pinShown = useRef(false);
  useEffect(() => {
    pinEngine.current?.setRow(0, pinCells(pin, mode, drawnAt), { instant: !pinShown.current });
    pinShown.current = true;
  }, [pin, mode, drawnAt]);

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
        else setLocalDraw(Date.now());
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

  /** 강조하는 줄은 손님 줄 하나뿐: 도착 목록에서는 맨 위, 당첨자 화면에서는 줄이 다 멈춘 뒤 손님 자리(직원 화면에서 끌 수 있다) */
  const hot = mode === "arrivals" ? (onBoard ? 0 : -1) : mode === "winners" && landed && fx.highlight ? guestRow : -1;
  const count = topSeq === null ? null : onBoard ? guestSeq : topSeq;

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
            <h1 className={styles.title}>{mode === "arrivals" ? "Arrivals" : mode === "drawing" ? "Lucky Draw" : "Winners"}</h1>
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
            <div key={r} className={`row ${styles.row} ${r === hot ? styles.fresh : ""}`}>
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
            <span className={styles.totalNum}>{count === null ? "----" : String(count).padStart(4, "0")}</span>
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
