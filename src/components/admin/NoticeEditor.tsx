"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { fmtDateTime } from "@/lib/config";

interface Notice { text: string; at: string }
const MAX = 300;

/**
 * 방문객 공지. 올리면 참가자 완료 화면에 약 15초 안에 뜬다.
 * 처음 보는 공지는 팝업으로, 그 뒤로는 '당첨번호 발표 보기' 아래에 늘 보인다. 고쳐 올리면 새 공지로 보고 다시 팝업.
 */
export default function NoticeEditor() {
  const [notice, setNotice] = useState<Notice | null | undefined>(undefined);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** 올리기·고치기·내리기 결과 토스트. n 은 같은 문구가 연달아 떠도 애니메이션을 다시 돌리려고 */
  const [toast, setToast] = useState<{ msg: string; n: number } | null>(null);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2400); return () => clearTimeout(t); }, [toast]);

  useEffect(() => {
    api<{ notice: Notice | null }>("/api/admin/notice").then((d) => { setNotice(d.notice); setText(d.notice?.text ?? ""); }).catch((e) => setErr((e as Error).message));
  }, []);

  async function save(next: string) {
    setBusy(true); setErr(null);
    try {
      const d = await api<{ notice: Notice | null }>("/api/admin/notice", { method: "PUT", body: JSON.stringify({ text: next }) });
      const msg = !d.notice ? "공지를 내렸어요." : notice ? "공지를 고쳐 올렸어요." : "공지를 올렸어요.";
      setNotice(d.notice); setText(d.notice?.text ?? "");
      setToast((t) => ({ msg, n: (t?.n ?? 0) + 1 }));
      setConfirmClear(false);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  const trimmed = text.trim();
  const changed = trimmed !== (notice?.text ?? "");

  return (
    <div className="card">
      <div className="claim-head">
        <h2 className="sec">방문객 공지</h2>
        {notice && <span className="tag g">게시 중 · {fmtDateTime(notice.at)}</span>}
      </div>
      <textarea className="input" rows={3} maxLength={MAX} value={text} disabled={notice === undefined}
        placeholder="예: 마스크팩이 모두 소진됐어요. 참여해 주셔서 감사합니다." onChange={(e) => setText(e.target.value)} style={{ resize: "vertical", minHeight: 80 }} />
      <div className="inline" style={{ marginTop: 10, width: "100%" }}>
        <button className="btn sm" type="button" disabled={busy || !trimmed || !changed} onClick={() => save(text)}>{notice ? "고쳐 올리기" : "올리기"}</button>
        {notice && <button className="btn ghost sm" type="button" disabled={busy} onClick={() => { setErr(null); setConfirmClear(true); }}>내리기</button>}
        <span className="sub mono" style={{ marginLeft: "auto" }}>{text.length}/{MAX}</span>
      </div>
      {err && <div className="alert" style={{ marginTop: 10 }}>{err}</div>}
      {confirmClear && notice && (
        <ClearDialog text={notice.text} busy={busy} error={err} onConfirm={() => save("")} onClose={() => setConfirmClear(false)} />
      )}
      {toast && (
        <div className="toast" role="status" aria-live="polite" key={toast.n}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5 10 17 19 7.5" /></svg>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

/** 공지 내리기 확인. 추첨 실행 창과 같은 틀(네이티브 <dialog> 라 Esc·포커스 가두기는 브라우저가) */
function ClearDialog({ text, busy, error, onConfirm, onClose }: { text: string; busy: boolean; error: string | null; onConfirm: () => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    if (!d.open) d.showModal();
    return () => d.close();
  }, []);
  const close = () => { if (!busy) onClose(); };
  return (
    <dialog ref={ref} className="draw-dlg" aria-labelledby="notice-dlg-title"
      onCancel={(e) => { e.preventDefault(); close(); }}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="draw-dlg-body">
        <h2 id="notice-dlg-title">공지를 내릴까요?</h2>
        <p className="draw-dlg-note" style={{ whiteSpace: "pre-wrap" }}>{text}</p>
        {error && <p className="draw-dlg-note err" role="alert">{error}</p>}
      </div>
      <div className="draw-dlg-foot">
        <span className="draw-dlg-final">참가자 화면에서 바로 사라져요</span>
        <div className="draw-dlg-btns">
          <button className="btn ghost sm" type="button" onClick={close} disabled={busy}>취소</button>
          <button className="btn sm danger" type="button" onClick={onConfirm} disabled={busy} autoFocus>{busy ? "내리는 중…" : "내리기"}</button>
        </div>
      </div>
    </dialog>
  );
}
