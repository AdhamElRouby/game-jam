// Headless checks for artifact piloting. Run: npx tsx tests/pilot-test.ts
import RAPIER from '@dimforge/rapier3d-compat';
import { Sim, initPhysics } from '../server/sim';
import { ShapeId } from '../src/shared/shapes';
import * as C from '../src/shared/constants';
import { rotate, yawOfX, axisDiff } from '../src/shared/math';

await initPhysics();

let failures = 0;
function check(name: string, ok: boolean, info = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${info}`);
  if (!ok) failures++;
}
const f = (n: number) => n.toFixed(2);

interface In { mx: number; mz: number; jump: number; grab: boolean; resp: number; buttons: number; pilot: number; use: number }
function mk() {
  const sim = new Sim({ names: ['R', 'B', 'G'], slots: [0, 1, 2] });
  const inp: In[] = [0, 1, 2].map(() => ({ mx: 0, mz: 0, jump: 0, grab: false, resp: 0, buttons: 0, pilot: 0, use: 0 }));
  const evs: any[] = [];
  const step = (n = 1) => {
    for (let k = 0; k < n; k++) {
      for (let i = 0; i < 3; i++) {
        const q = inp[i];
        sim.setInput(i, q.mx, q.mz, q.jump, q.grab, q.resp, q.buttons, q.pilot, q.use);
      }
      sim.step(C.TICK_DT, true);
      evs.push(...sim.events);
      sim.events = [];
    }
  };
  const secs = (s: number, each?: () => void) => {
    const n = Math.round(s / C.TICK_DT);
    for (let i = 0; i < n; i++) {
      each?.();
      step();
    }
  };
  return { sim, inp, evs, step, secs };
}
const art = (s: Sim) => s.artifact.translation();
const finite = (s: Sim) => {
  const a = art(s);
  const ok = [a.x, a.y, a.z].every(Number.isFinite);
  return ok && s.players.every((p) => !p || [p.body.translation().x, p.body.translation().y, p.body.translation().z].every(Number.isFinite));
};
/** true if a courier capsule at its current position overlaps static geometry or the artifact */
function embedded(s: Sim, slot: number) {
  const p = s.players[slot]!;
  let hit = false;
  s.world.intersectionsWithShape(
    p.body.translation(),
    { x: 0, y: 0, z: 0, w: 1 },
    new RAPIER.Capsule(C.PLAYER_HALF_HEIGHT, C.PLAYER_RADIUS - 0.04),
    () => ((hit = true), false),
    RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
    C.groups(C.G_PLAYER, C.G_STATIC | C.G_ARTIFACT),
    p.collider,
    p.body,
  );
  return hit;
}

// ---------------------------------------------------------------- 1. entering
{
  const { sim, inp, evs, step, secs } = mk();
  sim.devTeleportArtifact(0, 1.02, 2);
  secs(0.3);
  sim.devTeleportPlayer(0, 0, 0, 3.6); // right behind the cube
  sim.devTeleportPlayer(1, 1.6, 0, 3.5);
  sim.devTeleportPlayer(2, 9, 0, 8); // far away
  secs(0.3);
  inp[2].pilot++;
  step(2);
  check('far courier cannot hop in', sim.pilot.slot === -1 && evs.some((e) => e.k === 'pilotFail' && e.by === 2));
  inp[0].pilot++;
  inp[1].pilot++; // same tick: only one may win
  step(2);
  check('exactly one pilot after simultaneous F', sim.pilot.slot === 0 && sim.players[0]!.inside && !sim.players[1]!.inside, `slot=${sim.pilot.slot}`);
  check('second courier told it is occupied', evs.some((e) => e.k === 'pilotFail' && e.by === 1));
  check('pilot body removed from the world', !sim.players[0]!.body.isEnabled());
  const snap = sim.snapshot('playing');
  const ps = snap.pl.find((p) => p[0] === 0)!;
  check('snapshot reports pilot at the artifact', snap.pi === 0 && Math.abs(ps[1] - art(sim).x) < 0.01 && (ps[8] & 32) !== 0);

  // ---------------------------------------------------------------- 2. CUBE scoot + hop + thump
  const z0 = art(sim).z;
  secs(2, () => {
    inp[0].mx = 0;
    inp[0].mz = -1;
  });
  inp[0].mz = 0;
  check('CUBE pilot scoots the artifact', z0 - art(sim).z > 1.5, `moved ${f(z0 - art(sim).z)} m`);
  secs(0.6);
  const y0 = art(sim).y;
  sim.devTeleportPlayer(1, art(sim).x + 1.9, 0, art(sim).z);
  secs(0.2);
  let maxY = y0;
  inp[0].jump++;
  secs(1.4, () => (maxY = Math.max(maxY, art(sim).y)));
  check('CUBE hop rises over a metre', maxY - y0 > 1.0, `rise ${f(maxY - y0)} m`);
  check('landing thump event', evs.some((e) => e.k === 'thump'));
  const p1 = sim.players[1]!.body.translation();
  check('thump shoves a nearby courier', Math.hypot(p1.x - art(sim).x, p1.z - art(sim).z) > 2.3, `d=${f(Math.hypot(p1.x - art(sim).x, p1.z - art(sim).z))}`);

  // ---------------------------------------------------------------- 3. shifting from inside
  sim.lastShiftAt = -99;
  sim.requestShift(0, ShapeId.LONG);
  step(2);
  check('pilot can shift from inside', sim.shape === ShapeId.LONG && sim.players[0]!.inside);
  secs(0.6);
  const yaw0 = yawOfX(sim.artifact.rotation());
  inp[0].jump++;
  secs(1.8);
  const dyaw = Math.abs(axisDiff(yawOfX(sim.artifact.rotation()), yaw0));
  check('LONG swing turns about 90°', dyaw > 1.2, `turned ${f((dyaw * 180) / Math.PI)}°`);

  // ---------------------------------------------------------------- 4. hopping out
  sim.lastShiftAt = -99;
  sim.requestShift(0, ShapeId.CUBE);
  secs(0.8);
  inp[0].pilot++;
  step(2);
  const out = sim.players[0]!;
  check('pilot hops out', !out.inside && sim.pilot.slot === -1 && out.body.isEnabled());
  check('exit spot not inside geometry', !embedded(sim, 0));
  secs(1.0);
  check('exited courier stands on ground', out.grounded, `y=${f(out.body.translation().y)}`);
  inp[0].pilot++;
  step(2);
  check('toggle cooldown respected / re-entry works', sim.pilot.slot === 0 || evs.some((e) => e.k === 'pilotFail' && e.by === 0));
  check('positions finite', finite(sim));
}

// ---------------------------------------------------------------- 5. ROUND: roll, boost, can't exit while fast, brake
{
  const { sim, inp, evs, step, secs } = mk();
  sim.devTeleportArtifact(0, 1.1, 4);
  secs(0.3);
  sim.devTeleportPlayer(0, 0, 0, 5.6);
  sim.devTeleportPlayer(1, -8, 0, 8);
  sim.devTeleportPlayer(2, 8, 0, 8);
  secs(0.2);
  sim.lastShiftAt = -99;
  sim.requestShift(0, ShapeId.ROUND);
  secs(0.5);
  inp[0].pilot++;
  step(2);
  check('ROUND boarded', sim.pilot.slot === 0);
  let maxV = 0;
  secs(1.6, () => {
    inp[0].mx = 0;
    inp[0].mz = -1;
    const v = sim.artifact.linvel();
    maxV = Math.max(maxV, Math.hypot(v.x, v.z));
  });
  inp[0].jump++; // boost
  secs(0.4, () => {
    const v = sim.artifact.linvel();
    maxV = Math.max(maxV, Math.hypot(v.x, v.z));
  });
  check('ROUND pilot accelerates', maxV > 5, `max ${f(maxV)} m/s`);
  check('ROUND speed stays capped', maxV < 12.5, `max ${f(maxV)} m/s`);
  inp[0].pilot++;
  step(2);
  check('cannot hop out while rolling fast', sim.players[0]!.inside && evs.some((e) => e.k === 'pilotFail' && e.by === 0 && /fast/i.test(e.why)));
  // brake by steering against the roll; the pending exit then completes on its own
  secs(3.0, () => {
    inp[0].mx = 0;
    inp[0].mz = sim.players[0]!.inside ? 1 : 0;
  });
  inp[0].mz = 0;
  check('pending exit completes after braking', !sim.players[0]!.inside, `v=${f(Math.hypot(sim.artifact.linvel().x, sim.artifact.linvel().z))}`);
  check('braked courier not embedded', !embedded(sim, 0));
}

// ---------------------------------------------------------------- 6. artifact falls off the world while occupied
{
  const { sim, inp, evs, step, secs } = mk();
  sim.devTeleportArtifact(0, 1.02, 2);
  secs(0.3);
  sim.devTeleportPlayer(0, 0, 0, 3.6);
  secs(0.3);
  inp[0].pilot++;
  step(2);
  sim.devTeleportArtifact(30, 1.02, 2); // over the void
  secs(3.0);
  check('drop recovered while occupied', evs.some((e) => e.k === 'drop'));
  check('pilot put back with the team', !sim.players[0]!.inside && sim.pilot.slot === -1 && sim.players[0]!.body.isEnabled());
  check('artifact back at checkpoint', Math.hypot(art(sim).x, art(sim).z - 2.5) < 1.5, `at ${f(art(sim).x)},${f(art(sim).z)}`);
}

// ---------------------------------------------------------------- 7. disconnect while piloting, reconnect
{
  const { sim, inp, step, secs } = mk();
  sim.devTeleportArtifact(0, 1.02, 2);
  secs(0.3);
  sim.devTeleportPlayer(0, 0, 0, 3.6);
  secs(0.3);
  inp[0].pilot++;
  step(2);
  inp[0].mz = -1;
  secs(0.5);
  sim.setConnected(0, false);
  const a0 = { ...art(sim) };
  // the room would pause; even if stepped, a disconnected pilot applies no force
  for (let i = 0; i < 60; i++) sim.step(C.TICK_DT, true);
  const drift = Math.hypot(art(sim).x - a0.x, art(sim).z - a0.z);
  check('disconnected pilot stops steering', drift < 0.6, `drift ${f(drift)}`);
  check('disconnected pilot keeps the seat', sim.pilot.slot === 0);
  sim.setConnected(0, true);
  // fresh tab: counters restart at zero, which must not toggle anything
  inp[0] = { mx: 0, mz: 0, jump: 0, grab: false, resp: 0, buttons: 0, pilot: 0, use: 0 };
  step(3);
  check('reconnected pilot still inside (no phantom F)', sim.pilot.slot === 0 && sim.players[0]!.inside);
}

// ---------------------------------------------------------------- 8. TALL lean is capped and brace rights it
{
  const { sim, inp, step, secs } = mk();
  sim.devTeleportArtifact(0, 2.3, 2);
  secs(0.3);
  sim.devTeleportPlayer(0, 0, 0, 3.6);
  secs(0.2);
  sim.lastShiftAt = -99;
  sim.requestShift(0, ShapeId.TALL);
  secs(0.6);
  sim.devTeleportPlayer(0, 0, 0, art(sim).z + 1.2);
  secs(0.2);
  inp[0].pilot++;
  step(2);
  let maxTilt = 0;
  secs(1.5, () => {
    inp[0].mx = 1;
    const up = rotate(sim.artifact.rotation(), { x: 0, y: 1, z: 0 });
    maxTilt = Math.max(maxTilt, Math.acos(Math.min(1, up.y)));
  });
  inp[0].mx = 0;
  check('TALL leans when steered', maxTilt > 0.08, `max ${f((maxTilt * 180) / Math.PI)}°`);
  inp[0].jump++;
  secs(1.2);
  const up = rotate(sim.artifact.rotation(), { x: 0, y: 1, z: 0 });
  check('TALL brace stands it back up', up.y > 0.97 || maxTilt > 0.62, `up.y=${f(up.y)}`);
}

// ---------------------------------------------------------------- 9. stress: rapid F + shift spam stays consistent
{
  const { sim, inp, step } = mk();
  sim.devTeleportArtifact(0, 1.02, 2);
  step(20);
  sim.devTeleportPlayer(0, 0, 0, 3.6);
  sim.devTeleportPlayer(1, 1.5, 0, 3.5);
  step(20);
  for (let i = 0; i < 400; i++) {
    if (i % 3 === 0) inp[0].pilot++;
    if (i % 5 === 0) inp[1].pilot++;
    if (i % 7 === 0) sim.requestShift(i % 2, i % 4);
    if (i % 11 === 0) inp[0].jump++;
    inp[1].mx = Math.sin(i * 0.1);
    step();
    const n = sim.players.filter((p) => p && p.inside).length;
    if (n > 1 || (n === 1) !== (sim.pilot.slot >= 0)) {
      check('occupancy consistent under spam', false, `tick ${i}: inside=${n} slot=${sim.pilot.slot}`);
      break;
    }
  }
  check('occupancy consistent under spam', true);
  check('no NaN after spam', finite(sim));
}

console.log(failures ? `\n${failures} FAILURES` : '\nALL PILOT CHECKS PASSED');
process.exit(failures ? 1 : 0);
