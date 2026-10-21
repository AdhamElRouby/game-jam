// Frame-rate keepers.
//
// AdaptiveResolution: a machine that can't hold ~60 fps at the preset's resolution gets a slightly lower resolution
// (four steps, 100% .. 60%) instead of a stuttering game. Decisions use sustained measurements: the 90th percentile of
// frame intervals over 1.5 s windows; two slow windows in a row step down, eight smooth windows in a row (12 s) try one
// step back up, and a step up that turns out too much is undone and not retried for a while (20 s, doubling each time)
// so it never oscillates. Nothing is measured while the window isn't focused, right after a world change or a resize.
//
// BackgroundThrottle: a window that is visible but not focused (three couriers tried on one computer, or a game left
// open beside a chat) draws at 30 fps, leaving the GPU to the window being played. Focus brings 60 back at once.
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { lookDev, pixelRatio, renderScale } from './quality';
import { frame } from './frame';

const SCALES = [1, 0.85, 0.72, 0.6];
const WINDOW = 90;
const SLOW_MS = 19.5; // p90 above this: below ~51 fps most of the time
const SMOOTH_MS = 17.4; // p90 below this (and p99 below SMOOTH_P99): a steady 60

const SMOOTH_P99 = 21;

/** State for the perf overlay and tests. */
export const adaptive = { step: 0, scale: 1, p90: 0, p99: 0, throttled: false, changes: 0 };
(window as any).__SH_ADAPTIVE = adaptive;

/** Test hook: pretend this window lost focus (Playwright pages always report focus). */
const forceBlur = { on: false };
(window as any).__SH_BLUR = (on: boolean) => {
  forceBlur.on = on;
  window.dispatchEvent(new Event(on ? 'blur' : 'focus'));
};
const focused = () => !forceBlur.on && document.hasFocus();

export function AdaptiveResolution() {
  const setDpr = useThree((s) => s.setDpr);
  const S = useRef({ dts: [] as number[], last: 0, slow: 0, smooth: 0, settleUntil: 0, upAt: -1e9, fails: 0, blockedUntil: 0, map: -1 }).current;
  useEffect(() => {
    const settle = () => {
      S.dts.length = 0;
      S.settleUntil = performance.now() + 2500;
    };
    window.addEventListener('resize', settle);
    return () => window.removeEventListener('resize', settle);
  }, [S]);
  useFrame(() => {
    const now = performance.now();
    const dt = now - S.last;
    S.last = now;
    if (!lookDev.adaptive || lookDev.dpr) return;
    const map = frame.current.latest.mp ?? 0;
    if (map !== S.map) {
      S.map = map;
      S.settleUntil = now + 3000; // a world change loads and compiles: don't judge the machine by it
    }
    if (!focused() || document.hidden || adaptive.throttled || now < S.settleUntil || dt > 250) {
      S.dts.length = 0;
      return;
    }
    S.dts.push(dt);
    if (S.dts.length < WINDOW) return;
    const sorted = S.dts.sort((a, b) => a - b);
    const p90 = sorted[Math.floor(WINDOW * 0.9)];
    const p99 = sorted[WINDOW - 1];
    S.dts.length = 0;
    adaptive.p90 = p90;
    adaptive.p99 = p99;
    let step = adaptive.step;
    if (p90 > SLOW_MS) {
      S.smooth = 0;
      if (++S.slow >= 2 && step < SCALES.length - 1) {
        // a recent step up was too much: undo it and wait longer before trying again
        if (now - S.upAt < 9000) S.blockedUntil = now + Math.min(300_000, 20_000 * 2 ** S.fails++);
        step++;
      }
    } else if (p90 < SMOOTH_MS && p99 < SMOOTH_P99) {
      S.slow = 0;
      if (++S.smooth >= 8 && step > 0 && now > S.blockedUntil) {
        step--;
        S.upAt = now;
      }
    } else {
      S.slow = Math.max(0, S.slow - 1);
      S.smooth = 0;
    }
    if (step !== adaptive.step) {
      adaptive.step = step;
      adaptive.scale = renderScale.value = SCALES[step];
      adaptive.changes++;
      S.slow = S.smooth = 0;
      S.settleUntil = now + 2500;
      setDpr(pixelRatio());
    }
  }, -1000);
  return null;
}

export function BackgroundThrottle() {
  const get = useThree((s) => s.get);
  useEffect(() => {
    if (new URLSearchParams(location.search).get('bgfps') === '60') return;
    let raf = 0;
    let n = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      // every other display frame (R3F's clock still measures the real time between them)
      if (n++ % 2 === 0) get().advance(undefined as unknown as number);
    };
    const update = () => {
      const want = !focused() && !document.hidden;
      if (want === adaptive.throttled) return;
      adaptive.throttled = want;
      cancelAnimationFrame(raf);
      if (want) {
        get().setFrameloop('never');
        raf = requestAnimationFrame(loop);
      } else get().setFrameloop('always');
    };
    window.addEventListener('blur', update);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    update();
    return () => {
      window.removeEventListener('blur', update);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
      cancelAnimationFrame(raf);
      if (adaptive.throttled) get().setFrameloop('always');
      adaptive.throttled = false;
    };
  }, [get]);
  return null;
}
