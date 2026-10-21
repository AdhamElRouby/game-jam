// Decorative world: royal castle, scenic floating islands, foliage, cottages, fans + wind streaks, waterfalls.
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { LEVEL } from '../shared/level';
import { scenicIsland } from './islandGeo';
import { MergedIslands } from './Islands';
import { MAT, rng } from './materials';
import { frame } from './frame';
import { Props, textTexture } from './Props';
import { WindMachine } from './Ch2';
import { Castle } from './Castle';
import { Waterfall } from './Water';
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
  ...LEVEL.decorKeepOut,
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

/** Small decorative islands right beside the course: windmill (ch2) and crooked tower (ch3). x, z, radius, top. */
export const SMALL_ISLANDS: [number, number, number, number][] = [
  [-18, -52, 4.5, 1.2],
  [-15.5, -108, 3.6, 9],
  // rock perches for the wind machines
  [13.0, -51.5, 2.1, -2.0],
  [13.0, -58.5, 2.1, -2.0],
  [12.5, -133, 2.8, 0.6],
];

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

// ------------------------------------------------------------------ fans + wind streaks

function WindStreaks({ zone, idx }: { zone: (typeof LEVEL.windZones)[number]; idx: 'wind' | 'fan' }) {
  const N = 34;
  const ref = useRef<THREE.InstancedMesh>(null);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: { op: { value: 0 }, t: { value: 0 } },
        vertexShader: /* glsl */ `
          attribute float aPhase;
          uniform float t;
          varying float vU;
          varying float vV;
          void main() {
            vU = uv.x;
            vV = uv.y;
            vec3 p = position;
            p.y += sin(uv.x * 6.2831 + t * 3.0 + aPhase) * 0.12;
            p.z += cos(uv.x * 4.0 + aPhase) * 0.15;
            gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(p, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform float op;
          varying float vU;
          varying float vV;
          void main() {
            float taper = pow(clamp(sin(vU * 3.14159), 0.0, 1.0), 1.6);
            float core = 1.0 - abs(vV - 0.5) * 2.0;
            gl_FragColor = vec4(vec3(1.0), op * taper * smoothstep(0.0, 0.6, core));
          }`,
      }),
    [],
  );
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1, 12, 1);
    const R = rng(idx === 'wind' ? 51 : 91);
    g.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array(Array.from({ length: N }, () => R() * 6.28)), 1));
    return g;
  }, [idx]);
  const state = useMemo(() => {
    const R = rng(idx === 'wind' ? 5 : 9);
    return Array.from({ length: N }, () => ({ x: zone.min[0] + R() * (zone.max[0] - zone.min[0]), y: 0.4 + R() * 3.2, z: zone.min[2] + R() * (zone.max[2] - zone.min[2]), sp: 0.7 + R() * 0.6, len: 1.6 + R() * 2.4 }));
  }, [zone, idx]);
  const m4 = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const v = useMemo(() => new THREE.Vector3(), []);
  const sc = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dtRaw) => {
    const dt = Math.min(0.05, dtRaw);
    const s = idx === 'wind' ? frame.current.w.wind : frame.current.w.fan;
    const strength = s > 0 ? s : s < 0 ? -s * 0.2 : 0;
    mat.uniforms.op.value += (strength * 0.7 - mat.uniforms.op.value) * Math.min(1, dt * 6);
    mat.uniforms.t.value += dt;
    const mesh = ref.current;
    if (!mesh) return;
    const baseY = idx === 'fan' ? 3 : 0;
    state.forEach((p, i) => {
      p.x += zone.dir[0] * dt * (6 + strength * 22) * p.sp;
      if (p.x < zone.min[0]) p.x = zone.max[0];
      if (p.x > zone.max[0]) p.x = zone.min[0];
      const ry = idx === 'fan' ? baseY + ((zone.max[2] - p.z) / (zone.max[2] - zone.min[2])) * -3.5 : baseY;
      m4.compose(v.set(p.x, ry + p.y, p.z), q, sc.set(p.len * (0.6 + strength * 0.6), 0.08, 1));
      mesh.setMatrixAt(i, m4);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geo, mat, N]} frustumCulled={false} renderOrder={3} />;
}

export { castleDoor } from './Castle';

// ------------------------------------------------------------------ assembly

export function Scenery() {
  const scenic = useMemo(() => scenicIslands(), []);
  const scenicDefs = useMemo(() => [...scenic.map((s) => s.isl), ...SMALL_ISLANDS.map(([x, z, r, top]) => scenicIsland(Math.round(x * 13 + z), x, z, r, top, r * 1.3))], [scenic]);
  const deco = useMemo(() => [...courseDecor(), ...scenic.flatMap((s) => s.deco)], [scenic]);
  return (
    <group>
      <MergedIslands defs={scenicDefs} scenic />
      {scenic
        .filter((s) => s.fall)
        .map((s, i) => {
          const p = s.isl.pts[0];
          return <Waterfall key={i} x={p[0]} y={s.isl.top - 0.04} z={p[1]} w={2.2} h={20} rotY={Math.atan2(p[0] - s.isl.rect.cx, p[1] - s.isl.rect.cz)} />;
        })}
      {/* waterfall off the windy cliffs and the tower island */}
      <Waterfall x={-10.0} y={-0.04} z={-71} w={2.4} h={18} rotY={-Math.PI / 2} />
      <Waterfall x={10.0} y={7.96} z={-110} w={2.8} h={24} rotY={Math.PI / 2} />
      <SafeBoundary name="foliage" fallback={<Foliage items={deco} />}>
        <Suspense fallback={null}>
          <ModelFoliage items={deco} />
        </Suspense>
      </SafeBoundary>
      <Castle />
      <WindMachine p={[12.9, 1.2, -51.5]} which="wind" />
      <WindMachine p={[12.9, 1.2, -58.5]} which="wind" />
      <WindMachine p={[12.4, 5.4, -133]} which="fan" scale={1.5} />
      <WindStreaks zone={LEVEL.windZones[0]} idx="wind" />
      <WindStreaks zone={LEVEL.windZones[1]} idx="fan" />
      <Props />
    </group>
  );
}
