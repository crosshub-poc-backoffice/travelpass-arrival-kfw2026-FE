"use client";

import { useEffect, useState } from "react";
import { api } from "./api";
import { DOMESTIC, OVERSEAS, ORIGIN_OTHER } from "@/lib/origins";

/**
 * 장애 대응 도구 (관리자): 등록 일시 중단 스위치 + 종이 등록 입력.
 * DB·네트워크 장애로 현장 등록이 안 될 때: 등록 중단 → 종이 양식으로 받기 → 복구 후 여기서 입력.
 */
export default function Operations({ onRegistered }: { onRegistered: () => void }) {
  const [open, setOpen] = useState<boolean | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({ displayName: "", origin: "", originText: "", phone: "", email: "", consentMarketing: false, paperConsent: false });
  const [requestId, setRequestId] = useState(() => newId());

  useEffect(() => {
    api<{ registrationOpen: boolean }>("/api/admin/settings").then((d) => setOpen(d.registrationOpen)).catch(() => setOpen(null));
  }, []);

  async function toggle() {
    if (open === null) return;
    const next = !open;
    if (!next && !confirm("QR 등록을 일시 중단할까요? 방문객 화면에 '등록을 잠시 멈췄어요'가 표시됩니다.")) return;
    try {
      const d = await api<{ registrationOpen: boolean }>("/api/admin/settings", { method: "PUT", body: JSON.stringify({ registrationOpen: next }) });
      setOpen(d.registrationOpen);
    } catch (e) { setErr((e as Error).message); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setMsg(null);
    try {
      const d = await api<{ participant: { seq: number }; replayed: boolean }>("/api/admin/participants", {
        method: "POST",
        body: JSON.stringify({ ...f, originText: f.origin === ORIGIN_OTHER ? f.originText : null, requestId }),
      });
      setMsg(`${d.replayed ? "이미 입력된 건이에요" : "등록했어요"} · 참여번호 ${d.participant.seq}`);
      setF({ displayName: "", origin: "", originText: "", phone: "", email: "", consentMarketing: false, paperConsent: false });
      setRequestId(newId());
      onRegistered();
    } catch (e) { setErr((e as Error).message); }
  }

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const v = e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value;
    setF((x) => ({ ...x, [k]: v }));
    if (k !== "consentMarketing" && k !== "paperConsent") setRequestId(newId());
  };

  return (
    <div className="card" style={{ maxWidth: "none" }}>
      <div className="toolbar" style={{ marginBottom: 0 }}>
        <b>QR 등록</b>
        {open === null ? <span className="sub">확인 중…</span> : <span className={`tag ${open ? "g" : ""}`}>{open ? "받는 중" : "일시 중단"}</span>}
        <button className={`btn sm ${open ? "danger" : ""}`} onClick={toggle} disabled={open === null}>{open ? "등록 중단" : "등록 재개"}</button>
        <button className="btn ghost sm" onClick={() => setShowForm((v) => !v)} style={{ marginLeft: "auto" }}>{showForm ? "닫기" : "종이 등록 입력"}</button>
      </div>
      {err && <div className="alert" style={{ marginTop: 10 }}>{err}</div>}
      {msg && <div className="notice ok" style={{ marginTop: 10 }}>{msg}</div>}
      {showForm && (
        <form onSubmit={submit} style={{ marginTop: 12, display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <input className="input" placeholder="표시명 (영문)" value={f.displayName} onChange={set("displayName")} required />
          <select className="select" value={f.origin} onChange={set("origin")} required>
            <option value="">출발지</option>
            <optgroup label="국내">{DOMESTIC.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</optgroup>
            <optgroup label="해외">{OVERSEAS.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</optgroup>
            <option value={ORIGIN_OTHER}>직접 입력</option>
          </select>
          {f.origin === ORIGIN_OTHER && <input className="input" placeholder="출발지 (영문)" value={f.originText} onChange={set("originText")} required />}
          <input className="input" placeholder="휴대폰 (해외는 +국가번호)" value={f.phone} onChange={set("phone")} required />
          <input className="input" placeholder="이메일" value={f.email} onChange={set("email")} required />
          <label className="sub" style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={f.consentMarketing} onChange={set("consentMarketing")} /> 마케팅 동의</label>
          <label className="sub" style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={f.paperConsent} onChange={set("paperConsent")} required /> 종이 양식 필수 동의 확인</label>
          <button className="btn sm" type="submit">입력</button>
        </form>
      )}
      {showForm && <p className="sub" style={{ marginTop: 8 }}>입력 시각 기준으로 번호가 발급되고, 아직 추첨하지 않은 회차 대상이 돼요.</p>}
    </div>
  );
}

function newId() {
  try { return crypto.randomUUID(); } catch { return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`; }
}
