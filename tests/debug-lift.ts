// Debug: World 3 lift — who can start it. npx tsx tests/debug-lift.ts
import { Sim, initPhysics } from '../server/sim';
import * as C from '../src/shared/constants';
import { CLOCKWORK } from '../src/shared/maps/course';

await initPhysics();
const f = (n: number) => n.toFixed(2);
const secs = (s: number) => Math.round(s / C.TICK_DT);
function run(name: string, n: number, o: { pilot?: boolean; top?: boolean; brakeOff?: boolean; holder: number; crankAt?: [number, number]; holdS: number }) {
  const slots = [0, 1, 2].slice(0, n);
  const sim = new Sim({ names: ['R', 'B', 'G'].slice(0, n), slots, map: CLOCKWORK });
  const inp = slots.map(() => ({ use: false, pilot: 0 }));
  const step = (k = 1) => {
    for (let j = 0; j < k; j++) {
      slots.forEach((i) => sim.setInput(i, 0, 0, 0, false, 0, inp[i].use ? 1 : 0, inp[i].pilot, 0));
      sim.step(C.TICK_DT, true);
      sim.events = [];
    }
  };
  sim.devWarp(1);
  step(secs(2));
  sim.devSolve('lever');
  sim.devTeleportArtifact(4.6, 1.2, -101.4);
  const spots: [number, number, number][] = [[4.6, 0.05, -99.6], o.top ? [8.6, 8.05, -105.4] : [6.7, 0.05, -98.8], [2.6, 0.05, -99.5]];
  if (o.crankAt) spots[o.holder] = [o.crankAt[0], 0.05, o.crankAt[1]];
  for (let i = 0; i < n; i++) sim.devTeleportPlayer(i, ...spots[i]);
  step(secs(1));
  if (o.pilot) (inp[0].pilot++, step(10));
  if (o.brakeOff) (sim.mechById('liftBrake') as any).set(1);
  inp[o.holder].use = o.holdS > 0;
  step(secs(o.holdS));
  inp[o.holder].use = false;
  step(secs(Math.max(1, 16 - o.holdS)));
  const L = sim.mechById('lift') as any;
  console.log(`${name.padEnd(52)} inside=${sim.players[0]!.inside} stage=${L.stage} y=${f(L.y)} up=${sim.sig('lift')}`);
}
run('screenshot: pilot on deck + 1 up top, brake OFF, no Q', 2, { pilot: true, top: true, brakeOff: true, holder: 0, holdS: 0 });
run('pilot on deck + 1 up top, brake ON, pilot holds Q', 2, { pilot: true, top: true, holder: 0, holdS: 16 });
run('pilot on deck + 1 up top, brake ON, no Q', 2, { pilot: true, top: true, holder: 0, holdS: 0 });
run('3p on foot, brake ON, Q at crank 16 s', 3, { holder: 1, holdS: 16 });
run('3p on foot, brake ON, Q at crank 2 s', 3, { holder: 1, holdS: 2 });
run('3p on foot, brake ON, Q off the crank spot', 3, { holder: 1, holdS: 16, crankAt: [3.0, -102.5] });
run('solo pilot, brake ON, holds Q', 1, { pilot: true, holder: 0, holdS: 16 });
