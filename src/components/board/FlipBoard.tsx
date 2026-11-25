"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlipEngine } from "./flipEngine";
import { FlapSound } from "./sound";
import { Confetti, fanfare } from "./celebrate";
import WinnersSummary from "./WinnersSummary";
import PreDrawAd from "./PreDrawAd";
import { BOARD_ROWS, EVENT_NAME, flightCode, hhmm } from "@/lib/config";
import { FROM_WIDTH } from "@/lib/origins";
import { cells, originFlag } from "@/lib/glyphs";
import type { BoardPin } from "@/lib/api-types";
import type { DrawShow, ShowState } from "@/lib/show";
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
/** ?test 의 가짜 당첨 발표가 떠 있는 시간(분) 선택지 (실제는 추첨할 때 정한 시간을 서버가 지킨다) */
const TEST_SHOW_MIN = [0.5, 1, 3, 5, 10];
/** 광고 시간이 끝난 뒤 추첨 결과가 올 때까지 "곧 시작합니다" 화면으로 기다려 주는 시간 (보통 2~3초 안에 온다) */
const AD_HOLD_MS = 60 * 1000;
/** 직원 화면과 백엔드의 시계 차이를 이만큼은 봐준다 (추첨이 이번 연출 설정의 것인지 가릴 때) */
const SHOW_SKEW_MS = 5000;
const RANK_LABEL: Record<number, string> = { 1: "🏆 1ST", 2: "2ND", 3: "3RD" };
/** 추첨 직후 당첨자를 띄우기 전에 이름을 돌리며 뜸을 들이는 시간 */
const DRAW_SPIN_MS = 4000;
/** 그동안 줄을 새 이름으로 다시 돌리는 간격. 한 줄이 끝 칸까지 넘어가기 시작하는 시간보다 길어야 끝 칸도 돈다 */
const SPIN_STEP_MS = 680;
/** 뜸 들이는 동안 플랩 소리 크기 (평소의 몇 배) */
const SPIN_VOLUME = 0.3;

type WinnersPin = Extract<BoardPin, { kind: "winners" }>;

function fit(parts: string[]): string[] {
  return parts.flatMap((p, i) => {
    const c = cells(p.toUpperCase()).slice(0, COLS[i].width);
    return [...c, ...Array(COLS[i].width - c.length).fill(" ")];
  });
}

/** 같은 추첨인지 가리는 값. 이 값이 처음 보이면 뜸을 들인다 */
const drawKey = (pin: WinnersPin) => `${pin.round}|${pin.drawn_at}`;
const pageCount = (pin: WinnersPin) => Math.max(1, Math.ceil(pin.winners.length / BOARD_ROWS));

/** 하단 고정 줄 칸. 당첨자 화면이면 페이지 안내, 평소엔 다음 추첨 안내 */
function pinCells(pin: BoardPin | null, page: number, scanHint: boolean, spinning: boolean): string[] {
  if (!pin) return fit(COLS.map(() => ""));
  if (pin.kind === "winners" && spinning) return fit([hhmm(pin.drawn_at), "🏆", "LUCKY DRAW", "DRAWING...", "", ""]);
  // 당첨자 화면에서는 페이지 안내와 "티켓 QR 을 다시 찍어 결과 확인" 안내를 번갈아 띄운다 (경품은 현장 수령만이라)
  if (pin.kind === "winners" && scanHint) return fit([hhmm(pin.drawn_at), "📸", "SCAN TICKET", "QR TO CHECK", "RESULT", ""]);
  if (pin.kind === "winners") return fit([hhmm(pin.drawn_at), "🏆", "LUCKY DRAW", "WINNERS", "", `${page + 1}/${pageCount(pin)}`]);
  return fit([pin.at ? hhmm(pin.at) : "--:--", "🧳", "NEXT DRAW", "COULD BE YOU", "", "SOON"]);
}

/** 당첨자 한 줄. 도착 줄과 같은 형식에 REMARK 만 등수 */
function winnerCells(pin: WinnersPin, w: WinnersPin["winners"][number] | undefined, remark = w ? RANK_LABEL[w.rank] ?? "" : ""): string[] {
  return fit(w ? [hhmm(pin.drawn_at), originFlag(w.origin_code), w.origin_code, w.display_name, flightCode(w.seq), remark] : COLS.map(() => ""));
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
  /** 추첨 연출 설정(광고 · 당첨자 화면 방식 · 표시 시간)과, 서버 시계 − 이 기기 시계 */
  const [show, setShow] = useState<DrawShow | null>(null);
  const [skew, setSkew] = useState(0);
  const [now, setNow] = useState(0);
  /** 서버가 마지막으로 내려 준 당첨자. 표시 시간을 서버 기본(5분)보다 길게 잡았으면 서버가 내린 뒤에도 이걸로 계속 띄운다 */
  const [held, setHeld] = useState<WinnersPin | null>(null);
  useEffect(() => { if (serverPin?.kind === "winners") setHeld(serverPin); }, [serverPin]);
  const srvWinners = serverPin?.kind === "winners" ? serverPin : null;
  const cand = srvWinners ?? held;
  const candAt = cand ? new Date(cand.drawn_at).getTime() : 0;
  /** 이 추첨이 지금 연출 설정으로 실행된 것인지 (설정을 적은 뒤에 추첨됐으면 그렇다) */
  const linked = !!cand && !!show && candAt >= show.startAt - SHOW_SKEW_MS;
  const candView = linked ? show!.view : undefined;
  // 연출 설정이 있으면 그 표시 시간만큼, 없으면 서버가 내려 주는 동안만
  const candLive = !!cand && (linked ? now + skew < candAt + show!.showSec * 1000 : !!srvWinners);
  const livePin = useMemo<BoardPin | null>(() => {
    if (cand && candLive) return { ...cand, view: candView };
    // 표시 시간이 끝났는데 서버는 아직 당첨자를 내려 주는 동안: 다음 추첨 안내 줄로
    return srvWinners ? { kind: "next", at: null } : serverPin;
  }, [cand, candLive, candView, srvWinners, serverPin]);
  /** 표시 시간이 끝나 내린 추첨. 서버가 아직 내려 주고 있어도 폴링이 판을 다시 당첨자 화면으로 잠그지 않게 */
  const expiredKey = useRef<string | null>(null);
  useEffect(() => { if (cand && !candLive && now) expiredKey.current = drawKey(cand); }, [cand, candLive, now]);
  const pin = testPin ?? livePin;
  const winners = pin?.kind === "winners" ? pin : null;
  const [page, setPage] = useState(0);
  /**
   * 뜸 들이기가 끝난 추첨. 당첨자가 처음 내려온 순간부터 DRAW_SPIN_MS 동안은 이름을 돌리고, 그 뒤에 당첨자 줄을 띄운다.
   * 이미 발표된 뒤에 화면을 열었으면(TV 새로고침) 뜸 들이지 않고 바로 당첨자 화면.
   */
  const [landedKey, setLandedKey] = useState<string | null>(null);
  const winKey = winners ? drawKey(winners) : null;
  const spinning = winKey !== null && landedKey !== winKey;
  /** 모아보기: 플립 판 대신 1·2·3등을 한 화면에 모은 화면을 덮는다. 뜸 들이기도 그 화면 안에서 이름을 돌린다 */
  const summary = winners?.view === "summary";
  /** 당첨 효과음용. 화면을 한 번 누른 뒤(소리를 켠 뒤)에만 소리가 난다 */
  const audio = useRef<AudioContext | null>(null);
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    if (!winKey || landedKey === winKey) return;
    // 발표 순간: 꽃가루와 효과음. 이미 발표된 뒤에 화면을 연 경우는 여기를 지나지 않는다
    const t = setTimeout(() => {
      setLandedKey(winKey);
      setBurst((n) => n + 1);
      if (sound.current?.enabled) fanfare(audio.current);
    }, DRAW_SPIN_MS);
    return () => clearTimeout(t);
  }, [winKey, landedKey]);
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
  /** ?test 당첨 발표 설정: 모아보기 여부와 떠 있는 시간(분) */
  const [testSummary, setTestSummary] = useState(true);
  const [testMin, setTestMin] = useState(1);
  /** ?test 추첨 전 광고: 고른 파일(이 브라우저 안에서만 쓰는 주소), 보여 줄 시간(초), 끝나는 시각(ms). 끝나면 가짜 추첨이 바로 이어진다 */
  const [testAd, setTestAd] = useState<{ src: string; video: boolean; name: string } | null>(null);
  const [testAdSec, setTestAdSec] = useState(15);
  const [testAdAt, setTestAdAt] = useState<number | null>(null);
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
    const t = setInterval(() => { setClock(fmt.format(new Date())); setNow(Date.now()); }, 250);
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
    // 뜸 들이는 동안은 페이지를 세지 않는다 (첫 페이지가 PAGE_MS 를 다 채우게)
    // 모아보기는 한 화면이라 넘길 페이지가 없다
    if (!pages || spinning || summary) return;
    const t = setInterval(() => setPage((p) => p + 1), PAGE_MS);
    return () => clearInterval(t);
  }, [winners, pages, spinning, summary]);
  useEffect(() => {
    const eng = engine.current;
    if (!eng) return;
    if (winners && summary) {
      // 모아보기가 판을 덮는 동안 아래 판은 소리 없이 비워 둔다. 끝나면 도착 목록이 다시 넘어오며 채워진다
      winnersOn.current = true;
      setFresh([]);
      for (let i = 0; i < BOARD_ROWS; i++) eng.setRow(i, "", { instant: true });
      return;
    }
    if (winners && spinning) {
      // 뜸 들이기: 모든 줄에 당첨자 이름을 등수 없이 계속 바꿔 넣어 판이 쉬지 않고 돈다
      winnersOn.current = true;
      setFresh([]);
      const snd = sound.current;
      if (snd) snd.volume = SPIN_VOLUME;
      const list = winners.winners;
      const spin = () => {
        if (!list.length) return;
        for (let i = 0; i < BOARD_ROWS; i++) eng.setRow(i, winnerCells(winners, list[Math.floor(Math.random() * list.length)], ""));
      };
      spin();
      const t = setInterval(spin, SPIN_STEP_MS);
      return () => { clearInterval(t); if (snd) snd.volume = 1; };
    }
    if (winners) {
      winnersOn.current = true;
      setFresh([]);
      const start = curPage * BOARD_ROWS;
      for (let i = 0; i < BOARD_ROWS; i++) eng.setRow(i, winnerCells(winners, winners.winners[start + i]), { baseDelay: i * 60 });
    } else if (winnersOn.current) {
      winnersOn.current = false;
      for (let i = 0; i < BOARD_ROWS; i++) eng.setRow(i, rowCells(rowsRef.current[i]), { baseDelay: i * 60 });
    }
  }, [winners, curPage, spinning, summary]);

  // 고정 줄: 내용이 바뀌면 넘긴다(첫 표시는 바로)
  useEffect(() => {
    pinEngine.current?.setRow(0, pinCells(pin, curPage, page % 2 === 1, spinning), { instant: !pinShown.current });
    pinShown.current = true;
  }, [pin, curPage, page, spinning]);

  // 폴링: TV 가 재접속/새로고침돼도 서버 기록으로 복원된다
  useEffect(() => {
    let stop = false;
    let lastSig = "";
    let first = true;
    async function poll() {
      try {
        const r = await fetch(`/api/board?limit=${BOARD_ROWS}`, { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const data = (await r.json()) as { rows: Row[]; total: number; pin?: BoardPin };
        setOnline(true);
        const nextPin = data.pin ?? null;
        // 화면을 열었을 때 이미 발표돼 있던 추첨은 뜸 들이지 않는다
        if (first && nextPin?.kind === "winners") setLandedKey(drawKey(nextPin));
        first = false;
        setServerPin((prev) => (JSON.stringify(prev) === JSON.stringify(nextPin) ? prev : nextPin));
        // 당첨자 화면으로 바뀌는 폴링이면 도착 줄을 먼저 그리지 않게 바로 표시
        if (nextPin?.kind === "winners" && drawKey(nextPin) !== expiredKey.current) winnersOn.current = true;
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
      // 추첨 연출 설정. 못 읽어도 전광판은 그대로 돈다 (그때는 광고 없이 기본 화면으로 발표)
      try {
        const r = await fetch("/board/sync", { cache: "no-store" });
        if (r.ok) {
          const s = (await r.json()) as ShowState;
          setSkew(s.now - Date.now());
          setShow((prev) => (JSON.stringify(prev) === JSON.stringify(s.show) ? prev : s.show));
        }
      } catch {}
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

  /** 테스트: 당첨 발표 (가짜, 화면에만). 1·16·33명으로 고른 시간 동안, 다시 누르면 끈다 */
  const testWinners = useCallback(() => {
    if (testPinTimer.current) clearTimeout(testPinTimer.current);
    if (testPinRef.current) { testPinRef.current = null; setTestPin(null); return; }
    const ranks = [...Array(1).fill(1), ...Array(16).fill(2), ...Array(33).fill(3)];
    const fake: WinnersPin = {
      kind: "winners", round: "TEST", drawn_at: new Date().toISOString(), view: testSummary ? "summary" : "pages",
      winners: ranks.map((rank) => ({ rank, seq: 1 + Math.floor(Math.random() * 999), display_name: pick(TEST_NAMES), origin_code: pick(TEST_ORIGINS) })),
    };
    winnersOn.current = true;
    testPinRef.current = fake;
    setTestPin(fake);
    // 뜸 들이는 시간은 표시 시간에 넣지 않는다
    testPinTimer.current = window.setTimeout(() => { testPinRef.current = null; setTestPin(null); }, DRAW_SPIN_MS + testMin * 60000);
  }, [testSummary, testMin]);
  useEffect(() => () => { if (testPinTimer.current) clearTimeout(testPinTimer.current); }, []);

  /**
   * 추첨 전 광고: 직원이 추첨 실행을 누른 순간부터 ad.sec 초 동안 광고가 판을 덮고, 그 시간이 지나면 내린다 (영상도 거기서 자른다).
   * 광고가 끝나는 순간 직원 화면이 실제 추첨을 실행한다. 결과가 올 때까지 잠깐은 "곧 시작합니다" 화면이고, 오면 바로 이름을 돌린다.
   * adAt = 광고가 끝나는 시각 (이 기기 시계 기준)
   */
  const realAdAt = show?.ad ? show.startAt + show.ad.sec * 1000 - skew : null;
  const adAt = testAdAt ?? realAdAt;
  const adFrom = testAdAt || !show ? 0 : show.startAt - skew;
  const ad = testAdAt ? testAd : show?.ad ?? null;
  const adOn = !winners && adAt !== null && now >= adFrom && now <= adAt + AD_HOLD_MS;
  // 광고가 덮고 있는 동안 아래 판이 넘어가는 소리는 내지 않는다
  useEffect(() => {
    const snd = sound.current;
    if (!adOn || !snd) return;
    snd.volume = 0;
    return () => { snd.volume = 1; };
  }, [adOn]);
  // 테스트: 광고 시간이 끝나면 가짜 추첨으로 바로 이어 전체 흐름을 본다
  useEffect(() => {
    if (testAdAt === null || now < testAdAt) return;
    setTestAdAt(null);
    if (!testPinRef.current) testWinners();
  }, [testAdAt, now, testWinners]);

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
    else {
      await s.enable(); setSoundOn(true); s.tick();
      try { audio.current ??= new AudioContext(); audio.current.resume().catch(() => {}); } catch {}
    }
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
      <Confetti fire={burst} />
      <div className={styles.frame}>
        <header className={styles.head}>
          <div className={styles.titleWrap}>
            <svg className={styles.plane} viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>
            <h1 className={styles.title}>{spinning ? "Lucky Draw" : winners ? "Winners" : "Arrivals"}</h1>
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
            <div key={r} className={`row ${styles.row} ${winners ? (!spinning && winners.winners[curPage * BOARD_ROWS + r]?.rank === 1 ? styles.gold : "") : fresh.includes(r) ? styles.fresh : ""}`}>
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
        {adOn && adAt !== null && <PreDrawAd src={ad?.src ?? ""} video={!!ad?.video} sound={soundOn} left={adAt - now} />}
        {summary && winners && <WinnersSummary pin={winners} spinning={spinning} onTick={() => sound.current?.tick()} />}
      </div>

      {testMode && (
        <div className={`${styles.testPanel} ${pointer ? styles.show : ""}`} onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={testArrive}>새 승객 도착</button>
          <button type="button" onClick={testReplay}>전체 다시 넘기기</button>
          <button type="button" onClick={testWinners}>{testPin ? "당첨 발표 끄기" : "당첨 발표"}</button>
          <button type="button" disabled={!!testPin} onClick={() => setTestAdAt((v) => (v ? null : Date.now() + testAdSec * 1000))}>{testAdAt ? "광고 끄기" : "추첨 전 광고"}</button>
          <label>
            {testAd ? testAd.name : "광고 파일"}
            <input type="file" accept="image/*,video/*" hidden disabled={!!testAdAt} onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setTestAd((prev) => { if (prev) URL.revokeObjectURL(prev.src); return { src: URL.createObjectURL(f), video: f.type.startsWith("video/"), name: f.name.length > 14 ? `${f.name.slice(0, 12)}…` : f.name }; });
            }} />
          </label>
          <label>
            <input type="number" min={3} max={600} value={testAdSec} disabled={!!testAdAt} onChange={(e) => setTestAdSec(Math.min(600, Math.max(3, Number(e.target.value) || 3)))} />초
          </label>
          <label><input type="checkbox" checked={testSummary} disabled={!!testPin} onChange={(e) => setTestSummary(e.target.checked)} />모아보기</label>
          <label>
            표시 시간
            <select value={testMin} disabled={!!testPin} onChange={(e) => setTestMin(Number(e.target.value))}>
              {TEST_SHOW_MIN.map((m) => <option key={m} value={m}>{m < 1 ? `${m * 60}초` : `${m}분`}</option>)}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
