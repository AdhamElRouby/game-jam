// Runtime for data-driven mechanisms (src/shared/maps/types.ts). Each mechanism builds its own colliders, runs its rules
// every tick, may emit a boolean signal (its id) and reports a few numbers for the snapshot. Mechanisms owned by another
// map of the shared course are frozen: solved if that map comes earlier in the adventure, untouched if later.
import RAPIER from '@dimforge/rapier3d-compat';
import * as C from '../src/shared/constants';
import { drawbridgeAngle, smooth, windCycleIndex, windStrength } from '../src/shared/level';
import type {
  BlockerDef,
  CartDef,
  CollectDef,
  CraneDef,
  DockDef,
  DrawbridgeDef,
  GateDef,
  HazardDef,
  LiftDef,
  LogicDef,
  MechDef,
  MoverDef,
  PlateDef,
  PufferDef,
  PushLeverDef,
  RotorDef,
  SlipDef,
  SpringDef,
  SwitchDef,
  WindDef,
  WobbleDef,
} from '../src/shared/maps/types';
import { inBox } from '../src/shared/maps/types';
import type { WorldSnap, GameEvent } from '../src/shared/protocol';
import { ShapeId, shapeSpec } from '../src/shared/shapes';
import { axisDiff, clamp, hlen, len, quatX, quatYaw, r3, rotate, sub, yawOfX, type Quat, type Vec } from '../src/shared/math';
import type { PlayerBody, Sim } from './sim';

export type Freeze = 'live' | 'solved' | 'initial';

const IDENT: Quat = { x: 0, y: 0, z: 0, w: 1 };
const UP: Vec = { x: 0, y: 1, z: 0 };
const ZERO: Vec = { x: 0, y: 0, z: 0 };
const v3 = (a: [number, number, number]): Vec => ({ x: a[0], y: a[1], z: a[2] });
const STATIC_GROUPS = C.groups(C.G_STATIC, C.G_PLAYER | C.G_ARTIFACT);
const CARGO_GROUPS = C.groups(C.G_CARGO_BARRIER, C.G_ARTIFACT);
const PLAYER_ONLY_GROUPS = C.groups(C.G_PLAYER_BARRIER, C.G_PLAYER);
const quatZ = (a: number): Quat => ({ x: 0, y: 0, z: Math.sin(a / 2), w: Math.cos(a / 2) });

export abstract class Mech<D extends MechDef = MechDef> {
  on = false;
  constructor(
    public sim: Sim,
    public def: D,
    public i: number,
    public freeze: Freeze,
  ) {}
  get live() {
    return this.freeze === 'live';
  }
  protected ev(e: GameEvent) {
    this.sim.events.push(e);
  }
  protected mev(ev: string, extra: Record<string, number> = {}) {
    this.sim.events.push({ k: 'mech', i: this.i, ev, ...extra });
  }
  /** create colliders */
  build() {}
  /** start of the tick: triggers, signals, kinematic targets */
  pre(dt: number, playing: boolean) {
    void dt;
    void playing;
  }
  /** after couriers pushed/pulled: forces on bodies (wind, magnets, launches) */
  forces(dt: number, playing: boolean) {
    void dt;
    void playing;
  }
  /** couriers standing on a collider of this mechanism are carried at this velocity */
  velAt(p: Vec): Vec | null {
    void p;
    return null;
  }
  state(): number[] {
    return [this.on ? 1 : 0];
  }
  /** put into the solved state */
  solve() {
    this.on = true;
  }
  /** the artifact was recalled to a checkpoint */
  reset() {}
  /** the artifact changed form */
  shifted() {}
  /** 0..1 for hints and HUD */
  progress(): number {
    return this.on ? 1 : 0;
  }
  legacyInto(w: WorldSnap) {
    void w;
  }
}

// ---------------------------------------------------------------- plate

class PlateMech extends Mech<PlateDef> {
  t = 0;
  private shape!: RAPIER.Cuboid;
  build() {
    this.shape = new RAPIER.Cuboid(...this.def.trigger.h);
  }
  pre(dt: number, playing: boolean) {
    const d = this.def;
    if (!this.live || (this.on && d.latch !== false)) return;
    const sim = this.sim;
    const T = d.trigger;
    let pressed = false;
    if (playing) {
      if (d.by !== 'players' && (!d.shapes || d.shapes.includes(sim.shape))) {
        pressed = sim.artCol.intersectsShape(this.shape, v3(T.p), IDENT);
      }
      if (!pressed && d.by !== 'artifact') {
        let n = 0;
        for (const p of sim.players) {
          if (!p || !p.connected || p.inside || p.respawnTimer > 0) continue;
          const q = p.body.translation();
          const fy = q.y - C.PLAYER_CENTER_Y + 0.05;
          if (Math.abs(q.x - T.p[0]) <= T.h[0] + 0.15 && Math.abs(q.z - T.p[2]) <= T.h[2] + 0.15 && fy >= T.p[1] - T.h[1] - 0.2 && fy <= T.p[1] + T.h[1]) n++;
        }
        pressed = n >= Math.max(1, Math.min(d.need ?? 1, sim.requiredPlayers().length));
      }
    }
    const was = this.on;
    this.t = pressed ? this.t + dt : Math.max(0, this.t - dt * 1.5);
    if (d.latch !== false) {
      if (this.t >= d.hold) this.on = true;
    } else this.on = pressed && this.t >= d.hold;
    if (this.on !== was) this.mev(this.on ? 'on' : 'off');
  }
  solve() {
    this.on = true;
    this.t = this.def.hold;
  }
  reset() {
    if (!this.on) this.t = 0;
  }
  progress() {
    return this.on ? 1 : Math.min(1, this.t / this.def.hold);
  }
  state() {
    return [r3(this.progress()), this.on ? 1 : 0];
  }
  legacyInto(w: WorldSnap) {
    if (this.def.legacy === 'plate') w.plate = r3(Math.min(1, this.t / this.def.hold));
  }
}

// ---------------------------------------------------------------- gate

class GateMech extends Mech<GateDef> {
  t = 0;
  private opening = false;
  private body!: RAPIER.RigidBody;
  private box!: RAPIER.Cuboid;
  build() {
    const d = this.def;
    const W = this.sim.world;
    this.body = W.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(...d.p));
    W.createCollider(
      RAPIER.ColliderDesc.cuboid(d.s[0] / 2, d.s[1] / 2, d.s[2] / 2)
        .setFriction(0.15)
        .setCollisionGroups(d.collide === 'cargo' ? CARGO_GROUPS : STATIC_GROUPS),
      this.body,
    );
    this.box = new RAPIER.Cuboid(d.s[0] / 2, d.s[1] / 2, d.s[2] / 2);
    if (this.freeze === 'solved') this.solve();
    this.place();
  }
  private place() {
    const d = this.def;
    this.body.setNextKinematicTranslation({ x: d.p[0], y: d.p[1] - d.drop * smooth(this.t), z: d.p[2] });
  }
  /** nothing (artifact, courier) where the closed gate would be */
  private clear() {
    let blocked = false;
    const d = this.def;
    this.sim.world.intersectionsWithShape(
      v3(d.p),
      IDENT,
      this.box,
      () => ((blocked = true), false),
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      C.groups(C.G_STATIC, C.G_ARTIFACT | (d.collide === 'cargo' ? 0 : C.G_PLAYER)),
    );
    return !blocked;
  }
  pre(dt: number) {
    const d = this.def;
    if (this.live) {
      const want = this.sim.sig(d.when) || (!!d.latch && this.opening);
      if (want) {
        if (!this.opening) {
          this.opening = true;
          if (d.legacy === 'gate') this.ev({ k: 'gate' });
          else this.mev('open');
        }
        this.t = Math.min(1, this.t + dt / d.time);
      } else if (this.t > 0) {
        if (this.clear()) {
          this.t = Math.max(0, this.t - dt / d.time);
          if (this.opening) this.mev('close');
          this.opening = false;
        }
      }
    }
    this.on = this.t >= 0.999;
    this.place();
  }
  solve() {
    this.t = 1;
    this.opening = true;
    this.on = true;
  }
  progress() {
    return this.t;
  }
  state() {
    return [r3(this.t)];
  }
  legacyInto(w: WorldSnap) {
    if (this.def.legacy === 'gate') w.gate = r3(this.t);
  }
}

// ---------------------------------------------------------------- dock (receiver socket)

class DockMech extends Mech<DockDef> {
  t = 0;
  forces(dt: number) {
    const d = this.def;
    const sim = this.sim;
    if (!this.live || this.on || !d.magnet || sim.shape !== d.shape || sim.artifactLocked()) return;
    // magnet: gently pull a roughly aligned form into the slot
    const art = sim.artifact;
    const c = art.translation();
    const q = art.rotation();
    const v = art.linvel();
    const w = art.angvel();
    const dx = d.p[0] - c.x;
    const dz = d.p[2] - c.z;
    const dd = Math.hypot(dx, dz);
    const yawErr = axisDiff(yawOfX(q), d.yaw);
    if (dd < 3.4 && Math.abs(yawErr) < 0.85 && c.y < d.p[1] + 2.5) {
      const k = 14;
      const fx = clamp(dx * k - v.x * 6, -26, 26);
      const fz = clamp(dz * k - v.z * 6, -26, 26);
      art.applyImpulse({ x: fx * dt, y: 0, z: fz * dt }, true);
      const ty = clamp(-yawErr * 40 - w.y * 9, -30, 30);
      art.applyTorqueImpulse({ x: 0, y: ty * dt, z: 0 }, true);
    }
  }
  pre(dt: number, playing: boolean) {
    const d = this.def;
    const sim = this.sim;
    if (!this.live || this.on) return;
    const c = sim.artifact.translation();
    const v = sim.artifact.linvel();
    const yawErr = Math.abs(axisDiff(yawOfX(sim.artifact.rotation()), d.yaw));
    const ok = playing && sim.shape === d.shape && inBox(c, d.zone.min, d.zone.max) && yawErr < d.yawTol && hlen(v) < d.maxSpeed;
    this.t = ok ? this.t + dt : Math.max(0, this.t - dt * 1.5);
    if (this.t >= d.hold) {
      this.on = true;
      this.mev('dock');
    }
  }
  shifted() {
    if (!this.on) this.t = 0;
  }
  reset() {
    if (!this.on) this.t = 0;
  }
  solve() {
    this.on = true;
    this.t = this.def.hold;
  }
  progress() {
    return this.on ? 1 : Math.min(1, this.t / this.def.hold);
  }
  state() {
    return [r3(this.progress()), this.on ? 1 : 0];
  }
  legacyInto(w: WorldSnap) {
    if (this.def.legacy === 'recv') w.recv = r3(Math.min(1, this.t / this.def.hold));
  }
}

// ---------------------------------------------------------------- drawbridge

class DrawbridgeMech extends Mech<DrawbridgeDef> {
  t = 0;
  private opening = false;
  private body!: RAPIER.RigidBody;
  build() {
    const db = this.def;
    const W = this.sim.world;
    this.body = W.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(...db.hinge).setRotation(quatX(drawbridgeAngle(0))));
    W.createCollider(
      RAPIER.ColliderDesc.cuboid(db.width / 2, db.thick / 2, db.len / 2).setTranslation(0, -db.thick / 2, db.len / 2).setFriction(1.0).setCollisionGroups(STATIC_GROUPS),
      this.body,
    );
    for (const side of [-1, 1]) {
      W.createCollider(
        RAPIER.ColliderDesc.cuboid(0.2, db.curb / 2, db.len / 2)
          .setTranslation(side * (db.width / 2 - 0.2), db.curb / 2, db.len / 2)
          .setFriction(0.15)
          .setCollisionGroups(STATIC_GROUPS),
        this.body,
      );
    }
    if (this.freeze === 'solved') this.solve();
    this.place();
  }
  private place() {
    const u = this.t;
    // unfold with a little overshoot bounce
    const eased = u >= 1 ? 1 : smooth(u) + Math.sin(u * Math.PI) * 0.06 * u;
    this.body.setNextKinematicRotation(quatX(drawbridgeAngle(Math.min(1.04, eased))));
  }
  pre(dt: number) {
    if (this.live && !this.opening && this.sim.sig(this.def.when)) {
      this.opening = true;
      if (this.def.legacy === 'bridge') this.ev({ k: 'bridge' });
      else this.mev('open');
    }
    if (this.opening && this.t < 1) this.t = Math.min(1, this.t + dt / this.def.time);
    this.on = this.t >= 1;
    this.place();
  }
  solve() {
    this.t = 1;
    this.opening = true;
    this.on = true;
  }
  progress() {
    return this.t;
  }
  state() {
    return [r3(this.t)];
  }
  legacyInto(w: WorldSnap) {
    if (this.def.legacy === 'bridge') w.bridge = r3(this.t);
  }
}

// ---------------------------------------------------------------- push lever (TALL into the wall)

class PushLeverMech extends Mech<PushLeverDef> {
  t = 0;
  private held = 0;
  private shape!: RAPIER.Cuboid;
  build() {
    this.shape = new RAPIER.Cuboid(...this.def.trigger.h);
    if (this.freeze === 'solved') this.solve();
  }
  pre(dt: number, playing: boolean) {
    const d = this.def;
    const sim = this.sim;
    if (this.on) {
      if (this.t < 1) this.t = Math.min(1, this.t + dt / 0.5);
      return;
    }
    if (!this.live) return;
    const upright = rotate(sim.artifact.rotation(), UP).y > d.upright; // a leaning pillar just scrapes past the lever
    const touching = playing && upright && sim.artCol.intersectsShape(this.shape, v3(d.trigger.p), IDENT);
    this.held = touching ? this.held + dt : 0;
    if (this.held >= d.hold) {
      this.on = true;
      if (d.legacy === 'lever') this.ev({ k: 'lever' });
      else this.mev('on');
    }
  }
  solve() {
    this.on = true;
    this.t = 1;
  }
  progress() {
    return this.on ? 1 : Math.min(1, this.held / this.def.hold);
  }
  state() {
    return [r3(this.t)];
  }
  legacyInto(w: WorldSnap) {
    if (this.def.legacy === 'lever') w.lever = r3(this.t);
  }
}

// ---------------------------------------------------------------- lift

/** 0 locked, 1 ready (armed), 2 rising, 3 top, 4 returning down (artifact fell back to the bottom) */
class LiftMech extends Mech<LiftDef> {
  stage = 0;
  y: number;
  private liftT = 0;
  gateT = 0;
  aboard = 0;
  private boardT = 0;
  crankT = 0;
  private lowT = 0;
  private deck!: RAPIER.RigidBody;
  private gate!: RAPIER.RigidBody;
  private lastY: number;
  constructor(sim: Sim, def: LiftDef, i: number, freeze: Freeze) {
    super(sim, def, i, freeze);
    this.y = def.bottom;
    this.lastY = def.bottom;
  }
  build() {
    const L = this.def;
    const W = this.sim.world;
    this.deck = W.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(L.cx, L.bottom, L.cz));
    const dc = W.createCollider(RAPIER.ColliderDesc.cuboid(L.w / 2, 0.25, L.d / 2).setTranslation(0, -0.25, 0).setFriction(1.0).setCollisionGroups(STATIC_GROUPS), this.deck);
    this.sim.registerCarrier(dc, this);
    for (const side of [-1, 1]) {
      W.createCollider(
        RAPIER.ColliderDesc.cuboid(0.15, L.railH / 2, L.d / 2)
          .setTranslation(side * (L.w / 2 + 0.15), L.railH / 2, 0)
          .setFriction(0.15)
          .setCollisionGroups(STATIC_GROUPS),
        this.deck,
      );
    }
    this.gate = W.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(L.cx, this.gateY(), L.cz + L.d / 2 + 0.15));
    W.createCollider(RAPIER.ColliderDesc.cuboid(L.w / 2 + 0.3, L.railH / 2, 0.15).setFriction(0.15).setCollisionGroups(STATIC_GROUPS), this.gate);
    if (this.freeze === 'solved') this.solve();
    this.place();
  }
  private gateY() {
    const L = this.def;
    const lowered = this.y - L.railH / 2 - 0.06;
    const raised = this.y + L.railH / 2;
    return lowered + (raised - lowered) * smooth(this.gateT);
  }
  private place() {
    const L = this.def;
    this.deck.setNextKinematicTranslation({ x: L.cx, y: this.y, z: L.cz });
    this.gate.setNextKinematicTranslation({ x: L.cx, y: this.gateY(), z: L.cz + L.d / 2 + 0.15 });
  }
  private onDeck(p: Vec, maxUp: number) {
    const L = this.def;
    return Math.abs(p.x - L.cx) <= L.w / 2 && Math.abs(p.z - L.cz) <= L.d / 2 && p.y >= this.y - 0.2 && p.y <= this.y + maxUp;
  }
  velAt(): Vec {
    return { x: 0, y: (this.y - this.lastY) / C.TICK_DT, z: 0 };
  }
  pre(dt: number, playing: boolean) {
    const L = this.def;
    const sim = this.sim;
    this.lastY = this.y;
    if (!this.live) {
      this.place();
      return;
    }
    if (this.stage === 0 && sim.sig(L.when)) this.stage = 1;
    const c = sim.artifact.translation();
    const active = sim.requiredPlayers();
    // aboard, or already up top (a courier who sprang up the cliff)
    const ok = (p: PlayerBody) => (p.inside ? this.onDeck(c, 5) : this.onDeck(p.body.translation(), 3) || p.body.translation().y > L.top - 0.6);
    this.aboard = active.filter((p) => (p.inside ? this.onDeck(c, 5) : this.onDeck(p.body.translation(), 3))).length;
    const allSet = active.length > 0 && active.every(ok) && this.onDeck(c, 5);
    // someone on the deck holding Q at the crank
    let cranking = false;
    if (L.crank) {
      const kx = L.cx + L.crank[0];
      const kz = L.cz + L.crank[2];
      for (const p of active) {
        if (p.inside || !p.useHeld) continue;
        const q = p.body.translation();
        if (Math.hypot(q.x - kx, q.z - kz) < 1.25 && this.onDeck(q, 3)) cranking = true;
      }
    }
    const released = !!L.brake && sim.sig(L.brake);
    if (this.stage === 1) {
      if (L.crank) {
        this.crankT = allSet && cranking && playing ? this.crankT + dt : Math.max(0, this.crankT - dt * 2);
        if (this.crankT >= L.board) this.start();
      } else {
        this.boardT = allSet && playing ? this.boardT + dt : 0;
        if (this.boardT >= L.board) this.start();
      }
    } else if (this.stage === 2) {
      if (this.gateT < 1) {
        this.gateT = Math.min(1, this.gateT + dt / 0.45);
      } else {
        // brake on: the crank must be held the whole way (slow); brake off: it winds up on its own
        const rate = !L.crank || released ? 1 : cranking ? 0.42 : 0;
        if (rate > 0) {
          this.liftT = Math.min(1, this.liftT + (dt / L.time) * rate);
          this.y = L.bottom + (L.top - L.bottom) * smooth(this.liftT);
        }
        this.crankT = rate > 0 ? Math.min(L.board, this.crankT + dt) : this.crankT;
        if (this.liftT >= 1) {
          this.stage = 3;
          this.on = true;
          if (L.legacy === 'lift') this.ev({ k: 'liftTop' });
          else this.mev('top');
        }
      }
    } else if (this.stage === 3) {
      // the artifact fell back to the bottom while the lift is up: bring the lift down again (no softlock)
      const low = c.y < L.top - 3 && sim.artGrounded;
      this.lowT = low ? this.lowT + dt : 0;
      if (this.lowT > 3) {
        this.stage = 4;
        this.on = false;
        this.mev('return');
      }
    } else if (this.stage === 4) {
      this.liftT = Math.max(0, this.liftT - dt / (L.time * 0.6));
      this.y = L.bottom + (L.top - L.bottom) * smooth(this.liftT);
      if (this.liftT <= 0) {
        this.gateT = Math.max(0, this.gateT - dt / 0.45);
        if (this.gateT <= 0) {
          this.stage = 1;
          this.crankT = 0;
          this.boardT = 0;
        }
      }
    }
    this.place();
  }
  private start() {
    this.stage = 2;
    this.crankT = 0;
    if (this.def.legacy === 'lift') this.ev({ k: 'liftStart' });
    else this.mev('start');
  }
  solve() {
    this.stage = 3;
    this.liftT = 1;
    this.y = this.def.top;
    this.lastY = this.y;
    this.gateT = 1;
    this.on = true;
  }
  progress() {
    return this.stage === 1 ? Math.min(1, this.crankT / this.def.board) : this.stage >= 2 ? this.liftT : 0;
  }
  state() {
    return [this.stage, r3(this.y), r3(this.gateT), this.aboard, r3(Math.min(1, this.crankT / this.def.board))];
  }
  legacyInto(w: WorldSnap) {
    if (this.def.legacy !== 'lift') return;
    w.liftY = r3(this.y);
    w.liftGate = r3(this.gateT);
    w.lift = this.stage === 4 ? 2 : this.stage;
    w.aboard = this.aboard;
  }
}

// ---------------------------------------------------------------- wind

class WindMech extends Mech<WindDef> {
  k = 0; // routing fade (switching the valve takes a moment to bite)
  s = 0; // current signed strength (negative = wind-up warning)
  private active() {
    const d = this.def;
    if (!this.live) return false;
    if (d.when && !this.sim.sig(d.when)) return false;
    if (d.unless && this.sim.sig(d.unless)) return false;
    return true;
  }
  sheltered(p: Vec) {
    return !!this.def.shelters?.some((s) => inBox(p, s.min, s.max));
  }
  inZone(p: Vec) {
    const z = this.def.zone;
    return inBox(p, z.min, z.max) && !this.sheltered(p);
  }
  pre(dt: number) {
    this.k += ((this.active() ? 1 : 0) - this.k) * Math.min(1, dt * 1.4);
    if (this.k < 0.01 && !this.active()) this.k = 0;
    // gust cycles run on play time: the world at GO is the same on every run (and holds still through countdowns)
    this.s = windStrength(this.def.zone, this.sim.runTime) * this.k;
    this.on = this.s > 0.05;
  }
  forces(dt: number) {
    const s = this.s;
    if (s <= 0) return;
    const sim = this.sim;
    const zone = this.def.zone;
    if (sim.artifactLocked()) return;
    const c = sim.artifact.translation();
    if (!this.inZone(c)) return;
    const spec = shapeSpec(sim.shape);
    const F = zone.force * s * spec.wind;
    sim.artifact.applyImpulse({ x: zone.dir[0] * F * dt, y: 0, z: zone.dir[2] * F * dt }, true);
    if (sim.shape === ShapeId.LONG) {
      const sign = windCycleIndex(zone, sim.runTime) % 2 === 0 ? 1 : -1;
      sim.artifact.applyTorqueImpulse({ x: 0, y: sign * 19 * s * dt, z: 0 }, true);
    }
  }
  /** horizontal drift added to a courier's walking target (m/s) */
  drift(p: Vec): Vec {
    const share = this.def.players ?? 0;
    if (this.s <= 0 || share <= 0 || !this.inZone(p)) return ZERO;
    const k = this.s * share * 9;
    return { x: this.def.zone.dir[0] * k, y: 0, z: this.def.zone.dir[2] * k };
  }
  progress() {
    return Math.max(0, this.s);
  }
  state() {
    return [r3(this.s), r3(this.k)];
  }
  legacyInto(w: WorldSnap) {
    if (this.def.legacy === 'wind') w.wind = r3(this.s);
    if (this.def.legacy === 'fan') w.fan = r3(this.s);
  }
}

// ---------------------------------------------------------------- switch (Q)

export class SwitchMech extends Mech<SwitchDef> {
  value = 0;
  prog = 0;
  holders = 0;
  private timer = 0;
  private lastPress = -99;
  private warned = false;
  usable() {
    return this.live && (!this.def.enabledBy || this.sim.sig(this.def.enabledBy));
  }
  /** set by another machine (a cart resets its depart lever on arrival) */
  set(v: number) {
    this.value = v;
    this.on = v > 0;
  }
  near(p: Vec) {
    const d = this.def;
    return Math.hypot(p.x - d.p[0], p.z - d.p[2]) <= d.radius && Math.abs(p.y - C.PLAYER_CENTER_Y - d.p[1]) < 1.6;
  }
  press(p: PlayerBody) {
    const d = this.def;
    const sim = this.sim;
    if (!this.usable()) {
      sim.events.push({ k: 'toast', text: `${d.label} is locked for now`, slot: p.slot });
      return;
    }
    if (sim.time - this.lastPress < 0.35) return;
    this.lastPress = sim.time;
    if (d.mode === 'toggle') this.value = this.value ? 0 : 1;
    else if (d.mode === 'select') this.value = (this.value + 1) % Math.max(2, d.positions ?? 2);
    else if (d.mode === 'timed') {
      this.value = 1;
      this.timer = d.time ?? 20;
      this.warned = false;
    } else return; // hold / charge react to Q being held, not pressed
    this.on = this.value > 0;
    this.mev('use', { v: this.value, by: p.slot });
  }
  pre(dt: number, playing: boolean) {
    const d = this.def;
    const sim = this.sim;
    this.holders = 0;
    if (this.usable() && playing) {
      for (const p of sim.players) {
        if (p && p.connected && !p.inside && p.useHeld && p.respawnTimer <= 0 && this.near(p.body.translation())) this.holders++;
      }
    }
    if (d.mode === 'hold') {
      const need = Math.max(1, Math.min(d.need ?? 1, sim.requiredPlayers().length));
      const was = this.on;
      this.on = this.holders >= need;
      this.value = this.on ? 1 : 0;
      this.prog = Math.min(1, this.holders / need);
      if (was !== this.on) this.mev(this.on ? 'on' : 'off');
    } else if (d.mode === 'pump') {
      // hold Q to pump; full = a short pulse (fires whatever it drives), then it empties again
      if (this.on) {
        this.timer -= dt;
        if (this.timer <= 0) {
          this.on = false;
          this.value = 0;
          this.prog = 0;
        }
      } else {
        this.prog = this.holders > 0 ? Math.min(1, this.prog + dt / (d.time ?? 1.5)) : Math.max(0, this.prog - dt * 0.6);
        if (this.prog >= 1) {
          this.on = true;
          this.value = 1;
          this.timer = 0.6;
          this.mev('on');
        }
      }
    } else if (d.mode === 'charge' && !this.on) {
      this.prog = this.holders > 0 ? Math.min(1, this.prog + dt / (d.time ?? 1.5)) : Math.max(0, this.prog - dt * 0.5);
      if (this.prog >= 1) {
        this.on = true;
        this.value = 1;
        this.mev('on');
      }
    } else if (d.mode === 'timed' && this.value) {
      this.timer -= dt;
      this.prog = Math.max(0, this.timer / (d.time ?? 20));
      if (this.timer < 3 && !this.warned) {
        this.warned = true;
        this.mev('warn');
      }
      if (this.timer <= 0) {
        this.value = 0;
        this.on = false;
        this.mev('off');
      }
    }
  }
  solve() {
    this.value = this.def.mode === 'select' ? this.value : 1;
    this.on = this.value > 0;
    this.prog = 1;
  }
  progress() {
    return this.prog;
  }
  state() {
    return [this.value, r3(this.prog), this.holders];
  }
}

// ---------------------------------------------------------------- spring

class SpringMech extends Mech<SpringDef> {
  private last = new Map<number, number>(); // per target: -1 = artifact, slot = courier
  private fired = -99;
  private pad(p: Vec, margin: number) {
    const d = this.def;
    return Math.abs(p.x - d.p[0]) <= d.size[0] / 2 + margin && Math.abs(p.z - d.p[2]) <= d.size[1] / 2 + margin;
  }
  private launchVec(): [number, number, number] {
    const d = this.def;
    if (d.aim) {
      const i = this.sim.sel(d.aim.switch);
      return d.aim.launches[Math.min(d.aim.launches.length - 1, i)] ?? d.launch;
    }
    return d.launch;
  }
  private ready(key: number) {
    return this.sim.time - (this.last.get(key) ?? -99) >= this.def.cooldown;
  }
  forces(dt: number, playing: boolean) {
    void dt;
    const d = this.def;
    const sim = this.sim;
    if (!this.live || !playing || (d.when && !sim.sig(d.when))) return;
    const top = d.p[1];
    if (d.affects !== 'players' && this.ready(-1) && !sim.artifactLocked()) {
      const c = sim.artifact.translation();
      const ext = sim.artifactExtentY(sim.shape, sim.artifact.rotation());
      const bottom = c.y - ext;
      const v = sim.artifact.linvel();
      // the artifact's centre must be well onto the pad (it doesn't fire from the very edge)
      if (this.pad(c, -0.2) && bottom > top - 0.35 && bottom < top + 0.5 && v.y < 2) {
        const L = this.launchVec();
        const k = d.shapeScale?.[sim.shape] ?? 1;
        // off-centre landings get a sideways kick (careful positioning matters; distance stays predictable)
        const kick = d.offsetKick ?? 0;
        const hl = Math.hypot(L[0], L[2]) || 1;
        const sx = -L[2] / hl, sz = L[0] / hl;
        const side = ((c.x - d.p[0]) * sx + (c.z - d.p[2]) * sz) * kick;
        const lv = { x: L[0] * k + sx * side, y: L[1] * k, z: L[2] * k + sz * side };
        sim.artifact.setLinvel(lv, true);
        const w = sim.artifact.angvel();
        sim.artifact.setAngvel({ x: w.x * 0.3, y: w.y * 0.3, z: w.z * 0.3 }, true);
        sim.allowLaunch(2.6, hlen(lv));
        this.last.set(-1, sim.time);
        this.fire(-1);
      }
    }
    if (d.affects !== 'artifact') {
      const L = d.playerLaunch ?? d.launch;
      for (const p of sim.players) {
        if (!p || p.inside || !p.connected || p.respawnTimer > 0 || !this.ready(p.slot)) continue;
        const q = p.body.translation();
        const feet = q.y - C.PLAYER_CENTER_Y;
        const v = p.body.linvel();
        if (!this.pad(q, 0.15) || feet < top - 0.3 || feet > top + 0.35 || v.y > 2) continue;
        p.body.setLinvel({ x: L[0] + v.x * 0.2, y: L[1], z: L[2] + v.z * 0.2 }, true);
        p.launchT = 1.8;
        p.grounded = false;
        p.coyote = 0;
        p.jumpBuffer = 0;
        if (p.grip) {
          p.grip = null;
          sim.events.push({ k: 'release', by: p.slot });
        }
        this.last.set(p.slot, sim.time);
        this.fire(p.slot);
      }
    }
  }
  private fire(who: number) {
    this.fired = this.sim.time;
    this.mev('fire', { who });
  }
  state() {
    return [r3(Math.min(9, this.sim.time - this.fired))];
  }
}

// ---------------------------------------------------------------- mover

class MoverMech extends Mech<MoverDef> {
  private body!: RAPIER.RigidBody;
  private t = 0;
  pos: Vec;
  private lastPos: Vec;
  private segs: { a: Vec; b: Vec; len: number }[] = [];
  private total = 0;
  constructor(sim: Sim, def: MoverDef, i: number, freeze: Freeze) {
    super(sim, def, i, freeze);
    const pts = def.mode === 'loop' ? [...def.path, def.path[0]] : def.path;
    for (let k = 0; k < pts.length - 1; k++) {
      const a = v3(pts[k]);
      const b = v3(pts[k + 1]);
      const L = len(sub(b, a));
      this.segs.push({ a, b, len: L });
      this.total += L;
    }
    this.t = (def.offset ?? 0) * this.cycle();
    this.pos = this.at(this.t);
    this.lastPos = this.pos;
  }
  private cycle() {
    const d = this.def;
    const travel = this.total / Math.max(0.01, d.speed);
    return d.mode === 'loop' ? travel : 2 * travel + 2 * (d.pause ?? 0);
  }
  /** distance along the path at time t (eased at ping-pong ends) */
  private at(t: number): Vec {
    const d = this.def;
    const travel = this.total / Math.max(0.01, d.speed);
    const pause = d.pause ?? 0;
    let s: number;
    if (d.mode === 'loop') s = ((t % travel) / travel) * this.total;
    else {
      const T = this.cycle();
      let u = ((t % T) + T) % T;
      let f: number;
      if (u < pause) f = 0;
      else if ((u -= pause) < travel) f = smooth(u / travel);
      else if ((u -= travel) < pause) f = 1;
      else f = 1 - smooth((u - pause) / travel);
      s = f * this.total;
    }
    for (const g of this.segs) {
      if (s <= g.len || g === this.segs[this.segs.length - 1]) {
        const k = g.len > 0 ? Math.min(1, s / g.len) : 0;
        return { x: g.a.x + (g.b.x - g.a.x) * k, y: g.a.y + (g.b.y - g.a.y) * k, z: g.a.z + (g.b.z - g.a.z) * k };
      }
      s -= g.len;
    }
    return this.segs[0]?.a ?? ZERO;
  }
  build() {
    const d = this.def;
    const W = this.sim.world;
    this.body = W.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(this.pos.x, this.pos.y, this.pos.z));
    const col = W.createCollider(RAPIER.ColliderDesc.cuboid(d.s[0] / 2, d.s[1] / 2, d.s[2] / 2).setTranslation(0, -d.s[1] / 2, 0).setFriction(1.0).setCollisionGroups(STATIC_GROUPS), this.body);
    this.sim.registerCarrier(col, this);
  }
  pre(dt: number, playing: boolean) {
    const d = this.def;
    this.lastPos = this.pos;
    if (playing && this.live && (!d.when || this.sim.sig(d.when))) this.t += dt;
    this.pos = this.at(this.t);
    this.body.setNextKinematicTranslation(this.pos);
  }
  velAt(): Vec {
    const dt = C.TICK_DT;
    return { x: (this.pos.x - this.lastPos.x) / dt, y: (this.pos.y - this.lastPos.y) / dt, z: (this.pos.z - this.lastPos.z) / dt };
  }
  state() {
    return [r3(this.pos.x), r3(this.pos.y), r3(this.pos.z)];
  }
}

// ---------------------------------------------------------------- rotor

class RotorMech extends Mech<RotorDef> {
  angle: number;
  private body!: RAPIER.RigidBody;
  private w = 0;
  constructor(sim: Sim, def: RotorDef, i: number, freeze: Freeze) {
    super(sim, def, i, freeze);
    this.angle = def.phase ?? 0;
  }
  build() {
    const d = this.def;
    const W = this.sim.world;
    this.body = W.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(...d.p).setRotation(quatYaw(this.angle)));
    for (const part of d.parts) {
      const col = W.createCollider(
        RAPIER.ColliderDesc.cuboid(part.s[0] / 2, part.s[1] / 2, part.s[2] / 2)
          .setTranslation(...part.o)
          .setFriction(part.walk ? 1.0 : 0.15)
          .setCollisionGroups(STATIC_GROUPS),
        this.body,
      );
      this.sim.registerCarrier(col, this);
    }
  }
  pre(dt: number, playing: boolean) {
    const d = this.def;
    // machinery starts turning at GO (and stops for the resume countdown)
    this.w = playing && this.live && (!d.when || this.sim.sig(d.when)) && (!d.unless || !this.sim.sig(d.unless)) ? d.speed : 0;
    this.angle += this.w * dt;
    if (this.angle > Math.PI * 64) this.angle -= Math.PI * 64;
    this.body.setNextKinematicRotation(quatYaw(this.angle));
  }
  velAt(p: Vec): Vec {
    const c = this.def.p;
    return { x: this.w * (p.z - c[2]), y: 0, z: -this.w * (p.x - c[0]) };
  }
  state() {
    return [r3(this.angle)];
  }
}

// ---------------------------------------------------------------- wobbly bridge

class WobbleMech extends Mech<WobbleDef> {
  theta = 0;
  private omega = 0;
  private body!: RAPIER.RigidBody;
  private creakT = 0;
  build() {
    const d = this.def;
    const W = this.sim.world;
    this.body = W.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(...d.p));
    const deck = W.createCollider(
      RAPIER.ColliderDesc.cuboid(d.s[0] / 2, d.s[1] / 2, d.s[2] / 2).setTranslation(0, -d.s[1] / 2, 0).setFriction(1.0).setCollisionGroups(STATIC_GROUPS),
      this.body,
    );
    this.sim.registerCarrier(deck, this);
    if (d.rails) {
      for (const side of [-1, 1]) {
        W.createCollider(
          RAPIER.ColliderDesc.cuboid(0.12, d.rails / 2, d.s[2] / 2)
            .setTranslation(side * (d.s[0] / 2 + 0.12), d.rails / 2, 0)
            .setCollisionGroups(PLAYER_ONLY_GROUPS),
          this.body,
        );
      }
    }
  }
  private onDeck(p: Vec, up: number) {
    const d = this.def;
    return Math.abs(p.x - d.p[0]) <= d.s[0] / 2 + 0.2 && Math.abs(p.z - d.p[2]) <= d.s[2] / 2 && p.y >= d.p[1] - 0.6 && p.y <= d.p[1] + up;
  }
  pre(dt: number) {
    const d = this.def;
    const sim = this.sim;
    if (!this.live) {
      this.theta = 0;
      this.omega = 0;
      this.body.setNextKinematicRotation(IDENT);
      return;
    }
    // load torque about the bridge's long axis (+Z): weight on +X tips the +X side down
    let tau = 0;
    for (const p of sim.players) {
      if (!p || p.inside) continue;
      const q = p.body.translation();
      if (this.onDeck({ x: q.x, y: q.y - C.PLAYER_CENTER_Y, z: q.z }, 0.9)) tau -= (q.x - d.p[0]) * C.PLAYER_MASS * -C.GRAVITY;
    }
    const c = sim.artifact.translation();
    const ext = sim.artifactExtentY(sim.shape, sim.artifact.rotation());
    if (this.onDeck({ x: c.x, y: c.y - ext, z: c.z }, 0.9)) {
      const v = sim.artifact.linvel();
      tau -= (c.x - d.p[0]) * C.ARTIFACT_MASS * -C.GRAVITY + v.x * 30; // fast sideways moves slosh the deck
    }
    if (d.wind) {
      const w = sim.mechById(d.wind);
      if (w instanceof WindMech && w.s > 0) tau -= w.def.zone.dir[0] * w.s * 130;
    }
    const I = 120;
    const a = (tau - d.stiffness * this.theta - d.damping * this.omega) / I;
    this.omega += a * dt;
    this.theta += this.omega * dt;
    if (Math.abs(this.theta) > d.maxTilt) {
      this.theta = Math.sign(this.theta) * d.maxTilt;
      if (Math.sign(this.omega) === Math.sign(this.theta)) this.omega *= -0.2;
    }
    this.body.setNextKinematicRotation(quatZ(this.theta));
    this.creakT -= dt;
    if (Math.abs(this.omega) > 0.18 && this.creakT <= 0) {
      this.creakT = 0.9;
      this.mev('creak', { v: r3(Math.abs(this.omega)) });
    }
  }
  velAt(p: Vec): Vec {
    const c = this.def.p;
    return { x: -this.omega * (p.y - c[1]), y: this.omega * (p.x - c[0]), z: 0 };
  }
  state() {
    return [r3(this.theta)];
  }
}

// ---------------------------------------------------------------- slippery ground

class SlipMech extends Mech<SlipDef> {
  contains(p: Vec) {
    return this.live && inBox(p, this.def.min, this.def.max);
  }
}

// ---------------------------------------------------------------- puffball

class PufferMech extends Mech<PufferDef> {
  private prev = 0;
  forces(dt: number, playing: boolean) {
    void dt;
    const d = this.def;
    const sim = this.sim;
    if (!this.live) return;
    const cyc = (((sim.runTime + d.offset) % d.period) + d.period) % d.period;
    const wrapped = cyc < this.prev;
    this.prev = cyc;
    if (!wrapped || !playing) return;
    // burst: shove couriers outward and up, nudge the artifact (ROUND rolls away, CUBE barely moves)
    for (const p of sim.players) {
      if (!p || p.inside || p.respawnTimer > 0) continue;
      const q = p.body.translation();
      const dx = q.x - d.p[0];
      const dz = q.z - d.p[2];
      const dist = Math.hypot(dx, dz);
      if (dist > d.radius || Math.abs(q.y - d.p[1]) > 3) continue;
      const k = 1 - dist / d.radius;
      const nx = dist > 1e-3 ? dx / dist : 1;
      const nz = dist > 1e-3 ? dz / dist : 0;
      const v = p.body.linvel();
      // straight-up pop near the middle, a gentler shove out at the rim (harmless: never off a cliff by itself)
      const out = d.impulse * (0.25 + 0.6 * (1 - k));
      p.body.setLinvel({ x: v.x * 0.5 + nx * out, y: Math.max(v.y, 3 + 6 * k), z: v.z * 0.5 + nz * out }, true);
      p.launchT = 0.35;
      if (k > 0.25) sim.tumble(p, 0.55);
    }
    if (!sim.artifactLocked()) {
      const c = sim.artifact.translation();
      const dx = c.x - d.p[0];
      const dz = c.z - d.p[2];
      const dist = Math.hypot(dx, dz);
      if (dist < d.radius + 1 && dist > 1e-3) {
        const k = (1 - dist / (d.radius + 1)) * [0.25, 0.6, 0.7, 1.0][sim.shape];
        sim.artifact.applyImpulse({ x: (dx / dist) * d.impulse * k * C.ARTIFACT_MASS * 0.5, y: 0, z: (dz / dist) * d.impulse * k * C.ARTIFACT_MASS * 0.5 }, true);
      }
    }
    this.mev('puff');
  }
  state() {
    const d = this.def;
    const cyc = (((this.sim.runTime + d.offset) % d.period) + d.period) % d.period;
    return [r3(cyc / d.period)];
  }
}

// ---------------------------------------------------------------- collectible

class CollectMech extends Mech<CollectDef> {
  pre() {
    const d = this.def;
    const sim = this.sim;
    if (!this.live || this.on || sim.finished) return;
    const p0 = v3(d.p);
    for (const p of sim.players) {
      if (!p || p.inside || !p.connected || p.respawnTimer > 0) continue;
      if (len(sub(p.body.translation(), p0)) < 1.15) return this.take(p.slot);
    }
    if (d.byArtifact) {
      const proj = sim.artCol.projectPoint(p0, false);
      if (proj && len(sub(proj.point, p0)) < 0.7) return this.take(sim.pilot.slot >= 0 ? sim.pilot.slot : -1);
    }
  }
  private take(by: number) {
    this.on = true;
    this.sim.events.push({ k: 'collect', i: this.i, by, n: this.sim.stamps(), total: this.sim.stampTotal() });
  }
  solve() {
    // earlier maps' stamps are simply gone (they belong to that run)
    this.on = true;
  }
}

// ---------------------------------------------------------------- blocker

class BlockerMech extends Mech<BlockerDef> {
  private col!: RAPIER.Collider;
  private present = true;
  build() {
    const d = this.def;
    const W = this.sim.world;
    const fixed = W.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const desc = RAPIER.ColliderDesc.cuboid(d.s[0] / 2, d.s[1] / 2, d.s[2] / 2)
      .setTranslation(...d.p)
      .setRotation(quatYaw(d.rotY ?? 0))
      .setFriction(0.15)
      .setCollisionGroups(d.collide === 'cargo' ? CARGO_GROUPS : d.collide === 'player' ? PLAYER_ONLY_GROUPS : STATIC_GROUPS);
    this.col = W.createCollider(desc, fixed);
    if (this.freeze === 'solved') this.drop();
    this.on = !this.present;
  }
  private drop() {
    this.present = false;
    this.col.setEnabled(false);
    this.on = true;
  }
  pre() {
    if (this.live && this.present && this.def.until && this.sim.sig(this.def.until)) {
      this.drop();
      this.mev('open');
    }
  }
  solve() {
    if (this.present) this.drop();
  }
  state() {
    return [this.present ? 1 : 0];
  }
}

// ---------------------------------------------------------------- logic

class LogicMech extends Mech<LogicDef> {
  pre() {
    const d = this.def;
    if (!this.live) return;
    const vals = d.inputs.map((id) => this.sim.sig(id));
    this.on = d.op === 'and' ? vals.every(Boolean) : vals.some(Boolean);
  }
}

// ---------------------------------------------------------------- hazard

class HazardMech extends Mech<HazardDef> {
  contains(p: Vec) {
    return this.live && inBox(p, this.def.min, this.def.max);
  }
}

// ---------------------------------------------------------------- rail cart

interface Leg {
  pts: Vec[];
  cum: number[];
  len: number;
  speed: number;
  buffer: boolean;
}

/** Scripted kinematic rail cart: floor + side/front walls, a back gate that is open at stations and shut while moving. */
export class CartMech extends Mech<CartDef> {
  legs: Leg[] = [];
  leg = 0; // index into `legs` of the leg being ridden / about to depart
  ridden = 0; // number of legs completed
  private s = 0;
  private v = 0;
  moving = false;
  done = false;
  gateT = 0;
  pos: Vec;
  yaw = 0;
  private lastPos: Vec;
  private lastYaw = 0;
  private body!: RAPIER.RigidBody;
  private gate!: RAPIER.RigidBody;
  private pulse = 0;
  private warned = -99;
  constructor(sim: Sim, def: CartDef, i: number, freeze: Freeze) {
    super(sim, def, i, freeze);
    const mk = (pts: [number, number, number][], speed: number, buffer: boolean): Leg => {
      const vs = pts.map(v3);
      const cum = [0];
      for (let k = 1; k < vs.length; k++) cum.push(cum[k - 1] + len(sub(vs[k], vs[k - 1])));
      return { pts: vs, cum, len: cum[cum.length - 1], speed, buffer };
    };
    this.legs.push(mk(def.track, def.speed, false));
    (def.branches ?? []).forEach((b, k) => {
      // a branch starts where the track ends
      const pts = [def.track[def.track.length - 1], ...b];
      this.legs.push(mk(pts, def.speed * (def.branchSpeed?.[k] ?? 1), !!def.buffers?.includes(k)));
    });
    const a = this.at(this.legs[0], 0);
    this.pos = a.p;
    this.yaw = a.yaw;
    this.lastPos = this.pos;
    this.lastYaw = this.yaw;
  }
  /** point + heading `s` metres along a leg (heading blended across corners) */
  private at(L: Leg, s: number): { p: Vec; yaw: number } {
    const n = L.pts.length;
    let k = 1;
    while (k < n - 1 && L.cum[k] < s) k++;
    const a = L.pts[k - 1];
    const b = L.pts[k];
    const seg = Math.max(1e-6, L.cum[k] - L.cum[k - 1]);
    const u = clamp((s - L.cum[k - 1]) / seg, 0, 1);
    const p = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u };
    const dir = (from: Vec, to: Vec) => Math.atan2(-(to.x - from.x), -(to.z - from.z)); // yaw that points local -Z along the track
    let yaw = dir(a, b);
    // blend toward the next segment over the last 1.6 m of this one
    const left = L.cum[k] - s;
    if (k < n - 1 && left < 1.6) {
      const ny = dir(b, L.pts[k + 1]);
      let d = ny - yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      yaw += d * (1 - left / 1.6) * 0.5;
    }
    if (k > 1 && s - L.cum[k - 1] < 1.6) {
      const py = dir(L.pts[k - 2], a);
      let d = py - yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      yaw += d * (1 - (s - L.cum[k - 1]) / 1.6) * 0.5;
    }
    return { p, yaw };
  }
  build() {
    const d = this.def;
    const W = this.sim.world;
    const [bw, wh, bl] = d.bed;
    const f = d.floor;
    this.body = W.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(this.pos.x, this.pos.y, this.pos.z).setRotation(quatYaw(this.yaw)));
    const floor = W.createCollider(RAPIER.ColliderDesc.cuboid(bw / 2 + 0.15, 0.15, bl / 2 + 0.15).setTranslation(0, f - 0.15, 0).setFriction(1.0).setCollisionGroups(STATIC_GROUPS), this.body);
    this.sim.registerCarrier(floor, this);
    for (const sx of [-1, 1]) {
      const c = W.createCollider(RAPIER.ColliderDesc.cuboid(0.12, wh / 2, bl / 2 + 0.15).setTranslation(sx * (bw / 2 + 0.12), f + wh / 2, 0).setFriction(0.2).setCollisionGroups(STATIC_GROUPS), this.body);
      this.sim.registerCarrier(c, this);
    }
    const front = W.createCollider(RAPIER.ColliderDesc.cuboid(bw / 2 + 0.24, wh / 2, 0.12).setTranslation(0, f + wh / 2, -bl / 2 - 0.12).setFriction(0.2).setCollisionGroups(STATIC_GROUPS), this.body);
    this.sim.registerCarrier(front, this);
    this.gate = W.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(this.pos.x, this.pos.y - 5, this.pos.z));
    const g = W.createCollider(RAPIER.ColliderDesc.cuboid(bw / 2 + 0.24, wh / 2, 0.12).setFriction(0.2).setCollisionGroups(STATIC_GROUPS), this.gate);
    this.sim.registerCarrier(g, this);
    if (this.freeze === 'solved') this.solve();
    this.place();
  }
  /** the artifact rests inside the bed (cart-local box) */
  cargoIn() {
    const d = this.def;
    const c = this.sim.artifact.translation();
    const dx = c.x - this.pos.x;
    const dz = c.z - this.pos.z;
    const ca = Math.cos(-this.yaw), sa = Math.sin(-this.yaw);
    const lx = dx * ca + dz * sa;
    const lz = -dx * sa + dz * ca;
    const floorY = this.pos.y + d.floor;
    const bottom = c.y - this.sim.artifactExtentY(this.sim.shape, this.sim.artifact.rotation());
    return Math.abs(lx) < d.bed[0] / 2 + 0.2 && Math.abs(lz) < d.bed[2] / 2 + 0.2 && bottom > floorY - 0.4 && bottom < floorY + 1.2;
  }
  private place() {
    const d = this.def;
    const q = quatYaw(this.yaw);
    this.body.setNextKinematicTranslation(this.pos);
    this.body.setNextKinematicRotation(q);
    // back gate: hinged down out of the way at stations, up while riding
    const back = rotate(q, { x: 0, y: 0, z: d.bed[2] / 2 + 0.12 });
    const gy = this.pos.y + d.floor + d.bed[1] / 2 - (1 - smooth(this.gateT)) * (d.bed[1] + 0.05);
    this.gate.setNextKinematicTranslation({ x: this.pos.x + back.x, y: gy, z: this.pos.z + back.z });
    this.gate.setNextKinematicRotation(q);
  }
  pre(dt: number, playing: boolean) {
    const d = this.def;
    const sim = this.sim;
    this.lastPos = this.pos;
    this.lastYaw = this.yaw;
    this.pulse = Math.max(0, this.pulse - dt);
    this.on = this.pulse > 0;
    if (!this.live) {
      this.place();
      return;
    }
    const lever = d.departs[Math.min(this.ridden, d.departs.length - 1)];
    if (!this.moving && !this.done) {
      if (playing && lever && sim.sig(lever)) {
        if (!this.cargoIn()) {
          // lever pulled with an empty bed: refuse (and say why, now and then)
          if (sim.time - this.warned > 3) {
            this.warned = sim.time;
            sim.events.push({ k: 'toast', text: 'Put the golden object in the cart first!' });
          }
          (sim.mechById(lever) as SwitchMech | undefined)?.set(0);
        } else {
          this.leg = this.ridden === 0 ? 0 : 1 + Math.min(this.legs.length - 2, sim.sel(d.junction ?? ''));
          this.moving = true;
          this.s = 0;
          this.v = 0;
          this.mev('depart', { v: this.leg });
        }
      }
      this.gateT = Math.max(0, this.gateT - dt / 0.5);
    }
    if (this.moving) {
      const L = this.legs[this.leg];
      if (this.gateT < 1) this.gateT = Math.min(1, this.gateT + dt / 0.5);
      else {
        const brake = L.buffer ? 0 : (this.v * this.v) / (2 * 2.6);
        const want = L.len - this.s <= brake + 0.05 ? 0.6 : L.speed;
        const acc = this.v < want ? 2.2 : -2.6;
        this.v = clamp(this.v + acc * dt, 0.4, Math.max(L.speed, 0.6));
        this.s = Math.min(L.len, this.s + this.v * dt);
        if (this.s >= L.len - 1e-3) {
          this.moving = false;
          this.ridden++;
          this.v = 0;
          (sim.mechById(lever) as SwitchMech | undefined)?.set(0);
          if (L.buffer) {
            this.pulse = 0.6; // the buffer stop: a spring at the bed fires the cargo onward
            this.on = true;
          }
          if (this.ridden >= 2 || this.leg > 0) this.done = true;
          this.mev(L.buffer ? 'buffer' : 'arrive', { v: this.leg });
        }
      }
      const a = this.at(L, this.s);
      this.pos = a.p;
      this.yaw = a.yaw;
    }
    this.place();
  }
  velAt(p: Vec): Vec {
    const dt = C.TICK_DT;
    let dyaw = this.yaw - this.lastYaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    const w = dyaw / dt;
    const rx = p.x - this.pos.x;
    const rz = p.z - this.pos.z;
    return { x: (this.pos.x - this.lastPos.x) / dt + w * rz, y: (this.pos.y - this.lastPos.y) / dt, z: (this.pos.z - this.lastPos.z) / dt - w * rx };
  }
  solve() {
    this.parkAt(2, 0);
  }
  /** snap to the station reached after `ridden` legs (the checkpoint says where the cart belongs) */
  private parkAt(ridden: number, branch: number) {
    this.moving = false;
    this.v = 0;
    this.gateT = 0;
    this.ridden = ridden;
    this.done = ridden >= 2;
    this.leg = ridden === 0 ? 0 : ridden === 1 ? 0 : 1 + Math.min(this.legs.length - 2, branch);
    const L = this.legs[this.leg];
    const a = this.at(L, ridden === 0 ? 0 : L.len);
    this.pos = a.p;
    this.yaw = a.yaw;
    this.lastPos = this.pos;
    this.lastYaw = this.yaw;
    for (const id of this.def.departs) (this.sim.mechById(id) as SwitchMech | undefined)?.set(0);
  }
  /** artifact recalled: bring the cart to where that checkpoint expects it (never strand the cargo) */
  reset() {
    const want = this.sim.map.checkpoints[this.sim.cp]?.cart;
    if (!want || !this.live) return;
    if (this.moving || this.ridden !== want.ridden) this.parkAt(want.ridden, want.branch ?? 0);
  }
  state() {
    return [r3(this.pos.x), r3(this.pos.y), r3(this.pos.z), r3(this.yaw), this.moving ? 1 : 0, r3(this.gateT), this.leg, this.cargoIn() ? 1 : 0];
  }
}

// ---------------------------------------------------------------- crane

/** Jib crane: the held cycle lowers, grabs, raises, swings, lowers and releases; letting go mid-swing flings. */
export class CraneMech extends Mech<CraneDef> {
  u = 0;
  carrying = false;
  hook: Vec;
  private lastHook: Vec;
  holders = 0;
  private offset: Vec = ZERO;
  private yaw = 0;
  constructor(sim: Sim, def: CraneDef, i: number, freeze: Freeze) {
    super(sim, def, i, freeze);
    this.hook = this.hookAt(0);
    this.lastHook = this.hook;
  }
  /** hook position at cycle progress u */
  private hookAt(u: number): Vec {
    const d = this.def;
    const lerp = (a: number, b: number, k: number) => a + (b - a) * smooth(k);
    let ang = d.from;
    let y = d.hookTop;
    if (u < 0.15) y = lerp(d.hookTop, d.pickupY, u / 0.15);
    else if (u < 0.2) y = d.pickupY;
    else if (u < 0.32) y = lerp(d.pickupY, d.hookTop, (u - 0.2) / 0.12);
    else if (u < 0.7) ang = lerp(d.from, d.to, (u - 0.32) / 0.38);
    else if (u < 0.8) (ang = d.to), (y = lerp(d.hookTop, d.dropY, (u - 0.7) / 0.1));
    else if (u < 0.84) (ang = d.to), (y = d.dropY);
    else if (u < 0.92) (ang = d.to), (y = lerp(d.dropY, d.hookTop, (u - 0.84) / 0.08));
    else ang = lerp(d.to, d.from, (u - 0.92) / 0.08);
    return { x: d.pivot[0] + Math.cos(ang) * d.radius, y, z: d.pivot[2] + Math.sin(ang) * d.radius };
  }
  /** jib angle for the visuals */
  angle() {
    const h = this.hook;
    return Math.atan2(h.z - this.def.pivot[2], h.x - this.def.pivot[0]);
  }
  pre(dt: number, playing: boolean) {
    const d = this.def;
    const sim = this.sim;
    this.lastHook = this.hook;
    this.holders = 0;
    if (!this.live) return;
    if (playing) {
      for (const p of sim.players) {
        if (!p || !p.connected || p.inside || !p.useHeld) continue;
        const q = p.body.translation();
        if (Math.hypot(q.x - d.control[0], q.z - d.control[2]) < 1.5 && Math.abs(q.y - C.PLAYER_CENTER_Y - d.control[1]) < 1.6) this.holders++;
      }
    }
    const held = this.holders > 0;
    // let go mid-swing with cargo: fling it with the hook's own speed
    if (!held && this.carrying && this.u > 0.32 && this.u < 0.7) {
      this.release(true);
    }
    const u0 = this.u;
    if (held) this.u += dt / d.cycle;
    if (this.u >= 1) this.u = 0;
    this.hook = this.hookAt(this.u);
    // grab at the bottom of the pickup
    if (held && !this.carrying && u0 < 0.17 && this.u >= 0.17) this.tryGrab();
    // careful release at the bottom of the drop
    if (held && this.carrying && u0 < 0.81 && this.u >= 0.81) this.release(false);
    if (this.carrying) {
      const t = { x: this.hook.x + this.offset.x, y: this.hook.y + this.offset.y, z: this.hook.z + this.offset.z };
      sim.artifact.setNextKinematicTranslation(t);
    }
  }
  private tryGrab() {
    const sim = this.sim;
    const c = sim.artifact.translation();
    const top = c.y + sim.artifactExtentY(sim.shape, sim.artifact.rotation());
    if (Math.hypot(c.x - this.hook.x, c.z - this.hook.z) > 1.5 || top < this.hook.y - 1.2 || top > this.hook.y + 0.5) {
      this.mev('miss');
      return;
    }
    this.carrying = true;
    this.offset = { x: c.x - this.hook.x, y: c.y - this.hook.y, z: c.z - this.hook.z };
    this.yaw = yawOfX(sim.artifact.rotation());
    sim.lockArtifact(true);
    this.mev('grab');
  }
  /** drop the cargo; `fling` keeps the hook's swing speed */
  release(fling: boolean) {
    if (!this.carrying) return;
    const sim = this.sim;
    this.carrying = false;
    const v = fling ? { x: (this.hook.x - this.lastHook.x) / C.TICK_DT, y: (this.hook.y - this.lastHook.y) / C.TICK_DT, z: (this.hook.z - this.lastHook.z) / C.TICK_DT } : ZERO;
    sim.lockArtifact(false, v);
    this.mev(fling ? 'fling' : 'drop');
  }
  /** the artifact is being reset elsewhere: let go without ceremony */
  reset() {
    if (this.carrying) {
      this.carrying = false;
      this.sim.lockArtifact(false, ZERO);
    }
  }
  state() {
    return [r3(this.hook.x), r3(this.hook.y), r3(this.hook.z), this.carrying ? 1 : 0, r3(this.u), this.holders];
  }
}

// ---------------------------------------------------------------- factory

export function makeMech(sim: Sim, def: MechDef, i: number, freeze: Freeze): Mech {
  switch (def.kind) {
    case 'plate':
      return new PlateMech(sim, def, i, freeze);
    case 'gate':
      return new GateMech(sim, def, i, freeze);
    case 'dock':
      return new DockMech(sim, def, i, freeze);
    case 'drawbridge':
      return new DrawbridgeMech(sim, def, i, freeze);
    case 'pushLever':
      return new PushLeverMech(sim, def, i, freeze);
    case 'lift':
      return new LiftMech(sim, def, i, freeze);
    case 'wind':
      return new WindMech(sim, def, i, freeze);
    case 'switch':
      return new SwitchMech(sim, def, i, freeze);
    case 'spring':
      return new SpringMech(sim, def, i, freeze);
    case 'mover':
      return new MoverMech(sim, def, i, freeze);
    case 'rotor':
      return new RotorMech(sim, def, i, freeze);
    case 'wobble':
      return new WobbleMech(sim, def, i, freeze);
    case 'slip':
      return new SlipMech(sim, def, i, freeze);
    case 'puffer':
      return new PufferMech(sim, def, i, freeze);
    case 'collect':
      return new CollectMech(sim, def, i, freeze);
    case 'blocker':
      return new BlockerMech(sim, def, i, freeze);
    case 'logic':
      return new LogicMech(sim, def, i, freeze);
    case 'hazard':
      return new HazardMech(sim, def, i, freeze);
    case 'cart':
      return new CartMech(sim, def, i, freeze);
    case 'crane':
      return new CraneMech(sim, def, i, freeze);
    default:
      throw new Error(`unknown mechanism kind: ${(def as MechDef).kind}`);
  }
}

export { WindMech, SlipMech, HazardMech, CollectMech, LiftMech, GateMech, PlateMech, DockMech, RotorMech, MoverMech, WobbleMech, SpringMech, PufferMech, BlockerMech };
