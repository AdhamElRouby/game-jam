// Trace a courier launched by a spring. npx tsx tests/debug-spring.ts [x] [y] [z] [mapId]
import { Sim, initPhysics } from '../server/sim';
import * as C from '../src/shared/constants';
import { MAPS } from '../src/shared/maps';

await initPhysics();
const [x, y, z] = [Number(process.argv[2] ?? 70), Number(process.argv[3] ?? 0), Number(process.argv[4] ?? -6.4)];
const map = MAPS.find((m) => m.id === (process.argv[5] ?? 'mushroom'))!;
const sim = new Sim({ names: ['R', 'B', 'G'], slots: [0, 1, 2], map });
sim.devTeleportPlayer(1, x - 8, 0, 8);
sim.devTeleportPlayer(2, x + 8, 0, 8);
for (let i = 0; i < 10; i++) sim.step(C.TICK_DT, true);
sim.devTeleportPlayer(0, x, y, z);
for (let i = 0; i < Number(process.env.N ?? 150); i++) {
  sim.step(C.TICK_DT, true);
  for (const e of sim.events) if (e.k !== 'impact') console.log(`  t=${(i / 60).toFixed(2)} ev`, JSON.stringify(e));
  sim.events = [];
  if (i % 6 === 0) {
    const p = sim.players[0]!;
    const t = p.body.translation();
    const v = p.body.linvel();
    console.log(`t=${(i / 60).toFixed(2)} pos=(${(t.x - (map.course ? 0 : 70)).toFixed(2)}, ${t.y.toFixed(2)}, ${t.z.toFixed(2)}) v=(${v.x.toFixed(1)}, ${v.y.toFixed(1)}, ${v.z.toFixed(1)}) g=${p.grounded} launchT=${p.launchT.toFixed(2)}`);
  }
}
