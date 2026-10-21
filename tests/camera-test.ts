// Per-player camera + first person in a real browser (solo dev room): mouse / touchpad turning and zoom, WASD relative
// to the camera, collision with level geometry, smooth follow, first person in every shape (look, drive, LONG's turn
// direction, ROUND rolling), the chase view, hopping out, falling, the artifact falling with a pilot, a level change
// and a page reload (rejoin). npx tsx tests/camera-test.ts [baseUrl]   (needs a dev server)
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:5173';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errors: string[] = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

let fails = 0;
const check = (name: string, ok: boolean, info = '') => {
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
};
const f2 = (n: number) => n.toFixed(2);
const sleep = (ms: number) => page.waitForTimeout(ms);
const ev = async <T>(js: string): Promise<T> => JSON.parse((await page.evaluate(`JSON.stringify(${js})`)) as string) as T;
/** a page-side promise (sampling over frames) */
const evAsync = <T>(js: string) => page.evaluate(js) as Promise<T>;
interface Cam {
  mode: string;
  view: string;
  yaw: number;
  yawT: number;
  fov: number;
  pitch: number;
  fpPitch: number;
  dist: number;
  cur: number;
  chaseDist: number;
  blending: boolean;
  fpv: boolean;
  hideMe: boolean;
  pos: number[];
  dir: number[];
  near: number;
  up: number[];
  inSolid: boolean;
}
const cam = () => ev<Cam>('window.__SH_CAMSTATE()');
const snap = () => ev<{ ph: string; mp: number; pi: number; ar: number[]; pl: number[][] }>('window.__SH_NET.latest()');
const me = async () => (await snap()).pl[0];
const art = async () => (await snap()).ar;
const dev = (cmd: string) => page.evaluate(`window.__SH_NET.dev(${cmd})`);
async function waitFor(what: string, fn: () => Promise<boolean>, ms = 6000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await fn()) return true;
    await sleep(80);
  }
  console.log(`   (timed out waiting for ${what})`);
  return false;
}
async function hold(key: string, ms: number) {
  await page.keyboard.down(key);
  await sleep(ms);
  await page.keyboard.up(key);
}
/** Turn the camera to an absolute heading through the look input (as the mouse would). */
async function turnTo(yaw: number) {
  const c = await cam();
  await page.evaluate(`window.__SH_LOOK.turn(${c.yawT - yaw}, 0)`);
  await sleep(250);
}
const hd = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[2] - b[2]);

await page.goto(base + '/?dev');
await sleep(1500);
await page.getByText('Solo test room (dev)').click();
await waitFor('playing', async () => (await snap())?.ph === 'playing', 15000);
await sleep(900);

// ---------------------------------------------------------------- 1. third person at the start
let c = await cam();
let p = await me();
check('starts in third person, heading down the course', c.view === 'orbit' && Math.abs(c.yaw) < 1e-6 && c.dir[2] < -0.8, `view ${c.view} yaw ${f2(c.yaw)} dir.z ${f2(c.dir[2])}`);
check('camera sits behind and above your courier', c.pos[2] > p[3] + 5 && c.pos[1] > p[2] + 2, `cam ${c.pos.map(f2)} me ${[p[1], p[2], p[3]].map(f2)}`);

// ---------------------------------------------------------------- 2. mouse: drag to turn (no pointer lock), pitch, zoom
await page.mouse.move(640, 360);
await page.mouse.down({ button: 'right' });
for (let i = 1; i <= 10; i++) await page.mouse.move(640 + i * 20, 360);
await page.mouse.up({ button: 'right' });
await sleep(150);
c = await cam();
check('mouse drag right turns the camera right', c.yaw < -0.3 && c.yaw > -0.7, `yaw ${f2(c.yaw)} (≈ -0.48 expected)`);
const pitch0 = c.pitch;
await page.mouse.down({ button: 'right' });
for (let i = 1; i <= 5; i++) await page.mouse.move(840, 360 + i * 20);
await page.mouse.up({ button: 'right' });
await sleep(150);
c = await cam();
check('mouse drag down tilts the view down (camera higher)', c.pitch > pitch0 + 0.15, `pitch ${f2(pitch0)} → ${f2(c.pitch)}`);
const d0 = c.dist;
await page.mouse.wheel(0, 300);
await sleep(300);
c = await cam();
check('scrolling down zooms out', c.dist > d0 * 1.4, `dist ${f2(d0)} → ${f2(c.dist)}`);
await page.mouse.wheel(0, -600);
await sleep(300);
c = await cam();
check('scrolling up zooms in', c.dist < d0, `dist → ${f2(c.dist)}`);
// touchpad: sideways two-finger swipe turns, pinch (ctrl + wheel) zooms
const y1 = c.yaw;
await page.mouse.wheel(120, 0);
await sleep(200);
c = await cam();
check('touchpad sideways swipe turns the camera', Math.abs(c.yaw - (y1 - 0.42)) < 0.08, `yaw ${f2(y1)} → ${f2(c.yaw)}`);
const d1 = c.dist;
await page.keyboard.down('Control');
await page.mouse.wheel(0, 40);
await page.keyboard.up('Control');
await sleep(200);
c = await cam();
check('touchpad pinch zooms', c.dist > d1 * 1.2, `dist ${f2(d1)} → ${f2(c.dist)}`);
// click: pointer lock (headless Chrome may refuse it; drag + wheel above cover the same input path)
await page.mouse.click(640, 400);
await sleep(300);
const locked = await page.evaluate(`!!document.pointerLockElement`);
console.log(`INFO  pointer lock on click: ${locked ? 'engaged' : 'not available here'}`);
if (locked) {
  const y2 = (await cam()).yaw;
  await page.mouse.move(700, 400);
  await page.mouse.move(800, 400);
  await sleep(150);
  console.log(`INFO  locked mouse move: yaw ${f2(y2)} → ${f2((await cam()).yaw)}`);
  await page.keyboard.press('Escape');
  await sleep(300);
  check('Esc frees the mouse without opening the menu', !(await page.evaluate(`!!document.pointerLockElement`)) && (await page.locator('.menu-card').count()) === 0);
}

// ---------------------------------------------------------------- 3. WASD follows the camera
await page.evaluate(`window.__SH_LOOK.zoom(Math.log(8.5 / window.__SH_CAMSTATE().dist) / 0.5)`); // back to the default distance
await sleep(200);
check('zoom back to the default distance', Math.abs((await cam()).dist - 8.5) < 0.05, `dist ${f2((await cam()).dist)}`);
async function walk(yaw: number, key: string, expect: [number, number], label: string) {
  await dev('{ me: [-4, 0, 6.5] }');
  await sleep(500);
  await turnTo(yaw);
  const a = await me();
  await hold(key, 700);
  await sleep(150);
  const b = await me();
  const dx = b[1] - a[1], dz = b[3] - a[3];
  const L = Math.hypot(dx, dz) || 1;
  check(`WASD: ${label}`, L > 1.5 && (dx / L) * expect[0] + (dz / L) * expect[1] > 0.9, `moved (${f2(dx)}, ${f2(dz)})`);
}
await walk(-Math.PI / 2, 'KeyW', [1, 0], 'camera facing +X, W walks +X');
await walk(-Math.PI / 2, 'KeyD', [0, 1], 'camera facing +X, D walks +Z');
await walk(Math.PI, 'KeyW', [0, 1], 'camera facing +Z, W walks +Z');
await walk(Math.PI, 'KeyA', [1, 0], 'camera facing +Z, A walks +X');
await walk(0, 'KeyS', [0, 1], 'camera facing -Z, S walks +Z');

// ---------------------------------------------------------------- 4. smooth follow while walking, smooth flicks
await dev('{ me: [-6, 0, 7] }');
await sleep(500);
await turnTo(-Math.PI / 2);
await page.keyboard.down('KeyW');
await sleep(300);
// camera velocity per real frame time: jitter shows up as frame-to-frame velocity spikes
const smooth = await evAsync<{ maxDv: number; maxSpeed: number; frames: number }>(`new Promise((res) => {
  const pts = []; let n = 0;
  const loop = (t) => {
    pts.push([t, ...window.__SH_CAMSTATE().pos]);
    if (++n < 90) requestAnimationFrame(loop);
    else {
      let maxDv = 0, maxSpeed = 0;
      const vel = (a, b) => { const dt = (b[0] - a[0]) / 1000; return dt > 0 ? [(b[1] - a[1]) / dt, (b[2] - a[2]) / dt, (b[3] - a[3]) / dt] : null; };
      for (let i = 2; i < pts.length; i++) {
        const v1 = vel(pts[i - 2], pts[i - 1]), v2 = vel(pts[i - 1], pts[i]);
        if (!v1 || !v2) continue;
        maxDv = Math.max(maxDv, Math.hypot(v2[0] - v1[0], v2[1] - v1[1], v2[2] - v1[2]));
        maxSpeed = Math.max(maxSpeed, Math.hypot(v2[0], v2[1], v2[2]));
      }
      res({ maxDv, maxSpeed, frames: pts.length });
    }
  };
  requestAnimationFrame(loop);
})`);
await page.keyboard.up('KeyW');
check('camera follows smoothly while walking (no jitter)', smooth.maxDv < 3 && smooth.maxSpeed < 9, `max frame-to-frame velocity change ${f2(smooth.maxDv)} m/s, top speed ${f2(smooth.maxSpeed)} m/s, ${smooth.frames} frames`);
// a fast flick of the mouse: the view turns over a few frames instead of snapping
const flick = await evAsync<{ first: number; total: number; frames: number }>(`new Promise((res) => {
  const y0 = window.__SH_CAMSTATE().yaw;
  window.__SH_LOOK.turn(0.6, 0);
  const ys = []; let n = 0;
  const loop = () => {
    ys.push(window.__SH_CAMSTATE().yaw);
    if (++n < 30) requestAnimationFrame(loop);
    else {
      let first = 0;
      for (let i = 1; i < ys.length; i++) first = Math.max(first, Math.abs(ys[i] - ys[i - 1]));
      res({ first, total: Math.abs(ys[ys.length - 1] - y0), frames: ys.length });
    }
  };
  requestAnimationFrame(loop);
})`);
check('a mouse flick turns the view smoothly and fully', flick.first < 0.6 * 0.6 && Math.abs(flick.total - 0.6) < 0.03, `largest per-frame turn ${f2(flick.first)} rad of 0.6, reached ${f2(flick.total)}`);

// ---------------------------------------------------------------- 5. never inside walls or terrain
// behind the palisade, looking back at it: the camera is pulled in on your side of the wall
await dev('{ me: [-6.5, 0, -10.6] }');
await sleep(600);
await turnTo(0);
await sleep(700);
c = await cam();
check('wall behind you pulls the camera in (not through the palisade)', c.pos[2] < -9.25 && c.cur < 1.8 && !c.inSolid, `cam z ${f2(c.pos[2])} dist ${f2(c.cur)}`);
// under the low arch the pivot drops below the ceiling and the camera stays inside the tunnel
await dev('{ me: [0, 0, -26.5] }');
await sleep(800);
c = await cam();
check('under the low arch the camera stays below the ceiling', !c.inSolid && (c.pos[1] < 1.45 || c.pos[2] > -24.9), `cam ${c.pos.map(f2)}`);
// sweep the camera all the way round at several places and pitches: never inside level geometry
let inside = 0, samples = 0;
for (const spot of ['[-6.5, 0, -10.6]', '[0, 0, -26.5]', '[3, 0, -23.5]', '[-8.5, 0, -2]', '[0, 0, 9]']) {
  await dev(`{ me: ${spot} }`);
  await sleep(500);
  const r = await evAsync<{ inside: number; n: number }>(`new Promise((res) => {
    let n = 0, inside = 0, k = 0;
    const loop = () => {
      window.__SH_LOOK.turn(0.13, k % 40 < 20 ? 0.035 : -0.035);
      k++;
      if (k > 4) { n++; if (window.__SH_CAMSTATE().inSolid) inside++; }
      if (k < 120) requestAnimationFrame(loop); else res({ inside, n });
    };
    requestAnimationFrame(loop);
  })`);
  inside += r.inside;
  samples += r.n;
}
check('camera never inside level geometry during 360° sweeps', inside === 0, `${inside} of ${samples} frames inside`);
await turnTo(0);

// ---------------------------------------------------------------- 6. first person in every shape
await dev('{ me: [0, 0, 4.3] }');
await sleep(600);
await page.keyboard.press('KeyF');
let ok = await waitFor('first person', async () => {
  const k = await cam();
  return k.view === 'fp' && k.fpv && !k.blending;
});
c = await cam();
let a = await art();
check('F: camera moves inside the artifact (first person)', ok && Math.abs(c.pos[0] - a[0]) < 0.25 && Math.abs(c.pos[2] - a[2]) < 0.25 && Math.abs(c.pos[1] - (a[1] + 0.25)) < 0.2, `cam ${c.pos.map(f2)} art ${a.slice(0, 3).map(f2)}`);
check('first person: near plane tightened, wide lens', c.near <= 0.06 && c.fov > 65);
// mouse look inside
const fy = c.yaw, fpP = c.fpPitch;
await page.mouse.move(640, 360);
await page.mouse.down({ button: 'right' });
for (let i = 1; i <= 6; i++) await page.mouse.move(640 - i * 20, 360 - i * 8);
await page.mouse.up({ button: 'right' });
await sleep(200);
c = await cam();
check('first person: mouse looks left and up', c.yaw > fy + 0.2 && c.fpPitch > fpP + 0.05, `yaw ${f2(fy)} → ${f2(c.yaw)}, pitch ${f2(fpP)} → ${f2(c.fpPitch)}`);
// drive: W goes where you look
await turnTo(-Math.PI / 2);
a = await art();
await hold('KeyW', 1100);
await sleep(200);
let b = await art();
check('first person CUBE: W drives toward the view (+X)', b[0] - a[0] > 0.6 && Math.abs(b[2] - a[2]) < 0.5, `moved (${f2(b[0] - a[0])}, ${f2(b[2] - a[2])})`);
await page.screenshot({ path: 'tests/out/cam-fp-cube.png' });
const SEAT = [0.25, 0.08, 1.45, 0.1];
for (const [key, shape, name] of [['Digit2', 1, 'LONG'], ['Digit3', 2, 'TALL'], ['Digit4', 3, 'ROUND']] as const) {
  await sleep(1100); // shift cooldown
  await page.keyboard.press(key);
  ok = await waitFor(`shape ${name}`, async () => (await art())[7] === shape, 3000);
  await sleep(700);
  c = await cam();
  a = await art();
  check(`first person ${name}: still inside after the shift, seat at the right height`, ok && c.view === 'fp' && c.fpv && Math.abs(c.pos[1] - (a[1] + SEAT[shape])) < 0.3, `cam y ${f2(c.pos[1])} art y ${f2(a[1])} fpv ${c.fpv}`);
  await page.screenshot({ path: `tests/out/cam-fp-${name.toLowerCase()}.png` });
}
// ROUND rolls: the view stays level while the ball turns over
await turnTo(0);
a = await art();
let minUp = 1;
for (let i = 0; i < 8; i++) {
  await page.keyboard.down('KeyW');
  await sleep(150);
  minUp = Math.min(minUp, (await cam()).up[1]);
}
await page.keyboard.up('KeyW');
b = await art();
check('first person ROUND: W rolls it forward (-Z)', a[2] - b[2] > 0.8, `moved z ${f2(b[2] - a[2])}`);
check('first person ROUND: the view stays level while rolling', minUp > 0.97, `min camera up.y ${minUp.toFixed(3)}`);
await sleep(1500);
// LONG's turn: A turns left whichever way the camera faces
async function longTurn(viewYaw: number) {
  await page.keyboard.press('Digit2');
  await waitFor('LONG', async () => (await art())[7] === 1, 3000);
  await sleep(1200);
  await turnTo(viewYaw);
  const q0 = await art();
  await page.keyboard.down('KeyA');
  await sleep(60);
  await page.keyboard.press('Space');
  await sleep(900);
  await page.keyboard.up('KeyA');
  const q1 = await art();
  const yawOf = (q: number[]) => Math.atan2(2 * (q[6] * q[4] + q[3] * q[5]), 1 - 2 * (q[4] * q[4] + q[5] * q[5]));
  let d = yawOf(q1) - yawOf(q0);
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}
const t1 = await longTurn(0);
await sleep(1600);
const t2 = await longTurn(Math.PI / 2);
check('first person LONG: A + Space turns left (camera facing -Z)', t1 > 0.5, `turned ${f2((t1 * 180) / Math.PI)}°`);
check('first person LONG: A + Space still turns left with the camera turned 90°', t2 > 0.5, `turned ${f2((t2 * 180) / Math.PI)}°`);

// ---------------------------------------------------------------- 7. chase view (V, scroll) and back
await page.keyboard.press('KeyV');
await waitFor('chase', async () => (await cam()).view === 'chase' && !(await cam()).blending);
c = await cam();
check('V: outside view of the artifact (shell visible again)', c.view === 'chase' && !c.fpv && !c.inSolid);
await page.keyboard.press('KeyV');
await waitFor('fp again', async () => (await cam()).fpv);
await page.mouse.move(640, 360);
await page.mouse.wheel(0, 400);
ok = await waitFor('scroll out to chase', async () => (await cam()).view === 'chase');
check('scrolling out of first person switches to the outside view', ok);
for (let i = 0; i < 6; i++) {
  await page.mouse.wheel(0, -500);
  await sleep(60);
}
ok = await waitFor('scroll in to fp', async () => (await cam()).view === 'fp');
check('scrolling all the way in returns to first person', ok);

// ---------------------------------------------------------------- 8. hop out: smooth return to third person
await page.keyboard.press('Digit1');
await sleep(1700);
await page.keyboard.press('KeyF');
ok = await waitFor('orbit', async () => (await cam()).view === 'orbit');
const midBlend = (await cam()).blending;
await sleep(900);
c = await cam();
p = await me();
a = await art();
check('F again: back to third person behind your courier', ok && c.view === 'orbit' && !c.fpv && !c.blending && hd(c.pos, [p[1], p[2], p[3]]) > 1.5 && !c.inSolid, `blended out: ${midBlend}, cam→me ${f2(hd(c.pos, [p[1], p[2], p[3]]))} m, dist ${f2(c.cur)}`);
check('hopping out keeps the heading you looked at', Math.abs(c.yaw - Math.PI / 2) < 0.2 || Math.abs(c.yaw) < 0.3, `yaw ${f2(c.yaw)}`);

// ---------------------------------------------------------------- 9. falling off and respawning
await turnTo(0);
await dev('{ me: [14, 0, 0] }');
let lowestCam = 99, lowestMe = 99;
const t0 = Date.now();
let respawned = false;
while (Date.now() - t0 < 6000) {
  const s = await snap();
  const k = await cam();
  const m = s.pl[0];
  if (m[2] < lowestMe) lowestMe = m[2];
  if (m[2] < -4) lowestCam = Math.min(lowestCam, k.pos[1]);
  if (lowestMe < -8 && m[2] > -1) {
    respawned = true;
    break;
  }
  await sleep(60);
}
await sleep(700);
c = await cam();
p = await me();
check('falling: the camera stays up and watches you fall', lowestMe < -6 && lowestCam > -2.5, `lowest courier y ${f2(lowestMe)}, lowest camera y while falling ${f2(lowestCam)}`);
check('respawn: the camera cuts to you (no sweep across the map)', respawned && hd(c.pos, [p[1], p[2], p[3]]) < 12 && !c.inSolid, `cam→me ${f2(hd(c.pos, [p[1], p[2], p[3]]))} m`);

// ---------------------------------------------------------------- 10. the artifact falls with a pilot inside
await dev('{ art: [0, 1.1, 2.5] }');
await sleep(500);
await dev('{ me: [0, 0, 4.3] }');
await sleep(600);
await page.keyboard.press('KeyF');
await waitFor('fp', async () => (await cam()).fpv);
await dev('{ art: [14, 2, 0] }');
ok = await waitFor('back outside at the checkpoint', async () => {
  const k = await cam();
  return k.view === 'orbit' && !k.blending && (await snap()).pi < 0;
}, 9000);
await sleep(500);
c = await cam();
p = await me();
check('artifact falls with you inside: you end up outside, camera behind you', ok && !c.fpv && !c.inSolid && hd(c.pos, [p[1], p[2], p[3]]) < 12, `view ${c.view} pilot ${(await snap()).pi}`);

// ---------------------------------------------------------------- 11. level change resets the heading
await turnTo(1.2);
await dev('{ map: 3 }');
ok = await waitFor('world 4 playing', async () => {
  const s = await snap();
  return s?.mp === 3 && s.ph === 'playing';
}, 12000);
await sleep(800);
c = await cam();
p = await me();
check('new world: third person, facing down the course again, next to you', ok && c.view === 'orbit' && Math.abs(c.yaw) < 1e-6 && c.pos[0] > 55 && hd(c.pos, [p[1], p[2], p[3]]) < 12, `yaw ${f2(c.yaw)} cam x ${f2(c.pos[0])}`);
await page.screenshot({ path: 'tests/out/cam-w4.png' });

// ---------------------------------------------------------------- 12. reload (reconnect into the same room)
await page.reload();
ok = await waitFor('rejoined', async () => {
  const k = await page.evaluate(`window.__SH_CAMSTATE && window.__SH_NET && window.__SH_NET.latest() ? window.__SH_CAMSTATE().mode : null`);
  return k === 'play';
}, 15000);
await sleep(1500);
c = await cam();
const s2 = await snap();
p = s2?.pl[0];
check('reload: back in the same run with a working camera', ok && c.view === 'orbit' && !!p && hd(c.pos, [p[1], p[2], p[3]]) < 12 && s2.mp === 3, `mode ${c.mode} map ${s2?.mp}`);
await dev('{ me: [70, 0, 4] }');
await sleep(400);
await page.mouse.move(640, 360);
await page.mouse.down({ button: 'right' });
for (let i = 1; i <= 5; i++) await page.mouse.move(640 + i * 20, 360);
await page.mouse.up({ button: 'right' });
await sleep(200);
check('reload: mouse turns the camera again', (await cam()).yaw < -0.15);

console.log(errors.length ? `console errors:\n  ${errors.slice(0, 10).join('\n  ')}` : 'no console errors');
check('no page errors', errors.length === 0);
console.log(fails ? `\n${fails} check(s) FAILED` : '\nall camera checks passed');
await browser.close();
process.exit(fails ? 1 : 0);
