// Keyboard input. WASD is relative to the camera: the camera rig sets `camYaw` every frame and `sample()` turns the
// keys into a world-space direction (yaw 0 looks toward -Z, so W = -Z and D = +X).
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
  private active = false;
  private changeHandlers = new Set<() => void>();
  get enabled() { return this.active; }
  set enabled(value: boolean) {
    if (this.active === value) return;
    this.active = value;
    this.keys.clear();
    this.changed();
  }
  private shiftHandlers = new Set<ShiftHandler>();
  private keyHandlers = new Set<KeyHandler>();
  /** heading of the local camera (radians); sent along so the server knows which way "left" is */
  camYaw = 0;
  /** optional external override (automated tests): world-space direction, camera yaw ignored */
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
      if (e.repeat) return;
      this.keyHandlers.forEach((f) => f(e.code));
      if (!this.enabled) return;
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      this.keys.add(e.code);
      if (e.code === 'Space') this.jumpCount++;
      if (e.code === 'KeyR') this.respawnCount++;
      if (e.code === 'KeyF') this.pilotCount++;
      if (e.code === 'KeyQ') this.useCount++;
      const shape = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3 }[e.code];
      if (shape !== undefined) this.shiftHandlers.forEach((f) => f(shape));
      this.changed();
    });
    window.addEventListener('keyup', (e) => { if (this.keys.delete(e.code)) this.changed(); });
    // never leave a key "held" when focus moves away (alt-tab, devtools, hidden tab)
    window.addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.clear();
    });
  }

  private changed() { this.changeHandlers.forEach(f => f()); }
  private clear() { this.keys.clear(); this.changed(); }
  onChange(f: () => void) { this.changeHandlers.add(f); return () => this.changeHandlers.delete(f); }

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
    this.changed();
  }
  pressPilot() {
    this.pilotCount++;
    this.changed();
  }
  pressUse() {
    this.useCount++;
    this.changed();
  }

  sample() {
    const counters = { jump: this.jumpCount, respawn: this.respawnCount, pilot: this.pilotCount, use: this.useCount, camYaw: this.camYaw };
    if (!this.enabled) return { mx: 0, mz: 0, grab: false, buttons: 0, ...counters };
    if (this.override) {
      const o = this.override;
      return { mx: o.mx, mz: o.mz, grab: o.grab, buttons: (o.use ? BTN_USE : 0) | (o.sprint ? BTN_SPRINT : 0), ...counters, camYaw: 0 };
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
    // camera space -> world: right = (cos y, -sin y), forward = (-sin y, -cos y)
    const c = Math.cos(this.camYaw), sn = Math.sin(this.camYaw);
    const wx = mx * c + mz * sn;
    const wz = -mx * sn + mz * c;
    mx = wx;
    mz = wz;
    let buttons = 0;
    if (k.has('KeyQ')) buttons |= BTN_USE;
    if (k.has('ShiftLeft') || k.has('ShiftRight')) buttons |= BTN_SPRINT;
    if (k.has('Space')) buttons |= BTN_ABILITY;
    return { mx, mz, grab: k.has('KeyE'), buttons, ...counters };
  }
}

export const input = new Input();
(window as any).__SH_INPUT = input;
