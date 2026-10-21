// Audio unlock + decode in a solo dev room, and per-world music. npx tsx tests/audio-check.ts [baseUrl]
import { chromium } from 'playwright';
const base = process.argv[2] ?? 'http://localhost:5173';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const logs: string[] = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
await page.goto(`${base}/?dev`);
await page.waitForTimeout(1500);
console.log('before click ctx:', await page.evaluate(`window.__SH_AUDIO.ctx ? window.__SH_AUDIO.ctx.state : 'none'`));
await page.getByText('Solo test room (dev)').click();
await page.waitForTimeout(4000);
const info = () => page.evaluate(`(() => { const a = window.__SH_AUDIO; return { state: a.ctx && a.ctx.state, buffers: a.buffers.size, music: a.musicName, playing: !!a.music, settings: a.settings }; })()`);
console.log('after PLAY:', JSON.stringify(await info()));
// World 3 plays the other loop
await page.evaluate(`window.__SH_NET.dev({ map: 2 })`);
await page.waitForTimeout(3000);
console.log('World 3:', JSON.stringify(await info()));
console.log(logs.filter((l) => l.includes('audio')).join('\n') || 'no audio warnings');
await browser.close();
