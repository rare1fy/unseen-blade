// act-151 / act-165: 统一「招式谱」右侧真 3D Mini-World 实时残影示意窗（MoveStage）
// 响应用户：「招式谱里面的动作示意要是个mini world啊，不要只是摆个抽象的动作示意，我想要的是刚学会某个招式的时候在战斗场景里面那样的残影示意。」
// 实现方式：
//   · 在世界安全偏移坐标 (220, 0, 0) 搭建一座独立纯 3D 体素小演武场（青石砖地 + 木栏柱 + 双灯笼），主镜头不可见；
//   · 运行与 MoveDemo 完全同款的真 3D 蓝/红半透明残影 Hero（装佩当前真 3.5cm 武器模型与秘传）+ BattleActor('hj_blade')，
//     及真实的 3D slashArc 刀光、Dart 飞镖、fxRing / fxSparks / trailSeg / smokeBurst 特效（静默防刷音效）；
//   · 在 main.ts 中于 L.renderText 之前通过 renderer.setViewport + setScissor 直接渲染进右侧铁框镂空视口（0 额外 RenderTarget，WebGL1/2 与微信小游戏全兼容）；
//   · 镂空铁框下方配与残影按键精准同步亮灭的键帽/手柄节拍条与哈迪斯 2 式图标化详析。
import * as THREE from 'three';
import type { UiLayer } from '../ui3d/layer';
import { scene, V3, padLights, restoreLights } from '../engine/world';
import { PAUSE } from '../engine/clock';
import { BattleActor } from '../bestiary/battle';
import { modelDef, type ModelDef } from '../bestiary/models';
import { fxRing, fxSparks, trailSeg } from '../fx/fx';
import { smokeBurst } from '../kyoto/ninja_fx';
import { withCueMuted } from '../../audio/cues';
import { Hero, type HeroWorld } from './hero';
import { Dart } from './missiles';
import { TUNE } from './tune';
import { slashArc } from './slashArc';
import { applyBoon, newPerks } from './boons';
import type { Btn, BtnName, Input } from './input';
import type { Foe } from './enemy';
import { manualOf, manualSteps, KEY_BTN, isPress } from './skillInfo';
import type { MoveId } from './manuals';
import type { WeaponId } from './weapons';
import { makeCanvas } from '../../platform/index';
import { drawPix, pixW, PIX_H } from '../v2/pix';
import { drawPixelPlaque, drawMiniIcon, drawFocusBrackets, richLine } from './uiPlate';
import { PAD, actKey, BIND, paintGlyph, glyphArt, GLYPH_H } from './pad';
import { t as localize } from './i18n';
import { uiScale } from './uiScale';
import type { SkillEntry } from './skillFace';

const MINI_X = 220;
const MINI_Z = 0;

const ACTION_BTN_KEY: Record<BtnName, string> = {
  attack: 'attack', dash: 'dash', jump: 'jump', special: 'special', ult: 'attack',
};

const wrap = (a: number) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const newBtn = (): Btn => ({ down: false, pressed: false, released: false, held: 0, last: 0 });
const ghostMat = (col: number) => new THREE.MeshBasicMaterial({ vertexColors: true, color: col, transparent: true, opacity: 0 });
function ghostOf(root: THREE.Object3D, mat: THREE.Material) {
  root.traverse(o => {
    const m = o as THREE.Mesh;
    if (m.isMesh) { m.material = mat; m.castShadow = false; m.receiveShadow = false; }
  });
}

type StickDir = 'toFoe' | 'away' | 'side' | null;
interface ManualTiming { when?: (g: Hero, st: MiniGhostSim) => boolean; after?: number; stick?: StickDir }
interface ManualScript { dist: number; steps: ManualTiming[]; tail: number }
const TAP = 0.085;
const MANUAL_SCRIPTS: Record<MoveId, ManualScript> = {
  chase:    { dist: 4.1, tail: 0.95, steps: [{}, { when: (_g, s) => s.stuck }] },
  backDart: { dist: 3.1, tail: 0.95, steps: [{ stick: 'away' }, { when: g => g.canBackDart, after: 0.06 }] },
  dbl:      { dist: 3.1, tail: 1.0,  steps: [{}, { when: g => g.canDoubleJump, after: 0.18 }] },
  launch:   { dist: 2.2, tail: 1.15, steps: [{}, { when: g => g.canLaunch }] },
  cutDart:  { dist: 2.2, tail: 0.95, steps: [{}, { when: g => g.canCutDart }] },
  keep:     { dist: 2.2, tail: 1.0,  steps: [{}, { stick: 'side', when: g => g.st === 'k1' && g.t / g.dur > 0.4 }, { when: g => g.canKeep && g.st === 'free' }] },
  pause:    { dist: 2.2, tail: 1.25, steps: [{}, { when: g => g.st === 'k1' && g.t / g.dur > 0.35 }, { when: g => g.canPause && g.t > 0.28 }] },
  kick:     { dist: 3.6, tail: 1.0,  steps: [{ stick: 'toFoe' }, { when: g => g.canKick, after: 0.08 }] },
  acut:     { dist: 2.2, tail: 1.2,  steps: [{}, { when: g => g.canLaunch }, { when: g => g.canAirCut }] },
  swoop:    { dist: 3.3, tail: 1.0,  steps: [{}, { when: g => g.canSwoop, stick: 'toFoe' }] },
  reel:     { dist: 4.0, tail: 1.05, steps: [{}, { when: g => g.canReel }] },
  stomp:    { dist: 1.12, tail: 1.15, steps: [{}, { when: g => g.canStomp }] },
};

interface BeatNode {
  kind: 'btn' | 'pause' | 'danger' | 'air' | 'pin' | 'qte' | 'burst' | 'aura';
  btn?: BtnName;
  gesture?: 'tap' | 'hold' | 'release';
  dir?: StickDir;
  /** 0 = upcoming, 1 = active right now, 2 = completed */
  state: 0 | 1 | 2;
  /** 0..1 continuous fill (hold ring, timing track, pause beat, QTE ring) */
  fill?: number;
  /** optional multi-hit combo pips drawn beside the medallion */
  pips?: { total: number; done: number; heavyLast?: boolean };
  col?: string;
}

interface BeatState {
  nodes: BeatNode[];
  pulseT: number;
  accent: string;
}

/** act-182: Live Hero Info Mini-World snapshot (rendered in Tab 0 英雄总览 left showcase). */
export interface HeroShowcaseData {
  heroName: string;
  outfitName: string;
  weaponName: string;
  weaponLv: number;
  weaponCol?: string;
  keepsakeId?: string | null;
  keepsakeName: string;
  keepsakeStar: string;
  keepsakeCol?: string;
  hp: number;
  maxHp: number;
  dmgPct: number;
  critPct: number;
  maxDarts: number;
  intent: number;
  arcanaUsed: number;
  arcanaCap: number;
  roomLabel: string;
}

/** Isolated 3D ghost combat simulator running real Hero + BattleActor + slashArc + Dart at (MINI_X, 0, MINI_Z). */
class MiniGhostSim {
  stuck = false;
  private dojo: THREE.Group | null = null;
  private g: Hero | null = null;
  private foe: BattleActor | null = null;
  private F: Foe | null = null;
  private hShad: THREE.Mesh | null = null;
  private fShad: THREE.Mesh | null = null;
  private gm = ghostMat(0x9ed8ff);
  private fm = ghostMat(0xff9280);
  private inp = { b: { attack: newBtn(), dash: newBtn(), special: newBtn(), jump: newBtn(), ult: newBtn() } as Record<BtnName, Btn> };
  private hold: Record<BtnName, number> = { attack: 0, dash: 0, special: 0, jump: 0, ult: 0 };
  private stick: { v: THREE.Vector3; t: number } = { v: V3(), t: 0 };
  private darts: Dart[] = [];
  private fvy = 0;
  private fvel = V3();
  private prone = 0;
  private w: HeroWorld | null = null;
  private entry: SkillEntry | null = null;
  private heroDef: ModelDef = modelDef('fine_hat');
  private weaponId: WeaponId = 'hanshan';
  private weaponLv = 0;
  private t = 0;
  private lastT = 0;
  private readyAt = 0;
  private si = 0;
  private fade = 0;
  private ending = -1;
  private btnFlash: Record<BtnName, number> = { attack: 0, dash: 0, special: 0, jump: 0, ult: 0 };
  private stepTimes: number[] = [];
  private beatNodes: BeatNode[] = [];
  private flags = new Set<string>();
  private auraT = 0;
  private keys: ReturnType<typeof manualSteps> = [];
  private manualScript: ManualScript | null = null;
  private heroMode = false;
  private heroYaw = 0.28;
  private heroYawVel = 0;
  private daisRing: THREE.Mesh | null = null;

  ensureDojo() {
    if (this.dojo) { this.dojo.visible = true; return; }
    const grp = new THREE.Group();
    grp.position.set(MINI_X, 0, MINI_Z);
    const addBox = (w: number, h: number, d: number, x: number, y: number, z: number, col: number, emissive = 0, ei = 0) => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshLambertMaterial({ color: col, emissive, emissiveIntensity: ei }),
      );
      m.position.set(x, y, z);
      grp.add(m);
      return m;
    };
    // Dark stone courtyard floor + crisp raised flagstone grid
    addBox(16, 0.16, 12, 0, -0.08, 0, 0x1c1a26);
    for (let ix = -5; ix <= 5; ix += 2) {
      for (let iz = -3; iz <= 3; iz += 2) {
        addBox(1.88, 0.03, 1.88, ix, 0.005, iz, ((ix + iz) & 2) ? 0x262334 : 0x221f2e);
      }
    }
    // Center sparring ring trim
    addBox(7.2, 0.04, 0.08, 0, 0.015, -2.0, 0x5c4a38);
    addBox(7.2, 0.04, 0.08, 0, 0.015, 2.0, 0x5c4a38);
    // Low timber-brick dojo rear wall + eaves
    addBox(14, 1.5, 0.45, 0, 0.75, -3.2, 0x241f2c);
    addBox(14.4, 0.18, 0.72, 0, 1.56, -3.15, 0x3b2c24);
    addBox(14.2, 0.12, 0.56, 0, 1.70, -3.15, 0x523c2e);
    // 4 timber pillars & 2 glowing warm voxel lanterns
    for (const px of [-4.6, -1.8, 1.8, 4.6]) {
      addBox(0.24, 2.8, 0.24, px, 1.4, -2.95, 0x3e2a20);
    }
    for (const lx of [-2.8, 2.8]) {
      addBox(0.08, 0.35, 0.08, lx, 2.45, -2.6, 0x584030);
      addBox(0.32, 0.42, 0.32, lx, 2.1, -2.6, 0xc8462c, 0xff9a38, 0.75);
      addBox(0.18, 0.24, 0.34, lx, 2.1, -2.6, 0xffe084, 0xffd060, 0.9);
    }
    // Soft ground contact shadow discs under ghost Hero & ghost Foe
    const sGeo = new THREE.CircleGeometry(0.46, 12).rotateX(-Math.PI / 2);
    const sMat = new THREE.MeshBasicMaterial({ color: 0x08060e, transparent: true, opacity: 0.52, depthWrite: false });
    this.hShad = new THREE.Mesh(sGeo, sMat); this.hShad.position.set(0, 0.03, 0);
    this.fShad = new THREE.Mesh(sGeo, sMat); this.fShad.position.set(0, 0.03, 0);
    // Subtle warm bronze octagonal dais ring shown only in Hero Showcase mode
    const ringGeo = new THREE.RingGeometry(0.72, 0.86, 8).rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xd8a852, transparent: true, opacity: 0.72, depthWrite: false, side: THREE.DoubleSide });
    this.daisRing = new THREE.Mesh(ringGeo, ringMat);
    this.daisRing.position.set(0, 0.025, 0);
    this.daisRing.visible = false;
    grp.add(this.hShad, this.fShad, this.daisRing);
    scene.add(grp);
    this.dojo = grp;
  }

  start(entry: SkillEntry, heroDef: ModelDef, weaponId: WeaponId, weaponLv: number) {
    this.heroMode = false;
    this.entry = entry;
    this.heroDef = heroDef;
    this.weaponId = entry.weaponId ?? weaponId;
    this.weaponLv = weaponLv;
    this.ensureDojo();
    if (this.daisRing) this.daisRing.visible = false;
    this.spawnCycle(false);
  }

  /** act-182: Full-color rotatable 3D Hero showcase on the stone dais (no ghost tint, live outfit + weapon). */
  startHero(heroDef: ModelDef, weaponId: WeaponId, weaponLv: number) {
    this.heroMode = true;
    this.entry = null;
    this.heroDef = heroDef;
    this.weaponId = weaponId;
    this.weaponLv = weaponLv;
    this.ensureDojo();
    this.clearActors(false);
    if (this.daisRing) this.daisRing.visible = true;
    withCueMuted(() => {
      const g = this.g = new Hero(V3(MINI_X, 0, MINI_Z), this.heroDef);
      g.applyWeapon(this.weaponId, this.weaponLv);
      g.qi = Hero.QI_MAX;
      g.perks = newPerks();
      this.heroYaw = 0.28;
      this.heroYawVel = 0;
      g.a.yaw = this.heroYaw;
      g.a.place(V3(MINI_X, 0, MINI_Z));
      this.t = 0;
    });
    if (this.hShad) { this.hShad.visible = true; this.hShad.position.set(0, 0.03, 0); this.hShad.scale.setScalar(1.08); }
    if (this.fShad) this.fShad.visible = false;
  }

  dragHeroYaw(dxRad: number) {
    if (!this.heroMode) return;
    this.heroYaw += dxRad;
    this.heroYawVel = Math.max(-6, Math.min(6, dxRad * 18));
  }

  updateHero(dt: number) {
    if (!this.heroMode || !this.g) return;
    this.t += dt;
    if (Math.abs(this.heroYawVel) > 0.01) {
      this.heroYaw += this.heroYawVel * dt;
      this.heroYawVel *= Math.exp(-7 * dt);
    }
    withCueMuted(() => {
      const g = this.g!;
      g.a.yaw = this.heroYaw + Math.sin(this.t * 1.05) * 0.045;
      g.a.update(dt);
    });
    if (this.daisRing) this.daisRing.rotation.y = this.t * 0.22;
  }

  private clearActors(puff: boolean) {
    withCueMuted(() => {
      if (this.g) {
        if (puff) smokeBurst(this.g.pos.clone(), 0.45, 5, { size: 0.2, life: 0.32 });
        this.g.a.dispose(); this.g = null;
      }
      if (this.foe) {
        if (puff) smokeBurst(this.foe.home.clone(), 0.45, 5, { size: 0.2, life: 0.32 });
        this.foe.dispose(); this.foe = null;
      }
      for (const d of this.darts) d.kill();
      this.darts = [];
      this.F = null; this.w = null;
    });
  }

  private spawnCycle(puff: boolean) {
    this.clearActors(puff);
    const e = this.entry;
    if (!e) return;
    withCueMuted(() => {
      const m = e.kind === 'manual' ? manualOf(e.id) : null;
      this.manualScript = m ? MANUAL_SCRIPTS[m.id] : null;
      this.keys = m ? manualSteps(m).filter(isPress) : [];
      const isMeta = e.kind === 'arcana' || e.kind === 'keepsake';
      const dist = this.manualScript ? this.manualScript.dist
        : e.id === 'dart' || e.id === 'darts3' || e.id === 'boomerang' || e.id === 'pin' ? 4.0
        : e.id === 'iai' || e.id === 'dcut' || e.id === 'passCut' || e.id === 'ult' ? 3.4
        : e.id === 'dash' || e.id === 'counter' || e.id === 'parry' ? 2.5
        : 2.3;
      const gAt = V3(isMeta ? MINI_X : MINI_X - dist / 2, 0, MINI_Z);
      const fAt = V3(MINI_X + dist / 2, 0, MINI_Z);

      const g = this.g = new Hero(gAt, this.heroDef);
      g.applyWeapon(this.weaponId, this.weaponLv);
      g.qi = Hero.QI_MAX;
      g.perks = newPerks();
      if (m) g.moves = m.needs ? { [m.id]: true, [m.needs]: true } : { [m.id]: true };
      if (e.kind === 'boon') applyBoon(g.perks, e.id, e.tier);
      g.a.yaw = isMeta ? 0.35 : Math.PI / 2;
      ghostOf(g.a.root, this.gm);

      if (!isMeta) {
        const foe = this.foe = new BattleActor('hj_blade');
        foe.place(fAt);
        foe.yaw = -Math.PI / 2;
        ghostOf(foe.root, this.fm);
        this.F = { st: 'idle', pos: foe.home, d: { r: 0.44 }, a: foe, vel: V3(), kind: 'hj_blade' } as unknown as Foe;
      }
      smokeBurst(gAt, 0.4, 5, { size: 0.2, life: 0.3 });
      if (this.foe) smokeBurst(fAt, 0.4, 5, { size: 0.2, life: 0.3 });

      this.t = 0; this.lastT = 0; this.readyAt = 0; this.si = 0;
      this.stuck = false; this.fvy = 0; this.fvel.set(0, 0, 0); this.prone = 0;
      this.fade = 0; this.ending = -1; this.stepTimes = []; this.beatNodes = [];
      this.flags.clear(); this.auraT = 0;
      this.stick.v.set(0, 0, 0); this.stick.t = 0;
      for (const k of Object.keys(this.hold) as BtnName[]) {
        this.hold[k] = 0; this.btnFlash[k] = 0; Object.assign(this.inp.b[k], newBtn());
      }
    });
  }

  private world(): HeroWorld {
    const F = this.F, foe = this.foe, me = this;
    const hit = (k: number, sparkCol = 0xffe8c8) => {
      if (!foe) return 0;
      foe.hurt(k);
      fxSparks(foe.chest(), sparkCol, 9, 3.2);
      return 1;
    };
    const inArc = (from: THREE.Vector3, yaw: number, range: number, half: number) => {
      if (!F) return false;
      const d = F.pos.clone().sub(from).setY(0), l = d.length();
      if (l > range + F.d.r + 0.45) return false;
      if (half >= Math.PI) return true;
      return Math.abs(wrap(Math.atan2(d.x, d.z) - yaw)) <= half + Math.atan2(F.d.r + 0.2, Math.max(0.05, l));
    };
    return {
      foes: F ? [F] : [],
      swing: o => {
        if (!inArc(o.from, o.yaw, o.range, o.half)) return 0;
        const sc = me.entry?.kind === 'boon' && me.entry.accentHex ? me.entry.accentHex : 0xffe8c8;
        if (o.heavy && F) me.fvel.set(3.2, 0, 0);
        return hit(o.heavy ? 1.3 : 0.9, sc);
      },
      sweep: o => {
        if (!F) return 0;
        const ab = o.b.clone().sub(o.a).setY(0), L2 = Math.max(1e-6, ab.lengthSq());
        const t = Math.max(0, Math.min(1, F.pos.clone().sub(o.a).setY(0).dot(ab) / L2));
        const q = o.a.clone().addScaledVector(ab, t);
        return Math.hypot(F.pos.x - q.x, F.pos.z - q.z) < o.r + F.d.r + 0.4 ? hit(1.25, 0xffe488) : 0;
      },
      slam: o => {
        fxRing(o.at.clone().setY(0.08), me.entry?.id === 'rift' ? 0xff7832 : 0xffaa52, o.r * 0.9, { life: 0.34 } as never);
        if (!F || Math.hypot(F.pos.x - o.at.x, F.pos.z - o.at.z) > o.r + F.d.r + 0.6) return 0;
        me.fvy = 4.2;
        return hit(1.3, 0xffb868);
      },
      launch: o => {
        if (!inArc(o.from, o.yaw, o.range, o.half)) return 0;
        me.fvy = 7.6;
        fxRing(o.from.clone().setY(0.08), 0xd4eaf6, 1.3, { life: 0.28 } as never);
        return hit(1.15, 0xffe488);
      },
      kick: o => {
        if (!F) return 0;
        const d = F.pos.clone().sub(o.from).setY(0);
        if (d.length() > 2.1 || d.dot(o.dir) < -0.1) return 0;
        me.fvel.copy(o.dir).setY(0).normalize().multiplyScalar(8.5);
        fxRing(F.pos.clone().setY(0.85), 0xeadcc4, 1.0, { life: 0.24 } as never);
        return hit(1.4, 0xffd088);
      },
      dart: o => {
        me.darts.push(new Dart(o.from.clone(), o.dir.clone().multiplyScalar(TUNE.dartSpeed), 0, TUNE.dartRange));
      },
      chaseTarget: () => (me.stuck && F ? F : null),
      chase: o => {
        smokeBurst(o.from, 0.45, 7, { size: 0.24, life: 0.4 });
        smokeBurst(o.to, 0.45, 7, { size: 0.24, life: 0.4 });
        trailSeg(o.from.clone().setY(0.9), o.to.clone().setY(0.9), 0xa884ff, 0.11, { life: 0.26 });
        for (const d of me.darts) if (d.stuck) d.stop();
        me.stuck = false;
      },
      airFoe: () => (F && F.pos.y > 0.15 ? F : null),
      airHold: (_f, y) => { if (F) F.pos.y = Math.max(0.5, y - 0.1); me.fvy = 0; },
      airCut: o => { if (o.n === 3) me.fvy = -16; return hit(o.n === 3 ? 1.3 : 0.9, 0xff70d0); },
      airSlam: o => { if (F) F.pos.y = 0; me.fvy = 0; fxRing(o.at.clone().setY(0.06), 0xe1b5a9, 1.5); return hit(1.3); },
      swoop: o => {
        trailSeg(o.a.clone().setY(0.65), o.b.clone().setY(0.65), 0x9ad8a8, 0.12, { life: 0.28 });
        return hit(1.2, 0x88f4b0);
      },
      reelTarget: (from, min) => (me.stuck && F && from.distanceTo(F.pos) >= min ? { foe: F, heavy: false } : null),
      reel: o => {
        for (const d of me.darts) if (d.stuck === F) d.stop();
        me.stuck = false;
        if (me.g && foe && F) {
          trailSeg(me.g.a.chest(), foe.chest(), 0xd8283a, 0.06, { life: o.dur });
          me.fvel.copy(o.to).sub(F.pos).multiplyScalar(7);
          hit(0.85, 0xff7080);
        }
      },
      stompable: (from, y) => (F && y >= 0.5 && Math.hypot(from.x - F.pos.x, from.z - F.pos.z) <= 1.45 ? F : null),
      stomp: o => { me.prone = 1.15; fxRing(o.foe.pos.clone().setY(0.06), 0xb8f048, 0.95); return hit(1.2, 0xc8ff68); },
      guard: () => {},
      incoming: () => null,
      iaiCatch: () => (me.entry?.id === 'parry' && me.flags.has('parryWin') && F ? F.pos.clone() : null),
      clamp: (p, r) => {
        p.x = Math.max(MINI_X - 5.2 + r, Math.min(MINI_X + 5.2 - r, p.x));
        p.z = Math.max(MINI_Z - 2.6 + r, Math.min(MINI_Z + 2.6 - r, p.z));
      },
      stickWorld: () => (me.stick.t > 0 ? me.stick.v.clone() : V3()),
      aimWorld: () => null,
    };
  }

  private pressBtn(btn: BtnName, dur = TAP, stick?: StickDir) {
    this.hold[btn] = Math.max(this.hold[btn], dur);
    this.btnFlash[btn] = Math.max(this.btnFlash[btn], 0.24);
    if (stick && this.g && this.foe) {
      const toF = this.foe.home.clone().sub(this.g.pos).setY(0);
      if (toF.lengthSq() > 1e-4) toF.normalize(); else toF.set(1, 0, 0);
      this.stick.v.copy(stick === 'toFoe' ? toF : stick === 'away' ? toF.multiplyScalar(-1) : V3(-toF.z, 0, toF.x));
      this.stick.t = Math.max(dur + 0.06, 0.14);
    }
  }

  private accentOf(e: SkillEntry): string {
    if (e.accentHex != null) return '#' + e.accentHex.toString(16).padStart(6, '0');
    return e.kind === 'arcana' ? '#6ae6a4' : e.kind === 'keepsake' ? '#ffd868' : e.kind === 'manual' ? '#ffcf66' : '#f2c872';
  }

  private buildManualNodes(e: SkillEntry, g: Hero, sc: ManualScript): BeatNode[] {
    const id = e.id as MoveId;
    const accent = this.accentOf(e);
    const nodes: BeatNode[] = [];
    const stepState = (idx: number): 0 | 1 | 2 => {
      if (this.si <= idx) return 0;
      const st = this.stepTimes[idx] ?? -9;
      return this.t - st < 0.28 ? 1 : 2;
    };
    for (let i = 0; i < sc.steps.length; i++) {
      const key = this.keys[i];
      const btn: BtnName = isPress(key) ? KEY_BTN[key] : 'attack';
      const dir = sc.steps[i].stick;
      // Insert graphical condition/rhythm pictograms between key steps!
      if (i === 1 && (id === 'chase' || id === 'reel')) {
        nodes.push({ kind: 'pin', state: this.stuck ? 1 : this.si > 1 ? 2 : 0, col: '#a884ff' });
      }
      if (i === 1 && (id === 'dbl' || id === 'swoop' || id === 'stomp')) {
        nodes.push({ kind: 'air', state: this.si >= 1 && g.y > 0.12 ? 1 : this.si > 1 ? 2 : 0, col: '#84e4ff' });
      }
      if (i === 2 && id === 'acut') {
        nodes.push({ kind: 'air', state: this.si >= 2 && g.y > 0.12 ? 1 : this.si > 2 ? 2 : 0, col: '#ff8ad8' });
      }
      if (i === 2 && id === 'pause') {
        const waitFill = this.si < 2 ? 0 : this.si === 2 ? Math.min(1, Math.max(0, (this.t - this.lastT) / 0.34)) : 1;
        nodes.push({ kind: 'pause', state: this.si === 2 ? 1 : this.si > 2 ? 2 : 0, fill: waitFill, col: '#ffd26a' });
      }
      nodes.push({
        kind: 'btn', btn, gesture: 'tap', dir,
        state: stepState(i),
        col: i === sc.steps.length - 1 ? accent : undefined,
      });
    }
    const lastT = this.stepTimes[sc.steps.length - 1] ?? -9;
    nodes.push({
      kind: 'burst',
      state: this.si >= sc.steps.length ? (this.t - lastT < 0.45 ? 1 : 2) : 0,
      col: accent,
    });
    return nodes;
  }

  update(dt: number): BeatState {
    if (!this.entry || !this.g) return { nodes: [], pulseT: 0, accent: '#ffd868' };
    const g = this.g, foe = this.foe, e = this.entry, w = (this.w ??= this.world());
    this.t += dt;
    this.stick.t = Math.max(0, this.stick.t - dt);
    for (const n of Object.keys(this.btnFlash) as BtnName[]) {
      this.btnFlash[n] = Math.max(0, this.btnFlash[n] - dt);
    }

    withCueMuted(() => {
      if (this.ending < 0) {
        if (this.manualScript) {
          // Exact MoveDemo script playback for all 12 manuals!
          const sc = this.manualScript;
          if (this.si < sc.steps.length) {
            const p = sc.steps[this.si], key = this.keys[this.si];
            const ready = this.t - this.lastT >= (p.after ?? (this.si ? 0.12 : 0.35)) && (!p.when || p.when(g, this));
            this.readyAt = ready ? this.readyAt + dt : 0;
            const last = this.si === sc.steps.length - 1;
            if (isPress(key) && ready && (!last || this.readyAt >= 0.12)) {
              const btn = KEY_BTN[key];
              this.pressBtn(btn, TAP, p.stick);
              this.stepTimes[this.si] = this.t;
              this.lastT = this.t; this.si++; this.readyAt = 0;
            }
          } else if (this.t - this.lastT > sc.tail) {
            this.ending = 0;
          }
          if (this.t > 4.6) this.ending = 0;
          this.beatNodes = this.buildManualNodes(e, g, sc);
        } else if (e.kind === 'arcana' || e.kind === 'keepsake') {
          this.auraT += dt;
          if (this.auraT > 0.72) {
            this.auraT = 0;
            const col = e.kind === 'arcana' ? 0x7ef0aa : 0xffd868;
            fxRing(g.pos.clone().setY(0.08), col, 1.35, { life: 0.65 } as never);
            fxSparks(g.pos.clone().setY(1.0), col, 5, 1.6);
          }
          g.a.yaw = 0.35 + Math.sin(this.t * 1.1) * 0.25;
          this.beatNodes = [{
            kind: 'aura',
            state: 1,
            fill: (this.t % 1.4) / 1.4,
            col: e.kind === 'arcana' ? '#70eda8' : '#ffd868',
          }];
        } else {
          this.driveScript(e, g, foe);
        }
      }

      // Advance scripted buttons just like Input.frame
      for (const n of Object.keys(this.hold) as BtnName[]) {
        const b = this.inp.b[n], d = this.hold[n] > 0;
        this.hold[n] = Math.max(0, this.hold[n] - dt);
        const was = b.held;
        b.pressed = d && !b.down; b.released = !d && b.down; b.down = d;
        b.held = d ? b.held + dt : 0;
        if (b.released) b.last = was;
      }

      g.qi = Hero.QI_MAX;
      g.update(dt, this.inp as unknown as Input, w);
      g.a.update(dt);
      if (this.hShad) {
        this.hShad.position.set(g.pos.x - MINI_X, 0.03, g.pos.z - MINI_Z);
        this.hShad.scale.setScalar(Math.max(0.45, 1 - g.y * 0.22));
      }

      if (foe && this.F) {
        foe.update(dt);
        if (this.fvy !== 0 || foe.home.y > 0) {
          foe.home.y += this.fvy * dt; this.fvy -= 20 * dt;
          if (foe.home.y <= 0) { foe.home.y = 0; this.fvy = 0; }
        }
        if (this.fvel.lengthSq() > 1e-3) {
          foe.home.addScaledVector(this.fvel, dt);
          foe.home.x = Math.max(MINI_X - 4.8, Math.min(MINI_X + 4.8, foe.home.x));
          this.fvel.multiplyScalar(Math.exp(-5 * dt));
        }
        foe.place(foe.home);
        if (this.fShad) {
          this.fShad.visible = true;
          this.fShad.position.set(foe.home.x - MINI_X, 0.03, foe.home.z - MINI_Z);
          this.fShad.scale.setScalar(Math.max(0.45, 1 - foe.home.y * 0.22));
        }
        if (this.prone > 0) {
          const down = Math.min(1, (1.15 - this.prone) / 0.1, this.prone / 0.25);
          foe.body.rotation.x = Math.PI / 2 * down;
          foe.body.position.y = 0.24 * down;
          this.prone = Math.max(0, this.prone - dt);
          if (!this.prone) { foe.body.rotation.x = 0; foe.body.position.y = 0; }
        }
      } else if (this.fShad) {
        this.fShad.visible = false;
      }

      // Advance flying 3D darts
      for (const d of this.darts) {
        if (d.dead) continue;
        if (d.stuck) { d.ride(dt); continue; }
        const p0 = d.step(dt);
        if (foe && this.F) {
          const ab = d.p.clone().sub(p0).setY(0), L2 = Math.max(1e-6, ab.lengthSq());
          const t = Math.max(0, Math.min(1, foe.home.clone().sub(p0).setY(0).dot(ab) / L2));
          const q = p0.clone().addScaledVector(ab, t);
          if (Math.hypot(foe.home.x - q.x, foe.home.z - q.z) < 0.68 && d.p.y < 2.4) {
            foe.hurt(0.45);
            fxSparks(foe.chest(), 0x9cf0ff, 6, 2.5);
            d.stickIn(this.F, 3);
            this.stuck = true;
          } else if (d.life <= 0) d.stop(false);
        } else if (d.life <= 0) d.stop(false);
      }

      this.fade = Math.min(1, this.fade + dt / 0.22);
      if (this.ending >= 0) {
        this.ending += dt;
        if (this.ending >= 0.34) { this.spawnCycle(true); return; }
      }
      const a = this.ending >= 0 ? Math.max(0, 1 - this.ending / 0.34) : this.fade;
      this.gm.opacity = 0.62 * a;
      this.fm.opacity = 0.54 * a;
    });

    return { nodes: this.beatNodes, pulseT: this.t, accent: this.accentOf(e) };
  }

  /** Real 3D Hero choreography for all 10 base/weapon moves & all Boons (outputs purely graphical BeatNodes). */
  private driveScript(e: SkillEntry, g: Hero, foe: BattleActor | null) {
    const id = e.id;
    const t = this.t;
    const accent = this.accentOf(e);
    const once = (k: string, cond: boolean, fn: () => void) => {
      if (cond && !this.flags.has(k)) { this.flags.add(k); fn(); }
    };
    const isLit = (b: BtnName) => this.inp.b[b].down || this.btnFlash[b] > 0;

    if (id === 'lianhuan' || (e.kind === 'boon' && e.target === 'attack')) {
      const hits = this.weaponId === 'thunder' ? 3 : this.weaponId === 'frost' ? 6 : this.weaponId === 'blunt' ? 2 : 5;
      const stepT = this.weaponId === 'frost' ? 0.28 : this.weaponId === 'thunder' ? 0.50 : 0.36;
      const start = 0.12;
      if (this.si < hits && t >= start + this.si * stepT) {
        this.pressBtn('attack', TAP, 'toFoe');
        this.si++;
      }
      this.beatNodes = [
        {
          kind: 'btn', btn: 'attack', gesture: 'tap',
          state: isLit('attack') ? 1 : this.si > 0 ? 2 : 0,
          pips: { total: hits, done: Math.min(this.si, hits), heavyLast: true },
          col: accent,
        },
        ...(e.kind === 'boon' ? [{ kind: 'burst' as const, state: (this.si > 0 ? (isLit('attack') ? 1 : 2) : 0) as 0 | 1 | 2, col: accent }] : []),
      ];
      if (t > start + hits * stepT + 0.85) this.ending = 0;
      return;
    }

    if (id === 'iai' || (e.kind === 'boon' && (e.steps?.includes('hold') ?? false))) {
      const holdStart = 0.16, holdDur = 0.72, relAt = holdStart + holdDur;
      let fill = 0;
      if (t >= holdStart && t < relAt) {
        this.hold.attack = 0.08;
        fill = Math.min(1, (t - holdStart) / holdDur);
        if (Math.floor(t * 7) !== Math.floor((t - 0.03) * 7)) {
          fxRing(g.pos.clone().setY(0.08), fill > 0.8 ? 0xfff088 : 0xff9a38, 0.7 + fill * 0.6, { life: 0.2 } as never);
        }
      } else if (t >= relAt) {
        fill = 1;
        once('relFx', true, () => {
          if (this.weaponId === 'thunder' && foe) {
            fxRing(foe.home.clone().setY(0.1), 0xffe060, 2.2, { life: 0.4 } as never);
            trailSeg(g.pos.clone().setY(0.9), foe.home.clone().setY(0.9), 0xffe060, 0.26, { life: 0.32 });
            foe.hurt(1.6); fxSparks(foe.chest(), 0xffe468, 14, 4);
          } else if (this.weaponId === 'frost' && foe) {
            fxRing(foe.home.clone().setY(0.1), 0x74e8ff, 1.8, { life: 0.36 } as never);
            fxSparks(foe.chest(), 0x9cf4ff, 14, 4);
          } else if (this.weaponId === 'blunt' && foe) {
            slashArc.clashCross(foe.chest(), V3(1, 0, 0), 0.12, 'heavy', 0.28, 1.35);
            fxSparks(foe.chest(), 0xff8c52, 16, 4.5);
          }
        });
      }
      const holding = t >= holdStart && t < relAt;
      const released = t >= relAt;
      const relFlash = released && t < relAt + 0.42;
      this.beatNodes = [
        { kind: 'btn', btn: 'attack', gesture: 'hold', state: holding ? 1 : released ? 2 : 0, fill, col: fill > 0.85 ? '#fff088' : '#ff9a3c' },
        { kind: 'btn', btn: 'attack', gesture: 'release', state: relFlash ? 1 : released ? 2 : 0, col: '#ffe878' },
        { kind: 'burst', state: relFlash ? 1 : released ? 2 : 0, col: this.weaponId === 'frost' ? '#7cecff' : this.weaponId === 'thunder' ? '#ffe060' : '#ffaa58' },
      ];
      if (t > 2.2) this.ending = 0;
      return;
    }

    if (id === 'parry') {
      const holdStart = 0.16, dangerStart = 0.34, hitAt = 0.88;
      const holding = t >= holdStart && t < hitAt;
      const parried = t >= hitAt;
      const parryFlash = parried && t < hitAt + 0.45;
      const holdFill = holding ? Math.min(1, (t - holdStart) / (hitAt - holdStart)) : parried ? 1 : 0;
      const dangerFill = t < dangerStart ? 0 : Math.min(1, (t - dangerStart) / (hitAt - dangerStart));
      if (holding) this.hold.attack = 0.08;
      once('foeAtk', t >= 0.56 && !!foe, () => {
        foe!.attack(1.4);
        fxRing(foe!.chest(), 0xff5242, 1.15, { life: 0.28 } as never);
      });
      once('parryHit', parried && !!foe, () => {
        this.flags.add('parryWin');
        fxRing(g.pos.clone().add(V3(0.7, 0.9, 0)), 0xfff6c8, 1.7, { life: 0.32 } as never);
        fxSparks(g.pos.clone().add(V3(0.7, 1.0, 0)), 0xffe488, 16, 4.5);
        foe!.hurt(1.5);
        this.fvel.set(7.5, 0, 0);
      });
      this.beatNodes = [
        { kind: 'btn', btn: 'attack', gesture: 'hold', state: holding ? 1 : parried ? 2 : 0, fill: holdFill, col: '#ffae48' },
        { kind: 'danger', state: t >= dangerStart && !parried ? 1 : parried ? 2 : 0, fill: dangerFill, col: '#ff5242' },
        { kind: 'btn', btn: 'attack', gesture: 'release', state: parryFlash ? 1 : parried ? 2 : 0, col: '#fff088' },
        { kind: 'burst', state: parryFlash ? 1 : parried ? 2 : 0, col: '#ffe878' },
      ];
      if (t > 2.15) this.ending = 0;
      return;
    }

    if (id === 'dash' || id === 'dcut' || id === 'counter' || (e.kind === 'boon' && e.target === 'dash')) {
      const isCounter = id === 'counter', isDcut = id === 'dcut' || id === 'passCut';
      const dangerStart = 0.14, dashAt = 0.52, cutAt = isCounter ? 0.96 : 0.62;
      once('foeSw', t >= 0.34 && !!foe, () => {
        foe!.attack(1.4);
        if (isCounter) fxRing(foe!.chest(), 0xff5242, 1.1, { life: 0.26 } as never);
      });
      once('doDash', t >= dashAt, () => {
        this.pressBtn('dash', TAP, isCounter ? 'side' : 'toFoe');
        if (isCounter) fxRing(g.pos.clone().setY(0.12), 0x82dcff, 1.6, { life: 0.35 } as never);
      });
      once('doCut', (isDcut && t >= cutAt) || (isCounter && t >= cutAt), () => {
        this.pressBtn('attack', TAP, 'toFoe');
        if (isCounter && foe) {
          fxSparks(foe.chest(), 0xffd858, 14, 4.2);
          slashArc.clashCross(foe.chest(), V3(1, 0, 0), 0.3, 'heavy', 0.26, 1.2);
        }
      });
      const dashed = t >= dashAt, cutDone = (isDcut || isCounter) && t >= cutAt;
      const dangerFill = t < dangerStart ? 0 : Math.min(1, (t - dangerStart) / (dashAt - dangerStart));
      if (isCounter) {
        this.beatNodes = [
          { kind: 'danger', state: t >= dangerStart && !dashed ? 1 : dashed ? 2 : 0, fill: dangerFill, col: '#ff5242' },
          { kind: 'btn', btn: 'dash', gesture: 'tap', dir: 'side', state: isLit('dash') ? 1 : dashed ? 2 : 0, col: '#7ce8ff' },
          { kind: 'btn', btn: 'attack', gesture: 'tap', state: isLit('attack') ? 1 : cutDone ? 2 : 0, col: '#ffe068' },
          { kind: 'burst', state: cutDone && t < cutAt + 0.4 ? 1 : cutDone ? 2 : 0, col: '#ffe068' },
        ];
      } else if (isDcut) {
        this.beatNodes = [
          { kind: 'btn', btn: 'dash', gesture: 'tap', dir: 'toFoe', state: isLit('dash') ? 1 : dashed ? 2 : 0, col: '#7ce8ff' },
          { kind: 'btn', btn: 'attack', gesture: 'tap', state: isLit('attack') ? 1 : cutDone ? 2 : 0, col: '#ffe068' },
          { kind: 'burst', state: cutDone && t < cutAt + 0.4 ? 1 : cutDone ? 2 : 0, col: '#84e8ff' },
        ];
      } else {
        this.beatNodes = [
          { kind: 'btn', btn: 'dash', gesture: 'tap', dir: 'toFoe', state: isLit('dash') ? 1 : dashed ? 2 : 0, col: '#7ce8ff' },
          { kind: 'burst', state: dashed && t < dashAt + 0.42 ? 1 : dashed ? 2 : 0, col: e.kind === 'boon' ? accent : '#7ce8ff' },
        ];
      }
      if (t > 2.1) this.ending = 0;
      return;
    }

    if (id === 'jump' || id === 'plunge' || (e.kind === 'boon' && e.target === 'jump')) {
      const doPlunge = id === 'plunge' || id === 'rift' || id === 'vault';
      const jAt = 0.26, cutAt = 0.56;
      once('j1', t >= jAt, () => this.pressBtn('jump', TAP, 'toFoe'));
      once('jCut', doPlunge && t >= cutAt, () => this.pressBtn('attack', TAP, 'toFoe'));
      const jumped = t >= jAt, cutDone = doPlunge && t >= cutAt;
      if (doPlunge) {
        this.beatNodes = [
          { kind: 'btn', btn: 'jump', gesture: 'tap', state: isLit('jump') ? 1 : jumped ? 2 : 0, col: '#84e4ff' },
          { kind: 'air', state: jumped && !cutDone ? 1 : cutDone ? 2 : 0, col: '#84e4ff' },
          { kind: 'btn', btn: 'attack', gesture: 'tap', state: isLit('attack') ? 1 : cutDone ? 2 : 0, col: '#ffaa58' },
          { kind: 'burst', state: cutDone && t < cutAt + 0.4 ? 1 : cutDone ? 2 : 0, col: e.kind === 'boon' ? accent : '#ffaa58' },
        ];
      } else {
        this.beatNodes = [
          { kind: 'btn', btn: 'jump', gesture: 'tap', state: isLit('jump') ? 1 : jumped ? 2 : 0, col: '#84e4ff' },
          { kind: 'air', state: jumped && g.y > 0.1 ? 1 : jumped ? 2 : 0, col: '#84e4ff' },
        ];
      }
      if (t > 1.95) this.ending = 0;
      return;
    }

    if (id === 'dart' || (e.kind === 'boon' && e.target === 'special')) {
      for (let k = 0; k < 3; k++) {
        once(`d${k}`, t >= 0.22 + k * 0.30, () => { this.pressBtn('special', TAP, 'toFoe'); this.si = k + 1; });
      }
      this.beatNodes = [
        {
          kind: 'btn', btn: 'special', gesture: 'tap',
          state: isLit('special') ? 1 : this.si > 0 ? 2 : 0,
          pips: { total: 3, done: this.si },
          col: '#96b4ff',
        },
        { kind: 'pin', state: this.stuck ? 1 : this.si >= 3 ? 2 : 0, col: e.kind === 'boon' ? accent : '#a884ff' },
      ];
      if (t > 2.1) this.ending = 0;
      return;
    }

    if (id === 'ult') {
      const qteEnd = 0.55;
      once('u0', t >= 0.22, () => {
        this.pressBtn('ult', 0.26, 'toFoe');
        fxRing(g.pos.clone().setY(0.1), 0xffd258, 1.9, { life: 0.45 } as never);
      });
      once('u1', t >= qteEnd && !!foe, () => {
        this.pressBtn('dash', TAP, 'toFoe');
        slashArc.clashCross(foe!.chest(), V3(1, 0, 0), 0.45, 'heavy', 0.3, 1.5);
        slashArc.clashCross(foe!.chest(), V3(0, 0, 1), -0.45, 'heavy', 0.3, 1.5);
        foe!.hurt(1.2); fxSparks(foe!.chest(), 0xffe488, 14, 4);
      });
      once('u2', t >= 1.15 && !!foe, () => {
        for (let k = 0; k < 3; k++) {
          slashArc.clashCross(foe!.chest().add(V3((k - 1) * 0.4, (k - 1) * 0.25, 0)), V3(1, 0, 0.3), k * 0.6, 'heavy', 0.32, 1.4);
        }
        fxRing(foe!.home.clone().setY(0.12), 0xffd860, 2.4, { life: 0.45 } as never);
        fxSparks(foe!.chest(), 0xfff098, 22, 5.2);
        foe!.hurt(1.8);
      });
      this.beatNodes = [
        { kind: 'qte', state: t < qteEnd ? 1 : 2, fill: Math.min(1, t / qteEnd), col: '#ffd860' },
        { kind: 'btn', btn: 'ult', gesture: 'tap', state: isLit('ult') ? 1 : t >= 0.22 ? 2 : 0, col: '#ffe678' },
        { kind: 'burst', state: t >= qteEnd && t < 1.55 ? 1 : t >= 1.55 ? 2 : 0, col: '#ffe878' },
      ];
      if (t > 2.35) this.ending = 0;
      return;
    }

    // Fallback passive boon demonstration: strike + glowing proc ring
    once('p1', t >= 0.36, () => {
      this.pressBtn('attack', TAP, 'toFoe');
      fxRing(g.pos.clone().setY(0.1), e.accentHex ?? 0xffd27a, 1.5, { life: 0.4 } as never);
    });
    const fired = t >= 0.36;
    this.beatNodes = [
      { kind: 'btn', btn: 'attack', gesture: 'tap', state: isLit('attack') ? 1 : fired ? 2 : 0, col: accent },
      { kind: 'burst', state: fired && t < 0.9 ? 1 : fired ? 2 : 0, col: accent },
    ];
    if (t > 1.9) this.ending = 0;
  }

  hide() {
    this.clearActors(false);
    if (this.dojo) this.dojo.visible = false;
    if (this.daisRing) this.daisRing.visible = false;
    this.heroMode = false;
    this.entry = null;
  }

  dispose() {
    this.hide();
    if (this.dojo) {
      this.dojo.traverse(o => {
        const m = o as THREE.Mesh;
        if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
      });
      this.dojo.parent?.remove(this.dojo);
      this.dojo = null;
    }
    this.gm.dispose();
    this.fm.dispose();
  }
}

export class MoveStage {
  private mesh: THREE.Mesh;
  private mat: THREE.MeshBasicMaterial;
  private tex: THREE.CanvasTexture | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private sim = new MiniGhostSim();
  private cam = new THREE.PerspectiveCamera(34, 2, 0.1, 40);
  private entry: SkillEntry | null = null;
  private heroProfile: HeroShowcaseData | null = null;
  private lastHeroKey = '';
  private heroDef: ModelDef = modelDef('fine_hat');
  private weaponId: WeaponId = 'hanshan';
  private weaponLv = 0;
  private beat: BeatState = { nodes: [], pulseT: 0, accent: '#ffd868' };
  private uiAccum = 0;
  private lastW = 0;
  private lastH = 0;
  private lastEntryKey = '';
  private rect = { cx: 0, cy: 0, w: 0, h: 0 };
  /** Exact CSS-px viewport rectangle of the live 3D mini-world cutout (top half of MoveStage, above beat bar). */
  private vpCss = { x: 0, y: 0, w: 0, h: 0 };
  private demoBtnRect: { x: number; y: number; w: number; h: number } | null = null;
  private equipRects: { weapon: { x: number; y: number; w: number; h: number } | null; keepsake: { x: number; y: number; w: number; h: number } | null } = { weapon: null, keepsake: null };
  private visibleAlpha = 0;
  demoBtnHot = false;
  equipHot: 'weapon' | 'keepsake' | null = null;
  canPlay3d = false;

  constructor(private L: UiLayer) {
    this.mat = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat);
    this.mesh.renderOrder = 62;
    this.mesh.visible = false;
    L.text.scene.add(this.mesh);
  }

  setContext(heroDef: ModelDef, weaponId: WeaponId, weaponLv: number) {
    this.heroDef = heroDef;
    this.weaponId = weaponId;
    this.weaponLv = weaponLv;
  }

  setEntry(e: SkillEntry | null, canPlay3d = false) {
    if (this.heroProfile) { this.heroProfile = null; this.lastHeroKey = ''; }
    const key = e ? `${e.kind}:${e.id}:${e.weaponId ?? this.weaponId}:${this.weaponLv}:${e.attached?.length ?? 0}:${canPlay3d ? 1 : 0}` : '';
    if (key !== this.lastEntryKey) {
      this.lastEntryKey = key;
      this.entry = e;
      this.canPlay3d = canPlay3d;
      if (e) this.sim.start(e, this.heroDef, this.weaponId, this.weaponLv);
      else this.sim.hide();
      this.uiAccum = 1;
    }
  }

  /** act-182: Switch MoveStage into full-color rotatable 3D Hero Showcase + core stats panel. */
  setHeroShowcase(profile: HeroShowcaseData | null) {
    if (!profile) {
      if (this.heroProfile) { this.heroProfile = null; this.lastHeroKey = ''; this.sim.hide(); }
      return;
    }
    this.entry = null;
    this.lastEntryKey = '';
    this.canPlay3d = false;
    const modelKey = `${this.heroDef.id}:${this.weaponId}:${this.weaponLv}`;
    const fullKey = `${modelKey}|${profile.hp}/${profile.maxHp}|${profile.dmgPct}|${profile.critPct}|${profile.maxDarts}|${profile.intent}|${profile.arcanaUsed}/${profile.arcanaCap}|${profile.keepsakeName}|${profile.keepsakeStar}|${profile.outfitName}|${profile.roomLabel}`;
    const prevModelKey = this.lastHeroKey.split('|')[0];
    this.heroProfile = profile;
    if (modelKey !== prevModelKey) {
      this.sim.startHero(this.heroDef, this.weaponId, this.weaponLv);
    }
    if (fullKey !== this.lastHeroKey) {
      this.lastHeroKey = fullKey;
      this.uiAccum = 1;
    }
  }

  layout(cx: number, cy: number, w: number, h: number) {
    this.rect = { cx, cy, w, h };
  }

  hitDemoBtn(x: number, y: number): boolean {
    const r = this.demoBtnRect;
    return !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  /** act-183: Hit-test the dedicated Weapon / Keepsake equip slots inside Tab 0 Hero Showcase. */
  hitEquipSlot(x: number, y: number): 'weapon' | 'keepsake' | null {
    const inRect = (r: { x: number; y: number; w: number; h: number } | null) =>
      !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    if (inRect(this.equipRects.weapon)) return 'weapon';
    if (inRect(this.equipRects.keepsake)) return 'keepsake';
    return null;
  }

  setEquipHot(slot: 'weapon' | 'keepsake' | null) {
    if (this.equipHot !== slot) {
      this.equipHot = slot;
      this.uiAccum = 1;
    }
  }

  hitViewport(x: number, y: number): boolean {
    const v = this.vpCss;
    return v.w > 8 && x >= v.x && x <= v.x + v.w && y >= v.y && y <= v.y + v.h;
  }

  dragYaw(dxPx: number) {
    if (this.heroProfile) this.sim.dragHeroYaw(dxPx * 0.013);
  }

  update(dt: number, alpha: number) {
    this.visibleAlpha = alpha;
    if ((!this.entry && !this.heroProfile) || alpha <= 0.02 || this.rect.w < 40 || this.rect.h < 40) {
      this.mesh.visible = false;
      this.demoBtnRect = null;
      this.vpCss.w = 0;
      return;
    }
    PAUSE.fx = true;
    if (this.heroProfile) {
      this.sim.updateHero(dt);
    } else {
      this.beat = this.sim.update(dt);
    }
    this.uiAccum += dt;
    const dpr = Math.max(1, Math.round(this.L.dpr || 1));
    const W = Math.max(64, Math.round(this.rect.w * dpr));
    const H = Math.max(64, Math.round(this.rect.h * dpr));
    if (W !== this.lastW || H !== this.lastH || !this.canvas) {
      this.lastW = W; this.lastH = H;
      this.canvas = makeCanvas(W, H) as HTMLCanvasElement;
      this.ctx = this.canvas.getContext('2d')!;
      this.ctx.imageSmoothingEnabled = false;
      this.tex?.dispose();
      this.tex = new THREE.CanvasTexture(this.canvas);
      this.tex.magFilter = THREE.NearestFilter;
      this.tex.minFilter = THREE.LinearFilter;
      this.tex.generateMipmaps = false;
      this.tex.colorSpace = THREE.SRGBColorSpace;
      this.mat.map = this.tex;
      this.mat.needsUpdate = true;
      this.uiAccum = 1;
    }
    if (this.uiAccum >= 1 / 24) {
      this.uiAccum = 0;
      if (this.heroProfile) this.paintHeroShowcase(this.ctx!, W, H, dpr);
      else this.paint(this.ctx!, W, H, dpr);
      if (this.tex) this.tex.needsUpdate = true;
    }
    this.mat.opacity = alpha;
    this.mesh.visible = true;
    this.mesh.scale.set(this.rect.w, this.rect.h, 1);
    this.mesh.position.set(Math.round(this.rect.cx), -Math.round(this.rect.cy), 0);
  }

  /** Direct scissor-viewport 3D render of the live Mini-World into MoveStage's transparent upper showcase bay. */
  renderMiniWorld(renderer: THREE.WebGLRenderer) {
    if (!this.mesh.visible || this.visibleAlpha <= 0.08 || this.vpCss.w < 16 || this.vpCss.h < 16) return;
    // Three.js setViewport / setScissor expect logical CSS pixels (they multiply by renderer.getPixelRatio() internally).
    const W = Math.max(1, this.L.w), H = Math.max(1, this.L.h);
    const vx = Math.max(0, Math.floor(this.vpCss.x));
    const vw = Math.min(W - vx, Math.max(1, Math.ceil(this.vpCss.w)));
    const vh = Math.max(1, Math.ceil(this.vpCss.h));
    const vy = Math.max(0, Math.floor(H - (this.vpCss.y + this.vpCss.h)));
    if (vw < 8 || vh < 8) return;

    this.cam.aspect = vw / vh;
    if (this.heroProfile) {
      this.cam.fov = 30;
      this.cam.position.set(MINI_X, 2.05, 4.45);
      this.cam.lookAt(MINI_X, 0.92, 0);
    } else {
      this.cam.fov = 34;
      this.cam.position.set(MINI_X, 3.65, 6.45);
      this.cam.lookAt(MINI_X, 0.85, 0);
    }
    this.cam.updateProjectionMatrix();

    const prevVp = new THREE.Vector4();
    const prevSc = new THREE.Vector4();
    const prevCc = new THREE.Color();
    renderer.getViewport(prevVp);
    renderer.getScissor(prevSc);
    renderer.getClearColor(prevCc);
    const prevScTest = renderer.getScissorTest();
    const prevAc = renderer.autoClear;
    const prevCa = renderer.getClearAlpha();
    const prevShad = renderer.shadowMap.enabled;
    const prevFog = scene.fog;

    padLights();
    try {
      renderer.setRenderTarget(null);
      renderer.autoClear = false;
      renderer.shadowMap.enabled = false;
      scene.fog = null;
      renderer.setScissorTest(true);
      renderer.setScissor(vx, vy, vw, vh);
      renderer.setViewport(vx, vy, vw, vh);
      renderer.setClearColor(0x13111c, 1);
      renderer.clear(true, true, false);
      renderer.render(scene, this.cam);
    } finally {
      restoreLights();
      scene.fog = prevFog;
      renderer.shadowMap.enabled = prevShad;
      renderer.setClearColor(prevCc, prevCa);
      renderer.setViewport(prevVp);
      renderer.setScissor(prevSc);
      renderer.setScissorTest(prevScTest);
      renderer.autoClear = prevAc;
    }
  }

  hide(keepFx = false) {
    this.mesh.visible = false;
    this.demoBtnRect = null;
    this.equipRects = { weapon: null, keepsake: null };
    this.equipHot = null;
    this.vpCss.w = 0;
    this.lastEntryKey = '';
    this.lastHeroKey = '';
    this.entry = null;
    this.heroProfile = null;
    this.sim.hide();
    if (!keepFx) PAUSE.fx = false;
  }

  dispose() {
    this.hide();
    this.sim.dispose();
    this.mesh.parent?.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.tex?.dispose();
    this.mat.dispose();
  }

  /** act-182 / act-183: Paint the Hero Info Mini-World showcase frame (3D rotatable heroine + dedicated Weapon/Keepsake equip slots + 2x2 core stats). */
  private paintHeroShowcase(g: CanvasRenderingContext2D, W: number, H: number, dpr: number) {
    const p = this.heroProfile!;
    const kk = uiScale(this.L.w, this.L.h, 0.78, 2.8);
    const u = Math.max(1, Math.round(2 * kk * dpr));
    const padX = Math.round(13 * kk * dpr);
    const padY = Math.round(10 * kk * dpr);
    const innerCol = '#d8a852';

    g.clearRect(0, 0, W, H);
    drawPixelPlaque(g, 0, 0, W, H, u, {
      bg: '#131018', hi: '#261f30', border: '#07050a', inner: innerCol, accent: '#ffd884', rivets: true,
    });

    const boxX = padX + u, boxW = W - (padX + u) * 2;
    const compact = this.rect.h < 330;
    const stageH = Math.round(H * (compact ? 0.50 : 0.58));
    const stageY = padY + u;
    const bdr = Math.max(1, Math.round(1.5 * kk * dpr));

    // 1. Framed transparent 3D Hero Portrait bay (full height — zero bottom text bar!)
    g.fillStyle = '#09070c';
    g.fillRect(boxX - bdr, stageY - bdr, boxW + 2 * bdr, stageH + 2 * bdr);
    g.fillStyle = innerCol;
    g.fillRect(boxX, stageY, boxW, stageH);
    const ix = boxX + bdr, iy = stageY + bdr, iw = boxW - 2 * bdr, ih = stageH - 2 * bdr;
    g.clearRect(ix, iy, iw, ih);

    const left0 = this.rect.cx - this.rect.w / 2, top0 = this.rect.cy - this.rect.h / 2;
    this.vpCss = { x: left0 + ix / dpr, y: top0 + iy / dpr, w: iw / dpr, h: ih / dpr };
    this.demoBtnRect = null;

    // Corner brackets framing the 3D Hero viewport
    const cr = Math.round(10 * kk * dpr);
    g.fillStyle = innerCol;
    for (const [cx, cy, sx, sy] of [
      [ix + bdr, iy + bdr, 1, 1],
      [ix + iw - bdr, iy + bdr, -1, 1],
      [ix + bdr, iy + ih - bdr, 1, -1],
      [ix + iw - bdr, iy + ih - bdr, -1, -1],
    ]) {
      g.fillRect(sx > 0 ? cx : cx - cr, cy, cr, bdr);
      g.fillRect(cx - (sx < 0 ? bdr : 0), sy > 0 ? cy : cy - cr, bdr, cr);
    }

    // Minimal pure-pixel drag-rotate glyph (◄ ● ►) tucked quietly at bottom-center of viewport (ZERO prose!)
    {
      const ru = Math.max(1, Math.round(1.5 * kk * dpr));
      const rcx = ix + Math.round(iw / 2), rcy = iy + ih - Math.round(10 * kk * dpr);
      const pillW = 24 * ru, pillH = 7 * ru;
      g.fillStyle = 'rgba(11,9,17,0.72)';
      g.fillRect(rcx - Math.round(pillW / 2), rcy - Math.round(pillH / 2), pillW, pillH);
      g.fillStyle = '#c8b48e';
      // Left chevron ◄
      g.fillRect(rcx - 9 * ru, rcy, ru, ru);
      g.fillRect(rcx - 8 * ru, rcy - ru, ru, 3 * ru);
      g.fillRect(rcx - 7 * ru, rcy - 2 * ru, ru, 5 * ru);
      // Center orbit dots
      g.fillStyle = '#ffd878';
      g.fillRect(rcx - 3 * ru, rcy, 2 * ru, ru);
      g.fillRect(rcx + ru, rcy, 2 * ru, ru);
      g.fillStyle = '#c8b48e';
      // Right chevron ►
      g.fillRect(rcx + 6 * ru, rcy - 2 * ru, ru, 5 * ru);
      g.fillRect(rcx + 7 * ru, rcy - ru, ru, 3 * ru);
      g.fillRect(rcx + 8 * ru, rcy, ru, ru);
    }

    // 2. Clean Identity Row: Hero Name + Location Tag + Right Pure-Icon Grasp Chip ([◆] X/Y)
    let curY = stageY + stageH + Math.round((compact ? 6 : 9) * kk * dpr);
    const nameTxt = localize(p.heroName);
    const tScale = Math.max(1, Math.floor(((compact ? 15 : 17) * kk * dpr) / PIX_H));
    const tH = PIX_H * tScale;
    drawPix(g, nameTxt, boxX, curY, { scale: tScale, color: '#fff2cc', outline: '#08060c', align: 'left' });

    const pxX = boxX + pixW(nameTxt) * tScale + Math.round(8 * kk * dpr);
    const pScale = Math.max(1, Math.floor(((compact ? 10 : 11.5) * kk * dpr) / PIX_H));
    const graspNum = `${p.arcanaUsed}/${p.arcanaCap}`;
    const graspW = pixW(graspNum) * pScale + Math.round(20 * kk * dpr);
    const rightGuard = boxX + boxW - graspW - Math.round(6 * kk * dpr);
    {
      const loc = localize(p.roomLabel);
      const pw = pixW(loc) * pScale + Math.round(9 * kk * dpr);
      if (pxX + pw <= rightGuard) {
        const ph = PIX_H * pScale + Math.round(4 * kk * dpr);
        const py = Math.round(curY + (tH - ph) / 2);
        g.fillStyle = '#6ec6b8'; g.fillRect(pxX, py, pw, ph);
        g.fillStyle = '#141c20'; g.fillRect(pxX + bdr, py + bdr, pw - 2 * bdr, ph - 2 * bdr);
        drawPix(g, loc, pxX + Math.round(4.5 * kk * dpr), py + Math.round(2 * kk * dpr), { scale: pScale, color: '#8ae4d4', outline: null, align: 'left' });
      }
    }
    // Right-aligned icon-only Grasp chip ([◆] 0/6)
    {
      const gph = PIX_H * pScale + Math.round(4 * kk * dpr);
      const gpy = Math.round(curY + (tH - gph) / 2);
      const gpx = boxX + boxW - graspW;
      g.fillStyle = '#4eb47c'; g.fillRect(gpx, gpy, graspW, gph);
      g.fillStyle = '#12221a'; g.fillRect(gpx + bdr, gpy + bdr, graspW - 2 * bdr, gph - 2 * bdr);
      drawMiniIcon(g, 'grasp', gpx + Math.round(8 * kk * dpr), gpy + Math.round(gph / 2), Math.round(gph * 0.72));
      drawPix(g, graspNum, gpx + Math.round(16 * kk * dpr), gpy + Math.round(2 * kk * dpr), { scale: pScale, color: '#a8ffd0', outline: null, align: 'left' });
    }

    curY += tH + Math.round((compact ? 5 : 7) * kk * dpr);
    g.fillStyle = '#3c3246';
    g.fillRect(boxX, curY, boxW, Math.max(1, Math.round(dpr)));
    curY += Math.round((compact ? 5 : 8) * kk * dpr);

    // 3. Dedicated Paper-Doll Equipment Slots (Side-by-side: Weapon | Keepsake — Icon + Name + Pips/Stars, zero redundant label clutter!)
    const gap = Math.round((compact ? 6 : 8) * kk * dpr);
    const colW = Math.floor((boxW - gap) / 2);
    const eqH = compact
      ? Math.max(Math.round(36 * kk * dpr), PIX_H + Math.round(18 * dpr))
      : Math.max(Math.round(52 * kk * dpr), PIX_H * 2 + Math.round(18 * kk * dpr));
    const drawPixelChevron = (cx: number, cy: number, ru: number, col: string) => {
      g.fillStyle = col;
      g.fillRect(cx, cy - 2 * ru, ru, ru);
      g.fillRect(cx + ru, cy - ru, ru, ru);
      g.fillRect(cx + 2 * ru, cy, ru, ru);
      g.fillRect(cx + ru, cy + ru, ru, ru);
      g.fillRect(cx, cy + 2 * ru, ru, ru);
    };
    const drawEquipSlot = (
      kind: 'weapon' | 'keepsake',
      sx: number, sy: number, sw: number, sh: number,
      title: string, accent: string, equipped: boolean, hot: boolean,
      pips?: { count: number; total: number; style: 'diamond' | 'star' },
    ) => {
      const eu = Math.max(1, Math.round(1.5 * kk * dpr));
      drawPixelPlaque(g, sx, sy, sw, sh, eu, {
        bg: hot ? '#2a2118' : equipped ? '#1f1a19' : '#16131c',
        hi: hot ? '#423322' : equipped ? '#322922' : '#221e2b',
        border: '#07050a',
        inner: hot ? '#fff6c8' : equipped ? accent : '#4e465a',
        accent: hot ? '#fff6c8' : accent,
        rivets: false,
      });
      if (hot) drawFocusBrackets(g, sx, sy, sw, sh, eu);

      const pad = Math.round((compact ? 4 : 6) * kk * dpr);
      const icoBox = sh - pad * 2;
      const ibx = sx + pad, iby = sy + pad;
      g.fillStyle = '#0c0a12';
      g.fillRect(ibx, iby, icoBox, icoBox);
      g.fillStyle = equipped ? accent : '#3e384a';
      g.fillRect(ibx, iby, icoBox, Math.max(1, Math.round(dpr)));
      g.fillRect(ibx, iby + icoBox - Math.max(1, Math.round(dpr)), icoBox, Math.max(1, Math.round(dpr)));
      const icx = ibx + Math.round(icoBox / 2), icy = iby + Math.round(icoBox / 2);
      if (kind === 'weapon') {
        const icoP = Math.max(1, Math.floor((icoBox - 4 * dpr) / 11));
        this.drawActionIcon(g, 'attack', icx, icy, icoP, hot, true);
      } else {
        const kp = Math.max(1, Math.floor((icoBox - 4 * dpr) / 10));
        const px = (dx: number, dy: number, col: string, ww = 1, hh = 1) => {
          g.fillStyle = col; g.fillRect(icx + dx * kp, icy + dy * kp, ww * kp, hh * kp);
        };
        const cMain = equipped ? accent : '#564e62';
        const cHi = equipped ? '#fff6cc' : '#706880';
        const cRed = equipped ? '#e04842' : '#423842';
        px(-1, -4, cHi, 3, 1); px(-2, -3, cMain, 5, 1); px(-3, -2, cMain, 7, 3);
        px(-2, 1, cMain, 5, 1); px(-1, -1, '#121018', 3, 2); px(0, -1, cHi, 1, 1);
        px(0, 2, cRed, 1, 2); px(-1, 3, cRed, 3, 1);
      }

      const tx = ibx + icoBox + Math.round((compact ? 6 : 8) * kk * dpr);
      const chevW = Math.round(10 * kk * dpr);
      const tw = sx + sw - tx - pad - chevW;
      const nmS = Math.max(1, Math.floor(((compact ? 11.5 : 14) * kk * dpr) / PIX_H));
      const locTitle = equipped ? localize(title) : '—';
      let ts = nmS;
      while (ts > 1 && pixW(locTitle) * ts > tw) ts--;
      const nameH = PIX_H * ts;
      const hasPips = !!pips && equipped;
      const pipH = hasPips ? Math.round((compact ? 7 : 10) * kk * dpr) : 0;
      const gapV = hasPips ? Math.round((compact ? 3 : 5) * kk * dpr) : 0;
      const y0 = sy + Math.round((sh - (nameH + gapV + pipH)) / 2);
      drawPix(g, locTitle, tx, y0, { scale: ts, color: hot ? '#fffce0' : equipped ? '#fff2d2' : '#6c6478', outline: '#08060c', align: 'left' });

      if (hasPips && pips) {
        const py = y0 + nameH + gapV + Math.round(pipH / 2);
        if (pips.style === 'star') {
          const sSz = Math.round((compact ? 8 : 10) * kk * dpr);
          for (let k = 0; k < pips.total; k++) {
            drawMiniIcon(g, k < pips.count ? 'star' : 'starOff', tx + Math.round(sSz / 2) + k * (sSz + Math.round(3 * kk * dpr)), py, sSz);
          }
        } else {
          const dp = Math.max(3, Math.round((compact ? 4 : 5) * kk * dpr));
          const dg = Math.round(3.5 * kk * dpr);
          for (let k = 0; k < pips.total; k++) {
            const dx = tx + k * (dp + dg);
            g.fillStyle = '#08060c'; g.fillRect(dx - 1, py - Math.round(dp / 2) - 1, dp + 2, dp + 2);
            g.fillStyle = k < pips.count ? '#ffd868' : '#322b3e';
            g.fillRect(dx, py - Math.round(dp / 2), dp, dp);
          }
        }
      }

      // Subtle pixel right-chevron showing clickability
      drawPixelChevron(sx + sw - pad - Math.round(5 * kk * dpr), sy + Math.round(sh / 2), Math.max(1, Math.round(1.3 * kk * dpr)), hot ? '#fff4b0' : equipped ? '#a8946e' : '#4a4356');
      this.equipRects[kind] = { x: left0 + sx / dpr, y: top0 + sy / dpr, w: sw / dpr, h: sh / dpr };
    };

    const ksEquipped = !!p.keepsakeId;
    const ksStars = (p.keepsakeStar.match(/★/g) ?? []).length;
    drawEquipSlot('weapon', boxX, curY, colW, eqH, p.weaponName, p.weaponCol ?? '#ffd078', true, this.equipHot === 'weapon', { count: p.weaponLv, total: 3, style: 'diamond' });
    drawEquipSlot('keepsake', boxX + colW + gap, curY, colW, eqH, p.keepsakeName, p.keepsakeCol ?? '#ffd878', ksEquipped, this.equipHot === 'keepsake', { count: ksStars, total: 3, style: 'star' });
    curY += eqH + Math.round((compact ? 6 : 9) * kk * dpr);

    // 4. Icon-First 2x2 Core Combat Stats Grid (Pure crisp pixel icons + big bright numbers — ZERO redundant word prefixes!)
    const botLim = H - padY - u;
    const statGap = Math.round((compact ? 4 : 7) * kk * dpr);
    const maxCellH = Math.floor((botLim - curY - statGap) / 2);
    const cellH = Math.max(Math.round(18 * kk * dpr), Math.min(Math.round((compact ? 23 : 34) * kk * dpr), maxCellH));
    const numS = Math.max(1, Math.floor(((compact ? 11.5 : 14) * kk * dpr) / PIX_H));
    const icoSz = Math.round((compact ? 12 : 16) * kk * dpr);
    const drawStatCell = (
      cx: number, cy: number, cw: number, ch: number, bar: string,
      items: Array<{ ico: Parameters<typeof drawMiniIcon>[1]; val: string; col: string }>,
    ) => {
      g.fillStyle = '#1b1724'; g.fillRect(cx, cy, cw, ch);
      g.fillStyle = '#383044'; g.fillRect(cx, cy, cw, Math.max(1, Math.round(dpr)));
      g.fillStyle = bar; g.fillRect(cx, cy, Math.max(2, Math.round(2.5 * dpr)), ch);
      let x = cx + Math.round(10 * kk * dpr);
      const midY = cy + Math.round(ch / 2);
      for (const it of items) {
        drawMiniIcon(g, it.ico, x + Math.round(icoSz / 2), midY, icoSz);
        x += icoSz + Math.round(6 * kk * dpr);
        drawPix(g, it.val, x, midY - Math.round((PIX_H * numS) / 2), { scale: numS, color: it.col, outline: '#08060c', align: 'left' });
        x += pixW(it.val) * numS + Math.round(14 * kk * dpr);
      }
    };
    drawStatCell(boxX, curY, colW, cellH, '#e85a64', [{ ico: 'hp', val: `${p.hp}/${p.maxHp}`, col: '#ffccd2' }]);
    drawStatCell(boxX + colW + gap, curY, colW, cellH, '#f0b858', [{ ico: 'atk', val: `${p.dmgPct}%`, col: '#fff2c4' }]);
    drawStatCell(boxX, curY + cellH + statGap, colW, cellH, '#ff9652', [{ ico: 'crit', val: `${p.critPct}%`, col: '#ffd4a4' }]);
    drawStatCell(boxX + colW + gap, curY + cellH + statGap, colW, cellH, '#8ed8ff', [
      { ico: 'dart', val: `${p.maxDarts}`, col: '#d8f0ff' },
      { ico: 'ult', val: `${p.intent}/3`, col: '#ffe48a' },
    ]);
  }

  private paint(g: CanvasRenderingContext2D, W: number, H: number, dpr: number) {
    this.equipRects = { weapon: null, keepsake: null };
    const e = this.entry!;
    const kk = uiScale(this.L.w, this.L.h, 0.78, 2.8);
    const u = Math.max(1, Math.round(2 * kk * dpr));
    const padX = Math.round(14 * kk * dpr);
    const padY = Math.round(11 * kk * dpr);
    const innerCol = e.kind === 'arcana' ? '#58c088' : e.kind === 'keepsake' ? '#d8b058' : e.kind === 'manual' ? '#d8a64c' : e.kind === 'boon' ? '#c88c48' : '#967c52';

    g.clearRect(0, 0, W, H);
    drawPixelPlaque(g, 0, 0, W, H, u, {
      bg: '#131018', hi: '#241e2e', border: '#07050a', inner: innerCol, accent: '#ffd884', rivets: true,
    });

    const boxX = padX + u, boxW = W - (padX + u) * 2;
    const compact = this.rect.h < 320;
    const stageH = Math.round(H * (compact ? 0.54 : 0.57));
    const stageY = padY + u;
    const bdr = Math.max(1, Math.round(1.5 * kk * dpr));

    // 1. Framed transparent viewport bay for the live 3D Mini-World (punched via clearRect!)
    g.fillStyle = '#09070c';
    g.fillRect(boxX - bdr, stageY - bdr, boxW + 2 * bdr, stageH + 2 * bdr);
    g.fillStyle = innerCol;
    g.fillRect(boxX, stageY, boxW, stageH);
    const ix = boxX + bdr, iy = stageY + bdr, iw = boxW - 2 * bdr, ih = stageH - 2 * bdr;
    const barH = Math.max(Math.round((compact ? 48 : 66) * kk * dpr), Math.round(ih * 0.30));
    const barY = iy + ih - barH;
    const vpH = Math.max(8, barY - iy);
    // Clear the 3D window so the live 3D Mini-World rendered beneath shines cleanly through!
    g.clearRect(ix, iy, iw, vpH);

    // Record exact CSS-px viewport rect for renderMiniWorld()
    const left0 = this.rect.cx - this.rect.w / 2, top0 = this.rect.cy - this.rect.h / 2;
    this.vpCss = { x: left0 + ix / dpr, y: top0 + iy / dpr, w: iw / dpr, h: vpH / dpr };

    // Crisp forged corner brackets framing the 3D mini-world
    const cr = Math.round(10 * kk * dpr);
    g.fillStyle = innerCol;
    for (const [cx, cy, sx, sy] of [
      [ix + bdr, iy + bdr, 1, 1],
      [ix + iw - bdr, iy + bdr, -1, 1],
      [ix + bdr, iy + vpH - bdr, 1, -1],
      [ix + iw - bdr, iy + vpH - bdr, -1, -1],
    ]) {
      g.fillRect(sx > 0 ? cx : cx - cr, cy, cr, bdr);
      g.fillRect(cx - (sx < 0 ? bdr : 0), sy > 0 ? cy : cy - cr, bdr, cr);
    }

    // Bottom graphical input teaching bay inside stage frame (100% visual icons, zero prose clutter!)
    g.fillStyle = '#0c0a12';
    g.fillRect(ix, barY, iw, barH);
    g.fillStyle = '#181422';
    g.fillRect(ix, barY + Math.max(1, Math.round(dpr)), iw, Math.max(1, Math.round(2 * dpr)));
    g.fillStyle = innerCol;
    g.fillRect(ix, barY, iw, Math.max(1, Math.round(dpr)));
    this.paintBeatBar(g, e, this.beat, ix + Math.round(8 * kk * dpr), barY, iw - Math.round(16 * kk * dpr), barH, kk, dpr);

    // 2. Lower Inspector Section: Title + Badge + Icon-Rich Effect + Stat Pill + Attached Boons
    let curY = stageY + stageH + Math.round((compact ? 8 : 11) * kk * dpr);
    const title = localize(e.name);
    let tScale = Math.max(1, Math.floor(((compact ? 15.5 : 17.5) * kk * dpr) / PIX_H));
    while (tScale > 1 && pixW(title) * tScale > boxW * 0.65) tScale--;
    const tH = PIX_H * tScale;
    const titleCol = e.kind === 'arcana' ? '#a4ffd0' : e.kind === 'keepsake' ? '#ffe68c' : e.kind === 'manual' ? '#fff0c0' : '#fff4dc';
    drawPix(g, title, boxX, curY, { scale: tScale, color: titleCol, outline: '#08060c', align: 'left' });

    let tx = boxX + pixW(title) * tScale + Math.round(10 * kk * dpr);
    const pScale = Math.max(1, Math.floor((12 * kk * dpr) / PIX_H));
    const drawPill = (txt: string, col: string, fill: string) => {
      if (!txt) return;
      const loc = localize(txt);
      const pw = pixW(loc) * pScale + Math.round(10 * kk * dpr);
      if (tx + pw > boxX + boxW) return;
      const ph = PIX_H * pScale + Math.round(5 * kk * dpr);
      const py = Math.round(curY + (tH - ph) / 2);
      g.fillStyle = col; g.fillRect(tx, py, pw, ph);
      g.fillStyle = fill; g.fillRect(tx + bdr, py + bdr, pw - 2 * bdr, ph - 2 * bdr);
      drawPix(g, loc, tx + Math.round(5 * kk * dpr), py + Math.round(2.5 * kk * dpr), { scale: pScale, color: col, outline: null, align: 'left' });
      tx += pw + Math.round(6 * kk * dpr);
    };
    const kindTag = e.tag || (e.kind === 'base' ? '佩刀招式' : e.kind === 'arcana' ? '悟性牌' : e.kind === 'keepsake' ? '随身信物' : '');
    if (kindTag) drawPill(kindTag, innerCol, '#14111a');
    if (e.badge) drawPill(e.badge.text, e.badge.col, e.badge.hot ? '#322010' : '#14111a');

    curY += tH + Math.round(7 * kk * dpr);
    g.fillStyle = '#383042';
    g.fillRect(boxX, curY, boxW, Math.max(1, Math.round(dpr)));
    curY += Math.round(8 * kk * dpr);

    // Effect description (wrapped up to 2 lines) with full Hades-2 inline pixel icons!
    const effPx = Math.round((compact ? 13 : 14) * kk * dpr);
    const effStr = localize(e.effect);
    const lines = this.wrapRich(effStr, effPx, boxW);
    for (const ln of lines.slice(0, 2)) {
      let p = effPx;
      while (p > Math.round(10 * kk * dpr) && richLine(null, ln, 0, 0, p, '#f0e6d2', '#fff6b8', true, true) > boxW) p -= 1;
      richLine(g, ln, boxX, curY, p, '#f0e6d2', '#fff6b8', true, true);
      curY += Math.ceil(p * 1.32);
    }

    // Stat / Cost / Timing pill (icon-rich!)
    if (e.num) {
      curY += Math.round(3 * kk * dpr);
      const numPx = Math.round((compact ? 12 : 13) * kk * dpr);
      const numStr = localize(e.num);
      let np = numPx;
      const maxNumW = boxW - Math.round(16 * kk * dpr);
      while (np > Math.round(9.5 * kk * dpr) && richLine(null, numStr, 0, 0, np, '#ffe8aa', '#fff8c8', true, true) > maxNumW) np -= 1;
      const nw = richLine(null, numStr, 0, 0, np, '#ffe8aa', '#fff8c8', true, true);
      const pillH = Math.ceil(np * 1.28) + Math.round(6 * kk * dpr);
      const pillW = Math.min(boxW, Math.ceil(nw) + Math.round(16 * kk * dpr));
      g.fillStyle = '#241d18'; g.fillRect(boxX, curY, pillW, pillH);
      g.fillStyle = '#9a7842'; g.fillRect(boxX, curY, pillW, Math.max(1, Math.round(dpr)));
      g.fillStyle = '#9a7842'; g.fillRect(boxX, curY, Math.max(2, Math.round(2 * dpr)), pillH);
      richLine(g, numStr, boxX + Math.round(8 * kk * dpr), curY + Math.round(3 * kk * dpr), np, '#f2e4c4', '#fff8c0', true, true);
      curY += pillH + Math.round(6 * kk * dpr);
    }

    // Attached Boons currently augmenting this base move slot!
    const bottomLimit = H - padY - u;
    if (e.attached && e.attached.length && curY + Math.round(24 * kk * dpr) < bottomLimit) {
      const hdrS = Math.max(1, Math.floor((11.5 * kk * dpr) / PIX_H));
      drawPix(g, localize('本局已挂载秘传'), boxX, curY, { scale: hdrS, color: '#ffd878', outline: '#08060c', align: 'left' });
      curY += PIX_H * hdrS + Math.round(5 * kk * dpr);
      const bPx = Math.round((compact ? 11.5 : 12.5) * kk * dpr);
      for (const ab of e.attached.slice(0, 2)) {
        if (curY + Math.ceil(bPx * 1.35) > bottomLimit) break;
        const rowH = Math.ceil(bPx * 1.32) + Math.round(4 * kk * dpr);
        g.fillStyle = '#1b1622'; g.fillRect(boxX, curY, boxW, rowH);
        g.fillStyle = ab.col; g.fillRect(boxX, curY, Math.max(2, Math.round(2.5 * dpr)), rowH);
        const lineTxt = `${localize(ab.name)} · ${localize(ab.eff)}`;
        let lp = bPx;
        while (lp > Math.round(9.5 * kk * dpr) && richLine(null, lineTxt, 0, 0, lp, '#e8dec8', '#fff4b0', true, true) > boxW - Math.round(14 * kk * dpr)) lp -= 1;
        richLine(g, lineTxt, boxX + Math.round(8 * kk * dpr), curY + Math.round(2 * kk * dpr), lp, '#e8dec8', '#fff4b0', true, true);
        curY += rowH + Math.round(4 * kk * dpr);
      }
    }

    // Optional clickable 「实景演武」 button at bottom-right for learned manuals
    if (e.kind === 'manual' && this.canPlay3d) {
      const btnTxt = localize('实景演武');
      const bs = Math.max(1, Math.floor((12.5 * kk * dpr) / PIX_H));
      const bw = pixW(btnTxt) * bs + Math.round(22 * kk * dpr);
      const bh = PIX_H * bs + Math.round(10 * kk * dpr);
      const bx = boxX + boxW - bw;
      const by = bottomLimit - bh;
      const hot = this.demoBtnHot;
      drawPixelPlaque(g, bx, by, bw, bh, Math.max(1, Math.round(1.5 * kk * dpr)), {
        bg: hot ? '#483016' : '#2e2012', hi: hot ? '#6a4822' : '#46321c', border: '#07050a',
        inner: hot ? '#fffef0' : '#e0aa4e', rivets: true,
      });
      if (hot) drawFocusBrackets(g, bx, by, bw, bh, Math.max(1, Math.round(1.5 * kk * dpr)));
      drawPix(g, btnTxt, bx + bw / 2, Math.round(by + (bh - PIX_H * bs) / 2), {
        scale: bs, color: hot ? '#fffce0' : '#ffe6a0', outline: '#08060c', align: 'center',
      });
      this.demoBtnRect = { x: left0 + bx / dpr, y: top0 + by / dpr, w: bw / dpr, h: bh / dpr };
    } else {
      this.demoBtnRect = null;
    }
  }

  private wrapRich(txt: string, px: number, maxW: number): string[] {
    if (richLine(null, txt, 0, 0, px, '#fff', '#fff', true, true) <= maxW) return [txt];
    const sep = txt.search(/[，。；、·]/);
    if (sep > 2 && sep < txt.length - 2) return [txt.slice(0, sep + 1), txt.slice(sep + 1).trim()];
    const mid = Math.ceil(txt.length / 2);
    return [txt.slice(0, mid), txt.slice(mid)];
  }

  /** 100% Graphical Pixel-Craft Input Teaching Bar — synchronized frame-for-frame with the 3D Mini-World above. */
  private paintBeatBar(
    g: CanvasRenderingContext2D, _e: SkillEntry, beat: BeatState,
    x: number, y: number, w: number, h: number, kk: number, dpr: number,
  ) {
    const nodes = beat.nodes;
    if (!nodes.length) return;
    const p = Math.max(1, Math.round(2 * kk * dpr));
    const medSz = Math.min(Math.round(h * 0.62), Math.round(44 * kk * dpr));
    const midY = Math.round(y + h * 0.56);
    const gap = Math.round(10 * kk * dpr);
    const arrowW = Math.round(12 * kk * dpr);

    // Measure every node's pixel width so the entire sequence sits cleanly centered!
    const widthOf = (nd: BeatNode): number => {
      if (nd.kind === 'btn') {
        let nw = medSz;
        if (nd.dir) nw += Math.round(20 * kk * dpr);
        if (nd.pips) nw += Math.round(8 * kk * dpr) + nd.pips.total * Math.round(13 * kk * dpr) + (nd.pips.heavyLast ? Math.round(5 * kk * dpr) : 0);
        return nw;
      }
      if (nd.kind === 'danger') return Math.round(76 * kk * dpr);
      if (nd.kind === 'pause') return Math.round(40 * kk * dpr);
      if (nd.kind === 'air' || nd.kind === 'pin') return Math.round(36 * kk * dpr);
      if (nd.kind === 'qte') return Math.round(46 * kk * dpr);
      if (nd.kind === 'aura') return Math.round(54 * kk * dpr);
      return Math.round(30 * kk * dpr); // burst
    };

    const widths = nodes.map(widthOf);
    const totalW = widths.reduce((a, b) => a + b, 0) + Math.max(0, nodes.length - 1) * (arrowW + gap);
    const scaleX = totalW > w ? w / totalW : 1;
    let cx = Math.round(x + Math.max(0, (w - totalW * scaleX) / 2));

    for (let i = 0; i < nodes.length; i++) {
      if (i > 0) {
        const prevDone = nodes[i - 1].state > 0;
        const ax = Math.round(cx + (gap * 0.5) * scaleX);
        this.drawFlowArrow(g, ax, midY, Math.max(1, Math.round(p * scaleX)), prevDone, beat.accent);
        cx += Math.round((arrowW + gap) * scaleX);
      }
      const nd = nodes[i];
      const nw = Math.round(widths[i] * scaleX);
      const sz = Math.round(medSz * scaleX);
      const u = Math.max(1, Math.round(p * scaleX));
      if (nd.kind === 'btn') {
        this.drawActionNode(g, nd, cx, midY, sz, u, kk * scaleX, dpr, beat.pulseT);
      } else if (nd.kind === 'danger') {
        this.drawDangerTrack(g, nd, cx, midY, nw, Math.round(sz * 0.62), u, beat.pulseT);
      } else if (nd.kind === 'pause') {
        this.drawPauseNode(g, nd, cx + Math.round(nw / 2), midY, u);
      } else if (nd.kind === 'air') {
        this.drawAirNode(g, nd, cx + Math.round(nw / 2), midY, u);
      } else if (nd.kind === 'pin') {
        this.drawPinNode(g, nd, cx + Math.round(nw / 2), midY, u, beat.pulseT);
      } else if (nd.kind === 'qte') {
        this.drawQteNode(g, nd, cx + Math.round(nw / 2), midY, u);
      } else if (nd.kind === 'aura') {
        this.drawAuraNode(g, nd, cx + Math.round(nw / 2), midY, sz, u, beat.pulseT);
      } else {
        this.drawBurstNode(g, nd, cx + Math.round(nw / 2), midY, u, beat.pulseT);
      }
      cx += nw;
    }
  }

  private drawFlowArrow(g: CanvasRenderingContext2D, x: number, cy: number, u: number, lit: boolean, col: string) {
    g.fillStyle = lit ? col : '#4a4256';
    const px = Math.max(1, u);
    g.fillRect(x, cy - 3 * px, px, 6 * px);
    g.fillRect(x + px, cy - 2 * px, px, 4 * px);
    g.fillRect(x + 2 * px, cy - px, px, 2 * px);
  }

  private drawDirCross(g: CanvasRenderingContext2D, cx: number, cy: number, dir: StickDir, lit: boolean, u: number) {
    const px = Math.max(1, u);
    const arm = 3 * px;
    g.fillStyle = '#252030';
    g.fillRect(cx - arm - px, cy - px, arm * 2 + 2 * px, 2 * px);
    g.fillRect(cx - px, cy - arm - px, 2 * px, arm * 2 + 2 * px);
    g.fillStyle = lit ? '#7cf0ff' : '#5898b0';
    if (dir === 'toFoe') {
      g.fillRect(cx + px, cy - px, arm, 2 * px);
      g.fillRect(cx + arm + px, cy - 2 * px, px, 4 * px);
      g.fillRect(cx + arm + 2 * px, cy - px, px, 2 * px);
    } else if (dir === 'away') {
      g.fillRect(cx - arm - px, cy - px, arm, 2 * px);
      g.fillRect(cx - arm - 2 * px, cy - 2 * px, px, 4 * px);
      g.fillRect(cx - arm - 3 * px, cy - px, px, 2 * px);
    } else if (dir === 'side') {
      g.fillRect(cx - px, cy - arm - px, 2 * px, arm);
      g.fillRect(cx - 2 * px, cy - arm - 2 * px, 4 * px, px);
      g.fillRect(cx - px, cy + px, 2 * px, arm);
      g.fillRect(cx - 2 * px, cy + arm + px, 4 * px, px);
    }
    g.fillStyle = '#d8e4f0';
    g.fillRect(cx - Math.ceil(px / 2), cy - Math.ceil(px / 2), px, px);
  }

  /** Draws an octagonal forged-iron action medallion + gesture indicator (tap/hold-ring/release) + device key badge + optional combo pips. */
  private drawActionNode(
    g: CanvasRenderingContext2D, nd: BeatNode,
    x: number, midY: number, sz: number, u: number, kk: number, dpr: number, pulseT: number,
  ) {
    const px = Math.max(1, u);
    let curX = x;
    const active = nd.state === 1;
    const done = nd.state === 2;
    const accent = nd.col ?? '#ffd872';

    // Optional directional stick graphic to the left
    if (nd.dir) {
      const dirW = Math.round(18 * kk * dpr);
      this.drawDirCross(g, curX + Math.round(dirW / 2), midY, nd.dir, active || done, Math.max(1, Math.round(px * 0.85)));
      curX += dirW + Math.round(2 * kk * dpr);
    }

    const sinkY = active && nd.gesture !== 'release' ? Math.round(2.5 * kk * dpr) : 0;
    const mx = curX;
    const my = Math.round(midY - sz / 2) + sinkY;
    const cut = Math.max(2, Math.round(sz * 0.18));

    // Octagonal drop shadow (shrinks when pressed down!)
    if (!sinkY) {
      g.fillStyle = '#050408';
      this.fillOct(g, mx, my + Math.round(3 * kk * dpr), sz, cut);
    }

    // Octagonal forged-iron medallion outer rim
    const rimCol = active ? accent : done ? '#b89452' : '#524b5e';
    g.fillStyle = '#09070d';
    this.fillOct(g, mx - px, my - px, sz + 2 * px, cut + px);
    g.fillStyle = rimCol;
    this.fillOct(g, mx, my, sz, cut);
    // Inner recessed dark steel plate
    const inset = Math.max(2, Math.round(sz * 0.11));
    g.fillStyle = active ? '#2e241c' : done ? '#1f1a24' : '#14111c';
    this.fillOct(g, mx + inset, my + inset, sz - 2 * inset, Math.max(1, cut - Math.round(inset * 0.6)));
    // Top specular highlight edge on medallion
    g.fillStyle = active ? '#fff4b8' : done ? '#e4c278' : '#7a7288';
    g.fillRect(mx + cut, my, sz - 2 * cut, Math.max(1, Math.round(dpr)));

    // Hold gesture: wrap a live filling pixel charge-ring perimeter around the medallion!
    if (nd.gesture === 'hold') {
      const fill = Math.max(0, Math.min(1, nd.fill ?? 0));
      const segs = 20;
      const litSegs = Math.round(fill * segs);
      const ringR = sz / 2 + px * 1.4;
      const mcx = mx + sz / 2, mcy = my + sz / 2;
      for (let s = 0; s < segs; s++) {
        const ang = -Math.PI / 2 + (s / segs) * Math.PI * 2;
        const sx = Math.round(mcx + Math.cos(ang) * ringR - px / 2);
        const sy = Math.round(mcy + Math.sin(ang) * ringR - px / 2);
        g.fillStyle = s < litSegs ? (fill >= 0.88 ? '#fff6a8' : '#ff9a38') : '#2c2536';
        g.fillRect(sx, sy, Math.max(2, px + 1), Math.max(2, px + 1));
      }
    }

    // Crisp 11×11 hand-crafted pixel Action Icon inside the medallion
    const icoP = Math.max(1, Math.floor((sz - 2 * inset) / 13));
    this.drawActionIcon(g, nd.btn ?? 'attack', mx + Math.round(sz / 2), my + Math.round(sz / 2) - Math.round(icoP * 0.4), icoP, active, done);

    // Top animated Gesture Indicator (ZERO text — pure visual arrows!)
    const topY = my - Math.round(4 * kk * dpr);
    const mcx = mx + Math.round(sz / 2);
    if (nd.gesture === 'hold') {
      // Double downward clamp arrow ⟱ while holding
      const col = active ? '#ffbe48' : done ? '#c89a48' : '#7a7088';
      g.fillStyle = col;
      const ay = topY - 4 * px + (active ? px : 0);
      g.fillRect(mcx - 3 * px, ay - 2 * px, 6 * px, px);
      g.fillRect(mcx - 3 * px, ay, 6 * px, px);
      g.fillRect(mcx - 2 * px, ay + px, 4 * px, px);
      g.fillRect(mcx - px, ay + 2 * px, 2 * px, px);
    } else if (nd.gesture === 'release') {
      // Upward spring release arrow ▲ + pixel sparks on release
      const lift = active ? -2 * px : 0;
      const col = active ? '#fff498' : done ? '#d8b25c' : '#7a7088';
      g.fillStyle = col;
      const ay = topY - px + lift;
      g.fillRect(mcx - px, ay - 3 * px, 2 * px, px);
      g.fillRect(mcx - 2 * px, ay - 2 * px, 4 * px, px);
      g.fillRect(mcx - 3 * px, ay - px, 6 * px, px);
      if (active) {
        g.fillStyle = '#ffe068';
        g.fillRect(mcx - 5 * px, ay - 2 * px, px, px);
        g.fillRect(mcx + 4 * px, ay - 2 * px, px, px);
        g.fillRect(mcx - 4 * px, ay - 4 * px, px, px);
        g.fillRect(mcx + 3 * px, ay - 4 * px, px, px);
      }
    } else {
      // Tap downward chevron ▼ slamming into medallion when pressed
      const slam = active ? 2 * px : 0;
      g.fillStyle = active ? '#fff098' : done ? '#c8a660' : '#6c647c';
      const ay = topY - 3 * px + slam;
      g.fillRect(mcx - 2 * px, ay, 4 * px, px);
      g.fillRect(mcx - px, ay + px, 2 * px, px);
    }

    // 4-corner impact sparks around medallion on active press
    if (active) {
      g.fillStyle = '#fff4a8';
      const sp = Math.round(2 * kk * dpr);
      g.fillRect(mx - sp * 2, my - sp, sp, sp);
      g.fillRect(mx + sz + sp, my - sp, sp, sp);
      g.fillRect(mx - sp * 2, my + sz, sp, sp);
      g.fillRect(mx + sz + sp, my + sz, sp, sp);
    }

    // Compact device key / gamepad glyph tucked neatly into bottom-right corner
    this.drawCornerKeyBadge(g, nd.btn ?? 'attack', mx + sz, my + sz, active, kk, dpr, pulseT);

    curX += sz;

    // Optional multi-hit combo pips (e.g. 连环刀 5-hit ■ ■ ■ ■ ◆, 柳叶镖 3-dart ■ ■ ■)
    if (nd.pips) {
      curX += Math.round(8 * kk * dpr);
      const { total, done: hitDone, heavyLast } = nd.pips;
      const pipSz = Math.round(9 * kk * dpr);
      const pipGap = Math.round(4 * kk * dpr);
      for (let k = 0; k < total; k++) {
        const isLastHeavy = !!heavyLast && k === total - 1;
        const lit = k < hitDone;
        const justHit = k === hitDone - 1 && active;
        const py = Math.round(midY - pipSz / 2);
        if (isLastHeavy) {
          // Larger golden diamond for final heavy chop!
          const cxD = curX + Math.round(pipSz * 0.7), cyD = midY;
          const r = Math.round(pipSz * 0.72);
          g.fillStyle = '#09070d';
          this.fillDiamond(g, cxD, cyD, r + px);
          g.fillStyle = justHit ? '#fff8c0' : lit ? '#ffae44' : '#3a3246';
          this.fillDiamond(g, cxD, cyD, r);
          if (lit) {
            g.fillStyle = '#fff4a0';
            this.fillDiamond(g, cxD, cyD, Math.max(1, Math.round(r * 0.45)));
          }
          curX += Math.round(pipSz * 1.4) + pipGap;
        } else {
          g.fillStyle = '#09070d';
          g.fillRect(curX - 1, py - 1, pipSz + 2, pipSz + 2);
          g.fillStyle = justHit ? '#fff6a8' : lit ? accent : '#2e283a';
          g.fillRect(curX, py, pipSz, pipSz);
          if (lit) {
            g.fillStyle = '#ffffff';
            g.fillRect(curX + 1, py + 1, Math.max(1, pipSz - 2), Math.max(1, Math.round(dpr)));
          }
          curX += pipSz + pipGap;
        }
      }
    }
  }

  /** Compact keyboard keycap (with pure pixel spacebar glyph ␣ instead of Chinese text!), gamepad face button glyph, or touch ripple. */
  private drawCornerKeyBadge(
    g: CanvasRenderingContext2D, btn: BtnName, rx: number, by: number, lit: boolean, kk: number, dpr: number, pulseT: number,
  ) {
    const aKey = ACTION_BTN_KEY[btn] as 'attack' | 'dash' | 'jump' | 'special';
    const dev = PAD.device;
    if (dev === 'pad') {
      const idx = btn === 'ult' ? 7 : BIND.pad[aKey][0];
      const gs = Math.max(1, Math.round((13 * kk * dpr) / GLYPH_H));
      const gw = glyphArt(idx).w * gs, gh = GLYPH_H * gs;
      const bx = rx - Math.round(gw * 0.65), yy = by - Math.round(gh * 0.72);
      g.fillStyle = '#09070d';
      g.fillRect(bx - Math.round(dpr), yy - Math.round(dpr), gw + Math.round(2 * dpr), gh + Math.round(2 * dpr));
      paintGlyph(g, idx, bx, yy, gs);
      return;
    }
    if (dev === 'touch') {
      const r = Math.round(6 * kk * dpr);
      const cx = rx - Math.round(r * 0.4), cy = by - Math.round(r * 0.4);
      g.fillStyle = '#09070d';
      g.fillRect(cx - r - 1, cy - r - 1, r * 2 + 2, r * 2 + 2);
      g.fillStyle = lit ? '#fff088' : '#80c8e8';
      g.fillRect(cx - r, cy - r, r * 2, r * 2);
      g.fillStyle = '#14111c';
      g.fillRect(cx - r + 2, cy - r + 2, Math.max(2, r * 2 - 4), Math.max(2, r * 2 - 4));
      const dot = Math.max(2, Math.round((lit ? 3.5 : 2 + Math.sin(pulseT * 6) * 0.6) * kk * dpr));
      g.fillStyle = lit ? '#ffffff' : '#a8e8ff';
      g.fillRect(cx - Math.round(dot / 2), cy - Math.round(dot / 2), dot, dot);
      return;
    }
    // Keyboard badge: pure spacebar bracket icon for Space, crisp single-letter keycap for J/K/L/I
    const rawKey = btn === 'ult' ? 'i' : BIND.key[aKey][0];
    const isSpace = rawKey === ' ';
    const bh = Math.round(14 * kk * dpr);
    const bw = isSpace ? Math.round(22 * kk * dpr) : Math.round(15 * kk * dpr);
    const bx = rx - Math.round(bw * 0.62);
    const yy = by - Math.round(bh * 0.72);
    const b = Math.max(1, Math.round(dpr));
    g.fillStyle = '#07050b';
    g.fillRect(bx - b, yy - b, bw + 2 * b, bh + 2 * b);
    g.fillStyle = lit ? '#ffd868' : '#9c8c74';
    g.fillRect(bx, yy, bw, bh);
    g.fillStyle = lit ? '#3c2a12' : '#1b1724';
    g.fillRect(bx + b, yy + b, bw - 2 * b, bh - 2 * b);
    if (isSpace) {
      // Pure pixel spacebar symbol ╰───╯ (zero Chinese text!)
      const u = Math.max(1, Math.round(1.4 * kk * dpr));
      const sx = bx + Math.round(bw * 0.2), sw = Math.round(bw * 0.6), sy = yy + Math.round(bh * 0.64);
      g.fillStyle = lit ? '#fff8c8' : '#e8dcc6';
      g.fillRect(sx, sy, sw, u);
      g.fillRect(sx, sy - 2 * u, u, 2 * u);
      g.fillRect(sx + sw - u, sy - 2 * u, u, 2 * u);
    } else {
      const ch = btn === 'ult' ? 'I' : actKey(aKey).slice(0, 2);
      const ks = Math.max(1, Math.round((10 * kk * dpr) / PIX_H));
      drawPix(g, ch, bx + Math.round(bw / 2), yy + Math.round((bh - PIX_H * ks) / 2), {
        scale: ks, color: lit ? '#fff8c8' : '#f2e8d4', outline: null, align: 'center',
      });
    }
  }

  /** Crisp 11×11 pixel art action icons inside the iron medallion (Blade, Boot, Crane-Jump, Willow Dart, Unseen-Blade Crest). */
  private drawActionIcon(g: CanvasRenderingContext2D, btn: BtnName, cx: number, cy: number, p: number, active: boolean, done: boolean) {
    const hi = active ? '#ffffff' : done ? '#f4ecd8' : '#c4bcc8';
    const mid = active ? '#ffe898' : done ? '#c8d6e4' : '#8a92a4';
    const px = (dx: number, dy: number, col: string, w = 1, h = 1) => {
      g.fillStyle = col;
      g.fillRect(cx + dx * p, cy + dy * p, w * p, h * p);
    };
    if (btn === 'attack') {
      // Slanted Han-Dao blade with brass guard and red pommel tassel
      for (let i = -4; i <= 2; i++) {
        px(i + 1, -i - 1, hi);
        px(i, -i - 1, mid);
      }
      px(4, -5, '#ffffff');
      px(-2, 1, '#e8b048', 3, 1); px(-1, 2, '#e8b048');
      px(-3, 3, '#7a5038'); px(-4, 4, '#d84848');
    } else if (btn === 'dash') {
      // Speeding iron boot + cyan wind streaks
      const wind = active ? '#88f4ff' : '#58a8c4';
      px(-5, -2, wind, 3, 1); px(-6, 0, wind, 4, 1); px(-4, 2, wind, 2, 1);
      px(-1, -3, mid, 3, 4);
      px(-1, 1, hi, 6, 2);
      px(3, 0, hi, 2, 1);
      px(0, -3, '#e8b048', 2, 1);
    } else if (btn === 'jump') {
      // Soaring upward crane arrow
      const col = active ? '#98f4ff' : hi;
      px(0, -5, col, 1, 8);
      px(-1, -4, col, 3, 1);
      px(-2, -3, col, 5, 1);
      px(-3, -2, col, 2, 1); px(2, -2, col, 2, 1);
      px(-2, 1, mid, 5, 1); px(-3, 2, mid, 2, 1); px(2, 2, mid, 2, 1);
    } else if (btn === 'special') {
      // Diagonal willow-leaf dart with indigo glint
      const tip = active ? '#a4d8ff' : hi;
      px(3, -4, '#ffffff', 2, 2);
      px(2, -3, tip, 2, 2);
      px(1, -2, tip, 2, 2);
      px(0, -1, '#7898e8', 2, 2);
      px(-1, 0, '#7898e8', 2, 2);
      px(-2, 1, mid); px(-3, 2, '#e8b048', 2, 1); px(-4, 3, '#d84848');
    } else {
      // Golden Unseen-Blade cross-slash crest
      const gold = active ? '#fff8a0' : '#f2c44e';
      for (let i = -4; i <= 4; i++) { px(i, -i, gold); px(i, i, '#ff9838'); }
      px(-1, -1, '#ffffff', 3, 3);
    }
  }

  /** Horizontal crimson danger timing track into a glowing gold sweet-spot gate (Parry & Perfect Dodge Counter). */
  private drawDangerTrack(
    g: CanvasRenderingContext2D, nd: BeatNode, x: number, midY: number, w: number, h: number, u: number, _pulseT: number,
  ) {
    const px = Math.max(1, u);
    const ty = Math.round(midY - h / 2);
    const fill = Math.max(0, Math.min(1, nd.fill ?? 0));
    const hit = nd.state === 2;

    // Recessed track trough
    g.fillStyle = '#07050c';
    g.fillRect(x - px, ty - px, w + 2 * px, h + 2 * px);
    g.fillStyle = '#1b1524';
    g.fillRect(x, ty, w, h);
    // Center hairline
    g.fillStyle = '#382e46';
    g.fillRect(x + 2 * px, midY - Math.ceil(px / 2), w - 4 * px, px);

    // Gold sweet-spot parry/dodge gate on right end
    const gateW = Math.max(Math.round(w * 0.24), 6 * px);
    const gateX = x + w - gateW - px;
    g.fillStyle = hit ? '#fff6a8' : '#5e461e';
    g.fillRect(gateX, ty + px, gateW, h - 2 * px);
    g.fillStyle = hit ? '#ffffff' : '#ffd868';
    g.fillRect(gateX, ty, gateW, px);
    g.fillRect(gateX, ty + h - px, gateW, px);
    g.fillRect(gateX, ty, px, h);
    g.fillRect(gateX + gateW - px, ty, px, h);
    // Sweet-spot diamond inside gate
    this.fillDiamond(g, gateX + Math.round(gateW / 2), midY, Math.max(2, Math.round(h * 0.22)));

    // Traveling crimson enemy slash projectile approaching the gold gate!
    const travel = Math.max(4, gateX + Math.round(gateW / 2) - (x + 3 * px));
    const bx = Math.round(x + 3 * px + travel * fill);
    if (nd.state >= 1) {
      // Red motion trail
      const trailW = Math.min(bx - x - px, 7 * px);
      if (trailW > 0) {
        g.fillStyle = hit ? '#ffaa58' : '#962428';
        g.fillRect(bx - trailW, midY - px, trailW, 2 * px);
      }
      // Sharp crimson incoming wave chevron
      g.fillStyle = hit ? '#ffffff' : '#ff4c3c';
      this.fillDiamond(g, bx, midY, Math.max(2, Math.round(h * 0.28)));
      if (hit) {
        g.fillStyle = '#ffe878';
        g.fillRect(gateX - 2 * px, ty - 2 * px, px, px);
        g.fillRect(gateX + gateW + px, ty - 2 * px, px, px);
        g.fillRect(gateX - 2 * px, ty + h + px, px, px);
        g.fillRect(gateX + gateW + px, ty + h + px, px, px);
      }
    }
  }

  /** Pause-beat graphical node: pixel hourglass + 3 rhythm dots lighting 1-2-3. */
  private drawPauseNode(g: CanvasRenderingContext2D, nd: BeatNode, cx: number, midY: number, u: number) {
    const px = Math.max(1, u);
    const fill = Math.max(0, Math.min(1, nd.fill ?? 0));
    const lit = nd.state > 0;
    const hy = midY - 4 * px;
    // Pixel hourglass above
    g.fillStyle = lit ? '#ffd872' : '#6c647c';
    g.fillRect(cx - 3 * px, hy - 3 * px, 6 * px, px);
    g.fillRect(cx - 2 * px, hy - 2 * px, 4 * px, px);
    g.fillRect(cx - px, hy - px, 2 * px, 2 * px);
    g.fillRect(cx - 2 * px, hy + px, 4 * px, px);
    g.fillRect(cx - 3 * px, hy + 2 * px, 6 * px, px);
    // 3 chunky rhythm dots below
    for (let k = 0; k < 3; k++) {
      const on = nd.state === 2 || (nd.state === 1 && fill >= (k + 0.3) / 3);
      g.fillStyle = on ? '#fff088' : '#3a3248';
      g.fillRect(cx + (k - 1) * 4 * px - px, midY + 2 * px, 2 * px, 2 * px);
    }
  }

  /** Airborne arc graphical node: ground line + parabolic jump arc + glowing peak dot. */
  private drawAirNode(g: CanvasRenderingContext2D, nd: BeatNode, cx: number, midY: number, u: number) {
    const px = Math.max(1, u);
    const lit = nd.state > 0;
    const col = lit ? (nd.col ?? '#84e4ff') : '#5e5870';
    // Ground baseline
    g.fillStyle = '#504860';
    g.fillRect(cx - 6 * px, midY + 4 * px, 12 * px, px);
    // Parabolic dotted arc
    g.fillStyle = col;
    const pts: Array<[number, number]> = [[-5, 2], [-3, -1], [-1, -3], [1, -3], [3, -1], [5, 2]];
    for (const [dx, dy] of pts) g.fillRect(cx + dx * px, midY + dy * px, px, px);
    // Peak airborne marker
    g.fillStyle = nd.state === 1 ? '#ffffff' : col;
    g.fillRect(cx - px, midY - 5 * px, 2 * px, 2 * px);
  }

  /** Pinned dart graphical node: foe core + stuck dart + indigo pulse ring. */
  private drawPinNode(g: CanvasRenderingContext2D, nd: BeatNode, cx: number, midY: number, u: number, pulseT: number) {
    const px = Math.max(1, u);
    const lit = nd.state > 0;
    const col = lit ? (nd.col ?? '#a884ff') : '#5e5870';
    // Expanding square indigo pulse ring
    const r = 4 * px + (nd.state === 1 ? Math.round(((pulseT * 3) % 1) * 3 * px) : 0);
    g.fillStyle = col;
    g.fillRect(cx - r, midY - r, r * 2, px);
    g.fillRect(cx - r, midY + r - px, r * 2, px);
    g.fillRect(cx - r, midY - r, px, r * 2);
    g.fillRect(cx + r - px, midY - r, px, r * 2);
    // Crimson foe core + diagonal cyan stuck dart
    g.fillStyle = lit ? '#ff7868' : '#784848';
    g.fillRect(cx - 2 * px, midY - 2 * px, 4 * px, 4 * px);
    g.fillStyle = lit ? '#a8f4ff' : '#8094a8';
    g.fillRect(cx + px, midY - 3 * px, 2 * px, px);
    g.fillRect(cx + 2 * px, midY - 4 * px, 2 * px, px);
  }

  /** Unseen-Blade QTE node: 3 glowing golden resolve diamonds + contracting golden QTE ring. */
  private drawQteNode(g: CanvasRenderingContext2D, nd: BeatNode, cx: number, midY: number, u: number) {
    const px = Math.max(1, u);
    const fill = Math.max(0, Math.min(1, nd.fill ?? 0));
    const r = Math.max(3 * px, Math.round((8 - fill * 4.5) * px));
    g.fillStyle = nd.state === 1 ? '#fff088' : '#9c7c38';
    g.fillRect(cx - r, midY - r, r * 2, px);
    g.fillRect(cx - r, midY + r - px, r * 2, px);
    g.fillRect(cx - r, midY - r, px, r * 2);
    g.fillRect(cx + r - px, midY - r, px, r * 2);
    // 3 golden resolve ingots inside
    for (let k = -1; k <= 1; k++) {
      g.fillStyle = '#ffe068';
      this.fillDiamond(g, cx + k * 4 * px, midY, Math.max(2, Math.round(1.6 * px)));
    }
  }

  /** Passive Resonance Aura node for Arcana & Keepsakes (pulsing concentric octagonal rings, zero button press). */
  private drawAuraNode(g: CanvasRenderingContext2D, nd: BeatNode, cx: number, midY: number, sz: number, u: number, pulseT: number) {
    const px = Math.max(1, u);
    const col = nd.col ?? '#70eda8';
    const w1 = ((pulseT * 0.9) % 1);
    const w2 = (((pulseT * 0.9) + 0.5) % 1);
    for (const wv of [w1, w2]) {
      const r = Math.round(sz * (0.28 + wv * 0.34));
      g.fillStyle = col;
      g.globalAlpha = Math.max(0.12, 0.85 * (1 - wv));
      g.fillRect(cx - r, midY - r, r * 2, px);
      g.fillRect(cx - r, midY + r - px, r * 2, px);
      g.fillRect(cx - r, midY - r, px, r * 2);
      g.fillRect(cx + r - px, midY - r, px, r * 2);
    }
    g.globalAlpha = 1;
    const core = Math.round(sz * 0.28);
    g.fillStyle = '#09070d';
    this.fillDiamond(g, cx, midY, core + px);
    g.fillStyle = col;
    this.fillDiamond(g, cx, midY, core);
    g.fillStyle = '#ffffff';
    this.fillDiamond(g, cx, midY, Math.max(2, Math.round(core * 0.4)));
  }

  /** Impact / Boon activation starburst crest flashing in the move's accent color. */
  private drawBurstNode(g: CanvasRenderingContext2D, nd: BeatNode, cx: number, midY: number, u: number, _pulseT: number) {
    const px = Math.max(1, u);
    const active = nd.state === 1;
    const lit = nd.state > 0;
    const col = active ? '#fff8b8' : lit ? (nd.col ?? '#ffd868') : '#3f384e';
    const r = active ? 6 * px : 4 * px;
    g.fillStyle = col;
    g.fillRect(cx - r, midY - Math.ceil(px / 2), r * 2, px);
    g.fillRect(cx - Math.ceil(px / 2), midY - r, px, r * 2);
    const d = Math.round(r * 0.65);
    g.fillRect(cx - d, midY - d, px, px);
    g.fillRect(cx + d - px, midY - d, px, px);
    g.fillRect(cx - d, midY + d - px, px, px);
    g.fillRect(cx + d - px, midY + d - px, px, px);
    this.fillDiamond(g, cx, midY, active ? 3 * px : 2 * px);
  }

  private fillOct(g: CanvasRenderingContext2D, x: number, y: number, sz: number, cut: number) {
    g.fillRect(x + cut, y, sz - 2 * cut, sz);
    g.fillRect(x, y + cut, sz, sz - 2 * cut);
    for (let i = 1; i < cut; i++) {
      g.fillRect(x + cut - i, y + i, sz - 2 * (cut - i), sz - 2 * i);
    }
  }

  private fillDiamond(g: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
    for (let dy = -r; dy <= r; dy++) {
      const span = r - Math.abs(dy);
      g.fillRect(cx - span, cy + dy, span * 2 + 1, 1);
    }
  }
}
