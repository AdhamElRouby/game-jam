// Warm gradient sky dome with sun glow, plus soft drifting cloud puffs (cheap, no textures).
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { rng } from './materials';

export const SUN_DIR = new THREE.Vector3(-0.45, 0.62, 0.64).normalize();

export function SkyDome() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          top: { value: new THREE.Color('#4fb8ef') },
          mid: { value: new THREE.Color('#86d9f6') },
          horizon: { value: new THREE.Color('#e9f4f7') },
          warm: { value: new THREE.Color('#ffd9a8') },
          sunDir: { value: SUN_DIR },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            gl_Position = p.xyww;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 warm; uniform vec3 sunDir;
          varying vec3 vDir;
          void main() {
            float h = vDir.y;
            vec3 c = mix(horizon, mid, smoothstep(-0.05, 0.25, h));
            c = mix(c, top, smoothstep(0.25, 0.85, h));
            // warm glow toward the castle (far -Z) near the horizon
            float back = max(0.0, -vDir.z);
            c = mix(c, warm, pow(back, 6.0) * smoothstep(0.35, -0.05, h) * 0.55);
            // below the horizon fade to soft haze
            c = mix(c, vec3(0.83, 0.9, 0.97), smoothstep(0.0, -0.4, h));
            float s = max(0.0, dot(normalize(vDir), normalize(sunDir)));
            c += vec3(1.0, 0.92, 0.75) * (pow(s, 600.0) * 1.2 + pow(s, 12.0) * 0.18);
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    [],
  );
  return (
    <mesh material={mat} frustumCulled={false} renderOrder={-10}>
      <sphereGeometry args={[800, 32, 16]} />
    </mesh>
  );
}

interface Puff {
  x: number;
  y: number;
  z: number;
  s: number;
  parts: { x: number; y: number; z: number; r: number }[];
  speed: number;
}

export function Clouds() {
  const puffs = useMemo<Puff[]>(() => {
    const R = rng(42);
    const out: Puff[] = [];
    for (let i = 0; i < 46; i++) {
      const side = R() < 0.5 ? -1 : 1;
      const below = R() < 0.55;
      const x = side * (25 + R() * 120);
      const z = 40 - R() * 260;
      const y = below ? -18 - R() * 22 : 10 + R() * 40;
      const s = below ? 6 + R() * 10 : 3 + R() * 6;
      const parts = [];
      const n = 4 + Math.floor(R() * 4);
      for (let k = 0; k < n; k++) parts.push({ x: (R() - 0.5) * 2.4, y: (R() - 0.3) * 0.7, z: (R() - 0.5) * 1.2, r: 0.55 + R() * 0.6 });
      out.push({ x, y, z, s, parts, speed: 0.3 + R() * 0.6 });
    }
    // a soft cloud sea far below the course
    for (let i = 0; i < 26; i++) {
      const x = (R() - 0.5) * 70;
      const z = 30 - R() * 230;
      out.push({ x, y: -34 - R() * 8, z, s: 10 + R() * 8, parts: [{ x: 0, y: 0, z: 0, r: 1 }, { x: 1.1, y: -0.1, z: 0.3, r: 0.8 }, { x: -1, y: -0.15, z: -0.2, r: 0.85 }], speed: 0.2 });
    }
    return out;
  }, []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, emissive: '#dfeefa', emissiveIntensity: 0.35, flatShading: false }), []);
  const geo = useMemo(() => new THREE.IcosahedronGeometry(1, 2), []);
  const group = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    g.children.forEach((c, i) => {
      c.position.x += puffs[i].speed * dt * 0.6;
      if (c.position.x > 160) c.position.x = -160;
    });
  });
  return (
    <group ref={group}>
      {puffs.map((p, i) => (
        <group key={i} position={[p.x, p.y, p.z]} scale={p.s}>
          {p.parts.map((q, k) => (
            <mesh key={k} geometry={geo} material={mat} position={[q.x, q.y, q.z]} scale={q.r} />
          ))}
        </group>
      ))}
    </group>
  );
}
