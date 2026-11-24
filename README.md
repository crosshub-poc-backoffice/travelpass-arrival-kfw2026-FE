# TravelPass Arrival · 프론트

코리아 핀테크 위크 2026 (11.25–11.27) 부스 포토이벤트 + 경품 추첨 앱의 화면. Next.js 16.
**이 레포는 화면만 가진다.** `/api/*` 와 `/go/*` 는 전부 백엔드(별도 레포, Spring Boot)가 처리하고, 계약은 `docs/openapi.yaml` 이다.

| 화면 | 경로 | 용도 |
| --- | --- | --- |
| 등록 (티켓 QR 목적지) | `/` | 언어 → 지구본에서 출발지 → 휴대폰 → 이메일 → 표시명 → 동의 위저드, 완료 화면 |
| Arrival TV 보드 | `/board` | 16:9 플립보드. 신규 등록 시 플립 + LANDED |
| 당첨 발표 / 내 번호 확인 | `/results` | 회차별 1~3등 번호 |
| 운영 콘솔 | `/admin` | 참가자 · 추첨 · 경품 수령 · 통계 · 로그 |

## 실행

```bash
npm install
BACKEND_URL=http://localhost:8080 npm run dev     # 백엔드를 먼저 띄운다 → http://localhost:3000
```

## 백엔드와 연결되는 방식

- 브라우저는 항상 이 앱과 같은 주소의 `/api/*` · `/go/*` 를 부르고, `next.config.ts` 의 rewrites 가 `BACKEND_URL` 로 넘긴다.
  그래서 쿠키(`tp_pass` 보딩패스 · `tp_dev` 기기 · `tp_console` 콘솔 로그인)는 이 도메인의 것 그대로이고 CORS 는 쓰지 않는다.
- `tp_dev` 쿠키는 이 앱(`src/proxy.ts`)이 페이지를 열 때 심는다. 나머지 쿠키는 백엔드가 심는다.
- 응답 타입은 `src/lib/api-types.ts`. 백엔드 응답 모양이 바뀌면 `docs/openapi.yaml` 과 같이 고친다.
- 입력 검증(`src/lib/validation.ts` · `phone.ts` · `origins.ts` · `glyphs.ts`)은 입력 편의용이고 최종 판단은 백엔드다. 규칙을 바꾸면 백엔드 `Validation.java` 도 같이.

## 환경변수 (`.env.example`)

| 키 | 설명 |
| --- | --- |
| `BACKEND_URL` | 백엔드 주소. 빌드 때 들어가므로 바꾸면 재배포. **배포용 빌드는 이 값이 없으면 실패한다** (주소 없이 배포되면 API 가 전부 죽으므로). 개발 서버는 없으면 `http://localhost:8080` |
| `NEXT_PUBLIC_FLIGHT_PREFIX` / `NEXT_PUBLIC_EVENT_NAME` / `NEXT_PUBLIC_EVENT_DAYS` | 편명 접두사 · 보드 상단 행사명 · 행사일 |
| `NEXT_PUBLIC_TP_WEB_URL` 등 링크 4종 | 완료 화면 링크 버튼 (비우면 숨김) |
| `NEXT_PUBLIC_DONE_PREVIEW` | `1` 이면 완료 화면 아래 미리보기 버튼 (테스트용) |

## 화면 메모

- **다국어**: 방문객 화면은 한·영·중·일 (`src/lib/i18n.ts`). 콘솔·TV 보드는 한국어/영문 고정.
- **TV**: 안드로이드 TV 브라우저에서 `/board` 를 열고 한 번 탭하면 플립 사운드 (`S` 토글, `F` 전체화면).
- **지구본**: 캔버스 2D 도트 지구본, 외부 지도·라이브러리 없음. 출발지를 추가하려면 `origins.ts` · `geo.ts` · `phone.ts` 세 곳 + 백엔드.
- **폴링**: 완료 화면은 `/api/status` 의 `drawVersion` 만 자주 묻고 바뀔 때만 `/api/me` 를 다시 부른다. TV 보드는 `/api/board` 2초 폴링.
