// Chapter 2 machinery (Windbridge Cliffs): wind machines, windsocks that show gust direction and strength,
// the stone LONG cradle, the chained drawbridge and the couriers-only archway. Visuals only; colliders live in LEVEL.
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { LEVEL, drawbridgeAngle, smooth, type BoxDef } from '../shared/level';
import { frame } from './frame';
import { Kit } from './kit';
import { IRON, KitMeshes, STONE, WOOD } from './Structures';
import { textTexture } from './Props';

type V3 = [number, number, number];

const glowMat = (color: string, emissive: string, intensity = 1.5) =>
  new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: intensity, roughness: 0.4 });

// ---------------------------------------------------------------- wind machine

/** Big cartoon wind machine on a timber frame; faces -X (the way it blows). Spin follows the synced gust. */
export function WindMachine({ p, which, scale = 1 }: { p: V3; which: 'wind' | 'fan'; scale?: number }) {
  const blades = useRef<THREE.Group>(null);
  const spin = useRef(0);
  const lamp = useMemo(() => glowMat('#ffd27a', '#ff9b2e', 0.2), []);
  const pennants = useRef<THREE.Group>(null);
  const make = useMemo(
    () => () => {
      const k = new Kit(733 + Math.round(p[2]));
      // trestle legs + braces
      for (const ox of [-0.9, 0.9]) for (const oz of [-0.9, 0.9]) k.beam('wood', WOOD.dark, [ox * 1.2, -3.2, oz * 1.2], [ox * 0.55, 0.2, oz * 0.55], 0.26, 0.26, 0.04);
      k.box('wood', WOOD.beam, [1.6, 0.2, 1.6], [0, 0.25, 0], [0, 0, 0], 0.04);
      k.beam('wood', WOOD.beam, [-1.05, -1.6, -1.05], [1.05, -1.6, 1.05], 0.14, 0.14, 0.02);
      k.beam('wood', WOOD.beam, [-1.05, -1.6, 1.05], [1.05, -1.6, -1.05], 0.14, 0.14, 0.02);
      // housing: ring of planks with iron hoops, axis along X
      const R = 2.0;
      const n = 16;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        k.box('wood', WOOD.plank[i % 4], [0.9, 0.18, (2 * Math.PI * R) / n + 0.05], [0, 2.1 + Math.sin(a) * R, Math.cos(a) * R], [Math.PI / 2 - a, 0, 0], 0.03, 0.06);
      }
      for (const x of [-0.42, 0.42]) {
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          k.box('metal', IRON, [0.08, 0.1, (2 * Math.PI * (R + 0.1)) / n + 0.03], [x, 2.1 + Math.sin(a) * (R + 0.1), Math.cos(a) * (R + 0.1)], [Math.PI / 2 - a, 0, 0], 0.01, 0.02);
        }
      }
      // spokes behind the blades + motor box
      k.box('wood', WOOD.dark, [0.14, R * 2, 0.14], [0.35, 2.1, 0], [0, 0, 0], 0.02);
      k.box('wood', WOOD.dark, [0.14, 0.14, R * 2], [0.35, 2.1, 0], [0, 0, 0], 0.02);
      k.box('wood', WOOD.plank[1], [1.0, 0.8, 0.8], [0.9, 2.1, 0], [0, 0, 0], 0.08);
      k.cyl('metal', IRON, 0.08, 0.08, 0.8, [0.1, 2.1, 0], [0, 0, Math.PI / 2], 8);
      // roof hat + lamp housing
      k.cone('roof', '#5ab9b3', 0.75, 0.7, [0.6, 4.65, 0], [0, Math.PI / 4, 0], 4);
      k.box('wood', WOOD.dark, [0.1, 0.5, 0.1], [0.6, 4.2, 0], [0, 0, 0], 0.02);
      return k;
    },
    [p],
  );
  useFrame(({ clock }, dtRaw) => {
    const dt = Math.min(0.05, dtRaw);
    const w = frame.current.w;
    const s = which === 'wind' ? w.wind : w.fan;
    const speed = s > 0 ? 5 + s * 22 : s < 0 ? 1.5 + -s * 7 : 0.5;
    spin.current += dt * speed;
    if (blades.current) blades.current.rotation.x = spin.current;
    // warning lamp blinks during wind-up, glows during the gust
    lamp.emissiveIntensity = s < 0 ? (Math.sin(clock.elapsedTime * 14) > 0 ? 3.2 : 0.3) : s > 0 ? 2.2 : 0.25;
    if (pennants.current) pennants.current.rotation.z = -0.2 - Math.max(0, s) * 0.9 + Math.sin(clock.elapsedTime * (6 + Math.max(0, s) * 10)) * 0.08;
  });
  return (
    <group position={p} scale={scale}>
      <KitMeshes make={make} />
      <group ref={blades} position={[-0.15, 2.1, 0]}>
        {[0, 1, 2, 3, 4].map((i) => (
          <group key={i} rotation={[(i * Math.PI * 2) / 5, 0, 0]}>
            <mesh position={[0, 0.95, 0]} rotation={[0, 0.5, 0]} castShadow>
              <boxGeometry args={[0.06, 1.55, 0.62]} />
              <meshStandardMaterial color={i % 2 ? '#fff4df' : '#f49bb5'} roughness={0.7} />
            </mesh>
          </group>
        ))}
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <coneGeometry args={[0.36, 0.6, 12]} />
          <meshStandardMaterial color="#ffcf5a" metalness={1} roughness={0.3} />
        </mesh>
      </group>
      <mesh position={[0.6, 4.25, 0]} material={lamp}>
        <sphereGeometry args={[0.2, 12, 10]} />
      </mesh>
      <group ref={pennants} position={[1.3, 3.9, 0]}>
        <mesh position={[-0.55, 0, 0]}>
          <boxGeometry args={[1.1, 0.34, 0.03]} />
          <meshStandardMaterial color="#e45b6f" side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}

// ---------------------------------------------------------------- windsock posts (replace the plain wind posts)

/** Fence post with a striped windsock: hangs limp when calm, stands out toward -X in a gust. */
export function WindsockPost({ b }: { b: BoxDef }) {
  const sock = useRef<THREE.Group>(null);
  const make = useMemo(
    () => () => {
      const k = new Kit(Math.round(b.p[2] * 3));
      k.cyl('wood', WOOD.dark, 0.2, 0.25, b.s[1] + 0.2, [0, b.s[1] / 2 - 0.1, 0], [0, 0, 0], 8);
      k.cyl('wood', WOOD.dark, 0.05, 0.06, 1.6, [0, b.s[1] + 0.8, 0], [0, 0, 0], 6);
      k.sphere('gold', '#ffcf5a', 0.09, [0, b.s[1] + 1.62, 0], [1, 1, 1], 1, 0);
      return k;
    },
    [b],
  );
  const segs = useMemo(() => [0, 1, 2, 3], []);
  useFrame(({ clock }) => {
    const w = frame.current.w.wind;
    const g = sock.current;
    if (!g) return;
    const s = Math.max(0, w);
    const t = clock.elapsedTime;
    // 0 = limp (hanging down), 1 = straight out along -X
    const lift = Math.min(1, s * 1.3 + (w < 0 ? -w * 0.25 : 0) + 0.12);
    g.rotation.z = -(1 - lift) * 1.35 + Math.sin(t * (3 + s * 12) + b.p[2]) * (0.04 + s * 0.06);
    g.rotation.y = Math.PI + Math.sin(t * 1.3 + b.p[2]) * 0.15 * (1 - s);
  });
  return (
    <group position={[b.p[0], b.p[1] - b.s[1] / 2, b.p[2]]}>
      <KitMeshes make={make} />
      <group ref={sock} position={[0, b.s[1] + 1.4, 0]}>
        {segs.map((i) => (
          <mesh key={i} position={[0.22 + i * 0.3, 0, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.2 - i * 0.035, 0.22 - i * 0.035, 0.3, 10, 1, true]} />
            <meshStandardMaterial color={i % 2 ? '#ffffff' : '#ff7a52'} roughness={0.8} side={THREE.DoubleSide} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// ---------------------------------------------------------------- receiver cradle

/** Carved stone cradle between the golden clamps; its runes fill from both ends as LONG settles in. */
export function Receiver() {
  const R = LEVEL.receiver;
  const fillL = useRef<THREE.Group>(null);
  const fillR = useRef<THREE.Group>(null);
  const holo = useRef<THREE.Mesh>(null);
  const rune = useMemo(() => glowMat('#a9fff6', '#2fd6c8', 1.4), []);
  const fill = useMemo(() => glowMat('#d8fff9', '#45f0dd', 2.6), []);
  const holoMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#8ff6ee', transparent: true, opacity: 0.25, depthWrite: false }), []);
  const make = useMemo(
    () => () => {
      const k = new Kit(515);
      const L = 5.0, W = 1.3;
      // low stone kerb around a sunken bed
      k.box('stone', STONE.dark, [L, 0.05, W], [0, 0.02, 0], [0, 0, 0], 0.01, 0);
      for (const s of [-1, 1]) {
        k.box('stone', STONE.block[1], [L + 0.4, 0.14, 0.22], [0, 0.07, s * (W / 2 + 0.11)], [0, 0, 0], 0.05, 0.05);
      }
      // rune studs along the bed
      for (let i = 0; i < 9; i++) k.box('stone', STONE.block[3], [0.16, 0.06, 0.16], [-L / 2 + 0.35 + i * ((L - 0.7) / 8), 0.06, 0], [0, Math.PI / 4, 0], 0.02, 0.04);
      return k;
    },
    [],
  );
  useFrame(({ clock }) => {
    const w = frame.current.w;
    const done = w.bridge > 0;
    const prog = done ? 1 : w.recv;
    for (const m of [fillL.current, fillR.current]) if (m) m.scale.x = Math.max(0.001, prog);
    rune.emissiveIntensity = done ? 0.6 : 1.0 + Math.sin(clock.elapsedTime * 4) * 0.5 + prog * 1.5;
    fill.emissiveIntensity = done ? 1.2 : 2.6;
    if (holo.current) {
      const shape = frame.current.artifact.shape;
      holo.current.visible = !done && shape !== 1;
      holoMat.opacity = 0.16 + Math.sin(clock.elapsedTime * 3) * 0.08;
      holo.current.position.y = 0.55 + Math.sin(clock.elapsedTime * 1.6) * 0.06;
    }
  });
  return (
    <group position={[R.p[0], 0, R.p[2]]}>
      <KitMeshes make={make} />
      {/* rune channel + progress fill (two halves grow toward the centre) */}
      <mesh position={[0, 0.055, 0]} material={rune}>
        <boxGeometry args={[4.6, 0.02, 0.12]} />
      </mesh>
      {/* each half grows from its outer end toward the centre (group scaled, mesh offset by half its length) */}
      <group ref={fillL} position={[-2.3, 0.07, 0]}>
        <mesh material={fill} position={[1.15, 0, 0]}>
          <boxGeometry args={[2.3, 0.025, 0.2]} />
        </mesh>
      </group>
      <group ref={fillR} position={[2.3, 0.07, 0]} rotation={[0, Math.PI, 0]}>
        <mesh material={fill} position={[1.15, 0, 0]}>
          <boxGeometry args={[2.3, 0.025, 0.2]} />
        </mesh>
      </group>
      {/* ghost of the LONG beam hovering over the cradle until the artifact is LONG */}
      <mesh ref={holo} material={holoMat} position={[0, 0.55, 0]}>
        <boxGeometry args={[4.7, 0.76, 1.1]} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------- drawbridge

export function Drawbridge() {
  const ref = useRef<THREE.Group>(null);
  const chains = [useRef<THREE.Mesh>(null), useRef<THREE.Mesh>(null)];
  const wheels = [useRef<THREE.Mesh>(null), useRef<THREE.Mesh>(null)];
  const D = LEVEL.drawbridge;
  const tmp = useMemo(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), q: new THREE.Quaternion(), up: new THREE.Vector3(0, 1, 0) }), []);
  const deck = useMemo(
    () => () => {
      const k = new Kit(818);
      const n = Math.floor(D.len / 0.46);
      for (let i = 0; i < n; i++) k.box('wood', WOOD.plank[i % 4], [D.width - 0.6, D.thick, (D.len - 0.1) / n - 0.04], [0, -D.thick / 2, 0.08 + ((i + 0.5) * (D.len - 0.1)) / n], [0, 0, 0], 0.03, 0.07);
      for (const s of [-1, 1]) k.box('wood', WOOD.dark, [0.4, D.curb + D.thick, D.len], [s * (D.width / 2 - 0.2), (D.curb - D.thick) / 2, D.len / 2], [0, 0, 0], 0.05);
      for (const z of [0.6, D.len / 2, D.len - 0.5]) k.box('metal', IRON, [D.width - 0.7, 0.05, 0.14], [0, 0.005, z], [0, 0, 0], 0.01, 0.02);
      for (const s of [-1, 1]) k.cyl('gold', '#ffcf5a', 0.22, 0.22, 0.5, [s * (D.width / 2 - 0.85), 0.05, 0.12], [0, 0, Math.PI / 2], 14, 0);
      for (const s of [-1, 1]) k.box('metal', IRON, [0.2, 0.2, 0.2], [s * (D.width / 2 - 0.2), D.curb, D.len - 0.15], [0, 0, 0], 0.03, 0);
      return k;
    },
    [D],
  );
  const towers = useMemo(
    () => () => {
      const k = new Kit(819);
      for (const s of [-1, 1]) {
        const x = s * (D.width / 2 + 0.45);
        k.box('stone', STONE.block[0], [1.0, 1.2, 1.0], [x, 0.6, -0.5], [0, 0, 0], 0.08);
        k.box('wood', WOOD.dark, [0.42, 3.1, 0.42], [x, 2.65, -0.5], [0, 0, 0], 0.05);
        k.box('wood', WOOD.beam, [0.7, 0.24, 0.7], [x, 4.2, -0.5], [0, 0, 0], 0.04);
        k.cone('roof', '#5ab9b3', 0.6, 0.7, [x, 4.66, -0.5], [0, Math.PI / 4, 0], 4);
        k.sphere('gold', '#ffcf5a', 0.1, [x, 5.07, -0.5], [1, 1, 1], 1, 0);
        // counterweight
        k.box('stone', STONE.block[2], [0.55, 0.55, 0.55], [x + s * 0.5, 2.0, -0.95], [0, 0, 0], 0.06);
      }
      return k;
    },
    [D],
  );
  const chainMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#5a5268', metalness: 0.7, roughness: 0.45 }), []);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const u = frame.current.w.bridge;
    const eased = u >= 1 ? 1 : smooth(u) + Math.sin(u * Math.PI) * 0.06 * u;
    g.rotation.x = drawbridgeAngle(Math.min(1.04, eased));
    // chains from the tower pulleys to the deck tip
    const ang = g.rotation.x;
    [-1, 1].forEach((s, i) => {
      const c = chains[i].current;
      if (!c) return;
      const x = s * (D.width / 2 - 0.2);
      // tip of the deck in hinge space after rotation about X
      const ty = Math.sin(-ang) * (D.len - 0.15) + Math.cos(-ang) * D.curb;
      const tz = Math.cos(-ang) * (D.len - 0.15) - Math.sin(-ang) * D.curb;
      tmp.a.set(s * (D.width / 2 + 0.45), 4.05, -0.5);
      tmp.b.set(x, ty, tz);
      const len = tmp.a.distanceTo(tmp.b);
      c.position.copy(tmp.a).add(tmp.b).multiplyScalar(0.5);
      c.scale.set(1, len, 1);
      c.quaternion.setFromUnitVectors(tmp.up, tmp.b.clone().sub(tmp.a).normalize());
      const wheel = wheels[i].current;
      if (wheel && u > 0 && u < 1) wheel.rotation.x += dt * 3;
    });
  });
  return (
    <group position={D.hinge}>
      <group ref={ref}>
        <KitMeshes make={deck} />
      </group>
      <KitMeshes make={towers} />
      {[0, 1].map((i) => (
        <mesh key={i} ref={chains[i]} material={chainMat} castShadow>
          <cylinderGeometry args={[0.05, 0.05, 1, 6]} />
        </mesh>
      ))}
      {[-1, 1].map((s, i) => (
        <mesh key={'w' + s} ref={wheels[i]} position={[s * (D.width / 2 + 0.45), 4.05, -0.5]} rotation={[0, 0, Math.PI / 2]} material={chainMat}>
          <cylinderGeometry args={[0.28, 0.28, 0.14, 14]} />
        </mesh>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------- couriers-only archway

export function CargoBarrier({ b }: { b: BoxDef }) {
  const curtain = useRef<THREE.ShaderMaterial>(null);
  const make = useMemo(
    () => () => {
      const k = new Kit(91);
      const hw = b.s[0] / 2 - 0.12;
      for (const s of [-1, 1]) {
        k.box('wood', WOOD.dark, [0.26, 2.9, 0.26], [s * hw, 1.45, 0], [0, 0, 0], 0.04);
        k.box('stone', STONE.block[0], [0.5, 0.3, 0.5], [s * hw, 0.15, 0], [0, 0, 0], 0.05);
      }
      k.box('wood', WOOD.beam, [b.s[0] + 0.3, 0.26, 0.32], [0, 2.95, 0], [0, 0, 0], 0.05);
      return k;
    },
    [b],
  );
  const sign = useMemo(() => textTexture(['COURIERS ONLY', 'no cargo!'], 512, 220, '#5a3a24', 70, '#f7ead2'), []);
  const shader = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: { t: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `uniform float t; varying vec2 vUv;
          void main(){
            float bands = 0.5 + 0.5 * sin(vUv.y * 40.0 - t * 3.0 + sin(vUv.x * 9.0 + t) * 1.5);
            float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x) * smoothstep(1.0, 0.85, vUv.y);
            float a = (0.1 + 0.18 * bands) * edge;
            gl_FragColor = vec4(vec3(0.55, 0.95, 1.0) * (1.2 + bands), a);
          }`,
      }),
    [],
  );
  useFrame(({ clock }) => {
    shader.uniforms.t.value = clock.elapsedTime;
    void curtain;
  });
  return (
    <group position={[b.p[0], 0, b.p[2]]}>
      <KitMeshes make={make} />
      <mesh position={[0, 1.4, 0]} material={shader}>
        <planeGeometry args={[b.s[0] - 0.5, 2.6]} />
      </mesh>
      <group position={[0, 3.45, 0.05]}>
        <mesh>
          <boxGeometry args={[1.9, 0.72, 0.08]} />
          <meshStandardMaterial color="#8e6040" roughness={0.8} />
        </mesh>
        <mesh position={[0, 0, 0.045]}>
          <planeGeometry args={[1.8, 0.64]} />
          <meshStandardMaterial map={sign} roughness={0.85} />
        </mesh>
      </group>
    </group>
  );
}
