// Curated CC0 GLB models (Kenney / Quaternius) — bundled locally, instanced where repeated.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import manifest from '../../public/assets/manifest.json';
import { patchSeeThrough } from './seeThrough';

interface ModelInfo {
  id: string;
  url: string;
  bboxMin: [number, number, number];
  bboxMax: [number, number, number];
}

const BY_ID = new Map<string, ModelInfo>((manifest as unknown as { models: ModelInfo[] }).models.map((m) => [m.id, m]));

export function modelInfo(id: string) {
  return BY_ID.get(id);
}

function useScene(id: string) {
  const info = BY_ID.get(id);
  const gltf = useGLTF(info?.url ?? '/assets/models/nature/rock_small.glb', false, false) as unknown as { scene: THREE.Group };
  return { scene: gltf.scene, info };
}

// Nature-kit swatches remapped onto the terrain's yellow-green family so foliage and lawn read as one palette.
const RECOLOR: Record<string, string> = {
  leafsGreen: '#4f9f45',
  leafsDark: '#3b8442',
  grass: '#5daa45',
  leafsFall: '#e2a23b',
};

/** Palette harmonizer: nudges kit materials toward the game's warm pastel palette (applied once per material). */
function harmonize(mat: THREE.Material) {
  const m = mat as THREE.MeshStandardMaterial;
  if (m.isMeshStandardMaterial && !m.userData.harmonized) {
    m.userData.harmonized = true;
    m.roughness = Math.max(m.roughness ?? 0.8, 0.75);
    m.metalness = Math.min(m.metalness ?? 0, 0.1);
    const re = RECOLOR[m.name];
    if (re) m.color.set(re);
    m.envMapIntensity = 0.7;
    patchSeeThrough(m); // decor never hides the player from the camera
  }
  return m;
}

export interface Placement {
  x: number;
  y: number;
  z: number;
  s: number;
  r: number;
}

/** Many copies of one model as InstancedMeshes (one per sub-mesh); bottom-center anchored. */
export function InstancedModel({ id, items, shadow = true }: { id: string; items: Placement[]; shadow?: boolean }) {
  const { scene, info } = useScene(id);
  const parts = useMemo(() => {
    const out: { geo: THREE.BufferGeometry; mat: THREE.Material | THREE.Material[]; local: THREE.Matrix4 }[] = [];
    scene.updateMatrixWorld(true);
    const cx = info ? (info.bboxMin[0] + info.bboxMax[0]) / 2 : 0;
    const cz = info ? (info.bboxMin[2] + info.bboxMax[2]) / 2 : 0;
    const by = info ? info.bboxMin[1] : 0;
    const recenter = new THREE.Matrix4().makeTranslation(-cx, -by, -cz);
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = Array.isArray(mesh.material) ? mesh.material.map(harmonize) : harmonize(mesh.material);
      out.push({ geo: mesh.geometry, mat, local: recenter.clone().multiply(mesh.matrixWorld) });
    });
    return out;
  }, [scene, info]);
  const meshes = useMemo(() => {
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    return parts.map((part) => {
      const im = new THREE.InstancedMesh(part.geo, part.mat, items.length);
      items.forEach((it, i) => {
        q.setFromEuler(e.set(0, it.r, 0));
        m4.compose(v.set(it.x, it.y, it.z), q, sc.set(it.s, it.s, it.s)).multiply(part.local);
        im.setMatrixAt(i, m4);
      });
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = shadow;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      im.matrixAutoUpdate = false; // placement lives in instanceMatrix; this mesh's local transform is identity
      return im;
    });
  }, [parts, items, shadow]);
  return (
    <group>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </group>
  );
}

/** A single placed model (bottom-center anchored), cloned so it can be positioned freely. */
export function Model({ id, p, s = 1, r = 0, shadow = true, spin }: { id: string; p: [number, number, number]; s?: number | [number, number, number]; r?: number; shadow?: boolean; spin?: { node: string; axis: 'x' | 'y' | 'z'; speed: number } }) {
  const { scene, info } = useScene(id);
  const spinNode = useRef<THREE.Object3D | null>(null);
  useFrame((_, dt) => {
    if (spin && spinNode.current) spinNode.current.rotation[spin.axis] += dt * spin.speed;
  });
  const obj = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = shadow;
        mesh.receiveShadow = true;
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(harmonize) : harmonize(mesh.material);
      }
    });
    if (info) c.position.set(-(info.bboxMin[0] + info.bboxMax[0]) / 2, -info.bboxMin[1], -(info.bboxMin[2] + info.bboxMax[2]) / 2);
    spinNode.current = spin ? c.getObjectByName(spin.node) ?? null : null;
    c.traverse(o => { o.updateMatrix(); o.matrixAutoUpdate = o === spinNode.current; });
    return c;
  }, [scene, info, shadow, spin?.node]);
  return (
    <group position={p} rotation={[0, r, 0]} scale={s}>
      <primitive object={obj} />
    </group>
  );
}

export function preloadModels(ids: string[]) {
  for (const id of ids) {
    const info = BY_ID.get(id);
    if (info) useGLTF.preload(info.url, false, false);
  }
}
