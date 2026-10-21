import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const [url = 'http://127.0.0.1:3000', label = 'movement'] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript('window.__name = (fn) => fn');
  await page.goto(url + '/?dev');
  await page.waitForFunction(() => (window as any).__SH_NET?.connected && (window as any).__SH_GL);
  await page.evaluate(() => (window as any).__SH_NET.join('Movement', undefined, true));
  await page.waitForFunction(() => (window as any).__SH_NET.latest()?.ph === 'playing');
  await page.waitForTimeout(1800);
  const results = [];
  for (let i = 0; i < Number(process.argv[4] ?? 8); i++) {
    await page.evaluate(() => (window as any).__SH_NET.dev({ me: [-4, 0, 5] }));
    await page.waitForTimeout(600);
    results.push(await page.evaluate(async () => {
      const W = window as any, net = W.__SH_NET, slot = net.lobby.you;
      W.__SH_PREDICTION?.(true); // exclude intentional test-placement teleports from reconciliation statistics
      const original = net.frame.bind(net);
      let view: any = null;
      net.frame = (...args: any[]) => { const f = original(...args); if (f) view = f.players.find((p: any) => p.slot === slot); return f; };
      const p0 = net.latest().pl.find((p: any) => p[0] === slot);
      const t0 = performance.now(); let serverMs: number | null = null, viewMs: number | null = null;
      const key = (type: string) => window.dispatchEvent(new KeyboardEvent(type, { code: 'KeyW', bubbles: true }));
      key('keydown');
      let release = 0, stopServerMs: number | null = null, stopViewMs: number | null = null, releaseZ = 0;
      await new Promise<void>(resolve => {
        const loop = () => {
          view = W.__SH_FRAME?.current.players.find((p: any) => p.slot === slot) ?? view;
          const t = performance.now(), p = net.latest().pl.find((p: any) => p[0] === slot);
          if (serverMs === null && p0[3] - p[3] > .015) serverMs = t - t0;
          if (viewMs === null && view && p0[3] - view.z > .015) viewMs = t - t0;
          if (!release && t - t0 >= 550) { release = t; releaseZ = view?.z ?? p[3]; key('keyup'); }
          if (release && t - release > 20) {
            if (stopServerMs === null && Math.abs(p[7]) < .1) stopServerMs = t - release;
            if (stopViewMs === null && view && Math.abs(view.vz) < .1) stopViewMs = t - release;
          }
          if (t - t0 < 1200) requestAnimationFrame(loop); else resolve();
        }; requestAnimationFrame(loop);
      });
      net.frame = original;
      return { serverMs, viewMs, stopServerMs, stopViewMs, distance: p0[3] - net.latest().pl.find((p: any) => p[0] === slot)[3], postReleaseTravel: releaseZ - (view?.z ?? releaseZ), diagnostics: net.diagnostics?.(), prediction: W.__SH_PREDICTION?.() };
    }));
  }
  await mkdir('tests/out/performance', { recursive: true });
  await writeFile(`tests/out/performance/${label}.json`, JSON.stringify({ url, results }, null, 2));
  console.log(JSON.stringify({ label, results: results.map(({ diagnostics, prediction, ...r }) => r) }));
} finally { await browser.close(); }
