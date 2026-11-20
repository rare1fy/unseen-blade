// 新手引导（11-19 & act-125 全面升级）：
// - 序章两场真打中分 4 步递进教学：出刀 (1/4) → 闪身 (2/4) → 长按藏锋 (3/4) → 松开破势 (4/4)；
// - 目标按钮级强焦聚：在右下角目标按钮本体直接渲染呼吸金白主环 + 收缩引导波纹 + 跳动立体箭头，三端（键鼠/手柄/触屏）一眼看清按哪里；
// - 精锻金边说明铭牌（屏幕中下部，不遮主角与敌人预警）：步骤标 + 大键帽/手柄图徽/触控按钮名 + 动作名 + 达成效果说明；
// - 100% 保底触发（onGuarantee）：按下对应操作必定打出命中/完美闪避残影/藏锋蓄满/见切破势，并弹出金色达成印章与光环！
import * as THREE from 'three';
import type { UiLayer } from '../ui3d/layer';
import type { Input, BtnName } from './input';
import { BIND, PAD, keyName, glyphArt, paintGlyph, GLYPH_H } from './pad';
import { drawPix, pixW, PIX_H } from '../v2/pix';
import { canvasOf } from '../hud/paint';
import { FX } from '../engine/clock';
import { audio } from '../../audio/audio';
import { cue } from '../../audio/cues';
import { preferences } from '../../platform/preferences';
import { language, t as localize } from './i18n';
import { TUNE } from './tune';
import { Hero } from './hero';
import { isBoss, type Foe } from './enemy';

export type LessonId = 'move' | 'attack' | 'dash' | 'jump' | 'stance' | 'parry';
const BTN: Record<LessonId, BtnName | null> = { move: null, attack: 'attack', dash: 'dash', jump: 'jump', stance: 'attack', parry: 'attack' };
const STEP_IDX: Partial<Record<LessonId, number>> = { attack: 1, dash: 2, stance: 3, parry: 4 };
const COPY: Record<LessonId, { title: string; sub: string; touch: string; done: string; hold?: 'hold' | 'release' }> = {
  move: { title: '移动走位', sub: '贴近敌人再挥刀', touch: '左下拖动', done: '步法已成！' },
  attack: { title: '轻按出刀', sub: '挥刀斩退逼近之敌', touch: '点右下「攻击」', done: '出刀已成！' },
  dash: { title: '刀锋将至 · 闪身', sub: '瞬间无敌并留灰白残影', touch: '点右下「闪避」', done: '完美闪身！' },
  jump: { title: '纵身跳起', sub: '跃过低位横扫', touch: '点右下「跳跃」', done: '跃起已成！' },
  stance: { title: '长按蓄力 · 藏锋', sub: '架刀蓄势，静候强敌劈落', touch: '长按右下「攻击」', done: '藏锋架定！', hold: 'hold' },
  parry: { title: '松开破势 · 见切！', sub: '震退强敌并破其架势', touch: '松开「攻击」', done: '破势已成！', hold: 'release' },
};
const PREF = 'ub.tutorial';

export interface TutCtx {
  phase: string; prologue: number; hero: Hero; inp: Input; foes: Foe[];
  /** foes whose blow lands on her within `win` s */ threats: (win: number) => number;
  /** act-125: guarantee the taught mechanic lands visibly when player performs the prompted input */
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
  private doneBanner = { text: '', t: 0, btn: null as BtnName | null };
  private plate: THREE.Group; private face: THREE.MeshBasicMaterial; private sides: THREE.MeshLambertMaterial; private texKey = ''; private pw = 1; private ph = 1;
  // Target HUD button spotlight meshes (UiLayer): main breathing ring, contracting beat ring, 3D stepped arrow, completion burst ring
  private ringMain: THREE.Mesh; private ringPulse: THREE.Mesh; private ringBurst: THREE.Mesh; private arrow: THREE.Group;
  constructor(private L: UiLayer) {
    this.face = new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false });
    this.sides = new THREE.MeshLambertMaterial({ color: 0x2a2d35, transparent: true });
    const s = this.sides, box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [s, s, s, s, this.face, s]);
    this.plate = new THREE.Group(); this.plate.add(box); this.plate.renderOrder = 32; this.plate.visible = false; L.scene.add(this.plate);
    const rMat = (col: number, add = false) => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, ...(add ? { blending: THREE.AdditiveBlending } : {}) });
    this.ringMain = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.52, 8, 1, Math.PI / 8), rMat(0xfff4c0, true));
    this.ringPulse = new THREE.Mesh(new THREE.RingGeometry(0.46, 0.50, 8, 1, Math.PI / 8), rMat(0xffd268, true));
    this.ringBurst = new THREE.Mesh(new THREE.RingGeometry(0.44, 0.51, 8, 1, Math.PI / 8), rMat(0xfff8dc, true));
    for (const [m, ro] of [[this.ringMain, 42], [this.ringPulse, 43], [this.ringBurst, 44]] as Array<[THREE.Mesh, number]>) {
      m.visible = false; m.renderOrder = ro; m.userData.noTilt = true; L.scene.add(m);
    }
    // 3D voxel downward pointer arrow floating directly above the target HUD button
    this.arrow = new THREE.Group();
    const am = new THREE.MeshBasicMaterial({ color: 0xffe48a, transparent: true, opacity: 0.95, depthWrite: false });
    const amRim = new THREE.MeshBasicMaterial({ color: 0xfff8dc, transparent: true, opacity: 0.95, depthWrite: false });
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 0.08), am); stem.position.set(0, 0.20, 0);
    const bar1 = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.10, 0.08), amRim); bar1.position.set(0, 0.05, 0);
    const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.10, 0.08), am); bar2.position.set(0, -0.05, 0);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.10, 0.08), amRim); tip.position.set(0, -0.15, 0);
    this.arrow.add(stem, bar1, bar2, tip);
    this.arrow.traverse(o => { o.renderOrder = 45; });
    this.arrow.userData.noTilt = true; this.arrow.visible = false; L.scene.add(this.arrow);
  }
  setEnabled(on: boolean) { this.enabled = on; preferences.set(PREF, on ? '1' : '0'); if (!on) this.stop(); }
  /** a new game: every lesson again */
  reset() { this.done.clear(); this.stop(); this.fightT = 0; this.sinceDone = 0; this.doneBanner.t = 0; }
  /** debug: start one lesson now */
  force(id: LessonId) { this.done.delete(id); this.cur = id; this.sinceDone = 99; }
  /** 破势 landed */
  parried() { this.done.add('parry'); this.done.add('stance'); if (this.cur === 'parry') this.finish(); }
  stop() {
    this.cur = null; this.k = 0; FX.hold = 1; audio.slowBand(0);
    this.plate.visible = false; this.ringMain.visible = false; this.ringPulse.visible = false; this.ringBurst.visible = false; this.arrow.visible = false;
    this.L.text.hide('act.tut.ok');
  }
  private finish() {
    if (this.cur) {
      const doneId = this.cur;
      this.done.add(doneId);
      this.doneBanner = { text: COPY[doneId].done, t: 1.05, btn: BTN[doneId] };
      cue('relic', 0.72);
    }
    this.cur = null; this.sinceDone = 0;
  }
  /** how far the screen greys (show.ts merges it into its own dimming) */
  get dim() { return this.k * 0.52; }
  get btn() { return this.cur ? BTN[this.cur] : null; }

  /** every fight frame, before the hero reads the input: pick a lesson, hold time, keep only its key, guarantee payoff */
  frame(rdt: number, c: TutCtx, busy: boolean) {
    this.animT += rdt;
    if (this.doneBanner.t > 0) this.doneBanner.t = Math.max(0, this.doneBanner.t - rdt);
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
      // Guarantee readiness while waiting so the player's press can NEVER be rejected or whiffed!
      if (id === 'dash') h.tutReadyDash();
      if (id === 'stance') { if (h.qi < 1.6) h.qi = Math.min(Hero.QI_MAX, 1.6); h.tutHoldBreath(); }
      if (id === 'parry') { if (h.qi < 1.6) h.qi = Math.min(Hero.QI_MAX, 1.6); h.tutFullCharge(); }
      const ok = id === 'move' ? Math.hypot(inp.move.x, inp.move.y) > 0.3
        : id === 'stance' ? h.st === 'charge' || (!!b && b.down && b.held >= TUNE.holdToCharge)
        : id === 'parry' ? !!b && (b.released || !b.down)
        : !!b && b.pressed;
      // Other buttons wait while the tutorial highlights the target action
      for (const m of Object.keys(inp.b) as BtnName[]) if (m !== n) { const o = inp.b[m]; o.pressed = o.down = o.released = false; o.held = 0; }
      // Bullet time holds incoming blows just shy of landing while waiting
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
      // Wait until a sentry is comfortably inside blade reach (2.25m) so the first cut ALWAYS lands!
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
    // out of stance without landing parry: prompt stance again cleanly
    if ((this.stanceLeftT += rdt) > 1.1) { this.done.delete('stance'); this.stanceLeftT = 0; }
  }

  /** after HUD layout: highlight target button with pulsing rings + arrow, position instruction plaque & completion stamp */
  post(h: Hero, btns: Record<BtnName, { hot?: boolean; x?: number; y?: number; size?: number }>, kick: (n: BtnName) => void) {
    const id = this.cur, n = id ? BTN[id] : null;
    for (const m of ['dash', 'jump', 'special'] as BtnName[]) btns[m].hot = false;
    if (n) { btns[n].hot = true; if (this.k < 0.25) kick(n); }
    const L = this.L, kHud = Math.min(1.25, Math.max(0.65, L.h / 720));
    // Completion confirmation stamp & expanding button burst
    if (this.doneBanner.t > 0 && !id) {
      const bt = this.doneBanner.t / 1.05, dpr = L.dpr || 1, pk = Math.max(1, Math.round(Math.max(22, 26 * kHud) * dpr / PIX_H));
      L.text.set('act.tut.ok', { text: localize(this.doneBanner.text), x: L.w * 0.5, y: L.h * 0.34 - (1 - bt) * 18 * kHud, pix: pk, color: '#fff4b8', outline: '#140c0a', align: 'center', visible: true });
      const b = this.doneBanner.btn ? btns[this.doneBanner.btn] : null;
      if (b && b.x != null && b.y != null && b.size && bt > 0.55) {
        const prog = 1 - (bt - 0.55) / 0.45;
        this.ringBurst.visible = true; L.at(b.x, b.y, 7, this.ringBurst.position);
        this.ringBurst.scale.setScalar(L.px(b.size * (1.0 + 1.15 * prog), 7));
        (this.ringBurst.material as THREE.MeshBasicMaterial).opacity = (1 - prog) * 0.9;
      } else this.ringBurst.visible = false;
    } else {
      L.text.hide('act.tut.ok'); this.ringBurst.visible = false;
    }
    const on = !!id && this.k > 0.05;
    this.plate.visible = on;
    if (!on || !id) {
      this.ringMain.visible = false; this.ringPulse.visible = false; this.arrow.visible = false;
      return;
    }
    // Target button spotlight: main breathing halo + contracting beat ring + bouncing 3D pointer arrow
    const tb = n ? btns[n] : null;
    if (tb && tb.x != null && tb.y != null && tb.size) {
      const pulse = 0.5 + 0.5 * Math.sin(this.animT * 10);
      const wave = (this.animT * 1.25) % 1; // 0 → 1 contracting toward button
      const a = Math.min(1, this.k * 1.6);
      this.ringMain.visible = true; L.at(tb.x, tb.y, 7, this.ringMain.position);
      this.ringMain.scale.setScalar(L.px(tb.size * (1.06 + 0.08 * pulse), 7));
      (this.ringMain.material as THREE.MeshBasicMaterial).opacity = (0.72 + 0.25 * pulse) * a;
      this.ringPulse.visible = true; L.at(tb.x, tb.y, 7, this.ringPulse.position);
      this.ringPulse.scale.setScalar(L.px(tb.size * (1.85 - 0.85 * wave), 7));
      (this.ringPulse.material as THREE.MeshBasicMaterial).opacity = Math.sin(wave * Math.PI) * 0.85 * a;
      const bob = Math.sin(this.animT * 8.5) * 8 * kHud;
      this.arrow.visible = true; L.at(tb.x, tb.y - tb.size * 0.72 - 14 * kHud + bob, 8, this.arrow.position);
      this.arrow.scale.setScalar(L.px(Math.max(40, tb.size * 0.44), 8));
    } else {
      this.ringMain.visible = false; this.ringPulse.visible = false; this.arrow.visible = false;
    }
    // Crisp lower-center console instruction plaque (never blocks hero or incoming red telegraphs)
    this.paint(id);
    const u = L.px(1), py = Math.min(L.h - 92 * kHud, L.h * 0.78);
    L.at(Math.round(L.w * 0.5), Math.round(py), 4, this.plate.position);
    const sc = 0.92 + 0.08 * Math.min(1, this.k * 1.4);
    this.plate.scale.set(this.pw * u * sc, this.ph * u * sc, Math.max(5, this.ph * 0.14) * u);
    const a = Math.min(1, this.k * 1.6); this.face.opacity = a; this.sides.opacity = a;
    void h;
  }
  private paint(id: LessonId) {
    const dev = PAD.device, dpr = this.L.dpr || 1, k = Math.min(1.25, Math.max(0.66, this.L.h / 720));
    const s = Math.max(1, Math.round(Math.max(20, 24 * k) * dpr / PIX_H)), n = BTN[id];
    const key = `${id}|${dev}|${PAD.family}|${n ? BIND.key[n][0] + BIND.pad[n][0] : ''}|${s}|${language}`;
    if (key === this.texKey) return; this.texKey = key;
    const info = COPY[id], step = STEP_IDX[id];
    const title = localize(info.title), sub = localize(info.sub);
    const stepTag = step ? `${localize('修习')} ${step}/4` : '';
    const sSub = Math.max(1, Math.round(s * 0.72));
    const cap = dev === 'key' ? (n ? keyName(BIND.key[n][0]) : 'WASD') : null;
    const holdPrefix = info.hold === 'hold' ? localize('长按') : info.hold === 'release' ? localize('松开') : '';
    const glyph = dev === 'pad' && n ? BIND.pad[n][0] : null;
    const touchPill = dev === 'touch' ? localize(info.touch) : null;

    const padX = 10 * s, padY = 6 * s, gap = 6 * s, rowGap = 4 * s;
    const lh = (PIX_H + 2) * s, subH = (PIX_H + 2) * sSub;
    const tagW = stepTag ? pixW(stepTag) * sSub + 6 * s : 0;
    const holdW = holdPrefix && (cap || glyph != null) ? pixW(holdPrefix) * sSub + 3 * s : 0;
    const capW = cap ? pixW(cap) * s + 8 * s : 0;
    const gs = Math.max(1, Math.round(lh / GLYPH_H)), gw = glyph != null ? glyphArt(glyph).w * gs : 0;
    const touchW = touchPill ? pixW(touchPill) * sSub + 8 * s : 0;
    const leadW = (holdW ? holdW : 0) + (capW || gw || touchW);
    const row1W = (tagW ? tagW + gap : 0) + (leadW ? leadW + gap : 0) + pixW(title) * s;
    const row2W = pixW(sub) * sSub;
    const W = Math.max(row1W, row2W) + padX * 2 + 6 * s;
    const H = padY * 2 + lh + rowGap + subH;

    const { c, g } = canvasOf(W, H);
    // Forged dark-iron plaque with crisp gold trim + left gold accent bar
    g.fillStyle = '#d8aa54'; g.fillRect(s, 0, W - 2 * s, H); g.fillRect(0, s, W, H - 2 * s);
    g.fillStyle = '#181920'; g.fillRect(2 * s, s, W - 4 * s, H - 2 * s); g.fillRect(s, 2 * s, W - 2 * s, H - 4 * s);
    g.fillStyle = '#2d303c'; g.fillRect(2 * s, s, W - 4 * s, s);
    g.fillStyle = '#ffd268'; g.fillRect(2 * s, 2 * s, 3 * s, H - 4 * s); // left gold bar

    let x = padX + 4 * s;
    const r1Y = padY + lh / 2;
    if (stepTag) {
      const th = subH + 2 * s;
      g.fillStyle = '#3e2d1a'; g.fillRect(x, r1Y - th / 2, tagW, th);
      drawPix(g, stepTag, x + tagW / 2, r1Y - (PIX_H * sSub) / 2, { scale: sSub, color: '#ffd878', align: 'center' });
      x += tagW + gap;
    }
    if (holdW && holdPrefix) {
      drawPix(g, holdPrefix, x, r1Y - (PIX_H * sSub) / 2, { scale: sSub, color: '#fff2cc', outline: '#0e0c0e' });
      x += holdW;
    }
    if (cap) {
      const ch = lh + 2 * s;
      g.fillStyle = '#c89b44'; g.fillRect(x + s, r1Y - ch / 2, capW - 2 * s, ch); g.fillRect(x, r1Y - ch / 2 + s, capW, ch - 2 * s);
      g.fillStyle = '#fff3d4'; g.fillRect(x + s, r1Y - ch / 2 + s, capW - 2 * s, ch - 3 * s);
      drawPix(g, cap, x + capW / 2, r1Y - (PIX_H * s) / 2, { scale: s, color: '#1a1410', align: 'center' });
      x += capW + gap;
    } else if (glyph != null) {
      paintGlyph(g, glyph, x, Math.round(r1Y - (GLYPH_H * gs) / 2), gs);
      x += gw + gap;
    } else if (touchPill) {
      const ch = subH + 3 * s;
      g.fillStyle = '#c89b44'; g.fillRect(x, r1Y - ch / 2, touchW, ch);
      g.fillStyle = '#3c2a14'; g.fillRect(x + s, r1Y - ch / 2 + s, touchW - 2 * s, ch - 2 * s);
      drawPix(g, touchPill, x + touchW / 2, r1Y - (PIX_H * sSub) / 2, { scale: sSub, color: '#fff4c8', align: 'center' });
      x += touchW + gap;
    }
    drawPix(g, title, x, r1Y - (PIX_H * s) / 2, { scale: s, color: '#fff4c8', outline: '#0e0c0e' });
    // Second row: clear action payoff subtitle
    drawPix(g, sub, W / 2 + 2 * s, padY + lh + rowGap + (subH - PIX_H * sSub) / 2, { scale: sSub, color: '#dcd2be', outline: '#0e0c0e', align: 'center' });

    const old = this.face.map, t = new THREE.CanvasTexture(c as HTMLCanvasElement);
    t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
    this.face.map = t; this.face.needsUpdate = true; old?.dispose();
    this.pw = W / dpr; this.ph = H / dpr;
  }
}
