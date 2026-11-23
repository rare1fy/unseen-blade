import { batchUi } from '../engine/rigidBatch';
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
import { isBoss, POISE_BREAK_DUR, poiseCap, type Foe } from './enemy';   // wp/foes: isBoss (the boss bar for hj_boss too)
import { V3 } from '../engine/world';
import { TUNE } from './tune';
import { SKIN, PALETTE, SkinBtn, SkinStick, SkinHp, type SkinId } from './skin';
import { IronBtn, IronStick, IronHp, QteRing , type HintKey, HP_LAG, HP_LAG_HOLD, closeLag } from './ironUi';
import { textCells, pixTextW } from '../ui3d/pixfont';
import { PIX_H } from '../v2/pix';
import { ACTION_WORD, BIND, PAD, actKey, glyphTex, glyphArt, GLYPH_H, keyCapTex, isTouchLayout } from './pad';
import type { MarkTarget } from './skillInfo';
import { uiScale } from './uiScale';
import { UiPlatePool } from './uiPlate';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type AnyBtn = SkinBtn | IronBtn; type AnyHp = SkinHp | IronHp;
/** 11-18 (用户：「选了强化后根本看不到自己选的强化是啥，在哪儿」): one mark per 刀谱 / 秘传 taken, on the button it changes — a 刀谱 a jade
 *  tablet, a 秘传 a stud of its tier's metal (iron / bronze / gold); a passive one sits by the health bar. A new mark lands with a ring
 *  of light round its button (once, soft — act-35 「闪光太严重了」) */
export interface Mark { id: string; target: MarkTarget; kind: 'manual' | 'boon'; tier: number; col: number }

interface Bar {
  g: THREE.Group; back: THREE.Mesh; lag: THREE.Mesh; fill: THREE.Mesh; shown: number; lagV: number; hold: number;
  /** act-135: distinct forged-gold elite overhead HP bar ornaments (outer gold bezel, top sheen, left diamond emblem, right stud) */
  elite: boolean; rim?: THREE.Mesh; sheen?: THREE.Mesh; gemBg?: THREE.Mesh; gem?: THREE.Mesh; stud?: THREE.Mesh;
  /** crisp white enemy poise bar tucked directly under HP bar for armored/boss foes (d.poise > 0) */
  pBack: THREE.Mesh; pLag: THREE.Mesh; pFill: THREE.Mesh; pShown: number; pLagV: number; pHold: number;
}
const POISE_COL = 0xf2f6fc, POISE_BRK_A = 0xffffff, POISE_BRK_B = 0xffe088;
const ELITE_RIM = 0xe8b642, ELITE_BACK = 0x161114, ELITE_FILL = 0xea5624, ELITE_SHEEN = 0xffc864, ELITE_GEM = 0xffe27a;
const box = (c: number, o = 1) => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: c, transparent: o < 1, opacity: o, depthWrite: false }));
/** act-19 (user: 「敌人的血条怎么也是3d的，都穿帮了，能看到垫后面的白色」): flat cards in one plane, stacked by draw order only */
const flat = (c: number) => new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: c, depthWrite: false, depthTest: false }));
/** Crisp pixel-art directional triangle arrow pointing toward +x (rotated inward toward the player on screen edges). */
let ARC_TEX: THREE.Texture | null = null;
let ARC_HOT_TEX: THREE.Texture | null = null;
function paintTriArrow(hot: boolean) {
  const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  // Crisp symmetric pixel triangle (notched base at x=4..8, sharp tip at x=29, half-height up to 12.5px)
  const outline = hot ? '#260a06' : '#180808';
  const fill = hot ? '#ffbe38' : '#ee3a2c';
  const hi = hot ? '#fff8d0' : '#ff9a82';
  const shade = hot ? '#d47418' : '#a41c18';
  const inside = (x: number, y: number, pad = 0) => {
    const dy = Math.abs(y - 15.5);
    const tipX = 29 + pad;
    const baseX = 4 - pad;
    if (x > tipX || x < baseX) return false;
    const u = (tipX - x) / Math.max(1, tipX - baseX); // 0 at tip, 1 at base
    const halfH = (12.5 + pad * 1.15) * u;
    if (dy > halfH) return false;
    // Slight inward chevron notch at the back so direction is unmistakable at any rotation
    const notch = Math.max(0, 4.2 - dy * 0.45);
    return x >= baseX + notch - pad * 0.5;
  };
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    if (inside(x, y, 0)) {
      const dy = y - 15.5;
      const isCore = hot && x >= 13 && x <= 23 && Math.abs(dy) <= (24 - x) * 0.36;
      g.fillStyle = isCore ? '#ffffff' : dy < -2 ? hi : dy > 3 ? shade : fill;
      g.fillRect(x, y, 1, 1);
    } else if (inside(x, y, 2)) {
      g.fillStyle = outline;
      g.fillRect(x, y, 1, 1);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = false;
  return t;
}
function arcTex() { return ARC_TEX ?? (ARC_TEX = paintTriArrow(false)); }
/** High-danger off-screen arrow (foe winding up / lunging): bright gold-white pulsing pixel triangle. */
function arcHotTex() { return ARC_HOT_TEX ?? (ARC_HOT_TEX = paintTriArrow(true)); }

/** themed horizontal dock rail behind the 4 compact console/PC skill medallions (unit width = 1, height = 1 in local coords) */
function makeDockRail(skin: SkinId = 'iron'): THREE.Group {
  const g = new THREE.Group();
  const col = new THREE.Color();
  const body = skin === 'lacquer' ? 0x1c0b0e : skin === 'bamboo' ? 0x624822 : 0x1e2026;
  const inner = skin === 'lacquer' ? 0x120608 : skin === 'bamboo' ? 0x3b2a14 : 0x15161c;
  const lip = skin === 'lacquer' ? 0xd8a238 : skin === 'bamboo' ? 0xdcc482 : 0x626876;
  const bot = skin === 'lacquer' ? 0x7c1c18 : skin === 'bamboo' ? 0x483218 : 0x353944;
  const cap = skin === 'lacquer' ? 0x8e1e18 : skin === 'bamboo' ? 0x76582c : 0x765126;
  const capHi = skin === 'lacquer' ? 0xf2c860 : skin === 'bamboo' ? 0xe8d08e : 0xb88442;
  const riv = skin === 'lacquer' ? 0xffe07a : skin === 'bamboo' ? 0xb82c24 : 0xc8924a;
  const specs: Array<[number, number, number, number, number, number, number]> = [
    [1.0, 0.72, 0.14, 0, 0, 0, body],
    [0.92, 0.50, 0.16, 0, 0, 0.02, inner],
    [0.98, 0.075, 0.17, 0, 0.34, 0.02, lip],
    [0.96, 0.055, 0.16, 0, -0.34, 0.01, bot],
    [0.045, 0.86, 0.20, -0.50, 0, 0.03, cap],
    [0.045, 0.08, 0.21, -0.50, 0.39, 0.035, capHi],
    [0.022, 0.12, 0.23, -0.46, 0, 0.04, riv],
    [0.045, 0.86, 0.20, 0.50, 0, 0.03, cap],
    [0.045, 0.08, 0.21, 0.50, 0.39, 0.035, capHi],
    [0.022, 0.12, 0.23, 0.46, 0, 0.04, riv],
  ];
  const geos: THREE.BufferGeometry[] = [];
  for (const [w, h, d, x, y, z, hex] of specs) {
    const b = new THREE.BoxGeometry(w, h, d);
    b.translate(x, y, z);
    const n = b.attributes.position.count, cs = new Float32Array(n * 3);
    col.setHex(hex);
    for (let i = 0; i < n; i++) { cs[i * 3] = col.r; cs[i * 3 + 1] = col.g; cs[i * 3 + 2] = col.b; }
    b.setAttribute('color', new THREE.BufferAttribute(cs, 3));
    geos.push(b);
  }
  const merged = mergeGeometries(geos)!;
  for (const b of geos) b.dispose();
  const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true }));
  g.add(mesh);
  g.userData.noTilt = true;
  g.rotation.set(-0.14, 0, 0);
  return g;
}

export class ActHud {
  flask!: AnyHp; sparks: UiSparks; stick!: SkinStick | IronStick; btns!: Record<BtnName, AnyBtn>; skin: SkinId = SKIN.id;
  /** 杀意 (0..3): shown as the ingots under the iron health bar */
  intent = 0; private qteRing: QteRing;
  /** console/PC horizontal iron dock backing rail (hidden in mobile touch mode) */
  private dockRail: THREE.Group; private dockGeom = { x: 640, y: 658, w: 340, h: 48 };
  /** tracks whether current button layout is touch (mobile thumb-arc + stick) or console/PC (compact dock, no stick) */
  private layoutTouch: boolean | null = null;
  /** console/PC top-right pause badge (clickable with mouse too) */
  private pauseBadge: THREE.Mesh | null = null; private pausePillRect = { x: 0, y: 0, w: 0, h: 0 };
  private bars = new Map<number, Bar>(); private eliteTags = new Set<number>(); private boss: Bar | null = null; private bossName = ''; private marks: THREE.Mesh[] = [];
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
  /** act-146: clean readable learned-moves & boons build summary (replaces cluttered orbiting dots around buttons) */
  buildInfo: { manuals: string[]; boonCount: number } = { manuals: [], boonCount: 0 };
  onOpenOwned: (() => void) | null = null;
  private hudPlates: UiPlatePool;
  private buildStripRect = { x: 0, y: 0, w: 0, h: 0 };
  private buildPid: number | null = null;
  stickHome = { x: 150, y: 600 }; stickSize = 150; k = 1; on = true; private W = 1280; private H = 720;
  /** 11-19 获得提示: the top-left of the reward column, under the portrait's purse */
  feedAt = { x: 18, y: 112 };
  /** crisp pixel button badges (gamepad glyph or keyboard keycap) drawn in the text layer */
  private glyphs: Partial<Record<BtnName, THREE.Mesh>> = {};
  private ensureBadgeMesh(key: BtnName | 'pause'): THREE.Mesh {
    let m = key === 'pause' ? this.pauseBadge : this.glyphs[key];
    if (!m) {
      m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
      this.L.text.scene.add(m);
      if (key === 'pause') this.pauseBadge = m; else this.glyphs[key] = m;
    }
    return m;
  }
  private showTexBadge(key: BtnName | 'pause', tex: THREE.Texture | null, aw: number, ah: number, cx: number, cy: number, targetH: number) {
    if (!tex) { const m = key === 'pause' ? this.pauseBadge : this.glyphs[key]; if (m) m.visible = false; return { w: 0, h: 0 }; }
    const m = this.ensureBadgeMesh(key);
    const mat = m.material as THREE.MeshBasicMaterial; if (mat.map !== tex) { mat.map = tex; mat.needsUpdate = true; }
    const dpr = this.L.dpr || 1, s = Math.max(1, Math.round(targetH / ah * dpr)) / dpr, w = aw * s, hh = ah * s;
    m.scale.set(w, hh, 1); m.position.set(Math.round(cx * dpr) / dpr, -Math.round(cy * dpr) / dpr, 0); m.visible = true;
    return { w, h: hh };
  }
  private hideBadge(key: BtnName | 'pause') {
    const m = key === 'pause' ? this.pauseBadge : this.glyphs[key];
    if (m) m.visible = false;
  }
  constructor(private L: UiLayer) {
    this.sparks = new UiSparks(L.scene, 80); this.qteRing = new QteRing(L);
    this.hudPlates = new UiPlatePool(L);
    this.dockRail = makeDockRail(); this.dockRail.visible = false; L.scene.add(this.dockRail);
    this.build();
  }
  // ---------------------------------------------------------------- the marks of what this run has taken
  private marks2: Mark[] = []; private ringFx: Array<{ m: THREE.Mesh; t: number; target: MarkTarget }> = [];
  /** the marks of this run (show.ts sets the whole list: a new run clears it).
   *  act-146: never clutter the 4 skill buttons with orbiting dot rings that cover the Qi energy pips;
   *  instead display learned manuals & boon count cleanly in the top-left build strip (with [Tab]/click quick-inspect). */
  setMarks(list: Mark[]) {
    this.marks2 = list.map(m => ({ ...m }));
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
    for (const b of this.bars.values()) b.g.parent?.remove(b.g); this.bars.clear();
    for (const uid of this.eliteTags) this.L.text.hide('act.el.' + uid); this.eliteTags.clear();
    if (this.boss) { this.boss.g.parent?.remove(this.boss.g); this.boss = null; }
    this.skin = SKIN.id;
    // act-139 A2: rebuild themed horizontal dock rail & unified high-craft 3D IronHp/IronStick/IronBtn across ALL 3 skins!
    if (this.dockRail) {
      this.dockRail.parent?.remove(this.dockRail);
      this.dockRail.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } });
    }
    this.dockRail = makeDockRail(this.skin); this.dockRail.visible = false; L.scene.add(this.dockRail);
    this.flask = new IronHp(L, this.sparks, this.skin); this.stick = new IronStick(L, this.skin);
    this.btns = {
      attack: new IronBtn(L, 'attack', this.sparks, this.skin),
      dash: new IronBtn(L, 'dash', this.sparks, this.skin),
      special: new IronBtn(L, 'special', this.sparks, this.skin),
      jump: new IronBtn(L, 'jump', this.sparks, this.skin),
      ult: new IronBtn(L, 'ult', this.sparks, this.skin),
    };
    if (st) this.flask.set(st);
    this.layout(this.W, this.H);
  }
  /** switch to the skin the skin module now holds */
  reskin() { if (SKIN.id !== this.skin) this.build(); }
  layout(W: number, H: number) {
    this.W = W; this.H = H;
    setGrid(H, this.L.dpr || 1);
    const k = uiScale(W, H, 0.62, 2.8); this.k = k;
    const fk = Math.max(0.68, 0.88 * k);
    this.flask.place(Math.max(38, 48 * k), Math.max(44, 54 * k), fk);
    this.feedAt = { x: Math.max(20, 48 * k - 16 * fk), y: Math.max(44, 54 * k) + 106 * fk };
    this.stickHome = { x: 160 * k, y: H - 140 * k }; this.stickSize = 170 * k;
    const touch = isTouchLayout();
    this.layoutTouch = touch;
    const b = this.btns;
    if (touch) {
      // Mobile touch mode: bottom-right thumb arc round the big cut button + QTE-only ult pop-in + bottom-left virtual joystick
      if (b.attack instanceof IronBtn) { b.attack.badgeSide = 1; b.attack.pipArc = [1.25, 0.38]; b.attack.pipR = 0.6; }
      b.attack.size = 150 * k; b.dash.size = 100 * k; b.special.size = 100 * k; b.jump.size = 100 * k;
      b.attack.x = W - 150 * k; b.attack.y = H - 140 * k;
      b.dash.x = W - 300 * k; b.dash.y = H - 92 * k;
      b.jump.x = W - 292 * k; b.jump.y = H - 238 * k;
      b.special.x = W - 150 * k; b.special.y = H - 300 * k;
      b.ult.size = 136 * k; b.ult.x = W - 252 * k; b.ult.y = H - 246 * k;
    } else {
      // Console / PC mode: NO virtual joystick, 4-medallion forged-iron horizontal skill dock centered at bottom; 不见刀 pops above ONLY during QTE!
      const cx = W * 0.5, dockY = H - 80 * k, step = 96 * k;
      if (b.attack instanceof IronBtn) { b.attack.badgeSide = 1; b.attack.pipArc = [0, 0.42]; b.attack.pipR = 0.66; }
      b.attack.size = 68 * k; b.dash.size = 58 * k; b.jump.size = 58 * k; b.special.size = 58 * k; b.ult.size = 92 * k;
      b.attack.x = cx - 1.5 * step; b.attack.y = dockY - 3 * k;
      b.dash.x = cx - 0.5 * step; b.dash.y = dockY;
      b.jump.x = cx + 0.5 * step; b.jump.y = dockY;
      b.special.x = cx + 1.5 * step; b.special.y = dockY;
      b.ult.x = cx; b.ult.y = dockY - 82 * k;
      this.dockGeom = { x: cx, y: dockY + 2 * k, w: step * 3.85, h: 52 * k };
    }
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
  private hitBuildStrip(x: number, y: number) {
    const r = this.buildStripRect;
    return r.w > 0 && x >= r.x - 6 && x <= r.x + r.w + 8 && y >= r.y - 6 && y <= r.y + r.h + 6;
  }
  /** a finger let go (whatever screen took the touch): its button, the stick, the portrait are freed */
  lift(id: number, inp: Input) {
    if (this.pausePid === id) { this.setBadgeDown(false); this.pausePid = null; }
    if (this.buildPid === id) this.buildPid = null;
    for (const b of Object.values(this.btns)) if (b.pid === id) { b.down = false; b.pid = null; }
    inp.releaseAll(id);
  }
  /** touch / mouse: the portrait, the buttons, else (on touch) the bottom-left area is the stick. Returns true if used */
  pointer(type: string, id: number, x: number, y: number, inp: Input, touch = true): boolean {
    if (!this.on) return false;
    // the portrait (or console pause pill): pressed, it sinks; let go over it, the menu opens (a slip off it cancels)
    if (type === 'down' && this.pausePid === null && this.hitBadge(x, y)) { this.setBadgeDown(true); this.pausePid = id; return true; }
    if (this.pausePid === id && (type === 'up' || type === 'cancel')) { const fire = type === 'up' && this.hitBadge(x, y); this.setBadgeDown(false); this.pausePid = null; if (fire) this.onPause?.(); return true; }
    if (this.pausePid === id && type === 'move') { this.setBadgeDown(this.hitBadge(x, y)); return true; }
    // act-146: clicking/tapping the top-left learned-moves build strip opens the full 3D 已得 skill sheet directly
    if (type === 'down' && this.buildPid === null && this.onOpenOwned && this.hitBuildStrip(x, y)) { this.buildPid = id; return true; }
    if (this.buildPid === id && (type === 'up' || type === 'cancel')) { const fire = type === 'up' && this.hitBuildStrip(x, y); this.buildPid = null; if (fire) this.onOpenOwned?.(); return true; }
    if (this.buildPid === id && type === 'move') return true;
    if (type === 'down') {
      for (const b of Object.values(this.btns)) {
        if (b === this.btns.ult && !this.ultUp) continue;
        const hit = b === this.btns.ult
          ? (Math.abs(x - b.x) < Math.max(b.size, this.home.ult?.size ?? b.size) * 0.7 && Math.abs(y - b.y) < Math.max(b.size, this.home.ult?.size ?? b.size) * 0.7)
          : b.hit(x, y);
        if (hit) { b.down = true; b.pid = id; inp.press(b.name, id, touch); if (b.name === 'special') inp.aimBegin(id, b.x, b.y, x, y); return true; }
      }   // act-14 用户：「按操作的按钮不要有音效」
      // the virtual joystick only responds on actual touch input or when touch layout is explicitly active (never on desktop mouse clicks)
      if (!touch && !this.layoutTouch) return false;
      inp.stick.r = this.stickSize * 0.42;
      if (TUNE.stickFixed >= 0.5) {
        if (Math.hypot(x - this.stickHome.x, y - this.stickHome.y) < this.stickSize * 0.95) { inp.stickDown(id, this.stickHome.x, this.stickHome.y, touch); inp.stickMove(id, x, y); return true; }
      } else if (x < this.L.w * 0.42 && y > this.L.h * 0.38) {
        const m = this.stickSize * 0.55, bx = Math.max(m, Math.min(this.L.w * 0.42, x)), by = Math.max(this.L.h * 0.38, Math.min(this.L.h - m, y));
        inp.stickDown(id, bx, by, touch); inp.stickMove(id, x, y); return true;
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
    if (b instanceof IronBtn) { b.qteOn = up; b.hot = up; }
    // (the moment to press: the button itself jumps and glows white-gold too)
    if (up && hit && !this.ultHit && b instanceof IronBtn) b.kick(1.2, 0xfff0c0);
    this.ultHit = up && hit;
    if (k == null) this.qteRing.hide(); else this.qteRing.show(b.x, b.y, b.size, k, hit, this.qteDt);
  }
  private ultHit = false; qteDt = 1 / 60;
  /** 不见刀's button is up only during the QTE ring (never permanently parked on the HUD) */
  private ultUp = false;
  private home: Partial<Record<BtnName, { x: number; y: number; size: number }>> = {}; private wayK = 0;
  private makeWay(dt: number) {
    const to = this.ultUp ? 1 : 0; this.wayK += (to - this.wayK) * Math.min(1, dt * 16); if (Math.abs(to - this.wayK) < 1e-3) this.wayK = to;
    const e = this.wayK * this.wayK * (3 - 2 * this.wayK), W = this.W, H = this.H;
    for (const n of Object.keys(this.btns) as BtnName[]) {
      const h = this.home[n], b = this.btns[n]; if (!h) continue;
      if (n === 'ult') {
        b.x = h.x;
        b.y = h.y + (this.layoutTouch ? 18 : 20) * this.k * (1 - e);
        b.size = h.size * (0.65 + 0.35 * e);
        continue;
      }
      if (this.layoutTouch) {
        const g = 1 - 0.16 * e; b.x = W + (h.x - W) * g; b.y = H + (h.y - H) * g; b.size = h.size * (1 - 0.18 * e);
      } else {
        b.x = h.x; b.y = h.y + 4 * this.k * e; b.size = h.size * (1 - 0.06 * e);
      }
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
  private newBar(elite = false): Bar {
    // act-73 反馈 (用户：「我要的是所有血条都符合这个逻辑……垫在后面的我感觉白色效果会更好点」): the lost piece is white on every bar
    // (it was a muted copper, too close to the red to read)
    const p = PALETTE[this.skin], g = new THREE.Group();
    g.userData.noTilt = true;
    const back = flat(elite ? ELITE_BACK : p.foeBack), lag = flat(HP_LAG), fill = flat(elite ? ELITE_FILL : p.foeFill);
    const pBack = flat(elite ? ELITE_BACK : p.foeBack), pLag = flat(HP_LAG), pFill = flat(POISE_COL);
    back.renderOrder = 40; lag.renderOrder = 41; fill.renderOrder = 42;
    pBack.renderOrder = 40; pLag.renderOrder = 41; pFill.renderOrder = 42;
    pBack.visible = pLag.visible = pFill.visible = false;
    let rim: THREE.Mesh | undefined, sheen: THREE.Mesh | undefined, gemBg: THREE.Mesh | undefined, gem: THREE.Mesh | undefined, stud: THREE.Mesh | undefined;
    if (elite) {
      rim = flat(ELITE_RIM); rim.renderOrder = 39;
      sheen = flat(ELITE_SHEEN); sheen.renderOrder = 43;
      gemBg = flat(ELITE_BACK); gemBg.renderOrder = 44; gemBg.rotation.z = Math.PI / 4;
      gem = flat(ELITE_GEM); gem.renderOrder = 45; gem.rotation.z = Math.PI / 4;
      stud = flat(ELITE_RIM); stud.renderOrder = 44; stud.rotation.z = Math.PI / 4;
      g.add(rim, back, lag, fill, sheen, gemBg, gem, stud, pBack, pLag, pFill);
    } else {
      g.add(back, lag, fill, pBack, pLag, pFill);
    }
    this.L.scene.add(g); batchUi(g, true);
    return { g, back, lag, fill, shown: 1, lagV: 1, hold: 0, elite, rim, sheen, gemBg, gem, stud, pBack, pLag, pFill, pShown: 1, pLagV: 1, pHold: 0 };
  }
  private drawBar(b: Bar, x: number, y: number, w: number, h: number, frac: number, dt: number, poise?: { frac: number; broken: boolean; h: number } | null) {
    // the lost piece holds still a moment after each drop (a flurry piles into one piece), then closes in — the same as her own bar
    if (frac < b.shown - 1e-6) b.hold = HP_LAG_HOLD; b.hold = Math.max(0, b.hold - dt);
    const L = this.L; b.shown = frac; b.lagV = closeLag(b.lagV, frac, b.hold, dt);
    L.at(x, y, 0, b.g.position); const u = L.px(1), bk = Math.max(1, this.k);
    if (b.rim) b.rim.scale.set((w + 8 * bk) * u, (h + 8 * bk) * u, 1);
    b.back.scale.set((w + 4 * bk) * u, (h + 4 * bk) * u, 1); b.lag.scale.set(Math.max(1e-4, w * b.lagV) * u, h * u, 1); b.fill.scale.set(Math.max(1e-4, w * frac) * u, h * u, 1);
    b.lag.position.x = (-w / 2 + (w * b.lagV) / 2) * u; b.fill.position.x = (-w / 2 + (w * frac) / 2) * u;
    if (b.sheen) {
      const sh = Math.max(2 * bk, h * 0.24);
      b.sheen.visible = frac > 0.005;
      b.sheen.scale.set(Math.max(1e-4, w * frac) * u, sh * u, 1);
      b.sheen.position.set((-w / 2 + (w * frac) / 2) * u, (h / 2 - sh / 2) * u, 0);
    }
    if (b.gemBg && b.gem && b.stud) {
      const ds = (h + 5 * bk) * u, is = (h + 0.5 * bk) * u, ss = (h * 0.52) * u;
      b.gemBg.position.set((-w / 2 - 4 * bk) * u, 0, 0); b.gemBg.scale.set(ds, ds, 1);
      b.gem.position.set((-w / 2 - 4 * bk) * u, 0, 0); b.gem.scale.set(is, is, 1);
      b.stud.position.set((w / 2 + 4 * bk) * u, 0, 0); b.stud.scale.set(ss, ss, 1);
    }
    if (poise) {
      const pf = Math.max(0, Math.min(1, poise.frac));
      if (poise.broken) { b.pShown = pf; b.pLagV = pf; b.pHold = 0; }
      else {
        if (pf < b.pShown - 1e-6) b.pHold = HP_LAG_HOLD * 0.7;
        b.pHold = Math.max(0, b.pHold - dt); b.pShown = pf;
        b.pLagV = pf > b.pLagV ? pf : closeLag(b.pLagV, pf, b.pHold, dt);
      }
      const ph = poise.h, py = -(h / 2 + ph / 2 + (b.elite ? 6 : 4) * bk) * u;
      b.pBack.visible = b.pLag.visible = b.pFill.visible = true;
      b.pBack.position.set(0, py, 0); b.pBack.scale.set((w + 4 * bk) * u, (ph + 2 * bk) * u, 1);
      b.pLag.position.set((-w / 2 + (w * b.pLagV) / 2) * u, py, 0); b.pLag.scale.set(Math.max(1e-4, w * b.pLagV) * u, ph * u, 1);
      b.pFill.position.set((-w / 2 + (w * pf) / 2) * u, py, 0); b.pFill.scale.set(Math.max(1e-4, w * pf) * u, ph * u, 1);
      const pm = b.pFill.material as THREE.MeshBasicMaterial;
      pm.color.setHex(poise.broken ? ((Math.floor(performance.now() / 85) & 1) ? POISE_BRK_A : POISE_BRK_B) : POISE_COL);
    } else {
      b.pBack.visible = b.pLag.visible = b.pFill.visible = false;
    }
  }
  update(dt: number, inp: Input, foes: Foe[]) {
    const dev = inp.lastDevice, wantTouch = isTouchLayout(dev);
    if (wantTouch !== this.layoutTouch) this.layout(this.W, this.H);
    this.stick.root.visible = this.on && wantTouch;
    this.dockRail.visible = this.on && !wantTouch;
    if (this.dockRail.visible) {
      const dg = this.dockGeom, u = this.L.px(1, -12);
      this.L.at(dg.x, dg.y, -12, this.dockRail.position);
      this.dockRail.scale.set(dg.w * u, dg.h * u, dg.h * u);
    }
    // 不见刀 button is strictly QTE-only (appears ONLY while the QTE ring is active, never permanently parked on HUD)
    const ultBtn = this.btns.ult;
    ultBtn.cd = 0;
    if (ultBtn instanceof IronBtn) {
      ultBtn.hot = this.ultUp;
      ultBtn.qteOn = this.ultUp;
    }
    for (const b of Object.values(this.btns)) {
      const on = this.on && (b !== this.btns.ult || this.ultUp);
      b.root.visible = on;
      if (b instanceof IronBtn) b.iconG.visible = on;
    }
    this.flask.root.visible = this.on;
    this.makeWay(dt);
    if (this.on) {
      if (wantTouch) this.stick.update(inp.stick, this.stickHome, this.stickSize);
      for (const b of Object.values(this.btns)) if (b !== this.btns.ult || this.ultUp) b.update(dt);
    }
    this.markFrame(dt);
    // act-28 / device-adaptive HUD:
    //   Touch mode: clean action words under the thumb-arc shields + QTE-only ult pop-in + hold-stance cue
    //   Console/PC mode: 4-medallion forged-iron skill dock with crisp pixel keycaps (J/K/空格/L); 不见刀 pops above ONLY during QTE
    const dpr = this.L.dpr || 1;
    const pk = Math.max(1, Math.round(Math.max(wantTouch ? 15 : 14, (wantTouch ? 17 : 15) * this.k) * dpr / PIX_H));
    const subPk = Math.max(1, Math.round(Math.max(11, 11.5 * this.k) * dpr / PIX_H));
    const lh = (PIX_H + 2) * pk / dpr;
    const subLh = (PIX_H + 2) * subPk / dpr;
    for (const n of Object.keys(this.btns) as BtnName[]) {
      const b = this.btns[n];
      const isTalk = n === 'attack' && b instanceof IronBtn && b.talk;
      const word = isTalk ? '交谈' : n === 'ult' ? '不见刀' : ACTION_WORD[n];
      if (!this.on || (n === 'ult' && !this.ultUp)) {
        this.hideBadge(n);
        this.L.text.hide('act.btn.' + n);
        if (n === 'attack') this.L.text.hide('act.btn.attackSub');
        continue;
      }
      const lblCol = n === 'ult' ? '#ffe892' : '#f4ecd8';
      if (wantTouch) {
        const px = lh * 0.8, y = b.y + b.size * 0.5 + lh * 0.5 + 2 * this.k;
        const t = dev === 'key' ? `${localize(word)} ${localize(actKey(n))}` : word;
        let x = b.x;
        if (dev === 'pad') {
          const gi = BIND.pad[n][0], a = glyphArt(gi), gh = px * 1.3, gw = a.w / GLYPH_H * gh, gap = px * 0.3, ww = pixTextW(word, pk, dpr);
          x = b.x - (gap + gw) / 2;
          this.showTexBadge(n, glyphTex(gi), a.w, GLYPH_H, b.x - (ww + gap + gw) / 2 + ww + gap + gw / 2, y, gh);
        } else this.hideBadge(n);
        this.L.text.set('act.btn.' + n, { text: t, x, y, pix: pk, color: lblCol, outline: '#140c0a', align: 'center', visible: true });
        if (n === 'attack') {
          if (!isTalk) this.L.text.set('act.btn.attackSub', { text: '长按藏锋', x: b.x, y: y + lh * 0.55 + subLh * 0.45, pix: subPk, color: '#d8be84', outline: '#140c0a', align: 'center', visible: true });
          else this.L.text.hide('act.btn.attackSub');
        }
      } else {
        const badgeH = n === 'ult' ? Math.max(20, 23 * this.k) : Math.max(17, 20 * this.k);
        const by = b.y + b.size * 0.34;
        if (dev === 'pad') {
          const gi = BIND.pad[n][0], a = glyphArt(gi);
          this.showTexBadge(n, glyphTex(gi), a.w, GLYPH_H, b.x + b.size * 0.38, by, badgeH);
        } else {
          const kc = keyCapTex(actKey(n), n === 'ult');
          if (kc) {
            // wider keycaps (e.g. 空格) anchor slightly right so the center skill emblem stays unobscured
            const extraX = kc.w > kc.h ? Math.min(10 * this.k, ((kc.w - kc.h) / kc.h) * badgeH * 0.32) : 0;
            this.showTexBadge(n, kc.tex, kc.w, kc.h, b.x + b.size * 0.38 + extraX, by, badgeH);
          } else this.hideBadge(n);
        }
        const ly = n === 'ult'
          ? b.y - b.size * 0.55 - lh * 0.55
          : this.dockGeom.y + this.dockGeom.h * 0.5 + lh * 0.55 + 6 * this.k;
        this.L.text.set('act.btn.' + n, { text: word, x: b.x, y: ly, pix: pk, color: lblCol, outline: '#140c0a', align: 'center', visible: true });
        if (n === 'attack') {
          if (!isTalk) this.L.text.set('act.btn.attackSub', { text: '长按藏锋', x: b.x, y: ly + lh * 0.52 + subLh * 0.48, pix: subPk, color: '#d8be84', outline: '#140c0a', align: 'center', visible: true });
          else this.L.text.hide('act.btn.attackSub');
        }
      }
    }
    // No permanent top-right pause button (portrait tap + Esc/Start pause cleanly)
    this.hideBadge('pause');
    this.L.text.hide('act.pauseHint');
    this.pausePillRect = { x: 0, y: 0, w: 0, h: 0 };
    this.L.text.hide('act.lowhp');
    this.L.text.hide('act.ultReady');
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
      const coinCell = Math.max(2, Math.round(4 * this.k)), b = this.flask.barAt(), cx = b.x - this.flask.W * this.k / 2 + 12 * this.k, cy = b.y + b.h / 2 + 22 * this.k;
      this.coinIcon.visible = this.on; this.L.at(cx, cy - hop * 4 * this.k, 2, this.coinIcon.position); this.coinIcon.scale.setScalar(this.L.px(18 * this.k) * (1 + 0.25 * hop)); this.coinIcon.rotation.y = hop * 0.8;
      this.L.text.set('act.coins', { text: `${shown}  ${this.iron}  ${this.herb}`, x: cx + 16 * this.k, y: cy, cell: coinCell, color: this.coinHop > 0 ? '#fff0b0' : '#ffd27a', outline: '#21100e', align: 'left', visible: this.on });
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
    const fk = Math.max(0.68, 0.88 * this.k), topBase = Math.max(44, 54 * this.k);
    const leftX = Math.max(20, 48 * this.k - 16 * fk);
    let curY = topBase + 104 * fk;
    const rowPx = Math.max(15, Math.round(16 * this.k));
    if (this.on && this.synergies.length) {
      const synTxt = this.synergies.map(s => `${localize(s.name)}(${s.count})`).join(' · ');
      this.L.text.set('act.syn', { text: synTxt, x: leftX, y: curY, bodyPx: Math.max(16, Math.round(18 * this.k)), color: this.synergies[0].col, outline: '#140c0a', align: 'left', visible: true });
      curY += 26 * fk;
    } else {
      this.L.text.hide('act.syn');
    }
    // act-185: ALWAYS-visible forged-iron 「刀客」 plaque under the portrait (opens 3-tab Mini-World)
    const ms = this.buildInfo.manuals, bc = this.buildInfo.boonCount;
    this.L.text.hide('act.buildM');
    this.L.text.hide('act.buildB');
    if (this.on) {
      const hasBuild = ms.length > 0 || bc > 0;
      const titleTxt = wantTouch || dev === 'pad' ? '刀客' : '[Tab] 刀客';
      let subTxt: string | undefined;
      if (ms.length > 0 && bc > 0) subTxt = `${localize('刀谱')}${ms.length} · ${localize('秘传')}${bc}`;
      else if (ms.length > 0) subTxt = ms.slice(0, 2).map(m => localize(m)).join(' · ');
      else if (bc > 0) subTxt = `${localize('秘传')} ${bc}`;
      this.hudPlates.setTag('hud.skills', {
        text: titleTxt,
        sub: subTxt,
        icon: 'scroll',
        x: leftX,
        y: curY + 8 * fk,
        align: 'left',
        scale: 0.9,
        color: hasBuild ? '#ffe698' : '#f2e4c2',
        accent: hasBuild ? '#d8a64e' : '#9c7d48',
        visible: true,
        order: 47,
      });
      const r = this.hudPlates.getRect('hud.skills');
      if (r) {
        this.buildStripRect = r;
        curY = r.y + r.h + 8 * fk;
      } else {
        this.buildStripRect = { x: 0, y: 0, w: 0, h: 0 };
      }
    } else {
      this.hudPlates.hide('hud.skills');
      this.buildStripRect = { x: 0, y: 0, w: 0, h: 0 };
    }
    void rowPx;
    this.feedAt.y = Math.max(topBase + 106 * fk, curY + 4 * fk);
    // bars over the foes (the chief: the long bar at the top instead; elites: larger forged-gold framed bar + '精英' tag)
    const live = new Set<number>(), liveElites = new Set<number>();
    const elPk = Math.max(1, Math.round(Math.max(11, 12 * this.k) * dprH / PIX_H));
    for (const f of foes) {
      if (isBoss(f) || f.kind === 'dummy') continue;   // wp/foes: isBoss
      let b = this.bars.get(f.uid);
      // a fresh kill keeps its bar over the falling body until the white piece of the last blow has closed
      if (f.st === 'dead') { if (!b || b.lagV <= 0.002) continue; }
      else if (!b) { b = this.newBar(!!f.elite); this.bars.set(f.uid, b); }
      live.add(f.uid);
      const p = worldToUi(f.a.head().add(V3(0, f.elite ? 0.55 : 0.45, 0)));
      const vis = this.on && p.z < 1 && f.a.root.visible;
      b.g.visible = vis;
      const bw = (f.elite ? 92 : 58) * this.k, bh = (f.elite ? 12 : 8) * this.k;
      const poise = f.st !== 'dead' && f.d.poise > 0 ? { frac: f.brokenT > 0 ? f.brokenT / POISE_BREAK_DUR : f.poise / Math.max(1, poiseCap(f)), broken: f.brokenT > 0, h: Math.max(3, (f.elite ? 4.5 : 3.5) * this.k) } : null;
      this.drawBar(b, p.x, p.y, bw, bh, f.st === 'dead' ? 0 : f.hp / f.maxHp, dt, poise);
      if (f.elite && vis && f.st !== 'dead') {
        liveElites.add(f.uid); this.eliteTags.add(f.uid);
        this.L.text.set('act.el.' + f.uid, { text: localize('精英'), x: p.x, y: p.y - (bh / 2 + 12 * this.k), pix: elPk, color: '#ffe27a', outline: '#140c0a', align: 'center', visible: true });
      }
    }
    for (const [uid, b] of this.bars) if (!live.has(uid)) { b.g.parent?.remove(b.g); this.bars.delete(uid); }
    for (const uid of [...this.eliteTags]) if (!liveElites.has(uid)) { this.L.text.hide('act.el.' + uid); this.eliteTags.delete(uid); }
    // Off-screen foes: crisp pixel triangle arrow on the screen edge pointing INWARD toward the player (gold-white pulse when attacking)
    let nm = 0; const W = this.L.w, H = this.L.h, pad = 26 * this.k, nowMs = performance.now();
    const hpUi = worldToUi(this.heroAt.clone().setY(1));
    const hx = hpUi.z < 1 ? Math.max(pad * 2, Math.min(W - pad * 2, hpUi.x)) : W / 2;
    const hy = hpUi.z < 1 ? Math.max(pad * 2, Math.min(H - pad * 2, hpUi.y)) : H / 2;
    const hotNow = new Set<number>();
    for (const f of foes) {
      if (f.st === 'dead' || f.kind === 'dummy' || nm >= 10) continue;
      const q = worldToUi(f.pos.clone().setY(1)); if (q.z < 1 && q.x > 0 && q.x < W && q.y > 0 && q.y < H) continue;
      let dx = q.x - hx, dy = q.y - hy; if (q.z >= 1) { dx = -dx; dy = -dy; }
      const sX = dx > 1e-3 ? (W - pad - hx) / dx : dx < -1e-3 ? (pad - hx) / dx : 1e9;
      const sY = dy > 1e-3 ? (H - pad - hy) / dy : dy < -1e-3 ? (pad - hy) / dy : 1e9;
      const s = Math.min(sX, sY);
      const len = Math.max(1e-3, Math.hypot(dx, dy));
      const inX = -dx / len, inY = -dy / len;
      const dist = Math.hypot(f.pos.x - this.heroAt.x, f.pos.z - this.heroAt.z), near = Math.max(0, Math.min(1, 1 - (dist - 6) / 14));
      const danger = f.st === 'windup' || (f.st === 'strike' && !!f.lunge);
      const imminent = f.st === 'windup' && (f.dur - f.t) < 0.38;
      // Subtle inward lunge pulse toward the player so approaching foes read immediately
      const nudge = (danger ? 4.5 : 2.5 * (0.4 + 0.6 * near)) * this.k * (0.5 + 0.5 * Math.sin(nowMs / (danger ? 65 : 150)));
      const x = hx + dx * s + inX * nudge, y = hy + dy * s + inY * nudge;
      let m = this.marks[nm]; if (!m) { m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: arcTex(), transparent: true, depthWrite: false, depthTest: false })); m.renderOrder = 43; this.L.scene.add(m); this.marks.push(m); }
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
      const sz = danger ? (40 + 10 * near + (imminent ? 6 : 0)) : (32 + 10 * near);
      m.scale.setScalar(this.L.px(sz * this.k));
      // Three.js UI +Y is up while screen +y is down: inward vector (inX, -inY) -> atan2(-inY, inX) = atan2(dy, -dx)
      m.rotation.z = Math.atan2(dy, -dx);
      mat.opacity = danger ? (0.82 + 0.18 * Math.sin(nowMs / (imminent ? 38 : 65))) : (0.68 + 0.30 * near);
      m.visible = this.on; nm++;
    }
    this.offDanger = hotNow;
    for (let i = nm; i < this.marks.length; i++) this.marks[i].visible = false;
    const chief = foes.find(f => isBoss(f) && f.st !== 'dead');   // wp/foes: isBoss
    if (chief) {
      if (!this.boss) this.boss = this.newBar();
      const bPoise = chief.d.poise > 0 ? { frac: chief.brokenT > 0 ? chief.brokenT / POISE_BREAK_DUR : chief.poise / Math.max(1, poiseCap(chief)), broken: chief.brokenT > 0, h: Math.max(4, 6 * this.k) } : null;
      this.boss.g.visible = this.on; this.drawBar(this.boss, this.L.w / 2, 40 * this.k, Math.min(560 * this.k, this.L.w * 0.44), 12 * this.k, chief.hp / chief.maxHp, dt, bPoise);
      if (this.bossName !== chief.d.name) { this.bossName = chief.d.name; }
      const bLbl = chief.inv > 0 && typeof chief.mem?.barrierLabel === 'string' && chief.mem.barrierLabel
        ? `${localize(chief.d.name)} · ${localize(chief.mem.barrierLabel)}`
        : chief.d.name;
      const bCol = chief.inv > 0 && chief.mem?.barrierLabel ? '#ffe066' : '#ffe6b0';
      this.L.text.set('act.boss', { text: bLbl, x: this.L.w / 2, y: 18 * this.k, ...(language === 'en' ? { bodyPx: Math.max(14, 18 * this.k) } : { cell: Math.max(1, Math.round(2 * this.k)) }), color: bCol, align: 'center', visible: this.on });
    } else { if (this.boss) { this.boss.g.parent?.remove(this.boss.g); this.boss = null; } this.L.text.hide('act.boss'); }
  }
}
