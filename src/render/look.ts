// Camera look input (local only, never sent to the server). Click the game to capture the mouse (pointer lock), or drag
// with a mouse button held; a touchpad works the same way. Scroll or pinch zooms, a sideways two-finger swipe turns.
// CameraRig drains the accumulated deltas once per rendered frame.

const KEY = 'sh_look';
const BASE = 0.0024; // radians per pixel at sensitivity 1

export interface LookSettings {
  sens: number; // 0.3 .. 2.5
  invertY: boolean;
}

function load(): LookSettings {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return { sens: typeof s.sens === 'number' ? Math.min(2.5, Math.max(0.3, s.sens)) : 1, invertY: !!s.invertY };
  } catch {
    return { sens: 1, invertY: false };
  }
}

/** Wheel delta in pixels whatever the device reports. */
function wheelPx(e: WheelEvent, d: number) {
  return e.deltaMode === 1 ? d * 16 : e.deltaMode === 2 ? d * 100 : d;
}

class Look {
  /** turn input since the last drain (radians; + = mouse right / down) */
  private dx = 0;
  private dy = 0;
  /** zoom input since the last drain (+ = out) */
  private dz = 0;
  /** total radians the player has turned the camera, and zoom steps taken (tutorial tips) */
  turned = 0;
  zoomed = 0;
  /** the camera may be turned right now (in a run, no menu or results open) */
  enabled = false;
  locked = false;
  /** performance.now() of the last time the mouse was released from pointer lock */
  unlockedAt = -1e9;
  settings = load();
  private el: HTMLElement | null = null;
  private drag: number | null = null; // mouse button held for drag-to-look (no pointer lock)
  private listeners = new Set<() => void>();

  attach(el: HTMLElement) {
    if (this.el === el) return;
    this.el = el;
    el.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (e.button === 0 || e.button === 2) this.drag = e.button;
      if (e.button === 0) this.lock();
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    window.addEventListener('mouseup', (e) => {
      if (e.button === this.drag) this.drag = null;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.enabled || (!this.locked && this.drag === null)) return;
      // the first events after a lock can carry a huge jump on some platforms
      const mx = Math.max(-200, Math.min(200, e.movementX || 0));
      const my = Math.max(-200, Math.min(200, e.movementY || 0));
      this.turn(mx * BASE * this.settings.sens, my * BASE * this.settings.sens);
    });
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === this.el;
      if (was && !this.locked) this.unlockedAt = performance.now();
      this.listeners.forEach((f) => f());
    });
    window.addEventListener('blur', () => (this.drag = null));
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault(); // no page scroll, no browser pinch-zoom
    if (!this.enabled) return;
    const x = wheelPx(e, e.deltaX);
    const y = wheelPx(e, e.deltaY);
    if (e.ctrlKey) {
      this.zoom(y * 0.02); // touchpad pinch (small deltas)
    } else if (!e.shiftKey && Math.abs(x) > Math.abs(y)) {
      this.turn(x * 0.0035 * this.settings.sens, 0); // touchpad sideways swipe turns the camera
    } else {
      // Shift+wheel arrives as a sideways scroll on some systems (Shift is sprint): still a zoom
      this.zoom((y || x) * 0.0035);
    }
  }

  /** Feed turn input in radians (also used by tests). */
  turn(dx: number, dy: number) {
    this.dx += dx;
    this.dy += dy * (this.settings.invertY ? -1 : 1);
    this.turned += Math.abs(dx) + Math.abs(dy);
  }

  zoom(steps: number) {
    this.dz += steps;
    this.zoomed += Math.abs(steps);
  }

  drain() {
    const out = { dx: this.dx, dy: this.dy, dz: this.dz };
    this.dx = this.dy = this.dz = 0;
    return out;
  }

  lock() {
    const el = this.el;
    if (!el || this.locked || !this.enabled || !el.requestPointerLock) return;
    try {
      const r = el.requestPointerLock() as unknown as Promise<void> | undefined;
      r?.catch?.(() => {}); // refused (too soon after Esc, unsupported): drag still works
    } catch {
      /* unsupported */
    }
  }

  unlock() {
    this.drag = null;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Esc that only freed the mouse must not also open the menu. */
  escFreedMouse() {
    return this.locked || performance.now() - this.unlockedAt < 250;
  }

  set(p: Partial<LookSettings>) {
    this.settings = { ...this.settings, ...p };
    localStorage.setItem(KEY, JSON.stringify(this.settings));
    this.listeners.forEach((f) => f());
  }

  on(f: () => void) {
    this.listeners.add(f);
    return () => {
      this.listeners.delete(f);
    };
  }
}

export const look = new Look();
(window as any).__SH_LOOK = look;
