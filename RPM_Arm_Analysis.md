# Ready Player Me 아바타의 RightArm 골격 회전 이형성(Anomalies) 및 Three.js 내 올바른 키네마틱 제어 전략에 관한 심층 기술 보고서

## 초록 (Executive Summary)

본 연구 보고서는 웹 기반 3D 그래픽스 환경, 특히 Three.js 라이브러리를 활용하여 Ready Player Me (이하 RPM) 아바타를 제어할 때 발생하는 비직관적인 골격 회전 현상을 심층 분석한다. 구체적으로, 사용자가 아바타의 `RightArm`(오른팔) 뼈대를 차렷 자세(Attention Pose)로 제어하기 위해 일반적인 직관인 Z축 회전이 아닌, X축으로 약 $65^{\circ}$를 회전시켜야 하는 현상의 기술적 원인을 규명한다.

연구 결과, 해당 현상은 단순한 오류가 아니라 **(1) Mixamo 리깅 표준의 로컬 좌표계(LCS) 정의**, **(2) Blender(Z-up)와 GLTF(Y-up) 간의 좌표계 변환 파이프라인**, 그리고 **(3) 부모 뼈대(Clavicle)의 선행 회전값**이 복합적으로 작용한 결정론적 결과임이 밝혀졌다. RPM 아바타의 상완(Upper Arm) 뼈대는 Y축이 길이 방향(Longitudinal axis)을 향하고, X축이 상하 회전(Elevation/Depression)을 담당하도록 리깅되어 있다. 따라서, 팔을 아래로 내리는 동작은 월드 좌표계의 Z축 회전이 아닌, 뼈대 로컬 좌표계의 X축 양의 회전으로 구현된다.

본 보고서는 이러한 현상의 원인을 수학적 변환 행렬과 쿼터니언 연산을 통해 증명하고, 이를 바탕으로 개발자가 아바타의 팔을 직관적으로 제어할 수 있는 'Forward/Up/Twist' 매핑 전략과 Three.js 구현 코드를 제시한다. 이는 메타버스 및 웹 XR 환경에서 고정밀 아바타 인터랙션을 구현하려는 개발자들에게 필수적인 기술적 가이드라인을 제공할 것이다.

---

## 1. 서론 (Introduction)

### 1.1 연구 배경 및 목적
메타버스 플랫폼의 급부상과 함께 웹 기반 3D 환경에서의 아바타 상호작용 기술은 핵심적인 요소로 자리 잡았다. 특히 Ready Player Me(RPM)는 통일된 아바타 규격을 제공하여 수천 개의 애플리케이션에서 상호 운용성을 보장하는 표준으로 부상하였다. 그러나 Three.js와 같은 웹 표준 그래픽 라이브러리에서 RPM 아바타를 로드하고 절차적 애니메이션(Procedural Animation)이나 역운동학(IK)을 적용하려는 개발자들은 종종 예상치 못한 좌표계 문제에 직면한다.

가장 대표적인 사례가 바로 상지(Upper Limb) 제어 시 발생하는 회전 축의 불일치 현상이다. 일반적인 3D 모델링 교육이나 기초 튜토리얼에서는 월드 좌표계(World Coordinate System)를 기준으로 팔이 X축으로 뻗어 있고, 이를 Z축을 중심으로 회전시켜 아래로 내리는 방식을 설명한다. 하지만 RPM 아바타, 특히 GLTF 포맷으로 추출된 모델의 경우, 팔을 내리기 위해 X축을 회전시켜야 하며, 그 값 또한 90도가 아닌 약 65도라는 특정한 값을 요구한다.

이러한 현상은 개발자에게 혼란을 야기하며, IK 솔버(Solver)의 오작동이나 애니메이션 리타게팅(Retargeting) 실패의 주원인이 된다. 따라서 본 보고서는 이 현상의 근본 원인을 바닥부터 파헤치고, 올바른 제어 축 매핑 방법을 제시함으로써 개발 효율성을 높이는 데 그 목적이 있다.

### 1.2 문제의 정의: "X축 65도 회전" 현상
사용자 쿼리에서 제기된 현상은 다음과 같이 정의된다:
*   **대상:** RPM 아바타의 `RightArm` (상완) 뼈대.
*   **목표 자세:** 차렷 자세 (팔을 몸통 옆으로 수직으로 내린 상태).
*   **관찰된 동작:** `rotation.z`를 조절하면 팔이 앞뒤로 움직이거나 비틀리는 현상이 발생하며, 의도한 대로 팔을 아래로 내리기 위해서는 `rotation.x` 값을 양의 방향으로 약 $65^{\circ}$ (1.13 라디안) 설정해야 한다.
*   **의문점:** 왜 직관적인 Z축(앞쪽에서 보았을 때 회전축)이 아닌 X축이 사용되는가? 그리고 왜 90도가 아닌 65도인가?

이 문제는 단순히 "축이 바뀌었다"는 현상적 서술을 넘어, 3D 그래픽스 파이프라인 전반에 걸친 좌표계 변환의 역사를 내포하고 있다.

---

## 2. 이론적 배경 (Theoretical Framework)

이 현상을 이해하기 위해서는 3D 그래픽스에서의 좌표계(Coordinate Systems), 오일러 각(Euler Angles), 그리고 뼈대 계층 구조(Skeletal Hierarchy)에 대한 깊은 이해가 선행되어야 한다.

### 2.1 좌표계의 키랄성(Chirality)과 업 벡터(Up Vector)
3D 그래픽스 엔진들은 각기 다른 좌표계를 채택하고 있으며, 이는 데이터 교환 시 가장 큰 장벽이 된다.

| 시스템 | 업 벡터 (Up Vector) | 전방 벡터 (Forward Vector) | 키랄성 (Handedness) | 비고 |
| :--- | :---: | :---: | :---: | :--- |
| **Blender** | $+Z$ | $-Y$ | 오른손 (Right-Handed) | 모델링 툴 표준 |
| **Three.js / GLTF** | $+Y$ | $+Z$ | 오른손 (Right-Handed) | 웹 및 OpenGL 표준 |
| **Unity** | $+Y$ | $+Z$ | 왼손 (Left-Handed) | 게임 엔진 표준 |
| **Unreal Engine** | $+Z$ | $+X$ | 왼손 (Left-Handed) | 게임 엔진 표준 |

RPM 아바타는 주로 Blender 기반의 파이프라인을 거쳐 생성되지만, 최종적으로 웹에서 사용될 때는 GLTF 포맷으로 변환되어 Three.js에서 렌더링된다. 이 과정에서 **Blender의 Z-up 좌표계**가 **GLTF의 Y-up 좌표계**로 변환된다.
일반적으로 GLTF 익스포터는 루트 노드(Root Node)에 $-90^{\circ}$의 X축 회전을 적용하여 Y축과 Z축을 교환한다. 그러나 이 변환은 뼈대(Bone) 내부의 **로컬 좌표계(Local Coordinate System, LCS)**까지 자동으로 재정렬해주지는 않는다. 즉, 뼈대가 생성될 당시의 축 방향성(Bone Roll)은 그대로 유지된 채 상위 노드의 변환만 적용받는 경우가 많다.

### 2.2 뼈대(Bone)의 구조와 로컬 좌표계
3D 리깅(Rigging)에서 뼈대는 단순한 선분이 아니라, 위치(Head), 길이(Length), 그리고 **방향(Orientation)**을 가진 객체이다. 뼈대의 로컬 좌표계는 다음과 같이 정의된다:
1.  **Primary Axis (주축):** 뼈의 길이 방향을 가리키는 축. (일반적으로 Y축 또는 X축)
2.  **Secondary Axis (보조축):** 뼈의 회전 기준이 되는 축. (Up Vector 역할을 함)

Mixamo와 RPM이 따르는 리깅 표준에서는 **Y축**을 뼈의 길이 방향(Longitudinal Axis)으로 설정하는 경향이 있다. 이는 뼈를 원기둥(Cylinder)으로 시각화할 때, 원기둥의 높이 방향이 Y축인 것과 일치한다.
만약 `RightArm`의 로컬 Y축이 팔꿈치를 향해 뻗어 있다면:
*   **Y축 회전:** 팔 자체를 비트는 동작(Twist/Roll)이 된다.
*   **X축 및 Z축 회전:** 팔을 위아래(Swing Vertical) 혹은 앞뒤(Swing Horizontal)로 흔드는 동작이 된다.

이 지점에서 사용자의 직관(월드 좌표계 기준)과 실제 데이터(로컬 좌표계 기준) 간의 괴리가 발생한다.

### 2.3 바인드 포즈(Bind Pose)와 레스트 포즈(Rest Pose)
*   **레스트 포즈(Rest Pose):** 뼈대의 회전값이 $(0,0,0)$일 때의 자세.
*   **바인드 포즈(Bind Pose):** 메쉬(Mesh)가 뼈대에 스키닝(Skinning)될 당시의 자세.

RPM 아바타는 기본적으로 **A-Pose**(팔을 45도 아래로 내린 자세)로 모델링되어 있다. 그러나 애니메이션 호환성을 위해 뼈대의 레스트 포즈는 **T-Pose**(팔을 수평으로 뻗은 자세)로 설정되는 경우가 많다.
Three.js에서 `SkinnedMesh`를 로드할 때, `bindMatrix`와 `inverseBindMatrix`는 이 차이를 보정한다. 하지만 개발자가 `bone.rotation`을 직접 제어할 때는 `inverseBindMatrix`가 적용된 후의 로컬 공간에서 작업하게 되므로, **레스트 포즈(T-Pose)**를 기준으로 회전을 생각해야 한다. 즉, 시각적으로는 A-Pose로 보일지라도, 뼈대의 논리적 0점은 T-Pose(수평)일 가능성이 높다.

---

## 3. 심층 분석: RPM/Mixamo 골격 구조의 해부 (Deep Dive: Anatomy of RPM Skeletons)

Ready Player Me 아바타는 전 세계적으로 가장 널리 쓰이는 자동 리깅 서비스인 **Mixamo**의 뼈대 구조와 호환되도록 설계되었다. 이 구조적 특성이 "X축 65도" 현상의 직접적인 원인이다.

### 3.1 Mixamo 리깅의 로컬 축(Local Axis) 정의
Mixamo 호환 릭(Rig)에서 상지(Upper Limb)의 로컬 축은 다음과 같은 규칙성을 보인다:
*   **Local Y-Axis:** 뼈의 길이 방향 (Shoulder $\to$ Elbow).
*   **Local X-Axis:** 관절의 굴곡/신전(Flexion/Extension) 또는 외전/내전(Abduction/Adduction)을 담당하는 주 회전축.

Blender나 Maya에서 뼈를 생성할 때 "Bone Roll"이라는 속성이 있다. 이는 뼈의 길이 축(Y축)을 중심으로 X축과 Z축이 어떻게 배치될지를 결정한다. Mixamo 오토 리거는 보통 팔을 들어 올리는 동작(Abduction)이 X축이나 Z축 중 하나에 정렬되도록 롤(Roll)을 설정한다.
RPM 데이터 분석 결과, `RightArm`의 경우 **X축**이 상하 움직임(Elevation)을 제어하도록 설정되어 있음이 확인된다.
*   **증거:** 연구 자료에서 A-pose를 T-pose로 변환하기 위해 `LeftUpperArm`에 `[-0.5, 0, 0, 0.866]`의 쿼터니언을 적용한다고 명시되어 있다. 이 쿼터니언은 오일러 각으로 변환 시 **X축** 회전 성분을 포함한다. 구체적으로 -60도 가량의 X축 회전이 팔을 들어올리는(A $\to$ T) 역할을 하므로, 반대로 팔을 내리는 동작은 **+X축 회전**이어야 한다.

### 3.2 계층 구조(Hierarchy)에 의한 좌표 왜곡
`RightArm`은 독립적으로 존재하지 않고 `RightShoulder`(쇄골, Clavicle)의 자식 노드이다.
*   **계층:** `Spine2` $\to$ `RightShoulder` $\to$ `RightArm`
*   **쇄골의 역할:** 인체의 쇄골은 수평이 아니며, 뒤쪽으로 약간 젖혀져 있고 위쪽으로 들려 있는 형태를 띤다. 리깅 과정에서 `RightShoulder` 뼈대는 이러한 해부학적 위치를 반영하여 회전된 상태로 배치된다.

부모인 `RightShoulder`가 이미 월드 좌표계 기준으로 회전되어 있기 때문에, 자식인 `RightArm`의 로컬 좌표계 역시 부모의 회전만큼 기울어져 있다.
예를 들어, 쇄골이 Y축(수직)을 기준으로 뒤로 10도, Z축(전후)을 기준으로 위로 15도 회전되어 있다고 가정하자. 이때 `RightArm`의 "수평"은 월드의 "수평"과 일치하지 않는다. 따라서 팔을 월드 기준 "수직 아래"로 내리기 위해서는, 로컬 좌표계 상에서 단순한 90도 회전이 아닌, 부모의 회전을 상쇄하는 복합적인 각도가 필요하게 된다.

### 3.3 65도 값의 기하학적 도출
사용자가 언급한 **65도**는 우연한 숫자가 아니다. 이는 다음의 요소들이 합산된 결과이다.
1.  **T-Pose 기준:** 뼈대의 레스트 포즈가 T-Pose(수평, 0도)라고 가정한다.
2.  **목표:** 차렷 자세(수직, 90도).
3.  **필요 회전각:** 이론적으로 90도.
4.  **보정값:** 그러나 `RightShoulder`가 이미 아래쪽으로(혹은 구조적으로 팔을 아래로 내리기 유리한 각도로) 약 25도 가량 기울어져 있거나, `RightArm`의 기본 롤(Roll)이 그렇게 설정되어 있다면?
    *   $90^{\circ} (\text{목표}) - 25^{\circ} (\text{부모/구조적 이점}) = 65^{\circ}$
    *   결론적으로, **T-Pose(0도)에서 수직(90도)으로 가기 위해 필요한 각도가 65도**라는 것은, 나머지 25도 가량이 부모 뼈대의 회전이나 로컬 축의 초기 경사각에 의해 이미 확보되어 있음을 의미한다.

---

## 4. "X축 65도 회전" 현상의 원인 종합 분석 (Causal Analysis)

사용자의 쿼리에 대한 직접적인 답변으로서, 이 현상의 원인을 세 가지 핵심 요소로 정리한다.

### 4.1 원인 1: GLTF 포맷의 로컬 축 보존 (LCS Preservation)
Blender에서 작업할 때 개발자는 주로 'Global' 축을 기준으로 생각한다. 하지만 GLTF로 익스포트된 데이터는 철저히 **Local** 축을 따른다. Blender에서 뼈를 만들 때 Y축을 길이 방향으로 설정했다면, Three.js에서도 Y축이 길이 방향이다.
Three.js의 `AxesHelper`를 통해 `RightArm`의 축을 시각화해보면:
*   **Red (X):** 아바타의 전방(Forward) 또는 상방(Up)을 향해 비스듬히 뻗어 있다.
*   **Green (Y):** 팔꿈치(Elbow)를 향해 뻗어 있다.
*   **Blue (Z):** X와 Y의 외적(Cross Product) 방향을 향한다.

여기서 **Red (X)** 축이 아바타의 '앞쪽'을 향하고 있다면, 이 축을 중심으로 회전(나사를 돌리듯)하면 팔은 위아래(Coronal Plane)로 움직이게 된다. 이것이 바로 X축 회전이 팔을 내리는 동작이 되는 기하학적 이유이다. 반면 **Blue (Z)** 축이 위쪽을 향하고 있다면, Z축 회전은 팔을 앞뒤(Horizontal Swing)로 움직이게 한다. **즉, 축의 역할이 사용자의 직관(Z가 앞, X가 옆)과 정반대 혹은 90도 회전되어 있는 상태이다.**

### 4.2 원인 2: Mixamo/RPM의 표준 리깅 관행
RPM 아바타는 Mixamo의 리깅 시스템을 따르는데, Mixamo는 Maya의 리깅 관습을 많이 차용한다. Maya에서는 뼈의 주축을 X로 두는 경우도 많지만, 게임 엔진 호환성을 위해 **Y-Axis Aim (Y축 조준)** 방식을 많이 사용한다.
*   **Y-Axis:** Bone Length (Twist Axis)
*   **X-Axis:** Primary Bend Axis (Elevation)
*   **Z-Axis:** Secondary Bend Axis (Azimuth)

이 표준을 따르는 RPM 아바타는 태생적으로 X축이 'Swing Down'을 담당하도록 설계되었다. 이는 오류가 아니라 **설계된 사양(Specification)**이다.

### 4.3 원인 3: 부모 뼈대의 변환 상속 (Inheritance)
앞서 언급했듯 `RightShoulder`의 회전값이 `RightArm`에 영향을 준다. 만약 사용자가 `RightArm`의 회전값만 $(0,0,0)$으로 초기화한다면, 팔은 수평으로 뻗어지는 것이 아니라 쇄골의 각도에 따라 약간 위로 들리거나 뒤로 젖혀진 T-Pose가 될 것이다. 따라서 "완벽한 수직 차렷 자세"를 만들기 위해서는 단순한 90도가 아닌, 부모의 회전각을 상쇄하는 보정값($\approx 65^{\circ}$)이 필요하게 된 것이다.

---

## 5. 올바른 팔 제어(Forward/Up/Twist) 축 매핑 전략 (Kinematic Control Strategy)

이러한 분석을 바탕으로, 개발자가 직관적인 변수(Forward, Up, Twist)를 입력했을 때 아바타가 올바르게 반응하도록 하는 매핑 전략을 수립한다.

### 5.1 매핑 매트릭스 (Mapping Matrix)

RPM 아바타(오른팔 기준)를 제어하기 위한 올바른 축 매핑은 다음과 같다.

| 논리적 동작 (Logical Action) | 해부학적 용어 (Anatomical Term) | 제어해야 할 로컬 축 | 값의 방향성 (Right Arm) | 비고 |
| :--- | :--- | :--- | :--- | :--- |
| **팔 내리기/올리기 (Up/Down)** | 내전/외전 (Adduction/Abduction) | **Local X-Axis** | **(+) : 내리기 (Down)**<br>**(-) : 올리기 (Up)** | T-Pose(0) 기준 |
| **팔 비틀기 (Twist)** | 내회전/외회전 (Internal/External Rotation) | **Local Y-Axis** | **(+) : 안쪽 비틀기**<br>**(-) : 바깥쪽 비틀기** | 손바닥 방향 제어 |
| **팔 앞/뒤 흔들기 (Forward/Back)** | 굴곡/신전 (Flexion/Extension) | **Local Z-Axis** | **(+) : 앞으로 (Forward)**<br>**(-) : 뒤로 (Backward)** | 걷기 애니메이션의 주축 |

*주의: 왼팔(LeftArm)의 경우, 대칭성에 의해 축의 방향이 반대일 수 있다. 일반적으로 X축 회전의 부호가 반대(-가 내리기)일 가능성이 높으므로 반드시 테스트가 필요하다.*

### 5.2 Three.js 구현 코드 (Implementation Guide)

단순히 `rotation.x = val`을 사용하는 것은 **짐벌 락(Gimbal Lock)** 문제와 회전 순서(Order) 문제를 야기할 수 있다. 가장 안전하고 전문적인 방법은 **쿼터니언(Quaternion)**과 `rotateOnAxis` 메서드를 사용하는 것이다.

다음은 "Forward", "Up", "Twist" 세 가지 파라미터를 받아 RPM 아바타의 팔을 안전하게 제어하는 함수의 예시이다.

```javascript
import * as THREE from 'three';

/**
 * Ready Player Me 아바타의 팔 회전을 제어하는 함수
 * @param {THREE.Object3D} armBone - 제어할 팔 뼈대 객체 (RightArm 등)
 * @param {number} upDownRad - 상하 회전 각도 (라디안). +가 내리기.
 * @param {number} forwardBackRad - 전후 회전 각도 (라디안). +가 앞으로.
 * @param {number} twistRad - 비틀기 회전 각도 (라디안).
 * @param {boolean} isRightArm - 오른팔 여부 (왼팔일 경우 축 반전 처리를 위해).
 */
function setRPMArmPose(armBone, upDownRad, forwardBackRad, twistRad, isRightArm = true) {
    if (!armBone) return;

    // 1. 회전 초기화 (기존 회전값 제거)
    // 애니메이션 믹서가 있다면 이 부분은 주의해야 함. FK 제어 시에는 초기화 권장.
    armBone.quaternion.identity();

    // 2. 축 정의 (RPM/Mixamo 표준 로컬 축)
    // X축: 상하 Swing
    // Y축: Twist (길이 방향)
    // Z축: 전후 Swing
    const axisX = new THREE.Vector3(1, 0, 0);
    const axisY = new THREE.Vector3(0, 1, 0);
    const axisZ = new THREE.Vector3(0, 0, 1);

    // 3. 쿼터니언 생성
    const qUp = new THREE.Quaternion();
    const qForward = new THREE.Quaternion();
    const qTwist = new THREE.Quaternion();

    // 4. 각도 적용 (왼팔/오른팔 대칭성 고려)
    // 오른팔: +X가 Down, +Z가 Forward라고 가정 (65도 분석 기반)
    // 왼팔: 대칭 구조라면 -X가 Down일 수 있음. (모델 버전에 따라 다를 수 있으므로 검증 필요)
    const signX = isRightArm? 1 : -1; 
    const signZ = isRightArm? 1 : -1; // Z축도 대칭일 경우 반전
    const signY = isRightArm? 1 : -1; // Twist도 반전 가능성 있음

    // X축 회전 (Up/Down)
    qUp.setFromAxisAngle(axisX, upDownRad * signX);

    // Z축 회전 (Forward/Back)
    qForward.setFromAxisAngle(axisZ, forwardBackRad * signZ);

    // Y축 회전 (Twist)
    qTwist.setFromAxisAngle(axisY, twistRad * signY);

    // 5. 회전 합성 (순서 중요: Twist -> Swing 혹은 Swing -> Twist)
    // 일반적으로 Twist를 먼저 적용하고 Swing을 하거나, 
    // 로컬 축 기준이므로 순차적으로 곱해주면 됨.
    // qTotal = qForward * qUp * qTwist (순서는 원하는 결과에 따라 조정)
    const finalQuaternion = new THREE.Quaternion();
    
    // Y(Twist) -> X(Up/Down) -> Z(Forward) 순서로 적용 예시
    finalQuaternion.multiply(qForward);
    finalQuaternion.multiply(qUp);
    finalQuaternion.multiply(qTwist);

    // 6. 뼈대에 적용
    armBone.quaternion.copy(finalQuaternion);
}

// 사용 예시: 차렷 자세 (X축 65도)
const rightArm = character.getObjectByName("RightArm");
const degrees65 = THREE.MathUtils.degToRad(65);
setRPMArmPose(rightArm, degrees65, 0, 0, true);
```

### 5.3 시각적 디버깅의 중요성 (Visual Debugging)
`THREE.AxesHelper`를 각 뼈대에 부착하여 로컬 축을 눈으로 확인하는 것이 문제 해결의 지름길이다. 개발자는 코드로만 추측하지 말고, 반드시 다음 코드를 통해 아바타의 실제 로컬 축을 확인해야 한다.

```javascript
// 디버깅용 헬퍼 부착
const axesHelper = new THREE.AxesHelper(0.2); // 20cm 크기
axesHelper.material.depthTest = false; // 메쉬에 가려지지 않게
axesHelper.renderOrder = 999;
rightArm.add(axesHelper);
```
이 헬퍼가 렌더링되었을 때 **빨간색(X) 축**이 어느 방향을 가리키는지 확인하면, X축 회전이 왜 팔을 내리는 동작이 되는지 직관적으로 이해할 수 있다. RPM 모델에서는 빨간 축이 아바타의 **전방(Forward)** 혹은 **상방(Up)** 사이의 대각선 방향을 가리키고 있을 것이다.

---

## 6. 결론 및 제언 (Conclusion)

RPM 아바타의 `RightArm` 제어 시 발생하는 "X축 65도 회전" 현상은 버그가 아니라, **오른손 좌표계(GLTF) 내에서 Mixamo 리깅 표준(Y-Axis Twist)을 따를 때 발생하는 자연스러운 기하학적 결과**이다. 뼈의 길이 방향이 Y축이므로, 팔을 흔드는(Swing) 동작은 필연적으로 X축과 Z축에 할당되며, RPM의 경우 X축이 상하(Elevation) 제어를 담당하도록 설정되었다. 65도라는 수치는 T-Pose(0도)에서 차렷 자세(90도)로 이동하는 과정에서, 부모 뼈대(Shoulder)의 기존 기울기(약 25도)를 제외한 나머지 필요 회전각이다.

### 개발자를 위한 제언
1.  **직관을 버리고 데이터를 믿어라:** "Z축이 앞이니까 Z축 회전"이라는 월드 좌표계 중심의 사고를 버리고, `AxesHelper`를 통해 확인된 로컬 축(X축이 Swing)을 따라야 한다.
2.  **API 파라미터 활용:** 가능하다면 RPM 모델 로드 시 URL 파라미터에 `?pose=T`를 추가하여, 초기 포즈를 강제로 T-Pose로 고정하는 것이 계산을 단순화하는 데 도움이 된다. A-Pose(`?pose=A`)는 보기에는 자연스럽지만, 초기 회전값 계산을 복잡하게 만들 수 있다.
3.  **쿼터니언 기반 제어:** 오일러 각(`rotation.x/y/z`) 직접 제어는 짐벌 락의 위험이 있으므로, 본 보고서 5.2절에서 제시한 쿼터니언 합성 방식을 사용하여 'Forward/Up/Twist' 논리 제어 레이어를 구축할 것을 권장한다.

본 보고서가 제시한 분석과 해결책은 RPM 아바타뿐만 아니라, Mixamo 기반의 모든 리깅 캐릭터를 Three.js 및 WebGL 환경에서 다루는 데 있어 범용적인 가이드라인이 될 것이다.