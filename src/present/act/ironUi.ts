// 铁器界面第二版（act-09 用户：「UI风格我比较喜欢铁那一套，但是我感觉做得还不够好，有点单调，然后按钮上不要摆文字。血条也很抽象。」）
//   技能钮：一面有层次的小铁盾——黑铁底盘、外圈八片凸起的甲片（甲片间铜钉）、中间一块铁心；图形是单独的立体小模型浮在上面（不放字）：
//           斩 = 竖着的环首刀，冲 = 一只脚印带风线，跳 = 两层向上的折角，技（残影）= 三个错开的人影。
//           冷却：甲片像钟面一样一片片重新亮回来（从正上方顺时针）；蓄力：甲片从下往上烧红；转好 / 反击待发：甲片泛炉火橙光。
//           斩钮下面垂一条红布穗，跟着晃。
//   摇杆：铁环底座一圈甲片、四颗铜钉；摇杆头是一个环首刀的铜环。
//   血条：左边一个八角铁框，里面是主角头像（斗笠、白蒙眼）；右边一条铁槽，红色的血、白色拖尾、每一成一道刻痕；
//         槽下三颗铜锭 = 杀意，满一格烧亮一颗。
// 全是 UI 层里的 3D 实物，贴图逐像素画（横平竖直，不撒随机点）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { UiLayer } from '../ui3d/layer';
import { UiSparks } from '../ui3d/vox';
import { cue } from '../../audio/cues';
import type { BtnKey } from './skin';

const IRON = 0x4a4f5a, IRON_D = 0x1e2026, IRON_L = 0x6c7380, BRONZE = 0xb07a3a, EMBER = 0xff7a2a;
const lam = (c: number, t?: THREE.Texture) => new THREE.MeshLambertMaterial({ color: c, map: t, emissive: t ? 0xffffff : 0x000000, emissiveMap: t, emissiveIntensity: t ? 0.5 : 0 });
const octCyl = (r: number, d: number) => new THREE.CylinderGeometry(r, r, d, 8, 1, false, (5 * Math.PI) / 8).rotateX(Math.PI / 2);
function disposeTree(o: THREE.Object3D) {
  o.traverse(x => { const m = x as THREE.Mesh; if (!m.isMesh) return; m.geometry.dispose(); const mats = Array.isArray(m.material) ? m.material : [m.material]; for (const mt of mats) { const mm = mt as THREE.MeshLambertMaterial; mm.map?.dispose(); mm.dispose(); } });
  o.parent?.remove(o);
}
/** a square art-pixel canvas (just bigger than the picture) from rows of chars: '#' outline, 'o' bronze, 'h' highlight, 'd' dark bronze, 'r' red, 'w' white, 's' skin, 'y' straw, 'Y' straw light */
function pixTex(rows: string[], bg: string, S = 6) {
  // the canvas just a little larger than the picture, so it fills the face
  const N = Math.max(16, Math.max(rows.length, ...rows.map(r => r.length)) + 3), c = document.createElement('canvas'); c.width = c.height = N * S; const g = c.getContext('2d')!; g.imageSmoothingEnabled = false;
  const COL: Record<string, string> = { '#': '#121318', o: '#c08a44', h: '#f0c070', d: '#7a5428', r: '#b8302a', R: '#7a1814', w: '#eee8da', s: '#d9a883', y: '#c9a457', Y: '#e2c078', k: '#1e1c22', b: '#3c4654' };
  g.fillStyle = bg; g.fillRect(0, 0, N * S, N * S);
  // a soft bevel: the upper-left lighter, the lower-right darker (two flat bands, no gradient speckle)
  g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(0, 0, N * S, Math.round(N * 0.3) * S); g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, Math.round(N * 0.75) * S, N * S, N * S);
  const oy = Math.floor((N - rows.length) / 2), ox = Math.floor((N - rows[0].length) / 2);
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) { const col = COL[r[x]]; if (col) { g.fillStyle = col; g.fillRect((ox + x) * S, (oy + y) * S, S, S); } } });
  const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace; return t;
}
/** outline a mask: 'o' cells keep their letter, empty cells next to a filled one become '#' */
function ol(rows: string[]): string[] {
  const H = rows.length + 2, W = rows[0].length + 2, at = (x: number, y: number) => { const c = rows[y - 1]?.[x - 1]; return c !== undefined && c !== '.' ? c : ''; };
  const out: string[] = [];
  for (let y = 0; y < H; y++) { let r = ''; for (let x = 0; x < W; x++) { const c = at(x, y); r += c || ([[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dx, dy]) => at(x + dx, y + dy)) ? '#' : '.'); } out.push(r); }
  return out;
}
/** the move-link hints (act-18 用户：「combo在按钮上要有点动特效提示，不然根本不知道怎么打」): a little pixel picture that pops up at the
 *  button's upper left while the link is open, in the move's colour; the button's plates breathe in that colour too. No words. */
export type HintKey = 'dcut' | 'back' | 'plunge' | 'dbl' | 'chase' | 'counter';
const HINTS: Record<HintKey, { rows: string[]; col: number }> = {
  // 穿风斩: a level cut with wind lines behind
  dcut: { col: 0xbfeaff, rows: ['..........', '##........', '..........', '####..###.', '.....#####', '####..###.', '..........', '##........', '..........', '..........'] },
  // 回身镖: an arrow back with a dart on it
  back: { col: 0xf0e6d2, rows: ['...#......', '..##......', '.########.', '##########', '.########.', '..##......', '...#......', '..........', '..........', '..........'] },
  // 下劈: an arrow down
  plunge: { col: 0xffc860, rows: ['...####...', '...####...', '...####...', '##########', '.########.', '..######..', '...####...', '....##....', '..........', '..........'] },
  // 二段跳: two chevrons up
  dbl: { col: 0xa8d8ff, rows: ['....##....', '..######..', '.##....##.', '##......##', '....##....', '..######..', '.##....##.', '##......##', '..........', '..........'] },
  // 追影: a dart with a shadow line running to it
  chase: { col: 0x9aa4ff, rows: ['..........', '......##..', '#.#.#.###.', '.#.#.######', '#.#.#.###.', '......##..', '..........', '..........', '..........', '..........'] },
  // 反击: two cuts crossing
  counter: { col: 0xffd060, rows: ['##......##', '.##....##.', '..##..##..', '...####...', '...####...', '..##..##..', '.##....##.', '##......##', '..........', '..........'] },
};
function hintTex(k: HintKey) {
  const h = HINTS[k], S = 8, N = 12, c = document.createElement('canvas'); c.width = c.height = N * S; const g = c.getContext('2d')!; g.imageSmoothingEnabled = false;
  g.fillStyle = '#5a5a62'; g.fillRect(0, 0, N * S, N * S); g.fillStyle = '#1e1c22'; g.fillRect(S, S, (N - 2) * S, (N - 2) * S);
  g.fillStyle = '#' + h.col.toString(16).padStart(6, '0');
  h.rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] === '#') g.fillRect((1 + x) * S, (1 + y) * S, S, S); });
  const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace; return t;
}
const ICONS: Record<BtnKey, string[]> = {
  // a ring-pommel sabre standing up: the ring, the wrapped grip, a small guard, the blade (bright edge, darker spine), the point
  attack: ol([
    '..ooo..', '.o...o.', '.o...o.', '..ooo..', '...r...', '...R...', '...r...', '...R...', '.ooooo.', '..hod..', '..hod..', '..hod..', '..hod..',
    '..hod..', '..hod..', '..hod..', '..hod..', '..hod..', '..hod..', '...hd..', '...h...']),
  // a foot (sole and toes) with three wind lines behind it
  dash: ol([
    '..........ooo.', '.........ooooo', '.........ooooo', 'hhhh.....ooooo', '..........ooo.', '.hhhhhh...ooo.', '..........ooo.', 'hhhh.....oooo.',
    '.........oooo.', '.........ooo..', '..........oo..']),
  // two up-chevrons in steps of two over a ground bar
  jump: ol([
    '.....oo.....', '...oooooo...', '.oooo..oooo.', 'ooo......ooo', '.....oo.....', '...oooooo...', '.oooo..oooo.', 'ooo......ooo', '............', '............', 'hhhhhhhhhhhh']),
  // a 柳叶镖 standing point up: the leaf blade (bright edge, darker spine), the neck, the ring, a red tassel hanging below
  special: ol([
    '...h...', '..hod..', '..hod..', '.hhodd.', '.hhodd.', '.hhodd.', '..hod..', '..hod..', '...o...', '..ooo..', '..o.o..', '..ooo..',
    '..rRr..', '.rRrRr.', '.rRrRr.', 'rRr.rRr', 'r.r.r.r']),
};
// make every row the same width (the mask helper needs a rectangle)
for (const k of Object.keys(ICONS) as BtnKey[]) { const w = Math.max(...ICONS[k].map(r => r.length)); ICONS[k] = ICONS[k].map(r => r.padEnd(w, '.')); }

/** boxes merged into one geometry with a colour per box (one draw call); each box's vertex range is returned so its colour can
 *  be changed later (the plates relight / glow) */
interface BoxSpec { w: number; h: number; d: number; x: number; y: number; z: number; rz?: number; c: number }
function mergeBoxes(list: BoxSpec[]) {
  const gs: THREE.BufferGeometry[] = [], ranges: Array<[number, number]> = []; let at = 0;
  const col = new THREE.Color();
  for (const b of list) {
    const g = new THREE.BoxGeometry(b.w, b.h, b.d); if (b.rz) g.rotateZ(b.rz); g.translate(b.x, b.y, b.z);
    const n = g.attributes.position.count, cs = new Float32Array(n * 3); col.setHex(b.c);
    for (let i = 0; i < n; i++) { cs[i * 3] = col.r; cs[i * 3 + 1] = col.g; cs[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(cs, 3)); gs.push(g); ranges.push([at, n]); at += n;
  }
  const geo = mergeGeometries(gs)!; for (const g of gs) g.dispose();
  return { geo, ranges };
}
function paintRange(geo: THREE.BufferGeometry, r: [number, number], c: THREE.Color) {
  const a = geo.attributes.color as THREE.BufferAttribute;
  for (let i = r[0]; i < r[0] + r[1]; i++) a.setXYZ(i, c.r, c.g, c.b);
  a.needsUpdate = true;
}
const vcMat = () => new THREE.MeshLambertMaterial({ vertexColors: true });
/** the ring of eight raised lamellar plates (each with a lit upper lip) and eight bronze rivets between them, as two meshes */
function plateRing(r: number, z: number, plateW: number) {
  const plates: BoxSpec[] = [], rivets: BoxSpec[] = [];
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 2 - (i / 8) * Math.PI * 2, rz = a - Math.PI / 2, cx = Math.cos(a) * r, cy = Math.sin(a) * r;
    plates.push({ w: plateW, h: 0.13, d: 0.07, x: 0, y: 0, z: 0, rz, c: IRON });
    plates[plates.length - 1].x = cx; plates[plates.length - 1].y = cy; plates[plates.length - 1].z = z;
    // the lip: on the plate's outer edge (local +y, turned by rz)
    plates.push({ w: plateW, h: 0.03, d: 0.075, x: cx + Math.cos(a) * 0.05, y: cy + Math.sin(a) * 0.05, z: z + 0.002, rz, c: IRON_L });
    const ab = Math.PI / 2 - ((i + 0.5) / 8) * Math.PI * 2;
    rivets.push({ w: 0.06, h: 0.06, d: 0.06, x: Math.cos(ab) * r, y: Math.sin(ab) * r, z: z + 0.01, c: BRONZE });
  }
  const P = mergeBoxes(plates), R = mergeBoxes(rivets);
  return { plates: new THREE.Mesh(P.geo, vcMat()), ranges: P.ranges, rivets: new THREE.Mesh(R.geo, vcMat()) };
}
/** a pixel picture extruded into a small relief model (outline cells one step lower than the body), one mesh, centred, its
 *  longest side = 1; glow through the material's emissive */
const ICON_COL: Record<string, number> = { '#': 0x121318, o: 0xc08a44, h: 0xf0c070, d: 0x7a5428, r: 0xb8302a, R: 0x7a1814 };
function voxIcon(rows: string[]) {
  const H = rows.length, W = rows[0].length, s = 1 / Math.max(W, H), boxes: BoxSpec[] = [];
  rows.forEach((row, y) => { for (let x = 0; x < W; x++) { const ch = row[x], c = ICON_COL[ch]; if (c == null) continue; const d = ch === '#' ? 2 : 3; boxes.push({ w: s, h: s, d: d * s, x: (x - W / 2 + 0.5) * s, y: (H / 2 - y - 0.5) * s, z: (d * s) / 2, c }); } });
  const { geo } = mergeBoxes(boxes);
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0xff9a40, emissiveIntensity: 0 }));
}

// ---------------------------------------------------------------- the skill button
// act-10 用户：「技能上的图标和底板模型要独立开来，我想做哪种效果你看骰子怎么搞的」→ 照骰子版技能钮：图形是单独的立体小模型（像素挤出的
// 浮雕），自己一个顶层物件浮在钮面上方，钮面上落着它的影子；平时轻轻上下浮、左右摆；转好时跳起转一圈；冷却时沉下去变暗；
// 待发（反击 / 蓄满 / 见切时机）时抬高发光；按下时压回钮面。
export class IronBtn {
  root = new THREE.Group(); iconG = new THREE.Group(); x = 0; y = 0; size = 80; down = false; pid = -1; cd = 0; charge = 0; hot = false;
  /** a flash of white (the 见切 moment while holding the stance) */
  now = false;
  /** a move link open on this button right now (null = none) */
  hint: HintKey | null = null; /** which side the badge pops up on (−1 upper left, +1 upper right: the big cut button has the jump button at its upper left) */ badgeSide: -1 | 1 = -1; private badge: THREE.Mesh | null = null; private badgeKey: HintKey | null = null; private badgeK = 0; private badgePop = 1;
  /** charges left / the most (the dart button: three bronze lamps on an arc over the shield); max 0 = none */
  pips = 0; pipMax = 0; private pipMeshes: THREE.Mesh[] = [];
  private ring: ReturnType<typeof plateRing>; private icon: THREE.Mesh; private shadow: THREE.Mesh; private tassel: THREE.Mesh | null = null;
  private pressK = 0; private flashT = 0; private wasReady = true; private tt = 0; private wasFull = false; private lift = 6; private popT = 1;
  private col = new THREE.Color(); private ember = new THREE.Color(EMBER); private dark = new THREE.Color(0x24262c); private base = new THREE.Color(IRON);
  constructor(private L: UiLayer, public name: BtnKey, private sparks: UiSparks) {
    const back = new THREE.Mesh(octCyl(0.5, 0.12), lam(IRON_D)); this.root.add(back);
    const rim = new THREE.Mesh(octCyl(0.47, 0.14), lam(0x30333b)); rim.position.z = 0.01; this.root.add(rim);
    // the socket the picture floats over: a darker recessed octagon
    const sock = new THREE.Mesh(new THREE.CircleGeometry(0.3, 8, Math.PI / 8), lam(0x24272e)); sock.position.z = 0.085; this.root.add(sock);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.2, 8, Math.PI / 8), new THREE.MeshBasicMaterial({ color: 0x07080a, transparent: true, opacity: 0.5, depthWrite: false }));
    this.shadow.position.z = 0.088; this.root.add(this.shadow);
    this.ring = plateRing(0.39, 0.09, 0.27); this.root.add(this.ring.plates, this.ring.rivets);
    if (name === 'attack') {
      const t = mergeBoxes([{ w: 0.08, h: 0.08, d: 0.08, x: 0, y: 0, z: 0, c: BRONZE }, { w: 0.045, h: 0.3, d: 0.03, x: -0.03, y: -0.18, z: 0, c: 0xb8302a }, { w: 0.045, h: 0.3, d: 0.03, x: 0.03, y: -0.18, z: 0, c: 0xa02820 }]);
      this.tassel = new THREE.Mesh(t.geo, vcMat()); this.tassel.position.set(0, -0.5, 0.04); this.root.add(this.tassel);
    }
    this.icon = voxIcon(ICONS[name]); this.iconG.add(this.icon);
    L.scene.add(this.root); L.scene.add(this.iconG);
  }
  hit(x: number, y: number) { const r = this.size * 0.6; return Math.abs(x - this.x) < r && Math.abs(y - this.y) < r; }
  update(dt: number) {
    const L = this.L; this.tt += dt;
    // the charge lamps: built once the button is told how many there are; lit bronze = a dart in hand, dark = spent
    if (this.pipMax > 0 && this.pipMeshes.length !== this.pipMax) {
      for (const m of this.pipMeshes) { this.root.remove(m); m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
      this.pipMeshes = [];
      for (let i = 0; i < this.pipMax; i++) {
        const a = Math.PI / 2 + (i - (this.pipMax - 1) / 2) * 0.32, m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.08), lam(0x2a2c33));
        m.position.set(-Math.cos(a) * 0.64, Math.sin(a) * 0.64, 0.06); m.rotation.z = a - Math.PI / 2; this.root.add(m); this.pipMeshes.push(m);
      }
    }
    this.pipMeshes.forEach((m, i) => { const on = i < this.pips; const mt = m.material as THREE.MeshLambertMaterial; mt.color.setHex(on ? 0xf0c070 : 0x2a2c33); mt.emissive?.setHex(on ? 0x6a4010 : 0x000000); m.scale.setScalar(on ? 1 : 0.8); });
    this.pressK += ((this.down ? 1 : 0) - this.pressK) * Math.min(1, dt * 30);
    L.at(this.x, this.y, -this.pressK * 4, this.root.position); this.root.scale.setScalar(L.px(this.size) * (1 - 0.06 * this.pressK));
    const ready = this.cd <= 0, frac = Math.max(0, Math.min(1, this.cd)), ch = Math.max(0, Math.min(1, this.charge)), full = ch >= 1;
    if (full && !this.wasFull) this.sparks.burst(L.at(this.x, this.y, 3), 14, L.px(170), L.px(4), 0xffb060, { life: 0.35 });
    this.wasFull = full;
    if (ready && !this.wasReady) { this.flashT = 0.45; this.popT = 0; this.sparks.burst(L.at(this.x, this.y, 3), 12, L.px(160), L.px(4), 0xffb060, { life: 0.35 }); }   // no 'ready' tick (buttons are silent)
    this.wasReady = ready; this.flashT = Math.max(0, this.flashT - dt); this.popT = Math.min(1, this.popT + dt / 0.5);
    const pulse = 0.5 + 0.5 * Math.sin(this.tt * 12), geo = this.ring.plates.geometry;
    for (let i = 0; i < 8; i++) {
      // cool-down: the plates come back one by one like a clock face from the top; charge: they heat up from the bottom
      const lit = ready || i / 8 < 1 - frac;
      const fromBottom = (4 - Math.abs(i - 4)) / 4, heat = ch > 0 ? Math.max(0, Math.min(1, (ch - (1 - fromBottom) * 0.85) * 3)) : 0;
      const hc = this.hint && !this.now ? HINT_COLS[this.hint] : null;
      const glow = this.now ? 0.9 : hc ? 0.5 + 0.45 * pulse : this.flashT > 0 ? Math.min(1, this.flashT * 1.8) : this.hot || full ? 0.45 + 0.4 * pulse : heat;
      this.col.copy(lit ? this.base : this.dark).lerp(this.now ? WHITE : hc ?? this.ember, lit ? glow * 0.8 : 0);
      paintRange(geo, this.ring.ranges[i * 2], this.col);
    }
    if (this.tassel) this.tassel.rotation.z = Math.sin(this.tt * 2.1) * 0.14 + Math.sin(this.tt * 5.3) * 0.04;
    // the floating picture: lift by state, bob, a hop-and-turn when it comes ready, pressed back onto the plate
    const k = Math.min(1, dt * 10), hotK = this.hot || full || this.now;
    const liftT = this.down ? 1 : !ready ? 2 : hotK ? 15 + 3 * Math.sin(this.tt * 6) : 7;
    this.lift += (liftT - this.lift) * k;
    const pop = this.popT < 1 ? Math.sin(this.popT * Math.PI) * 12 : 0, bob = Math.sin(this.tt * 2.6 + this.x * 0.01) * 1.6;
    const isz = this.size * 0.6, sc = L.px(this.size) / this.size;
    L.at(this.x, this.y - (this.lift * 0.35 + pop + bob) * (this.size / 100), 0, this.iconG.position);
    this.iconG.position.z = sc * (this.size * 0.1 + (this.lift + pop) * 1.2);
    this.iconG.scale.setScalar(L.px(isz) * (1 - 0.08 * this.pressK) * (ready ? 1 : 0.92));
    const spin = this.popT < 1 ? (1 - Math.cos(this.popT * Math.PI)) * Math.PI : 0;
    this.iconG.rotation.set(-0.2, Math.sin(this.tt * 0.8 + this.x * 0.02) * 0.28 + spin, 0);
    const im = this.icon.material as THREE.MeshLambertMaterial;
    im.color.setScalar(ready ? 1 : 0.5); im.emissive.setHex(this.now ? 0xffffff : 0xff9a40); im.emissiveIntensity = this.now ? 0.6 + 0.3 * pulse : hotK ? 0.25 + 0.25 * pulse : this.flashT > 0 ? this.flashT : 0;
    // the shadow on the socket: smaller and fainter as the picture rises
    this.shadow.scale.setScalar(1.15 - Math.min(0.4, this.lift / 40)); (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.55 - Math.min(0.3, this.lift / 50);
    this.iconG.visible = this.root.visible;
    // the hint badge: pops up (overshoot) at the upper left, breathes, shrinks away when the link closes
    if (this.hint && this.hint !== this.badgeKey) {
      if (!this.badge) { this.badge = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthTest: false })); this.badge.renderOrder = 9; L.scene.add(this.badge); }
      const m = this.badge.material as THREE.MeshBasicMaterial; m.map?.dispose(); m.map = hintTex(this.hint); m.needsUpdate = true; this.badgeKey = this.hint; this.badgePop = 0;
    }
    this.badgeK += ((this.hint ? 1 : 0) - this.badgeK) * Math.min(1, dt * 14); this.badgePop = Math.min(1, this.badgePop + dt / 0.28);
    if (this.badge) {
      const pop = this.badgePop < 1 ? 1 + 0.35 * Math.sin(this.badgePop * Math.PI) : 1, breathe = 1 + 0.07 * Math.sin(this.tt * 9);
      this.badge.visible = this.root.visible && this.badgeK > 0.03;
      const bs = Math.min(this.size, 110) * 0.44;
      L.at(this.x + this.badgeSide * (this.size * 0.5 + bs * 0.15), this.y - this.size * 0.58 - 4 * Math.sin(this.tt * 4), 6, this.badge.position);
      this.badge.scale.setScalar(L.px(bs) * this.badgeK * pop * breathe);
    }
  }
  dispose() { disposeTree(this.root); disposeTree(this.iconG); if (this.badge) disposeTree(this.badge); }
}
const WHITE = new THREE.Color(0xfff6e0);
const HINT_COLS = Object.fromEntries(Object.entries(HINTS).map(([k, h]) => [k, new THREE.Color(h.col)])) as Record<HintKey, THREE.Color>;

// ---------------------------------------------------------------- the stick: an iron ring of plates, a bronze ring-pommel for the knob
export class IronStick {
  root = new THREE.Group(); private knobG = new THREE.Group(); private ring: ReturnType<typeof plateRing>; private lastIdx = -2;
  private col = new THREE.Color();
  constructor(private L: UiLayer) {
    const back = new THREE.Mesh(octCyl(0.5, 0.06), lam(IRON_D)); this.root.add(back);
    const face = new THREE.Mesh(octCyl(0.33, 0.07), lam(0x34373f)); face.position.z = 0.01; this.root.add(face);
    this.ring = plateRing(0.41, 0.05, 0.28); this.root.add(this.ring.plates, this.ring.rivets);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.045, 6, 8), lam(BRONZE)); ring.rotation.z = Math.PI / 8; this.knobG.add(ring);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.12), lam(0xd09a50)); cap.position.z = 0.02; this.knobG.add(cap);
    this.knobG.position.z = 0.14; this.root.add(this.knobG);
    L.scene.add(this.root);
  }
  update(s: { id: number; ox: number; oy: number; x: number; y: number }, home: { x: number; y: number }, size: number) {
    const L = this.L, on = s.id >= 0, ox = on ? s.ox : home.x, oy = on ? s.oy : home.y;
    L.at(ox, oy, 0, this.root.position); this.root.scale.setScalar(L.px(size));
    const dx = on ? s.x - s.ox : 0, dy = on ? s.y - s.oy : 0, d = Math.hypot(dx, dy), r = size * 0.32, k = d > r ? r / d : 1;
    this.knobG.position.set((dx * k) / size, (-dy * k) / size, 0.14);
    // the plate the thumb points at glows
    const a = Math.atan2(-dy, dx), idx = d > size * 0.05 ? Math.round(((Math.PI / 2 - a) / (Math.PI * 2)) * 8 + 8) % 8 : -1;
    const key = idx + (on ? 10 : 0);
    if (key !== this.lastIdx) {
      this.lastIdx = key;
      for (let i = 0; i < 8; i++) { this.col.setHex(on ? IRON : 0x3c4049); if (i === idx) this.col.lerp(new THREE.Color(EMBER), 0.55); paintRange(this.ring.plates.geometry, this.ring.ranges[i * 2], this.col); }
    }
  }
  dispose() { disposeTree(this.root); }
}

// ---------------------------------------------------------------- the health bar with the hero's face, and the 杀意 ingots
const PORTRAIT = [
  // 斗笠 brim and crown, white blindfold, the face below it, the slate collar
  '.......YY.......', '.....yYYYYy.....', '...yyyyyyyyyy...', '.yyyyyyyyyyyyyy.', 'yyyyyyyyyyyyyyyy', '....kwwwwwwk....', '....wwwwwwww....', '....ssssssss....',
  '....sss..sss....', '.....ssssss.....', '......ssss......', '....bbwwwwbb....', '..bbbbbwwbbbbb..', '.bbbbbbbbbbbbbb.',
];
export interface HpState { hp: number; maxHp: number }
export class IronHp {
  root = new THREE.Group(); st: HpState = { hp: 100, maxHp: 100 }; intent = 0; private x = 30; private y = 40; private k = 1;
  private fill: THREE.Mesh; private fillTop: THREE.Mesh; private lag: THREE.Mesh; private lagV = 1; private ingots: THREE.MeshLambertMaterial[] = [];
  private shakeT = 0; private flashT = 0; private healT = 0; private tt = 0; private lastIntent = 0; readonly W = 250; private X0 = 44;
  constructor(private L: UiLayer, private sparks: UiSparks) {
    const box = (w: number, h: number, d: number, c: number) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(c));
    // the trough
    const frame = box(this.W + 14, 26, 10, IRON_D); frame.position.set(this.X0 + this.W / 2, 0, 0); this.root.add(frame);
    const lipT = box(this.W + 14, 3, 11, IRON_L); lipT.position.set(this.X0 + this.W / 2, 11.5, 0.5); this.root.add(lipT);
    const track = box(this.W, 14, 2, 0x2a0e0c); track.position.set(this.X0 + this.W / 2, 0, 5.2); this.root.add(track);
    this.lag = box(1, 14, 2, 0xf0e2c8); this.lag.position.z = 5.6; this.root.add(this.lag);
    this.fill = box(1, 14, 2, 0xc8302a); this.fill.position.z = 6; this.root.add(this.fill);
    this.fillTop = box(1, 3, 2, 0xe8644a); this.fillTop.position.set(0, 5, 6.3); this.root.add(this.fillTop);
    this.root.add(new THREE.Mesh(mergeBoxes(Array.from({ length: 9 }, (_, i) => ({ w: 2, h: 14, d: 2, x: this.X0 + ((i + 1) * this.W) / 10, y: 0, z: 6.6, c: 0x14151a }))).geo, vcMat()));
    const end = box(12, 34, 14, IRON); end.position.set(this.X0 + this.W + 8, 0, 1); this.root.add(end);
    const endR = box(6, 6, 6, BRONZE); endR.position.set(this.X0 + this.W + 8, 0, 8); this.root.add(endR);
    // the portrait medallion
    const med = new THREE.Mesh(octCyl(32, 12), lam(IRON_D)); med.position.set(14, 0, 2); this.root.add(med);
    const medRim = new THREE.Mesh(octCyl(29, 13), lam(IRON)); medRim.position.set(14, 0, 3); this.root.add(medRim);
    const face = new THREE.Mesh(new THREE.CircleGeometry(24, 8, Math.PI / 8), lam(0xffffff, pixTex(PORTRAIT, '#5a1a16'))); face.position.set(14, 0, 9.6); this.root.add(face);
    this.root.add(new THREE.Mesh(mergeBoxes(Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; return { w: 4, h: 4, d: 4, x: 14 + Math.cos(a) * 27, y: Math.sin(a) * 27, z: 10, c: BRONZE }; })).geo, vcMat()));
    // three 杀意 ingots under the trough
    for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(20, 10, 8), lam(0x2a2c32)); m.position.set(this.X0 + 16 + i * 28, -22, 2); this.root.add(m); this.ingots.push(m.material as THREE.MeshLambertMaterial); }
    this.root.userData.noTilt = true; this.root.rotation.set(-0.22, 0.18, 0);
    L.scene.add(this.root);
  }
  place(x: number, y: number, k: number) { this.x = x; this.y = y; this.k = k; }
  set(s: Partial<HpState>) { Object.assign(this.st, s); }
  hit(dmg: number, s?: Partial<HpState>) { if (s) this.set(s); this.shakeT = 0.3; this.flashT = 0.25; void dmg; }
  heal(s?: Partial<HpState>) { if (s) this.set(s); this.healT = 0.5; this.sparks.burst(this.L.at(this.x + (this.X0 + this.W * 0.5) * this.k, this.y, 6), 14, this.L.px(120), this.L.px(5), 0x7aff9a, { life: 0.6, up: this.L.px(140) }); cue('heal', 0.6); }
  textAt() { return { x: this.x + (this.X0 + this.W + 24) * this.k, y: this.y - 8 * this.k }; }
  update(dt: number) {
    const L = this.L, f = Math.max(0, Math.min(1, this.st.hp / Math.max(1, this.st.maxHp))); this.tt += dt;
    this.shakeT = Math.max(0, this.shakeT - dt); this.flashT = Math.max(0, this.flashT - dt); this.healT = Math.max(0, this.healT - dt);
    const sx = this.shakeT > 0 ? Math.sin(this.shakeT * 90) * 4 * this.shakeT / 0.3 : 0;
    L.at(this.x + sx, this.y, 0, this.root.position); this.root.scale.setScalar(L.px(this.k));
    this.lagV = Math.max(f, this.lagV - dt * 0.5);
    const W = this.W, X = this.X0;
    this.fill.scale.x = Math.max(0.001, W * f); this.fill.position.x = X + (W * f) / 2;
    this.fillTop.scale.x = Math.max(0.001, W * f); this.fillTop.position.x = X + (W * f) / 2;
    this.lag.scale.x = Math.max(0.001, W * this.lagV); this.lag.position.x = X + (W * this.lagV) / 2;
    const fm = this.fill.material as THREE.MeshLambertMaterial, low = f < 0.3 ? 0.35 + 0.35 * Math.sin(this.tt * 8) : 0;
    fm.emissive.setHex(this.flashT > 0 ? 0xffffff : this.healT > 0 ? 0x2a8a3a : 0xff2a1a); fm.emissiveIntensity = this.flashT > 0 ? this.flashT * 2.5 : this.healT > 0 ? 1 : low;
    // the 杀意 ingots: lit ones glow like coals; a new one flares
    if (this.intent > this.lastIntent) this.sparks.burst(L.at(this.x + (X + 16 + (this.intent - 1) * 28) * this.k, this.y + 22 * this.k, 6), 12, L.px(110), L.px(4), 0xffa040, { life: 0.4 });
    this.lastIntent = this.intent;
    this.ingots.forEach((m, i) => { const on = i < this.intent; m.color.setHex(on ? 0xd09a50 : 0x2a2c32); m.emissive.setHex(EMBER); m.emissiveIntensity = on ? (this.intent >= 3 ? 0.6 + 0.35 * Math.sin(this.tt * 9) : 0.45) : 0; });
  }
  dispose() { disposeTree(this.root); }
}

// ---------------------------------------------------------------- the QTE ring round the cut button (绝·一刀)
export class QteRing {
  private m: THREE.Mesh; private mat: THREE.MeshBasicMaterial;
  constructor(private L: UiLayer) {
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
    this.m = new THREE.Mesh(new THREE.RingGeometry(0.46, 0.5, 8, 1, Math.PI / 8), this.mat); this.m.visible = false; this.m.renderOrder = 40; this.m.userData.noTilt = true;
    L.scene.add(this.m);
  }
  /** k: 0 = just opened (wide) → 1 = on the button; hit = the moment to press (brighter) */
  show(x: number, y: number, size: number, k: number, hit: boolean) {
    this.m.visible = true; const s = size * (1 + 2.2 * Math.max(0, 1 - k));
    this.L.at(x, y, 6, this.m.position); this.m.scale.setScalar(this.L.px(s));
    this.mat.color.setHex(hit ? 0xfff0b0 : 0xffb040); this.mat.opacity = hit ? 1 : 0.75;
  }
  hide() { this.m.visible = false; }
}
