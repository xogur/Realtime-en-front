'use client';

import dynamic from 'next/dynamic';
import React from 'react';

// SSR 비활성화: Three.js 컨텍스트가 서버에서 실행되는 것을 원천 차단
const Scene = dynamic(() => import('./canvas/Scene').then(mod => mod.Scene), { 
    ssr: false,
    loading: () => (
        <div className="w-full h-full flex items-center justify-center text-zinc-400">
            로딩 중...
        </div>
    )
});

export function Visualizer() {
    return (
        <div className="relative flex items-center justify-center w-full h-full min-h-[500px]">
            {/* 3D Scene Container */}
            <div className="absolute inset-0 w-full h-full">
                <Scene />
            </div>
        </div>
    );
}

