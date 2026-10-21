// Worlds 1, 2, 3 and 6 live on the original continuous course (LEVEL). Every course Sim builds the whole course and all
// of these mechanisms; only the owning map's mechanisms run live, the others sit frozen solved (earlier maps) or
// untouched (later maps), so the course always looks and collides the same as it is drawn.
import { LEVEL, type CheckpointDef, type V3 } from '../level';
import { ShapeId } from '../shapes';
import type { MapDef, MechDef } from './types';

const L = LEVEL;

// ---------------------------------------------------------------- shared course mechanisms

export const COURSE_MECHS: MechDef[] = [
  // World 1 — Royal Loading Dock
  { kind: 'plate', id: 'dockPlate', map: 'dock', legacy: 'plate', p: L.plate.p, size: L.plate.s, trigger: L.plate.trigger, hold: L.plate.hold, by: 'artifact', latch: true },
  { kind: 'gate', id: 'dockGate', map: 'dock', legacy: 'gate', p: L.gate.p, s: L.gate.s, drop: L.gate.drop, time: L.gate.time, when: 'dockPlate', latch: true },
  {
    kind: 'rotor',
    id: 'turnstile',
    map: 'dock',
    p: [0, 0, -22.1],
    // one sweeping arm: each side of the lane is clear for ~6 s of every 10.5 s turn
    parts: [
      { s: [0.6, 1.7, 0.6], o: [0, 0.85, 0] },
      { s: [2.3, 0.55, 0.32], o: [1.25, 0.55, 0] },
    ],
    speed: 0.6,
    style: 'turnstile',
  },
  {
    kind: 'spring',
    id: 'archSpring',
    map: 'dock',
    p: [-6.2, 0, -21.4],
    size: [2.4, 2.4],
    launch: [0, 14.5, -7.0],
    playerLaunch: [0, 13.0, -7.6],
    affects: 'all',
    cooldown: 2.0,
    shapeScale: [1, 0.92, 0.9, 1],
    offsetKick: 1.2,
    style: 'pad',
  },
  { kind: 'collect', id: 'dockStamp1', map: 'dock', p: [-7.6, 0.9, 8.0], item: 'stamp' },
  { kind: 'collect', id: 'dockStamp2', map: 'dock', p: [-6.2, 5.5, -26.4], item: 'stamp' },
  { kind: 'collect', id: 'dockStamp3', map: 'dock', p: [6.6, 3.0, -36.2], item: 'stamp' },
  { kind: 'blocker', id: 'dockExit', map: 'dock', p: [0, 1.3, -37.6], s: [5.8, 2.6, 0.5], collide: 'solid', style: 'barricade', label: 'NEXT DELIVERY' },

  // World 2 — Windbridge Cliffs
  { kind: 'switch', id: 'valve', map: 'windbridge', p: [4.8, 0, -56.8], radius: 1.7, mode: 'toggle', label: 'Wind wheel', states: ['wind blows here', 'wind moved to the next cliff'], style: 'wheel' },
  {
    kind: 'wind',
    id: 'cliffWind',
    map: 'windbridge',
    legacy: 'wind',
    zone: { ...L.windZones[0], max: [13, 12, -37.4] },
    unless: 'valve',
    players: 0.25,
  },
  {
    kind: 'wind',
    id: 'gauntletWind',
    map: 'windbridge',
    zone: { id: 'gauntletWind', kind: 'wind', min: [-12, -6, -81], max: [12, 12, -66.2], dir: [-1, 0, 0], force: 62, period: 6.0, calm: 2.4, windup: 1.0, offset: 2.0 },
    when: 'valve',
    shelters: [
      { min: [-7.5, -2, -69.6], max: [-0.85, 6, -66.6] },
      { min: [-7.5, -2, -76.0], max: [-0.85, 6, -73.0] },
      { min: [-7.5, -2, -80.8], max: [-0.85, 6, -78.6] },
    ],
    players: 0.3,
  },
  { kind: 'wobble', id: 'windBridge', map: 'windbridge', p: [0, 0, -41.5], s: [5.2, 0.4, 7.0], maxTilt: 0.15, stiffness: 960, damping: 230, rails: 1.2, wind: 'cliffWind' },
  { kind: 'dock', id: 'receiver', map: 'windbridge', legacy: 'recv', p: L.receiver.p, yaw: L.receiver.yaw, zone: L.receiver.zone, shape: ShapeId.LONG, hold: L.receiver.hold, magnet: true, yawTol: 0.42, maxSpeed: 2.5 },
  { kind: 'drawbridge', id: 'drawbridge', map: 'windbridge', legacy: 'bridge', ...L.drawbridge, when: 'receiver' },
  { kind: 'spring', id: 'ridgeSpring', map: 'windbridge', p: [8.9, 0, -65.9], size: [1.5, 1.2], launch: [0, 0, 0], playerLaunch: [0, 9.6, -1.6], affects: 'players', cooldown: 1.0, style: 'pad' },
  { kind: 'collect', id: 'windStamp1', map: 'windbridge', p: [9.0, 3.2, -68.4], item: 'stamp' },
  { kind: 'collect', id: 'windStamp2', map: 'windbridge', p: [9.0, 3.2, -71.2], item: 'stamp' },
  { kind: 'collect', id: 'windStamp3', map: 'windbridge', p: [6.3, 1.0, -63.6], item: 'stamp' },
  { kind: 'blocker', id: 'windExit', map: 'windbridge', p: [0.6, 1.2, -80.75], s: [7.0, 2.4, 0.4], collide: 'solid', style: 'barricade', label: 'NEXT DELIVERY' },

  // World 3 — The Crooked Clockwork Tower
  {
    kind: 'rotor',
    id: 'clockHand',
    map: 'clockwork',
    p: [0, 0, -84],
    // a thin walkway flush with the islands that just spans the 6 m gap when lined up (10 cm seams);
    // its corners only graze the cliff lips (~0.2 m) as it turns, sliding under feet instead of shoving
    parts: [{ s: [2.6, 0.04, 5.8], o: [0, 0.01, 0], walk: true }],
    speed: 0.3,
    phase: Math.PI / 2,
    unless: 'clockBrake',
    style: 'clockhand',
  },
  // whoever stands on the hub and holds Q stops the hand: one brakes while the others load or unload
  { kind: 'switch', id: 'clockBrake', map: 'clockwork', p: [0, 0, -84], radius: 1.15, mode: 'hold', label: 'Clock brake', states: ['moving', 'stopped'], style: 'button' },
  { kind: 'pushLever', id: 'lever', map: 'clockwork', legacy: 'lever', p: L.lever.p, trigger: L.lever.trigger, hold: 0.45, upright: 0.975 },
  { kind: 'switch', id: 'liftBrake', map: 'clockwork', p: [8.6, 8, -105.4], radius: 1.6, mode: 'toggle', label: 'Lift brake', states: ['brake on: slow lift', 'brake off: fast lift'], style: 'lever' },
  { kind: 'lift', id: 'lift', map: 'clockwork', legacy: 'lift', ...L.lift, when: 'lever', crank: [2.1, 0, 2.1], brake: 'liftBrake' },
  { kind: 'spring', id: 'climbSpring', map: 'clockwork', p: [-8.0, 0, -98.6], size: [1.8, 1.8], launch: [0, 0, 0], playerLaunch: [0, 17.5, -7.0], affects: 'players', cooldown: 1.2, style: 'pad' },
  { kind: 'collect', id: 'clockStamp1', map: 'clockwork', p: [3.4, 1.0, -84], item: 'stamp' },
  { kind: 'collect', id: 'clockStamp2', map: 'clockwork', p: [-8.0, 7.0, -101.6], item: 'stamp' },
  { kind: 'collect', id: 'clockStamp3', map: 'clockwork', p: [-8.6, 8.9, -113.2], item: 'stamp' },
  { kind: 'blocker', id: 'towerExitL', map: 'clockwork', p: [-6, 8.9, -115.6], s: [6.4, 1.8, 0.4], collide: 'solid', style: 'barricade', label: 'NEXT DELIVERY' },
  { kind: 'blocker', id: 'towerExitR', map: 'clockwork', p: [5, 8.9, -115.6], s: [5.4, 1.8, 0.4], collide: 'solid', style: 'barricade' },

  // World 6 — Castle Dash
  { kind: 'wind', id: 'fan', map: 'castle', legacy: 'fan', zone: L.windZones[1], players: 0.2 },
  { kind: 'plate', id: 'plateL', map: 'castle', p: [-10.3, 0, -155.4], size: [2, 2], trigger: { p: [-10.3, 0.6, -155.4], h: [0.95, 0.6, 0.95] }, hold: 0.2, by: 'players', need: 1, latch: false },
  { kind: 'plate', id: 'plateR', map: 'castle', p: [10.3, 0, -155.4], size: [2, 2], trigger: { p: [10.3, 0.6, -155.4], h: [0.95, 0.6, 0.95] }, hold: 0.2, by: 'players', need: 1, latch: false },
  { kind: 'logic', id: 'royalOpen', map: 'castle', op: 'and', inputs: ['plateL', 'plateR'] },
  { kind: 'gate', id: 'royalGate', map: 'castle', p: [0, 1.5, -156.6], s: [11, 3, 0.4], drop: 3.1, time: 0.9, when: 'royalOpen', collide: 'cargo', style: 'portcullis' },
  { kind: 'collect', id: 'castleStamp1', map: 'castle', p: [5, 6.7, -126], item: 'stamp', byArtifact: true },
  { kind: 'collect', id: 'castleStamp2', map: 'castle', p: [5, 4.2, -137.4], item: 'stamp', byArtifact: true },
  { kind: 'collect', id: 'castleStamp3', map: 'castle', p: [5, 1.9, -147.2], item: 'stamp', byArtifact: true },
];

// ---------------------------------------------------------------- per-map data

const cp = (id: number, name: string, min: V3, max: V3, artifact: V3, players: [V3, V3, V3], flag: V3, solve: string[] = []): CheckpointDef & { solve: string[] } => ({
  id,
  name,
  trigger: { min, max },
  artifact,
  players,
  flag,
  solve,
});
const NEVER: V3 = [-999, -999, -999];

const base = {
  course: true,
  islands: [],
  boxes: [],
  mechs: COURSE_MECHS,
  killY: -14,
};

export const DOCK: MapDef = {
  ...base,
  id: 'dock',
  index: 0,
  name: 'Royal Loading Dock',
  sub: 'World 1',
  theme: 'Learn to cooperate',
  music: 'music_main',
  spawn: { artifact: L.spawn.artifact, players: L.spawn.players as [V3, V3, V3] },
  checkpoints: [
    cp(0, 'Royal Loading Dock', NEVER, NEVER, [0, 1.02, 2.5], [[-2.6, 0, 6.5], [0, 0, 7.2], [2.6, 0, 6.5]], [6.5, 0, 6]),
    cp(1, 'Past the Low Arch', [-9.5, -2, -38], [9.5, 6, -29.2], [0, 1.02, -33.5], [[-3, 0, -30.2], [0, 0, -30.0], [1.8, 0, -29.8]], [-6.5, 0, -31], ['dockPlate', 'dockGate']),
  ],
  anchors: [
    { p: [0, 0, 6], cp: 0 },
    { p: [-5, 0, -2], cp: 0 },
    { p: [5, 0, -2], cp: 0 },
    { p: [-3.5, 0, -10.6], cp: 0, req: 'dockGate' },
    { p: [-4.5, 0, -22], cp: 0, req: 'dockGate' },
    { p: [4.5, 0, -21.5], cp: 0, req: 'dockGate' },
    { p: [-4, 0, -31], cp: 1 },
    { p: [0.5, 0, -35.4], cp: 1 },
  ],
  goal: { p: [5.0, 1.1, -34.4], r: 1.9 },
  objectives: [
    {
      text: 'Push the golden object onto the big plate to open the gate',
      tip: 'Walk into it to push. Hold [E] to grab it and pull.',
      done: { sig: 'dockPlate' },
      hint: { p: [0, 1.6, -3.5], text: 'Push it here', progress: 'dockPlate' },
    },
    {
      text: 'Make it LONG [2], then push it under the low arch',
      tip: 'Mind the spinning arm!',
      done: { cp: 1 },
      hint: { p: [0, 4.6, -25], text: 'Only LONG fits' },
      shape: ShapeId.LONG,
    },
    {
      text: 'Make it a CUBE [1], climb inside [F] and hop [Space] onto the dock',
      done: { goal: true },
      hint: { p: [5.0, 3.2, -34.4], text: 'Hop up here' },
      shape: ShapeId.CUBE,
    },
    { text: 'Everyone, climb onto the dock!', done: { not: { goal: true } }, hint: { p: [5.0, 3.2, -34.4], text: 'Goal' } },
  ],
  par: 120,
  bonus: { label: 'Collect all 3 royal stamps', stamps: 3 },
  shortcuts: [{ id: 'archSpring', label: 'Sprang over the arch', min: [-10, 4.2, -29], max: [-2, 20, -24] }],
  longAxisZones: [{ min: [-6, -27.5], max: [6, -18.5], yaw: Math.PI / 2 }],
  intro: {
    goal: 'Bring the golden object to the loading dock.',
    tradeoff: 'CUBE is steady but too tall for the low arch. LONG fits under it, but turns slowly.',
  },
};

export const WINDBRIDGE: MapDef = {
  ...base,
  id: 'windbridge',
  index: 1,
  name: 'Windbridge Cliffs',
  sub: 'World 2',
  theme: 'Control versus speed',
  music: 'music_main',
  musicRate: 1.06,
  spawn: { artifact: [0, 1.02, -34.6], players: [[-2.4, 0, -31.4], [0, 0, -31.0], [1.9, 0, -29.6]] },
  checkpoints: [
    cp(0, 'Windbridge Cliffs', NEVER, NEVER, [0, 1.02, -34.6], [[-2.4, 0, -31.4], [0, 0, -31.0], [1.9, 0, -29.6]], [-6.5, 0, -31]),
    cp(1, 'Windy Cliffs', [-10, -2, -60], [10, 6, -46.6], [-2.0, 1.02, -50], [[-4, 0, -47.4], [1, 0, -47.2], [4, 0, -48]], [6.8, 0, -47.5]),
    cp(2, 'Windbridge Landing', [-10, -2, -81], [10, 6, -66.8], [-3.4, 1.02, -68.2], [[-5.6, 0, -66.6], [0.6, 0, -67.2], [4.5, 0, -70]], [6.5, 0, -68.5], ['receiver', 'drawbridge']),
  ],
  anchors: [
    { p: [-3, 0, -31], cp: 0 },
    { p: [3, 0, -30.2], cp: 0 },
    { p: [-2, 0, -48], cp: 1 },
    { p: [3, 0, -54], cp: 1 },
    { p: [6.3, 0, -59], cp: 1 },
    { p: [6.3, 0, -66.6], cp: 1 },
    { p: [-3, 0, -70], cp: 2 },
    { p: [4, 0, -76], cp: 2 },
  ],
  goal: { p: [-3.4, 0, -78.1], r: 2.2 },
  objectives: [
    {
      text: 'Push it over the wobbly bridge. Keep it in the middle!',
      tip: 'The wind pushes it to the left. CUBE [1] barely moves in the wind.',
      done: { cp: 1 },
      hint: { p: [0, 2.2, -41.5], text: 'Wobbly bridge' },
    },
    {
      text: 'Make it LONG [2] and slide it into the glowing slot',
      tip: 'Too windy? Turn the wind wheel [Q]. The wind moves to the next cliff.',
      done: { sig: 'receiver' },
      hint: { p: [-2.5, 1.8, -60.6], text: 'LONG slot', progress: 'receiver', marks: [[4.8, 0, -56.8]] },
      shape: ShapeId.LONG,
    },
    { text: 'Push it over the drawbridge', done: { cp: 2 }, hint: { p: [-2.5, 1.6, -63.5], text: 'Drawbridge' } },
    {
      text: 'Wait behind the stone walls when the wind blows, then push on to the ring',
      done: { goal: true },
      hint: { p: [-3.4, 2.6, -78.1], text: 'Goal' },
    },
    { text: 'Everyone into the ring!', done: { not: { goal: true } }, hint: { p: [-3.4, 2.6, -78.1], text: 'Goal' } },
  ],
  par: 150,
  bonus: { label: 'Collect all 3 royal stamps', stamps: 3 },
  longAxisZones: [{ min: [-12, -66.5], max: [12, -44.5], yaw: 0 }],
  intro: {
    goal: 'Get the golden object across the windy cliffs.',
    tradeoff: 'Only LONG fits the slot, but the wind spins it around. CUBE barely feels the wind.',
  },
};

export const CLOCKWORK: MapDef = {
  ...base,
  id: 'clockwork',
  index: 2,
  name: 'The Crooked Clockwork Tower',
  sub: 'World 3',
  theme: 'Stability versus freedom',
  music: 'music_alt',
  musicRate: 0.92,
  spawn: { artifact: [2.2, 1.02, -78.4], players: [[0.8, 0, -75.4], [3.0, 0, -75.2], [5.2, 0, -75.6]] },
  checkpoints: [
    cp(0, 'Clockwork Tower', NEVER, NEVER, [2.2, 1.02, -78.4], [[0.8, 0, -75.4], [3.0, 0, -75.2], [5.2, 0, -75.6]], [6.5, 0, -68.5]),
    cp(1, 'Tower Base', [-10, -2, -104], [10, 6, -87.6], [-2, 1.02, -92], [[-4, 0, -89.4], [0, 0, -89.2], [3.5, 0, -89.6]], [-7.5, 0, -90]),
  ],
  anchors: [
    { p: [2, 0, -75.5], cp: 0 },
    { p: [5, 0, -78.5], cp: 0 },
    { p: [-3, 0, -90], cp: 1 },
    { p: [-6, 0, -98], cp: 1 },
    { p: [4, 0, -93], cp: 1 },
    { p: [-4, 8, -108], cp: 1, req: 'lift' },
    { p: [4, 8, -110], cp: 1, req: 'lift' },
  ],
  goal: { p: [4.4, 8, -108.6], r: 2.6 },
  objectives: [
    {
      text: 'One player holds [Q] on the clock center to stop the hand. Push it across!',
      tip: 'Stop the hand when it points across the gap.',
      done: { cp: 1 },
      hint: { p: [0, 1.6, -84], text: 'Hold [Q] here' },
    },
    {
      text: 'Make it TALL [3]. Two players hold it [E] while the third pushes it into the lever',
      done: { sig: 'lever' },
      hint: { p: [-4.5, 5.8, -103.5], text: 'Lever' },
      shape: ShapeId.TALL,
    },
    {
      text: 'Push it onto the lift. Everyone gets on, then hold [Q] at the crank',
      tip: 'Faster: one player bounces up on the spring pad and turns the lift brake off [Q].',
      done: { sig: 'lift' },
      hint: { p: [4.6, 3.4, -100.9], text: 'Lift' },
    },
    { text: 'Push it into the ring on top of the tower', done: { goal: true }, hint: { p: [4.4, 10.6, -108.6], text: 'Goal' } },
    { text: 'Everyone into the ring!', done: { not: { goal: true } }, hint: { p: [4.4, 10.6, -108.6], text: 'Goal' } },
  ],
  par: 150,
  bonus: { label: 'Collect all 3 royal stamps', stamps: 3 },
  longAxisZones: [],
  intro: {
    goal: 'Take the golden object up the clock tower.',
    tradeoff: 'TALL reaches the high lever, but it falls over unless two players hold it [E].',
  },
};

export const CASTLE: MapDef = {
  ...base,
  id: 'castle',
  index: 5,
  name: 'Castle Dash',
  sub: 'World 6',
  theme: 'Everything you’ve learned',
  music: 'music_alt',
  musicRate: 1.0,
  spawn: { artifact: [-3, 9.02, -109.5], players: [[-6, 8, -107], [0, 8, -107], [-3, 8, -113]] },
  checkpoints: [
    cp(0, 'Top of the Tower', NEVER, NEVER, [-3, 9.02, -109.5], [[-6, 8, -107], [0, 8, -107], [-3, 8, -113]], [-7.5, 8, -106]),
    cp(1, 'Halfway Landing', [-10.5, 2, -137.5], [-1.5, 9, -129.5], [-6, 5.52, -133.5], [[-8, 4.5, -131], [-4, 4.5, -131], [-6, 4.5, -136]], [-9.2, 4.5, -130.4]),
    cp(2, 'Royal Plaza', [-12, -2, -170], [12, 6, -152.8], [0, 1.02, -154.6], [[-3, 0, -153.6], [3, 0, -153.6], [0, 0, -153.2]], [-11, 0, -158]),
  ],
  anchors: [
    { p: [-4, 8, -108], cp: 0 },
    { p: [4, 8, -110], cp: 0 },
    { p: [-6, 4.5, -133.5], cp: 0 },
    { p: [-6, 0, -156], cp: 0 },
    { p: [5, 0, -156], cp: 0 },
    { p: [-8.5, 0, -160], cp: 2 },
    { p: [8.5, 0, -160], cp: 2 },
  ],
  goal: { p: L.goal.p, r: L.goal.r },
  objectives: [
    {
      text: 'Pick a road down: the SAFE ramp (left) or the fast CHAOS chute (right)',
      tip: 'ROUND [4] races down the chute, but the big fan can blow it off!',
      done: { cp: 2 },
      hint: { p: [-0.5, 10.2, -114.6], text: 'Pick a road', marks: [[-6, 8, -118], [5, 8, -118]] },
    },
    {
      text: 'Two players stand on the plates to open the gate. The third pushes it in',
      done: { goal: true },
      hint: { p: [0, 3.4, -156.6], text: 'Royal gate', marks: [[-10.3, 0, -155.4], [10.3, 0, -155.4]] },
    },
    { text: 'Everyone into the golden ring!', done: { not: { goal: true } }, hint: { p: [0, 3.2, -161], text: 'Goal' } },
  ],
  par: 140,
  bonus: { label: 'Collect all 3 stamps on the chaos chute', stamps: 3 },
  shortcuts: [{ id: 'chute', label: 'Took the chaos chute', min: [2, 0, -142], max: [8.5, 12, -124] }],
  longAxisZones: [],
  intro: {
    goal: 'Deliver the golden object to the King!',
    tradeoff: 'The SAFE ramp is slow but sure. The CHAOS chute is fast, but the fan can blow you off.',
  },
};
