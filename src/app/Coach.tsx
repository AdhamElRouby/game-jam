// Tutorial tips: each control is introduced the first time it matters, one short tip at a time, and the tip is gone
// for good once you have done the thing (remembered in this browser). Situation tips (you fell, it is stuck) come
// back whenever it happens. A tip that is ignored steps aside for a while instead of nagging.
import { useEffect, useRef, useState } from 'react';
import { net } from '../net/net';
import { look } from '../render/look';
import { useGame } from './store';
import { mapAt } from '../shared/maps';
import type { ObjectiveDef } from '../shared/maps/types';
import { ShapeId, shapeSpec } from '../shared/shapes';
import { PF_GRIP, PF_PILOT, PF_USE, type PlayerSnap, type Snapshot } from '../shared/protocol';
import { PLAYER_CENTER_Y } from '../shared/constants';
import { Keys } from './Keys';

const STORE = 'sh_learned';
const learned: Set<string> = (() => {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(STORE) ?? '[]'));
  } catch {
    return new Set<string>();
  }
})();
function learn(id: string) {
  if (learned.has(id)) return;
  learned.add(id);
  localStorage.setItem(STORE, JSON.stringify([...learned]));
}
/** dev/test hook: window.__SH_COACH.reset() shows every tip again */
(window as any).__SH_COACH = {
  learned,
  reset: () => {
    learned.clear();
    localStorage.removeItem(STORE);
  },
};
/** the help card was opened (so its tip is learned) */
export function noteHelpOpened() {
  learn('help');
}

interface Ctx {
  snap: Snapshot;
  me: PlayerSnap;
  ob?: ObjectiveDef;
  inside: boolean;
  dist: number;
  shape: number;
  el: number;
  moved: number;
  pushed: boolean;
  nearSwitch: boolean;
  /** events that happened to you recently (name -> performance.now()) */
  recent: (name: string, ms: number) => boolean;
}

interface Tip {
  id: string;
  text: (c: Ctx) => string;
  show: (c: Ctx) => boolean;
  /** learned once this is true (else after `secs` on screen) */
  done?: (c: Ctx) => boolean;
  secs?: number;
  /** a situation tip: shown every time, never learned */
  repeat?: boolean;
  /** may show during the countdown */
  early?: boolean;
}

const TIPS: Tip[] = [
  { id: 'fell', repeat: true, secs: 6, text: () => 'You fell off! You come back by yourself. [R] jumps you back to your team', show: (c) => c.recent('fell', 5000) },
  { id: 'stuck', repeat: true, secs: 9, text: () => 'Stuck? Two players press [T] to bring it back to the checkpoint (free)', show: (c) => c.recent('stuck', 9000) },
  {
    id: 'look',
    early: true,
    text: () => (look.locked ? 'Move the mouse to look around' : 'Click the game, then move the mouse to look around'),
    show: () => true,
    done: () => look.turned > 1.0,
  },
  { id: 'move', text: () => '[W] [A] [S] [D] to walk · [Space] to jump', show: (c) => !c.inside, done: (c) => c.moved > 4 },
  { id: 'push', text: () => 'Walk into the golden object to push it', show: (c) => !c.inside && c.dist < 7, done: (c) => c.pushed },
  {
    id: 'grip',
    text: () => 'Hold [E] next to it to grab it. Walk away to pull',
    show: (c) => !c.inside && c.dist < 4.5 && c.el > 12000,
    done: (c) => (c.me[8] & PF_GRIP) !== 0,
  },
  {
    id: 'shift',
    text: (c) => {
      const want = c.ob?.shape;
      if (want !== undefined && want !== c.shape) return `Press [${shapeSpec(want).key}] near it to make it ${shapeSpec(want).name}`;
      return 'Press [1] [2] [3] [4] near it to change its shape';
    },
    show: (c) => !c.inside && c.dist < 6 && (c.ob?.shape !== undefined || c.el > 40000),
    done: (c) => c.recent('shiftMe', 1e9),
  },
  {
    id: 'pilot',
    text: () => 'Press [F] next to it to climb inside and drive it',
    show: (c) => !c.inside && c.dist < 5 && c.snap.pi < 0 && (c.el > 60000 || /\[F\]/.test(c.ob?.text ?? '')),
    done: (c) => c.inside,
  },
  { id: 'inside', secs: 8, text: () => 'You are inside! Move the mouse to look around · [V] outside view', show: (c) => c.inside },
  {
    id: 'use',
    text: () => 'Press [Q] to use levers, wheels and cranks. Some you hold down',
    show: (c) => c.nearSwitch,
    done: (c) => c.recent('useMe', 1e9) || (c.me[8] & PF_USE) !== 0,
  },
  { id: 'tall', secs: 9, text: () => 'TALL falls over easily. Two players hold [E] on it to keep it standing', show: (c) => c.shape === ShapeId.TALL && c.dist < 10 },
  { id: 'round', secs: 8, text: () => 'ROUND rolls fast and is hard to stop. Hold [E] on it to slow it down', show: (c) => c.shape === ShapeId.ROUND && c.dist < 10 && !c.inside },
  { id: 'zoom', secs: 8, text: () => 'Scroll to zoom the camera in or out', show: (c) => c.el > 25000 && !c.inside, done: () => look.zoomed > 0.5 },
  { id: 'sprint', secs: 6, text: () => 'Hold [Shift] to run faster (you slide more, too)', show: (c) => c.moved > 40 && !c.inside },
  { id: 'help', secs: 7, text: () => 'Press [H] any time to see all the controls', show: () => learned.size >= 4 },
];

interface Showing {
  tip: Tip;
  since: number;
  missing: number; // time its situation has been gone
  done: number; // >0: showing the tick for a moment before it goes
}

export function Coach() {
  const [view, setView] = useState<{ id: string; text: string; done: boolean } | null>(null);
  const st = useRef({
    cur: null as Showing | null,
    snooze: new Map<string, number>(),
    recent: new Map<string, number>(),
    moved: 0,
    last: null as null | { x: number; z: number },
    artStart: null as null | { x: number; z: number; map: number },
  });

  useEffect(() => {
    return net.on('ev', (e) => {
      const you = useGame.getState().lobby?.you ?? -1;
      const now = performance.now();
      const R = st.current.recent;
      if (e.k === 'fall' && e.by === you) R.set('fell', now);
      if (e.k === 'stuck') R.set('stuck', now);
      if (e.k === 'shift' && e.by === you) R.set('shiftMe', now);
      if (e.k === 'mech' && e.ev === 'use' && e.by === you) R.set('useMe', now);
    });
  }, []);

  useEffect(() => {
    const tick = () => {
      const S = st.current;
      const ui = useGame.getState();
      const snap = net.latest();
      const you = ui.lobby?.you ?? -1;
      const me = snap?.pl.find((p) => p[0] === you);
      const ph = snap?.ph;
      if (!snap || !me || ui.cutscene || ui.showResults || ui.help || (ph !== 'playing' && ph !== 'countdown')) {
        if (S.cur) setView(null);
        S.cur = null;
        return;
      }
      const now = performance.now();
      const map = mapAt(snap.mp ?? 0);
      const [ax, , az] = snap.ar;
      const inside = (me[8] & PF_PILOT) !== 0;
      // distance walked (teleports don't count) and whether the artifact has been pushed off its start
      if (S.last) {
        const d = Math.hypot(me[1] - S.last.x, me[3] - S.last.z);
        if (d < 3 && ph === 'playing') S.moved += d;
      }
      S.last = { x: me[1], z: me[3] };
      if (!S.artStart || S.artStart.map !== map.index || ph === 'countdown') S.artStart = { x: ax, z: az, map: map.index };
      const dist = inside ? 0 : Math.hypot(me[1] - ax, me[3] - az);
      const nearSwitch =
        !inside &&
        map.mechs.some(
          (d) => d.kind === 'switch' && (!d.map || d.map === map.id) && Math.hypot(me[1] - d.p[0], me[3] - d.p[2]) < d.radius + 0.4 && Math.abs(me[2] - PLAYER_CENTER_Y - d.p[1]) < 1.6,
        );
      const c: Ctx = {
        snap,
        me,
        ob: map.objectives[snap.ob ?? 0],
        inside,
        dist,
        shape: snap.ar[7],
        el: snap.el,
        moved: S.moved,
        pushed: Math.hypot(ax - S.artStart.x, az - S.artStart.z) > 1.5 && dist < 4.5,
        nearSwitch,
        recent: (name, ms) => now - (S.recent.get(name) ?? -1e12) < ms,
      };
      const usable = (t: Tip) => (t.repeat || !learned.has(t.id)) && (t.early || ph === 'playing') && (S.snooze.get(t.id) ?? 0) < now;
      const cur = S.cur;
      if (cur) {
        const t = cur.tip;
        if (cur.done > 0) {
          if (now - cur.done > 900) {
            S.cur = null;
            setView(null);
          }
          return;
        }
        if (t.done?.(c)) {
          learn(t.id);
          cur.done = now;
          setView({ id: t.id, text: t.text(c), done: true });
          return;
        }
        const shown = (now - cur.since) / 1000;
        cur.missing = t.show(c) && usable(t) ? 0 : cur.missing + 0.25;
        // a situation tip that is over, a timed tip that has been read, or one being ignored
        if (cur.missing > 1.5 || (t.secs && shown > t.secs) || (!t.secs && shown > 25)) {
          if (t.secs && !t.repeat && shown > t.secs) learn(t.id);
          if (!t.secs && shown > 25) S.snooze.set(t.id, now + 45000);
          if (t.repeat) S.recent.delete(t.id);
          S.cur = null;
          setView(null);
          return;
        }
        // a situation tip (fell, stuck) interrupts an ordinary one
        const urgent = TIPS.find((x) => x.repeat && x !== t && usable(x) && x.show(c));
        if (!urgent || t.repeat) {
          const text = t.text(c);
          setView((v) => (v && v.text === text && !v.done ? v : { id: t.id, text, done: false }));
          return;
        }
      }
      for (const t of TIPS) {
        if (!usable(t) || !t.show(c)) continue;
        if (t.done?.(c)) {
          learn(t.id); // already done before it was due
          continue;
        }
        S.cur = { tip: t, since: now, missing: 0, done: 0 };
        setView({ id: t.id, text: t.text(c), done: false });
        return;
      }
      if (S.cur === null) setView(null);
    };
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, []);

  if (!view) return null;
  return (
    <div className={'coach' + (view.done ? ' done' : '')} key={view.id}>
      {view.done && <span className="coach-check">✓</span>}
      <Keys text={view.text} />
    </div>
  );
}
