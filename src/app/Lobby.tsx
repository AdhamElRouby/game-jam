import { useEffect, useState } from 'react';
import { net } from '../net/net';
import { sfx } from '../audio/audio';
import { useGame } from './store';
import { SLOT_COLORS, SLOT_NAMES } from '../shared/constants';
import { Logo } from './Landing';

const TIPS = [
  'CUBE shrugs off wind, but won’t fit under low arches.',
  'LONG slides under arches and into receivers — but it turns slowly.',
  'TALL reaches high levers. Two couriers holding E keep it upright.',
  'ROUND races downhill… straight off a cliff if nobody holds on.',
  'Hold E near the artifact to grab a rope and pull together.',
  'Fell off? Press R to hop back next to your team.',
];

export function Portrait({ slot, name, empty, you, connected = true }: { slot: number; name?: string; empty?: boolean; you?: boolean; connected?: boolean }) {
  return (
    <div className={'portrait' + (empty ? ' empty' : '') + (you ? ' you' : '') + (!connected ? ' dc' : '')}>
      <svg width="78" height="88" viewBox="0 0 78 88">
        <ellipse cx="39" cy="82" rx="22" ry="5" fill="rgba(0,0,0,0.18)" />
        <rect x="12" y="20" width="54" height="62" rx="27" fill={empty ? '#c9c6dc' : SLOT_COLORS[slot]} />
        {!empty && (
          <>
            <ellipse cx="30" cy="40" rx="6" ry="7" fill="#fff" />
            <ellipse cx="48" cy="40" rx="6" ry="7" fill="#fff" />
            <circle cx="31" cy="41" r="3.2" fill="#2a2338" />
            <circle cx="49" cy="41" r="3.2" fill="#2a2338" />
            <path d="M33 52 Q39 57 45 52" stroke="#2a2338" strokeWidth="2.5" fill="none" strokeLinecap="round" />
            {slot === 0 && <path d="M14 24 Q39 0 64 24 L68 26 L10 26 Z" fill="#ffb13b" />}
            {slot === 1 && (
              <>
                <path d="M14 26 Q39 2 64 26 Z" fill="#2f5fa8" />
                <circle cx="39" cy="8" r="6" fill="#fff" />
              </>
            )}
            {slot === 2 && <path d="M8 27 Q39 -2 70 27 Z" fill="#3f8a4f" />}
          </>
        )}
        {empty && <text x="39" y="58" textAnchor="middle" fontSize="26" fill="#8f8aa8" fontFamily="Fredoka, sans-serif">?</text>}
      </svg>
      <div className="portrait-name" style={{ color: empty ? '#8f8aa8' : SLOT_COLORS[slot] }}>
        {empty ? 'waiting…' : name}
        {you && <span className="you-pill">you</span>}
      </div>
    </div>
  );
}

export function Lobby() {
  const lobby = useGame((s) => s.lobby);
  const [tip, setTip] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTip((t) => (t + 1) % TIPS.length), 4200);
    return () => clearInterval(id);
  }, []);
  const filled = lobby?.slots.filter(Boolean).length ?? 0;
  const cap = lobby?.slots.length ?? 3;
  const cancel = () => {
    sfx.play('ui_click');
    net.leave();
    useGame.getState().set({ screen: 'landing', lobby: null });
  };
  return (
    <div className="overlay lobby">
      <Logo small />
      <div className="card lobby-card">
        <h2>{lobby ? (filled < cap ? 'Finding couriers…' : 'Team assembled!') : 'Connecting…'}</h2>
        <div className="count">
          {filled}/{cap}
        </div>
        <div className="portraits">
          {[0, 1, 2].slice(0, cap).map((i) => {
            const s = lobby?.slots[i];
            return <Portrait key={i} slot={i} name={s?.name ?? SLOT_NAMES[i]} empty={!s} you={s?.you} connected={s?.connected} />;
          })}
        </div>
        {lobby?.code && (
          <div className="code-line">
            Room code <b>{lobby.code}</b> — friends enter the same code
          </div>
        )}
        <div className="tip">💡 {TIPS[tip]}</div>
        <button className="secondary" onClick={cancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
