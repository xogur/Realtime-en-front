# 다음 예약 UX 구현 상세 설계

> 대상: 영어 프로그램 이용 종료 후 다음 코쿤 예약
> 확정 흐름: **날짜 선택 → 시간 선택 → 이용 가능한 코쿤 선택 → 예약 확정**
> 3D 기준 자산: `01a06030-4e7f-71b3-8755-ce5731f41d0a` 작업의 `integration-ready`
> 작성일: 2026-09-03

## 1. 구현 결론

이번 구현은 기존 `ReservationEndOverlay`의 날짜 input, 시간 pill, 코쿤 텍스트 버튼을 하나의 단계형 예약 흐름으로 교체한다.

- 날짜는 항상 펼쳐진 월간 달력으로 선택한다.
- 날짜 선택 즉시 시간 단계로 이동한다.
- 시간은 오전/오후 그룹의 카드로 선택한다.
- 시간 선택 후에만 코쿤 공간을 보여 준다.
- 코쿤 선택은 새로 만들지 않고, 기존 작업에 준비된 R3F 3D 선택기를 이식한다.
- 현재 위치, 입구, 선택 가능 여부, 호버, 선택 상태를 3D와 DOM 버튼 양쪽에 동기화한다.
- DOM 전환은 `framer-motion`, 3D 전환은 React Three Fiber의 `useFrame` 감쇠 보간만 사용한다.
- Manim과 Anime.js는 런타임 의존성에 추가하지 않는다.
- 예약 기능은 3D/WebGL이 실패해도 DOM 버튼만으로 끝까지 사용할 수 있어야 한다.

이 문서가 구현 시 단일 기준이다. 기존 `RESERVATION_FOLLOWUP_UX_DESIGN.md`는 시각 방향 참고, `COCOON_3D_BOOKING_DEMO_DESIGN.md`는 3D 조사 기록으로 취급한다.

시각 검증 기준:

- 전체 단계 흐름: `C:\Users\searle5080\.gstack\projects\Realtime-en-front\designs\reservation-followup-demo-20260903\finalized.html`
- 코쿤 공간·입구·하이라이트: `C:\Users\searle5080\.codex\visualizations\2026\09\02\01a06030-4e7f-71b3-8755-ce5731f41d0a\cocoon-3d-highlight-demo.html`

## 2. 재사용할 기존 자산

아래 준비본을 운영 코드로 옮긴 뒤 필요한 부분만 수정한다. 3D 장면을 다시 모델링하지 않는다.

```text
C:\Users\searle5080\.codex\visualizations\2026\09\02\
01a06030-4e7f-71b3-8755-ce5731f41d0a\integration-ready\
├─ CocoonSelector.tsx
├─ CocoonSceneCanvas.tsx
├─ CocoonScene.tsx
└─ cocoonSceneModel.ts
```

준비본에서 그대로 유지할 것:

- 조감도 전면 왼쪽의 입구와 호박색 진입 화살표
- U자형 벽, 후면 창, 왼쪽부터 코쿤 1·2·3·4 배치
- 현재 위치의 청록 링과 라벨
- 버튼과 3D 모델의 양방향 hover/focus/select
- 선택 불가 코쿤의 위치 유지와 저채도 처리
- 고정 카메라, 자유 회전/확대 금지
- `dpr={[1, 1.5]}`, 제한된 그림자, 동적 import
- reduced-motion 대응과 WebGL 오류 경계

통합하면서 수정할 것:

- `CocoonSelector`의 독립 카드 헤더를 예약 3단계 제목과 합쳐 중복 제목 제거
- Canvas를 스크린리더의 중복 조작 대상으로 만들지 않고 DOM 버튼을 접근성 기준 UI로 지정
- `webglcontextlost`를 감지해 정적 대체 화면으로 전환
- 제출 중 선택기 전체 잠금과 진행 링 상태 추가
- 색상 토큰을 예약 화면 공통 토큰으로 연결

## 3. 확인된 현재 상태

| 영역 | 현재 동작 | 구현에서 바꿀 점 |
|---|---|---|
| 날짜 | `input type="date"` | 월간 달력 |
| 이용 시간 | 30/60분 `<select>` | segmented control |
| 시간 | 가능한 슬롯만 작은 pill로 나열 | 오전/오후 카드, 종료 시각과 가용 코쿤 수 표시 |
| 코쿤 | 서버가 준 방만 텍스트 버튼으로 표시 | 코쿤 1~4 전체 공간 + 가능 상태 + 기존 3D 선택기 |
| 데이터 조회 | 날짜·이용 시간 변경 때 하루 가용성 조회 | 월 요약 조회 + 선택 날짜 상세 조회 |
| 예약 성공 | POST 응답을 버리고 polling 대기 | POST 응답으로 즉시 세션 갱신 |
| 방 번호 | 백엔드가 `A02→2 ... A05→5`, SQL도 2~5 | 운영 기준 `A02→1 ... A05→4`로 단일화 |
| 3D | 운영 코드 없음 | 준비된 R3F 선택기 이식 |

관련 현재 코드:

- `src/features/reservationFollowup/ReservationEndOverlay.tsx:30-41`: 화면과 요청 상태가 한 컴포넌트에 혼재
- `src/features/reservationFollowup/ReservationEndOverlay.tsx:100-128`: 날짜별 가용성 요청
- `src/features/reservationFollowup/ReservationEndOverlay.tsx:277-317`: 현재 텍스트 중심 예약 UI
- `src/features/reservationFollowup/types.ts:24-36`: 기존 일별 가용성 타입
- `../Realtime-en-back/code/reservation_followup/service.py:213-260`: 일별 슬롯 계산
- `../Realtime-en-back/code/reservation_followup/repository.py:397-473`: 일별 가용성 DB 조회
- `../Realtime-en-back/code/reservation_followup/repository.py:439-440`: 코쿤 2~5 제한

## 4. 번호 계약을 먼저 고정한다

운영 화면과 3D 공간의 번호는 왼쪽부터 `1, 2, 3, 4`다. 키오스크 식별자는 바꾸지 않는다.

```py
KIOSK_ROOM_MAP = {
    "A02": 1,
    "A03": 2,
    "A04": 3,
    "A05": 4,
}

COCOON_ROOM_NUMBERS = (1, 2, 3, 4)
```

중복된 `SUPPORTED_KIOSKS` 상수는 새 파일 `Realtime-en-back/code/reservation_rooms.py`로 옮기고 `reservation_intro`와 `reservation_followup`이 함께 import한다. 키오스크 ID에서 문자열 숫자를 잘라 방 번호를 계산하지 않는다.

현재 `reservation_followup/repository.py:375`의 참가자 이름 저장 경로가 `int(kiosk_id[-2:])`로 방 번호를 추측한다. 이 로직도 반드시 제거한다. repository protocol의 `set_participant_name`에 `room_number` 인자를 추가하고, service가 `KIOSK_ROOM_MAP[kiosk_id]`를 명시적으로 전달한다. 이 지점을 바꾸지 않으면 A02를 코쿤 1로 전환한 뒤 게스트 이름 저장이 실패한다.

구현 전 DB 확인 쿼리:

```sql
SELECT id, room_number
FROM Cocoon_Room
ORDER BY room_number;
```

판정:

- 결과가 1~4면 코드와 쿼리 범위만 변경한다.
- 결과가 2~5면 프런트 구현보다 먼저 운영 데이터 변경 계획을 승인받는다.
- `Cocoon_Reservation`은 `room_id` FK를 사용하므로 방 번호 수정 때 예약 FK는 바꾸지 않는다.
- 과거 로그처럼 방 번호를 값으로 복제한 테이블은 별도로 조사한다. 과거 표시를 보존할지 물리 번호에 맞출지 결정 없이 일괄 수정하지 않는다.

세션 응답에는 현재 방 번호를 명시한다.

```json
{
  "reservationId": 154,
  "kioskId": "A02",
  "currentRoomNumber": 1,
  "status": "ended"
}
```

`currentRoomNumber`는 백엔드 `UsageSession.room_number`에서 직렬화한다. 프런트가 `kioskId`를 해석하지 않는다.

## 5. 최종 사용자 흐름

```text
이용 종료 선택 화면
  └─ 다음 예약 일정 잡기
      └─ 1. 날짜
          └─ 2. 시간
              └─ 3. 코쿤
                  └─ 예약 확인 중
                      ├─ 성공 → 완료 화면 → 10초 후 메인
                      └─ 충돌 → 최신 가용성 재조회 → 시간 또는 코쿤 재선택
```

### 단계 이동 규칙

| 사용자 행동 | 유지 | 초기화 | 이동 |
|---|---|---|---|
| 날짜 선택 | duration | slot, room | 시간 |
| 날짜 수정 | duration | slot, room, 일별 가용성 | 날짜 선택 후 시간 |
| 30/60분 변경 | date | slot, room | 시간 유지, 달력·일별 데이터 재조회 |
| 시간 선택 | date, duration | room | 코쿤 |
| 시간 수정 | date, duration | room | 코쿤으로 다시 이동 |
| 코쿤 선택 | date, duration, slot | 없음 | 코쿤 유지, CTA 활성 |
| 이전 단계 리본 선택 | 앞 단계 선택 | 그 뒤 단계 선택 | 선택한 단계 |
| 예약 충돌 | date, duration | stale room, 필요 시 stale slot | 최신 결과에 따라 시간 또는 코쿤 |

날짜와 시간은 선택 즉시 다음 단계로 이동한다. 별도 `다음` 버튼은 두지 않는다. 코쿤 선택만 마지막 예약 CTA를 눌러 확정한다.

## 6. 화면 구조

### 공통 프레임

```text
┌───────────────────────────────────────────────────────────────┐
│ 다음 예약을 잡아볼까요?                      이용 마치기      │
│ ① 날짜 ───────── ② 시간 ───────── ③ 코쿤                   │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│                    현재 단계 콘텐츠                           │
│                                                               │
├───────────────────────────────────────────────────────────────┤
│ 선택 요약                                      최종 CTA        │
└───────────────────────────────────────────────────────────────┘
```

- 예약 모드 최대 너비: `1120px`
- 최대 높이: `92dvh`
- 배경: `#FBF8F4`
- 패널: 흰색 또는 `#F5F1EB`
- 바깥 radius: `32px`
- 데스크톱 안쪽 패딩: `40px`, 태블릿 `28px`, 모바일 `20px`
- 모바일 767px 이하는 전체 화면 시트로 바꾸고 상단 스테퍼와 하단 CTA를 sticky 처리한다.

### 공통 토큰

```css
--booking-canvas: #EEEAE4;
--booking-surface: #FBF8F4;
--booking-raised: #FFFFFF;
--booking-ink: #15243A;
--booking-muted: #6E6A63;
--booking-line: #DED8CF;
--booking-primary: #2155D9;
--booking-primary-hover: #1746BE;
--booking-primary-soft: #E8EEFF;
--booking-current: #22A9B8;
--booking-entry: #E5A21A;
--booking-success: #16815D;
--booking-warning: #A96112;
--booking-danger: #C43D3D;
--booking-disabled: #C9C5BF;
```

폰트는 프로젝트의 기존 한국어 폰트를 유지한다. 날짜와 시간에는 `font-variant-numeric: tabular-nums`를 적용한다.

## 7. 1단계: 월간 달력

### 표시 규칙

- 오늘부터 `add_one_calendar_month(today)`까지 선택 가능하다.
- 범위가 두 달에 걸치면 월 이전/다음 버튼으로 전환한다.
- 범위 밖 날짜도 월 형태 유지를 위해 보이지만 disabled 처리한다.
- 각 날짜에는 숫자와 상태 한 줄만 표시한다.
- 날짜 셀 최소 크기: 키오스크 `56×56px`, 모바일 `44×44px`.

| 상태 | 문구 | 표현 | 선택 |
|---|---|---|---|
| available | `N개 시간` | 중립 배경 + 녹색 점 | 가능 |
| limited | `N개 남음` | 옅은 호박색 + 호박색 점 | 가능 |
| full | `마감` | 저채도 + 자물쇠 | 불가 |
| closed | `휴관` | 사선 패턴 | 불가 |
| loading | skeleton | 두 줄 skeleton | 불가 |
| selected | 실제 상태 문구 유지 | 코발트 배경 + 체크 | 가능 |

`limited` 판정은 서버에서 `availableSlotCount`가 1~2이면 사용한다. 3개 이상이면 `available`, 0개면 `full`이다. 휴관 규칙이 있으면 슬롯 수보다 `closed`가 우선한다.

### 달력 키보드 동작

- 좌/우: 하루 이동
- 위/아래: 7일 이동
- Home/End: 해당 주의 시작/끝
- PageUp/PageDown: 이전/다음 월
- Enter/Space: 선택
- disabled 날짜로 이동할 수는 있지만 Enter/Space로 선택할 수 없다.

날짜 문자열은 `YYYY-MM-DD`를 도메인 값으로 유지한다. `new Date('YYYY-MM-DD')`를 직접 포맷하지 않고 로컬 날짜 helper를 사용해 UTC 날짜 밀림을 막는다.

## 8. 2단계: 시간 선택

상단에는 완료된 날짜 리본과 30/60분 segmented control을 둔다.

```text
[✓ 9월 8일 화요일]                   이용 시간 [30분] [60분]

오전
[10:30 → 11:00 · 코쿤 3개] [11:00 → 11:30 · 1개 남음]

오후
[13:30 → 14:00 · 코쿤 4개] [14:00 → 14:30 · 마감]
```

시간 카드는 다음을 항상 보여 준다.

- 시작 시간
- 명목 종료 시간
- 예약 가능한 코쿤 수 또는 불가 사유
- 선택 체크

서버가 반환하는 `full`, `blocked` 슬롯도 숨기지 않는다. 운영 시간의 문맥을 보여 주되 선택은 막는다. 이미 지난 슬롯은 오늘 날짜에서만 응답에서 제외한다.

| status | 카드 상태 | 문구 |
|---|---|---|
| available | 활성 | `코쿤 N개` 또는 `1개 남음` |
| full | disabled | `예약 마감` |
| blocked | disabled | `강의 시간` |

30분/60분을 바꾸면 시간·코쿤 선택을 초기화하고 월 요약과 선택 날짜 상세를 병렬 재조회한다. 기존 시간 목록은 즉시 제거하지 않고 55% opacity와 상단 progress bar로 갱신 중임을 표시한다.

## 9. 3단계: 기존 코쿤 3D 선택기

데스크톱과 키오스크는 왼쪽 정보 34%, 오른쪽 3D 66% 2단 구성이다. 1023px 이하는 3D 위, 방 버튼 아래의 세로 구성이다.

```text
┌───────────────────────┬──────────────────────────────────────┐
│ ✓ 9월 8일 화요일      │ 후면 창                              │
│ ✓ 14:30–15:00         │ [코쿤1] [코쿤2] [코쿤3] [코쿤4]    │
│                       │                                      │
│ 어느 코쿤을 이용할까요│  현재 위치 링         선택 링        │
│ [1] [2] [3] [4]       │                                      │
│                       │ 입구 ↑                               │
│ [이 일정으로 예약]    │                                      │
└───────────────────────┴──────────────────────────────────────┘
```

### 3D 상태 우선순위

각 상태는 덮어쓰지 않고 병존한다.

1. 예약 불가: 상호작용 차단
2. 현재 위치: 청록 바닥 링을 항상 유지
3. 선택: 진한 코발트 외곽선과 체크 유지
4. hover/focus preview: 해당 코쿤만 밝은 파랑과 상승 효과

현재 코쿤 2에서 코쿤 4를 hover하면 2번의 청록 현재 위치 링은 남고 4번이 떠오른다. 이미 3번을 선택한 뒤 4번을 hover해도 3번 선택 링은 유지한다.

### 모션 수치

| 이벤트 | 시간/감쇠 | 값 |
|---|---:|---|
| 단계 패널 진입 | 320ms ease-out | opacity 0→1, y 16→0 |
| 날짜 선택 표시 이동 | 180ms | `layoutId` 배경 이동 |
| 시간 선택 표시 이동 | 180ms | `layoutId` 외곽선 이동 |
| 3D 장면 진입 | 500ms | opacity 0→1, scale .985→1 |
| 현재 위치 링 | 1800ms sine | opacity .32↔.48 |
| 코쿤 hover | damping 11 | y +0.105, scale 1.032 |
| 코쿤 selected | damping 11 | y +0.07, scale 1.022 |
| 선택 카메라 bias | damping 4.5 | x 최대 약 0.2, 자유 이동 없음 |
| 예약 성공 | 650ms | 선택 링 고정 → 체크 → 완료 화면 |

reduced-motion에서는 반복 pulse, y 이동, scale, 카메라 bias를 없애고 120ms 색/외곽선 전환만 유지한다.

## 10. 프런트 상태 모델

예약 흐름은 `useReducer`로 관리한다. 네 개 이상의 서로 의존하는 `useState`를 계속 추가하지 않는다.

```ts
type BookingStep = 'date' | 'time' | 'cocoon';
type RequestState = 'idle' | 'loading' | 'refreshing' | 'error';

type BookingState = {
  step: BookingStep;
  visibleMonth: string;              // YYYY-MM
  date: string | null;               // YYYY-MM-DD
  durationMinutes: 30 | 60;
  slot: AvailabilitySlotV2 | null;
  room: AvailableRoom | null;
  calendar: AvailabilityCalendar | null;
  day: AvailabilityV2 | null;
  calendarRequest: RequestState;
  dayRequest: RequestState;
  submitting: boolean;
  error: null | {
    scope: 'calendar' | 'time' | 'room' | 'submit';
    message: string;
  };
};
```

핵심 reducer event:

```ts
type BookingEvent =
  | { type: 'DATE_SELECTED'; date: string }
  | { type: 'DURATION_CHANGED'; durationMinutes: 30 | 60 }
  | { type: 'SLOT_SELECTED'; slot: AvailabilitySlotV2 }
  | { type: 'ROOM_SELECTED'; room: AvailableRoom }
  | { type: 'STEP_REOPENED'; step: BookingStep }
  | { type: 'CALENDAR_REQUESTED'; refreshing: boolean }
  | { type: 'CALENDAR_RECEIVED'; payload: AvailabilityCalendar }
  | { type: 'DAY_REQUESTED'; refreshing: boolean }
  | { type: 'DAY_RECEIVED'; payload: AvailabilityV2 }
  | { type: 'REQUEST_FAILED'; scope: BookingState['error']['scope']; message: string }
  | { type: 'SUBMIT_STARTED' }
  | { type: 'SUBMIT_CONFLICT'; payload: AvailabilityV2 }
  | { type: 'RESET' };
```

`BookingState['error']['scope']`는 실제 TypeScript에서는 별도 `BookingErrorScope` 타입으로 선언해 null 인덱싱 문제를 피한다.

### 요청 경쟁 방지

- 달력 요청과 일별 요청은 각각 별도의 `AbortController`를 가진다.
- 날짜 또는 duration이 바뀌면 이전 요청을 abort한다.
- abort된 요청의 `finally`가 최신 요청의 loading 상태를 해제하지 않도록 요청 sequence 번호를 비교한다.
- 같은 `reservationId + from + to + duration` 달력 결과는 컴포넌트 생존 동안 메모리 캐시한다.
- 서버 응답은 항상 최종 권위다. 프런트에서 가용 방을 추론하지 않는다.

## 11. 프런트 컴포넌트 구조

```text
ReservationEndOverlay
├─ ReservationEndChoices
├─ FollowupBookingFlow
│  ├─ BookingStepper
│  ├─ BookingSelectionRibbon
│  ├─ BookingCalendar
│  ├─ BookingDurationToggle
│  ├─ TimeSlotPicker
│  ├─ CocoonSelector                 ← 기존 준비본 이식
│  │  └─ CocoonSceneCanvas
│  │     └─ CocoonScene
│  ├─ BookingSummary
│  └─ BookingError
└─ ReservationBookedResult
```

책임:

- `ReservationEndOverlay`: ended/booked/dismissed 분기와 전체 모달만 담당
- `FollowupBookingFlow`: reducer, 조회 hook, 제출 조율
- `BookingCalendar`: 날짜 표현과 키보드 탐색만 담당
- `TimeSlotPicker`: 시간 그룹과 선택만 담당
- `CocoonSelector`: 방 상태 표현과 선택 이벤트만 담당, API를 모름
- `useFollowupAvailability`: 달력/일별 fetch, abort, normalize, retry 담당
- `useReservationFollowup`: 세션 polling과 예약 성공 세션 갱신 담당

## 12. 프런트 타입과 API 함수

```ts
export type CocoonNumber = 1 | 2 | 3 | 4;
export type DurationMinutes = 30 | 60;

export type UsageSession = {
  // 기존 필드 유지
  currentRoomNumber: CocoonNumber;
};

export type AvailabilityDay = {
  date: string;
  status: 'available' | 'limited' | 'full' | 'closed';
  availableSlotCount: number;
  message: string | null;
};

export type AvailabilityCalendar = {
  from: string;
  to: string;
  durationMinutes: DurationMinutes;
  days: AvailabilityDay[];
};

export type AvailabilitySlotV2 = {
  startTime: string;
  nominalEndTime: string;
  status: 'available' | 'full' | 'blocked';
  unavailableReason: string | null;
  availableRooms: AvailableRoom[];
};

export type AvailabilityV2 = {
  date: string;
  durationMinutes: DurationMinutes;
  closed: boolean;
  message: string | null;
  slots: AvailabilitySlotV2[];
};
```

API 호출은 `reservationFollowupApi.ts`에 모은다.

```ts
getAvailabilityCalendar(kioskId, from, to, durationMinutes, signal)
getDayAvailability(kioskId, date, durationMinutes, { includeUnavailable: true }, signal)
createFollowupReservation(kioskId, request, signal)
```

## 13. 백엔드 API 계약

### 월/범위 요약

```http
GET /api/kiosks/{kioskId}/reservation-session/availability-calendar
  ?from=2026-09-03
  &to=2026-10-03
  &durationMinutes=30
```

```json
{
  "from": "2026-09-03",
  "to": "2026-10-03",
  "durationMinutes": 30,
  "days": [
    {
      "date": "2026-09-08",
      "status": "available",
      "availableSlotCount": 6,
      "message": null
    },
    {
      "date": "2026-09-09",
      "status": "closed",
      "availableSlotCount": 0,
      "message": "휴관일"
    }
  ]
}
```

검증 규칙:

- `from <= to`
- 범위 최대 32일
- 전체 범위가 오늘부터 한 달 이내
- duration은 30 또는 60
- ended usage 검증은 기존 일별 API와 동일
- `days`는 from~to의 모든 날짜를 오름차순으로 한 번씩 반환

### 일별 상세

기존 endpoint를 유지하고 additive query를 추가한다.

```http
GET /api/kiosks/{kioskId}/reservation-session/availability
  ?date=2026-09-08
  &durationMinutes=30
  &includeUnavailable=true
```

`includeUnavailable=false` 기본값은 기존 동작을 유지한다. true일 때 미래 운영 슬롯을 전부 반환하고 `status`를 붙인다.

```json
{
  "date": "2026-09-08",
  "durationMinutes": 30,
  "closed": false,
  "message": null,
  "slots": [
    {
      "startTime": "14:00",
      "nominalEndTime": "14:30",
      "status": "available",
      "unavailableReason": null,
      "availableRooms": [
        { "roomId": 17, "roomNumber": 1 },
        { "roomId": 19, "roomNumber": 3 }
      ]
    },
    {
      "startTime": "14:30",
      "nominalEndTime": "15:00",
      "status": "full",
      "unavailableReason": "예약 마감",
      "availableRooms": []
    }
  ]
}
```

### 성능을 위한 범위 조회

달력 API에서 날짜마다 `availability_facts()`를 호출하지 않는다. 최대 32일을 한 번의 snapshot으로 계산할 수 있는 repository method를 추가한다.

```py
@dataclass(frozen=True)
class AvailabilityRangeFacts:
    regular_closed_days: tuple[tuple[int, str | None], ...]
    special_closed_dates: tuple[tuple[date, str | None], ...]
    programs: tuple[tuple[str, datetime, datetime], ...]
    rooms: tuple[Room, ...]
    reservations: tuple[tuple[int, datetime, datetime], ...]

async def availability_range_facts(
    self,
    start_date: date,
    end_date: date,
) -> AvailabilityRangeFacts: ...
```

한 요청에서 다음 5종 조회만 수행한다.

1. 활성 정기 휴관 요일
2. 범위 내 특별 휴관일
3. 범위와 겹치는 프로그램
4. 코쿤 1~4
5. 범위와 겹치는 RESERVED/USING 예약

서비스는 기존 `slots_for_date`, `program_blocks` 규칙을 재사용한다. 오늘은 지난 슬롯을 빼고, 이후 날짜는 전체 운영 슬롯을 계산한다.

## 14. 예약 제출과 충돌 복구

POST body는 기존 계약을 유지한다.

```json
{
  "reservationId": 154,
  "date": "2026-09-08",
  "startTime": "14:00",
  "durationMinutes": 30,
  "roomId": 17
}
```

변경점은 성공 응답을 버리지 않는 것이다. `useReservationFollowup.createFollowup()`이 POST를 소유하고 응답 `UsageSession`을 즉시 `updateSession()`에 넣는다. 이로써 최대 2초 polling 대기 없이 완료 화면을 표시한다.

오류별 처리:

| HTTP | 처리 |
|---|---|
| 409 | 일별 상세 재조회, room 초기화. 같은 slot이 여전히 available이면 코쿤 단계, 아니면 slot도 초기화하고 시간 단계 |
| 422 | 서버 message를 현재 단계에 표시. 날짜/시간 정책 오류면 해당 단계로 복귀 |
| 503/network | 선택 유지, CTA 재활성, `다시 시도` 제공 |
| AbortError | 사용자에게 표시하지 않음 |

중복 클릭은 `submitting`과 ref guard 양쪽에서 막는다. 서버의 기존 idempotent 동작은 그대로 유지한다.

## 15. 로딩·빈 상태·오류 상태

### 달력

- 최초: 날짜 셀 skeleton
- 새로고침: 기존 데이터 유지 + 상단 progress bar
- 실패: 달력 내부 오류 카드 + `다시 불러오기`

### 시간

- 날짜 선택 직후: 카드 skeleton 6개
- 슬롯 0개: `이 날짜는 예약 가능한 시간이 없어요` + `다른 날짜 보기`
- 마감/강의 슬롯: 위치를 유지한 disabled 카드

### 코쿤

- 시간 선택 전: 마운트하지 않음
- WebGL 로딩: 동일 높이의 따뜻한 배경 skeleton
- WebGL/컨텍스트 실패: 정적 공간 안내 + DOM 방 버튼 유지
- 가용 방 0개: 이론상 full slot이므로 코쿤 단계로 진입시키지 않음

## 16. 접근성

- 모달은 `role="dialog"`, `aria-modal="true"`, 제목과 연결한다.
- 단계 변경 시 제목에 focus를 이동하지 않고 `aria-live="polite"`로 변화를 알린다. 키오스크 터치 흐름의 포커스 점프를 방지한다.
- 스테퍼의 완료 단계는 button으로 제공하고 아직 도달하지 않은 단계는 button이 아니다.
- 달력은 WAI-ARIA grid 패턴을 사용하되 모든 날짜 셀에 과도한 문장을 넣지 않는다.
- 시간과 코쿤 버튼은 최소 44px, 키오스크에서는 52px 이상이다.
- Canvas는 DOM 방 버튼의 보조 시각화다. 스크린리더 조작 경로는 DOM 버튼 하나로 통일한다.
- 색상 외에 체크, 라벨, disabled, 문구로 상태를 함께 표현한다.
- 선택/오류 알림은 `aria-live`, 치명적 오류만 `role="alert"`를 사용한다.

## 17. 파일 단위 구현 계획

### 프런트 신규

| 파일 | 책임 |
|---|---|
| `src/features/reservationFollowup/FollowupBookingFlow.tsx` | reducer와 단계 조율 |
| `src/features/reservationFollowup/BookingCalendar.tsx` | 월간 달력과 키보드 이동 |
| `src/features/reservationFollowup/TimeSlotPicker.tsx` | 시간 그룹과 상태 카드 |
| `src/features/reservationFollowup/BookingStepper.tsx` | 단계·완료 리본 |
| `src/features/reservationFollowup/useFollowupAvailability.ts` | 조회, abort, cache, retry |
| `src/features/reservationFollowup/reservationFollowupApi.ts` | API request/response 경계 |
| `src/features/reservationFollowup/CocoonSelector.tsx` | 기존 준비본 이식·통합 |
| `src/features/reservationFollowup/CocoonSceneCanvas.tsx` | 기존 준비본 이식·fallback 보강 |
| `src/features/reservationFollowup/CocoonScene.tsx` | 기존 입구 포함 3D 장면 이식 |
| `src/features/reservationFollowup/cocoonSceneModel.ts` | 1~4 타입과 검증 |
| `src/features/reservationFollowup/bookingModel.ts` | reducer, 날짜 helper, normalize |

### 프런트 수정

| 파일 | 변경 |
|---|---|
| `ReservationEndOverlay.tsx` | booking UI를 `FollowupBookingFlow`로 교체하고 폭 상태화 |
| `types.ts` | currentRoomNumber, calendar, slot V2 타입 추가 |
| `useReservationFollowup.ts` | `createFollowup`과 pending/error 상태 추가 |
| `src/app/page.tsx` | `onBook` 전달 |
| `src/app/chat/page.tsx` | 동일 prop 전달, guide 화면은 안내만 유지 |
| `.env.example`, `.env.prod.example` | rollout flag 추가 |

### 백엔드 신규/수정

| 파일 | 변경 |
|---|---|
| `Realtime-en-back/code/reservation_rooms.py` | 공통 KIOSK_ROOM_MAP, 방 번호 범위 |
| `reservation_intro/service.py` | 공통 매핑 import |
| `reservation_followup/contracts.py` | AvailabilityRangeFacts와 protocol 추가 |
| `reservation_followup/repository.py` | 방 1~4, 범위 snapshot 조회, kioskId 문자열 파싱 제거 |
| `reservation_followup/service.py` | currentRoomNumber, calendar, includeUnavailable |
| `server.py` | calendar route와 includeUnavailable query |

## 18. 테스트 계획

| 계층 | 검증 | 신규/수정 예상 |
|---|---|---:|
| 순수 단위 | 날짜 범위, 월 grid, reducer 초기화 규칙, 시간 그룹 | 18 |
| 프런트 컴포넌트 | 달력 선택→시간→코쿤, disabled, back edit, 오류 복구 | 12 |
| 3D 경계 | 버튼/preview/select props, WebGL fallback, reduced motion | 7 |
| 백엔드 정책 | 30/60분 일별 및 calendar status | 10 |
| 백엔드 repository | 1~4 room filter, range overlap query | 5 |
| 통합 | 성공 즉시 세션 갱신, 409 최신화, polling 회귀 | 6 |
| 수동 키오스크 | A02~A05 위치, 터치, 실제 해상도, 30분 soak | 1 체크리스트 |

jsdom에서 실제 WebGL 렌더링을 시도하지 않는다. `CocoonSceneCanvas`를 mock하고 `CocoonSelector`의 상태 계약을 테스트한다. 3D 시각 회귀는 운영 해상도 스크린샷으로 확인한다.

필수 회귀:

- polling이 동일 reservation을 새 객체로 반환해도 현재 선택이 초기화되지 않는다.
- 날짜/duration 변경 때만 의도한 하위 선택이 초기화된다.
- guide 화면에서는 예약 컨트롤이 생기지 않는다.
- guest QR과 resume 흐름은 변경되지 않는다.
- 예약 성공 후 기존 10초 자동 복귀가 유지된다.

## 19. 성능 기준

| 항목 | 합격 기준 |
|---|---:|
| calendar API | 범위 조회 1회당 DB query 5회 이하 |
| calendar API 응답 | 운영 환경 p95 500ms 이하 |
| 일별 API 응답 | 운영 환경 p95 300ms 이하 |
| 3D 첫 표시 | 단계 진입 후 1.2초 이내 |
| 3D 프레임률 | 운영 키오스크 45fps 이상, 목표 60fps |
| draw calls | 80 이하 |
| 절차형 scene | 추가 GLB 없음 |
| 최종 GLB 전환 시 | 압축 5MB 이하, 150k triangles 이하 |
| 입력 반응 | hover/focus 100ms 이내 시각 반응 |

Canvas는 코쿤 단계에서만 mount하고, 단계를 벗어나면 unmount한다. 예약 완료 뒤에도 숨은 WebGL loop를 유지하지 않는다.

## 20. 기능 플래그와 롤백

```env
NEXT_PUBLIC_COCOON_BOOKING_WIZARD_ENABLED=false
NEXT_PUBLIC_COCOON_3D_BOOKING_ENABLED=false
```

배포 순서:

1. 백엔드 additive API와 currentRoomNumber 배포
2. 프런트 코드 배포, 두 flag는 false
3. 개발/현장 키오스크에서 wizard flag만 true
4. DOM 흐름 검증 후 3D flag true
5. A02~A05 전체 확인 후 운영 기본값 전환

롤백:

- 3D 문제: `COCOON_3D_BOOKING_ENABLED=false`, DOM 코쿤 버튼 유지
- wizard 문제: `COCOON_BOOKING_WIZARD_ENABLED=false`, 기존 날짜/시간 UI로 복귀
- 백엔드 API는 additive라 구버전 프런트에 영향 없음
- 번호 데이터 변경이 있었다면 코드만 되돌리지 말고 DB 번호와 키오스크 매핑을 같은 변경 단위로 롤백

## 21. 구현 순서와 예상 작업량

```text
P0 번호 계약/DB 확인
 └─> P1 백엔드 additive API
      ├─> P2 달력·시간 DOM 흐름
      │    └─> P3 기존 3D 선택기 이식
      └─> P4 통합 오류 복구
           └─> P5 키오스크 QA·rollout
```

| 단계 | 내용 | 예상 |
|---|---|---:|
| P0 | DB 방 번호, 키오스크 현장 매핑 확인 | 0.5일 |
| P1 | 공통 번호 상수, calendar API, 일별 V2 응답, 테스트 | 1일 |
| P2 | reducer, 달력, 시간 카드, 모션, 반응형 | 1.5일 |
| P3 | 준비된 3D 파일 이식, 통합, fallback | 0.75일 |
| P4 | submit ownership, 409 복구, 접근성/회귀 테스트 | 0.75일 |
| P5 | 실제 키오스크 성능·터치·번호 확인 | 0.5일 |

총 예상은 약 5일이다. DB가 이미 1~4이고 현장 확인이 즉시 가능하다는 전제다.

## 22. 완료 판정 기준

1. 예약 모드 진입 후 월간 달력이 1.2초 이내 표시된다.
2. 오늘부터 한 달 이내 날짜만 선택 가능하고, 마감·휴관 날짜는 선택할 수 없다.
3. 날짜 한 번 선택으로 시간 단계로 이동한다.
4. 30/60분 변경 시 시간과 코쿤만 초기화되고 선택 날짜는 유지된다.
5. 시간 카드에 시작·종료 시각과 가용 코쿤 수 또는 불가 사유가 보인다.
6. 시간 선택 후에만 기존 입구 포함 코쿤 3D 조감도가 나타난다.
7. 조감도에서 입구와 코쿤 1~4의 좌우 순서를 즉시 식별할 수 있다.
8. 현재 위치는 A02~A05에서 각각 코쿤 1~4로 표시된다.
9. DOM 버튼과 3D 코쿤 어느 쪽을 hover/focus해도 상대 표현이 250ms 안에 동기화된다.
10. 터치 한 번으로 코쿤을 선택할 수 있고 예약 불가 코쿤은 선택되지 않는다.
11. 날짜·시간·코쿤을 모두 선택하기 전에는 최종 CTA가 disabled다.
12. 예약 성공 POST 응답 직후 완료 화면이 표시되고 기존 10초 복귀가 시작된다.
13. 409 충돌 시 최신 가용성을 불러와 유효한 단계로 복귀하며 전체 입력을 처음부터 반복시키지 않는다.
14. WebGL 실패 시 DOM 코쿤 버튼으로 예약을 완료할 수 있다.
15. reduced-motion 환경에서 반복·카메라·부유 모션이 실행되지 않는다.
16. 기존 guest QR, resume, dismiss, guide 화면 동작이 모두 유지된다.
17. 프런트 lint/test/build와 백엔드 예약 intro/followup 테스트가 통과한다.
18. 운영 키오스크에서 코쿤 단계 렌더링이 45fps 이상이다.

## 23. 구현 범위 밖

- 자유 회전·줌이 가능한 3D 뷰어
- 새 고정밀 GLB/CAD 제작
- Manim 영상 삽입
- Anime.js 추가
- QR 회원가입 흐름 재설계
- 운영 시간과 예약 정책 자체 변경
- 전체 예약 시스템 또는 `ulju-ai-user-web` 재설계

이번 구현의 성공 기준은 화려함이 아니라, 사용자가 설명 없이 **날짜 → 시간 → 실제 공간**을 빠르게 연결하고 예약을 끝내는 것이다.
