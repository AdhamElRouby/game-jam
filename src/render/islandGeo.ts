// Procedural floating-island meshes: grassy cap, overhanging lip, earthy cliff band, tapered rocky underside.
import * as THREE from 'three';
import type { IslandDef, V2 } from '../shared/level';
import { rng, worldUV } from './materials';

function resample(pts: V2[], step: number): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.round(L / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

function centroid(pts: V2[]): V2 {
  let x = 0, z = 0;
  for (const p of pts) {
    x += p[0];
    z += p[1];
  }
  return [x / pts.length, z / pts.length];
}

const EARTH = new THREE.Color('#b5835a');
const EARTH2 = new THREE.Color('#9a6e55');
const ROCK = new THREE.Color('#9d92b8');
const ROCK2 = new THREE.Color('#7f7aa3');
const STONE = new THREE.Color('#c8bdb4');

export interface IslandMeshes {
  top: THREE.BufferGeometry;
  lip: THREE.BufferGeometry;
  cliff: THREE.BufferGeometry;
  under: THREE.BufferGeometry;
}

export function buildIsland(isl: IslandDef): IslandMeshes {
  const R = rng(isl.seed * 977 + 13);
  const ring = resample(isl.pts, 1.1);
  const [cx, cz] = centroid(isl.pts);
  const top = isl.top;

  // grass cap
  const shape = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z)));
  const topGeo = new THREE.ShapeGeometry(shape);
  topGeo.rotateX(-Math.PI / 2);
  topGeo.translate(0, top + 0.005, 0);
  worldUV(topGeo, 1 / 7, 'xz');
  topGeo.computeVertexNormals();

  // overhanging grass lip with wavy lower edge
  const lipPos: number[] = [];
  const lipIdx: number[] = [];
  const out = 0.12;
  ring.forEach(([x, z], i) => {
    const dx = x - cx, dz = z - cz;
    const d = Math.hypot(dx, dz) || 1;
    const ox = (dx / d) * out, oz = (dz / d) * out;
    const drop = 0.28 + R() * 0.22;
    lipPos.push(x + ox, top + 0.005, z + oz, x + ox * 0.6, top - drop, z + oz * 0.6);
    const j = (i + 1) % ring.length;
    lipIdx.push(i * 2, i * 2 + 1, j * 2, j * 2, i * 2 + 1, j * 2 + 1);
  });
  const lip = new THREE.BufferGeometry();
  lip.setAttribute('position', new THREE.Float32BufferAttribute(lipPos, 3));
  lip.setIndex(lipIdx);
  lip.computeVertexNormals();

  // cliff band (slightly irregular, hidden top edge under the lip)
  const cliffPos: number[] = [];
  const cliffCol: number[] = [];
  const cliffIdx: number[] = [];
  const bands = Math.max(2, Math.round(isl.thick / 1.1));
  const stone = isl.style === 'stone';
  const cols = ring.length;
  for (let b = 0; b <= bands; b++) {
    const t = b / bands;
    const y = top - 0.15 - t * (isl.thick - 0.15);
    for (let i = 0; i < cols; i++) {
      const [x, z] = ring[i];
      const dx = x - cx, dz = z - cz;
      const d = Math.hypot(dx, dz) || 1;
      const inset = 0.04 + R() * (stone ? 0.18 : 0.28) + t * 0.15;
      cliffPos.push(x - (dx / d) * inset, y + (b > 0 && b < bands ? (R() - 0.5) * 0.3 : 0), z - (dz / d) * inset);
      const c = (stone ? STONE.clone().lerp(ROCK, t * 0.6) : EARTH.clone().lerp(EARTH2, t)).offsetHSL(0, 0, (R() - 0.5) * 0.06);
      cliffCol.push(c.r, c.g, c.b);
    }
  }
  for (let b = 0; b < bands; b++) {
    for (let i = 0; i < cols; i++) {
      const j = (i + 1) % cols;
      const a = b * cols + i, bb = b * cols + j, c = (b + 1) * cols + i, d = (b + 1) * cols + j;
      cliffIdx.push(a, c, bb, bb, c, d);
    }
  }
  let cliff: THREE.BufferGeometry = new THREE.BufferGeometry();
  cliff.setAttribute('position', new THREE.Float32BufferAttribute(cliffPos, 3));
  cliff.setAttribute('color', new THREE.Float32BufferAttribute(cliffCol, 3));
  cliff.setIndex(cliffIdx);
  cliff = cliff.toNonIndexed();
  cliff.computeVertexNormals();

  // tapered rocky underside
  const levels = [
    { s: 0.97, y: 0 },
    { s: 0.78, y: 0.22 },
    { s: 0.55, y: 0.5 },
    { s: 0.32, y: 0.76 },
    { s: 0.12, y: 0.94 },
  ];
  const under = ring.filter((_, i) => i % 2 === 0);
  const un = under.length;
  const uPos: number[] = [];
  const uCol: number[] = [];
  const uIdx: number[] = [];
  const baseY = top - isl.thick;
  levels.forEach((lv, li) => {
    for (let i = 0; i < un; i++) {
      const [x, z] = under[i];
      const jitter = li === 0 ? 0 : (R() - 0.5) * 0.18;
      const s = lv.s + jitter;
      const px = cx + (x - cx) * s + (R() - 0.5) * 0.4 * li;
      const pz = cz + (z - cz) * s + (R() - 0.5) * 0.4 * li;
      const py = baseY - lv.y * isl.depth * (0.8 + R() * 0.35) + (li === 0 ? 0.05 : 0);
      uPos.push(px, py, pz);
      const c = EARTH2.clone().lerp(ROCK, Math.min(1, li / 2)).lerp(ROCK2, Math.max(0, li - 2) / 2).offsetHSL(0, 0, (R() - 0.5) * 0.07);
      uCol.push(c.r, c.g, c.b);
    }
  });
  const tip = uPos.length / 3;
  uPos.push(cx + (R() - 0.5), baseY - isl.depth * 1.05, cz + (R() - 0.5));
  uCol.push(ROCK2.r, ROCK2.g, ROCK2.b);
  for (let l = 0; l < levels.length - 1; l++) {
    for (let i = 0; i < un; i++) {
      const j = (i + 1) % un;
      const a = l * un + i, b = l * un + j, c = (l + 1) * un + i, d = (l + 1) * un + j;
      uIdx.push(a, c, b, b, c, d);
    }
  }
  const last = (levels.length - 1) * un;
  for (let i = 0; i < un; i++) uIdx.push(last + i, tip, last + ((i + 1) % un));
  let underGeo: THREE.BufferGeometry = new THREE.BufferGeometry();
  underGeo.setAttribute('position', new THREE.Float32BufferAttribute(uPos, 3));
  underGeo.setAttribute('color', new THREE.Float32BufferAttribute(uCol, 3));
  underGeo.setIndex(uIdx);
  underGeo = underGeo.toNonIndexed();
  underGeo.computeVertexNormals();

  return { top: topGeo, lip, cliff, under: underGeo };
}

/** Decorative-only island (no collider) for distant scenery. */
export function scenicIsland(seed: number, cx: number, cz: number, r: number, top: number, depth: number): IslandDef {
  const R = rng(seed);
  const n = 9 + Math.floor(R() * 4);
  const pts: V2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.8 + R() * 0.3);
    pts.push([cx + Math.cos(a) * rr, cz - Math.sin(a) * rr]);
  }
  return { id: 'scenic' + seed, pts, rect: { cx, cz, hx: r, hz: r, ch: [0, 0, 0, 0] }, top, thick: 1.4, depth, seed };
}
