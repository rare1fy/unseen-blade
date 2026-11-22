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
import { drawPixelPlaque, drawMiniIcon, richLine } from './uiPlate';
import { PAD, actKey, BIND, paintGlyph, glyphArt, GLYPH_H, paintKeyCap, keyCapWidth, KEYCAP_H } from './pad';
import { t as localize, msg } from './i18n';
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

interface BeatState {
  phase: string;
  activeBtns: BtnName[];
  holdBtn?: BtnName;
  holdFill?: number;
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
  private phase = '';
  private holdBtn?: BtnName;
  private holdFill?: number;
  private flags = new Set<string>();
  private auraT = 0;
  private keys: ReturnType<typeof manualSteps> = [];
  private manualScript: ManualScript | null = null;

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
    grp.add(this.hShad, this.fShad);
    scene.add(grp);
    this.dojo = grp;
  }

  start(entry: SkillEntry, heroDef: ModelDef, weaponId: WeaponId, weaponLv: number) {
    this.entry = entry;
    this.heroDef = heroDef;
    this.weaponId = entry.weaponId ?? weaponId;
    this.weaponLv = weaponLv;
    this.ensureDojo();
    this.spawnCycle(false);
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
      this.fade = 0; this.ending = -1; this.phase = ''; this.holdBtn = undefined; this.holdFill = undefined;
      this.flags.clear(); this.auraT = 0;
      this.stick.v.set(0, 0, 0); this.stick.t = 0;
      for (const k of Object.keys(this.hold) as BtnName[]) { this.hold[k] = 0; Object.assign(this.inp.b[k], newBtn()); }
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
    if (stick && this.g && this.foe) {
      const toF = this.foe.home.clone().sub(this.g.pos).setY(0);
      if (toF.lengthSq() > 1e-4) toF.normalize(); else toF.set(1, 0, 0);
      this.stick.v.copy(stick === 'toFoe' ? toF : stick === 'away' ? toF.multiplyScalar(-1) : V3(-toF.z, 0, toF.x));
      this.stick.t = Math.max(dur + 0.06, 0.14);
    }
  }

  update(dt: number): BeatState {
    if (!this.entry || !this.g) return { phase: '', activeBtns: [] };
    const g = this.g, foe = this.foe, e = this.entry, w = (this.w ??= this.world());
    this.t += dt;
    this.stick.t = Math.max(0, this.stick.t - dt);
    this.holdBtn = undefined; this.holdFill = undefined;

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
              this.lastT = this.t; this.si++; this.readyAt = 0;
            }
          } else if (this.t - this.lastT > sc.tail) {
            this.ending = 0;
          }
          if (this.t > 4.6) this.ending = 0;
          this.phase = this.si >= sc.steps.length ? '连招触发！' : msg`第 ${this.si + 1}/${sc.steps.length} 步`;
        } else if (e.kind === 'arcana' || e.kind === 'keepsake') {
          this.auraT += dt;
          if (this.auraT > 0.72) {
            this.auraT = 0;
            const col = e.kind === 'arcana' ? 0x7ef0aa : 0xffd868;
            fxRing(g.pos.clone().setY(0.08), col, 1.35, { life: 0.65 } as never);
            fxSparks(g.pos.clone().setY(1.0), col, 5, 1.6);
          }
          g.a.yaw = 0.35 + Math.sin(this.t * 1.1) * 0.25;
          this.phase = e.kind === 'arcana' ? '悟性牌入阵常驻生效' : '随身信物全程生效';
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

    const activeBtns: BtnName[] = [];
    for (const n of ['attack', 'dash', 'jump', 'special', 'ult'] as BtnName[]) {
      if (this.inp.b[n].down) activeBtns.push(n);
    }
    return { phase: this.phase, activeBtns, holdBtn: this.holdBtn, holdFill: this.holdFill };
  }

  /** Real 3D Hero choreography for all 10 base/weapon moves & all Boons. */
  private driveScript(e: SkillEntry, g: Hero, foe: BattleActor | null) {
    const id = e.id;
    const t = this.t;
    const once = (k: string, cond: boolean, fn: () => void) => {
      if (cond && !this.flags.has(k)) { this.flags.add(k); fn(); }
    };

    if (id === 'lianhuan' || (e.kind === 'boon' && e.target === 'attack')) {
      const hits = this.weaponId === 'thunder' ? 3 : this.weaponId === 'frost' ? 6 : this.weaponId === 'blunt' ? 2 : 5;
      const stepT = this.weaponId === 'frost' ? 0.28 : this.weaponId === 'thunder' ? 0.50 : 0.36;
      const start = 0.12;
      if (this.si < hits && t >= start + this.si * stepT) {
        this.pressBtn('attack', TAP, 'toFoe');
        this.si++;
      }
      this.phase = e.kind === 'boon' ? '出刀触发秘传！' : this.si > 0 ? `第 ${Math.min(this.si, hits)}/${hits} 段` : '准备连斩';
      if (t > start + hits * stepT + 0.85) this.ending = 0;
      return;
    }

    if (id === 'iai' || (e.kind === 'boon' && (e.steps?.includes('hold') ?? false))) {
      const holdDur = 0.72;
      if (t >= 0.22 && t < 0.22 + holdDur) {
        this.hold.attack = 0.08;
        this.holdBtn = 'attack';
        this.holdFill = Math.min(1, (t - 0.22) / holdDur);
        if (Math.floor(t * 7) !== Math.floor((t - 0.03) * 7)) {
          fxRing(g.pos.clone().setY(0.08), this.holdFill > 0.8 ? 0xfff088 : 0xff9a38, 0.7 + this.holdFill * 0.6, { life: 0.2 } as never);
        }
        this.phase = this.holdFill > 0.85 ? '蓄满！松手斩' : '长按蓄力…';
      } else if (t >= 0.22 + holdDur) {
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
        this.phase = this.weaponId === 'thunder' ? '裂阵斩 · 雷柱破盾！' : this.weaponId === 'frost' ? '追霜 · 引爆影针！' : this.weaponId === 'blunt' ? '听声一闪！' : '松手！箭步穿斩';
      } else {
        this.phase = '准备藏锋';
      }
      if (t > 2.2) this.ending = 0;
      return;
    }

    if (id === 'parry') {
      if (t >= 0.2 && t < 0.88) {
        this.hold.attack = 0.08;
        this.holdBtn = 'attack';
        this.holdFill = Math.min(1, (t - 0.2) / 0.68);
        this.phase = t > 0.62 ? '红光来袭 · 准备松手！' : '长按蓄势听招';
      }
      once('foeAtk', t >= 0.58 && !!foe, () => {
        foe!.attack(1.4);
        fxRing(foe!.chest(), 0xff5242, 1.15, { life: 0.28 } as never);
      });
      once('parryHit', t >= 0.88 && !!foe, () => {
        this.flags.add('parryWin');
        fxRing(g.pos.clone().add(V3(0.7, 0.9, 0)), 0xfff6c8, 1.7, { life: 0.32 } as never);
        fxSparks(g.pos.clone().add(V3(0.7, 1.0, 0)), 0xffe488, 16, 4.5);
        foe!.hurt(1.5);
        this.fvel.set(7.5, 0, 0);
      });
      if (t >= 0.88) this.phase = '破势成功！震退弹反';
      if (t > 2.15) this.ending = 0;
      return;
    }

    if (id === 'dash' || id === 'dcut' || id === 'counter' || (e.kind === 'boon' && e.target === 'dash')) {
      const isCounter = id === 'counter', isDcut = id === 'dcut' || id === 'passCut';
      once('foeSw', t >= 0.35 && !!foe, () => {
        foe!.attack(1.4);
        if (isCounter) fxRing(foe!.chest(), 0xff5242, 1.1, { life: 0.26 } as never);
      });
      once('doDash', t >= 0.52, () => {
        this.pressBtn('dash', TAP, isCounter ? 'side' : 'toFoe');
        if (isCounter) fxRing(g.pos.clone().setY(0.12), 0x82dcff, 1.6, { life: 0.35 } as never);
      });
      once('doCut', (isDcut && t >= 0.60) || (isCounter && t >= 0.96), () => {
        this.pressBtn('attack', TAP, 'toFoe');
        if (isCounter && foe) {
          fxSparks(foe.chest(), 0xffd858, 14, 4.2);
          slashArc.clashCross(foe.chest(), V3(1, 0, 0), 0.3, 'heavy', 0.26, 1.2);
        }
      });
      this.phase = t < 0.52 ? (isCounter ? '敌招临身 · 闪避！' : '准备冲刺')
        : isDcut ? '冲刺接斩 · 穿风！'
        : isCounter ? (t >= 0.96 ? '回锋斩 · 伤害翻倍！' : '完美闪避！')
        : '无敌疾冲';
      if (t > 2.1) this.ending = 0;
      return;
    }

    if (id === 'jump' || id === 'plunge' || (e.kind === 'boon' && e.target === 'jump')) {
      const doPlunge = id === 'plunge' || id === 'rift' || id === 'vault';
      once('j1', t >= 0.3, () => this.pressBtn('jump', TAP, 'toFoe'));
      once('jCut', doPlunge && t >= 0.56, () => this.pressBtn('attack', TAP, 'toFoe'));
      this.phase = doPlunge ? (t >= 0.56 ? '空中下劈 · 震地！' : '起跳滞空') : '跃过贴地横扫';
      if (t > 1.95) this.ending = 0;
      return;
    }

    if (id === 'dart' || (e.kind === 'boon' && e.target === 'special')) {
      for (let k = 0; k < 3; k++) {
        once(`d${k}`, t >= 0.3 + k * 0.32, () => this.pressBtn('special', TAP, 'toFoe'));
      }
      this.phase = e.kind === 'boon' ? '掷镖触发秘传！' : '掷出柳叶镖钉住敌人';
      if (t > 2.1) this.ending = 0;
      return;
    }

    if (id === 'ult') {
      once('u0', t >= 0.25, () => {
        this.pressBtn('ult', 0.14, 'toFoe');
        fxRing(g.pos.clone().setY(0.1), 0xffd258, 1.9, { life: 0.45 } as never);
      });
      once('u1', t >= 0.55 && !!foe, () => {
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
      this.phase = t < 0.55 ? '三格杀气蓄满！' : t < 1.15 ? '不见刀 · 分身齐斩！' : '归鞘连爆八刀！';
      if (t > 2.35) this.ending = 0;
      return;
    }

    // Fallback passive boon demonstration: strike + glowing proc ring
    once('p1', t >= 0.4, () => {
      this.pressBtn('attack', TAP, 'toFoe');
      fxRing(g.pos.clone().setY(0.1), e.accentHex ?? 0xffd27a, 1.5, { life: 0.4 } as never);
    });
    this.phase = '出招触发秘传';
    if (t > 1.9) this.ending = 0;
  }

  hide() {
    this.clearActors(false);
    if (this.dojo) this.dojo.visible = false;
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
  private heroDef: ModelDef = modelDef('fine_hat');
  private weaponId: WeaponId = 'hanshan';
  private weaponLv = 0;
  private beat: BeatState = { phase: '', activeBtns: [] };
  private uiAccum = 0;
  private lastW = 0;
  private lastH = 0;
  private lastEntryKey = '';
  private rect = { cx: 0, cy: 0, w: 0, h: 0 };
  /** Exact CSS-px viewport rectangle of the live 3D mini-world cutout (top half of MoveStage, above beat bar). */
  private vpCss = { x: 0, y: 0, w: 0, h: 0 };
  private demoBtnRect: { x: number; y: number; w: number; h: number } | null = null;
  private visibleAlpha = 0;
  demoBtnHot = false;
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

  layout(cx: number, cy: number, w: number, h: number) {
    this.rect = { cx, cy, w, h };
  }

  hitDemoBtn(x: number, y: number): boolean {
    const r = this.demoBtnRect;
    return !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  update(dt: number, alpha: number) {
    this.visibleAlpha = alpha;
    if (!this.entry || alpha <= 0.02 || this.rect.w < 40 || this.rect.h < 40) {
      this.mesh.visible = false;
      this.demoBtnRect = null;
      this.vpCss.w = 0;
      return;
    }
    PAUSE.fx = true;
    this.beat = this.sim.update(dt);
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
      this.paint(this.ctx!, W, H, dpr);
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
    this.cam.position.set(MINI_X, 3.65, 6.45);
    this.cam.lookAt(MINI_X, 0.85, 0);
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
    this.vpCss.w = 0;
    this.lastEntryKey = '';
    this.entry = null;
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

  private paint(g: CanvasRenderingContext2D, W: number, H: number, dpr: number) {
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
    const stageH = Math.round(H * (compact ? 0.45 : 0.49));
    const stageY = padY + u;
    const bdr = Math.max(1, Math.round(1.5 * kk * dpr));

    // 1. Framed transparent viewport bay for the live 3D Mini-World (punched via clearRect!)
    g.fillStyle = '#09070c';
    g.fillRect(boxX - bdr, stageY - bdr, boxW + 2 * bdr, stageH + 2 * bdr);
    g.fillStyle = innerCol;
    g.fillRect(boxX, stageY, boxW, stageH);
    const ix = boxX + bdr, iy = stageY + bdr, iw = boxW - 2 * bdr, ih = stageH - 2 * bdr;
    const barH = Math.max(Math.round(24 * kk * dpr), Math.round(ih * 0.22));
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

    // Corner stamp at top-left of 3D mini-world viewport
    const lblS = Math.max(1, Math.round((11 * kk * dpr) / PIX_H));
    const stampTxt = localize('动作示意');
    const stW = pixW(stampTxt) * lblS + Math.round(10 * kk * dpr);
    const stH = PIX_H * lblS + Math.round(5 * kk * dpr);
    g.fillStyle = 'rgba(10,8,14,0.84)';
    g.fillRect(ix + bdr, iy + bdr, stW, stH);
    g.fillStyle = innerCol;
    g.fillRect(ix + bdr, iy + bdr, Math.max(1, Math.round(2 * dpr)), stH);
    drawPix(g, stampTxt, ix + bdr + Math.round(6 * kk * dpr), iy + bdr + Math.round(2.5 * kk * dpr), {
      scale: lblS, color: '#e6d6b0', outline: null, align: 'left',
    });

    // Bottom HUD strip inside stage frame: synchronized keycap beat + live phase label
    g.fillStyle = '#0e0c14';
    g.fillRect(ix, barY, iw, barH);
    g.fillStyle = '#3a3242';
    g.fillRect(ix, barY, iw, Math.max(1, Math.round(dpr)));
    this.paintBeatBar(g, e, this.beat, ix + Math.round(8 * kk * dpr), barY, iw - Math.round(16 * kk * dpr), barH, kk, dpr);

    // 2. Lower Inspector Section: Title + Badge + Icon-Rich Effect + Stat Pill + Attached Boons
    let curY = stageY + stageH + Math.round((compact ? 8 : 11) * kk * dpr);
    const title = localize(e.name);
    let tScale = Math.max(1, Math.round(((compact ? 18 : 21) * kk * dpr) / PIX_H));
    while (tScale > 1 && pixW(title) * tScale > boxW * 0.65) tScale--;
    const tH = PIX_H * tScale;
    const titleCol = e.kind === 'arcana' ? '#a4ffd0' : e.kind === 'keepsake' ? '#ffe68c' : e.kind === 'manual' ? '#fff0c0' : '#fff4dc';
    drawPix(g, title, boxX, curY, { scale: tScale, color: titleCol, outline: '#08060c', align: 'left' });

    let tx = boxX + pixW(title) * tScale + Math.round(10 * kk * dpr);
    const pScale = Math.max(1, Math.round((12.5 * kk * dpr) / PIX_H));
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
    const effPx = Math.round((compact ? 14.5 : 16.5) * kk * dpr);
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
      const numPx = Math.round((compact ? 13 : 14.5) * kk * dpr);
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
      const hdrS = Math.max(1, Math.round((11.5 * kk * dpr) / PIX_H));
      drawPix(g, localize('本局已挂载秘传'), boxX, curY, { scale: hdrS, color: '#ffd878', outline: '#08060c', align: 'left' });
      curY += PIX_H * hdrS + Math.round(5 * kk * dpr);
      const bPx = Math.round((compact ? 12.5 : 14) * kk * dpr);
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
      const bs = Math.max(1, Math.round((13.5 * kk * dpr) / PIX_H));
      const bw = pixW(btnTxt) * bs + Math.round(24 * kk * dpr);
      const bh = PIX_H * bs + Math.round(12 * kk * dpr);
      const bx = boxX + boxW - bw;
      const by = bottomLimit - bh;
      const hot = this.demoBtnHot;
      drawPixelPlaque(g, bx, by, bw, bh, Math.max(1, Math.round(1.5 * kk * dpr)), {
        bg: hot ? '#483016' : '#2e2012', hi: hot ? '#6a4822' : '#46321c', border: '#07050a',
        inner: hot ? '#fff098' : '#e0aa4e', rivets: true,
      });
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

  private paintBeatBar(
    g: CanvasRenderingContext2D, e: SkillEntry, beat: BeatState,
    x: number, y: number, w: number, h: number, kk: number, dpr: number,
  ) {
    const mid = Math.round(y + h / 2);
    const dev = PAD.device;
    let cx = x;
    const drawBtnChip = (btn: BtnName, lit: boolean, isHold: boolean) => {
      const aKey = ACTION_BTN_KEY[btn] as 'attack' | 'dash' | 'jump' | 'special';
      if (dev === 'pad') {
        const idx = btn === 'ult' ? 3 : BIND.pad[aKey][0];
        const gs = Math.max(1, Math.round((h * 0.66) / GLYPH_H));
        const gw = glyphArt(idx).w * gs;
        if (lit) {
          g.fillStyle = '#ffe078';
          g.fillRect(Math.round(cx - 2 * dpr), Math.round(mid - (GLYPH_H * gs) / 2 - 2 * dpr), gw + Math.round(4 * dpr), GLYPH_H * gs + Math.round(4 * dpr));
        }
        paintGlyph(g, idx, Math.round(cx), Math.round(mid - (GLYPH_H * gs) / 2), gs);
        cx += gw + Math.round(6 * kk * dpr);
      } else {
        const keyTxt = btn === 'ult' ? 'F' : dev === 'touch' ? ({ attack: '斩', dash: '闪', jump: '跳', special: '镖', ult: '绝' }[btn]) : actKey(aKey);
        const label = isHold ? `${localize('长按')} ${keyTxt}` : keyTxt;
        const ks = Math.max(1, Math.round((h * 0.64) / KEYCAP_H));
        const kw = keyCapWidth(label) * ks;
        paintKeyCap(g, label, Math.round(cx), Math.round(mid - (KEYCAP_H * ks) / 2), ks, lit);
        cx += kw + Math.round(6 * kk * dpr);
      }
      if (isHold && beat.holdFill != null) {
        const bw = Math.round(28 * kk * dpr), bh = Math.round(6 * kk * dpr);
        const by = Math.round(mid - bh / 2);
        g.fillStyle = '#18141c'; g.fillRect(Math.round(cx), by, bw, bh);
        g.fillStyle = beat.holdFill >= 0.95 ? '#fff088' : '#ff9a3c';
        g.fillRect(Math.round(cx + dpr), by + Math.round(dpr), Math.round((bw - 2 * dpr) * Math.min(1, beat.holdFill)), bh - Math.round(2 * dpr));
        cx += bw + Math.round(6 * kk * dpr);
      }
    };

    if (e.kind === 'arcana') {
      const ico = Math.round(h * 0.62);
      drawMiniIcon(g, 'grasp', cx + ico / 2, mid, ico);
      cx += ico + Math.round(6 * kk * dpr);
    } else if (e.kind === 'keepsake') {
      const ico = Math.round(h * 0.62);
      drawMiniIcon(g, 'star', cx + ico / 2, mid, ico);
      cx += ico + Math.round(6 * kk * dpr);
    } else if (beat.holdBtn) {
      drawBtnChip(beat.holdBtn, beat.activeBtns.includes(beat.holdBtn), true);
    } else {
      const unique: BtnName[] = [];
      for (const st of e.steps ?? []) {
        const b: BtnName | null = st === 'attack' || st === 'hold' || st === 'release' ? 'attack'
          : st === 'dash' ? 'dash' : st === 'jump' ? 'jump' : st === 'dart' ? 'special' : st === 'intent' ? 'ult' : null;
        if (b && !unique.includes(b)) unique.push(b);
      }
      if (!unique.length) unique.push('attack');
      for (let i = 0; i < Math.min(3, unique.length); i++) {
        if (i > 0) {
          const ps = Math.max(1, Math.round((11 * kk * dpr) / PIX_H));
          drawPix(g, '>', Math.round(cx), Math.round(mid - (PIX_H * ps) / 2), { scale: ps, color: '#a89c88', outline: null, align: 'left' });
          cx += pixW('>') * ps + Math.round(5 * kk * dpr);
        }
        drawBtnChip(unique[i], beat.activeBtns.includes(unique[i]), false);
      }
    }

    if (beat.phase) {
      const ps = Math.max(1, Math.round((13 * kk * dpr) / PIX_H));
      const pTxt = localize(beat.phase);
      const pCol = beat.activeBtns.length ? '#ffe688' : '#cfc6b6';
      drawPix(g, pTxt, x + w, Math.round(mid - (PIX_H * ps) / 2), { scale: ps, color: pCol, outline: '#08060c', align: 'right' });
    }
  }
}
