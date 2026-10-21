// Where the per-frame garbage comes from: V8's sampling heap profiler for a few seconds of play (courier walking in
// circles, camera turning), top allocation sites by bytes. npx tsx tests/alloc-profile.ts [url] [map] [secs]
import { chromium } from 'playwright';
import { PROBE_INIT, installNetProbe, startMeasure, stopMeasure } from './probe';
const base = process.argv[2] ?? 'http://127.0.0.1:5173';
const map = Number(process.argv[3] ?? 0);
const secs = Number(process.argv[4] ?? 4);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript(PROBE_INIT);
const page = await ctx.newPage();
await page.goto(`${base}/?dev`);
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
await installNetProbe(page);
const cdp = await ctx.newCDPSession(page);
await cdp.send('HeapProfiler.enable');
await startMeasure(page);
await page.waitForTimeout(1000);
await cdp.send('HeapProfiler.startSampling', { samplingInterval: 4096, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
await page.waitForTimeout(secs * 1000);
const { profile } = (await cdp.send('HeapProfiler.stopSampling')) as any;
await stopMeasure(page);
const sites = new Map<string, number>();
let total = 0;
const walk = (n: any, stack: string[]) => {
  const f = n.callFrame;
  const name = `${f.functionName || '(anon)'} ${String(f.url).split('/').pop()?.split('?')[0]}:${f.lineNumber + 1}`;
  const st = [...stack, name];
  if (n.selfSize) {
    // attribute to the innermost frame in our code (src/), with its caller
    const ours = process.env.FULL ? st.slice(-4) : st.filter((s) => !/node_modules|three\.module|react|chunk|\(anon\) :0|\(root\)|\(program\)/.test(s));
    const key = (process.env.FULL ? ours.reverse() : ours.slice(-2)).join(' <- ') || name;
    sites.set(key, (sites.get(key) ?? 0) + n.selfSize);
    total += n.selfSize;
  }
  for (const c of n.children) walk(c, st);
};
walk(profile.head, []);
console.log(`sampled ${(total / 1e6 / secs).toFixed(1)} MB/s allocated (top sites):`);
for (const [k, v] of [...sites].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`${((v / total) * 100).toFixed(1).padStart(5)}%  ${k}`);
await browser.close();
