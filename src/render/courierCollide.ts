// Your own courier's collision for the client-side prediction (predict.ts): its capsule against the active map's solid
// level geometry, built from the same shared data the server builds its colliders from (island boxes, level boxes incl.
// invisible keep-in walls and couriers-only barriers, closed gates, standing barricades) plus the golden object.
// Analytic closest points against oriented boxes, a few microseconds per tick, no physics engine on the client.
// Moving machinery is not modelled here: the reconciliation in predict.ts corrects for it.
import * as THREE from 'three';
import * as C from '../shared/constants';
import { LEVEL, islandBoxes, smooth } from '../shared/level';
import type { MapDef } from '../shared/maps/types';
import { shapeSpec } from '../shared/shapes';
import { activeMap, mechState } from './mapState';

interface Solid {
  c: THREE.Vector3;
  h: THREE.Vector3;
  /** world -> local rotation (null: axis aligned) */
  inv: THREE.Matrix3 | null;
  br: number;
  gate?: { i: number; drop: number };
  blocker?: number;
  ball?: boolean;
}

const tmpM = new THREE.Matrix4();
const tmpE = new THREE.Euler();

function solid(p: readonly number[], s: readonly number[], rot: THREE.Euler | null): Solid {
  let inv: THREE.Matrix3 | null = null;
  if (rot && (rot.x || rot.y || rot.z)) inv = new THREE.Matrix3().setFromMatrix4(tmpM.makeRotationFromEuler(rot)).transpose();
  const h = new THREE.Vector3(s[0] / 2, s[1] / 2, s[2] / 2);
  return { c: new THREE.Vector3(p[0], p[1], p[2]), h, inv, br: h.length() };
}

const cache = new Map<string, Solid[]>();
function solidsFor(map: MapDef): Solid[] {
  let list = cache.get(map.id);
  if (list) return list;
  list = [];
  for (const isl of [...(map.course ? LEVEL.islands : []), ...map.islands]) {
    for (const b of islandBoxes(isl)) list.push(solid(b.p, b.s, b.yaw ? tmpE.set(0, b.yaw, 0) : null));
  }
  for (const b of [...(map.course ? LEVEL.boxes : []), ...map.boxes]) {
    const mode = b.collide ?? 'solid';
    if (mode === 'cargo' || mode === 'none') continue;
    list.push(solid(b.p, b.s, b.rot ? tmpE.set(b.rot[0], b.rot[1], b.rot[2]) : null));
  }
  map.mechs.forEach((d, i) => {
    if (d.kind === 'gate' && d.collide !== 'cargo') list!.push({ ...solid(d.p, d.s, null), gate: { i, drop: d.drop } });
    if (d.kind === 'blocker' && d.collide !== 'cargo') list!.push({ ...solid(d.p, d.s, d.rotY ? tmpE.set(0, d.rotY, 0) : null), blocker: i });
  });
  cache.set(map.id, list);
  return list;
}

/** The golden object's pose for one query (x, y, z centre, rotation, form). */
export interface ArtPose {
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  shape: number;
}

const art: Solid = { c: new THREE.Vector3(), h: new THREE.Vector3(), inv: new THREE.Matrix3(), br: 0 };
const artQ = new THREE.Quaternion();
function artSolid(a: ArtPose): Solid {
  const s = shapeSpec(a.shape);
  art.c.set(a.x, a.y, a.z);
  art.ball = !!s.ball;
  if (s.ball) {
    art.h.set(s.half[0], s.half[0], s.half[0]);
    art.br = s.half[0];
    art.inv = null;
  } else {
    art.h.set(s.half[0], s.half[1], s.half[2]);
    art.br = art.h.length();
    artQ.set(a.qx, a.qy, a.qz, a.qw).invert();
    art.inv = (art.inv ?? new THREE.Matrix3()).setFromMatrix4(tmpM.makeRotationFromQuaternion(artQ));
  }
  return art;
}

const lp = new THREE.Vector3();
const lu = new THREE.Vector3();
const q = new THREE.Vector3();
const sp = new THREE.Vector3();
const n = new THREE.Vector3();
const UPV = new THREE.Vector3(0, 1, 0);
const fwd = new THREE.Matrix3();

/**
 * Deepest contact between a vertical capsule (centre `cx, cy, cz`, segment half length `hh`, radius `r`) and solid `s`
 * whose centre is at height `sy`: writes the world normal (pointing out of the solid) into `n`, returns the depth (<= 0
 * when apart).
 */
function contact(s: Solid, sy: number, cx: number, cy: number, cz: number, hh: number, r: number): number {
  lp.set(cx - s.c.x, cy - sy, cz - s.c.z);
  if (lp.lengthSq() > (s.br + hh + r) * (s.br + hh + r)) return 0;
  if (s.ball) {
    // closest point of the segment to the sphere centre
    const t = Math.max(-hh, Math.min(hh, -lp.y));
    sp.set(lp.x, lp.y + t, lp.z);
    const d = sp.length();
    const depth = s.h.x + r - d;
    if (depth <= 0) return 0;
    if (d > 1e-6) n.copy(sp).multiplyScalar(1 / d);
    else n.set(0, 1, 0);
    return depth;
  }
  lu.copy(UPV);
  if (s.inv) {
    lp.applyMatrix3(s.inv);
    lu.applyMatrix3(s.inv);
  }
  // closest points between the segment lp + t*lu (|t| <= hh) and the box [-h, h]: alternate projections
  let t = 0;
  for (let k = 0; k < 3; k++) {
    sp.copy(lp).addScaledVector(lu, t);
    q.set(Math.max(-s.h.x, Math.min(s.h.x, sp.x)), Math.max(-s.h.y, Math.min(s.h.y, sp.y)), Math.max(-s.h.z, Math.min(s.h.z, sp.z)));
    t = Math.max(-hh, Math.min(hh, (q.x - lp.x) * lu.x + (q.y - lp.y) * lu.y + (q.z - lp.z) * lu.z));
  }
  sp.copy(lp).addScaledVector(lu, t);
  q.set(Math.max(-s.h.x, Math.min(s.h.x, sp.x)), Math.max(-s.h.y, Math.min(s.h.y, sp.y)), Math.max(-s.h.z, Math.min(s.h.z, sp.z)));
  n.copy(sp).sub(q);
  const d = n.length();
  let depth: number;
  if (d > 1e-6) {
    if (d >= r) return 0;
    n.multiplyScalar(1 / d);
    depth = r - d;
  } else {
    // the segment point is inside the box: out along the shallowest face
    const px = s.h.x - Math.abs(sp.x);
    const py = s.h.y - Math.abs(sp.y);
    const pz = s.h.z - Math.abs(sp.z);
    if (px <= py && px <= pz) {
      n.set(Math.sign(sp.x) || 1, 0, 0);
      depth = px + r;
    } else if (py <= pz) {
      n.set(0, Math.sign(sp.y) || 1, 0);
      depth = py + r;
    } else {
      n.set(0, 0, Math.sign(sp.z) || 1);
      depth = pz + r;
    }
  }
  if (s.inv) n.applyMatrix3(fwd.copy(s.inv).transpose());
  return depth;
}

function solidY(s: Solid): number | null {
  if (s.blocker !== undefined && (mechState(s.blocker)[0] ?? 1) < 0.5) return null;
  if (s.gate) return s.c.y - s.gate.drop * smooth(Math.min(1, Math.max(0, mechState(s.gate.i)[0] ?? 0)));
  return s.c.y;
}

export interface CourierBody {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

/** What the last resolve touched. */
export const touched = { ground: false, groundY: -Infinity, art: false, artNx: 0, artNz: 0 };

const HH = C.PLAYER_HALF_HEIGHT;
const R = C.PLAYER_RADIUS;

function resolveOne(b: CourierBody, s: Solid, sy: number, isArt: boolean) {
  const depth = contact(s, sy, b.x, b.y, b.z, HH, R);
  if (depth <= 1e-5) return;
  if (n.y > 0.5) {
    // walkable (floor, ramp, the top of the golden object): straight up, so slopes don't slide you back
    b.y += Math.min(depth / n.y, depth * 2);
    if (b.vy < 0) b.vy = 0;
    touched.ground = true;
  } else if (n.y < -0.5) {
    b.y -= Math.min(depth / -n.y, depth * 2);
    if (b.vy > 0) b.vy = 0;
  } else {
    const hl = Math.hypot(n.x, n.z) || 1;
    const nx = n.x / hl;
    const nz = n.z / hl;
    const push = depth / hl;
    b.x += nx * push;
    b.z += nz * push;
    const into = b.vx * nx + b.vz * nz;
    if (into < 0) {
      b.vx -= nx * into;
      b.vz -= nz * into;
    }
    if (isArt) {
      touched.art = true;
      touched.artNx = nx;
      touched.artNz = nz;
    }
  }
}

/** Push the courier out of everything solid and stop its velocity into it. */
export function resolveCourier(b: CourierBody, a: ArtPose | null) {
  touched.ground = false;
  touched.art = false;
  const list = solidsFor(activeMap());
  for (let pass = 0; pass < 2; pass++) {
    for (const s of list) {
      const sy = solidY(s);
      if (sy !== null) resolveOne(b, s, sy, false);
    }
    if (a) {
      const s = artSolid(a);
      resolveOne(b, s, s.c.y, true);
    }
  }
}

/**
 * Standing on something solid (the server's test: a slightly smaller ball cast 0.16 down from just above the bottom of
 * the capsule)? Moving machinery is handled by the caller.
 */
export function solidGround(b: CourierBody, a: ArtPose | null): boolean {
  const r = R * 0.9;
  const cy = b.y - HH + 0.04 - 0.16 + 0.002;
  const list = solidsFor(activeMap());
  for (const s of list) {
    const sy = solidY(s);
    if (sy === null) continue;
    if (contact(s, sy, b.x, cy, b.z, 0, r) > 0 && n.y > 0.3) return true;
  }
  if (a) {
    const s = artSolid(a);
    if (contact(s, s.c.y, b.x, cy, b.z, 0, r) > 0 && n.y > 0.3) return true;
  }
  return false;
}

/** Visual only: push a drawn courier out of the drawn golden object (horizontally), so a push never shows overlap. */
export function separateFromArtifact(p: { x: number; y: number; z: number }, a: ArtPose) {
  const s = artSolid(a);
  const depth = contact(s, s.c.y, p.x, p.y, p.z, HH, R);
  if (depth <= 1e-4 || Math.abs(n.y) > 0.5) return;
  const hl = Math.hypot(n.x, n.z) || 1;
  p.x += (n.x / hl) * (depth / hl);
  p.z += (n.z / hl) * (depth / hl);
}
