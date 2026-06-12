
import { useRef, useEffect, useState } from 'react';
import { DEFAULT_AVATAR_ID, useStore } from '@/stores/useStore';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Settings, User, Sliders, Type, Volume2 } from 'lucide-react';
import { AVATARS, Avatar } from '@/lib/avatarConstants';
import Image from 'next/image';
import { useMissionSuccessSoundEnabled } from '@/lib/missionSuccessAudio';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

/**
 * 아바타 썸네일 컴포넌트
 * 이미지 로딩 실패 시 기존 플레이스홀더로 대체되는 로직 포함
 */
function AvatarThumbnail({ avatar }: { avatar: Avatar }) {
    const [hasError, setHasError] = useState(false);

    return (
        <div className="w-full aspect-square rounded-2xl mb-4 overflow-hidden relative bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center transition-transform duration-500 group-hover:scale-105">
            {!hasError ? (
                <Image
                    src={avatar.thumbnailPath}
                    alt={avatar.name}
                    fill
                    sizes="(max-width: 768px) 33vw, 20vw"
                    className="object-cover"
                    onError={() => setHasError(true)}
                    priority={avatar.id === DEFAULT_AVATAR_ID} // 첫 번째 아바타는 우선순위 부여
                />
            ) : null}
            
            {/* Fallback Placeholder (이미지가 없거나 로드 실패 시 노출) */}
            <div 
                className={`absolute inset-0 flex items-center justify-center text-4xl font-black transition-opacity duration-300 ${
                    hasError ? 'opacity-100' : 'opacity-0 pointer-events-none'
                } ${
                    avatar.gender === 'female' 
                        ? 'bg-gradient-to-br from-pink-100 to-rose-200 text-rose-400 dark:from-rose-900/40 dark:to-pink-900/40' 
                        : 'bg-gradient-to-br from-blue-100 to-indigo-200 text-indigo-400 dark:from-indigo-900/40 dark:to-blue-900/40'
                }`}
            >
                {avatar.id.charAt(0)}
            </div>

            {/* 초기 로딩 시 이미지 아래에 보일 플레이스홀더 (이미지가 로드되면 덮어씌워짐) */}
            {!hasError && (
                 <div className={`absolute inset-0 -z-10 flex items-center justify-center text-4xl font-black ${
                    avatar.gender === 'female' 
                        ? 'bg-gradient-to-br from-pink-100 to-rose-200 text-rose-400 dark:from-rose-900/40 dark:to-pink-900/40' 
                        : 'bg-gradient-to-br from-blue-100 to-indigo-200 text-indigo-400 dark:from-indigo-900/40 dark:to-blue-900/40'
                }`}>
                    {avatar.id.charAt(0)}
                </div>
            )}
        </div>
    );
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
    const modalRef = useRef<HTMLDivElement>(null);
    const speed = useStore((state) => state.speed);
    const setSpeed = useStore((state) => state.setSpeed);
    const textScale = useStore((state) => state.textScale);
    const setTextScale = useStore((state) => state.setTextScale);
    const currentAvatarId = useStore((state) => state.currentAvatarId);
    const setCurrentAvatar = useStore((state) => state.setCurrentAvatar);
    const [missionSuccessSoundEnabled, setMissionSuccessSoundEnabled] = useMissionSuccessSoundEnabled();

    // ESC key to close
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
                    <motion.div
                        ref={modalRef}
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-[2.5rem] shadow-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-8 border-b border-zinc-100 dark:border-zinc-800">
                            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white flex items-center gap-3">
                                <div className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
                                    <Settings className="w-6 h-6 text-zinc-600 dark:text-zinc-400" />
                                </div>
                                환경 설정
                            </h2>
                            <button 
                                onClick={onClose} 
                                className="p-3 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-all active:scale-95"
                            >
                                <X className="w-6 h-6 text-zinc-500" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-8 space-y-10 max-h-[65vh] overflow-y-auto custom-scrollbar">
                            
                            {/* 1. Avatar Selection Section */}
                            <section>
                                <div className="flex items-center gap-2 mb-6">
                                    <User className="w-5 h-5 text-blue-500" />
                                    <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">아바타 선택</h3>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                    {AVATARS.map((avatar) => (
                                        <button
                                            key={avatar.id}
                                            onClick={() => setCurrentAvatar(avatar.id)}
                                            className={`relative group flex flex-col p-4 rounded-3xl border-2 transition-all duration-300 ${
                                                currentAvatarId === avatar.id
                                                    ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-500/10 shadow-xl shadow-blue-500/10'
                                                    : 'border-zinc-100 dark:border-zinc-800 bg-zinc-50/30 dark:bg-zinc-800/30 hover:border-zinc-200 dark:hover:border-zinc-700'
                                            }`}
                                        >
                                            <AvatarThumbnail avatar={avatar} />

                                            <div className="text-left space-y-1">
                                                <p className={`font-bold text-sm ${
                                                    currentAvatarId === avatar.id ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-900 dark:text-zinc-100'
                                                }`}>
                                                    {avatar.id}
                                                </p>
                                                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 line-clamp-1 leading-tight">
                                                    {avatar.description}
                                                </p>
                                            </div>

                                            {currentAvatarId === avatar.id && (
                                                <motion.div 
                                                    layoutId="active-badge"
                                                    className="absolute top-3 right-3 w-3 h-3 bg-blue-500 rounded-full border-2 border-white dark:border-zinc-900" 
                                                />
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </section>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 border-t border-zinc-100 dark:border-zinc-800 pt-10">
                                {/* 2. Audio Control Section */}
                                <section className="space-y-6">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Sliders className="w-5 h-5 text-orange-500" />
                                            <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">말하기 속도</h3>
                                        </div>
                                        <span className="font-mono text-xs font-bold px-2 py-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-zinc-600 dark:text-zinc-400">
                                            {speed.toFixed(1)}x
                                        </span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0.5"
                                        max="2.0"
                                        step="0.1"
                                        value={speed}
                                        onChange={(e) => setSpeed(parseFloat(e.target.value))}
                                        className="w-full h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full appearance-none cursor-pointer accent-orange-500"
                                    />
                                    <div className="flex justify-between text-[10px] font-bold text-zinc-400 px-1">
                                        <span>천천히</span>
                                        <span>빠르게</span>
                                    </div>
                                </section>

                                {/* 3. Text Scale Section */}
                                <section className="space-y-6">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Type className="w-5 h-5 text-purple-500" />
                                            <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">자막 크기</h3>
                                        </div>
                                        <span className="font-mono text-xs font-bold px-2 py-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-zinc-600 dark:text-zinc-400">
                                            {Math.round(textScale * 100)}%
                                        </span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0.8"
                                        max="1.5"
                                        step="0.05"
                                        value={textScale}
                                        onChange={(e) => setTextScale(parseFloat(e.target.value))}
                                        className="w-full h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full appearance-none cursor-pointer accent-purple-500"
                                    />
                                    <div className="flex justify-between text-[10px] font-bold text-zinc-400 px-1">
                                        <span>작게</span>
                                        <span>크게</span>
                                    </div>
                                </section>
                            </div>

                            <section className="border-t border-zinc-100 pt-8 dark:border-zinc-800">
                                <button
                                    type="button"
                                    onClick={() => setMissionSuccessSoundEnabled(!missionSuccessSoundEnabled)}
                                    className="flex min-h-14 w-full items-center justify-between gap-4 rounded-2xl border border-zinc-100 bg-zinc-50/70 px-4 py-3 text-left transition-all hover:border-emerald-200 hover:bg-emerald-50/40 active:scale-[0.99] dark:border-zinc-800 dark:bg-zinc-800/30 dark:hover:border-emerald-700/60 dark:hover:bg-emerald-950/20"
                                    aria-pressed={missionSuccessSoundEnabled}
                                >
                                    <span className="flex min-w-0 items-center gap-3">
                                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300">
                                            <Volume2 className="h-5 w-5" />
                                        </span>
                                        <span className="min-w-0">
                                            <span className="block text-sm font-black text-zinc-900 dark:text-zinc-50">성공 효과음</span>
                                            <span className="mt-0.5 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                                                퀘스트 완료나 등급 상승 때 짧은 성공음을 재생합니다.
                                            </span>
                                        </span>
                                    </span>
                                    <span
                                        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${missionSuccessSoundEnabled
                                            ? 'bg-emerald-500'
                                            : 'bg-zinc-300 dark:bg-zinc-700'}`}
                                    >
                                        <span
                                            className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${missionSuccessSoundEnabled
                                                ? 'translate-x-6'
                                                : 'translate-x-1'}`}
                                        />
                                    </span>
                                </button>
                            </section>
                        </div>

                        {/* Footer */}
                        <div className="p-8 bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-100 dark:border-zinc-800 flex justify-end">
                            <button
                                onClick={onClose}
                                className="px-12 py-4 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-2xl font-bold hover:opacity-90 transition-all active:scale-95 shadow-xl shadow-zinc-900/20 dark:shadow-white/5"
                            >
                                설정 완료
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
