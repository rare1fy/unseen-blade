// 局内断点存档（哈迪斯式房间级自动存档）：
// 每次进入新房间、清场领完奖励开门、商铺/歇脚/遗卷交互后、点击「存盘回主画面」或切后台时自动写入本机；
// 战败结算、五关通关、主动回据点放弃或开新档时自动清除。
import { profileStorage } from '../../platform/crazygames';
import type { ShapeId } from '../asm/roomShape';
import type { Archetype, Perks } from './boons';
import type { GeneralBlessingId } from './generalEvents';
import type { RunMods } from './meta';
import type { RoomPlan, RoomType } from './run';
import type { ShopSpecial } from './stations';
import { regionsFor } from './regions';
import type { RouteId } from './regionDef';
import { language, msg, t } from './i18n';

export const RUN_SAVE_KEY = 'ub.run.v1';

export interface RunSave {
  v: 1;
  at: number;
  /** Dual-route id ('south' 讨债旧道 / 'north' 北出官道); defaults to 'south' for legacy saves */
  route?: RouteId;
  region: number;
  room: number;
  locale: string;
  plan: RoomPlan;
  nextRooms: RoomPlan[];
  /** true when this room is already cleared (doors open, combat reward already granted) */
  cleared: boolean;
  /** calm-room shop special ware id (keeps the same 4th item across resume) */
  shopSpecial?: ShopSpecial | null;
  /** station ids already spent in this calm room (prevents double-claiming scroll/rest/shop items) */
  spentStations?: string[];
  /** drawn room map id & seed so layout stays consistent on resume */
  mapId?: string | null;
  roomSeed?: number | null;
  // Hero & build state
  hp: number;
  maxHp: number;
  qi: number;
  intent: number;
  intentVal: number;
  coins: number;
  perks: Perks;
  // Run counters & flags
  kills: number;
  eliteKills: number;
  bosses: number;
  bossKilled: boolean;
  defy: number;
  usedRevive: boolean;
  wine: boolean;
  ksShield: number;
  ksRevenge: boolean;
  divineSchoolRun: Archetype | null;
  visited: RoomType[];
  maps: string[];
  shapes: ShapeId[];
  usedPoolBosses: string[];
  genBlessings: GeneralBlessingId[];
  baseFoe: { hp: number; dmg: number; aggression: number; calm: number; attackers: number };
  mods: RunMods;
  startManualDone?: boolean;
}

const VALID_TYPES = new Set<RoomType>(['fight', 'elite', 'shop', 'rest', 'boon', 'event', 'boss']);

function isValidPlan(p: unknown): p is RoomPlan {
  if (!p || typeof p !== 'object') return false;
  const o = p as Partial<RoomPlan>;
  return typeof o.type === 'string' && VALID_TYPES.has(o.type as RoomType)
    && typeof o.locale === 'string' && o.locale.length > 0
    && Array.isArray(o.waves);
}

/** Parse and validate a stored RunSave; returns null if missing or corrupted so continueGame always falls back safely. */
export function loadRunSave(): RunSave | null {
  try {
    const raw = profileStorage.getItem(RUN_SAVE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<RunSave>;
    if (!d || d.v !== 1) return null;
    const route: RouteId = d.route === 'north' ? 'north' : 'south';
    if (typeof d.region !== 'number' || !Number.isFinite(d.region) || d.region < 0 || d.region >= regionsFor(route).length) return null;
    if (typeof d.room !== 'number' || !Number.isFinite(d.room) || d.room < 0) return null;
    if (!isValidPlan(d.plan)) return null;
    if (typeof d.maxHp !== 'number' || !Number.isFinite(d.maxHp) || d.maxHp <= 0) return null;
    if (typeof d.hp !== 'number' || !Number.isFinite(d.hp) || d.hp <= 0) return null;
    if (!d.perks || typeof d.perks !== 'object' || typeof d.perks.moves !== 'object' || typeof d.perks.owned !== 'object') return null;
    if (!d.baseFoe || typeof d.baseFoe !== 'object' || !d.mods || typeof d.mods !== 'object') return null;
    return {
      v: 1,
      at: typeof d.at === 'number' ? d.at : Date.now(),
      route,
      region: Math.floor(d.region),
      room: Math.floor(d.room),
      locale: typeof d.locale === 'string' && d.locale ? d.locale : d.plan.locale,
      plan: d.plan,
      nextRooms: Array.isArray(d.nextRooms) ? d.nextRooms.filter(isValidPlan) : [],
      cleared: !!d.cleared,
      shopSpecial: d.shopSpecial ?? null,
      spentStations: Array.isArray(d.spentStations) ? d.spentStations.filter((x): x is string => typeof x === 'string') : [],
      mapId: typeof d.mapId === 'string' ? d.mapId : null,
      roomSeed: typeof d.roomSeed === 'number' && Number.isFinite(d.roomSeed) ? d.roomSeed : null,
      hp: Math.max(1, Math.min(d.maxHp, Math.round(d.hp))),
      maxHp: Math.max(1, Math.round(d.maxHp)),
      qi: typeof d.qi === 'number' && Number.isFinite(d.qi) ? Math.max(0, d.qi) : 0,
      intent: typeof d.intent === 'number' && Number.isFinite(d.intent) ? Math.max(0, d.intent) : 0,
      intentVal: typeof d.intentVal === 'number' && Number.isFinite(d.intentVal) ? Math.max(0, d.intentVal) : 0,
      coins: typeof d.coins === 'number' && Number.isFinite(d.coins) ? Math.max(0, Math.round(d.coins)) : 0,
      perks: { moves: { ...d.perks.moves }, owned: { ...d.perks.owned } },
      kills: typeof d.kills === 'number' && Number.isFinite(d.kills) ? Math.max(0, Math.floor(d.kills)) : 0,
      eliteKills: typeof d.eliteKills === 'number' && Number.isFinite(d.eliteKills) ? Math.max(0, Math.floor(d.eliteKills)) : 0,
      bosses: typeof d.bosses === 'number' && Number.isFinite(d.bosses) ? Math.max(0, Math.floor(d.bosses)) : 0,
      bossKilled: !!d.bossKilled,
      defy: typeof d.defy === 'number' && Number.isFinite(d.defy) ? Math.max(0, Math.floor(d.defy)) : 0,
      usedRevive: !!d.usedRevive,
      wine: !!d.wine,
      ksShield: typeof d.ksShield === 'number' && Number.isFinite(d.ksShield) ? Math.max(0, Math.floor(d.ksShield)) : 0,
      ksRevenge: !!d.ksRevenge,
      divineSchoolRun: d.divineSchoolRun ?? null,
      visited: Array.isArray(d.visited) ? d.visited.filter((x): x is RoomType => VALID_TYPES.has(x as RoomType)) : [],
      maps: Array.isArray(d.maps) ? d.maps.filter((x): x is string => typeof x === 'string') : [],
      shapes: Array.isArray(d.shapes) ? d.shapes.filter((x): x is ShapeId => typeof x === 'string') : [],
      usedPoolBosses: Array.isArray(d.usedPoolBosses) ? d.usedPoolBosses.filter((x): x is string => typeof x === 'string') : [],
      genBlessings: Array.isArray(d.genBlessings) ? d.genBlessings.filter((x): x is GeneralBlessingId => typeof x === 'string') : [],
      baseFoe: { ...d.baseFoe },
      mods: { ...d.mods },
      startManualDone: !!d.startManualDone,
    };
  } catch {
    return null;
  }
}

export function hasRunSave(): boolean {
  return !!loadRunSave();
}

export function saveRunState(state: RunSave): void {
  try {
    profileStorage.setItem(RUN_SAVE_KEY, JSON.stringify({ ...state, v: 1, at: Date.now() }));
  } catch { /* storage blocked / full */ }
}

export function clearRunSave(): void {
  try {
    profileStorage.removeItem(RUN_SAVE_KEY);
  } catch { /* storage blocked */ }
}

const CN_CODES = [0x4e00, 0x4e8c, 0x4e09, 0x56db, 0x4e94, 0x516d, 0x4e03, 0x516b, 0x4e5d, 0x5341];

/** Compact progress label for title screen / resume banner (e.g. "黄巾残村 · 第四间"). */
export function runSaveLabel(s: RunSave): string {
  const list = regionsFor(s.route === 'north' ? 'north' : 'south');
  const rName = t(list[s.region]?.name ?? '江湖');
  const code = CN_CODES[s.room];
  const num = language === 'en' || code === undefined ? String(s.room + 1) : String.fromCharCode(code);
  const roomTxt = s.plan.type === 'boss' ? t('首领间') : msg`第${num}间`;
  return `${rName} · ${roomTxt}`;
}
