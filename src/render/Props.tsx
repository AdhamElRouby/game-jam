// Hand-placed props that tell the story and hint the puzzles (procedural, palette-matched).
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { MAT } from './materials';
import { Model } from './Models';
import { SafeBoundary } from './SafeBoundary';
import { Suspense, type ReactNode } from 'react';
import { Airship, DockCrane, Sacks } from './Dressing';
import { Kit } from './kit';
import { IRON, KitMeshes, STONE, WOOD } from './Structures';
import { CrookedTower } from './Ch3';

/** Kenney model with a procedural fallback if the file is missing or fails to parse. */
function M({ id, p, s = 1, r = 0, fallback, spin }: { id: string; p: [number, number, number]; s?: number | [number, number, number]; r?: number; fallback?: ReactNode; spin?: { node: string; axis: 'x' | 'y' | 'z'; speed: number } }) {
  return (
    <SafeBoundary name={id} fallback={fallback ?? null}>
      <Suspense fallback={null}>
        <Model id={id} p={p} s={s} r={r} spin={spin} />
      </Suspense>
    </SafeBoundary>
  );
}

export function textTexture(lines: string[], w = 512, h = 256, color = '#5a3a24', font = 64, bg?: string) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  if (bg) {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
  }
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  lines.forEach((l, i) => {
    let f = font;
    g.font = `bold ${f}px Fredoka, Nunito, sans-serif`;
    while (g.measureText(l).width > w * 0.92 && f > 10) {
      f -= 2;
      g.font = `bold ${f}px Fredoka, Nunito, sans-serif`;
    }
    g.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * font * 1.1);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function shapeIcon(kind: 'CUBE' | 'LONG' | 'TALL' | 'ROUND', label: string, sub: string) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 320;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f7ead2';
  g.fillRect(0, 0, 512, 320);
  g.strokeStyle = '#8d6446';
  g.lineWidth = 14;
  g.strokeRect(7, 7, 498, 306);
  g.fillStyle = '#ffd153';
  g.strokeStyle = '#b07a22';
  g.lineWidth = 6;
  const cx = 256, cy = 130;
  g.beginPath();
  if (kind === 'CUBE') g.rect(cx - 60, cy - 60, 120, 120);
  if (kind === 'LONG') g.rect(cx - 150, cy - 26, 300, 52);
  if (kind === 'TALL') g.rect(cx - 28, cy - 90, 56, 180);
  if (kind === 'ROUND') g.arc(cx, cy, 66, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = '#5a3a24';
  g.font = 'bold 54px Fredoka, Nunito, sans-serif';
  g.textAlign = 'center';
  g.fillText(label, cx, 258);
  g.font = 'bold 30px Fredoka, Nunito, sans-serif';
  g.fillText(sub, cx, 298);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function Sign({ p, rotY = 0, tex, w = 1.6, h = 1.0, post = 1.5 }: { p: [number, number, number]; rotY?: number; tex: THREE.Texture; w?: number; h?: number; post?: number }) {
  return (
    <group position={p} rotation={[0, rotY, 0]}>
      <mesh position={[0, post / 2, 0]} material={MAT.darkwood} castShadow>
        <cylinderGeometry args={[0.08, 0.1, post, 6]} />
      </mesh>
      <mesh position={[0, post + h / 2 - 0.1, 0]} material={MAT.wood} castShadow>
        <boxGeometry args={[w + 0.12, h + 0.12, 0.1]} />
      </mesh>
      <mesh position={[0, post + h / 2 - 0.1, 0.056]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial map={tex} roughness={0.8} />
      </mesh>
    </group>
  );
}

function Cottage({ p, rotY = 0, roof = MAT.pink }: { p: [number, number, number]; rotY?: number; roof?: THREE.Material }) {
  return (
    <group position={p} rotation={[0, rotY, 0]}>
      <mesh position={[0, 1.3, 0]} material={MAT.cream} castShadow receiveShadow>
        <boxGeometry args={[3.2, 2.6, 2.8]} />
      </mesh>
      <mesh position={[0, 3.25, 0]} rotation={[0, Math.PI / 4, 0]} material={roof} castShadow>
        <coneGeometry args={[2.75, 1.9, 4]} />
      </mesh>
      <mesh position={[0, 0.85, 1.41]} material={MAT.darkwood}>
        <boxGeometry args={[0.85, 1.6, 0.06]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 1.05, 1.55, 1.41]} material={MAT.iron}>
          <boxGeometry args={[0.6, 0.6, 0.05]} />
        </mesh>
      ))}
      <mesh position={[0.9, 3.6, -0.5]} material={MAT.stonePlain} castShadow>
        <boxGeometry args={[0.45, 1.2, 0.45]} />
      </mesh>
      {[-1.7, 1.7].map((x) => (
        <mesh key={x} position={[x, 1.3, 0]} material={MAT.wood}>
          <boxGeometry args={[0.16, 2.6, 2.9]} />
        </mesh>
      ))}
    </group>
  );
}

function Crate({ p, s = 1, rotY = 0 }: { p: [number, number, number]; s?: number; rotY?: number }) {
  return (
    <group position={[p[0], p[1] + s / 2, p[2]]} rotation={[0, rotY, 0]}>
      <mesh material={MAT.wood} castShadow receiveShadow>
        <boxGeometry args={[s, s, s]} />
      </mesh>
      <mesh material={MAT.darkwood}>
        <boxGeometry args={[s * 1.02, s * 0.14, s * 1.02]} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 4]} material={MAT.darkwood}>
        <boxGeometry args={[s * 1.3, s * 0.12, s * 1.03]} />
      </mesh>
    </group>
  );
}

function Barrel({ p }: { p: [number, number, number] }) {
  return (
    <group position={[p[0], p[1] + 0.55, p[2]]}>
      <mesh material={MAT.wood} castShadow>
        <cylinderGeometry args={[0.42, 0.42, 1.1, 12]} />
      </mesh>
      {[-0.35, 0.35].map((y) => (
        <mesh key={y} position={[0, y, 0]} material={MAT.iron}>
          <cylinderGeometry args={[0.44, 0.44, 0.08, 12]} />
        </mesh>
      ))}
    </group>
  );
}

function Banner({ p, color, rotY = 0 }: { p: [number, number, number]; color: THREE.Material; rotY?: number }) {
  const cloth = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (cloth.current) cloth.current.rotation.y = Math.sin(clock.elapsedTime * 2 + p[0]) * 0.18;
  });
  return (
    <group position={p} rotation={[0, rotY, 0]}>
      <mesh position={[0, 1.8, 0]} material={MAT.darkwood} castShadow>
        <cylinderGeometry args={[0.07, 0.08, 3.6, 6]} />
      </mesh>
      <mesh position={[0.02, 3.45, 0]} rotation={[0, 0, Math.PI / 2]} material={MAT.gold}>
        <cylinderGeometry args={[0.05, 0.05, 1.2, 6]} />
      </mesh>
      <mesh ref={cloth} position={[0, 2.65, 0.02]} material={color} castShadow>
        <boxGeometry args={[1.1, 1.5, 0.04]} />
      </mesh>
    </group>
  );
}

function Lantern({ p }: { p: [number, number, number] }) {
  return (
    <group position={p}>
      <mesh position={[0, 1.1, 0]} material={MAT.darkwood}>
        <cylinderGeometry args={[0.06, 0.08, 2.2, 6]} />
      </mesh>
      <mesh position={[0, 2.3, 0]}>
        <boxGeometry args={[0.32, 0.4, 0.32]} />
        <meshStandardMaterial color="#fff1b8" emissive="#ffc35a" emissiveIntensity={1.4} />
      </mesh>
      <mesh position={[0, 2.58, 0]} material={MAT.iron}>
        <coneGeometry args={[0.28, 0.24, 4]} />
      </mesh>
    </group>
  );
}

function Windmill({ p }: { p: [number, number, number] }) {
  const sails = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (sails.current) sails.current.rotation.z += dt * 0.8;
  });
  return (
    <group position={p} rotation={[0, 0.5, 0]}>
      <mesh position={[0, 2.6, 0]} material={MAT.cream} castShadow>
        <cylinderGeometry args={[1.0, 1.5, 5.2, 10]} />
      </mesh>
      <mesh position={[0, 5.9, 0]} material={MAT.red} castShadow>
        <coneGeometry args={[1.35, 1.6, 10]} />
      </mesh>
      <group ref={sails} position={[0, 4.6, 1.25]}>
        {[0, 1, 2, 3].map((i) => (
          <group key={i} rotation={[0, 0, (i * Math.PI) / 2]}>
            <mesh position={[0, 1.8, 0]} material={MAT.darkwood}>
              <boxGeometry args={[0.12, 3.6, 0.08]} />
            </mesh>
            <mesh position={[0.35, 2.1, 0]} material={MAT.white}>
              <boxGeometry args={[0.65, 2.6, 0.04]} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

/** Low-arch dressing: timber lintel + quoins framing the 1.45 m opening and a glowing dashed LONG outline above it. */
function ArchDressing() {
  const outline = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffe48a', emissive: '#ffb21e', emissiveIntensity: 1.4, roughness: 0.5 }), []);
  useFrame(({ clock }) => {
    outline.emissiveIntensity = 1.1 + Math.sin(clock.elapsedTime * 3) * 0.45;
  });
  const z = -25.0;
  const make = useMemo(
    () => () => {
      const k = new Kit(2626);
      for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) k.box('stone', STONE.block[(i + (sx > 0 ? 1 : 0)) % 4], [0.55, 0.46, 0.36], [sx * 2.27, 0.25 + i * 0.5, z + 0.12], [0, 0, 0], 0.05, 0.05);
      k.box('wood', WOOD.dark, [5.0, 0.3, 0.34], [0, 1.62, z + 0.14], [0, 0, 0], 0.05);
      for (const sx of [-1.8, 0, 1.8]) k.box('metal', IRON, [0.12, 0.34, 0.06], [sx, 1.62, z + 0.32], [0, 0, 0], 0.02, 0);
      // slate plaque behind the outline
      k.box('stone', '#4a4166', [3.9, 0.95, 0.08], [0, 2.6, z + 0.05], [0, 0, 0], 0.04, 0);
      return k;
    },
    [],
  );
  const dashes = useMemo(() => {
    const out: { p: [number, number, number]; s: [number, number, number] }[] = [];
    const w = 3.3, h = 0.56, cy = 2.6, zz = z + 0.11;
    for (let x = -w / 2 + 0.12; x < w / 2; x += 0.42) for (const sy of [-1, 1]) out.push({ p: [x + 0.1, cy + (sy * h) / 2, zz], s: [0.24, 0.07, 0.02] });
    for (const sx of [-1, 1]) out.push({ p: [(sx * w) / 2, cy, zz], s: [0.07, 0.3, 0.02] });
    return out;
  }, []);
  return (
    <group>
      <KitMeshes make={make} />
      {dashes.map((d, i) => (
        <mesh key={i} position={d.p} material={outline}>
          <boxGeometry args={d.s} />
        </mesh>
      ))}
    </group>
  );
}

const LEVER_X = -4.5;

export function Props() {
  const tex = useMemo(
    () => ({
      castle: textTexture(['TO THE CASTLE', '→ → →'], 512, 256, '#5a3a24', 58, '#f7ead2'),
      grip: textTexture(['HOLD E', 'to grip & pull'], 512, 256, '#5a3a24', 60, '#f7ead2'),
      longArch: shapeIcon('LONG', 'LOW ARCH', 'only LONG fits (2)'),
      plate: shapeIcon('CUBE', 'HEAVY PLATE', 'park it here'),
      receiver: shapeIcon('LONG', 'RECEIVER', 'slot LONG to lower bridge'),
      cubeWind: shapeIcon('CUBE', 'WINDY!', 'CUBE stays put'),
      tall: shapeIcon('TALL', 'HIGH LEVER', 'TALL + two holding (E)'),
      safe: shapeIcon('CUBE', '← SAFE ROAD', 'rails, slower'),
      fast: shapeIcon('ROUND', 'FAST CHUTE →', 'mind the fan!'),
      goal: textTexture(['DELIVER', 'HERE!'], 512, 256, '#ffffff', 80, '#e7708c'),
    }),
    [],
  );
  return (
    <group>
      <ArchDressing />
      {/* Chapter 1 — dock */}
      <M id="town/cottage_b" p={[-7.4, 0, 5.2]} s={2.3} r={0.5 + Math.PI / 2} fallback={<Cottage p={[-7.4, 0, 5.2]} rotY={0.5} />} />
      <M id="town/cottage_c" p={[-8.2, 0, -2.0]} s={2.2} r={Math.PI / 2 + 0.2} />
      <M id="platformer/crate" p={[6.6, 0, 6.6]} s={2.2} r={0.2} fallback={<Crate p={[6.6, 0, 6.6]} s={1.1} rotY={0.2} />} />
      <M id="platformer/crate" p={[7.7, 0, 5.2]} s={1.8} r={-0.4} fallback={<Crate p={[7.7, 0, 5.2]} s={0.9} rotY={-0.4} />} />
      <M id="platformer/crate" p={[6.7, 1.1, 6.5]} s={1.5} r={0.7} />
      <M id="platformer/chest" p={[8.3, 0, 7.6]} s={2.0} r={-0.6} />
      <M id="platformer/barrel" p={[7.6, 0, 2.6]} s={2.0} fallback={<Barrel p={[7.6, 0, 2.6]} />} />
      <M id="platformer/barrel" p={[8.4, 0, 3.6]} s={1.9} r={1} fallback={<Barrel p={[8.3, 0, 3.4]} />} />
      <DockCrane p={[8.3, 0, -3.4]} />
      <Airship p={[16.5, 3.4, -2.6]} rotY={Math.PI} moor={[9.2, 0, -0.6]} />
      <Sacks p={[6.4, 0, 0.6]} rotY={0.4} n={4} />
      <Sacks p={[-5.9, 0, 8.0]} rotY={-0.6} n={3} />
      <M id="town/cart" p={[-6.6, 0, 0.9]} s={2.1} r={0.35} />
      <M id="platformer/barrel" p={[-6.4, 0, 2.6]} s={1.7} />
      <M id="platformer/flowers" p={[-8.8, 0, 2.6]} s={2.3} />
      <M id="platformer/flowers_tall" p={[-9.0, 0, 7.4]} s={2.0} r={0.7} />
      <M id="town/cart_high" p={[6.8, 0, -7.0]} s={2.2} r={-0.4} />
      <Sign p={[-4.8, 0, -1.5]} rotY={0.25} tex={tex.plate} w={1.6} h={1.0} />
      <Sign p={[4.8, 0, 3.5]} rotY={-0.25} tex={tex.grip} w={1.5} h={0.75} />
      <Banner p={[-3.2, 0, -7.7]} color={MAT.pink} />
      <Banner p={[3.2, 0, -7.7]} color={MAT.lavender} />
      <M id="town/lantern" p={[-3.2, 0, -11.3]} s={1.5} fallback={<Lantern p={[-3.2, 0, -11.3]} />} />
      <M id="town/lantern" p={[3.2, 0, -11.3]} s={1.5} fallback={<Lantern p={[3.2, 0, -11.3]} />} />
      <Sign p={[3.6, 0, -21.5]} rotY={-0.3} tex={tex.longArch} w={1.7} h={1.06} />
      <M id="town/lantern" p={[-3.2, 0, -37.4]} s={1.5} fallback={<Lantern p={[-3.2, 0, -37.4]} />} />
      <M id="town/lantern" p={[3.2, 0, -37.4]} s={1.5} fallback={<Lantern p={[3.2, 0, -37.4]} />} />
      {/* Chapter 2 — windy cliffs */}
      <M id="town/windmill" p={[-18, 1.2, -52]} s={1.7} r={0.9} spin={{ node: 'sails', axis: 'z', speed: 0.9 }} fallback={<Windmill p={[-18, 1.2, -52]} />} />
      <M id="town/fence_curved" p={[-16.0, 1.2, -49.6]} s={2.4} r={0.6} />
      <M id="platformer/flowers" p={[-19.5, 1.2, -50.0]} s={2.2} />
      <Sign p={[-6.5, 0, -47.5]} rotY={0.3} tex={tex.cubeWind} w={1.6} h={1.0} />
      <Sign p={[2.4, 0, -59]} rotY={-0.4} tex={tex.receiver} w={1.7} h={1.06} />
      <M id="town/cart" p={[7.6, 0, -76.5]} s={2.0} r={0.5} fallback={<Crate p={[8, 0, -76.5]} s={1} rotY={0.3} />} />
      <M id="platformer/barrel" p={[6.2, 0, -78.2]} s={1.9} fallback={<Barrel p={[7, 0, -78]} />} />
      <M id="town/lantern" p={[-3.2, 0, -80.4]} s={1.5} fallback={<Lantern p={[-3.2, 0, -80.4]} />} />
      <M id="town/lantern" p={[3.2, 0, -80.4]} s={1.5} fallback={<Lantern p={[3.2, 0, -80.4]} />} />
      {/* Chapter 3 — tower */}
      <Sign p={[-7.5, 0, -96]} rotY={0.4} tex={tex.tall} w={1.7} h={1.06} />
      <M id="platformer/barrel" p={[8.8, 0, -94.6]} s={1.9} fallback={<Barrel p={[8.6, 0, -95]} />} />
      <M id="platformer/crate" p={[8.9, 0, -96.3]} s={2.0} r={0.4} fallback={<Barrel p={[9.0, 0, -96.2]} />} />
      <CrookedTower p={[-15.5, 9, -108]} s={1.15} />
      {/* Chapter 4 — castle dash */}
      <Sign p={[-1.2, 8, -114.6]} rotY={0.2} tex={tex.safe} w={1.6} h={1.0} />
      <Sign p={[1.2, 8, -114.6]} rotY={-0.2} tex={tex.fast} w={1.6} h={1.0} />
      <Banner p={[-9, 0, -156]} color={MAT.pink} />
      <Banner p={[9, 0, -156]} color={MAT.lavender} />
      <Banner p={[-9, 0, -166]} color={MAT.lavender} />
      <Banner p={[9, 0, -166]} color={MAT.pink} />
      <Sign p={[5.5, 0, -164.5]} rotY={-0.4} tex={tex.goal} w={1.6} h={0.8} />
      <M id="town/lantern" p={[-4.5, 0, -168.6]} s={1.5} fallback={<Lantern p={[-4.5, 0, -168.8]} />} />
      <M id="town/stall_red" p={[-9.4, 0, -159]} s={2.3} r={Math.PI / 2} />
      <M id="town/stall_green" p={[9.4, 0, -159]} s={2.3} r={-Math.PI / 2} />
      <M id="town/fountain" p={[-8.6, 0, -166.4]} s={1.9} />
      <M id="town/lantern" p={[4.5, 0, -168.6]} s={1.5} fallback={<Lantern p={[4.5, 0, -168.8]} />} />
      {/* plaza life: market benches, hedges and flower beds along the castle wall (clear of the lanes) */}
      <M id="town/stall_bench" p={[-10.6, 0, -161.4]} s={2.2} r={Math.PI / 2} />
      <M id="town/stall_stool" p={[-8.6, 0, -161.6]} s={2.2} />
      <M id="town/stall_bench" p={[10.6, 0, -161.4]} s={2.2} r={-Math.PI / 2} />
      <M id="town/hedge_large" p={[-9.6, 0, -169.2]} s={[3.2, 2.2, 2.4]} r={Math.PI / 2} />
      <M id="town/hedge_large" p={[9.6, 0, -169.2]} s={[3.2, 2.2, 2.4]} r={-Math.PI / 2} />
      <M id="platformer/flowers_tall" p={[-7.0, 0, -168.9]} s={2.2} />
      <M id="platformer/flowers_tall" p={[7.0, 0, -168.9]} s={2.2} r={1.2} />
      <M id="platformer/flowers" p={[-11.0, 0, -165.2]} s={2.4} />
      <M id="platformer/flowers" p={[11.0, 0, -165.0]} s={2.4} r={2} />
    </group>
  );
}
