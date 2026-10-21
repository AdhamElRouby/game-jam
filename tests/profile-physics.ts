// Headless authoritative Rapier benchmark; separate from browser/server contention.
import { Sim, initPhysics } from '../server/sim';
import { MAPS } from '../src/shared/maps';
import { TICK_DT } from '../src/shared/constants';
import { mkdir, writeFile } from 'node:fs/promises';
await initPhysics();
const results = [];
const stats = (a: number[]) => { a.sort((a,b) => a-b); return { n: a.length, median: a[Math.floor(a.length*.5)], p95: a[Math.floor(a.length*.95)], max: a.at(-1) }; };
for (const map of MAPS) {
  const sim = new Sim({ names: ['a','b','c'], slots: [0,1,2], map });
  const total: number[] = [], physics: number[] = [];
  const original = sim.world.step.bind(sim.world);
  sim.world.step = (...args: Parameters<typeof original>) => { const t = performance.now(); original(...args); physics.push(performance.now()-t); };
  for (let i = 0; i < 2400; i++) {
    for (const p of sim.players) if (p) sim.setInput(p.slot, Math.sin(i/90+p.slot), Math.cos(i/90+p.slot), Math.floor(i/120), i%180<60, 0);
    const t = performance.now(); sim.step(TICK_DT, true); if (i >= 300) total.push(performance.now()-t); else physics.length = 0;
    sim.events = [];
  }
  results.push({ world: map.name, totalStepMs: stats(total), rapierStepMs: stats(physics), bodies: sim.world.bodies.len(), colliders: sim.world.colliders.len() });
  sim.free();
}
await mkdir('tests/out/performance', { recursive: true });
await writeFile(`tests/out/performance/physics-${process.argv[2] ?? 'profile'}.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
