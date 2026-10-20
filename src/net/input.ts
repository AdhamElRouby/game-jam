// Keyboard input. Camera yaw is fixed (looking toward -Z), so W = -Z, D = +X.
type ShiftHandler = (shape: number) => void;
type KeyHandler = (code: string) => void;

class Input {
  private keys = new Set<string>();
  private jumpCount = 0;
  private respawnCount = 0;
  enabled = false;
  private shiftHandlers = new Set<ShiftHandler>();
  private keyHandlers = new Set<KeyHandler>();
  /** optional external override (automated tests) */
  override: { mx: number; mz: number; grab: boolean } | null = null;

  constructor() {
    window.addEventListener('keydown', (e) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      this.keyHandlers.forEach((f) => f(e.code));
      if (!this.enabled) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space') this.jumpCount++;
      if (e.code === 'KeyR') this.respawnCount++;
      const shape = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3 }[e.code];
      if (shape !== undefined) this.shiftHandlers.forEach((f) => f(shape));
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
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

  sample() {
    if (!this.enabled) return { mx: 0, mz: 0, jump: this.jumpCount, grab: false, respawn: this.respawnCount };
    if (this.override) return { ...this.override, jump: this.jumpCount, respawn: this.respawnCount };
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
    return { mx, mz, jump: this.jumpCount, grab: k.has('KeyE'), respawn: this.respawnCount };
  }
}

export const input = new Input();
(window as any).__SH_INPUT = input;
