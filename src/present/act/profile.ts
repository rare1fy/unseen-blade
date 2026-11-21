// 局外存档（act-20，用户：「要有局外内容了」「开始画面……带、继续游戏那些的」）：一份档存在本机（localStorage `ub.profile`），
// 只存局外进度——据点里的局外成长、货币、看过的剧情和对话、解锁的东西；一局之内不存（死了 / 打完回据点再存）。
// 「开始游戏」= 新档（有旧档时要确认），「继续游戏」= 读档回据点。
import { profileStorage } from '../../platform/crazygames';
import type { GardenState } from './garden';

export interface Profile {
  v: 1;
  /** runs completed / won, deaths */ runs: number; wins: number; deaths: number;
  /** the two currencies carried home from runs and purchased upgrade levels */
  iron: number; herb: number; perks: Record<string, number>;
  /** act-118: 碑铭潜能 (Hades Mirror of Night-style dual-aspect permanent talents, free to flip between 阳/阴) */
  mirror?: Record<string, { lv: number; side: 0 | 1 }>;
  /** act-149: 孙媪药炉冥想 · 悟性牌阵 (Hades 2 Altar of Ashes-style 3×3 meditation card grid with Grasp cap) */
  arcana?: { cap: number; rank: Record<string, number>; active: Record<string, boolean> };
  /** story beats and dialogue lines already seen (ids) */ seen: Record<string, number>;
  /** relationships with the people at the hideout (id → points) */ bonds: Record<string, number>;
  /** the costume worn */ wear?: string;
  /** 杜五's provisions packed for the next run (feast / purse / wine), used up when the run starts */ meal?: string;
  /** act-125: 文家名刀 equipped weapon id & forging levels (0..3) */
  weapon?: string;
  weaponLv?: Record<string, number>;
  /** act-125: 信物匣 equipped keepsake id & unlocked map (id → combat rooms cleared for ★→★★★) */
  keepsake?: string | null;
  keepsakes?: Record<string, number>;
  /** act-125: Three Kingdoms general encounter events solved (id → clear count) */
  genCleared?: Record<string, number>;
  /** act-132: 营地竹溪药圃种田状态（6 块药畦、种子库存、单局丹药增益与每日赠种记录） */
  garden?: GardenState;
  /** act-127 prologue checkpoint so quitting mid-prologue resumes at the right beat instead of restarting from the village */
  proStage?: 'village' | 'boss' | 'wake' | 'done';
  /** last saved (ms since epoch) */ at: number;
}
const KEY = 'ub.profile';
export const fresh = (): Profile => ({ v: 1, runs: 0, wins: 0, deaths: 0, iron: 0, herb: 0, perks: {}, mirror: {}, seen: {}, bonds: {}, weapon: 'hanshan', weaponLv: {}, keepsake: null, keepsakes: {}, genCleared: {}, proStage: 'village', at: Date.now() });
let cur: Profile | null = null;
/** is there a saved profile on this device? */
export function hasSave(): boolean { try { return !!profileStorage.getItem(KEY); } catch { return false; } }
/** the current profile (loaded from the device the first time; a fresh one if there is none or it can't be read) */
export function profile(): Profile {
  if (cur) return cur;
  try { const raw = profileStorage.getItem(KEY); if (raw) { const p = JSON.parse(raw) as Partial<Profile> & { scraps?: number }; if (p && p.v === 1) { const { scraps, ...saved } = p; const legacyDone = !saved.proStage && ((saved.runs ?? 0) > 0 || (saved.iron ?? scraps ?? 0) > 0 || (saved.herb ?? 0) > 0 || Object.keys(saved.seen ?? {}).length > 0); cur = { ...fresh(), ...saved, iron: p.iron ?? scraps ?? 0, herb: p.herb ?? 0, proStage: saved.proStage ?? (legacyDone ? 'done' : 'done') }; return cur; } } } catch { /* blocked / broken: start fresh */ }
  cur = fresh(); return cur;
}
/** write the current profile to the device */
export function save() { const p = profile(); p.at = Date.now(); try { profileStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode: keep it in memory */ } }
/** a new game: a fresh profile, saved at once */
export function newGame() { cur = fresh(); save(); return cur; }
/** mark a story beat / line as seen; true the first time */
export function seeOnce(id: string) { const p = profile(); const first = !p.seen[id]; p.seen[id] = (p.seen[id] ?? 0) + 1; return first; }
