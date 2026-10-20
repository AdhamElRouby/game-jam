// Auto-matchmaking into exactly-3-player rooms, optional private room codes, session-token reconnects.
import type { Server, Socket } from 'socket.io';
import { Room, type Member } from './room';
import type { HelloMsg, JoinMsg } from '../src/shared/protocol';

interface Session {
  token: string;
  name: string;
  socket: Socket | null;
  roomId: string | null;
}

const clean = (s: unknown, max: number) =>
  typeof s === 'string' ? s.replace(/[^\p{L}\p{N} _\-!?.']/gu, '').trim().slice(0, max) : '';

export class Matchmaker {
  rooms = new Map<string, Room>();
  sessions = new Map<string, Session>();
  private nextId = 1;

  constructor(
    private io: Server,
    private dev: boolean,
    private log: (msg: string) => void,
  ) {}

  private session(socket: Socket): Session | null {
    const t = socket.data.token as string | undefined;
    return t ? this.sessions.get(t) ?? null : null;
  }

  private roomOf(s: Session | null): { room: Room; member: Member } | null {
    if (!s || !s.roomId) return null;
    const room = this.rooms.get(s.roomId);
    const member = room?.member(s.token);
    if (!room || !member || room.closed) return null;
    return { room, member };
  }

  hello(socket: Socket, msg: HelloMsg) {
    const token = clean(msg?.token, 64);
    if (token.length < 8) return;
    socket.data.token = token;
    let s = this.sessions.get(token);
    if (s && s.socket && s.socket.id !== socket.id) {
      s.socket.emit('notice', { text: 'This session was opened in another tab.', back: true });
      s.socket.data.token = undefined;
      s.socket.disconnect(true);
    }
    if (!s) {
      s = { token, name: clean(msg?.name, 16) || 'Courier', socket, roomId: null };
      this.sessions.set(token, s);
    }
    s.socket = socket;
    const r = this.roomOf(s);
    if (r) {
      r.room.attach(r.member, socket);
      socket.emit('resumed', { roomId: r.room.id });
    } else {
      s.roomId = null;
      socket.emit('welcome', { rooms: this.publicWaitingCount() });
    }
  }

  private publicWaitingCount() {
    let n = 0;
    for (const r of this.rooms.values()) if (r.isPublic && r.joinable()) n += r.list.length;
    return n;
  }

  join(socket: Socket, msg: JoinMsg) {
    const s = this.session(socket);
    if (!s) return;
    const existing = this.roomOf(s);
    if (existing) existing.room.remove(s.token, 'rejoin');
    s.name = clean(msg?.name, 16) || s.name || 'Courier';
    const code = clean(msg?.code, 8).toUpperCase().replace(/[^A-Z0-9]/g, '') || null;
    const solo = !!msg?.solo && this.dev;
    let room: Room | undefined;
    if (solo) {
      room = this.create(null, true);
    } else if (code) {
      room = [...this.rooms.values()].find((r) => r.code === code && !r.closed);
      if (room && !room.joinable()) {
        socket.emit('notice', { text: `Room ${code} is full or already on a delivery. Try another code!`, back: true });
        return;
      }
      if (!room) room = this.create(code, false);
    } else {
      room = [...this.rooms.values()].find((r) => r.isPublic && r.joinable());
      if (!room) room = this.create(null, false);
    }
    s.roomId = room.id;
    room.add(s.token, s.name, socket);
  }

  private create(code: string | null, solo: boolean) {
    const id = `r${this.nextId++}`;
    const room = new Room(this.io, id, code, solo, this.dev, this.log);
    this.rooms.set(id, room);
    this.log(`room ${id} created${code ? ` code=${code}` : ''}${solo ? ' (solo dev)' : ''}`);
    return room;
  }

  leave(socket: Socket) {
    const s = this.session(socket);
    const r = this.roomOf(s);
    if (r && s) {
      r.room.remove(s.token, 'left');
      s.roomId = null;
    }
  }

  disconnect(socket: Socket) {
    const s = this.session(socket);
    if (!s || s.socket?.id !== socket.id) return;
    s.socket = null;
    const r = this.roomOf(s);
    if (r) r.room.disconnected(r.member);
  }

  withMember(socket: Socket, fn: (room: Room, m: Member) => void) {
    const r = this.roomOf(this.session(socket));
    if (r && r.member.socket?.id === socket.id) fn(r.room, r.member);
  }

  step() {
    for (const [id, room] of this.rooms) {
      if (room.closed) {
        room.close();
        this.rooms.delete(id);
        for (const s of this.sessions.values()) if (s.roomId === id) s.roomId = null;
        this.log(`room ${id} closed`);
        continue;
      }
      room.step();
    }
  }

  stats() {
    return {
      rooms: this.rooms.size,
      sessions: [...this.sessions.values()].filter((s) => s.socket).length,
      playing: [...this.rooms.values()].filter((r) => r.phase === 'playing').length,
    };
  }
}
