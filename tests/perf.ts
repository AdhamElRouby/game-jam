// Render cost per chapter in a solo dev room: FPS over 3 s, draw calls and triangles for one full frame (all passes).
// npx tsx tests/perf.ts [baseUrl] [query]   e.g. query "q=low"
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:5173';
const query = process.argv[3] ?? '';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`${base}/?dev${query ? '&' + query : ''}`);
await page.waitForTimeout(1500);
await page.getByText('Solo test room (dev)').click();
for (let k = 0; k < 60; k++) {
  if ((await page.evaluate(`(() => { const s = window.__SH_NET.latest(); return s ? s.ph : null; })()`)) === 'playing') break;
  await page.waitForTimeout(250);
}
const spots: [string, string][] = [
  ['ch1', `{ me: [0.4, 0, 5.5] }`],
  ['ch2', `{ warp: 1, art: [-2.5, 1.1, -55.5], me: [-1, 0, -52] }`],
  ['ch3', `{ warp: 2, art: [-4.5, 1.1, -100.5], me: [-2.5, 0, -98.5] }`],
  ['ch4', `{ warp: 3 }`],
  ['goal', `{ art: [0, 1.2, -157], me: [1.5, 0, -154] }`],
];
for (const [name, cmd] of spots) {
  const c = JSON.parse(JSON.stringify(cmd.replace(/(\w+):/g, '"$1":')));
  await page.evaluate(`window.__SH_NET.dev(${c})`);
  await page.waitForTimeout(1800);
  const r = await page.evaluate(`new Promise((res) => {
    const gl = window.__SH_GL;
    let n = 0; const t0 = performance.now();
    const loop = () => {
      n++;
      if (performance.now() - t0 < 3000) requestAnimationFrame(loop);
      else {
        gl.info.autoReset = false; gl.info.reset();
        requestAnimationFrame(() => {
          const out = { fps: Math.round(n / 3), calls: gl.info.render.calls, tris: gl.info.render.triangles, geos: gl.info.memory.geometries, tex: gl.info.memory.textures, programs: gl.info.programs.length };
          gl.info.autoReset = true;
          res(out);
        });
      }
    };
    requestAnimationFrame(loop);
  })`);
  console.log(name.padEnd(5), JSON.stringify(r));
}
await browser.close();
