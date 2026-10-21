// Timeline of your own courier around a key press / release (solo dev room): drawn x, server x, prediction mode,
// correction sizes. npx tsx tests/debug-predict.ts [url]
import { chromium } from 'playwright';
const base = process.argv[2] ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`${base}/?dev&q=low`);
await page.waitForTimeout(1500);
await page.getByText('Solo test room (dev)').click();
for (let k = 0; k < 80; k++) {
  if ((await page.evaluate(`(() => { const s = window.__SH_NET.latest(); return s ? s.ph : null; })()`)) === 'playing') break;
  await page.waitForTimeout(250);
}
await page.waitForTimeout(1200);
await page.evaluate(`(() => {
  const T = window.__TL = []; const t0 = performance.now();
  const tick = () => {
    const f = window.__SH_FRAME.current, net = window.__SH_NET, you = net.lobby.you;
    const me = f.players.find((p) => p.slot === you); const L = net.latest(); const sp = L && L.pl.find((p) => p[0] === you);
    const P = window.__SH_PRED;
    if (me && sp) T.push([Math.round(performance.now() - t0), +me.x.toFixed(3), +sp[1].toFixed(3), +me.vx.toFixed(2), me.grounded ? 1 : 0, P.mode, +P.lastCorrection.toFixed(3), P.replayed, sp[12]]);
    if (T.length < 2000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})()`);
await page.waitForTimeout(300);
await page.evaluate(`window.__TL.push(['DOWN'])`);
await page.keyboard.down('KeyD');
await page.waitForTimeout(700);
await page.evaluate(`window.__TL.push(['UP'])`);
await page.keyboard.up('KeyD');
await page.waitForTimeout(700);
const T = (await page.evaluate(`window.__TL`)) as unknown[][];
for (const r of T) console.log(r.join('\t'));
await browser.close();
