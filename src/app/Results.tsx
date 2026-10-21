import { useEffect, useMemo, useState } from 'react';
import { net } from '../net/net';
import { sfx } from '../audio/audio';
import { useGame } from './store';
import { fmtTime } from './Hud';
import { SLOT_COLORS } from '../shared/constants';
import { MAPS, mapAt } from '../shared/maps';
import type { Results as R } from '../shared/protocol';

interface Rec {
  bestMs: number;
  bestScore: number;
  crowns: number;
}
type Records = Record<string, Rec> & { adventure?: Rec };

function loadRecords(): Records {
  try {
    return JSON.parse(localStorage.getItem('sh_records') || '{}');
  } catch {
    return {};
  }
}

/** Store this browser's bests once per result; returns which ones were beaten. */
function useRecords(r: R | null) {
  const [state, setState] = useState<{ rec: Records; newTime: boolean; newScore: boolean; newAdv: boolean }>({ rec: loadRecords(), newTime: false, newScore: false, newAdv: false });
  useEffect(() => {
    if (!r) return;
    const rec = loadRecords();
    const id = mapAt(r.map).id;
    const old = rec[id];
    const newTime = !old || r.timeMs < old.bestMs;
    const newScore = !old || r.score > old.bestScore;
    rec[id] = { bestMs: Math.min(old?.bestMs ?? Infinity, r.timeMs), bestScore: Math.max(old?.bestScore ?? 0, r.score), crowns: Math.max(old?.crowns ?? 0, r.crowns) };
    let newAdv = false;
    if (r.adventure) {
      const a = rec.adventure;
      newAdv = !a || r.adventure.score > a.bestScore;
      rec.adventure = { bestMs: Math.min(a?.bestMs ?? Infinity, r.adventure.timeMs), bestScore: Math.max(a?.bestScore ?? 0, r.adventure.score), crowns: Math.max(a?.crowns ?? 0, r.adventure.crowns) };
    }
    localStorage.setItem('sh_records', JSON.stringify(rec));
    setState({ rec: { ...rec, [id]: old ?? rec[id] }, newTime: newTime && !!old, newScore: newScore && !!old, newAdv: newAdv && !!rec.adventure });
  }, [r]);
  return state;
}

function Crowns({ n, max = 3, size = 44 }: { n: number; max?: number; size?: number }) {
  return (
    <div className={'crowns' + (size > 30 ? ' big' : '')} style={{ fontSize: size }}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={'crown' + (i < n ? ' on' : '')}>
          👑
        </span>
      ))}
    </div>
  );
}

/** Majority rule text (matches the server: more than half of the team decides). */
function voteNote(team: number, voted: boolean) {
  if (team <= 1) return 'Pick what happens next';
  const need = Math.floor(team / 2) + 1;
  return voted ? `Waiting for a teammate to agree (${need} of ${team} decide)…` : `${need === 2 ? 'Two' : need} of you decide what happens next`;
}

export function Results() {
  const r = useGame((s) => s.results);
  const show = useGame((s) => s.showResults);
  const lobby = useGame((s) => s.lobby);
  const [picking, setPicking] = useState(false);
  const { rec, newTime, newScore, newAdv } = useRecords(show ? r : null);
  useEffect(() => {
    if (show) sfx.play('confetti_pop', { vol: 0.5 });
    setPicking(false);
  }, [show]);
  const map = useMemo(() => (r ? mapAt(r.map) : null), [r]);
  if (!r || !show || !map) return null;
  const myVote = lobby?.votes?.[lobby.you] ?? null;
  const adventure = lobby?.mode !== 'single';
  const last = r.map >= MAPS.length - 1;
  const vote = (v: string) => {
    sfx.play('ui_click');
    net.action('vote', v);
  };
  const best = rec[map.id];
  const voters = (v: string) =>
    (lobby?.votes ?? [])
      .map((x, i) => (x === v ? i : -1))
      .filter((i) => i >= 0)
      .map((i) => <span key={i} className="vote-dot" style={{ background: SLOT_COLORS[i] }} />);
  const VoteBtn = ({ v, label, primary }: { v: string; label: string; primary?: boolean }) => (
    <button className={(primary ? 'play' : 'secondary') + (myVote === v ? ' voted' : '')} onClick={() => vote(v)}>
      {label}
      <span className="voters">{voters(v)}</span>
    </button>
  );
  return (
    <div className="overlay results">
      <div className="card results-card">
        <div className="results-kicker">
          {map.sub} · {map.name}
        </div>
        <div className="results-title">{r.adventure ? 'Delivered to the King!' : 'Delivered!'}</div>
        {r.adventure && <div className="results-sub">The King has a brand-new… doorstop.</div>}
        <Crowns n={r.crowns} />
        <div className="rank">{r.title}</div>
        <ul className="achievements">
          {r.achievements.map((a, i) => (
            <li key={i} className={a.got ? 'got' : ''}>
              <span>{a.got ? '✔' : '✘'}</span> {a.label}
            </li>
          ))}
        </ul>
        <div className="stats">
          <div>
            <span>Team time {r.drops ? `(incl. +${r.drops * 7}s drops)` : ''}</span>
            <b>
              {fmtTime(r.timeMs)} <small>par {fmtTime(r.par * 1000)}</small>
            </b>
          </div>
          <div>
            <span>Royal stamps</span>
            <b>
              {r.stamps}/{r.stampTotal}
            </b>
          </div>
          <div>
            <span>Artifact drops · courier tumbles</span>
            <b>
              {r.drops} · {r.falls}
            </b>
          </div>
          <div>
            <span>Shape shifts (never penalized)</span>
            <b>{r.shifts}</b>
          </div>
          <div className="score">
            <span>Score</span>
            <b>{r.score}</b>
          </div>
          {best && (
            <div className="records">
              {newTime ? '🏅 New best time!' : `Best ${fmtTime(best.bestMs)}`} · {newScore ? '🏅 New best score!' : `best score ${best.bestScore}`}
            </div>
          )}
        </div>
        {r.adventure && (
          <div className="adventure-total">
            <div>Whole adventure</div>
            <Crowns n={r.adventure.crowns} max={r.adventure.maxCrowns} size={18} />
            <b>
              {r.adventure.score} pts · {fmtTime(r.adventure.timeMs)} {newAdv ? '· 🏅 record!' : ''}
            </b>
          </div>
        )}
        <div className="team-line">
          {r.names.map((n, i) =>
            n ? (
              <span key={i} style={{ color: SLOT_COLORS[i] }}>
                {n}
                {lobby?.slots[i]?.again ? ' ✓' : ''}
              </span>
            ) : null,
          )}
        </div>
        {picking ? (
          <div className="map-grid">
            {MAPS.map((m) => (
              <button key={m.id} className={'map-pick' + (myVote === `map:${m.index}` ? ' voted' : '')} onClick={() => vote(`map:${m.index}`)}>
                <small>{m.sub}</small>
                <b>{m.name}</b>
                <span className="map-best">{rec[m.id] ? `${'👑'.repeat(rec[m.id].crowns)} ${fmtTime(rec[m.id].bestMs)}` : 'not played yet'}</span>
                <span className="voters">{voters(`map:${m.index}`)}</span>
              </button>
            ))}
            <button className="link" onClick={() => setPicking(false)}>
              back
            </button>
          </div>
        ) : (
          <div className="row vote-row">
            {adventure && !last && <VoteBtn v="next" label={`Next: ${mapAt(r.map + 1).name} →`} primary />}
            {(last || !adventure) && <VoteBtn v="again" label="New adventure" primary />}
            <VoteBtn v="retry" label="Retry this world" />
            <button className="secondary" onClick={() => setPicking(true)}>
              Pick a world…
            </button>
          </div>
        )}
        <div className="vote-note">{voteNote(lobby?.slots.filter(Boolean).length ?? 3, !!myVote)}</div>
        <div className="row">
          <button
            className="link"
            onClick={() => {
              sfx.play('ui_click');
              net.leave();
              useGame.getState().set({ screen: 'landing', lobby: null, results: null, showResults: false, cutscene: false });
            }}
          >
            Leave to menu
          </button>
        </div>
      </div>
    </div>
  );
}
