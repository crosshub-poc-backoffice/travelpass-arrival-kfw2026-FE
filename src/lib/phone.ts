/**
 * 휴대폰번호는 E.164(+국가번호+번호, 숫자 최대 15자리)로 통일해 저장한다.
 * 같은 번호가 010-…, +82 10-…, 82 10… 로 다르게 들어와도 한 값이 되어 중복 검사가 걸린다.
 * 클라이언트(등록 폼)와 서버가 같이 쓰므로 서버 전용 import 금지.
 */

export interface DialCountry { iso: string; dial: string; label: string }

/** 등록 폼 국가 선택지. 출발지(origins.ts) 해외 목록과 맞춰 둔다. iso "XX" = 직접 입력(+국가번호 포함) */
export const DIAL_COUNTRIES: DialCountry[] = [
  { iso: "KR", dial: "82", label: "🇰🇷 +82 한국" },
  { iso: "JP", dial: "81", label: "🇯🇵 +81 Japan" },
  { iso: "CN", dial: "86", label: "🇨🇳 +86 China" },
  { iso: "HK", dial: "852", label: "🇭🇰 +852 Hong Kong" },
  { iso: "TW", dial: "886", label: "🇹🇼 +886 Taiwan" },
  { iso: "SG", dial: "65", label: "🇸🇬 +65 Singapore" },
  { iso: "VN", dial: "84", label: "🇻🇳 +84 Vietnam" },
  { iso: "TH", dial: "66", label: "🇹🇭 +66 Thailand" },
  { iso: "ID", dial: "62", label: "🇮🇩 +62 Indonesia" },
  { iso: "MY", dial: "60", label: "🇲🇾 +60 Malaysia" },
  { iso: "PH", dial: "63", label: "🇵🇭 +63 Philippines" },
  { iso: "IN", dial: "91", label: "🇮🇳 +91 India" },
  { iso: "AE", dial: "971", label: "🇦🇪 +971 UAE" },
  { iso: "GB", dial: "44", label: "🇬🇧 +44 UK" },
  { iso: "DE", dial: "49", label: "🇩🇪 +49 Germany" },
  { iso: "FR", dial: "33", label: "🇫🇷 +33 France" },
  { iso: "US", dial: "1", label: "🇺🇸 +1 USA / Canada" },
  { iso: "AU", dial: "61", label: "🇦🇺 +61 Australia" },
  { iso: "XX", dial: "", label: "🌐 Other (+국가번호 직접 입력)" },
];

const ORIGIN_ISO: Record<string, string> = {
  JAPAN: "JP", CHINA: "CN", "HONG KONG": "HK", TAIWAN: "TW", SINGAPORE: "SG", VIETNAM: "VN", THAILAND: "TH",
  INDONESIA: "ID", MALAYSIA: "MY", PHILIPPINES: "PH", INDIA: "IN", UAE: "AE", UK: "GB", GERMANY: "DE",
  FRANCE: "FR", USA: "US", CANADA: "US", AUSTRALIA: "AU", OVERSEAS: "XX",
};
/** 출발지를 고르면 국가번호 기본값을 맞춰 준다 (국내 출발지는 KR). 해외에서 왔어도 한국 번호면 직원/본인이 다시 고르면 됨 */
export function countryForOrigin(originCode: string) {
  return ORIGIN_ISO[originCode] ?? "KR";
}

const BY_ISO = new Map(DIAL_COUNTRIES.map((c) => [c.iso, c]));
/** 표시용 국가번호 매칭 (긴 것부터) */
const DIALS = DIAL_COUNTRIES.filter((c) => c.dial).map((c) => c.dial).sort((a, b) => b.length - a.length);

const KR_MOBILE = /^\+821[016789]\d{7,8}$/;

/** 닫힌 국가 선택칸 표기: 🇯🇵 +81 */
export function dialShort(iso: string) {
  const c = BY_ISO.get(iso);
  if (!c) return "+82";
  return c.dial ? `${c.label.split(" ")[0]} +${c.dial}` : "🌐 +";
}

/** 등록 폼 placeholder */
export function phonePlaceholder(iso: string) {
  if (iso === "KR") return "010-0000-0000";
  if (iso === "XX") return "+00 000 0000 0000";
  return "Mobile number";
}

/**
 * 입력칸에 치는 대로 형식을 잡아 준다 (숫자 외 문자는 버림).
 *   한국: 010-1234-5678 로 자동 하이픈, 11자리까지. "+82 10…"·"8210…"을 붙여 넣어도 010… 으로 바꿔 준다
 *   그 외 나라: 숫자만, 국가번호 포함 15자리(E.164)를 넘지 않게
 *   직접 입력(XX): 맨 앞 + 하나와 숫자 15자리
 */
export function formatPhoneInput(raw: string, iso: string) {
  let d = raw.replace(/\D/g, "");
  if (iso === "XX") return (raw.trim().startsWith("+") || d ? "+" : "") + d.slice(0, 15);
  const c = BY_ISO.get(iso) ?? BY_ISO.get("KR")!;
  if (iso !== "KR") {
    if (raw.trim().startsWith("+") && d.startsWith(c.dial)) d = d.slice(c.dial.length);
    return d.slice(0, 15 - c.dial.length);
  }
  if (d.startsWith("82") && d.length > 9) d = d.slice(2);
  if (d && !d.startsWith("0")) d = `0${d}`;
  d = d.slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
  // 011 등 10자리 번호는 3-3-4
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

export type PhoneResult = { ok: true; value: string } | { ok: false; error: string };

/**
 * raw 가 + 또는 00 으로 시작하면 그 자체를 국제번호로 본다 (선택한 국가 무시).
 * 아니면 선택 국가번호 + 국내번호(맨 앞 0 하나는 트렁크 프리픽스로 제거, 이탈리아 예외는 목록에 없음).
 */
export function normalizePhone(raw: string, iso = "KR"): PhoneResult {
  const s = (raw ?? "").trim();
  let digits = s.replace(/\D/g, "");
  let e164: string;
  if (s.startsWith("+") || digits.startsWith("00")) {
    if (digits.startsWith("00")) digits = digits.slice(2);
    // +82 010-…, +81 090-… 처럼 국가번호 뒤에 국내용 0 을 그대로 붙여 쓴 번호.
    // 목록에 있는 나라는 국가번호 뒤 번호가 0 으로 시작하는 일이 없어 떼도 안전하다.
    // 이탈리아(+39 0…)·코트디부아르(+225 0…)처럼 0 이 번호의 일부인 나라는 목록에 없으므로 건드리지 않는다.
    const dial = DIALS.find((x) => digits.startsWith(x));
    if (dial && digits[dial.length] === "0") digits = dial + digits.slice(dial.length + 1);
    e164 = `+${digits}`;
  } else {
    const c = BY_ISO.get(iso) ?? BY_ISO.get("KR")!;
    if (!c.dial) return { ok: false, error: "국가번호를 포함해 +로 시작하게 입력해 주세요. (예: +81 90 1234 5678)" };
    // 국가번호를 + 없이 붙여 쓴 경우 (82 10 1234 5678, 82-010-1234-5678)
    if (c.iso === "KR" && /^820?1[016789]\d{7,8}$/.test(digits)) digits = digits.slice(2);
    if (digits.startsWith("0")) digits = digits.slice(1);
    // 미국·캐나다는 국내에서도 1-415-555-2671 처럼 앞에 1 을 붙여 쓴다. 지역번호는 1 로 시작하지 않으므로 11자리 1… 은 그 1 이다
    if (c.dial === "1" && digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
    e164 = `+${c.dial}${digits}`;
  }
  const n = e164.length - 1;
  if (n < 8 || n > 15) return { ok: false, error: "휴대폰번호 형식을 확인해 주세요. Please check your phone number." };
  if (e164.startsWith("+82") && !KR_MOBILE.test(e164)) return { ok: false, error: "한국 휴대폰번호는 010-0000-0000 형식이에요." };
  return { ok: true, value: e164 };
}

function splitDial(e164: string) {
  const d = e164.replace(/^\+/, "");
  const dial = DIALS.find((x) => d.startsWith(x)) ?? "";
  return { dial, rest: d.slice(dial.length) };
}

/** 관리자 표시: 한국은 010-1234-5678, 해외는 +81 9012345678 */
export function formatPhone(e164: string) {
  if (!e164.startsWith("+")) return e164; // 구 데이터
  if (KR_MOBILE.test(e164)) {
    const n = `0${e164.slice(3)}`;
    return n.length === 11 ? `${n.slice(0, 3)}-${n.slice(3, 7)}-${n.slice(7)}` : `${n.slice(0, 3)}-${n.slice(3, 6)}-${n.slice(6)}`;
  }
  const { dial, rest } = splitDial(e164);
  return dial ? `+${dial} ${rest}` : e164;
}

/** 직원 화면: 뒷 4자리만. 해외 번호는 국가번호를 남겨 전화 걸 때 구분되게 */
export function maskPhone(e164: string) {
  const last4 = e164.slice(-4);
  if (KR_MOBILE.test(e164)) return `010-****-${last4}`;
  const { dial } = splitDial(e164);
  return dial ? `+${dial} ****${last4}` : `****${last4}`;
}
