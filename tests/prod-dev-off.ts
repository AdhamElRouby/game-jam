// Production safety: dev commands (finish / map) must do nothing on a production server. npx tsx tests/prod-dev-off.ts [prodUrl]
import { io } from 'socket.io-client';

const URL = process.argv[2] ?? 'http://127.0.0.1:3220';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const code = 'PD' + Math.floor(Math.random() * 9000 + 1000);
const bots = await Promise.all(
  [0, 1, 2].map(
    (i) =>
      new Promise<{ s: ReturnType<typeof io>; lobby: any }>((resolve) => {
        const s = io(URL, { transports: ['websocket'], forceNew: true });
        const b = { s, lobby: null as any };
        s.on('connect', () => s.emit('hello', { token: 'pd-' + i + '-' + Math.random().toString(36).slice(2), name: 'P' + i }));
        s.on('welcome', () => resolve(b));
        s.on('lobby', (l: any) => (b.lobby = l));
      }),
  ),
);
for (const b of bots) {
  b.s.emit('queue:join', { name: 'x', code });
  await sleep(100);
}
await sleep(5800);
const before = bots[0].lobby;
bots[0].s.emit('dev', { finish: true });
bots[0].s.emit('dev', { map: 4 });
await sleep(800);
const after = bots[0].lobby;
console.log('dev flag in lobby:', before?.dev, '| phase before/after:', before?.phase, after?.phase, '| map before/after:', before?.map, after?.map);
const ok = before?.phase === 'playing' && after?.phase === 'playing' && after?.map === 0 && before?.dev === false;
console.log(ok ? 'PASS  dev commands ignored in production' : 'FAIL  dev commands had an effect');
for (const b of bots) b.s.disconnect();
process.exit(ok ? 0 : 1);
