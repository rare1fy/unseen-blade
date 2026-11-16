// Audio: Web Audio graph — sfx bus (random pitch / volume per play, layered cues), music bus with a low-pass that closes at low HP,
// voice bus that ducks music and sfx, a master limiter. Samples are bundled inline (mp3 → base64) and decoded on first unlock.
import { setCueHandler, type Cue } from './cues';

const files = import.meta.glob('../assets/audio/*.mp3', { eager: true, query: '?inline', import: 'default' }) as Record<string, string>;
const byName: Record<string, string> = {};
for (const [p, url] of Object.entries(files)) byName[p.split('/').pop()!.replace('.mp3', '')] = url;
const variants = (prefix: string) => Object.keys(byName).filter(n => n.startsWith(prefix));

export const VOICE_LINES: Record<string, string> = {
  enter: '能踏进这座坟茔的活人，最后都成了我的藏品。',
  attack: '让亡灵大军吞噬你！',
  hurt: '寒意……侵骨？我自己就是寒意！',
  lowHp: '灵魂宝石……碎裂吧——释放一切死灵之力！',
  death: '不……你以为这就结束了？',
};

class AudioEngine {
  ctx: AudioContext | null = null; master!: GainNode; sfx!: GainNode; music!: GainNode; voice!: GainNode; lp!: BiquadFilterNode; duck!: GainNode;
  buf = new Map<string, AudioBuffer>(); musicSrc: AudioBufferSourceNode | null = null; musicName = ''; ready = false; muted = false;
  async unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') await this.ctx.resume(); return; }
    const AC = (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext; if (!AC) return;
    const ctx: AudioContext = new AC(); this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -10; comp.knee.value = 6; comp.ratio.value = 8; comp.attack.value = 0.003; comp.release.value = 0.2;
    this.master = ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(comp); comp.connect(ctx.destination);
    this.duck = ctx.createGain(); this.duck.connect(this.master);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.8; this.sfx.connect(this.duck);
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 18000; this.lp.Q.value = 0.7;
    this.music = ctx.createGain(); this.music.gain.value = 0.42; this.music.connect(this.lp); this.lp.connect(this.duck);
    this.voice = ctx.createGain(); this.voice.gain.value = 1.0; this.voice.connect(this.master);
    await Promise.all(Object.entries(byName).map(async ([n, url]) => {
      try { const b64 = url.slice(url.indexOf(',') + 1), bin = atob(b64), arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); this.buf.set(n, await ctx.decodeAudioData(arr.buffer)); } catch { /* skip broken sample */ }
    }));
    this.ready = true;
  }
  private now() { return this.ctx ? this.ctx.currentTime : 0; }
  /** play one sample: rate / gain jittered */
  play(name: string, o: { gain?: number; rate?: number; jitter?: number; delay?: number; bus?: 'sfx' | 'voice' } = {}) {
    const ctx = this.ctx, b = this.buf.get(name); if (!ctx || !b || this.muted) return null;
    const src = ctx.createBufferSource(); src.buffer = b; const j = o.jitter ?? 0.08;
    src.playbackRate.value = (o.rate ?? 1) * (1 + (Math.random() * 2 - 1) * j);
    const g = ctx.createGain(); g.gain.value = (o.gain ?? 1) * (1 + (Math.random() * 2 - 1) * j * 0.6);
    src.connect(g); g.connect(o.bus === 'voice' ? this.voice : this.sfx); src.start(this.now() + (o.delay ?? 0)); return src;
  }
  any(prefix: string, o: Parameters<AudioEngine['play']>[1] = {}) { const v = variants(prefix); if (v.length) this.play(v[Math.floor(Math.random() * v.length)], o); }
  /** procedural layers the sample library lacks: whoosh, boom, rumble */
  noise(dur: number, o: { from: number; to: number; gain: number; type?: BiquadFilterType; q?: number; delay?: number }) {
    const ctx = this.ctx; if (!ctx || this.muted) return;
    const n = Math.floor(ctx.sampleRate * dur), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = b; const f = ctx.createBiquadFilter(); f.type = o.type ?? 'bandpass'; f.Q.value = o.q ?? 1.2;
    const t = this.now() + (o.delay ?? 0); f.frequency.setValueAtTime(o.from, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.gain, t + dur * 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfx); src.start(t);
  }
  tone(freq: number, dur: number, o: { to?: number; gain?: number; type?: OscillatorType; delay?: number } = {}) {
    const ctx = this.ctx; if (!ctx || this.muted) return;
    const t = this.now() + (o.delay ?? 0), osc = ctx.createOscillator(); osc.type = o.type ?? 'sine'; osc.frequency.setValueAtTime(freq, t); if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.gain ?? 0.3, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(this.sfx); osc.start(t); osc.stop(t + dur + 0.05);
  }
  playMusic(name: string, fade = 1.2) {
    const ctx = this.ctx; if (!ctx || this.musicName === name) return; const b = this.buf.get(name); if (!b) return;
    const t = this.now(); if (this.musicSrc) { const old = this.musicSrc; const og = (old as any)._g as GainNode; og.gain.setTargetAtTime(0, t, fade / 4); old.stop(t + fade); }
    const src = ctx.createBufferSource(); src.buffer = b; src.loop = true; const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + fade); (src as any)._g = g;
    src.connect(g); g.connect(this.music); src.start(t); this.musicSrc = src; this.musicName = name;
  }
  /** 0 = open, 1 = muffled (low HP) */
  muffle(k: number) { if (!this.ctx) return; this.lp.frequency.setTargetAtTime(18000 * Math.pow(1 - k * 0.92, 2) + 600 * k, this.now(), 0.4); }
  async speak(kind: string) {
    if (!this.ctx) return 0; const b = this.buf.get('vo_lich_' + kind); if (!b) return 0;
    const t = this.now(); this.duck.gain.setTargetAtTime(0.35, t, 0.08); this.play('vo_lich_' + kind, { bus: 'voice', jitter: 0, gain: 1.3 });
    this.duck.gain.setTargetAtTime(1, t + b.duration, 0.3); return b.duration;
  }
}
export const audio = new AudioEngine();

let count = 0, countT = 0;
const H: Partial<Record<Cue, (k: number, x?: number) => void>> = {
  clack: k => { audio.any('die_click', { gain: 0.3 + k * 0.7, rate: 0.85 + k * 0.3 }); if (k > 0.5) audio.any('dice_roll', { gain: 0.25 * k }); },
  select: () => audio.any('die_click', { gain: 0.7, rate: 1.25 }),
  deselect: () => audio.any('ui_tap', { gain: 0.5, rate: 0.8 }),
  whoosh: k => audio.noise(0.28, { from: 600, to: 3200, gain: 0.25 * k + 0.08, q: 0.8 }),
  // user 11-13: the 'pickup' jingle sounds like a chord and fired on every banner / armor gain (「那个和弦音效…还是疯狂在放」): non-musical cues
  reveal: k => { audio.noise(0.35, { from: 500, to: 2400, gain: 0.12 + k * 0.05, q: 0.7 }); if (k >= 2) audio.noise(0.6, { from: 3000, to: 200, gain: 0.25, type: 'lowpass' }); if (k >= 3) audio.tone(110, 0.9, { to: 55, gain: 0.5, type: 'sawtooth' }); },
  count: (k) => { const now = performance.now(); if (now - countT > 900) count = 0; countT = now; audio.any('ui_tap', { gain: 0.6 + k * 0.3, rate: 1 + Math.min(10, count++) * 0.07, jitter: 0.01 }); },
  relic: () => { audio.any('coins', { gain: 0.45, rate: 1.4 }); },
  impact: k => { audio.any('sword_hit', { gain: 0.6 + k * 0.4, rate: 1.05 - k * 0.15 }); audio.tone(90, 0.25, { to: 40, gain: 0.35 * k + 0.1 }); },
  crit: k => { audio.any('sword_hit', { gain: 1, rate: 0.75 }); audio.any('shatter', { gain: 0.5, rate: 0.7 }); audio.tone(70, 0.6, { to: 30, gain: 0.7 }); audio.noise(0.5, { from: 2000, to: 80, gain: 0.35 * (k || 1), type: 'lowpass' }); },
  block: () => { audio.any('sword_hit', { gain: 0.7, rate: 1.5 }); audio.tone(1800, 0.15, { gain: 0.08, type: 'square' }); },
  armor: () => { audio.any('sword_hit', { gain: 0.25, rate: 1.7 }); },
  hurt: k => { audio.any('sword_hit', { gain: 0.5 + k * 0.3, rate: 0.7 }); audio.tone(120, 0.3, { to: 50, gain: 0.4 }); },
  heal: () => audio.any('heal', { gain: 0.5 }),
  burn: () => audio.any('fireball', { gain: 0.45, rate: 1.2 }),
  poison: () => { audio.noise(0.5, { from: 400, to: 900, gain: 0.15, q: 6 }); audio.tone(220, 0.4, { to: 160, gain: 0.08, type: 'triangle' }); },
  magic: () => { audio.any('fireball', { gain: 0.5, rate: 0.75 }); audio.tone(330, 0.6, { to: 660, gain: 0.08, type: 'triangle' }); },
  deny: () => audio.any('ui_tap', { gain: 0.6, rate: 0.6 }),
  click: () => audio.any('ui_tap', { gain: 0.6 }),
  coin: () => audio.any('coins', { gain: 0.5 }),
  win: () => { audio.any('coins', { gain: 0.6, rate: 0.9 }); },   // user 11-13: no chord / jingle at all
  lose: () => { audio.tone(220, 1.2, { to: 110, gain: 0.3, type: 'sawtooth' }); },
  shatter: k => { audio.any('shatter', { gain: 0.6 + k * 0.3, rate: 1.1 - k * 0.2 }); },
  summon: () => { audio.any('goblin', { gain: 0.7, rate: 0.8 }); audio.noise(0.8, { from: 150, to: 900, gain: 0.25, type: 'lowpass' }); },
  curse: () => { audio.any('shatter', { gain: 0.35, rate: 0.55 }); audio.tone(180, 0.6, { to: 90, gain: 0.12, type: 'triangle' }); },
  roar: () => { audio.any('goblin', { gain: 1, rate: 0.5 }); audio.noise(1.4, { from: 90, to: 400, gain: 0.5, type: 'lowpass' }); audio.tone(55, 1.4, { to: 40, gain: 0.5, type: 'sawtooth' }); },
  tick: () => audio.any('die_click', { gain: 0.3 }),
};
setCueHandler((name, k) => H[name]?.(k));
