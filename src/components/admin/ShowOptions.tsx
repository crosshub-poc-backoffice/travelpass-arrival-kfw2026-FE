"use client";

import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { api } from "./api";
import { AD_MAX_BYTES, AD_SEC, SHOW_MIN, type AdFile, type AdList } from "@/lib/show";

/** 추첨 실행 창에서 고르는 전광판 연출. 마지막에 쓴 값을 이 브라우저에 기억해 다음 회차의 기본값으로 쓴다 */
export interface ShowChoice {
  /** 고른 광고 파일. null = 광고 없이 바로 추첨 */
  ad: AdFile | null;
  adSec: number;
  view: "summary" | "pages";
  showMin: number;
}

const STORE = "tp_draw_show";
export function loadChoice(): ShowChoice {
  const base: ShowChoice = { ad: null, adSec: AD_SEC.initial, view: "summary", showMin: SHOW_MIN.initial };
  try { return { ...base, ...(JSON.parse(localStorage.getItem(STORE) ?? "{}") as Partial<ShowChoice>) }; } catch { return base; }
}
export function saveChoice(c: ShowChoice) {
  try { localStorage.setItem(STORE, JSON.stringify(c)); } catch {}
}

function Stepper({ value, unit, min, max, step, disabled, onChange }: { value: number; unit: string; min: number; max: number; step: number; disabled: boolean; onChange: (v: number) => void }) {
  return (
    <div className="draw-dlg-step">
      <button type="button" aria-label={`${step}${unit} 줄이기`} disabled={disabled || value - step < min} onClick={() => onChange(value - step)}>−</button>
      <span>{value}{unit}</span>
      <button type="button" aria-label={`${step}${unit} 늘리기`} disabled={disabled || value + step > max} onClick={() => onChange(value + step)}>+</button>
    </div>
  );
}

export default function ShowOptions({ value, disabled, onChange }: { value: ShowChoice; disabled: boolean; onChange: (c: ShowChoice) => void }) {
  const [ads, setAds] = useState<AdList | null>(null);
  const [upPct, setUpPct] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<AdList>("/board/ads").then(setAds).catch((e) => { setAds({ mode: "off", items: [] }); setErr((e as Error).message); });
  }, []);
  // 기억해 둔 광고가 지워졌으면 "없음"으로
  useEffect(() => {
    if (ads && value.ad && !ads.items.some((f) => f.url === value.ad!.url)) onChange({ ...value, ad: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ads]);

  async function pick(file: File) {
    if (!ads) return;
    setErr(null);
    if (!/^(image|video)\//.test(file.type)) { setErr("이미지나 영상 파일만 올릴 수 있어요."); return; }
    if (file.size > AD_MAX_BYTES) { setErr(`파일이 너무 커요. ${Math.round(AD_MAX_BYTES / 1024 / 1024)}MB 까지 올릴 수 있어요.`); return; }
    setUpPct(0);
    try {
      let added: AdFile;
      if (ads.mode === "blob") {
        const b = await upload(`ads/${file.name}`, file, { access: "public", handleUploadUrl: "/board/ads", multipart: file.size > 20 * 1024 * 1024, onUploadProgress: (p) => setUpPct(Math.round(p.percentage)) });
        added = { url: b.url, name: b.pathname.replace(/^ads\//, ""), video: file.type.startsWith("video/"), size: file.size };
      } else {
        const r = await fetch(`/board/ads?name=${encodeURIComponent(file.name)}`, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
        added = d as AdFile;
      }
      setAds({ ...ads, items: [added, ...ads.items.filter((f) => f.url !== added.url)] });
      onChange({ ...value, ad: added });
    } catch (e) {
      setErr(`올리지 못했어요. ${(e as Error).message}`);
    } finally {
      setUpPct(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const busy = disabled || upPct !== null;
  const canUpload = ads !== null && ads.mode !== "off";

  return (
    <div className="draw-show">
      <div className="draw-show-row">
        <div className="draw-dlg-claim-k">추첨 전 광고</div>
        <div className="draw-show-line">
          <select className="select" value={value.ad?.url ?? ""} disabled={busy || !ads}
            onChange={(e) => onChange({ ...value, ad: ads?.items.find((f) => f.url === e.target.value) ?? null })}>
            <option value="">{ads ? "없음 · 바로 추첨" : "불러오는 중…"}</option>
            {ads?.items.map((f) => <option key={f.url} value={f.url}>{f.video ? "영상" : "사진"} · {f.name}</option>)}
          </select>
          {canUpload && (
            <button className="btn ghost sm" type="button" disabled={busy} onClick={() => fileRef.current?.click()}>{upPct !== null ? `올리는 중 ${upPct}%` : "파일 올리기"}</button>
          )}
          <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); }} />
        </div>
        {value.ad && (
          <div className="draw-show-line">
            <Stepper value={value.adSec} unit="초" min={AD_SEC.min} max={AD_SEC.max} step={AD_SEC.step} disabled={busy} onChange={(adSec) => onChange({ ...value, adSec })} />
            <span className="draw-show-hint">{value.ad.video ? "영상이 더 길어도 이 시간에 끊고 추첨해요" : "이 시간만큼 보여 준 뒤 추첨해요"}</span>
          </div>
        )}
        {ads?.mode === "off" && <p className="draw-show-hint">광고 저장소(Vercel Blob)가 연결되지 않아 파일을 올릴 수 없어요.</p>}
        {err && <p className="draw-dlg-note err" role="alert" style={{ marginTop: 8 }}>{err}</p>}
      </div>

      <div className="draw-show-row">
        <div className="draw-dlg-claim-k">당첨자 화면</div>
        <div className="draw-show-line">
          <div className="draw-show-seg" role="radiogroup" aria-label="당첨자 화면 방식">
            {([["summary", "한 화면에 모아보기"], ["pages", "9명씩 넘기기"]] as const).map(([v, label]) => (
              <button key={v} type="button" role="radio" aria-checked={value.view === v} className={value.view === v ? "on" : ""} disabled={busy} onClick={() => onChange({ ...value, view: v })}>{label}</button>
            ))}
          </div>
        </div>
        <div className="draw-show-line">
          <Stepper value={value.showMin} unit="분" min={SHOW_MIN.min} max={SHOW_MIN.max} step={1} disabled={busy} onChange={(showMin) => onChange({ ...value, showMin })} />
          <span className="draw-show-hint">동안 전광판에 띄워요</span>
        </div>
      </div>
    </div>
  );
}
