"use client";

import { useEffect, useRef } from "react";
import { FlipEngine } from "@/components/board/flipEngine";
import { cells } from "@/lib/glyphs";
import { MINI_WIDTH } from "./MiniBoard";
import s from "./register.module.css";

interface Props {
  value: string;
  placeholder: string;
  /** 커서가 있는 칸 (0~). null 이면 표시 안 함 */
  caretCell: number | null;
  invalid?: boolean;
  label: string;
  /** 칸을 눌러 커서를 옮김 (문자열 위치) */
  onPlaceCaret: (utf16: number) => void;
}

/**
 * 미리보기 플립 줄이 곧 입력칸. 보이는 건 전광판과 같은 플립 칸(Fluent 이모지 포함).
 * 글자는 화면 안 자체 자판(RegisterFlow NameStep)으로 넣는다: 기기 키보드를 띄우지 않으려고 input 을 쓰지 않는다.
 * 칸을 누르면 그 칸 앞으로 커서가 간다.
 */
export default function NameBoardInput({ value, placeholder, caretCell, invalid, label, onPlaceCaret }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const engine = useRef<FlipEngine | null>(null);

  useEffect(() => {
    engine.current = new FlipEngine(root.current!, () => {});
    return () => { engine.current?.destroy(); engine.current = null; };
  }, []);

  const shown = value || placeholder;
  // 치는 대로 바로 보여야 해서 넘김 없이 즉시 바꾼다
  useEffect(() => { engine.current?.setRow(0, shown, { instant: true }); }, [shown]);

  /** 누른 칸 → 그 칸 앞 커서 (글자 수보다 뒤를 누르면 끝) */
  const placeCaret = (clientX: number) => {
    const row = root.current?.querySelector(".row");
    if (!row) return;
    const r = row.getBoundingClientRect();
    const cell = Math.max(0, Math.floor(((clientX - r.left) / r.width) * MINI_WIDTH + 0.35));
    const g = cells(value);
    onPlaceCaret(g.slice(0, Math.min(cell, g.length)).join("").length);
  };

  return (
    <div className={`${s.nameBoard} ${invalid ? s.nameBoardInvalid : ""}`} ref={root} role="textbox" aria-label={label} aria-readonly="false"
      onPointerUp={(e) => placeCaret(e.clientX)}>
      <div className={`row ${s.miniRow} ${value ? "" : s.miniDim}`}>
        {Array.from({ length: MINI_WIDTH }, (_, c) => (
          <div key={c} className={`cell ${s.miniCell} ${caretCell === c ? s.caretCell : ""}`}>
            <div className={`${s.half} ${s.top} st`} />
            <div className={`${s.half} ${s.bottom} sb`} />
            <div className={`${s.half} ${s.top} ${s.flapTop} ft`} />
            <div className={`${s.half} ${s.bottom} ${s.flapBottom} fb`} />
          </div>
        ))}
      </div>
    </div>
  );
}
