import animationData from '../../public/streamoji-animations-feminine.json';

export interface AnimationMeta {
  id: string;
  name: string;
  url: string;
}

export interface AnimationCategory {
  category: string;
  animations: AnimationMeta[];
}

// 상수로 확률 정의 (97% 확률로 차분한 대기 모션)
const PRIMARY_IDLE_WEIGHT = 0.85;

// 차분한 기본 대기 모션 그룹
export const PRIMARY_IDLE_IDS = [
  'm_idle_01',
  'm_idle_02',
  'm_idle_var_01',
  'm_idle_var_02',
];

// 허용된 대화 애니메이션 ID 목록 (13개)
export const ALLOWED_TALK_IDS = [
  'm_talk_01',
  'm_talk_02',
  'm_talk_05',
  'm_talk_06',
  'm_talk_07',
  'm_talk_08',
  'm_talk_09',
  'm_talk_10',
  'f_talk_01',
  'f_talk_03',
  'f_talk_04',
  'f_talk_05',
  'f_talk_06',
];

export const getNextAnimationUrl = (
  state: 'idle' | 'talking' | 'thinking',
  emotion?: string | null,
  excludeId?: string | null,
  forcePrimary: boolean = false
): { url: string; id: string } => {
  const data = animationData as AnimationCategory[];

  if (state === 'thinking') {
    // 생각 중 상태: 지정된 몇 가지 애니메이션 중 선택
    const thinkingIds = ['m_expr_14', 'm_expr_05', 'm_expr_06'];
    const exprCat = data.find(c => c.category === 'Expression');
    const anims = exprCat?.animations.filter(a => thinkingIds.includes(a.id)) || [];
    return selectRandomAnim(anims, excludeId) || getDefault(state);
  }

  if (state === 'talking') {
    // 대화 중 상태
    const exprCat = data.find(c => c.category === 'Expression');
    if (emotion === 'happy') {
      const anim = exprCat?.animations.find(a => a.id === 'f_talk_01');
      if (anim) return { url: anim.url, id: anim.id };
    }
    if (emotion === 'surprised') {
      const anim = exprCat?.animations.find(a => a.id === 'm_expr_11');
      if (anim) return { url: anim.url, id: anim.id };
    }

    // 지정된 ID 목록으로만 정확하게 랜덤 선택
    const talkAnims = exprCat?.animations.filter(a => ALLOWED_TALK_IDS.includes(a.id)) || [];
    return selectRandomAnim(talkAnims, excludeId) || getDefault(state);
  }

  // idle 상태 (가중치 기반 선택)
  const idleCat = data.find(c => c.category === 'Idle');
  let idleAnims = idleCat?.animations || [];

  // 특정 애니메이션(Idle Var 10) 및 Soft var 시리즈(f_idle로 시작) 제외
  idleAnims = idleAnims.filter(a => a.id !== 'm_idle_var_10' && !a.id.startsWith('f_idle'));

  const primaryAnims = idleAnims.filter(a => PRIMARY_IDLE_IDS.includes(a.id));
  const secondaryAnims = idleAnims.filter(a => !PRIMARY_IDLE_IDS.includes(a.id));

  // 강제 기본 동작 선택 플래그가 있거나, 확률적으로 기본 동작 선택
  const rand = Math.random();
  if ((forcePrimary || rand < PRIMARY_IDLE_WEIGHT) && primaryAnims.length > 0) {
    return selectRandomAnim(primaryAnims, excludeId) || getDefault(state);
  } else if (secondaryAnims.length > 0) {
    return selectRandomAnim(secondaryAnims, excludeId) || getDefault(state);
  }

  // Fallback
  return selectRandomAnim(idleAnims, excludeId) || getDefault(state);
};

function selectRandomAnim(anims: AnimationMeta[], excludeId?: string | null) {
  if (!anims || anims.length === 0) return null;
  let candidates = anims;
  if (excludeId && anims.length > 1) {
    candidates = anims.filter(a => a.id !== excludeId);
  }
  const randomIndex = Math.floor(Math.random() * candidates.length);
  return { url: candidates[randomIndex].url, id: candidates[randomIndex].id };
}

function getDefault(state: string) {
  if (state === 'talking') return { id: 'f_talk_01', url: 'https://pub-be53cae7bd99457a8c1f11b4d38f1672.r2.dev/femenine/expression/F_Talking_Variations_001.glb' };
  if (state === 'thinking') return { id: 'm_expr_14', url: 'https://pub-be53cae7bd99457a8c1f11b4d38f1672.r2.dev/femenine/expression/M_Standing_Expressions_014.glb' };
  return { id: 'm_idle_01', url: 'https://pub-be53cae7bd99457a8c1f11b4d38f1672.r2.dev/femenine/idle/M_Standing_Idle_001.glb' };
}
