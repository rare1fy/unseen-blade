import { language, msg, t } from './i18n';
// 暂停菜单（用户 11-17 选「一次做成铁器菜单」；设计见 docs/DESIGN.md「手柄、改键、暂停菜单」）：
//   和开始画面同一套铁框漆面牌匾（铜端帽、铆钉），一块块从左边滑进来，选中的往前凸、发暖光，一把环首刀柄指着；不压暗画面。
//   第一页（「暂歇」，文字 agy 定）：继续 / 键位 / 设置 / 回据点（出门打的时候才有，要再确认一次，这一趟算战死）。
//   键位：攻击 / 闪避 / 跳跃 / 远程各一行（动作名 · 键盘键 · 手柄按钮图形），选中按确认 → 这一行等新按键（5 秒），按键盘改键盘、
//         按手柄改手柄，撞键对调；恢复默认；返回。
//   设置：调参面板里给玩家的那几项，每行一块牌匾，确认就换到下一个值。开始画面的「设置」直接打开这一页。
// 操作：手柄十字键 / 左摇杆选、A 确认、B 返回、Start 关；键盘方向键 / WS 选、回车 / 空格 / J 确认、Esc 返回；手指 / 鼠标点牌匾。
import * as THREE from 'three';
import type { UiLayer } from '../ui3d/layer';
import { onRealUpdate } from '../engine/world';
import { PAUSE } from '../engine/clock';
import { cue } from '../../audio/cues';
import { mergeBoxes, pommel, IRON_D, IRON, LACQ, LACQ_L, BRONZE, BRONZE_D } from './title';
import { paintTitle } from './opening';
import { pixW, PIX_H } from '../v2/pix';
import { ACTIONS, ACTION_WORD, BIND, PAD, padNav, paintGlyph, glyphArt, keyName, padName, rebind, resetBinds, activePad, pauseName, GLYPH_H, paintKeyCap, keyCapWidth, KEYCAP_H, type Nav } from './pad';
import type { BtnName } from './input';
import { SkillList, type Section } from './skillList';
import { MoveStage } from './moveStage';
import { UI_WORDS } from './skillInfo';
import { backShield, type MiniShield } from './btnBadge';
import { uiScale } from './uiScale';
import type { ModelDef } from '../bestiary/models';
import type { WeaponId } from './weapons';

export interface MenuSetting { id?: string; label: () => string; run: () => void }
export interface PauseHost {
  L: UiLayer;
  /** the player's settings (a label naming the current value; run = the next value) */
  settings: MenuSetting[];
  /** 回据点 is offered (out on a run, not in the prologue) */
  canGiveUp(): boolean;
  giveUp(): void;
  /** 11-19 (用户：「暂停没有回到主画面的选项」): back to the start screen; out on a run it counts as a death (asks first) */
  toTitle?(): void;
  /** out on a run (回主画面 asks first: it ends the trip) */
  onRun?(): boolean;
  /** the menu closed (from the game: the world runs again) */
  closed(): void;
  /** act-151: unified 招式谱 (equipped weapon moveset + slotted boons + run manuals/boons + active arcana/keepsake) */
  build?(): Section[];
  /** legacy fallbacks */
  owned?(): Section[];
  skills?(): Section[];
  /** 11-19: play a 刀谱's 3D ghost beside her in the stopped world */
  preview?(id: string): boolean;
  previewing?(): boolean;
  stopPreview?(): void;
  /** act-165: current heroine costume & equipped weapon for MoveStage's live 3D Mini-World */
  miniContext?(): { def: ModelDef; weaponId: WeaponId; weaponLv: number };
}
type Page = 'main' | 'keys' | 'set' | 'ask' | 'askTitle' | 'build' | 'owned' | 'skills';
interface Row { id: string; label: () => string; act?: BtnName; run?: () => void }

const TXT = { on: '#d9ccb2', sel: '#ffd88a', dim: '#8a7e70', line: '#0a0708', wait: '#ffe6b0' };
/** the slab in CSS px (w × h, depth d), front toward +z: an iron frame, the lacquer panel with a lit top band, bronze end caps with a rivet */
function slab(w: number, h: number) {
  const d = Math.max(8, h * 0.2), cap = Math.max(6, Math.round(h * 0.2)), b: Parameters<typeof mergeBoxes>[0] = [];
  b.push({ w, h, d, x: 0, y: 0, z: 0, c: IRON_D });
  b.push({ w: w - 4, h: Math.max(2, h * 0.08), d: d + 1, x: 0, y: h / 2 - Math.max(1, h * 0.05), z: 0.4, c: IRON });
  b.push({ w: w - cap * 1.6, h: h - Math.max(5, h * 0.2), d: d + 1.2, x: 0, y: 0, z: 0.6, c: LACQ });
  b.push({ w: w - cap * 1.6, h: Math.max(2, h * 0.07), d: d + 1.3, x: 0, y: h / 2 - Math.max(4, h * 0.16), z: 0.6, c: LACQ_L });
  for (const s of [-1, 1]) {
    b.push({ w: cap, h: h + 4, d: d + 2, x: s * (w / 2 + 0.5), y: 0, z: 0.4, c: BRONZE_D });
    b.push({ w: cap, h: 2, d: d + 2.2, x: s * (w / 2 + 0.5), y: (h + 4) / 2 - 1, z: 0.4, c: BRONZE });
    b.push({ w: Math.max(3, cap * 0.55), h: Math.max(3, cap * 0.55), d: d + 3, x: s * (w / 2 - cap * 0.55), y: 0, z: 1, c: BRONZE });
  }
  return new THREE.Mesh(mergeBoxes(b), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0xff7a2a, emissiveIntensity: 0 }));
}
/** a face texture painted on a canvas at device resolution */
function faceTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  const g = c.getContext('2d')!; g.imageSmoothingEnabled = false; draw(g);
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const textW = (s: string, S: number) => (pixW(s) + Math.max(0, [...t(s)].length - 1)) * S;
/** pixel text with its thin outline; align l / c / r about x */
function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, S: number, col: string, align: 'l' | 'c' | 'r' = 'l') {
  const w = textW(s, S), x0 = align === 'c' ? x - w / 2 : align === 'r' ? x - w : x;
  paintTitle(g, s, Math.round(x0), Math.round(y), S, 1, col, TXT.line, Math.max(1, Math.round(S * 0.25)));
  return w;
}

class Slab {
  root = new THREE.Group(); private body: THREE.Mesh | null = null; private face: THREE.Mesh; private tex: THREE.CanvasTexture | null = null;
  w = 0; h = 0; x = 0; y = 0; inK = 0; selK = 0; flash = 0; shake = 0; delay = 0; private bodyKey = ''; private faceKey = '';
  constructor(private L: UiLayer, public row: Row) {
    this.face = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }));
    this.root.add(this.face); this.root.userData.noTilt = true; this.root.renderOrder = 60; L.scene.add(this.root);
  }
  size(w: number, h: number) {
    this.w = w; this.h = h; const k = `${w.toFixed(1)}x${h.toFixed(1)}`; if (k === this.bodyKey) return; this.bodyKey = k;
    if (this.body) { this.root.remove(this.body); this.body.geometry.dispose(); (this.body.material as THREE.Material).dispose(); }
    this.body = slab(w, h); this.root.add(this.body); this.faceKey = '';
  }
  /** repaint when what it shows changes (key) */
  paint(key: string, draw: (g: CanvasRenderingContext2D, cw: number, ch: number, k: number) => void) {
    const k = this.L.dpr || 1, fw = this.w - Math.max(6, this.h * 0.2) * 1.6, fh = this.h * 0.86, full = `${key}|${fw.toFixed(1)}|${fh.toFixed(1)}|${k}`;
    if (full === this.faceKey) return; this.faceKey = full;
    this.tex?.dispose(); this.tex = faceTex(fw * k, fh * k, g => draw(g, fw * k, fh * k, k));
    const m = this.face.material as THREE.MeshBasicMaterial; m.map = this.tex; m.needsUpdate = true;
    this.face.scale.set(fw, fh, 1); this.face.position.z = Math.max(8, this.h * 0.2) / 2 + 2;
  }
  update(dt: number, t: number, sel: boolean, on: boolean) {
    const L = this.L;
    this.selK += ((sel ? 1 : 0) - this.selK) * Math.min(1, dt * 12); this.flash = Math.max(0, this.flash - dt * 2.5); this.shake = Math.max(0, this.shake - dt * 3);
    const e = this.inK * this.inK * (3 - 2 * this.inK), off = (1 - e) * -(this.w + 60), sx = Math.sin(this.shake * 40) * this.shake * 8;
    L.at(this.x + off + this.selK * this.w * 0.04 + sx, this.y, this.selK * 3 + this.flash * 4, this.root.position);
    this.root.scale.setScalar(L.px(1));
    this.root.rotation.set(-0.05 + Math.sin(t * 0.8 + this.y * 0.02) * 0.015, 0.14 * (1 - 0.7 * this.selK) + Math.sin(t * 0.6 + this.y * 0.03) * 0.02, 0);
    if (this.body) { const bm = this.body.material as THREE.MeshLambertMaterial; bm.emissiveIntensity = this.selK * (0.04 + 0.02 * Math.sin(t * 3)) + this.flash * 0.35; }
    (this.face.material as THREE.MeshBasicMaterial).opacity = e; this.root.visible = on && e > 0.01;
  }
  hit(x: number, y: number) { return this.inK > 0.6 && Math.abs(x - this.x) < this.w / 2 + 6 && Math.abs(y - this.y) < this.h / 2 + 4; }
  dispose() {
    this.root.parent?.remove(this.root); this.face.geometry.dispose(); (this.face.material as THREE.Material).dispose(); this.tex?.dispose();
    if (this.body) { this.body.geometry.dispose(); (this.body.material as THREE.Material).dispose(); }
  }
}

/** a plain textured plane in the UI layer (the page's name, the button prompts at the foot) */
class Sign {
  m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, depthTest: false, toneMapped: false }));
  private tex: THREE.CanvasTexture | null = null; private key = ''; w = 0; h = 0;
  constructor(private L: UiLayer) { this.m.renderOrder = 61; this.m.userData.noTilt = true; L.scene.add(this.m); this.m.visible = false; }
  set(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, k: number) => void) {
    const k = this.L.dpr || 1, full = `${key}|${w.toFixed(0)}x${h.toFixed(0)}|${k}`; this.w = w; this.h = h;
    if (full !== this.key) { this.key = full; this.tex?.dispose(); this.tex = faceTex(w * k, h * k, g => draw(g, k)); const m = this.m.material as THREE.MeshBasicMaterial; m.map = this.tex; m.needsUpdate = true; }
  }
  place(x: number, y: number, a: number) { this.L.at(x, y, 10, this.m.position); this.m.scale.set(this.L.px(this.w, 10), this.L.px(this.h, 10), 1); (this.m.material as THREE.MeshBasicMaterial).opacity = a; this.m.visible = a > 0.01; }
  dispose() { this.m.parent?.remove(this.m); this.m.geometry.dispose(); (this.m.material as THREE.Material).dispose(); this.tex?.dispose(); }
}

export class PauseMenu {
  on = false; page: Page = 'main'; private sel = 0; private rows: Row[] = []; private slabs: Slab[] = []; private t = 0; private openT = 0;
  /** opened over the start screen: no world to pause, 返回 on the settings page closes it */
  private fromTitle = false;
  /** act-146: opened directly to 已得 via [Tab] or HUD build strip — back / Tab / Esc closes straight to gameplay */
  private quickClose = false;
  private head: Sign; private foot: Sign; private marker: THREE.Mesh; private markerK = 0; private fade = 0;
  /** the key row waiting for a new key: which row, real seconds left, the pad's buttons when it started */
  private wait: { i: number; t: number; prev: boolean[] } | null = null;
  /** act-151: unified 招式谱 — left scrollable SkillList + right live animated MoveStage inspector */
  private list: SkillList; private stage: MoveStage; private listRel = 0;
  /** 11-19 (用户：「设置的返回按钮设计有问题」): the back button — a small iron shield with a turning-back arrow at the page's top left,
   *  beside its name; every page but the first has it (Esc / pad B / a tap on it). The column no longer ends in a 返回 slab */
  private backBtn: MiniShield; private backK = 0; private backHot = 0; private backAt = { x: 0, y: 0, r: 0 };
  constructor(private host: PauseHost) {
    const L = host.L; this.head = new Sign(L); this.foot = new Sign(L); this.list = new SkillList(L); this.stage = new MoveStage(L);
    this.backBtn = backShield(); this.backBtn.userData.noTilt = true; this.backBtn.traverse(o => { o.renderOrder = 62; }); this.backBtn.visible = false; L.scene.add(this.backBtn);
    this.marker = pommel(); this.marker.userData.noTilt = true; this.marker.renderOrder = 62; this.marker.visible = false; L.scene.add(this.marker);
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', e => this.key(e), true);
      window.addEventListener('wheel', e => { if (this.on && this.list.on) this.list.scrollBy(e.deltaY * 0.6); }, { passive: true });
    }
    onRealUpdate(rdt => this.update(rdt));
  }
  open(page: Page = 'main', o: { fromTitle?: boolean; quickClose?: boolean } = {}) {
    const p: Page = page === 'owned' || page === 'skills' ? 'build' : page;
    this.fromTitle = !!o.fromTitle; this.quickClose = !!o.quickClose; this.on = true; PAUSE.menu = true; if (!this.fromTitle) PAUSE.on = true;
    this.openT = 0; this.wait = null; padNav.sync(); cue('scroll', 0.6);
    this.go(p, true);
  }
  close() {
    if (!this.on) return;
    this.host.stopPreview?.();
    this.on = false; this.wait = null; PAUSE.menu = false; PAUSE.on = false; cue('deselect', 0.4); this.list.close(); this.stage.hide();
    this.host.closed();
  }
  private build(): Row[] {
    const h = this.host;
    if (this.page === 'main') return [
      { id: 'resume', label: () => '继续' },
      ...(h.build || h.owned || h.skills ? [{ id: 'build', label: () => UI_WORDS.build }] : []),
      { id: 'keys', label: () => '键位' }, { id: 'set', label: () => '设置' },
      ...(h.canGiveUp() ? [{ id: 'quit', label: () => '回据点' }] : []),
      ...(h.toTitle ? [{ id: 'title', label: () => '回主画面' }] : []),
    ];
    // act-151: unified 招式谱 uses split SkillList + MoveStage; no slabs — top-left back shield leaves
    if (this.page === 'build') return [];
    if (this.page === 'keys') return [...ACTIONS.map(a => ({ id: 'act', act: a, label: () => ACTION_WORD[a] })), { id: 'reset', label: () => '恢复默认' }];
    if (this.page === 'set') return h.settings.map((s, i) => ({ id: s.id ?? `s${i}`, label: s.label, run: s.run }));
    if (this.page === 'askTitle') return [{ id: 'yesTitle', label: () => '回主画面' }, { id: 'no', label: () => '再想想' }];
    return [{ id: 'yes', label: () => '回据点' }, { id: 'no', label: () => '再想想' }];
  }
  private go(page: Page, first = false) {
    const p: Page = page === 'owned' || page === 'skills' ? 'build' : page;
    this.page = p; this.rows = this.build(); this.wait = null;
    for (const s of this.slabs) s.dispose();
    this.slabs = this.rows.map(r => new Slab(this.host.L, r));
    this.sel = p === 'ask' || p === 'askTitle' ? 1 : 0;
    this.slabs.forEach((s, i) => { s.inK = 0; s.delay = i * 0.05; });
    this.pageT = 0; if (!first) cue('tick', 0.35);
    if (p === 'build') {
      const secs = this.host.build?.() ?? this.host.skills?.() ?? this.host.owned?.() ?? [];
      this.list.open(secs);
    } else {
      this.list.close();
      this.stage.hide();
    }
  }
  /** on the unified 招式谱 page the arrows move in the list */
  private get inList() { return this.page === 'build' && this.list.on; }
  private pageT = 0;
  /** act-151: confirm on a 刀谱 row plays its 3D in-world ghost; on other rows keeps previewing inside MoveStage */
  private listOk() {
    const e = this.list.entry;
    if (e && e.kind === 'manual' && this.host.preview?.(e.id)) { cue('select', 0.5); return; }
  }
  private get previewing() { return !!this.host.previewing?.(); }
  private back() {
    if (this.previewing) { this.host.stopPreview?.(); cue('deselect', 0.4); return; }
    if (this.wait) { this.wait = null; cue('deselect', 0.4); return; }
    if (this.page === 'main' || (this.page === 'set' && this.fromTitle) || (this.page === 'build' && this.quickClose)) { this.close(); return; }
    const was = this.page; cue('deselect', 0.4); this.go('main');
    this.sel = Math.max(0, this.rows.findIndex(r => r.id === (was === 'ask' ? 'quit' : was === 'askTitle' ? 'title' : was)));
  }
  private ok() {
    const r = this.rows[this.sel], s = this.slabs[this.sel]; if (!r || !s) return;
    s.flash = 1;
    switch (r.id) {
      case 'resume': this.close(); return;
      case 'keys': cue('select', 0.5); this.go('keys'); return;
      case 'set': cue('select', 0.5); this.go('set'); return;
      case 'build': case 'owned': case 'skills': cue('select', 0.5); this.go('build'); return;
      case 'quit': cue('select', 0.5); this.go('ask'); return;
      case 'title': cue('select', 0.5); if (this.host.onRun?.()) this.go('askTitle'); else this.leaveToTitle(); return;
      case 'yesTitle': this.leaveToTitle(); return;
      case 'back': this.back(); return;
      case 'no': this.back(); return;
      case 'yes': this.on = false; this.wait = null; PAUSE.menu = false; PAUSE.on = false; this.list.close(); this.stage.hide(); this.host.closed(); this.host.giveUp(); return;
      case 'reset': resetBinds(); cue('select', 0.6); for (const x of this.slabs) x.flash = 0.6; return;
      case 'act': { const p = activePad(); this.wait = { i: this.sel, t: 5, prev: p ? p.buttons.map(b => !!b.pressed) : [] }; cue('select', 0.4); return; }
      default: if (r.run) { r.run(); if (r.id !== 'language') cue('click', 0.5); }
    }
  }
  private leaveToTitle() { this.on = false; this.wait = null; PAUSE.menu = false; PAUSE.on = false; this.list.close(); this.stage.hide(); this.host.closed(); this.host.toTitle?.(); }
  private moveSel(d: number) { if (this.inList) { this.list.move(d); cue('tick', 0.3); return; } const n = this.rows.length; if (!n) return; this.sel = (this.sel + d + n) % n; cue('tick', 0.3); }
  /** a key while the menu is up: the menu takes the keys it uses (nothing under it sees them); F-keys (reload, dev tools) pass */
  private key(e: KeyboardEvent) {
    const k = e.key.toLowerCase();
    if (!this.on || e.ctrlKey || e.metaKey || e.altKey || /^f\d+$/.test(k)) return;
    const nav = ['arrowup', 'w', 'arrowdown', 's', 'enter', ' ', 'j', 'escape', 'backspace'].includes(k) || (this.inList && (k === 'pageup' || k === 'pagedown' || k === 'tab'));
    if (!this.wait && !nav) return;
    e.preventDefault(); e.stopImmediatePropagation(); e.stopPropagation();
    if (e.repeat && !this.inList) return;
    PAD.device = 'key';
    if (this.wait) {
      if (k === 'escape') { this.wait = null; cue('deselect', 0.4); return; }
      this.bind('key', k); return;
    }
    if (k === 'arrowup' || k === 'w') this.moveSel(-1);
    else if (k === 'arrowdown' || k === 's') this.moveSel(1);
    else if (k === 'pageup') this.list.scrollBy(-this.host.L.h * 0.5); else if (k === 'pagedown') this.list.scrollBy(this.host.L.h * 0.5);
    else if (e.repeat) return;
    else if (k === 'enter' || k === ' ' || k === 'j') { if (this.inList) this.listOk(); else this.ok(); }
    else this.back();
  }
  private bind(kind: 'key' | 'pad', code: string | number) {
    const w = this.wait, r = w ? this.rows[w.i] : null; if (!w || !r?.act) return;
    const res = rebind(kind, r.act, code), s = this.slabs[w.i];
    if (res === 'reserved') { cue('deny', 0.5); if (s) s.shake = 1; return; }   // keep listening
    this.wait = null; cue(res === 'ok' ? 'select' : 'click', 0.5); if (s) s.flash = 1;
    padNav.sync();
  }
  pointer(type: string, x: number, y: number, touch = false): boolean {
    if (!this.on) return false;
    if (this.wait) return true;
    // the unified 招式谱 split view: drag scrolls the left list; click selects a row (updating MoveStage); click 「实景演武」 plays 3D ghost
    if (this.inList) {
      if (this.previewing) { if (type === 'up') { this.host.stopPreview?.(); cue('deselect', 0.4); } return true; }
      const onDemo = this.stage.hitDemoBtn(x, y);
      if (type === 'move') this.stage.demoBtnHot = onDemo;
      if (type === 'down' && onDemo) { this.downDemo = true; return true; }
      if (type === 'up' && this.downDemo) { this.downDemo = false; if (onDemo) { if (touch) PAD.device = 'touch'; this.listOk(); } return true; }
      if (type === 'down') { this.drag = { y, moved: 0 }; }
      else if (type === 'move' && this.drag) { const d = this.drag.y - y; this.drag.moved += Math.abs(d); this.drag.y = y; this.list.scrollBy(d); }
      else if (type === 'up' && this.drag) { const tap = this.drag.moved < 8; this.drag = null; const li = this.list.hit(x, y); if (tap && li >= 0) { this.list.sel = li; cue('tick', 0.25); } }
      else if (type === 'move') { const li = this.list.hit(x, y); if (li >= 0 && li !== this.list.sel) { this.list.sel = li; cue('tick', 0.25); } }
    }
    // the enlarged back shield + 返回 label at top left
    const onBack = this.backK > 0.5 && (Math.hypot(x - this.backAt.x, y - this.backAt.y) < this.backAt.r * 1.25
      || (x >= this.backAt.x - this.backAt.r && x <= this.backAt.x + this.backAt.r * 2.8 && Math.abs(y - this.backAt.y) < this.backAt.r * 1.1));
    if (type === 'move') this.backHot = onBack ? 1 : 0;
    if (type === 'down' && onBack) { this.downBack = true; return true; }
    if (type === 'up' && this.downBack) { this.downBack = false; if (onBack) { if (touch) PAD.device = 'touch'; this.back(); } return true; }
    const i = this.slabs.findIndex(s => s.hit(x, y));
    if (type === 'move' && i >= 0 && i !== this.sel) { this.sel = i; cue('tick', 0.25); }
    if (type === 'down') this.downAt = i;
    if (type === 'up') { const was = this.downAt; this.downAt = -1; if (i >= 0 && i === was) { this.sel = i; if (touch) PAD.device = 'touch'; this.ok(); } }
    return true;
  }
  /** act-165: render MoveStage's live 3D Mini-World inside its scissor bay (called before L.renderText) */
  renderMiniWorld(renderer: THREE.WebGLRenderer) {
    if (this.on && this.inList && !this.previewing) this.stage.renderMiniWorld(renderer);
  }
  private drag: { y: number; moved: number } | null = null;
  private downBack = false;
  private downDemo = false;
  private downAt = -1;
  // ---------------------------------------------------------------- the frame (real time, paused or not)
  private update(rdt: number) {
    const L = this.host.L;
    this.fade += ((this.on ? 1 : 0) - this.fade) * Math.min(1, rdt * 10);
    if (!this.on) {
      for (const s of this.slabs) { s.inK = Math.max(0, s.inK - rdt * 5); s.update(rdt, this.t, false, s.inK > 0.01); }
      if (this.fade < 0.02 && this.slabs.length) { for (const s of this.slabs) s.dispose(); this.slabs = []; }
      this.head.place(0, 0, 0); this.foot.place(0, 0, 0); this.marker.visible = false;
      this.stage.hide();
      this.backK = Math.max(0, this.backK - rdt * 6); this.backBtn.visible = this.backK > 0.02; if (this.backBtn.visible) this.backBtn.setOpacity(this.backK);
      L.text.hide('pause.back'); return;
    }
    this.t += rdt; this.openT += rdt; this.pageT += rdt;
    // the pad: rebinding listens for any new button; otherwise up / down / confirm / back / Start
    if (this.wait) {
      const w = this.wait; w.t -= rdt;
      const p = activePad(), now = p ? p.buttons.map(b => !!b.pressed) : [];
      const hit = now.findIndex((v, i) => v && !w.prev[i]); w.prev = now;
      if (hit === 9) { this.wait = null; cue('deselect', 0.4); padNav.sync(); }
      else if (hit >= 0) { PAD.device = 'pad'; this.bind('pad', hit); }
      else if (w.t <= 0) { this.wait = null; cue('deselect', 0.3); }
      if (!this.wait) padNav.sync();
    } else {
      const n: Nav = padNav.poll(rdt);
      if (this.openT > 0.12) {
        if (n.up) this.moveSel(-1); else if (n.down) this.moveSel(1);
        else if (n.right && this.page === 'set') this.ok();
        if (n.ok) { if (this.inList) this.listOk(); else this.ok(); } else if (n.back) this.back(); else if (n.start) { this.host.stopPreview?.(); this.close(); }
      }
    }
    if (!this.on) return;
    this.layout();
    // act-151: unified 招式谱 split view — Left scrollable SkillList (43%) + Right sticky MoveStage live animated preview (51%)
    { const want = this.inList && !this.previewing ? 1 : 0; this.listRel += (want - this.listRel) * Math.min(1, rdt * 10);
      if (this.list.on) {
        const W = L.w, H = L.h, kkL = uiScale(W, H, 0.72, 2.8);
        const padX = Math.max(24 * kkL, W * 0.035);
        const gapX = Math.max(18 * kkL, W * 0.024);
        const availW = W - padX * 2 - gapX;
        const leftW = Math.min(500 * kkL, Math.max(220 * kkL, availW * 0.44));
        const rightW = Math.min(620 * kkL, availW - leftW);
        const totalW = leftW + gapX + rightW;
        const xStart = (W - totalW) / 2;
        const topY = this.lay.top;
        const botY = H - Math.max(36 * kkL, H * 0.075);
        this.list.layout(xStart + leftW / 2, topY, botY, leftW, true);
        this.list.update(rdt, this.listRel);
        const selEntry = this.list.entry;
        if (this.previewing) {
          this.stage.hide(true);
        } else {
          const mc = this.host.miniContext?.();
          if (mc) this.stage.setContext(mc.def, mc.weaponId, mc.weaponLv);
          this.stage.setEntry(selEntry, !!selEntry && selEntry.kind === 'manual' && !!this.host.preview);
          this.stage.layout(xStart + leftW + gapX + rightW / 2, (topY + botY) / 2, rightW, botY - topY);
          this.stage.update(rdt, this.listRel);
        }
      } else {
        this.stage.hide();
      } }
    this.slabs.forEach((s, i) => {
      s.inK = Math.min(1, Math.max(s.inK, (this.pageT - s.delay) / 0.28));
      this.paintRow(i);
      s.update(rdt, this.t, i === this.sel, true);
    });
    // Larger, unmistakable back shield + crisp 返回 label on every sub-page
    { const want = this.page !== 'main' ? 1 : 0; this.backK += (want - this.backK) * Math.min(1, rdt * 10);
      this.backBtn.visible = this.backK > 0.02;
      if (this.backBtn.visible) {
        const p = this.backAt, press = this.downBack ? 0.88 : 1, hot = this.backHot;
        const bz = 0.6 + hot * 0.2;
        L.at(p.x, p.y, bz, this.backBtn.position); this.backBtn.scale.setScalar(L.px(p.r * 2, bz) * press * (1 + 0.07 * hot) * (0.6 + 0.4 * this.backK));
        this.backBtn.rotation.set(0, 0.12 + Math.sin(this.t * 0.7) * 0.03, Math.sin(this.t * 1.3) * 0.02);
        this.backBtn.setOpacity(this.backK); this.backBtn.setRim(hot ? 0xffe498 : 0x9aa4b4, hot ? 0.65 : 0.25);
        const dprB = L.dpr || 1, kkB = uiScale(L.w, L.h, 0.8, 2.8);
        const pkB = Math.max(1, Math.round(18 * kkB * dprB / PIX_H));
        const backLbl = PAD.device === 'key' ? '返回 Esc' : PAD.device === 'pad' ? msg`返回 ${padName(1)}` : '返回';
        L.text.set('pause.back', { text: backLbl, x: p.x + p.r + 8 * kkB, y: p.y, pix: pkB, color: hot ? '#fff8d4' : '#f2e8d2', outline: '#140c0a', align: 'left', visible: this.backK > 0.35 });
      } else L.text.hide('pause.back'); }
    // the pommel points at the selected slab from the left, bobbing
    const s = this.slabs[this.sel];
    this.markerK += ((s && s.inK > 0.9 ? 1 : 0) - this.markerK) * Math.min(1, rdt * 10);
    this.marker.visible = this.markerK > 0.02;
    if (s) {
      L.at(s.x + s.selK * s.w * 0.04 - (s.w / 2 + s.h * 1.05 + Math.sin(this.t * 3.2) * 3), s.y, 6, this.marker.position);
      this.marker.scale.setScalar(L.px(s.h * 0.95) * this.markerK); this.marker.rotation.set(0, 0, Math.sin(this.t * 1.7) * 0.06);
    }
  }
  private lay = { cx: 0, w: 0, h: 0, top: 0, S: 1, hS: 1, gap: 0 };
  private layout() {
    const L = this.host.L, W = L.w, H = L.h, n = this.rows.length, k = L.dpr || 1;
    const kk = uiScale(W, H, 0.72, 2.8);
    const wide = this.page === 'keys' || this.page === 'set';
    const w = wide ? Math.max(280 * kk, Math.min(480 * kk, W * 0.36)) : Math.max(170 * kk, Math.min(290 * kk, W * 0.22));
    const headH = Math.max(28 * kk, Math.min(56 * kk, H * 0.075)), footH = Math.max(18 * kk, Math.min(30 * kk, H * 0.04));
    const avail = H * 0.86 - headH * 1.4 - footH * 1.6;
    const h = Math.max((language === 'en' || this.page === 'set' ? 20 : 24) * kk, Math.min((wide ? 50 : 56) * kk, avail / (n * 1.32 - 0.32))), gap = h * 0.32;
    const total = n * h + (n - 1) * gap, top = this.page === 'build' ? Math.max(headH * 1.45 + H * 0.035, 68 * kk) : Math.max(headH * 1.5 + H * 0.05, (H - total) / 2 + headH * 0.4);
    const cx = this.page === 'build' ? Math.max(w / 2 + 26 * kk, W * 0.14) : Math.max(w / 2 + h * 1.6 + 24 * kk, W * 0.27);
    const S = Math.max(1, Math.round(h * 0.45 * k / PIX_H)), hS = Math.max(1, Math.round(headH * 0.82 * k / PIX_H));
    Object.assign(this.lay, { cx, w, h, top, S, hS, gap });
    this.slabs.forEach((s, i) => { s.size(w, h); s.x = cx; s.y = top + h / 2 + i * (h + gap); });
    // the page's name over the column
    const name = { main: '暂歇', keys: '键位', set: '设置', ask: '回据点？', askTitle: '回主画面？', build: UI_WORDS.build, owned: UI_WORDS.build, skills: UI_WORDS.build }[this.page], note = this.page === 'ask' || this.page === 'askTitle' ? '视同战死：途中所获尽失，残铁与药引照带回' : this.page === 'keys' ? this.keysNote() : '';
    const nS = Math.max(1, Math.round(hS * 0.45)), hw = Math.max(textW(name, hS), textW(note, nS) + 8 * kk) / k + 8 * kk, hh = (PIX_H * hS + (note ? PIX_H * nS + 6 * k * kk : 0)) / k + 6 * kk;
    this.head.set(language + name + note + kk.toFixed(2), hw, hh, g => { text(g, name, 4 * k * kk, 3 * k * kk, hS, TXT.sel); if (note) text(g, note, 4 * k * kk, 3 * k * kk + PIX_H * hS + 6 * k * kk, nS, TXT.dim); });
    const ent = Math.min(1, this.pageT / 0.25), br = Math.max(22 * kk, Math.min(32 * kk, headH * 0.60)), withBack = this.page !== 'main';
    const leftEdge = this.page === 'build' ? Math.max(24 * kk, W * 0.035) : cx - w / 2;
    const headY = this.page === 'build' ? Math.max(hh / 2 + 10 * kk, top - hh / 2 - 12 * kk) : top - hh / 2 - h * 0.45;
    const nx = leftEdge + (withBack ? br * 2 + 108 * kk : 0);
    this.head.place(nx + hw / 2, headY, ent * ent);
    this.backAt = { x: leftEdge + br, y: headY, r: br };
    // the prompts at the foot: the device's own confirm / back (gamepad pixel glyphs or dark-iron pixel keycaps)
    const fS = Math.max(1, Math.round(footH * 0.52 * k / PIX_H)), parts = this.prompts();
    if (parts.length) {
      const gs = fS * 2, ks = fS, gw = (i: number) => glyphArt(i).w * gs;
      const width = parts.reduce((a, p) => a + (p.pad != null ? gw(p.pad) + 5 * k * kk : keyCapWidth(p.key ?? '') * ks + 6 * k * kk) + textW(p.word, fS) + 14 * k * kk, 0) / k;
      const fh = Math.max(PIX_H * fS, GLYPH_H * gs, KEYCAP_H * ks) / k + 4 * kk, keyStr = parts.map(p => `${p.pad ?? p.key}${p.word}`).join() + PAD.device + PAD.family + language + kk.toFixed(2);
      this.foot.set(keyStr, width, fh, g => {
        let x = 0; const mid = fh * k / 2;
        for (const p of parts) {
          if (p.pad != null) { paintGlyph(g, p.pad, x, Math.round(mid - GLYPH_H * gs / 2), gs); x += gw(p.pad) + 5 * k * kk; }
          else { const kw = paintKeyCap(g, p.key!, Math.round(x), Math.round(mid - KEYCAP_H * ks / 2), ks); x += kw.w + 6 * k * kk; }
          x += text(g, p.word, x, Math.round(mid - PIX_H * fS / 2), fS, TXT.on) + 14 * k * kk;
        }
      });
      const last = this.slabs[this.slabs.length - 1], fy = last ? last.y + h / 2 + footH * 1.1 : H * 0.9;
      this.foot.place(cx - w / 2 + width / 2, Math.min(H - fh, fy), ent);
    } else this.foot.place(0, 0, 0);
  }
  private keysNote() { return PAD.device === 'pad' ? msg`选中后按下新键 · ${pauseName()} 取消` : PAD.device === 'key' ? '选中后按下新键 · Esc 取消' : ''; }
  private prompts(): Array<{ pad?: number; key?: string; word: string }> {
    const okWord = this.wait ? '' : this.inList ? '返回' : this.page === 'keys' && this.rows[this.sel]?.id === 'act' ? '改键' : this.page === 'set' && this.rows[this.sel]?.run ? '切换' : '确认';
    if (this.wait) return [];
    if (this.inList) return [];
    if (PAD.device === 'pad') return [{ pad: 0, word: okWord }, { pad: 1, word: '返回' }];
    if (PAD.device === 'key') return [{ key: '回车', word: okWord }, { key: 'Esc', word: '返回' }];
    return [];
  }
  /** each slab's face: plain rows centred; key rows = the action · the keyboard key · the pad button; the setting rows their label */
  private paintRow(i: number) {
    const s = this.slabs[i], r = this.rows[i], sel = i === this.sel, S = this.lay.S, col = sel ? TXT.sel : TXT.on;
    if (r.act) {
      const waiting = this.wait?.i === i, a = r.act, kk = BIND.key[a][0], pb = BIND.pad[a][0], blink = waiting ? Math.floor(this.t * 3) % 2 : 0;
      s.paint(`${language}|${a}|${kk}|${pb}|${PAD.family}|${sel}|${waiting}|${blink}`, (g, cw, ch) => {
        const ty = Math.round((ch - PIX_H * S) / 2), pad = ch * 0.3;
        text(g, ACTION_WORD[a], pad, ty, S, col);
        if (waiting) { text(g, '请按键…', cw * 0.72, ty, S, blink ? TXT.wait : TXT.sel, 'c'); return; }
        text(g, keyName(kk), cw * 0.56, ty, S, col, 'c');
        const gs = Math.max(1, Math.round(ch * 0.6 / GLYPH_H)), gw = glyphArt(pb).w * gs;
        paintGlyph(g, pb, Math.round(cw * 0.84 - gw / 2), Math.round((ch - GLYPH_H * gs) / 2), gs);
      });
      return;
    }
    const label = t(r.label());
    s.paint(`${label}|${sel}`, (g, cw, ch) => {
      let SS = S; while (SS > 1 && textW(label, SS) > cw * 0.92) SS--;
      text(g, label, cw / 2, Math.round((ch - PIX_H * SS) / 2), SS, col, 'c');
    });
  }
}
