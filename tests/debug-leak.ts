// GPU resource growth across repeated world switches (geometry/texture leak check). npx tsx tests/debug-leak.ts [base] [trace]
// With `trace`, uploaded geometries that are neither in the scene nor disposed are grouped by where they were built.
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:5173';
const trace = process.argv[3] === 'trace';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await page.goto(`${base}/?dev`);
await page.waitForTimeout(1500);
if (trace)
  await page.evaluate(`(async () => {
    const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /\\/deps\\/three\\.js/.test(n));
    const T = await import(url);
    const born = new WeakMap();
    window.__live = new Set();
    const sa = T.BufferGeometry.prototype.setAttribute;
    T.BufferGeometry.prototype.setAttribute = function (...a) {
      if (!born.has(this)) born.set(this, (new Error().stack || '').split('\\n').slice(2, 7).map((l) => l.trim().replace(/https?:\\/\\/[^/]+/, '').replace(/\\?[^:]*/, '')).join(' < '));
      return sa.apply(this, a);
    };
    const ae = T.EventDispatcher.prototype.addEventListener;
    T.EventDispatcher.prototype.addEventListener = function (type, fn) {
      if (type === 'dispose' && this.isBufferGeometry) window.__live.add(this);
      return ae.call(this, type, fn);
    };
    const di = T.BufferGeometry.prototype.dispose;
    T.BufferGeometry.prototype.dispose = function () { window.__live.delete(this); return di.call(this); };
    window.__born = born;
    const K = (await import('/src/render/kit.ts')).Kit;
    const rurl = performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes("/deps/react.js"));
    const R = (await import(rurl)).default;
    const ownerChain = () => {
      let f = R.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED?.ReactCurrentOwner?.current;
      const names = [];
      while (f && names.length < 4) { const t = f.type; if (typeof t === 'function' && t.name) names.push(t.name); f = f.return; }
      return names.join('<');
    };
    const kb = K.prototype.build;
    K.prototype.build = function () {
      const out = kb.call(this);
      for (const m of out) {
        m.geo.computeBoundingBox();
        const c = m.geo.boundingBox.getCenter(new T.Vector3());
        born.set(m.geo, 'kit@' + c.x.toFixed(0) + ',' + c.y.toFixed(0) + ',' + c.z.toFixed(0) + ' ' + ownerChain());
      }
      return out;
    };
    const gl = window.__SH_GL;
    const r = gl.render.bind(gl);
    gl.render = (s, c) => { if (s.children.length > 8) window.__scene = s; return r(s, c); };
  })()`);
await page.getByText('Solo test room (dev)').click();
await page.waitForTimeout(6500);
const mem = () => page.evaluate(`(() => { const m = window.__SH_GL.info.memory; return m.geometries + '/' + m.textures; })()`);
for (let cycle = 0; cycle < 3; cycle++) {
  const row: string[] = [];
  for (const i of [0, 3, 4, 5]) {
    await page.evaluate(`window.__SH_NET.dev({ map: ${i} })`);
    await page.waitForTimeout(2600);
    row.push(`w${i + 1}=${await mem()}`);
  }
  console.log(`cycle ${cycle}:`, row.join('  '));
}
if (trace) {
  const out = await page.evaluate(`(() => {
    const inScene = new Set();
    window.__scene.traverse((o) => o.geometry && inScene.add(o.geometry));
    const groups = {};
    for (const g of window.__live) if (!inScene.has(g)) { const k = window.__born.get(g) || '?'; groups[k] = (groups[k] || 0) + 1; }
    return Object.entries(groups).sort((a, b) => b[1] - a[1]).slice(0, 12);
  })()`);
  for (const [k, n] of out as [string, number][]) console.log(String(n).padStart(4), k);
}
await browser.close();
