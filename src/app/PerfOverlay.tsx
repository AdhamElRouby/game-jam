// Development performance overlay: F3 toggles it in dev builds (or anywhere with ?perf in the URL). Off by default and
// absent for players. Numbers only where they are measured: frame timing and main-thread time from the frame loop,
// draw calls / triangles summed over every pass of a frame, heap only where the browser reports it, network from the
// client's own clocks, the physics from the server (sent once a second while the overlay is open). The GPU's own time
// is not shown: browsers don't report it reliably.
import { useEffect, useRef, useState } from 'react';
import { addAfterEffect, addEffect } from '@react-three/fiber';
import type { WebGLRenderer } from 'three';
import { net } from '../net/net';
import { useGame } from './store';
import { input } from '../net/input';
import { adaptive } from '../render/FrameRate';
import { pixelRatio, quality } from '../render/quality';
import { prediction } from '../render/predict';

const N = 120;

export function PerfOverlay() {
  const dev = useGame((s) => !!s.lobby?.dev);
  const allowed = dev || new URLSearchParams(location.search).has('perf');
  const [on, setOn] = useState(() => new URLSearchParams(location.search).has('perf'));
  const el = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (!allowed) return;
    const off = input.onKey((code) => {
      if (code === 'F3') setOn((v) => !v);
    });
    return () => {
      off();
    };
  }, [allowed]);

  useEffect(() => {
    if (!on || !allowed) return;
    const gl = (window as any).__SH_GL as WebGLRenderer | undefined;
    const dts = new Float32Array(N);
    const cpu = new Float32Array(N);
    let i = 0;
    let n = 0;
    let start = 0;
    let lastFrame = 0;
    let calls = 0;
    let tris = 0;
    let frames = 0;
    let fpsAt = performance.now();
    let fps = 0;
    const corr: number[] = [];
    let snaps = prediction.snaps;
    if (gl) gl.info.autoReset = false;
    net.subscribePerf(true);
    const offBefore = addEffect(() => {
      start = performance.now();
      if (lastFrame) dts[i] = start - lastFrame;
      lastFrame = start;
      gl?.info.reset();
    });
    const offAfter = addAfterEffect(() => {
      cpu[i] = performance.now() - start;
      i = (i + 1) % N;
      n = Math.min(N, n + 1);
      frames++;
      if (gl) {
        calls = gl.info.render.calls;
        tris = gl.info.render.triangles;
      }
      if (prediction.snaps !== snaps) {
        snaps = prediction.snaps;
        corr.push(prediction.lastCorrection);
        if (corr.length > 90) corr.shift();
      }
    });
    const pct = (a: Float32Array, p: number) => {
      const s = Array.from(a.subarray(0, n)).sort((x, y) => x - y);
      return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0;
    };
    const f1 = (x: number) => x.toFixed(1);
    const timer = setInterval(() => {
      const now = performance.now();
      fps = (frames * 1000) / (now - fpsAt);
      frames = 0;
      fpsAt = now;
      const mem = (performance as any).memory;
      const sp = net.serverPerf;
      const c = [...corr].sort((a, b) => a - b);
      const lines = [
        `FPS ${f1(fps)}   frame p50 ${f1(pct(dts, 0.5))} p95 ${f1(pct(dts, 0.95))} max ${f1(pct(dts, 1))} ms`,
        `main thread ${f1(pct(cpu, 0.5))} / ${f1(pct(cpu, 0.95))} ms (p50/p95)`,
        `draw calls ${calls}   triangles ${(tris / 1e6).toFixed(2)} M`,
        gl ? `geometries ${gl.info.memory.geometries}   textures ${gl.info.memory.textures}   programs ${gl.info.programs?.length ?? 0}` : '',
        mem ? `JS heap ${(mem.usedJSHeapSize / 1e6).toFixed(0)} / ${(mem.totalJSHeapSize / 1e6).toFixed(0)} MB` : 'JS heap: not reported by this browser',
        `${quality.level}  pixel ratio ${pixelRatio().toFixed(2)}  scale ${Math.round(adaptive.scale * 100)}%${adaptive.throttled ? '  (unfocused: 30 fps)' : ''}`,
        `ping ${f1(net.rtt)} ms   snapshots ${f1(net.snapRate)}/s   jitter ${f1(net.jitter)} ms`,
        `interp delay ${Math.round(net.remoteDelay)} ms (own unpredicted ${Math.round(net.localDelay)})`,
        `prediction ${prediction.mode}   correction p95 ${c.length ? (c[Math.floor(c.length * 0.95)] * 100).toFixed(1) : '0'} cm   replay ${prediction.replayed} ticks`,
        sp
          ? `server tick ${sp.tickHz} Hz  physics ${sp.simHz} Hz  step ${sp.stepMs.toFixed(2)} ms (max ${sp.stepMaxMs.toFixed(2)})`
          : 'server: waiting for numbers…',
        sp ? `server snapshot ${sp.snapHz}/s  ${sp.snapBytes} B   bodies ${sp.bodies}  colliders ${sp.colliders}` : '',
      ];
      if (el.current) el.current.textContent = lines.filter(Boolean).join('\n');
    }, 250);
    return () => {
      offBefore();
      offAfter();
      clearInterval(timer);
      if (gl) gl.info.autoReset = true;
      net.subscribePerf(false);
    };
  }, [on, allowed]);

  if (!on || !allowed) return null;
  return <pre ref={el} className="perf-overlay" />;
}
