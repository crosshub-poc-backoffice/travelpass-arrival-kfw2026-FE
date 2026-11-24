export type OriginGroup = "domestic" | "overseas" | "other";
export interface Origin {
  code: string; // 보드 표기 (영문 대문자, 최대 11자)
  label: string; // 선택지 표기
  group: OriginGroup;
}

export const FROM_WIDTH = 11;

export const ORIGINS: Origin[] = [
  { code: "SEOUL", label: "서울", group: "domestic" },
  { code: "BUSAN", label: "부산", group: "domestic" },
  { code: "DAEGU", label: "대구", group: "domestic" },
  { code: "INCHEON", label: "인천", group: "domestic" },
  { code: "GWANGJU", label: "광주", group: "domestic" },
  { code: "DAEJEON", label: "대전", group: "domestic" },
  { code: "ULSAN", label: "울산", group: "domestic" },
  { code: "SEJONG", label: "세종", group: "domestic" },
  { code: "GYEONGGI", label: "경기", group: "domestic" },
  { code: "GANGWON", label: "강원", group: "domestic" },
  { code: "CHUNGBUK", label: "충북", group: "domestic" },
  { code: "CHUNGNAM", label: "충남", group: "domestic" },
  { code: "JEONBUK", label: "전북", group: "domestic" },
  { code: "JEONNAM", label: "전남", group: "domestic" },
  { code: "GYEONGBUK", label: "경북", group: "domestic" },
  { code: "GYEONGNAM", label: "경남", group: "domestic" },
  { code: "JEJU", label: "제주", group: "domestic" },
  { code: "JAPAN", label: "Japan 일본", group: "overseas" },
  { code: "CHINA", label: "China 중국", group: "overseas" },
  { code: "HONG KONG", label: "Hong Kong 홍콩", group: "overseas" },
  { code: "TAIWAN", label: "Taiwan 대만", group: "overseas" },
  { code: "SINGAPORE", label: "Singapore 싱가포르", group: "overseas" },
  { code: "VIETNAM", label: "Vietnam 베트남", group: "overseas" },
  { code: "THAILAND", label: "Thailand 태국", group: "overseas" },
  { code: "INDONESIA", label: "Indonesia 인도네시아", group: "overseas" },
  { code: "MALAYSIA", label: "Malaysia 말레이시아", group: "overseas" },
  { code: "PHILIPPINES", label: "Philippines 필리핀", group: "overseas" },
  { code: "INDIA", label: "India 인도", group: "overseas" },
  { code: "UAE", label: "UAE 아랍에미리트", group: "overseas" },
  { code: "UK", label: "United Kingdom 영국", group: "overseas" },
  { code: "GERMANY", label: "Germany 독일", group: "overseas" },
  { code: "FRANCE", label: "France 프랑스", group: "overseas" },
  { code: "USA", label: "USA 미국", group: "overseas" },
  { code: "CANADA", label: "Canada 캐나다", group: "overseas" },
  { code: "AUSTRALIA", label: "Australia 호주", group: "overseas" },
  { code: "OVERSEAS", label: "Other 기타 해외", group: "overseas" },
];

export const ORIGIN_MAP = new Map(ORIGINS.map((o) => [o.code, o]));
/** 선택지에 없으면 이 값으로 보내고 originText 에 직접 입력값을 담는다 */
export const ORIGIN_OTHER = "OTHER";
export const DOMESTIC = ORIGINS.filter((o) => o.group === "domestic");
export const OVERSEAS = ORIGINS.filter((o) => o.group === "overseas");

/** 방문객 화면 다국어 출발지 이름 [en, zh, ja]. ko 는 label 을 쓴다 */
const NAMES: Record<string, [string, string, string]> = {
  SEOUL: ["Seoul", "首尔", "ソウル"],
  BUSAN: ["Busan", "釜山", "釜山"],
  DAEGU: ["Daegu", "大邱", "大邱"],
  INCHEON: ["Incheon", "仁川", "仁川"],
  GWANGJU: ["Gwangju", "光州", "光州"],
  DAEJEON: ["Daejeon", "大田", "大田"],
  ULSAN: ["Ulsan", "蔚山", "蔚山"],
  SEJONG: ["Sejong", "世宗", "世宗"],
  GYEONGGI: ["Gyeonggi", "京畿道", "京畿道"],
  GANGWON: ["Gangwon", "江原道", "江原道"],
  CHUNGBUK: ["Chungbuk", "忠清北道", "忠清北道"],
  CHUNGNAM: ["Chungnam", "忠清南道", "忠清南道"],
  JEONBUK: ["Jeonbuk", "全罗北道", "全羅北道"],
  JEONNAM: ["Jeonnam", "全罗南道", "全羅南道"],
  GYEONGBUK: ["Gyeongbuk", "庆尚北道", "慶尚北道"],
  GYEONGNAM: ["Gyeongnam", "庆尚南道", "慶尚南道"],
  JEJU: ["Jeju", "济州", "済州"],
  JAPAN: ["Japan", "日本", "日本"],
  CHINA: ["China", "中国", "中国"],
  "HONG KONG": ["Hong Kong", "香港", "香港"],
  TAIWAN: ["Taiwan", "台湾", "台湾"],
  SINGAPORE: ["Singapore", "新加坡", "シンガポール"],
  VIETNAM: ["Vietnam", "越南", "ベトナム"],
  THAILAND: ["Thailand", "泰国", "タイ"],
  INDONESIA: ["Indonesia", "印度尼西亚", "インドネシア"],
  MALAYSIA: ["Malaysia", "马来西亚", "マレーシア"],
  PHILIPPINES: ["Philippines", "菲律宾", "フィリピン"],
  INDIA: ["India", "印度", "インド"],
  UAE: ["UAE", "阿联酋", "アラブ首長国連邦"],
  UK: ["United Kingdom", "英国", "イギリス"],
  GERMANY: ["Germany", "德国", "ドイツ"],
  FRANCE: ["France", "法国", "フランス"],
  USA: ["USA", "美国", "アメリカ"],
  CANADA: ["Canada", "加拿大", "カナダ"],
  AUSTRALIA: ["Australia", "澳大利亚", "オーストラリア"],
  OVERSEAS: ["Other overseas", "其他海外", "その他海外"],
};

export function originName(code: string, lang: "ko" | "en" | "zh" | "ja") {
  const o = ORIGIN_MAP.get(code);
  if (!o) return code; // 직접 입력값은 그대로
  if (lang === "ko") return o.label;
  const n = NAMES[code];
  return n ? n[{ en: 0, zh: 1, ja: 2 }[lang]] : o.label;
}
