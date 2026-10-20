// Readable 3/4 follow camera (team centroid biased to the artifact), cinematic menu and ending cameras.
import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { frame } from './frame';
import { useGame } from '../app/store';
import { LEVEL } from '../shared/level';
import { currentHint } from './objective';

export const camFocus = new THREE.Vector3(0, 0, 0);
export const camRef: { current: THREE.PerspectiveCamera | null } = { current: null };

const PITCH = (41 * Math.PI) / 180;

export function CameraRig() {
  const { camera, size } = useThree();
  const screen = useGame((s) => s.screen);
  const cutscene = useGame((s) => s.cutscene);
  const st = useRef({
    pos: new THREE.Vector3(2.2, 4.8, 13.5),
    look: new THREE.Vector3(0.2, 2.4, -8),
    dist: 20,
    init: false,
    cutT: 0,
    mode: '',
  });
  const tmp = useRef({ focus: new THREE.Vector3(), target: new THREE.Vector3(), look: new THREE.Vector3() }).current;

  useFrame((state, dtRaw) => {
    const dt = Math.min(0.05, dtRaw);
    const S = st.current;
    const t = state.clock.elapsedTime;
    const cam = camera as THREE.PerspectiveCamera;
    camRef.current = cam;
    const mode = screen !== 'game' ? 'menu' : cutscene ? 'cut' : 'follow';
    if (mode !== S.mode) {
      if (mode === 'cut') S.cutT = 0;
      S.mode = mode;
    }
    const aspect = size.width / Math.max(1, size.height);
    if (mode === 'menu') {
      // gentle cinematic drift over the loading dock toward the castle
      tmp.target.set(2.6 + Math.sin(t * 0.13) * 1.6, 5.4 + Math.sin(t * 0.21) * 0.35, 15.2 + Math.sin(t * 0.09) * 0.8);
      tmp.look.set(0.2 + Math.sin(t * 0.11) * 0.6, 2.4, -8);
      S.pos.lerp(tmp.target, 1 - Math.exp(-1.2 * dt));
      S.look.lerp(tmp.look, 1 - Math.exp(-1.2 * dt));
      camFocus.set(0, 0, -6);
    } else if (mode === 'cut') {
      S.cutT += dt;
      const G = LEVEL.goal.p;
      const k = Math.min(1, S.cutT / 2.2);
      const e = k * k * (3 - 2 * k);
      tmp.target.set(G[0] + 4 - e * 1.6 + Math.sin(S.cutT * 0.3) * 0.8, G[1] + 6.2 - e * 1.4, G[2] + 13 - e * 4.2);
      tmp.look.set(G[0] + 0.5, G[1] + 1.5, G[2] - 5.5);
      S.pos.lerp(tmp.target, 1 - Math.exp(-2.2 * dt));
      S.look.lerp(tmp.look, 1 - Math.exp(-2.5 * dt));
      camFocus.set(G[0], G[1], G[2] - 4);
    } else {
      const f = frame.current;
      const you = useGame.getState().lobby?.you ?? -1;
      const a = f.artifact;
      // bounding box of everything important (artifact + couriers near the action)
      let minX = a.x - 1.5, maxX = a.x + 1.5, minZ = a.z - 1.5, maxZ = a.z + 1.5;
      let wy = a.y * 1.5, wsum = 1.5;
      for (const p of f.players) {
        if (Math.abs(p.y - a.y) > 12 && p.slot !== you) continue; // ignore someone far below (respawning)
        minX = Math.min(minX, p.x - 0.8);
        maxX = Math.max(maxX, p.x + 0.8);
        minZ = Math.min(minZ, p.z - 0.8);
        maxZ = Math.max(maxZ, p.z + 0.8);
        const w = p.slot === you ? 1.3 : 0.6;
        wy += (p.y - 0.6) * w;
        wsum += w;
      }
      // frame the current objective too (a gentle camera callout) when it is near the team
      const h = currentHint();
      if (h && Math.hypot(h.x - a.x, h.z - a.z) < 16) {
        minX = Math.min(minX, h.x - 1);
        maxX = Math.max(maxX, h.x + 1);
        minZ = Math.min(minZ, h.z - (h.y > 3 ? 3.5 : 1));
        maxZ = Math.max(maxZ, h.z + 0.5);
        wy = wy + Math.max(0, h.y - 2.5) * 0.9;
      }
      // center: bbox center pulled toward the artifact, a little look-ahead along the course (-Z)
      const cx = (minX + maxX) / 2 * 0.7 + a.x * 0.3;
      const cz = (minZ + maxZ) / 2 * 0.7 + a.z * 0.3 - 1.2;
      tmp.focus.set(cx, wy / wsum, cz);
      const halfX = (maxX - minX) / 2 + 2.5;
      const halfZ = (maxZ - minZ) / 2 + 2.5;
      const vf = ((cam.fov * Math.PI) / 180) / 2;
      const hf = Math.atan(Math.tan(vf) * aspect);
      const needH = halfX / Math.tan(hf);
      const needV = (halfZ * Math.sin(PITCH)) / Math.tan(vf) + halfZ * Math.cos(PITCH) * 0.3;
      const want = Math.min(42, Math.max(18, needH, needV));
      S.dist += (want - S.dist) * (1 - Math.exp(-2.2 * dt));
      if (!S.init) {
        S.init = true;
        camFocus.copy(tmp.focus);
        S.dist = want;
      }
      camFocus.lerp(tmp.focus, 1 - Math.exp(-4 * dt));
      tmp.target.set(camFocus.x, camFocus.y + S.dist * Math.sin(PITCH), camFocus.z + S.dist * Math.cos(PITCH));
      tmp.look.set(camFocus.x, camFocus.y + 0.4, camFocus.z);
      S.pos.lerp(tmp.target, 1 - Math.exp(-5 * dt));
      S.look.lerp(tmp.look, 1 - Math.exp(-6 * dt));
    }
    cam.position.copy(S.pos);
    cam.lookAt(S.look);
    const fov = mode === 'follow' ? 40 : 45;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov += (fov - cam.fov) * (1 - Math.exp(-3 * dt));
      cam.updateProjectionMatrix();
    }
  });
  return null;
}
