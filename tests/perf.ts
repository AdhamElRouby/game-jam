// Render cost per world in a solo dev room: FPS over 3 s, draw calls and triangles for one full frame (all passes).
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
// every world at its start and at a later checkpoint (dev `map` restarts the room on that world)
const spots: [string, string[]][] = [];
for (const [i, name, cp] of [[0, 'w1', 1], [1, 'w2', 2], [2, 'w3', 1], [3, 'w4', 3], [4, 'w5', 2], [5, 'w6', 2]] as const) {
  spots.push([`${name}`, [`{ map: ${i} }`]]);
  spots.push([`${name}cp${cp}`, [`{ warp: ${cp} }`]]);
}
for (const [name, cmds] of spots) {
  for (const cmd of cmds) {
    await page.evaluate(`window.__SH_NET.dev(${cmd})`);
    await page.waitForTimeout(cmd.includes('map') ? 2200 : 300);
  }
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
  console.log(name.padEnd(6), JSON.stringify(r));
}
await browser.close();
