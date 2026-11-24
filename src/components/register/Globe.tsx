"use client";

import { useEffect, useRef } from "react";
import { LAND_B64, LAND_H, LAND_W } from "@/lib/landmask";

export interface GlobePin { id: string; lat: number; lon: number; label: string }

interface Props {
  pins: GlobePin[];
  selected: string | null;
  /** 선택한 핀으로 크게 확대 (한국 → 시도 선택) */
  zoom?: boolean;
  onPick: (id: string) => void;
  className?: string;
}

const D2R = Math.PI / 180;
const IDLE_VIEW = { lon: 118, lat: 20 };
const ROW_STEP = 1.5; // 도트 위도 간격(°)

interface Dot { sinLat: number; cosLat: number; lon: number }
let DOTS: Dot[] | null = null;

/** 위도 줄마다 cos(위도)에 비례한 개수로 찍어 도트 간격을 고르게 한다 */
function landDots(): Dot[] {
  if (DOTS) return DOTS;
  const bin = atob(LAND_B64);
  const isLand = (lat: number, lon: number) => {
    const r = Math.min(LAND_H - 1, Math.max(0, Math.floor((90 - lat) / (180 / LAND_H))));
    const c = ((Math.floor((lon + 180) / (360 / LAND_W)) % LAND_W) + LAND_W) % LAND_W;
    const i = r * LAND_W + c;
    return (bin.charCodeAt(i >> 3) & (1 << (i & 7))) !== 0;
  };
  const out: Dot[] = [];
  for (let lat = -58; lat <= 84; lat += ROW_STEP) {
    const n = Math.max(1, Math.round((360 / ROW_STEP) * Math.cos(lat * D2R)));
    for (let k = 0; k < n; k++) {
      const lon = -180 + ((k + 0.5) * 360) / n;
      if (isLand(lat, lon)) out.push({ sinLat: Math.sin(lat * D2R), cosLat: Math.cos(lat * D2R), lon: lon * D2R });
    }
  }
  DOTS = out;
  return out;
}

function shortest(deg: number) { return ((((deg + 180) % 360) + 360) % 360) - 180; }

/**
 * 도트 지구본 (캔버스 2D, 정사영). 외부 지도·라이브러리 없이 내장 육지 마스크만 쓴다.
 * 좌우 드래그로 회전, 핀 탭으로 선택. 세로 스와이프는 페이지 스크롤에 양보한다(touch-action: pan-y).
 */
export default function Globe({ pins, selected, zoom, onPick, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef({ pins, selected, zoom: !!zoom, onPick });
  live.current = { pins, selected, zoom: !!zoom, onPick };
  /** 선택이 바뀌면 그 핀을 향해 다시 회전 (드래그로 풀린 추적을 되살림) */
  const follow = useRef(true);
  useEffect(() => { follow.current = true; }, [selected, zoom]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dots = landDots();
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const view = { lon: IDLE_VIEW.lon - 40, lat: IDLE_VIEW.lat, scale: 0.9 };
    let w = 0, h = 0, baseR = 0, cy = 0, dpr = 1;
    let screenPins: { id: string; x: number; y: number }[] = [];
    let drag: { x: number; y: number; moved: boolean } | null = null;
    let raf = 0, last = 0;

    const project = (sinLat: number, cosLat: number, lon: number, sin0: number, cos0: number, lon0: number) => {
      const dl = lon - lon0, cdl = Math.cos(dl);
      return {
        x: cosLat * Math.sin(dl),
        y: cos0 * sinLat - sin0 * cosLat * cdl,
        z: sin0 * sinLat + cos0 * cosLat * cdl,
      };
    };

    const render = (t: number) => {
      const dt = Math.min(64, t - (last || t)); last = t;
      const { pins: ps, selected: selId, zoom: zoomed } = live.current;
      const sel = selId ? ps.find((p) => p.id === selId) : undefined;

      // 시점 보간
      const k = reduced ? 1 : 1 - Math.exp(-dt / 190);
      if (sel && follow.current && !drag) {
        view.lon += shortest(sel.lon - view.lon) * k;
        view.lat += (sel.lat - view.lat) * k;
      } else if (!sel && !drag) {
        if (!reduced) view.lon += dt * 0.007;
        view.lat += (IDLE_VIEW.lat - view.lat) * k;
      }
      view.scale += ((sel ? (zoomed ? 2.3 : 1.22) : 1) - view.scale) * k;

      const R = baseR * view.scale, cx = w / 2;
      const lon0 = view.lon * D2R, sin0 = Math.sin(view.lat * D2R), cos0 = Math.cos(view.lat * D2R);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // 대기 글로우
      const glow = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.2);
      glow.addColorStop(0, "rgba(90,169,255,0.34)");
      glow.addColorStop(0.35, "rgba(90,169,255,0.12)");
      glow.addColorStop(1, "rgba(90,169,255,0)");
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(cx, cy, R * 1.2, 0, 7); ctx.fill();

      // 구
      const body = ctx.createRadialGradient(cx, cy - R * 0.55, R * 0.1, cx, cy, R);
      body.addColorStop(0, "#27508f");
      body.addColorStop(0.55, "#16305c");
      body.addColorStop(1, "#0c1730");
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
      ctx.strokeStyle = "rgba(150,200,255,0.55)"; ctx.lineWidth = 1;
      ctx.stroke();

      // 육지 도트: 깊이(z)별 4단계로 묶어 한 번에 채운다
      const dotR = Math.max(0.7, R * 0.0082);
      const buckets: number[][] = [[], [], [], []];
      for (let i = 0; i < dots.length; i++) {
        const d = dots[i];
        const p = project(d.sinLat, d.cosLat, d.lon, sin0, cos0, lon0);
        if (p.z <= 0.03) continue;
        const sx = cx + R * p.x, sy = cy - R * p.y;
        if (sx < -4 || sx > w + 4 || sy < -4 || sy > h + 4) continue;
        buckets[Math.min(3, (p.z * 4) | 0)].push(sx, sy);
      }
      for (let b = 0; b < 4; b++) {
        const arr = buckets[b];
        ctx.fillStyle = `rgba(178,208,255,${0.2 + b * 0.2})`;
        const r = dotR * (0.72 + b * 0.1);
        ctx.beginPath();
        for (let i = 0; i < arr.length; i += 2) { ctx.moveTo(arr[i] + r, arr[i + 1]); ctx.arc(arr[i], arr[i + 1], r, 0, 7); }
        ctx.fill();
      }

      // 핀
      screenPins = [];
      const pulse = reduced ? 0.5 : (t % 1800) / 1800;
      let selXY: { x: number; y: number; label: string } | null = null;
      for (const p of ps) {
        const lat = p.lat * D2R;
        const q = project(Math.sin(lat), Math.cos(lat), p.lon * D2R, sin0, cos0, lon0);
        if (q.z <= 0.12) continue;
        const x = cx + R * q.x, y = cy - R * q.y;
        screenPins.push({ id: p.id, x, y });
        const isSel = p.id === selId;
        if (isSel) { selXY = { x, y, label: p.label }; continue; }
        const a = (selId ? 0.45 : 1) * Math.min(1, q.z * 2);
        ctx.fillStyle = `rgba(245,196,0,${0.16 * a})`;
        ctx.beginPath(); ctx.arc(x, y, 8, 0, 7); ctx.fill();
        ctx.fillStyle = `rgba(245,196,0,${a})`;
        ctx.beginPath(); ctx.arc(x, y, 3.4, 0, 7); ctx.fill();
      }
      if (selXY) {
        const { x, y, label } = selXY;
        ctx.strokeStyle = `rgba(245,196,0,${1 - pulse})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, 7 + pulse * 20, 0, 7); ctx.stroke();
        ctx.fillStyle = "rgba(245,196,0,0.25)";
        ctx.beginPath(); ctx.arc(x, y, 12, 0, 7); ctx.fill();
        ctx.fillStyle = "#f5c400";
        ctx.beginPath(); ctx.arc(x, y, 5.5, 0, 7); ctx.fill();
        // 이름표
        ctx.font = '700 13px -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", Roboto, sans-serif';
        const tw = ctx.measureText(label).width, bw = tw + 22, bh = 28;
        const bx = Math.min(w - bw - 8, Math.max(8, x - bw / 2)), by = Math.max(6, y - 22 - bh);
        ctx.fillStyle = "#f5c400";
        ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 14); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x - 6, by + bh - 1); ctx.lineTo(x + 6, by + bh - 1); ctx.lineTo(x, by + bh + 7); ctx.fill();
        ctx.fillStyle = "#111"; ctx.textBaseline = "middle"; ctx.textAlign = "left";
        ctx.fillText(label, bx + 11, by + bh / 2 + 1);
      }
    };
    const loop = (t: number) => { render(t); raf = requestAnimationFrame(loop); };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width; h = rect.height;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      baseR = Math.min(w * 0.43, h * 0.54);
      cy = baseR + 30;
      // 크기를 바꾸면 캔버스가 비워진다. 다음 프레임을 기다리지 않고 바로 다시 그려야 검게 깜빡이지 않는다
      if (last) render(last);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    raf = requestAnimationFrame(loop);

    const pos = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const down = (e: PointerEvent) => { drag = { ...pos(e), moved: false }; canvas.setPointerCapture?.(e.pointerId); };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      const p = pos(e), dx = p.x - drag.x;
      if (!drag.moved && Math.abs(dx) < 5) return;
      drag.moved = true; follow.current = false;
      view.lon -= (dx / (baseR * view.scale)) / D2R;
      drag.x = p.x; drag.y = p.y;
    };
    const up = (e: PointerEvent) => {
      const d = drag; drag = null;
      if (!d || d.moved) return;
      const p = pos(e);
      let best: { id: string; dist: number } | null = null;
      for (const s of screenPins) {
        const dist = Math.hypot(s.x - p.x, s.y - p.y);
        if (dist < 30 && (!best || dist < best.dist)) best = { id: s.id, dist };
      }
      if (best) live.current.onPick(best.id);
    };
    const cancel = () => { drag = null; };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", cancel);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", cancel);
    };
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
