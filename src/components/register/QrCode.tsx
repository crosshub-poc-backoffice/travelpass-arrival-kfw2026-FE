"use client";

import { useMemo } from "react";
import qrcode from "qrcode-generator";

/** 수령 QR. 어두운 화면에서도 스캔되게 흰 바탕 + 여백(quiet zone)을 둔다 */
export default function QrCode({ value, label, size = 200 }: { value: string; label: string; size?: number | string }) {
  const { n, d } = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    let d = "";
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) d += `M${x} ${y}h1v1h-1z`;
    return { n, d };
  }, [value]);
  const pad = 3;
  return (
    <svg role="img" aria-label={label} viewBox={`${-pad} ${-pad} ${n + pad * 2} ${n + pad * 2}`} shapeRendering="crispEdges" style={{ width: size, height: size, background: "#fff", borderRadius: typeof size === "number" && size < 100 ? 6 : 12, display: "block" }}>
      <path d={d} fill="#111" />
    </svg>
  );
}
