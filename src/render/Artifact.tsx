// The golden royal artifact: four forms, one synced transform, magical pop-morph between forms.
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { SHAPES } from '../shared/shapes';
import { frame } from './frame';
import { fx } from './Effects';
import { sfx } from '../audio/audio';
import { artifactOverride } from './Ending';

function panelTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 256, 256);
  grd.addColorStop(0, '#fff0b0');
  grd.addColorStop(0.5, '#ffd45a');
  grd.addColorStop(1, '#f2b53c');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  // engraved border
  g.strokeStyle = 'rgba(150,90,20,0.55)';
  g.lineWidth = 6;
  g.strokeRect(22, 22, 212, 212);
  g.strokeStyle = 'rgba(255,250,220,0.7)';
  g.lineWidth = 2;
  g.strokeRect(29, 29, 198, 198);
  // rune swirl
  g.strokeStyle = 'rgba(160,100,30,0.35)';
  g.lineWidth = 4;
  g.beginPath();
  g.arc(128, 128, 46, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
    const x = 128 + Math.cos(a) * 34, y = 128 + Math.sin(a) * 34;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
  g.stroke();
  // rivets
  g.fillStyle = 'rgba(170,105,25,0.6)';
  for (const [x, y] of [[40, 40], [216, 40], [40, 216], [216, 216]]) {
    g.beginPath();
    g.arc(x, y, 7, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function useGoldMaterials() {
  return useMemo(() => {
    const map = panelTexture();
    const body = new THREE.MeshStandardMaterial({ map, color: '#ffffff', metalness: 0.42, roughness: 0.3, emissive: '#8a5200', emissiveIntensity: 0.22 });
    const trim = new THREE.MeshStandardMaterial({ color: '#e8a93a', metalness: 0.6, roughness: 0.32, emissive: '#5a3200', emissiveIntensity: 0.2 });
    const ball = new THREE.MeshPhysicalMaterial({ color: '#ffd153', metalness: 0.12, roughness: 0.2, clearcoat: 0.8, clearcoatRoughness: 0.2, emissive: '#8a5200', emissiveIntensity: 0.18 });
    const gem = new THREE.MeshStandardMaterial({ color: '#7ff0ff', emissive: '#29d4e8', emissiveIntensity: 1.2, roughness: 0.2 });
    return { body, trim, ball, gem };
  }, []);
}

function CornerCaps({ hx, hy, hz, mat }: { hx: number; hy: number; hz: number; mat: THREE.Material }) {
  const pts: [number, number, number][] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) pts.push([x * hx, y * hy, z * hz]);
  return (
    <>
      {pts.map((p, i) => (
        <mesh key={i} position={p} material={mat} castShadow>
          <sphereGeometry args={[0.13, 10, 8]} />
        </mesh>
      ))}
    </>
  );
}

function CubeForm({ m }: { m: ReturnType<typeof useGoldMaterials> }) {
  const geo = useMemo(() => new RoundedBoxGeometry(2, 2, 2, 3, 0.16), []);
  return (
    <group>
      <mesh geometry={geo} material={m.body} castShadow receiveShadow />
      {/* straps */}
      <mesh material={m.trim} castShadow>
        <boxGeometry args={[2.06, 0.22, 2.06]} />
      </mesh>
      <mesh material={m.trim} castShadow>
        <boxGeometry args={[0.22, 2.06, 2.06]} />
      </mesh>
      <mesh position={[0, 0, 1.06]} material={m.gem}>
        <octahedronGeometry args={[0.2, 0]} />
      </mesh>
      <mesh position={[0, 0, -1.06]} material={m.gem}>
        <octahedronGeometry args={[0.2, 0]} />
      </mesh>
      <CornerCaps hx={0.93} hy={0.93} hz={0.93} mat={m.trim} />
    </group>
  );
}

function LongForm({ m }: { m: ReturnType<typeof useGoldMaterials> }) {
  const s = SHAPES[1].half;
  const geo = useMemo(() => new RoundedBoxGeometry(s[0] * 2, s[1] * 2, s[2] * 2, 3, 0.12), [s]);
  return (
    <group>
      <mesh geometry={geo} material={m.body} castShadow receiveShadow />
      {[-1.6, 0, 1.6].map((x) => (
        <mesh key={x} position={[x, 0, 0]} material={m.trim} castShadow>
          <boxGeometry args={[0.22, s[1] * 2 + 0.06, s[2] * 2 + 0.06]} />
        </mesh>
      ))}
      {[-1, 1].map((e) => (
        <mesh key={e} position={[e * (s[0] + 0.02), 0, 0]} material={m.gem} rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[0.08, 0.28, 0.28]} />
        </mesh>
      ))}
    </group>
  );
}

function TallForm({ m }: { m: ReturnType<typeof useGoldMaterials> }) {
  const s = SHAPES[2].half;
  const geo = useMemo(() => new RoundedBoxGeometry(s[0] * 2, s[1] * 2, s[2] * 2, 3, 0.12), [s]);
  return (
    <group>
      <mesh geometry={geo} material={m.body} castShadow receiveShadow />
      {[-1.5, -0.5, 0.5, 1.5].map((y) => (
        <mesh key={y} position={[0, y, 0]} material={m.trim} castShadow>
          <boxGeometry args={[s[0] * 2 + 0.06, 0.18, s[2] * 2 + 0.06]} />
        </mesh>
      ))}
      <mesh position={[0, s[1] + 0.12, 0]} material={m.gem}>
        <octahedronGeometry args={[0.24, 0]} />
      </mesh>
    </group>
  );
}

function RoundForm({ m }: { m: ReturnType<typeof useGoldMaterials> }) {
  const r = SHAPES[3].half[0];
  return (
    <group>
      <mesh material={m.ball} castShadow receiveShadow>
        <sphereGeometry args={[r, 40, 28]} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} material={m.trim} castShadow>
        <torusGeometry args={[r * 0.99, 0.07, 10, 48]} />
      </mesh>
      <mesh rotation={[0, 0, 0]} material={m.trim}>
        <torusGeometry args={[r * 0.99, 0.05, 8, 48]} />
      </mesh>
      <mesh position={[0, 0, r + 0.02]} material={m.gem}>
        <octahedronGeometry args={[0.18, 0]} />
      </mesh>
    </group>
  );
}

const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();

const easeOutBack = (t: number) => {
  const c1 = 2.2;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export function Artifact() {
  const m = useGoldMaterials();
  const root = useRef<THREE.Group>(null);
  const forms = [useRef<THREE.Group>(null), useRef<THREE.Group>(null), useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const ring = useRef<THREE.Mesh>(null);
  const ringMat = useRef<THREE.MeshBasicMaterial>(null);
  const halo = useRef<THREE.PointLight>(null);
  const state = useRef({ from: 0, to: 0, t: 1, init: false });
  const ringSpin = useRef(0);
  useFrame((_, dtRaw) => {
    const dt = Math.min(0.05, dtRaw);
    const a = frame.current.artifact;
    const g = root.current;
    if (!g) return;
    if (artifactOverride.active) {
      g.position.set(artifactOverride.x, artifactOverride.y, artifactOverride.z);
      g.quaternion.setFromEuler(tmpE.set(0, artifactOverride.spin, 0));
      g.scale.setScalar(artifactOverride.s);
    } else {
      g.position.set(a.x, a.y, a.z);
      g.quaternion.set(a.qx, a.qy, a.qz, a.qw);
      g.scale.setScalar(1);
    }
    const st = state.current;
    if (!st.init) {
      st.init = true;
      st.to = st.from = a.shape;
    }
    if (a.shape !== st.to) {
      st.from = st.to;
      st.to = a.shape;
      st.t = 0;
      if (frame.live) {
        fx.sparkle(a.x, a.y, a.z, 70, 2.2);
        sfx.play('shift', { rate: [1.0, 0.85, 1.12, 1.25][a.shape], vol: 0.8 });
      }
    }
    st.t = Math.min(1, st.t + dt / 0.42);
    for (let i = 0; i < 4; i++) {
      const f = forms[i].current;
      if (!f) continue;
      if (i === st.to) {
        f.visible = true;
        const k = easeOutBack(Math.min(1, st.t / 0.85));
        const s = st.t >= 1 ? 1 : 0.35 + 0.65 * k;
        // squash-stretch wobble
        const w = st.t >= 1 ? 0 : Math.sin(st.t * Math.PI * 3) * (1 - st.t) * 0.12;
        f.scale.set(s * (1 + w), s * (1 - w), s * (1 + w));
      } else if (i === st.from && st.t < 0.3) {
        f.visible = true;
        const s = 1 - st.t / 0.3;
        f.scale.set(s * 1.1, s * 0.9, s * 1.1);
      } else f.visible = false;
    }
    if (ring.current && ringMat.current) {
      const t = st.t;
      ring.current.visible = t < 1;
      ring.current.scale.setScalar(0.6 + t * 3.2);
      ringSpin.current += dt * 9;
      ringMat.current.opacity = (1 - t) * 0.9;
      tmpQ.setFromEuler(tmpE.set(-Math.PI / 2, 0, ringSpin.current));
      ring.current.quaternion.copy(g.quaternion).invert().multiply(tmpQ);
    }
    if (halo.current) halo.current.intensity = 6 + (1 - st.t) * 40;
  });
  return (
    <group ref={root}>
      <group ref={forms[0]}>
        <CubeForm m={m} />
      </group>
      <group ref={forms[1]} visible={false}>
        <LongForm m={m} />
      </group>
      <group ref={forms[2]} visible={false}>
        <TallForm m={m} />
      </group>
      <group ref={forms[3]} visible={false}>
        <RoundForm m={m} />
      </group>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <torusGeometry args={[1, 0.06, 6, 40]} />
        <meshBasicMaterial ref={ringMat} color="#fff6c0" transparent opacity={0} depthWrite={false} />
      </mesh>
      <pointLight ref={halo} color="#ffd36b" intensity={6} distance={7} decay={2} />
    </group>
  );
}
