// Real cost of drawing one frame, per render configuration: the frame is drawn N times back to back and the GPU is
// made to finish (a 1-pixel readback), so pipelining and vsync can't hide anything. Same page, same camera (pinned),
// configurations interleaved and repeated, median reported. Solo dev room.
// npx tsx tests/gpu-cost.ts [url] [map index] [--w 1728 --h 1000 --dpr 2] [--query a=1]
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const flag = (k: string, d: string) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? argv[i + 1] : d;
};
const base = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'http://127.0.0.1:5173';
const mapIdx = argv[1] && !argv[1].startsWith('--') ? Number(argv[1]) : 0;
const W = Number(flag('w', '1728'));
const H = Number(flag('h', '1000'));
const DPR = Number(flag('dpr', '2'));
const query = flag('query', '');
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
const page = await ctx.newPage();
await page.goto(`${base}/?dev&q=${flag('q', 'high')}${query ? '&' + query : ''}`);
await page.waitForTimeout(1500);
await page.getByText('Solo test room (dev)').click();
for (let k = 0; k < 80; k++) {
  if ((await page.evaluate(`(() => { const s = window.__SH_NET.latest(); return s ? s.ph : null; })()`)) === 'playing') break;
  await page.waitForTimeout(250);
}
if (mapIdx) {
  await page.evaluate(`window.__SH_NET.dev({ map: ${mapIdx} })`);
  await page.waitForTimeout(3500);
}
await page.waitForTimeout(2500);

/** ms per frame: `draw` (JS expression drawing one frame) N times, then a readback to wait for the GPU */
const cost = (draw: string, n = 12) =>
  page.evaluate(`(() => {
    const R = window.__SH_GL, gl = R.getContext(), px = new Uint8Array(4);
    const draw = () => { ${draw} };
    draw(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const t0 = performance.now();
    for (let i = 0; i < ${n}; i++) draw();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return (performance.now() - t0) / ${n};
  })()`) as Promise<number>;

// the shipped composer with one pass switched off at a time, and the scene drawn straight to the screen
await page.evaluate(`(() => {
  const C = window.__SH_COMPOSER, R = window.__SH_GL;
  const without = (i) => () => { const p = C.passes[i]; const was = p.enabled; p.enabled = false; try { C.render(0.016); } finally { p.enabled = was; } };
  const cfg = window.__SH_GPU_CONFIGS = { 'post chain (as shipped)': () => C.render(0.016) };
  C.passes.forEach((p, i) => { if (i > 0) cfg['  minus ' + (p.name === 'Pass' ? 'N8AO' : p.name) + (p.effects ? '(' + p.effects.map((e) => e.name.replace('Effect', '')).join(',') + ')' : '')] = without(i); });
  const last = C.passes[C.passes.length - 1], fx = C.passes[C.passes.length - 2];
  if (last && last.name === 'CopyPass' && fx) cfg['  no trailing copy (effects to screen)'] = () => { last.enabled = false; fx.renderToScreen = true; try { C.render(0.016); } finally { last.enabled = true; fx.renderToScreen = false; } };
  cfg['scene straight to screen'] = () => { R.setRenderTarget(null); R.render(C.passes[0].scene, C.passes[0].camera); };
  cfg['scene, shadow map not redrawn'] = () => { R.shadowMap.autoUpdate = false; R.setRenderTarget(null); R.render(C.passes[0].scene, C.passes[0].camera); R.shadowMap.autoUpdate = true; };
})()`);
if (argv.includes('--scene')) {
  // the scene straight to the screen with each top-level subtree hidden in turn, and without shadows
  await page.evaluate(`(() => {
    const R = window.__SH_GL, C = window.__SH_COMPOSER, scene = window.__SH_SCENE;
    const cam = C ? C.passes[0].camera : scene.userData.cam;
    const draw = () => { R.setRenderTarget(null); R.render(scene, cam); };
    const cfg = window.__SH_GPU_CONFIGS = { 'scene': draw };
    scene.children.forEach((c, i) => {
      let n = 0; c.traverse((o) => { if (o.isMesh || o.isPoints) n++; });
      if (!n) return;
      cfg['  hide ' + i + ' ' + (c.name || c.type) + ' (' + n + ' meshes)'] = () => { c.visible = false; try { draw(); } finally { c.visible = true; } };
    });
    cfg['  no shadow pass'] = () => { const a = R.shadowMap.autoUpdate; R.shadowMap.autoUpdate = false; R.shadowMap.needsUpdate = false; try { draw(); } finally { R.shadowMap.autoUpdate = a; } };
  })()`);
}
const configs = (await page.evaluate(`Object.keys(window.__SH_GPU_CONFIGS)`)) as string[];
const draws: Record<string, string> = Object.fromEntries(configs.map((k) => [k, `window.__SH_GPU_CONFIGS[${JSON.stringify(k)}]()`]));
console.log(`map ${mapIdx}  ${W}x${H}@${DPR}  drawing buffer ${await page.evaluate(`window.__SH_GL.domElement.width + 'x' + window.__SH_GL.domElement.height`)}`);
const res: Record<string, number[]> = {};
for (let round = 0; round < 5; round++) {
  for (const [k, d] of Object.entries(draws)) (res[k] ??= []).push(await cost(d));
}
for (const [k, v] of Object.entries(res)) {
  v.sort((a, b) => a - b);
  console.log(`${k.padEnd(34)} ${v[2].toFixed(2).padStart(6)} ms/frame   (${v.map((x) => x.toFixed(1)).join(' ')})`);
}
await browser.close();
