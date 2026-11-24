"use client";

import { useEffect, useState } from "react";
import { api } from "./api";
import { ORIGIN_MAP } from "@/lib/origins";
import { PRIZES, PRIZE_LABEL, fmtDateTime, type PrizeType, type Rank } from "@/lib/config";
import Inventory from "./Inventory";
import { MESSAGES } from "@/lib/i18n";

const STEP_LABEL: Record<string, string> = { quiz: "퀴즈", origin: "출발지", phone: "휴대폰", email: "이메일", name: "표시명", consent: "동의" };

interface S {
  total: number; domestic: number; overseas: number; other: number; marketing: number; hidden: number; days: number;
  byDay: { day: string; count: number }[]; byHour: { hour: string; count: number }[];
  byOrigin: { origin_code: string; origin_group: string; count: number }[];
  claims: { prize_type: string; count: number }[]; winners: { rank: Rank; count: number }[];
  byStaff: { claimed_by: string; prize_type: PrizeType; count: number; last_at: string }[];
  survey: { started: number; done: number; answers: { q: number; choice: number; n: number; fast: number }[] };
  steps: { step: string; n: number }[];
}

export default function Stats() {
  const [s, setS] = useState<S | null>(null);
  useEffect(() => {
    const load = () => api<S>("/api/admin/stats").then(setS).catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);
  if (!s) return <div className="card"><p className="sub">불러오는 중…</p></div>;
  const max = Math.max(1, ...s.byOrigin.map((o) => o.count));
  const maxH = Math.max(1, ...s.byHour.map((o) => o.count));
  const claimed = (t: string) => s.claims.find((c) => c.prize_type === t)?.count ?? 0;
  // 도달한 기기가 많은 단계부터 = 화면 순서 (퀴즈 위치를 바꿔도 맞게 나온다)
  const steps = [...s.steps].sort((a, b) => b.n - a.n);
  const maxStep = Math.max(1, ...steps.map((x) => x.n));

  return (
    <>
      <div className="card" style={{ maxWidth: "none" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--s2)", flexWrap: "wrap" }}>
          <h2 className="sec">{s.days > 0 ? `입국 현황 · ${s.days}일차` : "아직 입국자가 없어요"}</h2>
          <div style={{ display: "flex", gap: "var(--s2)" }}>
            <a className="btn ghost sm" href="/api/admin/analytics/summary" style={{ textDecoration: "none" }}>통계 요약</a>
            <a className="btn ghost sm" href="/api/admin/analytics/export" style={{ textDecoration: "none" }}>상세 통계</a>
          </div>
        </div>
        <div className="grid4">
          <div className="stat"><div className="k">누적 입국</div><div className="v">{s.total.toLocaleString()}</div></div>
          <div className="stat"><div className="k">국내 / 해외 / 직접입력</div><div className="v">{s.domestic}<small>/ {s.overseas} / {s.other}</small></div></div>
          <div className="stat"><div className="k">마케팅 동의</div><div className="v">{s.marketing}<small>{s.total ? Math.round((s.marketing / s.total) * 100) : 0}%</small></div></div>
          <div className="stat"><div className="k">마스크팩 수령</div><div className="v">{claimed("mask")}<small>/ {s.total}</small></div></div>
        </div>
        <div className="grid4">
          {([1, 2, 3] as Rank[]).map((r) => (
            <div className="stat" key={r}><div className="k">{r}등 {PRIZES[r].name} 수령</div><div className="v">{claimed(`rank${r}`)}<small>/ {s.winners.find((w) => w.rank === r)?.count ?? 0} 당첨</small></div></div>
          ))}
          <div className="stat"><div className="k">TV 숨김</div><div className="v">{s.hidden}</div></div>
        </div>
      </div>
      <div className="grid2">
        <div className="card" style={{ maxWidth: "none" }}>
          <h2 className="sec">일자별</h2>
          {s.byDay.map((d) => <div className="bar" key={d.day}><span className="l">{d.day}</span><span className="b"><i style={{ width: `${(d.count / Math.max(1, ...s.byDay.map((x) => x.count))) * 100}%` }} /></span><span className="n">{d.count}</span></div>)}
          <h2 className="sec" style={{ marginTop: "var(--s3)" }}>시간대별</h2>
          {s.byHour.map((d) => <div className="bar" key={d.hour}><span className="l">{d.hour}</span><span className="b"><i style={{ width: `${(d.count / maxH) * 100}%` }} /></span><span className="n">{d.count}</span></div>)}
        </div>
        <div className="card" style={{ maxWidth: "none" }}>
          <h2 className="sec">출발지 분포</h2>
          {s.byOrigin.map((o) => (
            <div className="bar" key={o.origin_code}>
              <span className="l">{ORIGIN_MAP.get(o.origin_code)?.label.split(" ")[0] ?? o.origin_code}</span>
              <span className="b"><i className={o.origin_group === "overseas" ? "ov" : o.origin_group === "other" ? "ot" : ""} style={{ width: `${(o.count / max) * 100}%` }} /></span>
              <span className="n">{o.count}</span>
            </div>
          ))}
          <p className="sub" style={{ marginTop: 8 }}>노랑 국내 · 파랑 해외 · 회색 직접 입력</p>
        </div>
      </div>
      <div className="grid2">
        <div className="card" style={{ maxWidth: "none" }}>
          <h2 className="sec">추가 질문 · 완료 {s.survey.done}명{s.total > 0 && ` (${Math.round((s.survey.done / s.total) * 100)}%)`} · 시작 {s.survey.started}명</h2>
          {s.survey.answers.length === 0 ? <p className="sub">아직 응답이 없어요.</p> : MESSAGES.ko.survey.map((item, qi) => {
            const rows = s.survey.answers.filter((a) => a.q === qi + 1);
            const sum = Math.max(1, rows.reduce((n, a) => n + a.n, 0));
            return (
              <div key={qi} style={{ marginTop: "var(--s2)" }}>
                <p className="sub" style={{ marginBottom: 4 }}>{qi + 1}. {item.q}</p>
                {item.options.map((label, ci) => {
                  const a = rows.find((x) => x.choice === ci + 1);
                  return <div className="bar" key={ci}><span className="l" title={label}>{label}</span><span className="b"><i style={{ width: `${((a?.n ?? 0) / sum) * 100}%` }} /></span><span className="n">{a?.n ?? 0}</span></div>;
                })}
              </div>
            );
          })}
          {s.survey.answers.length > 0 && <p className="sub" style={{ marginTop: 8 }}>1초 안에 누른 답 {s.survey.answers.reduce((n, a) => n + a.fast, 0)}건 포함</p>}
        </div>
        <div className="card" style={{ maxWidth: "none" }}>
          <h2 className="sec">등록 단계별 도달</h2>
          {steps.length === 0 ? <p className="sub">아직 기록이 없어요.</p> : steps.map((x, i) => (
            <div className="bar" key={x.step}>
              <span className="l">{STEP_LABEL[x.step] ?? x.step}</span>
              <span className="b"><i style={{ width: `${(x.n / maxStep) * 100}%` }} /></span>
              <span className="n">{x.n}{i > 0 && steps[i - 1].n > 0 && <small> −{Math.round((1 - x.n / steps[i - 1].n) * 100)}%</small>}</span>
            </div>
          ))}
          <p className="sub" style={{ marginTop: 8 }}>각 단계 화면을 본 기기 수 · 오른쪽은 앞 단계 대비 이탈</p>
        </div>
      </div>
      <div className="card" style={{ maxWidth: "none" }}>
        <h2 className="sec">처리자별 수령</h2>
        {s.byStaff.length === 0 ? <p className="sub">아직 수령 내역이 없어요.</p> : (
          <table className="tbl"><thead><tr><th>처리자</th><th>경품</th><th>건수</th><th>마지막 처리</th></tr></thead><tbody>
            {s.byStaff.map((b) => (
              <tr key={`${b.claimed_by}-${b.prize_type}`}><td>{b.claimed_by}</td><td>{PRIZE_LABEL[b.prize_type]}</td><td className="mono">{b.count}</td><td className="mono">{fmtDateTime(b.last_at)}</td></tr>
            ))}
          </tbody></table>
        )}
      </div>
      <Inventory recentLimit={100} />
    </>
  );
}
