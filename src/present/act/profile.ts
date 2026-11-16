// 局外存档（act-20，用户：「要有局外内容了」「开始画面……带、继续游戏那些的」）：一份档存在本机（localStorage `ub.profile`），
// 只存局外进度——据点里的局外成长、货币、看过的剧情和对话、解锁的东西；一局之内不存（死了 / 打完回据点再存）。
// 「开始游戏」= 新档（有旧档时要确认），「继续游戏」= 读档回据点。
export interface Profile {
  v: 1;
  /** runs started / won, deaths */ runs: number; wins: number; deaths: number;
  /** the meta currency carried home from runs (name set by the story: see docs/STORY.md) and what it was spent on */
  scraps: number; perks: Record<string, number>;
  /** story beats and dialogue lines already seen (ids) */ seen: Record<string, number>;
  /** relationships with the people at the hideout (id → points) */ bonds: Record<string, number>;
  /** the costume worn */ wear?: string;
  /** last saved (ms since epoch) */ at: number;
}
const KEY = 'ub.profile';
export const fresh = (): Profile => ({ v: 1, runs: 0, wins: 0, deaths: 0, scraps: 0, perks: {}, seen: {}, bonds: {}, at: Date.now() });
let cur: Profile | null = null;
/** is there a saved profile on this device? */
export function hasSave(): boolean { try { return !!localStorage.getItem(KEY); } catch { return false; } }
/** the current profile (loaded from the device the first time; a fresh one if there is none or it can't be read) */
export function profile(): Profile {
  if (cur) return cur;
  try { const raw = localStorage.getItem(KEY); if (raw) { const p = JSON.parse(raw) as Profile; if (p && p.v === 1) { cur = { ...fresh(), ...p }; return cur; } } } catch { /* blocked / broken: start fresh */ }
  cur = fresh(); return cur;
}
/** write the current profile to the device */
export function save() { const p = profile(); p.at = Date.now(); try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode: keep it in memory */ } }
/** a new game: a fresh profile, saved at once */
export function newGame() { cur = fresh(); save(); return cur; }
/** mark a story beat / line as seen; true the first time */
export function seeOnce(id: string) { const p = profile(); const first = !p.seen[id]; p.seen[id] = (p.seen[id] ?? 0) + 1; return first; }
