// Course geometry (from shared LEVEL data) + the synced puzzle machines.
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { LEVEL, drawbridgeAngle, smooth, type BoxDef } from '../shared/level';
import { scenicIsland } from './islandGeo';
import { MergedIslands } from './Islands';
import { terrainMaterial } from './terrain';
import { MAT } from './materials';
import { frame } from './frame';
import { fx } from './Effects';
import { camFocus } from './CameraRig';
import { useGame } from '../app/store';
import { Kit } from './kit';
import { IRON, KitMeshes, STONE, WOOD, buildBridge, buildCurb, buildGateTowers, buildPalisade, buildStoneWall } from './Structures';
import { textTexture } from './Props';
import { CargoBarrier, Drawbridge, Receiver, WindsockPost } from './Ch2';
import { Lever, Lift, TowerWall } from './Ch3';
import { quatEuler } from '../shared/math';

const tmpQ = new THREE.Quaternion();

export const CASTLE_ISLAND = scenicIsland(900, 0, -186, 26, 0, 30);

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

/** Course islands plus the castle island (all receive shadows); walkable caps match the colliders. */
function Islands() {
  const defs = useMemo(() => [...LEVEL.islands, CASTLE_ISLAND], []);
  return <MergedIslands defs={defs} />;
}

function rotOf(b: BoxDef): [number, number, number] {
  return b.rot ? [b.rot[0], b.rot[1], b.rot[2]] : [0, 0, 0];
}

function StoneBlock({ b, radius = 0.12 }: { b: BoxDef; radius?: number }) {
  return (
    <RoundedBox args={b.s} radius={Math.min(radius, Math.min(...b.s) / 2 - 0.01)} smoothness={2} position={b.p} rotation={rotOf(b)} material={MAT.stone} castShadow receiveShadow />
  );
}

const PAVED = terrainMaterial({ paved: 1 });

/** Paved ramp: cobbled deck (same material as the plaza), masonry sides, and stone piers down into the clouds. */
function Ramp({ b }: { b: BoxDef }) {
  const [w, th, L] = b.s;
  const theta = b.rot ? b.rot[0] : 0;
  const deckGeo = useMemo(() => {
    const g = new THREE.PlaneGeometry(w - 0.05, L, 4, Math.max(2, Math.round(L / 2))).rotateX(-Math.PI / 2);
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count * 3).fill(1), 3));
    return g;
  }, [w, L]);
  const sides = useMemo(
    () => () => {
      const k = new Kit(Math.round(b.p[2] * 5 + b.p[0] * 3));
      k.box('stone', STONE.dark, [w - 0.04, th - 0.04, L], [0, -0.02, 0], [0, 0, 0], 0.02, 0);
      const n = Math.max(2, Math.round(L / 1.3));
      for (const sx of [-1, 1]) {
        for (let i = 0; i < n; i++) {
          const z = -L / 2 + (i + 0.5) * (L / n);
          k.box('stone', STONE.block[(i + (sx > 0 ? 1 : 0)) % 4], [0.16, th - 0.08, L / n - 0.06], [sx * (w / 2 - 0.02), -0.02, z], [0, 0, 0], 0.04, 0.06);
        }
      }
      return k;
    },
    [b, w, th, L],
  );
  const piers = useMemo(
    () => () => {
      const k = new Kit(Math.round(b.p[2] * 3 + 77));
      const c = Math.cos(theta), sn = Math.sin(theta);
      const count = Math.max(1, Math.floor(L / 7));
      for (let i = 0; i < count; i++) {
        const lz = -L / 2 + ((i + 0.5) * L) / count;
        // underside of the deck in world space at this station
        const wy = b.p[1] + (-th / 2) * c - lz * sn;
        const wz = b.p[2] + (-th / 2) * sn + lz * c;
        const h = 5 + (i % 2) * 1.5;
        for (const sx of [-1, 1]) {
          const x = b.p[0] + sx * (w / 2 - 0.6);
          k.box('stone', STONE.block[i % 4], [0.9, h, 0.9], [x, wy - h / 2 + 0.1, wz], [0, 0, 0], 0.08, 0.05);
          k.box('stone', STONE.trim, [1.15, 0.3, 1.15], [x, wy - 0.1, wz], [0, 0, 0], 0.06, 0.03);
          k.sphere('stone', '#b7a2a6', 0.75, [x, wy - h - 0.1, wz], [1, 0.8, 1], 0, 0.06);
        }
        // cross beam between the piers
        k.box('stone', STONE.trim, [w - 0.6, 0.5, 0.7], [b.p[0], wy - 0.45, wz], [0, 0, 0], 0.06, 0.03);
      }
      return k;
    },
    [b, w, th, L, theta],
  );
  return (
    <group>
      <group position={b.p} rotation={rotOf(b)}>
        <KitMeshes make={sides} />
        <mesh geometry={deckGeo} position={[0, th / 2 + 0.005, 0]} material={PAVED} receiveShadow />
      </group>
      <KitMeshes make={piers} />
    </group>
  );
}

const GATE_FRAME: BoxDef = { p: [0, 2.7, -8.5], s: [7.4, 5.4, 1.6], mat: 'darkwood' };

function KitAt({ make, b, cast = true }: { make: () => Kit; b?: BoxDef; cast?: boolean }) {
  if (!b) return <KitMeshes make={make} cast={cast} />;
  return (
    <group position={b.p} rotation={rotOf(b)}>
      <KitMeshes make={make} cast={cast} />
    </group>
  );
}

function StaticBoxes() {
  const railed = useMemo(() => new Set(LEVEL.boxes.filter((b) => b.tag === 'rail').map((b) => b.id!.split('-rail')[0])), []);
  const makers = useMemo(() => {
    const m = new Map<string, () => Kit>();
    for (const b of LEVEL.boxes) {
      const key = b.id ?? '';
      if (b.tag === 'bridge') m.set(key, () => buildBridge(b, railed.has(key.replace('-deck', ''))));
      else if (b.tag === 'palisade') m.set(key, () => buildPalisade(b));
      else if (b.tag === 'archwall' || b.tag === 'archtop') m.set(key, () => buildStoneWall(b, { merlons: true, seed: Math.round(b.p[0] * 7 + 50) }));
      else if (b.tag === 'curb' || b.tag === 'funnel') m.set(key, () => buildCurb(b));
    }
    m.set('gateTowers', () => buildGateTowers(LEVEL.gate.p[0], LEVEL.gate.p[2], LEVEL.gate.s[0]));
    return m;
  }, [railed]);
  return (
    <group>
      <Fade b={GATE_FRAME}>
        <KitMeshes make={makers.get('gateTowers')!} />
        <GateSign />
      </Fade>
      {LEVEL.boxes.map((b, i) => {
        const key = b.id ?? String(i);
        switch (b.tag) {
          case 'bridge':
            return <KitMeshes key={key} make={makers.get(key)!} />;
          case 'rail':
            return null; // part of the bridge build
          case 'palisade':
          case 'archwall':
          case 'archtop':
            return (
              <Fade key={key} b={b}>
                <KitMeshes make={makers.get(key)!} />
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
            return <WindsockPost key={key} b={b} />;
          case 'castlewall':
            return null; // drawn by the Castle (with a real doorway)
          case 'curb':
          case 'funnel':
            return <KitAt key={key} b={b} make={makers.get(key)!} />;
          default:
            if (b.mat === 'invisible') return null;
            return <StoneBlock key={key} b={b} />;
        }
      })}
    </group>
  );
}

/** Painted dock sign hanging from the gate lintel. */
function GateSign() {
  const tex = useMemo(() => textTexture(['ROYAL DOCK'], 512, 128, '#fff4dc', 74, '#6b4a2e'), []);
  return (
    <group position={[LEVEL.gate.p[0], 4.32, LEVEL.gate.p[2] + 0.5]}>
      <mesh material={MAT.darkwood} castShadow>
        <boxGeometry args={[2.9, 0.72, 0.1]} />
      </mesh>
      <mesh position={[0, 0, 0.056]}>
        <planeGeometry args={[2.75, 0.62]} />
        <meshStandardMaterial map={tex} roughness={0.85} />
      </mesh>
    </group>
  );
}

// ------------------------------------------------------------------ puzzle machines

function Gate() {
  const ref = useRef<THREE.Group>(null);
  const g = LEVEL.gate;
  useFrame(() => {
    if (!ref.current) return;
    const u = frame.current.w.gate;
    // drops into the ground with a little shudder as it starts
    ref.current.position.y = g.p[1] - g.drop * smooth(u) + (u > 0 && u < 0.25 ? Math.sin(u * 120) * 0.03 : 0);
  });
  const make = useMemo(
    () => () => {
      const k = new Kit(4242);
      const [w, h, d] = g.s;
      const n = 7;
      const pw = w / n;
      for (let i = 0; i < n; i++) k.box('wood', WOOD.plank[i % WOOD.plank.length], [pw - 0.05, h - (i % 2) * 0.08, d * 0.5], [-w / 2 + pw * (i + 0.5), -(i % 2) * 0.04, d * 0.2], [0, 0, 0], 0.05, 0.07);
      for (const y of [-h / 2 + 0.45, 0, h / 2 - 0.45]) k.box('wood', WOOD.dark, [w - 0.1, 0.32, d * 0.45], [0, y, -d * 0.2], [0, 0, 0], 0.04);
      for (const y of [-0.85, 0.85]) {
        k.box('metal', IRON, [w - 0.16, 0.18, 0.06], [0, y, d * 0.47], [0, 0, 0], 0.02, 0.02);
        for (let i = 0; i < n; i++) k.sphere('metal', '#8a8296', 0.05, [-w / 2 + pw * (i + 0.5), y, d * 0.5 + 0.02], [1, 1, 0.6], 1, 0);
      }
      // royal crest
      k.box('gold', '#ffcf5a', [0.9, 0.8, 0.1], [0, 0.15, d * 0.52], [0, 0, 0], 0.08, 0);
      k.cone('gold', '#ffcf5a', 0.45, 0.45, [0, -0.45, d * 0.52], [Math.PI, 0, 0], 4, 0);
      k.box('cloth', '#e45b6f', [0.62, 0.5, 0.04], [0, 0.18, d * 0.58], [0, 0, 0], 0.04, 0);
      return k;
    },
    [g],
  );
  return (
    <group ref={ref} position={g.p}>
      <KitMeshes make={make} />
    </group>
  );
}

/** Pressure plate: stone frame, sinking timber pad with a CUBE silhouette, a rim that fills up as the weight settles. */
function Plate() {
  const pad = useRef<THREE.Group>(null);
  const bars = useRef<(THREE.Group | null)[]>([]);
  const glow = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffe48a', emissive: '#ffb21e', emissiveIntensity: 0.6, roughness: 0.4 }), []);
  const P = LEVEL.plate;
  const half = P.s[0] / 2;
  useFrame(({ clock }) => {
    const w = frame.current.w;
    const done = w.gate > 0;
    const prog = done ? 1 : w.plate;
    if (pad.current) pad.current.position.y = -prog * 0.05;
    // four rim bars fill one after another, clockwise from the front-left corner
    bars.current.forEach((m, i) => {
      if (!m) return;
      const f = Math.min(1, Math.max(0, prog * 4 - i));
      m.scale.x = Math.max(0.001, f);
      m.visible = f > 0;
    });
    const pulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 5);
    glow.emissiveIntensity = done ? 2.2 : 1.2 + prog * 2.2 + pulse * 0.6;
  });
  const frameKit = useMemo(
    () => () => {
      const k = new Kit(77);
      const t = 0.34;
      for (const s of [-1, 1]) {
        k.box('stone', STONE.block[0], [P.s[0] + t * 2, 0.16, t], [0, 0.06, s * (half + t / 2)], [0, 0, 0], 0.05, 0.05);
        k.box('stone', STONE.block[2], [t, 0.16, P.s[1]], [s * (half + t / 2), 0.06, 0], [0, 0, 0], 0.05, 0.05);
      }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('gold', '#f3c24f', [0.42, 0.2, 0.42], [sx * (half + t / 2), 0.08, sz * (half + t / 2)], [0, 0, 0], 0.06, 0);
      return k;
    },
    [P, half],
  );
  const padKit = useMemo(
    () => () => {
      const k = new Kit(78);
      const n = 6;
      const pw = (P.s[0] - 0.1) / n;
      for (let i = 0; i < n; i++) k.box('wood', WOOD.plank[i % WOOD.plank.length], [pw - 0.04, 0.1, P.s[1] - 0.12], [-P.s[0] / 2 + 0.05 + pw * (i + 0.5), 0.0, 0], [0, 0, 0], 0.025, 0.06);
      // CUBE silhouette inlay (what belongs here)
      const c = 1.0, bw = 0.14;
      for (const s of [-1, 1]) {
        k.box('wood', WOOD.dark, [c * 2 + bw, 0.02, bw], [0, 0.055, s * c], [0, 0, 0], 0.01, 0);
        k.box('wood', WOOD.dark, [bw, 0.02, c * 2 + bw], [s * c, 0.055, 0], [0, 0, 0], 0.01, 0);
      }
      return k;
    },
    [P],
  );
  // rim bars (front, right, back, left), anchored at their starting corner so scale.x grows along the edge
  const edges: { pos: [number, number, number]; rot: number }[] = [
    { pos: [-half, 0.15, half + 0.17], rot: 0 },
    { pos: [half + 0.17, 0.15, half], rot: Math.PI / 2 },
    { pos: [half, 0.15, -half - 0.17], rot: Math.PI },
    { pos: [-half - 0.17, 0.15, -half], rot: -Math.PI / 2 },
  ];
  return (
    <group position={[P.p[0], 0, P.p[2]]}>
      <KitMeshes make={frameKit} />
      <group ref={pad} position={[0, 0.05, 0]}>
        <KitMeshes make={padKit} />
      </group>
      {edges.map((e, i) => (
        <group key={i} position={e.pos} rotation={[0, e.rot, 0]}>
          {/* anchored at its starting corner: the bar is offset by half its length and the group is scaled */}
          <group ref={(m) => (bars.current[i] = m)}>
            <mesh material={glow} position={[P.s[0] / 2, 0, 0]}>
              <boxGeometry args={[P.s[0], 0.06, 0.12]} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}

/** Delivery circle: golden rune ring that fills with progress, a soft upward light column and rising motes. */
function Goal() {
  const G = LEVEL.goal;
  const fill = useRef<THREE.Mesh>(null);
  const runes = useRef<THREE.Mesh>(null);
  const motes = useRef<THREE.InstancedMesh>(null);
  const ringMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffe08a', emissive: '#ffb21e', emissiveIntensity: 1.2, metalness: 0.6, roughness: 0.3 }), []);
  const fillMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#fff4c2', toneMapped: false }), []);
  const runeTex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d')!;
    g.translate(256, 256);
    g.strokeStyle = 'rgba(255,236,170,0.95)';
    g.lineWidth = 6;
    for (const r of [235, 200, 120]) {
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.stroke();
    }
    g.font = 'bold 34px Fredoka, sans-serif';
    g.fillStyle = 'rgba(255,240,190,0.9)';
    g.textAlign = 'center';
    const glyphs = '✦ ◆ ✧ ◇ ✦ ◆ ✧ ◇ ✦ ◆ ✧ ◇'.split(' ');
    glyphs.forEach((ch, i) => {
      const a = (i / glyphs.length) * Math.PI * 2;
      g.save();
      g.rotate(a);
      g.fillText(ch, 0, -205);
      g.restore();
    });
    // crown in the middle
    g.fillStyle = 'rgba(255,236,170,0.85)';
    g.beginPath();
    g.moveTo(-70, 40); g.lineTo(-70, -30); g.lineTo(-35, 5); g.lineTo(0, -50); g.lineTo(35, 5); g.lineTo(70, -30); g.lineTo(70, 40);
    g.closePath();
    g.fill();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  const runeMat = useMemo(() => new THREE.MeshBasicMaterial({ map: runeTex, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }), [runeTex]);
  const beamMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: { op: { value: 0.3 }, t: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `uniform float op; uniform float t; varying vec2 vUv;
          void main(){
            float fade = pow(clamp(1.0 - vUv.y, 0.0, 1.0), 1.8);
            float bands = 0.75 + 0.25 * sin(vUv.x * 62.83 + t * 1.5) * sin(vUv.y * 9.0 - t * 2.0);
            gl_FragColor = vec4(vec3(1.0, 0.86, 0.5) * fade * bands * op, 1.0);
          }`,
      }),
    [],
  );
  const N = 40;
  const moteState = useMemo(() => Array.from({ length: N }, (_, i) => ({ a: (i / N) * Math.PI * 2, r: 0.6 + Math.random() * (G.r - 0.8), y: Math.random() * 6, sp: 0.5 + Math.random() * 0.8 })), [G.r]);
  const m4 = useMemo(() => new THREE.Matrix4(), []);
  useFrame(({ clock }, dt) => {
    const g = frame.current.w.goal;
    const t = clock.elapsedTime;
    const cut = useGame.getState().cutscene;
    ringMat.emissiveIntensity = 1.0 + g * 2.5 + Math.sin(t * 3) * 0.25;
    if (fill.current) {
      fill.current.visible = g > 0.01;
      fill.current.geometry.setDrawRange(0, 6 * Math.round(64 * Math.min(1, g)));
    }
    if (runes.current) runes.current.rotation.z = t * 0.15;
    runeMat.opacity = 0.35 + g * 0.5 + Math.sin(t * 2) * 0.08;
    beamMat.uniforms.op.value = cut ? 0 : 0.22 + g * 0.6;
    beamMat.uniforms.t.value = t;
    const mm = motes.current;
    if (mm) {
      moteState.forEach((m, i) => {
        m.y += dt * m.sp * (1 + g * 2);
        if (m.y > 6.5) m.y = 0;
        const s = (1 - m.y / 6.5) * 0.09 * (cut ? 0 : 1);
        m4.makeScale(s, s, s).setPosition(Math.cos(m.a + t * 0.3) * m.r, m.y + 0.1, Math.sin(m.a + t * 0.3) * m.r);
        mm.setMatrixAt(i, m4);
      });
      mm.instanceMatrix.needsUpdate = true;
    }
  });
  const ringKit = useMemo(
    () => () => {
      const k = new Kit(2525);
      const n = 24;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        k.box('stone', i % 2 ? '#f0dcb8' : '#e2c79f', [0.55, 0.12, (2 * Math.PI * (G.r + 0.45)) / n - 0.06], [Math.cos(a) * (G.r + 0.45), 0.06, Math.sin(a) * (G.r + 0.45)], [0, -a, 0], 0.04, 0.04);
      }
      return k;
    },
    [G.r],
  );
  return (
    <group position={G.p}>
      <KitMeshes make={ringKit} />
      <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]} material={ringMat}>
        <ringGeometry args={[G.r - 0.22, G.r + 0.14, 64]} />
      </mesh>
      <mesh ref={fill} position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]} material={fillMat}>
        <ringGeometry args={[G.r - 0.18, G.r + 0.1, 64, 1, Math.PI / 2, Math.PI * 2]} />
      </mesh>
      <mesh ref={runes} position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} material={runeMat}>
        <circleGeometry args={[G.r - 0.25, 64]} />
      </mesh>
      <mesh position={[0, 3.5, 0]} material={beamMat}>
        <cylinderGeometry args={[G.r - 0.1, G.r, 7, 48, 1, true]} />
      </mesh>
      <instancedMesh ref={motes} args={[undefined, undefined, N]} frustumCulled={false}>
        <icosahedronGeometry args={[1, 0]} />
        <meshBasicMaterial color="#fff1b0" toneMapped={false} />
      </instancedMesh>
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

/** Waving cloth (vertex wave from the pole edge) shared by checkpoint flags. */
function clothMaterial(color: string) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, side: THREE.DoubleSide });
  const u = { t: { value: 0 } };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uT = u.t;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uT;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float k = clamp(uv.x, 0.0, 1.0);
        transformed.z += sin(uv.x * 7.0 - uT * 6.0) * 0.12 * k + sin(uv.y * 4.0 - uT * 3.0) * 0.03 * k;
        transformed.y -= k * k * 0.08;`,
      );
  };
  m.userData.u = u;
  return m;
}

/** Checkpoint banner: pink while ahead, hoisted gold with a sparkle burst and glowing finial once reached. */
function CheckpointFlag({ id, p }: { id: number; p: [number, number, number] }) {
  const flag = useRef<THREE.Mesh>(null);
  const mat = useMemo(() => clothMaterial('#f49bb5'), []);
  const finial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffd35a', emissive: '#ffb21e', emissiveIntensity: 0.2, metalness: 0.8, roughness: 0.3 }), []);
  const was = useRef(false);
  const kit = useMemo(
    () => () => {
      const k = new Kit(9000 + id);
      k.cyl('wood', WOOD.dark, 0.07, 0.09, 3.3, [0, 1.65, 0], [0, 0, 0], 8);
      k.box('stone', STONE.block[1], [0.55, 0.3, 0.55], [0, 0.15, 0], [0, 0, 0], 0.06);
      k.box('wood', WOOD.rail, [0.06, 0.06, 0.06], [0, 3.2, 0], [0, 0, 0], 0.01);
      return k;
    },
    [id],
  );
  useFrame(({ clock }, dt) => {
    const reached = frame.current.latest.cp >= id;
    const t = clock.elapsedTime;
    mat.userData.u.t.value = t + id;
    if (flag.current) {
      const target = reached ? 2.6 : 1.15;
      flag.current.position.y += (target - flag.current.position.y) * Math.min(1, dt * 3);
    }
    mat.color.set(reached ? '#ffd153' : '#f49bb5');
    finial.emissiveIntensity = reached ? 1.6 + Math.sin(t * 4) * 0.5 : 0.2;
    if (reached && !was.current && frame.live) fx.sparkle(p[0], p[1] + 3.0, p[2], 40, 1.2);
    was.current = reached;
  });
  return (
    <group position={p}>
      <KitMeshes make={kit} />
      <mesh position={[0, 3.38, 0]} material={finial}>
        <icosahedronGeometry args={[0.15, 1]} />
      </mesh>
      <mesh ref={flag} position={[0.62, 1.15, 0]} material={mat} castShadow>
        <planeGeometry args={[1.15, 0.7, 10, 3]} />
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
      <TowerWall />
      <Goal />
      <Checkpoints />
    </group>
  );
}

void tmpQ;
void quatEuler;
