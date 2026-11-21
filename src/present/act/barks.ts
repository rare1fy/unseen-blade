// act-40 / act-136: 场景内喊话气泡（敌人开战喊话 / 行商招呼 / 名将报位）
// act-136 重做：告别刺眼惨白超长单行条——改为暖暗墨铁木/古纸像素气泡、定宽自动换行（最多 2 行，每行约 12~14 字），
// 硬边切角 + 像素尖角指向说话人头顶，严格视口防裁切并避让顶部横幅。
import * as THREE from 'three';
import type { UiLayer } from '../ui3d/layer';
import { worldToUi } from '../ui3d/layer';
import { bodyText, bodyW, BODY_FONT } from '../ui3d/bodyFont';
import { language, t as localize, wrapWords } from './i18n';
import { makeCanvas } from '../../platform/index';

/** the Yellow Turbans' shouts (short, rough, in their own voice) */
export const BARK_LINES = ['苍天已死，黄天当立！', '瞎子？送死来了！', '围上去，砍了他！', '白毛的，留下刀！', '天公将军护着咱！', '一个瞎子，怕什么！',
  '别让他跑了！', '宰了他，刀归我！', '杀——！', '哪来的疯子？！', '兄弟们，上！', '黄天在上，砍！'];

function wrapBark(msg: string, maxW: number, fpx: number): string[] {
  const tr = localize(msg);
  if (language === 'en') {
    const lines = wrapWords(tr, maxW, s => bodyW(s, fpx));
    return lines.length <= 2 ? lines : [lines[0], lines.slice(1).join(' ')];
  }
  const chars = [...tr];
  if (bodyW(tr, fpx) <= maxW) return [tr];
  // Balance cleanly into 2 lines near punctuation or midpoint so bubbles stay compact and natural
  const rows: string[] = [];
  let row = '';
  for (const ch of chars) {
    if (bodyW(row + ch, fpx) > maxW && row) {
      rows.push(row);
      row = ch;
    } else {
      row += ch;
    }
  }
  if (row) rows.push(row);
  if (rows.length > 2) {
    const mid = Math.ceil(chars.length / 2);
    // prefer breaking after a natural punctuation mark near the middle
    let split = mid;
    for (let d = 0; d <= 4; d++) {
      for (const idx of [mid + d, mid - d]) {
        if (idx > 2 && idx < chars.length - 2 && /[，。！？、；]/.test(chars[idx - 1])) { split = idx; d = 99; break; }
      }
    }
    return [chars.slice(0, split).join(''), chars.slice(split).join('')];
  }
  return rows;
}

interface Bubble { mesh: THREE.Mesh; tex: THREE.CanvasTexture; w: number; h: number; head: () => THREE.Vector3; t: number; life: number }
export class Barks {
  private list: Bubble[] = []; private last = -1;
  constructor(private L: UiLayer) {}
  /** a foe or NPC calls out; head() = where its head is now (world) */
  say(head: () => THREE.Vector3, line?: string) {
    if (this.list.length >= 3) return;
    let i = Math.floor(Math.random() * BARK_LINES.length); if (i === this.last) i = (i + 1) % BARK_LINES.length; this.last = i;
    const msg = line ?? BARK_LINES[i];
    const dpr = Math.max(1, Math.round(this.L.dpr || 1));
    const kk = Math.max(0.84, Math.min(1.18, this.L.h / 720));
    const fpx = Math.round(16 * kk * dpr);
    const maxLineW = Math.round(Math.min(this.L.w * 0.28, 250 * kk) * dpr);
    const rows = wrapBark(msg, maxLineW, fpx);
    const u = Math.max(1, Math.round(2 * dpr));
    const padX = Math.round(11 * kk * dpr), padY = Math.round(7 * kk * dpr), tail = Math.round(7 * kk * dpr);
    const lineH = Math.round(fpx * 1.32);
    const widest = Math.max(...rows.map(r => Math.ceil(bodyW(r, fpx))), Math.round(48 * dpr));
    const w = widest + padX * 2 + u * 2;
    const hb = rows.length * lineH + padY * 2 + u * 2;
    const c = makeCanvas(Math.ceil(w), Math.ceil(hb + tail)) as HTMLCanvasElement;
    c.width = Math.ceil(w); c.height = Math.ceil(hb + tail);
    const g = c.getContext('2d')!; g.imageSmoothingEnabled = false;

    // Warm dark-ink & antique-bronze pixel speech bubble (matches the iron-lacquer UI language, zero blinding white bar!)
    g.fillStyle = '#09070c';
    g.fillRect(u, 0, c.width - 2 * u, hb);
    g.fillRect(0, u, c.width, hb - 2 * u);
    g.fillStyle = '#b48d52';
    g.fillRect(u * 2, u, c.width - 4 * u, hb - 2 * u);
    g.fillRect(u, u * 2, c.width - 2 * u, hb - 4 * u);
    g.fillStyle = '#18141e';
    g.fillRect(u * 2, u * 2, c.width - 4 * u, hb - 4 * u);
    g.fillStyle = '#292232';
    g.fillRect(u * 2, u * 2, c.width - 4 * u, u);

    // Stepped pixel pointer tail centered slightly left-of-center
    const tx = Math.round(c.width * 0.42);
    for (let k = 0; k < tail; k += u) {
      const span = Math.max(u, tail - k);
      g.fillStyle = '#09070c';
      g.fillRect(tx - u, hb - u + k, span + 2 * u, u);
      g.fillStyle = k === 0 ? '#18141e' : '#b48d52';
      g.fillRect(tx, hb - u + k, span, u);
      if (span > u * 2) {
        g.fillStyle = '#18141e';
        g.fillRect(tx + u, hb - u + k, span - u * 2, u);
      }
    }

    rows.forEach((r, ri) => {
      const y = Math.round(padY + u + ri * lineH + (lineH - fpx) * 0.15);
      bodyText(g, r, c.width / 2, y, fpx, '#f6eedc', 'center', '#08060c');
    });

    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = tex.minFilter = BODY_FONT.current === 'pixel' ? THREE.NearestFilter : THREE.LinearFilter;
    tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    mesh.renderOrder = 50; this.L.text.scene.add(mesh);
    this.list.push({ mesh, tex, w: c.width / dpr, h: c.height / dpr, head, t: 0, life: 2.5 });
  }
  update(dt: number, hidden: boolean, bannerBottom = 0) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i]; b.t += dt;
      if (b.t >= b.life) { this.drop(b); this.list.splice(i, 1); continue; }
      const pin = Math.min(1, b.t / 0.12), pout = Math.min(1, (b.life - b.t) / 0.18), k = Math.min(1 - (1 - pin) ** 3, pout);
      const p = worldToUi(b.head().add(new THREE.Vector3(0, 0.72, 0))), L = this.L;
      const x = p.x + b.w * 0.08;
      const center = Math.min(L.w - b.w / 2 - 10, Math.max(b.w / 2 + 10, x));
      const y = p.y - b.h / 2;
      const hudTop = center - b.w / 2 < L.w * 0.32 ? L.h * 0.19 : 0;
      const minY = Math.max(L.h * 0.06, bannerBottom + 8, hudTop) + b.h / 2;
      const centerY = Math.min(L.h - b.h / 2 - 10, Math.max(minY, y));
      b.mesh.position.set(Math.round(center), -Math.round(centerY), 0);
      b.mesh.scale.set(b.w * k, b.h * k, 1);
      b.mesh.visible = !hidden && k > 0.02 && p.z < 1;
    }
  }
  clear() { for (const b of this.list) this.drop(b); this.list = []; }
  private drop(b: Bubble) { this.L.text.scene.remove(b.mesh); b.tex.dispose(); (b.mesh.material as THREE.Material).dispose(); b.mesh.geometry.dispose(); }
}
