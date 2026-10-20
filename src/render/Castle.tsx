// The King's castle: Kenney castle-kit towers and walls assembled at diorama scale behind the plaza, with a
// procedural gate (exact doorway size for the ending cutscene). Everything sits behind the wall collider plane.
import { Suspense, useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Model } from './Models';
import { SafeBoundary } from './SafeBoundary';
import { Kit } from './kit';
import { IRON, KitMeshes, WOOD } from './Structures';
import { textTexture } from './Props';

type V3 = [number, number, number];

/** Wall face of the castle (the collider is 26 x 6 x 1.2 centred at z = -170.6). */
const FRONT = -170.0;
const SAND = ['#efd2a8', '#e5c296', '#f2dcba', '#dcb58a'];
const ROOF = '#6a76dd';

export const castleDoor = { open: 0 };

function K({ id, p, s, r = 0 }: { id: string; p: V3; s: number | V3; r?: number }) {
  return (
    <SafeBoundary name={id} fallback={null}>
      <Suspense fallback={null}>
        <Model id={id} p={p} s={s} r={r} />
      </Suspense>
    </SafeBoundary>
  );
}

/** Stack of square-tower storeys (Kenney storey = 1.01 units) ending in a roof piece. */
function SquareTower({ x, z, w, storeys, roof, r = 0, y = 0 }: { x: number; z: number; w: number; storeys: string[]; roof: string; r?: number; y?: number }) {
  const parts: ReactNode[] = [];
  let yy = y;
  storeys.forEach((id, i) => {
    parts.push(<K key={i} id={`castle/${id}`} p={[x, yy, z]} s={w} r={r} />);
    yy += 1.01 * w;
  });
  parts.push(<K key="roof" id={`castle/${roof}`} p={[x, yy, z]} s={w} r={r} />);
  return <>{parts}</>;
}

function RoundTower({ x, z, d, levels, roofH, flag }: { x: number; z: number; d: number; levels: number; roofH: number; flag?: string }) {
  const top = levels * 1.31 * d;
  const make = useMemo(
    () => () => {
      const k = new Kit(Math.round(x * 7 + z));
      k.cone('roof', ROOF, d * 0.62, roofH, [x, top + 0.13 * d + roofH / 2, z], [0, 0, 0], 14, 0.02);
      k.sphere('gold', '#ffcf5a', 0.3, [x, top + 0.13 * d + roofH + 0.15, z], [1, 1, 1], 1, 0);
      return k;
    },
    [x, z, d, top, roofH],
  );
  return (
    <>
      {Array.from({ length: levels }, (_, i) => (
        <K key={i} id="castle/tower_round" p={[x, i * 1.31 * d, z]} s={d} />
      ))}
      <K id="castle/tower_round_top" p={[x, top, z]} s={d} />
      <KitMeshes make={make} />
      {flag && <Pennant p={[x, top + 0.13 * d + roofH + 0.3, z]} color={flag} />}
    </>
  );
}

function Pennant({ p, color }: { p: V3; color: string }) {
  const cloth = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (cloth.current) cloth.current.rotation.y = Math.sin(clock.elapsedTime * 2.4 + p[0]) * 0.3;
  });
  return (
    <group position={p}>
      <mesh position={[0, 1.1, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 2.2, 6]} />
        <meshStandardMaterial color="#6a462c" />
      </mesh>
      <mesh ref={cloth} position={[0.75, 1.75, 0]}>
        <boxGeometry args={[1.5, 0.7, 0.04]} />
        <meshStandardMaterial color={color} roughness={0.85} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/** The gate: arched stone frame, studded doors that swing open in the ending, banner + lanterns. */
function Gate() {
  const doorL = useRef<THREE.Group>(null);
  const doorR = useRef<THREE.Group>(null);
  useFrame(() => {
    const a = castleDoor.open * 1.6;
    if (doorL.current) doorL.current.rotation.y = a;
    if (doorR.current) doorR.current.rotation.y = -a;
  });
  const frame = useMemo(
    () => () => {
      const k = new Kit(4141);
      // jambs + arch voussoirs around a 5.2 x 5.4 opening
      for (const s of [-1, 1]) {
        for (let i = 0; i < 6; i++) k.box('stone', SAND[i % 4], [0.7, 0.86, 0.9], [s * 2.95, 0.43 + i * 0.9, FRONT - 0.42], [0, 0, 0], 0.07, 0.05);
      }
      // semicircular arch (centre 4.0 m, r 2.95) meets the door's top corners; voussoirs only above them
      const n = 9;
      const a0 = 0.5, a1 = Math.PI - 0.5;
      for (let i = 0; i < n; i++) {
        const a = a0 + (a1 - a0) * (i / (n - 1));
        const r = 3.3;
        k.box('stone', i === (n - 1) / 2 ? '#f6e2c2' : SAND[(i + 1) % 4], [0.66, i === (n - 1) / 2 ? 0.95 : 0.78, 0.94], [Math.cos(a) * r, 4.0 + Math.sin(a) * r, FRONT - 0.42], [0, 0, a - Math.PI / 2], 0.07, 0.04);
      }
      // tympanum fill behind the arch + crenellated parapet above the gate
      k.box('stone', SAND[2], [5.4, 1.75, 0.6], [0, 6.2, FRONT - 0.55], [0, 0, 0], 0.05, 0.03);
      k.box('stone', SAND[1], [7.6, 1.4, 1.4], [0, 7.4, FRONT - 0.72], [0, 0, 0], 0.08, 0.03);
      for (let i = 0; i < 5; i++) k.box('stone', SAND[i % 4], [0.9, 0.8, 1.2], [-3.2 + i * 1.6, 8.5, FRONT - 0.7], [0, 0, 0], 0.08, 0.05);
      // lanterns on brackets
      for (const s of [-1, 1]) {
        k.box('metal', IRON, [0.1, 0.1, 0.6], [s * 3.55, 4.1, FRONT + 0.05], [0, 0, 0], 0.02, 0);
        k.box('metal', IRON, [0.42, 0.08, 0.42], [s * 3.55, 4.3, FRONT + 0.3], [0, 0, 0], 0.02, 0);
      }
      return k;
    },
    [],
  );
  const leaf = useMemo(
    () => (side: 1 | -1) => () => {
      const k = new Kit(side > 0 ? 4242 : 4343);
      const w = 2.6;
      for (let i = 0; i < 4; i++) k.box('wood', WOOD.plank[i % 4], [w / 4 - 0.04, 5.4, 0.22], [side * (w / 8 + (i * w) / 4), 2.7, 0], [0, 0, 0], 0.03, 0.06);
      for (const y of [1.1, 2.7, 4.3]) k.box('metal', IRON, [w - 0.1, 0.16, 0.06], [(side * w) / 2, y, 0.13], [0, 0, 0], 0.02, 0);
      k.box('gold', '#ffcf5a', [0.08, 0.5, 0.08], [side * (w - 0.45), 2.7, 0.18], [0, 0, 0], 0.03, 0);
      return k;
    },
    [],
  );
  const lantern = useMemo(() => new THREE.MeshStandardMaterial({ color: '#fff1b8', emissive: '#ffb24a', emissiveIntensity: 2.4 }), []);
  const banner = useMemo(() => textTexture(['ROYAL DELIVERIES'], 1024, 200, '#fff6e6', 108), []);
  return (
    <group>
      <KitMeshes make={frame} />
      {/* dark hall behind the doorway so the open gate reads as an opening */}
      <mesh position={[0, 2.7, FRONT - 1.35]}>
        <boxGeometry args={[5.2, 5.4, 0.1]} />
        <meshBasicMaterial color="#2a2140" />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 2.62, 2.7, FRONT - 0.7]}>
          <boxGeometry args={[0.06, 5.4, 1.3]} />
          <meshStandardMaterial color="#3a2f55" />
        </mesh>
      ))}
      <group ref={doorL} position={[-2.6, 0, FRONT + 0.15]}>
        <KitMeshes make={leaf(1)} />
      </group>
      <group ref={doorR} position={[2.6, 0, FRONT + 0.15]}>
        <KitMeshes make={leaf(-1)} />
      </group>
      {[-1, 1].map((s) => (
        <mesh key={'l' + s} position={[s * 3.55, 4.55, FRONT + 0.3]} material={lantern}>
          <boxGeometry args={[0.3, 0.42, 0.3]} />
        </mesh>
      ))}
      <group position={[0, 9.75, FRONT - 0.05]}>
        <mesh>
          <boxGeometry args={[6.4, 1.15, 0.12]} />
          <meshStandardMaterial color="#e7708c" roughness={0.85} />
        </mesh>
        <mesh position={[0, 0, 0.07]}>
          <planeGeometry args={[6.1, 1.0]} />
          <meshBasicMaterial map={banner} transparent toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

/** Hanging heraldic banners on the wall face. */
function WallBanners() {
  const make = useMemo(
    () => () => {
      const k = new Kit(5151);
      for (const [x, c] of [[-9.6, '#e7708c'], [-6.6, '#9b8de4'], [6.6, '#9b8de4'], [9.6, '#e7708c']] as [number, string][]) {
        k.box('wood', WOOD.dark, [1.7, 0.12, 0.12], [x, 5.5, FRONT + 0.08], [0, 0, 0], 0.03);
        k.box('cloth', c, [1.4, 3.2, 0.05], [x, 3.85, FRONT + 0.06], [0, 0, 0], 0.02, 0);
        k.cone('cloth', c, 0.7, 0.6, [x, 2.0, FRONT + 0.06], [Math.PI, Math.PI / 4, 0], 4, 0);
        k.sphere('gold', '#ffcf5a', 0.22, [x, 4.4, FRONT + 0.1], [1, 1, 0.4], 1, 0);
      }
      return k;
    },
    [],
  );
  return <KitMeshes make={make} />;
}

export function Castle() {
  return (
    <group>
      {/* front curtain wall in four kit cells (6 m tall, matched to the collider) */}
      {[-11.3, -7.9, 7.9, 11.3].map((x) => (
        <K key={x} id="castle/wall" p={[x, 0, FRONT - 1.6]} s={[3.4, 4.58, 3.2]} />
      ))}
      {/* gate towers flanking the doorway */}
      {[-1, 1].map((s) => (
        <SquareTower key={s} x={s * 4.6} z={FRONT - 1.75} w={3.5} storeys={['tower_square_base', 'tower_square_mid_windows', 'tower_square_mid_windows']} roof="tower_square_roof_windows" />
      ))}
      <Gate />
      <WallBanners />
      {/* corner towers */}
      <RoundTower x={-14.6} z={FRONT - 2.2} d={4.2} levels={2} roofH={5} flag="#e7708c" />
      <RoundTower x={14.6} z={FRONT - 2.2} d={4.2} levels={2} roofH={5} flag="#9b8de4" />
      {/* side walls running back to the keep */}
      {[-1, 1].map((s) =>
        [-176.4, -181.6, -186.8].map((z) => <K key={`${s}${z}`} id="castle/wall" p={[s * 15.0, 0, z]} s={[5.2, 4.2, 3.0]} r={Math.PI / 2} />),
      )}
      {/* the keep + inner towers */}
      <SquareTower x={0} z={-188} w={9} storeys={['tower_square_base', 'tower_square_mid_windows', 'tower_square_mid_door']} roof="tower_square_roof_windows" />
      <SquareTower x={-9.5} z={-183} w={5.6} storeys={['tower_square_base', 'tower_square_mid_windows', 'tower_square_mid_windows', 'tower_square_mid_windows']} roof="tower_square_roof_rounded" />
      <SquareTower x={9.5} z={-183} w={5.6} storeys={['tower_square_base', 'tower_square_mid_windows', 'tower_square_mid_windows']} roof="tower_square_roof_windows" />
      <RoundTower x={-17.5} z={-192} d={4.6} levels={3} roofH={6.5} flag="#ffd153" />
      <RoundTower x={17.5} z={-192} d={4.6} levels={3} roofH={6.5} flag="#64b9f4" />
      <K id="castle/tower_hex_full" p={[-24, 0, -180]} s={4.6} r={0.3} />
      <K id="castle/tower_hex_full" p={[24, 0, -182]} s={5} r={-0.4} />
      <Pennant p={[0, 1.01 * 9 * 3 + 1.08 * 9 + 0.1, -188]} color="#ff697f" />
    </group>
  );
}
