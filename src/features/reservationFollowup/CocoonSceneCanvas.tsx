'use client';

import { Component, useState, type ErrorInfo, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { CocoonScene } from './CocoonScene';
import type { CocoonNumber } from './cocoonSceneModel';

type Props = {
  currentRoomNumber: CocoonNumber | null;
  availableRoomNumbers: ReadonlySet<CocoonNumber>;
  previewRoomNumber: CocoonNumber | null;
  selectedRoomNumber: CocoonNumber | null;
  disabled: boolean;
  onPreviewChange: (roomNumber: CocoonNumber | null) => void;
  onSelect: (roomNumber: CocoonNumber) => void;
};

type BoundaryProps = { children: ReactNode; fallback: ReactNode };
type BoundaryState = { failed: boolean };

class SceneErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Cocoon 3D scene failed', error, info.componentStack);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function StaticFallback() {
  return (
    <div className="grid h-[220px] place-items-center bg-[#ece7df] px-6 text-center sm:h-[clamp(280px,30vw,360px)]">
      <p className="max-w-sm font-bold text-zinc-600">
        3D 조감도를 표시할 수 없습니다. 아래 코쿤 버튼으로 계속 선택할 수 있습니다.
      </p>
    </div>
  );
}

export function CocoonSceneCanvas(props: Props) {
  const [contextLost, setContextLost] = useState(false);
  if (contextLost) return <StaticFallback />;
  return (
    <div className="relative h-[220px] overflow-hidden bg-[radial-gradient(circle_at_50%_18%,#ffffff_0%,#eee9e1_62%,#ddd5ca_100%)] sm:h-[clamp(280px,30vw,360px)]">
      <SceneErrorBoundary fallback={<StaticFallback />}>
        <Canvas
          aria-hidden="true"
          camera={{ position: [0, 9.2, 14.8], fov: 31, near: 0.1, far: 60 }}
          dpr={[1, 1.5]}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
          shadows
          onCreated={({ gl }) => {
            gl.domElement.addEventListener('webglcontextlost', (event) => {
              event.preventDefault();
              setContextLost(true);
            }, { once: true });
          }}
          onPointerMissed={() => props.onPreviewChange(null)}
        >
          <CocoonScene {...props} />
        </Canvas>
      </SceneErrorBoundary>
      <p className="pointer-events-none absolute bottom-3 left-3 hidden rounded-full bg-white/85 px-3 py-1.5 text-xs font-bold text-zinc-500 backdrop-blur sm:block">
        고정된 조감 시점 · 코쿤을 가리키거나 선택해 보세요
      </p>
    </div>
  );
}
