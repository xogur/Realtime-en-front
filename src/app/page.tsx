'use client';

import { useEffect, useRef, useState } from 'react';
import { Visualizer } from '@/components/Visualizer';
import { ControlPanel } from '@/components/ControlPanel';
import { SettingsModal } from '@/components/SettingsModal';
import { ChatOverlay } from '@/components/ChatOverlay';
import { CopyrightAttribution } from '@/components/CopyrightAttribution';
import { motion } from 'framer-motion';
import { useChatSync } from '@/hooks/useChatSync';
import { buildKioskUrl } from '@/lib/kioskIdentity';

export default function Home() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const chatWindowRef = useRef<Window | null>(null);

  // 멀티 윈도우 채팅창 동기화 (메인 창)
  useChatSync(true);

  // 페이지 로드 시 자동으로 채팅창을 서브 모니터(우측)에 풀스크린으로 띄움
  useEffect(() => {
    // 이미 열려있으면 포커스만
    if (chatWindowRef.current && !chatWindowRef.current.closed) {
      chatWindowRef.current.focus();
      return;
    }

    // 서브 모니터(우측) 배치: left = 주 모니터 너비, top = 0
    const screenLeft = window.screen.width;   // 현재(주) 모니터 오른쪽 시작점
    const screenTop = 0;
    const subW = window.screen.width;
    const subH = window.screen.height;

    const features = [
      `width=${subW}`,
      `height=${subH}`,
      `left=${screenLeft}`,
      `top=${screenTop}`,
      'menubar=no',
      'toolbar=no',
      'location=no',
      'status=no',
      'resizable=yes',
    ].join(',');

    const win = window.open(buildKioskUrl('/chat'), 'UXROOM_Chat', features);

    if (!win || win.closed || typeof win.closed === 'undefined') {
      console.warn(
        '[UXROOM] 채팅 팝업이 브라우저에 의해 차단되었습니다.\n' +
        '주소창 우측의 팝업 차단 아이콘을 클릭하여 "항상 허용"으로 설정한 뒤 새로고침하세요.'
      );
    } else {
      chatWindowRef.current = win;
    }
  }, []);

  return (
    <main className="relative h-screen w-full overflow-hidden text-zinc-900 flex flex-col">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-3 bg-cover bg-center blur-[7px] saturate-[0.9]"
        style={{ backgroundImage: 'url("/background/cozy_background_back.png")' }}
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[#f3ebe3]/20" />


      {/* Header Section (Overlay) */}
      <header className="absolute top-0 w-full pt-8 px-6 z-20 pointer-events-none">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="w-full flex flex-col items-center sm:items-start text-center sm:text-left space-y-1"
        >
          <h1 className="text-3xl md:text-5xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-zinc-900 to-zinc-600">
            ULJU AI Consultant
          </h1>
          <p className="text-sm md:text-lg text-zinc-500 font-bold uppercase tracking-widest">
            Project UXROOM
          </p>
        </motion.div>
      </header>

      {/* Main Visualizer Area (Full Space) */}
      <div className="flex-1 w-full relative z-10">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 1.0 }}
          className="w-full h-full"
        >
          <Visualizer />
        </motion.div>
      </div>

      {/* Control Panel (Fixed Bottom) */}
      <div className="relative z-30">
        <ControlPanel onOpenSettings={() => setIsSettingsOpen(true)} />
      </div>

      {/* Chat History Overlay */}
      <ChatOverlay />

      {/* Settings Modal */}
      {isSettingsOpen && (
        <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      )}

      {/* Copyright & Attribution */}
      <CopyrightAttribution />

    </main>
  );
}
