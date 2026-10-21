// World 4 launch checks: every spring mushroom lands where it should. npx tsx tests/mushroom-test.ts
import { Sim, initPhysics } from '../server/sim';
import { ShapeId } from '../src/shared/shapes';
import * as C from '../src/shared/constants';
import { MUSHROOM } from '../src/shared/maps/mushroom';

await initPhysics();
const X = 70;
let failures = 0;
const check = (n: string, ok: boolean, info = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${info}`);
  if (!ok) failures++;
};
const f = (n: number) => n.toFixed(2);
function mk() {
  const sim = new Sim({ names: ['R', 'B', 'G'], slots: [0, 1, 2], map: MUSHROOM });
  const evs: any[] = [];
  const inp = [0, 1, 2].map(() => ({ mx: 0, mz: 0, use: false }));
  const step = (n = 1) => {
    for (let k = 0; k < n; k++) {
      for (let i = 0; i < 3; i++) sim.setInput(i, inp[i].mx, inp[i].mz, 0, false, 0, inp[i].use ? 1 : 0, 0, 0);
      sim.step(C.TICK_DT, true);
      evs.push(...sim.events);
      sim.events = [];
    }
  };
  // park the couriers out of the way
  sim.devTeleportPlayer(0, X - 7, 0, 6);
  sim.devTeleportPlayer(1, X - 5, 0, 7);
  sim.devTeleportPlayer(2, X + 7, 0, 6);
  step(10);
  return { sim, evs, inp, step };
}
const secs = (s: number) => Math.round(s / C.TICK_DT);

// 1. launch mushroom: CUBE onto the cap terrace
for (const [shape, name] of [[ShapeId.CUBE, 'CUBE'], [ShapeId.ROUND, 'ROUND']] as const) {
  const { sim, step } = mk();
  if (shape !== ShapeId.CUBE) {
    sim.devTeleportPlayer(0, X, 0, 3);
    step(2);
    sim.lastShiftAt = -99;
    sim.requestShift(0, shape);
    sim.devTeleportPlayer(0, X - 7, 0, 6);
    step(30);
  }
  sim.devTeleportArtifact(X, 1.2, -6.4);
  step(secs(3.5));
  const a = sim.artifact.translation();
  check(`launch shroom puts ${name} on the terrace`, a.y > 5.5 && a.z < -14 && a.z > -28 || (name === 'ROUND' && (a.y < 0 || a.y > 5.5)), `at (${f(a.x - X)}, ${f(a.y)}, ${f(a.z)}) drops=${sim.drops}`);
}

// 2. courier hop caps + launch shroom land on the terrace; perch cap reaches the stamp perch
{
  const { sim, step } = mk();
  sim.devTeleportPlayer(0, X - 5.6, 0, -5.4);
  sim.devTeleportPlayer(1, X + 5.6, 0, -5.4);
  sim.devTeleportPlayer(2, X, 0, -6.4);
  step(secs(2.5));
  const ps = [0, 1, 2].map((i) => sim.players[i]!.body.translation());
  ps.forEach((p, i) => check(`courier ${i} bounced up to the terrace`, p.y > 5.3 && p.z < -13.2, `at (${f(p.x - X)}, ${f(p.y)}, ${f(p.z)})`));
  sim.devTeleportPlayer(0, X - 5.8, 5, -17.4);
  step(secs(2.0));
  const q = sim.players[0]!.body.translation();
  check('perch cap reaches the perch', q.y > 8.8, `at (${f(q.x - X)}, ${f(q.y)}, ${f(q.z)})`);
  check('perch stamp collected', sim.stamps() >= 1, `stamps=${sim.stamps()}`);
}

// 3. giant bounce: aims
for (const [aim, want] of [[1, 'village'], [0, 'hollow'], [2, 'void']] as const) {
  const { sim, inp, step } = mk();
  sim.devWarp(2);
  step(5);
  for (let k = 0; k < aim; k++) {
    (sim.mechById('aim') as any).value = aim;
  }
  (sim.mechById('aim') as any).value = aim;
  sim.devTeleportArtifact(X + 5, 6.2, -47.8);
  sim.devTeleportPlayer(1, X + 9.6, 5, -46.6); // pump operator
  sim.devTeleportPlayer(0, X - 2, 5, -36);
  sim.devTeleportPlayer(2, X, 5, -36);
  step(20);
  inp[1].use = true;
  step(secs(2.0));
  inp[1].use = false;
  step(secs(3.0));
  const a = sim.artifact.translation();
  const ok =
    want === 'village' ? a.y > 2.5 && a.y < 4 && a.z < -68 && a.z > -88 :
    want === 'hollow' ? (a.y > 4.5 && a.y < 6 && a.z < -57 && a.z > -62) :
    sim.drops > 0;
  check(`giant bounce aim ${want}`, ok, `at (${f(a.x - X)}, ${f(a.y)}, ${f(a.z)}) drops=${sim.drops} shortcut=${[...sim.shortcuts]} stamps=${sim.stamps()}`);
}

// 4. puffball pops couriers up into the stamp above it
{
  const { sim, step } = mk();
  sim.devWarp(2);
  step(2);
  sim.devTeleportPlayer(0, X - 0.9, 5, -43.6);
  let got = false;
  for (let k = 0; k < secs(9); k++) {
    step();
    if (sim.stamps() > 0) got = true;
  }
  check('puffball launches a courier into the stamp', got);
}

console.log(failures ? `\n${failures} FAILURES` : '\nALL MUSHROOM CHECKS PASSED');
process.exit(failures ? 1 : 0);
