// Prediction error per snapshot while walking in circles (solo dev room): server minus predicted at the acked input.
// npx tsx tests/debug-predict2.ts [url] [map] [straight]
import { chromium } from 'playwright';
const base = process.argv[2] ?? 'http://127.0.0.1:5173';
const map = Number(process.argv[3] ?? 0);
const straight = process.argv[4] === 'straight';
const warp = process.argv[5];
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`${base}/?dev&q=low`);
await page.waitForTimeout(1500);
await page.getByText('Solo test room (dev)').click();
for (let k = 0; k < 80; k++) {
  if ((await page.evaluate(`(() => { const s = window.__SH_NET.latest(); return s ? s.ph : null; })()`)) === 'playing') break;
  await page.waitForTimeout(250);
}
if (map) {
  await page.evaluate(`window.__SH_NET.dev({ map: ${map} })`);
  await page.waitForTimeout(3500);
}
if (warp) {
  await page.evaluate(`window.__SH_NET.dev({ warp: ${warp} })`);
  await page.waitForTimeout(1500);
}
await page.waitForTimeout(1000);
await page.evaluate(`(() => {
  const P = window.__SH_PRED; const T = window.__E = []; let last = P.snaps; const t0 = performance.now();
  window.__D = setInterval(() => {
    const t = (performance.now() - t0) / 1000;
    window.__SH_INPUT.override = ${straight} ? { mx: t % 2 < 1 ? 1 : -1, mz: 0, grab: false } : { mx: Math.cos(t * 1.8), mz: Math.sin(t * 1.8), grab: false };
    if (P.snaps !== last) { last = P.snaps; T.push([Math.round(t * 1000), P.mode, ...P.err.map((x) => +x.toFixed(3)), +P.lastCorrection.toFixed(3)]); }
  }, 4);
})()`);
await page.waitForTimeout(3000);
const T = (await page.evaluate(`(() => { clearInterval(window.__D); return window.__E; })()`)) as unknown[][];
console.log('t\tmode\tdx\tdy\tdz\tdvx\tdvy\tdvz\tsrvG\tourG\treplay\tcorr');
for (const r of T) console.log(r.join('\t'));
await browser.close();
