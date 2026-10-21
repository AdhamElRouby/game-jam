// Client networking: session token, matchmaking messages, snapshot buffer + interpolation, input upload.
import { io, type Socket } from 'socket.io-client';
import { INPUT_HZ } from '../shared/constants';
import { mapAt } from '../shared/maps';
import type { GameEvent, LobbyState, Results, Snapshot, WorldSnap } from '../shared/protocol';
import { PF_GRIP, PF_GROUNDED, PF_MOVING, PF_RESPAWNING, PF_CONNECTED, PF_PILOT, PF_TUMBLE, PF_SPRINT, PF_USE, PF_ONMOVER } from '../shared/protocol';
import { input } from './input';

export const INTERP_DELAY = 85; // ms behind newest server state
const MAX_SNAPS = 90;

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
  lobby: LobbyState | null = null;
  connected = false;
  name = '';
  private seq = 0;
  private inputTimer: number | null = null;
  rtt = 0;
  lastSnapAt = 0;
  private arrivals: number[] = [];
  private underruns = 0;
  private frames = 0;
  private jitter = 0;
  get interpolationDelay() { return Math.max(INTERP_DELAY, Math.min(180, 40 + this.jitter * 3)); }
  private sentJumps: { seq: number; jump: number }[] = [];
  pendingJump(jump: number) {
    const slot = this.lobby?.you ?? -1, ack = this.latest()?.ack?.[slot];
    if (ack === undefined) return false;
    const accepted = this.sentJumps.find(i => i.seq === ack);
    return !!accepted && jump > accepted.jump;
  }
  // Snapshots and input are superseding state. Never replay a backlog after congestion/reconnect.
  diagnostics() { return { rtt: this.rtt, interpolationDelay: this.interpolationDelay, snapshotIntervals: this.arrivals.slice(), underruns: this.underruns, frames: this.frames }; }

  constructor() {
    this.socket = io({ transports: ['websocket', 'polling'], reconnectionDelay: 500, reconnectionDelayMax: 3000 });
    this.socket.on('connect', () => {
      this.connected = true;
      this.socket.emit('hello', { token: this.token, name: this.name });
      this.connListeners.forEach((f) => f(true));
    });
    this.socket.on('disconnect', () => {
      this.connected = false;
      this.sentJumps = [];
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
    input.onChange(() => this.sendInput());
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

  on(type: 'ev', f: Listener<GameEvent>): () => void;
  on(type: 'lobby', f: Listener<LobbyState>): () => void;
  on(type: 'notice', f: Listener<{ text: string; back?: boolean }>): () => void;
  on(type: 'sfx', f: Listener<string>): () => void;
  on(type: 'results', f: Listener<Results>): () => void;
  on(type: 'conn', f: Listener<boolean>): () => void;
  on(type: string, f: Listener<any>) {
    const set =
      type === 'ev'
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
  private startInput() {
    if (this.inputTimer !== null) return;
    this.inputTimer = window.setInterval(() => this.sendInput(), 1000 / INPUT_HZ);
  }

  private sendInput() {
    if (!this.connected || !this.lobby || this.lobby.you < 0) return;
    const i = input.sample();
    const seq = this.seq++;
    this.sentJumps.push({ seq, jump: i.jump });
    if (this.sentJumps.length > 180) this.sentJumps.shift();
    this.socket.volatile.emit('in', [seq, i.mx, i.mz, i.jump, i.grab ? 1 : 0, i.respawn, i.buttons, i.pilot, i.use, Math.round(i.camYaw * 1000) / 1000]);
  }

  // ---------------------------------------------------------------- snapshots
  resetBuffer() {
    this.snaps = [];
    this.offset = null;
    this.lastSnapAt = 0;
    this.jitter = 0;
  }

  private onSnap(s: Snapshot) {
    const last = this.snaps[this.snaps.length - 1];
    if (last && (s.mp !== last.mp || s.t < last.t - 1000)) this.resetBuffer(); // new round
    else if (last && s.t <= last.t) return;
    this.snaps.push(s);
    const now = performance.now();
    if (this.lastSnapAt) {
      this.arrivals.push(now - this.lastSnapAt);
      if (last) this.jitter += (Math.min(250, Math.abs(now - this.lastSnapAt - (s.t - last.t))) - this.jitter) * .1;
      if (this.arrivals.length > 300) this.arrivals.shift();
    }
    this.lastSnapAt = now;
    if (this.snaps.length > MAX_SNAPS) this.snaps.shift();
    const sample = s.t - performance.now();
    if (this.offset === null || Math.abs(sample - this.offset) > 250) this.offset = sample;
    else if (sample > this.offset) this.offset += (sample - this.offset) * 0.2;
    else this.offset += (sample - this.offset) * 0.02;
  }

  latest(): Snapshot | null {
    return this.snaps[this.snaps.length - 1] ?? null;
  }

  /** Interpolated view of the world at render time. */
  frame(delay = this.interpolationDelay): FrameView | null {
    const n = this.snaps.length;
    if (!n || this.offset === null) return null;
    const rt = performance.now() + this.offset - delay;
    if (delay > 0) { this.frames++; if (rt > this.snaps[n - 1].t) this.underruns++; }
    const S = this.snaps;
    let a = S[0];
    let b = S[0];
    if (rt <= S[0].t) {
      a = b = S[0];
    } else if (rt >= S[n - 1].t) {
      a = b = S[n - 1];
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
        x: LL(pa[1], pb[1]),
        y: LL(pa[2], pb[2]),
        z: LL(pa[3], pb[3]),
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
      x: A[0] + (B[0] - A[0]) * ka,
      y: A[1] + (B[1] - A[1]) * ka,
      z: A[2] + (B[2] - A[2]) * ka,
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
