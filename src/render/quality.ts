// Graphics quality preset: high (AO + bloom), medium (cheaper AO), low (no post-processing). ?q=low|medium|high overrides.
export type Quality = 'high' | 'medium' | 'low';

function initial(): Quality {
  const url = new URLSearchParams(location.search).get('q');
  if (url === 'low' || url === 'medium' || url === 'high') return url;
  const saved = localStorage.getItem('sh_quality');
  if (saved === 'low' || saved === 'medium' || saved === 'high') return saved;
  return 'high';
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
/** Look-dev overrides (?tm=agx|neutral|aces&exp=1.1&ao=0&bloom=0). */
export const lookDev = {
  tm: params.get('tm'),
  exp: params.has('exp') ? Number(params.get('exp')) : null,
  ao: params.get('ao') !== '0',
  bloom: params.get('bloom') !== '0',
  env: params.has('env') ? Number(params.get('env')) : null,
  sat: params.has('sat') ? Number(params.get('sat')) : null,
};
