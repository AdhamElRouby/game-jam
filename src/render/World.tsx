// Course geometry (from shared LEVEL data) + the synced puzzle machines.
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { LEVEL, drawbridgeAngle, smooth, type BoxDef } from '../shared/level';
import { buildIsland } from './islandGeo';
import { MAT } from './materials';
import { frame } from './frame';
import { camFocus } from './CameraRig';
import { useGame } from '../app/store';
import { quatEuler } from '../shared/math';

const tmpQ = new THREE.Quaternion();

/** Fades its meshes when the camera focus sits just behind it (walls between camera and team). */
function Fade({ b, children }: { b: BoxDef; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const mats = useRef<THREE.Material[]>([]);
  const op = useRef(1);
  useEffect(() => {
    const g = ref.current;
    if (!g) return;
    const list: THREE.Material[] = [];
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.material) {
        const c = (m.material as THREE.Material).clone();
        c.transparent = true;
        m.material = c;
        list.push(c);
      }
    });
    mats.current = list;
  }, []);
  useFrame((_, dt) => {
    const top = b.p[1] + b.s[1] / 2;
    const zNear = b.p[2] + b.s[2] / 2;
    const zFar = b.p[2] - b.s[2] / 2;
    const fz = camFocus.z;
    const fx = camFocus.x;
    const inX = fx > b.p[0] - b.s[0] / 2 - 6 && fx < b.p[0] + b.s[0] / 2 + 6;
    const behind = fz < zNear + 1 && fz > zFar - (top - camFocus.y) / 1.05 - 3.5;
    const target = inX && behind ? 0.22 : 1;
    op.current += (target - op.current) * Math.min(1, dt * 6);
    for (const m of mats.current) {
      (m as THREE.MeshStandardMaterial).opacity = op.current;
      m.depthWrite = op.current > 0.95;
    }
  });
  return <group ref={ref}>{children}</group>;
}

function Islands() {
  const meshes = useMemo(() => LEVEL.islands.map((isl) => ({ id: isl.id, ...buildIsland(isl) })), []);
  return (
    <group>
      {meshes.map((m) => (
        <group key={m.id}>
          <mesh geometry={m.top} material={MAT.grass} receiveShadow />
          <mesh geometry={m.lip} material={MAT.grassRim} receiveShadow castShadow />
          <mesh geometry={m.cliff} material={MAT.cliff} castShadow receiveShadow />
          <mesh geometry={m.under} material={MAT.rock} />
        </group>
      ))}
    </group>
  );
}

function rotOf(b: BoxDef): [number, number, number] {
  return b.rot ? [b.rot[0], b.rot[1], b.rot[2]] : [0, 0, 0];
}

/** Wooden bridge deck: planks across + side beams. */
function BridgeDeck({ b }: { b: BoxDef }) {
  const planks = useMemo(() => {
    const n = Math.floor(b.s[2] / 0.55);
    return Array.from({ length: n }, (_, i) => ({ z: -b.s[2] / 2 + 0.3 + i * (b.s[2] - 0.6) / Math.max(1, n - 1), r: ((i * 37) % 7) / 7 }));
  }, [b]);
  return (
    <group position={b.p}>
      {planks.map((p, i) => (
        <mesh key={i} position={[0, b.s[1] / 2 - 0.07 + 0.03, p.z]} rotation={[0, (p.r - 0.5) * 0.04, 0]} material={MAT.plank} castShadow receiveShadow>
          <boxGeometry args={[b.s[0] - 0.1 - p.r * 0.2, 0.14, 0.48]} />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (b.s[0] / 2 - 0.25), -0.05, 0]} material={MAT.darkwood} castShadow>
          <boxGeometry args={[0.35, 0.35, b.s[2]]} />
        </mesh>
      ))}
    </group>
  );
}

/** Wooden railing: posts + two rails. */
function Railing({ b }: { b: BoxDef }) {
  const len = Math.max(b.s[0], b.s[2]);
  const alongX = b.s[0] > b.s[2];
  const posts = Math.max(2, Math.round(len / 1.7) + 1);
  return (
    <group position={b.p} rotation={rotOf(b)}>
      {Array.from({ length: posts }, (_, i) => {
        const t = -len / 2 + (i * len) / (posts - 1);
        return (
          <mesh key={i} position={alongX ? [t, 0, 0] : [0, 0, t]} material={MAT.darkwood} castShadow>
            <boxGeometry args={[0.2, b.s[1], 0.2]} />
          </mesh>
        );
      })}
      {[0.45, -0.05].map((y) => (
        <mesh key={y} position={[0, y, 0]} material={MAT.wood} castShadow>
          <boxGeometry args={alongX ? [len, 0.14, 0.16] : [0.16, 0.14, len]} />
        </mesh>
      ))}
    </group>
  );
}

/** Wooden palisade wall of pointed logs. */
function Palisade({ b }: { b: BoxDef }) {
  const n = Math.round(b.s[0] / 0.5);
  return (
    <group position={b.p}>
      {Array.from({ length: n }, (_, i) => {
        const x = -b.s[0] / 2 + 0.25 + i * ((b.s[0] - 0.5) / (n - 1));
        const h = b.s[1] + ((i * 53) % 5) * 0.08;
        return (
          <group key={i} position={[x, 0, 0]}>
            <mesh position={[0, (h - b.s[1]) / 2, 0]} material={MAT.darkwood} castShadow receiveShadow>
              <cylinderGeometry args={[0.26, 0.28, h, 7]} />
            </mesh>
            <mesh position={[0, h - b.s[1] / 2 + 0.2, 0]} material={MAT.wood} castShadow>
              <coneGeometry args={[0.26, 0.45, 7]} />
            </mesh>
          </group>
        );
      })}
      <mesh position={[0, 0.5, 0.18]} material={MAT.wood}>
        <boxGeometry args={[b.s[0], 0.22, 0.12]} />
      </mesh>
    </group>
  );
}

function StoneBlock({ b, radius = 0.12 }: { b: BoxDef; radius?: number }) {
  return (
    <RoundedBox args={b.s} radius={Math.min(radius, Math.min(...b.s) / 2 - 0.01)} smoothness={2} position={b.p} rotation={rotOf(b)} material={MAT.stone} castShadow receiveShadow />
  );
}

function Ramp({ b }: { b: BoxDef }) {
  const mat = useMemo(() => {
    const m = MAT.path.clone();
    const t = MAT.path.map!.clone();
    t.repeat.set(b.s[0] / 2.6, b.s[2] / 2.6);
    t.needsUpdate = true;
    m.map = t;
    return m;
  }, [b]);
  return (
    <group position={b.p} rotation={rotOf(b)}>
      <mesh material={MAT.stonePlain} castShadow receiveShadow>
        <boxGeometry args={[b.s[0], b.s[1], b.s[2]]} />
      </mesh>
      <mesh position={[0, b.s[1] / 2 + 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mat} receiveShadow>
        <planeGeometry args={[b.s[0] - 0.1, b.s[2]]} />
      </mesh>
    </group>
  );
}

function CargoBarrier({ b }: { b: BoxDef }) {
  const curtain = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (curtain.current) curtain.current.opacity = 0.18 + Math.sin(clock.elapsedTime * 3) * 0.06;
  });
  return (
    <group position={[b.p[0], 0, b.p[2]]}>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (b.s[0] / 2 - 0.15), 1.1, 0]} material={MAT.darkwood} castShadow>
          <cylinderGeometry args={[0.13, 0.15, 2.2, 8]} />
        </mesh>
      ))}
      <mesh position={[0, 1.9, 0]} material={MAT.rope}>
        <boxGeometry args={[b.s[0] - 0.3, 0.07, 0.07]} />
      </mesh>
      <mesh position={[0, 1.15, 0]}>
        <planeGeometry args={[b.s[0] - 0.3, 1.5]} />
        <meshStandardMaterial ref={curtain} color="#7fe8ff" emissive="#41c8e8" emissiveIntensity={0.8} transparent opacity={0.2} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <group position={[0, 2.35, 0.05]}>
        <mesh material={MAT.wood}>
          <boxGeometry args={[1.6, 0.55, 0.08]} />
        </mesh>
        <SignIcon text="couriers only" />
      </group>
    </group>
  );
}

function SignIcon({ text }: { text: string }) {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 96;
    const g = c.getContext('2d')!;
    g.fillStyle = '#5a3a24';
    g.font = 'bold 34px Fredoka, Nunito, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text.toUpperCase(), 128, 50);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [text]);
  return (
    <mesh position={[0, 0, 0.05]}>
      <planeGeometry args={[1.5, 0.5]} />
      <meshBasicMaterial map={tex} transparent />
    </mesh>
  );
}

function StaticBoxes() {
  return (
    <group>
      {LEVEL.boxes.map((b, i) => {
        const key = b.id ?? String(i);
        switch (b.tag) {
          case 'bridge':
            return <BridgeDeck key={key} b={b} />;
          case 'rail':
            return <Railing key={key} b={b} />;
          case 'palisade':
            return (
              <Fade key={key} b={b}>
                <Palisade b={b} />
              </Fade>
            );
          case 'ramp':
            return <Ramp key={key} b={b} />;
          case 'cargoBarrier':
            return <CargoBarrier key={key} b={b} />;
          case 'bracket':
            return (
              <RoundedBox key={key} args={b.s} radius={0.08} smoothness={2} position={b.p} material={MAT.gold} castShadow />
            );
          case 'post':
            return (
              <mesh key={key} position={b.p} material={MAT.darkwood} castShadow>
                <cylinderGeometry args={[0.24, 0.28, b.s[1], 8]} />
              </mesh>
            );
          case 'castlewall':
            return null; // drawn by the Castle (with a real doorway)
          case 'archwall':
          case 'archtop':
            return (
              <Fade key={key} b={b}>
                <StoneBlock b={b} />
              </Fade>
            );
          case 'curb':
          case 'funnel':
          default:
            if (b.mat === 'invisible') return null;
            return <StoneBlock key={key} b={b} />;
        }
      })}
    </group>
  );
}

// ------------------------------------------------------------------ puzzle machines

function Gate() {
  const ref = useRef<THREE.Group>(null);
  const g = LEVEL.gate;
  useFrame(() => {
    if (!ref.current) return;
    ref.current.position.y = g.p[1] - g.drop * smooth(frame.current.w.gate);
  });
  return (
    <group ref={ref} position={g.p}>
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={i} position={[-g.s[0] / 2 + 0.42 + i * ((g.s[0] - 0.84) / 5), 0, 0]} material={MAT.wood} castShadow receiveShadow>
          <boxGeometry args={[0.72, g.s[1], g.s[2]]} />
        </mesh>
      ))}
      {[-0.9, 0.9].map((y) => (
        <mesh key={y} position={[0, y, g.s[2] / 2 + 0.02]} material={MAT.iron} castShadow>
          <boxGeometry args={[g.s[0] - 0.2, 0.22, 0.08]} />
        </mesh>
      ))}
      <mesh position={[0, 0, g.s[2] / 2 + 0.07]} material={MAT.gold}>
        <cylinderGeometry args={[0.32, 0.32, 0.08, 20]} />
      </mesh>
    </group>
  );
}

function Plate() {
  const top = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.MeshStandardMaterial>(null);
  const P = LEVEL.plate;
  useFrame(({ clock }) => {
    const w = frame.current.w;
    const pressed = w.gate > 0 ? 1 : w.plate;
    if (top.current) top.current.position.y = 0.06 - pressed * 0.05;
    if (ring.current) ring.current.emissiveIntensity = w.gate > 0 ? 1.2 : 0.35 + pressed * 1.2 + Math.sin(clock.elapsedTime * 4) * 0.15;
  });
  return (
    <group position={[P.p[0], 0, P.p[2]]}>
      <mesh ref={top} position={[0, 0.06, 0]} material={MAT.plank} receiveShadow castShadow>
        <boxGeometry args={[P.s[0] - 0.2, 0.12, P.s[1] - 0.2]} />
      </mesh>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[P.s[0] / 2 - 0.1, P.s[0] / 2 + 0.12, 4, 1, Math.PI / 4]} />
        <meshStandardMaterial ref={ring} color="#ffe27a" emissive="#ffb300" emissiveIntensity={0.4} />
      </mesh>
      {/* cube silhouette hint */}
      <mesh position={[0, 0.13, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.8, 0.95, 4, 1, Math.PI / 4]} />
        <meshBasicMaterial color="#8d5a2b" transparent opacity={0.5} />
      </mesh>
    </group>
  );
}

function Receiver() {
  const glow = useRef<THREE.MeshStandardMaterial>(null);
  const R = LEVEL.receiver;
  useFrame(({ clock }) => {
    const w = frame.current.w;
    if (glow.current) {
      glow.current.emissiveIntensity = w.bridge > 0 ? 0.6 : 0.5 + w.recv * 2 + Math.sin(clock.elapsedTime * 5) * 0.2;
      glow.current.opacity = w.bridge > 0 ? 0.35 : 0.7;
    }
  });
  return (
    <group position={[R.p[0], 0.02, R.p[2]]}>
      {/* LONG silhouette slot */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[5.0, 1.25]} />
        <meshStandardMaterial ref={glow} color="#8ff6ee" emissive="#2fd6c8" emissiveIntensity={0.6} transparent opacity={0.7} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.3, 0.42, 24]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.7} />
      </mesh>
    </group>
  );
}

function Drawbridge() {
  const ref = useRef<THREE.Group>(null);
  const D = LEVEL.drawbridge;
  useFrame(() => {
    if (!ref.current) return;
    const u = frame.current.w.bridge;
    const eased = u >= 1 ? 1 : smooth(u) + Math.sin(u * Math.PI) * 0.06 * u;
    ref.current.rotation.x = drawbridgeAngle(Math.min(1.04, eased));
  });
  const planks = Math.floor(D.len / 0.5);
  return (
    <group position={D.hinge}>
      <group ref={ref}>
        {Array.from({ length: planks }, (_, i) => (
          <mesh key={i} position={[0, -D.thick / 2, 0.27 + i * ((D.len - 0.5) / (planks - 1))]} material={MAT.plank} castShadow receiveShadow>
            <boxGeometry args={[D.width - 0.1, D.thick, 0.46]} />
          </mesh>
        ))}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * (D.width / 2 - 0.2), D.curb / 2, D.len / 2]} material={MAT.darkwood} castShadow>
            <boxGeometry args={[0.4, D.curb, D.len]} />
          </mesh>
        ))}
        {[-1, 1].map((s) => (
          <mesh key={'h' + s} position={[s * (D.width / 2 - 0.9), 0.05, 0.1]} rotation={[0, 0, Math.PI / 2]} material={MAT.gold}>
            <cylinderGeometry args={[0.22, 0.22, 0.6, 14]} />
          </mesh>
        ))}
      </group>
      {/* chain towers on the far side */}
      {[-1, 1].map((s) => (
        <group key={'t' + s} position={[s * (D.width / 2 + 0.3), 0, -0.5]}>
          <mesh position={[0, 1.8, 0]} material={MAT.darkwood} castShadow>
            <boxGeometry args={[0.5, 3.6, 0.5]} />
          </mesh>
          <mesh position={[0, 3.75, 0]} material={MAT.teal} castShadow>
            <coneGeometry args={[0.5, 0.6, 4]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Lever() {
  const arm = useRef<THREE.Group>(null);
  const sil = useRef<THREE.MeshBasicMaterial>(null);
  const ringMat = useRef<THREE.MeshStandardMaterial>(null);
  const L = LEVEL.lever;
  useFrame(({ clock }) => {
    const v = frame.current.w.lever;
    if (ringMat.current) ringMat.current.emissiveIntensity = v > 0 ? 0.3 : 0.9 + Math.sin(clock.elapsedTime * 4) * 0.5;
    if (arm.current) arm.current.rotation.z = 0.7 - v * 1.4;
    if (sil.current) sil.current.opacity = v > 0 ? 0.12 : 0.35 + Math.sin(clock.elapsedTime * 3) * 0.15;
  });
  return (
    <group>
      <group position={[L.p[0], L.p[1] + 0.3, L.p[2] + 0.14]}>
        <mesh material={MAT.darkwood} castShadow>
          <boxGeometry args={[2.0, 2.0, 0.28]} />
        </mesh>
        <mesh position={[0, 0, 0.15]} rotation={[0, 0, 0]}>
          <ringGeometry args={[1.05, 1.25, 32]} />
          <meshStandardMaterial ref={ringMat} color="#9ff7ef" emissive="#2fd6c8" emissiveIntensity={1} />
        </mesh>
        <mesh position={[0, 0, 0.18]} rotation={[Math.PI / 2, 0, 0]} material={MAT.gold}>
          <cylinderGeometry args={[0.26, 0.26, 0.2, 16]} />
        </mesh>
        <group ref={arm} position={[0, 0, 0.3]}>
          <mesh position={[0, -0.85, 0]} material={MAT.wood} castShadow>
            <boxGeometry args={[0.24, 1.7, 0.24]} />
          </mesh>
          <mesh position={[0, -1.75, 0]} material={MAT.teal} castShadow>
            <sphereGeometry args={[0.36, 16, 12]} />
          </mesh>
        </group>
      </group>
      {/* TALL silhouette painted on the wall */}
      <mesh position={[L.p[0], 2.2, L.p[2] + 0.03]}>
        <planeGeometry args={[1.2, 4.4]} />
        <meshBasicMaterial ref={sil} color="#fff1b0" transparent opacity={0.35} depthWrite={false} />
      </mesh>
    </group>
  );
}

function Lift() {
  const deck = useRef<THREE.Group>(null);
  const gate = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.MeshStandardMaterial>(null);
  const L = LEVEL.lift;
  useFrame(({ clock }) => {
    const w = frame.current.w;
    if (deck.current) deck.current.position.y = w.liftY;
    if (gate.current) {
      const lowered = -L.railH / 2 - 0.06;
      const raised = L.railH / 2;
      gate.current.position.y = lowered + (raised - lowered) * smooth(w.liftGate);
    }
    if (glow.current) glow.current.emissiveIntensity = w.lift === 1 ? 0.8 + Math.sin(clock.elapsedTime * 5) * 0.4 : w.lift >= 2 ? 0.6 : 0.05;
  });
  return (
    <group>
      <group ref={deck} position={[L.cx, L.bottom, L.cz]}>
        {Array.from({ length: 10 }, (_, i) => (
          <mesh key={i} position={[0, -0.13, -L.d / 2 + 0.3 + i * ((L.d - 0.6) / 9)]} material={MAT.plank} receiveShadow castShadow>
            <boxGeometry args={[L.w - 0.05, 0.26, 0.56]} />
          </mesh>
        ))}
        <mesh position={[0, -0.36, 0]} material={MAT.darkwood}>
          <boxGeometry args={[L.w, 0.2, L.d]} />
        </mesh>
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[2.3, 2.6, 4, 1, Math.PI / 4]} />
          <meshStandardMaterial ref={glow} color="#bff7f0" emissive="#2fd6c8" emissiveIntensity={0.1} transparent opacity={0.85} />
        </mesh>
        {[-1, 1].map((s) => (
          <Railing key={s} b={{ p: [s * (L.w / 2 + 0.15), L.railH / 2, 0], s: [0.3, L.railH, L.d], mat: 'rail' }} />
        ))}
        <mesh ref={gate} position={[0, -L.railH, L.d / 2 + 0.15]} material={MAT.teal} castShadow>
          <boxGeometry args={[L.w + 0.6, 0.25, 0.3]} />
        </mesh>
      </group>
      {/* gantry on top of the cliff */}
      <group position={[L.cx, L.top, L.cz - L.d / 2 - 0.4]}>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * (L.w / 2 + 0.3), 2.4, 0]} material={MAT.darkwood} castShadow>
            <boxGeometry args={[0.4, 4.8, 0.4]} />
          </mesh>
        ))}
        <mesh position={[0, 4.8, 0]} material={MAT.darkwood} castShadow>
          <boxGeometry args={[L.w + 1.2, 0.45, 0.5]} />
        </mesh>
        <mesh position={[0, 4.8, 0.2]} rotation={[Math.PI / 2, 0, 0]} material={MAT.gold}>
          <cylinderGeometry args={[0.55, 0.55, 0.3, 20]} />
        </mesh>
      </group>
      <LiftRopes />
    </group>
  );
}

function LiftRopes() {
  const L = LEVEL.lift;
  const refs = [useRef<THREE.Mesh>(null), useRef<THREE.Mesh>(null)];
  const topY = L.top + 4.8;
  useFrame(() => {
    const y = frame.current.w.liftY;
    const len = topY - (y + L.railH);
    refs.forEach((r) => {
      if (!r.current) return;
      r.current.scale.y = Math.max(0.01, len);
      r.current.position.y = y + L.railH + len / 2;
    });
  });
  return (
    <group>
      {[-1, 1].map((s, i) => (
        <mesh key={s} ref={refs[i]} position={[L.cx + s * 1.6, 0, L.cz - L.d / 2 - 0.3]} material={MAT.rope}>
          <cylinderGeometry args={[0.05, 0.05, 1, 6]} />
        </mesh>
      ))}
    </group>
  );
}

function Goal() {
  const ring = useRef<THREE.MeshStandardMaterial>(null);
  const beam = useRef<THREE.MeshBasicMaterial>(null);
  const G = LEVEL.goal;
  useFrame(({ clock }) => {
    const g = frame.current.w.goal;
    if (ring.current) ring.current.emissiveIntensity = 0.8 + g * 2.5 + Math.sin(clock.elapsedTime * 3) * 0.2;
    if (beam.current) beam.current.opacity = useGame.getState().cutscene ? 0 : 0.1 + g * 0.25 + Math.sin(clock.elapsedTime * 2) * 0.03;
  });
  return (
    <group position={G.p}>
      <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[G.r - 0.25, G.r + 0.15, 48]} />
        <meshStandardMaterial ref={ring} color="#ffe58a" emissive="#ffb000" emissiveIntensity={1} />
      </mesh>
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[G.r - 0.25, 48]} />
        <meshBasicMaterial color="#fff3c4" transparent opacity={0.35} depthWrite={false} />
      </mesh>
      <mesh position={[0, 4, 0]}>
        <cylinderGeometry args={[G.r, G.r, 8, 40, 1, true]} />
        <meshBasicMaterial ref={beam} color="#ffe9a0" transparent opacity={0.15} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

function Checkpoints() {
  return (
    <group>
      {LEVEL.checkpoints.map((cp) => (
        <CheckpointFlag key={cp.id} id={cp.id} p={cp.flag} />
      ))}
    </group>
  );
}

function CheckpointFlag({ id, p }: { id: number; p: [number, number, number] }) {
  const flag = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    const reached = frame.current.latest.cp >= id;
    if (flag.current) {
      const target = reached ? 2.55 : 1.0;
      flag.current.position.y += (target - flag.current.position.y) * 0.08;
      flag.current.rotation.y = Math.sin(clock.elapsedTime * 2 + id) * 0.15;
    }
    if (mat.current) mat.current.color.set(reached ? '#ffd153' : '#f49bb5');
  });
  return (
    <group position={p}>
      <mesh position={[0, 1.5, 0]} material={MAT.darkwood} castShadow>
        <cylinderGeometry args={[0.07, 0.09, 3, 8]} />
      </mesh>
      <mesh position={[0, 3.05, 0]} material={MAT.gold}>
        <sphereGeometry args={[0.13, 12, 10]} />
      </mesh>
      <mesh ref={flag} position={[0.55, 1.0, 0]} castShadow>
        <boxGeometry args={[1.0, 0.6, 0.04]} />
        <meshStandardMaterial ref={mat} color="#f49bb5" roughness={0.7} />
      </mesh>
    </group>
  );
}

export function World() {
  return (
    <group>
      <Islands />
      <StaticBoxes />
      <Gate />
      <Plate />
      <Receiver />
      <Drawbridge />
      <Lever />
      <Lift />
      <Goal />
      <Checkpoints />
    </group>
  );
}

void tmpQ;
void quatEuler;
