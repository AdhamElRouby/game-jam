// Socket-level multiplayer checks for the expansion: lobby world pick (majority, split-vote draw), pilot sync,
// duplicated / reordered input packets, results votes, identical mechanism state, disconnect during results.
// Needs the DEV server. npx tsx tests/net-test2.ts [url]
import { io, type Socket } from 'socket.io-client';
import type { LobbyState, Snapshot } from '../src/shared/protocol';

const URL = process.argv[2] ?? 'http://127.0.0.1:3000';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (n: string, ok: boolean, info = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${info}`);
  if (!ok) fails++;
};

interface Bot {
  name: string;
  token: string;
  s: Socket;
  lobby: LobbyState | null;
  snaps: Snapshot[];
  events: any[];
  seq: number;
  pilot: number;
}
function bot(name: string, token = 'tok2-' + name + '-' + Math.random().toString(36).slice(2)): Promise<Bot> {
  return new Promise((resolve) => {
    const s = io(URL, { transports: ['websocket'], forceNew: true });
    const b: Bot = { name, token, s, lobby: null, snaps: [], events: [], seq: 0, pilot: 0 };
    s.on('connect', () => s.emit('hello', { token, name }));
    s.on('welcome', () => resolve(b));
    s.on('resumed', () => resolve(b));
    s.on('lobby', (l: LobbyState) => (b.lobby = l));
    s.on('snap', (sn: Snapshot) => {
      b.snaps.push(sn);
      if (b.snaps.length > 300) b.snaps.shift();
    });
    s.on('ev', (evs: any[]) => b.events.push(...evs));
  });
}
const send = (b: Bot, mx: number, mz: number, extra: Partial<{ pilot: number; seq: number }> = {}) =>
  b.s.emit('in', [extra.seq ?? b.seq++, mx, mz, 0, 0, 0, 0, extra.pilot ?? b.pilot, 0]);
const last = (b: Bot) => b.snaps[b.snaps.length - 1];
/** latest snapshot time (optionally of map `mp`) that every client has received */
const commonT = (mp?: number) => {
  const sets = bots.map((b) => new Set(b.snaps.filter((s) => mp === undefined || s.mp === mp).map((s) => s.t)));
  return Math.max(-1, ...[...sets[0]].filter((t) => sets.every((x) => x.has(t))));
};

const vote = (b: Bot, v: string) => b.s.emit('act', { type: 'vote', value: v });

// ---- lobby: a split vote (one pick each) draws one of the three picks
{
  const trio = await Promise.all(['Xi', 'Yo', 'Zed'].map((n) => bot(n)));
  const code = 'NS' + Math.floor(Math.random() * 9000 + 1000);
  for (const b of trio) {
    b.s.emit('queue:join', { name: b.name, code });
    await sleep(120);
  }
  await sleep(300);
  trio.forEach((b, i) => vote(b, `map:${i + 1}`));
  await sleep(600);
  check('split lobby vote announces a draw', trio[0].lobby?.phase === 'waiting' && (trio[0].lobby?.tieMs ?? 0) > 3000, `phase=${trio[0].lobby?.phase} tieMs=${trio[0].lobby?.tieMs}`);
  await sleep(5000);
  const l = trio[0].lobby;
  check('the draw starts one of the picked worlds', l?.phase === 'countdown' && [1, 2, 3].includes(l.map) && l.mode === 'single', `${l?.phase} map=${l?.map}`);
  for (const b of trio) b.s.disconnect();
}

// ---- lobby: picks made while waiting count once the team is complete; one pick waits, two start
const bots = await Promise.all(['Ada', 'Bo', 'Cy'].map((n) => bot(n)));
const code = 'NT' + Math.floor(Math.random() * 9000 + 1000);
bots[0].s.emit('queue:join', { name: bots[0].name, code });
await sleep(200);
vote(bots[0], 'map:0');
bots[1].s.emit('queue:join', { name: bots[1].name, code });
await sleep(200);
vote(bots[1], 'map:0');
await sleep(250);
check('two matching picks wait for the third courier', bots[0].lobby?.phase === 'waiting', bots[0].lobby?.phase);
vote(bots[1], 'next');
await sleep(150);
check('"next" is not a lobby choice', bots[0].lobby?.votes?.[1] === 'map:0', JSON.stringify(bots[0].lobby?.votes));
bots[2].s.emit('queue:join', { name: bots[2].name, code });
await sleep(400);
check('the complete team starts the agreed world', bots[2].lobby?.phase === 'countdown' && bots[2].lobby?.map === 0 && bots[2].lobby?.mode === 'single', `${bots[2].lobby?.phase} map=${bots[2].lobby?.map} mode=${bots[2].lobby?.mode}`);
await sleep(5600);
check('room playing on World 1', bots.every((b) => b.lobby?.phase === 'playing' && b.lobby.map === 0), bots.map((b) => `${b.lobby?.phase}/${b.lobby?.map}`).join(','));

// walk the slot-1 courier next to the artifact and hop in (F counter)
const ada = bots.find((b) => b.lobby?.you === 1) ?? bots[1];
ada.s.emit('dev', { me: [0, 0, 3.6] });
await sleep(1200);
ada.pilot = 1;
for (let k = 0; k < 6; k++) {
  send(ada, 0, 0);
  await sleep(40);
}
await sleep(400);
check('pilot visible to every client', bots.every((b) => last(b)?.pi === ada.lobby?.you), bots.map((b) => last(b)?.pi).join(','));

// duplicated + reordered packets: an old packet (lower seq) must not undo the newer one
const z0 = last(ada).ar[2];
for (let k = 0; k < 30; k++) {
  send(ada, 0, -1);
  send(ada, 0, 0, { seq: ada.seq - 5 }); // stale duplicate arriving late
  await sleep(33);
}
await sleep(300);
check('stale packets ignored (pilot keeps steering)', last(ada).ar[2] < z0 - 0.6, `z ${z0} -> ${last(ada).ar[2]}`);
check('server still alive after junk', bots.every((b) => b.s.connected));
ada.s.emit('in', ['x', NaN, null, {}, 0, 0]);
ada.s.emit('in', new Array(50).fill(1));
await sleep(200);
check('malformed input ignored', bots.every((b) => b.s.connected) && last(ada).ph === 'playing');

// identical mechanism state across clients (same tick)
const tick = commonT();
const same = bots.map((b) => b.snaps.find((s) => s.t === tick));
check('same tick on all clients', same.every(Boolean), String(tick));
check('mechanism state identical across clients', same.every((s) => JSON.stringify(s!.m) === JSON.stringify(same[0]!.m)), `${same[0]?.m.length} mechs`);

// finish -> results -> 2 of 3 vote for World 5 (single-world replay)
bots[0].s.emit('dev', { finish: true });
await sleep(700);
check('results phase', bots.every((b) => b.lobby?.phase === 'finished'));
bots[0].s.emit('act', { type: 'vote', value: 'map:4' });
await sleep(300);
check('one vote is not enough', bots[0].lobby?.phase === 'finished');
bots[0].s.emit('act', { type: 'vote', value: 'map:99' });
bots[2].s.emit('act', { type: 'vote', value: 'bogus' });
await sleep(300);
check('invalid votes ignored', bots[0].lobby?.phase === 'finished' && bots[0].lobby?.votes.filter(Boolean).length === 1, JSON.stringify(bots[0].lobby?.votes));
// a teammate drops during the results screen, comes back with the same session token
const cy = bots[2];
cy.s.disconnect();
await sleep(500);
bots[1].s.emit('act', { type: 'vote', value: 'map:4' });
await sleep(400);
check('no world change while a teammate is missing', bots[0].lobby?.phase === 'finished', bots[0].lobby?.phase);
const cy2 = await bot('Cy', cy.token);
bots[2] = cy2;
await sleep(1200);
check('rejoined the same room after a results-screen drop', cy2.lobby?.roomId === bots[0].lobby?.roomId, `${cy2.lobby?.roomId} vs ${bots[0].lobby?.roomId}`);
check('majority vote executes once everyone is back', bots[0].lobby?.phase === 'countdown' && bots[0].lobby?.map === 4 && bots[0].lobby?.mode === 'single', `${bots[0].lobby?.phase} map=${bots[0].lobby?.map} mode=${bots[0].lobby?.mode}`);
await sleep(4200);
check('World 5 playing for everyone', bots.every((b) => last(b)?.mp === 4 && last(b)?.ph === 'playing'), bots.map((b) => `${last(b)?.mp}/${last(b)?.ph}`).join(','));
const cartIdx = 3;
const t2 = commonT(4);
const s2 = bots.map((b) => b.snaps.find((s) => s.t === t2 && s.mp === 4));
check('cart state identical across clients', s2.every((s) => s && JSON.stringify(s.m[cartIdx]) === JSON.stringify(s2[0]!.m[cartIdx])), JSON.stringify(s2[0]?.m[cartIdx]));

for (const b of bots) b.s.disconnect();
console.log(fails ? `\n${fails} FAILURES` : '\nALL NET2 CHECKS PASSED');
process.exit(fails ? 1 : 0);
