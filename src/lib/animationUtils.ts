import animationData from '../../public/streamoji-animations-feminine.json';
import { LoopOnce, LoopRepeat, type AnimationAction } from 'three';

export type AvatarAnimationState = 'idle' | 'talking';

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

// Looking-around motion should remain available, but appear much less often.
export const IDLE_ANIMATION_WEIGHTS: Record<string, number> = {
  m_idle_var_01: 0.25,
  m_idle_var_02: 0.5,
};

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

export function isOneShotIdleAnimation(id?: string | null): boolean {
  return Boolean(id?.startsWith('m_idle_var_'));
}

export function prepareAnimationAction(
  action: AnimationAction,
  state: AvatarAnimationState,
  id: string
): boolean {
  const isOneShot = state === 'idle' && isOneShotIdleAnimation(id);

  action.reset();
  action.setEffectiveTimeScale(1);
  action.setEffectiveWeight(1);
  action.setLoop(isOneShot ? LoopOnce : LoopRepeat, isOneShot ? 1 : Infinity);
  action.clampWhenFinished = isOneShot;

  return isOneShot;
}

export function shouldAdvanceIdleAfterFinish(
  finishedAction: AnimationAction,
  currentAction: AnimationAction | null,
  isPlaying: boolean,
  currentId?: string | null
): boolean {
  return finishedAction === currentAction && !isPlaying && isOneShotIdleAnimation(currentId);
}

export const getNextAnimationUrl = (
  state: AvatarAnimationState,
  emotion?: string | null,
  excludeId?: string | null,
  forcePrimary: boolean = false
): { url: string; id: string } => {
  const data = animationData as AnimationCategory[];

  // Thinking animations are temporarily disabled. Restore the 'thinking' state type
  // above and uncomment this block to re-enable them.
  // if (state === 'thinking') {
  //   const thinkingIds = ['m_expr_14', 'm_expr_05', 'm_expr_06'];
  //   const exprCat = data.find(c => c.category === 'Expression');
  //   const anims = exprCat?.animations.filter(a => thinkingIds.includes(a.id)) || [];
  //   return selectRandomAnim(anims, excludeId) || getDefault(state);
  // }

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

  // 특정 애니메이션(Idle Var 09, 10) 및 Soft var 시리즈(f_idle로 시작) 제외
  idleAnims = idleAnims.filter(
    a => !['m_idle_var_09', 'm_idle_var_10'].includes(a.id) && !a.id.startsWith('f_idle')
  );

  const primaryAnims = idleAnims.filter(a => PRIMARY_IDLE_IDS.includes(a.id));
  const secondaryAnims = idleAnims.filter(a => !PRIMARY_IDLE_IDS.includes(a.id));

  // 강제 기본 동작 선택 플래그가 있거나, 확률적으로 기본 동작 선택
  const rand = Math.random();
  if ((forcePrimary || rand < PRIMARY_IDLE_WEIGHT) && primaryAnims.length > 0) {
    return selectRandomAnim(primaryAnims, excludeId, IDLE_ANIMATION_WEIGHTS) || getDefault(state);
  } else if (secondaryAnims.length > 0) {
    return selectRandomAnim(secondaryAnims, excludeId, IDLE_ANIMATION_WEIGHTS) || getDefault(state);
  }

  // Fallback
  return selectRandomAnim(idleAnims, excludeId, IDLE_ANIMATION_WEIGHTS) || getDefault(state);
};

function selectRandomAnim(
  anims: AnimationMeta[],
  excludeId?: string | null,
  weights?: Record<string, number>
) {
  if (!anims || anims.length === 0) return null;
  let candidates = anims;
  if (excludeId && anims.length > 1) {
    candidates = anims.filter(a => a.id !== excludeId);
  }

  const totalWeight = candidates.reduce(
    (sum, animation) => sum + Math.max(0, weights?.[animation.id] ?? 1),
    0
  );
  if (totalWeight <= 0) return null;

  let threshold = Math.random() * totalWeight;
  for (const animation of candidates) {
    threshold -= Math.max(0, weights?.[animation.id] ?? 1);
    if (threshold < 0) return { url: animation.url, id: animation.id };
  }

  const fallback = candidates[candidates.length - 1];
  return { url: fallback.url, id: fallback.id };
}

function getDefault(state: string) {
  if (state === 'talking') return { id: 'f_talk_01', url: 'https://pub-be53cae7bd99457a8c1f11b4d38f1672.r2.dev/femenine/expression/F_Talking_Variations_001.glb' };
  // Thinking animation fallback is temporarily disabled.
  // if (state === 'thinking') return { id: 'm_expr_14', url: 'https://pub-be53cae7bd99457a8c1f11b4d38f1672.r2.dev/femenine/expression/M_Standing_Expressions_014.glb' };
  return { id: 'm_idle_01', url: 'https://pub-be53cae7bd99457a8c1f11b4d38f1672.r2.dev/femenine/idle/M_Standing_Idle_001.glb' };
}
