// One actor class for the whole bestiary: the model's joints + procedural poses chosen by body kind (biped / robe / ghost / quad /
// spider / sprite) and attack style. Actions: idle (always), attack, cast, hurt, roar.
import { Actor } from '../actors/actor';
import { Action, rot, mov, curve, snap } from '../actors/rig';
import { V3 } from '../engine/world';
import { CELL } from './kit';
import { poseId, ROSTER, type ModelDef } from './models';
import { isGripHero, poseHero } from './heroPose';
import { poseIai } from '../ronin/iaiPose';   // 浪人篇 居合: the sheathed stance over the mage rig
import { POSE_HOOKS } from './poseHooks';
import { angleDelta, attackBeats, attackBody } from '../act/foes/foe_motion';
import { shootBow, swingHammer } from '../act/foes/hj_weapon_poses';

const HUNCH: Record<string, number> = { forest_ghoul: 0.4, fig_ghoul: 0.35, forest_old_willow: 0.3, elite_alpha_wolf: 0.25, forest_moss_golem: 0.1, boss_coven_matriarch: 0.12 };
const BIG: Record<string, number> = { boss_ancient_treant: 1.7, boss_root_colossus: 1.5, forest_moss_golem: 1.25, forest_treant: 1.2, boss_lich_forest: 1.2 };

export class BActor extends Actor {
  readonly height: number; readonly top: number; readonly width: number;
  /** block size (m) across and up: voxels are cubes, toy bricks are a stud wide and a plate tall */
  readonly cx: number; readonly cy: number;
  private slow: number; private hunch: number; private armed: boolean;
  /** the id this model poses as: an alternate look (the male rogue backup) shares its original's grip, poses and weapon tip */
  readonly hid: string;
  readonly foe: boolean;
  lookYaw?: number;
  protected moveVelocity?: { readonly x: number; readonly z: number };
  private beforeHit?: { x: number; z: number };
  private hitFromWorld?: number;
  protected hurtVariant = 0;
  protected get hitFrom() { return angleDelta((this.hitFromWorld ?? this.lookYaw ?? this.yaw) - this.yaw); }
  constructor(readonly def: ModelDef) {
    super();
    this.hid = poseId(def);
    // (11-18 用户：「哪个杜五走路的动作及其不自然，手和腿不在一个节奏上」: the hideout's people, the donkey and the cold open's people
    //  are in ROSTER too — the foes' gait layer took 杜五's legs by his movement while his own walk (walkPh) swung his arms. The five
    //  regions' enemies only)
    this.foe = def.group !== '职业' && !isGripHero(this.hid) && /^(hj|ly|xp|wl|cx)_/.test(def.id) && ROSTER.some(model => model.id === def.id);
    const v = def.build(), lv = v as unknown as { u?: number; p?: number; k?: number; extent?: { top: number; width: number } };
    this.cx = lv.u ?? lv.k ?? v.s; this.cy = lv.p ?? lv.k ?? v.s;
    const r = v.build({ glow: def.glow ?? 1.35, jitter: 0, self: (def.self ?? 0.06) + 0.1, rim: 1.1, edge: 0.13 });   // 2026-11-13: 1.9 / +0.2 / 1.7 blew out white faces (user)
    if (lv.extent && lv.extent.top > 0) { this.top = lv.extent.top; this.width = lv.extent.width; }   // moulded figures measure their meshes
    else { let maxY = 0, maxX = 0; for (const c of v.cells.values()) { maxY = Math.max(maxY, c.y + 1); maxX = Math.max(maxX, Math.abs(c.x + 0.5) + 0.5); } this.top = maxY * this.cy; this.width = maxX * 2 * this.cx; }
    this.height = Math.min(this.top, 6);
    this.body.add(r.root); this.bones = r.bones; this.finish(r.meshes);
    this.slow = BIG[def.id] ?? 1; this.hunch = HUNCH[def.id] ?? 0;
    this.armed = !!r.bones.weapon && r.bones.weapon.children.length > 0;
  }
  weapon() {
    const h = this.hid, tip = this.def.tip ?? (h === 'mage' ? 22 : h === 'rogue' ? 10 : h === 'warrior' ? 17 : 8);
    return this.bones.weapon ? this.bones.weapon.localToWorld(V3(0, h === 'warrior' ? -3 * this.cy : 0, tip * this.cx)) : this.chest();
  }
  head() { return this.local(0, this.top + 0.3, 0); }
  chest() { return this.local(0, this.top * 0.55, 0.3); }
  attack(dist?: number) { return this.play(new Action('attack', (this.def.attack === 'slam' ? 1.3 : this.def.attack === 'shoot' ? 1.2 : this.def.attack === 'dual' ? 0.9 : 1.0) * this.slow, 0.5, dist != null ? { dist } : {})); }
  cast() { return this.play(new Action('cast', 1.2 * this.slow, 0.6)); }
  hit(power = 1) {
    const v = this.moveVelocity;
    if (this.foe && v) this.beforeHit = { x: v.x, z: v.z };
    super.hit(power);
  }
  hurt(power = 1, fromAngle?: number) {
    const kick = this.knock.v;
    this.hit(power);
    if (this.foe) {
      // The directional pose supplies the recoil. Keep the shared flash and squash.
      this.knock.v = kick;
      this.hurtVariant = (this.hurtVariant + 1 + Math.floor(this.t * 1000) % 2) % 3;
      if (fromAngle !== undefined) {
        this.hitFromWorld = this.yaw + fromAngle;
        this.beforeHit = undefined;
      }
    }
    return this.play(new Action('hurt', 0.5 * Math.sqrt(this.slow), 0.1, fromAngle === undefined ? { power } : { power, fromAngle }));
  }
  roar() { return this.play(new Action('roar', 1.6 * this.slow, 0.35)); }

  protected pose(dt: number) {
    void dt;
    const b = this.bones, t = this.t / this.slow, a = this.act, k = a ? a.k : 0, n = a?.name ?? '', d = this.def, kind = d.kind;
    const br = Math.sin(t * 2.2);
    this.off.set(0, 0, 0);
    if (this.beforeHit && this.moveVelocity) {
      // Gameplay adds its knockback to the same velocity after calling hit/hurt.
      // Read it here so the pose can react without changing the damage routine.
      const x = this.beforeHit.x - this.moveVelocity.x, z = this.beforeHit.z - this.moveVelocity.z;
      if (Math.hypot(x, z) > 0.08) this.hitFromWorld = Math.atan2(x, z);
      this.beforeHit = undefined;
    }
    { const hk = POSE_HOOKS[this.hid]; if (hk) { hk(b, t, a, this.off, this); return; } }
    if (isGripHero(this.hid)) { poseHero(this.hid, b, t, a, this.off); if (this.def.id === 'ronin_iai') poseIai(b, t, a); return; }
    // ---- idle base per kind
    if (kind === 'quad') {
      rot(b.chest, br * 0.02, 0, 0); rot(b.neck, -0.05 + Math.sin(t * 0.7) * 0.05, Math.sin(t * 0.5) * 0.25, 0); rot(b.jaw, 0.05 + Math.max(0, Math.sin(t * 1.5)) * 0.1, 0, 0);
      rot(b.tail, 0.2 + br * 0.05, Math.sin(t * 3) * 0.35, 0); rot(b.tail2, 0.2, Math.sin(t * 3 - 0.8) * 0.4, 0); mov(b.hips, 0, br * 0.02, 0);
    } else if (kind === 'spider') {
      mov(b.body, 0, br * 0.03, 0); rot(b.abdomen, br * 0.04, 0, 0); rot(b.jaw, Math.max(0, Math.sin(t * 4)) * 0.15, 0, 0);
      for (let i = 0; i < 4; i++) for (const s of ['L', 'R']) rot(b[`leg${s}${i}`], 0, 0, Math.max(0, Math.sin(t * 3 + i * 1.3 + (s === 'L' ? 0 : 2))) * 0.08 * (s === 'L' ? 1 : -1));
    } else if (kind === 'sprite') {
      this.off.y = (d.hover ?? 0.4) + Math.sin(t * 2.4) * 0.15; rot(b.hat, Math.sin(t * 3) * 0.08, 0, Math.sin(t * 2.2) * 0.1);
      rot(b.armL, 0, 0, 0.3 + Math.sin(t * 9) * 0.4); rot(b.armR, 0, 0, -0.3 - Math.sin(t * 9) * 0.4); rot(b.tail, 0, t * 2, 0);
    } else {
      // biped, robe, ghost
      const float = kind === 'ghost' || kind === 'robe';
      if (float) { this.off.y = (d.hover ?? 0.3) + Math.sin(t * 1.4) * (kind === 'ghost' ? 0.14 : 0.08); rot(b.hips, Math.sin(t * 1.4 + 1) * 0.06, 0, Math.sin(t * 1.1) * 0.08); }
      else mov(b.hips, 0, br * 0.015 * this.slow, 0);
      rot(b.spine, 0.04 + this.hunch + br * 0.02, Math.sin(t * 0.6) * 0.05, 0); rot(b.chest, br * 0.025 + this.hunch * 0.6, 0, 0);
      rot(b.neck, -0.04 - this.hunch * 1.2, Math.sin(t * 0.5) * 0.12, 0); rot(b.head, Math.sin(t * 1.1) * 0.03, 0, Math.sin(t * 0.9) * 0.04);
      rot(b.jaw, 0.03 + Math.max(0, Math.sin(t * 0.8) - 0.9) * 2, 0, 0); rot(b.cape, 0.08 + Math.sin(t * 1.6) * 0.06, 0, Math.sin(t * 1.2) * 0.04); rot(b.hat, Math.sin(t * 1.3) * 0.02, 0, 0);
      rot(b.tail, 0.2, Math.sin(t * 2) * 0.3, 0);
      for (let i = 0; i < 3; i++) for (const s of ['L', 'R']) rot(b[`sp${s}${i}`], Math.sin(t * 2 + i) * 0.12, 0, (s === 'L' ? 1 : -1) * Math.sin(t * 2.4 + i * 2) * 0.1);
      rot(b.armL, 0.05 + br * 0.04, 0, 0.12); rot(b.foreL, -0.3, 0, 0);
      if (d.bowL) { rot(b.armL, -0.25, 0, 0.05); rot(b.foreL, -0.2, 0, 0); rot(b.offhand, -1.1, 0, 0); }
      if (d.attack === 'dual') { rot(b.armL, -0.35, 0, 0); rot(b.foreL, -1.0, 0, 0); rot(b.offhand, -0.5, 0, 0); }
      if (this.armed) { rot(b.armR, -0.4, 0, -0.1); rot(b.foreR, -1.4, 0, 0); rot(b.weapon, d.attack === 'dual' ? -0.5 : -0.5, 0, 0); }
      else { rot(b.armR, 0.05 + br * 0.04, 0, -0.12); rot(b.foreR, -0.3, 0, 0); }
    }
    if (!a) return;
    // ---- actions
    if (n === 'hurt') {
      if (this.foe) return;   // BattleActor adds the recoil after the model's ready stance.
      const p = Math.min(1.6, (a.data.power as number) || 1), s = snap(k, [[0, 0], [0.12, 1], [1, 0]]) * p;
      this.off.z = -0.35 * s; rot(b.spine, -0.4 * s, 0, 0.1 * s); rot(b.neck, -0.3 * s, 0, 0); rot(b.jaw, 0.5 * s, 0, 0); rot(b.chest, -0.2 * s, 0, 0); rot(b.body, -0.25 * s, 0, 0); rot(b.head, kind === 'sprite' ? -0.3 * s : 0, 0, 0);
      return;
    }
    if (n === 'roar') {
      const s = curve(k, [[0, 0], [0.3, 1], [0.8, 1], [1, 0]]), sh = Math.sin(k * 60) * 0.03 * s;
      if (kind === 'quad') { rot(b.neck, -0.9 * s, 0, 0); rot(b.head, -0.3 * s, 0, 0); rot(b.jaw, 0.6 * s, 0, 0); return; }
      if (kind === 'spider') { rot(b.body, -0.35 * s, 0, 0); rot(b.legL0, 0, 0, 0.8 * s); rot(b.legR0, 0, 0, -0.8 * s); rot(b.jaw, 0.4 * s, 0, 0); return; }
      rot(b.spine, -0.35 * s, sh, 0); rot(b.neck, -0.45 * s, 0, 0); rot(b.jaw, 0.8 * s, 0, 0); rot(b.armL, -1.6 * s, 0, 1.0 * s); rot(b.armR, -1.4 * s, 0, -1.0 * s); this.off.y += 0.2 * s;
      return;
    }
    if (n !== 'attack' && n !== 'cast') return;   // other names belong to subclasses
    const D = (a.data.dist as number | undefined);
    if (kind === 'quad') {   // pounce and bite / howl
      if (this.foe && n === 'attack') {
        const { dip, load, hit, late } = attackBeats(a);
        mov(b.chest, 0, -0.14 * load - 0.05 * dip, 0);
        this.off.z = 1.2 * hit - 0.2 * load; this.off.y = 0.16 * hit;
        rot(b.neck, 0.38 * hit - 0.2 * load, 0, 0); rot(b.jaw, 0.56 * load + 0.28 * late, 0, 0);
        rot(b.legFL, -0.8 * hit, 0, 0); rot(b.legFR, -0.74 * hit, 0, 0);
        rot(b.legBL, 0.65 * hit - 0.28 * dip, 0, 0); rot(b.legBR, 0.56 * hit - 0.25 * load, 0, 0);
        return;
      }
      if (n === 'attack') { const coil = curve(k, [[0, 0], [0.3, 1], [0.45, 0], [1, 0]]), lunge = snap(k, [[0, 0], [0.38, 0], [0.5, 1], [0.7, 1], [1, 0]]);
        mov(b.chest, 0, -0.15 * coil, 0); this.off.z = 1.2 * lunge - 0.2 * coil; this.off.y = 0.3 * curve(k, [[0, 0], [0.38, 0], [0.45, 1], [0.55, 0], [1, 0]]); rot(b.neck, 0.4 * lunge - 0.2 * coil, 0, 0); rot(b.jaw, 0.7 * curve(k, [[0, 0], [0.35, 1], [0.5, 0], [1, 0]]), 0, 0);
        rot(b.legFL, -0.8 * lunge, 0, 0); rot(b.legFR, -0.8 * lunge, 0, 0); rot(b.legBL, 0.6 * lunge, 0, 0); rot(b.legBR, 0.6 * lunge, 0, 0); }
      else { const s = curve(k, [[0, 0], [0.3, 1], [0.85, 1], [1, 0]]); rot(b.neck, -1.0 * s, 0, 0); rot(b.head, -0.3 * s, 0, 0); rot(b.jaw, 0.5 * s, 0, 0); mov(b.hips, 0, -0.1 * s, 0); }
      return;
    }
    if (kind === 'spider') {   // rear up, front legs raised, strike down
      const rear = curve(k, [[0, 0], [0.35, 1], [0.5, 0], [1, 0]]), hit = snap(k, [[0, 0], [0.45, 0], [0.55, 1], [0.75, 1], [1, 0]]);
      rot(b.body, -0.4 * rear + 0.15 * hit, 0, 0); this.off.z = 0.8 * hit; rot(b.legL0, -0.3 * rear, 0, 1.0 * rear - 0.2 * hit); rot(b.legR0, -0.3 * rear, 0, -1.0 * rear + 0.2 * hit);
      rot(b.legL1, 0, 0, 0.5 * rear); rot(b.legR1, 0, 0, -0.5 * rear); rot(b.jaw, 0.5 * (rear + hit), 0, 0); rot(b.abdomen, n === 'cast' ? 0.3 * rear : 0, 0, 0);
      return;
    }
    if (kind === 'sprite') {   // spin and puff
      const s = curve(k, [[0, 0], [0.2, 1], [0.8, 1], [1, 0]]); b.head && (b.head.rotation.y += curve(k, [[0, 0], [0.2, 0], [0.8, Math.PI * 4], [1, Math.PI * 4]]));
      this.off.z = 0.6 * snap(k, [[0, 0], [0.45, 0], [0.55, 1], [1, 0]]); rot(b.armL, 0, 0, 1.0 * s); rot(b.armR, 0, 0, -1.0 * s); b.hat && b.hat.scale.setScalar(1 + 0.15 * s);
      return;
    }
    const at = n === 'cast' ? 'cast' : d.attack;
    if (this.foe) {
      if (n !== 'attack' || !/^ly_(looter|xbow|torch)/.test(d.id)) this.poseFoeAttack(a, at, D);
      return;
    }
    switch (at) {
      case 'swing': {   // over the head, chop into the ground in front
        const wind = curve(k, [[0, 0], [0.3, 1], [0.46, 1], [0.54, 0], [1, 0]]), chop = snap(k, [[0, 0], [0.44, 0], [0.54, 1], [0.76, 1], [1, 0]]);
        this.off.z = curve(k, [[0, 0], [0.3, -0.15], [0.52, D ?? 0.7], [0.74, D ?? 0.7], [1, 0]]); this.off.y += curve(k, [[0, 0], [0.3, 0], [0.41, 0.4], [0.52, 0], [1, 0]]);
        rot(b.spine, -0.3 * wind + 0.3 * chop, 0, 0); rot(b.chest, -0.15 * wind + 0.12 * chop, 0.25 * wind, 0);
        rot(b.armR, -2.75 * wind + 0.15 * chop, 0, 0.15 * wind); rot(b.foreR, 0.75 * wind + 1.5 * chop, 0, 0); rot(b.weapon, 0.1 * wind + 1.35 * chop, 0, 0);
        rot(b.armL, -1.8 * wind - 0.6 * chop, 0, -0.1); rot(b.jaw, 0.45 * (wind + chop), 0, 0); rot(b.legL, -0.5 * chop + 0.25 * wind, 0, 0); rot(b.legR, 0.45 * chop - 0.25 * wind, 0, 0);
        break;
      }
      case 'slam': {   // both fists overhead, then down
        const up = curve(k, [[0, 0], [0.4, 1], [0.5, 1], [0.58, 0], [1, 0]]), down = snap(k, [[0, 0], [0.5, 0], [0.6, 1], [0.8, 1], [1, 0]]);
        rot(b.armL, -2.8 * up - 0.9 * down, 0, -0.25 * up); rot(b.armR, -2.8 * up - 0.9 * down, 0, 0.25 * up); rot(b.foreL, 0.4 * up, 0, 0); rot(b.foreR, 0.4 * up, 0, 0);
        rot(b.spine, -0.25 * up + 0.4 * down, 0, 0); rot(b.neck, 0.2 * up - 0.3 * down, 0, 0); rot(b.jaw, 0.5 * (up + down), 0, 0); mov(b.hips, 0, -0.15 * down * this.slow, 0); this.off.z = 0.3 * down;
        break;
      }
      case 'claw': {   // lunge with a double claw swipe
        const coil = curve(k, [[0, 0], [0.3, 1], [0.42, 0], [1, 0]]), sw = snap(k, [[0, 0], [0.4, 0], [0.5, 1], [0.7, 1], [1, 0]]), sw2 = snap(k, [[0, 0], [0.55, 0], [0.65, 1], [0.8, 1], [1, 0]]);
        this.off.z = curve(k, [[0, 0], [0.3, -0.2], [0.48, D ?? 0.9], [0.72, D ?? 0.9], [1, 0]]); this.off.y += curve(k, [[0, 0], [0.32, 0], [0.4, 0.35], [0.48, 0], [1, 0]]);
        mov(b.hips, 0, -0.15 * coil, 0); rot(b.spine, 0.3 * coil - 0.15 * sw, 0, 0); rot(b.jaw, 0.7 * (coil + sw), 0, 0);
        rot(b.armR, -2.3 * coil + 2.5 * sw, 0, -0.4 * sw); rot(b.armL, -2.0 * coil + 2.2 * sw2, 0, 0.4 * sw2); rot(b.foreR, -0.5 * coil, 0, 0);
        break;
      }
      case 'dual': {   // two quick stabs, right then left
        const s1 = snap(k, [[0, 0], [0.2, 1], [0.4, 0], [1, 0]]), s2 = snap(k, [[0, 0], [0.4, 0], [0.6, 1], [0.8, 0], [1, 0]]);
        this.off.z = curve(k, [[0, 0], [0.2, 0.6], [0.6, 0.8], [1, 0]]); rot(b.spine, 0.2 * (s1 + s2), 0.3 * (s1 - s2), 0);
        rot(b.armR, -1.2 * s1, 0, 0); rot(b.foreR, 1.3 * s1, 0, 0); rot(b.armL, -1.2 * s2, 0, 0); rot(b.foreL, 1.1 * s2, 0, 0);
        break;
      }
      case 'shoot': {   // raise the bow, draw, loose
        const raise = curve(k, [[0, 0], [0.25, 1], [0.8, 1], [1, 0]]), draw = curve(k, [[0, 0], [0.25, 0], [0.6, 1], [0.62, 0], [1, 0]]);
        rot(b.armL, -1.3 * raise, 0.25 * raise, 0); rot(b.foreL, 0.2 * raise, 0, 0); rot(b.offhand, 1.1 * raise, 0, 0);   // keeps the bow upright with the arm out
        rot(b.armR, -1.3 * raise, -0.3 * raise, 0); rot(b.foreR, 1.4 * raise - 0.2 * draw + 0.6 * draw, 0, 0); rot(b.chest, 0, 0.35 * raise, 0); rot(b.spine, -0.1 * draw, 0, 0);
        break;
      }
      default: {   // cast: gather with both hands raised, then thrust
        const up = curve(k, [[0, 0], [0.45, 1], [0.6, 0.7], [1, 0]]), thrust = snap(k, [[0, 0], [0.55, 0], [0.65, 1], [1, 0]]);
        rot(b.armL, -2.2 * up - 0.4 * thrust, 0, 0.4 * up); rot(b.foreL, 0.4 * up, 0, 0); rot(b.armR, -1.4 * up - 0.5 * thrust, 0, -0.3 * up); rot(b.foreR, 0.5 * up, 0, 0); rot(b.weapon, -0.3 * up + 0.5 * thrust, 0, 0);
        rot(b.spine, -0.15 * up + 0.2 * thrust, 0, 0); rot(b.jaw, 0.4 * thrust, 0, 0); rot(b.offhand, 0.3 * up, 0, 0); this.off.y += 0.2 * up;
        if (kind === 'ghost' || d.id === 'forest_banshee') { rot(b.jaw, 0.6 * up, 0, 0); rot(b.cape, -0.4 * up, 0, 0); }
      }
    }
  }

  private poseFoeAttack(a: Action, style: ModelDef['attack'], distance?: number) {
    const b = this.bones, d = this.def;
    if (style === 'shoot' && (d.id === 'hj_archer' || d.id === 'hj_archer_e')) return shootBow(b, a);
    if (style === 'slam' && (d.id === 'hj_brute' || d.id === 'hj_brute_e')) return swingHammer(b, a);
    const heavy = style === 'slam' || d.group === '首领';
    const beats = attackBeats(a, heavy);
    const { load, dip, hit, hip, chest, late, kick } = beats;
    attackBody(b, beats, style === 'shoot' ? 'ranged' : style === 'cast' ? 'cast' : 'melee');
    if (d.kind === 'biped' && style !== 'shoot' && style !== 'cast') {
      rot(b.legL, 0.16 * load - 0.48 * hip, 0, 0); rot(b.shinL, 0.31 * hip, 0, 0);
      rot(b.footL, 0.16 * hip, 0, 0); rot(b.legR, -0.17 * load + 0.37 * hip, 0, 0);
    }
    switch (style) {
      case 'swing': {
        this.off.z = -0.15 * load + (distance ?? 0.7) * hip;
        rot(b.spine, -0.28 * load + 0.28 * chest, 0.21 * load - 0.16 * chest, 0);
        rot(b.armR, -2.75 * load + 0.15 * hit, 0, 0.15 * load);
        rot(b.foreR, 0.75 * load + 1.5 * hit, 0, 0); rot(b.weapon, 0.1 * load + 1.35 * hit, 0, 0);
        rot(b.armL, -0.8 * load + 0.47 * late, 0, -0.27 * late); rot(b.jaw, 0.36 * (load + hit), 0, 0);
        break;
      }
      case 'slam': {
        this.off.z = 0.30 * hip - 0.08 * dip;
        rot(b.armL, -2.8 * load - 0.9 * hit, 0, -0.25 * load);
        rot(b.armR, -2.8 * load - 0.9 * hit, 0, 0.25 * load);
        rot(b.foreL, 0.4 * load, 0, 0); rot(b.foreR, 0.4 * load, 0, 0);
        rot(b.weapon, 0.2 * load + 0.38 * hit, 0, 0);
        rot(b.spine, -0.25 * load + 0.37 * chest, 0, 0);
        mov(b.hips, 0, -0.07 * hip, 0); rot(b.jaw, 0.5 * (load + hit), 0, 0);
        break;
      }
      case 'claw': {
        const second = attackBeats(a, false, a.at + (1 - a.at) * 0.25);
        this.off.z = -0.2 * load + (distance ?? 0.9) * hip;
        rot(b.spine, 0.27 * load - 0.14 * chest, 0.22 * (chest - second.chest), 0);
        rot(b.armR, -2.3 * load + 1.1 * hit, 0, -0.4 * hit);
        rot(b.armL, -1.7 * load - 0.48 * hit + 1.45 * second.hit, 0, 0.4 * second.hit);
        rot(b.foreR, -0.55 * load + 0.45 * hit, 0, 0); rot(b.jaw, 0.6 * (load + hit), 0, 0);
        break;
      }
      case 'dual': {
        const second = attackBeats(a, false, a.at + (1 - a.at) * 0.24);
        this.off.z = 0.57 * hip + 0.20 * second.hip;
        rot(b.spine, 0.18 * (chest + second.chest), 0.24 * (chest - second.chest), 0);
        rot(b.armR, 0.45 * load - 1.2 * hit, 0, 0); rot(b.foreR, -0.35 * load + 1.3 * hit, 0, 0);
        rot(b.armL, 0.33 * load + 0.21 * late - 1.2 * second.hit, 0, 0);
        rot(b.foreL, -0.24 * load + 1.1 * second.hit, 0, 0);
        break;
      }
      case 'shoot': {
        const aim = curve(a.k, [[0, 0], [a.at * 0.52, 1], [a.at, 1], [1, 0]]);
        const draw = load * aim * aim;
        const breath = 0.022 * Math.sin(this.t * 7) * Math.max(0, 1 - a.k / Math.max(0.001, a.at)) * aim;
        rot(b.armL, -1.3 * aim + 0.18 * kick + breath, 0.25 * aim, 0);
        rot(b.foreL, 0.2 * aim, 0, 0); rot(b.offhand, 1.1 * aim, 0, 0);
        rot(b.armR, -1.3 * aim + 0.33 * kick, -0.3 * aim, 0);
        rot(b.foreR, 1.4 * aim - 0.55 * draw + 0.20 * hit, 0, 0);
        rot(b.chest, breath, 0.35 * aim, 0); rot(b.spine, -0.08 * draw - 0.09 * kick, 0, 0);
        this.off.z = -0.11 * kick;
        break;
      }
      default: {
        rot(b.armL, -2.2 * load - 1.14 * hit, 0, 0.4 * load + 0.37 * hit);
        rot(b.armR, -1.4 * load - 1.17 * hit, 0, -0.3 * load - 0.3 * hit);
        rot(b.foreL, -0.37 * load + 0.58 * hit, 0, 0); rot(b.foreR, -0.30 * load + 0.6 * hit, 0, 0);
        rot(b.spine, -0.15 * load + 0.2 * chest, 0, 0);
        rot(b.weapon, -0.3 * load + 0.5 * hit, 0, 0); rot(b.jaw, 0.4 * late, 0, 0);
        this.off.y += 0.13 * load + 0.06 * hip;
      }
    }
  }
}
