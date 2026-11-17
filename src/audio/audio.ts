// Audio: Web Audio graph — sfx bus (random pitch / volume per play, layered cues), music bus with a low-pass that closes at low HP,
// voice bus that ducks music and sfx, a master limiter. Samples are bundled inline (mp3 → base64) and decoded on first unlock.
import { setCueHandler, type Cue } from './cues';

const files = import.meta.glob('../assets/audio/*.mp3', { eager: true, query: '?inline', import: 'default' }) as Record<string, string>;
const byName: Record<string, string> = {};
for (const [p, url] of Object.entries(files)) byName[p.split('/').pop()!.replace('.mp3', '')] = url;
const variants = (prefix: string) => Object.keys(byName).filter(n => n.startsWith(prefix));

/** act-19 music (the user's six tracks, GameProtos/music/unseen_v1): [loopStart, loopEnd] in seconds. Each file is the track up to
 *  loopEnd with the last ~1.6 s already crossfaded into the music just before loopStart (bar-aligned, picked by beat-synchronous chroma /
 *  timbre similarity), so looping loopEnd → loopStart is seamless; the intro before loopStart plays once. */
export const MUSIC_LOOPS: Record<string, [number, number]> = { bgm_opening: [29.6751, 127.4195], bgm_yard: [29.9886, 108.6578], bgm_battle: [18.0535, 123.5766], bgm_elite: [7.6278, 53.2201], bgm_boss: [16.5326, 97.0942], bgm_calm: [20.1317, 106.0339],
  // act-37 the second set (GameProtos/music/make_unseen_v2.py): the kiln (her first waking there)
  bgm_kiln: [12.28, 114.5] };   // (act-40: 「破庙初战」 came out calm — measured — and is not used; the prologue's fight is on bgm_boss)
/** act-37 pieces that play once (scored to a scene, no loop): the cold open, the fall to the dawn, after 褚雷 */
export const MUSIC_ONCE = new Set(['bgm_coldopen', 'bgm_fall', 'bgm_afterkill']);
export const VOICE_LINES: Record<string, string> = {
  enter: '能踏进这座坟茔的活人，最后都成了我的藏品。',
  attack: '让亡灵大军吞噬你！',
  hurt: '寒意……侵骨？我自己就是寒意！',
  lowHp: '灵魂宝石……碎裂吧——释放一切死灵之力！',
  death: '不……你以为这就结束了？',
};

class AudioEngine {
  ctx: AudioContext | null = null; master!: GainNode; sfx!: GainNode; music!: GainNode; voice!: GainNode; lp!: BiquadFilterNode; duck!: GainNode;
  /** the last samples played (debug: __dh.sfx()) */
  recent: string[] = [];
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
    // music is decoded on demand (playMusic): six decoded tracks would hold ~250 MB on a phone
    await Promise.all(Object.entries(byName).filter(([n]) => !n.startsWith('bgm_')).map(async ([n, url]) => {
      // (the build inlines each sample as a data: URL; the dev server hands back a plain file URL — fetch that one)
      try { let ab: ArrayBuffer; if (!url.startsWith('data:')) ab = await (await fetch(url)).arrayBuffer(); else { const b64 = url.slice(url.indexOf(',') + 1), bin = atob(b64), arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); ab = arr.buffer; } this.buf.set(n, await ctx.decodeAudioData(ab)); } catch { /* skip broken sample */ }
    }));
    this.ready = true;
  }
  private now() { return this.ctx ? this.ctx.currentTime : 0; }
  /** act-37: a voiced dialogue line — decoded on first use, one at a time on the voice bus (the line before stops), the music and
   *  the effects ducked under it */
  private vo = new Map<string, Promise<AudioBuffer | null>>(); private voSrc: AudioBufferSourceNode | null = null;
  async voiceLine(url: string) {
    const ctx = this.ctx; if (!ctx || this.muted) return;
    let p = this.vo.get(url);
    if (!p) {
      p = (async () => { try {
        let ab: ArrayBuffer; if (!url.startsWith('data:')) ab = await (await fetch(url)).arrayBuffer();
        else { const b64 = url.slice(url.indexOf(',') + 1), bin = atob(b64), arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); ab = arr.buffer; }
        return await ctx.decodeAudioData(ab);
      } catch { return null; } })();
      this.vo.set(url, p);
    }
    const b = await p; if (!b) return;
    this.stopVoice();
    const src = ctx.createBufferSource(); src.buffer = b; src.connect(this.voice); const t = this.now(); src.start(t); this.voSrc = src;
    this.duck.gain.cancelScheduledValues(t); this.duck.gain.setTargetAtTime(0.55, t, 0.06); this.duck.gain.setTargetAtTime(1, t + b.duration, 0.25);
    src.onended = () => { if (this.voSrc === src) this.voSrc = null; };
  }
  get voicing() { return !!this.voSrc; }
  stopVoice() { if (this.voSrc) { try { this.voSrc.stop(); } catch { /* ended */ } this.voSrc = null; if (this.ctx) this.duck.gain.setTargetAtTime(1, this.now(), 0.2); } }
  /** play one sample: rate / gain jittered */
  play(name: string, o: { gain?: number; rate?: number; jitter?: number; delay?: number; bus?: 'sfx' | 'voice' } = {}) {
    const ctx = this.ctx, b = this.buf.get(name); if (!ctx || !b || this.muted) return null;
    const src = ctx.createBufferSource(); src.buffer = b; const j = o.jitter ?? 0.08;
    src.playbackRate.value = (o.rate ?? 1) * (1 + (Math.random() * 2 - 1) * j);
    const g = ctx.createGain(); g.gain.value = (o.gain ?? 1) * (1 + (Math.random() * 2 - 1) * j * 0.6);
    src.connect(g); g.connect(o.bus === 'voice' ? this.voice : this.sfx); src.start(this.now() + (o.delay ?? 0));
    this.recent.push(name); if (this.recent.length > 40) this.recent.shift(); return src;
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
  private decodeName(n: string) {
    const ctx = this.ctx, url = byName[n]; if (!ctx || !url) return Promise.resolve(null);
    if (!url.startsWith('data:')) return fetch(url).then(r => r.arrayBuffer()).then(ab => ctx.decodeAudioData(ab)).catch(() => null);   // the dev server: a file URL
    const b64 = url.slice(url.indexOf(',') + 1), bin = atob(b64), arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return ctx.decodeAudioData(arr.buffer).catch(() => null);
  }
  private musicWant = '';
  /** cross-fade to a music track (decoded now if needed; only the playing and the last one stay decoded). Same track: nothing. */
  async playMusic(name: string, fade = 1.6, offset = 0) {
    const ctx = this.ctx; if (!ctx || this.musicWant === name) return; this.musicWant = name;
    let b = this.buf.get(name);
    if (!b) { const d = await this.decodeName(name); if (!d) return; b = d; this.buf.set(name, d); }
    if (this.musicWant !== name) return;   // asked for another while decoding
    const t = this.now();
    if (this.musicSrc) { const old = this.musicSrc, og = (old as any)._g as GainNode; og.gain.cancelScheduledValues(t); og.gain.setValueAtTime(og.gain.value, t); og.gain.linearRampToValueAtTime(0, t + fade); old.stop(t + fade + 0.05); }
    const src = ctx.createBufferSource(); src.buffer = b; src.loop = !MUSIC_ONCE.has(name);
    const lp = MUSIC_LOOPS[name]; if (lp) { src.loopStart = lp[0]; src.loopEnd = Math.min(lp[1], b.duration); }
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + fade); (src as any)._g = g;
    src.connect(g); g.connect(this.music); src.start(t, Math.min(offset, Math.max(0, b.duration - 1))); this.musicSrc = src; this.musicName = name;
    // keep at most this one and the one before decoded
    for (const k of [...this.buf.keys()]) if (k.startsWith('bgm_') && k !== name && k !== this.musicPrev) this.buf.delete(k);
    this.musicPrev = name;
  }
  private musicPrev = '';
  /** fade the music out (a death, the end of a run); the next playMusic brings it back */
  stopMusic(fade = 1.5) {
    if (!this.ctx || !this.musicSrc) return; const t = this.now(), old = this.musicSrc, og = (old as any)._g as GainNode;
    og.gain.cancelScheduledValues(t); og.gain.setValueAtTime(og.gain.value, t); og.gain.linearRampToValueAtTime(0, t + fade); old.stop(t + fade + 0.05);
    this.musicSrc = null; this.musicName = ''; this.musicWant = '';
  }
  /** dip the music under a stinger for a while (k = level, 0..1) */
  duckMusic(k: number, hold: number, back = 0.8) {
    if (!this.ctx) return; const t = this.now(), g = this.music.gain, base = 0.42;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(base * k, t + 0.25); g.setValueAtTime(base * k, t + hold); g.linearRampToValueAtTime(base, t + hold + back);
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
// act-19 (user: 「现在的战斗音效要重新设计，用stable audio mid生成合理的声音」): the combat cues play 不见刀's own samples (ub_*); the
// dice-era samples stay only for the UI taps. k = intensity (0..~1.5); every play picks a random take with a little pitch / gain spread.
const ub = (id: string, o: Parameters<AudioEngine['play']>[1] = {}) => audio.any('ub_' + id + '_', o);
const H: Partial<Record<Cue, (k: number, x?: number) => void>> = {
  // UI
  clack: k => audio.any('ui_tap', { gain: 0.3 + k * 0.5, rate: 0.9 + k * 0.2 }),
  select: () => audio.any('ui_tap', { gain: 0.6, rate: 1.25 }),
  deselect: () => audio.any('ui_tap', { gain: 0.5, rate: 0.8 }),
  count: (k) => { const now = performance.now(); if (now - countT > 900) count = 0; countT = now; audio.any('ui_tap', { gain: 0.6 + k * 0.3, rate: 1 + Math.min(10, count++) * 0.07, jitter: 0.01 }); },
  click: () => audio.any('ui_tap', { gain: 0.6 }),
  deny: () => audio.any('ui_tap', { gain: 0.6, rate: 0.6 }),
  tick: () => audio.any('ui_tap', { gain: 0.3, rate: 1.4 }),
  // the old generic names, re-voiced with the new set (older code still calls them)
  whoosh: k => ub('swish_light', { gain: 0.35 + 0.5 * k, rate: 1.05 - 0.15 * Math.min(1, k) }),
  reveal: k => { ub('scroll', { gain: 0.5 }); if (k >= 2) audio.noise(0.6, { from: 3000, to: 200, gain: 0.2, type: 'lowpass' }); },
  relic: () => ub('coins', { gain: 0.45, rate: 1.3 }),
  impact: k => { ub(k > 0.85 ? 'cut_heavy' : 'cut_light', { gain: 0.55 + k * 0.45, rate: 1.05 - k * 0.12 }); audio.tone(90, 0.2, { to: 40, gain: 0.25 * k + 0.08 }); },
  crit: k => { ub('cut_heavy', { gain: 1, rate: 0.85 }); ub('ult_slash', { gain: 0.6 * (k || 1) }); audio.tone(70, 0.5, { to: 30, gain: 0.5 }); },
  block: k => ub('parry', { gain: 0.4 + 0.5 * Math.min(1, k || 0.6) }),
  armor: () => ub('parry', { gain: 0.25, rate: 1.4 }),
  hurt: k => { ub('hurt', { gain: 0.6 + k * 0.3 }); audio.tone(120, 0.25, { to: 55, gain: 0.25 }); },
  heal: () => audio.any('heal', { gain: 0.5 }),
  burn: k => ub('fire', { gain: 0.35 + 0.4 * k }),
  poison: () => { audio.noise(0.5, { from: 400, to: 900, gain: 0.15, q: 6 }); },
  magic: () => ub('swish_heavy', { gain: 0.7, rate: 0.8 }),
  coin: () => ub('coins', { gain: 0.45 }),
  win: () => ub('coins', { gain: 0.6, rate: 0.9 }),
  lose: () => audio.tone(220, 1.2, { to: 110, gain: 0.25, type: 'sawtooth' }),
  shatter: k => ub('pot_break', { gain: 0.5 + k * 0.3 }),
  summon: () => { ub('swish_heavy', { gain: 0.4, rate: 0.7 }); audio.noise(0.7, { from: 150, to: 900, gain: 0.18, type: 'lowpass' }); },
  curse: () => audio.tone(180, 0.6, { to: 90, gain: 0.12, type: 'triangle' }),
  roar: () => { ub('thunder', { gain: 0.7, rate: 0.7 }); audio.noise(1.4, { from: 90, to: 400, gain: 0.45, type: 'lowpass' }); audio.tone(55, 1.4, { to: 40, gain: 0.45, type: 'sawtooth' }); },
  // the act-19 cues
  swish: k => ub('swish_light', { gain: 0.45 + 0.4 * k }),
  swishHeavy: k => ub('swish_heavy', { gain: 0.6 + 0.4 * k }),
  // act-23 (用户：「现在的音效没有任何打击感，砍上去也没有砍中的感觉」) → act-29 (用户听了试听页：「砍到人身上的声音不像，比较像是打击和
  // 钝器攻击的声音」): a hit is the BLADE — a fast sharp slice through cloth and flesh (the main layer, high and crisp) with a short wet
  // cut under it; the act-19 steel cut only faintly; no meat thud, no cleaver, no synthetic low punch (those read as a club or a fist).
  // Heavy blows: a longer slash, the slice, a thin steel ring as its tail and a little spatter. (Stable Audio small, sfx/out_unseen_hit_v3.)
  // x = 0: only wood was hit (the dummies) — steel and a dry knock
  cut: (k, x) => {
    if (x === 0) { ub('cut_light', { gain: 0.45 + 0.3 * k }); audio.tone(160, 0.05, { to: 90, gain: 0.12 }); return; }
    ub('blade_flesh', { gain: 0.7 + 0.25 * k }); ub('wet_slice', { gain: 0.3 + 0.15 * k, delay: 0.012 }); ub('cut_light', { gain: 0.18 });
  },
  cutHeavy: (k, x) => {
    if (x === 0) { ub('cut_heavy', { gain: 0.6 + 0.3 * k }); audio.tone(110, 0.08, { to: 60, gain: 0.15 }); return; }
    ub('blade_heavy', { gain: 0.8 + 0.2 * k }); ub('blade_flesh', { gain: 0.5 + 0.2 * k, delay: 0.01 }); ub('blade_ring', { gain: 0.28 + 0.1 * k, delay: 0.03 });
    ub('blood_splat', { gain: 0.22 + 0.1 * k, delay: 0.08 });
  },
  gore: k => { ub('blade_heavy', { gain: 0.5 * k, rate: 0.92, delay: 0.02 }); ub('blood_splat', { gain: 0.4 * k, delay: 0.1 }); },
  draw: k => ub('draw', { gain: 0.6 + 0.4 * k, jitter: 0.04 }),
  sheathe: k => ub('sheathe', { gain: 0.55 + 0.4 * k, jitter: 0.03 }),
  parry: k => ub('parry', { gain: 0.8 + 0.3 * k, jitter: 0.03 }),
  dash: k => ub('dash', { gain: 0.4 + 0.4 * k }),
  jump: k => ub('jump', { gain: 0.35 + 0.3 * k }),
  land: k => ub('land', { gain: 0.3 + 0.5 * k }),
  dartThrow: k => ub('dart_throw', { gain: 0.35 + 0.3 * k, rate: 1.1 }),
  dartHit: k => ub('dart_hit', { gain: 0.4 + 0.4 * k }),
  arrow: k => ub('arrow', { gain: 0.35 + 0.4 * k }),
  bodyFall: k => ub('body_fall', { gain: 0.45 + 0.4 * k }),
  foeSwing: k => ub('foe_swing', { gain: 0.35 + 0.4 * k }),
  thunder: k => ub('thunder', { gain: 0.5 + 0.5 * k }),
  freeze: k => ub('freeze', { gain: 0.45 + 0.4 * k }),
  iceShatter: k => ub('ice_shatter', { gain: 0.5 + 0.4 * k }),
  boom: k => { ub('boom', { gain: 0.9 + 0.3 * k, rate: 0.85 }); audio.tone(55, 0.7, { to: 28, gain: 0.6 }); audio.noise(0.8, { from: 1200, to: 60, gain: 0.35, type: 'lowpass' }); },
  fuse: k => ub('fuse', { gain: 0.35 + 0.3 * k, jitter: 0.02 }),
  fire: k => ub('fire', { gain: 0.4 + 0.4 * k }),
  potBreak: k => ub('pot_break', { gain: 0.55 + 0.4 * k }),
  crateBreak: k => ub('crate_break', { gain: 0.55 + 0.4 * k }),
  hayBurst: k => ub('hay_burst', { gain: 0.5 + 0.4 * k }),
  pillarFall: k => ub('pillar_fall', { gain: 0.8 + 0.3 * k }),
  wallSlam: k => ub('wall_slam', { gain: 0.6 + 0.4 * k }),
  gateOpen: k => ub('gate_open', { gain: 0.55 + 0.4 * k }),
  exitChime: k => ub('exit_chime', { gain: 0.3 + 0.4 * k, jitter: 0.02 }),
  timeSlow: k => ub('time_slow', { gain: 0.7 + 0.3 * k, jitter: 0 }),
  ultSlash: k => { ub('ult_slash', { gain: 1, jitter: 0.02 }); audio.tone(60, 0.8, { to: 30, gain: 0.5 * (k || 1) }); },
  scroll: k => ub('scroll', { gain: 0.45 + 0.3 * k }),
  hound: k => ub('hound', { gain: 0.45 + 0.4 * k }),
  stingWin: () => ub('sting_win', { gain: 0.9, jitter: 0 }),
  // act-37 (the user's): the stele's name struck through, waking after a death
  stingStele: () => ub('sting_stele', { gain: 0.9, jitter: 0 }), stingRevive: () => ub('sting_revive', { gain: 0.9, jitter: 0 }),
  stingLose: () => ub('sting_lose', { gain: 0.9, jitter: 0 }),
  stingClear: () => ub('sting_clear', { gain: 0.7, jitter: 0 }),
};
setCueHandler((name, k, x) => H[name]?.(k, x));   // (act-28: pass the extra on — the hit sounds read it: 0 = only wood was hit)
