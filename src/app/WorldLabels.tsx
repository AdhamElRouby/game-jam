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

const v = new THREE.Vector3();

export function WorldLabels() {
  const tags = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];
  const bubble = useRef<HTMLDivElement>(null);
  const hint = useRef<HTMLDivElement>(null);
  const eTip = useRef<HTMLDivElement>(null);
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
      for (let i = 0; i < 3; i++) {
        const p = f.players.find((x) => x.slot === i);
        place(tags[i].current, p?.x ?? 0, (p?.y ?? 0) - PLAYER_CENTER_Y + 1.95, p?.z ?? 0, !!p && screen === 'game');
        const el = tags[i].current;
        if (p && el) el.style.opacity = p.connected ? "1" : "0.45";
      }
      place(bubble.current, kingState.x, kingState.y + 3.6, kingState.z, kingState.talking);
      const h = currentHint();
      if (hint.current && h && hint.current.textContent !== h.text) hint.current.textContent = h.text;
      place(hint.current, h?.x ?? 0, h?.y ?? 0, h?.z ?? 0, !!h && screen === 'game' && !useGame.getState().cutscene);
      // "Hold E" prompt when the local courier is close to the artifact but not gripping (early in a run)
      const me = f.players.find((p) => p.slot === (useGame.getState().lobby?.you ?? -1));
      let showE = false;
      if (me && frame.live && f.latest.ph === 'playing' && !useGame.getState().cutscene && !me.grip && f.latest.el < 150000) {
        const a = f.artifact;
        const r = shapeSpec(a.shape).ball ? shapeSpec(a.shape).half[0] : Math.max(...shapeSpec(a.shape).half);
        showE = Math.hypot(me.x - a.x, me.z - a.z) - r - PLAYER_RADIUS < GRIP_RANGE + 0.3;
      }
      place(eTip.current, me?.x ?? 0, (me?.y ?? 0) + 1.75, me?.z ?? 0, showE);
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
      <div ref={bubble} className="speech" style={{ display: 'none' }}>
        Splendid! The <b>perfect doorstop!</b>
      </div>
    </div>
  );
}
