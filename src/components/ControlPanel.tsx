import { useCallback, useState } from 'react';
import { useStore } from '@/stores/useStore';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Settings, MessageSquare, Trash2, Loader2 } from 'lucide-react';
import { useVoiceSocket } from '@/hooks/useVoiceSocket';
import { buildKioskUrl } from '@/lib/kioskIdentity';

interface ControlPanelProps {
    onOpenSettings: () => void;
}

export function ControlPanel({ onOpenSettings }: ControlPanelProps) {
    const { startListening, stopListening, isConnected, isRecording, clearHistory } = useVoiceSocket();
    const isConnecting = useStore((state) => state.isConnecting);
    const [isProcessing, setIsProcessing] = useState(false);

    const handleToggleConnection = useCallback(() => {
        if (isProcessing || isConnecting) return;

        setIsProcessing(true);
        if (isConnected && isRecording) {
            stopListening();
        } else {
            startListening();
        }

        setTimeout(() => {
            setIsProcessing(false);
        }, 500);
    }, [isConnected, isRecording, startListening, stopListening, isProcessing, isConnecting]);

    return (
        <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, type: 'spring' }}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-4 p-4 rounded-3xl bg-white/10 backdrop-blur-xl border border-white/20 shadow-glass z-50"
        >
            <button
                onClick={() => {
                    if (window.confirm('Reset all conversation history? This cannot be undone.')) {
                        clearHistory();
                    }
                }}
                className="p-3 rounded-full hover:bg-white/10 transition-colors text-zinc-500 hover:text-red-400 group relative"
                aria-label="Reset Conversation"
                title="Reset conversation"
            >
                <Trash2 className="w-6 h-6" />
            </button>

            <button
                onClick={onOpenSettings}
                className="p-3 rounded-full hover:bg-white/10 transition-colors text-zinc-500 hover:text-zinc-800"
                aria-label="Settings"
            >
                <Settings className="w-6 h-6" />
            </button>

            <button
                onClick={() => {
                    window.open(buildKioskUrl('/chat'), 'UXROOM_Chat', 'width=450,height=850,menubar=no,toolbar=no,location=no,status=no');
                }}
                className="p-3 rounded-full transition-colors hover:bg-white/10 text-zinc-500 hover:text-zinc-800"
                aria-label="Open Chat Window"
                title="Open chat window"
            >
                <MessageSquare className="w-6 h-6" />
            </button>

            <button
                onClick={handleToggleConnection}
                disabled={isProcessing || isConnecting}
                className={`relative flex items-center justify-center w-16 h-16 rounded-full transition-all duration-300 shadow-lg ${isConnecting || isProcessing
                    ? 'bg-blue-600 text-white shadow-blue-500/30'
                    : isConnected && isRecording
                        ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/30'
                        : 'bg-zinc-900 hover:bg-zinc-800 text-white shadow-zinc-900/30'
                    }`}
                aria-label={isConnected && isRecording ? 'Turn microphone off' : 'Turn microphone on'}
                title={isConnected && isRecording ? 'Turn microphone off' : 'Turn microphone on'}
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
                    ) : isConnected && isRecording ? (
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
                            <span className="absolute inset-0 rounded-full border-2 border-zinc-900 opacity-20 animate-ping" />
                        </motion.div>
                    )}
                </AnimatePresence>
            </button>

            <div className="flex flex-col items-start w-24">
                <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${isConnecting ? 'bg-blue-500 animate-pulse' :
                        isConnected && isRecording ? 'bg-green-500 animate-pulse' : isConnected ? 'bg-amber-500' : 'bg-zinc-300'
                        }`} />
                    <span className="text-xs font-medium text-zinc-500">
                        {isConnecting ? 'Connecting' : isConnected && isRecording ? 'Listening' : isConnected ? 'Mic off' : 'Offline'}
                    </span>
                </div>
            </div>
        </motion.div>
    );
}
