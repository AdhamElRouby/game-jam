import assert from 'node:assert/strict';
import { Sim, initPhysics } from '../server/sim';
import { TICK_DT } from '../src/shared/constants';
await initPhysics();

// Rendering can group any number of ticks. Identical real-time input must yield the same physics state.
function run(renderHz: number) {
  const sim = new Sim({ names: ['R'], slots: [0] });
  sim.devTeleportPlayer(0, -5, 0, 6);
  let acc = 0, ticks = 0;
  for (let render = 0; render < renderHz * 2; render++) {
    acc += 1 / renderHz;
    while (acc + 1e-9 >= TICK_DT) {
      const moving = ticks >= 30 && ticks < 75;
      sim.setInput(0, 0, moving ? -1 : 0, ticks >= 80 ? 1 : 0, false, 0);
      sim.step(TICK_DT, true);
      sim.events = []; acc -= TICK_DT; ticks++;
    }
  }
  const p = sim.players[0]!, out = { ticks, position: p.body.translation(), velocity: p.body.linvel() };
  sim.free(); return out;
}
const reference = run(60);
for (const hz of [15, 30, 120, 144]) assert.deepEqual(run(hz), reference, `physics differs at ${hz} render FPS`);
console.log('PASS same walking, stopping and jump state at 15/30/60/120/144 render FPS (120 fixed ticks)');

const sim = new Sim({ names: ['R'], slots: [0] });
sim.devTeleportPlayer(0, -5, 0, 6);
for (let t = 0; t < 60; t++) {
  sim.setInput(0, 0, -1, 0, false, 0); sim.step(TICK_DT, true);
}
for (let t = 0; t < 65; t++) sim.step(TICK_DT, true); // connected transport, no further packets
const p = sim.players[0]!;
assert.equal(p.mx, 0); assert.equal(p.mz, 0);
assert.ok(Math.hypot(p.body.linvel().x, p.body.linvel().z) < .1, 'stale input kept walking');
assert.equal(p.grab, false); assert.equal(p.useHeld, false);
console.log('PASS stalled connected client stops and releases controls');
sim.free();
