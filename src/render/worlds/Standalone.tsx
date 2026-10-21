// Worlds that are not on the original course (Worlds 4 and 5): their islands, structures, goal ring, flags and a
// scenic backdrop of floating islands, plus the per-world theme decoration.
import { useMemo } from 'react';
import type { BoxDef } from '../../shared/level';
import type { MapDef } from '../../shared/maps/types';
import { MergedIslands } from '../Islands';
import { scenicIsland } from '../islandGeo';
import { KitMeshes, WOOD, buildBridge, buildCurb } from '../Structures';
import { Kit } from '../kit';
import { Goal, Checkpoints } from '../World';
import { MushroomWorld, ShroomBox } from './Mushroom';
import { RailwayWorld, RailBox } from './Railway';
import { rng } from '../materials';

function Box({ b, railed }: { b: BoxDef; railed: Set<string> }) {
  const make = useMemo(() => {
    if (b.tag === 'bridge') return () => buildBridge(b, railed.has((b.id ?? '').replace('-deck', '')));
    if (b.tag === 'curb') return () => buildCurb(b);
    if (b.tag === 'ramp')
      return () => {
        // timber loading ramp: planks across a dark frame
        const k = new Kit(Math.round(b.p[2] * 7 + 3));
        const [w, h, l] = b.s;
        k.box('wood', WOOD.dark, [w, h - 0.06, l], [0, -0.03, 0], [0, 0, 0], 0.04);
        const n = Math.max(2, Math.round(l / 0.42));
        for (let i = 0; i < n; i++) k.box('wood', WOOD.plank[i % 4], [w + 0.04, 0.08, l / n - 0.04], [0, h / 2 - 0.04, -l / 2 + (i + 0.5) * (l / n)], [0, 0, 0], 0.02, 0.06);
        return k;
      };
    return () => {
      const k = new Kit(Math.round(b.p[2] * 7));
      k.box('stone', '#d4c7ba', b.s, [0, 0, 0], [0, 0, 0], 0.08, 0.05);
      return k;
    };
  }, [b, railed]);
  if (b.tag === 'curb' || b.tag === 'bridge') {
    return b.tag === 'curb' ? (
      <group position={b.p}>
        <KitMeshes make={make} />
      </group>
    ) : (
      <KitMeshes make={make} />
    );
  }
  return (
    <group position={b.p} rotation={b.rot ?? [0, 0, 0]}>
      <KitMeshes make={make} />
    </group>
  );
}

function MapBoxes({ boxes }: { boxes: BoxDef[] }) {
  const railed = useMemo(() => new Set(boxes.filter((b) => b.tag === 'rail').map((b) => (b.id ?? '').split('-rail')[0])), [boxes]);
  return (
    <group>
      {boxes.map((b, i) => {
        if (b.tag === 'rail') return null; // part of the bridge build
        if (b.vis === 'shroomRim' || b.vis === 'shroomCap' || b.vis === 'shroomStem') return <ShroomBox key={i} b={b} />;
        if (b.vis === 'station' || b.vis === 'signalBox' || b.vis === 'cranePad') return <RailBox key={i} b={b} />;
        if (b.mat === 'invisible') return null;
        return <Box key={i} b={b} railed={railed} />;
      })}
    </group>
  );
}

/** Scenic floating islands ringing the playfield so the world never ends in empty sky. */
function Backdrop({ map }: { map: MapDef }) {
  const defs = useMemo(() => {
    const R = rng(map.index * 991 + 7);
    const xs = map.islands.map((i) => i.rect.cx);
    const zs = map.islands.map((i) => i.rect.cz);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const z0 = Math.max(...zs) + 20;
    const z1 = Math.min(...zs) - 30;
    const out = [];
    for (let i = 0; i < 14; i++) {
      const side = i % 2 ? 1 : -1;
      const x = cx + side * (26 + R() * 40);
      const z = z0 + (z1 - z0) * (i / 13) + (R() - 0.5) * 10;
      const r = 5 + R() * 9;
      out.push(scenicIsland(7000 + map.index * 50 + i, x, z, r, -8 + R() * 18, r * 1.2));
    }
    return out;
  }, [map]);
  return <MergedIslands defs={defs} scenic />;
}

export function StandaloneWorld({ map }: { map: MapDef }) {
  return (
    <group>
      <MergedIslands defs={map.islands} />
      <MapBoxes boxes={map.boxes} />
      <Backdrop map={map} />
      {map.id === 'mushroom' && <MushroomWorld map={map} />}
      {map.id === 'railway' && <RailwayWorld map={map} />}
      <Goal p={map.goal.p} r={map.goal.r} />
      <Checkpoints />
    </group>
  );
}
