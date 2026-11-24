/**
 * 보드 한 칸 = 화면에 보이는 글자 하나(그래핌). 이모지·국기는 여러 코드포인트라
 * 문자열 길이·slice 로 자르면 깨지므로 칸 단위로 다룰 때는 여기를 거친다.
 */
const seg = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter("en", { granularity: "grapheme" }) : null;

export function cells(s: string): string[] {
  if (!s) return [];
  return seg ? Array.from(seg.segment(s), (x) => x.segment) : Array.from(s);
}

/** 이름에 넣을 수 있는 이모지 개수 (이름이 묻히지 않게) */
export const NAME_EMOJI_MAX = 3;

/**
 * 이름에 넣을 수 있는 이모지. 이 목록 밖은 받지 않는다(허용 목록이라 욕설·깨지는 이모지 걱정 없음).
 * 팔레트·미리보기·전광판 모두 같은 그림(public/emoji, Microsoft Fluent 3D, MIT)으로 그려서 고른 모양 그대로 TV 에 뜬다.
 */
export const EMOJI_PALETTE = [
  "✈️", "🧳", "🌏", "🗺️", "🏝️", "🗼", "🚀", "📸",
  "😎", "😀", "🥳", "🤩", "😍", "🤗", "😜", "🙌",
  "❤️", "💛", "💙", "💜", "✨", "⭐", "🔥", "🌈",
  "🐱", "🐶", "🐻", "🐼", "🦄", "🌸", "🍀", "💳",
];

/** 표시 선택자(FE0F)를 뗀 형태로 비교 (키보드마다 붙이기도 안 붙이기도 해서) */
const bare = (g: string) => g.replace(/\uFE0F/g, "");
const PALETTE_MAP = new Map(EMOJI_PALETTE.map((e) => [bare(e), e]));

/** 팔레트에 있는 이모지면 팔레트 표기(선택자 포함)로, 아니면 null */
export function paletteEmoji(g: string): string | null {
  return PALETTE_MAP.get(bare(g)) ?? null;
}

/** Fluent 3D 그림 경로 (/emoji/<코드포인트>.png). 국기는 같은 폴더의 구글 Noto 그림. 그림이 없는 글자는 null */
export function emojiSrc(g: string): string | null {
  const b = bare(g);
  if (!IMAGE_EMOJI.has(b)) return null;
  return `/emoji/${Array.from(b, (c) => c.codePointAt(0)!.toString(16)).join("-")}.png`;
}

/** 그림을 미리 받아 둔다. 첫 플립에서 빈 칸으로 깜빡이지 않게 (브라우저에서 한 번만) */
let preloaded = false;
export function preloadEmoji() {
  if (preloaded || typeof Image === "undefined") return;
  preloaded = true;
  for (const e of IMAGE_EMOJI) { const img = new Image(); img.src = emojiSrc(e)!; }
}

/** 출발지 코드 → 국기. 국내는 태극기, 선택지에 없는 직접 입력·기타 해외는 지구본 */
const FLAG: Record<string, string> = {
  JAPAN: "JP", CHINA: "CN", "HONG KONG": "HK", TAIWAN: "TW", SINGAPORE: "SG", VIETNAM: "VN",
  THAILAND: "TH", INDONESIA: "ID", MALAYSIA: "MY", PHILIPPINES: "PH", INDIA: "IN", UAE: "AE",
  UK: "GB", GERMANY: "DE", FRANCE: "FR", USA: "US", CANADA: "CA", AUSTRALIA: "AU",
};
const DOMESTIC_CODES = new Set([
  "SEOUL", "BUSAN", "DAEGU", "INCHEON", "GWANGJU", "DAEJEON", "ULSAN", "SEJONG", "GYEONGGI",
  "GANGWON", "CHUNGBUK", "CHUNGNAM", "JEONBUK", "JEONNAM", "GYEONGBUK", "GYEONGNAM", "JEJU",
]);

function isoFlag(iso: string) {
  return String.fromCodePoint(...Array.from(iso, (c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export function originFlag(code: string) {
  if (DOMESTIC_CODES.has(code)) return isoFlag("KR");
  const iso = FLAG[code];
  return iso ? isoFlag(iso) : "🌐";
}

/**
 * 그림으로 그리는 이모지: 팔레트 + 전광판 고정 기호(🏆 1등, 🌐 직접 입력 출발지, 🧳 다음 추첨) + 국기.
 * 국기는 Fluent 에 없어 구글 Noto 그림(public/emoji, OFL)을 쓴다. 웹폰트로 받으면 아이폰 Safari 가 그리지 못해 빈 칸이 된다.
 */
const IMAGE_EMOJI = new Set([
  ...[...EMOJI_PALETTE, "🏆", "🌐", "🧳"].map(bare),
  ...[...Object.values(FLAG), "KR"].map(isoFlag),
]);

