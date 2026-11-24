"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FlipEngine } from "./flipEngine";
import { FlapSound } from "./sound";
import { BOARD_ROWS, EVENT_NAME, flightCode, hhmm } from "@/lib/config";
import { FROM_WIDTH } from "@/lib/origins";
import { cells, originFlag } from "@/lib/glyphs";
import type { BoardPin } from "@/lib/api-types";
import styles from "./board.module.css";

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
/** 마우스를 이만큼 안 움직이면 커서(와 테스트 버튼)를 숨긴다. 동영상 플레이어처럼 */
const IDLE_MS = 2500;

/** ?test 로 열면 오른쪽에 넘기기 테스트 버튼. 가짜 승객은 화면에만 뜨고 DB 에는 안 들어간다 */
const TEST_NAMES = [
  "MINJI ❤️✨", "🐱 NEKO 🌸", "ALEX ✈️🧳", "🔥JAY🔥", "LEA 🌈🦄", "KIM 😎", "SOPHIA 💜", "🥳 PARTY 🥳", "DAVID 🚀", "YUKI ⭐🍀",
  "🐼 PANDA", "HANA 😍💛", "LEO 🐻🔥", "MIA 🤩📸", "TOM 🗺️🌏", "JUN 🙌", "EMMA 🐶💙", "RIO 🏝️😜", "SORA 🗼✨", "BEN 💳😀",
];
const TEST_ORIGINS = ["SEOUL", "BUSAN", "JAPAN", "USA", "FRANCE", "SINGAPORE", "VIETNAM", "JEJU", "UK", "AUSTRALIA"];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
/** 방금 도착한 줄 강조 시간. 등록하고 바로 TV 앞에서 사진 찍는 시간까지 */
const FRESH_MS = 15000;
/** 당첨자 화면에서 한 페이지(BOARD_ROWS 명) 보여주는 시간 */
const PAGE_MS = 8000;
/** ?test 의 가짜 당첨 발표가 떠 있는 시간 (실제는 서버 WINNERS_SHOW_MS) */
const TEST_WINNERS_MS = 60000;
const RANK_LABEL: Record<number, string> = { 1: "🏆 1ST", 2: "2ND", 3: "3RD" };

type WinnersPin = Extract<BoardPin, { kind: "winners" }>;

function fit(parts: string[]): string[] {
  return parts.flatMap((p, i) => {
    const c = cells(p.toUpperCase()).slice(0, COLS[i].width);
    return [...c, ...Array(COLS[i].width - c.length).fill(" ")];
  });
}

const pageCount = (pin: WinnersPin) => Math.max(1, Math.ceil(pin.winners.length / BOARD_ROWS));

/** 하단 고정 줄 칸. 당첨자 화면이면 페이지 안내, 평소엔 다음 추첨 안내 */
function pinCells(pin: BoardPin | null, page: number, scanHint: boolean): string[] {
  if (!pin) return fit(COLS.map(() => ""));
  // 당첨자 화면에서는 페이지 안내와 "티켓 QR 을 다시 찍어 결과 확인" 안내를 번갈아 띄운다 (경품은 현장 수령만이라)
  if (pin.kind === "winners" && scanHint) return fit([hhmm(pin.drawn_at), "📸", "SCAN TICKET", "QR TO CHECK", "RESULT", ""]);
  if (pin.kind === "winners") return fit([hhmm(pin.drawn_at), "🏆", "LUCKY DRAW", "WINNERS", "", `${page + 1}/${pageCount(pin)}`]);
  return fit([pin.at ? hhmm(pin.at) : "--:--", "🧳", "NEXT DRAW", "COULD BE YOU", "", "SOON"]);
}

/** 당첨자 한 줄. 도착 줄과 같은 형식에 REMARK 만 등수 */
function winnerCells(pin: WinnersPin, w: WinnersPin["winners"][number] | undefined): string[] {
  return fit(w ? [hhmm(pin.drawn_at), originFlag(w.origin_code), w.origin_code, w.display_name, flightCode(w.seq), RANK_LABEL[w.rank] ?? ""] : COLS.map(() => ""));
}

/** 행을 칸 배열로. 이모지·국기도 한 칸이라 문자열 길이가 아니라 그래핌으로 자른다 */
function rowCells(r: Row | undefined): string[] {
  return fit(r ? [hhmm(r.created_at), originFlag(r.origin_code), r.origin_code, r.display_name, flightCode(r.seq), "LANDED"] : COLS.map(() => ""));
}

export default function FlipBoard() {
  const gridRef = useRef<HTMLDivElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const engine = useRef<FlipEngine | null>(null);
  const pinEngine = useRef<FlipEngine | null>(null);
  const [serverPin, setServerPin] = useState<BoardPin | null>(null);
  /** ?test 가짜 당첨 발표. 떠 있는 동안 서버 값보다 우선 */
  const [testPin, setTestPin] = useState<WinnersPin | null>(null);
  const testPinRef = useRef<WinnersPin | null>(null);
  const testPinTimer = useRef<number | null>(null);
  const pin = testPin ?? serverPin;
  const winners = pin?.kind === "winners" ? pin : null;
  const [page, setPage] = useState(0);
  const pinShown = useRef(false);
  /** 지금 그리드를 당첨자가 차지하고 있는지. 폴링이 도착 줄을 덮어쓰지 않게 apply 에서 본다 */
  const winnersOn = useRef(false);
  const sound = useRef<FlapSound | null>(null);
  const maxSeq = useRef<number | null>(null);
  const freshTimer = useRef<number | null>(null);
  /** 방금 도착한 번호 → 강조 끝나는 시각. 줄이 밀려 내려가도 그 사람 줄을 따라간다 */
  const freshUntil = useRef(new Map<number, number>());
  const [total, setTotal] = useState<number | null>(null);
  const [fresh, setFresh] = useState<number[]>([]);
  const [soundOn, setSoundOn] = useState(false);
  const [online, setOnline] = useState(true);
  const [clock, setClock] = useState("");
  const [testMode, setTestMode] = useState(false);
  const [pointer, setPointer] = useState(false);
  const idleTimer = useRef<number | null>(null);

  const wake = useCallback(() => {
    setPointer(true);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setPointer(false), IDLE_MS);
  }, []);
  useEffect(() => () => { if (idleTimer.current) clearTimeout(idleTimer.current); }, []);
  const rowsRef = useRef<Row[]>([]);
  const totalRef = useRef(0);

  useEffect(() => { setTestMode(new URLSearchParams(window.location.search).has("test")); }, []);

  useEffect(() => {
    sound.current = new FlapSound();
    engine.current = new FlipEngine(gridRef.current!, () => sound.current?.tick());
    pinEngine.current = new FlipEngine(pinRef.current!, () => sound.current?.tick());
    return () => { engine.current?.destroy(); pinEngine.current?.destroy(); };
  }, []);

  useEffect(() => {
    const fmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Asia/Seoul" });
    const t = setInterval(() => setClock(fmt.format(new Date())), 500);
    return () => clearInterval(t);
  }, []);

  const refreshFresh = useCallback(() => {
    const now = Date.now();
    for (const [seq, until] of freshUntil.current) if (until <= now) freshUntil.current.delete(seq);
    const idx = rowsRef.current.flatMap((r, i) => (freshUntil.current.has(r.seq) ? [i] : []));
    setFresh((prev) => (prev.join() === idx.join() ? prev : idx));
    if (freshTimer.current) clearTimeout(freshTimer.current);
    if (freshUntil.current.size) {
      const next = Math.min(...freshUntil.current.values()) - now;
      freshTimer.current = window.setTimeout(refreshFresh, Math.max(50, next));
    }
  }, []);

  const apply = useCallback((rows: Row[], newTotal: number) => {
    const eng = engine.current;
    if (!eng) return;
    const prevMax = maxSeq.current;
    const first = prevMax === null;
    const now = Date.now();
    // 당첨자 화면 중엔 기록만 해 두고, 화면이 돌아올 때 한꺼번에 넘긴다
    if (!winnersOn.current) {
      for (let i = 0; i < BOARD_ROWS; i++) {
        const r = rows[i];
        if (!first && r && r.seq > prevMax) freshUntil.current.set(r.seq, now + FRESH_MS);
        eng.setRow(i, rowCells(r), { instant: first, baseDelay: i * 25 });
      }
    }
    maxSeq.current = Math.max(rows[0]?.seq ?? 0, prevMax ?? 0);
    rowsRef.current = rows;
    totalRef.current = newTotal;
    setTotal(newTotal);
    refreshFresh();
  }, [refreshFresh]);

  // 당첨자 화면: 페이지마다 넘기고, 끝나면 그동안 쌓인 도착 목록으로 넘겨 돌아온다
  const pages = winners ? pageCount(winners) : 0;
  const curPage = pages ? page % pages : 0;
  useEffect(() => {
    setPage(0);
    if (!pages) return;
    const t = setInterval(() => setPage((p) => p + 1), PAGE_MS);
    return () => clearInterval(t);
  }, [winners, pages]);
  useEffect(() => {
    const eng = engine.current;
    if (!eng) return;
    if (winners) {
      winnersOn.current = true;
      setFresh([]);
      const start = curPage * BOARD_ROWS;
      for (let i = 0; i < BOARD_ROWS; i++) eng.setRow(i, winnerCells(winners, winners.winners[start + i]), { baseDelay: i * 60 });
    } else if (winnersOn.current) {
      winnersOn.current = false;
      for (let i = 0; i < BOARD_ROWS; i++) eng.setRow(i, rowCells(rowsRef.current[i]), { baseDelay: i * 60 });
    }
  }, [winners, curPage]);

  // 고정 줄: 내용이 바뀌면 넘긴다(첫 표시는 바로)
  useEffect(() => {
    pinEngine.current?.setRow(0, pinCells(pin, curPage, page % 2 === 1), { instant: !pinShown.current });
    pinShown.current = true;
  }, [pin, curPage, page]);

  // 폴링: TV 가 재접속/새로고침돼도 서버 기록으로 복원된다
  useEffect(() => {
    let stop = false;
    let lastSig = "";
    async function poll() {
      try {
        const r = await fetch(`/api/board?limit=${BOARD_ROWS}`, { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const data = (await r.json()) as { rows: Row[]; total: number; pin?: BoardPin };
        setOnline(true);
        const nextPin = data.pin ?? null;
        setServerPin((prev) => (JSON.stringify(prev) === JSON.stringify(nextPin) ? prev : nextPin));
        // 당첨자 화면으로 바뀌는 폴링이면 도착 줄을 먼저 그리지 않게 바로 표시
        if (nextPin?.kind === "winners") winnersOn.current = true;
        const sig = data.rows.map((x) => `${x.seq}:${x.display_name}`).join("|");
        if (sig !== lastSig || maxSeq.current === null) {
          lastSig = sig;
          apply(data.rows, data.total);
        } else {
          setTotal(data.total);
        }
      } catch {
        setOnline(false);
      }
      if (!stop) setTimeout(poll, POLL_MS);
    }
    poll();
    return () => { stop = true; };
  }, [apply]);

  /** 테스트: 가짜 승객 한 명 도착 (위에 끼우고 아래로 밀기) */
  const testArrive = useCallback(() => {
    const seq = (maxSeq.current ?? 0) + 1;
    const fake: Row = { seq, display_name: pick(TEST_NAMES), origin_code: pick(TEST_ORIGINS), created_at: new Date().toISOString() };
    apply([fake, ...rowsRef.current].slice(0, BOARD_ROWS), totalRef.current + 1);
  }, [apply]);

  /** 테스트: 당첨 발표 (가짜, 화면에만). 1·16·33명으로 TEST_WINNERS_MS 동안, 다시 누르면 끈다 */
  const testWinners = useCallback(() => {
    if (testPinTimer.current) clearTimeout(testPinTimer.current);
    if (testPinRef.current) { testPinRef.current = null; setTestPin(null); return; }
    const ranks = [...Array(1).fill(1), ...Array(16).fill(2), ...Array(33).fill(3)];
    const fake: WinnersPin = {
      kind: "winners", round: "TEST", drawn_at: new Date().toISOString(),
      winners: ranks.map((rank) => ({ rank, seq: 1 + Math.floor(Math.random() * 999), display_name: pick(TEST_NAMES), origin_code: pick(TEST_ORIGINS) })),
    };
    winnersOn.current = true;
    testPinRef.current = fake;
    setTestPin(fake);
    testPinTimer.current = window.setTimeout(() => { testPinRef.current = null; setTestPin(null); }, TEST_WINNERS_MS);
  }, []);
  useEffect(() => () => { if (testPinTimer.current) clearTimeout(testPinTimer.current); }, []);

  /** 테스트: 전 칸 비웠다가 다시 넘기기 */
  const testReplay = useCallback(() => {
    const eng = engine.current;
    if (!eng) return;
    for (let i = 0; i < BOARD_ROWS; i++) eng.setRow(i, "", { instant: true });
    window.setTimeout(() => {
      for (let i = 0; i < BOARD_ROWS; i++) eng.setRow(i, rowCells(rowsRef.current[i]), { baseDelay: i * 60 });
    }, 150);
  }, []);

  const toggleSound = useCallback(async () => {
    const s = sound.current!;
    if (s.enabled) { s.disable(); setSoundOn(false); }
    else { await s.enable(); setSoundOn(true); s.tick(); }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "s" || e.key === "S") toggleSound();
      if (e.key === "f" || e.key === "F") document.documentElement.requestFullscreen?.().catch(() => {});
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSound]);

  return (
    <div className={`${styles.stage} ${pointer ? styles.pointer : ""}`} onMouseMove={wake} onMouseDown={wake}
      onClick={() => { if (!sound.current?.enabled) toggleSound(); }}>
      <div className={styles.frame}>
        <header className={styles.head}>
          <div className={styles.titleWrap}>
            <svg className={styles.plane} viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>
            <h1 className={styles.title}>{winners ? "Winners" : "Arrivals"}</h1>
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
            <div key={r} className={`row ${styles.row} ${winners ? (winners.winners[curPage * BOARD_ROWS + r]?.rank === 1 ? styles.gold : "") : fresh.includes(r) ? styles.fresh : ""}`}>
              {COLS.map((c) => (
                <div key={c.key} className={`${styles.group} ${styles[c.key]}`}>
                  {Array.from({ length: c.width }, (_, i) => (
                    <div key={i} className={`cell ${styles.cell}`}>
                      <div className={`${styles.half} ${styles.top} st`} />
                      <div className={`${styles.half} ${styles.bottom} sb`} />
                      <div className={`${styles.half} ${styles.top} ${styles.flapTop} ft`} />
                      <div className={`${styles.half} ${styles.bottom} ${styles.flapBottom} fb`} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* 하단 고정: 평소엔 다음 추첨 안내, 당첨자 화면에선 페이지. 톤은 낮게, 줄 간격은 같게 */}
        <div className={styles.pin}>
          <div ref={pinRef}>
            <div className={`row ${styles.row} ${styles.pinRow}`}>
              {COLS.map((c) => (
                <div key={c.key} className={`${styles.group} ${styles[c.key]}`}>
                  {Array.from({ length: c.width }, (_, i) => (
                    <div key={i} className={`cell ${styles.cell}`}>
                      <div className={`${styles.half} ${styles.top} st`} />
                      <div className={`${styles.half} ${styles.bottom} sb`} />
                      <div className={`${styles.half} ${styles.top} ${styles.flapTop} ft`} />
                      <div className={`${styles.half} ${styles.bottom} ${styles.flapBottom} fb`} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        <footer className={styles.foot}>
          <div className={styles.total}>
            <span className={styles.totalLabel}>TOTAL ARRIVALS</span>
            <span className={styles.totalNum}>{total === null ? "----" : String(total).padStart(4, "0")}</span>
          </div>
          <div className={styles.cta}>SCAN THE QR ON YOUR TICKET · 티켓 뒷면 QR을 찍고 입국하세요</div>
          <div className={styles.brand}>
            {/* 운영 상태는 문제 있을 때만: 연결 끊김 > 소리 꺼짐(스태프가 한 번 클릭하거나 S 키) */}
            {!online ? (
              <span className={styles.status}><span className={styles.dotOff} />OFFLINE</span>
            ) : !soundOn ? (
              <span className={styles.status}>SOUND OFF</span>
            ) : null}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.logo} src="/brand/travelpass-dark.svg" alt="Travel Pass" />
          </div>
        </footer>
      </div>

      {testMode && (
        <div className={`${styles.testPanel} ${pointer ? styles.show : ""}`} onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={testArrive}>새 승객 도착</button>
          <button type="button" onClick={testReplay}>전체 다시 넘기기</button>
          <button type="button" onClick={testWinners}>{testPin ? "당첨 발표 끄기" : "당첨 발표"}</button>
        </div>
      )}
    </div>
  );
}
