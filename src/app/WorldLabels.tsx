// DOM labels projected from world space (name tags, king speech) — avoids per-label React roots.
// The objective hint and the golden object stay findable with a free camera: off screen (or behind you) they slide to
// the screen edge with an arrow pointing the way and the distance.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { frame } from '../render/frame';
import { camRef, camView } from '../render/CameraRig';
import { kingState } from '../render/Ending';
import { currentHint } from '../render/objective';
import { useGame } from './store';
import { SLOT_COLORS, PLAYER_CENTER_Y, GRIP_RANGE, PLAYER_RADIUS } from '../shared/constants';
import { shapeSpec } from '../shared/shapes';
import { activeMap, mechState } from '../render/mapState';
import { keysHtml } from './Keys';

const v = new THREE.Vector3();
const vc = new THREE.Vector3();

/** Screen margins kept clear of the HUD (top bar, shape keys) for edge arrows. */
const EDGE = { x: 70, top: 120, bottom: 150 };

export function WorldLabels() {
  const tags = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];
  const bubble = useRef<HTMLDivElement>(null);
  const hint = useRef<HTMLDivElement>(null);
  const hintText = useRef<HTMLSpanElement>(null);
  const hintDist = useRef<HTMLSpanElement>(null);
  const art = useRef<HTMLDivElement>(null);
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
    /** Like `place`, but an off-screen target is pinned to the screen edge with an arrow toward it. */
    const placeEdge = (el: HTMLDivElement | null, x: number, y: number, z: number, show: boolean) => {
      if (!el) return false;
      const cam = camRef.current;
      if (!show || !cam) {
        el.style.display = 'none';
        return false;
      }
      const w = window.innerWidth;
      const h = window.innerHeight;
      vc.set(x, y, z).applyMatrix4(cam.matrixWorldInverse); // camera space: -z is ahead
      v.set(x, y, z).project(cam);
      const sx = ((v.x + 1) / 2) * w;
      const sy = ((1 - v.y) / 2) * h;
      const ahead = vc.z < -cam.near;
      el.style.display = '';
      if (ahead && sx > EDGE.x && sx < w - EDGE.x && sy > EDGE.top * 0.5 && sy < h - EDGE.bottom * 0.6) {
        el.classList.remove('edge');
        el.style.transform = `translate(-50%, -100%) translate(${sx}px, ${sy}px)`;
        return false;
      }
      // direction from the screen centre (pixels, y down); behind the camera, its sideways offset still says which way
      const tanV = Math.tan(((cam.fov * Math.PI) / 180) / 2);
      let dx = (vc.x / (tanV * cam.aspect)) * (w / 2);
      let dy = -(vc.y / tanV) * (h / 2);
      if (!ahead) {
        // behind you: down toward the side it's on (never hidden under the shape keys at the bottom centre)
        dy = Math.max(Math.abs(dy), 1);
        if (Math.abs(dx) < dy * 0.5) dx = (dx >= 0 ? 0.5 : -0.5) * dy;
      }
      const cx = w / 2;
      const cy = h / 2;
      const hx = w / 2 - EDGE.x;
      const hyUp = h / 2 - EDGE.top;
      const hyDown = h / 2 - EDGE.bottom;
      const t = Math.min(Math.abs(dx) > 1e-6 ? hx / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-6 ? (dy < 0 ? hyUp : hyDown) / Math.abs(dy) : Infinity);
      const px = cx + dx * t;
      const py = cy + dy * t;
      el.classList.add('edge');
      el.style.setProperty('--a', `${Math.atan2(dy, dx)}rad`);
      el.style.transform = `translate(-50%, -50%) translate(${px}px, ${py}px)`;
      return true;
    };
    const loop = () => {
      const f = frame.current;
      const a = f.artifact;
      const aSpec = shapeSpec(a.shape);
      const ui = useGame.getState();
      const playing = frame.live && f.latest.ph === 'playing' && !ui.cutscene;
      for (let i = 0; i < 3; i++) {
        const p = f.players.find((x) => x.slot === i);
        // a pilot's tag floats over the artifact's dome
        const y = p?.pilot ? a.y + (aSpec.ball ? aSpec.half[0] : Math.max(aSpec.half[1], 0.4)) + 1.35 : (p?.y ?? 0) - PLAYER_CENTER_Y + 1.95;
        const mine = i === (ui.lobby?.you ?? -1);
        // no tag on yourself while you look out from inside the artifact (or while the camera is in your face)
        place(tags[i].current, p?.x ?? 0, y, p?.z ?? 0, !!p && screen === 'game' && !(mine && (camView.fpv || camView.hideMe)));
        const el = tags[i].current;
        if (p && el) {
          el.style.opacity = p.connected ? '1' : '0.45';
          el.classList.toggle('inside', p.pilot);
        }
      }
      place(bubble.current, kingState.x, kingState.y + 3.6, kingState.z, kingState.talking);
      const me = f.players.find((p) => p.slot === (ui.lobby?.you ?? -1));
      const h = currentHint();
      if (hintText.current && h) {
        const html = keysHtml(h.text);
        if (hintText.current.dataset.html !== html) {
          hintText.current.dataset.html = html;
          hintText.current.innerHTML = html;
        }
      }
      const off = placeEdge(hint.current, h?.x ?? 0, h?.y ?? 0, h?.z ?? 0, !!h && screen === 'game' && !ui.cutscene);
      if (hintDist.current) {
        const d = h && me ? Math.round(Math.hypot(h.x - me.x, h.y - me.y, h.z - me.z)) : 0;
        const txt = off && d > 4 ? `${d} m` : '';
        if (hintDist.current.textContent !== txt) hintDist.current.textContent = txt;
      }
      // the golden object, when you can't see it (never while you ride inside it)
      const artOff = placeEdge(art.current, a.x, a.y + 1.2, a.z, playing && !!me && !me.pilot);
      if (art.current) art.current.style.visibility = artOff ? 'visible' : 'hidden';
      // prompts when the local courier is close to the artifact: grip (early in a run) and climb in (while it's free)
      let showE = false;
      if (me && !me.pilot && playing && !me.grip) {
        const r = aSpec.ball ? aSpec.half[0] : Math.max(...aSpec.half);
        const near = Math.hypot(me.x - a.x, me.z - a.z) - r - PLAYER_RADIUS < GRIP_RANGE + 0.3;
        const free = f.pilot < 0;
        const early = f.latest.el < 150000;
        showE = near && (early || free);
        const mode = (early ? 'e' : '') + (free ? 'f' : '');
        const el = eTip.current;
        if (el && el.dataset.mode !== mode) {
          el.dataset.mode = mode;
          el.innerHTML = [early ? 'hold <kbd>E</kbd> grab' : '', free ? '<kbd>F</kbd> climb in' : ''].filter(Boolean).join(' · ');
        }
      }
      place(eTip.current, me?.x ?? 0, (me?.y ?? 0) + 1.75, me?.z ?? 0, showE && !camView.hideMe);
      // "Q" prompt over the nearest machine you can use
      let qx = 0, qy = 0, qz = 0, showQ = false;
      if (me && !me.pilot && playing) {
        const map = activeMap();
        let bestD = Infinity;
        map.mechs.forEach((def, i) => {
          if (def.kind !== 'switch' || (def.map && def.map !== map.id)) return;
          const d = Math.hypot(me.x - def.p[0], me.z - def.p[2]);
          if (d > def.radius + 0.4 || d >= bestD || Math.abs(me.y - PLAYER_CENTER_Y - def.p[1]) > 1.6) return;
          bestD = d;
          const s = mechState(i);
          const v = Math.round(s[0] ?? 0);
          const verb = def.mode === 'hold' || def.mode === 'charge' || def.mode === 'pump' ? 'hold' : 'press';
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
      <div ref={hint} className="world-hint" style={{ display: 'none' }}>
        <span className="edge-arrow" />
        <span ref={hintText} />
        <span ref={hintDist} className="hint-dist" />
      </div>
      <div ref={art} className="art-marker" style={{ display: 'none' }} title="The golden object">
        <span className="edge-arrow" />
        <span className="art-gem" />
      </div>
      <div ref={eTip} className="e-tip" style={{ display: 'none' }}>
        hold <kbd>E</kbd> grab
      </div>
      <div ref={qTip} className="e-tip q-tip" style={{ display: 'none' }} />
      <div ref={bubble} className="speech" style={{ display: 'none' }}>
        Splendid! The <b>perfect doorstop!</b>
      </div>
    </div>
  );
}
