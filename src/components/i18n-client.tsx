"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { LANGS, LANG_LABEL, LOCALE, MESSAGES, fmt, isLang, pickLang, rankLabel, type Lang, type Messages } from "@/lib/i18n";
import { NAME_MAX, NAME_MIN, TZ } from "@/lib/config";
import { FROM_WIDTH } from "@/lib/origins";

const STORE_KEY = "tp_lang";

interface Ctx {
  lang: Lang;
  t: Messages;
  setLang: (l: Lang) => void;
  fmt: typeof fmt;
  rank: (r: number) => string;
  dateTime: (iso: string | Date | null | undefined) => string;
  /** API 에러 응답 → 현재 언어 문구 (code 가 없으면 서버 문구, 그것도 없으면 fallback) */
  apiError: (data: { code?: string; error?: string } | null | undefined, fallback: string) => string;
}

const I18nCtx = createContext<Ctx | null>(null);

/** 첫 렌더는 ko 로 고정(SSR 일치), 마운트 후 ?lang= → 저장값 → 브라우저 언어 순으로 결정 */
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("ko");

  useEffect(() => {
    let next: Lang | null = null;
    try {
      const q = new URLSearchParams(window.location.search).get("lang");
      if (isLang(q)) next = q;
      if (!next) {
        const saved = localStorage.getItem(STORE_KEY);
        if (isLang(saved)) next = saved;
      }
    } catch {}
    setLangState(next ?? pickLang(navigator.languages?.length ? navigator.languages : [navigator.language]));
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(STORE_KEY, l); } catch {}
    // 주소에 ?lang= 이 남아 있으면 새로고침 때 그 언어로 되돌아간다. 직접 고른 언어가 이기도록 주소에서 지운다
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("lang")) {
        url.searchParams.delete("lang");
        window.history.replaceState(window.history.state, "", url);
      }
    } catch {}
  }, []);

  const value = useMemo<Ctx>(() => {
    const t = MESSAGES[lang];
    const df = new Intl.DateTimeFormat(LOCALE[lang], { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ });
    return {
      lang,
      t,
      setLang,
      fmt,
      rank: (r) => rankLabel(lang, r),
      dateTime: (iso) => (iso ? df.format(new Date(iso)) : "-"),
      apiError: (data, fallback) => {
        const code = data?.code as keyof Messages["error"] | undefined;
        if (code && code in t.error) return fmt(t.error[code], { min: NAME_MIN, max: NAME_MAX, width: FROM_WIDTH });
        if (lang === "ko" && data?.error) return data.error;
        return fallback;
      },
    };
  }, [lang, setLang]);

  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export function useI18n() {
  const c = useContext(I18nCtx);
  if (!c) throw new Error("useI18n must be used inside I18nProvider");
  return c;
}

export function LangSwitcher() {
  const { lang, setLang, t } = useI18n();
  return (
    <select className="lang-select" aria-label={t.common.language} value={lang} onChange={(e) => isLang(e.target.value) && setLang(e.target.value)}>
      {LANGS.map((l) => <option key={l} value={l}>{LANG_LABEL[l]}</option>)}
    </select>
  );
}
