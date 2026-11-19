import { OPT } from '../engine/perfOpts';
import { ContactBatch } from '../engine/contactBatch';
import { finishBuild, loadInFrames } from '../engine/buildSteps';
import { bladeBusy, bladeTimes, runRoomBuild, withLoadingBlade } from '../scenes/loadingBlade';
import { format, language, msg, setLanguage } from './i18n';
// 动作原型（docs: CLAUDE.md「动作原型」、docs/act/DESIGN.md）：哈迪斯式的一间间屋子。每间屋 = 一张拼装的日本场景（asm），战斗区就是屋子；
// 敌人分两波从边上出来；清场 → 三选一秘传 → 屋子边上的路口立起高札（写着下一间的地名和清完给什么）→ 自己走进路口 → 一丛竹子
// （或一根木柱）从镜头前扫过，换到下一间。三间屋，第三间是山贼头目。
// 打开游戏先到练武场（yard.ts：木人桩、召唤石板、换装木台），走进后面的「出发」路口开始一局；死了或打完回练武场。
// 砍飞的箭：方向在出刀朝向左右 75° 里随机、附近有敌人就偏过去；砍中那一下顿帧 + 闪光 + 短慢放（用户：「这种属于高光操作，应该要有顿帧」）。
import * as THREE from 'three';
import { V3, onUpdate, R, scene, warm, frames, precompile } from '../engine/world';
import { hitstop, shake, slowmo, after, anim, clock, FX, waitReal, PAUSE } from '../engine/clock';
import { shot } from '../director';
import { fxImpact, fxSparks, fxSmoke, fxRing, fxEmbers, fxFlare, trailSeg } from '../fx/fx';
import { fxAfterimage } from '../fx/skillFx';
import { addBlock, debrisContacts } from '../fx/blocks';
import { popPix } from '../v2/pix';
import { playDeath } from '../v2/death';
import { prepareFight } from './fightWarm';
import { UiLayer } from '../ui3d/layer';
import { Overlay } from '../v2/overlay';
import { SkinBanner, SKIN, SKINS, SKIN_NAME, setSkin, type SkinId } from './skin';
import { showStage, prepareStageSteps, followShadow, flashSky, tickSkyFlash, type Stage, type PreparedStage } from '../scenes/stage';
import { COPPER_Y } from '../asm/luoyang/molten';
import { PLAY, SZ, setStage, STAGE_BIG, stageNow } from '../scenes/props';
import { addLocales, REGISTRY, LOCALES } from '../asm/registry';
import { NINJA_LOCALES } from '../asm/ninja';
import { HANMO_LOCALES } from '../asm/hanmo';
import { HANSHAN_LOCALES } from '../asm/hanshan';
import { LUOYANG_LOCALES } from '../asm/luoyang';
import { XIAPI_LOCALES } from '../asm/xiapi';
import './hanshan_people';   // act-37: 寒山坞 cold open — 文皎 at eleven, the two torch-bearer looks, 杜五's cart (ROSTER)
import { assemble, mirrorLayout, stageLayout } from '../asm/assemble';
import { arenaPlan, bigStage, type ArenaPlan } from '../asm/arena';
import { FloorGrid, FLOOR, PIT, makeShape, pickShape, SHAPE_K, SHAPE_CN, type ShapeId, type PitKind } from '../asm/roomShape';
import { Solids, SLAM, slamSpeed, type Push } from './solids';
import { Breakables } from './breakables';
import { Gates } from './gates';
import { ALL_MOVES, drawManuals, manualCard } from './manuals';
import { Dialogue, type Line } from './dialogue';
import { Stele } from './stele';
import { openLab } from './lab';
import { HAS_DOM } from '../../platform';
import { openAnimPreview } from './animPreview';
import { IronHp, HP_FACE } from './ironUi';
import { ROSTER } from '../bestiary/models';
import { CODE_BUILD } from '../bestiary/voxEdit';
import { rackBlades, hideoutScene, HIDEOUT, HIDEOUT_PEOPLE } from './hideout';
import { Timeline, type V } from './timeline';
import { openingShots, bossIntroShots, type CineHost } from './cutscenes';
import { NPC_TALK, STELE_TALK, MEAL_TALK, UP_TALK, POOR_TALK, WAKE_DUWU, WAKE_SUNAO, CHULEI_BEFORE, CHULEI_AFTER, deathLine, PRO_CHULEI, PRO_FALL, PRO_DAWN, PRO_WAKE, PRO_CAPTIONS, PRO_AMBUSH } from './scripts';
import { fallShots, snowShots, dawnShots, loadShots, brazier, getUpPose, drapeOver, GETUP_STEP, Kneel, KNEEL_ARMS, type PrologueHost } from './prologue';
import { coldOpenShots, coldCardShots, BlindPOV } from './coldopen';
import { Barks } from './barks';
import { installR45 } from './regions/r45_hook';
import { measureFight, meterLabel, toggleMeter } from '../engine/frameMeter';
import { QUALITY, setQuality, type Tier, qualityLabel, cycleQuality } from '../look/quality';   // wp/regB: 第四关 · 锁江、第五关 · 许都雪 (their places, foes, bosses, __dh.region)
/** act-40 (用户：「现在开场太墨迹了，把那段timeline先搞成黑幕快速交代背景吧」): the cold open as black cards for now (false = the 寒山坞 cutscene) */
const COLD_AS_CARDS = true;
import { newGame, profile, save as saveProfile, seeOnce, hasSave } from './profile';
import { runMods, bank, META, level, nextCost, buy, type RunMods } from './meta';
import { NPC_LINES, UP_LINES, POOR_LINES, HAUL, MEALS, MEAL_LINES, STELE_LINES } from './hideoutLines';
import { Leaves } from './leaves';
import type { BTarget, BEvent, BDamage } from './breakLogic';
import type { Solid } from './solids';
/** the floor's edge as a solid (the clamp's push): a slam surface */
const WALL_SOLID: Solid = { id: 0, kind: 'wall', shape: 'box', x: 0, z: 0, hx: 0, hz: 0, r: 0, on: true, slam: true };
/** 11-18 打出界: a reeling foe still moving faster than this (m/s) goes over a pit's edge (a light cut sends a man off at ≈ 3.3 m/s, a
 *  流民 at ≈ 5.5, the closing cut a man at ≈ 10; it slows by e⁻⁶ᵗ, so ≈ 0.4 m on from where the light cut finds it, ≈ 1.4 m for the
 *  closing cut); slower, the edge holds it. In the pit its middle → it falls (pitFalls) */
const PIT_SPEED = 1.2;
import { pickSpec } from '../asm/pick';
import { exitInfo, withExits, type ExitId, type ExitInfo } from '../asm/exits';
import { MAP_BY_ID, mapShape, mapStage, pickMap } from '../asm/roomMaps';
import { RoomPieces } from './puzzles';
import type { Layout, Spec, Report } from '../asm/types';
import { wipeTransit, WIPE } from '../scenes/transWipe';
import type { RouteOpt } from '../../core/v2/ronin/chapter';
import { cue, type Cue } from '../../audio/cues';
import { CAM } from '../engine/gfx';
import { GRADE } from '../look/post';
import { blood } from './blood';
import { audio } from '../../audio/audio';
import type { Platform } from '../../platform/index';
import { dh } from '../../debug/dh';
import { Input } from './input';
import { ActHud } from './hud';
import { CardPick3D as CardPick } from './cards3d';   // act-36: the pick cards as iron boards
import { MoveDemo } from './moveDemo';
import { entryOfManual, entryOfBoon, entryOfBase } from './skillFace';
import type { Section } from './skillList';
import { BASE_SKILLS, UI_WORDS, boonEffect } from './skillInfo';
import type { Mark } from './hud';
import { MANUALS } from './manuals';
import { fillVals } from './cards';
import { Hero, QI_LINK, type HeroWorld } from './hero';
import { Duel, type DuelHost } from './qte';
/** 11-17: the 刀谱 links the first few openings of which are slowed down to teach them (二段跳 is no link; 穿风斩 / 劈山 / 回锋斩 are known from the start) */
// (11-18: 断云, 牵红, 踏顶 too; 掠地 not — like 二段跳 it is on whenever she is in the air, so it would slow every jump)
const TEACH = ['chase', 'back', 'cdart', 'launch', 'kick', 'keep', 'pause', 'acut', 'reel', 'stomp'];
/** 11-18: the new 刀谱's blade blows count as cuts for the boons (出血, 裂甲, 搏命, 枭首) — boons.ts isBladeHit stays as it is */
const bladeHit = (kind: string) => isBladeHit(kind) || kind === 'acut' || kind === 'acutF' || kind === 'acutS' || kind === 'swoop';
import { interruptFoe } from './enemy';
import { ROLE_AI } from './foes/roles';
import { unfade } from './foes/fade';
// 11-18: the later regions' foe models (bestiary ROSTER) — a glob, so a region's model file is picked up the moment it exists
import.meta.glob(['./foes/ly_models.ts', './foes/xp_models.ts'], { eager: true });
import './foes/ly_ai';
import './foes/xp_ai';
// (until a region's models are in: each of its foes stands in as the 黄巾 one of the nearest build — a missing model would throw)
{ const STAND: Record<string, string> = { ly_halberd: 'hj_blade', ly_rider: 'hj_brute', ly_shield: 'hj_brute', ly_xbow: 'hj_archer', ly_torch: 'hj_taoist', ly_looter: 'hj_mob', ly_boss: 'hj_boss',
    xp_assassin: 'hj_blade', xp_needle: 'hj_archer', xp_frost: 'hj_taoist', xp_diver: 'hj_mob', xp_chain: 'hj_brute', xp_conscript: 'hj_mob', xp_boss: 'hj_taoist' };
  for (const d of Object.values(EDEFS)) for (const m of [d.model, d.elite, ...(d.alt ?? [])]) if (m && !ROSTER.some(x => x.id === m)) { const base = ROSTER.find(x => x.id === (STAND[m.replace(/_(e|b)$/, '')] ?? 'hj_blade')); if (base) ROSTER.push({ ...base, id: m }); } }
import { inside } from './tele';
import { spawnFoe, updateFoe, damageFoe, type Foe, type FoeWorld, type EKind, Arrow } from './enemy';
import { EDEFS, isBoss, lowAttack, trimShadows, dropTeles, UNSTICK } from './enemy';   // wp/foes: the boss bar / banner / death and the bot's jump read these
import { BOONS, applyBoon, drawBoons, upgradeBoon, returnCard, TIER_NAMES, newPerks, tierOf, hasBoon, v, v2, isBladeHit, type Perks, type Boon, type BoonPick } from './boons';
import { TUNE } from './tune';
import { installActTune } from './tunePanel';
import { BODY_FONT, BODY_FONT_NAME, setBodyFont, type BodyFont } from '../ui3d/bodyFont';
import { HEROES, RACK, motionOf } from './ninjaAct';
import { Yard, makeSign, SPAWN_AT } from './yard';
import type { ModelDef } from '../bestiary/models';
import { dustBlocks, spawnClone, smokeBurst, cut as cloneCut } from '../kyoto/ninja_fx';
import { Dart, BladeWave } from './missiles';
import { RUN_ROOMS, firstRoom, regionFirstRoom, roomOf, roomInfo, doorsFrom, kindOr, isBossKind, type RoomPlan, type RoomType } from './run';
import { REGIONS } from './regions';
import { isBossRoom, afterBoss, roomsWorth, regionScale, regionBanner } from './flow';
import { Stations, type Station } from './stations';
import { Coins } from './coins';
import { runBoard } from './runBoard';
import { HitArcs } from './hitArc';
import { playOpening, OPENING_SPEC } from './opening';
import { wantOpening } from './openingFlag';
import { stopTitle, playTitle, titlePointer } from './title';
import { wantTitle, savedTitle, TITLE_COUNT } from './titleFlag';
import { PX, setPixel } from '../look/pixel';
import { VIBE, vibeSupport, iosMajor, RUMBLE } from '../../platform/index';
import { PauseMenu } from './pauseMenu';
import { padNav, padRumble, PAD, actKey, actPad } from './pad';
import { openingPadTap } from './opening';
import { BattleActor } from '../bestiary/battle';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { worldToUi } from '../ui3d/layer';
import { HIDEOUT_DONKEY } from './hideout_people';
import { CELL } from '../bestiary/kit';
import { Action } from '../actors/rig';

addLocales(NINJA_LOCALES); addLocales(HANMO_LOCALES); addLocales(HANSHAN_LOCALES); addLocales(LUOYANG_LOCALES); addLocales(XIAPI_LOCALES);   // (11-18: regions two and three)

/** prices at the 行商 (copper coins) */
const PRICES = { boon: 60, heal: 30, sharpen: 50 };
/** a soft dark spot for under the feet: a radial fade drawn once, shared by every spot */
let SHADOW_TEX: THREE.Texture | null = null;
function contactMaterial() {
  if (!SHADOW_TEX && typeof document !== 'undefined') {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(32, 32, 4, 32, 32, 31); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); SHADOW_TEX = new THREE.CanvasTexture(c);
  }
  return new THREE.MeshBasicMaterial({ color: 0x0a0608, map: SHADOW_TEX, transparent: true, opacity: 0.72, depthWrite: false });
}
function contactShadow() {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), contactMaterial());
  m.renderOrder = 2; return m;
}
type Phase = 'intro' | 'fight' | 'pick' | 'doors' | 'leaving' | 'dead' | 'end' | 'yard' | 'opening' | 'cine' | 'talk' | 'title';
/** the costume the player last wore (kept in the browser; the first time: the 斗笠 swordsman) */
/** the heroine's look by default (user 11-17: 「默认角色用这个白发女」, her MagicaVoxel-edited model) */
const DEFAULT_HERO = 'fine_white';   // act-22 (user: 「都换成细格子吧」): the 3.5 cm white-haired heroine
function savedHero(): ModelDef {
  // (act.hero6 since act-22: the default became the 3.5 cm white-haired heroine; a look remembered under the old keys no longer overrides it)
  let id = ''; try { id = localStorage.getItem('act.hero6') ?? ''; } catch { /* storage blocked */ }
  if (!__DEBUG_UI__) return HEROES.find(d => d.id === DEFAULT_HERO) ?? HEROES[0];   // (11-18: the packages wear the default — no costume switch there)
  const q = typeof location !== 'undefined' ? /[?&#]hero=([a-z_]+)/.exec(location.href)?.[1] : undefined;
  return HEROES.find(d => d.id === (q ?? id)) ?? HEROES.find(d => d.id === DEFAULT_HERO) ?? HEROES[0];
}

let SELF: ActShow | null = null;
/** act-20 upgrade card glyphs (12 × 12, axis-aligned): an anvil under a hammer; a needle by a gourd; an open gate (leave) */
const ANVIL = ['..######....', '..#oooo#....', '..######....', '....##......', '....##......', '............', '.##########.', '.#oooooooo#.', '..########..', '....####....', '...######...', '............'];
const NEEDLE = ['.........##.', '........#oo#', '.##.....#oo#', '.##......##.', '.##.....####', '.##....#oooo', '.##....#oooo', '.##....#oooo', '.##.....####', '.##.........', '.##.........', '............'];
/** 杜五's provisions: a flatbread on a plate, a square-holed coin (the purse), a wine jug (12 × 12, axis-aligned) */
const MEAL_GLYPH: Record<string, string[]> = {
  feast: ['............', '............', '...######...', '..#oooooo#..', '.#oo#oo#oo#.', '.#oooooooo#.', '.#oo#oo#oo#.', '..#oooooo#..', '...######...', '############', '.##########.', '............'],
  purse: ['...######...', '..#oooooo#..', '.#oooooooo#.', '#oooooooooo#', '#ooo####ooo#', '#ooo#..#ooo#', '#ooo#..#ooo#', '#ooo####ooo#', '#oooooooooo#', '.#oooooooo#.', '..#oooooo#..', '...######...'],
  wine: ['....####....', '.....##.....', '....#oo#....', '....#oo#....', '...#oooo#...', '..#oooooo#..', '.#oooooooo#.', '.#oo####oo#.', '.#oooooooo#.', '.#oooooooo#.', '..########..', '............'],
};
const LEAVE = ['############', '#..........#', '#.########.#', '#.#......#.#', '#.#......#.#', '#.#......#.#', '#.#....#.#.#', '#.#......#.#', '#.#......#.#', '#.#......#.#', '#.#......#.#', '###......###'];
/** act-29: a speech bubble (three dots), a small relief model for over a person's head — white since act-34 (用户：「对白气泡用白色，不要黄色，黄色看不懂」) */
function npcBubble() {
  const rows = ['.ooooooo.', 'ohhhhhhho', 'oh.r.r.do', 'oh.....do', 'odddddddo', '.oo.ooooo', '..od.....', '..o......'];
  const H = rows.length, W = rows[0].length, s = 1 / W, gs: THREE.BufferGeometry[] = [], col = new THREE.Color();
  const C: Record<string, number> = { o: 0xd6dade, h: 0xffffff, d: 0x8c9198, r: 0x22242a };
  rows.forEach((row, y) => { for (let x = 0; x < W; x++) { const ch = row[x], c = C[ch]; if (c == null) continue; const g = new THREE.BoxGeometry(s, s, s * (ch === 'r' ? 1.4 : 2)); g.translate((x - W / 2 + 0.5) * s, (H / 2 - y - 0.5) * s, 0); col.setHex(c); const n = g.attributes.position.count, cs = new Float32Array(n * 3); for (let i = 0; i < n; i++) { cs[i * 3] = col.r; cs[i * 3 + 1] = col.g; cs[i * 3 + 2] = col.b; } g.setAttribute('color', new THREE.BufferAttribute(cs, 3)); gs.push(g); } });
  const geo = mergeGeometries(gs); for (const g of gs) g.dispose();
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0xffffff, emissiveIntensity: 0.12 }));
}
/** act-34: what a room is built from (buildRoom reads these from the show; the prefetch passes a new game's first room) */
interface RoomIn { isYard: boolean; room: number; recent: Spec[]; locale: string; plan: RoomPlan | null; nextRooms: RoomPlan[]; viewSpec: Partial<Spec> | null; forceSpec: Partial<Spec> | null; noArena: boolean;
  /** 11-18 屋子形态: force this room's shape (__dh.shape / captures) and its seed; the last rooms' shapes (not again so soon) */
  shape?: ShapeId | null; shapes?: ShapeId[]; seed?: number | null;
  /** 11-18 定死的屋子: force this drawn room (asm/roomMaps.ts id); the drawn rooms used this run (not again while others are left) */
  map?: string | null; maps?: string[]; region?: number;
  /** 11-18: the region's defaults for the pick (season …: 下邳 is winter); the place's own lists still apply */ regionSpec?: Partial<Spec> | null }
/** a room's place, built (off the live scene) and ready to put up */
interface Room { spec: Spec; big: boolean; layout: Layout; arena: ArenaPlan | null; report: Report | null; prep: PreparedStage; k: { x: number; z: number } }
/** the prologue's first room (act-29) and its one way on */
/** act-44: where her hips lie on 孙媪's mat when she first wakes (the mat runs along z; her head toward the wall, a metre clear) */
const WAKE_MAT: [number, number] = [6.42, -6.2];   // (her neck on the headrest at the wall end, her heels short of the folded quilt)
const PRO_ROOM = { locale: 'hj_village', waves: [['hj_mob', 'hj_blade', 'hj_mob', 'hj_mob'], ['hj_blade', 'hj_mob', 'hj_mob']] as EKind[][],   // (11-19: the first wave is the ambush that closes round her — four, from every side)
  spec: { season: 'winter', weather: 'snow', time: 'night' } as Partial<Spec> };
const PRO_BOSS: RoomPlan = { type: 'boss', locale: 'hj_temple', reward: null, waves: [['hj_boss']] };
/** act-37 the cold open's place: 寒山坞 on that snowy night (its own layout and light) */
const COLD_ROOM: RoomIn = { isYard: false, room: 0, recent: [], locale: 'hs_forge', plan: null, nextRooms: [], forceSpec: null, noArena: true,
  viewSpec: { locale: 'hs_forge', layout: 'hs_valley', mirror: false, landmark: null, season: 'winter', time: 'night', weather: 'snow', seed: 7, exits: [] } };
/** pick the spec, lay out the floor and the arena, assemble and build the place — touching nothing live except the stage size
 *  (setStage, which the caller sets again) */
function prepRoom(o: RoomIn): Room { return finishBuild(prepRoomSteps(o)); }
function* prepRoomSteps(o: RoomIn): Generator<void | Promise<void>, Room> {
  const { def, ...room } = roomDefinition(o);
  return { ...room, prep: yield* prepareStageSteps(def, { combat: true }) };
}
export function roomDefinition(o: RoomIn) {
  const { isYard } = o;
  const seed = o.seed ?? (Date.now() % 100000) + o.room * 977;
  const base = pickSpec(seed, Object.values(REGISTRY.locales), REGISTRY.layouts, o.recent, { season: o.regionSpec?.season ?? 'autumn', locale: o.locale });
  const spec: Spec = isYard ? { ...base, time: 'dusk', weather: 'clear', exits: ['back'] }
    : { ...base, time: o.room === 0 ? 'dusk' : base.time, weather: o.plan?.type === 'boss' ? 'clear' : base.weather, exits: o.nextRooms.length > 1 ? ['left', 'right'] : o.nextRooms.length ? ['back'] : [] };
  if (o.viewSpec) Object.assign(spec, { exits: [] }, o.viewSpec);
  if (o.forceSpec) Object.assign(spec, o.forceSpec);   // act-29: the prologue's snowy night
  // act-19: the 黄巾 rooms stand on the 2x stage; the yard keeps the old one (wp/regB: and every place in asm/arena.ts ARENA_LOOK). 11-18 屋子形态 (用户：「场景再大些，形态多样一些」): a fight
  // room on a big stage takes one of its place's shapes (the boss's, the calm rooms, the prologue's and the cutscenes' stay square)
  const ptype = o.plan?.type ?? 'fight', calm = ptype === 'shop' || ptype === 'rest' || ptype === 'boon';
  const roomKind = calm ? 'calm' : ptype === 'boss' ? 'boss' : 'fight';
  const region = o.region == null ? null : REGIONS[o.region];
  const dm = region && !isYard && !o.noArena && !o.viewSpec && !o.forceSpec && !o.shape
    ? (o.map ? MAP_BY_ID[o.map] : pickMap(region, roomKind, o.maps ?? [], seed)) : null;
  if (dm) {
    const mb = pickSpec(dm.seed, Object.values(REGISTRY.locales), REGISTRY.layouts, [], { season: o.regionSpec?.season ?? 'autumn', locale: dm.locale });
    Object.assign(spec, { ...mb, mirror: false, time: dm.time ?? mb.time, weather: dm.weather ?? mb.weather, seed: dm.seed });
  }
  const loc = LOCALES[spec.locale], bigP = !isYard && bigStage(spec.locale);
  const shapeId: ShapeId = dm ? 'map' : !bigP || o.noArena ? 'square' : o.shape ?? (o.viewSpec || o.forceSpec ? 'square' : pickShape(loc?.shapes, calm ? 'calm' : ptype === 'boss' ? 'boss' : 'fight', spec.seed, o.shapes ?? []));
  const big = bigP, k = dm ? mapStage(dm) : SHAPE_K[shapeId]; setStage(big, k);
  const lb = REGISTRY.layouts[spec.layout] ?? Object.values(LOCALES).flatMap(l => l.extraLayouts ?? []).find(l => l.id === spec.layout)!;
  const drawn = dm ? mapShape(dm) : undefined;
  const layout = withExits(spec.mirror ? mirrorLayout(stageLayout(lb)) : stageLayout(lb), spec.exits ?? [], drawn?.fixed);
  const pits = loc?.pits ?? ['water'], pitK = pits[Math.floor(((spec.seed * 2654435761) >>> 0) / 4294967296 * pits.length) % pits.length];
  const shape = drawn ?? (big && !o.noArena && shapeId !== 'square' ? makeShape(shapeId, spec.seed, { layout, pit: pitK }) : undefined);
  const arena = big && !o.noArena ? arenaPlan(layout, (spec.exits ?? []) as ExitId[], spec.seed, spec.locale, calm ? 'calm' : ptype === 'boss' ? 'boss' : 'fight', shape) : null;
  spec.arena = arena ?? undefined;
  if (isYard) return { spec, big, layout, arena, report: null, k, def: hideoutScene({ time: 'dusk', weather: 'clear' }) };
  const { def, report } = assemble(spec, REGISTRY);
  def.report = report;
  if (dm && dm.kind === (ptype === 'boss' ? 'boss' : 'fight') && !o.forceSpec && !o.viewSpec) def.pack = `map-${dm.id}-${spec.season}-${spec.exits?.length ?? 0}`;
  return { spec, big, layout, arena, report, k, def };
}

/** 11-18 per blow: [hit-stop s (× TUNE.hitstop), camera push m, rumble (trauma × TUNE.shake), push-in share, hit sound] */
// (act-43 反馈：「我感觉屏震还要再大点，普通攻击几乎感觉不到任何效果」→ every push about 2.5×, the light cuts a little rumble of their own
//  and a longer stop; the rumble's curve in gfx.ts is gentler so the small ones show)
const BEAT: Record<string, [number, number, number, number, Cue]> = {
  k1: [0.05, 0.15, 0.07, 0, 'hitLight'], k2: [0.05, 0.15, 0.07, 0, 'hitLight'], k3: [0.06, 0.18, 0.09, 0, 'hitLight'], k4: [0.035, 0.11, 0.05, 0, 'hitStab'],
  k5: [0.11, 0.26, 0.24, 0.06, 'hitHeavy'], heavy: [0.08, 0.2, 0.14, 0.03, 'hitHeavy'], dcut: [0.06, 0.16, 0.08, 0, 'hitHeavy'], launch: [0.07, 0.16, 0.12, 0.02, 'hitHeavy'],
  kick: [0.07, 0.2, 0.14, 0, 'hitKick'], plunge: [0.09, 0.14, 0.26, 0.05, 'hitHeavy'], rel: [0.08, 0.3, 0.34, 0.08, 'hitIai'], parry: [0.1, 0.22, 0.22, 0.05, 'hitHeavy'],
  arrow: [0.05, 0.1, 0.07, 0, 'hitLight'], wind: [0.03, 0.06, 0, 0, 'hitLight'], kunai: [0.02, 0.05, 0, 0, 'hitStab'],
  // 11-18 四本新刀谱: 断云's two quick cuts in the air, its third, its slam into the ground; 掠地; 踏顶; 牵红's yank
  acut: [0.035, 0.12, 0.05, 0, 'hitLight'], acutF: [0.06, 0.2, 0.1, 0.02, 'hitHeavy'], acutS: [0.1, 0.24, 0.26, 0.05, 'hitHeavy'],
  swoop: [0.07, 0.2, 0.12, 0.02, 'hitHeavy'], stomp: [0.06, 0.14, 0.16, 0.02, 'hitKick'], reel: [0.03, 0.1, 0.03, 0, 'hitStab'],
};
/** 11-18 whose voice a foe cries with (the audio picks the takes and the pitch): 0 a man, 1 a big man, 2 the chief, 3 a hound */
const voiceOf = (f: Foe) => isBoss(f) ? 2 : f.d.role === 'hound' ? 3 : f.d.role === 'brute' || f.elite ? 1 : 0;
/** 11-18 空间回响 per place: [tail s, how much] */
const ROOM_VERB: Record<string, [number, number]> = { hj_village: [0.6, 0.13], hj_field: [0.35, 0.07], hj_temple: [1.1, 0.2], hs_forge: [0.7, 0.14], yard: [0.9, 0.16] };
/** 11-18 不见刀's burst: how many quick cuts each foe takes after the sheathing click, the gap between them (s, real), each one's
 *  share of TUNE.ultDmg (the last cut takes what is left) */
const ULT_TICKS = 8, ULT_GAP = 0.065, ULT_TICK_SHARE = 0.06;
/** the camera springs' stiffness (rad/s): a push settles in ≈ 0.2 s */
const CAM_W = 18;
export class ActShow {
  L = new UiLayer(); ov = new Overlay(); inp = new Input(); hud: ActHud; cards: CardPick; banner: SkinBanner;
  stage: Stage | null = null; hero!: Hero; foes: Foe[] = []; arrows: Arrow[] = []; waves: BladeWave[] = []; darts: Dart[] = []; /** darts thrown so far (tests) */ dartsThrown = 0;
  room = 0; wave = 0; phase: Phase = 'intro'; perks: Perks = newPerks();
  /** act-17: this room's plan, the roads out of it, the kinds of room seen this run, the purse */
  private plan: RoomPlan | null = null; private nextRooms: RoomPlan[] = []; private visited: RoomType[] = []; coins = 0;
  /** 11-18 一局五关: which 关 the run is in (0 起; REGIONS) — room is the room within it; bosses = the region bosses killed this run;
   *  the TUNE values the run started with (each region scales the foes from these, flow.ts regionScale) */
  region = 0; private bosses = 0; private baseFoe = { hp: 1, dmg: 1, aggression: 0.85, calm: 1.3, attackers: 1 }; private regionIn = false;
  /** act-19: the floor's cover and props (collision), the breakable props, the room's walls / gates / cover plan */
  private lightningT = 6;
  /** act-20 meta: what the hideout's upgrades give this run; the run's tally for the trip home */
  private mods: RunMods = { dmgMul: 1, dartBonus: 0, hpBonus: 0, deathDefy: 0, startIntent: 0, windupMul: 1, startManual: false };
  /** act-20 the hideout's people: where they stand, their bodies; the one in reach of a word */
  private npcs: Array<{ id: string; x: number; z: number; yaw: number; a: BattleActor; sh: THREE.Mesh }> = []; private npcNear: string | null = null;
  /** act-20 the stele of names in the hideout; talk is off while a scripted moment plays there */ private stele: Stele | null = null; private noTalk = false;
  private defy = 0; private wine = false; private eliteKills = 0; private bossKilled = false; private banked: { iron: number; herb: number } | null = null;
  /** a cutscene's place: the open land, no walls / gates / props */ private noArena = false;
  /** 11-18: the shallow water on this room's floor (下邳: the 水鬼 swim in it; LOCALES[…].pools) */ private pools: Array<{ x0: number; x1: number; z0: number; z1: number }> = [];
  /** act-34: a room built ahead of time (prepRoom), waiting to be put up; buildRoom uses it when it is the room asked for */
  private pre: (Room & { locale: string }) | null = null;
  // ------------------------------------------------------------ act-20: story — portrait dialogue, timeline cutscenes, puppets
  dialogue: Dialogue; timeline: Timeline; pause!: PauseMenu; private pauseHud: boolean | null = null; private padSkip = false; private puppets: Foe[] = []; private wasPhase: Phase = 'yard'; private justDied = false;
  /** act-29 开篇 (方案 1): 1 = the snowy village (the first fight, alone), 2 = the snowy temple (褚雷, a fight she cannot win), 0 = off */
  prologue = 0; private forceSpec: Partial<Spec> | null = null; private proFightT = 0; private proFalling = false; private proPeople: BattleActor[] = [];
  /** 11-18: her pose from 石雷's blow until 杜五 lifts her onto the donkey — on one knee, bleeding (prologue.ts Kneel) */
  private proKneel = new Kneel();
  private proHost: PrologueHost = {
    hero: { get a() { return SELF!.hero.a; }, get pos() { return SELF!.hero.pos; } } as PrologueHost['hero'],
    kneel: this.proKneel,
    person: (id, x, z, yaw) => { const a = new BattleActor(id === 'duwu' ? HIDEOUT_PEOPLE.duwu : HIDEOUT_DONKEY); a.place(V3(x, 0, z), yaw); a.yaw = yaw; trimShadows(a.root, 4); this.proPeople.push(a); return a; },
    puppet: (kind, x, z, fx, fz) => this.cineHost.puppet(kind, x, z, fx, fz),
  };
  private cineHost: CineHost = {
    hero: { get a() { return SELF!.hero.a; }, get pos() { return SELF!.hero.pos; } } as CineHost['hero'],
    puppet: (kind, x, z, fx, fz) => { const f = spawnFoe(kind, V3(x, 0, z), V3(fx, 0, fz)); f.st = 'move'; this.puppets.push(f); return f; },
    clearPuppets: () => { for (const f of this.puppets) f.a.dispose(); this.puppets = []; },
    hold: (p, r) => this.clamp(p, r),
  };
  /** portrait lines; the fight / the hideout wait (phase 'talk') and resume */
  async talk(lines: Line[], onLine?: (i: number, line: Line) => void) {
    if (!lines.length) return;
    const was = this.phase === 'talk' ? this.wasPhase : this.phase; this.wasPhase = was; this.phase = 'talk'; this.hud.on = false; this.banner.hide();
    await this.dialogue.play(lines, onLine);
    // (act-50 用户：「对话过后马上会蓄力」: the cut button that turned the last page was still down — read as a hold, 藏锋. It counts
    //  again once let go; the stick is left alone)
    this.phase = was; this.hud.on = true; this.inp.latch(false);
  }
  /** a timeline cutscene; the HUD hides, gameplay waits (phase 'cine') */
  async cine(shots: Parameters<Timeline['play']>[0]) {
    const was = this.phase; this.phase = 'cine'; this.hud.on = false; this.banner.hide();
    const skipped = await this.timeline.play(shots);
    this.cineHost.clearPuppets(); this.inp.latch(false);   // (a long press skipped it — the same held button)
    shot('act', () => this.camPose(), { cut: true, speed: 8 });
    this.phase = was; this.hud.on = true; return skipped;
  }
  /** 开始游戏: a fresh save, the opening cutscene on the burning field, then the hideout and her first waking */
  async startNewGame() {
    newGame();
    // a new game: 刘白 in her default look again, the white-haired one (the costume the browser remembered goes)
    { const d = HEROES.find(x => x.id === DEFAULT_HERO); if (d) { this.wearing = d; if (this.hud.flask instanceof IronHp) this.hud.flask.setFace(d.id); else HP_FACE.id = d.id; try { localStorage.setItem('act.hero6', d.id); } catch { /* storage blocked */ } } }
    // act-29 (用户：「方案1开做吧」): the night seven years before (once its place is built), then the prologue — alone in the snow
    const narrative = this.coldOpen();
    // Once the player chooses New Game the first village is known. Build it
    // during the story cards, preserving the randomly drawn layout and seed.
    const village = __WX__ && COLD_AS_CARDS
      ? loadInFrames(prepRoomSteps(this.prologueRoomIn())).catch(error => {
        console.warn('[act] village preparation failed', error); return null;
      }) : null;
    const pov = await narrative;
    // 11-18 (用户：「开场黑幕到第一个走在雪地的场景之间用渐黑转场，不要用竹子飞刀」): from the black cards straight into the snow
    // walk through the dark — no blade, no bamboo, on every platform. The village is built (in frames on WeChat, where the
    // title already started it) behind the black veil, the shaders warmed, then the black fades off
    if (__WX__) {
      while (bladeBusy()) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      const ready = await village;
      if (ready) this.pre = { ...ready, locale: PRO_ROOM.locale };
    }
    await this.startPrologue();
    if (pov) { precompile(); await frames(3); pov.fill(0x000000, 0); after(1.6, () => pov.dispose(), { real: true }); }
  }
  /** act-37 the cold open: 寒山坞 that night (coldopen.ts) — on the place the title built while it loaded; it ends in the dark */
  private async coldOpen(): Promise<BlindPOV | null> {
    if (COLD_AS_CARDS) {
      const pov = new BlindPOV(this.L); pov.fill(0x000000, 1, true); this.hud.on = false; stopTitle();
      void audio.playMusic('bgm_coldopen', 0.6);
      await this.cine(coldCardShots(pov)); pov.fill(0x000000, 1, true);
      await frames(2); return pov;
    }
    const ready = this.pre && this.pre.locale === 'hs_forge' ? this.pre : null; this.pre = null;
    let r: Room; try { r = ready ?? prepRoom(COLD_ROOM); } catch (e) { console.error('[act] cold open failed', e); return null; }
    for (const f of this.foes) f.a.dispose(); this.foes.length = 0;
    setStage(r.big, r.k); this.layout = r.layout; this.arena = null; this.spec = r.spec; this.grid = null;
    this.stage = r.prep.attach(); this.hud.on = false;
    const pov = new BlindPOV(this.L), co = coldOpenShots({ root: this.stage.root, pov });
    void audio.playMusic('bgm_coldopen', 0.8, 18);   // (act-37: from 18 s in, so its louder middle lands on the flashbacks)
    await this.cine(co.shots);
    co.dispose(); pov.fill(0x000000, 1, true);
    await frames(2);   // the dark is on screen before the next place is built
    return pov;
  }
  /** the prologue's first room as buildRoom will ask for it (so the title can build it ahead) */
  private prologueRoomIn(): RoomIn {
    return { isYard: false, room: 0, recent: [], locale: PRO_ROOM.locale, plan: { type: 'fight', locale: PRO_ROOM.locale, reward: null, waves: PRO_ROOM.waves }, nextRooms: [PRO_BOSS], viewSpec: null, forceSpec: { ...PRO_ROOM.spec }, noArena: false };
  }
  /** the prologue's first room: the snowy village at night, a few sentries; then the temple (leave() moves prologue to 2) */
  async startPrologue() {
    this.prologue = 1; this.proFalling = false; this.proFightT = 0;
    this.intent = 0; this.hud.intent = 0; this.perks = newPerks(); this.room = 0; this.kills = 0; this.recent = []; this.visited = []; this.coins = 0;
    this.mods = runMods(profile()); this.defy = 0; this.eliteKills = 0; this.bossKilled = false; this.wine = false;
    TUNE.heroHp = 100 + this.mods.hpBonus; TUNE.dartCharges = 3 + this.mods.dartBonus; TUNE.aggression = 0.85 / this.mods.windupMul;
    this.baseFoe.aggression = TUNE.aggression; this.scaleFoes(0);
    this.plan = { type: 'fight', locale: PRO_ROOM.locale, reward: null, waves: PRO_ROOM.waves };
    this.locale = PRO_ROOM.locale; this.forceSpec = { ...PRO_ROOM.spec };
    const loading = this.buildRoom(true); if (loading) await loading;
    // 「七年后」 over the snowy village while she walks in from the front; then the first sentries
    // (11-19 用户：「前面短促的悲伤音乐加字幕，突然就进入战斗了……需要一个timeline来放刘白走到战场中的过程，和敌人跳出来把她包围了的过程，
    //  辅以对话和文字」): the place and the year over the village from high; she walks in alone up the snowy lane (a long walk, the
    //  steps planted — heroWalk.ts), stops in the middle, turns her head to listen; sounds round her (rings in the snow); the first
    //  wave's sentries jump out from behind the houses and the walls on every side and close round her; the words; she sets her hand
    //  on the hilt — and the fight is on, the sentries already where they stood
    const h = this.hero, p0 = h.pos.clone(), WALK = 6.5, stopZ = p0.z - WALK;
    const ring = (this.plan?.waves[0] ?? []).map((k, i, all) => ({ k, a: Math.PI * 0.15 + (i / all.length) * Math.PI * 2 + 0.35, d: 3.4 + (i % 2) * 0.7 }));
    const jumpers: Array<{ f: Foe; from: THREE.Vector3; to: THREE.Vector3; t0: number; landed: boolean }> = [];
    const snowRing = (x: number, z: number, r = 1.4) => fxRing(V3(x, 0.05, z), 0xdfe8ff, r, { life: 0.9 } as never);
    const stand = () => { h.pos.z = stopZ; motionOf(h.a).run = 0; };
    const cam = (dx: number, y: number, dz: number, lz: number, fov: number): { pos: V; look: V; fov: number } => ({ pos: [p0.x + dx, y, stopZ + dz] as V, look: [p0.x, 0.9, stopZ + lz] as V, fov });
    void this.cine([
      // the year and the place, high over the village (act-37: the cold open's last card says 七年了)
      { dur: 3.6, ease: 'inOut', caption: { text: PRO_CAPTIONS[1], big: true, at: 0.6, hold: 2.3 }, from: { pos: [p0.x + 4, 17, p0.z + 15], look: [p0.x, 0, p0.z - 5], fov: 40 }, to: { pos: [p0.x + 3, 14, p0.z + 13], look: [p0.x, 0, p0.z - 5], fov: 40 },
        at: [[0, () => { this.musicHold = null; void audio.playMusic('bgm_coldopen', 0.4); }]],
        tick: (_t, dt) => h.a.update(dt) },
      // she comes up the lane alone — from behind and to the side, the camera keeping pace, low enough to see her steps in the snow
      { dur: 5.4, ease: 'linear', from: () => ({ pos: [p0.x + 4.2, 3.0, h.pos.z + 5.8] as V, look: [p0.x, 0.9, h.pos.z - 1.5] as V, fov: 36 }), to: () => ({ pos: [p0.x + 3.8, 2.8, h.pos.z + 5.2] as V, look: [p0.x, 0.9, h.pos.z - 1.8] as V, fov: 36 }),
        tick: (t, dt) => { const m = motionOf(h.a); h.a.yaw = Math.PI; h.pos.z = p0.z - Math.min(WALK, t * 1.2); m.run = h.pos.z > stopZ + 0.05 ? 0.22 : Math.max(0, m.run - dt * 4); h.a.update(dt); } },
      // she stops; her head turns; one ring after another in the snow round her — they are there, and she hears them
      { dur: 2.6, ease: 'inOut', from: cam(4.6, 2.9, 6.4, -0.8, 34), to: cam(4.0, 2.7, 5.6, -0.6, 33),
        at: [[0.3, () => snowRing(p0.x - 3.2, stopZ - 1.8)], [0.8, () => snowRing(p0.x + 3.6, stopZ + 0.6)], [1.3, () => snowRing(p0.x - 1.0, stopZ - 3.8)], [1.75, () => snowRing(p0.x + 1.8, stopZ + 3.2)], [1.0, () => cue('foeSwing', 0.25)]],
        tick: (t, dt) => { stand(); h.a.update(dt); const hd = h.a.bones.head; if (hd) hd.rotation.y += 0.35 * Math.sin(Math.min(1, t / 1.6) * Math.PI); } },
      // they come out: from behind the houses and over the walls, a jump each, landing round her in the snow, one after another
      { dur: 2.4, ease: 'out', from: cam(0.6, 7.0, 8.4, -0.8, 40), to: cam(0.4, 6.4, 7.6, -0.6, 40),
        at: [[0, () => {
          for (const [i, r] of ring.entries()) {
            // (where each lands: round her at its own angle, turned a little at a time until the spot is clear of the props, the cover
            //  and the walls — none lands in a post or a crate)
            let a = r.a; const ok = (x: number, z: number) => this.solids.free(x, z, 0.55, 0.3) && (!this.grid || this.grid.clear(x, z, 0.5)) && jumpers.every(j => j.to.distanceTo(V3(x, 0, z)) > 1.3);
            for (let tt = 0; tt < 12 && !ok(p0.x + Math.sin(a) * r.d, stopZ + Math.cos(a) * r.d); tt++) a += (tt % 2 ? -1 : 1) * 0.28 * (tt + 1);
            const ko = kindOr(r.k), to = V3(p0.x + Math.sin(a) * r.d, 0, stopZ + Math.cos(a) * r.d), from = to.clone().add(V3(Math.sin(a) * 4.5, 0, Math.cos(a) * 4.5));
            if (this.grid && !this.grid.clear(from.x, from.z, 0.4)) from.lerp(to, 0.4);
            const f = spawnFoe(ko.kind, from, h.pos.clone(), ko.elite); f.st = 'enter'; f.cd = 2.5; this.foes.push(f);
            jumpers.push({ f, from, to, t0: 0.12 + i * 0.22, landed: false });
          }
          cue('roar', 0.35); void audio.playMusic(this.musicName(), 0.9);
        }]],
        tick: (t, dt) => {
          stand(); h.a.update(dt);
          for (const j of jumpers) {
            const k = Math.max(0, Math.min(1, (t - j.t0) / 0.55)), f = j.f;
            f.pos.lerpVectors(j.from, j.to, k); f.pos.y = 0; f.a.home.copy(f.pos); f.a.off.y = 1.6 * 4 * k * (1 - k);
            f.yaw = Math.atan2(h.pos.x - f.pos.x, h.pos.z - f.pos.z); f.a.yaw = f.yaw;
            if (k >= 1 && !j.landed) { j.landed = true; f.a.off.y = 0; cue('land', 0.35); fxSmoke(j.to.clone().setY(0.1), 0xe8eef8, 6, { r: 0.6, spd: 0.8, up: 0.4, s: 0.4, life: 0.6, alpha: 0.6 }); }
            f.a.update(dt);
          }
        } },
      // the ring closed: low, from outside it, her in the middle
      { dur: 1.6, ease: 'inOut', from: cam(5.6, 4.4, 7.2, -0.4, 38), to: cam(5.0, 4.0, 6.6, -0.3, 36),
        tick: (_t, dt) => { stand(); h.a.update(dt); for (const j of jumpers) { j.f.a.off.y = 0; j.f.a.update(dt); } } },
    ]).then(async () => {
      if (this.phase !== 'intro' || this.hero !== h) return;
      for (const j of jumpers) { j.f.pos.copy(j.to); j.f.a.home.copy(j.to); j.f.a.off.y = 0; }
      await this.talk(PRO_AMBUSH);
      if (this.hero !== h) return;
      for (const j of jumpers) { j.f.st = 'move'; j.f.cd = 0.6 + Math.random() * 0.8; }
      // (the ambushers ARE the first wave: the fight starts with them on the floor; cutting them down brings the second as usual)
      this.phase = 'fight'; this.wave = 0;
    });
  }
  /** the fight she cannot win: the blow, his word, the snow; dawn and the man with the donkey; the kiln */
  private async prologueFall() {
    if (this.proFalling || this.prologue !== 2) return; this.proFalling = true;
    this.musicHold = 'bgm_fall'; void audio.playMusic('bgm_fall', 0.8);   // (act-37: struck down → the camera rises → the dawn)
    const boss = this.foes.find(f => isBoss(f) && f.st !== 'dead') ?? null;
    this.hero.inv = 99;
    for (const f of this.foes) { dropTeles(f); f.attacking = false; f.lunge = null; }   // nothing left half-swung on the snow
    // (11-18 用户：「这个地上的白光是啥，一直在那儿，被boss打死触发剧情的时候就这样」: 石雷's bolt that struck her down flashes its ground
    //  mark white for a moment — but the cutscene stops the world before it fades, so it hung there through the talk. Every bolt, talisman
    //  and mark in flight goes now, and the red arcs of the blow)
    for (const a of this.arrows) a.kill(); this.arrows.length = 0; this.hitArcs.clear();
    const kneelPose = () => this.proKneel.frame(this.hero.a);
    if (boss) {
      await this.cine(fallShots(this.proHost, boss));
      if (!this.proKneel.active) this.proKneel.start();   // (the shot skipped before the blow landed: she still goes down on her knee)
      // (her line 「颤抖的指尖在雪泥里死死够向刀柄」: the right hand goes out toward the sabre on the snow; back down after it)
      this.hero.scriptPose = kneelPose; await this.talk(PRO_FALL, (_i, l) => { this.proKneel.reachWant = l.who === 'act' && /刀柄/.test(l.text) ? 1 : 0; }); this.proKneel.reachWant = 0; this.hero.scriptPose = null;
      this.phase = 'cine'; await this.cine(snowShots(this.proHost, boss));
    } else this.proKneel.start();
    // dawn in the same yard: the snow has stopped, the dead lie where they fell
    const sp = this.spec, at = { x: this.hero.pos.x, z: this.hero.pos.z }, yaw = this.hero.a.yaw;
    await wipeTransit(async () => {
      for (const f of this.foes) f.a.dispose(); this.foes.length = 0;
      this.noArena = true; this.viewSpec = { locale: 'hj_temple', season: 'winter', time: 'dawn', weather: 'clear', layout: sp?.layout ?? 'axis', mirror: sp?.mirror ?? false, seed: sp?.seed ?? 5, exits: [] };
      this.forceSpec = null; await this.buildRoom(true); this.viewSpec = null; this.noArena = false;
      this.hero.pos.set(at.x, 0, at.z); this.hero.a.yaw = yaw; this.proKneel.dawn(); this.hero.scriptPose = kneelPose; this.hero.a.update(0.016); kneelPose();
    });
    const dead: Array<[EKind, number, number]> = [['hj_mob', at.x - 3.2, at.z + 2.6], ['hj_blade', at.x - 1.4, at.z + 3.6], ['hj_mob', at.x + 2.4, at.z - 1.8]];
    const who: { duwu: BattleActor | null; donkey: BattleActor | null } = { duwu: null, donkey: null };
    await this.cine(dawnShots(this.proHost, at, dead, who));
    await this.talk(PRO_DAWN); this.hero.scriptPose = null;
    await this.cine(loadShots(this.proHost, who));
    this.proKneel.stop();
    for (const a of this.proPeople) a.dispose(); this.proPeople = [];
    this.prologue = 0; this.forceSpec = null;
    let wakeK: (k: number) => void = () => {};
    let bloomWas = GRADE.bloomThreshold;
    // (act-40 用户：「被救回去应该是先趟垫子上的啊，怎么是站着的」: she wakes lying on 孙媪's mat, and gets up at the line where she
    //  pushes herself up the wall; the kiln's own music for the scene — the hideout's comes after)
    await wipeTransit(async () => {
      await this.enterYard(); this.musicHold = 'bgm_kiln'; void audio.playMusic('bgm_kiln', 1.2);
      // (act-44 用户：「躺着那个更扯，头都插进墙了，起来的时候直接以足底为圆心旋转」: on her back along the mat, her hips at its middle and
      //  her head toward the wall with a metre to spare; getting up pivots on the hips — getUpPose)
      const h = this.hero; h.pos.set(WAKE_MAT[0], 0, WAKE_MAT[1]); h.a.yaw = 0; let gk = 0; h.scriptPose = () => getUpPose(h.a, gk);
      // (the battle camera looks down the mat from her feet — lying and standing look the same from there; this scene is seen from
      //  the side, low, the mat across the middle of the screen between the two portraits)
      this.camOverride = { base: V3(3.7, 2.5, -3.9), look: V3(6.55, 0.45, -6.1), fov: 40 }; shot('act', () => this.camPose(), { cut: true, speed: 8 });
      // (on her back the white hair at the back of her head faces the sun square on and went over the bloom threshold — a halo round
      //  her head; the threshold up for this scene)
      bloomWas = GRADE.bloomThreshold; GRADE.bloomThreshold = Math.max(bloomWas, 1.6);
      wakeK = (k: number) => { gk = k; };
    });
    await new Promise(r => after(0.8, () => r(null)));
    seeOnce('wake1'); let up = false, talked = false;
    // her sabre comes back once the talk is over (孙婆婆：「把刀给她吧」) and she is on her feet — whichever is later
    const giveBlade = () => { const w = this.hero.a.bones.weapon; if (w) w.visible = true; };
    const getUp = () => { if (up) return; up = true; const h = this.hero; let k = 0; const step = () => { k = Math.min(1, k + 1 / (30 * 3.2)); wakeK(k);
      if (k < 1) { after(1 / 30, step); return; }
      // standing: the body offset goes into her position (she has stepped forward onto her feet), the cutscene pose lets go
      h.pos.x += Math.sin(h.a.yaw) * GETUP_STEP; h.pos.z += Math.cos(h.a.yaw) * GETUP_STEP; h.a.root.position.copy(h.pos); h.a.body.position.set(0, 0, 0); h.a.body.rotation.set(0, 0, 0); h.scriptPose = null; if (talked) giveBlade(); };
      step(); };
    await this.talk(PRO_WAKE, (_i, l) => { if (l.who === 'act' && /撑起|站起|起身/.test(l.text)) getUp(); });
    getUp(); this.musicHold = null; this.music(); saveProfile();
    talked = true; if (!this.hero.scriptPose) giveBlade();
    this.camOverride = null; GRADE.bloomThreshold = bloomWas;   // (the battle camera eases back in)
  }
  /** the run's haul goes home (meta.ts bank: currencies, runs / wins / deaths), saved */
  private lastWon = false;
  private bankRun(won: boolean) {
    this.lastWon = won;
    // 11-18: a room in region n counts n rooms; every boss killed counts (runReward's boss share is a boolean: the bosses past the first
    // go in as rooms worth the same 15 iron)
    const rooms = roomsWorth(this.region, this.room, won) + Math.max(0, this.bosses - 1) * 15;
    this.banked = bank(profile(), { rooms, elites: this.eliteKills, boss: this.bossKilled, won, kills: this.kills }); saveProfile();
  }
  /** 11-18: the foes' strength for region ri from the run's starting TUNE (region one: as it was) */
  private scaleFoes(ri: number) {
    const k = regionScale(ri), b = this.baseFoe;
    TUNE.enemyHp = b.hp * k.hp; TUNE.enemyDmg = b.dmg * k.dmg; TUNE.aggression = b.aggression * k.quick; TUNE.atkCalm = Math.max(0.5, b.calm + k.calm); TUNE.maxAttackers = Math.max(b.attackers, k.attackers);
  }
  /** back home: the TUNE values the run started with (the tune panel's own numbers again) */
  private unscaleFoes() { const b = this.baseFoe; if (!this.region) return; TUNE.enemyHp = b.hp; TUNE.enemyDmg = b.dmg; TUNE.atkCalm = b.calm; TUNE.maxAttackers = b.attackers; this.region = 0; }
  /** the hideout's people stand at their places (HIDEOUT anchors when the hideout scene is up; the yard's spots meanwhile) */
  private *placeNpcs(spots: Array<{ id: keyof typeof HIDEOUT_PEOPLE; x: number; z: number; yaw: number }>) {
    this.clearNpcs();
    for (const sp of spots) {
      yield;
      const a = new BattleActor(HIDEOUT_PEOPLE[sp.id]); a.place(V3(sp.x, 0, sp.z), sp.yaw); a.yaw = sp.yaw; trimShadows(a.root, 4);
      const sh = contactShadow(); sh.scale.setScalar(sp.id === 'fengtiebi' ? 0.55 : 0.42); sh.position.set(sp.x, 0.025, sp.z); this.stage!.root.add(sh);
      this.npcs.push({ id: sp.id, x: sp.x, z: sp.z, yaw: sp.yaw, a, sh });
    }
  }
  private clearNpcs() { for (const n of this.npcs) { n.a.dispose(); n.sh.parent?.remove(n.sh); } this.npcs = []; this.npcNear = null; this.stele?.dispose(); this.stele = null; for (const m of this.marks.values()) m.g.parent?.remove(m.g); this.marks.clear(); this.L.text.hide('act.npc'); }
  /** act-29 (用户：「与NPC的交互那些……都太廉价了」): over each person a small bronze speech bubble (a relief, bobbing, turning a little);
   *  the one in reach: a ring of light underfoot, the bubble bigger and lit, the name floating over it */
  private marks = new Map<string, { g: THREE.Group; bub: THREE.Mesh; ring: THREE.Mesh; k: number }>();
  private npcMarks(dt: number, near: string | null) {
    const t = clock.rtime;
    for (const n of this.npcs) {
      let m = this.marks.get(n.id);
      if (!m) {
        const g = new THREE.Group(), bub = npcBubble(), ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.6, 8, 1, Math.PI / 8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xf2f4f8, transparent: true, opacity: 0, depthWrite: false }));
        ring.renderOrder = 3; g.add(bub); this.stage?.root.add(g); this.stage?.root.add(ring); m = { g, bub, ring, k: 0 }; this.marks.set(n.id, m);
      }
      const on = near === n.id && !this.noTalk; m.k += ((on ? 1 : 0) - m.k) * Math.min(1, dt * 10);
      const top = n.a.height ?? 1.8;
      m.g.position.set(n.x, top + 0.45 + Math.sin(t * 2.4 + n.x) * 0.06 + 0.12 * m.k, n.z); m.g.rotation.y = Math.sin(t * 0.9 + n.z) * 0.4;
      m.bub.scale.setScalar(0.32 * (1 + 0.45 * m.k)); (m.bub.material as THREE.MeshLambertMaterial).emissiveIntensity = 0.12 + 0.3 * m.k;
      m.ring.position.set(n.x, 0.04, n.z); const rs = 1 + 0.08 * Math.sin(t * 6); m.ring.scale.set(rs, 1, rs); (m.ring.material as THREE.MeshBasicMaterial).opacity = 0.75 * m.k;
    }
    const nn = near ? this.npcs.find(x => x.id === near) : null;
    // (act-40 用户：「人模型上的名字渲染层级不对，会渲染到UI上层，对话的时候会穿帮」: the floating name is screen text drawn over
    //  everything — gone while a conversation or a cutscene is up)
    if (nn && !this.noTalk && this.phase !== 'talk' && this.phase !== 'cine' && !this.dialogue.on && !this.cards.on && !this.demo.on && !this.pause.on) { const p = worldToUi(V3(nn.x, (nn.a.height ?? 1.8) + 1.0, nn.z)); this.L.text.set('act.npc', { text: HIDEOUT_PEOPLE[nn.id as keyof typeof HIDEOUT_PEOPLE]?.name ?? '', x: p.x, y: p.y, bodyPx: Math.max(12, Math.round(15 * Math.min(1.2, this.L.h / 720))), color: '#ffe6b0', outline: '#140c0a', align: 'center' }); }
    else this.L.text.hide('act.npc');
  }
  /** a word with someone at the hideout; the smith and the healer then show their upgrades */
  private async npcTalk(id: string) {
    if (id === 'stele') { const pool = (this.stele?.count ?? 0) > 0 ? STELE_TALK.one : STELE_TALK.none; await this.talk([{ who: 'jiangjin', text: pool[Math.floor(Math.random() * pool.length)] }]); return; }
    if (id === 'duwu') { await this.mealMenu(); return; }
    const pool = NPC_TALK[id] ?? []; if (pool.length) await this.talk([{ who: id, text: pool[Math.floor(Math.random() * pool.length)] }]);
    if (id === 'fengtiebi' || id === 'sunao') await this.upgradeMenu(id === 'fengtiebi' ? 'forge' : 'medic');
  }
  /** 杜五 packs provisions for the next trip: one of three, free, kept in the save until the run starts */
  private async mealMenu() {
    const p = profile(), pick = (a: string[]) => a[Math.floor(Math.random() * a.length)];
    if (p.meal) { await this.talk([{ who: 'duwu', text: pick(MEAL_TALK.packed) }]); return; }
    await this.talk([{ who: 'duwu', text: pick(MEAL_TALK.offer) }]);
    const cards = MEALS.map(m => ({ boon: { id: 'meal_' + m.id, school: 'ms' as never, name: m.name, desc: [m.desc, ''], col: '#ffd27a', glyph: MEAL_GLYPH[m.id], tag: '' } as Boon, tier: 0 }));
    const was = this.phase; this.phase = 'pick'; this.hud.on = false;
    const i = await this.cards.open(cards, { leave: true }); this.phase = was; this.hud.on = true;
    const m = MEALS[i]; if (!m) return;
    p.meal = m.id; saveProfile(); cue('coin', 0.6);
    await this.talk([{ who: 'duwu', text: MEAL_TALK.after[m.id] }]);
  }
  /** the upgrade list of the smith (百辟残铁) or the healer (沸血药引) as rows of cards; the last row leaves */
  private async upgradeMenu(who: 'forge' | 'medic') {
    const id = who === 'forge' ? 'fengtiebi' : 'sunao';
    const up = UP_TALK[id]; if (up?.length) await this.talk([{ who: id, text: up[Math.floor(Math.random() * up.length)] }]);
    for (;;) {
      const p = profile(), ups = META.filter(u => u.who === who), cur = who === 'forge' ? '残铁' : '药引', have = who === 'forge' ? p.iron : p.herb;
      const glyph = who === 'forge' ? ANVIL : NEEDLE;
      const cards = ups.map(u => { const lv = level(p, u.id), cost = nextCost(p, u.id);
        return { boon: { id: 'mu_' + u.id, school: (who === 'forge' ? 'fg' : 'md') as never, name: u.name, desc: [...u.desc], col: '#ffd27a', glyph, tag: cost == null ? msg`满 · ${lv}级` : msg`${cur} ${cost} · ${lv}级` } as Boon, tier: cost == null ? 2 : lv > 0 ? 1 : 0 }; });
      // (11-19 用户：「npc商店页面没有退出按钮」: the back shield at the top left leaves — no 离开 card; what she holds shows on the page)
      void have;
      const was = this.phase; this.phase = 'pick'; this.hud.on = false;
      const i = await this.cards.open(cards, { leave: true }); this.phase = was; this.hud.on = true;
      if (i < 0 || i >= ups.length) return;
      const u = ups[i];
      if (!buy(p, u.id)) { const poor = POOR_TALK[id]; if (poor) await this.talk([{ who: id, text: poor }]); return; }
      saveProfile(); cue('coin', 0.8); this.banner.show(u.name, msg`${level(p, u.id)} 级`, 1.0, '#ffd27a');
    }
  }
  /** 继续游戏: the hideout with the saved progress */
  continueGame() { profile(); return this.enterYard(); }
  solids = new Solids(); props: Breakables | null = null; gates: Gates | null = null; leaves: Leaves | null = null; private gustT = 0; arena: ArenaPlan | null = null; private lastPush: Push | null = null; private slamAt = new WeakMap<Foe, number>();
  /** 11-18 屋子形态: this room's floor grid (null = the act-19 rectangle), the shapes of the run's last rooms, a forced shape (__dh.shape) */
  grid: FloorGrid | null = null; private shapes: ShapeId[] = []; private forceShape: ShapeId | null = null; private forceSeed: number | null = null;
  /** 11-18 定死的屋子: the drawn rooms used this run; one forced by __dh.room */ private maps: string[] = []; private forceMap: string | null = null;
  /** 11-18 定死的屋子: its moving pieces (doors, hollow walls, barricades, drop-bridges, bells, rewards — act/puzzles.ts); the floor's
   *  pieces fought in turn (zone labels), which of them each wave is in, the next one she has to walk into before its wave comes */
  pieces: RoomPieces | null = null; private stageZ: number[] = []; private stageOf: number[] = []; private waitZone = -1; private rewardsGot = 0;
  /** how long the last room took to build (ms, the place and its meshes; captures read it) */
  buildMs = 0;
  /** the foes going down into a pit (打出界): falling, then gone */
  private falling: Array<{ f: Foe; t: number; vy: number; kind: PitKind; v: THREE.Vector3 }> = [];
  private coinsFx = new Coins(); private stations: Stations | null = null; private hitArcs = new HitArcs();
  /** __dh.scene: the spec overrides for a fight-less view of one place; the last assembler report */
  private viewSpec: Partial<Spec> | null = null; private lastReport: Report | null = null;
  private spec: Spec | null = null; private layout: Layout | null = null; private doors: Array<{ ex: ExitInfo; g: THREE.Group; lift: number }> = []; private locale = 'ninja_wilds';
  private cam = V3(0, 0, 0); private recent: Spec[] = [];
  private botWp = 0; private botTalkT = 0; botOn = false; kills = 0; log: string[] = []; private introT = 0; private audioOn = false; private hinted = false;
  /** the training yard (room −1) and the costume on the hero */
  yard: Yard | null = null; wearing: ModelDef = savedHero(); private lineupActors: BattleActor[] = [];
  private aimLine!: THREE.Mesh;
  private propContacts?: ContactBatch;
  private foeContacts?: ContactBatch;
  private ring!: THREE.Mesh; private ringK = -1; private sparkT = 0; private shadows: THREE.Mesh[] = []; private exitSign: THREE.Group | null = null; private blob: THREE.Mesh;
  constructor(private platform: Platform, deferStart = false) {
    SELF = this; this.dialogue = new Dialogue(this.L, this.ov); this.timeline = new Timeline(this.L);
    HP_FACE.id = this.wearing.id;   // the HP medallion shows the look she wears
    this.hud = new ActHud(this.L); this.cards = new CardPick(this.L); this.banner = new SkinBanner(this.L, SKIN.id, () => this.hud.bossOn);
    this.duel = new Duel(this.duelHost);   // 11-18 QTE 拼刀 / 连环破势 (act/qte.ts)
    platform.onPointer(ev => { if (ev.type === 'down') this.unlockAudio(); this.pointer(ev.type, (ev as { id?: number }).id ?? 0, ev.x, ev.y); });
    platform.onResize(() => this.layout2());
    if (typeof window !== 'undefined') window.addEventListener('keydown', e => this.key(e));
    onUpdate((dt, rdt) => this.frame(dt, rdt));
    this.layout2();
    // the player's settings: the tuning panel shows the long labels, the pause menu's 设置 page the short ones (act-30 之后)
    // (11-18 用户：「调试只在我们本地打的桌面包里面存在就行了，比如换角色、换开场场景啥的」: dbg = a test switch — the WeChat and
    //  CrazyGames packages leave it out of 设置; they keep 震动, 试一下震动, 画质 and 语言)
    const SET: Array<{ label: () => string; short: () => string; run: () => void; dbg?: true }> = [
      { dbg: true, label: () => `界面风格：${SKIN_NAME[SKIN.id]}（点这里换）`, short: () => msg`界面：${SKIN_NAME[SKIN.id]}`, run: () => this.cycleSkin() },
      { dbg: true, label: () => msg`正文字体：${BODY_FONT_NAME[BODY_FONT.current]}`, short: () => msg`正文字体：${BODY_FONT_NAME[BODY_FONT.current]}`, run: () => { const order: BodyFont[] = ['wenkai', 'serif', 'sans', 'pixel']; setBodyFont(order[(order.indexOf(BODY_FONT.current) + 1) % order.length]); } },
      // act-15 用户：「我浏览器玩没有震动诶」 — a switch, a test, and what this device supports
      { label: () => `震动：${VIBE.on ? '开' : '关'}（${({ api: '这台设备支持', ios: `iPhone iOS ${iosMajor()}：系统触感，点屏幕时最灵`, 'ios-old': `iPhone iOS ${iosMajor() || '17 及以下'}：网页没法震，要 iOS 18`, none: '这个浏览器不支持', mini: '微信：手机震动' } as const)[vibeSupport()]}）`, short: () => msg`震动：${VIBE.on ? '开' : '关'}`, run: () => { VIBE.on = !VIBE.on; try { localStorage.setItem('ub.vibe', VIBE.on ? '1' : '0'); } catch { /* private mode */ } } },
      { label: () => '试一下震动', short: () => '试一下震动', run: () => { const was = VIBE.on; VIBE.on = true; this.platform.vibrate('heavy'); VIBE.on = was; } },
      // act-14 用户：「我要2x，然后调试面板给我一个切换这个的功能」 — 2x → 3x → off → 1x, remembered on this device
      // act-21: which title screen (five moods; the user picks on a phone too, where there are no number keys)
      { dbg: true, label: () => `开始画面：第 ${savedTitle()} 版（点这里换）`, short: () => msg`开始画面：第 ${savedTitle()} 版`, run: () => { const n = savedTitle() % TITLE_COUNT + 1; try { localStorage.setItem('ub.title', String(n)); } catch { /* storage blocked */ } if (this.phase === 'title') this.title(n); } },
      // act-20: her look (the story's heroine: the 斗笠 or the 白发 — the user's two picks); the hideout has no costume rack
      { dbg: true, label: () => `造型：${this.wearing.name}（点这里换）`, short: () => msg`造型：${this.wearing.name}`, run: () => { const ids = ['fine_white', 'fine_hat'], n = HEROES.find(d => d.id === ids[(ids.indexOf(this.wearing.id) + 1) % ids.length]); if (n) this.wear(n); } },
      { dbg: true, label: () => `像素：${PX.on ? PX.size + 'x' : '关'}（点这里换）`, short: () => msg`像素：${PX.on ? PX.size + 'x' : '关'}`, run: () => { const order = ['2', '3', 'off', '1'], cur = PX.on ? String(PX.size) : 'off', nx = order[(order.indexOf(cur) + 1) % order.length]; if (nx === 'off') setPixel(false); else setPixel(true, +nx); try { localStorage.setItem('ub.px', nx); } catch { /* private mode */ } } },
      // 11-18 微信帧率: the quality tier (自动 → 高 → 中 → 低), kept on the device
      { label: () => qualityLabel(), short: () => qualityLabel(), run: () => cycleQuality() },
      { label: meterLabel, short: meterLabel, run: toggleMeter }];
    installActTune([...SET.map(x => ({ label: x.label, run: x.run })),
      // act-50 (用户：「加入一个跳过当前剧情的调试按钮」): the cutscene / the talk running now and the ones chained after it, fast-forwarded
      //  until she can be played again (fast-forward, not a cut: every shot's own events — 杜五 and the donkey coming in, her getting up — still happen)
      { label: () => (this.storySkip ? '跳过剧情：快进中…' : '跳过剧情（演出和对话快进到能操作）'), run: () => this.skipStory() },
      // 11-18 测关卡用: she can't die / every 刀谱 move on (the tune panel only, not the pause menu)
      { label: () => `打不死：${this.god ? '开' : '关'}`, run: () => { this.god = !this.god; } },
      { label: () => `全部招式：${this.dbgAllMoves ? '开' : '关'}`, run: () => { this.dbgAllMoves = !this.dbgAllMoves; if (this.hero && !this.yard && !this.prologue) this.hero.moves = this.dbgAllMoves ? ALL_MOVES : this.perks.moves; } }],
      { regions: REGIONS.map(r => r.name), rooms: ri => REGIONS[ri].rooms, go: (ri, room, type) => { const r = this.jumpRegion(ri, room, type); return 'why' in r ? r.why : undefined; } });
    // the pause menu (act-30 之后, user: 「帮我把手柄的按键映射和手柄支持做了吧」): Start / Esc, a pad pulled out, the page hidden
    this.pause = new PauseMenu({ L: this.L, settings: [...SET.filter(x => __DEBUG_UI__ || !x.dbg).map(x => ({ label: x.short, run: x.run })), { id: 'language', label: () => '语言：简体中文', run: () => setLanguage(language === 'en' ? 'zh' : 'en') }], canGiveUp: () => this.canGiveUp(), giveUp: () => this.giveUp(), closed: () => this.unpaused(), toTitle: () => this.backToTitle(), onRun: () => this.canGiveUp(),
      owned: () => this.ownedSections(), skills: () => this.skillSections() });
    // 11-18 (用户：「游戏里也没有一个可以呼出暂停窗口的按钮」): the iron button at the top right opens it too
    this.hud.onPause = () => this.pauseGame();
    // 11-18 (用户：「选了强化后根本看不到自己选的强化是啥，在哪儿」): a taken 秘传 / 刀谱 flies onto the button it changes and leaves a mark
    this.cards.flight = {
      at: t => this.hud.targetAt(t),
      start: () => { this.hud.on = true; },
      land: e => { this.hud.markLanded(e.target, e.col); cue('clack', 0.7); this.syncMarks(); },
    };
    RUMBLE.fn = padRumble;
    if (typeof window !== 'undefined') {
      window.addEventListener('gamepaddisconnected', () => { if (PAD.device === 'pad') this.pauseGame(); });
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this.pauseGame(); });
    }
    if (__DEBUG_UI__ && typeof window !== 'undefined') window.addEventListener('keydown', e => { if ((e.key === 'u' || e.key === 'U') && !this.cards.on) this.cycleSkin(); });
    dh.add({ voxCompare: (id: string, only = -1, x?: number, z?: number) => {
        // before (the code model) on the left, the edited file on the right, beside the hero (captures of a model edit);
        // only = 0 / 1: just the original / just the edited one, at (x, z)
        const def = HEROES.find(d => d.id === id) ?? ROSTER.find(d => d.id === id), code = CODE_BUILD.get(id); if (!def) return 'no model';
        for (const a of this.lineupActors) a.dispose(); this.lineupActors = [];
        const h = this.hero.pos, cx = x ?? h.x, cz = z ?? h.z;
        const pair: Array<[ModelDef, number]> = [[code ? { ...def, build: code } : def, -1.5], [def, 1.5]];
        (only >= 0 ? [[pair[only][0], 0] as [ModelDef, number]] : pair).forEach(([d, dx]) => { const a = new BattleActor(d); a.place(V3(cx + dx, 0, cz), 0); a.yaw = 0; this.lineupActors.push(a); });
        return { at: [cx, cz], edited: !!code };
      }, prof: () => profile(), steleTest: (n = 0, cut = -1) => { const st = new Stele(n); st.g.position.set(this.hero.pos.x, 0, this.hero.pos.z - 2.2); this.stage!.root.add(st.g); if (cut >= 0) after(0.8, () => st.strike(cut)); return st; },
      // 11-18 一局五关: jump to a room of a region (n 0 起; room within it; the boss room = REGIONS[n].rooms), or straight to region n's boss
      bench: (tiers?: Tier[]) => this.bench(tiers),
      region: (n = 1, room = 0, type: RoomType = 'fight') => this.jumpRegion(n, room, type),
      boss: (n = 0) => { this.jumpRegion(n, REGIONS[Math.max(0, Math.min(REGIONS.length - 1, n))].rooms, 'boss'); }, newGame: () => this.startNewGame(), talkTest: (n = 0) => this.talk(n ? CHULEI_BEFORE : WAKE_DUWU), act: () => this, bot: (on = true) => { this.botOn = on; }, run: () => this.startRun(), yard: () => this.enterYard(), wear: (id: string) => { const d = HEROES.find(h => h.id === id); if (d) this.wear(d); },
      skin: (id: SkinId) => this.cycleSkin(id),
      cardsDemo: () => { void this.cards.open([BOONS[0], BOONS[6], BOONS[12]].map((boon, tier) => ({ boon, tier }))); },
      /** captures: these boons as a pick, tiers 0 / 1 / 2 in turn */ cardsOf: (ids: string[]) => { void this.cards.open(ids.map((id, i) => ({ boon: BOONS.find(b => b.id === id) ?? BOONS[0], tier: i % 3 }))); },
      /** act-44 animation lab (用户：「你动画做精细点可以吗」): a stand-alone heroine / donkey / 杜五 on the current stage for close checks —
       *  labSpawn() puts them at (x, z), lab() returns them for posing from the console / captures, labTick(fn) runs fn(dt, t) every frame */
      ...(() => {
        let foeStage: THREE.Object3D | undefined;
        let floor: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshLambertMaterial> | undefined;
        let grid: THREE.GridHelper | undefined;
        const keep = new Set<THREE.Object3D>();
        const hidden = new Map<THREE.Object3D, boolean>();
        const hide = (o: THREE.Object3D) => {
          if (keep.has(o) || (o as THREE.Light).isLight) return;
          let hasLight = false;
          o.traverse(child => { if ((child as THREE.Light).isLight) hasLight = true; });
          if (hasLight || o === foeStage) { o.children.forEach(hide); return; }
          if (!hidden.has(o)) hidden.set(o, o.visible);
          o.visible = false;
        };
        const clear = () => {
          foeStage = undefined;
          for (const a of this.labActs) a.dispose();
          this.labActs = [];
          floor?.removeFromParent(); floor?.geometry.dispose(); floor?.material.dispose(); floor = undefined;
          grid?.removeFromParent(); grid?.dispose(); grid = undefined;
          for (const [o, wasVisible] of hidden) o.visible = wasVisible;
          hidden.clear(); keep.clear();
        };
        const spawn = (def: ModelDef, x: number, z: number, yaw: number) => {
          const a = new BattleActor(def);
          a.place(V3(x, 0, z), yaw);
          this.stage?.root.add(a.root);
          a.update(0.016);
          this.labActs.push(a); keep.add(a.root);
        };
        const bareFloor = (parent: THREE.Object3D, x: number, z: number) => {
          floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshLambertMaterial({ color: 0x9a968c }));
          floor.rotation.x = -Math.PI / 2; floor.position.set(x, -0.002, z); floor.receiveShadow = true;
          grid = new THREE.GridHelper(30, 60, 0x55524c, 0x77736a); grid.position.set(x, 0.001, z);
          parent.add(floor, grid); keep.add(floor); keep.add(grid);
        };
        onUpdate(dt => {
          if (!foeStage) return;
          if ((this.stage?.root ?? scene) !== foeStage) { clear(); return; }
          scene.children.forEach(hide);
          for (const a of this.labActs) a.update(dt);
        });
        const namedImpact: Record<string, number> = {
          thrust: 0.6, sweepHalberd: 0.55, paw: 0.92, bash: 0.55, aimXbow: 0.85, lob: 0.75,
          axeSweep: 0.62, axeChop: 0.55, ram: 0.9, axeThrow: 0.7, kick: 0.7,
          backstab: 0.6, backstab2: 0.6, blow: 0.85, sow: 0.7, rise: 0.75,
          whirl: 0.6, slamChain: 0.55, snip: 0.6, needleFan: 0.8, burst: 0.85,
        };
        return {
          labSpawn: (x = 0, z = 1.5, bare = false) => {
            clear();
            spawn(this.wearing, x, z, 0); spawn(HIDEOUT_DONKEY, x + 2.2, z, Math.PI / 2); spawn(HIDEOUT_PEOPLE.duwu, x - 2.2, z, 0);
            hide(this.hero.a.root);
            if (bare && this.stage) { this.stage.root.children.forEach(hide); bareFloor(this.stage.root, x, z); }
            return this.labActs.length;
          },
          foeLab: (kinds: string[], { gap = 2.8, z = 1.5 } = {}) => {
            if (!kinds.length) { if (foeStage) clear(); return 0; }
            const defs = kinds.map(id => {
              const def = ROSTER.find(model => model.id === id);
              if (!def) throw new Error('Unknown foe model: ' + id);
              return def;
            });
            clear();
            foeStage = this.stage?.root ?? scene;
            defs.forEach((def, i) => spawn(def, (i - (defs.length - 1) / 2) * gap, z, Math.PI / 2));
            bareFloor(foeStage, 0, z);
            scene.children.forEach(hide);
            return this.labActs.length;
          },
          foeLabSpeed: (v: number) => {
            if (!foeStage) return;
            const speed = Number.isFinite(v) ? Math.max(0, v) : 0;
            for (const a of this.labActs) a.setRunning(speed > 0.6, speed);
          },
          foeLabAct: (i: number, name: string, dur?: number, at?: number) => {
            const a = foeStage ? this.labActs[i] : undefined;
            if (!a) return;
            a.dead = name === 'fall' || name === 'collapse';
            if (dur === undefined && at === undefined) {
              if (name === 'attack') return a.attack();
              if (name === 'cast') return a.cast();
              if (name === 'hurt') return a.hurt();
              if (name === 'fall') return a.fall();
              if (name === 'collapse') return a.collapse();
              if (name === 'roar') return a.roar();
            }
            const variant = /^(wl|cx)_/.test(a.def.id) && !['attack', 'cast', 'hurt', 'fall', 'collapse', 'roar'].includes(name);
            const impact = at ?? (name === 'cast' || name === 'fall' ? 0.6 : name === 'hurt' ? 0.1 : name === 'roar' ? 0.35 : namedImpact[name] ?? 0.5);
            return a.play(new Action(variant ? 'attack' : name, dur ?? 1.2, impact, variant ? { atk: name } : {}));
          },
          foeLabHurtFrom: (i: number, angleRad: number) => {
            const a = foeStage ? this.labActs[i] : undefined;
            if (a && Number.isFinite(angleRad)) { a.dead = false; return a.hurt(1.4, angleRad); }
          },
        };
      })(),
      lab: () => this.labActs,
      /** 11-19: the foes' slide round a prop they're stuck on (on by default) */ unstick: (on = true) => { UNSTICK.on = on; return on; },
      /** 11-19: the locomotion state of lab actor i (to drive a walk on the lab floor) */ motionOfLab: (i: number) => motionOf(this.labActs[i]),
      /** the cutscene poses, for the lab: drape(i, x, y, z, yaw, ph), getUp(i, k) */
      /** the colour grade / bloom settings, for lab checks */ grade: GRADE,
      labPose: { drape: (i: number, x: number, y: number, z: number, yaw: number, ph: number) => drapeOver(this.labActs[i], x, y, z, yaw, ph), getUp: (i: number, k: number) => getUpPose(this.labActs[i], k),
        /** 11-18: the prologue's kneel on lab actor i, running every frame (reach 0..1, dawn = the planted sabre, no bleeding) */
        /** the kneel's arm angles, live (fitting the hands) */ kneelArms: KNEEL_ARMS,
        kneel: (i: number, o: { reach?: number; dawn?: boolean } = {}) => { const a = this.labActs[i], k = new Kneel(); if (!a) return null; if (o.dawn) k.dawn(); else k.start(); k.reachWant = o.reach ?? 0; this.labFn = dt => { a.update(dt); k.frame(a); }; this.labT = 0; return k; } },
      /** world positions of an actor's bones (rounded to cm), to check a pose by numbers */
      labBones: (i: number) => { const a = this.labActs[i]; if (!a) return null; a.root.updateMatrixWorld(true); const o: Record<string, number[]> = {}, v = new THREE.Vector3();
        for (const [k, b] of Object.entries(a.bones)) { if (!b) continue; (b as THREE.Object3D).getWorldPosition(v); o[k] = [v.x, v.y, v.z].map(n => Math.round(n * 100) / 100); } return o; },
      labTick: (fn: ((dt: number, t: number) => void) | null) => { this.labFn = fn; this.labT = 0; },
      /** captures (act-41): any item / card ids as cards (a boon's own card if it is one, else a plain card carrying that item) */ itemCards: (ids: string[]) => { void this.cards.close?.(); void this.cards.open(ids.map((id, i) => ({ boon: BOONS.find(b => b.id === id) ?? ({ id, school: 'ms' as never, name: id, desc: [id, ''], col: '#ffd27a', glyph: BOONS[0].glyph, tag: '' } as Boon), tier: i % 3 }))); },
      /** 11-18 captures: a 刀谱 pick (these, or three not learnt yet) as in a run — take one, it flies to its button, the ghost plays it */
      manualsOf: (ids?: string[]) => { const list = ids ? ids.map(id => MANUALS.find(m => m.id === id)).filter((m): m is (typeof MANUALS)[number] => !!m) : null; void (list ? this.pickManuals(list) : this.manualPick()); },
      /** 11-18: play a 刀谱's demonstration now */ demo: (id: string) => this.demoMove(id),
      /** 11-18: the HUD's marks as if these were taken (ids: 'm:keep', 'b:quick:2') */ take: (ids: string[]) => { for (const s of ids) { const [k, id, t] = s.split(':'); if (k === 'm') this.perks.moves[id] = true; else applyBoon(this.perks, id, +(t ?? 0)); } this.syncMarks(); },
      boon: (id: string, tier = 0) => applyBoon(this.perks, id, tier), // wp/boons: browser effect checks
      /** 11-18 captures: exactly these boons at this tier (the old ones dropped); the hero reads this.perks */ boons: (ids: string[], tier = 0) => { this.perks.owned = {}; for (const id of ids) applyBoon(this.perks, id, tier); this.hero.perks = this.perks; return Object.keys(this.perks.owned); },
      intent: (n = 3) => { this.intent = Math.max(0, Math.min(3, n)); this.hud.intent = this.intent; },
      qi: (n?: number) => { if (n != null) this.hero.qi = Math.max(0, Math.min(Hero.QI_MAX, n)); return this.hero.qi; },
      untaught: () => { try { localStorage.removeItem('ub.taught'); } catch { /* */ } this.taught = null; },
      prologue: (n = 1) => { this.startPrologue(); if (n >= 2) { after(0.3, () => { this.prologue = 2; this.proFightT = 0; this.plan = { type: 'boss', locale: 'hj_temple', reward: null, waves: [['hj_boss']] }; this.locale = 'hj_temple'; this.room = 1; this.buildRoom(false); }); } },
      sfx: () => ({ ready: audio.ready, all: audio.buf.size, loaded: [...audio.buf.keys()].filter(k => /^ub_(hit|vo|sw)_/.test(k)), muted: audio.muted, ctx: audio.ctx ? audio.ctx.state : 'none', recent: audio.recent.slice() }), unlockAudio: () => audio.unlock().then(() => audio.loading).then(() => audio.ready),
      cam: (b: number[] | null, l?: number[], fov = 30) => { this.camOverride = b ? { base: V3(b[0], b[1], b[2]), look: V3(l![0], l![1], l![2]), fov } : null; },
      press: (n: 'attack' | 'dash' | 'special' | 'jump', ms = 80) => { this.inp.hold(n, ms / 1000); },
      unpress: (n: 'attack' | 'dash' | 'special' | 'jump') => { this.inp.unhold(n); },
      stick: (x: number, y: number, ms = 300) => { this.inp.push(x, y, ms / 1000); },
      // captures: hold a lineup model in a locomotion state (run 0..1 at a stride phase, height off the ground…) or play it an action
      motion: (i: number, m: Record<string, number>) => { const a = this.lineupActors[i]; if (a) Object.assign(motionOf(a), m); },
      /** 11-18: how far her planted foot slides (cm per step) walking at v m/s with run r and the stride phase advancing at rate rad/s —
       *  the scripted walks in the cutscenes set these three themselves; a real walk is ~0 */
      /** 11-18: her feet relative to her root over one stride cycle at run r (ph 0..2π): z (forward, cm) and height (cm) of each */
      footCycle: (r: number, n = 16) => {
        const h = this.hero; if (!h) return null; const a = h.a, m = motionOf(a), V = THREE.Vector3, out: number[][] = [];
        for (let i = 0; i < n; i++) { m.run = r; m.phase = (i / n) * Math.PI * 2; a.update(1 / 60); a.root.updateMatrixWorld(true);
          const L = a.root.worldToLocal(a.bones.footL.localToWorld(new V(0, -0.03, 0.02))), R = a.root.worldToLocal(a.bones.footR.localToWorld(new V(0, -0.03, 0.02)));
          out.push([i, Math.round(L.z * 100), Math.round(L.y * 100), Math.round(R.z * 100), Math.round(R.y * 100), a.act ? 1 : 0]); }
        m.run = 0; return out;
      },
      footSlide: (v: number, r: number, rate: number, secs = 3) => {
        // the slip: while a foot is down (within 1.5 cm of the lowest a foot gets), how fast it moves over the ground (cm/s, averaged)
        const h = this.hero; if (!h) return null; const a = h.a, m = motionOf(a), V = THREE.Vector3, p0 = a.home.clone(), yaw = a.yaw;
        const fw = new V(Math.sin(yaw), 0, Math.cos(yaw)), dt = 1 / 60, rec: Array<[number, number, number, number]> = [];
        for (let t = 0; t < secs; t += dt) {
          a.home.addScaledVector(fw, v * dt); m.run = r; m.phase += rate * dt; a.update(dt); a.root.updateMatrixWorld(true);
          for (const [i, n] of [[0, 'footL'], [1, 'footR']] as const) { const q = a.bones[n].localToWorld(new V(0, -0.03, 0.02)); rec.push([i, q.x, q.y, q.z]); }
        }
        a.home.copy(p0); m.run = 0;
        // each frame the lower foot is the one carrying her: its speed over the ground (same foot as the frame before)
        let slip = 0, n = 0, prev = -1, px = 0, pz = 0;
        for (let k = 0; k + 1 < rec.length; k += 2) { const L = rec[k], R = rec[k + 1], c = L[2] <= R[2] ? L : R;
          if (c[0] === prev) { slip += Math.hypot(c[1] - px, c[3] - pz) / dt; n++; } prev = c[0]; px = c[1]; pz = c[3]; }
        return { slipCmS: Math.round(slip / Math.max(1, n) * 100) };
      },
      lplay: (i: number, name: string, dur = 0.5, at = 0.5) => { this.lineupActors[i]?.play(new Action(name, dur, at)); },
      // tests: an arrow from d metres in front of the hero, flying at it
      // agents / captures: a fight-less room in one place (the scene builders check their place with it) — returns the assembler's report
      scene: (id: string, seed?: number, o: Partial<Spec> = {}) => { this.viewSpec = { ...o, locale: id, ...(seed != null ? { seed } : {}) }; this.room = 0; this.locale = id; this.buildRoom(true); this.viewSpec = null; const r = this.lastReport; return r ? { name: r.name, spec: r.spec, placed: r.placed.length, rejected: r.rejected.map(x => x.id + ':' + x.issues.map(i => i.kind).join('/')), empty: r.empty, warnings: r.warnings, lights: r.lights } : null; },
      // 11-18 屋子形态 (captures / tests): a fight room of this place in this shape (the next rooms pick their own again); null = pick
      /** 11-18 定死的屋子: the room's puzzle pieces and their state; solve one */
      puzzle: () => this.pieces?.list() ?? [], solve: (i: number) => this.pieces?.solve(i),
      /** 11-18 小刀转场: play the loading blade over the current view while a pretend load takes ms (it is drawn every frame in the web build too) */
      bladeBusy: () => bladeBusy(),
      bladeTimes: () => bladeTimes.map(m => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Math.round(v)]))),
      bladeDemo: (ms = 800, cover: 'bamboo' = 'bamboo') => withLoadingBlade(() => new Promise<void>(r => setTimeout(r, ms)), cover),
      /** 11-18 定死的屋子: enter this drawn room (asm/roomMaps.ts id) with its actual region's waves, boss or stations */
      room: (id: string, type?: RoomType) => {
        const m = MAP_BY_ID[id]; if (!m) return null;
        const ri = REGIONS.findIndex(r => r.locales.includes(m.locale) || r.bossLocale === m.locale);
        if (ri < 0) return null;
        const visit = m.kind === 'boss' ? 'boss' : m.kind === 'calm' ? (type === 'rest' || type === 'boon' ? type : 'shop') : type === 'elite' ? 'elite' : 'fight';
        this.forceMap = id;
        try {
          const result = this.jumpRegion(ri, 1, visit);
          if ('why' in result) return result;
          const sp = this.arena?.shape; return sp ? { id: sp.fixed?.id, box: sp.box, exits: this.spec?.exits } : null;
        } finally { this.forceMap = null; }
      },
      shape: (id: ShapeId | null, locale = 'hj_village', seed?: number) => {
        this.startRun(); this.forceShape = id; this.locale = locale; if (this.plan) this.plan.locale = locale; if (seed != null) this.forceSeed = seed;
        this.room = 1; this.buildRoom(false); this.forceShape = null; this.forceSeed = null;
        const sp = this.arena?.shape; return sp ? { id: sp.id, name: SHAPE_CN[sp.id], box: sp.box, solid: sp.solid, pits: sp.pits, bridges: sp.bridges, floor: this.grid?.floorCount() ?? 0 } : { id: 'square' };
      },
      grid: () => this.grid,
      // agents / captures: a foe of any kind at (x, z), facing the hero (elite: the stronger variant, where the kind has one)
      spawn: (kind: EKind, x = 0, z = -2, elite = false) => { const f = spawnFoe(kind, V3(x, 0, z), this.hero.pos.clone(), elite); /* wp/foes: elite into spawnFoe */ f.st = 'move'; this.foes.push(f); return f.uid; },
      // 11-18 QTE: 拼刀 ('clash') / 连环破势 ('chain') against the nearest elite / boss at once (captures); what they did
      qte: (kind: 'clash' | 'chain' = 'clash') => this.duel.force(kind), qteStats: () => this.duel.state,
      arrow: (d = 6) => { const h = this.hero, f = h.a.fwd(), p = h.pos.clone().addScaledVector(f, d).setY(1.25); this.arrows.push(new Arrow(p, Math.atan2(-f.x, -f.z), 8)); },
      // captures: every costume in a row facing the camera (the hero hidden), or gone again
      // any models by id (foes, the hideout's people…) standing in a row facing the camera (captures of model work); [] clears
      models: (ids: string[], z = 1.0, gap = 1.6, yaw = 0, x0?: number) => {
        for (const a of this.lineupActors) a.dispose(); this.lineupActors = [];
        const list = ids.map(id => ROSTER.find(d => d.id === id)).filter((d): d is ModelDef => !!d);
        list.forEach((d, i) => { const a = new BattleActor(d); const x = (x0 ?? -(list.length - 1) / 2 * gap) + i * gap; a.place(V3(x, 0, z), yaw); a.yaw = yaw; this.lineupActors.push(a); });
        if (this.hero && list.length) this.hero.pos.set(0, 0, -6);
        return list.map(d => d.id);
      },
      // 11-18: any bestiary models in a row in front of her (foe models under construction): ids, the action to loop ('' = idle)
      foeLineup: (ids: string[], z = 1.6, gap = 1.6, act = '') => { for (const a of this.lineupActors) a.dispose(); this.lineupActors = []; ids.forEach((id, i) => { const a = new BattleActor(id); const x = (i - (ids.length - 1) / 2) * gap; a.place(V3(x, 0, z), 0); a.yaw = 0; this.lineupActors.push(a); if (act) a.play(new Action(act, 1.2, 0.5)); }); return this.lineupActors.length; },
      lineup: (on = true, z = 2.4, gap = 1.5, act = '', ids: string[] | null = null) => {
        for (const a of this.lineupActors) a.dispose(); this.lineupActors = [];
        if (this.hero && on) this.hero.pos.set(0, 0, -3.5);
        if (!on) return;
        const list = ids ? HEROES.filter(d => ids.includes(d.id)) : HEROES;
        list.forEach((d, i) => { const a = new BattleActor(d); const x = (i - (list.length - 1) / 2) * gap; a.place(V3(x, 0, z), 0); a.yaw = 0; this.lineupActors.push(a); if (act) a.play(new Action(act, 0.9, 0.5)); });
      } });
    // a soft dark spot under the hero while it is off the ground: shows where it will land
    // contact shadows: a soft dark spot under every fighter's feet (act-08 用户：「角色都有点没有踩在地上」 — the sun's shadows fall
    // well off to one side, so nothing dark touched the feet); the hero's also marks where a jump lands
    this.blob = contactShadow(); this.blob.visible = false; scene.add(this.blob);
    // act-27: an aimed dart's line on the ground — pale, gold when it will bend onto a foe; a square cap at the end
    { const m = new THREE.MeshBasicMaterial({ color: 0xe8eeff, transparent: true, opacity: 0.9, depthWrite: false });
      const g = new THREE.PlaneGeometry(0.11, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5); this.aimLine = new THREE.Mesh(g, m);
      // a dark band under it so it reads on the pale loess floors
      const under = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 1).rotateX(-Math.PI / 2).translate(0, -0.005, 0.5), new THREE.MeshBasicMaterial({ color: 0x1a1620, transparent: true, opacity: 0.45, depthWrite: false })); this.aimLine.add(under);
      const cap = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28).rotateX(-Math.PI / 2), m); cap.position.z = 1; cap.name = 'cap'; this.aimLine.add(cap);
      this.aimLine.visible = false; this.aimLine.renderOrder = 4; scene.add(this.aimLine); }
    // the charge ring under the hero: a gold arc that grows round with the charge
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.74, 48, 1, 0, 0.01).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffc848, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }));
    this.ring.renderOrder = 3; this.ring.visible = false; scene.add(this.ring);
    this.qteW = new THREE.Mesh(new THREE.RingGeometry(0.92, 1.0, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    this.qteW.renderOrder = 3; this.qteW.visible = false; scene.add(this.qteW);
    // browsers only let sound start after a touch or a key: the first input starts the music (a touch also comes through the platform:
    // unlockAudio)
    if (typeof window !== 'undefined') { const unlock = () => this.unlockAudio(); window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock); }
    if (!deferStart) this.startWithAudio();
    installR45(this);
  }
  /** act-19: the music for where we are — the opening, the yard, or the room's kind (a fight, a 死士 room, the 渠帅, a calm room);
   *  the same track carries on across rooms, a different one cross-fades in */
  private musicHold: string | null = null;
  /** act-44: the animation lab's actors and per-frame hook (debug only) */
  private labActs: BattleActor[] = []; private labFn: ((dt: number, t: number) => void) | null = null; private labT = 0;
  /** act-40: the foes' shouts over their heads */
  private barks: Barks | null = null;
  /** the first touch / key starts the sound. 11-18 微信小游戏 (act-65 on a phone: a picture, no sound): this hung only on `window`'s
   *  pointerdown / keydown, and a mini-game has no `window` — the platform's own touches start it now (WeChat's wx.onTouchStart);
   *  later touches resume a context the system paused (a call, the app sent to the background) */
  private unlockAudio() {
    if (this.audioOn) { const c = audio.ctx; if (c && c.state === 'suspended') void Promise.resolve(c.resume()).catch(() => { /* still paused */ }); return; }
    this.audioOn = true;
    audio.unlock().then(() => this.music()).catch(e => { this.audioOn = false; console.error('[audio] the sound would not start:', e); });
  }
  music() {
    if (!this.audioOn) return;
    // (act-37: a scored piece holds until its scene is over; the prologue's temple fight has its own; the hideout is the kiln's)
    if (this.musicHold) { void audio.playMusic(this.musicHold, 1.2); return; }
    void audio.playMusic(this.musicName(), 1.8);
  }
  /** the track for where we are now (music() plays it; a mini-game decodes it at boot, before the first touch asks for it) */
  private musicName() {
    if (this.musicHold) return this.musicHold;
    const t = this.plan?.type ?? 'fight', ph = this.phase as string;
    // (11-18: a region's own fight / boss track, from the songs there are — REGIONS[…].music)
    const rm = REGIONS[this.region]?.music;
    return ph === 'opening' || ph === 'title' ? 'bgm_opening' : this.room < 0 || ph === 'yard' ? 'bgm_yard' : this.prologue === 2 ? 'bgm_boss' : t === 'boss' ? rm?.boss ?? 'bgm_boss' : t === 'elite' ? 'bgm_elite' : t === 'shop' || t === 'rest' || t === 'boon' ? 'bgm_calm' : rm?.fight ?? 'bgm_battle';
  }
  layout2() {
    const s = this.platform.canvasSize(), dpr = Math.min(this.platform.dpr(), 2);
    this.L.resize(s.w, s.h, dpr); this.ov.resize(s.w, s.h, dpr); this.hud.layout(s.w, s.h);
  }
  // ------------------------------------------------------------ rooms
  startWithAudio() {
    const ready = this.start();
    // start() selects the title, yard or fight synchronously, so preload its
    // music alongside the scenery even when preparing the scene takes frames.
    if (!HAS_DOM) audio.prepare({ warm: [this.musicName()], prefetch: true });
    return ready;
  }
  start() {
    dh.add({ opening: () => this.opening(), title: (n = 1) => this.title(n) });
    dh.add({ rack: (n = 30) => { if (this.stage) this.stage.root.add(rackBlades(n)); return n; } });   // captures: the hideout's rack with n blades   // captures: the old opening / a title variant again
    if (!__DEBUG_UI__) { this.title(savedTitle()); return; }   // (the packages: no URL switches — the title the player gets)
    // ?lab, or the desktop model page (window.__LAB): the model viewer (lab.ts, act-21)
    if (typeof window !== 'undefined' && ((window as unknown as { __LAB?: number }).__LAB || /[?&#]lab\b/.test(location.href))) { this.lab(); return; }
    // 11-18 ?anim, or the desktop page (window.__ANIM): every character's moves side by side (animPreview.ts)
    if (HAS_DOM && ((window as unknown as { __ANIM?: number }).__ANIM || /[?&#]anim\b/.test(location.href))) { this.animPreview(); return; }
    // ?model (vox/打开游戏看效果.bat): straight into the hideout, the camera close behind her — for checking a model edited in MagicaVoxel
    if (typeof location !== 'undefined' && /[?&#]model\b/.test(location.href)) { Object.assign(TUNE, { camH: 7.5, camD: 10.5, camFov: 34 }); return this.enterYard(); }
    const tn = wantTitle();
    if (typeof location !== 'undefined' && /[?&#]run\b/.test(location.href)) return this.startRun(); else if (tn) return this.title(tn); else if (wantOpening()) return this.opening(); else return this.enterYard();
  }
  /** 开始画面 (title.ts, act-20): a wide shot of one of the place / weather variants with the menu (开始游戏 / 继续游戏 / 设置);
   *  the title builds its own place and poses its own heroine while frame() idles; the choice cuts into startNewGame / continueGame */
  title(n = 1) {
    try { localStorage.setItem('ub.title', String(n)); } catch { /* storage blocked */ }   // the last one shown opens next time
    // a room may be up (__dh.title from the yard): its actors go the way a room change sends them
    this.propContacts?.dispose(); this.propContacts = undefined;
    this.foeContacts?.dispose(); this.foeContacts = undefined;
    this.duel?.newRoom(); for (const f of this.foes) f.a.dispose(); this.foes.length = 0; for (const a of this.arrows) a.kill(); this.arrows.length = 0; for (const w of this.waves) w.kill(); this.waves = []; for (const d of this.darts) d.kill(); this.darts = []; this.entering.length = 0;
    this.yard?.dispose(); this.yard = null; this.props?.dispose(); this.props = null; this.gates?.dispose(); this.gates = null; this.pieces?.dispose(); this.pieces = null; this.leaves?.dispose(); this.leaves = null; this.stations?.dispose(); this.stations = null; this.hero?.a.dispose();
    this.clearNpcs();
    this.phase = 'title'; this.hud.on = false; this.hud.update(0, this.inp, []); this.banner.hide(); this.blob.visible = false; this.ring.visible = false; for (const m of this.shadows) m.visible = false;
    const titleReady = playTitle(n, { ov: this.ov, L: this.L, hasSave, settings: () => this.pause.open('set', { fromTitle: true }), enter: k => { this.hud.on = true; if (k === 'continue') return this.continueGame(); void this.startNewGame(); } });
    this.music();
    // (before the title's first frame: the page is still dark and loading then — a frozen first picture with the snow hanging in the
    //  air would read as a hang)
    if (!__WX__) this.prefetchNewGame();
    return titleReady;
  }
  /** act-34 (用户：「开场那个一砍变成两半的效果本来很牛逼，结果卡住半天才揭开」): the first room of a new game took ~6 s to build in
   *  the frame the title split, so the split stood still that long. It is built now, while the title loads (the page is still
   *  coming up), off the live scene; the split only puts it up. (Continue goes to the hideout, which is quick to build.) */
  private prefetchNewGame() {
    this.pre?.prep.drop(); this.pre = null;
    const keep = stageNow();
    try {
      // act-37: a new game opened on 寒山坞 (the cold open); act-40: with the cold open as black cards, the snowy village of 「七年后」 is
      // the first place again — built now, exactly as startPrologue will ask for it
      if (COLD_AS_CARDS) { const r = prepRoom(this.prologueRoomIn()); this.pre = { ...r, locale: PRO_ROOM.locale }; warm(r.prep.root); }
      else { const r = prepRoom(COLD_ROOM); this.pre = { ...r, locale: 'hs_forge' }; warm(r.prep.root); }
    } catch (e) { console.warn('[act] prefetch failed', e); }
    setStage(keep.big, keep.k);
  }
  /** 模型查看页 (lab.ts, act-21, user: 「建模个白发女给我看看，在一个页面里看，带技能动作的」): the hideout's 试剑坪, the fine white-haired
   *  heroine before a dummy, a panel of moves (real button presses), views, the 2x pixels, the 7 cm model to switch to or stand beside.
   *  The look chosen here is not remembered (the game's own costume stays as it was). */
  private labOn = false; private labCmp: BattleActor | null = null; private labDummy: Foe | null = null; private labHome: () => void = () => {};
  lab() {
    this.labOn = true;
    const fine = HEROES.find(d => d.id === 'fine_white'); if (fine) this.wearing = fine;
    this.enterYard(); this.banner.hide();
    // the open middle of the yard (the 试剑坪's posts got in front of every camera), her own dummy 1.4 m ahead
    const HOME = { x: 0.9, z: 0.9, yaw: Math.PI };
    { const f = spawnFoe('dummy', V3(HOME.x, 0, HOME.z - 1.4), V3(HOME.x, 0, HOME.z)); f.st = 'move'; this.foes.push(f); this.labDummy = f; }
    const home = () => { const h = this.hero; if (!h) return; h.pos.set(HOME.x, 0, HOME.z); h.vel.set(0, 0, 0); h.a.yaw = HOME.yaw; for (const a of this.arrows) a.kill(); this.arrows.length = 0; };
    this.labHome = home;
    after(0.1, () => { home(); this.banner.hide(); });
    openLab({
      home,
      hold: (b, sec) => this.inp.hold(b, sec),
      stick: (x, y, sec) => this.inp.push(x, y, sec),
      cam: (b, l, fov = 30) => { this.camOverride = b ? { base: V3(b[0], b[1], b[2]), look: V3(l![0], l![1], l![2]), fov } : null; },
      hero: () => ({ x: this.hero.pos.x, y: this.hero.y, z: this.hero.pos.z, yaw: this.hero.a.yaw }),
      other: () => (this.labCmp ? { x: 2.35, z: 0.9 } : null),
      // (side by side: she goes back to her mark; the dummy steps aside so it isn't in front of either)
      model: () => this.wearing.id,
      setModel: id => { const d = HEROES.find(x => x.id === id); if (!d) return; this.wearing = d; this.hero?.setModel(d); if (this.labCmp) { this.labCompare(false); this.labCompare(true); } },
      compare: on => this.labCompare(on),
      pixel: on => { if (on != null) setPixel(on); return PX.on; },
      arrow: d => { const h = this.hero, f = h.a.fwd(), p = h.pos.clone().addScaledVector(f, d).setY(1.25); this.arrows.push(new Arrow(p, Math.atan2(-f.x, -f.z), 8)); },
      intent: n => { this.intent = n; this.hud.intent = n; },
      stats: () => (dh.api.stats as () => { calls: number; tris: number })(),
    }, [{ id: 'fine_white', name: '白发（细格子）' }, { id: 'fine_hat', name: '斗笠（细格子）' }, { id: 'slim_white', name: '白发（7 厘米旧版）' }]);
  }
  /** 11-18 动作预览 (用户：「其他角色我看不到，能不能给我做一个网页我整体预览一下」): the hideout's people and each region's enemies on
   *  a bare floor, side by side — walk, run, attack, hurt, fall, from any side, slowed down (animPreview.ts) */
  animPreview() {
    this.labOn = true; this.enterYard(); this.banner.hide(); this.hud.on = false; this.noTalk = true;
    const home = { x: this.hero.pos.x, z: this.hero.pos.z };
    const reg = (pre: string) => ROSTER.filter(d => d.id.startsWith(pre)).map(def => ({ def, npc: false, name: def.name + (def.group === '精英' && !def.name.includes('精英') ? '·精英' : def.group === '首领' ? '·头目' : '') }));
    const people = [...Object.values(HIDEOUT_PEOPLE), HIDEOUT_DONKEY].map(def => ({ def, npc: true, name: def.name }));
    after(0.2, () => { this.hero.a.root.visible = false; this.banner.hide(); });
    openAnimPreview({ home, make: def => new BattleActor(def), cam: (b, l, fov = 30) => { this.camOverride = b ? { base: V3(b[0], b[1], b[2]), look: V3(l![0], l![1], l![2]), fov } : null; } },
      [{ name: '据点的人', items: people }, { name: '第一关 · 黄巾', items: reg('hj_') }, { name: '第二关 · 洛阳', items: reg('ly_') }, { name: '第三关 · 下邳', items: reg('xp_') },
       { name: '第四关 · 乌林', items: reg('wl_') }, { name: '第五关 · 崔府', items: reg('cx_') }]);
  }
  /** the other model standing beside her (not moving), for a side-by-side look */
  private labCompare(on: boolean) {
    if (this.labCmp) { this.labCmp.dispose(); this.lineupActors = this.lineupActors.filter(a => a !== this.labCmp); this.labCmp = null; }
    const d = this.labDummy; if (d) { d.pos.set(on ? -1.6 : 0.9, 0, on ? -1.2 : -0.5); d.a.place(d.pos.clone(), d.a.yaw); }
    if (!on) return;
    this.labHome();
    const other = HEROES.find(d => d.id === (this.wearing.id === 'slim_white' ? 'fine_white' : 'slim_white')); if (!other) return;
    const a = new BattleActor(other); a.place(V3(2.35, 0, 0.9), Math.PI); a.yaw = Math.PI; this.labCmp = a; this.lineupActors.push(a);
  }
  /** 开场「雨夜听雨」(opening.ts): the room builder lays the rain road (clearing whatever room was up), then the opening poses this
   *  hero by hand while frame() idles; the tap cuts into the yard. Only the first entry plays it (a run ends in enterYard). */
  async opening() {
    this.viewSpec = { ...OPENING_SPEC }; this.room = 0; this.locale = OPENING_SPEC.locale; const loading = this.buildRoom(true); if (loading) await loading; this.viewSpec = null;
    this.phase = 'opening'; this.hud.on = false; this.hud.update(0, this.inp, []); this.banner.hide(); this.blob.visible = false; for (const m of this.shadows) m.visible = false;
    void playOpening({ actor: this.hero.a, stage: this.stage!, ov: this.ov, enter: () => { this.hud.on = true; return this.enterYard(); }, soundOn: () => this.audioOn });
  }
  /** the training yard: dummies, summon slabs, the costume rack, the way out to a run */
  enterYard() {
    this.unscaleFoes();
    TUNE.dartCharges = 3; TUNE.aggression = 0.85; this.mods = { dmgMul: 1, dartBonus: 0, hpBonus: 0, deathDefy: 0, startIntent: 0, windupMul: 1, startManual: false };
    if (this.banked) { const b = this.banked, alive = this.lastWon; this.banked = null; const [title, sub] = HAUL[alive ? 0 : 1]; after(0.6, () => this.banner.show(title, format(sub, { iron: b.iron, herb: b.herb }), 2.4, '#ffd27a')); }
    this.musicHold = null;
    if (this.justDied) { after(0.3, () => cue('stingRevive', 1)); }
    if (this.justDied) { this.justDied = false; const who = (['duwu', 'sunao', 'fengtiebi'] as const)[Math.floor(Math.random() * 3)]; after(1.0, () => { if (this.phase === 'yard') void this.talk(deathLine(who)); }); }
    this.intent = 0; this.hud.intent = 0;
    this.perks = newPerks(); this.room = -1; this.kills = 0; this.locale = 'ninja_wilds'; this.recent = []; this.plan = null; this.demo.stop(); this.syncMarks();
    TUNE.heroHp = 100; return this.buildRoom(true);
  }
  /** 11-18 一局五关 (用户：「你帮我在调试面板加一个快速切关，我好测试关卡」): a new run that starts in region n's room `room` (0 = its
   *  first room; REGIONS[n].rooms = its boss room) of the given kind — from the title, the hideout or mid-run (the tune panel's 快速切关,
   *  __dh.region / __dh.boss). Not while a cutscene or a talk is playing (they go on awaiting their own next steps) */
  private benchmarking = false;
  private async bench(tiers: Tier[] = ['high', 'mid', 'low']) {
    if (this.benchmarking || this.pause.on || this.timeline.on || this.dialogue.on || this.cards.on) throw Error('Finish the current scene before benchmarking');
    this.benchmarking = true;
    const random = Math.random, oldQuality = { ...QUALITY }, choice = QUALITY.choice, god = this.god, bot = this.botOn, result: Partial<Record<Tier, unknown>> = {};
    try {
      if (this.phase === 'title') stopTitle();
      this.hud.on = true; this.prologue = 0; this.god = true; this.botOn = false;
      for (const tier of tiers) {
        let seed = 4101;
        Math.random = () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; };
        setQuality(tier, false);
        this.region = 0; this.room = 1; this.locale = 'hj_village'; this.forceMap = 'crossroads'; this.forceSeed = 4101;
        this.forceSpec = this.viewSpec = null; this.noArena = false;
        this.plan = { type: 'fight', locale: this.locale, reward: null, waves: [['hj_blade','hj_blade','hj_blade','hj_blade','hj_archer','hj_archer','hj_brute','hj_brute']] };
        await this.buildRoom(true);
        const deadline = performance.now() + 90000;
        while (this.foes.length !== 8 || this.entering.length || this.phase !== 'fight') {
          if (performance.now() > deadline) throw Error('Eight benchmark enemies did not enter');
          await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        }
        const entry = this.arena!.shape!.enter, x = entry[0], z = entry[1];
        this.hero.pos.set(x, 0, z); this.hero.vel.set(0,0,0);
        this.foes.forEach((foe, i) => {
          const a = Math.PI * (i + 0.5) / 8, pos = this.grid!.nearestFloor(x + 4 * Math.cos(a), z - 4 * Math.sin(a));
          foe.pos.set(pos[0], 0, pos[1]); foe.vel.set(0,0,0);
        });
        this.camOverride = { base: V3(x, 12, z + 12), look: V3(x, 0, z), fov: 36 };
        for (const foe of this.foes) foe.hp = foe.maxHp = 100000;
        let nextSwing = 0;
        result[tier] = await measureFight(seconds => {
          const offset = 2.5 * Math.sin(seconds * Math.PI / 10);
          this.camOverride!.base.x = x + offset;
          this.camOverride!.look.x = x + offset;
          if (seconds >= nextSwing) { this.inp.hold('attack', 0.10); nextSwing += 0.8; }
        });
      }
      return result;
    } finally {
      Math.random = random; this.forceMap = this.forceSeed = null; this.camOverride = null;
      this.god = god; this.botOn = bot; this.benchmarking = false;
      QUALITY.auto = oldQuality.auto; QUALITY.reducedWorld = oldQuality.reducedWorld; setQuality(choice, false); QUALITY.drops = oldQuality.drops;
      await this.enterYard();
    }
  }
  jumpRegion(n: number, room = 0, type: RoomType = 'fight') {
    if (this.phase === 'cine' || this.phase === 'talk' || this.phase === 'opening' || this.timeline.on || this.dialogue.on) return { why: '演出 / 对话还在放，放完再切' };
    if (this.phase === 'title') { stopTitle(); this.hud.on = true; }
    if (this.cards.on) void this.cards.close?.();
    this.prologue = 0; this.forceSpec = null; this.viewSpec = null; this.noArena = false;
    this.startRun(false); const ri = Math.max(0, Math.min(REGIONS.length - 1, n)); this.region = ri; this.scaleFoes(ri);
    const boss = type === 'boss' || room >= REGIONS[ri].rooms; room = boss ? REGIONS[ri].rooms : room;
    this.plan = boss ? roomOf('boss', room, Math.random, ri) : room === 0 && type === 'fight' ? regionFirstRoom(ri, Math.random) : roomOf(type, room, Math.random, ri);
    this.locale = this.plan.locale; this.room = room; this.regionIn = ri > 0 && room === 0; this.buildRoom(false);
    return { region: REGIONS[ri].id, room: this.room, locale: this.locale, waves: this.plan.waves };
  }
  startRun(build = true) {
    this.maps = [];
    this.intent = 0; this.hud.intent = 0;
    this.perks = newPerks(); this.room = 0; this.kills = 0; this.recent = []; this.demo.stop(); this.syncMarks();
    this.plan = firstRoom(Math.random); this.visited = []; this.coins = 0; this.locale = this.plan.locale;
    // 11-18 一局五关: the first region; the TUNE values the regions scale from (the tune panel's, as the run starts)
    this.region = 0; this.bosses = 0; this.regionIn = false; this.baseFoe = { hp: TUNE.enemyHp, dmg: TUNE.enemyDmg, aggression: 0.85, calm: TUNE.atkCalm, attackers: TUNE.maxAttackers };
    // act-20: the hideout's upgrades (meta.ts) for this run
    this.mods = runMods(profile()); this.defy = this.mods.deathDefy; this.eliteKills = 0; this.bossKilled = false;
    // 杜五's provisions (one run): 炙肉胡饼 +15 血上限, 五铢钱囊 40 铜钱, 瓦壶烈酒 the first blow costs nothing
    { const p = profile(), meal = p.meal; p.meal = undefined; saveProfile(); this.wine = meal === 'wine';
      if (meal === 'feast') this.mods.hpBonus += 15; if (meal === 'purse') this.coins = 40; }
    TUNE.heroHp = 100 + this.mods.hpBonus; TUNE.dartCharges = 3 + this.mods.dartBonus; TUNE.aggression = 0.85 / this.mods.windupMul;
    this.baseFoe.aggression = TUNE.aggression; this.scaleFoes(0);
    const loading = build ? this.buildRoom(true) : undefined;   // (11-18: a jump to another region's room builds that one instead)
    const pick = () => { if (this.mods.startManual) after(1.4, () => { if (this.room === 0) void this.manualPick(); }); };
    if (loading) return loading.then(pick);
    pick();
  }
  /** put on another costume (the rack, or __dh.wear) and remember it */
  private wear(d: ModelDef) {
    this.wearing = d; try { localStorage.setItem('act.hero6', d.id); } catch { /* storage blocked */ }
    if (this.hud.flask instanceof IronHp) this.hud.flask.setFace(d.id); else HP_FACE.id = d.id;
    if (this.hero) this.hero.setModel(d);
  }
  private buildRoom(first: boolean) { return runRoomBuild(this.roomSteps(first)); }
  private *roomSteps(first: boolean): Generator<void | Promise<void>, void> {
    blood.clear();
    this.duel?.newRoom(); for (const f of this.foes) f.a.dispose(); this.foes.length = 0; for (const a of this.arrows) a.kill(); this.arrows.length = 0; for (const w of this.waves) w.kill(); this.waves = []; for (const d of this.darts) d.kill(); this.darts = []; this.entering.length = 0;
    this.falling = [];
    this.gates?.dispose(); this.gates = null; this.pieces?.dispose(); this.pieces = null; this.leaves?.dispose(); this.leaves = null; this.clearNpcs();
    for (const d of this.doors) d.g.parent?.remove(d.g); this.doors = []; this.stations?.dispose(); this.stations = null; this.coinsFx.clear();
    this.yard?.dispose(); this.yard = null; this.exitSign?.parent?.remove(this.exitSign); this.exitSign = null; this.barks?.clear();
    const hp = first || !this.hero ? TUNE.heroHp : this.hero.hp, maxHp = TUNE.heroHp, qi = first || !this.hero ? 0 : this.hero.qi;
    this.hero?.a.dispose();
    const isYard = this.room < 0;
    if (!isYard && this.plan && !this.viewSpec) this.visited.push(this.plan.type);
    this.nextRooms = !isYard && this.plan && !this.viewSpec ? doorsFrom(this.room, this.visited, Math.random, this.region) : [];
    // 11-18 一局五关: past a region's boss the road goes on into the next region's first room (the last region's boss ends the run)
    if (!isYard && this.plan && !this.viewSpec && !this.prologue && isBossRoom(this.region, this.room)) { const nx = afterBoss(this.region); this.nextRooms = nx === 'won' ? [] : [regionFirstRoom(nx, Math.random)]; }
    if (this.prologue === 1 && !this.viewSpec) this.nextRooms = [PRO_BOSS]; else if (this.prologue === 2) this.nextRooms = [];   // act-29
    // act-34: the place itself — built ahead of time when it can be (the title builds a new game's first room while it loads), else now
    // (11-18: a region's own look — 下邳 is always winter — unless the prologue or a view asks otherwise)
    const rspec = !isYard && !this.prologue ? REGIONS[this.region]?.spec ?? null : null;
    const want: RoomIn = { isYard, room: this.room, recent: this.recent, locale: this.locale, plan: this.plan, nextRooms: this.nextRooms, viewSpec: this.viewSpec, forceSpec: this.forceSpec, noArena: this.noArena, shape: this.forceShape, shapes: this.shapes, seed: this.forceSeed, map: this.forceMap, maps: this.maps, region: this.prologue ? undefined : this.region, regionSpec: rspec };
    const ready = this.pre && !isYard && !this.viewSpec && this.prologue === 1 && this.room === 0 && this.pre.locale === this.locale ? this.pre : null;
    if (this.pre && this.pre !== ready) this.pre.prep.drop();
    this.pre = null;
    const t0 = performance.now(), P = ready ?? (yield* prepRoomSteps(want)); this.buildMs = Math.round(performance.now() - t0);
    const spec = P.spec; this.recent.push(spec); this.spec = spec; this.pools = LOCALES[spec.locale]?.pools?.(spec.seed) ?? [];
    if (P.arena?.shape?.fixed) {
      this.locale = spec.locale;
      if (this.plan) this.plan = { ...this.plan, locale: spec.locale };
    }
    audio.setRoom(ROOM_VERB[this.locale] ?? (isYard ? ROOM_VERB.yard : [0.6, 0.12]));
    setStage(P.big, P.k); this.layout = P.layout; this.arena = P.arena; if (P.report) this.lastReport = P.report;
    // 11-18 屋子形态: the floor as a grid (the clamp, the foes' way round, the pits); the rectangle rooms have none
    this.grid = P.arena?.shape ? new FloorGrid(P.arena.shape) : null;
    { const g = this.grid; blood.skip = g ? (x, z) => g.at(x, z) === PIT : null; }
    if (P.arena?.shape && !this.viewSpec) this.shapes.push(P.arena.shape.id);
    if (P.arena?.shape?.fixed && !this.viewSpec) this.maps.push(P.arena.shape.fixed.id);
    if (isYard) { this.shapes = []; this.maps = []; }
    const big = P.big;
    this.stage = P.prep.attach();
    yield;
    if (isYard) Object.assign(PLAY, HIDEOUT.floor);   // act-20: the hideout 断碑古窑 (hideout.ts) is the yard now — its own stage and floor
    this.solids.clear(); this.props?.dispose(); this.props = null; this.botWp = 0;
    if (isYard) for (const so of HIDEOUT.solids) this.solids.add({ kind: 'prop', ...so });
    if (this.arena && this.stage) {
      // act-20: the cover pieces are breakable (Breakables builds them and their solids)
      this.props = new Breakables(this.stage.root, this.solids); yield* this.props.buildSteps(this.arena.props, this.arena.covers);
      // act-37: the snowy night's braziers (the prologue's village and temple): four warm points round the floor, where it is free
      // 11-18 (用户：「场景要有差异」): 崔府各间的灯由场景摆，雪夜的通用火盆会盖住冰色和石灯。
      if (spec.weather === 'snow' && spec.time === 'night' && !spec.locale.startsWith('cx_')) for (const [x, z] of [[PLAY.x0 + 1.6, PLAY.z0 + 1.8], [PLAY.x1 - 1.6, PLAY.z0 + 1.8], [PLAY.x0 + 1.6, PLAY.z1 - 3.2], [PLAY.x1 - 1.6, PLAY.z1 - 3.2]]) {
        const ok = (px: number, pz: number) => this.solids.free(px, pz, 0.6, 0.3) && (!this.grid || this.grid.clear(px, pz, 0.7));
        let px = x, pz = z; for (let t = 0; t < 8 && !ok(px, pz); t++) { px += (x < 0 ? 0.7 : -0.7); pz += 0.4; }
        if (!ok(px, pz)) continue;
        this.stage.root.add(brazier(px, pz)); this.solids.add({ kind: 'prop', shape: 'circle', x: px, z: pz, r: 0.42 });
      }
      yield;
      this.gates = new Gates(this.stage.root, this.arena);
      // 11-18 定死的屋子: the moving pieces, and the floor's pieces fought in turn (S's first, then on through its doors)
      this.pieces = null; this.stageZ = []; this.stageOf = []; this.waitZone = -1; this.rewardsGot = 0;
      yield;
      const fsh = this.arena.shape;
      if (fsh?.fixed && this.grid) {
        const P = this.pieces = new RoomPieces(this.stage.root, fsh, this.grid, this.arena.style, spec.seed); this.props.onStrike = s => this.pieces?.strike(s);
        // (the bell frames and the rope posts stand in the way like any post)
        for (const m of fsh.fixed.marks) if (m.kind === 'bell' || m.kind === 'rope' || m.kind === 'wheel') this.solids.add({ kind: 'prop', shape: 'circle', x: m.x, z: m.z, r: m.kind === 'rope' ? 0.3 : 0.42 });
        const seen = [P.zoneAt(fsh.enter[0], fsh.enter[1])];
        while (seen.length < fsh.fixed.stages) {
          const cur = seen[seen.length - 1], nx = P.pieces.filter(q => q.kind === 'door' && q.sides.includes(cur)).map(q => q.sides[0] === cur ? q.sides[1] : q.sides[0]).filter(z => z >= 0 && !seen.includes(z));
          if (!nx.length) break; seen.push(nx[0]);
        }
        this.stageZ = seen;
        // the plan's waves over the stages in order (a wave split in two when there are more stages than waves)
        if (this.plan && seen.length > 1) {
          const ws = this.plan.waves.map(w => w.slice());
          while (ws.length < seen.length) { let bi = -1; ws.forEach((w, i) => { if (w.length > 1 && (bi < 0 || w.length > ws[bi].length)) bi = i; }); if (bi < 0) break; const w = ws[bi]; ws.splice(bi, 1, w.slice(0, Math.ceil(w.length / 2)), w.slice(Math.ceil(w.length / 2))); }
          this.plan = { ...this.plan, waves: ws };
          this.stageOf = ws.map((_, i) => Math.min(seen.length - 1, Math.floor(i * seen.length / ws.length)));
        }
      }
      // 11-18 敌人绕路: the way round also goes round the cover and every prop standing (the clamp pushes bodies off them; without this a
      // foe walking round a block stalls against a pot or a cart in the way — the push-out is straight back along its walk). Their
      // solids, grown by a man's half-width
      if (this.grid) this.grid.block(this.solids.list.filter(s => s.on).map(s => ({ x0: s.x - s.hx - 0.3, x1: s.x + s.hx + 0.3, z0: s.z - s.hz - 0.3, z1: s.z + s.hz + 0.3 })));
    }
    // fallen leaves on the floor, a few drifting down (act-19); none in winter or in the rain (11-18: on the shape's floor only)
    const lg = this.grid;
    this.leaves = new Leaves(spec.weather === 'rain' || spec.weather === 'snow' || LOCALES[spec.locale]?.noLeaves ? 'winter' : spec.season, { rest: big ? 100 : 40, fall: big ? 1.4 : 0.8, where: lg ? (x, z) => lg.at(x, z) === FLOOR || !(x > PLAY.x0 && x < PLAY.x1 && z > PLAY.z0 && z < PLAY.z1) && lg.at(x, z) !== PIT : undefined });
    // (11-18 屋子形态: a shaped room has its own way in — the 曲尺's front corner is walled off, the 窄巷's lane is off the middle)
    const ent = this.arena?.shape?.enter[0] ?? 0, entZ = this.arena?.shape?.fixed ? this.arena.shape.enter[1] : SZ(5.0);   // (a drawn room: its S)
    yield;
    this.hero = new Hero(isYard ? V3(HIDEOUT.spawn[0], 0, HIDEOUT.spawn[1]) : V3(ent, 0, entZ), this.wearing); this.hero.moves = isYard || this.prologue || this.dbgAllMoves ? ALL_MOVES : this.perks.moves; this.hero.perks = this.perks; this.hero.hp = Math.min(hp, maxHp); this.hero.maxHp = maxHp;   // (act-40 用户：「开局第一场战斗默认给主角解锁所有技能」) (11-18: this comment used to sit before the perks / hp assignments and swallowed them — the hero's own boons never applied and her HP reset each room)
    this.hero.qi = isYard ? Hero.QI_MAX : Math.min(Hero.QI_MAX, Math.max(qi, TUNE.qiStart));   // (11-17 气: carried on; a room starts with at least TUNE.qiStart)
    this.hero.a.yaw = isYard ? -0.6 : Math.PI;
    this.hud.flask.set({ hp: this.hero.hp, maxHp });
    this.cam.set(this.hero.pos.x, 0, this.hero.pos.z); shot('act', () => this.camPose(), { cut: true, speed: 8 });
    after(0.05, () => this.music());
    if (isYard) { yield* this.openYard(); return; }
    if (this.viewSpec) { this.phase = 'yard'; this.log.push(`view ${spec.locale} ${spec.layout} ${spec.time}`); return; }
    this.phase = 'intro'; this.wave = 0;
    if (this.mods.startIntent > 0 && this.intent < this.mods.startIntent) { this.intent = this.mods.startIntent; this.hud.intent = this.intent; }
    const name = LOCALES[this.locale]?.name ?? '';
    // the very first room: the controls once, in the banner (no key hints on screen afterwards)
    const dev = this.inp.lastDevice, hint = !this.hinted ? (dev === 'touch' && 'ontouchstart' in globalThis ? '左边拖动走 · 斩 / 按住蓄力 · 冲 · 跳 · 镖'
      : dev === 'pad' ? msg`左摇杆 走 · ${actPad('attack')} 斩（按住蓄力）· ${actPad('jump')} 跳 · ${actPad('dash')} 冲刺 · ${actPad('special')} 飞镖`
      : msg`WASD 走 · ${actKey('attack')} 斩（按住蓄力）· ${actKey('jump')} 跳 · ${actKey('dash')} 冲刺 · ${actKey('special')} 飞镖`) : '';
    this.hinted = true;
    const info = roomInfo(this.plan?.type ?? 'fight', this.region);
    // 11-18 一局五关: walking into a later region's first room, its name and line first (2.6 s), then the room's own banner
    if (!this.prologue && (this.regionIn || (language === 'en' && this.region === 0 && this.room === 0))) {
      this.regionIn = false; const rb = regionBanner(this.region);
      this.banner.show(rb.title, rb.sub, 2.6, '#ffe2b0');   // (act-50 用户：「获胜的时候会放一个短乐段，我不想要那个声音」: the old jingle is gone everywhere)
      after(2.7, () => { if (this.phase === 'intro' || this.phase === 'fight') this.banner.show(msg`第一间 · ${info.name}`, language === 'en' ? hint || msg`${name} · ${info.line}` : msg`${name} · ${info.line}`, 1.4); });
    } else if (!this.prologue) this.banner.show(msg`第 ${language === 'en' ? this.room + 1 : '一二三四五六七八'[this.room] ?? this.room + 1} 间 · ${info.name}`, hint || msg`${name} · ${info.line}`, hint ? 3.2 : 1.6);
    // the rooms without a fight: the stations stand ready and the roads are open at once
    if (this.plan && (this.plan.type === 'shop' || this.plan.type === 'rest' || this.plan.type === 'boon')) {
      this.stations = new Stations(this.stage!.root, this.arena?.shape?.fixed?.stations);
      if (this.plan.type === 'shop') this.stations.shop(PRICES); else if (this.plan.type === 'rest') this.stations.rest(); else this.stations.scroll();
      this.log.push(`room ${this.room} ${this.plan.type} ${spec.locale}`);
      this.openDoors(true); return;
    }
    prepareFight(this.plan?.waves ?? []);
    // walk in from the front of the room, then the first wave
    const h = this.hero; this.introT = 0;
    after(1.1, () => {
      if (this.hero !== h || this.phase !== 'intro') return;
      this.phase = 'fight'; this.spawnWave();
    });
    this.log.push(`room ${this.room} ${spec.locale} ${spec.layout} ${spec.time} ${this.arena?.shape?.id ?? 'square'}`);
  }
  private *openYard() {
    this.phase = 'yard'; this.wave = 0;
    // act-20: the hideout's 试剑坪 — four slabs call sparring partners, three dummies; no costume rack (her look is in 设置)
    const pk: Array<[EKind, string]> = [['hj_blade', '刀手'], ['hj_brute', '力士'], ['hj_archer', '弓手'], ['hj_boss', '渠帅']];
    const ring = HIDEOUT.dummies.reduce((a, d) => [a[0] + d[0] / HIDEOUT.dummies.length, a[1] + d[1] / HIDEOUT.dummies.length], [0, 0]);
    this.yard = new Yard(this.stage!.root, [], this.wearing, [0, 0], { pads: HIDEOUT.slabs.map(([x, z], i) => ({ x, z, kind: pk[i % pk.length][0], name: pk[i % pk.length][1] })), spawn: () => V3(ring[0] + (Math.random() - 0.5) * 2, 0, ring[1] - 1.2) });
    for (const [x, z] of HIDEOUT.dummies) { yield; const p = V3(x, 0, z), f = spawnFoe('dummy', p, V3(x, 0, z + 4)); f.st = 'move'; this.foes.push(f); }
    // the people of chapter 1 at their places (卢昭 and 桓越 come later in the story)
    yield* this.placeNpcs((['duwu', 'sunao', 'fengtiebi'] as const).map(id => ({ id, ...HIDEOUT.people[id] })));
    // the stele of names: a cut down each name she has killed; the first time home after 褚雷, she makes the cut
    { const p = profile(), fresh = !!p.seen['ch1_boss_after'] && !p.seen['strike_chulei'];
      this.stele = new Stele(p.seen['strike_chulei'] ? 1 : 0); this.stele.g.position.set(HIDEOUT.stele.x, 0, HIDEOUT.stele.z); this.stele.g.rotation.y = HIDEOUT.stele.yaw; this.stage!.root.add(this.stele.g);
      // she goes to the stone (gone in a puff, there in a puff, facing it), sheathes, and draws the cut down his name
      if (fresh) after(1.4, () => {
        const st = this.stele, h = this.hero; if (this.phase !== 'yard' || !st || !h) return; seeOnce('strike_chulei'); saveProfile();
        fxSmoke(h.pos.clone().setY(0.6), 0x8a8a94, 10, { r: 0.6, spd: 1.2, up: 0.8, s: 0.4, life: 0.6 }); cue('whoosh', 0.6);
        // beside the stone, not in front of it (the camera sees the names over her shoulder)
        this.noTalk = true; h.pos.set(HIDEOUT.stele.x + 1.05, 0, HIDEOUT.stele.z + 1.25); h.vel.set(0, 0, 0); h.a.yaw = Math.atan2(-1.05, -1.0);
        fxSmoke(h.pos.clone().setY(0.6), 0x8a8a94, 10, { r: 0.6, spd: 1.2, up: 0.8, s: 0.4, life: 0.6 });
        after(0.5, () => this.inp.hold('attack', 0.55));
        after(1.2, () => { st.strike(0); hitstop(0.12); cue('stingStele', 1); after(0.7, () => { this.noTalk = false; void this.talk([{ who: 'jiangjin', text: STELE_TALK.strike }]); }); });
      }); }
    // act-37: the rack of thirty blades — one hangs for each taken back (褚雷 had the first)
    { const p = profile(); this.stage!.root.add(rackBlades(p.seen['ch1_boss_after'] ? 1 : 0)); }
    // the way out: the gate in the front wall, a sign beside it; the bot walks there by the gate's mouth
    const gx = (HIDEOUT.exit.x0 + HIDEOUT.exit.x1) / 2;
    this.exitSign = makeSign('出发', { w: 1.3, h: 0.6, post: 0.9 }); this.exitSign.position.set(HIDEOUT.exit.x1 + 0.9, 0, HIDEOUT.exit.z - 0.9); this.stage!.root.add(this.exitSign);
    // (a lane through the gate toward the camera: the clamp lets her walk on out there; the front wall either side is solid. The
    // id is a side road's, which the clamp treats as 'hold z to the lane, x to the solids' — the back road's rule would open the north)
    const ex = { ...exitInfo(this.layout!, 'back'), id: 'left' as const, dir: [0, 1] as [number, number], lane: { x0: HIDEOUT.exit.x0, x1: HIDEOUT.exit.x1, z0: HIDEOUT.exit.z - 1.0, z1: PLAY.z1 + 2.5 }, walk: [[gx, HIDEOUT.exit.z - 1.6], [gx, HIDEOUT.exit.z + 1.0]] as Array<[number, number]> };
    this.doors = [{ ex, g: new THREE.Group(), lift: 1 }];
    const touch = this.inp.lastDevice === 'touch' && 'ontouchstart' in globalThis;
    this.banner.show('断碑古窑', touch ? '走近人点右下说话 · 踩石板叫陪练 · 出院门开打' : this.inp.lastDevice === 'pad' ? msg`走近人按 ${actPad('attack')} 说话 · 踩石板叫陪练 · 出院门开打` : !__DEBUG_UI__ ? msg`走近人按 ${actKey('attack')} 说话 · 踩石板叫陪练 · 出院门开打` : msg`走近人按 ${actKey('attack')} 说话 · 踩石板叫陪练 · 出院门开打 · \` 键调手感`, 4);
    this.log.push('yard');
  }
  private spawnWave() {
    const kinds = this.plan?.waves[this.wave] ?? [], hp = this.hero.pos;
    // act-40 (用户：「做点小杂兵的战斗中说话气泡……战斗开始的时候会说两句」): once the wave is in, one or two of them call out
    after(kinds.length * 0.28 + 0.45, () => {
      if (this.phase !== 'fight') return;
      // (11-18: a later region's foe without lines of its own — the 死士, the 水鬼 — keeps quiet: the 黄巾 shouts are region one's)
      const can = this.foes.filter(f => f.st !== 'dead' && !isBoss(f) && f.kind !== 'dummy' && !String(f.kind).includes('hound') && (!!f.d.barks || !/^(ly|xp|wl|cx)_/.test(String(f.kind))));
      for (let n = Math.min(can.length, Math.random() < 0.5 ? 1 : 2), k = 0; k < n; k++) {
        const f = can.splice(Math.floor(Math.random() * can.length), 1)[0];
        after(k * 0.7, () => { if (f.st !== 'dead' && this.phase === 'fight') { const ls = f.d.barks; this.barks?.say(() => f.a.head(), ls?.length ? ls[Math.floor(Math.random() * ls.length)] : undefined); } });
      }
    });
    kinds.forEach((k, i) => {
      after(i * 0.28, () => {
        if (this.phase !== 'fight') return;
        let p = V3();
        const gd = this.grid, sz = this.stageZ.length ? this.stageZ[this.stageOf[this.wave] ?? 0] : -1, zb = sz >= 0 ? this.pieces?.zoneBox(sz) : null;
        for (let t = 0; t < 40; t++) {
          // act-19 (2x stage): anywhere on the floor 5–12 m from the hero, clear of the walls' edge, the cover and the props;
          // 11-18 屋子形态: on the shape's floor (not in the water, on a bridge or in a walled-off part), and a walk away from her
          p = zb ? V3(R(zb.x0 + 0.8, zb.x1 - 0.8), 0, R(zb.z0 + 0.8, zb.z1 - 0.8)) : V3(R(PLAY.x0 + 1.5, PLAY.x1 - 1.5), 0, R(PLAY.z0 + 1.5, PLAY.z1 - 2.5));
          // (11-18 第三关: a 水鬼 comes up out of one of the room's pools — it hunts in the water; dry land is where it is weak)
          if (kindOr(k).kind === 'xp_diver' && this.pools.length) { const pl = this.pools[Math.floor(Math.random() * this.pools.length)]; p = V3(R(pl.x0 + 0.6, pl.x1 - 0.6), 0, R(pl.z0 + 0.6, pl.z1 - 0.6)); }
          if (EDEFS[kindOr(k).kind].boss) { const bm = gd?.sp.fixed?.boss; p = bm ? V3(bm[0], 0, bm[1]) : V3(0, 0, SZ(-4.6)); }   // any region boss stands at the back (a drawn room: at its B)
          const d = p.distanceTo(hp), onFloor = !gd || (gd.clear(p.x, p.z, 0.7) && !gd.sp.bridges.some(b => p.x > b.x0 - 1 && p.x < b.x1 + 1 && p.z > b.z0 - 1 && p.z < b.z1 + 1));
          if ((sz < 0 ? d > 5 && d < 12 : t > 25 ? d > 3 : d > 5 && d < 12) && onFloor && (sz < 0 || this.pieces!.zoneAt(p.x, p.z) === sz) && this.foes.every(f => f.pos.distanceTo(p) > 1.4) && this.solids.free(p.x, p.z, 0.6, 0.3) && (!gd || t > 30 || gd.steps(p.x, p.z, hp.x, hp.z) >= 0)) break;
        }
        if (sz >= 0 && this.pieces && this.pieces.zoneAt(p.x, p.z) !== sz) {
          const [x, z] = this.pieces.spawnInZone(sz, p.x, p.z); p.set(x, 0, z);
        } else if (gd && gd.at(p.x, p.z) !== FLOOR) { const q = gd.nearestFloor(p.x, p.z); p.set(q[0], 0, q[1]); }
        // the plan's kind (黄巾 ids; 'kind*' = its elite) — the boss gets its banner: name and slogan from EDEFS
        const ko = kindOr(k), bs = !!EDEFS[ko.kind].boss;
        // 11-19 (用户：「敌人每次都是凭空出现的，我希望敌人能从四面八方正常冲进战斗场景或者翻墙过来」): the foe runs in from the room's
        // edge — off the floor where she isn't, through a doorway or over the wall — to the spot it used to appear on (p). The
        // boss and a 水鬼 out of its pool still rise where they stand
        const way = bs || kindOr(k).kind === 'xp_diver' ? null : this.entryFrom(p, hp, i, zb ?? null, sz);
        const f = spawnFoe(ko.kind, way ? way.from : p, hp.clone(), ko.elite); this.foes.push(f);
        if (way) this.entering.push({ f, from: way.from, to: way.to, wall: way.wall, t: 0, dur: way.dur });
        else { fxSmoke(p.clone().add(V3(0, 0.3, 0)), 0x6a6a74, bs ? 14 : 8, { r: 0.7, spd: 1.2, up: 0.6, s: 0.4, life: 0.7 }); fxRing(p.clone().setY(0.05), 0xff7a4a, 1.2, { life: 0.4 } as never); }
        cue(bs ? 'roar' : way ? 'foeCry' : 'summon', bs ? 0.9 : way ? 0.25 : 0.4);
        // act-20: the chapter's boss the first time on this save — the intro cutscene and the lines before the fight (he
        // comes in the room's second wave); after that only his banner
        if (bs && this.prologue === 2) { after(0.35, async () => { await this.cine(bossIntroShots(this.cineHost, f, '雷公渠帅 · 石雷')); await this.talk(PRO_CHULEI); f.a.roar(); this.proFightT = 0; }); }
        // (11-18: 褚雷's own meeting — not any boss met first on a fresh save)
        else if (bs && ko.kind === 'hj_boss' && seeOnce('ch1_boss')) { saveProfile(); after(0.35, async () => { if ((f.st as string) === 'dead') return; await this.cine(bossIntroShots(this.cineHost, f, '雷公渠帅 · 石雷')); await this.talk(CHULEI_BEFORE); f.a.roar(); }); }
        // 11-18 (一局五关): a later region's boss — its banner and its line over its head (no portrait talk or cutscene yet)
        else if (bs && EDEFS[ko.kind].intro) { this.bossLookT = 3.2; f.a.roar(); shake(0.3 * TUNE.shake); this.banner.show(EDEFS[ko.kind].name, EDEFS[ko.kind].tag ?? '', 2.2, '#ff8a6a'); after(0.9, () => { if (f.st !== 'dead') this.barks?.say(() => f.a.head(), EDEFS[ko.kind].intro!); }); }
        else if (bs) { f.a.roar(); shake(0.3 * TUNE.shake); this.banner.show(EDEFS[ko.kind].name, EDEFS[ko.kind].tag ?? '', 1.6, '#ff8a6a'); }
      });
    });
  }
  /** 11-19 敌人入场: those still on their way in (out of reach until they are on the floor: no blow, no AI, no damage) */
  private entering: Array<{ f: Foe; from: THREE.Vector3; to: THREE.Vector3; wall: number; t: number; dur: number }> = [];
  /** where a foe comes in from: the room's edge level with its spot p (the back and the two sides first, the side away from her
   *  first; the camera's side last), and where it lands — 1.4–3.6 m inside that edge, on clear floor, in the piece of the room being
   *  fought over. It always comes over the edge: the back and side walls stand a man's height (it climbs up behind them and hops
   *  down inside), the camera's side is low (a hop). Nothing walks through a wall or a barricaded door. null = no edge works */
  private entryFrom(p: THREE.Vector3, hp: THREE.Vector3, i: number, zb: { x0: number; x1: number; z0: number; z1: number } | null, sz: number): { from: THREE.Vector3; to: THREE.Vector3; wall: number; dur: number } | null {
    const g = this.grid, b = zb ?? (g ? g.sp.box : { x0: PLAY.x0, x1: PLAY.x1, z0: PLAY.z0, z1: PLAY.z1 });
    const sides: Array<[number, number]> = [[0, -1], [-1, 0], [1, 0], [0, 1]];
    const order = sides.map((d, k) => ({ d, k, score: (k === 3 ? -50 : 0) + (d[0] ? (d[0] < 0 ? hp.x - b.x0 : b.x1 - hp.x) : (d[1] < 0 ? hp.z - b.z0 : b.z1 - hp.z)) + ((i * 7 + k * 3) % 5) }))
      .sort((x, y) => y.score - x.score);
    const okAt = (x: number, z: number) => (!g || g.clear(x, z, 0.5)) && this.solids.free(x, z, 0.5, 0.3) && (sz < 0 || this.pieces?.zoneAt(x, z) === sz)
      && this.foes.every(f => f.pos.distanceTo(V3(x, 0, z)) > 1.2) && this.entering.every(e => e.to.distanceTo(V3(x, 0, z)) > 1.2) && hp.distanceTo(V3(x, 0, z)) > 3.5;
    for (const { d, k } of order) {
      const ex = d[0] ? (d[0] < 0 ? b.x0 : b.x1) : p.x, ez = d[1] ? (d[1] < 0 ? b.z0 : b.z1) : p.z;
      const len = Math.hypot(p.x - ex, p.z - ez); if (len < 1.6) continue;
      const ux = (p.x - ex) / len, uz = (p.z - ez) / len;
      let land = -1; for (let t = 1.4 + (i % 3) * 0.55; t < Math.min(len, 6); t += 0.3) if (okAt(ex + ux * t, ez + uz * t)) { land = t; break; }
      if (land < 0) continue;
      const front = k === 3, wall = front ? 1.0 : 2.5;
      const from = V3(ex - ux * 0.75, 0, ez - uz * 0.75), to = V3(ex + ux * land, 0, ez + uz * land);
      return { from, to, wall, dur: 0.3 + 0.32 + 0.12 * Math.min(3, land) };
    }
    return null;
  }
  /** per frame: the foes on their way in — up the outside of the wall (0.3 s, behind it, out of sight from the back), a crouch on its
   *  top, one hop down inside landing in a crouch with a puff (the hop longer the further in it lands). Then the fight takes them */
  private enterStep(dt: number) {
    for (let n = this.entering.length - 1; n >= 0; n--) {
      const e = this.entering[n], f = e.f;
      if (f.st === 'dead') { this.entering.splice(n, 1); continue; }
      e.t += dt; const T = e.t, W = e.wall, CLIMB = 0.3, PERCH = 0.32;
      f.vel.set(0, 0, 0); f.yaw = Math.atan2(e.to.x - e.from.x, e.to.z - e.from.z); f.a.yaw = f.yaw; f.a.setRunning(false);
      if (T < CLIMB) { const c = T / CLIMB; f.pos.copy(e.from); f.pos.y = W * (1 - (1 - c) * (1 - c)); }
      else if (T < PERCH) { f.pos.copy(e.from); f.pos.y = W; }
      else {
        const h = Math.min(1, (T - PERCH) / Math.max(0.05, e.dur - PERCH));
        f.pos.lerpVectors(e.from, e.to, h); f.pos.y = W * (1 - h * h) + 0.6 * 4 * h * (1 - h);
      }
      f.st = 'enter'; f.t = 0; f.dur = 0.35; f.cd = Math.max(f.cd, 0.7); f.inv = Math.max(f.inv, 0.2);
      if (T >= e.dur) {
        f.pos.copy(e.to); f.pos.y = 0; f.inv = 0.15;
        cue('land', 0.5); fxSmoke(e.to.clone().setY(0.1), 0x8a7a6a, 6, { r: 0.6, spd: 1.2, up: 0.4, s: 0.38, life: 0.55 }); shake(0.04 * TUNE.shake);
        this.entering.splice(n, 1);
      }
    }
  }
  // ------------------------------------------------------------ the world the hero / foes see
  /** act-37 (用户：「碰撞必须要做，不然这游戏太多穿模了」): every body pushes the others out by their radii and weights — foe from foe,
   *  the hero from a foe (a boss barely gives, a dummy and the hideout's people not at all); a dashing or airborne hero passes
   *  (the dash-cut goes through by design); whatever moved is held by the walls and the solids again */
  private separate() {
    const h = this.hero, B: Array<{ p: THREE.Vector3; r: number; m: number; moved: boolean; f?: Foe }> = [];
    if (h && h.hp > 0 && h.st !== 'dash' && !h.airborne) B.push({ p: h.pos, r: h.r, m: 1, moved: false });
    for (const f of this.foes) if (f.st !== 'dead') B.push({ p: f.pos, r: f.d.r * 0.9, m: f.kind === 'dummy' ? 1e6 : isBoss(f) ? 8 : f.d.mass, moved: false, f });
    for (const n of this.npcs) B.push({ p: V3(n.x, 0, n.z), r: 0.42, m: 1e6, moved: false });
    for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
      const a = B[i], b = B[j], dx = b.p.x - a.p.x, dz = b.p.z - a.p.z, min = a.r + b.r, d2 = dx * dx + dz * dz;
      if (d2 >= min * min || a.m >= 1e6 && b.m >= 1e6) continue;
      const d = Math.sqrt(d2) || 1e-3, nx = d2 > 1e-8 ? dx / d : 1, nz = d2 > 1e-8 ? dz / d : 0, over = min - d, wa = b.m / (a.m + b.m), wb = a.m / (a.m + b.m);
      if (a.m < 1e6) { a.p.x -= nx * over * wa; a.p.z -= nz * over * wa; a.moved = true; }
      if (b.m < 1e6) { b.p.x += nx * over * wb; b.p.z += nz * over * wb; b.moved = true; }
    }
    const keep = this.lastPush;
    // (a foe knocked over a pit's edge stays loose there: the crowd's push must not hold it back on the floor)
    for (const o of B) if (o.moved) { if (o.f) this.foeClamp(o.f); else this.clamp(o.p, o.r); }
    this.lastPush = keep;
  }
  private clamp = (p: THREE.Vector3, r: number) => {
    const x0 = PLAY.x0 + r + 0.2, x1 = PLAY.x1 - r - 0.2, z0 = PLAY.z0 + r + 0.3, z1 = PLAY.z1 - r - 0.2;
    if (this.phase === 'doors' || this.phase === 'leaving' || this.phase === 'yard') for (const d of this.doors) { const l = d.ex.lane, bk = d.ex.dir[1] < 0; if (p.x > l.x0 - 1.0 && p.x < l.x1 + 1.0 && p.z > l.z0 - (bk ? 1.0 : 0.1) && p.z < l.z1 + (bk ? 1.0 : 0.1)) {
        // the back road: held to its width, free to walk on out (a short lane, shallower than the hero is wide, used to clamp him back
        // inside the room so he could never reach the far end)
        if (bk) { p.x = Math.max(l.x0 + r, Math.min(l.x1 - r, p.x)); p.z = Math.max(Math.min(l.z0, PLAY.z0) + r - 6, Math.min(PLAY.z1 - r, p.z)); }
        else p.z = Math.max(l.z0 + r, Math.min(l.z1 - r, p.z));
        this.lastPush = this.solids.pushOut(p, r); return; } }
    const ox = p.x, oz = p.z;
    // 11-18 屋子形态: a shaped room holds bodies on its floor grid (walls, the walled-off parts, the pits — the hero never falls in; a
    // foe going over a pit is let through by the foes' own clamp, see foeClamp)
    if (this.grid) {
      const gp = this.grid.clamp(p, r, this.overPit);
      const sp = this.solids.pushOut(p, r);
      // (a pit's edge is no wall: nothing to slam into there)
      this.lastPush = sp ?? (gp && !gp.pit ? { s: WALL_SOLID, nx: gp.nx, nz: gp.nz, depth: gp.depth } : null);
      return;
    }
    p.x = Math.max(x0, Math.min(x1, p.x)); p.z = Math.max(z0, Math.min(z1, p.z));
    // the floor's edge counts as the wall (a slam); the push normal points back into the room
    const wx = p.x - ox, wz = p.z - oz; this.lastPush = null;
    const sp = this.solids.pushOut(p, r);
    this.lastPush = sp ?? (wx || wz ? { s: WALL_SOLID, nx: Math.sign(wx), nz: Math.sign(wz), depth: Math.hypot(wx, wz) } : null);
  };
  /** 11-18 屋子形态: the clamp lets this body over a pit (a foe knocked off its feet, a dart in flight); off again after each call */
  private overPit = false;
  /** a projectile's clamp: walls stop it, a pit does not (darts and arrows fly over the water) */
  private clampAir = (p: THREE.Vector3, r: number) => { this.overPit = true; try { this.clamp(p, r); } finally { this.overPit = false; } };
  /** a foe's own clamp (enemy.ts integrate): knocked back hard or thrown into the air it can go over a pit's edge (and falls — see
   *  frame()); walking, attacking, or the boss: the pit's edge holds it like a wall */
  private foeClamp = (f: Foe) => {
    // (its middle already over a pit — it landed there from the air, a crowd's push — it is going down: nothing holds it back now)
    const g = this.grid, sp = Math.hypot(f.vel.x, f.vel.z), can = !!g && !isBoss(f) && f.kind !== 'dummy';
    const loose = can && ((f.st === 'stagger' && sp > PIT_SPEED) || (f.airV != null && f.pos.y > 0.05) || !!g!.pitAt(f.pos.x, f.pos.z));
    this.overPit = loose; try { this.clamp(f.pos, f.d.r); } finally { this.overPit = false; }
  };
  /** 11-18 敌人绕路: the way round for a foe walking to the hero — null = straight at her; re-asked every 0.15 s */
  private wayMemo = new WeakMap<Foe, { t: number; d: THREE.Vector3 | null }>();
  private foeWay = (f: Foe): THREE.Vector3 | null => {
    const g = this.grid, h = this.hero; if (!g || !h) return null;
    const m = this.wayMemo.get(f); if (m && clock.time - m.t < 0.15) return m.d;
    const w = g.way(f.pos.x, f.pos.z, h.pos.x, h.pos.z, f.d.r);
    // (11-19 用户：「敌人经常会被卡在场景可破坏建筑里原地跑」: with no way to her at all — she is past a shut door, a barricade or a
    //  hollow wall it can't get through — it used to walk straight at her and run on the spot against it; now it stands and waits)
    const d = w ? V3(w[0], 0, w[1]) : !g.lineOpen(f.pos.x, f.pos.z, h.pos.x, h.pos.z, f.d.r) && g.steps(f.pos.x, f.pos.z, h.pos.x, h.pos.z) < 0 ? V3(0, 0, 0) : null;
    this.wayMemo.set(f, { t: clock.time, d }); return d;
  };
  /** can this foe see her over the floor (no wall, no walled-off block between)? the water and the gullies are low: they see across */
  private foeSees = (f: Foe) => { const g = this.grid, h = this.hero; if (!g || !h) return true; return g.sightOpen(f.pos.x, f.pos.z, h.pos.x, h.pos.z); };
  private heroWorld: HeroWorld = {
    foes: this.foes,
    swing: o => this.swing(o), sweep: o => this.sweep(o), slam: o => this.slam(o), clamp: this.clamp,
    passing: o => this.passing(o), overhead: o => this.overhead(o), dashed: o => this.dashed(o),
    launch: o => this.launchCut(o), kick: o => this.kickHit(o),
    // 11-18 四本新刀谱
    airFoe: (p, y, r) => this.airFoe(p, y, r), airHold: (f, y) => this.airHold(f, y), airCut: o => this.airCut(o), airSlam: o => this.airSlam(o),
    swoop: o => this.swoopCut(o), reelTarget: (p, min) => this.reelTarget(p, min), reel: o => this.reelIn(o),
    stompable: (p, y) => this.stompable(p, y), stomp: o => this.stompOn(o),
    dart: o => { this.dartsThrown++; const d = new Dart(o.from.clone(), o.dir.clone().multiplyScalar(TUNE.dartSpeed), TUNE.dartDmg, TUNE.dartRange); d.link = o.link ?? 0; d.back = hasBoon(this.perks, 'boomerang') ? v(this.perks, 'boomerang') / 100 : 0; this.darts.push(d); },
    chaseTarget: () => this.chaseTarget(), chase: o => this.chaseFx(o),
    stickWorld: () => V3(this.inp.move.x, 0, -this.inp.move.y),
    // act-27: the dart's aim — the finger dragged off the dart button, else the stick (keys / pad)
    aimWorld: () => { const a = this.inp.aimScreen(); if (a) return V3(a.x, 0, -a.y); const r = this.inp.rstick; if (Math.hypot(r.x, r.y) > 0.3) return V3(r.x, 0, -r.y); const m = this.inp.move; return Math.hypot(m.x, m.y) > 0.2 ? V3(m.x, 0, -m.y) : null; },
    guard: o => this.guard(o), incoming: r => this.incoming(r), iaiCatch: win => this.iaiCatch(win),
    iaiGo: o => this.iaiGo(o), iaiCut: o => this.iaiCut(o), iaiBusy: () => this.iaiHeld,
  };
  /** 11-18 QTE（用户：「QTE我还希望再多几种情况，打起来刺激一下肾上腺素」）: 拼刀 and 连环破势, act/qte.ts — what it reaches here */
  duel!: Duel;
  private duelHost: DuelHost = {
    L: this.L, hud: () => this.hud, inp: this.inp,
    hero: () => this.hero, foes: () => this.foes, grid: () => this.grid,
    // (not in the prologue — 打石雷 there is the scripted fall at a fifth of his life, a QTE must not take that blow; not with 不见刀's
    //  ring up or its scene playing, the cards, a 刀谱's demonstration, a scripted pose)
    canRun: forced => (this.phase === 'fight' || (!!forced && this.phase === 'yard')) && (!this.prologue || !!forced) && !this.proFalling && this.qteT < 0 && !this.ultOn && !this.cards.on && !this.demo.on && !this.dialogue.on && !this.timeline.on && !PAUSE.on,
    clamp: (p, r) => this.clamp(p, r), solids: () => this.solids.list, bannerY: () => this.banner.bottomY, log: s => this.log.push(s),
    hitFoe: (f, dmg, from, o) => this.hitFoe(f, dmg, from, o),
    feel: dir => this.feel('rel', true, 1, dir),
    hurtHero: (dmg, from, f) => this.hurtHero(dmg, from, f),
    addIntent: () => { if (this.intent >= 3) this.startQte(); else this.addIntent(); },
    camKick: (d, m) => this.camKick(d, m), camPunch: m => this.camPunch(m),
    vibrate: l => this.platform.vibrate(l),
  };
  private foeWorld: FoeWorld = {
    pushed: (f, dx, dz) => this.pushed(f, dx, dz),
    heroPos: V3(), heroR: 0.38, heroAlive: true, heroY: 0, heroDodge: false, foes: this.foes, arrows: this.arrows, clamp: this.clamp,
    clampAir: this.clampAir, clampFoe: this.foeClamp, way: this.foeWay, sees: this.foeSees,
    hurtHero: (dmg, from, attacker) => this.hurtHero(dmg, from, attacker), // wp/boons: exact melee attacker; arrows omit it
    killFoe: (f, from) => this.killFoe(f, from), // wp/boons: lethal burn ticks use the death hook too
    bleedDamage: f => f.bleed * v(this.perks, 'bleed'),
    bleedSpill: f => this.bleedDrip(f),
    arrowHit: (f, a) => this.arrowHit(f, a),
    dodged: from => this.perfectDodge(from),
    // 11-18 (一局五关): the later regions' foes reach into the world through these
    say: (f, line) => { if (this.phase === 'fight' || this.phase === 'intro') this.barks?.say(() => f.a.head(), line); },
    ignite: (x, z, r, t) => { this.props?.ignite(x, z, r, t); },
    chill: (t, k) => { this.chillK = this.chillT > 0 ? Math.min(this.chillK, k) : k; this.chillT = Math.max(this.chillT, t); },
    freeze: t => { this.frozenT = Math.max(this.frozenT, t); this.hero?.vel.set(0, 0, 0); cue('parry', 0.5); },
    wet: (x, z) => this.pools.some(r => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1),
  };
  /** act-23: did the swing being felt cut flesh (not only the wooden dummies)? picks the hit sound's flesh layers */
  private fleshHit = false;
  private dmgMul(kind: string) { void kind; return 1; }   // (11-18: 搏命 — a number you never saw — went with the other plain-number boons)
  /** 11-18 打击感分档 (用户：「一招一式节奏都差不多」「3C总之都要再加强」): a blow's hit-stop (× TUNE.hitstop), the camera pushed along it,
   *  the rumble, the push-in, its sound; a kill in it holds a little longer and slows a moment */
  private killBeat = false;
  private feel(kind: string, heavy: boolean, n: number, dir?: THREE.Vector3) {
    if (!n) { this.killBeat = false; return; }
    const b = BEAT[heavy && /^k[1-4]$/.test(kind) ? 'heavy' : kind] ?? (heavy ? BEAT.heavy : BEAT.k1), more = Math.min(3, n - 1), sh = TUNE.shake / 2;
    hitstop((b[0] * (1 + 0.15 * more) + (this.killBeat ? 0.03 : 0)) * TUNE.hitstop);
    if (dir) this.camKick(dir, b[1] * sh); if (b[2]) shake(b[2] * TUNE.shake); if (b[3]) this.camPunch(b[3] * sh);
    if (this.killBeat) slowmo(0.14, 0.4);
    cue(b[4], (heavy ? 1.0 : 0.7) + 0.1 * more, this.fleshHit ? 1 : 0); this.fleshHit = false; this.killBeat = false;
    this.platform.vibrate(heavy ? 'medium' : 'light');
    this.hud.btnKick('attack', heavy ? 1 : 0.55, heavy ? 0xffb060 : 0xfff2d0);   // act-29: the cut button answers the hit
  }
  /** 11-18 镜头: a push of the view along a blow, springing back (peak ≈ m metres); a push-in (peak ≈ share of the distance) */
  private kick = V3(); private kickV = V3(); private punch = 0; private punchV = 0; private frameLean = V3(); private crowd = 0;
  /** 11-18: the boss's entrance look (0..1, eased) and how long it is held */ private bossLook = 0; private bossLookT = 0;
  camKick(dir: THREE.Vector3, m: number) { const d = dir.clone().setY(0); if (d.lengthSq() < 1e-6) return; this.kickV.addScaledVector(d.normalize(), m * CAM_W * Math.E * FX.shakeScale); }
  camPunch(m: number) { this.punchV += m * CAM_W * Math.E * FX.shakeScale; }
  private camSprings(rdt: number) {
    // critically damped (ω = CAM_W): x'' = −ω²x − 2ωx', stepped in a few slices so a long frame stays stable
    const n = Math.max(1, Math.ceil(rdt / 0.008)), h = rdt / n, w2 = CAM_W * CAM_W, c = 2 * CAM_W;
    for (let i = 0; i < n; i++) {
      this.kickV.addScaledVector(this.kick, -w2 * h).addScaledVector(this.kickV, -c * h); this.kick.addScaledVector(this.kickV, h);
      this.punchV += (-w2 * this.punch - c * this.punchV) * h; this.punch += this.punchV * h;
    }
    CAM.kick.copy(this.kick); CAM.zoom = Math.max(-0.1, Math.min(0.15, this.punch));
  }
  // ------------------------------------------------------------ act-19: 刀谱, 挑空斩, 飞踢
  /** three manuals not learnt yet, one taken (none left: a boon instead) */
  private async manualPick() {
    const list = drawManuals(this.perks.moves, 3, Math.random); if (!list.length) { await this.boonPick(); return; }
    await this.pickManuals(list);
  }
  private async pickManuals(list: typeof MANUALS) {
    const was = this.phase; this.phase = 'pick'; this.hud.on = false; this.banner.hide();
    const i = await this.cards.open(list.map(m => ({ boon: manualCard(m), tier: 0 })));
    const m = list[i]; this.perks.moves[m.id] = true; this.log.push(`manual ${m.id}`); this.syncMarks();
    this.hud.on = true; this.banner.show(m.name, '刀谱', 1.2, '#f0e0b0');
    // 11-18 (用户：「如何释放的教学不能是纯文字哈」): a ghost of her does the move once beside her, the HUD's buttons pressed in step
    await this.demoMove(m.id);
    this.phase = was === 'pick' ? 'pick' : was;
  }
  // ------------------------------------------------------------ 11-18: what this run has taken, shown on the HUD; the 刀谱 demonstration
  private demo = new MoveDemo();
  /** a ghost of her plays the move (the world holds still: she takes no input) — a tap or any key skips it */
  private async demoMove(id: string) {
    if (this.botOn || !this.hero) return;
    const was = this.phase; this.phase = 'pick'; this.hero.vel.set(0, 0, 0);
    // the hint to skip, small, at the top right where the pause button used to stand (11-18: the portrait pauses now), left of the
    // tuning panel's 「调」 (whole device px per font pixel, about 16 px tall)
    const dpr = this.L.dpr || 1;
    this.L.text.set('act.demoSkip', { text: UI_WORDS.demoSkip, x: this.L.w - 46, y: 23, pix: Math.max(1, Math.round(this.hud.k * dpr)), color: '#d9ccb2', outline: '#140c0a', align: 'right', alpha: 0.8 });
    await this.demo.play(id, { at: this.hero.pos.clone(), def: this.wearing, hud: this.hud });
    this.L.text.hide('act.demoSkip'); this.inp.latch();
    if (this.phase === 'pick') this.phase = was;
  }
  /** the marks on the HUD's buttons: every 刀谱 and 秘传 this run has taken (none in the yard, where they are all open) */
  private syncMarks() {
    const list: Mark[] = [];
    if (this.room >= 0) {
      for (const m of MANUALS) if (this.perks.moves[m.id]) { const e = entryOfManual(m); list.push({ id: 'm:' + m.id, target: e.target, kind: 'manual', tier: 0, col: e.col }); }
      for (const b of BOONS) { const t = tierOf(this.perks, b.id); if (t >= 0) { const e = entryOfBoon(b, t); list.push({ id: 'b:' + b.id, target: e.target, kind: 'boon', tier: t, col: e.col }); } }
    }
    this.hud.setMarks(list);
  }
  /** 已得: this run's 刀谱 and 秘传 */
  private ownedSections(): Section[] {
    const ms = this.room >= 0 ? MANUALS.filter(m => this.perks.moves[m.id]).map(entryOfManual) : [];
    const bs = BOONS.filter(b => tierOf(this.perks, b.id) >= 0).map(b => entryOfBoon(b, tierOf(this.perks, b.id)));
    if (!ms.length && !bs.length) return [{ title: UI_WORDS.owned, list: [], empty: UI_WORDS.ownedEmpty }];
    return [...(ms.length ? [{ title: UI_WORDS.manual, list: ms }] : []), ...(bs.length ? [{ title: UI_WORDS.boon, list: bs }] : [])];
  }
  /** 招式: the moves she has from the start, then the 刀谱 she knows now (all of them in the yard and the prologue) */
  private skillSections(): Section[] {
    const known = this.hero?.moves ?? {}, ms = MANUALS.filter(m => known[m.id]).map(entryOfManual);
    return [{ title: UI_WORDS.base, list: BASE_SKILLS.map(entryOfBase) }, ...(ms.length ? [{ title: UI_WORDS.manual, list: ms }] : [])];
  }
  /** light foes can be thrown: not the 力士, not a 渠帅, not an elite, not a dummy */
  private launchable(f: Foe) { return f.kind !== 'dummy' && !isBoss(f) && f.d.role !== 'brute' && !f.elite; }
  /** 挑空斩: the rising cut — everyone in the arc is hit, the light ones go up into the air (and hang there a moment) */
  private launchCut(o: { from: THREE.Vector3; yaw: number; range: number; half: number; dmg: number }) {
    const fx = Math.sin(o.yaw), fz = Math.cos(o.yaw); let n = 0;
    for (const f of this.foes.slice()) {
      if (f.st === 'dead') continue;
      const dx = f.pos.x - o.from.x, dz = f.pos.z - o.from.z, l = Math.hypot(dx, dz); if (l > o.range + f.d.r) continue;
      if (l > f.d.r + 0.3 && Math.abs(Math.atan2(dx * fz - dz * fx, dx * fx + dz * fz)) > o.half) continue;
      this.hitFoe(f, o.dmg, o.from, { knock: 0.15, heavy: true, kind: 'launch', stagger: 1.5 }); n++;
      if ((f.st as string) !== 'dead' && this.launchable(f)) { f.airV = 10.5; f.pos.y = Math.max(f.pos.y, 0.05); f.vel.set(fx * 1.2, 0, fz * 1.2); this.lofted.set(f, clock.time); }
    }
    if (this.props) this.applyProps(this.props.hitArc(o.from, o.yaw, o.range, o.half, { src: 'hero', heavy: true }, this.targets()));
    this.leaves?.blast(o.from.x + fx, o.from.z + fz, 1.6, 4);
    trailSeg(o.from.clone().add(V3(fx * 0.6, 0.2, fz * 0.6)), o.from.clone().add(V3(fx * 1.2, 2.4, fz * 1.2)), 0xffe8a0, 0.2, { life: 0.3, bright: 2.4, spark: 0.5 });
    this.feel('launch', true, n, V3(fx, 0, fz)); return n;
  }
  /** 飞踢: the first foe in front takes the kick and is sent flying the way the hero was dashing (into walls, jars, others) */
  private kickHit(o: { from: THREE.Vector3; dir: THREE.Vector3; dmg: number }) {
    let best: Foe | null = null, bd = 1e9;
    for (const f of this.foes) {
      if (f.st === 'dead') continue;
      const dx = f.pos.x - o.from.x, dz = f.pos.z - o.from.z, l = Math.hypot(dx, dz); if (l > 1.5 + f.d.r) continue;
      if (dx * o.dir.x + dz * o.dir.z < -0.2) continue; if (l < bd) { bd = l; best = f; }
    }
    const at = o.from.clone().addScaledVector(o.dir, 0.9).setY(0.9);
    if (this.props) this.applyProps(this.props.hitCircle(at.x, at.z, 0.7, { src: 'hero', heavy: true, dir: [o.dir.x, o.dir.z] }, this.targets()));
    if (!best) return 0;
    this.hitFoe(best, o.dmg, o.from, { knock: 0, heavy: true, kind: 'kick', stagger: 1.4 });
    if (best.st !== 'dead') {
      const fly = this.launchable(best), sp = fly ? 15 : 5 / Math.max(1, best.d.mass * 0.6);
      best.vel.copy(o.dir).setY(0).normalize().multiplyScalar(sp); if (fly) { best.airV = 4.2; best.pos.y = Math.max(best.pos.y, 0.05); }
    }
    fxImpact(best.a.chest(), 0xfff0d0, 1.4, { dir: o.dir.clone() }); this.feel('kick', true, 1, o.dir.clone());
    this.leaves?.blast(best.pos.x, best.pos.z, 1.5, 6);
    return 1;
  }
  // ------------------------------------------------------------ 11-18 秘传：改招为主
  // (用户：「我打了半天了还没个新招，一直在给我加数值。强化卡片也难以辨认都是干嘛的」) every boon changes how one button plays — each of
  // these is the boon's own picture and blow; the boons.ts table is the list, its `slot` the button
  /** 透骨: past the 2nd thrust's point a long white line opens straight on, through a row of foes (each once), sparks at its end */
  private pierceLine(from: THREE.Vector3, dir: THREE.Vector3, dmg: number) {
    const L = v(this.perks, 'pierce'), a = from.clone().addScaledVector(dir, 0.6).setY(1.0), b = from.clone().addScaledVector(dir, L).setY(1.0);
    trailSeg(a, b, 0xffffff, 0.16, { life: 0.32, bright: 3.2, spark: 0.5 }); trailSeg(a.clone().setY(1.03), b.clone().setY(1.03), 0x9ad8ff, 0.06, { life: 0.4, bright: 2.6 });
    fxSparks(b, 0xffffff, 12, 5, { dir, dirK: 0.9 });
    const ab = b.clone().sub(a).setY(0), L2 = Math.max(1e-4, ab.lengthSq()); let n = 0;
    for (const f of this.foes.slice()) {
      if (f.st === 'dead') continue;
      const t = f.pos.clone().sub(a).setY(0).dot(ab) / L2; if (t < 0 || t > 1) continue;
      const q = a.clone().addScaledVector(ab, t); if (Math.hypot(f.pos.x - q.x, f.pos.z - q.z) > f.d.r + 0.35) continue;
      if (f.pos.distanceTo(from) < TUNE.atkRange + 1.2) continue;   // (the thrust itself already hit the near ones)
      this.hitFoe(f, Math.round(dmg * v2(this.perks, 'pierce') / 100), from, { knock: 0.9, heavy: false, kind: 'echo' }); n++;
    }
    if (this.props) this.applyProps(this.props.hitSeg(a, b, 0.35, { src: 'hero', heavy: false }, this.targets()));
    if (n) this.feel('k4', false, n, dir.clone());
  }
  /** 荡刃: the turning cut throws a ring of pale wind out to its reach (a flat ring + streaks round the circle) */
  private spinRing(at: THREE.Vector3, r: number) {
    fxRing(at.clone().setY(0.9), 0xe8f4ff, r, { life: 0.28, width: 0.16, fill: 0.04, bright: 1.6 } as never);
    fxRing(at.clone().setY(0.08), 0xc8d8e8, r * 0.95, { life: 0.35, width: 0.1, fill: 0.03 } as never);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; fxSparks(at.clone().add(V3(Math.sin(a) * r, 0.9, Math.cos(a) * r)), 0xeaf4ff, 2, 3, { dir: V3(Math.cos(a), 0, -Math.sin(a)), dirK: 0.9, life: 0.25 }); }
    this.leaves?.blast(at.x, at.z, r + 0.5, 4);
  }
  /** 错身: each foe her dash goes through (on the ground) takes one cut as she passes — a short white slash across it */
  private passHit = new Map<number, number>();
  private passing(o: { a: THREE.Vector3; b: THREE.Vector3; n: number }) {
    if (!hasBoon(this.perks, 'passCut')) return;
    const ab = o.b.clone().sub(o.a).setY(0), L2 = Math.max(1e-4, ab.lengthSq()), dir = ab.lengthSq() > 1e-6 ? ab.clone().normalize() : this.hero.a.fwd();
    for (const f of this.foes.slice()) {
      if (f.st === 'dead' || this.passHit.get(f.uid) === o.n) continue;
      const t = Math.max(0, Math.min(1, f.pos.clone().sub(o.a).setY(0).dot(ab) / L2)), q = o.a.clone().addScaledVector(ab, t);
      if (Math.hypot(f.pos.x - q.x, f.pos.z - q.z) > f.d.r + 0.55) continue;
      this.passHit.set(f.uid, o.n);
      const c = f.a.chest(), side = V3(dir.z, 0, -dir.x);
      trailSeg(c.clone().addScaledVector(side, -0.55).add(V3(0, 0.3, 0)), c.clone().addScaledVector(side, 0.55).add(V3(0, -0.25, 0)), 0xeaf8ff, 0.12, { life: 0.22, bright: 2.8, spark: 0.5 });
      this.hitFoe(f, Math.round(TUNE.atkDmg * v(this.perks, 'passCut') / 100), o.a, { knock: 0.5, heavy: false, kind: 'pass', stagger: 0.35 });
      this.feel('k2', false, 1, dir.clone());
    }
  }
  /** 掠顶: high over a foe (she is above its head, within its width), a quick downward cut — a short vertical streak, once a foe a jump */
  private overHit = new Map<number, number>();
  private overhead(o: { at: THREE.Vector3; y: number; n: number }) {
    if (!hasBoon(this.perks, 'vault')) return 0;
    let n = 0;
    for (const f of this.foes.slice()) {
      if (f.st === 'dead' || this.overHit.get(f.uid) === o.n) continue;
      if (Math.hypot(f.pos.x - o.at.x, f.pos.z - o.at.z) > f.d.r + 0.5) continue;
      this.overHit.set(f.uid, o.n); n++;
      const head = f.a.head(); trailSeg(o.at.clone().setY(o.y + 0.8), head.clone().add(V3(0, -0.2, 0)), 0xfff0d0, 0.12, { life: 0.22, bright: 2.8, spark: 0.5 });
      fxSparks(head, 0xffffff, 8, 3); cue('swingLight', 0.7);
      this.hitFoe(f, v(this.perks, 'vault'), o.at.clone().setY(0), { knock: 0.2, heavy: false, kind: 'overhead', stagger: 0.45 });
    }
    if (n) this.feel('k1', false, n, V3(0, 0, 0));
    return n;
  }
  /** 留影: where a dash starts (once every few seconds) she leaves herself standing — a pale copy of her body, the foes near it turn on it
   *  for its time; struck (or out of time) it goes up in smoke */
  private decoy: { g: THREE.Group; mat: THREE.MeshBasicMaterial; pos: THREE.Vector3; t: number; life: number } | null = null; private decoyCd = 0;
  private dashed(o: { at: THREE.Vector3; yaw: number }) {
    if (!hasBoon(this.perks, 'decoy') || this.decoyCd > 0) return;
    this.decoyCd = v2(this.perks, 'decoy'); this.dropDecoy(false);
    const h = this.hero, body = h.a.body.clone(true), mat = new THREE.MeshBasicMaterial({ color: 0xa8b4f0, transparent: true, opacity: 0.66, depthWrite: false });
    body.traverse(m => { const mm = m as THREE.Mesh; if (mm.isMesh) { mm.material = mat; mm.castShadow = false; } });
    const g = new THREE.Group(); g.add(body); g.position.copy(o.at).setY(0); g.rotation.y = o.yaw; scene.add(g);
    this.decoy = { g, mat, pos: o.at.clone().setY(0), t: 0, life: v(this.perks, 'decoy') };
    smokeBurst(o.at.clone().setY(0), 0.35, 5, { size: 0.22, life: 0.4 }); cue('whoosh', 0.4);
  }
  private dropDecoy(puff = true) {
    const d = this.decoy; if (!d) return; this.decoy = null;
    if (puff) { smokeBurst(d.pos.clone(), 0.5, 9, { size: 0.26, life: 0.55 }); cue('whoosh', 0.5); }
    scene.remove(d.g); d.mat.dispose();
  }
  /** the decoy's frame: it shimmers; the foes near it aim there (foeWorld.heroPos is moved for them — see the foe loop); a blow that lands
   *  on it (its attacker's wind-up ends near it) bursts it */
  private decoyStep(dt: number) {
    this.decoyCd = Math.max(0, this.decoyCd - dt);
    const d = this.decoy; if (!d) return;
    d.t += dt; d.mat.opacity = (0.56 + 0.12 * Math.sin(d.t * 18)) * Math.min(1, (d.life - d.t) / 0.2 + 0.2);
    if (d.t >= d.life || !this.hero.alive || this.phase !== 'fight' && this.phase !== 'yard') this.dropDecoy();
  }
  /** who the decoy is drawing right now: live foes within 6 m of it (not the boss), nearer to it than to her */
  private decoyFor(f: Foe) { const d = this.decoy; return !!d && f.st !== 'dead' && !isBoss(f) && f.pos.distanceTo(d.pos) < 6 && f.pos.distanceTo(d.pos) < f.pos.distanceTo(this.hero.pos) + 1.5; }
  /** 截脉: the dart pins a foe — its blow broken off, it stands rigid (a cold ring at its feet, a pale tint) */
  private pinFoe(f: Foe) {
    if (f.kind === 'dummy') { f.a.tint(0xbfe8ff, 0.8); fxRing(f.pos.clone().setY(0.06), 0xbfe8ff, f.d.r + 0.4, { life: 0.5 } as never); return; }
    if (isBoss(f)) return;
    interruptFoe(f, v(this.perks, 'pin')); f.vel.set(0, 0, 0); this.pinned.set(f.uid, v(this.perks, 'pin'));
    fxRing(f.pos.clone().setY(0.06), 0xbfe8ff, f.d.r + 0.45, { life: 0.4 } as never); fxSparks(f.a.chest(), 0xdff4ff, 10, 2.5);
  }
  /** pinned foes this frame: stand still, tinted cold; a ring pulses at the feet */
  private pinned = new Map<number, number>(); private pinFx = 0;
  private pinStep(dt: number) {
    if (!this.pinned.size) return;
    this.pinFx -= dt; const ring = this.pinFx <= 0; if (ring) this.pinFx = 0.3;
    for (const f of this.foes) {
      const t = this.pinned.get(f.uid); if (t == null) continue;
      if (f.st === 'dead' || t <= 0) { this.pinned.delete(f.uid); continue; }
      this.pinned.set(f.uid, t - dt); f.vel.set(0, 0, 0); if (f.st !== 'stagger') { f.st = 'stagger'; f.t = 0; f.dur = t; }
      f.a.tint(0xbfe8ff, 0.3); if (ring) fxRing(f.pos.clone().setY(0.06), 0xbfe8ff, f.d.r + 0.35, { life: 0.3 } as never);
    }
  }
  /** 崩劲: the catch bursts outward — a ring of blade-light, everyone within reach thrown off and cut. (Kept low: the draw's own flash is
   *  already on screen — act-34 「闪光太严重了」) */
  private burstOut(at: THREE.Vector3) {
    const R0 = v(this.perks, 'burst');
    fxRing(at.clone().setY(0.9), 0xffe2a8, R0, { life: 0.3, width: 0.14, fill: 0.02, bright: 1.1 } as never); fxRing(at.clone().setY(0.07), 0xd8b070, R0, { life: 0.4, width: 0.1, fill: 0.02, bright: 0.9 } as never);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.2; trailSeg(at.clone().add(V3(Math.sin(a) * 0.7, 0.9, Math.cos(a) * 0.7)), at.clone().add(V3(Math.sin(a) * R0, 0.9, Math.cos(a) * R0)), 0xf0d8b0, 0.05, { life: 0.18, bright: 1.6 }); }
    for (const f of this.foes.slice()) {
      if (f.st === 'dead' || f.pos.distanceTo(at) > R0 + f.d.r) continue;
      this.hitFoe(f, v2(this.perks, 'burst'), at, { knock: 2.2, heavy: true, kind: 'burst', stagger: 0.8 });
      const out = f.pos.clone().sub(at).setY(0); if (out.lengthSq() < 1e-4) out.set(0, 0, 1); f.vel.addScaledVector(out.normalize(), isBoss(f) ? 2 : 9 / Math.max(0.7, f.d.mass));
    }
    if (this.props) this.applyProps(this.props.hitCircle(at.x, at.z, R0, { src: 'hero', heavy: true, dir: [0, 1] }, this.targets()));
    this.leaves?.blast(at.x, at.z, R0 + 1, 8); shake(0.25 * TUNE.shake); cue('wallSlam', 0.6);
  }
  /** 裂地: the plunge's blade goes into the ground and a crack runs straight ahead — a line of raised blocks and dust walking out, the
   *  foes on it thrown up (the light ones into the air) as the crack reaches them */
  private riftOut(at: THREE.Vector3, yaw: number) {
    const L = v(this.perks, 'rift'), dir = V3(Math.sin(yaw), 0, Math.cos(yaw)), STEP = 0.5, n = Math.round(L / STEP), hit = new Set<number>();
    for (let i = 1; i <= n; i++) after(i * 0.025, () => {
      const p = at.clone().addScaledVector(dir, i * STEP).setY(0); const q = p.clone(); this.clamp(q, 0); if (q.distanceTo(p) > 0.3) return;
      // the crack: dark split blocks along the line, chips thrown up beside it (axis-aligned blocks, the ground's colours)
      addBlock(p.clone().setY(0.03), { size: [0.22, 0.06, STEP * 0.9], col: 0x2a2018, glow: false, life: 1.6, shrink: 0.5, rot: yaw });
      for (const s of [-1, 1]) addBlock(p.clone().add(V3(dir.z * 0.22 * s, 0.1, -dir.x * 0.22 * s)), { size: 0.12, v: V3(dir.z * s * 1.2, 3.2, -dir.x * s * 1.2), col: 0x8a7a64, glow: false, life: 0.6, shrink: 0.3, grav: 14, floor: 0, rot: yaw });
      if (i % 3 === 0) fxSmoke(p.clone().setY(0.2), 0x8a7a6a, 2, { r: 0.3, spd: 1, up: 0.8, s: 0.3, life: 0.5 });
      for (const f of this.foes.slice()) {
        if (f.st === 'dead' || hit.has(f.uid) || Math.hypot(f.pos.x - p.x, f.pos.z - p.z) > f.d.r + 0.45) continue;
        hit.add(f.uid); this.hitFoe(f, v2(this.perks, 'rift'), at, { knock: 0.4, heavy: true, kind: 'rift', stagger: 0.9 });
        if ((f.st as string) !== 'dead' && this.launchable(f)) { f.airV = 7; f.pos.y = Math.max(f.pos.y, 0.05); }
        fxSparks(f.a.chest(), 0xffd8a0, 8, 3);
      }
      if (this.props && i % 2 === 0) this.applyProps(this.props.hitCircle(p.x, p.z, 0.4, { src: 'hero', heavy: true, dir: [dir.x, dir.z] }, this.targets()));
    });
    cue('pillarFall', 0.5); shake(0.2 * TUNE.shake);
  }
  /** 见红: the bleeding drip as it ticks — a drop off the wound, more for more cuts, and the body flushing dark red */
  private bleedDrip(f: Foe) {
    blood.spray(f.a.chest().add(V3(0, -0.15, 0)), V3(R(-0.3, 0.3), 0, R(-0.3, 0.3)), 1 + Math.floor(f.bleed / 2), 0.3);
    f.a.tint(0x8a1010, 0.25 + 0.06 * f.bleed);
  }
  /** 枭首: the foe is low enough to take the head (not the boss, not a dummy, not shielded) */
  private beheadable(f: Foe) { return hasBoon(this.perks, 'behead') && f.kind !== 'dummy' && !isBoss(f) && f.inv <= 0 && f.st !== 'dead' && f.hp < f.maxHp * v(this.perks, 'behead') / (f.elite ? 200 : 100); }
  /** 枭首's mark: a dark red ring at the feet of each foe that can be taken now (a pooled mesh each) */
  private markRings: THREE.Mesh[] = [];
  private markStep() {
    let i = 0;
    if (hasBoon(this.perks, 'behead') && (this.phase === 'fight' || this.phase === 'yard')) for (const f of this.foes) {
      if (!this.beheadable(f)) continue;
      let m = this.markRings[i]; if (!m) { m = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.68, 4, 1).rotateX(-Math.PI / 2).rotateY(Math.PI / 4), new THREE.MeshBasicMaterial({ color: 0xc02a20, transparent: true, opacity: 0.85, depthWrite: false })); scene.add(m); this.markRings.push(m); }
      m.visible = true; m.position.set(f.pos.x, 0.06, f.pos.z); m.scale.setScalar(f.d.r / 0.45 * (1 + 0.05 * Math.sin(clock.rtime * 9))); i++;
    }
    for (; i < this.markRings.length; i++) this.markRings[i].visible = false;

  }
  // ------------------------------------------------------------ 11-18 四本新刀谱 (用户：「我打了半天了还没个新招，一直在给我加数值」)
  /** 断云: the nearest live foe 挑云 threw (in the last 1.6 s, still off the ground or held up there) within reach of her. Only those —
   *  a heavy blow that bounces someone a hand's breadth off the ground leaves the press in the air 劈山 */
  private lofted = new Map<Foe, number>();
  private airFoe(p: THREE.Vector3, y: number, reach: number): Foe | null {
    let best: Foe | null = null, bd = 1e9;
    for (const [f, at] of this.lofted) {
      if (f.st === 'dead' || !this.foes.includes(f) || clock.time - at > 1.6 || (f.airV == null && f.pos.y < 0.05)) { this.lofted.delete(f); continue; }
      const l = Math.hypot(f.pos.x - p.x, f.pos.z - p.z); if (l > reach + f.d.r || Math.abs(f.pos.y - y) > 2) continue;
      if (l < bd) { bd = l; best = f; }
    }
    return best;
  }
  /** 断云: he hangs where she is cutting him (no fall, no drift) and cannot act */
  private airHold(f: Foe, y: number) {
    if (f.st === 'dead') return;
    f.pos.y += (Math.max(0.5, y - 0.1) - f.pos.y) * 0.5; f.airV = 0; f.vel.multiplyScalar(0.5); this.lofted.set(f, clock.time);
    if (f.st !== 'stagger' || f.dur - f.t < 0.3) interruptFoe(f, 0.5);
  }
  /** 断云: a cut in the air (n 1, 2) — small and quick; n 3, the third: heavy, and he is sent straight down ahead of her */
  private airCut(o: { foe: Foe | null; from: THREE.Vector3; yaw: number; dmg: number; n: number }) {
    const fx = Math.sin(o.yaw), fz = Math.cos(o.yaw), f = o.foe, last = o.n >= 3;
    const at = f ? f.a.chest() : o.from.clone().add(V3(fx * 1.0, 0.9, fz * 1.0)), side = V3(fz, 0, -fx);
    // the cut's line across him: flat for the first, rising back for the second, the third down across
    const a = at.clone().addScaledVector(side, o.n === 2 ? -0.55 : 0.55).add(V3(0, o.n === 2 ? -0.25 : last ? 0.55 : 0.15, 0)), b = at.clone().addScaledVector(side, o.n === 2 ? 0.55 : -0.55).add(V3(0, o.n === 2 ? 0.25 : last ? -0.55 : -0.1, 0));
    trailSeg(a, b, last ? 0xffb0c8 : 0xffd8e6, last ? 0.16 : 0.11, { life: 0.2, bright: last ? 2.8 : 2.2, spark: 0.4 });
    if (!f || f.st === 'dead') { cue('whoosh', 0.5); return 0; }
    this.hitFoe(f, o.dmg, o.from.clone().setY(0), { knock: 0, heavy: last, kind: last ? 'acutF' : 'acut', stagger: 0.6 });
    if ((f.st as string) !== 'dead') { if (last) { f.airV = -16; this.lofted.delete(f); } else f.airV = 0; }
    this.feel(last ? 'acutF' : 'acut', last, 1, last ? V3(fx, 0, fz) : side.clone().multiplyScalar(o.n === 2 ? 1 : -1));
    return 1;
  }
  /** 断云 lands: he is slammed into the ground beside her (more damage, flat for a moment), dust and a ring; anyone close is thrown off */
  private airSlam(o: { at: THREE.Vector3; foe: Foe | null; dmg: number; yaw: number }) {
    let n = 0; const f = o.foe;
    if (f && f.st !== 'dead') {
      f.pos.y = 0; f.airV = undefined; this.hitFoe(f, o.dmg * 2, o.at, { knock: 0.2, heavy: true, kind: 'acutS', stagger: 1.1 }); n++;
      if ((f.st as string) !== 'dead') { f.a.play(new Action('hurt', 1.0, 0.1, { power: 1.6 })); }
    }
    const at = f ? f.pos.clone().setY(0) : o.at.clone();
    for (const g of this.foes.slice()) { if (g === f || g.st === 'dead' || g.pos.distanceTo(at) > 1.6 + g.d.r) continue; this.hitFoe(g, Math.round(o.dmg * 0.5), at, { knock: 1.2, heavy: false, kind: 'acutS', stagger: 0.5 }); n++; }
    if (this.props) this.applyProps(this.props.hitCircle(at.x, at.z, 1.4, { src: 'hero', heavy: true, dir: [Math.sin(o.yaw), Math.cos(o.yaw)] }, this.targets()));
    fxRing(at.clone().setY(0.06), 0xffd8a0, 1.7, { life: 0.4 } as never); dustBlocks(at.clone(), 14); this.leaves?.blast(at.x, at.z, 2.4, 6);
    fxSmoke(at.clone().setY(0.2), 0x8a7a6a, 10, { r: 0.9, spd: 2.6, up: 0.35, s: 0.5, life: 0.7 }); cue('wallSlam', 0.8);
    if (n) this.feel('acutS', true, n); else { shake(0.2 * TUNE.shake); cue('land', 1); }
    return n;
  }
  /** 掠地: the cut along her dive (everyone within r of it) — the sweep's own line, in a pale jade, and a small ring where she lands
   *  (11-18: a second bright line and brighter afterimages made one white blaze at the hit-stop — 高亮克制) */
  private swoopCut(o: { a: THREE.Vector3; b: THREE.Vector3; r: number; dmg: number }) {
    const n = this.sweep({ a: o.a.clone().setY(0), b: o.b.clone().setY(0), r: o.r, dmg: o.dmg, knock: 1.1, col: 0x9ad8a8, kind: 'swoop' });
    fxRing(o.b.clone().setY(0.06), 0xc8e8c0, 1.0, { life: 0.3 } as never);
    return n;
  }
  /** 牵红: the foe with the freshest dart in him that the cord reaches (2..dart range), and whether he is too heavy to pull */
  private reelTarget(p: THREE.Vector3, min: number): { foe: Foe; heavy: boolean } | null {
    let best: Dart | null = null;
    for (const d of this.darts) {
      if (d.dead || !d.stuck) continue; const f = d.stuck as Foe; if (f.st === 'dead' || f.kind === 'dummy') continue;
      const l = Math.hypot(f.pos.x - p.x, f.pos.z - p.z); if (l < min || l > TUNE.dartRange + 1) continue;
      if (!best || d.stuckT < best.stuckT) best = d;
    }
    if (!best) return null; const f = best.stuck as Foe;
    return { foe: f, heavy: isBoss(f) || f.d.role === 'brute' || f.elite };
  }
  /** 牵红: the red cord from her left hand to the dart; a light one is dragged to `to` (stumbling, a small cut of damage), a heavy one
   *  only jerks (she goes to him); the darts in him are spent */
  private reels: Array<{ foe: Foe; from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; self: boolean; line: THREE.Mesh; landed: boolean }> = [];
  private reelIn(o: { foe: Foe; to: THREE.Vector3; dur: number; dmg: number; self: boolean }) {
    const f = o.foe, boss = isBoss(f);
    for (const d of this.darts) if (d.stuck === f && !d.dead) d.stop(false);
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 1).translate(0, 0, 0.5), new THREE.MeshBasicMaterial({ color: 0xd8283a }));
    line.renderOrder = 2; scene.add(line);
    this.reels.push({ foe: f, from: f.pos.clone(), to: o.to.clone(), t: 0, dur: o.dur, self: o.self, line, landed: false });
    // (the chief only takes the dart's tug: no breaking his attack off with it)
    if (!boss) interruptFoe(f, o.self ? 0.35 : 0.6 + o.dur);
    this.hitFoe(f, o.dmg, this.hero.pos.clone(), { knock: 0, heavy: false, kind: 'reel', stagger: boss ? 0 : o.self ? 0.35 : 0.6 + o.dur });
    fxSparks(f.a.chest(), 0xff6a6a, 8, 3); cue('dartHit', 0.9); cue('whoosh', 0.7);
    if (o.self) { cue('dash', 0.7); this.camKick(f.pos.clone().sub(this.hero.pos), 0.08 * TUNE.shake / 2); }
  }
  private reelStep(dt: number) {
    const keep = this.lastPush;
    for (const r of this.reels) {
      r.t += dt; const f = r.foe, u = Math.min(1, r.t / r.dur), e = u * u * (3 - 2 * u);
      if (!r.self && f.st !== 'dead') {
        f.pos.x = r.from.x + (r.to.x - r.from.x) * e; f.pos.z = r.from.z + (r.to.z - r.from.z) * e; f.vel.set(0, 0, 0); this.clamp(f.pos, f.d.r);
        if (u >= 1 && !r.landed) { r.landed = true; dustBlocks(f.pos.clone(), 5); f.a.hit(1.2); }
      }
      // the cord: her left hand to his chest, taut while it pulls, dark and slack-looking the moment it is done
      const hand = this.hero.a.bones?.offhand ?? this.hero.a.bones?.foreL, a = hand ? hand.localToWorld(V3(0, 0, 0)) : this.hero.a.chest(), b = f.a.chest();
      r.line.position.copy(a); r.line.lookAt(b); r.line.scale.set(1, 1, Math.max(0.01, b.distanceTo(a)));
      (r.line.material as THREE.MeshBasicMaterial).color.setHex(u < 1 ? 0xd8283a : 0x8a1a28);
    }
    this.lastPush = keep;
    for (let i = this.reels.length - 1; i >= 0; i--) { const r = this.reels[i]; if (r.t >= r.dur + 0.12) { scene.remove(r.line); r.line.geometry.dispose(); (r.line.material as THREE.Material).dispose(); this.reels.splice(i, 1); } }
  }
  /** 踏顶: a live foe on the ground close beside her (horizontally within ≈ 1.2 m). A plain jump tops out at 1.3 m, under a man's head
   *  (≈ 1.8 m), so anywhere from about a third of his height up counts — she steps up onto him (hero.ts stomp, 0.1 s) */
  private stompable(p: THREE.Vector3, y: number): Foe | null {
    let best: Foe | null = null, bd = 1e9;
    for (const f of this.foes) {
      if (f.st === 'dead' || f.kind === 'dummy' || f.pos.y > 0.3 || isBoss(f)) continue;
      const l = Math.hypot(f.pos.x - p.x, f.pos.z - p.z), top = f.a.height; if (l > 1.2 + f.d.r * 0.5) continue;
      if (y < Math.max(0.5, top * 0.35) || y > top + 1.8) continue;
      if (l < bd) { bd = l; best = f; }
    }
    return best;
  }
  /** 踏顶: her foot on his head — he goes flat on his face (1.2 s; a 力士 or an elite 0.8 s — the chief is never stompable) */
  private stompOn(o: { foe: Foe; from: THREE.Vector3; dmg: number }) {
    const f = o.foe; if (f.st === 'dead') return 0;
    const flat = f.d.role === 'brute' || f.elite ? 0.8 : 1.2;
    this.hitFoe(f, o.dmg, f.pos.clone().add(V3(0, 0, 0.01)), { knock: 0, heavy: true, kind: 'stomp', stagger: flat });
    if ((f.st as string) !== 'dead') { f.vel.set(0, 0, 0); interruptFoe(f, flat); this.flats.set(f, flat); this.flatLen.set(f, flat); }
    const at = f.pos.clone().setY(0); dustBlocks(at, 10); fxRing(at.clone().setY(0.06), 0xd8c8a8, 1.0, { life: 0.35 } as never);
    fxSmoke(at.clone().setY(0.15), 0x8a7a6a, 6, { r: 0.6, spd: 1.8, up: 0.2, s: 0.4, life: 0.5 }); this.leaves?.blast(at.x, at.z, 1.4, 3);
    this.feel('stomp', true, 1, V3(0, 0, 0)); return 1;
  }
  /** 踏顶: who lies flat and for how long — the body pressed down onto the ground (a squash of its own, laid over the pose each frame) */
  private flats = new Map<Foe, number>(); private flatLen = new Map<Foe, number>();
  /** the dead still up in the air: they fall, then their death plays from the ground */
  private drops: Array<{ f: Foe; from: THREE.Vector3; boss: boolean; vy: number }> = [];
  private dropStep(dt: number) {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i], f = d.f; d.vy -= 30 * dt; f.pos.y = Math.max(0, f.pos.y + d.vy * dt);
      if (f.pos.y > 0 && f.a.root.parent) continue;
      this.drops.splice(i, 1); if (!f.a.root.parent) continue;
      dustBlocks(f.pos.clone().setY(0), 6); cue('land', 0.6);
      void playDeath(f.a, { from: d.from, ratio: f.lastDmg / f.maxHp + (d.boss ? 0.5 : 0), boss: d.boss }).then(() => { f.a.dispose(); });
    }
  }
  private flatStep(dt: number) {
    for (const [f, t] of this.flats) {
      const left = t - dt; if (left <= 0 || f.st === 'dead' || !f.a.root.parent) { f.a.body.rotation.x = 0; f.a.body.position.y = 0; this.flats.delete(f); this.flatLen.delete(f); continue; }
      this.flats.set(f, left);
      // down onto his face fast, lies there, then pushes back up in the last 0.3 s
      const age = (this.flatLen.get(f) ?? 1.2) - left, down = Math.min(1, age / 0.1) * (left < 0.3 ? left / 0.3 : 1);
      f.a.body.rotation.x = 1.35 * down; f.a.body.position.y = 0.1 * down;
      if (f.st === 'stagger') f.dur = Math.max(f.dur, f.t + left);
    }
  }
  // ------------------------------------------------------------ act-19: props, fire, the wall slam
  /** who the props can hurt: the live foes and the hero on the ground */
  private targets(): BTarget[] {
    const out: BTarget[] = [];
    for (const f of this.foes) if (f.st !== 'dead' && f.kind !== 'dummy') out.push({ id: f, x: f.pos.x, z: f.pos.z, r: f.d.r, hero: false });
    if (this.hero?.alive && this.hero.y < 0.6) out.push({ id: this.hero, x: this.hero.pos.x, z: this.hero.pos.z, r: 0.38, hero: true });
    return out;
  }
  /** a prop result: pictures (unless already shown), drops, and the damage — all of it the hero's doing */
  private applyProps(r: { events: BEvent[]; damage: BDamage[] }, shown = false) {
    if (!this.props) return;
    if (!shown) this.props.present(r.events);
    for (const e of r.events) if (e.k === 'boom') { this.leaves?.blast(e.x, e.z, 4.5, 8); this.pieces?.boom(e.x, e.z, e.r); }
    for (const e of r.events) if (e.k === 'break' && e.drop) {
      if (e.drop.kind === 'coins') this.coinsFx.drop(V3(e.p.x, 0.3, e.p.z), e.drop.n, 1);
      else { this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + e.drop.n); this.hud.flask.heal({ hp: this.hero.hp, maxHp: this.hero.maxHp }); fxSparks(this.hero.a.chest(), 0x9aff9a, 10, 2); }
    }
    for (const d of r.damage) {
      const from = V3(d.fromX, 0.5, d.fromZ);
      if (d.target.hero) {
        if (d.cause === 'fire') { if (this.hero.iframe || !this.hero.alive) continue; this.hero.hp = Math.max(this.phase === 'yard' ? 1 : 0, this.hero.hp - d.dmg); this.hud.flask.hit(d.dmg, { hp: this.hero.hp, maxHp: this.hero.maxHp }); this.hero.a.tint(0xff7a2a, 0.5); if (this.hero.hp <= 0) this.hurtHero(1, from); }
        else this.hurtHero(d.dmg, from);
      } else { const f = d.target.id as Foe; if (f.st === 'dead') continue; this.hitFoe(f, d.dmg, from, { knock: d.knock, heavy: d.cause !== 'fire', kind: 'school', stagger: d.down || (d.cause === 'fire' ? 0.1 : undefined) }); }
    }
  }
  /** the wall slam (Hades): a foe knocked into the wall, a gate post, cover or a pillar fast enough takes SLAM.dmg and reels;
   *  knocked into a pot / crate / hay it smashes it, into an oil jar it lights it */
  private pushed(f: Foe, dx: number, dz: number) {
    const lp = this.lastPush; if (!lp || f.st === 'dead' || f.kind === 'dummy' || (Math.abs(dx) + Math.abs(dz)) < 1e-4) return;
    // (act-50 用户：「立着的建筑和物件，敌人正常走过去碰到也会扣血……默认应该是建筑倒了或者被玩家一脚踢过去碰到才会掉血」: only a foe
    //  knocked about — reeling from a blow or sent flying — slams; one charging or lunging into a wall under its own steam just stops)
    if (f.st !== 'stagger' && f.airV == null) return;
    if (slamSpeed(f.vel.x, f.vel.z, lp.nx, lp.nz) < SLAM.minSpeed) return;
    const last = this.slamAt.get(f) ?? -9; if (clock.time - last < SLAM.cooldown) return; this.slamAt.set(f, clock.time);
    const vn = f.vel.x * lp.nx + f.vel.z * lp.nz; f.vel.x -= vn * lp.nx * 1.4; f.vel.z -= vn * lp.nz * 1.4;   // a little bounce off it
    const at = f.pos.clone().addScaledVector(V3(lp.nx, 0, lp.nz), -f.d.r);
    if (lp.s.kind === 'prop') { const r = this.props?.hitCircle(at.x, at.z, 0.35, { src: 'slam', heavy: true, dir: [-lp.nx, -lp.nz] }, this.targets()); if (r) this.applyProps(r); if (!lp.s.slam) return; }
    fxSmoke(at.clone().setY(0.6), 0x8a7a6a, 6, { r: 0.4, spd: 1.8, up: 0.6, s: 0.35, life: 0.6 }); dustBlocks(at.clone(), 6); shake(0.14 * TUNE.shake);
    this.hitFoe(f, SLAM.dmg, at, { knock: 0, heavy: true, kind: 'school', stagger: isBoss(f) ? 0 : SLAM.stun }); cue('wallSlam', 0.9);
  }
  /** 11-18 (第三关 寒毒): her steps slowed (the stick read at chillK of its push, frost at her feet) / frozen still (no stick, no
   *  buttons, an ice shell). hero.ts stays as it is: the slow-down is the stick's, so a dash, a cut's step-in and a jump keep their reach */
  private chillT = 0; private chillK = 1; private frozenT = 0; private frostT = 0;
  private statusStep(dt: number, h: Hero) {
    if (this.phase !== 'fight') { this.chillT = 0; this.frozenT = 0; }
    this.chillT = Math.max(0, this.chillT - dt); this.frozenT = Math.max(0, this.frozenT - dt);
    if (this.frozenT > 0 && h.alive) {
      this.inp.move.x = this.inp.move.y = 0; for (const b of Object.values(this.inp.b)) { b.pressed = false; b.down = false; b.held = 0; }
      h.a.tint(0xc8e8ff, 0.7); if ((this.frostT -= dt) <= 0) { this.frostT = 0.08; fxSparks(h.a.chest(), 0xe8f6ff, 2, 1.2, { life: 0.35 }); }
    } else if (this.chillT > 0 && h.alive) {
      this.inp.move.x *= this.chillK; this.inp.move.y *= this.chillK;
      if ((this.frostT -= dt) <= 0) { this.frostT = 0.14; fxSmoke(h.pos.clone().setY(0.08), 0xdff0ff, 1, { r: 0.35, spd: 0.4, up: 0.1, s: 0.18, life: 0.5 }); }
    }
  }
  /** 11-18: a blow a foe's guard took (the shield): sparks off the guard toward her, a clang, a small push back — no blood, no number */
  private glance(f: Foe, from: THREE.Vector3, kind: string) {
    const dir = from.clone().sub(f.pos).setY(0); if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1); dir.normalize();
    const at = f.a.chest().addScaledVector(dir, 0.35);
    fxSparks(at, 0xfff0c0, kind === 'dart' ? 6 : 14, 5, { dir, dirK: 0.7 }); fxRing(at, 0xffe0a0, 0.5, { life: 0.18 } as never);
    cue('parry', kind === 'dart' ? 0.4 : 0.7); f.a.hit(0.35);
    if (kind !== 'dart' && this.hero) { hitstop(0.05 * TUNE.hitstop); this.hero.vel.addScaledVector(dir, 3.2); }
  }
  private hitFoe(f: Foe, dmg: number, from: THREE.Vector3, o: { knock: number; heavy: boolean; kind: string; stagger?: number }) {
    if (f.st === 'dead') return;
    const cut = bladeHit(o.kind);
    // (11-18 改招为主: 断骨 / 出鞘 / 乘虚 / 裂甲 / 搏命 — numbers you never saw change — are out of the pool)
    const knock = o.knock, stagger = o.stagger ?? (o.heavy ? 0.55 : 0.3);
    let d = Math.round(dmg * this.mods.dmgMul * this.dmgMul(o.kind));
    const executed = cut && this.beheadable(f);
    if (executed) d = f.hp + 1;
    const p = f.a.chest(), dir = f.pos.clone().sub(from).setY(0).normalize();
    // (act-40 用户：「打到boss残血剧情杀就直接来，不要变成半途格挡打半天空气」: no floor of blocked hits — the blow that takes him
    //  to a fifth of his life lands, and the scripted fall starts at once)
    let fallNow = false;
    if (this.prologue === 2 && isBoss(f) && !this.proFalling) { const floor = Math.ceil(f.maxHp * 0.2); if (f.hp - d <= floor) { d = Math.max(0, f.hp - floor); fallNow = true; } }
    // 11-18: a region role's guard (the 铁盾兵's shield in front, …): the blow glances off (sparks, no blood, no number) or lands lighter
    { const g = f.inv <= 0 ? ROLE_AI[f.role]?.guard?.(f, d, from, o.kind) : undefined; if (g != null) { if (g < 0) return; if (g === 0) { this.glance(f, from, o.kind); return; } d = Math.round(g); } }   // (< 0: not touched at all — under the water)
    const died = damageFoe(f, d, from, { knock, stagger, poiseDmg: o.kind === 'dart' ? d * 0.5 : o.heavy ? d * 1.8 : d });
    if (this.prologue === 2 && isBoss(f)) f.hp = Math.max(f.hp, Math.ceil(f.maxHp * 0.2));
    if (fallNow) after(0.25, () => void this.prologueFall());   // (the blow lands, a beat, then the scripted fall)
    if (cut && !died && f.inv <= 0 && hasBoon(this.perks, 'bleed') && f.kind !== 'dummy') { f.bleed = Math.min(5, f.bleed + 1); f.bleedT = 0; }
    // 11-18 秘传 枭首: the head comes off — a crossing red cut, 「斩」 over the body (the blood is doubled below)
    if (executed) { const c = f.a.chest(); trailSeg(c.clone().add(V3(-0.7, 0.55, 0)), c.clone().add(V3(0.7, -0.5, 0)), 0xff3a2a, 0.16, { life: 0.35, bright: 2.8, spark: 0.6 }); trailSeg(c.clone().add(V3(-0.7, -0.5, 0)), c.clone().add(V3(0.7, 0.55, 0)), 0xffe0d0, 0.1, { life: 0.3, bright: 2.6 }); popPix('斩', f.a.head().add(V3(0, 0.75, 0)), { color: '#ff5a4a', h: 0.85, big: true, life: 0.9, rise: 0.8 }); cue('gore', 0.9); }
    if (o.kind !== 'school') fxImpact(p, o.heavy ? 0xff6a3a : o.kind === 'ultTick' ? 0xffc890 : 0xfff0d0, o.kind === 'dart' ? 0.4 : o.kind === 'ultTick' ? 0.28 : o.heavy ? 1.3 : 1.0, { dir, chips: o.heavy ? [0xff5a3a, 0x2b3147] : undefined });
    // act-23 (用户：「砍上去要溅血才有感觉」): blood from the wound along the blade's way; more for the heavy blows and the killing one
    if (f.kind !== 'dummy' && o.kind !== 'school') { const n = o.kind === 'dart' ? 5 : o.kind === 'ultTick' ? 7 : o.kind === 'rel' ? 42 : o.heavy ? 28 : 16; blood.spray(p, dir, (died ? n + 20 : n) * (executed ? 2 : 1), o.heavy || died ? 1.35 : 1); this.fleshHit = true; }
    popPix(String(d), f.a.head().add(o.kind === 'ultTick' ? V3(R(-0.55, 0.55), R(0.05, 0.6), 0) : V3(R(-0.2, 0.2), 0.35, 0)), { color: o.kind === 'rel' || o.kind === 'ult' ? '#ffe8a0' : o.kind === 'ultTick' ? '#ffd890' : o.heavy ? '#ff8a3a' : d >= 14 ? '#ffd060' : '#fff6e0', h: o.kind === 'rel' || o.kind === 'ult' ? 0.95 : o.kind === 'ultTick' ? 0.42 : o.heavy ? 0.66 : 0.5, big: o.heavy, life: o.kind === 'rel' || o.kind === 'ult' ? 1.2 : o.kind === 'ultTick' ? 0.5 : 0.9, rise: 0.9 });
    if (!died && o.heavy && knock >= 1.2 && this.launchable(f) && f.pos.y < 0.05) f.airV = Math.max(f.airV ?? 0, 2.2 + knock * 1.3);   // act-19: heavy blows throw the light foes
    if (died) this.killFoe(f, from);
    else if (f.kind !== 'dummy' && o.kind !== 'school' && o.kind !== 'dart' && (o.heavy || Math.random() < 0.33)) cue('foePain', o.heavy ? 1 : 0.75, voiceOf(f));
    if (o.kind === 'k5' && !died && f.inv <= 0 && tierOf(this.perks, 'extra') >= 0) { const target = f, origin = from.clone(), echo = dmg * v(this.perks, 'extra') / 100; after(0.12, () => { if (target.st === 'dead' || !this.foes.includes(target)) return; const c = target.a.chest(); trailSeg(c.clone().add(V3(-0.45, 0.35, 0)), c.clone().add(V3(0.45, -0.35, 0)), 0xffe6c8, 0.13, { life: 0.18, bright: 2.5, spark: 0.5 }); fxSparks(c, 0xffc8a0, 9, 3); this.hitFoe(target, echo, origin, { knock: 0.2, heavy: false, kind: 'echo' }); }); }
  }
  private swing(o: { from: THREE.Vector3; yaw: number; range: number; half: number; dmg: number; knock: number; heavy: boolean; kind: string; n?: number; counter?: boolean }) {
    const fx = Math.sin(o.yaw), fz = Math.cos(o.yaw); let n = 0;
    // the counter after a perfect dodge: double damage, a heavy (staggering) blow, a gold flash and a harder stop
    if (o.counter) {
      o = { ...o, dmg: Math.round(o.dmg * TUNE.counterMul), heavy: true, knock: Math.max(o.knock, 1.4) };
      const tip = o.from.clone().add(V3(fx * 1.2, 1.0, fz * 1.2));
      fxImpact(tip, 0xffd060, 1.6, { dir: V3(fx, 0, fz) }); fxRing(tip, 0xffe090, 1.4, { life: 0.3 } as never); cue('crit', 1.0);
    }
    // a thrust: a straight streak of light from the point straight ahead (the top-down camera reads 「刺」 by this line), a burst at its end
    if (o.kind === 'k4') {
      const second = (o.n ?? 1) > 1, a = o.from.clone().add(V3(fx * 0.7, 1.0, fz * 0.7)), b = o.from.clone().add(V3(fx * (o.range + (second ? 0.8 : 0.4)), 1.0, fz * (o.range + (second ? 0.8 : 0.4))));
      trailSeg(a, b, 0xeaf4ff, second ? 0.13 : 0.1, { life: second ? 0.22 : 0.16, bright: second ? 3.0 : 2.4, spark: 0.4 });
      fxSparks(b, 0xffffff, second ? 10 : 6, second ? 4 : 3, { dir: V3(fx, 0, fz), dirK: 0.8 });
      cue('whoosh', second ? 0.8 : 0.6);
      // 11-18 秘传 透骨: the second thrust runs on as a long white line through everyone in a row (the line is the hit)
      if (second && hasBoon(this.perks, 'pierce')) this.pierceLine(o.from.clone(), V3(fx, 0, fz), o.dmg);
    }
    // 11-18 秘传 荡刃: the 3rd cut throws a ring of wind as far as its reach (hero.ts widens the reach)
    if (o.kind === 'k3' && hasBoon(this.perks, 'spin')) this.spinRing(o.from.clone(), o.range);
    for (const f of this.foes.slice()) {
      if (f.st === 'dead') continue;
      const dx = f.pos.x - o.from.x, dz = f.pos.z - o.from.z, l = Math.hypot(dx, dz); if (l > o.range + f.d.r) continue;
      const ang = Math.abs(Math.atan2(dx * fz - dz * fx, dx * fx + dz * fz)); if (l > f.d.r + 0.3 && ang > o.half) continue;
      this.hitFoe(f, o.dmg, o.from, o); n++;
    }
    if (this.props) this.applyProps(this.props.hitArc(o.from, o.yaw, o.range, o.half, { src: 'hero', heavy: o.heavy }, this.targets()));   // act-19
    this.leaves?.cutArc(o.from.x, o.from.z, o.yaw, o.range, o.half);
    const cut: Arrow[] = [];
    for (const a of this.arrows) if (!a.dead && !a.friendly) { const dx = a.p.x - o.from.x, dz = a.p.z - o.from.z; if (Math.hypot(dx, dz) < o.range + 0.4 && Math.abs(Math.atan2(dx * fz - dz * fx, dx * fx + dz * fz)) < o.half + 0.3) cut.push(a); }
    this.deflect(cut, o.yaw);
    this.feel(o.kind, o.heavy, n, V3(fx, 0, fz)); if (o.counter && n) { hitstop(0.14 * TUNE.hitstop); shake(0.3 * TUNE.shake); this.addIntent(); }
    // 刀芒沿用现有的薄月牙外观，只改变伤害和飞行时间。
    if (o.kind === 'k5' && tierOf(this.perks, 'bladeWind') >= 0) { this.waves.push(new BladeWave(o.from.clone().add(V3(fx * 0.9, 0.95, fz * 0.9)), V3(fx, 0, fz), 20, 0.42 * (1 + v2(this.perks, 'bladeWind') / 100))); cue('whoosh', 1); fxSparks(o.from.clone().add(V3(fx * 1.2, 1.0, fz * 1.2)), 0xe8fff2, 10, 4); }
    return n;
  }
  /** 追影: the foe with the freshest dart still in it, near enough */
  private chaseTarget(): Foe | null {
    let best: Dart | null = null;
    for (const d of this.darts) if (!d.dead && d.stuck && (d.stuck as Foe).st !== 'dead' && d.stuck.pos.distanceTo(this.hero.pos) < TUNE.dartRange + 3 && (!best || d.stuckT < best.stuckT)) best = d;
    return best ? best.stuck as Foe : null;
  }
  /** 追影: a puff where the hero was, an indigo afterimage and a shadow line to the foe, a puff where it lands; the darts are spent */
  private chaseFx(o: { from: THREE.Vector3; to: THREE.Vector3; foe: Foe }) {
    smokeBurst(o.from, 0.5, 8, { size: 0.26, life: 0.5 }); fxAfterimage(o.from.clone(), 1.9, 0x7a86ff, { life: 0.4, glow: 0.6 });
    trailSeg(o.from.clone().setY(1.0), o.to.clone().setY(1.0), 0x7a86ff, 0.22, { life: 0.35, bright: 2.4, spark: 0.4 });
    smokeBurst(o.to, 0.5, 8, { size: 0.26, life: 0.5 });
    for (const d of this.darts) if (d.stuck === o.foe && !d.dead) d.stop();
    cue('dash', 0.9); cue('swishHeavy', 0.6); shake(0.1 * TUNE.shake);
  }
  private sweep(o: { a: THREE.Vector3; b: THREE.Vector3; r: number; dmg: number; knock: number; col?: number; kind?: string }) {
    const ab = o.b.clone().sub(o.a).setY(0), L2 = Math.max(1e-4, ab.lengthSq()); let n = 0;
    for (const f of this.foes.slice()) {
      if (f.st === 'dead') continue;
      const t = Math.max(0, Math.min(1, f.pos.clone().sub(o.a).setY(0).dot(ab) / L2)), q = o.a.clone().addScaledVector(ab, t);
      if (Math.hypot(f.pos.x - q.x, f.pos.z - q.z) <= o.r + f.d.r) { this.hitFoe(f, o.dmg, q, { knock: o.knock, heavy: true, kind: o.kind ?? 'rel' }); n++; }
    }
    if (this.props) this.applyProps(this.props.hitSeg(o.a, o.b, o.r, { src: 'hero', heavy: true }, this.targets()));   // act-19
    if ((o.kind ?? 'rel') === 'rel' || o.kind === 'rel2') {
      // 11-18 一闪: the line opens along her whole path — a long white blade-light, a thin gold one inside, sparks along it
      const ext = ab.clone().setY(0).normalize().multiplyScalar(0.8), a0 = o.a.clone().sub(ext).setY(1.0), b0 = o.b.clone().add(ext).setY(1.0);
      trailSeg(a0, b0, 0xffffff, 0.42, { life: 0.55, bright: 3.4, spark: 1 }); trailSeg(a0.clone().setY(1.04), b0.clone().setY(1.04), 0xffd890, 0.12, { life: 0.7, bright: 3, spark: 0.4 });
      for (let i = 0; i <= 6; i++) fxSparks(a0.clone().lerp(b0, i / 6), 0xfff4d8, 5, 3);
    } else trailSeg(o.a.clone().setY(1.0), o.b.clone().setY(1.0), o.col ?? 0xff7a4a, 0.3, { life: 0.3, bright: 2.2, spark: 0.6 });
    if (o.kind === 'dcut') trailSeg(o.a.clone().setY(0.55), o.b.clone().setY(0.55), 0xeaf8ff, 0.12, { life: 0.4, bright: 2.6, spark: 0.3 });
    // arrows along the lunge's path are cut too
    const cut = this.arrows.filter(a => { if (a.dead || a.friendly) return false; const t = Math.max(0, Math.min(1, a.p.clone().sub(o.a).setY(0).dot(ab) / L2)), q = o.a.clone().addScaledVector(ab, t); return Math.hypot(a.p.x - q.x, a.p.z - q.z) < o.r + 0.4; });
    this.deflect(cut, Math.atan2(ab.x, ab.z));
    this.feel(o.kind ?? 'rel', true, n, ab.clone()); if (!n) cue('whoosh', 0.6);
    return n;
  }
  /** cut arrows fly off: each in a random direction within ±75° of the blade's facing, leaning onto a foe near that line
   *  (so a batted arrow often finds someone); the cut itself is a highlight — a freeze, a white flash, a short slow-down */
  private deflect(cut: Arrow[], yaw: number) {
    if (!cut.length) return;
    for (const a of cut) {
      let ang = yaw + (Math.random() * 2 - 1) * 1.3, best = 0.5;
      for (const f of this.foes) {
        if (f.st === 'dead') continue;
        const dx = f.pos.x - a.p.x, dz = f.pos.z - a.p.z, l = Math.hypot(dx, dz); if (l > 14 || l < 0.5) continue;
        let d = Math.atan2(dx, dz) - ang; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        if (Math.abs(d) < best) { best = Math.abs(d); ang = Math.atan2(dx, dz); }
      }
      const dir = V3(Math.sin(ang), 0, Math.cos(ang));
      fxImpact(a.p.clone(), 0xfff4d8, 1.25, { dir }); fxRing(a.p.clone(), 0xffe6a0, 0.7, { life: 0.25 } as never);
      a.deflect(dir);
    }
    hitstop(TUNE.deflectStop); slowmo(TUNE.deflectSlow, 0.3); shake(0.22 * TUNE.shake);
    cue('swishHeavy', 0.7); cue('exitChime', 0.35); this.platform.vibrate('medium'); this.addIntent();
    this.hero.gainQi(Math.min(0.5, 0.25 * cut.length));   // (11-17 气: a batted arrow is a quarter of a bar)
  }
  /** the blade's guard window: arrows in the front half-circle within reach are batted away */
  private guard(o: { from: THREE.Vector3; yaw: number; range: number }) {
    const fx = Math.sin(o.yaw), fz = Math.cos(o.yaw);
    const cut = this.arrows.filter(a => { if (a.dead || a.friendly) return false; const dx = a.p.x - o.from.x, dz = a.p.z - o.from.z, l = Math.hypot(dx, dz); return l < o.range && (l < 0.9 || (dx * fx + dz * fz) / (l || 1) > -0.15); });
    this.deflect(cut, o.yaw);
  }
  /** the nearest enemy arrow flying at the hero within reach: the direction to it (flat), or null */
  private incoming(reach: number) {
    const h = this.hero; let best: THREE.Vector3 | null = null, bd = reach;
    for (const a of this.arrows) {
      if (a.dead || a.friendly) continue;
      const d = a.p.clone().sub(h.pos).setY(0), l = d.length(); if (l > bd) continue;
      if (a.v.clone().setY(0).normalize().dot(d.clone().multiplyScalar(-1 / (l || 1))) < 0.7) continue;   // not heading at the hero
      bd = l; best = d.normalize();
    }
    return best;
  }
  /** a perfect dodge: the world slows, a cold ring and afterimages, a 「闪」, and the counter (next cut ×2, staggers, gold) + the
   *  dash ready again + the special's cool-down cut (act-07 用户：「闪避成功的时候也应该要有很强的反馈和奖励」) */
  private dodgeCd = 0;
  private perfectDodge(from: THREE.Vector3) {
    if (this.dodgeCd > 0 || !this.hero.alive) return;
    this.dodgeCd = 0.8; void from; this.hud.btnKick('dash', 1.2, 0xffd060);   // act-29: the dodge button flares gold
    const h = this.hero, at = h.pos.clone();
    slowmo(TUNE.dodgeSlow, 0.28); shake(0.12 * TUNE.shake);
    fxRing(at.clone().setY(0.08), 0xbfe8ff, 2.4, { life: 0.5 } as never); fxRing(at.clone().setY(0.9), 0xe8f6ff, 1.2, { life: 0.3 } as never);
    for (let i = 0; i < 3; i++) fxAfterimage(at.clone().add(V3(Math.sin(i * 2.1) * 0.5, h.y, Math.cos(i * 2.1) * 0.5)), 1.9, 0x8ac8ff, { life: 0.45, glow: 0.6 });
    fxSparks(h.a.chest(), 0xdff4ff, 18, 5); h.a.tint(0xbfe8ff, 0.6);
    popPix('闪', h.a.head().add(V3(0, 0.5, 0)), { color: '#bfe8ff', h: 0.9, big: true, life: 0.9, rise: 1.0 });
    cue('dodgeOk', 1); this.platform.vibrate('medium');   // (11-19: its own sound — it was the parry's clang, read as a clash of blades)
    h.counterT = TUNE.counterTime; h.dashCd = 0; h.gainQi(0.5);   // (11-17 气: a perfect dodge is half a bar)
    if (this.intent >= 3) this.startQte(); else this.addIntent();
  }
  /** the attacks that will land on the hero within `win` seconds: foes winding up with the hero inside their warning (a little slack),
   *  dogs already flying at the hero, arrows that will arrive in time */
  private threats(win: number) {
    const h = this.hero, foes: Foe[] = [];
    for (const f of this.foes) {
      if (f.st === 'dead' || f.kind === 'dummy') continue;
      if (f.st === 'windup' && f.shape && f.dur - f.t <= win && inside(f.shape, f.telePos.x, f.telePos.z, f.teleYaw, h.pos.x, h.pos.z, h.r + 0.45)) foes.push(f);
      else if (f.st === 'strike' && f.lunge && !f.hitHero && f.pos.distanceTo(h.pos) < 3) foes.push(f);
    }
    const arrows = this.arrows.filter(a => { if (a.dead || a.friendly) return false; const d = h.pos.clone().sub(a.p).setY(0), l = d.length(), v = a.v.length(); return l / v <= win + 0.05 && a.v.clone().setY(0).normalize().dot(d.normalize()) > 0.75; });
    return { foes, arrows };
  }
  /** 11-18 一闪 (用户：「蓄能大招反馈不足」): the draw — everyone on her path is pinned where they stand (no one strikes into the held
   *  beat; not the chief), a white-gold flash */
  private iaiHeld = false;
  private iaiGo(o: { from: THREE.Vector3; to: THREE.Vector3; r: number; soft?: boolean }) {
    const ab = o.to.clone().sub(o.from).setY(0), L2 = Math.max(1e-4, ab.lengthSq());
    let locked: Foe | null = null;
    for (const f of this.foes) {
      if (f.st === 'dead' || f.kind === 'dummy') continue;
      const t = Math.max(0, Math.min(1, f.pos.clone().sub(o.from).setY(0).dot(ab) / L2)), q = o.from.clone().addScaledVector(ab, t);
      if (Math.hypot(f.pos.x - q.x, f.pos.z - q.z) > o.r + f.d.r + 0.2) continue;
      // 11-18 拼刀: the draw runs into an elite's / a boss's heavy blow coming down — blades lock (act/qte.ts), not pinned
      if (!locked && this.duel.offerClash(f, true)) { locked = f; continue; }
      if (!isBoss(f)) interruptFoe(f, 0.85);
    }
    this.flashScreen(o.soft ? 0.08 : 0.32, 0xfff4dc);   // (11-18 追步: the second draw only glints — one full flash a draw is enough)
  }
  /** she has arrived and stands: the world holds its breath 0.25 s (time all but stopped, the sound fallen away but her own), then
   *  the line opens along her path and everyone on it is cut at once — the sweep, its blood, its numbers, the stop and the push */
  private iaiCut(o: { a: THREE.Vector3; b: THREE.Vector3; r: number; dmg: number; knock: number }) {
    const BEAT_S = TUNE.iaiBeat; this.iaiHeld = true;
    hitstop(BEAT_S + 0.02); audio.stillness(BEAT_S); this.camPunch(0.03);
    after(BEAT_S, () => { this.iaiHeld = false; if (!this.hero?.alive) return; this.flashScreen(0.45, 0xffffff); this.sweep({ ...o, kind: 'rel' }); }, { real: true });
  }
  /** 11-18: a full-screen flash (the grade's flash, fading over ~0.2 s) and the stance's dimming (vignette + a little desaturation) */
  private flashK = 0; private vigBase = -1; private dimK = 0;
  private flashScreen(k: number, col: number) { this.flashK = Math.max(this.flashK, k); GRADE.flashCol.setHex(col); }
  private flashStep(rdt: number) {
    if (this.flashK > 0) { this.flashK = Math.max(0, this.flashK - rdt * 4); GRADE.flash = this.flashK * 0.75; }
  }
  private dimTo(want: number, rdt: number) {
    this.dimK += (want - this.dimK) * Math.min(1, rdt * (want > this.dimK ? 5 : 9));
    if (this.dimK > 0.003) { if (this.vigBase < 0) this.vigBase = GRADE.vig; GRADE.vig = this.vigBase + 0.5 * this.dimK; GRADE.desat = 0.22 * this.dimK; }
    else if (this.vigBase >= 0) { GRADE.vig = this.vigBase; GRADE.desat = 0; this.vigBase = -1; this.dimK = 0; }
  }
  /** the draw from the stance meets an attack about to land: 见切 now — the attack broken off, the attacker thrown, arrows sent back */
  private iaiCatch(win: number) {
    const t = this.threats(win); if (!t.foes.length && !t.arrows.length) return null;
    const near = t.foes.sort((a, b) => a.pos.distanceTo(this.hero.pos) - b.pos.distanceTo(this.hero.pos))[0];
    // 11-18 拼刀: the draw met an elite's / a boss's heavy blow as it comes down — blades lock (act/qte.ts) instead of the parry
    if (near && this.duel.offerClash(near)) { for (const f of t.foes) if (f !== near) interruptFoe(f); return near.pos.clone(); }
    for (const f of t.foes) interruptFoe(f);
    const from = near ? near.pos.clone() : t.arrows[0].p.clone();
    this.iaiParry(from);
    return near ? near.pos.clone() : null;
  }
  /** 居合 · 见切: a blow landed just after the draw from the stance — super armour (no damage, no knock), the attacker thrown off
   *  and hurt, arrows sent back the way they came, the draw cuts for double, a freeze and a white-gold flash; 杀意 +1 (or the QTE) */
  private parryCd = 0;
  private iaiParry(from: THREE.Vector3) {
    if (this.parryCd > 0 || !this.hero.alive) return;
    this.parryCd = 0.3;
    const h = this.hero; h.iaiBonus = true; h.inv = Math.max(h.inv, 0.35);
    let atk: Foe | null = null, bd = 2.8;
    for (const f of this.foes) { if (f.st === 'dead' || f.kind === 'dummy') continue; const d = f.pos.distanceTo(from); if (d < bd) { bd = d; atk = f; } }
    if (atk) { trailSeg(h.a.chest(), atk.a.chest(), 0xfff2c8, 0.2, { life: 0.25, bright: 3, spark: 0.6 }); this.hitFoe(atk, TUNE.iaiReflect, h.pos.clone(), { knock: 2.0, heavy: true, kind: 'parry' }); }
    for (const a of this.arrows) if (!a.dead && !a.friendly && a.p.distanceTo(h.pos.clone().setY(1.25)) < 1.8) a.deflect(a.v.clone().multiplyScalar(-1));
    if (hasBoon(this.perks, 'burst')) this.burstOut(h.pos.clone());   // 11-18 秘传 崩劲
    hitstop(0.16 * TUNE.hitstop); slowmo(0.35, 0.25); shake(0.35 * TUNE.shake);
    fxRing(h.pos.clone().setY(0.9), 0xfff2c8, 1.6, { life: 0.35 } as never); fxRing(h.pos.clone().setY(0.08), 0xffd890, 2.6, { life: 0.5 } as never); fxSparks(h.a.chest(), 0xfff2c8, 24, 7);
    popPix('破', h.a.head().add(V3(0, 0.5, 0)), { color: '#fff0c0', h: 0.95, big: true, life: 0.9, rise: 1.0 });
    cue('parry', 1); cue('cutHeavy', 0.9); this.platform.vibrate('heavy');
    if (this.intent >= 3) this.startQte(); else this.addIntent();
  }
  /** 11-17 (用户选「新学的刀谱派生，前三次能接招时慢放」): the first three times (on this device) each 刀谱 link opens in a fight, time
   *  runs at half speed for a moment while the button turns over to it — so the player sees 「now this can follow」. Not in the yard */
  private hintWas: Record<string, string | null> = {}; private taught: Record<string, number> | null = null;
  private teach(hints: Record<string, string | null>) {
    for (const [btn, k] of Object.entries(hints)) {
      const was = this.hintWas[btn] ?? null; this.hintWas[btn] = k;
      if (!k || k === was || this.phase !== 'fight' || !TEACH.includes(k)) continue;
      if (!this.taught) { try { this.taught = JSON.parse(localStorage.getItem('ub.taught') || '{}') ?? {}; } catch { this.taught = {}; } }
      const t = this.taught!; if ((t[k] ?? 0) >= 3) continue;
      t[k] = (t[k] ?? 0) + 1; try { localStorage.setItem('ub.taught', JSON.stringify(t)); } catch { /* private mode: it teaches again next time */ }
      slowmo(0.6, 0.5); this.log.push(`teach ${k} ${t[k]}`);
    }
  }
  /** 杀意 +1 (perfect dodge, a batted arrow, a counter landing, 见切), up to 3; the third flares */
  intent = 0; private qiVolley = 0;
  private addIntent() {
    if (this.intent >= 3) return;
    this.intent++; this.hud.intent = this.intent;
    if (this.intent >= 3) { cue('relic', 0.9); fxSparks(this.hero.a.chest(), 0xffa040, 20, 5); fxRing(this.hero.pos.clone().setY(0.08), 0xffa040, 1.6, { life: 0.4 } as never); }
  }
  /** 绝 · 一刀 QTE: time nearly stops, a gold ring closes on the cut button (and on the hero); press 斩 as it lands = 一刀; miss = it
   *  passes and the 杀意 stays for the next time */
  private qteT = -1; private ultOn = false; private qteW!: THREE.Mesh; private qteWin = false;
  private startQte() {
    if (this.qteT >= 0 || this.ultOn) return;
    this.qteT = 0; this.qteWin = false; slowmo(TUNE.qteTime * 1.3 + 0.2, 0.04); cue('timeSlow', 1);
  }
  private qteFrame(rdt: number) {
    if (this.qteT < 0) { this.hud.qte(null); this.qteW.visible = false; return; }
    this.qteT += rdt;
    const h = this.hero, k = this.qteT / TUNE.qteTime, win = k >= 0.72 && k <= 1.12;
    // 11-18 (用户：「也不知道到底什么时机是正确的」): the window opening is heard and felt too — a blade's ring, a light buzz
    if (win && !this.qteWin) { cue('bladeRing', 0.9); this.platform.vibrate('light'); }
    this.qteWin = win;
    this.hud.qteDt = rdt; this.hud.qte(Math.min(1, k), win);
    this.qteW.visible = true; this.qteW.position.set(h.pos.x, 0.07, h.pos.z); this.qteW.scale.setScalar((0.9 + 2.6 * Math.max(0, 1 - k)) * (win ? 1.06 : 1));
    (this.qteW.material as THREE.MeshBasicMaterial).color.setHex(win ? 0xfff6d8 : 0xc0601c);
    // 11-18 (用户：「不应该还是按普攻，高速战斗的时候经常都按不到」): 不见刀's own button (I / R2 / the button that pops up); the cut button
    // is left to cut
    const pressed = this.inp.b.ult.pressed;
    if (pressed) this.inp.b.ult.pressed = false;
    if (pressed && win) { this.qteT = -1; this.hud.qte(null); this.qteW.visible = false; void this.ult(); }
    else if (pressed || k > 1.2) { this.qteT = -1; this.hud.qte(null); this.qteW.visible = false; FX.slowmo = 0; cue('click', 0.5); }
  }
  /** 一刀: the hero flashes between every foe nearby (up to seven, nearest first along the way), then sheathes — everyone cut at once */
  private async ult() {
    const h = this.hero; this.ultOn = true; this.intent = 0; this.hud.intent = 0; FX.slowmo = 0; FX.hitstop = 0;
    h.forceFree(); h.inv = 6;
    const left = this.foes.filter(f => f.st !== 'dead' && f.pos.distanceTo(h.pos) < 11), targets: Foe[] = [];
    let at = h.pos.clone();
    while (left.length && targets.length < 7) { left.sort((a, b) => a.pos.distanceTo(at) - b.pos.distanceTo(at)); const f = left.shift()!; targets.push(f); at = f.pos.clone(); }
    // 11-18 (act-43 反馈：「我说得终极技能是那个有影分身的招数，这个招数的表现力要再强一点才行」): one whole scene, not a few puffs —
    // the world cut in two and pressed into ink, everyone near pinned where they stand; she vanishes; two shadows go through each of
    // them from two sides and every pass leaves its streak hanging in the air (a web by the end); she stands up out of the smoke, a held
    // breath, the click of the sheath; each of them bursts open cut by cut; one great cross through all of them; the ink lifts
    const G0 = { vig: GRADE.vig, desat: GRADE.desat, exp: GRADE.exposure };
    const ink = (k: number) => { GRADE.vig = G0.vig + 0.75 * k; GRADE.desat = Math.max(G0.desat, 0.7 * k); GRADE.exposure = G0.exp * (1 - 0.3 * k); };
    for (const f of this.foes) if (f.st !== 'dead' && f.pos.distanceTo(h.pos) < 14) interruptFoe(f, 4);
    const feet = h.pos.clone().setY(0), side0 = V3(1, 0, 0);
    trailSeg(feet.clone().addScaledVector(side0, -9).setY(1.1), feet.clone().addScaledVector(side0, 9).setY(1.1), 0xffffff, 0.3, { life: 0.45, bright: 3.4, spark: 0.6 });
    this.flashScreen(0.4, 0xffffff); this.camPunch(0.08); shake(0.25 * TUNE.shake); cue('draw', 1); cue('timeSlow', 1); audio.stillness(2.2);
    anim(0.18, k => ink(k), undefined, { real: true });
    await waitReal(0.12);
    // 烟遁: the hero goes up in a burst of smoke (act-13 用户：「影分身的特效挺叼的，可以拿给别的技能」)
    smokeBurst(feet, 0.9, 14, { yaw: h.a.yaw, life: 0.5 }); h.a.body.visible = false; fxRing(feet.clone().setY(0.06), 0xa0a8c0, 1.8, { life: 0.4 } as never); cue('whoosh', 0.9);
    await waitReal(0.12);
    // two shadow passes through each target, from either side, one after another; each leaves its streak hanging in the air
    const passes: Array<[Foe, number]> = []; for (let r = 0; r < 2; r++) targets.forEach((f, i) => passes.push([f, i * 2 + r]));
    passes.forEach(([f, j], n) => {
      after(n * 0.06, () => {
        if (f.st === 'dead') return;
        const base = Math.atan2(f.pos.x - feet.x, f.pos.z - feet.z) + (j % 2 ? 1.1 : -1.1) + (Math.random() - 0.5) * 0.5;
        const dir = V3(Math.sin(base), 0, Math.cos(base)), reach = f.d.r + 1.6;
        const from = f.pos.clone().addScaledVector(dir, -reach).setY(0); this.clamp(from, 0.3);
        const to = f.pos.clone().addScaledVector(dir, reach).setY(0);
        smokeBurst(from, 0.35, 3, { size: 0.2, life: 0.3 });
        trailSeg(from.clone().setY(1.0), to.clone().setY(1.0), j % 2 ? 0xffe6b8 : 0xfff6e8, 0.12, { life: 1.9, bright: 3, spark: 0.3 });
        spawnClone(h.a, from, f.pos.clone(), Math.max(0.3, from.distanceTo(f.pos) - (f.d.r + 0.55)), () => {
          cloneCut(f.a.chest(), dir.clone(), j % 2 ? 0xff7a5a : 0xff5a3a, 1.1, j % 2 === 0);
          fxSparks(f.a.chest(), 0xffffff, 10, 4); f.a.tint(0xffffff, 0.35); blood.spray(f.a.chest(), dir, 12, 1.2);
          cue('flurry', 0.6 + 0.3 * n / passes.length, 1); hitstop(0.015); this.camKick(dir, 0.06 * TUNE.shake / 2);
        });
      }, { real: true });
    });
    await waitReal(0.06 * passes.length + 0.5);
    // she stands up out of the smoke where she vanished: the world holds its breath, then the sheath clicks home
    smokeBurst(feet, 0.4, 6, { size: 0.22, life: 0.35, yaw: h.a.yaw }); h.a.body.visible = true; cue('whoosh', 0.4);
    h.a.play(new Action('cast', 0.5, 0.4));
    await waitReal(0.3);
    hitstop(0.3); await waitReal(0.32);
    // 11-18 (用户：「终极技能应该是有一个爆发绽裂的伤害，而不是一次性的，要响起多段快速斩击的声音才爽」): the blade clicks home and
    // every one the clones cut bursts open — ULT_TICKS quick cuts across each of them (a streak of light, a spray, a small number and
    // a short slash sound each, a hair of hit-stop), then the last one crosses them all wide open
    cue('sheathe', 1); this.camPunch(0.04); this.flashScreen(0.15, 0xfff0d0);
    const tickDmg = Math.max(1, Math.round(TUNE.ultDmg * ULT_TICK_SHARE));
    for (let i = 0; i < ULT_TICKS; i++) {
      await waitReal(ULT_GAP * (1 - 0.35 * i / ULT_TICKS));   // a little faster as it goes
      let any = 0;
      for (const f of targets) {
        if (f.st === 'dead') continue; any++;
        const c = f.a.chest(), a = Math.random() * Math.PI, v = V3(Math.cos(a) * 0.85, Math.sin(a) * 0.65, Math.sin(a) * 0.3);
        trailSeg(c.clone().sub(v), c.clone().add(v), i % 2 ? 0xffe2b0 : 0xff9a6a, 0.075, { life: 0.12, bright: 2.8, spark: 0.2 });
        this.hitFoe(f, tickDmg, h.pos.clone(), { knock: 0.05, heavy: false, kind: 'ultTick', stagger: 0.5 });
        // (each cut only a glint on the body — a full white flash every 65 ms washed the burst into one white blob)
        const fa = f.a as unknown as { flash: number; flashCol: THREE.Color }; fa.flash = 0.3; fa.flashCol.setRGB(1, 0.86, 0.66);
      }
      if (any) { cue('flurry', 0.7 + 0.3 * i / ULT_TICKS, this.fleshHit ? 1 : 0); this.fleshHit = false; hitstop(0.012); this.camKick(V3(Math.random() - 0.5, 0, Math.random() - 0.5), 0.05 * TUNE.shake / 2); this.flashScreen(0.05, 0xffe8c8); }
    }
    await waitReal(ULT_GAP * 1.6);
    // the last cut: one great cross through all of them (across their middle, as wide as they stand), then the ink lifts
    const alive = targets.filter(f => f.st !== 'dead'), C = V3();
    for (const f of alive) C.add(f.pos);
    if (alive.length) C.multiplyScalar(1 / alive.length); else C.copy(h.pos);
    const R = Math.max(1.5, ...alive.map(f => f.pos.distanceTo(C))) + 1.6, d1 = V3(1, 0, 0.55).normalize(), d2 = V3(-1, 0, 0.55).normalize();
    for (const d of [d1, d2]) {
      trailSeg(C.clone().addScaledVector(d, -R).setY(1.0), C.clone().addScaledVector(d, R).setY(1.0), 0xffffff, 0.38, { life: 0.7, bright: 3.6, spark: 1 });
      trailSeg(C.clone().addScaledVector(d, -R).setY(1.04), C.clone().addScaledVector(d, R).setY(1.04), 0xffd890, 0.14, { life: 0.85, bright: 3, spark: 0.4 });
    }
    const fin = Math.max(1, TUNE.ultDmg - tickDmg * ULT_TICKS);
    for (const f of targets) if (f.st !== 'dead') { blood.spray(f.a.chest(), f.pos.clone().sub(C).setY(0).normalize(), 30, 1.5); this.hitFoe(f, fin, C.clone(), { knock: 1.8, heavy: true, kind: 'ult' }); }
    hitstop(0.22); slowmo(0.6, 0.3); shake(0.8 * TUNE.shake); this.camPunch(0.1); this.flashScreen(0.42, 0xffffff);
    fxRing(C.clone().setY(0.08), 0xfff0c0, R + 1.5, { life: 0.7 } as never); fxRing(C.clone().setY(0.9), 0xffffff, R, { life: 0.4 } as never);
    cue('ultSlash', 1.2); cue('hitIai', 1, 1); cue('boom', 0.6); this.platform.vibrate('heavy');
    await waitReal(0.25);
    anim(0.6, k => ink(1 - k), () => { GRADE.vig = G0.vig; GRADE.desat = G0.desat; GRADE.exposure = G0.exp; }, { real: true });
    this.ultOn = false; h.inv = 0.5;
  }
  /** a batted arrow strikes a foe */
  private arrowHit(f: Foe, a: Arrow) {
    const from = a.p.clone().addScaledVector(a.v.clone().normalize(), -1);
    this.hitFoe(f, TUNE.deflectDmg, from, { knock: 1.2, heavy: true, kind: 'arrow' });
    fxSparks(a.p.clone(), 0xffd070, 16, 6); this.feel('arrow', true, 1, a.v.clone());
  }
  /** the plunge lands: everything round the hero is hit and thrown outward; dust and a ring even on a miss */
  private slam(o: { at: THREE.Vector3; r: number; dmg: number; yaw: number }) {
    let n = 0;
    for (const f of this.foes.slice()) { if (f.st === 'dead' || f.pos.distanceTo(o.at) > o.r + f.d.r) continue; this.hitFoe(f, o.dmg, o.at, { knock: 1.3, heavy: true, kind: 'plunge' }); n++; }
    if (this.props) this.applyProps(this.props.hitCircle(o.at.x, o.at.z, o.r, { src: 'hero', heavy: true, dir: [Math.sin(o.yaw), Math.cos(o.yaw)] }, this.targets()));   // act-19
    fxRing(o.at.clone().setY(0.06), 0xffd8a0, o.r, { life: 0.4 } as never); dustBlocks(o.at.clone(), 12); this.leaves?.blast(o.at.x, o.at.z, o.r + 0.8, 5);
    fxSmoke(o.at.clone().setY(0.2), 0x8a7a6a, 8, { r: o.r * 0.6, spd: 2.4, up: 0.3, s: 0.45, life: 0.6 });
    if (n) this.feel('plunge', true, n); else { shake(0.2 * TUNE.shake); this.camPunch(0.02); cue('land', 1); }
    if (hasBoon(this.perks, 'rift')) this.riftOut(o.at.clone(), o.yaw);   // 11-18 秘传 裂地
    return n;
  }
  /** 11-18 打出界 (用户问后定「场景形态」带「打出界」: 打进水里 / 沟里直接死，哈迪斯那样): a foe whose middle is over a pit (it got there
   *  knocked back or thrown — walking, the edge holds it) goes down: it tips over and drops, into the water with a splash and a ring of
   *  spray, down a gully with a cry and a puff of dust far below; it counts as a kill, its coins come up from the edge. The boss never
   *  goes (his clamp holds him at the edge); a dummy neither. */
  private pitFalls(dt: number) {
    const g = this.grid;
    if (g && this.phase !== 'cine' && this.phase !== 'talk') for (const f of this.foes) {
      if (f.st === 'dead' || isBoss(f) || f.kind === 'dummy' || f.pos.y > 0.25 || this.falling.some(x => x.f === f)) continue;
      const kind = g.pitAt(f.pos.x, f.pos.z); if (!kind) continue;
      // in: the warning goes, it stops being a fighter, its cry; the kill is counted now (the room clears on the last one)
      dropTeles(f); f.attacking = false; f.lunge = null; f.airV = undefined; f.st = 'dead';
      const v = f.vel.clone().setY(0); if (v.lengthSq() < 0.5) v.setLength(1.2);
      this.falling.push({ f, t: 0, vy: kind === 'water' ? -1.2 : 0.6, kind, v });
      cue('foeDeath', 1, voiceOf(f)); this.log.push(`pit ${kind} ${f.kind}`);
      cue(kind === 'water' ? 'splash' : kind === 'molten' ? 'fire' : 'dropFar', 1);
      this.killFoe(f, f.pos.clone().sub(v));
    }
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const q = this.falling[i], f = q.f; q.t += dt;
      // the fall: it carries on over the pit a little, tips forward and drops — faster and faster
      q.v.multiplyScalar(Math.exp(-dt * 3)); f.pos.addScaledVector(q.v, dt); q.vy -= 22 * dt; f.pos.y += q.vy * dt;
      const tip = Math.min(1.5, q.t * 4.2); f.a.body.rotation.x = tip;
      f.a.place(f.pos.clone(), f.yaw);
      const floorY = q.kind === 'molten' ? COPPER_Y : q.kind === 'water' ? -0.56 : -1.4;
      if (q.kind === 'molten' && f.pos.y < floorY + 0.1 && !f.a.root.userData.splashed) {
        f.a.root.userData.splashed = true;
        const at = V3(f.pos.x, floorY, f.pos.z);
        fxEmbers(at, 0xff7422, 18, { up: 1.8 }); fxFlare(at, 0xffaa44, 1.8, 0.35);
      }
      if (q.kind === 'water' && f.pos.y < floorY + 0.1 && !f.a.root.userData.splashed) {
        f.a.root.userData.splashed = true; const at = V3(f.pos.x, floorY + 0.05, f.pos.z);
        fxRing(at.clone().setY(floorY + 0.03), 0xd8e8f0, 1.4, { life: 0.5 } as never); fxSparks(at.clone().setY(floorY + 0.25), 0xe8f4ff, 26, 5, { grav: 14, life: 0.6 } as never); fxSmoke(at.clone().setY(floorY + 0.4), 0xd8e4ea, 5, { r: 0.6, spd: 1.4, up: 1.2, s: 0.35, life: 0.6, alpha: 0.5 });
        shake(0.12 * TUNE.shake);
      }
      if (q.kind === 'ditch' && f.pos.y < floorY + 0.4 && !f.a.root.userData.splashed) {
        f.a.root.userData.splashed = true; fxSmoke(V3(f.pos.x, -1.1, f.pos.z), 0x8a7a62, 7, { r: 0.6, spd: 1.2, up: 1.0, s: 0.4, life: 0.8, alpha: 0.6 }); shake(0.08 * TUNE.shake);
      }
      if (f.pos.y < floorY - (q.kind === 'water' ? 1.8 : 0.6) || q.t > 2.2) { f.a.dispose(); this.falling.splice(i, 1); }
    }
  }
  private killFoe(f: Foe, from: THREE.Vector3) {
    if (this.flats.has(f)) { f.a.body.rotation.x = 0; f.a.body.position.y = 0; this.flats.delete(f); }   // (11-18 踏顶: up off his face before he falls)
    // (a foe gone down a pit is already out of sight: no body to topple, no pool of blood)
    const fell = this.falling.some(x => x.f === f);
    if (f.elite) this.eliteKills++; if (isBoss(f)) this.bossKilled = true;
    // 11-18: the kill holds the blow a little longer (feel()); the cry and the gush now, the body on the ground a moment later
    if (!fell) { this.killBeat = true; after(0.32, () => cue('bodyFall', 0.7)); }
    // act-23: a pool spreads under the body as it settles
    if (f.kind !== 'dummy' && !fell) { const bx = f.pos.x, bz = f.pos.z, sz = isBoss(f) ? 2.0 : f.elite ? 1.4 : 1.05; after(0.45, () => blood.pool(bx, bz, sz)); cue('hitKill', isBoss(f) ? 1.3 : 1); cue('foeDeath', 1, voiceOf(f)); }
    if (!fell) this.leaves?.blast(f.pos.x, f.pos.z, 1.3, 2.5);
    this.kills++;
    const boss = isBoss(f), elite = !!f.elite;
    unfade(f);   // (11-18: a hidden 死士 / a 水鬼 under the water is seen as it dies)
    // (11-18: killed up in the air — 断云 — the body falls the rest of the way first; death.ts topples from where the root stands)
    if (fell) { /* gone down a pit: out of sight already */ }
    else if (f.pos.y > 0.05) { this.drops.push({ f, from: from.clone(), boss, vy: Math.min(0, f.airV ?? 0) }); f.airV = undefined; }
    else void playDeath(f.a, { from, ratio: f.lastDmg / f.maxHp + (boss ? 0.5 : 0), boss }).then(() => { f.a.dispose(); });
    // copper coins: a few square-holed coins bounce out and fly to the hero (worth the foe's gold; elites ×3, the boss more); one gone
    // down a pit throws its coins up from the edge it went over
    const coinAt = fell && this.grid ? (([x, z]) => V3(x, 0, z))(this.grid.nearestFloor(f.pos.x, f.pos.z)) : f.pos.clone();
    if (this.room >= 0 && f.kind !== 'dummy') { const total = boss ? 60 : f.d.gold * (elite ? 3 : 1), n = Math.min(10, total); this.coinsFx.drop(coinAt, n, Math.max(1, Math.round(total / n))); }
    if (hasBoon(this.perks, 'drink') && this.hero.alive) {
      // 11-18 秘传 饮血: a thread of blood flies from the body to her and she heals as it arrives (the number is the boon's)
      const h = this.hero, from0 = f.a.chest(), heal = v(this.perks, 'drink');
      for (let i = 0; i < 6; i++) addBlock(from0.clone().add(V3(R(-0.2, 0.2), R(-0.1, 0.3), R(-0.2, 0.2))), { size: 0.08, col: 0xb01818, glow: false, life: 0.32 + i * 0.03, shrink: 0.1, v: h.a.chest().sub(from0).multiplyScalar(1 / (0.3 + i * 0.03)) });
      after(0.32, () => { if (!h.alive) return; h.hp = Math.min(h.maxHp, h.hp + heal); this.hud.flask.heal({ hp: h.hp, maxHp: h.maxHp }); h.a.tint(0xff4a3a, 0.35); popPix(`+${heal}`, h.a.head().add(V3(0, 0.3, 0)), { color: '#ff8a7a', h: 0.42, life: 0.7 }); });
    }
    const left = this.foes.filter(x => x.st !== 'dead').length;
    if (boss) { slowmo(1.1, 0.25); shake(0.6 * TUNE.shake); cue('win', 0.9); }
    if (!left && this.phase === 'fight') {
      const lastWave = this.wave >= (this.plan?.waves.length ?? 1) - 1;
      if (!boss) slowmo(lastWave ? 0.7 : 0.35, 0.3);
      if (lastWave) after(1.0, () => this.roomClear());
      else if (this.stageOf.length && this.stageOf[this.wave + 1] !== this.stageOf[this.wave]) {
        // 11-18 定死的屋子: this piece of the floor is clear — its doors on to the next open; the next wave comes when she walks in there
        const from = this.stageZ[this.stageOf[this.wave]], to = this.stageZ[this.stageOf[this.wave + 1]]; this.wave++;
        after(0.6, () => { if (this.phase !== 'fight' || !this.pieces) return; for (const q of this.pieces.pieces) if (q.kind === 'door' && q.sides.includes(from) && q.sides.includes(to)) this.pieces.openPiece(q); this.waitZone = to; });
      } else { this.wave++; after(0.9, () => { if (this.phase === 'fight') { this.banner.show(msg`第 ${this.wave + 1} 波`, '', 0.9); this.spawnWave(); } }); }
    }
  }
  private hurtHero(dmg: number, from: THREE.Vector3, attacker?: Foe) { // wp/boons: melee source is explicit
    // 11-18 QTE: held in a 拼刀 / a 连环 beat, nothing else reaches her (the duel lands its own blows on her through here once it lets go)
    if (this.duel.shields) return;
    // 11-18 拼刀: an elite's / a boss's heavy blow falling on her 破势 window — blades lock instead of the parry
    if (this.hero.parrying && attacker && this.duel.offerClash(attacker)) return;
    // the yard: nobody dies there (the flask fills back up first); 11-18: nor under __dh.god (captures of a boss fight from start to end)
    if ((this.phase === 'yard' || this.god) && !this.hero.iframe && this.hero.hp - dmg <= 0) { this.hero.hp = this.hero.maxHp; this.hud.flask.heal({ hp: this.hero.hp, maxHp: this.hero.maxHp }); }
    // a blow that lands in the dash's invulnerable moment: a perfect dodge
    if (this.hero.parrying) { this.iaiParry(from); return; }
    if (this.hero.dodging) { this.perfectDodge(from); return; }
    if (this.wine && dmg > 0 && this.phase !== 'yard' && this.hero.alive && !this.hero.iframe && this.hero.inv <= 0) {
      // 瓦壶烈酒 (杜五's wine): the first blow of the run lands without blood — she staggers, grins, goes on
      this.wine = false; this.hero.inv = Math.max(this.hero.inv, 0.8); fxRing(this.hero.pos.clone().setY(0.08), 0xffb060, 2.4, { life: 0.5 } as never); cue('parry', 0.8); hitstop(0.06); return;
    }
    if (this.defy > 0 && this.phase !== 'yard' && this.hero.alive && !this.hero.iframe && this.hero.hp - dmg <= 0) {
      // act-20 闭息 (the healer's upgrade): the blow lands, but she keeps three tenths and a moment's grace
      this.defy--; dmg = Math.max(0, this.hero.hp - Math.round(this.hero.maxHp * 0.3)); this.hero.inv = Math.max(this.hero.inv, 1.2);
      slowmo(0.8, 0.25); fxRing(this.hero.pos.clone().setY(0.08), 0xbfe8ff, 3, { life: 0.6 } as never); cue('timeSlow', 0.7);
    }
    if (this.prologue && this.hero.hp - dmg <= 0) { dmg = Math.max(0, this.hero.hp - 1); if (this.prologue === 2) { void this.prologueFall(); return; } }   // act-29
    if (!this.hero.hurt(dmg, from)) return;
    // where it came from: a red arc at the feet facing the attacker
    this.hitArcs.show(this.hero.pos, from);
    this.hud.flask.hit(dmg, { hp: this.hero.hp, maxHp: this.hero.maxHp });
    popPix(`-${dmg}`, this.hero.a.head().add(V3(0, 0.3, 0)), { color: '#ff5a4a', h: 0.5, life: 0.8 });
    fxSparks(this.hero.a.chest(), 0xff4a3a, 12, 4); this.hero.a.tint(0xff3020, 0.9);
    { const away = this.hero.pos.clone().sub(from).setY(0); if (away.lengthSq() < 1e-4) away.set(0, 0, 1); blood.spray(this.hero.a.chest(), away.normalize(), 7, 0.8); }
    hitstop(0.07 * TUNE.hitstop); shake(0.42 * TUNE.shake); cue('hurt', 0.9); this.platform.vibrate('heavy');
    if (!this.hero.alive) this.dead();
  }
  // ------------------------------------------------------------ clear → pick → doors → leave
  private async roomClear() {
    if (this.phase !== 'fight') return;
    // (act-50 用户：「我听线上版获胜和失败的声音还是老版的」: the clear was still the act-19 jingle — the user's win sound now, whole;
    //  it fades as she walks out of the room (or when a new piece of music starts))
    this.phase = 'pick'; cue('stingWin', 1); audio.duckMusic(0.35, 3.2);
    if (this.pieces) for (const q of this.pieces.pieces) if (q.kind === 'door') this.pieces.openPiece(q);   // (11-18: a drawn room's side yards)
    // (11-18: a bolt / talisman / mark still on its way when the last foe fell would hang mid-flash through the talks and cards that follow)
    for (const a of this.arrows) a.kill(); this.arrows.length = 0;
    this.banner.show('清场', '', 1.0, '#ffe6a0');
    await new Promise(r => after(0.9, () => r(null)));
    if (this.prologue) { this.openDoors(); return; }   // act-29: the prologue's road just goes on
    // 11-18 一局五关: a region's boss fell — region one's after-talk (褚雷) the first time; then the run is won (the last region) or the
    // road opens into the next region (a boon first, as any cleared fight)
    if (this.plan?.type === 'boss' && isBossRoom(this.region, this.room)) {
      this.bosses++;
      if (this.region === 0 && seeOnce('ch1_boss_after')) { this.musicHold = 'bgm_afterkill'; void audio.playMusic('bgm_afterkill', 1.0); await this.talk(CHULEI_AFTER); saveProfile(); this.musicHold = null; }
      if (afterBoss(this.region) === 'won') { this.end(true); return; }
      await this.boonPick(); this.openDoors(); return;
    }
    const rw = this.plan?.reward ?? null;
    if (rw?.k === 'coins') { this.coinsFx.drop(this.hero.pos.clone().add(V3(0, 0, -1.5)), 12, Math.round(rw.n / 12)); this.banner.show('铜钱', `${rw.n}`, 1.0, '#ffd24a'); }
    else if (rw?.k === 'heal') { this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + Math.round(this.hero.maxHp * 0.35)); this.hud.flask.heal({ hp: this.hero.hp, maxHp: this.hero.maxHp }); this.banner.show('回复', '三成五生命', 1.0, '#9aff9a'); await new Promise(r => after(0.8, () => r(null))); }
    else if (rw?.k === 'manual') await this.manualPick();
    else {
      await this.boonPick();
    }
    this.openDoors();
  }
  /** 11-18 定死的屋子: a reward picked up (a hidden room's, an islet's): coins, a heal or (when the room is calm) a boon, by the room */
  private async reward() {
    const k = ((this.spec?.seed ?? 0) + this.rewardsGot++) % 3, calm = !this.foes.some(f => f.st !== 'dead' && f.kind !== 'dummy');
    if (k === 1) { this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + Math.round(this.hero.maxHp * 0.25)); this.hud.flask.heal({ hp: this.hero.hp, maxHp: this.hero.maxHp }); this.banner.show('回复', '两成五生命', 1.0, '#9aff9a'); }
    else if (k === 2 && calm && (this.phase === 'fight' || this.phase === 'doors')) await this.boonPick();
    else { this.coinsFx.drop(this.hero.pos.clone().add(V3(0, 0, -0.6)), 10, 3); this.banner.show('铜钱', '30', 1.0, '#ffd24a'); }
  }
  /** three boons with rolled tiers — a 死士 room rolls better */
  private async boonPick() {
    const odds = this.plan?.type === 'elite' ? [0.35, 0.45, 0.2] : [0.7, 0.25, 0.05];
    const pick = drawBoons('any', 3, Math.random, this.perks, odds); if (!pick.length) return;
    const was = this.phase; this.phase = 'pick'; this.hud.on = false; this.banner.hide();
    const i = await this.cards.open(pick); const b = pick[i]; this.take(b.boon, b.tier);
    this.hud.on = true; this.phase = was === 'pick' ? 'pick' : was;
  }
  /** the boons in hand that can still go up a tier */
  private sharpenable() { return BOONS.filter(b => this.perks.owned[b.id] != null && this.perks.owned[b.id] < 2); }
  /** 磨刀: pick one of the boons in hand (shown at its next tier); it goes up a tier */
  private async sharpen() {
    const own = this.sharpenable().sort(() => Math.random() - 0.5).slice(0, 3); if (!own.length) return;
    const cards: BoonPick[] = own.map(b => ({ boon: b, tier: this.perks.owned[b.id] + 1 }));
    const was = this.phase; this.phase = 'pick'; this.hud.on = false; this.banner.hide();
    const i = await this.cards.open(cards); const b = own[i]; upgradeBoon(this.perks, b.id); this.log.push(`sharpen ${b.id} ${this.perks.owned[b.id]}`); this.syncMarks();
    this.hud.on = true; this.phase = was; this.banner.show(b.name, TIER_NAMES[this.perks.owned[b.id]], 1.2, b.col);
  }
  /** a station's ring filled: pay, then do its thing */
  private async useStation(s: Station) {
    if (!this.stations) return;
    if (s.price > this.coins) return;
    this.coins -= s.price; cue(s.price ? 'coin' : 'reveal', 0.6); this.log.push(`station ${s.id}`);
    const heal = (k: number) => { this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + Math.round(this.hero.maxHp * k)); this.hud.flask.heal({ hp: this.hero.hp, maxHp: this.hero.maxHp }); };
    if (s.id === 'buy_boon') { this.stations.spend(s); await this.boonPick(); }
    else if (s.id === 'buy_heal') { this.stations.spend(s); heal(0.4); this.banner.show('金疮药', '四成生命', 1.0, '#9aff9a'); }
    else if (s.id === 'buy_sharpen') { this.stations.spend(s); await this.sharpen(); }
    else if (s.id === 'rest_heal') { this.stations.spend(s, true); heal(0.4); this.banner.show('裹伤调息', '四成生命', 1.0, '#9aff9a'); }
    else if (s.id === 'rest_sharpen') { this.stations.spend(s, true); await this.sharpen(); }
    else if (s.id === 'scroll' && drawManuals(this.perks.moves, 1, Math.random).length) { this.stations.spend(s); await this.manualPick(); }   // act-19: the 遗卷 altar gives a 刀谱 while any are left
    else if (s.id === 'scroll') { this.stations.spend(s); await this.boonPick(); }
  }
  private take(b: Boon, tier = 0) { // wp/boons: ownership lives on Perks
    applyBoon(this.perks, b.id, tier); this.log.push(`boon ${b.id} tier ${tier}`); // wp/boons: apply the selected tier
    this.syncMarks();
    // (11-18: the banner says the one line of what it does — the card's — not the old percentages)
    this.banner.show(b.name, boonEffect(b), 1.4, b.col);
  }
  private openDoors(quiet = false) {
    const ds = this.nextRooms, ids = (this.spec?.exits ?? []) as ExitId[];
    this.doors = ds.map((d, i) => {
      const ex = exitInfo(this.layout!, ids[i] ?? 'back');
      const { g } = runBoard(d, LOCALES[d.locale]?.name ?? ''); g.position.set(ex.sign.x, -2.4, ex.sign.z); g.scale.setScalar(1.25);
      // act-19: on the 2x stage the board stands inside the room beside its gate
      const gt = this.arena?.gates.find(q => q.open && q.id === (ids[i] ?? 'back'));
      if (gt) { if (gt.along === 'x') g.position.set(gt.x + gt.w / 2 + 1.3, -2.4, PLAY.z0 + 0.9); else g.position.set(gt.x - gt.out[0] * 1.2, -2.4, gt.z - gt.w / 2 - 0.8); }   // beside the gate, on its far side (never in front of the opening)
      g.rotation.y = Math.atan2(-g.position.x * 0.4, 12); this.stage?.root.add(g);
      return { ex, g, lift: 0 };
    });
    this.phase = 'doors'; cue(this.gates ? 'gateOpen' : 'reveal', 0.8); if (this.gates) after(0.6, () => cue('exitChime', 0.7)); this.gates?.open(); this.gustT = 0.9;
    if (!quiet) this.banner.show('去路', ds.length > 1 ? '走进一条路口' : '往前走', 1.2);
  }
  private leave(i: number) {
    if (this.phase !== 'doors') return;
    this.phase = 'leaving'; audio.stopSting(1.2); const d = this.doors[i], next = this.nextRooms[i];
    this.plan = next; const fromLocale = this.locale; this.locale = next.locale; if (this.prologue === 1) { this.prologue = 2; this.proFightT = 0; }
    // 11-18 一局五关: the road out of a boss room goes into the next region — its rooms count from one again, its own kinds of room,
    // its foes stronger (the run's TUNE scaled by flow.ts regionScale)
    const nextRegion = !this.prologue && next.region != null && next.region !== this.region;
    const h = this.hero; h.vel.set(d.ex.dir[0], 0, d.ex.dir[1]).multiplyScalar(TUNE.heroSpeed * 0.8);
    WIPE.look = 'bamboo'; void fromLocale;   // (11-19: bamboo for every room — the timber post is gone)
    after(0.35, () => { void wipeTransit(() => {
      if (nextRegion) { this.region = next.region!; this.room = 0; this.visited = []; this.regionIn = true; this.scaleFoes(this.region); this.log.push(`region ${this.region} ${REGIONS[this.region]?.id}`); }
      else this.room++;
      return this.buildRoom(false);
    }); });
  }
  private dead() {
    this.phase = 'dead'; this.justDied = true; this.bankRun(false); audio.stopMusic(1.4); cue('stingLose', 1); slowmo(1.2, 0.3); this.banner.show('败北', '', 1.6, '#ff6a5a');
    // (act-50: the user's lose sound opens on a second of near silence and lands its heavy blow at 2–3 s — the card waits for it)
    after(2.8, async () => {
      this.hud.on = false;
      await this.cards.open([returnCard(this.kills)]); // wp/boons: adapt non-boon cards and centralize their copy
      this.hud.on = true; void wipeTransit(() => this.enterYard());
    });
  }
  private end(win: boolean) {
    this.phase = 'end'; this.bankRun(win); audio.stopMusic(2.0); cue(win ? 'stingWin' : 'stingLose', 1);
    after(0.4, async () => {
      this.hud.on = false;
      await this.cards.open([{ boon: { id: win ? 'again' : 'retry', school: 'sr', name: win ? REGIONS[REGIONS.length - 1].name : '再来一次', desc: [win ? msg`${EDEFS[REGIONS[REGIONS.length - 1].boss as EKind]?.name ?? ''}伏诛` : '回练武场再出发', msg`斩了 ${this.kills} 个 · 点这里回练武场`], col: '#ffd070', glyph: BOONS.find(b => b.id === 'behead')!.glyph }, tier: 0 }]);
      this.hud.on = true; void wipeTransit(() => this.enterYard());
    });
  }
  // ------------------------------------------------------------ frame
  /** debug / captures: a fixed camera (__dh.cam([x,y,z],[lx,ly,lz],fov) / __dh.cam(null)) */
  camOverride: { base: THREE.Vector3; look: THREE.Vector3; fov: number } | null = null;
  private camPose() {
    if (this.camOverride) return { base: this.camOverride.base.clone(), look: this.camOverride.look.clone(), fov: this.camOverride.fov };
    // the yard's costume rack: the camera leans in (half the distance) so the models can be looked at
    // (11-18: a later region's boss coming in — the camera draws back a while so he and the back of his room are in the frame together)
    const n = this.yard?.near ?? 0, k = (1 - 0.55 * n) * (1 + 0.08 * this.crowd) * (1 + 0.32 * this.bossLook);
    const base = this.cam.clone().add(V3(0, TUNE.camH * k, TUNE.camD * k)), look = this.cam.clone().add(V3(0, 0.6 + 0.5 * n, 0));
    // 11-18 QTE (用户：「QTE的时候要带镜头表现噢」): the duel's own framing blended over this one while it runs
    return this.duel.cam({ base, look, fov: TUNE.camFov });
  }
  /** act-50 debug: fast-forward the story (FX.speed up, every line advanced at once, voices hushed) until play resumes */
  private storySkip = false; private storyIdle = 0; private storyWas = 1; private storyT = 0;
  private skipStory() { if (this.storySkip) return; this.storySkip = true; this.storyIdle = 0; this.storyWas = FX.speed; FX.speed = 12; this.storyT = performance.now(); }
  private storySkipFrame() {
    if (!this.storySkip) return;
    const now = performance.now(), real = Math.min(0.1, (now - this.storyT) / 1000); this.storyT = now;
    if (this.dialogue.on) { this.dialogue.advance(); this.dialogue.advance(); audio.stopVoice(); }
    const busy = this.phase === 'cine' || this.phase === 'talk' || this.phase === 'opening' || this.timeline.on || this.dialogue.on || !!this.hero?.scriptPose;
    this.storyIdle = busy ? 0 : this.storyIdle + real;
    if (this.storyIdle > 0.5) { this.storySkip = false; FX.speed = this.storyWas; }
  }
  private frame(dt: number, rdt: number) {
    if (bladeBusy()) return;
    this.storySkipFrame();
    if (PAUSE.on) { this.L.text.hide('act.npc'); return; }   // the pause menu runs on its own (real time); the world gets nothing (11-18: a hideout name over the menu's pages hidden)
    this.inp.frame(rdt);
    this.padScreens(rdt);
    if (this.phase === 'opening' || this.phase === 'title') return;   // opening.ts / title.ts run the start screen
    // act-20: a cutscene or a conversation — the timeline / the dialogue run, the people idle, nothing fights
    // (act-26: once a conversation ends the phase moves on at once — the portraits still have to slide out, so keep driving them)
    if (this.phase !== 'cine' && this.phase !== 'talk') { this.dialogue.update(rdt); this.timeline.update(rdt); }   // (act-36: the letterbox slides back out)
    if (this.phase === 'cine' || this.phase === 'talk') {
      this.timeline.update(rdt); this.dialogue.update(rdt);
      // the bot reads fast: a line every 0.6 s (cutscenes play out)
      if (this.botOn && this.dialogue.on && (this.botTalkT += rdt) > 0.6) { this.botTalkT = 0; this.dialogue.advance(); }
      if (this.phase === 'talk') { this.hero.a.update(dt); this.hero.scriptPose?.(); for (const f of this.foes) f.a.update(dt); for (const n of this.npcs) n.a.update(dt); this.leaves?.update(dt, this.cam.x, this.cam.z); this.gates?.update(dt); }
      for (const f of this.puppets) if (this.phase === 'talk' && !f.a.root.userData.still) f.a.update(dt);   // (act-30: the dead stay still)
      blood.update(dt);   // (11-18: the prologue's wound bleeds through the cutscene and the talk — the drops fall instead of hanging in the air)
      this.hud.update(rdt, this.inp, []); this.L.on = true; return;
    }
    // act-29: the prologue's temple — about half a minute in, his blow ends it whatever her blood
    if (this.prologue === 2 && this.phase === 'fight' && !this.proFalling && this.foes.some(f => isBoss(f))) { this.proFightT += dt; if (this.proFightT > 60) void this.prologueFall(); }   // (a fallback only: the fifth of his life is the cue)
    if (this.botOn) this.bot();
    // the model page plays 不见刀's QTE by itself (press as the ring closes)
    else if (this.labOn && this.qteT >= 0) { const k = this.qteT / TUNE.qteTime, b = this.inp.b.ult, on = k > 0.85 && k < 1.0; b.pressed = on && !b.down; b.down = on; }
    const h = this.hero; if (!h) return;
    // 11-18: a 刀谱's demonstration — the ghost plays on real time, the HUD shows its presses; she stands still, the world is quiet
    if (this.demo.on) {
      this.demo.update(rdt);
      if (this.inp.b.attack.pressed || this.inp.b.dash.pressed || this.inp.b.jump.pressed || this.inp.b.special.pressed || padNav.poll(0).any) this.demo.skip();
    }
    const busy = this.cards.on || this.phase === 'leaving' || this.ultOn || !!h.scriptPose || this.demo.on || this.duel.locks;   // (act-46: lying on the mat / getting up — no sliding off it) (11-18 QTE: held in a 拼刀 / a 连环)
    this.qteFrame(rdt); this.parryCd -= rdt;
    this.duel.frame(rdt);   // 11-18 拼刀 / 连环破势: reads the attack button before it is cleared below
    if (busy) { for (const b of Object.values(this.inp.b)) { b.pressed = false; b.down = false; b.held = 0; } this.inp.move.x = this.inp.move.y = 0; }
    if (this.phase === 'intro') { this.introT += dt; this.inp.move.x = 0; this.inp.move.y = this.introT < 0.5 ? 0.7 : 0; for (const b of Object.values(this.inp.b)) { b.pressed = false; b.down = false; b.held = 0; } }
    this.statusStep(dt, h);
    // (11-18: her blade's aim and the auto-aimed darts don't find a foe out of sight — a 死士 in the shadow, a 水鬼 under the water)
    // (11-19: a foe still running in / over the wall is not on the floor yet — no blade reaches it, and it strikes at nothing)
    this.heroWorld.foes = this.foes.some(f => f.mem.hidden) || this.entering.length ? this.foes.filter(f => !f.mem.hidden && !this.entering.some(e => e.f === f)) : this.foes;
    h.update(dt, this.inp, this.heroWorld);
    this.hud.setAim(h.aiming ? { x: h.aimDir.x, y: -h.aimDir.z } : null);   // act-29: the dart button leans to the aim
    if (h.aiming) { const pv = h.aimPreview(this.heroWorld), L = TUNE.dartRange, al = this.aimLine;
      al.visible = true; al.position.set(h.pos.x, 0.07, h.pos.z); al.rotation.y = Math.atan2(pv.dir.x, pv.dir.z); al.scale.set(1, 1, L);
      const cap = al.getObjectByName('cap')!; cap.scale.set(1, 1, 1 / L); (al.material as THREE.MeshBasicMaterial).color.set(pv.onFoe ? 0xffd27a : 0xe8eeff); }
    else this.aimLine.visible = false;
    h.a.update(dt); h.deathPose(); h.scriptPose?.(); for (const a of this.lineupActors) a.update(dt);
    if (this.labFn) { this.labT += dt; this.labFn(dt, this.labT); }
    const fw = this.foeWorld; fw.heroPos.copy(h.pos); fw.heroAlive = h.alive && (this.phase === 'fight' || this.phase === 'yard'); fw.heroY = h.y; fw.heroDodge = h.dodgeWin; fw.heroYaw = h.a.yaw; fw.pools = this.pools;
    // act-20: the hideout's people — idle, and a word when the hero stands close and presses 斩
    for (const n of this.npcs) n.a.update(dt);
    if (this.phase === 'yard') {
      let near: string | null = null, nd = 1.7; for (const n of this.npcs) { const d = Math.hypot(n.x - h.pos.x, n.z - h.pos.z); if (d < nd) { nd = d; near = n.id; } }
      if (this.stele && HIDEOUT.stele) { const d = Math.hypot(HIDEOUT.stele.x - h.pos.x, HIDEOUT.stele.z + 0.6 - h.pos.z); if (d < Math.min(nd, 1.5)) near = 'stele'; }
      this.npcNear = near;
      this.npcMarks(dt, near);
      if (near && !this.noTalk && this.inp.b.attack.pressed && !this.dialogue.on) { this.inp.b.attack.pressed = false; void this.npcTalk(near); return; }
    } else this.npcNear = null;
    // the yard: slabs summon sparring partners, the rack swaps the costume, the back road starts a run
    if (this.phase === 'yard' && this.yard) {
      const ev = this.yard.update(dt, h.pos, h.y, this.foes.filter(f => f.st !== 'dead' && f.kind !== 'dummy').length);
      if (ev.summon) {
        const at = SPAWN_AT(), f = spawnFoe(ev.summon, at, h.pos.clone()); this.foes.push(f);
        fxSmoke(at.clone().add(V3(0, 0.3, 0)), 0x6a6a74, 10, { r: 0.7, spd: 1.2, up: 0.6, s: 0.4, life: 0.7 }); cue(isBoss(f) ? 'roar' : 'summon', 0.6);   // wp/foes: isBoss
        if (isBoss(f)) f.a.roar();
      }
      if (ev.wear && ev.plinth) {
        const old = this.wearing; this.wear(ev.wear); this.yard.swap(ev.plinth, old);
        h.pos.z = ev.plinth.z + 1.1; h.a.yaw = 0; fxSmoke(h.pos.clone().setY(0.6), 0x8a8a94, 10, { r: 0.6, spd: 1.2, up: 0.8, s: 0.4, life: 0.6 });
        this.banner.show(ev.wear.name, ev.wear.role || '', 1.2);
      }
      const E = HIDEOUT.exit;
      if (h.pos.z > E.z && h.pos.x > E.x0 - 0.2 && h.pos.x < E.x1 + 0.2) {
        this.phase = 'leaving'; WIPE.look = 'bamboo'; h.vel.set(0, 0, TUNE.heroSpeed * 0.8);
        after(0.35, () => { void wipeTransit(() => this.startRun()); });
      }
    }
    this.decoyStep(dt); this.pinStep(dt); this.markStep();   // 11-18 秘传: 留影, 截脉, 枭首's mark
    this.enterStep(dt);
    for (const f of this.foes) {
      if (!this.ultOn && this.entering.some(e => e.f === f)) { f.a.update(dt); continue; }
      if (this.duel.holds(f)) this.duel.holdFoe(f, dt);   // 11-18 QTE: the duel moves the foe it has (held in the bind / its string's beats)
      else if (!this.ultOn) {
        // 11-18 留影: the foes the afterimage draws see it as her — they close on it and strike at it; a blow that lands bursts it
        if (this.decoyFor(f)) {
          const d = this.decoy!, hp = fw.heroPos.clone(), hy = fw.heroY, hd = fw.heroDodge, hurt = fw.hurtHero;
          fw.heroPos.copy(d.pos); fw.heroY = 0; fw.heroDodge = false; fw.hurtHero = () => this.dropDecoy();
          updateFoe(f, fw, dt);
          fw.heroPos.copy(hp); fw.heroY = hy; fw.heroDodge = hd; fw.hurtHero = hurt;
        } else updateFoe(f, fw, dt);
      }
      f.a.update(dt);
    }
    this.duel.flush();   // 11-18 拼刀: a blow 破势 met in the loop above locks blades now (not a frame later)
    this.reelStep(dt); this.flatStep(dt); this.dropStep(dt);   // 11-18 牵红's cord, 踏顶's flattened, the dead coming down out of the air
    this.separate();   // act-37: bodies don't pass through each other
    this.pitFalls(dt);   // 11-18 打出界
    for (let i = this.foes.length - 1; i >= 0; i--) if (this.foes[i].st === 'dead' && !this.foes[i].a.root.parent) this.foes.splice(i, 1);
    for (const a of this.arrows) a.update(dt, fw);
    for (let i = this.arrows.length - 1; i >= 0; i--) if (this.arrows[i].dead) this.arrows.splice(i, 1);
    for (const w of this.waves) {
      // the light flies on real time: the hit-stop of the blow that sent it freezes the world, not the light leaving it
      const live = w.live, p0 = w.step(rdt); if (!live) continue;
      for (const f of this.foes) if (f.st !== 'dead' && !w.hit.has(f.uid) && w.sweeps(p0, f.pos, f.d.r)) {
        w.hit.add(f.uid); this.hitFoe(f, Math.round(TUNE.finDmg * 0.7 * v(this.perks, 'bladeWind') / 100), p0, { knock: 0.8, heavy: false, kind: 'wind' });   // (11-18: 刀芒 100 / 150 / 200 % of 0.7 × the finisher — it was a flat 12 × share)
        // the light cuts through: a short white bar across the body and a spray of jade sparks
        const c = f.a.chest(), side = V3(w.fwd.z, 0, -w.fwd.x);
        trailSeg(c.clone().addScaledVector(side, -0.6).add(V3(0, 0.25, 0)), c.clone().addScaledVector(side, 0.6).add(V3(0, -0.15, 0)), 0xe8fff2, 0.12, { life: 0.16, bright: 3, spark: 0.6 });
        fxSparks(c, 0xc8ffe0, 12, 5); this.feel('wind', false, 1, w.fwd.clone());
      }
      // arrows in its way are cut out of the air
      for (const a of this.arrows) if (!a.dead && !a.friendly && w.sweeps(p0, a.p, 0.2)) { fxSparks(a.p.clone(), 0xe8fff2, 8, 4); a.kill(); }
    }
    this.waves = this.waves.filter(w => !w.dead);
    // darts: fly straight; the first foe in the way takes it (small damage, no stagger); walls stop them
    for (const d of this.darts) {
      if (d.stuck) { if (!d.ride(dt) || (d.stuck as Foe).st === 'dead') d.stop(false); continue; }
      const hand = h.pos.clone().add(V3(0, 1.2, 0));
      if (d.returning) d.homeTo(hand, TUNE.dartSpeed * 1.1, dt);
      const p0 = d.step(dt);
      // 11-18 秘传 折返: out to its end (or a wall), it turns and flies back to her left hand; a foe can be struck going and coming
      if (d.back > 0 && !d.returning && (d.life <= 0 || (() => { const q = d.p.clone(); this.clamp(q, 0); return q.distanceTo(d.p) > 0.3; })())) d.turnBack();
      if (d.returning && (d.p.distanceTo(hand) < 0.6 || d.life <= 0 || !h.alive)) { if (h.alive) { fxSparks(hand, 0xe8f0ff, 4, 1.5); cue('dartThrow', 0.25); } d.stop(false); continue; }
      if (this.props && !d.returning) { const q = d.p, hit = this.props.logic.near(q.x, q.z, 0.12).find(pp => pp.state === 'idle' || pp.kind === 'pillar'); if (hit && q.y < (hit.kind === 'pillar' ? 2.8 : 1.1)) { if (hit.state === 'idle') this.applyProps(this.props.logic.hit(hit, { src: 'dart', dir: [d.p.x - p0.x, d.p.z - p0.z] }, this.targets())); if (d.back > 0) d.turnBack(); else d.stop(); continue; } }
      for (const f of this.foes) {
        if (f.st === 'dead' || d.p.y > 2.4 || d.passed.has(f.uid)) continue;
        const ab = d.p.clone().sub(p0).setY(0), L2 = Math.max(1e-6, ab.lengthSq()), t = Math.max(0, Math.min(1, f.pos.clone().sub(p0).setY(0).dot(ab) / L2)), q = p0.clone().addScaledVector(ab, t);
        if (Math.hypot(f.pos.x - q.x, f.pos.z - q.z) < f.d.r + 0.2) {
          this.hitFoe(f, d.dmg * (d.returning ? d.back : 1), p0, { knock: 0.12, heavy: false, kind: 'dart', stagger: 0 }); cue('dartHit', 0.7);
          if (d.link && d.link !== this.qiVolley) { this.qiVolley = d.link; this.hero.gainQi(QI_LINK); }
          if ((f.st as string) !== 'dead' && hasBoon(this.perks, 'pin')) this.pinFoe(f);
          // a 折返 dart goes through (each foe once each way) and does not stay in; a plain one sticks in (寻声's mark)
          if (d.back > 0) { d.passed.add(f.uid); continue; }
          if ((f.st as string) !== 'dead') d.stickIn(f, TUNE.chaseWin); else d.stop(); break;
        }
      }
      if (d.dead || d.stuck || d.returning) continue;
      // (a 折返 dart that has run out of range turned above; one that hit the floor still stops)
      const q = d.p.clone(); this.clampAir(q, 0); if (d.back <= 0 && (q.distanceTo(d.p) > 0.3 || d.life <= 0) || d.p.y < 0.05) d.stop(d.life > 0);
    }
    this.darts = this.darts.filter(d => !d.dead);
    this.hitArcs.update(rdt, h.pos);
    (this.barks ??= new Barks(this.L)).update(rdt, (this.phase as string) === 'talk' || (this.phase as string) === 'cine' || this.dialogue.on, this.banner.bottomY);
    if (this.props && this.phase !== 'pick') this.applyProps(this.props.update(dt, this.targets()), true);   // act-19: fuses, fires, the falling pillars
    this.gates?.update(dt);
    if (this.pieces && this.hero) {
      const bodies = this.pieces.plates.length ? this.foes.filter(f => f.st !== 'dead').map(f => ({ pos: f.pos, r: f.d.r })) : [];
      const calm = !this.foes.some(f => f.st !== 'dead' && f.kind !== 'dummy');
      const frame = { foes: bodies, heroRadius: this.hero.r, heroHeight: this.hero.y, waitZone: this.waitZone };
      for (const e of this.pieces.update(dt, this.hero.pos, calm, frame)) if (e.k === 'reward') void this.reward();
      // 11-18 定死的屋子: she walked into the next piece of the floor — its wave
      if (this.waitZone >= 0 && this.phase === 'fight' && this.pieces.zoneAt(this.hero.pos.x, this.hero.pos.z) === this.waitZone) { this.waitZone = -1; after(0.35, () => { if (this.phase === 'fight') this.spawnWave(); }); }
    }
    // a rainy room: now and then lightning lights everything for a beat, the thunder a moment later
    tickSkyFlash(rdt);
    if (this.spec?.weather === 'rain' && (this.phase as string) !== 'opening') { this.lightningT -= rdt; if (this.lightningT <= 0) { this.lightningT = 7 + Math.random() * 9; flashSky(1); after(0.14, () => flashSky(0.7)); const d = 0.35 + Math.random() * 0.8; after(d, () => cue('thunder', 0.45)); } }
    if (this.leaves) {
      this.leaves.update(dt, this.cam.x, this.cam.z);
      blood.update(dt);
      if (h.st === 'dash' && !h.airborne) { const speed = Math.hypot(h.vel.x, h.vel.z) || 1; this.leaves.kick(h.pos.x, h.pos.z, 0.8, h.vel.x / speed, h.vel.z / speed, 3.4); }
      // the guiding wind: every few seconds a gust from the hero's feet toward each open gate (11-18 屋子形态: when a walled-off block
      // or a pit stands between, toward the way round instead — the leaves show which way to go)
      if (this.phase === 'doors' && this.gates) { this.gustT -= dt; if (this.gustT <= 0) { this.gustT = 3.2; for (const t of this.gates.targets()) { const wd = this.grid?.way(h.pos.x, h.pos.z, t.x, t.z, 0.4); if (wd) this.leaves.gust(h.pos.x, h.pos.z, h.pos.x + wd[0] * 5, h.pos.z + wd[1] * 5); else this.leaves.gust(h.pos.x, h.pos.z, t.x, t.z); } cue('exitChime', 0.25); } }
    }
    // copper coins fly in; the stations of a shop / rest / scroll room fill their rings under a hero standing still on a mat
    { const got = this.coinsFx.update(dt, h.pos); if (got) { this.coins += got; cue('coin', 0.3); } this.hud.coins = this.coins; }
    if (this.stations && this.phase === 'doors') {
      const s = this.stations.update(dt, h.pos, Math.hypot(h.vel.x, h.vel.z) > 0.8, st => st.price <= this.coins && (!st.id.endsWith('sharpen') || this.sharpenable().length > 0));
      this.stations.setPurse(this.coins);
      if (s) void this.useStation(s);
    }
    // (act-36 floated the stall's name and price over it in reach; act-37 (用户：「商店里的选项……好丑」) took it out — it said what
    //  the big board beside it says, and covered the next stall's board)
    // doors: the boards rise; stepping onto a gate's gold (act-34), or walking into a road's far end, leaves
    if (this.phase === 'doors') this.doors.forEach((d, i) => {
      d.lift = Math.min(1, d.lift + dt * 2.2); d.g.position.y = -2.4 * (1 - d.lift) ** 2;
      if (this.phase !== 'doors') return;
      const p = h.pos, l = d.ex.lane, bk = d.ex.dir[1] < 0, out = bk ? p.z < PLAY.z0 - 1.2 : d.ex.dir[0] < 0 ? p.x < l.x0 + 2.6 : p.x > l.x1 - 2.6;
      if (this.gates?.onGlow(p, d.ex.id) || (out && p.x > l.x0 - 0.4 && p.x < l.x1 + 0.4 && p.z > l.z0 - (bk ? 6 : 0.4) && p.z < l.z1 + 0.4)) this.leave(i);
    });
    // the camera: follows the hero with a little lead, held inside the room
    // the lead follows the run, capped at running speed (a dash or a knock-back no longer throws the view forward)
    const vel = h.vel.clone().setY(0), vl = vel.length(); if (vl > TUNE.heroSpeed) vel.multiplyScalar(TUNE.heroSpeed / vl);
    // 11-18 镜头取景 (用户：「3C总之都要再加强」): in a fight the view leans toward the foes she is fighting (their middle, a fifth of the
    // way, at most 2.2 m) and draws back a little when they crowd round her, in again when one or two are left
    let fx = 0, fz = 0, fn = 0;
    if (this.phase === 'fight') for (const f of this.foes) if (f.st !== 'dead' && f.kind !== 'dummy') { const dx = f.pos.x - h.pos.x, dz = f.pos.z - h.pos.z; if (dx * dx + dz * dz < 81) { fx += dx; fz += dz; fn++; } }
    const lean = fn ? V3(fx / fn, 0, fz / fn).multiplyScalar(0.22) : V3(); if (lean.length() > 2.2) lean.setLength(2.2);
    this.frameLean.lerp(lean, 1 - Math.exp(-2.2 * rdt)); this.crowd += (Math.max(0, Math.min(1, (fn - 2) / 4)) - this.crowd) * Math.min(1, rdt * 1.2);
    this.bossLookT = Math.max(0, this.bossLookT - rdt); this.bossLook += ((this.bossLookT > 0 ? 1 : 0) - this.bossLook) * Math.min(1, rdt * (this.bossLookT > 0 ? 2.2 : 1.2));
    const lead = vel.multiplyScalar(TUNE.camLead), want = h.pos.clone().add(lead).add(this.frameLean);
    // enemies come from the back of the room: the view sits a little ahead of the hero
    // held inside the room: 2.7 m in from the side edges, 2 m from the back, 3.2 m from the front (on the 2x stage it roams much more)
    const nr = this.yard?.near ?? 0, xc = (PLAY.x0 + PLAY.x1) / 2, xr = (PLAY.x1 - PLAY.x0) / 2 - 2.7 + 1.0 * nr;
    want.z -= 0.9 * (1 - nr); want.x = Math.max(xc - xr, Math.min(xc + xr, want.x)); want.z = Math.max(PLAY.z0 + 2.0, Math.min(PLAY.z1 - 3.2, want.z)); want.y = 0;
    this.cam.lerp(want, 1 - Math.exp(-5 * rdt)); followShadow(this.cam.x, this.cam.z); this.camSprings(rdt);
    // the charge: the gold ring round the feet fills, sparks off the blade's point (faster as it fills), a flash when full
    const ch = h.charge; this.ring.visible = ch > 0.01;
    if (this.ring.visible) {
      // 11-17 屏息: full, the ring runs back down as the breath is held; the last 0.4 s it trembles and dims, then she lets it go
      const br = h.breath, left = br * TUNE.stanceHold, warn = ch >= 1 && left < 0.4 ? 1 - left / 0.4 : 0;
      const k = Math.round((ch < 1 ? ch : Math.max(0.02, br)) * 48) / 48;
      if (k !== this.ringK) { this.ringK = k; this.ring.geometry.dispose(); this.ring.geometry = new THREE.RingGeometry(0.62, 0.74, 48, 1, Math.PI / 2, -Math.PI * 2 * Math.max(0.01, k)).rotateX(-Math.PI / 2); }
      this.ring.position.set(h.pos.x + (Math.random() - 0.5) * 0.07 * warn, 0.05 + h.y, h.pos.z + (Math.random() - 0.5) * 0.07 * warn);
      const m = this.ring.material as THREE.MeshBasicMaterial; m.opacity = ch >= 1 ? (0.55 + 0.15 * Math.sin(clock.rtime * 14)) * (1 - 0.45 * warn * (0.5 + 0.5 * Math.sin(clock.rtime * 45))) : 0.5; m.color.setHex(ch >= 1 ? 0xffe7a0 : 0xffc848); if (warn > 0) m.color.lerp(new THREE.Color(0x8a6a48), 0.7 * warn);
      this.sparkT -= rdt; if (this.sparkT <= 0) { this.sparkT = 0.13 - 0.08 * ch; fxSparks(h.a.bones.weapon ? h.a.bones.weapon.localToWorld(V3(0, 0, (h.def.tip ?? 13) * CELL)) : h.a.chest(), 0xffd070, ch >= 1 ? 4 : 2, 1.5 + 2 * ch, { life: 0.3 }); }
    } else this.ringK = -1;
    if (h.fullT > 0.34) { fxRing(h.pos.clone().setY(0.08), 0xffe7a0, 1.3, { life: 0.3 } as never); shake(0.06 * TUNE.shake); this.camPunch(0.025); fxSparks(h.a.local(0.12, 0.95, 0.05), 0xfff6dc, 14, 4); this.flashScreen(0.1, 0xfff0c8); }
    // 11-18 藏锋: the blade hums in its sheath as the stance fills (and swells like a pulse while the breath is held); the world dims a little
    // (11-18 拼刀: while blades are locked the same steel drone is the edges grinding — higher and louder as it gets harder)
    { const ch = h.st === 'charge' ? h.charge : 0, dh = this.duel.hum; audio.hum(dh >= 0 ? dh : ch > 0 ? Math.min(1, 0.25 + 0.75 * ch) : 0, dh >= 0 ? 0 : ch >= 1 ? 1 : 0); this.dimTo(ch > 0 ? 0.35 + 0.65 * ch : 0, rdt); }
    this.flashStep(rdt);
    this.hud.btns.attack.charge = ch;
    const nowCue = h.st === 'charge' && (this.threats(TUNE.iaiWin).foes.length > 0 || this.threats(TUNE.iaiWin).arrows.length > 0);
    const ab = this.hud.btns.attack as { now?: boolean }; ab.now = nowCue;
    if (nowCue && this.ring.visible) { const m = this.ring.material as THREE.MeshBasicMaterial; m.color.setHex(0xffffff); m.opacity = 0.95; }
    // the counter is waiting: gold sparks off the point, the cut button's rim lit
    this.dodgeCd -= rdt; this.hud.btns.attack.hot = h.counterT > 0;
    if (h.counterT > 0) { this.sparkT -= rdt; if (this.sparkT <= 0) { this.sparkT = 0.06; fxSparks(h.a.bones.weapon ? h.a.bones.weapon.localToWorld(V3(0, 0, (h.def.tip ?? 13) * CELL)) : h.a.chest(), 0xffd060, 3, 2.5, { life: 0.3 }); } }
    // the landing spot under a jump
    this.blob.visible = h.alive || h.y > 0.03; this.blob.position.set(h.pos.x, 0.03, h.pos.z); this.blob.scale.setScalar(0.62 * Math.max(0.6, 1 - h.y * 0.22)); (this.blob.material as THREE.MeshBasicMaterial).opacity = 0.78 - Math.min(0.3, h.y * 0.12);
    // the foes' contact shadows (a pool, one per live foe; the dummies stand on their own stone feet)
    const softOnly = OPT.bakedShadows && QUALITY.tier === 'low';
    if (softOnly && this.stage && !this.propContacts) this.propContacts = new ContactBatch(this.stage.root);
    const groupFoes = OPT.foeContacts && QUALITY.tier === 'mid';
    if (groupFoes && this.stage && !this.foeContacts) this.foeContacts = new ContactBatch(this.stage.root, contactMaterial());
    this.foeContacts?.begin(); this.propContacts?.begin();
    if (softOnly && this.propContacts) { debrisContacts(this.propContacts); this.props?.contacts(this.propContacts); this.pieces?.contacts(this.propContacts); }
    let si = 0;
    for (const f of this.foes) {
      if (f.st === 'dead' || f.kind === 'dummy' || f.mem.hidden) continue;
      if (softOnly && this.propContacts) { this.propContacts.add(f.pos.x, f.pos.z, f.d.r * 1.55); continue; }
      if (groupFoes && this.foeContacts) { this.foeContacts.add(f.pos.x, f.pos.z, f.d.r * 1.55, f.d.r * 1.55, 0.03); continue; }
      let m = this.shadows[si]; if (!m) { m = contactShadow(); scene.add(m); this.shadows.push(m); }
      m.visible = true; m.position.set(f.pos.x, 0.03, f.pos.z); m.scale.setScalar(f.d.r * 1.55); si++;
    }
    this.foeContacts?.end(); this.propContacts?.end();
    for (; si < this.shadows.length; si++) this.shadows[si].visible = false;
    // HUD
    const B = this.hud.btns; void B;
    // the dart button shows no cool-down (a third of a second would only flicker)
    // the dart button: dark and sinking while the three reload; the lamps show the darts left
    this.hud.setCooldowns({ attack: 0, jump: 0, ult: 0, dash: Math.max(0, h.dashCd / TUNE.dashCd), special: h.dartReload > 0 ? h.dartReload / TUNE.dartReload : 0 });
    this.hud.setPips('special', h.dartAmmo, TUNE.dartCharges);
    // 11-17 气: the yard (试剑坪) fills it back by itself (practise 破势 without building it first)
    if (this.phase === 'yard' && h.st !== 'charge') h.qi = Math.min(Hero.QI_MAX, h.qi + rdt * 1.5);
    this.hud.setQi(h.qi, Hero.QI_MAX, h.st === 'charge');
    if (h.qiDenied) { h.qiDenied = false; this.hud.denyAttack(); }
    if (h.exhaled) { h.exhaled = false; const at = h.a.head().add(h.a.fwd().multiplyScalar(0.25)); fxSmoke(at, 0xe6eef2, 12, { r: 0.12, spd: 1.7, up: 0.6, s: 0.24, life: 0.8 }); fxRing(h.pos.clone().setY(0.06), 0xb8a888, 0.9, { life: 0.3 } as never); }
    // the move links open right now, shown on the buttons (act-18): 追影 > 穿风斩 > 下劈 > 反击 on the cut button
    { const fighting = this.phase === 'fight' || this.phase === 'yard', chase = fighting && !!h.moves.chase && !!this.chaseTarget();
      const atk = this.npcNear && !this.noTalk ? 'talk' : !fighting ? null : chase ? 'chase' : h.canDashCut ? 'dcut' : h.canKeep ? 'keep' : h.canPause ? 'pause' : h.canAirCut ? 'acut' : (h.st === 'air' && h.airborne) ? 'plunge' : h.counterT > 0 ? 'counter' : null;
      // (11-18 四本新刀谱: 断云 on the cut button, 牵红 on the dart button, 踏顶 on the jump button, 掠地 on the dash button)
      const hints = { attack: atk, special: !fighting ? null : h.canBackDart ? 'back' : h.canReel ? 'reel' : h.canCutDart ? 'cdart' : null, jump: !fighting ? null : h.canLaunch ? 'launch' : h.canKick ? 'kick' : h.canStomp ? 'stomp' : h.canDoubleJump ? 'dbl' : null,
        dash: fighting && h.canSwoop ? 'swoop' : null } as const;
      if (!this.demo.on) { this.hud.setHints(hints); this.teach(hints); } }   // (the demonstration drives the buttons' links itself)
    this.hud.heroAt.copy(h.pos);
    // (11-18: a foe out of sight — a 死士 in the shadow, a 水鬼 under the water — shows no bar over its head)
    this.hud.update(rdt, this.inp, this.foes.some(f => f.mem.hidden && !isBoss(f)) ? this.foes.filter(f => !f.mem.hidden || isBoss(f)) : this.foes); this.cards.update(rdt); this.banner.update(rdt);
    this.L.on = true;
  }
  // ------------------------------------------------------------ input
  private pointer(type: string, id: number, x: number, y: number) {
    if (bladeBusy()) return;
    if (this.pause.on) { this.pause.pointer(type, x, y); return; }
    if (this.phase === 'title') { titlePointer(type, x, y); return; }
    if (this.timeline.on) { this.timeline.pointer(type); return; }
    if (this.dialogue.on) { if (type === 'down') this.dialogue.advance(); return; }
    if (this.cards.on) { this.cards.pointer(type, x, y); return; }
    // the demonstration: a tap anywhere skips it
    if (this.demo.on && type === 'down') { this.demo.skip(); return; }
    this.hud.pointer(type, id, x, y, this.inp);
  }
  /** the UI's skin: 漆器 → 竹简 → 铁器 (U key, the tuning panel, __dh.skin(id)) */
  cycleSkin(to?: SkinId) {
    const next = to ?? SKINS[(SKINS.indexOf(SKIN.id) + 1) % SKINS.length]; setSkin(next);
    this.hud.reskin(); this.banner.dispose(); this.banner = new SkinBanner(this.L, next, () => this.hud.bossOn);
    this.banner.show(SKIN_NAME[next], '界面风格 · U 键或调参面板切换', 1.4);
  }
  private key(e: KeyboardEvent) {
    if (bladeBusy()) return;
    if (this.demo.on && !e.repeat && !this.pause.on) { this.demo.skip(); return; }   // 11-18: any key skips a 刀谱's demonstration
    if (this.timeline.on && e.key === 'Escape') { this.timeline.key(true); return; }
    if (e.key === 'Escape' && !e.repeat && this.canPause()) { e.preventDefault(); this.pauseGame(); e.stopImmediatePropagation(); return; }   // (the menu must not take the same Esc as its 返回)
    if (this.dialogue.on) { if (!e.repeat && ['Enter', ' ', 'j', 'J'].includes(e.key)) { e.preventDefault(); this.dialogue.advance(); } return; }
    if (!this.cards.on) return;
    if ((e.key === 'Escape' || e.key === 'Backspace') && !e.repeat && this.cards.leave()) { e.preventDefault(); return; }   // (11-19: a shop page — Esc leaves)
    const k = ({ arrowleft: 'left', a: 'left', arrowup: 'left', w: 'left', arrowright: 'right', d: 'right', arrowdown: 'right', s: 'right', enter: 'ok', ' ': 'ok', j: 'ok' } as const)[e.key.toLowerCase() as 'a'];
    if (k && !e.repeat) { e.preventDefault(); this.cards.key(k); }
  }
  // ------------------------------------------------------------ the pad on the screens that are menus; the pause
  /** the pad on the cards, the conversations, the cutscenes, the opening; Start pauses (act-30 之后) */
  private padScreens(rdt: number) {
    const n = padNav.poll(rdt);
    if (this.phase === 'opening') { if (n.any) openingPadTap(); return; }
    if (this.phase === 'title') return;   // title.ts reads the pad itself
    // a cutscene: B held = the long press that skips (the ring at the bottom right fills)
    if (this.timeline.on) { if (n.back) { this.padSkip = true; this.timeline.key(true); } else if (this.padSkip && !n.backHeld) { this.padSkip = false; this.timeline.key(false); } }
    else this.padSkip = false;
    if (this.dialogue.on) { if (n.ok || n.x) this.dialogue.advance(); return; }
    if (this.cards.on) { if (n.up || n.left) this.cards.key('left'); else if (n.down || n.right) this.cards.key('right'); else if (n.ok) this.cards.key('ok'); else if (n.back) this.cards.leave(); return; }
    if (n.start && this.canPause()) this.pauseGame();
  }
  /** the world can stand still here: walking about or fighting (not the start screen, a cutscene, a conversation, the cards, a wipe) */
  canPause() {
    return !this.pause.on && !this.labOn && !this.cards.on && !this.ultOn && !this.duel.locks && !this.dialogue.on && !this.timeline.on && (['yard', 'intro', 'fight', 'doors'] as Phase[]).includes(this.phase);
  }
  pauseGame() {
    if (!this.canPause() || this.botOn) return;
    this.pauseHud = this.hud.on; this.hud.on = false; this.hud.update(0, this.inp, []); this.aimLine.visible = false;
    this.pause.open('main');
  }
  private unpaused() {
    if (this.pauseHud == null) return;   // the menu was over the start screen
    this.hud.on = this.pauseHud; this.pauseHud = null; this.inp.latch();
  }
  /** 回据点 from the pause menu: out on a run (not the yard, not the prologue's scripted fights) */
  private canGiveUp() { return !this.prologue && (['intro', 'fight', 'doors'] as Phase[]).includes(this.phase); }
  private giveUp() { if (!this.hero.alive) return; this.hero.giveUp(); this.dead(); }
  /** 11-19 (用户：「暂停没有回到主画面的选项」): 回主画面 from the pause menu — out on a run the trip ends as a death would (the haul home,
   *  the run's gains lost), then the start screen; anywhere else straight to it. (Not during a cutscene or a talk: the pause has no 回主画面
   *  row then — the menu only opens where play stops) */
  private backToTitle() {
    if (this.canGiveUp() && this.hero?.alive) { this.hero.giveUp(); this.bankRun(false); this.justDied = true; }
    audio.stopMusic(0.8); this.hud.on = false;
    void wipeTransit(() => { this.title(savedTitle()); });
  }
  // ------------------------------------------------------------ a bot (captures / smoke tests)
  private botT = 0; private cardT = 0; private botStuckT = 0; private botLast = V3(); private botUnstick = 0; private botSide = 1;
  /** the bot stays in the yard and spars (captures of the yard) instead of walking out */
  botStay = false;
  /** 11-18 captures: she can't die (the flask fills back up), so a whole boss fight can be watched (__dh.act().god = true) */
  god = false;
  /** 11-18 测关卡用 (the tune panel): every 刀谱 move on in a run */
  dbgAllMoves = false;
  private botYard() { return this.botStay; }
  private bot() {
    const h = this.hero, I = this.inp; if (!h) return;
    // 11-18 QTE: the bot mashes a 拼刀 and presses a 连环's beats (else the smoke run would stand in the bind)
    if (this.duel.locks) { for (const n of ['dash', 'special', 'jump'] as const) { const b = I.b[n]; b.pressed = false; b.down = false; b.held = 0; } I.move.x = I.move.y = 0; this.duel.bot(I.b.attack, clock.rdt); return; }
    if (this.qteT >= 0) { const k = this.qteT / TUNE.qteTime; const b = I.b.ult; const on = k > 0.85 && k < 1.0; b.pressed = on && !b.down; b.down = on; return; }
    if (this.cards.on) { this.cardT += clock.rdt; if (this.cardT > 1.2) { this.cardT = 0; this.cards.key('ok'); } return; } else this.cardT = 0;
    const live = this.foes.filter(f => f.st !== 'dead' && f.kind !== 'dummy' && !f.mem.hidden);   // (11-18: the bot can't see the hidden ones either)
    const set = (n: 'attack' | 'dash' | 'special' | 'jump', on: boolean) => { const b = I.b[n]; b.pressed = on && !b.down; b.down = on; b.held = on ? b.held + clock.rdt : 0; };
    if ((this.phase === 'doors' || this.phase === 'yard') && this.doors.length && !(this.phase === 'yard' && this.botYard())) {
      // act-19: follow the road's points in turn (the gate's mouth, through the gate, out) — a straight line ran into the wall
      const wk = this.doors[0].ex.walk; let wi = this.botWp; while (wi < wk.length - 1 && Math.hypot(wk[wi][0] - h.pos.x, wk[wi][1] - h.pos.z) < 1.0) wi++;
      this.botWp = wi;
      const d = wk[wi]; const v = V3(d[0] - h.pos.x, 0, d[1] - h.pos.z).normalize();
      // 11-18 屋子形态: the way round the walled-off blocks and the pits to the gate's mouth (the floor grid), straight once it is in sight
      if (this.grid && wi === 0) { const wd = this.grid.way(h.pos.x, h.pos.z, d[0], d[1], h.r); if (wd) v.set(wd[0], 0, wd[1]); }
      // step round the floor's cover and props in the way
      for (const so of this.solids.list) if (so.on) { const o = V3(so.x - h.pos.x, 0, so.z - h.pos.z), l = o.length(), rr = Math.max(so.hx, so.hz, so.r) + 0.9; if (l < rr + 0.6 && o.dot(v) > l * 0.3) { const side = V3(v.z, 0, -v.x); v.addScaledVector(side, side.dot(o) > 0 ? -1.4 : 1.4).normalize(); } }
      // step round a dummy in the way
      for (const f of this.foes) if (f.kind === 'dummy') { const o = f.pos.clone().sub(h.pos).setY(0), l = o.length(); if (l < 1.6 && o.dot(v) > l * 0.5) { const side = V3(v.z, 0, -v.x); v.addScaledVector(side, side.dot(o) > 0 ? -1.2 : 1.2).normalize(); } }
      // pinned (against a wall by a crate, say): cut what's in front and step aside, the other side each time
      this.botStuckT += clock.rdt;
      if (this.botStuckT > 0.9) { const moved = h.pos.distanceTo(this.botLast); this.botLast.copy(h.pos); this.botStuckT = 0; if (moved < 0.35) { this.botUnstick = 0.7; this.botSide *= -1; } }
      if (this.botUnstick > 0) { this.botUnstick -= clock.rdt; v.addScaledVector(V3(v.z, 0, -v.x), 1.4 * this.botSide).normalize(); set('attack', this.botUnstick > 0.35 && this.botUnstick < 0.6); }
      I.move.x = v.x; I.move.y = -v.z; set('jump', false); return;
    }
    if (!live.length && this.waitZone >= 0 && this.pieces && this.grid) {
      // 11-18 定死的屋子: on through the opened door to the next piece of the floor
      const zb = this.pieces.zoneBox(this.waitZone), tx = (zb.x0 + zb.x1) / 2, tz = (zb.z0 + zb.z1) / 2, wd = this.grid.way(h.pos.x, h.pos.z, tx, tz, h.r);
      const v = wd ? V3(wd[0], 0, wd[1]) : V3(tx - h.pos.x, 0, tz - h.pos.z).normalize(); I.move.x = v.x; I.move.y = -v.z; set('attack', false); return;
    }
    if (!live.length) { I.move.x = I.move.y = 0; set('attack', false); return; }
    const near = live.slice().sort((a, b) => a.pos.distanceTo(h.pos) - b.pos.distanceTo(h.pos))[0], d = near.pos.clone().sub(h.pos).setY(0), l = d.length();
    // a dog's lunge or the chief's slam aimed here: jump it (and come down cutting); other blows: dash away
    const low = live.some(f => f.st === 'windup' && f.t / f.dur > 0.7 && lowAttack(f) /* wp/foes */ && f.pos.distanceTo(h.pos) < 6);
    if (low && !h.airborne) { set('jump', true); set('attack', false); return; }
    set('jump', false);
    // 11-18 新刀谱 (smoke tests reach them): up in the air, 踏顶 a head beside her, 断云 the one 挑云 threw, 掠地 at someone a few metres
    // off on the way down; 挑云 after a cut lands. (牵红 comes by itself: a dart press while one is stuck in someone a way off)
    if (h.airborne) {
      if (h.canStomp) { set('jump', true); return; }
      if (h.canSwoop && !h.canAirCut && h.vy < 0 && l > 2 && l < 4.2) { I.move.x = d.x / l; I.move.y = -d.z / l; set('dash', true); set('attack', false); return; }
      set('dash', false); set('attack', h.canAirCut || (h.vy < 0 && l < 2.5)); return;
    }
    if (h.canLaunch && l < 2.4) { set('jump', true); set('attack', false); return; }
    // in a dash: a cut through if someone is ahead, darts back otherwise
    if (h.st === 'dash') { const ahead = d.clone().normalize().dot(h.a.fwd().setY(0).normalize()) > 0.7 && l < 4; set('attack', ahead); set('special', !ahead); return; }
    // a dart is sticking in someone a way off: follow it
    if (this.chaseTarget() && l > 2.2) { set('attack', true); set('special', false); return; }
    const threat = live.some(f => f.st === 'windup' && f.t / f.dur > 0.6 && f.pos.distanceTo(h.pos) < 4.5);
    if (threat && h.dashCd <= 0) { const away = d.clone().normalize().multiplyScalar(-1); I.move.x = away.z; I.move.y = away.x; set('dash', true); set('attack', false); return; }
    set('dash', false);
    // 11-18 覆铁重盾: the shield takes a blade from the front — the bot goes round him (a quick dash round when it can), cuts from behind
    if (near.role === 'ly_shield' && !(near.mem.stunT > 0) && l < 4) {
      const fy = near.yaw, toHero = Math.atan2(h.pos.x - near.pos.x, h.pos.z - near.pos.z); let da = toHero - fy; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) < 1.35) {
        const s = da >= 0 ? 1 : -1, t = V3(-d.z, 0, d.x).multiplyScalar(s / Math.max(l, 1e-3)), want = t.addScaledVector(d, (l - 1.7) / Math.max(l, 1e-3));
        I.move.x = want.x; I.move.y = -want.z; set('attack', false); if (h.dashCd <= 0 && l < 2.6) set('dash', true); return;
      }
    }
    // darts while closing in on someone a few metres off
    set('special', l > 3.2 && l < 8.5);
    // (11-18 屋子形态: the way round a wall / a pit to the nearest foe)
    const wd = this.grid && l > 1.6 ? this.grid.way(h.pos.x, h.pos.z, near.pos.x, near.pos.z, h.r) : null;
    if (wd) { I.move.x = wd[0]; I.move.y = -wd[1]; set('attack', false); }
    else if (l > 1.6) { I.move.x = d.x / l; I.move.y = -d.z / l; set('attack', false); }
    else { I.move.x = d.x / l * 0.2; I.move.y = -d.z / l * 0.2; this.botT += clock.rdt; set('attack', this.botT % 0.3 < 0.12); }
    void FX;
  }
}
