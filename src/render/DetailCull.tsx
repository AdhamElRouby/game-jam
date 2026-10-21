// Screen-size culling for static decoration: a mesh that would cover only a few pixels (far away and small, mostly
// lost in the fog anyway) is skipped. The free camera looks along the whole course, which put ~2x the draw calls of
// the old top-down camera on screen; this keeps the cost close to what it was. Gameplay objects are never culled:
// the mechanisms subtree (stamps, levers, machines) opts out with `userData.noCull`.
import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { quality } from './quality';

/**
 * Hide below this angular radius (radians), show again a little above it (hysteresis: no flicker at the edge).
 * Lower graphics presets cull more: the Esc menu's first lever on a slow laptop.
 */
const HIDE = { high: 0.011, medium: 0.016, low: 0.024 };
const CULLED = 1 << 5; // a layer nothing renders

const sphere = new THREE.Sphere();

export function DetailCull({ root }: { root: React.RefObject<THREE.Object3D | null> }) {
  const camera = useThree((s) => s.camera);
  const acc = useRef(0);
  useFrame((_, dt) => {
    acc.current += dt;
    if (acc.current < 0.2) return;
    acc.current = 0;
    const r = root.current;
    if (!r) return;
    const cp = camera.position;
    const hide = HIDE[quality.level];
    const show = hide * 1.2;
    const visit = (o: THREE.Object3D) => {
      if (o.userData.noCull) return;
      const m = o as THREE.Mesh;
      if ((m.isMesh || (o as THREE.InstancedMesh).isInstancedMesh) && m.frustumCulled && m.geometry) {
        const bs = (o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh).boundingSphere : m.geometry.boundingSphere;
        if (bs) {
          sphere.copy(bs).applyMatrix4(o.matrixWorld);
          const k = sphere.radius / Math.max(0.01, sphere.center.distanceTo(cp));
          const hidden = o.layers.mask === CULLED;
          if (!hidden && k < hide) o.layers.mask = CULLED;
          else if (hidden && k > show) o.layers.mask = 1; // default layer 0
        } else if (!(o as THREE.InstancedMesh).isInstancedMesh) m.geometry.computeBoundingSphere();
      }
      for (const c of o.children) visit(c);
    };
    visit(r);
  });
  return null;
}
