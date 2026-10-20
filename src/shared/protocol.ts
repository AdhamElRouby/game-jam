// Wire protocol shared by server and client (Socket.IO event payloads).

export type Phase =
  | 'waiting'
  | 'countdown'
  | 'playing'
  | 'paused'
  | 'resuming'
  | 'finished'
  | 'abandoned';

export interface LobbySlot {
  slot: number;
  name: string;
  connected: boolean;
  you: boolean;
  again?: boolean;
}

export interface LobbyState {
  roomId: string;
  code: string | null;
  phase: Phase;
  slots: (LobbySlot | null)[];
  you: number;
  /** ms until countdown/resume/pause deadline, if relevant */
  timerMs?: number;
  reason?: string;
  dev?: boolean;
}

/** [slot, x, y, z, yaw, vx, vy, vz, flags, anchorX, anchorY, anchorZ] */
export type PlayerSnap = [number, number, number, number, number, number, number, number, number, number, number, number];
export const PF_GROUNDED = 1;
export const PF_GRIP = 2;
export const PF_CONNECTED = 4;
export const PF_MOVING = 8;
export const PF_RESPAWNING = 16;

/** [x, y, z, qx, qy, qz, qw, shape, vx, vy, vz] */
export type ArtifactSnap = [number, number, number, number, number, number, number, number, number, number, number];

export interface WorldSnap {
  plate: number; // 0..1 pressure progress
  gate: number; // 0..1 open amount
  recv: number; // 0..1 receiver progress
  bridge: number; // 0..1 unfold amount
  lever: number; // 0..1 lever thrown
  liftY: number; // lift deck top y
  liftGate: number; // 0..1 front gate raised
  lift: number; // 0 locked, 1 ready, 2 rising, 3 top
  aboard: number; // players aboard the lift
  wind: number; // 0..1 gust strength (negative = wind-up warning)
  fan: number; // 0..1 fan strength (negative = spin-up)
  goal: number; // 0..1 goal hold progress
  steady: number; // number of players gripping the artifact
  resetVotes: number;
}

export interface Snapshot {
  t: number; // sim time (ms)
  ph: Phase;
  el: number; // elapsed run time incl. penalties (ms)
  cp: number; // checkpoint index
  cd: number; // shift cooldown remaining (ms)
  pl: PlayerSnap[];
  ar: ArtifactSnap;
  w: WorldSnap;
}

export type GameEvent =
  | { k: 'shift'; shape: number; by: number }
  | { k: 'shiftFail'; shape: number; by: number; why: string }
  | { k: 'grip'; by: number }
  | { k: 'release'; by: number; snap?: boolean }
  | { k: 'impact'; v: number; mat: string }
  | { k: 'gate' }
  | { k: 'bridge' }
  | { k: 'lever' }
  | { k: 'liftStart' }
  | { k: 'liftTop' }
  | { k: 'checkpoint'; cp: number }
  | { k: 'drop' }
  | { k: 'fall'; by: number }
  | { k: 'respawn'; by: number; x: number; y: number; z: number }
  | { k: 'finish'; results: Results }
  | { k: 'toast'; text: string; slot?: number }
  | { k: 'hop'; by: number };

export interface Results {
  timeMs: number;
  rawMs: number;
  drops: number;
  falls: number;
  shifts: number;
  score: number;
  crowns: number;
  names: string[];
  title: string;
}

export interface HelloMsg {
  token: string;
  name: string;
}

export interface JoinMsg {
  name: string;
  code?: string;
  solo?: boolean;
}

/** Input packet: [seq, moveX, moveZ, jumpCounter, grab(0/1), respawnCounter] */
export type InputMsg = [number, number, number, number, number, number];

export interface ActionMsg {
  type: 'respawn' | 'resetVote' | 'again' | 'leave';
}

export function scoreFor(timeMs: number, drops: number, falls: number) {
  const seconds = timeMs / 1000;
  const score = Math.max(0, Math.round(1200 - seconds * 2 - drops * 35 - falls * 10));
  const crowns = score >= 760 ? 3 : score >= 560 ? 2 : 1;
  return { score, crowns };
}
