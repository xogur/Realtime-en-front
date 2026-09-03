# 예약 종료 → 다음 예약 시네마틱 전환 조사·설계

> 범위: 이용 종료 선택 화면 → 날짜 → 시간 → 코쿤 → 예약 완료
> 작성일: 2026-09-03
> 상태: 조사 및 설계 완료, 구현 전

이 문서는 `RESERVATION_FOLLOWUP_UX_DESIGN.md`의 정보 구조와 `COCOON_3D_BOOKING_DEMO_DESIGN.md`의 3D 장면 설계를 유지하면서, 화면 사이의 연결감만 집중해서 정의한다.

## 1. 결론

추천 방향은 **Spatial Continuity(공간 연속 전환)**다.

화면을 영상처럼 보이게 만드는 핵심은 3D 오브젝트를 많이 넣는 것이 아니다. 사용자가 누른 카드, 고른 날짜, 선택한 시간이 다음 화면의 같은 정보로 이동하고 형태를 바꾸는 것이 핵심이다. 장면이 바뀌어도 시각적 기준점이 남으면 사용자는 “다른 화면으로 넘어갔다”보다 “내 선택이 다음 단계로 이어졌다”고 느낀다.

- Manim은 런타임에 넣지 않는다. `Transform`, `Create`, `LaggedStart` 같은 **연출 문법**만 차용한다.
- Anime.js도 추가하지 않는다. 타임라인, stagger, SVG draw 아이디어만 차용한다.
- DOM 전환은 현재 설치된 Motion(`framer-motion`)이 소유한다.
- 3D 장면은 현재 설치된 React Three Fiber + Three.js가 소유한다.
- DOM과 WebGL을 억지로 하나의 객체처럼 morph하지 않는다. 같은 위치에서 짧게 겹쳐 보이는 **시각적 핸드오프**로 연결한다.

이렇게 하면 새 애니메이션 런타임 없이도 인터랙션을 중단할 수 있고, 되돌아가기와 접근성 처리도 한 곳에서 관리할 수 있다.

## 2. 참고 자료 조사

### 2.1 Manim

Manim은 Python으로 장면을 만들고 렌더링하는 수학 애니메이션 도구다. 장면에 오브젝트를 유지한 채 `Transform`으로 형태를 바꾸고, `Create`로 선을 그리며, `LaggedStart`로 순차 등장을 구성하는 방식이 강점이다.

사용자가 공유한 영상은 Solostack의 **「코드로 만드는 애니메이션, manim + Claude Code」**다. 영상 소개에서 강조한 그래프·도형·글자 사이의 연속 변형은 이 설계의 직접적인 출발점이다.

이 프로젝트에 가져올 것:

- 이전 화면의 핵심 오브젝트가 다음 화면의 시작 오브젝트가 되는 구성
- 모든 요소를 동시에 움직이지 않고 주제 → 보조 정보 순으로 등장시키는 구성
- 카메라 이동보다 오브젝트 변형으로 시선을 안내하는 방식

가져오지 않을 것:

- 사전 렌더된 영상을 예약 UI 위에 재생하는 방식
- Python 렌더 파이프라인을 브라우저 선택 상태와 연결하는 방식
- 사용자가 기다려야 하는 긴 설명 영상형 연출

참고: [공유된 YouTube 영상](https://www.youtube.com/watch?v=anpDvkCx_Aw), [Manim Community](https://www.manim.community/), [Manim Scene API](https://docs.manim.community/en/stable/reference/manim.scene.scene.Scene.html), [Manim Transform API](https://docs.manim.community/en/stable/reference/manim.animation.transform.html)

### 2.2 21st.dev

21st.dev는 하나의 일관된 라이브러리라기보다 여러 제작자의 React 컴포넌트와 테마를 모은 레지스트리다. shared element, morphing panel, animated hero, shader 같은 패턴을 빠르게 비교하기 좋다.

이 프로젝트에 가져올 것:

- 눌렀던 CTA가 다음 패널의 표면으로 확장되는 shared element 전환
- 선택 표시가 새로 생기지 않고 카드 사이를 이동하는 패턴
- 소스 코드를 프로젝트 토큰과 접근성 규칙에 맞게 재작성하는 방식

주의할 점:

- 여러 제작자의 컴포넌트를 그대로 섞으면 이징, radius, 그림자, 모션 속도가 서로 달라진다.
- 이 프로젝트에서는 패턴만 참고하고 모든 모션을 아래의 공통 토큰으로 다시 작성한다.

참고: [21st.dev](https://21st.dev/), [Motion layout animation](https://motion.dev/docs/react-layout-animations)

### 2.3 MotionSites

MotionSites는 랜딩 페이지 프롬프트와 예시를 모은 갤러리다. 큰 타이포그래피, 검은 배경, 발광 재질, 3D 오브젝트, 깊은 그림자로 첫 장면의 인상을 만드는 사례가 많다.

이 프로젝트에 가져올 것:

- 전경·중경·배경의 세 깊이 레이어
- 선택 대상 아래의 제한된 광원과 contact shadow
- 한 장면마다 하나의 주인공만 두는 구도

가져오지 않을 것:

- 강한 bloom, 무한 회전, 마우스 추적, 스크롤 스크러빙
- 예약 정보보다 먼저 보이는 장식적 3D
- 어두운 랜딩 페이지 색조. 기존 예약 UI의 따뜻한 아이보리를 유지한다.

참고: [MotionSites](https://motionsites.ai/)

### 2.4 Anime.js

Anime.js v4는 timeline, stagger, SVG line drawing·morphing·motion path, spring, media-query scope를 한 API에 제공한다. 단독 애니메이션 프로젝트라면 좋은 선택이지만 현재 프로젝트에는 Motion과 R3F가 이미 같은 역할을 나눠 맡고 있다.

이 프로젝트에 가져올 것:

- 한 시퀀스를 상대 시간으로 설계하는 timeline 사고방식
- 30~45ms 간격의 짧은 stagger
- 2D 평면도 윤곽을 그리는 SVG draw 아이디어

추가하지 않는 이유:

- Motion과 Anime.js가 같은 DOM transform을 제어하면 취소와 재진입 시 소유권이 충돌한다.
- 기존 번들과 테스트 면적이 늘어난다.
- 필요한 shared element와 exit/enter 전환은 Motion이 이미 제공한다.

참고: [Anime.js](https://animejs.com/)

### 2.5 현재 스택과 맞는 공식 패턴

- Motion의 `layoutId`는 서로 다른 컴포넌트에 있는 동일 요소를 연결해 shared element 전환을 만들 수 있다.
- `AnimatePresence mode="wait"`는 이전 장면이 끝난 뒤 다음 장면을 보여 주는 순차 전환에 적합하다.
- React Three Fiber는 빠른 3D 변화에 React state를 매 프레임 갱신하지 말고 `useFrame` 안에서 ref를 delta 기반으로 변경하라고 권장한다.
- 반복되는 geometry와 material은 재사용하고, 정지 장면이 길면 on-demand 렌더를 검토한다.

참고: [Motion AnimatePresence](https://motion.dev/docs/react-animate-presence), [R3F performance pitfalls](https://r3f.docs.pmnd.rs/advanced/pitfalls), [R3F scaling performance](https://r3f.docs.pmnd.rs/advanced/scaling-performance)

## 3. 현재 구현의 전환 단절 지점

### 3.1 종료 선택 → 예약 시작

`ReservationEndOverlay.tsx`는 CTA 클릭 시 `mode`를 즉시 `choices → booking`으로 바꾼다. 모달 폭은 CSS `max-width`만 전환되고, 눌렀던 파란 카드와 다음 화면 사이의 시각적 연결은 없다.

결과: 사용자는 버튼을 눌렀다는 사실은 알지만, 파란 카드가 예약 플로우를 열었다는 연속감은 느끼기 어렵다.

### 3.2 날짜 → 시간 → 코쿤

`FollowupBookingFlow.tsx`는 모든 단계를 동일한 `opacity + y` 전환으로 교체한다. 안정적이지만 날짜, 시간, 공간이라는 서로 다른 의미가 모두 같은 슬라이드처럼 보인다.

결과: 기능은 명확하지만 영상 같은 연결감과 공간이 열리는 느낌은 약하다.

### 3.3 시간 → 3D

3D Canvas는 코쿤 단계가 마운트될 때 동적으로 로드된다. 로딩 placeholder 뒤에 완성된 3D가 나타나므로 “2D 시간 정보가 실제 공간으로 이어지는” 장면이 없다.

### 3.4 제출 → 예약 완료

서버 응답으로 `session.status === 'booked'`가 되면 전체 분기가 즉시 완료 화면으로 교체된다. 직전에 선택한 코쿤과 완료 체크 사이의 연결이 끊긴다.

### 3.5 reduced motion 누락

단계 패널은 `useReducedMotion()`을 사용하지만 로딩 progress bar의 무한 이동은 별도 처리하지 않는다. 반복 이동도 reduced-motion 상태에서는 정적인 진행 표시로 바꿔야 한다.

## 4. 제안 콘셉트: Spatial Time Ribbon

날짜와 시간을 각각 별개의 폼 값으로 보지 않고, 최종 코쿤까지 이어지는 하나의 **시간 리본**으로 표현한다.

```text
[다음 예약 CTA]
      ↓ 표면 확장
[9월 8일]
      ↓ 상단 리본으로 이동
[9월 8일 · 14:30]
      ↓ 평면도 선을 따라 공간으로 이동
[코쿤 2 내부 조명]
      ↓ 서버 확정
[9월 8일 · 14:30 · 코쿤 2 ✓]
```

리본은 파란색을 많이 칠하는 장식이 아니다. 사용자가 이미 선택한 정보를 계속 같은 위치와 색으로 보여 주는 기억 장치다.

### 안전한 선택과 의도적인 위험

안전한 선택:

- 날짜 → 시간 → 코쿤의 익숙한 단계 구조와 상단 스테퍼는 유지한다. 사용자는 새로운 예약 문법을 배울 필요가 없다.
- 달력, 시간, 코쿤 선택은 계속 실제 DOM 버튼으로 제공한다. 3D가 실패해도 예약할 수 있다.
- 이동 시간은 대부분 140~360ms로 제한한다. 키오스크에서 애니메이션을 기다리는 느낌을 만들지 않는다.

의도적인 위험:

- 시간 선택 뒤 2D 평면도가 3D 공간으로 일어서는 620ms 장면은 일반 예약 UI보다 표현적이다. 대신 이 제품만의 공간 예약 의미를 한 번에 설명한다.
- CTA 표면이 다음 패널로 확장되는 shared element는 일반적인 모달 교체보다 구현과 테스트가 복잡하다. 대신 이용 종료와 다음 예약이 한 흐름으로 느껴진다.
- 성공할 때 선택 코쿤을 완료 카드로 축약하는 장면은 별도 시각 스냅샷 상태가 필요하다. 대신 사용자가 제출한 방과 성공 결과의 연결이 분명해진다.

## 5. 전체 스토리보드

### Scene 0. 이용 종료

- 기존 종료 화면을 그대로 유지한다.
- `다음 예약 일정 잡기` 카드만 1~2px 밝아지고 아이콘에 짧은 depth shadow를 준다.
- 자동 재생 모션은 없다. 사용자가 눌렀을 때만 시퀀스가 시작된다.

### Scene 1. CTA가 예약 무대가 된다

총 420ms.

1. 0~90ms: CTA가 0.985배 눌리고 그림자가 가까워진다.
2. 90~330ms: CTA의 파란 표면이 `layoutId="booking-surface"`로 다음 패널의 상단 리본 위치까지 확장된다.
3. 180~360ms: 기존 선택지와 QR은 6px 아래로 가며 사라진다.
4. 260~420ms: 제목이 `다음 예약 일정 잡기`에서 `언제 다시 이용하시겠어요?`로 교체되고 달력이 나타난다.

모달은 중앙 기준으로 폭을 키운다. 좌우로 한쪽만 밀리면 사용자가 공간 이동으로 느낄 수 있으므로 중심을 고정한다.

### Scene 2. 날짜가 선택 리본이 된다

총 300ms.

1. 날짜 셀 선택 배경이 120ms 안에 반응한다.
2. 날짜 텍스트가 `layoutId="booking-date"`를 통해 상단 리본으로 이동한다.
3. 달력은 전체 opacity를 낮추지 않고, 주변 셀만 0.82로 낮춘 뒤 180ms에 접힌다.
4. 시간 카드가 오전 → 오후 → 저녁 순으로 32ms stagger되어 등장한다.

선택 직후 다음 단계로 자동 이동하되, 날짜 리본은 즉시 눌러 수정할 수 있다.

### Scene 3. 시간이 공간을 연다

총 620ms. 이 시퀀스가 전체 경험의 시그니처다.

1. 0~120ms: 선택 시간 카드의 외곽선이 고정되고 가용 코쿤 수가 강조된다.
2. 80~260ms: 선택한 시간 텍스트가 상단 리본으로 이동한다.
3. 120~360ms: 시간 카드 아래에서 얇은 SVG 선이 오른쪽으로 그려져 2D 평면도의 주 동선이 된다.
4. 260~560ms: 평면도 선의 명도는 유지한 채 Canvas 안의 바닥과 벽 높이가 `0 → 1`로 올라온다.
5. 420~620ms: 2D SVG는 사라지고 같은 위치의 3D 바닥선이 이어받는다. 코쿤은 1→4 순서로 38ms 간격으로 8cm만 상승하며 정착한다.

중요: DOM SVG와 WebGL mesh를 실제로 morph하지 않는다. 동일한 카메라 구도와 좌표로 140ms 정도 겹쳐 보여 사용자가 하나의 물체로 지각하게 한다.

### Scene 4. 코쿤 선택

- hover/focus 반응은 160~220ms, overshoot 없는 damp를 사용한다.
- 선택 코쿤은 4cm 상승, 1.02배 확대, 바닥 링, 내부 조명 켜짐으로 표현한다.
- 카메라는 첫 선택 때만 타깃 방향으로 4% 이동하고 이후 선택 변경에서는 1.5% 이내로 제한한다.
- 자유 회전, 자동 회전, 큰 줌은 사용하지 않는다.

### Scene 5. 예약 확정

총 680ms. 서버 성공 응답을 받은 뒤 시작한다.

1. 0~140ms: 제출 버튼의 진행 표시가 체크로 전환된다.
2. 80~300ms: 선택 코쿤 내부 조명이 켜지고 바닥 링이 한 번 넓어진다.
3. 220~500ms: 3D 장면 위에 같은 코쿤 실루엣의 2D 카드가 겹치며 Canvas가 사라진다.
4. 380~600ms: 2D 코쿤 카드가 완료 화면 아이콘 위치로 이동한다.
5. 480~680ms: `다음 예약이 완료되었습니다`와 날짜·시간·코쿤 요약이 나타난다.

성공 응답이 오기 전에는 완료 모션을 시작하지 않는다. 네트워크 지연 중에는 선택 코쿤과 요약을 그대로 유지해 사용자가 무엇을 제출했는지 잃지 않게 한다.

## 6. 모션 토큰

```ts
export const bookingMotion = {
  instant: 90,
  response: 140,
  shared: 300,
  panel: 360,
  spatialIntro: 620,
  success: 680,
  stagger: 38,
  easeOut: [0.16, 1, 0.3, 1],
  easeInOut: [0.65, 0, 0.35, 1],
  springSoft: { type: 'spring', stiffness: 360, damping: 34, mass: 0.8 },
} as const;
```

규칙:

- 작은 입력 반응은 140ms 안에 끝낸다.
- 장면 전환은 360ms를 기본으로 한다.
- 3D가 생기는 한 장면만 620ms를 허용한다.
- 큰 요소 두 개를 같은 순간에 서로 다른 방향으로 움직이지 않는다.
- blur는 최대 6px, scale은 진입 시 0.985 이상으로 제한한다.
- 지속 반복 모션은 현재 위치 링 하나만 허용하며, opacity 변화 폭도 0.18 이내로 둔다.

## 7. 진짜 3D처럼 느껴지게 하는 시각 규칙

3D 느낌은 회전보다 다음 네 가지에서 나온다.

1. **접지감:** 코쿤 바로 아래 contact shadow가 물체 높이에 따라 짧아지고 옅어진다.
2. **가림:** 코쿤, 바닥 링, 라벨의 앞뒤 관계가 카메라 각도에 맞아야 한다.
3. **재질 대비:** 무광 외장, 반무광 프레임, 제한된 반투명 문을 서로 다른 roughness로 구분한다.
4. **미세 시차:** 선택 시 카메라와 타깃이 아주 조금 다르게 움직여 깊이를 만든다.

권장 장면:

- 카메라 FOV 28~31도
- 따뜻한 key light + 차가운 약한 fill light
- 코쿤 선택 시에만 내부 emissive를 올린다.
- 실시간 bloom, SSAO, 강한 depth of field는 1차 구현에서 제외한다.
- 그림자는 메시 전체가 아니라 외장과 핵심 가구에만 적용한다.

“영상처럼” 보이기 위해 프레임을 무겁게 만드는 것이 아니라, 장면의 시작과 정착 포즈를 명확히 만든다.

## 8. 상태 및 컴포넌트 설계

### 8.1 전환 상태

```ts
type BookingVisualPhase =
  | 'choices'
  | 'entering-booking'
  | 'date'
  | 'time'
  | 'spatial-intro'
  | 'cocoon'
  | 'submitting'
  | 'success-handoff'
  | 'success';
```

도메인 상태의 `step`과 시각 상태의 `phase`를 분리한다. API 결과와 애니메이션 진행률을 같은 상태로 관리하면 빠른 되돌아가기나 409 오류에서 상태가 꼬일 수 있다.

### 8.2 권장 구조

```text
ReservationEndOverlay
├─ LayoutGroup id="reservation-followup"
├─ BookingTransitionSurface
├─ FollowupBookingFlow
│  ├─ BookingStepper
│  ├─ SelectionRibbon
│  ├─ BookingStagePresence
│  │  ├─ DateStage
│  │  ├─ TimeStage
│  │  └─ CocoonStage
│  └─ BookingSubmitBar
├─ SpatialHandoffOverlay
│  └─ SVG floor-plan path
└─ BookingSuccessScene
```

### 8.3 전환 소유권

| 대상 | 소유자 | 방식 |
|---|---|---|
| CTA, 패널, 리본, 단계 | Motion | `LayoutGroup`, `layout`, `layoutId`, `AnimatePresence` |
| SVG 경로 | Motion 또는 CSS | `pathLength 0→1` |
| 코쿤 위치·스케일·재질 | R3F | `useFrame`, ref mutation, delta 기반 damp |
| 카메라 | R3F | position/target damp |
| 완료 전환 조율 | React phase reducer | Motion `onAnimationComplete`에서 다음 phase dispatch |

한 속성을 두 엔진이 동시에 쓰지 않는다. 예를 들어 코쿤의 `scale`은 R3F만, Canvas 컨테이너의 `opacity`는 Motion만 제어한다.

### 8.4 Canvas 예열

- 예약 모드에 들어갈 때 곧바로 Canvas를 켜지 않는다.
- 사용자가 날짜를 선택해 시간 데이터를 보는 동안 3D chunk와 자산을 preload한다.
- 시간 선택 직후 Canvas를 opacity 0으로 마운트하고 첫 정상 프레임을 확인한다.
- 첫 프레임 전에는 2D 평면도가 계속 보여야 한다.
- WebGL 또는 자산 로딩 실패 시 같은 SVG 평면도를 2.5D fallback으로 유지한다.

### 8.5 성공 핸드오프 데이터

현재 성공 화면은 부모의 새 `session`만 본다. 직전 선택 코쿤의 시각 연속성을 유지하려면 제출 시 다음 스냅샷을 `ReservationEndOverlay`에 잠시 보존한다.

```ts
type BookingVisualSnapshot = {
  dateLabel: string;
  startTime: string;
  endTime: string;
  roomNumber: 1 | 2 | 3 | 4;
};
```

이 데이터는 서버 권위 데이터가 아니다. 성공 애니메이션 연결용이며, 최종 완료 텍스트는 서버가 돌려준 `session.followup`을 사용한다.

## 9. 인터럽트·오류 규칙

- 사용자가 전환 중 뒤로 가기를 누르면 현재 Motion 애니메이션을 취소하고 가장 가까운 안정 상태로 이동한다.
- `spatial-intro` 중 WebGL이 실패하면 SVG 평면도를 그대로 확장해 fallback 장면으로 사용한다. 흰 화면을 거치지 않는다.
- 409가 발생하면 선택 코쿤의 성공 연출을 하지 않는다. 해당 코쿤의 파란 링이 호박색으로 바뀌고 240ms 후 해제된다.
- 날짜 변경은 시간·코쿤·3D 선택을 초기화한다.
- 시간 변경은 코쿤 선택과 카메라 타깃만 초기화한다.
- 동일 API 응답 재렌더는 전환을 재시작하지 않는다. 전환 키는 `step`이 아니라 사용자 action id를 사용한다.

## 10. 접근성과 reduced motion

`prefers-reduced-motion: reduce`에서는 장면의 의미는 유지하고 이동만 줄인다.

- shared element 이동 → 120ms crossfade
- 평면도 draw → 완성된 선 즉시 표시
- 3D extrusion → 최종 장면 160ms fade
- 카메라 이동·패럴랙스·현재 위치 호흡 제거
- 로딩 progress bar의 무한 이동 → 정적인 progress 표시 또는 텍스트
- 완료 링 확장 → 체크와 색상 전환만 사용

추가 규칙:

- 단계 변경 때 현재 질문 제목으로 포커스를 옮기되 포인터 사용자는 강제로 스크롤하지 않는다.
- `aria-live="polite"`에는 전환 설명이 아니라 선택 결과만 알린다.
- Canvas는 계속 `aria-hidden`으로 두고 같은 선택 기능을 DOM 버튼으로 제공한다.
- 애니메이션 때문에 입력이 700ms 이상 잠기지 않게 한다.

참고: [Motion useReducedMotion](https://motion.dev/docs/react-use-reduced-motion)

## 11. 성능 예산

| 항목 | 목표 |
|---|---:|
| 입력 후 첫 시각 반응 | 100ms 이하 |
| 단계 전환 중 메인 스레드 long task | 50ms 미만 |
| 운영 키오스크 3D FPS | 45fps 이상, 목표 60fps |
| Canvas DPR | 1~1.5 |
| 추가 애니메이션 라이브러리 | 0개 |
| 동시 큰 레이아웃 애니메이션 | 최대 2개 |
| 성공 연출 | 700ms 이하 |

검증 항목:

- 3D geometry/material 재사용
- `useFrame` 안에서 React state 변경 금지
- 매 프레임 `new Vector3()` 같은 객체 할당 금지
- 평상시 반복 애니메이션이 없다면 `frameloop="demand"` 가능성 측정
- Canvas unmount/remount 횟수와 WebGL context loss 기록
- 30분 연속 실행 후 메모리 증가 확인

## 12. 구현 순서

### 1단계. DOM 연속 전환

- `ReservationEndOverlay`에 `LayoutGroup`과 시각 phase 추가
- CTA → 예약 surface shared element 구현
- 날짜·시간 `layoutId` 리본 구현
- 단계별 motion variant 분리
- reduced-motion과 빠른 뒤로 가기 테스트

완료 기준: 3D 없이도 종료→날짜→시간 흐름이 하나의 장면처럼 연결된다.

### 2단계. Spatial handoff

- 2D 평면도 SVG 제작
- 시간 단계에서 3D chunk preload
- SVG와 Canvas의 동일 구도 정렬
- `introProgress`에 따른 바닥·벽·코쿤 정착 구현
- WebGL 실패 시 SVG fallback 유지

완료 기준: 시간 선택 후 흰 로딩 화면 없이 평면도가 3D 공간으로 이어진다.

### 3단계. 성공 핸드오프

- 제출 직전 `BookingVisualSnapshot` 저장
- 선택 코쿤 → 2D 완료 카드 핸드오프
- 서버 성공 뒤에만 완료 타임라인 시작
- 409와 일반 오류에서 성공 모션 미실행 확인

완료 기준: 사용자가 방금 선택한 코쿤이 완료 화면의 예약 결과로 이어져 보인다.

### 4단계. 실제 기기 튜닝

- 키오스크 해상도에서 화면 녹화
- 60fps/45fps 구간 측정
- 0.75×와 1.25× 속도 비교 후 수치 확정
- 터치 연타, 뒤로 가기, 네트워크 지연, WebGL 실패 검증

## 13. 완료 판정 기준

- CTA를 누른 뒤 100ms 안에 눌림 반응이 보인다.
- 종료 선택 화면에서 날짜 화면으로 흰 프레임이나 순간적인 전체 교체가 없다.
- 선택한 날짜와 시간이 다음 단계에서도 같은 시각적 오브젝트로 이어진다.
- 시간 선택 후 2D 평면도와 3D 장면 사이의 공백이 없다.
- 3D 로딩이 늦어도 예약 입력은 막히지 않는다.
- 사용자는 자유 회전 없이 현재 위치와 선택 가능한 코쿤을 1초 안에 구분한다.
- 성공 연출은 서버 응답 후 700ms 안에 끝난다.
- 전환 중 뒤로 가기와 409 오류가 시각 상태를 깨뜨리지 않는다.
- reduced-motion에서는 큰 이동과 반복 이동이 모두 제거된다.
- 운영 키오스크에서 45fps 이상을 유지한다.

## 14. 최종 권고

첫 구현의 우선순위는 **CTA shared element → 날짜/시간 리본 → 시간에서 3D로 넘어가는 Spatial handoff → 성공 장면** 순서다.

Manim을 실제 제품 번들에 넣는 것보다 Manim의 장면 문법을 현재 React 구조로 번역하는 편이 더 자연스럽다. Anime.js를 추가하는 것보다 기존 Motion과 R3F 사이의 역할을 명확히 나누는 편이 전환 취소, 접근성, 오류 복구까지 완성도 있게 만든다. 21st.dev와 MotionSites에서는 재질과 깊이 표현을 참고하되, 랜딩 페이지의 과장된 효과는 버린다.

이 설계의 시그니처는 “3D를 보여주는 것”이 아니라 **사용자가 고른 시간이 선을 따라 실제 코쿤 공간으로 일어서는 장면**이다.
