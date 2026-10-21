// Turns authoritative game events into sound, particles, toasts, world banners and music.
import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { net } from '../net/net';
import { sfx } from '../audio/audio';
import { fx } from './Effects';
import { shakeCamera } from './CameraRig';
import { frame } from './frame';
import { useGame } from '../app/store';
import { LEVEL } from '../shared/level';
import { SHAPES } from '../shared/shapes';
import { mapAt } from '../shared/maps';
import type { GameEvent } from '../shared/protocol';
import { activeMap, mechState } from './mapState';

function nameOf(slot: number) {
  const l = useGame.getState().lobby;
  if (l && l.you === slot) return 'You';
  return l?.slots[slot]?.name ?? ['Red', 'Blue', 'Green'][slot];
}

/** Sounds + particles for data-driven mechanism events. */
function mechEvent(e: Extract<GameEvent, { k: 'mech' }>, you: number) {
  const map = activeMap();
  const def = map.mechs[e.i];
  if (!def) return;
  const ui = useGame.getState();
  const at = (p: [number, number, number]) => ({ x: p[0], y: p[1], z: p[2] });
  switch (def.kind) {
    case 'spring': {
      const p = at(def.p);
      sfx.synth('boing', { vol: e.who === you || e.who === -1 ? 0.8 : 0.4, rate: e.who === -1 ? 0.7 : 1 });
      fx.dust(p.x, p.y + 0.2, p.z, 10);
      fx.sparkle(p.x, p.y + 0.6, p.z, 14, 0.8, '#9ff7ef');
      if (e.who === -1) shakeCamera(0.12);
      break;
    }
    case 'switch':
      if (e.ev === 'use') {
        sfx.synth(def.style === 'wheel' ? 'crank' : 'click', { vol: 0.7 });
        sfx.play('lever', { vol: 0.5, rate: 1.1 });
        const st = def.states?.[e.v ?? 0];
        ui.toast(`${e.by === you ? 'You' : nameOf(e.by ?? 0)}: ${def.label}${st ? ' — ' + st : ''}`, 'info');
        fx.sparkle(def.p[0], def.p[1] + 1.6, def.p[2], 16, 0.6, '#9ff7ef');
      } else if (e.ev === 'on') sfx.synth('click', { vol: 0.6 });
      else if (e.ev === 'warn') {
        sfx.synth('warn', { vol: 0.6 });
        ui.toast(`${def.label} is about to stop!`, 'warn');
      }
      break;
    case 'gate':
      if (e.ev === 'open') {
        sfx.play('gate_open', { vol: 0.7, rate: 1.15 });
        fx.sparkle(def.p[0], def.p[1] + 1, def.p[2], 30, 3);
      } else if (e.ev === 'close') sfx.play('gate_open', { vol: 0.45, rate: 0.85 });
      break;
    case 'plate':
      if (e.ev === 'on') sfx.synth('click', { vol: 0.5, rate: 0.8 });
      break;
    case 'dock':
      sfx.synth('chime', { vol: 0.7 });
      break;
    case 'wobble':
      sfx.synth('creak', { vol: Math.min(0.7, 0.25 + (e.v ?? 0) * 0.8), minGap: 500 });
      break;
    case 'puffer':
      sfx.synth('puff', { vol: 0.8 });
      fx.poof(def.p[0], def.p[1] + 1, def.p[2], 26, '#fff0f6');
      break;
    case 'blocker':
      sfx.play('gate_open', { vol: 0.5 });
      break;
    case 'lift':
      if (e.ev === 'return') ui.toast('The lift is coming back down for the golden object', 'info');
      break;
  }
}

export function GameEvents() {
  const mapShown = useRef(-1);
  const gusts = useRef<number[]>([]);
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
          if (e.by !== you) ui.toast(`${nameOf(e.by)} made it ${SHAPES[e.shape].name}`, 'info');
          break;
        case 'grip':
          sfx.play('grip', { vol: e.by === you ? 0.6 : 0.25 });
          break;
        case 'release':
          sfx.play('release', { vol: e.by === you ? (e.snap ? 0.7 : 0.45) : 0.2 });
          if (e.snap && e.by === you) ui.toast('You let go: you got too far away', 'warn');
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
          ui.toast('The gate is open!', 'good');
          fx.sparkle(LEVEL.gate.p[0], 2, LEVEL.gate.p[2], 50, 4);
          for (let x = -2.2; x <= 2.2; x += 1.1) fx.dust(LEVEL.gate.p[0] + x, 0.05, LEVEL.gate.p[2] + 0.4, 5);
          fx.ring(LEVEL.plate.p[0], 0.15, LEVEL.plate.p[2], 3.2, '#ffd36b');
          shakeCamera(0.28);
          break;
        case 'bridge':
          sfx.play('bridge_unfold', { vol: 0.9 });
          ui.toast('The bridge is coming down!', 'good');
          fx.sparkle(LEVEL.receiver.p[0], 0.8, LEVEL.receiver.p[2], 60, 4, '#9ff7ef');
          fx.ring(LEVEL.receiver.p[0], 0.12, LEVEL.receiver.p[2], 3.6, '#9ff7ef');
          shakeCamera(0.18);
          break;
        case 'lever':
          sfx.play('lever', { vol: 1 });
          ui.toast('Lever pulled! Now get on the lift', 'good');
          fx.sparkle(LEVEL.lever.p[0], 4.8, LEVEL.lever.p[2] + 0.6, 60, 1.5);
          fx.sparkle(LEVEL.lift.cx, 0.6, LEVEL.lift.cz, 40, 3, '#9ff7ef');
          shakeCamera(0.15);
          break;
        case 'liftStart':
          sfx.play('lift_start', { vol: 0.9 });
          sfx.synth('gears', { vol: 0.7 });
          ui.toast('Going up!', 'good');
          shakeCamera(0.1);
          break;
        case 'liftTop':
          sfx.play('checkpoint', { vol: 0.5, rate: 1.2 });
          break;
        case 'checkpoint': {
          const cp = activeMap().checkpoints[e.cp];
          if (!cp) break;
          sfx.play('checkpoint', { vol: 0.9 });
          ui.toast(`Checkpoint! ${cp.name}`, 'good');
          fx.confetti(cp.flag[0], cp.flag[1] + 2.5, cp.flag[2], 70, 1);
          fx.ring(cp.flag[0], cp.flag[1] + 0.12, cp.flag[2], 2.4, '#ffd36b');
          break;
        }
        case 'drop':
          sfx.play('fall_poof', { vol: 0.9 });
          sfx.play('fail_jingle', { vol: 0.6 });
          ui.toast('The golden object fell! It is back at the checkpoint (+7 s)', 'bad');
          shakeCamera(0.3);
          break;
        case 'fall':
          sfx.play('fall_poof', { vol: e.by === you ? 0.8 : 0.35 });
          ui.toast(e.by === you ? 'You fell off!' : `${nameOf(e.by)} fell off!`, 'warn');
          break;
        case 'respawn':
          sfx.play('respawn', { vol: e.by === you ? 0.6 : 0.2, minGap: 120 });
          break;
        case 'hop':
          ui.toast(e.by === you ? 'You were too far away: back with your team' : `${nameOf(e.by)} jumped back to the team`, 'info');
          break;
        case 'toast':
          if (e.slot === undefined || e.slot === you) ui.toast(e.text, 'info');
          break;
        case 'pilotIn': {
          sfx.synth('pilot_in', { vol: e.by === you ? 0.8 : 0.45 });
          if (e.by !== you) ui.toast(`${nameOf(e.by)} climbed inside the golden object!`, 'info');
          fx.sparkle(a.x, a.y + 0.6, a.z, 30, 1.2);
          break;
        }
        case 'pilotOut':
          sfx.synth('pilot_out', { vol: e.by === you ? 0.7 : 0.4 });
          fx.poof(e.x, e.y - 0.3, e.z, 10, '#fff4c4');
          break;
        case 'pilotFail':
          if (e.by === you) {
            ui.toast(e.why, 'warn');
            sfx.play('shift_fail', { vol: 0.45, minGap: 400 });
          }
          break;
        case 'ability':
          if (e.shape === 0) sfx.synth('boing', { vol: 0.6, rate: 0.75 });
          else if (e.shape === 1) sfx.synth('whoosh', { vol: 0.6, rate: 0.8 });
          else if (e.shape === 2) sfx.synth('crank', { vol: 0.6 });
          else {
            sfx.synth('whoosh', { vol: 0.7, rate: 1.4 });
            fx.dust(a.x, a.y - 0.9, a.z, 10);
          }
          break;
        case 'thump': {
          const v = Math.min(1.4, e.v);
          sfx.synth('thump', { vol: 0.5 + v * 0.3, minGap: 120 });
          sfx.play('impact_heavy', { vol: 0.4 + v * 0.3, minGap: 120 });
          fx.ring(e.x, e.y + 0.1, e.z, 3.2 + v, '#f4ead8');
          fx.dust(e.x, e.y, e.z, 14);
          shakeCamera(0.16 + v * 0.1);
          break;
        }
        case 'tumble':
          sfx.synth('tumble', { vol: e.by === you ? 0.55 : 0.3, minGap: 250 });
          break;
        case 'bump': {
          const pa = frame.current.players.find((p) => p.slot === e.a);
          sfx.synth('bump', { vol: e.a === you || e.b === you ? 0.6 : 0.3, rate: 0.9 + Math.min(0.5, e.v / 12) });
          if (pa) fx.sparkle(pa.x, pa.y + 0.6, pa.z, 8, 0.4, '#ffffff');
          break;
        }
        case 'mech':
          mechEvent(e, you);
          break;
        case 'collect': {
          const def = activeMap().mechs[e.i];
          sfx.synth('chime', { vol: 0.85 });
          if (def?.kind === 'collect') fx.sparkle(def.p[0], def.p[1], def.p[2], 40, 1, '#ffe48a');
          ui.toast(`${e.by >= 0 ? nameOf(e.by) + ' found a' : 'Found a'} royal stamp! (${e.n} of ${e.total})`, 'good');
          break;
        }
        case 'shortcut':
          sfx.play('countdown_go', { vol: 0.6 });
          ui.toast(`Shortcut! ${e.label} (bonus points)`, 'good');
          break;
        case 'stuck':
          ui.toast('Stuck? Two players press T to bring it back (free)', 'warn');
          break;
        case 'finish': {
          const castle = activeMap().id === 'castle';
          useGame.getState().set({ results: e.results, cutscene: castle, showResults: false });
          const G = activeMap().goal.p;
          fx.ring(G[0], G[1] + 0.15, G[2], 6, '#ffe9a0');
          shakeCamera(0.25);
          sfx.duck(0.2, castle ? 6 : 3);
          sfx.play('victory', { vol: 0.9, minGap: 1000 });
          if (!castle) {
            fx.confetti(G[0], G[1] + 1.5, G[2], 160, 3);
            setTimeout(() => {
              if (useGame.getState().results === e.results) useGame.getState().set({ showResults: true });
            }, 2200);
          }
          break;
        }
      }
    });
  }, []);

  useFrame(() => {
    if (!frame.live) return;
    const f = frame.current;
    if (f.latest.ph !== 'playing' && f.latest.ph !== 'countdown') return;
    const mi = f.latest.mp ?? 0;
    const map = mapAt(mi);
    // a world banner + its music whenever a new map starts
    if (mi !== mapShown.current) {
      mapShown.current = mi;
      useGame.getState().set({ banner: { title: map.name, sub: `${map.sub} · ${map.theme}`, goal: map.intro.goal, tradeoff: map.intro.tradeoff, key: Date.now() } });
      sfx.play('chapter', { vol: 0.7 });
      void sfx.playMusic(map.music, 1.5, map.musicRate ?? 1);
    }
    if (f.latest.ph !== 'playing') return;
    // gust sounds when the artifact is near a wind zone that starts blowing
    const a = f.artifact;
    map.mechs.forEach((def, i) => {
      if (def.kind !== 'wind') return;
      const s = mechState(i)[0] ?? 0;
      const prev = gusts.current[i] ?? 0;
      gusts.current[i] = s;
      const z = def.zone;
      const near = a.x > z.min[0] - 8 && a.x < z.max[0] + 8 && a.z > z.min[2] - 8 && a.z < z.max[2] + 8;
      if (near && s > 0.05 && prev <= 0.05) sfx.play('wind_gust', { vol: def.legacy === 'fan' ? 0.6 : 0.75, rate: def.legacy === 'fan' ? 0.8 : 1, minGap: 1500 });
    });
  });
  useEffect(
    () =>
      net.on('lobby', (l) => {
        if (l.phase === 'countdown') mapShown.current = -1;
      }),
    [],
  );
  return null;
}
