// Three clients on one machine (how the game is usually tried out): three browser contexts in one room, all three
// couriers walking and every camera turning at once, frame pacing + network metrics measured on each client at the
// same time (see probe.ts). Every world at its start and a later checkpoint.
//
// npx tsx tests/profile-three.ts [url] [--w 1150] [--h 720] [--dpr 2] [--q high] [--maps 0,1,2,3,4,5] [--secs 4] [--label x] [--query a=1]
import { chromium, type Page } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { PROBE_INIT, installNetProbe, startMeasure, stopMeasure, summarize, fmt, average, type Row } from './probe';

const argv = process.argv.slice(2);
const flag = (k: string, d: string) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const base = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'http://127.0.0.1:5173';
const W = Number(flag('w', '1150'));
const H = Number(flag('h', '720'));
const DPR = Number(flag('dpr', '2'));
const Q = flag('q', '');
const SECS = Number(flag('secs', '4'));
const maps = flag('maps', '0,1,2,3,4,5').split(',').map(Number);
const label = flag('label', `three-${Q || 'default'}-${W}x${H}@${DPR}`);
const extraQuery = flag('query', '');

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
const names = ['Ada', 'Bo', 'Cy'];
const pages: Page[] = [];
const errors: string[] = [];
const qs = [Q ? `q=${Q}` : '', extraQuery].filter(Boolean).join('&');
for (let i = 0; i < 3; i++) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
  await ctx.addInitScript(PROBE_INIT);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${names[i]}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${names[i]}: ${m.text()}`));
  await page.goto(`${base}/?dev${qs ? '&' + qs : ''}`);
  pages.push(page);
}
const sleep = (ms: number) => pages[0].waitForTimeout(ms);
const ph = (p: Page) => p.evaluate(`(() => { const s = window.__SH_NET.latest(); return s ? s.ph + ':' + s.mp : null; })()`) as Promise<string | null>;
await sleep(1500);
for (let i = 0; i < 3; i++) {
  await pages[i].fill('input', names[i]);
  await pages[i].getByRole('button', { name: 'PLAY', exact: true }).click();
  await pages[i].waitForTimeout(400);
}
for (const p of pages.slice(0, 2)) await p.getByRole('button', { name: /Royal Loading Dock/ }).click();
for (let k = 0; k < 120; k++) {
  if ((await Promise.all(pages.map(ph))).every((x) => x?.startsWith('playing'))) break;
  await sleep(150);
}
for (const p of pages) await installNetProbe(p);

const rows: Row[][] = [[], [], []];
console.log(`profile ${label}: 3 clients, ${W}x${H} @${DPR} quality ${Q || 'default'}, ${SECS}s per spot`);
const CPS = [1, 2, 1, 3, 2, 2];
for (const i of maps) {
  await pages[0].evaluate(`window.__SH_NET.dev({ map: ${i} })`);
  for (let k = 0; k < 60; k++) {
    await sleep(250);
    if ((await Promise.all(pages.map(ph))).every((x) => x === `playing:${i}`)) break;
  }
  await sleep(1500);
  for (const spot of [`w${i + 1}`, `w${i + 1}cp`]) {
    if (spot.endsWith('cp')) {
      await pages[0].evaluate(`window.__SH_NET.dev({ warp: ${CPS[i]} })`);
      await sleep(1500);
    }
    await Promise.all(pages.map((p, k) => startMeasure(p, { phase: k * 2.1 })));
    await sleep(SECS * 1000);
    const res = await Promise.all(pages.map((p) => stopMeasure(p)));
    res.forEach((r, k) => {
      const row = summarize(`${spot}.${k}`, r);
      rows[k].push(row);
      console.log(fmt(row));
    });
  }
}
rows.forEach((r, k) => console.log(average(r, `AVG.${k}`)));
console.log(average(rows.flat(), 'AVG'));
if (errors.length) console.log('page errors:', errors.slice(0, 5));
mkdirSync('tests/out', { recursive: true });
writeFileSync(`tests/out/profile-${label}.json`, JSON.stringify({ label, W, H, DPR, Q, rows }, null, 1));
await browser.close();
