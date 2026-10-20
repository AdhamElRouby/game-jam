// Decorative world: royal castle, scenic floating islands, foliage, cottages, fans + wind streaks, waterfalls.
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { LEVEL } from '../shared/level';
import { buildIsland, scenicIsland } from './islandGeo';
import { MAT, rng } from './materials';
import { frame } from './frame';
import { Props, textTexture } from './Props';
import { InstancedModel, type Placement } from './Models';
import { SafeBoundary } from './SafeBoundary';
import { Suspense } from 'react';

const VARIANTS: Record<DecoItem['kind'], { id: string; s: [number, number] }[]> = {
  tree: [
    { id: 'nature/tree_round_a', s: [2.7, 3.5] },
    { id: 'nature/tree_round_b', s: [2.6, 3.3] },
    { id: 'nature/tree_tall_round', s: [2.3, 3.0] },
    { id: 'nature/tree_leafy_cluster', s: [2.6, 3.3] },
  ],
  pine: [{ id: 'nature/tree_pine', s: [2.6, 3.5] }],
  bush: [
    { id: 'nature/bush_round', s: [1.8, 2.5] },
    { id: 'nature/bush_leafy', s: [2.4, 3.0] },
    { id: 'nature/bush_small', s: [2.6, 3.4] },
  ],
  rock: [
    { id: 'nature/rock_large', s: [1.1, 1.8] },
    { id: 'nature/rock_small', s: [1.3, 2.0] },
    { id: 'nature/rock_grassy', s: [1.1, 1.6] },
    { id: 'nature/rock_tall_cluster', s: [1.0, 1.6] },
  ],
  flower: [
    { id: 'nature/flower_red', s: [2.2, 2.8] },
    { id: 'nature/flower_purple', s: [2.2, 2.8] },
    { id: 'nature/flower_yellow', s: [2.2, 2.8] },
  ],
  mushroom: [
    { id: 'nature/mushroom_red', s: [2.6, 3.4] },
    { id: 'nature/mushroom_cluster_tan', s: [2.4, 3.1] },
  ],
  tuft: [
    { id: 'nature/grass_tuft', s: [2.4, 3.2] },
    { id: 'nature/grass_tuft_large', s: [2.4, 3.2] },
  ],
};

function ModelFoliage({ items }: { items: DecoItem[] }) {
  const groups = useMemo(() => {
    const by = new Map<string, Placement[]>();
    for (const it of items) {
      const vs = VARIANTS[it.kind];
      const v = vs[(it.c ?? 0) % vs.length];
      const k = Math.min(1, Math.max(0, (it.s - 0.7) / 0.6));
      const sc = v.s[0] + (v.s[1] - v.s[0]) * k;
      if (!by.has(v.id)) by.set(v.id, []);
      by.get(v.id)!.push({ x: it.x, y: it.y, z: it.z, s: sc, r: it.r });
    }
    return [...by.entries()];
  }, [items]);
  return (
    <group>
      {groups.map(([id, list]) => (
        <InstancedModel key={id} id={id} items={list} shadow={!id.includes('flower') && !id.includes('tuft')} />
      ))}
    </group>
  );
}

// ------------------------------------------------------------------ foliage instancing

export interface DecoItem {
  kind: 'tree' | 'pine' | 'bush' | 'rock' | 'flower' | 'mushroom' | 'tuft';
  x: number;
  y: number;
  z: number;
  s: number;
  r: number;
  c?: number;
}

type Rect = [number, number, number, number];

// gameplay keep-out zones (x0, z0, x1, z1): no decoration inside
const KEEP: Rect[] = [
  [-6, 10.5, 6, -12.5], // dock lane
  [-10.5, -7, 10.5, -10], // gate wall
  [-5.5, -12, 5.5, -40], // arch lane
  [-10.5, -24.5, 10.5, -28.5], // arch wall
  [-9, -44, 9, -82], // cliffs + gap
  [-5.5, -80, 5.5, -88],
  [-8.5, -87, 8.5, -104.5],
  [-9.5, -104, 9.5, -116.5],
  [-10, -116, 8.5, -153],
  [-10.5, -152, 10.5, -170],
];

function blocked(x: number, z: number) {
  return KEEP.some(([x0, z0, x1, z1]) => x > Math.min(x0, x1) && x < Math.max(x0, x1) && z < Math.max(z0, z1) && z > Math.min(z0, z1));
}

function insidePoly(x: number, z: number, pts: [number, number][]) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function courseDecor(): DecoItem[] {
  const out: DecoItem[] = [];
  const R = rng(99);
  for (const isl of LEVEL.islands) {
    if (isl.id === 'L') continue;
    const { cx, cz, hx, hz } = isl.rect;
    const tries = Math.round(hx * hz * 0.9);
    for (let i = 0; i < tries; i++) {
      const x = cx + (R() * 2 - 1) * (hx - 0.9);
      const z = cz + (R() * 2 - 1) * (hz - 0.9);
      if (!insidePoly(x, z, isl.pts) || blocked(x, z)) continue;
      // only near the rim, keep the play space clear
      const edge = Math.min(hx - Math.abs(x - cx), hz - Math.abs(z - cz));
      if (edge > 3.2) continue;
      const roll = R();
      const kind: DecoItem['kind'] = roll < 0.16 ? 'tree' : roll < 0.22 ? 'pine' : roll < 0.42 ? 'bush' : roll < 0.56 ? 'rock' : roll < 0.86 ? 'flower' : roll < 0.9 ? 'mushroom' : 'tuft';
      out.push({ kind, x, y: isl.top, z, s: 0.7 + R() * 0.6, r: R() * Math.PI * 2, c: Math.floor(R() * 4) });
    }
  }
  return out;
}

interface ScenicDef {
  isl: ReturnType<typeof scenicIsland>;
  deco: DecoItem[];
  fall: boolean;
}

function scenicIslands(): ScenicDef[] {
  const R = rng(1234);
  const out: ScenicDef[] = [];
  const spots: [number, number, number, number][] = [
    // x, z, radius, top
    [-34, 4, 9, -4],
    [36, -8, 11, -2],
    [-46, -38, 13, 3],
    [44, -44, 8, -8],
    [-30, -72, 7, 9],
    [52, -86, 14, 4],
    [-52, -104, 11, -6],
    [30, -122, 9, 14],
    [-38, -140, 10, 2],
    [46, -150, 12, -4],
    [-60, -18, 8, 12],
    [70, -30, 10, 10],
    [-74, -84, 15, 0],
    [84, -120, 16, 6],
    [-24, 30, 7, -10],
    [24, 34, 9, -12],
    [-30, -190, 14, 4],
    [34, -196, 12, 10],
    [0, -228, 22, 6],
  ];
  spots.forEach(([x, z, r, top], i) => {
    const isl = scenicIsland(500 + i, x, z, r, top, r * 1.2);
    const deco: DecoItem[] = [];
    const n = Math.round(r * 1.4);
    for (let k = 0; k < n; k++) {
      const a = R() * Math.PI * 2;
      const d = R() * r * 0.7;
      const roll = R();
      deco.push({ kind: roll < 0.45 ? 'tree' : roll < 0.65 ? 'pine' : roll < 0.85 ? 'bush' : 'rock', x: x + Math.cos(a) * d, y: top, z: z + Math.sin(a) * d, s: 0.9 + R() * 0.9, r: R() * 6, c: Math.floor(R() * 4) });
    }
    out.push({ isl, deco, fall: i % 3 === 0 });
  });
  return out;
}

const CANOPY = ['#7fd17e', '#5fbf76', '#9adf8a', '#f49bb5'];
const FLOWER = ['#ff8fb1', '#ffe07a', '#ffffff', '#b9a6ff'];

function Foliage({ items }: { items: DecoItem[] }) {
  const refs = {
    trunk: useRef<THREE.InstancedMesh>(null),
    canopy: useRef<THREE.InstancedMesh>(null),
    pine: useRef<THREE.InstancedMesh>(null),
    bush: useRef<THREE.InstancedMesh>(null),
    rock: useRef<THREE.InstancedMesh>(null),
    flower: useRef<THREE.InstancedMesh>(null),
    stem: useRef<THREE.InstancedMesh>(null),
    cap: useRef<THREE.InstancedMesh>(null),
    tuft: useRef<THREE.InstancedMesh>(null),
  };
  const groups = useMemo(() => {
    const by: Record<string, DecoItem[]> = {};
    for (const it of items) (by[it.kind] ??= []).push(it);
    return by;
  }, [items]);
  const counts = {
    tree: groups.tree?.length ?? 0,
    pine: groups.pine?.length ?? 0,
    bush: groups.bush?.length ?? 0,
    rock: groups.rock?.length ?? 0,
    flower: groups.flower?.length ?? 0,
    mushroom: groups.mushroom?.length ?? 0,
    tuft: groups.tuft?.length ?? 0,
  };
  const geos = useMemo(
    () => ({
      trunk: new THREE.CylinderGeometry(0.16, 0.24, 1.6, 6).translate(0, 0.8, 0),
      canopy: new THREE.IcosahedronGeometry(1.15, 0).translate(0, 2.3, 0),
      pine: new THREE.ConeGeometry(1.0, 3.2, 7).translate(0, 2.2, 0),
      bush: new THREE.IcosahedronGeometry(0.62, 0).translate(0, 0.42, 0),
      rock: new THREE.DodecahedronGeometry(0.55, 0).translate(0, 0.2, 0),
      flower: new THREE.IcosahedronGeometry(0.11, 0).translate(0, 0.32, 0),
      stem: new THREE.CylinderGeometry(0.02, 0.02, 0.32, 4).translate(0, 0.16, 0),
      cap: new THREE.SphereGeometry(0.32, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.32, 0),
      tuft: new THREE.ConeGeometry(0.14, 0.42, 4).translate(0, 0.2, 0),
    }),
    [],
  );
  const mats = useMemo(
    () => ({
      canopy: new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true }),
      pine: new THREE.MeshStandardMaterial({ color: '#4fa46c', roughness: 0.85, flatShading: true }),
      bush: new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true }),
      rock: new THREE.MeshStandardMaterial({ color: '#b3abc6', roughness: 0.95, flatShading: true }),
      flower: new THREE.MeshStandardMaterial({ roughness: 0.6 }),
      stem: new THREE.MeshStandardMaterial({ color: '#4f9f5f' }),
      cap: new THREE.MeshStandardMaterial({ color: '#ff6f7d', roughness: 0.6 }),
      tuft: new THREE.MeshStandardMaterial({ color: '#69bf7f', roughness: 0.9, flatShading: true }),
    }),
    [],
  );
  useMemo(() => {
    // populated after refs mount via effect below
  }, []);
  const m4 = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const e = useMemo(() => new THREE.Euler(), []);
  const v = useMemo(() => new THREE.Vector3(), []);
  const sc = useMemo(() => new THREE.Vector3(), []);
  const col = useMemo(() => new THREE.Color(), []);
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    done.current = true;
    const set = (mesh: THREE.InstancedMesh | null, list: DecoItem[] | undefined, f: (it: DecoItem, i: number) => [number, number, number, number, string?]) => {
      if (!mesh || !list) return;
      list.forEach((it, i) => {
        const [sx, sy, sz, yoff, c] = f(it, i);
        e.set(0, it.r, 0);
        q.setFromEuler(e);
        v.set(it.x, it.y + yoff, it.z);
        sc.set(sx, sy, sz);
        m4.compose(v, q, sc);
        mesh.setMatrixAt(i, m4);
        if (c) mesh.setColorAt(i, col.set(c));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };
    set(refs.trunk.current, groups.tree, (it) => [it.s, it.s, it.s, 0]);
    set(refs.canopy.current, groups.tree, (it) => [it.s * 1.05, it.s * 0.95, it.s * 1.05, 0, CANOPY[(it.c ?? 0) % 3 === 0 && it.s > 1.15 ? 3 : (it.c ?? 0) % 3]]);
    set(refs.pine.current, groups.pine, (it) => [it.s * 0.9, it.s, it.s * 0.9, 0]);
    set(refs.bush.current, groups.bush, (it) => [it.s * 1.2, it.s * 0.85, it.s * 1.1, 0, CANOPY[(it.c ?? 0) % 3]]);
    set(refs.rock.current, groups.rock, (it) => [it.s * 1.3, it.s * 0.8, it.s, 0]);
    set(refs.flower.current, groups.flower, (it) => [1, it.s, 1, 0, FLOWER[it.c ?? 0]]);
    set(refs.stem.current, groups.flower, (it) => [1, it.s, 1, 0]);
    set(refs.cap.current, groups.mushroom, (it) => [it.s, it.s, it.s, 0]);
    set(refs.tuft.current, groups.tuft, (it) => [it.s, it.s, it.s, 0]);
  });
  return (
    <group>
      {counts.tree > 0 && <instancedMesh ref={refs.trunk} args={[geos.trunk, MAT.trunk, counts.tree]} castShadow />}
      {counts.tree > 0 && <instancedMesh ref={refs.canopy} args={[geos.canopy, mats.canopy, counts.tree]} castShadow />}
      {counts.pine > 0 && <instancedMesh ref={refs.pine} args={[geos.pine, mats.pine, counts.pine]} castShadow />}
      {counts.bush > 0 && <instancedMesh ref={refs.bush} args={[geos.bush, mats.bush, counts.bush]} castShadow />}
      {counts.rock > 0 && <instancedMesh ref={refs.rock} args={[geos.rock, mats.rock, counts.rock]} castShadow receiveShadow />}
      {counts.flower > 0 && <instancedMesh ref={refs.flower} args={[geos.flower, mats.flower, counts.flower]} />}
      {counts.flower > 0 && <instancedMesh ref={refs.stem} args={[geos.stem, mats.stem, counts.flower]} />}
      {counts.mushroom > 0 && <instancedMesh ref={refs.cap} args={[geos.cap, mats.cap, counts.mushroom]} castShadow />}
      {counts.tuft > 0 && <instancedMesh ref={refs.tuft} args={[geos.tuft, mats.tuft, counts.tuft]} />}
    </group>
  );
}

// ------------------------------------------------------------------ waterfalls

function useWaterTex() {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = '#bfefff';
    g.fillRect(0, 0, 64, 256);
    const R = rng(77);
    for (let i = 0; i < 60; i++) {
      g.fillStyle = `rgba(255,255,255,${0.25 + R() * 0.5})`;
      g.fillRect(R() * 64, R() * 256, 1 + R() * 3, 20 + R() * 60);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
}

function Waterfall({ x, y, z, w, h, rotY }: { x: number; y: number; z: number; w: number; h: number; rotY: number }) {
  const tex = useWaterTex();
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.82, depthWrite: false, side: THREE.DoubleSide, fog: true }), [tex]);
  useFrame((_, dt) => {
    tex.offset.y += dt * 0.9;
  });
  return (
    <group position={[x, y, z]} rotation={[0, rotY, 0]}>
      <mesh position={[0, -h / 2, 0]} material={mat}>
        <planeGeometry args={[w, h, 1, 1]} />
      </mesh>
      <mesh position={[0, -h, 0.4]} material={MAT.white}>
        <icosahedronGeometry args={[w * 0.6, 1]} />
      </mesh>
    </group>
  );
}

// ------------------------------------------------------------------ fans + wind streaks

function Fan({ x, y, z, which, scale = 1 }: { x: number; y: number; z: number; which: 'wind' | 'fan'; scale?: number }) {
  const blades = useRef<THREE.Group>(null);
  const spin = useRef(0);
  useFrame((_, dt) => {
    const w = frame.current.w;
    const s = which === 'wind' ? w.wind : w.fan;
    const speed = s > 0 ? 4 + s * 20 : s < 0 ? 1 + -s * 6 : 0.6;
    spin.current += dt * speed;
    if (blades.current) blades.current.rotation.x = spin.current;
  });
  return (
    <group position={[x, y, z]} scale={scale}>
      <mesh position={[0, -1.6, 0]} material={MAT.darkwood} castShadow>
        <cylinderGeometry args={[0.35, 0.55, 3.2, 8]} />
      </mesh>
      <group position={[0, 0.4, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]} material={MAT.teal} castShadow>
          <torusGeometry args={[1.9, 0.18, 8, 28]} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]} material={MAT.gold}>
          <cylinderGeometry args={[0.45, 0.6, 0.8, 16]} />
        </mesh>
        <group ref={blades}>
          {[0, 1, 2, 3].map((i) => (
            <mesh key={i} rotation={[(i * Math.PI) / 2, 0, 0]} position={[-0.2, 0, 0]} material={MAT.cream} castShadow>
              <boxGeometry args={[0.08, 0.5, 1.7]} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}

function WindStreaks({ zone, idx }: { zone: (typeof LEVEL.windZones)[number]; idx: 'wind' | 'fan' }) {
  const N = 36;
  const ref = useRef<THREE.InstancedMesh>(null);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }), []);
  const geo = useMemo(() => new THREE.BoxGeometry(2.2, 0.05, 0.05), []);
  const state = useMemo(() => {
    const R = rng(idx === 'wind' ? 5 : 9);
    return Array.from({ length: N }, () => ({ x: zone.min[0] + R() * (zone.max[0] - zone.min[0]), y: 0.4 + R() * 3.5, z: zone.min[2] + R() * (zone.max[2] - zone.min[2]), sp: 0.7 + R() * 0.6 }));
  }, [zone, idx]);
  const m4 = useMemo(() => new THREE.Matrix4(), []);
  useFrame((_, dtRaw) => {
    const dt = Math.min(0.05, dtRaw);
    const s = idx === 'wind' ? frame.current.w.wind : frame.current.w.fan;
    const strength = s > 0 ? s : s < 0 ? -s * 0.25 : 0;
    mat.opacity += (strength * 0.75 - mat.opacity) * Math.min(1, dt * 6);
    const mesh = ref.current;
    if (!mesh) return;
    const baseY = idx === 'fan' ? 3 : 0;
    state.forEach((p, i) => {
      p.x += zone.dir[0] * dt * (6 + strength * 22) * p.sp;
      if (p.x < zone.min[0]) p.x = zone.max[0];
      if (p.x > zone.max[0]) p.x = zone.min[0];
      const ry = idx === 'fan' ? baseY + ((zone.max[2] - p.z) / (zone.max[2] - zone.min[2])) * -3.5 : baseY;
      m4.makeTranslation(p.x, ry + p.y, p.z);
      mesh.setMatrixAt(i, m4);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geo, mat, N]} frustumCulled={false} />;
}

// ------------------------------------------------------------------ castle

function Tower({ x, y, z, r, h, roof, roofH, flag }: { x: number; y: number; z: number; r: number; h: number; roof: THREE.Material; roofH: number; flag?: string }) {
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, h / 2, 0]} material={MAT.cream} castShadow receiveShadow>
        <cylinderGeometry args={[r, r * 1.06, h, 18]} />
      </mesh>
      <mesh position={[0, h + 0.25, 0]} material={MAT.stonePlain}>
        <cylinderGeometry args={[r * 1.16, r * 1.16, 0.5, 18]} />
      </mesh>
      <mesh position={[0, h + 0.5 + roofH / 2, 0]} material={roof} castShadow>
        <coneGeometry args={[r * 1.25, roofH, 18]} />
      </mesh>
      <mesh position={[0, h + 0.6 + roofH, 0]} material={MAT.gold}>
        <sphereGeometry args={[0.3, 10, 8]} />
      </mesh>
      {flag && (
        <group position={[0, h + 0.6 + roofH, 0]}>
          <mesh position={[0, 1, 0]} material={MAT.darkwood}>
            <cylinderGeometry args={[0.06, 0.06, 2, 6]} />
          </mesh>
          <mesh position={[0.7, 1.6, 0]}>
            <boxGeometry args={[1.3, 0.75, 0.04]} />
            <meshStandardMaterial color={flag} />
          </mesh>
        </group>
      )}
      {[0.35, 0.62].map((t) => (
        <mesh key={t} position={[0, h * t, r * 0.98]} material={MAT.iron}>
          <boxGeometry args={[r * 0.35, r * 0.6, 0.15]} />
        </mesh>
      ))}
    </group>
  );
}

export const castleDoor = { open: 0 };

function Castle() {
  const doorL = useRef<THREE.Group>(null);
  const doorR = useRef<THREE.Group>(null);
  useFrame(() => {
    const a = castleDoor.open * 1.6;
    if (doorL.current) doorL.current.rotation.y = a;
    if (doorR.current) doorR.current.rotation.y = -a;
  });
  const merlons = useMemo(() => Array.from({ length: 13 }, (_, i) => -12 + i * 2), []);
  const castleIsl = useMemo(() => buildIsland(scenicIsland(900, 0, -186, 26, 0, 30)), []);
  return (
    <group>
      <mesh geometry={castleIsl.top} material={MAT.grass} receiveShadow />
      <mesh geometry={castleIsl.lip} material={MAT.grassRim} />
      <mesh geometry={castleIsl.cliff} material={MAT.cliff} />
      <mesh geometry={castleIsl.under} material={MAT.rock} />
      {/* crenellations on the physical front wall */}
      {merlons.map((x) => (
        <mesh key={x} position={[x, 6.5, -170.6]} material={MAT.cream} castShadow>
          <boxGeometry args={[1.1, 1, 1.3]} />
        </mesh>
      ))}
      <mesh position={[-7.8, 3, -170.6]} material={MAT.stone} castShadow receiveShadow>
        <boxGeometry args={[10.4, 6, 1.2]} />
      </mesh>
      <mesh position={[7.8, 3, -170.6]} material={MAT.stone} castShadow receiveShadow>
        <boxGeometry args={[10.4, 6, 1.2]} />
      </mesh>
      <mesh position={[0, 5.7, -170.6]} material={MAT.stone} castShadow>
        <boxGeometry args={[5.2, 0.6, 1.2]} />
      </mesh>
      {/* dark hall behind the doorway so the open gate reads as an opening */}
      <mesh position={[0, 2.7, -171.4]}>
        <boxGeometry args={[5.2, 5.4, 0.1]} />
        <meshBasicMaterial color="#2a2140" />
      </mesh>
      {[-1, 1].map((sx) => (
        <mesh key={'jamb' + sx} position={[sx * 2.6, 2.7, -170.7]}>
          <boxGeometry args={[0.1, 5.4, 1.4]} />
          <meshStandardMaterial color="#3a2f55" />
        </mesh>
      ))}
      {[-9, -5.5, 5.5, 9].map((x) => (
        <mesh key={'win' + x} position={[x, 3.8, -169.93]} material={MAT.iron}>
          <boxGeometry args={[0.9, 1.3, 0.05]} />
        </mesh>
      ))}
      {/* gate arch + doors */}
      <mesh position={[0, 5.6, -169.9]} material={MAT.gold}>
        <torusGeometry args={[2.7, 0.22, 8, 24, Math.PI]} />
      </mesh>
      <group ref={doorL} position={[-2.6, 0, -169.85]}>
        <mesh position={[1.3, 2.7, 0]} material={MAT.darkwood} castShadow>
          <boxGeometry args={[2.6, 5.4, 0.25]} />
        </mesh>
        <mesh position={[2.2, 2.7, 0.16]} material={MAT.gold}>
          <torusGeometry args={[0.22, 0.06, 6, 12]} />
        </mesh>
      </group>
      <group ref={doorR} position={[2.6, 0, -169.85]}>
        <mesh position={[-1.3, 2.7, 0]} material={MAT.darkwood} castShadow>
          <boxGeometry args={[2.6, 5.4, 0.25]} />
        </mesh>
        <mesh position={[-2.2, 2.7, 0.16]} material={MAT.gold}>
          <torusGeometry args={[0.22, 0.06, 6, 12]} />
        </mesh>
      </group>
      {/* "GOAL" banner */}
      <group position={[0, 8.6, -169.7]}>
        <mesh material={MAT.pink}>
          <boxGeometry args={[6, 1.3, 0.1]} />
        </mesh>
        <BannerText text="ROYAL DELIVERIES" />
      </group>
      {/* keep + towers */}
      <mesh position={[0, 9, -184]} material={MAT.cream} castShadow receiveShadow>
        <boxGeometry args={[18, 18, 12]} />
      </mesh>
      <mesh position={[0, 21, -184]} material={MAT.pink} castShadow>
        <coneGeometry args={[12.5, 8, 4, 1]} />
      </mesh>
      <Tower x={-12.6} y={0} z={-171} r={2.6} h={13} roof={MAT.lavender} roofH={6} flag="#f49bb5" />
      <Tower x={12.6} y={0} z={-171} r={2.6} h={13} roof={MAT.lavender} roofH={6} flag="#9b8de4" />
      <Tower x={-10} y={0} z={-190} r={3} h={24} roof={MAT.pink} roofH={9} flag="#ffd153" />
      <Tower x={10} y={0} z={-190} r={3} h={22} roof={MAT.pink} roofH={8} flag="#64b9f4" />
      <Tower x={0} y={14} z={-186} r={3.4} h={22} roof={MAT.lavender} roofH={12} flag="#ff697f" />
      <Tower x={-18} y={0} z={-182} r={2.2} h={16} roof={MAT.pink} roofH={6} />
      <Tower x={18} y={0} z={-182} r={2.2} h={17} roof={MAT.lavender} roofH={6} />
      {/* hanging banners */}
      {[-7, 7].map((x) => (
        <mesh key={x} position={[x, 9, -177.9]} material={x < 0 ? MAT.pink : MAT.lavender}>
          <boxGeometry args={[2, 7, 0.1]} />
        </mesh>
      ))}
    </group>
  );
}

function BannerText({ text }: { text: string }) {
  const tex = useMemo(() => textTexture([text], 1024, 220, '#ffffff', 120), [text]);
  return (
    <mesh position={[0, 0, 0.06]}>
      <planeGeometry args={[5.6, 1.2]} />
      <meshBasicMaterial map={tex} transparent />
    </mesh>
  );
}

// ------------------------------------------------------------------ assembly

export function Scenery() {
  const scenic = useMemo(() => scenicIslands(), []);
  const scenicMeshes = useMemo(() => scenic.map((s) => buildIsland(s.isl)), [scenic]);
  const deco = useMemo(() => [...courseDecor(), ...scenic.flatMap((s) => s.deco)], [scenic]);
  return (
    <group>
      {scenicMeshes.map((m, i) => (
        <group key={i}>
          <mesh geometry={m.top} material={MAT.grass} receiveShadow />
          <mesh geometry={m.lip} material={MAT.grassRim} />
          <mesh geometry={m.cliff} material={MAT.cliff} />
          <mesh geometry={m.under} material={MAT.rock} />
        </group>
      ))}
      {scenic
        .filter((s) => s.fall)
        .map((s, i) => {
          const p = s.isl.pts[0];
          return <Waterfall key={i} x={p[0]} y={s.isl.top - 0.2} z={p[1]} w={2.4} h={22} rotY={Math.atan2(p[0] - s.isl.rect.cx, p[1] - s.isl.rect.cz)} />;
        })}
      {/* waterfall off the windy cliffs and the tower island */}
      <Waterfall x={-10.1} y={-0.3} z={-71} w={2.6} h={20} rotY={Math.PI / 2} />
      <Waterfall x={10.1} y={7.7} z={-110} w={3} h={26} rotY={Math.PI / 2} />
      <SafeBoundary name="foliage" fallback={<Foliage items={deco} />}>
        <Suspense fallback={null}>
          <ModelFoliage items={deco} />
        </Suspense>
      </SafeBoundary>
      <Castle />
      <Fan x={12.6} y={1.2} z={-51.5} which="wind" />
      <Fan x={12.6} y={1.2} z={-58.5} which="wind" />
      <Fan x={11.6} y={5.4} z={-133} which="fan" scale={1.5} />
      {/* rock pedestals for the fans */}
      {[
        [12.6, -51.5, -0.6],
        [12.6, -58.5, -0.6],
        [11.6, -133, 3.0],
      ].map(([x, z, y], i) => (
        <mesh key={i} position={[x, y - 1.2, z]} material={MAT.stonePlain} castShadow>
          <cylinderGeometry args={[1.4, 0.6, 2.4, 7]} />
        </mesh>
      ))}
      <WindStreaks zone={LEVEL.windZones[0]} idx="wind" />
      <WindStreaks zone={LEVEL.windZones[1]} idx="fan" />
      <Props />
    </group>
  );
}
