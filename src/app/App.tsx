import { useEffect } from 'react';
import { Scene } from '../render/Scene';
import { net } from '../net/net';
import { input } from '../net/input';
import { sfx } from '../audio/audio';
import { useGame } from './store';
import { Landing } from './Landing';
import { Lobby } from './Lobby';
import { Hud } from './Hud';
import { Results } from './Results';
import { Menu } from './Menu';
import { WorldLabels } from './WorldLabels';

export function App() {
  const screen = useGame((s) => s.screen);
  const lobby = useGame((s) => s.lobby);
  const menuOpen = useGame((s) => s.menuOpen);
  const set = useGame((s) => s.set);

  useEffect(() => {
    const offs = [
      net.on('lobby', (l) => {
        const prev = useGame.getState().lobby;
        const inGame = l.phase !== 'waiting';
        set({ lobby: l, screen: inGame ? 'game' : 'lobby' });
        if (l.phase === 'countdown' && prev?.phase !== 'countdown') {
          set({ results: null, showResults: false, cutscene: false, banner: null });
        }
        if (inGame) void sfx.playMusic('music_main');
      }),
      net.on('notice', (n) => {
        set({ notice: n });
        if (n.back) useGame.getState().toast(n.text, 'warn');
      }),
      net.on('results', (r) => set({ results: r, showResults: true })),
      net.on('sfx', (n) => sfx.play(n as any, { vol: 0.7 })),
      net.on('conn', (c) => set({ connected: c })),
    ];
    return () => offs.forEach((f) => f());
  }, [set]);

  // keyboard: shifting, menu, reset vote
  useEffect(() => {
    const offShift = input.onShift((shape) => {
      const l = useGame.getState().lobby;
      if (l?.phase === 'playing' && !useGame.getState().menuOpen) net.shift(shape);
    });
    const offKey = input.onKey((code) => {
      sfx.unlock();
      const st = useGame.getState();
      if (code === 'Escape' && st.screen === 'game') st.set({ menuOpen: !st.menuOpen });
      if (code === 'KeyT' && st.lobby?.phase === 'playing') net.action('resetVote');
      if (code === 'KeyM') sfx.set({ muted: !sfx.settings.muted });
    });
    return () => {
      offShift();
      offKey();
    };
  }, []);

  useEffect(() => {
    input.enabled = screen === 'game' && lobby?.phase === 'playing' && !menuOpen;
  }, [screen, lobby?.phase, menuOpen]);

  return (
    <div className="app">
      <div className="canvas-wrap">
        <Scene />
      </div>
      <WorldLabels />
      {screen === 'landing' && <Landing />}
      {screen === 'lobby' && <Lobby />}
      {screen === 'game' && <Hud />}
      {screen === 'game' && <Results />}
      {menuOpen && screen === 'game' && <Menu />}
    </div>
  );
}
