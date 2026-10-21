// Physics stress + edge cases across the worlds. Run: npx tsx tests/stress-test.ts
import RAPIER from '@dimforge/rapier3d-compat';
import { Sim, initPhysics } from '../server/sim';
import { ShapeId } from '../src/shared/shapes';
import * as C from '../src/shared/constants';
import { MAPS } from '../src/shared/maps';
import { CASTLE, CLOCKWORK, DOCK, WINDBRIDGE } from '../src/shared/maps/course';
import { MUSHROOM } from '../src/shared/maps/mushroom';
import { RAILWAY } from '../src/shared/maps/railway';
import type { MapDef } from '../src/shared/maps/types';

await initPhysics();
let failures = 0;
const check = (n: string, ok: boolean, info = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${info}`);
  if (!ok) failures++;
};
const f = (n: number) => n.toFixed(2);

function mk(map: MapDef) {
  const sim = new Sim({ names: ['R', 'B', 'G'], slots: [0, 1, 2], map });
  const inp = [0, 1, 2].map(() => ({ mx: 0, mz: 0, jump: 0, grab: false, resp: 0, buttons: 0, pilot: 0, use: 0 }));
  let bad = '';
  let maxV = 0;
  const step = (n = 1) => {
    for (let k = 0; k < n; k++) {
      for (let i = 0; i < 3; i++) {
        const q = inp[i];
        sim.setInput(i, q.mx, q.mz, q.jump, q.grab, q.resp, q.buttons, q.pilot, q.use);
      }
      sim.step(C.TICK_DT, true);
      sim.events = [];
      const a = sim.artifact.translation();
      const v = sim.artifact.linvel();
      if (![a.x, a.y, a.z, v.x, v.y, v.z].every(Number.isFinite)) bad ||= `artifact NaN at t=${f(sim.time)}`;
      maxV = Math.max(maxV, Math.hypot(v.x, v.y, v.z));
      for (const p of sim.players) {
        if (!p) continue;
        const t = p.body.translation();
        if (![t.x, t.y, t.z].every(Number.isFinite)) bad ||= `courier ${p.slot} NaN at t=${f(sim.time)}`;
      }
    }
  };
  const secs = (s: number) => step(Math.round(s / C.TICK_DT));
  return { sim, inp, step, secs, bad: () => bad, maxV: () => maxV };
}

/** artifact overlapping static geometry (beyond the 0.1 rounding) */
function embedded(sim: Sim) {
  let hit = false;
  const shape = sim.artCol.shape;
  sim.world.intersectionsWithShape(
    sim.artifact.translation(),
    sim.artifact.rotation(),
    shape,
    (col) => {
      // a small contact overlap is normal; deep overlap means it went into something
      const proj = col.projectPoint(sim.artifact.translation(), true);
      if (proj && proj.isInside) hit = true;
      return !hit;
    },
    RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
    C.groups(C.G_ARTIFACT, C.G_STATIC),
    sim.artCol,
    sim.artifact,
  );
  return hit;
}

// 1. 100 rapid shift requests from all three couriers
{
  const { sim, step, bad } = mk(DOCK);
  sim.devTeleportArtifact(0, 1.02, 1);
  step(20);
  sim.devTeleportPlayer(0, -1.6, 0, 1);
  sim.devTeleportPlayer(1, 1.6, 0, 1);
  sim.devTeleportPlayer(2, 0, 0, 2.6);
  step(10);
  const t0 = sim.time;
  for (let k = 0; k < 100; k++) {
    sim.requestShift(k % 3, (k * 7) % 4);
    step(2);
  }
  const elapsed = sim.time - t0;
  check('100 shift requests: no NaN', !bad(), bad());
  check('shift cooldown respected', sim.shifts <= Math.ceil(elapsed / (C.SHIFT_COOLDOWN_MS / 1000)) + 1, `${sim.shifts} shifts in ${f(elapsed)}s`);
  step(60);
  check('artifact not embedded after shift spam', !embedded(sim));
}

// 2. ROUND at full speed into walls (castle wall, arch wall) never tunnels
for (const [map, x, z, dz, wallZ, name] of [
  [CASTLE, 0, -164, -1, -170, 'castle wall'],
  [DOCK, 6, -22, -1, -25, 'arch wall'],
] as const) {
  const { sim, step, bad, maxV } = mk(map);
  if (map === DOCK) sim.devSolve('dockGate');
  sim.devTeleportPlayer(0, x, 0, z + 2.4);
  step(5);
  sim.lastShiftAt = -99;
  sim.devTeleportArtifact(x, 1.1, z);
  step(2);
  sim.requestShift(0, ShapeId.ROUND);
  sim.devTeleportPlayer(0, x + 6, 0, z + 4);
  step(10);
  for (let k = 0; k < 6; k++) {
    sim.artifact.setLinvel({ x: 0, y: 0, z: dz * 11 }, true);
    step(30);
  }
  const a = sim.artifact.translation();
  check(`fast ROUND into the ${name} doesn't tunnel`, dz < 0 ? a.z > wallZ - 0.2 : a.z < wallZ + 0.2, `z=${f(a.z)} maxV=${f(maxV())}`);
  check(`no NaN (${name})`, !bad(), bad());
}

// 3. TALL knocked over beside a wall settles without embedding
{
  const { sim, step, secs, bad } = mk(CLOCKWORK);
  sim.devWarp(1);
  sim.devTeleportArtifact(-8.4, 2.3, -102.6);
  sim.devTeleportPlayer(0, -7, 0, -100.6);
  step(5);
  sim.lastShiftAt = -99;
  sim.requestShift(0, ShapeId.TALL);
  step(5);
  sim.artifact.applyTorqueImpulse({ x: 40, y: 0, z: 30 }, true);
  secs(3);
  check('toppled TALL beside the tower wall not embedded', !embedded(sim));
  check('no NaN (TALL)', !bad(), bad());
}

// 4. Repeated spring launches (the launch mushroom, 6 times)
{
  const { sim, step, bad, maxV } = mk(MUSHROOM);
  let landed = 0;
  for (let k = 0; k < 6; k++) {
    sim.devTeleportArtifact(70, 1.2, -6.4);
    step(Math.round(3 / C.TICK_DT));
    if (sim.artifact.translation().y > 5.5) landed++;
  }
  check('six spring launches all land on the terrace', landed === 6, `${landed}/6 maxV=${f(maxV())}`);
  check('launch speeds stay bounded', maxV() < 26, `maxV=${f(maxV())}`);
  check('no NaN (springs)', !bad(), bad());
}

// 5. Reset while gripped + rapid recall votes
{
  const { sim, inp, step, bad } = mk(DOCK);
  sim.devTeleportArtifact(0, 1.02, 0);
  step(10);
  sim.devTeleportPlayer(0, 0, 0, 1.6);
  sim.devTeleportPlayer(1, 1.6, 0, 0);
  step(5);
  inp[0].grab = inp[1].grab = true;
  step(10);
  const gripped = sim.gripCount();
  for (let k = 0; k < 20; k++) {
    sim.voteReset(k % 3);
    sim.voteReset((k + 1) % 3);
    step(3);
  }
  check('grips existed before resets', gripped >= 1, `grips=${gripped}`);
  check('20 recalls: consistent, artifact at checkpoint', Math.hypot(sim.artifact.translation().x, sim.artifact.translation().z - 2.5) < 1.5 && !bad(), `drops=${sim.drops}`);
  inp[0].grab = inp[1].grab = false;
  step(5);
  check('grips released after resets', sim.gripCount() === 0);
}

// 6. Long rides on moving machinery: 90 s on the clock hand + the wobble bridge with LONG swinging
{
  const { sim, step, secs, bad } = mk(CLOCKWORK);
  sim.devTeleportArtifact(0, 1.1, -84);
  secs(90);
  check('90 s riding the clock hand: no NaN', !bad(), bad());
  const a = sim.artifact.translation();
  check('artifact either rode or was recalled cleanly', Number.isFinite(a.y) && a.y > -14, `y=${f(a.y)} drops=${sim.drops}`);
}
{
  const { sim, inp, step, secs, bad } = mk(WINDBRIDGE);
  sim.devTeleportArtifact(0, 1.0, -41.5);
  sim.devTeleportPlayer(0, 0, 0, -38.6);
  step(10);
  sim.lastShiftAt = -99;
  sim.requestShift(0, ShapeId.LONG);
  step(30);
  inp[0].pilot++;
  step(3);
  for (let k = 0; k < 8; k++) {
    inp[0].jump++; // swing
    secs(1.2);
  }
  check('LONG swinging on the wobble bridge: no NaN', !bad(), bad());
}

// 7. Crane: pilot inside while carried, fling, many cycles
{
  const { sim, inp, step, secs, bad } = mk(RAILWAY);
  sim.devWarp(2); // artifact in the cart at the crane yard
  secs(1.0); // let the post-recall respawn window pass
  const X = -70;
  sim.devTeleportPlayer(1, X - 9.5, 0.55, -48.4);
  step(5);
  inp[1].pilot++; // P1 hops inside
  step(5);
  sim.devTeleportPlayer(2, X - 13, 0, -54.6);
  inp[2].buttons = 1; // hold Q at the crane
  let carried = false;
  for (let k = 0; k < 600 && !carried; k++) {
    step();
    carried = sim.artifactLocked();
  }
  check('crane grabs the artifact with a pilot inside', carried && sim.pilot.slot === 1);
  inp[1].mx = 1;
  secs(1.6); // hook all the way up (~8 m over the yard)
  inp[1].mx = 0;
  inp[1].pilot++; // tries to hop out high in the air: must wait safely
  step(10);
  check('pilot cannot hop out high under the hook', sim.players[1]!.inside, `artifact y=${f(sim.artifact.translation().y)}`);
  secs(1.5);
  inp[2].buttons = 0; // let go mid-swing: fling
  step(5);
  check('fling releases the artifact', !sim.artifactLocked());
  secs(4);
  check('no NaN (crane)', !bad(), bad());
  // many held cycles with nothing to grab
  inp[2].buttons = 1;
  secs(40);
  check('40 s of empty crane cycles: no NaN', !bad(), bad());
}

// 8. Out of bounds: an artifact flung far off is recalled
{
  const { sim, step, secs } = mk(RAILWAY);
  step(5);
  sim.devTeleportArtifact(-70, 30, -200);
  secs(5);
  const a = sim.artifact.translation();
  check('artifact far outside the map is recalled', Math.hypot(a.x + 72.2, a.z - 1.2) < 3, `at (${f(a.x)}, ${f(a.z)})`);
}

// 9. CPU cost per step on every world (3 couriers walking)
for (const map of MAPS) {
  const { sim, inp, step } = mk(map);
  inp.forEach((q, i) => ((q.mx = Math.sin(i)), (q.mz = -0.7)));
  step(30);
  const t0 = performance.now();
  step(600);
  const ms = (performance.now() - t0) / 600;
  check(`${map.sub} step cost`, ms < 4, `${ms.toFixed(3)} ms/step (${map.mechs.length} mechanisms)`);
  sim.free();
}

console.log(failures ? `\n${failures} FAILURES` : '\nALL STRESS CHECKS PASSED');
process.exit(failures ? 1 : 0);
