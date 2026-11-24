"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { NAME_MAX, SURVEY_COUNT, TZ, hhmm, type PrizeType, type Rank } from "@/lib/config";
import { FROM_WIDTH, ORIGIN_OTHER } from "@/lib/origins";
import { filterName, nameLength, normalizeName, normalizeText, validateEmail, validateName } from "@/lib/validation";
import { EMOJI_PALETTE, NAME_EMOJI_MAX, cells, emojiSrc, originFlag, paletteEmoji } from "@/lib/glyphs";
import { DIAL_COUNTRIES, countryForOrigin, dialShort, formatPhoneInput, normalizePhone, phonePlaceholder } from "@/lib/phone";
import { COUNTRIES, KOREA, OTHER, REGIONS, isRegion, placeName } from "@/lib/geo";
import { LANGS, LANG_LABEL, MESSAGES, isLang, rankLabel, type Lang, type Messages } from "@/lib/i18n";
import { LangSwitcher, useI18n } from "./i18n-client";
import Globe, { type GlobePin } from "./register/Globe";
import MiniBoard, { MINI_WIDTH } from "./register/MiniBoard";
import NameBoardInput from "./register/NameBoardInput";
import Countdown from "./register/Countdown";
import QrSheet from "./register/QrSheet";
import Reveal from "./register/Reveal";
import Quiz, { QUIZ_COUNT } from "./register/Quiz";
import Survey, { type SurveyState } from "./register/Survey";
import s from "./register/register.module.css";
import { watchDraw } from "@/lib/watch-draw";
import { track, trackOnce, trackRegisterError, trackViews } from "@/lib/track";
import TpLinks from "./TpLinks";

/** 예전 방식(localStorage 토큰)의 흔적. 지금은 서버가 심는 HttpOnly 쿠키(lib/pass.ts)로 대체됐고, 남아 있으면 지운다 */
const LEGACY_TOKEN_KEY = "tp_arrival_token";
/** I18nProvider 가 고른 언어를 저장하는 키. 값이 있으면 언어 선택 화면을 건너뛴다 */
const LANG_KEY = "tp_lang";
/** 전광판에 떠 있는 동안: 새 손님이 오면 내 줄이 한 칸씩 내려가므로 줄 번호가 늦지 않게 자주 확인한다 */
const BOARD_POLL_MS = 3000;
const DRAFT_KEY = "tp_arrival_draft";
/** 추첨 결과 공개 연출을 이미 본 참가자 번호. 한 번 본 뒤에는 결과 화면을 바로 보여준다 */
const REVEAL_KEY = "tp_reveal_seen";
/** 마지막으로 팝업을 닫은 공지의 시각. 공지가 바뀌면(시각이 달라지면) 팝업을 다시 띄운다 */
const NOTICE_KEY = "tp_notice_seen";
const STAMP_MS = 1700;

interface PublicP { seq: number; display_name: string; origin_code: string; origin_group: string; created_at: string }
interface Raffle { drawn: boolean; round_name: string | null; rank: 1 | 2 | 3 | null; prize: string | null; expired?: boolean }
/** 내가 속한(속하게 될) 추첨 회차. open 응모 받는 중 → drawing 마감 후 추첨 전 → announced 발표됨 */
interface MyRound { name: string; state: "open" | "drawing" | "announced"; cutoff_at: string; announce_at: string | null; claim_until: string | null; qty: Record<Rank, number> }
/** board: 지금 TV 전광판의 위에서 몇 번째 줄에 떠 있는지 (1 = 맨 위). 떠 있지 않으면 null */
interface Me { participant: PublicP; raffle: Raffle | null; round: MyRound | null; board: number | null; qr: string; claims: { prize_type: PrizeType; claimed_at: string }[]; notice?: { text: string; at: string } | null; survey?: SurveyState }

type Step = "quiz" | "origin" | "phone" | "email" | "name" | "consent";
/**
 * 기본 퀴즈(홍보용 3문항)의 자리. 기본은 맨 앞(재미있는 것 먼저 → 개인정보 입력).
 * NEXT_PUBLIC_QUIZ_POSITION=last 면 동의 직전으로 옮긴다 (행사 중 단계별 이탈 수치를 보고 바꿀 수 있게).
 */
const QUIZ_FIRST = process.env.NEXT_PUBLIC_QUIZ_POSITION !== "last";
const STEPS: readonly Step[] = QUIZ_FIRST ? ["quiz", "origin", "phone", "email", "name", "consent"] : ["origin", "phone", "email", "name", "quiz", "consent"];

interface Draft {
  step: Step;
  /** 퀴즈에서 지금 보고 있는 문제 (0부터) */
  quiz: number;
  /** 지구본에서 고른 곳: KOREA 또는 해외 출발지 코드 */
  country: string;
  /** 서버로 보내는 출발지 코드 (한국이면 시도 코드, 직접 입력이면 ORIGIN_OTHER) */
  origin: string;
  /** 직접 입력한 출발지 */
  originText: string;
  phone: string;
  phoneCountry: string;
  dialUnlocked: boolean;
  email: string;
  /** 표시명. 영문·숫자 사이 아무 자리에나 팔레트 이모지가 들어갈 수 있다 */
  name: string;
  /** 등록 멱등키. 제출 때 만들고, 입력값이 바뀌면 비운다. 새로고침해도 sessionStorage 로 유지돼 재시도가 같은 요청으로 처리된다 */
  requestId: string;
}
const EMPTY: Draft = { step: STEPS[0], quiz: 0, country: "", origin: "", originText: "", phone: "", phoneCountry: "KR", dialUnlocked: false, email: "", name: "", requestId: "" };

/** 등록 요청 하나의 상한. 넘으면 같은 멱등키로 다시 보낸다 */
const REGISTER_TIMEOUT_MS = 8000;
const REGISTER_ATTEMPTS = 3;

function newRequestId() {
  try { return crypto.randomUUID(); } catch { return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`; }
}

/** fetch + 타임아웃. 타임아웃·네트워크 오류는 status 0 */
async function postJson(url: string, body: unknown, headers: Record<string, string> = {}, timeoutMs = REGISTER_TIMEOUT_MS) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: ac.signal, credentials: "same-origin" });
    return { status: r.status, data: await r.json().catch(() => ({})) as Record<string, unknown> & { code?: string; error?: string; field?: string } };
  } catch {
    return { status: 0, data: {} as Record<string, unknown> & { code?: string; error?: string; field?: string } };
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type View =
  | { kind: "loading" }
  | { kind: "lang" }
  | { kind: "wizard" }
  | { kind: "lookup"; field: string }
  | { kind: "stamp"; me: Me }
  | { kind: "survey"; me: Me }
  | { kind: "done"; me: Me };

/** 보딩패스 쿠키는 브라우저가 알아서 실어 보낸다. 등록 전이면 null */
async function fetchMe(): Promise<Me | null> {
  const r = await fetch("/api/me", { cache: "no-store", credentials: "same-origin" });
  if (!r.ok) return null;
  const data = await r.json();
  return data.participant ? (data as Me) : null;
}

export default function RegisterFlow() {
  const { t, lang, setLang } = useI18n();
  const [view, setView] = useState<View>({ kind: "loading" });
  const [draft, setDraft] = useState<Draft>(EMPTY);
  // 입력값이 바뀌면 멱등키를 비운다 (같은 키로 다른 정보를 보내지 않게). 단계 이동·키 설정만이면 유지
  const patch = useCallback((p: Partial<Draft>) => setDraft((d) => {
    const changesData = Object.keys(p).some((k) => k !== "step" && k !== "quiz" && k !== "requestId" && k !== "dialUnlocked" && p[k as keyof Draft] !== d[k as keyof Draft]);
    return { ...d, ...p, ...(changesData && !("requestId" in p) ? { requestId: "" } : {}) };
  }), []);

  // 재방문: 보딩패스 쿠키가 있으면 완료 화면 복원 (서버가 판단), 없으면 언어 → 이어서 입력
  useEffect(() => {
    // 언어는 I18nProvider 가 ?lang= → 저장값 → 브라우저 언어 순으로 정한다. 직접 고른 적이 없을 때만 언어 화면을 보여준다
    let hasLang = isLang(safeGet("local", LANG_KEY));
    try { hasLang ||= isLang(new URLSearchParams(window.location.search).get("lang")); } catch {}
    try {
      const d = JSON.parse(safeGet("session", DRAFT_KEY) ?? "null");
      if (d && STEPS.includes(d.step)) setDraft({ ...EMPTY, ...d });
    } catch {}
    const start: View = hasLang ? { kind: "wizard" } : { kind: "lang" };
    safeDel("local", LEGACY_TOKEN_KEY);
    fetchMe()
      .then((me) => { if (!me) track("page_view", "register"); setView(me ? { kind: "done", me } : start); })
      .catch(() => setView(start));
  }, []);

  useEffect(() => {
    if (view.kind === "wizard") safeSet("session", DRAFT_KEY, JSON.stringify(draft));
  }, [draft, view.kind]);

  useEffect(() => {
    if (view.kind !== "stamp") return;
    const id = setTimeout(() => setView({ kind: "done", me: view.me }), STAMP_MS);
    return () => clearTimeout(id);
  }, [view]);

  const refresh = useCallback(async () => {
    const me = await fetchMe().catch(() => null);
    if (me) setView((v) => (v.kind === "done" ? { kind: "done", me } : v));
  }, []);

  const finish = useCallback((me: Me, stamp: boolean) => {
    safeDel("session", DRAFT_KEY);
    setView(stamp ? { kind: "stamp", me } : { kind: "done", me });
  }, []);

  const langToggle = <LangSwitcher />;

  if (view.kind === "loading") return <div className="card"><p className="lead" style={{ margin: 0 }}>…</p></div>;

  if (view.kind === "lang") return (
    <div className={`card ${s.wizard}`}>
      <div className={s.step}>
        <div className={s.langTitle}><b>언어를 선택해 주세요</b><span>Choose your language</span></div>
        <div className={s.langBtns}>
          {LANGS.map((l) => (
            <button key={l} type="button" className={s.langBtn} lang={l} onClick={() => { setLang(l); setView({ kind: "wizard" }); }}>
              {LANG_LABEL[l]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  if (view.kind === "stamp") {
    const p = view.me.participant;
    return (
      <div className="card">
        <div className={s.stampStage} role="status">
          <div className={s.stamp}>
            <small>{t.wizard.stamp}</small>
            <b>ARRIVED</b>
            <em>KOREA · {hhmm(p.created_at)}</em>
            <small>NO. {String(p.seq).padStart(4, "0")}</small>
          </div>
        </div>
      </div>
    );
  }

  if (view.kind === "survey" && view.me.survey) {
    const me = view.me;
    // 다 답했거나 시간이 되면 완료 화면으로. 새 상태(2배 적용 여부)를 받아서 돌아간다
    const exit = async () => setView({ kind: "done", me: (await fetchMe().catch(() => null)) ?? me });
    return <Survey seq={me.participant.seq} survey={me.survey!} onExit={exit} />;
  }

  if (view.kind === "done" || view.kind === "survey") {
    const openSurvey = () => setView({ kind: "survey", me: view.me });
    return (
    <>
      {SHOW_PREVIEW ? <DonePreview me={view.me} onRefresh={refresh} onSurvey={openSurvey} /> : <Done me={view.me} onRefresh={refresh} onSurvey={openSurvey} />}
      <div className={s.langFloat}>{langToggle}</div>
    </>
    );
  }

  if (view.kind === "lookup") return (
    <Lookup field={view.field} draft={draft} onFound={(me) => finish(me, false)} onBack={() => setView({ kind: "wizard" })} />
  );

  return (
    <Wizard
      draft={draft} patch={patch} langToggle={langToggle}
      onLangStep={() => setView({ kind: "lang" })}
      onDuplicate={(field) => setView({ kind: "lookup", field })}
      onDone={(me) => finish(me, true)}
    />
  );
}

interface WizardProps {
  draft: Draft; patch: (p: Partial<Draft>) => void; langToggle: React.ReactNode;
  onLangStep: () => void; onDuplicate: (field: string) => void; onDone: (me: Me) => void;
}

function Wizard({ draft, patch, langToggle, onLangStep, onDuplicate, onDone }: WizardProps) {
  const { t, lang, fmt, apiError } = useI18n();
  const w = t.wizard;
  const idx = STEPS.indexOf(draft.step);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cPrivacy, setCPrivacy] = useState(false);
  const [cDisplay, setCDisplay] = useState(false);
  const [cMarketing, setCMarketing] = useState(false);

  const go = (step: Step) => { setErr(null); patch({ step }); };
  const back = () => {
    // 퀴즈 안에서는 앞 문제로, 퀴즈 뒤 단계에서 돌아오면 마지막 문제로
    if (draft.step === "quiz" && draft.quiz > 0) return patch({ quiz: draft.quiz - 1 });
    if (idx === 0) return onLangStep();
    setErr(null);
    patch(STEPS[idx - 1] === "quiz" ? { step: "quiz", quiz: QUIZ_COUNT - 1 } : { step: STEPS[idx - 1] });
  };
  const quizIdx = Math.min(draft.quiz, QUIZ_COUNT - 1);
  const quizNext = () => (quizIdx < QUIZ_COUNT - 1 ? patch({ quiz: quizIdx + 1 }) : go(STEPS[idx + 1]));
  useEffect(() => { window.scrollTo({ top: 0 }); }, [draft.step, draft.quiz]);
  // 분석: 단계별 이탈. 각 단계를 처음 본 순간을 한 번씩만 남긴다
  const seenSteps = useRef(new Set<Step>());
  useEffect(() => {
    if (seenSteps.current.has(draft.step)) return;
    seenSteps.current.add(draft.step);
    track("step_view", "register", { step: draft.step });
  }, [draft.step]);

  /** 서버에 중복만 미리 물어본다. 실패하면 그냥 진행 (최종 판단은 register) */
  async function isDuplicate(body: object) {
    try {
      const r = await fetch("/api/precheck", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return r.ok ? ((await r.json()).duplicate as string | null) : null;
    } catch { return null; }
  }

  async function next(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setErr(null);
    if (draft.step === "quiz") return; // 보기를 눌러서만 넘어간다
    if (draft.step === "origin") {
      if (!originReady(draft)) return;
      return go(STEPS[idx + 1]);
    }
    if (draft.step === "phone") {
      const ph = normalizePhone(draft.phone, draft.phoneCountry);
      if (!ph.ok) return setErr(draft.phoneCountry === "XX" ? w.phoneNeedPlus : draft.phoneCountry === "KR" ? w.phoneKR : t.error.PHONE_INVALID);
      setBusy(true);
      const dup = await isDuplicate({ phone: draft.phone, phoneCountry: draft.phoneCountry });
      setBusy(false);
      if (dup) trackRegisterError("precheck", "DUPLICATE");
      return dup ? onDuplicate(dup) : go("email");
    }
    if (draft.step === "email") {
      if (!validateEmail(draft.email).ok) return setErr(t.error.EMAIL_INVALID);
      setBusy(true);
      const dup = await isDuplicate({ email: draft.email });
      setBusy(false);
      if (dup) trackRegisterError("precheck", "DUPLICATE");
      return dup ? onDuplicate(dup) : go(STEPS[idx + 1]);
    }
    if (draft.step === "name") {
      const nm = validateName(draft.name);
      if (!nm.ok) return setErr(apiError(nm, t.error.NAME_BLOCKED));
      return go(STEPS[idx + 1]);
    }
    if (!cPrivacy || !cDisplay) return setErr(w.consentRequired);
    setBusy(true);
    try {
      // 멱등키: 처음 제출할 때 만들고 재시도에는 같은 값을 쓴다
      const requestId = draft.requestId || newRequestId();
      if (!draft.requestId) patch({ requestId });
      const body = {
        displayName: draft.name, origin: draft.origin, originText: draft.origin === ORIGIN_OTHER ? draft.originText : null, phone: draft.phone, phoneCountry: draft.phoneCountry, email: draft.email,
        consentPrivacy: cPrivacy, consentDisplay: cDisplay, consentMarketing: cMarketing, lang,
      };
      // 타임아웃·네트워크 끊김·서버 혼잡(503 BUSY/UNAVAILABLE)은 같은 키로 자동 재시도 (서버가 이미 처리했으면 같은 번호를 돌려준다)
      let res = await postJson("/api/register", body, { "Idempotency-Key": requestId });
      for (let i = 1; i < REGISTER_ATTEMPTS && (res.status === 0 || (res.status === 503 && res.data.code !== "REGISTRATION_PAUSED")); i++) {
        await sleep(1000 * i + Math.random() * 500);
        res = await postJson("/api/register", body, { "Idempotency-Key": requestId });
      }
      const { status, data } = res;
      if (status === 201 || status === 200) {
        const me = await fetchMe().catch(() => null);
        if (me) return onDone(me);
        trackRegisterError("submit", "NETWORK");
        return setErr(t.common.network);
      }
      // 사용자가 에러를 보게 되는 경우 기록 (이탈 분석: 에러 후 떠났는지)
      trackRegisterError("submit", status === 0 ? null : status === 429 ? "RATE_LIMITED" : (data.code ?? (status >= 500 ? "SERVER" : null)));
      if (status === 0) return setErr(t.common.network);
      if (status === 409 && data.code === "DUPLICATE") return onDuplicate(String(data.field ?? ""));
      if (status === 422 && data.code === "IDEMPOTENCY_MISMATCH") patch({ requestId: "" });
      // 입력 오류면 해당 단계로 돌려보낸다
      const stepOf: Record<string, Step> = { origin: "origin", phone: "phone", email: "email", displayName: "name" };
      if (stepOf[String(data.field)]) patch({ step: stepOf[String(data.field)] });
      setErr(apiError(data, t.register.failed));
    } catch {
      trackRegisterError("submit", null);
      setErr(t.common.network);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={`card ${s.wizard}`} onSubmit={next} noValidate>
      <div className={s.bar}>
        <button type="button" className={s.back} onClick={back} aria-label={w.back}>←</button>
        <div className={s.progress} role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={idx + 1}>
          {STEPS.map((x, i) => {
            // 퀴즈 칸은 문제를 풀 때마다 1/3씩 찬다 (칸 수를 늘리지 않아 길어 보이지 않게)
            const part = x === "quiz" && i === idx ? Math.round(((quizIdx + 1) / QUIZ_COUNT) * 100) : null;
            return <i key={x} className={i <= idx && part === null ? s.on : ""} style={part === null ? undefined : { background: `linear-gradient(to right, var(--yellow) ${part}%, var(--line) ${part}%)` }} />;
          })}
        </div>
        {langToggle}
      </div>

      <div className={s.step} key={draft.step === "quiz" ? `quiz${quizIdx}` : draft.step}>
        {draft.step === "quiz" && <Quiz key={quizIdx} index={quizIdx} onCorrect={quizNext} />}
        {draft.step === "origin" && <OriginStep draft={draft} patch={patch} invalid={!!err} />}
        {draft.step === "phone" && <PhoneStep draft={draft} patch={patch} invalid={!!err} />}
        {draft.step === "email" && (
          <>
            <h1 className={s.h}>{w.emailTitle}</h1>
            <p className={s.sub}>{w.emailSub}</p>
            <input className={`input ${s.big} ${err ? "invalid" : ""}`} value={draft.email} onChange={(e) => patch({ email: e.target.value.replace(/\s/g, "") })} autoFocus
              type="email" placeholder="name@example.com" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} aria-label={w.emailTitle} />
            {/* 치는 중에는 조용히 형식만 알려주고, 맞으면 사라진다 */}
            {!err && draft.email && !validateEmail(draft.email).ok && <div className={s.hint}>{w.emailHint}</div>}
          </>
        )}
        {draft.step === "name" && <NameStep draft={draft} patch={patch} invalid={!!err} />}
        {draft.step === "consent" && (
          <ConsentStep
            values={[cPrivacy, cDisplay, cMarketing]} setters={[setCPrivacy, setCDisplay, setCMarketing]} />
        )}

        {err && <div className={s.err} role="alert">{err}</div>}

        {draft.step !== "quiz" && (
          <button className={`btn ${s.cta}`} type="submit" disabled={busy || !canNext(draft, cPrivacy && cDisplay)}>
            {draft.step === "consent" ? (busy ? t.register.submitting : t.register.submit) : w.next}
          </button>
        )}
        {draft.step === "consent" && <div className={s.hint} style={{ textAlign: "center" }}>{w.oncePerPerson}</div>}
        {idx === 0 && (
          <div className={s.foot}>{w.already}<button type="button" onClick={() => onDuplicate("")}>{t.register.findMine}</button></div>
        )}
      </div>
    </form>
  );
}

/** 직접 입력을 골랐으면 두 글자 이상 적어야 한다 */
function originReady(d: Draft) {
  return !!d.origin && (d.origin !== ORIGIN_OTHER || normalizeText(d.originText).length >= 2);
}

function canNext(d: Draft, consented: boolean) {
  switch (d.step) {
    case "quiz": return false;
    case "origin": return originReady(d);
    case "phone": return normalizePhone(d.phone, d.phoneCountry).ok; // 형식이 맞아야 "다음"이 켜진다
    case "email": return validateEmail(d.email).ok; // 형식이 맞아야 "다음"이 켜진다
    case "name": return nameLength(normalizeName(d.name)) >= 2;
    case "consent": return consented;
  }
}

interface StepProps { draft: Draft; patch: (p: Partial<Draft>) => void }

function OriginStep({ draft, patch, invalid }: StepProps & { invalid: boolean }) {
  const { t, lang, fmt } = useI18n();
  const w = t.wizard;
  const name = useCallback((code: string) => (code === KOREA.code ? w.korea : placeName(code, lang)), [w, lang]);
  const pins = useMemo<GlobePin[]>(
    () => [KOREA, ...COUNTRIES].map((c) => ({ id: c.code, lat: c.lat, lon: c.lon, label: `${c.flag} ${name(c.code)}` })),
    [name],
  );
  const typed = draft.origin === ORIGIN_OTHER;
  const strip = useRef<HTMLDivElement>(null);
  const inKorea = draft.country === KOREA.code;

  /** 출발지가 바뀌면 전화 국가번호도 그 나라로 다시 고정한다 */
  const setOrigin = (country: string, origin: string) => {
    const phoneCountry = origin ? countryForOrigin(origin) : draft.phoneCountry;
    patch({ country, origin, ...(origin && phoneCountry !== draft.phoneCountry ? { phoneCountry, dialUnlocked: false, phone: formatPhoneInput(draft.phone, phoneCountry) } : {}) });
  };
  const pick = (code: string) => {
    if (code === KOREA.code) return setOrigin(code, isRegion(draft.origin) ? draft.origin : "");
    setOrigin(code, code);
    strip.current?.querySelector<HTMLElement>(`[data-code="${code}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  };

  return (
    <>
      <h1 className={s.h}>{inKorea ? w.originKoreaTitle : w.originTitle}</h1>
      <p className={s.sub}>{inKorea ? w.originKoreaSub : w.originSub}</p>
      <div className={s.globeWrap}>
        <Globe className={`${s.globe} ${inKorea ? s.compact : ""}`} pins={pins} selected={draft.country && draft.country !== OTHER.code && draft.country !== ORIGIN_OTHER ? draft.country : null} zoom={inKorea} onPick={pick} />
      </div>

      {inKorea ? (
        <>
          <div className={s.regions}>
            {REGIONS.map((r) => (
              <button key={r.code} type="button" className={`${s.chip} ${draft.origin === r.code ? s.on : ""}`} aria-pressed={draft.origin === r.code}
                onClick={(e) => { setOrigin(KOREA.code, r.code); e.currentTarget.form?.querySelector("button[type=submit]")?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }}>{name(r.code)}</button>
            ))}
          </div>
          <button type="button" className={s.link} onClick={() => setOrigin("", "")}>{w.originOtherCountry}</button>
        </>
      ) : (
        <div className={s.strip} ref={strip}>
          <button type="button" className={`${s.chip} ${s.home}`} data-code={KOREA.code} onClick={() => pick(KOREA.code)}>{KOREA.flag} {name(KOREA.code)}</button>
          {[...COUNTRIES, OTHER].map((c) => (
            <button key={c.code} type="button" data-code={c.code} className={`${s.chip} ${draft.country === c.code ? s.on : ""}`} aria-pressed={draft.country === c.code}
              onClick={() => pick(c.code)}>{c.flag} {name(c.code)}</button>
          ))}
          {/* 목록에 없는 곳: 보드에 띄울 출발지를 직접 적는다 */}
          <button type="button" data-code={ORIGIN_OTHER} className={`${s.chip} ${typed ? s.on : ""}`} aria-pressed={typed} onClick={() => pick(ORIGIN_OTHER)}>{t.register.originOther}</button>
        </div>
      )}
      {typed && (
        <div className={s.typed}>
          <input className={`input mono ${s.big} ${invalid ? "invalid" : ""}`} value={draft.originText} maxLength={FROM_WIDTH} autoFocus
            onChange={(e) => patch({ originText: e.target.value.toUpperCase().replace(/[^A-Z0-9 .\-]/g, "") })}
            placeholder={t.register.originOtherPlaceholder} autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false} aria-label={t.register.originOther} />
          <div className={s.hint}>{fmt(t.register.originOtherHint, { max: FROM_WIDTH })}</div>
        </div>
      )}
    </>
  );
}

function PhoneStep({ draft, patch, invalid }: StepProps & { invalid: boolean }) {
  const { t } = useI18n();
  const w = t.wizard;
  const other = draft.phoneCountry === "XX";
  return (
    <>
      <h1 className={s.h}>{w.phoneTitle}</h1>
      <p className={s.sub}>{w.phoneSub}</p>
      <div className={draft.dialUnlocked ? s.phoneRow : `input ${s.phoneField} ${invalid ? "invalid" : ""}`}>
        {draft.dialUnlocked ? (
          <div className={`select dial ${invalid ? "invalid" : ""}`}>
            <span>{dialShort(draft.phoneCountry)}</span>
            <select aria-label={w.phoneDialLabel} value={draft.phoneCountry} onChange={(e) => patch({ phoneCountry: e.target.value, phone: formatPhoneInput(draft.phone, e.target.value) })}>
              {DIAL_COUNTRIES.map((c) => <option key={c.iso} value={c.iso}>{c.label}</option>)}
            </select>
          </div>
        ) : (
          <span className={s.dialFixed}>{dialShort(draft.phoneCountry)}</span>
        )}
        <input className={draft.dialUnlocked ? `input ${s.big} ${invalid ? "invalid" : ""}` : s.bare} value={draft.phone} onChange={(e) => patch({ phone: formatPhoneInput(e.target.value, draft.phoneCountry) })} autoFocus
          type="tel" placeholder={phonePlaceholder(draft.phoneCountry)} inputMode="tel" autoComplete="tel" style={{ flex: 1, minWidth: 0 }} aria-label={w.phoneTitle} />
      </div>
      {other && <div className={s.hint}>{w.phoneNeedPlus}</div>}
      {!draft.dialUnlocked && <button type="button" className={s.link} onClick={() => patch({ dialUnlocked: true })}>{w.phoneOtherDial}</button>}
    </>
  );
}

/** 키보드 위로 실제 보이는 영역 (visualViewport). 지원 안 하면 null */
function useVisibleArea(active: boolean) {
  const [area, setArea] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!active || !vv) { setArea(null); return; }
    const update = () => setArea({ top: vv.offsetTop, height: vv.height });
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => { vv.removeEventListener("resize", update); vv.removeEventListener("scroll", update); };
  }, [active]);
  return area;
}

const HANGUL = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/;
const PICTO = /\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]/u;

/**
 * 이름 단계. 들어올 땐 키보드를 띄우지 않아 미리보기·입력칸·팔레트가 한 화면에 보인다.
 * 입력칸을 누르면 키보드 위 보이는 영역(없으면 화면 위 절반)을 입력칸 + 이모지로만 채운다 (.nameSheet).
 * 같은 input 을 그대로 쓰고 감싼 상자만 바꿔서 포커스가 끊기지 않게 한다.
 */
function NameStep({ draft, patch, invalid }: StepProps & { invalid: boolean }) {
  const { t, fmt } = useI18n();
  const w = t.wizard;
  const input = useRef<HTMLInputElement>(null);
  /** 마지막 커서 위치. 팔레트를 누르다 키보드가 내려가 포커스를 잃어도 이 자리에 넣는다 */
  const caret = useRef<number | null>(null);
  /** 걸러낸 뒤 되돌릴 커서 (대문자 변환·문자 제거로 값이 바뀌면 커서가 끝으로 튀는 걸 막는다) */
  const pendingCaret = useRef<number | null>(null);
  const [focused, setFocused] = useState(false);
  const [caretAt, setCaretAt] = useState<number | null>(null);
  const [notice, setNotice] = useState<"" | "latin" | "emoji">("");
  const noticeTimer = useRef<number | null>(null);
  const area = useVisibleArea(focused);

  const shown = normalizeName(draft.name);
  const cur = cells(draft.name);
  const full = cur.filter((g) => paletteEmoji(g)).length >= NAME_EMOJI_MAX || cur.length >= NAME_MAX;

  useLayoutEffect(() => {
    const el = input.current;
    if (el && pendingCaret.current !== null && document.activeElement === el) {
      try { el.setSelectionRange(pendingCaret.current, pendingCaret.current); } catch {}
    }
    if (pendingCaret.current !== null) setCaretAt(pendingCaret.current);
    pendingCaret.current = null;
  }, [draft.name]);
  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);

  const flash = (n: "latin" | "emoji") => {
    setNotice(n);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(""), 3500);
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const at = e.target.selectionStart ?? raw.length;
    const next = filterName(raw);
    // 걸러진 글자 안내: 한글(전광판은 영문만) / 팔레트 밖 이모지
    if (HANGUL.test(raw)) flash("latin");
    else if (cells(raw).some((g) => PICTO.test(g) && !paletteEmoji(g))) flash("emoji");
    const pos = Math.min(next.length, filterName(raw.slice(0, at)).length);
    pendingCaret.current = pos;
    caret.current = pos;
    patch({ name: next });
  };

  /** 팔레트 이모지를 커서 자리에 끼워 넣는다 (커서를 둔 적 없으면 끝) */
  const insert = (em: string) => {
    const el = input.current;
    const v = draft.name;
    const live = el && document.activeElement === el;
    const at = Math.min(v.length, live ? (el!.selectionStart ?? v.length) : (caret.current ?? v.length));
    const end = Math.min(v.length, live ? (el!.selectionEnd ?? at) : at);
    const next = filterName(v.slice(0, at) + em + v.slice(end));
    const pos = Math.min(next.length, filterName(v.slice(0, at) + em).length);
    pendingCaret.current = pos;
    caret.current = pos;
    patch({ name: next });
  };

  const noticeText = notice === "latin" ? w.nameOnlyLatin : notice === "emoji" ? w.nameEmojiPalette : "";

  const caretCell = focused ? Math.min(MINI_WIDTH - 1, cells(draft.name.slice(0, caretAt ?? draft.name.length)).length) : null;

  return (
    <>
      <h1 className={s.h}>{w.nameTitle}</h1>
      <p className={s.sub}>{w.nameSub}</p>
      <MiniBoard rows={[
        { label: "FROM", text: (() => { const code = draft.origin === ORIGIN_OTHER ? normalizeText(draft.originText) : draft.origin; return originFlag(code) + code; })() },
      ]} />
      {/* PASSENGER 줄이 곧 입력칸. 누르면 키보드 위 보이는 영역을 이 줄 + 이모지로만 채운다 */}
      <div className={focused ? s.nameSheet : undefined}
        style={focused ? (area ? { top: area.top, height: area.height } : { top: 0, height: "50dvh" }) : undefined}>
        <div className={s.miniLabel}>PASSENGER</div>
        <NameBoardInput ref={input} value={draft.name} placeholder={w.namePlaceholder} caretCell={caretCell} invalid={invalid} label={w.nameTitle}
          onChange={onChange}
          onSelectCaret={(at) => { caret.current = at; setCaretAt(at); }}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => { if (document.activeElement !== input.current) setFocused(false); }, 0)} />
        <div className={`${s.hint} ${notice ? s.notice : ""}`} aria-live="polite">{noticeText || fmt(w.nameHint, { max: NAME_MAX })}</div>
        {/* 이 목록에 있는 것만 받는다 (lib/glyphs.ts EMOJI_PALETTE). 전광판과 같은 Fluent 3D 그림.
            누를 때 입력칸 포커스를 뺏지 않게 해서 키보드가 그대로 떠 있다 */}
        <div className={s.palette} role="group" aria-label="emoji">
          {EMOJI_PALETTE.map((em) => (
            <button key={em} type="button" className={s.emojiBtn} disabled={full} aria-label={em} tabIndex={-1}
              onPointerDown={(ev) => ev.preventDefault()} onMouseDown={(ev) => ev.preventDefault()} onClick={() => insert(em)}>
              <EmojiImg e={em} />
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

/** Fluent 3D 이모지 그림. 그림이 없는 글자는 그대로 */
function EmojiImg({ e }: { e: string }) {
  const src = emojiSrc(e);
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img className={s.emojiImg} src={src} alt={e} draggable={false} /> : <>{e}</>;
}

/** 표시명을 글자와 Fluent 그림 이모지로 (완료 화면 등) */
function NameText({ name }: { name: string }) {
  return <>{cells(name).map((g, i) => (emojiSrc(g) ? <EmojiImg key={i} e={g} /> : g))}</>;
}

function ConsentStep({ values, setters }: { values: boolean[]; setters: ((v: boolean) => void)[] }) {
  const { t } = useI18n();
  const w = t.wizard;
  const c = t.consent;
  const items = [
    { ...c.privacy, required: true },
    { ...c.display, required: true },
    { ...c.marketing, required: false },
  ];
  const all = values.every(Boolean);
  return (
    <>
      <h1 className={s.h}>{w.consentTitle}</h1>
      {items.map((it, i) => (
        <label className="check" key={i}>
          <input type="checkbox" checked={values[i]} onChange={(e) => setters[i](e.target.checked)} />
          <div>
            <div className="t">{it.title}<span className={it.required ? "req" : "opt"}>{it.required ? t.common.required : t.common.optional}</span></div>
            <details><summary>{t.common.details}</summary><ul>{it.body.map((x, k) => <li key={k}>{x}</li>)}</ul></details>
          </div>
        </label>
      ))}
      <button type="button" className={`${s.all} ${all ? s.on : ""}`} aria-pressed={all} onClick={() => setters.forEach((f) => f(!all))}>
        <span className={s.tick} />{w.agreeAll}
      </button>
      {c.legalNote && <p className={s.hint}>{c.legalNote}</p>}
    </>
  );
}

function Lookup({ field, draft, onFound, onBack }: { field: string; draft: Draft; onFound: (me: Me) => void; onBack: () => void }) {
  const { t, apiError } = useI18n();
  const [phone, setPhone] = useState(draft.phone);
  const [phoneCountry, setPhoneCountry] = useState(draft.phoneCountry);
  const [email, setEmail] = useState(draft.email);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, phoneCountry, email }) });
      const data = await r.json();
      if (!r.ok) { trackRegisterError("lookup", r.status === 429 ? "RATE_LIMITED" : data.code ?? "SERVER"); setErr(apiError(data, t.lookup.failed)); return; }
      const me = await fetchMe();
      if (me) onFound(me); else { trackRegisterError("lookup", null); setErr(t.common.network); }
    } catch { trackRegisterError("lookup", null); setErr(t.common.network); } finally { setBusy(false); }
  }

  return (
    <form className="card" onSubmit={submit} noValidate>
      <h1 className="title">{t.lookup.title}</h1>
      <p className="lead">{field === "phone" ? t.lookup.byPhone : field === "email" ? t.lookup.byEmail : t.lookup.generic} {t.lookup.lead}</p>
      {err && <div className="alert">{err}</div>}
      <div className="field">
        <label htmlFor="lphone">{t.register.phone}</label>
        <div style={{ display: "flex", gap: 8 }}>
          <div className="select dial">
            <span>{dialShort(phoneCountry)}</span>
            <select aria-label={t.wizard.phoneDialLabel} value={phoneCountry} onChange={(e) => { setPhoneCountry(e.target.value); setPhone(formatPhoneInput(phone, e.target.value)); }}>
              {DIAL_COUNTRIES.map((c) => <option key={c.iso} value={c.iso}>{c.label}</option>)}
            </select>
          </div>
          <input id="lphone" className="input" value={phone} onChange={(e) => setPhone(formatPhoneInput(e.target.value, phoneCountry))}
            placeholder={phonePlaceholder(phoneCountry)} inputMode="tel" autoComplete="tel" style={{ flex: 1, minWidth: 0 }} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="lemail">{t.register.email}</label>
        <input id="lemail" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" inputMode="email" autoCapitalize="none" />
      </div>
      <button className="btn" type="submit" disabled={busy || !phone || !email}>{busy ? t.lookup.submitting : t.lookup.submit}</button>
      <div className="row-btns"><button type="button" className="btn ghost" onClick={onBack}>{t.lookup.back}</button></div>
      <div className="notice">{t.wizard.lookupNotice}</div>
    </form>
  );
}

/**
 * 화면 미리보기. 추첨을 실제로 돌리지 않고도 발표 이후 화면을 볼 수 있게, 서버에서 받은 내 정보를 화면에서만 바꿔 끼운다.
 * 추첨 상태·전광판·설문을 축마다 따로 고른다. 설문 축을 고른 채 연 설문은 연습용이라 답을 저장하지 않는다.
 * DB 는 건드리지 않는다. 수령 QR 도 본인 진짜 QR 이라 스캔하면 서버의 실제 상태가 나온다 (미리보기 당첨으로는 지급 불가).
 * 개발 모드에서는 항상, 배포판에서는 NEXT_PUBLIC_DONE_PREVIEW=1 일 때만 나온다. 본행사 전에는 반드시 끄고 재배포.
 */
const SHOW_PREVIEW = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DONE_PREVIEW === "1";

/** 미리보기 축. 축마다 따로 고른다: 추첨 상태 × 전광판 × 설문. 값 "" 는 서버가 준 실제 상태 그대로 */
const PV_AXES = [
  { key: "raffle", label: "추첨", options: [["", "실제"], ["open", "모집"], ["drawing", "추첨 중"], ["won1", "1등"], ["won2", "2등"], ["won3", "3등"], ["lost", "마스크팩"], ["claimed", "수령 완료"]] },
  { key: "board", label: "전광판", options: [["", "실제"], ["on", "떠 있음"], ["off", "내려감"]] },
  { key: "survey", label: "설문", options: [["", "실제"], ["new", "안 함"], ["mid", "3문항 답함"], ["done", "완료"]] },
] as const;
type PvKey = (typeof PV_AXES)[number]["key"];
type Preview = Record<PvKey, string>;
const PV_REAL: Preview = { raffle: "", board: "", survey: "" };

function previewMe(me: Me, pv: Preview, since: number): Me {
  const at = (min: number) => new Date(since + min * 60000).toISOString();
  let out = me;
  if (pv.board) out = { ...out, board: pv.board === "on" ? 2 : null };
  if (pv.survey) {
    // 기한은 넉넉히 뒤로 잡아 버튼이 늘 보이게 한다. 여기서 연 설문은 저장하지 않는다 (DonePreview)
    const n = pv.survey === "new" ? 0 : pv.survey === "mid" ? 3 : SURVEY_COUNT;
    out = { ...out, survey: { answers: Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1, 1])), done: pv.survey === "done", until: at(60), closes: at(90), applied: null } };
  }
  const r = pv.raffle;
  if (!r) return out;
  const base: MyRound = me.round ?? { name: "PREVIEW", state: "open", cutoff_at: at(60), announce_at: at(90), claim_until: at(120), qty: { 1: 1, 2: 17, 3: 34 } };
  const waiting = { raffle: null, claims: me.claims.filter((c) => c.prize_type === "mask") };
  if (r === "open") return { ...out, ...waiting, round: { ...base, state: "open", cutoff_at: at(60), announce_at: at(90) } };
  if (r === "drawing") return { ...out, ...waiting, round: { ...base, state: "drawing", cutoff_at: at(-1), announce_at: at(20) } };
  const rank = r === "lost" ? null : r === "won3" ? 3 : r === "won2" ? 2 : 1;
  const claims = r === "claimed" ? [...waiting.claims, { prize_type: "rank1" as PrizeType, claimed_at: at(0) }] : waiting.claims;
  return { ...out, claims, round: { ...base, state: "announced" }, raffle: { drawn: true, round_name: base.name, rank, prize: null } };
}

function DonePreview({ me, onRefresh, onSurvey }: { me: Me; onRefresh: () => void; onSurvey: () => void }) {
  const [pv, setPv] = useState<Preview>(PV_REAL);
  const [open, setOpen] = useState(false);
  // 기준 시각은 스위치를 누른 순간으로 고정한다 (15초마다 내 정보를 새로 받아와도 카운트다운이 튀지 않게)
  const [since, setSince] = useState(() => Date.now());
  // 설문 축을 고른 상태에서 연 설문은 연습용: 답을 서버에 보내지 않아서 몇 번이고 다시 풀 수 있다
  const [trying, setTrying] = useState<SurveyState | null>(null);
  const shown = previewMe(me, pv, since);
  const pick = (key: PvKey, v: string) => { setSince(Date.now()); setTrying(null); setPv((p) => ({ ...p, [key]: v })); };
  const picked = PV_AXES.flatMap((ax) => (pv[ax.key] ? [ax.options.find(([k]) => k === pv[ax.key])![1]] : []));
  const openSurvey = () => (pv.survey && shown.survey ? setTrying(shown.survey) : onSurvey());
  return (
    <>
      {trying ? (
        <Survey seq={me.participant.seq} survey={trying} preview
          onExit={(finished) => { setTrying(null); if (finished) setPv((p) => ({ ...p, survey: "done" })); }} />
      ) : (
        // 추첨 상태를 바꿀 때마다 결과 공개 연출부터 다시 볼 수 있게 한다
        <Done key={pv.raffle} me={shown} onRefresh={onRefresh} onSurvey={openSurvey} preview={pv.raffle !== ""} />
      )}
      <div className={s.preview} role="group" aria-label="개발용 화면 미리보기">
        {open && (
          <div className={s.pvPanel}>
            {PV_AXES.map((ax) => (
              <div key={ax.key} className={s.pvRow}>
                <span>{ax.label}</span>
                <div>
                  {ax.options.map(([k, label]) => (
                    <button key={k} type="button" className={k === pv[ax.key] ? s.on : ""} aria-pressed={k === pv[ax.key]} onClick={() => pick(ax.key, k)}>{label}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <button type="button" className={s.pvToggle} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          미리보기{picked.length > 0 ? ` · ${picked.join(" · ")}` : ""}{trying ? " · 설문 연습 중" : ""} {open ? "▾" : "▴"}
        </button>
      </div>
    </>
  );
}

/** 접히는 칸. shut 이면 높이가 0 으로 줄어든다 */
function Fold({ shut, children }: { shut: boolean; children: React.ReactNode }) {
  return <div className={`${s.fold} ${shut ? s.foldShut : ""}`} inert={shut}><div>{children}</div></div>;
}

const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);

/**
 * 입국 완료자의 홈. 핵심은 TV 전광판에 이름이 뜬 것이라, 실제로 떠 있는 동안에는 "전광판을 보세요"가 맨 위에 온다.
 * 추첨은 덤이라 그 아래에 따로 둔다. 당첨되면 당첨 안내(경품·장소·기한·수령 QR)가 맨 위를 차지한다.
 */
function Done({ me, onRefresh, onSurvey, preview }: { me: Me; onRefresh: () => void; onSurvey: () => void; preview?: boolean }) {
  const { t, fmt, rank: rankName, dateTime } = useI18n();
  const h = t.home;
  const p = me.participant;
  const r = me.raffle;
  const round = me.round;
  const masked = me.claims.some((c) => c.prize_type === "mask");
  const rankType = r?.rank ? (`rank${r.rank}` as PrizeType) : null;
  const rankClaimed = rankType ? me.claims.some((c) => c.prize_type === rankType) : false;
  /** 수령 기한이 지나 당첨이 자동 취소됨 */
  const expired = !!r?.expired && !rankClaimed;
  /** 등수 경품은 취소됐어도 마스크팩은 등록자 전원 몫이라 QR 로 받을 수 있다 (안 주면 현장에서 기록 없이 건네 수량이 어긋난다) */
  const expiredMask = expired && !masked;
  const prizeOf = (rank: Rank) => t.prize[`rank${rank}` as const];
  const prize = r?.rank ? prizeOf(r.rank) : "";
  // 결과가 나와도 바로 보여주지 않는다. "결과 보기"를 눌러 상자를 열어야(Reveal) 당첨 여부가 공개된다. 한 번 본 뒤에는 바로 보여준다
  const drawn = !!r?.drawn;
  const [seen, setSeen] = useState(() => !preview && safeGet("local", REVEAL_KEY) === String(p.seq));
  const [revealing, setRevealing] = useState(false);
  const pending = drawn && !seen;
  const won = !!(drawn && seen && r?.rank);
  // 1~3등이 아니면 "마스크팩 당첨"으로 보여준다. 마스크팩도 수량이 한정돼 있어 똑같이 QR 로 확인하고 준다
  const maskWin = !!(drawn && seen && r && !r.rank);
  const maskPrize = t.prize.mask;
  /** "마스크팩 당첨". 예전엔 "4등 당첨"이었는데 등수보다 받는 물건이 바로 읽히게 바꿨다 */
  const maskWinLine = fmt(h.wonBig, { rank: maskPrize });
  /** 오늘이면 시각만, 다른 날이면 날짜까지 */
  const when = (iso: string) => (dayKey(new Date(iso)) === dayKey(new Date()) ? hhmm(iso) : dateTime(iso));

  // 결과가 나오면 바로 알 수 있게: 가벼운 /api/status 만 주기적으로 묻고(무작위 지연),
  // 추첨 버전이 바뀌었을 때만 /api/me 를 다시 부른다. 수령 상태·수령 QR 갱신용으로 4번에 1번은 /api/me 도 부른다.
  // 탭이 숨겨져 있으면 쉬고, 다시 보이면 바로 확인한다.
  useEffect(() => watchDraw(onRefresh), [onRefresh]);
  // 분석: 완료 화면 방문(재방문 관심도) — 그때의 추첨 상태 포함
  const raffleState = !r?.drawn ? "waiting" : r.rank ? "won" : "lost";
  const stateRef = useRef(raffleState);
  stateRef.current = raffleState;
  useEffect(() => trackViews("done", () => ({ raffle: stateRef.current })), []);
  // 분석: 결과 상자를 열어 당첨 결과를 처음 본 순간 (참가자·회차당 1번)
  useEffect(() => {
    if (won || maskWin) trackOnce(`tp_seen_${p.seq}_${r?.round_name ?? ""}`, "result_seen", "done", { rank: r?.rank ?? null });
  }, [won, maskWin, p.seq, r?.round_name, r?.rank]);

  // 전광판에 떠 있는 동안만 /api/me 를 자주 불러 줄 번호를 따라간다. 전광판 줄 수만큼의 사람에게만 해당돼 부하가 작다
  const onBoardNow = me.board != null;
  useEffect(() => {
    if (!onBoardNow) return;
    const id = setInterval(() => { if (document.visibilityState === "visible") onRefresh(); }, BOARD_POLL_MS);
    return () => clearInterval(id);
  }, [onRefresh, onBoardNow]);

  // 추첨 대기 → 결과 나옴 으로 바뀐 순간: 진동 + 탭 제목으로 알림 (당첨 여부는 상자를 열기 전까지 알리지 않는다)
  const prevDrawn = useRef(drawn);
  useEffect(() => {
    if (!prevDrawn.current && drawn) {
      try { navigator.vibrate?.([200, 100, 200]); } catch {}
      document.title = h.revealReady;
    }
    prevDrawn.current = drawn;
  }, [drawn, h]);

  // 발표 전에는 남은 시간이 주인공: 작은 안내 한 줄 + 큰 숫자 + 발표 시각. 숫자를 띄울 목표 시각이 없을 때만 문장 제목을 쓴다
  const future = (iso: string | null | undefined) => (iso && new Date(iso).getTime() > Date.now() ? iso : null);
  const target = r?.drawn || !round ? null : future(round.announce_at) ?? (round.state === "open" ? round.cutoff_at : null);
  let title: string;
  let sub: React.ReactNode;
  if (r?.drawn) {
    title = r.rank ? fmt(t.done.won, { rank: rankName(r.rank), prize }) : maskWinLine;
    sub = !r.rank ? t.done.lostDetail
      : rankClaimed ? <span className="ok">{t.done.prizeClaimed}</span>
      : expired ? h.expiredLine
      : <>{h.wonSub}{round?.claim_until && <> {fmt(h.claimUntil, { time: when(round.claim_until) })}</>}</>;
  } else if (!round) {
    title = h.noRoundTitle;
    sub = h.noRoundSub;
  } else if (target) {
    // 위에 "12:30 발표", 바로 아래 카운트다운
    title = !round.announce_at ? fmt(h.closeAt, { time: when(round.cutoff_at) })
      : fmt(round.state === "drawing" ? h.announceAtDrawing : h.announceAt, { time: when(round.announce_at) });
    sub = null;
  } else {
    title = h.drawingTitle;
    sub = h.drawingSubSoon;
  }

  // 수령 QR 은 발표 후 아직 경품(1~3등 또는 마스크팩)을 안 받았을 때만. 발표 전에 "직원에게 보여주세요"는 뜬금없다
  const showQr = (won && !rankClaimed && !expired) || (won && expiredMask) || (maskWin && !masked);
  const qrUrl = `${typeof window === "undefined" ? "" : window.location.origin}/admin?qr=${me.qr}`;
  const [qrOpen, setQrOpen] = useState(false);
  useEffect(() => {
    if (!qrOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setQrOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [qrOpen]);
  // QR 을 직원에게 보여주는 동안은 자주 확인해서, 수령 처리되는 즉시 QR 화면이 닫히고 "수령 완료"로 바뀌게 한다
  useEffect(() => {
    if (!qrOpen || !showQr) return;
    const id = setInterval(onRefresh, 2000);
    return () => clearInterval(id);
  }, [qrOpen, showQr, onRefresh]);
  const seq4 = String(p.seq).padStart(4, "0");

  const ranks = round && !r?.drawn ? ([1, 2, 3] as Rank[]).filter((k) => round.qty[k] > 0) : [];
  // 1~3등은 현장에 있는 사람만 받게 수령 기한을 짧게 둔다. 추첨 전에 미리 알려야 항의가 없다
  const onsiteMin = round?.claim_until && round.announce_at ? Math.round((Date.parse(round.claim_until) - Date.parse(round.announce_at)) / 60000) : null;
  const onsiteNote = ranks.length > 0 && round?.claim_until && round.state !== "announced" && (
    <p className={s.onsite}>{fmt(h.onsite, { deadline: onsiteMin && onsiteMin > 0 && onsiteMin <= 120 ? fmt(h.onsiteMin, { n: onsiteMin }) : fmt(h.onsiteAt, { time: when(round.claim_until) }) })}</p>
  );
  // 추가 질문: 답하면 당첨 확률 2배. 추첨 2분 전부터는 버튼을 내려서, 시작해 놓고 시간에 쫓겨 못 끝내는 일이 없게 한다.
  // 이미 시작한 사람은 추첨 시각까지 이어서 할 수 있다
  const sv = me.survey;
  const svStarted = sv ? Object.keys(sv.answers).length : 0;
  const svDeadline = sv && !sv.done && !drawn ? (svStarted > 0 ? sv.closes : sv.until) : null;
  const svOpen = !!svDeadline && Date.parse(svDeadline) > Date.now();
  const [, svTick] = useState(0);
  useEffect(() => {
    if (!svOpen || !svDeadline) return;
    // 기한이 되는 순간 버튼이 사라지게 한 번 다시 그린다
    const id = setTimeout(() => svTick((n) => n + 1), Math.min(Date.parse(svDeadline) - Date.now() + 50, 2 ** 31 - 1));
    return () => clearTimeout(id);
  }, [svOpen, svDeadline]);
  const svDoubled = !!sv && !drawn && sv.done;
  const maskNote = masked && <p className="sub ok" style={{ marginTop: "var(--s2)" }}>{t.done.maskClaimed}</p>;
  // 발표 화면은 모집·추첨 중에도 지난 회차 당첨번호를 볼 수 있게 늘 연다. 단 결과가 나왔는데 아직 상자를 안 열었으면(pending) 결과가 미리 보이므로 숨긴다
  const resultsLink = !pending && <a href="/results" className={`btn ghost ${s.cta}`} style={{ display: "block", textAlign: "center", textDecoration: "none" }}>{t.done.results}</a>;

  // 운영 공지: 처음 보는 공지는 팝업, 닫은 뒤에는 경품 아래에 늘 보인다
  const notice = me.notice ?? null;
  const [noticeSeen, setNoticeSeen] = useState(() => safeGet("local", NOTICE_KEY));
  const noticeNew = !!notice && noticeSeen !== notice.at;
  const closeNotice = () => { if (!notice) return; if (!preview) safeSet("local", NOTICE_KEY, notice.at); setNoticeSeen(notice.at); };
  const noticeLine = notice && !noticeNew && (
    <div className={`${s.noticeBox} ${s.rise} ${s.rise2}`}>
      <p className={s.noticeH}>{t.done.notice} · {when(notice.at)}</p>
      <p className={s.noticeText}>{notice.text}</p>
    </div>
  );

  // 전광판 안내는 실제로 TV 에 내 줄이 떠 있는 동안에만 (서버가 알려준다). 추첨 결과가 나오면 그쪽이 먼저라 뺀다
  const onBoard = me.board != null && !drawn;
  // 접히는 동안에도 마지막 줄 번호를 그대로 보여주려고 기억해 둔다
  const lastRow = useRef(me.board ?? 1);
  if (me.board != null) lastRow.current = me.board;

  // 순서: (전광판에 떠 있으면 전광판 안내 | 당첨이면 당첨 안내) → 추첨 안내 → 경품
  return (
    <>
      {/* 결과 공개 연출(Reveal)과 같은 흰 로고. 작게 두어 "전광판을 보세요"보다 앞서지 않게 */}
      <div className={s.homeTop}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/travelpass-white.svg" alt="Travel Pass" />
      </div>
      {/* 뒤에 온 사람들에게 밀려 전광판에서 내려가면 접히면서 사라진다 */}
      <Fold shut={!onBoard}>
        <div className={`${s.board} ${s.rise}`}>
          <h1 className={s.h}>{h.boardTitle}</h1>
          <p className={s.boardName}><NameText name={p.display_name} /></p>
          <p className={s.sub}>{lastRow.current === 1 ? h.boardTop : fmt(h.boardRow, { n: lastRow.current })}</p>
        </div>
      </Fold>

      {won && (
        // 당첨: 등수를 가장 크게 → 할 일 한 줄 → 경품·장소·기한을 항목으로 → QR 버튼
        <div className={`card ${s.hero} ${s.rise}`}>
          <h1 className={s.wonBig}>{fmt(h.wonBig, { rank: rankName(r!.rank!) })}</h1>
          {rankClaimed ? <p className={`${s.wonLine} ok`}>{t.done.prizeClaimed}</p> : <p className={s.wonLine}>{expired ? h.expiredLine : h.wonLine}</p>}
          {expired && <Fold shut={masked}><p className={s.sub}>{h.expiredMask}</p></Fold>}
          {/* 수령하면 장소·기한·QR 버튼은 필요 없어진다. 접어서 아래 내용이 부드럽게 올라오게 한다 */}
          <dl className={s.facts}>
            <div><dt>{h.factPrize}</dt><dd>{prize}</dd></div>
            <Fold shut={rankClaimed || (expired && masked)}><div><dt>{h.factPlace}</dt><dd>{h.factPlaceValue}</dd></div></Fold>
            {round?.claim_until && <Fold shut={rankClaimed}><div><dt>{h.factUntil}</dt><dd>{fmt(h.factUntilValue, { time: when(round.claim_until) })}</dd></div></Fold>}
          </dl>
          <Fold shut={!showQr}>
            <button type="button" className={`btn ${s.cta}`} onClick={() => setQrOpen(true)}>{h.qrButton}</button>
          </Fold>
          {maskNote}
          {resultsLink}
        </div>
      )}

      {maskWin && (
        // 마스크팩 당첨: 등수 당첨과 같은 틀. 수량이 한정이라 "수량" 줄을 더한다
        <div className={`card ${s.hero} ${s.rise}`}>
          <h1 className={s.wonBig}>{maskWinLine}</h1>
          {masked ? <p className={`${s.wonLine} ok`}>{t.done.prizeClaimed}</p> : <p className={s.wonLine}>{h.wonLine}</p>}
          <dl className={s.facts}>
            {/* 제목이 이미 "마스크팩 당첨"이라 경품 줄은 두지 않는다 */}
            <Fold shut={masked}><div><dt>{h.factQty}</dt><dd>{h.factQtyLimited}</dd></div></Fold>
            <Fold shut={masked}><div><dt>{h.factPlace}</dt><dd>{h.factPlaceValue}</dd></div></Fold>
          </dl>
          <Fold shut={!showQr}>
            <button type="button" className={`btn ${s.cta}`} onClick={() => setQrOpen(true)}>{h.qrButton}</button>
          </Fold>
          {resultsLink}
        </div>
      )}

      {!won && !maskWin && (
        <div className={`card ${s.hero} ${s.rise} ${onBoard ? s.underBoard : ""}`}>
          <p className={s.raffleNo}>{h.raffleNo}<b>{seq4}</b>{svDoubled && <span className={s.x2}>{h.surveyApplied}</span>}</p>
          {pending ? (
            <>
              <h1 className={s.h}>{h.revealReady}</h1>
              <button type="button" className={`btn ${s.cta}`} onClick={() => setRevealing(true)}>{h.revealButton}</button>
            </>
          ) : (
            <>
              <h1 className={target ? s.countTitle : s.h}>{title}</h1>
              {target ? <Countdown target={target} /> : <p className={s.sub}>{sub}</p>}
            </>
          )}
          {svOpen && (
            // 남은 시간이 주인공이라 버튼은 가볍게: 테두리만 있는 작은 알약 하나, 설명 줄 없음
            <button type="button" className={s.bonus} onClick={onSurvey}>
              {svStarted > 0 ? fmt(h.surveyResume, { n: svStarted }) : h.surveyCta}
            </button>
          )}
          {/* 추첨 덩어리: 번호 → 남은 시간 → (추가 질문) → 걸린 경품 → 지난 발표 보기. 한 카드 안에서 붙여 둔다 */}
          {ranks.length > 0 && (
            // 경품은 작은 한 줄로. 인원수는 발표 화면에 있다
            <p className={s.prizeLine}>{ranks.map((k) => `${rankName(k)} ${prizeOf(k)}`).join(" · ")}</p>
          )}
          {onsiteNote}
          {maskNote}
          {/* 발표 전에는 누를 일이 드물어서 버튼이 아니라 작은 링크로 둔다 */}
          {!pending && <a href="/results" className={s.quietLink}>{t.done.results}</a>}
        </div>
      )}

      {/* 공지는 추첨 덩어리가 끝난 뒤, 언어 선택과 함께 맨 아래 층에 */}
      {noticeLine}

      {/* TravelPass 웹·앱 링크 (환경변수로 주소가 정해진 것만) */}
      <TpLinks quiet />

      {revealing && r && (
        <Reveal rank={r.rank ?? "mask"} okLabel={h.revealOk} title={h.revealCongrats}
          line={r.rank ? `${rankName(r.rank)} · ${prizeOf(r.rank)}` : maskWinLine}
          onDone={() => { if (!preview) safeSet("local", REVEAL_KEY, String(p.seq)); setSeen(true); setRevealing(false); }} />
      )}

      {noticeNew && !revealing && !qrOpen && (
        <div className={s.noticePop} role="dialog" aria-modal="true" aria-labelledby="notice-h" onClick={closeNotice}>
          <div className={s.noticeCard} onClick={(e) => e.stopPropagation()}>
            <h2 id="notice-h" className={s.noticePopH}>{t.done.notice}</h2>
            <p className={s.noticeText}>{notice!.text}</p>
            <button type="button" className={`btn ${s.cta}`} onClick={closeNotice} autoFocus>{h.revealOk}</button>
          </div>
        </div>
      )}

      {qrOpen && (
        <QrSheet value={qrUrl} label={h.showCode} closeLabel={h.close} noLabel={h.raffleNo} no={seq4}
          caption={won ? (expired ? maskPrize : `${rankName(r!.rank!)} · ${prize}`) : maskWin ? maskWinLine : p.display_name} closing={won ? (expired ? masked : rankClaimed) : maskWin && masked} onClose={() => setQrOpen(false)} />
      )}
    </>
  );
}

// 저장소 접근 자체가 막힌 브라우저(시크릿·웹뷰)에서도 등록은 되어야 한다
type Store = "local" | "session";
const store = (w: Store) => (w === "local" ? window.localStorage : window.sessionStorage);
function safeGet(w: Store, k: string) { try { return store(w).getItem(k); } catch { return null; } }
function safeSet(w: Store, k: string, v: string) { try { store(w).setItem(k, v); } catch {} }
function safeDel(w: Store, k: string) { try { store(w).removeItem(k); } catch {} }
