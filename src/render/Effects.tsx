// Pooled GPU-point particle system for sparkles, confetti, poofs and dust. Imperative API via `fx`.
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

const MAX = 2400;

interface P {
  life: number;
  max: number;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  g: number;
  drag: number;
  size: number;
  r: number; g2: number; b: number;
  spin: number;
}

const pool: P[] = [];
let cursor = 0;
for (let i = 0; i < MAX; i++) pool.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, g: 0, drag: 0, size: 0, r: 1, g2: 1, b: 1, spin: 0 });

const tmpC = new THREE.Color();

function emit(o: Partial<P> & { x: number; y: number; z: number; color: string }) {
  const p = pool[cursor];
  cursor = (cursor + 1) % MAX;
  tmpC.set(o.color);
  p.life = o.max ?? 1;
  p.max = o.max ?? 1;
  p.x = o.x; p.y = o.y; p.z = o.z;
  p.vx = o.vx ?? 0; p.vy = o.vy ?? 0; p.vz = o.vz ?? 0;
  p.g = o.g ?? 0;
  p.drag = o.drag ?? 0;
  p.size = o.size ?? 0.3;
  p.r = tmpC.r; p.g2 = tmpC.g; p.b = tmpC.b;
  p.spin = o.spin ?? 0;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export const fx = {
  sparkle(x: number, y: number, z: number, n = 40, radius = 1.4, color = '#fff2a8') {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = rand(-0.6, 1.2);
      const s = rand(2, 7);
      emit({ x: x + Math.cos(a) * radius * 0.5, y: y + rand(-0.5, 0.8), z: z + Math.sin(a) * radius * 0.5, vx: Math.cos(a) * s * Math.cos(e), vy: Math.sin(e) * s + 1, vz: Math.sin(a) * s * Math.cos(e), g: -6, drag: 2.5, size: rand(0.18, 0.42), max: rand(0.5, 1.0), color: Math.random() < 0.3 ? '#ffffff' : color });
    }
  },
  confetti(x: number, y: number, z: number, n = 120, spread = 3) {
    const cols = ['#FF697F', '#64B9F4', '#80D78E', '#FFD153', '#F49BB5', '#9B8DE4'];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(3, 9);
      emit({ x: x + rand(-spread, spread) * 0.3, y, z: z + rand(-spread, spread) * 0.3, vx: Math.cos(a) * s * 0.6, vy: rand(6, 13), vz: Math.sin(a) * s * 0.6, g: -9, drag: 1.4, size: rand(0.22, 0.38), max: rand(1.8, 3.2), color: cols[i % cols.length], spin: 1 });
    }
  },
  poof(x: number, y: number, z: number, n = 26, color = '#ffffff') {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(1, 3.5);
      emit({ x, y: y + rand(-0.2, 0.6), z, vx: Math.cos(a) * s, vy: rand(0.5, 2.5), vz: Math.sin(a) * s, g: 0.6, drag: 2.2, size: rand(0.7, 1.3), max: rand(0.5, 0.9), color });
    }
  },
  dust(x: number, y: number, z: number, n = 8) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(0.6, 1.8);
      emit({ x, y: y + 0.1, z, vx: Math.cos(a) * s, vy: rand(0.3, 1.2), vz: Math.sin(a) * s, g: 0.2, drag: 3, size: rand(0.35, 0.7), max: rand(0.35, 0.6), color: '#f4ead8' });
    }
  },
  /** Expanding ring of motes along the ground (activations, checkpoints, delivery). */
  ring(x: number, y: number, z: number, radius = 3, color = '#ffe9a0') {
    const n = 64;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const s = radius * 2.4;
      emit({ x: x + Math.cos(a) * 0.4, y, z: z + Math.sin(a) * 0.4, vx: Math.cos(a) * s, vy: 0.3 + Math.random() * 0.4, vz: Math.sin(a) * s, g: 0, drag: 2.8, size: rand(0.26, 0.4), max: rand(0.55, 0.75), color: Math.random() < 0.25 ? '#ffffff' : color });
    }
  },
  wind(x: number, y: number, z: number, dx: number, dz: number) {
    emit({ x, y, z, vx: dx * rand(10, 16), vy: rand(-0.3, 0.3), vz: dz * rand(10, 16), g: 0, drag: 0.2, size: rand(0.12, 0.22), max: rand(0.6, 1.0), color: '#ffffff' });
  },
};

const vert = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vAlpha = aAlpha;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (420.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const frag = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.2, d) * vAlpha;
  gl_FragColor = vec4(vColor * (1.0 + 0.4 * smoothstep(0.25, 0.0, d)), a);
}`;

export function Effects() {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(MAX), 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(MAX), 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    return g;
  }, []);
  const mat = useMemo(
    () => new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false }),
    [],
  );
  const ref = useRef<THREE.Points>(null);
  useFrame((_, dtRaw) => {
    const dt = Math.min(0.05, dtRaw);
    const pos = geo.attributes.position.array as Float32Array;
    const size = geo.attributes.aSize.array as Float32Array;
    const alpha = geo.attributes.aAlpha.array as Float32Array;
    const col = geo.attributes.aColor.array as Float32Array;
    for (let i = 0; i < MAX; i++) {
      const p = pool[i];
      if (p.life <= 0) {
        alpha[i] = 0;
        continue;
      }
      p.life -= dt;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vy = p.vy * k + p.g * dt;
      p.vz *= k;
      if (p.spin) {
        p.vx += Math.sin(p.life * 9 + i) * 0.08;
        p.vz += Math.cos(p.life * 7 + i) * 0.08;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const t = p.life / p.max;
      pos[i * 3] = p.x;
      pos[i * 3 + 1] = p.y;
      pos[i * 3 + 2] = p.z;
      size[i] = p.size * (p.spin ? 1 : 0.6 + 0.4 * t);
      alpha[i] = Math.min(1, t * 3) * (p.spin ? 1 : t);
      col[i * 3] = p.r;
      col[i * 3 + 1] = p.g2;
      col[i * 3 + 2] = p.b;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
    geo.attributes.aAlpha.needsUpdate = true;
    geo.attributes.aColor.needsUpdate = true;
  });
  return <points ref={ref} geometry={geo} material={mat} frustumCulled={false} renderOrder={10} />;
}
