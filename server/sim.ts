// Authoritative per-room simulation: ONE Rapier world, three courier capsules, ONE artifact body.
import RAPIER from '@dimforge/rapier3d-compat';
import * as C from '../src/shared/constants';
import { LEVEL, chapterAt, drawbridgeAngle, inBox, islandBoxes, smooth, windCycleIndex, windStrength } from '../src/shared/level';
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
  quatX,
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
  PF_CONNECTED,
  PF_GRIP,
  PF_GROUNDED,
  PF_MOVING,
  PF_RESPAWNING,
  scoreFor,
  type ArtifactSnap,
  type GameEvent,
  type PlayerSnap,
  type Results,
  type Snapshot,
} from '../src/shared/protocol';

const IDENT: Quat = { x: 0, y: 0, z: 0, w: 1 };
const EDGE_R = 0.1;
const DOWN: Vec = { x: 0, y: -1, z: 0 };
const UP: Vec = { x: 0, y: 1, z: 0 };

const GROUND_FILTER_PLAYER = C.groups(C.G_PLAYER, C.G_STATIC | C.G_ARTIFACT | C.G_PLAYER_BARRIER);
const STATIC_FOR_ARTIFACT = C.groups(C.G_ARTIFACT, C.G_STATIC | C.G_CARGO_BARRIER);
const STATIC_ONLY = C.groups(C.G_ARTIFACT, C.G_STATIC);
const PLAYERS_ONLY = C.groups(C.G_ARTIFACT, C.G_PLAYER);

interface Grip {
  local: Vec; // anchor in artifact local space (boxes) or world offset (ball)
  ball: boolean;
  rest: number;
}

interface PlayerBody {
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
}

export interface SimOptions {
  names: string[];
  slots: number[]; // which slots are in play
}

export class Sim {
  world: RAPIER.World;
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

  // puzzle state
  cp = 0;
  plateT = 0;
  gateOpen = false;
  gateT = 0;
  recvT = 0;
  bridgeOpen = false;
  bridgeT = 0;
  leverOn = false;
  leverT = 0;
  leverHold = 0;
  liftState = 0; // 0 locked, 1 ready, 2 rising, 3 top
  liftT = 0;
  liftY = LEVEL.lift.bottom;
  liftGateT = 0;
  boardT = 0;
  aboard = 0;
  goalT = 0;
  finished = false;
  results: Results | null = null;

  drops = 0;
  falls = 0;
  shifts = 0;
  resetVotes = new Map<number, number>();
  chapter = 0;

  private gateBody!: RAPIER.RigidBody;
  private bridgeBody!: RAPIER.RigidBody;
  private liftBody!: RAPIER.RigidBody;
  private liftGateBody!: RAPIER.RigidBody;
  private plateShape: RAPIER.Cuboid;
  private leverShape: RAPIER.Cuboid;
  private names: string[];

  constructor(opts: SimOptions) {
    this.names = opts.names;
    this.world = new RAPIER.World({ x: 0, y: C.GRAVITY, z: 0 });
    this.world.timestep = C.TICK_DT;
    this.world.numSolverIterations = 6;
    this.buildStatic();
    this.buildKinematics();
    this.createArtifact();
    for (const slot of opts.slots) this.createPlayer(slot, opts.names[slot] ?? C.SLOT_NAMES[slot]);
    this.plateShape = new RAPIER.Cuboid(...LEVEL.plate.trigger.h);
    this.leverShape = new RAPIER.Cuboid(...LEVEL.lever.trigger.h);
  }

  free() {
    this.world.free();
  }

  // ------------------------------------------------------------------ construction
  private buildStatic() {
    const fixed = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    for (const isl of LEVEL.islands) {
      for (const b of islandBoxes(isl)) {
        const desc = RAPIER.ColliderDesc.cuboid(b.s[0] / 2, b.s[1] / 2, b.s[2] / 2)
          .setTranslation(...b.p)
          .setRotation(quatYaw(b.yaw))
          .setFriction(1.0)
          .setCollisionGroups(C.groups(C.G_STATIC, C.G_PLAYER | C.G_ARTIFACT));
        this.world.createCollider(desc, fixed);
      }
    }
    for (const b of LEVEL.boxes) {
      const mode = b.collide ?? 'solid';
      if (mode === 'none') continue;
      const desc = RAPIER.ColliderDesc.cuboid(b.s[0] / 2, b.s[1] / 2, b.s[2] / 2).setTranslation(...b.p);
      if (b.rot) desc.setRotation(quatEuler(b.rot[0], b.rot[1], b.rot[2]));
      const walkable = b.tag === 'bridge' || b.tag === 'ramp';
      desc.setFriction(walkable ? 1.0 : 0.15);
      if (mode === 'solid') desc.setCollisionGroups(C.groups(C.G_STATIC, C.G_PLAYER | C.G_ARTIFACT));
      else if (mode === 'cargo') desc.setCollisionGroups(C.groups(C.G_CARGO_BARRIER, C.G_ARTIFACT));
      else desc.setCollisionGroups(C.groups(C.G_PLAYER_BARRIER, C.G_PLAYER));
      this.world.createCollider(desc, fixed);
    }
  }

  private staticGroups() {
    return C.groups(C.G_STATIC, C.G_PLAYER | C.G_ARTIFACT);
  }

  private buildKinematics() {
    const W = this.world;
    // chapter 1 gate
    const g = LEVEL.gate;
    this.gateBody = W.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(...g.p));
    W.createCollider(
      RAPIER.ColliderDesc.cuboid(g.s[0] / 2, g.s[1] / 2, g.s[2] / 2).setFriction(0.15).setCollisionGroups(this.staticGroups()),
      this.gateBody,
    );
    // chapter 2 drawbridge (hinged at far edge, raised initially)
    const db = LEVEL.drawbridge;
    this.bridgeBody = W.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(...db.hinge).setRotation(quatX(drawbridgeAngle(0))),
    );
    W.createCollider(
      RAPIER.ColliderDesc.cuboid(db.width / 2, db.thick / 2, db.len / 2)
        .setTranslation(0, -db.thick / 2, db.len / 2)
        .setFriction(1.0)
        .setCollisionGroups(this.staticGroups()),
      this.bridgeBody,
    );
    for (const side of [-1, 1]) {
      W.createCollider(
        RAPIER.ColliderDesc.cuboid(0.2, db.curb / 2, db.len / 2)
          .setTranslation(side * (db.width / 2 - 0.2), db.curb / 2, db.len / 2)
          .setFriction(0.15)
          .setCollisionGroups(this.staticGroups()),
        this.bridgeBody,
      );
    }
    // chapter 3 lift
    const L = LEVEL.lift;
    this.liftBody = W.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(L.cx, L.bottom, L.cz));
    W.createCollider(
      RAPIER.ColliderDesc.cuboid(L.w / 2, 0.25, L.d / 2).setTranslation(0, -0.25, 0).setFriction(1.0).setCollisionGroups(this.staticGroups()),
      this.liftBody,
    );
    for (const side of [-1, 1]) {
      W.createCollider(
        RAPIER.ColliderDesc.cuboid(0.15, L.railH / 2, L.d / 2)
          .setTranslation(side * (L.w / 2 + 0.15), L.railH / 2, 0)
          .setFriction(0.15)
          .setCollisionGroups(this.staticGroups()),
        this.liftBody,
      );
    }
    this.liftGateBody = W.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(L.cx, this.liftGateY(), L.cz + L.d / 2 + 0.15),
    );
    W.createCollider(
      RAPIER.ColliderDesc.cuboid(L.w / 2 + 0.3, L.railH / 2, 0.15).setFriction(0.15).setCollisionGroups(this.staticGroups()),
      this.liftGateBody,
    );
  }

  private liftGateY() {
    const L = LEVEL.lift;
    const lowered = this.liftY - L.railH / 2 - 0.06;
    const raised = this.liftY + L.railH / 2;
    return lowered + (raised - lowered) * smooth(this.liftGateT);
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
    const spec = shapeSpec(ShapeId.CUBE);
    const s = LEVEL.spawn.artifact;
    this.artifact = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(s[0], s[1], s[2])
        .setCcdEnabled(true)
        .setLinearDamping(0.05)
        .setAngularDamping(spec.angularDamping),
    );
    this.artCol = this.world.createCollider(this.artifactColliderDesc(spec), this.artifact);
    this.shape = ShapeId.CUBE;
  }

  private createPlayer(slot: number, name: string) {
    const sp = LEVEL.spawn.players[slot];
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
    };
  }

  // ------------------------------------------------------------------ inputs
  setInput(slot: number, mx: number, mz: number, jumpCount: number, grab: boolean, respawnCount: number) {
    const p = this.players[slot];
    if (!p) return;
    const m = Math.hypot(mx, mz);
    if (!Number.isFinite(m)) return;
    if (m > 1) {
      mx /= m;
      mz /= m;
    }
    if (Math.hypot(mx, mz) > 0.1 || grab || (jumpCount | 0) !== p.jumpCount) p.lastActive = this.time;
    p.mx = mx;
    p.mz = mz;
    p.grab = grab;
    p.jumpCount = jumpCount | 0;
    p.respawnCount = respawnCount | 0;
  }

  setConnected(slot: number, connected: boolean) {
    const p = this.players[slot];
    if (!p) return;
    p.connected = connected;
    if (!connected) {
      p.mx = p.mz = 0;
      p.grab = false;
      p.grip = null;
    }
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
    this.time += dt;
    if (playing) this.runTime += dt;
    this.updatePuzzles(dt, playing);
    this.updateKinematics();
    for (const p of this.players) if (p) this.updatePlayer(p, dt, playing);
    this.updatePushers(dt);
    this.updateGrips(dt);
    this.updateArtifactForces(dt);
    this.world.step();
    this.postStep(dt, playing);
  }

  private updateKinematics() {
    const g = LEVEL.gate;
    const openY = g.p[1] - g.drop * smooth(this.gateT);
    this.gateBody.setNextKinematicTranslation({ x: g.p[0], y: openY, z: g.p[2] });
    const u = this.bridgeT;
    // unfold with a little overshoot bounce
    const eased = u >= 1 ? 1 : smooth(u) + Math.sin(u * Math.PI) * 0.06 * u;
    this.bridgeBody.setNextKinematicRotation(quatX(drawbridgeAngle(Math.min(1.04, eased))));
    const L = LEVEL.lift;
    this.liftBody.setNextKinematicTranslation({ x: L.cx, y: this.liftY, z: L.cz });
    this.liftGateBody.setNextKinematicTranslation({ x: L.cx, y: this.liftGateY(), z: L.cz + L.d / 2 + 0.15 });
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

  private updatePlayer(p: PlayerBody, dt: number, playing: boolean) {
    const body = p.body;
    const v = body.linvel();
    const hit = this.castGround(p);
    const wasGrounded = p.grounded;
    p.grounded = !!hit && v.y < 4.5;
    if (p.grounded) {
      p.coyote = 0.12;
      p.airTime = 0;
    } else {
      p.coyote -= dt;
      p.airTime += dt;
    }
    const canMove = playing && p.connected && p.respawnTimer <= 0;
    const mx = canMove ? p.mx : 0;
    const mz = canMove ? p.mz : 0;
    const speed = p.grip ? C.GRIP_SPEED : C.WALK_SPEED;
    const tx = mx * speed;
    const tz = mz * speed;
    const accel = p.grounded ? 46 : 15;
    let dvx = tx - v.x;
    let dvz = tz - v.z;
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
      if (canMove) p.jumpBuffer = 0.15;
    }
    if (p.jumpBuffer > 0) {
      p.jumpBuffer -= dt;
      if (p.coyote > 0) {
        vy = C.JUMP_SPEED;
        p.jumpBuffer = 0;
        p.coyote = 0;
        p.grounded = false;
      }
    }
    // snappier falls
    if (!p.grounded && vy < 0) vy += C.GRAVITY * 0.35 * dt;
    body.setLinvel({ x: v.x + dvx, y: vy, z: v.z + dvz }, true);

    // facing
    let targetYaw: number | null = null;
    if (p.grip) {
      const a = this.anchorWorld(p.grip);
      const pos = body.translation();
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
    if (p.respawnTimer > 0) p.respawnTimer -= dt;
    void wasGrounded;
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
      if (!p.connected || p.respawnTimer > 0 || this.finished) continue;
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
      if (!p.grip) {
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
    for (const p of this.players) {
      if (!p) continue;
      if (!p.grab || !p.connected) {
        if (p.grip) {
          p.grip = null;
          this.events.push({ k: 'release', by: p.slot });
        }
        continue;
      }
      if (!p.grip) {
        if (p.respawnTimer <= 0 && !this.finished) this.tryGrip(p);
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

  private gripCount() {
    let n = 0;
    for (const p of this.players) if (p && p.grip) n++;
    return n;
  }

  private artifactExtentY(shape: number, q: Quat) {
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

    // viscous ground drag (heavy feel + speed scaling with number of pushers)
    if (this.artGrounded) {
      const ext = this.artifactExtentY(this.shape, q);
      const k = spec.groundDrag * C.ARTIFACT_MASS * dt;
      const imp = { x: -v.x * k, y: 0, z: -v.z * k };
      if (spec.ball) art.applyImpulse(imp, true);
      else art.applyImpulseAtPoint(imp, { x: c.x, y: c.y - ext * 0.7, z: c.z }, true);
      if (spec.yawDamp > 0) art.applyTorqueImpulse({ x: 0, y: -w.y * spec.yawDamp * dt, z: 0 }, true);
    }

    // wind and fan
    for (const zone of LEVEL.windZones) {
      if (!inBox(c, zone.min, zone.max)) continue;
      const s = windStrength(zone, this.time);
      if (s <= 0) continue;
      const F = zone.force * s * spec.wind;
      art.applyImpulse({ x: zone.dir[0] * F * dt, y: 0, z: zone.dir[2] * F * dt }, true);
      if (this.shape === ShapeId.LONG) {
        const sign = windCycleIndex(zone, this.time) % 2 === 0 ? 1 : -1;
        art.applyTorqueImpulse({ x: 0, y: sign * 19 * s * dt, z: 0 }, true);
      }
    }

    // TALL: steady when two or more couriers hold it
    if (this.shape === ShapeId.TALL) {
      const grippers = this.gripCount();
      if (grippers >= 2) {
        const up = rotate(q, UP);
        const err = cross(up, UP);
        const tx = err.x * 320 - w.x * 48;
        const tz = err.z * 320 - w.z * 48;
        const m = Math.hypot(tx, tz);
        const lim = 240;
        const sc = m > lim ? lim / m : 1;
        art.applyTorqueImpulse({ x: tx * sc * dt, y: 0, z: tz * sc * dt }, true);
      } else if (this.artGrounded) {
        // unsteadied: wobbles while moving (top-heavy pillar)
        const sp = hlen(v);
        if (sp > 0.35) {
          const k = Math.min(1, sp / 1.4) * 26 * dt;
          const a = this.time * 1.7;
          art.applyTorqueImpulse({ x: Math.sin(a * 2.3) * k + (v.z / sp) * k * 0.6, y: 0, z: Math.cos(a * 1.9) * k - (v.x / sp) * k * 0.6 }, true);
        }
      }
    }

    // receiver magnet: gently pull a roughly aligned LONG into the slot
    if (this.shape === ShapeId.LONG && !this.bridgeOpen) {
      const R = LEVEL.receiver;
      const dx = R.p[0] - c.x;
      const dz = R.p[2] - c.z;
      const d = Math.hypot(dx, dz);
      const yawErr = axisDiff(yawOfX(q), R.yaw);
      if (d < 3.4 && Math.abs(yawErr) < 0.85 && c.y < 2.5) {
        const k = 14;
        const fx = clamp(dx * k - v.x * 6, -26, 26);
        const fz = clamp(dz * k - v.z * 6, -26, 26);
        art.applyImpulse({ x: fx * dt, y: 0, z: fz * dt }, true);
        const ty = clamp(-yawErr * 40 - w.y * 9, -30, 30);
        art.applyTorqueImpulse({ x: 0, y: ty * dt, z: 0 }, true);
      }
    }
  }

  private checkArtifactGrounded() {
    let grounded = false;
    this.world.contactPairsWith(this.artCol, (other) => {
      if (grounded) return;
      const og = other.collisionGroups() >>> 16;
      if (og & C.G_PLAYER) return;
      this.world.contactPair(this.artCol, other, (m) => {
        if (m.numSolverContacts() > 0 && Math.abs(m.normal().y) > 0.45) grounded = true;
      });
    });
    return grounded;
  }

  private postStep(dt: number, playing: boolean) {
    const art = this.artifact;
    const spec = shapeSpec(this.shape);
    const v = art.linvel();
    // clamp artifact speeds (no launching into orbit)
    const hv = Math.hypot(v.x, v.z);
    let nvx = v.x;
    let nvz = v.z;
    let nvy = v.y;
    let clamped = false;
    if (hv > spec.maxSpeed) {
      nvx *= spec.maxSpeed / hv;
      nvz *= spec.maxSpeed / hv;
      clamped = true;
    }
    if (nvy > 7) {
      nvy = 7;
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
      const mat = c.z < -11.5 && c.z > -19.5 ? 'wood' : this.shape === ShapeId.ROUND ? 'metal' : 'heavy';
      this.events.push({ k: 'impact', v: r3(Math.min(dv, 12)), mat });
    }
    this.prevArtVel = { x: nvx, y: nvy, z: nvz };

    for (const p of this.players) {
      if (!p) continue;
      const pv = p.body.linvel();
      const sp = len(pv);
      if (sp > 22) p.body.setLinvel(scale(pv, 22 / sp), true);
      else if (pv.y > 11) p.body.setLinvel({ x: pv.x, y: 11, z: pv.z }, true);
    }

    if (!playing || this.finished) return;

    const c = art.translation();
    // artifact fell off the world
    if (c.y < C.KILL_Y) {
      this.drops++;
      this.penalty += C.DROP_PENALTY_MS / 1000;
      this.events.push({ k: 'drop' });
      this.resetToCheckpoint();
      return;
    }
    // players fell / got separated
    for (const p of this.players) {
      if (!p) continue;
      const pp = p.body.translation();
      if (pp.y < C.KILL_Y) {
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

    // checkpoints
    for (const cp of LEVEL.checkpoints) {
      if (cp.id <= this.cp) continue;
      if (inBox(c, cp.trigger.min, cp.trigger.max)) {
        this.cp = cp.id;
        this.events.push({ k: 'checkpoint', cp: cp.id });
      }
    }
    this.chapter = chapterAt(c.z, this.cp);

    // goal
    const G = LEVEL.goal;
    const active = this.requiredPlayers();
    const inRing = (q: Vec, r: number) => Math.hypot(q.x - G.p[0], q.z - G.p[2]) <= r && Math.abs(q.y - G.p[1]) < 3.2;
    const allIn = active.length > 0 && inRing(c, G.r + 0.4) && active.every((p) => inRing(p.body.translation(), G.r));
    this.goalT = allIn ? this.goalT + dt : Math.max(0, this.goalT - dt * 2);
    if (this.goalT >= C.GOAL_HOLD_S) this.finish();
  }

  private updatePuzzles(dt: number, playing: boolean) {
    const c = this.artifact.translation();
    const q = this.artifact.rotation();
    // pressure plate -> gate
    if (!this.gateOpen) {
      const T = LEVEL.plate.trigger;
      const on = playing && this.artCol.intersectsShape(this.plateShape, { x: T.p[0], y: T.p[1], z: T.p[2] }, IDENT);
      this.plateT = on ? this.plateT + dt : Math.max(0, this.plateT - dt * 1.5);
      if (this.plateT >= LEVEL.plate.hold) {
        this.gateOpen = true;
        this.events.push({ k: 'gate' });
      }
    } else if (this.gateT < 1) {
      this.gateT = Math.min(1, this.gateT + dt / LEVEL.gate.time);
    }
    // LONG receiver -> drawbridge
    if (!this.bridgeOpen) {
      const R = LEVEL.receiver;
      const yawErr = Math.abs(axisDiff(yawOfX(q), R.yaw));
      const v = this.artifact.linvel();
      const ok =
        playing &&
        this.shape === ShapeId.LONG &&
        inBox(c, R.zone.min, R.zone.max) &&
        yawErr < 0.42 &&
        Math.hypot(v.x, v.z) < 2.5;
      this.recvT = ok ? this.recvT + dt : Math.max(0, this.recvT - dt * 1.5);
      if (this.recvT >= R.hold) {
        this.bridgeOpen = true;
        this.events.push({ k: 'bridge' });
      }
    } else if (this.bridgeT < 1) {
      this.bridgeT = Math.min(1, this.bridgeT + dt / LEVEL.drawbridge.time);
    }
    // high lever -> lift ready
    if (!this.leverOn) {
      const T = LEVEL.lever.trigger;
      const upright = rotate(q, UP).y > 0.975; // a leaning pillar just scrapes past the lever
      const touching = playing && upright && this.artCol.intersectsShape(this.leverShape, { x: T.p[0], y: T.p[1], z: T.p[2] }, IDENT);
      this.leverHold = touching ? this.leverHold + dt : 0;
      if (this.leverHold >= 0.45) {
        this.leverOn = true;
        this.liftState = 1;
        this.events.push({ k: 'lever' });
      }
    } else if (this.leverT < 1) {
      this.leverT = Math.min(1, this.leverT + dt / 0.5);
    }
    // lift boarding and ride
    const L = LEVEL.lift;
    const onLift = (p: Vec, maxUp: number) =>
      Math.abs(p.x - L.cx) <= L.w / 2 && Math.abs(p.z - L.cz) <= L.d / 2 && p.y >= this.liftY - 0.2 && p.y <= this.liftY + maxUp;
    const active = this.requiredPlayers();
    this.aboard = active.filter((p) => onLift(p.body.translation(), 3)).length;
    if (this.liftState === 1) {
      const all = active.length > 0 && this.aboard === active.length && onLift(c, 5);
      this.boardT = all && playing ? this.boardT + dt : 0;
      if (this.boardT >= L.board) {
        this.liftState = 2;
        this.events.push({ k: 'liftStart' });
      }
    } else if (this.liftState === 2) {
      if (this.liftGateT < 1) {
        this.liftGateT = Math.min(1, this.liftGateT + dt / 0.45);
      } else {
        this.liftT = Math.min(1, this.liftT + dt / L.time);
        this.liftY = L.bottom + (L.top - L.bottom) * smooth(this.liftT);
        if (this.liftT >= 1) {
          this.liftState = 3;
          this.events.push({ k: 'liftTop' });
        }
      }
    }
    // reset votes expire
    for (const [slot, t] of this.resetVotes) if (this.time - t > 10) this.resetVotes.delete(slot);
  }

  // ------------------------------------------------------------------ resets
  private bestAnchor(near: Vec, slot: number): Vec {
    let best: Vec | null = null;
    let bestD = Infinity;
    for (const a of LEVEL.anchors) {
      if (a.cp > this.cp) continue;
      if (a.req === 'gate' && !this.gateOpen) continue;
      if (a.req === 'bridge' && !this.bridgeOpen) continue;
      if (a.req === 'lift' && this.liftState < 3) continue;
      const p = { x: a.p[0], y: a.p[1], z: a.p[2] };
      const d = Math.hypot(p.x - near.x, (p.y - near.y) * 3, p.z - near.z);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    const b = best ?? { x: LEVEL.spawn.players[0][0], y: 0, z: LEVEL.spawn.players[0][2] };
    return { x: b.x + (slot - 1) * 0.9, y: b.y, z: b.z };
  }

  respawnPlayer(p: PlayerBody, fell: boolean) {
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
    this.events.push({ k: 'respawn', by: p.slot, x: r3(pos.x), y: r3(pos.y), z: r3(pos.z) });
    void fell;
  }

  resetToCheckpoint() {
    const cp = LEVEL.checkpoints[this.cp];
    this.applyShape(ShapeId.CUBE, { x: cp.artifact[0], y: cp.artifact[1], z: cp.artifact[2] }, IDENT, { x: 0, y: 0, z: 0 });
    this.artifact.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.prevArtVel = { x: 0, y: 0, z: 0 };
    this.recvT = 0;
    this.plateT = 0;
    this.goalT = 0;
    this.resetVotes.clear();
    for (const p of this.players) {
      if (!p) continue;
      const s = cp.players[p.slot];
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
      this.drops++;
      this.penalty += C.DROP_PENALTY_MS / 1000;
      this.events.push({ k: 'toast', text: 'Artifact recalled to the checkpoint (+7s)' });
      this.resetToCheckpoint();
    } else {
      const name = this.players[slot]?.name ?? 'Someone';
      this.events.push({ k: 'toast', text: `${name} wants to recall the artifact — press T to agree` });
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
    if (this.time - this.lastShiftAt < C.SHIFT_COOLDOWN_MS / 1000) return fail('Shift recharging…');
    const pos = p.body.translation();
    const proj = this.artCol.projectPoint(pos, false);
    if (!proj || len(sub(proj.point, pos)) - C.PLAYER_RADIUS > C.SHIFT_RANGE) return fail('Get closer to the artifact!');
    const pose = this.findShiftPose(shape);
    if (!pose) return fail('No room to shift!');
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
    this.recvT = 0;
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
      for (const z of LEVEL.longAxisZones) {
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
  private finish() {
    if (this.finished) return;
    this.finished = true;
    const timeMs = Math.round((this.runTime + this.penalty) * 1000);
    const { score, crowns } = scoreFor(timeMs, this.drops, this.falls);
    const titles = ['Certified Clumsy Couriers', 'Reliable Royal Movers', 'Legendary Shape-Shifters'];
    this.results = {
      timeMs,
      rawMs: Math.round(this.runTime * 1000),
      drops: this.drops,
      falls: this.falls,
      shifts: this.shifts,
      score,
      crowns,
      names: this.players.map((p) => p?.name ?? ''),
      title: titles[crowns - 1],
    };
    for (const p of this.players) if (p) p.grip = null;
    this.events.push({ k: 'finish', results: this.results });
  }

  // ------------------------------------------------------------------ snapshot
  snapshot(phase: Snapshot['ph']): Snapshot {
    const pl: PlayerSnap[] = [];
    for (const p of this.players) {
      if (!p) continue;
      const t = p.body.translation();
      const v = p.body.linvel();
      let flags = 0;
      if (p.grounded) flags |= PF_GROUNDED;
      if (p.connected) flags |= PF_CONNECTED;
      if (Math.hypot(v.x, v.z) > 0.6) flags |= PF_MOVING;
      if (p.respawnTimer > 0) flags |= PF_RESPAWNING;
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
    const wind = windStrength(LEVEL.windZones[0], this.time);
    const fan = windStrength(LEVEL.windZones[1], this.time);
    return {
      t: Math.round(this.time * 1000),
      ph: phase,
      el: Math.round((this.runTime + this.penalty) * 1000),
      cp: this.cp,
      cd: Math.max(0, Math.round((C.SHIFT_COOLDOWN_MS / 1000 - (this.time - this.lastShiftAt)) * 1000)),
      pl,
      ar,
      w: {
        plate: r3(Math.min(1, this.plateT / LEVEL.plate.hold)),
        gate: r3(this.gateT),
        recv: r3(Math.min(1, this.recvT / LEVEL.receiver.hold)),
        bridge: r3(this.bridgeT),
        lever: r3(this.leverT),
        liftY: r3(this.liftY),
        liftGate: r3(this.liftGateT),
        lift: this.liftState,
        aboard: this.aboard,
        wind: r3(wind),
        fan: r3(fan),
        goal: r3(Math.min(1, this.goalT / C.GOAL_HOLD_S)),
        steady: this.gripCount(),
        resetVotes: this.resetVotes.size,
      },
    };
  }

  // ------------------------------------------------------------------ dev helpers
  devWarp(cpIndex: number) {
    const idx = clamp(cpIndex | 0, 0, LEVEL.checkpoints.length - 1);
    this.cp = idx;
    if (idx >= 1) this.gateOpen = true, (this.gateT = 1);
    if (idx >= 2) this.bridgeOpen = true, (this.bridgeT = 1);
    if (idx >= 3) {
      this.leverOn = true;
      this.leverT = 1;
      this.liftState = 3;
      this.liftT = 1;
      this.liftY = LEVEL.lift.top;
      this.liftGateT = 1;
    }
    this.resetToCheckpoint();
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
    p.body.setTranslation({ x, y: y + C.PLAYER_CENTER_Y, z }, true);
    p.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  }
}

export async function initPhysics() {
  await RAPIER.init();
}

export { SHAPES };
