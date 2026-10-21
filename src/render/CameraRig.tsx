// Each player's own camera. Third person: orbits your courier (mouse / touchpad turns it, scroll zooms) and is pulled in
// rather than pass through level geometry. Inside the artifact: first person from the pilot's seat with mouse look
// (V or scrolling out switches to a chase view of the artifact). Plus the menu drift and the ending cutscene.
// WASD follows the camera's heading: the rig publishes it as `input.camYaw`.
import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { frame } from './frame';
import { useGame } from '../app/store';
import { LEVEL } from '../shared/level';
import { PLAYER_CENTER_Y } from '../shared/constants';
import { ShapeId, shapeSpec } from '../shared/shapes';
import { input } from '../net/input';
import { look } from './look';
import { castCamera, insideSolid } from './camCollide';
import { activeMapIndex } from './mapState';
import { seeUniforms } from './seeThrough';

export type CamViewName = 'menu' | 'cut' | 'orbit' | 'fp' | 'chase';

/** What the camera looks at (shadow frustum centre, wall fading). */
export const camFocus = new THREE.Vector3(0, 0, 0);
export const camRef: { current: THREE.PerspectiveCamera | null } = { current: null };
/**
 * Current framing, read by other visuals: `dist` sizes the shadow frustum, `fx`/`fz` is the horizontal view direction,
 * `fpv` is true while the camera sits inside the artifact (hide its shell, show the cockpit), `hideMe` while the camera
 * is so close to your courier that it would block the view.
 */
export const camView = { dist: 16, yaw: 0, fx: 0, fz: -1, view: 'menu' as CamViewName, fpv: false, hideMe: false };

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
/** V: inside the artifact, switch between first person and the chase view. */
export function toggleInsideView() {
  rig.wantFp = !rig.wantFp;
}

const D2R = Math.PI / 180;
const ORBIT = { pitch: 22 * D2R, dist: 8.5, min: 2.4, max: 22, fov: 55, pivot: 1.5 };
const PITCH = { min: -25 * D2R, max: 76 * D2R };
const FP = { fov: 70, min: -72 * D2R, max: 62 * D2R, pitch: -6 * D2R };
const CHASE = { dist: 9, min: 4.5, max: 22 };
/** camera collision radius (also keeps the near plane out of walls) */
const RADIUS = 0.32;
/**
 * First-person seat per form. CUBE / LONG / ROUND: a little above the centre in world space (rolling and tumbling never
 * swing the eye). TALL: high up the pillar's own axis, so its sway is felt. `tilt` = share of the shell's tilt the view
 * follows (never ROUND: the cockpit cage spins around you instead).
 */
const SEAT = [
  { y: 0.25, local: false, tilt: 0.3 },
  { y: 0.08, local: false, tilt: 0.3 },
  { y: 1.45, local: true, tilt: 0.55 },
  { y: 0.1, local: false, tilt: 0 },
];
const UP = new THREE.Vector3(0, 1, 0);
const AXES = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];

const rig = {
  mode: 'menu' as 'menu' | 'cut' | 'play',
  view: 'orbit' as 'orbit' | 'fp' | 'chase',
  yaw: 0,
  pitch: ORBIT.pitch,
  fpPitch: FP.pitch,
  // where the mouse has turned to; the camera follows within a few frames (smooths flicks and touchpad jitter)
  yawT: 0,
  pitchT: ORBIT.pitch,
  fpPitchT: FP.pitch,
  dist: ORBIT.dist,
  chaseDist: CHASE.dist,
  cur: ORBIT.dist, // collision-limited distance
  wantFp: true,
  wasPilot: false,
  zoomOut: 0, // wheel-out accumulated in first person
  zoomIn: 0, // wheel-in accumulated at the chase view's closest distance
  pivot: new THREE.Vector3(),
  pivotOk: false,
  eye: new THREE.Vector3(),
  eyeOk: false,
  seat: new THREE.Vector3(0, 0.25, 0),
  tilt: new THREE.Quaternion(),
  groundY: 0,
  map: -1,
  phase: '',
  // final pose (before shake) and the blend between views
  pos: new THREE.Vector3(2.2, 4.8, 13.5),
  quat: new THREE.Quaternion(),
  fromPos: new THREE.Vector3(),
  fromQuat: new THREE.Quaternion(),
  blendT: 1,
  blendDur: 1,
  // menu drift / cutscene
  mPos: new THREE.Vector3(2.2, 4.8, 13.5),
  mLook: new THREE.Vector3(0.2, 2.4, -8),
  cutT: 0,
};
(window as any).__SH_CAMSTATE = () => ({
  mode: rig.mode,
  view: rig.view,
  yaw: rig.yaw,
  yawT: rig.yawT,
  pitch: rig.pitch,
  fpPitch: rig.fpPitch,
  dist: rig.dist,
  cur: rig.cur,
  chaseDist: rig.chaseDist,
  blending: rig.blendT < rig.blendDur,
  fpv: camView.fpv,
  hideMe: camView.hideMe,
  pos: camRef.current ? camRef.current.position.toArray() : null,
  dir: camRef.current ? camRef.current.getWorldDirection(new THREE.Vector3()).toArray() : null,
  near: camRef.current?.near,
  fov: camRef.current?.fov,
  up: camRef.current ? new THREE.Vector3(0, 1, 0).applyQuaternion(camRef.current.quaternion).toArray() : null,
  inSolid: camRef.current ? insideSolid(camRef.current.position) : false,
});

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const ease = (t: number) => (t >= 1 ? 1 : t * t * (3 - 2 * t));
const tmp = {
  target: new THREE.Vector3(),
  dir: new THREE.Vector3(),
  v: new THREE.Vector3(),
  q: new THREE.Quaternion(),
  q2: new THREE.Quaternion(),
  e: new THREE.Euler(0, 0, 0, 'YXZ'),
  m: new THREE.Matrix4(),
  livePos: new THREE.Vector3(),
  liveQuat: new THREE.Quaternion(),
};

function lookQuat(out: THREE.Quaternion, from: THREE.Vector3, to: THREE.Vector3) {
  tmp.m.lookAt(from, to, UP);
  return out.setFromRotationMatrix(tmp.m);
}

function startBlend(dur: number) {
  rig.fromPos.copy(rig.pos);
  rig.fromQuat.copy(rig.quat);
  rig.blendT = 0;
  rig.blendDur = dur;
}

/** Orbit pose around `pivot` at the current heading/pitch, pulled in so it never passes through level geometry. */
function orbitPose(pivot: THREE.Vector3, want: number, dt: number, snap: boolean) {
  const cp = Math.cos(rig.pitch);
  tmp.dir.set(Math.sin(rig.yaw) * cp, Math.sin(rig.pitch), Math.cos(rig.yaw) * cp);
  const free = Math.max(0.2, castCamera(pivot, tmp.dir, want, RADIUS) - 0.05);
  if (snap || free < rig.cur) rig.cur = free; // pulled in at once: never through a wall
  else rig.cur += (free - rig.cur) * (1 - Math.exp(-3.2 * dt)); // eased back out
  tmp.livePos.copy(pivot).addScaledVector(tmp.dir, rig.cur);
  lookQuat(tmp.liveQuat, tmp.livePos, pivot);
}

/** Is `p` inside the artifact's current shell (camera fully inside: hide the shell, show the cockpit)? */
function insideArtifact(p: THREE.Vector3) {
  const a = frame.current.artifact;
  const s = shapeSpec(a.shape);
  tmp.v.set(p.x - a.x, p.y - a.y, p.z - a.z);
  if (s.ball) return tmp.v.length() < s.half[0] - 0.05;
  tmp.q.set(a.qx, a.qy, a.qz, a.qw).invert();
  tmp.v.applyQuaternion(tmp.q);
  return Math.abs(tmp.v.x) < s.half[0] - 0.04 && Math.abs(tmp.v.y) < s.half[1] - 0.04 && Math.abs(tmp.v.z) < s.half[2] - 0.04;
}

export function CameraRig() {
  const { camera } = useThree();
  const screen = useGame((s) => s.screen);
  const cutscene = useGame((s) => s.cutscene);
  const fovRef = useRef(44);

  useFrame((state, dtRaw) => {
    const dt = Math.min(0.05, dtRaw);
    const S = rig;
    const t = state.clock.elapsedTime;
    const cam = camera as THREE.PerspectiveCamera;
    camRef.current = cam;
    const mode = screen !== 'game' ? 'menu' : cutscene ? 'cut' : 'play';
    if (mode !== S.mode) {
      if (mode === 'cut') {
        S.cutT = 0;
        S.mPos.copy(S.pos);
        S.mLook.copy(S.pos).add(tmp.v.set(0, 0, -10).applyQuaternion(S.quat));
      }
      if (mode === 'play') {
        S.pivotOk = false;
        S.eyeOk = false;
        startBlend(1.1);
      }
      if (mode === 'menu') {
        S.mPos.copy(S.pos);
        S.mLook.copy(S.pos).add(tmp.v.set(0, 0, -10).applyQuaternion(S.quat));
      }
      S.mode = mode;
    }
    let fov = 44;
    let near = 0.15;
    let shakeK = 1;
    camView.fpv = false;
    camView.hideMe = false;
    seeUniforms.seeOn.value = 0;
    if (mode === 'menu') {
      // slow cinematic drift: couriers and artifact in front, the islands and castle beyond
      tmp.target.set(3.4 + Math.sin(t * 0.13) * 1.4, 4.3 + Math.sin(t * 0.21) * 0.3, 13.6 + Math.sin(t * 0.09) * 0.7);
      tmp.v.set(0.4 + Math.sin(t * 0.11) * 0.5, 1.9, -6);
      S.mPos.lerp(tmp.target, 1 - Math.exp(-1.2 * dt));
      S.mLook.lerp(tmp.v, 1 - Math.exp(-1.2 * dt));
      S.pos.copy(S.mPos);
      lookQuat(S.quat, S.mPos, S.mLook);
      camFocus.set(0, 0, -4);
      camView.dist = 16;
      camView.view = 'menu';
      fov = 46;
      S.map = -1; // the next run starts facing down the course
    } else if (mode === 'cut') {
      S.cutT += dt;
      const G = LEVEL.goal.p;
      const k = Math.min(1, S.cutT / 2.2);
      const e = k * k * (3 - 2 * k);
      tmp.target.set(G[0] + 4 - e * 1.6 + Math.sin(S.cutT * 0.3) * 0.8, G[1] + 5.6 - e * 1.6, G[2] + 12.5 - e * 4.4);
      tmp.v.set(G[0] + 0.5, G[1] + 2.0, G[2] - 5.5);
      S.mPos.lerp(tmp.target, 1 - Math.exp(-2.2 * dt));
      S.mLook.lerp(tmp.v, 1 - Math.exp(-2.5 * dt));
      S.pos.copy(S.mPos);
      lookQuat(S.quat, S.mPos, S.mLook);
      camFocus.set(G[0], G[1], G[2] - 4);
      camView.dist = 14;
      camView.view = 'cut';
      fov = 46;
    } else {
      const f = frame.current;
      const you = useGame.getState().lobby?.you ?? -1;
      const me = f.players.find((p) => p.slot === you);
      const a = f.artifact;
      const spec = shapeSpec(a.shape);
      // a new world (or a new run of one): face down the course again, first person on the next ride
      const mi = activeMapIndex();
      const ph = useGame.getState().lobby?.phase ?? '';
      const fresh = ph === 'countdown' && S.phase !== 'countdown';
      S.phase = ph;
      if (mi !== S.map || fresh) {
        S.map = mi;
        S.yaw = S.yawT = 0;
        S.pitch = S.pitchT = ORBIT.pitch;
        S.fpPitch = S.fpPitchT = FP.pitch;
        S.pivotOk = false;
        S.eyeOk = false;
        S.wantFp = true;
      }
      const piloting = !!me?.pilot;
      if (piloting && !S.wasPilot) S.wantFp = true; // hopping in always starts in first person
      S.wasPilot = piloting;
      const view = piloting ? (S.wantFp ? 'fp' : 'chase') : 'orbit';
      if (view !== S.view) {
        if (view === 'fp') S.fpPitch = S.fpPitchT = clamp(FP.pitch - (S.pitch - ORBIT.pitch) * 0.4, FP.min, FP.max);
        if (S.view === 'fp') S.pitch = S.pitchT = ORBIT.pitch;
        if (view === 'orbit') S.pivotOk = false;
        if (view === 'chase') S.cur = Math.min(S.cur, 2);
        startBlend(view === 'fp' ? 0.45 : 0.6);
        S.view = view;
        S.zoomIn = S.zoomOut = 0;
      }
      // look + zoom input (the view catches up with the mouse within a few frames)
      const L = look.drain();
      S.yawT -= L.dx;
      if (S.view === 'fp') S.fpPitchT = clamp(S.fpPitchT - L.dy, FP.min, FP.max);
      else S.pitchT = clamp(S.pitchT + L.dy, PITCH.min, PITCH.max);
      const kl = 1 - Math.exp(-(S.view === 'fp' ? 40 : 28) * dt);
      S.yaw += (S.yawT - S.yaw) * kl;
      S.pitch += (S.pitchT - S.pitch) * kl;
      S.fpPitch += (S.fpPitchT - S.fpPitch) * kl;
      S.zoomOut *= Math.exp(-2 * dt);
      S.zoomIn *= Math.exp(-2 * dt);
      if (S.view === 'fp') {
        if (L.dz > 0) S.zoomOut += L.dz;
        if (S.zoomOut > 0.6) S.wantFp = false; // scroll out of the cockpit
      } else if (S.view === 'chase') {
        if (L.dz < 0 && S.chaseDist <= CHASE.min + 0.01) S.zoomIn -= L.dz;
        S.chaseDist = clamp(S.chaseDist * Math.exp(L.dz * 0.5), CHASE.min, CHASE.max);
        if (S.zoomIn > 0.6) S.wantFp = true; // scroll all the way in: back to first person
      } else S.dist = clamp(S.dist * Math.exp(L.dz * 0.5), ORBIT.min, ORBIT.max);

      if (S.view === 'fp') {
        // seat (blended across shape changes) + a share of the shell's tilt from its most upward-facing axis
        const seat = SEAT[a.shape] ?? SEAT[0];
        const q = tmp.q.set(a.qx, a.qy, a.qz, a.qw);
        if (seat.local) tmp.v.set(0, seat.y, 0).applyQuaternion(q);
        else tmp.v.set(0, seat.y, 0);
        S.seat.lerp(tmp.v, 1 - Math.exp(-8 * dt));
        tmp.target.set(a.x, a.y, a.z).add(S.seat);
        if (!S.eyeOk || S.eye.distanceTo(tmp.target) > 4) {
          S.eye.copy(tmp.target);
          if (S.eyeOk) S.blendT = S.blendDur; // the artifact was recalled: cut
          S.eyeOk = true;
        } else S.eye.lerp(tmp.target, 1 - Math.exp(-30 * dt));
        let best = AXES[1];
        let by = -2;
        let sign = 1;
        for (const ax of AXES) {
          const y = tmp.v.copy(ax).applyQuaternion(q).y;
          if (Math.abs(y) > by) {
            by = Math.abs(y);
            best = ax;
            sign = Math.sign(y) || 1;
          }
        }
        tmp.v.copy(best).multiplyScalar(sign).applyQuaternion(q);
        tmp.q2.setFromUnitVectors(UP, tmp.v);
        tmp.q2.slerp(tmp.liveQuat.identity(), 1 - seat.tilt);
        S.tilt.slerp(tmp.q2, 1 - Math.exp(-10 * dt));
        tmp.e.set(S.fpPitch, S.yaw, 0, 'YXZ');
        tmp.liveQuat.setFromEuler(tmp.e).premultiply(S.tilt);
        tmp.livePos.copy(S.eye);
        camFocus.copy(S.eye);
        fov = FP.fov;
        near = 0.05;
        shakeK = 0.55;
        camView.dist = 16;
      } else {
        // orbit your courier, or (piloting, chase view) the artifact
        let snap = false;
        if (S.view === 'orbit' && me) {
          const feet = me.y - PLAYER_CENTER_Y;
          if (me.grounded || !S.pivotOk) S.groundY = feet;
          // up to head height, lower under a low ceiling (the arch: the camera then fits below it), never below the
          // last ground while falling
          tmp.v.set(me.x, me.y, me.z);
          const head = castCamera(tmp.v, UP, ORBIT.pivot + 1, 0);
          let ty = feet + Math.min(ORBIT.pivot, PLAYER_CENTER_Y + head - RADIUS - 0.08);
          ty = Math.max(ty, S.groundY + ORBIT.pivot - 3);
          tmp.target.set(me.x, ty, me.z);
        } else {
          const up = spec.ball ? spec.half[0] : spec.half[1];
          tmp.target.set(a.x, a.y + up + 0.6, a.z);
        }
        if (!S.pivotOk || S.pivot.distanceTo(tmp.target) > 6) {
          // teleport (respawn, recall, new world): cut instead of sweeping across the map
          if (S.pivotOk) S.blendT = S.blendDur;
          S.pivot.copy(tmp.target);
          S.pivotOk = true;
          snap = true;
        } else {
          const kh = 1 - Math.exp(-12 * dt);
          S.pivot.x += (tmp.target.x - S.pivot.x) * kh;
          S.pivot.z += (tmp.target.z - S.pivot.z) * kh;
          S.pivot.y += (tmp.target.y - S.pivot.y) * (1 - Math.exp(-8 * dt));
        }
        orbitPose(S.pivot, S.view === 'chase' ? S.chaseDist : S.dist, dt, snap);
        camFocus.copy(S.pivot);
        fov = ORBIT.fov;
        camView.dist = Math.max(16, S.cur * 1.8);
        camView.hideMe = S.view === 'orbit' && S.cur < 1.3;
      }
      // blend between views (hop in / out, first person <-> chase)
      if (S.blendT < S.blendDur) {
        S.blendT += dt;
        const k = ease(Math.min(1, S.blendT / S.blendDur));
        S.pos.lerpVectors(S.fromPos, tmp.livePos, k);
        S.quat.slerpQuaternions(S.fromQuat, tmp.liveQuat, k);
      } else {
        S.pos.copy(tmp.livePos);
        S.quat.copy(tmp.liveQuat);
      }
      if (S.view === 'fp') {
        camView.fpv = insideArtifact(S.pos);
        near = 0.05;
      }
      camView.view = S.view;
      input.camYaw = S.yaw;
      // decor between the camera and your courier (or the artifact you chase) gets a see-through hole
      seeUniforms.seeOn.value = S.view === 'fp' ? 0 : 1;
      seeUniforms.seeA.value.copy(S.pos);
      seeUniforms.seeB.value.copy(S.pivot);
    }
    if (debugCam.pos && debugCam.look) {
      S.pos.set(debugCam.pos[0], debugCam.pos[1], debugCam.pos[2]);
      tmp.v.set(debugCam.look[0], debugCam.look[1], debugCam.look[2]);
      lookQuat(S.quat, S.pos, tmp.v);
      camFocus.copy(tmp.v);
      camView.fpv = false;
      camView.hideMe = false;
      seeUniforms.seeOn.value = 0;
      near = 0.15;
    }
    cam.position.copy(S.pos);
    cam.quaternion.copy(S.quat);
    // shake: tiny, high-frequency, decays fast
    if (shake.amp > 0.002) {
      const s = shake.amp * shakeK;
      cam.position.x += Math.sin(t * 57) * s * 0.5;
      cam.position.y += Math.sin(t * 71 + 1.3) * s * 0.4;
      shake.amp *= Math.exp(-7 * dt);
    } else shake.amp = 0;
    tmp.v.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const h = Math.hypot(tmp.v.x, tmp.v.z);
    if (h > 1e-3) {
      camView.fx = tmp.v.x / h;
      camView.fz = tmp.v.z / h;
    }
    camView.yaw = S.yaw;
    fovRef.current += (fov - fovRef.current) * (1 - Math.exp(-6 * dt));
    if (Math.abs(cam.fov - fovRef.current) > 0.01 || cam.near !== near) {
      cam.fov = fovRef.current;
      cam.near = near;
      cam.updateProjectionMatrix();
    }
  });
  return null;
}
