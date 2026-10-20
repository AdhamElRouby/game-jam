import { Sim, initPhysics } from '../server/sim';
import { TICK_DT } from '../src/shared/constants';
await initPhysics();
for (const [n, off] of [[1,0],[1,-0.7],[2,0],[3,0]] as [number,number][]) {
  const s = new Sim({ names: ['R','B','G'], slots: [0,1,2] });
  s.devTeleportArtifact(0, 1.02, 3);
  for (let i=0;i<20;i++) s.step(TICK_DT, true);
  const xs=n===1?[off]:n===2?[-0.5,0.5]:[-0.6,0,0.6];
  for (let i=0;i<3;i++) s.devTeleportPlayer(i, i<n?xs[i]:8+i*2, 0, i<n?4.6:8);
  for (let i=0;i<10;i++) s.step(TICK_DT, true);
  const z0 = s.artifact.translation().z;
  let log='';
  for (let k=0;k<150;k++){
    for (let i=0;i<n;i++) s.setInput(i,0,-1,0,false,0);
    s.step(TICK_DT,true);
    if (k%30===29){ const v=s.artifact.linvel(); log+=` ${((k+1)/60).toFixed(1)}s:v=${(-v.z).toFixed(2)}${s.players[0]!.pushing?'P':'-'}`; }
  }
  const q = s.artifact.rotation();
  console.log(`n=${n} off=${off} moved=${(z0 - s.artifact.translation().z).toFixed(2)} yawDeg=${(2*Math.asin(q.y)*57.3).toFixed(0)}`, log);
}
