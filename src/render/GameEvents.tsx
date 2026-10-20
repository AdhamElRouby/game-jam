// Turns authoritative game events into sound, particles, toasts and chapter banners.
import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { net } from '../net/net';
import { sfx } from '../audio/audio';
import { fx } from './Effects';
import { shakeCamera } from './CameraRig';
import { frame } from './frame';
import { useGame } from '../app/store';
import { LEVEL, chapterAt } from '../shared/level';
import { SHAPES } from '../shared/shapes';
import type { GameEvent } from '../shared/protocol';

function nameOf(slot: number) {
  const l = useGame.getState().lobby;
  if (l && l.you === slot) return 'You';
  return l?.slots[slot]?.name ?? ['Red', 'Blue', 'Green'][slot];
}

export function GameEvents() {
  const chapter = useRef(-1);
  const gust = useRef({ wind: 0, fan: 0 });
  useEffect(() => {
    return net.on('ev', (e: GameEvent) => {
      const ui = useGame.getState();
      const you = ui.lobby?.you ?? -1;
      const a = frame.current.artifact;
      switch (e.k) {
        case 'shiftFail':
          if (e.by === you) {
            ui.toast(e.why, 'warn');
            sfx.play('shift_fail', { vol: 0.8 });
          }
          break;
        case 'shift':
          if (e.by !== you) ui.toast(`${nameOf(e.by)} shifted it to ${SHAPES[e.shape].name}`, 'info');
          break;
        case 'grip':
          sfx.play('grip', { vol: e.by === you ? 0.6 : 0.25 });
          break;
        case 'release':
          sfx.play('release', { vol: e.by === you ? (e.snap ? 0.7 : 0.45) : 0.2 });
          if (e.snap && e.by === you) ui.toast('Rope snapped — too far!', 'warn');
          break;
        case 'impact': {
          const v = Math.min(1, e.v / 9);
          const name = e.mat === 'wood' ? 'impact_wood' : e.mat === 'metal' ? 'impact_metal' : 'impact_heavy';
          sfx.play(name, { vol: 0.25 + v * 0.6, minGap: 140 });
          if (e.v > 5) fx.dust(a.x, a.y - 0.8, a.z, 10);
          break;
        }
        case 'gate':
          sfx.play('gate_open', { vol: 0.9 });
          ui.toast('The gate rumbles open!', 'good');
          fx.sparkle(LEVEL.gate.p[0], 2, LEVEL.gate.p[2], 50, 4);
          for (let x = -2.2; x <= 2.2; x += 1.1) fx.dust(LEVEL.gate.p[0] + x, 0.05, LEVEL.gate.p[2] + 0.4, 5);
          fx.ring(LEVEL.plate.p[0], 0.15, LEVEL.plate.p[2], 3.2, '#ffd36b');
          shakeCamera(0.28);
          break;
        case 'bridge':
          sfx.play('bridge_unfold', { vol: 0.9 });
          ui.toast('Click! The bridge unfolds!', 'good');
          fx.sparkle(LEVEL.receiver.p[0], 0.8, LEVEL.receiver.p[2], 60, 4, '#9ff7ef');
          fx.ring(LEVEL.receiver.p[0], 0.12, LEVEL.receiver.p[2], 3.6, '#9ff7ef');
          shakeCamera(0.18);
          break;
        case 'lever':
          sfx.play('lever', { vol: 1 });
          ui.toast('Lever thrown! Everyone onto the lift', 'good');
          fx.sparkle(LEVEL.lever.p[0], 4.8, LEVEL.lever.p[2] + 0.6, 60, 1.5);
          fx.sparkle(LEVEL.lift.cx, 0.6, LEVEL.lift.cz, 40, 3, '#9ff7ef');
          shakeCamera(0.15);
          break;
        case 'liftStart':
          sfx.play('lift_start', { vol: 0.9 });
          ui.toast('Going up!', 'good');
          shakeCamera(0.1);
          break;
        case 'liftTop':
          sfx.play('checkpoint', { vol: 0.5, rate: 1.2 });
          break;
        case 'checkpoint': {
          const cp = LEVEL.checkpoints[e.cp];
          sfx.play('checkpoint', { vol: 0.9 });
          ui.toast(`Checkpoint! ${cp.name}`, 'good');
          fx.confetti(cp.flag[0], cp.flag[1] + 2.5, cp.flag[2], 70, 1);
          fx.ring(cp.flag[0], cp.flag[1] + 0.12, cp.flag[2], 2.4, '#ffd36b');
          break;
        }
        case 'drop':
          sfx.play('fall_poof', { vol: 0.9 });
          sfx.play('fail_jingle', { vol: 0.6 });
          ui.toast('Oops! The artifact fell. Back to the checkpoint (+7s)', 'bad');
          shakeCamera(0.3);
          break;
        case 'fall':
          sfx.play('fall_poof', { vol: e.by === you ? 0.8 : 0.35 });
          ui.toast(e.by === you ? 'Whoops! You tumbled off' : `${nameOf(e.by)} tumbled off!`, 'warn');
          break;
        case 'respawn':
          sfx.play('respawn', { vol: e.by === you ? 0.6 : 0.2, minGap: 120 });
          break;
        case 'hop':
          ui.toast(e.by === you ? 'Hop! Back with the team' : `${nameOf(e.by)} hopped back to the team`, 'info');
          break;
        case 'toast':
          ui.toast(e.text, 'info');
          break;
        case 'finish':
          useGame.getState().set({ results: e.results, cutscene: true, showResults: false });
          fx.ring(LEVEL.goal.p[0], 0.15, LEVEL.goal.p[2], 6, '#ffe9a0');
          shakeCamera(0.25);
          sfx.duck(0.2, 6);
          sfx.play('victory', { vol: 0.9, minGap: 1000 });
          break;
      }
    });
  }, []);

  // chapter banners from the synced artifact position + checkpoint
  useFrame(() => {
    if (!frame.live) return;
    const f = frame.current;
    if (f.latest.ph !== 'playing') return;
    // gust sounds when the team is near the windy zones
    const a = f.artifact;
    const nearWind = a.z < -40 && a.z > -70;
    const nearFan = f.latest.cp >= 3 && a.z < -110 && a.z > -150;
    if (f.w.wind > 0.05 && gust.current.wind <= 0.05 && nearWind) sfx.play('wind_gust', { vol: 0.75, minGap: 2000 });
    if (f.w.fan > 0.05 && gust.current.fan <= 0.05 && nearFan) sfx.play('wind_gust', { vol: 0.6, rate: 0.8, minGap: 2000 });
    gust.current.wind = f.w.wind;
    gust.current.fan = f.w.fan;
    const ch = chapterAt(f.artifact.z, f.latest.cp);
    if (ch !== chapter.current) {
      const first = chapter.current === -1;
      chapter.current = ch;
      if (!first || ch === 0) {
        const c = LEVEL.chapters[ch];
        useGame.getState().set({ banner: { title: c.name, sub: c.sub, key: Date.now() } });
        if (!first) sfx.play('chapter', { vol: 0.7 });
        void sfx.playMusic(ch === 3 ? 'music_alt' : 'music_main');
      }
    }
  });
  useEffect(
    () =>
      net.on('lobby', (l) => {
        if (l.phase === 'countdown') chapter.current = -1;
      }),
    [],
  );
  return null;
}
