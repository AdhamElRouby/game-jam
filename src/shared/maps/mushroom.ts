// World 4 — Mushroom Mayhem: momentum versus precision. A standalone map (its own islands), placed at x = +70 so it never
// overlaps the original course's world-space decoration.
import { chamferIsland, type BoxDef, type V3 } from '../level';
import { ShapeId } from '../shapes';
import type { MapDef, MechDef } from './types';

const X = 70; // world offset of this map
const v = (x: number, y: number, z: number): V3 => [X + x, y, z];

const islands = [
  chamferIsland('M1', X + 0, 0, 9, 8.5, [3, 3, 2, 2], 0, 2, 10, 401),
  chamferIsland('M2', X + 0, -20.5, 8, 7.5, [2, 2, 2.5, 2.5], 5, 6, 12, 402),
  chamferIsland('M3', X + 2, -42, 9, 9, [2, 3, 3, 2], 5, 2.5, 12, 403),
  chamferIsland('M4', X - 6, -59.5, 3.2, 2.5, [1, 1, 1, 1], 4, 2, 8, 404),
  chamferIsland('M5', X + 0, -78, 10, 10, [3, 3, 3, 3], 2, 2.5, 12, 405),
];

const boxes: BoxDef[] = [
  // log bridge from the cap terrace to the grove (+ rope rails)
  { id: 'mBridge-deck', p: v(2, 4.8, -30.5), s: [4.4, 0.4, 5.4], mat: 'plank', tag: 'bridge' },
  { id: 'mBridge-rail-1', p: v(2 - 2.35, 5.6, -30.5), s: [0.3, 1.2, 5.4], mat: 'rail', tag: 'rail' },
  { id: 'mBridge-rail1', p: v(2 + 2.35, 5.6, -30.5), s: [0.3, 1.2, 5.4], mat: 'rail', tag: 'rail' },
  // a soft rim along the back of the cap terrace catches a launched artifact that slides on
  { id: 'mRim', p: v(-3.2, 5.3, -27.7), s: [9.4, 0.6, 0.5], mat: 'invisible', vis: 'shroomRim', tag: 'curb' },
  // tall mushroom pedestals: a stamp perch on the terrace, giant stems in the grove (obstacles you go round)
  { id: 'mPerch', p: v(-5.8, 8.6, -22.4), s: [2.6, 0.5, 2.6], mat: 'invisible', vis: 'shroomCap', tag: 'ledge' },
  { id: 'mStem1', p: v(6.5, 6.9, -37.5), s: [1.5, 3.8, 1.5], mat: 'invisible', vis: 'shroomStem', tag: 'stem' },
  { id: 'mStem2', p: v(-2.8, 6.9, -47.6), s: [1.4, 3.8, 1.4], mat: 'invisible', vis: 'shroomStem', tag: 'stem' },
  { id: 'mStem3', p: v(8.4, 6.9, -46.2), s: [1.2, 3.8, 1.2], mat: 'invisible', vis: 'shroomStem', tag: 'stem' },
];

const mechs: MechDef[] = [
  // Puzzle A — the launch mushroom: CUBE lands true, ROUND overshoots, LONG/TALL bounce off the cliff
  { kind: 'spring', id: 'launchShroom', p: v(0, 0, -6.4), size: [3.0, 3.0], launch: [0, 15.5, -7.2], playerLaunch: [0, 15.5, -6.4], affects: 'all', cooldown: 1.6, shapeScale: [1, 0.9, 0.85, 1.05], offsetKick: 1.4, style: 'mushroom' },
  { kind: 'spring', id: 'hopCapL', p: v(-5.6, 0, -5.4), size: [1.6, 1.6], launch: [0, 0, 0], playerLaunch: [0, 15.5, -7.0], affects: 'players', cooldown: 0.8, style: 'mushroom' },
  { kind: 'spring', id: 'hopCapR', p: v(5.6, 0, -5.4), size: [1.6, 1.6], launch: [0, 0, 0], playerLaunch: [0, 15.5, -7.0], affects: 'players', cooldown: 0.8, style: 'mushroom' },
  { kind: 'spring', id: 'perchCap', p: v(-5.8, 5, -17.4), size: [1.4, 1.4], launch: [0, 0, 0], playerLaunch: [0, 12.8, -4.6], affects: 'players', cooldown: 0.8, style: 'mushroom' },
  { kind: 'collect', id: 'shroomStamp1', p: v(-5.8, 9.6, -22.4), item: 'mushroom' },

  // Puzzle B — the slippery grove: glowing moss, giant stems and a puffball that clears the path every few seconds
  { kind: 'slip', id: 'moss1', min: v(-3.6, 4, -38.2), max: v(4.4, 7, -33.2), grip: 0.28, drag: 0.3 },
  { kind: 'slip', id: 'moss2', min: v(-6.8, 4, -46.0), max: v(3.2, 7, -40.4), grip: 0.28, drag: 0.3 },
  { kind: 'puffer', id: 'puffball', p: v(-0.6, 5, -43.6), radius: 4.6, period: 7.5, windup: 1.6, offset: 2.0, impulse: 5.5 },
  { kind: 'collect', id: 'shroomStamp2', p: v(-0.6, 8.1, -43.6), item: 'mushroom' },

  // Puzzle C — the Giant Bounce: aim it (Q lever), pump it (hold Q) and the artifact flies straight to the village
  { kind: 'switch', id: 'aim', p: v(9.6, 5, -42.8), radius: 1.6, mode: 'select', positions: 3, label: 'Bounce aim', states: ['aim: LEFT (the hollow)', 'aim: VILLAGE', 'aim: RIGHT (the void!)'], style: 'lever' },
  { kind: 'switch', id: 'pump', p: v(9.6, 5, -46.6), radius: 1.6, mode: 'pump', time: 1.6, label: 'Bounce pump', states: ['', 'BOING!'], style: 'crank' },
  {
    kind: 'spring',
    id: 'giantBounce',
    p: v(5.0, 5, -47.8),
    size: [3.4, 3.4],
    launch: [-0.8, 15, -12.9],
    playerLaunch: [-0.8, 14, -12.0],
    affects: 'all',
    cooldown: 1.0,
    when: 'pump',
    aim: {
      switch: 'aim',
      launches: [
        [-8.1, 11.5, -8.6],
        [-0.8, 15, -12.9],
        [6.5, 13, -9.5],
      ],
    },
    shapeScale: [1, 0.92, 0.9, 1.0],
    offsetKick: 0.8,
    style: 'bigmushroom',
  },
  { kind: 'collect', id: 'shroomStamp3', p: v(4.3, 12.3, -58.8), item: 'mushroom', byArtifact: true },
  // the long way: two bobbing mushroom caps carry the team down to the village
  { kind: 'mover', id: 'cap1', s: [3.4, 0.5, 3.4], path: [v(-5.6, 5.0, -52.7), v(-5.8, 4.0, -55.3)], speed: 0.9, mode: 'pingpong', pause: 2.2, style: 'cap' },
  { kind: 'mover', id: 'cap2', s: [3.4, 0.5, 3.4], path: [v(-5.8, 4.0, -63.7), v(-4.6, 2.0, -66.3)], speed: 0.9, mode: 'pingpong', pause: 2.2, offset: 0.5, style: 'cap' },
];

export const MUSHROOM: MapDef = {
  id: 'mushroom',
  index: 3,
  name: 'Mushroom Mayhem',
  sub: 'World 4',
  theme: 'Momentum versus precision',
  music: 'music_main',
  musicRate: 1.12,
  course: false,
  islands,
  boxes,
  spawn: { artifact: v(0, 1.02, 1.0), players: [v(-2.6, 0, 5.2), v(0, 0, 5.8), v(2.6, 0, 5.2)] },
  checkpoints: [
    { id: 0, name: 'Spore Meadow', trigger: { min: v(-99, -99, -99), max: v(-98, -98, -98) }, artifact: v(0, 1.02, 1.0), players: [v(-2.6, 0, 5.2), v(0, 0, 5.8), v(2.6, 0, 5.2)], flag: v(7.2, 0, 4) },
    { id: 1, name: 'Cap Terrace', trigger: { min: v(-8, 3, -28), max: v(8, 12, -13.4) }, artifact: v(1.5, 6.02, -21), players: [v(-1, 5, -16.4), v(1.5, 5, -16.2), v(4, 5, -16.4)], flag: v(6.6, 5, -15.4) },
    { id: 2, name: 'Glowcap Grove', trigger: { min: v(-7, 3, -51), max: v(11, 12, -34.4) }, artifact: v(2, 6.02, -36.6), players: [v(0, 5, -34.6), v(2, 5, -34.4), v(4, 5, -34.6)], flag: v(-5.4, 5, -35.4) },
    { id: 3, name: 'Mushroom Village', trigger: { min: v(-10, 0, -88), max: v(10, 8, -68.6) }, artifact: v(0, 3.02, -72), players: [v(-2, 2, -70.2), v(0, 2, -70), v(2, 2, -70.2)], flag: v(-7.4, 2, -71) },
  ],
  anchors: [
    { p: v(0, 0, 4), cp: 0 },
    { p: v(-4, 0, -2), cp: 0 },
    { p: v(4, 0, -2), cp: 0 },
    { p: v(-2, 5, -17), cp: 1 },
    { p: v(3, 5, -24), cp: 1 },
    { p: v(2, 5, -35.5), cp: 2 },
    { p: v(6, 5, -42), cp: 2 },
    { p: v(-4, 5, -49.5), cp: 2 },
    { p: v(-6, 4, -59.5), cp: 2 },
    { p: v(0, 2, -71), cp: 3 },
    { p: v(-4, 2, -78), cp: 3 },
  ],
  goal: { p: v(0, 2, -80), r: 3.0 },
  mechs,
  objectives: [
    { text: 'Push the artifact onto the big mushroom — couriers bounce on the small caps', done: { cp: 1 }, hint: { p: v(0, 2.6, -6.4), text: 'BOING' } },
    { text: 'Over the bridge into the slippery grove — mind the puffball', done: { cp: 2 } },
    { text: 'Aim + pump the Giant Bounce (Q) to fling it to the village — or ride the bobbing caps', done: { goal: true }, hint: { p: v(5.0, 7.4, -47.8), text: 'Giant Bounce' } },
    { text: 'Everyone into the ring!', done: { not: { goal: true } }, hint: { p: v(0, 4.6, -80), text: 'Deliver' } },
  ],
  par: 150,
  bonus: { label: 'Collect all 3 golden mushrooms', stamps: 3 },
  shortcuts: [{ id: 'giantBounce', label: 'Flew over with the Giant Bounce', min: v(1.5, 9, -64), max: v(14, 30, -54) }],
  killY: -14,
  longAxisZones: [],
  bounds: { min: v(-40, -30, -130), max: v(40, 60, 40) },
  camera: { pitch: 40, lift: 7, near: 13, far: 30, ahead: 3.5, fov: 46 },
};
