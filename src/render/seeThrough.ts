// Decoration never blocks your view: decor models (cottages, trees, crates…) have no colliders, so the camera can end
// up behind one. Their materials cut a dithered hole along the line from the camera to the player (only the stretch in
// front of the player; shadows are untouched). Level geometry is solid for the camera instead (camCollide.ts).
import * as THREE from 'three';

/** Shared by every patched material; the camera rig updates it each frame. */
export const seeUniforms = {
  seeA: { value: new THREE.Vector3() }, // camera
  seeB: { value: new THREE.Vector3() }, // what it looks at (your courier)
  seeR: { value: 0.95 },
  seeOn: { value: 0 },
};

export function patchSeeThrough(mat: THREE.Material) {
  if (mat.userData.seeThrough) return;
  mat.userData.seeThrough = true;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    prev.call(mat, shader, renderer);
    Object.assign(shader.uniforms, seeUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSeeWorld;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 seeW = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          seeW = instanceMatrix * seeW;
        #endif
        vSeeWorld = (modelMatrix * seeW).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSeeWorld;\nuniform vec3 seeA;\nuniform vec3 seeB;\nuniform float seeR;\nuniform float seeOn;')
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        if (seeOn > 0.5) {
          vec3 ab = seeB - seeA;
          float t = clamp(dot(vSeeWorld - seeA, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
          float d = length(vSeeWorld - (seeA + ab * t));
          if (t < 0.9 && d < seeR) {
            float n = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
            if (d < seeR * 0.7 || n > (d - seeR * 0.7) / (seeR * 0.3)) discard;
          }
        }`,
      );
  };
  mat.needsUpdate = true;
}
