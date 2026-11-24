"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n-client";
import s from "./register.module.css";

/** 문항별 정답 보기 번호 (1~4). 문구는 i18n 의 quiz */
export const QUIZ_ANSWERS = [2, 3, 2];
export const QUIZ_COUNT = QUIZ_ANSWERS.length;
/** 정답 표시(초록)를 보여준 뒤 다음으로 넘어가기까지 */
const NEXT_MS = 500;

/**
 * 기본 퀴즈 한 문제. 보기를 누르면 끝: 정답이면 초록으로 바뀌고 바로 다음으로, 오답이면 그 보기만 흐려지고 다시 고른다.
 * '다음' 버튼이 없다. 답은 저장하지 않는다 (홍보용).
 */
export default function Quiz({ index, onCorrect }: { index: number; onCorrect: () => void }) {
  const { t } = useI18n();
  const item = t.quiz[index];
  const [wrong, setWrong] = useState<number[]>([]);
  const [right, setRight] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function pick(n: number) {
    if (right) return;
    if (n === QUIZ_ANSWERS[index]) {
      setRight(true);
      timer.current = setTimeout(onCorrect, NEXT_MS);
    } else {
      setWrong((w) => [...w, n]);
      try { navigator.vibrate?.(30); } catch {}
    }
  }

  return (
    <>
      <h1 className={`${s.h} ${s.q}`}><span className={s.qLead}>{item.lead} </span>{item.q}</h1>
      <div className={s.opts}>
        {item.options.map((label, i) => {
          const n = i + 1;
          const isRight = right && n === QUIZ_ANSWERS[index];
          const isWrong = wrong.includes(n);
          return (
            <button key={n} type="button" className={`${s.opt} ${isRight ? s.right : ""} ${isWrong ? s.wrong : ""}`}
              disabled={isWrong || (right && !isRight)} onClick={() => pick(n)}>
              {label}
            </button>
          );
        })}
      </div>
    </>
  );
}
