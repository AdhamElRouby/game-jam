// Headless matchmaking + sync test. Usage: npx tsx tests/net-test.ts [url]
import { io, type Socket } from 'socket.io-client';
import type { LobbyState, Snapshot } from '../src/shared/protocol';

const URL = process.argv[2] ?? 'http://localhost:3000';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Bot {
  name: string;
  s: Socket;
  lobby: LobbyState | null;
  snaps: Snapshot[];
  events: any[];
}

function bot(name: string): Promise<Bot> {
  return new Promise((resolve) => {
    const s = io(URL, { transports: ['websocket'] });
    const b: Bot = { name, s, lobby: null, snaps: [], events: [] };
    s.on('connect', () => {
      s.emit('hello', { token: 'tok-' + name + '-' + Math.random().toString(36).slice(2), name });
    });
    s.on('welcome', () => resolve(b));
    s.on('lobby', (l: LobbyState) => (b.lobby = l));
    s.on('snap', (sn: Snapshot) => {
      b.snaps.push(sn);
      if (b.snaps.length > 400) b.snaps.shift();
    });
    s.on('ev', (evs: any[]) => b.events.push(...evs));
  });
}

let fails = 0;
const check = (n: string, ok: boolean, info = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${info}`);
  if (!ok) fails++;
};

const bots = await Promise.all(['Ada', 'Bo', 'Cy', 'Dee'].map(bot));
for (const b of bots.slice(0, 3)) {
  b.s.emit('queue:join', { name: b.name });
  await sleep(150);
}
await sleep(400);
bots[3].s.emit('queue:join', { name: bots[3].name });
await sleep(500);
const rid = bots[0].lobby?.roomId;
check('first three share one room', bots.slice(0, 3).every((b) => b.lobby?.roomId === rid), bots.map((b) => b.lobby?.roomId).join(','));
check('fourth gets a different room', bots[3].lobby?.roomId !== rid, `${bots[3].lobby?.roomId} phase=${bots[3].lobby?.phase}`);
check('countdown started', bots[0].lobby?.phase === 'countdown', bots[0].lobby?.phase);
check('slots distinct', new Set(bots.slice(0, 3).map((b) => b.lobby?.you)).size === 3);
await sleep(5600);
check('playing after countdown', bots[0].lobby?.phase === 'playing', bots[0].lobby?.phase);

// everyone walks toward the artifact (spawn z~6.5 -> artifact z 2.5) and pushes for 2.5s
let seq = 0;
const t0 = Date.now();
while (Date.now() - t0 < 3000) {
  for (const b of bots.slice(0, 3)) b.s.emit('in', [seq++, 0, -1, 0, 0, 0]);
  await sleep(33);
}
for (const b of bots.slice(0, 3)) b.s.emit('in', [seq++, 0, 0, 0, 0, 0]);
// shift to LONG by Ada
bots[1].s.emit('shift', 1);
await sleep(800);
const last = bots.map((b) => b.snaps[b.snaps.length - 1]);
// compare snapshots with identical sim time across the three clients
const t = Math.min(...last.slice(0, 3).map((s) => s.t));
const same = bots.slice(0, 3).map((b) => b.snaps.find((s) => s.t === t));
check('all clients got the same tick', same.every(Boolean));
const ar = same.map((s) => s!.ar);
const eq = ar.every((a) => JSON.stringify(a) === JSON.stringify(ar[0]));
check('artifact state identical across clients', eq, JSON.stringify(ar[0]));
check('artifact moved by pushing', ar[0][2] < 1.5, `z=${ar[0][2]}`);
check('shift to LONG visible to all', ar.every((a) => a[7] === 1), ar.map((a) => a[7]).join(','));
console.log('  events:', JSON.stringify(bots[0].events.filter((e) => e.k.startsWith('shift'))));
check('shift event delivered to all', bots.slice(0, 3).every((b) => b.events.some((e) => e.k === 'shift' && e.shape === 1)));
check('fourth bot did not receive room snapshots', !bots[3].snaps.length || bots[3].snaps.every((s) => s.ph !== 'playing'));

// disconnect + reconnect pause
bots[2].s.disconnect();
await sleep(700);
check('room paused on disconnect', bots[0].lobby?.phase === 'paused', bots[0].lobby?.phase);
console.log(fails ? `\n${fails} FAILURES` : '\nALL NET CHECKS PASSED');
for (const b of bots) b.s.disconnect();
process.exit(fails ? 1 : 0);
