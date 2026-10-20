// Painted sky dome, image-based lighting built from the same sky, soft cartoon clouds and a cloud sea below the course.
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { rng } from './materials';

export const SUN_DIR = new THREE.Vector3(-0.5, 0.66, 0.56).normalize();

/** Shared sky palette (also used for fog so distant islands melt into the haze). */
export const SKY = {
  top: new THREE.Color('#3f9ee6'),
  mid: new THREE.Color('#8fd2f4'),
  horizon: new THREE.Color('#fbe9d2'),
  warm: new THREE.Color('#ffc99a'),
  haze: new THREE.Color('#c9d9f2'),
  deep: new THREE.Color('#8e9fdc'),
  fog: '#cfe0f4',
};

const skyFrag = /* glsl */ `
  uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 warm; uniform vec3 haze; uniform vec3 deep;
  uniform vec3 sunDir; uniform float sunBoost; uniform float ground;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 c = mix(horizon, mid, smoothstep(-0.02, 0.22, h));
    c = mix(c, top, smoothstep(0.22, 0.9, h));
    // warm glow toward the castle (far -Z) hugging the horizon
    float back = max(0.0, -d.z);
    c = mix(c, warm, pow(back, 4.0) * smoothstep(0.32, -0.04, h) * 0.6);
    // below the horizon: luminous haze that deepens into lavender-blue
    vec3 below = mix(haze, deep, smoothstep(-0.05, -0.75, h));
    below = mix(below, warm * 0.9 + haze * 0.1, pow(back, 5.0) * smoothstep(-0.35, 0.0, h) * 0.35);
    c = mix(c, below, smoothstep(0.015, -0.12, h));
    // ground bounce (environment lighting only)
    c = mix(c, vec3(0.62, 0.56, 0.4), ground * smoothstep(-0.02, -0.3, h));
    float s = max(0.0, dot(d, normalize(sunDir)));
    c += vec3(1.0, 0.9, 0.72) * (pow(s, 900.0) * 2.5 * sunBoost + pow(s, 14.0) * 0.16 + pow(s, 3.0) * 0.05);
    gl_FragColor = vec4(c, 1.0);
  }`;

function skyMaterial(ground = 0, sunBoost = 1) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: SKY.top },
      mid: { value: SKY.mid },
      horizon: { value: SKY.horizon },
      warm: { value: SKY.warm },
      haze: { value: SKY.haze },
      deep: { value: SKY.deep },
      sunDir: { value: SUN_DIR },
      sunBoost: { value: sunBoost },
      ground: { value: ground },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: skyFrag,
  });
}

export function SkyDome() {
  const mat = useMemo(() => skyMaterial(0, 1), []);
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ camera }) => {
    if (ref.current) ref.current.position.copy(camera.position);
  });
  return (
    <mesh ref={ref} material={mat} frustumCulled={false} renderOrder={-10}>
      <sphereGeometry args={[800, 48, 24]} />
    </mesh>
  );
}

/** Image-based lighting from the painted sky (gold, metal and glossy paint pick up sky + warm sun). */
export function SkyEnvironment({ intensity = 0.85 }: { intensity?: number }) {
  const { gl, scene } = useThree();
  useEffect(() => {
    const envScene = new THREE.Scene();
    const mat = skyMaterial(0.65, 6);
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), mat));
    // a few soft warm "cards" so glossy surfaces get readable highlights
    const card = (color: string, pos: [number, number, number], s: [number, number], strength: number) => {
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(strength), side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(s[0], s[1]), m);
      mesh.position.set(...pos);
      mesh.lookAt(0, 0, 0);
      envScene.add(mesh);
    };
    card('#fff1d6', [-4, 6, 5], [5, 3], 2.2);
    card('#ffd6ec', [5, 3, -6], [6, 2], 1.2);
    card('#d8f1ff', [6, 5, 4], [3, 3], 1.1);
    const pmrem = new THREE.PMREMGenerator(gl);
    const rt = pmrem.fromScene(envScene, 0.035);
    pmrem.dispose();
    scene.environment = rt.texture;
    scene.environmentIntensity = intensity;
    return () => {
      scene.environment = null;
      rt.dispose();
      mat.dispose();
    };
  }, [gl, scene, intensity]);
  return null;
}

// ------------------------------------------------------------------ clouds

const cloudVert = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  varying vec3 vN;
  varying vec3 vW;
  void main() {
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vW = wp.xyz;
    vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const cloudFrag = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform vec3 litColor; uniform vec3 shadeColor; uniform vec3 rimColor; uniform vec3 sunDir;
  varying vec3 vN;
  varying vec3 vW;
  void main() {
    vec3 n = normalize(vN);
    float up = n.y * 0.5 + 0.5;
    float sun = max(0.0, dot(n, sunDir));
    vec3 c = mix(shadeColor, litColor, smoothstep(0.15, 0.85, up * 0.7 + sun * 0.5));
    vec3 v = normalize(cameraPosition - vW);
    float rim = pow(clamp(1.0 - dot(n, v), 0.0, 1.0), 2.5);
    c += rimColor * rim * 0.35;
    gl_FragColor = vec4(c, 1.0);
    #include <fog_fragment>
  }`;

function cloudMaterial(lit: string, shade: string) {
  return new THREE.ShaderMaterial({
    fog: true,
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      litColor: { value: new THREE.Color(lit) },
      shadeColor: { value: new THREE.Color(shade) },
      rimColor: { value: new THREE.Color('#fff6ea') },
      sunDir: { value: SUN_DIR },
    },
    vertexShader: cloudVert,
    fragmentShader: cloudFrag,
  });
}

interface Puff {
  x: number;
  y: number;
  z: number;
  s: number;
  sx: number;
}

function buildClouds(): { puffs: Puff[]; cluster: number[] } {
  const R = rng(42);
  const puffs: Puff[] = [];
  const cluster: number[] = [];
  let id = 0;
  const addCluster = (x: number, y: number, z: number, s: number, flat: number) => {
    const n = 5 + Math.floor(R() * 5);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + R();
      const rr = k === 0 ? 0 : 0.6 + R() * 0.9;
      const ps = (k === 0 ? 1.15 : 0.55 + R() * 0.55) * s;
      puffs.push({ x: x + Math.cos(a) * rr * s * 1.3, y: y + (R() - 0.25) * 0.5 * s + (k === 0 ? 0.25 * s : 0), z: z + Math.sin(a) * rr * s * 0.7, s: ps, sx: flat });
      cluster.push(id);
    }
    id++;
  };
  // high clouds drifting beside and above the course
  for (let i = 0; i < 30; i++) {
    const side = R() < 0.5 ? -1 : 1;
    addCluster(side * (34 + R() * 110), 14 + R() * 34, 30 - R() * 270, 2.6 + R() * 4, 1);
  }
  // mid clouds weaving between the scenic islands, slightly below the course
  for (let i = 0; i < 26; i++) {
    const side = R() < 0.5 ? -1 : 1;
    addCluster(side * (22 + R() * 70), -10 - R() * 16, 30 - R() * 260, 3 + R() * 4.5, 1.2);
  }
  return { puffs, cluster };
}

export function Clouds() {
  const { puffs, cluster } = useMemo(buildClouds, []);
  const geo = useMemo(() => new THREE.IcosahedronGeometry(1, 2), []);
  const mat = useMemo(() => cloudMaterial('#ffffff', '#b9c6ee'), []);
  const ref = useRef<THREE.InstancedMesh>(null);
  const drift = useMemo(() => {
    const R = rng(7);
    const n = Math.max(...cluster) + 1;
    return Array.from({ length: n }, () => 0.25 + R() * 0.5);
  }, [cluster]);
  const offs = useRef<number[]>(drift.map(() => 0));
  const m4 = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const v = useMemo(() => new THREE.Vector3(), []);
  const sc = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dtRaw) => {
    const dt = Math.min(0.05, dtRaw);
    const mesh = ref.current;
    if (!mesh) return;
    for (let c = 0; c < drift.length; c++) offs.current[c] += drift[c] * dt * 0.8;
    puffs.forEach((p, i) => {
      let x = p.x + offs.current[cluster[i]];
      if (x > 170) x -= 340;
      v.set(x, p.y, p.z);
      sc.set(p.s * 1.25 * p.sx, p.s * 0.82, p.s);
      m4.compose(v, q, sc);
      mesh.setMatrixAt(i, m4);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geo, mat, puffs.length]} frustumCulled={false} />;
}

/** A soft sea of clouds far below the islands: gives the void depth instead of a flat color. */
export function CloudSea() {
  const items = useMemo(() => {
    const R = rng(1977);
    const out: Puff[] = [];
    for (let i = 0; i < 150; i++) {
      out.push({ x: (R() - 0.5) * 260, y: -46 - R() * 10, z: 60 - R() * 340, s: 9 + R() * 12, sx: 1.6 });
    }
    return out;
  }, []);
  const geo = useMemo(() => new THREE.IcosahedronGeometry(1, 2), []);
  const mat = useMemo(() => cloudMaterial('#f4f2ff', '#9eabe4'), []);
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    items.forEach((p, i) => {
      m4.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.s * p.sx, p.s * 0.45, p.s));
      mesh.setMatrixAt(i, m4);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items]);
  return <instancedMesh ref={ref} args={[geo, mat, items.length]} frustumCulled={false} />;
}
