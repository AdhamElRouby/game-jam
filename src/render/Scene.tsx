// Canvas + lighting + composition of all visual layers.
import { Suspense, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { World } from './World';
import { Artifact } from './Artifact';
import { Players } from './Players';
import { CameraRig, camFocus } from './CameraRig';
import { Clouds, SkyDome, SUN_DIR } from './Sky';
import { Scenery } from './Scenery';
import { Effects } from './Effects';
import { Ending } from './Ending';
import { updateFrame } from './frame';
import { GameEvents } from './GameEvents';

function FrameTicker() {
  useFrame(() => updateFrame(), -100);
  return null;
}

function Lights() {
  const sun = useRef<THREE.DirectionalLight>(null);
  const { scene } = useThree();
  useEffect(() => {
    if (sun.current) scene.add(sun.current.target);
  }, [scene]);
  useFrame(() => {
    const l = sun.current;
    if (!l) return;
    // keep the shadow frustum centered on the action, snapped to texels to avoid shimmer
    const snap = 0.25;
    const fx = Math.round(camFocus.x / snap) * snap;
    const fy = Math.round(camFocus.y / snap) * snap;
    const fz = Math.round(camFocus.z / snap) * snap;
    l.target.position.set(fx, fy, fz - 4);
    l.position.set(fx + SUN_DIR.x * 60, fy + SUN_DIR.y * 60, fz - 4 + SUN_DIR.z * 60);
  });
  return (
    <>
      <hemisphereLight args={['#cfeeff', '#9bc78a', 1.25]} />
      <ambientLight intensity={0.25} color="#fff4e6" />
      <directionalLight
        ref={sun}
        color="#fff0d6"
        intensity={2.6}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-34}
        shadow-camera-right={34}
        shadow-camera-top={34}
        shadow-camera-bottom={-34}
        shadow-camera-near={1}
        shadow-camera-far={160}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
    </>
  );
}

export function Scene() {
  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ fov: 45, near: 0.5, far: 1200, position: [2.2, 4.8, 13.5] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
      }}
    >
      <FrameTicker />
      <color attach="background" args={['#a9e2f7']} />
      <fog attach="fog" args={['#cfeaf6', 70, 360]} />
      <Lights />
      <SkyDome />
      <Suspense fallback={null}>
        <World />
        <Scenery />
        <Artifact />
        <Players />
        <Ending />
      </Suspense>
      <Clouds />
      <Effects />
      <CameraRig />
      <GameEvents />
    </Canvas>
  );
}
