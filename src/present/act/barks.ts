// act-40 (用户：「做点小杂兵的战斗中说话气泡，顶头上那种，战斗开始的时候会说两句」): a white speech bubble over a foe's head, a short
// shout in the pixel font; when a wave comes in, one or two of them call out (not the hounds, not the boss). The bubble pops in, holds
// about two seconds and shrinks away; it follows the head; it is hidden while a conversation or a cutscene is up.
import * as THREE from 'three';
import type { UiLayer } from '../ui3d/layer';
import { worldToUi } from '../ui3d/layer';
import { text, textW } from '../v2/overlay';
import { PIX_H } from '../v2/pix';
import { language } from './i18n';

/** the Yellow Turbans' shouts (short, rough, in their own voice) */
export const BARK_LINES = ['苍天已死，黄天当立！', '瞎子？送死来了！', '围上去，砍了他！', '白毛的，留下刀！', '天公将军护着咱！', '一个瞎子，怕什么！',
  '别让他跑了！', '宰了他，刀归我！', '杀——！', '哪来的疯子？！', '兄弟们，上！', '黄天在上，砍！'];

interface Bubble { mesh: THREE.Mesh; tex: THREE.CanvasTexture; w: number; h: number; head: () => THREE.Vector3; t: number; life: number }
export class Barks {
  private list: Bubble[] = []; private last = -1;
  constructor(private L: UiLayer) {}
  /** a foe calls out; head() = where its head is now (world) */
  say(head: () => THREE.Vector3, line?: string) {
    if (this.list.length >= 3) return;
    let i = Math.floor(Math.random() * BARK_LINES.length); if (i === this.last) i = (i + 1) % BARK_LINES.length; this.last = i;
    const msg = line ?? BARK_LINES[i], dpr = Math.max(1, Math.round(this.L.dpr || 1)), S = (this.L.h >= 600 ? 2 : 1) * dpr, pad = 6 * dpr, tail = 6 * dpr;
    const tw = textW(msg, S), w = tw + pad * 2, hb = PIX_H * S + pad * 2, c = document.createElement('canvas'); c.width = w; c.height = hb + tail;
    const g = c.getContext('2d')!; g.imageSmoothingEnabled = false;
    // the bubble: a white box with its corners stepped off, a dark rim, a small tail down at the left third
    const r = 3 * dpr; g.fillStyle = '#16121a'; g.fillRect(r, 0, w - 2 * r, hb); g.fillRect(0, r, w, hb - 2 * r);
    g.fillStyle = '#f4efe6'; g.fillRect(r, dpr, w - 2 * r, hb - 2 * dpr); g.fillRect(dpr, r, w - 2 * dpr, hb - 2 * r);
    const tx = Math.round(w * 0.3); for (let k = 0; k < tail; k += dpr) { g.fillStyle = '#16121a'; g.fillRect(tx + k - dpr, hb - dpr + k, tail - k + 2 * dpr, dpr); g.fillStyle = '#f4efe6'; g.fillRect(tx + k, hb - dpr + k, Math.max(0, tail - k), dpr); }
    text(g, msg, pad, pad, S, '#1c1418', 'left', null);
    const tex = new THREE.CanvasTexture(c); tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
    mesh.renderOrder = 40; this.L.scene.add(mesh);
    this.list.push({ mesh, tex, w: c.width / dpr, h: c.height / dpr, head, t: 0, life: 2.3 });
  }
  update(dt: number, hidden: boolean, bannerBottom = 0) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i]; b.t += dt;
      if (b.t >= b.life) { this.drop(b); this.list.splice(i, 1); continue; }
      const pin = Math.min(1, b.t / 0.12), pout = Math.min(1, (b.life - b.t) / 0.18), k = Math.min(1 - (1 - pin) ** 3, pout);
      const p = worldToUi(b.head().add(new THREE.Vector3(0, 0.55, 0))), L = this.L;
      const x = p.x + b.w * 0.2;
      const center = language === 'en' ? Math.min(L.w - b.w / 2, Math.max(b.w / 2, x)) : x;
      const y = p.y - b.h / 2;
      // A boss at the far wall can project above the viewport. Keep the line below the room plaque.
      const minY = Math.max(L.h * 0.06, bannerBottom + 4) + b.h / 2;
      const centerY = language === 'en' ? Math.min(L.h - b.h / 2, Math.max(minY, y)) : y;
      L.at(Math.round(center), Math.round(centerY), 0, b.mesh.position); b.mesh.scale.set(L.px(b.w) * k, L.px(b.h) * k, 1);
      b.mesh.visible = !hidden && k > 0.02;
    }
  }
  clear() { for (const b of this.list) this.drop(b); this.list = []; }
  private drop(b: Bubble) { this.L.scene.remove(b.mesh); b.tex.dispose(); (b.mesh.material as THREE.Material).dispose(); b.mesh.geometry.dispose(); }
}
