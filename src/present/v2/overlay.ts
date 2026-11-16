// The 2D overlay of the v2 slice (orthographic, CSS px, top-left origin): enemy plates (intent, HP, statuses), banners, toasts,
// labels next to UI-layer widgets, and the full-screen choice screens (class select, level-up / talent / relic, shop, result).
// Every text is the pixel font (pix.ts); canvases repaint only when their key changes.
import * as THREE from 'three';
import { canvasOf } from '../hud/paint';
import { drawPix, pixW, pixWrap, PIX_H } from './pix';
import { cue } from '../../audio/cues';

export interface Rect { x: number; y: number; w: number; h: number }
export class Overlay {
  scene = new THREE.Scene(); cam = new THREE.OrthographicCamera(0, 1, 0, -1, -10, 10); w = 1; h = 1; dpr = 1;
  /** font pixel size in CSS px for body text (2 at 720p) */
  get fp() { return Math.max(1, Math.round(Math.min(this.w / 640, this.h / 360) * 2) / 2) ; }
  resize(w: number, h: number, dpr: number) { this.w = w; this.h = h; this.dpr = dpr; this.cam.right = w; this.cam.bottom = -h; this.cam.updateProjectionMatrix(); for (const p of this.panes) p.key = ''; }
  panes: Pane[] = [];
  pane(order = 0, smooth = false) { const p = new Pane(this, order); p.smooth = smooth; this.panes.push(p); return p; }
  drop(p: Pane) { this.scene.remove(p.mesh); p.tex?.dispose(); p.mat.dispose(); this.panes = this.panes.filter(x => x !== p); }
  /** drawn after the overlay (hud/banner3d.ts: the 3D banners and toasts stand over the 2D plates, like the 2D ones did) */
  after: Array<(r: THREE.WebGLRenderer) => void> = [];
  render(r: THREE.WebGLRenderer) { for (const p of this.panes) p.sync(); const ac = r.autoClear; r.autoClear = false; r.setRenderTarget(null); r.clearDepth(); r.render(this.scene, this.cam); r.autoClear = ac; for (const f of this.after) f(r); }
}

export class Pane {
  mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; tex: THREE.CanvasTexture | null = null; w = 1; h = 1; key = ''; x = 0; y = 0; scale = 1; alpha = 1; visible = true;
  /** R5: smooth (linear) sampling for vector-painted panes that get scaled; rot = rotation (rad) about the centre */
  smooth = false; rot = 0;
  constructor(private ov: Overlay, order = 0) {
    this.mat = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat); this.mesh.renderOrder = order; ov.scene.add(this.mesh);
  }
  /** draw(g, k): k = device px per CSS px (integer-ish) */
  paint(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, k: number) => void) {
    if (key === this.key && this.tex) return; this.key = key;
    const k = this.ov.dpr, { c, g } = canvasOf(Math.max(1, w * k), Math.max(1, h * k)); g.imageSmoothingEnabled = this.smooth; draw(g, k);
    this.tex?.dispose(); this.tex = new THREE.CanvasTexture(c as HTMLCanvasElement); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.minFilter = this.smooth ? THREE.LinearFilter : THREE.NearestFilter; this.tex.magFilter = this.smooth ? THREE.LinearFilter : THREE.NearestFilter; this.tex.generateMipmaps = false;
    this.mat.map = this.tex; this.mat.needsUpdate = true; this.w = w; this.h = h;
  }
  at(x: number, y: number) { this.x = x; this.y = y; return this; }
  sync() {
    this.mesh.visible = this.visible && this.alpha > 0.01 && !!this.tex;
    this.mesh.scale.set(this.w * this.scale, this.h * this.scale, 1); this.mesh.rotation.z = this.rot; this.mesh.position.set(Math.round(this.x) + this.w / 2, -(Math.round(this.y) + this.h / 2), 0); this.mat.opacity = this.alpha;
  }
  rect(): Rect { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
}

// ---------------------------------------------------------------- pixel drawing helpers (axis-aligned blocks only)
/** a chunky stone / parchment panel: dark body, 1-cell light rim, 1-cell dark outer line, notched corners (no diagonals) */
export function panel(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: number, col = { body: '#1c1624', rim: '#8a7456', line: '#07050a', hi: '#2c2234' }) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h); c = Math.max(1, Math.round(c));
  g.fillStyle = col.line; g.fillRect(x + c, y, w - 2 * c, h); g.fillRect(x, y + c, w, h - 2 * c);
  g.fillStyle = col.rim; g.fillRect(x + 2 * c, y + c, w - 4 * c, h - 2 * c); g.fillRect(x + c, y + 2 * c, w - 2 * c, h - 4 * c);
  g.fillStyle = col.body; g.fillRect(x + 2 * c, y + 2 * c, w - 4 * c, h - 4 * c);
  g.fillStyle = col.hi; g.fillRect(x + 2 * c, y + 2 * c, w - 4 * c, c);
}
/** a 10×10 icon ('#' main, 'o' accent, 'd' dark) drawn with cell size c */
export function icon(g: CanvasRenderingContext2D, rows: string[], x: number, y: number, c: number, col: { main: string; acc?: string; dark?: string }) {
  rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const ch = r[i]; if (ch === '.') continue; g.fillStyle = ch === 'o' ? col.acc ?? col.main : ch === 'd' ? col.dark ?? '#000' : col.main; g.fillRect(Math.round(x + i * c), Math.round(y + j * c), Math.ceil(c), Math.ceil(c)); } });
}
export const ICON = {
  sword: ['........##', '.......###', '......###.', '.....###..', '#...###...', '##.###....', '.####.....', '..##......', '.####.....', '##..#.....'],
  shield: ['.########.', '##########', '##oooooo##', '##oooooo##', '##oooooo##', '.##oooo##.', '.##oooo##.', '..##oo##..', '...####...', '....##....'],
  boot: ['..........', '...####...', '...####...', '...####...', '...####...', '...######.', '..########', '..########', '..........', '..........'],
  star: ['....##....', '....##....', '.########.', '..######..', '...####...', '..##..##..', '.##....##.', '..........', '..........', '..........'],
  skull: ['..######..', '.########.', '##########', '##..##..##', '##..##..##', '##########', '.###..###.', '..######..', '..#.##.#..', '..........'],
  zz: ['..........', '.######...', '....##....', '...##.....', '.######...', '......####', '.......##.', '......####', '..........', '..........'],
  coin: ['...####...', '.##oooo##.', '.#oo##oo#.', '#oo#..#oo#', '#oo#....o#', '#oo#....o#', '#oo#..#oo#', '.#oo##oo#.', '.##oooo##.', '...####...'],
  heart: ['.##...##..', '####.####.', '#########.', '#########.', '.#######..', '..#####...', '...###....', '....#.....', '..........', '..........'],
  potion: ['...####...', '....##....', '...####...', '..#oooo#..', '.#oooooo#.', '#oooooooo#', '#oooooooo#', '#oooooooo#', '.#oooooo#.', '..######..'],
  quill: ['.........#', '........##', '.......##.', '......##..', '.....##...', '....##....', '...##.....', '..##......', '.##.......', '##........'],
  gem: ['..........', '..######..', '.##oooo##.', '##oooooo##', '.##oooo##.', '..##oo##..', '...####...', '....##....', '..........', '..........'],
};

/** text helper: draws a line of pixel text with a dark outline. size = font pixel in device px */
export function text(g: CanvasRenderingContext2D, t: string, x: number, y: number, size: number, color: string, align: 'left' | 'center' | 'right' = 'left', outline: string | null = '#07050a') {
  return drawPix(g, t, x, y, { scale: size, color, outline, align });
}
export function textW(t: string, size: number) { return pixW(t) * Math.max(1, Math.round(size)); }
export { pixWrap, PIX_H };

// ---------------------------------------------------------------- banner + toast
export class Banner {
  p: Pane; t = 0; hold = 0;
  constructor(private ov: Overlay) { this.p = ov.pane(50); this.p.alpha = 0; }
  show(title: string, sub = '', hold = 1.2, color = '#ffe6a0') {
    const ov = this.ov, k = ov.dpr, fs = Math.round(ov.fp * 2 * k), ss = Math.max(1, Math.round(ov.fp * k));
    const w = Math.max(textW(title, fs), sub ? textW(sub, ss) : 0) / k + 60, h = (PIX_H * fs + (sub ? PIX_H * ss + 10 * k : 0)) / k + 34;
    this.p.paint('b' + title + sub + ov.w + color, w, h, g => {
      panel(g, 0, 0, w * k, h * k, 3 * k, { body: 'rgba(16,10,20,0.88)', rim: '#a0784a', line: '#07050a', hi: 'rgba(255,220,160,0.08)' });
      text(g, title, (w * k) / 2, 16 * k, fs, color, 'center');
      if (sub) text(g, sub, (w * k) / 2, 16 * k + PIX_H * fs + 8 * k, ss, '#d8c8b0', 'center');
    });
    this.p.at(ov.w / 2 - w / 2, ov.h * 0.3 - h / 2); this.t = 0; this.hold = hold; cue('reveal', 0.3);
  }
  hide() { this.hold = 0; this.t = 99; }
  update(dt: number) {
    this.t += dt; const a = this.t < 0.15 ? this.t / 0.15 : this.t < 0.15 + this.hold ? 1 : Math.max(0, 1 - (this.t - 0.15 - this.hold) / 0.3);
    this.p.alpha = a; this.p.scale = this.t < 0.15 ? 1.15 - this.t : 1;
  }
}
export class Toast {
  p: Pane; t = 99; life = 1;
  constructor(private ov: Overlay) { this.p = ov.pane(60); this.p.alpha = 0; }
  show(s: string, life = 1.2, color = '#ffd8c8') {
    const ov = this.ov, k = ov.dpr, fs = Math.max(1, Math.round(ov.fp * k)), w = textW(s, fs) / k + 28, h = PIX_H * fs / k + 18;
    this.p.paint('t' + s + color, w, h, g => { panel(g, 0, 0, w * k, h * k, 2 * k); text(g, s, (w * k) / 2, 9 * k, fs, color, 'center'); });
    this.p.at(ov.w / 2 - w / 2, ov.h * 0.62); this.t = 0; this.life = life;
  }
  update(dt: number) { this.t += dt; this.p.alpha = this.t < this.life ? 1 : Math.max(0, 1 - (this.t - this.life) / 0.25); }
}

// ---------------------------------------------------------------- full-screen choice screens
export interface Btn { r: Rect; onTap: () => void; enabled: boolean; pane: Pane; id: string }
export class Screen {
  dim: THREE.Mesh; btns: Btn[] = []; panes: Pane[] = []; on = false; private down: Btn | null = null; t = 0;
  constructor(private ov: Overlay) {
    this.dim = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x05030a, transparent: true, opacity: 0.6, depthTest: false, depthWrite: false }));
    this.dim.renderOrder = 70; this.dim.visible = false; ov.scene.add(this.dim);
  }
  open(dimA = 0.6) { this.close(); this.on = true; this.t = 0; (this.dim.material as THREE.MeshBasicMaterial).opacity = dimA; this.dim.visible = dimA > 0; this.dim.scale.set(this.ov.w, this.ov.h, 1); this.dim.position.set(this.ov.w / 2, -this.ov.h / 2, 0); }
  close() { for (const p of this.panes) this.ov.drop(p); for (const b of this.btns) this.ov.drop(b.pane); this.panes = []; this.btns = []; this.on = false; this.dim.visible = false; this.down = null; }
  /** a static painted pane */
  add(key: string, r: Rect, draw: (g: CanvasRenderingContext2D, k: number, w: number, h: number) => void) {
    const p = this.ov.pane(72); p.paint(key, r.w, r.h, (g, k) => draw(g, k, r.w * k, r.h * k)); p.at(r.x, r.y); this.panes.push(p); return p;
  }
  /** a tappable card / button */
  button(id: string, r: Rect, draw: (g: CanvasRenderingContext2D, k: number, w: number, h: number) => void, onTap: () => void, enabled = true) {
    const p = this.ov.pane(73); p.paint(id + r.w + 'x' + r.h + enabled, r.w, r.h, (g, k) => draw(g, k, r.w * k, r.h * k)); p.at(r.x, r.y);
    const b: Btn = { r, onTap, enabled, pane: p, id }; this.btns.push(b); return b;
  }
  hit(x: number, y: number) { return this.btns.find(b => x >= b.r.x && x <= b.r.x + b.r.w && y >= b.r.y && y <= b.r.y + b.r.h) || null; }
  pointer(type: string, x: number, y: number) {
    if (!this.on) return false;
    const b = this.hit(x, y);
    if (type === 'down') { this.down = b; if (b) { b.pane.scale = 0.96; if (!b.enabled) cue('deny', 0.4); else cue('click', 0.5); } return true; }
    if (type === 'up' || type === 'cancel') { const d = this.down; this.down = null; if (d) d.pane.scale = 1; if (type === 'up' && d && d === b && d.enabled) d.onTap(); return true; }
    return true;
  }
  /** for bots / captures: tap a button by id */
  tap(id: string) { const b = this.btns.find(x => x.id === id); if (b && b.enabled) { cue('click', 0.5); b.onTap(); return true; } return false; }
  update(dt: number) { this.t += dt; const a = Math.min(1, this.t / 0.2); for (const p of [...this.panes, ...this.btns.map(b => b.pane)]) p.alpha = a; }
}
