import { useEffect, useRef, useState } from 'react';
import { net } from '../net/net';
import { sfx } from '../audio/audio';
import { useGame } from './store';
import { ShapeIcon } from './ShapeIcon';
import { SHAPES, ShapeId } from '../shared/shapes';
import { SLOT_COLORS, SHIFT_COOLDOWN_MS } from '../shared/constants';
import { mapAt } from '../shared/maps';
import type { Snapshot } from '../shared/protocol';
import { PF_GRIP, PF_PILOT } from '../shared/protocol';
import { Keys } from './Keys';
import { Coach, noteHelpOpened } from './Coach';
import { camView } from '../render/CameraRig';
import { look } from '../render/look';

export function fmtTime(ms: number) {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`;
}

/** Objective line (+ optional tip) from the active map's objective list (the server says which one is current). */
function objective(s: Snapshot): { text: string; tip?: string; hint?: number } {
  const map = mapAt(s.mp ?? 0);
  const ob = map.objectives[s.ob ?? 0];
  if (!ob) return { text: '' };
  const shape = s.ar[7];
  let text = ob.text;
  let tip = ob.tip;
  if (shape === ShapeId.TALL && ob.shape === ShapeId.TALL) {
    text = s.w.steady >= 2 ? 'Steady! Now push it into the lever' : 'Two players hold it [E] to keep it standing. The third pushes it into the lever';
    tip = undefined;
  }
  return { text, tip, hint: ob.shape !== undefined && ob.shape !== shape ? ob.shape : undefined };
}

function useSnap(hz = 10) {
  const [snap, setSnap] = useState<Snapshot | null>(net.latest());
  useEffect(() => {
    const id = setInterval(() => setSnap(net.latest()), 1000 / hz);
    return () => clearInterval(id);
  }, [hz]);
  return snap;
}

function Countdown() {
  const lobby = useGame((s) => s.lobby);
  const [n, setN] = useState<number | null>(null);
  const last = useRef(-1);
  useEffect(() => {
    let raf = 0;
    const started = performance.now();
    const base = lobby?.timerMs ?? 0;
    const tick = () => {
      const left = base - (performance.now() - started);
      const v = Math.ceil(left / 1000);
      if (v !== last.current) {
        last.current = v;
        if (v > 0) sfx.play('countdown_tick', { vol: 0.7, minGap: 300 });
        setN(v);
      }
      if (left > -900) raf = requestAnimationFrame(tick);
      else setN(null);
    };
    if (lobby?.phase === 'countdown' || lobby?.phase === 'resuming') raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [lobby?.phase, lobby?.timerMs !== undefined && Math.round((lobby?.timerMs ?? 0) / 1000)]);
  const [go, setGo] = useState(false);
  useEffect(() => {
    if (lobby?.phase === 'playing' && last.current <= 1 && last.current !== -1) {
      setGo(true);
      sfx.play('countdown_go', { vol: 0.8 });
      const id = setTimeout(() => setGo(false), 900);
      last.current = -1;
      return () => clearTimeout(id);
    }
  }, [lobby?.phase]);
  if (go) return <div className="countdown go">GO!</div>;
  if (n === null || n <= 0 || (lobby?.phase !== 'countdown' && lobby?.phase !== 'resuming')) return null;
  return (
    <div className="countdown" key={n}>
      {n}
      <div className="countdown-sub">{lobby?.phase === 'resuming' ? 'Back in…' : 'Get ready!'}</div>
    </div>
  );
}

function PausedOverlay() {
  const lobby = useGame((s) => s.lobby);
  if (lobby?.phase !== 'paused') return null;
  const missing = lobby.slots.filter((s) => s && !s.connected).map((s) => s!.name);
  return (
    <div className="center-card card">
      <h2>Waiting for {missing.join(' & ') || 'a teammate'} to come back…</h2>
      <div className="big-timer">{Math.ceil((lobby.timerMs ?? 0) / 1000)}s</div>
      <p>The game is paused. If they don’t come back, you all go back to the lobby together.</p>
      <button
        className="secondary"
        onClick={() => {
          net.leave();
          useGame.getState().set({ screen: 'landing', lobby: null });
        }}
      >
        Leave
      </button>
    </div>
  );
}

/** World briefing when a map starts: what to do here and this world's shape tradeoff (through the countdown and the
 * first seconds of the run, under the objective so the middle of the screen stays clear). */
function Briefing({ snap }: { snap: Snapshot | null }) {
  const banner = useGame((s) => s.banner);
  const phase = useGame((s) => s.lobby?.phase);
  const since = useRef(0);
  useEffect(() => {
    since.current = performance.now();
  }, [banner?.key]);
  const age = performance.now() - since.current;
  const show = !!banner && age < 14000 && (phase === 'countdown' || age < 6500 || (phase === 'playing' && (snap?.el ?? 0) < 3500));
  if (!banner || !show) return null;
  return (
    <div className="briefing" key={banner.key}>
      <div className="briefing-title">
        <span className="briefing-sub">{banner.sub.split(' · ')[0]}</span> {banner.title}
      </div>
      <div className="briefing-goal">
        <Keys text={banner.goal} />
      </div>
      <div className="briefing-trade">
        <span className="briefing-icon">⚖</span>
        <Keys text={banner.tradeoff} />
      </div>
    </div>
  );
}

function Toasts() {
  const toasts = useGame((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.slice(-2).map((t) => (
        <div key={t.id} className={'toast ' + t.kind}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

/** The objective, with its keys drawn as key caps; the tip line folds away once it has been up for a while. */
function Objective({ snap }: { snap: Snapshot }) {
  const obj = objective(snap);
  const [tipOn, setTipOn] = useState(true);
  useEffect(() => {
    setTipOn(true);
    const id = setTimeout(() => setTipOn(false), 25000);
    return () => clearTimeout(id);
  }, [obj.text, snap.mp]);
  if (!obj.text) return null;
  return (
    <div className="objective" key={obj.text}>
      <div className="objective-main">
        <Keys text={obj.text} />
      </div>
      {obj.tip && tipOn && (
        <div className="objective-tip">
          <Keys text={obj.tip} />
        </div>
      )}
    </div>
  );
}

/** Four shape keys; the caption says which key to press when a shape is needed, or the new shape's pros and cons. */
function ShapeBar({ snap, you }: { snap: Snapshot | null; you: number }) {
  const shape = snap?.ar[7] ?? 0;
  const cd = snap?.cd ?? 0;
  const spec = SHAPES[shape];
  const hint = snap ? objective(snap).hint : undefined;
  const me = snap?.pl.find((p) => p[0] === you);
  const inside = !!me && (me[8] & PF_PILOT) !== 0;
  const dist = me && snap ? Math.hypot(me[1] - snap.ar[0], me[3] - snap.ar[2]) : 99;
  const near = dist < 5.5 || inside;
  const [fresh, setFresh] = useState(true);
  useEffect(() => {
    setFresh(true);
    const id = setTimeout(() => setFresh(false), 4200);
    return () => clearTimeout(id);
  }, [shape]);
  let caption: React.ReactNode = null;
  if (!inside && hint !== undefined) {
    const h = SHAPES[hint];
    caption = (
      <div className="shape-caption suggest" key={'h' + h.id}>
        <Keys text={`${near ? 'Press' : 'Get close, then press'} [${h.key}] → `} />
        <b>{h.name}</b>
        <span className="pro">{h.pro}</span>
      </div>
    );
  } else if (!inside && fresh) {
    caption = (
      <div className="shape-caption" key={spec.id}>
        <b>{spec.name}</b>
        <span className="pro">+ {spec.pro}</span>
        <span className="con">− {spec.con}</span>
      </div>
    );
  }
  return (
    <div className="shapebar">
      <Coach />
      <PilotPanel snap={snap} you={you} />
      {caption}
      <div className="shape-slots">
        {SHAPES.map((s) => (
          <div
            key={s.id}
            className={'slot' + (s.id === shape ? ' current' : '') + (hint === s.id ? ' hint' : '') + (!near ? ' far' : '')}
            onClick={() => net.shift(s.id)}
            title={`${s.name} [${s.key}]: + ${s.pro} − ${s.con}`}
          >
            <ShapeIcon shape={s.id} size={34} />
            <kbd>{s.key}</kbd>
            {cd > 0 && s.id !== shape && <div className="cooldown" style={{ height: `${(cd / SHIFT_COOLDOWN_MS) * 100}%` }} />}
          </div>
        ))}
      </div>
      <div className="shape-now">{near ? spec.name : 'get close to change shape'}</div>
    </div>
  );
}

function TeamTags({ snap }: { snap: Snapshot | null }) {
  const lobby = useGame((s) => s.lobby);
  return (
    <div className="team">
      {lobby?.slots.map((s, i) => {
        if (!s) return null;
        const p = snap?.pl.find((x) => x[0] === i);
        const gripping = p ? (p[8] & PF_GRIP) !== 0 : false;
        const inside = p ? (p[8] & PF_PILOT) !== 0 : false;
        return (
          <div key={i} className={'tag' + (s.you ? ' you' : '') + (!s.connected ? ' dc' : '') + (gripping ? ' grip' : '')} style={{ ['--c' as string]: SLOT_COLORS[i] }}>
            <span className="dot" />
            {s.name}
            {s.you && <span className="you-pill">you</span>}
            {inside && <span className="pilot-pill">inside</span>}
            {!s.connected && <span className="dc-pill">reconnecting</span>}
          </div>
        );
      })}
    </div>
  );
}

/** Every control in one short list (the help card and the menu share it). */
export function ControlsList() {
  return (
    <div className="controls-list">
      <div>
        <Keys text="[W] [A] [S] [D] walk · [Space] jump · [Shift] run" />
      </div>
      <div>
        <b>Mouse</b> look around (click the game first) · <b>Scroll</b> zoom
      </div>
      <div>
        <Keys text="[E] hold next to the golden object to grab it and pull" />
      </div>
      <div>
        <Keys text="[1] CUBE · [2] LONG · [3] TALL · [4] ROUND: change its shape (stand near it)" />
      </div>
      <div>
        <Keys text="[F] climb in / get out · inside: [Space] special move, [V] outside view" />
      </div>
      <div>
        <Keys text="[Q] use levers, wheels and cranks (hold for some)" />
      </div>
      <div>
        <Keys text="[R] jump back to your team · [T] call the object back (2 players)" />
      </div>
      <div>
        <Keys text="[Esc] menu · [M] mute · [H] this help" />
      </div>
    </div>
  );
}

/** The controls card: H or the button opens it, any time. Also repeats this world's goal and tradeoff. */
function Help({ snap }: { snap: Snapshot | null }) {
  const open = useGame((s) => s.help);
  const set = useGame((s) => s.set);
  const lobby = useGame((s) => s.lobby);
  useEffect(() => {
    if (open) noteHelpOpened();
  }, [open]);
  const map = mapAt(snap?.mp ?? lobby?.map ?? 0);
  if (!open)
    return (
      <button className="controls-mini" onClick={() => set({ help: true })} title="Controls (H)">
        ? <kbd>H</kbd>
      </button>
    );
  return (
    <div className="controls card" onClick={() => set({ help: false })}>
      <div className="controls-head">
        <b>Controls</b>
        <span className="controls-close">✕</span>
      </div>
      <ControlsList />
      <div className="controls-world">
        <b>{map.name}:</b> <Keys text={map.intro.goal} />
        <div className="controls-trade">
          ⚖ <Keys text={map.intro.tradeoff} />
        </div>
      </div>
    </div>
  );
}

/** While you ride inside the artifact: what WASD and Space do for this form, the ability cooldown, how to get out. */
function PilotPanel({ snap, you }: { snap: Snapshot | null; you: number }) {
  if (!snap || snap.pi !== you || you < 0) return null;
  const spec = SHAPES[snap.ar[7]];
  return (
    <div className="pilot-panel">
      <div className="pilot-title">
        Inside: <b>{spec.name}</b>
      </div>
      <div className="pilot-keys">
        <span>
          <kbd>W A S D</kbd> {spec.pilotMove}
        </span>
        <span className="pilot-ability">
          <kbd>Space</kbd> {spec.ability}
          <i className="pilot-cd" style={{ width: `${(1 - snap.pa) * 100}%` }} />
        </span>
        <span>
          <kbd>F</kbd> get out
        </span>
        <span>
          <kbd>V</kbd> view
        </span>
      </div>
      <div className="pilot-tip">{spec.pilotTip}</div>
    </div>
  );
}

function StatusChips({ snap }: { snap: Snapshot | null }) {
  if (!snap) return null;
  const chips: { text: string; kind: string }[] = [];
  const map = mapAt(snap.mp ?? 0);
  const [ax, ay, az] = snap.ar;
  // any gusting zone the artifact is in (or about to be)
  map.mechs.forEach((def, i) => {
    if (def.kind !== 'wind') return;
    const s = snap.m?.[i]?.[0] ?? 0;
    const z = def.zone;
    if (ax < z.min[0] || ax > z.max[0] || az < z.min[2] - 2 || az > z.max[2] + 2 || ay < z.min[1] || ay > z.max[1]) return;
    if (s < -0.05) chips.push({ text: def.legacy === 'fan' ? '🌀 The fan is starting' : '💨 Wind coming!', kind: 'warn' });
    else if (s > 0.2) chips.push({ text: def.legacy === 'fan' ? '🌀 Fan blowing!' : '💨 Wind!', kind: 'bad' });
  });
  const stamps = map.mechs.reduce((n, def, i) => n + (def.kind === 'collect' && (!def.map || def.map === map.id) && (snap.m?.[i]?.[0] ?? 0) > 0.5 ? 1 : 0), 0);
  if (stamps > 0) chips.push({ text: `👑 Stamps ${stamps}/${map.bonus.stamps}`, kind: stamps >= map.bonus.stamps ? 'good' : '' });
  if (snap.ar[7] === ShapeId.TALL) chips.push({ text: snap.w.steady >= 2 ? '✊ Held steady' : `⚠ Wobbly: ${snap.w.steady} of 2 holding`, kind: snap.w.steady >= 2 ? 'good' : 'warn' });
  if (snap.w.resetVotes > 0) chips.push({ text: `Call it back: ${snap.w.resetVotes} of 2 votes (T)`, kind: 'warn' });
  if (!chips.length) return null;
  return (
    <div className="chips">
      {chips.map((c) => (
        <div key={c.text} className={'chip ' + c.kind}>
          {c.text}
        </div>
      ))}
    </div>
  );
}

/** First person inside the artifact: a soft golden porthole at the screen edges, shaped by the form. */
function CockpitFrame() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const el = ref.current;
      if (el) {
        const cls = camView.fpv ? `cockpit-frame on s${net.latest()?.ar[7] ?? 0}` : 'cockpit-frame';
        if (el.className !== cls) el.className = cls;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <div ref={ref} className="cockpit-frame" />;
}

/** After the mouse is freed (Esc), a short reminder of how to get the camera back. */
function LookHint() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let t = 0;
    const off = look.on(() => {
      if (!look.locked && look.enabled) {
        setShow(true);
        clearTimeout(t);
        t = window.setTimeout(() => setShow(false), 4000);
      } else setShow(false);
    });
    return () => {
      off();
      clearTimeout(t);
    };
  }, []);
  if (!show) return null;
  return <div className="look-hint">Mouse free. Click the game to look around again</div>;
}

export function Hud() {
  const snap = useSnap(12);
  const lobby = useGame((s) => s.lobby);
  const cutscene = useGame((s) => s.cutscene);
  const you = lobby?.you ?? -1;
  const map = mapAt(snap?.mp ?? lobby?.map ?? 0);
  return (
    <div className="hud">
      {!cutscene && <CockpitFrame />}
      {!cutscene && (
        <>
          <div className="top">
            <div className="timer-row">
              <div className="timer">{fmtTime(snap?.el ?? 0)}</div>
              <div className="chapter-name">
                {map.sub.replace('World ', 'W')} · {map.name}
              </div>
            </div>
            {snap && lobby?.phase === 'playing' && <Objective snap={snap} />}
            <Briefing snap={snap} />
            <StatusChips snap={snap} />
            <Toasts />
          </div>
          <TeamTags snap={snap} />
          <ShapeBar snap={snap} you={you} />
          <Help snap={snap} />
          <LookHint />
        </>
      )}
      {cutscene && <Toasts />}
      <Countdown />
      <PausedOverlay />
      {!useGame.getState().connected && <div className="center-card card small">Connection lost. Reconnecting…</div>}
    </div>
  );
}
