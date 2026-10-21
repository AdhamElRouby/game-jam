// What the active map draws: the original course (World + Scenery, kept mounted so returning to it is instant) for
// Worlds 1-3 and 6, plus the gameplay mechanisms of whichever map is running.
import { useMemo } from 'react';
import { World } from './World';
import { Scenery } from './Scenery';
import { Mechanisms } from './Mechanisms';
import { useActiveMap } from './mapState';
import { StandaloneWorld } from './worlds/Standalone';
import { Disposer } from './Disposer';

export function MapWorld() {
  const map = useActiveMap();
  // a stable element: switching worlds must not re-render the course (some of its kits rebuild on every render)
  const course = useMemo(
    () => (
      <>
        <World />
        <Scenery />
      </>
    ),
    [],
  );
  return (
    <>
      <group visible={map.course}>{course}</group>
      {!map.course && (
        <Disposer key={map.id}>
          <StandaloneWorld map={map} />
        </Disposer>
      )}
      {/* gameplay pieces stay visible at any distance (DetailCull skips them) */}
      <group userData={{ noCull: true }}>
        <Disposer key={map.id + ':m'}>
          <Mechanisms map={map} />
        </Disposer>
      </group>
    </>
  );
}
