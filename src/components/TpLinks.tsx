"use client";

import { LINK_TARGETS, goHref, type LinkTarget } from "@/lib/links";
import { useI18n } from "./i18n-client";

/**
 * TravelPass 링크 버튼. 환경변수로 주소가 정해진 것만 보인다.
 * /go 를 거쳐 클릭이 기록되고 UTM 이 붙어 이동한다.
 */
export default function TpLinks({ asCard, quiet }: { asCard?: boolean; quiet?: boolean }) {
  const { t } = useI18n();
  const items: { target: LinkTarget; label: string }[] = [
    { target: "tp-web", label: t.done.tpWeb },
    { target: "app-ios", label: t.done.tpIos },
    { target: "app-android", label: t.done.tpAndroid },
    { target: "crosshub", label: t.done.crosshub },
  ];
  const shown = items.filter((x) => LINK_TARGETS[x.target]);
  if (shown.length === 0) return null;
  // quiet: 완료 화면 맨 아래. 버튼이 아니라 작은 글자 링크 한 줄 (추첨 안내보다 앞서지 않게)
  if (quiet) return (
    <div className="tp-links-quiet">
      {shown.map((x) => <a key={x.target} href={goHref(x.target)} rel="noopener" target="_blank">{x.label} ↗</a>)}
    </div>
  );
  const list = (
    <div style={{ display: "grid", gap: 8, marginTop: asCard ? 0 : 12 }}>
      {shown.map((x) => (
        <a key={x.target} href={goHref(x.target)} className="btn ghost" rel="noopener" target="_blank"
          style={{ display: "block", textAlign: "center", textDecoration: "none" }}>
          {x.label} ↗
        </a>
      ))}
    </div>
  );
  return asCard ? <div className="card">{list}</div> : list;
}
