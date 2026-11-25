"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { DRAW_QTY, EVENT_DAYS, TZ, fmtDateTime, plannedClaimMin, scheduleRounds, type Rank } from "@/lib/config";
import StockEditor from "./StockEditor";
import NoticeEditor from "./NoticeEditor";
import InfoTip from "./InfoTip";
import DrawDialog, { type DrawPreview as Preview } from "./DrawDialog";
import TimePicker from "./TimePicker";
import { loadChoice, saveChoice, type ShowChoice } from "./ShowOptions";
import type { ShowState } from "@/lib/show";

interface Round {
  id: number; name: string; cutoff_at: string; announce_at: string | null; claim_until: string | null; qty_rank1: number; qty_rank2: number; qty_rank3: number; status: "open" | "drawn";
  eligible_from_seq: number | null; eligible_to_seq: number | null; eligible_count: number | null; drawn_at: string | null; drawn_by: string | null;
  winners: { rank: Rank; seq: number }[];
}
interface Data { rounds: Round[]; prizes: Record<Rank, { name: string; stock: number }>; allocated: Record<Rank, number> }

/** ISO 시각 → KST 날짜(YYYY-MM-DD)·시각(HH:MM) */
function kstParts(iso: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
/** 오늘이 행사일이면 오늘, 아니면 첫 행사일 */
function defaultDay() {
  const today = kstParts(new Date().toISOString()).day;
  return EVENT_DAYS.includes(today) ? today : EVENT_DAYS[0];
}
/** ISO → 피커 값 "YYYY-MM-DDTHH:MM" (KST) */
const toDayTime = (iso: string | null) => { if (!iso) return ""; const k = kstParts(iso); return `${k.day}T${k.time}`; };
/** 피커 값 → ISO (KST 기준) */
const at = (v: string) => (v ? new Date(`${v}:00+09:00`).toISOString() : null);

/** 세 시각은 각각 요일(행사일)·시·분을 고른다. 수량은 입력 중 그대로(빈 칸 허용) 문자열로 둔다 */
const emptyForm = () => ({ name: "", cutoff: "", announce: "", claim: "", qty_rank1: String(DRAW_QTY[1]), qty_rank2: String(DRAW_QTY[2]), qty_rank3: String(DRAW_QTY[3]) });
/** 숫자만, 앞자리 0 은 뗀다 (1 을 지우고 3 을 치면 03 이 아니라 3) */
const digits = (v: string) => v.replace(/\D/g, "").replace(/^0+(?=\d)/, "");

export default function Rounds() {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [preview, setPreview] = useState<Record<number, Preview>>({});

  const load = useCallback(async () => {
    try {
      const d = await api<Data>("/api/admin/rounds");
      setData(d); setErr(null);
      const pv: typeof preview = {};
      await Promise.all(d.rounds.filter((r) => r.status === "open").map(async (r) => { pv[r.id] = await api(`/api/admin/rounds/${r.id}/preview`); }));
      setPreview(pv);
    } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  // 등록이 계속 들어오니 화면을 보고 있는 동안 회차별 인원을 5초마다 새로 받는다
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 5000);
    return () => clearInterval(t);
  }, [load]);


  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (!form.cutoff) { alert("응모 마감 시각을 골라 주세요."); return; }
      const { name, cutoff, announce, claim, qty_rank1, qty_rank2, qty_rank3 } = form;
      const body = { name, qty_rank1: Number(qty_rank1 || 0), qty_rank2: Number(qty_rank2 || 0), qty_rank3: Number(qty_rank3 || 0), cutoff_at: at(cutoff), announce_at: at(announce), claim_until: at(claim) };
      if (editing) await api(`/api/admin/rounds/${editing}`, { method: "PATCH", body: JSON.stringify(body) });
      else await api("/api/admin/rounds", { method: "POST", body: JSON.stringify(body) });
      closeForm();
      load();
    } catch (e) { alert((e as Error).message); }
  }

  /** 추첨 확인 창: 누른 순간 대상을 새로 받아 보여 주고, 실행·오류도 창 안에서 처리 */
  const [drawing, setDrawing] = useState<{ r: Round; pv: Preview | null; busy: boolean; err: string | null; claimMin: string; show: ShowChoice; adUntil: number | null } | null>(null);
  async function draw(r: Round) {
    const planned = plannedClaimMin(r);
    setDrawing({ r, pv: null, busy: false, err: null, claimMin: planned === null ? "" : String(planned), show: loadChoice(), adUntil: null });
    try {
      const pv = await api<Preview>(`/api/admin/rounds/${r.id}/preview`);
      setPreview((p) => ({ ...p, [r.id]: pv }));
      setDrawing((d) => d && d.r.id === r.id ? { ...d, pv } : d);
    } catch (e) { setDrawing((d) => d && { ...d, err: (e as Error).message }); }
  }
  /** 실제 추첨. 광고가 끝났을 때·"지금 바로 추첨"·광고 없는 추첨이 모두 여기로 온다. 한 번만 실행되게 막는다 */
  const drawSent = useRef(false);
  async function runDraw() {
    if (!drawing || drawSent.current) return;
    drawSent.current = true;
    const { r, claimMin } = drawing;
    setDrawing((d) => d && { ...d, busy: true, err: null });
    try {
      await api(`/api/admin/rounds/${r.id}/draw`, { method: "POST", body: JSON.stringify({ force: new Date(r.announce_at ?? r.cutoff_at).getTime() > Date.now(), claimMin: claimMin === "" ? null : Number(claimMin) }) });
      setDrawing(null);
      load();
    } catch (e) { setDrawing((d) => d && { ...d, busy: false, adUntil: null, err: (e as Error).message }); }
    finally { drawSent.current = false; }
  }
  /**
   * 추첨 실행: 고른 연출(광고 · 당첨자 화면 방식 · 표시 시간)을 전광판에 먼저 알린다.
   * 광고가 있으면 그 시간만큼 기다렸다가 추첨하고(광고 중에 폰에서 결과가 먼저 보이지 않게), 없으면 바로 추첨한다.
   */
  async function confirmDraw() {
    if (!drawing || drawing.busy) return;
    const { show } = drawing;
    saveChoice(show);
    setDrawing({ ...drawing, busy: true, err: null });
    try {
      await api<ShowState>("/board/sync", { method: "POST", body: JSON.stringify({ action: "start", ad: show.ad ? { src: show.ad.url, video: show.ad.video, sec: show.adSec } : null, view: show.view, showSec: show.showMin * 60 }) });
    } catch (e) {
      // 연출 설정이 전광판에 안 가면 추첨하지 않고 멈춘다 (광고 없이 엉뚱한 화면으로 발표되지 않게)
      setDrawing((d) => d && { ...d, busy: false, err: `전광판에 연출 설정을 보내지 못했어요. ${(e as Error).message}` });
      return;
    }
    if (show.ad) setDrawing((d) => d && { ...d, busy: false, adUntil: Date.now() + show.adSec * 1000 });
    else await runDraw();
  }
  // 광고가 끝나는 순간 추첨
  const adUntil = drawing?.adUntil ?? null;
  useEffect(() => {
    if (adUntil === null) return;
    const t = setTimeout(() => { runDraw(); }, Math.max(0, adUntil - Date.now()));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adUntil]);
  async function drawNow() {
    await api("/board/sync", { method: "POST", body: JSON.stringify({ action: "skip" }) }).catch(() => {});
    await runDraw();
  }
  async function cancelAd() {
    await api("/board/sync", { method: "POST", body: JSON.stringify({ action: "cancel" }) }).catch(() => {});
    setDrawing((d) => d && { ...d, adUntil: null, busy: false });
  }

  async function remove(r: Round) {
    if (!confirm(`${r.name} 회차를 삭제할까요?`)) return;
    try { await api(`/api/admin/rounds/${r.id}`, { method: "DELETE" }); load(); } catch (e) { alert((e as Error).message); }
  }

  /** 회차들에 배정한 등수별 당첨 인원 합계 */

  const startEdit = (r: Round) => {
    setEditing(r.id);
    setForm({ name: r.name, cutoff: toDayTime(r.cutoff_at), announce: toDayTime(r.announce_at), claim: toDayTime(r.claim_until), qty_rank1: String(r.qty_rank1), qty_rank2: String(r.qty_rank2), qty_rank3: String(r.qty_rank3) });
    setFormOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  /** 고를 수 있는 날: 행사일 + (수정 중인 회차가 다른 날이면 그날도) */
  const days = [...new Set([...EVENT_DAYS, ...[form.cutoff, form.announce, form.claim].filter(Boolean).map((v) => v.slice(0, 10))])].sort();
  // 행사 일정(행사일 × 13:00·17:00) 중 마감 시각이 같은 회차가 없는 것
  const missing = data ? scheduleRounds().filter((s) => !data.rounds.some((r) => new Date(r.announce_at ?? r.cutoff_at).getTime() === s.announce.getTime())) : [];
  async function fillSchedule() {
    if (!confirm(`행사 일정 회차 ${missing.length}개를 만들까요?\n${missing.map((s) => s.name).join(", ")}\n회차마다 1등 ${DRAW_QTY[1]} · 2등 ${DRAW_QTY[2]} · 3등 ${DRAW_QTY[3]}`)) return;
    try { await api("/api/admin/rounds/schedule", { method: "POST" }); load(); } catch (e) { alert((e as Error).message); }
  }
  const closeForm = () => { setEditing(null); setForm(emptyForm()); setFormOpen(false); };

  return (
    <>
      {data && <StockEditor refreshKey={data.rounds.map((r) => `${r.id}${r.status}${r.qty_rank1}.${r.qty_rank2}.${r.qty_rank3}${r.claim_until}`).join()} />}

      <div className="card">
        <div className="claim-head">
          <h2 className="sec">추첨 회차</h2>
          {!formOpen && (
            <div className="round-head-actions">
              {missing.length > 0 && <button className="btn ghost sm" type="button" onClick={fillSchedule}>행사 일정 {missing.length}회차 만들기</button>}
              <button className="btn sm" type="button" onClick={() => setFormOpen(true)}>+ 회차 추가</button>
            </div>
          )}
        </div>

        {formOpen && (
          <form className="round-form" onSubmit={save}>
            <b>{editing ? "회차 수정" : "새 회차"}</b>
            <input className="input" placeholder="회차 이름 (예: 11/25 오전)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <div className="round-form-grid times">
              <div className="sub field-col">
                <label htmlFor="round-cutoff">응모 마감</label>
                <TimePicker id="round-cutoff" days={days} value={form.cutoff} suggest={`${defaultDay()}T13:00`} onChange={(v) => setForm((f) => ({ ...f, cutoff: v }))} />
              </div>
              <div className="sub field-col">
                <InfoTip label="발표 예정" htmlFor="round-announce" title="발표 예정 시각 안내">참가자 화면에 안내되는 시간이에요. 실제 추첨은 &quot;추첨 실행&quot; 버튼을 눌러야 진행돼요.</InfoTip>
                <TimePicker id="round-announce" days={days} optional value={form.announce} suggest={form.cutoff || `${defaultDay()}T13:00`} onChange={(v) => setForm((f) => ({ ...f, announce: v }))} />
              </div>
              <div className="sub field-col">
                <InfoTip label="수령 기한" htmlFor="round-claim" title="수령 기한 안내" align="right">이 시각까지 1~3등 경품을 안 받아 가면 당첨이 자동으로 취소되고, 경품은 재고로 돌아가 다음 회차에 다시 걸 수 있어요. 비워 두면 기한이 없어요.</InfoTip>
                <TimePicker id="round-claim" days={days} optional value={form.claim} suggest={`${form.cutoff ? form.cutoff.slice(0, 10) : defaultDay()}T18:00`} onChange={(v) => setForm((f) => ({ ...f, claim: v }))} />
              </div>
            </div>
            <div className="round-form-grid qty">
              {([1, 2, 3] as const).map((rank) => (
                <label key={rank} className="sub">{rank}등 · {data?.prizes[rank].name}<input className="input mono" inputMode="numeric" placeholder="0" value={form[`qty_rank${rank}`]} onChange={(e) => setForm({ ...form, [`qty_rank${rank}`]: digits(e.target.value) })} /></label>
              ))}
            </div>
            <div className="inline">
              <button className="btn sm" type="submit">{editing ? "저장" : "추가"}</button>
              <button className="btn ghost sm" type="button" onClick={closeForm}>취소</button>
            </div>
          </form>
        )}

        {err && <div className="alert">{err}</div>}
        {data?.rounds.length === 0 && <p className="sub">등록된 회차가 없어요.</p>}
        <div className="rounds">
          {data?.rounds.map((r) => {
            const pv = preview[r.id];
            const drawn = r.status === "drawn";
            return (
              <div key={r.id} className={`round ${drawn ? "drawn" : ""}`}>
                <div className="round-top">
                  <b>{r.name}</b>
                  <span className={`tag ${drawn ? "g" : "y"}`}>{drawn ? "추첨 완료" : "대기"}</span>
                </div>
                <div className="round-meta">
                  <span>마감 {fmtDateTime(r.cutoff_at)}</span>
                  <span>1등 {r.qty_rank1} · 2등 {r.qty_rank2} · 3등 {r.qty_rank3}</span>
                </div>
                <div className="round-n">
                  {drawn ? <>{r.eligible_count}명 대상</> : <>현재 {pv?.n ?? "…"}명</>}
                </div>
                {drawn ? (
                  <details className="round-more">
                    <summary>당첨번호 · 상세</summary>
                    <div className="sub">대상 #{r.eligible_from_seq}–#{r.eligible_to_seq} · {fmtDateTime(r.drawn_at)} · 실행 {r.drawn_by}{r.announce_at && ` · 발표 예정 ${fmtDateTime(r.announce_at)}`}{r.claim_until && ` · 수령 기한 ${fmtDateTime(r.claim_until)}`}</div>
                    {([1, 2, 3] as Rank[]).filter((rank) => r.winners.some((w) => w.rank === rank)).map((rank) => (
                      <div key={rank}>
                        <div className="rank-h">{rank}등 <small>{data!.prizes[rank].name}</small></div>
                        <div className={`winners r${rank}`}>
                          {r.winners.filter((w) => w.rank === rank).map((w) => <div key={w.seq} className="n">{String(w.seq).padStart(4, "0")}</div>)}
                        </div>
                      </div>
                    ))}
                  </details>
                ) : (
                  <div className="round-actions">
                    <button className="btn sm" onClick={() => draw(r)}>추첨 실행</button>
                    <button className="btn ghost sm" onClick={() => startEdit(r)}>수정</button>
                    <button className="btn ghost sm" onClick={() => remove(r)}>삭제</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <NoticeEditor />
      {drawing && (
        <DrawDialog name={drawing.r.name} cutoffAt={drawing.r.cutoff_at} drawAt={drawing.r.announce_at ?? drawing.r.cutoff_at} qty={[drawing.r.qty_rank1, drawing.r.qty_rank2, drawing.r.qty_rank3]}
          preview={drawing.pv} plannedMin={plannedClaimMin(drawing.r)} claimMin={drawing.claimMin} onClaimMin={(v) => setDrawing((d) => d && { ...d, claimMin: v })}
          show={drawing.show} onShow={(c) => setDrawing((d) => d && { ...d, show: c })} adUntil={drawing.adUntil} onDrawNow={drawNow} onCancelAd={cancelAd} busy={drawing.busy} error={drawing.err} onConfirm={confirmDraw} onClose={() => setDrawing(null)} />
      )}
    </>
  );
}
