// Declarative map + mechanism definitions shared by the server (colliders, rules) and the client (visuals, HUD).
// A map is data: islands/boxes, spawns, checkpoints, a goal, objectives and a list of mechanisms wired by signals.
import type { AnchorDef, BoxDef, CheckpointDef, IslandDef, V2, V3, WindZone } from '../level';

export type MapId = 'dock' | 'windbridge' | 'clockwork' | 'mushroom' | 'railway' | 'castle';

interface Base {
  /** unique within the map; also the name of the boolean signal this mechanism emits */
  id: string;
  /** owning map for shared (course-wide) mechanisms; only the owner's Sim runs it live */
  map?: MapId;
  /** feeds a legacy WorldSnap field so the original Chapter visuals keep working */
  legacy?: 'plate' | 'gate' | 'recv' | 'bridge' | 'lever' | 'lift' | 'wind' | 'fan';
}

/** Pressure plate. Emits while pressed long enough (latched by default). */
export interface PlateDef extends Base {
  kind: 'plate';
  p: V3; // centre on the floor
  size: V2; // visual pad size (x, z)
  trigger: { p: V3; h: V3 }; // half extents
  hold: number;
  by: 'artifact' | 'players' | 'any';
  /** couriers needed when `by` includes players (scaled down when fewer are playing) */
  need?: number;
  shapes?: number[];
  latch?: boolean;
}

/** Sliding gate (drops into the floor while its signal is on; closes again only if unlatched and clear). */
export interface GateDef extends Base {
  kind: 'gate';
  p: V3;
  s: V3;
  drop: number;
  time: number;
  when: string;
  /** keep open forever once opened */
  latch?: boolean;
  /** 'solid' blocks everything; 'cargo' only the artifact (couriers squeeze between the bars) */
  collide?: 'solid' | 'cargo';
  style?: 'wood' | 'portcullis';
}

/** Artifact socket: the right form, roughly aligned, slow, inside the zone for `hold` seconds. */
export interface DockDef extends Base {
  kind: 'dock';
  p: V3;
  yaw: number;
  zone: { min: V3; max: V3 };
  shape: number;
  hold: number;
  magnet: boolean;
  yawTol: number;
  maxSpeed: number;
}

export interface DrawbridgeDef extends Base {
  kind: 'drawbridge';
  hinge: V3;
  len: number;
  width: number;
  thick: number;
  curb: number;
  time: number;
  when: string;
}

/** Wall lever thrown by an upright artifact (TALL) pressed into it. */
export interface PushLeverDef extends Base {
  kind: 'pushLever';
  p: V3;
  trigger: { p: V3; h: V3 };
  hold: number;
  upright: number;
}

/** Lift: armed by `when`; rises once the artifact and every courier are aboard and someone cranks it (Q). */
export interface LiftDef extends Base {
  kind: 'lift';
  cx: number;
  cz: number;
  w: number;
  d: number;
  bottom: number;
  top: number;
  railH: number;
  time: number;
  board: number;
  when: string;
  /** crank handle on the deck (local offset from the deck centre); omit for the automatic start */
  crank?: V3;
  /** signal that releases the brake: then the lift winds up on its own after the crank start */
  brake?: string;
}

/** Gusting wind volume; `when` / `unless` route it through a switch (windmill valve). */
export interface WindDef extends Base {
  kind: 'wind';
  zone: WindZone;
  when?: string;
  unless?: string;
  /** areas inside the zone sheltered by walls */
  shelters?: { min: V3; max: V3 }[];
  /** couriers feel this fraction of the push */
  players?: number;
}

/** Something to use with Q: toggle lever, hold handle, timed crank, charge winch or multi-position selector. */
export interface SwitchDef extends Base {
  kind: 'switch';
  p: V3;
  yaw?: number;
  radius: number;
  mode: 'toggle' | 'hold' | 'timed' | 'charge' | 'select' | 'pump';
  /** timed: seconds it stays on; charge: seconds of holding Q; select: number of positions */
  time?: number;
  positions?: number;
  /** couriers that must hold at once (hold mode) */
  need?: number;
  label: string;
  /** labels per state (off/on or per position) */
  states?: string[];
  style?: 'lever' | 'crank' | 'wheel' | 'button';
  /** only usable while this signal is on */
  enabledBy?: string;
}

/** Launch pad (spring, bouncy mushroom). Launch is a velocity; `aim` picks among vectors by a selector switch. */
export interface SpringDef extends Base {
  kind: 'spring';
  p: V3;
  size: V2;
  launch: V3;
  /** launch for couriers (defaults to `launch`) */
  playerLaunch?: V3;
  affects: 'all' | 'players' | 'artifact';
  cooldown: number;
  /** multiplier per artifact form [CUBE, LONG, TALL, ROUND] */
  shapeScale?: number[];
  /** sideways kick per metre of off-centre landing (careful positioning matters) */
  offsetKick?: number;
  when?: string;
  aim?: { switch: string; launches: V3[] };
  style?: 'pad' | 'mushroom' | 'bigmushroom';
}

/** Kinematic platform along a path (ping-pong or loop). Couriers and the artifact ride it. */
export interface MoverDef extends Base {
  kind: 'mover';
  s: V3;
  path: V3[];
  speed: number;
  mode: 'pingpong' | 'loop';
  pause?: number;
  when?: string;
  offset?: number;
  style?: 'plank' | 'cap' | 'gear' | 'cart';
}

/** Kinematic rotor about a vertical axis: turntables, clock hands, turnstiles. Parts are boxes in local space. */
export interface RotorDef extends Base {
  kind: 'rotor';
  p: V3;
  parts: { s: V3; o: V3; walk?: boolean }[];
  speed: number;
  when?: string;
  /** stops while this signal is on (a brake) */
  unless?: string;
  phase?: number;
  style?: 'turnstile' | 'clockhand' | 'gear';
}

/** Bridge deck that rolls about its length under off-centre load and wind (scripted spring-damper). */
export interface WobbleDef extends Base {
  kind: 'wobble';
  p: V3; // deck top centre
  s: V3; // width (x), thickness (y), length (z)
  maxTilt: number;
  stiffness: number;
  damping: number;
  rails?: number; // rail height (couriers only), 0 = none
  wind?: string; // wind mechanism id that rocks it
}

/** Slippery ground: couriers lose grip, the artifact glides. */
export interface SlipDef extends Base {
  kind: 'slip';
  min: V3;
  max: V3;
  grip: number; // courier ground acceleration multiplier
  drag: number; // artifact ground drag multiplier
}

/** Giant puffball: telegraphed swell, then a harmless burst that shoves couriers (and nudges the artifact). */
export interface PufferDef extends Base {
  kind: 'puffer';
  p: V3;
  radius: number;
  period: number;
  windup: number;
  offset: number;
  impulse: number;
}

/** Royal stamp / golden mushroom: touched by a courier (or the artifact) once. */
export interface CollectDef extends Base {
  kind: 'collect';
  p: V3;
  item: 'stamp' | 'mushroom';
  byArtifact?: boolean;
}

/** Wall or barricade that exists until a signal turns it off. */
export interface BlockerDef extends Base {
  kind: 'blocker';
  p: V3;
  s: V3;
  rotY?: number;
  collide: 'solid' | 'cargo' | 'player';
  until?: string;
  style?: 'barricade' | 'fence' | 'invisible' | 'wall';
  label?: string;
}

/** Signal logic. */
export interface LogicDef extends Base {
  kind: 'logic';
  op: 'and' | 'or';
  inputs: string[];
}

/** Volume that counts as falling off (couriers respawn, artifact is recalled). */
export interface HazardDef extends Base {
  kind: 'hazard';
  min: V3;
  max: V3;
}

/**
 * Rail cart with a cargo bed: rides one leg of track per departure. Leg 0 is `track`; after that the `junction`
 * selector picks one of `branches`. A leg departs when its depart lever (`departs[leg]`) is on and the artifact sits in
 * the bed; the cart resets the lever on arrival. A branch flagged in `buffers` ends against a buffer stop: the cart's
 * signal (its id) pulses there, so a spring at the bed fires the cargo onward.
 */
export interface CartDef extends Base {
  kind: 'cart';
  track: V3[]; // rail-level points (first = station)
  branches?: V3[][];
  junction?: string;
  departs: string[];
  speed: number;
  branchSpeed?: number[];
  buffers?: number[]; // branch indices ending at a buffer stop
  bed: V3; // inner bed size (x width, y wall height, z length)
  floor: number; // bed floor height above the rail
}

/**
 * Jib crane with a magnet hook. Holding Q at the control runs the cycle: lower, grab, raise, swing, lower, release,
 * swing back. Letting go mid-swing with cargo flings it with the hook's speed (faster, less accurate).
 */
export interface CraneDef extends Base {
  kind: 'crane';
  pivot: V3;
  radius: number;
  hookTop: number; // hook height while swinging
  pickupY: number; // hook height when grabbing
  dropY: number; // hook height when releasing
  from: number; // pickup angle (rad): hook xz = pivot + radius * (cos a, sin a)
  to: number; // drop angle
  control: V3;
  cycle: number; // seconds for a full held cycle
}

export type MechDef =
  | PlateDef
  | GateDef
  | DockDef
  | DrawbridgeDef
  | PushLeverDef
  | LiftDef
  | WindDef
  | SwitchDef
  | SpringDef
  | MoverDef
  | RotorDef
  | WobbleDef
  | SlipDef
  | PufferDef
  | CollectDef
  | BlockerDef
  | LogicDef
  | HazardDef
  | CartDef
  | CraneDef;

export type MechKind = MechDef['kind'];

/** Objective conditions, evaluated by the server each tick. */
export type Cond =
  | { sig: string }
  | { cp: number }
  | { shape: number }
  | { pilot: true }
  | { goal: true }
  | { all: Cond[] }
  | { any: Cond[] }
  | { not: Cond };

export interface ObjectiveDef {
  text: string;
  /** move on once this is true */
  done: Cond;
  /** floating world label; `{pct:id}` in text is replaced with that mechanism's progress */
  hint?: { p: V3; text: string; progress?: string };
  /** suggest a form in the shape bar */
  shape?: number;
}

export interface CameraDef {
  pitch: number;
  lift: number;
  near: number;
  far: number;
  ahead: number;
  fov: number;
}

export interface MapDef {
  id: MapId;
  index: number;
  name: string;
  sub: string;
  theme: string;
  music: 'music_main' | 'music_alt';
  /** music playback rate (each world gets its own feel from the two CC0 loops) */
  musicRate?: number;
  /** built on the original continuous course (Astra's World + Scenery visuals) */
  course: boolean;
  islands: IslandDef[];
  boxes: BoxDef[];
  spawn: { artifact: V3; players: [V3, V3, V3]; shape?: number };
  checkpoints: CheckpointDef[];
  anchors: AnchorDef[];
  goal: { p: V3; r: number };
  mechs: MechDef[];
  objectives: ObjectiveDef[];
  /** seconds for the "good time" crown */
  par: number;
  /** optional challenge for the third crown */
  bonus: { label: string; stamps: number };
  /** shortcut flag set by passing through these zones with the artifact */
  shortcuts?: { id: string; label: string; min: V3; max: V3 }[];
  killY: number;
  longAxisZones: { min: V2; max: V2; yaw: number }[];
  /** artifact outside this box for a while is recalled for free */
  bounds?: { min: V3; max: V3 };
  camera: CameraDef;
}

export function inBox(p: { x: number; y: number; z: number }, min: V3, max: V3) {
  return p.x >= min[0] && p.x <= max[0] && p.y >= min[1] && p.y <= max[1] && p.z >= min[2] && p.z <= max[2];
}
