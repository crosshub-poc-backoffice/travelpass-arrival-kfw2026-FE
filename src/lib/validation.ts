import { NAME_MAX, NAME_MIN } from "./config";
import { FROM_WIDTH, ORIGIN_MAP, ORIGIN_OTHER, type Origin } from "./origins";
import { normalizePhone } from "./phone";
import { NAME_EMOJI_MAX, cells, paletteEmoji } from "./glyphs";

/** 보드 플립 문자셋과 동일하게 유지 (flipEngine.ts CHARSET) */
export const NAME_ALLOWED = /[^A-Z0-9 .\-]/g;
const NAME_CHAR = /^[A-Z0-9 .\-]$/;

const BLOCKLIST = [
  "FUCK", "SHIT", "BITCH", "ASSHOLE", "CUNT", "DICK", "PUSSY", "NIGG", "FAG", "WHORE", "SLUT",
  "SEX", "PORN", "RAPE", "NAZI", "HITLER", "KILL", "SIBAL", "SSIBAL", "SIBA", "BYUNGSIN", "JOTT", "GAESAEKKI",
];

/** 출발지 직접 입력용: 영문·숫자만 */
export function normalizeText(raw: string) {
  return raw.toUpperCase().replace(NAME_ALLOWED, "").replace(/\s+/g, " ").trim();
}

/**
 * 입력 중 필터: 영문 대문자·숫자·공백·.- 와 팔레트 이모지(최대 NAME_EMOJI_MAX 개)만 남기고 NAME_MAX 칸에서 자른다.
 * 끝 공백은 남겨 둔다(타이핑 중이라). 길이는 화면 칸(그래핌) 기준.
 */
export function filterName(raw: string) {
  const out: string[] = [];
  let emoji = 0;
  for (const g of cells((raw ?? "").toUpperCase())) {
    if (out.length >= NAME_MAX) break;
    if (NAME_CHAR.test(g)) {
      if (g === " " && (out.length === 0 || out[out.length - 1] === " ")) continue;
      out.push(g);
    } else if (/\s/.test(g)) {
      if (out.length && out[out.length - 1] !== " ") out.push(" ");
    } else {
      // 이모지는 팔레트(EMOJI_PALETTE)에 있는 것만
      const e = paletteEmoji(g);
      if (e && emoji < NAME_EMOJI_MAX) { out.push(e); emoji++; }
    }
  }
  return out.join("");
}

export function normalizeName(raw: string) {
  return filterName(raw).trim();
}

/** 표시명 칸 수 (이모지 하나 = 1칸) */
export function nameLength(v: string) {
  return cells(v).length;
}

export type Invalid = { ok: false; error: string; code: string };

function hasBlockedWord(v: string) {
  const compact = v.replace(/[^A-Z]/g, "");
  return BLOCKLIST.some((w) => compact.includes(w));
}

export function validateName(raw: string): { ok: true; value: string } | Invalid {
  const v = normalizeName(raw ?? "");
  const len = nameLength(v);
  if (len < NAME_MIN) return { ok: false, code: "NAME_TOO_SHORT", error: `표시명은 ${NAME_MIN}칸 이상이어야 해요.` };
  if (len > NAME_MAX) return { ok: false, code: "NAME_TOO_LONG", error: `표시명은 최대 ${NAME_MAX}자까지 가능해요.` };
  if (hasBlockedWord(v)) return { ok: false, code: "NAME_BLOCKED", error: "사용할 수 없는 표시명이에요. 다른 이름을 입력해 주세요." };
  return { ok: true, value: v };
}

export { formatPhone, maskPhone, DIAL_COUNTRIES } from "./phone";

/** E.164 로 정규화 (lib/phone.ts). iso 는 등록 폼에서 고른 국가 */
export function validatePhone(raw: string, iso?: string): { ok: true; value: string } | Invalid {
  const r = normalizePhone(raw, iso);
  return r.ok ? r : { ok: false, code: "PHONE_INVALID", error: r.error };
}

export function validateEmail(raw: string): { ok: true; value: string } | Invalid {
  const v = (raw ?? "").trim().toLowerCase();
  // 영문·숫자 주소만 (한글·공백·@ 두 개·점으로 시작/끝나는 주소·연속 점 거름). 실제 수신 여부까지는 확인하지 않는다
  if (!/^[a-z0-9_%+-]+(\.[a-z0-9_%+-]+)*@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(v) || v.length > 254) return { ok: false, code: "EMAIL_INVALID", error: "이메일 형식을 확인해 주세요." };
  return { ok: true, value: v };
}

/**
 * 출발지: 선택지 코드, 또는 ORIGIN_OTHER + 직접 입력(영문·숫자, 보드 칸 폭 이내).
 * 직접 입력값이 선택지 코드와 같으면 그 선택지로 본다.
 */
export function validateOrigin(code: string, text?: string | null): { ok: true; value: Origin } | Invalid {
  if (code !== ORIGIN_OTHER) {
    const o = ORIGIN_MAP.get(code);
    if (!o) return { ok: false, code: "ORIGIN_REQUIRED", error: "출발지를 선택해 주세요." };
    return { ok: true, value: o };
  }
  const v = normalizeText(text ?? "");
  if (v.length < 2) return { ok: false, code: "ORIGIN_TEXT_INVALID", error: `출발지를 영문 2~${FROM_WIDTH}자로 입력해 주세요.` };
  if (v.length > FROM_WIDTH) return { ok: false, code: "ORIGIN_TEXT_INVALID", error: `출발지는 영문 최대 ${FROM_WIDTH}자예요.` };
  if (hasBlockedWord(v)) return { ok: false, code: "ORIGIN_BLOCKED", error: "사용할 수 없는 출발지예요." };
  const known = ORIGIN_MAP.get(v);
  if (known) return { ok: true, value: known };
  return { ok: true, value: { code: v, label: v, group: "other" } };
}
