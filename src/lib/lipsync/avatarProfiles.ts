import { AVATARS } from '@/lib/avatarConstants';
import type { AvatarLipProfile } from './types';

export const DEFAULT_AVATAR_LIP_PROFILE: AvatarLipProfile = {
  avatarId: 'default',
  jawOpenMax: 0.42,
  jawOpenBias: 0.02,
  mouthOpenBias: 0.04,
  roundnessMax: 0.45,
  spreadMax: 0.5,
  lipPressMax: 0.82,
  onsetOpenSpeed: 0.62,
  closeSpeed: 0.24,
  silenceCloseSpeed: 0.32,
  smileMouthBlend: 0.28,
  fishLipClamp: 0.72,
};

const PROFILE_OVERRIDES: Record<string, Partial<AvatarLipProfile>> = {
  Ryan: {
    jawOpenMax: 0.36,
    roundnessMax: 0.4,
    spreadMax: 0.42,
    fishLipClamp: 0.65,
  },
  Vivian: {
    spreadMax: 0.54,
    smileMouthBlend: 0.3,
  },
  Aiden: {
    jawOpenMax: 0.38,
    lipPressMax: 0.76,
  },
  Serena: {
    mouthOpenBias: 0.05,
    roundnessMax: 0.42,
  },
};

export const AVATAR_LIP_PROFILES: Record<string, AvatarLipProfile> = AVATARS.reduce(
  (profiles, avatar) => {
    profiles[avatar.id] = {
      ...DEFAULT_AVATAR_LIP_PROFILE,
      avatarId: avatar.id,
      ...PROFILE_OVERRIDES[avatar.id],
    };
    return profiles;
  },
  {} as Record<string, AvatarLipProfile>,
);

export function getAvatarLipProfile(avatarId: string): AvatarLipProfile {
  return AVATAR_LIP_PROFILES[avatarId] ?? { ...DEFAULT_AVATAR_LIP_PROFILE, avatarId };
}
