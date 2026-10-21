// Puffball check in context. npx tsx tests/debug-puff.ts
import { Sim, initPhysics } from '../server/sim';
import * as C from '../src/shared/constants';
import { MUSHROOM } from '../src/shared/maps/mushroom';

await initPhysics();
const X = 70;
const sim = new Sim({ names: ['R', 'B', 'G'], slots: [0, 1, 2], map: MUSHROOM });
sim.devWarp(2);
for (let i = 0; i < 5; i++) sim.step(C.TICK_DT, true);
sim.devTeleportPlayer(0, X - 0.9, 5, -43.6);
let maxY = 0;
for (let i = 0; i < 600; i++) {
  sim.step(C.TICK_DT, true);
  for (const e of sim.events) if (e.k === 'mech' || e.k === 'collect' || e.k === 'tumble' || e.k === 'hop' || e.k === 'fall') console.log(`t=${sim.time.toFixed(2)}`, JSON.stringify(e));
  sim.events = [];
  const p = sim.players[0]!.body.translation();
  maxY = Math.max(maxY, p.y);
  if (i % 30 === 0) console.log(`t=${sim.time.toFixed(2)} p=(${(p.x - X).toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}) state=${JSON.stringify(sim.snapshot('playing').m[7])}`);
}
console.log('maxY', maxY.toFixed(2), 'stamps', sim.stamps());
