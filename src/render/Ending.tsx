// Ending cutscene: castle doors open, the King waddles out... and uses the magical artifact as a doorstop.
import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGame } from '../app/store';
import { castleDoor } from './Scenery';
import { frame } from './frame';
import { fx } from './Effects';
import { sfx } from '../audio/audio';
import { MAT } from './materials';

export const artifactOverride = { active: false, x: 0, y: 0, z: 0, s: 1, spin: 0 };
export const kingState = { x: 0, y: 0, z: -171, talking: false };

const DOOR_SPOT = new THREE.Vector3(1.75, 0.5, -169.2);

function King() {
  return (
    <group scale={1.9}>
      <mesh position={[0, 0.55, 0]} material={MAT.lavender} castShadow>
        <coneGeometry args={[0.62, 1.2, 16]} />
      </mesh>
      <mesh position={[0, 0.45, -0.25]} rotation={[0.15, 0, 0]} material={MAT.red} castShadow>
        <boxGeometry args={[0.9, 1.0, 0.08]} />
      </mesh>
      <mesh position={[0, 1.32, 0]} castShadow>
        <sphereGeometry args={[0.4, 18, 14]} />
        <meshStandardMaterial color="#ffd9b8" roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.08, 0.22]} scale={[1, 0.9, 0.7]} material={MAT.white}>
        <sphereGeometry args={[0.3, 14, 10]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.14, 1.42, 0.35]}>
          <sphereGeometry args={[0.05, 8, 6]} />
          <meshStandardMaterial color="#2a2338" />
        </mesh>
      ))}
      <group position={[0, 1.7, 0]}>
        <mesh material={MAT.gold}>
          <cylinderGeometry args={[0.3, 0.32, 0.22, 16, 1, true]} />
        </mesh>
        {[0, 1, 2, 3, 4].map((i) => (
          <mesh key={i} position={[Math.cos((i / 5) * Math.PI * 2) * 0.3, 0.2, Math.sin((i / 5) * Math.PI * 2) * 0.3]} material={MAT.gold}>
            <coneGeometry args={[0.07, 0.22, 4]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

export function Ending() {
  const cutscene = useGame((s) => s.cutscene);
  const king = useRef<THREE.Group>(null);
  const st = useRef({ t: 0, from: new THREE.Vector3(), fired: new Set<string>() });

  useFrame((_, dtRaw) => {
    const dt = Math.min(0.05, dtRaw);
    const S = st.current;
    const k = king.current;
    if (!cutscene) {
      S.t = 0;
      S.fired.clear();
      castleDoor.open = Math.max(0, castleDoor.open - dt);
      artifactOverride.active = false;
      if (k) k.visible = false;
      kingState.talking = false;
      return;
    }
    S.t += dt;
    const t = S.t;
    const once = (id: string, at: number, f: () => void) => {
      if (t >= at && !S.fired.has(id)) {
        S.fired.add(id);
        f();
      }
    };
    const a = frame.current.artifact;
    once('start', 0, () => {
      S.from.set(a.x, a.y, a.z);
      fx.confetti(a.x, a.y + 1, a.z, 140, 3);
      sfx.play('confetti_pop', { vol: 0.8 });
    });
    once('c2', 1.2, () => fx.confetti(-3, 2, -160, 90, 2));
    once('c3', 1.8, () => fx.confetti(3, 2, -160, 90, 2));
    castleDoor.open = Math.min(1, Math.max(0, (t - 0.9) / 1.2));
    once('door', 0.9, () => sfx.play('gate_open', { vol: 0.7 }));
    // king walks out
    if (k) {
      k.visible = t > 1.4;
      const walk = Math.min(1, Math.max(0, (t - 1.6) / 1.8));
      const kz = -171 + walk * 3.4;
      const kx = -0.3 + Math.sin(t * 1.3) * 0.1;
      k.position.set(kx, Math.abs(Math.sin(t * 9)) * 0.08 * (walk < 1 ? 1 : 0) + (t > 5.4 ? Math.abs(Math.sin(t * 6)) * 0.25 : 0), kz);
      k.rotation.y = t > 3.6 && t < 5.4 ? 0.9 : 0;
    }
    // artifact: lifted by royal magic, shrinks into a doorstop
    if (t > 3.6) {
      const u = Math.min(1, (t - 3.6) / 1.4);
      const e = u * u * (3 - 2 * u);
      artifactOverride.active = true;
      artifactOverride.x = S.from.x + (DOOR_SPOT.x - S.from.x) * e;
      artifactOverride.z = S.from.z + (DOOR_SPOT.z - S.from.z) * e;
      artifactOverride.y = S.from.y + (DOOR_SPOT.y - S.from.y) * e + Math.sin(u * Math.PI) * 3.2;
      artifactOverride.s = 1 - 0.55 * e;
      artifactOverride.spin = e * Math.PI * 2;
      once('lift', 3.6, () => {
        sfx.play('shift', { vol: 0.8, rate: 0.8 });
        fx.sparkle(S.from.x, S.from.y, S.from.z, 60, 2);
      });
      once('thunk', 5.0, () => {
        sfx.play('impact_heavy', { vol: 0.9 });
        fx.dust(DOOR_SPOT.x, 0.1, DOOR_SPOT.z, 14);
      });
      once('laugh', 5.3, () => sfx.play('king_laugh', { vol: 0.9 }));
    }
    kingState.talking = t > 5.2;
    if (k) {
      kingState.x = k.position.x;
      kingState.y = k.position.y;
      kingState.z = k.position.z;
    }
    once('results', 7.6, () => useGame.getState().set({ showResults: true }));
  });

  return (
    <group>
      <group ref={king} visible={false}>
        <King />
      </group>
    </group>
  );
}
