// Three procedural chibi couriers with hats, animated from synced snapshots, plus grip ropes and name tags.
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { QuadraticBezierLine } from '@react-three/drei';
import { SLOT_COLORS, PLAYER_CENTER_Y } from '../shared/constants';
import { frame } from './frame';
import { fx } from './Effects';
import { sfx } from '../audio/audio';
import { useGame } from '../app/store';

const HAT = ['#ffb13b', '#2f5fa8', '#3f8a4f'];

function useCourierMaterials(slot: number) {
  return useMemo(() => {
    const c = new THREE.Color(SLOT_COLORS[slot]);
    return {
      body: new THREE.MeshStandardMaterial({ color: c, roughness: 0.55 }),
      dark: new THREE.MeshStandardMaterial({ color: c.clone().offsetHSL(0, 0.05, -0.18), roughness: 0.6 }),
      belly: new THREE.MeshStandardMaterial({ color: c.clone().lerp(new THREE.Color('#ffffff'), 0.45), roughness: 0.6 }),
      hat: new THREE.MeshStandardMaterial({ color: HAT[slot], roughness: 0.45 }),
      hat2: new THREE.MeshStandardMaterial({ color: new THREE.Color(HAT[slot]).offsetHSL(0, 0, 0.18), roughness: 0.5 }),
      eye: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 }),
      pupil: new THREE.MeshStandardMaterial({ color: '#2a2338', roughness: 0.3 }),
      cheek: new THREE.MeshStandardMaterial({ color: '#ff9fb2', roughness: 0.8 }),
      bag: new THREE.MeshStandardMaterial({ color: '#9b6a45', roughness: 0.8 }),
    };
  }, [slot]);
}

function Hat({ slot, m }: { slot: number; m: ReturnType<typeof useCourierMaterials> }) {
  if (slot === 0)
    return (
      <group position={[0, 1.28, 0]}>
        <mesh material={m.hat} castShadow>
          <sphereGeometry args={[0.37, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
        <mesh position={[0, 0.0, 0.1]} material={m.hat}>
          <cylinderGeometry args={[0.47, 0.47, 0.05, 24]} />
        </mesh>
        <mesh position={[0, 0.2, 0]} material={m.hat2}>
          <boxGeometry args={[0.1, 0.18, 0.7]} />
        </mesh>
      </group>
    );
  if (slot === 1)
    return (
      <group position={[0, 1.24, 0]}>
        <mesh material={m.hat} castShadow>
          <sphereGeometry args={[0.39, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
        <mesh position={[0, 0.04, 0]} rotation={[Math.PI / 2, 0, 0]} material={m.hat2}>
          <torusGeometry args={[0.37, 0.07, 8, 24]} />
        </mesh>
        <mesh position={[0, 0.45, 0]} material={m.eye}>
          <sphereGeometry args={[0.11, 12, 10]} />
        </mesh>
      </group>
    );
  return (
    <group position={[0, 1.26, 0]}>
      <mesh scale={[1, 0.75, 1]} material={m.hat} castShadow>
        <sphereGeometry args={[0.4, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      <mesh position={[0, 0.01, 0]} material={m.hat}>
        <cylinderGeometry args={[0.52, 0.55, 0.04, 24]} />
      </mesh>
      <mesh position={[0, 0.09, 0]} rotation={[Math.PI / 2, 0, 0]} material={m.hat2}>
        <torusGeometry args={[0.39, 0.035, 6, 24]} />
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
}

function Courier({ slot, local }: { slot: number; local: boolean }) {
  const m = useCourierMaterials(slot);
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const handL = useRef<THREE.Mesh>(null);
  const handR = useRef<THREE.Mesh>(null);
  const footL = useRef<THREE.Mesh>(null);
  const footR = useRef<THREE.Mesh>(null);
  const eyes = useRef<THREE.Group>(null);
  const ropeRef = useRef<any>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const anim = useRef<Anim>({ phase: 0, squash: 1, squashV: 0, wasGrounded: true, airT: 0, blinkT: 2, stepT: 0, init: false, spawnT: 1 });
  const v1 = useMemo(() => new THREE.Vector3(), []);
  const v2 = useMemo(() => new THREE.Vector3(), []);
  const v3 = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ clock }, dtRaw) => {
    const dt = Math.min(0.05, dtRaw);
    const f = frame.current;
    const p = f.players.find((x) => x.slot === slot);
    const r = root.current;
    if (!r) return;
    if (!p) {
      r.visible = false;
      if (ropeRef.current) ropeRef.current.visible = false;
      return;
    }
    r.visible = true;
    const A = anim.current;
    const feetY = p.y - PLAYER_CENTER_Y;
    if (!A.init) {
      A.init = true;
      r.position.set(p.x, feetY, p.z);
    }
    // teleport (respawn) detection
    if (Math.hypot(p.x - r.position.x, feetY - r.position.y, p.z - r.position.z) > 3) {
      if (frame.live) {
        fx.poof(r.position.x, r.position.y + 0.6, r.position.z, 18);
        fx.poof(p.x, feetY + 0.6, p.z, 22, '#fff4c4');
      }
      A.spawnT = 0;
    }
    const cut = useGame.getState().cutscene;
    r.position.set(p.x, feetY + (cut ? Math.abs(Math.sin(clock.elapsedTime * 6.5 + slot * 1.3)) * 0.45 : 0), p.z);
    r.rotation.y = cut ? Math.PI + Math.sin(clock.elapsedTime * 2 + slot) * 0.3 : p.yaw;
    const speed = Math.hypot(p.vx, p.vz);
    // walk cycle
    if (p.grounded && speed > 0.3) A.phase += dt * (5 + speed * 1.6);
    const walk = p.grounded ? Math.min(1, speed / 4) : 0;
    const sw = Math.sin(A.phase);
    if (footL.current && footR.current) {
      footL.current.position.set(-0.18, 0.07 + Math.max(0, sw) * 0.12 * walk, 0.05 + sw * 0.2 * walk);
      footR.current.position.set(0.18, 0.07 + Math.max(0, -sw) * 0.12 * walk, 0.05 - sw * 0.2 * walk);
    }
    // landing / jumping squash
    if (!p.grounded) A.airT += dt;
    if (p.grounded && !A.wasGrounded) {
      if (A.airT > 0.22) {
        A.squashV = -3.2 * Math.min(1.5, A.airT + 0.4);
        if (frame.live) {
          fx.dust(p.x, feetY, p.z, 7);
          sfx.play('land', { vol: local ? 0.55 : 0.25, minGap: 90 });
        }
      }
      A.airT = 0;
    }
    if (!p.grounded && A.wasGrounded && p.vy > 3 && frame.live) {
      A.squashV = 2.5;
      sfx.play('jump', { vol: local ? 0.55 : 0.22, minGap: 90 });
    }
    A.wasGrounded = p.grounded;
    // spring squash
    A.squashV += (1 - A.squash) * 140 * dt;
    A.squashV *= Math.exp(-11 * dt);
    A.squash += A.squashV * dt;
    const stretch = p.grounded ? 1 : 1 + Math.max(-0.08, Math.min(0.1, p.vy * 0.012));
    const sq = A.squash * stretch;
    A.spawnT = Math.min(1, A.spawnT + dt * 2.5);
    const spawnS = A.spawnT >= 1 ? 1 : 1 - Math.cos(A.spawnT * Math.PI * 2.5) * (1 - A.spawnT) * 0.6;
    if (body.current) {
      const bob = Math.abs(sw) * 0.05 * walk;
      const breathe = 1 + Math.sin(clock.elapsedTime * 2.2 + slot) * 0.012;
      body.current.position.y = bob;
      body.current.scale.set((1 / Math.sqrt(sq)) * spawnS, sq * breathe * spawnS, (1 / Math.sqrt(sq)) * spawnS);
      const lean = p.grip ? 0.18 : Math.min(0.24, speed * 0.045);
      body.current.rotation.x = lean;
      body.current.rotation.z = sw * 0.06 * walk;
    }
    // hands: reach toward rope anchor when gripping, forward when pushing/moving
    const reach = p.grip ? 1 : 0;
    if (handL.current && handR.current) {
      const sx = 0.47 - reach * 0.18;
      const hy = 0.62 + reach * 0.12;
      const hz = 0.05 + reach * 0.42;
      handL.current.position.set(-sx, hy + (1 - reach) * sw * 0.04 * walk, hz - (1 - reach) * sw * 0.12 * walk);
      handR.current.position.set(sx, hy - (1 - reach) * sw * 0.04 * walk, hz + (1 - reach) * sw * 0.12 * walk);
    }
    // blinking
    A.blinkT -= dt;
    if (eyes.current) {
      const closed = A.blinkT < 0.12 && A.blinkT > 0;
      eyes.current.scale.y = closed ? 0.12 : 1;
      if (A.blinkT <= 0) A.blinkT = 2 + Math.random() * 2.5;
    }
    // footsteps for the local courier
    if (local && frame.live && p.grounded && speed > 1.6) {
      A.stepT -= dt;
      if (A.stepT <= 0) {
        A.stepT = 0.34;
        sfx.play('step', { vol: 0.16, rate: 0.9 + Math.random() * 0.2, minGap: 200 });
      }
    }
    // rope
    const rope = ropeRef.current;
    if (rope) {
      rope.visible = p.grip;
      if (p.grip && rope.setPoints) {
        v1.set(p.x + Math.sin(p.yaw) * 0.45, p.y + 0.05, p.z + Math.cos(p.yaw) * 0.45);
        v2.set(p.ax, p.ay, p.az);
        v3.copy(v1).add(v2).multiplyScalar(0.5);
        v3.y -= Math.max(0, 0.6 - v1.distanceTo(v2) * 0.25);
        rope.setPoints(v1, v2, v3);
      }
    }
    if (ringRef.current) ringRef.current.visible = local;
  });

  return (
    <>
    <group ref={root}>
      <group ref={body}>
        {/* bean body */}
        <mesh position={[0, 0.72, 0]} material={m.body} castShadow>
          <capsuleGeometry args={[0.43, 0.42, 8, 18]} />
        </mesh>
        <mesh position={[0, 0.55, 0.3]} scale={[1, 1, 0.45]} material={m.belly}>
          <sphereGeometry args={[0.27, 16, 12]} />
        </mesh>
        {/* face */}
        <group ref={eyes} position={[0, 0.98, 0.34]}>
          {[-1, 1].map((s) => (
            <group key={s} position={[s * 0.15, 0, 0]}>
              <mesh material={m.eye} scale={[1, 1.15, 0.7]}>
                <sphereGeometry args={[0.11, 14, 10]} />
              </mesh>
              <mesh position={[0, -0.01, 0.07]} material={m.pupil}>
                <sphereGeometry args={[0.06, 12, 8]} />
              </mesh>
              <mesh position={[0.025, 0.03, 0.115]} material={m.eye}>
                <sphereGeometry args={[0.018, 6, 6]} />
              </mesh>
            </group>
          ))}
        </group>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.27, 0.84, 0.33]} scale={[1, 0.6, 0.4]} material={m.cheek}>
            <sphereGeometry args={[0.07, 10, 8]} />
          </mesh>
        ))}
        <mesh position={[0, 0.82, 0.41]} rotation={[0, 0, Math.PI]} material={m.pupil}>
          <torusGeometry args={[0.06, 0.016, 6, 12, Math.PI]} />
        </mesh>
        {/* satchel */}
        <mesh position={[0, 0.62, -0.42]} material={m.bag} castShadow>
          <boxGeometry args={[0.42, 0.36, 0.16]} />
        </mesh>
        <Hat slot={slot} m={m} />
        <mesh ref={handL} material={m.dark} castShadow>
          <sphereGeometry args={[0.13, 12, 10]} />
        </mesh>
        <mesh ref={handR} material={m.dark} castShadow>
          <sphereGeometry args={[0.13, 12, 10]} />
        </mesh>
      </group>
      <mesh ref={footL} material={m.dark} scale={[1, 0.6, 1.35]} castShadow>
        <sphereGeometry args={[0.15, 12, 8]} />
      </mesh>
      <mesh ref={footR} material={m.dark} scale={[1, 0.6, 1.35]} castShadow>
        <sphereGeometry args={[0.15, 12, 8]} />
      </mesh>
      <mesh ref={ringRef} position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.55, 0.68, 32]} />
        <meshBasicMaterial color={SLOT_COLORS[slot]} transparent opacity={0.75} depthWrite={false} />
      </mesh>
    </group>
    <QuadraticBezierLine ref={ropeRef} start={[0, 0, 0]} end={[0, 1, 0]} color="#e8c27a" lineWidth={3.5} visible={false} />
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
