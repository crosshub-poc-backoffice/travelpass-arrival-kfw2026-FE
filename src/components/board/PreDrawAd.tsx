"use client";

import s from "./ad.module.css";

interface Props {
  /** 광고 파일 주소. 비어 있으면 자리만 표시한다 (?test 용) */
  src: string;
  /** 영상이면 true, 이미지면 false */
  video: boolean;
  /** 광고가 끝나기까지 남은 시간(ms). 0 이하면 정해 둔 시간이 다 돼 광고를 내리고 추첨을 기다리는 중 */
  left: number;
}

/**
 * 추첨 직전 광고 화면. 사람들이 추첨 시각에 맞춰 전광판 앞에 모여 기다리는 동안 광고를 화면 가득 틀고,
 * 구석에 추첨까지 남은 시간을 띄운다. 이미지는 정해 둔 시간만큼 보여 주고, 영상은 그 시간이 되면 끝까지 안 갔어도 자른다.
 * 시간이 다 되면 광고를 내리고, 추첨 결과가 오는 대로 바로 이름을 돌린다.
 */
export default function PreDrawAd({ src, video, left }: Props) {
  const sec = Math.max(0, Math.ceil(left / 1000));
  const mmss = `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;

  if (sec === 0) {
    return (
      <div className={s.wrap}>
        <div className={s.hold}><b>LUCKY DRAW</b><span>곧 시작합니다</span></div>
      </div>
    );
  }
  return (
    <div className={s.wrap}>
      {!src ? (
        <div className={s.empty}><b>광고 자리</b><span>16:9 영상 또는 이미지</span></div>
      ) : video ? (
        <video className={s.media} src={src} autoPlay muted loop playsInline />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={s.media} src={src} alt="" />
      )}
      <div className={s.badge}>
        <span className={s.badgeLabel}>LUCKY DRAW · 추첨까지</span>
        <span className={s.badgeTime}>{mmss}</span>
      </div>
    </div>
  );
}
