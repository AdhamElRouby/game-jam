// Cinematic three-quarter follow camera: frames the artifact, every courier and the next objective, with gentle adaptive zoom.
// Yaw stays fixed (W = -Z = up the screen); pitch and distance adapt per chapter and to the team's spread.
import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { frame } from './frame';
import { useGame } from '../app/store';
import { LEVEL, chapterAt } from '../shared/level';
import { shapeSpec } from '../shared/shapes';
import { currentHint } from './objective';

export const camFocus = new THREE.Vector3(0, 0, 0);
export const camRef: { current: THREE.PerspectiveCamera | null } = { current: null };
/** Current framing (read by the shadow light so its frustum matches what is on screen). */
export const camView = { dist: 16, pitch: 41 };

const shake = { amp: 0 };
/** Test hook: window.__SH_CAM = { pos: [x,y,z], look: [x,y,z] } pins the camera for look-dev screenshots. */
const debugCam = ((window as any).__SH_CAM_STATE = { pos: null as number[] | null, look: null as number[] | null });
(window as any).__SH_CAM = (pos: number[] | null, look?: number[]) => {
  debugCam.pos = pos;
  debugCam.look = look ?? null;
};
/** Small, quickly-decaying camera shake for heavy moments (gate slam, drop, delivery). */
export function shakeCamera(amount: number) {
  shake.amp = Math.min(0.6, Math.max(shake.amp, amount));
}

interface ChapterCam {
  pitch: number; // degrees above the horizon when zoomed in
  lift: number; // extra pitch when fully zoomed out
  near: number; // closest distance
  far: number; // widest distance
  ahead: number; // look-ahead along the course (-Z), metres
  fov: number;
}

// Ch1 dock, Ch2 wind cliffs (wider for the gap + catwalk), Ch3 tower (lower to read the wall lever), Ch4 downhill (higher to see the slopes).
const CHAPTER_CAM: ChapterCam[] = [
  { pitch: 38, lift: 7, near: 12.5, far: 27, ahead: 3.2, fov: 46 },
  { pitch: 40, lift: 7, near: 12.5, far: 29, ahead: 3.0, fov: 46 },
  { pitch: 35, lift: 7, near: 12.5, far: 28, ahead: 1.6, fov: 46 },
  { pitch: 42, lift: 6, near: 12.5, far: 30, ahead: 4.5, fov: 46 },
];

// Safe area for subjects (fraction of the half-frame): keeps them clear of the HUD at top and bottom.
const SAFE_X = 0.8;
const SAFE_TOP = 0.74;
const SAFE_BOTTOM = 0.7;

const D2R = Math.PI / 180;

interface Pt {
  x: number;
  y: number;
  z: number;
  r: number;
  soft?: boolean;
}

/** Minimum distance along the view axis so every point (with radius) fits inside the safe frustum. */
function fitDistance(pts: Pt[], f: THREE.Vector3, pitch: number, fov: number, aspect: number, maxD: number) {
  const sp = Math.sin(pitch), cp = Math.cos(pitch);
  const tanV = Math.tan((fov * D2R) / 2);
  const tanH = tanV * aspect;
  let need = 0;
  for (const p of pts) {
    const qx = p.x - f.x, qy = p.y - f.y, qz = p.z - f.z;
    const x = qx;
    const y = qy * cp - qz * sp; // camera up = (0, cos p, -sin p)
    const z = -qy * sp - qz * cp; // camera forward = (0, -sin p, -cos p)
    const d = Math.max((Math.abs(x) + p.r) / (tanH * SAFE_X), (y + p.r) / (tanV * SAFE_TOP), (-y + p.r) / (tanV * SAFE_BOTTOM)) - z;
    if (p.soft && d > maxD) continue; // nice-to-have points never force the camera past its limit
    need = Math.max(need, d);
  }
  return need;
}

export function CameraRig() {
  const { camera, size } = useThree();
  const screen = useGame((s) => s.screen);
  const cutscene = useGame((s) => s.cutscene);
  const st = useRef({
    pos: new THREE.Vector3(2.2, 4.8, 13.5),
    look: new THREE.Vector3(0.2, 2.4, -8),
    focus: new THREE.Vector3(),
    dist: 16,
    pitch: 40,
    ch: { ...CHAPTER_CAM[0] },
    init: false,
    cutT: 0,
    mode: '',
  });
  const tmp = useRef({ target: new THREE.Vector3(), look: new THREE.Vector3(), focus: new THREE.Vector3() }).current;
  const pts = useRef<Pt[]>([]).current;

  useFrame((state, dtRaw) => {
    const dt = Math.min(0.05, dtRaw);
    const S = st.current;
    const t = state.clock.elapsedTime;
    const cam = camera as THREE.PerspectiveCamera;
    camRef.current = cam;
    const mode = screen !== 'game' ? 'menu' : cutscene ? 'cut' : 'follow';
    if (mode !== S.mode) {
      if (mode === 'cut') S.cutT = 0;
      if (mode === 'follow') S.init = false;
      S.mode = mode;
    }
    const aspect = size.width / Math.max(1, size.height);
    let fov = 44;
    if (mode === 'menu') {
      // slow cinematic drift: couriers and artifact in front, the islands and castle beyond
      tmp.target.set(3.4 + Math.sin(t * 0.13) * 1.4, 4.3 + Math.sin(t * 0.21) * 0.3, 13.6 + Math.sin(t * 0.09) * 0.7);
      tmp.look.set(0.4 + Math.sin(t * 0.11) * 0.5, 1.9, -6);
      S.pos.lerp(tmp.target, 1 - Math.exp(-1.2 * dt));
      S.look.lerp(tmp.look, 1 - Math.exp(-1.2 * dt));
      camFocus.set(0, 0, -4);
      camView.dist = 16;
      fov = 46;
    } else if (mode === 'cut') {
      S.cutT += dt;
      const G = LEVEL.goal.p;
      const k = Math.min(1, S.cutT / 2.2);
      const e = k * k * (3 - 2 * k);
      tmp.target.set(G[0] + 4 - e * 1.6 + Math.sin(S.cutT * 0.3) * 0.8, G[1] + 5.6 - e * 1.6, G[2] + 12.5 - e * 4.4);
      tmp.look.set(G[0] + 0.5, G[1] + 2.0, G[2] - 5.5);
      S.pos.lerp(tmp.target, 1 - Math.exp(-2.2 * dt));
      S.look.lerp(tmp.look, 1 - Math.exp(-2.5 * dt));
      camFocus.set(G[0], G[1], G[2] - 4);
      camView.dist = 14;
      fov = 46;
    } else {
      const f = frame.current;
      const you = useGame.getState().lobby?.you ?? -1;
      const a = f.artifact;
      const spec = shapeSpec(a.shape);
      const aR = spec.ball ? spec.half[0] : Math.max(spec.half[0], spec.half[1], spec.half[2]);
      // per-chapter tuning, blended so chapter changes never snap
      const target = CHAPTER_CAM[chapterAt(a.z, f.latest.cp)];
      const kc = 1 - Math.exp(-1.4 * dt);
      for (const k of Object.keys(target) as (keyof ChapterCam)[]) S.ch[k] += (target[k] - S.ch[k]) * (S.init ? kc : 1);
      const C = S.ch;
      // subjects: artifact + couriers near the action (ignore a far-away respawner unless it is you)
      pts.length = 0;
      pts.push({ x: a.x, y: a.y, z: a.z, r: aR + 0.4 });
      let minX = a.x, maxX = a.x, minZ = a.z, maxZ = a.z;
      let wy = a.y * 1.6, wsum = 1.6, wx = a.x * 1.6, wz = a.z * 1.6;
      for (const p of f.players) {
        const mine = p.slot === you;
        if (!mine && (Math.abs(p.y - a.y) > 10 || Math.hypot(p.x - a.x, p.z - a.z) > 26)) continue;
        if (p.respawning && !mine) continue;
        pts.push({ x: p.x, y: p.y + 0.1, z: p.z, r: 1.05 });
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minZ = Math.min(minZ, p.z);
        maxZ = Math.max(maxZ, p.z);
        const w = mine ? 1.2 : 0.7;
        wy += (p.y - 0.3) * w;
        wx += p.x * w;
        wz += p.z * w;
        wsum += w;
      }
      // the next objective, when it is close, is framed too (never at the cost of losing the team)
      const h = currentHint();
      let hy = 0;
      if (h && Math.hypot(h.x - a.x, h.z - a.z) < 17) {
        pts.push({ x: h.x, y: h.y - 0.6, z: h.z, r: 1.0, soft: true });
        hy = Math.max(0, h.y - 2.6) * 0.5;
      }
      // look-ahead along the course, biased by where the artifact is heading
      const vz = Math.max(-6, Math.min(2, a.vz));
      const vx = Math.max(-4, Math.min(4, a.vx));
      pts.push({ x: a.x + vx * 0.3, y: a.y, z: a.z - C.ahead - Math.max(0, -vz) * 0.4, r: 1.5, soft: true });
      const cx = ((minX + maxX) / 2) * 0.55 + (wx / wsum) * 0.45 + vx * 0.12;
      const cz = ((minZ + maxZ) / 2) * 0.55 + (wz / wsum) * 0.45 - C.ahead * 0.35 + Math.min(0, vz) * 0.1;
      tmp.focus.set(cx, wy / wsum + hy, cz);
      if (!S.init) {
        S.focus.copy(tmp.focus);
      }
      // smooth the focus first, then fit the distance to the smoothed focus so subjects never slip out of frame
      S.focus.x += (tmp.focus.x - S.focus.x) * (1 - Math.exp(-3.4 * dt));
      S.focus.z += (tmp.focus.z - S.focus.z) * (1 - Math.exp(-3.4 * dt));
      S.focus.y += (tmp.focus.y - S.focus.y) * (1 - Math.exp(-2.4 * dt));
      fov = C.fov;
      const zoom = Math.min(1, Math.max(0, (S.dist - C.near) / (C.far - C.near)));
      const wantPitch = C.pitch + C.lift * zoom;
      S.pitch += (wantPitch - S.pitch) * (S.init ? 1 - Math.exp(-2 * dt) : 1);
      const need = fitDistance(pts, S.focus, S.pitch * D2R, fov, aspect, C.far);
      const want = Math.min(C.far, Math.max(C.near, need));
      if (!S.init) S.dist = want;
      // zoom out quickly (never lose anyone), settle back in slowly
      const rate = want > S.dist ? 3.2 : 1.1;
      S.dist += (want - S.dist) * (1 - Math.exp(-rate * dt));
      S.init = true;
      camFocus.copy(S.focus);
      const p = S.pitch * D2R;
      tmp.target.set(S.focus.x, S.focus.y + S.dist * Math.sin(p), S.focus.z + S.dist * Math.cos(p));
      tmp.look.copy(S.focus);
      S.pos.lerp(tmp.target, 1 - Math.exp(-9 * dt));
      S.look.lerp(tmp.look, 1 - Math.exp(-10 * dt));
      camView.dist = S.dist;
      camView.pitch = S.pitch;
    }
    if (debugCam.pos && debugCam.look) {
      S.pos.set(debugCam.pos[0], debugCam.pos[1], debugCam.pos[2]);
      S.look.set(debugCam.look[0], debugCam.look[1], debugCam.look[2]);
      camFocus.copy(S.look);
    }
    cam.position.copy(S.pos);
    // shake: tiny, high-frequency, decays fast
    if (shake.amp > 0.002) {
      const s = shake.amp;
      cam.position.x += Math.sin(t * 57) * s * 0.5;
      cam.position.y += Math.sin(t * 71 + 1.3) * s * 0.4;
      shake.amp *= Math.exp(-7 * dt);
    } else shake.amp = 0;
    cam.lookAt(S.look);
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov += (fov - cam.fov) * (1 - Math.exp(-3 * dt));
      cam.updateProjectionMatrix();
    }
  });
  return null;
}
