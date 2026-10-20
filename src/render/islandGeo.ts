// Sculpted floating islands. The walkable cap matches the collider outline exactly; everything below it is
// decorative: a rounded grass rim, a dark soil band, layered sandstone strata with ledges and embedded
// boulders, a craggy tapering underside with hanging spires, and a few vines spilling over the edge.
import * as THREE from 'three';
import type { IslandDef, V2 } from '../shared/level';
import { rng } from './materials';

/** Faces that must not bulge past the collider (moving lift and the lever wall run flush against them). */
const FLUSH: Record<string, { nx: number; nz: number }[]> = { F: [{ nx: 0, nz: 1 }] };

export interface IslandMeshes {
  top: THREE.BufferGeometry;
  rock: THREE.BufferGeometry;
  vines: THREE.BufferGeometry;
}

// ---------------------------------------------------------------- polygon helpers

function signedArea(pts: V2[]) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/** Inward offset of a convex polygon by d (works for both windings). */
function offsetPoly(pts: V2[], d: number): V2[] {
  if (d === 0) return pts.map((p) => [p[0], p[1]] as V2);
  const s = signedArea(pts) > 0 ? 1 : -1;
  const n = pts.length;
  const lines = pts.map((p, i) => {
    const q = pts[(i + 1) % n];
    const ex = q[0] - p[0], ez = q[1] - p[1];
    const L = Math.hypot(ex, ez) || 1;
    // inward normal
    const nx = (-ez / L) * s, nz = (ex / L) * s;
    return { px: p[0] + nx * d, pz: p[1] + nz * d, dx: ex / L, dz: ez / L };
  });
  return pts.map((_, i) => {
    const a = lines[(i - 1 + n) % n], b = lines[i];
    const den = a.dx * b.dz - a.dz * b.dx;
    if (Math.abs(den) < 1e-6) return [b.px, b.pz] as V2;
    const t = ((b.px - a.px) * b.dz - (b.pz - a.pz) * b.dx) / den;
    return [a.px + a.dx * t, a.pz + a.dz * t] as V2;
  });
}

function edgeCounts(pts: V2[], step: number) {
  return pts.map((p, i) => {
    const q = pts[(i + 1) % pts.length];
    return Math.max(1, Math.round(Math.hypot(q[0] - p[0], q[1] - p[1]) / step));
  });
}

function resample(pts: V2[], counts: number[]): V2[] {
  const out: V2[] = [];
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length];
    for (let k = 0; k < counts[i]; k++) {
      const t = k / counts[i];
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  });
  return out;
}

/** Outward unit normal at each resampled point (corner points average their two edges). */
function outwardNormals(ring: V2[], ccw: boolean): V2[] {
  const n = ring.length;
  const s = ccw ? 1 : -1;
  const en = ring.map((p, i) => {
    const q = ring[(i + 1) % n];
    const ex = q[0] - p[0], ez = q[1] - p[1];
    const L = Math.hypot(ex, ez) || 1;
    return [(ez / L) * s, (-ex / L) * s] as V2;
  });
  return ring.map((_, i) => {
    const a = en[(i - 1 + n) % n], b = en[i];
    const x = a[0] + b[0], z = a[1] + b[1];
    const L = Math.hypot(x, z) || 1;
    return [x / L, z / L] as V2;
  });
}

function centroid(pts: V2[]): V2 {
  let x = 0, z = 0;
  for (const p of pts) {
    x += p[0];
    z += p[1];
  }
  return [x / pts.length, z / pts.length];
}

/** Smooth periodic noise along the outline, parameter u in [0,1). */
function loopNoise(R: () => number, octaves = 5) {
  const terms = Array.from({ length: octaves }, (_, k) => ({ f: k + 1 + Math.floor(R() * 2), p: R() * Math.PI * 2, a: 1 / (k + 1) }));
  const norm = terms.reduce((s, t) => s + t.a, 0);
  return (u: number) => terms.reduce((s, t) => s + Math.sin(u * Math.PI * 2 * t.f + t.p) * t.a, 0) / norm;
}

// ---------------------------------------------------------------- palettes (sRGB)

const PAL = {
  grass: {
    soil: ['#6e4a35', '#7c553c'],
    strata: ['#d39c63', '#c48a57', '#dcae74', '#b97d50'],
    under: ['#b17a5a', '#9c6e63', '#866478', '#6f6390'],
    boulder: ['#c99a70', '#b38767', '#a89aa8'],
  },
  stone: {
    soil: ['#6e5a4e', '#7a6656'],
    strata: ['#d5cbc6', '#c2b6ba', '#ddd3ca', '#b3a7b4'],
    under: ['#ab9fac', '#958aa4', '#82789e', '#6e6895'],
    boulder: ['#cfc4c2', '#bab0b8', '#a69cb0'],
  },
};

const tmpC = new THREE.Color();
function col(hex: string) {
  return tmpC.set(hex).clone();
}

// ---------------------------------------------------------------- builder

export function buildIsland(isl: IslandDef): IslandMeshes {
  const R = rng(isl.seed * 977 + 13);
  const pts = isl.pts;
  const ccw = signedArea(pts) > 0;
  const top = isl.top;
  const pal = PAL[isl.style ?? 'grass'];
  const scenic = isl.id.startsWith('scenic');
  const flush = FLUSH[isl.id] ?? [];
  const isFlush = (n: V2) => flush.some((f) => n[0] * f.nx + n[1] * f.nz > 0.7);

  // ---------------- walkable cap + rounded rim (smooth shaded, terrain material)
  const minHalf = Math.min(isl.rect.hx, isl.rect.hz);
  const insets = [0, 0.16, 0.42, 0.9, 1.6, 2.5].filter((d) => d < minHalf * 0.75);
  const rimShade = [0.8, 0.88, 0.95, 0.99, 1, 1];
  const counts = edgeCounts(pts, 0.6);
  const rings = insets.map((d) => resample(offsetPoly(pts, d), counts));
  const N = rings[0].length;
  const pos: number[] = [];
  const colr: number[] = [];
  const idx: number[] = [];
  rings.forEach((ring, k) => {
    for (const [x, z] of ring) {
      pos.push(x, top, z);
      const c = rimShade[k];
      colr.push(c, c, c);
    }
  });
  for (let k = 0; k < rings.length - 1; k++) {
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      const a = k * N + i, b = k * N + j, c = (k + 1) * N + i, d = (k + 1) * N + j;
      if (ccw) idx.push(a, c, b, b, c, d);
      else idx.push(a, b, c, b, d, c);
    }
  }
  // interior: earcut the innermost ring (in XZ; flip winding so faces point up)
  const inner = rings[rings.length - 1];
  const tri = THREE.ShapeUtils.triangulateShape(
    inner.map(([x, z]) => new THREE.Vector2(x, z)),
    [],
  );
  const base = (rings.length - 1) * N;
  for (const [a, b, c] of tri) {
    const A = inner[a], B = inner[b], C = inner[c];
    // y-component of (B-A) x (C-A) > 0 means the face points up
    const up = (B[1] - A[1]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[1] - A[1]) > 0;
    if (up) idx.push(base + a, base + b, base + c);
    else idx.push(base + a, base + c, base + b);
  }
  // rounded rim rows below the outline, with a wavy lower edge like a grass mat draped over the cliff
  const outline = rings[0];
  const nrm = outwardNormals(outline, ccw);
  const wave = loopNoise(R, 6);
  const rimRows = [
    { o: 0.07, y: 0.05, c: 0.74 },
    { o: 0.12, y: 0.17, c: 0.66 },
    { o: 0.1, y: 0.32, c: 0.55, wavy: true },
  ];
  const rimBase = pos.length / 3;
  rimRows.forEach((row) => {
    outline.forEach(([x, z], i) => {
      const w = row.wavy ? Math.max(0, wave(i / N) * 0.5 + 0.5) : 0;
      const jitter = row.wavy ? R() * 0.1 : 0;
      const o = isFlush(nrm[i]) ? -0.02 : row.o + (row.wavy ? 0.02 : 0);
      pos.push(x + nrm[i][0] * o, top - row.y - w * 0.22 - jitter, z + nrm[i][1] * o);
      colr.push(row.c, row.c, row.c);
    });
  });
  for (let r = -1; r < rimRows.length - 1; r++) {
    const ra = r < 0 ? 0 : rimBase + r * N;
    const rb = rimBase + (r + 1) * N;
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      const a = ra + i, b = ra + j, c = rb + i, d = rb + j;
      if (!ccw) idx.push(a, c, b, b, c, d);
      else idx.push(a, b, c, b, d, c);
    }
  }
  const topGeo = new THREE.BufferGeometry();
  topGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  topGeo.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  topGeo.setIndex(idx);
  topGeo.computeVertexNormals();
  // keep the walkable cap's normals perfectly up (lighting on the play surface stays even)
  const nAttr = topGeo.attributes.normal as THREE.BufferAttribute;
  for (let v = 0; v < rings.length * N; v++) {
    if (v < N) continue;
    nAttr.setXYZ(v, 0, 1, 0);
  }

  // ---------------- rock: soil band, strata, underside, spires, boulders (flat shaded)
  const rp: number[] = [];
  const rc: number[] = [];
  const [cx, cz] = centroid(pts);
  const rCounts = edgeCounts(pts, scenic ? 1.3 : 0.85);
  const rRing = resample(pts, rCounts);
  const M = rRing.length;
  const rN = outwardNormals(rRing, ccw);
  const n1 = loopNoise(R, 6);
  const n2 = loopNoise(R, 8);
  type Row = { y: number; inset: number; s: number; color: THREE.Color; jit: number };
  const rows: Row[] = [];
  const thick = isl.thick;
  const depth = isl.depth;
  // soil
  rows.push({ y: top - 0.26, inset: 0.0, s: 1, color: col(pal.soil[0]), jit: 0.02 });
  rows.push({ y: top - 0.55, inset: 0.06, s: 1, color: col(pal.soil[1]), jit: 0.04 });
  // strata: zig-zag ledges every ~0.6 m
  let y = top - 0.55;
  let layer = 0;
  while (y > top - thick + 0.25) {
    const h = 0.5 + R() * 0.35;
    const c = col(pal.strata[layer % pal.strata.length]).offsetHSL(0, 0, (R() - 0.5) * 0.04);
    rows.push({ y: y - 0.06, inset: -0.06 - R() * 0.06, s: 1, color: c, jit: 0.06 });
    rows.push({ y: y - h * 0.55, inset: 0.12 + R() * 0.1, s: 1, color: c.clone().offsetHSL(0, 0, -0.03), jit: 0.1 });
    y -= h;
    layer++;
  }
  rows.push({ y: top - thick, inset: 0.02, s: 1, color: col(pal.strata[layer % pal.strata.length]), jit: 0.08 });
  // underside taper (scale toward the centroid)
  const U = [0.1, 0.24, 0.4, 0.56, 0.72, 0.86];
  U.forEach((u, k) => {
    const s = 1 - 0.86 * Math.pow(u, 0.9);
    const cIdx = Math.min(pal.under.length - 1, Math.floor((k / U.length) * pal.under.length));
    const c = col(pal.under[cIdx]).lerp(col(pal.under[Math.min(pal.under.length - 1, cIdx + 1)]), ((k / U.length) * pal.under.length) % 1);
    rows.push({ y: top - thick - u * depth, inset: 0, s, color: c, jit: 0.22 * s + 0.08 });
  });
  const rowPts: THREE.Vector3[][] = rows.map((row, ri) => {
    return rRing.map(([x, z], i) => {
      const u = i / M;
      const radial = (n1(u) * 0.18 + n2(u * 2 + ri * 0.07) * 0.08) * (row.s < 1 ? 2.2 : 1);
      let px: number, pz: number;
      if (row.s < 1) {
        const k = row.s * (1 + radial * 0.25);
        px = cx + (x - cx) * k + (R() - 0.5) * row.jit * 2;
        pz = cz + (z - cz) * k + (R() - 0.5) * row.jit * 2;
      } else {
        let ins = row.inset + radial * 0.6 + (R() - 0.5) * row.jit;
        if (isFlush(rN[i])) ins = 0.08 + Math.abs(ins) * 0.5;
        px = x - rN[i][0] * ins;
        pz = z - rN[i][1] * ins;
      }
      const py = row.y + (ri > 1 ? (R() - 0.5) * 0.12 : 0) - (row.s < 1 ? Math.max(0, n2(u + 0.3)) * depth * 0.08 : 0);
      return new THREE.Vector3(px, py, pz);
    });
  });
  const tipY = top - thick - depth * (0.98 + R() * 0.12);
  const tip = new THREE.Vector3(cx + (R() - 0.5) * 1.2, tipY, cz + (R() - 0.5) * 1.2);
  const tipC = col(pal.under[pal.under.length - 1]);
  const face = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, ca: THREE.Color, cb: THREE.Color, cc: THREE.Color) => {
    rp.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    const k = 0.93 + R() * 0.12;
    const r = ((ca.r + cb.r + cc.r) / 3) * k, g = ((ca.g + cb.g + cc.g) / 3) * k, bl = ((ca.b + cb.b + cc.b) / 3) * k;
    rc.push(r, g, bl, r, g, bl, r, g, bl);
  };
  for (let r = 0; r < rows.length - 1; r++) {
    const A = rowPts[r], B = rowPts[r + 1];
    for (let i = 0; i < M; i++) {
      const j = (i + 1) % M;
      // (upper i, lower i, upper j) faces outward for clockwise (x,z) outlines; swap for the other winding
      const cu = rows[r].color, cl = rows[r + 1].color;
      if (!ccw) {
        face(A[i], B[i], A[j], cu, cl, cu);
        face(A[j], B[i], B[j], cu, cl, cl);
      } else {
        face(A[i], A[j], B[i], cu, cu, cl);
        face(A[j], B[j], B[i], cu, cl, cl);
      }
    }
  }
  const last = rowPts[rowPts.length - 1];
  const lastC = rows[rows.length - 1].color;
  for (let i = 0; i < M; i++) {
    if (!ccw) face(last[i], tip, last[(i + 1) % M], lastC, tipC, lastC);
    else face(last[i], last[(i + 1) % M], tip, lastC, lastC, tipC);
  }

  // hanging spires under the mass
  const spires = scenic ? 2 + Math.floor(R() * 2) : 2 + Math.floor(R() * 3);
  const midRow = rowPts[rows.length - 3];
  for (let k = 0; k < spires; k++) {
    const anchor = midRow[Math.floor(R() * M)];
    const sx = cx + (anchor.x - cx) * (0.35 + R() * 0.3);
    const sz = cz + (anchor.z - cz) * (0.35 + R() * 0.3);
    const sy = anchor.y + 0.4;
    const len = depth * (0.35 + R() * 0.45);
    const rad = Math.min(isl.rect.hx, isl.rect.hz) * (0.12 + R() * 0.12);
    const sides = 6;
    const ringA: THREE.Vector3[] = [], ringB: THREE.Vector3[] = [];
    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * Math.PI * 2 + R() * 0.4;
      ringA.push(new THREE.Vector3(sx + Math.cos(a) * rad, sy, sz + Math.sin(a) * rad));
      ringB.push(new THREE.Vector3(sx + Math.cos(a) * rad * 0.45 + (R() - 0.5) * 0.3, sy - len * 0.55, sz + Math.sin(a) * rad * 0.45 + (R() - 0.5) * 0.3));
    }
    const sTip = new THREE.Vector3(sx + (R() - 0.5) * 0.4, sy - len, sz + (R() - 0.5) * 0.4);
    const c0 = col(pal.under[1]), c1 = col(pal.under[2]), c2 = col(pal.under[3]);
    for (let s = 0; s < sides; s++) {
      const t = (s + 1) % sides;
      // spire faces point outward for ccw ordering of the ring around its axis (angles increase CCW in x/z)
      face(ringA[s], ringA[t], ringB[s], c0, c0, c1);
      face(ringA[t], ringB[t], ringB[s], c0, c1, c1);
      face(ringB[s], ringB[t], sTip, c1, c1, c2);
    }
  }

  // boulders embedded in the cliff band break the straight silhouette
  const perim = rRing.reduce((s, p, i) => s + Math.hypot(rRing[(i + 1) % M][0] - p[0], rRing[(i + 1) % M][1] - p[1]), 0);
  const boulders = Math.round(perim / (scenic ? 9 : 4.5));
  const ico = new THREE.IcosahedronGeometry(1, 0);
  const ip = ico.attributes.position as THREE.BufferAttribute;
  for (let k = 0; k < boulders; k++) {
    const i = Math.floor(R() * M);
    if (isFlush(rN[i])) continue;
    const [x, z] = rRing[i];
    const r = 0.3 + R() * 0.4;
    const dy = 0.75 + R() * Math.max(0.3, thick - 0.4);
    const out = r * (0.02 + R() * 0.12);
    const bx = x + rN[i][0] * out, bz = z + rN[i][1] * out, by = top - dy;
    const c = col(pal.boulder[Math.floor(R() * pal.boulder.length)]);
    const sy = 0.7 + R() * 0.3;
    const rot = new THREE.Euler(R() * 3, R() * 3, R() * 3);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(bx, by, bz), new THREE.Quaternion().setFromEuler(rot), new THREE.Vector3(r, r * sy, r));
    const v = new THREE.Vector3();
    for (let f = 0; f < ip.count; f += 3) {
      const tri3 = [0, 1, 2].map((o) => v.fromBufferAttribute(ip, f + o).applyMatrix4(m).clone());
      // icosahedron faces are already outward; push in native order regardless of island winding
      rp.push(tri3[0].x, tri3[0].y, tri3[0].z, tri3[1].x, tri3[1].y, tri3[1].z, tri3[2].x, tri3[2].y, tri3[2].z);
      const kk = 0.92 + R() * 0.14;
      for (let o = 0; o < 3; o++) rc.push(c.r * kk, c.g * kk, c.b * kk);
    }
  }
  const rockGeo = new THREE.BufferGeometry();
  rockGeo.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
  rockGeo.setAttribute('color', new THREE.Float32BufferAttribute(rc, 3));
  rockGeo.computeVertexNormals();

  // ---------------- leafy drapes spilling over the rim (chains of small flattened leaf blobs)
  const vp: number[] = [];
  const vc: number[] = [];
  const vineCount = Math.round(perim / (scenic ? 6 : 4));
  const leafA = col('#5aa647'), leafB = col('#3f8a46'), leafC = col('#78bb52');
  const blob = new THREE.IcosahedronGeometry(1, 0);
  const bp = blob.attributes.position as THREE.BufferAttribute;
  const bm = new THREE.Matrix4();
  const bv = new THREE.Vector3();
  for (let k = 0; k < vineCount; k++) {
    const i = Math.floor(R() * M);
    if (isFlush(rN[i])) continue;
    const [x, z] = rRing[i];
    const nx = rN[i][0], nz = rN[i][1];
    const tx = -nz, tz = nx;
    const links = 2 + Math.floor(R() * Math.min(4, thick * 1.5));
    let yy = top - 0.1;
    for (let s = 0; s < links; s++) {
      const r = (0.26 - s * 0.035) * (0.8 + R() * 0.5);
      const out = 0.1 + r * 0.55;
      const sx = (R() - 0.5) * 0.25;
      bm.compose(
        new THREE.Vector3(x + nx * out + tx * sx, yy, z + nz * out + tz * sx),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(R() * 3, R() * 3, R() * 3)),
        new THREE.Vector3(r * 1.25, r * 0.85, r * 0.7),
      );
      const c = s === 0 ? leafC : R() < 0.5 ? leafA : leafB;
      const kk = 0.9 + R() * 0.2;
      for (let f = 0; f < bp.count; f++) {
        bv.fromBufferAttribute(bp, f).applyMatrix4(bm);
        vp.push(bv.x, bv.y, bv.z);
        vc.push(c.r * kk, c.g * kk, c.b * kk);
      }
      yy -= r * 1.3;
    }
  }
  const vineGeo = new THREE.BufferGeometry();
  vineGeo.setAttribute('position', new THREE.Float32BufferAttribute(vp, 3));
  vineGeo.setAttribute('color', new THREE.Float32BufferAttribute(vc, 3));
  vineGeo.computeVertexNormals();

  return { top: topGeo, rock: rockGeo, vines: vineGeo };
}

/** Decorative-only island (no collider) for distant scenery. */
export function scenicIsland(seed: number, cx: number, cz: number, r: number, top: number, depth: number): IslandDef {
  const R = rng(seed);
  const n = 9 + Math.floor(R() * 4);
  const pts: V2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.86 + R() * 0.2);
    pts.push([cx + Math.cos(a) * rr, cz - Math.sin(a) * rr]);
  }
  return { id: 'scenic' + seed, pts, rect: { cx, cz, hx: r, hz: r, ch: [0, 0, 0, 0] }, top, thick: Math.max(1.6, r * 0.22), depth, seed };
}
