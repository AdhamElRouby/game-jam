// A courier's walking / jumping velocity for one 60 Hz tick: velocity-target control with capped acceleration, jump
// buffer + coyote time, snappier falls. The server's Rapier capsule (server/sim.ts) and the client's prediction of your
// own courier (src/net/predict.ts) both run exactly this, so the two only differ in how they collide with the world.
import * as C from './constants';
import { lerpAngle } from './math';

export interface CourierMotion {
  vx: number;
  vy: number;
  vz: number;
  /** standing on something this tick (computed by the caller before the step) */
  grounded: boolean;
  coyote: number;
  jumpBuffer: number;
  airTime: number;
  yaw: number;
}

export interface CourierControl {
  /** world-space walking direction, length <= 1 (already zeroed when the courier can't act) */
  mx: number;
  mz: number;
  sprint: boolean;
  /** a jump press arrived this tick */
  jumpPressed: boolean;
  /** the courier may act (playing, connected, not respawning, run not finished) */
  canMove: boolean;
}

/**
 * Everything the world adds to the walk (the server works it out each tick and sends it with the snapshot):
 * the velocity of a moving platform underfoot (carry), wind drift, a slippery surface's grip, knocked over,
 * flung by a spring (no air brakes), holding a rope (slower walk).
 */
export interface CourierEnv {
  carryX: number;
  carryY: number;
  carryZ: number;
  driftX: number;
  driftZ: number;
  /** acceleration multiplier of a slippery surface (1 = normal ground) */
  slip: number;
  knocked: boolean;
  launched: boolean;
  gripping: boolean;
}

export const NO_ENV: CourierEnv = { carryX: 0, carryY: 0, carryZ: 0, driftX: 0, driftZ: 0, slip: 1, knocked: false, launched: false, gripping: false };

/** One tick of walking control: updates coyote / jump buffer / air time and returns the new velocity in `m`. */
export function stepCourierMotion(m: CourierMotion, c: CourierControl, e: CourierEnv, dt: number) {
  if (m.grounded) {
    m.coyote = 0.12;
    m.airTime = 0;
  } else {
    m.coyote -= dt;
    m.airTime += dt;
  }
  const knocked = e.knocked;
  const mx = c.canMove ? c.mx : 0;
  const mz = c.canMove ? c.mz : 0;
  // sprinting is faster but slidier (less grip on the ground); not while holding a rope or knocked over
  const sprint = c.sprint && !e.gripping && !knocked;
  const speed = e.gripping ? C.GRIP_SPEED : sprint ? C.SPRINT_SPEED : C.WALK_SPEED;
  const tx = mx * speed + e.carryX + e.driftX;
  const tz = mz * speed + e.carryZ + e.driftZ;
  let accel = m.grounded ? (sprint ? 24 : 46) : 15;
  if (m.grounded && e.slip !== 1) accel *= e.slip;
  if (knocked) accel *= 0.2;
  let dvx = tx - m.vx;
  let dvz = tz - m.vz;
  if (e.launched && !m.grounded) {
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
  let vy = m.vy;
  // jumping with buffer + coyote time
  if (c.jumpPressed && c.canMove && !knocked) m.jumpBuffer = 0.15;
  if (m.jumpBuffer > 0) {
    m.jumpBuffer -= dt;
    if (m.coyote > 0) {
      vy = C.JUMP_SPEED + Math.max(0, e.carryY);
      m.jumpBuffer = 0;
      m.coyote = 0;
      m.grounded = false;
    }
  }
  // ride descending platforms instead of bouncing on them
  if (m.grounded && e.carryY < 0 && vy > e.carryY && m.jumpBuffer <= 0) vy = Math.min(vy, e.carryY);
  // snappier falls
  if (!m.grounded && vy < 0) vy += C.GRAVITY * 0.35 * dt;
  m.vx = m.vx + dvx;
  m.vy = vy;
  m.vz = m.vz + dvz;
}

/** Turn to face the walking direction (or `toward` = the rope anchor while gripping). */
export function stepCourierFacing(m: CourierMotion, faceX: number, faceZ: number, dt: number) {
  if (Math.hypot(faceX, faceZ) > 0.15) m.yaw = lerpAngle(m.yaw, Math.atan2(faceX, faceZ), 1 - Math.exp(-14 * dt));
}
