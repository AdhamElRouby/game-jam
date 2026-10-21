import { Sim, initPhysics } from '../server/sim';
import { CASTLE } from '../src/shared/maps/course';
import { TICK_DT } from '../src/shared/constants';
import { LEVEL } from '../src/shared/level';
await initPhysics();
const fanForce = LEVEL.windZones[1].force;
for (const fanOn of [false, true]) {
  LEVEL.windZones[1].force = fanOn ? fanForce : 0;
  const s = new Sim({ names: ['A','B','C'], slots: [0,1,2], map: CASTLE });
  
  for (let i=0;i<3;i++) s.devTeleportPlayer(i, -6 + i, 8, -108);
  s.devTeleportArtifact(5, 9.1, -113); for (let k=0;k<20;k++) s.step(TICK_DT,true);
  s.lastShiftAt=-99; s.devTeleportPlayer(0, 5, 8, -110.6); for (let k=0;k<2;k++) s.step(TICK_DT,true);
  s.requestShift(0, 3); s.devTeleportPlayer(0, -6, 8, -108);
  s.artifact.setLinvel({x:0,y:0,z:-2}, true);
  let maxV = 0, t = 0, reach = -1, path = '';
  for (let k=0;k<60*12;k++){ s.step(TICK_DT,true); t+=TICK_DT; const v=s.artifact.linvel(); maxV=Math.max(maxV,Math.hypot(v.x,v.z)); const c=s.artifact.translation(); if (k%30===0) path += ` (${c.x.toFixed(1)},${c.y.toFixed(1)},${c.z.toFixed(1)})`; if (reach<0 && c.z < -152 && c.y > -2) reach=t; if (s.drops) break; }
  console.log(`fan=${fanOn} plaza@${reach.toFixed(1)}s maxV=${maxV.toFixed(1)} drops=${s.drops}\n  path:${path}`);
}
