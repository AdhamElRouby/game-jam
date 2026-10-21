// Crane + pilot trace. npx tsx tests/debug-crane.ts
import { Sim, initPhysics } from '../server/sim';
import * as C from '../src/shared/constants';
import { RAILWAY } from '../src/shared/maps/railway';

await initPhysics();
const X = -70;
const sim = new Sim({ names: ['R', 'B', 'G'], slots: [0, 1, 2], map: RAILWAY });
const inp = [0, 1, 2].map(() => ({ buttons: 0, pilot: 0 }));
const step = (n = 1) => {
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < 3; i++) sim.setInput(i, 0, 0, 0, false, 0, inp[i].buttons, inp[i].pilot, 0);
    sim.step(C.TICK_DT, true);
    for (const e of sim.events) if (e.k !== 'impact' && e.k !== 'respawn') console.log(`t=${sim.time.toFixed(2)}`, JSON.stringify(e).slice(0, 140));
    sim.events = [];
  }
};
sim.devWarp(2);
step(10);
const a = sim.artifact.translation();
console.log('artifact', (a.x - X).toFixed(2), a.y.toFixed(2), a.z.toFixed(2), 'cart', JSON.stringify(sim.snapshot('playing').m[sim.mechs.findIndex((m) => m.def.id === 'cart')]));
sim.devTeleportPlayer(1, X - 9.5, 0.55, -48.4);
step(5);
const p = sim.players[1]!.body.translation();
console.log('P1', (p.x - X).toFixed(2), p.y.toFixed(2), p.z.toFixed(2));
inp[1].pilot++;
step(5);
console.log('pilot slot', sim.pilot.slot);
sim.devTeleportPlayer(2, X - 13, 0, -54.6);
inp[2].buttons = 1;
for (let k = 0; k < 400; k++) {
  step();
  if (k % 30 === 0) {
    const c = sim.snapshot('playing').m[sim.mechs.findIndex((m) => m.def.id === 'crane')];
    console.log(`k=${k} crane=${JSON.stringify(c)} locked=${sim.artifactLocked()}`);
  }
}
