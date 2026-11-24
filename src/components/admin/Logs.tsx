"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { fmtDateTime, PRIZE_LABEL, type PrizeType } from "@/lib/config";

interface Row {
  id: number; created_at: string; actor: string; action: string; target: string | null;
  detail: Record<string, unknown> | null; device_id: string | null; ip: string | null; user_agent: string | null;
  seq: number | null; round_name: string | null;
}
interface Resp { rows: Row[]; more: boolean; actors: string[] }

const ACTION: Record<string, string> = {
  login: "로그인",
  claim: "수령",
  unclaim: "수령 취소",
  hide: "TV 숨김",
  unhide: "TV 숨김 해제",
  "round.create": "회차 추가",
  "round.update": "회차 수정",
  "round.delete": "회차 삭제",
  "round.schedule": "일정 회차 생성",
  "round.draw": "추첨 실행",
  "stock.update": "경품 수량 변경",
  "registration.open": "등록 재개",
  "registration.pause": "등록 중단",
  "notice.post": "공지 올림",
  "notice.update": "공지 고침",
  "notice.clear": "공지 내림",
  "register.paper": "종이 등록",
  export: "CSV 내보내기",
  analytics_export: "상세 통계 다운로드",
  analytics_summary_export: "통계 요약 다운로드",
  reset: "전체 초기화",
};
const GROUPS: [string, string][] = [["", "전체"], ["claim", "수령"], ["round", "추첨·회차"], ["setting", "설정"], ["participant", "참가자"], ["login", "로그인"]];
const STOCK_KEYS: [string, string][] = [["rank1", "1등"], ["rank2", "2등"], ["rank3", "3등"], ["mask", "마스크팩"]];

/** 공지 내용은 한 줄로 줄여 보여준다 (전체는 마우스를 올리면) */
const short = (t: string) => { const one = t.replace(/\s+/g, " ").trim(); return one.length > 40 ? `${one.slice(0, 40)}…` : one; };
const no = (n: number) => `NO.${String(n).padStart(4, "0")}`;

function what(r: Row) {
  const d = r.detail ?? {};
  const prize = typeof d.prize_type === "string" ? PRIZE_LABEL[d.prize_type as PrizeType] ?? d.prize_type : null;
  const round = r.round_name ?? (typeof d.name === "string" ? d.name : null);
  switch (r.action) {
    case "claim": {
      const v = d.verify as { id?: string; call?: boolean } | null | undefined;
      const how = v ? [v.id === "pass" ? "탑승권" : v.id === "phone4" ? "뒷 4자리" : null, v.call ? "전화" : null].filter(Boolean).join("+") : "";
      return [prize, how && `확인 ${how}`].filter(Boolean).join(" · ");
    }
    case "unclaim": return [prize, d.note as string].filter(Boolean).join(" · ");
    case "hide": return (d.reason as string) || "";
    case "round.draw": {
      const w = Array.isArray(d.winners) ? d.winners.length : null;
      return [round, w != null && `당첨 ${w}명`, d.force ? "강제" : null].filter(Boolean).join(" · ");
    }
    case "round.create": case "round.update": case "round.delete": return round ?? "";
    case "round.schedule": return Array.isArray(d.created) ? d.created.join(", ") : "";
    case "stock.update": {
      const from = (d.from ?? {}) as Record<string, number>;
      const to = (d.to ?? {}) as Record<string, number>;
      return STOCK_KEYS.filter(([k]) => from[k] !== to[k]).map(([k, l]) => `${l} ${from[k] ?? "-"}→${to[k] ?? "-"}`).join(", ");
    }
    case "notice.post": case "notice.update": case "notice.clear": return typeof d.text === "string" ? short(d.text) : "";
    case "register.paper": return typeof d.seq === "number" ? no(d.seq) : "";
    default: return "";
  }
}

/** user-agent 에서 기기 종류만 짧게 */
function deviceKind(ua: string | null) {
  if (!ua) return "";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  return "";
}

export default function Logs() {
  const [actor, setActor] = useState("");
  const [group, setGroup] = useState("");
  const [device, setDevice] = useState("");
  const [data, setData] = useState<Resp | null>(null);
  const [older, setOlder] = useState<Row[]>([]);
  /** 이어 불러온 뒤의 '더 있음' (처음 페이지는 data.more) */
  const [olderMore, setOlderMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const qs = useCallback((before?: number) => {
    const p = new URLSearchParams();
    if (actor) p.set("actor", actor);
    if (group) p.set("group", group);
    if (device) p.set("device", device);
    if (before) p.set("before", String(before));
    return p.toString();
  }, [actor, group, device]);

  const load = useCallback(async () => {
    try {
      const d = await api<Resp>(`/api/admin/logs?${qs()}`);
      setData(d);
      setErr(null);
    } catch (e) { setErr((e as Error).message); }
  }, [qs]);

  // 필터가 바뀌면 이어 불러온 목록을 비운다
  useEffect(() => { setOlder([]); setOlderMore(false); }, [qs]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(load, 10000); return () => clearInterval(t); }, [load]);

  async function loadMore() {
    const all = [...(data?.rows ?? []), ...older];
    const last = all[all.length - 1];
    if (!last) return;
    try {
      const d = await api<Resp>(`/api/admin/logs?${qs(last.id)}`);
      setOlder((o) => [...o, ...d.rows]);
      setOlderMore(d.more);
    } catch (e) { setErr((e as Error).message); }
  }

  const rows = [...(data?.rows ?? []), ...older.filter((o) => !data?.rows.some((r) => r.id === o.id))];
  const more = older.length ? olderMore : !!data?.more;

  return (
    <div className="card" style={{ maxWidth: "none" }}>
      <div className="toolbar">
        <select className="select" value={actor} onChange={(e) => setActor(e.target.value)} aria-label="이름">
          <option value="">모든 사람</option>
          {data?.actors.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        {device && <button className="btn ghost sm" onClick={() => setDevice("")}>기기 {device.slice(0, 4)} ✕</button>}
      </div>
      <div className="day-chips" role="group" aria-label="종류" style={{ marginBottom: 16 }}>
        {GROUPS.map(([v, l]) => <button key={v} type="button" className={group === v ? "on" : ""} aria-pressed={group === v} onClick={() => setGroup(v)}>{l}</button>)}
      </div>
      {err && <div className="alert">{err}</div>}
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>시각</th><th>이름</th><th>한 일</th><th>대상</th><th>내용</th><th>기기</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="mono">{fmtDateTime(r.created_at)}</td>
                <td>{r.actor}</td>
                <td>{ACTION[r.action] ?? r.action}</td>
                <td className="mono">{r.seq != null ? no(r.seq) : ""}</td>
                <td className="sub" title={r.action.startsWith("notice.") && typeof r.detail?.text === "string" ? r.detail.text : undefined}>{what(r)}</td>
                <td title={[r.ip, r.user_agent].filter(Boolean).join("\n")}>
                  {r.device_id
                    ? <button className="tag" style={{ border: 0, cursor: "pointer" }} onClick={() => setDevice(r.device_id!)}>{r.device_id.slice(0, 4)}</button>
                    : <span className="sub">-</span>}
                  <span className="sub">{deviceKind(r.user_agent)}</span>
                </td>
              </tr>
            ))}
            {data && rows.length === 0 && <tr><td colSpan={6} className="sub" style={{ textAlign: "center", padding: 24 }}>로그가 없어요.</td></tr>}
          </tbody>
        </table>
      </div>
      {more && <div style={{ textAlign: "center", marginTop: 12 }}><button className="btn ghost sm" onClick={loadMore}>더 보기</button></div>}
    </div>
  );
}
