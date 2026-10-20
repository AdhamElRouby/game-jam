// Full-course playthrough with three scripted couriers using only normal inputs (move / jump / grip / shift).
// Proves every puzzle is solvable and measures pacing. Run: npx tsx tests/bot-run.ts [route=safe|fast]
import { Sim, initPhysics } from '../server/sim';
import { TICK_DT, PLAYER_RADIUS } from '../src/shared/constants';
import { ShapeId, shapeSpec } from '../src/shared/shapes';
import { rotate } from '../src/shared/math';
import { LEVEL } from '../src/shared/level';

await initPhysics();
const route = process.argv[2] ?? 'safe';
const sim = new Sim({ names: ['A', 'B', 'C'], slots: [0, 1, 2] });
let t = 0;
const log = (m: string) => console.log(`[${t.toFixed(1).padStart(6)}s] ${m}`);
const P = (i: number) => sim.players[i]!;
const art = () => sim.artifact.translation();
const input = [0, 1, 2].map(() => ({ mx: 0, mz: 0, grab: false, jump: 0 }));
const events: string[] = [];

function step() {
  for (let i = 0; i < 3; i++) sim.setInput(i, input[i].mx, input[i].mz, input[i].jump, input[i].grab, 0);
  sim.step(TICK_DT, true);
  for (const e of sim.events) {
    if (['checkpoint', 'gate', 'bridge', 'lever', 'liftStart', 'liftTop', 'drop', 'fall', 'finish', 'hop'].includes(e.k)) {
      log(`EVENT ${e.k} ${JSON.stringify(e).slice(0, 80)}`);
    }
    events.push(e.k);
  }
  sim.events = [];
  t += TICK_DT;
}

/** Steer toward (x,z) but route around the artifact instead of bulldozing through it. */
function steer(i: number, x: number, z: number, speed = 1) {
  const p = P(i).body.translation();
  const c = art();
  const clear = (sim.shape === ShapeId.LONG ? 2.6 : sim.shape === ShapeId.ROUND ? 1.2 : 1.25) + 0.55;
  const sx = x - p.x, sz = z - p.z;
  const L2 = sx * sx + sz * sz;
  if (L2 > 0.25 && Math.hypot(x - c.x, z - c.z) > clear - 0.3) {
    const tt = Math.max(0, Math.min(1, ((c.x - p.x) * sx + (c.z - p.z) * sz) / L2));
    const qx = p.x + sx * tt, qz = p.z + sz * tt;
    const dd = Math.hypot(qx - c.x, qz - c.z);
    if (dd < clear && tt > 0 && tt < 1) {
      const L = Math.sqrt(L2);
      let nx = -sz / L, nz = sx / L;
      if ((qx - c.x) * nx + (qz - c.z) * nz < 0) (nx = -nx), (nz = -nz);
      return rawSteer(i, c.x + nx * (clear + 0.4), c.z + nz * (clear + 0.4), speed);
    }
  }
  return rawSteer(i, x, z, speed);
}

function rawSteer(i: number, x: number, z: number, speed = 1) {
  const p = P(i).body.translation();
  const dx = x - p.x, dz = z - p.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.15) {
    input[i].mx = input[i].mz = 0;
    return true;
  }
  const s = Math.min(1, d / 0.8) * speed;
  input[i].mx = (dx / d) * s;
  input[i].mz = (dz / d) * s;
  return false;
}

function extentAlong(dx: number, dz: number) {
  const spec = shapeSpec(sim.shape);
  if (spec.ball) return { r: spec.half[0], w: spec.half[0] };
  const q = sim.artifact.rotation();
  const ax = rotate(q, { x: 1, y: 0, z: 0 });
  const az = rotate(q, { x: 0, y: 0, z: 1 });
  const ay = rotate(q, { x: 0, y: 1, z: 0 });
  const r = Math.abs(dx * ax.x + dz * ax.z) * spec.half[0] + Math.abs(dx * az.x + dz * az.z) * spec.half[2] + Math.abs(dx * ay.x + dz * ay.z) * spec.half[1];
  const px = -dz, pz = dx;
  const w = Math.abs(px * ax.x + pz * ax.z) * spec.half[0] + Math.abs(px * az.x + pz * az.z) * spec.half[2] + Math.abs(px * ay.x + pz * ay.z) * spec.half[1];
  return { r, w };
}

/** Grip the artifact from the target side and walk it there (rope pulling). */
function pull(x: number, z: number, tol = 0.6, maxT = 20, who = [0, 1, 2]) {
  const t0 = t;
  while (t - t0 < maxT) {
    const c = art();
    const dx = x - c.x, dz = z - c.z;
    const d = Math.hypot(dx, dz);
    if (d < tol) break;
    const ux = dx / d, uz = dz / d;
    const { r, w } = extentAlong(ux, uz);
    const px = -uz, pz = ux;
    who.forEach((i, k) => {
      const off = (k - (who.length - 1) / 2) * Math.min(1.2, w);
      const sx = c.x + ux * (r + PLAYER_RADIUS + 0.35) + px * off;
      const sz = c.z + uz * (r + PLAYER_RADIUS + 0.35) + pz * off;
      input[i].grab = true;
      if (!P(i).grip) steer(i, sx, sz);
      else {
        input[i].mx = ux;
        input[i].mz = uz;
      }
    });
    step();
  }
  for (const i of who) Object.assign(input[i], { mx: 0, mz: 0, grab: false });
  step();
  const c = art();
  log(`pull -> (${x}, ${z}) at (${c.x.toFixed(2)}, ${c.y.toFixed(2)}, ${c.z.toFixed(2)})`);
  return Math.hypot(x - c.x, z - c.z) < tol + 0.3;
}

/** All three push the artifact toward (x,z). */
function push(x: number, z: number, tol = 0.6, maxT = 40, who = [0, 1, 2]) {
  const t0 = t;
  let bestD = 1e9, bestT = t;
  while (t - t0 < maxT) {
    const c = art();
    const dx = x - c.x, dz = z - c.z;
    const d = Math.hypot(dx, dz);
    if (d < tol) break;
    if (d < bestD - 0.2) (bestD = d), (bestT = t);
    if (t - bestT > 4.5) {
      log(`  push stalled at d=${d.toFixed(1)} -> switching to rope pull`);
      for (const i of who) input[i].mx = input[i].mz = 0;
      return pull(x, z, tol, maxT - (t - t0), who);
    }
    const ux = dx / d, uz = dz / d;
    const { r, w } = extentAlong(ux, uz);
    const px = -uz, pz = ux;
    who.forEach((i, k) => {
      const off = (k - (who.length - 1) / 2) * Math.min(1.0, w * 0.8);
      const sx = c.x - ux * (r + PLAYER_RADIUS + 0.25) + px * off;
      const sz = c.z - uz * (r + PLAYER_RADIUS + 0.25) + pz * off;
      const p = P(i).body.translation();
      const rel = (p.x - c.x) * ux + (p.z - c.z) * uz; // >0: in front of the artifact
      const lat = (p.x - c.x) * px + (p.z - c.z) * pz;
      const dist = Math.hypot(sx - p.x, sz - p.z);
      if (rel > -r - 0.1 && Math.abs(lat) < w + 0.9) {
        // go around the side
        const side = lat >= 0 ? 1 : -1;
        steer(i, c.x + px * side * (w + 0.8) - ux * 0.5, c.z + pz * side * (w + 0.8) - uz * 0.5);
      } else if (dist > 0.5) {
        steer(i, sx, sz);
      } else {
        // push: along the target direction, nudged toward the lateral slot
        input[i].mx = ux + (sx - p.x) * 0.6;
        input[i].mz = uz + (sz - p.z) * 0.6;
        const m = Math.hypot(input[i].mx, input[i].mz);
        if (m > 1) {
          input[i].mx /= m;
          input[i].mz /= m;
        }
        if (d < 1.5) {
          input[i].mx *= d / 1.5;
          input[i].mz *= d / 1.5;
        }
      }
    });
    step();
  }
  for (const i of who) input[i].mx = input[i].mz = 0;
  const c = art();
  const ok = Math.hypot(x - c.x, z - c.z) < tol + 0.3;
  if (!ok) for (const i of who) { const p = P(i).body.translation(); log(`   P${i} at (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`); }
  log(`push -> (${x}, ${z}) ${ok ? 'ok' : 'TIMEOUT'} at (${c.x.toFixed(2)}, ${c.y.toFixed(2)}, ${c.z.toFixed(2)})`);
  return ok;
}

function wait(s: number) {
  const t0 = t;
  while (t - t0 < s) step();
}

function shift(shape: number) {
  for (let attempt = 0; attempt < 6; attempt++) {
    // nearest player walks within range
    const c = art();
    let best = 0, bd = 1e9;
    for (let i = 0; i < 3; i++) {
      const p = P(i).body.translation();
      const d = Math.hypot(p.x - c.x, p.z - c.z);
      if (d < bd) (bd = d), (best = i);
    }
    const t0 = t;
    while (t - t0 < 4) {
      const p = P(best).body.translation();
      if (Math.hypot(p.x - c.x, p.z - c.z) < 3.6) break;
      steer(best, c.x, c.z);
      step();
    }
    input[best].mx = input[best].mz = 0;
    while (t - sim.lastShiftAt < 1.55) step();
    sim.requestShift(best, shape);
    const ev = sim.events.find((e) => e.k === 'shift' || e.k === 'shiftFail');
    step();
    if (sim.shape === shape) {
      log(`shift -> ${shapeSpec(shape).name} by P${best}`);
      wait(0.5);
      return true;
    }
    log(`shift failed: ${JSON.stringify(ev)}`);
    wait(0.4);
  }
  return false;
}

function walkAll(spots: [number, number][], maxT = 15) {
  const t0 = t;
  while (t - t0 < maxT) {
    let done = true;
    spots.forEach(([x, z], i) => {
      if (!steer(i, x, z)) done = false;
    });
    step();
    if (done) break;
  }
  for (let i = 0; i < 3; i++) input[i].mx = input[i].mz = 0;
}

/** TALL: two couriers grip from behind (steadying it), one pushes from the middle. */
function tallPush(x: number, z: number, maxT = 25) {
  const t0 = t;
  while (t - t0 < maxT) {
    const c = art();
    if (sim.leverOn) break;
    const dx = x - c.x, dz = z - c.z;
    const d = Math.hypot(dx, dz);
    const ux = d > 1e-3 ? dx / d : 0, uz = d > 1e-3 ? dz / d : -1;
    const px = -uz, pz = ux;
    const gripped = P(0).grip && P(2).grip;
    [0, 2].forEach((i, k) => {
      const side = k === 0 ? -1 : 1;
      const sx = c.x - ux * 1.05 + px * side * 0.55, sz = c.z - uz * 1.05 + pz * side * 0.55;
      const p = P(i).body.translation();
      input[i].grab = true;
      if (!gripped) steer(i, sx, sz);
      else {
        input[i].mx = ux * 0.75 + (sx - p.x) * 0.4;
        input[i].mz = uz * 0.75 + (sz - p.z) * 0.4;
      }
    });
    if (gripped) {
      const sx = c.x - ux * 1.0, sz = c.z - uz * 1.0;
      const p = P(1).body.translation();
      if (Math.hypot(sx - p.x, sz - p.z) > 0.5) steer(1, sx, sz, 0.8);
      else {
        input[1].mx = ux * 0.6;
        input[1].mz = uz * 0.6;
      }
    }
    step();
    if (Math.round(t * 60) % 30 === 0) {
      const up = rotate(sim.artifact.rotation(), { x: 0, y: 1, z: 0 });
      log(`   tall c=(${c.x.toFixed(2)},${c.y.toFixed(2)},${c.z.toFixed(2)}) up=${up.y.toFixed(2)} grips=${[0, 1, 2].map((i) => (P(i).grip ? 1 : 0)).join('')} P=${[0, 1, 2].map((i) => { const p = P(i).body.translation(); return p.x.toFixed(1) + ',' + p.z.toFixed(1); }).join(' ')}`);
    }
  }
  for (let i = 0; i < 3; i++) Object.assign(input[i], { mx: 0, mz: 0, grab: false });
  wait(0.3);
  const up = rotate(sim.artifact.rotation(), { x: 0, y: 1, z: 0 });
  log(`tallPush lever=${sim.leverOn} upright=${up.y.toFixed(2)} at (${art().x.toFixed(2)}, ${art().y.toFixed(2)}, ${art().z.toFixed(2)})`);
}

// ------------------------------------------------------------------ the run
wait(0.5);
// Chapter 1
push(0, -3.5, 0.5);
wait(1.6);
log(`gateOpen=${sim.gateOpen}`);
push(0, -20.5, 0.6);
shift(ShapeId.LONG);
push(0, -33, 0.8);
log(`cp=${sim.cp}`);
// Chapter 2
push(0, -43, 0.8);
shift(ShapeId.CUBE);
push(-2.5, -57.2, 0.6);
shift(ShapeId.LONG);
push(-2.5, -60.6, 0.4, 12);
wait(1.4);
log(`bridgeOpen=${sim.bridgeOpen} recvT=${sim.recvT.toFixed(2)}`);
wait(2.2);
push(-2.5, -70, 0.8);
log(`cp=${sim.cp}`);
// Chapter 3
shift(ShapeId.CUBE);
push(0, -79.5, 0.6);
push(0, -90, 0.8);
push(-4.5, -100.8, 0.5);
walkAll([
  [-5.3, -98.6],
  [-4.5, -98.4],
  [-3.7, -98.6],
]);
shift(ShapeId.TALL);
tallPush(-4.5, -103.6);
shift(ShapeId.CUBE);
push(0, -97, 0.8);
push(4.6, -95.8, 0.6);
push(4.6, -101, 0.5);
walkAll([
  [2.5, -99],
  [6.7, -99],
  [4.6, -98.4],
]);
const tl = t;
while (sim.liftState < 3 && t - tl < 15) step();
log(`lift state=${sim.liftState} y=${sim.liftY.toFixed(2)}`);
push(4.6, -107.5, 0.8);
log(`cp=${sim.cp}`);
// Chapter 4
if (route === 'fast') {
  push(5, -113, 0.6);
  shift(ShapeId.ROUND);
  push(5, -118, 1.0, 8);
  walkAll([[4, -150], [6, -150], [5, -149]], 12);
  wait(3);
  log(`after chute: art (${art().x.toFixed(1)}, ${art().y.toFixed(1)}, ${art().z.toFixed(1)}) drops=${sim.drops}`);
} else {
  push(-6, -114, 0.6);
  push(-6, -134, 0.8);
  push(-6, -151, 0.8);
}
push(0, -161, 0.6, 30);
walkAll([[-1.5, -159], [1.5, -159], [0, -163.3]], 8);
const tg = t;
while (!sim.finished && t - tg < 6) step();
log(`FINISHED=${sim.finished} results=${JSON.stringify(sim.results)}`);
log(`drops=${sim.drops} falls=${sim.falls}`);
process.exit(sim.finished ? 0 : 1);
