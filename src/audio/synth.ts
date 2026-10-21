// Procedural sound effects for the newer mechanics (piloting, springs, machinery, pickups). Original, made in code
// (CC0 like the rest of the project's own work); routed through the same SFX bus as the sampled sounds.
export type SynthName =
  | 'pilot_in'
  | 'pilot_out'
  | 'boing'
  | 'whoosh'
  | 'thump'
  | 'click'
  | 'puff'
  | 'chime'
  | 'creak'
  | 'gears'
  | 'bump'
  | 'tumble'
  | 'warn'
  | 'rumble'
  | 'crank';

type Ctx = AudioContext;

function env(ctx: Ctx, g: GainNode, t0: number, attack: number, hold: number, release: number, peak = 1) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.setValueAtTime(peak, t0 + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
}

let noiseBuf: AudioBuffer | null = null;
function noise(ctx: Ctx) {
  if (!noiseBuf || noiseBuf.sampleRate !== ctx.sampleRate) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < d.length; i++) {
      seed = (seed * 16807) % 2147483647;
      d[i] = (seed / 2147483647) * 2 - 1;
    }
  }
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  return src;
}

function tone(ctx: Ctx, out: AudioNode, type: OscillatorType, f0: number, f1: number, t0: number, dur: number, vol: number, attack = 0.005) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  env(ctx, g, t0, attack, 0, Math.max(0.01, dur - attack), vol);
  o.connect(g).connect(out);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
  return o;
}

function burst(ctx: Ctx, out: AudioNode, t0: number, dur: number, vol: number, filter: BiquadFilterType, f0: number, f1: number, q = 1) {
  const n = noise(ctx);
  const bf = ctx.createBiquadFilter();
  bf.type = filter;
  bf.Q.value = q;
  bf.frequency.setValueAtTime(f0, t0);
  bf.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  const g = ctx.createGain();
  env(ctx, g, t0, Math.min(0.03, dur * 0.3), 0, dur * 0.7, vol);
  n.connect(bf).connect(g).connect(out);
  n.start(t0, Math.random() * 0.5);
  n.stop(t0 + dur + 0.05);
}

/** Play one synthesized effect into `out` (rate scales pitch and speed). */
export function synth(ctx: Ctx, out: AudioNode, name: SynthName, rate = 1) {
  const t = ctx.currentTime + 0.005;
  const r = rate;
  switch (name) {
    case 'pilot_in':
      tone(ctx, out, 'sine', 260 * r, 980 * r, t, 0.14, 0.5);
      tone(ctx, out, 'triangle', 520 * r, 1960 * r, t, 0.12, 0.12);
      tone(ctx, out, 'sine', 1760 * r, 2400 * r, t + 0.1, 0.12, 0.15);
      break;
    case 'pilot_out':
      tone(ctx, out, 'sine', 900 * r, 240 * r, t, 0.13, 0.45);
      burst(ctx, out, t, 0.18, 0.18, 'lowpass', 1800, 500);
      break;
    case 'boing': {
      const o = ctx.createOscillator();
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(150 * r, t);
      o.frequency.exponentialRampToValueAtTime(420 * r, t + 0.32);
      lfo.frequency.value = 15;
      lg.gain.setValueAtTime(60 * r, t);
      lg.gain.exponentialRampToValueAtTime(2, t + 0.45);
      lfo.connect(lg).connect(o.frequency);
      env(ctx, g, t, 0.005, 0.05, 0.42, 0.55);
      o.connect(g).connect(out);
      o.start(t);
      lfo.start(t);
      o.stop(t + 0.55);
      lfo.stop(t + 0.55);
      break;
    }
    case 'whoosh':
      burst(ctx, out, t, 0.38 / r, 0.5, 'bandpass', 350 * r, 2200 * r, 1.4);
      break;
    case 'thump':
      tone(ctx, out, 'sine', 110 * r, 42 * r, t, 0.3, 0.9);
      burst(ctx, out, t, 0.22, 0.35, 'lowpass', 700, 120);
      break;
    case 'click':
      tone(ctx, out, 'square', 2200 * r, 1800 * r, t, 0.025, 0.12, 0.001);
      tone(ctx, out, 'square', 1500 * r, 1200 * r, t + 0.06, 0.03, 0.1, 0.001);
      break;
    case 'crank':
      for (let i = 0; i < 3; i++) tone(ctx, out, 'square', 900 * r, 700 * r, t + i * 0.07, 0.02, 0.07, 0.001);
      burst(ctx, out, t, 0.2, 0.08, 'bandpass', 1400, 900, 3);
      break;
    case 'puff':
      burst(ctx, out, t, 0.5, 0.6, 'lowpass', 1400 * r, 220 * r, 0.7);
      tone(ctx, out, 'sine', 180 * r, 90 * r, t, 0.25, 0.25);
      break;
    case 'chime':
      [880, 1108.7, 1318.5, 1760].forEach((f, i) => tone(ctx, out, 'triangle', f * r, f * r, t + i * 0.065, 0.22, 0.22));
      break;
    case 'creak': {
      const o = ctx.createOscillator();
      const bf = ctx.createBiquadFilter();
      const g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(70 * r, t);
      for (let i = 1; i <= 8; i++) o.frequency.linearRampToValueAtTime((70 + Math.random() * 45) * r, t + i * 0.06);
      bf.type = 'bandpass';
      bf.frequency.value = 650 * r;
      bf.Q.value = 7;
      env(ctx, g, t, 0.04, 0.3, 0.18, 0.5);
      o.connect(bf).connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.6);
      break;
    }
    case 'gears':
      for (let i = 0; i < 6; i++) burst(ctx, out, t + i * 0.065, 0.03, 0.25, 'bandpass', 2600 * r, 2000 * r, 5);
      tone(ctx, out, 'sine', 70 * r, 60 * r, t, 0.4, 0.15);
      break;
    case 'bump':
      tone(ctx, out, 'sine', 320 * r, 180 * r, t, 0.12, 0.35);
      break;
    case 'tumble': {
      const o = tone(ctx, out, 'sine', 700 * r, 210 * r, t, 0.34, 0.3);
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = 22;
      lg.gain.value = 40;
      lfo.connect(lg).connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + 0.4);
      break;
    }
    case 'warn':
      tone(ctx, out, 'triangle', 660 * r, 660 * r, t, 0.11, 0.22);
      tone(ctx, out, 'triangle', 880 * r, 880 * r, t + 0.14, 0.11, 0.22);
      break;
    case 'rumble':
      burst(ctx, out, t, 0.9, 0.35, 'lowpass', 260 * r, 140 * r, 0.8);
      tone(ctx, out, 'sawtooth', 46 * r, 52 * r, t, 0.9, 0.06);
      break;
  }
}
