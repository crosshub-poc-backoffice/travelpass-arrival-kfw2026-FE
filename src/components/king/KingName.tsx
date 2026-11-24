"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { NAME_MAX } from "@/lib/config";
import { EMOJI_PALETTE, NAME_EMOJI_MAX, cells, emojiSrc, originFlag, paletteEmoji } from "@/lib/glyphs";
import { MESSAGES, fmt } from "@/lib/i18n";
import { filterName } from "@/lib/validation";
import MiniBoard, { MINI_WIDTH } from "@/components/register/MiniBoard";
import NameBoardInput from "@/components/register/NameBoardInput";
import s from "@/components/register/register.module.css";

const w = MESSAGES.ko.wizard;
const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/;
const PICTO = /\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]/u;

/** 키보드 위로 실제 보이는 영역 (visualViewport). 지원 안 하면 null */
function useVisibleArea(active: boolean) {
  const [area, setArea] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!active || !vv) { setArea(null); return; }
    const update = () => setArea({ top: vv.offsetTop, height: vv.height });
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => { vv.removeEventListener("resize", update); vv.removeEventListener("scroll", update); };
  }, [active]);
  return area;
}

/**
 * 이름 입력. 실제 등록의 이름 단계(RegisterFlow 의 NameStep)와 같은 화면·같은 규칙이다:
 * 전광판과 같은 12칸 플립 줄에 바로 치고, 이모지는 아래 목록에서 최대 3개.
 * 미리 채워진 이름을 그대로 두거나 그 자리에서 고친다.
 */
export default function KingName({ value, origin, onChange }: { value: string; origin: string; onChange: (name: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  /** 마지막 커서 위치. 팔레트를 누르다 포커스를 잃어도 이 자리에 넣는다 */
  const caret = useRef<number | null>(null);
  /** 걸러낸 뒤 되돌릴 커서 (대문자 변환·문자 제거로 커서가 끝으로 튀는 걸 막는다) */
  const pendingCaret = useRef<number | null>(null);
  const [focused, setFocused] = useState(false);
  const [caretAt, setCaretAt] = useState<number | null>(null);
  const [notice, setNotice] = useState<"" | "latin" | "emoji">("");
  const noticeTimer = useRef<number | null>(null);
  const area = useVisibleArea(focused);

  const cur = cells(value);
  const full = cur.filter((g) => paletteEmoji(g)).length >= NAME_EMOJI_MAX || cur.length >= NAME_MAX;

  useLayoutEffect(() => {
    const el = input.current;
    if (el && pendingCaret.current !== null && document.activeElement === el) {
      try { el.setSelectionRange(pendingCaret.current, pendingCaret.current); } catch {}
    }
    if (pendingCaret.current !== null) setCaretAt(pendingCaret.current);
    pendingCaret.current = null;
  }, [value]);
  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);

  const flash = (n: "latin" | "emoji") => {
    setNotice(n);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(""), 3500);
  };

  const change = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const at = e.target.selectionStart ?? raw.length;
    const next = filterName(raw);
    if (HANGUL.test(raw)) flash("latin");
    else if (cells(raw).some((g) => PICTO.test(g) && !paletteEmoji(g))) flash("emoji");
    const pos = Math.min(next.length, filterName(raw.slice(0, at)).length);
    pendingCaret.current = pos;
    caret.current = pos;
    onChange(next);
  };

  /** 팔레트 이모지를 커서 자리에 끼워 넣는다 (커서를 둔 적 없으면 끝) */
  const insert = (em: string) => {
    const el = input.current;
    const live = el && document.activeElement === el;
    const at = Math.min(value.length, live ? (el!.selectionStart ?? value.length) : (caret.current ?? value.length));
    const end = Math.min(value.length, live ? (el!.selectionEnd ?? at) : at);
    const next = filterName(value.slice(0, at) + em + value.slice(end));
    const pos = Math.min(next.length, filterName(value.slice(0, at) + em).length);
    pendingCaret.current = pos;
    caret.current = pos;
    onChange(next);
  };

  const noticeText = notice === "latin" ? w.nameOnlyLatin : notice === "emoji" ? w.nameEmojiPalette : "";
  const caretCell = focused ? Math.min(MINI_WIDTH - 1, cells(value.slice(0, caretAt ?? value.length)).length) : null;

  return (
    <>
      <h1 className={s.h}>{w.nameTitle}</h1>
      <p className={s.sub}>{w.nameSub}</p>
      <MiniBoard rows={[{ label: "FROM", text: originFlag(origin) + origin }]} />
      <div className={focused ? s.nameSheet : undefined}
        style={focused ? (area ? { top: area.top, height: area.height } : { top: 0, height: "50dvh" }) : undefined}>
        <div className={s.miniLabel}>PASSENGER</div>
        <NameBoardInput ref={input} value={value} placeholder={w.namePlaceholder} caretCell={caretCell} label={w.nameTitle}
          onChange={change}
          onSelectCaret={(at) => { caret.current = at; setCaretAt(at); }}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => { if (document.activeElement !== input.current) setFocused(false); }, 0)} />
        <div className={`${s.hint} ${notice ? s.notice : ""}`} aria-live="polite">{noticeText || fmt(w.nameHint, { max: NAME_MAX })}</div>
        <div className={s.palette} role="group" aria-label="emoji">
          {EMOJI_PALETTE.map((em) => (
            <button key={em} type="button" className={s.emojiBtn} disabled={full} aria-label={em} tabIndex={-1}
              onPointerDown={(ev) => ev.preventDefault()} onMouseDown={(ev) => ev.preventDefault()} onClick={() => insert(em)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={s.emojiImg} src={emojiSrc(em) ?? ""} alt={em} draggable={false} />
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
