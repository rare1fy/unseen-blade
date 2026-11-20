import { batchUi } from '../engine/rigidBatch';
import { language, msg, t as localize } from './i18n';
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
import { isBoss, POISE_BREAK_DUR, type Foe } from './enemy';   // wp/foes: isBoss (the boss bar for hj_boss too)
import { V3 } from '../engine/world';
import { TUNE } from './tune';
import { SKIN, PALETTE, SkinBtn, SkinStick, SkinHp, type SkinId } from './skin';
import { IronBtn, IronStick, IronHp, QteRing , type HintKey, HP_LAG, HP_LAG_HOLD, closeLag } from './ironUi';
import { textCells, pixTextW } from '../ui3d/pixfont';
import { PIX_H } from '../v2/pix';
import { bodyW } from '../ui3d/bodyFont';
import { ACTION_WORD, BIND, actKey, actPad, glyphTex, glyphArt, GLYPH_H } from './pad';
import type { MarkTarget } from './skillInfo';

type AnyBtn = SkinBtn | IronBtn; type AnyHp = SkinHp | IronHp;
/** 11-18 (用户：「选了强化后根本看不到自己选的强化是啥，在哪儿」): one mark per 刀谱 / 秘传 taken, on the button it changes — a 刀谱 a jade
 *  tablet, a 秘传 a stud of its tier's metal (iron / bronze / gold); a passive one sits by the health bar. A new mark lands with a ring
 *  of light round its button (once, soft — act-35 「闪光太严重了」) */
export interface Mark { id: string; target: MarkTarget; kind: 'manual' | 'boon'; tier: number; col: number }
const MARK_COL = { manual: 0x6ad8b0, boon: [0x8a929e, 0xd29a4a, 0xffd86a] };

interface Bar {
  g: THREE.Group; back: THREE.Mesh; lag: THREE.Mesh; fill: THREE.Mesh; shown: number; lagV: number; hold: number;
  /** act-113: crisp golden poise bar tucked directly under HP bar for armored/boss foes (d.poise > 0) */
  pBack: THREE.Mesh; pLag: THREE.Mesh; pFill: THREE.Mesh; pShown: number; pLagV: number; pHold: number;
}
const POISE_COL = 0xe8a832, POISE_BRK_A = 0xfff2b0, POISE_BRK_B = 0xffbc38;
const box = (c: number, o = 1) => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: c, transparent: o < 1, opacity: o, depthWrite: false }));
/** act-19 (user: 「敌人的血条怎么也是3d的，都穿帮了，能看到垫后面的白色」): flat cards in one plane, stacked by draw order only */
const flat = (c: number) => new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: c, depthWrite: false, depthTest: false }));
/** the off-screen marker: three nested arcs (a sound wave) opening toward +x, red, pixel-drawn */
let ARC_TEX: THREE.Texture | null = null;
let ARC_HOT_TEX: THREE.Texture | null = null;
function arcTex() {
  if (ARC_TEX) return ARC_TEX;
  const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d')!;
  for (const [r, a] of [[5, 1], [9, 0.75], [13, 0.5]] as const) for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const dx = x + 0.5 - 8, dy = y + 0.5 - 16, d = Math.hypot(dx, dy), ang = Math.abs(Math.atan2(dy, dx));
    if (Math.abs(d - r) < 1.1 && ang < 0.75) { g.fillStyle = `rgba(255,86,58,${a})`; g.fillRect(x, y, 1, 1); } }
  const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; ARC_TEX = t; return t;
}
/** act-113: high-danger off-screen sound wave (off-screen foe winding up / lunging): pixel-drawn bright white-gold + amber arcs + alert diamond */
function arcHotTex() {
  if (ARC_HOT_TEX) return ARC_HOT_TEX;
  const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d')!;
  const rings: Array<[number, string]> = [[5, 'rgba(255,252,224,1)'], [9, 'rgba(255,214,88,0.95)'], [13, 'rgba(255,134,42,0.85)']];
  for (const [r, col] of rings) for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const dx = x + 0.5 - 8, dy = y + 0.5 - 16, d = Math.hypot(dx, dy), ang = Math.abs(Math.atan2(dy, dx));
    if (Math.abs(d - r) < 1.25 && ang < 0.82) { g.fillStyle = col; g.fillRect(x, y, 1, 1); }
  }
  // crisp 3x3 pixel diamond focus at the wave's source
  g.fillStyle = '#ffffff';
  g.fillRect(4, 15, 3, 2); g.fillRect(5, 14, 1, 4);
  const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; ARC_HOT_TEX = t; return t;
}

export class ActHud {
  flask!: AnyHp; sparks: UiSparks; stick!: SkinStick | IronStick; btns!: Record<BtnName, AnyBtn>; skin: SkinId = SKIN.id;
  /** 杀意 (0..3): shown as the ingots under the iron health bar */
  intent = 0; private qteRing: QteRing;
  private bars = new Map<number, Bar>(); private boss: Bar | null = null; private bossName = ''; private marks: THREE.Mesh[] = [];
  /** act-114: off-screen foes currently in high-danger state (fires spatialized dangerOff once per windup) */
  private offDanger = new Set<number>();
  /** the hero's floor position (show sets it every frame; the off-screen markers read their distance from it) */
  heroAt = new THREE.Vector3();
  get bossOn() { return !!this.boss && this.on; }
  /** copper coins + meta currencies (iron / herb) shown together under the portrait */
  coins = 0; iron = 0; herb = 0; private coinIcon: THREE.Group | null = null; /** act-29: the shown count runs up to the real one; the coin hops on each step */ private coinShown = 0; private coinHop = 0;
  /** act-118: live combo variety readout & active archetype synergy pills */
  combo = { hits: 0, bonus: 0, frac: 0 };
  synergies: Array<{ name: string; count: number; col: string }> = [];
  stickHome = { x: 150, y: 600 }; stickSize = 150; k = 1; on = true; private W = 1280; private H = 720;
  /** 11-19 获得提示: the top-left of the reward column, under the portrait's purse */
  feedAt = { x: 18, y: 112 };
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
    { const fk = Math.max(0.62, 0.8 * k); this.feedAt = { x: Math.max(30, 40 * k) - 14 * fk, y: Math.max(34, 46 * k) + 78 * fk }; }
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
  private pausePid: number | null = null;
  /** the portrait was let go over (show.ts opens the menu) */
  onPause: (() => void) | null = null;
  /** 11-18 (用户：「暂停按钮不要了，点头像暂停。」): the portrait medallion (and the purse hung under it) is the pause button now */
  private hitBadge(x: number, y: number) {
    const f = this.flask; if (f instanceof IronHp) return f.hitBadge(x, y);
    const b = f.barAt(), x0 = b.x - f.W * this.k / 2; return x > x0 - 10 && x < x0 + 70 * this.k && y > b.y - 30 * this.k && y < b.y + 60 * this.k;
  }
  private setBadgeDown(on: boolean) { if (this.flask instanceof IronHp) this.flask.down = on; }
  /** a finger let go (whatever screen took the touch): its button, the stick, the portrait are freed */
  lift(id: number, inp: Input) {
    if (this.pausePid === id) { this.setBadgeDown(false); this.pausePid = null; }
    for (const b of Object.values(this.btns)) if (b.pid === id) { b.down = false; b.pid = null; }
    inp.releaseAll(id);
  }
  /** touch / mouse: the portrait, the buttons, else the bottom-left area is the stick. Returns true if used */
  pointer(type: string, id: number, x: number, y: number, inp: Input): boolean {
    if (!this.on) return false;
    // the portrait: pressed, it sinks; let go over it, the menu opens (a slip off it cancels). The press that lands on it is the
    // portrait's alone (never a stick or a button press too); a finger already on the stick or a button is not touched by it
    if (type === 'down' && this.pausePid === null && this.hitBadge(x, y)) { this.setBadgeDown(true); this.pausePid = id; return true; }
    if (this.pausePid === id && (type === 'up' || type === 'cancel')) { const fire = type === 'up' && this.hitBadge(x, y); this.setBadgeDown(false); this.pausePid = null; if (fire) this.onPause?.(); return true; }
    if (this.pausePid === id && type === 'move') { this.setBadgeDown(this.hitBadge(x, y)); return true; }
    if (type === 'down') {
      for (const b of Object.values(this.btns)) {
        if (b === this.btns.ult && !this.ultShown) continue;
        // act-115: 不见刀 button uses its full target hitbox from frame 0 so an instant thumb tap never misses while popping in
        const hit = b === this.btns.ult ? (Math.abs(x - b.x) < (this.home.ult?.size ?? b.size) * 0.65 && Math.abs(y - b.y) < (this.home.ult?.size ?? b.size) * 0.65) : b.hit(x, y);
        if (hit) { b.down = true; b.pid = id; inp.press(b.name, id); if (b.name === 'special') inp.aimBegin(id, b.x, b.y, x, y); return true; }
      }   // act-14 用户：「按操作的按钮不要有音效」
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
    if (type === 'up' || type === 'cancel') { for (const b of Object.values(this.btns)) if (b.pid === id) { b.down = false; b.pid = null; } inp.releaseAll(id); return true; }
    return false;
  }
  /** the 绝·一刀 QTE: k 0 → 1 as the ring closes on the cut button; hit = inside the press window; null hides it */
  // 11-18: the ring closes on 不见刀's own button, which pops up for it (the cut button no longer lets it loose)
  qte(k: number | null, hit = false) {
    const b = this.btns.ult, up = k != null;
    if (up && !this.ultUp && b instanceof IronBtn) b.kick(1.4, 0xffd060);
    this.ultUp = up;
    const shown = this.ultShown;
    if (b instanceof IronBtn) { b.qteOn = shown; b.hot = shown; }
    // (the moment to press: the button itself jumps and glows white-gold too)
    if (up && hit && !this.ultHit && b instanceof IronBtn) b.kick(1.2, 0xfff0c0);
    this.ultHit = up && hit;
    if (k == null) this.qteRing.hide(); else this.qteRing.show(b.x, b.y, b.size, k, hit, this.qteDt);
  }
  private ultHit = false; qteDt = 1 / 60;
  /** 不见刀's button is up during slowmo QTE or whenever 3 bars of 杀气 are full (act-125: full energy is always readable & usable) */
  private ultUp = false;
  ultReady = false;
  private ultReadyPrev = false;
  private get ultShown() { return this.ultUp || this.ultReady; }
  private lowEdges: THREE.Mesh[] = [];
  private lowT = 0;
  private home: Partial<Record<BtnName, { x: number; y: number; size: number }>> = {}; private wayK = 0;
  private makeWay(dt: number) {
    const to = this.ultShown ? 1 : 0; this.wayK += (to - this.wayK) * Math.min(1, dt * 16); if (Math.abs(to - this.wayK) < 1e-3) this.wayK = to;
    const e = this.wayK * this.wayK * (3 - 2 * this.wayK), W = this.W, H = this.H;
    for (const n of Object.keys(this.btns) as BtnName[]) {
      const h = this.home[n], b = this.btns[n]; if (!h) continue;
      if (n === 'ult') { b.size = h.size * (0.78 + 0.22 * e); continue; }
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
    const pBack = flat(p.foeBack), pLag = flat(HP_LAG), pFill = flat(POISE_COL);
    back.renderOrder = 40; lag.renderOrder = 41; fill.renderOrder = 42;
    pBack.renderOrder = 40; pLag.renderOrder = 41; pFill.renderOrder = 42;
    pBack.visible = pLag.visible = pFill.visible = false;
    g.add(back, lag, fill, pBack, pLag, pFill); this.L.scene.add(g); batchUi(g, true);
    return { g, back, lag, fill, shown: 1, lagV: 1, hold: 0, pBack, pLag, pFill, pShown: 1, pLagV: 1, pHold: 0 };
  }
  private drawBar(b: Bar, x: number, y: number, w: number, h: number, frac: number, dt: number, poise?: { frac: number; broken: boolean; h: number } | null) {
    // the lost piece holds still a moment after each drop (a flurry piles into one piece), then closes in — the same as her own bar
    if (frac < b.shown - 1e-6) b.hold = HP_LAG_HOLD; b.hold = Math.max(0, b.hold - dt);
    const L = this.L; b.shown = frac; b.lagV = closeLag(b.lagV, frac, b.hold, dt);
    L.at(x, y, 0, b.g.position); const u = L.px(1);
    b.back.scale.set((w + 4) * u, (h + 4) * u, 1); b.lag.scale.set(Math.max(1e-4, w * b.lagV) * u, h * u, 1); b.fill.scale.set(Math.max(1e-4, w * frac) * u, h * u, 1);
    b.lag.position.x = (-w / 2 + (w * b.lagV) / 2) * u; b.fill.position.x = (-w / 2 + (w * frac) / 2) * u;
    if (poise) {
      const pf = Math.max(0, Math.min(1, poise.frac));
      if (poise.broken) { b.pShown = pf; b.pLagV = pf; b.pHold = 0; }
      else {
        if (pf < b.pShown - 1e-6) b.pHold = HP_LAG_HOLD * 0.7;
        b.pHold = Math.max(0, b.pHold - dt); b.pShown = pf;
        b.pLagV = pf > b.pLagV ? pf : closeLag(b.pLagV, pf, b.pHold, dt);
      }
      const ph = poise.h, py = -(h / 2 + ph / 2 + 4) * u;
      b.pBack.visible = b.pLag.visible = b.pFill.visible = true;
      b.pBack.position.set(0, py, 0); b.pBack.scale.set((w + 4) * u, (ph + 2) * u, 1);
      b.pLag.position.set((-w / 2 + (w * b.pLagV) / 2) * u, py, 0); b.pLag.scale.set(Math.max(1e-4, w * b.pLagV) * u, ph * u, 1);
      b.pFill.position.set((-w / 2 + (w * pf) / 2) * u, py, 0); b.pFill.scale.set(Math.max(1e-4, w * pf) * u, ph * u, 1);
      const pm = b.pFill.material as THREE.MeshBasicMaterial;
      pm.color.setHex(poise.broken ? ((Math.floor(performance.now() / 85) & 1) ? POISE_BRK_A : POISE_BRK_B) : POISE_COL);
    } else {
      b.pBack.visible = b.pLag.visible = b.pFill.visible = false;
    }
  }
  update(dt: number, inp: Input, foes: Foe[]) {
    const ultVis = this.ultShown;
    if (this.ultReady && !this.ultReadyPrev && this.btns.ult instanceof IronBtn) this.btns.ult.kick(1.25, 0xffd870);
    this.ultReadyPrev = this.ultReady;
    if (this.btns.ult instanceof IronBtn) { this.btns.ult.qteOn = ultVis; this.btns.ult.hot = ultVis; }
    this.stick.root.visible = this.on; for (const b of Object.values(this.btns)) { const on = this.on && (b !== this.btns.ult || ultVis); b.root.visible = on; if (b instanceof IronBtn) b.iconG.visible = on; }
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
      const shown = this.on && (n !== 'ult' || ultVis);
      this.L.text.set('act.btn.' + n, { text: t, x, y, pix: pk, color: n === 'ult' ? '#ffe6a0' : '#f4ecd8', outline: '#140c0a', align: 'center', visible: shown });
    }
    // act-125: clear low-HP danger warning (pulsing crimson rim strips + 危 badge) & full-intent ult readiness badge
    this.lowT += dt;
    const hpSt = this.flask.st, lowHp = this.on && hpSt.hp > 0 && hpSt.hp / Math.max(1, hpSt.maxHp) <= 0.3;
    if (!this.lowEdges.length) {
      for (let i = 0; i < 4; i++) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xcc1810, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
        m.renderOrder = 35; m.userData.noTilt = true; m.visible = false; this.L.scene.add(m); this.lowEdges.push(m);
      }
    }
    if (lowHp) {
      const beat = Math.pow(0.5 + 0.5 * Math.sin(this.lowT * 7.2), 2), op = 0.12 + 0.24 * beat, th = Math.max(8, 13 * this.k);
      const specs: Array<[number, number, number, number]> = [
        [this.W / 2, th / 2, this.W, th], [this.W / 2, this.H - th / 2, this.W, th],
        [th / 2, this.H / 2, th, this.H], [this.W - th / 2, this.H / 2, th, this.H],
      ];
      specs.forEach(([ex, ey, ew, eh], i) => {
        const m = this.lowEdges[i]; m.visible = true; this.L.at(ex, ey, 4, m.position);
        m.scale.set(this.L.px(ew, 4), this.L.px(eh, 4), 1); (m.material as THREE.MeshBasicMaterial).opacity = op;
      });
      const bAt = this.flask.barAt(), dprL = this.L.dpr || 1, pkW = Math.max(1, Math.round(Math.max(16, 18 * this.k) * dprL / PIX_H));
      this.L.text.set('act.lowhp', { text: '残血！', x: bAt.x + 115 * this.k, y: bAt.y, pix: pkW, color: beat > 0.45 ? '#ff5848' : '#ffd0c0', outline: '#140c0a', align: 'left', visible: true });
    } else {
      for (const m of this.lowEdges) m.visible = false;
      this.L.text.hide('act.lowhp');
    }
    if (this.on && this.ultReady && !this.ultUp) {
      const bAt = this.flask.barAt(), dprU = this.L.dpr || 1, pkU = Math.max(1, Math.round(Math.max(14, 15 * this.k) * dprU / PIX_H));
      const dev = inp.lastDevice, uTxt = dev === 'key' ? msg`不见刀就绪 · ${localize(actKey('ult'))}` : dev === 'pad' ? msg`不见刀就绪 · ${localize(actPad('ult'))}` : '不见刀就绪！';
      const pulseU = 0.5 + 0.5 * Math.sin(this.lowT * 9);
      this.L.text.set('act.ultReady', { text: uTxt, x: bAt.x + 112 * this.k, y: bAt.y + 22 * this.k, pix: pkU, color: pulseU > 0.5 ? '#fff8cc' : '#ffd268', outline: '#140c0a', align: 'left', visible: true });
    } else {
      this.L.text.hide('act.ultReady');
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
      this.flask.coins = shown; this.flask.iron = this.iron; this.flask.herb = this.herb; this.flask.coinHop = this.coinHop;
      if (this.coinIcon) this.coinIcon.visible = false; this.L.text.hide('act.coins');
    } else {
      if (!this.coinIcon) {
        const g = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color: 0xd09040 }), d = new THREE.MeshBasicMaterial({ color: 0x5a3a18 });
        const bar = (w: number, h: number, x: number, y: number, mat: THREE.Material) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.2), mat); b.position.set(x, y, 0); g.add(b); };
        bar(1, 0.36, 0, 0.32, m); bar(1, 0.36, 0, -0.32, m); bar(0.36, 0.3, -0.32, 0, m); bar(0.36, 0.3, 0.32, 0, m); bar(0.28, 0.28, 0, 0, d);
        this.L.scene.add(g); batchUi(g); this.coinIcon = g;
      }
      const coinCell = 3, b = this.flask.barAt(), cx = b.x - this.flask.W * this.k / 2 + 10, cy = b.y + b.h / 2 + 18 * this.k;
      this.coinIcon.visible = this.on; this.L.at(cx, cy - hop * 4, 2, this.coinIcon.position); this.coinIcon.scale.setScalar(this.L.px(12) * (1 + 0.25 * hop)); this.coinIcon.rotation.y = hop * 0.8;
      this.L.text.set('act.coins', { text: `${shown}  ${this.iron}  ${this.herb}`, x: cx + 12, y: cy, cell: coinCell, color: this.coinHop > 0 ? '#fff0b0' : '#ffd27a', outline: '#21100e', align: 'left', visible: this.on });
    }
    // act-118: live combo variety readout (right edge, shown only during active combos) & active synergy badges (under portrait)
    const dprH = this.L.dpr || 1, pkC = Math.max(1, Math.round(Math.max(18, 22 * this.k) * dprH / PIX_H));
    const showCombo = this.on && this.combo.hits >= 2 && this.combo.frac > 0.01;
    if (showCombo) {
      const col = this.combo.bonus >= 45 ? '#ffe066' : this.combo.bonus >= 30 ? '#ffab5a' : this.combo.bonus >= 15 ? '#7ef0c4' : '#f4ecd8';
      const rx = this.L.w - 24 * this.k, ry = this.L.h * 0.30;
      this.L.text.set('act.combo', { text: `${this.combo.hits} ${localize('连击')}`, x: rx, y: ry, pix: pkC, color: col, outline: '#140c0a', align: 'right', visible: true });
      if (this.combo.bonus > 0) this.L.text.set('act.comboSub', { text: `${localize('变招')} +${this.combo.bonus}%`, x: rx, y: ry + 26 * this.k, pix: Math.max(1, Math.round(pkC * 0.72)), color: col, outline: '#140c0a', align: 'right', visible: true });
      else this.L.text.hide('act.comboSub');
    } else {
      this.L.text.hide('act.combo'); this.L.text.hide('act.comboSub');
    }
    if (this.on && this.synergies.length) {
      const synTxt = this.synergies.map(s => `${localize(s.name)}(${s.count})`).join(' · ');
      this.L.text.set('act.syn', { text: synTxt, x: 18 * this.k, y: 112 * this.k, pix: Math.max(1, Math.round(14 * this.k * dprH / PIX_H)), color: this.synergies[0].col, outline: '#140c0a', align: 'left', visible: true });
      this.feedAt.y = 136 * this.k;
    } else {
      this.L.text.hide('act.syn');
      this.feedAt.y = 112 * this.k;
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
      const poise = f.st !== 'dead' && f.d.poise > 0 ? { frac: f.brokenT > 0 ? f.brokenT / POISE_BREAK_DUR : f.poise / f.d.poise, broken: f.brokenT > 0, h: Math.max(3, 4 * this.k) } : null;
      this.drawBar(b, p.x, p.y, 64 * this.k, 9 * this.k, f.st === 'dead' ? 0 : f.hp / f.maxHp, dt, poise);
    }
    for (const [uid, b] of this.bars) if (!live.has(uid)) { b.g.parent?.remove(b.g); this.bars.delete(uid); }
    // act-19 / act-113 / act-114: off-screen foes show a red sound wave on the edge; foes winding up / lunging upgrade to an urgent gold-white high-danger wave + spatialized audio glint
    let nm = 0; const W = this.L.w, H = this.L.h, pad = 30 * this.k, nowMs = performance.now();
    const hotNow = new Set<number>();
    for (const f of foes) {
      if (f.st === 'dead' || f.kind === 'dummy' || nm >= 10) continue;
      const q = worldToUi(f.pos.clone().setY(1)); if (q.z < 1 && q.x > 0 && q.x < W && q.y > 0 && q.y < H) continue;
      let dx = q.x - W / 2, dy = q.y - H / 2; if (q.z >= 1) { dx = -dx; dy = -dy; }
      const s = Math.min((W / 2 - pad) / Math.max(1e-3, Math.abs(dx)), (H / 2 - pad) / Math.max(1e-3, Math.abs(dy))), x = W / 2 + dx * s, y = H / 2 + dy * s;
      let m = this.marks[nm]; if (!m) { m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: arcTex(), transparent: true, depthWrite: false, depthTest: false })); m.renderOrder = 43; this.L.scene.add(m); this.marks.push(m); }
      const dist = Math.hypot(f.pos.x - this.heroAt.x, f.pos.z - this.heroAt.z), near = Math.max(0, Math.min(1, 1 - (dist - 6) / 14));
      const danger = f.st === 'windup' || (f.st === 'strike' && !!f.lunge);
      const imminent = f.st === 'windup' && (f.dur - f.t) < 0.38;
      if (danger && this.on) {
        hotNow.add(f.uid);
        if (!this.offDanger.has(f.uid)) {
          const pan = Math.max(-0.8, Math.min(0.8, (x - W / 2) / Math.max(1, W / 2)));
          cue('dangerOff', 0.55 + 0.45 * near, pan);
        }
      }
      const mat = m.material as THREE.MeshBasicMaterial;
      const wantTex = danger ? arcHotTex() : arcTex();
      if (mat.map !== wantTex) { mat.map = wantTex; mat.needsUpdate = true; }
      this.L.at(x, y, 0, m.position);
      const sz = danger ? (34 + 10 * near + (imminent ? 5 : 0)) : (26 + 10 * near);
      m.scale.setScalar(this.L.px(sz * this.k)); m.rotation.z = -Math.atan2(dy, dx);
      mat.opacity = danger ? (0.72 + 0.28 * Math.sin(nowMs / (imminent ? 38 : 65))) : (0.45 + 0.5 * near * (0.8 + 0.2 * Math.sin(nowMs / 160)));
      m.visible = this.on; nm++;
    }
    this.offDanger = hotNow;
    for (let i = nm; i < this.marks.length; i++) this.marks[i].visible = false;
    const chief = foes.find(f => isBoss(f) && f.st !== 'dead');   // wp/foes: isBoss
    if (chief) {
      if (!this.boss) this.boss = this.newBar();
      const bPoise = chief.d.poise > 0 ? { frac: chief.brokenT > 0 ? chief.brokenT / POISE_BREAK_DUR : chief.poise / chief.d.poise, broken: chief.brokenT > 0, h: Math.max(4, 6 * this.k) } : null;
      this.boss.g.visible = this.on; this.drawBar(this.boss, this.L.w / 2, 40 * this.k, Math.min(560, this.L.w * 0.44), 12 * this.k, chief.hp / chief.maxHp, dt, bPoise);
      if (this.bossName !== chief.d.name) { this.bossName = chief.d.name; }
      this.L.text.set('act.boss', { text: chief.d.name, x: this.L.w / 2, y: 18 * this.k, ...(language === 'en' ? { bodyPx: Math.max(14, 18 * this.k) } : { cell: Math.max(1, Math.round(2 * this.k)) }), color: '#ffe6b0', align: 'center', visible: this.on });
    } else { if (this.boss) { this.boss.g.parent?.remove(this.boss.g); this.boss = null; } this.L.text.hide('act.boss'); }
  }
}
