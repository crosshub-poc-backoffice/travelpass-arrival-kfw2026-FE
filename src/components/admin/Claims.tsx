"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import Inventory from "./Inventory";
import Scanner from "./Scanner";
import { fmtDateTime, PRIZE_LABEL, type PrizeType, type Rank } from "@/lib/config";
import { formatPhone } from "@/lib/validation";

interface Data {
  participant: { id: number; seq: number; display_name: string; origin_code: string; phone: string; email: string; hidden: boolean; created_at: string };
  raffle: { drawn: boolean; round_name: string | null; rank: Rank | null; prize: string | null; claim_until: string | null; expired: boolean } | null;
  claims: { prize_type: PrizeType; claimed_at: string; claimed_by: string; note: string | null }[];
  logs: { id: number; actor: string; device_id: string | null; action: string; detail: { prize_type?: string; note?: string | null; reason?: string | null } | null; created_at: string }[];
  /** 참가자 폰의 수령 QR 을 스캔해 조회됨 */
  viaQr?: boolean;
}

/** 카메라 스캐너를 켜 둔 직원은 다음에 들어와도 바로 켜지게 기억한다 */
const SCAN_PREF = "tp_admin_scanner";
/** 스캔한 글자에서 수령 토큰을 꺼낸다: 참가자 QR 은 /admin?qr=토큰 주소다 */
function tokenFrom(text: string) {
  try { const q = new URL(text).searchParams.get("qr"); if (q) return q; } catch {}
  return /^\d+\.\d+\.[\w-]+$/.test(text) ? text : null;
}

export default function Claims({ scan }: { scan?: string | null }) {
  const [seq, setSeq] = useState("");
  const [real, setData] = useState<Data | null>(null);
  /** 개발용 화면 미리보기: 있으면 서버 데이터 대신 이걸 보여주고, 지급·되돌리기도 화면 안에서만 바뀐다 */
  const [preview, setPreview] = useState<Data | null>(null);
  const data = preview ?? real;
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  // 처리 결과 안내는 화면 아래 토스트로 잠깐 띄우고 사라진다
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 2400); return () => clearTimeout(t); }, [msg]);
  const [tick, setTick] = useState(0);
  const [previewKey, setPreviewKey] = useState("");

  /** keepNotice: 처리 직후 다시 조회할 때는 방금 띄운 완료/오류 안내를 지우지 않는다 */
  async function load(s = seq, keepNotice = false) {
    if (!keepNotice) { setErr(null); setMsg(null); }
    try {
      const d = await api<Data>(`/api/admin/claims?seq=${encodeURIComponent(s)}`);
      // 처리 후 다시 조회해도 같은 사람이면 QR 확인 상태를 유지한다
      setData((prev) => ({ ...d, viaQr: prev?.viaQr && prev.participant.id === d.participant.id }));
    }
    catch (e) { setData(null); setErr((e as Error).message); }
  }

  const loadQr = useCallback((token: string) => {
    setMsg(null);
    api<Data>(`/api/admin/claims?qr=${encodeURIComponent(token)}`)
      .then((d) => { setData(d); setSeq(String(d.participant.seq)); setErr(null); })
      .catch((e) => { setData(null); setErr((e as Error).message); });
  }, []);

  // 기본 카메라로 QR 을 찍어 들어온 경우(/admin?qr=): 번호 입력 없이 바로 그 참가자를 연다
  useEffect(() => { if (scan) loadQr(scan); }, [scan, loadQr]);

  // 콘솔 안의 카메라 스캐너가 기본. QR 이 보이는 즉시 그 참가자가 열린다. 직원이 끈 경우만 꺼진 채로 기억한다
  const [camera, setCamera] = useState(true);
  useEffect(() => { try { setCamera(localStorage.getItem(SCAN_PREF) !== "0"); } catch {} }, []);
  const toggleCamera = () => setCamera((on) => { try { localStorage.setItem(SCAN_PREF, on ? "0" : "1"); } catch {} return !on; });
  /** 번호 직접 입력은 QR 이 안 될 때만 쓰는 보조 수단이라 접어 둔다 */
  const [manual, setManual] = useState(false);
  /** 처리한 참가자를 닫고 다음 사람 스캔으로 돌아간다 */
  const next = () => { setPreview(null); setPreviewKey(""); setData(null); setErr(null); setMsg(null); setSeq(""); };
  // 지금 열려 있는 참가자의 QR 을 계속 비추고 있어도 다시 불러오지 않는다 (방금 띄운 완료 안내가 지워지지 않게)
  const openSeq = useRef<number | null>(null);
  openSeq.current = data?.viaQr ? data.participant.seq : null;
  const onScan = useCallback((text: string) => {
    const token = tokenFrom(text);
    if (token && parseInt(token, 10) === openSeq.current) return;
    if (token) loadQr(token);
    else { setData(null); setErr("수령 QR 이 아니에요. 참가자 탑승권의 QR 을 비춰 주세요."); }
  }, [loadQr]);

  async function doClaim(type: PrizeType) {
    if (!data) return;
    if (preview) {
      setPreview({ ...preview, claims: [...preview.claims, { prize_type: type, claimed_at: new Date().toISOString(), claimed_by: "미리보기", note: null }] });
      setMsg(`${PRIZE_LABEL[type]} 지급 처리했어요.`);
      return;
    }
    setErr(null); setMsg(null);
    try {
      await api("/api/admin/claims", { method: "POST", body: JSON.stringify({ participantId: data.participant.id, prizeType: type }) });
      setMsg(`${PRIZE_LABEL[type]} 지급 처리했어요.`);
      setTick((n) => n + 1);
      load(String(data.participant.seq), true);
    } catch (e) {
      const ex = (e as { data?: { existing?: { claimed_at: string; claimed_by: string } } }).data?.existing;
      setErr(ex ? `이미 수령했어요 · ${fmtDateTime(ex.claimed_at)} · 처리 ${ex.claimed_by}` : (e as Error).message);
      load(String(data.participant.seq), true);
    }
  }

  async function doUnclaim(type: PrizeType) {
    if (!data) return;
    if (preview) {
      setPreview({ ...preview, claims: preview.claims.filter((c) => c.prize_type !== type) });
      setMsg(`${PRIZE_LABEL[type]} 지급을 되돌렸어요.`);
      return;
    }
    try {
      await api("/api/admin/claims", { method: "DELETE", body: JSON.stringify({ participantId: data.participant.id, prizeType: type, note: "되돌리기" }) });
      setMsg(`${PRIZE_LABEL[type]} 지급을 되돌렸어요.`);
      setTick((n) => n + 1);
      load(String(data.participant.seq), true);
    } catch (e) { setErr((e as Error).message); }
  }

  const p = data?.participant;
  const rankType = data?.raffle?.rank ? (`rank${data.raffle.rank}` as PrizeType) : null;
  const rankClaim = rankType ? data?.claims.find((c) => c.prize_type === rankType) : undefined;

  return (
    <>
      <div className="card claim-scan">
        <div className="claim-head">
          <h2 className="sec">경품 수령 처리</h2>
          {data
            ? <button className="btn sm" type="button" onClick={next}>다음 사람 스캔</button>
            : <button className="btn ghost sm" type="button" onClick={toggleCamera} aria-pressed={camera}>{camera ? "카메라 끄기" : "카메라 켜기"}</button>}
        </div>
        {!data && (camera
          ? <><Scanner onScan={onScan} /><p className="sub" style={{ marginTop: 8 }}>참가자 탑승권의 수령 QR 을 노란 틀 안에 비춰 주세요.</p></>
          : <button className="btn claim-start" type="button" onClick={toggleCamera}>QR 스캔 시작</button>)}
        {!data && (manual ? (
          <form className="toolbar claim-manual" onSubmit={(e) => { e.preventDefault(); load(); }}>
            <input className="input mono" inputMode="numeric" placeholder="참여번호" value={seq} onChange={(e) => setSeq(e.target.value.replace(/\D/g, ""))} autoFocus />
            <button className="btn sm" type="submit" disabled={!seq}>조회</button>
          </form>
        ) : (
          <button className="linkish" type="button" onClick={() => setManual(true)}>QR 이 안 되나요? 참여번호로 조회</button>
        ))}
      </div>

      {err && <div className="card" style={{ maxWidth: "none" }}><div className="alert" style={{ marginBottom: 0 }}>{err}</div></div>}

      {data && p && (
        <>
          <div className="card" style={{ maxWidth: "none" }}>
            <div className="grid2">
              <div className="kv">
                <span className="k">참여번호</span><span className="mono" style={{ fontSize: 24, fontWeight: 700 }}>{String(p.seq).padStart(4, "0")}</span>
                <span className="k">표시명</span><span className="mono" style={{ fontWeight: 700 }}>{p.display_name}</span>
                <span className="k">출발지</span><span>{p.origin_code}</span>
                <span className="k">등록</span><span>{fmtDateTime(p.created_at)}</span>
                <span className="k">휴대폰</span><span className="mono">{formatPhone(p.phone)}</span>
                <span className="k">이메일</span><span>{p.email}</span>
              </div>
              <div>
                <div className="k sub">추첨 상태</div>
                <div style={{ marginTop: 6 }}>
                  {!data.raffle?.drawn && <span className="status-pill wait">추첨 대기</span>}
                  {data.raffle?.drawn && data.raffle.rank && !data.raffle.expired && <span className="status-pill">{data.raffle.rank}등 당첨 · {data.raffle.prize}</span>}
                  {data.raffle?.expired && <span className="status-pill none">{data.raffle.rank}등 당첨 · 수령 기한 지나 취소</span>}
                  {data.raffle?.drawn && data.raffle.rank && !data.raffle.expired && data.raffle.claim_until && !rankClaim && <div className="sub" style={{ marginTop: 4 }}>수령 기한 {fmtDateTime(data.raffle.claim_until)}</div>}
                  {data.raffle?.drawn && !data.raffle.rank && <span className="status-pill none">{data.raffle.round_name} 미당첨</span>}
                </div>
              </div>
            </div>
          </div>

          {/* 미당첨은 위 추첨 상태에 이미 나와 있고 드릴 것이 없어 이 칸을 두지 않는다 */}
          {(!data.raffle?.drawn || rankType) && <div className="card" style={{ maxWidth: "none" }}>
            {!data.raffle?.drawn && <p className="sub">경품은 추첨 발표 뒤에 드려요.</p>}
            {rankType && data.raffle?.expired && (
              <div className="block">
                <b>{PRIZE_LABEL[rankType]}</b>
                <div className="sub">수령 기한({fmtDateTime(data.raffle.claim_until)})이 지나 당첨이 자동 취소됐어요. 경품은 재고로 돌아갔어요.</div>
              </div>
            )}
            {rankType && !data.raffle?.expired && <ClaimRow key={`${p.id}-${rankType}`} label={PRIZE_LABEL[rankType]} sub={`${data.raffle!.round_name} 당첨`} claim={rankClaim} onClaim={() => doClaim(rankType)} onUnclaim={() => doUnclaim(rankType)} />}
          </div>}

          {data.logs.length > 0 && (
            <div className="card" style={{ maxWidth: "none" }}>
              <h2 className="sec">처리 이력</h2>
              <div className="tbl-wrap"><table className="tbl"><tbody>
                {data.logs.map((l) => (
                  <tr key={l.id}><td className="mono">{fmtDateTime(l.created_at)}</td><td>{l.actor}{l.device_id && <span className="sub mono" title="접속 기기"> · {l.device_id.slice(0, 4)}</span>}</td><td>{l.action}{l.detail?.prize_type && ` · ${PRIZE_LABEL[l.detail.prize_type as PrizeType]}`}</td><td className="sub">{l.detail?.note ?? l.detail?.reason ?? ""}</td></tr>
                ))}
              </tbody></table></div>
            </div>
          )}
        </>
      )}

      <Inventory refreshKey={tick} />

      {msg && (
        <div className="toast" role="status" aria-live="polite" key={msg + tick}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5 10 17 19 7.5" /></svg>
          {msg}
        </div>
      )}

      {process.env.NODE_ENV === "development" && (
        <div className="card" style={{ maxWidth: "none" }}>
          <div className="sub" style={{ marginBottom: 10 }}>화면 미리보기 (개발용 · 서버에 저장 안 됨)</div>
          <div className="day-chips">
            {PREVIEWS.map(([k, l]) => (
              <button key={k} type="button" className={previewKey === k ? "on" : ""} onClick={() => { setErr(null); setMsg(null); setPreviewKey(k); setPreview(k ? makePreview(k) : null); }}>{l}</button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

const PREVIEWS: [string, string][] = [["", "끄기"], ["wait", "추첨 대기"], ["lose", "미당첨"], ["rank1", "1등"], ["rank2", "2등"], ["rank3", "3등"], ["expired", "기한 지남"]];

/** 개발용: 상태별 가짜 참가자 */
function makePreview(k: string): Data {
  const now = Date.now();
  const rank = (k === "rank1" ? 1 : k === "rank2" || k === "expired" ? 2 : k === "rank3" ? 3 : null) as Rank | null;
  return {
    participant: { id: -1, seq: 123, display_name: "PREVIEW", origin_code: "SEOUL", phone: "+821012345678", email: "preview@example.com", hidden: false, created_at: new Date(now - 3_600_000).toISOString() },
    raffle: k === "wait"
      ? { drawn: false, round_name: null, rank: null, prize: null, claim_until: null, expired: false }
      : {
          drawn: true, round_name: "오전 회차", rank,
          prize: rank ? PRIZE_LABEL[`rank${rank}` as PrizeType].split(" · ")[1] : null,
          claim_until: rank ? new Date(now + (k === "expired" ? -600_000 : 7_200_000)).toISOString() : null,
          expired: k === "expired",
        },
    claims: [],
    logs: [],
  };
}

function ClaimRow({ label, sub, claim, onClaim, onUnclaim }: {
  label: string; sub: string;
  claim?: { claimed_at: string; claimed_by: string };
  onClaim: () => void; onUnclaim: () => void;
}) {
  return (
    <div className="block">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div><b>{label}</b><div className="sub">{claim ? `${fmtDateTime(claim.claimed_at)} · ${claim.claimed_by}` : sub}</div></div>
        {claim ? (
          <div className="claim-split">
            <span className="claim-done" role="status">지급 완료</span>
            <button className="claim-undo" type="button" onClick={onUnclaim} aria-label="되돌리기" title="되돌리기">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
              </svg>
            </button>
          </div>
        ) : (
          <button className="btn sm claim-btn" onClick={onClaim}>지급 완료 처리</button>
        )}
      </div>
    </div>
  );
}
