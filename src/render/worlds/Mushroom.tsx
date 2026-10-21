// World 4 visuals: a glowing mushroom forest on floating islands — giant toadstools, a little mushroom village, glow
// bulbs and soft spores. Decoration only (no colliders); the walkable shapes come from the map data.
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { BoxDef } from '../../shared/level';
import type { MapDef } from '../../shared/maps/types';
import { Kit } from '../kit';
import { KitMeshes, WOOD } from '../Structures';
import { rng } from '../materials';
import { InstancedModel, type Placement } from '../Models';
import { SafeBoundary } from '../SafeBoundary';
import { Suspense } from 'react';

type V3 = [number, number, number];
export const CAPS = ['#ff5d73', '#ff8f5a', '#b38cff', '#5fd0c4', '#ffd153'];
const STEM = '#f6ead6';

/** A toadstool (stem + domed cap + white spots) added to a kit at `p`, `h` tall, cap radius `r`. */
export function toadstool(k: Kit, p: V3, h: number, r: number, cap: string, lean = 0) {
  const [x, y, z] = p;
  k.cyl('plaster', STEM, r * 0.28, r * 0.36, h, [x, y + h / 2, z], [lean, 0, lean * 0.6], 12, 0.03);
  const cy = y + h;
  k.sphere('cloth', cap, r, [x + lean * h * 0.5, cy, z + lean * h * 0.3], [1, 0.55, 1], 2, 0.03);
  k.cyl('plaster', '#f0dcc8', r * 0.92, r * 0.92, 0.08, [x + lean * h * 0.5, cy - 0.02, z + lean * h * 0.3], [0, 0, 0], 18, 0);
  const n = Math.max(4, Math.round(r * 5));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r;
    const rr = r * (0.45 + ((i * 37) % 10) / 22);
    const sy = Math.sqrt(Math.max(0, 1 - (rr / r) ** 2)) * r * 0.55;
    k.sphere('plaster', '#ffffff', r * 0.11, [x + lean * h * 0.5 + Math.cos(a) * rr, cy + sy, z + lean * h * 0.3 + Math.sin(a) * rr], [1, 0.5, 1], 1, 0);
  }
}

function islandDecor(map: MapDef) {
  const R = rng(4040);
  const out: { kind: 'shroom' | 'bulb'; x: number; y: number; z: number; s: number; c: number }[] = [];
  const lanes = map.islands.map((i) => i.rect);
  for (const isl of map.islands) {
    const { cx, cz, hx, hz } = isl.rect;
    const tries = Math.round(hx * hz * 0.5);
    for (let i = 0; i < tries; i++) {
      const x = cx + (R() * 2 - 1) * (hx - 0.6);
      const z = cz + (R() * 2 - 1) * (hz - 0.6);
      const edge = Math.min(hx - Math.abs(x - cx), hz - Math.abs(z - cz));
      if (edge > 1.6) continue; // only along the rims: lanes stay clear
      out.push({ kind: R() < 0.55 ? 'bulb' : 'shroom', x, y: isl.top, z, s: 0.6 + R() * 0.8, c: Math.floor(R() * CAPS.length) });
    }
  }
  void lanes;
  return out;
}

function GlowBulbs({ items }: { items: { x: number; y: number; z: number; s: number; c: number }[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const stems = useRef<THREE.InstancedMesh>(null);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#c9fff6', emissive: '#3fe0d0', emissiveIntensity: 1.6, roughness: 0.4 }), []);
  const stemMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#4f9f5f', roughness: 0.8 }), []);
  const done = useRef(false);
  useFrame(({ clock }) => {
    mat.emissiveIntensity = 1.3 + Math.sin(clock.elapsedTime * 1.7) * 0.35;
    if (done.current || !ref.current || !stems.current) return;
    done.current = true;
    const m4 = new THREE.Matrix4();
    items.forEach((it, i) => {
      const h = 0.5 + it.s * 0.5;
      m4.makeScale(it.s * 0.22, it.s * 0.26, it.s * 0.22).setPosition(it.x, it.y + h, it.z);
      ref.current!.setMatrixAt(i, m4);
      m4.makeScale(1, h, 1).setPosition(it.x, it.y + h / 2, it.z);
      stems.current!.setMatrixAt(i, m4);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    stems.current.instanceMatrix.needsUpdate = true;
  });
  if (!items.length) return null;
  return (
    <group>
      <instancedMesh ref={ref} args={[undefined, undefined, items.length]} material={mat} frustumCulled={false}>
        <icosahedronGeometry args={[1, 1]} />
      </instancedMesh>
      <instancedMesh ref={stems} args={[undefined, undefined, items.length]} material={stemMat} frustumCulled={false}>
        <cylinderGeometry args={[0.03, 0.04, 1, 5]} />
      </instancedMesh>
    </group>
  );
}

/** Floating spores drifting up through the forest. */
function Spores({ center }: { center: V3 }) {
  const N = 90;
  const ref = useRef<THREE.InstancedMesh>(null);
  const st = useMemo(() => {
    const R = rng(77);
    return Array.from({ length: N }, () => ({ x: center[0] + (R() - 0.5) * 50, y: R() * 14, z: center[2] + (R() - 0.5) * 110, s: 0.04 + R() * 0.06, sp: 0.2 + R() * 0.4, ph: R() * 6 }));
  }, [center]);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#fff4c0', transparent: true, opacity: 0.85, toneMapped: false }), []);
  const m4 = useMemo(() => new THREE.Matrix4(), []);
  useFrame(({ clock }, dtRaw) => {
    const dt = Math.min(0.05, dtRaw);
    const mesh = ref.current;
    if (!mesh) return;
    const t = clock.elapsedTime;
    st.forEach((p, i) => {
      p.y += dt * p.sp;
      if (p.y > 16) p.y = 0;
      const s = p.s * (0.7 + 0.3 * Math.sin(t * 2 + p.ph));
      m4.makeScale(s, s, s).setPosition(p.x + Math.sin(t * 0.4 + p.ph) * 0.8, p.y, p.z + Math.cos(t * 0.3 + p.ph) * 0.8);
      mesh.setMatrixAt(i, m4);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, N]} material={mat} frustumCulled={false}>
      <icosahedronGeometry args={[1, 0]} />
    </instancedMesh>
  );
}

/** Little mushroom cottages for the village (stem walls, cap roof, round door and windows). */
function village(k: Kit, spots: { p: V3; r: number; cap: string; rot: number }[]) {
  for (const s of spots) {
    const [x, y, z] = s.p;
    k.cyl('plaster', STEM, s.r * 0.75, s.r * 0.85, s.r * 1.5, [x, y + s.r * 0.75, z], [0, 0, 0], 16, 0.02);
    k.sphere('cloth', s.cap, s.r * 1.25, [x, y + s.r * 1.55, z], [1, 0.62, 1], 2, 0.03);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + s.rot;
      k.sphere('plaster', '#ffffff', s.r * 0.16, [x + Math.cos(a) * s.r * 0.85, y + s.r * 1.85, z + Math.sin(a) * s.r * 0.85], [1, 0.5, 1], 1, 0);
    }
    const fx = Math.sin(s.rot), fz = Math.cos(s.rot);
    k.box('wood', WOOD.dark, [s.r * 0.5, s.r * 0.75, 0.1], [x + fx * s.r * 0.76, y + s.r * 0.38, z + fz * s.r * 0.76], [0, s.rot, 0], 0.04);
    k.sphere('gold', '#ffcf5a', 0.05, [x + fx * (s.r * 0.8) + fz * 0.12, y + s.r * 0.38, z + fz * (s.r * 0.8) - fx * 0.12], [1, 1, 1], 0, 0);
    for (const side of [-1, 1]) {
      const a = s.rot + side * 0.9;
      k.sphere('glow', '#ffe9a0', s.r * 0.13, [x + Math.sin(a) * s.r * 0.76, y + s.r * 0.95, z + Math.cos(a) * s.r * 0.76], [1, 1, 0.4], 1, 0);
    }
  }
  return k;
}

export function ShroomBox({ b }: { b: BoxDef }) {
  const make = useMemo(
    () => () => {
      const k = new Kit(Math.round(b.p[2] * 13 + b.p[0]));
      const [w, h, l] = b.s;
      const top = b.p[1] + h / 2;
      if (b.vis === 'shroomRim') {
        // a row of squat little caps (the soft rim)
        const n = Math.max(2, Math.round(Math.max(w, l) / 0.9));
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n - 0.5;
          const x = b.p[0] + (w >= l ? t * w : 0);
          const z = b.p[2] + (w >= l ? 0 : t * l);
          toadstool(k, [x, b.p[1] - h / 2, z], h * 0.55, 0.5, CAPS[i % 3]);
        }
      } else if (b.vis === 'shroomCap') {
        // a big flat-topped cap on a tall stem down to the terrace
        const r = Math.max(w, l) / 2 + 0.25;
        k.cyl('plaster', STEM, r * 0.3, r * 0.4, top - 5, [b.p[0], 5 + (top - 5) / 2, b.p[2]], [0, 0, 0], 12, 0.03);
        k.cyl('cloth', CAPS[2], r, r * 0.9, h + 0.1, [b.p[0], b.p[1], b.p[2]], [0, 0, 0], 20, 0.03);
        k.sphere('cloth', CAPS[2], r, [b.p[0], top - 0.12, b.p[2]], [1, 0.12, 1], 2, 0);
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          k.sphere('plaster', '#ffffff', 0.16, [b.p[0] + Math.cos(a) * r * 0.62, top + 0.01, b.p[2] + Math.sin(a) * r * 0.62], [1, 0.3, 1], 1, 0);
        }
      } else if (b.vis === 'shroomStem') {
        // a giant toadstool: the stem is the obstacle, the cap towers overhead (decor)
        const base = b.p[1] - h / 2;
        k.cyl('plaster', STEM, w / 2, w / 2 + 0.15, h + 3.4, [b.p[0], base + (h + 3.4) / 2, b.p[2]], [0, 0, 0], 16, 0.03);
        toadstool(k, [b.p[0], base + h + 3.2, b.p[2]], 0.01, 3.2 + w * 0.6, CAPS[Math.round(b.p[0]) & 3]);
      }
      return k;
    },
    [b],
  );
  return <KitMeshes make={make} />;
}

export function MushroomWorld({ map }: { map: MapDef }) {
  const X = 70;
  const deco = useMemo(() => islandDecor(map), [map]);
  const shrooms = useMemo(() => deco.filter((d) => d.kind === 'shroom'), [deco]);
  const bulbs = useMemo(() => deco.filter((d) => d.kind === 'bulb'), [deco]);
  const big = useMemo(
    () => () => {
      const k = new Kit(4700);
      // towering toadstools around the course (backdrop)
      const spots: [number, number, number, number, number][] = [
        [-14, -1, -6, 9, 4.2], [15, -1, -12, 11, 5.0], [-15, 3, -34, 12, 5.5], [17, 3, -48, 10, 4.4], [-16, 0, -66, 13, 6.0], [16, 0, -86, 12, 5.2], [-12, 0, -94, 9, 4.0],
      ];
      spots.forEach(([x, y, z, h, r], i) => toadstool(k, [X + x, y - 6, z], h + 6, r, CAPS[i % CAPS.length], i % 2 ? 0.06 : -0.05));
      // little caps scattered along island rims
      for (const s of shrooms) toadstool(k, [s.x, s.y, s.z], 0.35 + s.s * 0.5, 0.22 + s.s * 0.25, CAPS[s.c]);
      // the village on M5
      village(k, [
        { p: [X - 7.2, 2, -84.5], r: 1.5, cap: CAPS[0], rot: 0.4 },
        { p: [X + 7.4, 2, -85], r: 1.7, cap: CAPS[2], rot: -0.5 },
        { p: [X + 7.8, 2, -73.2], r: 1.2, cap: CAPS[3], rot: -1.2 },
        { p: [X - 7.6, 2, -72.8], r: 1.1, cap: CAPS[4], rot: 1.1 },
      ]);
      // stepping-stone mushrooms on the hollow (M4)
      toadstool(k, [X - 8.4, 4, -61.2], 0.9, 0.6, CAPS[1]);
      toadstool(k, [X - 3.6, 4, -61.6], 0.7, 0.45, CAPS[4]);
      return k;
    },
    [shrooms],
  );
  const trees = useMemo<Placement[]>(() => {
    const R = rng(4101);
    const out: Placement[] = [];
    for (const isl of map.islands) {
      const { cx, cz, hx, hz } = isl.rect;
      for (let i = 0; i < 3; i++) {
        const side = R() < 0.5 ? -1 : 1;
        out.push({ x: cx + side * (hx - 0.9), y: isl.top, z: cz + (R() * 2 - 1) * (hz - 2), s: 2.4 + R() * 0.8, r: R() * 6 });
      }
    }
    return out;
  }, [map]);
  return (
    <group>
      <KitMeshes make={big} />
      <GlowBulbs items={bulbs} />
      <Spores center={[X, 0, -40]} />
      <SafeBoundary name="shroom-trees" fallback={null}>
        <Suspense fallback={null}>
          <InstancedModel id="nature/tree_round_b" items={trees} />
        </Suspense>
      </SafeBoundary>
      <pointLight position={[X, 9, -44]} color="#7ff0e6" intensity={18} distance={22} decay={2} />
      <pointLight position={[X, 6, -80]} color="#ffd36b" intensity={14} distance={18} decay={2} />
    </group>
  );
}
