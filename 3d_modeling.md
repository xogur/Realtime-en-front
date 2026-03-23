# Streamoji 3D 아바타 애니메이션 상용화 도입 및 통합 계획서

본 문서는 현재 하드코딩된 절차적(Procedural) 뼈대 제어 방식의 3D 아바타 시스템을 Streamoji의 동적 애니메이션 클립(.glb) 기반 시스템으로 마이그레이션하기 위한 실무 아키텍처 및 도입 가이드입니다.

---

## 1. 현행 시스템 분석 및 아키텍처 전환 전략

현재 프로젝트의 `src/components/canvas/Character.tsx` 파일은 `ARM_POSES`, `FIST_ROTATION` 등의 상수를 정의하고 `useFrame` 내부에서 삼각함수(Math.sin)와 선형 보간(lerp)을 사용하여 프레임 단위로 뼈대(Bone)의 회전값을 직접 조작하고 있습니다.

Streamoji를 상용 환경에 도입하기 위해서는 기존의 **'수학적 뼈대 조작(Procedural Animation)'**을 완전히 덜어내고, **'애니메이션 클립 재생(Data-Driven Animation)'** 구조로 전환해야 합니다.

### 전환 원칙
* **바디/제스처 애니메이션:** 기존 수동 Bone 제어 코드를 모두 제거하고, Streamoji의 `.glb` 파일에서 추출한 `AnimationClip`을 `@react-three/drei`의 `useAnimations` 훅을 통해 믹싱(Mixing)합니다.
* **표정 및 립싱크 (Morph Targets):** Streamoji 애니메이션 클립은 주로 몸의 움직임(Locomotion, Expression)을 제어하므로, 기존에 구현된 Web Audio API 기반의 오디오 주파수 분석 립싱크(`jawOpen` 제어)와 상태 기반 표정 제어(Emotion) 로직은 그대로 유지하여 두 시스템을 병합합니다.

---

## 2. 상태(State)와 애니메이션 매핑 계획

`src/stores/useStore.ts`에서 관리하는 아바타의 현재 상태(상호작용, 감정)를 Streamoji JSON 데이터의 카테고리와 매핑하여 동적 로딩 파이프라인을 구축합니다.

### 2.1. 상호작용 상태 매핑 (`useStore` 상태 기준)
* **기본 대기 (`isPlaying: false, isThinking: false`)**
    * 매핑 대상: Streamoji `Idle` 카테고리 (예: `Soft Idle 1`)
    * 동작 방식: 대기 상태 진입 시 부드럽게(Fade-in) 기본 숨쉬기 모션 클립으로 전환합니다.
* **생각 중 (`isThinking: true`)**
    * 매핑 대상: Streamoji `Expression` 카테고리의 특정 동작 (예: `Thinking` 또는 `Checking Surroundings`)
    * 동작 방식: `useVoiceSocket.ts`에서 `final_user_request`를 수신하여 `isThinking`이 `true`로 변경되면 해당 클립을 루프 재생합니다.
* **말하는 중 (`isPlaying: true` + Volume 감지)**
    * 매핑 대상: Streamoji `Expression` 카테고리의 발화 동작 (예: `Talking Variations`)
    * 동작 방식: 오디오 청크 재생이 시작되면 발화 제스처 클립으로 전환하며, 랜덤하게 여러 발화 베리에이션을 순차적으로 교체하여 단조로움을 방지합니다.

### 2.2. 감정 상태 매핑 (`useStore.emotion` 기준)
`useVoiceSocket.ts`에서 파싱하는 텍스트 감정 태그 `(기쁨)`, `(슬픔)` 등에 따라 바디 제스처의 강도나 종류를 변경합니다.
* `happy`: `Expression` 카테고리의 `Great Job Clap` 또는 활기찬 동작 할당.
* `sad`: `Locomotion`이나 `Idle` 카테고리 중 몸을 웅크리거나 축 처진 `Soft Var` 애니메이션 할당.

---

## 3. 핵심 컴포넌트 리팩토링 상세 계획

### 3.1. `Character.tsx` 파일 다이어트 및 구조 개편
1.  **제거 대상:** * 파일 상단의 `ARM_POSES`, `FIST_ROTATION` 객체 전체.
    * `useFrame` 내부에 작성된 팔, 목, 손가락 뼈대(`leftArmRef`, `neckRef`, `fingerBonesRef` 등)의 회전 각도 계산 및 `lerp` 적용 로직 전체.
    * 수동 동작 타이머(`poseTimer`, `armPose`, `nextPoseTime` 등).
2.  **보존 대상:** * 오디오 주파수 기반 립싱크 처리 로직 (`jawOpen`, `mouthPucker` 등).
    * 감정에 따른 얼굴 MorphTarget 제어 로직 (`mouthSmileLeft`, `eyeSquintLeft` 등).
    * 자연스러운 눈 깜빡임(`Auto Blink`) 로직.

### 3.2. 동적 애니메이션 컨트롤러 주입
* **애니메이션 다운로드 및 캐싱 로직 추가:** 컴포넌트 마운트 시 Streamoji JSON을 `fetch`하여 메모리에 저장합니다.
* **`useAnimations` 훅 적용:** `useGLTF`를 통해 아바타 원본 모델과 동적으로 선택된 애니메이션 URL 모델을 동시에 불러온 뒤, `useAnimations`의 `actions` 객체를 활용하여 애니메이션을 제어합니다.
* **상태 구독(Subscribe)을 통한 클립 전환:** `useEffect`를 활용하여 Zustand의 `isThinking`, `isPlaying`, `emotion` 값이 변경될 때마다 현재 실행 중인 action에 `fadeOut()`을 적용하고, 새 상태에 맞는 action에 `fadeIn().play()`를 적용합니다.

---

## 4. 상용화를 위한 성능 최적화 및 엣지 케이스 대응 전략

외부 CDN에서 `.glb` 파일을 매번 불러올 경우 발생하는 네트워크 레이턴시는 실시간 음성 챗봇의 사용자 경험을 크게 저해합니다. 이를 해결하기 위한 전략입니다.

### 4.1. 필수 애니메이션 프리로딩 (Pre-loading)
서비스 진입 시(또는 로딩 화면에서), 가장 빈번하게 사용되는 '기본 대기(Idle)', '생각 중(Thinking)', '일반 발화(Talking 1, 2)' `.glb` 파일들을 `useGLTF.preload()`를 통해 브라우저 캐시에 미리 적재합니다.

### 4.2. 애니메이션 전환 버퍼링 대응
네트워크 지연으로 인해 특정 감정이나 동작의 애니메이션 파일이 즉시 다운로드되지 않을 상황을 대비해야 합니다.
* 다운로드가 완료될 때까지는 이전에 재생 중이던 클립(예: Idle)을 계속 유지합니다.
* 리액트 `Suspense`를 활용하는 3D 렌더링 트리의 특성상, 애니메이션 로딩 중 화면이 깜빡이거나 멈추지 않도록 URL 변경과 다운로드 상태를 관리하는 별도의 State Layer를 구축합니다.

### 4.3. Nginx CORS 및 프록시 캐싱 (DevOps 환경)
프론트엔드 컴포넌트에서 직접 Streamoji R2 CDN(pub-*.r2.dev)을 호출할 때 발생할 수 있는 CORS 제약과 트래픽 병목을 방지하기 위해, 웹 서버(Nginx)에 프록시 캐시(Proxy Cache) 설정을 추가하여 `.glb` 파일을 자체 서버에서 서빙하는 형태로 네트워크 아키텍처를 보강합니다.

---

## 5. 단계별 구현 마일스톤

* **Phase 1 (정리 및 코어 교체):** `Character.tsx` 내의 수동 제어 로직을 주석 처리/제거하고, 단일 Streamoji 애니메이션을 고정으로 불러와 정상 작동 및 기존 립싱크와의 충돌 여부를 테스트합니다.
* **Phase 2 (상태 연동):** Zustand Store의 상태 변화에 따라 애니메이션 URL이 동적으로 교체되고 부드럽게 트랜지션(Crossfade) 되는 로직을 구현합니다.
* **Phase 3 (데이터 파이프라인):** Streamoji JSON 데이터를 API로 호출하여 동적 메뉴화하고, 감정 태그 파싱 결과에 맞추어 랜덤한 애니메이션 베리에이션을 선택하는 로직을 고도화합니다.
* **Phase 4 (최적화 및 QA):** 프리로딩 로직을 추가하고, 네트워크 스로틀링 환경에서도 끊김 없는 3D 렌더링이 유지되는지 검증합니다.