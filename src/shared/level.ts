// "The Golden Road" — the original continuous course. Worlds 1-3 and 6 (src/shared/maps/course.ts) are built on it.
// Shared by the server (colliders, triggers) and the client (visuals), so both always agree.
// Coordinates: Y up, course runs toward -Z. Units ~ meters.

export type V2 = [number, number];
export type V3 = [number, number, number];

export type Mat =
  | 'grass'
  | 'stone'
  | 'wood'
  | 'plank'
  | 'darkwood'
  | 'rail'
  | 'gold'
  | 'cliff'
  | 'path'
  | 'teal'
  | 'invisible';

/** solid: blocks everything; cargo: blocks only the artifact; player: blocks only couriers; none: visual only */
export type Collide = 'solid' | 'cargo' | 'player' | 'none';

export interface IslandDef {
  id: string;
  pts: V2[]; // convex polygon (x,z) used for visuals
  rect: { cx: number; cz: number; hx: number; hz: number; ch: [number, number, number, number] }; // chamfers: front-left, front-right, back-right, back-left
  top: number;
  thick: number; // collider thickness below the top
  depth: number; // decorative rocky underside depth
  seed: number;
  style?: 'grass' | 'stone';
}

export interface BoxDef {
  id?: string;
  p: V3; // center
  s: V3; // full size
  rot?: V3; // euler XYZ (radians)
  mat: Mat;
  collide?: Collide;
  occluder?: boolean;
  tag?: string;
  /** gameplay-owned visual (render/Mechanisms.tsx draws it; pair with mat 'invisible') */
  vis?: 'loadDock' | 'crate' | 'hedge' | 'shroomRim' | 'shroomCap' | 'shroomStem' | 'station' | 'signalBox' | 'cranePad';
}

export interface WindZone {
  id: string;
  kind: 'wind' | 'fan';
  min: V3;
  max: V3;
  dir: V3;
  force: number;
  period: number;
  calm: number;
  windup: number;
  offset: number;
}

export interface CheckpointDef {
  id: number;
  name: string;
  trigger: { min: V3; max: V3 };
  artifact: V3;
  players: [V3, V3, V3];
  flag: V3;
  /** mechanisms put in their solved state when a run starts here (dev warps) */
  solve?: string[];
  /** where the rail cart waits when the artifact is recalled here: legs ridden + branch (World 5) */
  cart?: { ridden: number; branch?: number };
}

export interface AnchorDef {
  p: V3;
  cp: number;
  /** only usable once this signal is on (e.g. the gate that leads there is open) */
  req?: string;
}

export interface ChapterDef {
  name: string;
  sub: string;
}

// ---------------------------------------------------------------- helpers

/** Chamfered rectangle island. Front = +Z (toward the camera). */
function island(
  id: string,
  cx: number,
  cz: number,
  hx: number,
  hz: number,
  ch: [number, number, number, number],
  top: number,
  thick: number,
  depth: number,
  seed: number,
  style?: 'grass' | 'stone',
) {
  islands.push(chamferIsland(id, cx, cz, hx, hz, ch, top, thick, depth, seed, style));
}

/** Chamfered-rectangle island definition (shared by every map's level data). */
export function chamferIsland(
  id: string,
  cx: number,
  cz: number,
  hx: number,
  hz: number,
  ch: [number, number, number, number],
  top: number,
  thick: number,
  depth: number,
  seed: number,
  style?: 'grass' | 'stone',
): IslandDef {
  const [fl, fr, br, bl] = ch;
  const pts: V2[] = [];
  const push = (x: number, z: number) => {
    const last = pts[pts.length - 1];
    if (!last || Math.abs(last[0] - x) > 1e-6 || Math.abs(last[1] - z) > 1e-6) pts.push([x, z]);
  };
  push(cx - hx + fl, cz + hz);
  push(cx + hx - fr, cz + hz);
  push(cx + hx, cz + hz - fr);
  push(cx + hx, cz - hz + br);
  push(cx + hx - br, cz - hz);
  push(cx - hx + bl, cz - hz);
  push(cx - hx, cz - hz + bl);
  push(cx - hx, cz + hz - fl);
  if (Math.abs(pts[0][0] - pts[pts.length - 1][0]) < 1e-6 && Math.abs(pts[0][1] - pts[pts.length - 1][1]) < 1e-6) pts.pop();
  return { id, pts, rect: { cx, cz, hx, hz, ch }, top, thick, depth, seed, style };
}

/** Solid boxes that exactly cover a chamfered-rect island (robust contacts; no convex hulls). */
export function islandBoxes(isl: IslandDef): { p: V3; s: V3; yaw: number }[] {
  const { cx, cz, hx, hz, ch } = isl.rect;
  const yc = isl.top - isl.thick / 2;
  const out: { p: V3; s: V3; yaw: number }[] = [];
  const maxF = Math.max(ch[0], ch[1]);
  const maxB = Math.max(ch[2], ch[3]);
  const maxL = Math.max(ch[0], ch[3]);
  const maxR = Math.max(ch[1], ch[2]);
  // full-width band (between front/back chamfers)
  const z0 = cz - hz + maxB;
  const z1 = cz + hz - maxF;
  out.push({ p: [cx, yc, (z0 + z1) / 2], s: [hx * 2, isl.thick, z1 - z0], yaw: 0 });
  // full-depth band (between left/right chamfers)
  const x0 = cx - hx + maxL;
  const x1 = cx + hx - maxR;
  out.push({ p: [(x0 + x1) / 2, yc, cz], s: [x1 - x0, isl.thick, hz * 2], yaw: 0 });
  // fill remaining rectangles + chamfer triangles per corner
  const corners: [number, number, number][] = [
    [-1, 1, ch[0]],
    [1, 1, ch[1]],
    [1, -1, ch[2]],
    [-1, -1, ch[3]],
  ];
  for (const [sx, sz, c] of corners) {
    const ex = sx < 0 ? maxL : maxR;
    const ez = sz > 0 ? maxF : maxB;
    // corner region (ex by ez) minus its chamfer triangle (c by c): cover with two strips + a rotated box
    const cxr = cx + sx * (hx - ex / 2);
    const czr = cz + sz * (hz - ez / 2);
    if (ex < 1e-6 || ez < 1e-6) continue;
    if (c <= 1e-6) {
      out.push({ p: [cxr, yc, czr], s: [ex, isl.thick, ez], yaw: 0 });
      continue;
    }
    if (ex - c > 1e-6) out.push({ p: [cx + sx * (hx - ex + (ex - c) / 2), yc, czr], s: [ex - c, isl.thick, ez], yaw: 0 });
    if (ez - c > 1e-6) out.push({ p: [cx + sx * (hx - c / 2), yc, cz + sz * (hz - ez + (ez - c) / 2)], s: [c, isl.thick, ez - c], yaw: 0 });
    // chamfer triangle: points A (on the side edge) and B (on the front/back edge)
    const ax = cx + sx * hx, az = cz + sz * (hz - c);
    const bx = cx + sx * (hx - c), bz = cz + sz * hz;
    const L = Math.hypot(bx - ax, bz - az);
    const d = c / Math.SQRT2;
    const nx = -sx / Math.SQRT2, nz = -sz / Math.SQRT2;
    const mx = (ax + bx) / 2 + (nx * d) / 2;
    const mz = (az + bz) / 2 + (nz * d) / 2;
    const dirx = (bx - ax) / L, dirz = (bz - az) / L;
    out.push({ p: [mx, yc, mz], s: [L, isl.thick, d], yaw: Math.atan2(-dirz, dirx) });
  }
  return out;
}

const boxes: BoxDef[] = [];
const islands: IslandDef[] = [];

function box(b: BoxDef) {
  boxes.push(b);
  return b;
}

/** Wooden bridge along -Z from z0 to z1 (z0 > z1) at deck height y. */
function bridge(id: string, x: number, z0: number, z1: number, y: number, width: number, rails = true) {
  const len = z0 - z1 + 0.4;
  const zc = (z0 + z1) / 2;
  box({ id: `${id}-deck`, p: [x, y - 0.2, zc], s: [width, 0.4, len], mat: 'plank', tag: 'bridge' });
  if (rails) {
    for (const side of [-1, 1]) {
      box({
        id: `${id}-rail${side}`,
        p: [x + side * (width / 2 + 0.15), y + 0.6, zc],
        s: [0.3, 1.2, len],
        mat: 'rail',
        tag: 'rail',
      });
    }
  }
}

/** Ramp whose TOP surface runs from a to b (both along -Z), with optional curbs. */
function ramp(id: string, a: V3, b: V3, width: number, curbs: { from: number; to: number }[] = [{ from: 0, to: 1 }], curbH = 0.9) {
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const L = Math.hypot(dy, dz);
  const theta = Math.atan2(dy, -dz);
  const thick = 0.8;
  const up: V3 = [0, Math.cos(theta), Math.sin(theta)];
  const mid: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  box({
    id: `${id}-deck`,
    p: [mid[0], mid[1] - (up[1] * thick) / 2, mid[2] - (up[2] * thick) / 2],
    s: [width, thick, L + 0.06],
    rot: [theta, 0, 0],
    mat: 'path',
    tag: 'ramp',
  });
  for (const c of curbs) {
    const t0 = c.from;
    const t1 = c.to;
    const segL = L * (t1 - t0);
    const tm = (t0 + t1) / 2;
    const cy = a[1] + dy * tm;
    const cz = a[2] + dz * tm;
    for (const side of [-1, 1]) {
      box({
        id: `${id}-curb${side}-${t0}`,
        p: [mid[0] + side * (width / 2 + 0.2), cy + (up[1] * curbH) / 2, cz + (up[2] * curbH) / 2],
        s: [0.4, curbH, segL],
        rot: [theta, 0, 0],
        mat: 'stone',
        tag: 'curb',
      });
    }
  }
}

// ---------------------------------------------------------------- Chapter 1: Royal Loading Dock
island('A', 0, -1, 10, 11, [3, 3, 3, 3], 0, 2, 11, 1);

// gate palisade across island A
box({ id: 'gateWallL', p: [-6.5, 1.6, -8.5], s: [8, 3.2, 1], mat: 'darkwood', occluder: true, tag: 'palisade' });
box({ id: 'gateWallR', p: [6.5, 1.6, -8.5], s: [8, 3.2, 1], mat: 'darkwood', occluder: true, tag: 'palisade' });

bridge('bAB', 0, -12, -19, 0, 5.2);

island('B', 0, -28.5, 9.5, 9.5, [3, 3, 3, 3], 0, 2, 10, 2);

// low arch tunnel: 1.45m clearance, 4m wide, 3m deep
box({ id: 'archL', p: [-6, 2, -26.5], s: [8, 4, 3], mat: 'stone', occluder: true, tag: 'archwall' });
box({ id: 'archR', p: [6, 2, -26.5], s: [8, 4, 3], mat: 'stone', occluder: true, tag: 'archwall' });
box({ id: 'archTop', p: [0, 2.725, -26.5], s: [4, 2.55, 3], mat: 'stone', occluder: true, tag: 'archtop' });
// gentle funnel posts to guide the beam into the tunnel
box({ id: 'funL', p: [-3.1, 0.5, -23.6], s: [0.5, 1, 2.4], rot: [0, -0.5, 0], mat: 'stone', tag: 'funnel' });
box({ id: 'funR', p: [3.1, 0.5, -23.6], s: [0.5, 1, 2.4], rot: [0, 0.5, 0], mat: 'stone', tag: 'funnel' });

// B -> C: the wobbly wind bridge (a mechanism of World 2, see maps/course.ts) spans z -38..-45

// World 1 finale: the raised royal loading dock (CUBE pilot hop) with a crate stack for a royal stamp
box({ id: 'loadDock', p: [5.0, 0.55, -34.6], s: [4.8, 1.1, 4.8], mat: 'invisible', vis: 'loadDock', tag: 'ledge' });
box({ id: 'dockCrates', p: [6.6, 1.75, -36.2], s: [1.2, 1.3, 1.2], mat: 'invisible', vis: 'crate', tag: 'ledge' });

// ---------------------------------------------------------------- Chapter 2: Windbridge Cliffs
island('C', 0, -53.5, 10, 8.5, [3, 3, 0, 0], 0, 2, 12, 3);
// courier catwalk across the gap (players only — a cargo barrier blocks the artifact)
bridge('catwalk', 6.3, -61.7, -65.6, 0, 2.6);
box({ id: 'cargoBarrier', p: [6.3, 1.5, -61.0], s: [3.6, 3.0, 0.3], mat: 'invisible', collide: 'cargo', tag: 'cargoBarrier' });
// receiver brackets (golden posts) along the gap edge
box({ id: 'recvL', p: [-5.45, 0.3, -60.6], s: [0.5, 0.6, 1.3], mat: 'gold', tag: 'bracket' });
box({ id: 'recvR', p: [0.45, 0.3, -60.6], s: [0.5, 0.6, 1.3], mat: 'gold', tag: 'bracket' });
// sparse wind fence posts on the windward-exposed left edge
for (const z of [-50, -54, -58]) {
  box({ id: `windPost${z}`, p: [-9.5, 0.7, z], s: [0.5, 1.4, 0.5], mat: 'darkwood', tag: 'post' });
}

island('D', 0, -73.15, 10, 7.85, [0, 0, 3, 3], 0, 2, 12, 4);

// World 2 gust gauntlet: stone windbreaks shelter a lane on the open cliff, plus a high ridge for royal stamps
box({ id: 'windbreak1', p: [-1.2, 1.2, -68.1], s: [0.7, 2.4, 3.0], mat: 'stone', tag: 'curb' });
box({ id: 'windbreak2', p: [-1.2, 1.2, -74.5], s: [0.7, 2.4, 3.0], mat: 'stone', tag: 'curb' });
box({ id: 'windbreak3', p: [-1.2, 1.2, -79.7], s: [0.7, 2.4, 2.2], mat: 'stone', tag: 'curb' });
box({ id: 'ridge', p: [9.0, 1.2, -70.5], s: [1.2, 2.4, 8.0], mat: 'stone', tag: 'curb' });

// D -> E: the Clock Hand (a rotating plank, World 3) carries the team across z -81..-87

// ---------------------------------------------------------------- Chapter 3: The Crooked Tower
island('E', 0, -95.5, 10, 8.5, [3, 3, 0, 0], 0, 2, 11, 5);
// the upper island doubles as the tall cliff wall carrying the lever
island('F', 0, -110, 10, 6, [0, 0, 0, 0], 8, 9, 12, 6, 'stone');
// rails on island F's back edge between/around the two descent routes
box({ id: 'fRailMid', p: [-0.25, 8.5, -115.8], s: [5.1, 1.0, 0.4], mat: 'stone', tag: 'curb' });
box({ id: 'fRailR', p: [8.85, 8.5, -115.8], s: [2.3, 1.0, 0.4], mat: 'stone', tag: 'curb' });
box({ id: 'fRailL', p: [-9.6, 8.5, -115.8], s: [0.8, 1.0, 0.4], mat: 'stone', tag: 'curb' });

// ---------------------------------------------------------------- Chapter 4: Castle Dash
// left: safe switchback with curbs and a flat landing
ramp('rL1', [-6, 8, -116], [-6, 4.5, -130], 6);
island('L', -6, -133.5, 4, 3.5, [1, 1, 1, 1], 4.5, 1.6, 6, 7);
box({ id: 'lRailL', p: [-10.2, 5.1, -133.5], s: [0.4, 1.2, 7], mat: 'stone', tag: 'curb' });
box({ id: 'lRailR', p: [-1.8, 5.1, -133.5], s: [0.4, 1.2, 7], mat: 'stone', tag: 'curb' });
ramp('rL2', [-6, 4.5, -137], [-6, 0, -152], 6);
// right: fast chute, no curbs in the fan section
ramp('rR', [5, 8, -116], [5, 0, -152], 5, [
  { from: 0, to: 0.22 },
  { from: 0.72, to: 1 },
]);

island('G', 0, -161, 12, 9, [2.5, 2.5, 2.5, 2.5], 0, 2, 12, 8);
box({ id: 'plazaRailL', p: [-12.1, 0.7, -161], s: [0.5, 1.4, 13], mat: 'stone', tag: 'curb' });
box({ id: 'plazaRailR', p: [12.1, 0.7, -161], s: [0.5, 1.4, 13], mat: 'stone', tag: 'curb' });
box({ id: 'plazaRailMid', p: [-0.25, 0.6, -152.2], s: [5.4, 1.2, 0.4], mat: 'stone', tag: 'curb' });
box({ id: 'plazaRailFL', p: [-10.6, 0.6, -152.4], s: [2.2, 1.2, 0.4], mat: 'stone', tag: 'curb' });
box({ id: 'plazaRailFR', p: [9.9, 0.6, -152.4], s: [4.4, 1.2, 0.4], mat: 'stone', tag: 'curb' });
box({ id: 'castleWall', p: [0, 3, -170.6], s: [26, 6, 1.2], mat: 'stone', tag: 'castlewall' });
// World 6 royal courtyard: hedges + a cargo-only portcullis (couriers squeeze through) around the delivery ring
box({ id: 'hedgeL', p: [-5.9, 0.55, -163.35], s: [0.8, 1.1, 13.1], mat: 'invisible', vis: 'hedge', tag: 'hedge' });
box({ id: 'hedgeR', p: [5.9, 0.55, -163.35], s: [0.8, 1.1, 13.1], mat: 'invisible', vis: 'hedge', tag: 'hedge' });

// ---------------------------------------------------------------- export

export const LEVEL = {
  islands,
  boxes,
  /** decoration keep-out rectangles (x0, z0, x1, z1) for gameplay areas added after the original scenery pass */
  decorKeepOut: [
    [2.0, -31.6, 8.0, -37.6],
    [-8, -19.5, -4.2, -23.8],
    [-2.2, -65.6, 10.4, -81],
    [-9.8, -96.8, -6.4, -100.4],
  ] as [number, number, number, number][],
  spawn: {
    artifact: [0, 1.02, 2.5] as V3,
    players: [
      [-2.6, 0, 6.5],
      [0, 0, 7.2],
      [2.6, 0, 6.5],
    ] as V3[],
  },
  plate: { p: [0, 0, -3.5] as V3, s: [4, 4] as V2, trigger: { p: [0, 0.5, -3.5] as V3, h: [1.9, 0.5, 1.9] as V3 }, hold: 0.9 },
  gate: { p: [0, 1.5, -8.5] as V3, s: [5.0, 3.0, 0.6] as V3, drop: 3.15, time: 1.4 },
  receiver: {
    p: [-2.5, 0, -60.6] as V3,
    yaw: 0,
    zone: { min: [-3.8, -1, -61.5] as V3, max: [-1.2, 1.6, -59.8] as V3 },
    hold: 1.0,
  },
  drawbridge: { hinge: [-2.5, 0, -65.3] as V3, len: 3.65, width: 7.0, thick: 0.4, curb: 0.45, time: 2.0 },
  lever: { p: [-4.5, 3.9, -104] as V3, trigger: { p: [-4.5, 3.95, -103.45] as V3, h: [0.75, 0.55, 0.5] as V3 } },
  lift: { cx: 4.6, cz: -100.9, w: 6, d: 6, bottom: 0, top: 8, railH: 1.2, time: 5.5, board: 1.2 },
  goal: { p: [0, 0, -161] as V3, r: 3.6 },
  windZones: [
    {
      id: 'cliffWind',
      kind: 'wind',
      min: [-13, -6, -66.5],
      max: [13, 12, -45.5],
      dir: [-1, 0, 0],
      force: 58,
      period: 6.5,
      calm: 3.0,
      windup: 0.9,
      offset: 0,
    },
    {
      id: 'bigFan',
      kind: 'fan',
      min: [2, -4, -142],
      max: [9.5, 12, -124],
      dir: [-1, 0, 0],
      force: 64,
      period: 5.2,
      calm: 2.2,
      windup: 0.7,
      offset: 1.3,
    },
  ] as WindZone[],
  checkpoints: [
    {
      id: 0,
      name: 'Royal Loading Dock',
      trigger: { min: [-99, -99, -99], max: [-98, -98, -98] },
      artifact: [0, 1.02, 2.5],
      players: [
        [-2.6, 0, 6.5],
        [0, 0, 7.2],
        [2.6, 0, 6.5],
      ],
      flag: [6.5, 0, 6],
    },
    {
      id: 1,
      name: 'Past the Low Arch',
      trigger: { min: [-9.5, -2, -38], max: [9.5, 6, -29.2] },
      artifact: [0, 1.02, -33.5],
      players: [
        [-3, 0, -30.6],
        [0, 0, -30.4],
        [3, 0, -30.6],
      ],
      flag: [-6.5, 0, -31],
    },
    {
      id: 2,
      name: 'Windbridge Landing',
      trigger: { min: [-10, -2, -81], max: [10, 6, -66.8] },
      artifact: [-1, 1.02, -71],
      players: [
        [-4, 0, -68.6],
        [2, 0, -68.6],
        [4.5, 0, -72],
      ],
      flag: [6.5, 0, -68.5],
    },
    {
      id: 3,
      name: 'Top of the Tower',
      trigger: { min: [-10, 6, -116], max: [10, 14, -104.3] },
      artifact: [-3, 9.02, -109.5],
      players: [
        [-6, 8, -107],
        [0, 8, -107],
        [-3, 8, -113],
      ],
      flag: [-7.5, 8, -106],
    },
  ] as CheckpointDef[],
  anchors: [
    { p: [0, 0, 6], cp: 0 },
    { p: [-5, 0, -2], cp: 0 },
    { p: [5, 0, -2], cp: 0 },
    { p: [-3.5, 0, -10.6], cp: 0, req: 'gate' },
    { p: [-4.5, 0, -22], cp: 0, req: 'gate' },
    { p: [4.5, 0, -22], cp: 0, req: 'gate' },
    { p: [-4, 0, -31], cp: 1 },
    { p: [4, 0, -35], cp: 1 },
    { p: [-2, 0, -48], cp: 1 },
    { p: [3, 0, -54], cp: 1 },
    { p: [6.3, 0, -59], cp: 1 },
    { p: [-3, 0, -70], cp: 2 },
    { p: [4, 0, -76], cp: 2 },
    { p: [-3, 0, -90], cp: 2 },
    { p: [-6, 0, -98], cp: 2 },
    { p: [4, 0, -93], cp: 2 },
    { p: [-4, 8, -108], cp: 3 },
    { p: [4, 8, -110], cp: 3 },
    { p: [-6, 4.5, -133.5], cp: 3 },
    { p: [-6, 0, -156], cp: 3 },
    { p: [5, 0, -156], cp: 3 },
  ] as AnchorDef[],
  /** preferred long-axis yaw for LONG when shifting inside a zone (default: along the course, yaw = PI/2) */
  longAxisZones: [{ min: [-12, -66.5] as V2, max: [12, -44.5] as V2, yaw: 0 }],
  chapters: [
    { name: 'Royal Loading Dock', sub: 'Chapter 1' },
    { name: 'Windbridge Cliffs', sub: 'Chapter 2' },
    { name: 'The Crooked Tower', sub: 'Chapter 3' },
    { name: 'Castle Dash', sub: 'Chapter 4' },
  ] as ChapterDef[],
};

export type Level = typeof LEVEL;

/** Which chapter (0..3) a team is in, based on artifact position + checkpoint. */
export function chapterAt(z: number, cp: number): number {
  if (cp >= 3) return 3;
  if (z < -83) return 2;
  if (z < -41.5) return 1;
  return 0;
}

/** Wind gust strength in [-1, 1] at sim time t (s). Negative = wind-up warning, positive = active gust. */
export function windStrength(zone: WindZone, t: number): number {
  const ph = (((t + zone.offset) % zone.period) + zone.period) % zone.period;
  if (ph < zone.calm) return 0;
  if (ph < zone.calm + zone.windup) return -((ph - zone.calm) / zone.windup);
  const g = (ph - zone.calm - zone.windup) / (zone.period - zone.calm - zone.windup);
  // quick rise, gentle fall
  return Math.min(1, g * 6) * (1 - Math.pow(g, 3) * 0.6);
}

export function windCycleIndex(zone: WindZone, t: number): number {
  return Math.floor((t + zone.offset) / zone.period);
}

export function inBox(p: { x: number; y: number; z: number }, min: V3, max: V3) {
  return p.x >= min[0] && p.x <= max[0] && p.y >= min[1] && p.y <= max[1] && p.z >= min[2] && p.z <= max[2];
}

/** Drawbridge hinge rotation (about X) for unfold amount u (0 = raised, 1 = lowered). */
export function drawbridgeAngle(u: number) {
  return -Math.PI / 2 * (1 - u);
}

export function easeOutBack(t: number) {
  const c1 = 1.4;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export function smooth(t: number) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}
