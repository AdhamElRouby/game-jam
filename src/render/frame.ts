// One interpolated world view per rendered frame, shared by every visual component.
import { net, type FrameView } from '../net/net';
import { predictedView, predictionActive } from './predict';
import { separateFromArtifact } from './courierCollide';
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
      pilot: false,
      tumble: false,
      sprint: false,
      use: false,
      onMover: false,
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
      pi: -1,
      pa: 0,
      mp: 0,
      m: [],
      ob: 0,
    },
    pilot: -1,
    m: [],
  };
}

export const frame: { current: FrameView; live: boolean } = { current: demoFrame(), live: false };

/**
 * The frame's world view: everything interpolated `net.remoteDelay` behind the server (adapts to the network), your own
 * courier predicted (predict.ts: your keys move it at once), and while you pilot the artifact, the artifact with the
 * short `net.localDelay` (the first-person view rides it).
 */
export function updateFrame() {
  const now = performance.now();
  net.pump(now); // input ticks due by now (the prediction steps on them) before this frame is drawn
  const f = net.frame(net.remoteDelay);
  frame.live = !!f;
  frame.current = f ?? demoFrame();
  const you = net.lobby?.you ?? -1;
  if (f && you >= 0) {
    const fl = net.frame(net.localDelay);
    const server = fl?.players.find((p) => p.slot === you);
    const mine = predictedView(now, server);
    if (mine) {
      // never drawn inside the (interpolated) golden object you are pushing
      if (predictionActive()) separateFromArtifact(mine, f.artifact);
      frame.current.players = f.players.map((p) => (p.slot === you ? mine : p));
    }
    // moving supports share the artifact's timeline while you pilot it, so it never sinks into or floats above them
    if (fl && mine?.pilot) {
      frame.current.artifact = fl.artifact;
      frame.current.m = fl.m;
      frame.current.w = fl.w;
    }
  }
}
(window as any).__SH_FRAME = frame;
