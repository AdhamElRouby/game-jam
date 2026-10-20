// SHIFT HAPPENS server: serves the built client and runs one authoritative Rapier world per 3-player room.
import express from 'express';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Server } from 'socket.io';
import { initPhysics } from './sim';
import { Matchmaker } from './matchmaker';
import { TICK_HZ } from '../src/shared/constants';

const PORT = Number(process.env.PORT || 3000);
// loopback by default; set HOST=0.0.0.0 only on a real host behind its own proxy (e.g. Render)
const HOST = process.env.HOST || '127.0.0.1';
const PROD = process.env.NODE_ENV === 'production';
const DEV = !PROD || process.env.SH_DEV === '1';

const log = (msg: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);

await initPhysics();

const app = express();
app.disable('x-powered-by');
const httpServer = createServer(app);
const io = new Server(httpServer, {
  pingInterval: 5000,
  pingTimeout: 10000,
  maxHttpBufferSize: 16_000,
  cors: PROD ? undefined : { origin: true },
});
const mm = new Matchmaker(io, DEV, log);

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, ...mm.stats() });
});

// serve the production client build (dist/client) when present
const here = path.dirname(fileURLToPath(import.meta.url));
const clientDir = [path.resolve(here, '../client'), path.resolve(here, '../dist/client')].find((d) => existsSync(path.join(d, 'index.html')));
if (clientDir) {
  app.use(
    express.static(clientDir, {
      maxAge: '1h',
      setHeaders(res, file) {
        if (file.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
      },
    }),
  );
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/socket.io')) return next();
    res.sendFile(path.join(clientDir, 'index.html'));
  });
  log(`serving client from ${clientDir}`);
} else {
  log('no client build found (dev mode: run vite on :5173)');
}

io.on('connection', (socket) => {
  socket.on('hello', (msg) => mm.hello(socket, msg));
  socket.on('queue:join', (msg) => mm.join(socket, msg));
  socket.on('queue:leave', () => mm.leave(socket));
  socket.on('in', (data) => mm.withMember(socket, (room, m) => room.input(m, data)));
  socket.on('shift', (shape) => mm.withMember(socket, (room, m) => room.shift(m, shape)));
  socket.on('act', (msg) => mm.withMember(socket, (room, m) => room.action(m, msg?.type)));
  socket.on('dev', (cmd) => mm.withMember(socket, (room, m) => room.devCommand(m, cmd)));
  socket.on('ping:t', (t, ack) => typeof ack === 'function' && ack(Date.now()));
  socket.on('disconnect', () => mm.disconnect(socket));
});

// fixed-rate authoritative loop with accumulator
const STEP_MS = 1000 / TICK_HZ;
let last = performance.now();
let acc = 0;
setInterval(() => {
  const now = performance.now();
  acc += Math.min(250, now - last);
  last = now;
  let n = 0;
  while (acc >= STEP_MS && n < 5) {
    mm.step();
    acc -= STEP_MS;
    n++;
  }
  if (n === 5) acc = 0;
}, 4);

httpServer.listen(PORT, HOST, () => log(`SHIFT HAPPENS server on http://${HOST}:${PORT} (${PROD ? 'production' : 'dev'}${DEV ? ', dev tools on' : ''})`));
