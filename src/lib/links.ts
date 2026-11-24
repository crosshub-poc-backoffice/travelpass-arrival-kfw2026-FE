/**
 * TravelPass·크로스허브 외부 링크. 실제 주소는 환경변수로 (없으면 그 버튼은 숨김).
 * 버튼은 이 주소로 바로 가지 않고 /go/[target] 을 거쳐 클릭이 기록된다.
 */
export const LINK_TARGETS = {
  "tp-web": process.env.NEXT_PUBLIC_TP_WEB_URL ?? "",
  "app-ios": process.env.NEXT_PUBLIC_TP_APP_IOS_URL ?? "",
  "app-android": process.env.NEXT_PUBLIC_TP_APP_ANDROID_URL ?? "",
  crosshub: process.env.NEXT_PUBLIC_CROSSHUB_URL ?? "",
} as const;
export type LinkTarget = keyof typeof LINK_TARGETS;

export function isLinkTarget(v: string): v is LinkTarget {
  return Object.prototype.hasOwnProperty.call(LINK_TARGETS, v);
}

/** 이동할 주소에 UTM 을 붙인다 (TP 쪽 분석 도구에서 부스 유입으로 잡히게) */
export function withUtm(url: string) {
  const u = new URL(url);
  if (!u.searchParams.has("utm_source")) u.searchParams.set("utm_source", "kfw2026");
  if (!u.searchParams.has("utm_medium")) u.searchParams.set("utm_medium", "booth");
  return u.toString();
}

export function goHref(target: LinkTarget) {
  return `/go/${target}`;
}
