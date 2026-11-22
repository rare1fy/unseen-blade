// act-139 独游典藏式激励体系与古窑「长明灯」累计添油系统：
//   - 所有激励视频点（B1 借刃 / B2 催熟与翻倍收菜 / B3 再温老酒 / B4 酒前问卦 / C2 残息再战 / C3 杜五拾遗 / 直接观影解锁）
//     观看完成后统一计入长明灯灯油总数，达 3 / 6 / 10 / 15 / 20 盏自动永久解锁全部 A 类典藏 DLC 内容；
//   - 同时允许单项提前直接观影解锁（2~3 次）或 1 次试穿一局，两条路并行互不冲突。
import type { Profile, AdProfileState } from './profile';
import type { SkinId } from './skin';
import type { HideoutTime, HideoutWeather } from './hideout';

export type BladeFxSkinId = 'default' | 'ink' | 'ember' | 'frostmoon';
export type HideoutMoodId = 'default' | 'snow_night' | 'autumn_rain' | 'sunset';
export type HideoutDecorId = 'windchime' | 'stone_lamp' | 'eaves_cat' | 'stream_boat';
export type CollectorCategory = 'outfit' | 'bladefx' | 'skin' | 'filter' | 'mood' | 'decor' | 'archive';

export interface CollectorItem {
  id: string;
  cat: CollectorCategory;
  name: string;
  desc: string;
  /** Number of direct rewarded ads to unlock early (0 = free by default) */
  adCost: number;
  /** Lantern total oil milestone that also auto-unlocks this item permanently */
  lanternAt: number;
  /** Payload key (outfit model id / bladeFx id / SkinId / mood id / decor id) */
  value: string;
  col: string;
  /** Whether single-run trial via 1 ad is supported (A1 outfits & blade FX) */
  trial?: boolean;
}

export const COLLECTORS: CollectorItem[] = [
  // A1: 行头幻化
  { id: 'outfit_hat', cat: 'outfit', name: '竹笠青衫', desc: '寒山旧斗笠配青灰短褐，初始行头', adCost: 0, lanternAt: 0, value: 'fine_hat', col: '#d8c89c' },
  { id: 'outfit_white', cat: 'outfit', name: '素发赤巾', desc: '白发高马尾与赤红蒙眼布，利落干练', adCost: 2, lanternAt: 3, value: 'fine_white', col: '#f0e8dc', trial: true },
  { id: 'outfit_snow', cat: 'outfit', name: '雪夜白蓑', desc: '霜白斗笠与素雪短袍，寒夜独行', adCost: 2, lanternAt: 3, value: 'fine_snow', col: '#e4f2ff', trial: true },
  { id: 'outfit_obsidian', cat: 'outfit', name: '玄铁短氅', desc: '乌铁暗金斗笠与玄黑武袍，沉峻肃杀', adCost: 3, lanternAt: 15, value: 'fine_obsidian', col: '#c8a468', trial: true },
  { id: 'outfit_crimson', cat: 'outfit', name: '朱缨赤客', desc: '朱砂战袍配金环高马尾，如血映霜', adCost: 3, lanternAt: 15, value: 'fine_crimson', col: '#ff7a68', trial: true },

  // A1: 刀光皮肤
  { id: 'fx_default', cat: 'bladefx', name: '寒铁原锋', desc: '各柄名刀本色刀光，清冽分明', adCost: 0, lanternAt: 0, value: 'default', col: '#b8d8f8' },
  { id: 'fx_ink', cat: 'bladefx', name: '水墨残锋', desc: '焦墨泼锋、重斩溅朱，剑戟水墨意境', adCost: 2, lanternAt: 6, value: 'ink', col: '#e8e2d4', trial: true },
  { id: 'fx_ember', cat: 'bladefx', name: '赤金业火', desc: '熔金炽焰刀痕，余烬随锋四散', adCost: 3, lanternAt: 15, value: 'ember', col: '#ffb858', trial: true },
  { id: 'fx_frostmoon', cat: 'bladefx', name: '霜月青莲', desc: '月白寒青冷光，如秋霜掠影', adCost: 3, lanternAt: 15, value: 'frostmoon', col: '#7eeeff', trial: true },

  // A2: 界面材质皮肤包（精细化重制）
  { id: 'skin_iron', cat: 'skin', name: '兵戈铁器', desc: '黑铁八角盾、甲片铜钉与铁槽血条', adCost: 0, lanternAt: 0, value: 'iron', col: '#b8c4d4' },
  { id: 'skin_lacquer', cat: 'skin', name: '汉代漆器', desc: '黑漆描金八角盘、朱漆心与金丝垂穗', adCost: 2, lanternAt: 3, value: 'lacquer', col: '#f2c864' },
  { id: 'skin_bamboo', cat: 'skin', name: '竹简木牌', desc: '雕竹方牌、麻绳双束与朱砂印章', adCost: 2, lanternAt: 6, value: 'bamboo', col: '#dcc07c' },

  // A3: 剑戟片水墨滤镜
  { id: 'filter_ink', cat: 'filter', name: '剑戟水墨滤镜', desc: '黑白宣纸水墨，唯留血红与破势金光', adCost: 3, lanternAt: 10, value: 'inkFilter', col: '#f2ece0' },

  // A4: 古窑时辰天气
  { id: 'mood_default', cat: 'mood', name: '暮色古窑', desc: '残阳沉山、暮雾清朗的常规古窑氛围', adCost: 0, lanternAt: 0, value: 'default', col: '#e6b87c' },
  { id: 'mood_snow_night', cat: 'mood', name: '夜雪点灯', desc: '寒夜飞雪、炉火暖灯映古窑', adCost: 2, lanternAt: 10, value: 'snow_night', col: '#b8dcff' },
  { id: 'mood_autumn_rain', cat: 'mood', name: '秋雨竹溪', desc: '细雨打竹、晓色湿润的幽静古窑', adCost: 2, lanternAt: 20, value: 'autumn_rain', col: '#88d8c8' },
  { id: 'mood_sunset', cat: 'mood', name: '残阳薄雾', desc: '暮岚低垂、残霞漫过断碑古窑', adCost: 2, lanternAt: 20, value: 'sunset', col: '#ffb278' },

  // A4: 古窑 3D 体素小装潢
  { id: 'decor_cat', cat: 'decor', name: '檐下卧猫', desc: '一只蜷在药炉石凳旁打盹的狸花猫', adCost: 2, lanternAt: 10, value: 'eaves_cat', col: '#ffd28e' },
  { id: 'decor_lamp', cat: 'decor', name: '古窑石灯', desc: '中庭石阶两侧添置两盏汉制暖石灯', adCost: 2, lanternAt: 20, value: 'stone_lamp', col: '#ffe088' },
  { id: 'decor_chime', cat: 'decor', name: '青铜风铃', desc: '东翼水榭悬一架随风轻晃的铜铃', adCost: 2, lanternAt: 20, value: 'windchime', col: '#9ee8c8' },
  { id: 'decor_boat', cat: 'decor', name: '竹溪灯船', desc: '三盏纸灯小舟沿东翼竹溪缓缓漂流', adCost: 2, lanternAt: 20, value: 'stream_boat', col: '#ffba7a' },

  // A5: 听风阁名录 & 自由试剑坪
  { id: 'archive_sandbox', cat: 'archive', name: '听风阁与自由试剑', desc: '开启人物立绘语音名录、五首领破阵志及试剑坪自由约战', adCost: 4, lanternAt: 20, value: 'archive_sandbox', col: '#a8e8ff' },
];

export interface LanternMilestone {
  at: number;
  title: string;
  summary: string;
}

export const LANTERN_MILESTONES: LanternMilestone[] = [
  { at: 3, title: '三盏灯油', summary: '解锁「汉代漆器」界面、行头「素发赤巾」「雪夜白蓑」' },
  { at: 6, title: '六盏灯油', summary: '解锁「竹简木牌」界面、刀光「水墨残锋」' },
  { at: 10, title: '十盏灯油', summary: '解锁「剑戟水墨滤镜」、古窑「夜雪点灯」与「檐下卧猫」' },
  { at: 15, title: '十五盏灯油', summary: '解锁全部典藏行头与全部体素刀光皮肤' },
  { at: 20, title: '二十盏灯油', summary: '解锁「听风阁名录与自由试剑」及全套古窑时辰装潢' },
];

export const HIDEOUT_MOOD_SPEC: Record<HideoutMoodId, { name: string; time: HideoutTime; weather: HideoutWeather }> = {
  default: { name: '暮色古窑', time: 'dusk', weather: 'clear' },
  snow_night: { name: '夜雪点灯', time: 'night', weather: 'snow' },
  autumn_rain: { name: '秋雨竹溪', time: 'dawn', weather: 'rain' },
  sunset: { name: '残阳薄雾', time: 'dusk', weather: 'mist' },
};

export const GARDEN_SPEED_DAILY_MAX = 3;

function localDayKey(now = Date.now()): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function ensureAds(p: Profile): AdProfileState {
  if (!p.ads) p.ads = { total: 0, unlocks: {}, progress: {} };
  if (!p.ads.unlocks) p.ads.unlocks = {};
  if (!p.ads.progress) p.ads.progress = {};
  if (typeof p.ads.total !== 'number') p.ads.total = 0;
  return p.ads;
}

export function collectorById(id: string): CollectorItem | undefined {
  return COLLECTORS.find(c => c.id === id);
}

/** Whether a collector item is permanently unlocked (or free by default, or unlocked via debug flag). */
export function isCollectorUnlocked(p: Profile, id: string, allFree = false): boolean {
  const item = collectorById(id);
  if (!item) return false;
  if (allFree || item.adCost <= 0) return true;
  const a = ensureAds(p);
  if (a.unlocks[id]) return true;
  if (item.lanternAt > 0 && a.total >= item.lanternAt) return true;
  return false;
}

/** Direct watch progress toward unlocking a single collector item early. */
export function collectorProgress(p: Profile, id: string): number {
  return ensureAds(p).progress[id] ?? 0;
}

/**
 * Record 1 completed rewarded video ad.
 * Increments the Lantern total oil counter, optionally advances a specific collector item's direct unlock progress,
 * and returns every collector item newly unlocked by this watch!
 */
export function recordAdWatched(p: Profile, directItemId?: string): { total: number; newlyUnlocked: CollectorItem[] } {
  const a = ensureAds(p);
  const before = new Set(COLLECTORS.filter(c => isCollectorUnlocked(p, c.id)).map(c => c.id));
  a.total += 1;
  if (directItemId) {
    const item = collectorById(directItemId);
    if (item && item.adCost > 0 && !before.has(item.id)) {
      const next = (a.progress[item.id] ?? 0) + 1;
      a.progress[item.id] = next;
      if (next >= item.adCost) a.unlocks[item.id] = true;
    }
  }
  // Auto-persist any items unlocked by lantern milestone
  for (const c of COLLECTORS) {
    if (c.lanternAt > 0 && a.total >= c.lanternAt) a.unlocks[c.id] = true;
  }
  const newlyUnlocked = COLLECTORS.filter(c => !before.has(c.id) && isCollectorUnlocked(p, c.id));
  return { total: a.total, newlyUnlocked };
}

export function nextLanternMilestone(p: Profile): LanternMilestone | null {
  const total = ensureAds(p).total;
  return LANTERN_MILESTONES.find(m => total < m.at) ?? null;
}

/** Check remaining daily uses for B2 (竹溪药圃 引溪催熟 / 领奇种). */
export function gardenSpeedLeft(p: Profile, now = Date.now()): number {
  const a = ensureAds(p);
  const today = localDayKey(now);
  if (a.gardenSpeedDay !== today) return GARDEN_SPEED_DAILY_MAX;
  return Math.max(0, GARDEN_SPEED_DAILY_MAX - (a.gardenSpeedCount ?? 0));
}

export function consumeGardenSpeed(p: Profile, now = Date.now()): boolean {
  const a = ensureAds(p);
  const today = localDayKey(now);
  if (a.gardenSpeedDay !== today) {
    a.gardenSpeedDay = today;
    a.gardenSpeedCount = 0;
  }
  if ((a.gardenSpeedCount ?? 0) >= GARDEN_SPEED_DAILY_MAX) return false;
  a.gardenSpeedCount = (a.gardenSpeedCount ?? 0) + 1;
  return true;
}

/** Active UI skin respecting unlock state (falls back to 'iron' if locked). */
export function activeUiSkin(p: Profile, allFree = false): SkinId {
  const want = p.uiSkin ?? 'iron';
  if (want === 'lacquer' && isCollectorUnlocked(p, 'skin_lacquer', allFree)) return 'lacquer';
  if (want === 'bamboo' && isCollectorUnlocked(p, 'skin_bamboo', allFree)) return 'bamboo';
  return 'iron';
}

/** Active blade FX skin (trial takes precedence for the current run). */
export function activeBladeFx(p: Profile, allFree = false): BladeFxSkinId {
  const a = ensureAds(p);
  if (a.trialBladeFx) return a.trialBladeFx as BladeFxSkinId;
  const want = (p.bladeFx ?? 'default') as BladeFxSkinId;
  if (want === 'default') return 'default';
  const item = COLLECTORS.find(c => c.cat === 'bladefx' && c.value === want);
  if (item && isCollectorUnlocked(p, item.id, allFree)) return want;
  return 'default';
}

/** Active outfit model ID (trial takes precedence for the current run). */
export function activeOutfitId(p: Profile, allFree = false): string {
  const a = ensureAds(p);
  if (a.trialOutfit) return a.trialOutfit;
  const want = p.wear ?? 'fine_hat';
  const item = COLLECTORS.find(c => c.cat === 'outfit' && c.value === want);
  if (item && isCollectorUnlocked(p, item.id, allFree)) return want;
  return 'fine_hat';
}

/** Active hideout mood spec. */
export function activeHideoutMood(p: Profile, allFree = false): { id: HideoutMoodId; name: string; time: HideoutTime; weather: HideoutWeather } {
  const want = (p.hideoutMood ?? 'default') as HideoutMoodId;
  const item = COLLECTORS.find(c => c.cat === 'mood' && c.value === want);
  const id: HideoutMoodId = item && isCollectorUnlocked(p, item.id, allFree) ? want : 'default';
  return { id, ...HIDEOUT_MOOD_SPEC[id] };
}

/** Active hideout 3D decorations map. */
export function activeHideoutDecors(p: Profile, allFree = false): Record<HideoutDecorId, boolean> {
  const enabled = p.hideoutDecors ?? {};
  const has = (id: string, key: HideoutDecorId) => !!enabled[key] && isCollectorUnlocked(p, id, allFree);
  return {
    windchime: has('decor_chime', 'windchime'),
    stone_lamp: has('decor_lamp', 'stone_lamp'),
    eaves_cat: has('decor_cat', 'eaves_cat'),
    stream_boat: has('decor_boat', 'stream_boat'),
  };
}

/** Clear single-run ad perks/trials once a run finishes (win, death, or give up). */
export function clearRunAdBuffs(p: Profile) {
  const a = ensureAds(p);
  a.trialOutfit = null;
  a.trialBladeFx = null;
  a.rentWeapon = null;
  a.mealUpgraded = false;
  a.divineSchool = null;
}

// ------------------------------------------------------------------ A5 听风阁名录数据
export interface ArchivePerson {
  id: string;
  name: string;
  title: string;
  voiceText: string;
  lore: string;
  col: string;
}

export const ARCHIVE_PEOPLE: ArchivePerson[] = [
  { id: 'jiangjin', name: '刘白', title: '寒山盲刀客', voiceText: '还文家的命。', lore: '寒山铁匠文冶遗孤，双目失明却凭听声辨位使一口文家环首刀，誓追五名仇人。', col: '#f0e6d2' },
  { id: 'duwu', name: '杜五', title: '赶车义汉', voiceText: '趁热吃饱了再上路。', lore: '雪夜从崔府乱葬沟拖回刘白的老车夫，守在古窑伙房备干粮、拾遗物。', col: '#ffd288' },
  { id: 'sunao', name: '孙婆婆', title: '古窑药婆', voiceText: '活着回来，药炉一直温着。', lore: '以银针与草药救活刘白的孤寡老医，照看东翼竹溪药圃与药棚。', col: '#90f0b4' },
  { id: 'luzhao', name: '卢昭', title: '竹溪书生', voiceText: '江湖风声紧，出门留个心眼。', lore: '避乱隐于竹溪水榭的落魄书生，耳目灵通，常替刘白打探仇敌踪迹。', col: '#98dcff' },
  { id: 'huanyue', name: '韩越', title: '石阶酒客', voiceText: '好刀须配好酒，来试一试锋。', lore: '独坐西北石阶嗜酒论刀的游侠，精通兵器架势与酒前问卦。', col: '#f4b472' },
  { id: 'chulei', name: '石雷', title: '黄巾渠帅', voiceText: '太平天雷，尔敢挡我？', lore: '第一关首领。半血插雷旗护阵减伤，两度锁血降天雷弹幕，必先拆旗破阵。', col: '#ffbe58' },
  { id: 'yanhu', name: '阎虎', title: '西凉都尉', voiceText: '老子的重甲，劈得动吗！', lore: '第二关首领。正面重甲减伤且不掉架势，需绕背、诱撞墙碎甲或破势卡斧。', col: '#ff8a50' },
  { id: 'fengzhen', name: '封寒', title: '下邳寒医', voiceText: '尝尝老夫新配的寒毒。', lore: '第三关首领。场边立寒毒药鼎持续回血铺霜，需飞镖拆鼎并反击银针破遁。', col: '#78d8ff' },
  { id: 'zhouan', name: '周默', title: '乌林水督', voiceText: '铁楯护阵，岂容你近身！', lore: '第四关首领。执楯刀士在场时享护主减伤，需借床弩或绕背先拆护卫。', col: '#a8b8e0' },
  { id: 'cuixuan', name: '崔玄', title: '崔府家主', voiceText: '拔刀吧，看看你的手。', lore: '终局首领。一阶棋局气眼、二阶击筑客扰耳、三阶灭灯盲听死斗，须破隐见切。', col: '#d8b4ff' },
];

export interface SandboxBossDef {
  kind: 'hj_boss' | 'ly_boss' | 'xp_boss' | 'wl_boss' | 'cx_boss';
  name: string;
  regionName: string;
  tip: string;
  col: string;
}

export const SANDBOX_BOSSES: SandboxBossDef[] = [
  { kind: 'hj_boss', name: '石雷 · 黄巾渠帅', regionName: '第一关 · 黄巾残村', tip: '雷旗护阵 · 跳雷环与追身落雷', col: '#ffbe58' },
  { kind: 'ly_boss', name: '阎虎 · 西凉都尉', regionName: '第二关 · 洛阳废都', tip: '正面重甲 · 诱冲撞墙与铁水狂飙', col: '#ff8a50' },
  { kind: 'xp_boss', name: '封寒 · 下邳寒医', regionName: '第三关 · 下邳寒雾', tip: '寒毒药鼎 · 拆鼎破遁与寒潮绝域', col: '#78d8ff' },
  { kind: 'wl_boss', name: '周默 · 乌林水督', regionName: '第四关 · 乌林水寨', tip: '铁楯护主 · 借床弩破盾与连环索', col: '#a8b8e0' },
  { kind: 'cx_boss', name: '崔玄 · 崔府家主', regionName: '第五关 · 雪夜崔府', tip: '棋局气眼 · 灭灯听声破隐死斗', col: '#d8b4ff' },
];
