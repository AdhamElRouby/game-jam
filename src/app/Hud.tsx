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

export function fmtTime(ms: number) {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`;
}

/** Objective line from the active map's objective list (the server says which one is current). */
function objective(s: Snapshot): { text: string; hint?: number } {
  const map = mapAt(s.mp ?? 0);
  const ob = map.objectives[s.ob ?? 0];
  if (!ob) return { text: '' };
  const shape = s.ar[7];
  let text = ob.text;
  if (shape === ShapeId.TALL && ob.shape === ShapeId.TALL) text = s.w.steady >= 2 ? 'Steady! Now push TALL into the lever' : 'Two couriers hold E to steady TALL, one pushes';
  return { text, hint: ob.shape !== undefined && ob.shape !== shape ? ob.shape : undefined };
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
      <div className="countdown-sub">{lobby?.phase === 'resuming' ? 'Resuming…' : 'Get ready to deliver!'}</div>
    </div>
  );
}

function PausedOverlay() {
  const lobby = useGame((s) => s.lobby);
  if (lobby?.phase !== 'paused') return null;
  const missing = lobby.slots.filter((s) => s && !s.connected).map((s) => s!.name);
  return (
    <div className="center-card card">
      <h2>Waiting for {missing.join(' & ') || 'a teammate'} to reconnect…</h2>
      <div className="big-timer">{Math.ceil((lobby.timerMs ?? 0) / 1000)}s</div>
      <p>The run is paused. If they don’t return, you’ll go back to the lobby together.</p>
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

function Banner() {
  const banner = useGame((s) => s.banner);
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!banner) return;
    setShow(true);
    const id = setTimeout(() => setShow(false), 2600);
    return () => clearTimeout(id);
  }, [banner?.key]);
  if (!banner || !show) return null;
  return (
    <div className="banner" key={banner.key}>
      <div className="banner-ribbon">
        <span className="banner-sub">{banner.sub}</span>
        <span className="banner-title">{banner.title}</span>
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

/** Four shape keys; the pro/con caption appears briefly after a shift or while a shape is being suggested. */
function ShapeBar({ snap, you }: { snap: Snapshot | null; you: number }) {
  const shape = snap?.ar[7] ?? 0;
  const cd = snap?.cd ?? 0;
  const spec = SHAPES[shape];
  const hint = snap ? objective(snap).hint : undefined;
  const me = snap?.pl.find((p) => p[0] === you);
  const dist = me && snap ? Math.hypot(me[1] - snap.ar[0], me[3] - snap.ar[2]) : 99;
  const near = dist < 5.5 || (!!me && (me[8] & PF_PILOT) !== 0);
  const [fresh, setFresh] = useState(true);
  useEffect(() => {
    setFresh(true);
    const id = setTimeout(() => setFresh(false), 4200);
    return () => clearTimeout(id);
  }, [shape]);
  const inside = !!me && (me[8] & PF_PILOT) !== 0;
  const caption = inside ? null : hint !== undefined ? SHAPES[hint] : fresh ? spec : null;
  return (
    <div className="shapebar">
      <PilotPanel snap={snap} you={you} />
      {caption && (
        <div className={'shape-caption' + (hint !== undefined ? ' suggest' : '')} key={caption.id + (hint !== undefined ? 'h' : '')}>
          <b>{caption.name}</b>
          <span className="pro">+ {caption.pro}</span>
          <span className="con">− {caption.con}</span>
        </div>
      )}
      <div className="shape-slots">
        {SHAPES.map((s) => (
          <div
            key={s.id}
            className={'slot' + (s.id === shape ? ' current' : '') + (hint === s.id ? ' hint' : '') + (!near ? ' far' : '')}
            onClick={() => net.shift(s.id)}
            title={`${s.name}: + ${s.pro} / − ${s.con}`}
          >
            <ShapeIcon shape={s.id} size={34} />
            <kbd>{s.key}</kbd>
            {cd > 0 && s.id !== shape && <div className="cooldown" style={{ height: `${(cd / SHIFT_COOLDOWN_MS) * 100}%` }} />}
          </div>
        ))}
      </div>
      <div className="shape-now">{near ? spec.name : 'get close to shift'}</div>
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

/** First-run tips that disappear once you have done the thing; a small "?" brings the full list back. */
function Controls({ snap, you }: { snap: Snapshot | null; you: number }) {
  const [open, setOpen] = useState(false);
  const [moved, setMoved] = useState(false);
  const [gripped, setGripped] = useState(false);
  const [piloted, setPiloted] = useState(false);
  const me = snap?.pl.find((p) => p[0] === you);
  useEffect(() => {
    if (!me) return;
    if (!moved && Math.hypot(me[5], me[7]) > 1) setMoved(true);
    if (!gripped && (me[8] & PF_GRIP) !== 0) setGripped(true);
    if (!piloted && (me[8] & PF_PILOT) !== 0) setPiloted(true);
  }, [me, moved, gripped, piloted]);
  const early = (snap?.el ?? 0) < 60000;
  const inside = !!me && (me[8] & PF_PILOT) !== 0;
  let tip: React.ReactNode = null;
  if (inside) tip = null;
  else if (early && !moved) tip = <><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move · <kbd>Space</kbd> jump · <kbd>Shift</kbd> sprint</>;
  else if (early && !gripped) tip = <>Hold <kbd>E</kbd> near the artifact to grip &amp; pull</>;
  else if ((snap?.el ?? 0) < 150000 && !piloted && snap && snap.pi < 0) tip = <>Press <kbd>F</kbd> next to the artifact to hop inside and steer it</>;
  return (
    <>
      {tip && !open && <div className="tip-strip">{tip}</div>}
      {open ? (
        <div className="controls card" onClick={() => setOpen(false)}>
          <div><kbd>W A S D</kbd> move · <kbd>Space</kbd> jump</div>
          <div><kbd>Shift</kbd> sprint · <kbd>E</kbd> hold to grip &amp; pull</div>
          <div><kbd>F</kbd> hop in / out of the artifact · <kbd>Q</kbd> use</div>
          <div><kbd>1</kbd>–<kbd>4</kbd> shift shape</div>
          <div><kbd>R</kbd> hop back · <kbd>T</kbd> recall vote</div>
          <div><kbd>Esc</kbd> menu · <kbd>M</kbd> mute</div>
        </div>
      ) : (
        <button className="controls-mini" onClick={() => setOpen(true)} title="Controls">
          ?
        </button>
      )}
    </>
  );
}

/** While you ride inside the artifact: what WASD and Space do for this form, the ability cooldown, how to get out. */
function PilotPanel({ snap, you }: { snap: Snapshot | null; you: number }) {
  if (!snap || snap.pi !== you || you < 0) return null;
  const spec = SHAPES[snap.ar[7]];
  return (
    <div className="pilot-panel">
      <div className="pilot-title">
        Piloting <b>{spec.name}</b>
      </div>
      <div className="pilot-keys">
        <span><kbd>WASD</kbd> {spec.pilotMove}</span>
        <span className="pilot-ability">
          <kbd>Space</kbd> {spec.ability}
          <i className="pilot-cd" style={{ width: `${(1 - snap.pa) * 100}%` }} />
        </span>
        <span><kbd>F</kbd> hop out</span>
        <span><kbd>R</kbd> bail</span>
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
    if (s < -0.05) chips.push({ text: def.legacy === 'fan' ? '🌀 Fan spinning up' : '💨 Gust incoming', kind: 'warn' });
    else if (s > 0.2) chips.push({ text: def.legacy === 'fan' ? '🌀 Fan blowing' : '💨 Gust!', kind: 'bad' });
  });
  const stamps = map.mechs.reduce((n, def, i) => n + (def.kind === 'collect' && (!def.map || def.map === map.id) && (snap.m?.[i]?.[0] ?? 0) > 0.5 ? 1 : 0), 0);
  if (stamps > 0) chips.push({ text: `👑 Stamps ${stamps}/${map.bonus.stamps}`, kind: stamps >= map.bonus.stamps ? 'good' : '' });
  if (snap.ar[7] === ShapeId.TALL) chips.push({ text: snap.w.steady >= 2 ? `✊ Steady (${snap.w.steady})` : `⚠ Wobbly ${snap.w.steady}/2`, kind: snap.w.steady >= 2 ? 'good' : 'warn' });
  if (snap.w.resetVotes > 0) chips.push({ text: `Recall vote ${snap.w.resetVotes}/2 — T`, kind: 'warn' });
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

export function Hud() {
  const snap = useSnap(12);
  const lobby = useGame((s) => s.lobby);
  const cutscene = useGame((s) => s.cutscene);
  const you = lobby?.you ?? -1;
  const obj = snap ? objective(snap) : null;
  const map = mapAt(snap?.mp ?? lobby?.map ?? 0);
  const ch = { sub: map.sub, name: map.name };
  return (
    <div className="hud">
      {!cutscene && (
        <>
          <div className="top">
            <div className="timer-row">
              <div className="timer">{fmtTime(snap?.el ?? 0)}</div>
              {ch && <div className="chapter-name">{ch.sub.replace('World ', 'W')} · {ch.name}</div>}
            </div>
            {obj && lobby?.phase === 'playing' && (
              <div className="objective" key={obj.text}>
                {obj.text}
              </div>
            )}
            <StatusChips snap={snap} />
            <Toasts />
          </div>
          <TeamTags snap={snap} />
          <ShapeBar snap={snap} you={you} />
          <Controls snap={snap} you={you} />
        </>
      )}
      {cutscene && <Toasts />}
      <Banner />
      <Countdown />
      <PausedOverlay />
      {!useGame.getState().connected && <div className="center-card card small">Connection lost — reconnecting…</div>}
    </div>
  );
}
