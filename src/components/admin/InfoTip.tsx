"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 제목 옆 ⓘ. 누르면 작은 말풍선이 떠서 설명을 보여 준다. 밖을 누르거나 Esc 면 닫힌다.
 * align="right" 면 말풍선을 오른쪽 끝에 맞춘다 (화면 오른쪽에 있는 칸용).
 */
export default function InfoTip({ label, children, htmlFor, align = "left", title }: {
  /** 제목 글자 */
  label: React.ReactNode;
  /** 말풍선 내용 */
  children: React.ReactNode;
  /** 제목이 입력칸 라벨이면 그 입력칸 id */
  htmlFor?: string;
  align?: "left" | "right";
  /** ⓘ 버튼의 접근성 이름 */
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <span className="info-row" ref={box}>
      {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : label}
      <button type="button" className="info" aria-label={title ?? "설명 보기"} aria-expanded={open} onClick={() => setOpen((v) => !v)}>i</button>
      {open && <span className={`info-pop ${align === "right" ? "right" : ""}`} role="tooltip">{children}</span>}
    </span>
  );
}
