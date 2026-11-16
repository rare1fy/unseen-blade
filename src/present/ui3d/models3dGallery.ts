// Debug gallery of the R5 UI models (models3d.ts), drawn in the live UI layer over a dark backdrop: __dh.models3d() shows it,
// __dh.models3d(false) removes it; __dh.models3d(true, { yaw, pitch, dim, glow }) poses every model. Used for the screenshots
// handed to the HUD agent; not part of the game.
import * as THREE from 'three';
import { dh } from '../../debug/dh';
import { UI3D } from '../look/pixel';
import { onUpdate } from '../engine/world';
import { makeCanvas } from '../../platform/index';
import { skillIcon3D, relicModel3D, relicPedestal3D, patternBadge3D, type Model3D } from './models3d';

interface LayerLike { scene: THREE.Scene; at(x: number, y: number, z?: number): THREE.Vector3; px(n: number, z?: number): number; w: number; h: number }
let root: THREE.Group | null = null, models: Model3D[] = [], t = 0, spin = true;

function label(L: LayerLike, text: string, x: number, y: number, sizePx = 18, col = '#e8e0f4') {
  const k = 2, w = Math.ceil(text.length * sizePx * 1.05 + 12), h = sizePx + 10, c = makeCanvas(w * k, h * k), g = c.getContext('2d') as CanvasRenderingContext2D;
  g.font = `bold ${sizePx * k}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 4 * k; g.strokeStyle = '#0a0610';
  g.strokeText(text, (w * k) / 2, (h * k) / 2); g.fillStyle = col; g.fillText(text, (w * k) / 2, (h * k) / 2);
  const tex = new THREE.CanvasTexture(c as HTMLCanvasElement); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(L.px(w), L.px(h)), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
  m.position.copy(L.at(x, y, 5)); m.renderOrder = 5; return m;
}

function show(on = true, o: { yaw?: number; pitch?: number; dim?: number; glow?: number; spin?: boolean } = {}) {
  const L = UI3D.layer as unknown as LayerLike | null; if (!L || !L.at) return 'no UI layer';
  if (root) { root.parent?.remove(root); for (const m of models) m.dispose(); root = null; models = []; }
  if (!on) return 'off';
  spin = o.spin ?? true;
  root = new THREE.Group(); root.userData.noTilt = true; L.scene.add(root);
  const W = L.w, H = L.h, bd = new THREE.Mesh(new THREE.PlaneGeometry(L.px(W * 1.3, -20), L.px(H * 1.3, -20)), new THREE.MeshBasicMaterial({ color: 0x120e1c, transparent: true, opacity: 0.9, depthWrite: false }));
  bd.position.copy(L.at(W / 2, H / 2, -20)); bd.renderOrder = -1; root.add(bd);
  const S = Math.min(118, H / 7.6), gap = S * 1.45;
  const put = (m: Model3D, x: number, y: number, size: number, name: string) => {
    m.scale.setScalar(L.px(size)); m.position.copy(L.at(x, y, 0)); m.rotation.set(o.pitch ?? 0.28, o.yaw ?? -0.5, 0);
    if (o.dim) m.setDim(o.dim); if (o.glow != null) m.setGlow(o.glow);
    root!.add(m); models.push(m); root!.add(label(L, name, x, y + size * 0.62 + 12));
  };
  const rows: Array<[string, string[]]> = [
    ['魔导', ['奥术弹', '冰锥', '冰环', '闪电链', '陨石']],
    ['狂战', ['劈砍', '顺劈斩', '盾墙', '铁壁', '狂血', '血战']],
    ['刺客', ['袖箭', '背刺', '影步', '毒雾', '影舞']],
  ];
  const x0 = W / 2 - gap * 3.2;
  rows.forEach(([cls, names], r) => {
    const y = S * 0.85 + r * S * 1.75;
    root!.add(label(L, cls, x0 - gap * 0.9, y, 22, '#ffd860'));
    names.forEach((n, i) => put(skillIcon3D(n), x0 + i * gap, y, S, n));
  });
  const y4 = S * 0.85 + 3 * S * 1.75;
  root.add(label(L, '遗物', x0 - gap * 0.9, y4, 22, '#ffd860'));
  ['贪婪之手', '铁壁护符', '战场急救'].forEach((n, i) => {
    const x = x0 + i * gap, ped = relicPedestal3D(); ped.scale.setScalar(L.px(S)); ped.position.copy(L.at(x, y4 + S * 0.3, 0)); root!.add(ped); models.push(ped);
    const r = relicModel3D(n); r.scale.setScalar(0.72); r.position.y = r.size[1] * 0.36; r.rotation.y = o.yaw ?? -0.5; ped.seat.add(r); models.push(r);   // on the seat, bottom on the hover line
    root!.add(label(L, n, x, y4 + S * 0.62 + 12));
  });
  ['散骰', '同点', '连环', '阵列'].forEach((n, i) => put(patternBadge3D(n), x0 + (i + 3.4) * gap, y4, S * 0.6, n));
  return models.length + ' models';
}

onUpdate(dt => {
  if (!root) return; t += dt;
  for (const m of models) { if (spin && m.kind !== 'pedestal') m.idle(t, 0.03, 0.35); }
});
dh.add({ models3d: show });
