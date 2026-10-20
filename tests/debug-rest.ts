import { Sim, initPhysics } from '../server/sim';
import { TICK_DT } from '../src/shared/constants';
await initPhysics();
const s = new Sim({ names: ['R','B','G'], slots: [] });
const pr = (tag: string) => { const t = s.artifact.translation(); console.log(tag, t.x.toFixed(3), t.y.toFixed(3), t.z.toFixed(3), 'grounded', s.artGrounded); };
for (let k=0;k<5;k++){ for (let i=0;i<30;i++) s.step(TICK_DT, true); pr('cube t='+((k+1)*0.5)); }
// on a bridge box
s.devTeleportArtifact(0, 1.2, -15.5);
for (let k=0;k<4;k++){ for (let i=0;i<30;i++) s.step(TICK_DT, true); pr('cube bridge'); }
