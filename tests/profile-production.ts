// Repeatable Chrome/DevTools profiling of the actual production bundle. No quality overrides.
// npx tsx tests/profile-production.ts <url> <label> [players=1] [worlds=0,1,2,3,4,5]
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const [url = 'http://127.0.0.1:3000', label = 'profile', countArg = '1', worldsArg = '0,1,2,3,4,5'] = process.argv.slice(2);
const count = Number(countArg);
const dir = 'tests/out/performance';
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true,
  args: ['--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const errors: string[] = [];
try {
  const pages = [];
  for (let client = 0; client < count; client++) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    // tsx names nested functions in serialized evaluate callbacks.
    await context.addInitScript('window.__name = (fn) => fn');
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(url + '/?dev');
    await page.waitForFunction(() => (window as any).__SH_NET?.connected && (window as any).__SH_GL);
    pages.push(page);
  }
  const code = Math.random().toString(36).slice(2, 10);
  console.log('joining', url, count, code);
  for (const [i, page] of pages.entries()) {
    await page.waitForFunction(() => (window as any).__SH_NET.socket.connected, null, { timeout: 45000 });
    await page.evaluate(({ i, count, code }) => (window as any).__SH_NET.join('Profiler' + i, code, count === 1), { i, count, code });
    await page.waitForFunction(() => (window as any).__SH_NET.lobby, null, { timeout: 15000 });
  }
  if (count > 1) for (const page of pages.slice(0, 2)) await page.evaluate(() => (window as any).__SH_NET.action('vote', 'map:0'));
  await pages[0].waitForFunction(() => (window as any).__SH_NET.latest()?.ph === 'playing', null, { timeout: 30000 });
  const cdp = await pages[0].context().newCDPSession(pages[0]);
  await cdp.send('Performance.enable');
  await cdp.send('SystemInfo.getInfo').catch(() => null);
  const gpuSession = await browser.newBrowserCDPSession();
  const gpu = await gpuSession.send('SystemInfo.getInfo');
  const results: any[] = [];
  for (const world of worldsArg.split(',').map(Number)) {
    await pages[0].evaluate(world => (window as any).__SH_NET.dev({ map: world }), world);
    await pages[0].waitForFunction(world => { const s = (window as any).__SH_NET.latest(); return s?.mp === world && s.ph === 'playing'; }, world);
    await pages[0].waitForTimeout(2500);
    const before = await cdp.send('Performance.getMetrics');
    // DevTools CPU sampling captures actual render/JS stacks, alongside independent RAF and WebGL counters.
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.start');
    const samples = await Promise.all(pages.map(page => page.evaluate(async () => {
      const W = window as any, net = W.__SH_NET, gl = W.__SH_GL;
      const times: number[] = [], calls: number[] = [], tris: number[] = [], arrivals: number[] = [], rtts: number[] = [];
      const drawMs: number[] = [], snapSteps: number[] = [], renderedErrors: number[] = [];
      const longTasks: number[] = [];
      const obs = new PerformanceObserver(list => list.getEntries().forEach(e => longTasks.push(e.duration)));
      obs.observe({ entryTypes: ['longtask'] });
      let lastArrival = performance.now(), lastServer = net.latest()?.t, lastFrame: number | undefined;
      const snap = (s: any) => { const t = performance.now(); arrivals.push(t - lastArrival); lastArrival = t; if (lastServer != null) snapSteps.push(s.t - lastServer); lastServer = s.t; };
      net.socket.on('snap', snap);
      const originalRender = gl.render;
      gl.render = function (...args: any[]) { const t = performance.now(); const r = originalRender.apply(this, args); drawMs.push(performance.now() - t); return r; };
      gl.info.autoReset = false; gl.info.reset();
      const start = performance.now();
      const pingTimer = setInterval(() => { const t = performance.now(); net.socket.timeout(4000).emit('ping:t', 0, (err: any) => { if (!err) rtts.push(performance.now() - t); }); }, 250);
      await new Promise<void>(resolve => {
        const raf = (t: number) => {
          if (lastFrame !== undefined) { times.push(t - lastFrame); calls.push(gl.info.render.calls); tris.push(gl.info.render.triangles); }
          lastFrame = t; gl.info.reset();
          if (performance.now() - start < 6000) requestAnimationFrame(raf); else resolve();
        };
        requestAnimationFrame(raf);
      });
      clearInterval(pingTimer); obs.disconnect(); net.socket.off('snap', snap); gl.render = originalRender; gl.info.autoReset = true;
      const stats = (a: number[]) => { const b = a.slice().sort((a,b) => a-b); return { n: b.length, median: b[Math.floor(b.length*.5)] ?? 0, p95: b[Math.floor(b.length*.95)] ?? 0, max: b.at(-1) ?? 0 }; };
      return { fps: times.length * 1000 / times.reduce((a,b) => a+b, 0), frameMs: stats(times), calls: stats(calls), triangles: stats(tris), renderSubmitMs: stats(drawMs), snapshotArrivalMs: stats(arrivals.slice(1)), snapshotStepMs: stats(snapSteps), rttMs: stats(rtts), longTasks: stats(longTasks), memory: gl.info.memory, programs: gl.info.programs?.length, netDiagnostics: net.diagnostics?.(), renderer: gl.getContext().getParameter(gl.getContext().RENDERER) };
    })));
    const { profile } = await cdp.send('Profiler.stop');
    await writeFile(`${dir}/${label}-world${world}.cpuprofile`, JSON.stringify(profile));
    const after = await cdp.send('Performance.getMetrics');
    const metrics = Object.fromEntries(after.metrics.map(m => [m.name, m.value - (before.metrics.find(b => b.name === m.name)?.value ?? 0)]));
    const server = await (await fetch(url + '/healthz')).json();
    const prediction = await pages[0].evaluate(() => (window as any).__SH_PREDICTION?.());
    const recent = await Promise.all(pages.map(p => p.evaluate(() => (window as any).__SH_NET.snaps.slice(-30))));
    const common = recent[0].filter((s: any) => recent.every(list => list.some((v: any) => v.t === s.t)));
    const identical = common.length > 0 && common.every((s: any) => recent.every(list => JSON.stringify(list.find((v: any) => v.t === s.t)) === JSON.stringify(s)));
    if (!identical) throw new Error(`World ${world}: divergent multiplayer snapshots`);
    const row = { world, samples, mainThread: metrics, server, prediction, identicalSnapshots: { passed: identical, compared: common.length } };
    results.push(row); console.log(JSON.stringify({ world, samples: samples.map(s => ({ fps: s.fps, frameMs: s.frameMs, calls: s.calls, rttMs: s.rttMs })), timing: server.timing }));
    if (world === 0) await pages[0].screenshot({ path: `${dir}/${label}.png` });
  }
  const report = { url, label, players: count, viewport: '1280x720', measuredAt: new Date().toISOString(), gpu: gpu.gpu, results, errors };
  await writeFile(`${dir}/${label}.json`, JSON.stringify(report, null, 2));
  if (errors.length) throw new Error(errors.join('\n'));
} catch (e) { console.error('page errors', errors); throw e; } finally { await browser.close(); }
