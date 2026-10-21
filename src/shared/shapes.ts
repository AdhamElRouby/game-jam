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
    pro: 'Steady to push. The wind barely moves it.',
    con: 'Too tall for low arches. Does not fit slots.',
    pilotMove: 'push',
    ability: 'Hop',
    abilityCd: 1.0,
    pilotTip: 'Hop up onto ledges. The landing knocks people back.',
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
    pro: 'Fits under low arches and into slots.',
    con: 'Turns slowly. The wind spins it around.',
    pilotMove: 'push',
    ability: 'Turn 90°',
    abilityCd: 0.9,
    pilotTip: 'Hold A or D with Space to pick the way it turns.',
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
    pro: 'Reaches high levers.',
    con: 'Falls over unless two players hold it (E).',
    pilotMove: 'walk + lean',
    ability: 'Stand up straight',
    abilityCd: 2.2,
    pilotTip: 'It leans where you steer. Space stops it falling.',
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
    pro: 'Rolls fast, great down slopes.',
    con: 'Hard to stop. Rolls off edges.',
    pilotMove: 'roll',
    ability: 'Boost',
    abilityCd: 2.8,
    pilotTip: 'Steer the other way to brake. Slow down near edges!',
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
