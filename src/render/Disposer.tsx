// Frees the GPU resources of a subtree when it unmounts (world switches). Memoized geometries/materials passed as
// props are not disposed by R3F, so every map swap used to leak them. Anything still drawn elsewhere in the scene
// (shared caches, the always-mounted course) is kept; a disposed cached resource simply re-uploads if used again.
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

type Res = THREE.BufferGeometry | THREE.Material | THREE.Texture;

function addMaterial(m: THREE.Material, out: Set<Res>) {
  out.add(m);
  for (const v of Object.values(m)) if ((v as THREE.Texture | null)?.isTexture) out.add(v as THREE.Texture);
  const u = (m as THREE.ShaderMaterial).uniforms;
  if (u) for (const k in u) if ((u[k]?.value as THREE.Texture | null)?.isTexture) out.add(u[k].value);
}

/** Every geometry, material and texture an object tree renders with. */
export function collectResources(root: THREE.Object3D, out = new Set<Res>()) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) out.add(m.geometry);
    if (m.material) for (const mat of Array.isArray(m.material) ? m.material : [m.material]) addMaterial(mat, out);
    if (m.customDepthMaterial) addMaterial(m.customDepthMaterial, out);
    if (m.customDistanceMaterial) addMaterial(m.customDistanceMaterial, out);
  });
  return out;
}

export function Disposer({ children }: { children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const scene = useThree((s) => s.scene);
  // layout cleanup runs before R3F detaches the children, so the subtree is still complete here
  useLayoutEffect(() => {
    const root = ref.current;
    return () => {
      if (!root) return;
      const mine = collectResources(root);
      // wait for the swap to commit: the next map's subtree may share cached resources
      setTimeout(() => {
        const used = collectResources(scene);
        for (const r of mine) if (!used.has(r)) r.dispose();
      }, 0);
    };
  }, [scene]);
  return <group ref={ref}>{children}</group>;
}
