// Drive a solo dev room in a real browser and capture gameplay screenshots.
// npx tsx tests/play-solo.ts [baseUrl]
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:5173';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs: string[] = [];
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(base + '/?dev');
await page.waitForTimeout(1500);
await page.getByText('Solo test room (dev)').click();
await page.waitForTimeout(1200);
await page.screenshot({ path: 'tests/out/solo-countdown.png' });
await page.waitForTimeout(4500);
await page.screenshot({ path: 'tests/out/solo-start.png' });
const hold = async (key: string, ms: number) => {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
};
// walk to the cube and push it toward the plate
await hold('KeyW', 2600);
await page.screenshot({ path: 'tests/out/solo-push.png' });
await hold('KeyW', 1800);
await page.waitForTimeout(1500);
await page.screenshot({ path: 'tests/out/solo-plate.png' });
// shift to LONG
await page.keyboard.press('Digit2');
await page.waitForTimeout(250);
await page.screenshot({ path: 'tests/out/solo-shift-mid.png' });
await page.waitForTimeout(800);
await page.screenshot({ path: 'tests/out/solo-long.png' });
const st = await page.evaluate(`(() => { const s = window.__SH_NET.latest(); return JSON.stringify({ ph: s.ph, ar: s.ar, pl: s.pl, w: s.w, cp: s.cp }); })()`);
console.log(st);
console.log(logs.slice(0, 20).join('\n'));
await browser.close();
