// World 5 visuals: a timber sky railway between floating islands — rails on trestles over the void, a grand station,
// a junction signal box, the crane yard and the royal depot on the mesa. Decoration only (no colliders).
import { useMemo } from 'react';
import type { BoxDef, V3 } from '../../shared/level';
import type { CartDef, MapDef } from '../../shared/maps/types';
import { Kit } from '../kit';
import { IRON, KitMeshes, STONE, WOOD } from '../Structures';
import { textTexture } from '../Props';

const RAIL = '#6b6378';

/** Rails + sleepers along a polyline at rail level; trestle legs wherever the track runs over open sky. */
export function buildTrack(k: Kit, pts: V3[], overVoid: (x: number, z: number) => boolean) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const L = Math.hypot(dx, dy, dz);
    const yaw = Math.atan2(dx, dz);
    const n = Math.max(1, Math.round(L / 0.7));
    for (let s = 0; s <= n; s++) {
      const t = s / n;
      const x = a[0] + dx * t, y = a[1] + dy * t, z = a[2] + dz * t;
      k.box('wood', WOOD.plank[s % 4], [2.0, 0.12, 0.32], [x, y + 0.06, z], [0, yaw, 0], 0.02, 0.06);
      if (s % 3 === 0 && overVoid(x, z)) {
        // trestle: two leaning legs and a cross brace down into the clouds
        for (const side of [-1, 1]) {
          const ox = Math.cos(yaw) * side * 0.95, oz = -Math.sin(yaw) * side * 0.95;
          k.beam('wood', WOOD.dark, [x + ox, y, z + oz], [x + ox * 1.8, y - 7, z + oz * 1.8], 0.22, 0.22, 0.03);
        }
        k.beam('wood', WOOD.beam, [x - Math.cos(yaw) * 1.2, y - 2.2, z + Math.sin(yaw) * 1.2], [x + Math.cos(yaw) * 1.2, y - 2.2, z - Math.sin(yaw) * 1.2], 0.14, 0.14, 0.02);
      }
    }
    for (const side of [-1, 1]) {
      const ox = Math.cos(yaw) * side * 0.72, oz = -Math.sin(yaw) * side * 0.72;
      k.beam('metal', RAIL, [a[0] + ox, a[1] + 0.17, a[2] + oz], [b[0] + ox, b[1] + 0.17, b[2] + oz], 0.1, 0.1, 0.01);
    }
  }
  return k;
}

export function RailBox({ b }: { b: BoxDef }) {
  const sign = useMemo(() => (b.vis === 'signalBox' ? textTexture(['JUNCTION'], 512, 128, '#fff4dc', 70, '#3d5a7a') : null), [b.vis]);
  const make = useMemo(
    () => () => {
      const k = new Kit(Math.round(b.p[2] * 9 + 5000));
      const [w, h, l] = b.s;
      if (b.vis === 'signalBox') {
        k.box('wood', WOOD.plank[1], [w, h, l], [0, 0, 0], [0, 0, 0], 0.06, 0.05);
        k.box('wood', WOOD.dark, [w + 0.2, 0.16, l + 0.2], [0, h / 2, 0], [0, 0, 0], 0.04);
        for (const sx of [-1, 1]) k.box('dark', '#3d3360', [0.6, 0.6, 0.06], [sx * 0.45, 0.35, l / 2 + 0.02], [0, 0, 0], 0.03, 0);
        k.box('wood', WOOD.dark, [0.7, 1.2, 0.08], [0, -0.7, l / 2 + 0.03], [0, 0, 0], 0.03);
        // signal mast with lamps
        k.cyl('metal', IRON, 0.07, 0.08, 3.4, [w / 2 + 0.4, 0.4, 0], [0, 0, 0], 8, 0);
        k.box('metal', IRON, [0.4, 0.9, 0.3], [w / 2 + 0.4, 1.9, 0], [0, 0, 0], 0.04, 0);
        k.sphere('glow', '#9ff7a8', 0.12, [w / 2 + 0.4, 2.15, 0.17], [1, 1, 0.5], 1, 0);
        k.sphere('glow', '#ff8f8f', 0.12, [w / 2 + 0.4, 1.7, 0.17], [1, 1, 0.5], 1, 0);
      } else if (b.vis === 'cranePad') {
        k.box('stone', STONE.block[1], [w, h, l], [0, 0, 0], [0, 0, 0], 0.08, 0.05);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('metal', IRON, [0.3, 0.12, 0.3], [sx * (w / 2 - 0.2), h / 2 + 0.02, sz * (l / 2 - 0.2)], [0, 0, 0], 0.02, 0);
      }
      return k;
    },
    [b],
  );
  return (
    <group position={b.p}>
      <KitMeshes make={make} />
      {sign && (
        <mesh position={[0, b.s[1] / 2 - 0.35, b.s[2] / 2 + 0.07]}>
          <planeGeometry args={[1.6, 0.4]} />
          <meshStandardMaterial map={sign} roughness={0.85} />
        </mesh>
      )}
    </group>
  );
}

export function RailwayWorld({ map }: { map: MapDef }) {
  const X = -70;
  const cart = map.mechs.find((m) => m.kind === 'cart') as CartDef | undefined;
  const station = useMemo(() => textTexture(['GRAND STATION'], 512, 128, '#fff4dc', 64, '#7a4a3a'), []);
  const depot = useMemo(() => textTexture(['ROYAL DEPOT'], 512, 128, '#5a3a24', 70, '#ffd36b'), []);
  const make = useMemo(
    () => () => {
      const k = new Kit(5100);
      const onIsland = (x: number, z: number) => map.islands.some((i) => Math.abs(x - i.rect.cx) < i.rect.hx && Math.abs(z - i.rect.cz) < i.rect.hz);
      if (cart) {
        buildTrack(k, cart.track, (x, z) => !onIsland(x, z));
        for (const br of cart.branches ?? []) buildTrack(k, [cart.track[cart.track.length - 1], ...br], (x, z) => !onIsland(x, z));
        // the express buffer stop at the end of branch 1
        const end = cart.branches?.[1]?.[cart.branches[1].length - 1];
        if (end) {
          k.box('wood', '#e45b6f', [2.4, 0.9, 0.5], [end[0], end[1] + 0.7, end[2] - 3.0], [0, 0, 0], 0.08, 0.04);
          k.box('metal', IRON, [2.6, 0.2, 0.6], [end[0], end[1] + 0.2, end[2] - 3.0], [0, 0, 0], 0.03, 0);
          for (const sx of [-1, 1]) k.cyl('metal', '#c9c2d6', 0.18, 0.18, 0.6, [end[0] + sx * 0.8, end[1] + 0.85, end[2] - 2.65], [Math.PI / 2, 0, 0], 10, 0);
        }
      }
      // station canopy over the cart on R1
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('wood', WOOD.dark, 0.12, 0.14, 3.2, [X + 3.5 + sx * 2.3, 1.6, -3.0 + sz * 2.8], [0, 0, 0], 8);
      k.box('roof', '#5ab9b3', [5.4, 0.22, 6.8], [X + 3.5, 3.3, -3.0], [0, 0, 0.06], 0.06, 0.03);
      k.box('wood', WOOD.beam, [5.0, 0.2, 0.25], [X + 3.5, 3.1, -6.3], [0, 0, 0], 0.03);
      // crates + lamp posts around the station
      for (const [x, z, s] of [[-7.4, 4.6, 1.0], [-6.6, 5.6, 0.8], [7.4, 4.4, 1.1], [-7.2, -5.0, 0.9]] as const) k.box('wood', WOOD.plank[2], [s, s, s], [X + x, s / 2, z], [0, x * 0.3, 0], 0.04, 0.05);
      for (const [x, z] of [[1.6, 5.6], [6.0, 5.6], [1.2, -31.0], [6.6, -38.6], [-14.8, -50.2], [-3.2, -60.2]] as const) {
        const y = z < -55 ? 6 : 0;
        k.cyl('metal', IRON, 0.06, 0.08, 2.6, [X + x, y + 1.3, z], [0, 0, 0], 8, 0);
        k.sphere('glow', '#ffe9a0', 0.18, [X + x, y + 2.7, z], [1, 1.2, 1], 1, 0);
      }
      // depot on the mesa: a little warehouse behind the delivery ring
      k.box('plaster', '#efe3cf', [5.6, 3.0, 2.6], [X - 1.0, 7.5, -67.0], [0, 0, 0], 0.08, 0.03);
      k.cone('roof', '#e45b6f', 3.6, 1.6, [X - 1.0, 9.8, -67.0], [0, Math.PI / 4, 0], 4);
      k.box('wood', WOOD.dark, [1.2, 2.0, 0.1], [X - 1.0, 7.0, -65.68], [0, 0, 0], 0.03);
      return k;
    },
    [map, cart],
  );
  return (
    <group>
      <KitMeshes make={make} />
      <mesh position={[X + 3.5, 3.0, -6.42]}>
        <planeGeometry args={[3.6, 0.9]} />
        <meshStandardMaterial map={station} roughness={0.85} />
      </mesh>
      <mesh position={[X - 1.0, 8.4, -65.62]}>
        <planeGeometry args={[3.4, 0.85]} />
        <meshStandardMaterial map={depot} roughness={0.85} />
      </mesh>
    </group>
  );
}
