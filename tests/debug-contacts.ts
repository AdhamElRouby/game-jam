import { Sim, initPhysics } from '../server/sim';
import { CLOCKWORK } from '../src/shared/maps/course';
import { TICK_DT } from '../src/shared/constants';
await initPhysics();
const s = new Sim({ names: ['A','B','C'], slots: [0,1,2], map: CLOCKWORK });
s.devWarp(1);
s.devTeleportArtifact(-0.3, 1.02, -78.5);
for (let i=0;i<3;i++) s.devTeleportPlayer(i, -0.9 + i*0.6, 0, -76.9);
for (let k=0;k<180;k++){ for (let i=0;i<3;i++) s.setInput(i,0,-1,0,false,0); s.step(TICK_DT,true); }
const c = s.artifact.translation(); console.log('art', c);
s.world.contactPairsWith(s.artCol, (o) => {
  s.world.contactPair(s.artCol, o, (m) => { if (m.numSolverContacts()) { const n = m.normal(); const p = o.translation(); console.log('contact with collider at', p.x.toFixed(2), p.y.toFixed(2), p.z.toFixed(2), 'half', JSON.stringify((o.shape as any).halfExtents ?? (o.shape as any).radius), 'normal', n.x.toFixed(2), n.y.toFixed(2), n.z.toFixed(2)); } });
});
for (const p of s.players) { const t = p!.body.translation(); console.log('player', t.x.toFixed(2), t.y.toFixed(2), t.z.toFixed(2)); }
