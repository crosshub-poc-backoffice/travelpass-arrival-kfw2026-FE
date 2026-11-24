"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KingState, KingStep } from "@/lib/king";

const CACHE = "king_state";
const KEY = "king_key";
const POLL_MS = 1000;

type Local = { epoch: number; step: KingStep };

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

  const accept = useCallback((s: KingState) => {
    setServer(s);
    try { window.localStorage.setItem(CACHE, JSON.stringify(s)); } catch {}
    setLocal((prev) => (!prev || prev.epoch !== s.epoch ? { epoch: s.epoch, step: s.step } : s.step > prev.step ? { epoch: s.epoch, step: s.step } : prev));
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
          if (!stop) nextSeq.current = Math.max(d.rows[0]?.seq ?? 0, d.total ?? 0) + 1;
        }
      } catch {}
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
    send({ action: "step", epoch, step, seq: mySeqRef.current }).catch(() => {});
  }, [send]);

  // 서버가 등록을 알고 있으면 서버 번호, 아직이면 이 화면이 붙인 번호
  const seq = (server && server.step >= 1 ? server.guest?.seq : null) ?? mySeq ?? server?.guest?.seq ?? 1;

  return { state: server, guest: server?.guest ?? null, step: (local?.step ?? 0) as KingStep, epoch: local?.epoch ?? 0, seq, online, advance, send };
}
