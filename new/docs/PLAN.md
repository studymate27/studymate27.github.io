# STUDY MATE (그룹 서비스) 기획 문서

> 작성일: 2026-10-11
> 상태: 기획 완료, 구현 전
> 기준 코드: `legacy/` (기존 우리 그룹 전용 사이트)를 `new/`로 복사해 출발점으로 사용

---

## 1. 목표

기존 STUDY MATE는 우리 친구들만을 위한 고정 사이트다 (Supabase 테이블 1개, 로그인 없음, 규칙/디데이 하드코딩).
이를 **누구나 가입해서 그룹을 만들고, 친구를 초대해서 공부 벌점 장부를 운영할 수 있는 서비스**로 확장한다.

- 기존 사이트(`legacy/`)는 그대로 유지하고, 새 서비스(`new/`)는 별도로 개발한다.
- 점수/벌금 계산 로직(`src/domain/scoring.js`, `dates.js`)은 최대한 재사용한다.

---

## 2. 요구사항

### 2.1 회원 / 로그인
| 항목 | 내용 |
|---|---|
| 로그인 방식 | ① 이메일 + 비밀번호, ② 구글 로그인 |
| 아이디 | **실제 사용 중인 이메일**이어야 함 → 가입 시 이메일 인증 필수 |
| 비밀번호 찾기 | 가입 이메일로 재설정 링크 발송 |
| 계정 연결 | 같은 이메일로 이메일 가입 + 구글 로그인 시 동일 계정으로 취급 (Supabase identity linking) |
| 프로필 | 그룹 내 표시 이름(닉네임). 그룹마다 다르게 설정 가능하도록 멤버 테이블에 저장 |

### 2.2 그룹
- **누구나 그룹 생성 가능.** 생성자가 자동으로 방장이 된다.
- **한 사용자는 여러 그룹에 가입 가능.** 로그인 후 그룹 목록 → 그룹 선택 → 해당 그룹 장부 화면.
- **초대 방법**: 초대 코드(짧은 문자열) 또는 초대 링크(`/join/<code>`).
  - 방장은 초대 코드를 재발급(기존 코드 무효화)할 수 있다.
- 그룹 탈퇴 / 방장의 멤버 내보내기.

### 2.3 방장(관리자)
- 기본: 그룹 생성자 = 방장.
- **방장 양도** 가능.
- **방장 여러 명** 지정 가능 (다른 멤버를 방장으로 승격 / 강등).
- 마지막 방장은 탈퇴하거나 강등될 수 없다 (그룹에 방장이 최소 1명 존재해야 함).

### 2.4 기록 수정 권한 (방장이 그룹별로 선택)
| 모드 | 방장 | 일반 멤버 |
|---|---|---|
| **A. 자율 모드** | 모든 멤버 기록 수정 가능 | **본인 기록만** 수정 가능 |
| **B. 방장 관리 모드** | 모든 멤버 기록 수정 가능 | **수정 불가** (조회만) |

- 이 권한은 UI에서 버튼을 숨기는 것만으로 처리하지 않고, **DB 권한 정책(RLS)으로도 강제**한다.
- 대상 기록: 일별 체크(공부시간 / 시작시간 / 상점), Day Off, 요일별 목표 시작시간, 벌금 납부 체크.

### 2.5 그룹 설정 (방장만 수정 가능)
| 설정 | 기존 값 | 비고 |
|---|---|---|
| 최소 공부시간 | 3시간 | 미달 시 -1 |
| 상점 기준 시간 | 7시간 | 달성 시 +1 |
| **상점 사용 여부** | (항상 켜짐) | **끌 수 있어야 함**. 끄면 상점 열/토글 숨김, 점수 계산에서 제외 |
| 벌금 단위 | 500원/점 | |
| 기본 목표 시작시간 | 08:40 | 멤버별 요일 설정의 기본값 |
| **디데이** | 수능 하드코딩 | **최대 3개**, 이름 + 날짜. 방장이 추가/수정/삭제 |

> Day Off 허용 개수: 제한 없음 (§7)

### 2.6 화면 / 기능
- **주간 장부** (기존 화면): 주차 이동, 멤버 카드, 일별 체크, 주간 점수, 이월 점수, 벌금 현황.
- **월간 벌점 현황 (신규)**: 월 선택 → 멤버별
  - 해당 월 벌점 합계 / 상점 합계 / 순점수
  - 벌금 금액 (순점수 × 벌금 단위)
  - 납부 여부
  - (선택) 일자별 히트맵 또는 주차별 요약
- **그룹 관리**: 멤버 목록, 방장 지정/해제, 내보내기, 초대 코드/링크, 그룹 설정.
- **내 그룹 목록**: 가입한 그룹, 새 그룹 만들기, 코드로 참여하기.
- 멤버 카드 순서: 기존에는 localStorage였음 → 그룹 단위로 DB 저장, 방장이 정렬 (§7)

---

## 3. 기술 구성

### 3.1 백엔드: Supabase (새 프로젝트)
- **Auth**: Email/Password (이메일 인증 ON, 비밀번호 재설정), Google OAuth.
- **DB**: Postgres + RLS로 그룹별 데이터 분리와 권한 처리.
- **RPC (Postgres function)**: 그룹 생성, 초대 코드로 가입, 방장 양도처럼 여러 테이블을 한 번에 바꾸는 작업은 `security definer` 함수로 처리.
- 기존 프로젝트(`jgmrktikgxtivsedsvmz`)는 legacy 전용으로 그대로 둔다.

### 3.2 프론트엔드
- **Vite + Vanilla JS + Tailwind v4** (확정)
- 배포: GitHub Actions로 Pages 배포, 새 서비스는 `/app/`. 해시 라우팅(`#/join/<code>`)

---

## 4. 데이터 모델 (안)

기존의 "테이블 1개 + 특수 행(`master_list`, `global_settings`) + 컬럼 용도 변경(`time_done_list`=Day Off, `notes`=요일별 목표시간, `Notes`=JSON 메타)" 구조를 정규화한다.

```
profiles            (사용자 기본 정보)
  id (= auth.users.id) PK
  email
  display_name
  created_at

groups
  id PK
  name
  invite_code UNIQUE
  edit_mode          'self' | 'admin_only'     -- 2.4 권한 모드
  min_study_hours    numeric  default 3
  bonus_enabled      boolean  default true
  bonus_hours        numeric  default 7
  fine_unit          int      default 500
  default_start_time time     default '08:40'
  created_by → profiles.id
  created_at

group_ddays          (그룹당 최대 3개 – 트리거 또는 체크로 제한)
  id PK
  group_id → groups.id
  label              예) "수능"
  target_date        date
  sort_order

group_members
  group_id → groups.id
  user_id  → profiles.id
  role               'admin' | 'member'
  nickname
  sort_order
  joined_at
  start_week         date   -- 점수 계산 시작 주 (기존 master_list 역할)
  PK (group_id, user_id)

member_day_targets   (요일별 목표 시작시간 – 기존 notes "a|b|c|..." 대체)
  group_id, user_id, weekday(0~6), start_time
  PK (group_id, user_id, weekday)

daily_records        (일 단위 기록 – 기존 *_done_list 배열 대체)
  group_id, user_id, date
  study_done   boolean null     -- 공부시간 달성
  start_done   boolean null     -- 시작시간 지킴
  bonus_done   boolean null     -- 상점
  is_day_off   boolean default false
  updated_by → profiles.id
  updated_at
  PK (group_id, user_id, date)

fine_payments        (벌금 납부 – 기존 Notes.finePaid 대체)
  id PK
  group_id, user_id
  settled_through_week  date   -- 이 주까지 정산 완료
  amount                int
  recorded_by → profiles.id
  created_at
```

- 날짜 단위 행(`daily_records`)으로 바꾸면 **월간 집계가 단순한 SQL 집계**로 가능해진다 (기존 주 단위 배열로는 월 경계 처리가 번거로움).
- 기존 점수 규칙(주간 합산, 음수 이월은 0으로 자르기, 상점의 미납 벌금 차감)은 domain 로직에서 그대로 계산한다.

### 4.1 권한 정책 (RLS) 요약
| 테이블 | 조회 | 수정 |
|---|---|---|
| groups | 그룹 멤버 | 방장 |
| group_ddays | 그룹 멤버 | 방장 |
| group_members | 그룹 멤버 | 본인 닉네임은 본인, role/내보내기는 방장 |
| daily_records, member_day_targets | 그룹 멤버 | 방장: 전체 / 멤버: `edit_mode='self'`이고 본인 행일 때만 |
| fine_payments | 그룹 멤버 | 방장 |

- 그룹 가입은 테이블 직접 insert가 아니라 `join_group(invite_code)` RPC로만 가능.
- 방장 수 0명 방지는 DB 트리거로 강제.

---

## 5. 주요 사용자 흐름

1. **가입**: 이메일+비번 입력 → 인증 메일 → 인증 후 로그인 / 또는 구글 로그인
2. **그룹 만들기**: 이름 입력 → 그룹 생성 (본인 방장) → 초대 링크 복사해 공유
3. **초대 받기**: 링크 클릭 → (미로그인 시 로그인/가입 후 복귀) → 그룹 가입 → 닉네임 설정
4. **매일 기록**: 그룹 선택 → 이번 주 장부에서 체크 (권한 모드에 따라 본인 또는 방장이)
5. **정산**: 월간 현황에서 벌금 확인 → 방장이 납부 체크
6. **관리**: 설정 변경, 디데이 관리, 방장 추가/양도, 멤버 내보내기

---

## 6. 개발 단계

[plans/PLAN_group-service.md](plans/PLAN_group-service.md) 참고 (0~6단계).

---

## 7. 결정 사항 (2026-10-11 기본값으로 확정, 만들면서 변경 가능)

| 항목 | 결정 |
|---|---|
| 프론트 스택 | Supabase(새 프로젝트) + Vite + Vanilla JS + Tailwind v4 |
| 배포 | GitHub Actions로 Pages 배포. legacy는 `/` 그대로, 새 서비스는 `/app/` |
| Day Off 규칙 | 제한 없음 (legacy와 동일) |
| 벌금 납부 체크 | 방장만 |
| 카드 정렬 순서 | 그룹 공통, 방장만 변경 |
| legacy 데이터 이전 | 이번 범위 제외 |
| 수정 이력 | `updated_by`만 저장, 표시 안 함 |
| 지난 기록 수정 | 제한 없음 (권한 모드만 적용) |
| 월간 벌금 | 그 달 일별 점수 합, 이월 없음 |

세부 구현 계획: [plans/PLAN_group-service.md](plans/PLAN_group-service.md)
