// 拼装场景的数据结构（主题无关）。一张随机战斗场景 = 地点（Locale）× 构图模板（Layout，可镜像）× 地标 × 季节 × 时段 × 天气 × 种子。
// 地点提供地面画法、地标、道具组；构图模板提供地标位和插槽（都按战斗机位定好，保证不挡镜头、两翼看得见）。
// 每个道具组在插槽里「事务式」摆放：先建在临时层里，量出实际占地并做检查（assemble.ts / check.ts），通过才并入场景。
import type { Ctx } from '../scenes/stage';

export type SeasonId = 'spring' | 'summer' | 'autumn' | 'winter';
export type TimeId = 'dusk' | 'night' | 'dawn' | 'day';
export type WeatherId = 'clear' | 'rain' | 'snow' | 'petals' | 'mist';
export const SEASON_CN: Record<SeasonId, string> = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };
export const TIME_CN: Record<TimeId, string> = { dusk: '黄昏', night: '月夜', dawn: '晨雾', day: '午后' };
export const WEATHER_CN: Record<WeatherId, string> = { clear: '晴', rain: '雨', snow: '雪', petals: '樱吹雪', mist: '雾' };

export interface Rect { x0: number; z0: number; x1: number; z1: number }

/** where a group may stand. wing = beside the battle floor (near / mid / far rows), back = behind it next to the landmark,
 *  corner = far back corners (tall silhouettes welcome), facade = long building rows along a street */
export type SlotKind = 'wing' | 'back' | 'corner' | 'facade';
/** S ≈ up to 2.5 m across, M ≈ up to 3.5 m, L = bigger */
export type SizeClass = 'S' | 'M' | 'L';
export interface Slot {
  id: string; kind: SlotKind; size: SizeClass;
  /** centre (m) and room (m): a group's declared foot must fit inside w × d */
  x: number; z: number; w: number; d: number;
  /** +1 right of the battle floor, −1 left, 0 centred: groups mirror their arrangement so their open side faces the floor */
  s: -1 | 0 | 1;
  /** tallest a group may be here (m): the near wing rows stay low so they never stand between the camera and the fight */
  maxH?: number;
}
export interface Layout {
  id: string; name: string;
  /** the landmark's anchor and the room it has (m); null = no central landmark (a street closes on a facade instead) */
  landmark: { x: number; z: number; w: number; d: number } | null;
  slots: Slot[];
  /** walkways (m) the locale paves; also kept free of props */
  path: Rect[];
  /** an open court the locale should keep as plain paving (optional) */
  court?: Rect;
  /** 11-18 定死的屋子 (asm/roomMaps.ts): this room's ways out, at the map's E marks (side, the centre of the gap on the floor's edge) */
  drawn?: Partial<Record<'left' | 'right' | 'back', { side: 'left' | 'right' | 'back'; x: number; z: number }>>;
}

/** everything a builder needs to know about the spot it builds in */
export interface Place {
  x: number; z: number; s: -1 | 0 | 1;
  seed: number; season: SeasonId; time: TimeId; weather: WeatherId;
  /** light multiplier for the time of day (lamps are weak by day, strong at night) */
  lamp: number;
  /** a stable random number in [0, 1) for this placement: rnd(0), rnd(1), … */
  rnd(k: number): number;
}

export interface Group {
  id: string; name: string;
  /** what it is, for the scene rules: e.g. 'light' (adds point lights), 'water', 'tree', 'tall', 'gate', 'building', 'sakura' … */
  tags: string[];
  /** the ground footprint (m) around the anchor, before mirroring: w along x, d along z. Everything standing below ~2 m must fit
   *  in it (crowns and eaves above may reach out). The assembler measures the real footprint and rejects a group that lies. */
  foot: { w: number; d: number };
  kinds: SlotKind[]; size: SizeClass;
  /** tallest point (m), roughly: the picker skips slots with a lower maxH (the check still measures the real height) */
  h: number;
  weight?: number;
  /** most copies per scene (default 1) */
  max?: number;
  /** not in the same scene as a group carrying any of these tags */
  excludes?: string[];
  /** only in these seasons (e.g. sakura in spring) */
  seasons?: SeasonId[];
  build(c: Ctx, p: Place): void;
}
export interface Landmark {
  id: string; name: string; foot: { w: number; d: number }; tags?: string[];
  build(c: Ctx, p: Place): void;
}
export interface Locale {
  id: string; name: string; theme: string;
  /** generic layout ids (layouts.ts) this place uses, plus any of its own */
  layouts: string[]; extraLayouts?: Layout[];
  landmarks: Landmark[];
  groups: Group[];
  /** small pieces used to fill leftover room on the wings after the slots */
  filler?: Group[];
  /** groups of other places (by tag) this place may also use, e.g. ['jp-common'] */
  borrow?: string[];
  seasons?: SeasonId[]; times?: TimeId[]; weathers?: WeatherId[];
  /** act-37: a place with its own light (寒山坞's night) instead of the time / season / weather mood — applied when it is shown */
  mood?: import('../scenes/stage').Mood;
  /** 11-18: no winter snow pass over this place (下邳's flooded streets: the water and the wet stones stay dark; the place paints its own frost) */
  noSnow?: boolean;
  /** 11-18: no fallen leaves on the floor or in the air (洛阳 burned: ash and embers instead, from its own dress) */
  noLeaves?: boolean;
  /** 11-18: the shallow water on the battle floor of this room (m, world; from the spec's seed) — 下邳's pools, where the 水鬼 swim */
  pools?(seed: number): Rect[];
  /** pave the ground (cells at y = −1) over the whole stage, knowing the layout's path and court */
  floor(c: Ctx, f: { layout: Layout; p: Place; arena?: import('./arena').ArenaPlan }): void;
  /** the far ring beyond the stage (hills, woods, roofs): no checks except the battle floor and the camera */
  far?(c: Ctx, f: { layout: Layout; p: Place; arena?: import('./arena').ArenaPlan }): void;
  /** cards, decals and ambient particles at the end (buildFlora is called by the assembler before this) */
  dress?(c: Ctx, f: { layout: Layout; p: Place; clear: Rect[] }): void;
  /** 11-18 屋子形态 (asm/roomShape.ts): the shapes this place's fight rooms take (one picked per room, never the last two again); absent =
   *  always the plain square floor */
  shapes?: import('./roomShape').ShapeId[];
  /** what the 过桥 / 临水 shapes dig here: a river / pond ('water') or a gully ('ditch'); one picked per room (default water) */
  pits?: import('./roomShape').PitKind[];
  /** what stands on a walled-off part of the floor's box (a burnt compound, standing wheat …): rect in metres, its walls are already
   *  built round it (on the floor's side). Keep it low toward the back of the room (a tall thing there hides the floor behind it from the
   *  battle camera); `back` = the rect's edge that faces the back of the room borders the floor */
  infill?(c: Ctx, f: { rect: Rect; p: Place; shape: import('./roomShape').ShapePlan; layout: Layout; back: boolean; front: boolean }): void;
}
export interface Spec { locale: string; layout: string; mirror: boolean; landmark: string | null; season: SeasonId; time: TimeId; weather: WeatherId; seed: number;
  /** 浪人篇: the roads out of the scene (asm/exits.ts); absent = none cut in */
  exits?: Array<'left' | 'right' | 'back'>;
  /** act-19 (2x stage): the walls, gates, cover and props of the battle floor (asm/arena.ts); absent = an open floor */
  arena?: import('./arena').ArenaPlan }

export interface Issue { kind: 'play' | 'walk' | 'front' | 'collide' | 'float' | 'foot' | 'los' | 'bounds' | 'error'; detail: string }
export interface Report {
  spec: Spec; name: string;
  placed: Array<{ id: string; slot: string; x: number; z: number }>;
  rejected: Array<{ id: string; slot: string; issues: Issue[] }>;
  empty: string[];
  warnings: string[];
  lights: number;
}
