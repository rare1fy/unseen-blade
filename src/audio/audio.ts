import { OPT } from '../present/engine/perfOpts';
// Audio: Web Audio graph — sfx bus (random pitch / volume per play, layered cues), music bus with a low-pass that closes at low HP,
// voice bus that ducks music and sfx, a master limiter. Samples are bundled inline (mp3 → base64) and decoded on first unlock.
import { setCueHandler, type Cue } from './cues';
import { firstSoundsIn } from './firstSounds';

const files = import.meta.glob('../assets/audio/*.mp3', { eager: true, query: '?inline', import: 'default' }) as Record<string, string>;
const byName: Record<string, string> = {};
for (const [p, url] of Object.entries(files)) byName[p.split('/').pop()!.replace('.mp3', '')] = url;
const variants = (prefix: string) => Object.keys(byName).filter(n => n.startsWith(prefix));
/** 11-18: at most this many effects at once (a crowded fight was a wash of overlapping takes) */
const MAX_VOICES = 12;
/** the music bus level (act-43 反馈：「BGM要降低一点音量」) */
const MUSIC_BASE = 0.3;

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
  ctx: AudioContext | null = null; master!: GainNode; sfx!: GainNode; music!: GainNode; voice!: GainNode; lp?: BiquadFilterNode; private noFilter = false; duck!: GainNode; private bandHi?: BiquadFilterNode; private bandLo?: BiquadFilterNode; private bandK = 0;
  /** 11-18 混音 (用户：「音效……听起来很乱」): the hero's own sounds (her blade, her steps) on their own bus; the world's (foes, props,
   *  ambience) under `hush`, which dips when her blow lands; both send a little into a room reverb (setRoom) that glues them */
  /** act-50: the win / lose stings, whole (the user's own files run ~13 s) — on their own bus so the next scene's music can fade them */
  sting!: GainNode;
  hero!: GainNode; hush!: GainNode; musicHush!: GainNode; send!: GainNode; wet!: GainNode; conv!: ConvolverNode;
  /** the last samples played (debug: __dh.sfx()) */
  recent: string[] = [];
  buf = new Map<string, AudioBuffer>(); musicSrc: AudioBufferSourceNode | null = null; musicName = ''; ready = false; muted = false;
  /** 11-18 微信小游戏 (用户：「现在有声音了，但是声音出来的很慢」): on a phone the first touch used to wait for the effects'
   *  subpackage to download (3.7 MB) and all 157 effects to decode before the title music was even asked for — then that track's own
   *  subpackage (3.2 MB) and its decode. Now the context and buses are made at once and the effects load behind (each plays as soon
   *  as it is decoded; `ready` when all are; `loading` settles then). A mini-game calls prepare() at boot, before any touch, warming
   *  the first track and then fetching the other audio subpackages one by one (the first fight's music doesn't wait for a download);
   *  the touch only resumes the context. */
  loading: Promise<void> = Promise.resolve();
  private lifecycleBound = false;
  private wasInterrupted = false;
  private musicEnded = false;
  private musicStartedAt = 0;
  private musicOffset = 0;
  async unlock() {
    if (!this.ctx) this.prepare();
    const ctx = this.ctx;
    if (ctx && (ctx.state === 'suspended' || (ctx.state as string) === 'interrupted')) {
      try { await ctx.resume(); } catch { /* retry on next gesture */ }
    }
    if (this.wasInterrupted || this.musicEnded) this.recover();
    if (this.weatherWant !== 'none') this.applyWeatherSound(0.5);
  }
  /** Recover WebAudio + BGM + voice pool cleanly after returning from long tab/app backgrounding or OS audio interruption */
  recover() {
    const ctx = this.ctx; if (!ctx) return;
    const st = ctx.state as string;
    const needResume = st === 'suspended' || st === 'interrupted';
    const restart = () => {
      if (!this.ctx || (this.ctx.state as string) !== 'running') return;
      this.wasInterrupted = false;
      const t = this.now();
      // Prune zombie SFX voices whose onended was dropped during OS suspension
      for (let i = this.live.length - 1; i >= 0; i--) {
        if (this.live[i].endAt <= t) this.live.splice(i, 1);
      }
      // Restore any ducking / stillness / low-pass ramps that may have frozen mid-automation while suspended
      try {
        const masterBase = this.muted ? 0 : (this.noFilter ? 0.85 : 0.9);
        if (this.master) {
          this.master.gain.cancelScheduledValues(t);
          this.master.gain.setValueAtTime(this.master.gain.value, t);
          this.master.gain.linearRampToValueAtTime(masterBase, t + 0.045);
        }
        if (!this.voSrc) { this.duck.gain.cancelScheduledValues(t); this.duck.gain.setValueAtTime(1, t); }
        this.hush.gain.cancelScheduledValues(t); this.hush.gain.setValueAtTime(1, t);
        this.musicHush.gain.cancelScheduledValues(t); this.musicHush.gain.setValueAtTime(1, t);
        this.music.gain.cancelScheduledValues(t); this.music.gain.setValueAtTime(MUSIC_BASE, t);
        if (this.bandHi && this.bandLo && this.bandK <= 0.02) {
          this.bandHi.frequency.cancelScheduledValues(t); this.bandHi.frequency.setValueAtTime(10, t);
          this.bandLo.frequency.cancelScheduledValues(t); this.bandLo.frequency.setValueAtTime(20000, t);
        }
      } catch { /* mini-game param guard */ }
      // Restart wanted BGM if its BufferSource ended or stalled while away
      const want = this.musicWant;
      if (want && !MUSIC_ONCE.has(want) && (!this.musicSrc || this.musicEnded)) {
        const b = this.buf.get(want);
        const lp = MUSIC_LOOPS[want];
        let off = 0;
        if (b && lp) {
          const span = Math.max(1, Math.min(lp[1], b.duration) - lp[0]);
          const elapsed = Math.max(0, (performance.now() / 1000) - this.musicStartedAt);
          off = lp[0] + ((this.musicOffset + elapsed) % span);
        }
        this.musicWant = '';
        void this.playMusic(want, 0.6, off);
      }
      if (this.weatherWant !== 'none') this.applyWeatherSound(0.35);
    };
    if (needResume) {
      this.wasInterrupted = true;
      void Promise.resolve(ctx.resume()).then(restart, () => { /* wait for next user gesture */ });
    } else {
      restart();
    }
  }
  private bindLifecycle() {
    if (this.lifecycleBound) return;
    this.lifecycleBound = true;
    const onHide = () => {
      this.wasInterrupted = true;
      this.hum(0);
      if (this.weatherG && this.ctx) {
        const t = this.now();
        try { this.weatherG.gain.cancelScheduledValues(t); this.weatherG.gain.setValueAtTime(0, t); } catch { /* mini-game param guard */ }
      }
      if (this.ctx && this.master) {
        const t = this.now();
        try {
          this.master.gain.cancelScheduledValues(t);
          this.master.gain.setValueAtTime(this.master.gain.value, t);
          this.master.gain.linearRampToValueAtTime(0, t + 0.018);
        } catch { /* mini-game param guard */ }
      }
    };
    const onShow = () => { this.recover(); };
    const onGesture = () => {
      const st = this.ctx?.state as string | undefined;
      if (st && st !== 'running') this.recover();
      else if (this.wasInterrupted || (this.musicWant && !MUSIC_ONCE.has(this.musicWant) && (!this.musicSrc || this.musicEnded))) this.recover();
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') onHide();
        else onShow();
      });
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', onHide);
      window.addEventListener('pageshow', onShow);
      window.addEventListener('focus', onShow);
      window.addEventListener('pointerdown', onGesture, { passive: true });
      window.addEventListener('keydown', onGesture, { passive: true });
    }
    const wxg = (globalThis as unknown as { wx?: { onShow?: (cb: () => void) => void; onHide?: (cb: () => void) => void; onAudioInterruptionEnd?: (cb: () => void) => void; onAudioInterruptionBegin?: (cb: () => void) => void } }).wx;
    wxg?.onHide?.(onHide);
    wxg?.onShow?.(onShow);
    wxg?.onAudioInterruptionBegin?.(onHide);
    wxg?.onAudioInterruptionEnd?.(onShow);
  }
  prepare(o: { warm?: string[]; prefetch?: boolean } = {}) {
    if (this.ctx) return;
    this.bindLifecycle();
    setTimeout(() => firstSoundsIn(), 3000);
    // (11-18 微信小游戏: no AudioContext there — wechat/glue.js wraps wx.createWebAudioContext as __ubWxAudio)
    const AC = (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext;
    const ctx: AudioContext | null = AC ? new AC() : (globalThis as any).__ubWxAudio?.() ?? null; if (!ctx) { firstSoundsIn(); return; }
    this.ctx = ctx;
    if ('onstatechange' in ctx) {
      ctx.onstatechange = () => {
        const st = ctx.state as string;
        if (st === 'interrupted' || st === 'suspended') this.wasInterrupted = true;
        else if (st === 'running' && (this.wasInterrupted || this.musicEnded)) this.recover();
      };
    }
    const noFilter = !!(ctx as unknown as { noFilter?: boolean }).noFilter; this.noFilter = noFilter;
    // act-129: on WeChat mini-game (noFilter), route master directly into glue.js's native outGate without DynamicsCompressorNode
    // (whose lookahead buffer causes sharp electrical pops when closing the mini-game!)
    this.master = ctx.createGain();
    if (noFilter) {
      this.master.gain.value = 0.85;
      this.master.connect(ctx.destination);
    } else {
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -2.5; comp.knee.value = 0; comp.ratio.value = 20; comp.attack.value = 0.001; comp.release.value = 0.12;
      this.master.gain.value = 0.9; this.master.connect(comp); comp.connect(ctx.destination);
    }
    this.duck = ctx.createGain();
    if (noFilter) this.duck.connect(this.master);
    else {
      this.bandHi = ctx.createBiquadFilter(); this.bandHi.type = 'highpass'; this.bandHi.frequency.value = 10; this.bandHi.Q.value = 0.7;
      this.bandLo = ctx.createBiquadFilter(); this.bandLo.type = 'lowpass'; this.bandLo.frequency.value = 20000; this.bandLo.Q.value = 0.7;
      this.bandHi.connect(this.bandLo); this.bandLo.connect(this.master); this.duck.connect(this.bandHi);
    }
    this.hush = ctx.createGain(); this.hush.connect(this.duck);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.72; this.sfx.connect(this.hush);
    this.hero = ctx.createGain(); this.hero.gain.value = 0.85; this.hero.connect(this.duck);
    this.sting = ctx.createGain(); this.sting.connect(this.duck);
    this.conv = ctx.createConvolver(); this.send = ctx.createGain(); this.wet = ctx.createGain(); this.wet.gain.value = 0;
    this.sfx.connect(this.send); this.hero.connect(this.send); this.send.connect(this.conv); this.conv.connect(this.wet); this.wet.connect(this.duck);
    this.musicHush = ctx.createGain(); this.musicHush.connect(this.duck);
    // (act-43 反馈：「BGM要降低一点音量」: 0.42 → 0.3, about −3 dB)
    this.music = ctx.createGain(); this.music.gain.value = MUSIC_BASE;
    if (noFilter) this.music.connect(this.musicHush);
    else { this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 18000; this.lp.Q.value = 0.7; this.music.connect(this.lp); this.lp.connect(this.musicHush); }
    this.setRoom(this.room);
    this.voice = ctx.createGain(); this.voice.gain.value = 1.0; this.voice.connect(this.master);
    void Promise.all((o.warm ?? []).map(n => this.warm(n))).then(() => firstSoundsIn());
    this.loading = this.loadSamples().then(() => (o.prefetch ? this.prefetch() : undefined));
  }
  /** the effects (music is decoded on demand — playMusic / warm: six decoded tracks would hold ~250 MB on a phone) */
  private async loadSamples() {
    const ctx = this.ctx; if (!ctx) return;
    // (11-18 微信小游戏: a sample that won't load is skipped as before, but none loading at all is reported — the phone stayed silent
    // without a word, act-65)
    let failed: unknown = null, tried = 0;
    await Promise.all(Object.entries(byName).filter(([n]) => !n.startsWith('bgm_')).map(async ([n, url]) => {
      // (the build inlines each sample as a data: URL; the dev server hands back a plain file URL — fetch that one)
      tried++; try { let ab: ArrayBuffer; if (!url.startsWith('data:')) ab = await (await fetch(url)).arrayBuffer(); else { const b64 = url.slice(url.indexOf(',') + 1), bin = atob(b64), arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); ab = arr.buffer; } this.buf.set(n, await ctx.decodeAudioData(ab)); } catch (e) { failed = failed ?? e; /* skip broken sample */ }
    }));
    if (tried && !this.buf.size) console.error('[audio] no sound could be loaded:', failed);
    this.ready = true;
  }
  private now() { return this.ctx ? this.ctx.currentTime : 0; }
  /** act-37: a voiced dialogue line — decoded on first use, one at a time on the voice bus (the line before stops), the music and
   *  the effects ducked under it. act-114: generation counter prevents fast dialogue skips from playing stale async decodes */
  private vo = new Map<string, Promise<AudioBuffer | null>>(); private voSrc: AudioBufferSourceNode | null = null; private voGen = 0;
  private loopSrc: AudioBufferSourceNode | null = null; private loopG: GainNode | null = null; private loopGen = 0; private loopBase = 0.55;
  private decodeVoice(url: string): Promise<AudioBuffer | null> {
    const ctx = this.ctx; if (!ctx) return Promise.resolve(null);
    let p = this.vo.get(url);
    if (!p) {
      p = (async () => { try {
        let ab: ArrayBuffer; if (!url.startsWith('data:')) ab = await (await fetch(url)).arrayBuffer();
        else { const b64 = url.slice(url.indexOf(',') + 1), bin = atob(b64), arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); ab = arr.buffer; }
        return await ctx.decodeAudioData(ab);
      } catch { return null; } })();
      this.vo.set(url, p);
    }
    return p;
  }
  /** act-140: pre-fetch & pre-decode a voice MP3 into RAM so dialogue / cutscene lines start with 0ms delay */
  warmVoice(url: string) { if (this.ctx) void this.decodeVoice(url); }
  async voiceLine(url: string) {
    const ctx = this.ctx; if (!ctx || this.muted) return;
    const gen = ++this.voGen;
    this.stopVoice(false);
    const b = await this.decodeVoice(url); if (!b || gen !== this.voGen || this.muted) return;
    this.stopVoice(false);
    const src = ctx.createBufferSource(); src.buffer = b; src.connect(this.voice); const t = this.now(); src.start(t); this.voSrc = src;
    this.duck.gain.cancelScheduledValues(t); this.duck.gain.setTargetAtTime(0.55, t, 0.06); this.duck.gain.setTargetAtTime(1, t + b.duration, 0.25);
    // gently duck any background voice loop (e.g. Liu Bai's wounded breathing) while dialogue speaks
    if (this.loopG) {
      this.loopG.gain.cancelScheduledValues(t);
      this.loopG.gain.setTargetAtTime(this.loopBase * 0.28, t, 0.06);
      this.loopG.gain.setTargetAtTime(this.loopBase, t + b.duration, 0.28);
    }
    src.onended = () => { if (this.voSrc === src) this.voSrc = null; };
  }
  /** act-128: start a subtle looping voice bed (e.g. Liu Bai's wounded breathing during prologue defeat), ducked automatically under dialogue */
  async startVoiceLoop(url: string, gain = 0.58) {
    const ctx = this.ctx; if (!ctx || this.muted) return;
    const gen = ++this.loopGen;
    this.stopVoiceLoop(0.15, false);
    const b = await this.decodeVoice(url); if (!b || gen !== this.loopGen || this.muted) return;
    this.stopVoiceLoop(0.05, false);
    const src = ctx.createBufferSource(); src.buffer = b; src.loop = true;
    const g = ctx.createGain(); const t = this.now();
    this.loopBase = gain;
    const target = this.voSrc ? gain * 0.28 : gain;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(target, t + 0.35);
    src.connect(g); g.connect(this.voice); src.start(t);
    this.loopSrc = src; this.loopG = g;
  }
  stopVoiceLoop(fade = 0.45, bump = true) {
    if (bump) this.loopGen++;
    if (this.loopSrc && this.loopG && this.ctx) {
      const s = this.loopSrc, g = this.loopG, t = this.now();
      this.loopSrc = null; this.loopG = null;
      try { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0.0001, t + fade); s.stop(t + fade + 0.05); } catch { /* ended */ }
    } else if (this.loopSrc) {
      try { this.loopSrc.stop(); } catch { /* ended */ }
      this.loopSrc = null; this.loopG = null;
    }
  }
  get voicing() { return !!this.voSrc; }
  stopVoice(bump = true) {
    if (bump) this.voGen++;
    if (this.voSrc) { try { this.voSrc.stop(); } catch { /* ended */ } this.voSrc = null; if (this.ctx) { this.duck.gain.setTargetAtTime(1, this.now(), 0.2); if (this.loopG) this.loopG.gain.setTargetAtTime(this.loopBase, this.now(), 0.2); } }
  }
  /** 11-18: the sounds playing now — at most MAX_VOICES; a new one past that stops the oldest of the least important (or is dropped
   *  when everything playing matters more). Tracks expected endAt so missed onended after OS suspension can never permanently clog SFX. */
  private live: Array<{ src: AudioBufferSourceNode; pri: number; t: number; endAt: number }> = [];
  /** play one sample: rate / gain jittered; pri = how much it matters (3 her blows, 2 her moves, 1 the foes, 0 the rest) */
  play(name: string, o: { gain?: number; rate?: number; jitter?: number; delay?: number; bus?: 'sfx' | 'voice' | 'hero' | 'sting'; pri?: number; pan?: number } = {}) {
    const ctx = this.ctx, b = this.buf.get(name); if (!ctx || !b || this.muted) return null;
    const st = ctx.state as string;
    if (st === 'suspended' || st === 'interrupted') { this.wasInterrupted = true; void Promise.resolve(ctx.resume()).catch(() => {}); }
    const pri = o.pri ?? (o.bus === 'hero' ? 2 : 1), now = this.now();
    // Prune expired voices whose onended callback may have been lost during tab/app suspension
    for (let i = this.live.length - 1; i >= 0; i--) { if (this.live[i].endAt <= now) this.live.splice(i, 1); }
    if (o.bus !== 'voice' && this.live.length >= MAX_VOICES) {
      let worst = -1;
      for (let i = 0; i < this.live.length; i++) { const v = this.live[i]; if (v.pri <= pri && (worst < 0 || v.pri < this.live[worst].pri || (v.pri === this.live[worst].pri && v.t < this.live[worst].t))) worst = i; }
      if (worst < 0) return null;
      const v = this.live.splice(worst, 1)[0]; try { v.src.stop(); } catch { /* ended */ }
    }
    const src = ctx.createBufferSource(); src.buffer = b; const j = o.jitter ?? 0.08;
    const playRate = Math.max(0.25, (o.rate ?? 1) * (1 + (Math.random() * 2 - 1) * j));
    src.playbackRate.value = playRate;
    const g = ctx.createGain(); g.gain.value = (o.gain ?? 1) * (1 + (Math.random() * 2 - 1) * j * 0.6);
    const dest = o.bus === 'voice' ? this.voice : o.bus === 'hero' ? this.hero : o.bus === 'sting' ? this.sting : this.sfx;
    const panVal = o.pan ? Math.max(-0.85, Math.min(0.85, o.pan)) : 0;
    if (Math.abs(panVal) > 0.04 && typeof (ctx as unknown as { createStereoPanner?: () => StereoPannerNode }).createStereoPanner === 'function') {
      const p = (ctx as unknown as { createStereoPanner: () => StereoPannerNode }).createStereoPanner();
      p.pan.value = panVal; src.connect(g); g.connect(p); p.connect(dest);
    } else {
      src.connect(g); g.connect(dest);
    }
    const startAt = now + (o.delay ?? 0);
    src.start(startAt);
    if (o.bus !== 'voice') { const e = { src, pri, t: now, endAt: startAt + b.duration / playRate + 0.15 }; this.live.push(e); src.onended = () => { const i = this.live.indexOf(e); if (i >= 0) this.live.splice(i, 1); }; }
    this.recent.push(name); if (this.recent.length > 40) this.recent.shift(); return src;
  }
  /** act-50 (用户：「sting_lose.mp3、sting_win.mp3 这两个文件没用上啊，我之前让替换胜利和失败的音效来着」): a sting played whole on its
   *  own bus (never stolen by the voice cap); the next music fades it out (stopSting) */
  private stingSrc: AudioBufferSourceNode[] = [];
  private stingLast = { prefix: '', t: -9 };
  stingPlay(prefix: string, gain: number) {
    const ctx = this.ctx; if (!ctx) return; const v = variants(prefix); if (!v.length) return;
    if (this.stingLast.prefix === prefix && this.now() - this.stingLast.t < 4 && this.stingSrc.length) return;   // still ringing: don't start it over
    this.stingLast = { prefix, t: this.now() };
    const t = this.now(); this.sting.gain.cancelScheduledValues(t); this.sting.gain.setValueAtTime(1, t);
    const src = this.play(v[Math.floor(Math.random() * v.length)], { gain, jitter: 0, bus: 'sting', pri: 9 }); if (src) this.stingSrc.push(src);
  }
  stopSting(fade = 1.0) {
    const ctx = this.ctx; if (!ctx || !this.stingSrc.length) return; const t = this.now(), list = this.stingSrc; this.stingSrc = [];
    this.sting.gain.cancelScheduledValues(t); this.sting.gain.setValueAtTime(this.sting.gain.value, t); this.sting.gain.linearRampToValueAtTime(0, t + fade);
    for (const s of list) { try { s.stop(t + fade + 0.05); } catch { /* ended */ } }
  }
  /** 11-18: her blow lands — the world's sounds and the music step back for a moment so the cut is heard whole */
  hitDuck(k = 1) {
    if (!this.ctx) return; const t = this.now();
    for (const [g, d] of [[this.hush, 0.6], [this.musicHush, 0.72]] as Array<[GainNode, number]>) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(1 - (1 - d) * k, t + 0.01); g.gain.setTargetAtTime(1, t + 0.12, 0.06); }
  }
  /** 11-18 一闪: the held breath — everything but her own sounds near silent for `s` seconds, then back */
  stillness(s: number) {
    if (!this.ctx) return; const t = this.now();
    for (const [g, d] of [[this.hush, 0.12], [this.musicHush, 0.25]] as Array<[GainNode, number]>) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(d, t + 0.04); g.gain.setValueAtTime(d, t + s); g.gain.linearRampToValueAtTime(1, t + s + 0.35); }
  }
  /** 11-18 空间回响: the room's tail (s) and how much of it (0..1); the impulse is noise decaying to −60 dB, darker as it goes */
  private room: [number, number] = [0.6, 0.16];
  setRoom(r: [number, number]) {
    this.room = r; const [decay, w] = r, ctx = this.ctx; if (!ctx) return;
    if ((ctx as unknown as { noReverb?: boolean }).noReverb) return;   // (11-18 微信小游戏: no ConvolverNode there — no room tail)
    const sr = ctx.sampleRate, n = Math.max(1, Math.floor(sr * decay)), ir = ctx.createBuffer(2, n, sr), pre = Math.floor(sr * 0.012);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c); let lp = 0;
      for (let i = pre; i < n; i++) { const t = (i - pre) / sr, a = Math.exp(-6.9 * t / decay), k = 0.55 - 0.4 * (t / decay); lp += (Math.random() * 2 - 1 - lp) * k; d[i] = lp * a; }
    }
    this.conv.buffer = ir; this.wet.gain.setTargetAtTime(w, this.now(), 0.1);
  }
  /** 11-18 藏锋: the blade humming in its sheath while the stance fills — level 0 stops it; rises in pitch and loudness with the
   *  charge, and when held full (beat > 0) swells and sinks slowly like a pulse */
  private humSrc: AudioBufferSourceNode | null = null; private humG: GainNode | null = null;
  hum(level: number, beat = 0) {
    const ctx = this.ctx; if (!ctx || this.muted) return;
    const t = this.now();
    if (level <= 0) { if (this.humSrc && this.humG) { const s = this.humSrc; this.humG.gain.setTargetAtTime(0, t, 0.03); s.stop(t + 0.2); this.humSrc = null; this.humG = null; } return; }
    if (!this.humSrc) {
      const name = variants('ub_hum_')[0], b = name ? this.buf.get(name) : null; if (!b) return;
      const src = ctx.createBufferSource(); src.buffer = b; src.loop = true; const g = ctx.createGain(); g.gain.value = 0;
      src.connect(g); g.connect(this.hero); src.start(t, Math.random() * Math.max(0, b.duration - 1)); this.humSrc = src; this.humG = g;
    }
    const pulse = beat > 0 ? 0.75 + 0.25 * Math.cos(t * Math.PI * 2 * 1.6) : 1;
    this.humG!.gain.setTargetAtTime((0.12 + 0.4 * level) * pulse, t, 0.04); this.humSrc.playbackRate.setTargetAtTime(0.82 + 0.34 * level, t, 0.05);
  }
  any(prefix: string, o: Parameters<AudioEngine['play']>[1] = {}) { const v = variants(prefix); if (v.length) this.play(v[Math.floor(Math.random() * v.length)], o); }
  /** procedural layers the sample library lacks: whoosh, boom, rumble */
  noise(dur: number, o: { from: number; to: number; gain: number; type?: BiquadFilterType; q?: number; delay?: number }) {
    const ctx = this.ctx; if (!ctx || this.muted) return;
    const n = Math.floor(ctx.sampleRate * dur), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    if (this.noFilter) return;   // (a mini-game: filtered noise passes nothing on Android, raw noise would hiss — skipped)
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
  /** 11-18: a track decoded ahead (or being decoded) — playMusic takes it from here instead of decoding it a second time */
  private decoding = new Map<string, Promise<AudioBuffer | null>>();
  warm(n: string): Promise<AudioBuffer | null> {
    const have = this.buf.get(n); if (have) return Promise.resolve(have);
    let p = this.decoding.get(n);
    if (!p) { p = this.decodeName(n).then(b => { this.decoding.delete(n); if (b) this.buf.set(n, b); return b; }); this.decoding.set(n, p); }
    return p;
  }
  /** 11-18 微信小游戏: the audio subpackages the effects didn't need, one after another (each fetch is only the subpackage's download
   *  there — wechat/glue.js — nothing is read or decoded) */
  private async prefetch() {
    // (one file per subpackage, in the packages' order — tools/wxAssets.ts numbers them in the order they are heard)
    const one = new Map<string, string>();
    for (const url of Object.values(byName)) {
      if (/^(data|https?):/.test(url)) continue;
      const top = url.replace(/^\.?\//, '').split('/')[0]; if (!one.has(top)) one.set(top, url);
    }
    const num = (k: string) => +(/\d+$/.exec(k)?.[0] ?? 1e9);
    for (const [, url] of [...one].sort((a, b) => num(a[0]) - num(b[0]))) {
      try { await fetch(url); } catch { /* fetched again when the track is wanted */ }
    }
  }
  private decodeName(n: string) {
    const ctx = this.ctx, url = byName[n]; if (!ctx || !url) return Promise.resolve(null);
    if (!url.startsWith('data:')) return fetch(url).then(r => r.arrayBuffer()).then(ab => ctx.decodeAudioData(ab)).catch(e => { console.warn('[audio] can\'t load', n, e); return null; });   // the dev server / a mini-game package file
    const b64 = url.slice(url.indexOf(',') + 1), bin = atob(b64), arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return ctx.decodeAudioData(arr.buffer).catch(() => null);
  }
  private musicWant = '';
  /** cross-fade to a music track (decoded now if needed; only the playing and the last one stay decoded). Same track: nothing. */
  async playMusic(name: string, fade = 1.6, offset = 0) {
    const ctx = this.ctx; if (!ctx || this.musicWant === name) return; this.musicWant = name; this.stopSting(1.8);
    let b = this.buf.get(name);
    if (!b) { const d = await this.warm(name); if (!d) return; b = d; }
    if (this.musicWant !== name) { if (OPT.singleMusic && this.musicName !== name) this.buf.delete(name); return; }   // asked for another while decoding
    const t = this.now();
    if (this.musicSrc) { const old = this.musicSrc, og = (old as any)._g as GainNode; og.gain.cancelScheduledValues(t); og.gain.setValueAtTime(og.gain.value, t); og.gain.linearRampToValueAtTime(0, t + fade); old.onended = () => { old.disconnect(); og.disconnect(); old.buffer = null; }; old.stop(t + fade + 0.05); }
    const src = ctx.createBufferSource(); src.buffer = b; src.loop = !MUSIC_ONCE.has(name);
    const lp = MUSIC_LOOPS[name]; if (lp) { src.loopStart = lp[0]; src.loopEnd = Math.min(lp[1], b.duration); }
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + fade); (src as any)._g = g;
    const startOff = Math.min(offset, Math.max(0, b.duration - 1));
    src.connect(g); g.connect(this.music); src.start(t, startOff);
    this.musicSrc = src; this.musicName = name; this.musicEnded = false; this.musicStartedAt = performance.now() / 1000; this.musicOffset = startOff;
    src.onended = () => { if (this.musicSrc === src) { this.musicSrc = null; this.musicEnded = true; } };
    // The fading source owns the old buffer until onended. The cache only needs the playing score.
    for (const k of [...this.buf.keys()]) if (k.startsWith('bgm_') && k !== name && (OPT.singleMusic || k !== this.musicPrev)) this.buf.delete(k);
    this.musicPrev = name;
  }
  private musicPrev = '';
  /** fade the music out (a death, the end of a run); the next playMusic brings it back */
  stopMusic(fade = 1.5) {
    this.musicWant = '';
    if (!this.ctx || !this.musicSrc) return; const t = this.now(), old = this.musicSrc, og = (old as any)._g as GainNode;
    og.gain.cancelScheduledValues(t); og.gain.setValueAtTime(og.gain.value, t); og.gain.linearRampToValueAtTime(0, t + fade); old.stop(t + fade + 0.05);
    if (OPT.singleMusic) this.buf.delete(this.musicName);
    this.musicSrc = null; this.musicName = ''; this.musicWant = '';
  }
  /** dip the music under a stinger for a while (k = level, 0..1) */
  duckMusic(k: number, hold: number, back = 0.8) {
    if (!this.ctx) return; const t = this.now(), g = this.music.gain, base = MUSIC_BASE;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(base * k, t + 0.25); g.setValueAtTime(base * k, t + hold); g.linearRampToValueAtTime(base, t + hold + back);
  }
  /** 0 = open, 1 = muffled (low HP) */
  muffle(k: number) { if (!this.ctx || !this.lp) return; this.lp.frequency.setTargetAtTime(18000 * Math.pow(1 - k * 0.92, 2) + 600 * k, this.now(), 0.4); }
  /** 11-19 the tutorial's slow motion / freeze: 0 = the full band, 1 = only the mids (≈ 350 Hz – 2.4 kHz); eased */
  slowBand(k: number) {
    if (!this.ctx || !this.bandHi || !this.bandLo) return; k = Math.max(0, Math.min(1, k)); if (Math.abs(k - this.bandK) < 0.02) return; this.bandK = k;
    const t = this.now(); this.bandHi.frequency.setTargetAtTime(10 * Math.pow(35, k), t, 0.12); this.bandLo.frequency.setTargetAtTime(20000 * Math.pow(2400 / 20000, k), t, 0.12);
  }
  /** act-152: continuous pure-PCM rain / storm ambient bed (zero BiquadFilterNode, 100% WeChat / Android safe) */
  private weatherWant: 'none' | 'rain' | 'storm' = 'none';
  private weatherBuf: AudioBuffer | null = null;
  private weatherSrc: AudioBufferSourceNode | null = null;
  private weatherG: GainNode | null = null;
  private makeRainBuffer(ctx: AudioContext): AudioBuffer {
    if (this.weatherBuf && this.weatherBuf.sampleRate === ctx.sampleRate) return this.weatherBuf;
    const sr = ctx.sampleRate, len = Math.floor(sr * 3.2), fade = Math.floor(sr * 0.25);
    const buf = ctx.createBuffer(1, len, sr), out = buf.getChannelData(0);
    // Deterministic PRNG + JS-baked soft pink rain wash + delicate raindrop patters (zero WebAudio filter dependency)
    let s = 0x51a7c3d1, b0 = 0, b1 = 0, b2 = 0, lp = 0, hp = 0, sm = 0;
    const raw = new Float32Array(len + fade);
    for (let i = 0; i < raw.length; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      const w = (s / 2147483648) - 1;
      // gentle pink-ish shaping for rain rush
      b0 = 0.996 * b0 + w * 0.042;
      b1 = 0.962 * b1 + w * 0.085;
      b2 = 0.780 * b2 + w * 0.145;
      // soft high-pass to avoid sub-bass rumble + smooth low-pass to avoid harsh hiss
      const mix = b0 + b1 + b2;
      hp = 0.985 * (hp + mix - lp);
      lp = mix;
      // occasional delicate raindrop patter impulse
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      const drop = (s >>> 20) === 0 ? ((s & 1 ? 1 : -1) * 0.11) : 0;
      const sample = (hp * 0.52 + b2 * 0.28 + drop) * 0.56;
      sm = 0.68 * sm + 0.32 * sample;
      raw[i] = Math.max(-0.95, Math.min(0.95, sm));
    }
    // seamless loop crossfade across tail -> head
    for (let i = 0; i < len; i++) {
      if (i < fade) {
        const k = i / fade;
        out[i] = raw[i] * k + raw[len + i] * (1 - k);
      } else {
        out[i] = raw[i];
      }
    }
    this.weatherBuf = buf;
    return buf;
  }
  private applyWeatherSound(fade = 0.65) {
    const ctx = this.ctx;
    if (!ctx || !this.hush) return;
    // act-181 (用户：「雨声有点太大了」): keep rain / storm bed atmospheric (~-10 dB) so BGM, blades & voice stay crisp
    const target = this.muted || this.weatherWant === 'none' ? 0 : this.weatherWant === 'storm' ? 0.082 : 0.048;
    const t = this.now();
    if (target <= 0) {
      if (this.weatherG && this.weatherSrc) {
        const g = this.weatherG, src = this.weatherSrc;
        this.weatherG = null; this.weatherSrc = null;
        try {
          g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + fade);
          src.onended = () => { try { src.disconnect(); g.disconnect(); } catch { /* ended */ } };
          src.stop(t + fade + 0.08);
        } catch { /* ended */ }
      }
      return;
    }
    if (!this.weatherSrc || !this.weatherG) {
      try {
        const src = ctx.createBufferSource();
        src.buffer = this.makeRainBuffer(ctx);
        src.loop = true;
        src.playbackRate.value = this.weatherWant === 'storm' ? 1.12 : 0.96;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(target, t + fade);
        src.connect(g); g.connect(this.hush);
        src.start(t);
        this.weatherSrc = src; this.weatherG = g;
      } catch { /* mini-game audio guard */ }
    } else {
      try {
        this.weatherSrc.playbackRate.value = this.weatherWant === 'storm' ? 1.12 : 0.96;
        this.weatherG.gain.cancelScheduledValues(t);
        this.weatherG.gain.setValueAtTime(this.weatherG.gain.value, t);
        this.weatherG.gain.linearRampToValueAtTime(target, t + fade);
      } catch { /* mini-game audio guard */ }
    }
  }
  setWeatherSound(kind: 'none' | 'rain' | 'storm', fade = 0.65) {
    this.weatherWant = kind;
    this.applyWeatherSound(fade);
  }
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
/** 11-18: her blow (her bus, the most important, ±3 %) */
const hb = (id: string, o: Parameters<AudioEngine['play']>[1] = {}) => audio.any('ub_' + id + '_', { jitter: 0.03, bus: 'hero', pri: 3, ...o });
/** a blade into the wooden dummies: the old steel cut, a dry knock */
const wood = (g: number, rate: number) => { ub('cut_light', { gain: g, rate, jitter: 0.04, bus: 'hero', pri: 3 }); audio.tone(150 * rate, 0.06, { to: 85, gain: 0.12 }); };
/** a foe's voice: a man's takes, a big man's lower, the chief's lower still; a hound yelps. One foe voice at a time (FOE_GAP) */
let foeVoiceT = -1;
const FOE_GAP = 0.22;
function foeVoice(kind: 'pain' | 'death' | 'cry', who: number, k: number) {
  const now = performance.now() / 1000; if (now - foeVoiceT < (kind === 'death' ? FOE_GAP * 0.5 : FOE_GAP)) return; foeVoiceT = now;
  if (who === 3) { ub(kind === 'cry' ? 'hound' : 'vo_yelp', { gain: 0.5 + 0.3 * k }); return; }
  const id = who >= 1 && kind !== 'cry' ? (kind === 'pain' ? 'vo_brute' : 'vo_death') : 'vo_' + kind;
  const rate = who === 2 ? 0.82 : who === 1 ? (kind === 'pain' ? 0.95 : 0.86) : 1;
  ub(id, { gain: (kind === 'death' ? 0.62 : kind === 'cry' ? 0.5 : 0.5) * (0.7 + 0.3 * k), rate, jitter: 0.06 });
}
/** 11-18: the same sound twice within this (s) is played once (default 0.05) */
const COOLDOWN: Partial<Record<Cue, number>> = { flurry: 0.03, count: 0, coin: 0.03, tick: 0, swingLight: 0.04, hitLight: 0.04, hitStab: 0.03, bodyFall: 0.08, dartHit: 0.04, foeSwing: 0.08, foeHeavy: 0.1, arrow: 0.06, dangerOff: 0.48, bloodBurst: 0.08, guardBreak: 0.12 };
const lastCue: Partial<Record<Cue, number>> = {};
// The first blade arrives before the mixer is ready. Its two samples live in
// the main WeChat package, so a cold launch can play them at the animation beat.
function loadingSound(sample: string, volume: number) {
  if (audio.muted) return;
  if (audio.ctx?.state === 'running' && audio.buf.has(sample)) {
    audio.play(sample, { gain: volume, bus: 'hero', pri: 3 }); return;
  }
  if (typeof wx === 'undefined' || !wx.createInnerAudioContext) return;
  try {
    const player = wx.createInnerAudioContext();
    const release = () => player.destroy();
    player.onEnded?.(release); player.onError?.(release);
    player.volume = volume;
    player.src = byName[sample];
    player.play();
  } catch (error) { console.warn('[audio] loading blade', error); }
}
const H: Partial<Record<Cue, (k: number, x?: number) => void>> = {
  bladeFlyIn: () => loadingSound('ub_draw_1', 0.78),
  bladeFlyOut: () => loadingSound('ub_sw_stab_1', 0.74),
  // UI
  clack: k => audio.any('ui_tap', { gain: 0.3 + k * 0.5, rate: 0.9 + k * 0.2 }),
  select: () => audio.any('ui_tap', { gain: 0.6, rate: 1.25 }),
  deselect: () => audio.any('ui_tap', { gain: 0.5, rate: 0.8 }),
  count: (k) => { const now = performance.now(); if (now - countT > 900) count = 0; countT = now; audio.any('ui_tap', { gain: 0.6 + k * 0.3, rate: 1 + Math.min(10, count++) * 0.07, jitter: 0.01 }); },
  click: () => audio.any('ui_tap', { gain: 0.6 }),
  deny: () => audio.any('ui_tap', { gain: 0.6, rate: 0.6 }),
  tick: () => audio.any('ui_tap', { gain: 0.3, rate: 1.4 }),
  // the old generic names, re-voiced with the new set (older code still calls them)
  whoosh: k => audio.any('ub_sw_light_', { gain: 0.3 + 0.45 * k, rate: 1.05 - 0.15 * Math.min(1, k), jitter: 0.04, bus: 'hero', pri: 1 }),
  reveal: k => { ub('scroll', { gain: 0.5 }); if (k >= 2) audio.noise(0.6, { from: 3000, to: 200, gain: 0.2, type: 'lowpass' }); },
  relic: () => ub('coins', { gain: 0.45, rate: 1.3 }),
  impact: k => hb(k > 0.85 ? 'hit_heavy' : 'hit_light', { gain: 0.55 + 0.4 * k }),
  crit: k => { ub('ult_slash', { gain: 0.55 * (k || 1), bus: 'hero', pri: 3 }); },   // (11-18: the counter's gold flash; its blow plays its own hit)
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
  swish: k => audio.any('ub_sw_light_', { gain: 0.4 + 0.35 * k, jitter: 0.04, bus: 'hero', pri: 2 }),
  swishHeavy: k => audio.any('ub_sw_heavy_', { gain: 0.5 + 0.4 * k, jitter: 0.04, bus: 'hero', pri: 2 }),
  // act-23 (用户：「现在的音效没有任何打击感，砍上去也没有砍中的感觉」) → act-29 (用户听了试听页：「砍到人身上的声音不像，比较像是打击和
  // 钝器攻击的声音」): a hit is the BLADE — a fast sharp slice through cloth and flesh (the main layer, high and crisp) with a short wet
  // cut under it; the act-19 steel cut only faintly; no meat thud, no cleaver, no synthetic low punch (those read as a club or a fist).
  // Heavy blows: a longer slash, the slice, a thin steel ring as its tail and a little spatter. (Stable Audio small, sfx/out_unseen_hit_v3.)
  // x = 0: only wood was hit (the dummies) — steel and a dry knock
  // act-23 → act-29 → 11-18 第二轮 (用户：「音效不晓得是不是做得过于精细了，听起来很乱，音效大多也很短，缺乏刀刀到肉的打击感」): each blow
  // is ONE composed sound (GameProtos/sfx/make_hits_v4.py — the edge, the cut into flesh, a touch of low, a 0.3–0.6 s tail, every layer
  // on one onset), five tiers × 3 takes, ±3 % pitch, on her own bus (the world steps back under it). x = 0: only wood was hit (the dummies)
  cut: (k, x) => H.hitLight!(k, x), cutHeavy: (k, x) => H.hitHeavy!(k, x),
  // act-109: x === 0 is wooden dummy; x >= 1 is flesh (x = 1..4 ramps combo pitch slightly for crisp cadence)
  hitLight: (k, x) => { if (x === 0) return wood(0.55 + 0.3 * k, 1); const step = x && x > 1 ? Math.min(4, x - 1) : 0; hb('hit_light', { gain: 0.85 + 0.15 * k, rate: 1 + step * 0.045 }); audio.hitDuck(0.7); },
  hitStab: (k, x) => { if (x === 0) return wood(0.45 + 0.3 * k, 1.15); const step = x && x > 1 ? Math.min(4, x - 1) : 0; hb('hit_stab', { gain: 0.72 + 0.2 * k, rate: 1 + step * 0.05 }); audio.hitDuck(0.5); },
  hitHeavy: (k, x) => { if (x === 0) return wood(0.7 + 0.3 * k, 0.85); hb('hit_heavy', { gain: 0.85 + 0.15 * k }); audio.hitDuck(1); },
  hitKick: (k, x) => { hb('hit_kick', { gain: 0.8 + 0.2 * k }); if (x !== 0) audio.hitDuck(0.8); },
  hitKill: k => hb('hit_kill', { gain: 0.7 * k, delay: 0.015 }),
  hitIai: (k, x) => { if (x === 0) { wood(1, 0.8); hb('blade_ring', { gain: 0.6 }); return; } hb('hit_iai', { gain: 1 }); audio.hitDuck(1); },
  gore: k => hb('hit_kill', { gain: 0.6 * k }),
  // 11-18 不见刀's burst: each quick cut a short sharp slice and a thin whoosh, higher as the burst runs (k 0.7 → 1)
  flurry: (k, x) => { hb(x === 0 ? 'hit_stab' : Math.random() < 0.5 ? 'hit_stab' : 'hit_light', { gain: 0.5 + 0.15 * k, rate: 0.95 + 0.35 * k, jitter: 0.05 }); audio.any('ub_sw_stab_', { gain: 0.3, rate: 1 + 0.3 * k, jitter: 0.06, bus: 'hero', pri: 2 }); audio.hitDuck(0.5); },
  swingLight: k => audio.any('ub_sw_light_', { gain: 0.4 + 0.35 * k, jitter: 0.04, bus: 'hero', pri: 2 }),
  swingSpin: k => audio.any('ub_sw_spin_', { gain: 0.45 + 0.35 * k, jitter: 0.04, bus: 'hero', pri: 2 }),
  swingStab: k => audio.any('ub_sw_stab_', { gain: 0.45 + 0.3 * k, jitter: 0.04, bus: 'hero', pri: 2 }),
  swingHeavy: k => audio.any('ub_sw_heavy_', { gain: 0.55 + 0.4 * k, jitter: 0.04, bus: 'hero', pri: 2 }),
  breath: k => audio.any('ub_vo_breath_', { gain: 0.55 * k, jitter: 0.03, bus: 'hero', pri: 2 }),
  bladeRing: (k, x) => audio.any('ub_blade_ring_', { gain: 0.55 * k, rate: x && x > 0 ? x : 1, jitter: 0.02, bus: 'hero', pri: 2 }),
  skid: k => audio.any('ub_skid_', { gain: 0.45 * k, jitter: 0.05, bus: 'hero', pri: 1 }),
  // the foes: x = whose voice (0 a man, 1 a big man, 2 the chief, 3 a hound); swing/heavy/arrow accept optional stereo pan (-1..1) in x
  foePain: (k, x) => foeVoice('pain', x ?? 0, k), foeDeath: (k, x) => foeVoice('death', x ?? 0, k), foeCry: (k, x) => foeVoice('cry', x ?? 0, k),
  foeHeavy: (k, x) => ub('sw_foeheavy', { gain: 0.5 + 0.4 * k, jitter: 0.05, pan: x }),
  // act-114: layered armor-shatter on hero bus with crisp metallic ring + low weight + mix ducking (works under WeChat noFilter)
  guardBreak: k => {
    const v = k || 1;
    ub('guard_break', { gain: 0.95 * v, jitter: 0.03, bus: 'hero', pri: 3 });
    audio.any('ub_blade_ring_', { gain: 0.48 * v, rate: 1.24, delay: 0.02, jitter: 0.03, bus: 'hero', pri: 3 });
    audio.tone(110, 0.26, { to: 42, gain: 0.32 * v });
    audio.hitDuck(1);
  },
  draw: k => ub('draw', { gain: 0.6 + 0.4 * k, jitter: 0.04, bus: 'hero', pri: 2 }),
  sheathe: k => ub('sheathe', { gain: 0.55 + 0.4 * k, jitter: 0.03, bus: 'hero', pri: 2 }),
  parry: k => ub('parry', { gain: 0.8 + 0.3 * k, jitter: 0.03, bus: 'hero', pri: 3 }),
  dash: k => ub('dash', { gain: 0.4 + 0.4 * k, jitter: 0.05, bus: 'hero', pri: 2 }),
  jump: k => ub('jump', { gain: 0.35 + 0.3 * k, jitter: 0.05, bus: 'hero', pri: 2 }),
  land: k => audio.any('ub_land2_', { gain: 0.3 + 0.5 * k, jitter: 0.05, bus: 'hero', pri: 2 }),
  dartThrow: k => ub('dart_throw', { gain: 0.35 + 0.3 * k, rate: 1.1, bus: 'hero', pri: 2 }),
  dartHit: k => ub('dart_hit', { gain: 0.4 + 0.4 * k }),
  arrow: (k, x) => ub('arrow', { gain: 0.35 + 0.4 * k, pan: x }),
  bodyFall: k => ub('body_fall', { gain: 0.45 + 0.4 * k }),
  foeSwing: (k, x) => ub('foe_swing', { gain: 0.35 + 0.4 * k, pan: x }),
  // act-114: spatialized off-screen high-danger sound-wave glint (blind swordswoman hears incoming unseen steel, noFilter-safe)
  dangerOff: (k, x) => {
    const pan = x ?? 0;
    audio.any('ub_blade_ring_', { gain: 0.26 * (k || 1), rate: 1.65, jitter: 0.03, pan, pri: 2 });
    ub('foe_swing', { gain: 0.22 * (k || 1), rate: 1.32, delay: 0.02, jitter: 0.04, pan, pri: 2 });
  },
  // act-114: crimson bleed-detonation burst (见红 血爆)
  bloodBurst: k => {
    const v = k || 1;
    hb('hit_kill', { gain: 0.78 * v, rate: 1.08 });
    hb('hit_heavy', { gain: 0.52 * v, rate: 1.16, delay: 0.015 });
    audio.hitDuck(0.9);
  },
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
  // 11-19 (用户：「闪避成功那个音效怎么我感觉是拼刀的声音」 → then 「现在闪避的音效也不对啊，不是闪避的那种风声」): the bell over it
  // read as a chime and the time-slow swell as a whoosh of something else. A dodge is wind: the dash's own rush of air sped up and
  // brightened (she twists past the edge), a thin fast swing of cloth on top, and a short band of air tearing high to low — no tone,
  // no bell, no metal
  dodgeOk: k => { ub('dash', { gain: 0.7 * k, rate: 1.25, jitter: 0.04, bus: 'hero', pri: 3 }); audio.any('ub_sw_light_', { gain: 0.42 * k, rate: 1.5, jitter: 0.03, bus: 'hero', pri: 3, delay: 0.015 });
    audio.noise(0.2, { from: 6800, to: 900, gain: 0.26 * k, type: 'bandpass', q: 0.7 }); },
  ultSlash: k => { ub('ult_slash', { gain: 1, jitter: 0.02 }); audio.tone(60, 0.8, { to: 30, gain: 0.5 * (k || 1) }); },
  scroll: k => ub('scroll', { gain: 0.45 + 0.3 * k }),
  hound: k => ub('hound', { gain: 0.45 + 0.4 * k }),
  // 11-18 打出界: a body into the water (a heavy slap, a wash of spray) / down a gully (a scrape, the thud far below a beat later) —
  // no new samples: the body fall pitched down, filtered noise for the water and the dust
  splash: k => { ub('body_fall', { gain: 0.5 + 0.3 * k, rate: 0.75, jitter: 0.04 }); audio.noise(0.9, { from: 2400, to: 300, gain: 0.32 * (0.6 + 0.4 * k), type: 'lowpass' }); audio.noise(0.45, { from: 5000, to: 1500, gain: 0.12, type: 'highpass', delay: 0.05 }); },
  dropFar: k => { ub('skid', { gain: 0.35 * (0.6 + 0.4 * k), rate: 0.8 }); ub('body_fall', { gain: 0.45 * (0.6 + 0.4 * k), rate: 0.7, delay: 0.42 }); audio.noise(0.6, { from: 700, to: 90, gain: 0.18, type: 'lowpass', delay: 0.42 }); },
  stingWin: () => audio.stingPlay('ub_sting_win_', 0.9),
  // act-37 (the user's): the stele's name struck through, waking after a death
  stingStele: () => ub('sting_stele', { gain: 0.9, jitter: 0 }), stingRevive: () => ub('sting_revive', { gain: 0.9, jitter: 0 }),
  stingLose: () => audio.stingPlay('ub_sting_lose_', 0.9),
  stingClear: () => ub('sting_clear', { gain: 0.7, jitter: 0 }),
  // 11-18 机关 — no new samples: the blade's ring pitched down over sine partials for the bells (a bronze bell's minor-third / fifth
  // partials, a long decay), the dummies' wood knock pitched down for a hollow wall, the crate / pillar / gate sounds pitched for the rest
  bell: (k, x) => { const f = [392, 466, 587][x ?? 0] ?? 392; audio.tone(f, 2.2, { gain: 0.16 * k }); audio.tone(f * 2.4, 1.1, { gain: 0.05 * k }); audio.tone(f * 0.5, 2.6, { gain: 0.07 * k }); ub('blade_ring', { gain: 0.35 * k, rate: f / 700, jitter: 0, pri: 2 }); },
  bellWrong: k => { for (const f of [392, 415, 587]) { audio.tone(f, 1.0, { gain: 0.1 * k }); audio.tone(f * 1.06, 0.8, { gain: 0.06 * k }); } ub('blade_ring', { gain: 0.4 * k, rate: 0.5, jitter: 0.03, pri: 2 }); },
  hollow: k => { wood(0.6 + 0.3 * k, 0.55); audio.tone(110, 0.35, { to: 70, gain: 0.25 * k }); audio.noise(0.3, { from: 600, to: 200, gain: 0.08 * k, type: 'bandpass', delay: 0.04 }); },
  wallBreak: k => { ub('crate_break', { gain: 0.7 * k, rate: 0.7 }); ub('pillar_fall', { gain: 0.6 * k, rate: 0.9, delay: 0.08 }); audio.noise(1.0, { from: 900, to: 80, gain: 0.25 * k, type: 'lowpass' }); },
  ropeSnap: k => { ub('dart_hit', { gain: 0.6 * k, rate: 1.4 }); audio.noise(0.25, { from: 4000, to: 900, gain: 0.15 * k, type: 'highpass' }); },
  bridgeDrop: k => { ub('wall_slam', { gain: 0.8 * k, rate: 0.75 }); ub('body_fall', { gain: 0.6 * k, rate: 0.6, delay: 0.05 }); audio.tone(60, 0.6, { to: 32, gain: 0.4 * k }); },
  doorOpen: k => { ub('gate_open', { gain: 0.6 + 0.3 * k, rate: 0.85 }); },
  plate: k => { wood(0.5 * k, 1.4); audio.tone(220, 0.12, { to: 160, gain: 0.12 * k }); },
  // act-114 剧情演出音效 (Stable Audio 3 medium, fallback gracefully if sample not yet loaded)
  textTick: k => { if (audio.buf.has('ub_text_tick_1')) ub('text_tick', { gain: 0.28 * k, jitter: 0.06 }); else audio.any('ui_tap', { gain: 0.14 * k, rate: 1.5, jitter: 0.05 }); },
  bladeChorus: k => { if (audio.buf.has('ub_blade_chorus_1')) ub('blade_chorus', { gain: 0.78 * k, jitter: 0.02, pri: 3 }); else ub('blade_ring', { gain: 0.7 * k, rate: 0.85, pri: 3 }); },
  snowWind: k => { if (audio.buf.has('ub_snow_wind_1')) ub('snow_wind', { gain: 0.56 * k, jitter: 0.03, pri: 2 }); else audio.noise(1.6, { from: 900, to: 220, gain: 0.16 * k, type: 'bandpass', q: 1.4 }); },
  needleZing: k => { if (audio.buf.has('ub_needle_zing_1')) ub('needle_zing', { gain: 0.75 * k, jitter: 0.04, pri: 2 }); else ub('dart_throw', { gain: 0.65 * k, rate: 1.35, pri: 2 }); },
  warHorn: k => { if (audio.buf.has('ub_war_horn_1')) ub('war_horn', { gain: 0.82 * k, jitter: 0.02, pri: 3 }); else { ub('boom', { gain: 0.6 * k, rate: 0.7 }); ub('fire', { gain: 0.55 * k }); } },
  stoneCarve: k => { if (audio.buf.has('ub_stone_carve_1')) ub('stone_carve', { gain: 0.88 * k, jitter: 0.03, pri: 3 }); else { ub('wall_slam', { gain: 0.7 * k }); ub('blade_ring', { gain: 0.55 * k, rate: 0.9 }); } },
};
setCueHandler((name, k, x) => {
  const now = performance.now() / 1000, cd = COOLDOWN[name] ?? 0.05;
  if (cd > 0 && now - (lastCue[name] ?? -9) < cd) return; lastCue[name] = now;
  H[name]?.(k, x);
});
