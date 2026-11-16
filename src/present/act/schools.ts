// School combat effects. Secondary hits use kind 'school', so lightning never procs another cut.
import { Color, Vector3 } from 'three';
import type { Foe } from './enemy';
import { BOONS, type Perks } from './boons';
import { addChill } from './chill';
import { trailSeg, fxRing, fxSparks } from '../fx/fx';
import { addBlock, type Blk } from '../fx/blocks';
import { fxAfterimage } from '../fx/skillFx';

export interface SchoolWorld {
  perks(): Perks;
  foes(): readonly Foe[];
  heroPos(): Vector3;
  intent(): number;
  heroTint(color: number, strength: number): void;
  hitFoe(f: Foe, dmg: number, from: Vector3, opts: { knock: number; heavy: boolean; kind: string; stagger?: number }): void;
}
const CORE = 0xffe68a, GLOW = 0xffc030, ICE = 0x9ae8ff;
const VALUES = new Map(BOONS.map(b => [b.id, b.vals]));
const CUTS = new Set(['k1', 'k2', 'k3', 'k4', 'k5', 'rel', 'dcut', 'plunge', 'dash']);
const distance = (a: Vector3, b: Vector3) => Math.hypot(a.x - b.x, a.z - b.z);
interface Strip { a: Vector3; b: Vector3; until: number }

export class Schools {
  private time = 0;
  private stepReady = 0;
  private shellUntil = 0;
  private marks = new Map<Foe, { until: number; block: Blk }>();
  private dartSlows = new Map<Foe, { until: number; k: number }>();
  private iceReady = new Map<Foe, number>();
  private strips: Strip[] = [];
  private lastTile: Vector3 | null = null;
  private orbs: Array<{ at: Vector3; until: number; dmg: number }> = [];
  private blocks: Blk[] = [];
  private shellBlocks: Blk[] = [];
  private bursts: Array<{ at: Vector3; dmg: number }> = [];
  private bursting = false;

  constructor(private w: SchoolWorld, private rnd: () => number = Math.random) {}
  private owns(id: string) { return this.w.perks().owned[id] != null; }
  private value(id: string) { const tier = this.w.perks().owned[id]; return tier == null ? 0 : VALUES.get(id)?.[tier] ?? 0; }
  private nearby(at: Vector3, r: number) { return this.w.foes().filter(f => f.st !== 'dead' && distance(f.pos, at) <= r); }
  private hit(f: Foe, dmg: number, from: Vector3) {
    if (f.st !== 'dead') this.w.hitFoe(f, dmg, from, { knock: 0, heavy: false, kind: 'school', stagger: 0 });
  }
  private block(at: Vector3, opts: Parameters<typeof addBlock>[1]) {
    const b = addBlock(at, opts); this.blocks.push(b); return b;
  }
  private ring(at: Vector3, color: number, r: number) {
    fxRing(at.clone().setY(0.06), color, r, { life: 0.3, width: 0.08, bright: 0.65 });
  }
  private arc(a: Vector3, b: Vector3) {
    const side = new Vector3(b.z - a.z, 0, a.x - b.x).normalize().multiplyScalar(0.2);
    const points = [a, a.clone().lerp(b, 0.33).add(side), a.clone().lerp(b, 0.67).sub(side), b];
    for (let i = 1; i < points.length; i++) trailSeg(points[i - 1], points[i], GLOW, 0.07, { core: new Color(CORE), life: 0.16, bright: 1.1, spark: 0 });
  }
  private bolt(at: Vector3, radius = 0.7) {
    const points = [new Vector3(0.15, 6, 0), new Vector3(-0.2, 4.4, 0.12), new Vector3(0.28, 2.7, -0.1), new Vector3(-0.13, 1.1, 0.06), new Vector3(0, 0.08, 0)].map(p => p.add(at.clone().setY(0)));
    for (let i = 1; i < points.length; i++) trailSeg(points[i - 1], points[i], GLOW, 0.1, { core: new Color(CORE), life: 0.2, bright: 1.2, spark: 0 });
    this.ring(at, CORE, radius);
    fxSparks(at.clone().setY(0.15), CORE, 7, 2.5, { bright: 1, life: 0.25 });
  }
  private iceBurst(at: Vector3, r = 0.8) {
    this.ring(at, 0xe5faff, r);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      this.block(at.clone().setY(0.65), { size: [0.18, 0.3, 0.18], col: ICE, glow: false,
        v: new Vector3(Math.cos(a) * 2.4, 1.3, Math.sin(a) * 2.4), grav: 5, life: 0.45, shrink: 0.3 });
    }
  }
  private freeze(f: Foe, seconds: number) {
    if (f.st === 'dead') return;
    f.frozen = Math.max(f.frozen, seconds); f.vel.set(0, 0, 0); f.a.tint(ICE, 0.65);
    this.ring(f.pos, 0xe5faff, f.d.r + 0.4);
  }
  private chill(f: Foe, stacks: number) {
    if (f.st === 'dead') return;
    const next = addChill(f, stacks, this.w.perks().owned.jd_chill ?? 0);
    f.chill = next.chill;
    if (next.chill === 0) this.freeze(f, next.frozen);
  }

  /** Added to the actual cut before rounding/shatter, rather than a separate proc hit. */
  cutDamage(f: Foe, from: Vector3, kind: string): number {
    const dmg = CUTS.has(kind) ? this.value('tp_intent') * Math.max(0, Math.min(3, this.w.intent())) : 0;
    if (dmg > 0) this.arc(from.clone().setY(1), f.a.chest());
    return dmg;
  }
  onCutHit(f: Foe, from: Vector3, kind: string) {
    if (!CUTS.has(kind)) return;
    const mark = this.marks.get(f);
    if (mark) {
      this.marks.delete(f); mark.block.life = mark.block.age;
      if (mark.until > this.time && this.owns('tp_mark')) { this.bolt(f.pos); this.hit(f, this.value('tp_mark'), from); }
    }
    if (this.owns('tp_chain') && this.rnd() < this.value('tp_chain') / 100) {
      const other = this.nearby(f.pos, 4).filter(o => o !== f).sort((a, b) => distance(a.pos, f.pos) - distance(b.pos, f.pos))[0];
      if (other) { this.arc(f.a.chest(), other.a.chest()); this.hit(other, 6, f.pos.clone()); }
    }
    if (this.owns('jd_chill')) this.chill(f, 1);
  }
  onFinisher(at: Vector3) {
    if (!this.owns('tp_bolt')) return;
    this.bolt(at, 2);
    for (const f of this.nearby(at, 2)) this.hit(f, this.value('tp_bolt'), at);
  }
  onDashEnd(at: Vector3) {
    this.lastTile = null;
    if (!this.owns('tp_step') || this.time < this.stepReady) return;
    this.stepReady = this.time + 1;
    this.ring(at, CORE, 2); fxSparks(at.clone().setY(0.1), CORE, 8, 3, { bright: 1 });
    for (const f of this.nearby(at, 2)) { this.arc(at.clone().setY(0.2), f.a.chest()); this.hit(f, this.value('tp_step'), at); }
  }
  onDashPath(a: Vector3, b: Vector3) {
    if (!this.owns('jd_trail') || distance(a, b) < 1e-5) return;
    this.strips.push({ a: a.clone().setY(0), b: b.clone().setY(0), until: this.time + 3 });
    const len = distance(a, b), n = Math.max(1, Math.ceil(len / 0.6));
    for (let i = 0; i <= n; i++) {
      const at = a.clone().lerp(b, i / n).setY(0.035);
      if (this.lastTile && distance(this.lastTile, at) < 0.6) continue;
      this.lastTile = at.clone();
      this.block(at, { size: [1, 0.07, 1], col: ICE, bright: 0.3, glow: true, grow: 0.05, life: 3, shrink: 0.6 });
    }
  }
  onDartHit(f: Foe) {
    if (f.st === 'dead') return;
    if (this.owns('tp_mark')) {
      const old = this.marks.get(f); if (old) old.block.life = old.block.age;
      const block = this.block(f.pos, { host: f.a.root, lp: new Vector3(0, 1.7, 0), size: [0.12, 0.3, 0.12], col: CORE, bright: 0.65, life: 3 });
      this.marks.set(f, { until: this.time + 3, block });
    }
    if (this.owns('jd_dart')) {
      const k = this.value('jd_dart') / 100;
      this.dartSlows.set(f, { until: this.time + 2, k });
      f.slowT = Math.max(f.slowT, 2); f.slowK = Math.max(f.slowK, k); this.chill(f, 1);
    }
  }
  onIai() {
    const at = this.w.heroPos().clone();
    if (this.owns('tp_iai')) for (const f of this.nearby(at, 8)) { this.bolt(f.pos); this.hit(f, this.value('tp_iai'), at); }
    if (this.owns('jd_iai')) { this.ring(at, ICE, 5); for (const f of this.nearby(at, 5)) this.freeze(f, this.value('jd_iai')); }
  }
  onPerfectDodge(at: Vector3) {
    if (this.owns('tp_orb')) {
      this.orbs.push({ at: at.clone().setY(0), until: this.time + 0.6, dmg: this.value('tp_orb') });
      this.block(at.clone().setY(0.65), { size: 0.3, col: CORE, bright: 0.8, life: 0.6, grow: 0.15 });
      this.ring(at, GLOW, 0.6);
    }
    if (this.owns('jd_still')) { this.ring(at, ICE, 3); for (const f of this.nearby(at, 3)) this.chill(f, this.value('jd_still')); }
  }
  onHeroHurt(attacker?: Foe) {
    if (this.owns('jd_shell')) {
      this.shellUntil = this.time + 2;
      for (const b of this.shellBlocks) b.life = b.age;
      const at = this.w.heroPos(); this.shellBlocks = [];
      for (const [x, z] of [[-0.4, 0], [0.4, 0], [0, -0.35], [0, 0.35]]) {
        this.shellBlocks.push(this.block(at.clone().add(new Vector3(x, 0.9, z)), { size: [0.24, 0.85, 0.24], col: ICE, bright: 0.22, life: 2, shrink: 0.35 }));
      }
      fxAfterimage(at.clone(), 1.9, ICE, { life: 0.3, glow: 0.2 });
    }
    if (attacker && attacker.st !== 'dead' && this.owns('tp_armor')) {
      this.arc(this.w.heroPos().clone().setY(1), attacker.a.chest()); this.hit(attacker, this.value('tp_armor'), this.w.heroPos().clone());
    }
  }
  damageMul(f: Foe) { return f.frozen > 0 ? 1 + this.value('jd_shatter') / 100 : 1; }
  /** Preserve frozen on a corpse until onKill consumes it, including a lethal shatter. */
  onHit(f: Foe, wasFrozen: boolean) {
    if (wasFrozen && this.owns('jd_shatter')) { this.iceBurst(f.pos); if (f.st !== 'dead') f.frozen = 0; }
  }
  takenMul() { return this.time < this.shellUntil ? 1 - this.value('jd_shell') / 100 : 1; }
  onKill(f: Foe) {
    const mark = this.marks.get(f); if (mark) mark.block.life = mark.block.age;
    // Keep the mark until this hit's onCutHit (a lethal marked cut still calls its bolt).
    // Non-cut deaths are pruned by update; the visible mark ends immediately.
    this.dartSlows.delete(f); this.iceReady.delete(f);
    const frozen = f.frozen > 0; f.frozen = 0;
    if (!frozen || !this.owns('jd_burst')) return;
    this.bursts.push({ at: f.pos.clone(), dmg: this.value('jd_burst') });
    if (this.bursting) return;
    this.bursting = true;
    try {
      while (this.bursts.length) {
        const burst = this.bursts.shift()!; this.iceBurst(burst.at, 2.5);
        for (const other of this.nearby(burst.at, 2.5)) { this.hit(other, burst.dmg, burst.at); this.chill(other, 2); }
      }
    } finally { this.bursting = false; }
  }
  update(dt: number) {
    this.time += dt;
    for (const [f, mark] of this.marks) if (mark.until <= this.time || f.st === 'dead') { mark.block.life = mark.block.age; this.marks.delete(f); }
    const due = this.orbs.filter(o => o.until <= this.time); this.orbs = this.orbs.filter(o => o.until > this.time);
    for (const orb of due) { this.bolt(orb.at, 2.2); for (const f of this.nearby(orb.at, 2.2)) this.hit(f, orb.dmg, orb.at); }
    this.strips = this.strips.filter(s => s.until > this.time);
    for (const [f, slow] of this.dartSlows) if (slow.until <= this.time || f.st === 'dead') this.dartSlows.delete(f);
    for (const [f, ready] of this.iceReady) if (f.st === 'dead' || ready <= this.time) this.iceReady.delete(f);
    for (const f of this.w.foes()) {
      if (f.st === 'dead') continue;
      const onIce = this.strips.some(s => {
        const ab = s.b.clone().sub(s.a), t = Math.max(0, Math.min(1, f.pos.clone().sub(s.a).setY(0).dot(ab) / Math.max(1e-6, ab.lengthSq())));
        return distance(f.pos, s.a.clone().addScaledVector(ab, t)) <= 0.5;
      });
      const slow = this.dartSlows.get(f);
      f.slowT = Math.max(slow ? slow.until - this.time : 0, onIce ? 0.1 : 0);
      f.slowK = Math.max(slow?.k ?? 0, onIce ? 0.5 : 0);
      if (onIce && !this.iceReady.has(f)) { this.iceReady.set(f, this.time + 0.8); this.chill(f, 1); }
    }
    if (this.time < this.shellUntil) {
      this.w.heroTint(ICE, 0.22);
      const offsets = [[-0.4, 0], [0.4, 0], [0, -0.35], [0, 0.35]];
      this.shellBlocks.forEach((b, i) => b.p.copy(this.w.heroPos()).add(new Vector3(offsets[i][0], 0.9, offsets[i][1])));
    }
    this.blocks = this.blocks.filter(b => b.age < b.life);
  }
  reset() {
    for (const b of this.blocks) b.life = b.age;
    for (const f of this.w.foes()) { f.slowT = 0; f.slowK = 0; }
    this.blocks = []; this.shellBlocks = []; this.marks.clear(); this.dartSlows.clear(); this.iceReady.clear();
    this.orbs = []; this.strips = []; this.bursts = []; this.lastTile = null;
    this.time = 0; this.stepReady = 0; this.shellUntil = 0;
  }
}
