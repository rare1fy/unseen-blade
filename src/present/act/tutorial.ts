// 新手引导（11-19 用户：「像主机动作游戏一样做新手引导，不要做low low的手游式引导，通过战斗慢放、定格来告诉玩家怎么操作」）。
// 只在序章里真打的仗中：某个操作第一次用得上时，时间慢下来、停住（一直等到按对），画面轻度去色、声音收窄（slowBand），
// 只点亮该按的那颗钮；她头顶浮一块小铁牌：按键图标（键盘键帽 / 手柄按钮 / 触屏不画）+ 两个字。不加遮罩、不画手指。
//   打哨兵：移动 → 出刀（有人走近）→ 闪身（有人要砍到她）→ 跳起
//   打崔玄：按住（藏锋，气不够先补一格）→ 松开（他的刀要落下时：破势）
import * as THREE from 'three';
import type { UiLayer } from '../ui3d/layer';
import { worldToUi } from '../ui3d/layer';
import type { Input, BtnName } from './input';
import { BIND, PAD, keyName, glyphArt, paintGlyph, GLYPH_H } from './pad';
import { drawPix, pixW, PIX_H } from '../v2/pix';
import { canvasOf } from '../hud/paint';
import { FX } from '../engine/clock';
import { audio } from '../../audio/audio';
import { preferences } from '../../platform/preferences';
import { language } from './i18n';
import { TUNE } from './tune';
import { Hero } from './hero';
import { isBoss, type Foe } from './enemy';

export type LessonId = 'move' | 'attack' | 'dash' | 'jump' | 'stance' | 'parry';
const BTN: Record<LessonId, BtnName | null> = { move: null, attack: 'attack', dash: 'dash', jump: 'jump', stance: 'attack', parry: 'attack' };
const WORD: Record<LessonId, string> = { move: '移动', attack: '出刀', dash: '闪身', jump: '跳起', stance: '按住', parry: '松开' };
const PREF = 'ub.tutorial';

export interface TutCtx {
  phase: string; prologue: number; hero: Hero; inp: Input; foes: Foe[];
  /** foes whose blow lands on her within `win` s */ threats: (win: number) => number;
}

export class Tutorial {
  /** 设置「操作提示」 */
  enabled = preferences.get(PREF) !== '0';
  private done = new Set<LessonId>();
  cur: LessonId | null = null;
  /** 0 = time runs, 1 = stopped (eased) */
  k = 0;
  private fightT = 0; private sinceDone = 0; private stanceLeftT = 0;
  private plate: THREE.Group; private face: THREE.MeshBasicMaterial; private sides: THREE.MeshLambertMaterial; private texKey = ''; private pw = 1; private ph = 1;
  constructor(private L: UiLayer) {
    this.face = new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false });
    this.sides = new THREE.MeshLambertMaterial({ color: 0x2a2d35, transparent: true });
    const s = this.sides, box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [s, s, s, s, this.face, s]);
    this.plate = new THREE.Group(); this.plate.add(box); this.plate.renderOrder = 20; this.plate.visible = false; L.scene.add(this.plate);
  }
  setEnabled(on: boolean) { this.enabled = on; preferences.set(PREF, on ? '1' : '0'); if (!on) this.stop(); }
  /** a new game: every lesson again */
  reset() { this.done.clear(); this.stop(); this.fightT = 0; this.sinceDone = 0; }
  /** debug: start one lesson now */
  force(id: LessonId) { this.done.delete(id); this.cur = id; }
  /** 破势 landed */
  parried() { this.done.add('parry'); this.done.add('stance'); if (this.cur === 'parry') this.finish(); }
  stop() { this.cur = null; this.k = 0; FX.hold = 1; audio.slowBand(0); this.plate.visible = false; }
  private finish() { if (this.cur) this.done.add(this.cur); this.cur = null; this.sinceDone = 0; }
  /** how far the screen greys (show.ts merges it into its own dimming) */
  get dim() { return this.k * 0.6; }
  get btn() { return this.cur ? BTN[this.cur] : null; }

  /** every fight frame, before the hero reads the input: pick a lesson, hold time, keep only its key */
  frame(rdt: number, c: TutCtx, busy: boolean) {
    const live = this.enabled && c.prologue > 0 && c.phase === 'fight' && c.hero.alive && !busy;
    if (!live) { if (this.cur || this.k > 0) this.stop(); this.fightT = 0; return; }
    this.fightT += rdt; this.sinceDone += rdt;
    const h = c.hero, inp = c.inp;
    if (!this.cur) this.pick(c, rdt);
    if (this.cur) {
      const id = this.cur, n = BTN[id], b = n ? inp.b[n] : null;
      const ok = id === 'move' ? Math.hypot(inp.move.x, inp.move.y) > 0.3
        : id === 'stance' ? h.st === 'charge' || (!!b && b.down && b.held >= TUNE.holdToCharge)
        : id === 'parry' ? !!b && (b.released || !b.down)
        : !!b && b.pressed;
      // the other keys do nothing while it waits (the one it asks for passes untouched: Input keeps counting how long it is held)
      for (const m of Object.keys(inp.b) as BtnName[]) if (m !== n) { const o = inp.b[m]; o.pressed = o.down = o.released = false; o.held = 0; }
      if (ok) this.finish();
    }
    // time: eases down to a stop on a lesson (≈0.25 s), back at once when it is answered
    const want = this.cur ? 1 : 0;
    const snap = this.cur === 'dash' || this.cur === 'parry';   // (a blow is on its way: stop at once, or it lands while time eases down)
    this.k += (want - this.k) * Math.min(1, rdt * (want ? (snap ? 40 : 9) : 16)); if (!want && this.k < 0.01) this.k = 0;
    FX.hold = this.k > 0 ? Math.max(0.0005, 1 - this.k) : 1;
    audio.slowBand(this.k);
  }
  private pick(c: TutCtx, rdt: number) {
    // (11-19 用户：「玩家几乎是连续几秒内被连续引导」: each lesson leaves her several seconds of free fighting before the next — the first
    //  wave is several of them at once, so the next one's moment always comes at once otherwise)
    const h = c.hero, d = this.done, gap = this.sinceDone > (d.has('move') && !d.has('attack') ? 2.5 : 6);
    if (c.prologue === 1) {
      if (!d.has('move') && this.fightT > 0.4) { this.cur = 'move'; return; }
      if (!d.has('attack') && d.has('move') && gap && c.foes.some(f => f.st !== 'dead' && f.st !== 'enter' && f.pos.distanceTo(h.pos) < 2.6)) { this.cur = 'attack'; return; }
      if (!d.has('dash') && d.has('attack') && gap && c.threats(0.5) > 0 && h.st !== 'dash') { this.cur = 'dash'; return; }
      if (!d.has('jump') && d.has('dash') && gap && !h.airborne && c.threats(1.2) === 0) { this.cur = 'jump'; return; }
      return;
    }
    if (c.prologue !== 2) return;
    const boss = c.foes.find(f => isBoss(f) && f.st !== 'dead'); if (!boss) return;
    // (the sentries fell before 闪身 / 跳起 came up: they come here first, with the same rest between)
    if (!d.has('dash') && d.has('attack') && gap && c.threats(0.5) > 0 && h.st !== 'dash') { this.cur = 'dash'; return; }
    if (!d.has('jump') && d.has('attack') && gap && !h.airborne && c.threats(1.2) === 0) { this.cur = 'jump'; return; }
    if (!d.has('stance')) {
      // (he is within reach, so a blow will come while she holds: then the release on it is the 破势)
      const near = boss.st === 'move' && boss.pos.distanceTo(h.pos) < 3.0, coming = c.threats(0.9) > 0;
      if (gap && h.st === 'free' && !h.airborne && (near || coming) && c.threats(0.45) === 0) { if (h.qi < 1) h.qi = Math.min(Hero.QI_MAX, 1); this.cur = 'stance'; }
      return;
    }
    if (d.has('parry')) return;
    if (h.st === 'charge') { this.stanceLeftT = 0; if (c.threats(TUNE.iaiWin * 0.8) > 0) this.cur = 'parry'; return; }
    // out of the stance with no 破势 (let go too soon, or it ran out of breath): ask for the stance again
    if ((this.stanceLeftT += rdt) > 1.2) { this.done.delete('stance'); this.stanceLeftT = 0; }
  }

  /** after the HUD's own button states are set: the asked-for button lit; the plate over her head */
  post(h: Hero, btns: Record<BtnName, { hot?: boolean }>, kick: (n: BtnName) => void) {
    const id = this.cur, n = id ? BTN[id] : null;
    // (11-19: the lit button goes dark again when the lesson ends — the dash / jump buttons kept glowing after theirs)
    for (const m of ['dash', 'jump', 'special'] as BtnName[]) btns[m].hot = false;
    if (n) { btns[n].hot = true; if (this.k < 0.25) kick(n); }
    const on = !!id && this.k > 0.05; this.plate.visible = on; if (!on || !id) return;
    this.paint(id);
    const p = worldToUi(h.pos.clone().setY(h.y + 2.15)), L = this.L, u = L.px(1);
    L.at(Math.round(p.x), Math.round(p.y - this.ph * 0.5), 0, this.plate.position);
    const s = 0.9 + 0.1 * Math.min(1, this.k * 1.4);
    this.plate.scale.set(this.pw * u * s, this.ph * u * s, Math.max(4, this.ph * 0.18) * u);
    const a = Math.min(1, this.k * 1.6); this.face.opacity = a; this.sides.opacity = a;
  }
  private paint(id: LessonId) {
    const dev = PAD.device, dpr = this.L.dpr || 1, k = Math.min(1.25, Math.max(0.62, this.L.h / 720));
    const s = Math.max(1, Math.round(Math.max(22, 26 * k) * dpr / PIX_H)), n = BTN[id];
    const key = `${id}|${dev}|${PAD.family}|${n ? BIND.key[n][0] + BIND.pad[n][0] : ''}|${s}|${language}`;
    if (key === this.texKey) return; this.texKey = key;
    const word = id === 'move' && dev === 'touch' ? '左下拖动' : WORD[id];
    // what the key looks like: a key cap with its name (keys), the pad's own button picture (pad), nothing on touch (the lit button is it)
    const cap = dev === 'key' ? (n ? keyName(BIND.key[n][0]) : 'WASD') : null;
    const glyph = dev === 'pad' && n ? BIND.pad[n][0] : null, stickWord = dev === 'pad' && !n ? '左摇杆' : null;
    const pad = 4 * s, gap = 4 * s, lh = (PIX_H + 2) * s, ww = pixW(word) * s;
    const capW = cap ? pixW(cap) * s + 6 * s : 0, gs = Math.max(1, Math.round(lh / GLYPH_H)), gw = glyph != null ? glyphArt(glyph).w * gs : 0;
    const sw = stickWord ? pixW(stickWord) * s : 0, lead = capW || gw || sw;
    const W = pad * 2 + (lead ? lead + gap : 0) + ww, H = pad * 2 + Math.max(lh, glyph != null ? GLYPH_H * gs : 0);
    const { c, g } = canvasOf(W, H);
    // the plate: dark iron, a lit top edge, a one-pixel rim (the HUD's iron)
    g.fillStyle = '#5a5058'; g.fillRect(s, 0, W - 2 * s, H); g.fillRect(0, s, W, H - 2 * s);
    g.fillStyle = '#1d1e24'; g.fillRect(2 * s, s, W - 4 * s, H - 2 * s); g.fillRect(s, 2 * s, W - 2 * s, H - 4 * s);
    g.fillStyle = '#34363f'; g.fillRect(2 * s, s, W - 4 * s, s);
    let x = pad; const cy = H / 2;
    if (cap) {
      const ch = lh + 2 * s; g.fillStyle = '#c9bfa8'; g.fillRect(x + s, cy - ch / 2, capW - 2 * s, ch); g.fillRect(x, cy - ch / 2 + s, capW, ch - 2 * s);
      g.fillStyle = '#efe6d0'; g.fillRect(x + s, cy - ch / 2 + s, capW - 2 * s, ch - 3 * s);
      drawPix(g, cap, x + capW / 2, cy - PIX_H * s / 2, { scale: s, color: '#1d1a1a', align: 'center' }); x += capW + gap;
    } else if (glyph != null) { paintGlyph(g, glyph, x, Math.round(cy - GLYPH_H * gs / 2), gs); x += gw + gap; }
    else if (stickWord) { drawPix(g, stickWord, x, cy - PIX_H * s / 2, { scale: s, color: '#d9ccb2', outline: '#0e0c0e' }); x += sw + gap; }
    drawPix(g, word, x, cy - PIX_H * s / 2, { scale: s, color: '#ffe6a8', outline: '#0e0c0e' });
    const old = this.face.map, t = new THREE.CanvasTexture(c as HTMLCanvasElement);
    t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
    this.face.map = t; this.face.needsUpdate = true; old?.dispose();
    this.pw = W / dpr; this.ph = H / dpr;
  }
}
