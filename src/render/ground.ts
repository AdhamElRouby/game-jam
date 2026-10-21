// Analytic "what is under me" query from the shared level data (islands, decks, ramps, lift, drawbridge).
// Used for blob contact shadows; mirrors the walkable colliders closely enough for visuals. Per map: the course maps
// share the original course geometry, standalone maps (Worlds 4 and 5) use their own.
import { LEVEL, islandBoxes, type BoxDef, type IslandDef } from '../shared/level';
import type { MapDef } from '../shared/maps/types';
import { activeMap } from './mapState';

interface Slab {
  x0: number; x1: number; z0: number; z1: number;
  top: number;
  // ramps: top = a + slope * (z - zRef)
  slope?: number;
  zRef?: number;
  rotY?: number;
  cx?: number;
  cz?: number;
}

function addIsland(slabs: Slab[], isl: IslandDef) {
  for (const b of islandBoxes(isl)) {
    slabs.push({ x0: b.p[0] - b.s[0] / 2, x1: b.p[0] + b.s[0] / 2, z0: b.p[2] - b.s[2] / 2, z1: b.p[2] + b.s[2] / 2, top: isl.top, rotY: b.yaw, cx: b.p[0], cz: b.p[2] });
  }
}

function addBox(slabs: Slab[], b: BoxDef) {
  if (b.collide === 'cargo' || b.collide === 'none' || (b.mat === 'invisible' && !b.vis)) return;
  const rx = b.rot ? b.rot[0] : 0;
  if (Math.abs(rx) > 1e-4) {
    // ramp rotated about X: top surface through the box centre offset along its local up
    const c = Math.cos(rx), s = Math.sin(rx);
    const topY = b.p[1] + (b.s[1] / 2) * c;
    const topZ = b.p[2] + (b.s[1] / 2) * s;
    const halfL = (b.s[2] / 2) * c;
    slabs.push({ x0: b.p[0] - b.s[0] / 2, x1: b.p[0] + b.s[0] / 2, z0: topZ - halfL, z1: topZ + halfL, top: topY, slope: -Math.tan(rx), zRef: topZ });
    return;
  }
  slabs.push({ x0: b.p[0] - b.s[0] / 2, x1: b.p[0] + b.s[0] / 2, z0: b.p[2] - b.s[2] / 2, z1: b.p[2] + b.s[2] / 2, top: b.p[1] + b.s[1] / 2 });
}

const cache = new Map<string, Slab[]>();
function slabsFor(map: MapDef): Slab[] {
  let s = cache.get(map.id);
  if (!s) {
    s = [];
    for (const isl of [...(map.course ? LEVEL.islands : []), ...map.islands]) addIsland(s, isl);
    for (const b of [...(map.course ? LEVEL.boxes : []), ...map.boxes]) addBox(s, b);
    cache.set(map.id, s);
  }
  return s;
}

type GroundFn = (x: number, z: number) => number | null;
const dynamic = new Set<GroundFn>();

/** Moving gameplay surfaces (wobble bridges, platforms) add themselves here; returns the unregister function. */
export function registerGround(fn: GroundFn) {
  dynamic.add(fn);
  return () => {
    dynamic.delete(fn);
  };
}

/** Highest walkable surface at (x, z) that is not above `below` (+ a small tolerance). */
export function groundAt(x: number, z: number, below: number, liftY: number, bridge: number): number | null {
  let best: number | null = null;
  const take = (y: number) => {
    if (y <= below + 0.25 && (best === null || y > best)) best = y;
  };
  for (const f of dynamic) {
    const y = f(x, z);
    if (y !== null) take(y);
  }
  const map = activeMap();
  for (const s of slabsFor(map)) {
    let lx = x, lz = z;
    if (s.rotY) {
      // into the box frame: rotate by -yaw about Y (x' = x cos t + z sin t, z' = -x sin t + z cos t)
      const dx = x - s.cx!, dz = z - s.cz!;
      const t = -s.rotY;
      lx = s.cx! + dx * Math.cos(t) + dz * Math.sin(t);
      lz = s.cz! - dx * Math.sin(t) + dz * Math.cos(t);
    }
    if (lx < s.x0 || lx > s.x1 || lz < s.z0 || lz > s.z1) continue;
    take(s.slope !== undefined ? s.top + s.slope * (z - s.zRef!) : s.top);
  }
  if (map.course) {
    const L = LEVEL.lift;
    if (Math.abs(x - L.cx) <= L.w / 2 && Math.abs(z - L.cz) <= L.d / 2) take(liftY);
    const D = LEVEL.drawbridge;
    if (bridge > 0.95 && Math.abs(x - D.hinge[0]) <= D.width / 2 && z <= D.hinge[2] + D.len && z >= D.hinge[2]) take(D.hinge[1]);
  }
  return best;
}
