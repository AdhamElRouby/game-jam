// Graphics quality presets (Esc menu, ?q=low|medium|high) and the pixel-ratio policy. Everything switches live.
//   high:   full look: 4x MSAA HDR buffer, N8AO ambient occlusion, bloom, 2048 shadow map
//   medium: same look, cheaper: 2x MSAA, faster AO, a lower pixel budget
//   low:    no post-processing (scene straight to the screen), 1024 shadow map, the lowest pixel budget
// The drawing buffer never exceeds the preset's pixel ratio cap nor its pixel budget (a Retina laptop or a 4K monitor
// would otherwise draw 5-8 million pixels per frame through every post pass). On top of that the adaptive resolution
// (adaptive.ts) scales it down a notch or two while a machine can't keep up.
export type Quality = 'high' | 'medium' | 'low';

export interface Preset {
  /** pixel ratio cap */
  dpr: number;
  /** drawing-buffer pixel budget */
  pixels: number;
  /** post-processing chain on (HDR buffer, AO, bloom, grading) */
  post: boolean;
  /** MSAA samples of the HDR buffer */
  msaa: number;
  /** N8AO quality mode, null = off */
  ao: 'medium' | 'performance' | null;
  bloom: boolean;
  shadow: number;
}

export const PRESETS: Record<Quality, Preset> = {
  high: { dpr: 1.5, pixels: 3.9e6, post: true, msaa: 4, ao: 'medium', bloom: true, shadow: 2048 },
  medium: { dpr: 1.25, pixels: 2.3e6, post: true, msaa: 2, ao: 'performance', bloom: true, shadow: 2048 },
  low: { dpr: 1, pixels: 1.6e6, post: false, msaa: 0, ao: null, bloom: false, shadow: 1024 },
};

function initial(): Quality {
  const url = new URLSearchParams(location.search).get('q');
  if (url === 'low' || url === 'medium' || url === 'high') return url;
  const saved = localStorage.getItem('sh_quality');
  if (saved === 'low' || saved === 'medium' || saved === 'high') return saved;
  // the recommended preset: the full look at a pixel budget a typical laptop GPU (or three windows on one) can carry
  return 'medium';
}

type Listener = (q: Quality) => void;
const listeners = new Set<Listener>();

/** Live-switchable preset (menu): post-processing, pixel ratio and shadow resolution follow it without a reload. */
export const quality = {
  level: initial(),
  set(q: Quality) {
    localStorage.setItem('sh_quality', q);
    quality.level = q;
    listeners.forEach((f) => f(q));
  },
  on(f: Listener) {
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  },
};

const params = new URLSearchParams(location.search);
/** Look-dev / profiling overrides (?tm=agx|neutral|aces&exp=1.1&ao=0&bloom=0&dpr=1.5&msaa=0&aoq=performance). */
export const lookDev = {
  tm: params.get('tm'),
  exp: params.has('exp') ? Number(params.get('exp')) : null,
  ao: params.get('ao') !== '0',
  bloom: params.get('bloom') !== '0',
  env: params.has('env') ? Number(params.get('env')) : null,
  sat: params.has('sat') ? Number(params.get('sat')) : null,
  /** fixed pixel ratio (no budget, no adaptive scaling) */
  dpr: params.has('dpr') ? Number(params.get('dpr')) : null,
  msaa: params.has('msaa') ? Number(params.get('msaa')) : null,
  aa: params.has('aa') ? params.get('aa') !== '0' : null,
  aoq: params.get('aoq') as Preset['ao'] | 'off' | null,
  /** ?aoup=0: N8AO without depth-aware upsampling */
  aoUp: params.get('aoup') !== '0',
  /** ?aotr=1: N8AO's transparency-aware mode (two extra scene renders a frame) */
  aoTransparency: params.get('aotr') === '1',
  /** ?adaptive=0: never scale the resolution automatically */
  adaptive: params.get('adaptive') !== '0',
};

/** Resolution scale chosen by the adaptive controller (1 = the preset's full pixel ratio). */
export const renderScale = { value: 1 };

/** Pixel ratio for preset `q` in the current window: the cap, the pixel budget, the screen, the adaptive scale. */
export function pixelRatio(q: Quality = quality.level): number {
  if (lookDev.dpr) return lookDev.dpr;
  const P = PRESETS[q];
  const css = Math.max(1, window.innerWidth * window.innerHeight);
  const want = Math.min(P.dpr, Math.sqrt(P.pixels / css), window.devicePixelRatio || 1);
  // the budget alone never goes below one pixel per CSS pixel (blurry); only the adaptive scale does
  const base = Math.max(Math.min(1, window.devicePixelRatio || 1), want);
  return Math.round(base * renderScale.value * 100) / 100;
}

(window as any).__SH_QUALITY = quality;
