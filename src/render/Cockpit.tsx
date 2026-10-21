// First-person cockpit: what the pilot sees from inside the artifact (drawn only on the pilot's own screen, while the
// camera is inside the shell). Thin golden frame bars along the shell's inner edges and faint rune glass that only tints
// toward the edges of the view, so the way ahead stays clear. It turns with the artifact: ROUND's gyroscope cage rolls
// around you while your view stays level, LONG's bars run ahead of you like a tunnel, TALL's corner posts sway.
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SHAPES } from '../shared/shapes';
import { frame } from './frame';
import { camView } from './CameraRig';

const BAR = 0.022; // frame bar thickness
const INSET = 0.07; // bars sit just inside the shell

/** Small rune tile (ring + star), white on black: used as a glow mask on the glass. */
function runeTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, S, S);
  g.strokeStyle = '#fff';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(S / 2, S / 2, 52, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
    const x = S / 2 + Math.cos(a) * 40, y = S / 2 + Math.sin(a) * 40;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
  g.stroke();
  g.lineWidth = 2;
  g.strokeRect(10, 10, S - 20, S - 20);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function glassMaterial(rune: THREE.Texture, rim: number) {
  return new THREE.ShaderMaterial({
    uniforms: { rune: { value: rune }, tint: { value: new THREE.Color('#ffcf6a') }, k: { value: 1 }, rim: { value: rim } },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vP;
      varying vec3 vV;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vP = wp.xyz;
        vec4 vp = viewMatrix * wp;
        vV = vp.xyz;
        gl_Position = projectionMatrix * vp;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D rune;
      uniform vec3 tint;
      uniform float k;
      uniform float rim;
      varying vec3 vN;
      varying vec3 vP;
      varying vec3 vV;
      varying vec2 vUv;
      void main() {
        vec3 V = normalize(cameraPosition - vP);
        float facing = clamp(abs(dot(V, normalize(vN))), 0.0, 1.0);
        // clear straight ahead, golden toward grazing angles (the edges of the view)
        float edge = pow(clamp(1.0 - facing, 0.0, 1.0), 2.4);
        float ahead = smoothstep(0.86, 0.98, -normalize(vV).z);
        float r = texture2D(rune, vUv).r * (1.0 - 0.85 * ahead);
        float a = 0.025 + edge * rim + r * 0.13;
        gl_FragColor = vec4(tint * (0.75 + r * 0.6), clamp(a, 0.0, 0.8) * k);
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
  });
}

/** Box UVs repeated so each rune tile stays square on long faces. */
function squareTiles(g: THREE.BoxGeometry, w: number, h: number, d: number) {
  const uv = g.attributes.uv as THREE.BufferAttribute;
  // face order: +x, -x, +y, -y, +z, -z (4 vertices each); size of each face in (u, v)
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const [fu, fv] = dims[f];
    const ru = Math.max(1, Math.round(fu / fv));
    const rv = Math.max(1, Math.round(fv / fu));
    for (let i = 0; i < 4; i++) uv.setXY(f * 4 + i, uv.getX(f * 4 + i) * ru, uv.getY(f * 4 + i) * rv);
  }
  uv.needsUpdate = true;
  return g;
}

/** The 12 edge bars + 8 corner knobs of a box, merged into one geometry. */
function frameGeometry(hx: number, hy: number, hz: number) {
  const parts: THREE.BufferGeometry[] = [];
  const h = [hx, hy, hz];
  for (let axis = 0; axis < 3; axis++) {
    const a1 = (axis + 1) % 3, a2 = (axis + 2) % 3;
    for (const s1 of [-1, 1]) {
      for (const s2 of [-1, 1]) {
        const size = [BAR, BAR, BAR];
        size[axis] = h[axis] * 2;
        const g = new THREE.BoxGeometry(size[0], size[1], size[2]);
        const p = [0, 0, 0];
        p[a1] = s1 * h[a1];
        p[a2] = s2 * h[a2];
        g.translate(p[0], p[1], p[2]);
        parts.push(g);
      }
    }
  }
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) parts.push(new THREE.SphereGeometry(0.045, 10, 6).translate(x * hx, y * hy, z * hz));
  const merged = mergeGeometries(parts.map((g) => g.toNonIndexed()));
  parts.forEach((g) => g.dispose());
  return merged;
}

/** Gyroscope cage for ROUND: three great circles plus two latitude rings. */
function ballGeometry(r: number) {
  const parts: THREE.BufferGeometry[] = [];
  const ring = (radius: number, y: number, rx: number, ry: number) => parts.push(new THREE.TorusGeometry(radius, 0.013, 6, 72).rotateX(rx).rotateY(ry).translate(0, y, 0));
  ring(r, 0, Math.PI / 2, 0);
  ring(r, 0, 0, 0);
  ring(r, 0, 0, Math.PI / 2);
  for (const s of [-1, 1]) ring(r * Math.cos(0.75), s * r * Math.sin(0.75), Math.PI / 2, 0);
  const merged = mergeGeometries(parts.map((g) => g.toNonIndexed()));
  parts.forEach((g) => g.dispose());
  return merged;
}

const easeOutBack = (t: number) => 1 + 3.2 * Math.pow(t - 1, 3) + 2.2 * Math.pow(t - 1, 2);

export function Cockpit() {
  const root = useRef<THREE.Group>(null);
  const forms = [useRef<THREE.Group>(null), useRef<THREE.Group>(null), useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const st = useRef({ shape: -1, t: 1 });
  const res = useMemo(() => {
    const rune = runeTexture();
    // matte enough to stay under the bloom threshold: a frame you read, not a glare
    const bar = new THREE.MeshStandardMaterial({ color: '#c88a33', metalness: 0.45, roughness: 0.55, emissive: '#5a3208', emissiveIntensity: 0.25, envMapIntensity: 0.45, transparent: true });
    // bars fade out near the middle of the view, so the way ahead is never blocked by a frame edge
    bar.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        '#include <opaque_fragment>\n  gl_FragColor.a *= 1.0 - 0.92 * smoothstep(0.88, 0.985, normalize(vViewPosition).z);',
      );
    };
    const forms = SHAPES.map((s) => {
      if (s.ball) {
        const r = s.half[0] - INSET;
        const glass = new THREE.SphereGeometry(s.half[0] - 0.04, 40, 24);
        return { frame: ballGeometry(r), glass, glassMat: glassMaterial(rune, 0.0) };
      }
      const [hx, hy, hz] = s.half.map((h) => h - INSET);
      const gw = (s.half[0] - 0.04) * 2, gh = (s.half[1] - 0.04) * 2, gd = (s.half[2] - 0.04) * 2;
      return { frame: frameGeometry(hx, hy, hz), glass: squareTiles(new THREE.BoxGeometry(gw, gh, gd), gw, gh, gd), glassMat: glassMaterial(rune, 0.45) };
    });
    return { rune, bar, forms };
  }, []);

  useFrame((_, dtRaw) => {
    const g = root.current;
    if (!g) return;
    g.visible = camView.fpv;
    if (!g.visible) return;
    const dt = Math.min(0.05, dtRaw);
    const a = frame.current.artifact;
    g.position.set(a.x, a.y, a.z);
    g.quaternion.set(a.qx, a.qy, a.qz, a.qw);
    const S = st.current;
    if (a.shape !== S.shape) {
      S.t = S.shape < 0 ? 1 : 0;
      S.shape = a.shape;
    }
    S.t = Math.min(1, S.t + dt / 0.35);
    const k = S.t >= 1 ? 1 : 0.4 + 0.6 * easeOutBack(S.t);
    forms.forEach((f, i) => {
      if (!f.current) return;
      f.current.visible = i === S.shape;
      if (i === S.shape) f.current.scale.setScalar(k);
    });
  });

  return (
    <group ref={root} visible={false}>
      {res.forms.map((f, i) => (
        <group key={i} ref={forms[i]} visible={false}>
          <mesh geometry={f.frame} material={res.bar} renderOrder={3} />
          <mesh geometry={f.glass} material={f.glassMat} renderOrder={4} />
        </group>
      ))}
    </group>
  );
}
