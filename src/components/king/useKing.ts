"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { KING_LAND_MS, KING_PHONE_LAG_MS, KING_SUSPENSE_MS, type KingState, type KingStep } from "@/lib/king";
import { MIN_SEQ } from "./mock";

const CACHE = "king_state";
const KEY = "king_key";
const POLL_MS = 1000;

type Local = { epoch: number; step: KingStep };
/** 이 화면 시계로 뜸 들이기가 끝나는 시각. 회차마다 한 번만 정한다 (폴링 때마다 다시 계산하면 발표 순간이 흔들린다) */
type Reveal = { epoch: number; at: number };

/** 주소 끝의 #k=값 을 한 번 읽어 기기에 저장한다 (서버에 KING_KEY 를 넣었을 때만 필요) */
function readKey() {
  try {
    const m = window.location.hash.match(/k=([^&]+)/);
    if (m) {
      window.localStorage.setItem(KEY, decodeURIComponent(m[1]));
      window.history.replaceState(null, "", window.location.pathname);
    }
    return window.localStorage.getItem(KEY) ?? "";
  } catch { return ""; }
}

/**
 * 시연 상태를 1초마다 확인한다. 화면은 서버 응답을 기다리지 않는다:
 * advance 를 부르면 이 화면은 바로 다음 단계로 가고, 서버에는 닿을 때까지 다시 보낸다.
 * 마지막으로 받은 상태는 기기에 남겨 둬서, 연결이 끊긴 채 새로 열어도 손님 정보가 있다.
 */
export function useKing(who: "board" | "phone" | "admin") {
  const [server, setServer] = useState<KingState | null>(null);
  const [local, setLocal] = useState<Local | null>(null);
  const [online, setOnline] = useState(false);
  const localRef = useRef<Local | null>(null);
  localRef.current = local;
  const keyRef = useRef("");
  /** 지금 등록하면 받을 번호 = 실제 마지막 번호 + 1. 대기 중에 미리 알아 둬서 누르는 순간 기다리지 않는다 */
  const nextSeq = useRef<number | null>(null);
  /** 이 화면에서 등록을 넘겼을 때 붙인 번호. 서버에 닿을 때까지 다시 보낼 때도 같이 간다 */
  const [mySeq, setMySeq] = useState<number | null>(null);
  const mySeqRef = useRef<number | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [, setTick] = useState(0);

  const accept = useCallback((s: KingState) => {
    setServer(s);
    try { window.localStorage.setItem(CACHE, JSON.stringify(s)); } catch {}
    setLocal((prev) => (!prev || prev.epoch !== s.epoch ? { epoch: s.epoch, step: s.step } : s.step > prev.step ? { epoch: s.epoch, step: s.step } : prev));
    setReveal((prev) => {
      if (prev && prev.epoch === s.epoch) return prev;
      // 서버가 적어 둔 추첨 시각에서 남은 시간만큼. 서버 시계와 이 기기 시계가 달라도 남은 시간은 같다
      if (s.step >= 2) return { epoch: s.epoch, at: s.drawAt ? Date.now() + (s.drawAt + KING_SUSPENSE_MS - s.now) : 0 };
      return null;
    });
  }, []);

  const send = useCallback(async (body: Record<string, unknown>) => {
    const r = await fetch("/king/sync", {
      method: "POST", cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, key: keyRef.current }),
    });
    if (!r.ok) throw new Error(String(r.status));
    const s = (await r.json()) as KingState;
    accept(s);
    return s;
  }, [accept]);

  useEffect(() => {
    keyRef.current = readKey();
    try {
      const raw = window.localStorage.getItem(CACHE);
      if (raw) {
        const s = JSON.parse(raw) as KingState;
        setServer(s);
        setLocal({ epoch: s.epoch, step: s.step });
        // 이미 발표된 상태로 다시 열었으면 뜸 들이지 않고 결과부터
        if (s.step >= 2) setReveal({ epoch: s.epoch, at: 0 });
      }
    } catch {}
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const r = await fetch(`/king/sync?who=${who}`, { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const s = (await r.json()) as KingState;
        if (stop) return;
        setOnline(true);
        const mine = localRef.current;
        accept(s);
        // 이 화면이 서버보다 앞서 있으면(보낸 요청이 못 갔으면) 다시 알린다
        if (mine && mine.epoch === s.epoch && mine.step > s.step) send({ action: "step", epoch: mine.epoch, step: mine.step, seq: mySeqRef.current }).catch(() => {});
      } catch {
        if (!stop) setOnline(false);
      }
      if (!stop) timer = setTimeout(poll, POLL_MS);
    };
    poll();
    return () => { stop = true; clearTimeout(timer); };
  }, [who, accept, send]);

  // 실제 등록자 목록에서 다음 번호를 미리 받아 둔다 (읽기 전용)
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const look = async () => {
      try {
        const r = await fetch("/api/board?limit=1", { cache: "no-store" });
        if (r.ok) {
          const d = (await r.json()) as { rows: { seq: number }[]; total: number };
          if (!stop) nextSeq.current = Math.max(d.rows[0]?.seq ?? 0, d.total ?? 0, MIN_SEQ - 1) + 1;
        }
      } catch {}
      // 실제 목록을 못 읽어도 화면은 떠야 한다
      if (!stop) { nextSeq.current ??= MIN_SEQ; setNext(nextSeq.current); }
      if (!stop) timer = setTimeout(look, 3000);
    };
    look();
    return () => { stop = true; clearTimeout(timer); };
  }, []);

  const advance = useCallback((step: KingStep) => {
    const cur = localRef.current;
    const epoch = cur?.epoch ?? 0;
    if (cur && cur.step >= step) return;
    const next = { epoch, step };
    localRef.current = next;
    setLocal(next);
    if (step === 1) { mySeqRef.current = nextSeq.current; setMySeq(nextSeq.current); }
    if (step === 2) setReveal((prev) => (prev && prev.epoch === epoch ? prev : { epoch, at: Date.now() + KING_SUSPENSE_MS }));
    send({ action: "step", epoch, step, seq: mySeqRef.current }).catch(() => {});
  }, [send]);

  // 서버가 등록을 알고 있으면 서버 번호, 아직이면 이 화면이 붙인 번호
  const seq = (server && server.step >= 1 ? server.guest?.seq : null) ?? mySeq ?? server?.guest?.seq ?? 1;

  const step = (local?.step ?? 0) as KingStep;
  const epoch = local?.epoch ?? 0;
  // 추첨 뒤 세 순간: 뜸 들이기 끝(당첨자 줄이 넘어가기 시작) → 줄이 다 멈춤(꽃가루·효과음) → 손님 폰에 결과
  const at = step >= 2 ? (reveal && reveal.epoch === epoch ? reveal.at : 0) : null;
  const marks = at === null ? [] : [at, at + KING_LAND_MS, at + KING_LAND_MS + KING_PHONE_LAG_MS];
  const now = Date.now();
  const [revealed, landed, told] = marks.length ? marks.map((m) => now >= m) : [false, false, false];
  // 다음 순간이 오면 다시 그린다
  const upcoming = marks.find((m) => m > now) ?? null;
  useEffect(() => {
    if (upcoming === null) return;
    const id = setTimeout(() => setTick((n) => n + 1), Math.max(0, upcoming - Date.now()) + 5);
    return () => clearTimeout(id);
  }, [upcoming]);

  return {
    state: server, guest: server?.guest ?? null, step, epoch, seq, online, advance, send,
    /** 지금 등록하면 받을 번호. 아직 모르면 null */
    next,
    /** 추첨을 눌렀고 아직 이름을 돌리는 중 */
    drawing: step >= 2 && !revealed,
    revealed, landed, told,
  };
}
