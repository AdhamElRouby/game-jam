// Shared tuning constants used by both the authoritative server and the client.

export const TICK_HZ = 60;
export const TICK_DT = 1 / TICK_HZ;
export const SNAPSHOT_HZ = 30;
export const INPUT_HZ = 30;
export const ROOM_SIZE = 3;

export const COUNTDOWN_MS = 5000;
export const RESUME_COUNTDOWN_MS = 3000;
export const PAUSE_TIMEOUT_MS = 45000;
export const RESULTS_REPLAY_MS = 0;

export const GRAVITY = -18;
export const KILL_Y = -14;

export const SHIFT_COOLDOWN_MS = 1500;
export const SHIFT_RANGE = 3.4; // max distance from player to artifact surface
export const SHIFT_SWAP_DELAY_MS = 0;
export const DROP_PENALTY_MS = 7000;
export const GOAL_HOLD_S = 1.5;

export const PLAYER_RADIUS = 0.38;
export const PLAYER_HALF_HEIGHT = 0.3; // capsule half segment
export const PLAYER_CENTER_Y = PLAYER_HALF_HEIGHT + PLAYER_RADIUS; // center above feet
export const PLAYER_MASS = 1.2;
export const WALK_SPEED = 5.4;
export const GRIP_SPEED = 3.3;
export const JUMP_SPEED = 7.4;
export const GRIP_RANGE = 1.25; // from capsule surface to artifact surface
export const GRIP_BREAK = 3.2;
export const SPRINT_SPEED = 7.4; // faster, but with less grip on the ground (lower acceleration)

// Piloting: one courier can ride inside the artifact and steer it.
export const PILOT_RANGE = 1.1; // courier surface to artifact surface to hop in
export const PILOT_TOGGLE_S = 0.6; // min time between hopping in and out
export const PILOT_EXIT_MAX_SPEED = 3.4; // artifact must be slower than this to hop out
export const PILOT_EXIT_RETRY_S = 4; // keep retrying a requested exit this long before giving up

export const ARTIFACT_MASS = 5;

export const SLOT_COLORS = ['#FF697F', '#64B9F4', '#80D78E'] as const;
export const SLOT_NAMES = ['Red', 'Blue', 'Green'] as const;

export const PALETTE = {
  sky: '#86D9F6',
  grass: '#84CFA0',
  artifact: '#FFD153',
  pink: '#F49BB5',
  lavender: '#9B8DE4',
  wood: '#A77957',
  red: '#FF697F',
  blue: '#64B9F4',
  green: '#80D78E',
  teal: '#3FC7C0',
  stone: '#B9B2C8',
};

// Collision groups: membership in the upper 16 bits, filter in the lower 16.
export const G_STATIC = 1 << 0;
export const G_PLAYER = 1 << 1;
export const G_ARTIFACT = 1 << 2;
export const G_CARGO_BARRIER = 1 << 3; // blocks only the artifact
export const G_PLAYER_BARRIER = 1 << 4; // blocks only players

export function groups(membership: number, filter: number): number {
  return ((membership & 0xffff) << 16) | (filter & 0xffff);
}
