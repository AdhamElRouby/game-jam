// One 3-player room: lobby (pick a world) -> countdown -> playing <-> paused -> finished (map results + votes) -> retry / pick
// another world (or the next one when playing all six in a row).
import type { Server, Socket } from 'socket.io';
import { Sim } from './sim';
import * as C from '../src/shared/constants';
import { MAPS, mapAt } from '../src/shared/maps';
import type { GameEvent, LobbyState, Phase, Results } from '../src/shared/protocol';

export interface Member {
  token: string;
  name: string;
  slot: number;
  socket: Socket | null;
  connected: boolean;
  /** results-screen choice: 'next' | 'retry' | 'again' | 'map:<i>' */
  vote: string | null;
  /** last input sequence number accepted (reset when the socket changes: a reloaded tab restarts at 0) */
  lastSeq: number;
  /** inputs received but not applied yet: one is applied per tick, in order (see `feedInputs`) */
  queue: number[][];
  /** ticks in a row the queue still held two or more inputs after this tick's (latency it doesn't need) */
  deep: number;
}

const SNAP_EVERY = Math.round(C.TICK_HZ / C.SNAPSHOT_HZ);
const NEXT_COUNTDOWN_MS = C.RESUME_COUNTDOWN_MS + 500;
/** everyone voted but no majority: one of their picks is drawn after this long */
const TIE_MS = 5000;

export class Room {
  members: (Member | null)[];
  phase: Phase = 'waiting';
  sim: Sim | null = null;
  phaseEndsAt = 0;
  /** disconnect grace deadline while on the results screen (0 = nobody missing) */
  graceEndsAt = 0;
  /** split vote (everyone picked, no majority): when one of the picks gets drawn (0 = no tie) */
  tieEndsAt = 0;
  tick = 0;
  emptySince = 0;
  lastResults: Results | null = null;
  closed = false;
  map = 0;
  mode: 'adventure' | 'single' = 'adventure';
  history: Results[] = [];
  /** members' sockets that asked for server performance numbers (the dev overlay), sent once a second */
  private perfSubs = new Set<Socket>();
  private perf = { at: Date.now(), ticks: 0, steps: 0, stepSum: 0, stepMax: 0, snaps: 0, snapBytes: 0 };

  constructor(
    private io: Server,
    public id: string,
    public code: string | null,
    public solo: boolean,
    private dev: boolean,
    private log: (msg: string) => void,
  ) {
    this.members = new Array(this.capacity).fill(null);
  }

  get capacity() {
    return this.solo ? 1 : C.ROOM_SIZE;
  }

  get list(): Member[] {
    return this.members.filter((m): m is Member => !!m);
  }

  get isPublic() {
    return !this.code && !this.solo;
  }

  joinable() {
    return !this.closed && this.phase === 'waiting' && this.list.length < this.capacity;
  }

  member(token: string) {
    return this.list.find((m) => m.token === token) ?? null;
  }

  add(token: string, name: string, socket: Socket): Member {
    const slot = this.members.findIndex((m) => !m);
    const m: Member = { token, name, slot, socket, connected: true, vote: null, lastSeq: -1, queue: [], deep: 0 };
    this.members[slot] = m;
    socket.join(this.id);
    this.log(`room ${this.id}: ${name} joined slot ${slot} (${this.list.length}/${this.capacity})`);
    if (this.list.length === this.capacity && this.solo) {
      // dev solo room: straight into World 1
      this.mode = 'adventure';
      this.history = [];
      this.startMap(0, C.COUNTDOWN_MS);
    } else this.tally(); // a full team may already agree on a world (picks made while waiting count)
    this.io.to(this.id).emit('sfx', 'join');
    return m;
  }

  remove(token: string, why: string) {
    const m = this.member(token);
    if (!m) return;
    this.members[m.slot] = null;
    m.socket?.leave(this.id);
    this.log(`room ${this.id}: ${m.name} removed (${why})`);
    const wasActive = this.phase !== 'waiting';
    if (wasActive) {
      // run is over for this team; go back to the lobby keeping the remaining couriers together
      this.disposeSim();
      this.phase = 'waiting';
      this.graceEndsAt = 0;
      this.history = [];
      this.map = 0;
      for (const o of this.list) o.vote = null;
      const text = why === 'timeout' ? `${m.name} couldn't reconnect.` : `${m.name} left the delivery.`;
      this.io.to(this.id).emit('notice', { text, back: true });
    }
    if (this.list.length === 0) this.closed = true;
    else this.tally();
  }

  attach(m: Member, socket: Socket) {
    m.socket = socket;
    m.connected = true;
    m.lastSeq = -1;
    m.queue = [];
    m.deep = 0;
    socket.join(this.id);
    this.sim?.setConnected(m.slot, true);
    this.log(`room ${this.id}: ${m.name} reconnected`);
    if (this.phase === 'paused' && this.list.every((x) => x.connected)) {
      this.phase = 'resuming';
      this.phaseEndsAt = Date.now() + C.RESUME_COUNTDOWN_MS;
    }
    if (this.phase === 'finished' && this.list.every((x) => x.connected)) this.graceEndsAt = 0;
    this.broadcastLobby();
    if (this.sim) socket.emit('snap', this.sim.snapshot(this.phase));
    if (this.phase === 'finished' && this.lastResults) socket.emit('results', this.lastResults);
    this.tally();
  }

  disconnected(m: Member) {
    m.connected = false;
    m.socket = null;
    if (this.phase === 'waiting') {
      this.remove(m.token, 'disconnect');
      return;
    }
    this.sim?.setConnected(m.slot, false);
    if (this.phase === 'playing' || this.phase === 'resuming' || this.phase === 'countdown') {
      this.phase = 'paused';
      this.phaseEndsAt = Date.now() + C.PAUSE_TIMEOUT_MS;
      this.log(`room ${this.id}: paused, waiting for ${m.name}`);
    } else if (this.phase === 'finished' && !this.graceEndsAt) {
      // results screen: keep the team together for a while so a refresh doesn't end the adventure
      this.graceEndsAt = Date.now() + C.PAUSE_TIMEOUT_MS;
    }
    this.broadcastLobby();
  }

  private disposeSim() {
    this.sim?.free();
    this.sim = null;
  }

  /** Build a fresh world for map `index` and count down into it. */
  private startMap(index: number, ms: number) {
    this.disposeSim();
    this.map = Math.max(0, Math.min(MAPS.length - 1, index));
    const names: string[] = [];
    const slots: number[] = [];
    for (const m of this.list) {
      names[m.slot] = m.name;
      slots.push(m.slot);
      m.vote = null;
    }
    this.sim = new Sim({ names, slots, map: mapAt(this.map) });
    for (const m of this.list) if (!m.connected) this.sim.setConnected(m.slot, false);
    this.lastResults = null;
    this.graceEndsAt = 0;
    this.tieEndsAt = 0;
    this.phase = 'countdown';
    this.phaseEndsAt = Date.now() + ms;
    this.log(`room ${this.id}: ${mapAt(this.map).name} (${this.mode}) countdown (${this.list.map((m) => m.name).join(', ')})`);
    this.broadcastLobby();
    this.io.to(this.id).emit('start', { roomId: this.id, map: this.map });
  }

  lobbyFor(m: Member | null): LobbyState {
    const now = Date.now();
    const timed = ['countdown', 'resuming', 'paused'].includes(this.phase);
    return {
      roomId: this.id,
      code: this.code,
      phase: this.phase,
      you: m ? m.slot : -1,
      slots: this.members.map((x) =>
        x ? { slot: x.slot, name: x.name, connected: x.connected, you: !!m && x.token === m.token, again: x.vote !== null } : null,
      ),
      timerMs: timed ? Math.max(0, this.phaseEndsAt - now) : this.graceEndsAt ? Math.max(0, this.graceEndsAt - now) : undefined,
      tieMs: this.tieEndsAt ? Math.max(0, this.tieEndsAt - now) : undefined,
      dev: this.dev,
      map: this.map,
      mode: this.mode,
      votes: this.members.map((x) => (x ? x.vote : null)),
      history: this.history,
    };
  }

  broadcastLobby() {
    for (const m of this.list) m.socket?.emit('lobby', this.lobbyFor(m));
  }

  // ------------------------------------------------------------------ messages
  input(m: Member, data: unknown) {
    if (!this.sim || !Array.isArray(data) || data.length < 6 || data.length > 12) return;
    const [seq, mx, mz, jump, grab, resp, buttons, pilot, use, camYaw] = data as number[];
    if (![seq, mx, mz, jump, grab, resp].every((x) => typeof x === 'number' && Number.isFinite(x))) return;
    const opt = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);
    // drop duplicated / reordered packets (the counter fields make a skipped packet harmless)
    if (seq <= m.lastSeq && m.lastSeq - seq < 1e6) return;
    m.lastSeq = seq;
    m.queue.push([seq, mx, mz, jump, grab === 1 ? 1 : 0, resp, opt(buttons) ?? 0, opt(pilot) ?? NaN, opt(use) ?? NaN, opt(camYaw) ?? NaN]);
    if (m.queue.length > 30) m.queue.splice(0, m.queue.length - 30);
  }

  /**
   * Clients send one input per 60 Hz tick. Applying one per tick, in order, keeps the server's timeline the same as the
   * client's (its prediction replays from the input this tick applied, `ack`): with "newest wins", network jitter made
   * an input last two ticks or none. A burst after a hiccup is caught up (only the newest few kept: the counters make
   * skipped presses harmless); when nothing new has arrived, the last input simply holds.
   */
  private feedInputs(stepping: boolean) {
    const sim = this.sim;
    if (!sim) return;
    for (const m of this.list) {
      const q = m.queue;
      if (!q.length) continue;
      const keep = stepping ? 3 : 1;
      if (q.length > keep) q.splice(0, q.length - keep);
      // more queued than the jitter needs for a whole second: skip one to win back the latency
      m.deep = q.length >= 3 ? m.deep + 1 : 0;
      if (m.deep > 60) {
        q.shift();
        m.deep = 0;
      }
      const [seq, mx, mz, jump, grab, resp, buttons, pilot, use, camYaw] = q.shift()!;
      const opt = (x: number) => (Number.isNaN(x) ? undefined : x);
      sim.setInput(m.slot, mx, mz, jump, grab === 1, resp, buttons, opt(pilot), opt(use), opt(camYaw), seq);
    }
  }

  /** The perf overlay (F3) asks for this room's server numbers; they stop when its socket goes away. */
  perfSub(m: Member, on: boolean) {
    if (!m.socket) return;
    if (on) this.perfSubs.add(m.socket);
    else this.perfSubs.delete(m.socket);
  }

  private reportPerf(now: number) {
    const P = this.perf;
    const span = (now - P.at) / 1000;
    for (const s of this.perfSubs) if (!s.connected) this.perfSubs.delete(s);
    if (this.perfSubs.size) {
      const w = this.sim?.world;
      const msg = {
        tickHz: Math.round(P.ticks / span),
        simHz: Math.round(P.steps / span),
        stepMs: P.steps ? Math.round((P.stepSum / P.steps) * 1000) / 1000 : 0,
        stepMaxMs: Math.round(P.stepMax * 1000) / 1000,
        snapHz: Math.round(P.snaps / span),
        snapBytes: P.snaps ? Math.round(P.snapBytes / P.snaps) : 0,
        bodies: w ? w.bodies.len() : 0,
        colliders: w ? w.colliders.len() : 0,
      };
      for (const s of this.perfSubs) s.emit('perf', msg);
    }
    this.perf = { at: now, ticks: 0, steps: 0, stepSum: 0, stepMax: 0, snaps: 0, snapBytes: 0 };
  }

  shift(m: Member, shape: unknown) {
    if (!this.sim || this.phase !== 'playing' || typeof shape !== 'number') return;
    this.sim.requestShift(m.slot, shape);
  }

  /** Is `v` a valid choice right now? Lobby: any world or all six in a row. Results: also retry / next. */
  private validVote(v: string) {
    const mm = /^map:(\d+)$/.exec(v);
    if (mm) return Number(mm[1]) < MAPS.length;
    if (v === 'adventure') return true;
    if (this.phase !== 'finished') return false;
    if (v === 'retry' || v === 'again') return true;
    return v === 'next' && this.mode === 'adventure' && this.map < MAPS.length - 1;
  }

  action(m: Member, type: unknown, value?: unknown) {
    if (type === 'vote' && (this.phase === 'finished' || this.phase === 'waiting') && typeof value === 'string' && this.validVote(value)) {
      m.vote = value;
      this.tally();
    } else if (type === 'again' && this.phase === 'finished') {
      // older clients: "play again" = next map in an adventure, restart after the last one
      m.vote = this.mode === 'adventure' && this.map < MAPS.length - 1 ? 'next' : 'again';
      this.tally();
    } else if (type === 'resetVote' && this.sim && this.phase === 'playing') {
      this.sim.voteReset(m.slot);
    }
  }

  /**
   * Majority of the team (2 of 3) decides, in the lobby (full team only) and on the results screen; everyone must be
   * connected so nobody gets left behind mid-transition. A three-way split draws one of the picks after `TIE_MS`.
   * Always ends by broadcasting the lobby (directly, or through `startMap`).
   */
  private tally() {
    const deciding =
      (this.phase === 'finished' || (this.phase === 'waiting' && this.list.length === this.capacity)) && this.list.length > 0 && this.list.every((x) => x.connected);
    if (!deciding) {
      this.tieEndsAt = 0;
      this.broadcastLobby();
      return;
    }
    const counts = new Map<string, number>();
    for (const x of this.list) if (x.vote) counts.set(x.vote, (counts.get(x.vote) ?? 0) + 1);
    const need = Math.floor(this.list.length / 2) + 1;
    for (const [v, n] of counts) {
      if (n >= need) {
        this.execute(v);
        return;
      }
    }
    const allVoted = this.list.every((x) => x.vote);
    if (!allVoted) this.tieEndsAt = 0;
    else if (!this.tieEndsAt) this.tieEndsAt = Date.now() + TIE_MS;
    this.broadcastLobby();
  }

  /** Carry out the team's choice. */
  private execute(v: string) {
    const ms = this.phase === 'waiting' ? C.COUNTDOWN_MS : NEXT_COUNTDOWN_MS;
    if (v === 'next') this.startMap(this.map + 1, ms);
    else if (v === 'retry') {
      // a retried map replaces its earlier result
      this.history = this.history.filter((r) => r.map !== this.map);
      this.startMap(this.map, ms);
    } else if (v === 'again' || v === 'adventure') {
      this.mode = 'adventure';
      this.history = [];
      this.startMap(0, ms);
    } else {
      this.mode = 'single';
      this.history = [];
      this.startMap(Number(v.slice(4)), ms);
    }
  }

  devCommand(m: Member, cmd: any) {
    if (!this.dev || !cmd) return;
    if (cmd.map !== undefined && this.phase !== 'waiting') {
      this.mode = 'single';
      this.history = [];
      this.startMap(Number(cmd.map) | 0, 600);
      return;
    }
    const sim = this.sim;
    if (!sim) return;
    if (cmd.warp !== undefined) sim.devWarp(Number(cmd.warp));
    if (cmd.solve !== undefined) sim.devSolve(String(cmd.solve));
    if (cmd.shape !== undefined) sim.devSetShape(Number(cmd.shape));
    if (cmd.art) sim.devTeleportArtifact(Number(cmd.art[0]), Number(cmd.art[1]), Number(cmd.art[2]));
    if (cmd.me) sim.devTeleportPlayer(m.slot, Number(cmd.me[0]), Number(cmd.me[1]), Number(cmd.me[2]));
    if (cmd.finish) sim.finish();
  }

  // ------------------------------------------------------------------ tick
  private onFinished(sim: Sim) {
    const r = { ...sim.results! };
    this.history = [...this.history.filter((h) => h.map !== r.map), r];
    if (this.mode === 'adventure' && this.map === MAPS.length - 1) {
      const maps = this.history.length;
      r.adventure = {
        score: this.history.reduce((a, h) => a + h.score, 0),
        crowns: this.history.reduce((a, h) => a + h.crowns, 0),
        maxCrowns: MAPS.length * 3,
        timeMs: this.history.reduce((a, h) => a + h.timeMs, 0),
        maps,
      };
      this.history[this.history.length - 1] = r;
    }
    this.lastResults = r;
    this.phase = 'finished';
    this.log(`room ${this.id}: ${r.mapName} done in ${(r.timeMs / 1000).toFixed(1)}s score ${r.score} crowns ${r.crowns}`);
    this.broadcastLobby();
  }

  step() {
    if (this.closed) return;
    const now = Date.now();
    this.tick++;
    if ((this.phase === 'countdown' || this.phase === 'resuming') && now >= this.phaseEndsAt) {
      this.phase = 'playing';
      this.broadcastLobby();
    } else if (this.phase === 'paused' && now >= this.phaseEndsAt) {
      for (const m of this.list) if (!m.connected) this.remove(m.token, 'timeout');
      return;
    } else if (this.phase === 'finished' && this.graceEndsAt && now >= this.graceEndsAt) {
      for (const m of this.list) if (!m.connected) this.remove(m.token, 'timeout');
      return;
    }
    if (this.tieEndsAt && !this.list.every((x) => x.connected)) this.tieEndsAt = 0; // (the draw waits for everyone)
    if (this.tieEndsAt) {
      if (now >= this.tieEndsAt) {
        // split vote: draw one of the team's picks
        const picks = this.list.map((x) => x.vote).filter((v): v is string => !!v);
        this.tieEndsAt = 0;
        if (picks.length) this.execute(picks[Math.floor(Math.random() * picks.length)]);
        return;
      }
      if (this.tick % 30 === 0) this.broadcastLobby();
    }
    const sim = this.sim;
    if (!sim) return;
    const stepping = this.phase === 'playing' || this.phase === 'countdown' || this.phase === 'resuming';
    this.feedInputs(stepping);
    const P = this.perf;
    P.ticks++;
    if (stepping) {
      const t0 = performance.now();
      sim.step(C.TICK_DT, this.phase === 'playing');
      const ms = performance.now() - t0;
      P.steps++;
      P.stepSum += ms;
      if (ms > P.stepMax) P.stepMax = ms;
    }
    if (now - P.at >= 1000) this.reportPerf(now);
    if (sim.events.length) {
      const evs: GameEvent[] = sim.events;
      sim.events = [];
      this.io.to(this.id).emit('ev', evs);
    }
    if (sim.finished && this.phase === 'playing') this.onFinished(sim);
    if (this.tick % SNAP_EVERY === 0 && this.phase !== 'finished') {
      const snap = sim.snapshot(this.phase);
      this.io.to(this.id).emit('snap', snap);
      P.snaps++;
      if (this.perfSubs.size) P.snapBytes += JSON.stringify(snap).length;
    }
    // keep lobby timers fresh twice a second during timed phases
    if (this.tick % 30 === 0 && (this.phase === 'paused' || this.phase === 'countdown' || this.phase === 'resuming' || this.graceEndsAt)) {
      this.broadcastLobby();
    }
  }

  close() {
    this.closed = true;
    this.disposeSim();
  }
}
