// Full-resolution pixel numerals for the UI layer: numbers stay crisp on top of the 3× art buffer (COMMON: text is drawn at full
// resolution after the frame). A tiny 4×5 font (digits + - / x %), drawn into canvas planes in an orthographic overlay scene.
import * as THREE from 'three';
import { makeCanvas } from '../../platform/index';
import { BODY_FONT, bodyText, bodyW } from './bodyFont';

const F: Record<string, string[]> = {
  '0': ['.##.', '#..#', '#..#', '#..#', '.##.'], '1': ['.##.', '###.', '.##.', '.##.', '####'], '2': ['###.', '...#', '.##.', '#...', '####'],
  '3': ['###.', '...#', '.##.', '...#', '###.'], '4': ['#..#', '#..#', '####', '...#', '...#'], '5': ['####', '#...', '###.', '...#', '###.'],
  '6': ['.##.', '#...', '###.', '#..#', '.##.'], '7': ['####', '...#', '..#.', '.#..', '.#..'], '8': ['.##.', '#..#', '.##.', '#..#', '.##.'],
  '9': ['.##.', '#..#', '.###', '...#', '.##.'], '+': ['....', '.#..', '###.', '.#..', '....'], '-': ['....', '....', '###.', '....', '....'],
  '/': ['...#', '..#.', '.#..', '#...', '....'], 'x': ['....', '#.#.', '.#..', '#.#.', '....'], '%': ['#..#', '..#.', '.#..', '#..#', '....'], ' ': ['..', '..', '..', '..', '..'],
};
const glyph = (ch: string) => F[ch] || F[' '];
export function textCells(t: string) { let w = 0; for (const ch of t) w += glyph(ch)[0].length + 1; return { w: Math.max(0, w - 1), h: 5 }; }

export interface TextSpec { text: string; x: number; y: number; cell?: number; bodyPx?: number; color?: string; outline?: string; align?: 'left' | 'center' | 'right'; alpha?: number; scale?: number; visible?: boolean }

class Label {
  mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; tex: THREE.CanvasTexture | null = null; key = ''; w = 1; h = 1;
  constructor(scene: THREE.Scene) {
    this.mat = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat); this.mesh.renderOrder = 50; scene.add(this.mesh);
  }
  set(s: TextSpec, dpr: number) {
    const cell = s.cell ?? 3, col = s.color ?? '#fff6e2', ol = s.outline ?? '#140c10', key = `${s.text}|${cell}|${s.bodyPx}|${BODY_FONT.version}|${col}|${ol}|${dpr}`;
    if (key !== this.key) {
      this.key = key; const m = textCells(s.text), k = Math.max(1, Math.round(cell * dpr)), pad = s.bodyPx ? Math.ceil(2 * dpr) : k;
      const W = s.bodyPx ? Math.ceil(bodyW(s.text, s.bodyPx * dpr)) + pad * 2 : m.w * k + pad * 2;
      const H = s.bodyPx ? Math.ceil(s.bodyPx * dpr * 1.35) + pad * 2 : m.h * k + pad * 2;
      const c = makeCanvas(Math.max(1, W), Math.max(1, H)), g = c.getContext('2d') as CanvasRenderingContext2D;
      const draw = (fill: string, grow: number) => { g.fillStyle = fill; let cx = pad; for (const ch of s.text) { const gl = glyph(ch); gl.forEach((row, r) => [...row].forEach((b, i) => { if (b === '#') g.fillRect(cx + i * k - grow, pad + r * k - grow, k + grow * 2, k + grow * 2); })); cx += (gl[0].length + 1) * k; } };
      if (s.bodyPx) bodyText(g, s.text, pad, pad, s.bodyPx * dpr, col, 'left', ol);
      else { draw(ol, Math.max(1, Math.round(k * 0.5))); draw(col, 0); }
      g.fillStyle = 'rgba(0,0,0,0.22)'; // a 1-device-px lower shade on each cell gives the digits weight
      this.tex?.dispose(); this.tex = new THREE.CanvasTexture(c as HTMLCanvasElement); this.tex.colorSpace = THREE.SRGBColorSpace;
      this.tex.magFilter = THREE.NearestFilter; this.tex.minFilter = THREE.NearestFilter; this.tex.generateMipmaps = false;
      this.mat.map = this.tex; this.mat.needsUpdate = true; this.w = W / dpr; this.h = H / dpr;
    }
    const sc = s.scale ?? 1, w = this.w * sc, h = this.h * sc, ax = s.align === 'left' ? 0 : s.align === 'right' ? -w : -w / 2;
    this.mesh.scale.set(w, h, 1); this.mesh.position.set(Math.round(s.x + ax) + w / 2, -(Math.round(s.y - h / 2) + h / 2), 0);
    this.mat.opacity = s.alpha ?? 1; this.mesh.visible = s.visible !== false && (s.alpha ?? 1) > 0.01 && !!s.text;
  }
}

/** Keyed text labels in CSS px (y down). set(key, spec) every frame or on change; render() after the 3D frame. */
export class UiText {
  scene = new THREE.Scene(); cam = new THREE.OrthographicCamera(0, 1, 0, -1, -10, 10); private labels = new Map<string, Label>(); dpr = 1;
  resize(w: number, h: number, dpr: number) { this.cam.right = w; this.cam.bottom = -h; this.cam.updateProjectionMatrix(); this.dpr = dpr; for (const l of this.labels.values()) l.key = ''; }
  set(key: string, s: TextSpec) { let l = this.labels.get(key); if (!l) { l = new Label(this.scene); this.labels.set(key, l); } l.set(s, this.dpr); }
  hide(key: string) { const l = this.labels.get(key); if (l) l.mesh.visible = false; }
  render(r: THREE.WebGLRenderer) { const ac = r.autoClear; r.autoClear = false; r.setRenderTarget(null); r.render(this.scene, this.cam); r.autoClear = ac; }
}
