"use client";

import { useEffect, useState } from "react";
import { api } from "./api";
import { fmtDateTime, PRIZE_LABEL, type PrizeType } from "@/lib/config";
import type { InventoryItem } from "@/lib/api-types";

type Item = InventoryItem;
interface Recent { seq: number; display_name: string; prize_type: PrizeType; claimed_at: string; claimed_by: string }
interface Inv { items: Item[]; recent: Recent[]; serverTime: string }

const POLL_MS = 5000;

/** 직원용 실시간 재고·수령인. refreshKey 가 바뀌면(수령 처리 직후) 즉시 다시 불러온다 */
export default function Inventory({ refreshKey = 0, recentLimit = 20 }: { refreshKey?: number; recentLimit?: number }) {
  const [inv, setInv] = useState<Inv | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let stop = false;
    const load = () => api<Inv>(`/api/admin/inventory?limit=${recentLimit}`).then((d) => { if (!stop) { setInv(d); setErr(false); } }).catch(() => !stop && setErr(true));
    load();
    const id = setInterval(load, POLL_MS);
    return () => { stop = true; clearInterval(id); };
  }, [refreshKey, recentLimit]);

  if (!inv) return <div className="card" style={{ maxWidth: "none" }}><p className="sub">{err ? "재고를 불러오지 못했어요." : "재고 불러오는 중…"}</p></div>;

  return (
    <div className="card" style={{ maxWidth: "none" }}>
      <h2 className="sec">실시간 재고{err && <small className="sub"> · 연결 끊김</small>}</h2>
      <div className="inv">
        {inv.items.map((it) => {
          const low = it.remaining !== null && it.stock !== null && it.remaining <= Math.max(1, Math.ceil(it.stock * 0.1));
          return (
            <div key={it.prize_type} className={`stat ${low ? "low" : ""}`}>
              <div className="k">{PRIZE_LABEL[it.prize_type]}</div>
              {it.remaining === null ? (
                <><div className="v">{it.claimed}<small>개 나감</small></div><div className="sub">총 수량 미설정 · 추첨·설정 탭에서 입력</div></>
              ) : (
                <div className="v">{it.remaining}<small>개 남음</small></div>
              )}
            </div>
          );
        })}
      </div>
      <h2 className="sec" style={{ marginTop: 16 }}>최근 수령인</h2>
      {inv.recent.length === 0 ? <p className="sub">아직 수령 내역이 없어요.</p> : (
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>시각</th><th>번호</th><th>표시명</th><th>경품</th><th>처리자</th></tr></thead><tbody>
          {inv.recent.map((r, i) => (
            <tr key={i}><td className="mono">{fmtDateTime(r.claimed_at)}</td><td className="mono">{String(r.seq).padStart(4, "0")}</td><td className="mono">{r.display_name}</td><td>{PRIZE_LABEL[r.prize_type]}</td><td>{r.claimed_by}</td></tr>
          ))}
        </tbody></table></div>
      )}
    </div>
  );
}
