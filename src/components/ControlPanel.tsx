
import { useCallback, useState } from 'react';
import { useStore } from '@/stores/useStore';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Settings, Radio, MessageSquare, Trash2, Loader2 } from 'lucide-react';
import { useVoiceSocket } from '@/hooks/useVoiceSocket';

interface ControlPanelProps {
    onOpenSettings: () => void;
}

export function ControlPanel({ onOpenSettings }: ControlPanelProps) {
    const { connect, disconnect, isConnected, clearHistory } = useVoiceSocket();
    const isRecording = useStore((state) => state.isRecording);
    const isChatOpen = useStore((state) => state.isChatOpen);
    const toggleChat = useStore((state) => state.toggleChat);
    const isConnecting = useStore((state) => state.isConnecting);
    const [isProcessing, setIsProcessing] = useState(false);

    const handleToggleConnection = useCallback(() => {
        if (isProcessing || isConnecting) return; // Prevent multiple clicks

        setIsProcessing(true);
        if (isConnected) {
            disconnect();
        } else {
            connect();
        }

        // Re-enable after a short delay to debounce clicks
        setTimeout(() => {
            setIsProcessing(false);
        }, 500);
    }, [isConnected, connect, disconnect, isProcessing, isConnecting]);

    return (
        <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, type: 'spring' }}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-4 p-4 rounded-3xl bg-white/10 backdrop-blur-xl border border-white/20 shadow-glass z-50"
        >
            {/* Reset History Button */}
            <button
                onClick={() => {
                    if (window.confirm('정말로 모든 대화 내용을 초기화하시겠습니까? \n(이 작업은 되돌릴 수 없습니다.)')) {
                        clearHistory();
                    }
                }}
                className="p-3 rounded-full hover:bg-white/10 transition-colors text-zinc-500 hover:text-red-400 group relative"
                aria-label="Reset Conversation"
                title="대화 초기화"
            >
                <Trash2 className="w-6 h-6" />
            </button>

            {/* Settings Button */}
            <button
                onClick={onOpenSettings}
                className="p-3 rounded-full hover:bg-white/10 transition-colors text-zinc-500 hover:text-zinc-800"
                aria-label="Settings"
            >
                <Settings className="w-6 h-6" />
            </button>

            {/* Chat Toggle Button */}
            <button
                onClick={() => {
                    window.open('/chat', 'UXROOM_Chat', 'width=450,height=850,menubar=no,toolbar=no,location=no,status=no');
                }}
                className="p-3 rounded-full transition-colors hover:bg-white/10 text-zinc-500 hover:text-zinc-800"
                aria-label="Open Chat Window"
                title="새 창으로 채팅 열기"
            >
                <MessageSquare className="w-6 h-6" />
            </button>

            {/* Main Mic Toggle */}
            <button
                onClick={handleToggleConnection}
                disabled={isProcessing || isConnecting}
                className={`relative flex items-center justify-center w-16 h-16 rounded-full transition-all duration-300 shadow-lg ${isConnecting || isProcessing
                    ? 'bg-blue-600 text-white shadow-blue-500/30'
                    : isConnected
                        ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/30'
                        : 'bg-zinc-900 hover:bg-zinc-800 text-white shadow-zinc-900/30'
                    }`}
                aria-label={isConnected ? "Disconnect" : "Connect"}
            >
                <AnimatePresence mode="wait">
                    {isConnecting || isProcessing ? (
                        <motion.div
                            key="connecting"
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                        >
                            <Loader2 className="w-8 h-8 animate-spin" />
                        </motion.div>
                    ) : isConnected ? (
                        <motion.div
                            key="connected"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0 }}
                        >
                            <Mic className="w-8 h-8" />
                        </motion.div>
                    ) : (
                        <motion.div
                            key="disconnected"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0 }}
                        >
                            <MicOff className="w-8 h-8" />
                            {/* Pulse effect to invite click */}
                            <span className="absolute inset-0 rounded-full border-2 border-zinc-900 opacity-20 animate-ping" />
                        </motion.div>
                    )}
                </AnimatePresence>
            </button>

            {/* Connection Indicator (Hidden if button shows state, but good for explicit status) */}
            <div className="flex flex-col items-start w-24">
                <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${isConnecting ? 'bg-blue-500 animate-pulse' :
                        isConnected ? 'bg-green-500 animate-pulse' : 'bg-zinc-300'
                        }`} />
                    <span className="text-xs font-medium text-zinc-500">
                        {isConnecting ? 'Connecting' : isConnected ? 'Live' : 'Offline'}
                    </span>
                </div>
            </div>

        </motion.div>
    );
}
