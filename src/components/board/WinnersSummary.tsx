"use client";

import { useEffect, useState } from "react";
import QrCode from "@/components/register/QrCode";
import { cells, emojiSrc, originFlag } from "@/lib/glyphs";
import type { BoardPin } from "@/lib/api-types";
import s from "./summary.module.css";

type WinnersPin = Extract<BoardPin, { kind: "winners" }>;
type Winner = WinnersPin["winners"][number];

/**
 * 2·3등 목록 배치 (단위는 모두 --u = 프레임 너비의 1/100).
 * 3열과 4열 가운데 글자가 더 크게 나오는 쪽을 고른다. 글자 크기는 두 가지에 묶인다:
 * ① 줄 수가 목록 높이(LIST_SPACE)에 다 들어갈 것 ② 가장 긴 이름(12칸)이 한 칸 안에서 잘리지 않을 것.
 */
const LIST_SPACE = 33.2;
const LIST_WIDTH = 94;
const COL_GAP = 2.6;
/** 출발지 칸 너비: 적어도 이만큼은 주고(ORIGIN_W), 칸이 넉넉하면 가장 긴 출발지(11자)가 다 보이는 너비(ORIGIN_MAX)까지 넓힌다 */
const ORIGIN_W = 6.4;
const ORIGIN_MAX = 9;
/** 한 칸 너비 = ORIGIN_W + 글자 크기 × 이 값 (국기 + 간격 + 12칸 이름) 이면 이름이 잘리지 않는다 */
const NAME_EM = 9.8;
/** 줄 높이 대비 글자 크기 */
const FONT_PER_ROW = 0.62;
function layout(n2: number, n3: number) {
  const pick = (cols: number) => {
    const rows = Math.max(1, Math.ceil(n2 / cols) + Math.ceil(n3 / cols));
    const colW = (LIST_WIDTH - COL_GAP * (cols - 1)) / cols;
    const font = Math.min((FONT_PER_ROW * LIST_SPACE) / rows, (colW - ORIGIN_W) / NAME_EM);
    return { cols, font, originW: Math.min(ORIGIN_MAX, colW - NAME_EM * font) };
  };
  const a = pick(3), b = pick(4);
  return a.font >= b.font ? a : b;
}
/** 뜸 들이는 동안 이름을 바꿔 끼우는 간격 */
const SHUFFLE_MS = 110;

/** 이모지·국기는 전광판과 같은 그림으로 그린다 (기기마다 모양이 달라지지 않게) */
function Glyphs({ text }: { text: string }) {
  return (
    <>
      {cells(text).map((g, i) => {
        const src = emojiSrc(g);
        return src ? <span key={i} className={s.emo} style={{ backgroundImage: `url("${src}")` }} /> : g;
      })}
    </>
  );
}

function Entry({ w }: { w: Winner }) {
  return (
    <div className={s.entry}>
      <span className={s.flag}><Glyphs text={originFlag(w.origin_code)} /></span>
      <span className={s.origin}>{w.origin_code}</span>
      <span className={s.name}><Glyphs text={w.display_name.toUpperCase()} /></span>
    </div>
  );
}

interface Props {
  pin: WinnersPin;
  /** 뜸 들이는 중. 모든 자리에 당첨자 이름을 섞어 돌리다가, 끝나면 제자리에 멈춘다 */
  spinning: boolean;
  /** 이름이 한 번 바뀔 때마다 (플랩 소리) */
  onTick?: () => void;
}

/**
 * 당첨자 모아보기. 1·2·3등을 페이지 넘김 없이 한 화면에 모으고, 폰으로 결과를 확인하라는 안내와 QR 을 같이 둔다.
 * 전광판에서 자기 이름(출발지 · 이름)을 찾고 → QR 을 찍는 흐름. 제목·시계 없이 당첨자부터 보여 준다.
 */
export default function WinnersSummary({ pin, spinning, onTick }: Props) {
  const [url, setUrl] = useState("");
  useEffect(() => { setUrl(window.location.origin); }, []);

  /** 뜸 들이는 동안 자리마다 보여 줄 당첨자 (자리 번호 → 목록 번호). null 이면 제자리 */
  const [mix, setMix] = useState<number[] | null>(null);
  const n = pin.winners.length;
  useEffect(() => {
    if (!spinning || !n) { setMix(null); return; }
    const shuffle = () => { setMix(Array.from({ length: n }, () => Math.floor(Math.random() * n))); onTick?.(); };
    shuffle();
    const t = setInterval(shuffle, SHUFFLE_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinning, n]);

  /** 등수별 자리. 뜸 들이는 중에는 등수와 상관없이 섞인 이름이 들어간다 */
  const slots = pin.winners.map((w, i) => ({ rank: w.rank, w: mix ? pin.winners[mix[i]] ?? w : w }));
  const byRank = (rank: number) => slots.filter((x) => x.rank === rank).map((x) => x.w);
  const first = byRank(1), second = byRank(2), third = byRank(3);
  const { cols, font, originW } = layout(second.length, third.length);
  const rh = font / FONT_PER_ROW;

  return (
    <div className={`${s.wrap} ${spinning ? s.spinning : ""}`} style={{ ["--rh" as string]: `calc(${rh.toFixed(3)} * var(--u))`, ["--cols" as string]: cols, ["--ow" as string]: `calc(${originW.toFixed(3)} * var(--u))` }}>
      <div className={s.hero}>
        <div className={s.firsts}>
          {/* 1등을 0명으로 정한 회차도 1등 자리는 남기고, 직원이 적은 문구(이유 등)를 이름 자리에 띄운다 */}
          {first.length === 0 && (
            <div className={s.first}>
              <div className={s.firstLabel}><Glyphs text="🏆" /> 1ST PRIZE</div>
              {pin.firstNote ? <div className={s.firstNote}>{pin.firstNote}</div> : null}
            </div>
          )}
          {first.map((w, i) => (
            <div key={i} className={s.first}>
              <div className={s.firstLabel}><Glyphs text="🏆" /> 1ST PRIZE</div>
              <div className={s.firstName}><Glyphs text={w.display_name.toUpperCase()} /></div>
              <div className={s.firstSub}><Glyphs text={originFlag(w.origin_code)} /> {w.origin_code}</div>
            </div>
          ))}
        </div>
        <div className={s.guide}>
          <div className={s.guideText}>
            <strong>QR코드를 다시 스캔해야<br />경품을 받을 수 있어요</strong>
            <span>Scan the QR again to claim your prize</span>
          </div>
          {url ? <QrCode value={url} label="결과 확인 QR" size="calc(9.6 * var(--u))" /> : null}
        </div>
      </div>

      {[{ label: "2ND PRIZE", list: second }, { label: "3RD PRIZE", list: third }].map((g) => g.list.length > 0 && (
        <section key={g.label} className={s.group}>
          <div className={s.groupHead}>
            <span className={s.groupLabel}>{g.label}</span>
            <span className={s.groupCount}>{g.list.length}</span>
          </div>
          <div className={s.list}>
            {g.list.map((w, i) => <Entry key={i} w={w} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
