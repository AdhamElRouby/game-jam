// Shared materials + small procedural canvas textures (no external downloads at runtime).
import * as THREE from 'three';

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTex(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const grassTex = canvasTex(256, (g, s) => {
  g.fillStyle = '#86d39a';
  g.fillRect(0, 0, s, s);
  const r = rng(7);
  for (let i = 0; i < 260; i++) {
    const x = r() * s, y = r() * s, rad = 6 + r() * 26;
    const light = r() > 0.5;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, light ? 'rgba(170,230,160,0.35)' : 'rgba(80,170,110,0.28)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) {
      g.save();
      g.translate(ox, oy);
      g.beginPath();
      g.arc(x, y, rad, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  }
  for (let i = 0; i < 900; i++) {
    const x = r() * s, y = r() * s;
    g.strokeStyle = r() > 0.5 ? 'rgba(60,150,90,0.35)' : 'rgba(190,240,170,0.35)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 3, y - 3 - r() * 4);
    g.stroke();
  }
});

const pathTex = canvasTex(256, (g, s) => {
  g.fillStyle = '#e9d3a6';
  g.fillRect(0, 0, s, s);
  const r = rng(11);
  // cobbles
  const n = 7;
  for (let yi = 0; yi < n; yi++) {
    for (let xi = 0; xi < n; xi++) {
      const cx = (xi + (yi % 2) * 0.5 + 0.5) * (s / n) + (r() - 0.5) * 6;
      const cy = (yi + 0.5) * (s / n) + (r() - 0.5) * 6;
      const w = s / n / 2 - 3 - r() * 3;
      const shade = 200 + Math.floor(r() * 35);
      g.fillStyle = `rgb(${shade + 20},${shade}, ${shade - 40})`;
      g.beginPath();
      g.ellipse(cx, cy, w, w * 0.8, r() * 3, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(150,110,70,0.35)';
      g.lineWidth = 2;
      g.stroke();
    }
  }
});

const woodTex = canvasTex(128, (g, s) => {
  g.fillStyle = '#b07f58';
  g.fillRect(0, 0, s, s);
  const r = rng(5);
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = r() > 0.5 ? 'rgba(120,75,45,0.35)' : 'rgba(210,160,115,0.25)';
    g.lineWidth = 1 + r() * 2;
    const y = r() * s;
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(s * 0.3, y + (r() - 0.5) * 8, s * 0.6, y + (r() - 0.5) * 8, s, y);
    g.stroke();
  }
});

const stoneTex = canvasTex(256, (g, s) => {
  g.fillStyle = '#d9d0c6';
  g.fillRect(0, 0, s, s);
  const r = rng(3);
  const rows = 6;
  for (let yi = 0; yi < rows; yi++) {
    let x = -(yi % 2) * 20;
    const h = s / rows;
    while (x < s) {
      const w = 34 + r() * 30;
      const shade = 205 + Math.floor(r() * 30);
      g.fillStyle = `rgb(${shade},${shade - 6},${shade + 4})`;
      g.fillRect(x + 2, yi * h + 2, w - 4, h - 4);
      x += w;
    }
  }
  g.strokeStyle = 'rgba(120,105,130,0.25)';
});

export const MAT = {
  grass: new THREE.MeshStandardMaterial({ map: grassTex, color: '#ffffff', roughness: 0.92 }),
  grassRim: new THREE.MeshStandardMaterial({ color: '#72c486', roughness: 0.9, side: THREE.DoubleSide }),
  cliff: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true, side: THREE.DoubleSide }),
  rock: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true, side: THREE.DoubleSide }),
  wood: new THREE.MeshStandardMaterial({ map: woodTex, color: '#c79a72', roughness: 0.8 }),
  plank: new THREE.MeshStandardMaterial({ map: woodTex, color: '#d4a77d', roughness: 0.82 }),
  darkwood: new THREE.MeshStandardMaterial({ map: woodTex, color: '#8d6446', roughness: 0.85 }),
  stone: new THREE.MeshStandardMaterial({ map: stoneTex, color: '#f2ebf3', roughness: 0.88 }),
  stonePlain: new THREE.MeshStandardMaterial({ color: '#cfc6d6', roughness: 0.9 }),
  path: new THREE.MeshStandardMaterial({ map: pathTex, color: '#ffffff', roughness: 0.9 }),
  gold: new THREE.MeshStandardMaterial({ color: '#ffcf4a', metalness: 0.55, roughness: 0.3, emissive: '#6b4200', emissiveIntensity: 0.25 }),
  teal: new THREE.MeshStandardMaterial({ color: '#3fc7c0', roughness: 0.5, emissive: '#0c6f6a', emissiveIntensity: 0.4 }),
  iron: new THREE.MeshStandardMaterial({ color: '#5b5470', metalness: 0.5, roughness: 0.5 }),
  rope: new THREE.MeshStandardMaterial({ color: '#d9b77e', roughness: 0.9 }),
  white: new THREE.MeshStandardMaterial({ color: '#fff8ef', roughness: 0.8 }),
  cream: new THREE.MeshStandardMaterial({ color: '#f6e7cf', roughness: 0.85 }),
  pink: new THREE.MeshStandardMaterial({ color: '#f49bb5', roughness: 0.7 }),
  lavender: new THREE.MeshStandardMaterial({ color: '#9b8de4', roughness: 0.7 }),
  red: new THREE.MeshStandardMaterial({ color: '#e45b6f', roughness: 0.7 }),
  leaf: new THREE.MeshStandardMaterial({ color: '#6cc47e', roughness: 0.85, flatShading: true }),
  leafDark: new THREE.MeshStandardMaterial({ color: '#4fa46c', roughness: 0.85, flatShading: true }),
  trunk: new THREE.MeshStandardMaterial({ color: '#8a5d3f', roughness: 0.9 }),
  water: new THREE.MeshStandardMaterial({ color: '#bdeeff', roughness: 0.2, transparent: true, opacity: 0.75, emissive: '#5fc6ef', emissiveIntensity: 0.35 }),
};

export function worldUV(geo: THREE.BufferGeometry, scale: number, axes: 'xz' | 'xy' | 'zy' = 'xz') {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const [u, v] = axes === 'xz' ? [x, z] : axes === 'xy' ? [x, y] : [z, y];
    uv[i * 2] = u * scale;
    uv[i * 2 + 1] = v * scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}
