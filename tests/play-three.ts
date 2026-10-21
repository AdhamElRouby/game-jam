// Three independent browser sessions: matchmaking, synchronized physics, shape shift visible to all.
// npx tsx tests/play-three.ts [baseUrl] [outPrefix]
import { chromium, type Page } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? 'tests/out/three';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const names = ['Ada', 'Bo', 'Cy'];
const pages: Page[] = [];
const logs: string[][] = [[], [], []];
for (let i = 0; i < 3; i++) {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 600 } });
  const page = await ctx.newPage();
  page.on('console', (m) => (m.type() === 'error') && logs[i].push(m.text()));
  page.on('pageerror', (e) => logs[i].push('[pageerror] ' + e.message));
  await page.goto(base);
  pages.push(page);
}
await pages[0].waitForTimeout(1500);
for (let i = 0; i < 3; i++) {
  await pages[i].fill('input', names[i]);
  await pages[i].getByRole('button', { name: 'PLAY', exact: true }).click();
  await pages[i].waitForTimeout(400);
  await pages[i].screenshot({ path: `${out}-lobby-${i}.png` });
}
// two of the three pick World 1 in the lobby (the third is outvoted)
await pages[0].waitForTimeout(400);
for (const p of pages.slice(0, 2)) await p.getByRole('button', { name: /Royal Loading Dock/ }).click();
await pages[0].waitForTimeout(6000);
const state = (p: Page) => p.evaluate(`(() => { const s = window.__SH_NET.latest(); const l = window.__SH_NET.lobby; return { t: s && s.t, ph: s && s.ph, ar: s && s.ar, you: l && l.you, room: l && l.roomId }; })()`) as Promise<any>;
const st0 = await Promise.all(pages.map(state));
console.log('rooms', st0.map((s) => s.room).join(','), 'slots', st0.map((s) => s.you).join(','), 'phase', st0.map((s) => s.ph).join(','));
// steer everyone to the artifact: drive input via override vector (keyboard focus per page is unreliable in parallel)
const drive = (p: Page, mx: number, mz: number, grab = false) => p.evaluate(`window.__SH_INPUT.override = { mx: ${mx}, mz: ${mz}, grab: ${grab} }`);
const bySlot: Page[] = [];
st0.forEach((s, i) => (bySlot[s.you] = pages[i]));
await drive(bySlot[0], 0.55, -0.83);
await drive(bySlot[1], 0, -1);
await drive(bySlot[2], -0.55, -0.83);
await pages[0].waitForTimeout(1300);
await drive(bySlot[0], 0, -1);
await drive(bySlot[2], 0, -1);
await pages[0].waitForTimeout(1600);
for (let i = 0; i < 3; i++) await pages[i].screenshot({ path: `${out}-push-${i}.png` });
await Promise.all(bySlot.map((p) => drive(p, 0, 0)));
await pages[0].waitForTimeout(500);
// shift to LONG from slot 1 (closest)
await bySlot[1].keyboard.press('Digit2');
await pages[0].waitForTimeout(900);
for (let i = 0; i < 3; i++) await pages[i].screenshot({ path: `${out}-shift-${i}.png` });
// compare identical snapshot across clients
const snaps = (await Promise.all(pages.map((p) => p.evaluate(`JSON.stringify(window.__SH_NET.snaps.slice(-12).map(s => [s.t, s.ar]))`)))).map((x: any) => JSON.parse(x)) as [number, number[]][][];
const t = Math.min(...snaps.map((s) => s[s.length - 1][0]));
const same = snaps.map((s) => s.find((x) => x[0] === t)?.[1]);
const ok = same.every((a) => a && JSON.stringify(a) === JSON.stringify(same[0]));
console.log('identical artifact state @t=' + t + ':', ok, JSON.stringify(same[0]));
console.log('shape on each client:', same.map((a) => a?.[7]).join(','));
for (let i = 0; i < 3; i++) if (logs[i].length) console.log('client', i, 'errors:', logs[i].slice(0, 5).join(' | '));
await browser.close();
