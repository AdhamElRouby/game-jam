// Bounded, monotonic-clock diagnostics. Available through /healthz; no per-frame logging.
export class Samples {
  private values: number[] = [];
  private cursor = 0;
  add(n: number) { if (this.values.length < 600) this.values.push(n); else { this.values[this.cursor] = n; this.cursor = (this.cursor + 1) % 600; } }
  summary() {
    const v = this.values.slice().sort((a,b) => a-b), n = v.length;
    return { n, median: v[Math.floor(n * .5)] ?? 0, p95: v[Math.floor(n * .95)] ?? 0, max: v[n-1] ?? 0 };
  }
}
export const serverTiming = { tickIntervalMs: new Samples(), tickWorkMs: new Samples(), droppedSteps: 0, ticks: 0 };
