// 动作预览与定稿评审台（打开方式：网址加 ?anim，或桌面的「不见刀_动作预览.html」）。
// 支持：主角刘白（白发/斗笠）、据点 NPC、五关全部敌人；站/慢走/走/跑（跑步机地面防滑步校验）、招式直选/循环/进度条逐帧校验、
// 9 项动作参数实时精调与 A/B 预设对比、带上下文标签的评审留言本与一键复制定稿单。
// （仅工具页 DOM，不进入微信小游戏主流程，已在 tests/i18n.test.ts 中豁免。）
import * as THREE from 'three';
import { onUpdate, scene, V3 } from '../engine/world';
import type { ModelDef } from '../bestiary/models';
import type { BattleActor } from '../bestiary/battle';
import { Action } from '../actors/rig';
import { movesOf, type FoeMove } from './animCatalog';
import { FINE_WHITE, FINE_HAT } from './heroineFine';
import { motionOf, type WarpKey } from './ninjaAct';
import { MOTION_TUNE, MOTION_TUNE_DEFAULTS, resetMotionTune, type MotionTune } from './motionTune';

/** hero preview moves (matching hero.ts CUT_T warps & timings for 0.25× slow-mo verification) */
type HeroMode = 'charge' | 'jump' | 'flip' | 'plunge' | 'airAct' | 'swoop' | 'dart' | 'dartBack';
interface HeroPreviewMove { label: string; kind: 'act' | HeroMode; name: string; dur: number; at: number; warp?: WarpKey[]; data?: Record<string, unknown> }
const HERO_MOVES: HeroPreviewMove[] = [
  { label: '一段横斩', kind: 'act', name: 'k1', dur: 0.46, at: 0.13 / 0.46, warp: [[0.09 / 0.46, 0.3, 'io'], [0.13 / 0.46, 0.42, 'in'], [0.19 / 0.46, 0.62, 'out'], [0.25 / 0.46, 0.65, 'lin'], [1, 1, 'io']] },
  { label: '二段反撩', kind: 'act', name: 'k2', dur: 0.46, at: 0.13 / 0.46, warp: [[0.09 / 0.46, 0.28, 'io'], [0.13 / 0.46, 0.4, 'in'], [0.19 / 0.46, 0.58, 'out'], [0.25 / 0.46, 0.62, 'lin'], [1, 1, 'io']] },
  { label: '三段旋斩', kind: 'act', name: 'k3', dur: 0.62, at: 0.31 / 0.62, warp: [[0.22 / 0.62, 0.18, 'io'], [0.25 / 0.62, 0.28, 'in'], [0.31 / 0.62, 0.5, 'lin'], [0.4 / 0.62, 0.72, 'out'], [0.46 / 0.62, 0.75, 'lin'], [1, 1, 'io']] },
  { label: '四段连刺', kind: 'act', name: 'k4', dur: 0.58, at: 0.13 / 0.58, warp: [[0.1 / 0.58, 0.24, 'io'], [0.13 / 0.58, 0.3, 'in'], [0.17 / 0.58, 0.4, 'out'], [0.21 / 0.58, 0.5, 'io'], [0.24 / 0.58, 0.56, 'in'], [0.34 / 0.58, 0.74, 'lin'], [1, 1, 'io']] },
  { label: '五段重劈', kind: 'act', name: 'k5', dur: 0.88, at: 0.38 / 0.88, warp: [[0.22 / 0.88, 0.42, 'io'], [0.34 / 0.88, 0.43, 'lin'], [0.38 / 0.88, 0.5, 'in'], [0.46 / 0.88, 0.62, 'out'], [0.56 / 0.88, 0.65, 'lin'], [1, 1, 'io']] },
  { label: '藏锋蓄势', kind: 'charge', name: 'charge', dur: 1.1, at: 0.5 },
  { label: '拔刀破势', kind: 'act', name: 'rel', dur: 0.42, at: 0.24 },
  { label: '归鞘', kind: 'act', name: 'noto', dur: 0.95, at: 0.64 },
  { label: '普通跳', kind: 'jump', name: 'jump', dur: 0.76, at: 0.42 },
  { label: '二段跳', kind: 'flip', name: 'flip', dur: 0.52, at: 0.5 },
  { label: '疾步闪避', kind: 'act', name: 'dashA', dur: 0.32, at: 0.25 },
  { label: '冲刺飞踢', kind: 'act', name: 'kick', dur: 0.48, at: 0.22 },
  { label: '劈山', kind: 'plunge', name: 'plunge', dur: 0.62, at: 0.6 },
  { label: '断云一二', kind: 'airAct', name: 'acut', dur: 0.48, at: 0.47 },
  { label: '断云三段', kind: 'airAct', name: 'acutF', dur: 0.58, at: 0.46, data: { hang: 0.36 } },
  { label: '掠地俯冲', kind: 'swoop', name: 'swoop', dur: 0.52, at: 0.44 },
  { label: '牵红拉怪', kind: 'act', name: 'reel', dur: 0.52, at: 0.30, data: { self: false } },
  { label: '牵红飞身', kind: 'airAct', name: 'reel', dur: 0.54, at: 0.25, data: { self: true } },
  { label: '踏顶借力', kind: 'airAct', name: 'stomp', dur: 0.34, at: 0.50 },
  { label: '飞镖', kind: 'dart', name: 'dart', dur: 0.36, at: 0.40 },
  { label: '回身镖', kind: 'dartBack', name: 'dartBack', dur: 0.38, at: 0.40 },
];

/** what the moves are called on the button (the actions' own names are code) */
const MOVE_CN: Record<string, string> = {
  cut: '劈砍', sweep: '横扫', slam: '砸地', lunge: '扑击', poke: '刺', shoot: '射', cast: '施法', pull: '拽索', lob: '抛掷', burst: '爆身', fan: '扇射',
  thrust: '戟刺', sweepHalberd: '戟扫', bash: '盾撞', cutAfter: '盾后补刀', paw: '马踏', charge: '冲锋', aimXbow: '弩射', axeSweep: '斧扫', axeChop: '斧劈',
  backstab: '背刺', backstab2: '背刺（二）', blow: '吹针', sow: '撒霜', whirl: '甩链', slamChain: '砸链', needleFan: '针扇', kick: '踢',
  hjCut: '挥刀', hjBackhand: '反手斩', hjSweep: '渠帅横扫', hjThunder: '落雷', hjThrust: '突刺', hjLob: '抛坛', hjReap: '镰割',
  reload: '装填', rise: '跃起', snip: '剪击',
};
const moveName = (m: FoeMove) => MOVE_CN[m.atk] ?? MOVE_CN[m.name] ?? (m.name === 'attack' ? '出招' : m.name);

export interface AnimHost {
  /** where the group stands (the yard's open middle) */
  home: { x: number; z: number };
  make(def: ModelDef): BattleActor;
  cam(base: number[] | null, look?: number[], fov?: number): void;
}
export interface AnimItem { def: ModelDef; name: string; npc: boolean; hero?: boolean }
type Mode = 'idle' | 'slow' | 'walk' | 'run';
type View = 'side' | 'front' | 'back' | 'game' | 'orbit' | 'free';
type Tab = 'browse' | 'tune' | 'notes';
type Verdict = 'pass' | 'tweak' | 'reject';

const SPEED: Record<Mode, number> = { idle: 0, slow: 1.25, walk: 2.0, run: 4.0 };
const MODE_CN: Record<Mode, string> = { idle: '站着', slow: '慢走', walk: '走', run: '跑' };
const VIEW_CN: Record<View, string> = { side: '侧面', front: '正面', back: '背面', game: '游戏镜头', orbit: '转圈', free: '自由视角' };
const VERDICT_CN: Record<Verdict, string> = { pass: '✅ 通过', tweak: '🔧 需微调', reject: '❌ 打回' };
const NPC_PH = 7.5, NPC_PH_QUAD = 6.5;

const STORAGE_NOTES = 'ub_motion_review_notes_v1';
const STORAGE_TUNE = 'ub_motion_review_tune_v1';

interface TuneField { key: keyof MotionTune; label: string; tip: string; min: number; max: number; step: number }
const TUNE_FIELDS: TuneField[] = [
  { key: 'waveLead', label: '动量错拍强度', tip: '胯→胸→臂→腕延迟波次（调 0 可对比旧版木偶同步）', min: 0, max: 2.0, step: 0.05 },
  { key: 'shudder', label: '命中顿震幅度', tip: '出招命中与重劈落地瞬间的高频微震', min: 0, max: 2.5, step: 0.05 },
  { key: 'overshoot', label: '惯性过冲幅度', tip: '挥砍过冲与弹性回弹（残心前停顿感）', min: 0, max: 2.0, step: 0.05 },
  { key: 'gazeLock', label: '颈部视线锁定', tip: '拧腰挥砍/跑动时头部反扭盯住前方（调 0 取消锁头）', min: 0, max: 1.5, step: 0.05 },
  { key: 'idleBreath', label: '待机呼吸沉肩', tip: '胸廓非对称呼吸、呼气微沉肩与重心微换', min: 0, max: 2.0, step: 0.05 },
  { key: 'sprintBurst', label: '冲刺蹬折爆发', tip: '主角奔跑前倾角、后膝高折与上下身反扭', min: 0.6, max: 1.4, step: 0.05 },
  { key: 'ribbonSpring', label: '布料袍摆物理', tip: '主角飘带/剑穗/发缕，以及敌人长袍/玉佩/头巾的二阶弹性物理强度', min: 0, max: 2.0, step: 0.05 },
  { key: 'hurtWhip', label: '受击两段鞭打', tip: '敌人受击时头颈与双臂延迟甩动强度', min: 0, max: 2.0, step: 0.05 },
  { key: 'arcOut', label: '横扫离心弧度', tip: '长戟/重斧/针扇等横扫招式的向外离心外抛弧线', min: 0, max: 2.0, step: 0.05 },
];

const TUNE_PRESETS: Array<{ name: string; vals: Partial<MotionTune> }> = [
  { name: '当前优化版', vals: { ...MOTION_TUNE_DEFAULTS } },
  { name: '旧感对比(关波次/锁头)', vals: { waveLead: 0, shudder: 0, overshoot: 0, gazeLock: 0, idleBreath: 0.4, sprintBurst: 0.8, ribbonSpring: 0.2, hurtWhip: 0.2, arcOut: 0 } },
  { name: '重打击夸张版', vals: { waveLead: 1.35, shudder: 1.7, overshoot: 1.4, gazeLock: 1.15, idleBreath: 1.1, sprintBurst: 1.15, ribbonSpring: 1.35, hurtWhip: 1.45, arcOut: 1.4 } },
  { name: '写实克制版', vals: { waveLead: 0.8, shudder: 0.55, overshoot: 0.65, gazeLock: 0.95, idleBreath: 0.8, sprintBurst: 0.9, ribbonSpring: 0.8, hurtWhip: 0.75, arcOut: 0.7 } },
];

interface ReviewNote {
  id: string;
  ts: string;
  group: string;
  actor: string;
  actorId: string;
  mode: Mode;
  move: string;
  view: View;
  slow: number;
  verdict: Verdict;
  text: string;
  tune: MotionTune;
}

function loadNotes(): ReviewNote[] {
  try {
    const raw = localStorage.getItem(STORAGE_NOTES);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function saveNotes(notes: ReviewNote[]) {
  try { localStorage.setItem(STORAGE_NOTES, JSON.stringify(notes)); } catch { /* ignore */ }
}
function loadTune() {
  try {
    const raw = localStorage.getItem(STORAGE_TUNE);
    if (!raw) return;
    const obj = JSON.parse(raw) as Partial<MotionTune>;
    for (const f of TUNE_FIELDS) {
      const v = obj[f.key];
      if (typeof v === 'number' && Number.isFinite(v)) MOTION_TUNE[f.key] = Math.min(f.max, Math.max(f.min, v));
    }
  } catch { /* ignore */ }
}
function saveTune() {
  try { localStorage.setItem(STORAGE_TUNE, JSON.stringify(MOTION_TUNE)); } catch { /* ignore */ }
}

export function openAnimPreview(h: AnimHost, rawGroups: Array<{ name: string; items: AnimItem[] }>) {
  loadTune();
  // Prepend the hero group (刘白 · 白发 / 斗笠) so ?anim can verify every hero move at 0.25× slow-mo too
  const groups: Array<{ name: string; items: AnimItem[] }> = [
    { name: '主角 · 刘白', items: [{ def: FINE_WHITE, name: '刘白（白发）', npc: false, hero: true }, { def: FINE_HAT, name: '刘白（斗笠）', npc: false, hero: true }] },
    ...rawGroups,
  ];
  const root = new THREE.Group(); scene.add(root);
  // the bare floor: a plain plane and a 0.5 m grid that slides under them while they walk (a treadmill: their planted feet should stay put on it)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshLambertMaterial({ color: 0x9a968c }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(h.home.x, -0.002, h.home.z); floor.receiveShadow = true; root.add(floor);
  const grid = new THREE.GridHelper(40, 80, 0x55524c, 0x6e6a62); grid.position.set(h.home.x, 0.002, h.home.z); root.add(grid);
  // everything else in the scene out of sight, but the lights (their own and the stage's)
  const lit = new WeakMap<THREE.Object3D, boolean>();
  const hide = (o: THREE.Object3D) => {
    if (o === root || (o as THREE.Light).isLight) return;
    let l = lit.get(o); if (l == null) { l = false; o.traverse(c => { if ((c as THREE.Light).isLight) l = true; }); lit.set(o, l); }
    if (l) { o.children.forEach(hide); return; }
    o.visible = false;
  };

  let gi = 0, pick = 0, mode: Mode = 'idle', view: View = 'side', slow = 1, ang = 0.5, zoom = 0.95, t = 0;
  let activeTab: Tab = 'browse';
  let loopMove = false, loopCooldown = 0;
  let lastTrigger: (() => void) | null = null;
  let stepQ = 0;
  const w = window as unknown as { __animStep?: (s: number) => void; __animLeft?: () => number; __motionTune?: MotionTune };
  w.__animStep = (s: number) => { slow = 0; stepQ += Math.max(0, s); refresh(); };
  w.__animLeft = () => stepQ;
  w.__motionTune = MOTION_TUNE;

  let face = Math.PI / 2, cy = 0, cp = 0.1;
  let acts: Array<{ a: BattleActor; it: AnimItem; x: number; z: number; ph?: number; kneel: number; downT: number; mi: number; hMode?: HeroMode; hT: number; hDur: number; moveAt: number; moveLabel: string }> = [];
  let lastMove = '';
  let notes: ReviewNote[] = loadNotes();
  let curVerdict: Verdict = 'tweak';

  const yawOf = () => face;
  const build = () => {
    for (const s of acts) { s.a.root.removeFromParent(); s.a.dispose(); }
    const g = groups[gi], list = pick >= 0 ? [g.items[pick]] : g.items;
    const per = 6, gap = list.some(it => it.def.kind === 'quad' || it.def.group === '首领') ? 3.2 : 2.6;
    acts = list.map((it, i) => {
      const row = Math.floor(i / per), col = i % per, inRow = Math.min(per, list.length - row * per);
      const x = h.home.x + (col - (inRow - 1) / 2) * gap, z = h.home.z - row * 3.6;
      const a = h.make(it.def); a.place(V3(x, 0, z), yawOf()); root.add(a.root); a.update(0.016);
      return { a, it, x, z, kneel: 0, downT: -1, mi: 0, hT: 0, hDur: 0, moveAt: 0.5, moveLabel: '' };
    });
    (window as unknown as { __anim?: unknown }).__anim = acts;
    lastTrigger = null; lastMove = '';
    rebuildMoveChips();
    refresh();
  };
  const extent = () => {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const s of acts) { x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); z0 = Math.min(z0, s.z); z1 = Math.max(z1, s.z); }
    return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 };
  };
  const act = (fn: (s: (typeof acts)[number]) => void) => { for (const s of acts) if (s.downT < 0) fn(s); };
  const foeOnly = (fn: (a: BattleActor) => unknown) => act(s => { if (!s.it.npc) fn(s.a); });

  // ---------------------------------------------------------------- styles & layout
  const css = `
    #animBar{position:fixed;left:10px;top:10px;right:326px;display:flex;flex-direction:column;gap:6px;z-index:50;pointer-events:none;font:12px/1.35 system-ui,'Microsoft YaHei',sans-serif}
    #animBar .barRow{display:flex;flex-wrap:wrap;align-items:center;gap:5px;background:rgba(16,13,18,.84);border:1px solid #5a2a22;border-radius:7px;padding:6px 8px;pointer-events:auto;backdrop-filter:blur(4px);color:#f0e6d2}
    #animBar .barTitle{font-weight:700;color:#e8be6e;margin-right:4px;white-space:nowrap}
    #animBar button{background:#2a2228;color:#f0e6d2;border:1px solid #584644;border-radius:4px;padding:3px 8px;font:inherit;cursor:pointer;white-space:nowrap}
    #animBar button:hover{border-color:#c98d4b;background:#3a2c32}
    #animBar button.on{background:#7a2a22;border-color:#d14a3e;color:#fff}
    #animBar .scrubWrap{display:flex;align-items:center;gap:8px;flex:1;min-width:220px}
    #animBar .scrubTrack{position:relative;flex:1;height:14px;background:#241e22;border:1px solid #4e3f3d;border-radius:7px;cursor:pointer;overflow:hidden}
    #animBar .scrubFill{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(90deg,#9c352a,#e2a454);width:0%}
    #animBar .scrubAt{position:absolute;top:0;bottom:0;width:2px;background:#fff4c2;box-shadow:0 0 4px #ffd26a}
    #animBar .scrubTxt{color:#d8cbb8;font-variant-numeric:tabular-nums;min-width:118px;text-align:right;white-space:nowrap}
    #anim{position:fixed;right:8px;top:8px;bottom:8px;width:308px;display:flex;flex-direction:column;background:rgba(15,12,17,.90);color:#f0e6d2;
      font:12.5px/1.38 system-ui,'Microsoft YaHei',sans-serif;border:1px solid #5a2a22;border-radius:8px;z-index:50;-webkit-user-select:none;user-select:none;backdrop-filter:blur(6px);overflow:hidden}
    #anim .tabs{display:flex;border-bottom:1px solid #4a2a26;background:#1c161d;flex-shrink:0}
    #anim .tabs button{flex:1;border:0;border-bottom:2px solid transparent;border-radius:0;background:transparent;padding:9px 4px;font-weight:600;color:#bfb29e;cursor:pointer}
    #anim .tabs button.on{color:#f5d58c;border-bottom-color:#c94236;background:rgba(122,42,34,.22)}
    #anim .body{flex:1;overflow:auto;padding:8px 10px 14px}
    #anim .pane{display:none}#anim .pane.on{display:block}
    #anim h3{margin:10px 0 5px;font-size:12px;color:#e2b86a;font-weight:700;display:flex;align-items:center;justify-content:space-between}
    #anim h3:first-child{margin-top:2px}
    #anim .row{display:flex;flex-wrap:wrap;gap:4px}
    #anim button{flex:1 1 84px;background:#2a2228;color:#f0e6d2;border:1px solid #5a4a48;border-radius:4px;padding:5px 6px;font:inherit;cursor:pointer}
    #anim button:hover{border-color:#b87e45}
    #anim button.on{background:#7a2a22;border-color:#d14a3e;color:#fff}
    #anim button.primary{background:#8b3124;border-color:#df6a48;color:#fff;font-weight:600}
    #anim button.primary:hover{background:#a33a2b}
    #anim button.ghost{background:#211c22;border-color:#4a3f42;color:#cfc2ae}
    #anim .chipRow button{flex:0 1 auto;padding:4px 8px;font-size:12px}
    #anim .info{font-size:11px;color:#b8ab98;margin-top:8px;white-space:pre-line;background:rgba(255,255,255,.03);padding:6px 8px;border-radius:4px;border:1px solid #352b30}
    #anim .sliderItem{margin:7px 0;padding:6px 8px;background:rgba(255,255,255,.035);border:1px solid #3b3036;border-radius:5px}
    #anim .sliderHead{display:flex;justify-content:space-between;align-items:center;margin-bottom:2px}
    #anim .sliderName{font-weight:600;color:#f3e5c8}
    #anim .sliderVal{font-variant-numeric:tabular-nums;color:#f0b862;font-weight:700}
    #anim .sliderTip{font-size:11px;color:#a89b89;margin-bottom:4px}
    #anim input[type=range]{width:100%;accent-color:#d14a3e;cursor:pointer;margin:2px 0}
    #anim .ctxBadge{background:#241c23;border:1px solid #5a3832;border-radius:5px;padding:6px 8px;font-size:11.5px;color:#e8d3b0;margin-bottom:8px;line-height:1.45}
    #anim textarea{width:100%;box-sizing:border-box;min-height:74px;background:#1a151b;color:#f4ecdc;border:1px solid #5a4846;border-radius:5px;padding:7px;font:12.5px/1.45 system-ui,'Microsoft YaHei',sans-serif;resize:vertical;-webkit-user-select:text;user-select:text}
    #anim textarea:focus{outline:none;border-color:#d98b44}
    #anim .noteCard{background:#211b22;border:1px solid #44373c;border-radius:5px;padding:7px 8px;margin-top:7px}
    #anim .noteHead{display:flex;justify-content:space-between;align-items:center;gap:4px;font-size:11px;color:#d6b87c;margin-bottom:3px}
    #anim .noteText{font-size:12px;color:#f0e6d2;white-space:pre-wrap;word-break:break-word;-webkit-user-select:text;user-select:text}
    #anim .noteActs{display:flex;gap:5px;margin-top:5px}
    #anim .noteActs button{flex:0 1 auto;padding:2px 7px;font-size:11px}
    #anim .foot{display:flex;gap:5px;padding:7px 10px;border-top:1px solid #422826;background:#1a141b;flex-shrink:0}
    #animToggle{position:fixed;right:8px;top:8px;z-index:51;display:none;background:#7a2a22;color:#fff;border:1px solid #c94a3c;border-radius:5px;padding:6px 12px;font:13px system-ui;cursor:pointer}
    #animToast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:rgba(20,16,22,.94);color:#f7d894;border:1px solid #c96c3c;border-radius:6px;padding:8px 16px;font:13px system-ui,'Microsoft YaHei',sans-serif;z-index:60;opacity:0;pointer-events:none;transition:opacity .2s}
    #animToast.on{opacity:1}
    #animModal{position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:70;display:none;align-items:center;justify-content:center}
    #animModal.on{display:flex}
    #animModal .mBox{width:min(680px,90vw);max-height:82vh;background:#1a151c;border:1px solid #8a4236;border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:8px;color:#f0e6d2;font:13px system-ui,'Microsoft YaHei',sans-serif}
    #animModal textarea{width:100%;height:340px;box-sizing:border-box;background:#110e13;color:#f2e7d2;border:1px solid #524244;border-radius:5px;padding:8px;font:12px/1.45 Consolas,monospace;-webkit-user-select:text;user-select:text}
  `;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  const toast = document.createElement('div'); toast.id = 'animToast'; document.body.appendChild(toast);
  let toastTimer = 0;
  const showToast = (msg: string) => {
    toast.textContent = msg; toast.classList.add('on');
    window.clearTimeout(toastTimer); toastTimer = window.setTimeout(() => toast.classList.remove('on'), 2200);
  };

  // Fallback export modal (also lets user inspect & edit full review markdown directly)
  const modal = document.createElement('div'); modal.id = 'animModal';
  modal.innerHTML = `<div class="mBox"><div style="display:flex;justify-content:space-between;align-items:center"><b style="color:#f0c36c">定稿评审单（参数 + 全部留言）</b><button id="animModalClose" style="background:#7a2a22;color:#fff;border:0;border-radius:4px;padding:4px 10px;cursor:pointer">关闭</button></div><textarea id="animModalText" readonly></textarea><div style="display:flex;gap:8px;justify-content:flex-end"><button id="animModalCopy" style="background:#8b3124;color:#fff;border:1px solid #df6a48;border-radius:4px;padding:6px 14px;cursor:pointer">再次复制</button></div></div>`;
  document.body.appendChild(modal);
  const modalText = modal.querySelector('#animModalText') as HTMLTextAreaElement;
  (modal.querySelector('#animModalClose') as HTMLButtonElement).onclick = () => modal.classList.remove('on');
  (modal.querySelector('#animModalCopy') as HTMLButtonElement).onclick = () => {
    modalText.select();
    try { navigator.clipboard?.writeText(modalText.value); } catch { /* ignore */ }
    showToast('已复制定稿评审单，可直接粘贴回对话！');
  };
  modal.onclick = e => { if (e.target === modal) modal.classList.remove('on'); };

  // ---------------------------------------------------------------- playback helpers
  const play = (s: (typeof acts)[number], m: FoeMove) => {
    s.a.dead = false; s.downT = -1;
    if (s.it.def.id === 'cx_boss') {
      const drawn = m.atk === 'cut' || m.atk === 'lunge';
      s.a.bones.fan.visible = !drawn;
      s.a.bones.blade.visible = drawn;
    }
    s.moveAt = m.at; s.moveLabel = moveName(m);
    s.a.play(new Action(m.name, m.dur, m.at, { atk: m.atk, dist: m.atk === 'lunge' ? 0 : 0.6 }));
  };
  const playHero = (s: (typeof acts)[number], hm: HeroPreviewMove) => {
    s.a.dead = false; s.downT = -1;
    s.hMode = undefined; s.hT = 0; s.hDur = hm.dur; s.moveAt = hm.at; s.moveLabel = hm.label;
    const data = { ...(hm.data ?? {}), ...(hm.warp ? { warp: hm.warp } : {}) };
    if (hm.kind === 'act') s.a.play(new Action(hm.name, hm.dur, hm.at, data));
    else if (hm.kind === 'airAct' || hm.kind === 'swoop') { s.hMode = hm.kind; s.a.play(new Action(hm.name, hm.dur, hm.at, data)); }
    else if (hm.kind === 'plunge') { s.hMode = 'plunge'; s.a.play(new Action('plunge', hm.dur * 0.65, 0.95)); }
    else { s.a.act?.cancel(); s.a.act = null; s.hMode = hm.kind; }
  };

  const triggerHeroMove = (idx: number) => {
    const hm = HERO_MOVES[idx % HERO_MOVES.length];
    const fn = () => { act(s => { if (s.it.hero) playHero(s, hm); }); lastMove = hm.label; };
    lastTrigger = fn; fn(); refresh();
  };
  const triggerFoeMove = (idx: number) => {
    const fn = () => {
      const names: string[] = [];
      act(s => {
        if (s.it.npc || s.it.hero) return;
        const ms = movesOf(s.it.def.id), m = ms[idx % ms.length];
        play(s, m); names.push(moveName(m));
      });
      lastMove = names[0] ?? '出招';
    };
    lastTrigger = fn; fn(); refresh();
  };

  // Helper to jump to a named group/item cleanly (for Quick Tour & clicking saved notes)
  const jumpTo = (opt: { group?: string; actor?: string; actorId?: string; mode?: Mode; view?: View; slow?: number; zoom?: number; heroMoveIdx?: number; foeMoveMatch?: string; hurt?: number; loop?: boolean }) => {
    if (opt.group) {
      const idx = groups.findIndex(g => g.name.includes(opt.group!));
      if (idx >= 0) gi = idx;
    }
    if (opt.actor === 'ALL') pick = -1;
    else if (opt.actorId) {
      const idx = groups[gi].items.findIndex(it => it.def.id === opt.actorId);
      if (idx >= 0) pick = idx;
    } else if (opt.actor) {
      const idx = groups[gi].items.findIndex(it => it.name.includes(opt.actor!));
      if (idx >= 0) pick = idx;
    }
    if (opt.mode) mode = opt.mode;
    if (opt.view) { view = opt.view; face = view === 'front' ? 0 : view === 'back' ? Math.PI : Math.PI / 2; }
    if (opt.slow !== undefined) slow = opt.slow;
    if (opt.zoom !== undefined) zoom = opt.zoom;
    if (opt.loop !== undefined) loopMove = opt.loop;
    build(); listRow();
    if (opt.heroMoveIdx !== undefined) triggerHeroMove(opt.heroMoveIdx);
    else if (opt.foeMoveMatch) {
      const first = acts[0];
      if (first && !first.it.hero && !first.it.npc) {
        const ms = movesOf(first.it.def.id);
        const mi = ms.findIndex(m => m.name === opt.foeMoveMatch || m.atk === opt.foeMoveMatch || moveName(m).includes(opt.foeMoveMatch!));
        triggerFoeMove(mi >= 0 ? mi : 0);
      }
    } else if (opt.hurt !== undefined) {
      const angH = opt.hurt;
      const fn = () => { act(s => { (s.a as unknown as { hurt(p: number, f?: number): void }).hurt(1.5, angH); }); lastMove = '正面挨打'; };
      lastTrigger = fn; fn();
    }
    refresh();
  };

  // ---------------------------------------------------------------- Top-left Quick Tour & Scrubber Bar
  const bar = document.createElement('div'); bar.id = 'animBar'; document.body.appendChild(bar);
  const tourRow = document.createElement('div'); tourRow.className = 'barRow'; bar.appendChild(tourRow);
  const barT = document.createElement('span'); barT.className = 'barTitle'; barT.textContent = '🎬 重点验收导览'; tourRow.appendChild(barT);
  const mkBarBtn = (parent: HTMLElement, text: string, fn: () => void) => {
    const b = document.createElement('button'); b.textContent = text;
    b.onclick = e => { e.stopPropagation(); fn(); }; b.onpointerdown = e => e.stopPropagation();
    parent.appendChild(b); return b;
  };
  const TOURS: Array<[string, () => void]> = [
    ['刘白·待机呼吸', () => jumpTo({ group: '主角', actor: '白发', mode: 'idle', view: 'side', slow: 1, zoom: 0.86, loop: false })],
    ['刘白·冲刺步态', () => jumpTo({ group: '主角', actor: '白发', mode: 'run', view: 'side', slow: 0.5, zoom: 0.96, loop: false })],
    ['刘白·一段横斩', () => jumpTo({ group: '主角', actor: '白发', mode: 'idle', view: 'side', slow: 0.25, zoom: 0.96, heroMoveIdx: 0, loop: true })],
    ['刘白·三段旋斩', () => jumpTo({ group: '主角', actor: '白发', mode: 'idle', view: 'front', slow: 0.25, zoom: 0.96, heroMoveIdx: 2, loop: true })],
    ['刘白·五段重劈', () => jumpTo({ group: '主角', actor: '白发', mode: 'idle', view: 'game', slow: 0.25, zoom: 0.95, heroMoveIdx: 4, loop: true })],
    ['刘白·藏锋拔刀', () => jumpTo({ group: '主角', actor: '白发', mode: 'idle', view: 'side', slow: 0.5, zoom: 0.92, heroMoveIdx: 6, loop: true })],
    ['黄巾·全员跑(头巾/袍)', () => jumpTo({ group: '黄巾', actor: 'ALL', mode: 'run', view: 'side', slow: 1, zoom: 1.05, loop: false })],
    ['力士·双手砸锤', () => jumpTo({ group: '黄巾', actor: '力士', mode: 'idle', view: 'side', slow: 0.25, zoom: 1.15, foeMoveMatch: 'slam', loop: true })],
    ['道士·受击护袍', () => jumpTo({ group: '黄巾', actor: '符水道士', mode: 'idle', view: 'side', slow: 0.25, zoom: 0.95, hurt: 0, loop: true })],
    ['洛阳·长戟横扫', () => jumpTo({ group: '洛阳', actor: '长戟', mode: 'idle', view: 'game', slow: 0.25, zoom: 0.95, foeMoveMatch: 'sweepHalberd', loop: true })],
    ['乌林·双手长矛', () => jumpTo({ group: '乌林', actor: '矛', mode: 'idle', view: 'side', slow: 0.25, zoom: 1.0, foeMoveMatch: 'poke', loop: true })],
    ['据点·打铁与披风', () => jumpTo({ group: '据点', actor: 'ALL', mode: 'idle', view: 'front', slow: 1, zoom: 1.05, loop: false })],
  ];
  for (const [label, fn] of TOURS) mkBarBtn(tourRow, label, fn);

  // Playback / timeline row
  const playRow = document.createElement('div'); playRow.className = 'barRow'; bar.appendChild(playRow);
  const loopBtn = mkBarBtn(playRow, '🔁 循环本招', () => { loopMove = !loopMove; refresh(); });
  const replayBtn = mkBarBtn(playRow, '▶ 重播当前招', () => { if (lastTrigger) lastTrigger(); else showToast('先点一个招式按钮即可重播'); });
  void replayBtn;
  const barSpeedBtns = ([[1, '1×'], [0.5, '0.5×'], [0.25, '0.25×'], [0, '⏸']] as const).map(([k, lbl]) => [k, mkBarBtn(playRow, lbl, () => { slow = k; refresh(); })] as const);
  mkBarBtn(playRow, '⏭ +1帧', () => { slow = 0; stepQ += 1 / 30; refresh(); });
  const scrubWrap = document.createElement('div'); scrubWrap.className = 'scrubWrap'; playRow.appendChild(scrubWrap);
  const scrubTrack = document.createElement('div'); scrubTrack.className = 'scrubTrack'; scrubWrap.appendChild(scrubTrack);
  const scrubFill = document.createElement('div'); scrubFill.className = 'scrubFill'; scrubTrack.appendChild(scrubFill);
  const scrubAt = document.createElement('div'); scrubAt.className = 'scrubAt'; scrubTrack.appendChild(scrubAt);
  const scrubTxt = document.createElement('span'); scrubTxt.className = 'scrubTxt'; scrubTxt.textContent = '待机中'; scrubWrap.appendChild(scrubTxt);
  scrubTrack.onpointerdown = e => {
    e.stopPropagation();
    const rect = scrubTrack.getBoundingClientRect();
    const u = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
    slow = 0;
    act(s => {
      if (s.a.act) s.a.act.t = u * s.a.act.dur;
      else if (s.hMode && s.hDur > 0) s.hT = u * s.hDur;
    });
    stepQ = 1 / 600;
    refresh();
  };

  // ---------------------------------------------------------------- Right Studio Drawer (3 Tabs)
  const box = document.createElement('div'); box.id = 'anim'; document.body.appendChild(box);
  const show = document.createElement('button'); show.id = 'animToggle'; show.textContent = '展开评审台'; document.body.appendChild(show);
  show.onclick = () => { box.style.display = ''; bar.style.display = ''; show.style.display = 'none'; };

  const tabBar = document.createElement('div'); tabBar.className = 'tabs'; box.appendChild(tabBar);
  const body = document.createElement('div'); body.className = 'body'; box.appendChild(body);
  const panes: Record<Tab, HTMLDivElement> = { browse: document.createElement('div'), tune: document.createElement('div'), notes: document.createElement('div') };
  for (const k of ['browse', 'tune', 'notes'] as const) { panes[k].className = 'pane'; body.appendChild(panes[k]); }
  const tabBtns: Record<Tab, HTMLButtonElement> = {} as Record<Tab, HTMLButtonElement>;
  for (const [k, lbl] of [['browse', '① 角色与招式'], ['tune', '② 实时调参'], ['notes', '③ 留言定稿']] as const) {
    const b = document.createElement('button'); b.textContent = lbl;
    b.onclick = e => { e.stopPropagation(); activeTab = k; refresh(); };
    b.onpointerdown = e => e.stopPropagation();
    tabBar.appendChild(b); tabBtns[k] = b;
  }

  const sec = (parent: HTMLElement, title: string, extraClass = '') => {
    if (title) { const e = document.createElement('h3'); e.textContent = title; parent.appendChild(e); }
    const r = document.createElement('div'); r.className = 'row' + (extraClass ? ' ' + extraClass : ''); parent.appendChild(r); return r;
  };
  const btn = (r: HTMLElement, title: string, fn: () => void, cls = '') => {
    const b = document.createElement('button'); b.textContent = title; if (cls) b.className = cls;
    b.onclick = e => { e.stopPropagation(); fn(); refresh(); }; b.onpointerdown = e => e.stopPropagation();
    r.appendChild(b); return b;
  };

  // --- Tab 1: Browse & Moves
  const pBrowse = panes.browse;
  const gR = sec(pBrowse, '哪一组');
  const gBtns = groups.map((g, i) => btn(gR, g.name, () => { gi = i; pick = i === 0 ? 0 : -1; build(); listRow(); }));
  const pR = sec(pBrowse, '谁（点一个单看）');
  let pBtns: HTMLButtonElement[] = [];
  const allBtn = btn(pR, '整组一起看', () => { pick = -1; build(); });
  const listRow = () => { for (const b of pBtns) b.remove(); pBtns = groups[gi].items.map((it, i) => btn(pR, it.name, () => { pick = i; build(); })); refresh(); };
  const mR = sec(pBrowse, '走跑');
  const mBtns = ([['idle', '站着'], ['slow', '慢走'], ['walk', '走'], ['run', '跑']] as const).map(([m, title]) => [m, btn(mR, title, () => { mode = m; act(s => { s.kneel = 0; s.a.dead = false; s.downT = -1; }); })] as const);

  // Direct Move Picker chips (auto-populated for current character)
  const moveChipTitle = document.createElement('h3'); moveChipTitle.textContent = '招式直选（点击即放）'; pBrowse.appendChild(moveChipTitle);
  const moveChipRow = document.createElement('div'); moveChipRow.className = 'row chipRow'; pBrowse.appendChild(moveChipRow);
  const rebuildMoveChips = () => {
    moveChipRow.innerHTML = '';
    const first = acts[0];
    if (!first || first.it.npc) {
      moveChipTitle.style.display = 'none'; moveChipRow.style.display = 'none'; return;
    }
    moveChipTitle.style.display = ''; moveChipRow.style.display = '';
    if (first.it.hero) {
      HERO_MOVES.forEach((hm, i) => btn(moveChipRow, hm.label, () => triggerHeroMove(i)));
    } else {
      const ms = movesOf(first.it.def.id);
      ms.forEach((m, i) => btn(moveChipRow, `${i + 1}.${moveName(m)}`, () => triggerFoeMove(i)));
    }
  };

  const aR = sec(pBrowse, '动作与受击');
  btn(aR, '出招（下一招）', () => {
    const names: string[] = [];
    act(s => {
      if (s.it.hero) { const hm = HERO_MOVES[s.mi % HERO_MOVES.length]; s.mi++; playHero(s, hm); names.push(`${hm.label}（${(s.mi - 1) % HERO_MOVES.length + 1}/${HERO_MOVES.length}）`); return; }
      if (s.it.npc) return;
      const ms = movesOf(s.it.def.id), m = ms[s.mi % ms.length]; s.mi++; play(s, m); names.push(`${moveName(m)}（${(s.mi - 1) % ms.length + 1}/${ms.length}）`);
    });
    lastMove = pick >= 0 ? names[0] ?? '' : names[0] && acts[0]?.it.hero ? names[0] : '各出一招';
  });
  btn(aR, '全部招式连放', () => {
    act(s => {
      if (s.it.hero) { let tt = 0; HERO_MOVES.forEach(hm => { window.setTimeout(() => { if (s.downT < 0) playHero(s, hm); }, tt * 1000 / Math.max(slow, 0.25)); tt += hm.dur + 0.45; }); return; }
      if (s.it.npc) return;
      const ms = movesOf(s.it.def.id); let tt = 0; ms.forEach(m => { window.setTimeout(() => { if (s.downT < 0) play(s, m); }, tt * 1000 / Math.max(slow, 0.25)); tt += m.dur + 0.5; });
    }); lastMove = '全部招式';
  });
  btn(aR, '施法', () => { lastTrigger = () => foeOnly(a => a.cast()); lastTrigger(); lastMove = '施法'; });
  btn(aR, '吼', () => { lastTrigger = () => foeOnly(a => a.roar()); lastTrigger(); lastMove = '吼'; });
  btn(aR, '正面挨打', () => { lastTrigger = () => act(s => { s.a.dead = false; (s.a as unknown as { hurt(p: number, f?: number): void }).hurt(1.4, 0); }); lastTrigger(); lastMove = '正面挨打'; });
  btn(aR, '左侧挨打', () => { lastTrigger = () => act(s => { s.a.dead = false; (s.a as unknown as { hurt(p: number, f?: number): void }).hurt(1.4, Math.PI / 2); }); lastTrigger(); lastMove = '左侧挨打'; });
  btn(aR, '右侧挨打', () => { lastTrigger = () => act(s => { s.a.dead = false; (s.a as unknown as { hurt(p: number, f?: number): void }).hurt(1.4, -Math.PI / 2); }); lastTrigger(); lastMove = '右侧挨打'; });
  btn(aR, '背后挨打', () => { lastTrigger = () => act(s => { s.a.dead = false; (s.a as unknown as { hurt(p: number, f?: number): void }).hurt(1.4, Math.PI); }); lastTrigger(); lastMove = '背后挨打'; });
  btn(aR, '倒地 / 死亡', () => { lastTrigger = () => act(s => { if (s.it.npc) return; s.a.dead = false; s.a.fall(0); s.downT = 3.4; }); lastTrigger(); lastMove = '倒地 / 死亡'; });
  btn(aR, '蹲下 / 起来', () => act(s => { if (s.it.npc && s.it.def.kind !== 'quad') { s.kneel = s.kneel ? 0 : 1; if (s.kneel) mode = 'idle'; } }));

  const cR = sec(pBrowse, '镜头');
  const vBtns = ([['side', '侧面'], ['front', '正面'], ['back', '背面'], ['game', '游戏镜头'], ['orbit', '转圈']] as const).map(([v, title]) => [v, btn(cR, title, () => { view = v; face = v === 'front' ? 0 : v === 'back' ? Math.PI : Math.PI / 2; })] as const);
  btn(cR, '拉近', () => { zoom = Math.max(0.35, zoom * 0.8); }); btn(cR, '拉远', () => { zoom = Math.min(3, zoom * 1.25); });

  const sR = sec(pBrowse, '速度');
  const sBtns = ([[1, '原速'], [0.5, '慢一半'], [0.25, '慢四倍'], [0, '暂停']] as const).map(([k, title]) => [k, btn(sR, title, () => { slow = k; })] as const);
  btn(sR, '下一帧', () => { slow = 0; stepQ += 1 / 30; });

  const info = document.createElement('div'); info.className = 'info'; pBrowse.appendChild(info);

  // --- Tab 2: Live Motion Parameter Tuning
  const pTune = panes.tune;
  const preR = sec(pTune, '一键风格 / A·B 对比预设');
  const sliderRefs: Array<{ f: TuneField; input: HTMLInputElement; valEl: HTMLSpanElement }> = [];
  const syncSliders = () => {
    for (const s of sliderRefs) {
      const v = MOTION_TUNE[s.f.key];
      s.input.value = String(v);
      const isDef = Math.abs(v - MOTION_TUNE_DEFAULTS[s.f.key]) < 1e-4;
      s.valEl.textContent = v.toFixed(2) + (isDef ? '' : ' *');
    }
  };
  for (const pr of TUNE_PRESETS) {
    btn(preR, pr.name, () => {
      Object.assign(MOTION_TUNE, MOTION_TUNE_DEFAULTS, pr.vals);
      saveTune(); syncSliders();
      showToast(`已切换预设：${pr.name}`);
    });
  }
  const slTitle = document.createElement('h3'); slTitle.textContent = '实时参数滑块（拖动即刻生效）'; pTune.appendChild(slTitle);
  for (const f of TUNE_FIELDS) {
    const wrap = document.createElement('div'); wrap.className = 'sliderItem';
    const head = document.createElement('div'); head.className = 'sliderHead';
    const nameEl = document.createElement('span'); nameEl.className = 'sliderName'; nameEl.textContent = f.label;
    const valEl = document.createElement('span'); valEl.className = 'sliderVal';
    head.appendChild(nameEl); head.appendChild(valEl);
    const tipEl = document.createElement('div'); tipEl.className = 'sliderTip'; tipEl.textContent = f.tip;
    const input = document.createElement('input');
    input.type = 'range'; input.min = String(f.min); input.max = String(f.max); input.step = String(f.step); input.value = String(MOTION_TUNE[f.key]);
    input.onpointerdown = e => e.stopPropagation();
    input.oninput = () => { MOTION_TUNE[f.key] = Number(input.value); saveTune(); syncSliders(); };
    input.ondblclick = () => { MOTION_TUNE[f.key] = MOTION_TUNE_DEFAULTS[f.key]; saveTune(); syncSliders(); showToast(`${f.label} 已复位为 1.00`); };
    wrap.appendChild(head); wrap.appendChild(tipEl); wrap.appendChild(input);
    pTune.appendChild(wrap);
    sliderRefs.push({ f, input, valEl });
  }
  const tuneActR = sec(pTune, '');
  btn(tuneActR, '全部恢复默认 (1.00)', () => { resetMotionTune(); saveTune(); syncSliders(); showToast('全部动作参数已恢复默认'); }, 'ghost');
  btn(tuneActR, '复制当前参数 JSON', () => {
    const txt = JSON.stringify(MOTION_TUNE, null, 2);
    navigator.clipboard?.writeText(txt).then(() => showToast('已复制参数 JSON')).catch(() => { modalText.value = txt; modal.classList.add('on'); });
  }, 'primary');
  syncSliders();

  // --- Tab 3: Review Notes & Export
  const pNotes = panes.notes;
  const ctxBadge = document.createElement('div'); ctxBadge.className = 'ctxBadge'; pNotes.appendChild(ctxBadge);
  const vRow = sec(pNotes, '当前招式定稿结论');
  const verdictBtns = (['pass', 'tweak', 'reject'] as const).map(v => [v, btn(vRow, VERDICT_CN[v], () => { curVerdict = v; })] as const);
  const noteInputTitle = document.createElement('h3'); noteInputTitle.textContent = '写下修改意见 / 备注'; pNotes.appendChild(noteInputTitle);
  const noteInput = document.createElement('textarea');
  noteInput.placeholder = '例：k1 蓄力不错，收刀可以再干脆一点；或者把动量错拍调到 1.25 手感更好…';
  noteInput.onpointerdown = e => e.stopPropagation();
  noteInput.onkeydown = e => e.stopPropagation();
  noteInput.onkeyup = e => e.stopPropagation();
  pNotes.appendChild(noteInput);

  const noteSaveR = sec(pNotes, '');
  btn(noteSaveR, '💾 保存本条留言', () => {
    const g = groups[gi], it = pick >= 0 ? g.items[pick] : null;
    const text = noteInput.value.trim() || (curVerdict === 'pass' ? '效果通过，可定稿。' : '需要按当前参数微调。');
    const now = new Date();
    const ts = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    notes.unshift({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ts, group: g.name, actor: it ? it.name : `整组(${g.items.length}个)`, actorId: it ? it.def.id : 'ALL',
      mode, move: lastMove || MODE_CN[mode], view, slow, verdict: curVerdict, text, tune: { ...MOTION_TUNE },
    });
    saveNotes(notes); noteInput.value = ''; renderNotes(); showToast('留言已保存（含当前角色、招式与参数快照）');
  }, 'primary');

  const buildReportMarkdown = () => {
    const changed = TUNE_FIELDS.filter(f => Math.abs(MOTION_TUNE[f.key] - MOTION_TUNE_DEFAULTS[f.key]) >= 1e-4);
    const lines: string[] = ['## 动作评审与定稿反馈单', ''];
    lines.push('### 1. 参数调整快照');
    if (!changed.length) lines.push('- 所有参数保持默认 `1.00`（当前优化版）');
    else for (const f of changed) lines.push(`- **${f.label}** (\`${f.key}\`): \`${MOTION_TUNE[f.key].toFixed(2)}\`（默认 \`1.00\`）`);
    lines.push('', '```json', JSON.stringify(MOTION_TUNE, null, 2), '```', '');
    lines.push(`### 2. 分角色/招式评审留言（共 ${notes.length} 条）`);
    if (!notes.length) lines.push('- （暂无文字留言）');
    else notes.slice().reverse().forEach((n, idx) => {
      const diffs = TUNE_FIELDS.filter(f => Math.abs(n.tune[f.key] - 1) >= 1e-4).map(f => `${f.key}=${n.tune[f.key].toFixed(2)}`).join(', ');
      lines.push(`${idx + 1}. ${VERDICT_CN[n.verdict]} **${n.group} · ${n.actor}** | 动作：\`${n.move}\` | 镜头：${VIEW_CN[n.view]} @ ${n.slow}× (${n.ts})`);
      lines.push(`   - 意见：${n.text}`);
      if (diffs) lines.push(`   - 当时参数：\`${diffs}\``);
    });
    return lines.join('\n');
  };

  const exportReview = () => {
    const md = buildReportMarkdown();
    modalText.value = md;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(md).then(() => showToast('已复制完整定稿单！直接粘贴发给我即可落盘')).catch(() => modal.classList.add('on'));
    } else modal.classList.add('on');
  };

  const noteExportR = sec(pNotes, '');
  btn(noteExportR, '📋 一键复制完整定稿单', exportReview, 'primary');
  btn(noteExportR, '👁 查看/编辑导出文本', () => { modalText.value = buildReportMarkdown(); modal.classList.add('on'); }, 'ghost');

  const notesListTitle = document.createElement('h3'); notesListTitle.textContent = '已保存的留言（点击可还原现场）'; pNotes.appendChild(notesListTitle);
  const notesList = document.createElement('div'); pNotes.appendChild(notesList);
  const renderNotes = () => {
    notesList.innerHTML = '';
    tabBtns.notes.textContent = notes.length ? `③ 留言定稿 (${notes.length})` : '③ 留言定稿';
    if (!notes.length) {
      const empty = document.createElement('div'); empty.className = 'info'; empty.textContent = '还没有留言。浏览完某个动作后，选好结论、写几句感受并保存，最后点「一键复制完整定稿单」直接发给我即可快速定稿！';
      notesList.appendChild(empty); return;
    }
    for (const n of notes) {
      const card = document.createElement('div'); card.className = 'noteCard';
      const head = document.createElement('div'); head.className = 'noteHead';
      head.innerHTML = `<span>${VERDICT_CN[n.verdict]} ${n.actor} · ${n.move}</span><span>${n.ts}</span>`;
      const txt = document.createElement('div'); txt.className = 'noteText'; txt.textContent = n.text;
      const actsRow = document.createElement('div'); actsRow.className = 'noteActs';
      btn(actsRow, '🎯 还原现场', () => {
        Object.assign(MOTION_TUNE, n.tune); saveTune(); syncSliders();
        jumpTo({ group: n.group, actorId: n.actorId === 'ALL' ? undefined : n.actorId, actor: n.actorId === 'ALL' ? 'ALL' : undefined, mode: n.mode, view: n.view, slow: n.slow });
        showToast(`已还原：${n.actor}（含当时参数）`);
      }, 'ghost');
      btn(actsRow, '🗑 删除', () => {
        notes = notes.filter(x => x.id !== n.id); saveNotes(notes); renderNotes();
      }, 'ghost');
      card.appendChild(head); card.appendChild(txt); card.appendChild(actsRow);
      notesList.appendChild(card);
    }
    const clearR = document.createElement('div'); clearR.className = 'row'; clearR.style.marginTop = '8px';
    btn(clearR, '清空全部留言', () => { notes = []; saveNotes(notes); renderNotes(); showToast('已清空留言'); }, 'ghost');
    notesList.appendChild(clearR);
  };

  // Footer always visible
  const foot = document.createElement('div'); foot.className = 'foot'; box.appendChild(foot);
  btn(foot, '📋 复制定稿单', exportReview, 'primary');
  btn(foot, '收起面板', () => { box.style.display = 'none'; bar.style.display = 'none'; show.style.display = ''; }, 'ghost');

  // ---------------------------------------------------------------- camera drag & wheel
  let drag: { x: number; y: number } | null = null;
  const onPanel = (e: Event) => !!(e.target as HTMLElement | null)?.closest?.('#anim, #animToggle, #animBar, #animModal');
  window.addEventListener('pointerdown', e => {
    if (onPanel(e)) return; drag = { x: e.clientX, y: e.clientY };
    if (view !== 'free') { cy = view === 'orbit' ? ang : 0; cp = view === 'game' ? 0.78 : view === 'orbit' ? 0.2 : 0.08; view = 'free'; refresh(); }
  });
  window.addEventListener('pointermove', e => { if (!drag) return; cy -= (e.clientX - drag.x) * 0.008; cp = Math.max(-0.1, Math.min(1.45, cp + (e.clientY - drag.y) * 0.006)); drag = { x: e.clientX, y: e.clientY }; });
  window.addEventListener('pointerup', () => { drag = null; }); window.addEventListener('pointercancel', () => { drag = null; });
  window.addEventListener('wheel', e => { if (onPanel(e)) return; zoom = Math.max(0.3, Math.min(3, zoom * (e.deltaY > 0 ? 1.1 : 0.9))); }, { passive: true });

  // ---------------------------------------------------------------- update loop
  onUpdate((rdt) => {
    scene.children.forEach(hide);
    const step = Math.min(stepQ, 1 / 60); stepQ = Math.max(0, stepQ - step); if (stepQ < 1e-6) stepQ = 0;
    const dt = rdt * slow + step, v = SPEED[mode], yaw = yawOf(), dx = Math.sin(yaw), dz = Math.cos(yaw);
    t += dt;
    if (v > 0) { grid.position.x -= dx * v * dt; grid.position.z -= dz * v * dt; grid.position.x = h.home.x + ((((grid.position.x - h.home.x) % 0.5) + 0.5) % 0.5); grid.position.z = h.home.z + ((((grid.position.z - h.home.z) % 0.5) + 0.5) % 0.5); }
    const vel = { x: dx * v, z: dz * v };
    let anyBusy = false;
    for (const s of acts) {
      const a = s.a as BattleActor & { walkPh?: number; kneel?: number };
      if (s.downT >= 0) { s.downT -= dt; if (s.downT < 0) { build(); return; } }
      a.yaw = yaw; a.place(V3(s.x, 0, s.z), yaw);
      if (s.it.hero) {
        const m = motionOf(a), hr = mode === 'idle' ? 0 : mode === 'slow' ? 0.30 : mode === 'walk' ? 0.50 : 1.0;
        const hsp = hr * 6.8;
        m.run = s.hMode ? 0 : hr;
        m.treadmill = s.hMode ? 0 : v;
        m.phase += hsp * (3.0 - 0.5 * hr) * dt;
        m.charge = 0; m.air = 0; m.rise = 0; m.flip = 0; m.squat = 0; m.land = 0; m.dart = 0; m.dartBack = 0; m.airT = 9;
        if (s.hMode) {
          s.hT += dt;
          const u = Math.min(1, s.hT / Math.max(0.05, s.hDur));
          if (s.hMode === 'charge') m.charge = Math.min(1, u * 1.3);
          else if (s.hMode === 'jump') {
            // Full 4-beat normal jump preview: squat (0..0.10) -> parabolic soar (0.10..0.82) -> landing cushion (0.82..1.0)
            if (u < 0.10) m.squat = u / 0.10;
            else if (u < 0.82) {
              const p = (u - 0.10) / 0.72;
              m.air = 4 * p * (1 - p) * 1.55;
              m.rise = 1 - 2 * p;
              m.airT = p * 0.55;
            } else {
              m.land = 1 - (u - 0.82) / 0.18; m.landW = 0.72;
            }
          }
          else if (s.hMode === 'flip') { m.air = Math.sin(u * Math.PI) * 1.9; m.rise = Math.cos(u * Math.PI); m.flip = Math.min(1, u / 0.82); }
          else if (s.hMode === 'airAct') { m.air = 1.15 * Math.sin(Math.min(1, u * 1.15) * Math.PI * 0.85 + 0.15); m.rise = 0.25 - u * 0.8; }
          else if (s.hMode === 'swoop') { m.air = u < 0.36 ? 1.55 * (1 - (u / 0.36) ** 1.6) : 0; m.rise = u < 0.36 ? -1.4 : 0; }
          else if (s.hMode === 'dart' || s.hMode === 'dartBack') { m.dart = u; m.dartBack = s.hMode === 'dartBack' ? 1 : 0; }
          else if (s.hMode === 'plunge') {
            if (u < 0.65) { const p = u / 0.65; m.air = p < 0.4 ? 1.8 * (p / 0.4) : 1.8 * Math.max(0, 1 - ((p - 0.4) / 0.6) ** 2); m.rise = p < 0.4 ? 0.5 : -1.5; }
            else if (!a.act || a.act.name === 'plunge') a.play(new Action('plungeL', 0.34, 0.05));
          }
          if (s.hT >= s.hDur) { s.hMode = undefined; m.charge = 0; m.air = 0; m.rise = 0; m.flip = 0; m.squat = 0; m.land = 0; m.dart = 0; m.dartBack = 0; }
        }
        if (s.hMode || a.act) anyBusy = true;
      } else if (s.it.npc) {
        const nv = Math.min(v, 2.0), quad = s.it.def.kind === 'quad';
        a.walkPh = nv > 0 && !s.kneel ? (a.walkPh ?? 0) + dt * (quad ? NPC_PH_QUAD : NPC_PH) * (nv / 1.25) : undefined;
        a.kneel = s.kneel;
      } else {
        a.setRunning(v > 0.6, v, yaw, vel);
        if (a.act) anyBusy = true;
      }
      a.update(dt);
    }
    // Auto-loop the active move so tuning sliders can be watched live without re-clicking
    if (loopMove && lastTrigger && slow > 0) {
      if (anyBusy) loopCooldown = 0.38;
      else if ((loopCooldown -= rdt) <= 0) { lastTrigger(); loopCooldown = 0.38; }
    }
    // Live timeline scrubber readout
    const lead = acts[0];
    if (lead?.a.act) {
      const k = Math.max(0, Math.min(1, lead.a.act.k));
      scrubFill.style.width = `${(k * 100).toFixed(1)}%`;
      scrubAt.style.left = `${(lead.a.act.at * 100).toFixed(1)}%`;
      scrubAt.style.display = '';
      scrubTxt.textContent = `${lead.moveLabel || lead.a.act.name}  k=${k.toFixed(2)} (命中 ${lead.a.act.at.toFixed(2)})`;
    } else if (lead?.hMode && lead.hDur > 0) {
      const k = Math.max(0, Math.min(1, lead.hT / lead.hDur));
      scrubFill.style.width = `${(k * 100).toFixed(1)}%`;
      scrubAt.style.left = `${(lead.moveAt * 100).toFixed(1)}%`;
      scrubAt.style.display = '';
      scrubTxt.textContent = `${lead.moveLabel || lead.hMode}  k=${k.toFixed(2)}`;
    } else {
      scrubFill.style.width = '0%';
      scrubAt.style.display = 'none';
      scrubTxt.textContent = mode === 'idle' ? '待机中 · 可点招式或拖拽进度条' : `${MODE_CN[mode]}中 (${SPEED[mode].toFixed(1)} m/s)`;
    }

    // the camera
    const e = extent(), W = Math.max(2.2, e.w), D = Math.max(6.2, (W / 2 + 1.8) * 2.6 + e.d * 0.6) * zoom, off = D * 0.12;
    if (view === 'game') h.cam([e.cx + off, 9.5 * Math.max(1, W / 12) * zoom, e.cz + 8.5 * Math.max(1, W / 12) * zoom], [e.cx + off, 0.4, e.cz - e.d / 2], 38);
    else if (view === 'free') { const tx = e.cx, tz = e.cz - e.d / 2; h.cam([tx + Math.sin(cy) * Math.cos(cp) * D, 0.9 + Math.sin(cp) * D, tz + Math.cos(cy) * Math.cos(cp) * D], [tx, 0.9, tz], 32); }
    else if (view === 'orbit') { ang += rdt * 0.4; h.cam([e.cx + Math.sin(ang) * D, 2.2, e.cz - e.d / 2 + Math.cos(ang) * D], [e.cx, 0.9, e.cz - e.d / 2], 32); }
    else h.cam([e.cx + off, 1.3, e.cz + D], [e.cx + off, 0.9, e.cz - e.d / 2], 30);
  });

  function refresh() {
    for (const k of ['browse', 'tune', 'notes'] as const) {
      tabBtns[k].classList.toggle('on', activeTab === k);
      panes[k].classList.toggle('on', activeTab === k);
    }
    loopBtn.classList.toggle('on', loopMove);
    for (const [k, b] of barSpeedBtns) b.classList.toggle('on', slow === k);
    for (const [v, b] of verdictBtns) b.classList.toggle('on', curVerdict === v);
    gBtns.forEach((b, i) => b.classList.toggle('on', gi === i));
    allBtn.classList.toggle('on', pick < 0); pBtns.forEach((b, i) => b.classList.toggle('on', pick === i));
    for (const [m, b] of mBtns) b.classList.toggle('on', mode === m);
    for (const [v, b] of vBtns) b.classList.toggle('on', view === v);
    for (const [k, b] of sBtns) b.classList.toggle('on', slow === k);
    const g = groups[gi];
    const picked = pick >= 0 ? g.items[pick] : null;
    const who = picked ? picked.name : `整组（${g.items.length} 个）`;
    const curAct = lastMove || MODE_CN[mode];
    ctxBadge.innerHTML = `<b>当前评审现场</b><br>角色：${g.name} · ${who}<br>动作：${curAct} ｜ 镜头：${VIEW_CN[view]} ｜ 速度：${slow}×`;
    const mv = picked?.hero ? '\n招式：' + HERO_MOVES.map(m => m.label).join(' · ') + (lastMove ? `\n刚才：${lastMove}` : '')
      : picked && !picked.npc ? '\n招式：' + movesOf(picked.def.id).map(moveName).join(' · ') + (lastMove ? `\n刚才：${lastMove}` : '') : (g.items[0]?.hero && lastMove ? `\n刚才：${lastMove}` : '');
    info.textContent = `${g.name} · ${who}${mv}\n画面拖拽转视角，滚轮缩放；点顶部进度条可直接拖帧。`;
  }

  renderNotes();
  build(); listRow();
}
