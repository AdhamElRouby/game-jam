import { Sim, initPhysics } from '../server/sim';
import { CLOCKWORK } from '../src/shared/maps/course';
import { TICK_DT } from '../src/shared/constants';
import { rotate } from '../src/shared/math';
await initPhysics();
const s = new Sim({ names: ['A','B','C'], slots: [0,1,2], map: CLOCKWORK });
s.devWarp(1);
s.devTeleportArtifact(-4.5, 1.02, -100.4);
for (let i=0;i<3;i++) s.devTeleportPlayer(i, -4.5 + (i-1)*0.6, 0, -98.6);
for (let k=0;k<20;k++) s.step(TICK_DT,true);
s.lastShiftAt = -99; s.requestShift(1, 2); console.log(JSON.stringify(s.events.filter(e=>e.k.startsWith('shift')))); s.events=[];
for (let k=0;k<30;k++) s.step(TICK_DT,true);
const pr = (tag: string) => { const c = s.artifact.translation(); const up = rotate(s.artifact.rotation(), {x:0,y:1,z:0}); console.log(tag, 'pos', c.x.toFixed(2), c.y.toFixed(2), c.z.toFixed(2), 'up', up.x.toFixed(2), up.y.toFixed(2), up.z.toFixed(2), 'grips', s.players.map(p=>p!.grip?1:0).join(''), 'lever', s.sig('lever'), 'players', s.players.map(p => { const t = p!.body.translation(); return `${t.x.toFixed(1)},${t.z.toFixed(1)}`; }).join(' ')); };
pr('start');
const mode = process.argv[2] ?? 'grip2';
for (let k=0;k<240;k++) {
  const c = s.artifact.translation();
  // players behind (+z), move -z
  for (let i=0;i<3;i++) {
    const grab = mode === 'grip2' ? i !== 1 : mode === 'grip0' ? false : true;
    const p = s.players[i]!.body.translation();
    const sx = c.x + (i-1)*0.55, sz = c.z + 1.05;
    let mx = 0, mz = -0.7;
    if (!s.players[i]!.grip && grab) { mx = (sx - p.x); mz = (sz - p.z); const m = Math.hypot(mx,mz); if (m>1){mx/=m;mz/=m;} }
    s.setInput(i, mx, mz, 0, grab, 0);
  }
  s.step(TICK_DT, true);
  if (k % 30 === 29) pr('t=' + ((k+1)/60).toFixed(1));
}
