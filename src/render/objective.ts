// Current objective point-of-interest, shared by world hints and the camera (from the active map's objective list).
import { frame } from './frame';
import { activeMap, mechState } from './mapState';

export interface Hint {
  x: number;
  y: number;
  z: number;
  text: string;
}

/** The single most relevant world-space callout for the team's current objective. */
export function currentHint(): Hint | null {
  const f = frame.current;
  if (!frame.live || f.latest.ph !== 'playing') return null;
  const map = activeMap();
  const ob = map.objectives[f.latest.ob ?? 0];
  const h = ob?.hint;
  if (!h) return null;
  let text = h.text;
  if (f.w.goal > 0.02) text = `Delivering ${Math.round(f.w.goal * 100)}%`;
  else if (h.progress) {
    const i = map.mechs.findIndex((m) => m.id === h.progress);
    const def = map.mechs[i];
    const s = mechState(i);
    if (def?.kind === 'lift') {
      const stage = Math.round(s[0] ?? 0);
      if (stage === 1) text = (s[4] ?? 0) > 0.02 ? `Cranking ${Math.round((s[4] ?? 0) * 100)}%` : `Aboard ${s[3] ?? 0}/3 · crank (Q)`;
    } else if ((s[0] ?? 0) > 0.02 && (s[0] ?? 0) < 1) text = `${text} ${Math.round((s[0] ?? 0) * 100)}%`;
  }
  return { x: h.p[0], y: h.p[1], z: h.p[2], text };
}
