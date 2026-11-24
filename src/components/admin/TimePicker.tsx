"use client";

import { useEffect, useRef, useState } from "react";

const ROW = 40;            // 휠 한 칸 높이(px)
const VISIBLE = 5;         // 보이는 칸 수 (가운데가 선택)
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = ["00", "15", "30", "45"];
const WEEK = "일월화수목금토";

/** 값 형식: "YYYY-MM-DDTHH:MM" (KST 기준 날짜·시각), 비었으면 "" */
export type DayTime = string;

const split = (v: DayTime) => { const [day, time] = v.split("T"); return { day, time }; };

/** 분을 15분 단위로 맞춘다 (가까운 쪽, 하루 안에서) */
function snapTime(time: string) {
  const [h, m] = time.split(":").map(Number);
  const t = Math.min(23 * 60 + 45, Math.round((h * 60 + m) / 15) * 15);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/** 같은 날 안에서 분을 더한다 */
export function shiftMinutes(v: DayTime, min: number): DayTime {
  const { day, time } = split(v);
  const [h, m] = time.split(":").map(Number);
  const t = Math.min(23 * 60 + 45, Math.max(0, h * 60 + m + min));
  return `${day}T${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/** 행사일은 요일 한 글자(수·목·금), 그 밖의 날은 M/D */
export function dayName(day: string, eventDays: string[]) {
  if (eventDays.includes(day)) return WEEK[new Date(`${day}T12:00:00+09:00`).getUTCDay()];
  const [, m, d] = day.split("-");
  return `${+m}/${+d}`;
}

/**
 * 날짜·시각 선택. 누르면 작은 창이 뜨고 요일·시·분 휠을 드래그(터치·마우스·휠 스크롤)로 돌린다.
 * 날짜는 행사일(수·목·금)만, 분은 15분 단위. 비울 수 있는 칸(optional)은 "비우기" 버튼이 있다.
 */
export default function TimePicker({ id, value, onChange, suggest, days, optional, placeholder = "-- --:--" }: {
  id?: string; value: DayTime; onChange: (v: DayTime) => void;
  /** 비어 있을 때 열면 처음 맞춰 둘 값 */
  suggest: DayTime;
  /** 고를 수 있는 날짜 (YYYY-MM-DD) */
  days: string[];
  optional?: boolean; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" || e.key === "Enter") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const normalize = (v: DayTime) => {
    const { day, time } = split(v);
    return `${days.includes(day) ? day : days[0]}T${snapTime(time)}`;
  };
  const toggle = () => {
    if (!open) onChange(normalize(value || suggest));
    setOpen((v) => !v);
  };
  const cur = split(value ? normalize(value) : normalize(suggest));
  const [h, m] = cur.time.split(":");
  const label = (d: string) => dayName(d, days);

  return (
    <div className="tp" ref={box}>
      <button id={id} type="button" className={`input mono tp-field ${value ? "" : "empty"}`} aria-haspopup="dialog" aria-expanded={open} onClick={toggle}>
        {value ? <><span className="tp-day">{label(split(value).day)}</span> {split(value).time}</> : placeholder}
      </button>
      {open && (
        <div className="tp-pop" role="dialog" aria-label="날짜·시각 선택">
          <div className="tp-wheels">
            <Wheel items={days} render={label} value={cur.day} onChange={(d) => onChange(`${d}T${h}:${m}`)} label="요일" narrow />
            <Wheel items={HOURS} value={h} onChange={(nh) => onChange(`${cur.day}T${nh}:${m}`)} label="시" />
            <span className="tp-colon">:</span>
            <Wheel items={MINUTES} value={m} onChange={(nm) => onChange(`${cur.day}T${h}:${nm}`)} label="분" />
            <i className="tp-band" aria-hidden="true" />
          </div>
          <div className="tp-actions">
            {optional && <button type="button" className="btn ghost sm" onClick={() => { onChange(""); setOpen(false); }}>비우기</button>}
            <button type="button" className="btn sm" onClick={() => setOpen(false)}>확인</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 세로 휠 한 줄. 스크롤 스냅으로 칸에 딱 맞추고, 마우스는 끌어서 돌린다 */
function Wheel({ items, value, onChange, label, render = (x) => x, narrow }: {
  items: string[]; value: string; onChange: (v: string) => void; label: string; render?: (v: string) => string; narrow?: boolean;
}) {
  const el = useRef<HTMLDivElement>(null);
  const settle = useRef<number>(0);
  const drag = useRef<{ y: number; top: number; moved: boolean } | null>(null);
  const cb = useRef(onChange);
  cb.current = onChange;

  // 처음 열릴 때 선택값을 가운데로
  useEffect(() => {
    const i = Math.max(0, items.indexOf(value));
    if (el.current) el.current.scrollTop = i * ROW;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = () => {
    const c = el.current;
    if (!c) return;
    const i = Math.min(items.length - 1, Math.max(0, Math.round(c.scrollTop / ROW)));
    if (items[i] !== value) cb.current(items[i]);
  };
  const onScroll = () => {
    clearTimeout(settle.current);
    settle.current = window.setTimeout(pick, 90);
  };
  const go = (i: number) => el.current?.scrollTo({ top: i * ROW, behavior: "smooth" });

  // 마우스 드래그 (터치는 브라우저 기본 스크롤이 처리)
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || !el.current) return;
    drag.current = { y: e.clientY, top: el.current.scrollTop, moved: false };
    el.current.style.scrollSnapType = "none";
    el.current.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !el.current) return;
    if (Math.abs(e.clientY - d.y) > 3) d.moved = true;
    el.current.scrollTop = d.top - (e.clientY - d.y);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !el.current) return;
    drag.current = null;
    el.current.style.scrollSnapType = "";
    el.current.releasePointerCapture(e.pointerId);
    if (d.moved) go(Math.round(el.current.scrollTop / ROW));
    else {
      // 그냥 클릭: 누른 칸으로 이동
      const r = el.current.getBoundingClientRect();
      const i = Math.floor((e.clientY - r.top + el.current.scrollTop - ROW * Math.floor(VISIBLE / 2)) / ROW);
      if (i >= 0 && i < items.length) go(i);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = items.indexOf(value);
    if (e.key === "ArrowUp") { e.preventDefault(); go(Math.max(0, i - 1)); }
    if (e.key === "ArrowDown") { e.preventDefault(); go(Math.min(items.length - 1, i + 1)); }
  };

  return (
    <div
      ref={el} className={`tp-wheel ${narrow ? "narrow" : ""}`} tabIndex={0} role="listbox" aria-label={label}
      style={{ height: ROW * VISIBLE, paddingBlock: ROW * Math.floor(VISIBLE / 2) }}
      onScroll={onScroll} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onKeyDown={onKeyDown}
    >
      {items.map((it) => (
        <div key={it} role="option" aria-selected={it === value} className={`tp-item ${it === value ? "on" : ""}`} style={{ height: ROW }}>{render(it)}</div>
      ))}
    </div>
  );
}
