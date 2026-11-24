import type { NextConfig } from "next";

/**
 * 보안 헤더 (모든 경로).
 * - frame-ancestors 'none' + X-Frame-Options: 다른 사이트가 iframe 으로 운영 콘솔을 덮어 클릭을 훔치는 클릭재킹 차단
 * - nosniff: 응답을 다른 형식(스크립트 등)으로 추측 실행하지 않게
 * - Referrer-Policy: 다른 사이트로 나갈 때 주소(쿼리 포함)를 넘기지 않게 (수령 QR 토큰이 /admin?qr= 로 실림)
 * - Permissions-Policy: 카메라는 같은 사이트만(직원 QR 스캔), 마이크·위치는 사용 안 함
 * 스크립트 출처까지 막는 전체 CSP 는 Next 인라인 스크립트와 맞춰야 해서 이번엔 넣지 않는다
 */
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

/**
 * 백엔드 주소. 이 앱은 화면만 가지고, /api/* 와 /go/* 는 전부 백엔드로 넘긴다 (docs/openapi.yaml).
 * 브라우저는 계속 같은 주소를 부르므로 쿠키(tp_pass · tp_dev · tp_console)는 이 도메인의 것 그대로다.
 */
const BACKEND_URL = (process.env.BACKEND_URL ?? "http://localhost:8080").replace(/\/$/, "");

const nextConfig: NextConfig = {
  // 보드/통계는 전부 클라이언트에서 API 를 폴링하므로 캐시 컴포넌트는 끈다.
  cacheComponents: false,
  // 같은 와이파이의 폰에서 개발 서버(http://<맥 IP>:3000)로 열 때 JS·HMR 요청이 막히지 않게
  allowedDevOrigins: ["10.*.*.*", "192.168.*.*", "172.*.*.*"],
  poweredByHeader: false,
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${BACKEND_URL}/api/:path*` },
      { source: "/go/:path*", destination: `${BACKEND_URL}/go/:path*` },
    ];
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
