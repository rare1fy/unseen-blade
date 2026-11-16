// 动作原型（docs: CLAUDE.md「动作原型」、docs/act/DESIGN.md）：哈迪斯式的一间间屋子。每间屋 = 一张拼装的日本场景（asm），战斗区就是屋子；
// 敌人分两波从边上出来；清场 → 三选一秘传 → 屋子边上的路口立起高札（写着下一间的地名和清完给什么）→ 自己走进路口 → 一丛竹子
// （或一根木柱）从镜头前扫过，换到下一间。三间屋，第三间是山贼头目。
// 打开游戏先到练武场（yard.ts：木人桩、召唤石板、换装木台），走进后面的「出发」路口开始一局；死了或打完回练武场。
// 砍飞的箭：方向在出刀朝向左右 75° 里随机、附近有敌人就偏过去；砍中那一下顿帧 + 闪光 + 短慢放（用户：「这种属于高光操作，应该要有顿帧」）。
import * as THREE from 'three';
import { V3, onUpdate, R, scene } from '../engine/world';
import { hitstop, shake, slowmo, after, clock, FX, waitReal } from '../engine/clock';
import { shot } from '../director';
import { fxImpact, fxSparks, fxSmoke, fxRing, trailSeg } from '../fx/fx';
import { fxAfterimage } from '../fx/skillFx';
import { popPix } from '../v2/pix';
import { playDeath } from '../v2/death';
import { UiLayer } from '../ui3d/layer';
import { Overlay } from '../v2/overlay';
import { SkinBanner, SKIN, SKINS, SKIN_NAME, setSkin, type SkinId } from './skin';
import { showStage, type Stage } from '../scenes/stage';
import { PLAY } from '../scenes/props';
import { addLocales, REGISTRY, LOCALES } from '../asm/registry';
import { NINJA_LOCALES } from '../asm/ninja';
import { HANMO_LOCALES } from '../asm/hanmo';
import { assemble, mirrorLayout } from '../asm/assemble';
import { pickSpec } from '../asm/pick';
import { exitInfo, withExits, type ExitId, type ExitInfo } from '../asm/exits';
import type { Layout, Spec, Report } from '../asm/types';
import { wipeTransit, WIPE } from '../scenes/transWipe';
import type { RouteOpt } from '../../core/v2/ronin/chapter';
import { cue } from '../../audio/cues';
import { audio } from '../../audio/audio';
import type { Platform } from '../../platform/index';
import { dh } from '../../debug/dh';
import { Input } from './input';
import { ActHud } from './hud';
import { CardPick } from './cards';
import { Hero, type HeroWorld } from './hero';
import { interruptFoe } from './enemy';
import { inside } from './tele';
import { spawnFoe, updateFoe, damageFoe, type Foe, type FoeWorld, type EKind, Arrow } from './enemy';
import { EDEFS, isBoss, lowAttack } from './enemy';   // wp/foes: the boss bar / banner / death and the bot's jump read these
import { BOONS, applyBoon, newPerks, type Perks, type Boon } from './boons';
import { TUNE } from './tune';
import { installActTune } from './tunePanel';
import { HEROES, RACK, motionOf } from './ninjaAct';
import { Yard, makeSign, SPAWN_AT } from './yard';
import type { ModelDef } from '../bestiary/models';
import { dustBlocks, spawnClone, smokeBurst, cut as cloneCut } from '../kyoto/ninja_fx';
import { Dart, BladeWave } from './missiles';
import { RUN_ROOMS, ROOM_INFO, SCHOOL_NAME, firstRoom, doorsFrom, kindOr, isBossKind, type RoomPlan, type RoomType } from './run';
import { Stations, type Station } from './stations';
import { Coins } from './coins';
import { runBoard } from './runBoard';
import { HitArcs } from './hitArc';
import { PX, setPixel } from '../look/pixel';
import { VIBE, vibeSupport } from '../../platform/index';
/** the perks the hero's world reads while the run is on (kept in step each frame) */
const SHOW_PERKS = { darts3: false };
import { BattleActor } from '../bestiary/battle';
import { CELL } from '../bestiary/kit';
import { Action } from '../actors/rig';

addLocales(NINJA_LOCALES); addLocales(HANMO_LOCALES);

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
type Phase = 'intro' | 'fight' | 'pick' | 'doors' | 'leaving' | 'dead' | 'end' | 'yard';
/** the costume the player last wore (kept in the browser; the first time: the 斗笠 swordsman) */
function savedHero(): ModelDef {
  let id = ''; try { id = localStorage.getItem('act.hero4') ?? ''; } catch { /* storage blocked */ }
  const q = typeof location !== 'undefined' ? /[?&#]hero=([a-z_]+)/.exec(location.href)?.[1] : undefined;
  return HEROES.find(d => d.id === (q ?? id)) ?? HEROES[0];
}

export class ActShow {
  L = new UiLayer(); ov = new Overlay(); inp = new Input(); hud: ActHud; cards: CardPick; banner: SkinBanner;
  stage: Stage | null = null; hero!: Hero; foes: Foe[] = []; arrows: Arrow[] = []; waves: BladeWave[] = []; darts: Dart[] = []; /** darts thrown so far (tests) */ dartsThrown = 0;
  room = 0; wave = 0; phase: Phase = 'intro'; perks: Perks = newPerks();
  /** act-17: this room's plan, the roads out of it, the kinds of room seen this run, the purse */
  private plan: RoomPlan | null = null; private nextRooms: RoomPlan[] = []; private visited: RoomType[] = []; coins = 0;
  private coinsFx = new Coins(); private stations: Stations | null = null; private hitArcs = new HitArcs();
  /** __dh.scene: the spec overrides for a fight-less view of one place; the last assembler report */
  private viewSpec: Partial<Spec> | null = null; private lastReport: Report | null = null;
  private spec: Spec | null = null; private layout: Layout | null = null; private doors: Array<{ ex: ExitInfo; g: THREE.Group; lift: number }> = []; private locale = 'ninja_wilds';
  private cam = V3(0, 0, 0); private dashHit = new Set<number>(); private lastSt = ''; private dashEdgeT = 0; private recent: Spec[] = [];
  botOn = false; kills = 0; log: string[] = []; private introT = 0; private audioOn = false; private hinted = false;
  /** the training yard (room −1) and the costume on the hero */
  yard: Yard | null = null; wearing: ModelDef = savedHero(); private lineupActors: BattleActor[] = [];
  private ring!: THREE.Mesh; private ringK = -1; private sparkT = 0; private shadows: THREE.Mesh[] = []; private exitSign: THREE.Group | null = null; private blob: THREE.Mesh;
  constructor(private platform: Platform) {
    this.hud = new ActHud(this.L); this.cards = new CardPick(this.L); this.banner = new SkinBanner(this.L, SKIN.id);
    platform.onPointer(ev => this.pointer(ev.type, (ev as { id?: number }).id ?? 0, ev.x, ev.y));
    platform.onResize(() => this.layout2());
    if (typeof window !== 'undefined') window.addEventListener('keydown', e => this.key(e));
    onUpdate((dt, rdt) => this.frame(dt, rdt));
    this.layout2();
    installActTune([{ label: () => `界面风格：${SKIN_NAME[SKIN.id]}（点这里换）`, run: () => this.cycleSkin() },
      // act-15 用户：「我浏览器玩没有震动诶」 — a switch, a test, and what this device supports
      { label: () => `震动：${VIBE.on ? '开' : '关'}（${({ api: '这台设备支持', ios: 'iPhone：用系统触感，iOS 18 起才有', none: '这个浏览器不支持' } as const)[vibeSupport()]}）`, run: () => { VIBE.on = !VIBE.on; try { localStorage.setItem('ub.vibe', VIBE.on ? '1' : '0'); } catch { /* private mode */ } } },
      { label: () => '试一下震动', run: () => { const was = VIBE.on; VIBE.on = true; this.platform.vibrate('heavy'); VIBE.on = was; } },
      // act-14 用户：「我要2x，然后调试面板给我一个切换这个的功能」 — 2x → 3x → off → 1x, remembered on this device
      { label: () => `像素：${PX.on ? PX.size + 'x' : '关'}（点这里换）`, run: () => { const order = ['2', '3', 'off', '1'], cur = PX.on ? String(PX.size) : 'off', nx = order[(order.indexOf(cur) + 1) % order.length]; if (nx === 'off') setPixel(false); else setPixel(true, +nx); try { localStorage.setItem('ub.px', nx); } catch { /* private mode */ } } }]);
    if (typeof window !== 'undefined') window.addEventListener('keydown', e => { if ((e.key === 'u' || e.key === 'U') && !this.cards.on) this.cycleSkin(); });
    dh.add({ act: () => this, bot: (on = true) => { this.botOn = on; }, run: () => this.startRun(), yard: () => this.enterYard(), wear: (id: string) => { const d = HEROES.find(h => h.id === id); if (d) this.wear(d); },
      skin: (id: SkinId) => this.cycleSkin(id),
      cardsDemo: () => { void this.cards.open(BOONS.slice(0, 3)); },
      intent: (n = 3) => { this.intent = Math.max(0, Math.min(3, n)); this.hud.intent = this.intent; },
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
    // the charge ring under the hero: a gold arc that grows round with the charge
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.74, 48, 1, 0, 0.01).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffc848, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }));
    this.ring.renderOrder = 3; this.ring.visible = false; scene.add(this.ring);
    this.qteW = new THREE.Mesh(new THREE.RingGeometry(0.92, 1.0, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    this.qteW.renderOrder = 3; this.qteW.visible = false; scene.add(this.qteW);
    // browsers only let sound start after a touch or a key: the first input starts the music
    const unlock = () => { if (this.audioOn) return; this.audioOn = true; audio.unlock().then(() => audio.playMusic('bgm_battle', 0.55)).catch(() => { this.audioOn = false; }); };
    if (typeof window !== 'undefined') { window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock); }
    this.start();
  }
  layout2() {
    const s = this.platform.canvasSize(), dpr = Math.min(this.platform.dpr(), 2);
    this.L.resize(s.w, s.h, dpr); this.ov.resize(s.w, s.h, dpr); this.hud.layout(s.w, s.h);
  }
  // ------------------------------------------------------------ rooms
  start() {
    if (typeof location !== 'undefined' && /[?&#]run\b/.test(location.href)) this.startRun(); else this.enterYard();
  }
  /** the training yard: dummies, summon slabs, the costume rack, the way out to a run */
  enterYard() {
    this.intent = 0; this.hud.intent = 0;
    this.perks = newPerks(); this.room = -1; this.kills = 0; this.locale = 'ninja_wilds'; this.recent = []; this.plan = null; this.taken.clear();
    TUNE.heroHp = 100; this.buildRoom(true);
  }
  startRun() {
    this.intent = 0; this.hud.intent = 0;
    this.perks = newPerks(); this.room = 0; this.kills = 0; this.recent = []; this.taken.clear();
    this.plan = firstRoom(Math.random); this.visited = []; this.coins = 0; this.locale = this.plan.locale;
    TUNE.heroHp = 100; this.buildRoom(true);
  }
  /** put on another costume (the rack, or __dh.wear) and remember it */
  private wear(d: ModelDef) {
    this.wearing = d; try { localStorage.setItem('act.hero4', d.id); } catch { /* storage blocked */ }
    if (this.hero) this.hero.setModel(d);
  }
  private buildRoom(first: boolean) {
    for (const f of this.foes) f.a.dispose(); this.foes.length = 0; for (const a of this.arrows) a.kill(); this.arrows.length = 0; for (const w of this.waves) w.kill(); this.waves = []; for (const d of this.darts) d.kill(); this.darts = [];
    for (const d of this.doors) d.g.parent?.remove(d.g); this.doors = []; this.stations?.dispose(); this.stations = null; this.coinsFx.clear();
    this.yard?.dispose(); this.yard = null; this.exitSign?.parent?.remove(this.exitSign); this.exitSign = null;
    const hp = first || !this.hero ? TUNE.heroHp + this.perks.hpUp : this.hero.hp, maxHp = TUNE.heroHp + this.perks.hpUp;
    this.hero?.a.dispose();
    const isYard = this.room < 0;
    if (!isYard && this.plan && !this.viewSpec) this.visited.push(this.plan.type);
    this.nextRooms = !isYard && this.plan && !this.viewSpec ? doorsFrom(this.room, this.visited, Math.random) : [];
    const seed = (Date.now() % 100000) + this.room * 977;
    const base = pickSpec(seed, Object.values(REGISTRY.locales), REGISTRY.layouts, this.recent, { season: 'autumn', locale: this.locale });
    const spec: Spec = isYard ? { ...base, time: 'dusk', weather: 'clear', exits: ['back'] }
      : { ...base, time: this.room === 0 ? 'dusk' : base.time, weather: this.plan?.type === 'boss' ? 'clear' : base.weather, exits: this.nextRooms.length > 1 ? ['left', 'right'] : this.nextRooms.length ? ['back'] : [] };
    if (this.viewSpec) Object.assign(spec, this.viewSpec, { exits: [] });
    this.recent.push(spec); this.spec = spec;
    const { def, report } = assemble(spec, REGISTRY); this.lastReport = report;
    const lb = REGISTRY.layouts[spec.layout] ?? Object.values(LOCALES).flatMap(l => l.extraLayouts ?? []).find(l => l.id === spec.layout)!;
    this.layout = withExits(spec.mirror ? mirrorLayout(lb) : lb, spec.exits ?? []);
    this.stage = showStage({ ...def, build(c) { try { def.build(c); } catch (e) { console.error('[act] assembly failed', e); } } }, { combat: true });
    this.hero = new Hero(V3(0, 0, isYard ? 3.2 : 5.0), this.wearing); this.hero.hp = Math.min(hp, maxHp); this.hero.maxHp = maxHp;
    this.hero.a.yaw = Math.PI;
    this.hud.flask.set({ hp: this.hero.hp, maxHp });
    this.cam.set(0, 0, 3); shot('act', () => this.camPose(), { cut: true, speed: 8 });
    if (isYard) { this.openYard(); return; }
    if (this.viewSpec) { this.phase = 'yard'; this.log.push(`view ${spec.locale} ${spec.layout} ${spec.time}`); return; }
    this.phase = 'intro'; this.wave = 0;
    const name = LOCALES[this.locale]?.name ?? '';
    // the very first room: the controls once, in the banner (no key hints on screen afterwards)
    const hint = !this.hinted ? (this.inp.lastDevice === 'touch' && 'ontouchstart' in globalThis ? '左边拖动走 · 斩 / 按住蓄力 · 冲 · 跳 · 镖' : 'WASD 走 · J 斩（按住蓄力）· 空格 跳 · K 冲刺 · L 飞镖') : '';
    this.hinted = true;
    const info = ROOM_INFO[this.plan?.type ?? 'fight'];
    this.banner.show(`第 ${'一二三四五六'[this.room] ?? this.room + 1} 间 · ${info.name}`, hint || `${name} · ${info.line}`, hint ? 3.2 : 1.6);
    // the rooms without a fight: the stations stand ready and the roads are open at once
    if (this.plan && (this.plan.type === 'shop' || this.plan.type === 'rest' || this.plan.type === 'boon')) {
      this.stations = new Stations(this.stage!.root);
      if (this.plan.type === 'shop') this.stations.shop(PRICES); else if (this.plan.type === 'rest') this.stations.rest(); else this.stations.scroll();
      this.log.push(`room ${this.room} ${this.plan.type} ${spec.locale}`);
      this.openDoors(true); return;
    }
    // walk in from the front of the room, then the first wave
    const h = this.hero; this.introT = 0;
    after(1.1, () => { if (this.hero === h && this.phase === 'intro') { this.phase = 'fight'; this.spawnWave(); } });
    this.log.push(`room ${this.room} ${spec.locale} ${spec.layout} ${spec.time}`);
  }
  private openYard() {
    this.phase = 'yard'; this.wave = 0;
    const lane = exitInfo(this.layout!, 'back').lane;
    this.yard = new Yard(this.stage!.root, RACK.some(d => d.id === this.wearing.id) ? RACK : [...RACK.slice(0, 5), this.wearing], this.wearing, [lane.x0, lane.x1]);
    for (const p of [V3(-2.4, 0, -0.6), V3(0, 0, -1.5), V3(2.4, 0, -0.6)]) { const f = spawnFoe('dummy', p, V3(p.x * 0.3, 0, 4)); f.st = 'move'; this.foes.push(f); }
    // the way out: a sign at the back road
    const ex = exitInfo(this.layout!, 'back'); this.exitSign = makeSign('出发', { w: 1.3, h: 0.6, post: 0.9 }); this.exitSign.position.set(ex.sign.x, 0, ex.sign.z + 1.2); this.stage!.root.add(this.exitSign);
    this.doors = [{ ex, g: new THREE.Group(), lift: 1 }];
    const touch = this.inp.lastDevice === 'touch' && 'ontouchstart' in globalThis;
    this.banner.show('练武场', touch ? '踩石板叫陪练 · 走上木台换人 · 右上「调」调手感' : '踩石板叫陪练 · 走上木台换人 · 空格跳 · ` 键调手感 · U 换界面', 4);
    this.log.push('yard');
  }
  private spawnWave() {
    const kinds = this.plan?.waves[this.wave] ?? [], hp = this.hero.pos;
    kinds.forEach((k, i) => {
      after(i * 0.28, () => {
        if (this.phase !== 'fight') return;
        let p = V3();
        for (let t = 0; t < 30; t++) {
          const side = Math.floor(R(0, 3)); p = side === 0 ? V3(R(-4.2, 4.2), 0, R(-5.8, -4.2)) : V3((side === 1 ? -1 : 1) * R(3.6, 4.7), 0, R(-5.2, 1.5));
          if (EDEFS[kindOr(k).kind].boss) p = V3(0, 0, -4.6);   // any region boss stands at the back
          if (p.distanceTo(hp) > 4.2 && this.foes.every(f => f.pos.distanceTo(p) > 1.4)) break;
        }
        // the plan's kind (黄巾 ids; 'kind*' = its elite) — the boss gets its banner: name and slogan from EDEFS
        const ko = kindOr(k), f = spawnFoe(ko.kind, p, hp.clone(), ko.elite); this.foes.push(f);
        const bs = !!EDEFS[ko.kind].boss;
        fxSmoke(p.clone().add(V3(0, 0.3, 0)), 0x6a6a74, bs ? 14 : 8, { r: 0.7, spd: 1.2, up: 0.6, s: 0.4, life: 0.7 }); fxRing(p.clone().setY(0.05), 0xff7a4a, 1.2, { life: 0.4 } as never);
        cue(bs ? 'roar' : 'summon', bs ? 0.9 : 0.4);
        if (bs) { f.a.roar(); shake(0.3 * TUNE.shake); this.banner.show(EDEFS[ko.kind].name, EDEFS[ko.kind].tag ?? '', 1.6, '#ff8a6a'); }
      });
    });
  }
  // ------------------------------------------------------------ the world the hero / foes see
  private clamp = (p: THREE.Vector3, r: number) => {
    const x0 = PLAY.x0 + r + 0.2, x1 = PLAY.x1 - r - 0.2, z0 = PLAY.z0 + r + 0.3, z1 = PLAY.z1 - r - 0.2;
    if (this.phase === 'doors' || this.phase === 'leaving' || this.phase === 'yard') for (const d of this.doors) { const l = d.ex.lane; if (p.x > l.x0 - 1.0 && p.x < l.x1 + 1.0 && p.z > l.z0 - (d.ex.id === 'back' ? 1.0 : 0.1) && p.z < l.z1 + (d.ex.id === 'back' ? 1.0 : 0.1)) {
        // the back road: held to its width, free to walk on out (a short lane, shallower than the hero is wide, used to clamp him back
        // inside the room so he could never reach the far end)
        if (d.ex.id === 'back') { p.x = Math.max(l.x0 + r, Math.min(l.x1 - r, p.x)); p.z = Math.max(Math.min(l.z0, PLAY.z0) + r - 6, Math.min(PLAY.z1 - r, p.z)); }
        else p.z = Math.max(l.z0 + r, Math.min(l.z1 - r, p.z));
        return; } }
    p.x = Math.max(x0, Math.min(x1, p.x)); p.z = Math.max(z0, Math.min(z1, p.z));
  };
  private heroWorld: HeroWorld = {
    foes: this.foes,
    swing: o => this.swing(o), sweep: o => this.sweep(o), slam: o => this.slam(o), clamp: this.clamp,
    dart: o => { this.dartsThrown++; this.darts.push(new Dart(o.from.clone(), o.dir.clone().multiplyScalar(TUNE.dartSpeed), TUNE.dartDmg, TUNE.dartRange)); },
    get darts3() { return SHOW_PERKS.darts3; },
    chaseTarget: () => this.chaseTarget(), chase: o => this.chaseFx(o),
    stickWorld: () => V3(this.inp.move.x, 0, -this.inp.move.y),
    guard: o => this.guard(o), incoming: r => this.incoming(r), iaiCatch: win => this.iaiCatch(win),
  };
  private foeWorld: FoeWorld = {
    heroPos: V3(), heroR: 0.38, heroAlive: true, heroY: 0, heroDodge: false, foes: this.foes, arrows: this.arrows, clamp: this.clamp,
    hurtHero: (dmg, from) => this.hurtHero(dmg, from),
    arrowHit: (f, a) => this.arrowHit(f, a),
    dodged: from => this.perfectDodge(from),
  };
  private dmgMul() { return this.perks.dashEdge && this.dashEdgeT > 0 ? 1.5 : 1; }
  private feel(heavy: boolean, n: number) {
    if (!n) return;
    hitstop((heavy ? 0.09 : 0.045 + 0.01 * Math.min(3, n - 1)) * TUNE.hitstop); shake((heavy ? 0.34 : 0.13) * TUNE.shake);
    cue(heavy ? 'crit' : 'impact', heavy ? 1.1 : 0.75); this.platform.vibrate(heavy ? 'medium' : 'light');
  }
  private hitFoe(f: Foe, dmg: number, from: THREE.Vector3, o: { knock: number; heavy: boolean; kind: string; stagger?: number }) {
    const d = Math.round(dmg * (o.kind === 'dart' ? 1 : this.dmgMul())), p = f.a.chest(), dir = f.pos.clone().sub(from).setY(0).normalize();
    const died = damageFoe(f, d, from, { knock: o.knock, stagger: o.stagger ?? (o.heavy ? 0.55 : 0.3), poiseDmg: o.kind === 'dart' ? d * 0.5 : o.heavy ? d * 1.8 : d });
    fxImpact(p, o.heavy ? 0xff6a3a : 0xfff0d0, o.kind === 'dart' ? 0.4 : o.heavy ? 1.3 : 0.75, { dir, chips: o.heavy ? [0xff5a3a, 0x2b3147] : undefined });
    popPix(String(d), f.a.head().add(V3(R(-0.2, 0.2), 0.35, 0)), { color: o.heavy ? '#ff8a3a' : d >= 14 ? '#ffd060' : '#fff6e0', h: o.heavy ? 0.66 : 0.5, big: o.heavy, life: 0.9, rise: 0.9 });
    if (this.perks.burn && (o.kind === 'k5' || o.kind === 'rel') && !died) { f.burn = 6; f.burnT = 0.5; fxSparks(p, 0xff7a2a, 12, 3); }
    if (this.perks.relFreeze && o.kind === 'rel' && !died) { f.frozen = 1.6; f.a.tint(0x9ae8ff, 0.8); fxSparks(p, 0xbff4ff, 14, 3); }
    if (died) this.killFoe(f, from);
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
    const cut: Arrow[] = [];
    for (const a of this.arrows) if (!a.dead && !a.friendly) { const dx = a.p.x - o.from.x, dz = a.p.z - o.from.z; if (Math.hypot(dx, dz) < o.range + 0.4 && Math.abs(Math.atan2(dx * fz - dz * fx, dx * fx + dz * fz)) < o.half + 0.3) cut.push(a); }
    this.deflect(cut, o.yaw);
    this.feel(o.heavy, n); if (o.counter && n) { hitstop(0.14 * TUNE.hitstop); shake(0.3 * TUNE.shake); this.addIntent(); }
    // 刃风: the finishing cut sends a crescent of light off along the blade's way (act-13 用户：「应该是发射一个很干脆的刀光出去」)
    if (o.kind === 'k5' && this.perks.bladeWind) { this.waves.push(new BladeWave(o.from.clone().add(V3(fx * 0.9, 0.95, fz * 0.9)), V3(fx, 0, fz))); cue('whoosh', 1); fxSparks(o.from.clone().add(V3(fx * 1.2, 1.0, fz * 1.2)), 0xe8fff2, 10, 4); }
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
    cue('whoosh', 0.9); shake(0.1 * TUNE.shake);
  }
  private sweep(o: { a: THREE.Vector3; b: THREE.Vector3; r: number; dmg: number; knock: number; col?: number; kind?: string }) {
    const ab = o.b.clone().sub(o.a).setY(0), L2 = Math.max(1e-4, ab.lengthSq()); let n = 0;
    for (const f of this.foes.slice()) {
      if (f.st === 'dead') continue;
      const t = Math.max(0, Math.min(1, f.pos.clone().sub(o.a).setY(0).dot(ab) / L2)), q = o.a.clone().addScaledVector(ab, t);
      if (Math.hypot(f.pos.x - q.x, f.pos.z - q.z) <= o.r + f.d.r) { this.hitFoe(f, o.dmg, q, { knock: o.knock, heavy: true, kind: o.kind ?? 'rel' }); n++; }
    }
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
    cue('crit', 0.55); this.platform.vibrate('medium'); this.addIntent();
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
    this.dodgeCd = 0.8; void from;
    const h = this.hero, at = h.pos.clone();
    slowmo(TUNE.dodgeSlow, 0.28); shake(0.12 * TUNE.shake);
    fxRing(at.clone().setY(0.08), 0xbfe8ff, 2.4, { life: 0.5 } as never); fxRing(at.clone().setY(0.9), 0xe8f6ff, 1.2, { life: 0.3 } as never);
    for (let i = 0; i < 3; i++) fxAfterimage(at.clone().add(V3(Math.sin(i * 2.1) * 0.5, h.y, Math.cos(i * 2.1) * 0.5)), 1.9, 0x8ac8ff, { life: 0.45, glow: 0.6 });
    fxSparks(h.a.chest(), 0xdff4ff, 18, 5); h.a.tint(0xbfe8ff, 0.6);
    popPix('闪', h.a.head().add(V3(0, 0.5, 0)), { color: '#bfe8ff', h: 0.9, big: true, life: 0.9, rise: 1.0 });
    cue('reveal', 0.9); cue('whoosh', 0.7); this.platform.vibrate('medium');
    h.counterT = TUNE.counterTime; h.dashCd = 0;
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
    hitstop(0.16 * TUNE.hitstop); slowmo(0.35, 0.25); shake(0.35 * TUNE.shake);
    fxRing(h.pos.clone().setY(0.9), 0xfff2c8, 1.6, { life: 0.35 } as never); fxRing(h.pos.clone().setY(0.08), 0xffd890, 2.6, { life: 0.5 } as never); fxSparks(h.a.chest(), 0xfff2c8, 24, 7);
    popPix('破', h.a.head().add(V3(0, 0.5, 0)), { color: '#fff0c0', h: 0.95, big: true, life: 0.9, rise: 1.0 });
    cue('block', 1); cue('crit', 0.9); this.platform.vibrate('heavy');
    if (this.intent >= 3) this.startQte(); else this.addIntent();
  }
  /** 杀意 +1 (perfect dodge, a batted arrow, a counter landing, 见切), up to 3; the third flares */
  intent = 0;
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
    this.qteT = 0; slowmo(TUNE.qteTime * 1.3 + 0.2, 0.04); cue('reveal', 1);
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
    cue('magic', 1); shake(0.2 * TUNE.shake);
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
    hitstop(0.2); slowmo(0.5, 0.3); shake(0.6 * TUNE.shake); fxRing(h.pos.clone().setY(0.08), 0xfff0c0, 4, { life: 0.6 } as never); cue('crit', 1.2); this.platform.vibrate('heavy');
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
    fxRing(o.at.clone().setY(0.06), 0xffd8a0, o.r, { life: 0.4 } as never); dustBlocks(o.at.clone(), 12);
    fxSmoke(o.at.clone().setY(0.2), 0x8a7a6a, 8, { r: o.r * 0.6, spd: 2.4, up: 0.3, s: 0.45, life: 0.6 });
    if (n) this.feel(true, n); else { shake(0.2 * TUNE.shake); cue('impact', 0.7); }
    return n;
  }
  private killFoe(f: Foe, from: THREE.Vector3) {
    this.kills++;
    const boss = isBoss(f), elite = !!f.elite;
    void playDeath(f.a, { from, ratio: f.lastDmg / f.maxHp + (boss ? 0.5 : 0), boss }).then(() => { f.a.dispose(); });
    // copper coins: a few square-holed coins bounce out and fly to the hero (worth the foe's gold; elites ×3, the boss more)
    if (this.room >= 0 && f.kind !== 'dummy') { const total = boss ? 60 : f.d.gold * (elite ? 3 : 1), n = Math.min(10, total); this.coinsFx.drop(f.pos.clone(), n, Math.max(1, Math.round(total / n))); }
    if (this.perks.killHeal && this.hero.alive) { this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + this.perks.killHeal); this.hud.flask.heal({ hp: this.hero.hp, maxHp: this.hero.maxHp }); }
    const left = this.foes.filter(x => x.st !== 'dead').length;
    if (boss) { slowmo(1.1, 0.25); shake(0.6 * TUNE.shake); cue('win', 0.9); }
    if (!left && this.phase === 'fight') {
      const lastWave = this.wave >= (this.plan?.waves.length ?? 1) - 1;
      if (!boss) slowmo(lastWave ? 0.7 : 0.35, 0.3);
      if (lastWave) after(1.0, () => this.roomClear()); else { this.wave++; after(0.9, () => { if (this.phase === 'fight') { this.banner.show(`第 ${this.wave + 1} 波`, '', 0.9); this.spawnWave(); } }); }
    }
  }
  private hurtHero(dmg: number, from: THREE.Vector3) {
    // the yard: nobody dies there (the flask fills back up first)
    if (this.phase === 'yard' && !this.hero.iframe && this.hero.hp - dmg <= 0) { this.hero.hp = this.hero.maxHp; this.hud.flask.heal({ hp: this.hero.hp, maxHp: this.hero.maxHp }); }
    // a blow that lands in the dash's invulnerable moment: a perfect dodge
    if (this.hero.parrying) { this.iaiParry(from); return; }
    if (this.hero.dodging) { this.perfectDodge(from); return; }
    if (!this.hero.hurt(dmg, from)) return;
    // where it came from: a red arc at the feet facing the attacker
    this.hitArcs.show(this.hero.pos, from);
    this.hud.flask.hit(dmg, { hp: this.hero.hp, maxHp: this.hero.maxHp });
    popPix(`-${dmg}`, this.hero.a.head().add(V3(0, 0.3, 0)), { color: '#ff5a4a', h: 0.5, life: 0.8 });
    fxSparks(this.hero.a.chest(), 0xff4a3a, 12, 4); this.hero.a.tint(0xff3020, 0.9);
    hitstop(0.07 * TUNE.hitstop); shake(0.42 * TUNE.shake); cue('hurt', 0.9); this.platform.vibrate('heavy');
    if (!this.hero.alive) this.dead();
  }
  // ------------------------------------------------------------ clear → pick → doors → leave
  private async roomClear() {
    if (this.phase !== 'fight') return;
    this.phase = 'pick'; cue('win', 0.6);
    this.banner.show('清场', '', 1.0, '#ffe6a0');
    await new Promise(r => after(0.9, () => r(null)));
    if (this.room >= RUN_ROOMS - 1) { this.end(true); return; }
    const rw = this.plan?.reward ?? null;
    if (rw?.k === 'coins') { this.coinsFx.drop(this.hero.pos.clone().add(V3(0, 0, -1.5)), 12, Math.round(rw.n / 12)); this.banner.show('铜钱', `${rw.n}`, 1.0, '#ffd24a'); }
    else if (rw?.k === 'heal') { this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + Math.round(this.hero.maxHp * 0.35)); this.hud.flask.heal({ hp: this.hero.hp, maxHp: this.hero.maxHp }); this.banner.show('回复', '三成五生命', 1.0, '#9aff9a'); await new Promise(r => after(0.8, () => r(null))); }
    else {
      await this.boonPick(rw?.k === 'boon' ? rw.school : 'sr');
    }
    this.openDoors();
  }
  /** three boons of a school (散人 = the old school-less ones), the cards up, the pick taken */
  private async boonPick(school: 'tp' | 'jd' | 'sr' | 'any') {
    const pool = BOONS.filter(b => !this.taken.has(b.id) && (school === 'any' || ((b as Boon & { school?: string }).school ?? 'sr') === school || !(b as Boon & { school?: string }).school));
    const pick = (pool.length >= 3 ? pool : BOONS.filter(b => !this.taken.has(b.id))).sort(() => Math.random() - 0.5).slice(0, 3);
    if (!pick.length) return;
    const was = this.phase; this.phase = 'pick'; this.hud.on = false; this.banner.hide();
    if (school !== 'any') this.log.push(`school ${SCHOOL_NAME[school]}`);
    const i = await this.cards.open(pick); const b = pick[i]; this.take(b);
    this.hud.on = true; this.phase = was === 'pick' ? 'pick' : was;
  }
  /** 磨刀: one of the boons in hand goes up a tier (the tiers arrive with the schools) */
  private async sharpen() {
    const own = BOONS.filter(b => this.taken.has(b.id)); if (!own.length) return;
    const was = this.phase; this.phase = 'pick'; this.hud.on = false; this.banner.hide();
    const i = await this.cards.open(own.slice(0, 3)); const b = own[i]; this.log.push(`sharpen ${b.id}`);
    this.hud.on = true; this.phase = was; this.banner.show(b.name, '磨利一档', 1.2, b.col);
  }
  /** a station's ring filled: pay, then do its thing */
  private async useStation(s: Station) {
    if (!this.stations) return;
    if (s.price > this.coins) return;
    this.coins -= s.price; cue(s.price ? 'coin' : 'reveal', 0.6); this.log.push(`station ${s.id}`);
    const heal = (k: number) => { this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + Math.round(this.hero.maxHp * k)); this.hud.flask.heal({ hp: this.hero.hp, maxHp: this.hero.maxHp }); };
    if (s.id === 'buy_boon') { this.stations.spend(s); await this.boonPick('any'); }
    else if (s.id === 'buy_heal') { this.stations.spend(s); heal(0.4); this.banner.show('金疮药', '四成生命', 1.0, '#9aff9a'); }
    else if (s.id === 'buy_sharpen') { this.stations.spend(s); await this.sharpen(); }
    else if (s.id === 'rest_heal') { this.stations.spend(s, true); heal(0.4); this.banner.show('裹伤调息', '四成生命', 1.0, '#9aff9a'); }
    else if (s.id === 'rest_sharpen') { this.stations.spend(s, true); await this.sharpen(); }
    else if (s.id === 'scroll') { this.stations.spend(s); await this.boonPick(Math.random() < 0.4 ? 'tp' : Math.random() < 0.67 ? 'jd' : 'sr'); }
  }
  private taken = new Set<string>();
  private take(b: Boon) {
    this.taken.add(b.id); applyBoon(this.perks, b.id); this.log.push(`boon ${b.id}`);
    if (b.id === 'hpUp') { this.hero.maxHp = TUNE.heroHp + this.perks.hpUp; this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + 25); this.hud.flask.heal({ hp: this.hero.hp, maxHp: this.hero.maxHp }); }
    this.banner.show(b.name, b.desc.join(''), 1.4, b.col);
  }
  private openDoors(quiet = false) {
    const ds = this.nextRooms, ids = (this.spec?.exits ?? []) as ExitId[];
    this.doors = ds.map((d, i) => {
      const ex = exitInfo(this.layout!, ids[i] ?? 'back');
      const { g } = runBoard(d, LOCALES[d.locale]?.name ?? ''); g.position.set(ex.sign.x, -2.4, ex.sign.z); g.scale.setScalar(1.25);
      g.rotation.y = Math.atan2(-ex.sign.x * 0.4, 12); this.stage?.root.add(g);
      return { ex, g, lift: 0 };
    });
    this.phase = 'doors'; cue('reveal', 0.7);
    if (!quiet) this.banner.show('去路', ds.length > 1 ? '走进一条路口' : '往前走', 1.2);
  }
  private leave(i: number) {
    if (this.phase !== 'doors') return;
    this.phase = 'leaving'; const d = this.doors[i], next = this.nextRooms[i];
    this.plan = next; const fromLocale = this.locale; this.locale = next.locale;
    const h = this.hero; h.vel.set(d.ex.dir[0], 0, d.ex.dir[1]).multiplyScalar(TUNE.heroSpeed * 0.8);
    WIPE.look = fromLocale === 'ninja_wilds' ? 'bamboo' : 'pillar';
    after(0.35, () => { void wipeTransit(() => { this.room++; this.buildRoom(false); }); });
  }
  private dead() {
    this.phase = 'dead'; slowmo(1.2, 0.3); this.banner.show('败北', '', 1.6, '#ff6a5a');
    after(1.6, async () => {
      this.hud.on = false;
      await this.cards.open([{ id: 'retry', name: '再来一次', desc: ['回练武场再出发', `这一局斩了 ${this.kills} 个`], col: '#ffd070', glyph: BOONS[1].glyph }]);
      this.hud.on = true; void wipeTransit(() => this.enterYard());
    });
  }
  private end(win: boolean) {
    this.phase = 'end';
    after(0.4, async () => {
      this.hud.on = false;
      await this.cards.open([{ id: 'again', name: win ? '黄巾残村' : '再来一次', desc: [win ? '渠帅伏诛' : '回练武场再出发', `斩了 ${this.kills} 个 · 点这里回练武场`], col: '#ffd070', glyph: BOONS[7].glyph }]);
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
    this.inp.frame(rdt);
    if (this.botOn) this.bot();
    const h = this.hero; if (!h) return;
    const busy = this.cards.on || this.phase === 'leaving' || this.ultOn;
    this.qteFrame(rdt); this.parryCd -= rdt;
    if (busy) { for (const b of Object.values(this.inp.b)) { b.pressed = false; b.down = false; b.held = 0; } this.inp.move.x = this.inp.move.y = 0; }
    if (this.phase === 'intro') { this.introT += dt; this.inp.move.x = 0; this.inp.move.y = this.introT < 0.5 ? 0.7 : 0; for (const b of Object.values(this.inp.b)) { b.pressed = false; b.down = false; b.held = 0; } }
    const wasDash = this.lastSt === 'dash';
    h.update(dt, this.inp, this.heroWorld);
    // dash perks: the cut along the dash, the buff after it
    if (h.st === 'dash') {
      if (!wasDash) this.dashHit.clear();
      if (this.perks.dashCut) for (const f of this.foes) if (f.st !== 'dead' && !this.dashHit.has(f.uid) && f.pos.distanceTo(h.pos) < f.d.r + 0.8) { this.dashHit.add(f.uid); this.hitFoe(f, this.perks.dashCut, h.pos.clone(), { knock: 0.4, heavy: false, kind: 'dash' }); this.feel(false, 1); }
    }
    if (wasDash && h.st !== 'dash') this.dashEdgeT = 1.0; else this.dashEdgeT -= dt;
    this.lastSt = h.st;
    h.a.update(dt); for (const a of this.lineupActors) a.update(dt);
    const fw = this.foeWorld; fw.heroPos.copy(h.pos); fw.heroAlive = h.alive && (this.phase === 'fight' || this.phase === 'yard'); fw.heroY = h.y; fw.heroDodge = h.dodgeWin;
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
      const l = this.doors[0]?.ex.lane;
      if (l && h.pos.z < PLAY.z0 - 1.2 && h.pos.x > l.x0 - 0.4 && h.pos.x < l.x1 + 0.4) {
        this.phase = 'leaving'; WIPE.look = 'bamboo'; h.vel.set(0, 0, -TUNE.heroSpeed * 0.8);
        after(0.35, () => { void wipeTransit(() => this.startRun()); });
      }
    }
    for (const f of this.foes) { if (!this.ultOn) updateFoe(f, fw, dt); f.a.update(dt); }
    for (let i = this.foes.length - 1; i >= 0; i--) if (this.foes[i].st === 'dead' && !this.foes[i].a.root.parent) this.foes.splice(i, 1);
    for (const a of this.arrows) a.update(dt, fw);
    for (let i = this.arrows.length - 1; i >= 0; i--) if (this.arrows[i].dead) this.arrows.splice(i, 1);
    for (const w of this.waves) {
      // the light flies on real time: the hit-stop of the blow that sent it freezes the world, not the light leaving it
      const live = w.live, p0 = w.step(rdt); if (!live) continue;
      for (const f of this.foes) if (f.st !== 'dead' && !w.hit.has(f.uid) && w.sweeps(p0, f.pos, f.d.r)) {
        w.hit.add(f.uid); this.hitFoe(f, 12, p0, { knock: 0.8, heavy: false, kind: 'wind' });
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
      for (const f of this.foes) {
        if (f.st === 'dead' || d.p.y > 2.4) continue;
        const ab = d.p.clone().sub(p0).setY(0), L2 = Math.max(1e-6, ab.lengthSq()), t = Math.max(0, Math.min(1, f.pos.clone().sub(p0).setY(0).dot(ab) / L2)), q = p0.clone().addScaledVector(ab, t);
        if (Math.hypot(f.pos.x - q.x, f.pos.z - q.z) < f.d.r + 0.2) { this.hitFoe(f, d.dmg, p0, { knock: 0.12, heavy: false, kind: 'dart', stagger: 0 }); cue('impact', 0.35); if ((f.st as string) !== 'dead') d.stickIn(f, TUNE.chaseWin); else d.stop(); break; }
      }
      if (d.dead || d.stuck) continue;
      const q = d.p.clone(); this.clamp(q, 0); if (q.distanceTo(d.p) > 0.3 || d.life <= 0 || d.p.y < 0.05) d.stop(d.life > 0);
    }
    this.darts = this.darts.filter(d => !d.dead);
    this.hitArcs.update(rdt, h.pos);
    // copper coins fly in; the stations of a shop / rest / scroll room fill their rings under a hero standing still on a mat
    { const got = this.coinsFx.update(dt, h.pos); if (got) { this.coins += got; cue('tick', 0.25); } this.hud.coins = this.coins; }
    if (this.stations && this.phase === 'doors') {
      const s = this.stations.update(dt, h.pos, Math.hypot(h.vel.x, h.vel.z) > 0.8, st => st.price <= this.coins && (!st.id.endsWith('sharpen') || this.taken.size > 0));
      this.stations.setPurse(this.coins);
      if (s) void this.useStation(s);
    }
    // doors: the boards rise; walking into a road's far end leaves
    if (this.phase === 'doors') this.doors.forEach((d, i) => {
      d.lift = Math.min(1, d.lift + dt * 2.2); d.g.position.y = -2.4 * (1 - d.lift) ** 2;
      const p = h.pos, l = d.ex.lane, out = d.ex.id === 'left' ? p.x < l.x0 + 2.6 : d.ex.id === 'right' ? p.x > l.x1 - 2.6 : p.z < PLAY.z0 - 1.2;
      if (out && p.x > l.x0 - 0.4 && p.x < l.x1 + 0.4 && p.z > l.z0 - (d.ex.id === 'back' ? 6 : 0.4) && p.z < l.z1 + 0.4) this.leave(i);
    });
    // the camera: follows the hero with a little lead, held inside the room
    // the lead follows the run, capped at running speed (a dash or a knock-back no longer throws the view forward)
    const v = h.vel.clone().setY(0), vl = v.length(); if (vl > TUNE.heroSpeed) v.multiplyScalar(TUNE.heroSpeed / vl);
    const lead = v.multiplyScalar(TUNE.camLead), want = h.pos.clone().add(lead);
    // enemies come from the back of the room: the view sits a little ahead of the hero
    const nr = this.yard?.near ?? 0, xr = 2.6 + 1.0 * nr;
    want.z -= 0.9 * (1 - nr); want.x = Math.max(-xr, Math.min(xr, want.x)); want.z = Math.max(-4.4, Math.min(2.4, want.z)); want.y = 0;
    this.cam.lerp(want, 1 - Math.exp(-5 * rdt));
    // the charge: the gold ring round the feet fills, sparks off the blade's point (faster as it fills), a flash when full
    const ch = h.charge; this.ring.visible = ch > 0.01;
    if (this.ring.visible) {
      const k = Math.round(ch * 48) / 48;
      if (k !== this.ringK) { this.ringK = k; this.ring.geometry.dispose(); this.ring.geometry = new THREE.RingGeometry(0.62, 0.74, 48, 1, Math.PI / 2, -Math.PI * 2 * Math.max(0.01, k)).rotateX(-Math.PI / 2); }
      this.ring.position.set(h.pos.x, 0.05 + h.y, h.pos.z);
      const m = this.ring.material as THREE.MeshBasicMaterial; m.opacity = ch >= 1 ? 0.55 + 0.15 * Math.sin(clock.rtime * 14) : 0.5; m.color.setHex(ch >= 1 ? 0xffe7a0 : 0xffc848);
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
    this.hud.setCooldowns({ attack: 0, jump: 0, dash: Math.max(0, h.dashCd / TUNE.dashCd), special: h.dartReload > 0 ? h.dartReload / TUNE.dartReload : 0 });
    this.hud.setPips('special', h.dartAmmo, TUNE.dartCharges);
    SHOW_PERKS.darts3 = this.perks.darts3;
    this.hud.update(rdt, this.inp, this.foes); this.cards.update(rdt); this.banner.update(rdt);
    this.L.on = true;
  }
  // ------------------------------------------------------------ input
  private pointer(type: string, id: number, x: number, y: number) {
    if (this.cards.on) { this.cards.pointer(type, x, y); return; }
    this.hud.pointer(type, id, x, y, this.inp);
  }
  /** the UI's skin: 漆器 → 竹简 → 铁器 (U key, the tuning panel, __dh.skin(id)) */
  cycleSkin(to?: SkinId) {
    const next = to ?? SKINS[(SKINS.indexOf(SKIN.id) + 1) % SKINS.length]; setSkin(next);
    this.hud.reskin(); this.banner.dispose(); this.banner = new SkinBanner(this.L, next);
    this.banner.show(SKIN_NAME[next], '界面风格 · U 键或调参面板切换', 1.4);
  }
  private key(e: KeyboardEvent) {
    if (!this.cards.on) return;
    const k = ({ arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right', enter: 'ok', ' ': 'ok', j: 'ok' } as const)[e.key.toLowerCase() as 'a'];
    if (k && !e.repeat) { e.preventDefault(); this.cards.key(k); }
  }
  // ------------------------------------------------------------ a bot (captures / smoke tests)
  private botT = 0; private cardT = 0;
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
      const d = this.doors[0].ex.walk[2]; const v = V3(d[0] - h.pos.x, 0, d[1] - h.pos.z).normalize();
      // step round a dummy in the way
      for (const f of this.foes) if (f.kind === 'dummy') { const o = f.pos.clone().sub(h.pos).setY(0), l = o.length(); if (l < 1.6 && o.dot(v) > l * 0.5) { const side = V3(v.z, 0, -v.x); v.addScaledVector(side, side.dot(o) > 0 ? -1.2 : 1.2).normalize(); } }
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
