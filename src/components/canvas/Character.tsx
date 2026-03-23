'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useGLTF, useAnimations } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useStore } from '@/stores/useStore';
import * as THREE from 'three';
import { GLTFLoader } from 'three-stdlib';
import { getNextAnimationUrl, PRIMARY_IDLE_IDS } from '@/lib/animationUtils';
import { AVATARS } from '@/lib/avatarConstants';
import { getAvatarLipProfile } from '@/lib/lipsync/avatarProfiles';
import { createLipSyncDebugSnapshot } from '@/lib/lipsync/debugSnapshot';
import { createFeatureExtractorState, extractAudioFeatures } from '@/lib/lipsync/featureExtractor';
import { classifyHeuristicViseme } from '@/lib/lipsync/heuristicClassifier';
import { createSpeechState, updateSpeechState } from '@/lib/lipsync/speechStateMachine';
import { resolveTimelineFrame } from '@/lib/lipsync/timelineResolver';
import { mixVisemeFrame } from '@/lib/lipsync/visemeMixer';

export const AVATAR_CONFIGS = AVATARS.reduce((acc, avatar) => {
    acc[avatar.id] = {
        file: avatar.modelPath,
        baseY: -0.5,
        scale: 1.7,
    };
    return acc;
}, {} as Record<string, { file: string; baseY: number; scale: number }>);

const DEFAULT_ANIMS = {
    idle: 'https://pub-be53cae7bd99457a8c1f11b4d38f1672.r2.dev/femenine/idle/M_Standing_Idle_001.glb',
    thinking: 'https://pub-be53cae7bd99457a8c1f11b4d38f1672.r2.dev/femenine/expression/M_Standing_Expressions_014.glb',
    talking: 'https://pub-be53cae7bd99457a8c1f11b4d38f1672.r2.dev/femenine/expression/F_Talking_Variations_001.glb',
};

try {
    useGLTF.preload(AVATAR_CONFIGS['Sohee'].file);
    useGLTF.preload(AVATAR_CONFIGS['Ryan']?.file || AVATAR_CONFIGS['Sohee'].file);
    useGLTF.preload(DEFAULT_ANIMS.idle);
    useGLTF.preload(DEFAULT_ANIMS.thinking);
    useGLTF.preload(DEFAULT_ANIMS.talking);
} catch (e) {
    console.error('Asset Preload Error:', e);
}

function applyMorph(
    dict: Record<string, number>,
    influences: number[],
    name: string,
    target: number,
    openSpeed = 0.45,
    closeSpeed = 0.25,
) {
    const index = dict[name];
    if (index === undefined) return;
    const current = influences[index] ?? 0;
    const speed = target > current ? openSpeed : closeSpeed;
    influences[index] = THREE.MathUtils.lerp(current, target, speed);
}

export const Character = React.memo(function Character() {
    const currentAvatarId = useStore((state) => state.currentAvatarId);
    const config = AVATAR_CONFIGS[currentAvatarId] || AVATAR_CONFIGS['Sohee'];

    const group = useRef<THREE.Group>(null);
    const headMeshRef = useRef<THREE.SkinnedMesh | null>(null);
    const teethMeshRef = useRef<THREE.SkinnedMesh | null>(null);
    const neckRef = useRef<THREE.Bone | null>(null);
    const leftEyeRef = useRef<THREE.Bone | null>(null);
    const rightEyeRef = useRef<THREE.Bone | null>(null);
    const frequencyDataRef = useRef<Uint8Array | null>(null);
    const timeDomainDataRef = useRef<Uint8Array | null>(null);
    const featureStateRef = useRef(createFeatureExtractorState());
    const speechStateRef = useRef(createSpeechState());
    const smoothVolume = useRef(0);

    const audioAnalyser = useStore((state) => state.audioAnalyser);
    const emotion = useStore((state) => state.emotion);
    const isThinking = useStore((state) => state.isThinking);
    const isPlaying = useStore((state) => state.isPlaying);
    const ttsSegments = useStore((state) => state.ttsSegments);
    const lipSyncDebugEnabled = useStore((state) => state.lipSyncDebugEnabled);
    const setEmotion = useStore((state) => state.setEmotion);
    const setLipSyncMode = useStore((state) => state.setLipSyncMode);
    const setCurrentLipSyncSnapshot = useStore((state) => state.setCurrentLipSyncSnapshot);

    const stateRef = useRef({ isThinking, isPlaying, emotion, ttsSegments, currentAvatarId });
    useEffect(() => {
        stateRef.current = { isThinking, isPlaying, emotion, ttsSegments, currentAvatarId };
    }, [isThinking, isPlaying, emotion, ttsSegments, currentAvatarId]);

    useEffect(() => {
        if (!isPlaying && emotion !== 'neutral') {
            const resetTimer = setTimeout(() => {
                setEmotion('neutral');
            }, 1000);
            return () => clearTimeout(resetTimer);
        }
    }, [isPlaying, emotion, setEmotion]);

    const clipCache = useRef<Record<string, THREE.AnimationClip>>({});
    const currentActionRef = useRef<THREE.AnimationAction | null>(null);
    const currentAnimIdRef = useRef<string | null>(null);
    const transitionIdRef = useRef<string | null>(null);
    const isLastAnimSecondaryRef = useRef(false);
    const hasPlayedEmotionAnimation = useRef(false);
    const animTimerRef = useRef(0);
    const animTargetTimeRef = useRef(5);
    const blinkTimer = useRef(0);
    const [initialBlinkTime] = useState(() => Math.random() * 1.5 + 1.5);
    const nextBlinkTime = useRef(initialBlinkTime);
    const blinkCount = useRef(0);
    const isBlinking = useRef(false);
    const [initialNoiseOffset] = useState(() => Math.random() * 100);
    const noiseOffset = useRef(initialNoiseOffset);
    const eyeTarget = useRef(new THREE.Vector2(0, 0));
    const eyeCurrent = useRef(new THREE.Vector2(0, 0));
    const nextSaccadeTime = useRef(0);
    const saccadeTimer = useRef(0);

    const { scene } = useGLTF(config.file) as unknown as { scene: THREE.Group };
    const idleRes = useGLTF(DEFAULT_ANIMS.idle) as unknown as { animations: THREE.AnimationClip[] };
    const thinkingRes = useGLTF(DEFAULT_ANIMS.thinking) as unknown as { animations: THREE.AnimationClip[] };
    const talkingRes = useGLTF(DEFAULT_ANIMS.talking) as unknown as { animations: THREE.AnimationClip[] };

    const { mixer } = useAnimations([], group);

    useEffect(() => {
        if (!scene) return;
        scene.traverse((child: THREE.Object3D) => {
            const mesh = child as THREE.Mesh & THREE.SkinnedMesh;
            const bone = child as THREE.Bone;

            if (mesh.isMesh && mesh.material) {
                if (Array.isArray(mesh.material)) {
                    mesh.material.forEach((material) => {
                        material.depthWrite = true;
                        material.depthTest = true;
                    });
                } else {
                    mesh.material.depthWrite = true;
                    mesh.material.depthTest = true;
                }
            }

            if (mesh.isSkinnedMesh) {
                if (mesh.name.includes('Head')) {
                    headMeshRef.current = mesh;
                    mesh.frustumCulled = false;
                }
                if (mesh.name.includes('Teeth')) {
                    teethMeshRef.current = mesh;
                    mesh.frustumCulled = false;
                }
            }

            if (bone.isBone) {
                if (bone.name === 'Neck') neckRef.current = bone;
                if (bone.name === 'LeftEye') leftEyeRef.current = bone;
                if (bone.name === 'RightEye') rightEyeRef.current = bone;
            }
        });
    }, [scene]);

    useEffect(() => {
        if (idleRes?.animations?.[0]) clipCache.current[DEFAULT_ANIMS.idle] = idleRes.animations[0];
        if (thinkingRes?.animations?.[0]) clipCache.current[DEFAULT_ANIMS.thinking] = thinkingRes.animations[0];
        if (talkingRes?.animations?.[0]) clipCache.current[DEFAULT_ANIMS.talking] = talkingRes.animations[0];

        if (mixer && idleRes?.animations?.[0] && !currentActionRef.current) {
            const clip = idleRes.animations[0];
            const action = mixer.clipAction(clip);
            action.setEffectiveWeight(1.0);
            action.play();
            currentActionRef.current = action;
            currentAnimIdRef.current = 'm_idle_01';
        }
    }, [idleRes, thinkingRes, talkingRes, mixer]);

    const triggerSequentialTransition = useCallback(async (
        url: string,
        id: string,
        fadeDuration = 0.5,
        targetState: 'idle' | 'talking' | 'thinking',
    ) => {
        const requestId = Math.random().toString(36).substring(7);
        transitionIdRef.current = requestId;

        if (!mixer) return;

        let clip = clipCache.current[url];
        if (!clip) {
            try {
                const gltf = await new GLTFLoader().loadAsync(url);
                clip = gltf.animations[0];
                clipCache.current[url] = clip;
            } catch (e) {
                console.error('Animation Load Error:', e);
                return;
            }
        }

        if (transitionIdRef.current !== requestId) return;

        const nextAction = mixer.clipAction(clip);
        if (nextAction === currentActionRef.current) return;

        if (targetState === 'idle') {
            const isPrimary = PRIMARY_IDLE_IDS.includes(id);
            animTargetTimeRef.current = isPrimary ? Math.random() * 3 + 5 : Math.max(clip.duration, 1.5);
            isLastAnimSecondaryRef.current = !isPrimary;
        } else {
            animTargetTimeRef.current = Math.max(clip.duration - fadeDuration - 0.1, clip.duration * 0.5);
            isLastAnimSecondaryRef.current = false;
        }

        animTimerRef.current = 0;
        currentAnimIdRef.current = id;

        nextAction.enabled = true;
        nextAction.setEffectiveTimeScale(1);
        nextAction.setEffectiveWeight(1);
        nextAction.time = 0;
        nextAction.play();

        if (currentActionRef.current) {
            currentActionRef.current.crossFadeTo(nextAction, fadeDuration, true);
        }

        currentActionRef.current = nextAction;
    }, [mixer]);

    useEffect(() => {
        const transitionTimer = setTimeout(() => {
            let state: 'idle' | 'talking' | 'thinking' = 'idle';
            const prevState = stateRef.current;

            if (isThinking) state = 'thinking';
            else if (isPlaying) state = 'talking';

            if (!isPlaying && prevState.isPlaying) {
                hasPlayedEmotionAnimation.current = false;
            }

            const useEmotion = state === 'talking' && !hasPlayedEmotionAnimation.current && emotion !== 'neutral';
            const animInfo = getNextAnimationUrl(state, useEmotion ? emotion : null, currentAnimIdRef.current);
            if (!animInfo) return;

            if (useEmotion) {
                hasPlayedEmotionAnimation.current = true;
            }

            let fadeDuration = 0.5;
            if (isPlaying && !prevState.isPlaying) fadeDuration = 0.3;
            else if (!isPlaying && prevState.isPlaying) fadeDuration = 1.0;

            void triggerSequentialTransition(animInfo.url, animInfo.id, fadeDuration, state);
        }, 100);

        return () => clearTimeout(transitionTimer);
    }, [emotion, isPlaying, isThinking, triggerSequentialTransition]);

    useEffect(() => {
        const currentGroup = group.current;
        return () => {
            if (mixer) {
                mixer.stopAllAction();
                if (currentGroup) mixer.uncacheRoot(currentGroup);
            }
        };
    }, [mixer]);

    useFrame((state, delta) => {
        const clampedDelta = Math.min(delta, 0.033);
        const deltaMs = clampedDelta * 1000;
        const t = state.clock.elapsedTime + noiseOffset.current;

        const currentState = stateRef.current.isThinking
            ? 'thinking'
            : stateRef.current.isPlaying
              ? 'talking'
              : 'idle';

        animTimerRef.current += clampedDelta;
        if (animTimerRef.current > animTargetTimeRef.current) {
            animTimerRef.current = -100;
            const forcePrimary = isLastAnimSecondaryRef.current;
            const useEmotion =
                currentState === 'talking' &&
                !hasPlayedEmotionAnimation.current &&
                stateRef.current.emotion !== 'neutral';
            const animInfo = getNextAnimationUrl(
                currentState,
                useEmotion ? stateRef.current.emotion : null,
                currentAnimIdRef.current,
                forcePrimary,
            );

            if (animInfo) {
                if (useEmotion) {
                    hasPlayedEmotionAnimation.current = true;
                }
                void triggerSequentialTransition(animInfo.url, animInfo.id, 0.5, currentState);
            }
        }

        if (neckRef.current) {
            const volumeNod = smoothVolume.current * 0.08;
            const organicShakeX = Math.sin(t * 0.5) * 0.02;
            const organicShakeZ = Math.cos(t * 0.8) * 0.02;
            const sadTilt = stateRef.current.emotion === 'sad' ? 0.2 : 0;

            neckRef.current.rotation.x = THREE.MathUtils.lerp(
                neckRef.current.rotation.x,
                volumeNod + organicShakeX + sadTilt,
                0.1,
            );
            neckRef.current.rotation.z = THREE.MathUtils.lerp(neckRef.current.rotation.z, organicShakeZ, 0.1);
        }

        if (stateRef.current.isThinking || stateRef.current.isPlaying) {
            eyeTarget.current.set(Math.sin(t * 2) * 0.02, Math.sin(t * 1.5) * 0.01);
        } else {
            saccadeTimer.current += clampedDelta;
            if (saccadeTimer.current > nextSaccadeTime.current) {
                saccadeTimer.current = 0;
                nextSaccadeTime.current = Math.random() * 3 + 2;
                eyeTarget.current.set((Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.1);
            }
        }
        eyeCurrent.current.lerp(eyeTarget.current, clampedDelta * 5);

        if (leftEyeRef.current) {
            leftEyeRef.current.rotation.y = eyeCurrent.current.x;
            leftEyeRef.current.rotation.x = eyeCurrent.current.y;
        }
        if (rightEyeRef.current) {
            rightEyeRef.current.rotation.y = eyeCurrent.current.x;
            rightEyeRef.current.rotation.x = eyeCurrent.current.y;
        }

        const head = headMeshRef.current;
        if (!head?.morphTargetDictionary || !head.morphTargetInfluences) return;

        const dict = head.morphTargetDictionary as Record<string, number>;
        const influences = head.morphTargetInfluences;
        const emotionTargets: Record<string, number> = {
            mouthSmileLeft: 0,
            mouthSmileRight: 0,
            browInnerUp: 0,
            cheekSquintLeft: 0,
            cheekSquintRight: 0,
            eyeSquintLeft: 0,
            eyeSquintRight: 0,
            mouthFrownLeft: 0,
            mouthFrownRight: 0,
            eyeLookDownLeft: 0,
            eyeLookDownRight: 0,
            mouthShrugLower: 0,
            browDownLeft: 0,
            browDownRight: 0,
            browOuterUpLeft: 0,
            browOuterUpRight: 0,
            eyeWideLeft: 0,
            eyeWideRight: 0,
            eyeLookOutLeft: 0,
            eyeLookOutRight: 0,
        };

        switch (stateRef.current.emotion) {
            case 'happy':
                emotionTargets.mouthSmileLeft = 0.18;
                emotionTargets.mouthSmileRight = 0.18;
                emotionTargets.browInnerUp = 0.25;
                emotionTargets.cheekSquintLeft = 0.3;
                emotionTargets.cheekSquintRight = 0.3;
                emotionTargets.eyeSquintLeft = 0.35;
                emotionTargets.eyeSquintRight = 0.35;
                break;
            case 'sad':
                emotionTargets.browInnerUp = 0.8;
                emotionTargets.mouthFrownLeft = 0.55;
                emotionTargets.mouthFrownRight = 0.55;
                emotionTargets.eyeLookDownLeft = 0.5;
                emotionTargets.eyeLookDownRight = 0.5;
                emotionTargets.mouthShrugLower = 0.3;
                break;
            case 'angry':
                emotionTargets.browDownLeft = 0.8;
                emotionTargets.browDownRight = 0.8;
                emotionTargets.eyeSquintLeft = 0.55;
                emotionTargets.eyeSquintRight = 0.55;
                break;
            case 'surprised':
                emotionTargets.browInnerUp = 0.45;
                emotionTargets.browOuterUpLeft = 0.6;
                emotionTargets.browOuterUpRight = 0.6;
                emotionTargets.eyeWideLeft = 0.7;
                emotionTargets.eyeWideRight = 0.7;
                break;
            case 'annoyed':
                emotionTargets.browDownLeft = 0.4;
                emotionTargets.browDownRight = 0.4;
                emotionTargets.eyeLookOutLeft = 0.4;
                emotionTargets.eyeLookOutRight = 0.4;
                break;
            default:
                emotionTargets.mouthSmileLeft = 0.04;
                emotionTargets.mouthSmileRight = 0.04;
                break;
        }

        for (const [key, target] of Object.entries(emotionTargets)) {
            applyMorph(dict, influences, key, target, 0.2, 0.18);
        }

        if (audioAnalyser) {
            if (!frequencyDataRef.current || frequencyDataRef.current.length !== audioAnalyser.frequencyBinCount) {
                frequencyDataRef.current = new Uint8Array(audioAnalyser.frequencyBinCount);
                timeDomainDataRef.current = new Uint8Array(audioAnalyser.fftSize);
            }

            const features = extractAudioFeatures(
                audioAnalyser,
                frequencyDataRef.current,
                timeDomainDataRef.current ?? new Uint8Array(audioAnalyser.fftSize),
                featureStateRef.current,
            );
            smoothVolume.current = THREE.MathUtils.lerp(smoothVolume.current, features.envelope, 0.2);

            const speechState = updateSpeechState(
                speechStateRef.current,
                features,
                deltaMs,
            );
            const heuristic = classifyHeuristicViseme(features, speechState);
            const profile = getAvatarLipProfile(stateRef.current.currentAvatarId);
            const timeline = resolveTimelineFrame(stateRef.current.ttsSegments, audioAnalyser.context.currentTime);
            const frame = mixVisemeFrame({
                heuristic,
                timelineEvent: timeline.event,
                lookaheadEvent: timeline.lookaheadEvent,
                profile,
                emotion: stateRef.current.emotion,
                features,
            });

            const mode = frame.source;
            if (useStore.getState().lipSyncMode !== mode) {
                setLipSyncMode(mode);
            }

            const allVisemes = [
                'viseme_sil',
                'viseme_PP',
                'viseme_FF',
                'viseme_TH',
                'viseme_DD',
                'viseme_kk',
                'viseme_CH',
                'viseme_SS',
                'viseme_nn',
                'viseme_RR',
                'viseme_aa',
                'viseme_E',
                'viseme_I',
                'viseme_O',
                'viseme_U',
            ];

            allVisemes.forEach((visemeId) => {
                applyMorph(
                    dict,
                    influences,
                    visemeId,
                    frame.visemeWeights[visemeId as keyof typeof frame.visemeWeights] ?? 0,
                    profile.onsetOpenSpeed,
                    profile.closeSpeed,
                );
            });

            applyMorph(dict, influences, 'mouthPucker', frame.mouthPucker, 0.45, 0.25);
            applyMorph(dict, influences, 'mouthFunnel', frame.mouthFunnel, 0.4, 0.22);
            applyMorph(dict, influences, 'mouthStretchLeft', frame.mouthStretchLeft, 0.45, 0.25);
            applyMorph(dict, influences, 'mouthStretchRight', frame.mouthStretchRight, 0.45, 0.25);
            applyMorph(dict, influences, 'mouthPressLeft', frame.mouthPressLeft, 0.4, 0.25);
            applyMorph(dict, influences, 'mouthPressRight', frame.mouthPressRight, 0.4, 0.25);
            applyMorph(dict, influences, 'mouthDimpleLeft', frame.mouthDimpleLeft, 0.35, 0.2);
            applyMorph(dict, influences, 'mouthDimpleRight', frame.mouthDimpleRight, 0.35, 0.2);
            applyMorph(
                dict,
                influences,
                'jawOpen',
                frame.jawOpen,
                profile.onsetOpenSpeed,
                frame.phase === 'silence' || frame.phase === 'pause' ? profile.silenceCloseSpeed : profile.closeSpeed,
            );

            if (teethMeshRef.current?.morphTargetDictionary && teethMeshRef.current.morphTargetInfluences) {
                const teethDict = teethMeshRef.current.morphTargetDictionary as Record<string, number>;
                const teethInfluences = teethMeshRef.current.morphTargetInfluences;
                const jawIndex = dict.jawOpen;
                const teethJawIndex = teethDict.jawOpen;
                if (jawIndex !== undefined && teethJawIndex !== undefined) {
                    teethInfluences[teethJawIndex] = influences[jawIndex];
                }
            }

            if (lipSyncDebugEnabled) {
                setCurrentLipSyncSnapshot(
                    createLipSyncDebugSnapshot({
                        frame,
                        features,
                        heuristic,
                        profile,
                        segment: timeline.segment,
                    }),
                );
            } else if (useStore.getState().currentLipSyncSnapshot) {
                setCurrentLipSyncSnapshot(null);
            }
        }

        const leftBlinkIndex = dict.eyeBlinkLeft;
        const rightBlinkIndex = dict.eyeBlinkRight;
        if (leftBlinkIndex !== undefined && rightBlinkIndex !== undefined) {
            blinkTimer.current += clampedDelta;
            if (blinkTimer.current > nextBlinkTime.current && !isBlinking.current) {
                isBlinking.current = true;
                blinkTimer.current = 0;
            }
            if (isBlinking.current) {
                const phase = Math.min(blinkTimer.current / 0.22, 1);
                const value = Math.sin(phase * Math.PI);
                influences[leftBlinkIndex] = value;
                influences[rightBlinkIndex] = value;
                if (phase >= 1) {
                    if (blinkCount.current === 0 && Math.random() < 0.25) {
                        blinkCount.current = 1;
                        blinkTimer.current = 0.05;
                    } else {
                        blinkCount.current = 0;
                        isBlinking.current = false;
                        nextBlinkTime.current = Math.random() * 4 + 3;
                    }
                }
            }
        }
    });

    return (
        <group ref={group} dispose={null} position={[0, config.baseY, 0]}>
            <primitive object={scene} scale={config.scale} />
        </group>
    );
});
