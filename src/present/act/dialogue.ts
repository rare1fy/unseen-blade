// 立绘对话（act-20，用户：「对话就弄立绘对话的形式，不要用timeline演对话」；立绘风格是另一会话用户定的：老《三国志》街机、
// 《吞食天地》《三国战纪》式的原创街机手绘像素立绘，见 docs/art/ART_DIRECTION.md 第 10 节）：
// 底部一块深色底、细金红像素边的对话框（3D 薄板，UI 层），金色名字、米白正文、点阵字逐字显示；主角立绘在左，对方在右，
// 说话的一方亮、抬一点，另一方暗下去；立绘按整数倍放大保持像素清楚；场景照常看得见（不加全屏暗罩）。
// 点 / 回车 / 斩：先把这句显示完，再点下一句。冯铁臂是哑巴，他的「台词」是动作，用灰色写。
import * as THREE from 'three';
import type { UiLayer } from '../ui3d/layer';
import { text, textW } from '../v2/overlay';
import { bodyText, bodyW, BODY_FONT } from '../ui3d/bodyFont';
import { PIX_H } from '../v2/pix';
import { cue } from '../../audio/cues';

export interface Line { who: string; text: string }
interface Speaker { name: string; side: 'L' | 'R'; mute?: boolean }
/** the cast: ids match the portrait files (src/assets/portraits/<id>.png) and docs/STORY.md */
export const CAST: Record<string, Speaker> = {
  jiangjin: { name: '姜烬', side: 'L' }, duwu: { name: '杜五', side: 'R' }, sunao: { name: '孙媪', side: 'R' }, fengtiebi: { name: '冯铁臂', side: 'R', mute: true },
  luzhao: { name: '卢昭', side: 'R' }, huanyue: { name: '桓越', side: 'R' }, chulei: { name: '褚雷', side: 'R' }, yanhu: { name: '阎虎', side: 'R' },
  fengzhen: { name: '封鸩', side: 'R' }, zhouan: { name: '周黯', side: 'R' }, cuixuan: { name: '崔玄', side: 'R' },
};
const files = import.meta.glob('../../assets/portraits/*.png', { eager: true, query: '?inline', import: 'default' }) as Record<string, string>;
const PORTRAIT: Record<string, string> = {};
for (const [p, url] of Object.entries(files)) PORTRAIT[p.split('/').pop()!.replace('.png', '')] = url;
const texCache = new Map<string, THREE.Texture>();
function portraitTex(id: string, ready: (t: THREE.Texture) => void) {
  const url = PORTRAIT[id]; if (!url) return null;
  let t = texCache.get(id);
  if (!t) { t = new THREE.TextureLoader().load(url, tt => ready(tt)); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace; texCache.set(id, t); }
  else if (t.image) ready(t);
  return t;
}

const BG = '#14121c', EDGE_G = '#c8963a', EDGE_R = '#a8302a', NAME = '#ffd27a', BODY = '#f2e8d6', MUTE = '#a8a2a8';
const CPS = 36;   // characters per second
interface Side { mesh: THREE.Mesh | null; id: string; k: number; on: number; aspect: number }

/** the line's HD body font size (CSS px): 20 on tall screens, 15 on a phone held sideways */
const fontPx = (scale: number) => (scale >= 2 ? 20 : 15);
export class Dialogue {
  on = false; private box: THREE.Mesh; private boxTex: THREE.CanvasTexture | null = null; private canvas = document.createElement('canvas');
  private sides: Record<'L' | 'R', Side> = { L: { mesh: null, id: '', k: 0, on: 0, aspect: 0.8 }, R: { mesh: null, id: '', k: 0, on: 0, aspect: 0.8 } };
  private lines: Line[] = []; private i = 0; private shown = 0; private t = 0; private done: (() => void) | null = null; private drawn = -1; private openT = 0;
  constructor(private L: UiLayer) {
    this.box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [0, 0, 0, 0, 0, 0].map((_, i) => new THREE.MeshBasicMaterial({ color: i === 4 ? 0xffffff : 0x0d0b12, transparent: true, depthTest: false, depthWrite: false })));
    this.box.renderOrder = 60; this.box.visible = false; L.scene.add(this.box);
  }
  /** play lines; resolves when the last is dismissed */
  play(lines: Line[]): Promise<void> {
    this.lines = lines.filter(l => l.text); this.i = 0; this.shown = 0; this.t = 0; this.drawn = -1; this.on = true; this.openT = 0; this.box.visible = true;
    for (const s of ['L', 'R'] as const) { this.sides[s].on = 0; }
    // both portraits of the scene come up together: whoever speaks first on each side
    for (const l of this.lines) { const sp = CAST[l.who]; if (sp && !this.sides[sp.side].id) this.setPortrait(sp.side, l.who); }
    cue('scroll', 0.4);
    return new Promise(res => { this.done = res; });
  }
  private setPortrait(side: 'L' | 'R', id: string) {
    const S = this.sides[side]; if (S.id === id && S.mesh) return; S.id = id;
    if (S.mesh) { this.L.scene.remove(S.mesh); (S.mesh.material as THREE.Material).dispose(); S.mesh.geometry.dispose(); S.mesh = null; }
    const mat = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, alphaTest: 0.5, color: 0xffffff });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); m.renderOrder = 59; m.visible = false; this.L.scene.add(m); S.mesh = m;
    const t = portraitTex(id, tt => { mat.map = tt; mat.needsUpdate = true; const img = tt.image as { width: number; height: number }; S.aspect = img.width / img.height; m.visible = this.on; });
    if (!t) { m.visible = false; return; }
    mat.map = t; if (t.image) { const img = t.image as { width: number; height: number }; S.aspect = img.width / img.height; m.visible = true; }
  }
  /** a tap / Enter / the cut button */
  advance() {
    if (!this.on) return false;
    const line = this.lines[this.i];
    if (line && this.shown < [...line.text].length) { this.shown = [...line.text].length; return true; }
    this.i++; this.shown = 0; this.t = 0;
    if (this.i >= this.lines.length) { this.close(); return true; }
    const sp = CAST[this.lines[this.i].who]; if (sp) this.setPortrait(sp.side, this.lines[this.i].who);
    cue('click', 0.2); return true;
  }
  private close() {
    this.on = false; this.box.visible = false;
    for (const s of ['L', 'R'] as const) { const S = this.sides[s]; if (S.mesh) S.mesh.visible = false; S.id = ''; }
    const d = this.done; this.done = null; d?.();
  }
  /** the box face: name plate + the visible part of the line, pixel font at an integer scale */
  private paint(line: Line, n: number, wPx: number, hPx: number, scale: number) {
    const sp = CAST[line.who], c = this.canvas, dpr = Math.max(1, Math.round(this.L.dpr || 1)), S = scale * dpr;
    c.width = Math.round(wPx * dpr); c.height = Math.round(hPx * dpr); const g = c.getContext('2d')!; g.imageSmoothingEnabled = false;
    const P = (x: number, y: number, w: number, h: number, col: string) => { g.fillStyle = col; g.fillRect(Math.round(x * dpr), Math.round(y * dpr), Math.round(w * dpr), Math.round(h * dpr)); };
    // the frame: a thin gold line inside a thin red one, notched corners (pixel steps, never diagonal runs)
    P(0, 0, wPx, hPx, EDGE_R); P(2, 2, wPx - 4, hPx - 4, EDGE_G); P(4, 4, wPx - 8, hPx - 8, BG);
    for (const [x, y] of [[0, 0], [wPx - 4, 0], [0, hPx - 4], [wPx - 4, hPx - 4]]) g.clearRect(Math.round(x * dpr), Math.round(y * dpr), Math.round(4 * dpr), Math.round(4 * dpr));
    // the name, gold, top left (or right when the speaker stands on the right)
    const nameS = S, name = sp?.name ?? line.who, right = sp?.side === 'R';
    const nx = right ? c.width - Math.round(16 * dpr) - textW(name, nameS) : Math.round(16 * dpr);
    text(g, name, nx, Math.round(10 * dpr), nameS, NAME, 'left', '#05040a');
    // the line in the HD body font (the user: 说明文字那些高清), wrapped to the box (CJK breaks anywhere), shown up to n characters
    const fpx = Math.round(fontPx(scale) * dpr), chars = [...line.text].slice(0, n), maxW = c.width - Math.round(32 * dpr), lineH = Math.round(fpx * 1.4);
    let row = '', y = Math.round(10 * dpr) + PIX_H * nameS + Math.round(12 * dpr);
    const col = sp?.mute ? MUTE : BODY;
    for (const ch of chars) { if (bodyW(row + ch, fpx) > maxW) { bodyText(g, row, Math.round(16 * dpr), y, fpx, col); row = ''; y += lineH; } row += ch; }
    if (row) bodyText(g, row, Math.round(16 * dpr), y, fpx, col);
    // the "more" mark when the line is complete
    if (n >= [...line.text].length) { const bx = c.width - Math.round(26 * dpr), by = c.height - Math.round(18 * dpr); g.fillStyle = NAME; for (let r = 0; r < 4; r++) g.fillRect(bx + r * dpr, by + r * dpr, (8 - r * 2) * dpr, dpr); }
    this.boxTex?.dispose(); this.boxTex = new THREE.CanvasTexture(c); const hd = BODY_FONT.current !== 'pixel'; this.boxTex.magFilter = hd ? THREE.LinearFilter : THREE.NearestFilter; this.boxTex.minFilter = hd ? THREE.LinearFilter : THREE.NearestFilter; this.boxTex.generateMipmaps = false; this.boxTex.colorSpace = THREE.SRGBColorSpace;
    const fm = (this.box.material as THREE.MeshBasicMaterial[])[4]; fm.map = this.boxTex; fm.needsUpdate = true;
  }
  update(dt: number) {
    if (!this.on) return;
    const L = this.L, line = this.lines[this.i]; if (!line) return;
    this.openT = Math.min(1, this.openT + dt * 5);
    const total = [...line.text].length; this.t += dt; const n = Math.min(total, Math.floor(this.t * CPS) + 1);
    if (n > this.shown) this.shown = n;
    // layout: the box across the bottom middle; pixel scale 2 on screens ≥ 600 px tall, else 1 (wrapped to two / three rows)
    const scale = L.h >= 600 ? 2 : 1, rows = 2, hPx = Math.round(10 + PIX_H * scale + 12 + rows * Math.round(fontPx(scale) * 1.4) + 8), wPx = Math.round(Math.min(L.w * 0.62, 760));
    const key = this.i * 10000 + this.shown * 2 + (this.shown >= total ? 1 : 0) + wPx * 1e7 + BODY_FONT.version * 1e11;
    if (key !== this.drawn) { this.drawn = key; this.paint(line, this.shown, wPx, hPx, scale); }
    const y = L.h - hPx / 2 - Math.max(10, L.h * 0.03) + (1 - this.openT) * 30;
    L.at(L.w / 2, y, 0, this.box.position); this.box.scale.set(L.px(wPx), L.px(hPx), L.px(8));
    // portraits: whole device pixels per art pixel (k / dpr), about half the screen tall at most (a phone gets 2/3 scale,
    // not a portrait three quarters of the screen), bottoms behind the box; the speaker lit and lifted, the other dimmed
    const dpr = Math.max(1, Math.round(L.dpr || 1)), sp = CAST[line.who], pk = Math.max(1, Math.floor((L.h * 0.56 * dpr) / 288)) / dpr;
    for (const s of ['L', 'R'] as const) {
      const S = this.sides[s]; if (!S.mesh) continue;
      const speaking = sp?.side === s; S.on += ((speaking ? 1 : 0) - S.on) * Math.min(1, dt * 10); S.k = Math.min(1, S.k + dt * 4);
      const hP = 288 * pk, wP = hP * S.aspect, x = s === 'L' ? wP * 0.42 + L.w * 0.02 - (1 - S.k) * 80 : L.w - wP * 0.42 - L.w * 0.02 + (1 - S.k) * 80;
      L.at(x, L.h - hP / 2 - 4 - S.on * 6, -0.5, S.mesh.position); S.mesh.scale.set(L.px(wP), L.px(hP), 1);
      const c = 0.42 + 0.58 * S.on; (S.mesh.material as THREE.MeshBasicMaterial).color.setRGB(c, c, c);
      S.mesh.visible = !!(S.mesh.material as THREE.MeshBasicMaterial).map?.image;
    }
  }
}
