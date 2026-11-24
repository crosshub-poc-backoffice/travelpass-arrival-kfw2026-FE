"use client";

import { useEffect, useState } from "react";
import type { Rank } from "@/lib/config";
import { LangSwitcher, useI18n } from "./i18n-client";
import { watchDraw } from "@/lib/watch-draw";
import { trackViews } from "@/lib/track";
import TpLinks from "./TpLinks";
import g from "./results.module.css";

interface Winner { rank: Rank; seq: number }
interface RoundResult { id: number; name: string; drawn_at: string; eligible_from_seq: number; eligible_to_seq: number; eligible_count: number; winners: Winner[] }
interface Data { rounds: RoundResult[]; next: { name: string; cutoff_at: string } | null }
/** /api/me: 이 브라우저에 보딩패스 쿠키가 있으면 본인 결과와 내가 속한 회차가 온다 */
interface Me {
  participant: { seq: number; display_name: string } | null;
  raffle: { drawn: boolean; round_name: string | null; rank: Rank | null; expired?: boolean } | null;
  round: { id: number; name: string; state: "open" | "drawing" | "announced"; cutoff_at: string; announce_at: string | null } | null;
}
interface Check { seq: number; drawn: boolean; round_name: string | null; rank: Rank | null; expired?: boolean }

const seq4 = (n: number) => String(n).padStart(4, "0");

export default function Results() {
  const { t, fmt, rank: rankName, dateTime, apiError } = useI18n();
  const [data, setData] = useState<Data | null>(null);
  const [seq, setSeq] = useState("");
  const [check, setCheck] = useState<Check | { error: string } | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const mySeq = me?.participant?.seq ?? null;

  useEffect(() => {
    const load = () => {
      fetch("/api/results").then((r) => (r.ok ? r.json() : null)).then((d) => d && setData(d)).catch(() => {});
      fetch("/api/me", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((m) => m && setMe(m)).catch(() => {});
    };
    load();
    const stopViews = trackViews("results", () => undefined);
    // 추첨 버전이 바뀔 때만 다시 불러온다 (참가자 전원이 열어둬도 DB 부하가 작게)
    const stopWatch = watchDraw(load, 10000);
    return () => { stopViews(); stopWatch(); };
  }, []);

  async function doCheck(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await fetch(`/api/check?seq=${encodeURIComponent(seq)}`, { cache: "no-store" });
      const d = await r.json();
      setCheck(r.ok ? d : { error: apiError(d, t.error.SERVER) });
    } catch {
      setCheck({ error: t.common.network });
    }
  }

  const prizeOf = (r: Rank) => t.prize[`rank${r}` as const];
  /** 추첨 대기 / N등 당첨 / 미당첨 한 줄 */
  const statusLine = (s: { drawn: boolean; round_name: string | null; rank: Rank | null }) =>
    !s.drawn ? t.done.waiting : s.rank ? fmt(t.done.won, { rank: rankName(s.rank), prize: prizeOf(s.rank) }) : t.done.lost;

  // 회차마다 상자 하나. 내 회차를 맨 위에 펼쳐 두고, 다른 회차는 최신순으로 접어 둔다 (등록 안 한 사람에게는 가장 최근 회차를 펼친다)
  const my = me?.participant ? me.round : null;
  const rounds = data?.rounds ?? [];
  const myDrawn = my ? rounds.find((r) => r.id === my.id) ?? null : null;
  const others = rounds.filter((r) => r.id !== my?.id).reverse();
  const openId = my ? my.id : others[0]?.id;
  /** 아직 추첨 전인 내 회차: 언제 마감하고 언제 발표하는지 */
  const myPending = my && !myDrawn
    ? my.state === "open"
      ? [fmt(t.home.closeAt, { time: dateTime(my.cutoff_at) }), my.announce_at && fmt(t.home.announceAt, { time: dateTime(my.announce_at) })].filter(Boolean).join(" · ")
      : my.announce_at ? fmt(t.home.announceAtDrawing, { time: dateTime(my.announce_at) }) : t.home.drawingTitle
    : null;
  // 내 회차가 곧 다음 회차면 아래 "다음 회차" 안내는 같은 말이라 뺀다
  const next = data?.next && data.next.name !== my?.name ? data.next : null;

  const roundBox = (r: RoundResult, mine: boolean) => (
    <details key={r.id} className={`${g.box} ${mine ? g.mineBox : ""}`} open={r.id === openId}>
      <summary>
        {mine && <span className={g.tag}>{t.results.myRound}</span>}
        <span className={g.roundName}>{r.name}</span>
        <span className={g.roundMeta}>{fmt(t.results.eligible, { from: r.eligible_from_seq, to: r.eligible_to_seq, count: r.eligible_count, time: dateTime(r.drawn_at) })}</span>
      </summary>
      {([1, 2, 3] as Rank[]).map((rank) => {
        const ws = r.winners.filter((w) => w.rank === rank);
        if (ws.length === 0) return null; // 배정 0명인 등수는 줄 자체를 안 보여준다
        return (
          <div key={rank} className={g.rank}>
            <div className={g.rankH}>{fmt(t.results.rank, { rank: rankName(rank) })}<small>{prizeOf(rank)} · {fmt(t.results.people, { n: ws.length })}</small></div>
            <div className={`${g.nums} ${rank === 1 ? g.first : ""}`}>
              {ws.map((w) => <span key={w.seq} className={w.seq === mySeq ? g.me : ""}>{seq4(w.seq)}</span>)}
            </div>
          </div>
        );
      })}
    </details>
  );

  return (
    <>
      <div className={g.bar}>
        <a href="/" className={g.back} aria-label={t.lookup.back}>←</a>
      </div>
      {me?.participant ? (
        // 등록한 브라우저: 번호 입력 없이 보딩패스 쿠키로 조회된 내 결과
        <div className={`card ${g.mine}`}>
          <div className={g.label}>{t.home.raffleNo}</div>
          <div className={g.no}>{seq4(me.participant.seq)}</div>
          {/* 미당첨은 완료 화면과 같은 말로: 감사 인사를 크게, 결과는 그 아래 한 줄 */}
          <div className={`${g.head} ${me.raffle?.rank && !me.raffle.expired ? g.win : ""}`}>{me.raffle?.drawn && !me.raffle.rank ? t.home.lostTitle : statusLine(me.raffle ?? { drawn: false, round_name: null, rank: null })}</div>
          {/* 수령 기한이 지나 취소된 당첨에 "받아가세요"를 띄우지 않는다 */}
          {me.raffle?.drawn && <p className={g.body}>{!me.raffle.rank ? t.home.lostLine : me.raffle.expired ? t.home.expiredLine : t.results.wonHint}</p>}
        </div>
      ) : (
        <form className="card" onSubmit={doCheck}>
          <h1 className="title">{t.results.title}</h1>
          <p className="lead">{t.results.lead}</p>
          <div className="toolbar" style={{ marginBottom: 0 }}>
            <input className="input mono" inputMode="numeric" placeholder="0151" value={seq} onChange={(e) => setSeq(e.target.value.replace(/\D/g, ""))} />
            <button className="btn sm" type="submit" disabled={!seq}>{t.results.check}</button>
          </div>
          {check && "error" in check && <div className="alert" style={{ marginTop: 12 }}>{check.error}</div>}
          {check && !("error" in check) && (
            <div>
              <div className={`${g.head} ${check.rank && !check.expired ? g.win : ""}`}>#{check.seq} · {statusLine(check)}</div>
              {check.drawn && <p className={g.body}>{!check.rank ? t.home.lostTitle : check.expired ? t.home.expiredLine : t.results.wonHint}</p>}
            </div>
          )}
        </form>
      )}

      <div className="card">
        <h2 className="sec">{t.results.announce}</h2>
        {!data && <p className="sub">{t.common.loading}</p>}
        <div className={g.boxes}>
          {my && !myDrawn && (
            <div className={`${g.box} ${g.mineBox}`}>
              <span className={g.tag}>{t.results.myRound}</span>
              <span className={g.roundName}>{my.name}</span>
              <span className={g.roundMeta}>{myPending}</span>
            </div>
          )}
          {myDrawn && roundBox(myDrawn, true)}
          {others.map((r) => roundBox(r, false))}
        </div>
        {data && rounds.length === 0 && !my && <p className="sub">{t.results.none}</p>}
        {next && <p className="sub" style={{ marginTop: "var(--s2)" }}>{fmt(t.results.next, { name: next.name, time: dateTime(next.cutoff_at) })}</p>}
      </div>

      <TpLinks asCard />
      <div className={g.lang}><LangSwitcher /></div>
    </>
  );
}
