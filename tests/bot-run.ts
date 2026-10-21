// Full playthrough with three scripted couriers using only normal inputs (move / jump / grip / shift / F / Q).
// Proves every world is solvable and measures pacing. Run: npx tsx tests/bot-run.ts [route=safe|fast] [world ids...]
// `--room`: one complete adventure through the server Room instead of a bare Sim: every input goes through the
// network message handlers (seq / validation), worlds advance by 2-of-3 "next" votes, adventure totals are checked.
import type { Server, Socket } from 'socket.io';
import { Sim, initPhysics } from '../server/sim';
import { Room, type Member } from '../server/room';
import { TICK_DT, PLAYER_RADIUS } from '../src/shared/constants';
import { ShapeId, shapeSpec } from '../src/shared/shapes';
import { rotate } from '../src/shared/math';
import { MAPS, mapAt } from '../src/shared/maps';
import type { MapDef } from '../src/shared/maps/types';

await initPhysics();
const roomMode = process.argv.includes('--room');
const args = process.argv.slice(2).filter((a) => a !== '--room');
const route = args[0] ?? 'safe';
const only = args.slice(1);
let sim!: Sim;
let t = 0;
const log = (m: string) => console.log(`[${t.toFixed(1).padStart(6)}s] ${m}`);
const P = (i: number) => sim.players[i]!;
const art = () => sim.artifact.translation();
type In = { mx: number; mz: number; grab: boolean; jump: number; pilot: number; use: boolean; useN: number; resp: number };
let input: In[] = [];

// ---- room mode: fake sockets + a simulated clock (the Room times its phases with Date.now)
let clock = Date.now();
Date.now = () => Math.round(clock);
const roomEvents: any[] = [];
const fakeIo = { to: () => ({ emit: (ev: string, data: any) => ev === 'ev' && roomEvents.push(...data) }) } as unknown as Server;
const lobbies: any[] = [];
const fakeSocket = (slot: number) => ({ join() {}, leave() {}, emit: (ev: string, data: any) => ev === 'lobby' && (lobbies[slot] = data) }) as unknown as Socket;
let room: Room | null = null;
let members: Member[] = [];
const seqs = [0, 0, 0];

function step() {
  if (room) {
    // exactly what a socket 'in' message does (the input packet of src/net/input.ts)
    for (let i = 0; i < 3; i++) {
      const q = input[i];
      room.input(members[i], [seqs[i]++, q.mx, q.mz, q.jump, q.grab ? 1 : 0, q.resp, q.use ? 1 : 0, q.pilot, q.useN]);
    }
    clock += 1000 / 60;
    room.step();
  } else {
    for (let i = 0; i < 3; i++) {
      const q = input[i];
      sim.setInput(i, q.mx, q.mz, q.jump, q.grab, q.resp, q.use ? 1 : 0, q.pilot, q.useN);
    }
    sim.step(TICK_DT, true);
  }
  const evs = room ? roomEvents.splice(0) : sim.events;
  for (const e of evs) {
    if (['checkpoint', 'gate', 'bridge', 'lever', 'liftStart', 'liftTop', 'drop', 'fall', 'finish', 'hop', 'pilotIn', 'pilotOut', 'pilotFail', 'collect', 'shortcut', 'stuck'].includes(e.k) || (e.k === 'mech' && e.ev !== 'creak')) {
      log(`EVENT ${e.k} ${JSON.stringify(e).slice(0, 90)}`);
    }
  }
  if (!room) sim.events = [];
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

/** The given couriers push the artifact toward (x,z). */
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

function waitUntil(cond: () => boolean, maxT: number) {
  const t0 = t;
  while (!cond() && t - t0 < maxT) step();
  return cond();
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
    if (room) room.shift(members[best], shape);
    else sim.requestShift(best, shape);
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

function walkAll(spots: ([number, number] | null)[], maxT = 15, jump = false) {
  const t0 = t;
  while (t - t0 < maxT) {
    let done = true;
    spots.forEach((s, i) => {
      if (!s) return;
      if (!steer(i, s[0], s[1])) done = false;
    });
    if (jump && Math.round((t - t0) * 60) % 30 === 0) for (let i = 0; i < 3; i++) if (spots[i]) input[i].jump++;
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
    if (sim.sig('lever')) break;
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
  }
  for (let i = 0; i < 3; i++) Object.assign(input[i], { mx: 0, mz: 0, grab: false });
  wait(0.3);
  const up = rotate(sim.artifact.rotation(), { x: 0, y: 1, z: 0 });
  log(`tallPush lever=${sim.sig('lever')} upright=${up.y.toFixed(2)} at (${art().x.toFixed(2)}, ${art().y.toFixed(2)}, ${art().z.toFixed(2)})`);
}

const mechState = (id: string) => sim.snapshot('playing').m[sim.mechs.findIndex((m) => m.def.id === id)] ?? [];

/** Everyone into the goal ring (pilot stays inside), then wait for the delivery. */
function deliver(spots: ([number, number] | null)[], jump = false) {
  walkAll(spots, 10, jump);
  const ok = waitUntil(() => sim.finished, 6);
  log(`deliver finished=${ok}`);
  if (!ok) {
    for (let i = 0; i < 3; i++) {
      const p = P(i).body.translation();
      log(`   P${i} at (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}) inside=${P(i).inside}`);
    }
    log(`   artifact (${art().x.toFixed(2)}, ${art().y.toFixed(2)}, ${art().z.toFixed(2)}) goal=${JSON.stringify(sim.map.goal)} goalT=${sim.goalT.toFixed(2)}`);
  }
  return ok;
}

/** World 1: anyone still in front of the low-arch wall walks through the tunnel. */
function throughArch() {
  for (let i = 0; i < 3; i++) {
    if (P(i).inside || P(i).body.translation().z < -25.5) continue;
    const t0 = t;
    const near = (x: number, z: number) => Math.hypot(P(i).body.translation().x - x, P(i).body.translation().z - z) < 0.5;
    // out in front of the funnel posts, into the tunnel mouth, then through
    while (t - t0 < 8 && !near(1.4, -20.6)) (rawSteer(i, 1.4, -20.6), step());
    while (t - t0 < 12 && !near(1.0, -26.4)) (rawSteer(i, 1.0, -26.4), step());
    while (t - t0 < 16 && P(i).body.translation().z > -29) (rawSteer(i, 1.0, -29.6), step());
    input[i].mx = input[i].mz = 0;
    log(`   P${i} walked through the arch -> z=${P(i).body.translation().z.toFixed(1)}`);
  }
}

// ------------------------------------------------------------------ per-world scripts

const scripts: Record<string, () => void> = {
  dock() {
    wait(0.5);
    push(0, -3.5, 0.5);
    wait(1.6);
    log(`gate open=${sim.sig('dockGate')}`);
    push(1.3, -17.8, 0.5);
    shift(ShapeId.LONG);
    // turnstile: go once its arm has swung past the right half of the lane (pointing at the arch)
    waitUntil(() => {
      const a = ((mechState('turnstile')[0] ?? 0) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      return a > 1.35 && a < 1.75;
    }, 12);
    log(`turnstile angle ${(mechState('turnstile')[0] ?? 0).toFixed(2)}`);
    push(1.3, -31, 0.8, 20);
    log(`cp=${sim.cp}`);
    throughArch();
    shift(ShapeId.CUBE);
    push(5.0, -30.3, 0.35, 16);
    throughArch();
    // a courier hops inside (from the side) and hops the CUBE up onto the dock
    walkAll([[3.4, -30.3], [1.6, -29.4], [7.6, -29.4]], 6);
    input[0].pilot++;
    wait(0.3);
    log(`pilot slot=${sim.pilot.slot}`);
    for (let k = 0; k < 3 && art().y < 1.9; k++) {
      input[0].mx = 0;
      input[0].mz = -1;
      wait(0.15);
      input[0].jump++;
      wait(1.4);
      input[0].mz = 0;
      log(`hop ${k + 1}: artifact at (${art().x.toFixed(2)}, ${art().y.toFixed(2)}, ${art().z.toFixed(2)})`);
      if (art().y < 1.9) {
        // not up yet: line up again
        input[0].pilot++;
        wait(0.8);
        push(5.0, -30.3, 0.35, 8, [1, 2]);
        walkAll([[3.4, -30.3], null, null], 6);
        input[0].pilot++;
        wait(0.3);
      }
    }
    // centre it on the dock from inside
    for (let k = 0; k < 120 && Math.hypot(art().x - 5.0, art().z + 34.4) > 0.5; k++) {
      const dx = 5.0 - art().x, dz = -34.4 - art().z;
      const d = Math.hypot(dx, dz);
      input[0].mx = dx / d;
      input[0].mz = dz / d;
      step();
    }
    input[0].mx = input[0].mz = 0;
    throughArch();
    deliver([null, [3.5, -34.4], [6.5, -34.0]], true);
  },
  windbridge() {
    wait(0.5);
    push(0, -43.5, 0.8, 30);
    push(-2.5, -57.2, 0.6);
    shift(ShapeId.LONG);
    push(-2.5, -60.6, 0.4, 12);
    wait(1.4);
    log(`receiver=${sim.sig('receiver')}`);
    wait(2.2);
    push(-3.0, -70, 0.8);
    shift(ShapeId.CUBE);
    push(-3.4, -77.6, 0.6);
    deliver([[-4.4, -76.4], [-2.4, -76.4], [-4.0, -79.6]]);
  },
  clockwork() {
    wait(0.5);
    push(0, -79.9, 0.4, 20);
    walkAll([[-1.0, -78.4], [0.4, -80.5], [1.0, -78.4]], 5);
    const hand = () => mechState('clockHand')[0] ?? 0;
    const aligned = (tol = 0.1) => Math.abs(Math.sin(hand())) < tol;
    // P1 rides out to the hub and brakes the hand the next time it lines up
    waitUntil(() => aligned(0.12), 25);
    const t0 = t;
    while (t - t0 < 3 && Math.hypot(P(1).body.translation().x, P(1).body.translation().z + 84) > 0.35) (rawSteer(1, 0, -84), step());
    input[1].mx = input[1].mz = 0;
    log(`P1 at hub (${P(1).body.translation().x.toFixed(2)}, ${P(1).body.translation().y.toFixed(2)}, ${P(1).body.translation().z.toFixed(2)})`);
    waitUntil(() => aligned(0.04), 15);
    input[1].use = true;
    wait(0.4);
    log(`braked=${sim.sig('clockBrake')} hand=${hand().toFixed(2)}`);
    // load: push the CUBE onto the hand, the other two climb on behind it
    push(0, -82.5, 0.35, 10, [0, 2]);
    walkAll([[-0.6, -81.3], null, [0.6, -81.3]], 3);
    input[1].use = false;
    log(`riding: artifact (${art().x.toFixed(2)}, ${art().z.toFixed(2)})`);
    wait(2.0);
    waitUntil(() => aligned(0.04), 14);
    input[1].use = true;
    wait(0.4);
    log(`other side: artifact (${art().x.toFixed(2)}, ${art().y.toFixed(2)}, ${art().z.toFixed(2)}) braked=${sim.sig('clockBrake')}`);
    // unload: the two riders grip it and walk backwards onto the tower base
    pull(0, -89.4, 0.6, 12, [0, 2]);
    input[1].use = false;
    walkAll([null, [0.5, -88.6], null], 4);
    pull(0, -92.5, 0.6, 12);
    log(`cp=${sim.cp}`);
    push(-4.5, -100.8, 0.5);
    walkAll([[-5.3, -98.6], [-4.5, -98.4], [-3.7, -98.6]]);
    shift(ShapeId.TALL);
    tallPush(-4.5, -103.6);
    shift(ShapeId.CUBE);
    push(0, -97, 0.8);
    push(4.6, -95.8, 0.6);
    push(4.6, -101, 0.5);
    walkAll([[2.6, -99.5], [6.7, -98.9], [4.6, -98.4]]);
    // P1 holds the crank on the deck the whole way up (brake on: slow lift)
    input[1].use = true;
    const tl = t;
    while (!sim.sig('lift') && t - tl < 25) step();
    input[1].use = false;
    log(`lift up=${sim.sig('lift')}`);
    push(4.4, -108.4, 0.6);
    deliver([[3.0, -107.4], [5.8, -107.4], [4.4, -110.4]]);
  },
  mushroom() {
    const X = 70;
    wait(0.5);
    // Puzzle A: shove the CUBE onto the launch mushroom; couriers take the hop caps
    push(X, -6.0, 0.6, 15);
    waitUntil(() => art().y > 5.5, 6);
    log(`launched: artifact (${(art().x - X).toFixed(2)}, ${art().y.toFixed(2)}, ${art().z.toFixed(2)})`);
    // each courier walks onto a hop cap and lets go once airborne
    for (const [i, cx] of [[0, X - 5.6], [1, X + 5.6], [2, X - 5.6]] as const) {
      const t0 = t;
      while (t - t0 < 8 && P(i).body.translation().y < 2.5) (rawSteer(i, cx, -5.4), step());
      input[i].mx = input[i].mz = 0;
      wait(0.3);
    }
    wait(2.0);
    walkAll([[X - 1, -17], [X + 1, -17], [X + 3, -17]], 6);
    log(`cp=${sim.cp}`);
    // Puzzle B: across the bridge into the grove, round the puffball to the Giant Bounce
    push(X + 2, -26.6, 0.6, 20);
    push(X + 2, -36.4, 0.6, 20);
    push(X + 4.8, -47.6, 0.5, 25);
    log(`at the giant pad: artifact (${(art().x - X).toFixed(2)}, ${art().y.toFixed(2)}, ${art().z.toFixed(2)})`);
    // Puzzle C: P0 sets the aim to VILLAGE, P2 pumps; P1 rides along on the pad
    walkAll([[X + 9.6, -42.8], [X + 6.3, -49.1], [X + 9.6, -46.6]], 8);
    for (let k = 0; k < 4 && sim.sel('aim') !== 1; k++) {
      input[0].useN++; // Q press
      wait(0.5);
    }
    log(`aim=${sim.sel('aim')}`);
    input[2].use = true;
    const drops0 = sim.drops;
    waitUntil(() => art().z < -60 || sim.drops > drops0, 6);
    input[2].use = false;
    waitUntil(() => sim.artGrounded && art().z < -64, 4);
    log(`flew: artifact (${(art().x - X).toFixed(2)}, ${art().y.toFixed(2)}, ${art().z.toFixed(2)}) drops=${sim.drops} P1 (${(P(1).body.translation().x - X).toFixed(1)}, ${P(1).body.translation().z.toFixed(1)})`);
    // whoever is left behind hops back to the team (R)
    for (const i of [0, 1, 2]) if (P(i).body.translation().z > -64) input[i].resp++;
    wait(1.0);
    push(X, -79.5, 0.6, 20);
    deliver([[X - 1.6, -78.6], [X + 1.6, -78.6], [X, -82.2]]);
  },
  railway() {
    const X = -70;
    const cart = () => sim.snapshot('playing').m[sim.mechs.findIndex((m) => m.def.id === 'cart')] ?? [];
    wait(0.5);
    // Puzzle A: up the ramp into the cart bed (front of the bed), two couriers climb in behind it
    push(X + 3.5, 3.4, 0.5, 20);
    push(X + 3.5, -4.2, 0.4, 20);
    log(`cargo in bed=${cart()[7]} artifact (${(art().x - X).toFixed(2)}, ${art().y.toFixed(2)}, ${art().z.toFixed(2)})`);
    // riders board up the ramp (behind the cart), P2 goes to the lever (back down the ramp first if the push left it in the bed)
    for (const i of [0, 1, 2]) if (P(i).body.translation().y > 0.9) walkAll([i === 0 ? [X + 3.0, 3.6] : null, i === 1 ? [X + 4.0, 3.6] : null, i === 2 ? [X + 3.5, 3.6] : null], 6);
    walkAll([[X + 3.0, 2.6], [X + 4.0, 2.6], [X + 6.6, -1.4]], 8);
    walkAll([[X + 3.0, -1.6], [X + 4.0, -1.6], null], 6);
    log(`riders: P0 y=${P(0).body.translation().y.toFixed(2)} P1 y=${P(1).body.translation().y.toFixed(2)}`);
    log(`P2 at the lever: (${(P(2).body.translation().x - X).toFixed(2)}, ${P(2).body.translation().y.toFixed(2)}, ${P(2).body.translation().z.toFixed(2)})`);
    input[2].useN++; // P2 pulls Depart
    wait(1.0);
    log(`cart moving=${cart()[4]}`);
    waitUntil(() => cart()[4] === 0 && sim.cp >= 1, 20);
    input[2].resp++; // P2 was left on the platform: hop back to the team
    wait(1.2);
    log(`at junction: cp=${sim.cp} artifact (${(art().x - X).toFixed(2)}, ${art().y.toFixed(2)}, ${art().z.toFixed(2)}) P0 (${(P(0).body.translation().x - X).toFixed(1)}, ${P(0).body.translation().y.toFixed(1)}, ${P(0).body.translation().z.toFixed(1)})`);
    if (route === 'fast') {
      walkAll([null, null, [X + 8.0, -30.2]], 6);
      input[2].useN++; // points -> EXPRESS
      wait(0.6);
    }
    walkAll([null, null, [X + 7.4, -34.0]], 8);
    log(`P2 at (${(P(2).body.translation().x - X).toFixed(2)}, ${P(2).body.translation().y.toFixed(2)}, ${P(2).body.translation().z.toFixed(2)}) cargo=${cart()[7]}`);
    input[2].useN++; // depart
    wait(1.0);
    if (route === 'fast') {
      waitUntil(() => sim.cp >= 3 || sim.drops > 0, 15);
      log(`express: cp=${sim.cp} drops=${sim.drops} artifact (${(art().x - X).toFixed(2)}, ${art().y.toFixed(2)}, ${art().z.toFixed(2)})`);
      for (const i of [0, 1, 2]) if (P(i).body.translation().y < 4) input[i].resp++;
      wait(1.5);
    } else {
      waitUntil(() => cart()[4] === 0 && sim.cp >= 2, 25);
      input[2].resp++;
      wait(1.2);
      log(`crane yard: cp=${sim.cp} artifact (${(art().x - X).toFixed(2)}, ${art().y.toFixed(2)}, ${art().z.toFixed(2)})`);
      // riders climb out; P2 works the crane until the artifact is on the mesa
      walkAll([[X - 12.0, -50.0], [X - 7.0, -49.8], [X - 13.0, -54.6]], 8);
      input[2].use = true;
      waitUntil(() => sim.cp >= 3, 16);
      input[2].use = false;
      log(`crane done: cp=${sim.cp} artifact (${(art().x - X).toFixed(2)}, ${art().y.toFixed(2)}, ${art().z.toFixed(2)})`);
      // everyone bounces up the mesa
      for (const i of [0, 1, 2]) {
        const t0 = t;
        while (t - t0 < 8 && P(i).body.translation().y < 3) (rawSteer(i, X - 4.6, -53.6), step());
        input[i].mx = input[i].mz = 0;
        wait(1.4);
      }
    }
    push(X - 0.5, -64.0, 0.6, 20);
    deliver([[X - 2.0, -63.4], [X + 1.0, -63.4], [X - 0.5, -66.0]]);
  },
  castle() {
    wait(0.5);
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
    if (sim.shape !== ShapeId.CUBE) shift(ShapeId.CUBE);
    push(0, -154.2, 0.6, 20);
    // two hold the royal gate's plates, the third brings the artifact in
    walkAll([[-10.3, -155.4], null, [10.3, -155.4]], 10);
    log(`plates L=${sim.sig('plateL')} R=${sim.sig('plateR')} gate=${(mechState('royalGate')[0] ?? 0).toFixed(2)}`);
    push(0, -161, 0.6, 30, [1]);
    // the plate-holders walk in through the gateway (the portcullis only stops cargo)
    walkAll([[-2.6, -155.2], null, [2.6, -155.2]], 8);
    deliver([[-1.6, -159.0], [1.6, -158.6], [1.6, -163.2]]);
  },
};

const results: string[] = [];
let allOk = true;
if (roomMode) {
  room = new Room(fakeIo, 'bots', null, false, true, (m) => console.log(`  [room] ${m}`));
  members = ['A', 'B', 'C'].map((n, i) => room!.add(`tok-${n}`, n, fakeSocket(i)));
  const phase = (): string => room!.phase; // (re-read after steps; no narrowing)
  // the team picks in the lobby: all six in a row, or (`--room <world id>`, for debugging) just that world
  const start = only.length ? Math.max(0, MAPS.findIndex((m) => m.id === only[0])) : 0;
  const pick = only.length ? `map:${start}` : 'adventure';
  room.action(members[0], 'vote', pick);
  const lobbyWaited = phase() === 'waiting';
  room.action(members[1], 'vote', pick);
  const lobbyStarted = phase() === 'countdown' && room.map === start;
  results.push(`lobby: one pick waits=${lobbyWaited}, two matching picks start ${MAPS[start].sub}=${lobbyStarted}`);
  if (!lobbyWaited || !lobbyStarted) allOk = false;
  for (const map of MAPS.slice(start, only.length ? start + 1 : MAPS.length)) {
    const script = scripts[map.id];
    // countdown (the sim steps frozen), then play the world through the Room
    input = [0, 1, 2].map(() => ({ mx: 0, mz: 0, grab: false, jump: 0, pilot: 0, use: false, useN: 0, resp: 0 }));
    for (let k = 0; k < 600 && phase() !== 'playing'; k++) step();
    if (phase() !== 'playing' || room.map !== map.index) {
      results.push(`${map.sub}: room never started it (phase ${phase()}, map ${room.map})`);
      allOk = false;
      break;
    }
    sim = room.sim!;
    t = 0;
    console.log(`\n===== ${map.sub}: ${map.name} (room) =====`);
    script();
    const r = room.lastResults;
    const ok = phase() === 'finished' && r?.map === map.index;
    const line = `${map.sub} ${map.name}: ${ok ? 'FINISHED' : 'NOT FINISHED'}${r ? ` in ${(r.timeMs / 1000).toFixed(1)}s, crowns ${r.crowns}, score ${r.score}, drops ${r.drops}, stamps ${r.stamps}/${r.stampTotal}` : ''}`;
    log(line);
    results.push(line);
    if (!ok) {
      allOk = false;
      break;
    }
    if (map.index === MAPS.length - 1 || only.length) break;
    // results screen: one vote waits, the second (majority) moves the team on
    room.action(members[0], 'vote', 'next');
    for (let k = 0; k < 30; k++) step();
    const waited = phase() === 'finished';
    room.action(members[2], 'vote', 'next');
    const moved = phase() === 'countdown' && room.map === map.index + 1;
    results.push(`   vote: single vote waits=${waited}, majority starts ${mapAt(map.index + 1).sub}=${moved}`);
    if (!waited || !moved) allOk = false;
  }
  if (only.length) {
    console.log('\n' + results.join('\n'));
    process.exit(allOk ? 0 : 1);
  }
  const adv = room.lastResults?.adventure;
  const lob = lobbies.map((l) => l?.history?.length);
  results.push(`adventure: ${adv ? `${adv.maps} worlds, ${adv.crowns}/${adv.maxCrowns} crowns, score ${adv.score}, ${(adv.timeMs / 1000).toFixed(1)}s` : 'MISSING'} · history in every lobby: ${lob.join(',')}`);
  if (!adv || adv.maps !== MAPS.length || lob.some((n) => n !== MAPS.length)) allOk = false;
  room.close();
  console.log('\n' + results.join('\n'));
  process.exit(allOk ? 0 : 1);
}
for (const map of MAPS) {
  if (only.length && !only.includes(map.id)) continue;
  const script = scripts[map.id];
  if (!script) {
    results.push(`${map.sub} ${map.name}: (no bot script yet)`);
    continue;
  }
  sim = new Sim({ names: ['A', 'B', 'C'], slots: [0, 1, 2], map: map as MapDef });
  input = [0, 1, 2].map(() => ({ mx: 0, mz: 0, grab: false, jump: 0, pilot: 0, use: false, useN: 0, resp: 0 }));
  t = 0;
  console.log(`\n===== ${map.sub}: ${map.name} =====`);
  script();
  const r = sim.results;
  const line = `${map.sub} ${map.name}: ${sim.finished ? 'FINISHED' : 'NOT FINISHED'}${r ? ` in ${(r.timeMs / 1000).toFixed(1)}s, crowns ${r.crowns}, score ${r.score}, drops ${r.drops}, stamps ${r.stamps}/${r.stampTotal}` : ''}`;
  log(line);
  results.push(line);
  if (!sim.finished) allOk = false;
  sim.free();
}
console.log('\n' + results.join('\n'));
process.exit(allOk ? 0 : 1);
