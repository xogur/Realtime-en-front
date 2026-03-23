import { Environment, SoftShadows } from '@react-three/drei';
import { useMemo } from 'react';

export function OptimizedLights() {
  const shadowConfig = useMemo(() => ({
    mapSize: [512, 512] as [number, number],
    bias: -0.0005,
  }), []);

  return (
    <>
      <ambientLight intensity={0.8} />
      <directionalLight
        castShadow
        position={[2, 4, 3]}
        intensity={1.2}
        shadow-mapSize={shadowConfig.mapSize}
        shadow-bias={shadowConfig.bias}
      >
        <orthographicCamera attach="shadow-camera" args={[-1.5, 1.5, 1.5, -1.5, 0.1, 10]} />
      </directionalLight>
      {/*  */}
    </>
  );
}
