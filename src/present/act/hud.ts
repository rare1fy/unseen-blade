import { language, t as localize } from './i18n';
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
import { IronBtn, IronStick, IronHp, QteRing , type HintKey, HP_LAG, HP_LAG_HOLD, closeLag } from './ironUi';
import { textCells, pixTextW } from '../ui3d/pixfont';
import { PIX_H } from '../v2/pix';
import { bodyW } from '../ui3d/bodyFont';
import { ACTION_WORD, BIND, actKey, glyphTex, glyphArt, GLYPH_H } from './pad';
import type { MarkTarget } from './skillInfo';

type AnyBtn = SkinBtn | IronBtn; type AnyHp = SkinHp | IronHp;
/** 11-18 (用户：「选了强化后根本看不到自己选的强化是啥，在哪儿」): one mark per 刀谱 / 秘传 taken, on the button it changes — a 刀谱 a jade
 *  tablet, a 秘传 a stud of its tier's metal (iron / bronze / gold); a passive one sits by the health bar. A new mark lands with a ring
 *  of light round its button (once, soft — act-35 「闪光太严重了」) */
export interface Mark { id: string; target: MarkTarget; kind: 'manual' | 'boon'; tier: number; col: number }
const MARK_COL = { manual: 0x6ad8b0, boon: [0x8a929e, 0xd29a4a, 0xffd86a] };

interface Bar { g: THREE.Group; back: THREE.Mesh; lag: THREE.Mesh; fill: THREE.Mesh; shown: number; lagV: number; hold: number }
const box = (c: number, o = 1) => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: c, transparent: o < 1, opacity: o, depthWrite: false }));
/** act-19 (user: 「敌人的血条怎么也是3d的，都穿帮了，能看到垫后面的白色」): flat cards in one plane, stacked by draw order only */
const flat = (c: number) => new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: c, depthWrite: false, depthTest: false }));
/** the off-screen marker: three nested arcs (a sound wave) opening toward +x, red, pixel-drawn */
let ARC_TEX: THREE.Texture | null = null;
function arcTex() {
  if (ARC_TEX) return ARC_TEX;
  const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d')!;
  for (const [r, a] of [[5, 1], [9, 0.75], [13, 0.5]] as const) for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const dx = x + 0.5 - 8, dy = y + 0.5 - 16, d = Math.hypot(dx, dy), ang = Math.abs(Math.atan2(dy, dx));
    if (Math.abs(d - r) < 1.1 && ang < 0.75) { g.fillStyle = `rgba(255,86,58,${a})`; g.fillRect(x, y, 1, 1); } }
  const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; ARC_TEX = t; return t;
}

export class ActHud {
  flask!: AnyHp; sparks: UiSparks; stick!: SkinStick | IronStick; btns!: Record<BtnName, AnyBtn>; skin: SkinId = SKIN.id;
  /** 杀意 (0..3): shown as the ingots under the iron health bar */
  intent = 0; private qteRing: QteRing;
  private bars = new Map<number, Bar>(); private boss: Bar | null = null; private bossName = ''; private marks: THREE.Mesh[] = [];
  /** the hero's floor position (show sets it every frame; the off-screen markers read their distance from it) */
  heroAt = new THREE.Vector3();
  get bossOn() { return !!this.boss && this.on; }
  /** copper coins in the purse (act-17), shown under the health number */
  coins = 0; private coinIcon: THREE.Group | null = null; /** act-29: the shown count runs up to the real one; the coin hops on each step */ private coinShown = 0; private coinHop = 0;
  stickHome = { x: 150, y: 600 }; stickSize = 150; k = 1; on = true; private W = 1280; private H = 720;
  /** the pad buttons drawn after the words under the buttons (in the text layer: crisp, on top) */
  private glyphs: Partial<Record<BtnName, THREE.Mesh>> = {};
  private glyph(n: BtnName, i: number | null, left: number, y: number, h: number) {
    let m = this.glyphs[n];
    if (i == null) { if (m) m.visible = false; return; }
    const tex = glyphTex(i); if (!tex) return;
    if (!m) { m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false })); this.L.text.scene.add(m); this.glyphs[n] = m; }
    const mat = m.material as THREE.MeshBasicMaterial; if (mat.map !== tex) { mat.map = tex; mat.needsUpdate = true; }
    const dpr = this.L.dpr || 1, s = Math.max(1, Math.round(h / GLYPH_H * dpr)) / dpr, w = glyphArt(i).w * s, hh = GLYPH_H * s;
    m.scale.set(w, hh, 1); m.position.set(Math.round(left * dpr) / dpr + w / 2, -Math.round(y * dpr) / dpr, 0); m.visible = true;
  }
  constructor(private L: UiLayer) {
    this.sparks = new UiSparks(L.scene, 80); this.qteRing = new QteRing(L);
    this.build();
  }
  // ---------------------------------------------------------------- the marks of what this run has taken
  private marks2: Mark[] = []; private markMesh = new Map<string, THREE.Mesh>(); private ringFx: Array<{ m: THREE.Mesh; t: number; target: MarkTarget }> = [];
  /** the marks of this run (show.ts sets the whole list: a new run clears it) */
  setMarks(list: Mark[]) {
    const keep = new Set(list.map(m => m.id));
    for (const [id, m] of this.markMesh) if (!keep.has(id)) { m.parent?.remove(m); m.geometry.dispose(); (m.material as THREE.Material).dispose(); this.markMesh.delete(id); }
    this.marks2 = list.map(m => ({ ...m }));
    for (const m of this.marks2) {
      const col = m.kind === 'manual' ? MARK_COL.manual : MARK_COL.boon[m.tier] ?? MARK_COL.boon[0], old = this.markMesh.get(m.id);
      if (old) { (old.material as THREE.MeshLambertMaterial).color.setHex(col); continue; }
      // a jade tablet stands tall, a stud is square: you can count which is which
      const geo = m.kind === 'manual' ? new THREE.BoxGeometry(0.7, 1.15, 0.45) : new THREE.BoxGeometry(0.85, 0.85, 0.5);
      const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: 0.18 })); mesh.userData.noTilt = true; mesh.renderOrder = 6;
      this.L.scene.add(mesh); this.markMesh.set(m.id, mesh);
    }
  }
  /** a card has landed on its button: a ring of light round it, once */
  markLanded(target: MarkTarget, col: number) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.44, 0.5, 8, 1, Math.PI / 8), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
    m.userData.noTilt = true; m.renderOrder = 41; this.L.scene.add(m); this.ringFx.push({ m, t: 0, target });
    const b = target === 'hp' ? null : this.btns[target]; if (b instanceof IronBtn) b.kick(0.7, col);
  }
  /** where a target sits on the screen and how big (the card flies there) */
  targetAt(t: MarkTarget) { if (t === 'hp') { const p = this.flask.barAt(); return { x: p.x - 120 * this.k, y: p.y, size: 60 * this.k }; } const b = this.btns[t]; return { x: b.x, y: b.y, size: b.size }; }
  private markFrame(dt: number) {
    // the marks: in a short row on the button's outer side, under its rim (beside the lamps of 气 / the darts, not over them)
    const by = new Map<MarkTarget, Mark[]>(); for (const m of this.marks2) { const a = by.get(m.target) ?? []; a.push(m); by.set(m.target, a); }
    for (const [t, list] of by) {
      const at = this.targetAt(t), cell = Math.max(7, 9 * this.k);
      list.forEach((m, i) => {
        const mesh = this.markMesh.get(m.id); if (!mesh) return;
        let x: number, y: number;
        if (t === 'hp') { x = at.x + 40 * this.k + i * cell * 1.25; y = at.y + 26 * this.k; }
        else {
          // round the lower-left of the button, along its rim (clockwise from 7 o'clock), so they read as studs set into it
          const a = Math.PI * (0.68 + 0.11 * i), r = at.size * 0.56; x = at.x + Math.cos(a) * r; y = at.y + Math.sin(a) * r;
        }
        this.L.at(x, y, 4, mesh.position); mesh.scale.setScalar(this.L.px(cell)); mesh.visible = this.on;
        mesh.rotation.set(0.25, -0.3, 0);
      });
    }
    for (let i = this.ringFx.length - 1; i >= 0; i--) {
      const r = this.ringFx[i]; r.t += dt; const k = r.t / 0.55, at = this.targetAt(r.target);
      if (k >= 1) { r.m.parent?.remove(r.m); r.m.geometry.dispose(); (r.m.material as THREE.Material).dispose(); this.ringFx.splice(i, 1); continue; }
      this.L.at(at.x, at.y, 8, r.m.position); r.m.scale.setScalar(this.L.px(at.size * (1.05 + 0.45 * k))); (r.m.material as THREE.MeshBasicMaterial).opacity = 0.75 * (1 - k) * (1 - k); r.m.visible = this.on;
    }
  }
  /** (re)build the skinned pieces for SKIN.id, keeping the health state */
  private build() {
    const L = this.L, st = this.flask ? { ...this.flask.st } : null;
    this.flask?.dispose(); this.stick?.dispose(); if (this.btns) for (const b of Object.values(this.btns)) b.dispose();
    for (const b of this.bars.values()) b.g.parent?.remove(b.g); this.bars.clear(); if (this.boss) { this.boss.g.parent?.remove(this.boss.g); this.boss = null; }
    this.skin = SKIN.id;
    if (this.skin === 'iron') {
      this.flask = new IronHp(L, this.sparks); this.stick = new IronStick(L);
      this.btns = { attack: new IronBtn(L, 'attack', this.sparks), dash: new IronBtn(L, 'dash', this.sparks), special: new IronBtn(L, 'special', this.sparks), jump: new IronBtn(L, 'jump', this.sparks), ult: new IronBtn(L, 'ult', this.sparks) };
    } else {
      this.flask = new SkinHp(L, this.skin, this.sparks); this.stick = new SkinStick(L, this.skin);
      this.btns = { attack: new SkinBtn(L, 'attack', this.sparks, this.skin), dash: new SkinBtn(L, 'dash', this.sparks, this.skin), special: new SkinBtn(L, 'special', this.sparks, this.skin), jump: new SkinBtn(L, 'jump', this.sparks, this.skin), ult: new SkinBtn(L, 'ult', this.sparks, this.skin) };
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
    const b = this.btns; if (b.attack instanceof IronBtn) b.attack.badgeSide = 1; b.attack.size = 150 * k; b.dash.size = 100 * k; b.special.size = 100 * k; b.jump.size = 100 * k;
    b.attack.x = W - 150 * k; b.attack.y = H - 140 * k;
    b.dash.x = W - 300 * k; b.dash.y = H - 92 * k;
    b.jump.x = W - 292 * k; b.jump.y = H - 238 * k;
    b.special.x = W - 150 * k; b.special.y = H - 300 * k;
    // 11-18 (用户：「大招可以触发的时候应该在右手拇指区域一个额外的地方出现一个按钮」): 不见刀's own button, over the jump button on the
    // thumb's arc (clear of the dart button and its label); it shows only while the ring closes (the QTE)
    // (11-18 用户：「按钮离太远了，其他按钮已经给它让路了就可以再往右下移一些了」: into the room the four leave between the jump and the dart
    // buttons once they have gathered toward the corner — its label just clears the jump button's top)
    b.ult.size = 124 * k; b.ult.x = W - 225 * k; b.ult.y = H - 335 * k;
    // (the laid-out places: the 不见刀 button's coming in moves the others from here, see makeWay)
    for (const n of Object.keys(b) as BtnName[]) this.home[n] = { x: b[n].x, y: b[n].y, size: b[n].size };
  }
  private pausePid = -1;
  /** the portrait was let go over (show.ts opens the menu) */
  onPause: (() => void) | null = null;
  /** 11-18 (用户：「暂停按钮不要了，点头像暂停。」): the portrait medallion (and the purse hung under it) is the pause button now */
  private hitBadge(x: number, y: number) {
    const f = this.flask; if (f instanceof IronHp) return f.hitBadge(x, y);
    const b = f.barAt(), x0 = b.x - f.W * this.k / 2; return x > x0 - 10 && x < x0 + 70 * this.k && y > b.y - 30 * this.k && y < b.y + 60 * this.k;
  }
  private setBadgeDown(on: boolean) { if (this.flask instanceof IronHp) this.flask.down = on; }
  /** touch / mouse: the portrait, the buttons, else the bottom-left area is the stick. Returns true if used */
  pointer(type: string, id: number, x: number, y: number, inp: Input): boolean {
    if (!this.on) return false;
    // the portrait: pressed, it sinks; let go over it, the menu opens (a slip off it cancels). The press that lands on it is the
    // portrait's alone (never a stick or a button press too); a finger already on the stick or a button is not touched by it
    if (type === 'down' && this.pausePid < 0 && this.hitBadge(x, y)) { this.setBadgeDown(true); this.pausePid = id; return true; }
    if (this.pausePid === id && (type === 'up' || type === 'cancel')) { const fire = type === 'up' && this.hitBadge(x, y); this.setBadgeDown(false); this.pausePid = -1; if (fire) this.onPause?.(); return true; }
    if (this.pausePid === id && type === 'move') { this.setBadgeDown(this.hitBadge(x, y)); return true; }
    if (type === 'down') {
      for (const b of Object.values(this.btns)) if ((b !== this.btns.ult || this.ultUp) && b.hit(x, y)) { b.down = true; b.pid = id; inp.press(b.name, id); if (b.name === 'special') inp.aimBegin(id, b.x, b.y, x, y); return true; }   // act-14 用户：「按操作的按钮不要有音效」
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
    if (type === 'move') { if (inp.aimMove(id, x, y)) return true; inp.stickMove(id, x, y); return inp.stick.id === id; }
    if (type === 'up' || type === 'cancel') { for (const b of Object.values(this.btns)) if (b.pid === id) { b.down = false; b.pid = -1; } inp.releaseAll(id); return true; }
    return false;
  }
  /** the 绝·一刀 QTE: k 0 → 1 as the ring closes on the cut button; hit = inside the press window; null hides it */
  // 11-18: the ring closes on 不见刀's own button, which pops up for it (the cut button no longer lets it loose)
  qte(k: number | null, hit = false) {
    const b = this.btns.ult, up = k != null;
    if (up && !this.ultUp && b instanceof IronBtn) b.kick(1.4, 0xffd060);
    this.ultUp = up; if (b instanceof IronBtn) { b.qteOn = up; b.hot = up; }
    // (the moment to press: the button itself jumps and glows white-gold too)
    if (up && hit && !this.ultHit && b instanceof IronBtn) b.kick(1.2, 0xfff0c0);
    this.ultHit = up && hit;
    if (k == null) this.qteRing.hide(); else this.qteRing.show(b.x, b.y, b.size, k, hit, this.qteDt);
  }
  private ultHit = false; qteDt = 1 / 60;
  /** 不见刀's button is up (the QTE): drawn, labelled, and the only time it takes a touch */
  private ultUp = false;
  /** 11-18 (用户：「大招按钮出来的时候其他按钮要主动缩小一些然后动画上稍微往右下移一些来给大招按钮让路，这样表现上也更灵动一些」): while the
   *  不见刀 button is up the other four shrink a sixth and gather toward the screen's bottom-right corner, eased in and out over about
   *  a fifth of a second (real time: the world is in slow motion then); the 不见刀 button grows in from small as they make way */
  private home: Partial<Record<BtnName, { x: number; y: number; size: number }>> = {}; private wayK = 0;
  private makeWay(dt: number) {
    const to = this.ultUp ? 1 : 0; this.wayK += (to - this.wayK) * Math.min(1, dt * 16); if (Math.abs(to - this.wayK) < 1e-3) this.wayK = to;
    const e = this.wayK * this.wayK * (3 - 2 * this.wayK), W = this.W, H = this.H;
    for (const n of Object.keys(this.btns) as BtnName[]) {
      const h = this.home[n], b = this.btns[n]; if (!h) continue;
      if (n === 'ult') { b.size = h.size * (0.55 + 0.45 * e); continue; }
      const g = 1 - 0.14 * e; b.x = W + (h.x - W) * g; b.y = H + (h.y - H) * g; b.size = h.size * (1 - 0.16 * e);
    }
  }
  /** act-29: a game moment on a button (a cut lands, a perfect dodge) */
  btnKick(n: BtnName, k: number, col?: number) { const b = this.btns[n]; if (b instanceof IronBtn) b.kick(k, col); }
  /** act-29: the dart's aim on screen (x right, y up), or null */
  setAim(a: { x: number; y: number } | null) { const b = this.btns.special; if (b instanceof IronBtn) b.aim = a; }
  setCooldowns(c: Record<BtnName, number>) { for (const n of Object.keys(c) as BtnName[]) this.btns[n].cd = c[n]; }
  /** charges left on a button (the darts); only the iron buttons show them */
  /** the move links open now (act-18): a hint per button, or null */
  setHints(h: Partial<Record<BtnName, HintKey | null>>) { for (const n of Object.keys(this.btns) as BtnName[]) { const b = this.btns[n]; if (b instanceof IronBtn) { b.hint = h[n] ?? null; b.talk = h[n] === 'talk'; } } }
  setPips(n: BtnName, left: number, max: number) { const b = this.btns[n] as { pips?: number; pipMax?: number }; if ('pipMax' in b) { b.pips = left; b.pipMax = max; } }
  /** 11-17 气: the lamps over the cut button (a share fills the next lamp part-way); hold = a bar staked in the stance (its lamp blinks) */
  setQi(qi: number, max: number, hold: boolean) { const b = this.btns.attack as { pips?: number; pipMax?: number; pipHold?: boolean }; if ('pipMax' in b) { b.pips = qi; b.pipMax = max; b.pipHold = hold; } }
  /** 11-17: the stance refused for want of 气 — the cut button shakes, dull red */
  denyAttack() { (this.btns.attack as { deny?: () => void }).deny?.(); }
  private newBar(): Bar {
    // act-73 反馈 (用户：「我要的是所有血条都符合这个逻辑……垫在后面的我感觉白色效果会更好点」): the lost piece is white on every bar
    // (it was a muted copper, too close to the red to read)
    const p = PALETTE[this.skin], g = new THREE.Group(), back = flat(p.foeBack), lag = flat(HP_LAG), fill = flat(p.foeFill);
    back.renderOrder = 40; lag.renderOrder = 41; fill.renderOrder = 42;
    g.add(back, lag, fill); this.L.scene.add(g); return { g, back, lag, fill, shown: 1, lagV: 1, hold: 0 };
  }
  private drawBar(b: Bar, x: number, y: number, w: number, h: number, frac: number, dt: number) {
    // the lost piece holds still a moment after each drop (a flurry piles into one piece), then closes in — the same as her own bar
    if (frac < b.shown - 1e-6) b.hold = HP_LAG_HOLD; b.hold = Math.max(0, b.hold - dt);
    const L = this.L; b.shown = frac; b.lagV = closeLag(b.lagV, frac, b.hold, dt);
    L.at(x, y, 0, b.g.position); const u = L.px(1);
    b.back.scale.set((w + 4) * u, (h + 4) * u, 1); b.lag.scale.set(Math.max(1e-4, w * b.lagV) * u, h * u, 1); b.fill.scale.set(Math.max(1e-4, w * frac) * u, h * u, 1);
    b.lag.position.x = (-w / 2 + (w * b.lagV) / 2) * u; b.fill.position.x = (-w / 2 + (w * frac) / 2) * u;
  }
  update(dt: number, inp: Input, foes: Foe[]) {
    this.stick.root.visible = this.on; for (const b of Object.values(this.btns)) { const on = this.on && (b !== this.btns.ult || this.ultUp); b.root.visible = on; if (b instanceof IronBtn) b.iconG.visible = on; }
    this.flask.root.visible = this.on;
    this.makeWay(dt);
    if (this.on) { this.stick.update(inp.stick, this.stickHome, this.stickSize); for (const b of Object.values(this.btns)) b.update(dt); }
    this.markFrame(dt);
    // act-28 (user: 「技能下面我看还是没有写按键什么意思：闪避、跳跃、远程、攻击」): what each button does, in small pixel type just under
    // its rim (never on the button face); with a keyboard or a pad the key follows the word
    for (const n of Object.keys(this.btns) as BtnName[]) {
      // act-30 之后: the keys follow the binding table (rebindable in the pause menu); on a pad the button is drawn, in its maker's look
      // act-34 (用户：「下面的技能说明文字太小了，应该用像素带描边的文字」): the game's pixel font, outlined; whole device px per font pixel,
      // the glyphs about 16–18 px tall (the 16 px 长坂点宋 at 1:1 on a 720p desktop, 3 device px per font pixel on a 3x phone)
      const dpr = this.L.dpr || 1, pk = Math.max(1, Math.round(Math.max(16, 18 * this.k) * dpr / PIX_H)), lh = (PIX_H + 2) * pk / dpr;
      const b = this.btns[n], word = n === 'attack' && b instanceof IronBtn && b.talk ? '交谈' : ACTION_WORD[n], dev = inp.lastDevice, px = lh * 0.8, y = b.y + b.size * 0.5 + lh * 0.5 + 2 * this.k;
      const t = dev === 'key' ? `${localize(word)} ${localize(actKey(n))}` : word;
      let x = b.x;
      if (dev === 'pad' && this.on) { const gi = BIND.pad[n][0], gh = px * 1.3, gw = glyphArt(gi).w / GLYPH_H * gh, gap = px * 0.3, ww = pixTextW(word, pk, dpr); x = b.x - (gap + gw) / 2; this.glyph(n, gi, b.x - (ww + gap + gw) / 2 + ww + gap, y, gh); }
      else this.glyph(n, null, 0, 0, 0);
      const shown = this.on && (n !== 'ult' || this.ultUp);
      this.L.text.set('act.btn.' + n, { text: t, x, y, pix: pk, color: n === 'ult' ? '#ffe6a0' : '#f4ecd8', outline: '#140c0a', align: 'center', visible: shown });
    }
    if (this.flask instanceof IronHp) this.flask.intent = this.intent;
    this.flask.update(dt); this.sparks.update(dt);
    const st = this.flask.st, bar = this.flask.barAt();
    if (this.flask instanceof IronHp) this.L.text.hide('act.hp');   // act-34: the iron bar draws its own number, tilted with it
    else this.L.text.set('act.hp', { text: `${Math.max(0, Math.round(st.hp))} / ${st.maxHp}`, x: bar.x, y: bar.y, cell: Math.max(1, Math.round(bar.h * 0.62 / 5)), color: '#fff0d2', outline: '#21100e', align: 'center', visible: this.on });   // act-20: pixel digits again (user: 「金币数、血量、伤害漂字这些还是想像素」)
    // the purse: the count runs up to the real one, the coin hops on each step (act-29). 11-18 (用户：「把游戏中的货币放在头像下面，同样的
    // 透视关系」): the iron skin hangs it under the portrait, part of that piece (ironUi.ts IronHp); the other two skins keep a coin and
    // a count under their bar's left end
    { const want = this.coins, was = Math.floor(this.coinShown);
      if (want < this.coinShown) this.coinShown = want; else if (want > this.coinShown) this.coinShown = Math.min(want, this.coinShown + Math.max(12, (want - this.coinShown) * 6) * dt);
      if (Math.floor(this.coinShown) !== was) this.coinHop = 1; this.coinHop = Math.max(0, this.coinHop - dt * 6); }
    const shown = Math.floor(this.coinShown), hop = Math.sin(this.coinHop * Math.PI);
    if (this.flask instanceof IronHp) {
      this.flask.coins = shown; this.flask.coinHop = this.coinHop;
      if (this.coinIcon) this.coinIcon.visible = false; this.L.text.hide('act.coins');
    } else {
      if (!this.coinIcon) {
        const g = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color: 0xd09040 }), d = new THREE.MeshBasicMaterial({ color: 0x5a3a18 });
        const bar = (w: number, h: number, x: number, y: number, mat: THREE.Material) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.2), mat); b.position.set(x, y, 0); g.add(b); };
        bar(1, 0.36, 0, 0.32, m); bar(1, 0.36, 0, -0.32, m); bar(0.36, 0.3, -0.32, 0, m); bar(0.36, 0.3, 0.32, 0, m); bar(0.28, 0.28, 0, 0, d);
        this.L.scene.add(g); this.coinIcon = g;
      }
      const coinCell = 3, b = this.flask.barAt(), cx = b.x - this.flask.W * this.k / 2 + 10, cy = b.y + b.h / 2 + 18 * this.k;
      this.coinIcon.visible = this.on; this.L.at(cx, cy - hop * 4, 2, this.coinIcon.position); this.coinIcon.scale.setScalar(this.L.px(12) * (1 + 0.25 * hop)); this.coinIcon.rotation.y = hop * 0.8;
      this.L.text.set('act.coins', { text: `${shown}`, x: cx + 12, y: cy, cell: coinCell, color: this.coinHop > 0 ? '#fff0b0' : '#ffd27a', outline: '#21100e', align: 'left', visible: this.on });
    }
    // bars over the foes (the chief: the long bar at the top instead)
    const live = new Set<number>();
    for (const f of foes) {
      if (isBoss(f) || f.kind === 'dummy') continue;   // wp/foes: isBoss
      let b = this.bars.get(f.uid);
      // a fresh kill keeps its bar over the falling body until the white piece of the last blow has closed
      if (f.st === 'dead') { if (!b || b.lagV <= 0.002) continue; } else if (!b) { b = this.newBar(); this.bars.set(f.uid, b); }
      live.add(f.uid);
      const p = worldToUi(f.a.head().add(V3(0, 0.45, 0))); b.g.visible = this.on && p.z < 1;
      this.drawBar(b, p.x, p.y, 64 * this.k, 9 * this.k, f.st === 'dead' ? 0 : f.hp / f.maxHp, dt);
    }
    for (const [uid, b] of this.bars) if (!live.has(uid)) { b.g.parent?.remove(b.g); this.bars.delete(uid); }
    // act-19 (2x stage): a foe off the screen shows as a red sound-wave arc on the screen's edge, pointing at it, brighter when near
    let nm = 0; const W = this.L.w, H = this.L.h, pad = 30 * this.k;
    for (const f of foes) {
      if (f.st === 'dead' || f.kind === 'dummy' || nm >= 10) continue;
      const q = worldToUi(f.pos.clone().setY(1)); if (q.z < 1 && q.x > 0 && q.x < W && q.y > 0 && q.y < H) continue;
      let dx = q.x - W / 2, dy = q.y - H / 2; if (q.z >= 1) { dx = -dx; dy = -dy; }
      const s = Math.min((W / 2 - pad) / Math.max(1e-3, Math.abs(dx)), (H / 2 - pad) / Math.max(1e-3, Math.abs(dy))), x = W / 2 + dx * s, y = H / 2 + dy * s;
      let m = this.marks[nm]; if (!m) { m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: arcTex(), transparent: true, depthWrite: false, depthTest: false })); m.renderOrder = 43; this.L.scene.add(m); this.marks.push(m); }
      const dist = Math.hypot(f.pos.x - this.heroAt.x, f.pos.z - this.heroAt.z), near = Math.max(0, Math.min(1, 1 - (dist - 6) / 14));
      this.L.at(x, y, 0, m.position); m.scale.setScalar(this.L.px((26 + 10 * near) * this.k)); m.rotation.z = -Math.atan2(dy, dx);
      (m.material as THREE.MeshBasicMaterial).opacity = 0.45 + 0.5 * near * (0.8 + 0.2 * Math.sin(performance.now() / 160)); m.visible = this.on; nm++;
    }
    for (let i = nm; i < this.marks.length; i++) this.marks[i].visible = false;
    const chief = foes.find(f => isBoss(f) && f.st !== 'dead');   // wp/foes: isBoss
    if (chief) {
      if (!this.boss) this.boss = this.newBar();
      this.boss.g.visible = this.on; this.drawBar(this.boss, this.L.w / 2, 40 * this.k, Math.min(560, this.L.w * 0.44), 12 * this.k, chief.hp / chief.maxHp, dt);
      if (this.bossName !== chief.d.name) { this.bossName = chief.d.name; }
      this.L.text.set('act.boss', { text: chief.d.name, x: this.L.w / 2, y: 18 * this.k, ...(language === 'en' ? { bodyPx: Math.max(14, 18 * this.k) } : { cell: Math.max(1, Math.round(2 * this.k)) }), color: '#ffe6b0', align: 'center', visible: this.on });
    } else { if (this.boss) { this.boss.g.parent?.remove(this.boss.g); this.boss = null; } this.L.text.hide('act.boss'); }
  }
}
