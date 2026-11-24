import type { Lang } from "./i18n";
import { originName } from "./origins";

/**
 * 등록 화면 지구본·선택 칩 표시용. 코드는 origins.ts(서버 검증 기준)와 반드시 일치해야 한다.
 * KOREA 는 출발지 코드가 아니라 "한국 → 시도 선택"으로 들어가는 관문이다.
 */
export interface Place { code: string; flag: string; lat: number; lon: number; ko: string; en: string }

export const KOREA: Place = { code: "KOREA", flag: "🇰🇷", lat: 36.3, lon: 127.8, ko: "대한민국", en: "Korea" };

export const COUNTRIES: Place[] = [
  { code: "JAPAN", flag: "🇯🇵", lat: 36.5, lon: 138.5, ko: "일본", en: "Japan" },
  { code: "CHINA", flag: "🇨🇳", lat: 34.5, lon: 105, ko: "중국", en: "China" },
  { code: "HONG KONG", flag: "🇭🇰", lat: 22.3, lon: 114.2, ko: "홍콩", en: "Hong Kong" },
  { code: "TAIWAN", flag: "🇹🇼", lat: 23.7, lon: 121, ko: "대만", en: "Taiwan" },
  { code: "SINGAPORE", flag: "🇸🇬", lat: 1.35, lon: 103.8, ko: "싱가포르", en: "Singapore" },
  { code: "VIETNAM", flag: "🇻🇳", lat: 16, lon: 107.5, ko: "베트남", en: "Vietnam" },
  { code: "THAILAND", flag: "🇹🇭", lat: 15.5, lon: 101, ko: "태국", en: "Thailand" },
  { code: "INDONESIA", flag: "🇮🇩", lat: -2, lon: 114, ko: "인도네시아", en: "Indonesia" },
  { code: "MALAYSIA", flag: "🇲🇾", lat: 4.5, lon: 102, ko: "말레이시아", en: "Malaysia" },
  { code: "PHILIPPINES", flag: "🇵🇭", lat: 13, lon: 122, ko: "필리핀", en: "Philippines" },
  { code: "INDIA", flag: "🇮🇳", lat: 21, lon: 78, ko: "인도", en: "India" },
  { code: "UAE", flag: "🇦🇪", lat: 24, lon: 54, ko: "아랍에미리트", en: "UAE" },
  { code: "UK", flag: "🇬🇧", lat: 54, lon: -2, ko: "영국", en: "UK" },
  { code: "GERMANY", flag: "🇩🇪", lat: 51, lon: 10, ko: "독일", en: "Germany" },
  { code: "FRANCE", flag: "🇫🇷", lat: 46.5, lon: 2.5, ko: "프랑스", en: "France" },
  { code: "USA", flag: "🇺🇸", lat: 39, lon: -98, ko: "미국", en: "USA" },
  { code: "CANADA", flag: "🇨🇦", lat: 57, lon: -105, ko: "캐나다", en: "Canada" },
  { code: "AUSTRALIA", flag: "🇦🇺", lat: -25, lon: 134, ko: "호주", en: "Australia" },
];

/** 목록에 없는 나라. 지구본 핀 없음 */
export const OTHER = { code: "OVERSEAS", flag: "🌐", ko: "기타 해외", en: "Other" };

export const REGIONS: { code: string; ko: string; en: string }[] = [
  { code: "SEOUL", ko: "서울", en: "Seoul" },
  { code: "GYEONGGI", ko: "경기", en: "Gyeonggi" },
  { code: "INCHEON", ko: "인천", en: "Incheon" },
  { code: "BUSAN", ko: "부산", en: "Busan" },
  { code: "DAEGU", ko: "대구", en: "Daegu" },
  { code: "DAEJEON", ko: "대전", en: "Daejeon" },
  { code: "GWANGJU", ko: "광주", en: "Gwangju" },
  { code: "ULSAN", ko: "울산", en: "Ulsan" },
  { code: "SEJONG", ko: "세종", en: "Sejong" },
  { code: "GANGWON", ko: "강원", en: "Gangwon" },
  { code: "CHUNGBUK", ko: "충북", en: "Chungbuk" },
  { code: "CHUNGNAM", ko: "충남", en: "Chungnam" },
  { code: "JEONBUK", ko: "전북", en: "Jeonbuk" },
  { code: "JEONNAM", ko: "전남", en: "Jeonnam" },
  { code: "GYEONGBUK", ko: "경북", en: "Gyeongbuk" },
  { code: "GYEONGNAM", ko: "경남", en: "Gyeongnam" },
  { code: "JEJU", ko: "제주", en: "Jeju" },
];

const REGION_CODES = new Set(REGIONS.map((r) => r.code));
const NAMES = new Map<string, { ko: string; en: string; flag: string }>([
  ...REGIONS.map((r) => [r.code, { ko: r.ko, en: r.en, flag: KOREA.flag }] as const),
  ...COUNTRIES.map((c) => [c.code, { ko: c.ko, en: c.en, flag: c.flag }] as const),
  [OTHER.code, OTHER],
]);

export function isRegion(code: string) { return REGION_CODES.has(code); }
/** 칩·핀 이름. 한국어·영어는 여기 것, 중국어·일본어는 origins.ts 의 번역을 쓴다. 직접 입력한 출발지는 그대로 */
export function placeName(code: string, lang: Lang) {
  const n = NAMES.get(code);
  if (!n) return code;
  return lang === "ko" || lang === "en" ? n[lang] : originName(code, lang);
}
export function placeFlag(code: string) { return NAMES.get(code)?.flag ?? "🌐"; }
