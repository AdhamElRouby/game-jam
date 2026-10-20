// Procedural architecture built to the exact collider boxes from LEVEL: timber bridges with deck arches,
// palisade wall + gate towers, the stone low-arch wall. Visual detail never changes the collision volumes.
import { useMemo } from 'react';
import type { BoxDef } from '../shared/level';
import { Kit, randKit } from './kit';

export const WOOD = {
  plank: ['#c9935c', '#b98452', '#d6a26a', '#c08a57'],
  dark: '#77502f',
  beam: '#8e6040',
  rail: '#a8744a',
  cap: '#6a462c',
  bark: ['#7f5534', '#8b5e3a', '#734c2f'],
  light: '#d9a46b',
};
export const STONE = {
  block: ['#e2d6c8', '#d4c7ba', '#cbbfb6', '#ddd0bf'],
  dark: '#a99a90',
  trim: '#bfb1a5',
  moss: '#7fae5d',
};
export const IRON = '#4d4659';

export function KitMeshes({ make, cast = true, receive = true }: { make: () => Kit; cast?: boolean; receive?: boolean }) {
  const meshes = useMemo(() => make().build(), [make]);
  return (
    <group>
      {meshes.map((m, i) => (
        <mesh key={i} geometry={m.geo} material={m.mat} castShadow={cast} receiveShadow={receive} />
      ))}
    </group>
  );
}

const pick = <T,>(a: T[]) => a[Math.floor(randKit() * a.length) % a.length];
const jit = (s: number) => (randKit() - 0.5) * 2 * s;

// ---------------------------------------------------------------- bridges

/** Timber bridge: plank deck, stringers, posts + handrails, and a deck arch springing from the cliffs. */
export function buildBridge(deck: BoxDef, rails: boolean, kit = new Kit(Math.round(Math.abs(deck.p[2]) * 31))) {
  const [x, yc, zc] = deck.p;
  const [w, th, len] = deck.s;
  const top = yc + th / 2;
  const z0 = zc + len / 2;
  const narrow = w < 3.5;
  // planks across the deck
  const pitch = 0.47;
  const n = Math.max(3, Math.round(len / pitch));
  const step = len / n;
  for (let i = 0; i < n; i++) {
    const z = z0 - step * (i + 0.5);
    const over = jit(0.08);
    kit.box('wood', pick(WOOD.plank), [w - 0.08 + Math.abs(over), 0.12, step - 0.045], [x + over * 0.4, top - 0.06 + jit(0.008), z], [jit(0.008), jit(0.02), jit(0.008)], 0.03, 0.07);
  }
  // stringers + cross beams under the planks
  const sx = w / 2 - (narrow ? 0.35 : 0.55);
  for (const s of [-1, 1]) kit.box('wood', WOOD.dark, [0.26, 0.3, len + 0.1], [x + s * sx, top - 0.27, zc], [0, 0, 0], 0.04);
  const cross = Math.max(2, Math.round(len / 1.9));
  for (let i = 0; i <= cross; i++) {
    const z = z0 - 0.25 - (i * (len - 0.5)) / cross;
    kit.box('wood', WOOD.beam, [w + 0.25, 0.2, 0.24], [x, top - 0.47, z], [0, 0, 0], 0.035);
  }
  // deck arch: springs from the cliff faces below the islands, rises to the deck mid-span, with vertical struts
  const segs = 7;
  const archDrop = narrow ? 1.2 : 1.7;
  for (const s of [-1, 1]) {
    const bx = x + s * sx;
    const pts: [number, number, number][] = [];
    for (let k = 0; k <= segs; k++) {
      const t = k / segs;
      const z = z0 + 0.3 - t * (len + 0.6);
      const y = top - 0.62 - (1 - Math.sin(t * Math.PI)) * archDrop;
      pts.push([bx, y, z]);
    }
    for (let k = 0; k < segs; k++) kit.beam('wood', WOOD.dark, pts[k], pts[k + 1], 0.24, 0.26, 0.04);
    for (let k = 1; k < segs; k++) {
      const p = pts[k];
      if (top - 0.42 - p[1] > 0.15) kit.beam('wood', WOOD.beam, [p[0], p[1], p[2]], [p[0], top - 0.42, p[2]], 0.15, 0.15, 0.03);
    }
  }
  if (!rails) return kit;
  // posts + rails sit inside the rail collider volume (x = +-(w/2 + 0.15), 1.2 tall)
  const px = w / 2 + 0.15;
  const posts = Math.max(2, Math.round(len / 1.75) + 1);
  for (const s of [-1, 1]) {
    const rx = x + s * px;
    const zs: number[] = [];
    for (let i = 0; i < posts; i++) zs.push(z0 - 0.18 - (i * (len - 0.36)) / (posts - 1));
    zs.forEach((z, i) => {
      const end = i === 0 || i === posts - 1;
      const h = end ? 1.5 : 1.22;
      kit.box('wood', WOOD.dark, [end ? 0.3 : 0.22, h + 0.55, end ? 0.3 : 0.22], [rx, top - 0.55 + (h + 0.55) / 2, z], [0, 0, 0], 0.04);
      kit.box('wood', WOOD.cap, [end ? 0.38 : 0.28, 0.08, end ? 0.38 : 0.28], [rx, top + h + 0.04, z], [0, 0, 0], 0.025);
      if (end) kit.sphere('wood', WOOD.light, 0.12, [rx, top + h + 0.17, z], [1, 0.85, 1], 1);
    });
    if (narrow) {
      // rope rails with a gentle sag between posts
      for (let i = 0; i < zs.length - 1; i++) {
        kit.rope('#d8b57a', [rx, top + 1.1, zs[i]], [rx, top + 1.1, zs[i + 1]], 0.12, 0.04);
        kit.rope('#c9a46a', [rx, top + 0.6, zs[i]], [rx, top + 0.6, zs[i + 1]], 0.1, 0.032);
      }
    } else {
      kit.box('wood', WOOD.rail, [0.16, 0.13, len - 0.2], [rx, top + 1.1, zc], [0, 0, 0], 0.045);
      kit.box('wood', WOOD.beam, [0.11, 0.1, len - 0.2], [rx, top + 0.56, zc], [0, 0, 0], 0.035);
      // diagonal braces in each bay
      for (let i = 0; i < zs.length - 1; i++) {
        kit.beam('wood', WOOD.beam, [rx, top + 0.1, zs[i] - 0.12], [rx, top + 0.52, zs[i + 1] + 0.12], 0.08, 0.08, 0.02);
      }
    }
  }
  return kit;
}

// ---------------------------------------------------------------- palisade + gate towers

/** Pointed-log palisade filling the wall collider (front face toward +Z). */
export function buildPalisade(b: BoxDef, kit = new Kit(Math.round(Math.abs(b.p[0]) * 17 + 5))) {
  const [x, y, z] = b.p;
  const [sx, sy] = b.s;
  const r = 0.27;
  const n = Math.round(sx / (r * 1.9));
  const step = sx / n;
  for (let i = 0; i < n; i++) {
    const lx = x - sx / 2 + step * (i + 0.5);
    const h = sy + jit(0.18) + (i % 3 === 1 ? 0.2 : 0);
    const c = pick(WOOD.bark);
    const lean: [number, number, number] = [jit(0.02), 0, jit(0.025)];
    kit.cyl('wood', c, r, r * 1.05, h, [lx, y - sy / 2 + h / 2, z + jit(0.05)], lean, 8, 0.06);
    kit.cone('wood', WOOD.light, r * 1.0, 0.5, [lx, y - sy / 2 + h + 0.24, z], lean, 8, 0.05);
  }
  // horizontal binding beams on both faces + rope lashings
  for (const face of [1, -1]) {
    for (const by of [0.55, sy - 0.75]) {
      kit.box('wood', WOOD.beam, [sx - 0.1, 0.2, 0.16], [x, y - sy / 2 + by, z + face * (r + 0.06)], [0, 0, 0], 0.04);
    }
  }
  for (let i = 1; i < n; i += 3) {
    const lx = x - sx / 2 + step * i;
    kit.box('rope', '#d9b77c', [0.07, 0.3, 0.7], [lx, y - sy / 2 + 0.55, z], [0, 0, 0], 0.02);
  }
  return kit;
}

/** Two timber gate towers with roofs and a high lintel (above TALL's reach) framing the dock gate. */
export function buildGateTowers(cx: number, z: number, opening: number, kit = new Kit(99)) {
  const half = opening / 2 + 0.45;
  for (const s of [-1, 1]) {
    const tx = cx + s * half;
    // four corner posts
    for (const ox of [-0.38, 0.38]) for (const oz of [-0.42, 0.42]) kit.box('wood', WOOD.dark, [0.22, 5.3, 0.22], [tx + ox, 2.65, z + oz], [0, 0, 0], 0.04);
    // plank walls between posts on the lower half
    kit.box('wood', pick(WOOD.plank), [0.9, 2.4, 0.86], [tx, 1.2, z], [0, 0, 0], 0.05);
    kit.box('wood', WOOD.beam, [1.1, 0.16, 1.15], [tx, 2.45, z], [0, 0, 0], 0.03);
    // lookout platform + railing
    kit.box('wood', WOOD.beam, [1.35, 0.16, 1.4], [tx, 4.3, z], [0, 0, 0], 0.03);
    for (const ox of [-0.62, 0.62]) kit.box('wood', WOOD.rail, [0.1, 0.1, 1.3], [tx + ox, 4.85, z], [0, 0, 0], 0.02);
    kit.box('wood', WOOD.rail, [1.3, 0.1, 0.1], [tx, 4.85, z + 0.66], [0, 0, 0], 0.02);
    // pitched roof
    kit.cone('roof', '#d9615e', 1.15, 1.25, [tx, 5.95, z], [0, Math.PI / 4, 0], 4, 0.03);
    kit.sphere('gold', '#ffc94d', 0.12, [tx, 6.65, z], [1, 1, 1], 1, 0);
  }
  // lintel high above (TALL is 4.4 m) + hanging sign board
  kit.box('wood', WOOD.dark, [opening + 2.2, 0.36, 0.42], [cx, 5.05, z + 0.25], [0, 0, 0], 0.06);
  kit.box('wood', WOOD.beam, [opening + 1.6, 0.18, 0.3], [cx, 4.78, z + 0.25], [0, 0, 0], 0.04);
  return kit;
}

// ---------------------------------------------------------------- stone wall with the low arch

/** Coursed stone wall over a box collider (blocks, crenellations, plinth). Front face +Z. */
export function buildStoneWall(b: BoxDef, opts: { merlons?: boolean; seed?: number; tunnel?: { x0: number; x1: number; h: number } } = {}, kit = new Kit(opts.seed ?? 3)) {
  const [x, y, z] = b.p;
  const [sx, sy, sz] = b.s;
  const y0 = y - sy / 2, y1 = y + sy / 2;
  const x0 = x - sx / 2, x1 = x + sx / 2;
  // core (slightly inset) so gaps between blocks read as mortar
  kit.box('stone', STONE.dark, [sx - 0.1, sy - 0.05, sz - 0.12], [x, y - 0.02, z], [0, 0, 0], 0.02, 0);
  const rowH = 0.5;
  const rows = Math.max(1, Math.round(sy / rowH));
  const rh = sy / rows;
  for (const face of [1, -1]) {
    const fz = z + face * (sz / 2 - 0.08);
    for (let r = 0; r < rows; r++) {
      const by = y0 + rh * (r + 0.5);
      let bx = x0 + (r % 2 ? 0.5 : 0);
      while (bx < x1 - 0.05) {
        const bw = Math.min(x1 - bx, 0.85 + randKit() * 0.6);
        const cxb = bx + bw / 2;
        if (!(opts.tunnel && cxb > opts.tunnel.x0 - 0.05 && cxb < opts.tunnel.x1 + 0.05 && by < y0 + opts.tunnel.h)) {
          kit.box('stone', pick(STONE.block), [bw - 0.06, rh - 0.06, 0.2], [cxb, by, fz], [0, 0, 0], 0.05, 0.06);
        }
        bx += bw;
      }
    }
  }
  // plinth + cap course
  kit.box('stone', STONE.trim, [sx + 0.2, 0.32, sz + 0.24], [x, y0 + 0.16, z], [0, 0, 0], 0.06);
  kit.box('stone', STONE.trim, [sx + 0.24, 0.24, sz + 0.24], [x, y1 + 0.02, z], [0, 0, 0], 0.06);
  if (opts.merlons) {
    const m = Math.round(sx / 1.6);
    for (let i = 0; i < m; i++) {
      const mx = x0 + (i + 0.5) * (sx / m);
      if (i % 2 === 0) kit.box('stone', pick(STONE.block), [sx / m - 0.15, 0.6, sz * 0.9], [mx, y1 + 0.42, z], [0, 0, 0], 0.07, 0.05);
    }
  }
  return kit;
}

/** Stone curb / rail in local space (centred on its collider box): bevelled blocks with a capping course. */
export function buildCurb(b: BoxDef, kit = new Kit(Math.round(Math.abs(b.p[0] * 13 + b.p[2] * 7)) + 11)) {
  const [sx, sy, sz] = b.s;
  const alongX = sx >= sz;
  const L = alongX ? sx : sz;
  const T = alongX ? sz : sx;
  kit.box('stone', STONE.dark, alongX ? [sx - 0.06, sy - 0.04, sz - 0.06] : [sx - 0.06, sy - 0.04, sz - 0.06], [0, -0.02, 0], [0, 0, 0], 0.03, 0);
  const n = Math.max(1, Math.round(L / 0.95));
  const len = L / n;
  for (let i = 0; i < n; i++) {
    const c = -L / 2 + len * (i + 0.5);
    const h = sy - 0.1 + jit(0.03);
    const size: [number, number, number] = alongX ? [len - 0.06, h, T + 0.04] : [T + 0.04, h, len - 0.06];
    const pos: [number, number, number] = alongX ? [c, -sy / 2 + h / 2, 0] : [0, -sy / 2 + h / 2, c];
    kit.box('stone', pick(STONE.block), size, pos, [0, 0, 0], 0.07, 0.06);
    const cap: [number, number, number] = alongX ? [len - 0.04, 0.14, T + 0.12] : [T + 0.12, 0.14, len - 0.04];
    kit.box('stone', STONE.trim, cap, alongX ? [c, sy / 2 - 0.05, 0] : [0, sy / 2 - 0.05, c], [0, 0, 0], 0.05, 0.05);
  }
  return kit;
}
