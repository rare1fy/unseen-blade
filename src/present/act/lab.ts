// 模型查看页（act-21，用户：「再近一步你建模个白发女给我看看，在一个页面里看，带技能动作的」）。
// 打开方式：网址加 ?lab，或桌面的「不见刀_白发女模型.html」。在据点的试剑坪上，主角站在木人桩前：
//   右边一列按钮——招式（真的按键序列，走游戏里同一套动作和特效）、镜头（特写转圈 / 正 / 侧 / 背 / 游戏镜头）、2x 像素开关、
//   模型切换（细格子 ↔ 7 厘米）、并排对比（另一个站在旁边）。电脑上键盘照样能自己操作（WASD / J / K / L / 空格）。
// 这是给用户看模型用的工具页，不是游戏界面，所以用普通网页按钮。
import { onUpdate } from '../engine/world';

export type Btn = 'attack' | 'dash' | 'special' | 'jump';
export interface LabHost {
  /** the hero back at the mark, facing the dummy */ home(): void;
  hold(b: Btn, sec: number): void;
  stick(x: number, y: number, sec: number): void;
  /** the camera: base / look (world) and fov, or null = the game's own camera */ cam(base: number[] | null, look?: number[], fov?: number): void;
  hero(): { x: number; y: number; z: number; yaw: number };
  /** where the side-by-side model stands, or null */ other(): { x: number; z: number } | null;
  model(): string; setModel(id: string): void;
  compare(on: boolean): void;
  pixel(on?: boolean): boolean;
  arrow(d: number): void;
  intent(n: number): void;
  stats(): { calls: number; tris: number };
}
type Step = [number, () => void];

export function openLab(h: LabHost, models: Array<{ id: string; name: string }>) {
  const T: number[] = [];
  const run = (steps: Step[]) => { for (const t of T) clearTimeout(t); T.length = 0; h.home(); for (const [ms, fn] of steps) T.push(window.setTimeout(fn, ms + 250)); };
  const tap = (b: Btn, ms = 0): Step => [ms, () => h.hold(b, 0.07)];
  // the moves: the same buttons a player presses, in the same rhythm
  const MOVES: Array<[string, Step[]]> = [
    ['连环刀（五刀）', [tap('attack'), tap('attack', 520), tap('attack', 1060), tap('attack', 1720), tap('attack', 2560)]],
    ['藏锋 → 箭步斩', [[0, () => h.hold('attack', 0.95)]]],
    ['破势（接一箭）', [[0, () => h.hold('attack', 1.05)], [350, () => h.arrow(6)]]],
    ['冲刺', [tap('dash')]],
    ['穿风斩', [tap('dash'), tap('attack', 90)]],
    ['跳 · 二段跳 · 劈山', [tap('jump'), tap('jump', 380), tap('attack', 760)]],
    ['柳叶镖', [tap('special'), tap('special', 330), tap('special', 660)]],
    ['回身镖', [tap('dash'), tap('special', 90)]],
    ['挑云（斩 → 跳）', [tap('attack'), tap('jump', 260)]],
    ['迎面镖（斩 → 镖）', [tap('attack'), tap('special', 260)]],
    ['游身斩（斩 → 冲）', [tap('attack'), tap('dash', 260)]],
    ['扫八方（两刀一顿）', [tap('attack'), tap('attack', 520), tap('attack', 1500)]],
    ['穿心腿（冲 → 跳）', [tap('dash'), tap('jump', 90)]],
    ['不见刀（满杀气 + 破势）', [[0, () => h.intent(3)], [0, () => h.hold('attack', 1.05)], [350, () => h.arrow(6)]]],
    ['跑一圈', [[0, () => h.stick(1, 0, 0.7)], [700, () => h.stick(0, 1, 0.6)], [1300, () => h.stick(-1, 0, 0.7)], [2000, () => h.stick(0, -1, 0.6)]]],
  ];
  const DEMO: Step[] = []; { let t = 0; for (const [, steps] of MOVES.slice(0, 13)) { const last = Math.max(...steps.map(s => s[0])); for (const [ms, fn] of steps) DEMO.push([t + ms, fn]); t += last + 2600; DEMO.push([t - 300, () => h.home()]); } }

  // ---------------------------------------------------------------- the camera
  let view: 'orbit' | 'front' | 'side' | 'back' | 'game' = 'orbit', ang = 0.6, dist = 4.8, spin = true;
  onUpdate((dt) => {
    if (view === 'game') return;
    const p = h.hero(), o = h.other(); if (view === 'orbit' && spin) ang += dt * 0.35;
    // (the front view a little off her line, so the dummy she faces doesn't stand in the way)
    const a = view === 'orbit' ? ang : p.yaw + (view === 'front' ? (o ? 0.12 : 0.75) : view === 'side' ? Math.PI / 2 : Math.PI);
    // follow her up a jump; side by side: look between the two and stand back far enough for both
    const cx = o ? (p.x + o.x) / 2 : p.x, cz = o ? (p.z + o.z) / 2 : p.z, d = o ? Math.max(dist, 5.6) : dist, ly = 1.0 + p.y * 0.8;
    h.cam([cx + Math.sin(a) * d, (view === 'orbit' ? 1.8 : 1.5) + p.y * 0.8, cz + Math.cos(a) * d], [cx, ly, cz], 32);
  });
  const setView = (v: typeof view) => { view = v; if (v === 'game') h.cam(null); refresh(); };

  // ---------------------------------------------------------------- the panel
  const css = `#lab{position:fixed;right:8px;top:8px;bottom:8px;width:216px;overflow:auto;background:rgba(14,12,16,.82);color:#f0e6d2;
    font:13px/1.35 system-ui,'Microsoft YaHei',sans-serif;border:1px solid #5a2a22;border-radius:6px;padding:8px;z-index:50;-webkit-user-select:none;user-select:none}
    #lab h3{margin:8px 0 4px;font-size:12px;color:#e2b86a;font-weight:600}#lab .row{display:flex;flex-wrap:wrap;gap:4px}
    #lab button{flex:1 1 92px;background:#2a2228;color:#f0e6d2;border:1px solid #5a4a48;border-radius:4px;padding:5px 4px;font:inherit;cursor:pointer}
    #lab button:active,#lab button.on{background:#7a2a22;border-color:#c23a30}#lab .info{font-size:11px;color:#b8ab98;margin-top:6px;white-space:pre-line}
    #labToggle{position:fixed;right:8px;top:8px;z-index:51;display:none;background:#7a2a22;color:#fff;border:0;border-radius:4px;padding:6px 10px;font:13px system-ui}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const box = document.createElement('div'); box.id = 'lab'; document.body.appendChild(box);
  const show = document.createElement('button'); show.id = 'labToggle'; show.textContent = '面板'; document.body.appendChild(show);
  show.onclick = () => { box.style.display = ''; show.style.display = 'none'; };
  const sec = (t: string) => { const e = document.createElement('h3'); e.textContent = t; box.appendChild(e); const r = document.createElement('div'); r.className = 'row'; box.appendChild(r); return r; };
  const btn = (r: HTMLElement, t: string, fn: () => void) => { const b = document.createElement('button'); b.textContent = t; b.onclick = (e) => { e.stopPropagation(); fn(); refresh(); }; b.onpointerdown = e => e.stopPropagation(); r.appendChild(b); return b; };

  const head = sec('模型'); const mBtns = models.map(m => [m.id, btn(head, m.name, () => h.setModel(m.id))] as const);
  let cmp = false; const cBtn = btn(head, '并排对比', () => { cmp = !cmp; h.compare(cmp); });
  const camR = sec('镜头');
  const vBtns = ([['orbit', '特写转圈'], ['front', '正面'], ['side', '侧面'], ['back', '背面'], ['game', '游戏镜头']] as const).map(([v, t]) => [v, btn(camR, t, () => setView(v))] as const);
  const sBtn = btn(camR, '暂停转圈', () => { spin = !spin; });
  btn(camR, '拉近', () => { dist = Math.max(2.2, dist - 0.8); }); btn(camR, '拉远', () => { dist = Math.min(12, dist + 0.8); });
  const pBtn = btn(camR, '2x 像素', () => { h.pixel(!h.pixel()); });
  const mv = sec('招式（点了从木人桩前开始）');
  btn(mv, '▶ 全部演示一遍', () => run(DEMO));
  for (const [t, steps] of MOVES) btn(mv, t, () => run(steps));
  const hideR = sec(''); btn(hideR, '收起面板', () => { box.style.display = 'none'; show.style.display = ''; });
  const info = document.createElement('div'); info.className = 'info'; box.appendChild(info);
  const refresh = () => {
    for (const [id, b] of mBtns) b.classList.toggle('on', h.model() === id);
    for (const [v, b] of vBtns) b.classList.toggle('on', view === v);
    cBtn.classList.toggle('on', cmp); sBtn.textContent = spin ? '暂停转圈' : '继续转圈'; pBtn.classList.toggle('on', h.pixel());
  };
  const tick = () => { const s = h.stats(); info.textContent = `电脑：WASD 走 · J 斩（按住藏锋）· K 冲 · L 镖 · 空格 跳\n每帧绘制 ${s.calls} 次 · ${Math.round(s.tris / 1000)}k 三角面`; };
  window.setInterval(tick, 1000); tick(); refresh();
}
