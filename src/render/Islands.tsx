// Island rendering: every island's cap / rock / vines merged per material (a handful of draw calls for the whole sky).
import { useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { IslandDef } from '../shared/level';
import { buildIsland } from './islandGeo';
import { rockMaterial, terrainMaterial } from './terrain';

export const ISLAND_MAT = {
  top: terrainMaterial(),
  topScenic: terrainMaterial({ usePaths: false, tint: '#f4fbe8' }),
  rock: rockMaterial(),
  vine: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide, flatShading: true }),
};

export function MergedIslands({ defs, scenic = false }: { defs: IslandDef[]; scenic?: boolean }) {
  const geo = useMemo(() => {
    const built = defs.map((d) => buildIsland(d));
    const merge = (list: THREE.BufferGeometry[]) => {
      const g = mergeGeometries(list.filter((x) => x.attributes.position.count > 0), false);
      g.computeBoundingSphere();
      return g;
    };
    return { top: merge(built.map((b) => b.top)), rock: merge(built.map((b) => b.rock)), vines: merge(built.map((b) => b.vines)) };
  }, [defs]);
  return (
    <group>
      <mesh geometry={geo.top} material={scenic ? ISLAND_MAT.topScenic : ISLAND_MAT.top} receiveShadow={!scenic} />
      <mesh geometry={geo.rock} material={ISLAND_MAT.rock} castShadow={!scenic} receiveShadow={!scenic} />
      <mesh geometry={geo.vines} material={ISLAND_MAT.vine} castShadow={!scenic} />
    </group>
  );
}
