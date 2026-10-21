// Client-side prediction of your own courier: your keys move it on screen at once instead of after a round trip to the
// server. The server stays the authority. Every 60 Hz input tick runs the same walking code as the server
// (src/shared/movement.ts) against the same level data (courierCollide.ts); every snapshot rewinds to the server's state
// for the newest input it applied (`ack`) and replays the inputs it hasn't seen yet. A mismatch (moving machinery, a
// bump) therefore only lives for one round trip and never accumulates; it is eased out over ~0.1 s on screen, big jumps
// (respawn, hop) cut. Riding inside the artifact, respawning and holding a rope fall back to the server's view
// ("follow"), blended so the switch never pops. ?predict=0 turns it off (A/B tests).
import * as C from '../shared/constants';
import { stepCourierFacing, stepCourierMotion, type CourierControl, type CourierEnv, type CourierMotion } from '../shared/movement';
import { BTN_SPRINT, PF_CONNECTED, PF_GROUNDED, PF_GRIP, PF_LAUNCH, PF_ONMOVER, PF_PILOT, PF_RESPAWNING, PF_TUMBLE, type PlayerSnap, type Snapshot } from '../shared/protocol';
import { net, type InputTick, type PlayerView } from '../net/net';
import { resolveCourier, solidGround, touched, type ArtPose } from './courierCollide';
import { groundAt } from './ground';

const DT = C.TICK_DT;
const HIST = 240; // 4 s of ticks
const FEET = C.PLAYER_CENTER_Y;
/** corrections ease out with this time constant (s); beyond SNAP metres they cut */
const EASE = 0.1;
const SNAP = 2.5;

interface PState extends CourierMotion {
  x: number;
  y: number;
  z: number;
  /** touching the golden object's side last tick (push "stick to the face") */
  artNx: number;
  artNz: number;
}
interface Entry {
  seq: number;
  mx: number;
  mz: number;
  sprint: boolean;
  jump: boolean;
  /** state after this tick */
  s: PState;
}

const enabled = new URLSearchParams(location.search).get('predict') !== '0';

const blank = (): PState => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, grounded: false, coyote: 0, jumpBuffer: 0, airTime: 0, yaw: Math.PI, artNx: 0, artNz: 0 });
const copy = (to: PState, from: PState) => Object.assign(to, from);

/** What the newest snapshot says about you and the world your courier moves in. */
const srv = {
  have: false,
  seq: -1,
  flags: 0,
  x: 0,
  y: 0,
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  yaw: 0,
  env: { carryX: 0, carryY: 0, carryZ: 0, driftX: 0, driftZ: 0, slip: 1, knocked: false, launched: false, gripping: false } as CourierEnv,
  art: { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, shape: 0 } as ArtPose,
  avx: 0,
  avy: 0,
  avz: 0,
  liftY: 0,
  bridge: 0,
  phase: '' as Snapshot['ph'],
  map: -1,
};

const S = {
  hist: [] as Entry[],
  cur: blank(),
  prev: blank(),
  /** nominal start time of the newest tick (performance.now ms) */
  tickAt: 0,
  lastJump: -1,
  mode: 'off' as 'off' | 'predict' | 'follow',
  /** eased-out correction (m), added to the drawn position */
  ox: 0,
  oy: 0,
  oz: 0,
  shown: { x: 0, y: 0, z: 0, ok: false },
  lastFrame: 0,
};

/** Test / overlay hooks: how big the corrections are. */
export const prediction = {
  get mode() {
    return S.mode;
  },
  lastCorrection: 0,
  corrections: 0,
  snaps: 0,
  replayed: 0,
  /** server minus predicted at the acked input: position, velocity, grounded (server, ours), ticks replayed */
  err: [] as number[],
};
(window as any).__SH_PRED = prediction;

// ------------------------------------------------------------------------------------------------ one tick
const art: ArtPose = { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, shape: 0 };
const ctl: CourierControl = { mx: 0, mz: 0, sprint: false, jumpPressed: false, canMove: false };

/** The golden object `k` ticks after the snapshot: carried on by its velocity (the server moves it meanwhile). */
function artAt(k: number): ArtPose {
  const t = Math.min(0.5, Math.max(0, k * DT));
  const a = srv.art;
  art.x = a.x + srv.avx * t;
  art.y = a.y + srv.avy * t;
  art.z = a.z + srv.avz * t;
  art.qx = a.qx;
  art.qy = a.qy;
  art.qz = a.qz;
  art.qw = a.qw;
  art.shape = a.shape;
  return art;
}

const canMove = () => srv.phase === 'playing' && net.lobby?.phase === 'playing' && (srv.flags & PF_CONNECTED) !== 0 && (srv.flags & PF_RESPAWNING) === 0;
const physicsRuns = () => srv.phase === 'playing' || srv.phase === 'countdown' || srv.phase === 'resuming';
const onMover = () => (srv.flags & PF_ONMOVER) !== 0;

/** Advance `s` by one tick of input `e`; `k` = ticks since the snapshot `s` started from. */
function simulate(s: PState, e: Entry, k: number) {
  if (!physicsRuns()) return;
  const env = srv.env;
  const a = artAt(k);
  // standing? on a moving platform the floor is where the server last had your feet, carried at its speed
  const mover = onMover() && Math.hypot(s.x - srv.x, s.z - srv.z) < 2.5;
  const moverFloor = srv.y - FEET + env.carryY * k * DT;
  let ground: boolean;
  if (mover) ground = s.y - FEET <= moverFloor + 0.08;
  else {
    ground = solidGround(s, a);
    if (!ground) {
      const g = groundAt(s.x, s.z, s.y - FEET + 0.08, srv.liftY, srv.bridge);
      ground = g !== null && s.y - FEET - g < 0.08;
    }
  }
  s.grounded = ground && s.vy < 4.5 + Math.max(0, env.carryY);
  const move = canMove();
  ctl.mx = move ? e.mx : 0;
  ctl.mz = move ? e.mz : 0;
  ctl.sprint = e.sprint;
  ctl.jumpPressed = e.jump;
  ctl.canMove = move;
  stepCourierMotion(s, ctl, env, DT);
  // pushing into the golden object's face: the server cancels most sideways slip relative to it
  if (s.artNx || s.artNz) {
    const m = Math.hypot(ctl.mx, ctl.mz);
    if (m >= 0.3) {
      const ix = ctl.mx / m;
      const iz = ctl.mz / m;
      const nx = -s.artNx;
      const nz = -s.artNz;
      if (ix * nx + iz * nz >= 0.35 && Math.abs(ix * -nz + iz * nx) < 0.45) {
        const rx = s.vx - srv.avx;
        const rz = s.vz - srv.avz;
        const rn = rx * nx + rz * nz;
        s.vx -= (rx - nx * rn) * 0.7;
        s.vz -= (rz - nz * rn) * 0.7;
      }
    }
  }
  stepCourierFacing(s, ctl.mx, ctl.mz, DT);
  // world step: gravity, then move, then collide
  s.vy += C.GRAVITY * DT;
  const sp = Math.hypot(s.vx, s.vy, s.vz);
  if (sp > 22) {
    s.vx *= 22 / sp;
    s.vy *= 22 / sp;
    s.vz *= 22 / sp;
  } else if (s.vy > 11 && !env.launched) s.vy = 11;
  s.x += s.vx * DT;
  s.y += s.vy * DT;
  s.z += s.vz * DT;
  resolveCourier(s, a);
  s.artNx = touched.art ? touched.artNx : 0;
  s.artNz = touched.art ? touched.artNz : 0;
  // floors that aren't boxes: lift deck, drawbridge, wobble bridges / platforms, or the platform you ride
  const feet = s.y - FEET;
  if (mover) {
    if (feet < moverFloor) {
      s.y = moverFloor + FEET;
      if (s.vy < env.carryY) s.vy = env.carryY;
    }
  } else {
    const g = groundAt(s.x, s.z, feet + 0.15, srv.liftY, srv.bridge);
    if (g !== null && feet < g) {
      s.y = g + FEET;
      if (s.vy < 0) s.vy = 0;
    }
  }
}

// ------------------------------------------------------------------------------------------------ live ticks
function onTick(t: InputTick) {
  if (!enabled) return;
  const jump = S.lastJump >= 0 && t.jump !== S.lastJump;
  S.lastJump = t.jump;
  if (!srv.have) return;
  const e: Entry = { seq: t.seq, mx: t.mx, mz: t.mz, sprint: (t.buttons & BTN_SPRINT) !== 0, jump, s: blank() };
  copy(S.prev, S.cur);
  simulate(S.cur, e, Math.max(0, t.seq - srv.seq));
  copy(e.s, S.cur);
  S.hist.push(e);
  if (S.hist.length > HIST) S.hist.shift();
  S.tickAt = t.at;
}

// ------------------------------------------------------------------------------------------------ snapshots
function readSnap(s: Snapshot, me: PlayerSnap) {
  srv.have = true;
  srv.seq = me[12] ?? -1;
  srv.flags = me[8];
  srv.x = me[1];
  srv.y = me[2];
  srv.z = me[3];
  srv.yaw = me[4];
  srv.vx = me[5];
  srv.vy = me[6];
  srv.vz = me[7];
  const env = srv.env;
  env.carryX = me[13] ?? 0;
  env.carryZ = me[14] ?? 0;
  env.carryY = me[15] ?? 0;
  env.slip = me[16] ?? 1;
  env.driftX = 0;
  env.driftZ = 0;
  env.knocked = (me[8] & PF_TUMBLE) !== 0;
  env.launched = (me[8] & PF_LAUNCH) !== 0;
  env.gripping = (me[8] & PF_GRIP) !== 0;
  const A = s.ar;
  const a = srv.art;
  a.x = A[0];
  a.y = A[1];
  a.z = A[2];
  a.qx = A[3];
  a.qy = A[4];
  a.qz = A[5];
  a.qw = A[6];
  a.shape = A[7];
  srv.avx = A[8];
  srv.avy = A[9];
  srv.avz = A[10];
  srv.liftY = s.w.liftY;
  srv.bridge = s.w.bridge;
  srv.phase = s.ph;
}

function fromServer(to: PState, keep: PState | null) {
  to.x = srv.x;
  to.y = srv.y;
  to.z = srv.z;
  to.vx = srv.vx;
  to.vy = srv.vy;
  to.vz = srv.vz;
  to.grounded = false;
  // the server doesn't send its jump buffer / coyote / facing: ours ran the same code on the same inputs
  to.coyote = keep ? keep.coyote : 0;
  to.jumpBuffer = keep ? keep.jumpBuffer : 0;
  to.airTime = keep ? keep.airTime : 0;
  to.yaw = keep ? keep.yaw : srv.yaw;
  to.artNx = keep ? keep.artNx : 0;
  to.artNz = keep ? keep.artNz : 0;
}

const base = blank();
const before = blank();
/** where the prediction would be drawn right now (between its last two ticks) */
function drawnAt(out: PState, now: number) {
  const a = Math.min(1, Math.max(0, (now - S.tickAt) / (DT * 1000)));
  out.x = S.prev.x + (S.cur.x - S.prev.x) * a;
  out.y = S.prev.y + (S.cur.y - S.prev.y) * a;
  out.z = S.prev.z + (S.cur.z - S.prev.z) * a;
  return out;
}
function onSnap(s: Snapshot) {
  if (!enabled) return;
  const you = net.lobby?.you ?? -1;
  const me = s.pl.find((p) => p[0] === you);
  if (!me || me[12] === undefined) {
    S.mode = 'off';
    srv.have = false;
    return;
  }
  const newMap = s.mp !== srv.map;
  srv.map = s.mp;
  readSnap(s, me);
  const follow = (srv.flags & (PF_PILOT | PF_RESPAWNING | PF_GRIP)) !== 0 || !(srv.flags & PF_CONNECTED);
  const wasPredicting = S.mode === 'predict';
  S.mode = follow ? 'follow' : 'predict';
  const now = performance.now();
  drawnAt(before, now);
  const i = S.hist.findIndex((e) => e.seq === srv.seq);
  if (follow || i < 0 || newMap) {
    // nothing to replay from: start over from the server's state
    fromServer(S.cur, i >= 0 ? S.hist[i].s : null);
    copy(S.prev, S.cur);
    // keep the inputs the server hasn't acked yet: once its ack reaches them (a round trip after the first
    // snapshot, or after a ride / respawn), prediction replays from there
    const H = S.hist;
    if (newMap || (H.length && srv.seq >= H[H.length - 1].seq)) H.length = 0;
    else if (i >= 0) H.splice(0, i);
    if (wasPredicting && !follow) settle(before, !newMap);
    return;
  }
  // The server applies one queued input per tick (server/room.ts), but a late packet makes an input last two ticks
  // and a burst after a hiccup skips one: its state is then a tick ahead of / behind ours along the same path.
  // Re-base on the tick of ours it matches best (within two of the ack) instead of calling that a correction.
  let b = i;
  let best = Infinity;
  for (let j = Math.max(0, i - 2); j <= Math.min(S.hist.length - 1, i + 2); j++) {
    const h = S.hist[j].s;
    const d = (srv.x - h.x) ** 2 + (srv.y - h.y) ** 2 + (srv.z - h.z) ** 2 + 0.0004 * ((srv.vx - h.vx) ** 2 + (srv.vy - h.vy) ** 2 + (srv.vz - h.vz) ** 2);
    if (d < best - 1e-9 || (j === i && d <= best + 1e-9)) {
      best = d;
      b = j;
    }
  }
  const at = S.hist[b].s;
  const jumped = Math.hypot(srv.x - at.x, srv.y - at.y, srv.z - at.z) > SNAP;
  prediction.err = [srv.x - at.x, srv.y - at.y, srv.z - at.z, srv.vx - at.vx, srv.vy - at.vy, srv.vz - at.vz, srv.flags & PF_GROUNDED ? 1 : 0, at.grounded ? 1 : 0, b - i];
  fromServer(base, at);
  copy(S.prev, base);
  copy(S.cur, base);
  let k = 0;
  for (let j = b + 1; j < S.hist.length; j++) {
    const e = S.hist[j];
    copy(S.prev, S.cur);
    simulate(S.cur, e, ++k);
    copy(e.s, S.cur);
  }
  S.hist.splice(0, Math.min(i, b)); // keep the acked entry (the next snapshot may ack it again)
  prediction.replayed = k;
  settle(before, !jumped && wasPredicting);
}

/** After a re-prediction: keep the drawn courier where it was and ease the difference out (or cut a big jump). */
const after = blank();
function settle(before: PState, smooth: boolean) {
  drawnAt(after, performance.now());
  const dx = before.x - after.x;
  const dy = before.y - after.y;
  const dz = before.z - after.z;
  const d = Math.hypot(dx, dy, dz);
  prediction.lastCorrection = d;
  prediction.snaps++;
  if (d > 0.01) prediction.corrections++;
  if (!smooth || d > SNAP) {
    S.ox = S.oy = S.oz = 0;
    return;
  }
  S.ox += dx;
  S.oy += dy;
  S.oz += dz;
}

// ------------------------------------------------------------------------------------------------ drawing
let drawnMode: typeof S.mode = 'off';

/**
 * Your courier for this rendered frame: the prediction (between the last two ticks, plus the eased correction), or in
 * follow mode the server's view `follow`. Switching between the two carries the drawn position over and eases the
 * difference out, so it never pops (a far jump, like a respawn, cuts).
 */
export function predictedView(now: number, follow: PlayerView | undefined): PlayerView | undefined {
  const dt = S.lastFrame ? Math.min(0.1, (now - S.lastFrame) / 1000) : 0;
  S.lastFrame = now;
  const k = Math.exp(-dt / EASE);
  S.ox *= k;
  S.oy *= k;
  S.oz *= k;
  if (!enabled || !follow) return follow;
  const P = S.prev;
  const Q = S.cur;
  const predicting = S.mode === 'predict';
  let x: number, y: number, z: number;
  if (predicting) {
    const a = Math.min(1, Math.max(0, (now - S.tickAt) / (DT * 1000)));
    x = P.x + (Q.x - P.x) * a;
    y = P.y + (Q.y - P.y) * a;
    z = P.z + (Q.z - P.z) * a;
  } else {
    x = follow.x;
    y = follow.y;
    z = follow.z;
  }
  if (S.mode !== drawnMode) {
    drawnMode = S.mode;
    const dx = S.shown.x - (x + S.ox), dy = S.shown.y - (y + S.oy), dz = S.shown.z - (z + S.oz);
    if (S.shown.ok && Math.hypot(dx, dy, dz) < SNAP) {
      S.ox += dx;
      S.oy += dy;
      S.oz += dz;
    } else S.ox = S.oy = S.oz = 0;
  }
  x += S.ox;
  y += S.oy;
  z += S.oz;
  S.shown.x = x;
  S.shown.y = y;
  S.shown.z = z;
  S.shown.ok = true;
  if (!predicting) return { ...follow, x, y, z };
  const sp = Math.hypot(Q.vx, Q.vz);
  return {
    ...follow,
    x,
    y,
    z,
    vx: Q.vx,
    vy: Q.vy,
    vz: Q.vz,
    yaw: Q.yaw,
    grounded: Q.grounded,
    moving: sp > 0.6,
    sprint: follow.sprint || (Q.grounded && sp > C.WALK_SPEED + 0.3),
  };
}

export function predictionActive() {
  return enabled && S.mode === 'predict';
}

net.onTick(onTick);
net.on('snap', onSnap);
