// 铁器界面第二版（act-09 用户：「UI风格我比较喜欢铁那一套，但是我感觉做得还不够好，有点单调，然后按钮上不要摆文字。血条也很抽象。」）
//   技能钮：一面有层次的小铁盾——黑铁底盘、外圈八片凸起的甲片（甲片间铜钉）、中间一块铁心；图形是单独的立体小模型浮在上面（不放字）：
//           斩 = 竖着的环首刀，冲 = 一只脚印带风线，跳 = 两层向上的折角，技（残影）= 三个错开的人影。
//           冷却：甲片像钟面一样一片片重新亮回来（从正上方顺时针）；蓄力：甲片从下往上烧红；转好 / 反击待发：甲片泛炉火橙光。
//           斩钮下面垂一条红布穗，跟着晃。
//   摇杆：铁环底座一圈甲片、四颗铜钉；摇杆头是一个环首刀的铜环。
//   血条：左边一个八角铁框，里面是主角头像（斗笠、白蒙眼）；右边一条铁槽，红色的血、白色拖尾、每一成一道刻痕；
//         槽下三颗铜锭 = 杀意，满一格烧亮一颗。
// 全是 UI 层里的 3D 实物，贴图逐像素画（横平竖直，不撒随机点）。
import { batchUi } from '../engine/rigidBatch';
import * as THREE from 'three';
import { digitsCanvas } from '../ui3d/pixfont';
import type { Model3D } from '../ui3d/models3d';
import { btnIcon3D } from './icons3d';
import { isLinkIcon, skillIcon3D } from './skillIcons';
import { LINK_COLORS, STANCE_COLORS, type LinkIcon } from './skillInfo';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { UiLayer } from '../ui3d/layer';
import { UiSparks } from '../ui3d/vox';
import { cue } from '../../audio/cues';
import type { BtnKey } from './skin';

const IRON = 0x4a4f5a, IRON_D = 0x1e2026, IRON_L = 0x6c7380, BRONZE = 0xb07a3a, EMBER = 0xff7a2a;
const lam = (c: number, t?: THREE.Texture) => new THREE.MeshLambertMaterial({ color: c, map: t ?? null, emissive: t ? 0xffffff : 0x000000, emissiveMap: t ?? null, emissiveIntensity: t ? 0.5 : 0 });
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
/** A link shares its icon and colour with the skill pages. */
export type HintKey = LinkIcon | 'talk';
type FaceKey = HintKey | keyof typeof STANCE_COLORS;
const LINK_FLIP_S = 0.18, LINK_GLOW_S = 0.35;

const ICONS: Record<BtnKey, string[]> = {
  // act-29 (用户：「ICON的品质」): about twice the old resolution, each material in two or three tones with a lit edge
  // a ring-pommel sabre standing up: the bronze ring, red-wrapped grip, a bronze guard, the blade (white edge, steel, dark spine)
  attack: ol([
    '..ooooo..', '.ohhhhdo.', '.oh...do.', '.oh...do.', '.od...do.', '.oddddddo', '..ooooo..', '....d....', '...rRr...', '...RrR...', '...rRr...', '...RrR...',
    '...rRr...', '...RrR...', '.dooooodd', '..hoood..', '...wsk...', '...wsk...', '...wsk...', '...wsk...', '...wsk...', '...wsk...', '...wsk...', '...wsk...',
    '...wsk...', '...wsk...', '...wsk...', '...ws....', '...w.....']),
  // a boot stepping right with three wind lines behind it
  dash: ol([
    '............oooo...', '...........ohhhoo..', '...........ohoood..', 'hhhhhh.....ohoood..', '...........ooooo...', '.hhhhhhhh..oooood...', '...........ooooooo..',
    'hhhhh.....oooooooooo', '..........dddddddddd', '...................']),
  // two up-chevrons over a ground bar, lit on their upper edges
  jump: ol([
    '......oo......', '....oohhoo....', '..oohh..ddoo..', 'oohh......ddoo', '..............', '......oo......', '....oohhoo....', '..oohh..ddoo..', 'oohh......ddoo',
    '..............', '..............', 'dddddddddddddd']),
  // a 柳叶镖 point up: the leaf blade (white edge, steel, dark spine), the neck, the bronze ring, a red tassel hanging below
  special: ol([
    '....w....', '...wsk...', '...wsk...', '..wwskk..', '..wwskk..', '..wwskk..', '..wwskk..', '...wsk...', '...wsk...', '....k....', '...ooo...', '..oh.do..',
    '..oh.do..', '...ooo...', '...rRr...', '..rRrRr..', '..rRrRr..', '.rRr.rRr.', '.r.r.r.r.']),
  ult: [],   // (11-18: 不见刀's button carries its voxel picture — skillIcons 'ult' — not a pixel badge)
};
/** act-29: the 'talk' picture for the cut button at the hideout: a bronze speech bubble with three dots */
const TALK_ICON = ol(['.ooooooooooo.', 'ohhhhhhhhhhho', 'oh.........do', 'oh.r..r..r.do', 'oh.........do', 'odddddddddddo', '.oooo.oooooo.', '...ood.......', '...od........', '...o.........'].map(r => r.padEnd(13, '.')));
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
const ICON_COL: Record<string, number> = { '#': 0x121318, o: 0xc08a44, h: 0xf0c070, d: 0x7a5428, r: 0xb8302a, R: 0x7a1814, w: 0xeef2f6, s: 0xa8b2be, k: 0x56606c };
/** act-29: a hint picture as a small relief token in the move's colour, outlined dark (the old badge was a flat square sticker) */
function hintVox(rows: string[], col: number) {
  const r2 = ol(rows.map(r => r.replace(/#/g, 'h'))), H = r2.length, W = Math.max(...r2.map(r => r.length)), s = 1 / Math.max(W, H), boxes: BoxSpec[] = [];
  const lite = new THREE.Color(col).lerp(new THREE.Color(0xffffff), 0.35).getHex();
  r2.forEach((row, y) => { for (let x = 0; x < W; x++) { const ch = row[x]; if (!ch || ch === '.') continue; const d = ch === '#' ? 2 : 3; boxes.push({ w: s, h: s, d: d * s, x: (x - W / 2 + 0.5) * s, y: (H / 2 - y - 0.5) * s, z: (d * s) / 2, c: ch === '#' ? 0x15161c : (y < H / 2 ? lite : col) }); } });
  return new THREE.Mesh(mergeBoxes(boxes).geo, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: col, emissiveIntensity: 0.35 }));
}
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
  root = new THREE.Group(); iconG = new THREE.Group(); x = 0; y = 0; size = 80; down = false; pid: number | null = null; cd = 0; charge = 0; hot = false;
  /** a flash of white (the 见切 moment while holding the stance) */
  now = false;
  /** a move link open on this button right now (null = none) */
  hint: HintKey | null = null; /** which side the badge pops up on (−1 upper left, +1 upper right: the big cut button has the jump button at its upper left) */ badgeSide: -1 | 1 = -1; private badge: THREE.Mesh | null = null; private badgeKey: HintKey | null = null; private badgeK = 0; private badgePop = 1;
  /** charges left / the most (the dart button: three bronze lamps on an arc over the shield); max 0 = none */
  pips = 0; pipMax = 0; private pipMeshes: THREE.Mesh[] = [];
  /** 11-17 气 (the cut button: three lamps on its upper-right shoulder, toward the screen's edge — above it sits the dart button and its
   *  label). Each lamp is a dark socket with a lit core that grows with its share (a lamp half-filled reads half-lit). pipArc: the
   *  middle lamp's angle from straight up (clockwise) and the step between lamps; pipCol / pipGlow: the lit core; pipHold: one bar is
   *  staked (the stance) — the lamp it will take blinks */
  pipArc: [number, number] = [0, 0.32]; pipCol = 0xf0c070; pipGlow = 0x6a4010; pipSize = 0.1; pipR = 0.64; pipHold = false;
  private pipCores: THREE.Mesh[] = []; private pipPrev = -1; private pipPopI = -1; private pipPopT = 0; private pipOutI = -1; private pipOutT = 0; private pipGainT = 0; private pipDenyT = 0;
  /** refused (11-17: a hold for the stance with less than a bar of 气): the shake and dull red of a press that cannot act, and the lamps go dull red */
  deny() { this.denyT = 0.32; this.pipDenyT = 0.45; }
  private ring: ReturnType<typeof plateRing>; private icon: Model3D; private linkT = 0; private shadow: THREE.Mesh; private tassel: THREE.Mesh | null = null;
  private pressK = 0; private flashT = 0; private wasReady = true; private tt = 0; private wasFull = false; private lift = 6; private popT = 1;
  /** act-29 (用户：「UI组件的各种状态、动效的切换、特效的提示」): a spring on the button's size (press sinks, release overshoots), a
   *  shake + dull red when pressed while it cannot act, a run of light round the plates when it comes ready, a kick from the game
   *  (a cut lands, a perfect dodge) in a colour, and the dart button leaning toward where it is being aimed */
  private sc = 1; private scV = 0; private wasDown = false; private denyT = 0; private sweepT = 1; private kickT = 0; private kickCol = new THREE.Color(0xffffff);
  aim: { x: number; y: number } | null = null; private tiltX = 0; private tiltY = 0;
  /** the hideout: the cut button is the 'talk' button while someone is near (its picture swaps to a speech bubble) */
  talk = false;
  /** act-35 (用户：「按钮的切换直接替换按钮里面的，不要在外面额外闪个图标出来」): the picture inside the button swaps — to the speech
   *  bubble at the hideout, to the open link's move in a fight — and swaps back; one model per key, made once */
  qteOn = false; private alts = new Map<FaceKey, Model3D>(); private altKey: FaceKey | null = null; private altK = 0;
  kick(k: number, col = 0xfff2d0) { this.scV += 1.6 * k; this.kickT = 0.18 + 0.1 * k; this.kickCol.setHex(col); }
  private col = new THREE.Color(); private ember = new THREE.Color(EMBER); private dark = new THREE.Color(0x24262c); private base = new THREE.Color(IRON);
  constructor(private L: UiLayer, public name: BtnKey, private sparks: UiSparks) {
    const back = new THREE.Mesh(octCyl(0.5, 0.12), lam(IRON_D)); this.root.add(back);
    const rim = new THREE.Mesh(octCyl(0.47, 0.14), lam(0x30333b)); rim.position.z = 0.01; this.root.add(rim);
    // the socket the picture floats over: a darker recessed octagon
    const sock = new THREE.Mesh(new THREE.CircleGeometry(0.3, 8, Math.PI / 8), lam(0x24272e)); sock.position.z = 0.085; this.root.add(sock);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.2, 8, Math.PI / 8), new THREE.MeshBasicMaterial({ color: 0x07080a, transparent: true, opacity: 0.5, depthWrite: false }));
    this.shadow.position.z = 0.088; this.root.add(this.shadow);
    this.ring = plateRing(0.39, 0.09, 0.27); this.root.add(this.ring.plates, this.ring.rivets);
    if (name === 'attack') { this.pipArc = [1.25, 0.38]; this.pipCol = 0xd6f4ec; this.pipGlow = 0x48a892; this.pipSize = 0.115; this.pipR = 0.6; }
    if (name === 'attack') {
      const t = mergeBoxes([{ w: 0.08, h: 0.08, d: 0.08, x: 0, y: 0, z: 0, c: BRONZE }, { w: 0.045, h: 0.3, d: 0.03, x: -0.03, y: -0.18, z: 0, c: 0xb8302a }, { w: 0.045, h: 0.3, d: 0.03, x: 0.03, y: -0.18, z: 0, c: 0xa02820 }]);
      this.tassel = new THREE.Mesh(t.geo, vcMat()); this.tassel.position.set(0, -0.5, 0.04); this.root.add(this.tassel);
    }
    // act-29 (用户：「对齐一下我dicehero3D那版的UI品质，特别是3D icon的品质」): the thick voxel badges of dicehero3d's models3d
    this.icon = name === 'ult' ? skillIcon3D('ult') : btnIcon3D(name); this.iconG.add(this.icon);   // (11-18: 不见刀's own button)
    L.scene.add(this.root); L.scene.add(this.iconG); batchUi(this.root); batchUi(this.iconG);
  }
  hit(x: number, y: number) { const r = this.size * 0.6; return Math.abs(x - this.x) < r && Math.abs(y - this.y) < r; }
  update(dt: number) {
    const L = this.L; this.tt += dt;
    // the charge lamps: built once the button is told how many there are; lit bronze = a dart in hand, dark = spent
    if (this.pipMax > 0 && this.pipMeshes.length !== this.pipMax) {
      for (const m of [...this.pipMeshes, ...this.pipCores]) { m.parent?.remove(m); m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
      this.pipMeshes = []; this.pipCores = [];
      const z = this.pipSize;
      for (let i = 0; i < this.pipMax; i++) {
        const d = this.pipArc[0] + (i - (this.pipMax - 1) / 2) * this.pipArc[1], m = new THREE.Mesh(new THREE.BoxGeometry(z, z, 0.06), new THREE.MeshLambertMaterial({ color: 0x1c1d22 }));
        m.position.set(Math.sin(d) * this.pipR, Math.cos(d) * this.pipR, 0.05); m.rotation.z = -d; this.root.add(m); this.pipMeshes.push(m);
        // the core: grows up from the socket's floor with the lamp's share
        const c = new THREE.Mesh(new THREE.BoxGeometry(z * 0.78, z * 0.78, 0.07).translate(0, z * 0.39, 0), new THREE.MeshLambertMaterial({ color: this.pipCol })); c.position.set(0, -z * 0.39, 0.012); m.add(c); this.pipCores.push(c);
      }
    }
    if (this.pipMax > 0) {
      const v = Math.max(0, Math.min(this.pipMax, this.pips)), prev = this.pipPrev < 0 ? v : this.pipPrev, full = Math.floor(v + 1e-6), pfull = Math.floor(prev + 1e-6);
      if (full > pfull) { this.pipPopI = full - 1; this.pipPopT = 0.32; }            // a lamp comes full: it swells, a touch of white
      else if (v < prev - 0.5) { this.pipOutI = pfull - 1; this.pipOutT = 0.35; }    // a bar spent: that lamp flares and goes out
      if (v > prev + 1e-4) this.pipGainT = 0.22;                                       // any gain: the filling lamp brightens a moment
      this.pipPrev = v; this.pipPopT = Math.max(0, this.pipPopT - dt); this.pipOutT = Math.max(0, this.pipOutT - dt); this.pipGainT = Math.max(0, this.pipGainT - dt); this.pipDenyT = Math.max(0, this.pipDenyT - dt);
      const holdI = this.pipHold ? full - 1 : -1, lit = new THREE.Color(this.pipCol), glow = new THREE.Color(this.pipGlow);
      this.pipMeshes.forEach((m, i) => {
        const f = Math.max(0, Math.min(1, v - i)), c = this.pipCores[i], mt = c.material as THREE.MeshLambertMaterial, sm = m.material as THREE.MeshLambertMaterial;
        c.visible = f > 0.02 || i === this.pipOutI && this.pipOutT > 0; c.scale.set(1, Math.max(0.05, i === this.pipOutI && this.pipOutT > 0 ? 1 : f), 1);
        const filling = f > 0 && f < 1;
        mt.color.copy(lit).multiplyScalar(f >= 1 ? 1 : 0.62); mt.emissive.copy(glow).multiplyScalar(f >= 1 ? 1 : 0.35 + (filling && this.pipGainT > 0 ? this.pipGainT * 2.5 : 0));
        if (i === holdI) { const b = 0.5 + 0.5 * Math.sin(this.tt * 22); mt.emissive.copy(glow).multiplyScalar(0.4 + 1.6 * b); mt.color.copy(lit).lerp(WHITE, 0.35 * b); }
        if (i === this.pipOutI && this.pipOutT > 0) { const k = this.pipOutT / 0.35; mt.color.copy(lit).lerp(WHITE, 0.6 * k); mt.emissive.copy(glow).multiplyScalar(2 * k); c.scale.y = Math.max(0.05, k); }
        sm.color.setHex(0x1c1d22); if (this.pipDenyT > 0) sm.color.lerp(DENY, Math.min(1, this.pipDenyT * 4) * 0.8);
        const pop = i === this.pipPopI && this.pipPopT > 0 ? Math.sin((1 - this.pipPopT / 0.32) * Math.PI) * 0.35 : 0;
        if (pop > 0) mt.color.lerp(WHITE, pop);
        m.scale.setScalar((f >= 1 ? 1 : 0.86) + pop);
      });
    }
    this.pressK += ((this.down ? 1 : 0) - this.pressK) * Math.min(1, dt * 30);
    const ready = this.cd <= 0, frac = Math.max(0, Math.min(1, this.cd)), ch = Math.max(0, Math.min(1, this.charge)), full = ch >= 1;
    if (this.down && !this.wasDown && !ready) this.denyT = 0.32;   // pressed while it cannot act
    if (!this.down && this.wasDown) this.scV += 0.8;               // let go: the rebound
    this.wasDown = this.down;
    // the spring: pressed sinks to 0.9, otherwise back to 1 with an overshoot
    { const t = this.down ? 0.9 : 1, d = Math.min(dt, 1 / 30); this.scV += (420 * (t - this.sc) - 18 * this.scV) * d; this.sc += this.scV * d;
      // act-34 (用户：「按钮穿模了」): every hit and every link opening added to the spring with no ceiling, so a run of hits swelled the
      // attack button into the dart button above it — the scale now stays within 0.88..1.08 and the kicks are half what they were
      if (this.sc > 1.08) { this.sc = 1.08; this.scV = Math.min(0, this.scV); } else if (this.sc < 0.88) { this.sc = 0.88; this.scV = Math.max(0, this.scV); } }
    this.denyT = Math.max(0, this.denyT - dt); this.kickT = Math.max(0, this.kickT - dt); this.sweepT = Math.min(1, this.sweepT + dt / 0.32);
    const deny = this.denyT > 0 ? Math.sin(this.denyT * 70) * (this.denyT / 0.32) : 0;
    L.at(this.x + deny * 5, this.y, -this.pressK * 4, this.root.position); this.root.scale.setScalar(L.px(this.size) * this.sc);
    // aimed (the dart button dragged): the face leans toward the aim
    { const ax = this.aim?.x ?? 0, ay = this.aim?.y ?? 0, kk = Math.min(1, dt * 14); this.tiltX += (-ay * 0.32 - this.tiltX) * kk; this.tiltY += (ax * 0.32 - this.tiltY) * kk; this.root.rotation.set(this.tiltX, this.tiltY, deny * 0.08); }
    // (act-35, 用户：「派生ui闪光太严重了，眼睛都要闪瞎了」: no spark bursts on the buttons any more — the dash comes ready every half
    //  second when it is spammed, and every one of them flashed)
    this.wasFull = full;
    if (ready && !this.wasReady) { this.flashT = 0.3; this.popT = 0; this.sweepT = 0; this.scV += 0.6; }   // no 'ready' tick (buttons are silent)
    this.wasReady = ready; this.flashT = Math.max(0, this.flashT - dt); this.popT = Math.min(1, this.popT + dt / 0.5);
    const altKey: FaceKey | null = this.talk ? 'talk' : this.qteOn ? 'ult' : this.now ? 'parry' : ch > 0 ? 'stance' : this.hint;
    const link = altKey != null && altKey !== 'talk' && isLinkIcon(altKey);
    const hc = altKey && !link && !this.now ? FACE_COLS[altKey] : null;
    const pulse = 0.5 + 0.5 * Math.sin(this.tt * 12), geo = this.ring.plates.geometry;
    for (let i = 0; i < 8; i++) {
      // cool-down: the plates come back one by one like a clock face from the top; charge: they heat up from the bottom
      const lit = ready || i / 8 < 1 - frac;
      const fromBottom = (4 - Math.abs(i - 4)) / 4, heat = ch > 0 ? Math.max(0, Math.min(1, (ch - (1 - fromBottom) * 0.85) * 3)) : 0;
      const glow = this.now ? 0.9 : hc ? (altKey === 'talk' ? 0.42 : altKey === 'stance' ? heat : 1.12) : this.flashT > 0 ? Math.min(0.5, this.flashT * 1.6) : (this.hot && !link) || full ? 0.45 + 0.4 * pulse : heat;
      this.col.copy(lit ? this.base : this.dark).lerp(this.now ? WHITE : hc ?? this.ember, lit ? glow * 0.8 : 0);
      // the next plate to come back while cooling: a dim ember edge (you can see where it is)
      if (!lit && i / 8 < 1 - frac + 1 / 8) this.col.lerp(this.ember, 0.22 + 0.12 * pulse);
      // came ready: a run of light round the plates from the top, clockwise
      if (this.sweepT < 1) { const at = this.sweepT * 9 - 0.5, w = Math.max(0, 1 - Math.abs(i - at)); this.col.lerp(WHITE, w * 0.25); }   // (act-34 / 35: 「太闪了」— a faint run of light)
      if (this.kickT > 0) this.col.lerp(this.kickCol, Math.min(1, this.kickT * 4) * 0.5);
      if (this.denyT > 0) this.col.lerp(DENY, Math.min(1, this.denyT * 4) * 0.6);
      paintRange(geo, this.ring.ranges[i * 2], this.col);
    }
    if (this.tassel) this.tassel.rotation.z = Math.sin(this.tt * 2.1) * 0.14 + Math.sin(this.tt * 5.3) * 0.04;
    // 11-18 (用户：「那个圈有点丑」): the shield keeps its iron colour. Turn the icon to its edge before changing the visible face.
    const wasFace = this.altK >= 0.5 ? this.altKey : null;
    const wasLink = this.altKey != null && this.altKey !== 'talk' && isLinkIcon(this.altKey);
    const flip = link || wasLink ? LINK_FLIP_S : 0.14;
    if (altKey && !this.altKey && !link) this.scV += 0.9;
    if (altKey && this.altK < 0.5) this.altKey = altKey;
    if (altKey && this.altKey !== altKey) {
      this.altK = Math.max(0.5, this.altK - dt / (flip / 2));
      if (this.altK === 0.5) { this.altKey = altKey; if (!link) this.scV += 0.5; }
    } else this.altK = Math.max(0, Math.min(1, this.altK + (altKey ? 1 : -1) * dt / flip));
    if (!altKey && this.altK === 0) this.altKey = null;
    if (this.altKey && !this.alts.has(this.altKey)) {
      const key = this.altKey, m = key === 'talk' ? btnIcon3D('talk') : skillIcon3D(key);
      m.rotation.y = Math.PI; this.alts.set(key, m); this.iconG.add(m);
    }
    const face = this.altK >= 0.5 ? this.altKey : null;
    // act-37 (用户：「可派生的时候还是要亮一下，只不过不能太亮了」): start the one-shot when the new face first shows.
    this.linkT = face && face !== wasFace ? LINK_GLOW_S : Math.max(0, this.linkT - dt);
    const lk = (this.linkT / LINK_GLOW_S) ** 2, e = this.altK * this.altK * (3 - 2 * this.altK);

    // the floating picture: lift by state, bob, a hop-and-turn when it comes ready, pressed back onto the plate
    const k = Math.min(1, dt * 10), hotK = (this.hot && !link) || full || this.now;
    const liftT = this.down ? 1 : !ready ? 2 : hotK ? 15 + 3 * Math.sin(this.tt * 6) : 7;
    this.lift += (liftT - this.lift) * k;
    const pop = this.popT < 1 ? Math.sin(this.popT * Math.PI) * 12 : 0, bob = Math.sin(this.tt * 2.6 + this.x * 0.01) * 1.6;
    const timingCue = altKey === 'parry' || altKey === 'ult';
    // The larger icon needs room as it turns edge-on. Keep the plates and socket still underneath it.
    const liftPx = link || wasLink ? this.size * 0.11 * Math.sin(e * Math.PI) : timingCue ? 6 : 0;
    if (timingCue) L.at(this.x + deny * 5, this.y, this.root.position.z + L.px(6), this.root.position);
    // Move along the icon's view ray. Changing only z pulls a thick model off-centre on the slanted shield.
    const iconZ = L.px(this.size * 0.36 + (this.lift + pop) * 1.2 + liftPx);
    L.at(this.x + deny * 5, this.y - (this.lift * 0.35 + pop + bob) * (this.size / 100), iconZ, this.iconG.position);
    const isz = this.size * 0.6 * (1 - 0.08 * this.pressK) * (ready ? 1 : 0.92);
    this.iconG.scale.setScalar(L.px(isz, iconZ));
    const spin = this.popT < 1 ? (1 - Math.cos(this.popT * Math.PI)) * Math.PI : 0;
    // (act-40 用户：「普通攻击的ICON模型还是穿模的，面向玩家屏幕这边的倾斜角度还是不够」: the picture turned square to the camera
    //  first — the buttons sit low and right, so a picture upright on the face leant back in the perspective — then the small sway,
    //  half what it was, so the long sabre's ends no longer swing into the plates)
    this.iconG.lookAt(L.camera.position);
    this.iconG.rotateX(this.tiltX * 0.6); this.iconG.rotateY(Math.sin(this.tt * 0.8 + this.x * 0.02) * 0.14 * (this.aim ? 0.2 : 1) + spin + this.tiltY * 0.6);
    if (this.aim) this.iconG.rotateZ(-Math.atan2(this.aim.x, this.aim.y));
    // dark while cooling; its glowing cells brighter when it is ready to fire, a link is open, or it just came ready
    const linkOpen = !!altKey && altKey !== 'talk';
    this.icon.setDim(ready ? 0 : 0.6);
    this.icon.setGlow(this.now ? 2.6 : linkOpen ? 1 : hotK ? 1.4 + 0.5 * pulse : this.flashT > 0 ? 1 + this.flashT * 1.2 : 1);
    // the shadow on the socket: smaller and fainter as the picture rises
    this.shadow.scale.setScalar(1.15 - Math.min(0.4, this.lift / 40)); (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.55 - Math.min(0.3, this.lift / 50);
    this.iconG.visible = this.root.visible;
    this.iconG.rotateY(Math.PI * e);
    for (const [key, o] of this.alts) {
      o.visible = key === face;
      if (!o.visible) continue;
      const move = key !== 'talk' && isLinkIcon(key);
      o.scale.setScalar(move ? 1.3 : 1.05);
      if (move) {
        // Tint the lit voxels as well: some moves have few emissive cells, and the shape still needs to read at phone size.
        for (const { m } of o.lit) { m.emissive.copy(FACE_COLS[key]); m.emissiveIntensity = 0.13 + 0.14 * lk; }
        o.setGlow(1 + 0.4 * lk);
      } else if (key === 'ult' || key === 'parry') o.setGlow(1 + 1.2 * lk);
    }
    this.icon.visible = !face;
  }
  dispose() { disposeTree(this.root); disposeTree(this.iconG); if (this.badge) disposeTree(this.badge); for (const m of this.alts.values()) m.dispose(); }
}
const WHITE = new THREE.Color(0xfff6e0), DENY = new THREE.Color(0x8a2a20);
const FACE_COLS = Object.fromEntries(Object.entries({ ...LINK_COLORS, ...STANCE_COLORS, talk: 0xf2e8d6 }).map(([k, col]) => [k, new THREE.Color(col)])) as Record<FaceKey, THREE.Color>;

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
    L.scene.add(this.root); batchUi(this.root);
  }
  update(s: { id: number | null; ox: number; oy: number; x: number; y: number }, home: { x: number; y: number }, size: number) {
    const L = this.L, on = s.id !== null, ox = on ? s.ox : home.x, oy = on ? s.oy : home.y;
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
const PORTRAIT_HAT = [
  // 斗笠 brim and crown, white blindfold, the face below it, the slate collar
  '.......YY.......', '.....yYYYYy.....', '...yyyyyyyyyy...', '.yyyyyyyyyyyyyy.', 'yyyyyyyyyyyyyyyy', '....kwwwwwwk....', '....wwwwwwww....', '....ssssssss....',
  '....sss..sss....', '.....ssssss.....', '......ssss......', '....bbwwwwbb....', '..bbbbbwwbbbbb..', '.bbbbbbbbbbbbbb.',
];
/** the white-haired heroine (the default look, 11-17): a red tie on the crown, white hair falling either side, the red blindfold, the red collar */
const PORTRAIT_WHITE = [
  '.......rr.......', '.....wwwwww.....', '...wwwwwwwwww...', '..wwwwwwwwwwww..', '..wwwwwwwwwwww..', '..wRrrrrrrrrRw..', '..wrrrrrrrrrrw..',
  '..wwssssssssww..', '..wwsss..sssww..', '..ww.ssssss.ww..', '..ww..ssss..ww..', '..wwbbrrrrbbww..', '..bbbbbrrbbbbb..', '.bbbbbbbbbbbbbb.',
];
const PORTRAITS: Record<string, string[]> = { slim_hat: PORTRAIT_HAT, slim_white: PORTRAIT_WHITE, fine_hat: PORTRAIT_HAT, fine_white: PORTRAIT_WHITE };
/** which look the HP medallion shows (show.ts sets it from the costume worn) */
export const HP_FACE = { id: 'fine_white' };
/** every HP bar's lost piece (hers, the foes' over their heads, the chief's long bar): flat white, far from the red in lightness.
 *  11-18 (用户：「把血条减少垫背后的那个橙色调整一下……看不太出来扣血的效果」; act-73 反馈：「我要的是所有血条都符合这个逻辑……
 *  垫在后面的我感觉白色效果会更好点」) */
export const HP_LAG = 0xffffff;
/** how long the lost piece holds still after each drop (a flurry piles into one piece) */
export const HP_LAG_HOLD = 0.5;
/** the lost piece's next value: up with the red at once; down only once the hold is out, fast then slowing near the red (about 0.7 s) */
export function closeLag(lag: number, f: number, hold: number, dt: number) {
  return f >= lag ? f : hold > 0 ? lag : Math.max(f, f + (lag - f) * Math.exp(-dt * 4.5) - dt * 0.1);
}
export interface HpState { hp: number; maxHp: number }
export class IronHp {
  root = new THREE.Group(); st: HpState = { hp: 100, maxHp: 100 }; intent = 0; private x = 30; private y = 40; private k = 1;
  private fill: THREE.Mesh; private fillTop: THREE.Mesh; private lag: THREE.Mesh; private lagV = 1; private ingots: THREE.MeshLambertMaterial[] = [];
  /** the lost piece holds still a moment after a blow (HP_LAG_HOLD), then closes in (closeLag) */
  private lagHold = 0;
  private shakeT = 0; private flashT = 0; private healT = 0; private tt = 0; private lastIntent = 0; readonly W = 250; private X0 = 44;
  private ingotMesh: THREE.Mesh[] = []; private ingotPop = 0; private popIdx = -1; private fullT = 0;
  /** act-34 (用户：「血量的字号也再大点。」「血量的文字也要跟着血条有斜度。」): the number is a plane on the bar itself (it tilts with
   *  the piece), its digits drawn at twice the screen's pixels and filtered down (no dropped rows where the tilt resamples them) */
  private num: THREE.Mesh; private numKey = '';
  /** 11-18 (用户：「把游戏中的货币放在头像下面，同样的透视关系。暂停按钮不要了，点头像暂停。」): the medallion and the purse hung under it
   *  are one piece (badge), turned with the bar; a press sinks it, letting go springs it back (the skill buttons' feel), no sound */
  private badge = new THREE.Group(); private purse = new THREE.Group(); private tab: THREE.Mesh[] = []; private coin = new THREE.Group();
  private ironG = new THREE.Group(); private herbG = new THREE.Group();
  private coinNum: THREE.Mesh; private ironNum: THREE.Mesh; private herbNum: THREE.Mesh; private coinKey = ''; private tabR = 60;
  /** the purse's counts (coins + meta iron + meta herb) and coin hop (hud.ts sets these every frame) */
  coins = 0; iron = 0; herb = 0; coinHop = 0;
  /** the finger / mouse is down on the badge */
  down = false; private sc = 1; private scV = 0; private wasDown = false; private pressK = 0; private medRimMat!: THREE.MeshLambertMaterial;
  constructor(private L: UiLayer, private sparks: UiSparks) {
    const box = (w: number, h: number, d: number, c: number) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(c));
    // the trough
    const frame = box(this.W + 14, 26, 10, IRON_D); frame.position.set(this.X0 + this.W / 2, 0, 0); this.root.add(frame);
    const lipT = box(this.W + 14, 3, 11, IRON_L); lipT.position.set(this.X0 + this.W / 2, 11.5, 0.5); this.root.add(lipT);
    const track = box(this.W, 14, 2, 0x2a0e0c); track.position.set(this.X0 + this.W / 2, 0, 5.2); this.root.add(track);
    // the lost piece: a flat colour the UI lights do not warm (the lit cream read as orange against the red)
    this.lag = new THREE.Mesh(new THREE.BoxGeometry(1, 14, 2), new THREE.MeshBasicMaterial({ color: HP_LAG, toneMapped: false })); this.lag.position.z = 5.6; this.root.add(this.lag);
    this.fill = box(1, 14, 2, 0xc8302a); this.fill.position.z = 6; this.root.add(this.fill);
    this.fillTop = box(1, 3, 2, 0xe8644a); this.fillTop.position.set(0, 5, 6.3); this.root.add(this.fillTop);
    this.root.add(new THREE.Mesh(mergeBoxes(Array.from({ length: 9 }, (_, i) => ({ w: 2, h: 14, d: 2, x: this.X0 + ((i + 1) * this.W) / 10, y: 0, z: 6.6, c: 0x14151a }))).geo, vcMat()));
    const end = box(12, 34, 14, IRON); end.position.set(this.X0 + this.W + 8, 0, 1); this.root.add(end);
    const endR = box(6, 6, 6, BRONZE); endR.position.set(this.X0 + this.W + 8, 0, 8); this.root.add(endR);
    // the portrait medallion (in the badge, centred on it: a press scales it about its middle)
    this.badge.position.set(14, 0, 0); this.root.add(this.badge);
    const med = new THREE.Mesh(octCyl(32, 12), lam(IRON_D)); med.position.set(0, 0, 2); this.badge.add(med);
    const medRim = new THREE.Mesh(octCyl(29, 13), lam(IRON)); medRim.position.set(0, 0, 3); this.badge.add(medRim); this.medRimMat = medRim.material as THREE.MeshLambertMaterial;
    const face = new THREE.Mesh(new THREE.CircleGeometry(24, 8, Math.PI / 8), lam(0xffffff, pixTex(PORTRAITS[HP_FACE.id] ?? PORTRAIT_WHITE, '#5a1a16'))); face.position.set(0, 0, 9.6); this.badge.add(face); this.face = face;
    this.badge.add(new THREE.Mesh(mergeBoxes(Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; return { w: 4, h: 4, d: 4, x: Math.cos(a) * 27, y: Math.sin(a) * 27, z: 10, c: BRONZE }; })).geo, vcMat()));
    // the purse: an iron tab hung from the medallion's foot by a short link, a square-holed copper coin set in its left end and the
    // count in the pixel digits beside it (act-19: numbers stay pixel); its length follows the count (the digits never overflow)
    this.badge.add(this.purse);
    const link = box(10, 8, 6, IRON); link.position.set(0, -34, 1); this.purse.add(link);
    for (const [h, d, y, z, c] of [[28, 8, -50, 0, IRON_D], [3, 9, -37.5, 0.5, IRON_L], [20, 2, -50.5, 4.2, 0x1a1412]] as const) { const m = box(1, h, d, c); m.position.set(0, y, z); this.purse.add(m); this.tab.push(m); }
    const cap = box(6, 32, 10, IRON); cap.position.set(0, -50, 1); this.purse.add(cap); this.tab.push(cap);
    const cm = lam(0xd09040), cd = lam(0x5a3a18);
    for (const [w, h, x, y] of [[16, 5, 0, 5.5], [16, 5, 0, -5.5], [5, 6, -5.5, 0], [5, 6, 5.5, 0]] as const) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 4), cm); b.position.set(x, y, 0); this.coin.add(b); }
    const hole = new THREE.Mesh(new THREE.BoxGeometry(6, 6, 2), cd); hole.position.z = -0.5; this.coin.add(hole);
    this.coin.position.set(-14, -50.5, 7); this.purse.add(this.coin);
    this.coinNum = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    this.coinNum.position.set(0, -50, 7); this.coinNum.renderOrder = 31; this.purse.add(this.coinNum);
    // act-118: 残铁 (iron ingot) & 草药/药引 (emerald herb sprig) sit right beside the coin on the same 3D perspective iron tab
    const im = lam(0x9ca6b8), idm = lam(0x4c5260), ie = lam(0xf08c38);
    { const b1 = new THREE.Mesh(new THREE.BoxGeometry(13, 6, 4), idm); b1.position.set(0, -2.5, 0); this.ironG.add(b1);
      const b2 = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 4), im); b2.position.set(0, 2.2, 0.4); this.ironG.add(b2);
      const b3 = new THREE.Mesh(new THREE.BoxGeometry(4, 3.5, 4.4), ie); b3.position.set(3.2, 3.4, 0.6); this.ironG.add(b3); }
    this.ironG.position.set(22, -50.5, 7); this.purse.add(this.ironG);
    this.ironNum = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    this.ironNum.position.set(36, -50, 7); this.ironNum.renderOrder = 31; this.purse.add(this.ironNum);
    const hm = lam(0x5ed88a), hd = lam(0x286a42), hl = lam(0xb4ffd0);
    { const stem = new THREE.Mesh(new THREE.BoxGeometry(3.2, 10, 3.5), hd); stem.position.set(0, -2.5, 0); this.herbG.add(stem);
      const l1 = new THREE.Mesh(new THREE.BoxGeometry(7, 5, 4), hm); l1.position.set(-4.2, 1.8, 0.4); this.herbG.add(l1);
      const l2 = new THREE.Mesh(new THREE.BoxGeometry(7, 5, 4), hm); l2.position.set(4.2, 2.8, 0.4); this.herbG.add(l2);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(4.5, 4.5, 4.4), hl); tip.position.set(0, 5.4, 0.6); this.herbG.add(tip); }
    this.herbG.position.set(58, -50.5, 7); this.purse.add(this.herbG);
    this.herbNum = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    this.herbNum.position.set(72, -50, 7); this.herbNum.renderOrder = 31; this.purse.add(this.herbNum);
    // three 杀意 ingots under the trough
    for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(20, 10, 8), lam(0x2a2c32)); m.position.set(this.X0 + 16 + i * 28, -22, 2); this.root.add(m); this.ingots.push(m.material as THREE.MeshLambertMaterial); this.ingotMesh.push(m); }
    this.num = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    this.num.position.set(this.X0 + this.W / 2, 0.5, 9); this.num.renderOrder = 31; this.root.add(this.num);
    this.root.userData.noTilt = true; this.root.rotation.set(-0.22, 0.18, 0);
    L.scene.add(this.root); batchUi(this.root);
  }
  private face!: THREE.Mesh;
  /** the medallion's picture for a costume (the white-haired one when there is none for it) */
  setFace(id: string) { HP_FACE.id = id; const m = this.face.material as THREE.MeshLambertMaterial; m.map?.dispose(); m.map = pixTex(PORTRAITS[id] ?? PORTRAIT_WHITE, '#5a1a16'); m.needsUpdate = true; }
  place(x: number, y: number, k: number) { this.x = x; this.y = y; this.k = k; }
  set(s: Partial<HpState>) { Object.assign(this.st, s); }
  hit(dmg: number, s?: Partial<HpState>) { if (s) this.set(s); this.shakeT = 0.3; this.flashT = 0.15; this.lagHold = HP_LAG_HOLD; void dmg; }
  heal(s?: Partial<HpState>) { if (s) this.set(s); this.healT = 0.5; this.sparks.burst(this.L.at(this.x + (this.X0 + this.W * 0.5) * this.k, this.y, 6), 14, this.L.px(120), this.L.px(5), 0x7aff9a, { life: 0.6, up: this.L.px(140) }); cue('heal', 0.6); }
  textAt() { return { x: this.x + (this.X0 + this.W + 24) * this.k, y: this.y - 8 * this.k }; }
  barAt() { return { x: this.x + (this.X0 + this.W / 2) * this.k, y: this.y, h: 14 * this.k }; }
  /** the badge (medallion + purse) on the screen: a finger-sized box round both (CSS px), clear of the stick's area far below */
  hitBadge(x: number, y: number) {
    const cx = this.x + 14 * this.k, r = Math.max(26, 38 * this.k);
    return x > cx - r && x < cx + Math.max(r, (this.tabR - 10) * this.k) && y > this.y - r && y < this.y + Math.max(r + 14, 68 * this.k);
  }
  /** the press (sink, spring back past rest, settle — the skill buttons' curve, capped so it never grows into the bar) and the purse:
   *  its count painted on a plane on the tab (it turns with the piece, like the health number), the tab as long as the count */
  private purseFrame(dt: number) {
    const L = this.L, dpr = L.dpr || 1;
    if (!this.down && this.wasDown) this.scV += 0.8; this.wasDown = this.down;
    { const t = this.down ? 0.9 : 1, d = Math.min(dt, 1 / 30); this.scV += (420 * (t - this.sc) - 18 * this.scV) * d; this.sc += this.scV * d;
      if (this.sc > 1.06) { this.sc = 1.06; this.scV = Math.min(0, this.scV); } else if (this.sc < 0.88) { this.sc = 0.88; this.scV = Math.max(0, this.scV); } }
    this.pressK += ((this.down ? 1 : 0) - this.pressK) * Math.min(1, dt * 30);
    this.badge.scale.setScalar(this.sc); this.badge.position.z = -this.pressK * 4;
    this.medRimMat.emissive.setHex(0xffb060); this.medRimMat.emissiveIntensity = 0.18 * this.pressK;
    const shown = Math.max(0, Math.floor(this.coins)), iron = Math.max(0, Math.floor(this.iron)), herb = Math.max(0, Math.floor(this.herb));
    const hot = this.coinHop > 0, cell = Math.max(1, Math.round(3 * this.k * dpr)), ss = 2, key = `${shown}|${iron}|${herb}|${cell}|${hot}`;
    if (key !== this.coinKey) {
      this.coinKey = key;
      const paint = (mesh: THREE.Mesh, txt: string, col: string) => {
        const d = digitsCanvas(txt, cell * ss, col, '#21100e'), mat = mesh.material as THREE.MeshBasicMaterial;
        mat.map?.dispose(); const t = new THREE.CanvasTexture(d.c as HTMLCanvasElement); t.colorSpace = THREE.SRGBColorSpace; t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
        mat.map = t; mat.needsUpdate = true;
        const w = d.w / ss / dpr / this.k, h = d.h / ss / dpr / this.k; mesh.scale.set(w, h, 1);
        return w;
      };
      const wC = paint(this.coinNum, `${shown}`, hot ? '#fff0b0' : '#ffd27a');
      const wI = paint(this.ironNum, `${iron}`, '#f0c488');
      const wH = paint(this.herbNum, `${herb}`, '#98f4b4');
      // lay out coin -> iron -> herb left-to-right on the unified 3D hanging iron bar
      const x0 = -26;
      this.coinNum.position.x = -3 + wC / 2;
      const ix = -3 + wC + 16;
      this.ironG.position.x = ix;
      this.ironNum.position.x = ix + 10 + wI / 2;
      const hx = ix + 10 + wI + 16;
      this.herbG.position.x = hx;
      this.herbNum.position.x = hx + 10 + wH / 2;
      const x1 = Math.max(26, hx + 10 + wH + 6);
      this.tabR = x1 + 14;
      for (const m of this.tab.slice(0, 3)) { m.scale.x = x1 - x0; m.position.x = (x0 + x1) / 2; }
      this.tab[3].position.x = x1 + 2;
    }
    const hop = Math.sin(this.coinHop * Math.PI);
    this.coin.position.y = -50.5 + hop * 3; this.coin.scale.setScalar(1 + 0.25 * hop); this.coin.rotation.y = hop * 0.8;
    this.coinNum.visible = this.ironNum.visible = this.herbNum.visible = this.root.visible;
    this.ironG.visible = this.herbG.visible = this.root.visible;
  }
  update(dt: number) {
    const L = this.L, f = Math.max(0, Math.min(1, this.st.hp / Math.max(1, this.st.maxHp))); this.tt += dt;
    this.shakeT = Math.max(0, this.shakeT - dt); this.flashT = Math.max(0, this.flashT - dt); this.healT = Math.max(0, this.healT - dt);
    const sx = this.shakeT > 0 ? Math.sin(this.shakeT * 90) * 4 * this.shakeT / 0.3 : 0;
    L.at(this.x + sx, this.y, 0, this.root.position); this.root.scale.setScalar(L.px(this.k));
    { // the number: 5-row digits about 19 units tall (the trough is 26), redrawn only when it or the screen scale changes
      const dpr = L.dpr || 1, cell = Math.max(1, Math.round(3.8 * this.k * dpr)), ss = 2, text = `${Math.max(0, Math.round(this.st.hp))} / ${this.st.maxHp}`, key = `${text}|${cell}`;
      if (key !== this.numKey) {
        this.numKey = key; const d = digitsCanvas(text, cell * ss, '#fff0d2', '#21100e'), mat = this.num.material as THREE.MeshBasicMaterial;
        mat.map?.dispose(); const t = new THREE.CanvasTexture(d.c as HTMLCanvasElement); t.colorSpace = THREE.SRGBColorSpace; t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
        mat.map = t; mat.needsUpdate = true; this.num.scale.set(d.w / ss / dpr / this.k, d.h / ss / dpr / this.k, 1);
      }
      this.num.visible = this.root.visible;
    }
    this.purseFrame(dt);
    // the lost piece: stays put while lagHold runs, then closes in (the foes' bars in hud.ts do the same)
    this.lagHold = Math.max(0, this.lagHold - dt); this.lagV = closeLag(this.lagV, f, this.lagHold, dt);
    const W = this.W, X = this.X0;
    this.fill.scale.x = Math.max(0.001, W * f); this.fill.position.x = X + (W * f) / 2;
    this.fillTop.scale.x = Math.max(0.001, W * f); this.fillTop.position.x = X + (W * f) / 2;
    this.lag.scale.x = Math.max(0.001, W * this.lagV); this.lag.position.x = X + (W * this.lagV) / 2;
    const fm = this.fill.material as THREE.MeshLambertMaterial, low = f < 0.3 ? 0.35 + 0.35 * Math.sin(this.tt * 8) : 0;
    // a blow brightens the red, never to white (a white bar matched the lost piece behind it)
    fm.emissive.setHex(this.flashT > 0 ? 0xff3a22 : this.healT > 0 ? 0x2a8a3a : 0xff2a1a); fm.emissiveIntensity = this.flashT > 0 ? 0.3 + this.flashT * 4 : this.healT > 0 ? 1 : low;
    // the 杀意 ingots: lit ones glow like coals; a new one flares
    if (this.intent > this.lastIntent) { this.sparks.burst(L.at(this.x + (X + 16 + (this.intent - 1) * 28) * this.k, this.y + 22 * this.k, 6), 12, L.px(110), L.px(4), 0xffa040, { life: 0.4 }); this.ingotPop = 1; this.popIdx = this.intent - 1; }
    // act-29: the third one in — all three flare white-gold together, a wider burst (不见刀 is ready)
    if (this.intent >= 3 && this.lastIntent < 3) { this.fullT = 0.6; this.sparks.burst(L.at(this.x + (X + 44) * this.k, this.y + 22 * this.k, 6), 26, L.px(190), L.px(5), 0xffe08a, { life: 0.55 }); }
    this.ingotPop = Math.max(0, this.ingotPop - dt * 4); this.fullT = Math.max(0, this.fullT - dt);
    this.lastIntent = this.intent;
    this.ingots.forEach((m, i) => { const on = i < this.intent; m.color.setHex(on ? 0xd09a50 : 0x2a2c32); m.emissive.setHex(this.fullT > 0 ? 0xfff0c0 : EMBER); m.emissiveIntensity = on ? (this.fullT > 0 ? 0.9 : this.intent >= 3 ? 0.6 + 0.35 * Math.sin(this.tt * 9) : 0.45) : 0;
      this.ingotMesh[i].scale.setScalar(i === this.popIdx ? 1 + 0.35 * Math.sin(this.ingotPop * Math.PI) : this.fullT > 0 ? 1 + 0.15 * Math.sin(this.fullT * 10) : 1); });
  }
  dispose() { disposeTree(this.root); }
}

// ---------------------------------------------------------------- the QTE ring round the cut button (绝·一刀)
export class QteRing {
  // 11-18 (用户：「这个光圈的效果我觉得也要优化一下，要变色才行吧，而且要有点光效，不然根本注意不到，也不知道到底什么时机是正确的」):
  // three pieces — a fixed thin gold outline at the button's rim (where the ring must land), the closing ring (dull orange, warming as it
  // closes), and a glow round it. The moment to press: the ring turns bright white-gold and thicker, the glow flashes on and pulses,
  // the outline lights up; past the window it all goes out
  private m: THREE.Mesh; private mat: THREE.MeshBasicMaterial; private glow: THREE.Mesh; private glowMat: THREE.MeshBasicMaterial;
  private tgt: THREE.Mesh; private tgtMat: THREE.MeshBasicMaterial; private was = false; private t = 0; private flash = 0;
  private c0 = new THREE.Color(0xffd870); private c1 = new THREE.Color(0xfff6d8);
  constructor(private L: UiLayer) {
    const basic = (c: number, add = false) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, ...(add ? { blending: THREE.AdditiveBlending } : {}) });
    this.mat = basic(0xffdc78); this.glowMat = basic(0xffe498, true); this.tgtMat = basic(0xffe69a);
    this.m = new THREE.Mesh(new THREE.RingGeometry(0.46, 0.5, 8, 1, Math.PI / 8), this.mat);
    this.glow = new THREE.Mesh(new THREE.RingGeometry(0.44, 0.535, 8, 1, Math.PI / 8), this.glowMat);
    this.tgt = new THREE.Mesh(new THREE.RingGeometry(0.485, 0.5, 8, 1, Math.PI / 8), this.tgtMat);
    for (const [o, r] of [[this.glow, 39], [this.tgt, 40], [this.m, 41]] as Array<[THREE.Mesh, number]>) { o.visible = false; o.renderOrder = r; o.userData.noTilt = true; L.scene.add(o); }
  }
  /** act-115: countdown opportunity ring — bright gold & pressable from frame 0 (k: 0 → 1); urgent = last 30% pulses faster */
  show(x: number, y: number, size: number, k: number, urgent: boolean, dt = 1 / 60) {
    this.t += dt; if (!this.was) this.flash = 1; this.was = true; this.flash = Math.max(0, this.flash - dt * 4);
    const s = size * (1 + 1.85 * Math.max(0, 1 - k)), thick = urgent ? 1.14 : 1.06;
    for (const o of [this.m, this.glow, this.tgt]) this.L.at(x, y, 6, o.position);
    this.m.visible = true; this.m.scale.set(this.L.px(s) * thick, this.L.px(s) * thick, 1);
    if (urgent) this.mat.color.setHex(0xfff6d8); else this.mat.color.copy(this.c0).lerp(this.c1, Math.min(1, Math.max(0, k)));
    this.mat.opacity = urgent ? 0.96 : 0.85 + 0.1 * Math.min(1, k);
    this.glow.visible = true; this.glow.scale.setScalar(this.L.px(s) * (1.02 + 0.08 * this.flash));
    this.glowMat.opacity = Math.min(0.32, (urgent ? 0.2 + 0.08 * Math.sin(this.t * 32) : 0.12 + 0.05 * Math.sin(this.t * 16)) + 0.12 * this.flash);
    this.tgt.visible = true; this.tgt.scale.setScalar(this.L.px(size));
    this.tgtMat.color.setHex(urgent ? 0xfff6d0 : 0xffe088); this.tgtMat.opacity = urgent ? 0.95 : 0.72;
  }
  hide() { this.m.visible = false; this.glow.visible = false; this.tgt.visible = false; this.was = false; this.flash = 0; }
}
