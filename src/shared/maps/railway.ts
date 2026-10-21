// World 5 — Sky Railway Disaster: coordination under pressure. A standalone map at x = -70: load the cart, pick a
// route at the junction (slow and steady, or the express buffer that catapults the cargo), then crane it up the mesa.
import { chamferIsland, type BoxDef, type V3 } from '../level';
import { ShapeId } from '../shapes';
import type { MapDef, MechDef } from './types';

const X = -70;
const v = (x: number, y: number, z: number): V3 => [X + x, y, z];

/** Ramp box whose top surface runs from a to b along -Z (same construction as the course ramps). */
function ramp(id: string, a: V3, b: V3, width: number): BoxDef {
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const L = Math.hypot(dy, dz);
  const theta = Math.atan2(dy, -dz);
  const thick = 0.8;
  const up: V3 = [0, Math.cos(theta), Math.sin(theta)];
  const mid: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  return { id, p: [mid[0], mid[1] - (up[1] * thick) / 2, mid[2] - (up[2] * thick) / 2], s: [width, thick, L + 0.06], rot: [theta, 0, 0], mat: 'path', tag: 'ramp' };
}

const islands = [
  chamferIsland('R1', X + 0, 0, 9, 7, [2, 2, 2, 2], 0, 2, 10, 501),
  chamferIsland('R2', X + 3, -33, 7, 6, [2, 2, 2, 2], 0, 2, 10, 502),
  chamferIsland('R3', X - 10, -53, 7.5, 6, [2, 2, 2, 2], 0, 2, 10, 503),
  chamferIsland('R4', X - 1, -63, 6, 5, [2, 2, 2, 2], 6, 7, 10, 504, 'stone'),
];

const BED: V3 = [2.5, 0.5, 4.6];
const FLOOR = 0.55;

const boxes: BoxDef[] = [
  // loading ramp up into the open back of the cart at the Grand Station
  ramp('loadRamp', v(3.5, 0, 2.8), v(3.5, FLOOR, -0.42), 3.4),
  // signal box on the junction (stamp on its roof, reached from the cap spring)
  { id: 'signalBox', p: v(8.4, 1.3, -37.6), s: [2.0, 2.6, 2.0], mat: 'invisible', vis: 'signalBox', tag: 'ledge' },
  // crane foundation on the yard
  { id: 'cranePad', p: v(-9.16, 0.2, -57.14), s: [2.4, 0.4, 2.4], mat: 'invisible', vis: 'cranePad', tag: 'ledge' },
];

const mechs: MechDef[] = [
  // Puzzle A — the cargo cart: push the artifact up the ramp into the bed, pull the depart lever
  { kind: 'switch', id: 'departA', p: v(6.6, 0, -1.4), radius: 1.6, mode: 'toggle', label: 'Depart', states: ['waiting', 'all aboard!'], style: 'lever' },
  // Puzzle B — the switch junction: the safe loop to the crane yard, or the express buffer that flings the cargo
  { kind: 'switch', id: 'junction', p: v(8.0, 0, -30.2), radius: 1.6, mode: 'select', positions: 2, label: 'Junction', states: ['SAFE loop → crane yard', 'EXPRESS → catapult!'], style: 'lever' },
  { kind: 'switch', id: 'departB', p: v(7.4, 0, -34.0), radius: 1.5, mode: 'toggle', label: 'Depart', states: ['waiting', 'all aboard!'], style: 'lever' },
  {
    kind: 'cart',
    id: 'cart',
    track: [v(3.5, 0, -3.0), v(3.5, 0, -33.0)],
    branches: [
      [v(3.5, 0, -39.6), v(1.4, 0, -43.6), v(-3.0, 0, -46.8), v(-6.6, 0, -48.6), v(-9.5, 0, -50.0)],
      [v(3.5, 0, -40.0), v(3.5, 1.4, -46.0)],
    ],
    junction: 'junction',
    departs: ['departA', 'departB'],
    speed: 4.5,
    branchSpeed: [0.8, 1.7],
    buffers: [1],
    bed: BED,
    floor: FLOOR,
  },
  // the express buffer catapult (fires while the cart's signal pulses at the buffer)
  { kind: 'spring', id: 'catapult', p: v(3.5, 1.4 + FLOOR, -46.0), size: [BED[0], BED[2]], launch: [0, 15, -11.6], playerLaunch: [0, 15, -11.2], affects: 'all', cooldown: 2.0, when: 'cart', style: 'pad' },
  // Puzzle C — the crane: hold Q at the control to lift the artifact out of the cart onto the mesa (let go mid-swing to fling)
  { kind: 'crane', id: 'crane', pivot: v(-9.16, 0, -57.14), radius: 7.15, hookTop: 10.2, pickupY: 2.75, dropY: 8.35, from: 1.618, to: -0.656, control: v(-13.0, 0, -54.6), cycle: 12 },
  { kind: 'switch', id: 'craneLabel', p: v(-13.0, 0, -54.6), radius: 1.5, mode: 'hold', label: 'Crane', states: ['idle', 'working'], style: 'crank' },
  // couriers bounce up the mesa
  { kind: 'spring', id: 'mesaSpring', p: v(-4.6, 0, -53.6), size: [1.6, 1.6], launch: [0, 0, 0], playerLaunch: [0, 16.5, -5.0], affects: 'players', cooldown: 1.0, style: 'pad' },
  // royal stamps: jump for one while riding, one on the signal box roof, one on the mesa's lookout
  { kind: 'collect', id: 'railStamp1', p: v(3.5, 2.95, -17), item: 'stamp' },
  { kind: 'spring', id: 'boxSpring', p: v(9.6, 0, -35.2), size: [1.2, 1.2], launch: [0, 0, 0], playerLaunch: [-0.9, 11.5, -1.9], affects: 'players', cooldown: 1.0, style: 'pad' },
  { kind: 'collect', id: 'railStamp2', p: v(8.4, 3.5, -37.6), item: 'stamp' },
  { kind: 'collect', id: 'railStamp3', p: v(4.0, 7.0, -66.6), item: 'stamp' },
];

export const RAILWAY: MapDef = {
  id: 'railway',
  index: 4,
  name: 'Sky Railway Disaster',
  sub: 'World 5',
  theme: 'Coordination under pressure',
  music: 'music_alt',
  musicRate: 1.08,
  course: false,
  islands,
  boxes,
  spawn: { artifact: v(-2.2, 1.02, 1.2), players: [v(-4.6, 0, 4.6), v(-2.2, 0, 5.2), v(0.2, 0, 4.6)] },
  checkpoints: [
    { id: 0, name: 'Grand Station', trigger: { min: v(-99, -99, -99), max: v(-98, -98, -98) }, artifact: v(-2.2, 1.02, 1.2), players: [v(-4.6, 0, 4.6), v(-2.2, 0, 5.2), v(0.2, 0, 4.6)], flag: v(-7.2, 0, 3.6), cart: { ridden: 0 } },
    { id: 1, name: 'Junction', trigger: { min: v(-4, -1, -39), max: v(10, 5, -27.4) }, artifact: v(3.5, FLOOR + 1.05, -33.6), players: [v(-1.6, 0, -28.4), v(0.4, 0, -28.2), v(6.4, 0, -31.0)], flag: v(-2.6, 0, -36.4), cart: { ridden: 1 } },
    { id: 2, name: 'Crane Yard', trigger: { min: v(-17.5, -1, -59), max: v(-2.5, 4, -47) }, artifact: v(-9.5, 1.6, -50.0), players: [v(-12.4, 0, -52.0), v(-13.2, 0, -54.6), v(-6.4, 0, -51.4)], flag: v(-15.4, 0, -49.6), cart: { ridden: 2, branch: 0 } },
    { id: 3, name: 'Delivery Mesa', trigger: { min: v(-7, 5, -68), max: v(5, 12, -58) }, artifact: v(-1, 7.02, -61.0), players: [v(-3, 6, -59.4), v(-1, 6, -59.2), v(1, 6, -59.4)], flag: v(-5.4, 6, -59.4), cart: { ridden: 2, branch: 0 } },
  ],
  anchors: [
    { p: v(-2, 0, 4), cp: 0 },
    { p: v(-5, 0, -2), cp: 0 },
    { p: v(0.4, 0, -29), cp: 1 },
    { p: v(6, 0, -36), cp: 1 },
    { p: v(-12, 0, -51), cp: 2 },
    { p: v(-8, 0, -55), cp: 2 },
    { p: v(-3, 6, -60), cp: 2 },
    { p: v(2, 6, -62), cp: 3 },
  ],
  goal: { p: v(-0.5, 6, -64.4), r: 2.4 },
  mechs,
  objectives: [
    { text: 'Push the artifact up the ramp into the cart, then pull the Depart lever (Q) — hop in!', done: { cp: 1 }, hint: { p: v(3.5, 2.6, -3), text: 'Cart' } },
    { text: 'Junction: set the points (Q) — SAFE loop or EXPRESS catapult — and depart', done: { any: [{ cp: 2 }, { cp: 3 }] }, hint: { p: v(8.0, 2.4, -30.2), text: 'Points' } },
    { text: 'Crane it up the mesa: hold Q at the crane (let go mid-swing to fling it!)', done: { cp: 3 }, hint: { p: v(-13.0, 2.6, -54.6), text: 'Crane' } },
    { text: 'Deliver it to the depot ring', done: { goal: true }, hint: { p: v(-0.5, 8.6, -64.4), text: 'Deliver' } },
    { text: 'Everyone into the ring!', done: { not: { goal: true } }, hint: { p: v(-0.5, 8.6, -64.4), text: 'Deliver' } },
  ],
  par: 140,
  bonus: { label: 'Collect all 3 royal stamps', stamps: 3 },
  shortcuts: [{ id: 'express', label: 'Rode the express catapult', min: v(-2, 6, -58), max: v(9, 20, -48) }],
  killY: -14,
  longAxisZones: [],
  bounds: { min: v(-45, -30, -110), max: v(45, 60, 40) },
  camera: { pitch: 41, lift: 7, near: 13, far: 30, ahead: 3.2, fov: 46 },
};

export { ShapeId };
