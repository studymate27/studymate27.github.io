# 구현 계획: STUDY MATE 그룹 서비스

**상태**: 🔄 구현 완료 – 구글 로그인 설정, 화면 수동 확인 대기
**작성일**: 2026-10-11
**최종 수정**: 2026-10-11
**참고 문서**: [요구사항](../PLAN.md) · [화면 구조](../IA.md)

---

**⚠️ 단계마다 지킬 것**
1. ✅ 끝낸 작업 체크박스 표시
2. 🧪 품질 게이트 명령 실행
3. ⚠️ 품질 게이트 항목 전부 통과 확인
4. 📅 위 "최종 수정" 날짜 갱신
5. 📝 아래 "메모" 섹션에 배운 점 기록
6. ➡️ 그다음에 다음 단계로

⛔ **품질 게이트를 건너뛰거나 실패한 채로 다음 단계로 가지 않는다**

---

## 📋 개요

### 무엇을 만드나
우리 그룹 전용인 STUDY MATE(`legacy/`)를, 누구나 가입해서 그룹을 만들고 초대 링크로 친구를 모아 공부 벌점 장부를 운영하는 서비스(`new/`)로 만든다.

### 완료 기준
- [ ] 구글로 가입·로그인할 수 있다 (2026-10-11: 이메일 방식 제외로 변경)
- [ ] 누구나 그룹을 만들고, 초대 링크/코드로 다른 사람을 가입시킬 수 있다
- [ ] 한 사용자가 여러 그룹에 속하고 그룹을 오갈 수 있다
- [ ] 그룹 데이터는 그 그룹 멤버만 볼 수 있다 (DB에서 강제)
- [ ] 수정 권한 모드(자율 / 방장 관리)가 DB에서 강제된다
- [ ] 방장은 규칙(최소시간, 상점 on/off·기준, 벌금 단위, 기본 시작시간), 디데이(최대 3개), 방장 지정·양도를 관리할 수 있다
- [ ] 주간 장부의 점수·벌금 계산이 legacy와 같은 결과를 낸다
- [ ] 월간 현황 탭에서 멤버별 월 벌점·상점·벌금을 볼 수 있다
- [ ] 기존 운영 사이트는 주소와 데이터가 그대로 유지된다

---

## 🧭 기본값으로 정한 항목 (만들면서 바꿀 수 있음)

| 항목 | 결정 |
|---|---|
| 규칙 공개 범위 | 주간 화면 상단에 벌금 단위까지 표시. 관리 탭은 모두에게 보이고 수정 UI만 방장에게 노출 |
| 벌금 납부 체크 | 방장만 |
| 카드 정렬 순서 | 그룹 공통, 방장만 변경 (`group_members.sort_order`) |
| Day Off 횟수 | legacy와 동일하게 제한 없음 (추후 그룹 설정으로 추가 가능) |
| 지난 기록 수정 | 제한 없음 (권한 모드만 적용) |
| 월간 벌금 정의 | 그 달 날짜들의 일별 점수 합(벌점 − 상점). 주간 이월·0 클램프는 적용하지 않음. 벌금 = max(0, 월 벌점 − 월 상점) × 벌금 단위 |
| legacy 데이터 이전 | 이번 범위에서 제외 |
| 수정 이력 | `updated_by`/`updated_at`만 저장, 화면 표시는 없음 |
| 배포 주소 | legacy는 `/` 그대로, 새 서비스는 `/app/` |
| 화면 이동(라우팅) | 해시 라우팅 (`/app/#/join/<code>`) – GitHub Pages에 SPA fallback이 없음 |

---

## 🏗️ 아키텍처 결정

| 결정 | 이유 | 포기하는 것 |
|---|---|---|
| Supabase 유지 (새 프로젝트) | Auth·DB·RLS 기본 제공, 서버 불필요 | 벤더 종속 |
| Vite + Vanilla JS | 기존 코드 방식 유지하면서 파일 분리, Tailwind 정식 빌드, 캐시 버전 자동화 | 프레임워크의 상태 관리 편의 |
| Tailwind v4 (Vite 플러그인) | 기존 클래스 그대로 사용, CDN 런타임 제거 | – |
| 일 단위 기록 테이블 `daily_records` | 월간 집계가 단순해짐, 컬럼 용도 변경 제거 | legacy 배열 구조와 변환 어댑터 필요 |
| 기존 `scoring.js`는 어댑터로 재사용 | 검증된 계산 로직을 그대로 씀 | 어댑터 계층 하나 추가 |
| 권한은 RLS + `security definer` 헬퍼 (`is_member`, `is_admin`, `can_edit_member`) | UI 우회해도 DB에서 차단, RLS 재귀 회피 | SQL 정책 테스트 필요 |
| 여러 테이블 변경은 RPC (`create_group`, `join_group`, `transfer_admin` 등) | 원자적 처리, 직접 insert 차단 | 함수 유지보수 |
| Supabase Auth `flowType: 'pkce'` | 리다이렉트가 `?code=`로 돌아와 해시 라우터와 충돌하지 않음 | – (0~3단계에서 실제 확인) |
| GitHub Actions로 Pages 배포 | legacy(`/`)와 빌드된 new(`/app/`)를 한 사이트로 묶어 배포 | 브랜치 직접 배포 방식에서 변경 |

---

## 📦 준비물

### 사용자가 직접 해야 하는 것 (Claude가 할 수 없음)
- [x] **새 Supabase 프로젝트 생성** → URL·publishable key 전달 (2026-10-11 완료)
- [ ] **Google Cloud Console에서 OAuth 클라이언트 생성** → Supabase Auth에 등록 (3단계 전)
- ~~메일 발송 서비스(SMTP) 연결~~ – 구글 로그인만 쓰기로 해서 필요 없음
- [x] **GitHub 레포 설정 → Pages → Source를 "GitHub Actions"로 변경** (0단계 배포 시)

### 외부 패키지
- vite, @tailwindcss/vite, tailwindcss v4
- @supabase/supabase-js v2
- vitest (단위 테스트)
- supabase CLI (마이그레이션·로컬 DB 테스트, 선택)

---

## 🧪 테스트 전략

| 종류 | 대상 | 목표 |
|---|---|---|
| 단위 테스트 (Vitest) | 점수·이월·벌금·월간 계산, 어댑터, 날짜 유틸, 권한 판단 함수 | 도메인 로직 커버리지 ≥ 90% |
| DB 정책 테스트 | RLS·RPC – 테스트 계정 2개 × 권한 모드 2개 | 금지된 쓰기가 **DB에서** 거부됨 |
| 수동 체크리스트 | 화면(DOM) – 로그인 흐름, 초대, 장부 조작, 모바일 | 단계별 체크리스트 전부 통과 |

UI 코드에는 억지로 커버리지 숫자를 두지 않는다.

```
new/
├── src/
│   ├── domain/          # 순수 계산 로직 (테스트 대상)
│   ├── application/     # 화면 상태, 유스케이스
│   ├── infrastructure/  # supabase 클라이언트, repository
│   └── presentation/    # 화면, 라우터
├── supabase/
│   ├── migrations/      # 스키마·RLS·RPC SQL
│   └── tests/           # 정책 테스트
└── tests/
    └── unit/            # Vitest
```

---

## 🚀 단계별 계획

### 0단계: 기반 공사
**목표**: `new/`가 Vite로 실행·빌드되고, 운영 사이트를 깨지 않는 배포 구성이 준비된다.
**상태**: ✅

**작업**
- [x] 0.1 `new/`에 Vite 프로젝트 구성 (`package.json`, `vite.config.js`의 `base: '/app/'`)
- [x] 0.2 Tailwind v4를 Vite 플러그인으로 전환, `index.html`의 CDN 스크립트 제거
- [x] 0.3 **`new/src/application/settings.js`의 legacy Supabase URL·key 제거** → `import.meta.env.VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY`로 교체, `.env.example` 추가, `.env`는 gitignore
- [x] 0.4 Vitest 설정 + 예시 테스트 1개
- [x] 0.5 GitHub Actions 워크플로: `legacy/` → 사이트 루트, `new/` 빌드 결과 → `/app/`
- [x] 0.6 로컬에서 워크플로와 같은 결과물 폴더를 만들어 legacy 경로(`/index.html`, `/src/...`, `/favicon.svg`)가 그대로인지 확인
- [x] 0.7 위 확인 후에만 `legacy/` 이동 + `new/` 커밋 (push는 사용자 확인 후)

**품질 게이트**
- [x] `npm run build` 성공, `npm test` 통과
- [x] `new/` 코드 어디에도 legacy Supabase URL·key가 없음 (`grep jgmrktikgxtivsedsvmz` 결과 없음)
- [x] 배포 후 기존 주소에서 legacy 사이트가 그대로 동작
- [x] `/app/`에서 빈 앱이 열림

**되돌리기**: 워크플로 파일 삭제 + Pages Source를 브랜치 배포로 복구, `git mv legacy/* .`로 원위치

---

### 1단계: 계산 로직 정리 (TDD)
**목표**: 점수·이월·벌금 계산이 화면 코드와 분리되어 테스트로 보호된다. legacy와 결과가 같다.
**상태**: ✅

**🔴 RED – 테스트 먼저**
- [x] 1.1 legacy 동작 고정 테스트 (`tests/unit/scoring.test.js`, 무작위 비교는 `legacy-parity.test.js`)
  - `dayDelta`: 공부 미달 −1, 시작 실패 −1, 상점 +1, Day Off 0
  - `computeWeekRaw`: 미래 날짜 제외, Day Off 제외
  - `computeScoreChain`: 음수 이월은 0으로
- [x] 1.2 벌금 정산 테스트 (`tests/unit/fines.test.js`) – 지금 `main.js`에 있는 `computeFineState`, `hasPaymentAtOrAfter`, `lastPaymentTimeOnOrBefore`
  - 이후 주에 납부하면 이전 주가 정산 처리됨
  - 마지막 납부 이후 주만 미정산으로 합산
  - 상점이 미납 벌금을 깎음 (최근 커밋 `4756c0d` 동작)
- [x] 1.3 새 기능 테스트
  - 어댑터: `daily_records` 행들 → 7칸 주간 배열 (`study_done_list` 등)
  - `bonusEnabled=false`면 상점이 점수에 반영되지 않음
  - 월간 계산: 두 달에 걸친 주(예: 9/29~10/5)가 월별로 올바르게 나뉨
  - 납부 기록 `settled_through_week`로 legacy의 정산 의미가 재현됨

**🟢 GREEN – 구현**
- [x] 1.4 `main.js`의 벌금 로직을 `src/domain/fines.js`로 추출
- [x] 1.5 `src/domain/record-adapter.js` (일 단위 행 ↔ 주간 배열)
- [x] 1.6 점수 함수에 `bonusEnabled` 파라미터 추가
- [x] 1.7 `src/domain/monthly.js`

**🔵 REFACTOR**
- [x] 1.8 `dates.js`에서 legacy 전용 키(`master_list`, `global_settings`) 의존 제거

**품질 게이트**
- [x] `npm test` 전부 통과, `src/domain/` 커버리지 ≥ 90%
- [x] 같은 입력에서 legacy 함수와 새 함수 결과가 일치하는 비교 테스트 통과

**되돌리기**: 새 domain 파일과 테스트만 삭제 (화면·DB 영향 없음)

---

### 2단계: DB 스키마 + 권한 규칙
**목표**: 새 Supabase 프로젝트에 테이블·RLS·RPC가 올라가고, 권한이 DB에서 강제된다.
**상태**: ✅ | **선행 조건**: 새 Supabase 프로젝트 준비

**🔴 RED – 정책 테스트 먼저** (`supabase/tests/`)
- [x] 2.1 테스트 계정 A(방장), B(멤버), C(외부인) 시나리오
  - C는 그룹 데이터를 조회할 수 없다
  - 자율 모드: B는 자기 `daily_records`만 수정 가능, A의 기록 수정은 거부
  - 방장 관리 모드: B의 모든 기록 수정 거부
  - B는 그룹 설정·디데이·역할 변경 불가
  - 디데이 4번째 추가 거부
  - 마지막 방장 강등·탈퇴 거부
  - 잘못된 초대 코드로 `join_group` 실패, 재발급 후 옛 코드 실패

**🟢 GREEN – 마이그레이션**
- [x] 2.2 테이블: `profiles`, `groups`, `group_ddays`, `group_members`, `member_day_targets`, `daily_records`, `fine_payments` (설계는 [PLAN.md §4](../PLAN.md))
- [x] 2.3 가입 시 `profiles` 자동 생성 트리거
- [x] 2.4 `security definer` 헬퍼: `is_member(gid)`, `is_admin(gid)`, `can_edit_member(gid, uid)`
- [x] 2.5 RLS 정책 (헬퍼 사용 → `group_members` 자기 참조 재귀 방지)
- [x] 2.6 RPC: `create_group`, `join_group`, `regenerate_invite_code`, `set_member_role`, `transfer_admin`, `leave_group`, `remove_member`
- [x] 2.7 제약: 디데이 최대 3개, 방장 최소 1명 (트리거)

**🔵 REFACTOR**
- [x] 2.8 정책 이름·주석 정리, 인덱스 (`daily_records(group_id, date)`)

**품질 게이트**
- [x] 2.1 시나리오 전부 기대대로 통과/거부
- [x] 마이그레이션을 빈 DB에 처음부터 다시 적용해도 성공 (로컬 `supabase db reset`)
- [x] 원격 프로젝트(`fkwqaedrqtaohreiweco`)에 적용 (`supabase db push`, 테이블 7개 RLS 켜짐·anon 조회 권한 없음 확인)

**되돌리기**: 새 프로젝트이므로 마이그레이션 down 또는 DB 리셋 (legacy DB와 무관)

---

### 3단계: 로그인
**목표**: 이메일+비번과 구글로 가입·로그인·로그아웃, 비밀번호 재설정이 동작한다.
**상태**: 🔄 이메일 로그인 완료, 구글·원격 설정 대기 | **선행 조건**: 2단계, 구글 OAuth 클라이언트

**작업**
- [x] 3.1 해시 라우터 (`#/login`, `#/signup`, `#/reset`, `#/groups`, `#/g/<id>/week` …) + 로그인 필요 화면 보호
- [x] 3.2 Supabase 클라이언트 `flowType: 'pkce'`
- [x] 3.3 **비밀번호 재설정부터 구현·확인**: 메일 링크 → 새 비번 입력 화면 → 로그인
- [x] 3.4 회원가입 (이메일 인증 안내 화면), 로그인, 로그아웃
- [ ] 3.5 구글 로그인 (Supabase Redirect URL에 `/app/` 등록)
- [x] 3.6 단위 테스트: 라우트 파싱, 로그인 필요 판단

**수동 체크리스트**
- [x] 새 이메일로 가입 → 인증 메일 → 인증 후 로그인 (로컬 Mailpit, 스크립트 확인)
- [x] 미인증 상태로 로그인 시 안내
- [x] 비번 재설정 메일 → 새 비번으로 로그인 (로컬 Mailpit, 스크립트 확인)
- [ ] 구글 로그인 → 돌아와서 로그인 상태
- [ ] 같은 이메일로 이메일 가입 + 구글 로그인 시 동작 확인 (계정 연결)
- [ ] 로컬(`localhost`)과 배포(`/app/`) 양쪽에서 리다이렉트 정상

**되돌리기**: 인증 화면 모듈 제거 (DB 영향 없음)

---

### 4단계: 그룹 목록·생성·초대
**목표**: 로그인 후 내 그룹 목록에서 그룹을 만들거나 초대로 가입하고, 그룹을 오갈 수 있다.
**상태**: 🔄 구현 완료, 화면 수동 확인 대기

**작업**
- [x] 4.1 내 그룹 목록 화면 (그룹 이름, 내 역할, 멤버 수, 빈 상태)
- [x] 4.2 그룹 만들기 → 초대 링크 복사 화면
- [x] 4.3 코드로 참여
- [x] 4.4 초대 링크 `#/join/<code>`: 미로그인 시 로그인 후 원래 링크로 복귀 → 닉네임 입력 → 가입
- [x] 4.5 그룹 화면 틀: 그룹 이름, 디데이, [주간][월간][관리] 탭
- [x] 4.6 단위 테스트: 로그인 후 복귀 경로 보관, 초대 코드 형식 검사

**수동 체크리스트**
- [ ] 계정 A가 그룹 생성 → 링크를 계정 B로 열어 가입
- [ ] 로그아웃 상태에서 초대 링크 → 가입 → 그룹 화면까지 도착
- [ ] 한 계정이 그룹 2개에 가입하고 목록에서 전환
- [ ] 이미 가입한 그룹의 링크를 다시 열면 그룹 화면으로 이동

**되돌리기**: 그룹 화면 모듈 제거

---

### 5단계: 주간 장부 이식
**목표**: legacy 주간 장부가 새 구조에서 동작하고, 수정 권한 모드가 화면에도 반영된다.
**상태**: 🔄 구현 완료, 화면 수동 확인 대기

**작업**
- [x] 5.1 repository: 주간 `daily_records`·목표 시간·납부 기록 조회/저장
- [x] 5.2 legacy `main.js` 렌더링을 화면 모듈로 분리해서 이식 (멤버 카드, 체크 토글, Day Off, 요일별 시작시간 피커)
- [x] 5.3 상단 규칙 요약 (최소시간, 상점 기준 – 상점 꺼짐이면 숨김, **벌금 단위**)
- [x] 5.4 권한에 따라 수정 버튼 활성/비활성 (`can_edit_member`와 같은 규칙을 domain 함수로 + 단위 테스트)
- [x] 5.5 방장: 납부 체크 (카드 순서 변경은 롱프레스 드래그 대신 6단계 관리 탭의 ↑↓ 버튼으로 – 모바일 오작동 줄이기)
- [x] 5.6 저장 실패 시 화면 되돌리기 + 안내 (RLS 거부 포함)

**수동 체크리스트**
- [ ] 같은 기록을 넣었을 때 legacy와 주간 점수·이월·벌금이 같음
- [ ] 자율 모드: 멤버는 본인 카드만 조작 가능
- [ ] 방장 관리 모드: 멤버는 조회만
- [ ] 상점 끄면 상점 토글이 사라지고 점수에서 빠짐
- [ ] 모바일에서 체크·피커·드래그 정상

**되돌리기**: 장부 모듈을 이전 커밋으로 복구

---

### 6단계: 관리 탭·월간 현황·마무리
**목표**: 방장 관리 기능과 월간 현황이 완성되고, 실제 사용 가능한 상태가 된다.
**상태**: 🔄 구현 완료, 화면 수동 확인 대기

**작업**
- [x] 6.1 관리 탭 (모두): 멤버 목록, 초대 링크 복사, 내 닉네임 변경, 그룹 나가기
- [x] 6.2 관리 탭 (방장): 규칙 설정, 상점 on/off, 디데이 최대 3개, 권한 모드, 방장 지정·해제·양도, 내보내기, 초대 코드 재발급
- [x] 6.3 월간 탭: 월 이동, 멤버별 벌점·상점·순점수·벌금·납부 상태 (`monthly.js` 사용)
- [x] 6.4 내 계정: 비번 변경(이메일 가입자), 로그아웃, 탈퇴
- [x] 6.5 빈 상태·로딩·에러 화면, 모바일 레이아웃 점검
- ~~6.6 SMTP 연결 확인~~ (구글 로그인만 쓰기로 해서 제외)

**수동 체크리스트**
- [ ] 방장 양도 후 이전 방장은 멤버 권한만 가짐
- [ ] 방장 2명일 때 둘 다 설정 변경 가능
- [ ] 디데이 3개 초과 추가 불가 안내
- [ ] 월 경계 주가 있는 달의 월간 수치가 수동 계산과 일치
- [ ] 다른 그룹 데이터가 어디에도 노출되지 않음

**되돌리기**: 탭 단위 모듈로 나뉘어 있어 해당 모듈만 복구

---

## ⚠️ 위험 요소

| 위험 | 가능성 | 영향 | 대응 |
|---|---|---|---|
| `legacy/` 이동이 배포 설정 전에 push되어 운영 사이트 중단 | 중 | 높음 | 0단계 0.5~0.6 확인 전까지 커밋·push 금지 |
| 새 서비스가 legacy Supabase에 연결되어 실데이터 오염 | 중 | 높음 | 0.3에서 키 제거, 품질 게이트에서 grep 확인 |
| 해시 라우팅과 OAuth/메일 리다이렉트 충돌 | 중 | 중 | PKCE 사용, 3단계에서 비번 재설정부터 검증 |
| Supabase 기본 메일 발송량 제한으로 가입·재설정 메일 누락 | 높음 | 중 | 실사용 전 SMTP 연결 |
| RLS 정책 재귀·누락으로 데이터 노출 | 중 | 높음 | definer 헬퍼, 3계정 정책 테스트 |
| legacy와 점수 계산 불일치 | 중 | 중 | 1단계 동작 고정 테스트·비교 테스트 |
| 월 경계 계산 혼동 | 중 | 낮음 | 월간 정의를 문서로 고정, 경계 주 테스트 |

---

## 📊 진행 현황

| 단계 | 상태 |
|---|---|
| 0. 기반 공사 | ✅ |
| 1. 계산 로직 정리 | ✅ |
| 2. DB 스키마 + 권한 | ✅ |
| 3. 로그인 | 🔄 구글·원격 설정 대기 |
| 4. 그룹 목록·생성·초대 | 🔄 수동 확인 대기 |
| 5. 주간 장부 이식 | 🔄 수동 확인 대기 |
| 6. 관리·월간·마무리 | 🔄 수동 확인 대기 |

---

## 📝 메모

(단계를 진행하며 배운 점, 바뀐 결정을 여기에 기록)

### 2026-10-11 – 0·1단계
- **버전**: Vite 8, Tailwind 4, Vitest 4.1.11. Vitest 5는 Node 22 이상이 필요해서 로컬 Node 20에 맞춰 4.1.11로 고정함 (보안 권고 해결된 버전). npm 10.8의 피어 의존성 버그 때문에 `new/.npmrc`에 `legacy-peer-deps=true`를 넣음.
- **새 Supabase**: `studymate-groups` (`fkwqaedrqtaohreiweco`, 서울). 생성 시 "Automatically expose new tables" 끔, "automatic RLS" 켬 → 2단계 마이그레이션에서 테이블 권한(GRANT)을 직접 줘야 함.
- **배포**: `.github/workflows/pages.yml` + `scripts/build-site.sh`. 공개용(publishable) 키는 워크플로 파일에 직접 넣음 (브라우저에 노출되는 값이라 비밀 아님). 로컬에서 조립한 결과물의 legacy 파일 11개가 현재 배포본과 바이트 단위로 같음을 확인함.
- **`new/`의 legacy UI 복사본 삭제**: `main.js`·`pickers.js`·`local-storage.js`는 5단계에서 `legacy/`를 보고 새 구조로 옮김.
- **계산 로직 API 변경**: `computeWeekRaw/ScoreChain/FineState`가 `{ today, bonusEnabled, paidWeekKeys }` 옵션을 받음. `computeScoreChain`의 쓰이지 않던 `name` 인자는 제거.
- **legacy 비교 테스트**: 무작위 멤버 200명 × 14주 기록으로 새 함수와 legacy 함수의 결과가 일치하는지 확인함 (`tests/unit/legacy-parity.test.js`). legacy 벌금 로직은 `tests/fixtures/legacy-fines.js`에 원본 그대로 복사해 둠.
- **배포 확인 (커밋 `7af6333`)**: Pages를 API로 `build_type=workflow`로 전환 후 push. 배포본의 legacy 파일이 `legacy/`와 동일, `/app/` 번들에 새 Supabase ref만 들어 있음 확인.
- **2단계 DB**: `supabase/migrations/20261011000000_group_service.sql`. 로컬 Supabase(Docker)로 개발·검증. 권한 테스트 35개(`npm run test:db`, 로컬 DB 필요 – CI에서는 안 돌림). 권한 함수를 일부러 느슨하게 바꾸면 테스트가 실패하는 것도 확인.
  - 오류는 영문 키(`not_admin`, `last_admin`, `dday_limit`, `invalid_invite_code` …)로 던짐 → 화면에서 한글 안내로 바꿀 것.
  - `profiles`(이메일)는 본인만 조회. 그룹 안에서는 `group_members.nickname`만 노출.
  - 멤버가 나가거나 내보내져도 `daily_records`는 그룹에 남음. 마지막 멤버가 나가면 그룹 삭제.
  - `daily_records`는 PostgREST upsert 때문에 컬럼 제한 없이 UPDATE 권한을 줌 (`updated_by`는 트리거가 덮어씀).
  - Node 20에서 supabase-js가 WebSocket을 요구해서 DB 테스트에 `ws`를 넣음.
- **3단계 로그인**: PKCE + 해시 라우터 조합 확인 – 메일 링크가 `/app/?code=…#/groups` 형태로 돌아오고, 앱이 `?code`를 처리한 뒤 주소에서 지움. 다른 브라우저에서 링크를 열면 코드 교환이 실패하므로 안내 문구로 처리.
  - `npm run dev`는 `.env.development.local`로 로컬 Supabase에 붙음. 로컬 메일은 Mailpit(http://127.0.0.1:54324)에서 확인.
  - 브라우저 자동화 도구에서 로컬 개발 서버 접속이 거부되어 화면은 아직 눈으로 확인하지 못함 → 사용자 확인 필요.
- **원격 Auth 설정 (Management API)**: Site URL `https://studymate27.github.io/app/`, Redirect 허용 `…/app/**`(배포·localhost·127.0.0.1). CLI는 프로젝트 한정 접근 토큰(30일)으로 로그인함 – 작업 끝나면 Supabase 계정 설정에서 삭제할 것.
- **4단계 그룹**: 그룹을 만들면 바로 관리 탭(초대 링크)으로 이동. 초대 코드 입력칸은 코드·링크·링크가 든 문장 모두 받음. 화면 조회 모양은 `tests/db/group-queries.test.js`로 확인.
- **5단계 장부**: 화면 계산은 `src/application/ledger.js`(`buildLedger`, 단위 테스트). 칸을 누르면 화면을 먼저 바꾸고 저장은 순서대로 보냄, 실패 시 서버 상태로 다시 불러오고 안내.
  - 기록은 1000행 단위로 나눠 읽음 (PostgREST 한도). 한 칸만 upsert해도 다른 칸이 유지되는 것 DB 테스트로 확인.
  - 시간 입력 "930"을 legacy는 23:00으로 읽던 문제를 09:30으로 고침.
  - 이 주 월요일보다 늦게 들어온 멤버는 그 주 장부에서 숨김. 나간 멤버의 기록은 남지만 장부에는 안 보임.
- **6단계**: 관리 탭(규칙·상점 on/off·권한 모드·디데이·방장 지정/해제/양도·내보내기·순서 ↑↓·초대 코드 재발급·닉네임·나가기), 월간 탭(그 달 벌점·상점·벌금, 마지막 주까지 정산 기록이 있으면 "정산 완료"), 회원 탈퇴 RPC(`delete_my_account` – 혼자인 그룹은 삭제, 유일한 방장이면 거부).
  - 탈퇴하면 그 사람의 기록도 함께 지워짐 (개인정보 삭제 우선).
- **구글 로그인만 사용 (사용자 결정)**: 이메일 가입·비밀번호 화면은 `import.meta.env.DEV`일 때만 열림(배포 빌드에서 코드째 빠짐 확인). 원격 Supabase의 이메일 가입도 끔(`external_email_enabled=false`). SMTP 준비 불필요.
  - 카톡 등 앱 안 브라우저는 구글이 OAuth를 막으므로 감지해서 외부 브라우저로 안내 (`src/application/in-app-browser.js`). 앱 안 브라우저의 localStorage는 외부 브라우저와 다르므로, 외부로 열 때는 로그인 화면이 아니라 원래 주소(초대 링크)를 연다.
  - 초대 링크 보존: 로그인 전 주소를 localStorage에 24시간 보관하고, 가입·구글 로그인 리다이렉트 주소로도 넘김 (`#/join/…`이 허용 주소 `…/app/**`에 맞는 것 확인).
- **점수 부호**: 음수 = 벌점(낼 벌금), 양수 = 상점 잔액. 주간 이월은 양수만 넘어감.
