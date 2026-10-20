// Stylized ground: soft painterly grass (low-frequency colour patches, no blade noise) with cobbled
// route paths painted from a world-space mask, plus a faceted sandstone/lavender rock material for cliffs.
import * as THREE from 'three';

// ---------------------------------------------------------------- route path mask (world XZ)

export const MASK = { x0: -17, z0: 15, w: 34, h: 192, ppm: 8 };

type Seg = { pts: [number, number][]; w: number };

/** Walkable route through every chapter: wide cobbled lanes that double as navigation hints. */
const PATHS: Seg[] = [
  // Ch1 dock: spawn lane, plate, gate, bridge head; side paths to the cottages and the crate yard
  { pts: [[0, 9.6], [0, 4], [0, -3.5], [0, -12.4]], w: 4.6 },
  { pts: [[0, 4.5], [-3.5, 4.9], [-6.2, 5.2]], w: 1.7 },
  { pts: [[0, -1.6], [-4, -1.9], [-6.8, -2.1]], w: 1.5 },
  { pts: [[0, 5.8], [3.8, 5.6], [6.2, 5.2]], w: 1.6 },
  // Ch1 arch island
  { pts: [[0, -18.6], [0, -26.5], [0, -38.4]], w: 4.2 },
  // Ch2 cliffs: lane splits to the receiver and to the courier catwalk
  { pts: [[0, -44.6], [0, -50], [-2.0, -55], [-2.5, -59.8]], w: 4.0 },
  { pts: [[0, -50], [4.4, -55.5], [6.3, -61.8]], w: 2.4 },
  { pts: [[-2.5, -65.3], [-1.6, -70], [0, -76], [0, -81.4]], w: 4.0 },
  { pts: [[6.3, -65.5], [4.6, -69.5], [1.5, -73.5]], w: 2.2 },
  // Ch3 tower base: lane to the lever wall and to the lift
  { pts: [[0, -86.6], [0, -93], [-3.2, -98], [-4.5, -103.6]], w: 3.6 },
  { pts: [[0, -93], [3.6, -97.4], [4.6, -100.9]], w: 3.4 },
  // Ch3 tower top to both descent routes
  { pts: [[4.6, -104], [4.4, -108], [0, -111.5], [-6, -115.8]], w: 3.4 },
  { pts: [[4.4, -108], [5, -115.8]], w: 3.2 },
  // Ch4 landing + plaza approach
  { pts: [[-6, -130], [-6, -137]], w: 5.2 },
  { pts: [[-6, -151.8], [-3.5, -156.5], [0, -161]], w: 4 },
  { pts: [[5, -151.8], [3, -156.5], [0, -161]], w: 3.6 },
  { pts: [[0, -161], [0, -170.2]], w: 4.6 },
];

// plaza squares (x0, z0, x1, z1) fully cobbled
const SQUARES: [number, number, number, number][] = [[-9.6, -153.4, 9.6, -169.6]];

let maskTex: THREE.CanvasTexture | null = null;

/** R = cobbled path core, G = worn-dirt border (wider, softer). */
export function pathMask() {
  if (maskTex) return maskTex;
  const { x0, z0, w, h, ppm } = MASK;
  const c = document.createElement('canvas');
  c.width = w * ppm;
  c.height = h * ppm;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, c.width, c.height);
  const px = (x: number) => (x - x0) * ppm;
  const pz = (z: number) => (z0 - z) * ppm;
  const stroke = (color: string, widen: number, blur: number) => {
    g.save();
    g.filter = `blur(${blur}px)`;
    g.strokeStyle = color;
    g.fillStyle = color;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.globalCompositeOperation = 'lighter';
    for (const s of PATHS) {
      g.lineWidth = (s.w + widen) * ppm;
      g.beginPath();
      s.pts.forEach(([x, z], i) => (i ? g.lineTo(px(x), pz(z)) : g.moveTo(px(x), pz(z))));
      g.stroke();
    }
    for (const [ax, az, bx, bz] of SQUARES) {
      const r = 2.2 * ppm;
      const X = px(ax) - (widen / 2) * ppm, Z = pz(az) - (widen / 2) * ppm;
      const W = (bx - ax + widen) * ppm, H = (az - bz + widen) * ppm;
      g.beginPath();
      g.roundRect(X, Z, W, H, r);
      g.fill();
    }
    g.restore();
  };
  stroke('#00ff00', 1.6, 6); // dirt / worn border
  stroke('#ff0000', 0, 2.5); // cobbles
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.flipY = false;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  return (maskTex = t);
}

// ---------------------------------------------------------------- shared GLSL

const NOISE = /* glsl */ `
  float th_hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  vec2 th_hash2(vec2 p) { float n = th_hash(p); return vec2(n, th_hash(p + n + 17.17)); }
  float th_noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(th_hash(i), th_hash(i + vec2(1.0, 0.0)), u.x), mix(th_hash(i + vec2(0.0, 1.0)), th_hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float th_fbm(vec2 p) { return th_noise(p) * 0.6 + th_noise(p * 2.03 + 7.1) * 0.28 + th_noise(p * 4.1 + 3.3) * 0.12; }
  // cobbles: x = distance to cell border, y = per-stone random, z = distance to centre
  vec3 th_cobble(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    float d1 = 9.0, d2 = 9.0; vec2 id = vec2(0.0); float dc = 9.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 r = o + 0.5 + 0.38 * (th_hash2(i + o) - 0.5) - f;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; id = i + o; } else if (d < d2) { d2 = d; }
    }
    return vec3(sqrt(d2) - sqrt(d1), th_hash(id), sqrt(d1));
  }
`;

// ---------------------------------------------------------------- terrain (grass + paths)

export interface TerrainOpts {
  /** 1 = whole surface is cobbled (ramps) */
  paved?: number;
  /** grass tint multiplier (scenic islands slightly cooler) */
  tint?: string;
  usePaths?: boolean;
}

export function terrainMaterial(opts: TerrainOpts = {}) {
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.94, metalness: 0, vertexColors: true });
  const uniforms = {
    uMask: { value: pathMask() },
    uMaskRect: { value: new THREE.Vector4(MASK.x0, MASK.z0, MASK.w, MASK.h) },
    uPaved: { value: opts.paved ?? 0 },
    uUsePaths: { value: opts.usePaths === false ? 0 : 1 },
    uTint: { value: new THREE.Color(opts.tint ?? '#ffffff') },
    uGDark: { value: new THREE.Color('#4f9e4c') },
    uGMid: { value: new THREE.Color('#7cc55a') },
    uGLight: { value: new THREE.Color('#b5dc6c') },
    uDirt: { value: new THREE.Color('#d9b680') },
    uStoneA: { value: new THREE.Color('#ecd9bb') },
    uStoneB: { value: new THREE.Color('#d8c3a4') },
    uStoneC: { value: new THREE.Color('#cdbcae') },
    uMortar: { value: new THREE.Color('#a68a6c') },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvTW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vTW;
        uniform sampler2D uMask; uniform vec4 uMaskRect; uniform float uPaved; uniform float uUsePaths; uniform vec3 uTint;
        uniform vec3 uGDark; uniform vec3 uGMid; uniform vec3 uGLight; uniform vec3 uDirt; uniform vec3 uStoneA; uniform vec3 uStoneB; uniform vec3 uStoneC; uniform vec3 uMortar;
        float tPath; float tCobbleH; float tGrassRough;
        ${NOISE}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec2 wp = vTW.xz;
          // --- grass: three soft tones in broad patches, faint mottling, sunlit tips toward patch centres
          float big = th_fbm(wp * 0.055 + 3.7);
          float mid = th_fbm(wp * 0.21 + 11.0);
          float fine = th_noise(wp * 1.6);
          vec3 grass = mix(uGDark, uGMid, smoothstep(0.3, 0.6, big));
          grass = mix(grass, uGLight, smoothstep(0.52, 0.8, mid * 0.6 + big * 0.5) * 0.8);
          // small darker clumps scattered in the lawn
          float clump = smoothstep(0.62, 0.8, th_noise(wp * 0.9 + 21.0)) * smoothstep(0.35, 0.6, th_noise(wp * 0.37));
          grass = mix(grass, uGDark * 0.9, clump * 0.45);
          grass *= 0.94 + fine * 0.1;
          grass *= uTint;
          // --- path mask
          vec2 muv = vec2((wp.x - uMaskRect.x) / uMaskRect.z, (uMaskRect.y - wp.y) / uMaskRect.w);
          vec4 m = texture2D(uMask, muv) * uUsePaths;
          float edgeN = th_fbm(wp * 0.9) - 0.5;
          float wear = smoothstep(0.15, 0.75, m.g + edgeN * 0.5);
          float core = max(uPaved, smoothstep(0.42, 0.62, m.r + edgeN * 0.35));
          vec3 dirt = uDirt * (0.9 + fine * 0.15);
          vec3 col = mix(grass, mix(grass, dirt, 0.55), wear * (1.0 - core));
          // --- cobbles
          vec3 cb = th_cobble(wp * 2.05);
          float stone = smoothstep(0.03, 0.1, cb.x);
          vec3 sc = mix(mix(uStoneA, uStoneB, step(0.5, cb.y)), uStoneC, step(0.78, cb.y));
          sc *= 0.95 + 0.08 * th_noise(wp * 6.0 + cb.y * 9.0);
          vec3 cob = mix(uMortar, sc, stone);
          col = mix(col, cob, core);
          tPath = core;
          tCobbleH = core * (stone * (0.6 + 0.4 * smoothstep(0.75, 0.05, cb.z)));
          tGrassRough = 1.0 - core;
          diffuseColor.rgb *= col;
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.93, 0.97, tGrassRough);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          // bevelled cobbles: bump from the stone height field (view-space surface gradient)
          vec3 sp = -vViewPosition;
          vec3 dx = dFdx(sp), dy = dFdy(sp);
          float hx = dFdx(tCobbleH), hy = dFdy(tCobbleH);
          vec3 r1 = cross(dy, normal), r2 = cross(normal, dx);
          float det = dot(dx, r1);
          vec3 grad = sign(det) * (hx * r1 + hy * r2);
          vec3 nn = abs(det) * normal - grad * 0.3;
          float nl = length(nn);
          // guard against degenerate derivatives (NaNs would bloom across the whole frame)
          if (nl > 1e-7 && tCobbleH > 0.0) normal = nn / nl;
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'terrain-v1';
  return mat;
}

// ---------------------------------------------------------------- rock (cliffs + undersides)

export function rockMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, flatShading: true });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvRW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vRW;\n${NOISE}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // soft horizontal strata streaks + speckle so faces are not flat fills
        float band = th_noise(vec2(vRW.y * 2.2, (vRW.x + vRW.z) * 0.15));
        diffuseColor.rgb *= 0.9 + band * 0.16 + th_noise(vRW.xz * 3.0 + vRW.y) * 0.05;`,
      );
  };
  mat.customProgramCacheKey = () => 'rock-v1';
  return mat;
}
