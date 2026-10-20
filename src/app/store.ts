// UI state (React side). The 3D scene reads high-frequency data from net/frame directly instead.
import { create } from 'zustand';
import type { LobbyState, Results } from '../shared/protocol';

export type Screen = 'landing' | 'lobby' | 'game';

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'warn' | 'good' | 'bad';
}

interface GameUI {
  screen: Screen;
  lobby: LobbyState | null;
  notice: { text: string; back?: boolean } | null;
  toasts: Toast[];
  results: Results | null;
  showResults: boolean;
  cutscene: boolean;
  menuOpen: boolean;
  banner: { title: string; sub: string; key: number } | null;
  connected: boolean;
  set: (p: Partial<GameUI>) => void;
  toast: (text: string, kind?: Toast['kind']) => void;
}

let toastId = 1;

export const useGame = create<GameUI>((set, get) => ({
  screen: 'landing',
  lobby: null,
  notice: null,
  toasts: [],
  results: null,
  showResults: false,
  cutscene: false,
  menuOpen: false,
  banner: null,
  connected: false,
  set: (p) => set(p),
  toast: (text, kind = 'info') => {
    const id = toastId++;
    const toasts = [...get().toasts.filter((t) => t.text !== text), { id, text, kind }].slice(-3);
    set({ toasts });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), 2600);
  },
}));
