"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { PRIZE_LABEL, type PrizeType } from "@/lib/config";
import type { InventoryItem } from "@/lib/api-types";

/** 수량을 관리하는 경품. 마스크팩은 현장에서 따로 나눠 줘서 여기서 다루지 않는다 */
const ORDER: PrizeType[] = ["rank1", "rank2", "rank3"];

/**
 * 추첨·설정 탭의 경품 수량. 회차를 짤 때 궁금한 건 "몇 개 더 걸 수 있나" 라서 여유를 크게 보여 주고,
 * 아래 막대로 나감 · 당첨 대기 · 다음 회차 예약 · 여유 비율을 보여 준다. 관리자는 총 수량을 고칠 수 있다.
 */
export default function StockEditor({ refreshKey = "" }: { refreshKey?: string }) {
  const [items, setItems] = useState<InventoryItem[] | null>(null);
  const [draft, setDraft] = useState<Record<PrizeType, string> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api<{ items: InventoryItem[] }>("/api/admin/inventory?limit=1");
      setItems(ORDER.map((t) => d.items.find((i) => i.prize_type === t)!).filter(Boolean));
    } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);

  async function save() {
    if (!draft) return;
    setSaving(true); setErr(null);
    try {
      const stock = Object.fromEntries(ORDER.map((t) => [t, draft[t] === "" ? 0 : parseInt(draft[t], 10)]));
      await api("/api/admin/settings", { method: "PUT", body: JSON.stringify({ stock }) });
      setDraft(null);
      await load();
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  }

  const title = <h2 className="sec">경품 수량</h2>;

  if (!items) return <div className="card"><div className="claim-head">{title}</div><p className="sub">{err ?? "불러오는 중…"}</p></div>;

  return (
    <div className="card">
      <div className="claim-head">
        {title}
        {draft
          ? <div className="inline"><button className="btn ghost sm" type="button" onClick={() => { setDraft(null); setErr(null); }}>취소</button><button className="btn sm" type="button" onClick={save} disabled={saving}>저장</button></div>
          : <button className="btn ghost sm" type="button" onClick={() => setDraft(Object.fromEntries(items.map((i) => [i.prize_type, i.stock ? String(i.stock) : ""])) as Record<PrizeType, string>)}>수량 수정</button>}
      </div>
      {err && <div className="alert">{err}</div>}
      <div className="grid4 three">
        {items.map((it) => {
          const t = it.prize_type;
          return (
            <div className="stat" key={t}>
              <div className="k">{PRIZE_LABEL[t]}</div>
              {draft ? (
                <div className="stock-edit">
                  <label className="stock-input">
                    <input className="input mono" inputMode="numeric" value={draft[t]} placeholder="0" aria-label={`${PRIZE_LABEL[t]} 총 수량`}
                      onChange={(e) => setDraft((d) => d && { ...d, [t]: e.target.value.replace(/\D/g, "") })} />
                    <span>개</span>
                  </label>
                  <span className="sub">최소 {it.claimed + it.waiting + it.reserved}개 (이미 나갔거나 주인 있음)</span>
                </div>
              ) : it.stock === null ? (
                <><div className="v">{it.claimed}<small>개 나감</small></div><div className="sub">총 수량 미설정</div></>
              ) : (
                <>
                  <div className="v">{it.free}<small>개 여유</small></div>
                  <Bar it={it} />
                  <div className="stock-sub">
                    <span><i className="dot given" />나감 <b>{it.claimed}</b></span>
                    <span><i className="dot waiting" />대기 <b>{it.waiting}</b></span>
                    <span><i className="dot reserved" />예약 <b>{it.reserved}</b></span>
                    <span>총 <b>{it.stock}</b></span>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const PARTS = [
  { key: "claimed", cls: "given", name: "나감", desc: "이미 받아 간 수" },
  { key: "waiting", cls: "waiting", name: "당첨 대기", desc: "당첨됐지만 아직 안 받아 감. 기한이 지나면 여유로" },
  { key: "reserved", cls: "reserved", name: "예약", desc: "아직 추첨 안 한 회차에 걸어 둔 수" },
  { key: "free", cls: "free", name: "여유", desc: "새 회차에 더 걸 수 있는 수" },
] as const;

/**
 * 나감 · 당첨 대기 · 예약 · 여유 비율 막대.
 * 마우스를 올리면 작은 창이 뜨고(올린 칸이 강조됨), 누르면 고정된다. 폰은 누르면 뜬다. 밖을 누르거나 Esc 면 닫힌다.
 */
function Bar({ it }: { it: InventoryItem }) {
  const [pinned, setPinned] = useState(false);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pinned) return;
    const onDown = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setPinned(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPinned(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [pinned]);
  const open = pinned || hover;
  const parts = PARTS;
  const n = (k: (typeof PARTS)[number]["key"]) => (k === "free" ? it.free ?? 0 : it[k]);
  return (
    <div className="stock-bar-wrap" ref={box}
      onPointerEnter={(e) => { if (e.pointerType === "mouse") setHover(true); }}
      onPointerLeave={(e) => { if (e.pointerType === "mouse") { setHover(false); setFocus(null); } }}>
      <button type="button" className="stock-bar" aria-expanded={open} aria-label={`${PRIZE_LABEL[it.prize_type]} 수량 내역 보기`} onClick={() => setPinned((v) => !v)}>
        {parts.map((p) => n(p.key) > 0 && (
          <i key={p.key} className={`${p.cls} ${focus === p.key ? "on" : ""}`} style={{ flexGrow: n(p.key) }} onPointerEnter={() => setFocus(p.key)} />
        ))}
      </button>
      {open && (
        <div className="info-pop stock-pop" role="dialog" aria-label="수량 내역">
          {parts.map((p) => (
            <div key={p.key} className={`stock-pop-row ${focus && focus !== p.key ? "dim" : ""}`}>
              <i className={p.cls} aria-hidden="true" />
              <span><b>{p.name}</b> <span className="mono">{n(p.key)}</span><br /><span className="sub">{p.desc}</span></span>
            </div>
          ))}
          <div className="stock-pop-total">총 <b className="mono">{it.stock}</b></div>
        </div>
      )}
    </div>
  );
}
