// 动作原型（docs: CLAUDE.md「动作原型」、docs/act/DESIGN.md）：哈迪斯式的一间间屋子。每间屋 = 一张拼装的日本场景（asm），战斗区就是屋子；
// 敌人分两波从边上出来；清场 → 三选一秘传 → 屋子边上的路口立起高札（写着下一间的地名和清完给什么）→ 自己走进路口 → 一丛竹子
// （或一根木柱）从镜头前扫过，换到下一间。三间屋，第三间是山贼头目。
// 打开游戏先到练武场（yard.ts：木人桩、召唤石板、换装木台），走进后面的「出发」路口开始一局；死了或打完回练武场。
// 砍飞的箭：方向在出刀朝向左右 75° 里随机、附近有敌人就偏过去；砍中那一下顿帧 + 闪光 + 短慢放（用户：「这种属于高光操作，应该要有顿帧」）。
import * as THREE from 'three';
import { V3, onUpdate, R, scene, warm, frames } from '../engine/world';
import { hitstop, shake, slowmo, after, clock, FX, waitReal, PAUSE } from '../engine/clock';
import { shot } from '../director';
import { fxImpact, fxSparks, fxSmoke, fxRing, trailSeg } from '../fx/fx';
import { fxAfterimage } from '../fx/skillFx';
import { popPix } from '../v2/pix';
import { playDeath } from '../v2/death';
import { UiLayer } from '../ui3d/layer';
import { Overlay } from '../v2/overlay';
import { SkinBanner, SKIN, SKINS, SKIN_NAME, setSkin, type SkinId } from './skin';
import { showStage, prepareStage, followShadow, flashSky, tickSkyFlash, type Stage, type PreparedStage } from '../scenes/stage';
import { PLAY, SZ, setStage, STAGE_BIG } from '../scenes/props';
import { addLocales, REGISTRY, LOCALES } from '../asm/registry';
import { NINJA_LOCALES } from '../asm/ninja';
import { HANMO_LOCALES } from '../asm/hanmo';
import { HANSHAN_LOCALES } from '../asm/hanshan';
import './hanshan_people';   // act-37: 寒山坞 cold open — 文皎 at eleven, the two torch-bearer looks, 杜五's cart (ROSTER)
import { assemble, mirrorLayout, stageLayout } from '../asm/assemble';
import { arenaPlan, type ArenaPlan } from '../asm/arena';
import { Solids, SLAM, slamSpeed, type Push } from './solids';
import { Breakables } from './breakables';
import { Gates } from './gates';
import { ALL_MOVES, drawManuals, manualCard } from './manuals';
import { Dialogue, type Line } from './dialogue';
import { Stele } from './stele';
import { openLab } from './lab';
import { IronHp, HP_FACE } from './ironUi';
import { ROSTER } from '../bestiary/models';
import { CODE_BUILD } from '../bestiary/voxEdit';
import { rackBlades, hideoutScene, HIDEOUT, HIDEOUT_PEOPLE } from './hideout';
import { Timeline } from './timeline';
import { openingShots, bossIntroShots, type CineHost } from './cutscenes';
import { WAKE_DUWU, WAKE_SUNAO, CHULEI_BEFORE, CHULEI_AFTER, deathLine, PRO_CHULEI, PRO_FALL, PRO_DAWN, PRO_WAKE, PRO_CAPTIONS } from './scripts';
import { fallShots, snowShots, dawnShots, loadShots, lieDown, brazier, type PrologueHost } from './prologue';
import { coldOpenShots, BlindPOV } from './coldopen';
import { newGame, profile, save as saveProfile, seeOnce, hasSave } from './profile';
import { runMods, bank, META, level, nextCost, buy, type RunMods } from './meta';
import { NPC_LINES, UP_LINES, POOR_LINES, HAUL, MEALS, MEAL_LINES, STELE_LINES } from './hideoutLines';
import { Leaves } from './leaves';
import type { BTarget, BEvent, BDamage } from './breakLogic';
import type { Solid } from './solids';
/** the floor's edge as a solid (the clamp's push): a slam surface */
const WALL_SOLID: Solid = { id: 0, kind: 'wall', shape: 'box', x: 0, z: 0, hx: 0, hz: 0, r: 0, on: true, slam: true };
import { pickSpec } from '../asm/pick';
import { exitInfo, withExits, type ExitId, type ExitInfo } from '../asm/exits';
import type { Layout, Spec, Report } from '../asm/types';
import { wipeTransit, WIPE } from '../scenes/transWipe';
import type { RouteOpt } from '../../core/v2/ronin/chapter';
import { cue } from '../../audio/cues';
import { blood } from './blood';
import { audio } from '../../audio/audio';
import type { Platform } from '../../platform/index';
import { dh } from '../../debug/dh';
import { Input } from './input';
import { ActHud } from './hud';
import { CardPick3D as CardPick } from './cards3d';   // act-36: the pick cards as iron boards
import { fillVals } from './cards';
import { Hero, QI_LINK, type HeroWorld } from './hero';
/** 11-17: the 刀谱 links the first few openings of which are slowed down to teach them (二段跳 is no link; 穿风斩 / 劈山 / 回锋斩 are known from the start) */
const TEACH = ['chase', 'back', 'cdart', 'launch', 'kick', 'keep', 'pause'];
import { interruptFoe } from './enemy';
import { inside } from './tele';
import { spawnFoe, updateFoe, damageFoe, type Foe, type FoeWorld, type EKind, Arrow } from './enemy';
import { EDEFS, isBoss, lowAttack, trimShadows, dropTeles } from './enemy';   // wp/foes: the boss bar / banner / death and the bot's jump read these
import { BOONS, applyBoon, drawBoons, upgradeBoon, returnCard, TIER_NAMES, newPerks, tierOf, v, v2, isBladeHit, type Perks, type Boon, type BoonPick } from './boons';
import { TUNE } from './tune';
import { installActTune } from './tunePanel';
import { BODY_FONT, BODY_FONT_NAME, setBodyFont, type BodyFont } from '../ui3d/bodyFont';
import { HEROES, RACK, motionOf } from './ninjaAct';
import { Yard, makeSign, SPAWN_AT } from './yard';
import type { ModelDef } from '../bestiary/models';
import { dustBlocks, spawnClone, smokeBurst, cut as cloneCut } from '../kyoto/ninja_fx';
import { Dart, BladeWave } from './missiles';
import { RUN_ROOMS, ROOM_INFO, firstRoom, roomOf, doorsFrom, kindOr, isBossKind, type RoomPlan, type RoomType } from './run';
import { Stations, type Station } from './stations';
import { Coins } from './coins';
import { runBoard } from './runBoard';
import { HitArcs } from './hitArc';
import { playOpening, OPENING_SPEC } from './opening';
import { wantOpening } from './openingFlag';
import { playTitle, titlePointer } from './title';
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

addLocales(NINJA_LOCALES); addLocales(HANMO_LOCALES); addLocales(HANSHAN_LOCALES);

/** prices at the 行商 (copper coins) */
const PRICES = { boon: 60, heal: 30, sharpen: 50 };
/** a soft dark spot for under the feet: a radial fade drawn once, shared by every spot */
let SHADOW_TEX: THREE.Texture | null = null;
function contactShadow() {
  if (!SHADOW_TEX && typeof document !== 'undefined') {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(32, 32, 4, 32, 32, 31); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); SHADOW_TEX = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0a0608, map: SHADOW_TEX, transparent: true, opacity: 0.72, depthWrite: false }));
  m.renderOrder = 2; return m;
}
type Phase = 'intro' | 'fight' | 'pick' | 'doors' | 'leaving' | 'dead' | 'end' | 'yard' | 'opening' | 'cine' | 'talk' | 'title';
/** the costume the player last wore (kept in the browser; the first time: the 斗笠 swordsman) */
/** the heroine's look by default (user 11-17: 「默认角色用这个白发女」, her MagicaVoxel-edited model) */
const DEFAULT_HERO = 'fine_white';   // act-22 (user: 「都换成细格子吧」): the 3.5 cm white-haired heroine
function savedHero(): ModelDef {
  // (act.hero6 since act-22: the default became the 3.5 cm white-haired heroine; a look remembered under the old keys no longer overrides it)
  let id = ''; try { id = localStorage.getItem('act.hero6') ?? ''; } catch { /* storage blocked */ }
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
interface RoomIn { isYard: boolean; room: number; recent: Spec[]; locale: string; plan: RoomPlan | null; nextRooms: RoomPlan[]; viewSpec: Partial<Spec> | null; forceSpec: Partial<Spec> | null; noArena: boolean }
/** a room's place, built (off the live scene) and ready to put up */
interface Room { spec: Spec; big: boolean; layout: Layout; arena: ArenaPlan | null; report: Report | null; prep: PreparedStage }
/** the prologue's first room (act-29) and its one way on */
const PRO_ROOM = { locale: 'hj_village', waves: [['hj_mob', 'hj_mob'], ['hj_blade', 'hj_mob', 'hj_mob']] as EKind[][], spec: { season: 'winter', weather: 'snow', time: 'night' } as Partial<Spec> };
const PRO_BOSS: RoomPlan = { type: 'boss', locale: 'hj_temple', reward: null, waves: [['hj_boss']] };
/** act-37 the cold open's place: 寒山坞 on that snowy night (its own layout and light) */
const COLD_ROOM: RoomIn = { isYard: false, room: 0, recent: [], locale: 'hs_forge', plan: null, nextRooms: [], forceSpec: null, noArena: true,
  viewSpec: { locale: 'hs_forge', layout: 'hs_valley', mirror: false, landmark: null, season: 'winter', time: 'night', weather: 'snow', seed: 7, exits: [] } };
/** pick the spec, lay out the floor and the arena, assemble and build the place — touching nothing live except the stage size
 *  (setStage, which the caller sets again) */
function prepRoom(o: RoomIn): Room {
  const { isYard } = o;
  const seed = (Date.now() % 100000) + o.room * 977;
  const base = pickSpec(seed, Object.values(REGISTRY.locales), REGISTRY.layouts, o.recent, { season: 'autumn', locale: o.locale });
  const spec: Spec = isYard ? { ...base, time: 'dusk', weather: 'clear', exits: ['back'] }
    : { ...base, time: o.room === 0 ? 'dusk' : base.time, weather: o.plan?.type === 'boss' ? 'clear' : base.weather, exits: o.nextRooms.length > 1 ? ['left', 'right'] : o.nextRooms.length ? ['back'] : [] };
  if (o.viewSpec) Object.assign(spec, { exits: [] }, o.viewSpec);
  if (o.forceSpec) Object.assign(spec, o.forceSpec);   // act-29: the prologue's snowy night
  // act-19: the 黄巾 rooms stand on the 2x stage; the yard keeps the old one
  const big = !isYard && spec.locale.startsWith('hj_'); setStage(big);
  const lb = REGISTRY.layouts[spec.layout] ?? Object.values(LOCALES).flatMap(l => l.extraLayouts ?? []).find(l => l.id === spec.layout)!;
  const layout = withExits(spec.mirror ? mirrorLayout(stageLayout(lb)) : stageLayout(lb), spec.exits ?? []);
  const ptype = o.plan?.type ?? 'fight', calm = ptype === 'shop' || ptype === 'rest' || ptype === 'boon';
  const arena = big && !o.noArena ? arenaPlan(layout, (spec.exits ?? []) as ExitId[], spec.seed, spec.locale, calm ? 'calm' : ptype === 'boss' ? 'boss' : 'fight') : null;
  spec.arena = arena ?? undefined;
  if (isYard) return { spec, big, layout, arena, report: null, prep: prepareStage(hideoutScene({ time: 'dusk', weather: 'clear' }), { combat: true }) };
  const { def, report } = assemble(spec, REGISTRY);
  return { spec, big, layout, arena, report, prep: prepareStage({ ...def, build(c) { try { def.build(c); } catch (e) { console.error('[act] assembly failed', e); } } }, { combat: true }) };
}

export class ActShow {
  L = new UiLayer(); ov = new Overlay(); inp = new Input(); hud: ActHud; cards: CardPick; banner: SkinBanner;
  stage: Stage | null = null; hero!: Hero; foes: Foe[] = []; arrows: Arrow[] = []; waves: BladeWave[] = []; darts: Dart[] = []; /** darts thrown so far (tests) */ dartsThrown = 0;
  room = 0; wave = 0; phase: Phase = 'intro'; perks: Perks = newPerks();
  /** act-17: this room's plan, the roads out of it, the kinds of room seen this run, the purse */
  private plan: RoomPlan | null = null; private nextRooms: RoomPlan[] = []; private visited: RoomType[] = []; coins = 0;
  /** act-19: the floor's cover and props (collision), the breakable props, the room's walls / gates / cover plan */
  private lightningT = 6;
  /** act-20 meta: what the hideout's upgrades give this run; the run's tally for the trip home */
  private mods: RunMods = { dmgMul: 1, dartBonus: 0, hpBonus: 0, deathDefy: 0, startIntent: 0, windupMul: 1, startManual: false };
  /** act-20 the hideout's people: where they stand, their bodies; the one in reach of a word */
  private npcs: Array<{ id: string; x: number; z: number; yaw: number; a: BattleActor; sh: THREE.Mesh }> = []; private npcNear: string | null = null;
  /** act-20 the stele of names in the hideout; talk is off while a scripted moment plays there */ private stele: Stele | null = null; private noTalk = false;
  private defy = 0; private wine = false; private eliteKills = 0; private bossKilled = false; private banked: { iron: number; herb: number } | null = null;
  /** a cutscene's place: the open land, no walls / gates / props */ private noArena = false;
  /** act-34: a room built ahead of time (prepRoom), waiting to be put up; buildRoom uses it when it is the room asked for */
  private pre: (Room & { locale: string }) | null = null;
  // ------------------------------------------------------------ act-20: story — portrait dialogue, timeline cutscenes, puppets
  dialogue: Dialogue; timeline: Timeline; pause!: PauseMenu; private pauseHud: boolean | null = null; private padSkip = false; private puppets: Foe[] = []; private wasPhase: Phase = 'yard'; private justDied = false;
  /** act-29 开篇 (方案 1): 1 = the snowy village (the first fight, alone), 2 = the snowy temple (褚雷, a fight she cannot win), 0 = off */
  prologue = 0; private forceSpec: Partial<Spec> | null = null; private proFightT = 0; private proFalling = false; private proPeople: BattleActor[] = [];
  private proHost: PrologueHost = {
    hero: { get a() { return SELF!.hero.a; }, get pos() { return SELF!.hero.pos; } } as PrologueHost['hero'],
    person: (id, x, z, yaw) => { const a = new BattleActor(id === 'duwu' ? HIDEOUT_PEOPLE.duwu : HIDEOUT_DONKEY); a.place(V3(x, 0, z), yaw); a.yaw = yaw; trimShadows(a.root, 4); this.proPeople.push(a); return a; },
    puppet: (kind, x, z, fx, fz) => this.cineHost.puppet(kind, x, z, fx, fz),
  };
  private cineHost: CineHost = {
    hero: { get a() { return SELF!.hero.a; }, get pos() { return SELF!.hero.pos; } } as CineHost['hero'],
    puppet: (kind, x, z, fx, fz) => { const f = spawnFoe(kind, V3(x, 0, z), V3(fx, 0, fz)); f.st = 'move'; this.puppets.push(f); return f; },
    clearPuppets: () => { for (const f of this.puppets) f.a.dispose(); this.puppets = []; },
  };
  /** portrait lines; the fight / the hideout wait (phase 'talk') and resume */
  async talk(lines: Line[], onLine?: (i: number, line: Line) => void) {
    if (!lines.length) return;
    const was = this.phase === 'talk' ? this.wasPhase : this.phase; this.wasPhase = was; this.phase = 'talk'; this.hud.on = false; this.banner.hide();
    await this.dialogue.play(lines, onLine);
    this.phase = was; this.hud.on = true;
  }
  /** a timeline cutscene; the HUD hides, gameplay waits (phase 'cine') */
  async cine(shots: Parameters<Timeline['play']>[0]) {
    const was = this.phase; this.phase = 'cine'; this.hud.on = false; this.banner.hide();
    const skipped = await this.timeline.play(shots);
    this.cineHost.clearPuppets();
    shot('act', () => this.camPose(), { cut: true, speed: 8 });
    this.phase = was; this.hud.on = true; return skipped;
  }
  /** 开始游戏: a fresh save, the opening cutscene on the burning field, then the hideout and her first waking */
  async startNewGame() {
    newGame();
    // a new game: 刘白 in her default look again, the white-haired one (the costume the browser remembered goes)
    { const d = HEROES.find(x => x.id === DEFAULT_HERO); if (d) { this.wearing = d; if (this.hud.flask instanceof IronHp) this.hud.flask.setFace(d.id); else HP_FACE.id = d.id; try { localStorage.setItem('act.hero6', d.id); } catch { /* storage blocked */ } } }
    // act-29 (用户：「方案1开做吧」): the night seven years before (once its place is built), then the prologue — alone in the snow
    const pov = await this.coldOpen();
    this.startPrologue();
    // (the village was built behind the dark; now the dark lifts on 「七年后」)
    if (pov) { await frames(3); pov.fill(0x000000, 0); after(1.6, () => pov.dispose(), { real: true }); }
  }
  /** act-37 the cold open: 寒山坞 that night (coldopen.ts) — on the place the title built while it loaded; it ends in the dark */
  private async coldOpen(): Promise<BlindPOV | null> {
    const ready = this.pre && this.pre.locale === 'hs_forge' ? this.pre : null; this.pre = null;
    let r: Room; try { r = ready ?? prepRoom(COLD_ROOM); } catch (e) { console.error('[act] cold open failed', e); return null; }
    for (const f of this.foes) f.a.dispose(); this.foes.length = 0;
    setStage(r.big); this.layout = r.layout; this.arena = null; this.spec = r.spec;
    this.stage = r.prep.attach(); this.hud.on = false;
    const pov = new BlindPOV(this.L), co = coldOpenShots({ root: this.stage.root, pov });
    void audio.playMusic('bgm_coldopen', 0.8, 18);   // (act-37: from 18 s in, so its louder middle lands on the flashbacks)
    await this.cine(co.shots);
    co.dispose(); pov.fill(0x000000, 1, true);
    await frames(2);   // the dark is on screen before the next place is built
    return pov;
  }
  /** the prologue's first room: the snowy village at night, a few sentries; then the temple (leave() moves prologue to 2) */
  startPrologue() {
    this.prologue = 1; this.proFalling = false; this.proFightT = 0;
    this.intent = 0; this.hud.intent = 0; this.perks = newPerks(); this.room = 0; this.kills = 0; this.recent = []; this.visited = []; this.coins = 0;
    this.mods = runMods(profile()); this.defy = 0; this.eliteKills = 0; this.bossKilled = false; this.wine = false;
    TUNE.heroHp = 100 + this.mods.hpBonus; TUNE.dartCharges = 3 + this.mods.dartBonus; TUNE.aggression = 0.85 / this.mods.windupMul;
    this.plan = { type: 'fight', locale: PRO_ROOM.locale, reward: null, waves: PRO_ROOM.waves };
    this.locale = PRO_ROOM.locale; this.forceSpec = { ...PRO_ROOM.spec };
    this.buildRoom(true);
    // 「七年后」 over the snowy village while she walks in from the front; then the first sentries
    const h = this.hero, p0 = h.pos.clone();
    void this.cine([
      // (act-37: the cold open's last card says 七年了 — the walk opens on the year and the place only)
      { dur: 3.4, ease: 'inOut', caption: { text: PRO_CAPTIONS[1], big: true, at: 0.5, hold: 2.2 }, from: { pos: [p0.x + 4, 16, p0.z + 14], look: [p0.x, 0, p0.z - 4], fov: 40 }, to: { pos: [p0.x + 3, 13, p0.z + 12], look: [p0.x, 0, p0.z - 4], fov: 40 } },
      { dur: 3.6, ease: 'inOut', from: { pos: [p0.x + 6, 4.5, p0.z + 7], look: [p0.x, 1, p0.z - 1], fov: 36 }, to: { pos: [p0.x + 5, 4.2, p0.z + 6], look: [p0.x, 1, p0.z - 2.5], fov: 36 },
        tick: (t, dt) => { const m = motionOf(h.a); h.pos.z = p0.z - Math.min(2.5, t * 0.8); h.a.yaw = Math.PI; m.run = t < 3.1 ? 0.3 : Math.max(0, m.run - dt * 4); m.phase += dt * 3; h.a.update(dt); } },
    ]).then(() => { if (this.phase === 'intro' && this.hero === h) { this.phase = 'fight'; this.spawnWave(); } });
  }
  /** the fight she cannot win: the blow, his word, the snow; dawn and the man with the donkey; the kiln */
  private async prologueFall() {
    if (this.proFalling || this.prologue !== 2) return; this.proFalling = true;
    this.musicHold = 'bgm_fall'; void audio.playMusic('bgm_fall', 0.8);   // (act-37: struck down → the camera rises → the dawn)
    const boss = this.foes.find(f => isBoss(f) && f.st !== 'dead') ?? null;
    this.hero.inv = 99;
    for (const f of this.foes) { dropTeles(f); f.attacking = false; f.lunge = null; }   // nothing left half-swung on the snow
    if (boss) { await this.cine(fallShots(this.proHost, boss)); await this.talk(PRO_FALL); this.phase = 'cine'; await this.cine(snowShots(this.proHost, boss)); }
    // dawn in the same yard: the snow has stopped, the dead lie where they fell
    const sp = this.spec, at = { x: this.hero.pos.x, z: this.hero.pos.z };
    await new Promise<void>(res => { void wipeTransit(() => {
      for (const f of this.foes) f.a.dispose(); this.foes.length = 0;
      this.noArena = true; this.viewSpec = { locale: 'hj_temple', season: 'winter', time: 'dawn', weather: 'clear', layout: sp?.layout ?? 'axis', mirror: sp?.mirror ?? false, seed: sp?.seed ?? 5, exits: [] };
      this.forceSpec = null; this.buildRoom(true); this.viewSpec = null; this.noArena = false;
      this.hero.pos.set(at.x, 0, at.z); this.hero.a.yaw = 0.4; lieDown(this.hero.a, 1); res();
    }); });
    const dead: Array<[EKind, number, number]> = [['hj_mob', at.x - 3.2, at.z + 2.6], ['hj_blade', at.x - 1.4, at.z + 3.6], ['hj_mob', at.x + 2.4, at.z - 1.8]];
    const who: { duwu: BattleActor | null; donkey: BattleActor | null } = { duwu: null, donkey: null };
    await this.cine(dawnShots(this.proHost, at, dead, who));
    await this.talk(PRO_DAWN);
    await this.cine(loadShots(this.proHost, who));
    for (const a of this.proPeople) a.dispose(); this.proPeople = [];
    this.prologue = 0; this.forceSpec = null;
    // (act-40 用户：「被救回去应该是先趟垫子上的啊，怎么是站着的」: she wakes lying on 孙媪's mat, and gets up at the line where she
    //  pushes herself up the wall; the kiln's own music for the scene — the hideout's comes after)
    await new Promise<void>(res => { void wipeTransit(() => {
      this.enterYard(); this.musicHold = 'bgm_kiln'; void audio.playMusic('bgm_kiln', 1.2);
      const h = this.hero; h.pos.set(HIDEOUT.spawn[0], 0, HIDEOUT.spawn[1]); h.a.yaw = -Math.PI / 2; lieDown(h.a, 1); res();
    }); });
    await new Promise(r => after(0.8, () => r(null)));
    seeOnce('wake1'); let up = false;
    const getUp = () => { if (up) return; up = true; let k = 1; const step = () => { k = Math.max(0, k - 1 / 36); lieDown(this.hero.a, k); if (k > 0) after(1 / 36, step); }; step(); };
    await this.talk(PRO_WAKE, (_i, l) => { if (l.who === 'act' && /撑起|站起|起身/.test(l.text)) getUp(); });
    getUp(); this.musicHold = null; this.music(); saveProfile();
  }
  /** the run's haul goes home (meta.ts bank: currencies, runs / wins / deaths), saved */
  private lastWon = false;
  private bankRun(won: boolean) { this.lastWon = won; this.banked = bank(profile(), { rooms: Math.max(0, this.room), elites: this.eliteKills, boss: this.bossKilled, won, kills: this.kills }); saveProfile(); }
  /** the hideout's people stand at their places (HIDEOUT anchors when the hideout scene is up; the yard's spots meanwhile) */
  private placeNpcs(spots: Array<{ id: keyof typeof HIDEOUT_PEOPLE; x: number; z: number; yaw: number }>) {
    this.clearNpcs();
    for (const sp of spots) {
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
    if (nn && !this.noTalk && this.phase !== 'talk' && this.phase !== 'cine' && !this.dialogue.on) { const p = worldToUi(V3(nn.x, (nn.a.height ?? 1.8) + 1.0, nn.z)); this.L.text.set('act.npc', { text: HIDEOUT_PEOPLE[nn.id as keyof typeof HIDEOUT_PEOPLE]?.name ?? '', x: p.x, y: p.y, bodyPx: Math.max(12, Math.round(15 * Math.min(1.2, this.L.h / 720))), color: '#ffe6b0', outline: '#140c0a', align: 'center' }); }
    else this.L.text.hide('act.npc');
  }
  /** a word with someone at the hideout; the smith and the healer then show their upgrades */
  private async npcTalk(id: string) {
    if (id === 'stele') { const pool = (this.stele?.count ?? 0) > 0 ? STELE_LINES.one : STELE_LINES.none; await this.talk([{ who: 'jiangjin', text: pool[Math.floor(Math.random() * pool.length)] }]); return; }
    if (id === 'duwu') { await this.mealMenu(); return; }
    const pool = NPC_LINES[id] ?? []; if (pool.length) await this.talk([{ who: id, text: pool[Math.floor(Math.random() * pool.length)] }]);
    if (id === 'fengtiebi' || id === 'sunao') await this.upgradeMenu(id === 'fengtiebi' ? 'forge' : 'medic');
  }
  /** 杜五 packs provisions for the next trip: one of three, free, kept in the save until the run starts */
  private async mealMenu() {
    const p = profile(), pick = (a: string[]) => a[Math.floor(Math.random() * a.length)];
    if (p.meal) { await this.talk([{ who: 'duwu', text: pick(MEAL_LINES.packed) }]); return; }
    await this.talk([{ who: 'duwu', text: pick(MEAL_LINES.offer) }]);
    const cards = MEALS.map(m => ({ boon: { id: 'meal_' + m.id, school: 'ms' as never, name: m.name, desc: [m.desc, ''], col: '#ffd27a', glyph: MEAL_GLYPH[m.id], tag: '' } as Boon, tier: 0 }));
    cards.push({ boon: { id: 'leave', school: 'ms' as never, name: '离开', desc: ['什么也不带', ''], col: '#f0e0b0', glyph: LEAVE, tag: '' } as Boon, tier: 0 });
    const was = this.phase; this.phase = 'pick'; this.hud.on = false;
    const i = await this.cards.open(cards); this.phase = was; this.hud.on = true;
    const m = MEALS[i]; if (!m) return;
    p.meal = m.id; saveProfile(); cue('coin', 0.6);
    await this.talk([{ who: 'duwu', text: MEAL_LINES.after[m.id] }]);
  }
  /** the upgrade list of the smith (百辟残铁) or the healer (沸血药引) as rows of cards; the last row leaves */
  private async upgradeMenu(who: 'forge' | 'medic') {
    const id = who === 'forge' ? 'fengtiebi' : 'sunao';
    const up = UP_LINES[id]; if (up?.length) await this.talk([{ who: id, text: up[Math.floor(Math.random() * up.length)] }]);
    for (;;) {
      const p = profile(), ups = META.filter(u => u.who === who), cur = who === 'forge' ? '残铁' : '药引', have = who === 'forge' ? p.iron : p.herb;
      const glyph = who === 'forge' ? ANVIL : NEEDLE;
      const cards = ups.map(u => { const lv = level(p, u.id), cost = nextCost(p, u.id);
        return { boon: { id: 'mu_' + u.id, school: (who === 'forge' ? 'fg' : 'md') as never, name: u.name, desc: [...u.desc], col: '#ffd27a', glyph, tag: cost == null ? `满 · ${lv}级` : `${cur} ${cost} · ${lv}级` } as Boon, tier: cost == null ? 2 : lv > 0 ? 1 : 0 }; });
      cards.push({ boon: { id: 'leave', school: 'ms' as never, name: '离开', desc: [`手上${cur} ${have}`, ''], col: '#f0e0b0', glyph: LEAVE, tag: '' } as Boon, tier: 0 });
      const was = this.phase; this.phase = 'pick'; this.hud.on = false;
      const i = await this.cards.open(cards); this.phase = was; this.hud.on = true;
      if (i >= ups.length) return;
      const u = ups[i];
      if (!buy(p, u.id)) { const poor = POOR_LINES[id]; if (poor) await this.talk([{ who: id, text: poor }]); return; }
      saveProfile(); cue('coin', 0.8); this.banner.show(u.name, `${level(p, u.id)} 级`, 1.0, '#ffd27a');
    }
  }
  /** 继续游戏: the hideout with the saved progress */
  continueGame() { profile(); this.enterYard(); }
  solids = new Solids(); props: Breakables | null = null; gates: Gates | null = null; leaves: Leaves | null = null; private gustT = 0; arena: ArenaPlan | null = null; private lastPush: Push | null = null; private slamAt = new WeakMap<Foe, number>();
  private coinsFx = new Coins(); private stations: Stations | null = null; private hitArcs = new HitArcs();
  /** __dh.scene: the spec overrides for a fight-less view of one place; the last assembler report */
  private viewSpec: Partial<Spec> | null = null; private lastReport: Report | null = null;
  private spec: Spec | null = null; private layout: Layout | null = null; private doors: Array<{ ex: ExitInfo; g: THREE.Group; lift: number }> = []; private locale = 'ninja_wilds';
  private cam = V3(0, 0, 0); private recent: Spec[] = [];
  private botWp = 0; private botTalkT = 0; botOn = false; kills = 0; log: string[] = []; private introT = 0; private audioOn = false; private hinted = false;
  /** the training yard (room −1) and the costume on the hero */
  yard: Yard | null = null; wearing: ModelDef = savedHero(); private lineupActors: BattleActor[] = [];
  private aimLine!: THREE.Mesh;
  private ring!: THREE.Mesh; private ringK = -1; private sparkT = 0; private shadows: THREE.Mesh[] = []; private exitSign: THREE.Group | null = null; private blob: THREE.Mesh;
  constructor(private platform: Platform) {
    SELF = this; this.dialogue = new Dialogue(this.L); this.timeline = new Timeline(this.L);
    HP_FACE.id = this.wearing.id;   // the HP medallion shows the look she wears
    this.hud = new ActHud(this.L); this.cards = new CardPick(this.L); this.banner = new SkinBanner(this.L, SKIN.id, () => this.hud.bossOn);
    platform.onPointer(ev => this.pointer(ev.type, (ev as { id?: number }).id ?? 0, ev.x, ev.y));
    platform.onResize(() => this.layout2());
    if (typeof window !== 'undefined') window.addEventListener('keydown', e => this.key(e));
    onUpdate((dt, rdt) => this.frame(dt, rdt));
    this.layout2();
    // the player's settings: the tuning panel shows the long labels, the pause menu's 设置 page the short ones (act-30 之后)
    const SET: Array<{ label: () => string; short: () => string; run: () => void }> = [
      { label: () => `界面风格：${SKIN_NAME[SKIN.id]}（点这里换）`, short: () => `界面：${SKIN_NAME[SKIN.id]}`, run: () => this.cycleSkin() },
      { label: () => `正文字体：${BODY_FONT_NAME[BODY_FONT.current]}`, short: () => `正文字体：${BODY_FONT_NAME[BODY_FONT.current]}`, run: () => { const order: BodyFont[] = ['wenkai', 'serif', 'sans', 'pixel']; setBodyFont(order[(order.indexOf(BODY_FONT.current) + 1) % order.length]); } },
      // act-15 用户：「我浏览器玩没有震动诶」 — a switch, a test, and what this device supports
      { label: () => `震动：${VIBE.on ? '开' : '关'}（${({ api: '这台设备支持', ios: `iPhone iOS ${iosMajor()}：系统触感，点屏幕时最灵`, 'ios-old': `iPhone iOS ${iosMajor() || '17 及以下'}：网页没法震，要 iOS 18`, none: '这个浏览器不支持' } as const)[vibeSupport()]}）`, short: () => `震动：${VIBE.on ? '开' : '关'}`, run: () => { VIBE.on = !VIBE.on; try { localStorage.setItem('ub.vibe', VIBE.on ? '1' : '0'); } catch { /* private mode */ } } },
      { label: () => '试一下震动', short: () => '试一下震动', run: () => { const was = VIBE.on; VIBE.on = true; this.platform.vibrate('heavy'); VIBE.on = was; } },
      // act-14 用户：「我要2x，然后调试面板给我一个切换这个的功能」 — 2x → 3x → off → 1x, remembered on this device
      // act-21: which title screen (five moods; the user picks on a phone too, where there are no number keys)
      { label: () => `开始画面：第 ${savedTitle()} 版（点这里换）`, short: () => `开始画面：第 ${savedTitle()} 版`, run: () => { const n = savedTitle() % TITLE_COUNT + 1; try { localStorage.setItem('ub.title', String(n)); } catch { /* storage blocked */ } if (this.phase === 'title') this.title(n); } },
      // act-20: her look (the story's heroine: the 斗笠 or the 白发 — the user's two picks); the hideout has no costume rack
      { label: () => `造型：${this.wearing.name}（点这里换）`, short: () => `造型：${this.wearing.name}`, run: () => { const ids = ['fine_white', 'fine_hat'], n = HEROES.find(d => d.id === ids[(ids.indexOf(this.wearing.id) + 1) % ids.length]); if (n) this.wear(n); } },
      { label: () => `像素：${PX.on ? PX.size + 'x' : '关'}（点这里换）`, short: () => `像素：${PX.on ? PX.size + 'x' : '关'}`, run: () => { const order = ['2', '3', 'off', '1'], cur = PX.on ? String(PX.size) : 'off', nx = order[(order.indexOf(cur) + 1) % order.length]; if (nx === 'off') setPixel(false); else setPixel(true, +nx); try { localStorage.setItem('ub.px', nx); } catch { /* private mode */ } } }];
    installActTune(SET.map(x => ({ label: x.label, run: x.run })));
    // the pause menu (act-30 之后, user: 「帮我把手柄的按键映射和手柄支持做了吧」): Start / Esc, a pad pulled out, the page hidden
    this.pause = new PauseMenu({ L: this.L, settings: SET.map(x => ({ label: x.short, run: x.run })), canGiveUp: () => this.canGiveUp(), giveUp: () => this.giveUp(), closed: () => this.unpaused() });
    RUMBLE.fn = padRumble;
    if (typeof window !== 'undefined') {
      window.addEventListener('gamepaddisconnected', () => { if (PAD.device === 'pad') this.pauseGame(); });
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this.pauseGame(); });
    }
    if (typeof window !== 'undefined') window.addEventListener('keydown', e => { if ((e.key === 'u' || e.key === 'U') && !this.cards.on) this.cycleSkin(); });
    dh.add({ voxCompare: (id: string, only = -1, x?: number, z?: number) => {
        // before (the code model) on the left, the edited file on the right, beside the hero (captures of a model edit);
        // only = 0 / 1: just the original / just the edited one, at (x, z)
        const def = HEROES.find(d => d.id === id) ?? ROSTER.find(d => d.id === id), code = CODE_BUILD.get(id); if (!def) return 'no model';
        for (const a of this.lineupActors) a.dispose(); this.lineupActors = [];
        const h = this.hero.pos, cx = x ?? h.x, cz = z ?? h.z;
        const pair: Array<[ModelDef, number]> = [[code ? { ...def, build: code } : def, -1.5], [def, 1.5]];
        (only >= 0 ? [[pair[only][0], 0] as [ModelDef, number]] : pair).forEach(([d, dx]) => { const a = new BattleActor(d); a.place(V3(cx + dx, 0, cz), 0); a.yaw = 0; this.lineupActors.push(a); });
        return { at: [cx, cz], edited: !!code };
      }, prof: () => profile(), steleTest: (n = 0, cut = -1) => { const st = new Stele(n); st.g.position.set(this.hero.pos.x, 0, this.hero.pos.z - 2.2); this.stage!.root.add(st.g); if (cut >= 0) after(0.8, () => st.strike(cut)); return st; }, boss: () => { this.startRun(); this.plan = roomOf('boss', RUN_ROOMS - 1, Math.random); this.locale = this.plan.locale; this.room = RUN_ROOMS - 1; this.buildRoom(false); }, newGame: () => this.startNewGame(), talkTest: (n = 0) => this.talk(n ? CHULEI_BEFORE : WAKE_DUWU), act: () => this, bot: (on = true) => { this.botOn = on; }, run: () => this.startRun(), yard: () => this.enterYard(), wear: (id: string) => { const d = HEROES.find(h => h.id === id); if (d) this.wear(d); },
      skin: (id: SkinId) => this.cycleSkin(id),
      cardsDemo: () => { void this.cards.open([BOONS[0], BOONS[6], BOONS[12]].map((boon, tier) => ({ boon, tier }))); },
      /** captures: these boons as a pick, tiers 0 / 1 / 2 in turn */ cardsOf: (ids: string[]) => { void this.cards.open(ids.map((id, i) => ({ boon: BOONS.find(b => b.id === id) ?? BOONS[0], tier: i % 3 }))); },
      boon: (id: string, tier = 0) => applyBoon(this.perks, id, tier), // wp/boons: browser effect checks
      intent: (n = 3) => { this.intent = Math.max(0, Math.min(3, n)); this.hud.intent = this.intent; },
      qi: (n?: number) => { if (n != null) this.hero.qi = Math.max(0, Math.min(Hero.QI_MAX, n)); return this.hero.qi; },
      untaught: () => { try { localStorage.removeItem('ub.taught'); } catch { /* */ } this.taught = null; },
      prologue: (n = 1) => { this.startPrologue(); if (n >= 2) { after(0.3, () => { this.prologue = 2; this.proFightT = 0; this.plan = { type: 'boss', locale: 'hj_temple', reward: null, waves: [['hj_boss']] }; this.locale = 'hj_temple'; this.room = 1; this.buildRoom(false); }); } },
      sfx: () => ({ ready: audio.ready, all: audio.buf.size, loaded: [...audio.buf.keys()].filter(k => /^ub_(flesh|gore|blood)/.test(k)), muted: audio.muted, ctx: audio.ctx ? audio.ctx.state : 'none', recent: audio.recent.slice() }), unlockAudio: () => audio.unlock().then(() => audio.ready),
      cam: (b: number[] | null, l?: number[], fov = 30) => { this.camOverride = b ? { base: V3(b[0], b[1], b[2]), look: V3(l![0], l![1], l![2]), fov } : null; },
      press: (n: 'attack' | 'dash' | 'special' | 'jump', ms = 80) => { this.inp.hold(n, ms / 1000); },
      unpress: (n: 'attack' | 'dash' | 'special' | 'jump') => { this.inp.unhold(n); },
      stick: (x: number, y: number, ms = 300) => { this.inp.push(x, y, ms / 1000); },
      // captures: hold a lineup model in a locomotion state (run 0..1 at a stride phase, height off the ground…) or play it an action
      motion: (i: number, m: Record<string, number>) => { const a = this.lineupActors[i]; if (a) Object.assign(motionOf(a), m); },
      lplay: (i: number, name: string, dur = 0.5, at = 0.5) => { this.lineupActors[i]?.play(new Action(name, dur, at)); },
      // tests: an arrow from d metres in front of the hero, flying at it
      // agents / captures: a fight-less room in one place (the scene builders check their place with it) — returns the assembler's report
      scene: (id: string, seed?: number, o: Partial<Spec> = {}) => { this.viewSpec = { ...o, locale: id, ...(seed != null ? { seed } : {}) }; this.room = 0; this.locale = id; this.buildRoom(true); this.viewSpec = null; const r = this.lastReport; return r ? { name: r.name, spec: r.spec, placed: r.placed.length, rejected: r.rejected.map(x => x.id + ':' + x.issues.map(i => i.kind).join('/')), empty: r.empty, warnings: r.warnings, lights: r.lights } : null; },
      // agents / captures: a foe of any kind at (x, z), facing the hero (elite: the stronger variant, where the kind has one)
      spawn: (kind: EKind, x = 0, z = -2, elite = false) => { const f = spawnFoe(kind, V3(x, 0, z), this.hero.pos.clone(), elite); /* wp/foes: elite into spawnFoe */ f.st = 'move'; this.foes.push(f); return f.uid; },
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
    // browsers only let sound start after a touch or a key: the first input starts the music
    const unlock = () => { if (this.audioOn) return; this.audioOn = true; audio.unlock().then(() => this.music()).catch(() => { this.audioOn = false; }); };
    if (typeof window !== 'undefined') { window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock); }
    this.start();
  }
  /** act-19: the music for where we are — the opening, the yard, or the room's kind (a fight, a 死士 room, the 渠帅, a calm room);
   *  the same track carries on across rooms, a different one cross-fades in */
  private musicHold: string | null = null;
  music() {
    if (!this.audioOn) return;
    const t = this.plan?.type ?? 'fight', ph = this.phase as string;
    // (act-37: a scored piece holds until its scene is over; the prologue's temple fight has its own; the hideout is the kiln's)
    if (this.musicHold) { void audio.playMusic(this.musicHold, 1.2); return; }
    const name = ph === 'opening' || ph === 'title' ? 'bgm_opening' : this.room < 0 || ph === 'yard' ? 'bgm_yard' : this.prologue === 2 ? 'bgm_boss' : t === 'boss' ? 'bgm_boss' : t === 'elite' ? 'bgm_elite' : t === 'shop' || t === 'rest' || t === 'boon' ? 'bgm_calm' : 'bgm_battle';
    void audio.playMusic(name, 1.8);
  }
  layout2() {
    const s = this.platform.canvasSize(), dpr = Math.min(this.platform.dpr(), 2);
    this.L.resize(s.w, s.h, dpr); this.ov.resize(s.w, s.h, dpr); this.hud.layout(s.w, s.h);
  }
  // ------------------------------------------------------------ rooms
  start() {
    dh.add({ opening: () => this.opening(), title: (n = 1) => this.title(n) });
    dh.add({ rack: (n = 30) => { if (this.stage) this.stage.root.add(rackBlades(n)); return n; } });   // captures: the hideout's rack with n blades   // captures: the old opening / a title variant again
    // ?lab, or the desktop model page (window.__LAB): the model viewer (lab.ts, act-21)
    if (typeof window !== 'undefined' && ((window as unknown as { __LAB?: number }).__LAB || /[?&#]lab\b/.test(location.href))) { this.lab(); return; }
    // ?model (vox/打开游戏看效果.bat): straight into the hideout, the camera close behind her — for checking a model edited in MagicaVoxel
    if (typeof location !== 'undefined' && /[?&#]model\b/.test(location.href)) { Object.assign(TUNE, { camH: 7.5, camD: 10.5, camFov: 34 }); this.enterYard(); return; }
    const tn = wantTitle();
    if (typeof location !== 'undefined' && /[?&#]run\b/.test(location.href)) this.startRun(); else if (tn) this.title(tn); else if (wantOpening()) this.opening(); else this.enterYard();
  }
  /** 开始画面 (title.ts, act-20): a wide shot of one of the place / weather variants with the menu (开始游戏 / 继续游戏 / 设置);
   *  the title builds its own place and poses its own heroine while frame() idles; the choice cuts into startNewGame / continueGame */
  title(n = 1) {
    try { localStorage.setItem('ub.title', String(n)); } catch { /* storage blocked */ }   // the last one shown opens next time
    // a room may be up (__dh.title from the yard): its actors go the way a room change sends them
    for (const f of this.foes) f.a.dispose(); this.foes.length = 0; for (const a of this.arrows) a.kill(); this.arrows.length = 0; for (const w of this.waves) w.kill(); this.waves = []; for (const d of this.darts) d.kill(); this.darts = [];
    this.yard?.dispose(); this.yard = null; this.props?.dispose(); this.props = null; this.gates?.dispose(); this.gates = null; this.leaves?.dispose(); this.leaves = null; this.stations?.dispose(); this.stations = null; this.hero?.a.dispose();
    this.clearNpcs();
    this.phase = 'title'; this.hud.on = false; this.hud.update(0, this.inp, []); this.banner.hide(); this.blob.visible = false; this.ring.visible = false; for (const m of this.shadows) m.visible = false;
    void playTitle(n, { ov: this.ov, L: this.L, hasSave, settings: () => this.pause.open('set', { fromTitle: true }), enter: k => { this.hud.on = true; if (k === 'continue') this.continueGame(); else void this.startNewGame(); } });
    this.music();
    // (before the title's first frame: the page is still dark and loading then — a frozen first picture with the snow hanging in the
    //  air would read as a hang)
    this.prefetchNewGame();
  }
  /** act-34 (用户：「开场那个一砍变成两半的效果本来很牛逼，结果卡住半天才揭开」): the first room of a new game took ~6 s to build in
   *  the frame the title split, so the split stood still that long. It is built now, while the title loads (the page is still
   *  coming up), off the live scene; the split only puts it up. (Continue goes to the hideout, which is quick to build.) */
  private prefetchNewGame() {
    this.pre?.prep.drop(); this.pre = null;
    const keep = STAGE_BIG.on;
    try {
      // act-37: a new game opens on 寒山坞 (the cold open); the village of 「七年后」 is built later, behind the cold open's last dark
      const r = prepRoom(COLD_ROOM);
      this.pre = { ...r, locale: 'hs_forge' }; warm(r.prep.root);
    } catch (e) { console.warn('[act] prefetch failed', e); }
    setStage(keep);
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
  opening() {
    this.viewSpec = { ...OPENING_SPEC }; this.room = 0; this.locale = OPENING_SPEC.locale; this.buildRoom(true); this.viewSpec = null;
    this.phase = 'opening'; this.hud.on = false; this.hud.update(0, this.inp, []); this.banner.hide(); this.blob.visible = false; for (const m of this.shadows) m.visible = false;
    void playOpening({ actor: this.hero.a, stage: this.stage!, ov: this.ov, enter: () => { this.hud.on = true; this.enterYard(); }, soundOn: () => this.audioOn });
  }
  /** the training yard: dummies, summon slabs, the costume rack, the way out to a run */
  enterYard() {
    TUNE.dartCharges = 3; TUNE.aggression = 0.85; this.mods = { dmgMul: 1, dartBonus: 0, hpBonus: 0, deathDefy: 0, startIntent: 0, windupMul: 1, startManual: false };
    if (this.banked) { const b = this.banked, alive = this.lastWon; this.banked = null; const t = HAUL[alive ? 0 : 1] ?? '', [title, sub] = t.split('：'); after(0.6, () => this.banner.show(title ?? '带回', (sub ?? '').replace('{iron}', String(b.iron)).replace('{herb}', String(b.herb)), 2.4, '#ffd27a')); }
    this.musicHold = null;
    if (this.justDied) { after(0.3, () => cue('stingRevive', 1)); }
    if (this.justDied) { this.justDied = false; const who = (['duwu', 'sunao', 'fengtiebi'] as const)[Math.floor(Math.random() * 3)]; after(1.0, () => { if (this.phase === 'yard') void this.talk(deathLine(who)); }); }
    this.intent = 0; this.hud.intent = 0;
    this.perks = newPerks(); this.room = -1; this.kills = 0; this.locale = 'ninja_wilds'; this.recent = []; this.plan = null;
    TUNE.heroHp = 100; this.buildRoom(true);
  }
  startRun() {
    this.intent = 0; this.hud.intent = 0;
    this.perks = newPerks(); this.room = 0; this.kills = 0; this.recent = [];
    this.plan = firstRoom(Math.random); this.visited = []; this.coins = 0; this.locale = this.plan.locale;
    // act-20: the hideout's upgrades (meta.ts) for this run
    this.mods = runMods(profile()); this.defy = this.mods.deathDefy; this.eliteKills = 0; this.bossKilled = false;
    // 杜五's provisions (one run): 炙肉胡饼 +15 血上限, 五铢钱囊 40 铜钱, 瓦壶烈酒 the first blow costs nothing
    { const p = profile(), meal = p.meal; p.meal = undefined; saveProfile(); this.wine = meal === 'wine';
      if (meal === 'feast') this.mods.hpBonus += 15; if (meal === 'purse') this.coins = 40; }
    TUNE.heroHp = 100 + this.mods.hpBonus; TUNE.dartCharges = 3 + this.mods.dartBonus; TUNE.aggression = 0.85 / this.mods.windupMul;
    this.buildRoom(true);
    if (this.mods.startManual) after(1.4, () => { if (this.room === 0) void this.manualPick(); });
  }
  /** put on another costume (the rack, or __dh.wear) and remember it */
  private wear(d: ModelDef) {
    this.wearing = d; try { localStorage.setItem('act.hero6', d.id); } catch { /* storage blocked */ }
    if (this.hud.flask instanceof IronHp) this.hud.flask.setFace(d.id); else HP_FACE.id = d.id;
    if (this.hero) this.hero.setModel(d);
  }
  private buildRoom(first: boolean) {
    blood.clear();
    for (const f of this.foes) f.a.dispose(); this.foes.length = 0; for (const a of this.arrows) a.kill(); this.arrows.length = 0; for (const w of this.waves) w.kill(); this.waves = []; for (const d of this.darts) d.kill(); this.darts = [];
    this.gates?.dispose(); this.gates = null; this.leaves?.dispose(); this.leaves = null; this.clearNpcs();
    for (const d of this.doors) d.g.parent?.remove(d.g); this.doors = []; this.stations?.dispose(); this.stations = null; this.coinsFx.clear();
    this.yard?.dispose(); this.yard = null; this.exitSign?.parent?.remove(this.exitSign); this.exitSign = null;
    const hp = first || !this.hero ? TUNE.heroHp : this.hero.hp, maxHp = TUNE.heroHp, qi = first || !this.hero ? 0 : this.hero.qi;
    this.hero?.a.dispose();
    const isYard = this.room < 0;
    if (!isYard && this.plan && !this.viewSpec) this.visited.push(this.plan.type);
    this.nextRooms = !isYard && this.plan && !this.viewSpec ? doorsFrom(this.room, this.visited, Math.random) : [];
    if (this.prologue === 1 && !this.viewSpec) this.nextRooms = [PRO_BOSS]; else if (this.prologue === 2) this.nextRooms = [];   // act-29
    // act-34: the place itself — built ahead of time when it can be (the title builds a new game's first room while it loads), else now
    const want: RoomIn = { isYard, room: this.room, recent: this.recent, locale: this.locale, plan: this.plan, nextRooms: this.nextRooms, viewSpec: this.viewSpec, forceSpec: this.forceSpec, noArena: this.noArena };
    const ready = this.pre && !isYard && !this.viewSpec && this.prologue === 1 && this.room === 0 && this.pre.locale === this.locale ? this.pre : null;
    if (this.pre && this.pre !== ready) this.pre.prep.drop();
    this.pre = null;
    const P = ready ?? prepRoom(want);
    const spec = P.spec; this.recent.push(spec); this.spec = spec;
    setStage(P.big); this.layout = P.layout; this.arena = P.arena; if (P.report) this.lastReport = P.report;
    const big = P.big;
    this.stage = P.prep.attach();
    if (isYard) Object.assign(PLAY, HIDEOUT.floor);   // act-20: the hideout 断碑古窑 (hideout.ts) is the yard now — its own stage and floor
    this.solids.clear(); this.props?.dispose(); this.props = null; this.botWp = 0;
    if (isYard) for (const so of HIDEOUT.solids) this.solids.add({ kind: 'prop', ...so });
    if (this.arena && this.stage) {
      // act-20: the cover pieces are breakable (Breakables builds them and their solids)
      this.props = new Breakables(this.stage.root, this.solids); this.props.build(this.arena.props, this.arena.covers);
      // act-37: the snowy night's braziers (the prologue's village and temple): four warm points round the floor, where it is free
      if (spec.weather === 'snow' && spec.time === 'night') for (const [x, z] of [[PLAY.x0 + 1.6, PLAY.z0 + 1.8], [PLAY.x1 - 1.6, PLAY.z0 + 1.8], [PLAY.x0 + 1.6, PLAY.z1 - 3.2], [PLAY.x1 - 1.6, PLAY.z1 - 3.2]]) {
        let px = x, pz = z; for (let t = 0; t < 8 && !this.solids.free(px, pz, 0.6, 0.3); t++) { px += (x < 0 ? 0.7 : -0.7); pz += 0.4; }
        if (!this.solids.free(px, pz, 0.6, 0.3)) continue;
        this.stage.root.add(brazier(px, pz)); this.solids.add({ kind: 'prop', shape: 'circle', x: px, z: pz, r: 0.42 });
      }
      this.gates = new Gates(this.stage.root, this.arena);
    }
    // fallen leaves on the floor, a few drifting down (act-19); none in winter or in the rain
    this.leaves = new Leaves(spec.weather === 'rain' || spec.weather === 'snow' ? 'winter' : spec.season, { rest: big ? 100 : 40, fall: big ? 1.4 : 0.8 });
    this.hero = new Hero(isYard ? V3(HIDEOUT.spawn[0], 0, HIDEOUT.spawn[1]) : V3(0, 0, SZ(5.0)), this.wearing); this.hero.moves = isYard || this.prologue ? ALL_MOVES : this.perks.moves;   // (act-40 用户：「开局第一场战斗默认给主角解锁所有技能」) this.hero.perks = this.perks; this.hero.hp = Math.min(hp, maxHp); this.hero.maxHp = maxHp;
    this.hero.qi = isYard ? Hero.QI_MAX : Math.min(Hero.QI_MAX, Math.max(qi, TUNE.qiStart));   // (11-17 气: carried on; a room starts with at least TUNE.qiStart)
    this.hero.a.yaw = isYard ? -0.6 : Math.PI;
    this.hud.flask.set({ hp: this.hero.hp, maxHp });
    this.cam.set(this.hero.pos.x, 0, this.hero.pos.z); shot('act', () => this.camPose(), { cut: true, speed: 8 });
    after(0.05, () => this.music());
    if (isYard) { this.openYard(); return; }
    if (this.viewSpec) { this.phase = 'yard'; this.log.push(`view ${spec.locale} ${spec.layout} ${spec.time}`); return; }
    this.phase = 'intro'; this.wave = 0;
    if (this.mods.startIntent > 0 && this.intent < this.mods.startIntent) { this.intent = this.mods.startIntent; this.hud.intent = this.intent; }
    const name = LOCALES[this.locale]?.name ?? '';
    // the very first room: the controls once, in the banner (no key hints on screen afterwards)
    const dev = this.inp.lastDevice, hint = !this.hinted ? (dev === 'touch' && 'ontouchstart' in globalThis ? '左边拖动走 · 斩 / 按住蓄力 · 冲 · 跳 · 镖'
      : dev === 'pad' ? `左摇杆 走 · ${actPad('attack')} 斩（按住蓄力）· ${actPad('jump')} 跳 · ${actPad('dash')} 冲刺 · ${actPad('special')} 飞镖`
      : `WASD 走 · ${actKey('attack')} 斩（按住蓄力）· ${actKey('jump')} 跳 · ${actKey('dash')} 冲刺 · ${actKey('special')} 飞镖`) : '';
    this.hinted = true;
    const info = ROOM_INFO[this.plan?.type ?? 'fight'];
    if (!this.prologue) this.banner.show(`第 ${'一二三四五六'[this.room] ?? this.room + 1} 间 · ${info.name}`, hint || `${name} · ${info.line}`, hint ? 3.2 : 1.6);
    // the rooms without a fight: the stations stand ready and the roads are open at once
    if (this.plan && (this.plan.type === 'shop' || this.plan.type === 'rest' || this.plan.type === 'boon')) {
      this.stations = new Stations(this.stage!.root);
      if (this.plan.type === 'shop') this.stations.shop(PRICES); else if (this.plan.type === 'rest') this.stations.rest(); else this.stations.scroll();
      this.log.push(`room ${this.room} ${this.plan.type} ${spec.locale}`);
      this.openDoors(true); return;
    }
    // walk in from the front of the room, then the first wave
    const h = this.hero; this.introT = 0;
    after(1.1, () => {
      if (this.hero !== h || this.phase !== 'intro') return;
      this.phase = 'fight'; this.spawnWave();
    });
    this.log.push(`room ${this.room} ${spec.locale} ${spec.layout} ${spec.time}`);
  }
  private openYard() {
    this.phase = 'yard'; this.wave = 0;
    // act-20: the hideout's 试剑坪 — four slabs call sparring partners, three dummies; no costume rack (her look is in 设置)
    const pk: Array<[EKind, string]> = [['hj_blade', '刀手'], ['hj_brute', '力士'], ['hj_archer', '弓手'], ['hj_boss', '渠帅']];
    const ring = HIDEOUT.dummies.reduce((a, d) => [a[0] + d[0] / HIDEOUT.dummies.length, a[1] + d[1] / HIDEOUT.dummies.length], [0, 0]);
    this.yard = new Yard(this.stage!.root, [], this.wearing, [0, 0], { pads: HIDEOUT.slabs.map(([x, z], i) => ({ x, z, kind: pk[i % pk.length][0], name: pk[i % pk.length][1] })), spawn: () => V3(ring[0] + (Math.random() - 0.5) * 2, 0, ring[1] - 1.2) });
    for (const [x, z] of HIDEOUT.dummies) { const p = V3(x, 0, z), f = spawnFoe('dummy', p, V3(x, 0, z + 4)); f.st = 'move'; this.foes.push(f); }
    // the people of chapter 1 at their places (卢昭 and 桓越 come later in the story)
    this.placeNpcs((['duwu', 'sunao', 'fengtiebi'] as const).map(id => ({ id, ...HIDEOUT.people[id] })));
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
        after(1.2, () => { st.strike(0); hitstop(0.12); cue('stingStele', 1); after(0.7, () => { this.noTalk = false; void this.talk([{ who: 'jiangjin', text: STELE_LINES.strike }]); }); });
      }); }
    // act-37: the rack of thirty blades — one hangs for each taken back (褚雷 had the first)
    { const p = profile(); this.stage!.root.add(rackBlades(p.seen['ch1_boss_after'] ? 1 : 0)); }
    // the way out: the gate in the front wall, a sign beside it; the bot walks there by the gate's mouth
    const gx = (HIDEOUT.exit.x0 + HIDEOUT.exit.x1) / 2;
    this.exitSign = makeSign('出发', { w: 1.3, h: 0.6, post: 0.9 }); this.exitSign.position.set(HIDEOUT.exit.x1 + 0.9, 0, HIDEOUT.exit.z - 0.9); this.stage!.root.add(this.exitSign);
    // (a lane through the gate toward the camera: the clamp lets her walk on out there; the front wall either side is solid. The
    // id is a side road's, which the clamp treats as 'hold z to the lane, x to the solids' — the back road's rule would open the north)
    const ex = { ...exitInfo(this.layout!, 'back'), id: 'left' as const, lane: { x0: HIDEOUT.exit.x0, x1: HIDEOUT.exit.x1, z0: HIDEOUT.exit.z - 1.0, z1: PLAY.z1 + 2.5 }, walk: [[gx, HIDEOUT.exit.z - 1.6], [gx, HIDEOUT.exit.z + 1.0]] as Array<[number, number]> };
    this.doors = [{ ex, g: new THREE.Group(), lift: 1 }];
    const touch = this.inp.lastDevice === 'touch' && 'ontouchstart' in globalThis;
    this.banner.show('断碑古窑', touch ? '走近人点右下说话 · 踩石板叫陪练 · 出院门开打' : this.inp.lastDevice === 'pad' ? `走近人按 ${actPad('attack')} 说话 · 踩石板叫陪练 · 出院门开打` : `走近人按 ${actKey('attack')} 说话 · 踩石板叫陪练 · 出院门开打 · \` 键调手感`, 4);
    this.log.push('yard');
  }
  private spawnWave() {
    const kinds = this.plan?.waves[this.wave] ?? [], hp = this.hero.pos;
    kinds.forEach((k, i) => {
      after(i * 0.28, () => {
        if (this.phase !== 'fight') return;
        let p = V3();
        for (let t = 0; t < 30; t++) {
          // act-19 (2x stage): anywhere on the floor 5–12 m from the hero, clear of the walls' edge, the cover and the props
          p = V3(R(PLAY.x0 + 1.5, PLAY.x1 - 1.5), 0, R(PLAY.z0 + 1.5, PLAY.z1 - 2.5));
          if (EDEFS[kindOr(k).kind].boss) p = V3(0, 0, SZ(-4.6));   // any region boss stands at the back
          const d = p.distanceTo(hp);
          if (d > 5 && d < 12 && this.foes.every(f => f.pos.distanceTo(p) > 1.4) && this.solids.free(p.x, p.z, 0.6, 0.3)) break;
        }
        // the plan's kind (黄巾 ids; 'kind*' = its elite) — the boss gets its banner: name and slogan from EDEFS
        const ko = kindOr(k), f = spawnFoe(ko.kind, p, hp.clone(), ko.elite); this.foes.push(f);
        const bs = !!EDEFS[ko.kind].boss;
        fxSmoke(p.clone().add(V3(0, 0.3, 0)), 0x6a6a74, bs ? 14 : 8, { r: 0.7, spd: 1.2, up: 0.6, s: 0.4, life: 0.7 }); fxRing(p.clone().setY(0.05), 0xff7a4a, 1.2, { life: 0.4 } as never);
        cue(bs ? 'roar' : 'summon', bs ? 0.9 : 0.4);
        // act-20: the chapter's boss the first time on this save — the intro cutscene and the lines before the fight (he
        // comes in the room's second wave); after that only his banner
        if (bs && this.prologue === 2) { after(0.35, async () => { await this.cine(bossIntroShots(this.cineHost, f, '雷公渠帅 · 褚雷')); await this.talk(PRO_CHULEI); f.a.roar(); this.proFightT = 0; }); }
        else if (bs && seeOnce('ch1_boss')) { saveProfile(); after(0.35, async () => { if ((f.st as string) === 'dead') return; await this.cine(bossIntroShots(this.cineHost, f, '雷公渠帅 · 褚雷')); await this.talk(CHULEI_BEFORE); f.a.roar(); }); }
        else if (bs) { f.a.roar(); shake(0.3 * TUNE.shake); this.banner.show(EDEFS[ko.kind].name, EDEFS[ko.kind].tag ?? '', 1.6, '#ff8a6a'); }
      });
    });
  }
  // ------------------------------------------------------------ the world the hero / foes see
  /** act-37 (用户：「碰撞必须要做，不然这游戏太多穿模了」): every body pushes the others out by their radii and weights — foe from foe,
   *  the hero from a foe (a boss barely gives, a dummy and the hideout's people not at all); a dashing or airborne hero passes
   *  (the dash-cut goes through by design); whatever moved is held by the walls and the solids again */
  private separate() {
    const h = this.hero, B: Array<{ p: THREE.Vector3; r: number; m: number; moved: boolean }> = [];
    if (h && h.hp > 0 && h.st !== 'dash' && !h.airborne) B.push({ p: h.pos, r: h.r, m: 1, moved: false });
    for (const f of this.foes) if (f.st !== 'dead') B.push({ p: f.pos, r: f.d.r * 0.9, m: f.kind === 'dummy' ? 1e6 : isBoss(f) ? 8 : f.d.mass, moved: false });
    for (const n of this.npcs) B.push({ p: V3(n.x, 0, n.z), r: 0.42, m: 1e6, moved: false });
    for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
      const a = B[i], b = B[j], dx = b.p.x - a.p.x, dz = b.p.z - a.p.z, min = a.r + b.r, d2 = dx * dx + dz * dz;
      if (d2 >= min * min || a.m >= 1e6 && b.m >= 1e6) continue;
      const d = Math.sqrt(d2) || 1e-3, nx = d2 > 1e-8 ? dx / d : 1, nz = d2 > 1e-8 ? dz / d : 0, over = min - d, wa = b.m / (a.m + b.m), wb = a.m / (a.m + b.m);
      if (a.m < 1e6) { a.p.x -= nx * over * wa; a.p.z -= nz * over * wa; a.moved = true; }
      if (b.m < 1e6) { b.p.x += nx * over * wb; b.p.z += nz * over * wb; b.moved = true; }
    }
    const keep = this.lastPush;
    for (const o of B) if (o.moved) this.clamp(o.p, o.r);
    this.lastPush = keep;
  }
  private clamp = (p: THREE.Vector3, r: number) => {
    const x0 = PLAY.x0 + r + 0.2, x1 = PLAY.x1 - r - 0.2, z0 = PLAY.z0 + r + 0.3, z1 = PLAY.z1 - r - 0.2;
    if (this.phase === 'doors' || this.phase === 'leaving' || this.phase === 'yard') for (const d of this.doors) { const l = d.ex.lane; if (p.x > l.x0 - 1.0 && p.x < l.x1 + 1.0 && p.z > l.z0 - (d.ex.id === 'back' ? 1.0 : 0.1) && p.z < l.z1 + (d.ex.id === 'back' ? 1.0 : 0.1)) {
        // the back road: held to its width, free to walk on out (a short lane, shallower than the hero is wide, used to clamp him back
        // inside the room so he could never reach the far end)
        if (d.ex.id === 'back') { p.x = Math.max(l.x0 + r, Math.min(l.x1 - r, p.x)); p.z = Math.max(Math.min(l.z0, PLAY.z0) + r - 6, Math.min(PLAY.z1 - r, p.z)); }
        else p.z = Math.max(l.z0 + r, Math.min(l.z1 - r, p.z));
        this.lastPush = this.solids.pushOut(p, r); return; } }
    const ox = p.x, oz = p.z;
    p.x = Math.max(x0, Math.min(x1, p.x)); p.z = Math.max(z0, Math.min(z1, p.z));
    // the floor's edge counts as the wall (a slam); the push normal points back into the room
    const wx = p.x - ox, wz = p.z - oz; this.lastPush = null;
    const sp = this.solids.pushOut(p, r);
    this.lastPush = sp ?? (wx || wz ? { s: WALL_SOLID, nx: Math.sign(wx), nz: Math.sign(wz), depth: Math.hypot(wx, wz) } : null);
  };
  private heroWorld: HeroWorld = {
    foes: this.foes,
    swing: o => this.swing(o), sweep: o => this.sweep(o), slam: o => this.slam(o), clamp: this.clamp,
    launch: o => this.launchCut(o), kick: o => this.kickHit(o),
    dart: o => { this.dartsThrown++; const bonus = tierOf(this.perks, 'darts3') === 1 ? 1.25 : 1; const d = new Dart(o.from.clone(), o.dir.clone().multiplyScalar(TUNE.dartSpeed), TUNE.dartDmg * bonus, TUNE.dartRange); d.link = o.link ?? 0; this.darts.push(d); },
    chaseTarget: () => this.chaseTarget(), chase: o => this.chaseFx(o),
    stickWorld: () => V3(this.inp.move.x, 0, -this.inp.move.y),
    // act-27: the dart's aim — the finger dragged off the dart button, else the stick (keys / pad)
    aimWorld: () => { const a = this.inp.aimScreen(); if (a) return V3(a.x, 0, -a.y); const r = this.inp.rstick; if (Math.hypot(r.x, r.y) > 0.3) return V3(r.x, 0, -r.y); const m = this.inp.move; return Math.hypot(m.x, m.y) > 0.2 ? V3(m.x, 0, -m.y) : null; },
    guard: o => this.guard(o), incoming: r => this.incoming(r), iaiCatch: win => this.iaiCatch(win),
  };
  private foeWorld: FoeWorld = {
    pushed: (f, dx, dz) => this.pushed(f, dx, dz),
    heroPos: V3(), heroR: 0.38, heroAlive: true, heroY: 0, heroDodge: false, foes: this.foes, arrows: this.arrows, clamp: this.clamp,
    hurtHero: (dmg, from, attacker) => this.hurtHero(dmg, from, attacker), // wp/boons: exact melee attacker; arrows omit it
    killFoe: (f, from) => this.killFoe(f, from), // wp/boons: lethal burn ticks use the death hook too
    bleedDamage: f => f.bleed * v(this.perks, 'bleed') * (f.sunderT > 0 ? 1 + v(this.perks, 'sunder') / 100 : 1),
    bleedSpill: f => blood.spray(f.a.chest(), V3(0, 0, 1), 1, 0.35),
    arrowHit: (f, a) => this.arrowHit(f, a),
    dodged: from => this.perfectDodge(from),
  };
  /** act-23: did the swing being felt cut flesh (not only the wooden dummies)? picks the hit sound's flesh layers */
  private fleshHit = false;
  private dmgMul(kind: string) { return isBladeHit(kind) && this.hero.hp < this.hero.maxHp / 2 ? 1 + v(this.perks, 'frenzy') / 100 : 1; }
  private feel(heavy: boolean, n: number) {
    if (!n) return;
    hitstop((heavy ? 0.09 : 0.045 + 0.01 * Math.min(3, n - 1)) * TUNE.hitstop); shake((heavy ? 0.34 : 0.13) * TUNE.shake);
    cue(heavy ? 'cutHeavy' : 'cut', (heavy ? 1.0 : 0.7) + 0.1 * Math.min(3, n - 1), this.fleshHit ? 1 : 0); this.fleshHit = false; this.platform.vibrate(heavy ? 'medium' : 'light');
    this.hud.btnKick('attack', heavy ? 1 : 0.55, heavy ? 0xffb060 : 0xfff2d0);   // act-29: the cut button answers the hit
  }
  // ------------------------------------------------------------ act-19: 刀谱, 挑空斩, 飞踢
  /** three manuals not learnt yet, one taken (none left: a boon instead) */
  private async manualPick() {
    const list = drawManuals(this.perks.moves, 3, Math.random); if (!list.length) { await this.boonPick(); return; }
    const was = this.phase; this.phase = 'pick'; this.hud.on = false; this.banner.hide();
    const i = await this.cards.open(list.map(m => ({ boon: manualCard(m), tier: 0 })));
    const m = list[i]; this.perks.moves[m.id] = true; this.log.push(`manual ${m.id}`);
    this.hud.on = true; this.phase = was === 'pick' ? 'pick' : was; this.banner.show(m.name, '刀谱', 1.2, '#f0e0b0');
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
      if ((f.st as string) !== 'dead' && this.launchable(f)) { f.airV = 10.5; f.pos.y = Math.max(f.pos.y, 0.05); f.vel.set(fx * 1.2, 0, fz * 1.2); }
    }
    if (this.props) this.applyProps(this.props.hitArc(o.from, o.yaw, o.range, o.half, { src: 'hero', heavy: true }, this.targets()));
    this.leaves?.blast(o.from.x + fx, o.from.z + fz, 1.6, 4);
    trailSeg(o.from.clone().add(V3(fx * 0.6, 0.2, fz * 0.6)), o.from.clone().add(V3(fx * 1.2, 2.4, fz * 1.2)), 0xffe8a0, 0.2, { life: 0.3, bright: 2.4, spark: 0.5 });
    this.feel(true, n); return n;
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
    fxImpact(best.a.chest(), 0xfff0d0, 1.4, { dir: o.dir.clone() }); cue('land', 1); cue('cutHeavy', 0.6); shake(0.25 * TUNE.shake);
    this.leaves?.blast(best.pos.x, best.pos.z, 1.5, 6);
    return 1;
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
    for (const e of r.events) if (e.k === 'boom') this.leaves?.blast(e.x, e.z, 4.5, 8);
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
    if (slamSpeed(f.vel.x, f.vel.z, lp.nx, lp.nz) < SLAM.minSpeed) return;
    const last = this.slamAt.get(f) ?? -9; if (clock.time - last < SLAM.cooldown) return; this.slamAt.set(f, clock.time);
    const vn = f.vel.x * lp.nx + f.vel.z * lp.nz; f.vel.x -= vn * lp.nx * 1.4; f.vel.z -= vn * lp.nz * 1.4;   // a little bounce off it
    const at = f.pos.clone().addScaledVector(V3(lp.nx, 0, lp.nz), -f.d.r);
    if (lp.s.kind === 'prop') { const r = this.props?.hitCircle(at.x, at.z, 0.35, { src: 'slam', heavy: true, dir: [-lp.nx, -lp.nz] }, this.targets()); if (r) this.applyProps(r); if (!lp.s.slam) return; }
    fxSmoke(at.clone().setY(0.6), 0x8a7a6a, 6, { r: 0.4, spd: 1.8, up: 0.6, s: 0.35, life: 0.6 }); dustBlocks(at.clone(), 6); shake(0.14 * TUNE.shake);
    this.hitFoe(f, SLAM.dmg, at, { knock: 0, heavy: true, kind: 'school', stagger: isBoss(f) ? 0 : SLAM.stun }); cue('wallSlam', 0.9);
  }
  private hitFoe(f: Foe, dmg: number, from: THREE.Vector3, o: { knock: number; heavy: boolean; kind: string; stagger?: number }) {
    if (f.st === 'dead') return;
    const cut = isBladeHit(o.kind), heavyCut = ['k5', 'rel', 'plunge', 'launch'].includes(o.kind) && tierOf(this.perks, 'bone') >= 0;
    if (o.kind === 'rel') dmg *= 1 + v2(this.perks, 'draw') / 100;
    if (o.kind === 'parry') dmg *= 1 + v(this.perks, 'counter') / 100;
    const knock = heavyCut ? o.knock * 1.4 : o.knock, stagger = (o.stagger ?? (o.heavy ? 0.55 : 0.3)) + (heavyCut ? v(this.perks, 'bone') : 0);
    let d = Math.round(dmg * this.mods.dmgMul * this.dmgMul(o.kind) * (f.sunderT > 0 ? 1 + v(this.perks, 'sunder') / 100 : 1));
    const executed = cut && tierOf(this.perks, 'behead') >= 0 && f.kind !== 'dummy' && !isBoss(f) && f.inv <= 0 && f.hp < f.maxHp * v(this.perks, 'behead') / (f.elite ? 200 : 100);
    if (executed) d = f.hp + 1;
    const p = f.a.chest(), dir = f.pos.clone().sub(from).setY(0).normalize();
    // (act-40 用户：「打到boss残血剧情杀就直接来，不要变成半途格挡打半天空气」: no floor of blocked hits — the blow that takes him
    //  to a fifth of his life lands, and the scripted fall starts at once)
    let fallNow = false;
    if (this.prologue === 2 && isBoss(f) && !this.proFalling) { const floor = Math.ceil(f.maxHp * 0.2); if (f.hp - d <= floor) { d = Math.max(0, f.hp - floor); fallNow = true; } }
    const died = damageFoe(f, d, from, { knock, stagger, poiseDmg: o.kind === 'dart' ? d * 0.5 : o.heavy ? d * 1.8 : d });
    if (this.prologue === 2 && isBoss(f)) f.hp = Math.max(f.hp, Math.ceil(f.maxHp * 0.2));
    if (fallNow) after(0.25, () => void this.prologueFall());   // (the blow lands, a beat, then the scripted fall)
    if (heavyCut && !died && f.d.poise > 0 && f.st === 'stagger') f.dur += v(this.perks, 'bone');
    if (cut && !died && f.inv <= 0) { if (tierOf(this.perks, 'sunder') >= 0) f.sunderT = 3; if (tierOf(this.perks, 'bleed') >= 0 && f.kind !== 'dummy') { f.bleed = Math.min(5, f.bleed + 1); f.bleedT = 0; } }
    if (o.kind !== 'school') fxImpact(p, o.heavy ? 0xff6a3a : 0xfff0d0, o.kind === 'dart' ? 0.4 : o.heavy ? 1.3 : 0.75, { dir, chips: o.heavy ? [0xff5a3a, 0x2b3147] : undefined });
    // act-23 (用户：「砍上去要溅血才有感觉」): blood from the wound along the blade's way; more for the heavy blows and the killing one
    if (f.kind !== 'dummy' && o.kind !== 'school') { const n = o.kind === 'dart' ? 5 : o.heavy ? 28 : 16; blood.spray(p, dir, (died ? n + 20 : n) * (executed ? 2 : 1), o.heavy || died ? 1.35 : 1); this.fleshHit = true; }
    popPix(String(d), f.a.head().add(V3(R(-0.2, 0.2), 0.35, 0)), { color: o.heavy ? '#ff8a3a' : d >= 14 ? '#ffd060' : '#fff6e0', h: o.heavy ? 0.66 : 0.5, big: o.heavy, life: 0.9, rise: 0.9 });
    if (!died && o.heavy && knock >= 1.2 && this.launchable(f) && f.pos.y < 0.05) f.airV = Math.max(f.airV ?? 0, 2.2 + knock * 1.3);   // act-19: heavy blows throw the light foes
    if (died) this.killFoe(f, from);
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
    }
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
    this.feel(o.heavy, n); if (o.counter && n) { hitstop(0.14 * TUNE.hitstop); shake(0.3 * TUNE.shake); this.addIntent(); }
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
    trailSeg(o.a.clone().setY(1.0), o.b.clone().setY(1.0), o.col ?? 0xff7a4a, 0.3, { life: 0.3, bright: 2.2, spark: 0.6 });
    if (o.kind === 'dcut') trailSeg(o.a.clone().setY(0.55), o.b.clone().setY(0.55), 0xeaf8ff, 0.12, { life: 0.4, bright: 2.6, spark: 0.3 });
    // arrows along the lunge's path are cut too
    const cut = this.arrows.filter(a => { if (a.dead || a.friendly) return false; const t = Math.max(0, Math.min(1, a.p.clone().sub(o.a).setY(0).dot(ab) / L2)), q = o.a.clone().addScaledVector(ab, t); return Math.hypot(a.p.x - q.x, a.p.z - q.z) < o.r + 0.4; });
    this.deflect(cut, Math.atan2(ab.x, ab.z));
    this.feel(true, n); if (!n) cue('whoosh', 0.6);
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
    cue('parry', 1); cue('draw', 0.9); this.platform.vibrate('medium');
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
  /** the draw from the stance meets an attack about to land: 见切 now — the attack broken off, the attacker thrown, arrows sent back */
  private iaiCatch(win: number) {
    const t = this.threats(win); if (!t.foes.length && !t.arrows.length) return null;
    const near = t.foes.sort((a, b) => a.pos.distanceTo(this.hero.pos) - b.pos.distanceTo(this.hero.pos))[0];
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
    if (tierOf(this.perks, 'counter') >= 0 && h.alive) { h.hp = Math.min(h.maxHp, h.hp + v2(this.perks, 'counter')); this.hud.flask.heal({ hp: h.hp, maxHp: h.maxHp }); }
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
  private qteT = -1; private ultOn = false; private qteW!: THREE.Mesh;
  private startQte() {
    if (this.qteT >= 0 || this.ultOn) return;
    this.qteT = 0; slowmo(TUNE.qteTime * 1.3 + 0.2, 0.04); cue('timeSlow', 1);
  }
  private qteFrame(rdt: number) {
    if (this.qteT < 0) { this.hud.qte(null); this.qteW.visible = false; return; }
    this.qteT += rdt;
    const h = this.hero, k = this.qteT / TUNE.qteTime, win = k >= 0.72 && k <= 1.12;
    this.hud.qte(Math.min(1, k), win);
    this.qteW.visible = true; this.qteW.position.set(h.pos.x, 0.07, h.pos.z); this.qteW.scale.setScalar(0.9 + 2.6 * Math.max(0, 1 - k));
    (this.qteW.material as THREE.MeshBasicMaterial).color.setHex(win ? 0xfff0b0 : 0xffb040);
    const pressed = this.inp.b.attack.pressed;
    if (pressed) { this.inp.b.attack.pressed = false; h.clearInput(); }
    if (pressed && win) { this.qteT = -1; this.hud.qte(null); this.qteW.visible = false; void this.ult(); }
    else if (pressed || k > 1.2) { this.qteT = -1; this.hud.qte(null); this.qteW.visible = false; FX.slowmo = 0; cue('click', 0.5); }
  }
  /** 一刀: the hero flashes between every foe nearby (up to seven, nearest first along the way), then sheathes — everyone cut at once */
  private async ult() {
    const h = this.hero; this.ultOn = true; this.intent = 0; this.hud.intent = 0; FX.slowmo = 0; FX.hitstop = 0;
    h.forceFree(); h.inv = 5;
    const left = this.foes.filter(f => f.st !== 'dead' && f.pos.distanceTo(h.pos) < 11), targets: Foe[] = [];
    let at = h.pos.clone();
    while (left.length && targets.length < 7) { left.sort((a, b) => a.pos.distanceTo(at) - b.pos.distanceTo(at)); const f = left.shift()!; targets.push(f); at = f.pos.clone(); }
    cue('swishHeavy', 1); shake(0.2 * TUNE.shake);
    // 烟遁: the hero goes up in a burst of smoke (act-13 用户：「影分身的特效挺叼的，可以拿给别的技能」)
    const feet = h.pos.clone().setY(0);
    smokeBurst(feet, 1.0, 20, { yaw: h.a.yaw }); h.a.body.visible = false; fxRing(feet.clone().setY(0.06), 0xa0a8c0, 1.8, { life: 0.4 } as never); cue('whoosh', 0.9);
    await waitReal(0.14);
    // a shadow clone out of a puff beside each target, one after another, dashing in and cutting across it
    targets.forEach((f, i) => {
      after(i * 0.08, () => {
        if (f.st === 'dead') return;
        const dir = f.pos.clone().sub(feet).setY(0); if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1); dir.normalize();
        const side = V3(dir.z, 0, -dir.x).multiplyScalar(i % 2 ? 1 : -1);
        const at = f.pos.clone().addScaledVector(dir, -(f.d.r + 1.7)).addScaledVector(side, 0.7).setY(0); this.clamp(at, 0.3);
        smokeBurst(at, 0.6, 6, { size: 0.28, life: 0.7 });
        spawnClone(h.a, at, f.pos.clone(), Math.max(0.3, at.distanceTo(f.pos) - (f.d.r + 0.55)), () => {
          cloneCut(f.a.chest(), side.clone().multiplyScalar(-1), i % 2 ? 0xff7a5a : 0xff5a3a, 1.1, i % 2 === 0);
          fxSparks(f.a.chest(), 0xffffff, 10, 4); f.a.tint(0xffffff, 0.8); cue('impact', 0.8);
        });
      }, { real: true });
    });
    await waitReal(0.08 * targets.length + 0.6);
    // the hero steps back out of the smoke where it stood and sheathes; everyone the clones cut falls at once
    smokeBurst(feet, 0.6, 10, { size: 0.28, life: 0.6, yaw: h.a.yaw }); h.a.body.visible = true; cue('whoosh', 0.4);
    h.a.play(new Action('cast', 0.5, 0.4));
    await waitReal(0.2);
    for (const f of targets) if (f.st !== 'dead') this.hitFoe(f, TUNE.ultDmg, h.pos.clone(), { knock: 1.6, heavy: true, kind: 'ult' });
    hitstop(0.2); slowmo(0.5, 0.3); shake(0.6 * TUNE.shake); fxRing(h.pos.clone().setY(0.08), 0xfff0c0, 4, { life: 0.6 } as never); cue('ultSlash', 1.2); this.platform.vibrate('heavy');
    this.ultOn = false; h.inv = 0.5;
  }
  /** a batted arrow strikes a foe */
  private arrowHit(f: Foe, a: Arrow) {
    const from = a.p.clone().addScaledVector(a.v.clone().normalize(), -1);
    this.hitFoe(f, TUNE.deflectDmg, from, { knock: 1.2, heavy: true, kind: 'arrow' });
    fxSparks(a.p.clone(), 0xffd070, 16, 6); this.feel(true, 1);
  }
  /** the plunge lands: everything round the hero is hit and thrown outward; dust and a ring even on a miss */
  private slam(o: { at: THREE.Vector3; r: number; dmg: number; yaw: number }) {
    let n = 0;
    for (const f of this.foes.slice()) { if (f.st === 'dead' || f.pos.distanceTo(o.at) > o.r + f.d.r) continue; this.hitFoe(f, o.dmg, o.at, { knock: 1.3, heavy: true, kind: 'plunge' }); n++; }
    if (this.props) this.applyProps(this.props.hitCircle(o.at.x, o.at.z, o.r, { src: 'hero', heavy: true, dir: [Math.sin(o.yaw), Math.cos(o.yaw)] }, this.targets()));   // act-19
    fxRing(o.at.clone().setY(0.06), 0xffd8a0, o.r, { life: 0.4 } as never); dustBlocks(o.at.clone(), 12); this.leaves?.blast(o.at.x, o.at.z, o.r + 0.8, 5);
    fxSmoke(o.at.clone().setY(0.2), 0x8a7a6a, 8, { r: o.r * 0.6, spd: 2.4, up: 0.3, s: 0.45, life: 0.6 });
    if (n) this.feel(true, n); else { shake(0.2 * TUNE.shake); cue('impact', 0.7); }
    return n;
  }
  private killFoe(f: Foe, from: THREE.Vector3) {
    if (f.elite) this.eliteKills++; if (isBoss(f)) this.bossKilled = true;
    cue('bodyFall', 0.7);
    // act-23: a pool spreads under the body as it settles
    if (f.kind !== 'dummy') { const bx = f.pos.x, bz = f.pos.z, sz = isBoss(f) ? 2.0 : f.elite ? 1.4 : 1.05; after(0.45, () => blood.pool(bx, bz, sz)); cue('gore', isBoss(f) ? 1.3 : 1); }
    this.leaves?.blast(f.pos.x, f.pos.z, 1.3, 2.5);
    this.kills++;
    const boss = isBoss(f), elite = !!f.elite;
    void playDeath(f.a, { from, ratio: f.lastDmg / f.maxHp + (boss ? 0.5 : 0), boss }).then(() => { f.a.dispose(); });
    // copper coins: a few square-holed coins bounce out and fly to the hero (worth the foe's gold; elites ×3, the boss more)
    if (this.room >= 0 && f.kind !== 'dummy') { const total = boss ? 60 : f.d.gold * (elite ? 3 : 1), n = Math.min(10, total); this.coinsFx.drop(f.pos.clone(), n, Math.max(1, Math.round(total / n))); }
    if (tierOf(this.perks, 'drink') >= 0 && this.hero.alive) { this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + v(this.perks, 'drink')); this.hud.flask.heal({ hp: this.hero.hp, maxHp: this.hero.maxHp }); }
    const left = this.foes.filter(x => x.st !== 'dead').length;
    if (boss) { slowmo(1.1, 0.25); shake(0.6 * TUNE.shake); cue('win', 0.9); }
    if (!left && this.phase === 'fight') {
      const lastWave = this.wave >= (this.plan?.waves.length ?? 1) - 1;
      if (!boss) slowmo(lastWave ? 0.7 : 0.35, 0.3);
      if (lastWave) after(1.0, () => this.roomClear()); else { this.wave++; after(0.9, () => { if (this.phase === 'fight') { this.banner.show(`第 ${this.wave + 1} 波`, '', 0.9); this.spawnWave(); } }); }
    }
  }
  private hurtHero(dmg: number, from: THREE.Vector3, attacker?: Foe) { // wp/boons: melee source is explicit
    // the yard: nobody dies there (the flask fills back up first)
    if (this.phase === 'yard' && !this.hero.iframe && this.hero.hp - dmg <= 0) { this.hero.hp = this.hero.maxHp; this.hud.flask.heal({ hp: this.hero.hp, maxHp: this.hero.maxHp }); }
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
    this.phase = 'pick'; cue('stingClear', 1); audio.duckMusic(0.35, 3.2);
    this.banner.show('清场', '', 1.0, '#ffe6a0');
    await new Promise(r => after(0.9, () => r(null)));
    if (this.prologue) { this.openDoors(); return; }   // act-29: the prologue's road just goes on
    if (this.room >= RUN_ROOMS - 1) { if (seeOnce('ch1_boss_after')) { this.musicHold = 'bgm_afterkill'; void audio.playMusic('bgm_afterkill', 1.0); await this.talk(CHULEI_AFTER); saveProfile(); } this.end(true); return; }
    const rw = this.plan?.reward ?? null;
    if (rw?.k === 'coins') { this.coinsFx.drop(this.hero.pos.clone().add(V3(0, 0, -1.5)), 12, Math.round(rw.n / 12)); this.banner.show('铜钱', `${rw.n}`, 1.0, '#ffd24a'); }
    else if (rw?.k === 'heal') { this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + Math.round(this.hero.maxHp * 0.35)); this.hud.flask.heal({ hp: this.hero.hp, maxHp: this.hero.maxHp }); this.banner.show('回复', '三成五生命', 1.0, '#9aff9a'); await new Promise(r => after(0.8, () => r(null))); }
    else if (rw?.k === 'manual') await this.manualPick();
    else {
      await this.boonPick();
    }
    this.openDoors();
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
    const i = await this.cards.open(cards); const b = own[i]; upgradeBoon(this.perks, b.id); this.log.push(`sharpen ${b.id} ${this.perks.owned[b.id]}`);
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
    this.banner.show(b.name, b.desc.map(line => fillVals(line, b, tier)).join(''), 1.4, b.col);
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
    this.phase = 'leaving'; const d = this.doors[i], next = this.nextRooms[i];
    this.plan = next; const fromLocale = this.locale; this.locale = next.locale; if (this.prologue === 1) { this.prologue = 2; this.proFightT = 0; }
    const h = this.hero; h.vel.set(d.ex.dir[0], 0, d.ex.dir[1]).multiplyScalar(TUNE.heroSpeed * 0.8);
    WIPE.look = fromLocale === 'ninja_wilds' ? 'bamboo' : 'pillar';
    after(0.35, () => { void wipeTransit(() => { this.room++; this.buildRoom(false); }); });
  }
  private dead() {
    this.phase = 'dead'; this.justDied = true; this.bankRun(false); audio.stopMusic(1.4); cue('stingLose', 1); slowmo(1.2, 0.3); this.banner.show('败北', '', 1.6, '#ff6a5a');
    after(1.6, async () => {
      this.hud.on = false;
      await this.cards.open([returnCard(this.kills)]); // wp/boons: adapt non-boon cards and centralize their copy
      this.hud.on = true; void wipeTransit(() => this.enterYard());
    });
  }
  private end(win: boolean) {
    this.phase = 'end'; this.bankRun(win); audio.stopMusic(2.0); cue(win ? 'stingWin' : 'stingLose', 1);
    after(0.4, async () => {
      this.hud.on = false;
      await this.cards.open([{ boon: { id: win ? 'again' : 'retry', school: 'sr', name: win ? '黄巾残村' : '再来一次', desc: [win ? '渠帅伏诛' : '回练武场再出发', `斩了 ${this.kills} 个 · 点这里回练武场`], col: '#ffd070', glyph: BOONS.find(b => b.id === 'behead')!.glyph }, tier: 0 }]);
      this.hud.on = true; void wipeTransit(() => this.enterYard());
    });
  }
  // ------------------------------------------------------------ frame
  /** debug / captures: a fixed camera (__dh.cam([x,y,z],[lx,ly,lz],fov) / __dh.cam(null)) */
  camOverride: { base: THREE.Vector3; look: THREE.Vector3; fov: number } | null = null;
  private camPose() {
    if (this.camOverride) return { base: this.camOverride.base.clone(), look: this.camOverride.look.clone(), fov: this.camOverride.fov };
    // the yard's costume rack: the camera leans in (half the distance) so the models can be looked at
    const n = this.yard?.near ?? 0, k = 1 - 0.55 * n;
    const base = this.cam.clone().add(V3(0, TUNE.camH * k, TUNE.camD * k)), look = this.cam.clone().add(V3(0, 0.6 + 0.5 * n, 0));
    return { base, look, fov: TUNE.camFov };
  }
  private frame(dt: number, rdt: number) {
    if (PAUSE.on) return;   // the pause menu runs on its own (real time); the world gets nothing
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
      if (this.phase === 'talk') { this.hero.a.update(dt); for (const f of this.foes) f.a.update(dt); for (const n of this.npcs) n.a.update(dt); this.leaves?.update(dt, this.cam.x, this.cam.z); this.gates?.update(dt); }
      for (const f of this.puppets) if (this.phase === 'talk' && !f.a.root.userData.still) f.a.update(dt);   // (act-30: the dead stay still)
      this.hud.update(rdt, this.inp, []); this.L.on = true; return;
    }
    // act-29: the prologue's temple — about half a minute in, his blow ends it whatever her blood
    if (this.prologue === 2 && this.phase === 'fight' && !this.proFalling && this.foes.some(f => isBoss(f))) { this.proFightT += dt; if (this.proFightT > 60) void this.prologueFall(); }   // (a fallback only: the fifth of his life is the cue)
    if (this.botOn) this.bot();
    // the model page plays 不见刀's QTE by itself (press as the ring closes)
    else if (this.labOn && this.qteT >= 0) { const k = this.qteT / TUNE.qteTime, b = this.inp.b.attack, on = k > 0.85 && k < 1.0; b.pressed = on && !b.down; b.down = on; }
    const h = this.hero; if (!h) return;
    const busy = this.cards.on || this.phase === 'leaving' || this.ultOn;
    this.qteFrame(rdt); this.parryCd -= rdt;
    if (busy) { for (const b of Object.values(this.inp.b)) { b.pressed = false; b.down = false; b.held = 0; } this.inp.move.x = this.inp.move.y = 0; }
    if (this.phase === 'intro') { this.introT += dt; this.inp.move.x = 0; this.inp.move.y = this.introT < 0.5 ? 0.7 : 0; for (const b of Object.values(this.inp.b)) { b.pressed = false; b.down = false; b.held = 0; } }
    h.update(dt, this.inp, this.heroWorld);
    this.hud.setAim(h.aiming ? { x: h.aimDir.x, y: -h.aimDir.z } : null);   // act-29: the dart button leans to the aim
    if (h.aiming) { const pv = h.aimPreview(this.heroWorld), L = TUNE.dartRange, al = this.aimLine;
      al.visible = true; al.position.set(h.pos.x, 0.07, h.pos.z); al.rotation.y = Math.atan2(pv.dir.x, pv.dir.z); al.scale.set(1, 1, L);
      const cap = al.getObjectByName('cap')!; cap.scale.set(1, 1, 1 / L); (al.material as THREE.MeshBasicMaterial).color.set(pv.onFoe ? 0xffd27a : 0xe8eeff); }
    else this.aimLine.visible = false;
    h.a.update(dt); for (const a of this.lineupActors) a.update(dt);
    const fw = this.foeWorld; fw.heroPos.copy(h.pos); fw.heroAlive = h.alive && (this.phase === 'fight' || this.phase === 'yard'); fw.heroY = h.y; fw.heroDodge = h.dodgeWin;
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
    for (const f of this.foes) { if (!this.ultOn) updateFoe(f, fw, dt); f.a.update(dt); }
    this.separate();   // act-37: bodies don't pass through each other
    for (let i = this.foes.length - 1; i >= 0; i--) if (this.foes[i].st === 'dead' && !this.foes[i].a.root.parent) this.foes.splice(i, 1);
    for (const a of this.arrows) a.update(dt, fw);
    for (let i = this.arrows.length - 1; i >= 0; i--) if (this.arrows[i].dead) this.arrows.splice(i, 1);
    for (const w of this.waves) {
      // the light flies on real time: the hit-stop of the blow that sent it freezes the world, not the light leaving it
      const live = w.live, p0 = w.step(rdt); if (!live) continue;
      for (const f of this.foes) if (f.st !== 'dead' && !w.hit.has(f.uid) && w.sweeps(p0, f.pos, f.d.r)) {
        w.hit.add(f.uid); this.hitFoe(f, 12 * v(this.perks, 'bladeWind') / 100, p0, { knock: 0.8, heavy: false, kind: 'wind' });
        // the light cuts through: a short white bar across the body and a spray of jade sparks
        const c = f.a.chest(), side = V3(w.fwd.z, 0, -w.fwd.x);
        trailSeg(c.clone().addScaledVector(side, -0.6).add(V3(0, 0.25, 0)), c.clone().addScaledVector(side, 0.6).add(V3(0, -0.15, 0)), 0xe8fff2, 0.12, { life: 0.16, bright: 3, spark: 0.6 });
        fxSparks(c, 0xc8ffe0, 12, 5); this.feel(false, 1);
      }
      // arrows in its way are cut out of the air
      for (const a of this.arrows) if (!a.dead && !a.friendly && w.sweeps(p0, a.p, 0.2)) { fxSparks(a.p.clone(), 0xe8fff2, 8, 4); a.kill(); }
    }
    this.waves = this.waves.filter(w => !w.dead);
    // darts: fly straight; the first foe in the way takes it (small damage, no stagger); walls stop them
    for (const d of this.darts) {
      if (d.stuck) { if (!d.ride(dt) || (d.stuck as Foe).st === 'dead') d.stop(false); continue; }
      const p0 = d.step(dt);
      if (this.props) { const q = d.p, hit = this.props.logic.near(q.x, q.z, 0.12).find(pp => pp.state === 'idle' || pp.kind === 'pillar'); if (hit && q.y < (hit.kind === 'pillar' ? 2.8 : 1.1)) { if (hit.state === 'idle') this.applyProps(this.props.logic.hit(hit, { src: 'dart', dir: [d.p.x - p0.x, d.p.z - p0.z] }, this.targets())); d.stop(); continue; } }
      for (const f of this.foes) {
        if (f.st === 'dead' || d.p.y > 2.4) continue;
        const ab = d.p.clone().sub(p0).setY(0), L2 = Math.max(1e-6, ab.lengthSq()), t = Math.max(0, Math.min(1, f.pos.clone().sub(p0).setY(0).dot(ab) / L2)), q = p0.clone().addScaledVector(ab, t);
        if (Math.hypot(f.pos.x - q.x, f.pos.z - q.z) < f.d.r + 0.2) { this.hitFoe(f, d.dmg, p0, { knock: 0.12, heavy: false, kind: 'dart', stagger: 0 }); cue('dartHit', 0.7); if (d.link && d.link !== this.qiVolley) { this.qiVolley = d.link; this.hero.gainQi(QI_LINK); } if ((f.st as string) !== 'dead') d.stickIn(f, TUNE.chaseWin); else d.stop(); break; }
      }
      if (d.dead || d.stuck) continue;
      const q = d.p.clone(); this.clamp(q, 0); if (q.distanceTo(d.p) > 0.3 || d.life <= 0 || d.p.y < 0.05) d.stop(d.life > 0);
    }
    this.darts = this.darts.filter(d => !d.dead);
    this.hitArcs.update(rdt, h.pos);
    if (this.props && this.phase !== 'pick') this.applyProps(this.props.update(dt, this.targets()), true);   // act-19: fuses, fires, the falling pillars
    this.gates?.update(dt);
    // a rainy room: now and then lightning lights everything for a beat, the thunder a moment later
    tickSkyFlash(rdt);
    if (this.spec?.weather === 'rain' && (this.phase as string) !== 'opening') { this.lightningT -= rdt; if (this.lightningT <= 0) { this.lightningT = 7 + Math.random() * 9; flashSky(1); after(0.14, () => flashSky(0.7)); const d = 0.35 + Math.random() * 0.8; after(d, () => cue('thunder', 0.45)); } }
    if (this.leaves) {
      this.leaves.update(dt, this.cam.x, this.cam.z);
      blood.update(dt);
      if (h.st === 'dash' && !h.airborne) { const speed = Math.hypot(h.vel.x, h.vel.z) || 1; this.leaves.kick(h.pos.x, h.pos.z, 0.8, h.vel.x / speed, h.vel.z / speed, 3.4); }
      // the guiding wind: every few seconds a gust from the hero's feet toward each open gate
      if (this.phase === 'doors' && this.gates) { this.gustT -= dt; if (this.gustT <= 0) { this.gustT = 3.2; for (const t of this.gates.targets()) this.leaves.gust(h.pos.x, h.pos.z, t.x, t.z); cue('exitChime', 0.25); } }
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
      const p = h.pos, l = d.ex.lane, out = d.ex.id === 'left' ? p.x < l.x0 + 2.6 : d.ex.id === 'right' ? p.x > l.x1 - 2.6 : p.z < PLAY.z0 - 1.2;
      if (this.gates?.onGlow(p, d.ex.id) || (out && p.x > l.x0 - 0.4 && p.x < l.x1 + 0.4 && p.z > l.z0 - (d.ex.id === 'back' ? 6 : 0.4) && p.z < l.z1 + 0.4)) this.leave(i);
    });
    // the camera: follows the hero with a little lead, held inside the room
    // the lead follows the run, capped at running speed (a dash or a knock-back no longer throws the view forward)
    const vel = h.vel.clone().setY(0), vl = vel.length(); if (vl > TUNE.heroSpeed) vel.multiplyScalar(TUNE.heroSpeed / vl);
    const lead = vel.multiplyScalar(TUNE.camLead), want = h.pos.clone().add(lead);
    // enemies come from the back of the room: the view sits a little ahead of the hero
    // held inside the room: 2.7 m in from the side edges, 2 m from the back, 3.2 m from the front (on the 2x stage it roams much more)
    const nr = this.yard?.near ?? 0, xc = (PLAY.x0 + PLAY.x1) / 2, xr = (PLAY.x1 - PLAY.x0) / 2 - 2.7 + 1.0 * nr;
    want.z -= 0.9 * (1 - nr); want.x = Math.max(xc - xr, Math.min(xc + xr, want.x)); want.z = Math.max(PLAY.z0 + 2.0, Math.min(PLAY.z1 - 3.2, want.z)); want.y = 0;
    this.cam.lerp(want, 1 - Math.exp(-5 * rdt)); followShadow(this.cam.x, this.cam.z);
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
    if (h.fullT > 0.34) { fxRing(h.pos.clone().setY(0.08), 0xffe7a0, 1.3, { life: 0.3 } as never); shake(0.06 * TUNE.shake); }
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
    let si = 0;
    for (const f of this.foes) {
      if (f.st === 'dead' || f.kind === 'dummy') continue;
      let m = this.shadows[si]; if (!m) { m = contactShadow(); scene.add(m); this.shadows.push(m); }
      m.visible = true; m.position.set(f.pos.x, 0.03, f.pos.z); m.scale.setScalar(f.d.r * 1.55); si++;
    }
    for (; si < this.shadows.length; si++) this.shadows[si].visible = false;
    // HUD
    const B = this.hud.btns; void B;
    // the dart button shows no cool-down (a third of a second would only flicker)
    // the dart button: dark and sinking while the three reload; the lamps show the darts left
    this.hud.setCooldowns({ attack: 0, jump: 0, dash: Math.max(0, h.dashCd / (TUNE.dashCd * (1 - v2(this.perks, 'evade') / 100))), special: h.dartReload > 0 ? h.dartReload / TUNE.dartReload : 0 });
    this.hud.setPips('special', h.dartAmmo, TUNE.dartCharges);
    // 11-17 气: the yard (试剑坪) fills it back by itself (practise 破势 without building it first)
    if (this.phase === 'yard' && h.st !== 'charge') h.qi = Math.min(Hero.QI_MAX, h.qi + rdt * 1.5);
    this.hud.setQi(h.qi, Hero.QI_MAX, h.st === 'charge');
    if (h.qiDenied) { h.qiDenied = false; this.hud.denyAttack(); }
    if (h.exhaled) { h.exhaled = false; const at = h.a.head().add(h.a.fwd().multiplyScalar(0.25)); fxSmoke(at, 0xe6eef2, 12, { r: 0.12, spd: 1.7, up: 0.6, s: 0.24, life: 0.8 }); fxRing(h.pos.clone().setY(0.06), 0xb8a888, 0.9, { life: 0.3 } as never); }
    // the move links open right now, shown on the buttons (act-18): 追影 > 穿风斩 > 下劈 > 反击 on the cut button
    { const fighting = this.phase === 'fight' || this.phase === 'yard', chase = fighting && !!h.moves.chase && !!this.chaseTarget();
      const atk = this.npcNear && !this.noTalk ? 'talk' : !fighting ? null : chase ? 'chase' : h.canDashCut ? 'dcut' : h.canKeep ? 'keep' : h.canPause ? 'pause' : (h.st === 'air' && h.airborne) ? 'plunge' : h.counterT > 0 ? 'counter' : null;
      const hints = { attack: atk, special: !fighting ? null : h.canBackDart ? 'back' : h.canCutDart ? 'cdart' : null, jump: !fighting ? null : h.canLaunch ? 'launch' : h.canKick ? 'kick' : h.canDoubleJump ? 'dbl' : null } as const;
      this.hud.setHints(hints); this.teach(hints); }
    this.hud.heroAt.copy(h.pos);
    this.hud.update(rdt, this.inp, this.foes); this.cards.update(rdt); this.banner.update(rdt);
    this.L.on = true;
  }
  // ------------------------------------------------------------ input
  private pointer(type: string, id: number, x: number, y: number) {
    if (this.pause.on) { this.pause.pointer(type, x, y); return; }
    if (this.phase === 'title') { titlePointer(type, x, y); return; }
    if (this.timeline.on) { this.timeline.pointer(type); return; }
    if (this.dialogue.on) { if (type === 'down') this.dialogue.advance(); return; }
    if (this.cards.on) { this.cards.pointer(type, x, y); return; }
    this.hud.pointer(type, id, x, y, this.inp);
  }
  /** the UI's skin: 漆器 → 竹简 → 铁器 (U key, the tuning panel, __dh.skin(id)) */
  cycleSkin(to?: SkinId) {
    const next = to ?? SKINS[(SKINS.indexOf(SKIN.id) + 1) % SKINS.length]; setSkin(next);
    this.hud.reskin(); this.banner.dispose(); this.banner = new SkinBanner(this.L, next, () => this.hud.bossOn);
    this.banner.show(SKIN_NAME[next], '界面风格 · U 键或调参面板切换', 1.4);
  }
  private key(e: KeyboardEvent) {
    if (this.timeline.on && e.key === 'Escape') { this.timeline.key(true); return; }
    if (e.key === 'Escape' && !e.repeat && this.canPause()) { e.preventDefault(); this.pauseGame(); e.stopImmediatePropagation(); return; }   // (the menu must not take the same Esc as its 返回)
    if (this.dialogue.on) { if (!e.repeat && ['Enter', ' ', 'j', 'J'].includes(e.key)) { e.preventDefault(); this.dialogue.advance(); } return; }
    if (!this.cards.on) return;
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
    if (this.cards.on) { if (n.up || n.left) this.cards.key('left'); else if (n.down || n.right) this.cards.key('right'); else if (n.ok) this.cards.key('ok'); return; }
    if (n.start && this.canPause()) this.pauseGame();
  }
  /** the world can stand still here: walking about or fighting (not the start screen, a cutscene, a conversation, the cards, a wipe) */
  canPause() {
    return !this.pause.on && !this.labOn && !this.cards.on && !this.ultOn && !this.dialogue.on && !this.timeline.on && (['yard', 'intro', 'fight', 'doors'] as Phase[]).includes(this.phase);
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
  // ------------------------------------------------------------ a bot (captures / smoke tests)
  private botT = 0; private cardT = 0; private botStuckT = 0; private botLast = V3(); private botUnstick = 0; private botSide = 1;
  /** the bot stays in the yard and spars (captures of the yard) instead of walking out */
  botStay = false;
  private botYard() { return this.botStay; }
  private bot() {
    const h = this.hero, I = this.inp; if (!h) return;
    if (this.qteT >= 0) { const k = this.qteT / TUNE.qteTime; const b = I.b.attack; const on = k > 0.85 && k < 1.0; b.pressed = on && !b.down; b.down = on; return; }
    if (this.cards.on) { this.cardT += clock.rdt; if (this.cardT > 1.2) { this.cardT = 0; this.cards.key('ok'); } return; } else this.cardT = 0;
    const live = this.foes.filter(f => f.st !== 'dead' && f.kind !== 'dummy');
    const set = (n: 'attack' | 'dash' | 'special' | 'jump', on: boolean) => { const b = I.b[n]; b.pressed = on && !b.down; b.down = on; b.held = on ? b.held + clock.rdt : 0; };
    if ((this.phase === 'doors' || this.phase === 'yard') && this.doors.length && !(this.phase === 'yard' && this.botYard())) {
      // act-19: follow the road's points in turn (the gate's mouth, through the gate, out) — a straight line ran into the wall
      const wk = this.doors[0].ex.walk; let wi = this.botWp; while (wi < wk.length - 1 && Math.hypot(wk[wi][0] - h.pos.x, wk[wi][1] - h.pos.z) < 1.0) wi++;
      this.botWp = wi;
      const d = wk[wi]; const v = V3(d[0] - h.pos.x, 0, d[1] - h.pos.z).normalize();
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
    if (!live.length) { I.move.x = I.move.y = 0; set('attack', false); return; }
    const near = live.slice().sort((a, b) => a.pos.distanceTo(h.pos) - b.pos.distanceTo(h.pos))[0], d = near.pos.clone().sub(h.pos).setY(0), l = d.length();
    // a dog's lunge or the chief's slam aimed here: jump it (and come down cutting); other blows: dash away
    const low = live.some(f => f.st === 'windup' && f.t / f.dur > 0.7 && lowAttack(f) /* wp/foes */ && f.pos.distanceTo(h.pos) < 6);
    if (low && !h.airborne) { set('jump', true); set('attack', false); return; }
    set('jump', false);
    if (h.airborne) { set('attack', h.vy < 0 && l < 2.5); return; }
    // in a dash: a cut through if someone is ahead, darts back otherwise
    if (h.st === 'dash') { const ahead = d.clone().normalize().dot(h.a.fwd().setY(0).normalize()) > 0.7 && l < 4; set('attack', ahead); set('special', !ahead); return; }
    // a dart is sticking in someone a way off: follow it
    if (this.chaseTarget() && l > 2.2) { set('attack', true); set('special', false); return; }
    const threat = live.some(f => f.st === 'windup' && f.t / f.dur > 0.6 && f.pos.distanceTo(h.pos) < 4.5);
    if (threat && h.dashCd <= 0) { const away = d.clone().normalize().multiplyScalar(-1); I.move.x = away.z; I.move.y = away.x; set('dash', true); set('attack', false); return; }
    set('dash', false);
    // darts while closing in on someone a few metres off
    set('special', l > 3.2 && l < 8.5);
    if (l > 1.6) { I.move.x = d.x / l; I.move.y = -d.z / l; set('attack', false); }
    else { I.move.x = d.x / l * 0.2; I.move.y = -d.z / l * 0.2; this.botT += clock.rdt; set('attack', this.botT % 0.3 < 0.12); }
    void FX;
  }
}
