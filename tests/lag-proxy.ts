// TCP proxy that adds one-way latency + jitter in both directions (order kept, like a real TCP path), for testing the
// game over a "real" network on one machine. Point a Vite dev server at it: SH_SERVER=http://127.0.0.1:<listen>.
// npx tsx tests/lag-proxy.ts [listen=3401] [target=3400] [oneWayMs=40] [jitterMs=15] [spikeEverySec=0] [spikeMs=0]
//   jitter: each chunk gets base + |gauss| * jitter extra (clamped so data never overtakes earlier data)
//   spikes: every N seconds the link stalls for spikeMs (a wifi hiccup)
import net from 'node:net';

const [listen, target, base, jitter, spikeEvery, spikeMs] = [3401, 3400, 40, 15, 0, 0].map((d, i) => Number(process.argv[2 + i] ?? d));
const gauss = () => Math.sqrt(-2 * Math.log(Math.random() || 1e-9)) * Math.cos(2 * Math.PI * Math.random());
let stallUntil = 0;
if (spikeEvery > 0) setInterval(() => (stallUntil = Date.now() + spikeMs), spikeEvery * 1000);

function pipe(from: net.Socket, to: net.Socket) {
  let last = 0;
  from.on('data', (buf) => {
    const now = Date.now();
    const at = Math.max(last, now + base + Math.abs(gauss()) * jitter, stallUntil);
    last = at;
    setTimeout(() => to.writable && to.write(buf), at - now);
  });
  from.on('close', () => setTimeout(() => to.destroy(), Math.max(0, last - Date.now()) + 5));
  from.on('error', () => to.destroy());
}

net
  .createServer((client) => {
    const server = net.connect(target, '127.0.0.1');
    pipe(client, server);
    pipe(server, client);
  })
  .listen(listen, '127.0.0.1', () => console.log(`lag proxy 127.0.0.1:${listen} -> :${target}  one-way ${base} ms + ~${jitter} ms jitter${spikeEvery ? `, ${spikeMs} ms stall every ${spikeEvery}s` : ''}`));
