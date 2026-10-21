// Authoritative per-room simulation for ONE map: one Rapier world, three courier capsules, ONE artifact body,
// and the map's data-driven mechanisms (server/mechs.ts).
import RAPIER from '@dimforge/rapier3d-compat';
import { Samples } from './diagnostics';
import { approachVelocity } from '../src/shared/movement';
import * as C from '../src/shared/constants';
import { LEVEL, islandBoxes, type BoxDef, type IslandDef } from '../src/shared/level';
import { MAPS, mapOrder } from '../src/shared/maps';
import { inBox, type Cond, type MapDef } from '../src/shared/maps/types';
import { SHAPES, ShapeId, shapeSpec, type ShapeSpec } from '../src/shared/shapes';
import {
  add,
  axisDiff,
  clamp,
  cross,
  dot,
  hlen,
  invRotate,
  len,
  lerpAngle,
  quatEuler,
  quatYaw,
  r3,
  rotate,
  scale,
  sub,
  yawOfX,
  type Quat,
  type Vec,
} from '../src/shared/math';
import {
  BTN_SPRINT,
  BTN_USE,
  PF_CONNECTED,
  PF_GRIP,
  PF_GROUNDED,
  PF_MOVING,
  PF_ONMOVER,
  PF_PILOT,
  PF_RESPAWNING,
  PF_SPRINT,
  PF_TUMBLE,
  PF_USE,
  mapScore,
  type ArtifactSnap,
  type GameEvent,
  type PlayerSnap,
  type Results,
  type Snapshot,
  type WorldSnap,
} from '../src/shared/protocol';
import { Pilot } from './pilot';
import { CollectMech, CraneMech, HazardMech, SlipMech, SwitchMech, WindMech, makeMech, type Freeze, type Mech } from './mechs';

const IDENT: Quat = { x: 0, y: 0, z: 0, w: 1 };
const EDGE_R = 0.1;
const DOWN: Vec = { x: 0, y: -1, z: 0 };
const UP: Vec = { x: 0, y: 1, z: 0 };
const ZERO: Vec = { x: 0, y: 0, z: 0 };

const GROUND_FILTER_PLAYER = C.groups(C.G_PLAYER, C.G_STATIC | C.G_ARTIFACT | C.G_PLAYER_BARRIER);
const STATIC_FOR_ARTIFACT = C.groups(C.G_ARTIFACT, C.G_STATIC | C.G_CARGO_BARRIER);
const STATIC_ONLY = C.groups(C.G_ARTIFACT, C.G_STATIC);
const PLAYERS_ONLY = C.groups(C.G_ARTIFACT, C.G_PLAYER);
const WALKABLE_TAGS = new Set(['bridge', 'ramp', 'ledge']);

interface Grip {
  local: Vec; // anchor in artifact local space (boxes) or world offset (ball)
  ball: boolean;
  rest: number;
}

export interface PlayerBody {
  slot: number;
  name: string;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  mx: number;
  mz: number;
  grab: boolean;
  jumpCount: number;
  lastJumpCount: number;
  respawnCount: number;
  lastRespawnCount: number;
  jumpBuffer: number;
  coyote: number;
  grounded: boolean;
  yaw: number;
  grip: Grip | null;
  connected: boolean;
  respawnTimer: number;
  farTimer: number;
  lastShiftReq: number;
  lastSelfRespawn: number;
  airTime: number;
  pushing: boolean;
  lastActive: number;
  // piloting + extra buttons
  inside: boolean; // riding inside the artifact (body disabled)
  lastPilotToggle: number;
  pilotCount: number;
  lastPilotCount: number;
  useCount: number;
  lastUseCount: number;
  useHeld: boolean;
  sprint: boolean;
  tumble: number; // seconds left knocked over
  lastTumbleEv: number;
  launchT: number; // vertical speed cap lifted (spring launch)
  onMover: boolean;
  /** heading of the player's camera (radians, 0 = looking toward -Z): their left/right for LONG's swing and exits */
  camYaw: number;
  /** after a reconnect the client's counters restart: adopt them without treating the jump as a press */
  syncCounters: boolean;
  lastInputAt: number;
}

export interface SimOptions {
  names: string[];
  slots: number[]; // which slots are in play
  map?: MapDef;
}

export class Sim {
  readonly physicsStepMs = new Samples();
  readonly simulationStepMs = new Samples();
  world: RAPIER.World;
  map: MapDef;
  time = 0; // seconds of simulated time
  runTime = 0; // seconds while playing
  penalty = 0;
  events: GameEvent[] = [];
  players: (PlayerBody | null)[] = [null, null, null];

  artifact!: RAPIER.RigidBody;
  artCol!: RAPIER.Collider;
  shape: number = ShapeId.CUBE;
  lastShiftAt = -99;
  prevArtVel: Vec = { x: 0, y: 0, z: 0 };
  impactCooldown = 0;
  artGrounded = false;
  /** velocity of whatever the artifact rests on (moving platforms) */
  private artSupport: Vec = ZERO;
  pilot: Pilot;
  /** desired "up" for TALL's stabilizer (a pilot leans it; default straight up) */
  tallWant: Vec = UP;
  /** time of the last heavy landing (heavy plates react to it) */
  thumpAt = -99;
  /** vertical speed cap is lifted for this long after a launch (spring, hop) */
  private launchT = 0;
  private launchSpeed = 0;
  private noDragT = 0;
  private airT = 0;
  private minVy = 0;

  mechs: Mech[] = [];
  private mechIds = new Map<string, Mech>();
  private carriers = new Map<number, Mech>();
  private switches: SwitchMech[] = [];
  private winds: WindMech[] = [];
  private slips: SlipMech[] = [];
  private hazards: HazardMech[] = [];
  private collects: CollectMech[] = [];
  private cranes: CraneMech[] = [];
  /** a machine (crane hook) holds the artifact: it is kinematic and follows the hook */
  private locked = false;

  cp = 0;
  objective = 0;
  goalT = 0;
  finished = false;
  results: Results | null = null;
  shortcuts = new Set<string>();
  private outT = 0; // artifact outside the map bounds
  private stuck = { x: 0, z: 0, t: 0, warned: false };

  drops = 0;
  falls = 0;
  shifts = 0;
  resetVotes = new Map<number, number>();
  private names: string[];

  constructor(opts: SimOptions) {
    this.names = opts.names;
    this.map = opts.map ?? MAPS[0];
    this.pilot = new Pilot(this);
    this.world = new RAPIER.World({ x: 0, y: C.GRAVITY, z: 0 });
    this.world.timestep = C.TICK_DT;
    this.world.numSolverIterations = 6;
    this.buildStatic();
    this.buildMechs();
    this.createArtifact();
    for (const slot of opts.slots) this.createPlayer(slot, opts.names[slot] ?? C.SLOT_NAMES[slot]);
  }

  free() {
    this.world.free();
  }

  // ------------------------------------------------------------------ construction
  private buildStatic() {
    const fixed = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const islands: IslandDef[] = [...(this.map.course ? LEVEL.islands : []), ...this.map.islands];
    const boxes: BoxDef[] = [...(this.map.course ? LEVEL.boxes : []), ...this.map.boxes];
    for (const isl of islands) {
      for (const b of islandBoxes(isl)) {
        const desc = RAPIER.ColliderDesc.cuboid(b.s[0] / 2, b.s[1] / 2, b.s[2] / 2)
          .setTranslation(...b.p)
          .setRotation(quatYaw(b.yaw))
          .setFriction(1.0)
          .setCollisionGroups(C.groups(C.G_STATIC, C.G_PLAYER | C.G_ARTIFACT));
        this.world.createCollider(desc, fixed);
      }
    }
    for (const b of boxes) {
      const mode = b.collide ?? 'solid';
      if (mode === 'none') continue;
      const desc = RAPIER.ColliderDesc.cuboid(b.s[0] / 2, b.s[1] / 2, b.s[2] / 2).setTranslation(...b.p);
      if (b.rot) desc.setRotation(quatEuler(b.rot[0], b.rot[1], b.rot[2]));
      desc.setFriction(b.tag && WALKABLE_TAGS.has(b.tag) ? 1.0 : 0.15);
      if (mode === 'solid') desc.setCollisionGroups(C.groups(C.G_STATIC, C.G_PLAYER | C.G_ARTIFACT));
      else if (mode === 'cargo') desc.setCollisionGroups(C.groups(C.G_CARGO_BARRIER, C.G_ARTIFACT));
      else desc.setCollisionGroups(C.groups(C.G_PLAYER_BARRIER, C.G_PLAYER));
      this.world.createCollider(desc, fixed);
    }
  }

  private buildMechs() {
    const here = this.map.index;
    this.map.mechs.forEach((def, i) => {
      let freeze: Freeze = 'live';
      if (def.map && def.map !== this.map.id) freeze = mapOrder(def.map) < here ? 'solved' : 'initial';
      const m = makeMech(this, def, i, freeze);
      this.mechs.push(m);
      this.mechIds.set(def.id, m);
      if (m instanceof SwitchMech) this.switches.push(m);
      if (m instanceof WindMech) this.winds.push(m);
      if (m instanceof SlipMech) this.slips.push(m);
      if (m instanceof HazardMech) this.hazards.push(m);
      if (m instanceof CollectMech && freeze === 'live') this.collects.push(m);
      if (m instanceof CraneMech) this.cranes.push(m);
    });
    for (const m of this.mechs) m.build();
    for (const m of this.mechs) if (m.freeze === 'solved') m.solve();
  }

  private artifactColliderDesc(spec: ShapeSpec) {
    // rounded edges (same outer size) so the box glides over flush seams between deck/island colliders
    const r = EDGE_R;
    const desc = spec.ball
      ? RAPIER.ColliderDesc.ball(spec.half[0])
      : RAPIER.ColliderDesc.roundCuboid(spec.half[0] - r, spec.half[1] - r, spec.half[2] - r, r);
    if (spec.id === ShapeId.TALL) {
      // top-heavy pillar: raised center of mass makes it tip easily unless steadied
      const m = C.ARTIFACT_MASS;
      const [hx, hy, hz] = spec.half;
      const ix = (m * ((2 * hy) ** 2 + (2 * hz) ** 2)) / 12;
      const iz = (m * ((2 * hx) ** 2 + (2 * hy) ** 2)) / 12;
      const iy = (m * ((2 * hx) ** 2 + (2 * hz) ** 2)) / 12;
      desc.setMassProperties(m, { x: 0, y: 0.85, z: 0 }, { x: ix, y: iy, z: iz }, IDENT);
    } else desc.setMass(C.ARTIFACT_MASS);
    desc
      .setFriction(spec.friction)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
      .setRestitution(spec.restitution)
      .setCollisionGroups(C.groups(C.G_ARTIFACT, C.G_STATIC | C.G_PLAYER | C.G_CARGO_BARRIER));
    return desc;
  }

  private createArtifact() {
    const shape = this.map.spawn.shape ?? ShapeId.CUBE;
    const spec = shapeSpec(shape);
    const s = this.map.spawn.artifact;
    this.artifact = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(s[0], s[1], s[2])
        .setCcdEnabled(true)
        .setLinearDamping(0.05)
        .setAngularDamping(spec.angularDamping),
    );
    this.artCol = this.world.createCollider(this.artifactColliderDesc(spec), this.artifact);
    this.shape = shape;
  }

  private createPlayer(slot: number, name: string) {
    const sp = this.map.spawn.players[slot];
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(sp[0], sp[1] + C.PLAYER_CENTER_Y + 0.02, sp[2])
        .lockRotations()
        .setCcdEnabled(true)
        .setLinearDamping(0),
    );
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(C.PLAYER_HALF_HEIGHT, C.PLAYER_RADIUS)
        .setMass(C.PLAYER_MASS)
        .setFriction(0)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
        .setRestitution(0)
        .setCollisionGroups(C.groups(C.G_PLAYER, C.G_STATIC | C.G_ARTIFACT | C.G_PLAYER_BARRIER)),
      body,
    );
    this.players[slot] = {
      slot,
      name,
      body,
      collider,
      mx: 0,
      mz: 0,
      grab: false,
      jumpCount: 0,
      lastJumpCount: 0,
      respawnCount: 0,
      lastRespawnCount: 0,
      jumpBuffer: 0,
      coyote: 0,
      grounded: false,
      yaw: Math.PI,
      grip: null,
      connected: true,
      respawnTimer: 0,
      farTimer: 0,
      lastShiftReq: -99,
      lastSelfRespawn: -99,
      airTime: 0,
      pushing: false,
      lastActive: 0,
      inside: false,
      lastPilotToggle: -99,
      pilotCount: 0,
      lastPilotCount: 0,
      useCount: 0,
      lastUseCount: 0,
      useHeld: false,
      sprint: false,
      tumble: 0,
      lastTumbleEv: -99,
      launchT: 0,
      onMover: false,
      camYaw: 0,
      syncCounters: false,
      lastInputAt: -Infinity,
    };
  }

  // ------------------------------------------------------------------ signals + mechanism queries
  sig(id: string): boolean {
    return this.mechIds.get(id)?.on ?? false;
  }
  /** position of a selector switch (0 when unknown) */
  sel(id: string): number {
    const m = this.mechIds.get(id);
    return m instanceof SwitchMech ? m.value : 0;
  }
  mechById(id: string) {
    return this.mechIds.get(id);
  }
  registerCarrier(col: RAPIER.Collider, m: Mech) {
    this.carriers.set(col.handle, m);
  }
  stamps() {
    return this.collects.filter((c) => c.on).length;
  }
  stampTotal() {
    return this.collects.length;
  }

  // ------------------------------------------------------------------ inputs
  setInput(slot: number, mx: number, mz: number, jumpCount: number, grab: boolean, respawnCount: number, buttons = 0, pilotCount?: number, useCount?: number, camYaw?: number) {
    const p = this.players[slot];
    if (!p) return;
    p.lastInputAt = this.time;
    if (camYaw !== undefined && Number.isFinite(camYaw)) p.camYaw = camYaw;
    const m = Math.hypot(mx, mz);
    if (!Number.isFinite(m)) return;
    if (m > 1) {
      mx /= m;
      mz /= m;
    }
    const pc = pilotCount === undefined ? p.pilotCount : pilotCount | 0;
    const uc = useCount === undefined ? p.useCount : useCount | 0;
    if (p.syncCounters) {
      // first packet after a reconnect: adopt the fresh client's counters, no phantom presses
      p.syncCounters = false;
      p.lastJumpCount = jumpCount | 0;
      p.lastRespawnCount = respawnCount | 0;
      p.lastPilotCount = pc;
      p.lastUseCount = uc;
    }
    if (Math.hypot(mx, mz) > 0.1 || grab || (jumpCount | 0) !== p.jumpCount || pc !== p.pilotCount || uc !== p.useCount) p.lastActive = this.time;
    p.mx = mx;
    p.mz = mz;
    p.grab = grab;
    p.jumpCount = jumpCount | 0;
    p.respawnCount = respawnCount | 0;
    p.pilotCount = pc;
    p.useCount = uc;
    p.useHeld = (buttons & BTN_USE) !== 0;
    p.sprint = (buttons & BTN_SPRINT) !== 0;
  }

  setConnected(slot: number, connected: boolean) {
    const p = this.players[slot];
    if (!p) return;
    p.connected = connected;
    if (!connected) {
      // neutralize everything they were doing; a pilot stays inside (the room pauses) but stops steering
      p.mx = p.mz = 0;
      p.grab = false;
      p.useHeld = false;
      p.sprint = false;
      if (p.grip) {
        p.grip = null;
        this.events.push({ k: 'release', by: p.slot });
      }
    } else {
      p.syncCounters = true;
    }
  }

  /** Where a courier counts as being (a pilot is wherever the artifact is). */
  playerPos(p: PlayerBody): Vec {
    return p.inside ? this.artifact.translation() : p.body.translation();
  }

  activePlayers(): PlayerBody[] {
    return this.players.filter((p): p is PlayerBody => !!p && p.connected);
  }

  /** Couriers who must be present for "everyone" checks (lift, goal): connected and not AFK for 30s. */
  requiredPlayers(): PlayerBody[] {
    const act = this.activePlayers();
    const awake = act.filter((p) => this.time - p.lastActive < 30);
    return awake.length ? awake : act;
  }

  // ------------------------------------------------------------------ main step
  step(dt: number, playing: boolean) {
    const started = performance.now();
    this.time += dt;
    if (playing) this.runTime += dt;
    for (const m of this.mechs) m.pre(dt, playing);
    for (const p of this.players) if (p) this.updatePlayer(p, dt, playing);
    if (playing) this.updateBumps();
    this.updatePushers(dt);
    this.updateGrips(dt);
    this.updateArtifactForces(dt);
    for (const m of this.mechs) m.forces(dt, playing);
    this.pilot.update(dt, playing);
    // Rapier and game forces must advance by the same fixed dt.
    this.world.timestep = dt;
    const physicsStarted = performance.now();
    this.world.step();
    this.physicsStepMs.add(performance.now() - physicsStarted);
    this.postStep(dt, playing);
    this.simulationStepMs.add(performance.now() - started);
  }

  private castGround(p: PlayerBody) {
    const pos = p.body.translation();
    const start = { x: pos.x, y: pos.y - C.PLAYER_HALF_HEIGHT + 0.04, z: pos.z };
    const ball = new RAPIER.Ball(C.PLAYER_RADIUS * 0.9);
    const hit = this.world.castShape(
      start,
      IDENT,
      DOWN,
      ball,
      0,
      0.22,
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      GROUND_FILTER_PLAYER,
      p.collider,
      p.body,
    );
    return hit && hit.time_of_impact < 0.16 ? hit : null;
  }

  /** Wind push on a courier standing in a gust (m/s added to the walking target). */
  private windDrift(pos: Vec): Vec {
    let x = 0;
    let z = 0;
    for (const w of this.winds) {
      const d = w.drift(pos);
      x += d.x;
      z += d.z;
    }
    return { x, y: 0, z };
  }

  slipAt(pos: Vec) {
    for (const s of this.slips) if (s.contains(pos)) return s.def;
    return null;
  }

  private updatePlayer(p: PlayerBody, dt: number, playing: boolean) {
    // A live socket can stall for seconds before disconnecting. Do not keep its last direction/rope/use held.
    if (this.time - p.lastInputAt > 0.5) {
      p.mx = p.mz = 0;
      p.grab = p.useHeld = p.sprint = false;
    }
    const canAct = playing && p.connected && p.respawnTimer <= 0 && !this.finished;
    // F: hop in / out of the artifact
    if (p.pilotCount !== p.lastPilotCount) {
      p.lastPilotCount = p.pilotCount;
      if (canAct) this.pilot.toggle(p);
    }
    if (p.useCount !== p.lastUseCount) {
      p.lastUseCount = p.useCount;
      if (canAct && !p.inside) this.onUsePress(p);
    }
    if (p.respawnTimer > 0) p.respawnTimer -= dt;
    if (p.tumble > 0) p.tumble -= dt;
    p.onMover = false;
    if (p.inside) {
      // inside the artifact: Space is the form's ability, R bails out to safety
      p.grounded = true;
      if (p.jumpCount !== p.lastJumpCount) {
        p.lastJumpCount = p.jumpCount;
        if (canAct) this.pilot.ability(p);
      }
      if (p.respawnCount !== p.lastRespawnCount) {
        p.lastRespawnCount = p.respawnCount;
        if (playing && this.time - p.lastSelfRespawn > 3) {
          p.lastSelfRespawn = this.time;
          this.pilot.bail(p);
        }
      }
      return;
    }
    const body = p.body;
    const v = body.linvel();
    const hit = this.castGround(p);
    p.grounded = !!hit && v.y < 4.5 + Math.max(0, this.carrierVel(hit).y);
    // standing on a moving platform: walk relative to it
    const carry = p.grounded && hit ? this.carrierVel(hit) : ZERO;
    if (carry !== ZERO) p.onMover = true;
    if (p.grounded) {
      p.coyote = 0.12;
      p.airTime = 0;
    } else {
      p.coyote -= dt;
      p.airTime += dt;
    }
    const canMove = canAct;
    const knocked = p.tumble > 0;
    const mx = canMove ? p.mx : 0;
    const mz = canMove ? p.mz : 0;
    // sprinting is faster but slidier (less grip on the ground); not while holding a rope or knocked over
    const sprint = p.sprint && !p.grip && !knocked;
    const speed = p.grip ? C.GRIP_SPEED : sprint ? C.SPRINT_SPEED : C.WALK_SPEED;
    const pos = body.translation();
    const drift = this.windDrift(pos);
    const tx = mx * speed + carry.x + drift.x;
    const tz = mz * speed + carry.z + drift.z;
    let accel = p.grounded ? (sprint ? 24 : 46) : 15;
    const slip = p.grounded ? this.slipAt({ x: pos.x, y: pos.y - C.PLAYER_CENTER_Y, z: pos.z }) : null;
    if (slip) accel *= slip.grip;
    if (knocked) accel *= 0.2;
    const controlled = approachVelocity(v.x, v.z, tx, tz, accel, dt);
    let dvx = controlled.x - v.x;
    let dvz = controlled.z - v.z;
    if (p.launchT > 0 && !p.grounded) {
      // flung by a spring / puff: keep the momentum, steer gently toward the input (no air brakes)
      dvx = mx * 6 * dt;
      dvz = mz * 6 * dt;
    }
    const dl = Math.hypot(dvx, dvz);
    const maxDv = accel * dt;
    if (dl > maxDv) {
      dvx *= maxDv / dl;
      dvz *= maxDv / dl;
    }
    let vy = v.y;
    // jumping with buffer + coyote time
    if (p.jumpCount !== p.lastJumpCount) {
      p.lastJumpCount = p.jumpCount;
      if (canMove && !knocked) p.jumpBuffer = 0.15;
    }
    if (p.jumpBuffer > 0) {
      p.jumpBuffer -= dt;
      if (p.coyote > 0) {
        vy = C.JUMP_SPEED + Math.max(0, carry.y);
        p.jumpBuffer = 0;
        p.coyote = 0;
        p.grounded = false;
      }
    }
    // ride descending platforms instead of bouncing on them
    if (p.grounded && carry.y < 0 && vy > carry.y && p.jumpBuffer <= 0) vy = Math.min(vy, carry.y);
    // snappier falls
    if (!p.grounded && vy < 0) vy += C.GRAVITY * 0.35 * dt;
    body.setLinvel({ x: v.x + dvx, y: vy, z: v.z + dvz }, true);

    // facing
    let targetYaw: number | null = null;
    if (p.grip) {
      const a = this.anchorWorld(p.grip);
      if (Math.hypot(a.x - pos.x, a.z - pos.z) > 0.15) targetYaw = Math.atan2(a.x - pos.x, a.z - pos.z);
    } else if (Math.hypot(mx, mz) > 0.15) {
      targetYaw = Math.atan2(mx, mz);
    }
    if (targetYaw !== null) p.yaw = lerpAngle(p.yaw, targetYaw, 1 - Math.exp(-14 * dt));

    // self respawn request (R)
    if (p.respawnCount !== p.lastRespawnCount) {
      p.lastRespawnCount = p.respawnCount;
      if (playing && this.time - p.lastSelfRespawn > 3) {
        p.lastSelfRespawn = this.time;
        this.respawnPlayer(p, false);
      }
    }
  }

  private carrierVel(hit: { collider: RAPIER.Collider; witness1?: Vec } | null): Vec {
    if (!hit) return ZERO;
    const m = this.carriers.get(hit.collider.handle);
    if (!m) return ZERO;
    const pt = (hit as { witness1?: Vec }).witness1;
    return m.velAt(pt ?? hit.collider.translation()) ?? ZERO;
  }

  /** Q pressed: use the closest usable switch in reach. */
  protected onUsePress(p: PlayerBody) {
    const pos = p.body.translation();
    let best: SwitchMech | null = null;
    let bd = Infinity;
    for (const s of this.switches) {
      if (!s.live || !s.near(pos)) continue;
      const d = Math.hypot(pos.x - s.def.p[0], pos.z - s.def.p[2]);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    best?.press(p);
  }

  /**
   * Couriers don't physically collide with each other (no stacking or jitter); instead overlapping couriers are eased
   * apart, and running into each other fast bumps both (sprinting into a friend knocks you both over). A courier hit
   * by the artifact moving or swinging fast gets bonked too. All soft: velocity nudges, never teleports.
   */
  private updateBumps() {
    const ps = this.players.filter((p): p is PlayerBody => !!p && p.connected && !p.inside && p.respawnTimer <= 0);
    const R2 = C.PLAYER_RADIUS * 2;
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const a = ps[i], b = ps[j];
        const pa = a.body.translation(), pb = b.body.translation();
        const dx = pb.x - pa.x, dz = pb.z - pa.z;
        const d = Math.hypot(dx, dz);
        if (d >= R2 || Math.abs(pb.y - pa.y) > 1.1) continue;
        const nx = d > 1e-3 ? dx / d : 1, nz = d > 1e-3 ? dz / d : 0;
        const va = a.body.linvel(), vb = b.body.linvel();
        const closing = (va.x - vb.x) * nx + (va.z - vb.z) * nz; // > 0: running into each other
        const push = (R2 - d) * 6 + Math.max(0, closing) * 0.6;
        a.body.setLinvel({ x: va.x - nx * push, y: va.y, z: va.z - nz * push }, true);
        b.body.setLinvel({ x: vb.x + nx * push, y: vb.y, z: vb.z + nz * push }, true);
        if (closing > 3.4 && this.time - Math.max(a.lastTumbleEv, b.lastTumbleEv) > 0.6) {
          this.events.push({ k: 'bump', a: a.slot, b: b.slot, v: r3(closing) });
          if (closing > 6.2) {
            this.tumble(a, 0.4);
            this.tumble(b, 0.4);
          } else a.lastTumbleEv = b.lastTumbleEv = this.time;
        }
      }
    }
    // bonked by the artifact: its surface moving fast relative to a courier touching it
    if (this.locked) return;
    const art = this.artifact;
    const c = art.translation();
    const av = art.linvel();
    const aw = art.angvel();
    if (hlen(av) < 2.5 && Math.abs(aw.y) < 1.4) return;
    for (const p of ps) {
      if (p.tumble > 0) continue;
      const pos = p.body.translation();
      const proj = this.artCol.projectPoint(pos, false);
      if (!proj || len(sub(proj.point, pos)) - C.PLAYER_RADIUS > 0.12) continue;
      const r = sub(proj.point, c);
      const sv = add(av, cross(aw, r));
      const pv = p.body.linvel();
      const rel = { x: sv.x - pv.x, y: 0, z: sv.z - pv.z };
      const toP = { x: pos.x - proj.point.x, y: 0, z: pos.z - proj.point.z };
      const tl = hlen(toP) || 1;
      const into = (rel.x * toP.x + rel.z * toP.z) / tl; // surface moving into the courier
      if (into < 3.0) continue;
      p.body.setLinvel({ x: pv.x + (toP.x / tl) * into * 0.8, y: Math.max(pv.y, 3.2), z: pv.z + (toP.z / tl) * into * 0.8 }, true);
      p.launchT = 0.35;
      this.tumble(p, 0.6);
    }
  }

  /** Couriers walking into the artifact: extra push at the COM + no sliding off the face. */
  private updatePushers(dt: number) {
    const art = this.artifact;
    const c = art.translation();
    const av = art.linvel();
    const aw = art.angvel();
    for (const p of this.players) {
      if (!p) continue;
      p.pushing = false;
      if (!p.connected || p.respawnTimer > 0 || this.finished || p.inside || p.tumble > 0) continue;
      const m = Math.hypot(p.mx, p.mz);
      if (m < 0.3) continue;
      const pos = p.body.translation();
      const proj = this.artCol.projectPoint(pos, false);
      if (!proj) continue;
      const dx = proj.point.x - pos.x;
      const dy = proj.point.y - pos.y;
      const dz = proj.point.z - pos.z;
      if (Math.hypot(dx, dy, dz) - C.PLAYER_RADIUS > 0.2) continue;
      const hl = Math.hypot(dx, dz);
      if (hl < 0.05 || dy < -0.75) continue; // standing on top
      const nx = dx / hl;
      const nz = dz / hl;
      const ix = p.mx / m;
      const iz = p.mz / m;
      const into = ix * nx + iz * nz;
      if (into < 0.35) continue;
      p.pushing = true;
      if (!p.grip && !this.artifactLocked()) {
        const P = 24 * m;
        art.applyImpulse({ x: ix * P * dt, y: 0, z: iz * P * dt }, true);
      }
      // stick to the face: cancel tangential slip relative to the surface (keep intended sideways motion)
      const tIn = Math.abs(ix * -nz + iz * nx);
      if (tIn < 0.45) {
        const r = sub(proj.point, c);
        const va = add(av, cross(aw, r));
        const vp = p.body.linvel();
        const rx = vp.x - va.x;
        const rz = vp.z - va.z;
        const rn = rx * nx + rz * nz;
        const tx = rx - nx * rn;
        const tz = rz - nz * rn;
        p.body.setLinvel({ x: vp.x - tx * 0.7, y: vp.y, z: vp.z - tz * 0.7 }, true);
      }
    }
  }

  private anchorWorld(g: Grip): Vec {
    const c = this.artifact.translation();
    if (g.ball) return add(c, g.local);
    return add(c, rotate(this.artifact.rotation(), g.local));
  }

  private tryGrip(p: PlayerBody) {
    const pos = p.body.translation();
    const hand = { x: pos.x, y: pos.y + 0.05, z: pos.z };
    const proj = this.artCol.projectPoint(hand, false);
    if (!proj) return;
    const d = len(sub(proj.point, hand));
    if (d - C.PLAYER_RADIUS > C.GRIP_RANGE) return;
    this.attachGrip(p, proj.point, d);
    this.events.push({ k: 'grip', by: p.slot });
  }

  private attachGrip(p: PlayerBody, point: Vec, d: number) {
    const c = this.artifact.translation();
    const spec = shapeSpec(this.shape);
    const off = sub(point, c);
    p.grip = {
      ball: spec.ball,
      local: spec.ball ? off : invRotate(this.artifact.rotation(), off),
      rest: clamp(d, 0.55, 1.3),
    };
  }

  private updateGrips(dt: number) {
    const art = this.artifact;
    const c = art.translation();
    const av = art.linvel();
    const aw = art.angvel();
    const locked = this.artifactLocked();
    for (const p of this.players) {
      if (!p) continue;
      if (!p.grab || !p.connected || p.inside) {
        if (p.grip) {
          p.grip = null;
          this.events.push({ k: 'release', by: p.slot });
        }
        continue;
      }
      if (!p.grip) {
        if (p.respawnTimer <= 0 && p.tumble <= 0 && !this.finished) this.tryGrip(p);
        if (!p.grip) continue;
      }
      const g = p.grip;
      const anchor = this.anchorWorld(g);
      const pos = p.body.translation();
      const hand = { x: pos.x, y: pos.y + 0.1, z: pos.z };
      const d = sub(anchor, hand);
      const dist = len(d);
      if (dist > C.GRIP_BREAK) {
        p.grip = null;
        this.events.push({ k: 'release', by: p.slot, snap: true });
        continue;
      }
      const stretch = dist - g.rest;
      if (stretch <= 0 || dist < 1e-4) continue;
      const dir = scale(d, 1 / dist);
      const r = sub(anchor, c);
      const va = add(av, cross(aw, r));
      const vp = p.body.linvel();
      const relV = dot(sub(va, vp), dir);
      let F = 230 * stretch + 26 * relV;
      F = clamp(F, 0, 62);
      // courier: horizontal pull only (never lifted off the ground)
      p.body.applyImpulse({ x: dir.x * F * dt, y: 0, z: dir.z * F * dt }, true);
      if (locked) continue; // a machine holds the artifact: ropes only tug the couriers
      // artifact: full pull, limited upward component
      const fy = Math.min(-dir.y * F, F * 0.25);
      const imp = { x: -dir.x * F * dt, y: fy * dt, z: -dir.z * F * dt };
      if (g.ball) art.applyImpulse(imp, true);
      else art.applyImpulseAtPoint(imp, anchor, true);
      // pulling assist in the courier's input direction when the rope is taut
      const m = Math.hypot(p.mx, p.mz);
      if (stretch > 0.05 && m > 0.3) {
        const A = 20 * Math.min(1, m);
        const ai = { x: (p.mx / m) * A * dt, y: 0, z: (p.mz / m) * A * dt };
        if (g.ball) art.applyImpulse(ai, true);
        else art.applyImpulseAtPoint(ai, anchor, true);
      }
    }
  }

  gripCount() {
    let n = 0;
    for (const p of this.players) if (p && p.grip) n++;
    return n;
  }

  artifactExtentY(shape: number, q: Quat) {
    const s = shapeSpec(shape);
    if (s.ball) return s.half[0];
    const ax = rotate(q, { x: 1, y: 0, z: 0 });
    const ay = rotate(q, { x: 0, y: 1, z: 0 });
    const az = rotate(q, { x: 0, y: 0, z: 1 });
    return Math.abs(ax.y) * s.half[0] + Math.abs(ay.y) * s.half[1] + Math.abs(az.y) * s.half[2];
  }

  private updateArtifactForces(dt: number) {
    const art = this.artifact;
    const spec = shapeSpec(this.shape);
    const c = art.translation();
    const q = art.rotation();
    const v = art.linvel();
    const w = art.angvel();
    this.artGrounded = this.checkArtifactGrounded();
    if (this.artifactLocked()) return;

    // viscous ground drag relative to what it rests on (heavy feel + speed scaling with number of pushers)
    this.noDragT = Math.max(0, this.noDragT - dt);
    if (this.artGrounded && this.noDragT <= 0) {
      const ext = this.artifactExtentY(this.shape, q);
      const slip = this.slipAt({ x: c.x, y: c.y - ext, z: c.z });
      const k = spec.groundDrag * (slip ? slip.drag : 1) * C.ARTIFACT_MASS * dt;
      const s = this.artSupport;
      const imp = { x: -(v.x - s.x) * k, y: 0, z: -(v.z - s.z) * k };
      if (spec.ball) art.applyImpulse(imp, true);
      else art.applyImpulseAtPoint(imp, { x: c.x, y: c.y - ext * 0.7, z: c.z }, true);
      if (spec.yawDamp > 0) art.applyTorqueImpulse({ x: 0, y: -w.y * spec.yawDamp * dt, z: 0 }, true);
    }

    // TALL: steady when two or more couriers hold it
    if (this.shape === ShapeId.TALL) {
      const grippers = this.gripCount();
      if (grippers >= 2) {
        const up = rotate(q, UP);
        const err = cross(up, this.tallWant);
        const tx = err.x * 320 - w.x * 48;
        const tz = err.z * 320 - w.z * 48;
        const m = Math.hypot(tx, tz);
        const lim = 240;
        const sc = m > lim ? lim / m : 1;
        art.applyTorqueImpulse({ x: tx * sc * dt, y: 0, z: tz * sc * dt }, true);
      } else if (this.artGrounded && !this.pilot.player) {
        // unsteadied: wobbles while moving (top-heavy pillar)
        const sp = hlen(v);
        if (sp > 0.35) {
          const k = Math.min(1, sp / 1.4) * 26 * dt;
          const a = this.time * 1.7;
          art.applyTorqueImpulse({ x: Math.sin(a * 2.3) * k + (v.z / sp) * k * 0.6, y: 0, z: Math.cos(a * 1.9) * k - (v.x / sp) * k * 0.6 }, true);
        }
      }
    }
  }

  private checkArtifactGrounded() {
    let grounded = false;
    let support: Vec = ZERO;
    this.world.contactPairsWith(this.artCol, (other) => {
      if (grounded) return;
      const og = other.collisionGroups() >>> 16;
      if (og & C.G_PLAYER) return;
      this.world.contactPair(this.artCol, other, (m) => {
        if (m.numSolverContacts() > 0 && Math.abs(m.normal().y) > 0.45) {
          grounded = true;
          const car = this.carriers.get(other.handle);
          if (car) support = car.velAt(this.artifact.translation()) ?? ZERO;
        }
      });
    });
    this.artSupport = support;
    return grounded;
  }

  /** Horizontal half-extent of the current form along a horizontal unit direction. */
  extentAlong(d: Vec) {
    const spec = shapeSpec(this.shape);
    if (spec.ball) return spec.half[0];
    const q = this.artifact.rotation();
    const ax = rotate(q, { x: 1, y: 0, z: 0 });
    const ay = rotate(q, { x: 0, y: 1, z: 0 });
    const az = rotate(q, { x: 0, y: 0, z: 1 });
    return Math.abs(dot(d, ax)) * spec.half[0] + Math.abs(dot(d, ay)) * spec.half[1] + Math.abs(dot(d, az)) * spec.half[2];
  }

  /** Impulse through the centre of mass (no torque, even for the top-heavy TALL). */
  applyArtifactCenterImpulse(imp: Vec) {
    this.artifact.applyImpulse(imp, true);
  }

  /** The artifact is held by a machine (crane hook) and must not be steered, boarded or shifted. */
  artifactLocked() {
    return this.locked;
  }

  /** Crane hooks take the artifact (kinematic, follows the hook) and give it back (dynamic, with a velocity). */
  lockArtifact(on: boolean, vel: Vec = ZERO) {
    if (on === this.locked) return;
    this.locked = on;
    const art = this.artifact;
    if (on) {
      art.setLinvel(ZERO, true);
      art.setAngvel(ZERO, true);
      art.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    } else {
      art.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      art.setLinvel(vel, true);
      art.setAngvel(ZERO, true);
      this.allowLaunch(1.5, hlen(vel));
    }
  }

  /** Spots couriers must never be placed in (kill volumes). */
  isHazard(p: Vec) {
    if (p.y < this.map.killY + 2) return true;
    for (const h of this.hazards) if (h.contains(p)) return true;
    return false;
  }

  /** Lift the speed caps for a moment (springs, the CUBE hop); `speed` = horizontal launch speed to allow. */
  allowLaunch(seconds: number, speed = 0) {
    this.noDragT = 0.25; // still touching the pad for a tick or two: don't let ground drag eat the launch
    this.launchT = Math.max(this.launchT, seconds);
    this.launchSpeed = Math.max(this.launchT > seconds ? this.launchSpeed : 0, speed);
  }

  /** Knock a courier over for a moment (bumps, shockwaves, puffs). */
  tumble(p: PlayerBody, seconds: number) {
    if (p.inside || p.respawnTimer > 0) return;
    p.tumble = Math.max(p.tumble, seconds);
    if (p.grip) {
      p.grip = null;
      this.events.push({ k: 'release', by: p.slot });
    }
    if (this.time - p.lastTumbleEv > 1) {
      p.lastTumbleEv = this.time;
      this.events.push({ k: 'tumble', by: p.slot });
    }
  }

  /** Heavy landing: a ring of air that shoves nearby couriers outward (never damaging). */
  thump(strength: number) {
    const c = this.artifact.translation();
    const ext = this.artifactExtentY(this.shape, this.artifact.rotation());
    const R = 3.4 + strength * 0.6;
    for (const p of this.players) {
      if (!p || p.inside || p.respawnTimer > 0) continue;
      const pp = p.body.translation();
      const dx = pp.x - c.x;
      const dz = pp.z - c.z;
      const d = Math.hypot(dx, dz);
      if (d > R || Math.abs(pp.y - (c.y - ext)) > 2.6) continue;
      const k = 1 - d / R;
      const nx = d > 1e-3 ? dx / d : 0;
      const nz = d > 1e-3 ? dz / d : 1;
      const v = p.body.linvel();
      const push = (1.5 + 3.5 * k) * strength;
      p.body.setLinvel({ x: v.x + nx * push, y: Math.max(v.y, (1.2 + 2.6 * k) * strength), z: v.z + nz * push }, true);
      if (k > 0.35) this.tumble(p, 0.45);
    }
    this.thumpAt = this.time;
    this.events.push({ k: 'thump', x: r3(c.x), y: r3(c.y - ext), z: r3(c.z), v: r3(strength) });
  }

  private postStep(dt: number, playing: boolean) {
    const art = this.artifact;
    const spec = shapeSpec(this.shape);
    const v = art.linvel();
    // heavy landing after a real fall (spring flights, pilot hops, ledges): a harmless shove for everyone near
    if (!this.artGrounded && !this.locked) {
      this.airT += dt;
      this.minVy = Math.min(this.minVy, v.y);
    } else {
      if (this.airT > 0.35 && this.minVy < -5 && playing) this.thump(Math.min(1.4, 0.55 + -this.minVy / 12));
      this.airT = 0;
      this.minVy = 0;
    }
    // clamp artifact speeds (no launching into orbit)
    const hv = Math.hypot(v.x, v.z);
    let nvx = v.x;
    let nvz = v.z;
    let nvy = v.y;
    let clamped = false;
    this.launchT = Math.max(0, this.launchT - dt);
    const maxH = Math.max(spec.maxSpeed + (this.pilot.boost > 0 ? 2 : 0) + (this.launchT > 0 ? 4 : 0), this.launchT > 0 ? this.launchSpeed + 0.5 : 0) + hlen(this.artSupport);
    if (hv > maxH) {
      nvx *= maxH / hv;
      nvz *= maxH / hv;
      clamped = true;
    }
    const maxUp = this.launchT > 0 ? 22 : 7;
    if (nvy > maxUp) {
      nvy = maxUp;
      clamped = true;
    }
    if (clamped) art.setLinvel({ x: nvx, y: nvy, z: nvz }, true);
    const w = art.angvel();
    const wl = len(w);
    if (wl > 9) art.setAngvel(scale(w, 9 / wl), true);

    // impacts
    const dv = len(sub({ x: nvx, y: nvy, z: nvz }, this.prevArtVel));
    this.impactCooldown -= dt;
    if (dv > 3.2 && this.impactCooldown <= 0) {
      this.impactCooldown = 0.18;
      const c = art.translation();
      const mat = c.z < -11.5 && c.z > -19.5 && this.map.course ? 'wood' : this.shape === ShapeId.ROUND ? 'metal' : 'heavy';
      this.events.push({ k: 'impact', v: r3(Math.min(dv, 12)), mat });
    }
    this.prevArtVel = { x: nvx, y: nvy, z: nvz };

    for (const p of this.players) {
      if (!p || p.inside) continue;
      const pv = p.body.linvel();
      const sp = len(pv);
      if (sp > 22) p.body.setLinvel(scale(pv, 22 / sp), true);
      else if (pv.y > 11 && p.launchT <= 0) p.body.setLinvel({ x: pv.x, y: 11, z: pv.z }, true);
    }

    if (!playing || this.finished) return;

    const c = art.translation();
    // artifact fell off the world (or into a hazard)
    if (c.y < this.map.killY || this.hazards.some((h) => h.contains(c))) {
      this.drops++;
      this.penalty += C.DROP_PENALTY_MS / 1000;
      this.events.push({ k: 'drop' });
      this.resetToCheckpoint();
      return;
    }
    // far outside the map: bring it back for free (not a shortcut: always to the last checkpoint)
    const B = this.map.bounds;
    this.outT = B && !inBox(c, B.min, B.max) ? this.outT + dt : 0;
    if (this.outT > 3) {
      this.events.push({ k: 'toast', text: 'The golden object went too far. It is back at the checkpoint' });
      this.resetToCheckpoint();
      return;
    }
    // players fell / got separated
    for (const p of this.players) {
      if (!p) continue;
      p.launchT = Math.max(0, p.launchT - dt);
      if (p.inside) {
        p.farTimer = 0;
        continue;
      }
      const pp = p.body.translation();
      if (pp.y < this.map.killY || this.hazards.some((h) => h.contains(pp))) {
        this.falls++;
        this.events.push({ k: 'fall', by: p.slot });
        this.respawnPlayer(p, true);
        continue;
      }
      const far = Math.hypot(pp.x - c.x, pp.z - c.z) > 32 || (c.y - pp.y > 5.5 && this.artGrounded);
      p.farTimer = far && p.connected ? p.farTimer + dt : 0;
      if (p.farTimer > 5) {
        p.farTimer = 0;
        this.events.push({ k: 'hop', by: p.slot });
        this.respawnPlayer(p, false);
      }
    }

    // checkpoints (only once it rests there: no checkpoint grabs mid-flight or dangling from a crane)
    for (const cp of this.map.checkpoints) {
      if (cp.id <= this.cp || !this.artGrounded || this.locked) continue;
      if (inBox(c, cp.trigger.min, cp.trigger.max)) {
        this.cp = cp.id;
        this.events.push({ k: 'checkpoint', cp: cp.id });
      }
    }
    // shortcuts (rewarded, never required)
    for (const s of this.map.shortcuts ?? []) {
      if (!this.shortcuts.has(s.id) && inBox(c, s.min, s.max)) {
        this.shortcuts.add(s.id);
        this.events.push({ k: 'shortcut', label: s.label });
      }
    }
    this.watchStuck(dt);

    // goal
    const G = this.map.goal;
    const active = this.requiredPlayers();
    const inRing = (q: Vec, r: number) => Math.hypot(q.x - G.p[0], q.z - G.p[2]) <= r && Math.abs(q.y - G.p[1]) < 3.2;
    const allIn = active.length > 0 && inRing(c, G.r + 0.4) && active.every((p) => p.inside || inRing(p.body.translation(), G.r));
    this.goalT = allIn ? this.goalT + dt : Math.max(0, this.goalT - dt * 2);
    this.objective = this.currentObjective();
    if (this.goalT >= C.GOAL_HOLD_S) this.finish();
  }

  /** No progress for a long while although couriers are working on it: offer a free recall. */
  private watchStuck(dt: number) {
    const c = this.artifact.translation();
    const S = this.stuck;
    const busy = this.players.some((p) => p && p.connected && (p.inside || p.grip || p.pushing));
    if (Math.hypot(c.x - S.x, c.z - S.z) > 0.8 || !busy) {
      S.x = c.x;
      S.z = c.z;
      S.t = 0;
      S.warned = false;
      return;
    }
    S.t += dt;
    if (S.t > 14 && !S.warned) {
      S.warned = true;
      this.events.push({ k: 'stuck' });
    }
  }

  isStuck() {
    return this.stuck.warned;
  }

  private cond(c: Cond): boolean {
    if ('sig' in c) return this.sig(c.sig);
    if ('cp' in c) return this.cp >= c.cp;
    if ('shape' in c) return this.shape === c.shape;
    if ('pilot' in c) return this.pilot.slot >= 0;
    if ('goal' in c) return this.goalT > 0;
    if ('all' in c) return c.all.every((x) => this.cond(x));
    if ('any' in c) return c.any.some((x) => this.cond(x));
    return !this.cond(c.not);
  }

  /** First objective not yet done (objectives are ordered; later ones are only shown once earlier ones hold). */
  private currentObjective() {
    const obs = this.map.objectives;
    for (let i = 0; i < obs.length; i++) if (!this.cond(obs[i].done)) return i;
    return Math.max(0, obs.length - 1);
  }

  // ------------------------------------------------------------------ resets
  bestAnchor(near: Vec, slot: number): Vec {
    let best: Vec | null = null;
    let bestD = Infinity;
    for (const a of this.map.anchors) {
      if (a.cp > this.cp) continue;
      if (a.req && !this.sig(a.req)) continue;
      const p = { x: a.p[0], y: a.p[1], z: a.p[2] };
      const d = Math.hypot(p.x - near.x, (p.y - near.y) * 3, p.z - near.z);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    const sp = this.map.spawn.players[0];
    const b = best ?? { x: sp[0], y: sp[1], z: sp[2] };
    return { x: b.x + (slot - 1) * 0.9, y: b.y, z: b.z };
  }

  respawnPlayer(p: PlayerBody, fell: boolean) {
    if (p.inside) {
      this.pilot.bail(p);
      return;
    }
    const c = this.artifact.translation();
    const a = this.bestAnchor(c, p.slot);
    const pos = { x: a.x, y: a.y + C.PLAYER_CENTER_Y + 1.4, z: a.z };
    p.body.setTranslation(pos, true);
    p.body.setLinvel({ x: 0, y: -1, z: 0 }, true);
    if (p.grip) {
      p.grip = null;
      this.events.push({ k: 'release', by: p.slot });
    }
    p.respawnTimer = 0.6;
    p.farTimer = 0;
    p.tumble = 0;
    this.events.push({ k: 'respawn', by: p.slot, x: r3(pos.x), y: r3(pos.y), z: r3(pos.z) });
    void fell;
  }

  resetToCheckpoint() {
    for (const c of this.cranes) c.reset();
    const cp = this.map.checkpoints[this.cp];
    this.applyShape(ShapeId.CUBE, { x: cp.artifact[0], y: cp.artifact[1], z: cp.artifact[2] }, IDENT, { x: 0, y: 0, z: 0 });
    this.artifact.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.prevArtVel = { x: 0, y: 0, z: 0 };
    this.goalT = 0;
    this.outT = 0;
    this.stuck.t = 0;
    this.stuck.warned = false;
    this.resetVotes.clear();
    for (const m of this.mechs) m.reset();
    for (const p of this.players) {
      if (!p) continue;
      const s = cp.players[p.slot];
      if (p.inside) this.pilot.place(p, { x: s[0], y: s[1] + C.PLAYER_CENTER_Y + 1.2, z: s[2] });
      p.tumble = 0;
      p.body.setTranslation({ x: s[0], y: s[1] + C.PLAYER_CENTER_Y + 1.2, z: s[2] }, true);
      p.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      p.grip = null;
      p.respawnTimer = 0.8;
      p.farTimer = 0;
      this.events.push({ k: 'respawn', by: p.slot, x: s[0], y: s[1] + 1.2, z: s[2] });
    }
  }

  voteReset(slot: number) {
    if (this.finished) return;
    this.resetVotes.set(slot, this.time);
    const need = Math.min(2, this.activePlayers().length);
    if (this.resetVotes.size >= need) {
      // a stuck artifact (or one the team can no longer reach) is recalled for free
      const free = this.isStuck();
      if (!free) {
        this.drops++;
        this.penalty += C.DROP_PENALTY_MS / 1000;
      }
      this.events.push({ k: 'toast', text: free ? 'The golden object is back at the checkpoint (free: it was stuck)' : 'The golden object is back at the checkpoint (+7 s)' });
      this.resetToCheckpoint();
    } else {
      const name = this.players[slot]?.name ?? 'Someone';
      this.events.push({ k: 'toast', text: `${name} wants to bring the golden object back. Press T to agree` });
    }
  }

  // ------------------------------------------------------------------ shape shifting
  requestShift(slot: number, shape: number) {
    const p = this.players[slot];
    if (!p || this.finished) return;
    if (!(shape >= 0 && shape <= 3) || shape === this.shape) return;
    if (this.time - p.lastShiftReq < 0.25) return;
    p.lastShiftReq = this.time;
    const fail = (why: string) => this.events.push({ k: 'shiftFail', shape, by: slot, why });
    if (this.time - this.lastShiftAt < C.SHIFT_COOLDOWN_MS / 1000) return fail('Wait a moment before changing shape again');
    if (this.artifactLocked()) return fail('Not while the crane is holding it');
    if (!p.inside) {
      const pos = p.body.translation();
      const proj = this.artCol.projectPoint(pos, false);
      if (!proj || len(sub(proj.point, pos)) - C.PLAYER_RADIUS > C.SHIFT_RANGE) return fail('Get closer to the golden object to change its shape');
    }
    const pose = this.findShiftPose(shape);
    if (!pose) return fail('No room for that shape here');
    const v = this.artifact.linvel();
    this.applyShape(shape, pose.pos, pose.rot, { x: v.x * 0.5, y: Math.max(0, v.y) * 0.5, z: v.z * 0.5 });
    this.artifact.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.pushPlayersOut(shape, pose.pos, pose.rot);
    // re-anchor grips on the new form
    for (const pl of this.players) {
      if (!pl || !pl.grip) continue;
      const pp = pl.body.translation();
      const hand = { x: pp.x, y: pp.y + 0.05, z: pp.z };
      const pr = this.artCol.projectPoint(hand, false);
      if (pr) this.attachGrip(pl, pr.point, len(sub(pr.point, hand)));
    }
    this.lastShiftAt = this.time;
    this.shifts++;
    for (const m of this.mechs) m.shifted();
    this.events.push({ k: 'shift', shape, by: slot });
  }

  private makeShape(spec: ShapeSpec, shrink = 0): RAPIER.Shape {
    if (spec.ball) return new RAPIER.Ball(spec.half[0] - shrink);
    const r = EDGE_R;
    return new RAPIER.RoundCuboid(spec.half[0] - shrink - r, spec.half[1] - shrink - r, spec.half[2] - shrink - r, r);
  }

  private clearAt(spec: ShapeSpec, pos: Vec, rot: Quat) {
    let blocked = false;
    this.world.intersectionsWithShape(
      pos,
      rot,
      this.makeShape(spec, 0.03),
      () => {
        blocked = true;
        return false;
      },
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      STATIC_FOR_ARTIFACT,
      this.artCol,
      this.artifact,
    );
    return !blocked;
  }

  private findShiftPose(shape: number): { pos: Vec; rot: Quat } | null {
    const spec = shapeSpec(shape);
    const c = this.artifact.translation();
    const q = this.artifact.rotation();
    const curExt = this.artifactExtentY(this.shape, q);
    const ray = new RAPIER.Ray({ x: c.x, y: c.y, z: c.z }, DOWN);
    const hit = this.world.castRay(ray, curExt + 1.5, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, STATIC_ONLY, this.artCol, this.artifact);
    const grounded = !!hit && hit.timeOfImpact <= curExt + 0.7;
    const floorY = hit ? c.y - hit.timeOfImpact : c.y - curExt;
    const baseY = grounded ? floorY + spec.half[1] + 0.04 : c.y;
    const curYaw = yawOfX(q);
    const yaws: number[] = [];
    if (shape === ShapeId.LONG) {
      let pref = Math.PI / 2;
      for (const z of this.map.longAxisZones) {
        if (c.x >= z.min[0] && c.x <= z.max[0] && c.z >= z.min[1] && c.z <= z.max[1]) pref = z.yaw;
      }
      let best = curYaw;
      let bestErr = Infinity;
      for (let k = 0; k < 4; k++) {
        const y = curYaw + (k * Math.PI) / 2;
        const e = Math.abs(axisDiff(y, pref));
        if (e < bestErr) {
          bestErr = e;
          best = y;
        }
      }
      // snap to the preferred axis if close enough, then try perpendicular
      const snapped = bestErr < 0.6 ? pref : best;
      yaws.push(snapped, snapped + Math.PI / 2);
    } else {
      yaws.push(curYaw);
    }
    const offsets: Vec[] = [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0.15, z: 0 },
      { x: 0, y: 0.35, z: 0 },
      { x: 0, y: 0.6, z: 0 },
    ];
    for (const r of [0.6, 1.2, 1.9]) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        offsets.push({ x: Math.cos(a) * r, y: 0.08, z: Math.sin(a) * r });
      }
    }
    for (const yaw of yaws) {
      const rot = quatYaw(yaw);
      for (const o of offsets) {
        const pos = { x: c.x + o.x, y: baseY + o.y, z: c.z + o.z };
        if (this.clearAt(spec, pos, rot)) return { pos, rot };
      }
    }
    return null;
  }

  private applyShape(shape: number, pos: Vec, rot: Quat, vel: Vec) {
    const spec = shapeSpec(shape);
    const body = this.artifact;
    body.setTranslation(pos, true);
    body.setRotation(rot, true);
    body.setLinvel(vel, true);
    if (shape !== this.shape || !this.artCol) {
      this.world.removeCollider(this.artCol, true);
      this.artCol = this.world.createCollider(this.artifactColliderDesc(spec), body);
      this.shape = shape;
    }
    body.setAngularDamping(spec.angularDamping);
    body.wakeUp();
  }

  /** Couriers caught inside a newly shifted form are moved to the nearest safe spot on solid ground. */
  private pushPlayersOut(shape: number, pos: Vec, rot: Quat) {
    const spec = shapeSpec(shape);
    const hits: RAPIER.Collider[] = [];
    this.world.intersectionsWithShape(
      pos,
      rot,
      this.makeShape(spec, -0.08),
      (col) => {
        hits.push(col);
        return true;
      },
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      PLAYERS_ONLY,
    );
    const ax = rotate(rot, { x: 1, y: 0, z: 0 });
    const az = rotate(rot, { x: 0, y: 0, z: 1 });
    const capsule = new RAPIER.Capsule(C.PLAYER_HALF_HEIGHT, C.PLAYER_RADIUS);
    for (const col of hits) {
      const p = this.players.find((pl) => pl && pl.collider.handle === col.handle);
      if (!p) continue;
      const pp = p.body.translation();
      const base = Math.atan2(pp.z - pos.z, pp.x - pos.x);
      let placed = false;
      for (let k = 0; k < 16 && !placed; k++) {
        const a = base + (k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 8);
        const dx = Math.cos(a);
        const dz = Math.sin(a);
        const dir = { x: dx, y: 0, z: dz };
        const ext = spec.ball ? spec.half[0] : Math.abs(dot(dir, ax)) * spec.half[0] + Math.abs(dot(dir, az)) * spec.half[2];
        const out = ext + C.PLAYER_RADIUS + 0.3;
        const target = { x: pos.x + dx * out, y: pos.y - spec.half[1] + C.PLAYER_CENTER_Y + 0.08, z: pos.z + dz * out };
        if (spec.ball) target.y = pos.y - spec.half[0] + C.PLAYER_CENTER_Y + 0.08;
        // must have ground below and free space
        const ray = new RAPIER.Ray({ x: target.x, y: target.y + 0.5, z: target.z }, DOWN);
        const ground = this.world.castRay(ray, 3, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, STATIC_ONLY);
        if (!ground) continue;
        let free = true;
        this.world.intersectionsWithShape(target, IDENT, capsule, () => ((free = false), false), RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, C.groups(C.G_PLAYER, C.G_STATIC));
        if (!free) continue;
        p.body.setTranslation(target, true);
        p.body.setLinvel({ x: dx * 2, y: 3.5, z: dz * 2 }, true);
        placed = true;
      }
      if (!placed) {
        // last resort: pop on top of the artifact
        const top = spec.ball ? spec.half[0] : spec.half[1];
        p.body.setTranslation({ x: pos.x, y: pos.y + top + C.PLAYER_CENTER_Y + 0.3, z: pos.z }, true);
        p.body.setLinvel({ x: 0, y: 2, z: 0 }, true);
      }
    }
  }

  // ------------------------------------------------------------------ finish
  finish() {
    if (this.finished) return;
    for (const c of this.cranes) c.reset();
    const pl = this.pilot.player;
    if (pl) {
      const spot = this.pilot.findExitSpot(null);
      if (spot) this.pilot.place(pl, spot);
      else this.pilot.bail(pl);
    }
    this.finished = true;
    const timeMs = Math.round((this.runTime + this.penalty) * 1000);
    const seconds = timeMs / 1000;
    const stamps = this.stamps();
    const stampTotal = this.stampTotal();
    const shortcuts = [...this.shortcuts].map((id) => this.map.shortcuts?.find((s) => s.id === id)?.label ?? id);
    const s = mapScore({ seconds, par: this.map.par, drops: this.drops, falls: this.falls, stamps, stampTotal, shortcuts: shortcuts.length });
    const titles = ['Certified Clumsy Couriers', 'Reliable Royal Movers', 'Legendary Shape-Shifters'];
    this.results = {
      map: this.map.index,
      mapName: this.map.name,
      timeMs,
      rawMs: Math.round(this.runTime * 1000),
      par: this.map.par,
      drops: this.drops,
      falls: this.falls,
      shifts: this.shifts,
      stamps,
      stampTotal,
      shortcuts,
      score: s.score,
      crowns: s.crowns,
      achievements: [
        { label: 'Delivered', got: true },
        { label: `Under par (${Math.floor(this.map.par / 60)}:${String(this.map.par % 60).padStart(2, '0')})`, got: s.fast },
        { label: this.map.bonus.label, got: s.allStamps },
        { label: 'No artifact drops', got: this.drops === 0 },
        ...shortcuts.map((label) => ({ label, got: true })),
      ],
      names: this.players.map((p) => p?.name ?? ''),
      title: titles[s.crowns - 1],
    };
    for (const p of this.players) if (p) p.grip = null;
    this.events.push({ k: 'finish', results: this.results });
  }

  // ------------------------------------------------------------------ snapshot
  private legacyWorld(): WorldSnap {
    const w: WorldSnap = {
      plate: 0,
      gate: 0,
      recv: 0,
      bridge: 0,
      lever: 0,
      liftY: LEVEL.lift.bottom,
      liftGate: 0,
      lift: 0,
      aboard: 0,
      wind: 0,
      fan: 0,
      goal: r3(Math.min(1, this.goalT / C.GOAL_HOLD_S)),
      steady: this.gripCount(),
      resetVotes: this.resetVotes.size,
    };
    for (const m of this.mechs) if (m.def.legacy) m.legacyInto(w);
    return w;
  }

  snapshot(phase: Snapshot['ph']): Snapshot {
    const pl: PlayerSnap[] = [];
    for (const p of this.players) {
      if (!p) continue;
      const t = this.playerPos(p);
      const v = p.inside ? this.artifact.linvel() : p.body.linvel();
      let flags = 0;
      if (p.grounded) flags |= PF_GROUNDED;
      if (p.connected) flags |= PF_CONNECTED;
      if (Math.hypot(v.x, v.z) > 0.6) flags |= PF_MOVING;
      if (p.respawnTimer > 0) flags |= PF_RESPAWNING;
      if (p.inside) flags |= PF_PILOT;
      if (p.tumble > 0) flags |= PF_TUMBLE;
      if (p.sprint && !p.grip && !p.inside && Math.hypot(v.x, v.z) > C.WALK_SPEED + 0.3) flags |= PF_SPRINT;
      if (p.useHeld && !p.inside) flags |= PF_USE;
      if (p.onMover) flags |= PF_ONMOVER;
      let ax = 0,
        ay = 0,
        az = 0;
      if (p.grip) {
        flags |= PF_GRIP;
        const a = this.anchorWorld(p.grip);
        ax = r3(a.x);
        ay = r3(a.y);
        az = r3(a.z);
      }
      pl.push([p.slot, r3(t.x), r3(t.y), r3(t.z), r3(p.yaw), r3(v.x), r3(v.y), r3(v.z), flags, ax, ay, az]);
    }
    const t = this.artifact.translation();
    const q = this.artifact.rotation();
    const v = this.artifact.linvel();
    const ar: ArtifactSnap = [r3(t.x), r3(t.y), r3(t.z), r3(q.x), r3(q.y), r3(q.z), r3(q.w), this.shape, r3(v.x), r3(v.y), r3(v.z)];
    return {
      t: Math.round(this.time * 1000),
      ph: phase,
      el: Math.round((this.runTime + this.penalty) * 1000),
      cp: this.cp,
      cd: Math.max(0, Math.round((C.SHIFT_COOLDOWN_MS / 1000 - (this.time - this.lastShiftAt)) * 1000)),
      pl,
      ar,
      w: this.legacyWorld(),
      pi: this.pilot.slot,
      pa: this.pilot.cooldownFrac(),
      mp: this.map.index,
      m: this.mechs.map((m) => m.state()),
      ob: this.objective,
    };
  }

  // ------------------------------------------------------------------ dev helpers
  /** Start from checkpoint `cpIndex` of this map with everything before it solved. */
  devWarp(cpIndex: number) {
    const idx = clamp(cpIndex | 0, 0, this.map.checkpoints.length - 1);
    this.cp = idx;
    for (let i = 0; i <= idx; i++) for (const id of this.map.checkpoints[i].solve ?? []) this.mechIds.get(id)?.solve();
    this.resetToCheckpoint();
  }

  /** Solve one mechanism by id (tests / dev). */
  devSolve(id: string) {
    this.mechIds.get(id)?.solve();
  }

  /** Stop one mechanism from running (isolated tests). */
  devFreeze(id: string) {
    const m = this.mechIds.get(id);
    if (m) m.freeze = 'solved';
  }

  devSetShape(shape: number) {
    this.lastShiftAt = -99;
    const p = this.players.find((x) => x);
    if (p) this.requestShift(p.slot, shape);
  }

  devTeleportArtifact(x: number, y: number, z: number) {
    this.artifact.setTranslation({ x, y, z }, true);
    this.artifact.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.artifact.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.artifact.setRotation(IDENT, true);
  }

  devTeleportPlayer(slot: number, x: number, y: number, z: number) {
    const p = this.players[slot];
    if (!p) return;
    if (p.inside) this.pilot.place(p, { x, y: y + C.PLAYER_CENTER_Y, z });
    p.body.setTranslation({ x, y: y + C.PLAYER_CENTER_Y, z }, true);
    p.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  }
}

export async function initPhysics() {
  await RAPIER.init();
}

export { SHAPES };
