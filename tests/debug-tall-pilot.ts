// Trace TALL tilt while a pilot leans/waddles it. npx tsx tests/debug-tall-pilot.ts [mx] [mz]
import { Sim, initPhysics } from '../server/sim';
import { ShapeId } from '../src/shared/shapes';
import * as C from '../src/shared/constants';
import { rotate } from '../src/shared/math';

await initPhysics();
const mx = Number(process.argv[2] ?? 1);
const mz = Number(process.argv[3] ?? 0);
const sim = new Sim({ names: ['R', 'B', 'G'], slots: [0, 1, 2] });
let pc = 0, jc = 0;
let imx = 0, imz = 0;
const step = (n = 1) => {
  for (let k = 0; k < n; k++) {
    sim.setInput(0, imx, imz, jc, false, 0, 0, pc, 0);
    sim.step(C.TICK_DT, true);
    for (const e of sim.events) if (e.k !== 'impact') console.log('  ev', JSON.stringify(e));
    sim.events = [];
  }
};
sim.devTeleportArtifact(0, 2.3, 2);
sim.devTeleportPlayer(1, -8, 0, 8);
sim.devTeleportPlayer(2, 8, 0, 8);
step(20);
sim.devTeleportPlayer(0, 0, 0, 3.6);
step(10);
sim.lastShiftAt = -99;
sim.requestShift(0, ShapeId.TALL);
step(40);
const a = sim.artifact.translation();
sim.devTeleportPlayer(0, a.x, 0, a.z + 1.2);
step(10);
pc++;
step(3);
console.log('inside', sim.players[0]!.inside, 'shape', sim.shape);
for (let i = 0; i < 150; i++) {
  imx = i < 90 ? mx : 0;
  imz = i < 90 ? mz : 0;
  if (i === 100) jc++;
  step();
  if (i % 10 === 0) {
    const up = rotate(sim.artifact.rotation(), { x: 0, y: 1, z: 0 });
    const t = sim.artifact.translation();
    const v = sim.artifact.linvel();
    console.log(`t=${(i / 60).toFixed(2)} tilt=${((Math.acos(Math.min(1, up.y)) * 180) / Math.PI).toFixed(1)}° up=(${up.x.toFixed(2)},${up.z.toFixed(2)}) pos=(${t.x.toFixed(2)},${t.y.toFixed(2)},${t.z.toFixed(2)}) v=(${v.x.toFixed(2)},${v.z.toFixed(2)}) grounded=${sim.artGrounded}`);
  }
}
