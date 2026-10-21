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
import { PerfOverlay } from './PerfOverlay';
import { mapAt } from '../shared/maps';
import { look } from '../render/look';
import { toggleInsideView } from '../render/CameraRig';

export function App() {
  const screen = useGame((s) => s.screen);
  const lobby = useGame((s) => s.lobby);
  const menuOpen = useGame((s) => s.menuOpen);
  const showResults = useGame((s) => s.showResults);
  const cutscene = useGame((s) => s.cutscene);
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
        if (inGame) {
          const map = mapAt(l.map ?? 0);
          void sfx.playMusic(map.music, 1.5, map.musicRate ?? 1);
        }
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

  // keyboard: shifting, menu, help, inside view, reset vote
  useEffect(() => {
    const offShift = input.onShift((shape) => {
      const l = useGame.getState().lobby;
      if (l?.phase === 'playing' && !useGame.getState().menuOpen) net.shift(shape);
    });
    const offKey = input.onKey((code) => {
      sfx.unlock();
      const st = useGame.getState();
      // the Esc that frees a captured mouse doesn't also open the menu (and frees it if the browser didn't)
      if (code === 'Escape' && look.locked) look.unlock();
      else if (code === 'Escape' && st.screen === 'game' && !look.escFreedMouse()) st.set({ menuOpen: !st.menuOpen, help: false });
      if (code === 'KeyH' && st.screen === 'game') st.set({ help: !st.help });
      if (code === 'KeyV' && st.lobby?.phase === 'playing') toggleInsideView();
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

  // the camera can be turned during a run (also while counting down); menus, results and cutscenes free the mouse
  useEffect(() => {
    const ph = lobby?.phase;
    look.enabled = screen === 'game' && !menuOpen && !showResults && !cutscene && (ph === 'countdown' || ph === 'playing' || ph === 'resuming');
    if (!look.enabled) look.unlock();
  }, [screen, lobby?.phase, menuOpen, showResults, cutscene]);

  return (
    <div className="app">
      <div className="canvas-wrap">
        <Scene />
      </div>
      <WorldLabels />
      {screen === 'landing' && <Landing />}
      {screen === 'lobby' && <Lobby />}
      {screen === 'game' && <Hud />}
      <PerfOverlay />
      {screen === 'game' && <Results />}
      {menuOpen && screen === 'game' && <Menu />}
    </div>
  );
}
