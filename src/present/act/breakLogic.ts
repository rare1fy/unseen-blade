/** A destructible object on the battle floor. */
export type BKind = 'pot' | 'crate' | 'hay' | 'oil' | 'pillar' | 'cover' | 'fence' | 'rack' | 'banner' | 'basket' | 'sack' | 'lamp';
/** The attack or environmental effect striking a prop. */
export type BSrc = 'hero' | 'dart' | 'slam' | 'blast' | 'fire';

/** The persistent state of one destructible prop. */
export interface BProp {
  id: number; kind: BKind; x: number; z: number; r: number; hp: number;
  state: 'idle' | 'fuse' | 'gone' | 'fallen'; fuse: number; fallDir: [number, number] | null;
}

/** A temporary burning area left by an exploded oil jar. */
export interface Fire { id: number; x: number; z: number; r: number; t: number; tick: number }

/** A prop change for the renderer or game loop to present. */
export type BEvent =
  | { k: 'hit'; p: BProp; dir: [number, number] }
  | { k: 'break'; p: BProp; dir: [number, number]; drop: { kind: 'coins' | 'heal'; n: number } | null }
  | { k: 'fuse'; p: BProp }
  | { k: 'boom'; p: BProp; x: number; z: number; r: number }
  | { k: 'topple'; p: BProp; dir: [number, number]; ax: number; az: number; bx: number; bz: number; w: number }
  | { k: 'fire'; f: Fire } | { k: 'fireEnd'; f: Fire };

/** A foe or hero that a prop effect can hurt. */
export interface BTarget { id: unknown; x: number; z: number; r: number; hero: boolean }
/** Damage credited to the hero from a prop effect. */
export interface BDamage { target: BTarget; dmg: number; fromX: number; fromZ: number; knock: number; down: number; cause: 'boom' | 'fire' | 'topple' }

/** First-pass sizes, damage, durations, and drop odds for battle props. */
// act-20 (user: 「场景中的东西尽量都能破坏才爽」): the cover pieces crumble too (to rubble that still stands in the way), and six more small
// things break: a fence length, a weapon rack, a 黄巾 banner, a basket, a grain sack, a lantern post (it drops its fire)
export const BTUNE = { radius: { pot: 0.32, crate: 0.4, hay: 0.55, oil: 0.38, pillar: 0.3, cover: 0.8, fence: 0.55, rack: 0.45, banner: 0.22, basket: 0.34, sack: 0.34, lamp: 0.22 },
  hp: { pot: 1, crate: 1, hay: 2, oil: 1, pillar: 3, cover: 7, fence: 2, rack: 2, banner: 1, basket: 1, sack: 1, lamp: 1 }, lampFireR: 1.0, lampFireT: 2.5, rubbleK: 0.6,
  fuse: 1.0, chainFuse: 0.25, boomR: 2.5, boomFoe: 30, boomHero: 12, boomKnock: 2.0, fireR: 1.6, fireT: 3, fireTick: 0.5, fireDmg: 3,
  toppleLen: 4, toppleW: 1.2, toppleFoe: 40, toppleHero: 10, toppleDown: 1.2, stumpR: 0.3,
  potCoinChance: 0.25, coinsMin: 3, coinsMax: 5, hayHealChance: 0.2, hayHeal: 5 };

type Result = { events: BEvent[]; damage: BDamage[] };

function direction(x: number, z: number): [number, number] {
  const length = Math.hypot(x, z);
  return length ? [x / length, z / length] : [0, -1];
}

function distanceToSegment(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az, length2 = dx * dx + dz * dz;
  const t = length2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / length2)) : 0;
  return Math.hypot(x - ax - t * dx, z - az - t * dz);
}

/** Pure battle-floor rules for breaking props, explosions, and fire. */
export class BreakLogic {
  props: BProp[] = [];
  fires: Fire[] = [];
  private nextPropId = 1;
  private nextFireId = 1;
  private rng: () => number;

  /** Use an injected random draw for deterministic drops. */
  constructor(rng: () => number = Math.random) { this.rng = rng; }

  /** Place a fresh prop with its tuned size and health. */
  add(kind: BKind, x: number, z: number, r?: number): BProp {
    const p: BProp = { id: this.nextPropId++, kind, x, z, r: r ?? BTUNE.radius[kind], hp: BTUNE.hp[kind], state: 'idle', fuse: 0, fallDir: null };
    this.props.push(p);
    return p;
  }

  /** Remove all props and fire patches and restart their ids. */
  clear(): void { this.props = []; this.fires = []; this.nextPropId = 1; this.nextFireId = 1; }

  /** 11-18: a fire patch set by something other than a jar (a foe's thrown oil, molten iron); burns like any other */
  ignite(x: number, z: number, r: number, t: number): Fire {
    const f: Fire = { id: this.nextFireId++, x, z, r, t, tick: BTUNE.fireTick }; this.fires.push(f); return f;
  }

  /** Find live props touching a circle, including fallen pillar stumps. */
  near(x: number, z: number, r: number): BProp[] {
    return this.props.filter(p => p.state !== 'gone' && Math.hypot(p.x - x, p.z - z) <= r + (p.state === 'fallen' ? (p.kind === 'cover' ? p.r * BTUNE.rubbleK : BTUNE.stumpR) : p.r));
  }

  /** Resolve one blow and any immediate topple effects. */
  hit(p: BProp, o: { src: BSrc; heavy?: boolean; dir: [number, number] }, targets: BTarget[] = []): Result {
    const result: Result = { events: [], damage: [] };
    this.resolveHit(p, o, targets, result);
    return result;
  }

  /** Advance existing fuses and fire patches and resolve their area effects. */
  update(dt: number, targets: BTarget[]): Result {
    const result: Result = { events: [], damage: [] };
    if (dt <= 0) return result;
    const lit = this.props.filter(p => p.state === 'fuse');
    const burning = [...this.fires];
    for (const p of lit) {
      p.fuse -= dt;
      if (p.fuse <= 0) this.explode(p, targets, result);
    }
    for (const f of burning) {
      const activeTime = Math.min(dt, f.t);
      f.t = Math.max(0, f.t - dt);
      f.tick -= activeTime;
      for (const p of this.props) {
        if (p.kind === 'oil' && p.state === 'idle' && Math.hypot(p.x - f.x, p.z - f.z) <= f.r + p.r) {
          this.resolveHit(p, { src: 'fire', dir: direction(p.x - f.x, p.z - f.z) }, targets, result);
        }
      }
      while (f.tick <= 1e-9) {
        for (const target of targets) {
          if (Math.hypot(target.x - f.x, target.z - f.z) <= f.r + target.r) {
            result.damage.push({ target, dmg: BTUNE.fireDmg, fromX: f.x, fromZ: f.z, knock: 0, down: 0, cause: 'fire' });
          }
        }
        f.tick += BTUNE.fireTick;
      }
      if (f.t === 0) {
        result.events.push({ k: 'fireEnd', f });
        this.fires.splice(this.fires.indexOf(f), 1);
      }
    }
    return result;
  }

  private resolveHit(p: BProp, o: { src: BSrc; heavy?: boolean; dir: [number, number] }, targets: BTarget[], result: Result): void {
    if (p.state !== 'idle') return;
    const dir = direction(...o.dir);
    if (p.kind === 'oil') {
      p.state = 'fuse'; p.fuse = o.src === 'blast' ? BTUNE.chainFuse : BTUNE.fuse;
      result.events.push({ k: 'fuse', p });
      return;
    }
    if ((p.kind === 'pillar' || p.kind === 'cover') && o.src === 'fire') return;
    const damage = p.kind === 'cover' ? (o.src === 'blast' ? 3 : o.heavy ? 2 : 1) : p.kind === 'pillar' && (o.heavy || o.src === 'blast') ? 2 : 1;
    const forceBreak = p.kind !== 'pillar' && p.kind !== 'cover' && (o.src === 'fire' || o.src === 'blast');
    p.hp = Math.max(0, p.hp - (forceBreak ? p.hp : damage));
    if (p.hp > 0) {
      result.events.push({ k: 'hit', p, dir });
      return;
    }
    // a cover piece crumbles to rubble: still there (smaller), no fall, no drop
    if (p.kind === 'cover') { p.state = 'fallen'; p.fallDir = dir; result.events.push({ k: 'break', p, dir, drop: null }); return; }
    if (p.kind === 'pillar') {
      p.state = 'fallen'; p.fallDir = dir;
      const ax = p.x, az = p.z, bx = ax + dir[0] * BTUNE.toppleLen, bz = az + dir[1] * BTUNE.toppleLen;
      result.events.push({ k: 'topple', p, dir, ax, az, bx, bz, w: BTUNE.toppleW });
      for (const target of targets) {
        if (distanceToSegment(target.x, target.z, ax, az, bx, bz) <= BTUNE.toppleW / 2 + target.r) {
          result.damage.push({ target, dmg: target.hero ? BTUNE.toppleHero : BTUNE.toppleFoe,
            fromX: ax, fromZ: az, knock: 0, down: target.hero ? 0 : BTUNE.toppleDown, cause: 'topple' });
        }
      }
      for (const other of this.props) {
        if (other !== p && other.state === 'idle' && distanceToSegment(other.x, other.z, ax, az, bx, bz) <= BTUNE.toppleW / 2 + other.r) {
          this.resolveHit(other, { src: 'blast', dir }, targets, result);
        }
      }
      return;
    }
    p.state = 'gone';
    let drop: { kind: 'coins' | 'heal'; n: number } | null = null;
    if (p.kind === 'pot' && this.rng() < BTUNE.potCoinChance) {
      drop = { kind: 'coins', n: BTUNE.coinsMin + Math.floor(this.rng() * (BTUNE.coinsMax - BTUNE.coinsMin + 1)) };
    } else if (p.kind === 'hay' && this.rng() < BTUNE.hayHealChance) {
      drop = { kind: 'heal', n: BTUNE.hayHeal };
    }
    result.events.push({ k: 'break', p, dir, drop });
    // a lantern post drops its fire where it stood
    if (p.kind === 'lamp') { const f: Fire = { id: this.nextFireId++, x: p.x + dir[0] * 0.6, z: p.z + dir[1] * 0.6, r: BTUNE.lampFireR, t: BTUNE.lampFireT, tick: BTUNE.fireTick }; this.fires.push(f); result.events.push({ k: 'fire', f }); }
  }

  private explode(p: BProp, targets: BTarget[], result: Result): void {
    if (p.state !== 'fuse') return;
    p.state = 'gone'; p.hp = 0; p.fuse = 0;
    result.events.push({ k: 'boom', p, x: p.x, z: p.z, r: BTUNE.boomR });
    for (const target of targets) {
      if (Math.hypot(target.x - p.x, target.z - p.z) <= BTUNE.boomR + target.r) {
        result.damage.push({ target, dmg: target.hero ? BTUNE.boomHero : BTUNE.boomFoe,
          fromX: p.x, fromZ: p.z, knock: BTUNE.boomKnock, down: 0, cause: 'boom' });
      }
    }
    for (const other of this.props) {
      if (other !== p && other.state === 'idle' && Math.hypot(other.x - p.x, other.z - p.z) <= BTUNE.boomR + other.r) {
        this.resolveHit(other, { src: 'blast', dir: direction(other.x - p.x, other.z - p.z) }, targets, result);
      }
    }
    const f: Fire = { id: this.nextFireId++, x: p.x, z: p.z, r: BTUNE.fireR, t: BTUNE.fireT, tick: BTUNE.fireTick };
    this.fires.push(f);
    result.events.push({ k: 'fire', f });
  }
}
