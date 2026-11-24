"use client";

import { useEffect, useRef } from "react";
import { FlipEngine } from "@/components/board/flipEngine";
import s from "./register.module.css";

export const MINI_WIDTH = 12;

/** 부스 TV 보드와 같은 스플릿 플랩 엔진으로, 입력 중인 내용을 미리 보여주는 작은 보드 */
export default function MiniBoard({ rows }: { rows: { label: string; text: string; dim?: boolean }[] }) {
  const root = useRef<HTMLDivElement>(null);
  const engine = useRef<FlipEngine | null>(null);
  const texts = rows.map((r) => r.text).join("\n");

  useEffect(() => {
    engine.current = new FlipEngine(root.current!, () => {});
    return () => { engine.current?.destroy(); engine.current = null; };
  }, []);

  useEffect(() => {
    texts.split("\n").forEach((t, i) => engine.current?.setRow(i, t));
  }, [texts]);

  return (
    <div className={s.mini} ref={root} aria-hidden="true">
      {rows.map((r, i) => (
        <div key={i} className={s.miniLine}>
          <div className={s.miniLabel}>{r.label}</div>
          <div className={`row ${s.miniRow} ${r.dim ? s.miniDim : ""}`}>
            {Array.from({ length: MINI_WIDTH }, (_, c) => (
              <div key={c} className={`cell ${s.miniCell}`}>
                <div className={`${s.half} ${s.top} st`} />
                <div className={`${s.half} ${s.bottom} sb`} />
                <div className={`${s.half} ${s.top} ${s.flapTop} ft`} />
                <div className={`${s.half} ${s.bottom} ${s.flapBottom} fb`} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
