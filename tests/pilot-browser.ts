// Piloting in a real browser (solo dev room): hop in with F, steer, ability, hop out; screenshots + state checks.
// npx tsx tests/pilot-browser.ts [baseUrl]   (needs the dev server: uses the solo room + dev teleports)
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:5173';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs: string[] = [];
page.on('console', (m) => m.type() === 'error' && logs.push(`[error] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
let fails = 0;
const check = (n: string, ok: boolean, info = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${info}`);
  if (!ok) fails++;
};
const snap = () => page.evaluate(`(() => { const s = window.__SH_NET.latest(); return s ? { ph: s.ph, pi: s.pi, pa: s.pa, ar: s.ar, me: s.pl[0] } : null; })()`) as Promise<any>;
const hold = async (key: string, ms: number) => {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
};

await page.goto(base + '/?dev');
await page.waitForTimeout(1500);
await page.getByText('Solo test room (dev)').click();
for (let k = 0; k < 60; k++) {
  if ((await snap())?.ph === 'playing') break;
  await page.waitForTimeout(250);
}
check('solo room playing', (await snap())?.ph === 'playing');
// stand right behind the cube
await page.evaluate(`window.__SH_NET.dev({ me: [0, 0, 4.6] })`);
await page.waitForTimeout(600);
await page.screenshot({ path: 'tests/out/pilot-0-near.png' });
const tip = await page.locator('.e-tip:not(.q-tip)').textContent();
check('hop-in prompt shown near the artifact', !!tip && tip.includes('hop in'), JSON.stringify(tip));
await page.keyboard.press('KeyF');
await page.waitForTimeout(500);
let s = await snap();
check('F hops inside', s?.pi === 0 && (s.me[8] & 32) !== 0, `pi=${s?.pi}`);
check('pilot panel visible', (await page.locator('.pilot-panel').count()) === 1);
await page.screenshot({ path: 'tests/out/pilot-1-inside.png' });
const z0 = s.ar[2];
await hold('KeyW', 1800);
s = await snap();
check('WASD steers the artifact from inside', z0 - s.ar[2] > 1.0, `moved ${(z0 - s.ar[2]).toFixed(2)} m`);
// CUBE hop
const y0 = s.ar[1];
await page.keyboard.press('Space');
await page.waitForTimeout(280);
s = await snap();
check('Space hops the CUBE', s.ar[1] - y0 > 0.6, `dy=${(s.ar[1] - y0).toFixed(2)}`);
await page.screenshot({ path: 'tests/out/pilot-2-hop.png' });
await page.waitForTimeout(900);
// shift to ROUND from inside, then hop out
await page.keyboard.press('Digit4');
await page.waitForTimeout(700);
s = await snap();
check('shift from inside', s.ar[7] === 3 && s.pi === 0, `shape=${s.ar[7]}`);
await page.screenshot({ path: 'tests/out/pilot-3-round.png' });
await page.waitForTimeout(800);
await page.keyboard.press('KeyF');
await page.waitForTimeout(900);
s = await snap();
check('F hops out', s.pi === -1 && (s.me[8] & 32) === 0, `pi=${s.pi}`);
const d = Math.hypot(s.me[1] - s.ar[0], s.me[3] - s.ar[2]);
check('courier placed beside the artifact', d > 1.2 && d < 4, `d=${d.toFixed(2)}`);
await page.screenshot({ path: 'tests/out/pilot-4-out.png' });
console.log(logs.length ? logs.slice(0, 10).join('\n') : 'no page errors');
console.log(fails ? `${fails} FAILURES` : 'ALL PILOT BROWSER CHECKS PASSED');
await browser.close();
process.exit(fails ? 1 : 0);
