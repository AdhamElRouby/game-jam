// Input-to-screen latency of your own courier (solo dev room, World 1 start): a real key press (D) → the first rendered
// frame in which your courier has visibly moved (> 3 cm); and key release → the first frame where it has visibly slowed
// down. Repeated N times, reports median / p90 / max, plus the round trip measured by the client.
// npx tsx tests/latency.ts [url] [N=12]
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://127.0.0.1:5173';
const N = Number(process.argv[3] ?? 12);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`${base}/?dev&q=low`);
await page.waitForTimeout(1500);
await page.getByText('Solo test room (dev)').click();
for (let k = 0; k < 80; k++) {
  if ((await page.evaluate(`(() => { const s = window.__SH_NET.latest(); return s ? s.ph : null; })()`)) === 'playing') break;
  await page.waitForTimeout(250);
}
await page.waitForTimeout(1500);
// page side: stamp the keydown / keyup, then watch every rendered frame for the courier's response
await page.evaluate(`(() => {
  const L = window.__LAT = { down: 0, up: 0, start: null, moveAt: 0, stopAt: 0, vmax: 0, prev: null };
  window.addEventListener('keydown', (e) => { if (e.code === 'KeyD' && !e.repeat) { L.down = performance.now(); L.moveAt = 0; L.start = null; } }, true);
  window.addEventListener('keyup', (e) => { if (e.code === 'KeyD') { L.up = performance.now(); L.stopAt = 0; } }, true);
  const tick = () => {
    const f = window.__SH_FRAME.current, you = window.__SH_NET.lobby ? window.__SH_NET.lobby.you : -1;
    const me = f.players.find((p) => p.slot === you);
    if (me) {
      const now = performance.now();
      if (L.down && !L.moveAt) {
        if (!L.start) L.start = [me.x, me.z];
        else if (Math.hypot(me.x - L.start[0], me.z - L.start[1]) > 0.03) L.moveAt = now;
      }
      // visible slow-down after release: on-screen speed under 60% of the walking speed
      if (L.prev) {
        const dt = (now - L.prev[2]) / 1000;
        const s = dt > 0 ? Math.hypot(me.x - L.prev[0], me.z - L.prev[1]) / dt : 0;
        if (L.up > L.down && !L.stopAt && s < 3.2) L.stopAt = now;
      }
      L.prev = [me.x, me.z, now];
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})()`);
const moves: number[] = [];
const stops: number[] = [];
for (let i = 0; i < N; i++) {
  // alternate direction so the courier stays near the spawn
  const key = i % 2 ? 'KeyA' : 'KeyD';
  await page.evaluate(`window.__LAT.code = '${key}'`);
  if (key === 'KeyA') {
    await page.evaluate(`(() => { const L = window.__LAT; L.down = performance.now(); L.moveAt = 0; L.start = null; })()`);
  }
  await page.keyboard.down(key);
  await page.waitForTimeout(700);
  if (key === 'KeyA') await page.evaluate(`(() => { const L = window.__LAT; L.up = performance.now(); L.stopAt = 0; })()`);
  await page.keyboard.up(key);
  await page.waitForTimeout(700);
  const r = (await page.evaluate(`(() => { const L = window.__LAT; return [L.moveAt ? L.moveAt - L.down : -1, L.stopAt ? L.stopAt - L.up : -1]; })()`)) as number[];
  if (r[0] > 0) moves.push(r[0]);
  if (r[1] > 0) stops.push(r[1]);
  await page.waitForTimeout(150 + Math.random() * 100);
}
const pct = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor((p / 100) * a.length))] ?? NaN;
const rtt = (await page.evaluate(`window.__SH_NET.rtt`)) as number;
console.log(`press → moves on screen:   median ${pct(moves, 50).toFixed(0)} ms  p90 ${pct(moves, 90).toFixed(0)} ms  max ${Math.max(...moves).toFixed(0)} ms  (n ${moves.length})`);
console.log(`release → slows on screen: median ${pct(stops, 50).toFixed(0)} ms  p90 ${pct(stops, 90).toFixed(0)} ms  max ${Math.max(...stops).toFixed(0)} ms  (n ${stops.length})`);
console.log(`client-measured round trip ${rtt.toFixed(0)} ms`);
await browser.close();
