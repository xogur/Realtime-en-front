
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { MeshDistortMaterial, Sphere } from '@react-three/drei';
import * as THREE from 'three';

interface BlobProps {
    volume: number; // 0.0 to 1.0 (approximated RMS)
    isRecording: boolean;
    isPlaying: boolean;
    isConnected: boolean;
}

export function Blob({ volume, isRecording, isPlaying, isConnected }: BlobProps) {
    const meshRef = useRef<THREE.Mesh>(null);
    const materialRef = useRef<any>(null);

    // Determines the "mood" color based on state
    // Idle: Cool Grays/Blues
    // Listening (Recording): Vibrant Green/Teal
    // Speaking (Playing): Energetic Blue/Purple/Pink
    let targetColor = new THREE.Color("#e4e4e7"); // zinc-200 (light mode idle)
    let targetDistort = 0.3;
    let targetSpeed = 2;

    if (!isConnected) {
        targetColor = new THREE.Color("#d4d4d8"); // zinc-300
        targetDistort = 0.3;
        targetSpeed = 1;
    } else if (isPlaying) {
        // AI Speaking: Energetic, shifting colors (handled in useFrame for gradients, but base color here)
        targetColor = new THREE.Color("#8b5cf6"); // Violet
        targetDistort = 0.6 + volume * 0.4; // More distortion with volume
        targetSpeed = 5 + volume * 5;
    } else if (isRecording) {
        // User Speaking: Reactive, Green
        targetColor = new THREE.Color("#10b981"); // Emerald
        targetDistort = 0.4 + volume * 0.5;
        targetSpeed = 3 + volume * 3;
    }

    useFrame((state, delta) => {
        if (!materialRef.current) return;

        // Smoothly interpolate parameters
        materialRef.current.distort = THREE.MathUtils.lerp(materialRef.current.distort, targetDistort, 0.1);
        materialRef.current.speed = THREE.MathUtils.lerp(materialRef.current.speed, targetSpeed, 0.1);
        materialRef.current.color.lerp(targetColor, 0.05);

        // Gentle rotation
        if (meshRef.current) {
            meshRef.current.rotation.x += delta * 0.2;
            meshRef.current.rotation.y += delta * 0.3;
        }
    });

    return (
        <group>
            {/* Main Body */}
            <Sphere args={[1, 64, 64]} ref={meshRef} scale={1.8}>
                <MeshDistortMaterial
                    ref={materialRef}
                    color={targetColor}
                    envMapIntensity={1}
                    clearcoat={0.9}
                    clearcoatRoughness={0.1}
                    metalness={0.1}
                />
            </Sphere>

            {/* Eyes (Optional: simple spheres that float on the surface) 
                For a "Blob" character, standard eyes might look weird on a distorting mesh.
                Let's add "floating" eyes separately that follow the camera slightly to look 'alive'.
            */}
            <Eyes isConnected={isConnected} isPlaying={isPlaying} />
        </group>
    );
}

function Eyes({ isConnected, isPlaying }: { isConnected: boolean, isPlaying: boolean }) {
    const groupRef = useRef<THREE.Group>(null);

    useFrame((state) => {
        if (!groupRef.current) return;

        // Simple "look at mouse" or gentle wandering
        const t = state.clock.getElapsedTime();

        // Idle sway
        groupRef.current.position.y = Math.sin(t) * 0.05;

        // Look at mouse (subtle)
        const mouseX = state.mouse.x * 0.5;
        const mouseY = state.mouse.y * 0.5;

        groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, mouseX, 0.1);
        groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, -mouseY, 0.1);
    });

    // Eye blinking logic could go here

    return (
        <group ref={groupRef} position={[0, 0.5, 1.2]}>
            {/* Left Eye */}
            <mesh position={[-0.4, 0, 0]}>
                <sphereGeometry args={[0.15, 32, 32]} />
                <meshStandardMaterial color="black" roughness={0.2} />
            </mesh>
            {/* Right Eye */}
            <mesh position={[0.4, 0, 0]}>
                <sphereGeometry args={[0.15, 32, 32]} />
                <meshStandardMaterial color="black" roughness={0.2} />
            </mesh>
        </group>
    )
}
