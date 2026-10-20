// Hand-placed props that tell the story and hint the puzzles (procedural, palette-matched).
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { MAT } from './materials';
import { buildIsland, scenicIsland } from './islandGeo';
import { Model } from './Models';
import { SafeBoundary } from './SafeBoundary';
import { Suspense, type ReactNode } from 'react';

/** Kenney model with a procedural fallback if the file is missing or fails to parse. */
function M({ id, p, s = 1, r = 0, fallback, spin }: { id: string; p: [number, number, number]; s?: number; r?: number; fallback?: ReactNode; spin?: { node: string; axis: 'x' | 'y' | 'z'; speed: number } }) {
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

function CrookedTower({ p }: { p: [number, number, number] }) {
  const floors = [
    { w: 4.2, h: 3.2, r: 0.0, dx: 0 },
    { w: 3.8, h: 3.0, r: 0.06, dx: 0.3 },
    { w: 3.4, h: 2.8, r: -0.05, dx: 0.1 },
    { w: 3.0, h: 2.6, r: 0.09, dx: 0.5 },
  ];
  let y = 0;
  return (
    <group position={p}>
      {floors.map((f, i) => {
        const el = (
          <group key={i} position={[f.dx, y + f.h / 2, 0]} rotation={[0, i * 0.2, f.r]}>
            <mesh material={i % 2 ? MAT.wood : MAT.cream} castShadow receiveShadow>
              <boxGeometry args={[f.w, f.h, f.w]} />
            </mesh>
            <mesh position={[0, 0, f.w / 2 + 0.01]} material={MAT.iron}>
              <boxGeometry args={[0.7, 0.9, 0.05]} />
            </mesh>
            <mesh position={[0, -f.h / 2 + 0.1, 0]} material={MAT.darkwood}>
              <boxGeometry args={[f.w + 0.3, 0.2, f.w + 0.3]} />
            </mesh>
          </group>
        );
        y += f.h - 0.05;
        return el;
      })}
      <mesh position={[0.7, y + 1.6, 0]} rotation={[0, 0, 0.12]} material={MAT.teal} castShadow>
        <coneGeometry args={[2.4, 3.4, 6]} />
      </mesh>
      <mesh position={[0.95, y + 3.5, 0]} material={MAT.gold}>
        <sphereGeometry args={[0.3, 10, 8]} />
      </mesh>
    </group>
  );
}

function SmallIsland({ x, z, r, top }: { x: number; z: number; r: number; top: number }) {
  const m = useMemo(() => buildIsland(scenicIsland(Math.round(x * 13 + z), x, z, r, top, r * 1.3)), [x, z, r, top]);
  return (
    <group>
      <mesh geometry={m.top} material={MAT.grass} receiveShadow />
      <mesh geometry={m.lip} material={MAT.grassRim} />
      <mesh geometry={m.cliff} material={MAT.cliff} />
      <mesh geometry={m.under} material={MAT.rock} />
    </group>
  );
}

/** Stone frame + glowing LONG silhouette around the low arch so the clearance reads at a glance. */
function ArchDressing() {
  const glow = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (glow.current) glow.current.emissiveIntensity = 0.9 + Math.sin(clock.elapsedTime * 3) * 0.35;
  });
  const z = -24.94;
  return (
    <group>
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * 2.25, 1.0, z + 0.1]} material={MAT.stonePlain} castShadow>
          <boxGeometry args={[0.5, 2.0, 0.4]} />
        </mesh>
      ))}
      <mesh position={[0, 1.6, z + 0.12]} material={MAT.darkwood} castShadow>
        <boxGeometry args={[5.0, 0.32, 0.36]} />
      </mesh>
      <group position={[0, 2.55, z + 0.05]}>
        <mesh>
          <boxGeometry args={[3.6, 0.85, 0.06]} />
          <meshStandardMaterial color="#3d3360" roughness={0.8} />
        </mesh>
        <mesh position={[0, 0, 0.05]}>
          <boxGeometry args={[3.0, 0.42, 0.04]} />
          <meshStandardMaterial ref={glow} color="#ffe07a" emissive="#ffb000" emissiveIntensity={1} />
        </mesh>
      </group>
      {/* clearance tick marks */}
      {[-1, 1].map((sx) => (
        <mesh key={'t' + sx} position={[sx * 2.0, 1.45, z + 0.32]} material={MAT.gold}>
          <boxGeometry args={[0.5, 0.08, 0.08]} />
        </mesh>
      ))}
    </group>
  );
}

/** Ledges, ivy and strata on the tower cliff face so it isn't a flat wall. */
function CliffDressing() {
  const items = useMemo(() => {
    const R = (n: number) => ((Math.sin(n * 91.7) * 43758.5453) % 1 + 1) % 1;
    const ivy: [number, number, number][] = [];
    for (let i = 0; i < 9; i++) ivy.push([-9 + R(i) * 18, 3 + R(i + 9) * 4, 0.6 + R(i + 3) * 1.4]);
    const ledges: [number, number, number][] = [];
    for (let i = 0; i < 7; i++) ledges.push([-9 + R(i + 20) * 18, 1.5 + R(i + 30) * 5.5, 0.8 + R(i + 40) * 1.6]);
    return { ivy, ledges };
  }, []);
  return (
    <group>
      {items.ivy
        .filter(([x]) => Math.abs(x - LEVER_X) > 1.6 && (x < 1.0 || x > 8.2))
        .map(([x, y, w], i) => (
          <mesh key={i} position={[x, y, -103.93]}>
            <planeGeometry args={[w, 8 - y + 0.3]} />
            <meshStandardMaterial color={i % 2 ? '#5fae6c' : '#73c07c'} roughness={0.9} side={THREE.DoubleSide} />
          </mesh>
        ))}
      {items.ledges
        .filter(([x]) => Math.abs(x - LEVER_X) > 1.8 && (x < 1.0 || x > 8.2))
        .map(([x, y, w], i) => (
          <mesh key={'l' + i} position={[x, y, -103.85]} material={MAT.stonePlain} castShadow>
            <boxGeometry args={[w, 0.35, 0.45]} />
          </mesh>
        ))}
      {[1.4, 3.1, 5.0, 6.8].map((y) => (
        <mesh key={'s' + y} position={[0, y, -103.97]}>
          <planeGeometry args={[20, 0.12]} />
          <meshStandardMaterial color="#b3a8c2" roughness={1} />
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
      <CliffDressing />
      {/* Chapter 1 — dock */}
      <M id="town/cottage_b" p={[-7.4, 0, 5.2]} s={2.3} r={0.5 + Math.PI / 2} fallback={<Cottage p={[-7.4, 0, 5.2]} rotY={0.5} />} />
      <M id="town/cottage_c" p={[-8.2, 0, -2.0]} s={2.2} r={Math.PI / 2 + 0.2} />
      <M id="platformer/crate" p={[6.6, 0, 6.6]} s={2.2} r={0.2} fallback={<Crate p={[6.6, 0, 6.6]} s={1.1} rotY={0.2} />} />
      <M id="platformer/crate" p={[7.7, 0, 5.2]} s={1.8} r={-0.4} fallback={<Crate p={[7.7, 0, 5.2]} s={0.9} rotY={-0.4} />} />
      <M id="platformer/crate" p={[6.7, 1.1, 6.5]} s={1.5} r={0.7} />
      <M id="platformer/chest" p={[8.3, 0, 7.6]} s={2.0} r={-0.6} />
      <M id="platformer/barrel" p={[7.6, 0, 2.6]} s={2.0} fallback={<Barrel p={[7.6, 0, 2.6]} />} />
      <M id="platformer/barrel" p={[8.4, 0, 3.6]} s={1.9} r={1} fallback={<Barrel p={[8.3, 0, 3.4]} />} />
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
      <SmallIsland x={-18} z={-52} r={4.5} top={1.2} />
      <M id="town/windmill" p={[-18, 1.2, -52]} s={1.7} r={0.9} spin={{ node: 'sails', axis: 'z', speed: 0.9 }} fallback={<Windmill p={[-18, 1.2, -52]} />} />
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
      <SmallIsland x={-15.5} z={-108} r={3.6} top={9} />
      <CrookedTower p={[-15.5, 9, -108]} />
      {/* Chapter 4 — castle dash */}
      <Sign p={[-1.2, 8, -114.6]} rotY={0.2} tex={tex.safe} w={1.6} h={1.0} />
      <Sign p={[1.2, 8, -114.6]} rotY={-0.2} tex={tex.fast} w={1.6} h={1.0} />
      <M id="castle/tower_hex_full" p={[-22, 0, -176]} s={4.2} r={0.3} />
      <M id="castle/tower_hex_full" p={[22, 0, -178]} s={4.6} r={-0.4} />
      <M id="castle/gatehouse" p={[0, 18, -196]} s={4.5} />
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
    </group>
  );
}
