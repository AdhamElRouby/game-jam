import { Sim, initPhysics } from '../server/sim';
import { TICK_DT } from '../src/shared/constants';
await initPhysics();
const s = new Sim({ names: ['R','B','G'], slots: [0,1,2] });
for (let i=0;i<30;i++) s.step(TICK_DT, true);
const pr = (tag: string) => { const t = s.artifact.translation(), q = s.artifact.rotation(); console.log(tag, 'pos', t.x.toFixed(2), t.y.toFixed(2), t.z.toFixed(2), 'q', q.x.toFixed(2), q.y.toFixed(2), q.z.toFixed(2), q.w.toFixed(2), 'shape', s.shape, 'players', s.players.map(p => { const pt = p!.body.translation(); return `${pt.x.toFixed(1)},${pt.y.toFixed(1)},${pt.z.toFixed(1)}`; }).join(' | ')); };
pr('start');
s.devTeleportPlayer(0, 0, 0, 4.2);
s.requestShift(0, 1);
pr('after shift');
for (let i=0;i<10;i++) { s.step(TICK_DT, true); }
pr('+10');
for (let i=0;i<50;i++) { s.step(TICK_DT, true); }
pr('+60');
