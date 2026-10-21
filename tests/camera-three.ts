// Three real Chrome sessions in one room: every player's camera is their own. Each turns and zooms independently,
// WASD follows each player's own camera, one player rides in first person while the other two keep their third-person
// view of the artifact, and a reload of one player leaves the others' cameras alone.
// npx tsx tests/camera-three.ts [baseUrl] [outPrefix]   (dev server)
import { chromium, type Page } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? 'tests/out/cam3';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const names = ['Ada', 'Bo', 'Cy'];
const pages: Page[] = [];
const errors: string[] = [];
let fails = 0;
const check = (name: string, ok: boolean, info = '') => {
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
};
const f2 = (n: number) => n.toFixed(2);
for (let i = 0; i < 3; i++) {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 600 } });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(`${names[i]}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`${names[i]}: [pageerror] ${e.message}`));
  await page.goto(base + '/?dev');
  pages.push(page);
}
const sleep = (ms: number) => pages[0].waitForTimeout(ms);
const ev = async <T>(p: Page, js: string): Promise<T> => JSON.parse((await p.evaluate(`JSON.stringify(${js})`)) as string) as T;
interface Cam {
  view: string;
  yaw: number;
  yawT: number;
  dist: number;
  fpv: boolean;
  pos: number[];
  inSolid: boolean;
}
const cam = (p: Page) => ev<Cam>(p, 'window.__SH_CAMSTATE()');
const snap = (p: Page) => ev<{ ph: string; pi: number; ar: number[]; pl: number[][]; t: number }>(p, 'window.__SH_NET.latest()');
const you = (p: Page) => ev<number>(p, 'window.__SH_NET.lobby.you');
async function drag(p: Page, dx: number, dy = 0) {
  await p.mouse.move(480, 300);
  await p.mouse.down({ button: 'right' });
  const n = 10;
  for (let i = 1; i <= n; i++) await p.mouse.move(480 + (dx * i) / n, 300 + (dy * i) / n);
  await p.mouse.up({ button: 'right' });
}

await sleep(1500);
for (let i = 0; i < 3; i++) {
  await pages[i].fill('input', names[i]);
  await pages[i].getByRole('button', { name: 'PLAY', exact: true }).click();
  await pages[i].waitForTimeout(400);
}
for (const p of pages.slice(0, 2)) await p.getByRole('button', { name: /Royal Loading Dock/ }).click();
for (let k = 0; k < 120; k++) {
  const ph = await Promise.all(pages.map(async (p) => (await snap(p))?.ph));
  if (ph.every((x) => x === 'playing')) break;
  await sleep(150);
}
await sleep(1200);
const slots = await Promise.all(pages.map(you));
check('three players in one room, all playing', new Set(slots).size === 3, `slots ${slots.join(',')}`);
const P = (slot: number) => pages[slots.indexOf(slot)];

// ---------------------------------------------------------------- each camera turns on its own input only
await drag(P(0), 330); // ~ -0.8 rad: turn right
await drag(P(1), -330); // ~ +0.8 rad: turn left
await P(2).mouse.move(480, 300);
await P(2).mouse.wheel(0, 300); // zoom out, no turn
await sleep(400);
let cams = await Promise.all([0, 1, 2].map((s) => cam(P(s))));
check('player 1 turned right (only them)', cams[0].yaw < -0.6, `yaw ${f2(cams[0].yaw)}`);
check('player 2 turned left (only them)', cams[1].yaw > 0.6, `yaw ${f2(cams[1].yaw)}`);
check('player 3 did not turn, but zoomed out', Math.abs(cams[2].yaw) < 1e-6 && cams[2].dist > 12, `yaw ${f2(cams[2].yaw)} dist ${f2(cams[2].dist)}`);

// ---------------------------------------------------------------- WASD follows each player's own camera
for (const s of [0, 1, 2]) {
  const p = P(s);
  const c = await cam(p);
  const a = (await snap(p)).pl.find((x) => x[0] === s)!;
  await p.keyboard.down('KeyW');
  await p.waitForTimeout(500);
  await p.keyboard.up('KeyW');
  await p.waitForTimeout(250);
  const b = (await snap(p)).pl.find((x) => x[0] === s)!;
  const dx = b[1] - a[1], dz = b[3] - a[3];
  const L = Math.hypot(dx, dz) || 1;
  const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
  check(`player ${s + 1}: W walks where their own camera faces`, L > 1 && (dx * fx + dz * fz) / L > 0.85, `moved (${f2(dx)}, ${f2(dz)}) facing (${f2(fx)}, ${f2(fz)})`);
}
cams = await Promise.all([0, 1, 2].map((s) => cam(P(s))));
check('no camera inside level geometry', cams.every((c) => !c.inSolid));

// ---------------------------------------------------------------- one rides in first person, the others watch it
const pilot = P(1);
await pilot.evaluate(`window.__SH_NET.dev({ art: [0, 1.1, 0.5] })`);
await sleep(500);
await pilot.evaluate(`window.__SH_NET.dev({ me: [0, 0, 2.3] })`);
await P(0).evaluate(`window.__SH_NET.dev({ me: [-4, 0, 5] })`);
await P(2).evaluate(`window.__SH_NET.dev({ me: [4, 0, 5] })`);
await sleep(700);
await pilot.keyboard.press('KeyF');
for (let k = 0; k < 40; k++) {
  if ((await cam(pilot)).fpv) break;
  await sleep(100);
}
await sleep(300);
cams = await Promise.all([0, 1, 2].map((s) => cam(P(s))));
const s1 = await snap(P(0));
check('the rider sees first person from inside', cams[1].view === 'fp' && cams[1].fpv, `view ${cams[1].view}`);
check('the others keep their third-person view of the artifact', cams[0].view === 'orbit' && !cams[0].fpv && cams[2].view === 'orbit' && !cams[2].fpv);
check('everyone sees who is inside', s1.pi === 1);
for (const s of [0, 1, 2]) await P(s).screenshot({ path: `${out}-ride-${s}.png` });
// the rider turns and drives; the others' cameras don't move with it
const before = await Promise.all([0, 2].map((s) => cam(P(s))));
await pilot.evaluate(`window.__SH_LOOK.turn(${(await cam(pilot)).yawT - Math.PI}, 0)`); // look toward +Z
await sleep(300);
const a0 = (await snap(pilot)).ar;
await pilot.keyboard.down('KeyW');
await sleep(1000);
await pilot.keyboard.up('KeyW');
await sleep(300);
const a1 = (await snap(pilot)).ar;
const after = await Promise.all([0, 2].map((s) => cam(P(s))));
check('the rider drives toward their own view (+Z)', a1[2] - a0[2] > 0.6, `moved (${f2(a1[0] - a0[0])}, ${f2(a1[2] - a0[2])})`);
check("the others' camera headings are untouched", before.every((c, i) => Math.abs(c.yaw - after[i].yaw) < 1e-6));
// shape change from inside: everyone sees it, the rider stays in first person
await pilot.keyboard.press('Digit4');
await sleep(1500);
const shapes = await Promise.all(pages.map(async (p) => (await snap(p)).ar[7]));
const rc = await cam(pilot);
check('shape change from inside reaches everyone', shapes.every((x) => x === 3), `shapes ${shapes.join(',')}`);
check('the rider is still in first person after the shift', rc.fpv);
for (const s of [0, 1, 2]) await P(s).screenshot({ path: `${out}-round-${s}.png` });
// identical artifact on every screen (a snapshot time all three received)
const lists = (await Promise.all(pages.map((p) => p.evaluate(`JSON.stringify(window.__SH_NET.snaps.slice(-20).map((s) => [s.t, s.ar]))`)))).map((x) => JSON.parse(x as string)) as [number, number[]][][];
const common = lists[0].map((x) => x[0]).filter((t) => lists.every((l) => l.some((y) => y[0] === t)));
const tt = common[common.length - 1];
const same = lists.map((l) => JSON.stringify(l.find((y) => y[0] === tt)?.[1]));
check('identical artifact state on all three clients', tt !== undefined && same.every((x) => x === same[0]), `t=${tt}`);

// ---------------------------------------------------------------- a reload of one player leaves the others alone
await pilot.keyboard.press('KeyF');
await sleep(1200);
const keep = await Promise.all([0, 1].map((s) => cam(P(s))));
await P(2).reload();
for (let k = 0; k < 80; k++) {
  const m = await P(2).evaluate(`window.__SH_CAMSTATE && window.__SH_NET.latest() ? window.__SH_CAMSTATE().mode : null`);
  if (m === 'play') break;
  await sleep(200);
}
for (let k = 0; k < 60; k++) {
  const ph = (await snap(P(0)))?.ph;
  if (ph === 'playing') break;
  await sleep(200);
}
await sleep(1200);
const c2 = await cam(P(2));
const kept = await Promise.all([0, 1].map((s) => cam(P(s))));
check('reloaded player is back with a working third-person camera', c2.view === 'orbit' && !c2.inSolid);
check("the others' cameras kept their own headings through the reconnect", keep.every((c, i) => Math.abs(c.yawT - kept[i].yawT) < 1e-6));

console.log(errors.length ? `errors:\n  ${errors.slice(0, 10).join('\n  ')}` : 'no console errors');
check('no page errors', errors.length === 0);
console.log(fails ? `\n${fails} check(s) FAILED` : '\nall three-player camera checks passed');
await browser.close();
process.exit(fails ? 1 : 0);
