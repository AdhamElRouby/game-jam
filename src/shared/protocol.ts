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
  /** split vote: ms until one of the team's picks is drawn */
  tieMs?: number;
  reason?: string;
  dev?: boolean;
  /** index of the map being played (MAPS order) */
  map: number;
  /** 'adventure' plays every map in order; 'single' plays the one picked */
  mode: 'adventure' | 'single';
  /** per-slot choice in the lobby ('map:<i>' | 'adventure') or on the results screen (also 'retry' | 'next') */
  votes: (string | null)[];
  /** results of the maps finished so far in this run */
  history: Results[];
}

/** [slot, x, y, z, yaw, vx, vy, vz, flags, anchorX, anchorY, anchorZ] */
export type PlayerSnap = [number, number, number, number, number, number, number, number, number, number, number, number];
export const PF_GROUNDED = 1;
export const PF_GRIP = 2;
export const PF_CONNECTED = 4;
export const PF_MOVING = 8;
export const PF_RESPAWNING = 16;
export const PF_PILOT = 32; // riding inside the artifact (position = artifact centre)
export const PF_TUMBLE = 64; // knocked over for a moment
export const PF_SPRINT = 128;
export const PF_USE = 256; // holding Q on a mechanism
export const PF_ONMOVER = 512; // standing on a moving platform

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
  pi: number; // slot of the courier piloting the artifact, -1 if empty
  pa: number; // pilot ability cooldown remaining (0..1 of its full length)
  mp: number; // map index
  m: number[][]; // per-mechanism state (map.mechs order)
  ob: number; // current objective index
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
  | { k: 'hop'; by: number }
  | { k: 'pilotIn'; by: number }
  | { k: 'pilotOut'; by: number; x: number; y: number; z: number }
  | { k: 'pilotFail'; by: number; why: string }
  | { k: 'ability'; by: number; shape: number }
  | { k: 'thump'; x: number; y: number; z: number; v: number }
  | { k: 'tumble'; by: number }
  | { k: 'bump'; a: number; b: number; v: number }
  | { k: 'mech'; i: number; ev: string; v?: number; by?: number; who?: number }
  | { k: 'collect'; i: number; by: number; n: number; total: number }
  | { k: 'shortcut'; label: string }
  | { k: 'stuck' };

export interface Achievement {
  label: string;
  got: boolean;
}

/** One finished map. `adventure` is filled on the last map of a full run (totals over every map). */
export interface Results {
  map: number;
  mapName: string;
  timeMs: number;
  rawMs: number;
  par: number; // seconds
  drops: number;
  falls: number;
  shifts: number;
  stamps: number;
  stampTotal: number;
  shortcuts: string[];
  score: number;
  crowns: number;
  achievements: Achievement[];
  names: string[];
  title: string;
  adventure?: { score: number; crowns: number; maxCrowns: number; timeMs: number; maps: number };
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

/**
 * Input packet: [seq, moveX, moveZ, jumpCounter, grab(0/1), respawnCounter, buttons, pilotCounter, useCounter, camYaw].
 * moveX/moveZ are a world-space direction (the client already turned WASD by its camera); camYaw is that camera's
 * heading, so the server can tell the player's left from right (LONG's swing, which side to hop out on).
 * Counters only ever increase, so a lost packet never loses a press. The last four fields are optional (older clients).
 */
export type InputMsg = [number, number, number, number, number, number, number?, number?, number?, number?];
export const BTN_USE = 1; // Q held
export const BTN_SPRINT = 2; // Shift held
export const BTN_ABILITY = 4; // Space held

export interface ActionMsg {
  type: 'respawn' | 'resetVote' | 'again' | 'leave';
}

/**
 * Score for one map. Shifting is never penalized; finishing, speed, stamps, shortcuts and a clean run are rewarded;
 * artifact drops and courier falls cost a little. Crowns: finish + under par + every royal stamp.
 */
export function mapScore(o: { seconds: number; par: number; drops: number; falls: number; stamps: number; stampTotal: number; shortcuts: number }) {
  const timeBonus = Math.max(0, Math.round((o.par * 1.6 - o.seconds) * 4));
  const score = Math.max(100, Math.round(500 + timeBonus + o.stamps * 60 + o.shortcuts * 80 + (o.drops === 0 ? 120 : 0) - o.drops * 35 - o.falls * 5));
  const fast = o.seconds <= o.par;
  const allStamps = o.stampTotal > 0 && o.stamps >= o.stampTotal;
  const crowns = 1 + (fast ? 1 : 0) + (allStamps ? 1 : 0);
  return { score, crowns, fast, allStamps };
}
