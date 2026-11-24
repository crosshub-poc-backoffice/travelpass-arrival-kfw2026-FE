"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

/** 같은 QR 을 계속 비추고 있어도 한 번만 알린다 */
const SAME_CODE_MS = 4000;
const SCAN_EVERY_MS = 120;
const MAX_SIDE = 720;

interface Detector { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> }

/**
 * 수령 QR 스캐너. 후면 카메라를 계속 켜 두고 QR 이 보이면 바로 onScan 으로 넘긴다.
 * 브라우저에 BarcodeDetector 가 있으면 그걸 쓰고(안드로이드 크롬), 없으면 jsQR 로 직접 읽는다(아이폰 사파리).
 * 카메라는 HTTPS 또는 localhost 에서만 열린다.
 */
export default function Scanner({ onScan }: { onScan: (text: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const cb = useRef(onScan);
  cb.current = onScan;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer = 0;
    let last = { text: "", at: 0 };
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
    let detector: Detector | null = null;
    try { detector = BD ? new BD({ formats: ["qr_code"] }) : null; } catch { detector = null; }

    async function read(v: HTMLVideoElement): Promise<string | null> {
      if (detector) {
        try { return (await detector.detect(v))[0]?.rawValue ?? null; } catch { detector = null; }
      }
      if (!ctx) return null;
      const scale = Math.min(1, MAX_SIDE / Math.max(v.videoWidth, v.videoHeight));
      canvas.width = Math.round(v.videoWidth * scale);
      canvas.height = Math.round(v.videoHeight * scale);
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      return jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data || null;
    }

    async function loop() {
      if (stopped) return;
      const v = video.current;
      if (v && v.readyState >= 2 && v.videoWidth > 0) {
        const text = await read(v).catch(() => null);
        const now = Date.now();
        if (text && !stopped && (text !== last.text || now - last.at > SAME_CODE_MS)) {
          last = { text, at: now };
          try { navigator.vibrate?.(60); } catch {}
          cb.current(text);
        }
      }
      timer = window.setTimeout(loop, SCAN_EVERY_MS);
    }

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(window.isSecureContext ? "이 브라우저에서는 카메라를 쓸 수 없어요. 참여번호로 조회해 주세요." : "카메라는 https 주소에서만 켤 수 있어요. 참여번호로 조회해 주세요.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        const v = video.current!;
        v.srcObject = stream;
        await v.play().catch(() => {});
        loop();
      } catch (e) {
        const name = (e as { name?: string }).name;
        setError(name === "NotAllowedError" ? "카메라 권한이 꺼져 있어요. 브라우저 설정에서 이 사이트의 카메라를 허용해 주세요." : "카메라를 켤 수 없어요. 참여번호로 조회해 주세요.");
      }
    })();

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  if (error) return <div className="alert" style={{ marginBottom: 0 }}>{error}</div>;
  return (
    <div className="scanner">
      <video ref={video} playsInline muted aria-label="수령 QR 스캔 카메라" />
      <i aria-hidden="true" />
    </div>
  );
}
