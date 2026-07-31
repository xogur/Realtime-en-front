'use client';

import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Suspense, useEffect, useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Character } from './Character';
import { OptimizedLights } from './OptimizedLights';
import { useStore } from '@/stores/useStore';
import { getAvatarCameraFrame } from './avatarCameraFrame';

function CameraController() {
    const { camera, size } = useThree();
    const frame = useMemo(
        () => getAvatarCameraFrame(size.width, size.height),
        [size.width, size.height],
    );

    useLayoutEffect(() => {
        if (!(camera instanceof THREE.PerspectiveCamera)) return;
        // React Three Fiber owns the camera instance; update only the current frame.
        // eslint-disable-next-line react-hooks/immutability
        camera.fov = frame.fov;
        camera.position.set(frame.position[0], frame.position[1], frame.position[2]);
        camera.updateProjectionMatrix();
    }, [camera, frame]);

    return null;
}

function ResponsiveOrbitControls() {
    const { size } = useThree();
    const frame = useMemo(
        () => getAvatarCameraFrame(size.width, size.height),
        [size.width, size.height],
    );

    return (
        <OrbitControls
            makeDefault
            enableZoom={false}
            enablePan={false}
            minPolarAngle={Math.PI / 2.5}
            maxPolarAngle={Math.PI / 1.8}
            target={frame.target}
        />
    );
}

function ContextLostHandler() {
    const { gl } = useThree();

    useEffect(() => {
        const handleContextLost = (event: Event) => {
            event.preventDefault();
            console.error('THREE.WebGLRenderer: Context Lost!');
        };

        const handleContextRestored = () => {
            console.log('THREE.WebGLRenderer: Context Restored!');
            window.location.reload();
        };

        const canvasElement = gl.domElement;
        canvasElement.addEventListener('webglcontextlost', handleContextLost);
        canvasElement.addEventListener('webglcontextrestored', handleContextRestored);

        return () => {
            canvasElement.removeEventListener('webglcontextlost', handleContextLost);
            canvasElement.removeEventListener('webglcontextrestored', handleContextRestored);
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
                key="avatar-canvas-recovery-v3"
                shadows
                camera={{ position: [0, 2.3, 1.35], fov: 35 }}
                className="w-full h-full"
                gl={{
                    preserveDrawingBuffer: true,
                    antialias: true,
                    alpha: true,
                    powerPreference: 'default',
                }}
                dpr={[1, 2]}
            >
                <ContextLostHandler />
                <CameraController />
                <ResponsiveOrbitControls />
                <OptimizedLights />

                <Suspense fallback={<mesh><sphereGeometry args={[0.1]} /><meshBasicMaterial color="yellow" /></mesh>}>
                    <Character key={currentAvatarId} />
                </Suspense>
            </Canvas>
        </div>
    );
}
