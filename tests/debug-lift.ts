// Debug: World 3 lift — what makes it rise. npx tsx tests/debug-lift.ts
import { Sim, initPhysics } from '../server/sim';
import * as C from '../src/shared/constants';
import { CLOCKWORK } from '../src/shared/maps/course';

await initPhysics();
const f = (n: number) => n.toFixed(2);
const secs = (s: number) => Math.round(s / C.TICK_DT);
function mk(n: number) {
  const slots = [0, 1, 2].slice(0, n);
  const sim = new Sim({ names: ['R', 'B', 'G'].slice(0, n), slots, map: CLOCKWORK });
  const inp = slots.map(() => ({ use: false, pilot: 0 }));
  const step = (k = 1) => {
    for (let j = 0; j < k; j++) {
      slots.forEach((i) => sim.setInput(i, 0, 0, 0, false, 0, inp[i].use ? 1 : 0, inp[i].pilot, 0));
      sim.step(C.TICK_DT, true);
      for (const e of sim.events) if (['toast', 'pilotFail'].includes((e as any).k)) console.log('   ev', JSON.stringify(e));
      sim.events = [];
    }
  };
  sim.devWarp(1);
  step(secs(2));
  return { sim, inp, step };
}
const lift = (s: Sim) => s.mechById('lift') as any;
function run(name: string, n: number, opts: { lever?: boolean; crankAt?: [number, number]; holdS: number; brakeOff?: boolean; pilot?: boolean }) {
  const { sim, inp, step } = mk(n);
  if (opts.lever !== false) sim.devSolve('lever');
  sim.devTeleportArtifact(4.6, 1.2, -101.4);
  const spots: [number, number][] = [opts.crankAt ?? [6.7, -98.8], [2.6, -99.5], [4.6, -98.4]];
  for (let i = 0; i < n; i++) sim.devTeleportPlayer(i, spots[i][0], 0.05, spots[i][1]);
  step(secs(1));
  if (opts.pilot) {
    sim.devTeleportPlayer(n - 1, 4.6, 0.05, -99.6);
    step(secs(0.5));
    inp[n - 1].pilot++;
    step(10);
  }
  if (opts.brakeOff) (sim.mechById('liftBrake') as any).set(1);
  inp[0].use = true;
  step(secs(opts.holdS));
  inp[0].use = false;
  step(secs(Math.max(0, 16 - opts.holdS)));
  const L = lift(sim);
  console.log(`${name.padEnd(40)} stage=${L.stage} y=${f(L.y)} aboard=${L.aboard} up=${sim.sig('lift')} art.y=${f(sim.artifact.translation().y)}`);
}
run('3p, lever, crank held 16 s (brake on)', 3, { holdS: 16 });
run('3p, lever, crank held 2 s (brake on)', 3, { holdS: 2 });
run('3p, lever, crank held 2 s, brake off', 3, { holdS: 2, brakeOff: true });
run('3p, NO lever, crank held 16 s', 3, { holdS: 16, lever: false });
run('3p, Q held off the crank spot', 3, { holdS: 16, crankAt: [3.0, -102.5] });
run('solo, crank held 16 s', 1, { holdS: 16 });
run('2p, one piloting, other cranks 16 s', 2, { holdS: 16, pilot: true });
