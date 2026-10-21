// The four forms of the golden artifact. One rigid body, one active collider.

export const ShapeId = { CUBE: 0, LONG: 1, TALL: 2, ROUND: 3 } as const;
export type ShapeId = (typeof ShapeId)[keyof typeof ShapeId];

export interface ShapeSpec {
  id: ShapeId;
  key: string;
  name: string;
  /** half extents for boxes; for ROUND all three equal the radius */
  half: [number, number, number];
  ball: boolean;
  friction: number;
  restitution: number;
  angularDamping: number;
  /** extra viscous horizontal drag (1/s) applied while grounded */
  groundDrag: number;
  /** multiplier on wind / fan forces */
  wind: number;
  /** lever arm (m) along the long axis at which wind pushes (creates yaw torque) */
  windArm: number;
  /** extra yaw damping (N·m·s) while grounded — high = pushes stay straight */
  yawDamp: number;
  maxSpeed: number;
  pro: string;
  con: string;
  /** piloting: what WASD does, the Space ability, its cooldown (s) and a one-line tradeoff */
  pilotMove: string;
  ability: string;
  abilityCd: number;
  pilotTip: string;
}

export const SHAPES: ShapeSpec[] = [
  {
    id: ShapeId.CUBE,
    key: '1',
    name: 'CUBE',
    half: [1.0, 1.0, 1.0],
    ball: false,
    friction: 0.12,
    restitution: 0.02,
    angularDamping: 2.5,
    groundDrag: 10,
    wind: 0.22,
    windArm: 0,
    yawDamp: 60,
    maxSpeed: 5.5,
    pro: 'Stable, steady to push, shrugs off wind',
    con: 'Too tall for low arches, can’t fit sockets',
    pilotMove: 'scoot',
    ability: 'Hop',
    abilityCd: 1.0,
    pilotTip: 'Hops up ledges — the landing shoves everyone nearby',
  },
  {
    id: ShapeId.LONG,
    key: '2',
    name: 'LONG',
    half: [2.35, 0.38, 0.55],
    ball: false,
    friction: 0.1,
    restitution: 0.02,
    angularDamping: 1.6,
    groundDrag: 8,
    wind: 1.0,
    windArm: 1.6,
    yawDamp: 7,
    maxSpeed: 5.5,
    pro: 'Slides under low arches, slots into receivers',
    con: 'Turns slowly, wind spins it around',
    pilotMove: 'nudge',
    ability: 'Swing 90°',
    abilityCd: 0.9,
    pilotTip: 'Swings around (A/D picks the side) — and keeps swinging',
  },
  {
    id: ShapeId.TALL,
    key: '3',
    name: 'TALL',
    half: [0.55, 2.2, 0.55],
    ball: false,
    friction: 0.2,
    restitution: 0.02,
    angularDamping: 0.2,
    groundDrag: 7.5,
    wind: 0.75,
    windArm: 0,
    yawDamp: 8,
    maxSpeed: 5.0,
    pro: 'Reaches high levers and ledges',
    con: 'Top-heavy — tips unless two hold it (E)',
    pilotMove: 'waddle + lean',
    ability: 'Brace',
    abilityCd: 2.2,
    pilotTip: 'Leans toward WASD; two holders let it lean further',
  },
  {
    id: ShapeId.ROUND,
    key: '4',
    name: 'ROUND',
    half: [1.05, 1.05, 1.05],
    ball: true,
    friction: 0.6,
    restitution: 0.12,
    angularDamping: 0.3,
    groundDrag: 0.18,
    wind: 0.3,
    windArm: 0,
    yawDamp: 0,
    maxSpeed: 9.5,
    pro: 'Rolls fast, glides down slopes',
    con: 'Hard to stop or steer near edges',
    pilotMove: 'roll (steer back to brake)',
    ability: 'Boost',
    abilityCd: 2.8,
    pilotTip: 'Fast and slippery — brake early near edges',
  },
];

export function shapeSpec(id: number): ShapeSpec {
  return SHAPES[id] ?? SHAPES[0];
}

/** Bounding radius of a shape (for coarse distance checks). */
export function shapeRadius(id: number): number {
  const s = shapeSpec(id);
  if (s.ball) return s.half[0];
  return Math.hypot(s.half[0], s.half[1], s.half[2]);
}
