// End-to-end flow with real browsers: match 3, isolate a 4th, disconnect/reconnect, finish, replay.
// npx tsx tests/flow-three.ts [base]   (needs the dev server for the dev 'finish' shortcut)
import { chromium, type Page } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:5173';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
let fails = 0;
const check = (n: string, ok: boolean, info = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${info}`);
  if (!ok) fails++;
};
const errors: string[] = [];
async function open(name: string) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 560 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`));
  await page.goto(base);
  await page.waitForTimeout(1200);
  await page.fill('input', name);
  await page.getByRole('button', { name: 'PLAY', exact: true }).click();
  return page;
}
const lobby = (p: Page) => p.evaluate(`(() => { const l = window.__SH_NET.lobby; return l ? { room: l.roomId, phase: l.phase, you: l.you, n: l.slots.filter(Boolean).length } : null; })()`) as Promise<any>;

const pages: Page[] = [];
for (const n of ['Ada', 'Bo', 'Cy']) {
  pages.push(await open(n));
  await pages[0].waitForTimeout(300);
}
await pages[0].waitForTimeout(800);
const L = await Promise.all(pages.map(lobby));
check('three share a room', L.every((l) => l?.room === L[0]?.room), L.map((l) => l?.room).join(','));
// the lobby: all six worlds + "all six in a row"; one pick waits, the second matching pick starts
check('lobby shows the world picker', (await pages[0].locator('.lobby-card .map-pick').count()) === 7 && L.every((l) => l?.phase === 'waiting'));
await pages[0].getByRole('button', { name: /All six in a row/ }).click();
await pages[0].waitForTimeout(500);
check('one pick waits for a teammate', (await lobby(pages[1]))?.phase === 'waiting');
await pages[2].getByRole('button', { name: /All six in a row/ }).click();
await pages[0].waitForTimeout(500);
check('countdown visible', (await pages[0].locator('.countdown').count()) > 0);
await pages[0].waitForTimeout(5200);
check('playing', (await lobby(pages[0]))?.phase === 'playing');
check('HUD timer shown', (await pages[1].locator('.timer').count()) === 1);

const fourth = await open('Dee');
await fourth.waitForTimeout(1200);
const l4 = await lobby(fourth);
check('4th player kept out of the running room', l4?.room !== L[0].room && l4?.phase === 'waiting', JSON.stringify(l4));
check('4th sees waiting lobby', (await fourth.locator('.lobby-card').count()) === 1);

// disconnect + reconnect (reload keeps the per-tab session token)
await pages[2].evaluate(`window.__SH_NET.socket.disconnect()`);
await pages[0].waitForTimeout(800);
check('room pauses when a courier drops', (await lobby(pages[0]))?.phase === 'paused');
check('pause overlay shown', (await pages[0].getByText('to come back').count()) > 0);
await pages[2].reload();
await pages[2].waitForTimeout(2500);
const after = await lobby(pages[2]);
check('reloaded tab rejoins same slot', after?.room === L[0].room && after?.you === L[2].you, JSON.stringify(after));
check('resuming or playing', ['resuming', 'playing'].includes((await lobby(pages[0]))?.phase));
await pages[0].waitForTimeout(3500);
check('playing again after resume', (await lobby(pages[0]))?.phase === 'playing');

// finish (dev shortcut) -> cutscene -> results on all three
await pages[0].evaluate(`window.__SH_NET.dev({ finish: true })`);
await pages[0].waitForTimeout(9000);
for (let i = 0; i < 3; i++) check(`results shown on client ${i}`, (await pages[i].getByText('Delivered!').count()) > 0);
await pages[0].screenshot({ path: 'tests/out/flow-results.png' });
check('results show crowns + achievements', (await pages[1].locator('.achievements li').count()) >= 3);
// one vote is not enough; the second vote (majority) moves the team on to World 2
await pages[0].getByRole('button', { name: /Next:/ }).click();
await pages[0].waitForTimeout(700);
check('a single vote waits for the team', (await lobby(pages[0]))?.phase === 'finished');
await pages[1].getByRole('button', { name: /Next:/ }).click();
await pages[0].waitForTimeout(1200);
const nl = (await pages[0].evaluate(`(() => { const l = window.__SH_NET.lobby; return { phase: l.phase, map: l.map, hist: l.history.length }; })()`)) as any;
check('majority vote starts the next world', nl.phase === 'countdown' && nl.map === 1 && nl.hist === 1, JSON.stringify(nl));
await pages[0].waitForTimeout(4500);
check('next world playing', (await lobby(pages[1]))?.phase === 'playing');
const el = await pages[0].evaluate(`window.__SH_NET.latest().el`);
check('timer reset for the new world', (el as number) < 3000, String(el));
const mp = await pages[2].evaluate(`window.__SH_NET.latest().mp`);
check('all clients on World 2', mp === 1, String(mp));

console.log(errors.length ? 'page errors:\n' + errors.slice(0, 8).join('\n') : 'no page errors');
console.log(fails ? `${fails} FAILURES` : 'ALL FLOW CHECKS PASSED');
await browser.close();
process.exit(fails ? 1 : 0);
