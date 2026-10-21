// Visuals for data-driven mechanisms (gameplay-owned). Built with the shared Kit + palettes so they read as the same
// golden / wood / teal machine language as the original chapters. Legacy machines (plate, gate, receiver, drawbridge,
// lever, lift, the two original wind zones) keep their hand-made Chapter visuals and are skipped here.
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type {
  BlockerDef,
  CartDef,
  CraneDef,
  CollectDef,
  PufferDef,
  SlipDef,
  GateDef,
  MapDef,
  MechDef,
  MoverDef,
  PlateDef,
  RotorDef,
  SpringDef,
  SwitchDef,
  WindDef,
  WobbleDef,
} from '../shared/maps/types';
import { LEVEL, smooth, type BoxDef } from '../shared/level';
import { Kit } from './kit';
import { IRON, KitMeshes, STONE, WOOD, buildBridge } from './Structures';
import { textTexture } from './Props';
import { mechState } from './mapState';
import { registerGround } from './ground';
import { CAPS, toadstool } from './worlds/Mushroom';
import { useGame } from '../app/store';

type V3 = [number, number, number];

const glow = (color: string, emissive: string, intensity = 1.2) => new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: intensity, roughness: 0.4 });
const TEAL = '#57e0d4';
const GOLD = '#ffcf5a';

// ---------------------------------------------------------------- rotors

function Turnstile({ d, i }: { d: RotorDef; i: number }) {
  const ref = useRef<THREE.Group>(null);
  const make = useMemo(
    () => () => {
      const k = new Kit(3100 + i);
      const hub = d.parts[0];
      const arm = d.parts[1];
      // hub: iron-banded post with a golden cap
      k.cyl('wood', WOOD.dark, hub.s[0] / 2, hub.s[0] / 2 + 0.05, hub.s[1], [0, hub.o[1], 0], [0, 0, 0], 12);
      for (const y of [0.3, hub.s[1] - 0.3]) k.cyl('metal', IRON, hub.s[0] / 2 + 0.04, hub.s[0] / 2 + 0.04, 0.1, [0, y, 0], [0, 0, 0], 12, 0);
      k.sphere('gold', GOLD, 0.32, [0, hub.s[1] + 0.12, 0], [1, 0.8, 1], 1, 0);
      // striped arm (royal colours) with a padded end
      const n = 5;
      for (let s = 0; s < n; s++) {
        const x = arm.o[0] - arm.s[0] / 2 + (s + 0.5) * (arm.s[0] / n);
        k.box('wood', s % 2 ? '#fff4df' : '#e45b6f', [arm.s[0] / n - 0.02, arm.s[1], arm.s[2]], [x, arm.o[1], 0], [0, 0, 0], 0.05, 0.03);
      }
      k.sphere('cloth', '#ffd153', 0.26, [arm.o[0] + arm.s[0] / 2, arm.o[1], 0], [0.7, 1.1, 1.1], 1, 0);
      return k;
    },
    [d, i],
  );
  useFrame(() => {
    const s = mechState(i);
    if (ref.current && s.length) ref.current.rotation.y = s[0];
  });
  return (
    <group ref={ref} position={d.p}>
      <KitMeshes make={make} />
    </group>
  );
}

/** A giant clock hand pivoting over a sunken clock face: the walkway that carries the team across. */
function ClockHand({ d, i }: { d: RotorDef; i: number }) {
  const ref = useRef<THREE.Group>(null);
  const part = d.parts[0];
  const face = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d')!;
    g.fillStyle = '#f7ead2';
    g.beginPath();
    g.arc(256, 256, 250, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#8e6040';
    g.lineWidth = 14;
    g.stroke();
    g.fillStyle = '#5a3a24';
    g.font = 'bold 52px Fredoka, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const nums = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
    nums.forEach((n, k) => {
      const a = (k / 12) * Math.PI * 2 - Math.PI / 2;
      g.fillText(n, 256 + Math.cos(a) * 190, 256 + Math.sin(a) * 190);
    });
    for (let k = 0; k < 60; k++) {
      const a = (k / 60) * Math.PI * 2;
      g.fillRect(256 + Math.cos(a) * 232 - 3, 256 + Math.sin(a) * 232 - 3, 6, 6);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  const make = useMemo(
    () => () => {
      const k = new Kit(3200 + i);
      const [w, , L] = part.s;
      // hand: top flush with the walk sheet; the timber body hangs below (hidden inside the cliff lips it sweeps over)
      const top = part.o[1] + part.s[1] / 2;
      const h = 0.3;
      k.box('wood', WOOD.dark, [w, h, L], [0, top - h / 2 - 0.012, 0], [0, 0, 0], 0.03, 0.04);
      const n = Math.round(L / 0.5);
      for (let s = 0; s < n; s++) k.box('wood', WOOD.plank[s % 4], [w - 0.18, 0.02, L / n - 0.05], [0, top - 0.008, -L / 2 + (s + 0.5) * (L / n)], [0, 0, 0], 0.008, 0.05);
      for (const sx of [-1, 1]) k.box('gold', GOLD, [0.1, h, L], [sx * (w / 2 - 0.02), top - h / 2 - 0.005, 0], [0, 0, 0], 0.02, 0);
      // arrow tip inlaid at one end (flat, on the walkway)
      k.cone('gold', GOLD, 0.6, 0.9, [0, top + 0.002, L / 2 - 0.65], [Math.PI / 2, 0, 0], 3, 0);
      // hub (a low brass boss you can walk over)
      k.cyl('metal', IRON, 0.8, 0.8, 0.05, [0, top + 0.01, 0], [0, 0, 0], 18, 0);
      k.sphere('gold', GOLD, 0.34, [0, top + 0.02, 0], [1, 0.12, 1], 1, 0);
      // the pivot column down to the face
      k.cyl('metal', IRON, 0.35, 0.45, 2.6, [0, -1.25, 0], [0, 0, 0], 12, 0);
      return k;
    },
    [part, i],
  );
  const gears = useMemo(
    () => () => {
      const k = new Kit(3300 + i);
      // gear teeth around the sunken face + two side cogs (decor below the walk level)
      const R = 4.6;
      for (let t = 0; t < 36; t++) {
        const a = (t / 36) * Math.PI * 2;
        k.box('metal', t % 2 ? '#b98a3a' : '#a07432', [0.42, 0.5, 0.5], [Math.cos(a) * R, -2.6, Math.sin(a) * R], [0, -a, 0], 0.05, 0.03);
      }
      k.cyl('metal', '#8f6a2e', R - 0.1, R - 0.1, 0.5, [0, -2.6, 0], [0, 0, 0], 36, 0);
      for (const [x, z, r] of [[-6.6, -2.2, 2.2], [6.4, 2.6, 1.8]] as const) {
        k.cyl('metal', '#9a7434', r, r, 0.35, [x, -3.4, z], [0, 0, 0], 20, 0);
        for (let t = 0; t < 16; t++) {
          const a = (t / 16) * Math.PI * 2;
          k.box('metal', '#9a7434', [0.3, 0.35, 0.36], [x + Math.cos(a) * (r + 0.15), -3.4, z + Math.sin(a) * (r + 0.15)], [0, -a, 0], 0.03, 0.03);
        }
      }
      return k;
    },
    [i],
  );
  const cog = useRef<THREE.Group>(null);
  useFrame(() => {
    const s = mechState(i);
    if (ref.current && s.length) ref.current.rotation.y = s[0];
    if (cog.current && s.length) cog.current.rotation.y = -s[0] * 0.6;
  });
  return (
    <group position={d.p}>
      <group ref={ref}>
        <KitMeshes make={make} />
      </group>
      <group ref={cog}>
        <KitMeshes make={gears} />
      </group>
      <mesh position={[0, -2.3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[4.4, 48]} />
        <meshStandardMaterial map={face} roughness={0.8} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------- spring pads

function Spring({ d, i }: { d: SpringDef; i: number }) {
  const cap = useRef<THREE.Group>(null);
  const ring = useMemo(() => glow('#bff7f0', TEAL, 0.8), []);
  const make = useMemo(
    () => () => {
      const k = new Kit(3400 + i);
      const [w, l] = d.size;
      // timber frame with iron corners, coil springs in the middle
      for (const s of [-1, 1]) {
        k.box('wood', WOOD.dark, [w + 0.3, 0.22, 0.2], [0, 0.11, s * (l / 2 + 0.05)], [0, 0, 0], 0.04);
        k.box('wood', WOOD.dark, [0.2, 0.22, l + 0.3], [s * (w / 2 + 0.05), 0.11, 0], [0, 0, 0], 0.04);
      }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('metal', IRON, [0.26, 0.26, 0.26], [sx * (w / 2 + 0.05), 0.13, sz * (l / 2 + 0.05)], [0, 0, 0], 0.03, 0);
      return k;
    },
    [d, i],
  );
  const capKit = useMemo(
    () => () => {
      const k = new Kit(3450 + i);
      const [w, l] = d.size;
      k.box('cloth', '#e45b6f', [w - 0.1, 0.16, l - 0.1], [0, 0, 0], [0, 0, 0], 0.07, 0.02);
      // white chevrons pointing where it throws you
      const L = d.playerLaunch ?? d.launch;
      const ang = Math.atan2(L[0], L[2]);
      for (let c = 0; c < 2; c++) {
        for (const s of [-1, 1]) k.box('cloth', '#fff4df', [0.1, 0.03, 0.55], [s * 0.18, 0.09, -0.15 + c * 0.45], [0, ang + s * 0.6, 0], 0.01, 0);
      }
      return k;
    },
    [d, i],
  );
  const coils = useMemo(() => [-1, 1].flatMap((sx) => [-1, 1].map((sz) => [sx * d.size[0] * 0.28, sz * d.size[1] * 0.28] as [number, number])), [d]);
  const coilRefs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(({ clock }) => {
    const s = mechState(i);
    const age = s.length ? s[0] : 9;
    // squash then overshoot after a launch
    const k = age < 0.08 ? 1 - age / 0.08 : age < 0.7 ? Math.sin(((age - 0.08) / 0.62) * Math.PI * 2.5) * Math.exp(-(age - 0.08) * 5) * -0.8 : 0;
    const h = 0.32 - k * 0.22;
    if (cap.current) cap.current.position.y = h + 0.1;
    coilRefs.current.forEach((m) => m && (m.scale.y = Math.max(0.2, h / 0.32)));
    ring.emissiveIntensity = 0.6 + Math.sin(clock.elapsedTime * 4 + i) * 0.3 + (age < 0.5 ? 2 : 0);
  });
  return (
    <group position={d.p}>
      <KitMeshes make={make} />
      {coils.map(([x, z], k) => (
        <mesh key={k} ref={(m) => (coilRefs.current[k] = m)} position={[x, 0.16, z]} material={ring}>
          <cylinderGeometry args={[0.16, 0.16, 0.32, 10, 1, true]} />
        </mesh>
      ))}
      <group ref={cap} position={[0, 0.42, 0]}>
        <KitMeshes make={capKit} />
      </group>
    </group>
  );
}

/** Bouncy toadstool pad (World 4): squashes on launch; the giant one shows where its aim lever points. */
function MushroomPad({ d, i, aimIndex }: { d: SpringDef; i: number; aimIndex: number }) {
  const cap = useRef<THREE.Group>(null);
  const arrow = useRef<THREE.Group>(null);
  const big = d.style === 'bigmushroom';
  const r = Math.max(d.size[0], d.size[1]) / 2 + (big ? 0.35 : 0.15);
  const color = big ? CAPS[2] : CAPS[i % 2];
  const make = useMemo(
    () => () => {
      const k = new Kit(3460 + i);
      k.cyl('plaster', '#f6ead6', r * 0.35, r * 0.45, 0.35, [0, 0.17, 0], [0, 0, 0], 14, 0.03);
      return k;
    },
    [r, i],
  );
  const capKit = useMemo(
    () => () => {
      const k = new Kit(3470 + i);
      toadstool(k, [0, -0.02, 0], 0.01, r, color);
      return k;
    },
    [r, i, color],
  );
  useFrame(({ clock }) => {
    const s = mechState(i);
    const age = s.length ? s[0] : 9;
    const k = age < 0.08 ? 1 - age / 0.08 : age < 0.8 ? Math.sin(((age - 0.08) / 0.72) * Math.PI * 2.5) * Math.exp(-(age - 0.08) * 4.5) * -0.9 : 0;
    if (cap.current) {
      cap.current.scale.set(1 + k * 0.18, Math.max(0.35, 1 - k * 0.5), 1 + k * 0.18);
      cap.current.position.y = 0.32 - k * 0.12;
    }
    if (arrow.current && d.aim) {
      const a = Math.round(mechState(aimIndex)[0] ?? 0);
      const L = d.aim.launches[Math.min(d.aim.launches.length - 1, a)] ?? d.launch;
      arrow.current.rotation.y = Math.atan2(L[0], L[2]);
      arrow.current.position.y = r * 0.62 + 0.45 + Math.sin(clock.elapsedTime * 3) * 0.08;
    }
  });
  return (
    <group position={d.p}>
      <KitMeshes make={make} />
      <group ref={cap} position={[0, 0.32, 0]}>
        <KitMeshes make={capKit} />
      </group>
      {d.aim && (
        <group ref={arrow}>
          <mesh position={[0, 0, 0.7]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.35, 0.8, 4]} />
            <meshStandardMaterial color="#ffd153" emissive="#ffb21e" emissiveIntensity={1.4} />
          </mesh>
          <mesh position={[0, 0, 0.1]}>
            <boxGeometry args={[0.18, 0.08, 0.9]} />
            <meshStandardMaterial color="#ffd153" emissive="#ffb21e" emissiveIntensity={1.4} />
          </mesh>
        </group>
      )}
    </group>
  );
}

/** Bobbing toadstool cap platform (World 4 mover). */
function CapPlatform({ d, i }: { d: MoverDef; i: number }) {
  const ref = useRef<THREE.Group>(null);
  const make = useMemo(
    () => () => {
      const k = new Kit(4150 + i);
      const r = d.s[0] / 2 + 0.1;
      k.cyl('cloth', CAPS[(i + 1) % CAPS.length], r, r * 0.92, d.s[1], [0, -d.s[1] / 2, 0], [0, 0, 0], 22, 0.03);
      k.sphere('cloth', CAPS[(i + 1) % CAPS.length], r * 0.96, [0, -d.s[1] - 0.05, 0], [1, 0.35, 1], 2, 0);
      k.cyl('plaster', '#f6ead6', r * 0.22, r * 0.12, 1.4, [0, -d.s[1] - 0.8, 0], [0, 0, 0], 10, 0.03);
      for (let s = 0; s < 6; s++) {
        const a = (s / 6) * Math.PI * 2 + i;
        k.sphere('plaster', '#ffffff', 0.18, [Math.cos(a) * r * 0.6, 0.0, Math.sin(a) * r * 0.6], [1, 0.25, 1], 1, 0);
      }
      return k;
    },
    [d, i],
  );
  useEffect(
    () =>
      registerGround((x, z) => {
        const s = mechState(i);
        if (s.length < 3) return null;
        return Math.hypot(x - s[0], z - s[2]) <= d.s[0] / 2 ? s[1] : null;
      }),
    [d, i],
  );
  useFrame(({ clock }) => {
    const s = mechState(i);
    if (ref.current && s.length >= 3) {
      ref.current.position.set(s[0], s[1], s[2]);
      ref.current.rotation.y = Math.sin(clock.elapsedTime * 0.6 + i) * 0.15;
    }
  });
  return (
    <group ref={ref} position={d.path[0]}>
      <KitMeshes make={make} />
    </group>
  );
}

/** The giant puffball: swells and wobbles during its wind-up, bursts, then slowly refills. */
function Puffball({ d, i }: { d: PufferDef; i: number }) {
  const ref = useRef<THREE.Group>(null);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#fbe9f2', roughness: 0.85 }), []);
  const spots = useMemo(() => new THREE.MeshStandardMaterial({ color: '#e7b7cf', roughness: 0.9 }), []);
  const glowMat = useMemo(() => glow('#ffd6ec', '#ff7fb6', 0.4), []);
  const dots = useMemo(() => Array.from({ length: 14 }, (_, k) => [Math.cos(k * 2.4) * 0.9, 0.35 + ((k * 0.37) % 0.6), Math.sin(k * 2.4) * 0.9] as V3), []);
  useFrame(({ clock }) => {
    const s = mechState(i);
    const ph = s[0] ?? 0;
    const wind = d.windup / d.period;
    const g = ref.current;
    if (!g) return;
    let k = 0.82 + ph * 0.12;
    let wob = 0;
    if (ph > 1 - wind) {
      const u = (ph - (1 - wind)) / wind;
      k = 0.94 + u * 0.24;
      wob = Math.sin(clock.elapsedTime * 30) * 0.05 * u;
    } else if (ph < 0.06) k = 0.6 + (ph / 0.06) * 0.22;
    g.scale.set(k + wob, k - wob, k + wob);
    glowMat.emissiveIntensity = ph > 1 - wind ? 2.5 : 0.4;
  });
  return (
    <group position={d.p}>
      <group ref={ref}>
        <mesh position={[0, 1.15, 0]} material={mat} scale={[1.6, 1.2, 1.6]} castShadow>
          <sphereGeometry args={[1, 24, 16]} />
        </mesh>
        {dots.map((p, k) => (
          <mesh key={k} position={[p[0] * 1.55, p[1] * 2.2 + 0.6, p[2] * 1.55]} material={spots}>
            <sphereGeometry args={[0.16, 8, 6]} />
          </mesh>
        ))}
        <mesh position={[0, 2.5, 0]} material={glowMat}>
          <sphereGeometry args={[0.28, 12, 8]} />
        </mesh>
      </group>
    </group>
  );
}

/** Glowing moss: slippery ground drawn as soft luminous patches. */
function Moss({ d }: { d: SlipDef }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#9ff7e0', emissive: '#2fd6c8', emissiveIntensity: 0.9, roughness: 0.3, transparent: true, opacity: 0.8, depthWrite: false }), []);
  const items = useMemo(() => {
    const R = (k: number) => ((Math.sin(k * 12.9898 + d.min[0]) * 43758.5453) % 1 + 1) % 1;
    const out: [number, number, number][] = [];
    const w = d.max[0] - d.min[0], l = d.max[2] - d.min[2];
    const n = Math.round(w * l * 0.7);
    for (let k = 0; k < n; k++) out.push([d.min[0] + R(k) * w, d.min[2] + R(k + 99) * l, 0.35 + R(k + 7) * 0.6]);
    return out;
  }, [d]);
  const done = useRef(false);
  useFrame(({ clock }) => {
    mat.emissiveIntensity = 0.7 + Math.sin(clock.elapsedTime * 1.3) * 0.25;
    const mesh = ref.current;
    if (done.current || !mesh) return;
    done.current = true;
    const m4 = new THREE.Matrix4();
    items.forEach(([x, z, s], k) => {
      m4.makeScale(s, 1, s).setPosition(x, d.min[1] + 1.01 + 0.004 * (k % 3), z);
      mesh.setMatrixAt(k, m4);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]} material={mat} frustumCulled={false} renderOrder={1}>
      <cylinderGeometry args={[1, 1, 0.02, 10]} />
    </instancedMesh>
  );
}

// ---------------------------------------------------------------- wobbly bridge

function Wobble({ d, i }: { d: WobbleDef; i: number }) {
  const ref = useRef<THREE.Group>(null);
  const make = useMemo(() => () => buildBridge({ p: [0, -d.s[1] / 2, 0], s: [d.s[0], d.s[1], d.s[2] + 0.3], mat: 'plank', tag: 'bridge' }, !!d.rails, new Kit(3500 + i)), [d, i]);
  // shadows land on the deck even though it is a moving mechanism
  useEffect(() => registerGround((x, z) => (Math.abs(x - d.p[0]) <= d.s[0] / 2 && Math.abs(z - d.p[2]) <= d.s[2] / 2 ? d.p[1] : null)), [d]);
  useFrame(() => {
    const s = mechState(i);
    if (ref.current) ref.current.rotation.z = s.length ? s[0] : 0;
  });
  return (
    <group ref={ref} position={d.p}>
      <KitMeshes make={make} />
    </group>
  );
}

// ---------------------------------------------------------------- switches (Q)

function Switch({ d, i }: { d: SwitchDef; i: number }) {
  const moving = useRef<THREE.Group>(null);
  const lamp = useMemo(() => glow('#bff7f0', TEAL, 0.6), []);
  const sign = useMemo(() => textTexture([d.label.toUpperCase(), 'press Q'], 512, 200, '#5a3a24', 64, '#f7ead2'), [d.label]);
  const make = useMemo(
    () => () => {
      const k = new Kit(3600 + i);
      k.box('stone', STONE.block[1], [0.9, 0.3, 0.9], [0, 0.15, 0], [0, 0, 0], 0.06);
      k.box('wood', WOOD.dark, [0.32, 1.2, 0.32], [0, 0.85, 0], [0, 0, 0], 0.04);
      k.box('metal', IRON, [0.5, 0.12, 0.5], [0, 1.48, 0], [0, 0, 0], 0.03, 0);
      // sign board on a short post beside it
      k.box('wood', WOOD.dark, [0.1, 1.5, 0.1], [0.75, 0.75, 0], [0, 0, 0], 0.02);
      return k;
    },
    [i],
  );
  useFrame(({ clock }) => {
    const s = mechState(i);
    const v = s[0] ?? 0;
    const holders = s[2] ?? 0;
    const g = moving.current;
    if (g) {
      if (d.style === 'crank') g.position.y = 1.62 - (s[1] ?? 0) * 0.45 + (holders > 0 ? Math.sin(clock.elapsedTime * 18) * 0.04 : 0);
      else if (d.style === 'wheel') g.rotation.z += ((v ? Math.PI : 0) - g.rotation.z) * 0.08;
      else if (d.mode === 'select') g.rotation.x += ((-0.8 + (v / Math.max(1, (d.positions ?? 2) - 1)) * 1.6) - g.rotation.x) * 0.15;
      else g.rotation.x += ((v ? -0.8 : 0.8) - g.rotation.x) * 0.15;
    }
    lamp.emissiveIntensity = (v ? 2.2 : 0.5) + (holders > 0 ? 1.5 : 0) + Math.sin(clock.elapsedTime * 3 + i) * 0.2;
  });
  return (
    <group position={d.p} rotation={[0, d.yaw ?? 0, 0]}>
      <KitMeshes make={make} />
      <group ref={moving} position={[0, 1.62, 0]}>
        {d.style === 'crank' ? (
          <group>
            <mesh position={[0, 0.3, 0]}>
              <cylinderGeometry args={[0.05, 0.05, 0.6, 8]} />
              <meshStandardMaterial color={IRON} metalness={0.7} roughness={0.4} />
            </mesh>
            <mesh position={[0, 0.62, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.07, 0.07, 0.8, 10]} />
              <meshStandardMaterial color={GOLD} metalness={1} roughness={0.3} />
            </mesh>
          </group>
        ) : d.style === 'wheel' ? (
          <group rotation={[Math.PI / 2, 0, 0]}>
            <mesh>
              <torusGeometry args={[0.42, 0.06, 8, 24]} />
              <meshStandardMaterial color={GOLD} metalness={1} roughness={0.3} />
            </mesh>
            {[0, 1, 2].map((k) => (
              <mesh key={k} rotation={[0, (k * Math.PI) / 3, 0]}>
                <boxGeometry args={[0.84, 0.06, 0.06]} />
                <meshStandardMaterial color={GOLD} metalness={1} roughness={0.3} />
              </mesh>
            ))}
          </group>
        ) : (
          <group>
            <mesh position={[0, 0.35, 0]}>
              <boxGeometry args={[0.1, 0.7, 0.1]} />
              <meshStandardMaterial color={WOOD.rail} roughness={0.75} />
            </mesh>
            <mesh position={[0, 0.72, 0]} material={lamp}>
              <sphereGeometry args={[0.15, 14, 10]} />
            </mesh>
          </group>
        )}
      </group>
      <mesh position={[0, 1.55, 0]} material={lamp}>
        <sphereGeometry args={[0.08, 10, 8]} />
      </mesh>
      <group position={[0.75, 1.62, 0.07]}>
        <mesh>
          <boxGeometry args={[1.05, 0.42, 0.06]} />
          <meshStandardMaterial color="#8e6040" roughness={0.8} />
        </mesh>
        <mesh position={[0, 0, 0.035]}>
          <planeGeometry args={[0.98, 0.36]} />
          <meshStandardMaterial map={sign} roughness={0.85} />
        </mesh>
      </group>
    </group>
  );
}

/** A big golden push-button set into a floor (the clock hand's hub brake): sinks and glows while held. */
function FloorButton({ d, i }: { d: SwitchDef; i: number }) {
  const cap = useRef<THREE.Mesh>(null);
  const lamp = useMemo(() => glow('#bff7f0', TEAL, 0.6), []);
  useFrame(({ clock }) => {
    const s = mechState(i);
    const on = (s[0] ?? 0) > 0.5;
    if (cap.current) cap.current.position.y = on ? 0.07 : 0.13;
    lamp.emissiveIntensity = on ? 2.6 : 0.6 + Math.sin(clock.elapsedTime * 4 + i) * 0.4;
  });
  return (
    <group position={[d.p[0], d.p[1] + 0.03, d.p[2]]}>
      <mesh ref={cap} position={[0, 0.13, 0]} scale={[1, 0.45, 1]}>
        <sphereGeometry args={[0.42, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#ffd153" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} material={lamp}>
        <ringGeometry args={[0.5, 0.62, 32]} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------- blockers (barricades between maps)

function Blocker({ d, i }: { d: BlockerDef; i: number }) {
  const ref = useRef<THREE.Group>(null);
  const sign = useMemo(() => (d.label ? textTexture([d.label, '→'], 512, 220, '#5a3a24', 60, '#f7ead2') : null), [d.label]);
  const make = useMemo(
    () => () => {
      const k = new Kit(3700 + i);
      const [w, h] = d.s;
      const n = Math.max(2, Math.round(w / 1.6));
      // trestles + striped crossbars
      for (let p = 0; p <= n; p++) {
        const x = -w / 2 + (p * w) / n;
        k.box('wood', WOOD.dark, [0.18, h, 0.18], [x, 0, 0], [0, 0, 0], 0.03);
      }
      for (const y of [h * 0.18, h * 0.42]) {
        const segs = Math.max(2, Math.round(w / 0.7));
        for (let s = 0; s < segs; s++) k.box('wood', s % 2 ? '#fff4df' : '#e45b6f', [w / segs - 0.02, 0.2, 0.1], [-w / 2 + (s + 0.5) * (w / segs), y - h / 2 + 0.9, 0.06], [0, 0, 0], 0.02, 0.02);
      }
      return k;
    },
    [d, i],
  );
  useFrame(() => {
    const s = mechState(i);
    if (ref.current) ref.current.visible = (s[0] ?? 1) > 0.5;
  });
  if (d.style === 'invisible') return null;
  return (
    <group ref={ref} position={d.p} rotation={[0, d.rotY ?? 0, 0]}>
      <KitMeshes make={make} />
      {sign && (
        <group position={[0, d.s[1] / 2 + 0.25, 0.1]}>
          <mesh>
            <boxGeometry args={[1.8, 0.7, 0.08]} />
            <meshStandardMaterial color="#8e6040" roughness={0.8} />
          </mesh>
          <mesh position={[0, 0, 0.045]}>
            <planeGeometry args={[1.7, 0.62]} />
            <meshStandardMaterial map={sign} roughness={0.85} />
          </mesh>
        </group>
      )}
    </group>
  );
}

// ---------------------------------------------------------------- royal stamps

const stampTex = (() => {
  let t: THREE.CanvasTexture | null = null;
  return () => {
    if (t) return t;
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = '#ffd153';
    g.beginPath();
    g.arc(128, 128, 124, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#b8862a';
    g.lineWidth = 10;
    g.beginPath();
    g.arc(128, 128, 108, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#c0392b';
    g.beginPath();
    g.moveTo(58, 160); g.lineTo(58, 90); g.lineTo(92, 124); g.lineTo(128, 70); g.lineTo(164, 124); g.lineTo(198, 90); g.lineTo(198, 160);
    g.closePath();
    g.fill();
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
})();

function Stamp({ d, i }: { d: CollectDef; i: number }) {
  const ref = useRef<THREE.Group>(null);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ map: stampTex(), emissive: '#ffb21e', emissiveIntensity: 0.6, metalness: 0.5, roughness: 0.35 }), []);
  const rim = useMemo(() => new THREE.MeshStandardMaterial({ color: '#e0a03a', emissive: '#ffb21e', emissiveIntensity: 0.4, metalness: 0.9, roughness: 0.3 }), []);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    const s = mechState(i);
    const taken = (s[0] ?? 0) > 0.5;
    g.visible = !taken;
    const t = clock.elapsedTime;
    g.rotation.y = t * 1.8 + i;
    g.position.y = d.p[1] + Math.sin(t * 2.2 + i) * 0.12;
    mat.emissiveIntensity = 0.7 + Math.sin(t * 5 + i) * 0.3;
  });
  if (d.item === 'mushroom') {
    return (
      <group ref={ref} position={d.p}>
        <mesh position={[0, 0.12, 0]} material={rim} scale={[1, 0.6, 1]}>
          <sphereGeometry args={[0.42, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
        <mesh position={[0, -0.12, 0]} material={mat}>
          <cylinderGeometry args={[0.12, 0.16, 0.5, 12]} />
        </mesh>
      </group>
    );
  }
  return (
    <group ref={ref} position={d.p}>
      <mesh rotation={[Math.PI / 2, 0, 0]} material={rim}>
        <cylinderGeometry args={[0.36, 0.36, 0.08, 24]} />
      </mesh>
      <mesh position={[0, 0, 0.045]} material={mat}>
        <circleGeometry args={[0.33, 24]} />
      </mesh>
      <mesh position={[0, 0, -0.045]} rotation={[0, Math.PI, 0]} material={mat}>
        <circleGeometry args={[0.33, 24]} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------- generic gate (portcullis) + plate

function Portcullis({ d, i }: { d: GateDef; i: number }) {
  const ref = useRef<THREE.Group>(null);
  const make = useMemo(
    () => () => {
      const k = new Kit(3800 + i);
      const [w, h] = d.s;
      // iron bars with ~1 m gaps (couriers squeeze through, the artifact doesn't), two cross bands, gold spikes
      const n = Math.round(w / 1.1);
      for (let b = 0; b <= n; b++) {
        const x = -w / 2 + (b * w) / n;
        k.box('metal', IRON, [0.13, h, 0.13], [x, 0, 0], [0, 0, 0], 0.02, 0.02);
        k.cone('gold', GOLD, 0.11, 0.28, [x, h / 2 + 0.14, 0], [0, 0, 0], 4, 0);
      }
      for (const y of [-h * 0.25, h * 0.3]) k.box('metal', '#5a5268', [w, 0.14, 0.16], [0, y, 0], [0, 0, 0], 0.02, 0);
      k.box('gold', GOLD, [0.8, 0.5, 0.08], [0, h * 0.3, 0.1], [0, 0, 0], 0.05, 0);
      return k;
    },
    [d, i],
  );
  const frameKit = useMemo(
    () => () => {
      const k = new Kit(3850 + i);
      const [w, h] = d.s;
      for (const s of [-1, 1]) k.box('stone', STONE.block[s > 0 ? 0 : 2], [0.6, h + 0.6, 0.7], [s * (w / 2 + 0.3), (h + 0.6) / 2 - 0.02, 0], [0, 0, 0], 0.06);
      k.box('stone', STONE.trim, [w + 1.4, 0.5, 0.8], [0, h + 0.55, 0], [0, 0, 0], 0.06);
      return k;
    },
    [d, i],
  );
  useFrame(() => {
    const s = mechState(i);
    const t = s[0] ?? 0;
    if (ref.current) ref.current.position.y = d.p[1] - d.drop * smooth(t);
  });
  // the ending cutscene films the King from the plaza, straight through this gateway
  const cutscene = useGame((g) => g.cutscene);
  return (
    <group visible={!cutscene}>
      <group position={[d.p[0], 0, d.p[2]]}>
        <KitMeshes make={frameKit} />
      </group>
      <group ref={ref} position={d.p}>
        <KitMeshes make={make} />
      </group>
    </group>
  );
}

function Plate({ d, i }: { d: PlateDef; i: number }) {
  const pad = useRef<THREE.Group>(null);
  const glowMat = useMemo(() => glow('#ffe48a', '#ffb21e', 0.6), []);
  const make = useMemo(
    () => () => {
      const k = new Kit(3900 + i);
      const [w, l] = d.size;
      for (const s of [-1, 1]) {
        k.box('stone', STONE.block[0], [w + 0.5, 0.14, 0.25], [0, 0.06, s * (l / 2 + 0.12)], [0, 0, 0], 0.04, 0.05);
        k.box('stone', STONE.block[2], [0.25, 0.14, l], [s * (w / 2 + 0.12), 0.06, 0], [0, 0, 0], 0.04, 0.05);
      }
      return k;
    },
    [d, i],
  );
  const padKit = useMemo(
    () => () => {
      const k = new Kit(3950 + i);
      const [w, l] = d.size;
      k.box('wood', WOOD.plank[1], [w - 0.08, 0.1, l - 0.08], [0, 0, 0], [0, 0, 0], 0.03, 0.05);
      // courier footprint inlay: this plate wants a courier
      for (const s of [-1, 1]) k.sphere('dark', '#6a4a2e', 0.16, [s * 0.18, 0.055, 0], [1, 0.12, 1.5], 1, 0);
      return k;
    },
    [d, i],
  );
  useFrame(({ clock }) => {
    const s = mechState(i);
    const on = (s[1] ?? 0) > 0.5;
    if (pad.current) pad.current.position.y = on ? 0.02 : 0.07;
    glowMat.emissiveIntensity = on ? 2.6 : 0.8 + Math.sin(clock.elapsedTime * 4 + i) * 0.4;
  });
  return (
    <group position={[d.p[0], d.p[1], d.p[2]]}>
      <KitMeshes make={make} />
      <group ref={pad} position={[0, 0.07, 0]}>
        <KitMeshes make={padKit} />
      </group>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} material={glowMat}>
        <ringGeometry args={[Math.min(d.size[0], d.size[1]) / 2 + 0.02, Math.min(d.size[0], d.size[1]) / 2 + 0.12, 4, 1, Math.PI / 4]} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------- extra wind machine (non-legacy wind zones)

function GustFan({ d, i }: { d: WindDef; i: number }) {
  const blades = useRef<THREE.Group>(null);
  const lamp = useMemo(() => glow('#ffd27a', '#ff9b2e', 0.2), []);
  const spin = useRef(0);
  const z = d.zone;
  const pos: V3 = useMemo(() => [z.dir[0] < 0 ? z.max[0] + 0.6 : z.min[0] - 0.6, 1.2, (z.min[2] + z.max[2]) / 2], [z]);
  const make = useMemo(
    () => () => {
      const k = new Kit(4000 + i);
      // rock perch + timber tower + drum housing facing along the wind
      k.sphere('stone', '#b7a2a6', 1.9, [0, -2.2, 0], [1.1, 0.8, 1.1], 1, 0.08);
      for (const ox of [-0.7, 0.7]) for (const oz of [-0.7, 0.7]) k.beam('wood', WOOD.dark, [ox * 1.3, -1.6, oz * 1.3], [ox * 0.6, 0.6, oz * 0.6], 0.22, 0.22, 0.03);
      const R = 1.7;
      for (let s = 0; s < 14; s++) {
        const a = (s / 14) * Math.PI * 2;
        k.box('wood', WOOD.plank[s % 4], [0.8, 0.16, (2 * Math.PI * R) / 14 + 0.05], [0, 2.0 + Math.sin(a) * R, Math.cos(a) * R], [Math.PI / 2 - a, 0, 0], 0.03, 0.06);
      }
      k.box('wood', WOOD.plank[1], [0.9, 0.7, 0.7], [0.75, 2.0, 0], [0, 0, 0], 0.07);
      k.cone('roof', '#5ab9b3', 0.65, 0.6, [0.5, 4.1, 0], [0, Math.PI / 4, 0], 4);
      return k;
    },
    [i],
  );
  useFrame(({ clock }, dtRaw) => {
    const dt = Math.min(0.05, dtRaw);
    const s = mechState(i)[0] ?? 0;
    spin.current += dt * (s > 0 ? 5 + s * 22 : s < 0 ? 1.5 - s * 7 : 0.3);
    if (blades.current) blades.current.rotation.x = spin.current;
    lamp.emissiveIntensity = s < 0 ? (Math.sin(clock.elapsedTime * 14) > 0 ? 3.2 : 0.3) : s > 0 ? 2.2 : 0.2;
  });
  return (
    <group position={pos} rotation={[0, z.dir[0] < 0 ? 0 : Math.PI, 0]}>
      <KitMeshes make={make} />
      <group ref={blades} position={[-0.2, 2.0, 0]}>
        {[0, 1, 2, 3, 4].map((k) => (
          <group key={k} rotation={[(k * Math.PI * 2) / 5, 0, 0]}>
            <mesh position={[0, 0.82, 0]} rotation={[0, 0.5, 0]}>
              <boxGeometry args={[0.06, 1.35, 0.55]} />
              <meshStandardMaterial color={k % 2 ? '#fff4df' : '#9b8de4'} roughness={0.7} />
            </mesh>
          </group>
        ))}
      </group>
      <mesh position={[0.5, 3.75, 0]} material={lamp}>
        <sphereGeometry args={[0.18, 12, 10]} />
      </mesh>
    </group>
  );
}

/** Wind ribbons for any wind mechanism without a hand-made Chapter visual. */
function GustStreaks({ d, i }: { d: WindDef; i: number }) {
  const N = 26;
  const ref = useRef<THREE.InstancedMesh>(null);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }), []);
  const z = d.zone;
  const st = useMemo(() => Array.from({ length: N }, (_, k) => ({ x: z.min[0] + ((k * 7.3) % 1) * (z.max[0] - z.min[0]), y: 0.5 + ((k * 3.7) % 1) * 3, zz: z.min[2] + ((k * 5.1) % 1) * (z.max[2] - z.min[2]), sp: 0.7 + ((k * 2.3) % 1) * 0.6, len: 1.4 + ((k * 1.7) % 1) * 2 })), [z]);
  const m4 = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const v = useMemo(() => new THREE.Vector3(), []);
  const sc = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dtRaw) => {
    const dt = Math.min(0.05, dtRaw);
    const s = Math.max(0, mechState(i)[0] ?? 0);
    mat.opacity += (s * 0.55 - mat.opacity) * Math.min(1, dt * 6);
    const mesh = ref.current;
    if (!mesh) return;
    st.forEach((p, k) => {
      p.x += z.dir[0] * dt * (6 + s * 22) * p.sp;
      if (p.x < z.min[0]) p.x = z.max[0];
      if (p.x > z.max[0]) p.x = z.min[0];
      m4.compose(v.set(p.x, p.y, p.zz), q, sc.set(p.len * (0.6 + s * 0.6), 0.06, 0.06));
      mesh.setMatrixAt(k, m4);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, N]} material={mat} frustumCulled={false} renderOrder={3}>
      <boxGeometry args={[1, 1, 1]} />
    </instancedMesh>
  );
}

// ---------------------------------------------------------------- moving platforms

function Mover({ d, i }: { d: MoverDef; i: number }) {
  const ref = useRef<THREE.Group>(null);
  const make = useMemo(
    () => () => {
      const k = new Kit(4100 + i);
      const [w, h, l] = d.s;
      const n = Math.max(2, Math.round(l / 0.5));
      for (let s = 0; s < n; s++) k.box('wood', WOOD.plank[s % 4], [w - 0.06, h * 0.6, l / n - 0.04], [0, -h * 0.3, -l / 2 + (s + 0.5) * (l / n)], [0, 0, 0], 0.03, 0.06);
      k.box('wood', WOOD.dark, [w, h * 0.45, l], [0, -h * 0.78, 0], [0, 0, 0], 0.04);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('gold', GOLD, [0.2, 0.08, 0.2], [sx * (w / 2 - 0.12), 0.01, sz * (l / 2 - 0.12)], [0, 0, 0], 0.02, 0);
      return k;
    },
    [d, i],
  );
  useEffect(
    () =>
      registerGround((x, z) => {
        const s = mechState(i);
        if (s.length < 3) return null;
        return Math.abs(x - s[0]) <= d.s[0] / 2 && Math.abs(z - s[2]) <= d.s[2] / 2 ? s[1] : null;
      }),
    [d, i],
  );
  useFrame(() => {
    const s = mechState(i);
    if (ref.current && s.length >= 3) ref.current.position.set(s[0], s[1], s[2]);
  });
  return (
    <group ref={ref} position={d.path[0]}>
      <KitMeshes make={make} />
    </group>
  );
}

// ---------------------------------------------------------------- rail cart + crane (World 5)

function Cart({ d, i }: { d: CartDef; i: number }) {
  const ref = useRef<THREE.Group>(null);
  const gate = useRef<THREE.Group>(null);
  const wheels = useRef<THREE.Group>(null);
  const lamp = useMemo(() => glow('#ffe9a0', '#ffb21e', 1.2), []);
  const [bw, wh, bl] = d.bed;
  const f = d.floor;
  const make = useMemo(
    () => () => {
      const k = new Kit(4500 + i);
      // chassis + plank floor + low walls (inside the wall colliders) + front buffer
      k.box('wood', WOOD.dark, [bw + 0.3, 0.26, bl + 0.4], [0, f - 0.28, 0], [0, 0, 0], 0.04);
      const n = Math.round(bl / 0.5);
      for (let s = 0; s < n; s++) k.box('wood', WOOD.plank[s % 4], [bw + 0.2, 0.06, bl / n - 0.04], [0, f - 0.03, -bl / 2 + (s + 0.5) * (bl / n)], [0, 0, 0], 0.01, 0.06);
      for (const sx of [-1, 1]) {
        k.box('wood', WOOD.plank[1], [0.2, wh, bl + 0.3], [sx * (bw / 2 + 0.12), f + wh / 2, 0], [0, 0, 0], 0.04, 0.05);
        k.box('gold', '#ffcf5a', [0.24, 0.08, bl + 0.34], [sx * (bw / 2 + 0.12), f + wh, 0], [0, 0, 0], 0.02, 0);
      }
      k.box('wood', WOOD.plank[2], [bw + 0.44, wh, 0.2], [0, f + wh / 2, -bl / 2 - 0.12], [0, 0, 0], 0.04, 0.05);
      k.box('metal', IRON, [bw + 0.2, 0.3, 0.3], [0, f - 0.15, -bl / 2 - 0.35], [0, 0, 0], 0.04, 0);
      k.box('wood', '#e45b6f', [0.9, 0.5, 0.06], [0, f + wh + 0.1, -bl / 2 - 0.12], [0, 0, 0], 0.03, 0);
      return k;
    },
    [bw, wh, bl, f, i],
  );
  const gateKit = useMemo(
    () => () => {
      const k = new Kit(4550 + i);
      k.box('wood', WOOD.plank[3], [bw + 0.44, wh, 0.18], [0, 0, 0], [0, 0, 0], 0.04, 0.05);
      k.box('metal', IRON, [bw + 0.2, 0.06, 0.2], [0, wh / 2 - 0.05, 0], [0, 0, 0], 0.01, 0);
      return k;
    },
    [bw, wh, i],
  );
  useEffect(
    () =>
      registerGround((x, z) => {
        const s = mechState(i);
        if (s.length < 4) return null;
        const dx = x - s[0], dz = z - s[2];
        const c = Math.cos(-s[3]), sn = Math.sin(-s[3]);
        const lx = dx * c + dz * sn, lz = -dx * sn + dz * c;
        return Math.abs(lx) <= bw / 2 + 0.2 && Math.abs(lz) <= bl / 2 + 0.2 ? s[1] + f : null;
      }),
    [i, bw, bl, f],
  );
  useFrame(({ clock }) => {
    const s = mechState(i);
    const g = ref.current;
    if (!g || s.length < 6) return;
    g.position.set(s[0], s[1], s[2]);
    g.rotation.y = s[3];
    if (gate.current) gate.current.position.y = f + wh / 2 - (1 - smooth(s[5])) * (wh + 0.05);
    if (wheels.current) wheels.current.children.forEach((w) => (w.rotation.x -= (s[4] ? 0.25 : 0)));
    lamp.emissiveIntensity = s[4] ? 2.4 + Math.sin(clock.elapsedTime * 10) * 0.4 : (s[7] ?? 0) > 0.5 ? 1.6 : 0.6;
  });
  return (
    <group ref={ref} position={d.track[0]}>
      <KitMeshes make={make} />
      <group ref={gate} position={[0, f, bl / 2 + 0.12]}>
        <KitMeshes make={gateKit} />
      </group>
      <group ref={wheels}>
        {[-1, 1].flatMap((sx) =>
          [-1, 1].map((sz) => (
            <mesh key={`${sx}${sz}`} position={[sx * 0.72, 0.28, sz * (bl / 2 - 0.5)]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.28, 0.28, 0.16, 14]} />
              <meshStandardMaterial color={IRON} metalness={0.7} roughness={0.4} />
            </mesh>
          )),
        )}
      </group>
      <mesh position={[0, f + wh + 0.55, -bl / 2 - 0.12]} material={lamp}>
        <sphereGeometry args={[0.16, 12, 10]} />
      </mesh>
    </group>
  );
}

function Crane({ d, i }: { d: CraneDef; i: number }) {
  const jib = useRef<THREE.Group>(null);
  const chain = useRef<THREE.Mesh>(null);
  const hook = useRef<THREE.Group>(null);
  const magnet = useMemo(() => glow('#c9c2d6', '#57e0d4', 0.3), []);
  const top = d.hookTop + 1.4;
  const make = useMemo(
    () => () => {
      const k = new Kit(4600 + i);
      // lattice tower
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.beam('wood', WOOD.dark, [d.pivot[0] + sx * 0.7, 0.3, d.pivot[2] + sz * 0.7], [d.pivot[0] + sx * 0.35, top, d.pivot[2] + sz * 0.35], 0.24, 0.24, 0.03);
      for (let y = 1.5; y < top - 0.5; y += 1.9) {
        k.box('wood', WOOD.beam, [1.5, 0.14, 0.14], [d.pivot[0], y, d.pivot[2] + 0.55], [0, 0, 0], 0.02);
        k.box('wood', WOOD.beam, [1.5, 0.14, 0.14], [d.pivot[0], y, d.pivot[2] - 0.55], [0, 0, 0], 0.02);
      }
      k.cyl('metal', IRON, 0.7, 0.7, 0.3, [d.pivot[0], top, d.pivot[2]], [0, 0, 0], 16, 0);
      return k;
    },
    [d, i, top],
  );
  const jibKit = useMemo(
    () => () => {
      const k = new Kit(4650 + i);
      // jib along local +X, counterweight behind, operator cab on the slewing ring
      k.beam('wood', WOOD.beam, [-2.2, 0.35, 0], [d.radius + 0.4, 0.35, 0], 0.42, 0.42, 0.04);
      k.beam('wood', WOOD.dark, [0, 1.6, 0], [d.radius, 0.55, 0], 0.16, 0.16, 0.02);
      k.box('stone', STONE.block[2], [1.2, 1.0, 1.2], [-2.4, 0.2, 0], [0, 0, 0], 0.06);
      k.box('wood', WOOD.plank[1], [1.1, 1.0, 1.0], [0, 0.95, 0], [0, 0, 0], 0.06);
      k.cone('roof', '#5ab9b3', 0.9, 0.6, [0, 1.75, 0], [0, Math.PI / 4, 0], 4);
      k.cyl('metal', IRON, 0.22, 0.22, 0.5, [d.radius, 0.2, 0], [Math.PI / 2, 0, 0], 10, 0);
      return k;
    },
    [d, i],
  );
  useFrame(({ clock }) => {
    const s = mechState(i);
    if (s.length < 5) return;
    const [hx, hy, hz, carrying] = s;
    const a = Math.atan2(hz - d.pivot[2], hx - d.pivot[0]);
    if (jib.current) jib.current.rotation.y = -a;
    const tipY = top + 0.2;
    if (chain.current) {
      const L = Math.max(0.1, tipY - hy);
      chain.current.position.set(hx, hy + L / 2, hz);
      chain.current.scale.set(1, L, 1);
    }
    if (hook.current) hook.current.position.set(hx, hy, hz);
    magnet.emissiveIntensity = carrying > 0.5 ? 2.4 + Math.sin(clock.elapsedTime * 12) * 0.4 : (s[5] ?? 0) > 0 ? 1.0 : 0.3;
  });
  return (
    <group>
      <KitMeshes make={make} />
      <group ref={jib} position={[d.pivot[0], top, d.pivot[2]]}>
        <KitMeshes make={jibKit} />
      </group>
      <mesh ref={chain}>
        <cylinderGeometry args={[0.05, 0.05, 1, 6]} />
        <meshStandardMaterial color="#5a5268" metalness={0.7} roughness={0.45} />
      </mesh>
      <group ref={hook}>
        <mesh position={[0, 0.12, 0]} material={magnet} castShadow>
          <boxGeometry args={[1.1, 0.28, 1.1]} />
        </mesh>
        <mesh position={[0, 0.34, 0]}>
          <torusGeometry args={[0.18, 0.05, 6, 14]} />
          <meshStandardMaterial color={IRON} metalness={0.7} roughness={0.4} />
        </mesh>
      </group>
    </group>
  );
}

// ---------------------------------------------------------------- gameplay-owned static boxes

function LoadDock({ b }: { b: BoxDef }) {
  const make = useMemo(
    () => () => {
      const k = new Kit(4200);
      const [w, h, l] = b.s;
      // plank deck, timber skirt, stout posts, a little ladder on the front for couriers
      const n = Math.round(l / 0.45);
      for (let s = 0; s < n; s++) k.box('wood', WOOD.plank[s % 4], [w + 0.04, 0.12, l / n - 0.03], [0, h / 2 - 0.06, -l / 2 + (s + 0.5) * (l / n)], [0, 0, 0], 0.025, 0.07);
      k.box('wood', WOOD.dark, [w - 0.1, h - 0.14, l - 0.1], [0, -0.07, 0], [0, 0, 0], 0.04);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('wood', WOOD.beam, [0.32, h + 0.25, 0.32], [sx * (w / 2 - 0.1), 0.12, sz * (l / 2 - 0.1)], [0, 0, 0], 0.04);
      for (const sx of [-1, 1]) k.box('metal', IRON, [0.08, 0.1, l], [sx * (w / 2 + 0.02), h / 2 - 0.2, 0], [0, 0, 0], 0.01, 0);
      for (let r = 0; r < 3; r++) k.box('wood', WOOD.rail, [0.7, 0.07, 0.08], [-w / 2 + 0.7, -h / 2 + 0.25 + r * 0.3, l / 2 + 0.06], [0, 0, 0], 0.01);
      for (const sx of [-1, 1]) k.box('wood', WOOD.dark, [0.08, h, 0.08], [-w / 2 + 0.7 + sx * 0.34, 0, l / 2 + 0.06], [0, 0, 0], 0.01);
      // royal banner pole at the back corner
      k.cyl('wood', WOOD.dark, 0.06, 0.07, 2.4, [w / 2 - 0.3, h / 2 + 1.2, -l / 2 + 0.3], [0, 0, 0], 8);
      k.box('cloth', '#e45b6f', [0.05, 0.7, 0.9], [w / 2 - 0.3, h / 2 + 2.0, -l / 2 + 0.8], [0, 0, 0], 0.02, 0);
      return k;
    },
    [b],
  );
  return (
    <group position={b.p}>
      <KitMeshes make={make} />
    </group>
  );
}

function Crate({ b }: { b: BoxDef }) {
  const make = useMemo(
    () => () => {
      const k = new Kit(4300);
      const [w, h, l] = b.s;
      k.box('wood', WOOD.plank[2], [w, h, l], [0, 0, 0], [0, 0, 0], 0.05, 0.04);
      for (const sy of [-1, 1]) for (const sz of [-1, 1]) k.box('wood', WOOD.dark, [w + 0.04, 0.14, 0.14], [0, sy * (h / 2 - 0.07), sz * (l / 2 - 0.07)], [0, 0, 0], 0.02);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('wood', WOOD.dark, [0.14, h + 0.02, 0.14], [sx * (w / 2 - 0.07), 0, sz * (l / 2 - 0.07)], [0, 0, 0], 0.02);
      k.box('gold', GOLD, [0.5, 0.5, 0.04], [0, 0, l / 2 + 0.02], [0, 0, 0], 0.03, 0);
      return k;
    },
    [b],
  );
  return (
    <group position={b.p}>
      <KitMeshes make={make} />
    </group>
  );
}

function Hedge({ b }: { b: BoxDef }) {
  const make = useMemo(
    () => () => {
      const k = new Kit(Math.round(b.p[0] * 31 + 4400));
      const [w, h, l] = b.s;
      k.box('leaf', '#4f9f5f', [w, h * 0.85, l], [0, -h * 0.075, 0], [0, 0, 0], 0.18, 0.05);
      const n = Math.round(l / 0.6);
      for (let s = 0; s < n; s++) {
        const z = -l / 2 + (s + 0.5) * (l / n);
        k.sphere('leaf', s % 3 ? '#5fbf76' : '#7fd17e', 0.42, [0, h / 2 - 0.12, z], [w * 1.2, 0.75, 1.1], 1, 0.06);
        if (s % 4 === 1) k.sphere('cloth', '#ff8fb1', 0.09, [w / 2, h / 2 - 0.05, z], [1, 1, 1], 0, 0);
      }
      k.box('stone', STONE.dark, [w + 0.12, 0.16, l + 0.06], [0, -h / 2 + 0.08, 0], [0, 0, 0], 0.03);
      return k;
    },
    [b],
  );
  return (
    <group position={b.p}>
      <KitMeshes make={make} />
    </group>
  );
}

export function VisBoxes({ boxes }: { boxes: BoxDef[] }) {
  return (
    <group>
      {boxes.map((b, k) => {
        if (b.vis === 'loadDock') return <LoadDock key={k} b={b} />;
        if (b.vis === 'crate') return <Crate key={k} b={b} />;
        if (b.vis === 'hedge') return <Hedge key={k} b={b} />;
        return null;
      })}
    </group>
  );
}

// ---------------------------------------------------------------- assembly

function MechVisual({ def, i, live, map }: { def: MechDef; i: number; live: boolean; map: MapDef }) {
  if (def.legacy) return null; // drawn by the original Chapter components
  switch (def.kind) {
    case 'rotor':
      return def.style === 'clockhand' ? <ClockHand d={def} i={i} /> : <Turnstile d={def} i={i} />;
    case 'spring':
      if (def.style === 'mushroom' || def.style === 'bigmushroom') return <MushroomPad d={def} i={i} aimIndex={def.aim ? map.mechs.findIndex((m) => m.id === def.aim!.switch) : -1} />;
      return <Spring d={def} i={i} />;
    case 'puffer':
      return <Puffball d={def} i={i} />;
    case 'slip':
      return <Moss d={def} />;
    case 'wobble':
      return <Wobble d={def} i={i} />;
    case 'switch':
      return def.style === 'button' ? <FloorButton d={def} i={i} /> : <Switch d={def} i={i} />;
    case 'blocker':
      return <Blocker d={def} i={i} />;
    case 'collect':
      return live ? <Stamp d={def} i={i} /> : null;
    case 'gate':
      return <Portcullis d={def} i={i} />;
    case 'plate':
      return <Plate d={def} i={i} />;
    case 'wind':
      return (
        <>
          <GustFan d={def} i={i} />
          <GustStreaks d={def} i={i} />
        </>
      );
    case 'mover':
      return def.style === 'cap' ? <CapPlatform d={def} i={i} /> : <Mover d={def} i={i} />;
    case 'cart':
      return <Cart d={def} i={i} />;
    case 'crane':
      return <Crane d={def} i={i} />;
    default:
      return null;
  }
}

/** All mechanisms of the active map (for course maps: every course mechanism, frozen ones in their resting state). */
export function Mechanisms({ map }: { map: MapDef }) {
  const boxes = useMemo(() => [...(map.course ? LEVEL.boxes : []), ...map.boxes].filter((b) => b.vis), [map]);
  return (
    <group>
      {map.mechs.map((def, i) => (
        <MechVisual key={`${map.id}:${def.id}`} def={def} i={i} live={!def.map || def.map === map.id} map={map} />
      ))}
      <VisBoxes boxes={boxes} />
    </group>
  );
}
