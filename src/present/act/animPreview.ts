// 动作预览页（11-18，用户：「哪个杜五走路的动作及其不自然，手和腿不在一个节奏上。其他角色我看不到，能不能给我做一个网页我整体预览一下」）。
// 打开方式：网址加 ?anim，或桌面的「不见刀_动作预览.html」。一块空地上摆一组人（据点的人、每一关的敌人），可以整组一起看，也可以点一个单看；
// 让他们站着 / 走 / 跑（脚下的地面跟着往后走，像跑步机，所以落地的脚应该钉在地上不滑）、出招、施法、吼、从前 / 侧 / 后挨打、倒地；
// 镜头侧面 / 正面 / 背面 / 游戏镜头 / 转圈，放慢到一半或四分之一看节奏。这是给用户看动作的工具页，不是游戏界面，所以用普通网页按钮
// （只在网页版里有：微信里没有 DOM，进不来）。
import * as THREE from 'three';
import { onUpdate, scene, V3 } from '../engine/world';
import type { ModelDef } from '../bestiary/models';
import type { BattleActor } from '../bestiary/battle';

export interface AnimHost {
  /** where the group stands (the yard's open middle) */
  home: { x: number; z: number };
  make(def: ModelDef): BattleActor;
  cam(base: number[] | null, look?: number[], fov?: number): void;
}
export interface AnimItem { def: ModelDef; name: string; npc: boolean }
type Mode = 'idle' | 'slow' | 'walk' | 'run';
type View = 'side' | 'front' | 'back' | 'game' | 'orbit';
const SPEED: Record<Mode, number> = { idle: 0, slow: 1.25, walk: 2.0, run: 4.0 };
/** a person's walk turns this fast at 1.25 m/s (the cutscenes' pace, act/prologue.ts) — scaled with the speed */
const NPC_PH = 7.5, NPC_PH_QUAD = 6.5;

export function openAnimPreview(h: AnimHost, groups: Array<{ name: string; items: AnimItem[] }>) {
  const root = new THREE.Group(); scene.add(root);
  // the bare floor: a plain plane and a 0.5 m grid that slides under them while they walk (a treadmill: their planted feet should stay put on it)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshLambertMaterial({ color: 0x9a968c }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(h.home.x, -0.002, h.home.z); floor.receiveShadow = true; root.add(floor);
  const grid = new THREE.GridHelper(40, 80, 0x55524c, 0x6e6a62); grid.position.set(h.home.x, 0.002, h.home.z); root.add(grid);
  // everything else in the scene out of sight, but the lights (their own and the stage's)
  // (every frame: the yard's own code shows its people, the donkey and the hero again)
  const lit = new WeakMap<THREE.Object3D, boolean>();
  const hide = (o: THREE.Object3D) => {
    if (o === root || (o as THREE.Light).isLight) return;
    let l = lit.get(o); if (l == null) { l = false; o.traverse(c => { if ((c as THREE.Light).isLight) l = true; }); lit.set(o, l); }
    if (l) { o.children.forEach(hide); return; }
    o.visible = false;
  };

  let gi = 0, pick = -1, mode: Mode = 'idle', view: View = 'side', slow = 1, ang = 0.5, zoom = 1, t = 0;
  let acts: Array<{ a: BattleActor; it: AnimItem; x: number; z: number; ph?: number; kneel: number; downT: number }> = [];
  const yawOf = () => (view === 'front' ? 0 : view === 'back' ? Math.PI : Math.PI / 2);
  const build = () => {
    for (const s of acts) { s.a.root.removeFromParent(); s.a.dispose(); }
    const g = groups[gi], list = pick >= 0 ? [g.items[pick]] : g.items;
    // rows of up to six along x, a little wider apart for the four-legged and the big ones
    const per = 6, gap = list.some(it => it.def.kind === 'quad' || it.def.group === '首领') ? 3.2 : 2.6;
    acts = list.map((it, i) => {
      const row = Math.floor(i / per), col = i % per, inRow = Math.min(per, list.length - row * per);
      const x = h.home.x + (col - (inRow - 1) / 2) * gap, z = h.home.z - row * 3.6;
      const a = h.make(it.def); a.place(V3(x, 0, z), yawOf()); root.add(a.root); a.update(0.016);
      return { a, it, x, z, kneel: 0, downT: -1 };
    });
    (window as unknown as { __anim?: unknown }).__anim = acts;   // (captures: the figures on show)
    refresh();
  };
  const extent = () => {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const s of acts) { x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); z0 = Math.min(z0, s.z); z1 = Math.max(z1, s.z); }
    return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 };
  };
  const act = (fn: (s: (typeof acts)[number]) => void) => { for (const s of acts) if (s.downT < 0) fn(s); };
  const foeOnly = (fn: (a: BattleActor) => unknown) => act(s => { if (!s.it.npc) fn(s.a); });

  onUpdate((rdt) => {
    scene.children.forEach(hide);
    const dt = rdt * slow, v = SPEED[mode], yaw = yawOf(), dx = Math.sin(yaw), dz = Math.cos(yaw);
    t += dt;
    // the ground slides back under them at their walking speed
    if (v > 0) { grid.position.x -= dx * v * dt; grid.position.z -= dz * v * dt; grid.position.x = h.home.x + ((((grid.position.x - h.home.x) % 0.5) + 0.5) % 0.5); grid.position.z = h.home.z + ((((grid.position.z - h.home.z) % 0.5) + 0.5) % 0.5); }
    const vel = { x: dx * v, z: dz * v };
    for (const s of acts) {
      const a = s.a as BattleActor & { walkPh?: number; kneel?: number };
      if (s.downT >= 0) { s.downT -= dt; if (s.downT < 0) { build(); return; } }
      a.yaw = yaw; a.place(V3(s.x, 0, s.z), yaw);
      if (s.it.npc) {
        // the people walk by a phase the cutscenes turn (act/hideout_people.ts walkOver); they don't run — a brisk walk at most
        const nv = Math.min(v, 2.0), quad = s.it.def.kind === 'quad';
        a.walkPh = nv > 0 && !s.kneel ? (a.walkPh ?? 0) + dt * (quad ? NPC_PH_QUAD : NPC_PH) * (nv / 1.25) : undefined;
        a.kneel = s.kneel;
      } else a.setRunning(v > 0.6, v, yaw, vel);
      a.update(dt);
    }
    // the camera
    // (a single figure: far enough back to see head to foot; the panel covers the right of the screen, so the camera looks a little to
    //  the right of the group — they stand left of the middle)
    const e = extent(), W = Math.max(2.2, e.w), D = Math.max(6.2, (W / 2 + 1.8) * 2.6 + e.d * 0.6) * zoom, off = D * 0.1;
    if (view === 'game') h.cam([e.cx + off, 9.5 * Math.max(1, W / 12) * zoom, e.cz + 8.5 * Math.max(1, W / 12) * zoom], [e.cx + off, 0.4, e.cz - e.d / 2], 38);
    else if (view === 'orbit') { ang += rdt * 0.4; h.cam([e.cx + Math.sin(ang) * D, 2.2, e.cz - e.d / 2 + Math.cos(ang) * D], [e.cx, 0.9, e.cz - e.d / 2], 32); }
    else h.cam([e.cx + off, 1.3, e.cz + D], [e.cx + off, 0.9, e.cz - e.d / 2], 30);
  });

  // ---------------------------------------------------------------- the panel
  const css = `#anim{position:fixed;right:8px;top:8px;bottom:8px;width:236px;overflow:auto;background:rgba(14,12,16,.84);color:#f0e6d2;
    font:13px/1.35 system-ui,'Microsoft YaHei',sans-serif;border:1px solid #5a2a22;border-radius:6px;padding:8px;z-index:50;-webkit-user-select:none;user-select:none}
    #anim h3{margin:8px 0 4px;font-size:12px;color:#e2b86a;font-weight:600}#anim .row{display:flex;flex-wrap:wrap;gap:4px}
    #anim button{flex:1 1 100px;background:#2a2228;color:#f0e6d2;border:1px solid #5a4a48;border-radius:4px;padding:5px 4px;font:inherit;cursor:pointer}
    #anim button.on{background:#7a2a22;border-color:#c23a30}#anim .info{font-size:11px;color:#b8ab98;margin-top:6px;white-space:pre-line}
    #animToggle{position:fixed;right:8px;top:8px;z-index:51;display:none;background:#7a2a22;color:#fff;border:0;border-radius:4px;padding:6px 10px;font:13px system-ui}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const box = document.createElement('div'); box.id = 'anim'; document.body.appendChild(box);
  const show = document.createElement('button'); show.id = 'animToggle'; show.textContent = '面板'; document.body.appendChild(show);
  show.onclick = () => { box.style.display = ''; show.style.display = 'none'; };
  const sec = (title: string) => { const e = document.createElement('h3'); e.textContent = title; box.appendChild(e); const r = document.createElement('div'); r.className = 'row'; box.appendChild(r); return r; };
  const btn = (r: HTMLElement, title: string, fn: () => void) => { const b = document.createElement('button'); b.textContent = title; b.onclick = e => { e.stopPropagation(); fn(); refresh(); }; b.onpointerdown = e => e.stopPropagation(); r.appendChild(b); return b; };

  const gR = sec('哪一组');
  const gBtns = groups.map((g, i) => btn(gR, g.name, () => { gi = i; pick = -1; build(); listRow(); }));
  const pR = sec('谁（点一个单看）');
  let pBtns: HTMLButtonElement[] = [];
  const allBtn = btn(pR, '整组一起看', () => { pick = -1; build(); });
  const listRow = () => { for (const b of pBtns) b.remove(); pBtns = groups[gi].items.map((it, i) => btn(pR, it.name, () => { pick = i; build(); })); refresh(); };
  const mR = sec('走跑');
  const mBtns = ([['idle', '站着'], ['slow', '慢走'], ['walk', '走'], ['run', '跑']] as const).map(([m, title]) => [m, btn(mR, title, () => { mode = m; act(s => { s.kneel = 0; }); })] as const);
  const aR = sec('动作');
  btn(aR, '出招', () => foeOnly(a => a.attack()));
  btn(aR, '施法', () => foeOnly(a => a.cast()));
  btn(aR, '吼', () => foeOnly(a => a.roar()));
  btn(aR, '正面挨打', () => act(s => { (s.a as unknown as { hurt(p: number, f?: number): void }).hurt(1.4, 0); }));
  btn(aR, '侧面挨打', () => act(s => { (s.a as unknown as { hurt(p: number, f?: number): void }).hurt(1.4, Math.PI / 2); }));
  btn(aR, '背后挨打', () => act(s => { (s.a as unknown as { hurt(p: number, f?: number): void }).hurt(1.4, Math.PI); }));
  btn(aR, '倒地', () => act(s => { if (s.it.npc) return; s.a.fall(); s.downT = 2.8; }));
  btn(aR, '蹲下 / 起来', () => act(s => { if (s.it.npc && s.it.def.kind !== 'quad') { s.kneel = s.kneel ? 0 : 1; if (s.kneel) mode = 'idle'; } }));
  const cR = sec('镜头');
  const vBtns = ([['side', '侧面'], ['front', '正面'], ['back', '背面'], ['game', '游戏镜头'], ['orbit', '转圈']] as const).map(([v, title]) => [v, btn(cR, title, () => { view = v; })] as const);
  btn(cR, '拉近', () => { zoom = Math.max(0.35, zoom * 0.8); }); btn(cR, '拉远', () => { zoom = Math.min(3, zoom * 1.25); });
  const sR = sec('速度');
  const sBtns = ([[1, '原速'], [0.5, '慢一半'], [0.25, '慢四倍']] as const).map(([k, title]) => [k, btn(sR, title, () => { slow = k; })] as const);
  const hR = sec(''); btn(hR, '收起面板', () => { box.style.display = 'none'; show.style.display = ''; });
  const info = document.createElement('div'); info.className = 'info'; box.appendChild(info);
  function refresh() {
    gBtns.forEach((b, i) => b.classList.toggle('on', gi === i));
    allBtn.classList.toggle('on', pick < 0); pBtns.forEach((b, i) => b.classList.toggle('on', pick === i));
    for (const [m, b] of mBtns) b.classList.toggle('on', mode === m);
    for (const [v, b] of vBtns) b.classList.toggle('on', view === v);
    for (const [k, b] of sBtns) b.classList.toggle('on', slow === k);
    const g = groups[gi];
    info.textContent = `${g.name}${pick >= 0 ? ' · ' + g.items[pick].name : `（${g.items.length} 个）`}\n走跑时脚下的格子往后走，落地的脚应该钉在格子上。\n据点的人不跑：选「跑」时他们快走。`;
  }
  build(); listRow();
}
