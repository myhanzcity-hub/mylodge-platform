# My Lodge · 마이롯지 플랫폼

공유별장 탐색, 소유·비용 안내, 회원 이용, 파트너와 운영 업무를 연결한 **비공개 구현 미리보기**입니다. 실제 계약·결제·등기·송금을 실행하지 않습니다.

## 실행

Windows에서 `start.cmd`를 실행합니다. 기본 Node가 20이면 공식 npm의 Node 22 실행 환경으로 시작합니다. 처음 실행할 때 의존성 설치와 로컬 데이터베이스 준비가 필요할 수 있습니다.

미리보기: `http://127.0.0.1:5173`

Node 22.13 이상이 준비되어 있다면:

```powershell
npm ci
npm run preview:local
```

로컬 `/signin-with-chatgpt`는 스타터가 제공하는 루프백 전용 개발 로그인입니다. 배포 환경에서는 Sites의 실제 로그인을 사용합니다. 개발 로그인은 프로덕션 빌드에 포함되지 않습니다.

## 주요 화면

- `/` 홈, `/lodges` 검색·저장·비교, `/lodges/jumunjin-mint` 별장 상세.
- `/villages/jumunjin`, `/destinations/yangyang`, `/styles` 공간·지역·취향.
- `/ownership`, `/ownership/pricing`, `/ownership/process` 소유·계산·절차.
- `/progress`, `/life`, `/stories`, `/help`, `/consult`, `/partners` 공개 안내.
- `/my` 회원, `/partner` 파트너, `/admin` 운영, `/account` 체험 데이터 관리.

업무 기록은 브라우저 저장소가 아닌 **D1 서버 데이터베이스**에 저장됩니다. 작성 중 양식 초안만 현재 탭의 임시 저장소를 사용합니다. 서로 다른 계정의 업무 데이터는 격리됩니다.

## 기술과 구조

Vinext·React·TypeScript, Cloudflare Worker·D1, Drizzle migration을 사용합니다. Sites의 로그인·배포 통합을 유지합니다.

- `components/home.tsx`: 메인과 취향·공간 투어.
- `components/public-pages.tsx`: 공개 하위 화면·검색·양식.
- `components/workspace.tsx`: 회원·파트너·운영 업무.
- `lib/catalog.ts`: 사업계획 기반 공간·상품·콘텐츠.
- `lib/server/domain.ts`: 상태 전이·재고·원장·금액 검증.
- `lib/server/store.ts`: D1 영속화, CAS와 중복 요청 영수증.
- `app/api/workspace/route.ts`: 인증·입력·요청 출처 검증.
- `drizzle/`: 버전이 있는 스키마 마이그레이션.
- `docs/implementation-status.md`: 설계 대응표·실제 운영 전환 기준.

## 검증 명령

Node 22 이상에서 실행합니다. API·브라우저 테스트는 실행 중인 루프백 서버만 사용하며, 본인의 개발용 체험 데이터를 초기화합니다.

```powershell
npm run check
npm run test:domain
$env:MYLODGE_API_TEST_URL='http://127.0.0.1:5173'
npm run test:api
npx playwright install chromium --only-shell
npm run test:e2e
npm run build
```

브라우저 보고서·캡처는 Git에서 제외한 `outputs/`에 저장됩니다. 로컬 DB와 인증 관련 상태도 `.wrangler/`, `.sites-runtime/` 아래에 있으며 업로드하지 않습니다.

## 자료와 제한

사진·조감도 22개는 사용자가 제공한 사업계획서의 원본 임베드 이미지에서 추출했습니다. 출처 페이지는 `public/images/sources.json`에 기록했습니다. 원본 PDF는 저장소에 복사하지 않았습니다. 명칭·정원·서비스 일부는 화면과 업무 흐름을 이해하기 위한 예시입니다.

Pretendard Variable 1.3.9를 로컬로 제공합니다. SIL Open Font License 1.1은 `public/fonts/LICENSE.txt`에 있습니다.

현재 모든 계약·예약·입금·보상·정산 업무는 **본인에게 격리된 체험 환경**입니다. 실제 운영자 멤버십, 전역 재고, 실회원 교환, 외부 결제·서명·발송과 사업 조건은 운영 전 별도 연결·검증이 필요합니다. 이 경계와 완료 범위는 `docs/implementation-status.md`에서 확인할 수 있습니다.


## Vercel deployment

`npm run build:vercel` builds native Next.js; the original Vinext local/Cloudflare scripts remain available. `vercel.json` selects this build and `MYLODGE_RUNTIME=vercel`.

Vercel uses private Vercel Blob (`BLOB_READ_WRITE_TOKEN`, server only) with per-session aggregate JSON and ETag conditional writes. State and idempotency receipts commit together; conflicting updates retry and the aggregate has a 1.5 MB limit. No records are silently removed. The existing D1 adapter is retained for Cloudflare.

`MYLODGE_PREVIEW_SESSION_SECRET` must be a random server secret. The sign-in entry opens a signed HttpOnly, SameSite=Lax 30-day browser preview session. It is not ChatGPT authentication or a verified identity. Incoming `oai-authenticated-*` headers are ignored on Vercel. Cookies identify an isolated sandbox, not real admin authority. Clearing cookies loses access to that sandbox. Real payments, contracts, rentals and payouts remain disabled.

Deployment secrets belong in Vercel environment variables; never commit `.env*` or `.vercel/`. GitHub/Vercel project: `mylodge-platform`; existing MyLodge presentation projects are separate.
