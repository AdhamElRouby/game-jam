import { useEffect } from 'react';
import { net } from '../net/net';
import { sfx } from '../audio/audio';
import { useGame } from './store';
import { fmtTime } from './Hud';
import { SLOT_COLORS } from '../shared/constants';

export function Results() {
  const r = useGame((s) => s.results);
  const show = useGame((s) => s.showResults);
  const lobby = useGame((s) => s.lobby);
  useEffect(() => {
    if (show) sfx.play('confetti_pop', { vol: 0.5 });
  }, [show]);
  if (!r || !show) return null;
  const meReady = lobby?.slots.find((s) => s?.you)?.again;
  return (
    <div className="overlay results">
      <div className="card results-card">
        <div className="results-title">Delivered!</div>
        <div className="results-sub">The King has a brand-new… doorstop.</div>
        <div className="crowns">
          {[1, 2, 3].map((i) => (
            <span key={i} className={'crown' + (i <= r.crowns ? ' on' : '')}>
              👑
            </span>
          ))}
        </div>
        <div className="rank">{r.title}</div>
        <div className="stats">
          <div>
            <span>Team time</span>
            <b>{fmtTime(r.timeMs)}</b>
          </div>
          <div>
            <span>Artifact drops (+7s each)</span>
            <b>{r.drops}</b>
          </div>
          <div>
            <span>Courier tumbles</span>
            <b>{r.falls}</b>
          </div>
          <div>
            <span>Shape shifts</span>
            <b>{r.shifts}</b>
          </div>
          <div className="score">
            <span>Score</span>
            <b>{r.score}</b>
          </div>
        </div>
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
        <div className="row">
          <button
            className="play"
            disabled={!!meReady}
            onClick={() => {
              sfx.play('ui_click');
              net.action('again');
            }}
          >
            {meReady ? 'Waiting for team…' : 'Play again'}
          </button>
          <button
            className="secondary"
            onClick={() => {
              sfx.play('ui_click');
              net.leave();
              useGame.getState().set({ screen: 'landing', lobby: null, results: null, showResults: false, cutscene: false });
            }}
          >
            Menu
          </button>
        </div>
        <div className="small-note">score = 1200 − 2×seconds − 35×drops − 10×tumbles</div>
      </div>
    </div>
  );
}
