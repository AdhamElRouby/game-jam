// One 3-player room: lobby -> countdown -> playing <-> paused -> finished -> (play again).
import type { Server, Socket } from 'socket.io';
import { Sim } from './sim';
import * as C from '../src/shared/constants';
import type { GameEvent, LobbyState, Phase, Results } from '../src/shared/protocol';

export interface Member {
  token: string;
  name: string;
  slot: number;
  socket: Socket | null;
  connected: boolean;
  again: boolean;
}

const SNAP_EVERY = Math.round(C.TICK_HZ / C.SNAPSHOT_HZ);

export class Room {
  members: (Member | null)[];
  phase: Phase = 'waiting';
  sim: Sim | null = null;
  phaseEndsAt = 0;
  tick = 0;
  emptySince = 0;
  lastResults: Results | null = null;
  closed = false;

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
    const m: Member = { token, name, slot, socket, connected: true, again: false };
    this.members[slot] = m;
    socket.join(this.id);
    this.log(`room ${this.id}: ${name} joined slot ${slot} (${this.list.length}/${this.capacity})`);
    if (this.list.length === this.capacity) this.startCountdown(C.COUNTDOWN_MS);
    else this.broadcastLobby();
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
      for (const o of this.list) o.again = false;
      const text = why === 'timeout' ? `${m.name} couldn't reconnect.` : `${m.name} left the delivery.`;
      this.io.to(this.id).emit('notice', { text, back: true });
    }
    if (this.list.length === 0) this.closed = true;
    else this.broadcastLobby();
  }

  attach(m: Member, socket: Socket) {
    m.socket = socket;
    m.connected = true;
    socket.join(this.id);
    this.sim?.setConnected(m.slot, true);
    this.log(`room ${this.id}: ${m.name} reconnected`);
    if (this.phase === 'paused' && this.list.every((x) => x.connected)) {
      this.phase = 'resuming';
      this.phaseEndsAt = Date.now() + C.RESUME_COUNTDOWN_MS;
    }
    this.broadcastLobby();
    if (this.sim) socket.emit('snap', this.sim.snapshot(this.phase));
    if (this.phase === 'finished' && this.lastResults) socket.emit('results', this.lastResults);
  }

  disconnected(m: Member) {
    m.connected = false;
    m.socket = null;
    if (this.phase === 'waiting') {
      this.remove(m.token, 'disconnect');
      return;
    }
    if (this.phase === 'countdown' || this.phase === 'finished') {
      this.remove(m.token, 'disconnect');
      return;
    }
    this.sim?.setConnected(m.slot, false);
    if (this.phase === 'playing' || this.phase === 'resuming') {
      this.phase = 'paused';
      this.phaseEndsAt = Date.now() + C.PAUSE_TIMEOUT_MS;
      this.log(`room ${this.id}: paused, waiting for ${m.name}`);
    }
    this.broadcastLobby();
  }

  private disposeSim() {
    this.sim?.free();
    this.sim = null;
  }

  private startCountdown(ms: number) {
    this.disposeSim();
    const names: string[] = [];
    const slots: number[] = [];
    for (const m of this.list) {
      names[m.slot] = m.name;
      slots.push(m.slot);
      m.again = false;
    }
    this.sim = new Sim({ names, slots });
    this.lastResults = null;
    this.phase = 'countdown';
    this.phaseEndsAt = Date.now() + ms;
    this.log(`room ${this.id}: countdown (${this.list.map((m) => m.name).join(', ')})`);
    this.broadcastLobby();
    this.io.to(this.id).emit('start', { roomId: this.id });
  }

  lobbyFor(m: Member | null): LobbyState {
    const now = Date.now();
    return {
      roomId: this.id,
      code: this.code,
      phase: this.phase,
      you: m ? m.slot : -1,
      slots: this.members.map((x) =>
        x ? { slot: x.slot, name: x.name, connected: x.connected, you: !!m && x.token === m.token, again: x.again } : null,
      ),
      timerMs: ['countdown', 'resuming', 'paused'].includes(this.phase) ? Math.max(0, this.phaseEndsAt - now) : undefined,
      dev: this.dev,
    };
  }

  broadcastLobby() {
    for (const m of this.list) m.socket?.emit('lobby', this.lobbyFor(m));
  }

  // ------------------------------------------------------------------ messages
  input(m: Member, data: unknown) {
    if (!this.sim || !Array.isArray(data) || data.length < 6) return;
    const [, mx, mz, jump, grab, resp] = data as number[];
    if (![mx, mz, jump, grab, resp].every((x) => typeof x === 'number' && Number.isFinite(x))) return;
    this.sim.setInput(m.slot, mx, mz, jump, grab === 1, resp);
  }

  shift(m: Member, shape: unknown) {
    if (!this.sim || this.phase !== 'playing' || typeof shape !== 'number') return;
    this.sim.requestShift(m.slot, shape);
  }

  action(m: Member, type: unknown) {
    if (type === 'again' && this.phase === 'finished') {
      m.again = true;
      if (this.list.length === this.capacity && this.list.every((x) => x.again)) {
        this.startCountdown(C.RESUME_COUNTDOWN_MS + 500);
      } else this.broadcastLobby();
    } else if (type === 'resetVote' && this.sim && this.phase === 'playing') {
      this.sim.voteReset(m.slot);
    }
  }

  devCommand(m: Member, cmd: any) {
    if (!this.dev || !this.sim || !cmd) return;
    if (cmd.warp !== undefined) this.sim.devWarp(Number(cmd.warp));
    if (cmd.shape !== undefined) this.sim.devSetShape(Number(cmd.shape));
    if (cmd.art) this.sim.devTeleportArtifact(cmd.art[0], cmd.art[1], cmd.art[2]);
    if (cmd.me) this.sim.devTeleportPlayer(m.slot, cmd.me[0], cmd.me[1], cmd.me[2]);
    if (cmd.finish) {
      (this.sim as any).finish();
    }
  }

  // ------------------------------------------------------------------ tick
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
    }
    const sim = this.sim;
    if (!sim) return;
    if (this.phase === 'playing' || this.phase === 'countdown' || this.phase === 'resuming') {
      sim.step(C.TICK_DT, this.phase === 'playing');
    }
    if (sim.events.length) {
      const evs: GameEvent[] = sim.events;
      sim.events = [];
      this.io.to(this.id).emit('ev', evs);
    }
    if (sim.finished && this.phase === 'playing') {
      this.phase = 'finished';
      this.lastResults = sim.results;
      this.log(`room ${this.id}: finished in ${(sim.results!.timeMs / 1000).toFixed(1)}s score ${sim.results!.score}`);
      this.broadcastLobby();
    }
    if (this.tick % SNAP_EVERY === 0 && this.phase !== 'finished') {
      this.io.to(this.id).emit('snap', sim.snapshot(this.phase));
    }
    // keep lobby timers fresh twice a second during timed phases
    if (this.tick % 30 === 0 && (this.phase === 'paused' || this.phase === 'countdown' || this.phase === 'resuming')) {
      this.broadcastLobby();
    }
  }

  close() {
    this.closed = true;
    this.disposeSim();
  }
}
