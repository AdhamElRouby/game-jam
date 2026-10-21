// Three chibi couriers (bean bodies, hats, big glossy eyes) animated from synced snapshots:
// walk, push, pull, idle, jump/fall, land squash, hat + pompom springs, expressions, ropes and contact shadows.
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { QuadraticBezierLine } from '@react-three/drei';
import { SLOT_COLORS, PLAYER_CENTER_Y } from '../shared/constants';
import { shapeSpec } from '../shared/shapes';
import { frame } from './frame';
import { fx } from './Effects';
import { sfx } from '../audio/audio';
import { useGame } from '../app/store';
import { groundAt } from './ground';
import { blobTexture } from './shadows';

const HAT = ['#ffb13b', '#2f5fa8', '#3f8a4f'];

/** Soft rim light on the toy-vinyl body so couriers pop off any background. */
function withRim(m: THREE.MeshStandardMaterial, color: string, strength: number) {
  const rim = { value: new THREE.Color(color).multiplyScalar(strength) };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = rim;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim;')
      .replace(
        '#include <opaque_fragment>',
        `float rimF = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
        outgoingLight += uRim * pow(rimF, 2.6);
        #include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => 'rim' + color + strength;
  return m;
}

function useCourierMaterials(slot: number) {
  return useMemo(() => {
    const c = new THREE.Color(SLOT_COLORS[slot]);
    return {
      body: withRim(new THREE.MeshStandardMaterial({ color: c, roughness: 0.48 }), '#fff4e6', 0.55),
      dark: withRim(new THREE.MeshStandardMaterial({ color: c.clone().offsetHSL(0, 0.04, -0.17), roughness: 0.55 }), '#fff4e6', 0.35),
      belly: new THREE.MeshStandardMaterial({ color: c.clone().lerp(new THREE.Color('#ffffff'), 0.5), roughness: 0.6 }),
      hat: withRim(new THREE.MeshStandardMaterial({ color: HAT[slot], roughness: 0.42 }), '#fff4e6', 0.4),
      hat2: new THREE.MeshStandardMaterial({ color: new THREE.Color(HAT[slot]).offsetHSL(0, 0, 0.16), roughness: 0.5 }),
      eye: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.25 }),
      pupil: new THREE.MeshStandardMaterial({ color: '#241d33', roughness: 0.2 }),
      shine: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
      cheek: new THREE.MeshStandardMaterial({ color: '#ff9fb2', roughness: 0.8, transparent: true, opacity: 0.85 }),
      bag: new THREE.MeshStandardMaterial({ color: '#9b6a45', roughness: 0.8 }),
      strap: new THREE.MeshStandardMaterial({ color: '#7a5034', roughness: 0.8 }),
      sole: new THREE.MeshStandardMaterial({ color: '#4a3b4f', roughness: 0.7 }),
    };
  }, [slot]);
}

// pear-shaped bean body (radius, height) lathed around Y
const BODY_GEO = (() => {
  const pts = [
    [0.0, 0.0], [0.3, 0.015], [0.42, 0.1], [0.47, 0.26], [0.48, 0.45], [0.46, 0.66], [0.42, 0.84], [0.35, 0.99], [0.24, 1.1], [0.1, 1.155], [0.0, 1.165],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, 28);
  g.computeVertexNormals();
  return g;
})();
const ARM_GEO = new THREE.CapsuleGeometry(0.075, 1, 4, 8);
const FOOT_GEO = (() => {
  const g = new THREE.SphereGeometry(0.15, 14, 10);
  g.scale(1, 0.62, 1.4);
  return g;
})();

function Hat({ slot, m, pompom }: { slot: number; m: ReturnType<typeof useCourierMaterials>; pompom: React.RefObject<THREE.Group | null> }) {
  if (slot === 0)
    return (
      <group>
        <mesh material={m.hat} castShadow>
          <sphereGeometry args={[0.37, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
        <mesh position={[0, 0.01, 0.08]} material={m.hat}>
          <cylinderGeometry args={[0.46, 0.48, 0.05, 26]} />
        </mesh>
        <mesh position={[0, 0.17, 0]} scale={[0.32, 1, 1]} material={m.hat2}>
          <sphereGeometry args={[0.36, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
      </group>
    );
  if (slot === 1)
    return (
      <group>
        <mesh material={m.hat} castShadow scale={[1, 1.12, 1]}>
          <sphereGeometry args={[0.38, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
        <mesh position={[0, 0.04, 0]} rotation={[Math.PI / 2, 0, 0]} material={m.hat2}>
          <torusGeometry args={[0.37, 0.075, 8, 26]} />
        </mesh>
        <group ref={pompom} position={[0, 0.4, 0]}>
          <mesh position={[0, 0.06, 0]} material={m.eye} castShadow>
            <icosahedronGeometry args={[0.12, 1]} />
          </mesh>
        </group>
      </group>
    );
  return (
    <group>
      <mesh scale={[1, 0.78, 1]} material={m.hat} castShadow>
        <sphereGeometry args={[0.39, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      <mesh position={[0, 0.01, 0]} material={m.hat}>
        <cylinderGeometry args={[0.53, 0.55, 0.045, 26]} />
      </mesh>
      <mesh position={[0, 0.09, 0]} rotation={[Math.PI / 2, 0, 0]} material={m.hat2}>
        <torusGeometry args={[0.38, 0.035, 6, 26]} />
      </mesh>
      <mesh position={[0.2, 0.14, 0.24]} rotation={[0.2, 0.6, 0.3]} material={m.belly}>
        <boxGeometry args={[0.05, 0.16, 0.08]} />
      </mesh>
    </group>
  );
}

interface Anim {
  phase: number;
  squash: number;
  squashV: number;
  wasGrounded: boolean;
  airT: number;
  blinkT: number;
  stepT: number;
  init: boolean;
  spawnT: number;
  hatA: number;
  hatV: number;
  pomA: number;
  pomV: number;
  lastVx: number;
  lastVz: number;
  push: number;
  lookT: number;
  look: number;
  dustT: number;
  /** piloting: diving into the artifact (0..1), hidden once done */
  inside: boolean;
  diveT: number;
  diveFrom: THREE.Vector3;
  tumbleT: number;
}

const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpV = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Signed-ish distance from a point to the artifact surface + direction to its centre (xz). */
function artifactGap(px: number, py: number, pz: number) {
  const a = frame.current.artifact;
  const s = shapeSpec(a.shape);
  tmpV.set(px - a.x, py - a.y, pz - a.z);
  tmpQ.set(a.qx, a.qy, a.qz, a.qw).invert();
  tmpV.applyQuaternion(tmpQ);
  if (s.ball) return Math.hypot(tmpV.x, tmpV.y, tmpV.z) - s.half[0];
  const dx = Math.max(0, Math.abs(tmpV.x) - s.half[0]);
  const dy = Math.max(0, Math.abs(tmpV.y) - s.half[1]);
  const dz = Math.max(0, Math.abs(tmpV.z) - s.half[2]);
  return Math.hypot(dx, dy, dz);
}

function setLimb(mesh: THREE.Mesh | null, ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
  if (!mesh) return;
  tmpV.set(bx - ax, by - ay, bz - az);
  const len = Math.max(0.01, tmpV.length());
  mesh.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  mesh.quaternion.setFromUnitVectors(UP, tmpV.multiplyScalar(1 / len));
  mesh.scale.set(1, Math.max(0.01, len - 0.15), 1);
}

function Courier({ slot, local }: { slot: number; local: boolean }) {
  const m = useCourierMaterials(slot);
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const handL = useRef<THREE.Mesh>(null);
  const handR = useRef<THREE.Mesh>(null);
  const armL = useRef<THREE.Mesh>(null);
  const armR = useRef<THREE.Mesh>(null);
  const footL = useRef<THREE.Group>(null);
  const footR = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const pupils = useRef<THREE.Group>(null);
  const browL = useRef<THREE.Mesh>(null);
  const browR = useRef<THREE.Mesh>(null);
  const smile = useRef<THREE.Mesh>(null);
  const mouthO = useRef<THREE.Mesh>(null);
  const mouthLine = useRef<THREE.Mesh>(null);
  const hat = useRef<THREE.Group>(null);
  const pompom = useRef<THREE.Group>(null);
  const bag = useRef<THREE.Group>(null);
  const ropeRef = useRef<any>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const blob = useRef<THREE.Mesh>(null);
  const gripGlow = useRef<THREE.Mesh>(null);
  const anim = useRef<Anim>({ phase: 0, squash: 1, squashV: 0, wasGrounded: true, airT: 0, blinkT: 2, stepT: 0, init: false, spawnT: 1, hatA: 0, hatV: 0, pomA: 0, pomV: 0, lastVx: 0, lastVz: 0, push: 0, lookT: 3, look: 0, dustT: 0, inside: false, diveT: 0, diveFrom: new THREE.Vector3(), tumbleT: 0 });
  const v1 = useMemo(() => new THREE.Vector3(), []);
  const v2 = useMemo(() => new THREE.Vector3(), []);
  const v3 = useMemo(() => new THREE.Vector3(), []);
  const blobMat = useMemo(() => new THREE.MeshBasicMaterial({ map: blobTexture(), color: '#2a1f3d', transparent: true, opacity: 0.45, depthWrite: false }), []);

  useFrame(({ clock }, dtRaw) => {
    const dt = Math.min(0.05, dtRaw);
    const t = clock.elapsedTime;
    const f = frame.current;
    const p = f.players.find((x) => x.slot === slot);
    const r = root.current;
    if (!r) return;
    if (!p) {
      r.visible = false;
      if (ropeRef.current) ropeRef.current.visible = false;
      if (blob.current) blob.current.visible = false;
      return;
    }
    r.visible = true;
    const A = anim.current;
    const feetY = p.y - PLAYER_CENTER_Y;
    if (!A.init) {
      A.init = true;
      r.position.set(p.x, feetY, p.z);
    }
    // piloting: hop up and dive into the artifact, then stay hidden until popping back out
    if (p.pilot) {
      if (!A.inside) {
        A.inside = true;
        A.diveT = 0;
        A.diveFrom.copy(r.position);
        if (frame.live) fx.sparkle(r.position.x, r.position.y + 0.7, r.position.z, 16, 0.6, SLOT_COLORS[slot]);
      }
      A.diveT = Math.min(1, A.diveT + dt / 0.3);
      const hide = A.diveT >= 1;
      r.visible = !hide;
      if (ropeRef.current) ropeRef.current.visible = false;
      if (gripGlow.current) gripGlow.current.visible = false;
      if (blob.current) blob.current.visible = false;
      if (!hide) {
        const e = A.diveT * A.diveT;
        r.position.lerpVectors(A.diveFrom, tmpV.set(p.x, p.y - 0.4, p.z), e);
        r.position.y += Math.sin(A.diveT * Math.PI) * 1.1;
        r.scale.setScalar(Math.max(0.01, 1 - e * 0.95));
        r.rotation.y += dt * 14;
      }
      return;
    }
    if (A.inside) {
      // popped out beside the artifact: appear in place with a bouncy scale-in (no respawn poof)
      A.inside = false;
      A.spawnT = 0;
      r.position.set(p.x, feetY, p.z);
      if (frame.live) fx.sparkle(p.x, feetY + 0.8, p.z, 22, 0.8, SLOT_COLORS[slot]);
    }
    r.scale.setScalar(1);
    // teleport (respawn) detection
    if (Math.hypot(p.x - r.position.x, feetY - r.position.y, p.z - r.position.z) > 3) {
      if (frame.live) {
        fx.poof(r.position.x, r.position.y + 0.6, r.position.z, 18);
        fx.poof(p.x, feetY + 0.6, p.z, 22, '#fff4c4');
      }
      A.spawnT = 0;
    }
    const cut = useGame.getState().cutscene;
    const cheer = cut ? Math.abs(Math.sin(t * 6.5 + slot * 1.3)) : 0;
    r.position.set(p.x, feetY + cheer * 0.45, p.z);
    // knocked over: a dizzy spin that settles back onto the feet
    A.tumbleT = p.tumble ? Math.min(1, A.tumbleT + dt * 6) : Math.max(0, A.tumbleT - dt * 4);
    r.rotation.y = cut ? Math.PI + Math.sin(t * 2 + slot) * 0.3 : p.yaw + (A.tumbleT > 0 ? Math.sin(t * 9 + slot) * 1.2 * A.tumbleT : 0);
    const speed = Math.hypot(p.vx, p.vz);
    const falling = !p.grounded && p.vy < -4.5;
    // pushing: close to the artifact, moving into it, not gripping
    const gap = artifactGap(p.x, p.y, p.z);
    const a = f.artifact;
    const toA = Math.atan2(a.x - p.x, a.z - p.z);
    let dyaw = toA - p.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    const pushing = !p.grip && p.grounded && gap < 0.45 && Math.abs(dyaw) < 1.0 && (p.moving || speed > 0.4);
    A.push += ((pushing ? 1 : 0) - A.push) * Math.min(1, dt * 8);
    const pull = p.grip ? 1 : 0;
    // walk cycle (pushing = short, quick, effortful steps)
    if (p.grounded && (speed > 0.3 || A.push > 0.5)) A.phase += dt * (5 + speed * 1.6 + A.push * 4);
    const walk = p.grounded ? Math.min(1, Math.max(speed / 4, A.push * 0.7)) : 0;
    const sw = Math.sin(A.phase);
    if (footL.current && footR.current) {
      const stride = 0.2 * walk * (1 - A.push * 0.4);
      const lift = 0.12 * walk;
      if (falling) {
        footL.current.position.set(-0.2, 0.0 + Math.sin(t * 18) * 0.06, 0.12);
        footR.current.position.set(0.2, 0.0 + Math.sin(t * 18 + 2) * 0.06, -0.05);
      } else {
        const brace = pull * 0.12;
        footL.current.position.set(-0.17, 0.05 + Math.max(0, sw) * lift, 0.04 + sw * stride + brace);
        footR.current.position.set(0.17, 0.05 + Math.max(0, -sw) * lift, 0.04 - sw * stride + brace);
      }
      footL.current.rotation.x = falling ? 0.6 : -Math.max(0, sw) * 0.5 * walk;
      footR.current.rotation.x = falling ? -0.3 : -Math.max(0, -sw) * 0.5 * walk;
    }
    // landing / jumping squash
    if (!p.grounded) A.airT += dt;
    if (p.grounded && !A.wasGrounded) {
      if (A.airT > 0.22) {
        A.squashV = -3.2 * Math.min(1.5, A.airT + 0.4);
        A.hatV -= 4;
        A.pomV -= 7;
        if (frame.live) {
          fx.dust(p.x, feetY, p.z, 7);
          sfx.play('land', { vol: local ? 0.55 : 0.25, minGap: 90 });
        }
      }
      A.airT = 0;
    }
    if (!p.grounded && A.wasGrounded && p.vy > 3 && frame.live) {
      A.squashV = 2.5;
      A.hatV += 3;
      sfx.play('jump', { vol: local ? 0.55 : 0.22, minGap: 90 });
    }
    A.wasGrounded = p.grounded;
    // springs: body squash, hat wobble, pompom
    A.squashV += (1 - A.squash) * 140 * dt;
    A.squashV *= Math.exp(-11 * dt);
    A.squash += A.squashV * dt;
    const ax = (p.vx - A.lastVx) / Math.max(dt, 1e-3);
    const az = (p.vz - A.lastVz) / Math.max(dt, 1e-3);
    A.lastVx = p.vx;
    A.lastVz = p.vz;
    const fwdAcc = Math.max(-12, Math.min(12, ax * Math.sin(p.yaw) + az * Math.cos(p.yaw)));
    A.hatV += (-A.hatA * 90 - fwdAcc * 0.35) * dt;
    A.hatV *= Math.exp(-6 * dt);
    A.hatA += A.hatV * dt;
    A.pomV += (-A.pomA * 60 - fwdAcc * 0.6 + (p.grounded ? 0 : -p.vy * 0.4)) * dt;
    A.pomV *= Math.exp(-4 * dt);
    A.pomA += A.pomV * dt;
    const stretch = p.grounded ? 1 : 1 + Math.max(-0.08, Math.min(0.12, p.vy * 0.014));
    const sq = A.squash * stretch;
    A.spawnT = Math.min(1, A.spawnT + dt * 2.5);
    const spawnS = A.spawnT >= 1 ? 1 : 1 - Math.cos(A.spawnT * Math.PI * 2.5) * (1 - A.spawnT) * 0.6;
    if (body.current) {
      const bob = Math.abs(sw) * 0.05 * walk;
      const breathe = 1 + Math.sin(t * 2.2 + slot) * 0.014 * (1 - walk);
      body.current.position.y = bob;
      body.current.scale.set((1 / Math.sqrt(sq)) * spawnS, sq * breathe * spawnS, (1 / Math.sqrt(sq)) * spawnS);
      // lean into a push, lean back on a pull, forward with speed
      const lean = A.push * 0.34 - pull * 0.22 + Math.min(0.2, speed * 0.04) * (1 - A.push) * (1 - pull);
      body.current.rotation.x = lean + (falling ? -0.15 : 0) - A.tumbleT * 0.85;
      body.current.rotation.z = sw * 0.06 * walk + (falling ? Math.sin(t * 9) * 0.12 : 0) + A.tumbleT * Math.sin(t * 13) * 0.25;
    }
    if (hat.current) {
      hat.current.rotation.x = A.hatA * 0.6 + (cut ? Math.sin(t * 13 + slot) * 0.08 : 0);
      hat.current.position.y = 1.08 + Math.max(0, -A.hatA) * 0.05 + (falling ? 0.06 : 0);
    }
    if (pompom.current) pompom.current.rotation.x = A.pomA * 0.9;
    if (bag.current) bag.current.rotation.x = -0.1 + Math.abs(sw) * 0.12 * walk + Math.max(0, -A.hatA) * 0.3;
    // hands + arms: push = both hands forward at chest height; pull = forward + low on the rope; fall = flail up
    const sx = 0.43;
    let lx: number, ly: number, lz: number, rx: number, ry: number, rz: number;
    if (falling || cut) {
      const fl = cut ? Math.sin(t * 12 + slot) * 0.15 : Math.sin(t * 16) * 0.12;
      lx = -0.52; ly = 1.12 + fl; lz = 0.05;
      rx = 0.52; ry = 1.12 - fl; rz = 0.05;
    } else if (pull) {
      lx = -0.16; ly = 0.6; lz = 0.48;
      rx = 0.16; ry = 0.64; rz = 0.5;
    } else if (A.push > 0.3) {
      const shove = Math.sin(A.phase * 2) * 0.03;
      lx = -0.28; ly = 0.66; lz = 0.5 + shove;
      rx = 0.28; ry = 0.66; rz = 0.5 - shove;
    } else {
      const swing = sw * 0.14 * walk;
      lx = -0.5; ly = 0.5 + Math.abs(swing) * 0.2; lz = 0.03 - swing;
      rx = 0.5; ry = 0.5 + Math.abs(swing) * 0.2; rz = 0.03 + swing;
      if (!p.grounded) { ly += 0.18; ry += 0.18; }
    }
    if (handL.current && handR.current) {
      handL.current.position.set(lx, ly, lz);
      handR.current.position.set(rx, ry, rz);
    }
    setLimb(armL.current, -sx + 0.04, 0.66, 0.0, lx, ly, lz);
    setLimb(armR.current, sx - 0.04, 0.66, 0.0, rx, ry, rz);
    // face: blink, glance around when idle, effort brows, mouth by mood
    A.blinkT -= dt;
    if (eyes.current) {
      const closed = A.blinkT < 0.12 && A.blinkT > 0;
      eyes.current.scale.y = closed ? 0.1 : falling ? 1.18 : 1;
      if (A.blinkT <= 0) A.blinkT = 2 + Math.random() * 2.5;
    }
    A.lookT -= dt;
    if (A.lookT <= 0) {
      A.lookT = 1.5 + Math.random() * 2.5;
      A.look = speed < 0.3 && !pull && A.push < 0.3 ? (Math.random() - 0.5) * 0.08 : 0;
    }
    if (pupils.current) pupils.current.position.x += (A.look - pupils.current.position.x) * Math.min(1, dt * 6);
    const effort = Math.max(A.push, pull);
    if (browL.current && browR.current) {
      const by = 0.98 + (falling ? 0.06 : 0) - effort * 0.02;
      browL.current.position.set(-0.15, by, 0.37);
      browR.current.position.set(0.15, by, 0.37);
      browL.current.rotation.z = -0.35 * effort + (falling ? 0.25 : 0);
      browR.current.rotation.z = 0.35 * effort - (falling ? 0.25 : 0);
    }
    if (smile.current && mouthO.current && mouthLine.current) {
      smile.current.visible = !falling && effort < 0.5;
      mouthO.current.visible = falling || cut || A.tumbleT > 0.3;
      mouthLine.current.visible = !falling && !cut && effort >= 0.5 && A.tumbleT <= 0.3;
      if (A.tumbleT > 0.3) smile.current.visible = false;
      if (cut) smile.current.visible = false;
    }
    // footsteps + push dust for the local courier
    if (local && frame.live && p.grounded && speed > 1.6) {
      A.stepT -= dt;
      if (A.stepT <= 0) {
        A.stepT = 0.34;
        sfx.play('step', { vol: 0.16, rate: 0.9 + Math.random() * 0.2, minGap: 200 });
      }
    }
    if (frame.live && A.push > 0.6 && speed > 0.3) {
      A.dustT -= dt;
      if (A.dustT <= 0) {
        A.dustT = 0.22;
        fx.dust(p.x - Math.sin(p.yaw) * 0.25, feetY, p.z - Math.cos(p.yaw) * 0.25, 2);
      }
    }
    // rope + grip glow at the anchor
    const rope = ropeRef.current;
    if (rope) {
      rope.visible = p.grip;
      if (p.grip && rope.setPoints) {
        v1.set(p.x + Math.sin(p.yaw) * 0.5, p.y - 0.05, p.z + Math.cos(p.yaw) * 0.5);
        v2.set(p.ax, p.ay, p.az);
        v3.copy(v1).add(v2).multiplyScalar(0.5);
        v3.y -= Math.max(0, 0.6 - v1.distanceTo(v2) * 0.25);
        rope.setPoints(v1, v2, v3);
      }
    }
    if (gripGlow.current) {
      gripGlow.current.visible = p.grip;
      if (p.grip) {
        gripGlow.current.position.set(p.ax, p.ay, p.az);
        gripGlow.current.scale.setScalar(0.22 + Math.sin(t * 8 + slot) * 0.04);
      }
    }
    if (ringRef.current) ringRef.current.visible = local && !cut;
    // contact shadow on whatever is below (shrinks + fades with height)
    const b = blob.current;
    if (b) {
      const gy = groundAt(p.x, p.z, feetY + 0.05, f.w.liftY, f.w.bridge);
      if (gy === null || cut) b.visible = false;
      else {
        const h = Math.max(0, feetY - gy);
        b.visible = true;
        b.position.set(p.x, gy + 0.03, p.z);
        const s = 1.05 * Math.max(0.45, 1 - h * 0.12);
        b.scale.set(s, s, s);
        blobMat.opacity = 0.42 * Math.max(0.15, 1 - h * 0.18);
      }
    }
  });

  return (
    <>
      <group ref={root}>
        <group ref={body}>
          <mesh geometry={BODY_GEO} material={m.body} castShadow />
          <mesh position={[0, 0.42, 0.32]} scale={[1, 1.05, 0.42]} material={m.belly}>
            <sphereGeometry args={[0.28, 18, 12]} />
          </mesh>
          {/* face */}
          <group ref={eyes} position={[0, 0.82, 0.37]}>
            <group ref={pupils}>
              {[-1, 1].map((s) => (
                <group key={s} position={[s * 0.15, 0, 0]}>
                  <mesh material={m.eye} scale={[1, 1.18, 0.62]}>
                    <sphereGeometry args={[0.12, 16, 12]} />
                  </mesh>
                  <mesh position={[0, -0.012, 0.064]} material={m.pupil} scale={[1, 1.15, 0.6]}>
                    <sphereGeometry args={[0.072, 14, 10]} />
                  </mesh>
                  <mesh position={[0.028, 0.035, 0.105]} material={m.shine}>
                    <sphereGeometry args={[0.024, 8, 6]} />
                  </mesh>
                  <mesh position={[-0.02, -0.04, 0.1]} material={m.shine}>
                    <sphereGeometry args={[0.011, 6, 5]} />
                  </mesh>
                </group>
              ))}
            </group>
          </group>
          <mesh ref={browL} material={m.pupil}>
            <boxGeometry args={[0.13, 0.03, 0.03]} />
          </mesh>
          <mesh ref={browR} material={m.pupil}>
            <boxGeometry args={[0.13, 0.03, 0.03]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.28, 0.69, 0.35]} scale={[1, 0.6, 0.35]} material={m.cheek}>
              <sphereGeometry args={[0.075, 10, 8]} />
            </mesh>
          ))}
          <mesh ref={smile} position={[0, 0.655, 0.462]} rotation={[0.25, 0, Math.PI]} material={m.pupil}>
            <torusGeometry args={[0.065, 0.018, 6, 14, Math.PI]} />
          </mesh>
          <mesh ref={mouthO} position={[0, 0.64, 0.455]} scale={[0.9, 1.1, 0.4]} material={m.pupil} visible={false}>
            <sphereGeometry args={[0.065, 12, 10]} />
          </mesh>
          <mesh ref={mouthLine} position={[0, 0.65, 0.466]} material={m.pupil} visible={false}>
            <boxGeometry args={[0.13, 0.026, 0.02]} />
          </mesh>
          {/* satchel on a strap */}
          <group ref={bag} position={[0, 0.5, -0.43]}>
            <mesh position={[0, 0, -0.04]} material={m.bag} castShadow>
              <boxGeometry args={[0.44, 0.36, 0.16]} />
            </mesh>
            <mesh position={[0, 0.12, 0.05]} material={m.strap}>
              <boxGeometry args={[0.46, 0.08, 0.04]} />
            </mesh>
          </group>
          <mesh position={[0, 0.66, 0]} rotation={[0, 0, 0.75]} material={m.strap}>
            <torusGeometry args={[0.47, 0.025, 6, 30]} />
          </mesh>
          <group ref={hat} position={[0, 1.08, 0]}>
            <Hat slot={slot} m={m} pompom={pompom} />
          </group>
          <mesh ref={armL} geometry={ARM_GEO} material={m.body} castShadow />
          <mesh ref={armR} geometry={ARM_GEO} material={m.body} castShadow />
          <mesh ref={handL} material={m.dark} castShadow>
            <sphereGeometry args={[0.12, 14, 10]} />
          </mesh>
          <mesh ref={handR} material={m.dark} castShadow>
            <sphereGeometry args={[0.12, 14, 10]} />
          </mesh>
        </group>
        {[footL, footR].map((ref, i) => (
          <group key={i} ref={ref}>
            <mesh geometry={FOOT_GEO} material={m.dark} position={[0, 0.03, 0.03]} castShadow />
            <mesh position={[0, -0.03, 0.03]} rotation={[-Math.PI / 2, 0, 0]} scale={[1, 1.35, 1]} material={m.sole}>
              <circleGeometry args={[0.14, 14]} />
            </mesh>
          </group>
        ))}
        <mesh ref={ringRef} position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.56, 0.66, 36]} />
          <meshBasicMaterial color={SLOT_COLORS[slot]} transparent opacity={0.7} depthWrite={false} />
        </mesh>
      </group>
      <mesh ref={blob} rotation={[-Math.PI / 2, 0, 0]} material={blobMat} renderOrder={1}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <mesh ref={gripGlow} visible={false}>
        <icosahedronGeometry args={[1, 1]} />
        <meshBasicMaterial color={SLOT_COLORS[slot]} transparent opacity={0.65} toneMapped={false} />
      </mesh>
      <QuadraticBezierLine ref={ropeRef} start={[0, 0, 0]} end={[0, 1, 0]} color="#e8c27a" lineWidth={4.5} visible={false} />
    </>
  );
}

export function Players() {
  const you = useGame((s) => s.lobby?.you ?? -1);
  return (
    <group>
      {[0, 1, 2].map((slot) => (
        <Courier key={slot} slot={slot} local={slot === you} />
      ))}
    </group>
  );
}
