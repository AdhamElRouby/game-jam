// Current objective point-of-interest, shared by world hints and the camera.
import { frame } from './frame';
import { LEVEL } from '../shared/level';

export interface Hint {
  x: number;
  y: number;
  z: number;
  text: string;
}

/** The single most relevant world-space callout for the team's current objective. */
export function currentHint(): Hint | null {
  const f = frame.current;
  if (!frame.live) return null;
  const w = f.w;
  const cp = f.latest.cp;
  const a = f.artifact;
  if (f.latest.ph !== 'playing') return null;
  if (w.gate <= 0) {
    const P = LEVEL.plate.p;
    return { x: P[0], y: 1.6, z: P[2], text: w.plate > 0.02 ? `Plate ${Math.round(w.plate * 100)}%` : 'Park it here' };
  }
  if (cp < 1 && a.z > -27) return { x: 0, y: 4.6, z: -25, text: 'LONG only' };
  if (cp >= 1 && w.bridge <= 0 && a.z < -41) {
    const R = LEVEL.receiver.p;
    return { x: R[0], y: 1.8, z: R[2], text: w.recv > 0.02 ? `Slotting ${Math.round(w.recv * 100)}%` : 'LONG slot' };
  }
  if (cp >= 2 && w.lever <= 0 && a.z < -83) {
    const L = LEVEL.lever.p;
    return { x: L[0], y: L[1] + 1.9, z: L[2] + 0.5, text: 'TALL lever' };
  }
  if (w.lift === 1) {
    const L = LEVEL.lift;
    return { x: L.cx, y: w.liftY + 3.2, z: L.cz, text: `Aboard ${w.aboard}/3` };
  }
  if (cp >= 3) {
    const G = LEVEL.goal.p;
    if (Math.hypot(a.x - G[0], a.z - G[2]) < 26) return { x: G[0], y: 3.2, z: G[2], text: w.goal > 0.02 ? `Delivering ${Math.round(w.goal * 100)}%` : 'GOAL' };
  }
  return null;
}

