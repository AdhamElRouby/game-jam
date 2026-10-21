// Client networking: session token, matchmaking messages, snapshot buffer + interpolation, input upload.
import { io, type Socket } from 'socket.io-client';
import { SNAPSHOT_HZ, TICK_HZ } from '../shared/constants';
import { mapAt } from '../shared/maps';
import type { GameEvent, LobbyState, Results, Snapshot, WorldSnap } from '../shared/protocol';
import { PF_GRIP, PF_GROUNDED, PF_MOVING, PF_RESPAWNING, PF_CONNECTED, PF_PILOT, PF_TUMBLE, PF_SPRINT, PF_USE, PF_ONMOVER } from '../shared/protocol';
import { input } from './input';

/** starting interpolation delay (ms behind the newest server state); it then adapts to the measured jitter */
export const INTERP_DELAY = 85;
const MAX_SNAPS = 90;
/** input ticks: the same 60 Hz as the server, one input packet per tick (the prediction steps on these) */
export const TICK_MS = 1000 / TICK_HZ;
const SNAP_MS = 1000 / SNAPSHOT_HZ;
/** when the next snapshot is late, carry things on along their velocity for at most this long (ms), then hold */
const EXTRAPOLATE_MS = 60;

/** One input tick as sent to the server. `at` = its nominal start (performance.now ms). */
export interface InputTick {
  seq: number;
  at: number;
  mx: number;
  mz: number;
  jump: number;
  grab: boolean;
  respawn: number;
  buttons: number;
  pilot: number;
  use: number;
  camYaw: number;
}

export interface PlayerView {
  slot: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  vx: number;
  vy: number;
  vz: number;
  grounded: boolean;
  grip: boolean;
  moving: boolean;
  respawning: boolean;
  connected: boolean;
  /** riding inside the artifact (x/y/z are the artifact centre) */
  pilot: boolean;
  tumble: boolean;
  sprint: boolean;
  use: boolean;
  onMover: boolean;
  ax: number;
  ay: number;
  az: number;
}

export interface ArtifactView {
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  shape: number;
  vx: number;
  vy: number;
  vz: number;
}

export interface FrameView {
  t: number;
  players: PlayerView[];
  artifact: ArtifactView;
  w: WorldSnap;
  latest: Snapshot;
  /** slot of the courier inside the artifact, -1 if empty */
  pilot: number;
  /** interpolated mechanism states (same layout as Snapshot.m) */
  m: number[][];
}

type Listener<T> = (v: T) => void;

function token(): string {
  const k = 'sh_token';
  let t = sessionStorage.getItem(k);
  if (!t) {
    t = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, '');
    sessionStorage.setItem(k, t);
  }
  return t;
}

class Net {
  socket: Socket;
  token = token();
  snaps: Snapshot[] = [];
  private offset: number | null = null;
  private evListeners = new Set<Listener<GameEvent>>();
  private lobbyListeners = new Set<Listener<LobbyState>>();
  private noticeListeners = new Set<Listener<{ text: string; back?: boolean }>>();
  private sfxListeners = new Set<Listener<string>>();
  private resultsListeners = new Set<Listener<Results>>();
  private connListeners = new Set<Listener<boolean>>();
  private snapListeners = new Set<Listener<Snapshot>>();
  private tickListeners = new Set<Listener<InputTick>>();
  private nextTick = 0;
  /** how late snapshots arrive compared with the fastest one recently (ms), newest last */
  private late: number[] = [];
  /** p95 of `late`: the network + server jitter the interpolation has to absorb */
  jitter = 0;
  /** interpolation delay for other couriers / the world, and for things of your own that aren't predicted (ms) */
  remoteDelay = INTERP_DELAY;
  localDelay = 50;
  /** snapshots that arrived per second (overlay) */
  snapRate = 0;
  private snapCount = 0;
  private snapCountAt = 0;
  lobby: LobbyState | null = null;
  connected = false;
  name = '';
  private seq = 0;
  private inputTimer: number | null = null;
  rtt = 0;
  /** server numbers for the perf overlay (only while it is open) */
  serverPerf: { tickHz: number; simHz: number; stepMs: number; stepMaxMs: number; snapHz: number; snapBytes: number; bodies: number; colliders: number } | null = null;
  private perfOn = false;

  constructor() {
    this.socket = io({ transports: ['websocket', 'polling'], reconnectionDelay: 500, reconnectionDelayMax: 3000 });
    this.socket.on('connect', () => {
      this.connected = true;
      this.socket.emit('hello', { token: this.token, name: this.name });
      if (this.perfOn) this.socket.emit('perf:sub', true);
      this.connListeners.forEach((f) => f(true));
    });
    this.socket.on('disconnect', () => {
      this.connected = false;
      this.connListeners.forEach((f) => f(false));
    });
    this.socket.on('lobby', (l: LobbyState) => {
      this.lobby = l;
      this.lobbyListeners.forEach((f) => f(l));
    });
    this.socket.on('snap', (s: Snapshot) => this.onSnap(s));
    this.socket.on('ev', (evs: GameEvent[]) => {
      for (const e of evs) this.evListeners.forEach((f) => f(e));
    });
    this.socket.on('notice', (n) => this.noticeListeners.forEach((f) => f(n)));
    this.socket.on('sfx', (n: string) => this.sfxListeners.forEach((f) => f(n)));
    this.socket.on('results', (r: Results) => this.resultsListeners.forEach((f) => f(r)));
    this.socket.on('start', () => this.resetBuffer());
    this.socket.on('perf', (p) => (this.serverPerf = p));
    setInterval(() => {
      const t0 = performance.now();
      if (this.connected) this.socket.emit('ping:t', 0, () => (this.rtt = this.rtt * 0.7 + (performance.now() - t0) * 0.3));
    }, 2000);
  }

  // ---------------------------------------------------------------- matchmaking
  join(name: string, code?: string, solo?: boolean) {
    this.name = name;
    this.resetBuffer();
    this.socket.emit('queue:join', { name, code: code || undefined, solo: !!solo });
    this.startInput();
  }
  leave() {
    this.socket.emit('queue:leave');
    this.lobby = null;
    this.resetBuffer();
  }
  shift(shape: number) {
    if (!this.connected) return;
    this.socket.emit('shift', shape);
  }
  action(type: 'respawn' | 'resetVote' | 'again' | 'leave' | 'vote', value?: string) {
    if (!this.connected) return;
    this.socket.emit('act', { type, value });
  }
  dev(cmd: Record<string, unknown>) {
    this.socket.emit('dev', cmd);
  }
  /** perf overlay open: ask the server for its tick / physics numbers once a second */
  subscribePerf(on: boolean) {
    this.perfOn = on;
    if (!on) this.serverPerf = null;
    this.socket.emit('perf:sub', on);
  }

  on(type: 'ev', f: Listener<GameEvent>): () => void;
  on(type: 'lobby', f: Listener<LobbyState>): () => void;
  on(type: 'notice', f: Listener<{ text: string; back?: boolean }>): () => void;
  on(type: 'sfx', f: Listener<string>): () => void;
  on(type: 'results', f: Listener<Results>): () => void;
  on(type: 'conn', f: Listener<boolean>): () => void;
  on(type: 'snap', f: Listener<Snapshot>): () => void;
  on(type: string, f: Listener<any>) {
    const set =
      type === 'snap'
        ? this.snapListeners
        : type === 'ev'
        ? this.evListeners
        : type === 'lobby'
          ? this.lobbyListeners
          : type === 'notice'
            ? this.noticeListeners
            : type === 'sfx'
              ? this.sfxListeners
              : type === 'results'
                ? this.resultsListeners
                : this.connListeners;
    set.add(f);
    return () => set.delete(f);
  }

  // ---------------------------------------------------------------- input upload
  /** Called for every input tick (the prediction of your own courier steps on these). */
  onTick(f: Listener<InputTick>) {
    this.tickListeners.add(f);
    return () => this.tickListeners.delete(f);
  }

  private startInput() {
    if (this.inputTimer !== null) return;
    this.nextTick = performance.now();
    // a timer keeps inputs flowing at 60 Hz whatever the frame rate; each rendered frame also pumps (see frame.ts)
    this.inputTimer = window.setInterval(() => this.pump(), 5);
  }

  /** Run every input tick that is due: sample the keys, send them, let the prediction step. */
  pump(now = performance.now()) {
    if (this.inputTimer === null) return;
    // a hidden tab or a long stall: don't replay a backlog of ticks
    if (now - this.nextTick > 250) this.nextTick = now - TICK_MS;
    let n = 0;
    while (now >= this.nextTick && n++ < 8) {
      const at = this.nextTick;
      this.nextTick += TICK_MS;
      if (!this.connected || !this.lobby || this.lobby.you < 0) continue;
      const i = input.sample();
      const t: InputTick = { seq: this.seq++, at, ...i };
      this.socket.emit('in', [t.seq, i.mx, i.mz, i.jump, i.grab ? 1 : 0, i.respawn, i.buttons, i.pilot, i.use, Math.round(i.camYaw * 1000) / 1000]);
      this.tickListeners.forEach((f) => f(t));
    }
  }

  // ---------------------------------------------------------------- snapshots
  resetBuffer() {
    this.snaps = [];
    this.offset = null;
  }

  private onSnap(s: Snapshot) {
    const last = this.snaps[this.snaps.length - 1];
    if (last && (s.mp !== last.mp || s.t < last.t - 1000)) this.resetBuffer(); // new round
    else if (last && s.t <= last.t) return;
    this.snaps.push(s);
    if (this.snaps.length > MAX_SNAPS) this.snaps.shift();
    const now = performance.now();
    const sample = s.t - now;
    if (this.offset === null || Math.abs(sample - this.offset) > 250) this.offset = sample;
    else if (sample > this.offset) this.offset += (sample - this.offset) * 0.2;
    else this.offset += (sample - this.offset) * 0.02;
    this.adaptDelay(Math.max(0, this.offset - sample));
    this.snapCount++;
    if (now - this.snapCountAt >= 1000) {
      this.snapRate = (this.snapCount * 1000) / (now - this.snapCountAt);
      this.snapCount = 0;
      this.snapCountAt = now;
    }
    this.snapListeners.forEach((f) => f(s));
  }

  /**
   * Interpolation delay = one snapshot interval + the recent p95 lateness + a margin: as short as the network allows,
   * so other couriers and the world are shown as fresh as possible without running out of snapshots. It grows at once
   * when the network gets worse and shrinks slowly (a ~5% slower playback) so nothing visibly jumps.
   */
  private adaptDelay(late: number) {
    const L = this.late;
    L.push(late);
    if (L.length > 90) L.shift();
    if (L.length < 10) return;
    const sorted = [...L].sort((a, b) => a - b);
    this.jitter = sorted[Math.floor(sorted.length * 0.95)];
    const remote = Math.min(250, Math.max(55, SNAP_MS + this.jitter + 12));
    const local = Math.min(220, Math.max(38, SNAP_MS + this.jitter + 4));
    const ease = (cur: number, want: number) => (want > cur ? Math.min(want, cur + 8) : Math.max(want, cur - 1.6));
    this.remoteDelay = ease(this.remoteDelay, remote);
    this.localDelay = ease(this.localDelay, local);
  }

  latest(): Snapshot | null {
    return this.snaps[this.snaps.length - 1] ?? null;
  }

  /** Test hook: is your own courier's render time past the newest snapshot right now (frozen on it)? */
  localStarved(delay = this.localDelay): boolean | null {
    const L = this.latest();
    if (!L || this.offset === null) return null;
    return performance.now() + this.offset - delay > L.t;
  }

  /** Interpolated view of the world at render time. */
  frame(delay = INTERP_DELAY): FrameView | null {
    const n = this.snaps.length;
    if (!n || this.offset === null) return null;
    const rt = performance.now() + this.offset - delay;
    const S = this.snaps;
    let a = S[0];
    let b = S[0];
    /** past the newest snapshot (it's late): seconds to carry positions on along their velocities */
    let ext = 0;
    if (rt <= S[0].t) {
      a = b = S[0];
    } else if (rt >= S[n - 1].t) {
      a = b = S[n - 1];
      ext = Math.min(EXTRAPOLATE_MS, rt - S[n - 1].t) / 1000;
    } else {
      for (let i = n - 1; i > 0; i--) {
        if (S[i - 1].t <= rt) {
          a = S[i - 1];
          b = S[i];
          break;
        }
      }
    }
    const span = b.t - a.t;
    const k = span > 0 ? Math.min(1, Math.max(0, (rt - a.t) / span)) : 0;
    const L = (x: number, y: number) => x + (y - x) * k;
    const players: PlayerView[] = [];
    for (const pb of b.pl) {
      const pa = a.pl.find((p) => p[0] === pb[0]) ?? pb;
      let dy = pb[4] - pa[4];
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      const teleport = Math.hypot(pb[1] - pa[1], pb[2] - pa[2], pb[3] - pa[3]) > 4;
      const kk = teleport ? 1 : k;
      const LL = (x: number, y: number) => x + (y - x) * kk;
      const f = k < 0.5 ? pa[8] : pb[8];
      const grip = (f & PF_GRIP) !== 0;
      players.push({
        slot: pb[0],
        x: LL(pa[1], pb[1]) + pb[5] * ext,
        y: LL(pa[2], pb[2]) + (pb[8] & PF_GROUNDED ? 0 : pb[6] * ext),
        z: LL(pa[3], pb[3]) + pb[7] * ext,
        yaw: pa[4] + dy * kk,
        vx: L(pa[5], pb[5]),
        vy: L(pa[6], pb[6]),
        vz: L(pa[7], pb[7]),
        grounded: (f & PF_GROUNDED) !== 0,
        grip,
        moving: (f & PF_MOVING) !== 0,
        respawning: (f & PF_RESPAWNING) !== 0,
        connected: (f & PF_CONNECTED) !== 0,
        pilot: (pb[8] & PF_PILOT) !== 0,
        tumble: (f & PF_TUMBLE) !== 0,
        sprint: (f & PF_SPRINT) !== 0,
        use: (f & PF_USE) !== 0,
        onMover: (f & PF_ONMOVER) !== 0,
        ax: grip ? (pa[8] & PF_GRIP ? L(pa[9], pb[9]) : pb[9]) : 0,
        ay: grip ? (pa[8] & PF_GRIP ? L(pa[10], pb[10]) : pb[10]) : 0,
        az: grip ? (pa[8] & PF_GRIP ? L(pa[11], pb[11]) : pb[11]) : 0,
      });
    }
    const A = a.ar;
    const B = b.ar;
    const shapeChanged = A[7] !== B[7];
    const kA = shapeChanged ? (k < 1 ? 0 : 1) : k;
    const jump = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]) > 4;
    const ka = jump ? 1 : kA;
    // quaternion nlerp (shortest path)
    let bx = B[3], by = B[4], bz = B[5], bw = B[6];
    if (A[3] * bx + A[4] * by + A[5] * bz + A[6] * bw < 0) {
      bx = -bx; by = -by; bz = -bz; bw = -bw;
    }
    let qx = A[3] + (bx - A[3]) * ka, qy = A[4] + (by - A[4]) * ka, qz = A[5] + (bz - A[5]) * ka, qw = A[6] + (bw - A[6]) * ka;
    const ql = Math.hypot(qx, qy, qz, qw) || 1;
    qx /= ql; qy /= ql; qz /= ql; qw /= ql;
    const artifact: ArtifactView = {
      x: A[0] + (B[0] - A[0]) * ka + B[8] * ext,
      y: A[1] + (B[1] - A[1]) * ka + B[9] * ext,
      z: A[2] + (B[2] - A[2]) * ka + B[10] * ext,
      qx,
      qy,
      qz,
      qw,
      shape: ka >= 1 ? B[7] : A[7],
      vx: L(A[8], B[8]),
      vy: L(A[9], B[9]),
      vz: L(A[10], B[10]),
    };
    const wa = a.w;
    const wb = b.w;
    const w: WorldSnap = {
      ...wb,
      plate: L(wa.plate, wb.plate),
      gate: L(wa.gate, wb.gate),
      recv: L(wa.recv, wb.recv),
      bridge: L(wa.bridge, wb.bridge),
      lever: L(wa.lever, wb.lever),
      liftY: L(wa.liftY, wb.liftY),
      liftGate: L(wa.liftGate, wb.liftGate),
      wind: L(wa.wind, wb.wind),
      fan: L(wa.fan, wb.fan),
      goal: L(wa.goal, wb.goal),
    };
    const ma = a.m ?? [];
    const sameMap = a.mp === b.mp;
    const definitions = mapAt(b.mp).mechs;
    const m = (b.m ?? []).map((sb, i) => {
      const sa = ma[i];
      if (!sameMap || !sa || sa.length !== sb.length) return sb;
      return sb.map((v, j) => {
        let delta = v - sa[j];
        // a rotor's angle wraps: take the short way round
        if (j === 0 && definitions[i]?.kind === 'rotor') delta = Math.atan2(Math.sin(delta), Math.cos(delta));
        return sa[j] + delta * k;
      });
    });
    return { t: a.t + (b.t - a.t) * k, players, artifact, w, latest: S[n - 1], pilot: b.pi ?? -1, m };
  }
}

export const net = new Net();
// expose for automated browser tests
(window as any).__SH_NET = net;
