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
  /** 모아보기 1등 자리에 띄울 문구. 1등을 0명으로 정한 회차에서 이유를 적어 둔다 */
  firstNote?: string;
  /** 추첨 없이 광고만 전광판에 트는 경우 (운영 콘솔 영상 탭). 광고가 끝나면 "곧 시작합니다" 없이 바로 내리고, 당첨 발표와 엮지 않는다 */
  adOnly?: boolean;
}

/** build = 지금 서버에 배포된 버전. 전광판이 자기 버전(BUILD)과 다르면 새로고침한다 */
/** fanfareAt = 운영 콘솔 영상 탭에서 "전광판 빵빠레"를 누른 시각 (서버 시계, ms). 전광판이 값이 바뀐 걸 보면 당첨 순간처럼 효과음·꽃가루를 낸다 */
export interface ShowState { show: DrawShow | null; now: number; build?: string; fanfareAt?: number | null }
/** 빵빠레 요청이 이보다 오래됐으면 전광판이 무시한다 (폴링 간격 3초 + 여유) */
export const FANFARE_FRESH_MS = 10 * 1000;
/** 이 화면(또는 서버 코드)이 빌드된 배포 버전. 로컬 개발에서는 빈 값 */
export const BUILD = process.env.NEXT_PUBLIC_BUILD ?? "";

export interface AdFile { url: string; name: string; video: boolean; size: number }
/**
 * mode: blob = Vercel Blob 에 올린다, local = 개발 서버의 public 폴더에 둔다, off = 올릴 저장소가 없다.
 * canUpload 가 false 여도 items(기본 광고 · 이미 올라와 있는 파일)는 고를 수 있다
 */
export interface AdList { mode: "blob" | "local" | "off"; canUpload: boolean; items: AdFile[] }

/** 앱에 같이 들어 있는 기본 광고 (public/ad). 저장소가 끊겨도 이 파일은 항상 고를 수 있다 */
export const BUILTIN_ADS: AdFile[] = [
  { url: "/ad/travelpass-ad-75s.mp4", name: "TravelPass 75초", video: true, size: 27593873 },
];

export const AD_SEC = { min: 5, max: 300, step: 5, initial: 15 };
/** 1등 자리 문구 최대 글자 수 */
export const FIRST_NOTE_MAX = 60;
export const SHOW_MIN = { min: 1, max: 30, initial: 5 };
/** 올릴 수 있는 광고 파일 크기 */
export const AD_MAX_BYTES = 200 * 1024 * 1024;

export const isVideoName = (name: string) => /\.(mp4|webm|mov|m4v)(\?|$)/i.test(name);
