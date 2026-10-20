// Ending cutscene: castle doors open, the King waddles out... and uses the magical artifact as a doorstop.
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGame } from '../app/store';
import { castleDoor } from './Castle';
import { frame } from './frame';
import { fx } from './Effects';
import { sfx } from '../audio/audio';
import { MAT } from './materials';

export const artifactOverride = { active: false, x: 0, y: 0, z: 0, s: 1, spin: 0 };
export const kingState = { x: 0, y: 0, z: -171, talking: false };

const DOOR_SPOT = new THREE.Vector3(1.75, 0.5, -169.2);

const KING_BODY = (() => {
  const pts = [[0, 0], [0.42, 0.02], [0.56, 0.16], [0.6, 0.42], [0.56, 0.72], [0.46, 0.92], [0.3, 1.02], [0, 1.05]].map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(pts, 28);
})();

/** The King: a round chibi monarch in a purple robe with an ermine collar, red cape, fluffy beard and jewelled crown. */
function King() {
  const m = useMemo(
    () => ({
      robe: new THREE.MeshStandardMaterial({ color: '#8f7be0', roughness: 0.55 }),
      cape: new THREE.MeshStandardMaterial({ color: '#e45b6f', roughness: 0.7, side: THREE.DoubleSide }),
      fur: new THREE.MeshStandardMaterial({ color: '#fff8f0', roughness: 0.9 }),
      spot: new THREE.MeshStandardMaterial({ color: '#2a2338', roughness: 0.6 }),
      skin: new THREE.MeshStandardMaterial({ color: '#ffd9b8', roughness: 0.65 }),
      cheek: new THREE.MeshStandardMaterial({ color: '#ff9fb2', roughness: 0.8 }),
      eye: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.25 }),
      pupil: new THREE.MeshStandardMaterial({ color: '#241d33', roughness: 0.2 }),
      gold: new THREE.MeshStandardMaterial({ color: '#ffcf5a', metalness: 1, roughness: 0.28 }),
      gem: new THREE.MeshStandardMaterial({ color: '#ff5d7a', emissive: '#ff2d55', emissiveIntensity: 0.8, roughness: 0.2 }),
      gem2: new THREE.MeshStandardMaterial({ color: '#7ff0ff', emissive: '#29d4e8', emissiveIntensity: 0.8, roughness: 0.2 }),
      shoe: new THREE.MeshStandardMaterial({ color: '#5a3b6e', roughness: 0.6 }),
    }),
    [],
  );
  return (
    <group scale={1.55}>
      <mesh geometry={KING_BODY} material={m.robe} castShadow />
      {/* robe trim + buttons */}
      <mesh position={[0, 0.06, 0]} rotation={[Math.PI / 2, 0, 0]} material={m.fur}>
        <torusGeometry args={[0.5, 0.07, 8, 28]} />
      </mesh>
      {[0.3, 0.48, 0.66].map((y) => (
        <mesh key={y} position={[0, y, 0.58]} material={m.gold}>
          <sphereGeometry args={[0.045, 10, 8]} />
        </mesh>
      ))}
      {/* cape */}
      <mesh position={[0, 0.5, -0.38]} rotation={[0.18, 0, 0]} material={m.cape} castShadow>
        <cylinderGeometry args={[0.5, 0.66, 1.0, 20, 1, true, Math.PI * 0.62, Math.PI * 0.76]} />
      </mesh>
      {/* ermine collar */}
      <mesh position={[0, 0.98, 0]} rotation={[Math.PI / 2, 0, 0]} material={m.fur}>
        <torusGeometry args={[0.36, 0.11, 10, 28]} />
      </mesh>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <mesh key={i} position={[Math.cos((i / 6) * Math.PI * 2 + 0.3) * 0.43, 1.0, Math.sin((i / 6) * Math.PI * 2 + 0.3) * 0.43]} material={m.spot}>
          <sphereGeometry args={[0.025, 6, 5]} />
        </mesh>
      ))}
      {/* head */}
      <group position={[0, 1.42, 0]}>
        <mesh material={m.skin} castShadow>
          <sphereGeometry args={[0.42, 24, 18]} />
        </mesh>
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 0.15, 0.06, 0.34]}>
            <mesh material={m.eye} scale={[1, 1.15, 0.6]}>
              <sphereGeometry args={[0.09, 14, 10]} />
            </mesh>
            <mesh position={[0, -0.01, 0.05]} material={m.pupil} scale={[1, 1.1, 0.6]}>
              <sphereGeometry args={[0.055, 12, 8]} />
            </mesh>
            <mesh position={[0.02, 0.03, 0.08]} material={m.eye}>
              <sphereGeometry args={[0.018, 6, 5]} />
            </mesh>
            <mesh position={[0, 0.13, 0.02]} rotation={[0, 0, s * -0.25]} material={m.fur}>
              <boxGeometry args={[0.13, 0.04, 0.04]} />
            </mesh>
          </group>
        ))}
        {[-1, 1].map((s) => (
          <mesh key={'c' + s} position={[s * 0.27, -0.06, 0.3]} scale={[1, 0.6, 0.4]} material={m.cheek}>
            <sphereGeometry args={[0.07, 10, 8]} />
          </mesh>
        ))}
        <mesh position={[0, -0.04, 0.42]} material={m.skin}>
          <sphereGeometry args={[0.07, 10, 8]} />
        </mesh>
        {/* mustache + fluffy beard */}
        {[-1, 1].map((s) => (
          <mesh key={'m' + s} position={[s * 0.1, -0.12, 0.39]} rotation={[0, 0, s * 0.35]} scale={[1.4, 0.6, 0.6]} material={m.fur}>
            <sphereGeometry args={[0.08, 10, 8]} />
          </mesh>
        ))}
        {[[0, -0.3, 0.3, 0.17], [-0.16, -0.24, 0.27, 0.13], [0.16, -0.24, 0.27, 0.13], [-0.08, -0.4, 0.24, 0.12], [0.08, -0.4, 0.24, 0.12], [0, -0.48, 0.2, 0.1]].map(([x, y, z, r], i) => (
          <mesh key={'b' + i} position={[x, y, z]} material={m.fur} castShadow>
            <icosahedronGeometry args={[r, 1]} />
          </mesh>
        ))}
        {/* crown */}
        <group position={[0, 0.34, 0]}>
          <mesh material={m.gold}>
            <cylinderGeometry args={[0.3, 0.33, 0.2, 20, 1, true]} />
          </mesh>
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const a = (i / 6) * Math.PI * 2;
            return (
              <group key={i} position={[Math.cos(a) * 0.31, 0.17, Math.sin(a) * 0.31]}>
                <mesh material={m.gold}>
                  <coneGeometry args={[0.07, 0.2, 4]} />
                </mesh>
                <mesh position={[0, 0.13, 0]} material={m.gold}>
                  <sphereGeometry args={[0.04, 8, 6]} />
                </mesh>
              </group>
            );
          })}
          <mesh position={[0, 0.02, 0.31]} material={m.gem}>
            <octahedronGeometry args={[0.07, 0]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.22, 0.02, 0.22]} material={m.gem2}>
              <octahedronGeometry args={[0.05, 0]} />
            </mesh>
          ))}
          <mesh position={[0, -0.02, 0]} material={m.cape}>
            <sphereGeometry args={[0.29, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
        </group>
      </group>
      {/* arms + scepter */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.56, 0.62, 0.08]} rotation={[0, 0, s * 0.5]}>
          <mesh position={[0, -0.12, 0]} material={m.robe}>
            <capsuleGeometry args={[0.1, 0.22, 4, 10]} />
          </mesh>
          <mesh position={[0, -0.3, 0.02]} material={m.skin}>
            <sphereGeometry args={[0.1, 12, 10]} />
          </mesh>
        </group>
      ))}
      <group position={[0.78, 0.5, 0.18]} rotation={[0.2, 0, -0.25]}>
        <mesh position={[0, 0.35, 0]} material={m.gold}>
          <cylinderGeometry args={[0.03, 0.035, 0.9, 8]} />
        </mesh>
        <mesh position={[0, 0.85, 0]} material={m.gem2}>
          <icosahedronGeometry args={[0.1, 1]} />
        </mesh>
      </group>
      {[-1, 1].map((s) => (
        <mesh key={'f' + s} position={[s * 0.2, 0.04, 0.2]} scale={[1, 0.6, 1.5]} material={m.shoe}>
          <sphereGeometry args={[0.13, 12, 8]} />
        </mesh>
      ))}
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
