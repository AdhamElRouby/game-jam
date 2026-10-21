// World pictures for the lobby picker: solo dev room, each world from a pinned camera, HUD hidden, saved as
// public/assets/worlds/<map id>.jpg. Needs the dev server. npx tsx tests/thumbs.ts [baseUrl] [only ids, comma list]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173';
const only = process.argv[3] ? new Set(process.argv[3].split(',')) : null;
/** map index, id, camera position, look-at point, where to park the courier */
const SHOTS: [number, string, number[], number[], number[]][] = [
  [0, 'dock', [11, 11, 9], [1, 0.5, -16], [1.2, 0, 1.5]],
  [1, 'windbridge', [13, 13, -33], [-1, 0, -57], [0.5, 0, -37]],
  [2, 'clockwork', [15, 15, -76], [-1, 3, -98], [2, 0, -80]],
  [3, 'mushroom', [84, 17, 6], [70, 3, -30], [71, 0, 3]],
  [4, 'railway', [-51, 19, -4], [-70, 2, -38], [-68.5, 0, 4]],
  [5, 'castle', [15, 20, -114], [0, 2, -150], [-3, 8, -112]],
];
mkdirSync('public/assets/worlds', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
await page.goto(`${base}/?dev`);
await page.waitForTimeout(1500);
await page.getByText('Solo test room (dev)').click();
for (let k = 0; k < 60; k++) {
  if ((await page.evaluate(`(() => { const s = window.__SH_NET.latest(); return s ? s.ph : null; })()`)) === 'playing') break;
  await page.waitForTimeout(250);
}
// only the 3D view: hide every DOM overlay (HUD, labels, toasts)
await page.addStyleTag({ content: '.app > :not(.canvas-wrap) { display: none !important; }' });
for (const [i, id, pos, look, me] of SHOTS) {
  if (only && !only.has(id)) continue;
  await page.evaluate(`window.__SH_NET.dev({ map: ${i} })`);
  await page.waitForTimeout(2600);
  await page.evaluate(`window.__SH_NET.dev({ me: [${me.join(',')}] })`);
  await page.evaluate(`window.__SH_CAM([${pos.join(',')}], [${look.join(',')}])`);
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `public/assets/worlds/${id}.jpg`, type: 'jpeg', quality: 82 });
  console.log('saved', id);
}
await browser.close();
