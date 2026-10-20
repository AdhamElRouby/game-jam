// The golden royal artifact: four forms, one synced transform. Polished gold with engraved, softly glowing
// runes and gem accents; shifting plays a flash, spinning rune rings, a ground shockwave and a squash-stretch pop.
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { SHAPES } from '../shared/shapes';
import { frame } from './frame';
import { fx } from './Effects';
import { sfx } from '../audio/audio';
import { artifactOverride } from './Ending';
import { groundAt } from './ground';
import { blobTexture } from './shadows';
import { shakeCamera } from './CameraRig';

/** Engraved panel: albedo variation + matching rune glow mask (same layout). */
function panelTextures() {
  const S = 512;
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    return c;
  };
  const albedo = mk();
  const glow = mk();
  const g = albedo.getContext('2d')!;
  const e = glow.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, S, S);
  grd.addColorStop(0, '#fff3c4');
  grd.addColorStop(0.5, '#ffd25e');
  grd.addColorStop(1, '#f0b23e');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  e.fillStyle = '#000';
  e.fillRect(0, 0, S, S);
  // bevelled inset border
  g.strokeStyle = 'rgba(150,90,20,0.55)';
  g.lineWidth = 12;
  g.strokeRect(44, 44, S - 88, S - 88);
  g.strokeStyle = 'rgba(255,250,225,0.8)';
  g.lineWidth = 4;
  g.strokeRect(58, 58, S - 116, S - 116);
  // rune circle + star (engraved on albedo, emissive on the glow map)
  const rune = (ctx: CanvasRenderingContext2D, color: string, w: number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, 96, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
      const x = S / 2 + Math.cos(a) * 72, y = S / 2 + Math.sin(a) * 72;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(S / 2 + Math.cos(a) * 128, S / 2 + Math.sin(a) * 128, 7, 0, Math.PI * 2);
      ctx.stroke();
    }
  };
  rune(g, 'rgba(160,100,30,0.45)', 9);
  rune(e, '#ffffff', 6);
  // rivets
  g.fillStyle = 'rgba(170,105,25,0.7)';
  for (const [x, y] of [[80, 80], [S - 80, 80], [80, S - 80], [S - 80, S - 80]]) {
    g.beginPath();
    g.arc(x, y, 13, 0, Math.PI * 2);
    g.fill();
  }
  const a = new THREE.CanvasTexture(albedo);
  a.colorSpace = THREE.SRGBColorSpace;
  a.anisotropy = 8;
  const gl = new THREE.CanvasTexture(glow);
  gl.anisotropy = 8;
  return { albedo: a, glow: gl };
}

function useGoldMaterials() {
  return useMemo(() => {
    const t = panelTextures();
    const body = new THREE.MeshPhysicalMaterial({
      map: t.albedo,
      color: '#ffffff',
      metalness: 0.85,
      roughness: 0.3,
      clearcoat: 0.5,
      clearcoatRoughness: 0.25,
      emissiveMap: t.glow,
      emissive: '#ffd27a',
      emissiveIntensity: 0.55,
      envMapIntensity: 1.25,
    });
    const trim = new THREE.MeshPhysicalMaterial({ color: '#e0a03a', metalness: 0.9, roughness: 0.34, clearcoat: 0.3, envMapIntensity: 1.1 });
    const ball = new THREE.MeshPhysicalMaterial({ color: '#ffd35a', metalness: 0.85, roughness: 0.22, clearcoat: 0.8, clearcoatRoughness: 0.15, emissiveMap: t.glow, emissive: '#ffd27a', emissiveIntensity: 0.45, envMapIntensity: 1.3, map: t.albedo });
    const gem = new THREE.MeshStandardMaterial({ color: '#8ff7ff', emissive: '#29d4e8', emissiveIntensity: 2.2, roughness: 0.15, metalness: 0.1 });
    return { body, trim, ball, gem };
  }, []);
}

type M = ReturnType<typeof useGoldMaterials>;

function Gem({ p, r = 0.2, rot = [0, 0, 0] as [number, number, number], m }: { p: [number, number, number]; r?: number; rot?: [number, number, number]; m: M }) {
  return (
    <group position={p} rotation={rot}>
      <mesh material={m.trim} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[r * 1.15, r * 0.25, 8, 20]} />
      </mesh>
      <mesh material={m.gem} scale={[1, 1, 0.55]}>
        <octahedronGeometry args={[r, 0]} />
      </mesh>
    </group>
  );
}

function CornerCaps({ hx, hy, hz, m, r = 0.15 }: { hx: number; hy: number; hz: number; m: M; r?: number }) {
  const pts: [number, number, number][] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) pts.push([x * hx, y * hy, z * hz]);
  return (
    <>
      {pts.map((p, i) => (
        <mesh key={i} position={p} material={m.trim} castShadow>
          <sphereGeometry args={[r, 14, 10]} />
        </mesh>
      ))}
    </>
  );
}

function CubeForm({ m }: { m: M }) {
  const geo = useMemo(() => new RoundedBoxGeometry(2, 2, 2, 5, 0.17), []);
  const strap = useMemo(() => new RoundedBoxGeometry(2.08, 0.24, 2.08, 3, 0.06), []);
  const strap2 = useMemo(() => new RoundedBoxGeometry(0.24, 2.08, 2.08, 3, 0.06), []);
  return (
    <group>
      <mesh geometry={geo} material={m.body} castShadow receiveShadow />
      <mesh geometry={strap} material={m.trim} castShadow />
      <mesh geometry={strap2} material={m.trim} castShadow />
      <Gem p={[0, 0, 1.06]} m={m} />
      <Gem p={[0, 0, -1.06]} rot={[0, Math.PI, 0]} m={m} />
      <Gem p={[1.06, 0, 0]} rot={[0, Math.PI / 2, 0]} m={m} />
      <Gem p={[-1.06, 0, 0]} rot={[0, -Math.PI / 2, 0]} m={m} />
      <Gem p={[0, 1.06, 0]} rot={[-Math.PI / 2, 0, 0]} m={m} r={0.24} />
      <CornerCaps hx={0.92} hy={0.92} hz={0.92} m={m} />
    </group>
  );
}

function LongForm({ m }: { m: M }) {
  const s = SHAPES[1].half;
  const geo = useMemo(() => new RoundedBoxGeometry(s[0] * 2, s[1] * 2, s[2] * 2, 5, 0.13), [s]);
  const band = useMemo(() => new RoundedBoxGeometry(0.24, s[1] * 2 + 0.07, s[2] * 2 + 0.07, 3, 0.05), [s]);
  return (
    <group>
      <mesh geometry={geo} material={m.body} castShadow receiveShadow />
      {[-1.7, -0.6, 0.6, 1.7].map((x) => (
        <mesh key={x} geometry={band} position={[x, 0, 0]} material={m.trim} castShadow />
      ))}
      <Gem p={[s[0] + 0.02, 0, 0]} rot={[0, Math.PI / 2, 0]} m={m} r={0.16} />
      <Gem p={[-s[0] - 0.02, 0, 0]} rot={[0, -Math.PI / 2, 0]} m={m} r={0.16} />
      <Gem p={[0, 0, s[2] + 0.02]} m={m} r={0.17} />
      <Gem p={[0, 0, -s[2] - 0.02]} rot={[0, Math.PI, 0]} m={m} r={0.17} />
      <CornerCaps hx={s[0] - 0.08} hy={s[1] - 0.06} hz={s[2] - 0.06} m={m} r={0.1} />
    </group>
  );
}

function TallForm({ m }: { m: M }) {
  const s = SHAPES[2].half;
  const geo = useMemo(() => new RoundedBoxGeometry(s[0] * 2, s[1] * 2, s[2] * 2, 5, 0.13), [s]);
  const band = useMemo(() => new RoundedBoxGeometry(s[0] * 2 + 0.07, 0.2, s[2] * 2 + 0.07, 3, 0.05), [s]);
  return (
    <group>
      <mesh geometry={geo} material={m.body} castShadow receiveShadow />
      {[-1.6, -0.55, 0.55, 1.6].map((y) => (
        <mesh key={y} geometry={band} position={[0, y, 0]} material={m.trim} castShadow />
      ))}
      <Gem p={[0, s[1] + 0.05, 0]} rot={[-Math.PI / 2, 0, 0]} m={m} r={0.26} />
      <Gem p={[0, 1.08, s[2] + 0.02]} m={m} r={0.15} />
      <Gem p={[0, -1.08, s[2] + 0.02]} m={m} r={0.15} />
      <CornerCaps hx={s[0] - 0.05} hy={s[1] - 0.05} hz={s[2] - 0.05} m={m} r={0.11} />
    </group>
  );
}

function RoundForm({ m }: { m: M }) {
  const r = SHAPES[3].half[0];
  return (
    <group>
      <mesh material={m.ball} castShadow receiveShadow>
        <sphereGeometry args={[r, 48, 32]} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} material={m.trim} castShadow>
        <torusGeometry args={[r * 0.995, 0.075, 10, 64]} />
      </mesh>
      <mesh material={m.trim}>
        <torusGeometry args={[r * 0.995, 0.05, 8, 64]} />
      </mesh>
      <Gem p={[0, 0, r + 0.01]} m={m} r={0.17} />
      <Gem p={[0, 0, -r - 0.01]} rot={[0, Math.PI, 0]} m={m} r={0.17} />
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

const RUNE_COLORS = ['#fff3b0', '#9ff7ef', '#ffd1e6'];

export function Artifact() {
  const m = useGoldMaterials();
  const root = useRef<THREE.Group>(null);
  const forms = [useRef<THREE.Group>(null), useRef<THREE.Group>(null), useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const rings = [useRef<THREE.Mesh>(null), useRef<THREE.Mesh>(null), useRef<THREE.Mesh>(null)];
  const flash = useRef<THREE.Mesh>(null);
  const shock = useRef<THREE.Mesh>(null);
  const blob = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.PointLight>(null);
  const motes = useRef<THREE.InstancedMesh>(null);
  const state = useRef({ from: 0, to: 0, t: 1, init: false, shockY: 0, shockX: 0, shockZ: 0 });
  const ringMats = useMemo(() => RUNE_COLORS.map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, depthWrite: false, toneMapped: false })), []);
  const flashMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#fff6d6', transparent: true, opacity: 0, depthWrite: false, toneMapped: false }), []);
  const shockMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffe9a0', transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }), []);
  const blobMat = useMemo(() => new THREE.MeshBasicMaterial({ map: blobTexture(), color: '#2a1f3d', transparent: true, opacity: 0.5, depthWrite: false }), []);
  const MOTES = 14;
  const moteSeed = useMemo(() => Array.from({ length: MOTES }, (_, i) => ({ a: (i / MOTES) * Math.PI * 2, r: 1.5 + Math.random() * 0.8, y: Math.random() * 2.4 - 0.6, sp: 0.4 + Math.random() * 0.5, ph: Math.random() * 6 })), []);
  const m4 = useMemo(() => new THREE.Matrix4(), []);

  useFrame(({ clock }, dtRaw) => {
    const dt = Math.min(0.05, dtRaw);
    const t = clock.elapsedTime;
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
      const spec = SHAPES[a.shape];
      const bottom = a.y - (spec.ball ? spec.half[0] : spec.half[1]);
      const gy = groundAt(a.x, a.z, a.y, frame.current.w.liftY, frame.current.w.bridge);
      st.shockX = a.x;
      st.shockZ = a.z;
      st.shockY = (gy ?? bottom) + 0.06;
      if (frame.live) {
        fx.sparkle(a.x, a.y, a.z, 80, 2.4);
        fx.sparkle(a.x, a.y, a.z, 30, 1.2, '#9ff7ef');
        sfx.play('shift', { rate: [1.0, 0.85, 1.12, 1.25][a.shape], vol: 0.8 });
        shakeCamera(0.12);
      }
    }
    st.t = Math.min(1, st.t + dt / 0.45);
    for (let i = 0; i < 4; i++) {
      const f = forms[i].current;
      if (!f) continue;
      if (i === st.to) {
        f.visible = true;
        const k = easeOutBack(Math.min(1, st.t / 0.85));
        const s = st.t >= 1 ? 1 : 0.3 + 0.7 * k;
        const w = st.t >= 1 ? 0 : Math.sin(st.t * Math.PI * 3) * (1 - st.t) * 0.14;
        f.scale.set(s * (1 + w), s * (1 - w), s * (1 + w));
        f.rotation.y = st.t >= 1 ? 0 : (1 - easeOutBack(st.t)) * 0.9;
      } else if (i === st.from && st.t < 0.32) {
        f.visible = true;
        const s = 1 - st.t / 0.32;
        f.scale.set(s * 1.15, s * 0.85, s * 1.15);
        f.rotation.y = -st.t * 2;
      } else f.visible = false;
    }
    // shift FX: spinning rune rings (world-aligned), flash shell, ground shockwave
    const ft = st.t;
    rings.forEach((rr, i) => {
      const r = rr.current;
      if (!r) return;
      r.visible = ft < 1;
      if (!r.visible) return;
      const grow = 0.8 + ft * (2.6 + i * 0.6);
      r.scale.setScalar(grow);
      ringMats[i].opacity = (1 - ft) * (0.9 - i * 0.18);
      tmpQ.setFromEuler(tmpE.set(Math.PI / 2 + Math.sin(i * 2.1) * 0.6 + ft * (i - 1) * 1.5, ft * 6 * (i % 2 ? -1 : 1), i * 0.9));
      r.quaternion.copy(g.quaternion).invert().multiply(tmpQ);
    });
    if (flash.current) {
      flash.current.visible = ft < 0.55;
      const k = ft / 0.55;
      flash.current.scale.setScalar(1.2 + k * 2.6);
      flashMat.opacity = (1 - k) * 0.38;
    }
    if (shock.current) {
      shock.current.visible = ft < 1;
      shock.current.position.set(st.shockX, st.shockY, st.shockZ);
      shock.current.scale.setScalar(1 + ft * 5.5);
      shockMat.opacity = (1 - ft) * 0.7;
    }
    // runes breathe; flare during a shift
    const pulse = 0.45 + Math.sin(t * 2.2) * 0.15 + (1 - ft) * 2.2;
    m.body.emissiveIntensity = pulse;
    m.ball.emissiveIntensity = pulse * 0.85;
    m.gem.emissiveIntensity = 2.0 + Math.sin(t * 3.1) * 0.5 + (1 - ft) * 3;
    if (halo.current) halo.current.intensity = 5 + (1 - ft) * 40;
    // floating motes
    const mm = motes.current;
    if (mm) {
      const show = !artifactOverride.active;
      moteSeed.forEach((s, i) => {
        const ang = s.a + t * s.sp;
        const y = s.y + Math.sin(t * 1.3 + s.ph) * 0.35;
        const sc = show ? 0.045 + Math.sin(t * 3 + s.ph) * 0.02 : 0;
        m4.makeScale(sc, sc, sc).setPosition(g.position.x + Math.cos(ang) * s.r, g.position.y + y, g.position.z + Math.sin(ang) * s.r);
        mm.setMatrixAt(i, m4);
      });
      mm.instanceMatrix.needsUpdate = true;
    }
    // contact shadow
    const b = blob.current;
    if (b) {
      const spec = SHAPES[a.shape];
      const gy = artifactOverride.active ? null : groundAt(a.x, a.z, a.y, frame.current.w.liftY, frame.current.w.bridge);
      if (gy === null) b.visible = false;
      else {
        const bottom = a.y - (spec.ball ? spec.half[0] : spec.half[1]);
        const h = Math.max(0, bottom - gy);
        b.visible = true;
        b.position.set(a.x, gy + 0.035, a.z);
        b.rotation.set(-Math.PI / 2, 0, 0);
        const ext = spec.ball ? spec.half[0] * 2.2 : Math.max(spec.half[0], spec.half[2]) * 2.3;
        b.scale.set(ext * Math.max(0.5, 1 - h * 0.1), ext * Math.max(0.5, 1 - h * 0.1), 1);
        blobMat.opacity = 0.5 * Math.max(0.15, 1 - h * 0.15);
      }
    }
  });
  return (
    <>
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
        {rings.map((r, i) => (
          <mesh key={i} ref={r} visible={false} material={ringMats[i]}>
            <torusGeometry args={[1, 0.045 - i * 0.008, 6, 56]} />
          </mesh>
        ))}
        <mesh ref={flash} visible={false} material={flashMat}>
          <icosahedronGeometry args={[1, 2]} />
        </mesh>
        <pointLight ref={halo} color="#ffd36b" intensity={5} distance={7} decay={2} />
      </group>
      <mesh ref={shock} visible={false} rotation={[-Math.PI / 2, 0, 0]} material={shockMat}>
        <ringGeometry args={[0.9, 1.0, 48]} />
      </mesh>
      <mesh ref={blob} material={blobMat} renderOrder={1}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <instancedMesh ref={motes} args={[undefined, undefined, MOTES]} frustumCulled={false}>
        <octahedronGeometry args={[1, 0]} />
        <meshBasicMaterial color="#fff2b0" toneMapped={false} />
      </instancedMesh>
    </>
  );
}
