'use client';
/* eslint-disable react-hooks/immutability -- Three.js objects are intentionally mutated per frame. */

import { Html, RoundedBox } from '@react-three/drei';
import { ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { useReducedMotion } from 'framer-motion';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { COCOON_NUMBERS, isCocoonNumber, type CocoonNumber } from './cocoonSceneModel';

type Props = {
  currentRoomNumber: CocoonNumber | null;
  availableRoomNumbers: ReadonlySet<CocoonNumber>;
  previewRoomNumber: CocoonNumber | null;
  selectedRoomNumber: CocoonNumber | null;
  disabled: boolean;
  onPreviewChange: (roomNumber: CocoonNumber | null) => void;
  onSelect: (roomNumber: CocoonNumber) => void;
};

const POD_POSITIONS: Record<CocoonNumber, number> = {
  1: -4.35,
  2: -1.45,
  3: 1.45,
  4: 4.35,
};

const COLORS = {
  floor: '#d9d0c4',
  wall: '#f5f3ef',
  shell: '#f8f6f2',
  frame: '#27292b',
  glass: '#93a8ae',
  current: '#22c7d6',
  hover: '#60a5fa',
  selected: '#2563eb',
  unavailable: '#969da5',
  consultation: '#10b981',
  consultationShell: '#e8f7ef',
  entry: '#f59e0b',
} as const;

function CameraRig({ selectedRoomNumber }: Pick<Props, 'selectedRoomNumber'>) {
  const { camera, size } = useThree();
  const reduceMotion = useReducedMotion();
  const target = useMemo(() => new THREE.Vector3(0, 0.72, -0.1), []);

  useFrame((_, delta) => {
    const narrow = size.width <= 520;
    const baseY = narrow ? 11.8 : 9.2;
    const baseZ = narrow ? 22.5 : 14.8;
    const selectedBias = selectedRoomNumber === null ? 0 : POD_POSITIONS[selectedRoomNumber] * 0.045;
    const damping = reduceMotion ? 40 : 4.5;

    camera.position.x = THREE.MathUtils.damp(camera.position.x, reduceMotion ? 0 : selectedBias, damping, delta);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, baseY, damping, delta);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, baseZ, damping, delta);
    target.x = THREE.MathUtils.damp(target.x, reduceMotion ? 0 : selectedBias * 0.28, damping, delta);
    camera.lookAt(target);
  });

  return null;
}

function RoomShell() {
  const arrowGeometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.15, 0);
    shape.lineTo(0.15, 0);
    shape.lineTo(0.15, 0.92);
    shape.lineTo(0.44, 0.92);
    shape.lineTo(0, 1.55);
    shape.lineTo(-0.44, 0.92);
    shape.lineTo(-0.15, 0.92);
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }, []);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0.12]} receiveShadow>
        <planeGeometry args={[13.5, 9.1]} />
        <meshStandardMaterial color={COLORS.floor} roughness={0.92} />
      </mesh>
      <gridHelper
        args={[13.5, 27, COLORS.frame, COLORS.frame]}
        position={[0, -0.015, 0.12]}
        scale={[1, 1, 0.675]}
        material-transparent
        material-opacity={0.075}
      />

      {[-6.66, 6.66].map((x) => (
        <group key={x}>
          <mesh position={[x, 1.42, 0.12]} castShadow receiveShadow>
            <boxGeometry args={[0.2, 2.9, 9.1]} />
            <meshStandardMaterial color={COLORS.wall} roughness={0.86} />
          </mesh>
          <mesh position={[x, 2.91, 0.12]}>
            <boxGeometry args={[0.28, 0.12, 9.18]} />
            <meshStandardMaterial color={COLORS.frame} roughness={0.63} />
          </mesh>
        </group>
      ))}

      <mesh position={[2.92, 1.42, 4.56]} castShadow receiveShadow>
        <boxGeometry args={[7.52, 2.9, 0.22]} />
        <meshStandardMaterial color={COLORS.wall} roughness={0.86} />
      </mesh>
      <mesh position={[2.92, 2.91, 4.56]}>
        <boxGeometry args={[7.62, 0.12, 0.31]} />
        <meshStandardMaterial color={COLORS.frame} roughness={0.63} />
      </mesh>
      <mesh position={[-0.83, 1.42, 3.66]} castShadow receiveShadow>
        <boxGeometry args={[0.22, 2.9, 2]} />
        <meshStandardMaterial color={COLORS.wall} roughness={0.86} />
      </mesh>
      <mesh position={[-0.83, 2.91, 3.66]}>
        <boxGeometry args={[0.31, 0.12, 2.08]} />
        <meshStandardMaterial color={COLORS.frame} roughness={0.63} />
      </mesh>

      <mesh position={[0, 1.82, -4.39]}>
        <planeGeometry args={[12.35, 2.34]} />
        <meshStandardMaterial color="#789071" roughness={1} />
      </mesh>
      {Array.from({ length: 6 }, (_, index) => (
        <mesh key={`window-${index}`} position={[-5.13 + index * 2.05, 1.82, -4.32]}>
          <planeGeometry args={[2.03, 2.05]} />
          <meshPhysicalMaterial color={COLORS.glass} transparent opacity={0.38} roughness={0.32} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {Array.from({ length: 7 }, (_, index) => (
        <mesh key={`mullion-${index}`} position={[-6.15 + index * 2.05, 1.82, -4.27]}>
          <boxGeometry args={[0.055, 2.18, 0.07]} />
          <meshStandardMaterial color={COLORS.frame} roughness={0.7} />
        </mesh>
      ))}
      <mesh position={[0, 2.94, -4.38]}>
        <boxGeometry args={[13.5, 0.28, 0.26]} />
        <meshStandardMaterial color={COLORS.frame} roughness={0.63} />
      </mesh>
      <mesh position={[0, 0.28, -4.38]}>
        <boxGeometry args={[13.5, 0.24, 0.26]} />
        <meshStandardMaterial color={COLORS.wall} roughness={0.86} />
      </mesh>

      <mesh geometry={arrowGeometry} rotation={[-Math.PI / 2, 0, 0]} position={[-3.65, 0.025, 4.16]}>
        <meshBasicMaterial color={COLORS.entry} transparent opacity={0.86} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh position={[-3.65, 0.012, 4.49]}>
        <boxGeometry args={[3.7, 0.035, 0.18]} />
        <meshBasicMaterial color={COLORS.entry} transparent opacity={0.72} />
      </mesh>
      <Html position={[-3.65, 0.12, 4.05]} center style={{ pointerEvents: 'none' }}>
        <span className="whitespace-nowrap rounded-full bg-amber-400 px-3 py-1.5 text-sm font-black text-zinc-900 shadow-lg shadow-amber-700/20">
          입구 ↑
        </span>
      </Html>
    </group>
  );
}

type PodProps = Props & { roomNumber: CocoonNumber };

function CocoonPod({
  roomNumber,
  currentRoomNumber,
  availableRoomNumbers,
  previewRoomNumber,
  selectedRoomNumber,
  disabled,
  onPreviewChange,
  onSelect,
}: PodProps) {
  const group = useRef<THREE.Group>(null);
  const outlineMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const haloMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const shellMaterial = useRef<THREE.MeshStandardMaterial>(null);
  const glassMaterial = useRef<THREE.MeshPhysicalMaterial>(null);
  const { gl } = useThree();
  const reduceMotion = useReducedMotion();
  const consultationBooth = roomNumber === 1;
  const available = !consultationBooth && availableRoomNumbers.has(roomNumber);
  const interactive = available && !disabled;
  const current = currentRoomNumber === roomNumber;
  const preview = previewRoomNumber === roomNumber && interactive;
  const selected = selectedRoomNumber === roomNumber && available;

  useFrame(({ clock }, delta) => {
    if (!group.current || !outlineMaterial.current || !haloMaterial.current || !shellMaterial.current || !glassMaterial.current) return;
    const damping = reduceMotion ? 40 : 11;
    const targetY = reduceMotion ? 0.08 : 0.08 + (preview ? 0.105 : selected ? 0.07 : 0);
    const targetScale = reduceMotion ? 1 : preview ? 1.032 : selected ? 1.022 : 1;
    group.current.position.y = THREE.MathUtils.damp(group.current.position.y, targetY, damping, delta);
    group.current.scale.setScalar(THREE.MathUtils.damp(group.current.scale.x, targetScale, damping, delta));

    const accent = consultationBooth
      ? COLORS.consultation
      : selected
        ? COLORS.selected
        : preview
          ? COLORS.hover
          : current
            ? COLORS.current
            : !available
              ? COLORS.unavailable
              : COLORS.current;
    const outlineOpacity = consultationBooth ? 0.3 : selected ? 0.72 : preview ? 0.78 : current ? 0.34 : !available ? 0.05 : 0;
    const pulse = reduceMotion ? 0 : Math.sin(clock.elapsedTime * 3.4) * 0.09;
    const haloOpacity = consultationBooth ? 0.24 : selected ? 0.48 : preview ? 0.54 : current ? 0.39 + pulse : !available ? 0.06 : 0;

    outlineMaterial.current.color.set(accent);
    outlineMaterial.current.opacity = THREE.MathUtils.damp(outlineMaterial.current.opacity, outlineOpacity, damping, delta);
    haloMaterial.current.color.set(accent);
    haloMaterial.current.opacity = THREE.MathUtils.damp(haloMaterial.current.opacity, haloOpacity, damping, delta);
    shellMaterial.current.color.lerp(new THREE.Color(consultationBooth ? COLORS.consultationShell : available ? COLORS.shell : COLORS.unavailable), Math.min(1, delta * 8));
    glassMaterial.current.opacity = THREE.MathUtils.damp(glassMaterial.current.opacity, consultationBooth ? 0.26 : available ? 0.31 : 0.14, damping, delta);
  });

  const enter = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    if (!interactive) return;
    gl.domElement.style.cursor = 'pointer';
    onPreviewChange(roomNumber);
  };

  const leave = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    gl.domElement.style.cursor = 'default';
    if (previewRoomNumber === roomNumber) onPreviewChange(null);
  };

  const choose = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (interactive) onSelect(roomNumber);
  };

  return (
    <group ref={group} position={[POD_POSITIONS[roomNumber], 0.08, -2.55]}>
      <RoundedBox args={[1.78, 2.38, 1.44]} radius={0.24} smoothness={5} position={[0, 1.22, 0]} castShadow receiveShadow>
        <meshStandardMaterial ref={shellMaterial} color={COLORS.shell} roughness={0.42} metalness={0.02} transparent />
      </RoundedBox>
      <RoundedBox args={[1.78, 2.38, 1.44]} radius={0.24} smoothness={5} position={[0, 1.22, 0]} scale={1.035}>
        <meshBasicMaterial ref={outlineMaterial} color={COLORS.hover} transparent opacity={0} side={THREE.BackSide} depthWrite={false} />
      </RoundedBox>
      <RoundedBox args={[1.53, 1.82, 0.12]} radius={0.18} smoothness={5} position={[0, 1.1, 0.755]} castShadow>
        <meshStandardMaterial color={COLORS.frame} roughness={0.52} metalness={0.08} />
      </RoundedBox>
      <RoundedBox args={[1.28, 1.54, 0.035]} radius={0.12} smoothness={5} position={[0, 1.1, 0.835]}>
        <meshPhysicalMaterial ref={glassMaterial} color={COLORS.glass} transparent opacity={0.31} roughness={0.18} depthWrite={false} />
      </RoundedBox>
      <RoundedBox args={[0.72, 0.58, 0.18]} radius={0.06} smoothness={4} position={[0, 0.88, 0.55]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <meshStandardMaterial color="#b58b62" roughness={0.7} />
      </RoundedBox>
      <mesh position={[0, 0.49, 0.44]} castShadow>
        <cylinderGeometry args={[0.045, 0.055, 0.72, 12]} />
        <meshStandardMaterial color={COLORS.frame} roughness={0.6} />
      </mesh>
      <Html position={[0, 1.47, 0.93]} center style={{ pointerEvents: 'none' }}>
        <span className="grid h-9 w-12 place-items-center rounded-lg bg-zinc-900/90 text-lg font-black text-white shadow">
          {roomNumber}
        </span>
      </Html>
      {consultationBooth ? (
        <Html position={[0, 0.18, 0.94]} center style={{ pointerEvents: 'none' }}>
          <span className="block w-36 rounded-xl bg-emerald-600 px-3 py-2 text-center text-xs font-black leading-tight text-white shadow-lg shadow-emerald-900/20">
            상시 오픈<br />AI 상담 부스
          </span>
        </Html>
      ) : null}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.045, 0]} scale={[1.25, 1, 1]}>
        <ringGeometry args={[0.63, 0.76, 64]} />
        <meshBasicMaterial ref={haloMaterial} color={COLORS.current} transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh
        position={[0, 1.2, 0.3]}
        onPointerOver={enter}
        onPointerOut={leave}
        onClick={choose}
      >
        <boxGeometry args={[2.02, 2.65, 1.95]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function CocoonScene(props: Props) {
  const { size } = useThree();
  const activeRoomNumber = props.previewRoomNumber ?? props.selectedRoomNumber;

  return (
    <>
      <fog attach="fog" args={[COLORS.wall, 22, 50]} />
      <hemisphereLight args={['#dceeff', '#6b5d4b', 2.35]} />
      <directionalLight
        color="#ffffff"
        intensity={3.4}
        position={[-4.5, 8, 7]}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={7}
        shadow-camera-bottom={-4}
        shadow-bias={-0.0005}
      />
      <directionalLight color="#b9d8ff" intensity={1.2} position={[5, 4, -2]} />
      <CameraRig selectedRoomNumber={props.selectedRoomNumber} />
      <RoomShell />
      {COCOON_NUMBERS.map((roomNumber) => (
        <CocoonPod key={roomNumber} roomNumber={roomNumber} {...props} />
      ))}

      {size.width > 520 ? (
        <>
          {props.currentRoomNumber !== null && isCocoonNumber(props.currentRoomNumber) ? (
            <Html position={[POD_POSITIONS[props.currentRoomNumber], 3.05, -2.4]} center style={{ pointerEvents: 'none' }}>
              <span className="whitespace-nowrap rounded-full bg-cyan-500 px-3 py-1.5 text-sm font-black text-white shadow-lg shadow-cyan-700/20">
                현재 위치 · 코쿤 {props.currentRoomNumber}
              </span>
            </Html>
          ) : null}
          {activeRoomNumber !== null && activeRoomNumber !== props.currentRoomNumber ? (
            <Html position={[POD_POSITIONS[activeRoomNumber], 3.45, -2.4]} center style={{ pointerEvents: 'none' }}>
              <span className="whitespace-nowrap rounded-full bg-blue-600 px-3 py-1.5 text-sm font-black text-white shadow-lg shadow-blue-800/20">
                {props.previewRoomNumber === activeRoomNumber ? '선택 미리보기' : '선택됨'} · 코쿤 {activeRoomNumber}
              </span>
            </Html>
          ) : null}
        </>
      ) : null}
    </>
  );
}
