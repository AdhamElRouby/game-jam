// Shared page-side frame / network probe for the profiling scripts (profile.ts, profile-three.ts).
// PROBE_INIT goes in before the app's scripts (context.addInitScript): every rAF callback is timed and grouped by its
// frame timestamp. installNetProbe adds snapshot sizes / arrival times and per-frame samples of your own courier.
import type { Page } from 'playwright';

export const PROBE_INIT = `(() => {
  const P = window.__PROF = { on: false, ts: [], cpu: [], heap: [], snapT: [], snapAt: [], snapBytes: [], evBytes: 0, evCount: 0, me: [], starve: 0, frames: 0, longTasks: [], corr: [] };
  const raf = window.requestAnimationFrame.bind(window);
  let curTs = -1, cpu = 0;
  const flush = () => {
    if (curTs < 0 || !P.on) return;
    P.ts.push(curTs); P.cpu.push(cpu);
    const m = performance.memory; if (m) P.heap.push(m.usedJSHeapSize);
  };
  window.requestAnimationFrame = (cb) => raf((ts) => {
    if (ts !== curTs) { flush(); curTs = ts; cpu = 0; }
    const t0 = performance.now();
    try { cb(ts); } finally { cpu += performance.now() - t0; }
  });
  try {
    new PerformanceObserver((l) => { if (P.on) for (const e of l.getEntries()) P.longTasks.push(Math.round(e.duration)); }).observe({ entryTypes: ['longtask'] });
  } catch {}
})()`;

export async function installNetProbe(page: Page) {
  await page.evaluate(`(() => {
    const P = window.__PROF, net = window.__SH_NET;
    net.socket.io.engine.on('packet', (p) => {
      if (!P.on || p.type !== 'message' || typeof p.data !== 'string') return;
      if (p.data.startsWith('2["snap"')) { P.snapBytes.push(p.data.length); P.snapAt.push(performance.now()); }
      else if (p.data.startsWith('2["ev"')) { P.evBytes += p.data.length; P.evCount++; }
    });
    net.socket.on('snap', (s) => { if (P.on) P.snapT.push(s.t); });
    const tick = () => {
      if (P.on) {
        const f = window.__SH_FRAME && window.__SH_FRAME.current;
        const you = net.lobby ? net.lobby.you : -1;
        const me = f && f.players.find((p) => p.slot === you);
        if (me) P.me.push([performance.now(), me.x, me.y, me.z, Math.hypot(me.vx, me.vz)]);
        // "starved": the render time for your own courier is past the newest snapshot (it freezes on it)
        const st = net.localStarved ? net.localStarved() : null;
        if (st !== null) { if (st) P.starve++; P.frames++; }
        const pr = window.__SH_PRED;
        if (pr && pr.snaps !== P.lastSnaps) { P.lastSnaps = pr.snaps; P.corr.push(pr.lastCorrection); }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  })()`);
}

/** Start sampling; the courier walks in circles (~3 m radius) and the camera sweeps left and right. */
export async function startMeasure(page: Page, opts: { turn?: boolean; phase?: number } = {}) {
  await page.evaluate(`(() => {
    const P = window.__PROF;
    Object.assign(P, { ts: [], cpu: [], heap: [], snapT: [], snapAt: [], snapBytes: [], evBytes: 0, evCount: 0, me: [], starve: 0, frames: 0, longTasks: [], corr: [] });
    P.on = true;
    const t0 = performance.now();
    P.drive = setInterval(() => {
      const t = (performance.now() - t0) / 1000;
      const a = t * 1.8 + ${opts.phase ?? 0};
      window.__SH_INPUT.override = { mx: Math.cos(a), mz: Math.sin(a), grab: false };
      if (${opts.turn !== false} && window.__SH_LOOK) window.__SH_LOOK.turn(Math.sin(t * 0.9) * 6, 0);
    }, 16);
  })()`);
}

export async function stopMeasure(page: Page) {
  const raw = (await page.evaluate(`(() => {
    const P = window.__PROF; P.on = false; clearInterval(P.drive); window.__SH_INPUT.override = { mx: 0, mz: 0, grab: false };
    return JSON.stringify(P);
  })()`)) as string;
  const gl = (await page.evaluate(`new Promise((res) => {
    const gl = window.__SH_GL; gl.info.autoReset = false; gl.info.reset();
    requestAnimationFrame(() => { const o = { calls: gl.info.render.calls, tris: gl.info.render.triangles, geos: gl.info.memory.geometries, tex: gl.info.memory.textures }; gl.info.autoReset = true; res(o); });
  })`)) as { calls: number; tris: number; geos: number; tex: number };
  return { P: JSON.parse(raw), gl };
}

const pct = (a: number[], p: number) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const r1 = (x: number) => Math.round(x * 10) / 10;

export interface Row {
  spot: string;
  fps: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  over20: number;
  over33: number;
  cpu50: number;
  cpu95: number;
  allocMBs: number;
  gcs: number;
  longTasks: number;
  calls: number;
  tris: number;
  geos: number;
  tex: number;
  snapB: number;
  snapGap95: number;
  snapGapMax: number;
  starve: number;
  meJitter: number;
  meFreeze: number;
  corr95: number;
}

export function summarize(spot: string, { P, gl }: Awaited<ReturnType<typeof stopMeasure>>): Row {
  const dts: number[] = [];
  for (let i = 1; i < P.ts.length; i++) dts.push(P.ts[i] - P.ts[i - 1]);
  // heap: sum of increases = allocation; a drop of > 200 KB = a GC
  let alloc = 0;
  let gcs = 0;
  for (let i = 1; i < P.heap.length; i++) {
    const d = P.heap[i] - P.heap[i - 1];
    if (d > 0) alloc += d;
    else if (d < -200_000) gcs++;
  }
  const span = (P.ts[P.ts.length - 1] - P.ts[0]) / 1000 || 1;
  const gaps: number[] = [];
  for (let i = 1; i < P.snapAt.length; i++) gaps.push(P.snapAt[i] - P.snapAt[i - 1]);
  // own courier on screen: per-frame speed vs its smoothed speed (stutter), frames frozen while it should move
  const sp: number[] = [];
  let freeze = 0;
  let moving = 0;
  for (let i = 1; i < P.me.length; i++) {
    const [t0, x0, , z0] = P.me[i - 1];
    const [t1, x1, , z1, v] = P.me[i];
    const dt = (t1 - t0) / 1000;
    if (dt <= 0) continue;
    const s = Math.hypot(x1 - x0, z1 - z0) / dt;
    if (v > 2 && s < 20) {
      moving++;
      sp.push(s);
      if (s < 0.25 * v) freeze++;
    }
  }
  let jit = 0;
  if (sp.length > 4) {
    let sum = 0;
    for (let i = 2; i < sp.length - 2; i++) {
      const avg = (sp[i - 2] + sp[i - 1] + sp[i] + sp[i + 1] + sp[i + 2]) / 5;
      sum += Math.abs(sp[i] - avg) / Math.max(0.5, avg);
    }
    jit = sum / (sp.length - 4);
  }
  return {
    spot,
    fps: Math.round(dts.length / span),
    p50: r1(pct(dts, 50)),
    p95: r1(pct(dts, 95)),
    p99: r1(pct(dts, 99)),
    max: r1(Math.max(0, ...dts)),
    over20: dts.filter((d) => d > 20).length,
    over33: dts.filter((d) => d > 33.4).length,
    cpu50: r1(pct(P.cpu, 50)),
    cpu95: r1(pct(P.cpu, 95)),
    allocMBs: r1(alloc / span / 1e6),
    gcs,
    longTasks: P.longTasks.length,
    calls: gl.calls,
    tris: gl.tris,
    geos: gl.geos,
    tex: gl.tex,
    snapB: Math.round(P.snapBytes.reduce((a: number, b: number) => a + b, 0) / Math.max(1, P.snapBytes.length)),
    snapGap95: r1(pct(gaps, 95)),
    snapGapMax: r1(Math.max(0, ...gaps)),
    starve: Math.round((100 * P.starve) / Math.max(1, P.frames)),
    meJitter: Math.round(jit * 100),
    meFreeze: Math.round((100 * freeze) / Math.max(1, moving)),
    corr95: Math.round(pct(P.corr, 95) * 1000) / 1000,
  };
}

export function fmt(r: Row) {
  return (
    `${r.spot.padEnd(7)} fps ${String(r.fps).padStart(3)}  frame p50 ${r.p50} p95 ${r.p95} p99 ${r.p99} max ${r.max} (>20ms ${r.over20}, >33ms ${r.over33})  ` +
    `js p50 ${r.cpu50} p95 ${r.cpu95}  alloc ${r.allocMBs} MB/s gc ${r.gcs} long ${r.longTasks}  calls ${r.calls} tris ${(r.tris / 1e6).toFixed(2)}M  ` +
    `snap ${r.snapB} B gap95 ${r.snapGap95} max ${r.snapGapMax}  starved ${r.starve}%  me jitter ${r.meJitter}% freeze ${r.meFreeze}%` +
    (r.corr95 ? `  corr95 ${r.corr95} m` : '')
  );
}

export function average(rows: Row[], label = 'AVG') {
  const avg = (k: keyof Row) => r1(rows.reduce((a, r) => a + (r[k] as number), 0) / Math.max(1, rows.length));
  const sum = (k: keyof Row) => rows.reduce((a, r) => a + (r[k] as number), 0);
  return (
    `${label.padEnd(7)} fps ${avg('fps')}  p50 ${avg('p50')} p95 ${avg('p95')} p99 ${avg('p99')} worst ${Math.max(...rows.map((r) => r.max))}  ` +
    `>33ms ${sum('over33')}  js p50 ${avg('cpu50')} p95 ${avg('cpu95')}  alloc ${avg('allocMBs')} MB/s  calls ${avg('calls')}  starved ${avg('starve')}%  me jitter ${avg('meJitter')}% freeze ${avg('meFreeze')}%`
  );
}
