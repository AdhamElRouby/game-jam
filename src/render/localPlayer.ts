// Bounded presentation prediction for the local courier. Only the server simulates contacts, ropes and the artifact.
import * as THREE from 'three';
import { net, type PlayerView } from '../net/net';
import { input } from '../net/input';
import { approachVelocity } from '../shared/movement';
import { BTN_SPRINT } from '../shared/protocol';
import * as C from '../shared/constants';
import { mapAt } from '../shared/maps';
import { shapeSpec } from '../shared/shapes';
import { castCamera } from './camCollide';

const from = new THREE.Vector3(), direction = new THREE.Vector3();
let previousSnapshot = -1, previousMap = -1, previousAt = 0;
let previousTarget: PlayerView | null = null;
const correction = new THREE.Vector3();
const corrections: number[] = [];
export function predictionDiagnostics(reset = false) {
  if (reset) corrections.length = 0;
  return { corrections: corrections.slice(), maxHorizonMs: 150 };
}

export function presentLocal(p: PlayerView, now: number): PlayerView {
  const s = net.latest()!;
  const sample = input.sample();
  const a = s.ar, spec = shapeSpec(a[7]);
  const nearArtifact = Math.hypot(p.x - a[0], p.z - a[2]) < Math.hypot(spec.half[0], spec.half[2]) + C.PLAYER_RADIUS + .6;
  const inVolume = (min: number[], max: number[]) => p.x >= min[0] && p.x <= max[0] && p.z >= min[2] && p.z <= max[2] && p.y >= min[1] - 1 && p.y <= max[1] + 1;
  const specialGround = mapAt(s.mp).mechs.some(m => m.kind === 'wind' ? inVolume(m.zone.min, m.zone.max) : m.kind === 'slip' ? inVolume(m.min, m.max) : false);
  const safe = input.enabled && net.connected && s.ph === 'playing' && !p.pilot && !p.onMover && !p.grip && !p.tumble && !p.respawning && !sample.grab && !nearArtifact && !specialGround;
  const fresh = s.mp !== previousMap || !previousTarget || Math.hypot(p.x - previousTarget.x, p.y - previousTarget.y, p.z - previousTarget.z) > 3;
  const out = { ...p };
  // Snapshot age + measured one-way transport, capped so a stalled connection freezes instead of drifting away.
  const age = Math.max(0, now - net.lastSnapAt);
  const horizon = Math.min(.15, (age + Math.min(100, net.rtt * .5)) / 1000);
  if (safe && age < 250) {
    const speed = sample.buttons & BTN_SPRINT ? C.SPRINT_SPEED : C.WALK_SPEED;
    let vx = p.vx, vz = p.vz, vy = p.vy;
    const jumpPending = p.grounded && net.pendingJump(sample.jump);
    if (jumpPending) vy = C.JUMP_SPEED;
    let left = horizon;
    // Fixed substeps, including a fractional final step: render FPS cannot change acceleration or distance.
    while (left > 1e-6) {
      const dt = Math.min(C.TICK_DT, left);
      const v = approachVelocity(vx, vz, sample.mx * speed, sample.mz * speed, p.grounded && !jumpPending ? (sample.buttons & BTN_SPRINT ? 24 : 46) : 15, dt);
      vx = v.x; vz = v.z;
      out.x += vx * dt; out.z += vz * dt;
      if (!p.grounded || jumpPending) { vy += C.GRAVITY * (vy < 0 ? 1.35 : 1) * dt; out.y += vy * dt; }
      left -= dt;
    }
    // Conservative capsule sweep against shared static/gate geometry. Never predict through a wall.
    direction.set(out.x - p.x, out.y - p.y, out.z - p.z);
    const distance = direction.length();
    if (distance > 1e-6) {
      direction.divideScalar(distance);
      let free = distance;
      for (const y of [-C.PLAYER_HALF_HEIGHT, C.PLAYER_HALF_HEIGHT]) {
        from.set(p.x, p.y + y, p.z);
        free = Math.min(free, castCamera(from, direction, distance, C.PLAYER_RADIUS));
      }
      const k = Math.max(0, free - .005) / distance;
      out.x = p.x + (out.x - p.x) * k; out.y = p.y + (out.y - p.y) * k; out.z = p.z + (out.z - p.z) * k;
    }
    out.vx = vx; out.vz = vz; out.vy = vy;
    out.moving = Math.hypot(sample.mx, sample.mz) > .1;
  }
  if (fresh || !safe || age >= 250) correction.set(0, 0, 0);
  else if (s.t !== previousSnapshot && previousTarget) {
    const dt = Math.min(.05, Math.max(0, (now - previousAt) / 1000));
    const dx = previousTarget.x + previousTarget.vx * dt - out.x;
    const dy = previousTarget.y - out.y;
    const dz = previousTarget.z + previousTarget.vz * dt - out.z;
    const error = Math.hypot(dx, dy, dz);
    corrections.push(error); if (corrections.length > 600) corrections.shift();
    // Blend ordinary reconciliation over ~60 ms. Large corrections/teleports always use the server immediately.
    if (error < .75) correction.set(dx, dy, dz); else correction.set(0, 0, 0);
  }
  correction.multiplyScalar(Math.exp(-25 * Math.max(0, (now - previousAt) / 1000)));
  previousSnapshot = s.t; previousMap = s.mp; previousAt = now;
  out.x += correction.x; out.y += correction.y; out.z += correction.z;
  previousTarget = { ...out };
  return out;
}
