// Frame-pacing profile of the real client in a solo dev room, every world at its start and a later checkpoint, with the
// courier walking in circles and the camera turning (everything moves, every frame differs). Per spot: frame interval
// p50 / p95 / p99 / max, long frames, main-thread JS per frame (every rAF callback timed), heap allocation rate and GC
// drops, draw calls / triangles, snapshot size + arrival gaps, how often your own courier's interpolation ran dry
// (frozen on the newest snapshot) and how much it visibly stuttered. See probe.ts for the metrics.
//
// npx tsx tests/profile.ts [url] [--w 1728] [--h 1000] [--dpr 2] [--q high] [--uncapped] [--maps 0,1,2] [--secs 4] [--label x] [--query a=1]
//   --uncapped: vsync and the 60 fps cap off (shows headroom; on ANGLE/Metal frame time then also includes GPU stalls)
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { PROBE_INIT, installNetProbe, startMeasure, stopMeasure, summarize, fmt, average, type Row } from './probe';

const argv = process.argv.slice(2);
const flag = (k: string, d: string) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const base = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'http://127.0.0.1:5173';
const W = Number(flag('w', '1728'));
const H = Number(flag('h', '1000'));
const DPR = Number(flag('dpr', '2'));
const Q = flag('q', 'high');
const SECS = Number(flag('secs', '4'));
const uncapped = argv.includes('--uncapped');
const maps = flag('maps', '0,1,2,3,4,5').split(',').map(Number);
const label = flag('label', `${Q}-${W}x${H}@${DPR}${uncapped ? '-uncapped' : ''}`);
const extraQuery = flag('query', '');

const args = ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-precise-memory-info'];
if (uncapped) args.push('--disable-gpu-vsync', '--disable-frame-rate-limit');
const browser = await chromium.launch({ channel: 'chrome', headless: !argv.includes('--headed'), args });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
await ctx.addInitScript(PROBE_INIT);
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(`${base}/?dev${Q ? '&q=' + Q : ''}${extraQuery ? '&' + extraQuery : ''}`);
await page.waitForTimeout(1500);
await page.getByText('Solo test room (dev)').click();
for (let k = 0; k < 80; k++) {
  if ((await page.evaluate(`(() => { const s = window.__SH_NET.latest(); return s ? s.ph : null; })()`)) === 'playing') break;
  await page.waitForTimeout(250);
}
await installNetProbe(page);

const rows: Row[] = [];
async function measure(spot: string) {
  await startMeasure(page);
  await page.waitForTimeout(SECS * 1000);
  const r = summarize(spot, await stopMeasure(page));
  rows.push(r);
  console.log(fmt(r));
}

console.log(`profile ${label}: ${W}x${H} @${DPR} quality ${Q}${uncapped ? ' (uncapped)' : ''}, ${SECS}s per spot`);
const CPS = [1, 2, 1, 3, 2, 2];
for (const i of maps) {
  await page.evaluate(`window.__SH_NET.dev({ map: ${i} })`);
  for (let k = 0; k < 40; k++) {
    await page.waitForTimeout(250);
    const ok = await page.evaluate(`(() => { const s = window.__SH_NET.latest(); return !!s && s.ph === 'playing' && s.mp === ${i}; })()`);
    if (ok) break;
  }
  await page.waitForTimeout(1500);
  await measure(`w${i + 1}`);
  await page.evaluate(`window.__SH_NET.dev({ warp: ${CPS[i]} })`);
  await page.waitForTimeout(1500);
  await measure(`w${i + 1}cp`);
}
console.log(average(rows));
if (errors.length) console.log('page errors:', errors.slice(0, 5));
mkdirSync('tests/out', { recursive: true });
writeFileSync(`tests/out/profile-${label}.json`, JSON.stringify({ label, W, H, DPR, Q, uncapped, rows }, null, 1));
await browser.close();
