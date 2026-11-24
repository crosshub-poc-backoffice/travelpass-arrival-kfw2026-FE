"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { fmtDateTime, PRIZE_LABEL, type PrizeType } from "@/lib/config";
import { formatPhone } from "@/lib/validation";
import Operations from "./Operations";

interface P {
  id: number; seq: number; display_name: string; origin_code: string; origin_group: string; phone: string; email: string;
  consent_marketing: boolean; consent_marketing_at: string | null; consent_version: string; consent_privacy_at: string; consent_display_at: string; hidden: boolean; hidden_reason: string | null; created_at: string;
  round_name: string | null; rank: number | null; claims: { prize_type: PrizeType; claimed_at: string; claimed_by: string }[];
}

export default function Participants({ allowReset }: { allowReset: boolean }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<P[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const limit = 50;

  const load = useCallback(async () => {
    try {
      const d = await api<{ rows: P[]; total: number }>(`/api/admin/participants?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`);
      setRows(d.rows); setTotal(d.total); setErr(null);
    } catch (e) { setErr((e as Error).message); }
  }, [q, offset]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(load, 10000); return () => clearInterval(t); }, [load]);

  async function toggleHidden(p: P) {
    const reason = p.hidden ? null : (prompt("숨김 사유 (선택)") ?? "");
    if (!p.hidden && reason === null) return;
    try {
      await api(`/api/admin/participants/${p.id}`, { method: "PATCH", body: JSON.stringify({ hidden: !p.hidden, reason }) });
      load();
    } catch (e) { alert((e as Error).message); }
  }

  async function reset() {
    if (prompt('모든 참가자·회차·수령 기록이 삭제되고, 회차는 행사 일정(6회차)으로 다시 만들어집니다. 계속하려면 RESET 을 입력하세요.') !== "RESET") return;
    try {
      const r = await api<{ scheduleError: string | null }>("/api/admin/reset", { method: "POST", body: JSON.stringify({ confirm: "RESET" }) });
      if (r.scheduleError) alert(`초기화는 됐지만 행사 일정 회차를 만들지 못했어요.\n${r.scheduleError}\n수량을 고친 뒤 추첨·설정 탭에서 다시 만들어 주세요.`);
      load();
    } catch (e) { alert((e as Error).message); }
  }

  return (
    <>
    <Operations onRegistered={load} />
    <div className="card" style={{ maxWidth: "none" }}>
      <div className="toolbar">
        <input className="input" placeholder="번호 / 표시명 / 전화 뒷자리 / 이메일" value={q} onChange={(e) => { setOffset(0); setQ(e.target.value); }} />
        <span className="sub">{total}명</span>
        <a className="btn ghost sm" href="/api/admin/export" style={{ textDecoration: "none" }}>CSV 내보내기</a>
        {allowReset && <button className="btn danger sm" onClick={reset}>전체 초기화</button>}
      </div>
      {err && <div className="alert">{err}</div>}
      <div style={{ overflowX: "auto" }}>
        <table className="tbl">
          <thead>
            <tr><th>ID</th><th>NO.</th><th>표시명</th><th>출발지</th><th>휴대폰</th><th>이메일</th><th>등록</th><th>동의</th><th>추첨</th><th>수령 (처리자)</th><th>TV</th></tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className={p.hidden ? "hidden-row" : ""}>
                <td className="mono sub">{p.id}</td>
                <td className="mono">{String(p.seq).padStart(4, "0")}</td>
                <td className="mono" style={{ fontWeight: 700 }}>{p.display_name}</td>
                <td>{p.origin_code}</td>
                <td className="mono">{formatPhone(p.phone)}</td>
                <td>{p.email}</td>
                <td className="mono">{fmtDateTime(p.created_at)}</td>
                <td className="sub" style={{ whiteSpace: "nowrap" }}>
                  필수 ✓ {fmtDateTime(p.consent_privacy_at)}<br />
                  마케팅 {p.consent_marketing ? `✓ ${fmtDateTime(p.consent_marketing_at)}` : "✗"}<br />
                  문구 {p.consent_version}
                </td>
                <td>{p.round_name ? (p.rank ? <span className="tag y">{p.rank}등</span> : <span className="tag">{p.round_name} 미당첨</span>) : <span className="sub">대기</span>}</td>
                <td>{p.claims.length === 0 ? <span className="sub">-</span> : p.claims.map((c) => <div key={c.prize_type}><span className="tag g" title={fmtDateTime(c.claimed_at)}>{PRIZE_LABEL[c.prize_type].split(" · ")[0]}</span> <span className="sub">{c.claimed_by}</span></div>)}</td>
                <td>
                  <button className="btn ghost sm" onClick={() => toggleHidden(p)} title={p.hidden_reason ?? ""}>{p.hidden ? "숨김 해제" : "숨기기"}</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={12} className="sub" style={{ textAlign: "center", padding: 24 }}>참가자가 없어요.</td></tr>}
          </tbody>
        </table>
      </div>
      {total > limit && (
        <div className="row-btns">
          <button className="btn ghost sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>이전</button>
          <span className="sub" style={{ alignSelf: "center" }}>{offset + 1}–{Math.min(total, offset + limit)} / {total}</span>
          <button className="btn ghost sm" disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)}>다음</button>
        </div>
      )}
    </div>
    </>
  );
}
