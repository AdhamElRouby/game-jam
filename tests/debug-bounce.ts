// Trace the artifact through the Giant Bounce. npx tsx tests/debug-bounce.ts [aim 0|1|2] [shape]
import { Sim, initPhysics } from '../server/sim';
import * as C from '../src/shared/constants';
import { MUSHROOM } from '../src/shared/maps/mushroom';

await initPhysics();
const aim = Number(process.argv[2] ?? 1);
const shape = Number(process.argv[3] ?? 0);
const X = 70;
const sim = new Sim({ names: ['R', 'B', 'G'], slots: [0, 1, 2], map: MUSHROOM });
sim.devWarp(2);
const step = (use = false) => {
  sim.setInput(1, 0, 0, 0, false, 0, use ? 1 : 0, 0, 0);
  sim.step(C.TICK_DT, true);
  for (const e of sim.events) if (e.k !== 'impact') console.log(`  t=${sim.time.toFixed(2)} ev`, JSON.stringify(e).slice(0, 120));
  sim.events = [];
};
for (let i = 0; i < 5; i++) step();
if (shape) {
  sim.devTeleportPlayer(0, X + 5, 5, -45);
  step();
  sim.lastShiftAt = -99;
  sim.requestShift(0, shape);
  for (let i = 0; i < 30; i++) step();
}
(sim.mechById('aim') as any).value = aim;
sim.devTeleportArtifact(X + 5, shape === 3 ? 6.3 : 6.2, -47.8);
sim.devTeleportPlayer(1, X + 9.6, 5, -46.6);
sim.devTeleportPlayer(0, X - 2, 5, -36);
sim.devTeleportPlayer(2, X, 5, -36);
for (let i = 0; i < 20; i++) step();
for (let i = 0; i < 300; i++) {
  step(i < 120);
  if (i % 8 === 0) {
    const a = sim.artifact.translation();
    const v = sim.artifact.linvel();
    console.log(`t=${sim.time.toFixed(2)} art=(${(a.x - X).toFixed(2)}, ${a.y.toFixed(2)}, ${a.z.toFixed(2)}) v=(${v.x.toFixed(1)}, ${v.y.toFixed(1)}, ${v.z.toFixed(1)}) pump=${sim.sig('pump')} g=${sim.artGrounded}`);
  }
}
