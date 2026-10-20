import { useEffect, useState } from 'react';
import { net } from '../net/net';
import { sfx } from '../audio/audio';
import { useGame } from './store';

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

export function Menu() {
  const s = useAudioSettings();
  const set = useGame((st) => st.set);
  return (
    <div className="overlay menu" onClick={() => set({ menuOpen: false })}>
      <div className="card menu-card" onClick={(e) => e.stopPropagation()}>
        <h2>Paused menu</h2>
        <p className="small-note">The run keeps going for your teammates!</p>
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
        <div className="menu-controls">
          <div><kbd>W A S D</kbd> move · <kbd>Space</kbd> jump</div>
          <div><kbd>E</kbd> hold near the artifact to grip a rope</div>
          <div><kbd>1</kbd> CUBE · <kbd>2</kbd> LONG · <kbd>3</kbd> TALL · <kbd>4</kbd> ROUND</div>
          <div><kbd>R</kbd> hop back to your team · <kbd>T</kbd> vote to recall the artifact</div>
        </div>
        <div className="row">
          <button className="secondary" onClick={() => net.action('resetVote')}>
            Artifact stuck? Vote recall (T)
          </button>
        </div>
        <div className="row">
          <button className="play" onClick={() => set({ menuOpen: false })}>
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
