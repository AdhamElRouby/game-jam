import { useState } from 'react';
import { net } from '../net/net';
import { sfx } from '../audio/audio';
import { useGame } from './store';
import { ShapeIcon } from './ShapeIcon';
import { AudioToggle } from './Menu';

export function Logo({ small = false }: { small?: boolean }) {
  return (
    <div className={'logo' + (small ? ' small' : '')}>
      <div className="logo-shift">SHIFT</div>
      <div className="logo-happens">HAPPENS</div>
      <div className="logo-tag">Three friends. One shape. Many problems.</div>
    </div>
  );
}

export function Landing() {
  const [name, setName] = useState(() => localStorage.getItem('sh_name') || '');
  const [code, setCode] = useState('');
  const [showCode, setShowCode] = useState(false);
  const notice = useGame((s) => s.notice);
  const connected = useGame((s) => s.connected);
  const dev = new URLSearchParams(location.search).has('dev');

  const play = (solo = false) => {
    sfx.unlock();
    sfx.play('ui_click');
    void sfx.playMusic('music_main');
    const n = name.trim() || `Courier${Math.floor(Math.random() * 90 + 10)}`;
    localStorage.setItem('sh_name', name.trim());
    useGame.getState().set({ notice: null, screen: 'lobby' });
    net.join(n, showCode ? code.trim() : undefined, solo);
  };

  return (
    <div className="overlay landing">
      <div className="landing-left">
        <Logo />
        <div className="story card">
          The King wants a <b>giant golden object</b> for his party. You and two friends must bring it across the floating islands.
          It can <b>change shape</b>, and every shape is good at some things and bad at others.
        </div>
        <div className="shape-row">
          {[0, 1, 2, 3].map((s) => (
            <ShapeIcon key={s} shape={s} size={44} label />
          ))}
        </div>
      </div>
      <div className="landing-panel card">
        <label className="field">
          <span>Nickname (optional)</span>
          <input value={name} maxLength={16} placeholder="Courier" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && play()} />
        </label>
        {showCode ? (
          <label className="field">
            <span>Room code — share it with 2 friends</span>
            <input value={code} maxLength={8} placeholder="e.g. PIZZA" onChange={(e) => setCode(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && play()} />
          </label>
        ) : (
          <button className="link" onClick={() => setShowCode(true)}>
            Playing with friends? Use a room code
          </button>
        )}
        <button className="play" disabled={!connected} onClick={() => play()} onMouseEnter={() => sfx.play('ui_hover', { vol: 0.4 })}>
          {connected ? 'PLAY' : 'Connecting…'}
        </button>
        {dev && (
          <button className="link" onClick={() => play(true)}>
            Solo test room (dev)
          </button>
        )}
        <div className="mini-controls">
          <span><kbd>WASD</kbd> walk</span>
          <span><b>Mouse</b> look</span>
          <span><kbd>E</kbd> grab</span>
          <span><kbd>F</kbd> climb in</span>
          <span><kbd>1</kbd>–<kbd>4</kbd> shape</span>
          <span><kbd>H</kbd> help</span>
        </div>
        <div className="small-note">Exactly 3 players • no sign-up • auto-matchmaking</div>
        {notice && <div className="notice">{notice.text}</div>}
      </div>
      <div className="corner-audio">
        <AudioToggle />
      </div>
    </div>
  );
}
