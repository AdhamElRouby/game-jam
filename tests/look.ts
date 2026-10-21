// Look-dev helper: solo dev room, run a list of dev commands, screenshot. Fast iteration on visuals.
// npx tsx tests/look.ts <out.png> "<query>" '<json array of steps>' [w] [h]
// step: { "dev": {...} } | { "wait": ms } | { "shot": "path.png" } | { "eval": "js" }
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const out = process.argv[2] ?? 'tests/out/look.png';
const query = process.argv[3] ?? '';
const rawSteps = process.argv[4] ?? '[]';
// steps inline as JSON, or "@path/to/steps.json"
const steps = JSON.parse(rawSteps.startsWith('@') ? readFileSync(rawSteps.slice(1), 'utf8') : rawSteps) as Record<string, unknown>[];
const W = Number(process.argv[5] ?? 1280);
const H = Number(process.argv[6] ?? 720);
const base = process.env.SH_URL ?? 'http://localhost:5173'; // SH_DPR=2 for a retina-sized capture
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: Number(process.env.SH_DPR ?? 1) });
const logs: string[] = [];
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(`${base}/?dev${query ? '&' + query : ''}`);
await page.waitForTimeout(1800);
if (steps.length && steps[0].landing) {
  await page.waitForTimeout(Number(steps[0].landing));
  await page.screenshot({ path: out });
} else {
  await page.getByText('Solo test room (dev)').click();
  for (let k = 0; k < 60; k++) {
    const ph = await page.evaluate(`(() => { const s = window.__SH_NET.latest(); return s ? s.ph : null; })()`);
    if (ph === 'playing') break;
    await page.waitForTimeout(250);
  }
  await page.evaluate(`document.querySelector('.controls')?.click()`);
  let shot = false;
  for (const s of steps) {
    if (s.dev) await page.evaluate(`window.__SH_NET.dev(${JSON.stringify(s.dev)})`);
    if (s.wait) await page.waitForTimeout(Number(s.wait));
    if (s.eval) await page.evaluate(String(s.eval));
    if (s.shot) {
      await page.screenshot({ path: String(s.shot) });
      shot = true;
    }
  }
  if (!shot) {
    await page.waitForTimeout(1200);
    await page.screenshot({ path: out });
  }
}
const info = await page.evaluate(`(() => { const gl = window.__SH_GL; return gl ? { calls: gl.info.render.calls, tris: gl.info.render.triangles, geos: gl.info.memory.geometries, tex: gl.info.memory.textures } : null; })()`);
console.log('render', JSON.stringify(info));
console.log(logs.filter((l) => !l.includes('Clock')).slice(0, 12).join('\n'));
await browser.close();
