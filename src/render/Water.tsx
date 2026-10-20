// Stylized waterfalls: a curved ribbon that spills over an island lip with scrolling foam bands,
// a foamy crest and a soft mist plume where it dissolves into the sky. Purely decorative.
import { useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

const fallVert = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

const fallFrag = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform float t;
  uniform float len;
  varying vec2 vUv;
  float h1(float n) { return fract(sin(n * 91.3) * 43758.5453); }
  float n1(float x) { float i = floor(x); float f = fract(x); return mix(h1(i), h1(i + 1.0), f * f * (3.0 - 2.0 * f)); }
  void main() {
    float x = vUv.x;
    float y = vUv.y * len; // metres from the lip
    // falling streaks: columns of noise scrolling downward at different speeds
    float col = floor(x * 14.0);
    float sp = 2.4 + h1(col) * 1.6;
    float streak = n1((y - t * sp) * 0.9 + col * 7.0);
    float fine = n1((y - t * sp * 1.3) * 2.7 + x * 40.0);
    float foam = smoothstep(0.62, 0.9, streak * 0.7 + fine * 0.4);
    // edges and the crest are foamy, the body is a clear blue sheet
    float edge = 1.0 - smoothstep(0.0, 0.16, min(x, 1.0 - x));
    float crest = 1.0 - smoothstep(0.0, 1.2, y);
    vec3 deep = vec3(0.36, 0.72, 0.95);
    vec3 light = vec3(0.72, 0.93, 1.0);
    vec3 c = mix(deep, light, 0.35 + 0.4 * streak);
    c = mix(c, vec3(1.0), clamp(foam + edge * 0.6 + crest * 0.7, 0.0, 1.0));
    float a = 0.78 + foam * 0.2;
    a *= smoothstep(0.0, 0.05, x) * smoothstep(1.0, 0.95, x);
    a *= 1.0 - smoothstep(len * 0.62, len, y); // dissolve into mist
    gl_FragColor = vec4(c, a);
    #include <fog_fragment>
  }`;

function fallGeometry(w: number, h: number, curve: number) {
  // ribbon: short horizontal run over the lip, then a bowed drop that widens slightly
  const segY = 28, segX = 6;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= segY; j++) {
    const v = j / segY;
    const y = -v * h;
    const out = (1 - Math.pow(1 - Math.min(1, v * 3.5), 2)) * curve + v * curve * 0.4;
    const lip = v < 0.02 ? -0.5 + v * 25 : 0;
    const ww = w * (1 + v * 0.35);
    for (let i = 0; i <= segX; i++) {
      const u = i / segX;
      pos.push((u - 0.5) * ww, y + (v < 0.02 ? 0.05 : 0), out + lip);
      uv.push(u, v);
    }
  }
  for (let j = 0; j < segY; j++)
    for (let i = 0; i < segX; i++) {
      const a = j * (segX + 1) + i, b = a + 1, c = a + segX + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

let mistTex: THREE.Texture | null = null;
function mistTexture() {
  if (mistTex) return mistTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  mistTex = new THREE.CanvasTexture(c);
  mistTex.colorSpace = THREE.SRGBColorSpace;
  return mistTex;
}

/** Waterfall spilling from (x, y, z) (top lip) facing rotY (the direction the water flows out). */
export function Waterfall({ x, y, z, w, h, rotY, curve = 1.2 }: { x: number; y: number; z: number; w: number; h: number; rotY: number; curve?: number }) {
  const geo = useMemo(() => fallGeometry(w, h, curve), [w, h, curve]);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: true,
        uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), t: { value: Math.random() * 10 }, len: { value: h } },
        vertexShader: fallVert,
        fragmentShader: fallFrag,
      }),
    [h],
  );
  const mist = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => ({
        y: -h * (0.5 + (i % 4) * 0.1),
        x: (Math.random() - 0.5) * w * 1.4,
        z: curve * 1.5 + (Math.random() - 0.3) * 1.5,
        s: w * (1.2 + Math.random() * 1.2),
        ph: Math.random() * 6,
      })),
    [h, w, curve],
  );
  const mistMat = useMemo(() => new THREE.SpriteMaterial({ map: mistTexture(), color: '#f4fbff', transparent: true, opacity: 0.5, depthWrite: false, fog: true }), []);
  const crest = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6, emissive: '#dff6ff', emissiveIntensity: 0.25 }), []);
  useFrame((_, dt) => {
    mat.uniforms.t.value += Math.min(0.05, dt);
  });
  return (
    <group position={[x, y, z]} rotation={[0, rotY, 0]}>
      <mesh geometry={geo} material={mat} renderOrder={2} />
      {[-0.3, 0, 0.3].map((u, i) => (
        <mesh key={i} position={[u * w, 0.05, curve * 0.15 - 0.15]} material={crest} scale={[w * 0.28, 0.16, 0.3]}>
          <icosahedronGeometry args={[1, 1]} />
        </mesh>
      ))}
      {mist.map((m, i) => (
        <sprite key={i} material={mistMat} position={[m.x, m.y, m.z]} scale={[m.s, m.s * 0.7, 1]} />
      ))}
    </group>
  );
}
