// Server cost per world: one room's Sim with 3 couriers walking in circles around the artifact (two of them pushing it
// part of the time), 20 s of play at 60 Hz. Reports step time p50 / p95 / max, snapshot build + JSON encode time and
// size, and the time to build the world (startMap). npx tsx tests/perf-sim.ts [seconds]
import { Sim, initPhysics } from '../server/sim';
import * as C from '../src/shared/constants';
import { MAPS } from '../src/shared/maps';

await initPhysics();
const SECS = Number(process.argv[2] ?? 20);
const pct = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor((p / 100) * a.length))];
const f = (n: number) => n.toFixed(3);
let worst = 0;
for (const map of MAPS) {
  const t0 = performance.now();
  const sim = new Sim({ names: ['R', 'B', 'G'], slots: [0, 1, 2], map });
  const build = performance.now() - t0;
  // warm up (JIT) then measure
  for (let k = 0; k < 60; k++) sim.step(C.TICK_DT, true);
  const steps: number[] = [];
  const snaps: number[] = [];
  const sizes: number[] = [];
  const n = Math.round(SECS * C.TICK_HZ);
  for (let k = 0; k < n; k++) {
    const t = k * C.TICK_DT;
    for (let i = 0; i < 3; i++) {
      // circle, and every 4 s walk toward the artifact for 2 s (pushing it)
      let mx = Math.cos(t * 1.8 + i * 2.1);
      let mz = Math.sin(t * 1.8 + i * 2.1);
      const p = sim.players[i];
      if (p && i < 2 && Math.floor(t / 2) % 2 === 1) {
        const a = sim.artifact.translation();
        const b = p.body.translation();
        const d = Math.hypot(a.x - b.x, a.z - b.z) || 1;
        mx = (a.x - b.x) / d;
        mz = (a.z - b.z) / d;
      }
      sim.setInput(i, mx, mz, Math.floor(t / 1.5), false, 0, 0, 0, 0, 0);
    }
    const s0 = performance.now();
    sim.step(C.TICK_DT, true);
    const s1 = performance.now();
    steps.push(s1 - s0);
    sim.events = [];
    if (k % 2 === 0) {
      const j0 = performance.now();
      const json = JSON.stringify(sim.snapshot('playing'));
      snaps.push(performance.now() - j0);
      sizes.push(json.length);
    }
  }
  worst = Math.max(worst, pct(steps, 99));
  console.log(
    `${map.name.padEnd(30)} build ${build.toFixed(1)} ms  step p50 ${f(pct(steps, 50))} p95 ${f(pct(steps, 95))} p99 ${f(pct(steps, 99))} max ${f(Math.max(...steps))} ms  ` +
      `snapshot ${f(pct(snaps, 50))} ms  ${Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length)} B (mechs ${sim.mechs.length}, colliders ${sim.world.colliders.len()})`,
  );
  sim.free();
}
console.log(`worst p99 step ${f(worst)} ms of the ${(1000 / C.TICK_HZ).toFixed(1)} ms tick budget`);
