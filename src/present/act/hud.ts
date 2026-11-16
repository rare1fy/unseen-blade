// 动作原型的 3D 界面（UI 层里的实物，CLAUDE.md：UI 一律 3D 实物，不加暗色遮罩）。外观按题材风格（skin.ts：漆器 / 竹简 / 铁器）换：
//   左下：摇杆——只在左下一块区域按下才出（默认按哪儿出在哪儿，之后底座不动；面板里可改成固定在左下）；
//   右下：四颗技能钮（斩 / 冲 / 跳 / 影），刻着字；冷却时钮面被一层暗色盖住、从上往下退，转好时亮一下；蓄力时从下往上灌金；
//         完美闪避后的「反击」等着时，斩钮一直亮；
//   左上：血量（漆匣朱条 / 一排竹简 / 一排札甲片）+ 数字；
//   敌人头上：小血条；头目：屏幕上方一条长血条 + 名字。
import * as THREE from 'three';
import type { UiLayer } from '../ui3d/layer';
import { worldToUi } from '../ui3d/layer';
import { setGrid } from '../ui3d/pixelGrid';
import { UiSparks } from '../ui3d/vox';
import { cue } from '../../audio/cues';
import type { Input, BtnName } from './input';
import { isBoss, type Foe } from './enemy';   // wp/foes: isBoss (the boss bar for hj_boss too)
import { V3 } from '../engine/world';
import { TUNE } from './tune';
import { SKIN, PALETTE, SkinBtn, SkinStick, SkinHp, type SkinId } from './skin';
import { IronBtn, IronStick, IronHp, QteRing } from './ironUi';

type AnyBtn = SkinBtn | IronBtn; type AnyHp = SkinHp | IronHp;

interface Bar { g: THREE.Group; back: THREE.Mesh; lag: THREE.Mesh; fill: THREE.Mesh; shown: number; lagV: number }
const box = (c: number, o = 1) => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: c, transparent: o < 1, opacity: o, depthWrite: false }));

export class ActHud {
  flask!: AnyHp; sparks: UiSparks; stick!: SkinStick | IronStick; btns!: Record<BtnName, AnyBtn>; skin: SkinId = SKIN.id;
  /** 杀意 (0..3): shown as the ingots under the iron health bar */
  intent = 0; private qteRing: QteRing;
  private bars = new Map<number, Bar>(); private boss: Bar | null = null; private bossName = '';
  stickHome = { x: 150, y: 600 }; stickSize = 150; k = 1; on = true; private W = 1280; private H = 720;
  constructor(private L: UiLayer) {
    this.sparks = new UiSparks(L.scene, 80); this.qteRing = new QteRing(L);
    this.build();
  }
  /** (re)build the skinned pieces for SKIN.id, keeping the health state */
  private build() {
    const L = this.L, st = this.flask ? { ...this.flask.st } : null;
    this.flask?.dispose(); this.stick?.dispose(); if (this.btns) for (const b of Object.values(this.btns)) b.dispose();
    for (const b of this.bars.values()) b.g.parent?.remove(b.g); this.bars.clear(); if (this.boss) { this.boss.g.parent?.remove(this.boss.g); this.boss = null; }
    this.skin = SKIN.id;
    if (this.skin === 'iron') {
      this.flask = new IronHp(L, this.sparks); this.stick = new IronStick(L);
      this.btns = { attack: new IronBtn(L, 'attack', this.sparks), dash: new IronBtn(L, 'dash', this.sparks), special: new IronBtn(L, 'special', this.sparks), jump: new IronBtn(L, 'jump', this.sparks) };
    } else {
      this.flask = new SkinHp(L, this.skin, this.sparks); this.stick = new SkinStick(L, this.skin);
      this.btns = { attack: new SkinBtn(L, 'attack', this.sparks, this.skin), dash: new SkinBtn(L, 'dash', this.sparks, this.skin), special: new SkinBtn(L, 'special', this.sparks, this.skin), jump: new SkinBtn(L, 'jump', this.sparks, this.skin) };
    }
    if (st) this.flask.set(st);
    this.layout(this.W, this.H);
  }
  /** switch to the skin the skin module now holds */
  reskin() { if (SKIN.id !== this.skin) this.build(); }
  layout(W: number, H: number) {
    this.W = W; this.H = H;
    setGrid(H, this.L.dpr || 1);
    const k = Math.min(1.25, Math.max(0.62, H / 720)); this.k = k;
    this.flask.place(Math.max(30, 40 * k), Math.max(34, 46 * k), Math.max(0.62, 0.8 * k));
    this.stickHome = { x: 160 * k, y: H - 140 * k }; this.stickSize = 170 * k;
    // an arc of three round the big cut button: dash low left, jump up left, the special above
    const b = this.btns; b.attack.size = 150 * k; b.dash.size = 100 * k; b.special.size = 100 * k; b.jump.size = 100 * k;
    b.attack.x = W - 150 * k; b.attack.y = H - 140 * k;
    b.dash.x = W - 300 * k; b.dash.y = H - 92 * k;
    b.jump.x = W - 292 * k; b.jump.y = H - 238 * k;
    b.special.x = W - 150 * k; b.special.y = H - 300 * k;
  }
  /** touch / mouse: buttons first, else the bottom-left area is the stick. Returns true if used */
  pointer(type: string, id: number, x: number, y: number, inp: Input): boolean {
    if (!this.on) return false;
    if (type === 'down') {
      for (const b of Object.values(this.btns)) if (b.hit(x, y)) { b.down = true; b.pid = id; inp.press(b.name, id); return true; }   // act-14 用户：「按操作的按钮不要有音效」
      // the stick: only the bottom-left area answers; floating = the base appears under the thumb (kept clear of the screen's edges)
      // and then stays put; fixed = the base sits at its home and only a press near it counts
      inp.stick.r = this.stickSize * 0.42;
      if (TUNE.stickFixed >= 0.5) {
        if (Math.hypot(x - this.stickHome.x, y - this.stickHome.y) < this.stickSize * 0.95) { inp.stickDown(id, this.stickHome.x, this.stickHome.y); inp.stickMove(id, x, y); return true; }
      } else if (x < this.L.w * 0.42 && y > this.L.h * 0.38) {
        const m = this.stickSize * 0.55, bx = Math.max(m, Math.min(this.L.w * 0.42, x)), by = Math.max(this.L.h * 0.38, Math.min(this.L.h - m, y));
        inp.stickDown(id, bx, by); inp.stickMove(id, x, y); return true;
      }
      return false;
    }
    if (type === 'move') { inp.stickMove(id, x, y); return inp.stick.id === id; }
    if (type === 'up' || type === 'cancel') { for (const b of Object.values(this.btns)) if (b.pid === id) { b.down = false; b.pid = -1; } inp.releaseAll(id); return true; }
    return false;
  }
  /** the 绝·一刀 QTE: k 0 → 1 as the ring closes on the cut button; hit = inside the press window; null hides it */
  qte(k: number | null, hit = false) { const b = this.btns.attack; if (k == null) this.qteRing.hide(); else this.qteRing.show(b.x, b.y, b.size, k, hit); }
  setCooldowns(c: Record<BtnName, number>) { for (const n of Object.keys(c) as BtnName[]) this.btns[n].cd = c[n]; }
  /** charges left on a button (the darts); only the iron buttons show them */
  setPips(n: BtnName, left: number, max: number) { const b = this.btns[n] as { pips?: number; pipMax?: number }; if ('pipMax' in b) { b.pips = left; b.pipMax = max; } }
  private newBar(): Bar {
    const p = PALETTE[this.skin], g = new THREE.Group(), back = box(p.foeBack), lag = box(p.foeLag), fill = box(p.foeFill);
    back.position.z = 0; lag.position.z = 0.5; fill.position.z = 1; back.renderOrder = 4; lag.renderOrder = 5; fill.renderOrder = 6;
    g.add(back, lag, fill); this.L.scene.add(g); return { g, back, lag, fill, shown: 1, lagV: 1 };
  }
  private drawBar(b: Bar, x: number, y: number, w: number, h: number, frac: number, dt: number) {
    const L = this.L; b.shown = frac; b.lagV = Math.max(frac, b.lagV - dt * 0.6);
    L.at(x, y, 0, b.g.position); const u = L.px(1);
    b.back.scale.set((w + 4) * u, (h + 4) * u, u); b.lag.scale.set(w * b.lagV * u, h * u, u); b.fill.scale.set(w * frac * u, h * u, u);
    b.lag.position.x = (-w / 2 + (w * b.lagV) / 2) * u; b.fill.position.x = (-w / 2 + (w * frac) / 2) * u;
  }
  update(dt: number, inp: Input, foes: Foe[]) {
    this.stick.root.visible = this.on; for (const b of Object.values(this.btns)) { b.root.visible = this.on; if (b instanceof IronBtn) b.iconG.visible = this.on; }
    this.flask.root.visible = this.on;
    if (this.on) { this.stick.update(inp.stick, this.stickHome, this.stickSize); for (const b of Object.values(this.btns)) b.update(dt); }
    if (this.flask instanceof IronHp) this.flask.intent = this.intent;
    this.flask.update(dt); this.sparks.update(dt);
    const st = this.flask.st, ta = this.flask.textAt();
    this.L.text.set('act.hp', { text: `${Math.max(0, Math.round(st.hp))} / ${st.maxHp}`, x: ta.x, y: ta.y, cell: 2, color: '#ffe8c8', align: 'left', visible: this.on });
    // bars over the foes (the chief: the long bar at the top instead)
    const live = new Set<number>();
    for (const f of foes) {
      if (f.st === 'dead' || isBoss(f) || f.kind === 'dummy') continue;   // wp/foes: isBoss live.add(f.uid);
      let b = this.bars.get(f.uid); if (!b) { b = this.newBar(); this.bars.set(f.uid, b); }
      const p = worldToUi(f.a.head().add(V3(0, 0.45, 0))); b.g.visible = this.on && p.z < 1;
      this.drawBar(b, p.x, p.y, 64 * this.k, 9 * this.k, f.hp / f.maxHp, dt);
    }
    for (const [uid, b] of this.bars) if (!live.has(uid)) { b.g.parent?.remove(b.g); this.bars.delete(uid); }
    const chief = foes.find(f => isBoss(f) && f.st !== 'dead');   // wp/foes: isBoss
    if (chief) {
      if (!this.boss) this.boss = this.newBar();
      this.boss.g.visible = this.on; this.drawBar(this.boss, this.L.w / 2, 40 * this.k, Math.min(560, this.L.w * 0.44), 12 * this.k, chief.hp / chief.maxHp, dt);
      if (this.bossName !== chief.d.name) { this.bossName = chief.d.name; }
      this.L.text.set('act.boss', { text: chief.d.name, x: this.L.w / 2, y: 18 * this.k, cell: Math.max(1, Math.round(2 * this.k)), color: '#ffe6b0', align: 'center', visible: this.on });
    } else { if (this.boss) { this.boss.g.parent?.remove(this.boss.g); this.boss = null; } this.L.text.hide('act.boss'); }
  }
}
