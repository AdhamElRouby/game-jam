// Keyboard input. Camera yaw is fixed (looking toward -Z), so W = -Z, D = +X.
import { BTN_ABILITY, BTN_SPRINT, BTN_USE } from '../shared/protocol';

type ShiftHandler = (shape: number) => void;
type KeyHandler = (code: string) => void;

/** Keys the game owns while playing (never scroll the page or type into the browser). */
const GAME_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyF', 'KeyQ']);

class Input {
  private keys = new Set<string>();
  private jumpCount = 0;
  private respawnCount = 0;
  private pilotCount = 0;
  private useCount = 0;
  enabled = false;
  private shiftHandlers = new Set<ShiftHandler>();
  private keyHandlers = new Set<KeyHandler>();
  /** optional external override (automated tests) */
  override: { mx: number; mz: number; grab: boolean; use?: boolean; sprint?: boolean } | null = null;

  constructor() {
    window.addEventListener('keydown', (e) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
      // a HUD button keeps focus after a click; Space/Enter must not "click" it again mid-game
      if (this.enabled && tag === 'BUTTON' && (e.code === 'Space' || e.code === 'Enter')) {
        e.preventDefault();
        el?.blur();
      }
      this.keyHandlers.forEach((f) => f(e.code));
      if (!this.enabled) return;
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space') this.jumpCount++;
      if (e.code === 'KeyR') this.respawnCount++;
      if (e.code === 'KeyF') this.pilotCount++;
      if (e.code === 'KeyQ') this.useCount++;
      const shape = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3 }[e.code];
      if (shape !== undefined) this.shiftHandlers.forEach((f) => f(shape));
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    // never leave a key "held" when focus moves away (alt-tab, devtools, hidden tab)
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.keys.clear();
    });
  }

  onShift(f: ShiftHandler) {
    this.shiftHandlers.add(f);
    return () => this.shiftHandlers.delete(f);
  }
  onKey(f: KeyHandler) {
    this.keyHandlers.add(f);
    return () => this.keyHandlers.delete(f);
  }

  down(code: string) {
    return this.keys.has(code);
  }

  pressJump() {
    this.jumpCount++;
  }
  pressPilot() {
    this.pilotCount++;
  }
  pressUse() {
    this.useCount++;
  }

  sample() {
    const counters = { jump: this.jumpCount, respawn: this.respawnCount, pilot: this.pilotCount, use: this.useCount };
    if (!this.enabled) return { mx: 0, mz: 0, grab: false, buttons: 0, ...counters };
    if (this.override) {
      const o = this.override;
      return { mx: o.mx, mz: o.mz, grab: o.grab, buttons: (o.use ? BTN_USE : 0) | (o.sprint ? BTN_SPRINT : 0), ...counters };
    }
    const k = this.keys;
    let mx = 0;
    let mz = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) mz -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) mz += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    const m = Math.hypot(mx, mz);
    if (m > 1) {
      mx /= m;
      mz /= m;
    }
    let buttons = 0;
    if (k.has('KeyQ')) buttons |= BTN_USE;
    if (k.has('ShiftLeft') || k.has('ShiftRight')) buttons |= BTN_SPRINT;
    if (k.has('Space')) buttons |= BTN_ABILITY;
    return { mx, mz, grab: k.has('KeyE'), buttons, ...counters };
  }
}

export const input = new Input();
(window as any).__SH_INPUT = input;
