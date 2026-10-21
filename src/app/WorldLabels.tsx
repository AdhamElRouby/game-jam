// DOM labels projected from world space (name tags, king speech) — avoids per-label React roots.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { frame } from '../render/frame';
import { camRef } from '../render/CameraRig';
import { kingState } from '../render/Ending';
import { currentHint } from '../render/objective';
import { useGame } from './store';
import { SLOT_COLORS, PLAYER_CENTER_Y, GRIP_RANGE, PLAYER_RADIUS } from '../shared/constants';
import { shapeSpec } from '../shared/shapes';
import { activeMap, mechState } from '../render/mapState';

const v = new THREE.Vector3();

export function WorldLabels() {
  const tags = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];
  const bubble = useRef<HTMLDivElement>(null);
  const hint = useRef<HTMLDivElement>(null);
  const eTip = useRef<HTMLDivElement>(null);
  const qTip = useRef<HTMLDivElement>(null);
  const lobby = useGame((s) => s.lobby);
  const screen = useGame((s) => s.screen);
  useEffect(() => {
    let raf = 0;
    const place = (el: HTMLDivElement | null, x: number, y: number, z: number, show: boolean) => {
      if (!el) return;
      const cam = camRef.current;
      if (!show || !cam) {
        el.style.display = 'none';
        return;
      }
      v.set(x, y, z).project(cam);
      if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2) {
        el.style.display = 'none';
        return;
      }
      el.style.display = '';
      const w = window.innerWidth;
      const h = window.innerHeight;
      el.style.transform = `translate(-50%, -100%) translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
    };
    const loop = () => {
      const f = frame.current;
      const a = f.artifact;
      const aSpec = shapeSpec(a.shape);
      for (let i = 0; i < 3; i++) {
        const p = f.players.find((x) => x.slot === i);
        // a pilot's tag floats over the artifact's dome
        const y = p?.pilot ? a.y + (aSpec.ball ? aSpec.half[0] : Math.max(aSpec.half[1], 0.4)) + 1.35 : (p?.y ?? 0) - PLAYER_CENTER_Y + 1.95;
        place(tags[i].current, p?.x ?? 0, y, p?.z ?? 0, !!p && screen === 'game');
        const el = tags[i].current;
        if (p && el) {
          el.style.opacity = p.connected ? '1' : '0.45';
          el.classList.toggle('inside', p.pilot);
        }
      }
      place(bubble.current, kingState.x, kingState.y + 3.6, kingState.z, kingState.talking);
      const h = currentHint();
      if (hint.current && h && hint.current.textContent !== h.text) hint.current.textContent = h.text;
      place(hint.current, h?.x ?? 0, h?.y ?? 0, h?.z ?? 0, !!h && screen === 'game' && !useGame.getState().cutscene);
      // prompts when the local courier is close to the artifact: grip (early in a run) and hop in (while it's free)
      const me = f.players.find((p) => p.slot === (useGame.getState().lobby?.you ?? -1));
      let showE = false;
      if (me && !me.pilot && frame.live && f.latest.ph === 'playing' && !useGame.getState().cutscene && !me.grip) {
        const r = aSpec.ball ? aSpec.half[0] : Math.max(...aSpec.half);
        const near = Math.hypot(me.x - a.x, me.z - a.z) - r - PLAYER_RADIUS < GRIP_RANGE + 0.3;
        const free = f.pilot < 0;
        const early = f.latest.el < 150000;
        showE = near && (early || free);
        const mode = (early ? 'e' : '') + (free ? 'f' : '');
        const el = eTip.current;
        if (el && el.dataset.mode !== mode) {
          el.dataset.mode = mode;
          el.innerHTML = [early ? 'hold <kbd>E</kbd> grip' : '', free ? '<kbd>F</kbd> hop in' : ''].filter(Boolean).join(' · ');
        }
      }
      place(eTip.current, me?.x ?? 0, (me?.y ?? 0) + 1.75, me?.z ?? 0, showE);
      // "Q" prompt over the nearest machine you can use
      let qx = 0, qy = 0, qz = 0, showQ = false;
      if (me && !me.pilot && frame.live && f.latest.ph === 'playing' && !useGame.getState().cutscene) {
        const map = activeMap();
        let bestD = Infinity;
        map.mechs.forEach((def, i) => {
          if (def.kind !== 'switch' || (def.map && def.map !== map.id)) return;
          const d = Math.hypot(me.x - def.p[0], me.z - def.p[2]);
          if (d > def.radius + 0.4 || d >= bestD || Math.abs(me.y - PLAYER_CENTER_Y - def.p[1]) > 1.6) return;
          bestD = d;
          const s = mechState(i);
          const v = Math.round(s[0] ?? 0);
          const verb = def.mode === 'hold' || def.mode === 'charge' ? 'hold' : 'press';
          const state = def.states?.[v];
          const html = `${verb} <kbd>Q</kbd> ${def.label}${state ? ` <i>· ${state}</i>` : ''}`;
          const el = qTip.current;
          if (el && el.dataset.html !== html) {
            el.dataset.html = html;
            el.innerHTML = html;
          }
          qx = def.p[0];
          qy = def.p[1] + 2.35;
          qz = def.p[2];
          showQ = true;
        });
      }
      place(qTip.current, qx, qy, qz, showQ);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [screen]);
  const you = lobby?.you ?? -1;
  return (
    <div className="world-labels">
      {[0, 1, 2].map((i) => (
        <div key={i} ref={tags[i]} className={'nametag' + (i === you ? ' you' : '')} style={{ borderColor: SLOT_COLORS[i], display: 'none' }}>
          {i === you ? 'You' : lobby?.slots[i]?.name ?? ''}
        </div>
      ))}
      <div ref={hint} className="world-hint" style={{ display: 'none' }} />
      <div ref={eTip} className="e-tip" style={{ display: 'none' }}>
        hold <kbd>E</kbd> to grip
      </div>
      <div ref={qTip} className="e-tip q-tip" style={{ display: 'none' }} />
      <div ref={bubble} className="speech" style={{ display: 'none' }}>
        Splendid! The <b>perfect doorstop!</b>
      </div>
    </div>
  );
}
