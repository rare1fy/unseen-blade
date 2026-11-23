import { SEE_HOLES } from '../look/voxkit';
import { setActorOcc, setPropOcc } from '../look/occlude';
import { batchActor } from '../engine/rigidBatch';
import { OPT } from '../engine/perfOpts';
import { ContactBatch } from '../engine/contactBatch';
import { finishBuild, loadInFrames, BUILD_STATS } from '../engine/buildSteps';
import { TILE_STATS } from '../engine/shadowTiles';
import { bladeWorking, bladeBusy, bladeTimes, runRoomBuild, withLoadingBlade } from '../scenes/loadingBlade';
import { format, language, msg, setLanguage } from './i18n';
// 动作原型（docs: CLAUDE.md「动作原型」、docs/act/DESIGN.md）：哈迪斯式的一间间屋子。每间屋 = 一张拼装的日本场景（asm），战斗区就是屋子；
// 敌人分两波从边上出来；清场 → 三选一秘传 → 屋子边上的路口立起高札（写着下一间的地名和清完给什么）→ 自己走进路口 → 一丛竹子
// （或一根木柱）从镜头前扫过，换到下一间。三间屋，第三间是山贼头目。
// 打开游戏先到练武场（yard.ts：木人桩、召唤石板、换装木台），走进后面的「出发」路口开始一局；死了或打完回练武场。
// 砍飞的箭：方向在出刀朝向左右 75° 里随机、附近有敌人就偏过去；砍中那一下顿帧 + 闪光 + 短慢放（用户：「这种属于高光操作，应该要有顿帧」）。
import * as THREE from 'three';
import { V3, onUpdate, onRealUpdate, R, scene, warm, frames, precompile } from '../engine/world';
import { hitstop, shake, slowmo, after, anim, clock, FX, waitReal, PAUSE } from '../engine/clock';
import { shot, CINE_PX } from '../director';
import { fxImpact, fxSparks, fxSmoke, fxRing, fxEmbers, fxFlare, fxGlow, fxChips, trailSeg } from '../fx/fx';
import { fxAfterimage, fxShock } from '../fx/skillFx';
import { addBlock, debrisContacts } from '../fx/blocks';
import { popPix, PIX_H } from '../v2/pix';
import { playDeath } from '../v2/death';
import { prepareFight, prepareFightModels } from './fightWarm';
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
import { Gates, GateGlow } from './gates';
import { UI_LOOK } from '../look/uiLook';
import { sayMerchant, setHurtBreath, warmLines, warmVoicePacks, warmVoiceFile } from '../../audio/voice';
import { ALL_MOVES, drawManuals, manualCard, manualsForWeapon, SCROLL_GLYPH } from './manuals';
import { Dialogue, type Line } from './dialogue';
import { Stele } from './stele';
import { openLab } from './lab';
import { HAS_DOM } from '../../platform';
import { openAnimPreview } from './animPreview';
import { openMovesPreview, type StageSetup } from './movesPreview';
import { IronHp, HP_FACE } from './ironUi';
import { ROSTER } from '../bestiary/models';
import { CODE_BUILD } from '../bestiary/voxEdit';
import { rackBlades, hideoutScene, hideoutSolids, buildDuwuMemorial, buildExtraBowl, buildFlatbreadProp, buildHeldBowl, buildLacquerBox, buildLaidBlades, HIDEOUT, HIDEOUT_PEOPLE, type HideoutTime, type HideoutWeather } from './hideout';
import { clampWithDoors } from './doorClamp';
import { Timeline, type V } from './timeline';
import { openingShots, bossIntroShots, generalIntroShots, steleStrikeShots, safeCam, type CineHost } from './cutscenes';
import { NPC_TALK, STELE_TALK, MEAL_TALK, UP_TALK, POOR_TALK, WAKE_DUWU, WAKE_SUNAO, CHULEI_BEFORE, CH_BEFORE, CH_AFTER, BOSS_AFTER, STRIKE_FLAG, bossesDown, struckOnStele, ENDING, ENDING_A_NO_DUWU, ENDING_C_NO_DUWU, ENDING_PICK, ENDING_DESC, DUWU_ROAD_1, DUWU_ROAD_2, DUWU_DIE, DUWU_MEMORIAL_INTRO, DEATH_SUNAO_AFTER_DUWU, GEN_BEFORE, GEN_AFTER, deathLine, PRO_CUIXUAN, PRO_FALL, PRO_DAWN, PRO_WAKE, PRO_CAPTIONS, PRO_AMBUSH } from './scripts';
import { fallShots, snowShots, dawnShots, snapDawn, loadShots, brazier, getUpPose, drapeOver, GETUP_STEP, Kneel, KNEEL_ARMS, CuiInspect, cuiKneelDefeatPose, bossKneelDefeatPose, bossDefiantPose, poseWallVault, heroHoldThroatPose, heroSitFirePose, heroHandOnHiltPose, heroPutHatPose, heroKneelBesidePose, duwuRecoilPose, npcWarmPose, duwuPoisonPose, duwuDieShots, endingWalkShots, type PrologueHost, type VaultPhase } from './prologue';
import { AllyGeneral, GENERAL_REGIONS, type AllyHost } from './foes/generals_ai';
import { coldOpenShots, coldCardShots, BlindPOV } from './coldopen';
import { Barks } from './barks';
import { resolveBossRoomWaves, ROUT_BARKS } from './bossPool';
import { installR45 } from './regions/r45_hook';
import { revealFoe } from './foes/r45_ai';
import { measureFight, meterLabel, toggleMeter } from '../engine/frameMeter';
import { QUALITY, setQuality, type Tier, qualityLabel, cycleQuality } from '../look/quality';   // wp/regB: 第四关 · 锁江、第五关 · 许都雪 (their places, foes, bosses, __dh.region)
/** act-40 (用户：「现在开场太墨迹了，把那段timeline先搞成黑幕快速交代背景吧」): the cold open as black cards for now (false = the 寒山坞 cutscene) */
const COLD_AS_CARDS = true;
import { newGame, profile, save as saveProfile, seeOnce, hasSave } from './profile';
import {
  runMods, bank, META, MIRROR, level, nextCost, buy, hasAffordable,
  mirrorState, mirrorNextCost, canBuyMirror, hasMirrorAffordable, buyMirror, flipMirror,
  ARCANA, ensureArcana, arcanaRank, arcanaCap, arcanaNextCapCost, arcanaUsed, arcanaActiveCount,
  isArcanaActive, arcanaUpgradeCost, unlockArcana, toggleArcana, upgradeArcana, expandArcanaCap, hasArcanaActionable,
  type RunMods,
} from './meta';
import { WEAPONS, WEAPON_ORDER, weaponDef, isWeaponUnlocked, weaponLevel, weaponNextCost, canForgeWeapon, hasAnyWeaponForgeable, forgeWeapon, equippedWeapon, equipWeapon, buildCourtyardWeaponRack, type WeaponId } from './weapons';
import { KEEPSAKES, KEEPSAKE_ORDER, KEEPSAKE_STARS, keepsakeDef, isKeepsakeUnlocked, unlockKeepsake, keepsakeRooms, keepsakeStar, starLabel, equippedKeepsake, equipKeepsake, advanceKeepsake, buildKeepsakeBoxModel, type KeepsakeId } from './keepsakes';
import { SEEDS, SEED_ORDER, PLOT_COSTS, ensureGarden, plotStatus, isPlotUnlocked, canUnlockPlot, unlockPlot, plantSeed, harvestPlot, ripenPlotNow, advanceGardenRooms, totalSeeds, ripePlotIndices, hasPlantablePlot, rollSeedDrop, addSeed, buildGardenPlotMesh } from './garden';
import { HIDEOUT_ZONES, HIDEOUT_ZONE_ORDER, hideoutProgress, isDuwuDead, buildZoneMonumentModel, type HideoutZoneId } from './hideoutProgress';
import { showRewardedAd, setAdSimHost, type AdPlacement } from '../../platform/ads';
import { AdSimModal } from './adModal';
import {
  COLLECTORS, LANTERN_MILESTONES, ARCHIVE_PEOPLE, SANDBOX_BOSSES, GARDEN_SPEED_DAILY_MAX,
  ensureAds, isCollectorUnlocked, collectorProgress, recordAdWatched, nextLanternMilestone,
  gardenSpeedLeft, consumeGardenSpeed, activeUiSkin, activeBladeFx, activeOutfitId,
  activeHideoutMood, activeHideoutDecors, clearRunAdBuffs,
  type HideoutMoodId, type HideoutDecorId,
} from './collectors';
import { buildLanternStand, buildTrialStele, buildHideoutDecor } from './hideoutExtras';
import { sayLine } from '../../audio/voice';
import { GeneralEventRunner, GENERAL_EVENTS, type GeneralBlessingId, type GeneralEventMeta, type EventOutcome } from './generalEvents';
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
import { slashArc } from './slashArc';
import { audio } from '../../audio/audio';
import type { Platform } from '../../platform/index';
import { dh } from '../../debug/dh';
import { Input } from './input';
import { ActHud } from './hud';
import { CardPick3D as CardPick, type CardBoon } from './cards3d';   // act-36 / act-143: the pick cards as iron boards
import { UiPlatePool, type MiniIcon, type TagSpec, type WorkbenchStatRow } from './uiPlate';
import { MoveDemo } from './moveDemo';
import { entryOfManual, entryOfBoon, entryOfBase, type AttachedBoon, type SkillEntry } from './skillFace';
import type { Section } from './skillList';
import { BASE_SKILLS, baseSkillsForWeapon, UI_WORDS, boonEffect, manualOf } from './skillInfo';
import type { Mark } from './hud';
import { MANUALS } from './manuals';
import { fillVals } from './cards';
import { Hero, QI_LINK, type HeroWorld } from './hero';
import { Tutorial, type LessonId } from './tutorial';
import { RewardFeed } from './rewardFeed';
import { Duel, type DuelHost } from './qte';
/** 11-17: the 刀谱 links the first few openings of which are slowed down to teach them (二段跳 is no link; 穿风斩 / 劈山 / 回锋斩 are known from the start) */
// (11-18: 断云, 牵红, 踏顶 too; 掠地 not — like 二段跳 it is on whenever she is in the air, so it would slow every jump)
const TEACH = ['chase', 'back', 'cdart', 'launch', 'kick', 'keep', 'pause', 'acut', 'reel', 'stomp'];
/** 11-18: the new 刀谱's blade blows count as cuts for the boons (出血, 裂甲, 搏命, 枭首) — boons.ts isBladeHit stays as it is */
const bladeHit = (kind: string) => isBladeHit(kind) || kind === 'acut' || kind === 'acutF' || kind === 'acutS' || kind === 'swoop';
import { interruptFoe, POISE_BREAK_MUL } from './enemy';
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
import { BOONS, ARCH_INFO, archCounts, archTier, applyBoon, drawBoons, upgradeBoon, boonCount, upgradableBoons, freshBoons, BOON_CAP, returnCard, TIER_NAMES, newPerks, tierOf, hasBoon, v, v2, isBladeHit, type Archetype, type Perks, type Boon, type BoonPick } from './boons';
import { TUNE } from './tune';
import { installActTune } from './tunePanel';
import { BODY_FONT, BODY_FONT_NAME, setBodyFont, type BodyFont } from '../ui3d/bodyFont';
import { HEROES, RACK, motionOf } from './ninjaAct';
import { Yard, makeSign, SPAWN_AT } from './yard';
import type { ModelDef } from '../bestiary/models';
import { dustBlocks, spawnClone, smokeBurst, cut as cloneCut } from '../kyoto/ninja_fx';
import { Dart, BladeWave } from './missiles';
import { RUN_ROOMS, firstRoom, regionFirstRoom, roomOf, roomInfo, doorsFrom, settleReward, kindOr, isBossKind, type RoomPlan, type RoomType, type RunCtx } from './run';
import { REGIONS } from './regions';
import { isBossRoom, afterBoss, roomsWorth, regionScale, regionBanner, shopPriceMul } from './flow';
import { Stations, type Station, type ShopSpecial } from './stations';
import { Coins } from './coins';
import { runBoard } from './runBoard';
import { HitArcs } from './hitArc';
import { playOpening, OPENING_SPEC } from './opening';
import { wantOpening } from './openingFlag';
import { stopTitle, playTitle, titlePointer, titleClubAnchor } from './title';
import { GameClubBadge, type GameClubPlacement } from './gameClubBadge';
import { getGameClubState } from '../../platform/gameClub';
import { wantTitle, savedTitle, TITLE_COUNT } from './titleFlag';
import { PX, setPixel } from '../look/pixel';
import { craftLabel, cycleCraft } from '../look/craft';
import { VIBE, vibeSupport, iosMajor, RUMBLE } from '../../platform/index';
import { PauseMenu } from './pauseMenu';
import { padNav, padRumble, PAD, actKey, actPad, padName, isTouchPointer, isTouchLayout, uiModeLabel, cycleUiMode, setUiMode, detectInitialDevice, type Device, type PadFamily } from './pad';
import { openingPadTap } from './opening';
import { BattleActor } from '../bestiary/battle';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { worldToUi } from '../ui3d/layer';
import { HIDEOUT_DONKEY } from './hideout_people';
import { CELL } from '../bestiary/kit';
import { Action } from '../actors/rig';

addLocales(NINJA_LOCALES); addLocales(HANMO_LOCALES); addLocales(HANSHAN_LOCALES); addLocales(LUOYANG_LOCALES); addLocales(XIAPI_LOCALES);   // (11-18: regions two and three)

/** prices at the 行商 (copper coins) */
/** act-161 / act-169: every ware ×1.6; reroll removed */
const PRICES = { boon: 96, heal: 48, sharpen: 80, vigor: 88, satchel: 72 };
const SHOP_SPECIALS: ShopSpecial[] = ['vigor', 'satchel'];
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
/** Default heroine look: conical bamboo hat (斗笠) with full white hair underneath (hat comes off while healing in kiln, back on when departing) */
const DEFAULT_HERO = 'fine_hat';
function savedHero(): ModelDef {
  let id = ''; try { id = localStorage.getItem('act.hero7') ?? ''; } catch { /* storage blocked */ }
  if (!__DEBUG_UI__) return HEROES.find(d => d.id === DEFAULT_HERO) ?? HEROES[0];   // (11-18: the packages wear the default — no costume switch there)
  const q = typeof location !== 'undefined' ? /[?&#]hero=([a-z_]+)/.exec(location.href)?.[1] : undefined;
  return HEROES.find(d => d.id === (q ?? id)) ?? HEROES.find(d => d.id === DEFAULT_HERO) ?? HEROES[0];
}

let SELF: ActShow | null = null;
/** act-20 upgrade card glyphs (12 × 12, axis-aligned): an anvil under a hammer; a needle by a gourd; an open gate (leave) */
const ANVIL = ['..######....', '..#oooo#....', '..######....', '....##......', '....##......', '............', '.##########.', '.#oooooooo#.', '..########..', '....####....', '...######...', '............'];
const SPROUT = ['............', '..###..###..', '.#ooo##ooo#.', '.##oo##oo##.', '...######...', '.....##.....', '.....##.....', '....####....', '..########..', '.#oooooooo#.', '..########..', '............'];
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
/** 3D voxel pixel exclamation mark (!) floating above actionable hideout NPCs & 复仇碑 */
function npcExclaim() {
  const rows = ['.ooo.', 'ohgho', 'ohgho', 'ohgho', 'ohgho', '.ooo.', '.....', '.ooo.', 'ohgho', '.ooo.'];
  const H = rows.length, W = rows[0].length, s = 1 / H, gs: THREE.BufferGeometry[] = [], col = new THREE.Color();
  const C: Record<string, number> = { o: 0x261a10, h: 0xfff4c2, g: 0xffc84a };
  rows.forEach((row, y) => { for (let x = 0; x < W; x++) { const ch = row[x], c = C[ch]; if (c == null) continue; const g = new THREE.BoxGeometry(s, s, s * (ch === 'o' ? 1.5 : 2.2)); g.translate((x - W / 2 + 0.5) * s, (H / 2 - y - 0.5) * s, 0); col.setHex(c); const n = g.attributes.position.count, cs = new Float32Array(n * 3); for (let i = 0; i < n; i++) { cs[i * 3] = col.r; cs[i * 3 + 1] = col.g; cs[i * 3 + 2] = col.b; } g.setAttribute('color', new THREE.BufferAttribute(cs, 3)); gs.push(g); } });
  const geo = mergeGeometries(gs); for (const g of gs) g.dispose();
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0xffd268, emissiveIntensity: 0.42 }));
}
/** act-34: what a room is built from (buildRoom reads these from the show; the prefetch passes a new game's first room) */
interface RoomIn { isYard: boolean; room: number; recent: Spec[]; locale: string; plan: RoomPlan | null; nextRooms: RoomPlan[]; viewSpec: Partial<Spec> | null; forceSpec: Partial<Spec> | null; noArena: boolean;
  /** 11-18 屋子形态: force this room's shape (__dh.shape / captures) and its seed; the last rooms' shapes (not again so soon) */
  shape?: ShapeId | null; shapes?: ShapeId[]; seed?: number | null;
  /** 11-18 定死的屋子: force this drawn room (asm/roomMaps.ts id); the drawn rooms used this run (not again while others are left) */
  map?: string | null; maps?: string[]; region?: number;
  /** 11-18: the region's defaults for the pick (season …: 下邳 is winter); the place's own lists still apply */ regionSpec?: Partial<Spec> | null;
  /** act-152: rotating hideout time & weather */ yardAtmo?: { time: HideoutTime; weather: HideoutWeather } }
/** act-152: rotating mountain kiln moods across return visits (first visit stays warm dusk/clear) */
export const HIDEOUT_ATMOS: ReadonlyArray<{ time: HideoutTime; weather: HideoutWeather }> = [
  { time: 'dusk', weather: 'clear' },
  { time: 'dusk', weather: 'rain' },
  { time: 'night', weather: 'snow' },
  { time: 'day', weather: 'clear' },
  { time: 'night', weather: 'rain' },
  { time: 'dawn', weather: 'clear' },
];
/** a room's place, built (off the live scene) and ready to put up */
interface Fixtures { props: Breakables; solids: Solids; gates: Gates; grid: FloorGrid | null; pieces: RoomPieces | null }
interface Room { fixtures?: Fixtures; spec: Spec; big: boolean; layout: Layout; arena: ArenaPlan | null; report: Report | null; prep: PreparedStage; k: { x: number; z: number } }
/** the prologue's first room (act-29) and its one way on */
/** act-44: where her hips lie on 孙媪's mat when she first wakes (the mat runs along z; her head toward the wall, a metre clear) */
const WAKE_MAT: [number, number] = [6.42, -6.2];   // (her neck on the headrest at the wall end, her heels short of the folded quilt)
const PRO_ROOM = { locale: 'hj_village', waves: [['hj_mob', 'hj_blade', 'hj_mob', 'hj_mob'], ['hj_blade', 'hj_mob', 'hj_mob']] as EKind[][],   // (11-19: the first wave is the ambush that closes round her — four, from every side)
  // act-169: deterministic canonical village architecture (axis street + village elder tree, mirror: false, fixed seed 107) — zero random building/gate shifts!
  spec: { layout: 'axis', mirror: false, landmark: 'huaishu', season: 'winter', weather: 'snow', time: 'night', seed: 107 } as Partial<Spec> };
const PRO_BOSS: RoomPlan = { type: 'boss', locale: 'cx_court', reward: null, waves: [['cx_boss']] };   // (11-19 剧情改版: 崔府's forecourt, 崔玄)
// act-169: deterministic canonical Cui Manor snowy forecourt architecture — west vault wall, north hall & lanterns stay 100% consistent!
const PRO_BOSS_SPEC: Partial<Spec> = { layout: 'axis', mirror: false, landmark: null, season: 'winter', weather: 'snow', time: 'night', seed: 209 };
/** 11-19 剧情改版: the five bosses in order (region 0 … 4), the meeting cutscene's name for each */
const BOSS_ORDER: EKind[] = ['hj_boss', 'ly_boss', 'xp_boss', 'wl_boss', 'cx_boss'];
/** act-37 the cold open's place: 寒山坞 on that snowy night (its own layout and light) */
const COLD_ROOM: RoomIn = { isYard: false, room: 0, recent: [], locale: 'hs_forge', plan: null, nextRooms: [], forceSpec: null, noArena: true,
  viewSpec: { locale: 'hs_forge', layout: 'hs_valley', mirror: false, landmark: null, season: 'winter', time: 'night', weather: 'snow', seed: 7, exits: [] } };
/** pick the spec, lay out the floor and the arena, assemble and build the place — touching nothing live except the stage size
 *  (setStage, which the caller sets again) */
function prepRoom(o: RoomIn): Room { return finishBuild(prepRoomSteps(o)); }
function* prepRoomSteps(o: RoomIn, background = false): Generator<void | Promise<void>, Room> {
  const { def, ...room } = roomDefinition(o);
  const prep = yield* prepareStageSteps(def, { combat: true, background });
  if (!background || !room.arena) return { ...room, prep };
  const arena = room.arena, holder = new THREE.Group(), solids = new Solids();
  const props = new Breakables(holder, solids);
  let gates: Gates | undefined, pieces: RoomPieces | null = null, transferred = false;
  const discard = () => { pieces?.dispose(); gates?.dispose(); props.dispose(); prep.drop(); };
  try {
    yield* props.buildSteps(arena.props, arena.covers, true);
    yield;
    gates = new Gates(holder);
    yield* gates.buildSteps(arena);
    yield;
    const grid = arena.shape ? new FloorGrid(arena.shape) : null;
    if (grid && arena.shape?.fixed) {
      const roll = Math.floor(Math.random() * 1e9);
      pieces = new RoomPieces(holder, arena.shape, grid, arena.style, room.spec.seed, OPT.slicedRoom, roll);
      if (OPT.slicedRoom) yield* pieces.buildSteps(arena.style, room.spec.seed);
    }
    if (o.plan && OPT.slicedRoom) yield* prepareFightModels(o.plan.waves);
    transferred = true;
    return { ...room, fixtures: { props, gates, grid, solids, pieces }, prep: { ...prep, drop: discard } };
  } finally { if (!transferred) discard(); }
}
type AheadRoom = {
  plan: RoomPlan; region: number; room: number; next: RoomPlan[];
  steps: ReturnType<typeof prepRoomSteps>; size?: ReturnType<typeof stageNow>;
  ready?: Room; wait?: Promise<void>;
};
/** 11-19 (用户：「开场剧情一系列的还是很慢」): the prologue's next place, built a slice a frame while the one before plays —
 *  'boss' (崔府, during the snowy village), 'dawn' (the village at dawn, during 崔府), 'yard' (the kiln, during the dawn) */
type ProJob = Pick<AheadRoom, 'steps' | 'size' | 'ready' | 'wait'> & { tag: 'boss' | 'dawn' | 'yard' };
function advanceAhead(job: Pick<AheadRoom, 'steps' | 'size' | 'ready' | 'wait'>, until = 0) {
  // Both builders and gameplay read the same stage dimensions. The hideout also overrides PLAY independently.
  const live = stageNow(), floor = { ...PLAY };
  try {
    if (job.size) setStage(job.size.big, job.size.k);
    do {
      const step = job.steps.next();
      if (step.done) { job.ready = step.value; break; }
      if (step.value) { job.wait = step.value.then(() => { job.wait = undefined; }); break; }
    } while (performance.now() < until);
  } finally {
    job.size = stageNow();
    setStage(live.big, live.k); Object.assign(PLAY, floor);
  }
}
function onward(room: number, visited: RoomType[], region: number, ctx?: RunCtx) {
  if (!isBossRoom(region, room)) return doorsFrom(room, visited, Math.random, region, ctx);
  const next = afterBoss(region);
  return next === 'won' ? [] : [regionFirstRoom(next, Math.random)];
}
export function roomDefinition(o: RoomIn) {
  const { isYard } = o;
  const ya = o.yardAtmo ?? (() => {
    const mood = activeHideoutMood(profile());
    return { time: mood.time as HideoutTime, weather: mood.weather as HideoutWeather };
  })();
  const seed = o.seed ?? (Date.now() % 100000) + o.room * 977;
  const base = pickSpec(seed, Object.values(REGISTRY.locales), REGISTRY.layouts, o.recent, { season: o.regionSpec?.season ?? 'autumn', locale: o.locale });
  const spec: Spec = isYard ? { ...base, season: ya.weather === 'snow' ? 'winter' : 'autumn', time: ya.time, weather: ya.weather, exits: ['back'] }
    : { ...base, time: o.room === 0 ? 'dusk' : base.time, weather: o.plan?.type === 'boss' ? 'clear' : base.weather, exits: o.nextRooms.length > 1 ? ['left', 'right'] : o.nextRooms.length ? ['back'] : [] };
  if (o.viewSpec) Object.assign(spec, { exits: [] }, o.viewSpec);
  if (o.forceSpec) Object.assign(spec, o.forceSpec);   // act-29: the prologue's snowy night
  // act-19: the 黄巾 rooms stand on the 2x stage; the yard keeps the old one (wp/regB: and every place in asm/arena.ts ARENA_LOOK). 11-18 屋子形态 (用户：「场景再大些，形态多样一些」): a fight
  // room on a big stage takes one of its place's shapes (the boss's, the calm rooms, the prologue's and the cutscenes' stay square)
  const ptype = o.plan?.type ?? 'fight', calm = ptype === 'shop' || ptype === 'rest' || ptype === 'boon', isEvent = ptype === 'event';
  const roomKind = calm ? 'calm' : ptype === 'boss' ? 'boss' : 'fight';
  const region = o.region == null ? null : REGIONS[o.region];
  const dm = region && !isYard && !isEvent && !o.noArena && !o.viewSpec && !o.forceSpec && !o.shape
    ? (o.map ? MAP_BY_ID[o.map] : pickMap(region, roomKind, o.maps ?? [], seed)) : null;
  if (dm) {
    const mb = pickSpec(dm.seed, Object.values(REGISTRY.locales), REGISTRY.layouts, [], { season: o.regionSpec?.season ?? 'autumn', locale: dm.locale });
    // act-128: roll varied time-of-day & weather per room using the live run seed & recent history (while keeping dm.seed for deterministic map geometry/packs!)
    const atmo = pickSpec(seed * 13 + dm.seed, Object.values(REGISTRY.locales), REGISTRY.layouts, o.recent, { season: mb.season, locale: dm.locale });
    Object.assign(spec, { ...mb, mirror: false, time: atmo.time, weather: atmo.weather, seed: dm.seed });
  }
  const loc = LOCALES[spec.locale], bigP = !isYard && bigStage(spec.locale);
  // act-169: lock architectural layout, mirror: false & deterministic building seed for non-drawn rooms so buildings & doorways
  // NEVER randomly jump/flip across runs — ONLY breakable props (propSeed passed to arenaPlan) randomize per run!
  if (!dm && !isYard && !o.viewSpec) {
    spec.mirror = false;
    if (!o.forceSpec?.layout && loc?.layouts?.length) spec.layout = loc.layouts[0];
    if (!o.forceSpec?.seed) {
      let ah = 2166136261;
      for (const ch of `${spec.locale}:${spec.layout}`) ah = Math.imul(ah ^ ch.charCodeAt(0), 16777619);
      spec.seed = (ah >>> 0) % 90000 + 1000;
    }
  }
  const shapeId: ShapeId = dm ? 'map' : !bigP || o.noArena || isEvent ? 'square' : o.shape ?? (o.viewSpec || o.forceSpec ? 'square' : pickShape(loc?.shapes, calm ? 'calm' : ptype === 'boss' ? 'boss' : 'fight', spec.seed, o.shapes ?? []));
  const big = bigP, k = dm ? mapStage(dm) : SHAPE_K[shapeId]; setStage(big, k);
  const lb = REGISTRY.layouts[spec.layout] ?? Object.values(LOCALES).flatMap(l => l.extraLayouts ?? []).find(l => l.id === spec.layout)!;
  const drawn = dm ? mapShape(dm) : undefined;
  const layout = withExits(spec.mirror ? mirrorLayout(stageLayout(lb)) : stageLayout(lb), spec.exits ?? [], drawn?.fixed);
  const pits = loc?.pits ?? ['water'], pitK = pits[Math.floor(((spec.seed * 2654435761) >>> 0) / 4294967296 * pits.length) % pits.length];
  const shape = drawn ?? (big && !o.noArena && shapeId !== 'square' ? makeShape(shapeId, spec.seed, { layout, pit: pitK }) : undefined);
  const propSeed = dm ? spec.seed : seed;
  const arena = big && !o.noArena ? arenaPlan(layout, (spec.exits ?? []) as ExitId[], propSeed, spec.locale, calm || isEvent ? 'calm' : ptype === 'boss' ? 'boss' : 'fight', shape) : null;
  spec.arena = arena ?? undefined;
  if (isYard) return { spec, big, layout, arena, report: null, k, def: hideoutScene(ya) };
  const { def, report } = assemble(spec, REGISTRY);
  def.report = report;
  if (dm?.kind === roomKind && !o.forceSpec && !o.viewSpec) def.pack = `map-${dm.id}-${spec.season}-${spec.exits?.length ?? 0}`;
  return { spec, big, layout, arena, report, k, def };
}

/** 11-18 per blow: [hit-stop s (× TUNE.hitstop), camera push m, rumble (trauma × TUNE.shake), push-in share, hit sound] */
// (act-109 打击感收口重构: fxImpact no longer injects hidden per-target shake/hitstop — BEAT is the single source of truth, restoring
//  clear dynamic contrast from feather-light darts → crisp light cuts → heavy finisher / 破势 / 一闪)
const BEAT: Record<string, [number, number, number, number, Cue]> = {
  k1: [0.042, 0.15, 0.09, 0, 'hitLight'], k2: [0.044, 0.16, 0.095, 0, 'hitLight'], k3: [0.056, 0.2, 0.13, 0.015, 'hitLight'], k4: [0.032, 0.12, 0.065, 0, 'hitStab'],
  k5: [0.115, 0.32, 0.29, 0.075, 'hitHeavy'], heavy: [0.085, 0.24, 0.18, 0.04, 'hitHeavy'], dcut: [0.062, 0.2, 0.12, 0.02, 'hitHeavy'], launch: [0.072, 0.18, 0.15, 0.03, 'hitHeavy'],
  kick: [0.078, 0.24, 0.18, 0.025, 'hitKick'], plunge: [0.098, 0.18, 0.28, 0.06, 'hitHeavy'], rel: [0.04, 0.36, 0.34, 0.09, 'hitIai'], parry: [0.09, 0.28, 0.28, 0.065, 'hitHeavy'],
  arrow: [0.052, 0.12, 0.085, 0, 'hitLight'], wind: [0.028, 0.06, 0.03, 0, 'hitLight'], kunai: [0.014, 0.045, 0.018, 0, 'hitStab'],
  // 11-18 四本新刀谱: 断云's two quick cuts in the air, its third, its slam into the ground; 掠地; 踏顶; 牵红's yank
  acut: [0.034, 0.12, 0.06, 0, 'hitLight'], acutF: [0.065, 0.22, 0.14, 0.03, 'hitHeavy'], acutS: [0.105, 0.26, 0.28, 0.06, 'hitHeavy'],
  swoop: [0.072, 0.22, 0.15, 0.03, 'hitHeavy'], stomp: [0.065, 0.16, 0.18, 0.025, 'hitKick'], reel: [0.028, 0.1, 0.035, 0, 'hitStab'],
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
  private mods: RunMods = { dmgMul: 1, critBonus: 0, dartBonus: 0, startCoins: 0, hpBonus: 0, deathDefy: 0, startIntent: 0, windupMul: 1, startManual: false, poiseHeal: 0, firstStrikeBonus: 0, styleBonus: 0, dashCdMul: 1, counterBonus: 0, markedDmgBonus: 0, poiseDmgMul: 1, rareOddsBonus: 0, interestRate: 0 };
  /** act-169: rewarded ad modal, per-run revive & divination trackers, and hideout 3D extras */
  private adModal!: AdSimModal;
  private gameClub!: GameClubBadge;
  private usedRevive = false;
  private divineSchoolRun: Archetype | null = null;
  private lanternMesh: THREE.Group | null = null; private lanternTick: ((t: number) => void) | null = null;
  private decorMesh: THREE.Group | null = null; private decorTick: ((t: number) => void) | null = null;
  private trialSteleMesh: THREE.Group | null = null;
  private extraAnimT = 0;
  /** act-161 调试版战斗统计（__dh.fight()）: this run's damage by source, each boss's time (its body, its barrier phases), blows taken, health given
   *  back — the numbers the balance model could only guess at. Filled only under __DEBUG_UI__ (the desktop / Pages build) */
  private fightLog = { t0: 0, dmg: {} as Record<string, { n: number; sum: number }>, bosses: [] as Array<{ uid: number; kind: string; region: number; hp: number; t0: number; t1: number; gate: number }>, taken: { n: 0, sum: 0, byBoss: 0 }, healed: 0 };
  private tally(kind: string, d: number, f: Foe) {
    if (f.kind === 'dummy' || d <= 0) return;
    const e = (this.fightLog.dmg[kind] ??= { n: 0, sum: 0 }); e.n++; e.sum += d;
    if (isBoss(f) && !this.fightLog.bosses.some(b => b.uid === f.uid)) this.fightLog.bosses.push({ uid: f.uid, kind: f.kind, region: this.region, hp: f.maxHp, t0: clock.time, t1: 0, gate: 0 });
  }
  private fightReport() {
    const L = this.fightLog, total = Object.values(L.dmg).reduce((s, e) => s + e.sum, 0), r1 = (x: number) => Math.round(x * 10) / 10;
    return {
      seconds: r1(clock.time - L.t0), total,
      bySource: Object.entries(L.dmg).sort((a, b) => b[1].sum - a[1].sum).map(([kind, e]) => ({ kind, hits: e.n, dmg: e.sum, share: total ? r1(e.sum / total * 100) : 0 })),
      bosses: L.bosses.map(b => ({ kind: b.kind, region: b.region + 1, hp: b.hp, down: b.t1 > 0, bodySec: r1((b.t1 || clock.time) - b.t0 - b.gate), gateSec: r1(b.gate) })),
      taken: { ...L.taken }, healed: L.healed,
    };
  }
  /** act-118: live combo & move-variety tracker (变招连段奖励) */
  private comboHits = 0; private comboT = 0; private comboKinds: string[] = [];
  /** act-20 the hideout's people: where they stand, their bodies; the one in reach of a word */
  private npcs: Array<{ id: string; x: number; z: number; yaw: number; a: BattleActor; sh: THREE.Mesh }> = []; private npcNear: string | null = null;
  private stationNear: Station | null = null; private merchantNear = false; private roadDuwuNear = false; private shopOpening = false;
  private worldPlates!: UiPlatePool;
  /** act-20 the stele of names in the hideout; talk is off while a scripted moment plays there */ private stele: Stele | null = null; private noTalk = false;
  private defy = 0; private wine = false; private eliteKills = 0; private bossKilled = false; private banked: { iron: number; herb: number } | null = null;
  /** act-131: boss-death minion rout state + per-run replacement boss pool tracker (no resurrecting slain story bosses!) */
  private bossDefeated = false; private poolBossRoom = false; private usedPoolBosses = new Set<string>();
  /** act-146: exact pending staggered-spawn counter & generation token so fast kills can never prematurely advance waves or skip a boss */
  private wavePending = 0; private waveGen = 0; private bossIntroActive = false;
  /** act-137: canonical story boss held kneeling on-field during first-kill slowmo & CH_AFTER confrontation until executed on cue */
  private kneelingBoss: { f: Foe; t: number; executed: boolean; region: number } | null = null;
  private fleeing: Array<{ a: BattleActor; pos: THREE.Vector3; dir: THREE.Vector3; t: number; dur: number }> = [];
  private clearFleeing() { for (const f of this.fleeing) f.a.dispose(); this.fleeing.length = 0; }
  /** a cutscene's place: the open land, no walls / gates / props */ private noArena = false;
  /** 11-18: the shallow water on this room's floor (下邳: the 水鬼 swim in it; LOCALES[…].pools) */ private pools: Array<{ x0: number; x1: number; z0: number; z1: number }> = [];
  private wetStepT = 0;
  /** act-34: a room built ahead of time (prepRoom), waiting to be put up; buildRoom uses it when it is the room asked for */
  private ahead: AheadRoom[] = [];
  private aheadTurn = 0;
  private pre: (Room & { locale: string }) | null = null;
  // ------------------------------------------------------------ act-20: story — portrait dialogue, timeline cutscenes, puppets
  dialogue: Dialogue; timeline: Timeline; pause!: PauseMenu; private pauseHud: boolean | null = null; private padSkip = false; private puppets: Foe[] = []; private wasPhase: Phase = 'yard'; private justDied = false;
  /** act-29 开篇 (方案 1): 1 = the snowy village (the first fight, alone), 2 = the snowy temple (褚雷, a fight she cannot win), 0 = off */
  prologue = 0; private forceSpec: Partial<Spec> | null = null; private proFightT = 0; private proFalling = false; private proPeople: BattleActor[] = [];
  /** 11-19 剧情改版: the snowy village and the spot she stood ringed in — dawn is there (the ditch outside 崔府's back gate) */
  private proSpec0: Spec | null = null; private proAt0: { x: number; z: number } | null = null;
  private proAhead: ProJob | null = null;
  private dropPro() {
    const j = this.proAhead; this.proAhead = null;
    if (!j) return;
    if (j.ready) j.ready.prep.drop(); else j.steps.return(undefined as never);
  }
  /** which prologue place a build now asks for (the one proAhead may hold) */
  private proTag(isYard: boolean): ProJob['tag'] | null {
    return isYard ? 'yard' : this.prologue === 2 ? (this.viewSpec && this.noArena ? 'dawn' : this.viewSpec ? null : 'boss') : null;
  }
  /** the dawn's view of the snowy village (prologueFall builds the same) */
  private dawnView(): Partial<Spec> {
    const sp = this.proSpec0 ?? this.spec;
    return { locale: PRO_ROOM.locale, season: 'winter', time: 'dawn', weather: 'clear', layout: sp?.layout ?? 'axis', mirror: sp?.mirror ?? false, seed: sp?.seed ?? 5, exits: [] };
  }
  private queuePro(tag: ProJob['tag']) {
    this.dropPro();
    if (!OPT.roomAhead) return;
    const base = { recent: this.recent.slice(), shapes: this.shapes.slice(), maps: this.maps.slice(), shape: this.forceShape, seed: this.forceSeed, map: this.forceMap, regionSpec: null };
    const want: RoomIn = tag === 'boss'
      ? { ...base, isYard: false, room: this.room + 1, locale: PRO_BOSS.locale, plan: PRO_BOSS, nextRooms: [], viewSpec: null, forceSpec: { ...PRO_BOSS_SPEC }, noArena: false, region: undefined }
      : tag === 'dawn'
      ? { ...base, isYard: false, room: this.room, locale: this.locale, plan: this.plan, nextRooms: [], viewSpec: this.dawnView() as Spec, forceSpec: null, noArena: true, region: undefined }
      : { ...base, recent: [], isYard: true, room: -1, locale: 'ninja_wilds', plan: null, nextRooms: [], viewSpec: null, forceSpec: null, noArena: false, region: this.region };
    this.proAhead = { tag, steps: prepRoomSteps(want, true) };
  }
  /** a slice of the prologue's next place each frame — more while a cutscene or a talk plays */
  private workPro() {
    const j = this.proAhead;
    if (!j || j.ready || j.wait || bladeBusy()) return;
    const ms = this.phase === 'cine' || this.phase === 'talk' || this.phase === 'doors' || this.phase === 'leaving' ? 8 : 3;
    try { advanceAhead(j, performance.now() + ms); }
    catch (error) { console.warn('[stage] prologue background build failed', error); this.dropPro(); }
  }
  /** 11-18: her pose from 石雷's blow until 杜五 lifts her onto the donkey — on one knee, bleeding (prologue.ts Kneel) */
  private proKneel = new Kneel();
  /** act-114: Cui Xuan's inspect/reach motion during pro_fall, Three Kingdoms ally/duel generals, ending scene puppet & per-frame talk hook */
  private cuiInspect = new CuiInspect();
  private allyGen: AllyGeneral | null = null;
  private duelGen: { f: Foe; region: number; t: number; parries: number; done: boolean } | null = null;
  private endCui: BattleActor | null = null;
  private talkTick: ((dt: number) => void) | null = null;
  private pendingDeathTalk = false;
  private forceGeneral: number | null = null;
  private proHost: PrologueHost = {
    hero: { get a() { return SELF!.hero.a; }, get pos() { return SELF!.hero.pos; } } as PrologueHost['hero'],
    kneel: this.proKneel,
    person: (id, x, z, yaw) => { const a = new BattleActor(id === 'duwu' ? HIDEOUT_PEOPLE.duwu : HIDEOUT_DONKEY); a.place(V3(x, 0, z), yaw); a.yaw = yaw; trimShadows(a.root, 4); this.proPeople.push(a); return a; },
    puppet: (kind, x, z, fx, fz) => this.cineHost.puppet(kind, x, z, fx, fz),
    hold: (p, r) => this.clamp(p, r),
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
    const h0 = this.hero;
    if (h0) { h0.a.root.visible = true; h0.a.body.visible = true; }
    const was = this.phase === 'talk' ? this.wasPhase : this.phase; this.wasPhase = was; this.phase = 'talk'; this.hud.on = false; this.banner.hide(); this.barks?.clear(); this.hideHideoutLabels(); this.hideWorldPlates();
    this.syncHeroHat();
    await this.dialogue.play(lines, onLine);
    // (act-50 用户：「对话过后马上会蓄力」: the cut button that turned the last page was still down — read as a hold, 藏锋. It counts
    //  again once let go; the stick is left alone; guard hero identity so a room change never restores a stale phase like 'leaving')
    if (this.hero === h0 && this.phase === 'talk') { this.phase = was; this.hud.on = true; }
    this.inp.latch(false);
  }
  /** a timeline cutscene; the HUD hides, gameplay waits (phase 'cine'); optional onEnd guarantees skip-safe end state */
  async cine(shots: Parameters<Timeline['play']>[0], onEnd?: (skipped: boolean) => void) {
    if (this.hero) { this.hero.a.root.visible = true; this.hero.a.body.visible = true; }
    const was = this.phase; this.phase = 'cine'; this.hud.on = false; this.banner.hide(); this.hideHideoutLabels(); this.hideWorldPlates();
    const skipped = await this.timeline.play(shots, onEnd);
    this.cineHost.clearPuppets(); this.inp.latch(false);   // (a long press skipped it — the same held button)
    shot('act', () => this.camPose(), { cut: true, speed: 8 });
    this.phase = was; this.hud.on = true; return skipped;
  }
  /** 开始游戏: a fresh save, the opening cutscene on the burning field, then the hideout and her first waking */
  async startNewGame() {
    newGame();
    // a new game: 刘白 in her default look again, the white-haired one (the costume the browser remembered goes)
    { const d = HEROES.find(x => x.id === DEFAULT_HERO); if (d) { this.wearing = d; if (this.hud.flask instanceof IronHp) this.hud.flask.setFace(d.id); else HP_FACE.id = d.id; try { localStorage.setItem('act.hero7', d.id); } catch { /* storage blocked */ } } }
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
      const pov = new BlindPOV(this.L); pov.fill(0x000000, 1, true); this.hud.on = false; stopTitle(); audio.setWeatherSound('none', 0.3);
      this.musicHold = 'bgm_coldopen'; void audio.playMusic('bgm_coldopen', 0.6);   // (held through the walk; the ambush crossfades it out)
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
    this.prologue = 1; this.proFalling = false; this.proFightT = 0; this.tut.reset();
    // act-140: pre-download voice subpackages & pre-decode opening sentry/boss dialogues during the 16s walk-in so the first line plays at 0ms!
    warmVoicePacks(); warmLines(PRO_AMBUSH); warmLines(PRO_CUIXUAN);
    this.intent = 0; this.intentVal = 0; this.hud.intent = 0; this.perks = newPerks(); this.room = 0; this.kills = 0; this.recent = []; this.visited = []; this.coins = 0;
    this.mods = runMods(profile()); this.defy = 0; this.eliteKills = 0; this.bossKilled = false; this.wine = false;
    TUNE.heroHp = 100 + this.mods.hpBonus; TUNE.dartCharges = 3 + this.mods.dartBonus; TUNE.aggression = 0.85 / this.mods.windupMul;
    this.baseFoe.aggression = TUNE.aggression; this.scaleFoes(0);
    this.plan = { type: 'fight', locale: PRO_ROOM.locale, reward: null, waves: PRO_ROOM.waves };
    this.locale = PRO_ROOM.locale; this.forceSpec = { ...PRO_ROOM.spec };
    const loading = this.buildRoom(true); if (loading) await loading;
    this.queuePro('boss');   // (11-19: 崔府 builds behind the walk, the ambush and the fight)
    // 「七年后」 over the snowy village while she walks in from the front; then the first sentries
    // (11-19 用户：「前面短促的悲伤音乐加字幕，突然就进入战斗了……需要一个timeline来放刘白走到战场中的过程，和敌人跳出来把她包围了的过程，
    //  辅以对话和文字」): the place and the year over the village from high; she walks in alone up the snowy lane (a long walk, the
    //  steps planted — heroWalk.ts), stops in the middle, turns her head to listen; sounds round her (rings in the snow); the first
    //  wave's sentries jump out from behind the houses and the walls on every side and close round her; the words; she sets her hand
    //  on the hilt — and the fight is on, the sentries already where they stood
    // (where she stops: 6.5 m up the lane, or short of it if a pot / crate / post stands there — her hands and the sabre clear of it)
    const h = this.hero, p0 = h.pos.clone(); let WALK = 6.5;
    while (WALK > 3 && !(this.solids.free(p0.x, p0.z - WALK, 1.0, 0.3) && (!this.grid || this.grid.clear(p0.x, p0.z - WALK, 1.0)))) WALK -= 0.25;
    const stopZ = p0.z - WALK;
    this.proSpec0 = this.spec ?? null; this.proAt0 = { x: p0.x, z: stopZ };
    const ring = (this.plan?.waves[0] ?? []).map((k, i, all) => ({ k, a: Math.PI * 0.15 + (i / all.length) * Math.PI * 2 + 0.35, d: 3.4 + (i % 2) * 0.7 }));
    const jumpers: Array<{ f: Foe; from: THREE.Vector3; crest: THREE.Vector3; land: THREE.Vector3; to: THREE.Vector3; wall: number; t0: number; perched: boolean; landed: boolean }> = [];
    const snowRing = (x: number, z: number, r = 1.4) => fxRing(V3(x, 0.05, z), 0xdfe8ff, r, { life: 0.9 } as never);
    const stand = () => { h.pos.z = stopZ; motionOf(h.a).run = 0; };
    const cam = (dx: number, y: number, dz: number, lz: number, fov: number): { pos: V; look: V; fov: number } => ({ pos: [p0.x + dx, y, stopZ + dz] as V, look: [p0.x, 0.9, stopZ + lz] as V, fov });
    const spawnAmbushers = () => {
      if (jumpers.length) return;
      const b = this.grid ? this.grid.sp.box : { x0: PLAY.x0, x1: PLAY.x1, z0: PLAY.z0, z1: PLAY.z1 };
      for (const [i, r] of ring.entries()) {
        // (where each lands: round her at its own angle, turned a little at a time until the spot is clear of the props, the cover
        //  and the walls — none lands in a post or a crate)
        const clearAt = (x: number, z: number, rr: number) => this.solids.free(x, z, rr, 0.3) && (!this.grid || this.grid.clear(x, z, rr));
        let a = r.a, dd = r.d; const ok = (x: number, z: number) => clearAt(x, z, 0.9) && jumpers.every(j => j.to.distanceTo(V3(x, 0, z)) > 1.3);
        for (let tt = 0; tt < 24 && !ok(p0.x + Math.sin(a) * dd, stopZ + Math.cos(a) * dd); tt++) { a += (tt % 2 ? -1 : 1) * 0.22 * (tt + 1); if (tt === 12) dd += 0.6; }
        const ko = kindOr(r.k), to = V3(p0.x + Math.sin(a) * dd, 0, stopZ + Math.cos(a) * dd);
        // act-135 / act-137: opening ambushers start just behind the village perimeter wall, vault cleanly onto a realistic landing spot
        // 1.8–2.4m inside the wall, absorb the landing in a crouch, then sprint across the snow into encirclement around Liu Bai!
        const dx = Math.sin(a), dz = Math.cos(a);
        let sEdge = 1e9, hitFront = false;
        if (dx > 1e-4) { const s = (b.x1 - to.x) / dx; if (s > 0 && s < sEdge) { sEdge = s; hitFront = false; } }
        else if (dx < -1e-4) { const s = (b.x0 - to.x) / dx; if (s > 0 && s < sEdge) { sEdge = s; hitFront = false; } }
        if (dz > 1e-4) { const s = (b.z1 - to.z) / dz; if (s > 0 && s < sEdge) { sEdge = s; hitFront = true; } }
        else if (dz < -1e-4) { const s = (b.z0 - to.z) / dz; if (s > 0 && s < sEdge) { sEdge = s; hitFront = false; } }
        const edgeDist = Math.min(12, Math.max(2.2, sEdge));
        const crest = V3(to.x + dx * edgeDist, 0, to.z + dz * edgeDist);
        const from = V3(crest.x + dx * 0.9, 0, crest.z + dz * 0.9);
        const leapSpan = Math.min(2.2, edgeDist);
        const land = edgeDist <= 2.4 ? to.clone() : V3(crest.x - dx * leapSpan, 0, crest.z - dz * leapSpan);
        if (this.grid && this.grid.at(land.x, land.z) !== FLOOR) { const q = this.grid.nearestFloor(land.x, land.z); land.set(q[0], 0, q[1]); }
        const wall = hitFront ? 0 : 2.45;
        const f = spawnFoe(ko.kind, from, h.pos.clone(), ko.elite); f.st = 'enter'; f.cd = 2.5;
        f.a.root.visible = false;
        this.foes.push(f);
        jumpers.push({ f, from, crest, land, to, wall, t0: 0.08 + i * 0.28, perched: false, landed: false });
      }
      cue('roar', 0.35); this.musicHold = null; void audio.playMusic(this.musicName(), 2.5);
    };
    void this.cine([
      // Shot 1: Aerial snow establishing over the silent village rooftops
      { dur: 2.8, ease: 'out', caption: { text: PRO_CAPTIONS[1], big: true, at: 0.45, hold: 2.0 }, from: { pos: [p0.x + 4.2, 16.5, p0.z + 14.5], look: [p0.x, 0, p0.z - 5], fov: 40 }, to: { pos: [p0.x + 3.4, 14.2, p0.z + 12.8], look: [p0.x, 0, p0.z - 5], fov: 39 },
        tick: (_t, dt) => h.a.update(dt) },
      // Shot 2A: HARD CUT to low side-tracking shot on her boots crunching snow & crimson tassels swaying
      { dur: 2.6, ease: 'linear', from: () => ({ pos: [p0.x + 3.6, 2.35, h.pos.z + 3.8] as V, look: [p0.x, 0.85, h.pos.z - 1.2] as V, fov: 35 }), to: () => ({ pos: [p0.x + 3.3, 2.25, h.pos.z + 3.4] as V, look: [p0.x, 0.85, h.pos.z - 1.4] as V, fov: 34 }),
        tick: (t, dt) => { const m = motionOf(h.a); h.a.yaw = Math.PI; h.pos.z = p0.z - Math.min(WALK * 0.55, t * 1.38); m.run = 0.24; h.a.update(dt); } },
      // Shot 2B: HARD CUT to reverse front-3/4 angle as she walks straight toward camera & halts sharply!
      { dur: 2.2, ease: 'out', from: () => ({ pos: [p0.x - 2.6, 2.45, stopZ - 4.4] as V, look: [p0.x, 1.0, h.pos.z] as V, fov: 35 }), to: () => ({ pos: [p0.x - 2.3, 2.35, stopZ - 3.9] as V, look: [p0.x, 1.05, stopZ] as V, fov: 34 }),
        tick: (t, dt) => { const m = motionOf(h.a); h.a.yaw = Math.PI; h.pos.z = Math.max(stopZ, p0.z - WALK * 0.55 - t * 1.45); m.run = h.pos.z > stopZ + 0.05 ? 0.24 : Math.max(0, m.run - dt * 5); h.a.update(dt); } },
      // Shot 3: HARD CUT tight listening beat — head turns, concentric snow sound rings ripple out around her
      { dur: 2.3, ease: 'out', from: cam(3.6, 2.45, 4.6, -0.5, 34), to: cam(3.2, 2.35, 4.1, -0.4, 33),
        at: [[0.25, () => snowRing(p0.x - 3.2, stopZ - 1.8)], [0.7, () => snowRing(p0.x + 3.6, stopZ + 0.6)], [1.15, () => snowRing(p0.x - 1.0, stopZ - 3.8)], [1.6, () => snowRing(p0.x + 1.8, stopZ + 3.2)], [0.9, () => cue('foeSwing', 0.25)]],
        tick: (t, dt) => { stand(); h.a.update(dt); const hd = h.a.bones.head; if (hd) hd.rotation.y += 0.35 * Math.sin(Math.min(1, t / 1.4) * Math.PI); } },
      // Shot 4A: HARD CUT high-wide ambush cut as sentries vault cleanly over the snowy village walls
      { dur: 2.35, ease: 'out', from: cam(0.6, 7.2, 8.6, -0.8, 40), to: cam(0.4, 6.4, 7.6, -0.6, 40),
        at: [[0, spawnAmbushers]],
        tick: (t, dt) => {
          stand(); h.a.update(dt);
          for (const j of jumpers) {
            const f = j.f, el = t - j.t0;
            if (el < 0) { f.a.root.visible = false; continue; }
            f.a.root.visible = true;
            const runDist = j.land.distanceTo(j.to), runDur = runDist > 0.3 ? Math.max(0.25, runDist / 4.8) : 0;
            let pPhase: VaultPhase | null = null, pU = 0;
            if (j.wall > 1.2) {
              const CLIMB = 0.28, PERCH = 0.12, LEAP = 0.44, LAND = 0.18;
              const tP = CLIMB, tL = tP + PERCH, tD = tL + LEAP, tR = tD + LAND;
              if (el < tP) {
                const u = el / CLIMB; pPhase = 'climb'; pU = u;
                f.pos.lerpVectors(j.from, j.crest, u * 0.38); f.pos.y = 0; f.a.home.copy(f.pos);
                f.a.off.y = (j.wall - 0.12) * (1 - (1 - u) * (1 - u));
                f.yaw = Math.atan2(j.crest.x - j.from.x, j.crest.z - j.from.z); f.a.setRunning(false);
              } else if (el < tL) {
                const u = (el - tP) / PERCH; pPhase = 'perch'; pU = u;
                if (!j.perched) { j.perched = true; fxSmoke(j.crest.clone().setY(j.wall), 0xdce4f0, 4, { r: 0.35, spd: 0.7, up: 0.25, s: 0.26, life: 0.42, alpha: 0.5 }); }
                f.pos.lerpVectors(j.from, j.crest, 0.38 + 0.62 * u); f.pos.y = 0; f.a.home.copy(f.pos);
                f.a.off.y = j.wall;
                f.yaw = Math.atan2(j.land.x - j.crest.x, j.land.z - j.crest.z); f.a.setRunning(false);
              } else if (el < tD) {
                const u = (el - tL) / LEAP; pPhase = 'leap'; pU = u;
                f.pos.lerpVectors(j.crest, j.land, u); f.pos.y = 0; f.a.home.copy(f.pos);
                f.a.off.y = j.wall * (1 - u * u) + 0.62 * 4 * u * (1 - u);
                f.yaw = Math.atan2(j.land.x - j.crest.x, j.land.z - j.crest.z); f.a.setRunning(false);
              } else if (el < tR) {
                const u = (el - tD) / LAND; pPhase = 'land'; pU = u;
                if (!j.landed) { j.landed = true; cue('land', 0.42); fxSmoke(j.land.clone().setY(0.1), 0xe8eef8, 8, { r: 0.65, spd: 1.0, up: 0.45, s: 0.42, life: 0.65, alpha: 0.65 }); }
                f.pos.copy(j.land); f.pos.y = 0; f.a.home.copy(f.pos); f.a.off.y = 0;
                f.yaw = Math.atan2(h.pos.x - f.pos.x, h.pos.z - f.pos.z); f.a.setRunning(false);
              } else if (runDur > 0 && el < tR + runDur) {
                const u = (el - tR) / runDur;
                f.pos.lerpVectors(j.land, j.to, u); f.pos.y = 0; f.a.home.copy(f.pos); f.a.off.y = 0; f.a.body.rotation.set(0, 0, 0);
                f.yaw = Math.atan2(j.to.x - j.land.x, j.to.z - j.land.z); f.a.setRunning(true, 4.8, f.yaw);
              } else {
                if (!j.landed) { j.landed = true; cue('land', 0.42); }
                f.pos.copy(j.to); f.pos.y = 0; f.a.home.copy(f.pos); f.a.off.y = 0; f.a.body.rotation.set(0, 0, 0);
                f.yaw = Math.atan2(h.pos.x - f.pos.x, h.pos.z - f.pos.z); f.a.setRunning(false);
              }
            } else {
              // Open front road: agile low hurdle + sprint straight in (zero invisible wall climb!)
              const HURDLE = 0.36, LAND = 0.14;
              const tD = HURDLE, tR = tD + LAND;
              if (el < tD) {
                const u = el / HURDLE; pPhase = 'hurdle'; pU = u;
                f.pos.lerpVectors(j.from, j.land, u); f.pos.y = 0; f.a.home.copy(f.pos);
                f.a.off.y = 0.55 * 4 * u * (1 - u);
                f.yaw = Math.atan2(j.land.x - j.from.x, j.land.z - j.from.z); f.a.setRunning(false);
              } else if (el < tR) {
                const u = (el - tD) / LAND; pPhase = 'land'; pU = u;
                if (!j.landed) { j.landed = true; cue('land', 0.36); fxSmoke(j.land.clone().setY(0.1), 0xe8eef8, 6, { r: 0.55, spd: 0.9, up: 0.35, s: 0.36, life: 0.55, alpha: 0.6 }); }
                f.pos.copy(j.land); f.pos.y = 0; f.a.home.copy(f.pos); f.a.off.y = 0;
                f.yaw = Math.atan2(h.pos.x - f.pos.x, h.pos.z - f.pos.z); f.a.setRunning(false);
              } else if (runDur > 0 && el < tR + runDur) {
                const u = (el - tR) / runDur;
                f.pos.lerpVectors(j.land, j.to, u); f.pos.y = 0; f.a.home.copy(f.pos); f.a.off.y = 0; f.a.body.rotation.set(0, 0, 0);
                f.yaw = Math.atan2(j.to.x - j.land.x, j.to.z - j.land.z); f.a.setRunning(true, 4.8, f.yaw);
              } else {
                if (!j.landed) { j.landed = true; cue('land', 0.36); }
                f.pos.copy(j.to); f.pos.y = 0; f.a.home.copy(f.pos); f.a.off.y = 0; f.a.body.rotation.set(0, 0, 0);
                f.yaw = Math.atan2(h.pos.x - f.pos.x, h.pos.z - f.pos.z); f.a.setRunning(false);
              }
            }
            f.a.yaw = f.yaw;
            f.a.update(dt);
            if (pPhase) poseWallVault(f.a, pPhase, pU);
          }
        } },
      // Shot 4B: HARD CUT dramatic low angle inside the closing ring — Liu Bai heroic center framed by the 4 ambushers!
      { dur: 1.55, ease: 'out', from: cam(4.4, 2.75, 5.4, -0.4, 37), to: cam(3.9, 2.55, 4.9, -0.3, 35),
        at: [[0, () => {
          for (const j of jumpers) {
            j.landed = true; j.f.a.root.visible = true; j.f.pos.copy(j.to); j.f.pos.y = 0; j.f.a.home.copy(j.to); j.f.a.off.y = 0; j.f.a.body.rotation.set(0, 0, 0); j.f.a.setRunning(false);
            j.f.yaw = Math.atan2(h.pos.x - j.f.pos.x, h.pos.z - j.f.pos.z); j.f.a.yaw = j.f.yaw;
          }
        }]],
        tick: (_t, dt) => { stand(); h.a.update(dt); for (const j of jumpers) j.f.a.update(dt); } },
    ], () => {
      // act-114 skip-safety: even if player skipped shot 0/1/2, hero is at stopZ and wave-0 ambushers are landed & music is live
      h.pos.set(p0.x, 0, stopZ); h.a.home.copy(h.pos); h.a.root.position.copy(h.pos); h.a.yaw = Math.PI; motionOf(h.a).run = 0;
      spawnAmbushers();
      for (const j of jumpers) {
        j.landed = true; j.f.a.root.visible = true; j.f.pos.copy(j.to); j.f.pos.y = 0; j.f.a.home.copy(j.to); j.f.a.off.y = 0; j.f.a.body.rotation.set(0, 0, 0); j.f.a.setRunning(false);
        j.f.yaw = Math.atan2(h.pos.x - j.f.pos.x, h.pos.z - j.f.pos.z); j.f.a.yaw = j.f.yaw; j.f.a.update(0.016);
      }
      if (this.musicHold) { this.musicHold = null; void audio.playMusic(this.musicName(), 2.0); }
    }).then(async () => {
      if (this.phase !== 'intro' || this.hero !== h) return;
      for (const j of jumpers) { j.f.a.root.visible = true; j.f.pos.copy(j.to); j.f.a.home.copy(j.to); j.f.a.off.y = 0; j.f.a.body.rotation.set(0, 0, 0); j.f.a.setRunning(false); }
      let ambT = 0, hiltPose = false;
      // Shot 0: CRISP HARD CUT low over-hero-shoulder framing the roaring sentries ahead
      this.cutCam([h.pos.x + 2.8, 2.55, h.pos.z + 4.2], [h.pos.x, 1.05, h.pos.z - 2.6], 38, { drift: [-0.28, -0.05, -0.35], fovDrift: -1.2 });
      this.talkTick = (dt: number) => {
        ambT += dt;
        for (const j of jumpers) j.f.a.update(dt);
      };
      await this.talk(PRO_AMBUSH, (i) => {
        if (i === 0 && jumpers[0]) jumpers[0].f.a.roar();
        if (i === 1 && jumpers[1]) {
          jumpers[1].f.a.roar();
          this.cutCam([h.pos.x - 3.0, 2.55, h.pos.z + 4.0], [jumpers[1].f.pos.x, 1.05, jumpers[1].f.pos.z], 37, { drift: [0.30, -0.04, -0.30], fovDrift: -1.2 });
        }
        if (i === 2 && !hiltPose) {
          hiltPose = true;
          h.scriptPose = () => heroHandOnHiltPose(h.a, ambT);
          cue('parry', 0.25); cue('snowWind', 0.45);
          fxRing(h.pos.clone().setY(0.06), 0xeef4ff, 2.2, { life: 0.85, width: 0.08, bright: 1.4 } as never);
          // Shot 2: HARD CUT to tight front-side close-up on Liu Bai tilting chin & gripping hilt
          this.cutCam([h.pos.x + 2.55, 2.28, h.pos.z - 2.8], [h.pos.x, 1.08, h.pos.z], 34, { drift: [-0.20, -0.04, 0.20], fovDrift: -1.4 });
        }
        if (i === 3) {
          // Shot 3: HARD CUT to dramatic low wide confrontation showing her ringed by the 4 sentries
          this.cutCam([h.pos.x + 4.4, 3.3, h.pos.z + 5.8], [h.pos.x, 1.0, h.pos.z - 0.6], 40, { drift: [-0.35, -0.08, -0.40], fovDrift: -1.0 });
        }
      });
      this.talkTick = null; h.scriptPose = null; this.releaseCutCam();
      if (this.hero !== h) return;
      for (const j of jumpers) { j.f.st = 'move'; j.f.cd = 0.6 + Math.random() * 0.8; }
      // (the ambushers ARE the first wave: the fight starts with them on the floor; cutting them down brings the second as usual)
      this.phase = 'fight'; this.wave = 0;
    });
  }
  /** act-169: Re-stage a hero/boss cutscene pair onto guaranteed open interior floor (>= margin from all walls, solids & pits)
   *  so knockbacks, thrown weapons, kneeling, and prone collapses NEVER clip into courtyard walls or pillars. */
  private stageSafePair(heroPos: THREE.Vector3, bossPos: THREE.Vector3, gap: number, margin = 3.0, mode: 'inward' | 'ns' = 'inward') {
    const b = this.grid ? this.grid.sp.box : { x0: PLAY.x0, x1: PLAY.x1, z0: PLAY.z0, z1: PLAY.z1 };
    const cx = (b.x0 + b.x1) * 0.5, cz = (b.z0 + b.z1) * 0.5;
    const minX = Math.min(cx, b.x0 + margin), maxX = Math.max(cx, b.x1 - margin);
    const minZ = Math.min(cz, b.z0 + margin), maxZ = Math.max(cz, b.z1 - margin);
    const inBox = (x: number, z: number, m: number) => x >= b.x0 + m && x <= b.x1 - m && z >= b.z0 + m && z <= b.z1 - m;
    const freePt = (x: number, z: number, r: number, m: number) =>
      inBox(x, z, m) && this.solids.free(x, z, r, 0.3) && (!this.grid || this.grid.clear(x, z, r));
    const checkPair = (hx: number, hz: number, bx: number, bz: number): boolean => {
      if (!freePt(hx, hz, 1.05, margin) || !freePt(bx, bz, 1.05, margin)) return false;
      const dx = bx - hx, dz = bz - hz, l = Math.hypot(dx, dz) || 1;
      const fx = dx / l, fz = dz / l, rx = -fz, rz = fx;
      // Verify knockback/prone & thrown-blade footprint stays well inside walls and clear of solids
      if (mode === 'inward') {
        if (!freePt(hx - fx * 1.65, hz - fz * 1.65, 0.85, 1.45)) return false;
        if (!freePt(hx + fx * 0.95 + rx * 0.95, hz + fz * 0.95 + rz * 0.95, 0.55, 1.2)) return false;
      } else {
        if (!freePt(bx - fx * 1.45, bz - fz * 1.45, 0.75, 1.35)) return false;
      }
      return true;
    };

    const seedMx = Math.max(minX, Math.min(maxX, (heroPos.x + bossPos.x) * 0.5));
    const seedMz = Math.max(minZ, Math.min(maxZ, (heroPos.z + bossPos.z) * 0.5));
    const half = gap * 0.5;
    const tryCenter = (mx: number, mz: number): [number, number, number, number] | null => {
      if (mode === 'ns') {
        const hx = mx, hz = mz + half, bx = mx, bz = mz - half;
        return checkPair(hx, hz, bx, bz) ? [hx, hz, bx, bz] : null;
      }
      // Prefer existing hero->boss axis if clean, else canonical N-S facing inward, else cardinal rotations
      const ox = bossPos.x - heroPos.x, oz = bossPos.z - heroPos.z, ol = Math.hypot(ox, oz);
      const dirs: Array<[number, number]> = [[0, -1], [0, 1], [1, 0], [-1, 0]];
      if (ol > 0.2) dirs.unshift([ox / ol, oz / ol]);
      for (const [fx, fz] of dirs) {
        const hx = mx - fx * half, hz = mz - fz * half;
        const bx = mx + fx * half, bz = mz + fz * half;
        if (checkPair(hx, hz, bx, bz)) return [hx, hz, bx, bz];
      }
      return null;
    };

    let picked = tryCenter(seedMx, seedMz);
    if (!picked) {
      // Spiral from clamped midpoint toward room center (cx, cz), then outward from center
      const anchors: Array<[number, number]> = [
        [seedMx * 0.5 + cx * 0.5, seedMz * 0.5 + cz * 0.5],
        [cx, cz],
      ];
      for (const [ax, az] of anchors) {
        picked = tryCenter(ax, az);
        if (picked) break;
        for (const rad of [1.2, 2.4, 3.6, 5.0]) {
          for (let k = 0; k < 12; k++) {
            const ang = (k / 12) * Math.PI * 2;
            picked = tryCenter(ax + Math.cos(ang) * rad, az + Math.sin(ang) * rad);
            if (picked) break;
          }
          if (picked) break;
        }
        if (picked) break;
      }
    }
    if (picked) {
      heroPos.set(picked[0], 0, picked[1]);
      bossPos.set(picked[2], 0, picked[3]);
    } else {
      heroPos.set(cx, 0, cz + half);
      bossPos.set(cx, 0, cz - half);
    }
    this.clamp(heroPos, 0.65);
    this.clamp(bossPos, 0.75);
  }
  /** the fight she cannot win: the blow, his word, the snow; dawn and the man with the donkey; the kiln */
  private async prologueFall() {
    if (this.proFalling || this.prologue !== 2) return; this.proFalling = true;
    warmLines(PRO_FALL); warmLines(PRO_DAWN); warmLines(PRO_WAKE); warmVoiceFile('jiangjin/hurt_breath.mp3');
    this.cancelQte();
    this.foeWorld.dark?.(0);
    this.musicHold = 'bgm_fall'; void audio.playMusic('bgm_fall', 0.8);   // (act-37: struck down → the camera rises → the dawn)
    const boss = this.foes.find(f => isBoss(f) && f.st !== 'dead') ?? null;
    this.hero.inv = 99;
    this.hero.a.root.visible = true; this.hero.a.body.visible = true;
    for (const f of this.foes) { dropTeles(f); f.attacking = false; f.lunge = null; }   // nothing left half-swung on the snow
    for (const a of this.arrows) a.kill(); this.arrows.length = 0; this.hitArcs.clear();
    if (boss) {
      // act-169: Re-stage hero & Cui Xuan onto clear interior courtyard floor (>= 3.0m from walls) so disarm, sword stab & prone collapse never clip walls!
      const hSafe = this.hero.pos.clone().setY(0), bSafe = boss.pos.clone().setY(0);
      this.stageSafePair(hSafe, bSafe, 2.75, 3.0, 'inward');
      this.hero.pos.copy(hSafe); this.hero.vel.set(0, 0, 0);
      this.hero.a.home.copy(hSafe); this.hero.a.root.position.copy(hSafe);
      this.hero.a.yaw = Math.atan2(bSafe.x - hSafe.x, bSafe.z - hSafe.z);
      boss.mem.noHide = true;
      revealFoe(boss);
      boss.st = 'move'; boss.inv = 99; boss.vel.set(0, 0, 0);
      if (boss.a.bones.blade) boss.a.bones.blade.visible = true;
      if (boss.a.bones.fan) boss.a.bones.fan.visible = false;
      boss.pos.copy(bSafe);
      boss.a.home.copy(bSafe); boss.a.root.position.copy(bSafe);
      boss.yaw = Math.atan2(hSafe.x - bSafe.x, hSafe.z - bSafe.z);
      boss.a.yaw = boss.yaw;
    } else {
      this.hero.a.home.copy(this.hero.pos);
    }
    const kneelPose = () => this.proKneel.frame(this.hero.a);
    if (boss) {
      await this.cine(fallShots(this.proHost, boss));
      if (!this.proKneel.active) { this.proKneel.start(true); setHurtBreath(true); }   // (the shot skipped before the blow landed: she still goes down on her knee)
      // act-114 / act-157 / act-165: Crisp hard-cut cinema coverage for PRO_FALL
      this.cuiInspect.start(boss, this.hero.pos, (p, r) => this.clamp(p, r));
      this.hero.scriptPose = kneelPose;
      const cutFallCam = (mode: 'wide' | 'reach' | 'cui' | 'stand') => {
        const hp = this.hero.pos, bp = boss.pos;
        const mx = (hp.x + bp.x) * 0.5, mz = (hp.z + bp.z) * 0.5;
        let dx = bp.x - hp.x, dz = bp.z - hp.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        let nx = -dz, nz = dx; if (nz < 0) { nx = -nx; nz = -nz; }
        if (mode === 'reach') {
          this.cutCam([mx + nx * 4.35 - dx * 0.25, 2.38, mz + nz * 4.35 + 0.9], [mx, 0.82, mz], 36, { drift: [-nx * 0.30, -0.05, -nz * 0.30], fovDrift: -1.4 });
        } else if (mode === 'cui') {
          this.cutCam([bp.x - nx * 2.9 - dx * 1.4, 2.32, bp.z - nz * 2.9 - dz * 1.4], [bp.x, 0.98, bp.z], 35, { drift: [nx * 0.22, -0.04, nz * 0.22], fovDrift: -1.2 });
        } else if (mode === 'stand') {
          this.cutCam([hp.x - dx * 3.2 + nx * 2.4, 2.35, hp.z - dz * 3.2 + nz * 2.4], [bp.x, 1.15, bp.z], 36, { drift: [dx * 0.28, 0.06, dz * 0.28], fovDrift: -1.0 });
        } else {
          this.cutCam([mx + nx * 5.0, 2.95, mz + nz * 5.0 + 1.2], [mx, 0.78, mz], 37, { drift: [-nx * 0.32, -0.06, -nz * 0.32], fovDrift: -1.0 });
        }
      };
      cutFallCam('wide');
      await this.talk(PRO_FALL, (i, l) => {
        this.proKneel.reachWant = l.who === 'act' && /刀柄|长刀脱手|挑飞/.test(l.text) ? 1 : 0;
        if (i === 0) { this.cuiInspect.setStage('approach'); cutFallCam('wide'); }
        else if (i === 1) { this.cuiInspect.setStage('reach'); cutFallCam('reach'); }
        else if (i === 2) { cutFallCam('cui'); }
        else if (i >= 4) { this.cuiInspect.setStage('stand'); cutFallCam('stand'); }
      });
      this.cuiInspect.stop();
      this.releaseCutCam();
      this.proKneel.reachWant = 0; this.hero.scriptPose = null;
      this.phase = 'cine'; await this.cine(snowShots(this.proHost, boss));
      setHurtBreath(false);
    } else this.proKneel.start();
    // dawn outside: the snow has stopped, the frozen dead lie in the ditch (11-19 剧情改版: thrown out of 崔府's back gate — the
    //  snowy village's own yard at dawn stands in for the ditch outside the walls, where 杜五 picks over the dead)
    const sp = this.proSpec0 ?? this.spec, at = this.proAt0 ? { ...this.proAt0 } : { x: this.hero.pos.x, z: this.hero.pos.z }, yaw = this.hero.a.yaw;
    await wipeTransit(async () => {
      for (const f of this.foes) f.a.dispose(); this.foes.length = 0;
      this.noArena = true; this.viewSpec = this.dawnView();
      this.forceSpec = null; await this.buildRoom(true); this.viewSpec = null; this.noArena = false;
      this.queuePro('yard');   // (11-19: the kiln builds behind the dawn)
      this.hero.pos.set(at.x, 0, at.z); this.hero.a.place(this.hero.pos, yaw); this.hero.a.root.visible = true; this.hero.a.body.visible = true;
      this.proKneel.dawn(); this.hero.scriptPose = kneelPose; this.hero.a.update(0.016); kneelPose();
    });
    const dead: Array<[EKind, number, number]> = [['hj_mob', at.x - 3.2, at.z + 2.6], ['hj_blade', at.x - 1.4, at.z + 3.6], ['hj_mob', at.x + 2.4, at.z - 1.8]];
    const who: { duwu: BattleActor | null; donkey: BattleActor | null } = { duwu: null, donkey: null };
    await this.cine(dawnShots(this.proHost, at, dead, who), () => snapDawn(this.proHost, at, who));
    // act-156 / act-157 / act-165: sync Du Wu's 3D acting & crisp hard-cut camera coverage with PRO_DAWN
    let dawnKneel = 0, dawnRecoil = 0, dawnRecoilWant = 0;
    const dwOrig = who.duwu ? who.duwu.home.clone() : null;
    this.cutCam([at.x + 4.4, 3.6, at.z + 5.2], [at.x - 0.3, 0.55, at.z + 0.3], 37, { drift: [-0.30, -0.06, -0.35], fovDrift: -1.0 });
    this.talkTick = (dt: number) => {
      const dw = who.duwu as (BattleActor & { kneel?: number }) | null;
      if (!dw) return;
      dawnRecoil += (dawnRecoilWant - dawnRecoil) * Math.min(1, dt * 11);
      dw.kneel = dawnRecoilWant > 0 ? 0 : dawnKneel;
      if (dwOrig && dawnRecoil > 0.01) {
        const back = V3(dwOrig.x - at.x, 0, dwOrig.z - at.z);
        if (back.lengthSq() > 1e-4) back.normalize(); else back.set(-1, 0, 0);
        dw.home.copy(dwOrig).addScaledVector(back, 0.58 * dawnRecoil);
        dw.root.position.copy(dw.home);
      }
      dw.update(dt);
      if (dawnRecoil > 0.01) duwuRecoilPose(dw, dawnRecoil);
      who.donkey?.update(dt);
    };
    await this.talk(PRO_DAWN, (i) => {
      if (i === 2) {
        dawnKneel = 0.78;
        this.cutCam([at.x + 3.0, 2.38, at.z + 3.4], [at.x + 0.2, 0.45, at.z + 0.25], 34, { drift: [-0.22, -0.04, -0.25], fovDrift: -1.2 });
      }
      if (i === 3) {
        dawnKneel = 0.92; cue('click', 0.55); shake(0.08);
        this.cutCam([at.x + 2.45, 2.22, at.z + 2.75], [at.x + 0.15, 0.35, at.z + 0.2], 32, { drift: [-0.16, -0.03, -0.18], fovDrift: -1.2 });
      }
      if (i === 4) {
        dawnRecoilWant = 1;
        cue('land', 0.35); shake(0.14);
        if (who.duwu) fxSmoke(who.duwu.home.clone().setY(0.15), 0xe8eef8, 5, { r: 0.45, spd: 0.9, up: 0.4, s: 0.3, life: 0.5, alpha: 0.6 });
        this.cutCam([at.x - 3.6, 2.65, at.z + 4.2], [at.x, 0.65, at.z + 0.2], 36, { drift: [0.24, -0.05, -0.28], fovDrift: -1.0 });
      }
    });
    this.talkTick = null; this.hero.scriptPose = null; this.releaseCutCam();
    await this.cine(loadShots(this.proHost, who));
    this.proKneel.stop();
    for (const a of this.proPeople) a.dispose(); this.proPeople = [];
    // Checkpoint: survived Cui Xuan & carried to the kiln -> if the player quits now, Continue resumes cleanly at kiln wake-up
    profile().proStage = 'wake'; saveProfile();
    await this.playKilnWake();
  }
  /** act-127 checkpoint resume: jump straight back to Cui Xuan's forecourt duel (skipping the already-cleared snowy village) */
  private async resumePrologueBoss() {
    this.prologue = 2; this.proFalling = false; this.proFightT = 0; this.tut.stop();
    this.intent = 0; this.intentVal = 0; this.hud.intent = 0; this.perks = newPerks(); this.room = 1; this.kills = 0; this.recent = []; this.visited = []; this.coins = 0;
    this.mods = runMods(profile()); this.defy = 0; this.eliteKills = 0; this.bossKilled = false; this.wine = false;
    TUNE.heroHp = 100 + this.mods.hpBonus; TUNE.dartCharges = 3 + this.mods.dartBonus; TUNE.aggression = 0.85 / this.mods.windupMul;
    this.baseFoe.aggression = TUNE.aggression; this.scaleFoes(0);
    this.plan = PRO_BOSS; this.locale = PRO_BOSS.locale; this.forceSpec = { ...PRO_BOSS_SPEC };
    const loading = this.buildRoom(true); if (loading) await loading;
    this.queuePro('dawn');
  }
  /** act-127 shared kiln wake-up sequence (used both at the end of prologueFall and when resuming from the 'wake' checkpoint) */
  private async playKilnWake() {
    this.prologue = 0; this.proFalling = false; this.forceSpec = null;
    let wakeK: (k: number) => void = () => {};
    let bloomWas = GRADE.bloomThreshold;
    let duwuSaved: { x: number; z: number; yaw: number } | null = null;
    // (act-40 / act-126 / act-142: anchor ALL wake camera beats strictly to HIDEOUT.spawn [孙媪's straw mat in the expanded hideout]
    //  so the camera never drifts back to the old pre-expansion (5.9, -6.2) courtyard coords, and hide HUD/banner during the establishing beat)
    const wakeMat = HIDEOUT.spawn;
    const [mx, mz] = wakeMat;
    let wakeJolt = 0, wakeTurn = 0, wakeTurnWant = 0;
    const cutWakeCam = (stage: 'est' | 'hero' | 'banter' | 'avert' | 'rise') => {
      if (stage === 'est') {
        this.cutCam([mx - 4.0, 3.95, mz + 4.7], [mx + 0.25, 0.72, mz - 0.15], 40, { drift: [0.32, -0.10, -0.36], fovDrift: -1.2, raw: true });
      } else if (stage === 'hero') {
        this.cutCam([mx - 2.65, 2.55, mz + 3.45], [mx + 0.05, 0.72, mz - 0.05], 35, { drift: [0.22, -0.04, -0.22], fovDrift: -1.4, raw: true });
      } else if (stage === 'banter') {
        // Reverse 3/4 framing Du Wu & Sun Ao beside the straw mat
        this.cutCam([mx - 3.45, 2.85, mz + 3.75], [mx + 0.45, 0.95, mz - 0.25], 37, { drift: [0.26, -0.05, -0.24], fovDrift: -1.0, raw: true });
      } else if (stage === 'avert') {
        // Tight close-medium cut on Liu Bai averting her face toward the cold kiln wall
        this.cutCam([mx - 2.15, 2.25, mz + 2.95], [mx + 0.05, 0.68, mz - 0.10], 33, { drift: [0.16, -0.03, -0.18], fovDrift: -1.4, raw: true });
      } else {
        // Rising two-shot as Liu Bai pushes herself up off the straw mat
        this.cutCam([mx - 2.45, 3.35, mz + 4.35], [mx + 0.35, 1.05, mz + 0.15], 38, { drift: [0.24, 0.08, -0.26], fovDrift: -1.0, raw: true });
      }
    };
    await wipeTransit(async () => {
      await this.enterYard({ time: 'dusk', weather: 'clear' }); this.noTalk = true; this.hud.on = false; this.banner.hide(); this.hideHideoutLabels(); this.musicHold = 'bgm_kiln'; void audio.playMusic('bgm_kiln', 1.2);
      const h = this.hero; h.pos.set(wakeMat[0], 0, wakeMat[1]); h.a.place(h.pos, 0); h.a.root.visible = true; h.a.body.visible = true; let gk = 0; h.scriptPose = () => getUpPose(h.a, gk, wakeJolt, wakeTurn);
      if (h.a.bones.hat) h.a.bones.hat.visible = false;
      // Bring Du Wu beside Sun Ao's straw mat in the expanded hideout (clear of mat & stove) so he is cleanly in frame during PRO_WAKE
      const dw = this.npcs.find(n => n.id === 'duwu');
      if (dw) {
        duwuSaved = { x: dw.x, z: dw.z, yaw: dw.yaw };
        dw.x = wakeMat[0] - 1.25; dw.z = wakeMat[1] - 0.15; dw.yaw = Math.atan2(wakeMat[0] - dw.x, wakeMat[1] - dw.z);
        dw.a.place(V3(dw.x, 0, dw.z), dw.yaw); dw.a.yaw = dw.yaw; dw.sh.position.set(dw.x, 0.025, dw.z);
      }
      cutWakeCam('est');
      bloomWas = GRADE.bloomThreshold; GRADE.bloomThreshold = Math.max(bloomWas, 1.6);
      wakeK = (k: number) => { gk = k; };
    });
    // Crisp 3D wake-up acting tick (no sluggish continuous camera lerp — angles switch via 0-frame cinema hard cuts!)
    this.talkTick = (dt: number) => {
      if (wakeJolt > 0) wakeJolt = Math.max(0, wakeJolt - dt * 1.35);
      wakeTurn += (wakeTurnWant - wakeTurn) * Math.min(1, dt * 6);
    };
    await new Promise(r => after(0.65, () => r(null)));
    seeOnce('wake1'); let up = false, talked = false;
    const giveBlade = () => { const w = this.hero.a.bones.weapon; if (w) w.visible = true; };
    const getUp = () => { if (up) return; up = true; cutWakeCam('rise'); const h = this.hero; let k = 0; const step = () => { k = Math.min(1, k + 1 / (30 * 3.2)); wakeK(k);
      if (k < 1) { after(1 / 30, step); return; }
      h.pos.x += Math.sin(h.a.yaw) * GETUP_STEP; h.pos.z += Math.cos(h.a.yaw) * GETUP_STEP; h.a.root.position.copy(h.pos); h.a.body.position.set(0, 0, 0); h.a.body.rotation.set(0, 0, 0); h.scriptPose = null; if (talked) giveBlade(); };
      step(); };
    await this.talk(PRO_WAKE, (i, l) => {
      if (i === 0) { wakeJolt = 1; cue('whoosh', 0.35); cutWakeCam('hero'); }
      else if (i === 1) { cutWakeCam('banter'); }
      else if (i === 2) { cutWakeCam('hero'); }
      else if (i === 3) { cutWakeCam('banter'); }
      else if (l.who === 'act' && /偏脸避开/.test(l.text)) { wakeTurnWant = 1; cutWakeCam('avert'); }
      else if (i === 9 && !up) { cutWakeCam('banter'); }
      else if (l.who === 'jiangjin' && i >= 10 && !up) { cutWakeCam('hero'); }
      else if (l.who === 'act' && /撑起|站起|起身/.test(l.text)) {
        wakeTurnWant = 0; getUp();
        blood.drip(this.hero.a.chest());
      }
    });
    this.talkTick = null;
    getUp(); this.musicHold = null; this.music();
    // Checkpoint: prologue complete -> future Continue always enters the hideout directly
    profile().proStage = 'done'; saveProfile();
    // Restore Du Wu cleanly back to his cook-pot station after PRO_WAKE
    const dwOrig = duwuSaved as { x: number; z: number; yaw: number } | null;
    if (dwOrig) {
      const dw = this.npcs.find(n => n.id === 'duwu');
      if (dw) { dw.x = dwOrig.x; dw.z = dwOrig.z; dw.yaw = dwOrig.yaw; dw.a.place(V3(dw.x, 0, dw.z), dw.yaw); dw.a.yaw = dw.yaw; dw.sh.position.set(dw.x, 0.025, dw.z); }
    }
    talked = true; this.noTalk = false; if (!this.hero.scriptPose) giveBlade();
    this.releaseCutCam(); GRADE.bloomThreshold = bloomWas;   // (the battle camera eases back in)
    // Immediate guiding wind toward Du Wu as control returns (pure environmental guidance, no mobile banner spam)
    this.yardGustT = 0.55;
  }
  /** the run's haul goes home (meta.ts bank: currencies, runs / wins / deaths), saved */
  private lastWon = false;
  private bankRun(won: boolean) {
    this.lastWon = won;
    const p = profile();
    if (won && !this.usedRevive) { p.soloWins = (p.soloWins ?? 0) + 1; }
    // 11-18: a room in region n counts n rooms; every boss killed counts (runReward's boss share is a boolean: the bosses past the first
    // go in as 5 rooms each — act-161: was 15, which alone was 60 rooms on a clear)
    const rooms = roomsWorth(this.region, this.room, won) + Math.max(0, this.bosses - 1) * 5;
    this.banked = bank(p, { rooms, elites: this.eliteKills, boss: this.bossKilled, won, kills: this.kills });
    clearRunAdBuffs(p);
    saveProfile();
    this.syncCollectorVisuals();
  }
  /** Current active weapon id, honoring B1 借刃一试 single-run rental before permanent equipped weapon */
  private currentWeaponId(p = profile()): WeaponId {
    const rent = p.ads?.rentWeapon as WeaponId | null | undefined;
    if (rent && rent in WEAPONS) return rent;
    return equippedWeapon(p, this.dbgAllWeapons);
  }
  /** Unified rewarded-ad runner: watches ad, records D1 长明灯 oil, auto-unlocks milestones & syncs visuals */
  private async watchAd(placement: AdPlacement, title: string, rewardText: string, directItemId?: string): Promise<boolean> {
    const res = await showRewardedAd({ placement, title, rewardText });
    if (!res.watched) return false;
    const p = profile();
    const { total, newlyUnlocked } = recordAdWatched(p, directItemId);
    saveProfile();
    this.syncCollectorVisuals();
    if (newlyUnlocked.length > 0) {
      const names = newlyUnlocked.map(x => x.name).join('、');
      after(0.45, () => {
        cue('reveal', 0.9);
        this.banner.show(msg`长明灯添油（${total}盏）`, msg`永久解锁：${names}`, 2.6, '#ffe278');
      });
    }
    return true;
  }
  /** Sync all A1/A2/A3 collector visuals (outfit, blade FX skin, UI skin, Cinema Ink filter) from profile */
  private syncCollectorVisuals() {
    const p = profile(), allFree = this.dbgAllWeapons;
    const wantSkin = activeUiSkin(p, allFree);
    if (SKIN.id !== wantSkin) {
      setSkin(wantSkin);
      this.hud?.reskin();
      if (this.banner) { this.banner.dispose(); this.banner = new SkinBanner(this.L, wantSkin, () => this.hud.bossOn); }
    }
    slashArc.setSkin(activeBladeFx(p, allFree));
    GRADE.cinemaInk = p.inkFilter && isCollectorUnlocked(p, 'filter_ink', allFree) ? 1 : 0;
    const wantOutfit = activeOutfitId(p, allFree);
    if (this.wearing && this.wearing.id !== wantOutfit) {
      const def = HEROES.find(d => d.id === wantOutfit);
      if (def) this.wear(def);
    }
  }
  /** 11-18: the foes' strength for region ri from the run's starting TUNE (region one: as it was) */
  private scaleFoes(ri: number) {
    const k = regionScale(ri), b = this.baseFoe;
    TUNE.enemyHp = b.hp * k.hp; TUNE.enemyDmg = b.dmg * k.dmg; TUNE.aggression = b.aggression * k.quick; TUNE.atkCalm = Math.max(0.28, b.calm + k.calm); TUNE.maxAttackers = Math.max(b.attackers, k.attackers);
  }
  /** back home: the TUNE values the run started with (the tune panel's own numbers again) */
  private unscaleFoes() { const b = this.baseFoe; if (!this.region) return; TUNE.enemyHp = b.hp; TUNE.enemyDmg = b.dmg; TUNE.atkCalm = b.calm; TUNE.maxAttackers = b.attackers; this.region = 0; }
  /** the hideout's people stand at their places (HIDEOUT anchors when the hideout scene is up; the yard's spots meanwhile) */
  private addSingleNpc(id: keyof typeof HIDEOUT_PEOPLE) {
    if (!this.stage || this.npcs.some(n => n.id === id)) return null;
    const sp = HIDEOUT.people[id];
    const a = new BattleActor(HIDEOUT_PEOPLE[id]); a.place(V3(sp.x, 0, sp.z), sp.yaw); a.yaw = sp.yaw; trimShadows(a.root, 4);
    const sh = contactShadow(); sh.scale.setScalar(id === 'fengtiebi' ? 0.55 : 0.42); sh.position.set(sp.x, 0.025, sp.z); this.stage.root.add(sh);
    const entry = { id, x: sp.x, z: sp.z, yaw: sp.yaw, a, sh };
    this.npcs.push(entry);
    return entry;
  }
  private syncHideoutNpcs() {
    if (!this.stage || this.phase !== 'yard') return;
    const want = new Set<string>(hideoutProgress(profile(), this.dbgAllWeapons).visibleNpcs);
    for (let i = this.npcs.length - 1; i >= 0; i--) {
      const n = this.npcs[i];
      if (!want.has(n.id)) {
        n.a.dispose(); n.sh.parent?.remove(n.sh);
        const mk = this.marks.get(n.id);
        if (mk) { mk.g.parent?.remove(mk.g); mk.ring.parent?.remove(mk.ring); this.marks.delete(n.id); }
        this.L.text.hide('act.beacon.' + n.id);
        this.npcs.splice(i, 1);
      }
    }
    for (const id of want) this.addSingleNpc(id as keyof typeof HIDEOUT_PEOPLE);
  }
  private *placeNpcs(spots: Array<{ id: keyof typeof HIDEOUT_PEOPLE; x: number; z: number; yaw: number }>) {
    this.clearNpcs();
    for (const sp of spots) {
      yield;
      const a = new BattleActor(HIDEOUT_PEOPLE[sp.id]); a.place(V3(sp.x, 0, sp.z), sp.yaw); a.yaw = sp.yaw; trimShadows(a.root, 4);
      const sh = contactShadow(); sh.scale.setScalar(sp.id === 'fengtiebi' ? 0.55 : 0.42); sh.position.set(sp.x, 0.025, sp.z); this.stage!.root.add(sh);
      this.npcs.push({ id: sp.id, x: sp.x, z: sp.z, yaw: sp.yaw, a, sh });
    }
  }
  private hideWorldPlates() {
    this.worldPlates?.hidePrefix('');
    this.L.text.hide('act.station.hint');
  }
  private hideHideoutLabels() {
    this.L.text.hide('act.npc');
    this.L.text.hide('act.yard.guide');
    this.L.text.hide('act.yard.exit');
    this.L.text.hide('act.station.hint');
    this.worldPlates?.hidePrefix('ho.');
    for (const id of ['fengtiebi', 'sunao', 'duwu', 'luzhao', 'huanyue', 'stele', 'weaponRack', 'keepsakeBox', 'lantern', 'trialStele']) this.L.text.hide('act.beacon.' + id);
    for (const zid of HIDEOUT_ZONE_ORDER) this.L.text.hide('act.beacon.zone_' + zid);
    for (let i = 0; i < HIDEOUT.gardenPlots.length; i++) this.L.text.hide('act.beacon.garden_' + i);
    for (const m of this.marks.values()) {
      m.exc.visible = false; m.bub.visible = false;
      (m.ring.material as THREE.MeshBasicMaterial).opacity = 0;
    }
    for (const zm of this.zoneMonuments.values()) {
      zm.exc.visible = false;
      (zm.ring.material as THREE.MeshBasicMaterial).opacity = 0;
    }
    if (this.steleExclaim) this.steleExclaim.visible = false;
    if (this.duwuMemorialExclaim) this.duwuMemorialExclaim.visible = false;
    for (const ge of this.gardenExclaims) if (ge) ge.visible = false;
  }
  private weaponRackMesh: THREE.Group | null = null;
  private keepsakeBoxMesh: THREE.Group | null = null;
  private duwuMemorialMesh: THREE.Group | null = null;
  private duwuMemorialExclaim: THREE.Group | null = null;
  private roadActors: BattleActor[] = [];
  private roadShadows: THREE.Mesh[] = [];
  private roadExtras: THREE.Object3D[] = [];
  private roadStill = new Set<BattleActor>();
  private roadDuwu: {
    ri: 0 | 1; rKey: string; actor: BattleActor; pos: THREE.Vector3;
    talked: boolean; talking: boolean; exclaim: THREE.Group | null;
  } | null = null;
  private clearRoadActors() {
    for (const a of this.roadActors) a.dispose();
    this.roadActors.length = 0;
    this.roadStill.clear();
    for (const sh of this.roadShadows) sh.parent?.remove(sh);
    this.roadShadows.length = 0;
    for (const ex of this.roadExtras) ex.parent?.remove(ex);
    this.roadExtras.length = 0;
    if (this.roadDuwu?.exclaim) this.roadDuwu.exclaim.parent?.remove(this.roadDuwu.exclaim);
    this.roadDuwu = null;
    this.roadDuwuNear = false;
  }
  private gardenMeshes: THREE.Group[] = [];
  private gardenExclaims: Array<THREE.Group | null> = [];
  private zoneMonuments = new Map<HideoutZoneId, { mesh: THREE.Group; exc: THREE.Group; ring: THREE.Mesh }>();
  private springAnims: Array<{ obj: THREE.Object3D; t: number; dur: number; delay: number; onPop?: () => void; popped: boolean }> = [];
  private gardenRefreshT = 0;
  private generalEvent: GeneralEventRunner | null = null;
  private genBlessings = new Set<GeneralBlessingId>();
  private dbgAllWeapons = false;
  private ksShield = 0;
  private ksRevenge = false;
  private intentBonusAcc = 0;
  private queueSpringPop(obj: THREE.Object3D | null | undefined, delay: number, dur = 0.44, onPop?: () => void) {
    if (!obj) return;
    obj.visible = false;
    obj.scale.set(0.01, 0.01, 0.01);
    this.springAnims.push({ obj, t: 0, dur, delay, onPop, popped: false });
  }
  private tickSpringAnims(dt: number) {
    for (let i = this.springAnims.length - 1; i >= 0; i--) {
      const a = this.springAnims[i];
      a.t += dt;
      if (a.t < a.delay) continue;
      if (!a.popped) {
        a.popped = true;
        a.obj.visible = true;
        a.onPop?.();
      }
      const k = Math.min(1, (a.t - a.delay) / a.dur);
      const sy = k < 0.68 ? (k / 0.68) * 1.15 : 1.15 - ((k - 0.68) / 0.32) * 0.15;
      const sxz = 0.25 + 0.75 * Math.min(1, k * 1.35);
      if (k >= 1) {
        a.obj.scale.set(1, 1, 1);
        this.springAnims.splice(i, 1);
      } else {
        a.obj.scale.set(sxz, Math.max(0.04, sy), sxz);
      }
    }
  }
  private burstBuildBlocks(x: number, z: number, cols: number[], count = 14) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const spd = 1.6 + Math.random() * 2.8;
      addBlock(V3(x + (Math.random() - 0.5) * 0.6, 0.35 + Math.random() * 0.5, z + (Math.random() - 0.5) * 0.6), {
        v: V3(Math.cos(a) * spd, 2.8 + Math.random() * 2.8, Math.sin(a) * spd),
        size: 0.1 + Math.random() * 0.09,
        col: cols[i % cols.length],
        life: 0.55 + Math.random() * 0.35,
        grav: 14,
        floor: 0.05,
        debris: true,
        spin: 5,
      });
    }
  }
  private clearZoneMonuments() {
    for (const zm of this.zoneMonuments.values()) {
      zm.mesh.parent?.remove(zm.mesh);
      zm.exc.parent?.remove(zm.exc);
      zm.ring.parent?.remove(zm.ring);
    }
    this.zoneMonuments.clear();
  }
  private syncHideoutSolids(prog = hideoutProgress(profile(), this.dbgAllWeapons)) {
    this.solids.clear();
    for (const so of hideoutSolids({ rackBuilt: prog.rackBuilt, forgeBuilt: prog.forgeBuilt, gardenBuilt: prog.gardenBuilt })) {
      this.solids.add({ kind: 'prop', ...so });
    }
  }
  private refreshHideoutProps() {
    if (!this.stage || this.phase !== 'yard') return;
    if (this.weaponRackMesh) { this.weaponRackMesh.parent?.remove(this.weaponRackMesh); this.weaponRackMesh = null; }
    if (this.keepsakeBoxMesh) { this.keepsakeBoxMesh.parent?.remove(this.keepsakeBoxMesh); this.keepsakeBoxMesh = null; }
    if (this.duwuMemorialMesh) { this.duwuMemorialMesh.parent?.remove(this.duwuMemorialMesh); this.duwuMemorialMesh = null; }
    if (this.duwuMemorialExclaim) { this.duwuMemorialExclaim.parent?.remove(this.duwuMemorialExclaim); this.duwuMemorialExclaim = null; }
    if (this.lanternMesh) { this.lanternMesh.parent?.remove(this.lanternMesh); this.lanternMesh = null; this.lanternTick = null; }
    if (this.decorMesh) { this.decorMesh.parent?.remove(this.decorMesh); this.decorMesh = null; this.decorTick = null; }
    if (this.trialSteleMesh) { this.trialSteleMesh.parent?.remove(this.trialSteleMesh); this.trialSteleMesh = null; }
    for (const gm of this.gardenMeshes) gm.parent?.remove(gm);
    this.gardenMeshes = [];
    this.clearZoneMonuments();
    const p = profile();
    const prog = hideoutProgress(p, this.dbgAllWeapons);
    this.syncHideoutSolids(prog);

    // act-169 D1: 古窑长明灯（中庭典藏阁入口）& A4 四件古窑 3D 装潢 & A5 西翼试锋碑
    {
      const oil = ensureAds(p).total;
      const lt = buildLanternStand(oil);
      lt.g.position.set(HIDEOUT.lantern.x, 0, HIDEOUT.lantern.z);
      this.stage.root.add(lt.g);
      this.lanternMesh = lt.g;
      this.lanternTick = lt.tick;

      const dec = buildHideoutDecor(activeHideoutDecors(p, this.dbgAllWeapons));
      this.stage.root.add(dec.g);
      this.decorMesh = dec.g;
      this.decorTick = dec.tick;

      const ts = buildTrialStele();
      ts.position.set(HIDEOUT.trialStele.x, 0, HIDEOUT.trialStele.z);
      this.stage.root.add(ts);
      this.trialSteleMesh = ts;
    }

    // act-154: when Du Wu has perished at Xiapi White Gate, his SE hearth becomes a warm memorial tended by Sun Ao (zero extra airwalls!)
    if (isDuwuDead(p)) {
      const mem = buildDuwuMemorial();
      mem.position.set(HIDEOUT.people.duwu.x, 0, HIDEOUT.people.duwu.z);
      mem.rotation.y = HIDEOUT.people.duwu.yaw;
      this.stage.root.add(mem);
      this.duwuMemorialMesh = mem;
    }

    if (prog.rackBuilt) {
      const unl: Record<WeaponId, boolean> = {
        hanshan: isWeaponUnlocked(p, 'hanshan', this.dbgAllWeapons),
        thunder: isWeaponUnlocked(p, 'thunder', this.dbgAllWeapons),
        frost: isWeaponUnlocked(p, 'frost', this.dbgAllWeapons),
        blunt: isWeaponUnlocked(p, 'blunt', this.dbgAllWeapons),
      };
      const rack = buildCourtyardWeaponRack(unl, this.currentWeaponId(p));
      rack.position.set(HIDEOUT.weaponRack.x, 0, HIDEOUT.weaponRack.z);
      rack.rotation.y = HIDEOUT.weaponRack.yaw;
      this.stage.root.add(rack);
      this.weaponRackMesh = rack;
    }

    if (prog.forgeBuilt) {
      const kbox = buildKeepsakeBoxModel(!!equippedKeepsake(p, this.dbgAllWeapons));
      kbox.position.set(HIDEOUT.keepsakeBox.x, 0, HIDEOUT.keepsakeBox.z);
      kbox.rotation.y = HIDEOUT.keepsakeBox.yaw;
      this.stage.root.add(kbox);
      this.keepsakeBoxMesh = kbox;
    }

    // act-132 / act-135: 6 pure-3D voxel garden plots appear only once 竹溪药圃 is constructed!
    if (prog.gardenBuilt) {
      const now = Date.now();
      const { state: gState } = ensureGarden(p, now);
      for (let i = 0; i < HIDEOUT.gardenPlots.length; i++) {
        const gp = HIDEOUT.gardenPlots[i];
        const m = buildGardenPlotMesh(i < gState.unlocked, gState.plots[i] ?? null, now);
        m.position.set(gp.x, 0, gp.z);
        this.stage.root.add(m);
        this.gardenMeshes.push(m);
      }
    } else {
      for (const ge of this.gardenExclaims) if (ge) ge.visible = false;
    }

    // act-135: mount 3D voxel 落成工碑 for each newly unlocked zone awaiting hand-built ceremony
    for (const zid of prog.pendingZones) {
      const zdef = HIDEOUT_ZONES[zid];
      const mesh = buildZoneMonumentModel(zid);
      mesh.position.set(zdef.monument.x, 0, zdef.monument.z);
      this.stage.root.add(mesh);
      const exc = new THREE.Group();
      exc.add(npcExclaim());
      this.stage.root.add(exc);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.76, 0.94, 4, 1, Math.PI / 4).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: zdef.hex, transparent: true, opacity: 0.45, depthWrite: false }),
      );
      ring.position.set(zdef.monument.x, 0.05, zdef.monument.z);
      ring.renderOrder = 3;
      this.stage.root.add(ring);
      this.zoneMonuments.set(zid, { mesh, exc, ring });
    }
  }
  private clearNpcs() {
    for (const n of this.npcs) { n.a.dispose(); n.sh.parent?.remove(n.sh); }
    this.npcs = []; this.npcNear = null; this.stele?.dispose(); this.stele = null;
    if (this.weaponRackMesh) { this.weaponRackMesh.parent?.remove(this.weaponRackMesh); this.weaponRackMesh = null; }
    if (this.keepsakeBoxMesh) { this.keepsakeBoxMesh.parent?.remove(this.keepsakeBoxMesh); this.keepsakeBoxMesh = null; }
    if (this.duwuMemorialMesh) { this.duwuMemorialMesh.parent?.remove(this.duwuMemorialMesh); this.duwuMemorialMesh = null; }
    if (this.duwuMemorialExclaim) { this.duwuMemorialExclaim.parent?.remove(this.duwuMemorialExclaim); this.duwuMemorialExclaim = null; }
    if (this.lanternMesh) { this.lanternMesh.parent?.remove(this.lanternMesh); this.lanternMesh = null; this.lanternTick = null; }
    if (this.decorMesh) { this.decorMesh.parent?.remove(this.decorMesh); this.decorMesh = null; this.decorTick = null; }
    if (this.trialSteleMesh) { this.trialSteleMesh.parent?.remove(this.trialSteleMesh); this.trialSteleMesh = null; }
    for (const gm of this.gardenMeshes) gm.parent?.remove(gm);
    this.gardenMeshes = [];
    for (const ge of this.gardenExclaims) ge?.parent?.remove(ge);
    this.gardenExclaims = [];
    this.clearZoneMonuments();
    this.springAnims.length = 0;
    for (const m of this.marks.values()) { m.g.parent?.remove(m.g); m.ring.parent?.remove(m.ring); }
    this.marks.clear();
    this.steleExclaim?.parent?.remove(this.steleExclaim); this.steleExclaim = null;
    this.exitGlow?.dispose(); this.exitGlow = null;
    this.hideHideoutLabels();
  }
  /** Environmental hideout guidance (guiding wind leaves.gust + combat-style golden departure gate light FX + 3D voxel ! markers) */
  private yardGustT = 1.4;
  private exitGlow: GateGlow | null = null;
  private steleExclaim: THREE.Group | null = null;
  private hideoutObjective(): { x: number; z: number; isExit: boolean } {
    const prof = profile();
    const prog = hideoutProgress(prof, this.dbgAllWeapons);
    const ex = (HIDEOUT.exit.x0 + HIDEOUT.exit.x1) / 2, ez = HIDEOUT.exit.z;
    if (prog.pendingZones.length) {
      const zdef = HIDEOUT_ZONES[prog.pendingZones[0]];
      return { x: zdef.monument.x, z: zdef.monument.z + 0.8, isExit: false };
    }
    if (prog.gardenBuilt) {
      const ripe = ripePlotIndices(prof);
      if (ripe.length) { const gp = HIDEOUT.gardenPlots[ripe[0]]; return { x: gp.x, z: gp.z + 0.8, isExit: false }; }
    }
    if (!prof.meal && prof.runs === 0) return { x: HIDEOUT.people.duwu.x, z: HIDEOUT.people.duwu.z, isExit: false };
    if (prog.forgeBuilt && (hasAffordable(prof, 'forge') || hasAnyWeaponForgeable(prof, this.dbgAllWeapons))) return { x: HIDEOUT.people.fengtiebi.x, z: HIDEOUT.people.fengtiebi.z, isExit: false };
    if (hasAffordable(prof, 'medic')) return { x: HIDEOUT.people.sunao.x, z: HIDEOUT.people.sunao.z, isExit: false };
    if (hasMirrorAffordable(prof)) return { x: HIDEOUT.stele.x, z: HIDEOUT.stele.z + 0.6, isExit: false };
    if (prog.forgeBuilt && !equippedKeepsake(prof, this.dbgAllWeapons) && KEEPSAKE_ORDER.some(id => isKeepsakeUnlocked(prof, id, this.dbgAllWeapons))) return { x: HIDEOUT.keepsakeBox.x, z: HIDEOUT.keepsakeBox.z + 0.6, isExit: false };
    if (prog.gardenBuilt && hasPlantablePlot(prof)) {
      const { state } = ensureGarden(prof);
      const emptyIdx = state.plots.findIndex((pl, i) => i < state.unlocked && !pl);
      if (emptyIdx >= 0) { const gp = HIDEOUT.gardenPlots[emptyIdx]; return { x: gp.x, z: gp.z + 0.8, isExit: false }; }
    }
    if (!prof.meal) return { x: HIDEOUT.people.duwu.x, z: HIDEOUT.people.duwu.z, isExit: false };
    return { x: ex, z: ez, isExit: true };
  }
  /** 3D voxel exclamation mark (!) above actionable NPCs & 复仇碑, clean speech bubble on idle approach, guiding wind toward active objective */
  private marks = new Map<string, { g: THREE.Group; bub: THREE.Mesh; exc: THREE.Mesh; ring: THREE.Mesh; k: number }>();
  private npcMarks(dt: number, near: string | null) {
    const t = clock.rtime, prof = profile(), h = this.hero;
    const prog = hideoutProgress(prof, this.dbgAllWeapons);
    const uiClear = !this.noTalk && !this.inCombat() && this.phase !== 'talk' && this.phase !== 'cine' && !this.dialogue.on && !this.cards.on && !this.demo.on && !this.pause.on;
    const dev = this.inp.lastDevice;
    const talkKey = dev === 'touch' ? '点右下交谈' : dev === 'pad' ? msg`[${actPad('attack')}]` : msg`[${actKey('attack')}]`;
    const roleOf: Record<string, string> = { fengtiebi: '锻刀·淬炼', sunao: '药炉悟性', duwu: '干粮', luzhao: '江湖消息', huanyue: '论刀', stele: '潜能' };
    const beaconOf = (id: string): { text: string; col: string; hex: number } | null => {
      if (id === 'fengtiebi' && (hasAffordable(prof, 'forge') || hasAnyWeaponForgeable(prof, this.dbgAllWeapons))) return { text: '可锻造', col: '#ffd868', hex: 0xffc848 };
      if (id === 'sunao' && hasArcanaActionable(prof)) return { text: '可参悟', col: '#8effb8', hex: 0x62e898 };
      if (id === 'duwu' && !prof.meal) return { text: '领干粮', col: '#ffbe78', hex: 0xffa858 };
      if (id === 'luzhao' && !isKeepsakeUnlocked(prof, 'luzhao')) return { text: '赠信物', col: '#ff9688', hex: 0xff6e64 };
      if (id === 'stele' && hasMirrorAffordable(prof)) return { text: '参悟潜能', col: '#d8c4ff', hex: 0xb896ff };
      return null;
    };
    const minY = this.banner.bottomY > 0 ? this.banner.bottomY + 8 : 10;
    // act-176: 场景悬停小标统一预算管理——走近任一可交互目标（near !== null）时自动隐藏其余环境小标；
    // 漫步时去掉冗余副标题、缩短显示半径，按优先级+距离仅展示最多 3 个，并做屏幕空间防重叠剔除！
    const ambientTags: Array<{ key: string; dist: number; prio: number; spec: TagSpec }> = [];
    const allTagKeys: string[] = [];
    const pushTag = (key: string, dist: number, prio: number, spec: TagSpec | null) => {
      allTagKeys.push(key);
      if (spec && spec.visible !== false) ambientTags.push({ key, dist, prio, spec });
    };
    for (const n of this.npcs) {
      let m = this.marks.get(n.id);
      if (!m) {
        const g = new THREE.Group(), bub = npcBubble(), exc = npcExclaim(), ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 8, 1, Math.PI / 8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xf2f4f8, transparent: true, opacity: 0, depthWrite: false }));
        ring.renderOrder = 3; exc.visible = false; g.add(bub, exc); this.stage?.root.add(g); this.stage?.root.add(ring); m = { g, bub, exc, ring, k: 0 }; this.marks.set(n.id, m);
      }
      const on = near === n.id && !this.noTalk, bc = beaconOf(n.id);
      m.k += ((on ? 1 : 0) - m.k) * Math.min(1, dt * 10);
      const top = n.a.height ?? 1.8, pulse = 0.5 + 0.5 * Math.sin(t * 4.5 + n.x);
      m.g.position.set(n.x, top + 0.52 + Math.sin(t * 2.8 + n.x) * 0.06 + 0.1 * m.k + (bc ? 0.06 * pulse : 0), n.z);
      m.g.rotation.y = bc ? t * 1.4 : Math.sin(t * 0.9 + n.z) * 0.35;
      // Distinct 3D voxel ! when NPC has an active quest/meal/upgrade; subtle white speech bubble only when idle/approached
      m.exc.visible = !!bc && uiClear;
      m.bub.visible = !bc && uiClear && (m.k > 0.05 || (h ? Math.hypot(h.pos.x - n.x, h.pos.z - n.z) < 4.5 : false));
      if (m.exc.visible) {
        m.exc.scale.setScalar(0.56 * (1 + 0.2 * m.k + 0.1 * pulse));
        const em = m.exc.material as THREE.MeshLambertMaterial;
        em.emissive.setHex(bc!.hex); em.emissiveIntensity = 0.42 + 0.32 * pulse + 0.25 * m.k;
      }
      if (m.bub.visible) {
        m.bub.scale.setScalar(0.30 * (1 + 0.42 * m.k));
        const bm = m.bub.material as THREE.MeshLambertMaterial;
        bm.emissive.setHex(0xffffff); bm.emissiveIntensity = 0.12 + 0.28 * m.k;
      }
      m.ring.position.set(n.x, 0.04, n.z); const rs = 1 + 0.08 * Math.sin(t * 5); m.ring.scale.set(rs, 1, rs);
      const rm = m.ring.material as THREE.MeshBasicMaterial;
      rm.color.setHex(bc ? bc.hex : 0xf2f4f8); rm.opacity = uiClear ? Math.max(0.7 * m.k, bc ? 0.26 + 0.18 * pulse : 0) : 0;
      const dHero = h ? Math.hypot(h.pos.x - n.x, h.pos.z - n.z) : 99;
      const npcIcon = (id: string): MiniIcon => id === 'fengtiebi' ? 'forge' : id === 'sunao' ? 'herb' : 'talk';
      const maxD = bc ? 6.2 : 4.4;
      if (uiClear && near !== n.id && dHero < maxD) {
        const p = worldToUi(V3(n.x, top + 1.04, n.z));
        const baseName = HIDEOUT_PEOPLE[n.id as keyof typeof HIDEOUT_PEOPLE]?.name ?? '';
        pushTag('ho.npc.' + n.id, dHero, bc ? 3 : 1, p.z < 1 ? {
          text: baseName, icon: npcIcon(n.id),
          x: p.x, y: p.y, color: bc ? bc.col : '#f0e6d2', accent: bc ? bc.col : '#7e6a46', minY, visible: true,
        } : null);
      } else pushTag('ho.npc.' + n.id, dHero, 0, null);
    }
    // act-135: 3D voxel 落成工碑 monuments (pulsing golden square frame + hovering 3D !)
    for (const zid of HIDEOUT_ZONE_ORDER) {
      const zm = this.zoneMonuments.get(zid);
      if (!zm) { pushTag('ho.zone_' + zid, 99, 0, null); continue; }
      const zdef = HIDEOUT_ZONES[zid], key = 'zone_' + zid;
      const pulse = 0.5 + 0.5 * Math.sin(t * 4.6 + zdef.monument.x);
      zm.exc.visible = uiClear;
      zm.exc.position.set(zdef.monument.x, 2.02 + 0.08 * pulse, zdef.monument.z);
      zm.exc.rotation.y = t * 1.5;
      const em = (zm.exc.children[0] as THREE.Mesh).material as THREE.MeshLambertMaterial;
      em.emissive.setHex(zdef.hex); em.emissiveIntensity = 0.52 + 0.36 * pulse;
      zm.exc.children[0].scale.setScalar(0.62 * (1 + 0.12 * pulse));
      const rs = 1 + 0.09 * Math.sin(t * 4.8);
      zm.ring.scale.set(rs, 1, rs);
      (zm.ring.material as THREE.MeshBasicMaterial).opacity = uiClear ? (near === key ? 0.85 : 0.34 + 0.24 * pulse) : 0;
      const dZone = h ? Math.hypot(h.pos.x - zdef.monument.x, h.pos.z - zdef.monument.z) : 99;
      if (uiClear && near !== key && dZone < 8.5) {
        const pt = worldToUi(V3(zdef.monument.x, 2.42, zdef.monument.z));
        pushTag('ho.' + key, dZone, 4, pt.z < 1 ? { text: zdef.beaconLabel, icon: 'forge', x: pt.x, y: pt.y, color: zdef.color, accent: zdef.color, minY, visible: true } : null);
      } else pushTag('ho.' + key, dZone, 0, null);
    }
    // 复仇碑 3D ! marker & proximity label
    if (this.stele && HIDEOUT.stele) {
      const bc = beaconOf('stele'), dStele = h ? Math.hypot(h.pos.x - HIDEOUT.stele.x, h.pos.z - HIDEOUT.stele.z) : 99;
      if (bc && uiClear) {
        if (!this.steleExclaim) {
          const g = new THREE.Group(), exc = npcExclaim();
          g.add(exc); this.stage?.root.add(g); this.steleExclaim = g;
        }
        const pulse = 0.5 + 0.5 * Math.sin(t * 4.5);
        this.steleExclaim.visible = true;
        this.steleExclaim.position.set(HIDEOUT.stele.x, 2.28 + 0.06 * pulse, HIDEOUT.stele.z + 0.35);
        this.steleExclaim.rotation.y = t * 1.3;
        const em = (this.steleExclaim.children[0] as THREE.Mesh).material as THREE.MeshLambertMaterial;
        em.emissive.setHex(bc.hex); em.emissiveIntensity = 0.45 + 0.3 * pulse;
        this.steleExclaim.children[0].scale.setScalar(0.56 * (1 + 0.1 * pulse));
      } else if (this.steleExclaim) this.steleExclaim.visible = false;
      if (uiClear && near !== 'stele' && dStele < (bc ? 6.0 : 4.2)) {
        const p = worldToUi(V3(HIDEOUT.stele.x, 2.08, HIDEOUT.stele.z + 0.35));
        pushTag('ho.stele', dStele, bc ? 3 : 1, p.z < 1 ? { text: '复仇碑', icon: 'stele', x: p.x, y: p.y, color: bc ? bc.col : '#dcd0f0', accent: '#9880d0', minY, visible: true } : null);
      } else pushTag('ho.stele', dStele, 0, null);
    } else {
      if (this.steleExclaim) this.steleExclaim.visible = false;
      pushTag('ho.stele', 99, 0, null);
    }
    // 文家刀廊、信物匣、古窑长明灯 & 试锋碑 proximity beacons (minimal single-line tags)
    const eqWep = weaponDef(this.currentWeaponId(prof));
    const eqKs = keepsakeDef(equippedKeepsake(prof, this.dbgAllWeapons));
    const dRack = h ? Math.hypot(h.pos.x - HIDEOUT.weaponRack.x, h.pos.z - HIDEOUT.weaponRack.z) : 99;
    if (this.weaponRackMesh && uiClear && near !== 'weaponRack' && dRack < 4.4) {
      const p = worldToUi(V3(HIDEOUT.weaponRack.x, 2.24, HIDEOUT.weaponRack.z + 0.35));
      pushTag('ho.weaponRack', dRack, 1, p.z < 1 ? { text: '文家刀廊', icon: 'blade', x: p.x, y: p.y, color: eqWep.col, accent: eqWep.col, minY, visible: true } : null);
    } else pushTag('ho.weaponRack', dRack, 0, null);
    const dBox = h ? Math.hypot(h.pos.x - HIDEOUT.keepsakeBox.x, h.pos.z - HIDEOUT.keepsakeBox.z) : 99;
    if (this.keepsakeBoxMesh && uiClear && near !== 'keepsakeBox' && dBox < 4.4) {
      const p = worldToUi(V3(HIDEOUT.keepsakeBox.x, 1.88, HIDEOUT.keepsakeBox.z + 0.35));
      pushTag('ho.keepsakeBox', dBox, 1, p.z < 1 ? { text: '信物匣', icon: 'star', x: p.x, y: p.y, color: eqKs ? eqKs.col : '#ffd898', accent: '#c89e4e', minY, visible: true } : null);
    } else pushTag('ho.keepsakeBox', dBox, 0, null);
    const dLantern = h ? Math.hypot(h.pos.x - HIDEOUT.lantern.x, h.pos.z - HIDEOUT.lantern.z) : 99;
    if (this.lanternMesh && uiClear && near !== 'lantern' && dLantern < 4.2) {
      const p = worldToUi(V3(HIDEOUT.lantern.x, 1.82, HIDEOUT.lantern.z));
      pushTag('ho.lantern', dLantern, 1, p.z < 1 ? { text: '长明灯', icon: 'fire', x: p.x, y: p.y, color: '#ffe48c', accent: '#e0a448', minY, visible: true } : null);
    } else pushTag('ho.lantern', dLantern, 0, null);
    const dTrial = h ? Math.hypot(h.pos.x - HIDEOUT.trialStele.x, h.pos.z - HIDEOUT.trialStele.z) : 99;
    if (this.trialSteleMesh && uiClear && near !== 'trialStele' && dTrial < 4.2) {
      const p = worldToUi(V3(HIDEOUT.trialStele.x, 1.82, HIDEOUT.trialStele.z));
      pushTag('ho.trialStele', dTrial, 1, p.z < 1 ? { text: '试锋碑', icon: 'boss', x: p.x, y: p.y, color: '#a8e8ff', accent: '#6cb8dc', minY, visible: true } : null);
    } else pushTag('ho.trialStele', dTrial, 0, null);

    // act-132 / act-135 / act-143 / act-176: Bamboo Stream Garden Terrace — icon + countdown / 可收 only, budgeted & de-overlapped
    const nowMs = Date.now();
    let gState: ReturnType<typeof ensureGarden>['state'] | null = null;
    let seedBag = 0;
    if (prog.gardenBuilt && this.gardenMeshes.length > 0) {
      gState = ensureGarden(prof, nowMs).state;
      seedBag = totalSeeds(prof);
      this.gardenRefreshT += dt;
      if (this.gardenRefreshT >= 15) { this.gardenRefreshT = 0; this.refreshHideoutProps(); }
      for (let i = 0; i < HIDEOUT.gardenPlots.length; i++) {
        const gp = HIDEOUT.gardenPlots[i], unl = i < gState.unlocked, plot = unl ? gState.plots[i] : null;
        const st = plotStatus(plot, nowMs), key = 'garden_' + i;
        const showExc = uiClear && unl && (st.done || (!plot && seedBag > 0));
        if (showExc) {
          if (!this.gardenExclaims[i] && this.stage) {
            const g = new THREE.Group(), exc = npcExclaim();
            g.add(exc); this.stage.root.add(g); this.gardenExclaims[i] = g;
          }
          const ge = this.gardenExclaims[i];
          if (ge) {
            const pulse = 0.5 + 0.5 * Math.sin(t * 4.2 + i);
            ge.visible = true;
            ge.position.set(gp.x, (st.done ? 1.55 : 1.25) + 0.06 * pulse, gp.z);
            ge.rotation.y = t * 1.4;
            const em = (ge.children[0] as THREE.Mesh).material as THREE.MeshLambertMaterial;
            em.emissive.setHex(st.done ? 0xffd258 : 0x72e894);
            em.emissiveIntensity = 0.45 + 0.3 * pulse;
            ge.children[0].scale.setScalar((st.done ? 0.56 : 0.44) * (1 + 0.1 * pulse));
          }
        } else if (this.gardenExclaims[i]) this.gardenExclaims[i]!.visible = false;

        const dPlot = h ? Math.hypot(h.pos.x - gp.x, h.pos.z - gp.z) : 99;
        // act-170 / act-176: 种田头顶仅留「图标 + 倒计时 / 可收」，空地荒畦不刷文字，走近才出交互牌
        const showGardenTag = uiClear && near !== key && unl && !!plot && (st.done ? dPlot < 6.2 : dPlot < 4.4);
        if (showGardenTag) {
          const pt = worldToUi(V3(gp.x, 1.48, gp.z));
          const def = SEEDS[plot!.seed];
          const txt = st.done ? '可收' : msg`${st.leftSteps}屋·${st.leftMins}分`;
          const col = st.done ? '#ffe680' : def.hex;
          pushTag('ho.' + key, dPlot, st.done ? 3 : 1, pt.z < 1 ? { text: txt, icon: 'leaf', x: pt.x, y: pt.y, color: col, accent: st.done ? '#ffd258' : def.hex, minY, scale: 0.92, visible: true } : null);
        } else pushTag('ho.' + key, dPlot, 0, null);
      }
    } else {
      for (let i = 0; i < HIDEOUT.gardenPlots.length; i++) {
        pushTag('ho.garden_' + i, 99, 0, null);
        if (this.gardenExclaims[i]) this.gardenExclaims[i]!.visible = false;
      }
    }

    // act-154: Du Wu's hearthside memorial beacon & floating tag (100% seamless handover of meal rations)
    if (this.duwuMemorialMesh) {
      const mx = HIDEOUT.people.duwu.x, mz = HIDEOUT.people.duwu.z;
      const dMem = h ? Math.hypot(h.pos.x - mx, h.pos.z - mz) : 99;
      const showExc = uiClear && !prof.meal;
      if (showExc) {
        if (!this.duwuMemorialExclaim && this.stage) {
          const g = new THREE.Group(), exc = npcExclaim();
          g.add(exc); this.stage.root.add(g); this.duwuMemorialExclaim = g;
        }
        const de = this.duwuMemorialExclaim;
        if (de) {
          const pulse = 0.5 + 0.5 * Math.sin(t * 4.4);
          de.visible = true;
          de.position.set(mx, 2.05 + 0.06 * pulse, mz);
          de.rotation.y = t * 1.4;
          const em = (de.children[0] as THREE.Mesh).material as THREE.MeshLambertMaterial;
          em.emissive.setHex(0xffa858); em.emissiveIntensity = 0.45 + 0.3 * pulse;
          de.children[0].scale.setScalar(0.56 * (1 + 0.1 * pulse));
        }
      } else if (this.duwuMemorialExclaim) this.duwuMemorialExclaim.visible = false;
      if (uiClear && near !== 'duwu_memorial' && dMem < (!prof.meal ? 6.2 : 4.4)) {
        const pt = worldToUi(V3(mx, 1.9, mz));
        pushTag('ho.duwuMemorial', dMem, !prof.meal ? 3 : 1, pt.z < 1 ? { text: '杜五的遗灶', icon: 'herb', x: pt.x, y: pt.y, color: !prof.meal ? '#ffbe78' : '#dfd4be', accent: '#c8964e', minY, visible: true } : null);
      } else pushTag('ho.duwuMemorial', dMem, 0, null);
    } else {
      pushTag('ho.duwuMemorial', 99, 0, null);
      if (this.duwuMemorialExclaim) this.duwuMemorialExclaim.visible = false;
    }

    // Active nearest interactive plaque (crisp dark-iron plaque + keycap/gamepad glyph)
    const nn = near ? this.npcs.find(x => x.id === near) : null;
    if (near && near.startsWith('zone_') && uiClear) {
      const zdef = HIDEOUT_ZONES[near.slice(5) as HideoutZoneId];
      if (zdef) {
        const pt = worldToUi(V3(zdef.monument.x, 2.48, zdef.monument.z));
        this.worldPlates.setInteract('ho.active', { title: zdef.beaconLabel, sub: zdef.actionLabel, action: '落成启建', icon: 'forge', color: zdef.color, accent: zdef.color, x: pt.x, y: pt.y, minY, visible: pt.z < 1 });
      }
    } else if (near && near.startsWith('garden_') && uiClear && gState) {
      const idx = Number(near.slice(7)), gp = HIDEOUT.gardenPlots[idx];
      const unl = idx < gState.unlocked, plot = unl ? gState.plots[idx] : null, st = plotStatus(plot, nowMs);
      const pt = worldToUi(V3(gp.x, 1.75, gp.z));
      if (!unl) {
        const c = PLOT_COSTS[idx];
        const costSub = c ? (c.cur === 'herb' ? msg`药引 ${c.n}` : msg`残铁 ${c.n}`) : undefined;
        this.worldPlates.setInteract('ho.active', { title: msg`荒畦 ${idx + 1}`, sub: costSub, action: '开垦', icon: 'leaf', color: '#ffe090', accent: '#c8a050', x: pt.x, y: pt.y, minY, visible: pt.z < 1 });
      } else if (plot) {
        const def = SEEDS[plot.seed];
        this.worldPlates.setInteract('ho.active', {
          title: def.name,
          sub: st.done ? undefined : msg`${st.leftSteps}屋 · ${st.leftMins}分`,
          action: st.done ? '采收' : '查看',
          icon: 'leaf', color: st.done ? '#ffe878' : def.hex, accent: st.done ? '#ffd258' : '#5ca874',
          x: pt.x, y: pt.y, minY, visible: pt.z < 1,
        });
      } else {
        this.worldPlates.setInteract('ho.active', {
          title: '药畦', sub: msg`余种 ${seedBag}`,
          action: seedBag > 0 ? '播种' : '查看', icon: 'leaf', color: '#8effb0', accent: '#64c884',
          x: pt.x, y: pt.y, minY, visible: pt.z < 1,
        });
      }
    } else if (near === 'weaponRack' && uiClear) {
      const p = worldToUi(V3(HIDEOUT.weaponRack.x, 2.38, HIDEOUT.weaponRack.z + 0.35));
      this.worldPlates.setInteract('ho.active', { title: '文家刀廊', sub: eqWep.name, action: '换刀', icon: 'blade', color: '#ffe698', accent: eqWep.col, x: p.x, y: p.y, minY, visible: p.z < 1 });
    } else if (near === 'keepsakeBox' && uiClear) {
      const p = worldToUi(V3(HIDEOUT.keepsakeBox.x, 2.02, HIDEOUT.keepsakeBox.z + 0.35));
      this.worldPlates.setInteract('ho.active', { title: '信物匣', sub: eqKs ? eqKs.name : '未佩', action: '选佩', icon: 'star', color: '#8effd0', accent: '#d4a652', x: p.x, y: p.y, minY, visible: p.z < 1 });
    } else if (near === 'lantern' && uiClear) {
      const p = worldToUi(V3(HIDEOUT.lantern.x, 2.02, HIDEOUT.lantern.z));
      const oil = ensureAds(prof).total;
      this.worldPlates.setInteract('ho.active', { title: '古窑长明灯', sub: msg`已添灯油 ${oil} 盏 · 典藏外观与名录`, action: '打开典藏阁', icon: 'fire', color: '#ffe48c', accent: '#e0a448', x: p.x, y: p.y, minY, visible: p.z < 1 });
    } else if (near === 'trialStele' && uiClear) {
      const p = worldToUi(V3(HIDEOUT.trialStele.x, 2.02, HIDEOUT.trialStele.z));
      const unl = isCollectorUnlocked(prof, 'archive_sandbox', this.dbgAllWeapons);
      this.worldPlates.setInteract('ho.active', { title: '试锋碑', sub: unl ? '约战五关首领 · 自由配招练剑' : '典藏解锁 · 首领约战与自由配招', action: unl ? '开启试剑' : '查看解锁', icon: 'boss', color: '#a8e8ff', accent: '#6cb8dc', x: p.x, y: p.y, minY, visible: p.z < 1 });
    } else if (near === 'duwu_memorial' && uiClear) {
      const p = worldToUi(V3(HIDEOUT.people.duwu.x, 2.05, HIDEOUT.people.duwu.z));
      this.worldPlates.setInteract('ho.active', {
        title: '杜五的遗灶', sub: !prof.meal ? '可领干粮' : '已备齐', action: '领干粮',
        icon: 'herb', color: '#ffbe78', accent: '#d4964c', x: p.x, y: p.y, minY, visible: p.z < 1,
      });
    } else if (near === 'stele' && uiClear && HIDEOUT.stele) {
      const p = worldToUi(V3(HIDEOUT.stele.x, 2.18, HIDEOUT.stele.z + 0.35));
      this.worldPlates.setInteract('ho.active', { title: '复仇碑', sub: '阳 / 阴潜能', action: '参悟', icon: 'stele', color: '#e2d0ff', accent: '#a88cf0', x: p.x, y: p.y, minY, visible: p.z < 1 });
    } else if (nn && uiClear) {
      const p = worldToUi(V3(nn.x, (nn.a.height ?? 1.8) + 1.18, nn.z));
      const bc = beaconOf(nn.id);
      const baseName = HIDEOUT_PEOPLE[nn.id as keyof typeof HIDEOUT_PEOPLE]?.name ?? '';
      const role = bc ? bc.text : (roleOf[nn.id] ?? '');
      const ico: MiniIcon = nn.id === 'fengtiebi' ? 'forge' : nn.id === 'sunao' ? 'herb' : 'talk';
      this.worldPlates.setInteract('ho.active', {
        title: baseName, sub: role || undefined, action: nn.id === 'fengtiebi' ? '锻造淬炼' : nn.id === 'sunao' ? '冥想悟性' : nn.id === 'duwu' ? '领取干粮' : '交谈',
        icon: ico, color: bc ? bc.col : '#ffe6b0', accent: bc ? bc.col : '#c89a4c', x: p.x, y: p.y, minY, visible: p.z < 1,
      });
    } else this.worldPlates.hide('ho.active');
    void talkKey;
    // Environmental Ghost-of-Tsushima guiding wind (leaves.gust) toward the active hideout objective — zero crude arrows or top bars!
    this.L.text.hide('act.yard.guide');
    this.L.text.hide('act.yard.exit');
    if (this.phase === 'yard' && uiClear && h) {
      const obj = this.hideoutObjective();
      const dx = obj.x - h.pos.x, dz = obj.z - h.pos.z, dist = Math.hypot(dx, dz);
      if (dist > 2.6 && this.leaves) {
        this.yardGustT -= dt;
        if (this.yardGustT <= 0) {
          this.yardGustT = 3.4;
          this.leaves.gust(h.pos.x, h.pos.z, obj.x, obj.z);
          cue('exitChime', 0.16);
        }
      }
      // act-128 / act-132: combat-gate golden light curtain, expanding ripples, and floor light spill right at the far end of the departure road!
      const ex = (HIDEOUT.exit.x0 + HIDEOUT.exit.x1) / 2, ez = HIDEOUT.exit.z + 0.2;
      if (!this.exitGlow && this.stage) {
        this.exitGlow = new GateGlow(this.stage.root, V3(ex, 0, ez), 2.55, V3(0, 0, -1), { radius: 4.8, spillLen: 3.8, height: 2.4 });
      }
      this.exitGlow?.update(dt, obj.isExit ? 1.0 : 0.72);
      const dExit = Math.hypot(ex - h.pos.x, ez - h.pos.z);
      const gp = worldToUi(V3(ex, 2.48, ez));
      pushTag('ho.exit', dExit, obj.isExit ? 2 : 1, (gp.z < 1 && (obj.isExit || dExit < 6.2))
        ? { text: '出发', icon: 'door', x: gp.x, y: gp.y, color: '#ffe898', accent: '#d8a64e', minY, visible: true }
        : null);
    } else {
      pushTag('ho.exit', 99, 0, null);
    }

    // act-176: Apply ambient tag budget (Focus Suppression + Top-3 + Screen-space De-overlap)
    const shownKeys = new Set<string>();
    if (uiClear && !near && ambientTags.length > 0) {
      const kk = Math.max(0.75, Math.min(2.2, Math.min(this.L.w / 1280, this.L.h / 720)));
      const padX = 108 * kk, padY = 38 * kk;
      ambientTags.sort((a, b) => (b.prio - a.prio) || (a.dist - b.dist));
      const placed: Array<{ x: number; y: number }> = [];
      for (const item of ambientTags) {
        if (placed.length >= 3) break;
        const { x, y } = item.spec;
        if (placed.some(p => Math.abs(x - p.x) < padX && Math.abs(y - p.y) < padY)) continue;
        this.worldPlates.setTag(item.key, item.spec);
        placed.push({ x, y });
        shownKeys.add(item.key);
      }
    }
    for (const k of allTagKeys) {
      if (!shownKeys.has(k)) this.worldPlates.hide(k);
    }
  }
  /** act-135: Hand-built new-zone construction ceremony (3D voxel pop-in + camera pan + debris/sparks + SFX + NPC greeting) */
  private async buildHideoutZone(zone: HideoutZoneId) {
    if (this.phase !== 'yard' || this.noTalk) return;
    const zdef = HIDEOUT_ZONES[zone];
    this.noTalk = true;
    this.hideHideoutLabels();
    this.banner.hide();
    // 1) Shatter the 3D 落成工碑 into voxel wood/stone/gold chunks with a crisp flare
    const mx = zdef.monument.x, mz = zdef.monument.z;
    this.burstBuildBlocks(mx, mz, [0x767168, 0x644832, 0xdca840, zdef.hex], 18);
    fxFlare(V3(mx, 1.1, mz), zdef.hex, 2.4, 0.55);
    fxRing(V3(mx, 0.08, mz), zdef.hex, 2.8, { life: 0.65, width: 0.09 });
    fxSmoke(V3(mx, 0.45, mz), 0xb0a48e, 14, { r: 0.9, spd: 1.4, up: 1.0, s: 0.48, life: 0.75 });
    cue('parry', 0.9);
    shake(0.22 * TUNE.shake);

    // 2) Persist construction state & pan camera smoothly to frame the newly built wing
    seeOnce(zdef.flag);
    const p = profile();
    if (zone === 'garden') ensureGarden(p);
    saveProfile();
    this.camOverride = {
      base: V3(...zdef.camBase),
      look: V3(...zdef.camLook),
      fov: zdef.camFov,
    };

    // 3) Spawn the newly constructed 3D structures & arriving NPC with elastic 3D voxel spring-rise!
    this.refreshHideoutProps();
    this.syncHideoutNpcs();

    const arriving = this.npcs.find(n => n.id === zdef.npc);
    if (zone === 'forge') {
      this.queueSpringPop(arriving?.a.root, 0.16, 0.46, () => {
        const sp = HIDEOUT.people.fengtiebi;
        this.burstBuildBlocks(sp.x, sp.z, [0xff8c2c, 0x767168, 0xffd268], 16);
        fxEmbers(V3(sp.x, 0.8, sp.z), 0xff8c2c, 22, { r: 1.1, up: 2.2, life: 1.0 });
        fxSmoke(V3(sp.x, 0.4, sp.z), 0x686058, 16, { r: 1.0, spd: 1.3, up: 1.1, s: 0.5, life: 0.85 });
        fxRing(V3(sp.x, 0.08, sp.z), 0xffb840, 2.6, { life: 0.7, width: 0.08 });
        cue('bladeRing', 0.95);
        shake(0.24 * TUNE.shake);
      });
      this.queueSpringPop(this.keepsakeBoxMesh, 0.52, 0.44, () => {
        const kb = HIDEOUT.keepsakeBox;
        this.burstBuildBlocks(kb.x, kb.z, [0x4a241c, 0xdca840, 0xffe278], 12);
        fxFlare(V3(kb.x, 0.9, kb.z), 0xffd868, 2.0, 0.5);
        fxRing(V3(kb.x, 0.08, kb.z), 0x8effd0, 2.2, { life: 0.65, width: 0.07 });
        cue('reveal', 0.9);
      });
    } else if (zone === 'garden') {
      for (let i = 0; i < this.gardenMeshes.length; i++) {
        const gp = HIDEOUT.gardenPlots[i];
        const isLast = i === this.gardenMeshes.length - 1;
        this.queueSpringPop(this.gardenMeshes[i], 0.12 + i * 0.14, 0.36, () => {
          this.burstBuildBlocks(gp.x, gp.z, [0x463526, 0x6a5038, 0x62b858], 10);
          fxSmoke(V3(gp.x, 0.3, gp.z), 0x6a7852, 8, { r: 0.8, spd: 1.0, up: 0.75, s: 0.42, life: 0.65 });
          fxRing(V3(gp.x, 0.08, gp.z), 0x72e894, 1.8, { life: 0.55, width: 0.06 });
          cue(isLast ? 'reveal' : 'clack', isLast ? 0.95 : 0.78);
          if (isLast) shake(0.18 * TUNE.shake);
        });
      }
      this.queueSpringPop(arriving?.a.root, 1.02, 0.44, () => {
        const sp = HIDEOUT.people.luzhao;
        this.burstBuildBlocks(sp.x, sp.z, [0x72e894, 0xd8d0c0, 0x6a9054], 12);
        fxFlare(V3(sp.x, 1.0, sp.z), 0x8effb0, 2.1, 0.55);
        fxRing(V3(sp.x, 0.08, sp.z), 0x8effb0, 2.2, { life: 0.65, width: 0.07 });
        cue('reveal', 0.85);
      });
      this.feed.push('boon', () => '孙媪赠予初种 · 东桥药圃可栽', 0, 'gd:starter');
    } else {
      this.queueSpringPop(this.weaponRackMesh, 0.16, 0.48, () => {
        const wr = HIDEOUT.weaponRack;
        this.burstBuildBlocks(wr.x, wr.z, [0x644832, 0xdca840, 0xe4ecf8], 18);
        fxFlare(V3(wr.x, 1.1, wr.z), 0xffe698, 2.6, 0.6);
        fxSparks(V3(wr.x, 1.1, wr.z), 0xffe890, 20, 5.5);
        fxRing(V3(wr.x, 0.08, wr.z), 0xffd258, 3.0, { life: 0.75, width: 0.09 });
        cue('draw', 0.95);
        cue('bladeRing', 0.95);
        shake(0.26 * TUNE.shake);
      });
      this.queueSpringPop(arriving?.a.root, 0.58, 0.46, () => {
        const sp = HIDEOUT.people.huanyue;
        this.burstBuildBlocks(sp.x, sp.z, [0x948e84, 0xdca840, 0xb87048], 12);
        fxSmoke(V3(sp.x, 0.45, sp.z), 0xb8b0a0, 12, { r: 0.85, spd: 1.2, up: 0.9, s: 0.45, life: 0.75 });
        fxRing(V3(sp.x, 0.08, sp.z), 0xffe698, 2.2, { life: 0.65, width: 0.07 });
        cue('reveal', 0.88);
      });
    }

    this.banner.show(zdef.bannerTitle, zdef.bannerSub, 2.9, zdef.color);
    await new Promise(r => after(zone === 'garden' ? 2.15 : 1.75, () => r(null)));
    this.camOverride = null;
    await new Promise(r => after(0.45, () => r(null)));
    this.noTalk = false;
    if (this.phase === 'yard') {
      await this.talk([{ who: zdef.npc, text: zdef.npcLine }]);
    }
  }
  /** Grant a hideout/general keepsake on first unlock with banner + toast */
  private grantKeepsake(id: KeepsakeId) {
    const p = profile();
    if (!unlockKeepsake(p, id)) return false;
    saveProfile();
    const ks = KEEPSAKES[id];
    cue('reveal', 0.9);
    this.banner.show(msg`获得信物 · ${ks.name}`, msg`可回古窑信物匣佩戴 · ${ks.owner}所赠`, 2.2, ks.col);
    this.feed.push('boon', () => msg`信物 · ${ks.name}`, 0, 'ks:' + id);
    this.refreshHideoutProps();
    return true;
  }
  /** a word with someone at the hideout; 落成工碑 builds a new wing, 文家刀廊 swaps blades, 信物匣 equips keepsakes, 复仇碑 opens 碑铭潜能, 竹溪药圃 plants/harvests */
  private async npcTalk(id: string) {
    if (id.startsWith('zone_')) { await this.buildHideoutZone(id.slice(5) as HideoutZoneId); return; }
    if (id.startsWith('garden_')) { await this.gardenInteract(Number(id.slice(7))); return; }
    if (id === 'weaponRack') { await this.weaponRackMenu(); return; }
    if (id === 'keepsakeBox') { await this.keepsakeMenu(); return; }
    if (id === 'stele') { await this.steleMenu(); return; }
    if (id === 'lantern') { await this.lanternMenu(); return; }
    if (id === 'trialStele') { await this.trialSandboxMenu(); return; }
    if (id === 'duwu' || id === 'duwu_memorial') { await this.mealMenu(); this.grantKeepsake('duwu'); return; }
    if (id === 'luzhao') {
      await this.talk([{ who: 'luzhao', text: '文家三十柄刀散落五地，每夺回一柄，北台刀廊便多一分锋芒。' }]);
      this.grantKeepsake('luzhao');
      await this.divineOrArchiveMenu('luzhao');
      return;
    }
    if (id === 'huanyue') {
      const lines = [
        '石阶上喝一口山泉酿，倒比洛阳城里的酒痛快。刀换了手，就去西边大试剑坪先劈两下听听响。',
        '快刀重势、重刀破阵、断刃听声——哪一柄顺手，全看你自己。',
      ];
      await this.talk([{ who: 'huanyue', text: lines[Math.floor(Math.random() * lines.length)] }]);
      await this.divineMenu('huanyue');
      return;
    }
    const pool = NPC_TALK[id] ?? []; if (pool.length) await this.talk([{ who: id, text: pool[Math.floor(Math.random() * pool.length)] }]);
    if (id === 'fengtiebi') {
      await this.forgeHubMenu();
      this.grantKeepsake('fengtiebi');
    } else if (id === 'sunao') {
      await this.upgradeMenu('medic');
      this.grantKeepsake('sunao');
    }
  }
  /** act-125 / act-149 / act-169 B1: 文家刀廊 — 4 upright lacquered blade stands with REAL spinning 3D blades + 借刃一试 */
  private async weaponRackMenu() {
    let focusIdx = Math.max(0, WEAPON_ORDER.indexOf(this.currentWeaponId(profile())));
    let instant = false;
    for (;;) {
      const p = profile(), cur = this.currentWeaponId(p), rented = p.ads?.rentWeapon as WeaponId | null | undefined;
      const cards: BoonPick[] = WEAPON_ORDER.map(id => {
        const w = WEAPONS[id], unl = isWeaponUnlocked(p, id, this.dbgAllWeapons), lv = weaponLevel(p, id);
        const eq = cur === id, isRent = !unl && rented === id;
        return {
          boon: {
            id: 'wep_' + id, school: 'fg' as never, name: w.name,
            desc: [w.summary, w.special], col: unl || isRent ? w.col : '#c8b48a', glyph: w.glyph,
            locked: false,
            wepInfo: { id, name: w.name, lv: isRent ? 0 : lv, unlocked: unl || isRent, equipped: eq },
          } as CardBoon,
          tier: eq ? 2 : unl || isRent ? 1 : 0,
        };
      });
      const was = this.phase; this.phase = 'pick'; this.hud.on = false; this.banner.hide(); this.hideHideoutLabels();
      const i = await this.cards.open(cards, {
        leave: true, layout: 'weapons', instant, initialFocus: focusIdx,
        header: { title: '文家刀廊', col: '#ffe290', accent: '#c89248' },
        detail: idx => {
          const wid = WEAPON_ORDER[idx], w = WEAPONS[wid];
          const unl = isWeaponUnlocked(p, wid, this.dbgAllWeapons), lv = weaponLevel(p, wid);
          const eq = cur === wid, isRent = !unl && rented === wid;
          return {
            title: msg`${w.name} · ${w.title}`,
            badge: isRent ? '借试中' : !unl ? '观影借试' : eq ? '佩带中' : '已入手',
            badgeCol: isRent ? '#ffe278' : !unl ? '#e6c88a' : eq ? '#ffe278' : '#88e8b8',
            stars: unl ? lv : 0,
            starsMax: 3,
            line1: unl ? w.summary : isRent ? msg`已借试一局 · ${w.summary}` : msg`${w.unlockHint} · 观影可借试下一局`,
            line2: msg`${w.special} · 专属刀谱：${manualsForWeapon(wid).map(m => m.name).join('/')}`,
            action: isRent ? '借试中' : !unl ? '借刃一试（观影）' : eq ? '当前佩刀' : '换刀',
            accent: isRent ? '#ffd872' : !unl ? '#c8a25e' : eq ? '#ffd872' : w.col,
          };
        },
        footer: '确认换刀或观影借试 · Esc 返回',
      });
      this.phase = was; this.hud.on = true;
      if (i < 0 || i >= WEAPON_ORDER.length) return;
      focusIdx = i; instant = true;
      const wid = WEAPON_ORDER[i], w = WEAPONS[wid];
      if (!isWeaponUnlocked(p, wid, this.dbgAllWeapons)) {
        if (rented === wid) {
          this.banner.show(msg`借试中 · ${w.name}`, '本局出征即携此刃上路', 1.4, w.col);
          return;
        }
        const ok = await this.watchAd('weapon_rent', msg`文家刀廊 · 借试${w.name}`, msg`向冯铁臂借试「${w.name}」征战下一局（不替代永久夺回）`);
        if (!ok) continue;
        ensureAds(p).rentWeapon = wid;
        saveProfile();
        this.hero?.applyWeapon(wid, 0);
        this.refreshHideoutProps();
        cue('draw', 0.9); cue('bladeRing', 0.85);
        this.banner.show(msg`借刃一试 · ${w.name}`, '已暂佩一局，去试剑坪或出征试试锋芒', 2.0, w.col);
        return;
      }
      if (p.ads) p.ads.rentWeapon = null;
      if (cur === wid && !rented) continue;
      equipWeapon(p, wid, this.dbgAllWeapons); saveProfile();
      this.hero?.applyWeapon(wid, weaponLevel(p, wid));
      this.refreshHideoutProps();
      cue('draw', 0.9); cue('bladeRing', 0.85);
    }
  }
  /** act-132: 竹溪梯田药圃交互 — 成熟一键收获 / 空地选种播种 / 荒地开垦 / 生长中查看双轨进度 */
  private async gardenInteract(idx: number) {
    const p = profile(), now = Date.now(), { state } = ensureGarden(p, now);
    const gp = HIDEOUT.gardenPlots[idx];
    if (!gp) return;
    if (!isPlotUnlocked(p, idx)) {
      const cost = PLOT_COSTS[idx];
      if (!cost || idx !== state.unlocked) {
        cue('click', 0.5);
        this.banner.show('荒地药畦', '请按顺序先开垦前一块药畦', 1.4, '#d8c8a8');
        return;
      }
      const curName = cost.cur === 'herb' ? '药引' : '残铁';
      const afford = canUnlockPlot(p, idx);
      const was = this.phase; this.phase = 'pick'; this.hud.on = false; this.banner.hide(); this.hideHideoutLabels();
      const ch = await this.cards.open([
        {
          boon: {
            id: 'gd_unlock', school: 'md' as never,
            name: msg`荒畦 ${idx + 1}`,
            desc: [msg`${curName} ${cost.n}`, afford ? '解锁药畦 +1' : msg`${curName}不足`],
            col: afford ? '#8effb0' : '#8a8278', glyph: SPROUT,
            tag: afford ? msg`${cost.n}${curName}` : '不足',
            locked: !afford,
          } as CardBoon,
          tier: afford ? 2 : 0,
        },
      ], {
        leave: true,
        header: { title: '开垦药畦', col: '#90f0a8' },
        wallet: { iron: p.iron, herb: p.herb, focus: cost.cur },
        footer: '确认开垦 · Esc 返回',
      });
      this.phase = was; this.hud.on = true;
      if (ch === 0 && unlockPlot(p, idx)) {
        saveProfile();
        this.refreshHideoutProps();
        fxSmoke(V3(gp.x, 0.35, gp.z), 0x8a785c, 12, { r: 0.9, spd: 1.2, up: 0.7, s: 0.45, life: 0.8 });
        cue('reveal', 0.85);
        this.banner.show('药畦已开垦', '', 1.2, '#8effb0');
      }
      return;
    }

    const plot = state.plots[idx];
    if (plot) {
      const st = plotStatus(plot, now);
      const def = SEEDS[plot.seed];
      if (st.done) {
        // act-169: 成熟采收提供「直接采收」与「添油丰收 · 观影双倍收成」
        const baseDesc = [def.herb > 0 ? msg`药引 +${def.herb}` : '', def.iron > 0 ? msg`残铁 +${def.iron}` : '', def.buffName ? msg`赠「${def.buffName}」` : ''].filter(Boolean).join(' · ');
        const dblDesc = [def.herb > 0 ? msg`药引 +${def.herb * 2}` : '', def.iron > 0 ? msg`残铁 +${def.iron * 2}` : '', msg`另回赠${def.name}种×1`].filter(Boolean).join(' · ');
        const was = this.phase; this.phase = 'pick'; this.hud.on = false; this.banner.hide(); this.hideHideoutLabels();
        const pick = await this.cards.open([
          {
            boon: {
              id: 'gd_harv_1', school: 'md' as never,
              name: msg`直接采收 · ${def.name}`,
              desc: [baseDesc, '不观影直接收入行囊'],
              col: def.hex, glyph: SPROUT, tag: '直接采收',
            } as CardBoon,
            tier: 1,
          },
          {
            boon: {
              id: 'gd_harv_2', school: 'fg' as never,
              name: msg`添油丰收 · 双倍${def.name}`,
              desc: [dblDesc, '观影一则即享双倍收成，并计入长明灯灯油'],
              col: '#ffe478', glyph: SPROUT, tag: '观影双倍',
            } as CardBoon,
            tier: 2,
          },
        ], {
          leave: true,
          header: { title: msg`竹溪药圃 · ${def.name}已熟`, sub: '可直接采收，或观影添油享双倍丰收', col: '#ffe478' },
          wallet: { iron: p.iron, herb: p.herb },
          footer: '点选采收方式 · Esc 返回',
        });
        this.phase = was; this.hud.on = true;
        if (pick < 0) return;
        let dbl = false;
        if (pick === 1) {
          const ok = await this.watchAd('garden_double', msg`竹溪药圃 · 丰收翻倍`, msg`${def.name} 双倍收成并回赠 1 枚同种灵种`);
          if (!ok) return;
          dbl = true;
        }
        const res = harvestPlot(p, idx, now, dbl);
        if (res) {
          saveProfile();
          this.refreshHideoutProps();
          fxFlare(V3(gp.x, 0.85, gp.z), res.seed.col, dbl ? 2.8 : 2.2, 0.6);
          fxEmbers(V3(gp.x, 0.6, gp.z), res.seed.col, dbl ? 24 : 16, { r: 0.9, up: 1.9, life: 0.95 });
          fxRing(V3(gp.x, 0.08, gp.z), res.seed.col, 2.5, { life: 0.75, width: 0.07 });
          cue('coin', 1);
          const parts: string[] = [];
          if (res.herb > 0) parts.push(msg`药引 +${res.herb}`);
          if (res.iron > 0) parts.push(msg`残铁 +${res.iron}`);
          if (res.bonusSeed) parts.push(msg`赠种×1`);
          if (res.buff && res.seed.buffName) parts.push(msg`下局「${res.seed.buffName}」`);
          this.banner.show(msg`${dbl ? '双倍丰收' : '收获'} · ${res.seed.name}`, parts.join(' · '), 2.4, dbl ? '#ffe478' : res.seed.hex);
        }
        return;
      }
      // B2: 生长中作物提供「引溪活水 · 观影立刻催熟」（每日限 3 次）
      const leftDaily = gardenSpeedLeft(p, now);
      const was = this.phase; this.phase = 'pick'; this.hud.on = false; this.banner.hide(); this.hideHideoutLabels();
      const ch = await this.cards.open([
        {
          boon: {
            id: 'gd_wait', school: 'md' as never,
            name: msg`${def.name} · 生长中`,
            desc: [msg`还差 ${st.leftSteps} 间战斗屋，或静候 ${st.leftMins} 分钟自然成熟`, '离开继续历练'],
            col: def.hex, glyph: SPROUT, tag: msg`${st.stepsDone}/${st.stepsTotal}`,
          } as CardBoon,
          tier: 0,
        },
        {
          boon: {
            id: 'gd_speed', school: 'fg' as never,
            name: '引溪活水 · 立刻催熟',
            desc: [leftDaily > 0 ? msg`观影一则引竹溪活水浇灌，立刻催熟此畦（今日剩 ${leftDaily}/${GARDEN_SPEED_DAILY_MAX} 次）` : '今日引溪次数已用尽，明日再来', '催熟后即可立刻采收'],
            col: leftDaily > 0 ? '#8effd8' : '#7e7872', glyph: SPROUT,
            tag: leftDaily > 0 ? msg`观影 · 剩${leftDaily}次` : '今日已满',
            locked: leftDaily <= 0,
          } as CardBoon,
          tier: leftDaily > 0 ? 2 : 0,
        },
      ], {
        leave: true,
        header: { title: msg`竹溪药圃 · ${def.name}`, sub: '战斗通关与离线皆可自然生长，亦可引溪活水催熟', col: def.hex },
        footer: '点选引溪催熟或静候 · Esc 返回',
      });
      this.phase = was; this.hud.on = true;
      if (ch === 1 && leftDaily > 0) {
        const ok = await this.watchAd('garden_speed', '竹溪药圃 · 引溪催熟', msg`引竹溪活水立刻催熟「${def.name}」`);
        if (ok && consumeGardenSpeed(p, now) && ripenPlotNow(p, idx, now)) {
          saveProfile();
          this.refreshHideoutProps();
          fxFlare(V3(gp.x, 0.7, gp.z), 0x7effd8, 2.2, 0.5);
          fxRing(V3(gp.x, 0.08, gp.z), 0x7effd8, 2.3, { life: 0.7, width: 0.07 });
          cue('reveal', 0.9);
          this.banner.show(msg`引溪催熟 · ${def.name}`, '灵植已熟，可立刻采收', 2.0, '#8effd8');
        }
      }
      return;
    }

    // Empty unlocked plot: open 2×2 seed-planting card board + optional B2 rare seed card!
    const leftSeedDaily = gardenSpeedLeft(p, now);
    const cards: BoonPick[] = SEED_ORDER.map(sid => {
      const def = SEEDS[sid], cnt = state.seeds[sid] ?? 0;
      return {
        boon: {
          id: 'seed_' + sid, school: 'md' as never,
          name: msg`${def.name} ×${cnt}`,
          desc: [def.desc, def.buffDesc ?? ''],
          col: cnt > 0 ? def.hex : '#7e7872', glyph: SPROUT,
          tag: cnt > 0 ? msg`${def.steps}屋/${def.steps * def.minsPerStep}分` : '缺种',
          locked: cnt <= 0,
        } as CardBoon,
        tier: cnt > 0 ? (def.buff ? 2 : 1) : 0,
      };
    });
    if (leftSeedDaily > 0) {
      cards.push({
        boon: {
          id: 'seed_ad_rare', school: 'fg' as never,
          name: '引溪求奇种（观影）',
          desc: [msg`观影获赠 霜魂莲 或 九叶玄芝 稀有灵种 ×1`, msg`与引溪催熟共享次数 · 今日剩 ${leftSeedDaily}/${GARDEN_SPEED_DAILY_MAX} 次`],
          col: '#e0a8ff', glyph: SPROUT, tag: '观影赠种',
        } as CardBoon,
        tier: 2,
      });
    }
    const was = this.phase; this.phase = 'pick'; this.hud.on = false; this.banner.hide(); this.hideHideoutLabels();
    const sel = await this.cards.open(cards, {
      leave: true, layout: 'grid2',
      header: { title: '竹溪药圃 · 播种', sub: '通屋 / 离线双轨成熟', col: '#90f0a8' },
      wallet: { iron: p.iron, herb: p.herb, focus: 'herb' },
      footer: '确认播种 · Esc 返回',
    });
    this.phase = was; this.hud.on = true;
    if (sel < 0) return;
    if (sel === SEED_ORDER.length && leftSeedDaily > 0) {
      const ok = await this.watchAd('garden_seed', '竹溪药圃 · 引溪求奇种', '获赠稀有灵种（霜魂莲或九叶玄芝）×1');
      if (ok && consumeGardenSpeed(p, now)) {
        const rare: 'frostlotus' | 'xuanzhi' = Math.random() < 0.55 ? 'frostlotus' : 'xuanzhi';
        addSeed(p, rare, 1);
        saveProfile();
        cue('reveal', 0.85);
        this.banner.show(msg`获赠奇种 · ${SEEDS[rare].name}`, '已放入药囊，可立即播下', 2.0, SEEDS[rare].hex);
      }
      return;
    }
    if (sel >= SEED_ORDER.length) return;
    const chosen = SEED_ORDER[sel];
    if (!plantSeed(p, idx, chosen, Date.now())) {
      cue('deny', 0.45);
      this.banner.show('缺种', '清房 / 秘藏获种', 1.3, '#d0a890');
      return;
    }
    saveProfile();
    this.refreshHideoutProps();
    fxSmoke(V3(gp.x, 0.3, gp.z), 0x6a8a4c, 10, { r: 0.7, spd: 1.0, up: 0.6, s: 0.4, life: 0.7 });
    cue('reveal', 0.75);
    const def = SEEDS[chosen];
    this.banner.show(def.name, msg`${def.steps}屋 · ${def.steps * def.minsPerStep}分`, 1.4, def.hex);
  }
  /** act-125 / act-136: 乌漆铜扣信物匣 — 4×2 Hades-style showcase grid + large bottom detail panel */
  private async keepsakeMenu() {
    let focusIdx = Math.max(0, KEEPSAKE_ORDER.indexOf(equippedKeepsake(profile(), this.dbgAllWeapons) as KeepsakeId));
    let instant = false;
    for (;;) {
      const p = profile(), cur = equippedKeepsake(p, this.dbgAllWeapons);
      const cards: BoonPick[] = KEEPSAKE_ORDER.map(id => {
        const ks = KEEPSAKES[id], unl = isKeepsakeUnlocked(p, id, this.dbgAllWeapons), eq = cur === id;
        const st = keepsakeStar(p, id);
        return {
          boon: {
            id: 'ks_' + id, school: 'mr' as never,
            name: ks.name,
            desc: [unl ? ks.effect(st) : ks.source, ''],
            col: unl ? ks.col : '#7e7872', glyph: ks.glyph,
            locked: !unl,
            ksInfo: { shortName: ks.name, stars: st, unlocked: unl, equipped: eq },
          } as CardBoon,
          tier: eq ? 2 : unl ? 1 : 0,
        };
      });
      const was = this.phase; this.phase = 'pick'; this.hud.on = false; this.banner.hide(); this.hideHideoutLabels();
      const i = await this.cards.open(cards, {
        leave: true, layout: 'keepsake', instant, initialFocus: focusIdx,
        header: { title: '信物匣', sub: '限佩一件 · 通屋升星', col: '#8effd0', accent: '#62b898' },
        keepsakeDetail: idx => {
          const kid = KEEPSAKE_ORDER[idx], ks = KEEPSAKES[kid];
          const unl = isKeepsakeUnlocked(p, kid, this.dbgAllWeapons), eq = cur === kid;
          const st = keepsakeStar(p, kid), rms = keepsakeRooms(p, kid);
          const nextNeed = st === 1 ? KEEPSAKE_STARS[0] : st === 2 ? KEEPSAKE_STARS[1] : null;
          const prog = !unl ? ks.source : nextNeed != null ? msg`升星 ${rms}/${nextNeed} 屋` : '★★★ 圆满';
          return {
            title: msg`${ks.owner} · ${ks.name}`,
            badge: !unl ? '未获赠' : eq ? '佩戴中' : '已获赠',
            badgeCol: !unl ? '#9a929c' : eq ? '#ffe278' : '#88e8b8',
            stars: unl ? st : 0,
            starsMax: 3,
            line1: ks.effect(unl ? st : 1),
            line2: prog,
            action: !unl ? '未解锁' : eq ? '卸下' : '佩戴',
            accent: !unl ? '#666070' : eq ? '#ffd872' : ks.col,
          };
        },
        footer: '确认佩卸 · Esc 返回',
      });
      this.phase = was; this.hud.on = true;
      if (i < 0 || i >= KEEPSAKE_ORDER.length) return;
      focusIdx = i; instant = true;
      const kid = KEEPSAKE_ORDER[i], ks = KEEPSAKES[kid];
      if (!isKeepsakeUnlocked(p, kid, this.dbgAllWeapons)) {
        cue('deny', 0.45);
        continue;
      }
      const nextId = cur === kid ? null : kid;
      equipKeepsake(p, nextId, this.dbgAllWeapons); saveProfile();
      this.refreshHideoutProps();
      cue('reveal', 0.8);
    }
  }
  /** act-149: concise Before ▶ After stat rows for Forge & Medic workbench panels */
  private metaWorkbenchStats(id: string, lv: number, maxLv: number): WorkbenchStatRow[] {
    const next = Math.min(maxLv, lv + 1), isMax = lv >= maxLv;
    switch (id) {
      case 'blade':
        return [
          { label: '斩击增伤', before: `+${lv * 12}%`, after: isMax ? undefined : `+${next * 12}%`, highlight: !isMax },
          { label: '暴击几率', before: `+${lv * 4}%`, after: isMax ? undefined : `+${next * 4}%`, highlight: !isMax },
        ];
      case 'darts':
        return [
          { label: '飞镖上限', before: msg`${3 + lv}枚`, after: isMax ? undefined : msg`${3 + next}枚`, highlight: !isMax },
          { label: '装填冷却', before: `${100 - lv * 15}%`, after: isMax ? undefined : `${100 - next * 15}%`, highlight: !isMax },
        ];
      case 'manual':
        return [
          { label: '开局刀谱', before: lv > 0 ? '先选一本' : '未启', after: isMax ? undefined : '先选一本', highlight: !isMax },
        ];
      case 'vigor':
        return [
          { label: '生命上限', before: `+${lv * 20}`, after: isMax ? undefined : `+${next * 20}`, highlight: !isMax },
        ];
      case 'ear':
        return [
          { label: '敌人起手', before: lv > 0 ? msg`放慢${lv * 10}%` : '常速', after: isMax ? undefined : msg`放慢${next * 10}%`, highlight: !isMax },
        ];
      case 'intent':
        return [
          { label: '开场杀意', before: msg`${lv}格`, after: isMax ? undefined : msg`${next}格`, highlight: !isMax },
          { label: '开场刀气', before: lv > 0 ? '半格' : '无', after: isMax ? undefined : '半格', highlight: !isMax },
        ];
      case 'leech':
        return [
          { label: '破势回血', before: msg`${lv * 5}点`, after: isMax ? undefined : msg`${next * 5}点`, highlight: !isMax },
        ];
      case 'breath':
        return [
          { label: '死境留命', before: lv > 0 ? '每局1次' : '无', after: isMax ? undefined : '每局1次', highlight: !isMax },
        ];
      default:
        return [{ label: '当前等阶', before: `${lv}/${maxLv}`, after: isMax ? undefined : `${next}/${maxLv}`, highlight: !isMax }];
    }
  }
  /** act-125 / act-149: 冯铁臂窑口锻坊 — Split Left-List + Right 3D Artifact Workbench (铁炉强化 | 名刀淬炼) */
  private async forgeHubMenu(initialTab = 0) {
    let tab = initialTab, focusIdx = 0, instant = false;
    for (;;) {
      const p = profile();
      let switched = false;
      const tabs = {
        items: [
          { id: 'meta', label: '铁炉强化', badge: hasAffordable(p, 'forge') },
          { id: 'wep', label: '名刀淬炼', badge: hasAnyWeaponForgeable(p, this.dbgAllWeapons) },
        ],
        active: tab,
        onSwitch: (next: number) => {
          tab = next; focusIdx = 0; instant = true; switched = true;
          this.cards.cancelSilent();
        },
      };
      const ups = META.filter(u => u.who === 'forge');
      const cards: BoonPick[] = tab === 0
        ? ups.map(u => {
          const lv = level(p, u.id), cost = nextCost(p, u.id), max = u.costs.length;
          const canAfford = cost != null && p.iron >= cost;
          return {
            boon: {
              id: 'mu_' + u.id, school: 'fg' as never, name: u.name,
              desc: [u.desc[0], u.desc[1]], col: canAfford ? '#ffd878' : '#989088', glyph: ANVIL,
              locked: cost != null && !canAfford,
              workInfo: { name: u.name, lv, maxLv: max, cost, have: p.iron, cur: 'iron', canAfford, theme: 'forge' },
            } as CardBoon,
            tier: cost == null ? 2 : canAfford ? 1 : 0,
          };
        })
        : WEAPON_ORDER.map(id => {
          const w = WEAPONS[id], unl = isWeaponUnlocked(p, id, this.dbgAllWeapons), lv = weaponLevel(p, id), cost = weaponNextCost(p, id);
          const can = canForgeWeapon(p, id, this.dbgAllWeapons);
          return {
            boon: {
              id: 'wf_' + id, school: 'fg' as never, name: w.name,
              desc: [w.summary, w.special], col: can ? w.col : '#989088', glyph: w.glyph,
              locked: !unl || (cost != null && !can),
              workInfo: { name: w.name, lv, maxLv: 3, cost, have: p.iron, cur: 'iron', canAfford: can, unlocked: unl, theme: 'forge', weaponId: id },
            } as CardBoon,
            tier: cost == null ? 2 : can ? 1 : 0,
          };
        });
      const was = this.phase; this.phase = 'pick'; this.hud.on = false; this.banner.hide(); this.hideHideoutLabels();
      const i = await this.cards.open(cards, {
        leave: true, layout: 'workbench', instant, initialFocus: focusIdx,
        header: { title: '冯铁臂 · 窑口锻坊', col: '#ffd888', accent: '#c89248' },
        wallet: { iron: p.iron, herb: p.herb, focus: 'iron' },
        tabs,
        workbench: idx => {
          if (tab === 0) {
            const u = ups[idx];
            const lv = level(p, u.id), cost = nextCost(p, u.id), max = u.costs.length;
            const canAfford = cost != null && p.iron >= cost;
            return {
              theme: 'forge',
              title: u.name,
              sub: u.desc[0],
              lv,
              maxLv: max,
              stats: this.metaWorkbenchStats(u.id, lv, max),
              btnLabel: cost == null ? '已臻圆满' : '开炉锻造',
              btnCost: cost != null ? { cur: 'iron', amount: cost, have: p.iron } : undefined,
              btnEnabled: canAfford,
              accent: '#d49a4c',
            };
          }
          const wid = WEAPON_ORDER[idx], w = WEAPONS[wid];
          const unl = isWeaponUnlocked(p, wid, this.dbgAllWeapons), lv = weaponLevel(p, wid), cost = weaponNextCost(p, wid);
          const can = canForgeWeapon(p, wid, this.dbgAllWeapons);
          return {
            theme: 'forge',
            title: w.name,
            sub: unl ? w.title : w.unlockHint,
            lv: unl ? lv : 0,
            maxLv: 3,
            stats: [{ label: '淬炼等阶', icon: 'blade', before: msg`${lv}阶`, after: unl && lv < 3 ? msg`${lv + 1}阶` : undefined, highlight: unl && lv < 3 }],
            note: !unl ? w.summary : lv >= 3 ? msg`圆满特技：${w.forgeDesc[2]}` : msg`${lv + 1}阶解锁：${w.forgeDesc[lv]}`,
            btnLabel: !unl ? '尚未夺回' : cost == null ? '三阶圆满' : '开炉淬炼',
            btnCost: unl && cost != null ? { cur: 'iron', amount: cost, have: p.iron } : undefined,
            btnEnabled: can,
            accent: unl ? w.col : '#6a6670',
          };
        },
        footer: PAD.device === 'pad' ? msg`LB/RB 切页 · ${padName(0)} 锻造 · ${padName(1)} 返回` : 'Q/E 切页 · 确认锻造 · Esc 返回',
      });
      this.phase = was; this.hud.on = true;
      if (switched) continue;
      if (i < 0) return;
      focusIdx = i; instant = true;
      if (tab === 0) {
        const u = ups[i];
        if (!u || nextCost(p, u.id) == null) continue;
        if (!buy(p, u.id)) { cue('deny', 0.45); continue; }
        saveProfile(); cue('coin', 0.8);
      } else {
        const wid = WEAPON_ORDER[i], w = WEAPONS[wid];
        if (!w || !forgeWeapon(p, wid, this.dbgAllWeapons)) { cue('deny', 0.45); continue; }
        saveProfile();
        const newLv = weaponLevel(p, wid);
        if (this.hero && this.hero.weaponId === wid) this.hero.applyWeapon(wid, newLv);
        cue('bladeRing', 0.95); cue('coin', 0.7);
      }
    }
  }
  /** act-125: 名刀淬炼直接入口（委托至合并锻坊页签） */
  private async weaponForgeMenu() {
    await this.forgeHubMenu(1);
  }
  /** act-118 / act-149: 复仇碑 · 碑铭潜能 — distinct Yang sandstone vs Yin obsidian steles, zero duplicate walls of text */
  private async steleMenu() {
    let focusIdx = 0, instant = false;
    for (;;) {
      const p = profile();
      let flipped = false;
      const cards: BoonPick[] = MIRROR.map(m => {
        const st = mirrorState(p, m.id), curSide = m.sides[st.side], altSide = m.sides[st.side === 0 ? 1 : 0];
        const cost = mirrorNextCost(p, m.id), have = p[m.cur];
        const val = st.lv > 0 ? curSide.vals[Math.min(2, st.lv - 1)] : 0, nextVal = curSide.vals[Math.min(2, st.lv)];
        const altLbl = st.side === 0 ? '阴' : '阳';
        const effect = st.lv > 0
          ? (cost != null ? msg`${curSide.desc} +${val}${curSide.unit} → +${nextVal}${curSide.unit}` : msg`${curSide.desc} +${val}${curSide.unit}`)
          : msg`${curSide.desc} +${nextVal}${curSide.unit}`;
        const altBadge = PAD.device === 'pad' ? msg`${padName(3)}切${altLbl}` : msg`Q切${altLbl}`;
        return {
          boon: {
            id: 'mr_' + m.id + (st.side === 1 ? '_yin' : '_yang'), school: 'mr' as never,
            name: curSide.name,
            desc: [effect, ''],
            col: st.side === 0 ? '#ffd888' : '#c0a0ff',
            glyph: m.cur === 'iron' ? ANVIL : NEEDLE,
            altBadge,
            locked: cost != null && have < cost,
            steleInfo: {
              name: curSide.name, yin: st.side === 1, lv: st.lv, effect, cost, have, cur: m.cur, altName: altSide.name, altBadge,
            },
          } as CardBoon,
          tier: cost == null ? 2 : st.lv > 0 ? 1 : 0,
        };
      });
      const was = this.phase; this.phase = 'pick'; this.hud.on = false; this.banner.hide(); this.hideHideoutLabels();
      const i = await this.cards.open(cards, {
        leave: true, instant, initialFocus: focusIdx,
        header: { title: '复仇碑', sub: '阳 / 阴双面随时切换', col: '#d8c4ff', accent: '#9880d0' },
        wallet: { iron: p.iron, herb: p.herb },
        onAlt: idx => {
          const m = MIRROR[idx];
          if (!m) return;
          flipMirror(p, m.id); saveProfile();
          cue('reveal', 0.8);
          focusIdx = idx; instant = true; flipped = true;
          this.cards.cancelSilent();
        },
        footer: PAD.device === 'pad' ? msg`${padName(0)} 参悟 · ${padName(3)} 切阴阳 · ${padName(1)} 返回` : '确认参悟 · Q 切阴阳 · Esc 返回',
      });
      this.phase = was; this.hud.on = true;
      if (flipped) continue;
      if (i < 0 || i >= MIRROR.length) return;
      focusIdx = i; instant = true;
      const m = MIRROR[i];
      if (buyMirror(p, m.id)) { saveProfile(); cue('coin', 0.85); }
      else cue('deny', 0.45);
    }
  }
  /** 杜五 (or 杜五的遗灶 after Xiapi) packs provisions + B3 再温一壶老酒 (1 rewarded ad upgrades to deluxe: +40 coins & wine guard) */
  private async mealMenu() {
    const p = profile(), dead = isDuwuDead(p), pick = (a: string[]) => a[Math.floor(Math.random() * a.length)], ads = ensureAds(p);
    if (p.meal) {
      if (ads.mealUpgraded) {
        await this.talk([dead ? { who: 'act', text: '（行囊里已备齐热酒与干粮，灶边余烬微红）' } : { who: 'duwu', text: pick(MEAL_TALK.packed) }]);
        return;
      }
      const was = this.phase; this.phase = 'pick'; this.hud.on = false; this.banner.hide(); this.hideHideoutLabels();
      const ch = await this.cards.open([
        {
          boon: {
            id: 'meal_keep', school: 'md' as never,
            name: '行囊已备妥',
            desc: ['已领免费干粮，直接出征即可', '每局仅领一份'],
            col: '#d8ccb4', glyph: MEAL_GLYPH[p.meal] ?? MEAL_GLYPH.feast, tag: '已备',
          } as CardBoon,
          tier: 0,
        },
        {
          boon: {
            id: 'meal_ad_wine', school: 'fg' as never,
            name: '再温一壶老酒（观影升级）',
            desc: ['在原有干粮外，额外携带 40 铜钱 + 1 层护酒减伤', '每局出发前限一次 · 计入长明灯灯油'],
            col: '#ffe280', glyph: MEAL_GLYPH.wine, tag: '观影升级',
          } as CardBoon,
          tier: 2,
        },
      ], {
        leave: true,
        header: dead
          ? { title: '杜五的遗灶 · 伙房行囊', sub: '灶底老酒犹温，出征前可升级为豪华行囊', col: '#ffd27a' }
          : { title: '杜五 · 伙房行囊', sub: '老酒温在灶上，出征前可升级为豪华行囊', col: '#ffd27a' },
        footer: '点选升级或离开 · Esc 返回',
      });
      this.phase = was; this.hud.on = true;
      if (ch === 1) {
        const ok = await this.watchAd('meal_upgrade', '杜五 · 再温一壶老酒', '下一局额外带 40 铜钱与 1 层护酒免伤');
        if (ok) {
          ads.mealUpgraded = true;
          saveProfile();
          cue('coin', 0.85);
          this.banner.show('豪华行囊已备', '下局额外携带 40 铜钱 + 护酒免伤', 2.0, '#ffe280');
        }
      }
      return;
    }
    await this.talk([dead ? { who: 'act', text: '（东南遗灶旁温着胡饼、五铢钱与灶底老酒，白灯在晚风里轻晃）' } : { who: 'duwu', text: pick(MEAL_TALK.offer) }]);
    const cards: BoonPick[] = MEALS.map(m => ({ boon: { id: 'meal_' + m.id, school: 'md' as never, name: m.name, desc: [m.desc, ''], col: '#ffd27a', glyph: MEAL_GLYPH[m.id], tag: '免费' } as CardBoon, tier: 0 }));
    const was = this.phase; this.phase = 'pick'; this.hud.on = false; this.banner.hide(); this.hideHideoutLabels();
    const i = await this.cards.open(cards, {
      leave: true,
      header: dead
        ? { title: '杜五的遗灶 · 干粮', sub: '免费任选 · 领完还可再温老酒升级', col: '#ffd27a' }
        : { title: '行囊干粮', sub: '免费任选 · 领完还可再温老酒升级', col: '#ffd27a' },
      footer: '确认领取 · Esc 返回',
    }); this.phase = was; this.hud.on = true;
    const m = MEALS[i]; if (!m) return;
    p.meal = m.id; saveProfile(); cue('coin', 0.6);
    if (dead) {
      const memAfter: Record<string, string> = {
        feast: '（揣起温热的炙肉胡饼，油纸包得严严实实，像他往常一样）',
        purse: '（解下瓦罐旁的粗布钱囊，里面整整齐齐码着四十枚五铢钱）',
        wine: '（启开灶底那坛老酒抿了一口，烈气烧过喉头，浑身暖了起来）',
      };
      await this.talk([{ who: 'act', text: memAfter[m.id] ?? memAfter.feast }]);
    } else {
      await this.talk([{ who: 'duwu', text: MEAL_TALK.after[m.id] }]);
    }
  }
  /** Settings helper: cycle through unlocked UI skins (iron + unlocked lacquer / bamboo) */
  private cycleUnlockedSkin() {
    const p = profile(), allFree = this.dbgAllWeapons || __DEBUG_UI__;
    const avail = SKINS.filter(id => id === 'iron' || isCollectorUnlocked(p, id === 'lacquer' ? 'skin_lacquer' : 'skin_bamboo', allFree));
    if (avail.length <= 1) {
      cue('deny', 0.45);
      this.banner.show('兵戈铁器', '于古窑长明灯添油即可解锁「汉代漆器」「竹简木牌」', 1.8, '#ffe08a');
      return;
    }
    const next = avail[(avail.indexOf(SKIN.id) + 1) % avail.length];
    p.uiSkin = next; saveProfile();
    this.cycleSkin(next);
  }
  /** Settings helper: toggle A3 剑戟片水墨滤镜 */
  private toggleInkFilterSetting() {
    const p = profile(), allFree = this.dbgAllWeapons || __DEBUG_UI__;
    if (!isCollectorUnlocked(p, 'filter_ink', allFree)) {
      cue('deny', 0.45);
      this.banner.show('剑戟水墨滤镜', '于古窑长明灯添油解锁后可随时开关', 1.8, '#f0eadc');
      return;
    }
    p.inkFilter = !p.inkFilter; saveProfile();
    this.syncCollectorVisuals();
    this.banner.show('剑戟水墨滤镜', p.inkFilter ? '已开启 · 黑白水墨留血金' : '已关闭', 1.4, '#f0eadc');
  }
  /** B4: 韩越 / 卢昭 · 酒前问一卦（观影定向本局首间秘传流派并保底珍品） */
  private async divineMenu(who: 'huanyue' | 'luzhao') {
    const p = profile(), ads = ensureAds(p);
    const cur = ads.divineSchool as Archetype | null | undefined;
    const archs: Archetype[] = ['blood', 'poise', 'shadow', 'gale'];
    const cards: BoonPick[] = archs.map(a => {
      const ai = ARCH_INFO[a], picked = cur === a;
      return {
        boon: {
          id: 'div_' + a, school: 'fg' as never,
          name: picked ? msg`${ai.name}卦（已定）` : msg`问卦 · ${ai.name}`,
          desc: [msg`本局首间秘传必出「${ai.name}」且保底珍品`, msg`2件：${ai.b2}`],
          col: ai.col, glyph: NEEDLE,
          tag: picked ? '已定向' : '观影问卦',
        } as CardBoon,
        tier: picked ? 2 : 1,
      };
    });
    const was = this.phase; this.phase = 'pick'; this.hud.on = false; this.banner.hide(); this.hideHideoutLabels();
    const sel = await this.cards.open(cards, {
      leave: true, layout: 'grid2',
      header: {
        title: who === 'huanyue' ? '韩越 · 酒前问一卦' : '卢昭 · 听风问一卦',
        sub: '观影定向本局首间秘传流派与保底珍品，免去重开刷局',
        col: '#ffd888',
      },
      footer: '点选流派观影定卦 · Esc 返回',
    });
    this.phase = was; this.hud.on = true;
    if (sel < 0 || sel >= archs.length) return;
    const chosen = archs[sel], ai = ARCH_INFO[chosen];
    if (cur === chosen) {
      this.banner.show(msg`已定卦 · ${ai.name}`, '出征首间秘传房必出该流派珍品', 1.5, ai.col);
      return;
    }
    const ok = await this.watchAd('divine_school', msg`酒前问卦 · ${ai.name}`, msg`本局首间秘传必出「${ai.name}」且保底珍品`);
    if (!ok) return;
    ads.divineSchool = chosen;
    saveProfile();
    cue('reveal', 0.85);
    this.banner.show(msg`卦象已定 · ${ai.name}`, '下一局首间秘传必出此流派且保底珍品', 2.0, ai.col);
  }
  /** 卢昭快捷分支：听风阁名录 或 听风问卦 */
  private async divineOrArchiveMenu(who: 'luzhao') {
    const p = profile(), unl = isCollectorUnlocked(p, 'archive_sandbox', this.dbgAllWeapons);
    const was = this.phase; this.phase = 'pick'; this.hud.on = false; this.banner.hide(); this.hideHideoutLabels();
    const ch = await this.cards.open([
      {
        boon: {
          id: 'lz_divine', school: 'fg' as never,
          name: '听风问一卦（定向流派）',
          desc: ['观影定向本局首间秘传流派并保底珍品', '每局出发前可择一流派'],
          col: '#ffd888', glyph: NEEDLE, tag: '观影问卦',
        } as CardBoon,
        tier: 1,
      },
      {
        boon: {
          id: 'lz_archive', school: 'md' as never,
          name: '听风阁 · 江湖名录',
          desc: [unl ? '浏览角色立绘、试听角色配音与五首领破阵志' : '长明灯满 20 盏或直接观影 4 次永久开启', '内含全人物配音试听与首领机制指南'],
          col: '#a8e8ff', glyph: SPROUT, tag: unl ? '已开启' : '典藏解锁',
        } as CardBoon,
        tier: unl ? 2 : 0,
      },
    ], {
      leave: true,
      header: { title: '卢昭 · 竹溪水榭', sub: '可问卦定向开局流派，或翻阅听风阁江湖名录', col: '#98dcff' },
      footer: '点选一项 · Esc 返回',
    });
    this.phase = was; this.hud.on = true;
    if (ch === 0) await this.divineMenu(who);
    else if (ch === 1) await this.archiveMenu();
  }
  /** D1 + A1/A2/A3/A4/A5: 古窑长明灯 · 典藏阁（六页签：长明灯油 / 典藏行头 / 刀光皮肤 / 界面滤镜 / 古窑时辰 / 古窑挂件） */
  private async lanternMenu(initialTab = 0) {
    let tab = initialTab, focusIdx = 0, instant = false;
    for (;;) {
      const p = profile(), ads = ensureAds(p), allFree = this.dbgAllWeapons;
      const oil = ads.total, nextMs = nextLanternMilestone(p);
      let switched = false;
      const tabs = {
        items: [
          { id: 'oil', label: '长明灯油' },
          { id: 'outfit', label: '典藏行头' },
          { id: 'fx', label: '刀光皮肤' },
          { id: 'ui', label: '界面滤镜' },
          { id: 'mood', label: '古窑时辰' },
          { id: 'decor', label: '古窑挂件' },
        ],
        active: tab,
        onSwitch: (next: number) => { tab = next; focusIdx = 0; instant = true; switched = true; this.cards.cancelSilent(); },
      };

      const cards: BoonPick[] = [];
      const actions: Array<() => Promise<void>> = [];

      if (tab === 0) {
        for (const ms of LANTERN_MILESTONES) {
          const done = oil >= ms.at;
          cards.push({
            boon: {
              id: 'ms_' + ms.at, school: 'fg' as never,
              name: msg`${ms.title}（${Math.min(oil, ms.at)}/${ms.at}）`,
              desc: [ms.summary, done ? '已达成 · 典藏已永久解锁' : '任意激励点观影皆自动计入，亦可点此直接添油'],
              col: done ? '#ffe480' : '#d8ccb4', glyph: ANVIL,
              tag: done ? '已解锁' : msg`差${ms.at - oil}盏`,
            } as CardBoon,
            tier: done ? 2 : 0,
          });
          actions.push(async () => {
            if (done) { cue('click', 0.4); return; }
            await this.watchAd('collector_unlock', '古窑长明灯 · 观影添油', '灯油 +1，推进全套典藏包永久解锁进度');
            this.refreshHideoutProps();
          });
        }
        const archUnl = isCollectorUnlocked(p, 'archive_sandbox', allFree);
        cards.push({
          boon: {
            id: 'go_archive', school: 'md' as never,
            name: '听风阁 · 名录与配音',
            desc: [archUnl ? '点击进入翻阅人物立绘语音与五首领破阵志' : msg`观影 ${collectorProgress(p, 'archive_sandbox')}/4 次提前解锁，或长明灯满 20 盏自动送`, '同时开启西翼试剑坪「试锋碑」自由约战'],
            col: '#a8e8ff', glyph: SPROUT, tag: archUnl ? '进入' : '观影解锁',
          } as CardBoon,
          tier: archUnl ? 2 : 1,
        });
        actions.push(async () => { await this.archiveMenu(); });
      } else if (tab === 1 || tab === 2) {
        const cat = tab === 1 ? 'outfit' : 'bladefx';
        const items = COLLECTORS.filter(c => c.cat === cat);
        const curOutfit = activeOutfitId(p, allFree), curFx = activeBladeFx(p, allFree);
        for (const item of items) {
          const unl = isCollectorUnlocked(p, item.id, allFree);
          const prog = collectorProgress(p, item.id);
          const eq = item.cat === 'outfit' ? curOutfit === item.value : curFx === item.value;
          const isTrial = item.cat === 'outfit' ? ads.trialOutfit === item.value : ads.trialBladeFx === item.value;
          cards.push({
            boon: {
              id: 'col_' + item.id, school: 'fg' as never,
              name: eq ? msg`${item.name}（${isTrial ? '试穿中' : '已配'}）` : item.name,
              desc: [item.desc, unl ? '已永久拥有 · 点击立即换上' : msg`观影进度 ${prog}/${item.adCost}（满 ${item.lanternAt} 盏灯油亦自动送）`],
              col: unl || eq ? item.col : '#c8bca6', glyph: item.cat === 'outfit' ? MEAL_GLYPH.feast : WEAPONS.hanshan.glyph,
              tag: eq ? '使用中' : unl ? '换上' : msg`观影 ${prog}/${item.adCost}`,
            } as CardBoon,
            tier: eq ? 2 : unl ? 1 : 0,
          });
          actions.push(async () => {
            if (unl) {
              if (item.cat === 'outfit') { p.wear = item.value; ads.trialOutfit = null; }
              else { p.bladeFx = item.value; ads.trialBladeFx = null; }
              saveProfile(); this.syncCollectorVisuals(); cue('reveal', 0.8);
              this.banner.show(msg`已切换 · ${item.name}`, item.desc, 1.5, item.col);
            } else {
              const ok = await this.watchAd('collector_unlock', msg`典藏解锁 · ${item.name}`, msg`推进永久解锁（${prog + 1}/${item.adCost}）并立刻试穿下一局`, item.id);
              if (!ok) return;
              if (isCollectorUnlocked(p, item.id, allFree)) {
                if (item.cat === 'outfit') { p.wear = item.value; ads.trialOutfit = null; }
                else { p.bladeFx = item.value; ads.trialBladeFx = null; }
              } else {
                if (item.cat === 'outfit') ads.trialOutfit = item.value;
                else ads.trialBladeFx = item.value;
              }
              saveProfile(); this.syncCollectorVisuals(); cue('reveal', 0.85);
            }
          });
        }
      } else if (tab === 3) {
        const items = COLLECTORS.filter(c => c.cat === 'skin' || c.cat === 'filter');
        for (const item of items) {
          const unl = isCollectorUnlocked(p, item.id, allFree);
          const prog = collectorProgress(p, item.id);
          const on = item.cat === 'skin' ? SKIN.id === item.value : !!(p.inkFilter && unl);
          cards.push({
            boon: {
              id: 'col_' + item.id, school: 'fg' as never,
              name: on ? msg`${item.name}（开启中）` : item.name,
              desc: [item.desc, unl ? (item.cat === 'filter' ? '已永久解锁 · 点击随时开关' : '已永久解锁 · 点击立即切换') : msg`观影进度 ${prog}/${item.adCost}（满 ${item.lanternAt} 盏灯油自动送）`],
              col: unl ? item.col : '#c8bca6', glyph: ANVIL,
              tag: on ? '已启用' : unl ? '启用' : msg`观影 ${prog}/${item.adCost}`,
            } as CardBoon,
            tier: on ? 2 : unl ? 1 : 0,
          });
          actions.push(async () => {
            if (unl) {
              if (item.cat === 'skin') { p.uiSkin = item.value as SkinId; saveProfile(); this.cycleSkin(item.value as SkinId); }
              else { p.inkFilter = !p.inkFilter; saveProfile(); this.syncCollectorVisuals(); this.banner.show(item.name, p.inkFilter ? '已开启 · 黑白水墨留血金' : '已关闭', 1.4, item.col); }
              cue('reveal', 0.8);
            } else {
              const ok = await this.watchAd('collector_unlock', msg`典藏解锁 · ${item.name}`, msg`永久解锁进度 ${prog + 1}/${item.adCost}，并计入长明灯灯油`, item.id);
              if (ok && isCollectorUnlocked(p, item.id, allFree)) {
                if (item.cat === 'skin') { p.uiSkin = item.value as SkinId; saveProfile(); this.cycleSkin(item.value as SkinId); }
                else { p.inkFilter = true; saveProfile(); this.syncCollectorVisuals(); }
              }
            }
          });
        }
      } else {
        const cat = tab === 4 ? 'mood' : 'decor';
        const items = COLLECTORS.filter(c => c.cat === cat);
        const curMood = activeHideoutMood(p, allFree).id;
        const curDec = activeHideoutDecors(p, allFree);
        for (const item of items) {
          const unl = isCollectorUnlocked(p, item.id, allFree);
          const prog = collectorProgress(p, item.id);
          const on = item.cat === 'mood' ? curMood === item.value : !!curDec[item.value as HideoutDecorId];
          cards.push({
            boon: {
              id: 'col_' + item.id, school: 'md' as never,
              name: on ? msg`${item.name}（布置中）` : item.name,
              desc: [item.desc, unl ? (item.cat === 'mood' ? '点击切换古窑时辰天气' : '点击摆出或收起此装潢') : msg`观影进度 ${prog}/${item.adCost}（满 ${item.lanternAt} 盏灯油自动送）`],
              col: unl ? item.col : '#c8bca6', glyph: SPROUT,
              tag: on ? '已布置' : unl ? '布置' : msg`观影 ${prog}/${item.adCost}`,
            } as CardBoon,
            tier: on ? 2 : unl ? 1 : 0,
          });
          actions.push(async () => {
            if (!unl) {
              const ok = await this.watchAd('collector_unlock', msg`典藏解锁 · ${item.name}`, msg`永久解锁进度 ${prog + 1}/${item.adCost}，并计入长明灯灯油`, item.id);
              if (!ok || !isCollectorUnlocked(p, item.id, allFree)) return;
            }
            if (item.cat === 'mood') {
              p.hideoutMood = item.value as HideoutMoodId;
              saveProfile(); cue('reveal', 0.85);
              this.banner.show(msg`古窑氛围 · ${item.name}`, '正在切换天色与气候', 1.4, item.col);
              const mood = activeHideoutMood(p, allFree);
              void wipeTransit(() => this.enterYard({ time: mood.time as HideoutTime, weather: mood.weather as HideoutWeather }));
              return;
            } else {
              if (!p.hideoutDecors) p.hideoutDecors = {};
              const key = item.value as HideoutDecorId;
              p.hideoutDecors[key] = !p.hideoutDecors[key];
              saveProfile(); this.refreshHideoutProps(); cue('reveal', 0.8);
              this.banner.show(item.name, p.hideoutDecors[key] ? '已在古窑中摆出' : '已暂时收起', 1.4, item.col);
            }
          });
        }
      }

      const subHdr = nextMs
        ? msg`小作无内购 · 已添灯油 ${oil} 盏，再观 ${nextMs.at - oil} 次自动赠「${nextMs.title}」典藏`
        : msg`已添灯油 ${oil} 盏 · 全部长明灯典藏已圆满解锁，多谢江湖同道支持`;
      const was = this.phase; this.phase = 'pick'; this.hud.on = false; this.banner.hide(); this.hideHideoutLabels();
      const i = await this.cards.open(cards, {
        leave: true, layout: 'grid2', instant, initialFocus: focusIdx,
        header: { title: '古窑长明灯 · 典藏阁', sub: subHdr, col: '#ffe48c' },
        tabs,
        footer: PAD.device === 'pad' ? msg`LB/RB 切页 · ${padName(0)} 确认 · ${padName(1)} 返回` : 'Tab / Q E 切页 · 点击解锁或切换 · Esc 返回',
      });
      this.phase = was; this.hud.on = true;
      if (switched) continue;
      if (i < 0 || i >= actions.length) return;
      focusIdx = i; instant = true;
      await actions[i]();
      if (tab === 4 && COLLECTORS.filter(c => c.cat === 'mood')[i] && isCollectorUnlocked(profile(), COLLECTORS.filter(c => c.cat === 'mood')[i].id, allFree)) return;
    }
  }
  /** A5: 「听风阁」人物语音名录与五首领破阵志 */
  private async archiveMenu() {
    const p = profile(), allFree = this.dbgAllWeapons;
    if (!isCollectorUnlocked(p, 'archive_sandbox', allFree)) {
      const prog = collectorProgress(p, 'archive_sandbox');
      const ok = await this.watchAd('collector_unlock', '开启听风阁与自由试剑', msg`观影进度 ${prog + 1}/4（或长明灯满 20 盏自动开启）`, 'archive_sandbox');
      if (!ok || !isCollectorUnlocked(p, 'archive_sandbox', allFree)) return;
    }
    let tab = 0, focusIdx = 0, instant = false;
    for (;;) {
      let switched = false;
      const tabs = {
        items: [{ id: 'cast', label: '江湖名录·试听' }, { id: 'boss', label: '五首领破阵志' }],
        active: tab,
        onSwitch: (next: number) => { tab = next; focusIdx = 0; instant = true; switched = true; this.cards.cancelSilent(); },
      };
      const list = tab === 0 ? ARCHIVE_PEOPLE.slice(0, 5) : ARCHIVE_PEOPLE.slice(5);
      const cards: BoonPick[] = list.map(person => ({
        boon: {
          id: 'arc_' + person.id, school: 'md' as never,
          name: msg`${person.name} · ${person.title}`,
          desc: [person.lore, msg`点击试听语音：「${person.voiceText}」`],
          col: person.col, glyph: SPROUT, tag: '听声',
        } as CardBoon,
        tier: 1,
      }));
      const was = this.phase; this.phase = 'pick'; this.hud.on = false; this.banner.hide(); this.hideHideoutLabels();
      const i = await this.cards.open(cards, {
        leave: true, layout: 'grid2', instant, initialFocus: focusIdx,
        header: { title: '听风阁 · 江湖名录与破阵志', sub: '点选人物立听原声配音并查战法要诀', col: '#a8e8ff' },
        tabs,
        footer: 'Tab / Q E 切页 · 点击试听人物原声 · Esc 返回',
      });
      this.phase = was; this.hud.on = true;
      if (switched) continue;
      if (i < 0 || i >= list.length) return;
      focusIdx = i; instant = true;
      const person = list[i];
      cue('scroll', 0.4);
      sayLine(person.id, person.voiceText);
      this.banner.show(msg`${person.name} · ${person.title}`, msg`「${person.voiceText}」`, 2.2, person.col);
    }
  }
  /** A5: 西翼试剑坪「试锋碑」自由沙盒（单挑五关首领 + 自由配招试手，不污染正式出征） */
  private async trialSandboxMenu() {
    const p = profile(), allFree = this.dbgAllWeapons;
    if (!isCollectorUnlocked(p, 'archive_sandbox', allFree)) {
      const prog = collectorProgress(p, 'archive_sandbox');
      const was = this.phase; this.phase = 'pick'; this.hud.on = false; this.banner.hide(); this.hideHideoutLabels();
      const ch = await this.cards.open([
        {
          boon: {
            id: 'sb_unlock', school: 'fg' as never,
            name: msg`解锁自由试剑与听风阁（${prog}/4）`,
            desc: ['解锁后可在试剑坪自由约战五关首领、任配流派秘传练招', '观影 4 次直接解锁，或长明灯满 20 盏自动开启'],
            col: '#a8e8ff', glyph: WEAPONS.hanshan.glyph, tag: '观影解锁',
          } as CardBoon,
          tier: 2,
        },
      ], {
        leave: true,
        header: { title: '试锋碑 · 自由试剑沙盒', sub: '典藏功能 · 解锁后可随时约战五首领并自由配招', col: '#a8e8ff' },
        footer: '点击观影推进解锁 · Esc 返回',
      });
      this.phase = was; this.hud.on = true;
      if (ch === 0) await this.watchAd('collector_unlock', '解锁自由试剑与听风阁', msg`推进永久解锁（${prog + 1}/4）并计入长明灯灯油`, 'archive_sandbox');
      return;
    }

    let tab = 0, focusIdx = 0, instant = false;
    for (;;) {
      let switched = false;
      const tabs = {
        items: [{ id: 'boss', label: '首领约战' }, { id: 'build', label: '自由配招' }],
        active: tab,
        onSwitch: (next: number) => { tab = next; focusIdx = 0; instant = true; switched = true; this.cards.cancelSilent(); },
      };
      let cards: BoonPick[] = [];
      if (tab === 0) {
        cards = SANDBOX_BOSSES.map(b => ({
          boon: {
            id: 'sb_' + b.kind, school: 'fg' as never,
            name: b.name,
            desc: [b.regionName, b.tip],
            col: b.col, glyph: WEAPONS.thunder.glyph, tag: '约战',
          } as CardBoon,
          tier: 2,
        }));
      } else {
        cards = BOONS.slice(0, 8).map(b => {
          const lv = this.perks.owned[b.id];
          return {
            boon: {
              ...b,
              tag: lv != null ? msg`已配·${TIER_NAMES[lv]}` : '试配',
            } as CardBoon,
            tier: lv != null ? Math.min(2, lv) : 1,
          };
        });
      }
      const was = this.phase; this.phase = 'pick'; this.hud.on = false; this.banner.hide(); this.hideHideoutLabels();
      const i = await this.cards.open(cards, {
        leave: true, layout: 'grid2', instant, initialFocus: focusIdx,
        header: { title: '试锋碑 · 自由试剑', sub: '试剑坪内不死不计败绩，出征时自动清空试配秘传', col: '#a8e8ff' },
        tabs,
        footer: 'Tab / Q E 切页 · 点击召首领或试配秘传 · Esc 返回',
      });
      this.phase = was; this.hud.on = true;
      if (switched) continue;
      if (i < 0) return;
      focusIdx = i; instant = true;
      if (tab === 0) {
        const sb = SANDBOX_BOSSES[i];
        if (!sb) return;
        for (let fi = this.foes.length - 1; fi >= 0; fi--) {
          if (this.foes[fi].kind !== 'dummy') { dropTeles(this.foes[fi]); this.foes[fi].a.dispose(); this.foes.splice(fi, 1); }
        }
        const at = V3(-10.3, 0, -2.8);
        const f = spawnFoe(sb.kind as EKind, at, this.hero.pos.clone());
        this.foes.push(f);
        fxSmoke(at.clone().add(V3(0, 0.3, 0)), 0x8a8278, 14, { r: 0.9, spd: 1.4, up: 0.8, s: 0.48, life: 0.8 });
        cue('roar', 0.8); f.a.roar();
        this.banner.show(msg`试锋约战 · ${sb.name}`, sb.tip, 2.0, sb.col);
        return;
      } else {
        const b = BOONS[i];
        if (b) { this.take(b, 2); cue('relic', 0.7); }
      }
    }
  }
  /** act-149: 孙媪 · 药炉冥想悟性牌阵 (Hades 2 Altar of Ashes style: 3×3 jade cards + 悟性上限 + 零悟性唤醒 + 精进升阶) */
  private async upgradeMenu(who: 'forge' | 'medic') {
    if (who === 'forge') { await this.forgeHubMenu(0); return; }
    const id = 'sunao';
    const up = UP_TALK[id]; if (up?.length) await this.talk([{ who: id, text: up[Math.floor(Math.random() * up.length)] }]);
    await this.arcanaMenu();
  }
  private async arcanaMenu() {
    let focusIdx = 0, instant = false;
    for (;;) {
      const p = profile();
      ensureArcana(p);
      const used = arcanaUsed(p), cap = arcanaCap(p), nextCap = arcanaNextCapCost(p), actCnt = arcanaActiveCount(p);
      let refreshAction = false;
      const cards: BoonPick[] = ARCANA.map(def => {
        const rk = arcanaRank(p, def.id);
        const active = isArcanaActive(p, def.id);
        const unlocked = rk > 0;
        const canUnlock = !unlocked && p.herb >= def.unlockCost;
        return {
          boon: {
            id: 'arc_' + def.id, school: 'md' as never, name: def.name,
            desc: [def.desc, ''], col: unlocked ? def.col : '#7c808a', glyph: def.glyph,
            locked: !unlocked,
            arcanaInfo: {
              short: def.short, grasp: def.grasp, rank: rk, active,
              unlockCost: def.unlockCost, have: p.herb, canUnlock, awakening: def.grasp === 0,
            },
          } as CardBoon,
          tier: active ? 2 : unlocked ? 1 : 0,
        };
      });
      const was = this.phase; this.phase = 'pick'; this.hud.on = false; this.banner.hide(); this.hideHideoutLabels();
      const i = await this.cards.open(cards, {
        leave: true, layout: 'arcana', instant, initialFocus: focusIdx,
        header: { title: '孙婆婆 · 悟性牌阵', sub: '启停免费 · 启 3 牌唤中宫', col: '#90f6ba', accent: '#4eb47c' },
        wallet: { iron: p.iron, herb: p.herb, focus: 'herb' },
        graspBar: {
          used, cap, nextCost: nextCap, have: p.herb, canExpand: nextCap != null && p.herb >= nextCap,
          onExpand: () => {
            if (expandArcanaCap(p)) {
              saveProfile();
              cue('reveal', 0.85);
              instant = true; refreshAction = true;
              this.cards.cancelSilent();
            } else {
              cue('deny', 0.45);
            }
          },
        },
        onSub: idx => {
          const def = ARCANA[idx];
          if (!def) return;
          focusIdx = idx;
          if (upgradeArcana(p, def.id)) {
            saveProfile();
            cue('reveal', 0.85);
            instant = true; refreshAction = true;
            this.cards.cancelSilent();
          } else {
            cue('deny', 0.45);
          }
        },
        workbench: idx => {
          const def = ARCANA[idx];
          const rk = arcanaRank(p, def.id);
          const unlocked = rk > 0;
          const active = isArcanaActive(p, def.id);
          const isAwk = def.grasp === 0;
          const curVal = unlocked ? def.vals[Math.min(2, rk - 1)] : 0;
          const nextVal = unlocked && rk < 3 ? def.vals[rk] : def.vals[0];
          const upCost = arcanaUpgradeCost(p, def.id);
          const canUp = upCost != null && p.herb >= upCost;
          const availGrasp = Math.max(0, cap - used);
          const canEquip = unlocked && !active && !isAwk && availGrasp >= def.grasp;
          const graspSub = isAwk
            ? msg`零悟性 · 已启 ${actCnt}/3 牌自动唤醒`
            : msg`悟性 ${def.grasp} · ${def.desc}`;
          const fmt = (val: number) => def.unit ? `${val}${def.unit}` : `+${val}`;
          const stats: WorkbenchStatRow[] = unlocked
            ? [{ label: def.statLabel, before: fmt(curVal), after: rk < 3 ? fmt(nextVal) : undefined, highlight: rk < 3 }]
            : [{ label: def.statLabel, before: '未悟', after: fmt(def.vals[0]), highlight: true }];
          const btnLabel = !unlocked
            ? '参悟此牌'
            : isAwk
              ? (active ? '中宫已唤醒' : msg`已启 ${actCnt}/3 牌`)
              : active
                ? '卸下归位'
                : '启用入阵';
          const btnCost = !unlocked
            ? { cur: 'herb' as const, amount: def.unlockCost, have: p.herb }
            : (unlocked && !active && !isAwk ? { cur: 'grasp' as const, amount: def.grasp, have: availGrasp } : undefined);
          return {
            theme: 'medic',
            title: def.name,
            sub: graspSub,
            lv: rk,
            maxLv: 3,
            stats,
            note: isAwk ? def.desc : undefined,
            btnLabel,
            btnCost,
            btnEnabled: !unlocked ? p.herb >= def.unlockCost : isAwk ? false : (active || canEquip),
            subBtnLabel: unlocked ? (upCost == null ? '三阶圆满' : '精进升阶') : undefined,
            subBtnCost: unlocked && upCost != null ? { cur: 'herb', amount: upCost, have: p.herb } : undefined,
            subBtnEnabled: unlocked && canUp,
            accent: active ? (isAwk ? '#ffe078' : '#7ef0aa') : '#4e9670',
          };
        },
        footer: '确认启停 · Q 升阶 · Esc 返回',
      });
      this.phase = was; this.hud.on = true;
      if (refreshAction) continue;
      if (i < 0 || i >= ARCANA.length) return;
      focusIdx = i; instant = true;
      const def = ARCANA[i];
      const rk = arcanaRank(p, def.id);
      if (rk <= 0) {
        if (unlockArcana(p, def.id)) { saveProfile(); cue('reveal', 0.85); }
        else cue('deny', 0.45);
      } else {
        const res = toggleArcana(p, def.id);
        if (res === 'on') { saveProfile(); cue('reveal', 0.72); }
        else if (res === 'off') { saveProfile(); cue('click', 0.5); }
        else cue('deny', 0.45);
      }
    }
  }
  /** 继续游戏: resumes at the last prologue checkpoint (village / Cui Xuan forecourt / kiln wake-up) or directly in the hideout */
  continueGame() {
    const p = profile();
    if (p.proStage === 'village') return this.startPrologue();
    if (p.proStage === 'boss') return this.resumePrologueBoss();
    if (p.proStage === 'wake') return this.playKilnWake();
    return this.enterYard();
  }
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
  private spec: Spec | null = null; private layout: Layout | null = null; private doors: Array<{ ex: ExitInfo; g: THREE.Group; lift: number; scrollUp?: boolean }> = []; private locale = 'ninja_wilds';
  private cam = V3(0, 0, 0); private recent: Spec[] = [];
  private botWp = 0; private botTalkT = 0; botOn = false; kills = 0; log: string[] = []; private introT = 0; private audioOn = false; private hinted = false; tut!: Tutorial; feed!: RewardFeed;
  /** the training yard (room −1) and the costume on the hero */
  yard: Yard | null = null; wearing: ModelDef = savedHero(); private lineupActors: BattleActor[] = [];
  private aimLine!: THREE.Mesh;
  private propContacts?: ContactBatch;
  private foeContacts?: ContactBatch;
  private ring!: THREE.Mesh; private ringK = -1; private sparkT = 0; private shadows: THREE.Mesh[] = []; private exitSign: THREE.Group | null = null; private blob: THREE.Mesh;
  constructor(private platform: Platform, deferStart = false) {
    SELF = this; this.dialogue = new Dialogue(this.L, this.ov); this.timeline = new Timeline(this.L);
    HP_FACE.id = this.wearing.id;   // the HP medallion shows the look she wears
    this.hud = new ActHud(this.L); this.cards = new CardPick(this.L); this.worldPlates = new UiPlatePool(this.L); this.banner = new SkinBanner(this.L, SKIN.id, () => this.hud.bossOn);
    this.adModal = new AdSimModal(this.L); setAdSimHost(info => this.adModal.open(info));
    this.gameClub = new GameClubBadge(this.L);
    this.syncCollectorVisuals();
    // act-165: latch all inputs whenever a modal card/hideout UI opens or closes so confirm/back presses (e.g. Pad A = dash, Space, J) never leak to the hero
    this.cards.onOpen = () => { this.inp.latch(true); padNav.sync(); };
    this.cards.onClose = () => { this.inp.latch(true); };
    this.tut = new Tutorial(this.L); this.feed = new RewardFeed(this.L); this.duel = new Duel(this.duelHost);   // 11-18 QTE 拼刀 / 连环破势 (act/qte.ts)
    platform.onPointer(ev => { if (ev.type === 'down') this.unlockAudio(); this.pointer(ev.type, (ev as { id?: number }).id ?? 0, ev.x, ev.y, isTouchPointer(ev)); });
    platform.onResize(() => this.layout2());
    if (HAS_DOM) {
      window.addEventListener('keydown', e => this.key(e));
      window.addEventListener('keyup', e => this.keyUp(e));
    }
    onUpdate((dt, rdt) => this.frame(dt, rdt));
    onRealUpdate(() => this.syncGameClub());
    this.layout2();
    // the player's settings: the tuning panel shows the long labels, the pause menu's 设置 page the short ones (act-30 之后)
    // (11-18 用户：「调试只在我们本地打的桌面包里面存在就行了，比如换角色、换开场场景啥的」: dbg = a test switch — the WeChat and
    //  CrazyGames packages leave it out of 设置; they keep 震动, 试一下震动, 画质 and 语言)
    const SET: Array<{ label: () => string; short: () => string; run: () => void; dbg?: true }> = [
      { label: () => `界面风格：${SKIN_NAME[SKIN.id]}（点这里换）`, short: () => msg`界面：${SKIN_NAME[SKIN.id]}`, run: () => this.cycleUnlockedSkin() },
      { label: () => msg`水墨滤镜：${profile().inkFilter && isCollectorUnlocked(profile(), 'filter_ink', this.dbgAllWeapons) ? '开' : isCollectorUnlocked(profile(), 'filter_ink', this.dbgAllWeapons) ? '关' : '长明灯解锁'}`, short: () => msg`水墨滤镜：${profile().inkFilter && isCollectorUnlocked(profile(), 'filter_ink', this.dbgAllWeapons) ? '开' : '关'}`, run: () => this.toggleInkFilterSetting() },
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
      // 11-19 新手引导: the prologue's freezes can be turned off
      { label: () => msg`操作提示：${this.tut.enabled ? '开' : '关'}`, short: () => msg`操作提示：${this.tut.enabled ? '开' : '关'}`, run: () => this.tut.setEnabled(!this.tut.enabled) },
      // Device-adaptive UI layout switch (自动 / 键鼠手柄 / 触屏)
      { label: () => uiModeLabel(), short: () => uiModeLabel(), run: () => { cycleUiMode(); this.hud.layout(this.L.w, this.L.h); } },
      // 11-18 微信帧率: the quality tier (自动 → 高 → 中 → 低), kept on the device
      { label: () => qualityLabel(), short: () => qualityLabel(), run: () => cycleQuality() },
      // 11-21: experimental visual style presets stay in desktop/dev builds only; classic 2x pixel craft is the unified main look
      { label: () => craftLabel(), short: () => craftLabel(), run: () => cycleCraft() },
      // (11-19 用户：「github页面上的版本就是开发版……微信和crazygames都必须要做成面向用户的版本」: the frame meter is a debug item)
      { dbg: true, label: meterLabel, short: meterLabel, run: toggleMeter }];
    if (__DEBUG_UI__) installActTune([...SET.map(x => ({ label: x.label, run: x.run })),
      // act-50 (用户：「加入一个跳过当前剧情的调试按钮」): the cutscene / the talk running now and the ones chained after it, fast-forwarded
      //  until she can be played again (fast-forward, not a cut: every shot's own events — 杜五 and the donkey coming in, her getting up — still happen)
      { label: () => (this.storySkip ? '跳过剧情：快进中…' : '跳过剧情（演出和对话快进到能操作）'), run: () => this.skipStory() },
      // 11-18 测关卡用: she can't die / every 刀谱 move on (the tune panel only, not the pause menu)
      { label: () => `打不死：${this.god ? '开' : '关'}`, run: () => { this.god = !this.god; } },
      { label: () => `全部招式：${this.dbgAllMoves ? '开' : '关'}`, run: () => { this.dbgAllMoves = !this.dbgAllMoves; if (this.hero && !this.prologue) this.hero.moves = this.dbgAllMoves ? ALL_MOVES : this.perks.moves; } },
      { label: () => `全部名刀与信物：${this.dbgAllWeapons ? '开' : '关'}`, run: () => { this.dbgAllWeapons = !this.dbgAllWeapons; this.syncHideoutNpcs(); this.refreshHideoutProps(); } }],
      { regions: REGIONS.map(r => r.name), rooms: ri => REGIONS[ri].rooms, go: (ri, room, type) => { const r = this.jumpRegion(ri, room, type); return 'why' in r ? r.why : undefined; } });
    // the pause menu (act-30 之后, user: 「帮我把手柄的按键映射和手柄支持做了吧」): Start / Esc, a pad pulled out, the page hidden
    this.pause = new PauseMenu({ L: this.L, settings: [...SET.filter(x => __DEBUG_UI__ || !x.dbg).map(x => ({ label: x.short, run: x.run })), { id: 'language', label: () => '语言：简体中文', run: () => setLanguage(language === 'en' ? 'zh' : 'en') }], canGiveUp: () => this.canGiveUp(), giveUp: () => this.giveUp(), closed: () => this.unpaused(), toTitle: () => this.backToTitle(), onRun: () => this.canGiveUp(),
      build: () => this.buildSections(),
      miniContext: () => { const p = profile(), wid = equippedWeapon(p, this.dbgAllWeapons); return { def: this.wearing, weaponId: wid, weaponLv: weaponLevel(p, wid) }; },
      preview: id => this.previewMove(id), previewing: () => this.previewOn, stopPreview: () => { if (this.previewOn) this.demo.stop(true); } });
    // 11-18 (用户：「游戏里也没有一个可以呼出暂停窗口的按钮」): the iron button at the top right opens it too
    this.hud.onPause = () => this.pauseGame();
    this.hud.onOpenOwned = () => this.openOwnedQuick();
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
      boss: (n = 0) => { this.jumpRegion(n, REGIONS[Math.max(0, Math.min(REGIONS.length - 1, n))].rooms, 'boss'); },
      /** act-125: jump straight to Three Kingdoms general puzzle encounter (0=赵云, 1=吕布, 2=夏侯惇, 3=陆逊) */
      general: (n = 0) => { const ri = Math.max(0, Math.min(GENERAL_EVENTS.length - 1, n)); return this.jumpRegion(ri, 2, 'event'); },
      /** act-125: debug solve current general puzzle event, swap weapon, toggle all weapons/keepsakes unlocked */
      solveEvent: () => { this.generalEvent?.forceSolve(); return !!this.generalEvent; },
      /** act-161: this run's fight numbers — damage by source, each boss's body / barrier seconds, blows taken, health given back */
      fight: () => this.fightReport(),
      weapon: (id: WeaponId = 'hanshan', lv?: number) => {
        const p = profile();
        if (lv != null) { if (!p.weaponLv) p.weaponLv = {}; p.weaponLv[id] = Math.max(0, Math.min(3, lv)); }
        p.weapon = id; saveProfile();
        this.hero?.applyWeapon(id, weaponLevel(p, id));
        this.refreshHideoutProps();
        return { id, lv: weaponLevel(p, id) };
      },
      /** act-169: add lantern oil & unlock collectors / toggle ink filter / preview menus for instant testing */
      ads: (n = 20) => {
        const p = profile();
        for (let i = 0; i < n; i++) recordAdWatched(p);
        saveProfile(); this.syncCollectorVisuals(); this.refreshHideoutProps();
        return { total: ensureAds(p).total };
      },
      inkFilter: (on = true) => {
        const p = profile();
        ensureAds(p).unlocks.filter_ink = true;
        p.inkFilter = on; saveProfile(); this.syncCollectorVisuals();
        return { inkFilter: GRADE.cinemaInk };
      },
      lantern: (tab = 0) => { void this.lanternMenu(tab); return { tab }; },
      testDead: () => { this.usedRevive = false; this.dead(); return true; },
      gameClub: () => getGameClubState(),
      allWeapons: (on = true) => { this.dbgAllWeapons = on; this.syncHideoutNpcs(); this.refreshHideoutProps(); return on; },
      /** act-135: preview a hideout zone construction monument (run=false) or full 3D construction ceremony (run=true) */
      revealZone: (zone: HideoutZoneId = 'forge', run = true) => {
        const p = profile();
        this.dbgAllWeapons = false;
        delete p.seen[HIDEOUT_ZONES[zone].flag];
        if (zone === 'forge') p.runs = Math.max(p.runs, 1);
        else if (zone === 'garden') { p.runs = Math.max(p.runs, 2); delete p.garden; }
        else { p.runs = Math.max(p.runs, 3); p.weapon = 'hanshan'; p.weaponLv = {}; }
        saveProfile();
        this.syncHideoutNpcs();
        this.refreshHideoutProps();
        if (run && this.phase === 'yard') void this.buildHideoutZone(zone);
        return { zone, run, pending: hideoutProgress(p, this.dbgAllWeapons).pendingZones };
      },
      gardenDemo: () => {
        const p = profile();
        seeOnce('build_garden');
        const { state } = ensureGarden(p);
        state.unlocked = 5;
        state.plots = [
          { seed: 'xuanzhi', plantedAt: Date.now() - 36000000, rooms: 9 },
          { seed: 'frostlotus', plantedAt: Date.now() - 36000000, rooms: 6 },
          { seed: 'ironorchid', plantedAt: Date.now(), rooms: 3 },
          { seed: 'angelica', plantedAt: Date.now(), rooms: 0 },
          null,
          null,
        ];
        saveProfile();
        this.syncHideoutNpcs();
        this.refreshHideoutProps();
        return true;
      },
      keepsake: (id: KeepsakeId | null = null) => {
        const p = profile();
        if (id) unlockKeepsake(p, id);
        p.keepsake = id; saveProfile();
        this.refreshHideoutProps();
        return id;
      },
      /** switch or inspect active input device & UI layout ('key' | 'pad' | 'touch' | 'auto', plus optional pad family 'xbox' | 'ps' | 'ns') */
      device: (d?: Device | 'auto', family?: PadFamily) => {
        if (family) PAD.family = family;
        if (d === 'auto') { setUiMode('auto'); PAD.device = detectInitialDevice(); }
        else if (d) { setUiMode('auto'); PAD.device = d; }
        this.hud.layout(this.L.w, this.L.h);
        return { device: PAD.device, family: PAD.family, uiMode: PAD.uiMode, touchLayout: isTouchLayout() };
      },
      /** act-114: preview Ch5 blade-at-throat ending choice, or directly play ending 'a' | 'b' | 'c' */
      ending: (choice?: 'a' | 'b' | 'c') => { void this.debugEnding(choice); },
      /** act-156 / act-169: preview prologue Cui Xuan disarm (pass wallEdge=true to test wall-hugging anti-clip re-staging) */
      proFall: (wallEdge = false) => {
        void (async () => {
          if (this.phase === 'title') { stopTitle(); this.hud.on = true; }
          this.prologue = 2; this.proFalling = false; this.proFightT = 0; this.tut.stop();
          this.room = 1; this.region = 0;
          this.plan = { ...PRO_BOSS, waves: [] }; this.locale = PRO_BOSS.locale; this.forceSpec = { ...PRO_BOSS_SPEC };
          await this.buildRoom(false);
          this.forceSpec = null;
          this.phase = 'fight';
          this.waveGen++;
          const bStart = wallEdge ? V3(PLAY.x0 + 1.4, 0, PLAY.z1 - 1.5) : V3(0, 0, -2.2);
          const hStart = wallEdge ? V3(PLAY.x0 + 0.55, 0, PLAY.z1 - 0.65) : V3(0, 0, 2.2);
          const cx = spawnFoe('cx_boss', bStart, hStart.clone());
          this.foes.push(cx);
          this.hero.pos.copy(hStart); this.hero.a.place(this.hero.pos, Math.atan2(bStart.x - hStart.x, bStart.z - hStart.z));
          await frames(2);
          await this.prologueFall();
        })();
        return { stage: 'proFall', wallEdge };
      },
      /** act-157 / act-165: preview prologue Cui Xuan immediate frame-0 wall-vault + hard-cut PRO_CUIXUAN confrontation */
      proCuixuan: () => {
        void (async () => {
          if (this.phase === 'title') { stopTitle(); this.hud.on = true; }
          this.prologue = 2; this.proFalling = false; this.proFightT = 0; this.tut.stop();
          this.room = 1; this.region = 0;
          this.plan = PRO_BOSS; this.locale = PRO_BOSS.locale; this.forceSpec = { ...PRO_BOSS_SPEC };
          await this.buildRoom(false);
          this.forceSpec = null;
        })();
        return { stage: 'proCuixuan' };
      },
      /** act-165: preview hideout departure 3D put-on-hat ceremony (pass freezeK in [0..1] to hold a specific pose frame) */
      departHat: (freezeK?: number) => {
        void (async () => {
          if (this.phase === 'title') { stopTitle(); this.hud.on = true; }
          if (this.room >= 0 || this.phase !== 'yard') {
            await this.enterYard({ time: 'dusk', weather: 'clear' });
            await frames(2);
          }
          await this.playDepartHatCeremony({ preview: freezeK != null, freezeK });
        })();
        return { stage: 'departHat', freezeK: freezeK ?? null };
      },
      /** act-157: preview kiln wake-up cutscene directly (for visual verification of jiangjin_hurt & camera angles) */
      proWake: () => {
        void (async () => {
          if (this.phase === 'title') { stopTitle(); this.hud.on = true; }
          await this.playKilnWake();
        })();
        return { stage: 'proWake' };
      },
      /** act-157: trigger hero directional hit-react pose (0 = front, PI = back, PI/2 = left) for visual verification */
      heroHurt: (fromAngle = 0, freezeK?: number) => {
        const h = this.hero;
        if (!h) return null;
        const a = new Action('hurt', freezeK != null ? 99 : 0.32, 0.09, { power: 0.95, fromAngle });
        if (freezeK != null) a.t = freezeK * a.dur;
        h.a.play(a);
        return { fromAngle, freezeK };
      },
      /** act-154: preview Du Wu arc stage ('road1' | 'road2' | 'die' | 'memorial' | 'endingA' | 'endingC') */
      duwuArc: (stage: 'road1' | 'road2' | 'die' | 'memorial' | 'endingA' | 'endingC' = 'die') => {
        const p = profile();
        if (stage === 'road1' || stage === 'road2') {
          delete p.seen['duwu_dead']; delete p.seen['duwu_die'];
          delete p.seen[stage === 'road1' ? 'duwu_road_1' : 'duwu_road_2'];
          saveProfile();
          return this.jumpRegion(stage === 'road1' ? 0 : 1, 2, 'rest');
        }
        if (stage === 'die') {
          delete p.seen['duwu_dead']; delete p.seen['duwu_die']; delete p.seen['ch3_boss'];
          saveProfile();
          const r = this.jumpRegion(2, REGIONS[2].rooms, 'boss');
          if (this.plan && this.plan.waves.length > 1) this.plan.waves = [this.plan.waves[this.plan.waves.length - 1]];
          return r;
        }
        p.seen['duwu_dead'] = 1; p.seen['duwu_die'] = 1;
        if (stage === 'memorial') {
          delete p.seen['duwu_memorial_intro'];
          p.meal = undefined;
          saveProfile();
          if (this.phase === 'title') { stopTitle(); this.hud.on = true; }
          void this.enterYard();
          return { stage: 'memorial' };
        }
        p.seen['duwu_memorial_intro'] = 1;
        saveProfile();
        void this.debugEnding(stage === 'endingA' ? 'a' : 'c');
        return { stage };
      },
      /** act-137: preview Ch1–Ch4 boss first-kill kneel + execution slash staging (ri = 0..3) */
      bossAfter: (ri = 0, executeNow = false) => { void this.debugBossAfter(Math.max(0, Math.min(3, ri)), executeNow); },
      /** act-114: preview hideout stele carving cutscene for name index n (0..4) */
      steleCut: (n = 0) => { void this.debugSteleCut(Math.max(0, Math.min(4, n))); },
      newGame: () => this.startNewGame(), talkTest: (n = 0) => this.talk(n ? CHULEI_BEFORE : WAKE_DUWU), act: () => this, bot: (on = true) => { this.botOn = on; }, run: () => this.startRun(), yard: () => this.enterYard(), wear: (id: string) => { const d = HEROES.find(h => h.id === id); if (d) this.wear(d); },
      weather: (w: Spec['weather'], t?: Spec['time']) => {
        if (this.room < 0) {
          const hw: HideoutWeather = w === 'snow' || w === 'rain' || w === 'mist' || w === 'clear' ? w : 'rain';
          const ht: HideoutTime = t === 'day' || t === 'dawn' || t === 'night' || t === 'dusk' ? t : (hw === 'snow' ? 'night' : 'dusk');
          void this.enterYard({ time: ht, weather: hw });
          return { hideout: true, time: ht, weather: hw };
        }
        this.forceSpec = { ...(this.spec ?? {}), weather: w, ...(t ? { time: t } : {}) };
        void Promise.resolve(this.buildRoom(false)).finally(() => { this.forceSpec = null; });
        return { locale: this.spec?.locale, time: t ?? this.spec?.time, weather: w };
      },
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
            const variant = /^(wl|cx|gen)_/.test(a.def.id) && !['attack', 'cast', 'hurt', 'fall', 'collapse', 'roar'].includes(name);
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
      /** 11-19: the sound engine, for captures that check which samples a cue plays */ audio: () => audio,
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
      intent: (n = 3) => { this.intentVal = Math.max(0, Math.min(3, n)); this.intent = Math.floor(this.intentVal); this.hud.intent = this.intent; },
      ...(__DEBUG_UI__ ? { tutorial: (id?: LessonId | 'off' | 'on') => { if (id === 'off' || id === 'on') this.tut.setEnabled(id === 'on'); else if (id) this.tut.force(id); return { cur: this.tut.cur, k: this.tut.k, on: this.tut.enabled }; } } : {}),
      qi: (n?: number) => { if (n != null) this.hero.qi = Math.max(0, Math.min(Hero.QI_MAX, n)); return this.hero.qi; },
      untaught: () => { try { localStorage.removeItem('ub.taught'); } catch { /* */ } this.taught = null; },
      prologue: (n = 1) => { this.startPrologue(); if (n >= 2) { after(0.3, () => { this.prologue = 2; this.proFightT = 0; this.plan = { ...PRO_BOSS }; this.locale = PRO_BOSS.locale; this.room = 1; this.buildRoom(false); }); } },
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
      /** the last frame-split room build: busy ms in its steps, wall ms, frames it spanned, steps, the longest single step (ms) */
      buildStats: () => ({ ...BUILD_STATS }),
      /** the camera tile pass since the last call: frames, index rebuilds, ms in rebuilds / the whole pass, terrain faces (resets) */
      tileStats: () => { const o = { ...TILE_STATS }; TILE_STATS.frames = TILE_STATS.rebuilds = TILE_STATS.byCam = TILE_STATS.byTile = TILE_STATS.byGroup = 0; TILE_STATS.rebuildMs = TILE_STATS.passMs = 0; return o; },
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
    // (a browser's autoplay rule: the context comes up suspended without a gesture — resume() then never settles, so the music is
    //  asked for right away; it sounds the moment the context runs, on the first touch or key)
    audio.prepare(); this.music();
    audio.unlock().then(() => this.music()).catch(e => { console.warn('[audio] waiting for a touch to start the sound:', e); });
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
    if (!HAS_DOM) {
      audio.prepare({ warm: [this.musicName()], prefetch: true });
      // act-140: silently pre-download WeChat voice subpackages (audio5/6/7) right after boot so no dialogue ever stalls on wx.loadSubpackage
      void audio.loading?.then(() => warmVoicePacks());
    }
    // (11-19 用户：「每次开场的音乐都要我点一下屏幕才播，我希望是加载完了就开始播了」: start the sound as soon as the page is up,
    //  not on the first touch. A mini-game's WebAudio may play at once; a browser blocks sound until the first touch or key — there
    //  the context stays suspended and the first input resumes it (unlockAudio), the music then starts from where it would be)
    void Promise.resolve(ready).then(() => this.unlockAudio());
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
    // act-140 ?moves, or the desktop full moveset page (window.__MOVES): interactive 3D showcase of all base/weapon/manual/boon moves (movesPreview.ts)
    if (HAS_DOM && ((window as unknown as { __MOVES?: number }).__MOVES || /[?&#]moves\b/.test(location.href))) { this.movesPreview(); return; }
    // ?model (vox/打开游戏看效果.bat): straight into the hideout, the camera close behind her — for checking a model edited in MagicaVoxel
    if (typeof location !== 'undefined' && /[?&#]model\b/.test(location.href)) { Object.assign(TUNE, { camH: 7.5, camD: 10.5, camFov: 34 }); return this.enterYard(); }
    const tn = wantTitle();
    if (typeof location !== 'undefined' && /[?&#]run\b/.test(location.href)) return this.startRun(); else if (tn) return this.title(tn); else if (wantOpening()) return this.opening(); else return this.enterYard();
  }
  /** 开始画面 (title.ts, act-20): a wide shot of one of the place / weather variants with the menu (开始游戏 / 继续游戏 / 设置);
   *  the title builds its own place and poses its own heroine while frame() idles; the choice cuts into startNewGame / continueGame */
  title(n = 1) {
    this.dropAhead();
    try { localStorage.setItem('ub.title', String(n)); } catch { /* storage blocked */ }   // the last one shown opens next time
    // a room may be up (__dh.title from the yard): its actors go the way a room change sends them
    this.propContacts?.dispose(); this.propContacts = undefined;
    this.foeContacts?.dispose(); this.foeContacts = undefined;
    this.duel?.newRoom(); for (const f of this.foes) f.a.dispose(); this.foes.length = 0; for (const a of this.arrows) a.kill(); this.arrows.length = 0; for (const w of this.waves) w.kill(); this.waves = []; for (const d of this.darts) d.kill(); this.darts = []; this.entering.length = 0; this.clearBossDrops(); this.clearFleeing(); this.bossDefeated = false; this.poolBossRoom = false; this.kneelingBoss = null; this.wavePending = 0; this.waveGen++; this.bossIntroActive = false;
    this.yard?.dispose(); this.yard = null; this.props?.dispose(); this.props = null; this.gates?.dispose(); this.gates = null; this.pieces?.dispose(); this.pieces = null; this.leaves?.dispose(); this.leaves = null; this.stations?.dispose(); this.stations = null; this.hero?.a.dispose();
    this.clearNpcs();
    this.phase = 'title'; audio.setWeatherSound('none', 0.4); this.hud.on = false; this.hud.update(0, this.inp, []); this.banner.hide(); this.blob.visible = false; this.ring.visible = false; for (const m of this.shadows) m.visible = false;
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
  private labOn = false; private movesPreviewOn = false; private labCmp: BattleActor | null = null; private labDummy: Foe | null = null; private labHome: () => void = () => {};
  lab() {
    this.labOn = true;
    const fine = HEROES.find(d => d.id === DEFAULT_HERO); if (fine) this.wearing = fine;
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
  /** act-140 全招式预览页 (movesPreview.ts, user: 「全招式的预览做一个页面放桌面上，我想看。」):
   *  open sunlit courtyard, real hero combat engine & real sparring foes in clean formations, full 4-weapon / 12-manual / 16-boon interactive preview */
  movesPreview() {
    this.labOn = true; this.movesPreviewOn = true;
    const fine = HEROES.find(d => d.id === DEFAULT_HERO); if (fine) this.wearing = fine;
    this.enterYard(); this.banner.hide(); this.hud.on = false; this.noTalk = true;
    const HOME = { x: -2.2, z: 2.2, yaw: Math.PI / 2 };
    let curWeapon: WeaponId = 'hanshan';
    let curLv = 3;

    const clearEntities = () => {
      this.cancelQte(); this.duel?.newRoom();
      for (const f of this.foes) { f.tele?.dispose(); for (const e of f.extra) e.t.dispose(); f.a.dispose(); }
      this.foes.length = 0;
      for (const a of this.arrows) a.kill(); this.arrows.length = 0;
      for (const w of this.waves) w.kill(); this.waves.length = 0;
      for (const d of this.darts) d.kill(); this.darts.length = 0;
      this.pinned.clear(); this.dropDecoy();
      this.decoyCd = 0; this.parryCd = 0; this.dodgeCd = 0;
    };

    const spawnSpar = (x: number, z: number, opts: { hp?: number; maxHp?: number; immortal?: boolean; passive?: boolean } = {}) => {
      const f = spawnFoe('hj_blade', V3(x, 0, z), V3(HOME.x, 0, HOME.z));
      f.st = 'move'; f.t = 0; f.dur = 0;
      const maxHp = opts.maxHp ?? 260;
      f.maxHp = maxHp; f.hp = opts.hp ?? maxHp;
      if (opts.passive !== false) {
        f.d = { ...f.d, speed: 0 };
        f.cd = 99;
        f.mem.passive = true;
      } else {
        f.cd = 0.25;
      }
      if (opts.immortal !== false) f.mem.immortal = true;
      this.foes.push(f);
      return f;
    };

    const resetStage = (setup: StageSetup = {}) => {
      const h = this.hero; if (!h) return;
      clearEntities();
      if (setup.weapon) curWeapon = setup.weapon;
      if (setup.weaponLv != null) curLv = setup.weaponLv;
      h.forceFree(); h.clearInput();
      h.pos.set(HOME.x, 0, HOME.z); h.vel.set(0, 0, 0); h.y = 0; h.vy = 0;
      h.a.place(h.pos.clone(), HOME.yaw); h.a.yaw = HOME.yaw;
      h.maxHp = TUNE.heroHp; h.hp = setup.heroHp ?? TUNE.heroHp;
      h.qi = setup.qi ?? 3; h.dashCd = 0; h.dartCd = 0; h.dartAmmo = TUNE.dartCharges; h.dartReload = 0;
      h.inv = 0; h.counterT = 0; h.parryT = 0;
      this.intent = setup.intent ?? 0; this.hud.intent = this.intent;
      this.perks = { moves: { ...ALL_MOVES }, owned: {} };
      if (setup.boons) {
        for (const [id, tier] of Object.entries(setup.boons)) {
          if (tier != null) this.perks.owned[id] = tier;
        }
      }
      h.moves = this.perks.moves; h.perks = this.perks;
      h.applyWeapon(curWeapon, curLv);
      h.freeFlash = !!setup.freeFlash;
      this.banner.hide(); this.hud.on = false;

      const form = setup.formation ?? 'line';
      if (form === 'line') {
        spawnSpar(HOME.x + 1.80, HOME.z);
        spawnSpar(HOME.x + 3.55, HOME.z);
        spawnSpar(HOME.x + 5.30, HOME.z);
      } else if (form === 'ring') {
        spawnSpar(HOME.x + 2.15, HOME.z);
        spawnSpar(HOME.x - 2.15, HOME.z);
        spawnSpar(HOME.x, HOME.z - 2.15);
        spawnSpar(HOME.x, HOME.z + 2.15);
      } else if (form === 'close') {
        spawnSpar(HOME.x + 1.25, HOME.z);
        spawnSpar(HOME.x + 3.15, HOME.z);
        spawnSpar(HOME.x + 1.75, HOME.z + 1.55);
      } else if (form === 'far') {
        spawnSpar(HOME.x + 3.9, HOME.z);
        spawnSpar(HOME.x + 3.6, HOME.z - 1.5);
        spawnSpar(HOME.x + 3.6, HOME.z + 1.5);
      } else if (form === 'lowhp') {
        spawnSpar(HOME.x + 1.75, HOME.z, { hp: 8, maxHp: 60, immortal: false });
        spawnSpar(HOME.x + 3.55, HOME.z);
        spawnSpar(HOME.x + 2.45, HOME.z + 1.55);
      } else if (form === 'decoy') {
        spawnSpar(HOME.x + 2.5, HOME.z - 0.75, { passive: false, immortal: true });
        spawnSpar(HOME.x + 2.5, HOME.z + 0.75, { passive: false, immortal: true });
      }
    };

    after(0.1, () => resetStage({ weapon: 'hanshan', weaponLv: 3, formation: 'line' }));
    openMovesPreview({
      resetStage,
      weapon: () => curWeapon,
      setWeapon: (id, lv = 3) => { curWeapon = id; curLv = lv; this.hero?.applyWeapon(id, lv); },
      hold: (b, sec) => this.inp.hold(b, sec),
      stick: (x, y, sec) => this.inp.push(x, y, sec),
      arrow: d => { const h = this.hero, f = h.a.fwd(), p = h.pos.clone().addScaledVector(f, d).setY(1.25); this.arrows.push(new Arrow(p, Math.atan2(-f.x, -f.z), 8)); },
      hero: () => ({ x: this.hero.pos.x, y: this.hero.y, z: this.hero.pos.z, yaw: this.hero.a.yaw }),
      cam: (b, l, fov = 34) => { this.camOverride = b ? { base: V3(b[0], b[1], b[2]), look: V3(l![0], l![1], l![2]), fov } : null; },
      setSpeed: s => { FX.speed = s; },
      speed: () => FX.speed,
    });
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
  private yardVisit = 0;
  private yardAtmo: { time: HideoutTime; weather: HideoutWeather } = { time: 'dusk', weather: 'clear' };
  /** the training yard: dummies, summon slabs, the costume rack, the way out to a run */
  enterYard(atmo?: { time: HideoutTime; weather: HideoutWeather }) {
    this.donningHat = false; this.departAnim = null; this.camOverride = null;
    if (atmo) {
      this.yardAtmo = atmo;
    } else {
      const p = profile();
      const mood = activeHideoutMood(p, this.dbgAllWeapons);
      if (p.hideoutMood && mood.id !== 'default') {
        this.yardAtmo = { time: mood.time as HideoutTime, weather: mood.weather as HideoutWeather };
      } else {
        const runs = p.runs;
        if (runs <= 0 && this.yardVisit === 0) this.yardAtmo = HIDEOUT_ATMOS[0];
        else this.yardAtmo = HIDEOUT_ATMOS[(runs + this.yardVisit) % HIDEOUT_ATMOS.length];
      }
      this.yardVisit++;
    }
    this.syncCollectorVisuals();
    this.unscaleFoes();
    TUNE.dartCharges = 3; TUNE.aggression = 0.85;
    this.mods = { dmgMul: 1, critBonus: 0, dartBonus: 0, startCoins: 0, hpBonus: 0, deathDefy: 0, startIntent: 0, windupMul: 1, startManual: false, poiseHeal: 0, firstStrikeBonus: 0, styleBonus: 0, dashCdMul: 1, counterBonus: 0, markedDmgBonus: 0, poiseDmgMul: 1, rareOddsBonus: 0, interestRate: 0 };
    this.resetCombo(); this.hud.synergies = [];
    if (this.banked) {
      const b = this.banked, alive = this.lastWon; this.banked = null;
      const [title, sub] = HAUL[alive ? 0 : 1], prof = profile();
      const canUp = hasAffordable(prof) || hasMirrorAffordable(prof);
      const line = canUp ? msg`${format(sub, { iron: b.iron, herb: b.herb })} · 古窑可强化` : format(sub, { iron: b.iron, herb: b.herb });
      after(0.6, () => this.banner.show(title, line, 3.0, '#ffd27a'));
    }
    this.musicHold = null;
    if (this.justDied) { this.justDied = false; this.pendingDeathTalk = true; after(0.3, () => cue('stingRevive', 1)); }
    this.intent = 0; this.intentVal = 0; this.hud.intent = 0;
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
    this.donningHat = false; this.departAnim = null; this.departZoom = 0; this.releaseCutCam(true);
    this.hud.on = true;
    if (this.hero) this.hero.scriptPose = null;
    const fromYard = this.room < 0 && OPT.roomAhead;
    this.maps = [];
    this.intent = 0; this.intentVal = 0; this.lastIntentAt = -9; this.poiseHealAt = -9; this.bloodHealAt = -9; this.roomDrinkHeal = 0; this.shadowEchoAt = -9; this.hud.intent = 0;
    this.perks = newPerks(); this.room = 0; this.kills = 0; this.recent = []; this.demo.stop(); this.syncMarks();
    this.plan = (build && fromYard ? this.ahead[0]?.plan : null) ?? firstRoom(Math.random); this.visited = []; this.coins = 0; this.locale = this.plan.locale;
    // 11-18 一局五关: the first region; the TUNE values the regions scale from (the tune panel's, as the run starts)
    this.region = 0; this.bosses = 0; this.regionIn = false; this.baseFoe = { hp: TUNE.enemyHp, dmg: TUNE.enemyDmg, aggression: 0.95, calm: TUNE.atkCalm, attackers: TUNE.maxAttackers };
    // act-20 / act-118: the hideout's upgrades & 碑铭潜能 (meta.ts) for this run
    this.fightLog = { t0: clock.time, dmg: {}, bosses: [], taken: { n: 0, sum: 0, byBoss: 0 }, healed: 0 };
    this.mods = runMods(profile()); this.defy = this.mods.deathDefy; this.usedRevive = false; this.eliteKills = 0; this.bossKilled = false; this.usedPoolBosses.clear();
    this.genBlessings.clear(); this.ksShield = 0; this.ksRevenge = false; this.intentBonusAcc = 0;
    this.resetCombo(); this.hud.synergies = [];
    // 杜五's provisions (one run): 炙肉胡饼 +15 血上限, 五铢钱囊 40 铜钱, 瓦壶烈酒 the first blow costs nothing
    // + 竹溪药圃 harvested elixir buff (温脉药汤 / 玄芝丹气) + B3 杜五再温老酒 + B4 问卦定向流派
    { const p = profile(), meal = p.meal, gBuff = p.garden?.buff, a = ensureAds(p);
      const mealUp = !!a.mealUpgraded;
      this.divineSchoolRun = (a.divineSchool as Archetype | null) ?? null;
      p.meal = undefined; if (p.garden) p.garden.buff = null; a.mealUpgraded = false; a.divineSchool = null;
      saveProfile();
      this.wine = meal === 'wine' || mealUp;
      this.coins = this.mods.startCoins + (meal === 'purse' ? 40 : 0) + (mealUp ? 40 : 0);
      if (meal === 'feast') this.mods.hpBonus += 15;
      if (mealUp) this.feed.push('boon', () => '老酒豪华行囊 · 钱+40 护酒', 0, 'ad:meal');
      if (this.divineSchoolRun) {
        const ai = ARCH_INFO[this.divineSchoolRun];
        if (ai) this.feed.push('boon', () => msg`卦象定向 · 首战必出${ai.name}珍品`, 0, 'ad:divine');
      }
      if (gBuff === 'lotus') this.feed.push('boon', () => '温脉药汤 · 血+18 铜钱+35', 0, 'gd:lotus');
      else if (gBuff === 'xuanzhi') this.feed.push('boon', () => '玄芝丹气 · 绝品缘 满杀气', 0, 'gd:xuanzhi'); }
    TUNE.heroHp = 100 + this.mods.hpBonus; TUNE.dartCharges = 3 + this.mods.dartBonus; TUNE.aggression = 0.95 / this.mods.windupMul;
    this.baseFoe.aggression = TUNE.aggression; this.scaleFoes(0);
    const loading = build ? this.buildRoom(true) : undefined;   // (11-18: a jump to another region's room builds that one instead)
    const pick = () => { if (this.mods.startManual) after(1.4, () => { if (this.room === 0) void this.manualPick(); }); };
    if (loading) return loading.then(pick);
    pick();
  }
  /** put on another costume (the rack, or __dh.wear) and remember it */
  private wear(d: ModelDef) {
    this.wearing = d; try { localStorage.setItem('act.hero7', d.id); } catch { /* storage blocked */ }
    if (this.hud.flask instanceof IronHp) this.hud.flask.setFace(d.id); else HP_FACE.id = d.id;
    if (this.hero) { this.hero.setModel(d); this.syncHeroHat(); }
  }
  /** Conical bamboo hat comes OFF while healing/resting in the kiln (PRO_WAKE, hideout yard & Ending C), and goes cleanly BACK ON when departing or fighting */
  private hatForcedOff = false;
  private donningHat = false;
  private syncHeroHat() {
    if (this.donningHat) return;
    const hat = this.hero?.a?.bones?.hat;
    const resting = this.hatForcedOff || (!this.labOn && (this.phase === 'yard' || (this.room < 0 && (this.phase === 'talk' || this.phase === 'pick'))));
    if (hat) hat.visible = !resting;
    if (this.dialogue) this.dialogue.heroHat = !resting && !!hat;
  }
  private dropAhead(keep?: AheadRoom) {
    for (const job of this.ahead) {
      if (job === keep) continue;
      if (job.ready) job.ready.prep.drop(); else job.steps.return(undefined as never);
    }
    this.ahead = [];
  }
  private queueAhead(yard: boolean) {
    this.dropAhead();
    if (!OPT.roomAhead || this.prologue || this.viewSpec || this.forceShape || this.forceMap || this.forceSpec || this.noArena) return;
    for (const plan of yard ? [firstRoom(Math.random)] : this.nextRooms) {
      const region = yard ? 0 : plan.region ?? this.region;
      const first = yard || region !== this.region, room = first ? 0 : this.room + 1;
      const next = onward(room, [...(first ? [] : this.visited), plan.type], region, this.runCtx());
      const steps = prepRoomSteps({ isYard: false, locale: plan.locale, plan, room, region, regionSpec: REGIONS[region].spec,
        recent: yard ? [] : this.recent.slice(), shapes: yard ? [] : this.shapes.slice(), maps: yard ? [] : this.maps.slice(),
        seed: Date.now() % 100000 + room * 977, nextRooms: next, noArena: false, forceSpec: null, viewSpec: null }, true);
      this.ahead.push({ plan, region, room, next, steps });
    }
  }
  private workAhead() {
    if (!OPT.roomAhead) { this.dropAhead(); return; }
    // Once she has stepped through, the selected room has the whole budget until the blade takes over.
    const until = performance.now() + (this.phase === 'leaving' ? 8 : 4);
    let nearer = -1;
    if (this.phase === 'doors' && this.doors.length === 2 && this.ahead.length === 2) {
      const p = this.hero.pos, left = this.doors[0].ex.sign, right = this.doors[1].ex.sign;
      const dl = Math.hypot(left.x - p.x, left.z - p.z), dr = Math.hypot(right.x - p.x, right.z - p.z);
      if (Math.abs(dl - dr) > 1.5) nearer = dl < dr ? 0 : 1;
    }
    do {
      // Keep both roads moving. When she approaches one sign, give it three slices for each slice on the other.
      const turn = this.aheadTurn++;
      const index = nearer < 0 ? turn % this.ahead.length : turn % 4 === 3 ? 1 - nearer : nearer;
      let job: AheadRoom | undefined = this.ahead[index];
      if (job.ready || job.wait) job = this.ahead.find(j => !j.ready && !j.wait);
      if (!job) break;
      try { advanceAhead(job, until); }
      catch (error) {
        console.warn('[stage] background build failed', error);
        this.dropAhead(); break;
      }
    } while (performance.now() < until && this.ahead.some(j => !j.ready && !j.wait));
  }
  private buildRoom(first: boolean) { return runRoomBuild(this.roomSteps(first)); }
  private *roomSteps(first: boolean): Generator<void | Promise<void>, void> {
    if (this.dialogue.on) this.dialogue.skipAll();
    this.camOverride = null;
    this.hideWorldPlates();
    blood.clear();
    slashArc.clear();
    this.cancelQte();
    this.splitK = 0; this.impactK = 0; GRADE.split = 0; GRADE.impact = 0; GRADE.bloodVig = 0;
    this.cuiInspect.stop(); this.talkTick = null;
    if (this.allyGen) { this.allyGen.dispose(); this.allyGen = null; }
    if (this.generalEvent) { this.generalEvent.dispose(); this.generalEvent = null; }
    this.duelGen = null;
    if (this.endCui) { this.endCui.dispose(); this.endCui = null; }
    this.duel?.newRoom(); for (const f of this.foes) f.a.dispose(); this.foes.length = 0; for (const a of this.arrows) a.kill(); this.arrows.length = 0; for (const w of this.waves) w.kill(); this.waves = []; for (const d of this.darts) d.kill(); this.darts = []; this.entering.length = 0; this.clearBossDrops(); this.clearFleeing(); this.bossDefeated = false; this.poolBossRoom = false; this.kneelingBoss = null; this.wavePending = 0; this.waveGen++; this.bossIntroActive = false;
    this.falling = [];
    this.gates?.dispose(); this.gates = null; this.pieces?.dispose(); this.pieces = null; this.leaves?.dispose(); this.leaves = null; this.clearNpcs(); this.clearRoadActors();
    for (const d of this.doors) d.g.parent?.remove(d.g); this.doors = []; this.stations?.dispose(); this.stations = null; this.coinsFx.clear();
    this.yard?.dispose(); this.yard = null; this.exitSign?.parent?.remove(this.exitSign); this.exitSign = null; this.barks?.clear();
    // act-161: her max health carries from room to room like her health does (it was reset to the run's start here, so a +12 door, a chest, the wine were one small heal)
    const hp = first || !this.hero ? TUNE.heroHp : this.hero.hp, maxHp = first || !this.hero ? TUNE.heroHp : Math.max(TUNE.heroHp, this.hero.maxHp), qi = first || !this.hero ? 0 : this.hero.qi;
    this.hero?.a.dispose();
    const isYard = this.room < 0;
    this.bossDefeated = false; this.poolBossRoom = false;
    if (!isYard && this.plan && !this.viewSpec) this.visited.push(this.plan.type);
    const job = OPT.roomAhead && !this.viewSpec && !this.forceSpec && !this.forceShape && !this.forceMap && !this.noArena
      && (!__WX__ || bladeWorking()) ? this.ahead.find(j => j.plan === this.plan && j.region === this.region && j.room === this.room) : undefined;
    this.dropAhead(job);
    if (!isYard && !this.prologue && this.plan?.type === 'boss' && isBossRoom(this.region, this.room)) {
      const resolved = resolveBossRoomWaves(this.plan.waves, this.region, profile().seen, this.usedPoolBosses);
      if (resolved.replaced) {
        this.plan = { ...this.plan, waves: resolved.waves };
        this.poolBossRoom = true;
      }
    }
    this.nextRooms = job?.next ?? (!isYard && this.plan && !this.viewSpec ? onward(this.room, this.visited, this.region, this.runCtx()) : []);
    if (this.prologue === 1 && !this.viewSpec) this.nextRooms = [PRO_BOSS]; else if (this.prologue === 2) this.nextRooms = [];   // act-29
    // act-34: the place itself — built ahead of time when it can be (the title builds a new game's first room while it loads), else now
    // (11-18: a region's own look — 下邳 is always winter — unless the prologue or a view asks otherwise)
    const rspec = !isYard && !this.prologue ? REGIONS[this.region]?.spec ?? null : null;
    const want: RoomIn = { isYard, room: this.room, recent: this.recent, locale: this.locale, plan: this.plan, nextRooms: this.nextRooms, viewSpec: this.viewSpec, forceSpec: this.forceSpec, noArena: this.noArena, shape: this.forceShape, shapes: this.shapes, seed: this.forceSeed, map: this.forceMap, maps: this.maps, region: this.prologue ? undefined : this.region, regionSpec: rspec, yardAtmo: isYard ? this.yardAtmo : undefined };
    const ready = this.pre && !isYard && !this.viewSpec && this.prologue === 1 && this.room === 0 && this.pre.locale === this.locale ? this.pre : null;
    if (this.pre && this.pre !== ready) this.pre.prep.drop();
    this.pre = null;
    const t0 = performance.now();
    if (job) while (!job.ready) {
      if (job.wait) yield job.wait;
      advanceAhead(job);
      if (!job.ready) yield;
    }
    // (the prologue's places: the one built behind the scene before, when it is the one asked for)
    const proTag = this.proTag(isYard), pro = proTag && this.proAhead?.tag === proTag && (!__WX__ || bladeWorking() || this.proAhead.ready) ? this.proAhead : null;
    if (this.proAhead && this.proAhead !== pro) this.dropPro();
    this.proAhead = null;
    if (pro) while (!pro.ready) {
      if (pro.wait) yield pro.wait;
      advanceAhead(pro);
      if (!pro.ready) yield;
    }
    const P = job?.ready ?? pro?.ready ?? ready ?? (yield* prepRoomSteps(want)); this.buildMs = Math.round(performance.now() - t0);
    setStage(P.big, P.k);
    const spec = P.spec; this.recent.push(spec); this.spec = spec; this.pools = LOCALES[spec.locale]?.pools?.(spec.seed) ?? [];
    if (P.arena?.shape?.fixed) {
      this.locale = spec.locale;
      if (this.plan) this.plan = { ...this.plan, locale: spec.locale };
    }
    audio.setRoom(ROOM_VERB[this.locale] ?? (isYard ? ROOM_VERB.yard : [0.6, 0.12]));
    this.layout = P.layout; this.arena = P.arena; if (P.report) this.lastReport = P.report;
    // 11-18 屋子形态: the floor as a grid (the clamp, the foes' way round, the pits); the rectangle rooms have none
    this.grid = P.fixtures ? P.fixtures.grid : P.arena?.shape ? new FloorGrid(P.arena.shape) : null;
    { const g = this.grid; blood.skip = g ? (x, z) => g.at(x, z) === PIT : null; }
    if (P.arena?.shape && !this.viewSpec) this.shapes.push(P.arena.shape.id);
    if (P.arena?.shape?.fixed && !this.viewSpec) this.maps.push(P.arena.shape.fixed.id);
    if (isYard) { this.shapes = []; this.maps = []; }
    const big = P.big;
    this.stage = P.prep.attach();
    audio.setWeatherSound(spec.weather === 'storm' ? 'storm' : spec.weather === 'rain' ? 'rain' : 'none');
    yield;
    if (isYard) Object.assign(PLAY, HIDEOUT.floor);   // act-20: the hideout 断碑古窑 (hideout.ts) is the yard now — its own stage and floor
    this.solids.clear(); this.props?.dispose(); this.props = null; this.botWp = 0;
    if (P.fixtures) this.solids = P.fixtures.solids;
    if (isYard) this.syncHideoutSolids();
    if (this.arena && this.stage) {
      // act-20: the cover pieces are breakable (Breakables builds them and their solids)
      if (P.fixtures) { this.props = P.fixtures.props; this.stage.root.add(this.props.root); batchActor(this.props.root); }
      else { this.props = new Breakables(this.stage.root, this.solids); yield* this.props.buildSteps(this.arena.props, this.arena.covers); }
      // act-37: the snowy night's braziers (the prologue's village and temple): four warm points round the floor, where it is free
      // 11-18 (用户：「场景要有差异」): 崔府各间的灯由场景摆，雪夜的通用火盆会盖住冰色和石灯。
      if (spec.weather === 'snow' && spec.time === 'night' && !spec.locale.startsWith('cx_')) for (const [x, z] of [[PLAY.x0 + 1.6, PLAY.z0 + 1.8], [PLAY.x1 - 1.6, PLAY.z0 + 1.8], [PLAY.x0 + 1.6, PLAY.z1 - 3.2], [PLAY.x1 - 1.6, PLAY.z1 - 3.2]]) {
        const ok = (px: number, pz: number) => this.solids.free(px, pz, 0.6, 0.3) && (!this.grid || this.grid.clear(px, pz, 0.7));
        let px = x, pz = z; for (let t = 0; t < 8 && !ok(px, pz); t++) { px += (x < 0 ? 0.7 : -0.7); pz += 0.4; }
        if (!ok(px, pz)) continue;
        this.stage.root.add(brazier(px, pz)); this.solids.add({ kind: 'prop', shape: 'circle', x: px, z: pz, r: 0.42 });
      }
      yield;
      if (P.fixtures) { this.gates = P.fixtures.gates; this.stage.root.add(this.gates.root); }
      else { this.gates = new Gates(this.stage.root); yield* this.gates.buildSteps(this.arena); }
      // 11-18 定死的屋子: the moving pieces, and the floor's pieces fought in turn (S's first, then on through its doors)
      this.pieces = null; this.stageZ = []; this.stageOf = []; this.waitZone = -1; this.rewardsGot = 0;
      yield;
      const fsh = this.arena.shape;
      if (fsh?.fixed && this.grid) {
        const built = P.fixtures?.pieces;
        if (built) this.stage.root.add(built.root);
        const pieces = this.pieces = built ?? new RoomPieces(this.stage.root, fsh, this.grid, this.arena.style, spec.seed, OPT.slicedRoom, Math.floor(Math.random() * 1e9));
        if (!built && OPT.slicedRoom) yield* pieces.buildSteps(this.arena.style, spec.seed);
        this.props.onStrike = s => this.pieces?.strike(s);
        // (the bell frames and the rope posts stand in the way like any post)
        for (const m of fsh.fixed.marks) if (m.kind === 'bell' || m.kind === 'rope' || m.kind === 'wheel') this.solids.add({ kind: 'prop', shape: 'circle', x: m.x, z: m.z, r: m.kind === 'rope' ? 0.3 : 0.42 });
        const seen = [pieces.zoneAt(fsh.enter[0], fsh.enter[1])];
        while (seen.length < fsh.fixed.stages) {
          const cur = seen[seen.length - 1], nx = pieces.pieces.filter(q => q.kind === 'door' && q.sides.includes(cur)).map(q => q.sides[0] === cur ? q.sides[1] : q.sides[0]).filter(z => z >= 0 && !seen.includes(z));
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
    // (11-18 屋子形态: a shaped room has its own way in; PRO_BOSS in cx_court starts further forward clear of the south gatehouse beam!)
    const ent = this.arena?.shape?.enter[0] ?? 0;
    const entZ = this.arena?.shape?.fixed ? this.arena.shape.enter[1] : (this.prologue === 2 || spec.locale === 'cx_court') ? SZ(1.6) : SZ(5.0);
    yield;
    this.roomDrinkHeal = 0;
    // act-152: hideout uses the equipped weapon's true base moveset (no longer auto-granting run-only 刀谱 manuals unless dbgAllMoves is on)
    this.hero = new Hero(isYard ? V3(HIDEOUT.spawn[0], 0, HIDEOUT.spawn[1]) : V3(ent, 0, entZ), this.wearing); this.hero.moves = this.dbgAllMoves ? ALL_MOVES : this.perks.moves; this.hero.perks = this.perks; this.hero.hp = Math.min(hp, maxHp); this.hero.maxHp = maxHp;
    { const p = profile(), wid = this.currentWeaponId(p); this.hero.applyWeapon(wid, weaponLevel(p, wid)); }
    this.syncHeroHat();
    // (11-20: a new place starts still — a stick / key still held from the last one counts only once let go)
    this.inp.latch();
    this.hero.qi = isYard ? Hero.QI_MAX : Math.min(Hero.QI_MAX, Math.max(qi, TUNE.qiStart + (this.mods.startIntent > 0 ? 0.5 : 0)));   // (11-17 气: carried on; 出鞘杀气 also grants +0.5 starting qi)
    this.syncHeroMods(); this.resetCombo();
    this.hero.a.yaw = isYard ? -0.6 : Math.PI;
    // act-125: Keepsake room-entry triggers (孙媪百草香囊回血 / 杜五瓦壶老酒首战护盾 / 陆逊江东火折加火油坛)
    if (!isYard && !this.prologue) {
      const p = profile(), kid = equippedKeepsake(p, this.dbgAllWeapons);
      if (kid) {
        const star = keepsakeStar(p, kid), ks = KEEPSAKES[kid];
        if (kid === 'sunao' && this.room > 0) {
          const heal = Math.round(this.hero.maxHp * ks.vals[star - 1] / 100);
          const was = this.hero.hp; this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + heal);
          this.healFeed(was);
        }
        if (kid === 'duwu' && this.room === 0) this.ksShield = ks.vals[star - 1];
        if (kid === 'luxun' && (this.plan?.type === 'fight' || this.plan?.type === 'elite') && this.props) {
          const count = ks.vals[star - 1];
          for (let j = 0; j < count; j++) {
            const ox = (j - (count - 1) / 2) * 3.8, oz = -1.5 + (j % 2) * 2.4;
            if (this.solids.free(ox, oz, 0.7, 0.3) && (!this.grid || this.grid.clear(ox, oz, 0.7))) this.props.add('oil', ox, oz);
          }
        }
      }
    }
    this.hud.flask.set({ hp: this.hero.hp, maxHp });
    this.cam.set(this.hero.pos.x, 0, this.hero.pos.z); shot('act', () => this.camPose(), { cut: true, speed: 8 });
    after(0.05, () => this.music());
    if (isYard) { yield* this.openYard(); return; }
    if (this.viewSpec) { this.phase = 'yard'; this.log.push(`view ${spec.locale} ${spec.layout} ${spec.time}`); return; }
    this.phase = 'intro'; this.wave = 0;
    if (this.mods.startIntent > 0 && this.intent < this.mods.startIntent) { this.intent = this.mods.startIntent; this.intentVal = Math.max(this.intentVal, this.intent); this.hud.intent = this.intent; }
    // act-118 聚财 (碑铭潜能) — act-161: paid once on stepping into a new region (10 / 18 / 25% of her purse, 80 / 140 / 200 at most);
    // it used to compound every room with no cap (25%: hundreds of thousands by the last region)
    if (!this.prologue && this.room === 0 && this.region > 0 && this.mods.interestRate > 0 && this.coins > 0) {
      const top = this.mods.interestRate >= 0.24 ? 200 : this.mods.interestRate >= 0.17 ? 140 : 80;
      const gain = Math.max(1, Math.min(top, Math.round(this.coins * this.mods.interestRate)));
      this.coins += gain; this.feed.push('coins', n => msg`聚财 +${n}`, gain);
    }
    const name = LOCALES[this.locale]?.name ?? '';
    // the very first room: the controls once, in the banner (no key hints on screen afterwards)
    const dev = this.inp.lastDevice, hint = !this.hinted ? (isTouchLayout(dev) ? '左边拖动走 · 斩 / 按住蓄力 · 冲 · 跳 · 镖'
      : dev === 'pad' ? msg`左摇杆 走 · ${actPad('attack')} 斩（按住蓄力）· ${actPad('jump')} 跳 · ${actPad('dash')} 冲刺 · ${actPad('special')} 飞镖`
      : msg`WASD 走 · ${actKey('attack')} 斩（按住蓄力）· ${actKey('jump')} 跳 · ${actKey('dash')} 冲刺 · ${actKey('special')} 飞镖`) : '';
    this.hinted = true; void hint;   // (11-19 新手引导: the controls are taught in the prologue's fights, not in a banner)
    const info = roomInfo(this.plan?.type ?? 'fight', this.region);
    // 11-18 一局五关: walking into a later region's first room, its name and line first (2.6 s), then the room's own banner
    if (!this.prologue && (this.regionIn || (language === 'en' && this.region === 0 && this.room === 0))) {
      this.regionIn = false; const rb = regionBanner(this.region);
      this.banner.show(rb.title, rb.sub, 2.6, '#ffe2b0');   // (act-50 用户：「获胜的时候会放一个短乐段，我不想要那个声音」: the old jingle is gone everywhere)
      after(2.7, () => { if (this.phase === 'intro' || this.phase === 'fight') this.banner.show(msg`第一间 · ${info.name}`, '', 1.4); });
    } else if (!this.prologue) this.banner.show(msg`第 ${language === 'en' ? this.room + 1 : '一二三四五六七八'[this.room] ?? this.room + 1} 间 · ${info.name}`, '', 1.6);   // (11-19 用户：「每次进房间横幅上都有个很小的字，看得眼睛疼」: the title only)
    // the rooms without a fight: the stations stand ready and the roads are open at once
    if (this.plan && (this.plan.type === 'shop' || this.plan.type === 'rest' || this.plan.type === 'boon')) {
      this.stations = new Stations(this.stage!.root, this.arena?.shape?.fixed?.stations);
      if (this.plan.type === 'shop') {
        const pm = shopPriceMul(this.region);
        const scaledPrices = {
          boon: Math.round(PRICES.boon * pm), heal: Math.round(PRICES.heal * pm), sharpen: Math.round(PRICES.sharpen * pm),
          vigor: Math.round(PRICES.vigor * pm), satchel: Math.round(PRICES.satchel * pm),
        };
        this.stations.shop(scaledPrices, SHOP_SPECIALS[Math.floor(Math.random() * SHOP_SPECIALS.length)], !freshBoons(this.perks, this.hero?.weaponId).length);   // (act-163: no scroll stall for a full hand)
        const st = this.stations;
        after(0.65, () => {
          if (this.stations !== st || !st.merchant) return;
          const line = sayMerchant('greet');
          const m = st.merchant;
          (this.barks ??= new Barks(this.L)).say(() => m.head(), line);
        });
      }
      else if (this.plan.type === 'rest') {
        this.stations.rest();
        // act-154: Du Wu roadside campfire companionship in Acts 1 & 2 (once each, before he perishes in Act 3)
        const rKey = this.region === 0 ? 'duwu_road_1' : this.region === 1 ? 'duwu_road_2' : '';
        if (rKey && !isDuwuDead(profile()) && !profile().seen[rKey]) {
          this.mountDuwuRoad(this.region as 0 | 1);
        }
      }
      else this.stations.scroll(this.scrollGives() === 'up');
      this.log.push(`room ${this.room} ${this.plan.type} ${spec.locale}`);
      this.openDoors(true); return;
    }
    // act-125: Three Kingdoms Famous General Puzzle Encounter room ('event')
    if (this.plan && this.plan.type === 'event') {
      const h = this.hero; this.introT = 0;
      const runner = this.mountGeneralEvent(this.region);
      after(0.85, () => {
        if (!runner || this.hero !== h || this.phase !== 'intro' || this.generalEvent !== runner) return;
        this.phase = 'fight';
        void this.startGeneralEvent(runner);
      });
      this.log.push(`room ${this.room} event ${spec.locale}`);
      return;
    }
    if (!P.fixtures || !OPT.slicedRoom) yield* prepareFightModels(this.plan?.waves ?? []);
    yield;
    yield* prepareFight();
    // act-165: Prologue Cui Xuan forecourt (prologue === 2) opens DIRECTLY with the snowy west-wall vault on frame 0
    // — ZERO front-gate walk-in, ZERO 1.1s delay, ZERO teleport from floor to wall!
    if (this.prologue === 2 && this.plan?.waves?.[0]?.some(k => kindOr(k).kind === 'cx_boss')) {
      this.phase = 'fight';
      this.spawnWave();
      this.log.push(`room ${this.room} ${spec.locale} ${spec.layout} ${spec.time} ${this.arena?.shape?.id ?? 'square'}`);
      return;
    }
    // walk in from the front of the room, then the first wave
    const h = this.hero; this.introT = 0;
    after(1.1, () => {
      if (this.hero !== h || this.phase !== 'intro') return;
      this.phase = 'fight';
      if (!this.tryGeneralEncounter()) this.spawnWave();
    });
    this.log.push(`room ${this.room} ${spec.locale} ${spec.layout} ${spec.time} ${this.arena?.shape?.id ?? 'square'}`);
  }
  private eventChaseBackup: boolean | null = null;
  private mountGeneralEvent(ri: number): GeneralEventRunner | null {
    if (!this.stage) return null;
    const idx = Math.max(0, Math.min(GENERAL_EVENTS.length - 1, ri));
    const runner = new GeneralEventRunner(this.stage.root, idx, {
      heroPos: () => this.hero.pos,
      hurtHero: (dmg, from) => this.hurtHero(dmg, from),
      bark: (at, text) => { (this.barks ??= new Barks(this.L)).say(at, text); },
      banner: (title, sub, dur, col) => this.banner.show(title, sub, dur, col),
      pop: (text, at, col, accent) => { popPix(text, at, { tier: 'highlight', color: col ?? '#ffe8a8', accent: accent ?? '#ff8832', h: 0.84, life: 1.0 }); },
      spawnFoe: (kind, x, z, elite = false) => {
        const ko = kindOr(kind);
        const f = spawnFoe(ko.kind, V3(x, 0, z), this.hero.pos.clone(), elite || ko.elite);
        f.st = 'move';
        this.foes.push(f);
        return f;
      },
      spawnApproachFoe: (kind, fromX, fromZ, toX, toZ, elite = false) => {
        const ko = kindOr(kind);
        const from = V3(fromX, 0, fromZ), to = V3(toX, 0, toZ);
        const f = spawnFoe(ko.kind, from, to, elite || ko.elite);
        f.st = 'enter';
        this.foes.push(f);
        const dist = Math.max(1.2, from.distanceTo(to));
        this.entering.push({ f, from, crest: from.clone(), land: to.clone(), to, wall: 0, t: 0, perched: true, landed: true, posePhase: null, poseU: 0, rush: true, rushDur: Math.max(0.75, Math.min(1.8, dist / 4.8)) });
        return f;
      },
      addSolid: (x, z, hx, hz) => this.solids.add({ kind: 'cover', shape: 'box', x, z, hx, hz, slam: true }),
      removeSolid: s => { s.on = false; },
      foes: () => this.foes,
      hitFoe: (f, dmg, from, col) => {
        this.hitFoe(f, dmg, from, { knock: 0.9, heavy: dmg >= 16, kind: 'ally' });
        fxSparks(f.a.chest(), col, 8, 4);
      },
      clamp: (p, r) => this.clamp(p, r),
      addOilJar: (x, z) => { this.props?.add('oil', x, z); },
      grantChaseMove: on => {
        if (!this.hero) return;
        if (on) {
          if (this.eventChaseBackup === null) this.eventChaseBackup = !!this.hero.moves.chase;
          this.hero.moves.chase = true;
        } else if (this.eventChaseBackup !== null) {
          this.hero.moves.chase = this.eventChaseBackup;
          this.eventChaseBackup = null;
        }
      },
      onSolved: (meta, outcome) => { void this.finishGeneralEvent(meta, outcome); },
    });
    this.generalEvent = runner;
    warmLines(runner.meta.intro); warmLines(runner.meta.outro);
    return runner;
  }
  /** act-132: Launch the Three Kingdoms Famous General Trial (守 × 斗 × 猎 × 谋) */
  private async startGeneralEvent(arg: number | GeneralEventRunner) {
    const runner = typeof arg === 'number' ? this.mountGeneralEvent(arg) : arg;
    if (!runner || !this.stage || this.generalEvent !== runner) return;
    await this.cine(generalIntroShots(this.cineHost, runner.actor.home, runner.actor, runner.meta.eventTitle, runner.meta.id));
    if (this.generalEvent !== runner) return;
    await this.talk(runner.meta.intro);
    if (this.generalEvent !== runner) return;
    runner.begin();
  }
  private async finishGeneralEvent(meta: GeneralEventMeta, outcome: EventOutcome) {
    const runner = this.generalEvent; if (!runner) return;
    this.phase = 'pick';
    for (const a of this.arrows) a.kill(); this.arrows.length = 0;
    for (const f of this.foes) dropTeles(f);
    this.hitArcs.clear();
    runner.actor.play(new Action('salute', 1.0, 0.5));
    await this.talk(outcome.customOutro ?? meta.outro);
    if (this.generalEvent === runner) {
      fxSmoke(runner.actor.home.clone().setY(0.7), 0xd8d0c0, 12, { r: 0.7, spd: 1.2, up: 0.9, s: 0.4, life: 0.6 });
      runner.dispose();
      this.generalEvent = null;
    }
    this.foes = this.foes.filter(f => f.st !== 'dead');
    if (!outcome.won) {
      this.openDoors();
      return;
    }
    const p = profile();
    if (!p.genCleared) p.genCleared = {};
    p.genCleared[meta.id] = (p.genCleared[meta.id] ?? 0) + 1;
    const newlyUnlocked = unlockKeepsake(p, meta.keepsake);
    if (!newlyUnlocked && p.keepsakes) p.keepsakes[meta.keepsake] = (p.keepsakes[meta.keepsake] ?? 0) + 4;
    saveProfile();
    this.genBlessings.add(meta.id);
    if (outcome.bonusCoins && outcome.bonusCoins > 0) {
      this.coins += outcome.bonusCoins;
      this.feed.push('coins', n => msg`完美护民 +${n}`, outcome.bonusCoins);
    }
    const was = this.hero.hp;
    this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + Math.round(this.hero.maxHp * 0.28));
    this.healFeed(was); this.hud.flask.heal({ hp: this.hero.hp, maxHp: this.hero.maxHp });
    this.addIntent();
    const ks = KEEPSAKES[meta.keepsake];
    if (newlyUnlocked) {
      this.banner.show(msg`获赠信物 · ${ks.name}`, msg`附得【${meta.blessingName}】：${meta.blessingDesc}`, 2.6, ks.col);
      this.feed.push('boon', () => msg`信物 · ${ks.name}`, 0, 'ks:' + meta.keepsake);
    } else {
      this.banner.show(msg`名将加护 · ${meta.blessingName}`, msg`${meta.blessingDesc} · ${ks.name}历练+4`, 2.4, ks.col);
    }
    this.feed.push('boon', () => msg`加护 · ${meta.blessingName}`, 0, 'gb:' + meta.id);
    await new Promise(r => after(0.9, () => r(null)));
    await this.boonPick(outcome.bonusCoins ? [0.05, 0.50, 0.45] : [0.15, 0.60, 0.25]);
    this.openDoors();
  }
  /** act-147: Four Generals encounters removed from gameplay */
  private tryGeneralEncounter(): boolean {
    this.forceGeneral = null;
    return false;
  }
  /** act-114 交锋名将（吕布 / 夏侯惇）收招结算：绝不强杀历史名将，弹反两次/削血 25%/满 22 秒即收招对话 + 馈赠 */
  private async finishDuelGeneral() {
    const dg = this.duelGen; if (!dg || dg.done) return;
    dg.done = true;
    const f = dg.f, ri = dg.region, g = GENERAL_REGIONS[ri];
    dropTeles(f); f.attacking = false; f.lunge = null; f.vel.set(0, 0, 0); f.inv = 99;
    for (const a of this.arrows) a.kill(); this.arrows.length = 0;
    this.hitArcs.clear();
    hitstop(0.14); shake(0.32 * TUNE.shake); cue('parry', 1); cue('bladeRing', 0.9);
    fxRing(f.pos.clone().setY(0.9), 0xffe4a0, 2.4, { life: 0.45 } as never);
    fxSparks(f.a.chest(), 0xffffff, 22, 6);
    this.phase = 'pick';
    await new Promise(r => after(0.55, () => r(null)));
    f.a.yaw = Math.atan2(this.hero.pos.x - f.pos.x, this.hero.pos.z - f.pos.z);
    f.a.play(new Action('salute', 1.0, 0.5));
    await this.talk(GEN_AFTER[ri]);
    // Departure smoke puff & dispose
    fxSmoke(f.pos.clone().setY(0.6), g.id === 'lubu' ? 0xd83a28 : 0x585c68, 12, { r: 0.7, spd: 1.2, up: 0.9, s: 0.4, life: 0.6 });
    cue('whoosh', 0.7);
    f.a.dispose();
    this.foes = this.foes.filter(x => x !== f);
    this.duelGen = null;
    // Reward: heal 30% HP + full intent + boon pick
    const was = this.hero.hp;
    this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + Math.round(this.hero.maxHp * 0.3));
    this.healFeed(was); this.hud.flask.heal({ hp: this.hero.hp, maxHp: this.hero.maxHp });
    this.addIntent();
    this.banner.show(g.name, '交锋已罢 · 得其所赠', 1.6, '#ffe2a0');
    await this.boonPick();
    this.openDoors();
  }
  /** act-154 / act-181: spawn Du Wu & his grey donkey beside the Act 1/2 rest-room campfire as a non-blocking interactive companion
   *  (no forced 0.85s modal hijack that can collide with stations/doors/pause or interrupt the run's camp flow) */
  private mountDuwuRoad(ri: 0 | 1) {
    if (!this.stage) return;
    const c = this.arena?.shape?.fixed?.stations ?? [0, 0];
    // Stand clearly to the left of the campfire & clear of 裹伤调息's mat and wooden sign
    const dp = V3(c[0] - 2.95, 0, c[1] - 3.05);
    const ap = V3(c[0] - 4.15, 0, c[1] - 3.25);
    this.clamp(dp, 0.55); this.clamp(ap, 0.65);
    const dwYaw = Math.atan2(c[0] - dp.x, c[1] - dp.z);
    const dw = new BattleActor(HIDEOUT_PEOPLE.duwu);
    dw.place(dp, dwYaw); dw.yaw = dwYaw; trimShadows(dw.root, 4);
    this.stage.root.add(dw.root);
    const dsh = contactShadow(); dsh.scale.setScalar(0.45); dsh.position.set(dp.x, 0.025, dp.z);
    this.stage.root.add(dsh);

    const dkYaw = Math.atan2(dp.x - ap.x, dp.z - ap.z);
    const dk = new BattleActor(HIDEOUT_DONKEY);
    dk.place(ap, dkYaw); dk.yaw = dkYaw; trimShadows(dk.root, 3);
    this.stage.root.add(dk.root);
    const ash = contactShadow(); ash.scale.set(0.95, 1, 0.55); ash.position.set(ap.x, 0.025, ap.z);
    this.stage.root.add(ash);

    const exclaim = new THREE.Group();
    exclaim.add(npcExclaim());
    exclaim.position.set(dp.x, 2.25, dp.z);
    this.stage.root.add(exclaim);

    this.roadActors.push(dw, dk);
    this.roadShadows.push(dsh, ash);

    const rKey = ri === 0 ? 'duwu_road_1' : 'duwu_road_2';
    const lines = ri === 0 ? DUWU_ROAD_1 : DUWU_ROAD_2;
    warmLines(lines, 4);
    const rd = { ri, rKey, actor: dw, pos: dp.clone(), talked: false, talking: false, exclaim };
    this.roadDuwu = rd;
    const h = this.hero;
    // Gentle non-blocking greeting bark beside the campfire (same pattern as Traveling Merchant in shop rooms)
    after(0.65, () => {
      if (this.hero !== h || this.roadDuwu !== rd || rd.talked || rd.talking) return;
      if (this.phase !== 'doors' || this.isUiModalOpen() || bladeBusy()) return;
      const greet = ri === 0 ? '白哥，锅里温着热汤呢！' : '白哥，胡饼刚烤热乎！';
      (this.barks ??= new Barks(this.L)).say(() => dw.head(), greet);
    });
  }
  /** act-181: player-initiated roadside campfire talk with Du Wu (zero forced blocking, zero race with doors/stations/pause) */
  private async talkRoadDuwu() {
    const rd = this.roadDuwu, h = this.hero;
    if (!rd || !h || rd.talked || rd.talking) return;
    if (this.phase !== 'doors' || this.isUiModalOpen() || this.inCombat() || bladeBusy()) return;
    rd.talking = true;
    try {
      const lines = rd.ri === 0 ? DUWU_ROAD_1 : DUWU_ROAD_2;
      rd.actor.yaw = Math.atan2(h.pos.x - rd.pos.x, h.pos.z - rd.pos.z);
      await this.talk(lines);
      if (this.hero !== h || this.roadDuwu !== rd) return;
      rd.talked = true;
      if (rd.exclaim) rd.exclaim.visible = false;
      seeOnce(rd.rKey);
      saveProfile();
      const was = h.hp;
      h.hp = Math.min(h.maxHp, h.hp + Math.round(h.maxHp * 0.25));
      this.healFeed(was); this.hud.flask.heal({ hp: h.hp, maxHp: h.maxHp });
      cue('reveal', 0.65);
      if (rd.ri === 0) {
        this.coins += 25;
        this.feed.push('coins', n => msg`杜五的热汤 +${n}`, 25);
        this.banner.show('杜五的热汤', '恢复气血 · 另塞来 25 枚五铢钱', 2.2, '#ffd27a');
      } else {
        this.addIntent(1, true);
        this.banner.show('杜五的热胡饼', '恢复气血 · 杀气 +1', 2.2, '#ffd27a');
      }
    } finally {
      rd.talking = false;
    }
  }
  /** act-114 据点归来统一事件队列（断碑划名过场优先，其次杜五遗灶移交，再次战败安慰对白，绝不并发冲突） */
  private async hideoutArrive(cut: number, down: number) {
    if (this.phase !== 'yard' || this.inCombat() || this.isUiModalOpen() || this.donningHat || this.departAnim || bladeBusy() || this.prologue) return;
    const st = this.stele, h = this.hero, prof = profile();
    if (cut < down && st && h) {
      this.pendingDeathTalk = false;
      this.noTalk = true;
      for (let i = cut; i < down; i++) seeOnce(STRIKE_FLAG[i]);
      saveProfile();
      await this.cine(steleStrikeShots(this.cineHost, HIDEOUT.stele, () => {
        for (let i = cut; i < down; i++) st.strike(i);
      }), () => {
        for (let i = cut; i < down; i++) st.strike(i);
      });
      this.noTalk = false;
      if (this.hero === h && this.phase === 'yard' && !this.inCombat()) {
        await this.talk([{ who: 'jiangjin', text: STELE_TALK.strike[down - 1] ?? STELE_TALK.strike[0] }]);
      }
      if (!isDuwuDead(prof) || prof.seen['duwu_memorial_intro']) return;
    }
    // act-154: First kiln return after Du Wu dies at Xiapi — Sun Ao gently hands over his SE ration hearth
    if (isDuwuDead(prof) && !prof.seen['duwu_memorial_intro'] && this.hero === h && this.phase === 'yard' && !this.inCombat()) {
      this.pendingDeathTalk = false;
      seeOnce('duwu_memorial_intro'); saveProfile();
      this.noTalk = true;
      const sa = this.npcs.find(n => n.id === 'sunao');
      const saOrig = sa ? { x: sa.x, z: sa.z, yaw: sa.yaw } : null;
      if (sa) {
        sa.x = 7.05; sa.z = 6.95; sa.yaw = Math.atan2(HIDEOUT.people.duwu.x - sa.x, HIDEOUT.people.duwu.z - sa.z);
        sa.a.place(V3(sa.x, 0, sa.z), sa.yaw); sa.sh.position.set(sa.x, 0.025, sa.z);
      }
      const memCam = safeCam([5.3, 3.25, 10.6], [7.65, 0.85, 7.25], 36);
      this.camOverride = { base: V3(...memCam.pos), look: V3(...memCam.look), fov: memCam.fov };
      shot('act', () => this.camPose(), { cut: false, speed: 4.5 });
      await new Promise(r => after(0.65, () => r(null)));
      if (this.hero === h && this.phase === 'yard' && !this.inCombat()) await this.talk(DUWU_MEMORIAL_INTRO);
      this.camOverride = null;
      if (sa && saOrig) {
        sa.x = saOrig.x; sa.z = saOrig.z; sa.yaw = saOrig.yaw;
        sa.a.place(V3(sa.x, 0, sa.z), sa.yaw); sa.sh.position.set(sa.x, 0.025, sa.z);
      }
      this.noTalk = false;
      return;
    }
    if (this.pendingDeathTalk && this.hero === h && this.phase === 'yard' && !this.inCombat()) {
      this.pendingDeathTalk = false;
      const prog = hideoutProgress(prof, this.dbgAllWeapons);
      if (isDuwuDead(prof)) {
        const speakers = prog.forgeBuilt ? (['sunao', 'fengtiebi'] as const) : (['sunao'] as const);
        const who = speakers[Math.floor(Math.random() * speakers.length)];
        if (this.phase === 'yard') {
          if (who === 'sunao' && DEATH_SUNAO_AFTER_DUWU.length && Math.random() < 0.65) {
            await this.talk([{ who: 'sunao', text: DEATH_SUNAO_AFTER_DUWU[Math.floor(Math.random() * DEATH_SUNAO_AFTER_DUWU.length)] }]);
          } else {
            await this.talk(deathLine(who));
          }
        }
      } else {
        const speakers = prog.forgeBuilt ? (['duwu', 'sunao', 'fengtiebi'] as const) : (['duwu', 'sunao'] as const);
        const who = speakers[Math.floor(Math.random() * speakers.length)];
        if (this.phase === 'yard') await this.talk(deathLine(who));
      }
    }
  }
  private async debugSteleCut(n: number) {
    if (this.phase !== 'yard') await this.enterYard();
    const st = this.stele; if (!st) return;
    this.noTalk = true;
    await this.cine(steleStrikeShots(this.cineHost, HIDEOUT.stele, () => st.strike(n)), () => st.strike(n));
    this.noTalk = false;
    await this.talk([{ who: 'jiangjin', text: STELE_TALK.strike[n] ?? STELE_TALK.strike[0] }]);
  }
  private *openYard() {
    this.phase = 'yard'; this.wave = 0;
    // act-20: the hideout's 试剑坪 — four slabs call sparring partners, three dummies; no costume rack (her look is in 设置)
    const pk: Array<[EKind, string]> = [['hj_blade', '刀手'], ['hj_brute', '力士'], ['hj_archer', '弓手'], ['hj_boss', '渠帅']];
    const ring = HIDEOUT.dummies.reduce((a, d) => [a[0] + d[0] / HIDEOUT.dummies.length, a[1] + d[1] / HIDEOUT.dummies.length], [0, 0]);
    this.yard = new Yard(this.stage!.root, [], this.wearing, [0, 0], { pads: HIDEOUT.slabs.map(([x, z], i) => ({ x, z, kind: pk[i % pk.length][0], name: pk[i % pk.length][1] })), spawn: () => V3(ring[0] + (Math.random() - 0.5) * 2, 0, ring[1] - 1.2) });
    for (const [x, z] of HIDEOUT.dummies) { yield; const p = V3(x, 0, z), f = spawnFoe('dummy', p, V3(x, 0, z + 4)); f.st = 'move'; this.foes.push(f); }
    // act-135: progressive hideout companions & wings — runs=0 shows only 杜五 & 孙媪; 冯铁臂/卢昭/桓越 & new zones arrive via 落成工碑!
    const prog = hideoutProgress(profile(), this.dbgAllWeapons);
    yield* this.placeNpcs(prog.visibleNpcs.map(id => ({ id, ...HIDEOUT.people[id] })));
    // act-132 / act-135: only grant daily garden seeds once 竹溪药圃 has been constructed
    if (prog.gardenBuilt) {
      const { dailyGift } = ensureGarden(profile());
      if (dailyGift.length) { saveProfile(); this.feed.push('boon', () => '孙媪每日赠种 · 东桥药圃可栽', 0, 'gd:daily'); }
    }
    this.refreshHideoutProps();
    // the stele of names: a cut down each name she has killed; unified hideout arrival queue handles fresh cuts & defeat talks cleanly
    { const p = profile(), down = bossesDown(p.seen), cut = struckOnStele(p.seen);
      this.stele = new Stele(cut); this.stele.g.position.set(HIDEOUT.stele.x, 0, HIDEOUT.stele.z); this.stele.g.rotation.y = HIDEOUT.stele.yaw; this.stage!.root.add(this.stele.g);
      if (cut < down || this.pendingDeathTalk || (isDuwuDead(p) && !p.seen['duwu_memorial_intro'])) after(0.85, () => { void this.hideoutArrive(cut, down); }); }
    // act-37: the rack of thirty blades — one hangs for each taken back (a boss each; ending C hangs them all)
    { const p = profile(); this.stage!.root.add(rackBlades(p.seen['ending_c'] ? 30 : bossesDown(p.seen))); }
    // the way out: outer departure mountain road past the front gate, sign standing beside the far-end stone pier
    const gx = (HIDEOUT.exit.x0 + HIDEOUT.exit.x1) / 2;
    this.exitSign = makeSign('出发', { w: 1.3, h: 0.6, post: 0.95 }); this.exitSign.position.set(HIDEOUT.exit.x1 + 1.38, 0, HIDEOUT.exit.z - 0.95); this.stage!.root.add(this.exitSign);
    // South departure road extends seamlessly to the piers (z = 15.6) inside HIDEOUT.floor (z1 = 16.4); the door lane opens south
    // beyond the road end so walking out & back through the gate and mountain road is 100% two-way with zero one-way airwall!
    const ex = { ...exitInfo(this.layout!, 'back'), id: 'left' as const, dir: [0, 1] as [number, number], lane: { x0: HIDEOUT.exit.x0, x1: HIDEOUT.exit.x1, z0: PLAY.z1 - 0.8, z1: PLAY.z1 + 3.0 }, walk: [[gx, HIDEOUT.exit.z - 1.6], [gx, HIDEOUT.exit.z + 1.0]] as Array<[number, number]> };
    this.doors = [{ ex, g: new THREE.Group(), lift: 1 }];
    this.banner.show('断碑古窑', '', 1.6);
    this.log.push('yard');
    this.queueAhead(true);
  }
  /** act-114 helper: spawn a single wave entry cleanly (used by spawnWave and deferred boss-wave escort spawns) */
  private spawnEntry(k: string, i: number, deferredBoss = false): Foe | null {
    if (this.phase !== 'fight' || this.bossDefeated) return null;
    const hp = this.hero.pos;
    let p = V3();
    const gd = this.grid, sz = this.stageZ.length ? this.stageZ[this.stageOf[this.wave] ?? 0] : -1, zb = sz >= 0 ? this.pieces?.zoneBox(sz) : null;
    for (let t = 0; t < 40; t++) {
      p = zb ? V3(R(zb.x0 + 0.8, zb.x1 - 0.8), 0, R(zb.z0 + 0.8, zb.z1 - 0.8)) : V3(R(PLAY.x0 + 1.5, PLAY.x1 - 1.5), 0, R(PLAY.z0 + 1.5, PLAY.z1 - 2.5));
      if (kindOr(k).kind === 'xp_diver' && this.pools.length) { const pl = this.pools[Math.floor(Math.random() * this.pools.length)]; p = V3(R(pl.x0 + 0.6, pl.x1 - 0.6), 0, R(pl.z0 + 0.6, pl.z1 - 0.6)); }
      if (EDEFS[kindOr(k).kind].boss) { const bm = gd?.sp.fixed?.boss; p = bm ? V3(bm[0], 0, bm[1]) : V3(0, 0, SZ(-4.6)); }
      const d = p.distanceTo(hp), onFloor = !gd || (gd.clear(p.x, p.z, 0.7) && !gd.sp.bridges.some(b => p.x > b.x0 - 1 && p.x < b.x1 + 1 && p.z > b.z0 - 1 && p.z < b.z1 + 1));
      if ((sz < 0 ? d > 5 && d < 12 : t > 25 ? d > 3 : d > 5 && d < 12) && onFloor && (sz < 0 || this.pieces!.zoneAt(p.x, p.z) === sz) && this.foes.every(f => f.pos.distanceTo(p) > 1.4) && this.solids.free(p.x, p.z, 0.6, 0.3) && (!gd || t > 30 || gd.steps(p.x, p.z, hp.x, hp.z) >= 0)) break;
    }
    if (sz >= 0 && this.pieces && this.pieces.zoneAt(p.x, p.z) !== sz) {
      const [x, z] = this.pieces.spawnInZone(sz, p.x, p.z); p.set(x, 0, z);
    } else if (gd && gd.at(p.x, p.z) !== FLOOR) { const q = gd.nearestFloor(p.x, p.z); p.set(q[0], 0, q[1]); }
    const ko = kindOr(k), bs = !!EDEFS[ko.kind].boss;
    const way = bs || kindOr(k).kind === 'xp_diver' ? null : this.entryFromGuaranteed(p, hp, i, zb ?? null, sz);
    const f = spawnFoe(ko.kind, way ? way.from : p, hp.clone(), ko.elite); this.foes.push(f);
    // act-125: Bosses NEVER pop out of thin air mid-room — they descend with a ground-warning vortex & heavy landing shockwave!
    if (bs && this.prologue !== 2) {
      f.pos.set(p.x, 11.5, p.z); f.a.root.position.copy(f.pos); f.a.root.visible = false;
      f.st = 'enter'; f.t = 0; f.dur = 1.2; f.inv = 1.4; f.cd = 1.4;
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 2.2, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff5a2c, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending }));
      ring.position.set(p.x, 0.08, p.z); ring.renderOrder = 4; this.stage?.root.add(ring);
      this.bossDrops.push({ f, at: p.clone(), t: 0, ring, deferred: deferredBoss, onLand: null });
      this.bossLookT = Math.max(this.bossLookT, 3.0);
      cue('whoosh', 0.85);
      return f;
    }
    if (way) this.entering.push({ f, from: way.from, crest: way.crest, land: way.land, to: way.to, wall: way.wall, t: 0, perched: false, landed: false, posePhase: null, poseU: 0 });
    else if (!(bs && this.prologue === 2 && deferredBoss)) {
      fxSmoke(p.clone().add(V3(0, 0.3, 0)), 0x6a6a74, bs ? 14 : 8, { r: 0.7, spd: 1.2, up: 0.6, s: 0.4, life: 0.7 });
      fxRing(p.clone().setY(0.05), bs && ko.kind === 'cx_boss' ? 0xe0e8f4 : 0xff7a4a, 1.2, { life: 0.4 } as never);
    }
    if (bs && !(this.prologue === 2 && deferredBoss)) this.bossEnterSound(ko.kind);
    else if (!bs) cue(way ? 'foeCry' : 'summon', way ? 0.25 : 0.4);
    if (bs && !deferredBoss && EDEFS[ko.kind].intro) { this.bossLookT = 3.2; this.bossEnterPose(f); shake(0.24 * TUNE.shake); this.banner.show(EDEFS[ko.kind].name, EDEFS[ko.kind].tag ?? '', 2.2, '#ff8a6a'); after(0.9, () => { if (f.st !== 'dead') this.barks?.say(() => f.a.head(), EDEFS[ko.kind].intro!); }); }
    else if (bs && !deferredBoss) { this.bossEnterPose(f); shake(0.24 * TUNE.shake); this.banner.show(EDEFS[ko.kind].name, EDEFS[ko.kind].tag ?? '', 1.6, '#ff8a6a'); }
    return f;
  }
  /** Per-boss signature entrance audio (Cui Xuan gets howling snow wind + blade chorus, NEVER a beast roar!) */
  private bossEnterSound(kind: EKind) {
    if (kind === 'cx_boss') { cue('snowWind', 0.95); cue('bladeChorus', 0.72); }
    else if (kind === 'xp_boss' || kind === 'pb_yingge') { cue('freeze', 0.8); cue('needleZing', 0.78); }
    else if (kind === 'wl_boss' || kind === 'pb_tiebi') { cue('warHorn', 0.82); cue('fire', 0.65); }
    else if (kind === 'pb_daowei') { cue('bladeChorus', 0.82); cue('draw', 0.8); }
    else cue('roar', 0.88);
  }
  private bossEnterPose(f: Foe) {
    if (f.kind === 'cx_boss' || f.kind === 'xp_boss' || f.kind === 'wl_boss') f.a.play(new Action('cast', 0.9, 0.45));
    else f.a.roar();
  }
  /** act-125: physical sky-slam entrance choreography for bosses (ground vortex buildup -> high plunge -> landing shockwave & signature audio) */
  private bossDrops: Array<{ f: Foe; at: THREE.Vector3; t: number; ring: THREE.Mesh; deferred: boolean; onLand: (() => void) | null }> = [];
  private clearBossDrops() { for (const d of this.bossDrops) { d.ring.parent?.remove(d.ring); d.ring.geometry.dispose(); (d.ring.material as THREE.Material).dispose(); } this.bossDrops.length = 0; }
  private bossDropStep(dt: number) {
    const WARN = 0.62, DROP = 0.24, TOTAL = WARN + DROP;
    for (let i = this.bossDrops.length - 1; i >= 0; i--) {
      const d = this.bossDrops[i], f = d.f;
      if (f.st === 'dead') { d.ring.parent?.remove(d.ring); this.bossDrops.splice(i, 1); continue; }
      d.t += dt;
      f.st = 'enter'; f.t = 0; f.dur = 0.35; f.inv = 0.4; f.vel.set(0, 0, 0);
      const rm = d.ring.material as THREE.MeshBasicMaterial;
      if (d.t < WARN) {
        const k = d.t / WARN;
        f.a.root.visible = false;
        d.ring.scale.setScalar(1.35 - 0.55 * k);
        rm.opacity = 0.35 + 0.55 * k;
        if (Math.random() < dt * 26) fxEmbers(d.at.clone().add(V3((Math.random() - 0.5) * 2.2, 0.12, (Math.random() - 0.5) * 2.2)), f.kind === 'cx_boss' ? 0xdce8ff : 0xff8a3a, 1, { r: 0.2, up: 2.2, life: 0.45 });
      } else if (d.t < TOTAL) {
        const k = (d.t - WARN) / DROP;
        f.a.root.visible = true;
        f.pos.set(d.at.x, 11.5 * (1 - k * k), d.at.z);
        f.a.root.position.copy(f.pos);
        f.yaw = Math.atan2(this.hero.pos.x - d.at.x, this.hero.pos.z - d.at.z); f.a.yaw = f.yaw;
        d.ring.scale.setScalar(0.8 + 0.4 * k); rm.opacity = 0.9;
      } else {
        // Poised snow-wind arrival for Cui Xuan vs thunderous heavy landing for brute bosses
        f.a.root.visible = true;
        f.pos.set(d.at.x, 0, d.at.z); f.a.root.position.copy(f.pos); f.inv = 0.2; f.cd = 0.7;
        d.ring.parent?.remove(d.ring); d.ring.geometry.dispose(); rm.dispose();
        this.bossDrops.splice(i, 1);
        if (f.kind === 'cx_boss') {
          cue('snowWind', 0.95); cue('bladeChorus', 0.8); cue('land', 0.7);
          shake(0.24 * TUNE.shake); this.camPunch(0.04);
          fxRing(d.at.clone().setY(0.1), 0xe6f0ff, 3.8, { life: 0.55 } as never);
          fxSmoke(d.at.clone().setY(0.35), 0xdce6f4, 14, { r: 1.4, spd: 2.4, up: 0.8, s: 0.5, life: 0.8 });
          fxSparks(d.at.clone().setY(0.4), 0xfff0c0, 16, 5.2);
        } else {
          cue('pillarFall', 0.9); cue('boom', 0.65); this.bossEnterSound(f.kind);
          shake(0.48 * TUNE.shake); this.camPunch(0.06);
          fxShock(d.at.clone().setY(0.08), 0xff9a4a, 3.6, { life: 0.45 });
          fxRing(d.at.clone().setY(0.1), 0xffe2a0, 4.2, { life: 0.5 } as never);
          fxSmoke(d.at.clone().setY(0.4), 0x7a6a5a, 16, { r: 1.4, spd: 2.8, up: 1.0, s: 0.55, life: 0.85 });
          fxSparks(d.at.clone().setY(0.35), 0xffd078, 22, 6.5);
        }
        if (d.onLand) d.onLand();
        else if (!d.deferred) {
          this.bossLookT = 2.6; this.bossEnterPose(f);
          this.banner.show(EDEFS[f.kind].name, EDEFS[f.kind].tag ?? '', 2.2, '#ff8a6a');
          if (EDEFS[f.kind].intro) after(0.8, () => { if (f.st !== 'dead') this.barks?.say(() => f.a.head(), EDEFS[f.kind].intro!); });
        }
      }
    }
  }
  private scheduleWaveBarks(count: number) {
    after(count * 0.28 + 0.45, () => {
      if (this.phase !== 'fight') return;
      const can = this.foes.filter(f => f.st !== 'dead' && !isBoss(f) && f.kind !== 'dummy' && !String(f.kind).includes('hound') && (!!f.d.barks || !/^(ly|xp|wl|cx)_/.test(String(f.kind))));
      for (let n = Math.min(can.length, Math.random() < 0.5 ? 1 : 2), k = 0; k < n; k++) {
        const f = can.splice(Math.floor(Math.random() * can.length), 1)[0];
        after(k * 0.7, () => { if (f.st !== 'dead' && this.phase === 'fight') { const ls = f.d.barks; this.barks?.say(() => f.a.head(), ls?.length ? ls[Math.floor(Math.random() * ls.length)] : undefined); } });
      }
    });
  }
  private spawnWave() {
    const kinds = this.plan?.waves[this.wave] ?? [];
    const gen = ++this.waveGen;
    this.wavePending = 0;
    // act-114 / act-146 P0 fix: if this wave contains a boss, spawn ONLY the boss right away (sky-drop -> intro cutscene -> escorts),
    // and track every deferred/staggered spawn in wavePending so killing early enemies can NEVER skip the boss or clear the room early!
    const bossIdx = kinds.findIndex(k => !!EDEFS[kindOr(k).kind].boss);
    if (bossIdx >= 0) {
      const bk = kindOr(kinds[bossIdx]).kind;
      const bi = BOSS_ORDER.indexOf(bk);
      const willIntro = this.prologue === 2
        || (bi >= 0 && CH_BEFORE[bi].length > 0 && !profile().seen[`ch${bi + 1}_boss`])
        || (bi === 2 && !isDuwuDead(profile()) && !profile().seen['duwu_die']);
      const rest = kinds.filter((_, idx) => idx !== bossIdx);
      const spawnEscorts = () => {
        if (gen !== this.waveGen || this.bossDefeated) return;
        this.wavePending += rest.length;
        rest.forEach((k, i) => after(i * 0.28 + 0.35, () => {
          if (gen !== this.waveGen) return;
          this.wavePending = Math.max(0, this.wavePending - 1);
          this.spawnEntry(k, i + 1);
        }));
        if (rest.length) this.scheduleWaveBarks(rest.length);
      };
      const f = this.spawnEntry(kinds[bossIdx], 0, willIntro);
      if (f) {
        const drop = this.bossDrops.find(d => d.f === f);
        if (drop) {
          drop.onLand = () => {
            if (gen !== this.waveGen || f.st === 'dead') return;
            if (willIntro && this.bossArrived(f, spawnEscorts)) return;
            this.bossLookT = 2.6; this.bossEnterPose(f);
            this.banner.show(EDEFS[f.kind].name, EDEFS[f.kind].tag ?? '', 2.2, '#ff8a6a');
            if (EDEFS[f.kind].intro) after(0.8, () => { if (f.st !== 'dead') this.barks?.say(() => f.a.head(), EDEFS[f.kind].intro!); });
            spawnEscorts();
          };
          return;
        }
        if (willIntro && this.bossArrived(f, spawnEscorts)) return;
      }
      spawnEscorts();
      return;
    }
    this.scheduleWaveBarks(kinds.length);
    this.wavePending += kinds.length;
    kinds.forEach((k, i) => {
      after(i * 0.34, () => {
        if (gen !== this.waveGen) return;
        this.wavePending = Math.max(0, this.wavePending - 1);
        this.spawnEntry(k, i);
      });
    });
  }
  /** 11-19 / act-137 敌人入场: articulated wall-vault (climb -> crest mantle -> parkour leap -> landing crouch -> sprint-in) */
  private entering: Array<{
    f: Foe; from: THREE.Vector3; crest: THREE.Vector3; land: THREE.Vector3; to: THREE.Vector3;
    wall: number; t: number; perched: boolean; landed: boolean; posePhase: VaultPhase | null; poseU: number;
    rush?: boolean; rushDur?: number;
  }> = [];
  /** where a foe comes in from: the room's edge level with its spot p (the back and the two sides first, the side away from her
   *  first; the camera's side last), vaulting over the wall onto a realistic landing spot 1.6–2.4 m inside the edge, then sprinting
   *  to its target if further inside. Front open edge uses a crisp low hurdle + sprint-in (no invisible wall climb). */
  private entryFrom(p: THREE.Vector3, hp: THREE.Vector3, i: number, zb: { x0: number; x1: number; z0: number; z1: number } | null, sz: number): { from: THREE.Vector3; crest: THREE.Vector3; land: THREE.Vector3; to: THREE.Vector3; wall: number } | null {
    const g = this.grid, b = zb ?? (g ? g.sp.box : { x0: PLAY.x0, x1: PLAY.x1, z0: PLAY.z0, z1: PLAY.z1 });
    const sides: Array<[number, number]> = [[0, -1], [-1, 0], [1, 0], [0, 1]];
    // act-118: rotate entry edges across wave indices so enemies arrive in multi-directional pincers instead of single-file clumping
    const pref = (i + this.wave) % 3;
    const order = sides.map((d, k) => ({
      d, k,
      score: (k === 3 ? -50 : k === pref ? 40 : 0) + (d[0] ? (d[0] < 0 ? hp.x - b.x0 : b.x1 - hp.x) : (d[1] < 0 ? hp.z - b.z0 : b.z1 - hp.z)) * 0.35 + ((i * 5 + k * 7) % 5),
    })).sort((x, y) => y.score - x.score);
    const okAt = (x: number, z: number) => (!g || g.clear(x, z, 0.5)) && this.solids.free(x, z, 0.5, 0.3) && (sz < 0 || this.pieces?.zoneAt(x, z) === sz)
      && this.foes.every(f => f.pos.distanceTo(V3(x, 0, z)) > 1.8) && this.entering.every(e => e.to.distanceTo(V3(x, 0, z)) > 2.2) && hp.distanceTo(V3(x, 0, z)) > 3.6;
    for (const { d, k } of order) {
      const ex = d[0] ? (d[0] < 0 ? b.x0 : b.x1) : p.x, ez = d[1] ? (d[1] < 0 ? b.z0 : b.z1) : p.z;
      const len = Math.hypot(p.x - ex, p.z - ez); if (len < 1.6) continue;
      const ux = (p.x - ex) / len, uz = (p.z - ez) / len;
      let dist = -1; for (let t = 1.4 + (i % 3) * 0.55; t < Math.min(len, 6); t += 0.3) if (okAt(ex + ux * t, ez + uz * t)) { dist = t; break; }
      if (dist < 0) continue;
      const front = k === 3, wall = front ? 0 : 2.45;
      const crest = V3(ex, 0, ez);
      const from = V3(ex - ux * 0.9, 0, ez - uz * 0.9);
      const to = V3(ex + ux * dist, 0, ez + uz * dist);
      const landDist = Math.min(dist, 2.2);
      const land = V3(ex + ux * landDist, 0, ez + uz * landDist);
      if (g && g.at(land.x, land.z) !== FLOOR) land.copy(to);
      return { from, crest, land, to, wall };
    }
    return null;
  }
  /** act-135 / act-137: guaranteed perimeter wall-vault / edge-rush entry so NO regular wave foe or boss reinforcement ever pops out of thin air */
  private entryFromGuaranteed(p: THREE.Vector3, hp: THREE.Vector3, i: number, zb: { x0: number; x1: number; z0: number; z1: number } | null, sz: number): { from: THREE.Vector3; crest: THREE.Vector3; land: THREE.Vector3; to: THREE.Vector3; wall: number } {
    const strict = this.entryFrom(p, hp, i, zb, sz);
    if (strict) return strict;
    const g = this.grid, b = zb ?? (g ? g.sp.box : { x0: PLAY.x0, x1: PLAY.x1, z0: PLAY.z0, z1: PLAY.z1 });
    const sides: Array<[number, number]> = [[0, -1], [-1, 0], [1, 0], [0, 1]];
    const pref = (i + this.wave) % 3;
    const order = sides.map((d, k) => ({
      d, k,
      score: (k === 3 ? -50 : k === pref ? 40 : 0) + (d[0] ? (d[0] < 0 ? hp.x - b.x0 : b.x1 - hp.x) : (d[1] < 0 ? hp.z - b.z0 : b.z1 - hp.z)) * 0.35 + ((i * 5 + k * 7) % 5),
    })).sort((x, y) => y.score - x.score);
    const to = p.clone().setY(0);
    if (g && g.at(to.x, to.z) !== FLOOR) { const q = g.nearestFloor(to.x, to.z); to.set(q[0], 0, q[1]); }
    this.clamp(to, 0.55);
    const chosen = order[0];
    const [dx, dz] = chosen.d, front = chosen.k === 3;
    const ex = dx ? (dx < 0 ? b.x0 : b.x1) : to.x, ez = dz ? (dz < 0 ? b.z0 : b.z1) : to.z;
    const crest = V3(ex, 0, ez);
    const from = V3(ex + dx * 0.95, 0, ez + dz * 0.95);
    const inDx = to.x - ex, inDz = to.z - ez, dist = Math.hypot(inDx, inDz);
    const land = dist > 2.3 ? V3(ex + (inDx / dist) * 2.1, 0, ez + (inDz / dist) * 2.1) : to.clone();
    if (g && g.at(land.x, land.z) !== FLOOR) land.copy(to);
    return { from, crest, land, to, wall: front ? 0 : 2.45 };
  }
  /** act-135 / act-137: boss-summoned reinforcements climb over the arena perimeter walls / rush in from outside, staggered cleanly */
  private spawnReinforce(kind: EKind, idx = 0): Foe | null {
    if (this.phase !== 'fight' || this.bossDefeated) return null;
    const hp = this.hero.pos, gd = this.grid;
    const sz = this.stageZ.length ? this.stageZ[this.stageOf[this.wave] ?? 0] : -1;
    const zb = sz >= 0 ? (this.pieces?.zoneBox(sz) ?? null) : null;
    let p = V3();
    for (let t = 0; t < 24; t++) {
      p = zb ? V3(R(zb.x0 + 0.9, zb.x1 - 0.9), 0, R(zb.z0 + 0.9, zb.z1 - 0.9)) : V3(R(PLAY.x0 + 1.4, PLAY.x1 - 1.4), 0, R(PLAY.z0 + 1.4, PLAY.z1 - 2.2));
      const d = p.distanceTo(hp), onFloor = !gd || gd.clear(p.x, p.z, 0.65);
      if (d > 3.5 && onFloor && this.solids.free(p.x, p.z, 0.55, 0.3) && this.foes.every(f => f.pos.distanceTo(p) > 1.3)) break;
    }
    if (gd && gd.at(p.x, p.z) !== FLOOR) { const q = gd.nearestFloor(p.x, p.z); p.set(q[0], 0, q[1]); }
    const way = this.entryFromGuaranteed(p, hp, idx + this.entering.length, zb, sz);
    const f = spawnFoe(kind, way.from, hp.clone());
    f.st = 'enter'; f.cd = R(0.7, 1.3); f.inv = 0.35;
    const delay = idx * 0.18;
    if (delay > 0) f.a.root.visible = false;
    this.foes.push(f);
    this.entering.push({ f, from: way.from, crest: way.crest, land: way.land, to: way.to, wall: way.wall, t: -delay, perched: false, landed: false, posePhase: null, poseU: 0 });
    cue('foeCry', 0.28);
    return f;
  }
  /** act-137 per frame: 5-stage martial parkour entry — wall climb -> crest mantle crouch (with dust) -> scissor-tucked ballistic leap ->
   *  shock-absorbing landing crouch -> articulated sprint-in to combat position (open front edges use an agile low hurdle + sprint). */
  private enterStep(dt: number) {
    for (let n = this.entering.length - 1; n >= 0; n--) {
      const e = this.entering[n], f = e.f;
      if (f.st === 'dead') { f.a.body.rotation.set(0, 0, 0); this.entering.splice(n, 1); continue; }
      e.t += dt;
      if (e.t < 0) {
        f.a.root.visible = false; f.pos.copy(e.from); f.vel.set(0, 0, 0); e.posePhase = null;
        f.st = 'enter'; f.t = 0; f.dur = 0.35; f.inv = Math.max(f.inv, 0.25);
        continue;
      }
      if (e.rush) {
        // act-138: ground sprint-in from distant off-stage approach roads (kicks up dust, never pops out of thin air!)
        f.a.root.visible = true;
        const dur = Math.max(0.05, e.rushDur ?? 1.2);
        const h = Math.min(1, e.t / dur);
        f.vel.set(0, 0, 0); f.yaw = Math.atan2(e.to.x - e.from.x, e.to.z - e.from.z); f.a.yaw = f.yaw;
        f.pos.lerpVectors(e.from, e.to, h); f.pos.y = 0;
        f.a.home.copy(f.pos);
        f.a.setRunning(true, 5.0);
        f.st = 'enter'; f.t = 0; f.dur = 0.25; f.cd = Math.max(f.cd, 0.35); f.inv = Math.max(f.inv, 0.12);
        if (Math.random() < dt * 7) fxSmoke(f.pos.clone().setY(0.1), 0x9c8c72, 2, { r: 0.35, spd: 0.7, up: 0.35, s: 0.3, life: 0.45 });
        if (e.t >= dur) {
          f.pos.copy(e.to); f.pos.y = 0; f.a.home.copy(f.pos); f.st = 'move'; f.inv = 0;
          this.entering.splice(n, 1);
        }
        continue;
      }
      f.a.root.visible = true;
      const T = e.t, W = e.wall;
      const runDist = e.land.distanceTo(e.to), runDur = runDist > 0.35 ? Math.min(0.85, runDist / 4.8) : 0;
      f.vel.set(0, 0, 0);
      f.st = 'enter'; f.t = 0; f.dur = 0.35; f.cd = Math.max(f.cd, 0.65); f.inv = Math.max(f.inv, 0.18);
      if (W > 1.2) {
        const CLIMB = 0.26, PERCH = 0.11, LEAP = 0.42 + 0.05 * Math.min(2.5, e.crest.distanceTo(e.land)), LAND = 0.18;
        const tP = CLIMB, tL = tP + PERCH, tD = tL + LEAP, tR = tD + LAND, total = tR + runDur;
        if (T < tP) {
          const u = T / CLIMB; e.posePhase = 'climb'; e.poseU = u;
          f.pos.lerpVectors(e.from, e.crest, u * 0.38); f.pos.y = (W - 0.12) * (1 - (1 - u) * (1 - u));
          f.yaw = Math.atan2(e.crest.x - e.from.x, e.crest.z - e.from.z); f.a.setRunning(false);
        } else if (T < tL) {
          const u = (T - tP) / PERCH; e.posePhase = 'perch'; e.poseU = u;
          if (!e.perched) { e.perched = true; fxSmoke(e.crest.clone().setY(W), 0x8a7d6d, 4, { r: 0.35, spd: 0.7, up: 0.25, s: 0.26, life: 0.4 }); }
          f.pos.lerpVectors(e.from, e.crest, 0.38 + 0.62 * u); f.pos.y = W;
          f.yaw = Math.atan2(e.land.x - e.crest.x, e.land.z - e.crest.z); f.a.setRunning(false);
        } else if (T < tD) {
          const u = (T - tL) / LEAP; e.posePhase = 'leap'; e.poseU = u;
          f.pos.lerpVectors(e.crest, e.land, u); f.pos.y = W * (1 - u * u) + 0.58 * 4 * u * (1 - u);
          f.yaw = Math.atan2(e.land.x - e.crest.x, e.land.z - e.crest.z); f.a.setRunning(false);
        } else if (T < tR) {
          const u = (T - tD) / LAND; e.posePhase = 'land'; e.poseU = u;
          if (!e.landed) { e.landed = true; cue('land', 0.45); fxSmoke(e.land.clone().setY(0.1), 0x8a7a6a, 6, { r: 0.6, spd: 1.2, up: 0.4, s: 0.38, life: 0.55 }); shake(0.035 * TUNE.shake); }
          f.pos.copy(e.land); f.pos.y = 0;
          f.yaw = Math.atan2(this.hero.pos.x - f.pos.x, this.hero.pos.z - f.pos.z); f.a.setRunning(false);
        } else if (T < total) {
          const u = (T - tR) / Math.max(0.05, runDur); e.posePhase = null; f.a.body.rotation.set(0, 0, 0);
          f.pos.lerpVectors(e.land, e.to, u); f.pos.y = 0;
          f.yaw = Math.atan2(e.to.x - e.land.x, e.to.z - e.land.z); f.a.setRunning(true, 4.8, f.yaw);
        } else {
          if (!e.landed) { e.landed = true; cue('land', 0.45); }
          f.pos.copy(e.to); f.pos.y = 0; f.inv = 0.12; f.a.body.rotation.set(0, 0, 0); f.a.setRunning(false);
          this.entering.splice(n, 1); continue;
        }
      } else {
        const HURDLE = 0.34, LAND = 0.14, tD = HURDLE, tR = tD + LAND, total = tR + runDur;
        if (T < tD) {
          const u = T / HURDLE; e.posePhase = 'hurdle'; e.poseU = u;
          f.pos.lerpVectors(e.from, e.land, u); f.pos.y = 0.52 * 4 * u * (1 - u);
          f.yaw = Math.atan2(e.land.x - e.from.x, e.land.z - e.from.z); f.a.setRunning(false);
        } else if (T < tR) {
          const u = (T - tD) / LAND; e.posePhase = 'land'; e.poseU = u;
          if (!e.landed) { e.landed = true; cue('land', 0.35); fxSmoke(e.land.clone().setY(0.1), 0x8a7a6a, 5, { r: 0.5, spd: 1.0, up: 0.35, s: 0.32, life: 0.48 }); }
          f.pos.copy(e.land); f.pos.y = 0;
          f.yaw = Math.atan2(this.hero.pos.x - f.pos.x, this.hero.pos.z - f.pos.z); f.a.setRunning(false);
        } else if (T < total) {
          const u = (T - tR) / Math.max(0.05, runDur); e.posePhase = null; f.a.body.rotation.set(0, 0, 0);
          f.pos.lerpVectors(e.land, e.to, u); f.pos.y = 0;
          f.yaw = Math.atan2(e.to.x - e.land.x, e.to.z - e.land.z); f.a.setRunning(true, 4.8, f.yaw);
        } else {
          if (!e.landed) { e.landed = true; cue('land', 0.35); }
          f.pos.copy(e.to); f.pos.y = 0; f.inv = 0.12; f.a.body.rotation.set(0, 0, 0); f.a.setRunning(false);
          this.entering.splice(n, 1); continue;
        }
      }
      f.a.yaw = f.yaw;
      f.a.home.copy(f.pos);
    }
  }
  // ------------------------------------------------------------ the world the hero / foes see
  /** act-37 (用户：「碰撞必须要做，不然这游戏太多穿模了」): every body pushes the others out by their radii and weights — foe from foe,
   *  the hero from a foe (a boss barely gives, a dummy and the hideout's people not at all); a dashing or airborne hero passes
   *  (the dash-cut goes through by design); whatever moved is held by the walls and the solids again */
  private separate() {
    const h = this.hero, B: Array<{ p: THREE.Vector3; r: number; m: number; moved: boolean; f?: Foe; isHero?: boolean }> = [];
    // act-125 / act-137 (Hades-style clean dash pass-through): hero NEVER collides with or shoves foes during dash / dodgeWin / dcut / swoop / rel / reel / airborne
    const heroPhasing = !h || h.hp <= 0 || h.st === 'dash' || h.st === 'dcut' || h.st === 'swoop' || h.st === 'rel' || h.st === 'reel' || h.airborne || h.dodgeWin;
    if (!heroPhasing) B.push({ p: h.pos, r: h.r, m: 1, moved: false, isHero: true });
    for (const f of this.foes) if (f.st !== 'dead' && !this.bossDrops.some(d => d.f === f) && !this.entering.some(e => e.f === f)) B.push({ p: f.pos, r: f.d.r * 0.9, m: f.kind === 'dummy' ? 1e6 : isBoss(f) ? 8 : f.d.mass, moved: false, f });
    for (const n of this.npcs) B.push({ p: V3(n.x, 0, n.z), r: 0.42, m: 1e6, moved: false });
    for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
      const a = B[i], b = B[j], dx = b.p.x - a.p.x, dz = b.p.z - a.p.z, min = a.r + b.r, d2 = dx * dx + dz * dz;
      if (d2 >= min * min || a.m >= 1e6 && b.m >= 1e6) continue;
      const d = Math.sqrt(d2) || 1e-3, nx = d2 > 1e-8 ? dx / d : 1, nz = d2 > 1e-8 ? dz / d : 0, over = min - d;
      let wa = b.m / (a.m + b.m), wb = a.m / (a.m + b.m);
      // act-137: hero body contact NEVER shoves enemies away (ONLY blade hits/knock move enemies; hero slides cleanly round foes)
      if (a.isHero && b.f) { wa = 1; wb = 0; }
      else if (b.isHero && a.f) { wa = 0; wb = 1; }
      if (a.m < 1e6 && wa > 0) { a.p.x -= nx * over * wa; a.p.z -= nz * over * wa; a.moved = true; }
      if (b.m < 1e6 && wb > 0) { b.p.x += nx * over * wb; b.p.z += nz * over * wb; b.moved = true; }
    }
    const keep = this.lastPush;
    // (a foe knocked over a pit's edge stays loose there: the crowd's push must not hold it back on the floor)
    for (const o of B) if (o.moved) { if (o.f) this.foeClamp(o.f); else this.clamp(o.p, o.r); }
    this.lastPush = keep;
  }
  private clamp = (p: THREE.Vector3, r: number) => {
    const yard = this.phase === 'yard' || (this.phase === 'leaving' && this.room < 0);
    const activeDoors = (this.phase === 'doors' || this.phase === 'leaving' || this.phase === 'yard')
      ? this.doors.map(d => d.ex)
      : [];
    this.lastPush = clampWithDoors(p, r, {
      play: PLAY,
      pad: yard ? { x: 0, z0: 0, z1: 0 } : { x: 0.02, z0: 0.02, z1: 0.1 },
      doors: activeDoors,
      grid: this.grid,
      overPit: this.overPit,
      solids: this.solids,
      wallSolid: WALL_SOLID,
    });
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
    thunderCleave: o => this.thunderCleave(o), frostDetonate: o => this.frostDetonate(o), bluntFlash: o => this.bluntFlash(o),
    passing: o => this.passing(o), overhead: o => this.overhead(o), dashed: o => this.dashed(o),
    launch: o => this.launchCut(o), kick: o => this.kickHit(o),
    // 11-18 四本新刀谱
    airFoe: (p, y, r) => this.airFoe(p, y, r), airHold: (f, y) => this.airHold(f, y), airCut: o => this.airCut(o), airSlam: o => this.airSlam(o),
    swoop: o => this.swoopCut(o), reelTarget: (p, min) => this.reelTarget(p, min), reel: o => this.reelIn(o),
    stompable: (p, y) => this.stompable(p, y), stomp: o => this.stompOn(o),
    dart: o => { this.dartsThrown++; const dmg = Math.max(1, Math.round(TUNE.dartDmg * (o.dmgMul ?? 1))); const d = new Dart(o.from.clone(), o.dir.clone().multiplyScalar(TUNE.dartSpeed), dmg, TUNE.dartRange); d.link = o.link ?? 0; d.back = hasBoon(this.perks, 'boomerang') ? v(this.perks, 'boomerang') / 100 : 0; this.darts.push(d); },
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
    //  ring up or its scene playing, the cards, a 刀谱's demonstration, a scripted pose; act-115: yard also allows natural QTE practice)
    canRun: forced => (this.phase === 'fight' || this.phase === 'yard') && (!this.prologue || !!forced) && !this.proFalling && this.qteT < 0 && !this.ultOn && !this.cards.on && !this.demo.on && !this.dialogue.on && !this.timeline.on && !PAUSE.on,
    clamp: (p, r) => this.clamp(p, r), solids: () => this.solids.list, bannerY: () => this.banner.bottomY, log: s => this.log.push(s),
    hitFoe: (f, dmg, from, o) => this.hitFoe(f, dmg, from, o),
    feel: dir => this.feel('rel', true, 1, dir),
    hurtHero: (dmg, from, f) => this.hurtHero(dmg, from, f),
    addIntent: () => { if (this.intent >= 3) this.startQte(); else this.addIntent(); },
    camKick: (d, m) => this.camKick(d, m), camPunch: m => this.camPunch(m),
    splitScreen: k => { this.splitScreen(k); if (k >= 0.65) this.impactScreen(0.85); },
    vibrate: l => this.platform.vibrate(l),
  };
  private foeWorld: FoeWorld = {
    pushed: (f, dx, dz) => this.pushed(f, dx, dz),
    heroPos: V3(), heroR: 0.38, heroAlive: true, heroY: 0, heroDodge: false, foes: this.foes, arrows: this.arrows, clamp: this.clamp,
    clampAir: this.clampAir, clampFoe: this.foeClamp, way: this.foeWay, sees: this.foeSees,
    hurtHero: (dmg, from, attacker) => this.hurtHero(dmg, from, attacker), // wp/boons: exact melee attacker; arrows omit it
    killFoe: (f, from) => this.killFoe(f, from), // wp/boons: lethal burn ticks use the death hook too
    bleedDamage: f => {
      let dmg = f.bleed * v(this.perks, 'bleed');
      if (this.prologue === 2 && isBoss(f)) {
        const floor = Math.ceil(f.maxHp * 0.2);
        if (f.hp - dmg <= floor) { dmg = Math.max(0, f.hp - floor); if (!this.proFalling) after(0.25, () => void this.prologueFall()); }
      }
      if (this.duelGen && !this.duelGen.done && this.duelGen.f === f) {
        const floor = Math.ceil(f.maxHp * 0.72);
        dmg = Math.min(dmg, Math.max(0, f.hp - floor));
      }
      if (__DEBUG_UI__) this.tally('bleed', dmg, f);
      return dmg;
    },
    bleedSpill: f => this.bleedDrip(f),
    arrowHit: (f, a) => this.arrowHit(f, a),
    dodged: from => this.perfectDodge(from),
    // 11-18 (一局五关): the later regions' foes reach into the world through these
    say: (f, line) => { if (this.phase === 'fight' || this.phase === 'intro') this.barks?.say(() => f.a.head(), line); },
    ignite: (x, z, r, t) => { this.props?.ignite(x, z, r, t); },
    chill: (t, k) => { this.chillK = this.chillT > 0 ? Math.min(this.chillK, k) : k; this.chillT = Math.max(this.chillT, t); },
    freeze: t => { this.frozenT = Math.max(this.frozenT, t); this.hero?.vel.set(0, 0, 0); cue('parry', 0.5); },
    wet: (x, z) => this.pools.some(r => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1),
    spawnReinforce: (kind, idx) => this.spawnReinforce(kind, idx),
  };
  /** act-23: did the swing being felt cut flesh (not only the wooden dummies)? picks the hit sound's flesh layers */
  private fleshHit = false;
  private dmgMul(kind: string) { void kind; return 1; }   // (11-18: 搏命 — a number you never saw — went with the other plain-number boons)
  /** 11-18 打击感分档 (用户：「一招一式节奏都差不多」「3C总之都要再加强」): a blow's hit-stop (× TUNE.hitstop), the camera pushed along it,
   *  the rumble, the push-in, its sound; a kill in it holds a little longer and slows a moment */
  private killBeat = false; private bigKill = false;
  private feel(kind: string, heavy: boolean, n: number, dir?: THREE.Vector3) {
    if (!n) { this.killBeat = false; this.bigKill = false; return; }
    const b = BEAT[heavy && /^k[1-4]$/.test(kind) ? 'heavy' : kind] ?? (heavy ? BEAT.heavy : BEAT.k1), more = Math.min(3, n - 1), sh = TUNE.shake / 2;
    hitstop((b[0] * (1 + 0.14 * more) + (this.killBeat ? 0.028 : 0)) * TUNE.hitstop);
    if (dir) this.camKick(dir, b[1] * (1 + 0.1 * more) * sh);
    if (b[2]) shake(b[2] * (1 + 0.12 * more) * TUNE.shake);
    if (b[3]) this.camPunch(b[3] * sh);
    // act-109 去黏手: plain mob kills stay snappy (hitstop + split, no 0.14s molasses slowmo); slowmo reserved for elites/bosses/heavy finishers
    if (this.killBeat) { if (this.bigKill || heavy) slowmo(0.14, 0.4); this.splitScreen(0.32); }
    else if (kind === 'k5' || kind === 'rel' || kind === 'acutS') this.splitScreen(kind === 'rel' ? 0.6 : 0.35);
    const step = kind === 'k2' ? 2 : kind === 'k3' ? 3 : kind === 'k4' ? 4 : 1;
    cue(b[4], (heavy ? 1.0 : 0.7) + 0.1 * more, this.fleshHit ? step : 0); this.fleshHit = false; this.killBeat = false; this.bigKill = false;
    this.platform.vibrate(heavy ? 'medium' : 'light');
    this.hud.btnKick('attack', heavy ? 1 : 0.55, heavy ? 0xffb060 : 0xfff2d0);   // act-29: the cut button answers the hit
  }
  /** 11-18 镜头: a push of the view along a blow, springing back (peak ≈ m metres); a push-in (peak ≈ share of the distance) */
  private kick = V3(); private kickV = V3(); private punch = 0; private punchV = 0; private frameLean = V3(); private camLeadV = V3(); private crowd = 0;
  /** 11-18: the boss's entrance look (0..1, eased) and how long it is held */ private bossLook = 0; private bossLookT = 0;
  /** 11-19 / act-114 剧情改版: a boss comes in — zero-delay cutscene + lines before the fight, then spawns any deferred wave minions */
  bossArrived(f: Foe, afterIntro?: () => void): boolean {
    const name = EDEFS[f.kind]?.name ?? '';
    if (this.prologue === 2) {
      f.mem.noHide = true;   // prologue forecourt duel stays in Phase 1-2 (never vanishes into Phase 3 dark before the 20% prologue trigger)
      this.bossIntroActive = true;
      void (async () => {
        try {
          const b = f.pos.clone();
          const landZ = Math.max(PLAY.z0 + 5.6, Math.min(PLAY.z1 - 3.0, b.z + 6.0));
          const landPos = V3(Math.max(PLAY.x0 + 2.4, Math.min(b.x - 5.2, PLAY.x0 + 2.85)), 0, landZ);
          this.clamp(landPos, 0.72);
          const standPos = V3(
            Math.min(b.x - 3.6, landPos.x + 2.55),
            0,
            Math.max(PLAY.z0 + 3.6, Math.min(PLAY.z1 - 2.6, landPos.z - 0.75)),
          );
          this.clamp(standPos, 0.55);
          await this.cine(bossIntroShots(this.cineHost, f, name, { prologue: true }), () => {
            // Skip-safety: ensure Liu Bai is cleanly grounded facing Cui Xuan and Cui Xuan faces her unarmed until draw cue
            this.hero.pos.copy(standPos);
            this.hero.a.home.copy(standPos);
            this.hero.a.off.set(0, 0, 0);
            this.hero.a.body.rotation.set(0, 0, 0);
            this.hero.a.root.position.copy(standPos);
            this.hero.a.yaw = Math.atan2(b.x - standPos.x, b.z - standPos.z);
            motionOf(this.hero.a).run = 0;
            f.a.yaw = Math.atan2(standPos.x - b.x, standPos.z - b.z);
            if (f.a.bones.blade) f.a.bones.blade.visible = false;
            if (f.a.bones.fan) f.a.bones.fan.visible = false;
          });
          // act-157 / act-165: Crisp 0-frame hard-cut cinema coverage for PRO_CUIXUAN (no slow gliding between angles!)
          const hp = this.hero.pos, bp = f.pos;
          const mx = (hp.x + bp.x) * 0.5, mz = (hp.z + bp.z) * 0.5;
          this.cutCam([hp.x - 2.2, 2.55, hp.z + 4.2], [mx + 0.4, 1.1, mz - 0.3], 37, { drift: [0.32, -0.05, -0.30], fovDrift: -1.2 });
          let proT = 0, hiltReady = false;
          this.talkTick = (dt: number) => {
            proT += dt;
            f.a.update(dt);
          };
          await this.talk(PRO_CUIXUAN, (idx) => {
            if (idx === 1) {
              // Reverse 3/4 medium on Cui Xuan ("前门早下钥了，阁下翻错了墙。")
              this.cutCam([bp.x + 3.6, 2.50, bp.z + 4.6], [bp.x - 0.1, 1.15, bp.z + 0.1], 36, { drift: [-0.24, -0.04, -0.28], fovDrift: -1.2 });
            } else if (idx === 2) {
              // Reverse 3/4 medium on Liu Bai ("寒山坞文家，三十柄百辟刀。")
              this.cutCam([hp.x + 3.4, 2.40, hp.z + 4.1], [hp.x + 0.1, 1.10, hp.z - 0.1], 36, { drift: [-0.22, -0.04, -0.26], fovDrift: -1.2 });
            } else if (idx === 3) {
              // Tighter reverse angle on Cui Xuan studying her blindfold
              this.cutCam([bp.x + 3.2, 2.42, bp.z + 4.2], [bp.x - 0.1, 1.15, bp.z + 0.1], 35, { drift: [-0.22, -0.03, -0.26], fovDrift: -1.3 });
            } else if (idx === 5) {
              // Cui Xuan reveals bright-steel blade at waist + tight low hard-cut on Liu Bai coiling hand-on-hilt
              if (f.a.bones.blade) f.a.bones.blade.visible = true;
              if (!hiltReady) {
                hiltReady = true;
                this.hero.scriptPose = () => heroHandOnHiltPose(this.hero.a, proT);
              }
              cue('parry', 0.35); cue('snowWind', 0.45);
              fxRing(hp.clone().setY(0.06), 0xeef4ff, 2.0, { life: 0.75, width: 0.08, bright: 1.4 } as never);
              this.cutCam([hp.x + 3.1, 2.32, hp.z + 3.7], [hp.x + 0.15, 1.05, hp.z - 0.1], 35, { drift: [-0.20, -0.04, -0.24], fovDrift: -1.4 });
            } else if (idx === 7) {
              // Tight reverse cut on Cui Xuan issuing his challenge ("好灵的耳朵。让我见识见识你的刀。")
              this.cutCam([bp.x + 3.0, 2.34, bp.z + 3.9], [bp.x - 0.1, 1.14, bp.z + 0.12], 34, { drift: [-0.22, -0.03, -0.26], fovDrift: -1.5 });
            } else if (idx === 8) {
              // Dramatic clash two-shot as Cui Xuan draws bright steel — sparks, blade ring, falling snow from eaves!
              if (f.a.bones.blade) f.a.bones.blade.visible = true;
              f.a.play(new Action('atk1', 0.55, 0.25));
              cue('draw', 0.95); cue('bladeRing', 0.8); shake(0.14);
              fxSparks(bp.clone().setY(1.32), 0xfff2c4, 16, 4.2);
              fxRing(bp.clone().setY(0.08), 0xffe4a0, 2.8, { life: 0.85, width: 0.1, bright: 1.5 } as never);
              for (let k = 0; k < 10; k++) {
                addBlock(V3(mx + (Math.random() - 0.5) * 6, 3.8 + Math.random() * 1.4, mz + (Math.random() - 0.5) * 4), {
                  size: 0.08 + Math.random() * 0.05, col: 0xf0f6ff, bright: 1.1, life: 1.1, shrink: 0.3, grav: 3.4, floor: 0.04,
                  v: V3((Math.random() - 0.5) * 0.6, -0.4, (Math.random() - 0.5) * 0.6),
                });
              }
              this.cutCam([mx + 4.4, 2.65, mz + 4.8], [mx, 1.1, mz], 36, { drift: [-0.30, -0.05, -0.32], fovDrift: -1.2 });
            }
          });
          this.hero.scriptPose = null; this.talkTick = null; this.releaseCutCam();
          if (f.a.bones.blade) f.a.bones.blade.visible = true;
          this.bossEnterPose(f); this.proFightT = 0;
        } finally { this.bossIntroActive = false; }
        afterIntro?.();
      })();
      return true;
    }
    const i = BOSS_ORDER.indexOf(f.kind);
    const doDuwuDie = i === 2 && !isDuwuDead(profile()) && !profile().seen['duwu_die'];
    const chSeen = i >= 0 && CH_BEFORE[i].length > 0 && seeOnce(`ch${i + 1}_boss`);
    if (i < 0 || (!chSeen && !doDuwuDie)) return false;
    saveProfile();
    this.bossIntroActive = true;
    void (async () => {
      try {
        if ((f.st as string) === 'dead') return;
        if (doDuwuDie && this.stage) {
          // act-154: Du Wu poisoned & tossed into snow dregs by Feng Han before the Act 3 White Gate boss duel
          const rx = Math.max(PLAY.x0 + 2.4, Math.min(PLAY.x1 - 2.4, -3.2));
          const rz = Math.max(PLAY.z0 + 2.4, Math.min(PLAY.z1 - 2.8, 0.8));
          const dPos = this.grid ? V3(...this.grid.nearestFloor(rx, rz)) : V3(rx, 0, rz);
          this.clamp(dPos, 0.7);
          const aPos = V3(dPos.x - 1.55, 0, dPos.z - 0.95);
          this.clamp(aPos, 0.6);

          const duwu = new BattleActor(HIDEOUT_PEOPLE.duwu);
          duwu.place(dPos, 0.4); duwu.yaw = 0.4; trimShadows(duwu.root, 4);
          this.stage.root.add(duwu.root);
          const dsh = contactShadow(); dsh.scale.set(0.85, 1, 0.55); dsh.position.set(dPos.x + 0.1, 0.025, dPos.z);
          this.stage.root.add(dsh);

          const dkYaw = Math.atan2(dPos.x - aPos.x, dPos.z - aPos.z);
          const donkey = new BattleActor(HIDEOUT_DONKEY);
          donkey.place(aPos, dkYaw); donkey.yaw = dkYaw; trimShadows(donkey.root, 3);
          this.stage.root.add(donkey.root);
          const ash = contactShadow(); ash.scale.set(0.95, 1, 0.55); ash.position.set(aPos.x, 0.025, aPos.z);
          this.stage.root.add(ash);

          // Dark spilled toxic herb dregs stain beside Du Wu in the snow
          const dregs = new THREE.Mesh(
            new THREE.CircleGeometry(0.68, 12).rotateX(-Math.PI / 2),
            new THREE.MeshBasicMaterial({ color: 0x1a2618, transparent: true, opacity: 0.78, depthWrite: false }),
          );
          dregs.position.set(dPos.x - 0.35, 0.032, dPos.z + 0.32); dregs.renderOrder = 2;
          this.stage.root.add(dregs);

          this.roadActors.push(duwu);
          this.roadShadows.push(dsh);
          this.roadExtras.push(dregs);

          warmLines(DUWU_DIE, 4);
          await this.cine(duwuDieShots(this.cineHost, duwu, donkey, f, dPos));
          let dieT = 0, deadPose = false, kneelWant = 0, kneelBlend = 0, hiltReady = false;
          let bread: THREE.Group | null = null, breadT = 0;
          const breadStart = V3(dPos.x + 0.16, 0.26, dPos.z + 0.18);
          const breadEnd = V3(dPos.x + 0.36, 0.02, dPos.z + 0.62);
          this.cutCam([dPos.x + 3.3, 3.15, dPos.z + 4.5], [dPos.x + 0.35, 0.55, dPos.z + 0.05], 36, { drift: [-0.24, -0.05, -0.28], fovDrift: -1.0 });
          this.hero.scriptPose = () => {
            if (hiltReady) heroHandOnHiltPose(this.hero.a, dieT);
            else if (kneelBlend > 0.01) heroKneelBesidePose(this.hero.a, dieT, kneelBlend);
          };
          this.talkTick = (dt: number) => {
            dieT += dt;
            kneelBlend += (kneelWant - kneelBlend) * Math.min(1, dt * 6.5);
            duwu.update(dt); duwuPoisonPose(duwu, dieT, deadPose);
            donkey.update(dt);
            f.a.update(dt);
            if (bread && breadT < 1) {
              breadT = Math.min(1, breadT + dt / 0.55);
              const u = breadT, ease = 1 - (1 - u) * (1 - u);
              bread.position.lerpVectors(breadStart, breadEnd, ease);
              bread.position.y += 0.14 * 4 * u * (1 - u);
              bread.rotation.set(ease * 3.2, ease * 1.4, ease * 2.1);
            }
          };
          await this.talk(DUWU_DIE, (idx) => {
            if (idx === 1) {
              // Cold reverse hard-cut on Feng Han standing aloof across the snow
              this.cutCam([f.pos.x + 2.8, 2.55, f.pos.z + 3.8], [f.pos.x, 1.12, f.pos.z], 34, { drift: [-0.20, -0.04, -0.24], fovDrift: -1.2 });
            }
            if (idx === 2) {
              // Beat: "刘白脚步猛地一顿，扑进雪堆，一把摸到他冰冷僵硬的粗布袖子" -> intimate low two-shot kneeling beside Du Wu!
              kneelWant = 1;
              cue('land', 0.38);
              fxSmoke(this.hero.pos.clone().setY(0.12), 0xe8eef8, 6, { r: 0.45, spd: 0.8, up: 0.35, s: 0.32, life: 0.55, alpha: 0.6 });
              this.cutCam([dPos.x + 2.75, 2.35, dPos.z + 3.45], [dPos.x + 0.35, 0.52, dPos.z + 0.12], 34, { drift: [-0.18, -0.04, -0.22], fovDrift: -1.4 });
            }
            if (idx >= 6 && !deadPose) {
              // Beat: "他攥着里衣的手松开了，半块粗布裹着的温热胡饼滚落进雪里" -> flatbread rolls onto snow!
              deadPose = true; cue('bodyFall', 0.55);
              if (this.stage) {
                bread = buildFlatbreadProp();
                bread.position.copy(breadStart);
                this.stage.root.add(bread);
                this.roadExtras.push(bread);
              }
            }
            if (idx === 7) {
              // Cold sneer hard-cut back to Feng Han ("啧，可惜了半副好药引...")
              this.cutCam([f.pos.x - 2.6, 2.45, f.pos.z + 3.6], [f.pos.x, 1.15, f.pos.z], 33, { drift: [0.20, -0.04, -0.22], fovDrift: -1.2 });
            }
            if (idx >= 8 && !hiltReady) {
              // Beat: "刘白慢慢松开怀里渐冷的身子，起身，缓缓按上刀柄" -> rises & locks onto Feng Han from heroic low angle!
              kneelWant = 0; hiltReady = true;
              this.hero.a.yaw = Math.atan2(f.pos.x - this.hero.pos.x, f.pos.z - this.hero.pos.z);
              cue('draw', 0.78);
              fxRing(this.hero.pos.clone().setY(0.06), 0xffe4a0, 2.2, { life: 0.75, width: 0.08, bright: 1.5 } as never);
              const hp = this.hero.pos;
              const dx = f.pos.x - hp.x, dz = f.pos.z - hp.z, l = Math.hypot(dx, dz) || 1;
              this.cutCam([hp.x - (dx / l) * 2.8 + 1.4, 2.35, hp.z - (dz / l) * 2.8 + 1.2], [f.pos.x, 1.05, f.pos.z], 35, { drift: [(dx / l) * 0.25, -0.04, (dz / l) * 0.25], fovDrift: -1.4 });
            }
          });
          this.hero.scriptPose = null; this.talkTick = null; this.releaseCutCam();
          // Freeze Du Wu completely still on the snow edge during the revenge duel; donkey flees offstage
          duwuPoisonPose(duwu, 99, true);
          this.roadStill.add(duwu);
          donkey.dispose(); ash.parent?.remove(ash);
          // Persist death immediately (even if player loses to Feng Han, Du Wu stays dead and memorial handover activates!)
          const p = profile(); p.seen['duwu_die'] = 1; p.seen['duwu_dead'] = 1; saveProfile();
          if ((f.st as string) === 'dead') return;
          if (CH_BEFORE[i].length) await this.playBossBeforeTalk(f, i);
          if ((f.st as string) === 'dead') return;
          this.bossEnterPose(f);
        } else {
          await this.cine(bossIntroShots(this.cineHost, f, name, { prologue: false }));
          if ((f.st as string) === 'dead') return;
          await this.playBossBeforeTalk(f, i);
          if ((f.st as string) === 'dead') return;
          this.bossEnterPose(f);
        }
      } finally { this.bossIntroActive = false; }
      afterIntro?.();
    })();
    return true;
  }
  /** act-157: multi-angle shot-reverse-shot + 3D acting during Ch1–Ch5 boss-before confrontations (replaces static top-down camera) */
  private async playBossBeforeTalk(f: Foe, i: number) {
    const lines = CH_BEFORE[i];
    if (!lines || !lines.length) return;
    const hp = this.hero.pos, bp = f.pos;
    const dx = bp.x - hp.x, dz = bp.z - hp.z, len = Math.hypot(dx, dz) || 1;
    const dirX = dx / len, dirZ = dz / len;
    let nx = -dirZ, nz = dirX; if (nz < 0) { nx = -nx; nz = -nz; }
    const mx = (hp.x + bp.x) * 0.5, mz = (hp.z + bp.z) * 0.5;
    this.hero.a.yaw = Math.atan2(dx, dz);
    f.a.yaw = Math.atan2(-dx, -dz);
    if (i === 4 && f.a.bones.blade) f.a.bones.blade.visible = false;
    const setCam = (pos: V, look: V, fov: number) => {
      this.cutCam(pos, look, fov, { drift: [-nx * 0.24, -0.04, -nz * 0.24], fovDrift: -1.2 });
    };
    setCam([mx + nx * 5.2, 2.7, mz + nz * 5.2 + 1.0], [mx, 1.15, mz], 37);
    let bt = 0, hiltOn = false;
    this.talkTick = (dt: number) => {
      bt += dt;
      f.a.update(dt);
    };
    await this.talk(lines, (_idx, l) => {
      if (l.who === 'act') {
        if (/刀镡|刀背|侧耳|按住/.test(l.text)) {
          if (!hiltOn) { hiltOn = true; this.hero.scriptPose = () => heroHandOnHiltPose(this.hero.a, bt); }
          cue('parry', 0.35);
          fxRing(hp.clone().setY(0.06), 0xeef4ff, 2.0, { life: 0.75, width: 0.08, bright: 1.4 } as never);
          setCam([hp.x + nx * 2.8 + dirX * 1.4, 2.30, hp.z + nz * 2.8 + dirZ * 1.4], [hp.x, 1.08, hp.z], 35);
        } else if (/朱漆匣/.test(l.text)) {
          cue('click', 0.55);
          fxSparks(bp.clone().setY(1.2), 0xffc868, 12, 3.0);
          setCam([bp.x - nx * 2.9 - dirX * 1.8, 2.38, bp.z - nz * 2.9 - dirZ * 1.8], [bp.x, 1.15, bp.z], 35);
        } else if (/取下一柄亮钢刀/.test(l.text)) {
          if (f.a.bones.blade) f.a.bones.blade.visible = true;
          cue('draw', 0.9); cue('bladeRing', 0.75);
          fxSparks(bp.clone().setY(1.25), 0xfff0c0, 14, 3.8);
          setCam([bp.x + nx * 2.9 - dirX * 1.6, 2.34, bp.z + nz * 2.9 - dirZ * 1.6], [bp.x, 1.15, bp.z], 35);
        } else {
          setCam([mx + nx * 5.0, 2.65, mz + nz * 5.0 + 0.8], [mx, 1.15, mz], 36);
        }
      } else if (l.who === 'jiangjin') {
        setCam([hp.x + nx * 3.1 + dirX * 1.2, 2.38, hp.z + nz * 3.1 + dirZ * 1.2], [hp.x + dirX * 0.4, 1.08, hp.z + dirZ * 0.4], 35);
      } else {
        setCam([bp.x + nx * 3.2 - dirX * 1.6, 2.45, bp.z + nz * 3.2 - dirZ * 1.6], [bp.x, 1.2, bp.z], 35);
      }
    });
    if (i === 4 && f.a.bones.blade) f.a.bones.blade.visible = true;
    this.hero.scriptPose = null; this.talkTick = null; this.releaseCutCam();
  }
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
  /** three manuals not learnt yet for the equipped weapon, one taken (none left: a boon instead) */
  private async manualPick() {
    const wid = this.hero?.weaponId ?? equippedWeapon(profile(), this.dbgAllWeapons);
    const list = drawManuals(this.perks.moves, 3, Math.random, wid); if (!list.length) { await this.boonPick(); return; }
    await this.pickManuals(list);
  }
  private async pickManuals(list: typeof MANUALS) {
    const was = this.phase; this.phase = 'pick'; this.hud.on = false; this.banner.hide();
    const wid = this.hero?.weaponId ?? this.currentWeaponId(profile());
    const wName = weaponDef(wid).name;
    const cur = list;
    const i = await this.cards.open(cur.map(m => ({ boon: manualCard(m), tier: 0 })), {
      header: { title: msg`${wName} · 刀谱`, sub: '武器专属派生 · 三选一', col: '#ffe49a' },
    });
    const m = cur[i]; this.perks.moves[m.id] = true; this.log.push(`manual ${m.id}`); this.syncMarks(); this.settleDoors();
    this.hud.on = true; this.feed.push('manual', () => msg`刀谱 · ${m.name}`, 0, 'manual:' + m.id);
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
    await this.demo.play(id, { at: this.hero.pos.clone(), def: this.wearing, hud: this.hud });
    this.inp.latch();
    if (this.phase === 'pick') this.phase = was;
  }
  /** 11-19 (用户：「暂停菜单『已得』里点某个招式也显示这一招的残影示意」): the ghost plays in the stopped world (real time), the
   *  HUD's buttons shown so its presses read; the list steps aside until it ends (a tap / back / Start ends it early) */
  private previewOn = false;
  private previewMove(id: string): boolean {
    if (!this.hero || !manualOf(id) || this.demo.on) return false;
    this.previewOn = true; PAUSE.fx = true; this.hud.on = true;
    void this.demo.play(id, { at: this.hero.pos.clone(), def: this.wearing, hud: this.hud }).then(() => {
      this.previewOn = false; PAUSE.fx = false;
      if (PAUSE.on) { this.hud.on = false; this.hud.update(0, this.inp, []); }
    });
    return true;
  }
  /** the marks on the HUD's buttons & top-left readable build strip: every 刀谱 and 秘传 this run has taken (none in the yard) */
  private syncMarks() {
    const list: Mark[] = [];
    const manuals: string[] = [];
    let boonCount = 0;
    if (this.room >= 0) {
      for (const m of MANUALS) if (this.perks.moves[m.id]) { const e = entryOfManual(m); list.push({ id: 'm:' + m.id, target: e.target, kind: 'manual', tier: 0, col: e.col }); manuals.push(m.name); }
      for (const b of BOONS) { const t = tierOf(this.perks, b.id); if (t >= 0) { const e = entryOfBoon(b, t); list.push({ id: 'b:' + b.id, target: e.target, kind: 'boon', tier: t, col: e.col }); boonCount++; } }
    }
    this.hud.buildInfo = { manuals, boonCount };
    this.hud.setMarks(list);
  }
  /** act-151: Unified 招式谱 (Hades-2 style):
   *  1) Current equipped weapon's true moveset (with run Boons slotted inline onto their trigger button!);
   *  2) 本局已得 (only manuals & boons genuinely learned — zero duplication);
   *  3) 据点备战 (active Sun Ao Arcana meditation cards & equipped Keepsake). */
  private buildSections(): Section[] {
    const p = profile();
    ensureArcana(p);
    const wid = equippedWeapon(p, this.dbgAllWeapons), wlv = weaponLevel(p, wid), wdef = WEAPONS[wid];
    // Gather owned boons by slot for inline attachment onto weapon base moves
    const slotBoons: Record<string, AttachedBoon[]> = {};
    const archCounts: Partial<Record<Archetype, number>> = {};
    const ownedBoons: SkillEntry[] = [];
    for (const b of BOONS) {
      const tr = tierOf(this.perks, b.id);
      if (tr < 0) continue;
      archCounts[b.arch] = (archCounts[b.arch] ?? 0) + 1;
      const ai = ARCH_INFO[b.arch];
      if (b.slot) {
        (slotBoons[b.slot] ??= []).push({
          name: b.name,
          col: ai?.col ?? '#ffd878',
          tier: tr,
          eff: b.eff,
          num: fillVals(b.note, b, tr),
        });
      }
      ownedBoons.push(entryOfBoon(b, tr));
    }
    const baseEntries = baseSkillsForWeapon(wid, wlv).map(s => entryOfBase(s, s.slot ? slotBoons[s.slot] : undefined));
    const knownMoves = this.dbgAllMoves ? ALL_MOVES : (this.room >= 0 ? this.perks.moves : {});
    const ms = MANUALS.filter(m => knownMoves[m.id]).map(entryOfManual);
    const runList: SkillEntry[] = [...ms, ...ownedBoons];
    // Active Sun Ao Arcana cards + equipped Keepsake
    const metaList: SkillEntry[] = [];
    const roman = ['Ⅰ', 'Ⅱ', 'Ⅲ'];
    for (const def of ARCANA) {
      if (!isArcanaActive(p, def.id)) continue;
      const rk = Math.max(1, arcanaRank(p, def.id));
      const val = def.vals[Math.min(2, rk - 1)];
      const valStr = def.unit ? `${val}${def.unit}` : `+${val}`;
      metaList.push({
        id: 'arc_' + def.id,
        kind: 'arcana',
        name: def.name,
        tag: `${roman[rk - 1]}阶`,
        badge: { text: def.grasp === 0 ? '中宫觉醒' : `悟性 ${def.grasp}`, col: def.grasp === 0 ? '#ffe478' : '#88f8be', hot: def.grasp === 0 },
        tier: rk - 1,
        icon: 'stance',
        customGlyph: def.glyph,
        steps: null,
        effect: def.desc,
        num: `${def.statLabel} ${valStr}`,
        col: def.grasp === 0 ? 0xffe074 : 0x7ef0a8,
        target: 'hp',
        lit: null,
      });
    }
    const kid = equippedKeepsake(p, this.dbgAllWeapons);
    if (kid) {
      const ks = KEEPSAKES[kid], star = keepsakeStar(p, kid);
      metaList.push({
        id: 'ks_' + kid,
        kind: 'keepsake',
        name: ks.name,
        tag: starLabel(star),
        badge: { text: '随身信物', col: '#ffd878' },
        tier: Math.max(0, star - 1),
        icon: 'ult',
        customGlyph: ks.glyph,
        steps: null,
        effect: ks.effect(star),
        num: `${ks.owner} · ${starLabel(star)}`,
        col: parseInt(ks.col.replace('#', ''), 16) || 0xffd878,
        target: 'hp',
        lit: null,
      });
    }
    const wepTitle = wlv > 0 ? msg`${wdef.name}（${wlv}阶） · 招式` : msg`${wdef.name} · 招式`;
    const sections: Section[] = [
      { title: wepTitle, list: baseEntries },
      { title: UI_WORDS.runOwned, list: runList, empty: UI_WORDS.ownedEmpty },
    ];
    if (metaList.length) sections.push({ title: UI_WORDS.meta, list: metaList });
    return sections;
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
    slashArc.swing({ kind: 'launch', from: o.from, follow: this.hero.pos, yaw: o.yaw, range: o.range, half: o.half });
    // act-138 挑云 signature: crisp rising vertical 3D voxel crescent + updraft wind ring so players instantly read the launcher
    slashArc.clashCross(o.from.clone().add(V3(fx * 1.05, 1.15, fz * 1.05)), V3(fx, 0, fz), Math.PI * 0.42, 'launch', 0.22, 0.88);
    fxRing(o.from.clone().setY(0.08), 0xd4eaf6, 1.35, { life: 0.26, width: 0.12 } as never);
    this.feel('launch', true, n, V3(fx, 0, fz)); return n;
  }
  /** 飞踢 (穿心腿): the first foe in front takes the kick and is sent flying the way the hero was dashing (into walls, jars, others) */
  private kickHit(o: { from: THREE.Vector3; dir: THREE.Vector3; dmg: number }) {
    let best: Foe | null = null, bd = 1e9;
    for (const f of this.foes) {
      if (f.st === 'dead') continue;
      const dx = f.pos.x - o.from.x, dz = f.pos.z - o.from.z, l = Math.hypot(dx, dz); if (l > 1.5 + f.d.r) continue;
      if (dx * o.dir.x + dz * o.dir.z < -0.2) continue; if (l < bd) { bd = l; best = f; }
    }
    const at = o.from.clone().addScaledVector(o.dir, 0.9).setY(0.9);
    // act-138 穿心腿 signature: dry kinetic wind-ring & ground dust kick (even on whiff so the martial kick reads distinctly from a blade swing!)
    fxRing(at.clone().setY(0.85), 0xeadcc4, 0.95, { life: 0.20, width: 0.12 } as never);
    dustBlocks(o.from.clone().addScaledVector(o.dir, 0.6), 6, o.dir.clone());
    if (this.props) this.applyProps(this.props.hitCircle(at.x, at.z, 0.7, { src: 'hero', heavy: true, dir: [o.dir.x, o.dir.z] }, this.targets()));
    if (!best) return 0;
    this.hitFoe(best, o.dmg, o.from, { knock: 0, heavy: true, kind: 'kick', stagger: 1.4 });
    if (best.st !== 'dead') {
      const fly = this.launchable(best), sp = fly ? 15 : 5 / Math.max(1, best.d.mass * 0.6);
      best.vel.copy(o.dir).setY(0).normalize().multiplyScalar(sp); if (fly) { best.airV = 4.2; best.pos.y = Math.max(best.pos.y, 0.05); }
    }
    fxShock(best.pos.clone().setY(0.12), 0xeadcc4, 1.35, { life: 0.26 });
    fxImpact(best.a.chest(), 0xfff0d0, 1.25, { dir: o.dir.clone(), ground: false, stop: false, shake: false }); cue('wallSlam', 0.55); this.feel('kick', true, 1, o.dir.clone());
    this.leaves?.blast(best.pos.x, best.pos.z, 1.5, 6);
    return 1;
  }
  // ------------------------------------------------------------ 11-18 秘传：改招为主
  // (用户：「我打了半天了还没个新招，一直在给我加数值。强化卡片也难以辨认都是干嘛的」) every boon changes how one button plays — each of
  // these is the boon's own picture and blow; the boons.ts table is the list, its `slot` the button
  /** 透骨 (act-138 强化): past the 2nd thrust's point a crisp 3D voxel lance-pierce beam shoots straight through a row of foes + muzzle air-ring */
  private pierceLine(from: THREE.Vector3, dir: THREE.Vector3, dmg: number) {
    const L = v(this.perks, 'pierce'), a = from.clone().addScaledVector(dir, 0.55).setY(1.0), b = from.clone().addScaledVector(dir, L).setY(1.0);
    slashArc.line({ a, b, width: 0.96, y: 1.0, palette: 'stab', sweep: 0.018, fade: 0.36 });
    fxRing(a.clone().setY(1.0), 0xdcf4ff, 0.9, { life: 0.22, width: 0.14 } as never);
    for (let i = 1; i <= 4; i++) fxSparks(a.clone().lerp(b, i / 4), 0xeef8ff, 4, 3.6, { dir, dirK: 0.9 });
    cue('bladeRing', 0.55);
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
  /** 荡刃 (act-138 强化): expanded 3rd-cut sweep throws a crisp 3D voxel outer wind-steel ring + flat ground draft */
  private spinRing(at: THREE.Vector3, r: number) {
    slashArc.ringArc(at, r, 0.92, 'spin', 0.24, 22);
    fxRing(at.clone().setY(0.9), 0xe8f4ff, r, { life: 0.26, width: 0.14, fill: 0.03, bright: 1.25 } as never);
    fxRing(at.clone().setY(0.08), 0xc8d8e8, r * 0.95, { life: 0.32, width: 0.09, fill: 0.02 } as never);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; fxSparks(at.clone().add(V3(Math.sin(a) * r, 0.9, Math.cos(a) * r)), 0xeaf4ff, 2, 2.8, { dir: V3(Math.cos(a), 0, -Math.sin(a)), dirK: 0.9, life: 0.22 }); }
    this.leaves?.blast(at.x, at.z, r + 0.5, 4);
  }
  /** 错身 (act-138 强化): each foe her dash goes through takes a crisp 3D voxel diagonal pass-slash across the chest */
  private passHit = new Map<number, number>();
  private passing(o: { a: THREE.Vector3; b: THREE.Vector3; n: number }) {
    const hasPass = hasBoon(this.perks, 'passCut');
    const hasLuBuKs = equippedKeepsake(profile(), this.dbgAllWeapons) === 'lubu';
    if (!hasPass && !hasLuBuKs) return;
    const ab = o.b.clone().sub(o.a).setY(0), L2 = Math.max(1e-4, ab.lengthSq()), dir = ab.lengthSq() > 1e-6 ? ab.clone().normalize() : this.hero.a.fwd();
    for (const f of this.foes.slice()) {
      if (f.st === 'dead' || this.passHit.get(f.uid) === o.n) continue;
      const t = Math.max(0, Math.min(1, f.pos.clone().sub(o.a).setY(0).dot(ab) / L2)), q = o.a.clone().addScaledVector(ab, t);
      if (Math.hypot(f.pos.x - q.x, f.pos.z - q.z) > f.d.r + 0.55) continue;
      this.passHit.set(f.uid, o.n);
      const c = f.a.chest(), side = V3(dir.z, 0, -dir.x);
      slashArc.clashCross(c, side, 0.48, hasLuBuKs && !hasPass ? 'blunt_flash' : 'dcut', 0.22, 0.82);
      fxSparks(c, hasLuBuKs && !hasPass ? 0xffb088 : 0xdcf4ff, 6, 3.2);
      const dmg = hasPass ? Math.max(4, Math.round(TUNE.atkDmg * v(this.perks, 'passCut') / 100)) : Math.max(4, Math.round(TUNE.atkDmg * 0.45));
      this.hitFoe(f, dmg, o.a, { knock: 0, heavy: false, kind: 'pass', stagger: 0, poiseMul: hasLuBuKs ? 2.0 : 1 });
      this.feel('k2', false, 1, dir.clone());
    }
  }
  /** 掠顶 (act-138 强化): high over a foe, a crisp vertical 3D voxel downward crescent chop onto its crown */
  private overHit = new Map<number, number>();
  private overhead(o: { at: THREE.Vector3; y: number; n: number }) {
    if (!hasBoon(this.perks, 'vault')) return 0;
    let n = 0;
    const fwd = this.hero.a.fwd().setY(0).normalize();
    for (const f of this.foes.slice()) {
      if (f.st === 'dead' || this.overHit.get(f.uid) === o.n) continue;
      if (Math.hypot(f.pos.x - o.at.x, f.pos.z - o.at.z) > f.d.r + 0.5) continue;
      this.overHit.set(f.uid, o.n); n++;
      const head = f.a.head();
      slashArc.clashCross(head.clone().add(V3(0, 0.15, 0)), fwd, Math.PI * 0.46, 'iai', 0.22, 0.78);
      fxSparks(head, 0xfff4d8, 8, 3.2); cue('swingLight', 0.75);
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
  private beheadable(f: Foe) { return hasBoon(this.perks, 'behead') && f.kind !== 'dummy' && !isBoss(f) && f.inv <= 0 && f.st !== 'dead' && f.hp < f.maxHp * v(this.perks, 'behead') * (f.brokenT > 0 ? 1.6 : 1) / (f.elite ? 200 : 100); }
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
  /** 断云 (act-138 强化): alternating mid-air X-slash voxels (n=1,2) followed by a vertical downward cleave (n=3) */
  private airCut(o: { foe: Foe | null; from: THREE.Vector3; yaw: number; dmg: number; n: number }) {
    const fx = Math.sin(o.yaw), fz = Math.cos(o.yaw), f = o.foe, last = o.n >= 3;
    const at = f ? f.a.chest() : o.from.clone().add(V3(fx * 1.0, 0.9, fz * 1.0)), side = V3(fz, 0, -fx);
    slashArc.swing({ kind: last ? 'acutF' : 'acut', from: o.from, follow: this.hero.pos, yaw: o.yaw, range: 1.75, half: 1.15, n: o.n });
    slashArc.clashCross(at, last ? V3(fx, 0, fz) : side, last ? Math.PI * 0.44 : (o.n === 1 ? 0.54 : -0.54), last ? 'heavy' : 'air', 0.22, last ? 0.96 : 0.76);
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
  /** 牵红: the foe with the freshest dart in him (or boomerang mark — act-118) that the cord reaches (2..dart range), and whether he is too heavy to pull */
  private reelTarget(p: THREE.Vector3, min: number): { foe: Foe; heavy: boolean } | null {
    let bestF: Foe | null = null, bestAge = 1e9;
    for (const d of this.darts) {
      if (d.dead || !d.stuck) continue; const f = d.stuck as Foe; if (f.st === 'dead' || f.kind === 'dummy') continue;
      const l = Math.hypot(f.pos.x - p.x, f.pos.z - p.z); if (l < min || l > TUNE.dartRange + 1) continue;
      if (d.stuckT < bestAge) { bestAge = d.stuckT; bestF = f; }
    }
    if (!bestF) for (const f of this.foes) {
      if (f.st === 'dead' || f.kind === 'dummy' || (f.dartMarkT ?? 0) <= 0) continue;
      const l = Math.hypot(f.pos.x - p.x, f.pos.z - p.z); if (l < min || l > TUNE.dartRange + 1) continue;
      const age = TUNE.chaseWin - (f.dartMarkT ?? 0);
      if (age < bestAge) { bestAge = age; bestF = f; }
    }
    if (!bestF) return null;
    return { foe: bestF, heavy: isBoss(bestF) || bestF.d.role === 'brute' || bestF.elite };
  }
  /** 牵红: the red cord from her left hand to the dart; a light one is dragged to `to` (stumbling, a small cut of damage), a heavy one
   *  only jerks (she goes to him); the darts in him are spent; act-118: exposes target so next blade hit is a guaranteed crit */
  private reels: Array<{ foe: Foe; from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; self: boolean; line: THREE.Mesh; landed: boolean }> = [];
  private reelIn(o: { foe: Foe; to: THREE.Vector3; dur: number; dmg: number; self: boolean }) {
    const f = o.foe, boss = isBoss(f);
    for (const d of this.darts) if (d.stuck === f && !d.dead) d.stop(false);
    f.dartMarkT = 0; f.exposeT = 2.6;
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
    this.feel('stomp', true, 1, V3(0, 0, 0));
    if (archTier(this.perks, 'gale') >= 3 && this.hero) this.hero.galeBuffT = 3.2;
    return 1;
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
    const eqKid = equippedKeepsake(profile(), this.dbgAllWeapons);
    for (const e of r.events) if (e.k === 'break' && e.drop) {
      if (e.drop.kind === 'coins') this.coinsFx.drop(V3(e.p.x, 0.3, e.p.z), e.drop.n, 1);
      else { const mul = eqKid === 'sunao' ? 2 : 1; const was = this.hero.hp; this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + e.drop.n * mul); this.healFeed(was); this.hud.flask.heal({ hp: this.hero.hp, maxHp: this.hero.maxHp }); fxSparks(this.hero.a.chest(), 0x9aff9a, 10, 2); }
    }
    const envMul = (eqKid === 'luxun' ? 1.5 : 1) * (this.genBlessings.has('luxun') ? 2 : 1);
    for (const d of r.damage) {
      const from = V3(d.fromX, 0.5, d.fromZ);
      if (d.target.hero) {
        if (d.cause === 'fire') { if (this.hero.iframe || !this.hero.alive) continue; this.hero.hp = Math.max(this.phase === 'yard' ? 1 : 0, this.hero.hp - d.dmg); this.hud.flask.hit(d.dmg, { hp: this.hero.hp, maxHp: this.hero.maxHp }); this.hero.a.tint(0xff7a2a, 0.5); if (this.hero.hp <= 0) this.hurtHero(1, from); }
        else this.hurtHero(d.dmg, from);
      } else { const f = d.target.id as Foe; if (f.st === 'dead') continue; this.hitFoe(f, Math.round(d.dmg * envMul), from, { knock: d.knock, heavy: d.cause !== 'fire', kind: 'school', stagger: d.down || (d.cause === 'fire' ? 0.1 : undefined) }); }
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
    const slamMul = (this.hero?.weaponId === 'thunder' && this.hero.weaponLv >= 1 ? 2 : 1) * (equippedKeepsake(profile(), this.dbgAllWeapons) === 'luxun' ? 1.5 : 1) * (this.genBlessings.has('luxun') ? 2 : 1);
    this.hitFoe(f, Math.round(SLAM.dmg * slamMul), at, { knock: 0, heavy: true, kind: 'school', stagger: isBoss(f) ? 0 : SLAM.stun }); cue('wallSlam', 0.9);
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
  /** act-118: combo & move-variety helpers (alternating moves ramps damage, crit & qi instead of rewarding basic-attack mashing) */
  private resetCombo() { this.comboHits = 0; this.comboT = 0; this.comboKinds = []; this.hud.combo = { hits: 0, bonus: 0, frac: 0 }; }
  private moveFamily(kind: string): string {
    if (kind === 'k1' || kind === 'k2' || kind === 'k3' || kind === 'k4') return 'basic';
    if (kind === 'k5' || kind === 'wind' || kind === 'echo') return 'finisher';
    if (kind === 'dcut' || kind === 'pass' || kind === 'kick') return 'dash';
    if (kind === 'dart' || kind === 'chase' || kind === 'reel') return 'dart';
    if (kind === 'rel' || kind === 'rel2' || kind === 'parry' || kind === 'burst') return 'stance';
    if (kind === 'plunge' || kind === 'launch' || kind === 'acut' || kind === 'acutS' || kind === 'swoop' || kind === 'stomp' || kind === 'overhead' || kind === 'rift') return 'air';
    return kind;
  }
  private recordCombo(kind: string) {
    if (kind === 'school' || kind === 'ultTick' || kind === 'echo') return;
    this.comboHits++; this.comboT = 3.2;
    const fam = this.moveFamily(kind);
    this.comboKinds.push(fam);
    if (this.comboKinds.length > 5) this.comboKinds.shift();
  }
  private comboStyle(): { dmgPct: number; critAdd: number; qiMul: number } {
    const uniq = new Set(this.comboKinds).size;
    const tier = Math.max(0, Math.min(3, uniq - 1));
    const step = 10 + Math.round(this.mods.styleBonus * 100);
    return { dmgPct: tier * step, critAdd: tier * 0.05, qiMul: 1 + tier * 0.15 };
  }
  private syncHeroMods() {
    if (!this.hero) return;
    const gale2 = archTier(this.perks, 'gale') >= 2 ? 0.85 : 1;
    const shad2 = archTier(this.perks, 'shadow') >= 2 ? 0.78 : 1;
    this.hero.dashCdMul = Math.max(0.72, this.mods.dashCdMul * gale2);
    this.hero.dartReloadMul = Math.max(0.55, (1 - 0.12 * this.mods.dartBonus) * shad2);
  }
  private healHero(amount: number) {
    if (!this.hero?.alive || amount <= 0) return;
    const was = this.hero.hp;
    this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + Math.round(amount));
    if (this.hero.hp > was) { this.healFeed(was); this.hud.flask.heal({ hp: this.hero.hp, maxHp: this.hero.maxHp }); fxSparks(this.hero.a.chest(), 0x8effa8, 8, 2.5); }
  }
  private hitFoe(f: Foe, dmg: number, from: THREE.Vector3, o: { knock: number; heavy: boolean; kind: string; stagger?: number; counter?: boolean; poiseMul?: number }) {
    if (f.st === 'dead') return;
    // act-152 Hades-2 Impervious Boss Barrier: bounce blows cleanly with clang + voxel sparks + 「无敌」 pop (zero dmg/poise)
    if (f.inv > 0) {
      f.a.tint(0xfff6c8, 0.9);
      fxSparks(f.a.chest(), 0xfff2a8, 12, 4.5);
      cue('parry', 0.48);
      if (clock.time - (f.mem.invPopAt ?? -9) >= 0.35) {
        f.mem.invPopAt = clock.time;
        popPix('无敌', f.a.head().add(V3(0, 0.58, 0)), { tier: 'highlight', color: '#fff8c8', accent: '#ffd258', h: 0.72, life: 0.75 });
      }
      return;
    }
    const cut = bladeHit(o.kind);
    const knock = o.knock, stagger = o.stagger ?? (o.heavy ? 0.55 : 0.3);
    const wasBroken = f.brokenT > 0;
    this.recordCombo(o.kind);
    const style = this.comboStyle();
    const isAirHit = f.pos.y > 0.15 || f.airV != null;
    const isMarked = (f.dartMarkT ?? 0) > 0 || this.darts.some(dr => !dr.dead && dr.stuck === f);
    const firstHit = f.hp >= f.maxHp && this.mods.firstStrikeBonus > 0 && o.kind !== 'school';
    const poise3 = archTier(this.perks, 'poise') >= 3;
    const isGaleMove = ['dcut', 'pass', 'plunge', 'launch', 'acut', 'acutS', 'swoop', 'stomp', 'overhead', 'rift'].includes(o.kind);
    const gale2 = archTier(this.perks, 'gale') >= 2 && isGaleMove;
    const shad2 = archTier(this.perks, 'shadow') >= 2 && o.kind === 'dart';
    const prof = profile(), kid = equippedKeepsake(prof, this.dbgAllWeapons), kStar = kid ? keepsakeStar(prof, kid) : 1;
    const rollVar = o.kind === 'school' || o.kind === 'ultTick' || o.kind === 'ult' || o.kind === 'clash' ? 1 : (0.90 + Math.random() * 0.20);
    const isFixedBurst = o.kind === 'ult' || o.kind === 'ultTick' || o.kind === 'clash';
    // act-152 Hades-2 additive damage pool (prevents exponential multiplicative blowup across 5 regions!)
    let addPct = (this.mods.dmgMul - 1) + style.dmgPct / 100;
    if (wasBroken) {
      if (kid === 'fengtiebi') addPct += KEEPSAKES.fengtiebi.vals[kStar - 1] / 100;
      if (this.genBlessings.has('lubu')) addPct += 0.20;
    }
    if (isAirHit && o.kind !== 'launch') addPct += 0.25;
    if (firstHit) addPct += this.mods.firstStrikeBonus;
    if (cut && isMarked && this.mods.markedDmgBonus > 0) addPct += this.mods.markedDmgBonus;
    if (gale2) addPct += 0.25;
    if (kid === 'zhaoyun' && isGaleMove && KEEPSAKES.zhaoyun) addPct += KEEPSAKES.zhaoyun.vals[kStar - 1] / 100;
    if (this.genBlessings.has('zhaoyun') && isGaleMove) addPct += 0.25;
    if (shad2) addPct += 0.25;
    if ((o.kind === 'parry' || o.counter) && this.mods.counterBonus > 0) addPct += this.mods.counterBonus;
    if ((o.kind === 'parry' || o.kind === 'arrow' || o.counter) && kid === 'xiahoudun' && KEEPSAKES.xiahoudun) addPct += KEEPSAKES.xiahoudun.vals[kStar - 1] / 100;
    if ((o.kind === 'parry' || o.kind === 'arrow') && this.genBlessings.has('xiahoudun')) addPct += 0.45;
    let mul = isFixedBurst
      ? (1 + (this.mods.dmgMul - 1) * 0.5)
      : this.dmgMul(o.kind) * (1 + addPct) * rollVar;
    if (!isFixedBurst && wasBroken) mul *= poise3 ? 1.50 : POISE_BREAK_MUL;
    if ((o.kind === 'ult' || o.kind === 'ultTick') && this.hero?.weaponId === 'blunt' && this.hero.weaponLv >= 3) mul *= 1.25;
    const exposed = cut && (f.exposeT ?? 0) > 0;
    const revengeCrit = cut && this.ksRevenge;
    const guaranteedCrit = !isFixedBurst && (firstHit || exposed || revengeCrit || (wasBroken && poise3) || (o.kind === 'swoop' && (wasBroken || f.hp < f.maxHp * 0.5)));
    const critChance = 0.08 + this.mods.critBonus + style.critAdd + (this.hero?.galeBuffT > 0 ? 0.18 : 0);
    const crit = !isFixedBurst && o.kind !== 'school' && (guaranteedCrit || Math.random() < critChance);
    if (crit) mul *= 1.35;
    if (exposed) f.exposeT = 0;
    if (revengeCrit) { this.ksRevenge = false; this.healHero(5); }
    // act-152 Boss 1 (石雷) Thunder Flag Shield: while any Yellow Turban Thunder Flag stands, Stone Thunder takes 40% less damage!
    if (f.kind === 'hj_boss' && this.foes.some(o2 => o2.kind === 'totem_flag' && o2.st !== 'dead')) {
      mul *= 0.6;
      if (Math.random() < 0.35) popPix('雷旗护阵', f.a.head().add(V3(0, 0.55, 0)), { color: '#ffe478', h: 0.46, life: 0.65 });
    }
    // act-132: Lu Bu 1v1 trial heavy armor suppresses mindless light-attack spam (use parry / dodge / clash / poise-break!)
    if (this.generalEvent?.isDuelFoe(f) && o.kind !== 'parry' && o.kind !== 'counter' && o.kind !== 'chase' && o.kind !== 'clash') mul *= 0.25;
    let d = Math.max(1, Math.round(dmg * mul));
    const executed = cut && this.beheadable(f);
    if (executed) d = f.hp + 1;
    const p = f.a.chest(), dir = f.pos.clone().sub(from).setY(0).normalize();
    let fallNow = false;
    if (this.prologue === 2 && isBoss(f) && !this.proFalling) { const floor = Math.ceil(f.maxHp * 0.2); if (f.hp - d <= floor) { d = Math.max(0, f.hp - floor); fallNow = true; } }
    if (this.generalEvent?.isDuelFoe(f) || this.generalEvent?.isFogFoe(f)) {
      const floor = Math.ceil(f.maxHp * 0.25);
      if (f.hp - d < floor) d = Math.max(0, f.hp - floor);
    }
    // act-122 三国名将交锋（吕布 / 夏侯惇）：绝不强杀历史名将，血量触及 75% 即优雅收招触发战后对白与馈赠
    let duelDoneNow = false;
    if (this.duelGen && !this.duelGen.done && this.duelGen.f === f) {
      const floor = Math.ceil(f.maxHp * 0.72);
      if (f.hp - d <= Math.ceil(f.maxHp * 0.75)) { d = Math.max(0, f.hp - floor); duelDoneNow = true; }
    }
    let guardK = 1;   // (act-161: what the guard let through of this blow — the blood burst it sets off is cut the same)
    { const g = f.inv <= 0 ? ROLE_AI[f.role]?.guard?.(f, d, from, o.kind) : undefined; if (g != null) { if (g < 0) return; if (g === 0) { this.glance(f, from, o.kind); return; } guardK = d > 0 ? Math.min(1, g / d) : 1; d = Math.round(g); } }
    if (f.mem.armoredHit) {
      f.mem.armoredHit = 0;
      if (Math.random() < 0.45) popPix('重甲', f.a.head().add(V3(0, 0.55, 0)), { color: '#ffc880', h: 0.48, life: 0.65 });
    }
    if (f.mem.needleBreak) {
      f.mem.needleBreak = 0;
      popPix('破遁', f.a.head().add(V3(0, 0.58, 0)), { tier: 'highlight', color: '#c8f6ff', accent: '#56ccf2', h: 0.8, life: 0.9 });
    }
    // act-152: Decoupled poise damage (based on move family instead of raw multiplied HP damage, preventing 2-hit Boss poise locks!)
    const basePoise = o.kind === 'dart' ? 3 : o.kind === 'ultTick' ? 2 : o.kind === 'ult' ? 14
      : o.kind === 'arrow' ? (f.kind === 'xp_boss' ? 40 : 22)
      : (o.kind === 'kick' || o.kind === 'parry' || o.kind === 'clash' || o.kind === 'stomp') ? 28
      : (o.kind === 'launch' || o.kind === 'chase' || o.kind === 'burst') ? 22
      : (o.kind === 'rel' || o.kind === 'rel2' || o.kind === 'dcut' || o.kind === 'plunge' || o.kind === 'swoop') ? 18
      : o.heavy ? 15 : 8;
    const armored = f.kind === 'ly_boss' && f.phase === 1 && f.st !== 'stagger' && f.brokenT <= 0 && !o.heavy && o.kind !== 'parry' && o.kind !== 'clash';
    const poiseDmg = armored ? 0 : Math.round(basePoise * (o.poiseMul ?? 1) * this.mods.poiseDmgMul * (archTier(this.perks, 'poise') >= 2 ? 1.25 : 1) * (this.genBlessings.has('lubu') ? 1.30 : 1));
    let died = damageFoe(f, d, from, { knock, stagger, poiseDmg, heavy: o.heavy });
    if (__DEBUG_UI__) this.tally(o.counter ? o.kind + '+counter' : o.kind, d, f);
    const justBroke = !died && !wasBroken && f.brokenT > 0;
    if (justBroke) {
      fxChips(p, [0xf2c248, 0xffe896, 0x4b5262], 10, { dir, speed: 5.5, up: 3.6, size: 0.095, glow: 0.8 });
      fxSparks(p, 0xffe48a, 16, 6.2, { hot: true, dir, dirK: 0.7, life: 0.42 });
      popPix('破势', f.a.head().add(V3(0, 0.55, 0)), { tier: 'highlight', color: '#fff4c4', accent: '#ffd258', h: 0.92, life: 1.05 });
      hitstop(0.085 * TUNE.hitstop); shake(0.32 * TUNE.shake);
      this.splitScreen(0.55); this.impactScreen(0.75); this.camPunch(0.055); this.platform.vibrate('heavy');
      this.hero?.gainQi(0.55 * style.qiMul);
      if (this.mods.poiseHeal > 0 && clock.time - this.poiseHealAt >= 6.0) { this.poiseHealAt = clock.time; this.healHero(this.mods.poiseHeal); }
      if ((this.phase === 'fight' || this.phase === 'yard') && !this.duel.on) { if (this.intent >= 3) this.startQte(); else this.addIntent(0.50); }
      this.generalEvent?.onFoePoiseBreak(f);
    }
    this.generalEvent?.onFoeHit(f, o.counter ? 'counter' : o.kind);
    if (o.kind === 'clash') this.generalEvent?.onHeroClashWin();
    if (this.prologue === 2 && isBoss(f)) f.hp = Math.max(f.hp, Math.ceil(f.maxHp * 0.2));
    if (fallNow) { f.mem.noHide = true; revealFoe(f); this.foeWorld.dark?.(0); after(0.25, () => void this.prologueFall()); }
    if (this.duelGen && this.duelGen.f === f) f.hp = Math.max(f.hp, Math.ceil(f.maxHp * 0.72));
    if (duelDoneNow) after(0.18, () => { void this.finishDuelGeneral(); });
    const bleedCap = 5 + (kid === 'luzhao' ? KEEPSAKES.luzhao.vals[kStar - 1] : 0);
    if (cut && !died && f.inv <= 0 && hasBoon(this.perks, 'bleed') && f.kind !== 'dummy') { f.bleed = Math.min(bleedCap, f.bleed + 1); f.bleedT = 0; }
    // act-114 / act-118 见红 × 血刃成势: blood burst detonates on >=3 stacks; 血刃 2pc boosts damage +35%, 3pc heals 3 HP (4s CD) + empowers next cut
    const heavyFinisher = o.kind === 'k5' || o.kind === 'rel' || o.kind === 'rel2' || o.kind === 'parry' || o.kind === 'plunge' || o.kind === 'acutS' || o.kind === 'chase';
    const bloodTier = archTier(this.perks, 'blood');
    if (!died && f.inv <= 0 && f.kind !== 'dummy' && hasBoon(this.perks, 'bleed') && f.bleed >= 3 && (justBroke || heavyFinisher || (bloodTier >= 2 && f.bleed >= 4))) {
      let bDmg = Math.max(4, Math.round(f.bleed * v(this.perks, 'bleed') * 3.2 * (bloodTier >= 2 ? 1.35 : 1) * (f.brokenT > 0 ? POISE_BREAK_MUL : 1)));
      if (this.prologue === 2 && isBoss(f)) bDmg = Math.min(bDmg, Math.max(0, f.hp - Math.ceil(f.maxHp * 0.2)));
      if (this.duelGen && this.duelGen.f === f) bDmg = Math.min(bDmg, Math.max(0, f.hp - Math.ceil(f.maxHp * 0.72)));
      f.bleed = 1; f.bleedT = 0;
      if (bDmg > 0) {
        // act-161: the burst's poise damage is a flat 10 (it was 0.6 × its damage — the one blow whose poise still followed its damage), none through
        // 阎虎's phase-one plate, and the burst is cut by the guard / the thunder flags like the blow that set it off
        bDmg = Math.max(1, Math.round(bDmg * guardK * (f.kind === 'hj_boss' && this.foes.some(o2 => o2.kind === 'totem_flag' && o2.st !== 'dead') ? 0.6 : 1)));
        died = damageFoe(f, bDmg, from, { knock: 0.6, stagger: 0.45, poiseDmg: armored ? 0 : 10 });
        if (__DEBUG_UI__) this.tally('bleedBurst', bDmg, f);
        if (this.prologue === 2 && isBoss(f)) f.hp = Math.max(f.hp, Math.ceil(f.maxHp * 0.2));
        if (this.duelGen && this.duelGen.f === f) f.hp = Math.max(f.hp, Math.ceil(f.maxHp * 0.72));
        blood.spray(p, dir, 36, 1.45);
        fxChips(p, [0xc82428, 0xff5a4a, 0xffd060], 10, { dir, speed: 5.0, up: 3.2, size: 0.09, glow: 0.85 });
        popPix('血爆', f.a.head().add(V3(0, 0.62, 0)), { tier: 'highlight', color: '#ff7064', accent: '#ff3a2c', h: 0.88, life: 1.02 });
        popPix(String(bDmg), f.a.head().add(V3(0.28, 0.36, 0)), { tier: 'crit', color: '#ff8a70', h: 0.68 });
        cue('bloodBurst', 1); hitstop(0.055 * TUNE.hitstop); shake(0.24 * TUNE.shake); this.splitScreen(0.45);
        if (bloodTier >= 3) {
          if (clock.time - this.bloodHealAt >= 4.0) { this.bloodHealAt = clock.time; this.healHero(3); }
          if (this.hero) this.hero.counterT = Math.max(this.hero.counterT, 2.0);
        }
      }
    }
    if (wasBroken && f.kind !== 'dummy' && o.kind !== 'school' && o.kind !== 'dart') cue('bladeRing', 0.46, 1.34 + (o.heavy ? 0.12 : 0));
    if (executed) { const c = f.a.chest(); trailSeg(c.clone().add(V3(-0.7, 0.55, 0)), c.clone().add(V3(0.7, -0.5, 0)), 0xff3a2a, 0.16, { life: 0.35, bright: 2.8, spark: 0.6 }); trailSeg(c.clone().add(V3(-0.7, -0.5, 0)), c.clone().add(V3(0.7, 0.55, 0)), 0xffe0d0, 0.1, { life: 0.3, bright: 2.6 }); popPix('斩', f.a.head().add(V3(0, 0.6, 0)), { tier: 'highlight', color: '#ff6e5a', accent: '#ff2e22', h: 0.96, life: 1.05 }); cue('gore', 0.9); this.splitScreen(0.55); }
    if (o.kind !== 'school') {
      const groundRing = o.heavy && (o.kind === 'k5' || o.kind === 'plunge' || o.kind === 'acutS' || o.kind === 'rel' || o.kind === 'parry' || o.kind === 'ult');
      const pw = o.kind === 'dart' ? 0.4 : o.kind === 'ultTick' ? 0.35 : (o.heavy || crit) ? 1.2 : 0.72;
      fxImpact(p, crit ? 0xffe468 : wasBroken ? 0xffda60 : o.heavy ? 0xff6a3a : o.kind === 'ultTick' ? 0xffc890 : 0xfff0d0, pw, { dir, ground: groundRing, chips: (o.heavy || crit) ? [0xffd060, 0xff5a3a] : undefined, stop: false, shake: false });
      f.a.jolt(dir, o.kind === 'dart' || o.kind === 'ultTick' ? 0.35 : o.heavy ? 1.15 : 0.6);
    }
    if (f.kind !== 'dummy' && o.kind !== 'school') { const n = o.kind === 'dart' ? 5 : o.kind === 'ultTick' ? 7 : o.kind === 'rel' ? 42 : o.heavy ? 28 : 16; blood.spray(p, dir, (died ? n + 20 : n) * (executed ? 2 : 1), o.heavy || died ? 1.35 : 1); this.fleshHit = true; }
    {
      const isBig = o.kind === 'rel' || o.kind === 'ult' || o.kind === 'parry';
      const isDot = o.kind === 'ultTick' || o.kind === 'dart' || o.kind === 'echo';
      const popTier = isBig ? 'highlight' : (crit || wasBroken || o.heavy) ? 'crit' : isDot ? 'dot' : 'normal';
      const popCol = crit ? '#ffe860' : wasBroken ? '#ffec84' : isBig ? '#fff4cc' : o.kind === 'ultTick' ? '#ffd69a' : o.heavy ? '#ffae5a' : isDot ? '#e8d8c4' : '#f6f2e8';
      popPix(crit ? `${d}!` : String(d), f.a.head().add(V3(0, 0.32, 0)), { tier: popTier, color: popCol, accent: isBig ? '#ffd268' : undefined, h: isBig ? 0.88 : popTier === 'crit' ? 0.68 : isDot ? 0.38 : 0.48 });
    }
    if (crit && f.kind !== 'dummy') cue('crit', 0.55);
    if (!died && o.heavy && knock >= 1.2 && this.launchable(f) && f.pos.y < 0.05) f.airV = Math.max(f.airV ?? 0, 2.2 + knock * 1.3);
    if (died) this.killFoe(f, from);
    else if (f.kind !== 'dummy' && o.kind !== 'school' && o.kind !== 'dart' && (o.heavy || Math.random() < 0.33)) cue('foePain', o.heavy ? 1 : 0.75, voiceOf(f));
    // 叠刃 (act-138 强化): crisp delayed 3D voxel diagonal phantom cross-slash cleaving through the target 0.12s after k5!
    if (o.kind === 'k5' && !died && f.inv <= 0 && tierOf(this.perks, 'extra') >= 0) { const target = f, origin = from.clone(), echo = dmg * v(this.perks, 'extra') / 100; after(0.12, () => { if (target.st === 'dead' || !this.foes.includes(target)) return; const c = target.a.chest(), side = V3(Math.cos(this.hero.a.yaw), 0, -Math.sin(this.hero.a.yaw)); slashArc.clashCross(c, side, -0.58, 'heavy', 0.24, 0.92); fxSparks(c, 0xffd6b0, 8, 3.2); cue('swingLight', 0.75); this.hitFoe(target, echo, origin, { knock: 0.2, heavy: false, kind: 'echo' }); }); }
  }
  /** act-125 / act-137: 惊雷陌刀 藏锋变招「裂阵斩」— restrained storm-gold & forged-iron ground cleave shattering shields/poise */
  private thunderCleave(o: { from: THREE.Vector3; yaw: number; len: number; dmg: number; chargeK: number; lv: number }) {
    const dir = V3(Math.sin(o.yaw), 0, Math.cos(o.yaw)), to = o.from.clone().addScaledVector(dir, o.len);
    slashArc.line({ a: o.from, b: to, width: 1.02, y: 0.72, palette: 'thunder_heavy', sweep: 0.025, fade: 0.32 });
    for (let i = 0; i <= 5; i++) {
      const p = o.from.clone().lerp(to, i / 5).setY(0.14 + (i % 2) * 0.16);
      addBlock(p, { size: 0.10, v: V3((Math.random() - 0.5) * 1.8, 1.8 + Math.random() * 2.0, (Math.random() - 0.5) * 1.8), col: i % 2 ? 0xf0ca68 : 0x565e74, bright: 1.18, life: 0.34, shrink: 0.5, drag: 2.4, grav: 4.5 });
    }
    fxShock(o.from.clone().addScaledVector(dir, 1.4), 0xe6be5c, 1.65, { life: 0.30 });
    let n = 0;
    const ab = to.clone().sub(o.from).setY(0), L2 = Math.max(1e-4, ab.lengthSq());
    for (const f of this.foes.slice()) {
      if (f.st === 'dead') continue;
      const t = Math.max(0, Math.min(1, f.pos.clone().sub(o.from).setY(0).dot(ab) / L2)), q = o.from.clone().addScaledVector(ab, t);
      if (Math.hypot(f.pos.x - q.x, f.pos.z - q.z) <= 1.25 + f.d.r) {
        this.hitFoe(f, o.dmg, q, { knock: 2.2, heavy: true, kind: 'rel', poiseMul: 2.6 });
        if (o.lv >= 2 && (f.st as string) !== 'dead') {
          // lv2: restrained narrow vertical pale-gold thunder flash (zero garish neon pillar)
          const lp = f.pos.clone();
          for (let y = 0; y < 3; y++) addBlock(lp.clone().setY(0.45 + y * 0.72), { size: 0.14, col: y % 2 ? 0xfff0be : 0xdcb452, bright: 1.28, life: 0.22, shrink: 0.45, drag: 1, grav: 0 });
          this.hitFoe(f, Math.round(o.dmg * 0.4), lp, { knock: 0.5, heavy: false, kind: 'school' });
        }
        n++;
      }
    }
    if (this.props) this.applyProps(this.props.hitSeg(o.from, to, 1.25, { src: 'hero', heavy: true }, this.targets()));
    this.generalEvent?.strike({ k: 'seg', ax: o.from.x, az: o.from.z, bx: to.x, bz: to.z, r: 1.25 });
    this.feel('rel', true, Math.max(1, n), dir);
    cue('boom', 0.72); shake(0.28 * TUNE.shake);
    return n;
  }
  /** act-125 / act-137: 霜鳞短刃 藏锋变招「追霜」— razor-sleek hoarfrost thread detonating stuck pins/darts cleanly */
  private frostDetonate(o: { a: THREE.Vector3; b: THREE.Vector3; r: number; dmg: number; lv: number }) {
    const ab = o.b.clone().sub(o.a).setY(0), L2 = Math.max(1e-4, ab.lengthSq());
    slashArc.line({ a: o.a, b: o.b, width: 0.68, y: 0.9, palette: 'frost_heavy', sweep: 0.02, fade: 0.26 });
    let hits = 0, popped = 0;
    for (const f of this.foes.slice()) {
      if (f.st === 'dead') continue;
      const t = Math.max(0, Math.min(1, f.pos.clone().sub(o.a).setY(0).dot(ab) / L2)), q = o.a.clone().addScaledVector(ab, t);
      const near = Math.hypot(f.pos.x - q.x, f.pos.z - q.z) <= o.r + f.d.r;
      const stuckDarts = this.darts.filter(d => !d.dead && d.stuck === f);
      const pins = stuckDarts.length + ((f.dartMarkT ?? 0) > 0 ? 1 : 0);
      if (!near && pins <= 0) continue;
      if (near) { this.hitFoe(f, o.dmg, q, { knock: 0.9, heavy: true, kind: 'rel' }); hits++; }
      if (pins > 0 && (f.st as string) !== 'dead') {
        for (const d of stuckDarts) d.stop(false);
        f.dartMarkT = 0;
        popped += pins;
        const burstDmg = Math.round(o.dmg * 0.55 * pins);
        const cp = f.a.chest();
        for (let i = 0; i < 5; i++) addBlock(cp.clone(), { size: 0.08, v: V3((Math.random() - 0.5) * 3.6, 1.1 + Math.random() * 2.0, (Math.random() - 0.5) * 3.6), col: i % 2 ? 0xf2fbff : 0x8bcbe0, bright: 1.2, life: 0.30, shrink: 0.45, drag: 2.5, grav: 3.2 });
        fxRing(f.pos.clone().setY(0.1), 0x9cd6ea, 1.25, { life: 0.28 } as never);
        popPix('霜爆', f.a.head().add(V3(0, 0.52, 0)), { tier: 'highlight', color: '#dcf6ff', accent: '#6cb8d4', h: 0.78, life: 0.85 });
        this.hitFoe(f, burstDmg, cp, { knock: 1.1, heavy: true, kind: 'chase' });
        if (o.lv >= 2 && (f.st as string) !== 'dead') { interruptFoe(f, 1.4); f.a.tint(0x88cde4, 0.65); }
      }
    }
    if (this.props) this.applyProps(this.props.hitSeg(o.a, o.b, o.r, { src: 'hero', heavy: true }, this.targets()));
    this.generalEvent?.strike({ k: 'seg', ax: o.a.x, az: o.a.z, bx: o.b.x, bz: o.b.z, r: o.r });
    this.feel('rel', true, Math.max(1, hits + popped), ab.clone());
    if (popped > 0) cue('bladeRing', 0.9);
    return { hits, popped };
  }
  /** act-125 / act-137: 无锋断刃 极限「听声一闪」— single razor-sharp cinnabar-steel flash streak with restrained impact flash */
  private bluntFlash(o: { from: THREE.Vector3; to: THREE.Vector3; r: number; dmg: number; lv: number }) {
    const ab = o.to.clone().sub(o.from).setY(0), L2 = Math.max(1e-4, ab.lengthSq());
    const ext = ab.clone().setY(0).normalize().multiplyScalar(0.9), a0 = o.from.clone().sub(ext), b0 = o.to.clone().add(ext);
    slashArc.line({ a: a0, b: b0, width: 0.78, y: 1.0, palette: 'blunt_flash', sweep: 0.02, fade: 0.32 });
    this.flashScreen(0.18, 0xffd2b8); this.splitScreen(0.62);
    let n = 0, killed = false;
    for (const f of this.foes.slice()) {
      if (f.st === 'dead') continue;
      const t = Math.max(0, Math.min(1, f.pos.clone().sub(o.from).setY(0).dot(ab) / L2)), q = o.from.clone().addScaledVector(ab, t);
      if (Math.hypot(f.pos.x - q.x, f.pos.z - q.z) <= o.r + f.d.r) {
        const wasAlive = (f.st as string) !== 'dead';
        this.hitFoe(f, o.dmg, q, { knock: 2.1, heavy: true, kind: 'parry', poiseMul: 2.0 });
        if (wasAlive && (f.st as string) === 'dead') killed = true;
        n++;
      }
    }
    if (n > 0) {
      popPix('听声一闪', this.hero.a.head().add(V3(0, 0.55, 0)), { tier: 'highlight', color: '#ffe4c4', accent: '#c84a2a', h: 0.90, life: 0.95 });
      if (this.intent >= 3) this.startQte(); else this.addIntent(0.50);
      if (o.lv >= 2 && killed) this.hero.freeFlash = true;
    }
    if (this.props) this.applyProps(this.props.hitSeg(o.from, o.to, o.r, { src: 'hero', heavy: true }, this.targets()));
    this.generalEvent?.strike({ k: 'seg', ax: o.from.x, az: o.from.z, bx: o.to.x, bz: o.to.z, r: o.r });
    this.feel('rel', true, Math.max(1, n), ab.clone());
    return n;
  }
  private swing(o: { from: THREE.Vector3; yaw: number; range: number; half: number; dmg: number; knock: number; heavy: boolean; kind: string; n?: number; counter?: boolean; poiseMul?: number; pin?: boolean; finalCut?: boolean; weaponId?: WeaponId; bigSpin?: boolean; keepCut?: boolean }) {
    const fx = Math.sin(o.yaw), fz = Math.cos(o.yaw); let n = 0;
    // the counter after a perfect dodge: double damage, a heavy (staggering) blow, a gold flash and a harder stop
    if (o.counter) {
      o = { ...o, dmg: Math.round(o.dmg * TUNE.counterMul), heavy: true, knock: Math.max(o.knock, 1.4) };
      const tip = o.from.clone().add(V3(fx * 1.2, 1.0, fz * 1.2));
      fxImpact(tip, 0xffd060, 1.25, { dir: V3(fx, 0, fz), ground: false, stop: false, shake: false }); fxRing(tip, 0xffe090, 1.4, { life: 0.3 } as never); cue('crit', 1.0);
    }
    // act-109 体素硬边刀弧面片: exact-reach blade crescent/lance synced to every swing, frozen crisply during hitstop
    slashArc.swing({ kind: o.kind, from: o.from, follow: this.hero.pos, yaw: o.yaw, range: o.range, half: o.half, n: o.n, counter: o.counter, bleed: hasBoon(this.perks, 'bleed'), wide: (o.kind === 'k3' && hasBoon(this.perks, 'spin')) || !!o.bigSpin });
    // act-138 扫八方 (pause combo): unmistakable 360° dual-tier silver-gold 3D voxel whirlwind sweep ring on both spins!
    if (o.bigSpin) {
      slashArc.ringArc(o.from, o.range * 0.92, 0.92, 'iai', 0.25, 24);
      fxRing(o.from.clone().setY(0.08), 0xe8ddc2, o.range * 0.95, { life: 0.30, width: 0.12 } as never);
      this.leaves?.blast(o.from.x, o.from.z, o.range + 0.6, 5);
    }
    // act-138 游身斩 (dodge-chain combo): crisp silver-jade sidestep cross-glint bridging the evasion into the cut!
    if (o.keepCut) {
      slashArc.clashCross(o.from.clone().add(V3(fx * 1.15, 0.98, fz * 1.15)), V3(fz, 0, -fx), 0.26, 'swoop', 0.20, 0.78);
      fxSparks(o.from.clone().add(V3(fx * 0.9, 0.95, fz * 0.9)), 0xd8f0e6, 5, 2.8, { dir: V3(fx, 0, fz), dirK: 0.7 });
    }
    // a thrust: a straight burst at the point (the lance itself is now drawn by slashArc)
    if (o.kind === 'k4') {
      const second = (o.n ?? 1) > 1, b = o.from.clone().add(V3(fx * (o.range + (second ? 0.8 : 0.4)), 1.0, fz * (o.range + (second ? 0.8 : 0.4))));
      fxSparks(b, 0xffffff, second ? 10 : 6, second ? 4 : 3, { dir: V3(fx, 0, fz), dirK: 0.8 });
      cue('whoosh', second ? 0.8 : 0.6);
      // 11-18 秘传 透骨: the second thrust runs on as a long white line through everyone in a row (the line is the hit)
      if (second && hasBoon(this.perks, 'pierce')) this.pierceLine(o.from.clone(), V3(fx, 0, fz), o.dmg);
    }
    // 11-18 秘传 荡刃: the 3rd cut throws a ring of wind as far as its reach (hero.ts widens the reach)
    if (o.kind === 'k3' && hasBoon(this.perks, 'spin') && !o.bigSpin) this.spinRing(o.from.clone(), o.range);
    const clashHit = !!(o.counter || o.kind === 'k5');
    let clashed = false;
    for (const f of this.foes.slice()) {
      if (f.st === 'dead') continue;
      const dx = f.pos.x - o.from.x, dz = f.pos.z - o.from.z, l = Math.hypot(dx, dz); if (l > o.range + f.d.r) continue;
      const ang = Math.abs(Math.atan2(dx * fz - dz * fx, dx * fx + dz * fz)); if (l > f.d.r + 0.3 && ang > o.half) continue;
      // act-115: counter slash or heavy finisher colliding with an elite/boss heavy melee windup/lunge locks blades into Clash QTE
      if (clashHit && !clashed && this.duel.offerClash(f, true)) { clashed = true; continue; }
      this.hitFoe(f, o.dmg, o.from, o); n++;
      // act-125 / act-137: 霜鳞短刃 every 3rd/6th cut plants a restrained pale-frost pin glint on struck targets
      if (o.pin && (f.st as string) !== 'dead') {
        f.dartMarkT = Math.max(f.dartMarkT ?? 0, TUNE.chaseWin);
        fxSparks(f.a.chest(), 0xb8ecf8, 4, 2.4);
      }
    }
    if (this.props) this.applyProps(this.props.hitArc(o.from, o.yaw, o.range, o.half, { src: 'hero', heavy: o.heavy }, this.targets()));   // act-19
    if (this.generalEvent) {
      this.generalEvent.strike({ k: 'arc', x: o.from.x, z: o.from.z, yaw: o.yaw, range: o.range + 0.35, half: o.half + 0.15 });
      if (o.heavy || o.counter) this.generalEvent.deflectBolts(o.from, o.yaw, o.range + 0.5, false);
    }
    this.leaves?.cutArc(o.from.x, o.from.z, o.yaw, o.range, o.half);
    // Only heavy finishers / counter-slashes deflect incoming arrows on their impact frame (basic light swings k1..k4 NEVER deflect arrows!)
    if (o.heavy || o.counter) {
      const cut: Arrow[] = [];
      for (const a of this.arrows) if (!a.dead && !a.friendly) { const dx = a.p.x - o.from.x, dz = a.p.z - o.from.z; if (Math.hypot(dx, dz) < o.range + 0.4 && Math.abs(Math.atan2(dx * fz - dz * fx, dx * fx + dz * fz)) < o.half + 0.3) cut.push(a); }
      this.deflect(cut, o.yaw);
    }
    this.feel(o.kind, o.heavy, n, V3(fx, 0, fz)); if (o.counter && n) { hitstop(0.14 * TUNE.hitstop); shake(0.3 * TUNE.shake); }
    // 刀芒 (or 寒山旧刀 1阶末刀自带窄月牙刀光!)
    const hasWave = (o.kind === 'k5' && tierOf(this.perks, 'bladeWind') >= 0) || (o.finalCut && o.weaponId === 'hanshan' && this.hero.weaponLv >= 1);
    if (hasWave) {
      const distMul = tierOf(this.perks, 'bladeWind') >= 0 ? (1 + v2(this.perks, 'bladeWind') / 100) : 0.72;
      this.waves.push(new BladeWave(o.from.clone().add(V3(fx * 0.9, 0.95, fz * 0.9)), V3(fx, 0, fz), 20, 0.42 * distMul, o.weaponId ?? this.hero.weaponId));
      cue('whoosh', 1); fxSparks(o.from.clone().add(V3(fx * 1.2, 1.0, fz * 1.2)), 0xe8edf4, 7, 3.6);
    }
    return n;
  }
  /** 追影: the foe with the freshest dart still in it (or boomerang mark — act-118), near enough */
  private chaseTarget(): Foe | null {
    let bestF: Foe | null = null, bestAge = 1e9;
    for (const d of this.darts) if (!d.dead && d.stuck && (d.stuck as Foe).st !== 'dead' && d.stuck.pos.distanceTo(this.hero.pos) < TUNE.dartRange + 3 && d.stuckT < bestAge) { bestAge = d.stuckT; bestF = d.stuck as Foe; }
    if (!bestF) for (const f of this.foes) if (f.st !== 'dead' && (f.dartMarkT ?? 0) > 0 && f.pos.distanceTo(this.hero.pos) < TUNE.dartRange + 3) { const age = TUNE.chaseWin - (f.dartMarkT ?? 0); if (age < bestAge) { bestAge = age; bestF = f; } }
    return bestF;
  }
  /** 追影: a puff where the hero was, an indigo afterimage and a shadow line to the foe, a puff where it lands; the darts are spent */
  private chaseFx(o: { from: THREE.Vector3; to: THREE.Vector3; foe: Foe }) {
    smokeBurst(o.from, 0.5, 8, { size: 0.26, life: 0.5 }); fxAfterimage(o.from.clone(), 1.9, 0x7a86ff, { life: 0.4, glow: 0.6 });
    trailSeg(o.from.clone().setY(1.0), o.to.clone().setY(1.0), 0x7a86ff, 0.22, { life: 0.35, bright: 2.4, spark: 0.4 });
    smokeBurst(o.to, 0.5, 8, { size: 0.26, life: 0.5 });
    for (const d of this.darts) if (d.stuck === o.foe && !d.dead) d.stop();
    o.foe.dartMarkT = 0;
    // act-114 追影 × 截脉/破防协同: chasing a pinned or guard-broken foe refunds 1 dart charge for nonstop flow
    if (o.foe.brokenT > 0 || this.pinned.has(o.foe.uid)) {
      this.hero.dartAmmo = Math.min(TUNE.dartCharges, this.hero.dartAmmo + 1);
      if (this.hero.dartAmmo > 0) this.hero.dartReload = 0;
      this.hud.btnKick('special', 0.9, 0x9ad8ff); cue('exitChime', 0.4);
    }
    cue('dash', 0.9); cue('swishHeavy', 0.6); shake(0.1 * TUNE.shake);
    this.generalEvent?.onHeroChase(o.foe);
  }
  private sweep(o: { a: THREE.Vector3; b: THREE.Vector3; r: number; dmg: number; knock: number; col?: number; kind?: string }) {
    const ab = o.b.clone().sub(o.a).setY(0), L2 = Math.max(1e-4, ab.lengthSq()); let n = 0;
    let clashed = false;
    for (const f of this.foes.slice()) {
      if (f.st === 'dead') continue;
      const t = Math.max(0, Math.min(1, f.pos.clone().sub(o.a).setY(0).dot(ab) / L2)), q = o.a.clone().addScaledVector(ab, t);
      if (Math.hypot(f.pos.x - q.x, f.pos.z - q.z) <= o.r + f.d.r) {
        if (o.kind === 'dcut' && !clashed && this.duel.offerClash(f, true)) { clashed = true; continue; }
        this.hitFoe(f, o.dmg, q, { knock: o.knock, heavy: true, kind: o.kind ?? 'rel' }); n++;
      }
    }
    if (this.props) this.applyProps(this.props.hitSeg(o.a, o.b, o.r, { src: 'hero', heavy: true }, this.targets()));   // act-19
    this.generalEvent?.strike({ k: 'seg', ax: o.a.x, az: o.a.z, bx: o.b.x, bz: o.b.z, r: o.r + 0.25 });
    if ((o.kind ?? 'rel') === 'rel' || o.kind === 'rel2') {
      // 11-18 一闪 → act-109 / act-138: sculpted wide white-gold Iai cleave ribbon; 追步 (rel2) adds crisp pivot chime & steel-gold ring
      const ext = ab.clone().setY(0).normalize().multiplyScalar(0.8), a0 = o.a.clone().sub(ext), b0 = o.b.clone().add(ext);
      slashArc.line({ a: a0, b: b0, width: o.kind === 'rel2' ? 0.92 : 1.05, y: 1.0, palette: 'iai', sweep: 0.025, fade: 0.34 });
      if (o.kind === 'rel2') { fxRing(o.a.clone().setY(0.1), 0xf4dca0, 1.25, { life: 0.24, width: 0.12 } as never); cue('bladeRing', 0.65); }
      for (let i = 0; i <= 6; i++) fxSparks(a0.clone().lerp(b0, i / 6).setY(1.0), 0xfff4d8, 5, 3);
    } else if (o.kind === 'dcut' || o.kind === 'swoop') {
      slashArc.line({ a: o.a, b: o.b, width: o.kind === 'dcut' ? 0.78 : 0.85, y: o.kind === 'dcut' ? 0.72 : 0.86, palette: o.kind === 'dcut' ? 'dcut' : 'swoop', sweep: 0.03, fade: 0.24 });
    } else trailSeg(o.a.clone().setY(1.0), o.b.clone().setY(1.0), o.col ?? 0xff7a4a, 0.3, { life: 0.3, bright: 2.2, spark: 0.6 });
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
      fxImpact(a.p.clone(), 0xfff4d8, 1.0, { dir, ground: false, stop: false, shake: false }); fxRing(a.p.clone(), 0xffe6a0, 0.7, { life: 0.25 } as never);
      a.deflect(dir);
    }
    hitstop(TUNE.deflectStop); slowmo(TUNE.deflectSlow, 0.3); shake(0.22 * TUNE.shake); this.splitScreen(0.42);
    cue('swishHeavy', 0.7); cue('exitChime', 0.35); this.platform.vibrate('medium'); this.addIntent(0.25);
    this.hero.gainQi(Math.min(0.5, 0.25 * cut.length));   // (11-17 气: a batted arrow is a quarter of a bar)
  }
  /** the blade's guard window: arrows in the front half-circle within reach are batted away */
  private guard(o: { from: THREE.Vector3; yaw: number; range: number }) {
    const fx = Math.sin(o.yaw), fz = Math.cos(o.yaw);
    const cut = this.arrows.filter(a => { if (a.dead || a.friendly) return false; const dx = a.p.x - o.from.x, dz = a.p.z - o.from.z, l = Math.hypot(dx, dz); return l < o.range && (l < 0.9 || (dx * fx + dz * fz) / (l || 1) > -0.15); });
    this.deflect(cut, o.yaw);
    this.generalEvent?.deflectBolts(o.from, o.yaw, o.range + 0.5, false);
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
  /** act-118 (用户：「给成功闪避做一个原地留一个残影吧，帅一些」「闪避的残影颜色要灰白色，蓝色的太赛博朋克了」): ink-ash / pale-white voxel silhouette at the evasion origin */
  private dodgeGhosts: Array<{ g: THREE.Group; matCore: THREE.MeshBasicMaterial; matGlow: THREE.MeshBasicMaterial; ring: THREE.Mesh; t: number; life: number; at: THREE.Vector3 }> = [];
  private spawnDodgeGhost(at: THREE.Vector3, yaw: number) {
    const h = this.hero; if (!h) return;
    const matCore = new THREE.MeshBasicMaterial({ color: 0x52565e, transparent: true, opacity: 0.56, depthWrite: false });
    const matGlow = new THREE.MeshBasicMaterial({ color: 0xe6e4dc, transparent: true, opacity: 0.72, depthWrite: false });
    const core = h.a.body.clone(true), glow = h.a.body.clone(true);
    core.traverse(m => { const mm = m as THREE.Mesh; if (mm.isMesh) { mm.material = matCore; mm.castShadow = false; mm.renderOrder = 6; } });
    glow.traverse(m => { const mm = m as THREE.Mesh; if (mm.isMesh) { mm.material = matGlow; mm.castShadow = false; mm.renderOrder = 7; } });
    glow.scale.setScalar(1.03);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.46, 0.58, 8, 1, Math.PI / 8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xdcdad2, transparent: true, opacity: 0.78, depthWrite: false, side: THREE.DoubleSide }));
    ring.position.y = 0.05; ring.renderOrder = 5;
    const g = new THREE.Group(); g.add(core, glow, ring);
    g.position.copy(at); g.rotation.y = yaw; scene.add(g);
    this.dodgeGhosts.push({ g, matCore, matGlow, ring, t: 0, life: 0.92, at: at.clone() });
    // crisp ash-white wind tether from frozen silhouette to hero's new position + rising voxel ash motes
    const fromChest = at.clone().add(V3(0, 1.0, 0)), toChest = h.a.chest();
    if (fromChest.distanceTo(toChest) > 0.35) trailSeg(fromChest, toChest, 0xeae7df, 0.13, { life: 0.34, bright: 2.2, spark: 0.4 });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      addBlock(at.clone().add(V3(Math.cos(a) * 0.28, 0.2 + (i % 4) * 0.38, Math.sin(a) * 0.28)), { size: 0.075, v: V3(Math.cos(a) * 0.6, 1.6 + (i % 3) * 0.45, Math.sin(a) * 0.6), col: i % 2 ? 0xeeece4 : 0x9ea2aa, glow: false, life: 0.55, shrink: 0.4, drag: 3, grav: 0 });
    }
  }
  private dodgeGhostStep(rdt: number) {
    for (let i = this.dodgeGhosts.length - 1; i >= 0; i--) {
      const gh = this.dodgeGhosts[i]; gh.t += rdt;
      const u = Math.min(1, gh.t / gh.life), fade = u < 0.38 ? 1 : Math.max(0, 1 - (u - 0.38) / 0.62);
      const shimmer = 0.9 + 0.1 * Math.sin(gh.t * 30);
      gh.matCore.opacity = 0.56 * fade;
      gh.matGlow.opacity = 0.72 * fade * shimmer;
      (gh.ring.material as THREE.MeshBasicMaterial).opacity = 0.78 * fade;
      gh.ring.scale.setScalar(1 + u * 0.55);
      if (gh.t >= gh.life) {
        for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; addBlock(gh.at.clone().add(V3(Math.cos(a) * 0.2, 0.4 + k * 0.2, Math.sin(a) * 0.2)), { size: 0.065, v: V3(Math.cos(a) * 1.4, 1.2, Math.sin(a) * 1.4), col: 0xd8d6ce, glow: false, life: 0.32, shrink: 0.5, drag: 4, grav: 0 }); }
        scene.remove(gh.g); gh.matCore.dispose(); gh.matGlow.dispose(); gh.ring.geometry.dispose(); (gh.ring.material as THREE.Material).dispose();
        this.dodgeGhosts.splice(i, 1);
      }
    }
  }
  private dodgeCd = 0;
  private perfectDodge(from: THREE.Vector3) {
    if (this.dodgeCd > 0 || !this.hero.alive) return;
    this.dodgeCd = 0.8; void from; this.hud.btnKick('dash', 1.2, 0xffd060);   // act-29: the dodge button flares gold
    const h = this.hero, at = h.pos.clone();
    const origin = h.st === 'dash' ? h.dashFrom.clone().setY(h.y) : at.clone().setY(h.y);
    const originYaw = h.st === 'dash' ? h.dashStartYaw : h.a.yaw;
    slowmo(TUNE.dodgeSlow, 0.28); shake(0.12 * TUNE.shake);
    fxRing(origin.clone().setY(0.08), 0xe6e4dc, 2.4, { life: 0.5 } as never); fxRing(at.clone().setY(0.9), 0xf4f2ea, 1.2, { life: 0.3 } as never);
    this.spawnDodgeGhost(origin, originYaw);
    fxSparks(h.a.chest(), 0xeeece4, 16, 4.8); h.a.tint(0xe6e4dc, 0.55);
    popPix('闪', h.a.head().add(V3(0, 0.45, 0)), { tier: 'highlight', color: '#f6f4ec', accent: '#dcdad0', h: 0.9, life: 0.95 });
    cue('dodgeOk', 1); this.platform.vibrate('medium');
    h.counterT = TUNE.counterTime; h.dashCd = Math.max(0, h.dashCd * 0.55); h.gainQi(0.45);
    if (h.weaponId === 'blunt') { h.freeFlash = true; popPix('一闪就绪', h.a.head().add(V3(0, 0.78, 0)), { tier: 'highlight', color: '#ffe0b8', accent: '#ff522c', h: 0.72, life: 0.85 }); }
    if (this.mods.poiseHeal > 0 && clock.time - this.poiseHealAt >= 6.0) { this.poiseHealAt = clock.time; this.healHero(this.mods.poiseHeal); }
    if (archTier(this.perks, 'gale') >= 3) h.galeBuffT = 2.5;
    this.generalEvent?.onHeroPerfectDodge();
    if (this.intent >= 3) this.startQte(); else this.addIntent(0.30);
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
    this.flashScreen(o.soft ? 0.05 : 0.16, 0xfff4dc);   // (act-130: restrained warm flash on 一闪 draw so it never blinds the screen)
  }
  /** she has arrived and stands: hold the dramatic stillness beat ONLY on elites / bosses / 见切 counter-draws — plain mobs slice straight through with zero pause! */
  private iaiCut(o: { a: THREE.Vector3; b: THREE.Vector3; r: number; dmg: number; knock: number }) {
    const ab = o.b.clone().sub(o.a).setY(0), L2 = Math.max(1e-4, ab.lengthSq());
    const hitMajor = this.foes.some(f => {
      if (f.st === 'dead' || (!f.elite && !isBoss(f))) return false;
      const t = Math.max(0, Math.min(1, f.pos.clone().sub(o.a).setY(0).dot(ab) / L2));
      const qx = o.a.x + ab.x * t, qz = o.a.z + ab.z * t;
      return Math.hypot(f.pos.x - qx, f.pos.z - qz) <= o.r + f.d.r;
    });
    if ((!hitMajor && !this.hero?.iaiBonus) || TUNE.iaiBeat <= 0.01) {
      this.sweep({ ...o, kind: 'rel' });
      return;
    }
    const BEAT_S = TUNE.iaiBeat; this.iaiHeld = true;
    hitstop(BEAT_S + 0.02); audio.stillness(BEAT_S); this.camPunch(0.03);
    after(BEAT_S, () => { this.iaiHeld = false; if (!this.hero?.alive) return; this.flashScreen(0.22, 0xfff6e4); this.splitScreen(0.72); this.sweep({ ...o, kind: 'rel' }); }, { real: true });
  }
  /** 11-18: a full-screen flash (the grade's flash, fading over ~0.2 s) and the stance's dimming (vignette + a little desaturation);
   *  act-109: restrained pixel-snapped radial chromatic split (GRADE.split) on highlight impacts, decaying briskly */
  private flashK = 0; private splitK = 0; private impactK = 0; private vigBase = -1; private dimK = 0; private tutCam = 0;
  private flashScreen(k: number, col: number) { this.flashK = Math.max(this.flashK, k); GRADE.flashCol.setHex(col); }
  private splitScreen(k: number) { this.splitK = Math.max(this.splitK, Math.min(1, k)); }
  private impactScreen(k: number) { this.impactK = Math.max(this.impactK, Math.min(1, k)); GRADE.impact = this.impactK; }
  private flashStep(rdt: number) {
    if (this.flashK > 0) { this.flashK = Math.max(0, this.flashK - rdt * 4.8); GRADE.flash = this.flashK * 0.62; }
    if (this.splitK > 0) { this.splitK = Math.max(0, this.splitK - rdt * 6.5); GRADE.split = this.splitK * 0.9; }
    if (this.impactK > 0) { this.impactK = Math.max(0, this.impactK - rdt * 22); GRADE.impact = this.impactK; }
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
    if (atk) {
      trailSeg(h.a.chest(), atk.a.chest(), 0xfff2c8, 0.2, { life: 0.25, bright: 3, spark: 0.6 });
      this.hitFoe(atk, TUNE.iaiReflect, h.pos.clone(), { knock: 2.0, heavy: true, kind: 'parry' });
      if (this.duelGen && !this.duelGen.done && this.duelGen.f === atk) {
        this.duelGen.parries++;
        if (this.duelGen.parries >= 2) after(0.22, () => { void this.finishDuelGeneral(); });
      }
    }
    for (const a of this.arrows) if (!a.dead && !a.friendly && a.p.distanceTo(h.pos.clone().setY(1.25)) < 1.8) a.deflect(a.v.clone().multiplyScalar(-1));
    this.generalEvent?.deflectBolts(h.pos, h.a.yaw, 2.8, true);
    this.generalEvent?.onHeroParry(atk);
    if (h.weaponId === 'hanshan' && h.weaponLv >= 2) h.gainQi(0.5);
    if (h.weaponId === 'blunt') {
      h.freeFlash = true;
      if (h.weaponLv >= 1) {
        for (const f of this.foes) if (f.st !== 'dead' && !isBoss(f) && f.pos.distanceTo(h.pos) < 4.2) interruptFoe(f, 1.0);
      }
    }
    if (hasBoon(this.perks, 'burst')) this.burstOut(h.pos.clone());   // 11-18 秘传 崩劲
    hitstop(0.1 * TUNE.hitstop); slowmo(0.18, 0.3); shake(0.35 * TUNE.shake); this.splitScreen(0.72);
    fxRing(h.pos.clone().setY(0.9), 0xfff2c8, 1.6, { life: 0.35 } as never); fxRing(h.pos.clone().setY(0.08), 0xffd890, 2.6, { life: 0.5 } as never); fxSparks(h.a.chest(), 0xfff2c8, 24, 7);
    popPix('识破', h.a.head().add(V3(0, 0.48, 0)), { tier: 'highlight', color: '#fff6cc', accent: '#ffd868', h: 0.96, life: 1.05 });
    cue('parry', 1); cue('cutHeavy', 0.9); this.platform.vibrate('heavy'); this.tut.parried();
    if (this.intent >= 3) this.startQte(); else this.addIntent(0.60);
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
      this.log.push(`teach ${k} ${t[k]}`);   // (11-19: no half-speed any more — the move is shown in full when it is learnt)
    }
  }
  /** 杀意 (fractional 0..3.0 with 1.2s anti-spam ICD); full 3 bars enables QTE 不见刀 */
  intent = 0; private intentVal = 0; private lastIntentAt = -9; private poiseHealAt = -9; private bloodHealAt = -9; private roomDrinkHeal = 0; private shadowEchoAt = -9; private qiVolley = 0;
  private lowBeatT = 0; private lowVigK = 0;
  private fullAuraT = 0; private fullRing: THREE.Mesh | null = null;
  private fullAuraStep(rdt: number, h: Hero) {
    const on = this.intent >= 3 && !this.ultOn && h.alive && (this.phase === 'fight' || this.phase === 'yard');
    if (on) {
      if (!this.fullRing) {
        this.fullRing = new THREE.Mesh(
          new THREE.RingGeometry(0.46, 0.54, 24).rotateX(-Math.PI / 2),
          new THREE.MeshBasicMaterial({ color: 0xf4d88c, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }),
        );
        this.fullRing.renderOrder = 3; scene.add(this.fullRing);
      }
      const breathe = 0.5 + 0.5 * Math.sin(clock.rtime * 4.2);
      this.fullRing.visible = true;
      this.fullRing.position.set(h.pos.x, 0.055, h.pos.z);
      this.fullRing.scale.setScalar(0.96 + 0.08 * breathe);
      (this.fullRing.material as THREE.MeshBasicMaterial).opacity = 0.14 + 0.14 * breathe;
      this.fullAuraT -= rdt;
      if (this.fullAuraT <= 0) {
        this.fullAuraT = 0.26;
        // Restrained single pale-gold wisp drifting upward along her sword / silhouette (distinct energy state, never noisy)
        const ang = Math.random() * Math.PI * 2;
        const p = h.pos.clone().add(V3(Math.cos(ang) * 0.34, 0.35 + Math.random() * 0.7, Math.sin(ang) * 0.34));
        addBlock(p, { size: 0.055, v: V3(Math.cos(ang) * 0.12, 0.85, Math.sin(ang) * 0.12), col: 0xffe6a4, bright: 1.4, life: 0.55, shrink: 0.45, drag: 2, grav: 0 });
      }
    } else if (this.fullRing) {
      this.fullRing.visible = false;
    }
  }
  private addIntent(amount = 0.5, force = false) {
    if (this.intentVal >= 3) return;
    if (!force && clock.time - this.lastIntentAt < 1.2) return;
    this.lastIntentAt = clock.time;
    const wepMul = this.hero?.weaponId === 'hanshan' && this.hero.weaponLv >= 3 ? 1.2 : 1;
    const prev = this.intent;
    this.intentVal = Math.min(3, this.intentVal + amount * wepMul);
    this.intent = Math.floor(this.intentVal);
    this.hud.intent = this.intent;
    if (this.intent >= 3 && prev < 3) {
      cue('bladeRing', 0.72);
      fxRing(this.hero.pos.clone().setY(0.08), 0xffe098, 1.55, { life: 0.4 } as never);
    }
  }
  /** 绝 · 一刀 QTE (original QTE form, deadlock-proofed): pops out during slowmo QTE when 3 bars are full and player lands dodge/parry/poise-break/clash */
  private qteT = -1; private ultOn = false; private qteW!: THREE.Mesh; private qteWin = false;
  private cancelQte() {
    if (this.qteT >= 0 && FX.slowmo > 0 && FX.slowmoScale <= 0.1) FX.slowmo = 0;
    this.qteT = -1; this.qteWin = false;
    this.hud?.qte(null);
    if (this.qteW) this.qteW.visible = false;
  }
  private startQte() {
    if (this.qteT >= 0 || this.ultOn || this.proFalling || this.duel.on || this.cards.on || this.dialogue.on || this.timeline.on) return;
    if (this.phase !== 'fight' && this.phase !== 'yard') return;
    if (!this.hero?.alive) return;
    this.qteT = 0; this.qteWin = true; slowmo(TUNE.qteTime * 1.3 + 0.25, 0.05); cue('timeSlow', 1);
    cue('bladeRing', 0.85); this.platform.vibrate('light');
  }
  private qteFrame(rdt: number) {
    if (this.qteT < 0) {
      this.hud.qte(null); this.qteW.visible = false;
      this.inp.b.ult.pressed = false;
      return;
    }
    if (this.ultOn || this.proFalling || this.cards.on || this.dialogue.on || this.timeline.on || !this.hero?.alive || (this.phase !== 'fight' && this.phase !== 'yard')) {
      this.cancelQte();
      return;
    }
    this.qteT += rdt;
    const h = this.hero, k = this.qteT / TUNE.qteTime, urgent = k >= 0.72;
    this.qteWin = k <= 1.25;
    this.hud.qteDt = rdt; this.hud.qte(Math.min(1, k), urgent);
    this.qteW.visible = true; this.qteW.position.set(h.pos.x, 0.07, h.pos.z); this.qteW.scale.setScalar((0.9 + 2.6 * Math.max(0, 1 - k)) * (urgent ? 1.06 : 1));
    (this.qteW.material as THREE.MeshBasicMaterial).color.setHex(urgent ? 0xfff8dc : 0xffdc78);
    // Pressing 不见刀 at any time during the QTE ring triggers 不见刀 cleanly
    const pressed = this.inp.b.ult.pressed;
    if (pressed) this.inp.b.ult.pressed = false;
    if (pressed && this.qteWin) { this.qteT = -1; this.hud.qte(null); this.qteW.visible = false; void this.ult(); }
    else if (k > 1.25) { this.cancelQte(); cue('click', 0.5); }
  }
  /** 一刀: the hero flashes between nearby foes (7.5m / max 5 targets), then sheathes — everyone cut at once */
  private async ult() {
    if (this.ultOn || this.proFalling || !this.hero?.alive) { FX.slowmo = 0; return; }
    const h = this.hero; this.ultOn = true; this.intent = 0; this.intentVal = 0; this.hud.intent = 0; FX.slowmo = 0; FX.hitstop = 0; FX.hold = 1;
    const G0 = { vig: GRADE.vig, desat: GRADE.desat, exp: GRADE.exposure };
    const restoreGrade = () => { GRADE.vig = G0.vig; GRADE.desat = G0.desat; GRADE.exposure = G0.exp; };
    const aborted = () => this.proFalling || this.hero !== h || !h.alive || this.phase === 'cine' || this.phase === 'talk' || this.phase === 'dead' || this.phase === 'leaving' || this.phase === 'title' || this.phase === 'opening';
    let finishedOk = false;
    try {
    h.forceFree(); h.inv = 4.2;
    const left = this.foes.filter(f => f.st !== 'dead' && f.pos.distanceTo(h.pos) < 7.5), targets: Foe[] = [];
    let at = h.pos.clone();
    while (left.length && targets.length < 5) { left.sort((a, b) => a.pos.distanceTo(at) - b.pos.distanceTo(at)); const f = left.shift()!; targets.push(f); at = f.pos.clone(); }
    const ink = (k: number) => { GRADE.vig = G0.vig + 0.75 * k; GRADE.desat = Math.max(G0.desat, 0.7 * k); GRADE.exposure = G0.exp * (1 - 0.3 * k); };
    for (const f of this.foes) if (f.st !== 'dead' && f.pos.distanceTo(h.pos) < 10) interruptFoe(f, isBoss(f) ? 0.8 : 2.8);
    const feet = h.pos.clone().setY(0), side0 = V3(1, 0, 0);
    trailSeg(feet.clone().addScaledVector(side0, -9).setY(1.1), feet.clone().addScaledVector(side0, 9).setY(1.1), 0xffffff, 0.3, { life: 0.45, bright: 3.4, spark: 0.6 });
    this.flashScreen(0.4, 0xffffff); this.impactScreen(0.95); this.camPunch(0.08); shake(0.25 * TUNE.shake); cue('draw', 1); cue('timeSlow', 1); audio.stillness(2.2);
    anim(0.18, k => ink(k), undefined, { real: true });
    await waitReal(0.12);
    if (aborted()) { restoreGrade(); return; }
    // 烟遁: the hero goes up in a burst of smoke (act-13 用户：「影分身的特效挺叼的，可以拿给别的技能」)
    smokeBurst(feet, 0.9, 14, { yaw: h.a.yaw, life: 0.5 }); h.a.body.visible = false; fxRing(feet.clone().setY(0.06), 0xa0a8c0, 1.8, { life: 0.4 } as never); cue('whoosh', 0.9);
    await waitReal(0.12);
    if (aborted()) { restoreGrade(); return; }
    // two shadow passes through each target, from either side, one after another; each leaves its streak hanging in the air
    const passes: Array<[Foe, number]> = []; for (let r = 0; r < 2; r++) targets.forEach((f, i) => passes.push([f, i * 2 + r]));
    passes.forEach(([f, j], n) => {
      after(n * 0.06, () => {
        if (f.st === 'dead' || aborted()) return;
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
    if (aborted()) { restoreGrade(); return; }
    h.a.play(new Action('cast', 0.5, 0.4));
    await waitReal(0.3);
    hitstop(0.3); await waitReal(0.32);
    if (aborted()) { restoreGrade(); return; }
    // 11-18 (用户：「终极技能应该是有一个爆发绽裂的伤害，而不是一次性的，要响起多段快速斩击的声音才爽」): the blade clicks home and
    // every one the clones cut bursts open — ULT_TICKS quick cuts across each of them (a streak of light, a spray, a small number and
    // a short slash sound each, a hair of hit-stop), then the last one crosses them all wide open
    cue('sheathe', 1); this.camPunch(0.04); this.flashScreen(0.15, 0xfff0d0);
    const ultScale = 1 + 0.35 * this.region;
    const budgetOf = (f: Foe) => {
      const base = Math.round(TUNE.ultDmg * ultScale);
      if (isBoss(f)) return Math.min(base * 2, Math.max(30, Math.round(f.maxHp * 0.13)));
      if (f.elite) return Math.min(base * 1.4, Math.max(24, Math.round(f.maxHp * 0.40)));
      return Math.min(base, Math.max(18, Math.round(f.maxHp * 0.80)));
    };
    const budgets = new Map<Foe, number>(targets.map(f => [f, budgetOf(f)]));
    for (let i = 0; i < ULT_TICKS; i++) {
      await waitReal(ULT_GAP * (1 - 0.35 * i / ULT_TICKS));   // a little faster as it goes
      if (aborted()) { restoreGrade(); return; }
      let any = 0;
      for (const f of targets) {
        if (f.st === 'dead') continue; any++;
        const tickDmg = Math.max(1, Math.round((budgets.get(f) ?? TUNE.ultDmg) * ULT_TICK_SHARE));
        const c = f.a.chest(), a = Math.random() * Math.PI, v = V3(Math.cos(a) * 0.85, Math.sin(a) * 0.65, Math.sin(a) * 0.3);
        trailSeg(c.clone().sub(v), c.clone().add(v), i % 2 ? 0xffe2b0 : 0xff9a6a, 0.075, { life: 0.12, bright: 2.8, spark: 0.2 });
        this.hitFoe(f, tickDmg, h.pos.clone(), { knock: 0.05, heavy: false, kind: 'ultTick', stagger: isBoss(f) ? 0.15 : 0.45 });
        const fa = f.a as unknown as { flash: number; flashCol: THREE.Color }; fa.flash = 0.3; fa.flashCol.setRGB(1, 0.86, 0.66);
      }
      if (any) { cue('flurry', 0.7 + 0.3 * i / ULT_TICKS, this.fleshHit ? 1 : 0); this.fleshHit = false; hitstop(0.012); this.camKick(V3(Math.random() - 0.5, 0, Math.random() - 0.5), 0.05 * TUNE.shake / 2); this.flashScreen(0.05, 0xffe8c8); }
    }
    await waitReal(ULT_GAP * 1.6);
    if (aborted()) { restoreGrade(); return; }
    // the last cut: one great cross through all of them (across their middle, as wide as they stand), then the ink lifts
    const alive = targets.filter(f => f.st !== 'dead'), C = V3();
    for (const f of alive) C.add(f.pos);
    if (alive.length) C.multiplyScalar(1 / alive.length); else C.copy(h.pos);
    const R = Math.max(1.5, ...alive.map(f => f.pos.distanceTo(C))) + 1.6, d1 = V3(1, 0, 0.55).normalize(), d2 = V3(-1, 0, 0.55).normalize();
    for (const d of [d1, d2]) {
      trailSeg(C.clone().addScaledVector(d, -R).setY(1.0), C.clone().addScaledVector(d, R).setY(1.0), 0xffffff, 0.38, { life: 0.7, bright: 3.6, spark: 1 });
      trailSeg(C.clone().addScaledVector(d, -R).setY(1.04), C.clone().addScaledVector(d, R).setY(1.04), 0xffd890, 0.14, { life: 0.85, bright: 3, spark: 0.4 });
    }
    for (const f of targets) if (f.st !== 'dead') {
      const tot = budgets.get(f) ?? TUNE.ultDmg;
      const fin = Math.max(1, tot - Math.max(1, Math.round(tot * ULT_TICK_SHARE)) * ULT_TICKS);
      blood.spray(f.a.chest(), f.pos.clone().sub(C).setY(0).normalize(), 30, 1.5);
      this.hitFoe(f, fin, C.clone(), { knock: 1.8, heavy: true, kind: 'ult' });
    }
    hitstop(0.22); slowmo(0.6, 0.3); shake(0.8 * TUNE.shake); this.camPunch(0.1); this.flashScreen(0.42, 0xffffff); this.splitScreen(0.95);
    fxRing(C.clone().setY(0.08), 0xfff0c0, R + 1.5, { life: 0.7 } as never); fxRing(C.clone().setY(0.9), 0xffffff, R, { life: 0.4 } as never);
    cue('ultSlash', 1.2); cue('hitIai', 1, 1); cue('boom', 0.6); this.platform.vibrate('heavy');
    await waitReal(0.25);
    finishedOk = true;
    anim(0.6, k => ink(1 - k), restoreGrade, { real: true });
    if (!this.proFalling) h.inv = 0.5;
    } finally {
      this.ultOn = false; h.a.body.visible = true; h.a.root.visible = true;
      if (!finishedOk) { restoreGrade(); FX.slowmo = 0; FX.hitstop = 0; }
    }
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
  /** act-137: true when killing the room's boss triggers a canonical first-time story confrontation (CH_AFTER), so the boss drops
   *  to one knee on the battlefield instead of immediately sinking underground before the dialogue. */
  private isFirstStoryBossKill(): boolean {
    const ai = this.region;
    return !this.poolBossRoom && !this.prologue && this.plan?.type === 'boss' && isBossRoom(ai, this.room)
      && !!CH_AFTER[ai]?.length && (ai === BOSS_AFTER.length - 1 || !profile().seen[BOSS_AFTER[ai]]);
  }
  private killFoe(f: Foe, from: THREE.Vector3) {
    if (this.flats.has(f)) { f.a.body.rotation.x = 0; f.a.body.position.y = 0; this.flats.delete(f); }   // (11-18 踏顶: up off his face before he falls)
    // (a foe gone down a pit is already out of sight: no body to topple, no pool of blood)
    const fell = this.falling.some(x => x.f === f);
    const boss = isBoss(f), elite = !!f.elite;
    const bossClear = boss && this.phase === 'fight' && !this.prologue && !this.foes.some(x => x !== f && x.st !== 'dead' && isBoss(x));
    const holdKneel = bossClear && !fell && this.isFirstStoryBossKill();
    if (f.elite) this.eliteKills++; if (boss) this.bossKilled = true;
    if (__DEBUG_UI__ && boss) { const b = this.fightLog.bosses.find(x => x.uid === f.uid); if (b && !b.t1) b.t1 = clock.time; }
    // 11-18: the kill holds the blow a little longer (feel()); the cry and the gush now, the body on the ground a moment later
    if (!fell) { this.killBeat = true; this.bigKill = this.bigKill || boss || elite; after(0.32, () => cue('bodyFall', holdKneel ? 0.65 : 0.7)); }
    // act-23 / act-137: first-time story boss kneels wounded on the battlefield (death cry saved for the CH_AFTER execution slash!)
    if (f.kind !== 'dummy' && !fell) {
      const bx = f.pos.x, bz = f.pos.z, sz = boss ? 2.0 : elite ? 1.4 : 1.05;
      after(0.45, () => blood.pool(bx, bz, sz));
      cue('hitKill', boss ? 1.25 : 1);
      if (!holdKneel) cue('foeDeath', 1, voiceOf(f));
    }
    if (!fell) this.leaves?.blast(f.pos.x, f.pos.z, 1.3, 2.5);
    this.kills++;
    unfade(f);   // (11-18: a hidden 死士 / a 水鬼 under the water is seen as it dies)
    // (11-18 / act-137: first-kill canonical story boss drops to one knee & stays on-field until executed during CH_AFTER!)
    if (holdKneel) {
      f.pos.y = 0; f.airV = undefined; f.vel.set(0, 0, 0);
      f.yaw = Math.atan2(this.hero.pos.x - f.pos.x, this.hero.pos.z - f.pos.z); f.a.yaw = f.yaw;
      f.a.home.copy(f.pos); f.a.root.position.copy(f.pos); f.a.dead = false; f.a.setRunning(false);
      this.kneelingBoss = { f, t: 0, executed: false, region: this.region };
      const away = f.pos.clone().sub(from).setY(0.2);
      if (away.lengthSq() < 1e-4) away.set(0, 0.2, -1);
      blood.spray(f.a.chest(), away.normalize(), 18, 1.05);
      if (f.kind === 'ly_boss') bossDefiantPose(f.a, 0.01); else bossKneelDefeatPose(f.a, 0.01);
    } else if (fell) { /* gone down a pit: out of sight already */ }
    else if (f.pos.y > 0.05) { this.drops.push({ f, from: from.clone(), boss, vy: Math.min(0, f.airV ?? 0) }); f.airV = undefined; }
    else void playDeath(f.a, { from, ratio: f.lastDmg / f.maxHp + (boss ? 0.5 : 0), boss }).then(() => { f.a.dispose(); });
    // copper coins: a few square-holed coins bounce out and fly to the hero (worth the foe's gold; elites ×3, the boss more); one gone
    // down a pit throws its coins up from the edge it went over
    const coinAt = fell && this.grid ? (([x, z]) => V3(x, 0, z))(this.grid.nearestFloor(f.pos.x, f.pos.z)) : f.pos.clone();
    if (this.room >= 0 && f.kind !== 'dummy') { const total = boss ? 60 : f.d.gold * (elite ? 3 : 1), n = Math.min(10, total); this.coinsFx.drop(coinAt, n, Math.max(1, Math.round(total / n))); }
    if (this.genBlessings.has('luxun') && f.kind !== 'dummy' && !fell) {
      // 陆逊加护「连营火势」：击杀敌人触发范围体素火爆
      const ep = f.pos.clone().setY(0.7);
      fxEmbers(ep, 14, 4.5); fxFlare(ep, 0xff842c, 1.6, 0.35); cue('boom', 0.55);
      for (const o of this.foes.slice()) if (o !== f && o.st !== 'dead' && o.pos.distanceTo(f.pos) < 3.0) {
        this.hitFoe(o, Math.round(TUNE.atkDmg * 1.15), f.pos, { knock: 1.0, heavy: false, kind: 'school' });
      }
    }
    if (hasBoon(this.perks, 'drink') && this.hero.alive && this.roomDrinkHeal < 20) {
      // 11-18 秘传 饮血: a thread of blood flies from the body to her and she heals as it arrives (capped at 20 HP per room)
      const h = this.hero, from0 = f.a.chest(), heal = Math.min(v(this.perks, 'drink'), 20 - this.roomDrinkHeal);
      this.roomDrinkHeal += heal;
      for (let i = 0; i < 6; i++) addBlock(from0.clone().add(V3(R(-0.2, 0.2), R(-0.1, 0.3), R(-0.2, 0.2))), { size: 0.08, col: 0xb01818, glow: false, life: 0.32 + i * 0.03, shrink: 0.1, v: h.a.chest().sub(from0).multiplyScalar(1 / (0.3 + i * 0.03)) });
      after(0.32, () => { if (!h.alive) return; h.hp = Math.min(h.maxHp, h.hp + heal); this.hud.flask.heal({ hp: h.hp, maxHp: h.maxHp }); h.a.tint(0xff4a3a, 0.35); popPix(`+${heal}`, h.a.head().add(V3(0, 0.3, 0)), { color: '#ff8a7a', h: 0.42, life: 0.7 }); });
    }
    if (bossClear) {
      this.bossDefeated = true;
      this.wavePending = 0;
      this.waveGen++;
      this.routMinions(f.pos);
    }
    const left = this.foes.filter(x => x.st !== 'dead').length;
    if (this.generalEvent) { this.generalEvent.onFoeKilled(f); return; }
    if (boss) { slowmo(1.1, 0.25); shake(0.6 * TUNE.shake); this.splitScreen(0.85); cue('win', 0.9); }
    const waveEmpty = !left && this.wavePending <= 0 && !this.bossDrops.length && !this.bossIntroActive;
    if ((waveEmpty || bossClear) && this.phase === 'fight') {
      const lastWave = bossClear || this.wave >= (this.plan?.waves.length ?? 1) - 1;
      const bossRoomNeedKill = !this.prologue && this.plan?.type === 'boss' && isBossRoom(this.region, this.room) && !this.bossDefeated;
      if (lastWave && bossRoomNeedKill) {
        // Hard invariant: a boss room can NEVER clear before its boss has actually spawned and fallen!
        const bossWaveIdx = (this.plan?.waves ?? []).findIndex(w => w.some(k => !!EDEFS[kindOr(k).kind].boss));
        if (bossWaveIdx >= 0 && !this.foes.some(x => isBoss(x))) {
          this.wave = bossWaveIdx;
          after(0.4, () => { if (this.phase === 'fight' && !this.bossDefeated) this.spawnWave(); });
        }
        return;
      }
      if (!boss) slowmo(lastWave ? 0.7 : 0.35, 0.3);
      if (lastWave) after(1.0, () => this.roomClear());
      else if (this.stageOf.length && this.stageOf[this.wave + 1] !== this.stageOf[this.wave]) {
        // 11-18 定死的屋子: this piece of the floor is clear — its doors on to the next open; the next wave comes when she walks in there
        const from = this.stageZ[this.stageOf[this.wave]], to = this.stageZ[this.stageOf[this.wave + 1]]; this.wave++;
        after(0.6, () => { if (this.phase !== 'fight' || !this.pieces) return; for (const q of this.pieces.pieces) if (q.kind === 'door' && q.sides.includes(from) && q.sides.includes(to)) this.pieces.openPiece(q); this.waitZone = to; });
      } else {
        this.wave++;
        const nextWave = this.plan?.waves[this.wave] ?? [];
        const isNextBoss = nextWave.some(k => !!EDEFS[kindOr(k).kind].boss);
        const gen = this.waveGen;
        after(isNextBoss ? 0.55 : 0.9, () => {
          if (this.phase !== 'fight' || gen !== this.waveGen) return;
          if (!isNextBoss) this.banner.show(msg`第 ${this.wave + 1} 波`, '', 0.9);
          this.spawnWave();
        });
      }
    }
  }
  /** act-131: when a room's boss falls, all surviving minions immediately rout & flee so combat ends cleanly into story/clear */
  private routMinions(bossPos: THREE.Vector3) {
    this.cancelQte();
    for (const a of this.arrows) a.kill(); this.arrows.length = 0;
    this.clearBossDrops();
    // Cancel any minions still climbing over walls
    for (let i = this.entering.length - 1; i >= 0; i--) {
      const e = this.entering[i];
      if (!isBoss(e.f)) {
        dropTeles(e.f); e.f.st = 'dead'; e.f.hp = 0; e.f.a.dispose();
        this.entering.splice(i, 1);
      }
    }
    let barked = 0;
    for (const m of this.foes) {
      if (m.st === 'dead' || m.kind === 'dummy' || isBoss(m)) continue;
      if (this.flats.has(m)) { m.a.body.rotation.x = 0; m.a.body.position.y = 0; this.flats.delete(m); }
      dropTeles(m); unfade(m);
      m.st = 'dead'; m.hp = 0; m.attacking = false; m.lunge = null; m.vel.set(0, 0, 0);
      const dir = m.pos.clone().sub(this.hero?.pos ?? bossPos).setY(0);
      if (dir.lengthSq() < 1e-4) dir.set(Math.random() - 0.5, 0, -1);
      dir.normalize();
      const fleeYaw = Math.atan2(dir.x, dir.z);
      m.yaw = fleeYaw; m.a.yaw = fleeYaw;
      m.a.setRunning(true, 6.2, fleeYaw);
      fxSmoke(m.pos.clone().setY(0.25), 0x8a7e6e, 6, { r: 0.45, spd: 1.4, up: 0.5, s: 0.32, life: 0.48 });
      if (barked < 2 && !String(m.kind).includes('hound')) {
        const line = ROUT_BARKS[barked % ROUT_BARKS.length];
        this.barks?.say(() => m.a.head(), line);
        barked++;
      }
      this.fleeing.push({ a: m.a, pos: m.pos.clone(), dir, t: 0, dur: 0.78 });
    }
  }
  private fleeStep(dt: number) {
    for (let i = this.fleeing.length - 1; i >= 0; i--) {
      const q = this.fleeing[i];
      q.t += dt;
      q.pos.addScaledVector(q.dir, 6.2 * dt);
      const yaw = Math.atan2(q.dir.x, q.dir.z);
      q.a.place(q.pos, yaw); q.a.yaw = yaw;
      q.a.setRunning(true, 6.2, yaw);
      q.a.update(dt);
      const s = Math.max(0.05, 1 - Math.max(0, (q.t - q.dur * 0.55) / (q.dur * 0.45)));
      q.a.root.scale.setScalar(s);
      if (q.t >= q.dur) {
        fxSmoke(q.pos.clone().setY(0.35), 0x8a7e6e, 8, { r: 0.5, spd: 1.5, up: 0.6, s: 0.36, life: 0.5 });
        q.a.dispose();
        this.fleeing.splice(i, 1);
      }
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
    if (this.ksShield > 0 && dmg > 0 && this.phase !== 'yard' && this.hero.alive && !this.hero.iframe && this.hero.inv <= 0) {
      // act-125 杜五信物「瓦壶老酒」护酒免伤：震退周围近敌，二三星附带回血
      const p = profile(), st = keepsakeStar(p, 'duwu');
      this.ksShield--; this.hero.inv = Math.max(this.hero.inv, 0.9);
      for (const f of this.foes) if (f.st !== 'dead' && f.kind !== 'dummy' && f.pos.distanceTo(this.hero.pos) < 3.8) {
        const out = f.pos.clone().sub(this.hero.pos).setY(0).normalize();
        f.vel.addScaledVector(out, isBoss(f) ? 2.5 : 8.5); if (!isBoss(f)) interruptFoe(f, 0.8);
      }
      if (st >= 2) this.healHero(st === 3 ? 8 : 5);
      fxRing(this.hero.pos.clone().setY(0.08), 0xffbe78, 2.8, { life: 0.5 } as never);
      popPix('护酒', this.hero.a.head().add(V3(0, 0.45, 0)), { tier: 'highlight', color: '#ffe0a8', accent: '#ff9640', h: 0.84, life: 0.9 });
      cue('parry', 0.85); hitstop(0.06); return;
    }
    if (this.wine && dmg > 0 && this.phase !== 'yard' && this.hero.alive && !this.hero.iframe && this.hero.inv <= 0) {
      // 瓦壶烈酒 (杜五's wine): the first blow of the run lands without blood — she staggers, grins, goes on
      this.wine = false; this.hero.inv = Math.max(this.hero.inv, 0.8); fxRing(this.hero.pos.clone().setY(0.08), 0xffb060, 2.4, { life: 0.5 } as never); cue('parry', 0.8); hitstop(0.06); return;
    }
    if (this.defy > 0 && this.phase !== 'yard' && this.hero.alive && !this.hero.iframe && this.hero.hp - dmg <= 0) {
      // act-20 / act-152 闭息: leaves 25% HP + blasts surrounding foes back so you never die immediately on wake-up
      this.defy--; dmg = Math.max(0, this.hero.hp - Math.round(this.hero.maxHp * 0.25)); this.hero.inv = Math.max(this.hero.inv, 1.5);
      for (const f of this.foes) if (f.st !== 'dead' && f.kind !== 'dummy' && f.pos.distanceTo(this.hero.pos) < 4.5) {
        const out = f.pos.clone().sub(this.hero.pos).setY(0).normalize();
        f.vel.addScaledVector(out, isBoss(f) ? 3 : 10); if (!isBoss(f)) interruptFoe(f, 0.9);
      }
      slowmo(0.8, 0.25); fxRing(this.hero.pos.clone().setY(0.08), 0xbfe8ff, 3.6, { life: 0.6 } as never); cue('timeSlow', 0.7);
    }
    if (this.prologue && this.hero.hp - dmg <= 0) { dmg = Math.max(0, this.hero.hp - 1); if (this.prologue === 2) { void this.prologueFall(); return; } }   // act-29
    // act-132: Non-lethal trial defeat (e.g., Act 2 Lu Bu 1v1 duel) keeps 15% HP and opens doors without unfair death
    if (this.generalEvent && this.hero.hp - dmg <= 0 && this.generalEvent.onHeroWouldDie()) {
      this.hero.hp = Math.max(15, Math.round(this.hero.maxHp * 0.15));
      this.hero.inv = Math.max(this.hero.inv, 1.5);
      this.hud.flask.hit(0, { hp: this.hero.hp, maxHp: this.hero.maxHp });
      return;
    }
    if (!this.hero.hurt(dmg, from)) return;
    if (__DEBUG_UI__ && this.phase !== 'yard') { const t = this.fightLog.taken; t.n++; t.sum += dmg; if (attacker && isBoss(attacker)) t.byBoss++; }
    if (this.genBlessings.has('xiahoudun')) this.ksRevenge = true;
    this.resetCombo();
    // where it came from: a red arc at the feet facing the attacker
    this.hitArcs.show(this.hero.pos, from);
    this.hud.flask.hit(dmg, { hp: this.hero.hp, maxHp: this.hero.maxHp });
    popPix(`-${dmg}`, this.hero.a.head().add(V3(0, 0.3, 0)), { tier: 'dot', color: '#ff5a4a', h: 0.48, life: 0.8 });
    fxSparks(this.hero.a.chest(), 0xff4a3a, 12, 4); this.hero.a.tint(0xff3020, 0.9);
    { const away = this.hero.pos.clone().sub(from).setY(0); if (away.lengthSq() < 1e-4) away.set(0, 0, 1); blood.spray(this.hero.a.chest(), away.normalize(), 7, 0.8); }
    hitstop(0.07 * TUNE.hitstop); shake(0.42 * TUNE.shake); this.splitScreen(0.5); cue('hurt', 0.9); this.platform.vibrate('heavy');
    if (!this.hero.alive) this.dead();
  }
  // ------------------------------------------------------------ clear → pick → doors → leave
  private async roomClear() {
    if (this.phase !== 'fight') return;
    this.cancelQte();
    // (act-50 用户：「我听线上版获胜和失败的声音还是老版的」: the clear was still the act-19 jingle — the user's win sound now, whole;
    //  it fades as she walks out of the room (or when a new piece of music starts))
    this.phase = 'pick'; this.queueAhead(false); cue('stingWin', 1); audio.duckMusic(0.35, 3.2);
    if (this.pieces) for (const q of this.pieces.pieces) if (q.kind === 'door') this.pieces.openPiece(q);   // (11-18: a drawn room's side yards)
    // (11-18: a bolt / talisman / mark still on its way when the last foe fell would hang mid-flash through the talks and cards that follow)
    for (const a of this.arrows) a.kill(); this.arrows.length = 0;
    this.banner.show('清场', '', 1.0, '#ffe6a0');
    // act-125: combat room cleared → advance equipped keepsake star progress (★ → ★★ → ★★★)
    if (!this.prologue) {
      const p = profile(), leveled = advanceKeepsake(p, 1);
      if (equippedKeepsake(p, this.dbgAllWeapons)) saveProfile();
      if (leveled) {
        const ks = KEEPSAKES[leveled.id];
        this.feed.push('boon', () => msg`信物升星 · ${ks.name} ${starLabel(leveled.star)}`, 0, 'ksup:' + leveled.id);
      }
    }
    await new Promise(r => after(0.9, () => r(null)));
    // act-114 友军名将（赵云 / 陆逊）清场告别：抱拳致意、战后对白、赠气血杀意，再从容离场
    if (this.allyGen && this.allyGen.active) {
      const ally = this.allyGen;
      const ri = ally.kind === 'zhaoyun' ? 0 : 3;
      const g = GENERAL_REGIONS[ri];
      ally.a.yaw = Math.atan2(this.hero.pos.x - ally.pos.x, this.hero.pos.z - ally.pos.z);
      this.hero.a.yaw = Math.atan2(ally.pos.x - this.hero.pos.x, ally.pos.z - this.hero.pos.z);
      ally.salute();
      await this.talk(GEN_AFTER[ri]);
      ally.dispose();
      this.allyGen = null;
      const was = this.hero.hp;
      this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + Math.round(this.hero.maxHp * 0.35));
      this.healFeed(was); this.hud.flask.heal({ hp: this.hero.hp, maxHp: this.hero.maxHp });
      this.addIntent();
      this.banner.show(g.name, '并肩破阵 · 气血尽复', 1.5, '#ffe2a0');
    }
    if (this.prologue) { this.openDoors(); return; }   // act-29: the prologue's road just goes on
    // act-132 / act-135: dual-track garden growth & seed drop only once 竹溪药圃 has been built
    {
      const p = profile();
      if (hideoutProgress(p, this.dbgAllWeapons).gardenBuilt) {
        const ripened = advanceGardenRooms(p, 1);
        const isBoss = this.plan?.type === 'boss' && isBossRoom(this.region, this.room);
        const drop = rollSeedDrop(isBoss ? 'boss' : 'room');
        if (drop) addSeed(p, drop, 1);
        if (ripened.length || drop) {
          saveProfile();
          for (const r of ripened) this.feed.push('boon', () => msg`药圃成熟 · ${r.name}`, 0, 'gd:ripe:' + r.id);
          if (drop) this.feed.push('boon', () => msg`获药种 · ${SEEDS[drop].name}`, 0, 'gd:seed:' + drop);
        }
      }
    }
    // 11-18 一局五关: a region's boss fell — region one's after-talk (褚雷) the first time; then the run is won (the last region) or the
    // road opens into the next region (a boon first, as any cleared fight)
    if (this.plan?.type === 'boss' && isBossRoom(this.region, this.room)) {
      this.bosses++;
      // (11-19 / act-114 / act-131 / act-137: canonical first-kill story boss kneels on-field with blade at throat until executed on cue in CH_AFTER!)
      const ai = this.region, last = ai === BOSS_AFTER.length - 1;
      if (!this.poolBossRoom && CH_AFTER[ai]?.length && (last || seeOnce(BOSS_AFTER[ai]))) {
        this.musicHold = 'bgm_afterkill'; void audio.playMusic('bgm_afterkill', 1.0);
        if (last) {
          this.kneelingBoss = null;
          const ch5Cut = this.stageCh5ThroatScene();
          await this.talk(CH_AFTER[ai], (_idx, l) => ch5Cut(l)); saveProfile();
          await this.ending(); return;
        }
        const exec = this.stageBossAfterScene(ai);
        await this.talk(CH_AFTER[ai], (idx, l) => {
          exec.onLine(idx, l);
        });
        exec.cleanup();
        saveProfile();
        this.musicHold = null;
      }
      if (afterBoss(this.region) === 'won') { this.end(true); return; }
      // act-161: a boss down is a breath back (30% of her health); regions 1 and 3 hand a boon, 2 and 4 an upgrade of one in hand
      { const was = this.hero.hp; this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + Math.round(this.hero.maxHp * 0.30)); this.healFeed(was); this.hud.flask.heal({ hp: this.hero.hp, maxHp: this.hero.maxHp }); }
      if (this.region % 2 === 0) await this.boonPick(); else await this.upPick();
      this.openDoors(); return;
    }
    const rw = this.plan?.reward ?? null;
    if (this.plan?.type === 'elite') this.coinsFx.drop(this.hero.pos.clone().add(V3(0, 0, -1.2)), 10, 4);
    if (rw?.k === 'coins') { this.coinsFx.drop(this.hero.pos.clone().add(V3(0, 0, -1.5)), 12, Math.round(rw.n / 12)); }
    else if (rw?.k === 'maxHp') {
      this.hero.maxHp += rw.n; const was = this.hero.hp; this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + rw.n);
      this.feed.push('heal', () => msg`气血上限 +${rw.n}`, 0); this.healFeed(was);
      this.hud.flask.heal({ hp: this.hero.hp, maxHp: this.hero.maxHp });
      await new Promise(r => after(0.65, () => r(null)));
    } else if (rw?.k === 'meta') {
      const p = profile(); p.iron += rw.iron; p.herb += rw.herb; saveProfile();
      this.hud.iron = p.iron; this.hud.herb = p.herb; cue('relic', 0.7);
      this.feed.push('coins', () => msg`残铁 +${rw.iron}`, 0);
      this.feed.push('heal', () => msg`药引 +${rw.herb}`, 0);
      await new Promise(r => after(0.65, () => r(null)));
    } else if (rw?.k === 'heal') {
      const was = this.hero.hp; this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + Math.round(this.hero.maxHp * 0.20));
      this.healFeed(was); this.hud.flask.heal({ hp: this.hero.hp, maxHp: this.hero.maxHp });
      await new Promise(r => after(0.75, () => r(null)));
    } else if (rw?.k === 'manual') await this.manualPick();
    else if (rw?.k === 'up') await this.upPick();
    else {
      await this.boonPick(undefined, rw?.k === 'boon' ? (rw.arch ?? null) : null);
    }
    this.openDoors();
  }
  /** act-152 哈迪斯2宝箱定位：场景秘藏不再乱发秘传/刀谱（防止打乱强化节奏），改为重赏高价值货币（铜钱/残铁/药引）、气血上限与重随，让玩家直观感知货币价值！ */
  private async reward(tier: 'gold' | 'mythic' = 'gold') {
    this.rewardsGot++;
    { const p = profile(); if (hideoutProgress(p, this.dbgAllWeapons).gardenBuilt) { const drop = rollSeedDrop('chest'); if (drop) { addSeed(p, drop, 1); saveProfile(); this.feed.push('boon', () => msg`秘藏药种 · ${SEEDS[drop].name}`, 0, 'gd:chest:' + drop); } } }
    const dropPos = this.hero.pos.clone().add(V3(0, 0, -0.6));
    const canPick = this.phase === 'fight' || this.phase === 'doors';
    const boostMaxHp = (addMax: number, healFrac: number) => {
      this.hero.maxHp += addMax;
      const was = this.hero.hp;
      this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + addMax + Math.round(this.hero.maxHp * healFrac));
      this.feed.push('heal', () => msg`气血上限 +${addMax}`, 0);
      this.healFeed(was);
      this.hud.flask.heal({ hp: this.hero.hp, maxHp: this.hero.maxHp });
    };
    const grantMeta = (iron: number, herb: number) => {
      const p = profile(); p.iron += iron; p.herb += herb; saveProfile();
      this.hud.iron = p.iron; this.hud.herb = p.herb; cue('relic', 0.75);
      this.feed.push('coins', () => msg`残铁 +${iron}`, 0);
      this.feed.push('heal', () => msg`药引 +${herb}`, 0);
    };
    cue('reveal', 0.85);
    if (tier === 'mythic') {
      this.banner.show('传世秘藏', '铜钱百贯 · 残铁药引丰收', 1.6);
      this.coinsFx.drop(dropPos, 20, 5);
      grantMeta(18, 18);
      boostMaxHp(15, 0.15);
      if (canPick && this.sharpenable().length) await this.sharpen();
      return;
    }
    const r = Math.random();
    if (r < 0.45) {
      this.banner.show('铜钱宝库', '可在行商购秘传与升阶', 1.35);
      this.coinsFx.drop(dropPos, 15, 5);
      const was = this.hero.hp;
      this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + Math.round(this.hero.maxHp * 0.15));
      this.healFeed(was);
      this.hud.flask.heal({ hp: this.hero.hp, maxHp: this.hero.maxHp });
    } else if (r < 0.75) {
      this.banner.show('锻材药囊', '回古窑可锻刀行针永久强化', 1.35);
      this.coinsFx.drop(dropPos, 6, 5);
      grantMeta(12, 12);
    } else {
      this.banner.show('秘藏入手', '气血上限提升并获铜钱', 1.35);
      this.coinsFx.drop(dropPos, 5, 5);
      boostMaxHp(12, 0.15);
    }
  }
  /** three boons with rolled tiers — 死士 / 遗卷 & 绝品缘 mirror roll higher rarities; supports door archetype guarantee & B4 divination */
  private async boonPick(customOdds?: [number, number, number], doorArch?: Archetype | null) {
    // act-161: a full hand (BOON_CAP), or nothing new left that her blade can use: the reward is an upgrade of one she holds
    if (!freshBoons(this.perks, this.hero?.weaponId).length) { await this.upPick(boonCount(this.perks) >= BOON_CAP); return; }
    let effArch = doorArch ?? null;
    let base = customOdds ?? (this.plan?.type === 'elite' ? [0, 0.55, 0.45] : this.plan?.type === 'boon' ? [0.15, 0.60, 0.25] : [0.7, 0.25, 0.05]);
    // B4 酒前问一卦: guarantee chosen school + at least 珍品 rarity on the run's first boon pick!
    if (this.divineSchoolRun) {
      effArch = this.divineSchoolRun;
      this.divineSchoolRun = null;
      base = [0, 0.72, 0.28];
    }
    const rb = this.mods.rareOddsBonus;
    const shift = Math.min(base[0], rb);
    const odds = [Math.max(0, base[0] - shift), base[1] + shift * 0.55, base[2] + shift * 0.45];
    const eqKs = keepsakeDef(equippedKeepsake(profile(), this.dbgAllWeapons));
    const archBias = eqKs?.arch ?? null;
    const pick = drawBoons('any', 3, Math.random, this.perks, odds, archBias, effArch, this.hero?.weaponId); if (!pick.length) return;
    const was = this.phase; this.phase = 'pick'; this.hud.on = false; this.banner.hide();
    const ai = effArch ? ARCH_INFO[effArch] : null;
    const i = await this.cards.open(pick, {
      header: {
        title: ai ? msg`${ai.name}秘传` : '淬炼秘传',
        sub: ai ? msg`2件 ${ai.b2} · 3件 ${ai.b3}` : '同流派 2/3 件成势',
        col: ai ? ai.col : '#ffd27a',
      },
      archHave: archCounts(this.perks),
    });
    const b = pick[i]; this.take(b.boon, b.tier);
    this.hud.on = true; this.phase = was === 'pick' ? 'pick' : was;
  }
  /** act-161: what the route planner may know of her hand (run.ts rewardFor) */
  private runCtx(): RunCtx { return { boons: boonCount(this.perks), ups: upgradableBoons(this.perks).length }; }
  /** act-163: what a scroll room's altar gives her — a manual (from the second region on, while she has fewer than three and one is left
   *  to learn), a boon while her hand has room, else an upgrade of one she holds (boonPick's own fallback); the door and the altar say which */
  private scrollGives(region = this.region): 'manual' | 'boon' | 'up' {
    if (region >= 1 && Object.keys(this.perks.moves).length < 3 && drawManuals(this.perks.moves, 1, Math.random, this.hero?.weaponId).length) return 'manual';
    return freshBoons(this.perks, this.hero?.weaponId).length ? 'boon' : 'up';
  }
  private isScrollUp(p: RoomPlan) { return p.type === 'boon' && this.scrollGives(p.region ?? this.region) === 'up'; }
  private boardFor(p: RoomPlan) { return runBoard(p, LOCALES[p.locale]?.name ?? '', this.isScrollUp(p)); }
  /** act-161 / act-164: the exits were drawn up before this room's reward reached her hand — a door that promised a boon she has no room for
   *  (or an upgrade with nothing left to upgrade, or a scroll room whose gift just flipped to upgrade) is re-settled and its board put up again */
  private settleDoors() {
    const ctx = this.runCtx();
    this.nextRooms.forEach((p, i) => {
      const rw = settleReward(p, ctx), d = this.doors[i], scrollUp = this.isScrollUp(p);
      const rewardChanged = rw !== p.reward, scrollChanged = !!d && scrollUp !== !!d.scrollUp;
      if (!rewardChanged && !scrollChanged) return;
      p.reward = rw;
      if (!d) return;
      const { g } = this.boardFor(p); g.position.copy(d.g.position); g.scale.copy(d.g.scale); g.rotation.copy(d.g.rotation);
      d.g.parent?.add(g); d.g.parent?.remove(d.g); d.g = g; d.scrollUp = scrollUp;
    });
  }
  /** act-161 升阶: one of the boons in hand goes up a tier (her pick of three); a hand already all 绝品 takes a purse and a breath instead */
  private async upPick(full = false) {
    if (this.sharpenable().length) { await this.sharpen(full); return; }
    this.coinsFx.drop(this.hero.pos.clone().add(V3(0, 0, -1.2)), 12, 5);
    const was = this.hero.hp; this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + Math.round(this.hero.maxHp * 0.10));
    this.healFeed(was); this.hud.flask.heal({ hp: this.hero.hp, maxHp: this.hero.maxHp });
  }
  /** 11-19 获得提示: a heal into the column (what it really gave back) */
  private healFeed(was: number) { const n = Math.round(this.hero.hp - was); if (n > 0) { this.feed.push('heal', v => msg`生命 +${v}`, n); if (__DEBUG_UI__) this.fightLog.healed += n; } }
  /** the boons in hand that can still go up a tier */
  private sharpenable() { return BOONS.filter(b => this.perks.owned[b.id] != null && this.perks.owned[b.id] < 2); }
  /** 磨刀: pick one of the boons in hand (shown at its next tier); it goes up a tier */
  private async sharpen(full = false) {
    const own = this.sharpenable().sort(() => Math.random() - 0.5).slice(0, 3); if (!own.length) return;
    const cards: BoonPick[] = own.map(b => ({ boon: b, tier: this.perks.owned[b.id] + 1 }));
    const was = this.phase; this.phase = 'pick'; this.hud.on = false; this.banner.hide();
    const i = await this.cards.open(cards, { header: { title: '秘传升阶', sub: full ? '秘传已满 · 选一升阶' : '选一秘传升阶', col: '#ffe08a' }, archHave: archCounts(this.perks) });
    const b = own[i]; upgradeBoon(this.perks, b.id); this.log.push(`sharpen ${b.id} ${this.perks.owned[b.id]}`); this.syncMarks(); this.settleDoors();
    this.hud.on = true; this.phase = was; this.feed.push('boon', () => msg`${b.name} · ${TIER_NAMES[this.perks.owned[b.id]]}`, 0, 'sharpen:' + b.id);
  }
  /** a station's ring filled: pay, then do its thing */
  private async useStation(s: Station) {
    if (!this.stations) return;
    if (s.price > this.coins) return;
    this.coins -= s.price; cue(s.price ? 'coin' : 'reveal', 0.6); this.log.push(`station ${s.id}`);
    if (s.id.startsWith('buy_') && this.stations.merchant) {
      const line = sayMerchant('buy');
      const m = this.stations.merchant;
      (this.barks ??= new Barks(this.L)).say(() => m.head(), line);
    }
    const heal = (k: number) => { const was = this.hero.hp; this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + Math.round(this.hero.maxHp * k)); this.healFeed(was); this.hud.flask.heal({ hp: this.hero.hp, maxHp: this.hero.maxHp }); };
    if (s.id === 'buy_boon') { this.stations.spend(s); await this.boonPick(); }
    else if (s.id === 'buy_heal') { this.stations.spend(s); heal(0.30); }
    else if (s.id === 'buy_sharpen') { this.stations.spend(s); await this.sharpen(); }
    else if (s.id === 'buy_vigor') {
      this.stations.spend(s);
      this.hero.maxHp += 15; const was = this.hero.hp; this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + 25);
      this.feed.push('heal', () => msg`气血上限 +${15}`, 0); this.healFeed(was);
      this.hud.flask.heal({ hp: this.hero.hp, maxHp: this.hero.maxHp });
    }
    else if (s.id === 'buy_satchel') {
      this.stations.spend(s);
      const p = profile(); p.iron += 10; p.herb += 10; saveProfile();
      this.hud.iron = p.iron; this.hud.herb = p.herb; cue('relic', 0.7);
      this.feed.push('coins', () => msg`残铁 +${10}`, 0);
      this.feed.push('heal', () => msg`药引 +${10}`, 0);
    }
    else if (s.id === 'rest_heal') { this.stations.spend(s, true); heal(0.30); }
    else if (s.id === 'rest_meditate') {
      this.stations.spend(s, true);
      this.hero.qi = Hero.QI_MAX;
      this.addIntent(1.2, true);
      const p = profile(); p.iron += 8; p.herb += 6; saveProfile();
      this.hud.iron = p.iron; this.hud.herb = p.herb; cue('relic', 0.8);
      this.feed.push('boon', () => '杀气充盈', 0);
      this.feed.push('coins', () => msg`残铁 +${8}`, 0);
      this.feed.push('heal', () => msg`药引 +${6}`, 0);
    }
    else if (s.id === 'rest_sharpen') { this.stations.spend(s, true); await this.sharpen(); }
    else if (s.id === 'scroll' && this.scrollGives() === 'manual') { this.stations.spend(s); await this.manualPick(); }
    else if (s.id === 'scroll') { this.stations.spend(s); await this.boonPick(); }
  }
  /** act-136 / act-149: 行商总览面板 — 4 hanging wooden merchant tags (悬木货签) with big 3D wares + concise benefit + ONE bold gold coin bar */
  private async shopOverviewMenu() {
    if (!this.stations || this.shopOpening) return;
    this.shopOpening = true;
    try {
      let instant = false;
      for (;;) {
        const avail = this.stations.list.filter(st => !st.done && st.id.startsWith('buy_'));
        if (!avail.length) {
          this.banner.show('行商', '今日货摊已清，江湖再会', 1.4, '#ffd890');
          return;
        }
        const cards: BoonPick[] = avail.map(st => {
          const noSharp = st.id.endsWith('sharpen') && !this.sharpenable().length;
          const poor = st.price > this.coins;
          const locked = poor || noSharp;
          const shortEff = st.id === 'buy_heal' ? '当场恢复三成血'
            : st.id === 'buy_vigor' ? '本局生命上限+15'
              : st.id === 'buy_boon' ? '三选一习得秘传'
                : st.id === 'buy_sharpen' ? '已得秘传升一阶'
                  : st.desc;
          return {
            boon: {
              id: 'shop_' + st.id, school: (st.id === 'buy_heal' || st.id === 'buy_vigor' ? 'md' : 'fg') as never,
              name: st.label,
              desc: [shortEff, ''],
              col: locked ? '#989088' : '#ffd878',
              glyph: st.id === 'buy_boon' ? SCROLL_GLYPH : st.id === 'buy_heal' || st.id === 'buy_vigor' ? NEEDLE : ANVIL,
              locked,
              shopInfo: {
                name: st.label,
                effect: shortEff,
                price: st.price,
                poor,
                disabled: noSharp,
                note: noSharp ? '暂无秘传' : undefined,
              },
            } as CardBoon,
            tier: locked ? 0 : 1,
          };
        });
        const was = this.phase; this.phase = 'pick'; this.hud.on = false; this.banner.hide(); this.hideWorldPlates();
        const i = await this.cards.open(cards, {
          leave: true, layout: 'shop', instant,
          header: { title: '行商货摊', col: '#ffe290', accent: '#c89248' },
          wallet: { coins: this.coins, focus: 'coins' },
          footer: '确认购入 · Esc 返回',
        });
        this.phase = was; this.hud.on = true;
        if (i < 0 || i >= avail.length) return;
        const chosen = avail[i];
        const noSharp = chosen.id.endsWith('sharpen') && !this.sharpenable().length;
        if (chosen.price > this.coins || noSharp) { cue('deny', 0.45); instant = true; continue; }
        await this.useStation(chosen);
        instant = true;
      }
    } finally {
      this.shopOpening = false;
    }
  }
  private take(b: Boon, tier = 0) { // wp/boons: ownership lives on Perks
    const before = archCounts(this.perks);
    applyBoon(this.perks, b.id, tier); this.log.push(`boon ${b.id} tier ${tier}`); // wp/boons: apply the selected tier
    this.syncMarks(); this.syncHeroMods(); this.settleDoors();
    this.feed.push('boon', () => msg`秘传 · ${b.name}`, 0, 'boon:' + b.id);
    const afterC = archCounts(this.perks);
    const active: Array<{ name: string; count: number; col: string }> = [];
    for (const a of ['blood', 'poise', 'shadow', 'gale'] as Archetype[]) {
      const n = afterC[a], ai = ARCH_INFO[a];
      if (n >= 2) active.push({ name: ai.name, count: n, col: ai.col });
      if ((n === 2 || n === 3) && before[a] < n) {
        this.banner.show(msg`流派成势 · ${ai.name}(${n})`, n === 2 ? ai.b2 : ai.b3, 2.2, ai.col);
        cue('relic', 0.9);
      }
    }
    this.hud.synergies = active;
  }
  /** Find a clean open-floor spot near an exit gate so runBoard never clips into flanking # stalls/walls or foreground roofs */
  private placeDoorSign(gt: NonNullable<ArenaPlan['gates']>[number]): [number, number] {
    const solids = this.arena?.shape?.solid ?? [];
    const hitsBlock = (x: number, z: number, pad = 0.72) =>
      solids.some(r => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad);
    const openFloor = (x: number, z: number) =>
      x > PLAY.x0 + 0.7 && x < PLAY.x1 - 0.7 && z > PLAY.z0 + 0.7 && z < PLAY.z1 - 0.7
      && !hitsBlock(x, z, 0.72)
      && (!this.grid || this.grid.clear(x, z, 0.52))
      && this.solids.free(x, z, 0.45, 0.3);
    // Prefer spots that also have clear sightline from the isometric camera (+z side not immediately blocked by a tall # roof)
    const sightClear = (x: number, z: number) => !hitsBlock(x, z + 1.8, 0.4) && !hitsBlock(x, z + 3.2, 0.25);

    const cands: Array<[number, number]> = [];
    if (gt.along === 'x') {
      const zIn = Math.max(PLAY.z0 + 1.05, gt.z + 1.15);
      cands.push(
        [gt.x + gt.w / 2 + 1.25, zIn],
        [gt.x - gt.w / 2 - 1.25, zIn],
        [gt.x + gt.w / 2 + 1.35, zIn + 1.2],
        [gt.x - gt.w / 2 - 1.35, zIn + 1.2],
        [gt.x, zIn + 1.6],
      );
    } else {
      const inX = -gt.out[0];
      cands.push(
        [gt.x + inX * 1.45, gt.z - gt.w / 2 - 0.85],
        [gt.x + inX * 2.15, gt.z - gt.w / 2 - 0.75],
        [gt.x + inX * 1.55, gt.z + gt.w / 2 + 0.95],
        [gt.x + inX * 2.35, gt.z + gt.w / 2 + 0.85],
        // Narrow-alley fallback: pull cleanly inward along the lane edge where open arena floor is guaranteed
        [gt.x + inX * 2.85, gt.z - 1.15],
        [gt.x + inX * 2.85, gt.z + 1.15],
        [gt.x + inX * 3.5, gt.z],
      );
    }
    const ideal = cands.find(([x, z]) => openFloor(x, z) && sightClear(x, z));
    if (ideal) return ideal;
    const valid = cands.find(([x, z]) => openFloor(x, z));
    if (valid) return valid;
    return gt.along === 'x'
      ? [gt.x + gt.w / 2 + 1.3, PLAY.z0 + 1.15]
      : [gt.x - gt.out[0] * 2.1, gt.z - gt.w / 2 - 0.75];
  }
  private openDoors(quiet = false) {
    // act-146 safety invariant: never leave stray living enemies/bosses standing in a cleared room once exit doors open
    this.wavePending = 0; this.waveGen++; this.bossIntroActive = false; this.clearBossDrops(); this.kneelingBoss = null;
    for (let i = this.foes.length - 1; i >= 0; i--) {
      const f = this.foes[i];
      if (f.kind === 'dummy') continue;
      dropTeles(f); f.a.dispose(); this.foes.splice(i, 1);
    }
    this.settleDoors();
    const ds = this.nextRooms, ids = (this.spec?.exits ?? []) as ExitId[];
    this.doors = ds.map((d, i) => {
      const ex = exitInfo(this.layout!, ids[i] ?? 'back');
      const { g } = this.boardFor(d); g.position.set(ex.sign.x, -2.4, ex.sign.z); g.scale.setScalar(1.25);
      // act-19 / act-132: place the route board on verified open walkable floor beside the gate (never buried in # stalls/walls)
      const gt = this.arena?.gates.find(q => q.open && q.id === (ids[i] ?? 'back'));
      if (gt) { const [sx, sz] = this.placeDoorSign(gt); g.position.set(sx, -2.4, sz); }
      g.rotation.y = Math.atan2(-g.position.x * 0.35, 13); this.stage?.root.add(g);
      return { ex, g, lift: 0, scrollUp: this.isScrollUp(d) };
    });
    this.phase = 'doors';
    if (!this.ahead.length) this.queueAhead(false);
    cue(this.gates ? 'gateOpen' : 'reveal', 0.8); if (this.gates) after(0.6, () => cue('exitChime', 0.7)); this.gates?.open(); this.gustT = 0.9;
    if (!quiet) this.banner.show('去路', ds.length > 1 ? '走进一条路口' : '往前走', 1.2);
  }
  private leave(i: number) {
    if (this.phase !== 'doors') return;
    this.hideWorldPlates();
    this.phase = 'leaving'; audio.stopSting(1.2); const d = this.doors[i], next = this.nextRooms[i];
    const chosen = this.ahead.find(job => job.plan === next);
    this.dropAhead(chosen);
    if (chosen) this.ahead.push(chosen);
    this.plan = next; const fromLocale = this.locale; this.locale = next.locale; if (this.prologue === 1) { this.prologue = 2; this.proFightT = 0; this.forceSpec = { ...PRO_BOSS_SPEC }; profile().proStage = 'boss'; saveProfile(); }
    // 11-18 一局五关: the road out of a boss room goes into the next region — its rooms count from one again, its own kinds of room,
    // its foes stronger (the run's TUNE scaled by flow.ts regionScale)
    const nextRegion = !this.prologue && next.region != null && next.region !== this.region;
    const h = this.hero; h.vel.set(d.ex.dir[0], 0, d.ex.dir[1]).multiplyScalar(TUNE.heroSpeed * 0.8);
    WIPE.look = 'bamboo'; void fromLocale;   // (11-19: bamboo for every room — the timber post is gone)
    after(0.35, () => { void wipeTransit(() => {
      if (nextRegion) { this.region = next.region!; this.room = 0; this.visited = []; this.regionIn = true; this.scaleFoes(this.region); this.log.push(`region ${this.region} ${REGIONS[this.region]?.id}`); }
      else this.room++;
      const r = this.buildRoom(false);
      // (11-19: 崔府 is up — the village at dawn starts building behind its cutscenes)
      const q = () => { if (this.prologue === 2) this.queuePro('dawn'); };
      if (r instanceof Promise) return r.then(q);
      q(); return r;
    }); });
  }
  private dead() {
    this.cancelQte(); GRADE.bloodVig = 0;
    this.phase = 'dead'; audio.stopMusic(1.4); cue('stingLose', 1); slowmo(1.2, 0.3); this.banner.show('败北', '', 1.6, '#ff6a5a');
    // (act-50: the user's lose sound opens on a second of near silence and lands its heavy blow at 2–3 s — the card waits for it)
    after(2.8, async () => {
      this.hud.on = false;
      // C2: 阵亡结算平静并列「回断碑古窑」与「残息未绝 · 观影半血再战」（无倒计时、每局严格限 1 次）
      if (!this.usedRevive && !this.prologue && !this.botOn) {
        const ch = await this.cards.open([
          {
            boon: {
              id: 'dead_home', school: 'md' as never,
              name: '回断碑古窑',
              desc: [msg`本趟已斩 ${this.kills} 敌，结算带回残铁与药引`, '不借真气 · 保持硬核独行'],
              col: '#d8ccb4', glyph: LEAVE, tag: '归窑',
            } as CardBoon,
            tier: 0,
          },
          {
            boon: {
              id: 'dead_revive', school: 'fg' as never,
              name: '残息未绝 · 借真气再战',
              desc: ['观影一则原地恢复半数气血并震开周身敌兵', '每局严格限一次（计入长明灯灯油）'],
              col: '#ffe278', glyph: NEEDLE, tag: '观影续命',
            } as CardBoon,
            tier: 2,
          },
        ], {
          header: { title: '气绝倒地 · 抉择', sub: '可径直回古窑结算，或借一口真气再战一次', col: '#ff9080' },
          footer: '平静抉择 · 无倒计时催促',
        });
        if (ch === 1) {
          const ok = await this.watchAd('revive', '残息未绝 · 借真气再战', '原地半血起身并短暂无敌震退周身敌兵');
          if (ok && this.hero) {
            this.usedRevive = true;
            this.phase = 'fight';
            this.hero.revive(Math.max(1, Math.round(this.hero.maxHp * 0.5)), 2.2);
            this.hud.flask.heal({ hp: this.hero.hp, maxHp: this.hero.maxHp });
            this.hud.on = true;
            fxFlare(this.hero.pos.clone().setY(0.9), 0xffe278, 3.2, 0.65);
            fxRing(this.hero.pos.clone().setY(0.1), 0xffe278, 4.5, { life: 0.6, width: 0.14 });
            for (const f of this.foes) {
              if (f.st === 'dead') continue;
              const dx = f.pos.x - this.hero.pos.x, dz = f.pos.z - this.hero.pos.z, d = Math.hypot(dx, dz) || 1;
              if (d < 4.5) { f.vel.set((dx / d) * 8, 0, (dz / d) * 8); }
            }
            cue('parry', 0.9); cue('stingRevive', 0.9);
            void audio.playMusic(this.plan?.type === 'boss' ? 'bgm_boss' : this.plan?.type === 'elite' ? 'bgm_elite' : 'bgm_battle');
            this.banner.show('残息未绝', '借真气起身再战', 1.6, '#ffe278');
            return;
          }
        }
      }
      this.justDied = true;
      this.bankRun(false);
      await this.openHaulSummary(false);
      this.hud.on = true; void wipeTransit(() => this.enterYard());
    });
  }
  /** C3: 归窑结算（含「杜五拾遗 · 观影带回残铁药引 +50%」） */
  private async openHaulSummary(won: boolean, spared = false) {
    const prof = profile();
    const b = this.banked;
    const haul = b ? { iron: b.iron, herb: b.herb, canUp: hasAffordable(prof) || hasMirrorAffordable(prof) } : undefined;
    const baseCard = won
      ? {
          boon: {
            id: 'again', school: 'sr' as never,
            name: !this.usedRevive ? msg`${REGIONS[REGIONS.length - 1].name} · 孤刃独行` : REGIONS[REGIONS.length - 1].name,
            desc: [
              spared ? msg`${EDEFS[REGIONS[REGIONS.length - 1].boss as EKind]?.name ?? ''}未死` : msg`${EDEFS[REGIONS[REGIONS.length - 1].boss as EKind]?.name ?? ''}伏诛`,
              !this.usedRevive ? msg`未借真气通关（孤刃独行 ${prof.soloWins ?? 1} 次）· 斩 ${this.kills} 敌` : msg`斩了 ${this.kills} 个 · 点此回古窑`,
            ],
            col: '#ffd070', glyph: BOONS.find(x => x.id === 'behead')!.glyph,
            tag: !this.usedRevive ? '孤刃独行' : '通关',
          } as CardBoon,
          tier: !this.usedRevive ? 2 : 1,
        }
      : returnCard(this.kills, false, haul);

    const canBonus = !this.botOn && !!b && (b.iron > 0 || b.herb > 0);
    if (!canBonus) {
      await this.cards.open([baseCard]);
      return;
    }
    const exIron = Math.ceil(b!.iron * 0.5), exHerb = Math.ceil(b!.herb * 0.5);
    const ch = await this.cards.open([
      baseCard,
      {
        boon: {
          id: 'haul_bonus', school: 'fg' as never,
          name: '杜五拾遗 · 收获加半',
          desc: [msg`观影让杜五沿路再收拢一趟：额外得 残铁+${exIron} 药引+${exHerb}`, '每局结算限一次 · 计入长明灯灯油'],
          col: '#ffe278', glyph: MEAL_GLYPH.purse, tag: '观影+50%',
        } as CardBoon,
        tier: 2,
      },
    ], {
      header: { title: won ? '此行功成 · 满载归窑' : '整备行囊 · 折返古窑', sub: msg`本趟带回 残铁 ${b!.iron} · 药引 ${b!.herb}`, col: '#ffd27a' },
      footer: '点选直接归窑，或观影让杜五拾遗增收五成',
    });
    if (ch === 1) {
      const ok = await this.watchAd('haul_bonus', '归窑结算 · 杜五拾遗', msg`本趟带回残铁 +${exIron}、药引 +${exHerb}`);
      if (ok) {
        prof.iron += exIron; prof.herb += exHerb;
        b!.iron += exIron; b!.herb += exHerb;
        saveProfile();
        cue('coin', 1);
      }
    }
  }
  /** act-114 第五关战后 3D 刀锋抵喉构图：崔玄卸兵跪地、刘白持刀平指喉前半寸（2.05m 安全间距让完整刀身清晰可见、零穿模） */
  /** act-137: stage Ch1–Ch4 first-kill confrontation — wounded boss kneeling on the battlefield, Liu Bai's blade poised at his
   *  throat, and a clean iai execution slash + physical collapse triggered at the exact throat-slit beat in CH_AFTER! */
  private stageBossAfterScene(ai: number) {
    const kb = this.kneelingBoss;
    const bossFoe = kb && kb.f.a.root.parent ? kb.f : null;
    for (const f of this.foes) {
      if (f === bossFoe) continue;
      dropTeles(f); f.a.dispose();
    }
    this.foes = bossFoe ? [bossFoe] : [];
    const bossKind = bossFoe ? bossFoe.kind : (BOSS_ORDER[ai] ?? 'hj_boss');
    const defiant = ai === 1 || bossKind === 'ly_boss';
    const bossR = bossFoe ? bossFoe.d.r : (EDEFS[bossKind]?.r ?? 0.65);
    const gap = Math.max(2.35, 1.74 + bossR * 1.15);
    const bossPos = bossFoe ? bossFoe.pos.clone().setY(0) : V3(0, 0, -2.0);
    const heroPos = V3(bossPos.x, 0, bossPos.z + gap);
    // act-169: Re-stage boss execution pair onto guaranteed clear interior floor (>= 2.8m from walls) so falling corpse never clips walls
    this.stageSafePair(heroPos, bossPos, gap, 2.8, 'ns');

    let actor: BattleActor;
    let ownsActor = false;
    if (bossFoe) {
      actor = bossFoe.a;
      bossFoe.pos.copy(bossPos);
      actor.home.copy(bossPos); actor.root.position.copy(bossPos);
      actor.yaw = Math.atan2(heroPos.x - bossPos.x, heroPos.z - bossPos.z);
      bossFoe.yaw = actor.yaw;
      actor.dead = false; actor.setRunning(false);
    } else {
      const def = ROSTER.find(d => d.id === bossKind) ?? ROSTER.find(d => d.id === 'hj_boss')!;
      actor = new BattleActor(def);
      actor.place(bossPos.clone(), Math.atan2(heroPos.x - bossPos.x, heroPos.z - bossPos.z));
      actor.yaw = Math.atan2(heroPos.x - bossPos.x, heroPos.z - bossPos.z);
      trimShadows(actor.root, 4);
      ownsActor = true;
    }

    this.hero.pos.copy(heroPos); this.hero.vel.set(0, 0, 0);
    this.hero.a.home.copy(heroPos); this.hero.a.root.position.copy(heroPos);
    this.hero.a.yaw = Math.atan2(bossPos.x - heroPos.x, bossPos.z - heroPos.z);
    motionOf(this.hero.a).run = 0;

    const throatY = defiant
      ? Math.max(1.24, Math.min(1.52, actor.height * 0.72))
      : Math.max(0.94, Math.min(1.26, actor.height * 0.54));
    const throatStop = V3(bossPos.x, throatY, bossPos.z + Math.max(0.34, bossR * 0.62));
    let afterT = kb ? Math.max(0.45, kb.t) : 0.6;
    let executed = false;
    const bossPose = (t: number) => defiant ? bossDefiantPose(actor, t) : bossKneelDefeatPose(actor, t);
    this.hero.scriptPose = () => heroHoldThroatPose(this.hero.a, throatStop, afterT);
    bossPose(afterT);
    this.talkTick = (dt: number) => {
      afterT += dt;
      if (ownsActor) actor.update(dt);
      if (!executed) bossPose(afterT);
    };

    const setAfterCam = (pos: V, look: V, fov: number) => {
      this.cutCam(pos, look, fov, { drift: [-0.22, -0.04, -0.22], fovDrift: -1.2 });
    };
    setAfterCam([bossPos.x + 4.4, 2.38, bossPos.z + gap * 1.12], [bossPos.x, throatY, bossPos.z + gap * 0.48], 36);

    let lacquerBox: THREE.Group | null = null;
    if (ai === 2 && this.stage) {
      lacquerBox = buildLacquerBox();
      lacquerBox.position.set(bossPos.x + 0.52, 0, bossPos.z + 0.42);
      this.stage.root.add(lacquerBox);
    }

    const execute = () => {
      if (executed) return;
      executed = true;
      if (this.kneelingBoss) this.kneelingBoss.executed = true;
      this.hero.scriptPose = null;
      this.hero.a.play(new Action('rel', 0.45, 0.30));
      setAfterCam([bossPos.x + 3.6, 2.25, bossPos.z + gap * 0.55], [bossPos.x, throatY, bossPos.z + gap * 0.35], 35);
      this.flashScreen(0.22, 0xffffff); hitstop(0.11); shake(0.34 * TUNE.shake); this.splitScreen(0.58);
      cue('cutHeavy', 1.0); cue('hitKill', 1.15);
      cue('foeDeath', 1.0, bossFoe ? voiceOf(bossFoe) : 1);
      after(0.32, () => cue('bodyFall', 0.72));
      blood.spray(actor.head().add(V3(0, -0.22, 0)), V3(0, 0.15, -1), 24, 1.25);
      blood.pool(bossPos.x, bossPos.z, 1.9, 260);
      fxSparks(actor.chest(), 0xffe4b8, 12, 4.2);
      actor.fall(Math.atan2(heroPos.x - bossPos.x, heroPos.z - bossPos.z));
    };

    const onAct = (txt: string) => {
      if (/香炉灰/.test(txt)) {
        fxSmoke(actor.head(), 0xb8b2a8, 10, { r: 0.4, spd: 1.2, up: 0.6, s: 0.36, life: 0.75, alpha: 0.7 });
        fxEmbers(actor.head(), 0xff8a30, 12, { r: 0.5, up: 1.4, life: 0.8 });
      }
      if (/火风扑面/.test(txt)) {
        fxEmbers(bossPos.clone().setY(0.8), 0xff7a24, 22, { r: 1.8, up: 2.8, life: 1.2 });
      }
      if (/抹喉|断喉|划过颈侧/.test(txt)) execute();
      if (/朱漆匣/.test(txt) && lacquerBox) {
        fxSparks(lacquerBox.position.clone().setY(0.25), 0xffd27a, 10, 2.8);
        lacquerBox.parent?.remove(lacquerBox); lacquerBox = null;
      }
      if (/解下|拾起|拔出|拔起/.test(txt)) {
        cue('bladeRing', 0.78);
        fxRing(this.hero.pos.clone().setY(0.08), 0xffe4a0, 2.2, { life: 0.75, width: 0.08, bright: 1.5 } as never);
        setAfterCam([heroPos.x - 2.6, 2.3, heroPos.z + 3.0], [heroPos.x, 1.05, heroPos.z], 34);
      }
    };

    const onLine = (idx: number, l: Line) => {
      if (l.who === 'act') {
        onAct(l.text);
      } else if (!executed) {
        if (l.who === 'jiangjin') {
          setAfterCam([heroPos.x + 3.4, 2.35, heroPos.z - 2.6], [heroPos.x, 1.08, heroPos.z], 36);
        } else {
          // Over-hero-shoulder reverse angle keeping kneeling boss cleanly centered between left & right portraits
          setAfterCam([bossPos.x - 3.6, 2.45, bossPos.z + gap + 2.3], [bossPos.x, throatY, bossPos.z + 0.2], 36);
        }
      } else if (l.who === 'jiangjin' && idx > 0) {
        // Solemn post-execution hero angle
        setAfterCam([heroPos.x - 2.4, 2.25, heroPos.z + 2.85], [heroPos.x, 1.08, heroPos.z], 33);
      }
    };

    const cleanup = () => {
      if (!executed) execute();
      if (lacquerBox) { lacquerBox.parent?.remove(lacquerBox); lacquerBox = null; }
      this.hero.scriptPose = null; this.talkTick = null; this.releaseCutCam(); this.kneelingBoss = null;
      const disposeTarget = actor;
      after(0.75, () => {
        disposeTarget.dispose();
        if (bossFoe) { const idx = this.foes.indexOf(bossFoe); if (idx >= 0) this.foes.splice(idx, 1); }
      });
    };

    return { execute, onAct, onLine, cleanup, wasExecuted: () => executed };
  }
  /** act-137 debug preview for Ch1–Ch4 boss first-kill kneeling confrontation & execution slash */
  private async debugBossAfter(ri: number, executeNow = false) {
    if (this.phase === 'title') stopTitle();
    if (this.cards.on) void this.cards.close?.();
    this.prologue = 0; this.forceSpec = null; this.viewSpec = null; this.noArena = false;
    this.region = ri; this.room = REGIONS[ri].rooms; this.locale = REGIONS[ri].bossLocale;
    this.plan = { type: 'boss', locale: REGIONS[ri].bossLocale, reward: null, waves: [] };
    await this.buildRoom(false);
    const exec = this.stageBossAfterScene(ri);
    await frames(2);
    if (executeNow) { exec.execute(); return; }
    await this.talk(CH_AFTER[ri], (idx, l) => {
      exec.onLine(idx, l);
    });
    exec.cleanup();
  }
  private stageCh5ThroatScene() {
    if (this.endCui) { this.endCui.dispose(); this.endCui = null; }
    for (const f of this.foes) { dropTeles(f); f.a.dispose(); }
    this.foes.length = 0;
    const cx = 0, cz = -2.4;
    const cuiPos = V3(cx, 0, cz); this.clamp(cuiPos, 0.7);
    const heroPos = V3(cuiPos.x, 0, cuiPos.z + 2.25); this.clamp(heroPos, 0.5);
    const def = ROSTER.find(d => d.id === 'cx_boss');
    if (def) {
      const a = new BattleActor(def);
      a.place(cuiPos.clone(), Math.atan2(heroPos.x - cuiPos.x, heroPos.z - cuiPos.z));
      a.yaw = Math.atan2(heroPos.x - cuiPos.x, heroPos.z - cuiPos.z);
      trimShadows(a.root, 4);
      this.endCui = a;
    }
    this.hero.pos.copy(heroPos); this.hero.vel.set(0, 0, 0);
    this.hero.a.home.copy(heroPos); this.hero.a.root.position.copy(heroPos);
    this.hero.a.yaw = Math.atan2(cuiPos.x - heroPos.x, cuiPos.z - heroPos.z);
    motionOf(this.hero.a).run = 0;
    // Target point strictly 0.30m in front of Cui Xuan's neck so the gleaming steel blade spans the gap cleanly without clipping!
    const throatStop = V3(cuiPos.x, 0.96, cuiPos.z + 0.30);
    let endT = 0;
    this.hero.scriptPose = () => heroHoldThroatPose(this.hero.a, throatStop, endT);
    this.talkTick = (dt: number) => {
      endT += dt;
      if (this.endCui) { this.endCui.update(dt); cuiKneelDefeatPose(this.endCui, endT); }
    };
    const cutCh5 = (l?: Line) => {
      if (!l || l.who === 'act') {
        this.cutCam([cuiPos.x + 4.4, 2.35, cuiPos.z + 2.55], [cuiPos.x, 0.96, cuiPos.z + 1.08], 36, { drift: [-0.24, -0.04, -0.20], fovDrift: -1.2 });
      } else if (l.who === 'jiangjin') {
        this.cutCam([heroPos.x + 3.4, 2.32, heroPos.z - 2.6], [heroPos.x, 1.08, heroPos.z], 35, { drift: [-0.20, -0.03, 0.18], fovDrift: -1.2 });
      } else {
        this.cutCam([cuiPos.x - 3.6, 2.40, cuiPos.z + 4.55], [cuiPos.x, 0.92, cuiPos.z + 0.15], 35, { drift: [0.22, -0.04, -0.22], fovDrift: -1.2 });
      }
    };
    cutCh5();
    return cutCh5;
  }
  /** act-114 结局实景切换至据点（雪夜断碑 / 黄昏暖窑），附带对应数量刀架、断碑刻痕与众人站位 */
  private async buildEndingHideout(opts: { time: 'night' | 'dusk'; weather: 'snow' | 'clear'; blades: number; cuts: number }) {
    this.hud.on = false;
    this.talkTick = null; this.hero.scriptPose = null;
    if (this.endCui) { this.endCui.dispose(); this.endCui = null; }
    for (const f of this.foes) f.a.dispose(); this.foes.length = 0;
    this.clearNpcs(); this.yard?.dispose(); this.yard = null;
    this.gates?.dispose(); this.gates = null; this.pieces?.dispose(); this.pieces = null;
    this.leaves?.dispose(); this.leaves = null;
    setStage(false);
    const def = hideoutScene({ time: opts.time, weather: opts.weather });
    this.stage = showStage(def, { combat: true });
    Object.assign(PLAY, HIDEOUT.floor);
    this.solids.clear();
    for (const so of hideoutSolids({ rackBuilt: false, forgeBuilt: false, gardenBuilt: false })) this.solids.add({ kind: 'prop', ...so });
    this.stele = new Stele(opts.cuts);
    this.stele.g.position.set(HIDEOUT.stele.x, 0, HIDEOUT.stele.z);
    this.stele.g.rotation.y = HIDEOUT.stele.yaw;
    this.stage.root.add(this.stele.g);
    this.stage.root.add(rackBlades(opts.blades));
    const dead = isDuwuDead(profile());
    const cast = dead ? (['sunao', 'fengtiebi'] as const) : (['duwu', 'sunao', 'fengtiebi'] as const);
    for (const id of cast) {
      const sp = HIDEOUT.people[id];
      const a = new BattleActor(HIDEOUT_PEOPLE[id]); a.place(V3(sp.x, 0, sp.z), sp.yaw); a.yaw = sp.yaw; trimShadows(a.root, 4);
      const sh = contactShadow(); sh.scale.setScalar(id === 'fengtiebi' ? 0.55 : 0.42); sh.position.set(sp.x, 0.025, sp.z); this.stage.root.add(sh);
      this.npcs.push({ id, x: sp.x, z: sp.z, yaw: sp.yaw, a, sh });
    }
    if (dead) {
      const mem = buildDuwuMemorial();
      mem.position.set(HIDEOUT.people.duwu.x, 0, HIDEOUT.people.duwu.z);
      mem.rotation.y = HIDEOUT.people.duwu.yaw;
      this.stage.root.add(mem);
      this.duwuMemorialMesh = mem;
      if (opts.blades >= 30) {
        const bowl = buildExtraBowl();
        bowl.position.set(7.05, 0, 5.95);
        this.stage.root.add(bowl);
        this.roadExtras.push(bowl);
      }
    }
    this.hero.a.dispose();
    this.hero = new Hero(V3(HIDEOUT.spawn[0], 0, HIDEOUT.spawn[1]), this.wearing);
    this.hero.a.yaw = -0.6;
    this.hud.on = false;
    await frames(2);
  }
  /** act-114 调试入口：直接切第五关藏刀阁预览刀锋抵喉抉择，或直接播放结局 A / B / C */
  private async debugEnding(choice?: 'a' | 'b' | 'c') {
    if (this.phase === 'title') stopTitle();
    if (this.cards.on) void this.cards.close?.();
    this.prologue = 0; this.forceSpec = null; this.viewSpec = null; this.noArena = false;
    this.region = 4; this.room = REGIONS[4].rooms; this.locale = 'cx_vault';
    this.plan = { type: 'boss', locale: 'cx_vault', reward: null, waves: [] };
    await this.buildRoom(false);
    const ch5Cut = this.stageCh5ThroatScene();
    await frames(2);
    if (choice) { await this.ending(choice); return; }
    await this.talk(CH_AFTER[4], (_idx, l) => ch5Cut(l));
    await this.ending();
  }
  /** 11-19 / act-114 剧情改版 (用户：「结局让玩家选」): 刀锋抵喉抉择 + A/B/C 三大实景 3D 结局演出 */
  private async ending(forced?: 'a' | 'b' | 'c') {
    this.hud.on = false; const was = this.phase; this.phase = 'pick';
    const glyph = BOONS.find(b => b.id === 'behead')!.glyph, ids = ['a', 'b', 'c'] as const, col = ['#d8dde8', '#c8b890', '#ffb070'];
    let id: 'a' | 'b' | 'c';
    if (forced) {
      id = forced;
    } else {
      const i = await this.cards.open(ids.map((k, idx) => ({
        boon: { id: `ending_${k}`, school: 'sr', name: ENDING_PICK[idx] ?? k, desc: [ENDING_DESC[idx] ?? '', ''], col: col[idx], glyph, tag: '' } as unknown as Boon,
        tier: idx === 2 ? 2 : 0,
      })));
      id = ids[Math.max(0, Math.min(2, i))];
    }
    seeOnce(`ending_${id}`);
    if (id !== 'b') { seeOnce('cuixuan_dead'); seeOnce('strike_5'); }
    saveProfile();
    this.phase = was;
    const toLines = (arr: Line[]) => arr.map(l => (l.who === 'caption' ? { ...l, who: 'act' } : l));
    const duwuDead = isDuwuDead(profile());
    const endA = duwuDead ? ENDING_A_NO_DUWU : ENDING.a;
    const endC = duwuDead ? ENDING_C_NO_DUWU : ENDING.c;

    if (id === 'a') {
      // Ending A: lethal draw in vault → snowy night Hideout stele 5th strike → walk out gate into snow alone
      this.hero.scriptPose = null; this.talkTick = null;
      this.hero.a.play(new Action('rel', 0.45, 0.32));
      this.flashScreen(0.45, 0xffffff); hitstop(0.14); shake(0.42);
      cue('cutHeavy', 1); cue('snowWind', 0.65);
      if (this.endCui) {
        blood.spray(this.endCui.chest(), V3(0, 0.15, -1), 28, 1.3);
        blood.pool(this.endCui.home.x, this.endCui.home.z, 1.4, 300);
        this.endCui.fall();
      }
      await this.talk(toLines(endA.slice(0, 2)));
      await wipeTransit(() => this.buildEndingHideout({ time: 'night', weather: 'snow', blades: 5, cuts: 4 }));
      const st = this.stele;
      if (st) await this.cine(steleStrikeShots(this.cineHost, HIDEOUT.stele, () => st.strike(4)), () => st.strike(4));
      const dw = this.npcs.find(n => n.id === 'duwu');
      if (dw) { dw.yaw = Math.atan2(this.hero.pos.x - dw.x, this.hero.pos.z - dw.z); dw.a.yaw = dw.yaw; }
      await this.talk(toLines(endA.slice(2, 5)));
      const gx = (HIDEOUT.exit.x0 + HIDEOUT.exit.x1) / 2;
      await this.cine(endingWalkShots(
        this.hero, [gx, HIDEOUT.exit.z - 4.4], [gx, HIDEOUT.exit.z + 1.6], 4.2,
        { pos: [gx + 3.8, 4.4, HIDEOUT.exit.z + 1.6], look: [gx, 0.95, HIDEOUT.exit.z - 2.2], fov: 40 },
        { pos: [gx + 3.2, 4.8, HIDEOUT.exit.z + 5.8], look: [gx, 0.95, HIDEOUT.exit.z + 0.6], fov: 40 },
        { at: [[0.3, () => cue('snowWind', 0.72)]] },
      ));
      await this.talk(toLines(endA.slice(5)));
    } else if (id === 'b') {
      // Ending B: sheath blade, lay down 4 Wen-family blades on flagstones, spare kneeling Cui Xuan → war horn & firelight → walk out into snow
      this.hero.scriptPose = null;
      this.hero.a.play(new Action('noto', 0.75, 0.55));
      cue('sheathe', 0.95);
      let laid: THREE.Group | null = null;
      await this.talk(toLines(ENDING.b.slice(0, 4)), (idx) => {
        if (idx === 1 && !laid && this.stage) {
          laid = buildLaidBlades();
          laid.position.set(this.hero.pos.x, 0.02, this.hero.pos.z - 1.05);
          this.stage.root.add(laid);
          this.roadExtras.push(laid);
          cue('parry', 0.42);
          fxSparks(laid.position.clone().setY(0.18), 0xffe4a0, 10, 2.5);
        }
      });
      const gateAt = V3(0, 0.6, PLAY.z1 - 0.8);
      cue('warHorn', 0.9); cue('fire', 0.7);
      fxGlow(gateAt, 0xff6a24, 3.6, 1.4, 2.2);
      fxEmbers(gateAt, 0xff8a30, 18, { r: 2.2, up: 3.4, life: 1.6 });
      fxRing(gateAt.clone().setY(0.1), 0xff4a2a, 3.4, { life: 1.1, width: 0.14, bright: 1.5 } as never);
      await this.talk(toLines(ENDING.b.slice(4, 5)));
      const fromPos: [number, number] = [this.hero.pos.x, this.hero.pos.z];
      const toPos: [number, number] = [0, Math.min(PLAY.z1 - 0.9, this.hero.pos.z + 5.6)];
      const cui = this.endCui; let ct = 0;
      this.talkTick = null;
      await this.cine(endingWalkShots(
        this.hero, fromPos, toPos, 3.8,
        { pos: [4.2, 3.6, fromPos[1] + 3.4], look: [0, 0.9, fromPos[1] - 0.8], fov: 38 },
        { pos: [3.2, 4.2, toPos[1] + 4.8], look: [0, 0.9, toPos[1] - 1.4], fov: 40 },
        { hold: (p, r) => this.clamp(p, r),
          at: [[0.4, () => cue('snowWind', 0.65)]],
          tickExtra: (_t, dt) => { ct += dt; if (cui) { cui.update(dt); cuiKneelDefeatPose(cui, ct); } } },
      ));
      await this.talk(toLines(ENDING.b.slice(5)));
    } else {
      // Ending C: lethal slash → warm dusk Hideout with 30-blade rack + 5-cut stele → camera glide → seated ON Du Wu's bench, unblinded!
      this.hero.scriptPose = null; this.talkTick = null;
      this.hero.a.play(new Action('rel', 0.45, 0.32));
      this.flashScreen(0.45, 0xffffff); hitstop(0.14); shake(0.42);
      cue('cutHeavy', 1);
      if (this.endCui) {
        blood.spray(this.endCui.chest(), V3(0, 0.15, -1), 24, 1.2);
        this.endCui.fall();
      }
      await this.talk(toLines(endC.slice(0, 1)));
      await wipeTransit(() => this.buildEndingHideout({ time: 'dusk', weather: 'clear', blades: 30, cuts: 5 }));
      // Ending C: hat OFF & portrait matches unhatted unblinded Liu Bai warmly seated by the hearth
      this.hatForcedOff = true;
      this.syncHeroHat();
      // Seat Liu Bai squarely ON Du Wu's wooden bench (5.63, 5.68) facing POT(6.4, 5.4) in the expanded hideout
      const pot = V3(6.4, 0.6, 5.4);
      this.hero.pos.set(5.63, 0, 5.68); this.hero.a.home.copy(this.hero.pos);
      this.hero.a.yaw = Math.atan2(pot.x - 5.63, pot.z - 5.68);
      const dw = this.npcs.find(n => n.id === 'duwu');
      const sa = this.npcs.find(n => n.id === 'sunao');
      if (dw) { dw.x = 7.3; dw.z = 6.4; dw.yaw = Math.atan2(pot.x - dw.x, pot.z - dw.z); dw.a.place(V3(dw.x, 0, dw.z), dw.yaw); dw.sh.position.set(dw.x, 0.025, dw.z); }
      if (sa) { sa.x = 7.5; sa.z = 4.8; sa.yaw = Math.atan2(pot.x - sa.x, pot.z - sa.z); sa.a.place(V3(sa.x, 0, sa.z), sa.yaw); sa.sh.position.set(sa.x, 0.025, sa.z); }
      let fireT = 0, unblind = false, heldBowl: THREE.Group | null = null;
      this.hero.scriptPose = () => heroSitFirePose(this.hero.a, fireT, unblind);
      this.talkTick = (dt: number) => {
        fireT += dt;
        if (dw) npcWarmPose(dw.a, fireT, 0.72);
        if (sa) npcWarmPose(sa.a, fireT + 0.9, 0.56);
      };
      // 3 crisp cinema cuts: 30-blade rack (bladeChorus!) -> 5-cut stele -> warm dusk hearth circle
      const fireCam = safeCam([3.8, 2.4, 7.9], [6.4, 0.8, 5.4], 34);
      await this.cine([
        { dur: 1.45, ease: 'out',
          from: safeCam([HIDEOUT.weaponRack.x + 1.4, 3.0, HIDEOUT.weaponRack.z + 3.8], [HIDEOUT.weaponRack.x, 1.3, HIDEOUT.weaponRack.z], 38),
          to: safeCam([HIDEOUT.weaponRack.x + 1.0, 2.9, HIDEOUT.weaponRack.z + 3.4], [HIDEOUT.weaponRack.x, 1.3, HIDEOUT.weaponRack.z], 36),
          at: [[0.15, () => cue('bladeChorus', 0.95)]],
          tick: (_t, dt) => { this.talkTick?.(dt); this.hero.a.update(dt); this.hero.scriptPose?.(); } },
        { dur: 1.35, ease: 'out',
          from: safeCam([HIDEOUT.stele.x - 0.6, 2.8, HIDEOUT.stele.z + 3.5], [HIDEOUT.stele.x, 1.1, HIDEOUT.stele.z], 36),
          to: safeCam([HIDEOUT.stele.x - 0.4, 2.7, HIDEOUT.stele.z + 3.1], [HIDEOUT.stele.x, 1.1, HIDEOUT.stele.z], 34),
          tick: (_t, dt) => { this.talkTick?.(dt); this.hero.a.update(dt); this.hero.scriptPose?.(); } },
        { dur: 1.25, ease: 'out',
          from: safeCam([3.6, 2.55, 8.2], [6.4, 0.8, 5.4], 36),
          to: fireCam,
          tick: (_t, dt) => { this.talkTick?.(dt); this.hero.a.update(dt); this.hero.scriptPose?.(); } },
      ]);
      this.cutCam(fireCam.pos, fireCam.look, fireCam.fov, { drift: [0.22, -0.04, -0.22], fovDrift: -1.0 });
      await this.talk(toLines(endC.slice(1)), (idx) => {
        // Line idx 1 corresponds to ENDING.c[2] ("她在断碑底下划完最后一道，抬手解开蒙眼布")
        if (idx >= 1) unblind = true;
        if (idx >= 5) {
          // Beat: "两只手捧住温热的陶碗" -> mount warm voxel clay bowl cleanly between her cupped hands!
          if (!heldBowl && this.stage) {
            heldBowl = buildHeldBowl();
            const fDir = V3(Math.sin(this.hero.a.yaw), 0, Math.cos(this.hero.a.yaw));
            heldBowl.position.copy(this.hero.pos).addScaledVector(fDir, 0.34).setY(0.76);
            this.stage.root.add(heldBowl);
            this.roadExtras.push(heldBowl);
          }
          this.cutCam([pot.x - 1.9, 2.05, pot.z + 1.95], [pot.x - 0.1, 0.78, pot.z + 0.05], 32, { drift: [0.16, -0.03, -0.16], fovDrift: -1.2 });
        }
      });
    }

    this.hatForcedOff = false;
    this.talkTick = null; this.hero.scriptPose = null; this.releaseCutCam();
    if (this.endCui) { this.endCui.dispose(); this.endCui = null; }
    this.musicHold = null; this.hud.on = true; this.end(true, id === 'b');
  }
  private end(win: boolean, spared = false) {
    this.phase = 'end'; this.bankRun(win); audio.stopMusic(2.0); cue(win ? 'stingWin' : 'stingLose', 1);
    after(0.4, async () => {
      this.hud.on = false;
      await this.openHaulSummary(win, spared);
      this.hud.on = true; void wipeTransit(() => this.enterYard());
    });
  }
  // ------------------------------------------------------------ frame
  /** act-165: Crisp 0-frame cinema hard-cut with subtle live camera breathing/push (never sluggish cross-room glides or frozen stop-motion) */
  private cutCam(
    pos: V,
    look: V,
    fov: number,
    opts?: { drift?: V; lookDrift?: V; fovDrift?: number; raw?: boolean },
  ) {
    const c = opts?.raw ? { pos, look, fov } : safeCam(pos, look, fov);
    const base0 = V3(...c.pos), look0 = V3(...c.look);
    const dPos = opts?.drift ? V3(...opts.drift) : V3(0, 0, 0);
    const dLook = opts?.lookDrift ? V3(...opts.lookDrift) : V3(0, 0, 0);
    const dFov = opts?.fovDrift ?? 0;
    this.camOverride = { base: base0.clone(), look: look0.clone(), fov: c.fov };
    shot('talkCut', (t) => {
      const k = 1 - Math.exp(-t * 0.32);
      return {
        base: V3(base0.x + dPos.x * k, base0.y + dPos.y * k, base0.z + dPos.z * k),
        look: V3(look0.x + dLook.x * k, look0.y + dLook.y * k, look0.z + dLook.z * k),
        fov: c.fov + dFov * k,
      };
    }, { cut: true, speed: 40 });
  }
  private releaseCutCam(cut = false, speed = 8) {
    this.camOverride = null;
    shot('act', () => this.camPose(), { cut, speed });
  }
  /** act-165 / act-174 / act-177: Hideout departure 3D put-on-hat ceremony — smooth in-place pitch-down & zoom-in (NO hard cut), completes full hat-donning BEFORE loading wipe, and restores HUD cleanly for combat */
  private departAnim: { t: number; dur: number; hold: number; lifted: boolean; seated: boolean; freezeK: number | null; resolve: () => void } | null = null;
  private departZoom = 0;
  private async playDepartHatCeremony(opts?: { preview?: boolean; freezeK?: number }) {
    if (this.phase === 'leaving' && !opts?.preview) return;
    const h = this.hero;
    if (!h) return;
    const E = HIDEOUT.exit;
    const hasConicalHat = !!h.a.bones.hat && (
      this.wearing.id === 'fine_hat' || this.wearing.id === 'fine_snow' || this.wearing.id === 'fine_obsidian' ||
      this.wearing.id === 'slim_hat' || this.wearing.id === 'slim_veil'
    );
    if (!hasConicalHat && !opts?.preview) {
      this.phase = 'leaving'; this.syncHeroHat(); WIPE.look = 'bamboo'; h.vel.set(0, 0, TUNE.heroSpeed * 0.8);
      after(0.35, () => { void wipeTransit(() => this.startRun()); });
      return;
    }
    this.phase = 'leaving';
    this.donningHat = true;
    this.hud.on = false;
    this.banner.hide();
    this.hideHideoutLabels();
    this.hideWorldPlates();
    this.exitGlow?.dispose(); this.exitGlow = null;
    this.inp.latch(false);
    // Keep Liu Bai right where she stopped at the exit (no jarring lateral teleport; just gently keep inside gate piers)
    const gx = Math.max(E.x0 + 0.25, Math.min(E.x1 - 0.25, opts?.preview ? (E.x0 + E.x1) * 0.5 : h.pos.x));
    const gz = opts?.preview ? E.z - 0.12 : Math.min(h.pos.z, E.z - 0.04);
    h.pos.set(gx, 0, gz); h.vel.set(0, 0, 0);
    h.a.home.copy(h.pos); h.a.root.position.copy(h.pos);
    h.a.yaw = 0.14;
    motionOf(h.a).run = 0;
    // NO hard camera cut — smoothly glide & lower the yard camera into a low 3/4 front view via camPose() departZoom!
    this.camOverride = null;
    const dur = 1.25, hold = 0.28;
    const initK = opts?.freezeK != null ? Math.max(0, Math.min(1, opts.freezeK)) : 0;
    h.scriptPose = () => {
      const da = this.departAnim;
      const k = da ? (da.freezeK != null ? da.freezeK : Math.min(1, da.t / da.dur)) : 1;
      heroPutHatPose(h.a, k);
    };
    heroPutHatPose(h.a, initK);
    if (opts?.freezeK != null) {
      this.departZoom = 1;
      this.departAnim = { t: initK * dur, dur, hold, lifted: true, seated: true, freezeK: initK, resolve: () => {} };
      return;
    }
    await new Promise<void>(resolve => {
      this.departAnim = { t: 0, dur, hold, lifted: false, seated: false, freezeK: null, resolve };
    });
    if (opts?.preview) return;
    // Hat is now 100% seated cleanly on her crown — NOW trigger the bamboo loading wipe and restore HUD for combat!
    this.departAnim = null;
    if (h.a.bones.hat) {
      h.a.bones.hat.visible = true;
      if (h.a.bones.hat.rest) { h.a.bones.hat.position.copy(h.a.bones.hat.rest.p); h.a.bones.hat.rotation.copy(h.a.bones.hat.rest.r); }
    }
    if (h.a.bones.weapon) h.a.bones.weapon.visible = true;
    h.scriptPose = null;
    WIPE.look = 'bamboo';
    void wipeTransit(() => { this.departZoom = 0; this.hud.on = true; return this.startRun(); });
  }
  /** debug / captures: a fixed camera (__dh.cam([x,y,z],[lx,ly,lz],fov) / __dh.cam(null)) */
  camOverride: { base: THREE.Vector3; look: THREE.Vector3; fov: number } | null = null;
  private camPose() {
    if (this.camOverride) return { base: this.camOverride.base.clone(), look: this.camOverride.look.clone(), fov: this.camOverride.fov };
    // the yard's costume rack: the camera leans in (half the distance) so the models can be looked at
    // (11-18: a later region's boss coming in — the camera draws back a while so he and the back of his room are in the frame together)
    // (act-174 / act-177: smooth in-place glide & pitch-down to low 3/4 portrait while Liu Bai puts on her conical hat — NO hard cut, full visibility of hands & face!)
    const dz = this.departZoom;
    const n = this.yard?.near ?? 0, k = (1 - 0.55 * n) * (1 + 0.08 * this.crowd) * (1 + 0.32 * this.bossLook) * (1 - 0.38 * this.tutCam);
    const base = this.cam.clone().add(V3(0, TUNE.camH * k, TUNE.camD * k)), look = this.cam.clone().add(V3(0, 0.6 + 0.5 * n, 0));
    let fov = TUNE.camFov;
    if (dz > 0.001 && this.hero) {
      const hp = this.hero.pos;
      const e = dz * dz * (3 - 2 * dz);
      const portBase = V3(hp.x + 1.05, 2.35, hp.z + 4.45);
      const portLook = V3(hp.x, 1.38, hp.z);
      base.lerp(portBase, e);
      look.lerp(portLook, e);
      fov = TUNE.camFov + (34 - TUNE.camFov) * e;
    }
    // (11-19 用户：「镜头要拉近一下」: a lesson pulls the camera in on her, eased in and back out)
    if (this.tutCam > 0.001 && this.hero) { const hp = this.hero.pos, d = V3(hp.x - this.cam.x, 0, hp.z - this.cam.z).multiplyScalar(this.tutCam); base.add(d); look.add(d).setY(look.y + 0.4 * this.tutCam); }
    // 11-18 QTE (用户：「QTE的时候要带镜头表现噢」): the duel's own framing blended over this one while it runs
    return this.duel.cam({ base, look, fov });
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
  /** 11-20 (用户：「被遮挡的人做轮廓线吧」): keep walls intact (SEE_HOLES disabled) and mark live actors so post.ts draws crisp
   *  silhouette outlines (warm ivory-gold for hero/allies/NPCs, vermilion for foes) wherever walls/roofs/trees occlude them */
  private seeThrough() {
    const H = SEE_HOLES.value, h = this.hero;
    for (const v of H) v.w = 0;
    const on = this.phase !== 'opening' && this.phase !== 'title';
    if (h) setActorOcc(h.a.root, on && (h.alive || this.proFalling) ? 1 : 0);
    for (const f of this.foes) setActorOcc(f.a.root, on && f.st !== 'dead' && !f.mem.hidden ? 2 : 0);
    if (this.allyGen) setActorOcc(this.allyGen.a.root, on && this.allyGen.active ? 1 : 0);
    for (const n of this.npcs) setActorOcc(n.a.root, on ? 1 : 0);
    // act-129 / act-132: route boards now use crisp GreaterDepth see-through plaque face (no messy wireframe silhouettes!)
    setPropOcc(this.stele?.g, on ? 1 : 0);
    setPropOcc(this.exitSign, on ? 1 : 0);
    if (this.yard) for (const p of this.yard.plinths) { setActorOcc(p.actor.root, on ? 1 : 0); setPropOcc(p.sign, on ? 1 : 0); }
    if (this.stations) {
      if (this.stations.merchant) setActorOcc(this.stations.merchant.root, on ? 1 : 0);
      for (const s of this.stations.list) { const k = on && !s.done ? 1 : 0; setPropOcc(s.g, k); setPropOcc(s.sign, k); }
      for (const f of this.stations.fires) setPropOcc(f, on ? 1 : 0);
    }
  }
  /** act-165: render MoveStage's live 3D Mini-World inside its scissor bay before L.renderText */
  renderMiniWorld(renderer: THREE.WebGLRenderer) { this.pause.renderMiniWorld(renderer); }
  /** act-165: true whenever any interactive modal/cutscene/menu is open and must capture all player input */
  private isUiModalOpen(): boolean {
    return !!this.adModal?.on || this.cards.on || this.phase === 'pick' || this.dialogue.on || this.phase === 'talk' || this.phase === 'cine' || this.timeline.on || this.pause.on;
  }
  /** act-165: true whenever live combat enemies (excluding wooden training dummies) are active — blocks NPC/facility interactions */
  private inCombat(): boolean {
    return this.entering.length > 0 || this.bossDrops.length > 0 || this.foes.some(f => f.st !== 'dead' && f.kind !== 'dummy');
  }
  private findHideoutNear(h: Hero): string | null {
    let near: string | null = null, nd = 1.9;
    for (const n of this.npcs) { const d = Math.hypot(n.x - h.pos.x, n.z - h.pos.z); if (d < nd) { nd = d; near = n.id; } }
    if (this.duwuMemorialMesh) { const d = Math.hypot(HIDEOUT.people.duwu.x - h.pos.x, HIDEOUT.people.duwu.z - h.pos.z); if (d < Math.min(nd, 2.0)) { nd = d; near = 'duwu_memorial'; } }
    for (const [zid] of this.zoneMonuments) {
      const zm = HIDEOUT_ZONES[zid].monument;
      const d = Math.hypot(zm.x - h.pos.x, zm.z + 0.55 - h.pos.z);
      if (d < Math.min(nd, 2.2)) { nd = d; near = 'zone_' + zid; }
    }
    if (this.stele && HIDEOUT.stele) { const d = Math.hypot(HIDEOUT.stele.x - h.pos.x, HIDEOUT.stele.z + 0.65 - h.pos.z); if (d < Math.min(nd, 1.65)) { nd = d; near = 'stele'; } }
    if (this.weaponRackMesh) { const d = Math.hypot(HIDEOUT.weaponRack.x - h.pos.x, HIDEOUT.weaponRack.z + 0.85 - h.pos.z); if (d < Math.min(nd, 2.0)) { nd = d; near = 'weaponRack'; } }
    if (this.keepsakeBoxMesh) { const d = Math.hypot(HIDEOUT.keepsakeBox.x - h.pos.x, HIDEOUT.keepsakeBox.z + 0.7 - h.pos.z); if (d < Math.min(nd, 1.65)) { nd = d; near = 'keepsakeBox'; } }
    if (this.lanternMesh) { const d = Math.hypot(HIDEOUT.lantern.x - h.pos.x, HIDEOUT.lantern.z - h.pos.z); if (d < Math.min(nd, 1.75)) { nd = d; near = 'lantern'; } }
    if (this.trialSteleMesh) { const d = Math.hypot(HIDEOUT.trialStele.x - h.pos.x, HIDEOUT.trialStele.z - h.pos.z); if (d < Math.min(nd, 1.8)) { nd = d; near = 'trialStele'; } }
    if (this.gardenMeshes.length > 0) {
      for (let gi = 0; gi < HIDEOUT.gardenPlots.length; gi++) {
        const gp = HIDEOUT.gardenPlots[gi], d = Math.hypot(gp.x - h.pos.x, gp.z - h.pos.z);
        if (d < Math.min(nd, 1.8)) { nd = d; near = 'garden_' + gi; }
      }
    }
    return near;
  }
  /** act-180: single-source-of-truth WeChat Game Club visibility & placement (title corner / peaceful hideout top-right / pause main) */
  private syncGameClub() {
    if (!this.gameClub) return;
    let placement: GameClubPlacement = { kind: 'none' };
    const blocked = bladeBusy() || bladeWorking() || !!this.adModal?.on || this.cards.on || this.dialogue.on || this.timeline.on || this.labOn || this.demo.on;
    if (!blocked) {
      if (this.pause.on) {
        if (this.pause.page === 'main') placement = { kind: 'pause' };
      } else if (this.phase === 'title') {
        const tc = titleClubAnchor();
        if (tc.active) placement = { kind: 'title', menuSide: tc.side };
      } else if (this.phase === 'yard' && !this.inCombat() && !this.donningHat && !this.departAnim && !this.noTalk) {
        placement = { kind: 'yard' };
      }
    }
    this.gameClub.sync(placement);
  }
  private wasUiModal = false;
  private frame(dt: number, rdt: number) {
    // 11-19: cutscenes and conversations scale the art pixel with how near the shot is (director.ts CINE_PX)
    CINE_PX.on = this.phase === 'cine' || this.phase === 'talk' || this.donningHat; CINE_PX.ref.d = Math.hypot(TUNE.camH, TUNE.camD); CINE_PX.ref.fov = TUNE.camFov;
    // Keep using the walk through the gate and the blade's arrival. roomSteps takes ownership before foreground work.
    if (this.ahead.length && (this.phase === 'doors' || this.phase === 'leaving' || this.phase === 'pick' ||
      (this.phase === 'yard' && !this.foes.some(f => f.kind !== 'dummy' && f.st !== 'dead')))) this.workAhead();
    if (this.proAhead) this.workPro();
    if (bladeBusy()) return;
    this.seeThrough();
    this.storySkipFrame();
    // act-128: smoothly dim the 3D world behind all selection UIs (Cards3D) and PauseMenu while keeping the 3D UI layer full brightness
    {
      const uiDt = PAUSE.on ? PAUSE.rdt : rdt;
      const wantDim = (this.cards.on || this.pause.on || this.adModal?.on) ? 1 : 0;
      UI_LOOK.modalDim += (wantDim - UI_LOOK.modalDim) * Math.min(1, uiDt * 12);
      if (Math.abs(wantDim - UI_LOOK.modalDim) < 0.004) UI_LOOK.modalDim = wantDim;
    }
    if (PAUSE.on) {
      this.L.text.hide('act.npc');
      this.L.text.hide('act.station.hint');
      this.hideWorldPlates();
      this.banner.hide();
      this.barks?.update(0, true, 0);
      if (this.previewOn && this.demo.on) { this.demo.update(PAUSE.rdt); this.hud.update(PAUSE.rdt, this.inp, []); }   // (11-19: 已得's ghost, on real time)
      return;
    }   // the pause menu runs on its own (real time); the world gets nothing (11-18: a hideout name over the menu's pages hidden)
    // act-109: freeze hold-timer accumulation during hitstop / 一闪 stillness so quick taps never get misread as a 藏锋 hold
    // act-165: snapshot modal UI state BEFORE padScreens so a same-frame UI confirm/close (e.g. Pad A = dash, Space, J) NEVER leaks into hero combat input!
    const uiBefore = this.isUiModalOpen();
    this.inp.frame(rdt, FX.hitstop > 0 || this.iaiHeld);
    this.padScreens(rdt);
    const uiAfter = this.isUiModalOpen();
    const uiLocked = uiBefore || uiAfter;
    if (uiLocked || this.wasUiModal) {
      if (uiBefore !== uiAfter || (this.wasUiModal && !uiAfter)) this.inp.latch(true);
      if (uiLocked) {
        for (const b of Object.values(this.inp.b)) { b.pressed = false; b.down = false; b.released = false; b.held = 0; b.last = 0; }
        this.inp.move.x = this.inp.move.y = 0;
      }
    }
    this.wasUiModal = uiAfter;
    if (this.phase === 'opening' || this.phase === 'title') { this.hideWorldPlates(); return; }   // opening.ts / title.ts run the start screen
    // act-20: a cutscene or a conversation — the timeline / the dialogue run, the people idle, nothing fights
    // (act-26: once a conversation ends the phase moves on at once — the portraits still have to slide out, so keep driving them)
    if (this.phase !== 'cine' && this.phase !== 'talk') { this.dialogue.update(rdt); this.timeline.update(rdt); }   // (act-36: the letterbox slides back out)
    if (this.phase === 'cine' || this.phase === 'talk' || this.dialogue.on) {
      this.cancelQte(); GRADE.bloodVig = 0; this.syncHeroHat();
      this.hideWorldPlates();
      this.banner.hide();
      if (this.fullRing) this.fullRing.visible = false;
      if (this.phase === 'cine' || this.phase === 'talk') { this.timeline.update(rdt); this.dialogue.update(rdt); }
      // the bot reads fast: a line every 0.6 s (cutscenes play out)
      if (this.botOn && this.dialogue.on && (this.botTalkT += rdt) > 0.6) { this.botTalkT = 0; this.dialogue.advance(); }
      if (this.phase === 'talk' || this.dialogue.on) {
        this.hero?.a.update(dt); this.hero?.scriptPose?.();
        for (const f of this.foes) f.a.update(dt);
        for (const n of this.npcs) n.a.update(dt);
        this.allyGen?.a.update(dt);
        this.generalEvent?.actor.update(dt);
        this.cuiInspect.frame(dt);
        this.talkTick?.(dt);
        this.leaves?.update(dt, this.cam.x, this.cam.z); this.gates?.update(dt);
      }
      for (const f of this.puppets) if (this.phase === 'talk' && !f.a.root.userData.still) f.a.update(dt);   // (act-30: the dead stay still)
      blood.update(dt);   // (11-18: the prologue's wound bleeds through the cutscene and the talk — the drops fall instead of hanging in the air)
      const prevHud = this.hud.on; this.hud.on = false;
      this.hud.update(rdt, this.inp, []); this.feed.update(rdt, this.hud.feedAt, this.hud.k, false);
      if (this.phase !== 'cine' && this.phase !== 'talk') this.hud.on = prevHud;
      this.L.on = true; return;
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
    }
    const busy = uiLocked || this.cards.on || this.phase === 'pick' || this.phase === 'leaving' || this.ultOn || !!h.scriptPose || this.demo.on || this.duel.locks;   // (act-46: lying on the mat / getting up — no sliding off it) (11-18 QTE: held in a 拼刀 / a 连环) (act-165: uiLocked prevents same-frame close leak)
    this.qteFrame(rdt); this.parryCd -= rdt;
    this.tut.frame(rdt, {
      phase: this.phase, prologue: this.prologue, hero: h, inp: this.inp, foes: this.foes,
      threats: w => { const t = this.threats(w); return t.foes.length + t.arrows.length; },
      onGuarantee: (id, target) => {
        if (id === 'attack' && target) {
          const to = target.pos.clone().sub(h.pos).setY(0), d = to.length();
          if (d > 1.35) { h.pos.addScaledVector(to.normalize(), Math.min(0.55, d - 1.25)); this.clamp(h.pos, h.r); }
        } else if (id === 'dash') {
          const from = target?.pos.clone() ?? h.pos.clone();
          after(0.03, () => { if (this.hero?.alive && this.dodgeCd <= 0) this.perfectDodge(from); }, { real: true });
        } else if (id === 'parry') {
          const from = target?.pos.clone() ?? h.pos.clone();
          h.inv = Math.max(h.inv, 0.55);
          after(0.02, () => { if (this.hero?.alive && this.parryCd <= 0) this.iaiParry(from); }, { real: true });
        }
      },
    }, busy || this.duel.locks || this.qteT >= 0 || this.botOn);
    this.duel.frame(rdt);   // 11-18 拼刀 / 连环破势: reads the attack button before it is cleared below
    if (busy) { for (const b of Object.values(this.inp.b)) { b.pressed = false; b.down = false; b.held = 0; } this.inp.move.x = this.inp.move.y = 0; }
    if (this.phase === 'intro') { this.introT += dt; this.inp.move.x = 0; this.inp.move.y = this.introT < 0.5 ? 0.7 : 0; for (const b of Object.values(this.inp.b)) { b.pressed = false; b.down = false; b.held = 0; } }
    this.statusStep(dt, h);
    // (11-18: her blade's aim and the auto-aimed darts don't find a foe out of sight — a 死士 in the shadow, a 水鬼 under the water)
    // (11-19 / act-125: foes climbing in or bosses mid-sky-drop are untargetable until landing)
    this.heroWorld.foes = this.foes.some(f => f.mem.hidden) || this.entering.length || this.bossDrops.length
      ? this.foes.filter(f => !f.mem.hidden && !this.entering.some(e => e.f === f) && !this.bossDrops.some(d => d.f === f))
      : this.foes;
    // act-136 / act-165 / act-181: shop / rest / scroll / roadside Du Wu interact intercept BEFORE h.update (blocked during active combat)
    const combatNow = this.inCombat();
    if (this.stations && this.phase === 'doors' && !combatNow && !busy && !this.pause.on && !this.dialogue.on && !this.shopOpening && this.inp.b.attack.pressed) {
      let ns = this.stations.near(h.pos);
      const nearM = !ns && this.stations.nearMerchant(h.pos);
      const rd = this.roadDuwu;
      const rdDist = rd && !rd.talked && !rd.talking ? Math.hypot(rd.pos.x - h.pos.x, rd.pos.z - h.pos.z) : 99;
      const nsDist = ns ? Math.hypot(ns.at.x - h.pos.x, ns.at.z - h.pos.z) : 99;
      const nearRd = !nearM && rdDist < 2.25 && rdDist < nsDist;
      if (nearRd) ns = null;
      if (ns) {
        this.inp.b.attack.pressed = false;
        this.inp.latch(true);
        const noSharp = ns.id.endsWith('sharpen') && !this.sharpenable().length;
        if (ns.price > this.coins || noSharp) {
          cue('deny', 0.45);
          this.banner.show(ns.label, noSharp ? '暂无可升阶的已得秘传' : msg`铜钱不足（需 ${ns.price} 钱）`, 1.2, '#ff9884');
        } else {
          void this.useStation(ns);
        }
      } else if (nearM) {
        this.inp.b.attack.pressed = false;
        this.inp.latch(true);
        void this.shopOverviewMenu();
      } else if (nearRd) {
        this.inp.b.attack.pressed = false;
        this.inp.latch(true);
        void this.talkRoadDuwu();
      }
    }
    // act-165: peaceful hideout NPC/facility interact intercept BEFORE h.update so pressing J/X opens cleanly without swinging, and is completely disabled while sparring live foes!
    if (this.phase === 'yard' && !combatNow && !busy && !this.pause.on && !this.dialogue.on && !this.noTalk && this.inp.b.attack.pressed) {
      const near = this.findHideoutNear(h);
      if (near) {
        this.inp.b.attack.pressed = false;
        this.inp.latch(true);
        this.npcNear = near;
        void this.npcTalk(near);
        return;
      }
    }
    h.update(dt, this.inp, this.heroWorld);
    // act-146: crisp subtle water-step splashes when Liu Bai runs/dashes across shallow flooded stone puddles (Xiapi pools)
    if (this.pools.length && h.y < 0.08 && Math.hypot(h.vel.x, h.vel.z) > 0.65 && this.pools.some(r => h.pos.x > r.x0 && h.pos.x < r.x1 && h.pos.z > r.z0 && h.pos.z < r.z1)) {
      this.wetStepT -= dt;
      if (this.wetStepT <= 0) {
        this.wetStepT = h.st === 'dash' ? 0.09 : 0.24;
        const fp = h.pos.clone().setY(0.05);
        fxRing(fp, 0x9ec4d4, 0.55, { life: 0.32 } as never);
        for (let k = 0; k < 3; k++) addBlock(fp.clone().add(V3(R(-0.14, 0.14), 0.04, R(-0.14, 0.14))), { size: 0.045, col: 0xb8dce8, glow: false, life: 0.22, shrink: 0.1, v: V3(R(-0.8, 0.8), R(0.9, 1.7), R(-0.8, 0.8)) });
      }
    } else this.wetStepT = Math.max(0, this.wetStepT - dt);
    this.hud.setAim(h.aiming ? { x: h.aimDir.x, y: -h.aimDir.z } : null);   // act-29: the dart button leans to the aim
    if (h.aiming) { const pv = h.aimPreview(this.heroWorld), L = TUNE.dartRange, al = this.aimLine;
      al.visible = true; al.position.set(h.pos.x, 0.07, h.pos.z); al.rotation.y = Math.atan2(pv.dir.x, pv.dir.z); al.scale.set(1, 1, L);
      const cap = al.getObjectByName('cap')!; cap.scale.set(1, 1, 1 / L); (al.material as THREE.MeshBasicMaterial).color.set(pv.onFoe ? 0xffd27a : 0xe8eeff); }
    else this.aimLine.visible = false;
    if (this.departAnim) {
      const da = this.departAnim;
      this.departZoom += (1 - this.departZoom) * Math.min(1, rdt * 6.0);
      if (da.freezeK == null) {
        da.t += dt;
        const k = Math.min(1, da.t / da.dur);
        if (!da.lifted && k >= 0.14) { da.lifted = true; cue('whoosh', 0.45); }
        if (!da.seated && k >= 0.68) {
          da.seated = true;
          cue('click', 0.48); cue('snowWind', 0.35);
          this.leaves?.blast(h.pos.x, h.pos.z, 1.8, 3.2);
        }
        if (da.t >= da.dur + da.hold) {
          const done = da.resolve;
          this.departAnim = null;
          done();
        }
      }
      h.vel.set(0, 0, 0); motionOf(h.a).run = 0;
    } else if (this.departZoom > 0.001 && this.phase !== 'leaving') {
      this.departZoom = Math.max(0, this.departZoom - rdt * 4.5);
    }
    h.a.update(dt); h.deathPose(); h.scriptPose?.(); for (const a of this.lineupActors) a.update(dt);
    if (this.labFn) { this.labT += dt; this.labFn(dt, this.labT); }
    const fw = this.foeWorld; fw.heroPos.copy(h.pos); fw.heroAlive = h.alive && (this.phase === 'fight' || this.phase === 'yard'); fw.heroY = h.y; fw.heroDodge = h.dodgeWin; fw.heroYaw = h.a.yaw; fw.pools = this.pools;
    // act-20 / act-135 / act-154: the hideout's people, roadside actors, 落成工碑 monuments & spring pop-in animations
    for (const n of this.npcs) n.a.update(dt);
    for (const a of this.roadActors) if (!this.roadStill.has(a)) a.update(dt);
    this.tickSpringAnims(dt);
    if (this.phase === 'yard') {
      this.extraAnimT += dt;
      this.lanternTick?.(this.extraAnimT);
      this.decorTick?.(this.extraAnimT);
      if (combatNow) {
        this.npcNear = null;
        this.hideHideoutLabels();
        this.npcMarks(dt, null);
      } else {
        const near = this.findHideoutNear(h);
        this.npcNear = near;
        this.npcMarks(dt, near);
      }
    } else { this.npcNear = null; this.hideHideoutLabels(); }
    // the yard: slabs summon sparring partners, the rack swaps the costume, the back road starts a run
    if (this.phase === 'yard' && this.yard) {
      const ev = this.yard.update(dt, h.pos, h.y, this.foes.filter(f => f.st !== 'dead' && f.kind !== 'dummy').length);
      if (ev.summon) {
        const at = SPAWN_AT(), f = spawnFoe(ev.summon, at, h.pos.clone()); this.foes.push(f);
        fxSmoke(at.clone().add(V3(0, 0.3, 0)), 0x6a6a74, 10, { r: 0.7, spd: 1.2, up: 0.6, s: 0.4, life: 0.7 }); cue(isBoss(f) ? 'roar' : 'summon', 0.6);   // wp/foes: isBoss
        if (isBoss(f)) f.a.roar();
      }
      if (!combatNow && ev.wear && ev.plinth) {
        const old = this.wearing; this.wear(ev.wear); this.yard.swap(ev.plinth, old);
        h.pos.z = ev.plinth.z + 1.1; h.a.yaw = 0; fxSmoke(h.pos.clone().setY(0.6), 0x8a8a94, 10, { r: 0.6, spd: 1.2, up: 0.8, s: 0.4, life: 0.6 });
        this.banner.show(ev.wear.name, ev.wear.role || '', 1.2);
      }
      const E = HIDEOUT.exit;
      if (h.pos.z > E.z && h.pos.x > E.x0 - 0.2 && h.pos.x < E.x1 + 0.2) {
        void this.playDepartHatCeremony();
      }
    }
    this.decoyStep(dt); this.pinStep(dt); this.markStep(); this.dodgeGhostStep(rdt);   // 11-18 秘传 + act-118 完美闪避残影
    if (this.comboT > 0) { this.comboT = Math.max(0, this.comboT - dt); if (this.comboT <= 0) this.resetCombo(); else this.hud.combo = { hits: this.comboHits, bonus: this.comboStyle().dmgPct, frac: this.comboT / 3.2 }; }
    this.enterStep(dt); this.bossDropStep(dt); this.fleeStep(rdt);
    if (this.movesPreviewOn) {
      if (h.hp < 15) h.hp = 60;
      for (const f of this.foes) {
        if (f.mem.passive) f.cd = Math.max(f.cd, 99);
        if (f.mem.immortal && f.st !== 'dead' && f.hp < f.maxHp * 0.35) f.hp = f.maxHp;
      }
    }
    for (const f of this.foes) {
      if (__DEBUG_UI__ && (f.mem.barrier ?? 0) > 0) { const b = this.fightLog.bosses.find(x => x.uid === f.uid); if (b) b.gate += dt; }
      const ent = !this.ultOn ? this.entering.find(e => e.f === f) : undefined;
      if (!this.ultOn && (ent || this.bossDrops.some(d => d.f === f))) {
        f.a.update(dt);
        if (ent && ent.posePhase) poseWallVault(f.a, ent.posePhase, ent.poseU);
        continue;
      }
      if (this.kneelingBoss && this.kneelingBoss.f === f && !this.kneelingBoss.executed) {
        this.kneelingBoss.t += dt;
        f.a.update(dt);
        if (f.kind === 'ly_boss') bossDefiantPose(f.a, this.kneelingBoss.t);
        else bossKneelDefeatPose(f.a, this.kneelingBoss.t);
        continue;
      }
      if (this.duel.holds(f)) this.duel.holdFoe(f, dt);   // 11-18 QTE: the duel moves the foe it has (held in the bind / its string's beats)
      else if (!this.ultOn) {
        // 11-18 留影 / act-138 守关劫民: foes redirected to afterimage decoy OR un-aggro'd raiders storming the village chokepoint!
        const rTgt = !this.decoyFor(f) ? this.generalEvent?.raiderTarget(f) : null;
        if (this.decoyFor(f)) {
          const d = this.decoy!, hp = fw.heroPos.clone(), hy = fw.heroY, hd = fw.heroDodge, hurt = fw.hurtHero;
          fw.heroPos.copy(d.pos); fw.heroY = 0; fw.heroDodge = false; fw.hurtHero = () => this.dropDecoy();
          updateFoe(f, fw, dt);
          fw.heroPos.copy(hp); fw.heroY = hy; fw.heroDodge = hd; fw.hurtHero = hurt;
        } else if (rTgt) {
          const hp = fw.heroPos.clone(), hy = fw.heroY, hd = fw.heroDodge, hurt = fw.hurtHero;
          fw.heroPos.copy(rTgt.pos); fw.heroY = 0; fw.heroDodge = false; fw.hurtHero = (dmg: number) => rTgt.onHit(dmg);
          updateFoe(f, fw, dt);
          fw.heroPos.copy(hp); fw.heroY = hy; fw.heroDodge = hd; fw.hurtHero = hurt;
        } else updateFoe(f, fw, dt);
        if (f.mem.justBrokeBarrier) {
          f.mem.justBrokeBarrier = 0;
          popPix('破阵', f.a.head().add(V3(0, 0.65, 0)), { tier: 'highlight', color: '#fff8cc', accent: '#ffd258', h: 0.96, life: 1.15 });
          hitstop(0.09 * TUNE.hitstop); shake(0.32 * TUNE.shake); this.splitScreen(0.55);
        }
      }
      f.a.update(dt);
    }
    this.duel.flush();   // 11-18 拼刀: a blow 破势 met in the loop above locks blades now (not a frame later)
    // act-114 三国友军名将（赵云 / 陆逊）并肩作战与交锋名将（吕布 / 夏侯惇）计时收招
    if (this.allyGen && this.allyGen.active && this.phase === 'fight') {
      const allyHost: AllyHost = {
        foes: this.foes, heroPos: h.pos, clamp: (p, r) => this.clamp(p, r),
        hitFoe: (f, dmg, from, _col) => this.hitFoe(f, dmg, from, { knock: 0.7, heavy: false, kind: 'ally' }),
        say: (head, line) => { if (this.phase === 'fight') this.barks?.say(head, line); },
      };
      this.allyGen.update(dt, allyHost);
    }
    if (this.duelGen && !this.duelGen.done && this.phase === 'fight') {
      this.duelGen.t += dt;
      if (this.duelGen.t >= 22) void this.finishDuelGeneral();
    }
    if (this.generalEvent && this.phase === 'fight') this.generalEvent.update(dt);
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
        w.hit.add(f.uid); this.hitFoe(f, Math.round(TUNE.finDmg * 0.7 * (v(this.perks, 'bladeWind') || 50) / 100), p0, { knock: 0.8, heavy: false, kind: 'wind' });   // (11-18: 刀芒 100 / 150 / 200 % of 0.7 × the finisher — it was a flat 12 × share)
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
      if (this.generalEvent && !d.returning && this.generalEvent.hitByDart(d.p.x, d.p.z)) { if (d.back > 0) d.turnBack(); else d.stop(); continue; }
      for (const f of this.foes) {
        if (f.st === 'dead' || d.p.y > 2.4 || d.passed.has(f.uid)) continue;
        const ab = d.p.clone().sub(p0).setY(0), L2 = Math.max(1e-6, ab.lengthSq()), t = Math.max(0, Math.min(1, f.pos.clone().sub(p0).setY(0).dot(ab) / L2)), q = p0.clone().addScaledVector(ab, t);
        if (Math.hypot(f.pos.x - q.x, f.pos.z - q.z) < f.d.r + 0.2) {
          this.hitFoe(f, d.dmg * (d.returning ? d.back : 1), p0, { knock: 0.12, heavy: false, kind: 'dart', stagger: 0 }); cue('dartHit', 0.7);
          if (d.link && d.link !== this.qiVolley) { this.qiVolley = d.link; this.hero.gainQi(QI_LINK); }
          if ((f.st as string) !== 'dead' && hasBoon(this.perks, 'pin')) this.pinFoe(f);
          // act-118 / act-152 影镖 3件: dart hits unleash a shadow-blade echo slash (0.25s ICD so fan volleys don't burst 5x)
          if ((f.st as string) !== 'dead' && archTier(this.perks, 'shadow') >= 3 && clock.time - this.shadowEchoAt >= 0.25) {
            this.shadowEchoAt = clock.time;
            const c = f.a.chest();
            trailSeg(c.clone().add(V3(-0.45, 0.3, 0)), c.clone().add(V3(0.45, -0.3, 0)), 0xa4b4ff, 0.11, { life: 0.2, bright: 2.6, spark: 0.4 });
            this.hitFoe(f, d.dmg, p0, { knock: 0.1, heavy: false, kind: 'echo', stagger: 0 });
          }
          // act-118 修复暗坑: 折返飞镖穿透时依然留下中镖印记(dartMarkT)，不再废掉「寻声」和「牵红」
          if (d.back > 0) { if ((f.st as string) !== 'dead') f.dartMarkT = TUNE.chaseWin; d.passed.add(f.uid); continue; }
          if ((f.st as string) !== 'dead') d.stickIn(f, TUNE.chaseWin); else d.stop(); break;
        }
      }
      if (d.dead || d.stuck || d.returning) continue;
      // (a 折返 dart that has run out of range turned above; one that hit the floor still stops)
      const q = d.p.clone(); this.clampAir(q, 0); if (d.back <= 0 && (q.distanceTo(d.p) > 0.3 || d.life <= 0) || d.p.y < 0.05) d.stop(d.life > 0);
    }
    this.darts = this.darts.filter(d => !d.dead);
    this.hitArcs.update(rdt, h.pos);
    (this.barks ??= new Barks(this.L)).update(rdt, (this.phase as string) === 'talk' || (this.phase as string) === 'cine' || this.dialogue.on || this.cards.on || this.pause.on, this.banner.bottomY);
    if (this.props && this.phase !== 'pick') this.applyProps(this.props.update(dt, this.targets()), true);   // act-19: fuses, fires, the falling pillars
    this.gates?.update(dt);
    if (this.pieces && this.hero) {
      const bodies = this.pieces.plates.length ? this.foes.filter(f => f.st !== 'dead').map(f => ({ pos: f.pos, r: f.d.r })) : [];
      const calm = !this.foes.some(f => f.st !== 'dead' && f.kind !== 'dummy');
      const frame = { foes: bodies, heroRadius: this.hero.r, heroHeight: this.hero.y, waitZone: this.waitZone };
      for (const e of this.pieces.update(dt, this.hero.pos, calm, frame)) if (e.k === 'reward') void this.reward(e.tier);
      // 11-18 定死的屋子: she walked into the next piece of the floor — its wave
      if (this.waitZone >= 0 && this.phase === 'fight' && this.pieces.zoneAt(this.hero.pos.x, this.hero.pos.z) === this.waitZone) { this.waitZone = -1; after(0.35, () => { if (this.phase === 'fight') this.spawnWave(); }); }
    }
    // a rainy or stormy room: lightning lights everything for a beat, the thunder a moment later
    tickSkyFlash(rdt);
    if ((this.spec?.weather === 'rain' || this.spec?.weather === 'storm') && (this.phase as string) !== 'opening') {
      const storm = this.spec.weather === 'storm';
      this.lightningT -= rdt;
      if (this.lightningT <= 0) {
        this.lightningT = storm ? 3.8 + Math.random() * 4.5 : 7 + Math.random() * 9;
        flashSky(storm ? 1.25 : 1);
        after(0.14, () => flashSky(storm ? 0.9 : 0.7));
        const d = storm ? 0.2 + Math.random() * 0.45 : 0.35 + Math.random() * 0.8;
        after(d, () => cue('thunder', storm ? 0.52 : 0.32));
      }
    }
    if (this.leaves) {
      this.leaves.update(dt, this.cam.x, this.cam.z);
      blood.update(dt);
      if (h.st === 'dash' && !h.airborne) { const speed = Math.hypot(h.vel.x, h.vel.z) || 1; this.leaves.kick(h.pos.x, h.pos.z, 0.8, h.vel.x / speed, h.vel.z / speed, 3.4); }
      // the guiding wind: every few seconds a gust from the hero's feet toward each open gate (11-18 屋子形态: when a walled-off block
      // or a pit stands between, toward the way round instead — the leaves show which way to go)
      if (this.phase === 'doors' && this.gates) { this.gustT -= dt; if (this.gustT <= 0) { this.gustT = 3.2; for (const t of this.gates.targets()) { const wd = this.grid?.way(h.pos.x, h.pos.z, t.x, t.z, 0.4); if (wd) this.leaves.gust(h.pos.x, h.pos.z, h.pos.x + wd[0] * 5, h.pos.z + wd[1] * 5); else this.leaves.gust(h.pos.x, h.pos.z, t.x, t.z); } cue('exitChime', 0.25); } }
    }
    // copper coins fly in; act-136 Scheme A stations (clear overhead iron-wood price plaques + J interact + merchant overview)
    { const got = this.coinsFx.update(dt, h.pos); if (got) { this.coins += got; cue('coin', 0.3); this.feed.push('coins', n => msg`铜钱 +${n}`, got); } const prof = profile(); this.hud.coins = this.coins; this.hud.iron = prof.iron; this.hud.herb = prof.herb; }
    const worldUiClear = !this.cards.on && !this.pause.on && !this.dialogue.on && !combatNow;
    const minPlateY = this.banner.bottomY > 0 ? this.banner.bottomY + 8 : 10;
    this.L.text.hide('act.station.hint');
    if (this.stations && this.phase === 'doors' && worldUiClear) {
      const moving = Math.hypot(h.vel.x, h.vel.z) > 0.8;
      const canPay = (st: Station) => st.price <= this.coins && (!st.id.endsWith('sharpen') || this.sharpenable().length > 0);
      this.stations.update(dt, h.pos, moving, canPay);
      this.stations.setPurse(this.coins);
      let ns = this.stations.near(h.pos);
      const nearMerch = !ns && this.stations.nearMerchant(h.pos);
      const rd = this.roadDuwu;
      const rdAvail = !!rd && !rd.talked && !rd.talking;
      const rdDist = rdAvail ? Math.hypot(rd.pos.x - h.pos.x, rd.pos.z - h.pos.z) : 99;
      const nsDist = ns ? Math.hypot(ns.at.x - h.pos.x, ns.at.z - h.pos.z) : 99;
      const nearRd = !nearMerch && rdAvail && rdDist < 2.25 && rdDist < nsDist;
      if (nearRd) ns = null;
      this.stationNear = ns;
      this.merchantNear = nearMerch;
      this.roadDuwuNear = nearRd;
      if (rd) {
        const wantYaw = Math.atan2(h.pos.x - rd.pos.x, h.pos.z - rd.pos.z);
        let dy = wantYaw - rd.actor.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        rd.actor.yaw += dy * Math.min(1, dt * 4);
        if (rd.exclaim) {
          rd.exclaim.visible = rdAvail;
          if (rdAvail) {
            const pulse = 0.5 + 0.5 * Math.sin(clock.rtime * 4.4);
            rd.exclaim.position.set(rd.pos.x, 2.25 + 0.06 * pulse, rd.pos.z);
            rd.exclaim.rotation.y = clock.rtime * 1.4;
          }
        }
      }
      // act-176: 走近任意摊位、行商或杜五时隐去其余空闲摊签；漫步时按距离排序并做屏幕防重叠剔除
      const stPlaced: Array<{ x: number; y: number }> = [];
      const stKk = Math.max(0.75, Math.min(2.2, Math.min(this.L.w / 1280, this.L.h / 720)));
      const stList = [...this.stations.list].sort((a, b) =>
        Math.hypot(a.at.x - h.pos.x, a.at.z - h.pos.z) - Math.hypot(b.at.x - h.pos.x, b.at.z - h.pos.z)
      );
      for (const st of stList) {
        if (st.done || st === ns || !!ns || nearMerch || nearRd) {
          this.worldPlates.hide('st.tag.' + st.id);
          continue;
        }
        const pt = worldToUi(V3(st.at.x, 1.9, st.at.z));
        if (pt.z >= 1 || stPlaced.length >= 4 || stPlaced.some(p => Math.abs(pt.x - p.x) < 104 * stKk && Math.abs(pt.y - p.y) < 38 * stKk)) {
          this.worldPlates.hide('st.tag.' + st.id);
          continue;
        }
        const poor = st.price > this.coins;
        this.worldPlates.setTag('st.tag.' + st.id, {
          text: st.label, price: st.price, poor, icon: st.icon,
          color: poor ? '#ffb4a4' : '#f4ecd8', accent: poor ? '#b83c32' : '#c8984e',
          x: pt.x, y: pt.y, minY: minPlateY, visible: true,
        });
        stPlaced.push({ x: pt.x, y: pt.y });
      }
      if (rdAvail && !ns && !nearMerch && !nearRd && rdDist < 8.5) {
        const dp = rd.actor.head();
        const pt = worldToUi(V3(dp.x, dp.y + 0.52, dp.z));
        if (pt.z < 1 && !stPlaced.some(p => Math.abs(pt.x - p.x) < 104 * stKk && Math.abs(pt.y - p.y) < 38 * stKk)) {
          this.worldPlates.setTag('st.duwu.tag', {
            text: rd.ri === 0 ? '杜五 · 热汤' : '杜五 · 胡饼', icon: 'talk',
            color: '#ffe29c', accent: '#d89a44',
            x: pt.x, y: pt.y, minY: minPlateY, visible: true,
          });
        } else {
          this.worldPlates.hide('st.duwu.tag');
        }
      } else {
        this.worldPlates.hide('st.duwu.tag');
      }
      if (ns) {
        const pt = worldToUi(V3(ns.at.x, 2.2, ns.at.z));
        const noSharp = ns.id.endsWith('sharpen') && !this.sharpenable().length;
        const action = noSharp ? '暂无可升阶秘传' : ns.poor ? '铜钱不足' : ns.id.startsWith('buy_') ? '购买' : ns.id === 'scroll' ? '研读' : '择取';
        const acc = ns.id.startsWith('rest_') ? '#ff9e4a' : ns.id === 'scroll' ? '#88e8c0' : '#e0b058';
        this.worldPlates.setInteract('st.active', {
          title: ns.label, sub: ns.desc, price: ns.price, poor: ns.poor, disabled: noSharp,
          action, icon: ns.icon, accent: acc, x: pt.x, y: pt.y, minY: minPlateY, visible: pt.z < 1,
        });
        this.worldPlates.hide('st.merchant');
        this.worldPlates.hide('st.duwu');
      } else {
        this.worldPlates.hide('st.active');
        if (nearMerch && this.stations.merchant) {
          const mp = this.stations.merchant.head();
          const pt = worldToUi(V3(mp.x, mp.y + 0.65, mp.z));
          this.worldPlates.setInteract('st.merchant', {
            title: '行商', sub: '四摊百货 · 一览选购', action: '看货', icon: 'coin',
            accent: '#ffd27a', x: pt.x, y: pt.y, minY: minPlateY, visible: pt.z < 1,
          });
          this.worldPlates.hide('st.duwu');
        } else if (nearRd && rd) {
          const dp = rd.actor.head();
          const pt = worldToUi(V3(dp.x, dp.y + 0.65, dp.z));
          this.worldPlates.setInteract('st.duwu', {
            title: '杜五', sub: rd.ri === 0 ? '热汤回血 · 另赠 25 铜钱' : '热胡饼回血 · 杀气 +1',
            action: '叙旧', icon: 'talk',
            accent: '#ffd27a', x: pt.x, y: pt.y, minY: minPlateY, visible: pt.z < 1,
          });
          this.worldPlates.hide('st.merchant');
        } else {
          this.worldPlates.hide('st.merchant');
          this.worldPlates.hide('st.duwu');
        }
      }
    } else {
      this.stationNear = null;
      this.merchantNear = false;
      this.roadDuwuNear = false;
      if (this.roadDuwu?.exclaim) this.roadDuwu.exclaim.visible = false;
      this.worldPlates.hidePrefix('st.');
    }
    // act-136: Occluded-treasure full-res UI marker badges (always clear stale indices from prior rooms first!)
    this.worldPlates.hidePrefix('tr.');
    if (this.pieces && worldUiClear) {
      this.pieces.rewards.forEach((r, idx) => {
        if (r.taken) return;
        const pt = worldToUi(V3(r.x, r.tier === 'mythic' ? 1.85 : 1.65, r.z));
        this.worldPlates.setTag('tr.' + idx, {
          text: r.tier === 'mythic' ? '传世秘藏' : '秘藏',
          icon: r.tier === 'mythic' ? 'mythic' : 'chest',
          color: r.tier === 'mythic' ? '#ffcf88' : '#ffe890',
          accent: r.tier === 'mythic' ? '#ff6e30' : '#d8a64e',
          x: pt.x, y: pt.y, minY: minPlateY, visible: pt.z < 1,
        });
      });
    }
    // doors: the boards rise + wuxia-flavored title + plain-language payoff subtitle cleanly above open exit gates
    this.worldPlates.hidePrefix('door.');
    if (this.phase === 'doors') {
      const archPlain = (a: Archetype) => (
        a === 'blood' ? '流血/吸血类' :
        a === 'poise' ? '破盾/重砍类' :
        a === 'shadow' ? '多镖/定身类' :
        '闪避/空战类'
      );
      this.doors.forEach((d, i) => {
        d.lift = Math.min(1, d.lift + dt * 2.2); d.g.position.y = -2.4 * (1 - d.lift) ** 2;
        const plan = this.nextRooms[i];
        if (worldUiClear && plan && d.lift > 0.35) {
          const info = roomInfo(plan.type, plan.region ?? this.region);
          const rw = plan.reward;
          const archKey = rw?.k === 'boon' ? rw.arch : undefined;
          const arch = archKey ? ARCH_INFO[archKey] : null;
          const ap = archKey ? archPlain(archKey) : '';
          // Top line keeps wuxia flavor; bottom line explains in plain 1-second Chinese what room & tangible reward await!
          let title = info.name;
          let sub = '';
          let ico: MiniIcon = 'door';
          let acc = '#b89460';
          if (plan.type === 'boss') {
            title = '关底首领'; sub = '击败本关首领，进入下一章'; ico = 'boss'; acc = '#e83c30';
          } else if (plan.type === 'elite') {
            title = arch ? msg`死士 · ${arch.name}珍绝` : '死士 · 珍绝秘传';
            sub = ap ? msg`精英强敌战 · 必出高阶${ap}技能三选一` : '精英强敌战 · 必出高阶技能三选一';
            ico = archKey ?? 'scroll'; acc = arch ? arch.col : '#e84838';
            if (rw?.k === 'up') { title = '死士 · 秘传升阶'; sub = '精英强敌战 · 胜后把已学技能升阶变强'; ico = 'scroll'; acc = '#ffe08a'; }
            else if (rw?.k === 'coins') { title = msg`死士 · 铜钱 +${rw.n}`; sub = '精英强敌战 · 赢取大量铜钱去商店买强化'; ico = 'coin'; acc = '#ffd258'; }
          } else if (plan.type === 'event') {
            title = info.name; sub = '完成试炼，获得强力常驻加成'; ico = 'star'; acc = '#f0bc48';
          } else if (plan.type === 'boon') {
            const isUp = this.scrollGives(plan.region ?? this.region) === 'up';
            title = isUp ? '遗卷 · 秘传升阶' : '稀世遗卷';
            sub = isUp ? '不用打怪 · 免费把已学技能升一阶' : '不用打怪 · 免费三选一高阶技能';
            ico = 'scroll'; acc = '#58d8a8';
          } else if (plan.type === 'shop') {
            title = '行商'; sub = '商店 · 花铜钱买新技能、升阶或回血'; ico = 'coin'; acc = '#f0b848';
          } else if (plan.type === 'rest') {
            title = '歇脚'; sub = '营火休整 · 免费选：回血 / 升级技能 / 加攻'; ico = 'fire'; acc = '#ff9848';
          } else if (rw?.k === 'boon') {
            title = arch ? msg`${arch.name}秘传` : '流派秘传';
            sub = ap ? msg`普通战斗 · 胜后选${ap}新技能` : '普通战斗 · 胜后三选一新技能';
            ico = archKey ?? 'scroll'; acc = arch ? arch.col : '#ffd27a';
          } else if (rw?.k === 'coins') {
            title = msg`铜钱 +${rw.n}`; sub = '普通战斗 · 胜后得铜钱，去商店买强化'; ico = 'coin'; acc = '#ffd258';
          } else if (rw?.k === 'maxHp') {
            title = msg`气血上限 +${rw.n}`; sub = '普通战斗 · 本局永久加血量上限并回血'; ico = 'heal'; acc = '#78f09c';
          } else if (rw?.k === 'meta') {
            title = msg`残铁+${rw.iron} 药引+${rw.herb}`; sub = '普通战斗 · 局外材料，回营地永久升刀加血'; ico = 'meta'; acc = '#c8a8ff';
          } else if (rw?.k === 'heal') {
            title = '回气疗伤'; sub = '普通战斗 · 胜后回复两成生命值'; ico = 'heal'; acc = '#68e498';
          } else if (rw?.k === 'manual') {
            title = '武器刀谱'; sub = '普通战斗 · 胜后解锁新的武器连招动作'; ico = 'blade'; acc = '#ffe488';
          }
          const pt = worldToUi(V3(d.g.position.x, d.g.position.y + 4.35, d.g.position.z));
          this.worldPlates.setTag('door.' + i, {
            text: title, sub, icon: ico, emblem: true, color: '#fff6da', accent: acc,
            x: pt.x, y: pt.y, minY: minPlateY, visible: pt.z < 1,
          });
        }
        if (this.phase !== 'doors') return;
        const p = h.pos, l = d.ex.lane, bk = d.ex.dir[1] < 0, out = bk ? p.z < PLAY.z0 - 1.2 : d.ex.dir[0] < 0 ? p.x < PLAY.x0 - 1.2 : p.x > PLAY.x1 + 1.2;
        if (this.gates?.onGlow(p, d.ex.id) || (out && p.x > l.x0 - 0.4 && p.x < l.x1 + 0.4 && p.z > l.z0 - (bk ? 6 : 0.4) && p.z < l.z1 + 0.4)) this.leave(i);
      });
    }
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
    // (11-20 用户：「镜头前移值有点过大，高速来回移动的时候会有点晕」: less lead, and the lead itself eases (≈0.45 s) — turning back
    //  and forth no longer swings the view across with every reversal)
    this.camLeadV.lerp(vel.multiplyScalar(TUNE.camLead), 1 - Math.exp(-2.2 * rdt));
    const lead = this.camLeadV, want = h.pos.clone().add(lead).add(this.frameLean);
    // enemies come from the back of the room: the view sits a little ahead of the hero
    // held inside the room: 2.7 m in from the side edges, 2 m from the back, 3.2 m from the front (on the 2x stage it roams much more)
    const nr = this.yard?.near ?? 0, xc = (PLAY.x0 + PLAY.x1) / 2, xr = (PLAY.x1 - PLAY.x0) / 2 - 2.7 + 1.0 * nr;
    const yardOut = (this.phase === 'yard' || (this.phase === 'leaving' && this.room < 0)) && h.pos.z > 6.2;
    want.z -= yardOut ? 0.0 : 0.9 * (1 - nr); want.x = Math.max(xc - xr, Math.min(xc + xr, want.x)); want.z = Math.max(PLAY.z0 + 2.0, Math.min(PLAY.z1 - (yardOut ? 0.6 : 3.2), want.z)); want.y = 0;
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
    { const ch = h.st === 'charge' ? h.charge : 0, dh = this.duel.hum; audio.hum(dh >= 0 ? dh : ch > 0 ? Math.min(1, 0.25 + 0.75 * ch) : 0, dh >= 0 ? 0 : ch >= 1 ? 1 : 0); this.dimTo(Math.max(ch > 0 ? 0.35 + 0.65 * ch : 0, this.tut.dim), rdt); }
    // (11-19 用户：「画面的颜色也没有变」: a lesson drains the colour out of the world, so it reads as time held)
    if (this.tut.k > 0.003) { const tk = this.tut.k; GRADE.desat = Math.max(GRADE.desat, 0.78 * tk); if (this.vigBase >= 0) GRADE.vig = Math.max(GRADE.vig, this.vigBase + 0.6 * tk); }
    this.tutCam += (this.tut.k - this.tutCam) * Math.min(1, rdt * 5);
    this.flashStep(rdt);
    this.hud.btns.attack.charge = ch;
    const nowCue = h.st === 'charge' && (this.threats(TUNE.iaiWin).foes.length > 0 || this.threats(TUNE.iaiWin).arrows.length > 0);
    const ab = this.hud.btns.attack as { now?: boolean }; ab.now = nowCue;
    if (nowCue && this.ring.visible) { const m = this.ring.material as THREE.MeshBasicMaterial; m.color.setHex(0xffffff); m.opacity = 0.95; }
    // the counter is waiting: gold sparks off the point, the cut button's rim lit
    this.dodgeCd -= rdt; this.hud.btns.attack.hot = h.counterT > 0;
    this.tut.post(h, this.hud.btns as never, n => this.hud.btnKick(n, 0.6));
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
    this.syncHeroHat();
    this.fullAuraStep(rdt, h);
    if (h.qiDenied) { h.qiDenied = false; this.hud.denyAttack(); }
    // Cinema-grade edge-hugging arterial crimson low-HP heartbeat vignette (GRADE.bloodVig)
    const hpFrac = h.hp / Math.max(1, h.maxHp);
    const lowFight = this.phase === 'fight' && h.alive && hpFrac <= 0.35 && !this.cards.on && !this.pause.on;
    const lowDoors = this.phase === 'doors' && h.alive && hpFrac <= 0.25 && !this.cards.on && !this.pause.on;
    if (lowFight || lowDoors) {
      const urg = Math.max(0, Math.min(1, (0.35 - hpFrac) / 0.25));
      const sev = (lowFight ? 0.72 + 0.38 * urg : 0.48 + 0.24 * urg);
      const hz = 1.0 + 0.38 * urg;
      if (lowFight) {
        this.lowBeatT -= rdt;
        if (this.lowBeatT <= 0) { this.lowBeatT = 1 / hz; cue('land', 0.24 + 0.12 * urg); }
      }
      const ph = (clock.rtime * hz) % 1;
      const beat = Math.min(1, Math.exp(-Math.pow((ph - 0.14) / 0.085, 2)) + 0.64 * Math.exp(-Math.pow((ph - 0.33) / 0.095, 2)));
      const wantVig = (0.44 + 0.68 * beat) * sev;
      this.lowVigK += (wantVig - this.lowVigK) * Math.min(1, rdt * 10);
    } else {
      this.lowBeatT = 0;
      this.lowVigK += (0 - this.lowVigK) * Math.min(1, rdt * 7);
      if (this.lowVigK < 0.005) this.lowVigK = 0;
    }
    GRADE.bloodVig = this.lowVigK;
    this.L.text.hide('act.tip');
    if (h.exhaled) { h.exhaled = false; const at = h.a.head().add(h.a.fwd().multiplyScalar(0.25)); fxSmoke(at, 0xe6eef2, 12, { r: 0.12, spd: 1.7, up: 0.6, s: 0.24, life: 0.8 }); fxRing(h.pos.clone().setY(0.06), 0xb8a888, 0.9, { life: 0.3 } as never); }
    // the move links open right now, shown on the buttons (act-18): 追影 > 穿风斩 > 下劈 > 反击 on the cut button
    { const fighting = this.phase === 'fight' || this.phase === 'yard', chase = fighting && !!h.moves.chase && !!this.chaseTarget();
      const atk = (this.npcNear && !this.noTalk) || this.stationNear || this.merchantNear || this.roadDuwuNear ? 'talk' : !fighting ? null : chase ? 'chase' : h.canDashCut ? 'dcut' : h.canKeep ? 'keep' : h.canPause ? 'pause' : h.canAirCut ? 'acut' : (h.st === 'air' && h.airborne) ? 'plunge' : h.counterT > 0 ? 'counter' : null;
      // (11-18 四本新刀谱: 断云 on the cut button, 牵红 on the dart button, 踏顶 on the jump button, 掠地 on the dash button)
      const hints = { attack: atk, special: !fighting ? null : h.canBackDart ? 'back' : h.canReel ? 'reel' : h.canCutDart ? 'cdart' : null, jump: !fighting ? null : h.canLaunch ? 'launch' : h.canKick ? 'kick' : h.canStomp ? 'stomp' : h.canDoubleJump ? 'dbl' : null,
        dash: fighting && h.canSwoop ? 'swoop' : null } as const;
      if (!this.demo.on) { this.hud.setHints(hints); this.teach(hints); } }   // (the demonstration drives the buttons' links itself)
    this.hud.heroAt.copy(h.pos);
    // (11-18: a foe out of sight — a 死士 in the shadow, a 水鬼 under the water — shows no bar over its head)
    this.hud.update(rdt, this.inp, this.foes.some(f => f.mem.hidden && !isBoss(f)) ? this.foes.filter(f => !f.mem.hidden || isBoss(f)) : this.foes); this.cards.update(rdt); this.banner.update(rdt); this.feed.update(rdt, this.hud.feedAt, this.hud.k, this.hud.on);
    this.L.on = true;
  }
  // ------------------------------------------------------------ input
  private pointer(type: string, id: number, x: number, y: number, touch = false) {
    // (11-20 用户：「切场景过后上个场景的移动输入事件没结束，角色会自动跑」: a finger let go during a transition / a scene / a dialogue
    //  never reached the HUD, so the stick stayed held into the next room — free it on any intercepting branch, while letting normal
    //  HUD up events reach hud.pointer() first so portrait tap → onPause still fires!)
    const lift = () => { if (type === 'up' || type === 'cancel') this.hud.lift(id, this.inp); };
    if (this.adModal?.on) { lift(); this.adModal.pointer(type, x, y); return; }
    if (bladeBusy()) { lift(); return; }
    if (this.pause.on) { lift(); this.pause.pointer(type, x, y, touch); return; }
    if (this.phase === 'title') { lift(); if (touch && type === 'down') PAD.device = 'touch'; titlePointer(type, x, y); return; }
    if (this.timeline.on) { lift(); this.timeline.pointer(type); return; }
    if (this.dialogue.on) {
      lift();
      if (touch && type === 'down') PAD.device = 'touch';
      if (type === 'down') { this.dialogue.advance(); this.dialogue.holdSkip(true); }
      else if (type === 'up' || type === 'cancel') this.dialogue.holdSkip(false);
      return;
    }
    if (this.cards.on) { lift(); if (touch && type === 'down') PAD.device = 'touch'; this.cards.pointer(type, x, y); return; }
    // the demonstration: a tap anywhere skips it
    if (this.demo.on) { lift(); return; }   // (11-19: the demonstration plays to the end — no skipping)
    if (!this.hud.on) { lift(); return; }
    this.hud.pointer(type, id, x, y, this.inp, touch);
  }
  /** the UI's skin: 漆器 → 竹简 → 铁器 (U key, the tuning panel, __dh.skin(id)) */
  cycleSkin(to?: SkinId) {
    const next = to ?? SKINS[(SKINS.indexOf(SKIN.id) + 1) % SKINS.length]; setSkin(next);
    this.hud.reskin(); this.banner.dispose(); this.banner = new SkinBanner(this.L, next, () => this.hud.bossOn);
    this.banner.show(SKIN_NAME[next], '界面风格 · U 键或调参面板切换', 1.4);
  }
  private key(e: KeyboardEvent) {
    if (this.adModal?.on) { this.adModal.key(e); return; }
    if (bladeBusy()) return;
    if (this.demo.on && !this.pause.on) return;   // (11-19: the demonstration plays to the end)
    if (this.timeline.on && e.key === 'Escape') { e.preventDefault(); this.timeline.key(true); return; }
    if (e.key === 'Escape' && !e.repeat && this.canPause()) { e.preventDefault(); this.pauseGame(); e.stopImmediatePropagation(); return; }   // (the menu must not take the same Esc as its 返回)
    if (e.key === 'Tab' && !e.repeat && !this.dialogue.on && !this.cards.on && this.canPause() && this.room >= -1) { e.preventDefault(); this.openOwnedQuick(); e.stopImmediatePropagation(); return; }
    if (this.dialogue.on) {
      if (e.key === 'Escape') { e.preventDefault(); this.dialogue.holdSkip(true); return; }
      if (e.key === 'Tab' && !e.repeat) {
        e.preventDefault();
        const on = this.dialogue.toggleAuto();
        this.banner.show('自动对话', on ? '已开启' : '已关闭', 1.1);
        return;
      }
      if (!e.repeat && ['Enter', ' ', 'j', 'J'].includes(e.key)) { e.preventDefault(); this.dialogue.advance(); if (!this.dialogue.on) this.inp.latch(true); }
      return;
    }
    if (!this.cards.on) return;
    if ((e.key === 'Escape' || e.key === 'Backspace') && !e.repeat && this.cards.leave()) { e.preventDefault(); this.inp.latch(true); return; }   // (11-19: a shop page — Esc leaves)
    const k = ({ arrowleft: 'left', a: 'left', arrowup: 'up', w: 'up', arrowright: 'right', d: 'right', arrowdown: 'down', s: 'down', enter: 'ok', ' ': 'ok', j: 'ok', q: 'alt', tab: 'alt', e: 'tabNext' } as const)[e.key.toLowerCase() as 'a'];
    if (k && !e.repeat) { e.preventDefault(); this.cards.key(k); if (!this.cards.on) this.inp.latch(true); }
  }
  private keyUp(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      this.timeline.key(false);
      this.dialogue.holdSkip(false);
    }
  }
  // ------------------------------------------------------------ the pad on the screens that are menus; the pause
  /** the pad on the cards, the conversations, the cutscenes, the opening; Start pauses (act-30 之后) */
  private padScreens(rdt: number) {
    const n = padNav.poll(rdt);
    if (this.phase === 'opening') { if (n.any) openingPadTap(); return; }
    if (this.phase === 'title') return;   // title.ts reads the pad itself
    // a cutscene: B held = the long press that skips (the ring at the bottom right fills)
    if (this.timeline.on) { if (n.back) { this.padSkip = true; this.timeline.key(true); } else if (this.padSkip && !n.backHeld) { this.padSkip = false; this.timeline.key(false); } }
    else if (this.dialogue.on) {
      if (n.back) { this.padSkip = true; this.dialogue.holdSkip(true); }
      else if (this.padSkip && !n.backHeld) { this.padSkip = false; this.dialogue.holdSkip(false); }
    } else this.padSkip = false;
    if (this.dialogue.on) { if (n.ok || n.x) this.dialogue.advance(); return; }
    if (this.cards.on) {
      if (n.left) this.cards.key('left');
      else if (n.right) this.cards.key('right');
      else if (n.up) this.cards.key('up');
      else if (n.down) this.cards.key('down');
      else if (n.ok) this.cards.key('ok');
      else if (n.y) this.cards.key('alt');
      else if (n.back) this.cards.leave();
      return;
    }
    if (n.start && this.canPause()) this.pauseGame();
  }
  /** the world can stand still here: walking about or fighting (not the start screen, a cutscene, a conversation, the cards, a wipe) */
  canPause() {
    return !this.adModal?.on && !this.pause.on && !this.labOn && !this.cards.on && !this.ultOn && !this.duel.locks && !this.dialogue.on && !this.timeline.on && (['yard', 'intro', 'fight', 'doors'] as Phase[]).includes(this.phase);
  }
  pauseGame() {
    if (!this.canPause() || this.botOn) return;
    this.pauseHud = this.hud.on; this.hud.on = false; this.hud.update(0, this.inp, []); this.aimLine.visible = false;
    this.banner.hide(); this.hideHideoutLabels(); this.hideWorldPlates();
    this.pause.open('main');
  }
  /** act-146 / act-151: one-key [Tab] or top-left「招式谱」plaque opens the unified 招式谱 + live MoveStage inspector */
  openOwnedQuick() {
    if (!this.canPause() || this.botOn) return;
    this.pauseHud = this.hud.on; this.hud.on = false; this.hud.update(0, this.inp, []); this.aimLine.visible = false;
    this.banner.hide(); this.hideHideoutLabels(); this.hideWorldPlates();
    this.pause.open('build', { quickClose: true });
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
    this.cancelQte(); GRADE.bloodVig = 0;
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
