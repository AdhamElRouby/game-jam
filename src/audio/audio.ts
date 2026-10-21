// Web Audio manager: unlocked on the first user gesture, seamless music loop, rate-limited SFX, persisted volumes.
import { synth, type SynthName } from './synth';

const SFX_NAMES = [
  'ui_click', 'ui_hover', 'join', 'countdown_tick', 'countdown_go', 'jump', 'land', 'step', 'grip', 'release',
  'shift', 'shift_fail', 'impact_wood', 'impact_heavy', 'impact_metal', 'wind_gust', 'lever', 'gate_open',
  'bridge_unfold', 'lift_start', 'checkpoint', 'fall_poof', 'respawn', 'victory', 'fail_jingle', 'chapter',
  'confetti_pop', 'king_laugh',
] as const;
export type SfxName = (typeof SFX_NAMES)[number];

interface Settings {
  music: number;
  sfx: number;
  muted: boolean;
}

function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem('sh_audio') || '{}');
    return { music: s.music ?? 0.55, sfx: s.sfx ?? 0.8, muted: !!s.muted };
  } catch {
    return { music: 0.55, sfx: 0.8, muted: false };
  }
}

class AudioManager {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicGain!: GainNode;
  private sfxGain!: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<AudioBuffer | null>>();
  private lastPlay = new Map<string, number>();
  private music: AudioBufferSourceNode | null = null;
  private musicName = '';
  private musicRate = 1;
  settings: Settings = loadSettings();
  private listeners = new Set<() => void>();

  /** Call from a user gesture (click / key). Safe to call repeatedly. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain.connect(this.master);
      this.sfxGain.connect(this.master);
      this.master.connect(this.ctx.destination);
      this.apply();
      for (const n of SFX_NAMES) void this.load(n);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private load(name: string): Promise<AudioBuffer | null> {
    if (this.buffers.has(name)) return Promise.resolve(this.buffers.get(name)!);
    if (this.loading.has(name)) return this.loading.get(name)!;
    const p = fetch(`/assets/audio/${name}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((b) => this.ctx!.decodeAudioData(b))
      .then((buf) => {
        this.buffers.set(name, buf);
        return buf;
      })
      .catch((e) => {
        console.warn('[audio] missing', name, e?.message ?? e);
        return null;
      });
    this.loading.set(name, p);
    return p;
  }

  private apply() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.settings.muted ? 0 : 1, t, 0.05);
    this.musicGain.gain.setTargetAtTime(this.settings.music * 0.6, t, 0.1);
    this.sfxGain.gain.setTargetAtTime(this.settings.sfx, t, 0.05);
  }

  set(p: Partial<Settings>) {
    this.settings = { ...this.settings, ...p };
    localStorage.setItem('sh_audio', JSON.stringify(this.settings));
    this.apply();
    this.listeners.forEach((f) => f());
  }

  onChange(f: () => void) {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }

  play(name: SfxName, o: { vol?: number; rate?: number; minGap?: number; detune?: number } = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = performance.now();
    const gap = o.minGap ?? 60;
    if (now - (this.lastPlay.get(name) ?? 0) < gap) return;
    this.lastPlay.set(name, now);
    const buf = this.buffers.get(name);
    if (!buf) {
      void this.load(name);
      return;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = (o.rate ?? 1) * (1 + (Math.random() - 0.5) * (o.detune ?? 0.06));
    const g = this.ctx.createGain();
    g.gain.value = o.vol ?? 1;
    src.connect(g).connect(this.sfxGain);
    src.start();
  }

  /** Procedural effect (see synth.ts), rate-limited like samples. */
  synth(name: SynthName, o: { vol?: number; rate?: number; minGap?: number } = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = performance.now();
    const key = 'synth:' + name;
    if (now - (this.lastPlay.get(key) ?? 0) < (o.minGap ?? 60)) return;
    this.lastPlay.set(key, now);
    const g = this.ctx.createGain();
    g.gain.value = o.vol ?? 1;
    g.connect(this.sfxGain);
    synth(this.ctx, g, name, (o.rate ?? 1) * (1 + (Math.random() - 0.5) * 0.05));
    setTimeout(() => g.disconnect(), 2000);
  }

  async playMusic(name: 'music_main' | 'music_alt', fade = 1.5, rate = 1) {
    if (!this.ctx) return;
    if (this.musicName === name) {
      // already playing or loading this track: just glide to the new tempo
      this.musicRate = rate;
      this.music?.playbackRate.setTargetAtTime(rate, this.ctx.currentTime, 0.6);
      return;
    }
    this.musicName = name;
    this.musicRate = rate;
    const buf = await this.load(name);
    if (!buf || this.musicName !== name) return;
    if (this.music) this.fadeOut(this.music, 0.8);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = this.musicRate;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(1, this.ctx.currentTime, fade / 3);
    src.connect(g).connect(this.musicGain);
    src.start();
    (src as any)._g = g;
    this.music = src;
  }

  private fadeOut(m: AudioBufferSourceNode, fade: number) {
    if (!this.ctx) return;
    const g = (m as any)._g as GainNode;
    g.gain.setTargetAtTime(0, this.ctx.currentTime, fade / 3);
    setTimeout(() => {
      try {
        m.stop();
      } catch {
        /* already stopped */
      }
    }, fade * 1000 + 200);
  }

  stopMusic(fade = 1) {
    if (this.music) this.fadeOut(this.music, fade);
    this.music = null;
    this.musicName = '';
  }

  /** Temporarily lower the music (e.g. under the victory fanfare). */
  duck(amount = 0.25, seconds = 4) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicGain.gain.cancelScheduledValues(t);
    this.musicGain.gain.setTargetAtTime(this.settings.music * 0.6 * amount, t, 0.15);
    this.musicGain.gain.setTargetAtTime(this.settings.music * 0.6, t + seconds, 0.6);
  }
}

export const sfx = new AudioManager();
(window as any).__SH_AUDIO = sfx;
