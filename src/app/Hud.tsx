import { useEffect, useRef, useState } from 'react';
import { net } from '../net/net';
import { sfx } from '../audio/audio';
import { useGame } from './store';
import { ShapeIcon } from './ShapeIcon';
import { SHAPES, ShapeId } from '../shared/shapes';
import { SLOT_COLORS, SHIFT_COOLDOWN_MS } from '../shared/constants';
import { LEVEL } from '../shared/level';
import type { Snapshot } from '../shared/protocol';

export function fmtTime(ms: number) {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`;
}

function objective(s: Snapshot): { text: string; hint?: number } {
  const w = s.w;
  const z = s.ar[2];
  const shape = s.ar[7];
  const cp = s.cp;
  if (w.goal > 0.01) return { text: 'Everyone into the golden ring!' };
  if (cp >= 3) return { text: 'Down to the castle — ROUND rolls fast', hint: shape === ShapeId.ROUND ? undefined : ShapeId.ROUND };
  if (w.lift === 2) return { text: 'Going up!' };
  if (w.lift === 1) return { text: `All aboard the lift (${w.aboard}/3)` };
  if (z < -83) {
    if (shape === ShapeId.TALL) return { text: w.steady >= 2 ? 'Steady! Push TALL into the lever' : 'Two couriers hold E to steady TALL' };
    return { text: 'Lever too high — shift to TALL', hint: ShapeId.TALL };
  }
  if (cp >= 2) return { text: 'On to the Crooked Tower' };
  if (w.bridge > 0) return { text: 'Cross the bridge — CUBE shrugs off gusts', hint: shape === ShapeId.CUBE ? undefined : ShapeId.CUBE };
  if (z < -41.5) {
    if (shape === ShapeId.LONG) return { text: 'Lay LONG in the glowing slot' };
    return { text: 'Shift to LONG at the receiver', hint: ShapeId.LONG };
  }
  if (cp >= 1) return { text: 'Cross to Windbridge Cliffs' };
  if (w.gate > 0) return shape === ShapeId.LONG ? { text: 'Slide LONG under the arch' } : { text: 'Low arch — only LONG fits', hint: ShapeId.LONG };
  return { text: 'Push the artifact onto the plate' };
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
  const near = dist < 5.5;
  const [fresh, setFresh] = useState(true);
  useEffect(() => {
    setFresh(true);
    const id = setTimeout(() => setFresh(false), 4200);
    return () => clearTimeout(id);
  }, [shape]);
  const caption = hint !== undefined ? SHAPES[hint] : fresh ? spec : null;
  return (
    <div className="shapebar">
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
        const gripping = p ? (p[8] & 2) !== 0 : false;
        return (
          <div key={i} className={'tag' + (s.you ? ' you' : '') + (!s.connected ? ' dc' : '') + (gripping ? ' grip' : '')} style={{ ['--c' as string]: SLOT_COLORS[i] }}>
            <span className="dot" />
            {s.name}
            {s.you && <span className="you-pill">you</span>}
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
  const me = snap?.pl.find((p) => p[0] === you);
  useEffect(() => {
    if (!me) return;
    if (!moved && Math.hypot(me[5], me[7]) > 1) setMoved(true);
    if (!gripped && (me[8] & 2) !== 0) setGripped(true);
  }, [me, moved, gripped]);
  const early = (snap?.el ?? 0) < 60000;
  let tip: React.ReactNode = null;
  if (early && !moved) tip = <><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move · <kbd>Space</kbd> jump</>;
  else if (early && !gripped) tip = <>Hold <kbd>E</kbd> near the artifact to grip &amp; pull</>;
  return (
    <>
      {tip && !open && <div className="tip-strip">{tip}</div>}
      {open ? (
        <div className="controls card" onClick={() => setOpen(false)}>
          <div><kbd>W A S D</kbd> move · <kbd>Space</kbd> jump</div>
          <div><kbd>E</kbd> hold to grip &amp; pull</div>
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

function StatusChips({ snap }: { snap: Snapshot | null }) {
  if (!snap) return null;
  const chips: { text: string; kind: string }[] = [];
  const z = snap.ar[2];
  if (z < -44 && z > -67 && snap.w.wind < -0.05) chips.push({ text: '💨 Gust incoming', kind: 'warn' });
  if (z < -44 && z > -67 && snap.w.wind > 0.2) chips.push({ text: '💨 Gust!', kind: 'bad' });
  if (snap.cp >= 3 && snap.w.fan > 0.2 && z < -118 && z > -146) chips.push({ text: '🌀 Fan blowing', kind: 'bad' });
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
  const ch = snap ? LEVEL.chapters[Math.min(3, snap.cp >= 3 ? 3 : snap.ar[2] < -83 ? 2 : snap.ar[2] < -41.5 ? 1 : 0)] : null;
  return (
    <div className="hud">
      {!cutscene && (
        <>
          <div className="top">
            <div className="timer-row">
              <div className="timer">{fmtTime(snap?.el ?? 0)}</div>
              {ch && <div className="chapter-name">{ch.sub.replace('Chapter ', 'Ch ')} · {ch.name}</div>}
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
