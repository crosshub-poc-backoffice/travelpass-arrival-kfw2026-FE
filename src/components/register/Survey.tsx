"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SURVEY_COUNT, hhmm } from "@/lib/config";
import { useI18n } from "../i18n-client";
import s from "./register.module.css";

export interface SurveyState {
  answers: Record<number, number>;
  done: boolean;
  /** 새로 시작할 수 있는 기한 */
  until: string | null;
  /** 시작한 사람이 마저 답할 수 있는 기한 (추첨 시각) */
  closes: string | null;
  /** 추첨에 2배로 들어갔는지. 추첨 전이면 null */
  applied: boolean | null;
}

/**
 * 보기 순서를 사람마다 섞는 문항. 맨 위만 누르는 답이 한 보기에 몰리지 않게 한다.
 * "자주 / 가끔 / 없음"처럼 순서에 뜻이 있는 1·3번은 섞지 않는다.
 */
const SHUFFLED = [2, 4, 5, 6, 7];
/** 남은 시간을 숫자로 보여주기 시작하는 시점. 그 전에는 "13:00까지"만 */
const COUNT_FROM_MS = 5 * 60000;

/** 참가자·문항마다 고정된 보기 순서 (다시 들어와도 같은 순서). 돌려주는 값은 보기 번호 1~4 */
export function optionOrder(seq: number, q: number): number[] {
  const order = [1, 2, 3, 4];
  if (!SHUFFLED.includes(q)) return order;
  // mulberry32
  let a = (seq * 7919 + q * 104729) >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

const firstOpen = (answers: Record<number, number>) => {
  for (let q = 1; q <= SURVEY_COUNT; q++) if (!answers[q]) return q;
  return SURVEY_COUNT;
};

/**
 * 추가 질문 7문항. 한 화면에 한 문제, 보기를 누르면 저장하고 바로 다음 문제.
 * 잘못 눌렀을 때 고칠 수 있게 '이전'이 있다. 답은 문항마다 서버에 저장돼 중간에 나가도 이어서 한다.
 * 추첨 시각이 되면 조용히 완료 화면으로 돌아간다.
 * preview: 개발용 연습. 답을 서버에 보내지 않고 화면만 넘긴다 (끝까지 답하면 onExit(true))
 */
export default function Survey({ seq, survey, onExit, preview }: { seq: number; survey: SurveyState; onExit: (finished?: boolean) => void; preview?: boolean }) {
  const { t, fmt } = useI18n();
  const [answers, setAnswers] = useState(survey.answers);
  const [q, setQ] = useState(() => firstOpen(survey.answers));
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const item = t.survey[q - 1];
  const order = useMemo(() => optionOrder(seq, q), [seq, q]);

  // 문항이 보인 순간부터 누를 때까지 걸린 시간 (읽지 않고 누른 답을 통계에서 가려내는 용도)
  const shownAt = useRef(0);
  useEffect(() => { shownAt.current = performance.now(); setErr(null); window.scrollTo({ top: 0 }); }, [q]);

  const closes = survey.closes ? Date.parse(survey.closes) : null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const left = closes === null ? null : closes - now;
  useEffect(() => { if (left !== null && left <= 0) onExit(); }, [left, onExit]);

  async function pick(choice: number, pos: number) {
    if (busy !== null) return;
    setBusy(choice);
    setErr(null);
    if (preview) {
      await new Promise((r) => setTimeout(r, 200));
      const next = { ...answers, [q]: choice };
      setAnswers(next);
      setBusy(null);
      if (Object.keys(next).length >= SURVEY_COUNT) return onExit(true);
      return setQ(q < SURVEY_COUNT ? q + 1 : firstOpen(next));
    }
    try {
      const r = await fetch("/api/survey", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ q, choice, pos, ms: Math.round(performance.now() - shownAt.current) }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.status === 409) return onExit(); // 그 사이 추첨됨
      if (!r.ok) return setErr(r.status === 429 ? t.error.RATE_LIMITED : t.common.network);
      const next = { ...answers, [q]: choice };
      setAnswers(next);
      if (data.done) return onExit();
      setQ(q < SURVEY_COUNT ? q + 1 : firstOpen(next));
    } catch {
      setErr(t.common.network);
    } finally {
      setBusy(null);
    }
  }

  const mmss = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, "0")}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;

  return (
    <div className={`card ${s.wizard}`}>
      <div className={s.bar}>
        <button type="button" className={s.back} onClick={() => (q === 1 ? onExit() : setQ(q - 1))} aria-label={t.wizard.back}>←</button>
        <div className={s.progress} role="progressbar" aria-valuemin={1} aria-valuemax={SURVEY_COUNT} aria-valuenow={q}>
          {Array.from({ length: SURVEY_COUNT }, (_, i) => <i key={i} className={i < q ? s.on : ""} />)}
        </div>
        {left !== null && left > 0 && (
          <span className={`${s.timeLeft} ${left <= COUNT_FROM_MS ? s.soon : ""}`} role="timer" aria-live="off">
            {left <= COUNT_FROM_MS ? mmss(left) : fmt(t.home.surveyUntil, { time: hhmm(survey.closes!) })}
          </span>
        )}
      </div>

      <div className={s.step} key={q}>
        <h1 className={`${s.h} ${s.q}`}>{item.lead && <span className={s.qLead}>{item.lead} </span>}{item.q}</h1>
        <div className={s.opts}>
          {order.map((choice, i) => (
            <button key={choice} type="button" disabled={busy !== null}
              className={`${s.opt} ${(busy ?? answers[q]) === choice ? s.picked : ""}`}
              onClick={() => pick(choice, i + 1)}>
              {item.options[choice - 1]}
            </button>
          ))}
        </div>
        {err && <div className={s.err} role="alert">{err}</div>}
      </div>
    </div>
  );
}
