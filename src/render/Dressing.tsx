// Story set-pieces built from bevelled kit parts: the royal airship that brought the artifact, the dock crane,
// sacks and mooring posts. Decoration only: none of this has colliders and it all sits outside the play lanes.
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Kit } from './kit';
import { KitMeshes, STONE, WOOD, IRON } from './Structures';

type V3 = [number, number, number];

/** The royal cargo airship moored beside the loading dock (gently bobbing, propeller idling). */
export function Airship({ p, rotY = 0, moor }: { p: V3; rotY?: number; moor?: V3 }) {
  const root = useRef<THREE.Group>(null);
  const prop = useRef<THREE.Group>(null);
  const make = useMemo(
    () => () => {
      const k = new Kit(321);
      // envelope + stripes
      k.sphere('cloth', '#fff3dc', 1, [0, 3.1, 0], [3.4, 1.55, 1.55], 2, 0);
      for (const x of [-1.9, 0, 1.9]) {
        const r = 1.55 * Math.sqrt(1 - (x / 3.4) ** 2) + 0.025;
        k.cyl('cloth', '#e45b6f', r, r, 0.42, [x, 3.1, 0], [0, 0, Math.PI / 2], 24, 0);
      }
      k.sphere('gold', '#ffcf5a', 0.32, [3.35, 3.1, 0], [1, 1, 1], 1, 0);
      // tail fins
      for (const [ry, rz] of [[0, 0], [Math.PI / 2, 0]] as [number, number][]) k.box('cloth', '#9b8de4', [1.2, 1.5, 0.08], [-3.2, 3.1, 0], [ry, 0, rz], 0.04, 0);
      // gondola hull
      k.box('wood', WOOD.plank[0], [2.6, 0.55, 1.1], [0, 0.55, 0], [0, 0, 0], 0.2, 0.03);
      k.box('wood', WOOD.dark, [2.75, 0.14, 1.22], [0, 0.85, 0], [0, 0, 0], 0.06, 0.02);
      k.cone('wood', WOOD.plank[2], 0.55, 0.9, [1.6, 0.6, 0], [0, 0, -Math.PI / 2], 4, 0.02);
      for (const x of [-1.1, 0, 1.1]) k.box('wood', WOOD.rail, [0.08, 0.5, 0.08], [x, 1.15, 0.52], [0, 0, 0], 0.02).box('wood', WOOD.rail, [0.08, 0.5, 0.08], [x, 1.15, -0.52], [0, 0, 0], 0.02);
      k.box('wood', WOOD.rail, [2.4, 0.07, 0.07], [0, 1.38, 0.52], [0, 0, 0], 0.02).box('wood', WOOD.rail, [2.4, 0.07, 0.07], [0, 1.38, -0.52], [0, 0, 0], 0.02);
      // rigging
      for (const [x, z] of [[-1.1, 0.5], [1.1, 0.5], [-1.1, -0.5], [1.1, -0.5]]) k.rope('#d8b57a', [x, 1.4, z], [x * 1.25, 2.0, z * 1.9], 0.02, 0.03);
      // cargo crates in the hold + a pennant
      k.box('wood', WOOD.plank[1], [0.55, 0.45, 0.55], [-0.6, 1.1, 0.1], [0, 0.3, 0], 0.04).box('wood', WOOD.plank[3], [0.45, 0.4, 0.45], [0.35, 1.08, -0.15], [0, -0.2, 0], 0.04);
      k.box('metal', IRON, [0.5, 0.1, 0.1], [-1.55, 0.6, 0], [0, 0, 0], 0.02);
      return k;
    },
    [],
  );
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    if (root.current) {
      root.current.position.y = p[1] + Math.sin(t * 0.8) * 0.18;
      root.current.rotation.z = Math.sin(t * 0.6) * 0.025;
    }
    if (prop.current) prop.current.rotation.x += dt * 6;
  });
  const moorRope = useMemo(() => {
    if (!moor) return null;
    const k = new Kit(5);
    // mooring line from the dock bollard up to the gondola bow (in world space)
    const c = Math.cos(rotY), s = Math.sin(rotY);
    const bow: V3 = [p[0] + 1.6 * c, p[1] + 0.8, p[2] - 1.6 * s];
    k.rope('#d8b57a', [moor[0], moor[1] + 0.55, moor[2]], bow, 0.6, 0.035);
    k.cyl('wood', WOOD.dark, 0.16, 0.2, 0.7, [moor[0], moor[1] + 0.35, moor[2]], [0, 0, 0], 8);
    k.cyl('metal', IRON, 0.19, 0.19, 0.08, [moor[0], moor[1] + 0.5, moor[2]], [0, 0, 0], 10);
    return () => k;
  }, [moor, p, rotY]);
  return (
    <group>
      <group ref={root} position={p} rotation={[0, rotY, 0]}>
        <KitMeshes make={make} cast={false} />
        <group ref={prop} position={[-1.65, 0.6, 0]}>
          {[0, 1].map((i) => (
            <mesh key={i} rotation={[(i * Math.PI) / 2, 0, 0]} position={[-0.05, 0, 0]}>
              <boxGeometry args={[0.05, 0.9, 0.14]} />
              <meshStandardMaterial color="#d9a46b" roughness={0.7} />
            </mesh>
          ))}
        </group>
      </group>
      {moorRope && <KitMeshes make={moorRope} cast={false} />}
    </group>
  );
}

/** Timber jib crane on a stone footing, its hook still holding a cargo net. */
export function DockCrane({ p, rotY = 0 }: { p: V3; rotY?: number }) {
  const hook = useRef<THREE.Group>(null);
  const make = useMemo(
    () => () => {
      const k = new Kit(611);
      k.box('stone', STONE.block[1], [1.5, 0.5, 1.5], [0, 0.25, 0], [0, 0, 0], 0.08);
      k.box('wood', WOOD.dark, [0.42, 5.2, 0.42], [0, 2.9, 0], [0, 0, 0], 0.05);
      k.beam('wood', WOOD.beam, [0, 5.1, 0], [3.6, 5.3, 0], 0.3, 0.32, 0.05);
      k.beam('wood', WOOD.beam, [0, 3.4, 0], [2.4, 5.15, 0], 0.18, 0.18, 0.03);
      k.beam('wood', WOOD.dark, [0, 5.4, 0], [-1.0, 4.6, 0], 0.2, 0.2, 0.03);
      k.box('stone', STONE.block[3], [0.7, 0.7, 0.7], [-1.0, 4.25, 0], [0, 0, 0], 0.06);
      // winch drum + crank
      k.cyl('wood', WOOD.plank[0], 0.32, 0.32, 0.8, [0.45, 1.2, 0], [Math.PI / 2, 0, 0], 12);
      k.cyl('metal', IRON, 0.05, 0.05, 1.1, [0.45, 1.2, 0], [Math.PI / 2, 0, 0], 6);
      k.cyl('metal', '#a59cb3', 0.12, 0.12, 0.12, [3.55, 5.12, 0], [Math.PI / 2, 0, 0], 10);
      return k;
    },
    [],
  );
  const hookKit = useMemo(
    () => () => {
      const k = new Kit(612);
      k.cyl('rope', '#d8b57a', 0.035, 0.035, 2.6, [0, -1.3, 0], [0, 0, 0], 5);
      k.box('metal', IRON, [0.18, 0.3, 0.1], [0, -2.7, 0], [0, 0, 0], 0.03);
      // cargo net bundle
      k.sphere('rope', '#cfa86c', 0.55, [0, -3.25, 0], [1, 0.8, 1], 1, 0.04);
      k.box('wood', WOOD.plank[2], [0.5, 0.42, 0.5], [0.12, -3.3, 0.05], [0.2, 0.5, 0], 0.04);
      return k;
    },
    [],
  );
  useFrame(({ clock }) => {
    if (hook.current) {
      hook.current.rotation.z = Math.sin(clock.elapsedTime * 1.1) * 0.05;
      hook.current.rotation.x = Math.sin(clock.elapsedTime * 0.8 + 1) * 0.04;
    }
  });
  return (
    <group position={p} rotation={[0, rotY, 0]}>
      <KitMeshes make={make} />
      <group ref={hook} position={[3.55, 5.1, 0]}>
        <KitMeshes make={hookKit} />
      </group>
    </group>
  );
}

/** A little pile of grain sacks. */
export function Sacks({ p, rotY = 0, n = 3 }: { p: V3; rotY?: number; n?: number }) {
  const make = useMemo(
    () => () => {
      const k = new Kit(Math.round(p[0] * 31 + p[2] * 7 + 900));
      const spots: V3[] = [[0, 0.28, 0], [0.62, 0.26, 0.1], [0.3, 0.72, 0.05], [-0.55, 0.25, 0.25], [0.1, 0.25, 0.6]];
      spots.slice(0, n).forEach((s, i) => {
        k.sphere('cloth', i % 2 ? '#d9bf8f' : '#cfb27e', 0.36, s, [1.15, 0.78, 0.9], 1, 0.06);
        k.cyl('rope', '#a8865a', 0.09, 0.12, 0.14, [s[0], s[1] + 0.28, s[2]], [0, 0, 0], 6, 0.03);
      });
      return k;
    },
    [p, n],
  );
  return (
    <group position={p} rotation={[0, rotY, 0]}>
      <KitMeshes make={make} />
    </group>
  );
}
