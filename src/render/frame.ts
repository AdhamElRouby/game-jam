// One interpolated world view per rendered frame, shared by every visual component.
import { net, type FrameView } from '../net/net';
import { LEVEL } from '../shared/level';
import type { WorldSnap } from '../shared/protocol';

export const DEFAULT_WORLD: WorldSnap = {
  plate: 0,
  gate: 0,
  recv: 0,
  bridge: 0,
  lever: 0,
  liftY: LEVEL.lift.bottom,
  liftGate: 0,
  lift: 0,
  aboard: 0,
  wind: 0,
  fan: 0,
  goal: 0,
  steady: 0,
  resetVotes: 0,
};

function demoFrame(): FrameView {
  const t = performance.now() / 1000;
  const sp = LEVEL.spawn.players;
  const a = LEVEL.spawn.artifact;
  return {
    t: t * 1000,
    players: sp.map((p, i) => ({
      slot: i,
      x: p[0] * 0.8,
      y: p[1] + 0.68 + Math.max(0, Math.sin(t * 2.4 + i * 2.1)) * 0.35,
      
      z: p[2] - 2.2 + Math.sin(t * 0.7 + i) * 0.15,
      yaw: Math.sin(t * 0.5 + i * 2) * 0.5 + (i - 1) * -0.3,
      vx: 0,
      vy: 0,
      vz: 0,
      grounded: true,
      grip: false,
      moving: false,
      respawning: false,
      connected: true,
      ax: 0,
      ay: 0,
      az: 0,
    })),
    artifact: { x: a[0], y: a[1] - 0.02, z: a[2], qx: 0, qy: 0, qz: 0, qw: 1, shape: 0, vx: 0, vy: 0, vz: 0 },
    w: { ...DEFAULT_WORLD, wind: Math.sin(t * 0.8) },
    latest: {
      t: t * 1000,
      ph: 'waiting',
      el: 0,
      cp: 0,
      cd: 0,
      pl: [],
      ar: [a[0], a[1], a[2], 0, 0, 0, 1, 0, 0, 0, 0],
      w: DEFAULT_WORLD,
    },
  };
}

export const frame: { current: FrameView; live: boolean } = { current: demoFrame(), live: false };

/** Your own courier is drawn with less interpolation delay so controls feel snappier. */
const LOCAL_DELAY = 50;

export function updateFrame() {
  const f = net.frame();
  frame.live = !!f;
  frame.current = f ?? demoFrame();
  const you = net.lobby?.you ?? -1;
  if (f && you >= 0) {
    const fl = net.frame(LOCAL_DELAY);
    const mine = fl?.players.find((p) => p.slot === you);
    if (mine) frame.current.players = f.players.map((p) => (p.slot === you ? mine : p));
  }
}
