// Who is inside the artifact: a little glass dome on top with the pilot's face and hat, plus a ring in their colour.
// Placed in world space (it never spins with ROUND) and scaled in/out when someone hops in or out.
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { frame } from './frame';
import { camRef } from './CameraRig';
import { SLOT_COLORS } from '../shared/constants';
import { shapeSpec } from '../shared/shapes';
import { artifactOverride } from './Ending';

const HAT = ['#ffb13b', '#2f5fa8', '#3f8a4f'];

/** Vertical half-extent of the (possibly rotated) artifact. */
function extentY(shape: number, q: THREE.Quaternion) {
  const s = shapeSpec(shape);
  if (s.ball) return s.half[0];
  const e = new THREE.Matrix4().makeRotationFromQuaternion(q).elements;
  return Math.abs(e[1]) * s.half[0] + Math.abs(e[5]) * s.half[1] + Math.abs(e[9]) * s.half[2];
}

export function PilotBadge() {
  const root = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const st = useRef({ k: 0, slot: -1 });
  const mats = useMemo(
    () => ({
      skin: SLOT_COLORS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45 })),
      hat: HAT.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45 })),
      eye: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.25 }),
      pupil: new THREE.MeshStandardMaterial({ color: '#241d33', roughness: 0.2 }),
      glass: new THREE.MeshPhysicalMaterial({ color: '#dff6ff', transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0, clearcoat: 1, depthWrite: false }),
      rim: new THREE.MeshStandardMaterial({ color: '#e0a03a', metalness: 0.9, roughness: 0.3 }),
      ring: SLOT_COLORS.map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.65, depthWrite: false, toneMapped: false })),
    }),
    [],
  );
  const skinMesh = useRef<THREE.Mesh>(null);
  const hatMesh = useRef<THREE.Mesh>(null);
  const q = useMemo(() => new THREE.Quaternion(), []);

  useFrame(({ clock }, dtRaw) => {
    const dt = Math.min(0.05, dtRaw);
    const g = root.current;
    if (!g) return;
    const f = frame.current;
    const S = st.current;
    const slot = artifactOverride.active ? -1 : f.pilot;
    if (slot >= 0) S.slot = slot;
    S.k += ((slot >= 0 ? 1 : 0) - S.k) * Math.min(1, dt * 9);
    g.visible = S.k > 0.02 && S.slot >= 0;
    if (ring.current) ring.current.visible = g.visible;
    if (!g.visible) return;
    const a = f.artifact;
    q.set(a.qx, a.qy, a.qz, a.qw);
    const top = a.y + extentY(a.shape, q);
    const t = clock.elapsedTime;
    g.position.set(a.x, top + 0.08 + Math.sin(t * 3) * 0.03, a.z);
    const pop = S.k < 0.999 ? 1 + Math.sin(S.k * Math.PI) * 0.25 : 1;
    g.scale.setScalar(S.k * pop);
    if (skinMesh.current) skinMesh.current.material = mats.skin[S.slot];
    if (hatMesh.current) hatMesh.current.material = mats.hat[S.slot];
    // the face looks at the camera (yaw only) and peeks around a little
    const cam = camRef.current;
    if (head.current && cam) {
      head.current.rotation.y = Math.atan2(cam.position.x - a.x, cam.position.z - a.z) + Math.sin(t * 1.3) * 0.25;
      head.current.position.y = 0.32 + Math.max(0, Math.sin(t * 2.1)) * 0.05;
    }
    if (ring.current) {
      ring.current.material = mats.ring[S.slot];
      const s = shapeSpec(a.shape);
      const r = s.ball ? s.half[0] : Math.max(s.half[0], s.half[2]);
      ring.current.position.set(a.x, a.y - extentY(a.shape, q) + 0.05, a.z);
      ring.current.scale.setScalar((r + 0.45) * (1 + Math.sin(t * 4) * 0.03));
    }
  });

  return (
    <>
      <group ref={root} visible={false}>
        {/* brass collar + glass dome */}
        <mesh material={mats.rim} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.46, 0.06, 8, 24]} />
        </mesh>
        <mesh material={mats.glass} position={[0, 0.02, 0]}>
          <sphereGeometry args={[0.5, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
        <group ref={head} position={[0, 0.32, 0]}>
          <mesh ref={skinMesh} material={mats.skin[0]}>
            <sphereGeometry args={[0.27, 18, 14]} />
          </mesh>
          {[-1, 1].map((s) => (
            <group key={s} position={[s * 0.1, 0.03, 0.22]}>
              <mesh material={mats.eye} scale={[1, 1.2, 0.6]}>
                <sphereGeometry args={[0.065, 12, 8]} />
              </mesh>
              <mesh material={mats.pupil} position={[0, -0.005, 0.035]} scale={[1, 1.15, 0.6]}>
                <sphereGeometry args={[0.038, 10, 8]} />
              </mesh>
            </group>
          ))}
          <mesh ref={hatMesh} material={mats.hat[0]} position={[0, 0.2, 0]}>
            <sphereGeometry args={[0.22, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
        </group>
      </group>
      <mesh ref={ring} visible={false} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
        <ringGeometry args={[0.92, 1.0, 48]} />
      </mesh>
    </>
  );
}
