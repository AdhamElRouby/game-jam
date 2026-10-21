// Canvas + lighting + post-processing + composition of all visual layers.
import { memo, Suspense, use, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, EffectComposerContext, Bloom, N8AO, ToneMapping, Vignette, HueSaturation } from '@react-three/postprocessing';
import { CopyPass, EffectPass, ToneMappingMode } from 'postprocessing';
import { MapWorld } from './MapWorld';
import { Artifact } from './Artifact';
import { Players } from './Players';
import { PilotBadge } from './Pilot';
import { CameraRig, camFocus, camView } from './CameraRig';
import { Clouds, CloudSea, SkyDome, SkyEnvironment, SUN_DIR, SKY } from './Sky';
import { Effects } from './Effects';
import { Ending } from './Ending';
import { updateFrame } from './frame';
import { GameEvents } from './GameEvents';
import { quality, lookDev, pixelRatio, PRESETS } from './quality';
import { look } from './look';
import { Cockpit } from './Cockpit';
import { HintBeacon } from './Beacon';
import { DetailCull } from './DetailCull';
import { AdaptiveResolution, BackgroundThrottle } from './FrameRate';

function FrameTicker() {
  useFrame(() => updateFrame(), -100);
  return null;
}

/** Prepare the world once, after all animation/camera callbacks and before the composer (priority 1).
 * N8AO re-renders transparent layers twice: neither matrices nor opaque shadows belong to those passes.
 */
function RenderPreparation() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const autoMatrix = scene.matrixWorldAutoUpdate, autoLocal = scene.matrixAutoUpdate, autoShadow = gl.shadowMap.autoUpdate;
    scene.matrixAutoUpdate = false;
    scene.matrixWorldAutoUpdate = false;
    gl.shadowMap.autoUpdate = false;
    return () => { scene.matrixWorldAutoUpdate = autoMatrix; scene.matrixAutoUpdate = autoLocal; gl.shadowMap.autoUpdate = autoShadow; };
  }, [gl, scene]);
  useFrame(({ camera }) => {
    scene.updateMatrixWorld();
    gl.shadowMap.needsUpdate = true;
    if (!PRESETS[quality.level].post) gl.render(scene, camera);
  }, 0.5);
  return null;
}

/** Mouse / touchpad look listens on the canvas (HUD buttons above it keep their clicks). */
function LookInput() {
  const gl = useThree((s) => s.gl);
  useEffect(() => look.attach(gl.domElement), [gl]);
  return null;
}

function Lights() {
  const sun = useRef<THREE.DirectionalLight>(null);
  const { scene } = useThree();
  const ext = useRef(0);
  useEffect(() => {
    if (sun.current) scene.add(sun.current.target);
  }, [scene]);
  useFrame(() => {
    const l = sun.current;
    if (!l) return;
    // shadow frustum follows the framed action and grows with the camera distance (quantized to avoid shimmer)
    const want = Math.min(42, Math.max(20, Math.ceil((camView.dist * 1.25) / 4) * 4));
    if (want !== ext.current) {
      ext.current = want;
      const c = l.shadow.camera;
      c.left = c.bottom = -want;
      c.right = c.top = want;
      c.updateProjectionMatrix();
    }
    // centred a little ahead of what the camera looks at, along its heading
    const snap = (want * 2) / l.shadow.mapSize.x;
    const fx = Math.round((camFocus.x + camView.fx * 4) / snap) * snap;
    const fy = Math.round(camFocus.y / snap) * snap;
    const fz = Math.round((camFocus.z + camView.fz * 4) / snap) * snap;
    l.target.position.set(fx, fy, fz);
    l.position.set(fx + SUN_DIR.x * 70, fy + SUN_DIR.y * 70, fz + SUN_DIR.z * 70);
  });
  return (
    <>
      <hemisphereLight args={['#dff2ff', '#b59a74', 0.55]} />
      <directionalLight
        ref={sun}
        color="#fff0d8"
        intensity={2.5}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={1}
        shadow-camera-far={190}
        shadow-bias={-0.0005}
        shadow-normalBias={0.035}
        shadow-radius={3.5}
        shadow-intensity={0.82}
      />
      {/* warm rim light from the castle side: pops couriers and the artifact off the ground */}
      <directionalLight color="#ffc6dc" intensity={0.75} position={[18, 14, -40]} />
    </>
  );
}

const TONE: Record<string, ToneMappingMode> = { agx: ToneMappingMode.AGX, neutral: ToneMappingMode.NEUTRAL, aces: ToneMappingMode.ACES_FILMIC, cineon: ToneMappingMode.OPTIMIZED_CINEON };

function useQuality() {
  const [q, setQ] = useState(quality.level);
  useEffect(() => quality.on(setQ), []);
  return q;
}

/** Applies the preset to the renderer: pixel ratio (cap + pixel budget + adaptive scale) and shadow map resolution. */
function QualityApplier() {
  const q = useQuality();
  const { setDpr, scene } = useThree();
  useEffect(() => {
    const apply = () => setDpr(pixelRatio(q));
    apply();
    window.addEventListener('resize', apply);
    scene.traverse((o) => {
      const l = o as THREE.DirectionalLight;
      if (l.isDirectionalLight && l.castShadow) {
        const size = PRESETS[q].shadow;
        if (l.shadow.mapSize.x !== size) {
          l.shadow.mapSize.set(size, size);
          l.shadow.map?.dispose();
          l.shadow.map = null as unknown as THREE.WebGLRenderTarget;
        }
      }
    });
    return () => window.removeEventListener('resize', apply);
  }, [q, setDpr, scene]);
  return null;
}

const AO_COLOR = new THREE.Color('#2e2146');

/**
 * N8AO switches itself to "transparency aware" as soon as anything in the scene is transparent (clouds, water, glows,
 * particles): every frame it then walks the whole scene three times and draws it twice more into two full-resolution
 * HDR targets. Measured: that was the largest single cost of the post chain, for a difference too small to see here.
 */
function aoRef(pass: { autoDetectTransparency?: boolean; configuration?: { transparencyAware: boolean } } | null) {
  if (!pass || lookDev.aoTransparency) return;
  pass.autoDetectTransparency = false;
  if (pass.configuration) pass.configuration.transparencyAware = false;
}

/**
 * The composer wrapper appends a full-screen copy after the effects whenever N8AO is in the chain; the effect pass can
 * draw to the screen itself, so the copy (a full-resolution HDR read + write every frame) is dropped.
 */
function DropTrailingCopy() {
  const ctx = use(EffectComposerContext);
  useFrame(() => {
    const c = ctx?.composer;
    const P = c?.passes;
    if (!c || !P || P.length < 2) return;
    const last = P[P.length - 1];
    if (last instanceof CopyPass && P[P.length - 2] instanceof EffectPass) c.removePass(last);
  });
  return null;
}

function Post() {
  const q = useQuality();
  const P = PRESETS[q];
  if (!P.post) return null;
  const ao = lookDev.aoq === 'off' ? null : (lookDev.aoq ?? P.ao);
  return (
    <EffectComposer
      ref={(c) => {
        (window as any).__SH_COMPOSER = c;
      }}
      multisampling={lookDev.msaa ?? P.msaa}
      enableNormalPass={false}
    >
      <>{lookDev.ao && ao && <N8AO ref={aoRef as never} halfRes depthAwareUpsampling={lookDev.aoUp} aoRadius={1.7} distanceFalloff={0.9} intensity={2.6} color={AO_COLOR} quality={ao} />}</>
      <>{lookDev.bloom && P.bloom && <Bloom mipmapBlur luminanceThreshold={1.0} luminanceSmoothing={0.18} intensity={0.6} radius={0.72} />}</>
      <HueSaturation saturation={lookDev.sat ?? 0.1} />
      <ToneMapping mode={TONE[lookDev.tm ?? 'neutral'] ?? ToneMappingMode.NEUTRAL} />
      <Vignette offset={0.3} darkness={0.38} />
      <DropTrailingCopy />
    </EffectComposer>
  );
}

export const Scene = memo(function Scene() {
  const world = useRef<THREE.Group>(null);
  return (
    <Canvas
      shadows
      dpr={pixelRatio()}
      gl={{ antialias: lookDev.aa ?? true, powerPreference: 'high-performance' }}
      camera={{ fov: 44, near: 0.15, far: 1400, position: [2.2, 4.8, 13.5] }}
      onCreated={({ gl, scene }) => {
        gl.shadowMap.type = THREE.PCFShadowMap;
        gl.toneMapping = THREE.NeutralToneMapping;
        gl.toneMappingExposure = 1.0;
        (window as any).__SH_GL = gl;
        (window as any).__SH_SCENE = scene;
      }}
    >
      <FrameTicker />
      <LookInput />
      <color attach="background" args={[SKY.fog]} />
      <fog attach="fog" args={[SKY.fog, 60, 330]} />
      <SkyEnvironment intensity={lookDev.env ?? 0.9} />
      <Lights />
      <SkyDome />
      <Suspense fallback={null}>
        <group ref={world}>
          <MapWorld />
        </group>
        <Artifact />
        <PilotBadge />
        <Cockpit />
        <Players />
        <Ending />
      </Suspense>
      <HintBeacon />
      <Clouds />
      <CloudSea />
      <Effects />
      <CameraRig />
      <DetailCull root={world} />
      <GameEvents />
      <QualityApplier />
      <AdaptiveResolution />
      <BackgroundThrottle />
      <Post />
      <RenderPreparation />
    </Canvas>
  );
});
