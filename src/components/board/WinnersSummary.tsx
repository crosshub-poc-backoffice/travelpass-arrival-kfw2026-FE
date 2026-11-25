"use client";

import { useEffect, useState } from "react";
import QrCode from "@/components/register/QrCode";
import { cells, emojiSrc, originFlag } from "@/lib/glyphs";
import type { BoardPin } from "@/lib/api-types";
import s from "./summary.module.css";

type WinnersPin = Extract<BoardPin, { kind: "winners" }>;
type Winner = WinnersPin["winners"][number];

/** 2·3등 목록의 열 수 */
const LIST_COLS = 4;
/** 목록이 쓸 수 있는 높이(--u 단위)와 한 줄의 최대 높이. 인원이 늘면 줄이 낮아지며 한 화면에 들어온다 */
const LIST_SPACE = 33.2;
const ROW_MAX = 3.4;
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
  const rows = Math.ceil(second.length / LIST_COLS) + Math.ceil(third.length / LIST_COLS);
  const rh = Math.min(ROW_MAX, LIST_SPACE / Math.max(1, rows));

  return (
    <div className={`${s.wrap} ${spinning ? s.spinning : ""}`} style={{ ["--rh" as string]: `calc(${rh.toFixed(3)} * var(--u))` }}>
      <div className={s.hero}>
        <div className={s.firsts}>
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
