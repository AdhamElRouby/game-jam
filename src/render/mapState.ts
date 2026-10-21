// Which map the client is showing, plus helpers to read mechanism state from the interpolated frame.
import { useGame } from '../app/store';
import { MAPS, mapAt } from '../shared/maps';
import type { MapDef, MechDef } from '../shared/maps/types';
import { frame } from './frame';

/** Map index from the newest snapshot (live) or the lobby (menus, countdown before the first snapshot). */
export function activeMapIndex(): number {
  if (frame.live) return frame.current.latest.mp ?? 0;
  return useGame.getState().lobby?.map ?? 0;
}

export function activeMap(): MapDef {
  return mapAt(activeMapIndex());
}

/** React: re-renders when the map changes (lobby updates arrive on every map transition). */
export function useActiveMap(): MapDef {
  const i = useGame((s) => (s.screen === 'landing' ? 0 : (s.lobby?.map ?? 0)));
  return mapAt(i);
}

/** Interpolated state numbers of mechanism `i` (empty when the snapshot doesn't have it yet). */
export function mechState(i: number): number[] {
  return frame.current.m?.[i] ?? frame.current.latest.m?.[i] ?? [];
}

/** Is this mechanism running in the active map (vs. frozen scenery of another course map)? */
export function mechLive(def: MechDef, map: MapDef) {
  return !def.map || def.map === map.id;
}

export { MAPS };
