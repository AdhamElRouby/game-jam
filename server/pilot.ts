// Artifact piloting: one courier rides inside the artifact and steers it with shape-specific controls.
// Occupancy is authoritative here; the pilot's courier body is disabled while inside, so it never collides,
// falls or gets pushed. Exits are validated (ground below, free capsule, line of sight, artifact slow enough)
// and retried for a few seconds instead of ever placing a courier inside geometry.
import RAPIER from '@dimforge/rapier3d-compat';
import * as C from '../src/shared/constants';
import { ShapeId, shapeSpec } from '../src/shared/shapes';
import { clamp, cross, hlen, len, r3, rotate, scale, sub, wrapAngle, yawOfX, type Quat, type Vec } from '../src/shared/math';
import type { PlayerBody, Sim } from './sim';

const IDENT: Quat = { x: 0, y: 0, z: 0, w: 1 };
const UP: Vec = { x: 0, y: 1, z: 0 };
const DOWN: Vec = { x: 0, y: -1, z: 0 };
const EXCLUDE_SENSORS = RAPIER.QueryFilterFlags.EXCLUDE_SENSORS;
const EXIT_GROUND = C.groups(C.G_PLAYER, C.G_STATIC);
const EXIT_SPACE = C.groups(C.G_PLAYER, C.G_STATIC | C.G_ARTIFACT | C.G_PLAYER_BARRIER);
const EXIT_SIGHT = C.groups(C.G_PLAYER, C.G_STATIC | C.G_PLAYER_BARRIER);

/** Cooldown (s) of each form's Space ability while piloting. */
const ABILITY_CD = [0, 1, 2, 3].map((i) => shapeSpec(i).abilityCd);

export class Pilot {
  slot = -1;
  abilityCd = 0;
  private exitPending = 0;
  private exitRetry = 0;
  private exitWarned = false;
  private swing: { target: number; t: number } | null = null;
  private brace = 0;
  boost = 0; // ROUND: time left with the raised speed cap
  private hopAir = false;
  private airT = 0;
  private groundT = 0; // time since the artifact last touched ground (coyote for the hop)
  private minVy = 0;
  private capsule = new RAPIER.Capsule(C.PLAYER_HALF_HEIGHT, C.PLAYER_RADIUS);

  constructor(private sim: Sim) {}

  get player(): PlayerBody | null {
    return this.slot >= 0 ? this.sim.players[this.slot] : null;
  }

  /** F pressed: hop in when outside, ask to hop out when inside. */
  toggle(p: PlayerBody) {
    if (this.sim.time - p.lastPilotToggle < C.PILOT_TOGGLE_S) return;
    if (p.inside) this.requestExit(p);
    else this.tryEnter(p);
  }

  private fail(p: PlayerBody, why: string) {
    this.sim.events.push({ k: 'pilotFail', by: p.slot, why });
    return false;
  }

  tryEnter(p: PlayerBody): boolean {
    const sim = this.sim;
    if (sim.finished || p.inside) return false;
    if (p.respawnTimer > 0 || p.tumble > 0) return this.fail(p, 'Get back on your feet first');
    if (this.slot >= 0) return this.fail(p, `${sim.players[this.slot]?.name ?? 'Someone'} is already inside`);
    if (sim.artifactLocked()) return this.fail(p, 'Not while the crane is holding it');
    const pos = p.body.translation();
    const proj = sim.artCol.projectPoint(pos, false);
    if (!proj || len(sub(proj.point, pos)) - C.PLAYER_RADIUS > C.PILOT_RANGE) return this.fail(p, 'Stand right next to the golden object to climb in');
    const v = sim.artifact.linvel();
    if (!sim.artGrounded && Math.abs(v.y) > 1.5) return this.fail(p, 'Wait until it lands');
    if (hlen(v) > 6) return this.fail(p, 'It is moving too fast to climb in');
    if (p.grip) {
      p.grip = null;
      sim.events.push({ k: 'release', by: p.slot });
    }
    p.inside = true;
    p.lastPilotToggle = sim.time;
    p.pushing = false;
    p.body.setLinvel({ x: 0, y: 0, z: 0 }, false);
    p.body.setEnabled(false);
    this.slot = p.slot;
    this.exitPending = 0;
    this.swing = null;
    this.brace = 0;
    this.abilityCd = Math.max(this.abilityCd, 0.3);
    sim.events.push({ k: 'pilotIn', by: p.slot });
    return true;
  }

  requestExit(p: PlayerBody) {
    if (!p.inside) return;
    if (this.tryExit(p)) return;
    this.exitPending = C.PILOT_EXIT_RETRY_S;
    this.exitRetry = 0.2;
  }

  /** Attempt to place the pilot beside the artifact; false if no safe spot right now. */
  private tryExit(p: PlayerBody, quiet = false): boolean {
    const sim = this.sim;
    const v = sim.artifact.linvel();
    if (hlen(v) > C.PILOT_EXIT_MAX_SPEED || Math.abs(v.y) > 3) {
      if (!quiet && !this.exitWarned) this.fail(p, 'Too fast to get out! Slow down first');
      this.exitWarned = true;
      return false;
    }
    // the steering direction, else the camera's side (the courier lands between the camera and the artifact)
    const prefer = Math.hypot(p.mx, p.mz) > 0.3 ? { x: p.mx, y: 0, z: p.mz } : { x: Math.sin(p.camYaw), y: 0, z: Math.cos(p.camYaw) };
    const spot = this.findExitSpot(prefer);
    if (!spot) {
      if (!quiet && !this.exitWarned) this.fail(p, 'No room to get out here. Move a little');
      this.exitWarned = true;
      return false;
    }
    const c = sim.artifact.translation();
    const out = { x: spot.x - c.x, y: 0, z: spot.z - c.z };
    const ol = hlen(out) || 1;
    this.place(p, spot, { x: (out.x / ol) * 1.6 + v.x * 0.4, y: 3.2, z: (out.z / ol) * 1.6 + v.z * 0.4 });
    return true;
  }

  /** Put the pilot's courier back into the world at `pos` (always safe: callers validate or use anchors). */
  place(p: PlayerBody, pos: Vec, vel: Vec = { x: 0, y: 0, z: 0 }) {
    const sim = this.sim;
    p.body.setEnabled(true);
    p.body.setTranslation(pos, true);
    p.body.setLinvel(vel, true);
    p.inside = false;
    p.lastPilotToggle = sim.time;
    p.farTimer = 0;
    p.grounded = false;
    if (this.slot === p.slot) this.slot = -1;
    this.exitPending = 0;
    this.exitWarned = false;
    this.swing = null;
    this.brace = 0;
    sim.events.push({ k: 'pilotOut', by: p.slot, x: r3(pos.x), y: r3(pos.y), z: r3(pos.z) });
  }

  /** Last resort (R while inside, failed exits): put the pilot on the safest respawn anchor near the artifact. */
  bail(p: PlayerBody) {
    if (!p.inside) return;
    const a = this.sim.bestAnchor(this.sim.artifact.translation(), p.slot);
    this.place(p, { x: a.x, y: a.y + C.PLAYER_CENTER_Y + 0.6, z: a.z }, { x: 0, y: -1, z: 0 });
    p.respawnTimer = 0.4;
  }

  /** Candidate exits ring the artifact at its base level; first one with ground, room and line of sight wins. */
  findExitSpot(prefer: Vec | null): Vec | null {
    const sim = this.sim;
    const W = sim.world;
    const c = sim.artifact.translation();
    const extY = sim.artifactExtentY(sim.shape, sim.artifact.rotation());
    const baseY = c.y - extY;
    // prefer the given direction (default: +Z), then the nearest others around the ring
    const base = prefer ? Math.atan2(prefer.z, prefer.x) : Math.PI / 2;
    for (const ring of [0.3, 0.85, 1.5]) {
      for (let k = 0; k < 16; k++) {
        const a = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 8);
        const d = { x: Math.cos(a), y: 0, z: Math.sin(a) };
        const out = sim.extentAlong(d) + C.PLAYER_RADIUS + ring;
        const x = c.x + d.x * out;
        const z = c.z + d.z * out;
        const top = baseY + 1.7;
        const hit = W.castRay(new RAPIER.Ray({ x, y: top, z }, DOWN), 3.6, true, EXCLUDE_SENSORS, EXIT_GROUND);
        if (!hit) continue; // over a pit
        const gy = top - hit.timeOfImpact;
        if (gy < baseY - 1.1 || gy > baseY + 0.8) continue; // a ledge far below, or on top of a wall
        const pos = { x, y: gy + C.PLAYER_CENTER_Y + 0.06, z };
        if (sim.isHazard(pos)) continue;
        let free = true;
        W.intersectionsWithShape(pos, IDENT, this.capsule, () => ((free = false), false), EXCLUDE_SENSORS, EXIT_SPACE);
        if (!free) continue;
        // no hopping out through a wall: clear line from inside the artifact to the spot
        const from = { x: c.x, y: Math.min(c.y, pos.y + 0.2), z: c.z };
        const dv = sub(pos, from);
        const L = len(dv);
        if (L > 1e-3 && W.castRay(new RAPIER.Ray(from, scale(dv, 1 / L)), L, true, EXCLUDE_SENSORS, EXIT_SIGHT)) continue;
        return pos;
      }
    }
    return null;
  }

  /** Space while piloting: the current form's special move. */
  ability(p: PlayerBody) {
    const sim = this.sim;
    if (!p.inside || this.abilityCd > 0 || sim.artifactLocked()) return;
    const art = sim.artifact;
    const v = art.linvel();
    const grounded = this.groundT < 0.15;
    switch (sim.shape) {
      case ShapeId.CUBE: {
        if (!grounded) return;
        // a hop with a little forward kick toward WASD (enough to clear a waist-high ledge)
        const m = Math.hypot(p.mx, p.mz);
        const kx = m > 0.2 ? (p.mx / m) * 2.4 : 0;
        const kz = m > 0.2 ? (p.mz / m) * 2.4 : 0;
        art.setLinvel({ x: v.x + kx, y: 7.6, z: v.z + kz }, true);
        this.hopAir = true;
        this.airT = 0;
        this.minVy = 0;
        sim.allowLaunch(0.6);
        break;
      }
      case ShapeId.LONG: {
        if (!grounded) return;
        // A = turn left (positive yaw), D = right: the input's sideways part as the player's camera sees it
        const side = p.mx * Math.cos(p.camYaw) - p.mz * Math.sin(p.camYaw);
        const dir = Math.abs(side) > 0.3 ? -Math.sign(side) : 1;
        this.swing = { target: yawOfX(art.rotation()) + (dir * Math.PI) / 2, t: 1.8 };
        break;
      }
      case ShapeId.TALL: {
        const up = rotate(art.rotation(), UP);
        if (up.y < Math.cos(0.62)) return; // past saving
        this.brace = 0.9;
        break;
      }
      case ShapeId.ROUND: {
        if (!grounded) return;
        let dx = p.mx, dz = p.mz;
        let m = Math.hypot(dx, dz);
        if (m < 0.2) {
          dx = v.x;
          dz = v.z;
          m = Math.hypot(dx, dz);
          if (m < 0.5) return;
        }
        dx /= m;
        dz /= m;
        const spec = shapeSpec(ShapeId.ROUND);
        art.applyImpulse({ x: dx * 3.6 * C.ARTIFACT_MASS, y: 0, z: dz * 3.6 * C.ARTIFACT_MASS }, true);
        const w = art.angvel();
        const k = 3.6 / spec.half[0];
        art.setAngvel({ x: w.x + dz * k, y: w.y, z: w.z - dx * k }, true);
        this.boost = 1.3;
        break;
      }
    }
    this.abilityCd = ABILITY_CD[sim.shape];
    sim.events.push({ k: 'ability', by: p.slot, shape: sim.shape });
  }

  /** Called every tick before the physics step. */
  update(dt: number, playing: boolean) {
    const sim = this.sim;
    this.abilityCd = Math.max(0, this.abilityCd - dt);
    this.boost = Math.max(0, this.boost - dt);
    this.groundT = sim.artGrounded ? 0 : this.groundT + dt;
    const p = this.player;
    // (the CUBE hop's landing thump is detected by the sim like every other heavy landing)
    if (!p) return;
    if (!p.connected || !playing || sim.finished) {
      this.swing = null;
      return;
    }
    // pending exit: retry a few times a second, then give up with a hint
    if (this.exitPending > 0) {
      this.exitPending -= dt;
      this.exitRetry -= dt;
      if (this.exitRetry <= 0) {
        this.exitRetry = 0.2;
        if (this.tryExit(p, true)) return;
      }
      if (this.exitPending <= 0) {
        this.exitWarned = false;
        this.fail(p, 'Still no room to get out. Press F to try again or R to jump out');
      }
    }
    if (sim.artifactLocked()) return;
    this.steer(p, dt);
  }

  /** Shape-specific steering forces (bounded; the artifact is still pushed by everyone outside). */
  private steer(p: PlayerBody, dt: number) {
    const sim = this.sim;
    const art = sim.artifact;
    const m = C.ARTIFACT_MASS;
    const v = art.linvel();
    const w = art.angvel();
    const q = art.rotation();
    let ix = p.mx;
    let iz = p.mz;
    const raw = Math.hypot(ix, iz);
    const im = Math.min(1, raw);
    if (raw > 1e-3) {
      ix /= raw;
      iz /= raw;
    }
    const grounded = this.groundT < 0.1;
    sim.tallWant = UP;
    const drag = shapeSpec(sim.shape).groundDrag;
    /**
     * Push from inside like a strong courier: feed-forward against the heavy ground drag plus a P term toward a
     * target speed along the input, capped by `maxForce`, and a little lateral grip so steering works.
     * `atBase` pushes at floor level (TALL would otherwise be tipped over by its own waddle).
     */
    const drive = (maxSpeed: number, maxForce: number, atBase = false) => {
      if (im < 0.15 || !grounded) return;
      const target = maxSpeed * im;
      const along = v.x * ix + v.z * iz;
      const F = clamp(m * (drag * target + 6 * (target - along)), 0, maxForce * im);
      const lx = v.x - ix * along;
      const lz = v.z - iz * along;
      const lat = Math.hypot(lx, lz);
      const L = lat > 1e-3 ? Math.min(lat * m * 3, maxForce * 0.5) / lat : 0;
      const imp = { x: (ix * F - lx * L) * dt, y: 0, z: (iz * F - lz * L) * dt };
      if (!atBase) sim.applyArtifactCenterImpulse(imp);
      else {
        const c = art.translation();
        const ext = sim.artifactExtentY(sim.shape, q);
        art.applyImpulseAtPoint(imp, { x: c.x, y: c.y - ext + 0.25, z: c.z }, true);
      }
    };
    switch (sim.shape) {
      case ShapeId.CUBE:
        drive(1.5, 62);
        break;
      case ShapeId.LONG: {
        drive(1.4, 50);
        if (this.swing) {
          this.swing.t -= dt;
          // signed: a quarter turn is exactly ±90°, where the axis-symmetric difference would pick either way
          const err = wrapAngle(this.swing.target - yawOfX(q));
          const wy = clamp(w.y, -2.6, 2.6);
          if (wy !== w.y) art.setAngvel({ x: w.x, y: wy, z: w.z }, true);
          if (Math.abs(err) < 0.05 || this.swing.t <= 0) this.swing = null; // it coasts on: swinging has momentum
          else art.applyTorqueImpulse({ x: 0, y: clamp(err * 95 - wy * 11, -130, 130) * dt, z: 0 }, true);
        }
        break;
      }
      case ShapeId.TALL: {
        drive(1.0, 34, true);
        const steady = sim.gripCount() >= 2;
        const up = rotate(q, UP);
        // lean target: tilt the top toward the input (further when two couriers steady it)
        const lean = im > 0.2 ? (steady ? 0.32 : 0.15) * im : 0;
        const want = lean > 0 ? { x: ix * Math.sin(lean), y: Math.cos(lean), z: iz * Math.sin(lean) } : UP;
        sim.tallWant = want;
        const brace = this.brace > 0;
        if (brace) this.brace -= dt;
        if (!steady || brace) {
          // the pilot's own balance is weak: a bump or a fast waddle can still topple it; Space braces hard
          const target = brace ? UP : want;
          const err = cross(up, target);
          // (a flat-based pillar only leaves its base past ~50 N·m; it settles a few degrees over on its own)
          const kp = brace ? 300 : 420;
          const lim = brace ? 260 : 70;
          const kd = brace ? 45 : 28;
          const tx = err.x * kp - w.x * kd;
          const tz = err.z * kp - w.z * kd;
          const tm = Math.hypot(tx, tz);
          const sc = tm > lim ? lim / tm : 1;
          if (grounded || brace) art.applyTorqueImpulse({ x: tx * sc * dt, y: 0, z: tz * sc * dt }, true);
        }
        break;
      }
      case ShapeId.ROUND: {
        if (!grounded || im < 0.15) break;
        const R = shapeSpec(ShapeId.ROUND).half[0];
        const sp = hlen(v);
        const along = sp > 0.3 ? (v.x * ix + v.z * iz) / sp : 1;
        // braking (input against the roll) is stronger than accelerating: forgiving control
        const a = along < -0.2 ? 7.0 : 4.2;
        const tau = a * 1.4 * m * R * im;
        art.applyTorqueImpulse({ x: iz * tau * dt, y: 0, z: -ix * tau * dt }, true);
        // a little direct steering so turns at speed are possible
        sim.applyArtifactCenterImpulse({ x: ix * 4 * im * dt, y: 0, z: iz * 4 * im * dt });
        break;
      }
    }
  }

  /** Snapshot value: ability cooldown remaining as a fraction of its full length. */
  cooldownFrac() {
    if (this.slot < 0) return 0;
    return r3(clamp(this.abilityCd / ABILITY_CD[this.sim.shape], 0, 1));
  }
}
