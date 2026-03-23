'use client';

import { Canvas, useThree } from '@react-three/fiber';
import { Environment, OrbitControls } from '@react-three/drei';
import { Suspense, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Character } from './Character';
import { OptimizedLights } from './OptimizedLights';
import { useStore } from '@/stores/useStore';

// 반응형 카메라 제어 컴포넌트
function CameraController() {
    const { camera, size, controls } = useThree();

    const config = useMemo(() => {
        const aspect = size.width / size.height;

        if (aspect < 0.6) {
            // 초세로 모드 (iPhone SE 등)
            return {
                fov: 60,
                position: new THREE.Vector3(0, 2, 3.2),
                target: new THREE.Vector3(0, 2.3, 0)
            };
        } else if (aspect < 1) {
            // 일반 세로 모드
            return {
                fov: 52,
                position: new THREE.Vector3(0, 2, 2.6),
                target: new THREE.Vector3(0, 2.2, 0)
            };
        } else {
            // 가로 모드 (데스크탑)
            return {
                fov: 40,
                position: new THREE.Vector3(0, 2.3, 2.0),
                target: new THREE.Vector3(0, 2.1, 0)
            };
        }
    }, [size.width, size.height]);

    useEffect(() => {
        if (camera instanceof THREE.PerspectiveCamera) {
            camera.fov = config.fov;
            camera.position.copy(config.position);
            camera.updateProjectionMatrix();
        }

        if (controls) {
            const orbitControls = controls as any;
            orbitControls.target.copy(config.target);
            orbitControls.update();
        }
    }, [config, camera, controls]);

    return null;
}

// WebGL 컨텍스트 이벤트 핸들러 컴포넌트
function ContextLostHandler() {
    const { gl } = useThree();

    useEffect(() => {
        const handleContextLost = (event: Event) => {
            event.preventDefault();
            console.error('THREE.WebGLRenderer: Context Lost! (HMR 또는 메모리 초과로 발생할 수 있음)');
            // 강제 새로고침이 필요한 상황이면 여기에 안내 문구 노출 가능
        };

        const handleContextRestored = () => {
            console.log('THREE.WebGLRenderer: Context Restored! 렌더링이 재개됩니다.');
            window.location.reload(); // 컨텍스트가 복구되었을 때 상태를 완전히 초기화하기 위해 페이지 새로고침 (가장 확실한 방법)
        };

        const canvasElement = gl.domElement;
        canvasElement.addEventListener('webglcontextlost', handleContextLost);
        canvasElement.addEventListener('webglcontextrestored', handleContextRestored);

        return () => {
            canvasElement.removeEventListener('webglcontextlost', handleContextLost);
            canvasElement.removeEventListener('webglcontextrestored', handleContextRestored);
            // 언마운트 시 명시적인 메모리 해제
            gl.dispose();
        };
    }, [gl]);

    return null;
}

export function Scene() {
    const currentAvatarId = useStore((state) => state.currentAvatarId);

    return (
        <div className="w-full h-full min-h-[500px] bg-transparent">
            <Canvas
                key="avatar-canvas-recovery-v2"
                shadows
                camera={{ position: [0, 2, 2.0], fov: 40 }}
                className="w-full h-full"
                gl={{ preserveDrawingBuffer: true, 
                    antialias: true, 
                    alpha: true,
                    powerPreference: "default",
                }}
                dpr={[1, 2]}
            >
                <ContextLostHandler />
                <CameraController />

                {/* 조명 복구 및 최적화 */}
                <OptimizedLights />

                <Suspense fallback={<mesh><sphereGeometry args={[0.1]} /><meshBasicMaterial color="yellow" /></mesh>}>
                    <Character key={currentAvatarId} />
                </Suspense>

                <OrbitControls
                    makeDefault
                    enableZoom={false}
                    enablePan={false}
                    minPolarAngle={Math.PI / 2.5}
                    maxPolarAngle={Math.PI / 1.8}
                    target={[0, 2.1, 0]}
                />
            </Canvas>
        </div>
    );
}