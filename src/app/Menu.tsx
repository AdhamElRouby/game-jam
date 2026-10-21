import { useEffect, useState } from 'react';
import { net } from '../net/net';
import { sfx } from '../audio/audio';
import { useGame } from './store';
import { quality, type Quality } from '../render/quality';
import { look } from '../render/look';
import { ControlsList } from './Hud';

function useAudioSettings() {
  const [s, setS] = useState(sfx.settings);
  useEffect(() => {
    const off = sfx.onChange(() => setS({ ...sfx.settings }));
    return () => {
      off();
    };
  }, []);
  return s;
}

export function AudioToggle() {
  const s = useAudioSettings();
  return (
    <button
      className="icon-btn"
      title="Mute (M)"
      onClick={() => {
        sfx.unlock();
        sfx.set({ muted: !s.muted });
      }}
    >
      {s.muted ? '🔇' : '🔊'}
    </button>
  );
}

const QUALITY_TIP: Record<Quality, string> = {
  high: 'Sharpest picture and every effect (a strong graphics card)',
  medium: 'Recommended: every effect at a lighter resolution',
  low: 'No post effects: for slow computers',
};

function QualityPicker() {
  const [q, setQ] = useState<Quality>(quality.level);
  useEffect(() => quality.on(setQ), []);
  return (
    <div className="seg">
      {(['high', 'medium', 'low'] as Quality[]).map((v) => (
        <button key={v} className={'seg-btn' + (q === v ? ' on' : '')} title={QUALITY_TIP[v]} onClick={() => quality.set(v)}>
          {v}
        </button>
      ))}
    </div>
  );
}

function useLookSettings() {
  const [s, setS] = useState(look.settings);
  useEffect(() => look.on(() => setS({ ...look.settings })), []);
  return s;
}

export function Menu() {
  const s = useAudioSettings();
  const ls = useLookSettings();
  const set = useGame((st) => st.set);
  const resume = () => {
    set({ menuOpen: false });
    look.enabled = true;
    look.lock(); // this click is a user gesture: capture the mouse again
  };
  return (
    <div className="overlay menu" onClick={() => set({ menuOpen: false })}>
      <div className="card menu-card" onClick={(e) => e.stopPropagation()}>
        <h2>Menu</h2>
        <p className="small-note">The game keeps going for your teammates!</p>
        <label className="slider">
          <span>Music</span>
          <input type="range" min={0} max={1} step={0.05} value={s.music} onChange={(e) => sfx.set({ music: Number(e.target.value) })} />
        </label>
        <label className="slider">
          <span>Sound effects</span>
          <input type="range" min={0} max={1} step={0.05} value={s.sfx} onChange={(e) => sfx.set({ sfx: Number(e.target.value) })} />
        </label>
        <label className="check">
          <input type="checkbox" checked={s.muted} onChange={(e) => sfx.set({ muted: e.target.checked })} /> Mute all (M)
        </label>
        <label className="slider">
          <span>Mouse speed</span>
          <input type="range" min={0.3} max={2.5} step={0.05} value={ls.sens} onChange={(e) => look.set({ sens: Number(e.target.value) })} />
        </label>
        <label className="check">
          <input type="checkbox" checked={ls.invertY} onChange={(e) => look.set({ invertY: e.target.checked })} /> Invert mouse up / down
        </label>
        <div className="slider">
          <span>Graphics</span>
          <QualityPicker />
        </div>
        <div className="menu-controls">
          <ControlsList />
        </div>
        <div className="row">
          <button className="secondary" onClick={() => net.action('resetVote')}>
            Golden object stuck? Call it back (T)
          </button>
        </div>
        <div className="row">
          <button className="play" onClick={resume}>
            Resume
          </button>
          <button
            className="secondary danger"
            onClick={() => {
              net.leave();
              set({ menuOpen: false, screen: 'landing', lobby: null });
            }}
          >
            Leave game
          </button>
        </div>
      </div>
    </div>
  );
}
