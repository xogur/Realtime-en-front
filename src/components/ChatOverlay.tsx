
import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/stores/useStore';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MessageSquare, Send, ExternalLink } from 'lucide-react';
import { buildKioskUrl, createClientCommandId, getChatSyncChannelName } from '@/lib/kioskIdentity';
import { TEXT_ONLY_TEST_MODE } from '@/lib/testMode';

interface ChatOverlayProps {
    standalone?: boolean;
}

const KOREAN_INTERPRETATION_LABELS = ['한국어 해석:', 'Korean:'];

function splitAssistantMessage(content: string): { english: string; korean: string | null } {
    const matchedLabel = KOREAN_INTERPRETATION_LABELS
        .map((label) => ({ label, index: content.indexOf(label) }))
        .filter((candidate) => candidate.index !== -1)
        .sort((a, b) => a.index - b.index)[0];
    const labelIndex = matchedLabel?.index ?? -1;
    if (labelIndex === -1) {
        return { english: content, korean: null };
    }

    return {
        english: content.slice(0, labelIndex).trimEnd(),
        korean: content.slice(labelIndex + matchedLabel.label.length).trim(),
    };
}

export function ChatOverlay({ standalone = false }: ChatOverlayProps) {
    const isChatOpenRaw = useStore((state) => state.isChatOpen);
    const isChatOpen = standalone || TEXT_ONLY_TEST_MODE || isChatOpenRaw;
    const messages = useStore((state) => state.messages);
    const toggleChat = useStore((state) => state.toggleChat);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [inputValue, setInputValue] = useState('');
    const socket = useStore((state) => state.socket);
    const isThinking = useStore((state) => state.isThinking);
    const partialMessage = useStore((state) => state.partialMessage);
    const liveTranscript = useStore((state) => state.liveTranscript);
    const textScale = useStore((state) => state.textScale);
    const setTextScale = useStore((state) => state.setTextScale);
    const showKoreanInterpretation = useStore((state) => state.showKoreanInterpretation);
    const toggleKoreanInterpretation = useStore((state) => state.toggleKoreanInterpretation);

    // Auto-scroll to bottom of messages
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isChatOpen, partialMessage, liveTranscript, isThinking]);

    const handleSendMessage = () => {
        const text = inputValue.trim();
        if (!text) return;

        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: 'user_text_message',
                text,
                clientCommandId: createClientCommandId(),
                interruptPolicy: 'hard',
            }));
            setInputValue('');
            return;
        }

        if (standalone) {
            const channel = new BroadcastChannel(getChatSyncChannelName());
            channel.postMessage({
                type: 'SEND_MESSAGE',
                payload: text,
                clientCommandId: createClientCommandId(),
            });
            channel.close();
            setInputValue('');
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    const handleSuggestionClick = (suggestion: string) => {
        setInputValue(suggestion);
        inputRef.current?.focus();
    };

    return (
        <AnimatePresence>
            {isChatOpen && (
                <motion.div
                    initial={standalone ? {} : { opacity: 0, x: 100 }}
                    animate={standalone ? {} : { opacity: 1, x: 0 }}
                    exit={standalone ? {} : { opacity: 0, x: 100 }}
                    transition={standalone ? undefined : { type: "spring", stiffness: 300, damping: 30 }}
                    className={
                        standalone
                            ? "w-full h-full bg-transparent flex flex-col z-40"
                            : "fixed right-[clamp(16px,2vw,32px)] top-[clamp(80px,10vh,120px)] bottom-[clamp(80px,10vh,120px)] w-[clamp(320px,25vw,600px)] bg-[#f4ece4]/40 backdrop-blur-xl border border-white/20 rounded-3xl shadow-[0_8px_32px_rgba(72,60,45,0.1)] overflow-hidden z-40 flex flex-col transition-all duration-500 ease-out"
                    }
                >
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-[#483c2d]/10 bg-[#f4ece4]/60 backdrop-blur-md">
                        <div className="flex items-center gap-2">
                            <MessageSquare className="w-5 h-5 text-[#6b5a4a]" />
                            <h2 className="text-[#483c2d] font-bold tracking-tight">Conversation</h2>
                        </div>
                        <div className="flex items-center gap-2">
                            {/* Korean interpretation toggle */}
                            <button
                                type="button"
                                role="switch"
                                aria-checked={showKoreanInterpretation}
                                aria-label={`한국어 해석 ${showKoreanInterpretation ? '켜짐' : '꺼짐'}`}
                                onClick={toggleKoreanInterpretation}
                                className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-2.5 py-1.5 transition-all focus:outline-none focus:ring-2 focus:ring-[#6b5a4a]/30 ${showKoreanInterpretation
                                    ? 'border-[#5f7353]/35 bg-[#edf1e8] text-[#40513a] shadow-sm'
                                    : 'border-[#8b7a6d]/20 bg-white/45 text-[#77695f] hover:bg-white/70'
                                    }`}
                                title={showKoreanInterpretation ? '한국어 해석 숨기기' : '한국어 해석 보이기'}
                            >
                                <span className="whitespace-nowrap text-xs font-black">해석</span>
                                <span
                                    aria-hidden="true"
                                    className={`relative h-5 w-9 rounded-full transition-colors ${showKoreanInterpretation ? 'bg-[#5f7353]' : 'bg-[#b7aaa0]'}`}
                                >
                                    <span
                                        data-testid="korean-interpretation-thumb"
                                        className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${showKoreanInterpretation ? 'translate-x-4' : 'translate-x-0'}`}
                                    />
                                </span>
                                <span className="w-7 text-left text-[11px] font-black">
                                    {showKoreanInterpretation ? 'ON' : 'OFF'}
                                </span>
                            </button>
                            {/* Text Sizing Controls */}
                            <div className="flex items-center bg-[#483c2d]/10 rounded-full px-2 py-1 mr-2 gap-1">
                                <button
                                    onClick={() => setTextScale(Math.max(0.5, textScale - 0.1))}
                                    className="p-1 rounded-full hover:bg-[#483c2d]/10 text-[#6b5a4a] transition-colors"
                                    title="글자 작게"
                                >
                                    <span className="text-xs font-bold leading-none">A-</span>
                                </button>
                                <span className="text-[10px] text-[#483c2d] font-mono w-8 text-center font-bold" title="현재 글자 배율">
                                    {Math.round(textScale * 100)}%
                                </span>
                                <button
                                    onClick={() => setTextScale(Math.min(2.0, textScale + 0.1))}
                                    className="p-1 rounded-full hover:bg-[#483c2d]/10 text-[#6b5a4a] transition-colors"
                                    title="글자 크게"
                                >
                                    <span className="text-sm font-bold leading-none">A+</span>
                                </button>
                            </div>
                            {!standalone && (
                                <button
                                    onClick={() => {
                                        window.open(buildKioskUrl('/chat'), 'UXROOM_Chat', 'width=450,height=850,menubar=no,toolbar=no,location=no,status=no');
                                        toggleChat();
                                    }}
                                    className="p-1 rounded-full hover:bg-[#483c2d]/10 text-[#6b5a4a] transition-colors"
                                    title="새 창으로 분리"
                                >
                                    <ExternalLink className="w-5 h-5" />
                                </button>
                            )}
                            {!standalone && (
                                <button
                                    onClick={toggleChat}
                                    className="p-1 rounded-full hover:bg-[#483c2d]/10 text-[#6b5a4a] transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Messages Area */}
                    <div
                        ref={scrollRef}
                        className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-[#483c2d]/10 scrollbar-track-transparent"
                    >
                        {messages.length === 0 && !partialMessage && !liveTranscript && !isThinking ? (
                            <div className="h-full flex items-center justify-center text-[#483c2d]/40 text-sm italic flex-col gap-2">
                                <p>No messages yet.</p>
                                <p className="text-[#483c2d]/30 text-xs font-medium">Start speaking or type below!</p>
                            </div>
                        ) : (
                            messages.map((msg, idx) => {
                                const assistantParts = msg.role === 'assistant' ? splitAssistantMessage(msg.content) : null;
                                const messageKey = msg.id
                                    ? `${msg.role}:${msg.id}`
                                    : `${msg.role}:${msg.content}:${idx}`;
                                return (
                                    <motion.div
                                        key={messageKey}
                                        data-chat-message={msg.role}
                                        initial={false}
                                        animate={{ opacity: 1, y: 0 }}
                                        className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                    >
                                        <div
                                            className={`max-w-[85%] md:max-w-[75%] p-3.5 rounded-2xl leading-relaxed whitespace-pre-wrap break-words shadow-sm ${msg.role === 'user'
                                                ? 'bg-[#6b5a4a] text-[#fdf8f4] font-medium rounded-br-none shadow-md'
                                                : 'bg-white/70 text-[#483c2d] border border-white/50 rounded-bl-none'
                                                }`}
                                            style={{ fontSize: `calc(clamp(14px, 1.5vw, 18px) * ${textScale})` }}
                                        >
                                            {assistantParts ? (
                                                <>
                                                    <div>{assistantParts.english}</div>
                                                    {showKoreanInterpretation && assistantParts.korean && (
                                                        <div className="mt-3 border-t border-[#483c2d]/10 pt-2 text-[#6b5a4a]">
                                                            <span className="font-semibold">한국어 해석:</span> {assistantParts.korean}
                                                        </div>
                                                    )}
                                                    {msg.suggestions && msg.suggestions.length > 0 && (
                                                        <div className="mt-3 flex flex-wrap gap-2">
                                                            {msg.suggestions.map((suggestion) => (
                                                                <button
                                                                    key={suggestion}
                                                                    type="button"
                                                                    onClick={() => handleSuggestionClick(suggestion)}
                                                                    className="max-w-full rounded-full border border-[#6b5a4a]/20 bg-[#fdf8f4]/80 px-3 py-1.5 text-left text-[0.82em] font-medium leading-snug text-[#483c2d] transition-colors hover:bg-[#f4ece4] focus:outline-none focus:ring-2 focus:ring-[#6b5a4a]/30"
                                                                    title="입력창에 넣기"
                                                                >
                                                                    {suggestion}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </>
                                            ) : (
                                                msg.content
                                            )}
                                        </div>
                                    </motion.div>
                                );
                            })
                        )}

                        {/* 임시 메시지 (타이핑 효과) */}
                        {liveTranscript && (
                            <motion.div
                                data-chat-live-transcript="true"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex w-full justify-end"
                                role="status"
                                aria-live="polite"
                                aria-label={`You are saying: ${liveTranscript}`}
                            >
                                <div
                                    className="max-w-[85%] rounded-2xl rounded-br-none bg-[#6b5a4a]/85 p-3.5 font-medium leading-relaxed text-[#fdf8f4] shadow-md md:max-w-[75%]"
                                    style={{ fontSize: `calc(clamp(14px, 1.5vw, 18px) * ${textScale})` }}
                                >
                                    {liveTranscript}
                                    <span className="ml-1 inline-block h-4 w-1.5 align-middle animate-pulse rounded-sm bg-[#fdf8f4]/70" />
                                </div>
                            </motion.div>
                        )}

                        {partialMessage && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex justify-start w-full"
                            >
                                <div
                                    className="max-w-[85%] md:max-w-[75%] p-3.5 rounded-2xl leading-relaxed whitespace-pre-wrap break-words bg-white/70 text-[#483c2d] border border-white/50 rounded-bl-none shadow-sm"
                                    style={{ fontSize: `calc(clamp(14px, 1.5vw, 18px) * ${textScale})` }}
                                >
                                    {partialMessage}
                                    <span className="inline-block w-1.5 h-4 ml-1 align-middle bg-[#6b5a4a]/40 animate-pulse rounded-sm" />
                                </div>
                            </motion.div>
                        )}

                        {isThinking && !partialMessage && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex justify-start"
                            >
                                <div className="bg-white/70 text-[#483c2d] border border-white/50 rounded-2xl rounded-bl-none p-3.5 text-sm flex items-center gap-2 shadow-sm">
                                    <span className="w-2 h-2 bg-[#6b5a4a]/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <span className="w-2 h-2 bg-[#6b5a4a]/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <span className="w-2 h-2 bg-[#6b5a4a]/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                            </motion.div>
                        )}
                    </div>

                    {/* Input Area */}
                    <div className="p-4 border-t border-[#483c2d]/10 bg-[#f4ece4]/80 backdrop-blur-md">
                        <div className="flex items-center gap-3">
                            <input
                                ref={inputRef}
                                type="text"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Type a message..."
                                className="flex-1 bg-white/60 border border-[#483c2d]/20 rounded-2xl px-5 py-3 text-[#483c2d] placeholder-[#483c2d]/40 focus:outline-none focus:ring-2 focus:ring-[#6b5a4a]/30 transition-all font-medium shadow-inner"
                                style={{ fontSize: `calc(clamp(14px, 1.2vw, 16px) * ${textScale})` }}
                            />
                            <button
                                onClick={handleSendMessage}
                                disabled={!inputValue.trim() || (!standalone && !socket)}
                                className="p-3.5 bg-[#6b5a4a] disabled:bg-[#6b5a4a]/40 disabled:opacity-80 disabled:cursor-not-allowed rounded-2xl transition-all duration-300 shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center group"
                            >
                                <Send className="w-5 h-5 text-white group-hover:rotate-[-10deg] group-hover:scale-110 group-hover:translate-x-0.5 transition-transform" />
                            </button>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
