// The adventure: maps in play order. `index` is assigned from this order.
import { CASTLE, CLOCKWORK, DOCK, WINDBRIDGE } from './course';
import { MUSHROOM } from './mushroom';
import { RAILWAY } from './railway';
import type { MapDef, MapId } from './types';

export const MAPS: MapDef[] = [DOCK, WINDBRIDGE, CLOCKWORK, MUSHROOM, RAILWAY, CASTLE];
MAPS.forEach((m, i) => (m.index = i));

export function mapAt(i: number): MapDef {
  return MAPS[Math.max(0, Math.min(MAPS.length - 1, i | 0))];
}

export function mapById(id: MapId): MapDef | undefined {
  return MAPS.find((m) => m.id === id);
}

/** Order of the map owning a shared mechanism (course maps), -1 when unknown. */
export function mapOrder(id: MapId | undefined): number {
  return id ? MAPS.findIndex((m) => m.id === id) : -1;
}

export type { MapDef, MapId } from './types';
