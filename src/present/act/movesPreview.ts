// 全招式预览页（act-140，用户：「全招式的预览做一个页面放桌面上，我想看。」）：
// 打开方式：网址加 ?moves，或桌面的「不见刀_全招式预览.html」。
// 在据点开阔中庭内，以真实战斗引擎、真实按键输入序列与真实受击陪练敌兵，完整展示：
//   - 四柄文家名刀（寒山旧刀 / 惊雷陌刀 / 霜鳞短刃 / 无锋断刃）切换与全段普攻
//   - 全部基础招式（7 项）、名刀专属技（4 项）、12 本刀谱、16 项绝品秘传（共 39 项）
//   - 慢放倍速（1× / 0.5× / 0.25×，步骤计时器随游戏 dt 同步，慢放连招绝不脱节）
//   - 多镜头视角（游戏实战 / 侧面近景 / 正面 / 环绕 + 鼠标拖拽旋转与滚轮缩放）
//   - 单招循环 / 全招式自动巡演 / 电脑键盘随时手操（WASD / J / K / L / 空格）
import { onUpdate } from '../engine/world';
import { FX } from '../engine/clock';
import { WEAPON_ORDER, WEAPONS, type WeaponId } from './weapons';
import { MANUALS } from './manuals';
import { BOONS, type BoonId } from './boons';

export type Btn = 'attack' | 'dash' | 'special' | 'jump';
export type StageFormation = 'line' | 'ring' | 'close' | 'far' | 'lowhp' | 'decoy';
export interface StageSetup {
  weapon?: WeaponId;
  weaponLv?: number;
  boons?: Partial<Record<BoonId, number>>;
  formation?: StageFormation;
  heroHp?: number;
  intent?: number;
  freeFlash?: boolean;
  qi?: number;
}
export interface MovesHost {
  resetStage(setup?: StageSetup): void;
  weapon(): WeaponId;
  setWeapon(id: WeaponId, lv?: number): void;
  hold(b: Btn, sec: number): void;
  stick(x: number, y: number, sec: number): void;
  arrow(d: number): void;
  hero(): { x: number; y: number; z: number; yaw: number };
  cam(base: number[] | null, look?: number[], fov?: number): void;
  setSpeed(s: number): void;
  speed(): number;
}

type CatId = 'base' | 'weapon' | 'manual' | 'boon';
const CAT_LABEL: Record<CatId, string> = {
  base: '基础招式',
  weapon: '名刀专属',
  manual: '刀谱派生',
  boon: '绝品秘传',
};
const CAT_COL: Record<CatId, string> = {
  base: '#e6d8be',
  weapon: '#ffd066',
  manual: '#8ce2c6',
  boon: '#ff8a7a',
};

interface StepEvent {
  /** game-clock seconds from start of move (scales cleanly with 0.5x / 0.25x slow-mo) */
  at: number;
  run: (ctx: RunCtx) => void;
}
interface RunCtx {
  host: MovesHost;
  tap: (b: Btn) => void;
  hold: (b: Btn, gameSec: number) => void;
  stick: (x: number, y: number, gameSec: number) => void;
}
interface MoveEntry {
  id: string;
  cat: CatId;
  name: string;
  short?: string;
  keys: string;
  tip: string;
  accent?: string;
  /** optional forced weapon (or preferred weapon if current doesn't have the pose) */
  weapon?: WeaponId;
  /** only switch away from current weapon if current weapon isn't in this allowlist */
  allowWeapons?: WeaponId[];
  boon?: BoonId;
  formation?: StageFormation;
  heroHp?: number;
  intent?: number;
  freeFlash?: boolean;
  /** total playback window (game-clock seconds) before loop/tour advances */
  span: number;
  steps: (wid: WeaponId) => StepEvent[];
}

function comboSteps(wid: WeaponId, maxCuts?: number): StepEvent[] {
  const n = Math.min(maxCuts ?? WEAPONS[wid].cuts.length, WEAPONS[wid].cuts.length);
  const gaps: Record<WeaponId, number[]> = {
    hanshan: [0, 0.28, 0.56, 0.98, 1.38],
    thunder: [0, 0.36, 0.74],
    frost: [0, 0.20, 0.40, 0.68, 0.88, 1.22],
    blunt: [0, 0.24],
  };
  const ts = gaps[wid];
  const out: StepEvent[] = [];
  for (let i = 0; i < n; i++) out.push({ at: ts[i] ?? i * 0.35, run: c => c.tap('attack') });
  return out;
}

const manualMap = new Map(MANUALS.map(m => [m.id, m]));
const boonMap = new Map(BOONS.map(b => [b.id, b]));
const mDesc = (id: string) => manualMap.get(id as never)?.desc[0] ?? '';
const bDesc = (id: BoonId) => boonMap.get(id)?.eff ?? '';

const ENTRIES: MoveEntry[] = [
  // ================================================================ 1. 基础招式 (7)
  {
    id: 'base_combo', cat: 'base', name: '普攻连段（当前名刀）', short: '普攻全连段',
    keys: '连续点按 斩（J）',
    tip: '随上方所选名刀自动演示全套段数与专属刀光（寒山5段 / 惊雷3段 / 霜鳞6段 / 无锋2段）',
    formation: 'line', span: 3.1,
    steps: wid => comboSteps(wid),
  },
  {
    id: 'base_dash_cut', cat: 'base', name: '穿风斩',
    keys: '冲刺（K）→ 斩（J）',
    tip: '穿身冲刺不顶人，紧接贴地突进横斩',
    formation: 'line', span: 2.0,
    steps: () => [
      { at: 0.0, run: c => { c.stick(1, 0, 0.25); c.tap('dash'); } },
      { at: 0.11, run: c => c.tap('attack') },
    ],
  },
  {
    id: 'base_stance', cat: 'base', name: '藏锋 · 蓄力拔刀', short: '藏锋拔刀',
    keys: '长按 斩（J）至鸣锋后松手',
    tip: '按当前名刀触发专属拔刀技：寒山箭步斩 / 惊雷裂阵斩 / 霜鳞追霜 / 无锋听声一闪',
    formation: 'line', span: 2.5,
    steps: () => [{ at: 0.0, run: c => c.hold('attack', 0.92) }],
  },
  {
    id: 'base_parry', cat: 'base', name: '破势弹反',
    keys: '长按 斩（J）藏锋接敌招 / 来箭',
    tip: '藏锋姿态精准接下敌箭，触发清脆金铁一闪反击与满额破势',
    formation: 'line', span: 2.4,
    steps: () => [
      { at: 0.0, run: c => c.hold('attack', 1.05) },
      { at: 0.34, run: c => c.host.arrow(5.8) },
    ],
  },
  {
    id: 'base_plunge', cat: 'base', name: '劈山（跳斩）', short: '劈山',
    keys: '跳（空格）→ 空中 斩（J）',
    tip: '跃起竖劈砸地，带震地碎尘与范围冲击',
    formation: 'close', span: 2.1,
    steps: () => [
      { at: 0.0, run: c => { c.stick(1, 0, 0.28); c.tap('jump'); } },
      { at: 0.28, run: c => c.tap('attack') },
    ],
  },
  {
    id: 'base_dart', cat: 'base', name: '柳叶镖（三连）', short: '柳叶镖',
    keys: '连按 镖（L）× 3',
    tip: '快速连发三枚暗器钉入敌身，可衔接寻声 / 牵红 / 追霜',
    formation: 'far', span: 2.0,
    steps: () => [
      { at: 0.0, run: c => c.tap('special') },
      { at: 0.28, run: c => c.tap('special') },
      { at: 0.56, run: c => c.tap('special') },
    ],
  },
  {
    id: 'base_ult', cat: 'base', name: '不见刀 · 绝技', short: '不见刀绝技',
    keys: '满三格杀气 + 破势接招（自动踩中一闪）',
    tip: '拔刀封喉绝技，全屏暗墨微闪与凌厉斩痕收尾',
    formation: 'close', intent: 3, span: 4.0,
    steps: () => [
      { at: 0.0, run: c => c.hold('attack', 1.05) },
      { at: 0.34, run: c => c.host.arrow(5.5) },
    ],
  },

  // ================================================================ 2. 四柄名刀专属技 (4)
  {
    id: 'wep_hanshan', cat: 'weapon', name: '寒山旧刀 · 末刀月牙', short: '寒山 · 末刀月牙',
    weapon: 'hanshan', accent: WEAPONS.hanshan.col,
    keys: '寒山五段连斩（淬炼 1 阶以上末刀带月牙）',
    tip: '清冷素银五段连环，收尾重劈甩出窄月牙刀气贯通前排',
    formation: 'line', span: 3.2,
    steps: () => comboSteps('hanshan'),
  },
  {
    id: 'wep_thunder', cat: 'weapon', name: '惊雷陌刀 · 裂阵斩', short: '惊雷 · 裂阵斩',
    weapon: 'thunder', accent: WEAPONS.thunder.col,
    keys: '惊雷陌刀长按 斩（J）藏锋释放',
    tip: '锻金重刀劈出 6.5m 焦金雷裂冲击波，并召体素落雷轰击命中敌兵',
    formation: 'line', span: 2.7,
    steps: () => [{ at: 0.0, run: c => c.hold('attack', 0.95) }],
  },
  {
    id: 'wep_frost', cat: 'weapon', name: '霜鳞短刃 · 追霜霜爆', short: '霜鳞 · 追霜霜爆',
    weapon: 'frost', accent: WEAPONS.frost.col,
    keys: '霜鳞三刀钉影针 → 长按 斩（J）穿刺引爆',
    tip: '第三刀自动钉下冰青影针，随后藏锋「追霜」穿身引爆寒霜爆裂',
    formation: 'line', span: 3.1,
    steps: () => [
      { at: 0.0, run: c => c.tap('attack') },
      { at: 0.24, run: c => c.tap('attack') },
      { at: 0.50, run: c => c.tap('attack') },
      { at: 0.96, run: c => c.hold('attack', 0.88) },
    ],
  },
  {
    id: 'wep_blunt', cat: 'weapon', name: '无锋断刃 · 听声一闪', short: '无锋 · 听声一闪',
    weapon: 'blunt', accent: WEAPONS.blunt.col,
    keys: '破势赋「一闪就绪」→ 长按 斩（J）瞬发赤金一闪',
    tip: '无锋破势后免费刷新赤金「听声一闪」，长距疾掠斩穿前路敌兵',
    formation: 'line', freeFlash: true, span: 2.4,
    steps: () => [{ at: 0.0, run: c => c.hold('attack', 0.55) }],
  },

  // ================================================================ 3. 全部 12 本刀谱 (12)
  {
    id: 'man_chase', cat: 'manual', name: '寻声',
    keys: '镖（L）命中 → 斩（J）',
    tip: `${mDesc('chase')} · 靛青残影瞬步贴身斩击`,
    formation: 'far', span: 2.2,
    steps: () => [
      { at: 0.0, run: c => c.tap('special') },
      { at: 0.34, run: c => c.tap('attack') },
    ],
  },
  {
    id: 'man_backDart', cat: 'manual', name: '回身镖',
    keys: '冲刺（K）中 → 镖（L）',
    tip: `${mDesc('backDart')} · 反手三道霜银镖影扇形飞出`,
    formation: 'close', span: 2.0,
    steps: () => [
      { at: 0.0, run: c => { c.stick(-1, 0, 0.26); c.tap('dash'); } },
      { at: 0.11, run: c => c.tap('special') },
    ],
  },
  {
    id: 'man_dbl', cat: 'manual', name: '二段跳',
    keys: '跳（空格）→ 空中再按 跳（空格）',
    tip: `${mDesc('dbl')} · 半空翻身再拔高 1.8m`,
    formation: 'close', span: 2.0,
    steps: () => [
      { at: 0.0, run: c => c.tap('jump') },
      { at: 0.30, run: c => c.tap('jump') },
    ],
  },
  {
    id: 'man_launch', cat: 'manual', name: '挑云',
    keys: '斩（J）→ 跳（空格）',
    tip: `${mDesc('launch')} · 银青弯月上挑，将敌挑上半空并随之跃起`,
    formation: 'close', span: 2.3,
    steps: () => [
      { at: 0.0, run: c => c.tap('attack') },
      { at: 0.24, run: c => c.tap('jump') },
    ],
  },
  {
    id: 'man_cutDart', cat: 'manual', name: '迎面镖',
    keys: '斩（J）→ 镖（L）',
    tip: `${mDesc('cutDart')} · 斩后贴脸三道扇形飞镖封喉`,
    formation: 'close', span: 2.0,
    steps: () => [
      { at: 0.0, run: c => c.tap('attack') },
      { at: 0.24, run: c => c.tap('special') },
    ],
  },
  {
    id: 'man_keep', cat: 'manual', name: '游身斩',
    keys: '斩（J）→ 侧向冲刺（K）→ 斩（J）',
    tip: `${mDesc('keep')} · 侧步闪出后接银青十字错锋连段不断`,
    formation: 'close', span: 2.4,
    steps: () => [
      { at: 0.0, run: c => c.tap('attack') },
      { at: 0.24, run: c => { c.stick(0, 1, 0.26); c.tap('dash'); } },
      { at: 0.56, run: c => c.tap('attack') },
    ],
  },
  {
    id: 'man_pause', cat: 'manual', name: '扫八方',
    keys: '斩 → 斩 → 停顿半拍 → 斩',
    tip: `${mDesc('pause')} · 双圈 360° 银金体素旋风刀环清退四周`,
    allowWeapons: ['hanshan', 'thunder', 'frost'],
    formation: 'ring', span: 3.0,
    steps: wid => {
      const t2 = wid === 'thunder' ? 0.36 : wid === 'frost' ? 0.20 : 0.28;
      const tPause = wid === 'thunder' ? 1.24 : wid === 'frost' ? 0.78 : 0.96;
      return [
        { at: 0.0, run: c => c.tap('attack') },
        { at: t2, run: c => c.tap('attack') },
        { at: tPause, run: c => c.tap('attack') },
      ];
    },
  },
  {
    id: 'man_kick', cat: 'manual', name: '穿心腿',
    keys: '冲刺（K）→ 跳（空格）',
    tip: `${mDesc('kick')} · 贴地飞踹弹出青白冲风体素轨迹，强力破势击退`,
    formation: 'line', span: 2.2,
    steps: () => [
      { at: 0.0, run: c => { c.stick(1, 0, 0.25); c.tap('dash'); } },
      { at: 0.11, run: c => c.tap('jump') },
    ],
  },
  {
    id: 'man_acut', cat: 'manual', name: '断云',
    keys: '斩 → 跳（挑云）→ 空中连按 斩 × 3',
    tip: `${mDesc('acut')} · 空中三连凌厉十字斩，第三刀砸落掀尘`,
    formation: 'close', span: 3.0,
    steps: () => [
      { at: 0.0, run: c => c.tap('attack') },
      { at: 0.24, run: c => c.tap('jump') },
      { at: 0.62, run: c => c.tap('attack') },
      { at: 0.88, run: c => c.tap('attack') },
      { at: 1.16, run: c => c.tap('attack') },
    ],
  },
  {
    id: 'man_swoop', cat: 'manual', name: '掠地',
    keys: '跳（空格）→ 朝敌空中 冲刺（K）',
    tip: `${mDesc('swoop')} · 俯冲掠过整排敌兵背后，沿途各中一刀`,
    formation: 'line', span: 2.3,
    steps: () => [
      { at: 0.0, run: c => c.tap('jump') },
      { at: 0.26, run: c => { c.stick(1, 0, 0.30); c.tap('dash'); } },
    ],
  },
  {
    id: 'man_reel', cat: 'manual', name: '牵红',
    keys: '镖（L）命中 → 再按 镖（L）',
    tip: `${mDesc('reel')} · 绷直赤红细索将远处敌兵拉至刀前`,
    formation: 'far', span: 2.2,
    steps: () => [
      { at: 0.0, run: c => c.tap('special') },
      { at: 0.34, run: c => c.tap('special') },
    ],
  },
  {
    id: 'man_stomp', cat: 'manual', name: '踏顶',
    keys: '敌旁 跳（空格）→ 空中再按 跳（空格）',
    tip: `${mDesc('stomp')} · 借敌肩头踏下震晕并高高弹起`,
    formation: 'close', span: 2.2,
    steps: () => [
      { at: 0.0, run: c => { c.stick(1, 0, 0.28); c.tap('jump'); } },
      { at: 0.28, run: c => c.tap('jump') },
    ],
  },

  // ================================================================ 4. 全部 16 项秘传 (16, 绝品档)
  {
    id: 'boon_pierce', cat: 'boon', boon: 'pierce', name: '透骨（连刺长枪光）', short: '★ 透骨',
    allowWeapons: ['hanshan', 'frost'], accent: '#e2e8ee',
    keys: '寒山第 4 刀 / 霜鳞第 3 刀（连刺第二下）',
    tip: `${bDesc('pierce')} · 7 米冷银体素长枪贯通整排三敌，枪尖星爆`,
    formation: 'line', span: 2.9,
    steps: wid => comboSteps(wid, wid === 'frost' ? 3 : 4),
  },
  {
    id: 'boon_spin', cat: 'boon', boon: 'spin', name: '荡刃（扩圈旋风）', short: '★ 荡刃',
    allowWeapons: ['hanshan', 'frost'], accent: '#b8c4c8',
    keys: '寒山第 3 刀 / 霜鳞第 5 刀',
    tip: `${bDesc('spin')} · 扩圈冷银体素风环席卷四周敌群`,
    formation: 'ring', span: 2.6,
    steps: wid => comboSteps(wid, wid === 'frost' ? 5 : 3),
  },
  {
    id: 'boon_bladeWind', cat: 'boon', boon: 'bladeWind', name: '刀芒（收尾月牙）', short: '★ 刀芒',
    allowWeapons: ['hanshan', 'thunder', 'frost'], accent: '#d0c8b8',
    keys: '普攻收尾末刀',
    tip: `${bDesc('bladeWind')} · 末刀甩出远距月牙体素刀气，一刀穿三敌`,
    formation: 'line', span: 3.3,
    steps: wid => comboSteps(wid),
  },
  {
    id: 'boon_extra', cat: 'boon', boon: 'extra', name: '叠刃（延迟补刀）', short: '★ 叠刃',
    allowWeapons: ['hanshan', 'thunder', 'frost'], accent: '#bd9b82',
    keys: '普攻收尾末刀命中敌身',
    tip: `${bDesc('extra')} · 末刀命中 0.12 秒后浮现体素十字刀影补斩`,
    formation: 'close', span: 3.2,
    steps: wid => comboSteps(wid),
  },
  {
    id: 'boon_bleed', cat: 'boon', boon: 'bleed', name: '见红（叠层流血）', short: '见红',
    accent: '#c84b52',
    keys: '任意刀招命中叠层',
    tip: `${bDesc('bleed')} · 刀弧泛赤红血尾，敌身持续淌血失血`,
    formation: 'close', span: 2.8,
    steps: wid => comboSteps(wid, Math.min(4, WEAPONS[wid].cuts.length)),
  },
  {
    id: 'boon_behead', cat: 'boon', boon: 'behead', name: '枭首（低血瞬斩）', short: '枭首',
    accent: '#d65a52',
    keys: '低血敌脚下亮红圈 → 一刀斩杀',
    tip: `${bDesc('behead')} · 残血目标脚下亮起斩首红环，挨一刀立毙`,
    formation: 'lowhp', span: 2.1,
    steps: () => [{ at: 0.25, run: c => c.tap('attack') }],
  },
  {
    id: 'boon_passCut', cat: 'boon', boon: 'passCut', name: '错身（穿身顺斩）', short: '★ 错身',
    accent: '#9ad8ff',
    keys: '冲刺（K）直接穿过敌身',
    tip: `${bDesc('passCut')} · 零顶人穿身冲刺，沿途每位敌身绽开霜青斜斩`,
    formation: 'line', span: 2.0,
    steps: () => [{ at: 0.0, run: c => { c.stick(1, 0, 0.30); c.tap('dash'); } }],
  },
  {
    id: 'boon_decoy', cat: 'boon', boon: 'decoy', name: '留影（诱敌残影）', short: '留影',
    accent: '#8a96d8',
    keys: '冲刺（K）起步留影',
    tip: `${bDesc('decoy')} · 原地留下靛蓝残影，吸引前方敌兵围攻假身`,
    formation: 'decoy', span: 2.6,
    steps: () => [{ at: 0.0, run: c => { c.stick(0, 1, 0.28); c.tap('dash'); } }],
  },
  {
    id: 'boon_darts3', cat: 'boon', boon: 'darts3', name: '撒星（五镖扇射）', short: '撒星',
    accent: '#9dabb2',
    keys: '点按 镖（L）',
    tip: `${bDesc('darts3')} · 绝品一次甩出五枚柳叶镖大扇形覆盖`,
    formation: 'far', span: 2.0,
    steps: () => [
      { at: 0.0, run: c => c.tap('special') },
      { at: 0.45, run: c => c.tap('special') },
    ],
  },
  {
    id: 'boon_boomerang', cat: 'boon', boon: 'boomerang', name: '折返（回旋飞镖）', short: '折返',
    accent: '#c8d0d6',
    keys: '点按 镖（L）',
    tip: `${bDesc('boomerang')} · 柳叶镖飞至尽头折返穿敌，往返两段贯穿`,
    formation: 'line', span: 2.4,
    steps: () => [{ at: 0.0, run: c => c.tap('special') }],
  },
  {
    id: 'boon_pin', cat: 'boon', boon: 'pin', name: '截脉（寒环定身）', short: '截脉',
    accent: '#a8d8f0',
    keys: '镖（L）命中敌身',
    tip: `${bDesc('pin')} · 敌足浮起冰蓝寒环定身 1.4 秒，强制打断出招`,
    formation: 'far', span: 2.3,
    steps: () => [{ at: 0.0, run: c => c.tap('special') }],
  },
  {
    id: 'boon_twinDraw', cat: 'boon', boon: 'twinDraw', name: '追步（藏锋二段）', short: '★ 追步',
    weapon: 'hanshan', accent: '#ffd890',
    keys: '长按 斩（J）释放箭步斩',
    tip: `${bDesc('twinDraw')} · 箭步斩落定后自动折返奔袭第二敌，补出一道暖金弧斩`,
    formation: 'line', span: 2.8,
    steps: () => [{ at: 0.0, run: c => c.hold('attack', 0.92) }],
  },
  {
    id: 'boon_burst', cat: 'boon', boon: 'burst', name: '崩劲（破势震荡）', short: '崩劲',
    accent: '#ffe0a0',
    keys: '藏锋破势接招',
    tip: `${bDesc('burst')} · 弹反瞬间绽放 4.2m 鎏金冲击环震退四周敌群`,
    formation: 'ring', span: 2.5,
    steps: () => [
      { at: 0.0, run: c => c.hold('attack', 1.05) },
      { at: 0.34, run: c => c.host.arrow(5.6) },
    ],
  },
  {
    id: 'boon_rift', cat: 'boon', boon: 'rift', name: '裂地（劈山地裂）', short: '裂地',
    accent: '#d8b888',
    keys: '跳（空格）→ 空中 斩（J）劈山',
    tip: `${bDesc('rift')} · 落地裂出 8 米沿路体素地裂，将整排敌人逐一掀飞`,
    formation: 'line', span: 2.5,
    steps: () => [
      { at: 0.0, run: c => { c.stick(1, 0, 0.25); c.tap('jump'); } },
      { at: 0.28, run: c => c.tap('attack') },
    ],
  },
  {
    id: 'boon_vault', cat: 'boon', boon: 'vault', name: '掠顶（跃顶下劈）', short: '★ 掠顶',
    accent: '#c0d0e0',
    keys: '助跑 跳（空格）越过敌头顶',
    tip: `${bDesc('vault')} · 腾空掠过敌顶自动劈出一道冷银垂直体素斩弧`,
    formation: 'close', span: 2.2,
    steps: () => [
      { at: 0.0, run: c => { c.stick(1, 0, 0.72); c.tap('jump'); } },
    ],
  },
  {
    id: 'boon_drink', cat: 'boon', boon: 'drink', name: '饮血（斩杀回血）', short: '饮血',
    accent: '#d65860',
    keys: '斩杀任意敌人触发',
    tip: `${bDesc('drink')} · 斩杀瞬间敌人迸出赤红血珠回流主角疗伤`,
    formation: 'lowhp', heroHp: 58, span: 2.3,
    steps: () => [{ at: 0.20, run: c => c.tap('attack') }],
  },
];

export function openMovesPreview(h: MovesHost) {
  // ---------------------------------------------------------------- playback scheduler (game-clock driven!)
  let active: MoveEntry = ENTRIES[0];
  let queue: StepEvent[] = [];
  let qi = 0;
  let elapsed = 0;
  let prep = 0;
  let span = 2.6;
  let loopOn = true;
  let tourOn = false;
  let tourIdx = 0;
  let started = false;

  const currentSpeed = () => Math.max(0.15, h.speed());
  const runCtx: RunCtx = {
    host: h,
    // Keep taps crisp in real time (< chargeDelay) so slow-mo never turns a tap into a charge hold
    tap: b => h.hold(b, 0.055),
    // Scale sustained holds & stick pushes inversely with FX.speed so game-clock duration stays exact
    hold: (b, gameSec) => h.hold(b, gameSec / currentSpeed()),
    stick: (x, y, gameSec) => h.stick(x, y, gameSec / currentSpeed()),
  };

  function resolveWeaponFor(e: MoveEntry): WeaponId {
    const cur = h.weapon();
    if (e.weapon) return e.weapon;
    if (e.allowWeapons && !e.allowWeapons.includes(cur)) return e.allowWeapons[0];
    return cur;
  }

  function playMove(e: MoveEntry, keepTour = false) {
    started = true;
    if (!keepTour) tourOn = false;
    active = e;
    const wid = resolveWeaponFor(e);
    const boons: Partial<Record<BoonId, number>> = {};
    if (e.boon) boons[e.boon] = 2; // 绝品 tier for full upgraded VFX readability
    h.resetStage({
      weapon: wid,
      weaponLv: 3,
      boons,
      formation: e.formation ?? 'line',
      heroHp: e.heroHp ?? 100,
      intent: e.intent ?? 0,
      freeFlash: !!e.freeFlash,
      qi: 3,
    });
    queue = e.steps(wid).slice().sort((a, b) => a.at - b.at);
    qi = 0;
    elapsed = 0;
    prep = 0.22; // brief calm beat before executing steps so formation & weapon read clearly
    span = e.span;
    refreshUI();
  }

  function startTour() {
    tourOn = true;
    tourIdx = 0;
    playMove(ENTRIES[0], true);
  }

  // ---------------------------------------------------------------- camera control + mouse orbit
  type CamMode = 'game' | 'side' | 'front' | 'orbit';
  let view: CamMode = 'game';
  let ang = 0.72;
  let pitch = 0.34;
  let dist = 7.4;
  let spin = true;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  const setView = (v: CamMode) => {
    view = v;
    if (v === 'game') h.cam(null);
    else if (v === 'side') { ang = Math.PI * 0.56; pitch = 0.28; dist = 6.2; }
    else if (v === 'front') { ang = Math.PI + 0.35; pitch = 0.24; dist = 5.6; }
    else if (v === 'orbit') { pitch = 0.34; dist = 6.8; }
    refreshUI();
  };

  window.addEventListener('pointerdown', e => {
    if ((e.target as HTMLElement)?.closest('#mvPanel,#mvToggle')) return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  });
  window.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    if (Math.hypot(dx, dy) > 2 && view === 'game') {
      view = 'orbit';
      spin = false;
      ang = 0.22;
      pitch = 0.42;
      dist = 8.4;
      refreshUI();
    }
    if (view !== 'game') {
      spin = false;
      ang -= dx * 0.008;
      pitch = Math.max(0.10, Math.min(1.05, pitch + dy * 0.006));
    }
  });
  window.addEventListener('pointerup', () => { dragging = false; });
  window.addEventListener('wheel', e => {
    if ((e.target as HTMLElement)?.closest('#mvPanel')) return;
    if (view === 'game') {
      view = 'orbit';
      spin = false;
      ang = 0.18;
      pitch = 0.42;
      dist = 8.4;
      refreshUI();
    }
    dist = Math.max(3.2, Math.min(14, dist + Math.sign(e.deltaY) * 0.6));
  }, { passive: true });

  onUpdate((dt) => {
    // Advance scripted move steps on game-clock dt (synced to FX.speed & hitstop!)
    if (queue.length > 0 || loopOn || tourOn) {
      if (prep > 0) {
        prep -= dt;
      } else {
        elapsed += dt;
        while (qi < queue.length && elapsed >= queue[qi].at) {
          queue[qi].run(runCtx);
          qi++;
        }
        if (elapsed >= span) {
          if (tourOn) {
            tourIdx = (tourIdx + 1) % ENTRIES.length;
            playMove(ENTRIES[tourIdx], true);
          } else if (loopOn) {
            playMove(active, false);
          } else {
            queue = [];
          }
        }
      }
    }

    // Update camera override if not in default game camera
    if (view === 'game') return;
    const p = h.hero();
    if (view === 'orbit' && spin) ang += dt * 0.28 / Math.max(0.25, FX.speed);
    const a = view === 'orbit' ? ang : view === 'side' ? 0.14 : Math.PI * 0.5 + 0.32;
    const fy = p.y * 0.65;
    const cx = p.x + 1.25;
    const cz = p.z;
    const hd = Math.cos(pitch) * dist;
    const vy = Math.sin(pitch) * dist + 1.05 + fy;
    h.cam([cx + Math.sin(a) * hd, vy, cz + Math.cos(a) * hd], [cx, 0.95 + fy, cz], 34);
  });

  // ---------------------------------------------------------------- DOM UI (wuxia ink-gold studio panel)
  const css = `
    #mvCard{position:fixed;left:14px;top:14px;max-width:440px;padding:12px 15px;border-radius:8px;
      background:rgba(13,12,16,.82);border:1px solid rgba(214,174,104,.35);border-left:4px solid #e2b86a;
      color:#f2ead8;font:13px/1.45 system-ui,'Microsoft YaHei',sans-serif;z-index:50;pointer-events:none;
      box-shadow:0 8px 24px rgba(0,0,0,.45)}
    #mvCard .meta{display:flex;align-items:center;gap:8px;margin-bottom:4px;font-size:11px}
    #mvCard .badge{padding:1px 7px;border-radius:3px;font-weight:700;background:#2b2320;border:1px solid currentColor}
    #mvCard .wep{color:#cfc4ae}
    #mvCard .title{font-size:19px;font-weight:700;letter-spacing:.5px;color:#fff6e5;margin:2px 0 5px}
    #mvCard .keys{display:inline-block;padding:2px 8px;border-radius:4px;background:rgba(226,184,106,.14);
      border:1px solid rgba(226,184,106,.34);color:#ffe4a8;font-size:12px;margin-bottom:5px}
    #mvCard .tip{font-size:12px;color:#d6cbb8}
    #mvFoot{position:fixed;left:14px;bottom:12px;padding:6px 11px;border-radius:6px;
      background:rgba(13,12,16,.72);border:1px solid rgba(255,255,255,.12);color:#c2b7a4;
      font:11px/1.4 system-ui,'Microsoft YaHei',sans-serif;z-index:49;pointer-events:none}
    #mvPanel{position:fixed;right:10px;top:10px;bottom:10px;width:296px;display:flex;flex-direction:column;
      background:rgba(14,13,17,.88);color:#f0e6d2;border:1px solid rgba(188,142,84,.42);border-radius:8px;
      font:12px/1.35 system-ui,'Microsoft YaHei',sans-serif;z-index:52;-webkit-user-select:none;user-select:none;
      box-shadow:0 10px 30px rgba(0,0,0,.55)}
    #mvPanel .hd{display:flex;align-items:center;justify-content:space-between;padding:9px 11px 7px;
      border-bottom:1px solid rgba(255,255,255,.09)}
    #mvPanel .hd strong{font-size:14px;color:#f5d592;letter-spacing:.6px}
    #mvPanel .hd button{background:#2a2224;color:#d6cab6;border:1px solid #594944;border-radius:4px;
      padding:3px 8px;font:11px inherit;cursor:pointer}
    #mvPanel .ctrl{padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.09);display:flex;flex-direction:column;gap:5px}
    #mvPanel .body{flex:1;overflow-y:auto;padding:6px 10px 12px}
    #mvPanel .body::-webkit-scrollbar{width:6px}
    #mvPanel .body::-webkit-scrollbar-thumb{background:rgba(214,174,104,.35);border-radius:3px}
    #mvPanel h3{margin:10px 0 5px;font-size:11px;color:#e2b86a;font-weight:700;letter-spacing:.5px;
      display:flex;align-items:center;justify-content:space-between}
    #mvPanel h3 span{font-weight:400;color:#998d7a}
    #mvPanel .row{display:flex;flex-wrap:wrap;gap:4px}
    #mvPanel .grid2{display:grid;grid-template-columns:1fr 1fr;gap:4px}
    #mvPanel .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px}
    #mvPanel button.b{background:#231e24;color:#eee3cf;border:1px solid #493f42;border-radius:4px;
      padding:5px 6px;font:12px/1.2 inherit;cursor:pointer;text-align:center;transition:background .1s,border-color .1s}
    #mvPanel button.b:hover{background:#342b32;border-color:#8a6f52}
    #mvPanel button.b.on{background:#7d2d24;border-color:#e2a25a;color:#fff7e6;font-weight:600}
    #mvPanel button.b.wep.on{background:#40311f;border-color:#f0c46c;color:#fff2cc}
    #mvPanel button.b.star{border-color:#7d684a}
    #mvPanel button.b.sm{padding:4px 5px;font-size:11px;flex:1 1 auto}
    #mvToggle{position:fixed;right:12px;top:12px;z-index:53;display:none;background:#7d2d24;color:#fff4dc;
      border:1px solid #e2b86a;border-radius:6px;padding:7px 13px;font:13px system-ui,'Microsoft YaHei',sans-serif;cursor:pointer}
  `;
  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  const card = document.createElement('div');
  card.id = 'mvCard';
  card.innerHTML = `<div class="meta"><span class="badge"></span><span class="wep"></span><span class="spd"></span></div>
    <div class="title"></div><div class="keys"></div><div class="tip"></div>`;
  document.body.appendChild(card);

  const foot = document.createElement('div');
  foot.id = 'mvFoot';
  foot.textContent = '手操：WASD 移动 · J 斩（长按藏锋）· K 冲刺 · L 镖 · 空格 跳 ｜ 画布拖拽可转视角 · 滚轮缩放';
  document.body.appendChild(foot);

  const panel = document.createElement('div');
  panel.id = 'mvPanel';
  document.body.appendChild(panel);

  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'mvToggle';
  toggleBtn.textContent = '展开招式面板';
  toggleBtn.onclick = () => { panel.style.display = ''; toggleBtn.style.display = 'none'; };
  document.body.appendChild(toggleBtn);

  const hd = document.createElement('div');
  hd.className = 'hd';
  hd.innerHTML = '<strong>《不见刀》全招式预览</strong>';
  const hideBtn = document.createElement('button');
  hideBtn.textContent = '收起';
  hideBtn.onclick = () => { panel.style.display = 'none'; toggleBtn.style.display = ''; };
  hd.appendChild(hideBtn);
  panel.appendChild(hd);

  const ctrl = document.createElement('div');
  ctrl.className = 'ctrl';
  panel.appendChild(ctrl);

  const mkBtn = (parent: HTMLElement, text: string, cls: string, fn: () => void) => {
    const b = document.createElement('button');
    b.className = 'b ' + cls;
    b.textContent = text;
    b.onclick = ev => { ev.stopPropagation(); fn(); refreshUI(); };
    b.onpointerdown = ev => ev.stopPropagation();
    parent.appendChild(b);
    return b;
  };

  // Row 1: Speed
  const spdRow = document.createElement('div'); spdRow.className = 'row'; ctrl.appendChild(spdRow);
  const spdBtns = ([
    [1.0, '1× 原速'],
    [0.5, '0.5× 慢放'],
    [0.25, '0.25× 细看'],
  ] as const).map(([s, label]) => [s, mkBtn(spdRow, label, 'sm', () => h.setSpeed(s))] as const);

  // Row 2: Camera
  const camRow = document.createElement('div'); camRow.className = 'row'; ctrl.appendChild(camRow);
  const camBtns = ([
    ['game', '实战视角'],
    ['side', '侧面近景'],
    ['front', '正面'],
    ['orbit', '环绕'],
  ] as const).map(([v, label]) => [v, mkBtn(camRow, label, 'sm', () => setView(v))] as const);
  mkBtn(camRow, '＋', 'sm', () => { if (view === 'game') setView('orbit'); dist = Math.max(3.2, dist - 0.9); });
  mkBtn(camRow, '－', 'sm', () => { if (view === 'game') setView('orbit'); dist = Math.min(14, dist + 0.9); });

  // Row 3: Playback actions
  const actRow = document.createElement('div'); actRow.className = 'row'; ctrl.appendChild(actRow);
  const tourBtn = mkBtn(actRow, '▶ 全招式巡演', 'sm', () => { if (tourOn) { tourOn = false; queue = []; } else startTour(); });
  const loopBtn = mkBtn(actRow, '单招循环', 'sm', () => { loopOn = !loopOn; if (loopOn && queue.length === 0) playMove(active, false); });
  mkBtn(actRow, '重放当前', 'sm', () => playMove(active, false));

  // Scrollable body
  const body = document.createElement('div');
  body.className = 'body';
  panel.appendChild(body);

  const addSec = (title: string, sub: string, gridCls: string) => {
    const h3 = document.createElement('h3');
    h3.innerHTML = `${title}<span>${sub}</span>`;
    body.appendChild(h3);
    const g = document.createElement('div');
    g.className = gridCls;
    body.appendChild(g);
    return g;
  };

  // Section 0: Weapons
  const wepGrid = addSec('文家四柄名刀', '满阶淬炼 · 实时切换', 'grid2');
  const wepBtns = WEAPON_ORDER.map(wid => {
    const w = WEAPONS[wid];
    const b = mkBtn(wepGrid, `${w.name}`, 'wep', () => {
      h.setWeapon(wid, 3);
      if (active.cat === 'base' && active.id === 'base_combo') playMove(active, false);
      else h.resetStage({ weapon: wid, weaponLv: 3, formation: active.formation ?? 'line', boons: active.boon ? { [active.boon]: 2 } : {} });
    });
    b.style.borderLeft = `3px solid ${w.col}`;
    return [wid, b] as const;
  });

  // Sections 1..4: Moves catalog
  const moveBtns = new Map<string, HTMLButtonElement>();
  const cats: Array<{ cat: CatId; title: string; sub: string; cls: string }> = [
    { cat: 'base', title: '一、基础招式', sub: '7 招 · 随当前名刀', cls: 'grid2' },
    { cat: 'weapon', title: '二、四柄名刀专属技', sub: '4 招 · 自动切刀', cls: 'grid2' },
    { cat: 'manual', title: '三、全部刀谱派生', sub: '12 本全收录', cls: 'grid3' },
    { cat: 'boon', title: '四、全部秘传特效', sub: '16 项 · 绝品档', cls: 'grid2' },
  ];
  for (const c of cats) {
    const g = addSec(c.title, c.sub, c.cls);
    for (const e of ENTRIES.filter(x => x.cat === c.cat)) {
      const label = e.short ?? e.name;
      const isStar = label.startsWith('★');
      const b = mkBtn(g, label, isStar ? 'star' : '', () => playMove(e, false));
      if (e.accent) b.style.borderLeft = `3px solid ${e.accent}`;
      moveBtns.set(e.id, b);
    }
  }

  function refreshUI() {
    const wid = h.weapon(), wdef = WEAPONS[wid], spd = h.speed();
    const badge = card.querySelector('.badge') as HTMLElement;
    const wepEl = card.querySelector('.wep') as HTMLElement;
    const spdEl = card.querySelector('.spd') as HTMLElement;
    const titleEl = card.querySelector('.title') as HTMLElement;
    const keysEl = card.querySelector('.keys') as HTMLElement;
    const tipEl = card.querySelector('.tip') as HTMLElement;

    badge.textContent = CAT_LABEL[active.cat];
    badge.style.color = CAT_COL[active.cat];
    card.style.borderLeftColor = active.accent ?? CAT_COL[active.cat];
    wepEl.textContent = `当前名刀：${wdef.name}（${wdef.cuts.length}段）`;
    spdEl.textContent = spd < 0.99 ? `· ${spd}× 慢放` : tourOn ? '· 自动巡演中' : loopOn ? '· 单招循环中' : '';
    titleEl.textContent = active.name;
    keysEl.textContent = `按法：${active.keys}`;
    tipEl.textContent = active.tip;

    for (const [s, b] of spdBtns) b.classList.toggle('on', Math.abs(spd - s) < 0.02);
    for (const [v, b] of camBtns) b.classList.toggle('on', view === v);
    for (const [id, b] of wepBtns) b.classList.toggle('on', wid === id);
    tourBtn.classList.toggle('on', tourOn);
    tourBtn.textContent = tourOn ? '■ 停止巡演' : '▶ 全招式巡演';
    loopBtn.classList.toggle('on', loopOn);
    for (const [id, b] of moveBtns) b.classList.toggle('on', active.id === id);
  }

  // Kick off with current weapon's combo right after boot settles (unless user already clicked a move)
  refreshUI();
  window.setTimeout(() => { if (!started) playMove(ENTRIES[0], false); }, 350);
}
