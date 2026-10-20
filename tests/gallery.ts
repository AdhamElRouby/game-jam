// Visual gallery: three couriers share one dev room; the slot-0 view is captured at fixed beats in every chapter.
// npx tsx tests/gallery.ts [baseUrl] [outPrefix] [width] [height] [only]
// Needs the dev server (uses dev warp/teleport commands). `only` = comma list of beat names to capture.
import { chromium, type Page } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? 'tests/out/gal';
const W = Number(process.argv[4] ?? 1280);
const H = Number(process.argv[5] ?? 720);
const only = process.argv[6] ? new Set(process.argv[6].split(',')) : null;
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const names = ['Ada', 'Bo', 'Cy'];
const pages: Page[] = [];
const logs: string[] = [];
for (let i = 0; i < 3; i++) {
  const ctx = await browser.newContext({ viewport: i === 0 ? { width: W, height: H } : { width: 400, height: 260 } });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && logs.push(`[c${i}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[c${i} pageerror] ${e.message}`));
  await page.goto(base + '/?dev');
  pages.push(page);
}
await pages[0].waitForTimeout(1800);
if (!only || only.has('landing')) await pages[0].screenshot({ path: `${out}-landing.png` });
for (let i = 0; i < 3; i++) {
  await pages[i].fill('input', names[i]);
  await pages[i].getByRole('button', { name: 'PLAY', exact: true }).click();
  await pages[i].waitForTimeout(300);
}
const phase = (p: Page) => p.evaluate(`(() => { const s = window.__SH_NET.latest(); return s ? s.ph : null; })()`) as Promise<string | null>;
for (let k = 0; k < 60 && (await phase(pages[0])) !== 'playing'; k++) await pages[0].waitForTimeout(250);
const you = (await Promise.all(pages.map((p) => p.evaluate(`window.__SH_NET.lobby && window.__SH_NET.lobby.you`)))) as number[];
const bySlot: Page[] = [];
you.forEach((s, i) => (bySlot[s] = pages[i]));
const main = pages[0];
const mainSlot = you[0];
const dev = (p: Page, cmd: string) => p.evaluate(`window.__SH_NET.dev(${cmd})`);
const drive = (slot: number, mx: number, mz: number, grab = false) => bySlot[slot].evaluate(`window.__SH_INPUT.override = { mx: ${mx}, mz: ${mz}, grab: ${grab} }`);
const stopAll = () => Promise.all([0, 1, 2].map((s) => drive(s, 0, 0, false)));
const place = async (pos: [number, number, number][]) => {
  for (let s = 0; s < 3; s++) await dev(bySlot[s], `{ me: [${pos[s].join(',')}] }`);
};
const shot = async (name: string, wait = 1200) => {
  await main.waitForTimeout(wait);
  if (only && !only.has(name)) return;
  await main.screenshot({ path: `${out}-${name}.png` });
  console.log('shot', name);
};
await main.evaluate(`document.querySelector('.controls')?.click()`);
console.log('slots', you.join(','), 'main slot', mainSlot);

// Chapter 1 — dock
await shot('ch1-start', 600);
await drive(0, 0.3, -1);
await drive(1, 0, -1);
await drive(2, -0.3, -1);
await shot('ch1-push', 1900);
await stopAll();
await dev(main, `{ art: [0, 1.1, -3.5] }`);
await place([[-2.2, 0, -0.6], [0.4, 0, 0.2], [2.4, 0, -0.8]]);
await shot('ch1-plate', 1800);
await dev(main, `{ warp: 1 }`);
await dev(main, `{ art: [0, 1.1, -21] }`);
await place([[-2.0, 0, -17.8], [0.6, 0, -17.2], [2.4, 0, -18.4]]);
await main.waitForTimeout(400);
await dev(main, `{ shape: 1 }`);
await shot('ch1-arch', 1400);
// Chapter 2 — windbridge cliffs
await dev(main, `{ warp: 1 }`);
await dev(main, `{ art: [-2.5, 1.1, -55.5] }`);
await place([[-4.6, 0, -52.4], [-1.0, 0, -52.0], [3.2, 0, -54.5]]);
await shot('ch2-cliffs', 1500);
await dev(main, `{ shape: 1 }`);
await shot('ch2-receiver', 1600);
await dev(main, `{ warp: 2 }`);
await dev(main, `{ art: [-2.5, 1.1, -63.2] }`);
await place([[-3.6, 0, -59.6], [6.3, 0, -63.2], [-1.2, 0, -59.4]]);
await shot('ch2-bridge', 1400);
// Chapter 3 — crooked tower
await dev(main, `{ warp: 2 }`);
await dev(main, `{ art: [-4.5, 1.1, -100.5] }`);
await place([[-6.4, 0, -99.2], [-2.6, 0, -99.4], [-4.4, 0, -97.6]]);
await shot('ch3-tower', 1400);
await dev(main, `{ shape: 2 }`);
await main.waitForTimeout(500);
await drive(0, 0, 0, true);
await drive(1, 0, 0, true);
await shot('ch3-tall', 1300);
await stopAll();
await dev(main, `{ warp: 3 }`);
await shot('ch3-top', 1600);
// Chapter 4 — castle dash
await dev(main, `{ art: [-6, 7.4, -121] }`);
await place([[-7.6, 6.6, -118.8], [-4.4, 6.6, -118.6], [-6.0, 6.6, -117.6]]);
await shot('ch4-safe', 1400);
await dev(main, `{ art: [5, 7.3, -119] }`);
await place([[4.0, 7.6, -116.8], [6.2, 7.6, -116.6], [5.0, 8, -115.2]]);
await main.waitForTimeout(400);
await dev(main, `{ shape: 3 }`);
await shot('ch4-chute', 900);
await dev(main, `{ art: [0, 1.2, -158.5] }`);
await place([[-2.2, 0, -156.2], [0.6, 0, -155.6], [2.6, 0, -156.6]]);
await dev(main, `{ shape: 0 }`);
await shot('ch4-goal', 1600);
await dev(main, `{ finish: true }`);
await shot('ending-2s', 2200);
await shot('ending-6s', 4000);
await shot('results', 3200);
const fps = await main.evaluate(`new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else res(n); }; requestAnimationFrame(f); })`);
console.log('fps~', fps);
console.log(logs.filter((l) => !l.includes('Clock')).slice(0, 20).join('\n'));
await browser.close();
