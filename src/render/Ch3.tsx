// Chapter 3 (The Crooked Tower): the fortified cliff face with the high push-lever and its TALL outline,
// the crane-hung lift, and the leaning tower landmark. Visual only; colliders come from LEVEL / the sim.
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { LEVEL, smooth } from '../shared/level';
import { frame } from './frame';
import { Kit, randKit } from './kit';
import { IRON, KitMeshes, STONE, WOOD } from './Structures';

type V3 = [number, number, number];

const FACE_Z = -104; // front face of the tower island (collider plane)
const SAND = ['#e6cfa9', '#d9bc93', '#cdb08a', '#e9d6b6', '#c4a47f', '#dcc39d'];
const LIFT_X0 = LEVEL.lift.cx - LEVEL.lift.w / 2 - 0.25;
const LIFT_X1 = LEVEL.lift.cx + LEVEL.lift.w / 2 + 0.25;

// ---------------------------------------------------------------- fortified cliff face

/** Masonry facade on the tower cliff (stays behind the collider plane so the lift and TALL never clip it). */
export function TowerWall() {
  const make = useMemo(
    () => () => {
      const k = new Kit(1313);
      const x0 = -10, x1 = 10, y0 = 0, y1 = 7.35;
      const rows = 9;
      const rh = (y1 - y0) / rows;
      for (let r = 0; r < rows; r++) {
        const by = y0 + rh * (r + 0.5);
        let bx = x0 + (r % 2 ? 0.55 : 0);
        while (bx < x1 - 0.05) {
          const bw = Math.min(x1 - bx, 1.0 + randKit() * 0.8);
          const cx = bx + bw / 2;
          const inShaft = cx > LIFT_X0 - 0.3 && cx < LIFT_X1 + 0.3;
          const depth = inShaft ? 0.06 : 0.12 + randKit() * 0.05;
          const c = SAND[Math.floor(randKit() * SAND.length)];
          k.box('stone', c, [bw - 0.08, rh - 0.08, depth], [cx, by, FACE_Z - depth / 2 - 0.005], [0, 0, 0], 0.06, 0.1);
          bx += bw;
        }
      }
      // capping course under the grass lip + plinth at the ground
      k.box('stone', STONE.trim, [20.1, 0.3, 0.2], [0, y1 + 0.12, FACE_Z - 0.12], [0, 0, 0], 0.05);
      k.box('stone', STONE.dark, [20.1, 0.32, 0.18], [0, 0.16, FACE_Z - 0.1], [0, 0, 0], 0.05);
      // buttresses away from the lever and the lift shaft
      for (const bx of [-8.6, -1.2, 9.2]) {
        k.box('stone', STONE.block[1], [0.9, 7.2, 0.16], [bx, 3.6, FACE_Z - 0.075], [0, 0, 0], 0.05);
      }
      // lift guide rails
      for (const gx of [LIFT_X0 - 0.12, LIFT_X1 + 0.12]) {
        k.box('wood', WOOD.dark, [0.22, 8.0, 0.1], [gx, 4.0, FACE_Z - 0.06], [0, 0, 0], 0.03);
        for (let y = 0.8; y < 8; y += 1.6) k.box('metal', IRON, [0.3, 0.08, 0.08], [gx, y, FACE_Z - 0.05], [0, 0, 0], 0.01, 0);
      }
      // moss tufts spilling from the joints (left side, away from the action)
      // moss curtains hanging from the capping course (clusters, not confetti)
      for (const mx of [-9.2, -7.4, -2.6, 0.6, 9.0]) {
        const n = 3 + Math.floor(randKit() * 3);
        for (let i = 0; i < n; i++) {
          const x = mx + (randKit() - 0.5) * 1.1;
          const y = 7.3 - i * 0.32 - randKit() * 0.2;
          k.sphere('leaf', randKit() < 0.5 ? '#5aa647' : '#4b9444', 0.26 - i * 0.03, [x, y, FACE_Z - 0.01], [1.3, 0.9, 0.45], 0, 0.08);
        }
      }
      return k;
    },
    [],
  );
  return <KitMeshes make={make} />;
}

// ---------------------------------------------------------------- high push-lever

/** Wall-mounted push lever: knob hangs where TALL's top meets the wall; a golden TALL outline marks the spot. */
export function Lever() {
  const L = LEVEL.lever;
  const arm = useRef<THREE.Group>(null);
  const outline = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffe48a', emissive: '#ffb21e', emissiveIntensity: 1.2, roughness: 0.5 }), []);
  const knob = useMemo(() => new THREE.MeshStandardMaterial({ color: '#57e0d4', emissive: '#1fb7ab', emissiveIntensity: 0.8, roughness: 0.35 }), []);
  const pivot: V3 = [L.p[0], 5.6, FACE_Z + 0.12];
  const len = 0.95;
  const make = useMemo(
    () => () => {
      const k = new Kit(1414);
      // flat mount above TALL's reach (nothing protrudes where the pillar presses the wall)
      k.box('stone', STONE.block[0], [1.8, 1.7, 0.06], [L.p[0], 5.55, FACE_Z + 0.03], [0, 0, 0], 0.02);
      k.box('metal', IRON, [1.1, 1.0, 0.08], [L.p[0], 5.6, FACE_Z + 0.08], [0, 0, 0], 0.02, 0);
      k.cyl('gold', '#f3c24f', 0.36, 0.36, 0.08, [L.p[0] + 0.62, 6.25, FACE_Z + 0.1], [Math.PI / 2, 0, 0], 12, 0);
      k.cyl('metal', '#8a8296', 0.26, 0.26, 0.08, [L.p[0] - 0.55, 6.3, FACE_Z + 0.1], [Math.PI / 2, 0, 0], 10, 0);
      // chain up the wall to the cliff top (the lever releases the lift's brake)
      for (let y = 6.6; y < 8.0; y += 0.32) k.box('metal', '#6a6178', [0.07, 0.24, 0.05], [L.p[0] + 0.62, y, FACE_Z + 0.12], [0, 0, (Math.round(y * 3) % 2) * 0.5], 0.01, 0);
      // dashed TALL outline (1.1 x 4.4) under the lever
      return k;
    },
    [L, pivot],
  );
  const dashes = useMemo(() => {
    const out: { p: V3; s: V3 }[] = [];
    const w = 1.1, h = 4.4, z = FACE_Z + 0.03;
    for (let y = 0.2; y < h - 0.1; y += 0.5) for (const sx of [-1, 1]) out.push({ p: [L.p[0] + (sx * w) / 2, y + 0.15, z], s: [0.08, 0.3, 0.02] });
    for (let x = -w / 2 + 0.15; x < w / 2; x += 0.42) out.push({ p: [L.p[0] + x + 0.06, h, z], s: [0.26, 0.08, 0.02] });
    return out;
  }, [L]);
  useFrame(({ clock }) => {
    const v = frame.current.w.lever;
    const t = clock.elapsedTime;
    if (arm.current) arm.current.rotation.x = -0.47 - smooth(v) * 1.9;
    const tall = frame.current.artifact.shape === 2;
    outline.emissiveIntensity = v > 0 ? 0.25 : (tall ? 1.8 : 0.9) + Math.sin(t * 4) * 0.5;
    knob.emissiveIntensity = v > 0 ? 0.6 : 1.2 + Math.sin(t * 5) * 0.6;
  });
  return (
    <group>
      <KitMeshes make={make} />
      {dashes.map((d, i) => (
        <mesh key={i} position={d.p} material={outline}>
          <boxGeometry args={d.s} />
        </mesh>
      ))}
      <group ref={arm} position={pivot}>
        <mesh position={[0, -len / 2, 0]} castShadow>
          <boxGeometry args={[0.18, len, 0.18]} />
          <meshStandardMaterial color={WOOD.rail} roughness={0.75} />
        </mesh>
        <mesh position={[0, -len, 0]} material={knob} castShadow>
          <sphereGeometry args={[0.3, 18, 14]} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.16, 0.16, 0.5, 12]} />
          <meshStandardMaterial color="#ffcf5a" metalness={1} roughness={0.3} />
        </mesh>
      </group>
    </group>
  );
}

// ---------------------------------------------------------------- lift

/** Timber lift deck slung from a cantilevered crane on the cliff top; rope lengths follow the synced height. */
export function Lift() {
  const L = LEVEL.lift;
  const deck = useRef<THREE.Group>(null);
  const gate = useRef<THREE.Group>(null);
  const wheel = useRef<THREE.Mesh>(null);
  const ropes = [useRef<THREE.Mesh>(null), useRef<THREE.Mesh>(null), useRef<THREE.Mesh>(null), useRef<THREE.Mesh>(null)];
  const glow = useMemo(() => new THREE.MeshStandardMaterial({ color: '#bff7f0', emissive: '#2fd6c8', emissiveIntensity: 0.1, roughness: 0.4 }), []);
  const ropeMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#d8b57a', roughness: 0.9 }), []);
  const jibZ = FACE_Z + 0.55;
  const jibY = L.top + 4.6;
  const deckKit = useMemo(
    () => () => {
      const k = new Kit(1515);
      const n = 11;
      for (let i = 0; i < n; i++) k.box('wood', WOOD.plank[i % 4], [L.w - 0.1, 0.22, L.d / n - 0.04], [0, -0.09, -L.d / 2 + (i + 0.5) * (L.d / n)], [0, 0, 0], 0.03, 0.07);
      k.box('wood', WOOD.dark, [L.w + 0.1, 0.24, L.d + 0.1], [0, -0.32, 0], [0, 0, 0], 0.04);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('metal', IRON, [0.32, 0.3, 0.32], [sx * (L.w / 2 - 0.05), -0.2, sz * (L.d / 2 - 0.05)], [0, 0, 0], 0.03, 0);
      // side railings (inside the rail colliders)
      for (const sx of [-1, 1]) {
        const x = sx * (L.w / 2 + 0.15);
        for (const z of [-L.d / 2 + 0.15, -L.d / 6, L.d / 6, L.d / 2 - 0.15]) k.box('wood', WOOD.dark, [0.2, L.railH + 0.3, 0.2], [x, (L.railH - 0.3) / 2, z], [0, 0, 0], 0.04);
        k.box('wood', WOOD.rail, [0.16, 0.14, L.d], [x, L.railH - 0.05, 0], [0, 0, 0], 0.04);
        k.box('wood', WOOD.beam, [0.12, 0.12, L.d], [x, L.railH * 0.5, 0], [0, 0, 0], 0.03);
      }
      // rope rings at the four hanging points
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('metal', IRON, 0.1, 0.1, 0.3, [sx * (L.w / 2 + 0.15), L.railH + 0.15, sz * (L.d / 2 - 0.15)], [0, 0, 0], 8, 0);
      return k;
    },
    [L],
  );
  const gateKit = useMemo(
    () => () => {
      const k = new Kit(1516);
      for (const y of [-0.35, 0.05, 0.42]) k.box('wood', WOOD.plank[1], [L.w + 0.5, 0.24, 0.24], [0, y, 0], [0, 0, 0], 0.04, 0.05);
      for (const x of [-L.w / 2, 0, L.w / 2]) k.box('wood', WOOD.dark, [0.18, L.railH, 0.28], [x, 0, 0], [0, 0, 0], 0.03);
      return k;
    },
    [L],
  );
  const crane = useMemo(
    () => () => {
      const k = new Kit(1517);
      const cx = L.cx, top = L.top;
      for (const sx of [-1, 1]) {
        const x = cx + sx * (L.w / 2 + 0.5);
        k.box('stone', STONE.block[2], [0.9, 0.5, 0.9], [x, top + 0.25, FACE_Z - 1.6], [0, 0, 0], 0.06);
        k.box('wood', WOOD.dark, [0.4, 4.8, 0.4], [x, top + 2.6, FACE_Z - 1.6], [0, 0, 0], 0.05);
        // cantilevered jib arm over the cliff edge + brace
        k.beam('wood', WOOD.beam, [x, jibY, FACE_Z - 2.2], [x, jibY, jibZ + 0.5], 0.3, 0.32, 0.05);
        k.beam('wood', WOOD.beam, [x, top + 3.0, FACE_Z - 1.6], [x, jibY - 0.1, jibZ - 0.2], 0.18, 0.18, 0.03);
      }
      k.beam('wood', WOOD.dark, [cx - L.w / 2 - 0.6, jibY + 0.05, jibZ + 0.3], [cx + L.w / 2 + 0.6, jibY + 0.05, jibZ + 0.3], 0.28, 0.28, 0.05);
      k.beam('wood', WOOD.dark, [cx - L.w / 2 - 0.6, jibY + 0.05, FACE_Z - 2.0], [cx + L.w / 2 + 0.6, jibY + 0.05, FACE_Z - 2.0], 0.28, 0.28, 0.05);
      // counterweight crate + winch
      k.box('wood', WOOD.plank[2], [1.4, 1.0, 1.0], [cx, top + 0.5, FACE_Z - 3.2], [0, 0.15, 0], 0.06);
      k.cyl('wood', WOOD.plank[0], 0.4, 0.4, L.w + 0.6, [cx, top + 1.3, FACE_Z - 1.6], [0, 0, Math.PI / 2], 12);
      return k;
    },
    [L, jibY, jibZ],
  );
  // hanging points: deck corners (local) -> jib (world)
  const hangs = useMemo(
    () =>
      [-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => ({
          dx: sx * (L.w / 2 + 0.15),
          dz: sz * (L.d / 2 - 0.15),
          top: new THREE.Vector3(L.cx + sx * (L.w / 2 + 0.15), jibY - 0.1, jibZ + 0.3),
        })),
      ),
    [L, jibY, jibZ],
  );
  const tmp = useMemo(() => ({ a: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), d: new THREE.Vector3() }), []);
  useFrame(({ clock }, dt) => {
    const w = frame.current.w;
    const y = w.liftY + 0.02;
    if (deck.current) deck.current.position.y = y;
    if (gate.current) {
      const lowered = -L.railH / 2 - 0.06;
      const raised = L.railH / 2;
      gate.current.position.y = y + lowered + (raised - lowered) * smooth(w.liftGate);
    }
    glow.emissiveIntensity = w.lift === 1 ? 1.4 + Math.sin(clock.elapsedTime * 5) * 0.8 : w.lift >= 2 ? 1.0 : 0.08;
    if (wheel.current && w.lift === 2) wheel.current.rotation.x -= dt * 2.5;
    hangs.forEach((h, i) => {
      const r = ropes[i].current;
      if (!r) return;
      tmp.a.set(L.cx + h.dx, y + L.railH + 0.3, L.cz + h.dz);
      tmp.d.copy(h.top).sub(tmp.a);
      const len = tmp.d.length();
      r.position.copy(tmp.a).addScaledVector(tmp.d, 0.5);
      r.scale.set(1, len, 1);
      r.quaternion.setFromUnitVectors(tmp.up, tmp.d.normalize());
    });
  });
  return (
    <group>
      <group ref={deck} position={[L.cx, L.bottom, L.cz]}>
        <KitMeshes make={deckKit} />
        <mesh position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]} material={glow}>
          <ringGeometry args={[2.25, 2.5, 4, 1, Math.PI / 4]} />
        </mesh>
      </group>
      <group ref={gate} position={[L.cx, L.bottom, L.cz + L.d / 2 + 0.15]}>
        <KitMeshes make={gateKit} />
      </group>
      <KitMeshes make={crane} />
      <mesh ref={wheel} position={[L.cx, jibY + 0.45, jibZ + 0.3]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.55, 0.55, 0.22, 16]} />
        <meshStandardMaterial color="#ffcf5a" metalness={1} roughness={0.3} />
      </mesh>
      {ropes.map((r, i) => (
        <mesh key={i} ref={r} material={ropeMat}>
          <cylinderGeometry args={[0.045, 0.045, 1, 6]} />
        </mesh>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------- the crooked tower landmark

export function CrookedTower({ p, s = 1 }: { p: V3; s?: number }) {
  const flag = useRef<THREE.Mesh>(null);
  const make = useMemo(
    () => () => {
      const k = new Kit(1616);
      const floors = [
        { w: 3.6, h: 3.0, lean: 0.0, dx: 0, c: '#efe3cf' },
        { w: 3.3, h: 2.7, lean: 0.07, dx: 0.25, c: '#d7a36c' },
        { w: 3.0, h: 2.6, lean: -0.05, dx: 0.12, c: '#efe3cf' },
        { w: 2.7, h: 2.4, lean: 0.1, dx: 0.45, c: '#c98f5a' },
      ];
      let y = 0;
      floors.forEach((f, i) => {
        const cy = y + f.h / 2;
        const rot: V3 = [0, i * 0.18, f.lean];
        k.box('plaster', f.c, [f.w, f.h, f.w], [f.dx, cy, 0], rot, 0.12, 0.03);
        // timber frame corners + floor band
        k.box('wood', WOOD.dark, [f.w + 0.25, 0.22, f.w + 0.25], [f.dx, y + 0.11, 0], rot, 0.04);
        // windows on two faces
        k.box('dark', '#3d3360', [0.55, 0.8, 0.06], [f.dx + Math.sin(f.lean) * 0.2, cy + 0.15, f.w / 2 + 0.02], rot, 0.03, 0);
        k.box('wood', WOOD.rail, [0.75, 0.12, 0.12], [f.dx, cy - 0.32, f.w / 2 + 0.06], rot, 0.02);
        y += f.h - 0.06;
      });
      // balcony + roof
      k.box('wood', WOOD.beam, [3.4, 0.16, 3.4], [0.6, y, 0], [0, 0.5, 0.1], 0.04);
      k.cone('roof', '#5ab9b3', 2.3, 3.4, [0.75, y + 1.75, 0], [0, 0.6, 0.12], 6);
      k.sphere('gold', '#ffcf5a', 0.28, [1.0, y + 3.55, 0], [1, 1, 1], 1, 0);
      k.cyl('wood', WOOD.dark, 0.05, 0.05, 1.6, [1.0, y + 4.3, 0], [0, 0, 0], 6);
      // little door + steps
      k.box('wood', WOOD.dark, [0.8, 1.4, 0.08], [0, 0.7, 1.82], [0, 0, 0], 0.03);
      k.box('stone', STONE.block[1], [1.2, 0.2, 0.6], [0, 0.1, 2.1], [0, 0, 0], 0.04);
      return k;
    },
    [],
  );
  useFrame(({ clock }) => {
    if (flag.current) flag.current.rotation.y = Math.sin(clock.elapsedTime * 2.2) * 0.25;
  });
  return (
    <group position={p} scale={s}>
      <KitMeshes make={make} />
      <mesh ref={flag} position={[1.55, 13.45, 0]}>
        <boxGeometry args={[1.0, 0.55, 0.03]} />
        <meshStandardMaterial color="#e45b6f" side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
