"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
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
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSelectCaret: (utf16: number) => void;
  onFocus: () => void;
  onBlur: () => void;
}

/**
 * 미리보기 플립 줄이 곧 입력칸. 보이는 건 전광판과 같은 플립 칸(Fluent 이모지 포함)이고,
 * 그 위에 투명한 input 을 덮어 키보드 입력을 받는다. 칸을 누르면 그 칸 앞으로 커서가 간다.
 */
const NameBoardInput = forwardRef<HTMLInputElement, Props>(function NameBoardInput(
  { value, placeholder, caretCell, invalid, label, onChange, onSelectCaret, onFocus, onBlur },
  ref,
) {
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const engine = useRef<FlipEngine | null>(null);
  useImperativeHandle(ref, () => input.current!);

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
    const at = g.slice(0, Math.min(cell, g.length)).join("").length;
    requestAnimationFrame(() => {
      try { input.current?.setSelectionRange(at, at); } catch {}
      onSelectCaret(at);
    });
  };

  return (
    <div className={`${s.nameBoard} ${invalid ? s.nameBoardInvalid : ""}`} ref={root}>
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
      <input ref={input} className={s.nameBoardInput} value={value} aria-label={label}
        onChange={onChange}
        onSelect={(e) => onSelectCaret(e.currentTarget.selectionStart ?? value.length)}
        onPointerUp={(e) => placeCaret(e.clientX)}
        onFocus={onFocus} onBlur={onBlur}
        enterKeyHint="done" onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
    </div>
  );
});

export default NameBoardInput;
