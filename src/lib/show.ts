/**
 * 추첨 연출 설정: 추첨을 실행할 때 직원이 고른 광고 · 당첨자 화면 방식 · 표시 시간.
 * 백엔드와 DB 는 쓰지 않는다. 직원 화면이 /board/sync 에 적고 전광판이 읽는다 (시연 모드 /king/sync 와 같은 저장소).
 */
export interface ShowAd {
  /** 광고 파일 주소 */
  src: string;
  /** 영상이면 true, 이미지면 false */
  video: boolean;
  /** 보여 줄 시간(초). 영상도 이 시간이 되면 자른다 */
  sec: number;
}

export interface DrawShow {
  /** 직원이 추첨 실행을 누른 시각 (서버 시계, ms). 광고는 이때부터 ad.sec 초 동안 나오고, 끝나면 실제 추첨이 실행된다 */
  startAt: number;
  ad: ShowAd | null;
  /** 당첨자 화면 방식: summary = 한 화면에 모아보기, pages = 9명씩 넘기기 */
  view: "summary" | "pages";
  /** 당첨자 화면을 띄워 두는 시간(초) */
  showSec: number;
}

export interface ShowState { show: DrawShow | null; now: number }

export interface AdFile { url: string; name: string; video: boolean; size: number }
/** blob = Vercel Blob 에 올린다, local = 개발 서버의 public 폴더에 둔다, off = 저장소가 연결되지 않았다 */
export interface AdList { mode: "blob" | "local" | "off"; items: AdFile[] }

export const AD_SEC = { min: 5, max: 300, step: 5, initial: 15 };
export const SHOW_MIN = { min: 1, max: 30, initial: 5 };
/** 올릴 수 있는 광고 파일 크기 */
export const AD_MAX_BYTES = 200 * 1024 * 1024;

export const isVideoName = (name: string) => /\.(mp4|webm|mov|m4v)(\?|$)/i.test(name);
