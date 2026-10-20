// Tiny procedural "kit-bash" builder: bevelled boxes / cylinders / blobs with per-piece vertex colours,
// merged into one geometry per material so whole structures (bridges, palisades, castle) cost a few draw calls.
// Flat colours + soft bevels match the Kenney kits, so procedural and imported pieces read as one style.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export type KitMat = 'wood' | 'stone' | 'metal' | 'gold' | 'cloth' | 'leaf' | 'rope' | 'glow' | 'roof' | 'plaster' | 'dark';

const BASE: Record<KitMat, THREE.MeshStandardMaterialParameters> = {
  wood: { roughness: 0.82, metalness: 0 },
  stone: { roughness: 0.9, metalness: 0 },
  plaster: { roughness: 0.92, metalness: 0 },
  roof: { roughness: 0.75, metalness: 0 },
  metal: { roughness: 0.42, metalness: 0.75 },
  gold: { roughness: 0.28, metalness: 1.0 },
  cloth: { roughness: 0.9, metalness: 0, side: THREE.DoubleSide },
  leaf: { roughness: 0.85, metalness: 0, flatShading: true },
  rope: { roughness: 0.95, metalness: 0 },
  glow: { roughness: 0.5, metalness: 0, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0 },
  dark: { roughness: 0.95, metalness: 0 },
};

const MATS = new Map<KitMat, THREE.MeshStandardMaterial>();
export function kitMaterial(kind: KitMat) {
  let m = MATS.get(kind);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ ...BASE[kind], vertexColors: true, color: '#ffffff' });
    MATS.set(kind, m);
  }
  return m;
}

type V3 = [number, number, number];

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _c = new THREE.Color();

let seed = 1;
function rand() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}

export class Kit {
  private parts = new Map<KitMat, THREE.BufferGeometry[]>();
  private cache = new Map<string, THREE.BufferGeometry>();

  constructor(randomSeed = 7) {
    seed = randomSeed;
  }

  /** Add an arbitrary geometry (cloned) with a transform and a flat colour (+ optional brightness jitter). */
  add(mat: KitMat, geo: THREE.BufferGeometry, color: string, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], scale: V3 = [1, 1, 1], jitter = 0.05) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.deleteAttribute('uv');
    _q.setFromEuler(_e.set(rot[0], rot[1], rot[2]));
    _m.compose(new THREE.Vector3(...pos), _q, new THREE.Vector3(...scale));
    g.applyMatrix4(_m);
    _c.set(color);
    const k = 1 + (rand() - 0.5) * 2 * jitter;
    const n = g.attributes.position.count;
    const cols = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      cols[i * 3] = _c.r * k;
      cols[i * 3 + 1] = _c.g * k;
      cols[i * 3 + 2] = _c.b * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    if (!g.attributes.normal) g.computeVertexNormals();
    let list = this.parts.get(mat);
    if (!list) this.parts.set(mat, (list = []));
    list.push(g);
    return this;
  }

  private shared(key: string, make: () => THREE.BufferGeometry) {
    let g = this.cache.get(key);
    if (!g) this.cache.set(key, (g = make()));
    return g;
  }

  /** Bevelled box of full size s. */
  box(mat: KitMat, color: string, s: V3, pos: V3, rot: V3 = [0, 0, 0], bevel = 0.04, jitter = 0.05) {
    const r = Math.min(bevel, Math.min(...s) / 2 - 0.001);
    if (r <= 0.005) {
      const g = this.shared('box', () => new THREE.BoxGeometry(1, 1, 1));
      return this.add(mat, g, color, pos, rot, s, jitter);
    }
    const g = new RoundedBoxGeometry(s[0], s[1], s[2], 1, r);
    return this.add(mat, g, color, pos, rot, [1, 1, 1], jitter);
  }

  cyl(mat: KitMat, color: string, rTop: number, rBot: number, h: number, pos: V3, rot: V3 = [0, 0, 0], seg = 10, jitter = 0.05) {
    const g = this.shared(`cyl${rTop}:${rBot}:${seg}`, () => new THREE.CylinderGeometry(rTop, rBot, 1, seg));
    return this.add(mat, g, color, pos, rot, [1, h, 1], jitter);
  }

  cone(mat: KitMat, color: string, r: number, h: number, pos: V3, rot: V3 = [0, 0, 0], seg = 10, jitter = 0.04) {
    const g = this.shared(`cone${seg}`, () => new THREE.ConeGeometry(1, 1, seg));
    return this.add(mat, g, color, pos, rot, [r, h, r], jitter);
  }

  sphere(mat: KitMat, color: string, r: number, pos: V3, scale: V3 = [1, 1, 1], detail = 1, jitter = 0.05) {
    const g = this.shared(`ico${detail}`, () => new THREE.IcosahedronGeometry(1, detail));
    return this.add(mat, g, color, pos, [0, 0, 0], [r * scale[0], r * scale[1], r * scale[2]], jitter);
  }

  /** Beam between two points (square cross-section w x h). */
  beam(mat: KitMat, color: string, a: V3, b: V3, w: number, h = w, bevel = 0.03, jitter = 0.05) {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
    const len = va.distanceTo(vb);
    const mid = va.clone().add(vb).multiplyScalar(0.5);
    const dir = vb.clone().sub(va).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    const e = new THREE.Euler().setFromQuaternion(q);
    return this.box(mat, color, [w, h, len], [mid.x, mid.y, mid.z], [e.x, e.y, e.z], bevel, jitter);
  }

  /** Rope/tube along a sagging curve between two points. */
  rope(color: string, a: V3, b: V3, sag: number, r = 0.035) {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
    const mid = va.clone().add(vb).multiplyScalar(0.5);
    mid.y -= sag;
    const curve = new THREE.QuadraticBezierCurve3(va, mid, vb);
    const g = new THREE.TubeGeometry(curve, 10, r, 5, false);
    return this.add('rope', g, color, [0, 0, 0], [0, 0, 0], [1, 1, 1], 0.03);
  }

  build(): { mat: THREE.MeshStandardMaterial; geo: THREE.BufferGeometry }[] {
    const out: { mat: THREE.MeshStandardMaterial; geo: THREE.BufferGeometry }[] = [];
    for (const [kind, list] of this.parts) {
      if (!list.length) continue;
      const geo = mergeGeometries(list, false);
      geo.computeBoundingSphere();
      geo.computeBoundingBox();
      out.push({ mat: kitMaterial(kind), geo });
      list.forEach((g) => g.dispose());
    }
    this.parts.clear();
    return out;
  }
}

export function randKit() {
  return rand();
}
