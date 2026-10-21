// Camera collision: the active map's solid level geometry from the same shared data the server builds its colliders
// from (island boxes, level boxes, closed gates, standing barricades). Analytic ray vs. oriented box, with each box
// grown by the camera's radius, so a cast costs a few microseconds and the client needs no physics.
import * as THREE from 'three';
import { LEVEL, islandBoxes, smooth, type BoxDef } from '../shared/level';
import type { MapDef } from '../shared/maps/types';
import { activeMap, mechState } from './mapState';

interface Solid {
  c: THREE.Vector3;
  h: THREE.Vector3; // half extents
  /** world -> local rotation (null: axis aligned) */
  inv: THREE.Matrix3 | null;
  /** bounding radius for a quick reject */
  br: number;
  /** gate: mechanism index + drop height (sinks into the floor as it opens) */
  gate?: { i: number; drop: number };
  /** barricade: mechanism index (gone once its state says so) */
  blocker?: number;
}

const tmpM = new THREE.Matrix4();
const tmpE = new THREE.Euler();

function solid(p: number[], s: number[], rot: THREE.Euler | null): Solid {
  let inv: THREE.Matrix3 | null = null;
  if (rot && (rot.x || rot.y || rot.z)) inv = new THREE.Matrix3().setFromMatrix4(tmpM.makeRotationFromEuler(rot)).transpose();
  const h = new THREE.Vector3(s[0] / 2, s[1] / 2, s[2] / 2);
  return { c: new THREE.Vector3(p[0], p[1], p[2]), h, inv, br: h.length() };
}

function visibleSolid(b: BoxDef) {
  if (b.collide === 'cargo' || b.collide === 'none') return false;
  return b.mat !== 'invisible' || !!b.vis; // invisible keep-in walls never push the camera around
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
    if (visibleSolid(b)) list.push(solid(b.p, b.s, b.rot ? tmpE.set(b.rot[0], b.rot[1], b.rot[2]) : null));
  }
  map.mechs.forEach((d, i) => {
    if (d.kind === 'gate' && d.collide !== 'cargo') list!.push({ ...solid(d.p, d.s, null), gate: { i, drop: d.drop } });
    if (d.kind === 'blocker' && d.collide !== 'cargo' && d.style !== 'invisible') {
      list!.push({ ...solid(d.p, d.s, d.rotY ? tmpE.set(0, d.rotY, 0) : null), blocker: i });
    }
  });
  cache.set(map.id, list);
  return list;
}

const lo = new THREE.Vector3();
const ld = new THREE.Vector3();
const oc = new THREE.Vector3();

/**
 * Free distance along `dir` (unit) from `from` before a sphere of `radius` touches solid level geometry, up to `max`.
 * Boxes that already contain the start point are ignored (they can't be escaped along the ray anyway).
 */
export function castCamera(from: THREE.Vector3, dir: THREE.Vector3, max: number, radius: number): number {
  let best = max;
  for (const s of solidsFor(activeMap())) {
    let cy = s.c.y;
    if (s.gate) cy -= s.gate.drop * smooth(Math.min(1, Math.max(0, mechState(s.gate.i)[0] ?? 0)));
    if (s.blocker !== undefined && (mechState(s.blocker)[0] ?? 1) < 0.5) continue;
    // quick reject: the box's bounding sphere is nowhere near the segment
    oc.set(s.c.x - from.x, cy - from.y, s.c.z - from.z);
    const along = Math.min(best, Math.max(0, oc.dot(dir)));
    const R = s.br + radius;
    if (oc.lengthSq() - 2 * along * oc.dot(dir) + along * along > R * R) continue;
    lo.set(from.x - s.c.x, from.y - cy, from.z - s.c.z);
    ld.copy(dir);
    if (s.inv) {
      lo.applyMatrix3(s.inv);
      ld.applyMatrix3(s.inv);
    }
    // starting closer than `radius` to this box (a pivot pressed against a wall): shrink the sphere for this box so the
    // cast still sees it instead of starting inside its grown shape
    const gap = Math.hypot(Math.max(0, Math.abs(lo.x) - s.h.x), Math.max(0, Math.abs(lo.y) - s.h.y), Math.max(0, Math.abs(lo.z) - s.h.z));
    const r = Math.min(radius, Math.max(0, gap - 0.01));
    let t0 = -Infinity;
    let t1 = Infinity;
    let inside = true;
    for (let k = 0; k < 3; k++) {
      const o = lo.getComponent(k);
      const d = ld.getComponent(k);
      const h = s.h.getComponent(k) + r;
      if (Math.abs(o) > h) inside = false;
      if (Math.abs(d) < 1e-9) {
        if (Math.abs(o) > h) {
          t0 = Infinity;
          break;
        }
        continue;
      }
      let a = (-h - o) / d;
      let b = (h - o) / d;
      if (a > b) [a, b] = [b, a];
      if (a > t0) t0 = a;
      if (b < t1) t1 = b;
      if (t0 > t1) break;
    }
    if (inside || t0 > t1 || t1 < 0) continue;
    if (t0 >= 0 && t0 < best) best = t0;
  }
  return best;
}

/** Is `p` inside solid level geometry (grown by `radius`)? (tests: the camera must never be) */
export function insideSolid(p: THREE.Vector3, radius = 0): boolean {
  for (const s of solidsFor(activeMap())) {
    let cy = s.c.y;
    if (s.gate) cy -= s.gate.drop * smooth(Math.min(1, Math.max(0, mechState(s.gate.i)[0] ?? 0)));
    if (s.blocker !== undefined && (mechState(s.blocker)[0] ?? 1) < 0.5) continue;
    lo.set(p.x - s.c.x, p.y - cy, p.z - s.c.z);
    if (lo.lengthSq() > (s.br + radius) * (s.br + radius)) continue;
    if (s.inv) lo.applyMatrix3(s.inv);
    if (Math.abs(lo.x) < s.h.x + radius && Math.abs(lo.y) < s.h.y + radius && Math.abs(lo.z) < s.h.z + radius) return true;
  }
  return false;
}
