// Highlights what the team should go to or use next: a pulsing ring on the ground under the current objective's hint
// point and a soft light column you can spot from anywhere; extra `marks` (both pressure plates, the two levers) get a
// ring and a bobbing arrow. The delivery ring already glows, so a hint at the goal gets no column.
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { frame } from './frame';
import { activeMap } from './mapState';
import { groundAt } from './ground';
import { useGame } from '../app/store';

const MAX_MARKS = 3;
const COLOR = new THREE.Color('#8ff7ef');

export function HintBeacon() {
  const rings = useRef<(THREE.Mesh | null)[]>([]);
  const arrows = useRef<(THREE.Mesh | null)[]>([]);
  const column = useRef<THREE.Mesh>(null);
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: COLOR, transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }), []);
  const arrowMat = useMemo(() => new THREE.MeshBasicMaterial({ color: COLOR, toneMapped: false }), []);
  const arrowGeo = useMemo(() => new THREE.ConeGeometry(0.32, 0.62, 4).rotateX(Math.PI), []); // points down
  const colMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: { op: { value: 0.2 }, t: { value: 0 }, c: { value: COLOR } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `uniform float op; uniform float t; uniform vec3 c; varying vec2 vUv;
          void main(){
            float fade = pow(clamp(1.0 - vUv.y, 0.0, 1.0), 2.2);
            float bands = 0.8 + 0.2 * sin(vUv.y * 14.0 - t * 3.0);
            gl_FragColor = vec4(c * fade * bands * op, 1.0);
          }`,
      }),
    [],
  );

  useFrame(({ clock }) => {
    const f = frame.current;
    const t = clock.elapsedTime;
    const map = activeMap();
    const ob = frame.live && f.latest.ph === 'playing' && !useGame.getState().cutscene ? map.objectives[f.latest.ob ?? 0] : undefined;
    const h = ob?.hint;
    const atGoal = !!h && Math.hypot(h.p[0] - map.goal.p[0], h.p[2] - map.goal.p[2]) < map.goal.r + 1;
    const main = h && !atGoal ? 1 : 0;
    const pts = h ? [...(main ? [h.p] : []), ...(h.marks ?? [])] : [];
    const pulse = 1 + Math.sin(t * 3.2) * 0.08;
    ringMat.opacity = 0.5 + Math.sin(t * 3.2) * 0.2;
    for (let i = 0; i < MAX_MARKS; i++) {
      const r = rings.current[i];
      const ar = arrows.current[i];
      if (!r || !ar) continue;
      const p = pts[i];
      r.visible = !!p;
      ar.visible = !!p && i >= main; // the main point has its label instead
      if (!p) continue;
      const gy = groundAt(p[0], p[2], p[1] + 0.5, f.w.liftY, f.w.bridge) ?? p[1] - 1.6;
      r.position.set(p[0], gy + 0.16, p[2]);
      r.scale.setScalar(pulse);
      ar.position.set(p[0], gy + 2.1 + Math.sin(t * 3 + i) * 0.15, p[2]);
      ar.rotation.y = t * 1.5;
    }
    const c = column.current;
    if (c) {
      c.visible = !!h && !atGoal;
      if (c.visible && h) {
        const gy = groundAt(h.p[0], h.p[2], h.p[1], f.w.liftY, f.w.bridge) ?? h.p[1] - 1.6;
        c.position.set(h.p[0], gy + 3, h.p[2]);
        colMat.uniforms.t.value = t;
        colMat.uniforms.op.value = 0.16 + Math.sin(t * 2) * 0.04;
      }
    }
  });

  return (
    <>
      {Array.from({ length: MAX_MARKS }, (_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            rings.current[i] = m;
          }}
          visible={false}
          rotation={[-Math.PI / 2, 0, 0]}
          material={ringMat}
          renderOrder={2}
        >
          <ringGeometry args={[1.35, 1.65, 48]} />
        </mesh>
      ))}
      {Array.from({ length: MAX_MARKS }, (_, i) => (
        <mesh
          key={'a' + i}
          ref={(m) => {
            arrows.current[i] = m;
          }}
          visible={false}
          material={arrowMat}
          geometry={arrowGeo}
        />
      ))}
      <mesh ref={column} visible={false} material={colMat}>
        <cylinderGeometry args={[0.9, 1.15, 6, 32, 1, true]} />
      </mesh>
    </>
  );
}
