// Headless physics checks for the authoritative simulation. Run: npx tsx tests/sim-test.ts
import { Sim, initPhysics } from '../server/sim';
import { ShapeId } from '../src/shared/shapes';
import { TICK_DT } from '../src/shared/constants';
import { CASTLE, CLOCKWORK, DOCK, WINDBRIDGE } from '../src/shared/maps/course';
import type { MapDef } from '../src/shared/maps/types';

await initPhysics();

function mk(n = 3, map: MapDef = DOCK) {
  return new Sim({ names: ['R', 'B', 'G'], slots: [0, 1, 2].slice(0, n), map });
}
function run(sim: Sim, seconds: number, each?: (t: number) => void) {
  const steps = Math.round(seconds / TICK_DT);
  for (let i = 0; i < steps; i++) {
    each?.(i * TICK_DT);
    sim.step(TICK_DT, true);
  }
}
const art = (s: Sim) => s.artifact.translation();
const f = (n: number) => n.toFixed(2);
let failures = 0;
function check(name: string, ok: boolean, info = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${info}`);
  if (!ok) failures++;
}

// 1. pushing speed with 1..3 pushers (cube, flat ground). Players behind (+z) push toward -z.
for (const n of [1, 2, 3]) {
  const s = mk(3);
  s.devTeleportArtifact(0, 1.02, 2);
  run(s, 0.5);
  const xs = [-0.6, 0, 0.6];
  for (let i = 0; i < 3; i++) s.devTeleportPlayer(i, i < n ? xs[i] : 8 + i * 2, 0, i < n ? 3.6 : 8);
  run(s, 0.3);
  const z0 = art(s).z;
  run(s, 2.0, () => {
    for (let i = 0; i < n; i++) s.setInput(i, 0, -1, 0, false, 0);
  });
  const z1 = art(s).z;
  console.log(`  push x${n}: moved ${f(z0 - z1)} m in 2s (avg ${f((z0 - z1) / 2)} m/s)`);
}

// 2. gripping & pulling: player grabs from the front and walks away (pull)
{
  const s = mk(3);
  s.devTeleportArtifact(0, 1.02, 0);
  run(s, 0.4);
  s.devTeleportPlayer(0, 0, 0, -1.5);
  s.devTeleportPlayer(1, 8, 0, 6);
  s.devTeleportPlayer(2, -8, 0, 6);
  run(s, 0.2, () => s.setInput(0, 0, 0, 0, true, 0));
  const g = s.players[0]!.grip;
  check('grip attaches when close', !!g);
  const z0 = art(s).z;
  run(s, 2, () => s.setInput(0, 0, -1, 0, true, 0));
  console.log(`  pull x1: moved ${f(z0 - art(s).z)} m in 2s`);
}

// 3. shape shifting cycles keep the body and clear the ground
{
  const s = mk(3);
  run(s, 0.5);
  for (const shape of [ShapeId.LONG, ShapeId.TALL, ShapeId.ROUND, ShapeId.CUBE]) {
    s.lastShiftAt = -99;
    s.devTeleportPlayer(0, 0, 0, 4.2);
    s.step(TICK_DT, true);
    s.requestShift(0, shape);
    const ev = s.events.find((e) => e.k === 'shift' || e.k === 'shiftFail');
    s.events = [];
    run(s, 1.0);
    const p = art(s);
    check(`shift to ${shape}`, s.shape === shape, `${ev?.k} y=${f(p.y)}`);
  }
}

// 4. low arch: cube blocked, long passes
{
  const s = mk(3);
  s.devSolve('dockGate');
  s.devFreeze('turnstile'); // arch only (the turnstile maneuver is covered by bot-run): park its arm along the lane
  (s.mechById('turnstile') as unknown as { angle: number }).angle = Math.PI / 2;
  s.devTeleportArtifact(-1.3, 1.02, -21);
  run(s, 0.4);
  const n = 3;
  const xs = [-0.6, 0, 0.6];
  for (let i = 0; i < n; i++) s.devTeleportPlayer(i, -1.3 + xs[i], 0, -19.4);
  run(s, 3, () => {
    for (let i = 0; i < n; i++) s.setInput(i, 0, -1, 0, false, 0);
  });
  check('cube blocked by low arch', art(s).z > -25.2, `z=${f(art(s).z)}`);
  // now LONG
  s.lastShiftAt = -99;
  for (let i = 0; i < n; i++) s.setInput(i, 0, 0, 0, false, 0);
  run(s, 0.3);
  s.devTeleportArtifact(-1.3, 1.02, -21.5);
  run(s, 0.3);
  s.devTeleportPlayer(0, -1.3, 0, -19.0);
  s.requestShift(0, ShapeId.LONG);
  console.log('  shift events:', JSON.stringify(s.events.filter((e) => e.k.startsWith('shift'))));
  s.events = [];
  run(s, 0.5);
  for (let i = 0; i < n; i++) s.devTeleportPlayer(i, art(s).x + xs[i], 0, art(s).z + 3.0);
  run(s, 5, () => {
    for (let i = 0; i < n; i++) s.setInput(i, 0, -1, 0, false, 0);
  });
  check('LONG passes low arch', art(s).z < -28.5, `z=${f(art(s).z)} shape=${s.shape} cp=${s.cp}`);
}

// 5. plate opens gate
{
  const s = mk(3);
  s.devTeleportArtifact(0, 1.02, -3.5);
  run(s, 1.6);
  const gate = s.mechById('dockGate')!;
  check('plate opens gate', s.sig('dockPlate') && gate.progress() > 0.3, `plate=${s.sig('dockPlate')} gate=${f(gate.progress())}`);
}

// 6. wind: displacement per shape during a full cycle on island C
for (const shape of [ShapeId.CUBE, ShapeId.LONG, ShapeId.TALL, ShapeId.ROUND]) {
  const s = mk(3, WINDBRIDGE);
  for (let i = 0; i < 3; i++) s.devTeleportPlayer(i, 6 + i, 0, -48);
  s.devTeleportArtifact(0, 3, -53);
  run(s, 0.6);
  if (shape !== ShapeId.CUBE) {
    s.lastShiftAt = -99;
    s.devTeleportPlayer(0, 2.5, 0, -53);
    s.requestShift(0, shape);
    s.devTeleportPlayer(0, 6, 0, -48);
  }
  run(s, 0.5);
  const p0 = { ...art(s) };
  const up0 = s.artifact.rotation();
  run(s, 6.5);
  const p1 = art(s);
  console.log(`  wind ${['CUBE', 'LONG', 'TALL', 'ROUND'][shape]}: dx=${f(p1.x - p0.x)} dz=${f(p1.z - p0.z)} y=${f(p1.y)} shape=${s.shape} q=${f(s.artifact.rotation().w)} (was ${f(up0.w)})`);
}

// 7. lever: TALL at the wall triggers it; CUBE does not
{
  const s = mk(3, CLOCKWORK);
  s.devWarp(1);
  s.devTeleportArtifact(-4.5, 1.02, -102.6);
  run(s, 1.0);
  check('cube does not reach lever', !s.sig('lever'));
  s.lastShiftAt = -99;
  s.devTeleportPlayer(0, -2.5, 0, -101);
  s.requestShift(0, ShapeId.TALL);
  console.log('  ', JSON.stringify(s.events.filter((e) => e.k.startsWith('shift'))));
  run(s, 0.6);
  s.devTeleportPlayer(1, -4.5, 0, -101.2);
  run(s, 1.2, () => s.setInput(1, 0, -1, 0, false, 0));
  check('TALL reaches lever', s.sig('lever'), `art=${f(art(s).x)},${f(art(s).y)},${f(art(s).z)} shape=${s.shape}`);
}

// 8. ROUND downhill on the chute
{
  const s = mk(3, CASTLE);
  for (let i = 0; i < 3; i++) s.devTeleportPlayer(i, -6 + i, 8, -108);
  s.devTeleportArtifact(5, 9.1, -114);
  run(s, 0.3);
  s.lastShiftAt = -99;
  s.devTeleportPlayer(0, 5, 8, -111.5);
  s.requestShift(0, ShapeId.ROUND);
  s.devTeleportPlayer(0, -6, 8, -108);
  run(s, 0.2);
  s.devTeleportArtifact(5, 9.1, -116.5);
  let maxV = 0;
  run(s, 6, () => {
    const v = s.artifact.linvel();
    maxV = Math.max(maxV, Math.hypot(v.x, v.z));
  });
  console.log(`  ROUND chute: final ${f(art(s).x)},${f(art(s).y)},${f(art(s).z)} maxV=${f(maxV)} drops=${s.drops}`);
}

console.log(failures ? `\n${failures} FAILURES` : '\nALL CHECKS PASSED');
process.exit(0);
