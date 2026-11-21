// 新手引导（主机级克制呈现 + 100% 保底触发）：
// - 序章两场真打中分 4 步自然引导：出刀 → 闪身 → 长按藏锋 → 松开破势；
// - 极简深铁铭牌（仅按键/手柄图徽 + 精炼动词），右下角目标按钮静谧白金环呼应（无手游箭头/步骤横幅/文字刷屏）；
// - 100% 保底触发（onGuarantee）：按下对应操作必定打出命中 / 完美闪身残影 / 藏锋蓄满 / 见切破势。
import * as THREE from 'three';
import type { UiLayer } from '../ui3d/layer';
import type { Input, BtnName } from './input';
import { BIND, PAD, keyName, glyphArt, paintGlyph, GLYPH_H, isTouchLayout } from './pad';
import { drawPix, pixW, PIX_H } from '../v2/pix';
import { canvasOf } from '../hud/paint';
import { FX } from '../engine/clock';
import { audio } from '../../audio/audio';
import { preferences } from '../../platform/preferences';
import { language, t as localize } from './i18n';
import { TUNE } from './tune';
import { Hero } from './hero';
import { isBoss, type Foe } from './enemy';

export type LessonId = 'move' | 'attack' | 'dash' | 'jump' | 'stance' | 'parry';
const BTN: Record<LessonId, BtnName | null> = { move: null, attack: 'attack', dash: 'dash', jump: 'jump', stance: 'attack', parry: 'attack' };
const COPY: Record<LessonId, { title: string; touch: string; hold?: 'hold' | 'release' }> = {
  move: { title: '移动', touch: '拖动摇杆' },
  attack: { title: '出刀', touch: '点攻击' },
  dash: { title: '闪身', touch: '点闪避' },
  jump: { title: '跃起', touch: '点跳跃' },
  stance: { title: '藏锋', touch: '长按攻击', hold: 'hold' },
  parry: { title: '破势', touch: '松开攻击', hold: 'release' },
};
const PREF = 'ub.tutorial';

export interface TutCtx {
  phase: string; prologue: number; hero: Hero; inp: Input; foes: Foe[];
  /** foes whose blow lands on her within `win` s */ threats: (win: number) => number;
  /** guarantee the taught mechanic lands cleanly when player performs the prompted input */
  onGuarantee?: (id: LessonId, target: Foe | null) => void;
}

export class Tutorial {
  /** 设置「操作提示」 */
  enabled = preferences.get(PREF) !== '0';
  private done = new Set<LessonId>();
  cur: LessonId | null = null;
  /** 0 = time runs, 1 = stopped (eased) */
  k = 0;
  private fightT = 0; private sinceDone = 0; private stanceLeftT = 0;
  private animT = 0;
  private doneBurst = { t: 0, btn: null as BtnName | null };
  private plate: THREE.Group; private face: THREE.MeshBasicMaterial; private sides: THREE.MeshLambertMaterial; private texKey = ''; private pw = 1; private ph = 1;
  // Restrained console-grade target button halo + single quiet confirm ring (no bouncing arrow or mobile popup)
  private ringMain: THREE.Mesh; private ringPulse: THREE.Mesh; private ringBurst: THREE.Mesh;
  constructor(private L: UiLayer) {
    this.face = new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false });
    this.sides = new THREE.MeshLambertMaterial({ color: 0x22252c, transparent: true });
    const s = this.sides, box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [s, s, s, s, this.face, s]);
    this.plate = new THREE.Group(); this.plate.add(box); this.plate.renderOrder = 32; this.plate.visible = false; L.scene.add(this.plate);
    const rMat = (col: number, add = false) => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, ...(add ? { blending: THREE.AdditiveBlending } : {}) });
    this.ringMain = new THREE.Mesh(new THREE.RingGeometry(0.46, 0.51, 8, 1, Math.PI / 8), rMat(0xf5e8c8, true));
    this.ringPulse = new THREE.Mesh(new THREE.RingGeometry(0.47, 0.50, 8, 1, Math.PI / 8), rMat(0xe6c884, true));
    this.ringBurst = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.50, 8, 1, Math.PI / 8), rMat(0xfff4d8, true));
    for (const [m, ro] of [[this.ringMain, 42], [this.ringPulse, 43], [this.ringBurst, 44]] as Array<[THREE.Mesh, number]>) {
      m.visible = false; m.renderOrder = ro; m.userData.noTilt = true; L.scene.add(m);
    }
  }
  setEnabled(on: boolean) { this.enabled = on; preferences.set(PREF, on ? '1' : '0'); if (!on) this.stop(); }
  /** a new game: every lesson again */
  reset() { this.done.clear(); this.stop(); this.fightT = 0; this.sinceDone = 0; this.doneBurst.t = 0; }
  /** debug: start one lesson now */
  force(id: LessonId) { this.done.delete(id); this.cur = id; this.sinceDone = 99; }
  /** 破势 landed */
  parried() { this.done.add('parry'); this.done.add('stance'); if (this.cur === 'parry') this.finish(); }
  stop() {
    this.cur = null; this.k = 0; FX.hold = 1; audio.slowBand(0);
    this.plate.visible = false; this.ringMain.visible = false; this.ringPulse.visible = false; this.ringBurst.visible = false;
    this.L.text.hide('act.tut.ok');
  }
  private finish() {
    if (this.cur) {
      const doneId = this.cur;
      this.done.add(doneId);
      this.doneBurst = { t: 0.42, btn: BTN[doneId] };
    }
    this.cur = null; this.sinceDone = 0;
  }
  /** how far the screen greys (show.ts merges it into its own dimming) */
  get dim() { return this.k * 0.46; }
  get btn() { return this.cur ? BTN[this.cur] : null; }

  /** every fight frame, before the hero reads the input: pick a lesson, hold time, keep only its key, guarantee payoff */
  frame(rdt: number, c: TutCtx, busy: boolean) {
    this.animT += rdt;
    if (this.doneBurst.t > 0) this.doneBurst.t = Math.max(0, this.doneBurst.t - rdt);
    const live = this.enabled && c.prologue > 0 && c.phase === 'fight' && c.hero.alive && !busy;
    if (!live) { if (this.cur || this.k > 0) this.stop(); this.fightT = 0; return; }
    this.fightT += rdt; this.sinceDone += rdt;
    const h = c.hero, inp = c.inp;
    // Keep stance alive cleanly while waiting for Cui Xuan to swing between stance -> parry
    if (c.prologue === 2 && this.done.has('stance') && !this.done.has('parry')) {
      if (h.qi < 1.5) h.qi = Math.min(Hero.QI_MAX, 1.5);
      if (h.st === 'charge') {
        h.tutHoldBreath();
        const boss = c.foes.find(f => isBoss(f) && f.st !== 'dead');
        if (boss && boss.st === 'move') boss.cd = Math.min(boss.cd, 0.18);
      }
    }
    if (!this.cur) this.pick(c, rdt);
    if (this.cur) {
      const id = this.cur, n = BTN[id], b = n ? inp.b[n] : null;
      if (id === 'dash') h.tutReadyDash();
      if (id === 'stance') { if (h.qi < 1.6) h.qi = Math.min(Hero.QI_MAX, 1.6); h.tutHoldBreath(); }
      if (id === 'parry') { if (h.qi < 1.6) h.qi = Math.min(Hero.QI_MAX, 1.6); h.tutFullCharge(); }
      const ok = id === 'move' ? Math.hypot(inp.move.x, inp.move.y) > 0.3
        : id === 'stance' ? h.st === 'charge' || (!!b && b.down && b.held >= TUNE.holdToCharge)
        : id === 'parry' ? !!b && (b.released || !b.down)
        : !!b && b.pressed;
      for (const m of Object.keys(inp.b) as BtnName[]) if (m !== n) { const o = inp.b[m]; o.pressed = o.down = o.released = false; o.held = 0; }
      for (const f of c.foes) if (f.st === 'windup' && f.dur > 0) f.t = Math.min(f.t, f.dur - 0.10);
      if (ok) {
        let target: Foe | null = null;
        if (id === 'attack') {
          let best = 99;
          for (const f of c.foes) if (f.st !== 'dead' && f.st !== 'enter') { const d = f.pos.distanceTo(h.pos); if (d < best) { best = d; target = f; } }
          if (target) { h.a.yaw = Math.atan2(target.pos.x - h.pos.x, target.pos.z - h.pos.z); }
        } else if (id === 'dash' || id === 'parry') {
          for (const f of c.foes) if (f.st === 'windup' && f.dur > 0) {
            if (!target || f.t / f.dur > target.t / Math.max(0.01, target.dur)) target = f;
            if (f.t >= f.dur - 0.15) f.t = f.dur - 0.02;
          }
          if (id === 'parry') h.tutFullCharge();
        }
        c.onGuarantee?.(id, target);
        this.finish();
      }
    }
    const want = this.cur ? 1 : 0;
    const snap = this.cur === 'dash' || this.cur === 'parry';
    this.k += (want - this.k) * Math.min(1, rdt * (want ? (snap ? 28 : 9) : 15)); if (!want && this.k < 0.01) this.k = 0;
    FX.hold = this.k > 0 ? 1 - 0.94 * this.k : 1;
    audio.slowBand(this.k);
  }
  private pick(c: TutCtx, rdt: number) {
    const h = c.hero, d = this.done, gap = this.sinceDone > 4.5;
    if (c.prologue === 1) {
      if (!d.has('attack') && this.fightT > 0.9 && c.foes.some(f => f.st !== 'dead' && f.st !== 'enter' && f.pos.distanceTo(h.pos) < 2.25)) { this.cur = 'attack'; return; }
      if (!d.has('dash') && d.has('attack') && gap && c.threats(0.55) > 0 && h.st !== 'dash') { this.cur = 'dash'; return; }
      return;
    }
    if (c.prologue !== 2) return;
    const boss = c.foes.find(f => isBoss(f) && f.st !== 'dead'); if (!boss) return;
    if (!d.has('dash') && gap && c.threats(0.55) > 0 && h.st !== 'dash') { this.cur = 'dash'; return; }
    if (!d.has('stance')) {
      const near = boss.st === 'move' && boss.pos.distanceTo(h.pos) < 3.6, coming = c.threats(1.0) > 0;
      if (gap && h.st === 'free' && !h.airborne && (near || coming) && c.threats(0.4) === 0) { if (h.qi < 1.6) h.qi = Math.min(Hero.QI_MAX, 1.6); this.cur = 'stance'; }
      return;
    }
    if (d.has('parry')) return;
    if (h.st === 'charge') {
      this.stanceLeftT = 0;
      if (c.threats(TUNE.iaiWin * 1.15) > 0 || (boss.st === 'windup' && boss.dur - boss.t < 0.35)) this.cur = 'parry';
      return;
    }
    if ((this.stanceLeftT += rdt) > 1.1) { this.done.delete('stance'); this.stanceLeftT = 0; }
  }

  /** after HUD layout: subtle white-gold target button halo + sleek minimal console prompt plate */
  post(h: Hero, btns: Record<BtnName, { hot?: boolean; x?: number; y?: number; size?: number }>, kick: (n: BtnName) => void) {
    const id = this.cur, n = id ? BTN[id] : null;
    for (const m of ['dash', 'jump', 'special'] as BtnName[]) btns[m].hot = false;
    if (n) { btns[n].hot = true; if (this.k < 0.25) kick(n); }
    const L = this.L, kHud = Math.min(1.25, Math.max(0.65, L.h / 720));
    this.L.text.hide('act.tut.ok');
    // Subtle single confirm ripple on the button when executed
    if (this.doneBurst.t > 0 && !id && this.doneBurst.btn) {
      const b = btns[this.doneBurst.btn], prog = 1 - this.doneBurst.t / 0.42;
      if (b && b.x != null && b.y != null && b.size) {
        this.ringBurst.visible = true; L.at(b.x, b.y, 7, this.ringBurst.position);
        this.ringBurst.scale.setScalar(L.px(b.size * (1.0 + 0.75 * prog), 7));
        (this.ringBurst.material as THREE.MeshBasicMaterial).opacity = (1 - prog) * 0.65;
      } else this.ringBurst.visible = false;
    } else this.ringBurst.visible = false;

    const on = !!id && this.k > 0.05;
    this.plate.visible = on;
    if (!on || !id) {
      this.ringMain.visible = false; this.ringPulse.visible = false;
      return;
    }
    const tb = n ? btns[n] : null;
    if (tb && tb.x != null && tb.y != null && tb.size) {
      const pulse = 0.5 + 0.5 * Math.sin(this.animT * 6.5);
      const wave = (this.animT * 0.95) % 1;
      const a = Math.min(1, this.k * 1.5);
      this.ringMain.visible = true; L.at(tb.x, tb.y, 7, this.ringMain.position);
      this.ringMain.scale.setScalar(L.px(tb.size * (1.05 + 0.05 * pulse), 7));
      (this.ringMain.material as THREE.MeshBasicMaterial).opacity = (0.48 + 0.24 * pulse) * a;
      this.ringPulse.visible = true; L.at(tb.x, tb.y, 7, this.ringPulse.position);
      this.ringPulse.scale.setScalar(L.px(tb.size * (1.58 - 0.58 * wave), 7));
      (this.ringPulse.material as THREE.MeshBasicMaterial).opacity = Math.sin(wave * Math.PI) * 0.52 * a;
    } else {
      this.ringMain.visible = false; this.ringPulse.visible = false;
    }
    // Understated lower-center console prompt plate: crisp keycap/glyph + concise action word only (lifted clear of console dock)
    this.paint(id);
    const u = L.px(1), py = isTouchLayout() ? Math.min(L.h - 76 * kHud, L.h * 0.81) : Math.min(L.h - 146 * kHud, L.h * 0.74);
    L.at(Math.round(L.w * 0.5), Math.round(py), 4, this.plate.position);
    const sc = 0.94 + 0.06 * Math.min(1, this.k * 1.4);
    this.plate.scale.set(this.pw * u * sc, this.ph * u * sc, Math.max(4, this.ph * 0.12) * u);
    const a = Math.min(1, this.k * 1.5); this.face.opacity = a; this.sides.opacity = a;
    void h;
  }
  private paint(id: LessonId) {
    const dev = PAD.device, dpr = this.L.dpr || 1, k = Math.min(1.25, Math.max(0.66, this.L.h / 720));
    const s = Math.max(1, Math.round(Math.max(19, 22 * k) * dpr / PIX_H)), n = BTN[id];
    const key = `${id}|${dev}|${PAD.family}|${n ? BIND.key[n][0] + BIND.pad[n][0] : ''}|${s}|${language}`;
    if (key === this.texKey) return; this.texKey = key;
    const info = COPY[id];
    const title = localize(info.title);
    const sSmall = Math.max(1, Math.round(s * 0.78));
    const cap = dev === 'key' ? (n ? keyName(BIND.key[n][0]) : 'WASD') : null;
    const holdPrefix = info.hold === 'hold' ? localize('长按') : info.hold === 'release' ? localize('松开') : '';
    const glyph = dev === 'pad' && n ? BIND.pad[n][0] : null;
    const touchPill = dev === 'touch' ? localize(info.touch) : null;

    const padX = 11 * s, padY = 6 * s, gap = 6 * s;
    const lh = (PIX_H + 2) * s, smH = (PIX_H + 2) * sSmall;
    const holdW = holdPrefix && (cap || glyph != null) ? pixW(holdPrefix) * sSmall + 4 * s : 0;
    const capW = cap ? pixW(cap) * s + 9 * s : 0;
    const gs = Math.max(1, Math.round(lh / GLYPH_H)), gw = glyph != null ? glyphArt(glyph).w * gs : 0;
    const touchW = touchPill ? pixW(touchPill) * sSmall + 8 * s : 0;
    const leadW = holdW + (capW || gw || touchW);
    const W = padX * 2 + (leadW ? leadW + gap : 0) + pixW(title) * s + 4 * s;
    const H = padY * 2 + lh + 2 * s;

    const { c, g } = canvasOf(W, H);
    // Clean, quiet Sekiro/Ghost-of-Tsushima obsidian iron plate with thin tarnished-silver border
    g.fillStyle = '#8b8374'; g.fillRect(s, 0, W - 2 * s, H); g.fillRect(0, s, W, H - 2 * s);
    g.fillStyle = '#14151b'; g.fillRect(2 * s, s, W - 4 * s, H - 2 * s); g.fillRect(s, 2 * s, W - 2 * s, H - 4 * s);
    g.fillStyle = '#242732'; g.fillRect(2 * s, s, W - 4 * s, s);

    let x = padX + 2 * s;
    const midY = H / 2;
    if (holdW && holdPrefix) {
      drawPix(g, holdPrefix, x, midY - (PIX_H * sSmall) / 2, { scale: sSmall, color: '#d8ceb8', outline: '#0b0a0c' });
      x += holdW;
    }
    if (cap) {
      const ch = lh + 2 * s;
      g.fillStyle = '#9a8e76'; g.fillRect(x + s, midY - ch / 2, capW - 2 * s, ch); g.fillRect(x, midY - ch / 2 + s, capW, ch - 2 * s);
      g.fillStyle = '#f2ead8'; g.fillRect(x + s, midY - ch / 2 + s, capW - 2 * s, ch - 3 * s);
      drawPix(g, cap, x + capW / 2, midY - (PIX_H * s) / 2, { scale: s, color: '#141210', align: 'center' });
      x += capW + gap;
    } else if (glyph != null) {
      paintGlyph(g, glyph, x, Math.round(midY - (GLYPH_H * gs) / 2), gs);
      x += gw + gap;
    } else if (touchPill) {
      const ch = smH + 3 * s;
      g.fillStyle = '#8f826a'; g.fillRect(x, midY - ch / 2, touchW, ch);
      g.fillStyle = '#25232a'; g.fillRect(x + s, midY - ch / 2 + s, touchW - 2 * s, ch - 2 * s);
      drawPix(g, touchPill, x + touchW / 2, midY - (PIX_H * sSmall) / 2, { scale: sSmall, color: '#f2ead8', align: 'center' });
      x += touchW + gap;
    }
    drawPix(g, title, x, midY - (PIX_H * s) / 2, { scale: s, color: '#f6eedc', outline: '#0b0a0c' });

    const old = this.face.map, t = new THREE.CanvasTexture(c as HTMLCanvasElement);
    t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
    this.face.map = t; this.face.needsUpdate = true; old?.dispose();
    this.pw = W / dpr; this.ph = H / dpr;
  }
}
