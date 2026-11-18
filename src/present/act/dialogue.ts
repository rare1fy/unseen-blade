// 立绘对话（act-20，用户：「对话就弄立绘对话的形式，不要用timeline演对话」；立绘风格是另一会话用户定的：老《三国志》街机、
// 《吞食天地》《三国战纪》式的原创街机手绘像素立绘，见 docs/art/ART_DIRECTION.md 第 10 节）：
// 底部一块深色底、细金红像素边的对话框（3D 薄板，UI 层），金色名字、米白正文、点阵字逐字显示；主角立绘在左，对方在右，
// 说话的一方亮、抬一点，另一方暗下去；立绘按整数倍放大保持像素清楚；场景照常看得见（不加全屏暗罩）。
// act-25：照哈迪斯改成一屏高的大立绘，说话 / 听的人明暗和进退拉开，换人说话有一跳，进出场滑入滑出（见 portraits()）。
// 点 / 回车 / 斩：先把这句显示完，再点下一句。冯铁臂是哑巴，他的「台词」是动作，用灰色写。
import * as THREE from 'three';
import type { UiLayer } from '../ui3d/layer';
import { text, textW } from '../v2/overlay';
import { bodyText, bodyW, BODY_FONT } from '../ui3d/bodyFont';
import { PIX_H } from '../v2/pix';
import { cue } from '../../audio/cues';
import { sayLine } from '../../audio/voice';
import { audio } from '../../audio/audio';
import { GL } from '../engine/world';
import { loadImage } from '../../platform/index';

export interface Line { who: string; text: string }
interface Speaker { name: string; side: 'L' | 'R'; mute?: boolean }
/** the cast: ids match the portrait files (src/assets/portraits/<id>.png) and docs/STORY.md */
export const CAST: Record<string, Speaker> = {
  jiangjin: { name: '刘白', side: 'L' }, duwu: { name: '杜五', side: 'R' }, sunao: { name: '孙婆婆', side: 'R' }, fengtiebi: { name: '冯铁臂', side: 'R', mute: true },
  luzhao: { name: '卢昭', side: 'R' }, huanyue: { name: '韩越', side: 'R' }, chulei: { name: '石雷', side: 'R' }, yanhu: { name: '阎虎', side: 'R' },
  fengzhen: { name: '封寒', side: 'R' }, zhouan: { name: '周默', side: 'R' }, cuixuan: { name: '崔玄', side: 'R' },
  /** act-29: a line of action (in brackets, grey, no name): nobody speaks, both portraits stay and dim */
  act: { name: '', side: 'L', mute: true },
};
const files = import.meta.glob('../../assets/portraits/*.png', { eager: true, query: '?inline', import: 'default' }) as Record<string, string>;
const PORTRAIT: Record<string, string> = {};
for (const [p, url] of Object.entries(files)) PORTRAIT[p.split('/').pop()!.replace('.png', '')] = url;
const texCache = new Map<string, THREE.Texture>();
function portraitTex(id: string, ready: (t: THREE.Texture) => void) {
  const url = PORTRAIT[id]; if (!url) return null;
  let t = texCache.get(id);
  // (11-18 微信小游戏: through the platform's image loader — wx.createImage there — not THREE.TextureLoader's document.createElementNS)
  if (!t) { const tx = new THREE.Texture(); t = tx; tx.magFilter = THREE.NearestFilter; tx.minFilter = THREE.NearestFilter; tx.generateMipmaps = false; tx.colorSpace = THREE.SRGBColorSpace; texCache.set(id, tx);
    loadImage(url, im => { tx.image = im; tx.needsUpdate = true; ready(tx); }, e => console.warn('[portrait]', id, e)); }
  else if (t.image) ready(t);
  return t;
}

const BG = '#14121c', EDGE_G = '#c8963a', EDGE_R = '#a8302a', NAME = '#ffd27a', BODY = '#f2e8d6', MUTE = '#a8a2a8';
const CPS = 36;   // characters per second
interface Side { mesh: THREE.Mesh | null; id: string; k: number; on: number; aspect: number; ih: number; pop: number; was: boolean; away: number }

/** the line's HD body font size (CSS px): 20 on tall screens, 15 on a phone held sideways */
const fontPx = (scale: number) => (scale >= 2 ? 20 : 15);
export class Dialogue {
  on = false; private box: THREE.Mesh; private boxTex: THREE.CanvasTexture | null = null; private canvas = document.createElement('canvas');
  private sides: Record<'L' | 'R', Side> = { L: { mesh: null, id: '', k: 0, on: 0, aspect: 0.8, ih: 144, pop: 0, was: false, away: 0 }, R: { mesh: null, id: '', k: 0, on: 0, aspect: 0.8, ih: 144, pop: 0, was: false, away: 0 } };
  /** the portraits sliding out after the last line (1 → 0) */
  private outK = 0; private lastSpeaker: 'L' | 'R' | null = null;
  private onLine: ((i: number, line: Line) => void) | null = null;
  private lines: Line[] = []; private i = 0; private shown = 0; private t = 0; private done: (() => void) | null = null; private drawn = -1; private openT = 0;
  constructor(private L: UiLayer) {
    this.box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [0, 0, 0, 0, 0, 0].map((_, i) => new THREE.MeshBasicMaterial({ color: i === 4 ? 0xffffff : 0x0d0b12, transparent: true, depthTest: false, depthWrite: false })));
    this.box.renderOrder = 60; this.box.visible = false; L.scene.add(this.box);
  }
  /** play lines; resolves when the last is dismissed */
  play(lines: Line[], onLine?: (i: number, line: Line) => void): Promise<void> {
    this.onLine = onLine ?? null;
    // (act-40 用户：「旁白的立绘对话不要放个人的立绘在那儿摆着」: a line that is all in brackets is narration — 冯铁臂's silent business
    //  included — whoever it is filed under)
    this.lines = lines.filter(l => l.text).map(l => (/^（[^（）]*）$/.test(l.text.trim()) ? { ...l, who: 'act' } : l)); this.i = 0; this.shown = 0; this.t = 0; this.drawn = -1; this.on = true; this.openT = 0; this.box.visible = true;
    this.outK = 0;
    for (const s of ['L', 'R'] as const) { const S = this.sides[s]; if (S.mesh) { this.L.scene.remove(S.mesh); (S.mesh.material as THREE.Material).dispose(); S.mesh.geometry.dispose(); S.mesh = null; } S.id = ''; S.on = 0; S.k = 0; S.pop = 0; S.was = false; S.away = 0; }
    // both portraits of the scene come up together: whoever speaks first on each side
    for (const l of this.lines) { const sp = CAST[l.who]; if (sp && l.who !== 'act' && !this.sides[sp.side].id) this.setPortrait(sp.side, l.who); }
    cue('scroll', 0.4); this.say();
    return new Promise(res => { this.done = res; });
  }
  private setPortrait(side: 'L' | 'R', id: string) {
    const S = this.sides[side]; if (S.id === id && S.mesh) return; S.id = id; S.k = 0;
    if (S.mesh) { this.L.scene.remove(S.mesh); (S.mesh.material as THREE.Material).dispose(); S.mesh.geometry.dispose(); S.mesh = null; }
    const mat = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, alphaTest: 0.5, color: 0xffffff });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); m.renderOrder = 59; m.visible = false; this.L.scene.add(m); S.mesh = m;
    const t = portraitTex(id, tt => { mat.map = tt; mat.needsUpdate = true; const img = tt.image as { width: number; height: number }; S.aspect = img.width / img.height; S.ih = img.height; m.visible = this.on; });
    if (!t) { m.visible = false; return; }
    mat.map = t; if (t.image) { const img = t.image as { width: number; height: number }; S.aspect = img.width / img.height; S.ih = img.height; m.visible = true; }
  }
  /** a tap / Enter / the cut button */
  advance() {
    if (!this.on) return false;
    const line = this.lines[this.i];
    if (line && this.shown < [...line.text].length) { this.shown = [...line.text].length; return true; }
    this.i++; this.shown = 0; this.t = 0;
    if (this.i >= this.lines.length) { this.close(); return true; }
    const sp = CAST[this.lines[this.i].who]; if (sp && this.lines[this.i].who !== 'act') this.setPortrait(sp.side, this.lines[this.i].who);
    cue('click', 0.2); this.say(); return true;
  }
  /** act-37: the line's voice, if it has one */
  private say() { const l = this.lines[this.i]; if (l) { sayLine(l.who, l.text); this.onLine?.(this.i, l); } }
  private close() {
    audio.stopVoice();
    // the box goes at once; the portraits slide back out to their sides (update keeps placing them while outK runs down)
    this.on = false; this.box.visible = false; this.outK = 1;
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
    if (!this.on) {
      if (this.outK > 0) { this.outK = Math.max(0, this.outK - dt * 5); this.portraits(dt, this.lastSpeaker);
        if (this.outK <= 0) for (const s of ['L', 'R'] as const) { const S = this.sides[s]; if (S.mesh) S.mesh.visible = false; S.id = ''; } }
      return;
    }
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
    const sp = CAST[line.who]; this.lastSpeaker = line.who === 'act' ? null : sp?.side ?? null;
    this.portraits(dt, this.lastSpeaker);
  }
  /** act-25 (user: 「哈迪斯的立绘基本上是顶满的大图……压暗和动效明显不足，感受不到是两个人在对话」): Hades-style portraits —
   *  about a screen tall at a whole number of device pixels per art pixel, the head near the top and the bust running off the bottom
   *  edge; the speaker full bright, a step in toward the middle and a small hop each time the turn comes to them, drawn over the other;
   *  the listener down to about a third, a cold cast, a step back out and down; a new face slides in from its edge, and at the end
   *  both slide out. Final positions snap to device pixels so the pixel art stays crisp (only the moves themselves land between). */
  private portraits(dt: number, speaker: 'L' | 'R' | null) {
    // (act-39 用户：「立绘还是糊的呢」: the scale was whole CSS px per art pixel — 7.5 device px on a 125% screen — and the plane sits
    //  0.5 behind the UI's px plane, so it drew 1.2% small: art pixels fell between device pixels. Now whole DEVICE px per art pixel,
    //  the size corrected for the plane's depth, the corner snapped to a device pixel)
    const L = this.L, dpr = GL.renderer?.getPixelRatio() || L.dpr || 1, Z = -0.5;   // (the canvas's real device px per CSS px — up to 3 on a phone in the pixel look)
    const snap = (v: number) => Math.round(v * dpr) / dpr;
    for (const s of ['L', 'R'] as const) {
      const S = this.sides[s]; if (!S.mesh) continue;
      const speaking = speaker === s;
      if (speaking && !S.was) S.pop = 1; S.was = speaking;
      S.on += ((speaking ? 1 : 0) - S.on) * Math.min(1, dt * (speaking ? 14 : 7));
      S.k = Math.min(1, S.k + dt * 3.2); S.pop = Math.max(0, S.pop - dt / 0.22);
      // (act-40 用户：「旁白的立绘对话不要放个人的立绘在那儿摆着」: on a line of narration both portraits slide out of the picture)
      const narr = this.on && this.lines[this.i]?.who === 'act'; S.away += ((narr ? 1 : 0) - S.away) * Math.min(1, dt * 9);
      const inK = 1 - Math.pow(1 - S.k, 3), outK = this.on ? 0 : 1 - this.outK * this.outK, dir = s === 'L' ? 1 : -1;
      // (act-37 用户：「怎么立绘还是糊的」: each picture is kept at its own pixel grid (150–180 rows), so the scale is a whole number of
      //  device pixels per art pixel from its own height)
      // (act-40 用户：「没说话那个人还要再缩小压暗一些」: the listener one device px per art px smaller — still whole pixels at rest)
      const pkDev = Math.max(2, Math.round((L.h * dpr) / S.ih)), pk = (pkDev - 1 + S.on) / dpr, hP = S.ih * pk, wP = Math.round(S.ih * S.aspect) * pk;
      const home = s === 'L' ? wP * 0.4 : L.w - wP * 0.4;
      const step = L.w * 0.018 * S.on - L.w * 0.035 * (1 - S.on);
      const cx = home + dir * step - dir * ((1 - inK) + outK + S.away) * wP * 0.95;
      // (act-50 用户：「立绘在对话的时候下半截会截断」: the top was pinned at 5% of the screen, so a picture shorter than the screen — the
      //  whole-pixel scale rounding down, and always the listener's, one step smaller and pushed down — ended above the bottom edge, its
      //  cut-off chest showing. Now the bottom always runs 4% past the screen's bottom (more than the pop lifts it), the head never above 5%)
      const top = Math.max(L.h * 0.05, L.h * 1.04 - hP) + (1 - S.on) * L.h * 0.03 - Math.sin(S.pop * Math.PI) * Math.max(6, L.h * 0.014);
      const left = snap(cx - wP / 2), y0 = snap(top);
      L.at(left + wP / 2, y0 + hP / 2, Z, S.mesh.position); S.mesh.scale.set(L.px(wP, Z), L.px(hP, Z), 1);
      const k = S.on, mat = S.mesh.material as THREE.MeshBasicMaterial;
      mat.color.setRGB(0.17 + 0.83 * k, 0.18 + 0.82 * k, 0.25 + 0.75 * k);
      S.mesh.renderOrder = speaking ? 59 : 58;
      S.mesh.visible = !!mat.map?.image;
    }
  }
}
